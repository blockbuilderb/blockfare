import * as THREE from '../../vendor/three.module.js';
import { BOT, FORMATION } from '../config.js?v=35';
import { tmpVec3 } from '../utils/VectorPool.js?v=35';
import { createSoldierMesh } from './SoldierMeshFactory.js?v=35';
import { SightlineMethods } from './SightlineSystem.js?v=35';
import { MedicAIMethods } from './MedicAI.js?v=35';
import { BotAIMethods } from './BotAI.js?v=35';

const BOT_NAMES_US = [
  'SgtOkiDoki', 'WakistanVet', 'VoxelMedic', 'EagleOne', 'BlockBuster',
  'DeltaSix', 'CplMiller', 'TacticalCube', 'Nomad_US', 'HammerTime',
  'Ranger_09', 'Foxhound', 'ViperActual', 'Ghost_US', 'GhostRecon9',
  'Maverick_7', 'IceMan_BB', 'Bullfrog', 'PhantomSix', 'ApexPredator',
  'SandbagKing', 'BravoLeader', 'IronSight', 'ZeroDark', 'TaskForce8',
  'CobaltBlue', 'ApachePilot', 'LibertyPrime', 'NightStalker', 'Patriot_01',
  'Kilo_Actual', 'Wraith_US', 'Warthog_04', 'BlueFalcons', 'RaptorSix',
  'Outlaw_11', 'Sentinel_BB', 'VectorNine', 'Striker_US', 'Paladin_07'
];

const BOT_NAMES_RU = [
  'Kapkan_RU', 'BlyatBit', 'Vostok_1', 'SpetsnazCube', 'UralBear',
  'Komarov', 'Tachanka_V', 'Sokol_7', 'RedOctober', 'Strelok',
  'Berkut_RU', 'Zarya', 'Artyom_2033', 'Volk_Actual', 'Buran_9',
  'Granit_RU', 'Kalash_AK', 'TaigaHunter', 'Kosmos_4', 'SiberianFox',
  'Molot_Vepr', 'Grom_Squad', 'Korsar_RU', 'Tunguska', 'Vympel_03',
  'AlphaGroup', 'Sever_12', 'Krechet', 'Zenit_SPB', 'Bagration',
  'Monolith_RU', 'Bogatyr', 'Iskander_9', 'Kamchatka', 'Grad_Leader',
  'Vikhr_02', 'Baikal_RU', 'Sapsan_BB', 'TaigaWolf', 'Varyag_01'
];

const CLASSES = ['MEDIC', 'ENGINEER', 'ASSAULT', 'MEDIC', 'ENGINEER', 'SUPPORT'];

const HELMET_COLOR_US = new THREE.Color(0x2980b9);
const HELMET_COLOR_RU = new THREE.Color(0xc0392b);

export const SQUAD_DEFS = [
  { id: 'ALPHA', short: 'ALP', specialty: 'ASSAULT & BREACH', defaultFlag: 2 },
  { id: 'BRAVO', short: 'BRV', specialty: 'ARMOR SQUAD (TANKS & IFVs)', defaultFlag: 0, isArmorSquad: true },
  { id: 'CHARLIE', short: 'CHR', specialty: 'ANTI-ARMOR AT', defaultFlag: 1 },
  { id: 'DELTA', short: 'DLT', specialty: 'TRAUMA MEDICS', defaultFlag: 3 },
  { id: 'ECHO', short: 'ECH', specialty: 'RECON & FLANK', defaultFlag: 4 }
];

export class BotManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.bots = [];
    this.hitMeshes = [];
    this.tracers = [];
    this.smokeClouds = [];
    this.baseState = {
      US: { contested: false, defenders: 0, attackers: 0, playerPresent: false },
      RU: { contested: false, defenders: 0, attackers: 0, playerPresent: false }
    };
    // Squad-style Chain of Command Orders (Commander -> Squad Leaders -> Squad Members)
    this.squadOrders = {
      US: {},
      RU: {}
    };
    this.commanderOrders = {
      US: null,
      RU: null
    };
    // Dynamic Formation Spacing Mode: 'STAY_CLOSE' (Numpad -) vs. 'FAN_OUT' (Numpad +)
    this.teamSpacingMode = {
      US: 'FAN_OUT',
      RU: 'FAN_OUT'
    };
    this.squadSpacingMode = {
      US: {},
      RU: {}
    };
    this.onBotComms = null;
    this.globalCommsCooldown = 0;
  }

  /**
   * Computes a soldier's Squad Anchor Offset (`totalOffX`, `totalOffZ`) and Intra-Squad Cluster
   * Offset (`clusterOffX`, `clusterOffZ`) based on their active Formation Spacing Mode:
   * - `'STAY_CLOSE'` (`Numpad -` / `Minus`):
   *   - Intra-squad members cluster tightly (`2.0m–3.8m` around their Squad Leader).
   *   - Squads stand close (`11m–19m` from Commander, `8m–14m` around Objective).
   *   - Friendly Armor & Cars escort closely (`30m–42m`).
   * - `'FAN_OUT'` (`Numpad +` / `Equal`):
   *   - Intra-squad members fan out (`6.5m–12.0m` around their Squad Leader) to survive HE/RPG blasts.
   *   - Squads stand dispersed (`25m–39m` from Commander, `16m–28m` around Objective).
   *   - Friendly Armor & Cars hold ~`100m` (`95m–105m`) long-range overwatch.
   */
  computeBotSpacingOffsets(b, spacingMode = 'FAN_OUT') {
    const isClose = spacingMode === 'STAY_CLOSE';
    const sqOrderIdx = Math.max(0, SQUAD_DEFS.findIndex((s) => s.id === b.squad));
    const sqSectorAngle = (sqOrderIdx * (Math.PI * 2)) / 5 + 0.35;
    const sqStandoffDist = isClose
      ? FORMATION.CLOSE_STANDOFF_BASE + sqOrderIdx * FORMATION.CLOSE_STANDOFF_STEP
      : FORMATION.FAN_STANDOFF_BASE + sqOrderIdx * FORMATION.FAN_STANDOFF_STEP;
    const objSqDist = isClose
      ? FORMATION.CLOSE_OBJ_BASE + sqOrderIdx * FORMATION.CLOSE_OBJ_STEP
      : FORMATION.FAN_OBJ_BASE + sqOrderIdx * FORMATION.FAN_OBJ_STEP;
    const memIdx = b.squadMemberIndex || 0;
    const memAngle = (memIdx * (Math.PI * 2)) / 8;
    const memRad =
      memIdx === 0
        ? 0
        : isClose
        ? FORMATION.CLOSE_CLUSTER_BASE + (memIdx % 2) * FORMATION.CLOSE_CLUSTER_ALT
        : FORMATION.FAN_CLUSTER_BASE + (memIdx % 2) * FORMATION.FAN_CLUSTER_ALT;
    const clusterOffX = Math.cos(memAngle) * memRad;
    const clusterOffZ = Math.sin(memAngle) * memRad;
    return {
      isClose,
      sqSectorAngle,
      sqStandoffDist,
      objSqDist,
      clusterOffX,
      clusterOffZ,
      totalOffX: Math.cos(sqSectorAngle) * sqStandoffDist + clusterOffX,
      totalOffZ: Math.sin(sqSectorAngle) * sqStandoffDist + clusterOffZ
    };
  }

  /**
   * Issues a Formation Spacing Command (`'STAY_CLOSE'` via `Numpad -` or `'FAN_OUT'` via `Numpad +`)
   * to either all 5 Squads (`scope: 'ALL'`) or the player's Squad (`scope: 'SQUAD'`).
   */
  issueFormationSpacing(player, opts = {}) {
    if (!player) return null;
    const team = opts.team || player.team || 'US';
    const scope = opts.scope || player.commandScope || (player.commandRank === 'COMMANDER' ? 'ALL' : 'SQUAD');
    const targetSquad = opts.targetSquad || player.squad || 'ALPHA';
    const spacingMode = opts.spacingMode === 'STAY_CLOSE' ? 'STAY_CLOSE' : 'FAN_OUT';

    if (scope === 'ALL') {
      this.teamSpacingMode[team] = spacingMode;
      for (const sq of SQUAD_DEFS) {
        this.squadSpacingMode[team][sq.id] = spacingMode;
      }
    } else {
      this.squadSpacingMode[team][targetSquad] = spacingMode;
    }

    const affectedBots = [];
    for (const b of this.bots) {
      if (b.team !== team) continue;
      if (scope !== 'ALL' && b.squad !== targetSquad) continue;
      b.spacingMode = spacingMode;
      const sp = this.computeBotSpacingOffsets(b, spacingMode);
      if (b.memberClusterOffset) {
        b.memberClusterOffset.set(sp.clusterOffX, 0, sp.clusterOffZ);
      }

      if (b.playerOrderTimer > 0 && b.playerOrderMode === 'FOLLOW') {
        b.waypointOffset.set(sp.totalOffX, 0, sp.totalOffZ);
      } else if (b.playerOrderTimer > 0 && b.playerOrderMode === 'HOLD') {
        const anchor = b.playerOrderPos || player.pos;
        const safeHold = this.world.pushOutOfBuildingFootprint(
          anchor.x + sp.totalOffX,
          anchor.z + sp.totalOffZ,
          2.2
        );
        b.waypointOffset.set(safeHold.x - anchor.x, 0, safeHold.z - anchor.z);
      } else {
        const fIdx =
          b.playerOrderTimer > 0 && b.playerOrderFlagIndex >= 0
            ? b.playerOrderFlagIndex
            : b.targetFlagIndex;
        const fPos = this.world.flags[fIdx] ? this.world.flags[fIdx].pos : player.pos;
        const rawOffX = Math.cos(sp.sqSectorAngle) * sp.objSqDist + sp.clusterOffX;
        const rawOffZ = Math.sin(sp.sqSectorAngle) * sp.objSqDist + sp.clusterOffZ;
        const safeGoal = this.world.pushOutOfBuildingFootprint(fPos.x + rawOffX, fPos.z + rawOffZ, 2.2);
        b.waypointOffset.set(safeGoal.x - fPos.x, 0, safeGoal.z - fPos.z);
      }

      if (!b.dead && !b.downed) {
        affectedBots.push(b);
      }
    }

    if (affectedBots.length > 0) {
      const speaker = affectedBots.find((b) => b.isSquadLeader) || affectedBots[0];
      const msg =
        spacingMode === 'STAY_CLOSE'
          ? scope === 'ALL'
            ? `${speaker.squad} SL copies Command! Tightening up — all squads staying close (11m–19m) & armor escorting at 35m!`
            : `Copy Squad Lead! ${targetSquad} Squad tightening up and staying close together!`
          : scope === 'ALL'
          ? `${speaker.squad} SL copies Command! Fanning out wide — squads dispersed at 25m–39m & armor at 100m overwatch!`
          : `Copy Squad Lead! ${targetSquad} Squad fanning out wide across cover!`;
      this.emitBotComms(
        speaker,
        player,
        msg,
        scope === 'ALL' ? 'COMMAND' : 'ORDER',
        true,
        scope === 'ALL' ? 'CMD NET' : 'SQUAD'
      );
    }

    if (this.onTelemetryEvent) {
      this.onTelemetryEvent('FORMATION_SPACING_CHANGED', {
        team,
        scope,
        targetSquad: scope === 'ALL' ? 'ALL_SQUADS' : targetSquad,
        spacingMode,
        unitsOrdered: affectedBots.length
      });
    }

    return {
      scope,
      targetSquad: scope === 'ALL' ? 'ALL 5 SQUADS' : `${targetSquad} SQUAD`,
      spacingMode,
      unitsOrdered: affectedBots.length
    };
  }

  /**
   * Issues a Squad-style Strategic Order as either:
   * - `scope: 'ALL'` (Force Commander — commands ALL 5 Squads / all 40 friendly NPCs on `player.team`!)
   * - `scope: 'SQUAD'` (Squad Leader — commands all 8 friendly NPCs in `targetSquad || player.squad`!)
   */
  issueStrategicOrder(player, opts = {}) {
    if (!player) return null;
    const team = opts.team || player.team || 'US';
    const scope = opts.scope || player.commandScope || (player.commandRank === 'COMMANDER' ? 'ALL' : 'SQUAD');
    const targetSquad = opts.targetSquad || player.squad || 'ALPHA';
    const action = (opts.action || 'OBJECTIVE').toUpperCase();
    let flagId = opts.flagId ? String(opts.flagId).toUpperCase() : null;

    let flagIndex = -1;
    if (action === 'OBJECTIVE') {
      if (flagId) {
        flagIndex = this.world.flags.findIndex((f) => f.id === flagId);
      }
      if (flagIndex < 0) {
        // Default to the nearest enemy/neutral objective (or nearest objective in player's look direction)
        flagIndex = this.pickBestLookOrFrontlineFlag(player);
        flagId = this.world.flags[flagIndex] ? this.world.flags[flagIndex].id : 'C';
      }
    }

    const duration = action === 'AUTO' ? 0 : 150;
    const orderRecord =
      action === 'AUTO'
        ? null
        : {
            scope,
            action,
            flagId,
            flagIndex,
            targetSquad: scope === 'ALL' ? 'ALL' : targetSquad,
            pos: player.pos.clone(),
            timer: duration,
            issuedAt: performance.now()
          };

    if (scope === 'ALL') {
      this.commanderOrders[team] = orderRecord;
      for (const sq of SQUAD_DEFS) {
        this.squadOrders[team][sq.id] = orderRecord ? { ...orderRecord, targetSquad: sq.id } : null;
      }
    } else {
      this.squadOrders[team][targetSquad] = orderRecord;
    }

    const affectedBots = [];
    for (const b of this.bots) {
      if (b.team !== team) continue;
      if (scope !== 'ALL' && b.squad !== targetSquad) continue;

      const activeSpacing =
        b.spacingMode ||
        (this.squadSpacingMode[team] && this.squadSpacingMode[team][b.squad]) ||
        this.teamSpacingMode[team] ||
        'FAN_OUT';
      b.spacingMode = activeSpacing;
      const sp = this.computeBotSpacingOffsets(b, activeSpacing);
      if (b.memberClusterOffset) {
        b.memberClusterOffset.set(sp.clusterOffX, 0, sp.clusterOffZ);
      }

      if (action === 'AUTO') {
        b.playerOrderMode = null;
        b.playerOrderTimer = 0;
        b.playerOrderFlagIndex = -1;
      } else if (action === 'OBJECTIVE' && flagIndex >= 0) {
        b.playerOrderMode = 'OBJECTIVE';
        b.playerOrderFlagIndex = flagIndex;
        b.targetFlagIndex = flagIndex;
        b.playerOrderTimer = duration;
        // Each Squad approaches/holds its own distinct sector around the objective using active spacing mode
        const rawOffX = Math.cos(sp.sqSectorAngle) * sp.objSqDist + sp.clusterOffX;
        const rawOffZ = Math.sin(sp.sqSectorAngle) * sp.objSqDist + sp.clusterOffZ;
        const fPos = this.world.flags[flagIndex].pos;
        const safeGoal = this.world.pushOutOfBuildingFootprint(fPos.x + rawOffX, fPos.z + rawOffZ, 2.2);
        b.waypointOffset.set(safeGoal.x - fPos.x, 0, safeGoal.z - fPos.z);
      } else if (action === 'FOLLOW') {
        b.playerOrderMode = 'FOLLOW';
        b.playerOrderFlagIndex = -1;
        b.playerOrderTimer = duration;
        b.waypointOffset.set(sp.totalOffX, 0, sp.totalOffZ);
      } else if (action === 'HOLD') {
        b.playerOrderMode = 'HOLD';
        b.playerOrderFlagIndex = -1;
        b.playerOrderPos.copy(player.pos);
        b.playerOrderTimer = duration;
        const holdX = player.pos.x + sp.totalOffX;
        const holdZ = player.pos.z + sp.totalOffZ;
        const safeHold = this.world.pushOutOfBuildingFootprint(holdX, holdZ, 2.2);
        b.waypointOffset.set(safeHold.x - player.pos.x, 0, safeHold.z - player.pos.z);
      }
      if (!b.dead && !b.downed) {
        affectedBots.push(b);
      }
    }

    // Authentic Squad Leader & Command Net Radio Acknowledgments
    if (affectedBots.length > 0 && action !== 'AUTO') {
      const flagObj = flagIndex >= 0 ? this.world.flags[flagIndex] : null;
      const isDefending = flagObj && flagObj.owner === team;
      const verb = isDefending ? 'defend' : 'capture';

      if (scope === 'ALL') {
        // Force Commander order: pick up to 2 Squad Leaders across different squads to reply on CMD NET
        const slBots = affectedBots.filter((b) => b.isSquadLeader);
        const primarySL = slBots[0] || affectedBots[0];
        const secondarySL = slBots[1] || affectedBots[Math.min(1, affectedBots.length - 1)];

        const msg1 =
          action === 'OBJECTIVE'
            ? `${primarySL.squad} SL copies Command! All ${affectedBots.length} troops moving to ${verb} Objective ${flagId}!`
            : action === 'FOLLOW'
              ? `${primarySL.squad} SL copies Command! All squads rallying on Commander's position!`
              : `${primarySL.squad} SL copies Command! All squads digging in to hold this sector!`;

        this.emitBotComms(primarySL, player, msg1, 'COMMAND', true, 'CMD NET');

        if (secondarySL && secondarySL !== primarySL && action === 'OBJECTIVE') {
          setTimeout(() => {
            if (!secondarySL.dead) {
              this.emitBotComms(
                secondarySL,
                player,
                `${secondarySL.squad} SL (${secondarySL.squadSpecialty}) rolling out to Objective ${flagId} now!`,
                'COMMAND',
                true,
                'CMD NET'
              );
            }
          }, 650);
        }
      } else {
        // Single-Squad Leader order: Squad Leader or Senior NCO replies on SQUAD radio
        const speaker = affectedBots.find((b) => b.isSquadLeader) || affectedBots[0];
        const msg =
          action === 'OBJECTIVE'
            ? `Copy Squad Lead! ${targetSquad} Squad (${affectedBots.length} strong) pushing to ${verb} Objective ${flagId}!`
            : action === 'FOLLOW'
              ? `Copy Squad Lead! ${targetSquad} Squad forming up on your six!`
              : `Solid copy Lead! ${targetSquad} Squad anchoring down to hold this position!`;
        this.emitBotComms(speaker, player, msg, 'ORDER', true, 'SQUAD');
      }
    }

    if (this.onTelemetryEvent) {
      this.onTelemetryEvent('STRATEGIC_ORDER_ISSUED', {
        team,
        rank: player.commandRank || 'COMMANDER',
        scope,
        targetSquad: scope === 'ALL' ? 'ALL_SQUADS' : targetSquad,
        action,
        flagId,
        unitsOrdered: affectedBots.length
      });
    }

    return {
      scope,
      targetSquad: scope === 'ALL' ? 'ALL SQUADS' : `${targetSquad} SQUAD`,
      action,
      flagId,
      unitsOrdered: affectedBots.length
    };
  }

  pickBestLookOrFrontlineFlag(player) {
    if (!this.world.flags || this.world.flags.length === 0) return 0;
    const fwdX = -Math.sin(player.yaw || 0);
    const fwdZ = -Math.cos(player.yaw || 0);
    let bestIdx = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < this.world.flags.length; i++) {
      const f = this.world.flags[i];
      const dx = f.pos.x - player.pos.x;
      const dz = f.pos.z - player.pos.z;
      const dist = Math.max(1, Math.hypot(dx, dz));
      const dot = (dx * fwdX + dz * fwdZ) / dist;
      const unownedBonus = f.owner !== player.team ? 0.55 : 0;
      const score = dot * 1.4 + unownedBonus - dist * 0.0015;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  getCompassDirection(dx, dz) {
    const angle = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
    const dirs = ['NORTH', 'NE', 'EAST', 'SE', 'SOUTH', 'SW', 'WEST', 'NW'];
    return dirs[Math.round(angle / 45) % 8];
  }

  emitBotComms(bot, player, text, category = 'TACTICAL', force = false, overrideChannel = null) {
    if (!bot || bot.dead) return;
    bot.speechBubbleText = text;
    bot.speechBubbleTimer = BOT.SPEECH_BUBBLE_TIMER;

    if (!player || bot.team !== player.team) return;
    const dist = Math.round(bot.pos.distanceTo(player.pos));
    const isNear = dist <= 45;
    const isSquad = bot.squad === player.squad;
    if (!force && !overrideChannel && !isNear && !isSquad) return;

    if (!force && this.globalCommsCooldown > 0) return;
    this.globalCommsCooldown = force ? BOT.COMMS_FORCE_COOLDOWN : BOT.COMMS_NORMAL_COOLDOWN;
    bot.chatCooldown = 7 + Math.random() * 10;

    const channel = overrideChannel || (isNear ? 'LOCAL' : 'SQUAD');
    if (this.onBotComms) {
      this.onBotComms(bot, text, channel, dist, category);
    }
  }

  handlePlayerCommsOrder(player, cmdId, text) {
    if (!player || player.dead) return;

    // Direct Squad / Commander Objective & Formation Orders from Commo Rose or Hotkeys
    if (cmdId === 'order_all_attack') {
      this.issueStrategicOrder(player, { scope: 'ALL', action: 'OBJECTIVE' });
      return;
    }
    if (cmdId === 'order_squad_attack') {
      this.issueStrategicOrder(player, { scope: 'SQUAD', action: 'OBJECTIVE' });
      return;
    }
    if (cmdId.startsWith('order_flag_')) {
      const fId = cmdId.replace('order_flag_', '').toUpperCase();
      this.issueStrategicOrder(player, {
        scope: player.commandScope || (player.commandRank === 'COMMANDER' ? 'ALL' : 'SQUAD'),
        action: 'OBJECTIVE',
        flagId: fId
      });
      return;
    }
    if (cmdId === 'go_go_go' || cmdId === 'follow_me') {
      const activeScope = player.commandScope || (player.commandRank === 'COMMANDER' ? 'ALL' : 'SQUAD');
      if (cmdId === 'go_go_go') {
        this.issueStrategicOrder(player, { scope: activeScope, action: 'OBJECTIVE' });
      } else {
        this.issueStrategicOrder(player, { scope: activeScope, action: 'FOLLOW' });
      }
      return;
    }
    if (cmdId === 'hold_position') {
      const activeScope = player.commandScope || (player.commandRank === 'COMMANDER' ? 'ALL' : 'SQUAD');
      this.issueStrategicOrder(player, { scope: activeScope, action: 'HOLD' });
      return;
    }

    const allies = this.bots
      .filter((b) => !b.dead && !b.downed && b.team === player.team)
      .map((b) => ({ bot: b, dist: b.pos.distanceTo(player.pos), inSquad: b.squad === player.squad }))
      .filter((item) => item.dist <= 55 || item.inSquad)
      .sort((a, b) => a.dist - b.dist);

    if (allies.length === 0) return;

    if (cmdId === 'need_medic') {
      const medicEntry = allies.find((a) => a.bot.role === 'MEDIC') || allies[0];
      const m = medicEntry.bot;
      m.playerOrderMode = 'FOLLOW';
      m.playerOrderTimer = 18;
      this.emitBotComms(
        m,
        player,
        m.role === 'MEDIC'
          ? 'Medic on the way! Keep your head down, patching you up!'
          : 'Got a spare bandage for you Lead, moving to your position!',
        'MEDIC',
        true
      );
    } else if (cmdId === 'need_ammo') {
      const supEntry = allies.find((a) => a.bot.role === 'SUPPORT') || allies[0];
      const s = supEntry.bot;
      s.playerOrderMode = 'FOLLOW';
      s.playerOrderTimer = 18;
      this.emitBotComms(
        s,
        player,
        s.role === 'SUPPORT'
          ? 'Support moving up! Dropping ammo crate & fresh mags on you!'
          : 'Tossing you spare magazines Lead, hold tight!',
        'SUPPLY',
        true
      );
    } else if (cmdId === 'go_go_go' || cmdId === 'follow_me') {
      const followers = allies.slice(0, 4);
      followers.forEach((f) => {
        f.bot.playerOrderMode = 'FOLLOW';
        f.bot.playerOrderTimer = 26;
      });
      const speaker = followers[0].bot;
      this.emitBotComms(speaker, player, 'Copy that Lead! Pushing forward on your six!', 'ORDER', true);
    } else if (cmdId === 'hold_position') {
      const holders = allies.slice(0, 4);
      holders.forEach((h) => {
        h.bot.playerOrderMode = 'HOLD';
        h.bot.playerOrderPos.copy(player.pos);
        h.bot.playerOrderTimer = 30;
      });
      const speaker = holders[0].bot;
      this.emitBotComms(speaker, player, 'Solid copy! Anchoring down and holding this sector!', 'ORDER', true);
    } else if (cmdId === 'enemy_vehicle') {
      const engEntry = allies.find((a) => a.bot.role === 'ENGINEER') || allies[0];
      this.emitBotComms(
        engEntry.bot,
        player,
        engEntry.bot.role === 'ENGINEER'
          ? 'Eyes on enemy armor! Loading RPG-7 HEAT rocket!'
          : 'Copy enemy vehicle! Seeking hard cover!',
        'COMBAT',
        true
      );
    } else if (cmdId.startsWith('contact_') || cmdId === 'ping') {
      const speaker = allies[0].bot;
      this.emitBotComms(speaker, player, 'Eyes on your mark! Suppressing hostile target!', 'COMBAT', true);
    } else if (cmdId === 'affirmative') {
      const speaker = allies[0].bot;
      this.emitBotComms(speaker, player, 'Roger that, Lead! With you all the way!', 'TACTICAL', true);
    } else if (cmdId === 'negative') {
      const speaker = allies[0].bot;
      this.emitBotComms(speaker, player, 'Understood Lead, holding off.', 'TACTICAL', true);
    }
  }

  notifyPlayerKill(player, victimName) {
    if (!player || player.dead) return;
    if (Math.random() > 0.55) return;
    let bestBot = null;
    let bestDist = 30;
    for (const b of this.bots) {
      if (b.dead || b.downed || b.team !== player.team) continue;
      const d = b.pos.distanceTo(player.pos);
      if (d < bestDist) {
        bestDist = d;
        bestBot = b;
      }
    }
    if (bestBot) {
      const lines = [
        `Nice shot Lead! ${victimName} is down!`,
        'Good kill! Keep the pressure on them!',
        'Target neutralized! Sector looking cleaner!',
        'Clean hit! Watching your flank, keep pushing!'
      ];
      const msg = lines[Math.floor(Math.random() * lines.length)];
      this.emitBotComms(bestBot, player, msg, 'MORALE', false);
    }
  }

  notifyWarCrime(player, medicName, wasRescuing = false, totalWarCrimes = 1) {
    if (!player || player.dead) return;
    let bestBot = null;
    let bestDist = 48;
    for (const b of this.bots) {
      if (b.dead || b.downed || b.team !== player.team) continue;
      const d = b.pos.distanceTo(player.pos);
      if (d < bestDist || b.squad === player.squad) {
        if (d < bestDist) {
          bestDist = d;
          bestBot = b;
        } else if (!bestBot) {
          bestBot = b;
        }
      }
    }
    if (bestBot) {
      const msg = wasRescuing
        ? `Whoa Lead! You just gunned down Medic ${medicName} mid-revive! That's War Crime #${totalWarCrimes}!`
        : `Cold blooded Lead, ${medicName} was a Field Medic! Geneva Tribunal logged War Crime #${totalWarCrimes}!`;
      this.emitBotComms(bestBot, player, msg, 'COMBAT', true);
    }
  }

  initBots(countPerTeam = 40) {
    this.currentBotsPerTeam = countPerTeam;
    for (let i = 0; i < countPerTeam; i++) {
      this.spawnBot('US', BOT_NAMES_US[i % BOT_NAMES_US.length], i);
      this.spawnBot('RU', BOT_NAMES_RU[i % BOT_NAMES_RU.length], i);
    }
  }

  setBotCountPerSide(countPerTeam = 40) {
    const cleanCount = Math.max(0, Math.min(40, Math.floor(countPerTeam)));
    if (this.currentBotsPerTeam === cleanCount && this.bots.length === cleanCount * 2) {
      return;
    }
    for (const b of this.bots) {
      if (b.drivingVehicle) {
        if (b.drivingVehicle.driver === b) b.drivingVehicle.driver = null;
        if (b.drivingVehicle.npcDriver === b) b.drivingVehicle.npcDriver = null;
        b.drivingVehicle = null;
      }
      if (b.mesh) {
        this.scene.remove(b.mesh);
      }
    }
    this.bots = [];
    this.hitMeshes = [];
    this.initBots(cleanCount);
  }

  spawnBot(team, name, index) {
    const squadDef = SQUAD_DEFS[Math.floor(index / 8) % SQUAD_DEFS.length];
    const squadMemberIndex = index % 8;
    // BRAVO is the dedicated Armor & Mechanized Crew Squad (crews & repairs Tanks, IFVs, and Tactical Cars)
    const role =
      squadDef.id === 'BRAVO' && squadMemberIndex < 6
        ? 'ENGINEER'
        : CLASSES[index % CLASSES.length];
    const commandRank =
      index === 0
        ? 'COMMANDER'
        : squadMemberIndex === 0
          ? 'SQUAD_LEADER'
          : squadMemberIndex === 1
            ? 'FIRETEAM_LEADER'
            : 'MEMBER';
    const isSquadLeader = squadMemberIndex === 0;
    const isCommander = index === 0;

    const mesh = createSoldierMesh(team, role, commandRank);
    const spawnInfo = this.pickSpawnPosition(team, squadDef.id, true);
    mesh.position.copy(spawnInfo.pos);
    this.scene.add(mesh);

    const TACTICS = ['ANCHOR_CROUCH', 'COVER_PEEK', 'ADVANCE_PAUSE', 'FLANK_RUSH', 'HOLD_STAND'];
    const initialYaw = team === 'US' ? Math.PI / 2 : -Math.PI / 2;
    const defaultFlagIdx = squadDef.defaultFlag % this.world.flags.length;
    const fPos = this.world.flags[defaultFlagIdx].pos;
    const sqOrderIdx = Math.max(0, SQUAD_DEFS.findIndex((s) => s.id === squadDef.id));
    const sqSectorAngle = (sqOrderIdx * (Math.PI * 2)) / 5 + 0.35;
    const memAngle = (squadMemberIndex * (Math.PI * 2)) / 8;
    const memRad = squadMemberIndex === 0 ? 0 : 3.2 + (squadMemberIndex % 2) * 2.8;
    const memberClusterOffset = new THREE.Vector3(
      Math.cos(memAngle) * memRad,
      0,
      Math.sin(memAngle) * memRad
    );
    const sqAnchorX = Math.cos(sqSectorAngle) * (14 + sqOrderIdx * 2.5) + memberClusterOffset.x;
    const sqAnchorZ = Math.sin(sqSectorAngle) * (14 + sqOrderIdx * 2.5) + memberClusterOffset.z;
    const safeOffset = this.world.pushOutOfBuildingFootprint(
      fPos.x + sqAnchorX,
      fPos.z + sqAnchorZ,
      2.2
    );

    const bot = {
      id: `${team}_bot_${index}`,
      name,
      team,
      role,
      commandRank,
      isSquadLeader,
      isCommander,
      squadMemberIndex,
      squad: squadDef.id,
      squadShort: squadDef.short,
      squadSpecialty: squadDef.specialty,
      tactic: TACTICS[index % TACTICS.length],
      pos: mesh.position,
      velX: 0,
      velZ: 0,
      velY: 0,
      isGrounded: true,
      yaw: initialYaw,
      moveYaw: initialYaw,
      aimPitch: 0,
      hp: BOT.HP,
      maxHp: BOT.MAX_HP,
      hasHelmet: true,
      armorHp: BOT.ARMOR_HP,
      dead: false,
      downed: false,
      bleedOutTimer: 0,
      spottedTimer: 0,
      inPlayerSquad: squadDef.id === 'ALPHA',
      respawnTimer: 0,
      kills: 0,
      deaths: 0,
      revives: 0,
      medicKills: 0,
      vehiclesDestroyed: 0,
      captures: 0,
      score: 0,
      lastSpawnSource: spawnInfo.source,
      drivingVehicle: null,
      mesh,
      targetFlagIndex: defaultFlagIdx,
      waypointOffset: new THREE.Vector3(safeOffset.x - fPos.x, 0, safeOffset.z - fPos.z),
      memberClusterOffset,
      spacingMode: 'FAN_OUT',
      shootCooldown: 0.25 + Math.random() * 0.6,
      rpgCooldown: 0.8 + Math.random() * 2.0,
      usingRpg: false,
      shotsFired: 0,
      burstCount: 0,
      rethinkTimer: 1 + Math.random() * 3,
      strafeDir: Math.random() < 0.5 ? 1 : -1,
      avoidanceSign: Math.random() < 0.5 ? 1 : -1,
      avoidanceTimer: 0,
      stuckTimer: 0,
      stuckCount: 0,
      lastProgressPos: spawnInfo.pos.clone(),
      tacticTimer: 1.5 + Math.random() * 2.5,
      tacticPhase: 0,
      isCrouching: false,
      crouchAmount: 0,
      leanDir: 0,
      leanAmount: 0,
      recoilKick: 0,
      muzzleFlashTimer: 0,
      flinchTimer: 0,
      animPhase: Math.random() * 10,
      // Realistic Physical State & Weapon-Ready Transitions (Stand-Up -> Unsling Weapon -> Shoulder Aim)
      postReviveTimer: 0,
      standUpProgress: 1.0,
      weaponReadyTimer: 0,
      aimRaiseProgress: 0.25,
      transitionState: 'ACTIVE',
      // Battlefield Rescue: Situation Assessment -> Smoke -> Drag-to-Cover -> Revive State
      rescueTarget: null,
      rescuer: null,
      rescueState: null, // 'ASSESS_THREAT' | 'APPROACH' | 'DRAG' | 'REVIVE'
      rescueTimer: 0,
      assessTimer: 0,
      smokePoppedForRescue: false,
      assessedLogged: false,
      assessThreatEnemy: null,
      dragGoalPos: new THREE.Vector3(),
      // Suppression system (Squad-style)
      suppressionLevel: 0,
      // Proximity & Squad Comms + Player / Commander Order State
      speechBubbleText: '',
      speechBubbleTimer: 0,
      chatCooldown: 2.5 + Math.random() * 9.0,
      playerOrderMode: null,
      playerOrderFlagIndex: -1,
      playerOrderTimer: 0,
      playerOrderPos: new THREE.Vector3()
    };

    mesh.traverse((child) => {
      if (child.isMesh && child.name !== 'teamMarker') {
        child.userData.bot = bot;
        this.hitMeshes.push(child);
      }
    });

    this.bots.push(bot);
  }

  /**
   * Contested Base Rule (Main Bases & Forward Flags):
   * A base owned by `ownerTeam` becomes CONTESTED (`contested = true`) once ALL defending
   * enemies at that base are eliminated (`defenders === 0`) AND the Player (or attacking forces)
   * is physically inside that base perimeter (`attackers > 0`).
   * While a base is contested, enemies are LOCKED OUT from respawning there!
   */
  updateContestedBases(player, onAwardXp = null) {
    const MAIN_BASE_RADIUS = BOT.MAIN_BASE_RADIUS;
    const FLAG_CONTEST_RADIUS = BOT.FLAG_CONTEST_RADIUS;

    // 1. Evaluate US_BASE and RU_BASE Main Base Perimeters
    for (const baseTeam of ['US', 'RU']) {
      const basePos = baseTeam === 'US' ? this.world.spawns.US_BASE : this.world.spawns.RU_BASE;
      let defenders = 0;
      let attackers = 0;
      let playerPresent = false;

      if (!player.dead && !player.downed) {
        const dPlayer = Math.hypot(player.pos.x - basePos.x, player.pos.z - basePos.z);
        if (dPlayer <= MAIN_BASE_RADIUS) {
          if (player.team === baseTeam) {
            defenders++;
          } else {
            attackers++;
            playerPresent = true;
          }
        }
      }

      for (let i = 0; i < this.bots.length; i++) {
        const b = this.bots[i];
        if (b.dead || b.downed) continue;
        const d = Math.hypot(b.pos.x - basePos.x, b.pos.z - basePos.z);
        if (d <= MAIN_BASE_RADIUS) {
          if (b.team === baseTeam) defenders++;
          else attackers++;
        }
      }

      const prevContested = this.baseState[baseTeam].contested;
      // Contested once all defenders at the base are eliminated AND player/attackers are there!
      const isNowContested = defenders === 0 && attackers > 0;
      this.baseState[baseTeam].contested = isNowContested;
      this.baseState[baseTeam].defenders = defenders;
      this.baseState[baseTeam].attackers = attackers;
      this.baseState[baseTeam].playerPresent = playerPresent;

      if (!prevContested && isNowContested) {
        if (playerPresent && onAwardXp) {
          onAwardXp(200, `${baseTeam} MAIN BASE CONTESTED — ENEMY RESPAWN LOCKED!`);
        }
        if (this.onTelemetryEvent) {
          this.onTelemetryEvent('BASE_CONTESTED_LOCKOUT', {
            base: `${baseTeam}_MAIN_BASE`,
            owner: baseTeam,
            defendersRemaining: 0,
            attackersPresent: attackers,
            playerPresent
          });
        }
      }
    }

    // 2. Evaluate Forward Bases (Flags A - E)
    for (const flag of this.world.flags) {
      if (flag.owner === 'NEUTRAL') {
        flag.contested = false;
        flag.defendersCount = 0;
        flag.attackersCount = 0;
        flag.playerPresent = false;
        continue;
      }

      let defenders = 0;
      let attackers = 0;
      let playerPresent = false;

      if (!player.dead && !player.downed) {
        const dPlayer = Math.hypot(player.pos.x - flag.pos.x, player.pos.z - flag.pos.z);
        if (dPlayer <= FLAG_CONTEST_RADIUS) {
          if (player.team === flag.owner) {
            defenders++;
          } else {
            attackers++;
            playerPresent = true;
          }
        }
      }

      for (let i = 0; i < this.bots.length; i++) {
        const b = this.bots[i];
        if (b.dead || b.downed) continue;
        const d = Math.hypot(b.pos.x - flag.pos.x, b.pos.z - flag.pos.z);
        if (d <= FLAG_CONTEST_RADIUS) {
          if (b.team === flag.owner) defenders++;
          else attackers++;
        }
      }

      const prevContested = Boolean(flag.contested);
      const isNowContested = defenders === 0 && attackers > 0;
      flag.contested = isNowContested;
      flag.defendersCount = defenders;
      flag.attackersCount = attackers;
      flag.playerPresent = playerPresent;

      if (!prevContested && isNowContested) {
        if (playerPresent && onAwardXp) {
          onAwardXp(100, `OBJ ${flag.id} CONTESTED — ENEMY SPAWN LOCKED!`);
        }
        if (this.onTelemetryEvent) {
          this.onTelemetryEvent('BASE_CONTESTED_LOCKOUT', {
            base: `FORWARD_FLAG_${flag.id}`,
            owner: flag.owner,
            defendersRemaining: 0,
            attackersPresent: attackers,
            playerPresent
          });
        }
      }
    }
  }

  /**
   * Returns true if `team` has at least one uncontested spawn base (either their Main Base
   * or an occupied Forward Flag that is not currently contested/overrun).
   */
  canTeamRespawn(team) {
    const mainBaseAvailable = !(this.baseState && this.baseState[team] && this.baseState[team].contested);
    if (mainBaseAvailable) return true;
    const uncontestedFlags = this.world.flags.filter((f) => f.owner === team && !f.contested);
    return uncontestedFlags.length > 0;
  }

  /**
   * Strict BattleBit / Squad Respawn Rule + Contested Base Lockout:
   * NPCs from both sides ONLY spawn at their faction's UNCONTESTED Main Base (US_BASE / RU_BASE)
   * OR at UNCONTESTED Occupied Forward Bases (flags where f.owner === team && !f.contested).
   * Once all defenders at a base are eliminated and the player/attackers are there,
   * that base is CONTESTED and enemies are blocked from spawning there!
   */
  pickSpawnPosition(team, squad = 'ALPHA', returnMeta = false) {
    const allOwnedFlags = this.world.flags.filter((f) => f.owner === team);
    const uncontestedFlags = allOwnedFlags.filter((f) => !f.contested);
    const mainBaseContested = Boolean(
      this.baseState && this.baseState[team] && this.baseState[team].contested
    );
    const mainBase = team === 'US' ? this.world.spawns.US_BASE : this.world.spawns.RU_BASE;

    // Determine whether this unit should spawn at Main Base or an uncontested Forward Flag
    let spawnAtMainBase =
      squad === 'BRAVO' || uncontestedFlags.length === 0 || Math.random() < 0.3;

    if (mainBaseContested && uncontestedFlags.length > 0) {
      // Main Base is CONTESTED/OVERRUN! Redirect spawn to an uncontested Forward Base!
      spawnAtMainBase = false;
      if (this.onTelemetryEvent) {
        this.onTelemetryEvent('CONTESTED_SPAWN_BLOCKED', {
          team,
          squad,
          blockedBase: `${team}_MAIN_BASE`,
          redirectedTo: 'UNCONTESTED_FORWARD_FLAG'
        });
      }
    } else if (!spawnAtMainBase && allOwnedFlags.length > uncontestedFlags.length) {
      // At least one owned Forward Flag is contested and excluded from spawn candidates
      if (this.onTelemetryEvent) {
        this.onTelemetryEvent('CONTESTED_SPAWN_BLOCKED', {
          team,
          squad,
          blockedBase: 'CONTESTED_FORWARD_FLAG',
          redirectedTo: spawnAtMainBase ? 'MAIN_BASE' : 'UNCONTESTED_FORWARD_FLAG'
        });
      }
    }

    let sx;
    let sz;
    let source;

    if (spawnAtMainBase) {
      // Spawn near the Main Base Motor Pool apron (x ≈ -288 for US, x ≈ +288 for RU)
      const motorPoolX = team === 'US' ? -292 : 292;
      sx = motorPoolX + (Math.random() - 0.5) * 18;
      sz = mainBase.z + (Math.random() - 0.5) * 32;
      source = 'MAIN_BASE';
    } else {
      const f = uncontestedFlags[Math.floor(Math.random() * uncontestedFlags.length)];
      const angle = Math.random() * Math.PI * 2;
      const dist = 6 + Math.random() * 12;
      sx = f.pos.x + Math.cos(angle) * dist;
      sz = f.pos.z + Math.sin(angle) * dist;
      source = `FORWARD_FLAG_${f.id}`;
    }

    const pos = this.world.findSafeSpawnPoint(sx, sz);
    if (this.onTelemetryEvent) {
      this.onTelemetryEvent('NPC_SPAWN', {
        team,
        squad,
        source,
        x: Math.round(pos.x),
        z: Math.round(pos.z),
        ownedFlags: uncontestedFlags.map((fl) => fl.id),
        mainBaseContested
      });
    }
    return returnMeta ? { pos, source } : pos;
  }

  damageBot(bot, amount, attackerName, attackerTeam, weaponName, isHeadshot, onKillFn, onAwardXp = null) {
    if (bot.dead || bot.downed) return { killed: false, hitType: 'normal' };

    let hitType = isHeadshot ? 'headshot' : 'normal';
    bot.flinchTimer = 0.22;

    if (Math.random() < 0.45) {
      bot.isCrouching = true;
    }

    if (isHeadshot && bot.hasHelmet) {
      bot.hasHelmet = false;
      bot.mesh.userData.parts.helmet.visible = false;
      const helmColor = bot.team === 'US' ? HELMET_COLOR_US : HELMET_COLOR_RU;
      this.world.spawnDebris(tmpVec3(bot.pos.x, bot.pos.y + 1.85, bot.pos.z), helmColor, 2);
      amount = Math.round(amount * 0.48);
      hitType = 'armor';
      if (onAwardXp) onAwardXp(25, 'HELMET KNOCKED OFF');
    } else if (!isHeadshot && bot.armorHp > 0) {
      const absorbed = Math.min(bot.armorHp, Math.round(amount * 0.35));
      bot.armorHp -= absorbed;
      amount -= absorbed;
      hitType = 'armor';
    }

    bot.hp -= amount;
    if (bot.hp <= 0) {
      const wasRescuing = Boolean(bot.rescueTarget || bot.rescueState);
      const isMedicVictim = bot.role === 'MEDIC';
      bot.hp = 0;
      bot.deaths++;
      this.clearBotRescueLinks(bot);
      bot.downed = true;
      bot.bleedOutTimer = BOT.BLEEDOUT_TIMER;
      bot.spottedTimer = 0;
      bot.velX = 0;
      bot.velZ = 0;
      bot.mesh.rotation.x = -Math.PI / 2;
      if (onKillFn) {
        onKillFn(attackerName, attackerTeam, bot.name, bot.team, weaponName, isHeadshot);
      }
      return {
        killed: true,
        hitType: isHeadshot ? 'headshot' : hitType,
        isMedicVictim,
        wasRescuing
      };
    }
    return { killed: false, hitType };
  }
}

// Attach modular Sightline, MedicAI, and BotAI methods directly to BotManager.prototype
// so 100% of existing public and internal methods remain accessible on BotManager instances.
Object.assign(BotManager.prototype, SightlineMethods, MedicAIMethods, BotAIMethods);
