import * as THREE from '../../vendor/three.module.js';
import { BOT, FORMATION } from '../config.js?v=105';
import { sound } from '../audio.js?v=105';
import { tmpVec3 } from '../utils/VectorPool.js?v=105';
import { SpatialGrid2D } from '../utils/SpatialGrid2D.js?v=105';
import { events, makeEventBridge } from '../events.js?v=105';
import { createSoldierMesh } from './SoldierMeshFactory.js?v=105';
import { SightlineMethods } from './SightlineSystem.js?v=105';
import { MedicAIMethods } from './MedicAI.js?v=105';
import { BotAIMethods } from './BotAI.js?v=105';
import {
  createBaseProtectionFSM,
  syncBaseProtectionFSM
} from '../core/StateMachines.js?v=105';

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
  { id: 'ALPHA', short: 'ALP', branch: 'LAND', specialty: 'LAND ASSAULT & BREACH', defaultFlag: 2 },
  { id: 'BRAVO', short: 'BRV', branch: 'ARMOR', specialty: 'HEAVY ARMOR SQUAD (TANKS & IFVs)', defaultFlag: 0, isArmorSquad: true },
  { id: 'CHARLIE', short: 'CHR', branch: 'LAND', specialty: 'LAND ANTI-ARMOR & SAPPER', defaultFlag: 1 },
  { id: 'DELTA', short: 'DLT', branch: 'LAND', specialty: 'LAND MEDICAL & LOGISTICS', defaultFlag: 3 },
  { id: 'ECHO', short: 'ECH', branch: 'LAND', specialty: 'LAND RECON & PATHFINDER', defaultFlag: 4 },
  { id: 'FALCON', short: 'FLC', branch: 'AIR', specialty: 'AIR WING SQUAD (JETS & GUNSHIPS)', defaultFlag: 2, isAirSquad: true }
];

export class BotManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.bots = [];
    this.hitMeshes = [];
    this.squadLeaders = { US: {}, RU: {} };
    this.downedByTeam = { US: [], RU: [] };
    this.aliveByTeam = { US: [], RU: [] };
    this.spatialGrid = new SpatialGrid2D(-2912, 2912, -1920, 1920, 32, 450);
    this.teamGrid = {
      US: new SpatialGrid2D(-2912, 2912, -1920, 1920, 32, 240),
      RU: new SpatialGrid2D(-2912, 2912, -1920, 1920, 32, 240)
    };
    this.tracers = [];
    this._tracerPool = [];
    this.smokeClouds = [];
    this._contestedTimer = 0;
    this.baseState = {
      US: { contested: false, defenders: 0, attackers: 0, playerPresent: false },
      RU: { contested: false, defenders: 0, attackers: 0, playerPresent: false }
    };
    createBaseProtectionFSM(this.baseState.US, 'US');
    createBaseProtectionFSM(this.baseState.RU, 'RU');
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
    // Forward Base Garrison Doctrine: Leaves 1 dedicated squad at each captured Forward Base as entrenched defense
    this.garrisonDoctrineEnabled = {
      US: true,
      RU: true
    };
    this.squadGarrisonFlagIndex = {
      US: {},
      RU: {}
    };
    this.flagGarrisonSquad = {
      US: {},
      RU: {}
    };
    this._garrisonAlertCooldown = {
      US: 0,
      RU: 0
    };
    this.onBotComms = makeEventBridge(
      'bot:comms',
      (bot, text, channel, dist, category) => ({ bot, text, channel, dist, category })
    );
    this.onTelemetryEvent = makeEventBridge('telemetry:event', (type, payload) => ({
      type,
      payload
    }));
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
    const sqSectorAngle = (sqOrderIdx * (Math.PI * 2)) / SQUAD_DEFS.length + 0.35;
    const sqStandoffDist = isClose
      ? FORMATION.CLOSE_STANDOFF_BASE + sqOrderIdx * FORMATION.CLOSE_STANDOFF_STEP
      : FORMATION.FAN_STANDOFF_BASE + sqOrderIdx * FORMATION.FAN_STANDOFF_STEP;
    const objSqDist = isClose
      ? FORMATION.CLOSE_OBJ_BASE + sqOrderIdx * FORMATION.CLOSE_OBJ_STEP
      : FORMATION.FAN_OBJ_BASE + sqOrderIdx * FORMATION.FAN_OBJ_STEP;
    const memIdx = b.squadMemberIndex || 0;

    // ─── MOUNT & BLADE BATTLE LINE ARRAY (MEDIEVAL ERA) ──────────────────────────
    // In the Medieval Era, squads form an authentic Mount & Blade Multi-Rank Battle Array
    // facing the enemy front (US faces +X East, RU faces -X West):
    // - Front Rank (Rank 1 — Shield Wall / Melee Infantry): SWORDSMAN, POLEARM_KNIGHT, GREATSWORD_KNIGHT
    // - Rear Rank (Rank 2 — Loose Archer & Crossbow Line): ARCHER, CROSSBOWMAN positioned 5.2m behind Rank 1
    // - Outer Wings (Cavalry Flank): MOUNTED_KNIGHT positioned on the outer lateral wings
    const isMedieval = (this.world?.era || b.era) === 'medieval' && !b.isDinosaur;
    if (isMedieval) {
      const enemyDirX = b.team === 'US' ? 1 : -1;
      const isRanged = b.role === 'ARCHER' || b.role === 'CROSSBOWMAN';
      const isCav = b.role === 'MOUNTED_KNIGHT';
      const lateralStep = isClose ? 1.65 : 2.85;
      // Map member index to a symmetric file slot around the Squad Leader (0, +1, -1, +2, -2, ...)
      const fileRankIdx = Math.floor((memIdx + 1) / 2) * (memIdx % 2 === 1 ? 1 : -1);
      const subRankDepth = Math.floor(memIdx / 9) * (isClose ? 1.8 : 2.6);
      // Rank 1 (Melee Shield Wall) stands forward (+2.4m); Rank 2 (Archers/Crossbows) stands 5.2m behind (-2.8m)
      const roleDepthOffset = isRanged
        ? -(isClose ? 2.6 : 4.2) - subRankDepth
        : isCav
        ? -1.2 - subRankDepth
        : (isClose ? 2.2 : 3.2) - subRankDepth * 0.7;
      const clusterOffX = enemyDirX * roleDepthOffset;
      const clusterOffZ =
        fileRankIdx * lateralStep * (isRanged ? 1.25 : 1.0) +
        (isCav ? (fileRankIdx >= 0 ? 1 : -1) * (isClose ? 5.5 : 8.5) : 0);

      // Squads deploy abreast in 6 distinct battle-line companies across the front (plus echelon depth)
      const sqLineSlot = [0, -1, 1, -2, 2, -3][sqOrderIdx % SQUAD_DEFS.length] || 0;
      const sqLineLateralZ = sqLineSlot * (isClose ? 13.5 : 22.0);
      const sqEchelonX = -enemyDirX * (Math.abs(sqLineSlot) * (isClose ? 2.5 : 4.5));

      return {
        isClose,
        sqSectorAngle,
        sqStandoffDist,
        objSqDist,
        clusterOffX,
        clusterOffZ,
        totalOffX: sqEchelonX + clusterOffX,
        totalOffZ: sqLineLateralZ + clusterOffZ
      };
    }

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

  getEffectiveSpacingMode(team = 'US', squadId = null) {
    if (squadId && this.squadSpacingMode?.[team]?.[squadId]) {
      return this.squadSpacingMode[team][squadId];
    }
    return this.teamSpacingMode?.[team] || 'FAN_OUT';
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
      targetSquad: scope === 'ALL' ? 'ALL 6 SQUADS' : `${targetSquad} SQUAD`,
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
    const isMedievalEra = (this.world?.era || 'modern') === 'medieval';
    if (action === 'OBJECTIVE' || action === 'CHARGE' || action === 'ATTACK') {
      if (flagId) {
        flagIndex = this.world.flags.findIndex((f) => f.id === flagId);
      }
      if (flagIndex < 0) {
        // Default to the nearest enemy/neutral objective (or nearest objective in player's look direction)
        flagIndex = this.pickBestLookOrFrontlineFlag(player);
        flagId = this.world.flags[flagIndex] ? this.world.flags[flagIndex].id : 'C';
      }
    } else if (action === 'RETREAT') {
      // Pick the nearest friendly-owned rear flag (or fallback to friendly Main Base keep)
      let bestRearIdx = -1;
      let bestRearScore = -Infinity;
      for (let i = 0; i < this.world.flags.length; i++) {
        const f = this.world.flags[i];
        if (f.owner === team) {
          const rearBias = team === 'US' ? -f.pos.x : f.pos.x;
          const distPenalty = Math.hypot(f.pos.x - player.pos.x, f.pos.z - player.pos.z) * 0.25;
          const score = rearBias - distPenalty;
          if (score > bestRearScore) {
            bestRearScore = score;
            bestRearIdx = i;
          }
        }
      }
      flagIndex = bestRearIdx;
      flagId = bestRearIdx >= 0 && this.world.flags[bestRearIdx] ? this.world.flags[bestRearIdx].id : 'KEEP';
    }

    // Play Mount & Blade War Horn & Soldier Chorus in Medieval Era when issuing tactical commands!
    if (isMedievalEra && action !== 'AUTO' && action !== 'GARRISON' && action !== 'GARRISON_TOGGLE') {
      if (action === 'CHARGE' || action === 'ATTACK' || action === 'OBJECTIVE') {
        sound.playMedievalWarHorn?.('charge');
      } else if (action === 'HOLD' || action === 'DEFEND') {
        sound.playMedievalWarHorn?.('defend');
      } else if (action === 'RETREAT') {
        sound.playMedievalWarHorn?.('retreat');
      }
    }

    if (action === 'GARRISON' || action === 'GARRISON_TOGGLE') {
      const nextState =
        typeof opts.enabled === 'boolean' ? opts.enabled : !this.garrisonDoctrineEnabled[team];
      this.garrisonDoctrineEnabled[team] = nextState;
      if (nextState) {
        // Clear any ALL-squad blanket attack override so 1 squad per captured forward base immediately garrisons!
        this.commanderOrders[team] = null;
        for (const sq of SQUAD_DEFS) {
          this.squadOrders[team][sq.id] = null;
        }
        for (const b of this.bots) {
          if (b.team === team) {
            b.playerOrderMode = null;
            b.playerOrderTimer = 0;
            b.playerOrderFlagIndex = -1;
          }
        }
      }
      this.updateForwardBaseGarrisons(player);
      const garrisonedFlags = Object.entries(this.flagGarrisonSquad[team] || {})
        .map(([fid, sqId]) => `OBJ ${fid} (${sqId})`)
        .join(', ');
      const unitsCount = nextState
        ? this.bots.filter((b) => !b.dead && b.team === team && b.isGarrisonDefender).length
        : this.bots.filter((b) => !b.dead && b.team === team).length;
      const slSpeaker =
        this.bots.find((b) => !b.dead && b.team === team && b.isSquadLeader && b.isGarrisonDefender) ||
        this.bots.find((b) => !b.dead && b.team === team && b.isSquadLeader);
      if (slSpeaker) {
        this.emitBotComms(
          slSpeaker,
          player,
          nextState
            ? garrisonedFlags
              ? `${slSpeaker.squad} SL copies Command! Garrison Defense Doctrine ON — 1 squad entrenched at each captured Forward Base (${garrisonedFlags})!`
              : `${slSpeaker.squad} SL copies Command! Garrison Defense Doctrine ON — 1 squad will stay to defend each Forward Base we capture!`
            : `${slSpeaker.squad} SL copies Command! Garrison Defense Doctrine OFF — all garrison squads released to push the frontline assault!`,
          'COMMAND',
          true,
          'CMD NET'
        );
      }
      return {
        scope: 'ALL',
        targetSquad: 'ALL SQUADS',
        action: 'GARRISON',
        garrisonEnabled: nextState,
        garrisonSummary: nextState ? garrisonedFlags || '1 SQUAD PER CAPTURED BASE' : '',
        unitsOrdered: unitsCount
      };
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
        b.tacticalPosture = null;
        b.inShieldWall = false;
        b.playerOrderTimer = 0;
        b.playerOrderFlagIndex = -1;
      } else if (action === 'CHARGE' || action === 'ATTACK') {
        b.playerOrderMode = 'CHARGE';
        b.tacticalPosture = 'CHARGE';
        b.inShieldWall = false;
        b.playerOrderFlagIndex = flagIndex;
        if (flagIndex >= 0) b.targetFlagIndex = flagIndex;
        b.playerOrderTimer = duration;
        const fPos = flagIndex >= 0 && this.world.flags[flagIndex] ? this.world.flags[flagIndex].pos : player.pos;
        const rawOffX = Math.cos(sp.sqSectorAngle) * (sp.objSqDist * 0.55) + sp.clusterOffX;
        const rawOffZ = Math.sin(sp.sqSectorAngle) * (sp.objSqDist * 0.55) + sp.clusterOffZ;
        const safeGoal = this.world.pushOutOfBuildingFootprint(fPos.x + rawOffX, fPos.z + rawOffZ, 2.2);
        b.waypointOffset.set(safeGoal.x - fPos.x, 0, safeGoal.z - fPos.z);
      } else if (action === 'OBJECTIVE' && flagIndex >= 0) {
        b.playerOrderMode = 'OBJECTIVE';
        b.tacticalPosture = 'ATTACK';
        b.inShieldWall = false;
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
        b.tacticalPosture = 'FOLLOW';
        b.inShieldWall = false;
        b.playerOrderFlagIndex = -1;
        b.playerOrderTimer = duration;
        b.waypointOffset.set(sp.totalOffX, 0, sp.totalOffZ);
      } else if (action === 'HOLD' || action === 'DEFEND') {
        b.playerOrderMode = 'HOLD';
        b.tacticalPosture = 'DEFEND';
        b.inShieldWall = isMedievalEra;
        b.playerOrderFlagIndex = -1;
        b.playerOrderPos.copy(player.pos);
        b.playerOrderTimer = duration;
        // In Medieval Era, HOLD/DEFEND forms a Mount & Blade locked Shield Wall line facing the enemy front!
        let holdX = player.pos.x + sp.totalOffX;
        let holdZ = player.pos.z + sp.totalOffZ;
        if (isMedievalEra) {
          const fwdX = -Math.sin(player.yaw || 0);
          const fwdZ = -Math.cos(player.yaw || 0);
          const rightX = Math.cos(player.yaw || 0);
          const rightZ = -Math.sin(player.yaw || 0);
          const memIdx = b.squadMemberIndex || 0;
          const sqIdx = Math.max(0, SQUAD_DEFS.findIndex((s) => s.id === b.squad));
          const rankDepth = 3.5 + sqIdx * 2.2 + (memIdx % 2) * 1.35;
          const lateralSlot = ((memIdx - 3.5) * 1.45);
          holdX = player.pos.x + fwdX * rankDepth + rightX * lateralSlot;
          holdZ = player.pos.z + fwdZ * rankDepth + rightZ * lateralSlot;
        }
        const safeHold = this.world.pushOutOfBuildingFootprint(holdX, holdZ, 2.2);
        b.waypointOffset.set(safeHold.x - player.pos.x, 0, safeHold.z - player.pos.z);
      } else if (action === 'RETREAT') {
        b.playerOrderMode = 'RETREAT';
        b.tacticalPosture = 'RETREAT';
        b.inShieldWall = false;
        b.playerOrderFlagIndex = flagIndex;
        if (flagIndex >= 0) b.targetFlagIndex = flagIndex;
        const baseFallback =
          team === 'US' ? this.world.spawns.US_BASE : this.world.spawns.RU_BASE;
        const retreatAnchor =
          flagIndex >= 0 && this.world.flags[flagIndex]
            ? this.world.flags[flagIndex].pos
            : baseFallback;
        b.playerOrderPos.copy(retreatAnchor);
        b.playerOrderTimer = duration;
        const safeRetreat = this.world.pushOutOfBuildingFootprint(
          retreatAnchor.x + sp.clusterOffX * 1.5,
          retreatAnchor.z + sp.clusterOffZ * 1.5,
          2.2
        );
        b.waypointOffset.set(
          safeRetreat.x - retreatAnchor.x,
          0,
          safeRetreat.z - retreatAnchor.z
        );
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
          action === 'CHARGE' || action === 'ATTACK'
            ? isMedievalEra
              ? `⚔️ ${primarySL.squad} Banneret: "HAAARGH! FOR THE REALM — ALL ${affectedBots.length} MEN CHARGE OBJECTIVE ${flagId}! BREAK THEIR LINES!"`
              : `${primarySL.squad} SL copies Command! All ${affectedBots.length} troops charging full-speed into Objective ${flagId}!`
            : action === 'RETREAT'
            ? isMedievalEra
              ? `🏳️ ${primarySL.squad} Banneret: "SOUND THE HORN! FALL BACK IN ORDER TO ${flagId} — COVER THE REARGUARD!"`
              : `${primarySL.squad} SL copies Command! All squads executing tactical retreat to ${flagId} with covering fire!`
            : action === 'OBJECTIVE'
            ? `${primarySL.squad} SL copies Command! All ${affectedBots.length} troops moving to ${verb} Objective ${flagId}!`
            : action === 'FOLLOW'
              ? `${primarySL.squad} SL copies Command! All squads rallying on Commander's position!`
              : isMedievalEra
              ? `🛡️ ${primarySL.squad} Banneret: "SHIELD WALL! LOCKELDS & BRACE SPEARS (-35% FRONTAL DMG) — HOLD THIS LINE!"`
              : `${primarySL.squad} SL copies Command! All squads digging in to hold this sector!`;

        this.emitBotComms(primarySL, player, msg1, 'COMMAND', true, 'CMD NET');

        if (secondarySL && secondarySL !== primarySL && (action === 'OBJECTIVE' || action === 'CHARGE')) {
          setTimeout(() => {
            if (!secondarySL.dead) {
              this.emitBotComms(
                secondarySL,
                player,
                isMedievalEra
                  ? `⚔️ ${secondarySL.squad} Captain: "Archers & Men-at-Arms, advance on Objective ${flagId}! No quarter!"`
                  : `${secondarySL.squad} SL (${secondarySL.squadSpecialty}) rolling out to Objective ${flagId} now!`,
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
          action === 'CHARGE' || action === 'ATTACK'
            ? isMedievalEra
              ? `⚔️ ${targetSquad} Sergeant: "CHAAARGE! Blades out, men — crash into Objective ${flagId}!"`
              : `Copy Squad Lead! ${targetSquad} Squad charging aggressively into Objective ${flagId}!`
            : action === 'RETREAT'
            ? isMedievalEra
              ? `🏳️ ${targetSquad} Sergeant: "Fall back! Regroup at ${flagId}, keep your shields toward the enemy!"`
              : `Copy Squad Lead! ${targetSquad} Squad falling back to ${flagId}!`
            : action === 'OBJECTIVE'
            ? `Copy Squad Lead! ${targetSquad} Squad (${affectedBots.length} strong) pushing to ${verb} Objective ${flagId}!`
            : action === 'FOLLOW'
              ? `Copy Squad Lead! ${targetSquad} Squad forming up on your six!`
              : isMedievalEra
              ? `🛡️ ${targetSquad} Sergeant: "SHIELD WALL! Lock shields side-by-side and hold the ground!"`
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
    events.emit('bot:comms', { bot, text, channel, dist, category });
    if (this.onBotComms && !this.onBotComms._isEventsBridge) {
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
      m.playerOrderTimer = 22;
      if (m.role === 'MEDIC') {
        m.healTarget = 'PLAYER';
      }
      if (player.hp < 100 || player.bleeding) {
        player.bleeding = false;
        const healAmt = m.role === 'MEDIC' ? 100 : 50;
        player.hp = Math.min(100, player.hp + healAmt);
        if (player.bandages < 2) player.bandages = 2;
        player.beingHealedByMedic = m.name;
        player.medicHealTimer = 1.8;
        if (player.onAwardXp) {
          player.onAwardXp(
            20,
            `🏥 ${m.role === 'MEDIC' ? 'MEDIC' : 'SQUADMATE'} ${m.name} HEALED YOUR INJURIES (${Math.ceil(player.hp)}/100 HP)!`
          );
        }
      }
      this.emitBotComms(
        m,
        player,
        m.role === 'MEDIC'
          ? 'Medic on the way! Treating your injuries — your health is maxed out at 100 HP!'
          : 'Got a spare bandage for you Lead, patching up your wounds!',
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

  initBots(countPerTeam = 125) {
    this.currentBotsPerTeam = countPerTeam;
    this.squadLeaders = { US: {}, RU: {} };
    for (let i = 0; i < countPerTeam; i++) {
      const suffix = i >= BOT_NAMES_US.length ? `_${Math.floor(i / BOT_NAMES_US.length) + 1}` : '';
      const usName = `${BOT_NAMES_US[i % BOT_NAMES_US.length]}${suffix}`;
      const ruName = `${BOT_NAMES_RU[i % BOT_NAMES_RU.length]}${suffix}`;
      this.spawnBot('US', usName, i);
      this.spawnBot('RU', ruName, i);
    }
  }

  setBotCountPerSide(countPerTeam = 125) {
    const cleanCount = Math.max(25, Math.min(200, Math.floor(countPerTeam)));
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
    this.squadLeaders = { US: {}, RU: {} };
    this.initBots(cleanCount);
  }

  spawnBot(team, name, index) {
    const era = this.world?.era || this.world?.mapDef?.era || 'modern';
    const squadDef = SQUAD_DEFS[index % SQUAD_DEFS.length];
    const squadMemberIndex = Math.floor(index / SQUAD_DEFS.length);
    const commandRank =
      index === 0
        ? 'COMMANDER'
        : squadMemberIndex === 0
          ? 'SQUAD_LEADER'
          : squadMemberIndex <= 2
            ? 'FIRETEAM_LEADER'
            : 'MEMBER';
    const isSquadLeader = squadMemberIndex === 0;
    const isCommander = index === 0;

    let role =
      squadDef.id === 'FALCON'
        ? 'ENGINEER'
        : squadDef.id === 'BRAVO' && squadMemberIndex < 8
        ? 'ENGINEER'
        : CLASSES[index % CLASSES.length];
    let botName = name;
    let subFaction = team;

    if (era === 'medieval') {
      const medievalRoles = [
        'SWORDSMAN',
        'GREATSWORD_KNIGHT',
        'POLEARM_KNIGHT',
        'ARCHER',
        'CROSSBOWMAN',
        'MOUNTED_KNIGHT'
      ];
      role = medievalRoles[index % medievalRoles.length];
      const titleMap = {
        MOUNTED_KNIGHT: team === 'US' ? 'Sir ' : 'Lord ',
        POLEARM_KNIGHT: team === 'US' ? 'Lancer ' : 'Halberdier ',
        GREATSWORD_KNIGHT: team === 'US' ? 'Champion ' : 'Warden ',
        ARCHER: team === 'US' ? 'Yeoman ' : 'Bowman ',
        CROSSBOWMAN: team === 'US' ? 'Arbalester ' : 'Marksman ',
        SWORDSMAN: team === 'US' ? 'Templar ' : 'Vanguard '
      };
      botName = `${titleMap[role] || 'Knight '}${name}`;
    } else if (era === 'jurassic') {
      if (team === 'US') {
        // In Jurassic Era, USA and Russia unite as the Human Coalition ('US' team) against the Dinosaurs —
        // using Ranged Hunting Longbows, Heavy Crossbows, Anti-Dino Long Spears & Warhorses (ZERO firearms/guns)!
        subFaction = index % 2 === 0 ? 'US' : 'RU';
        const hunterRoles = ['ARCHER', 'CROSSBOWMAN', 'POLEARM_KNIGHT', 'MOUNTED_KNIGHT', 'GREATSWORD_KNIGHT', 'SWORDSMAN'];
        role = hunterRoles[index % hunterRoles.length];
        const suffix = index >= BOT_NAMES_US.length ? `_${Math.floor(index / BOT_NAMES_US.length) + 1}` : '';
        const basePool = subFaction === 'RU' ? BOT_NAMES_RU : BOT_NAMES_US;
        const rawCallsign = `${basePool[index % basePool.length]}${suffix}`;
        const hunterTag =
          role === 'ARCHER' || role === 'MOUNTED_KNIGHT'
            ? 'Bow Hunter'
            : role === 'CROSSBOWMAN'
            ? 'Arbalest Hunter'
            : role === 'POLEARM_KNIGHT'
            ? 'Spear Lancer'
            : 'Blade Tracker';
        botName = subFaction === 'RU' ? `[RU] ${hunterTag} ${rawCallsign}` : `[US] ${hunterTag} ${rawCallsign}`;
      } else {
        subFaction = 'DINO';
        role =
          isCommander || isSquadLeader
            ? 'TREX'
            : index % 5 === 1
            ? 'TRICERATOPS'
            : index % 3 === 0
            ? 'DILOPHOSAURUS'
            : 'RAPTOR';
        botName =
          role === 'TREX'
            ? `👑 T-REX ALPHA #${index + 1}`
            : role === 'TRICERATOPS'
            ? `🦕 TRICERATOPS #${index + 1}`
            : role === 'DILOPHOSAURUS'
            ? `🦎 DILOPHOSAURUS #${index + 1}`
            : `🦖 VELOCIRAPTOR #${index + 1}`;
      }
    }

    const meshTeam = era === 'jurassic' && team === 'US' ? subFaction : team;
    const mesh = createSoldierMesh(meshTeam, role, commandRank, era);
    const spawnInfo = this.pickSpawnPosition(team, squadDef.id, true, subFaction);
    mesh.position.copy(spawnInfo.pos);
    this.scene.add(mesh);

    const TACTICS = ['ANCHOR_CROUCH', 'COVER_PEEK', 'ADVANCE_PAUSE', 'FLANK_RUSH', 'HOLD_STAND'];
    const initialYaw =
      era === 'jurassic' && team === 'US' && subFaction === 'RU'
        ? -Math.PI / 2
        : team === 'US'
        ? Math.PI / 2
        : -Math.PI / 2;
    const defaultFlagIdx = squadDef.defaultFlag % this.world.flags.length;
    const fPos = this.world.flags[defaultFlagIdx].pos;
    const spInit = this.computeBotSpacingOffsets(
      {
        squad: squadDef.id,
        squadMemberIndex,
        team,
        role,
        era,
        isDinosaur:
          role === 'RAPTOR' ||
          role === 'DILOPHOSAURUS' ||
          role === 'TRICERATOPS' ||
          role === 'TREX'
      },
      'FAN_OUT'
    );
    const memberClusterOffset = new THREE.Vector3(spInit.clusterOffX, 0, spInit.clusterOffZ);
    const safeOffset = this.world.pushOutOfBuildingFootprint(
      fPos.x + spInit.totalOffX,
      fPos.z + spInit.totalOffZ,
      2.2
    );

    const botHitMeshes = [];
    const bot = {
      id: `${team}_bot_${index}`,
      name: botName,
      team,
      subFaction,
      role,
      era,
      isMountedKnight: role === 'MOUNTED_KNIGHT',
      isDinosaur:
        role === 'RAPTOR' ||
        role === 'DILOPHOSAURUS' ||
        role === 'TRICERATOPS' ||
        role === 'TREX',
      underFireTimer: 0,
      builtRescueWall: false,
      lastShooterPos: null,
      commandRank,
      isSquadLeader,
      isCommander,
      squadMemberIndex,
      squad: squadDef.id,
      squadShort: squadDef.short,
      squadBranch: squadDef.branch || 'LAND',
      squadSpecialty: squadDef.specialty,
      isPilot: era === 'modern' && squadDef.id === 'FALCON',
      isPilotCrew: era === 'modern' && squadDef.id === 'FALCON',
      isArmorCrew: era === 'modern' && squadDef.id === 'BRAVO',
      tactic: TACTICS[index % TACTICS.length],
      pos: mesh.position,
      velX: 0,
      velZ: 0,
      velY: 0,
      isGrounded: true,
      yaw: initialYaw,
      moveYaw: initialYaw,
      aimPitch: 0,
      hp: role === 'TREX' ? 280 : role === 'TRICERATOPS' ? 185 : BOT.HP,
      maxHp: role === 'TREX' ? 280 : role === 'TRICERATOPS' ? 185 : BOT.MAX_HP,
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
      fieldDressings: role === 'MEDIC' ? (BOT.FIELD_DRESSINGS_MEDIC || 9) : (BOT.FIELD_DRESSINGS_OTHER || 2),
      maxFieldDressings: role === 'MEDIC' ? (BOT.FIELD_DRESSINGS_MEDIC || 9) : (BOT.FIELD_DRESSINGS_OTHER || 2),
      hasMedicBag: role === 'MEDIC',
      medicBagSupply: role === 'MEDIC' ? (BOT.MEDIC_BAG_MAX_SUPPLY || 600) : 0,
      maxMedicBagSupply: role === 'MEDIC' ? (BOT.MEDIC_BAG_MAX_SUPPLY || 600) : 0,
      medicKills: 0,
      planesDestroyed: 0,
      tanksDestroyed: 0,
      carsDestroyed: 0,
      vehiclesDestroyed: 0,
      captures: 0,
      score: 0,
      matchCash:
        commandRank === 'COMMANDER'
          ? 700
          : commandRank === 'SQUAD_LEADER'
          ? 450
          : 250,
      cashLooted: false,
      lastSpawnSource: spawnInfo.source,
      drivingVehicle: null,
      mesh,
      parts: mesh.userData.parts,
      hitMeshes: botHitMeshes,
      _enemyRef: {
        isPlayer: false,
        isVehicle: false,
        pos: null,
        unit: null,
        bot: null,
        vehicle: null
      },
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
      _targetScanTimer: (index % 25) * 0.02,
      _rescueScanTimer: (index % 20) * 0.025,
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

    if (isSquadLeader && this.squadLeaders[team]) {
      this.squadLeaders[team][squadDef.id] = bot;
    }

    mesh.traverse((child) => {
      if (child.isMesh && child.name !== 'teamMarker') {
        child.userData.bot = bot;
        if (!child.userData.skipHitbox) {
          botHitMeshes.push(child);
          this.hitMeshes.push(child);
        }
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

      if (!player.dead && !player.downed && (player.hp === undefined || player.hp > 0)) {
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

      if (this.spatialGrid && this.spatialGrid.count > 0) {
        this.spatialGrid.forEachInRadius(basePos.x, basePos.z, MAIN_BASE_RADIUS, (b) => {
          if (
            b.dead ||
            b.downed ||
            (typeof b.hp === 'number' && b.hp <= 0) ||
            (b.bleedOutTimer || 0) > 0
          ) {
            return;
          }
          if (b.team === baseTeam) defenders++;
          else attackers++;
        });
      } else {
        for (let i = 0; i < this.bots.length; i++) {
          const b = this.bots[i];
          if (b.dead || b.downed || (typeof b.hp === 'number' && b.hp <= 0) || (b.bleedOutTimer || 0) > 0) continue;
          const d = Math.hypot(b.pos.x - basePos.x, b.pos.z - basePos.z);
          if (d <= MAIN_BASE_RADIUS) {
            if (b.team === baseTeam) defenders++;
            else attackers++;
          }
        }
      }

      const prevContested = this.baseState[baseTeam].contested;
      this.baseState[baseTeam].defenders = defenders;
      this.baseState[baseTeam].attackers = attackers;
      this.baseState[baseTeam].playerPresent = playerPresent;
      // Contested once all defenders at the base are eliminated AND player/attackers are there!
      syncBaseProtectionFSM(this.baseState[baseTeam], baseTeam);
      const isNowContested = this.baseState[baseTeam].contested;

      if (!prevContested && isNowContested) {
        events.emit('flag:contested', {
          base: `${baseTeam}_MAIN_BASE`,
          owner: baseTeam,
          attackers,
          playerPresent
        });
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

      if (!player.dead && !player.downed && (player.hp === undefined || player.hp > 0)) {
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

      if (this.spatialGrid && this.spatialGrid.count > 0) {
        this.spatialGrid.forEachInRadius(flag.pos.x, flag.pos.z, FLAG_CONTEST_RADIUS, (b) => {
          if (
            b.dead ||
            b.downed ||
            (typeof b.hp === 'number' && b.hp <= 0) ||
            (b.bleedOutTimer || 0) > 0
          ) {
            return;
          }
          if (b.team === flag.owner) defenders++;
          else attackers++;
        });
      } else {
        for (let i = 0; i < this.bots.length; i++) {
          const b = this.bots[i];
          if (b.dead || b.downed || (typeof b.hp === 'number' && b.hp <= 0) || (b.bleedOutTimer || 0) > 0) continue;
          const d = Math.hypot(b.pos.x - flag.pos.x, b.pos.z - flag.pos.z);
          if (d <= FLAG_CONTEST_RADIUS) {
            if (b.team === flag.owner) defenders++;
            else attackers++;
          }
        }
      }

      const prevContested = Boolean(flag.contested);
      // Lock enemy respawns at this Forward Base whenever attackers are within contest radius
      // OR the flag is actively being neutralized (< 85% progress)!
      const isNowContested = attackers > 0 || Math.abs(flag.captureProgress) < 85;
      flag.contested = isNowContested;
      flag.defendersCount = defenders;
      flag.attackersCount = attackers;
      flag.playerPresent = playerPresent;

      if (!prevContested && isNowContested) {
        events.emit('flag:contested', {
          flag,
          base: `FORWARD_FLAG_${flag.id}`,
          owner: flag.owner,
          attackers,
          playerPresent
        });
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

    // 3. Update Forward Base Garrison Squad Assignments (gated on 1.0s timer or flag-owner change)
    let flagOwnersChanged = false;
    if (!this._lastFlagOwners || this._lastFlagOwners.length !== this.world.flags.length) {
      this._lastFlagOwners = this.world.flags.map((f) => f.owner);
      flagOwnersChanged = true;
    } else {
      for (let fi = 0; fi < this.world.flags.length; fi++) {
        if (this._lastFlagOwners[fi] !== this.world.flags[fi].owner) {
          this._lastFlagOwners[fi] = this.world.flags[fi].owner;
          flagOwnersChanged = true;
        }
      }
    }
    this._garrisonSyncTimer = (this._garrisonSyncTimer || 0) - 0.25;
    if (flagOwnersChanged || this._garrisonSyncTimer <= 0) {
      this._garrisonSyncTimer = 1.0;
      this.updateForwardBaseGarrisons(player);
    }
  }

  /**
   * Assigns 1 dedicated Defense Garrison Squad to each captured Forward Base (`flag.owner === team`)
   * when Garrison Defense Doctrine is enabled (`this.garrisonDoctrineEnabled[team]`).
   * - Always leaves at least 1 Assault Squad free to push unowned/enemy flags (unless all 5 flags are owned).
   * - Respects manual single-squad human orders, and even when an ALL-squad order is active,
   *   keeps 1 garrison squad holding each rear captured forward base unless Garrison Doctrine is toggled OFF!
   */
  updateForwardBaseGarrisons(player = null) {
    if (!this.world || !Array.isArray(this.world.flags)) return;

    for (const flag of this.world.flags) {
      if (!flag.garrisonSquad) flag.garrisonSquad = { US: null, RU: null };
      flag.garrisonSquad.US = null;
      flag.garrisonSquad.RU = null;
    }

    // Preferred infantry garrison squad roster (leaves ALPHA as primary assault spearhead, BRAVO as armor, and FALCON as air wing until needed)
    const garrisonPriority = ['CHARLIE', 'DELTA', 'ECHO', 'ALPHA', 'BRAVO', 'FALCON'];

    for (const team of ['US', 'RU']) {
      this.squadGarrisonFlagIndex[team] = {};
      this.flagGarrisonSquad[team] = {};

      if (!this.garrisonDoctrineEnabled[team]) {
        for (const b of this.bots) {
          if (b.team === team) {
            b.isGarrisonDefender = false;
            b.garrisonFlagId = null;
          }
        }
        continue;
      }

      const ownedFlagItems = this.world.flags
        .map((f, idx) => ({ f, idx }))
        .filter((item) => item.f.owner === team);

      // Sort owned flags from frontline-most (closest to enemy HQ) to rear:
      // US pushes +X (so higher X is closer to RU HQ); RU pushes -X (so lower X is closer to US HQ)
      ownedFlagItems.sort((a, b) => (team === 'US' ? b.f.pos.x - a.f.pos.x : a.f.pos.x - b.f.pos.x));

      // Keep at least 4 squads free to assault unowned flags (at most 2 rear garrisons until all 5 flags are captured)
      const maxGarrisons = ownedFlagItems.length >= 5 ? 4 : Math.min(ownedFlagItems.length, 2);

      // Identify available squads (exclude squads with an explicit single-squad human order to do something else)
      const availableSquads = garrisonPriority.filter((sqId) => {
        const sqOrd = this.squadOrders[team] && this.squadOrders[team][sqId];
        if (sqOrd && sqOrd.timer > 0 && sqOrd.scope === 'SQUAD') {
          return false;
        }
        return true;
      });

      for (let i = 0; i < maxGarrisons && i < availableSquads.length; i++) {
        const flagItem = ownedFlagItems[i];
        const sqId = availableSquads[i];
        this.squadGarrisonFlagIndex[team][sqId] = flagItem.idx;
        this.flagGarrisonSquad[team][flagItem.f.id] = sqId;
        flagItem.f.garrisonSquad[team] = sqId;
      }

      // Sync bot garrison tags & defensive perimeter offsets (`10m–22m` entrenched ring around the flag)
      for (const b of this.bots) {
        if (b.team !== team) continue;
        const gIdx = this.squadGarrisonFlagIndex[team][b.squad];
        const hasSingleSquadOverride =
          b.playerOrderTimer > 0 &&
          this.squadOrders[team] &&
          this.squadOrders[team][b.squad] &&
          this.squadOrders[team][b.squad].scope === 'SQUAD' &&
          b.playerOrderFlagIndex !== gIdx;

        if (typeof gIdx === 'number' && gIdx >= 0 && !hasSingleSquadOverride) {
          const gFlag = this.world.flags[gIdx];
          const wasGarrisoningThis = b.isGarrisonDefender && b.targetFlagIndex === gIdx;
          b.isGarrisonDefender = true;
          b.garrisonFlagId = gFlag ? gFlag.id : null;
          b.targetFlagIndex = gIdx;

          if (!wasGarrisoningThis && gFlag) {
            // Position Garrison Defenders in a 360-degree entrenched perimeter (`9m–21m`) biased toward enemy approach!
            const enemyDirX = team === 'US' ? 1 : -1;
            const memIdx = b.squadMemberIndex || 0;
            const totalMem = 8;
            const baseAngle = ((memIdx / totalMem) - 0.5) * Math.PI * 1.35 + (team === 'US' ? 0 : Math.PI);
            const ringDist = 9.5 + (memIdx % 3) * 4.2;
            const rawOffX = Math.cos(baseAngle) * ringDist + enemyDirX * 2.5;
            const rawOffZ = Math.sin(baseAngle) * ringDist;
            const safePos = this.world.pushOutOfBuildingFootprint(
              gFlag.pos.x + rawOffX,
              gFlag.pos.z + rawOffZ,
              2.0
            );
            b.waypointOffset.set(safePos.x - gFlag.pos.x, 0, safePos.z - gFlag.pos.z);
          }
        } else {
          b.isGarrisonDefender = false;
          b.garrisonFlagId = null;
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
  pickSpawnPosition(team, squad = 'ALPHA', returnMeta = false, subFaction = null) {
    const era = this.world?.era || this.world?.mapDef?.era || 'modern';

    // In Jurassic Era, Dinosaurs (team === 'RU') are NOT on the Russia side and do NOT spawn at RU_BASE!
    // Instead, Dinosaurs emerge from 5 Prehistoric Jungle Nests & Volcanic Craters all around the island
    // while USA (West Base US_BASE) and Russia (East Base RU_BASE) fight together against the Dinosaurs!
    if (era === 'jurassic' && team === 'RU') {
      const dinoNests = [
        { x: -390, z: -295, label: 'NW_RAPTOR_RIDGE_NEST' },
        { x: 0, z: -340, label: 'NORTH_VOLCANIC_CALDERA' },
        { x: 24, z: 18, label: 'CENTRAL_LAGOON_NEST' },
        { x: -135, z: 315, label: 'SOUTH_SKELETON_CANYON' },
        { x: 390, z: 295, label: 'SE_TREX_CRATER_NEST' }
      ];
      const nest = dinoNests[Math.floor(Math.random() * dinoNests.length)];
      const angle = Math.random() * Math.PI * 2;
      const dist = 8 + Math.random() * 24;
      const sx = nest.x + Math.cos(angle) * dist;
      const sz = nest.z + Math.sin(angle) * dist;
      const pos = this.world.findSafeSpawnPoint(sx, sz);
      return returnMeta ? { pos, source: nest.label } : pos;
    }

    const allOwnedFlags = this.world.flags.filter((f) => f.owner === team);
    const uncontestedFlags = allOwnedFlags.filter((f) => !f.contested);
    const useRussianEastBase = era === 'jurassic' && team === 'US' && subFaction === 'RU';
    const baseKey = useRussianEastBase ? 'RU' : team;
    const mainBaseContested = Boolean(
      this.baseState && this.baseState[baseKey] && this.baseState[baseKey].contested
    );
    const mainBase =
      baseKey === 'US' ? this.world.spawns.US_BASE : this.world.spawns.RU_BASE;

    // Determine whether this unit should spawn at Main Base or an uncontested Forward Flag
    let spawnAtMainBase =
      squad === 'BRAVO' || uncontestedFlags.length === 0 || Math.random() < 0.35;

    if (mainBaseContested && uncontestedFlags.length > 0) {
      // Main Base is CONTESTED/OVERRUN! Redirect spawn to an uncontested Forward Base!
      spawnAtMainBase = false;
      if (this.onTelemetryEvent) {
        this.onTelemetryEvent('CONTESTED_SPAWN_BLOCKED', {
          team,
          squad,
          blockedBase: `${baseKey}_MAIN_BASE`,
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
      // At opening round start (0 flags owned by either side), deploy vanguard foot-infantry squads
      // (ALPHA, CHARLIE, DELTA, ECHO) along their faction's ±820m Forward Staging Line so both 125-soldier
      // armies engage over Objectives A-E within 20-30s instead of jogging 1.5km across empty prairie,
      // while BRAVO Armor Crew & FALCON Air Crew spawn right inside the ±1,520m Main Base Motor Pool / Airfield!
      const anyFlagCaptured = this.world.flags.some((fl) => fl.owner && fl.owner !== 'NEUTRAL');
      const isVanguardInfantry =
        !anyFlagCaptured && squad !== 'BRAVO' && squad !== 'FALCON';
      if (isVanguardInfantry) {
        const stagingX = baseKey === 'US' ? -820 : 820;
        const laneZ =
          squad === 'ALPHA'
            ? 0
            : squad === 'CHARLIE'
            ? -210
            : squad === 'DELTA'
            ? 210
            : (Math.random() - 0.5) * 320;
        sx = stagingX + (Math.random() - 0.5) * 36;
        sz = laneZ + (Math.random() - 0.5) * 44;
        source = 'FORWARD_STAGING_LINE';
      } else {
        // Spawn inside the Main Base Motor Pool apron (US_BASE + 28m / RU_BASE - 28m)
        const motorPoolX = baseKey === 'US' ? mainBase.x + 28 : mainBase.x - 28;
        sx = motorPoolX + (Math.random() - 0.5) * 18;
        sz = mainBase.z + (Math.random() - 0.5) * 32;
        source = useRussianEastBase ? 'RU_COALITION_EAST_BASE' : 'MAIN_BASE';
      }
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
    if (
      bot.dead ||
      bot.downed ||
      (typeof bot.hp === 'number' && bot.hp <= 0) ||
      (typeof bot.bleedOutTimer === 'number' && bot.bleedOutTimer > 0)
    ) {
      return { killed: false, hitType: 'none', ignoredDowned: true };
    }

    let hitType = isHeadshot ? 'headshot' : 'normal';
    bot.flinchTimer = bot.inFriendlyForwardBase ? 0.11 : 0.22;
    bot.underFireTimer = 2.4;
    if (bot.rescuer) {
      bot.rescuer.underFireTimer = Math.max(bot.rescuer.underFireTimer || 0, 2.4);
    }

    // Real-life & Tactical Shooter Entrenched Defender Advantage + Mount & Blade Shield Wall Bracing:
    // Defenders fighting inside a Friendly Forward Base or locked in a Medieval Shield Wall (DEFEND/HOLD)
    // benefit from overlapping heater shields, sandbag parapets, and built Point Defenses!
    const isMedievalBot = (this.world?.era || 'modern') === 'medieval' && !bot.isDinosaur;
    if (isMedievalBot && (bot.inShieldWall || bot.playerOrderMode === 'HOLD' || bot.tacticalPosture === 'DEFEND')) {
      amount = Math.max(1, Math.round(amount * 0.65)); // -35% incoming damage in Mount & Blade Shield Wall!
      hitType = 'armor';
    }
    if (bot.inFriendlyForwardBase) {
      const defStage = Math.min(4, bot.defendedFlagStage || 0);
      const dmgReduction = Math.min(0.42, 0.25 + defStage * 0.04);
      amount = Math.max(1, Math.round(amount * (1 - dmgReduction)));
      bot.isCrouching = true;
    } else if (Math.random() < 0.45) {
      bot.isCrouching = true;
    }

    // Spatial 3D Medieval Soldier Pain Grunt when hit
    if (isMedievalBot && this.player && bot.hp - amount > 0 && Math.random() < 0.65) {
      const distP = bot.pos.distanceTo(this.player.pos);
      if (distP < 48) {
        const dx = bot.pos.x - this.player.pos.x;
        const dz = bot.pos.z - this.player.pos.z;
        const len = Math.hypot(dx, dz) || 1;
        const pan = (dx * Math.cos(this.player.yaw || 0) + dz * -Math.sin(this.player.yaw || 0)) / len;
        sound.playMedievalSoldierVoice?.('pain', distP, pan);
      }
    }

    if (isHeadshot && bot.hasHelmet) {
      bot.hasHelmet = false;
      bot.mesh.userData.parts.helmet.visible = false;
      const helmColor = bot.team === 'US' ? HELMET_COLOR_US : HELMET_COLOR_RU;
      this.world.spawnDebris(tmpVec3(bot.pos.x, bot.pos.y + 1.85, bot.pos.z), helmColor, 2);
      amount = Math.round(amount * 0.48);
      hitType = 'armor';
      if (onAwardXp && bot.team !== attackerTeam) onAwardXp(25, 'HELMET KNOCKED OFF');
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
      const isFriendlyFireFromPlayer = Boolean(
        bot.team === attackerTeam &&
          this.player &&
          (attackerName === this.player.name || attackerName === 'YOU (PLAYER)') &&
          this.player.friendlyFireEnabled
      );
      bot.hp = 0;
      bot.deaths++;
      bot.muzzleFlashTimer = 0;
      if (bot.parts?.muzzleFlash) bot.parts.muzzleFlash.visible = false;
      bot._losCache?.clear();
      this.clearBotRescueLinks(bot);

      if (isFriendlyFireFromPlayer) {
        // Friendly Fire Teamkill by Player: eliminate teammate immediately and deduct $0.10 (10 cents)!
        bot.dead = true;
        bot.downed = false;
        bot.bleedOutTimer = 0;
        bot.respawnTimer = 6.5;
        bot.spottedTimer = 0;
        bot.velX = 0;
        bot.velZ = 0;
        if (bot.mesh) bot.mesh.visible = false;
        const ffWeaponLabel = `${weaponName || 'WEAPON'} [FRIENDLY FIRE -$0.10]`;
        this.player.deductFriendlyFirePenalty?.(bot.name, weaponName);
        if (onKillFn) {
          onKillFn(attackerName, attackerTeam, bot.name, bot.team, ffWeaponLabel, isHeadshot);
        } else {
          events.emit('kill:event', {
            killer: attackerName,
            kTeam: attackerTeam,
            victim: bot.name,
            vTeam: bot.team,
            weapon: ffWeaponLabel,
            isHs: isHeadshot
          });
        }
        return {
          killed: true,
          isFriendlyKill: true,
          hitType: isHeadshot ? 'headshot' : hitType,
          isMedicVictim,
          wasRescuing
        };
      }

      // Dinosaurs cannot be revived by other dinosaurs — when a dinosaur's HP reaches 0,
      // it dies immediately and never enters the downed state!
      if (bot.isDinosaur) {
        bot.dead = true;
        bot.downed = false;
        bot.bleedOutTimer = 0;
        bot.respawnTimer = 5.5;
        bot.spottedTimer = 0;
        bot.velX = 0;
        bot.velZ = 0;
        if (bot.mesh) bot.mesh.visible = false;
        const playerTeam = this.player?.team || 'US';
        if (bot.team !== playerTeam && this.world && typeof this.world.spawnEnemyLootPack === 'function') {
          this.world.spawnEnemyLootPack(bot);
        }
        events.emit('bot:killed', {
          bot,
          attackerName,
          attackerTeam,
          weaponName,
          isHeadshot,
          isMedicVictim: false,
          wasRescuing: false,
          stage: 'killed'
        });
        if (onKillFn) {
          onKillFn(attackerName, attackerTeam, bot.name, bot.team, weaponName, isHeadshot);
        } else {
          events.emit('kill:event', {
            killer: attackerName,
            kTeam: attackerTeam,
            victim: bot.name,
            vTeam: bot.team,
            weapon: weaponName,
            isHs: isHeadshot
          });
        }
        return {
          killed: true,
          hitType: isHeadshot ? 'headshot' : hitType,
          isMedicVictim: false,
          wasRescuing: false
        };
      }

      bot.downed = true;
      bot.bleedOutTimer = BOT.BLEEDOUT_TIMER;
      bot.spottedTimer = 0;
      bot.velX = 0;
      bot.velZ = 0;
      bot.mesh.rotation.x = -Math.PI / 2;
      if (isMedievalBot && this.player) {
        const distP = bot.pos.distanceTo(this.player.pos);
        if (distP < 68) {
          const dx = bot.pos.x - this.player.pos.x;
          const dz = bot.pos.z - this.player.pos.z;
          const len = Math.hypot(dx, dz) || 1;
          const pan = (dx * Math.cos(this.player.yaw || 0) + dz * -Math.sin(this.player.yaw || 0)) / len;
          sound.playMedievalSoldierVoice?.('death', distP, pan);
        }
      }
      const playerTeam = this.player?.team || 'US';
      if (bot.team !== playerTeam && this.world && typeof this.world.spawnEnemyLootPack === 'function') {
        this.world.spawnEnemyLootPack(bot);
      }
      events.emit('bot:downed', {
        bot,
        attackerName,
        attackerTeam,
        weaponName,
        isHeadshot,
        isMedicVictim,
        wasRescuing
      });
      events.emit('bot:killed', {
        bot,
        attackerName,
        attackerTeam,
        weaponName,
        isHeadshot,
        isMedicVictim,
        wasRescuing,
        stage: 'downed'
      });
      if (onKillFn) {
        onKillFn(attackerName, attackerTeam, bot.name, bot.team, weaponName, isHeadshot);
      } else {
        events.emit('kill:event', {
          killer: attackerName,
          kTeam: attackerTeam,
          victim: bot.name,
          vTeam: bot.team,
          weapon: weaponName,
          isHs: isHeadshot
        });
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
