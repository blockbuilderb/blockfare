import * as THREE from '../../vendor/three.module.js';
import { BOT, FORMATION, SQUAD_KIT_CAPS } from '../config.js?v=143';
import { sound } from '../audio.js?v=143';
import { tmpVec3 } from '../utils/VectorPool.js?v=143';
import { SpatialGrid2D } from '../utils/SpatialGrid2D.js?v=143';
import { events, makeEventBridge } from '../events.js?v=143';
import {
  createSoldierMesh,
  updateSoldierEquippedWeapon,
  getDefaultWeaponIdForRole
} from './SoldierMeshFactory.js?v=143';
import { SightlineMethods } from './SightlineSystem.js?v=143';
import { MedicAIMethods } from './MedicAI.js?v=143';
import { BotAIMethods } from './BotAI.js?v=143';
import {
  createBaseProtectionFSM,
  syncBaseProtectionFSM
} from '../core/StateMachines.js?v=143';

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

/**
 * Offworld Industries *Squad*-Calibrated 9-Man Squad Role Rosters:
 * Prevents the old modulo-6 bug where 50% of all bots spawned as RPG/Stinger Engineers!
 * - Each 9-man squad slice enforces Squad's Fire-Support cap (<=3 combined LAT + LMG + Marksman),
 *   max 2 Medics, max 1 Marksman (RECON), and 1–2 LAT Engineers (2 only in CHARLIE Anti-Armor;
 *   1 in ALPHA/DELTA/ECHO/BRAVO/FALCON -> ~12.8% team-wide LAT ratio!).
 */
export const SQUAD_9MAN_ROSTERS = {
  ALPHA:   ['ASSAULT', 'ASSAULT', 'MEDIC', 'ASSAULT', 'SUPPORT', 'MEDIC', 'ENGINEER', 'ASSAULT', 'RECON'],
  BRAVO:   ['ASSAULT', 'ASSAULT', 'MEDIC', 'SUPPORT', 'ENGINEER', 'ASSAULT', 'MEDIC', 'ASSAULT', 'ASSAULT'],
  CHARLIE: ['ASSAULT', 'ENGINEER', 'MEDIC', 'ASSAULT', 'ENGINEER', 'SUPPORT', 'MEDIC', 'ASSAULT', 'ASSAULT'],
  DELTA:   ['ASSAULT', 'MEDIC', 'SUPPORT', 'ASSAULT', 'MEDIC', 'ENGINEER', 'SUPPORT', 'ASSAULT', 'ASSAULT'],
  ECHO:    ['ASSAULT', 'RECON', 'MEDIC', 'ASSAULT', 'SUPPORT', 'ENGINEER', 'MEDIC', 'ASSAULT', 'ASSAULT'],
  FALCON:  ['ASSAULT', 'ASSAULT', 'MEDIC', 'ASSAULT', 'SUPPORT', 'ASSAULT', 'MEDIC', 'ASSAULT', 'ENGINEER'],
  FOXTROT: ['ASSAULT', 'ASSAULT', 'MEDIC', 'SUPPORT', 'ENGINEER', 'ASSAULT', 'MEDIC', 'ASSAULT', 'RECON'],
  GOLF:    ['ASSAULT', 'MEDIC', 'SUPPORT', 'ASSAULT', 'SUPPORT', 'ENGINEER', 'MEDIC', 'ASSAULT', 'ASSAULT'],
  HOTEL:   ['ASSAULT', 'ENGINEER', 'MEDIC', 'ASSAULT', 'ENGINEER', 'SUPPORT', 'MEDIC', 'ASSAULT', 'ASSAULT'],
  IRON:    ['ASSAULT', 'ASSAULT', 'MEDIC', 'SUPPORT', 'ENGINEER', 'ASSAULT', 'MEDIC', 'ASSAULT', 'ASSAULT'],
  KILO:    ['ASSAULT', 'RECON', 'MEDIC', 'ASSAULT', 'SUPPORT', 'ENGINEER', 'MEDIC', 'ASSAULT', 'ASSAULT'],
  VIPER:   ['ASSAULT', 'ASSAULT', 'MEDIC', 'ASSAULT', 'SUPPORT', 'ASSAULT', 'MEDIC', 'ASSAULT', 'ENGINEER']
};

const HELMET_COLOR_US = new THREE.Color(0x2980b9);
const HELMET_COLOR_RU = new THREE.Color(0xc0392b);

export const SQUAD_DEFS = [
  { id: 'ALPHA', short: 'ALP', branch: 'LAND', squadType: 'INFANTRY', maxSize: 9, icon: '⚔️', specialty: 'INFANTRY ASSAULT & BREACH (9P)', defaultFlag: 2 },
  { id: 'CHARLIE', short: 'CHR', branch: 'LAND', squadType: 'INFANTRY', maxSize: 9, icon: '🚀', specialty: 'ANTI-ARMOR & SAPPER INFANTRY (9P)', defaultFlag: 1 },
  { id: 'DELTA', short: 'DLT', branch: 'LAND', squadType: 'INFANTRY', maxSize: 9, icon: '➕', specialty: 'COMBAT MEDICAL & LOGISTICS (9P)', defaultFlag: 3 },
  { id: 'FOXTROT', short: 'FOX', branch: 'LAND', squadType: 'INFANTRY', maxSize: 9, icon: '🔥', specialty: 'SHOCK RIFLE INFANTRY (9P)', defaultFlag: 2 },
  { id: 'GOLF', short: 'GLF', branch: 'LAND', squadType: 'INFANTRY', maxSize: 9, icon: '📦', specialty: 'HEAVY WEAPONS & SUPPORT (9P)', defaultFlag: 1 },
  { id: 'HOTEL', short: 'HTL', branch: 'LAND', squadType: 'INFANTRY', maxSize: 9, icon: '🛠️', specialty: 'MECHANIZED SAPPER INFANTRY (9P)', defaultFlag: 3 },
  { id: 'ECHO', short: 'ECH', branch: 'RECON', squadType: 'RECON', maxSize: 6, icon: '🎯', specialty: 'RECON SNIPER & PATHFINDER (6P)', defaultFlag: 4, isReconSquad: true },
  { id: 'KILO', short: 'KIL', branch: 'RECON', squadType: 'RECON', maxSize: 6, icon: '🌲', specialty: 'JTAC LASER & DEEP RECON (6P)', defaultFlag: 0, isReconSquad: true },
  { id: 'BRAVO', short: 'BRV', branch: 'ARMOR', squadType: 'ARMOR', maxSize: 4, icon: '🛡️', specialty: 'HEAVY TANK PLATOON (4P CREW)', defaultFlag: 0, isArmorSquad: true },
  { id: 'IRON', short: 'IRN', branch: 'ARMOR', squadType: 'ARMOR', maxSize: 4, icon: '🛡️', specialty: 'IFV & SPAAG ARMOR CREW (4P)', defaultFlag: 4, isArmorSquad: true },
  { id: 'FALCON', short: 'FLC', branch: 'AIR', squadType: 'AIR', maxSize: 4, icon: '✈️', specialty: 'STRIKE FIGHTER WING (4P PILOTS)', defaultFlag: 2, isAirSquad: true },
  { id: 'VIPER', short: 'VPR', branch: 'AIR', squadType: 'AIR', maxSize: 4, icon: '🛸', specialty: 'CAS & AC-130 GUNSHIP WING (4P)', defaultFlag: 2, isAirSquad: true }
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
    this.playerSlotTeam = null;
    this.pendingRetireQuota = { US: 0, RU: 0 };
    this.spatialGrid = new SpatialGrid2D(-2912, 2912, -1920, 1920, 32, 640);
    this.teamGrid = {
      US: new SpatialGrid2D(-2912, 2912, -1920, 1920, 32, 320),
      RU: new SpatialGrid2D(-2912, 2912, -1920, 1920, 32, 320)
    };
    this.tracers = [];
    this._tracerPool = [];
    this.smokeClouds = [];
    this.squadSections = new Map();
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

  /**
   * Returns a team-mirrored initial Conquest objective index so US (West) and RU (East)
   * vanguard squads immediately assault their near-side & central FOBs (A, B, C vs E, D, C)
   * instead of ignoring Flag A or marching 1,400m past neutral flags!
   */
  getInitialSquadFlagIndex(team = 'US', squadId = 'ALPHA', flagCount = 5) {
    if (flagCount <= 0) return 0;
    if (flagCount < 5) {
      const def = SQUAD_DEFS.find((s) => s.id === squadId);
      return (def ? def.defaultFlag : 0) % flagCount;
    }
    if (team === 'RU') {
      if (squadId === 'ECHO' || squadId === 'BRAVO' || squadId === 'IRON') return 4; // OBJ E
      if (squadId === 'DELTA' || squadId === 'CHARLIE' || squadId === 'HOTEL') return 3; // OBJ D
      if (squadId === 'KILO' || squadId === 'GOLF') return 1; // OBJ B pressure
      return 2; // ALPHA, FOXTROT, FALCON, VIPER -> OBJ C
    }
    // US Team (West):
    if (squadId === 'ECHO' || squadId === 'BRAVO' || squadId === 'KILO') return 0; // OBJ A
    if (squadId === 'CHARLIE' || squadId === 'DELTA' || squadId === 'GOLF') return 1; // OBJ B
    if (squadId === 'IRON' || squadId === 'HOTEL') return 3; // OBJ D pressure
    return 2; // ALPHA, FOXTROT, FALCON, VIPER -> OBJ C
  }

  /**
   * Computes an objective waypoint offset guaranteed to sit INSIDE `flag.radius`
   * (`<= 68%` of capture radius, clamped after building-footprint pushout) so attacking
   * squads physically enter and capture FOBs instead of standing outside the 34m ring!
   */
  computeObjectiveCaptureOffset(b, flag, sp = null) {
    const fPos = flag?.pos || { x: 0, z: 0 };
    const capRad = Math.max(16, (flag?.radius || 34) - 4.5);
    const spacing = sp || this.computeBotSpacingOffsets(b, 'FAN_OUT');
    const maxSquadRing = Math.max(6, capRad * 0.56);
    const ringDist = Math.min(spacing.objSqDist ?? 14, maxSquadRing);
    const cScale = spacing.isClose ? 0.85 : 0.58;
    const rawOffX = Math.cos(spacing.sqSectorAngle || 0) * ringDist + (spacing.clusterOffX || 0) * cScale;
    const rawOffZ = Math.sin(spacing.sqSectorAngle || 0) * ringDist + (spacing.clusterOffZ || 0) * cScale;
    const safeGoal = this.world?.pushOutOfBuildingFootprint
      ? this.world.pushOutOfBuildingFootprint(fPos.x + rawOffX, fPos.z + rawOffZ, 2.0)
      : { x: fPos.x + rawOffX, z: fPos.z + rawOffZ };
    let dx = safeGoal.x - fPos.x;
    let dz = safeGoal.z - fPos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > capRad && dist > 0.01) {
      const clampRatio = capRad / dist;
      const clampedX = fPos.x + dx * clampRatio;
      const clampedZ = fPos.z + dz * clampRatio;
      if (!this.isPointBlocked || !this.isPointBlocked(clampedX, fPos.y || 0, clampedZ)) {
        dx *= clampRatio;
        dz *= clampRatio;
      }
    }
    return { x: dx, z: dz };
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

  initBots(countPerTeam = 125, playerSlotTeam = null) {
    this.currentBotsPerTeam = countPerTeam;
    this.playerSlotTeam =
      playerSlotTeam === 'US' || playerSlotTeam === 'RU' ? playerSlotTeam : null;
    this.squadLeaders = { US: {}, RU: {} };
    const usTarget =
      this.playerSlotTeam === 'US' ? Math.max(1, countPerTeam - 1) : countPerTeam;
    const ruTarget =
      this.playerSlotTeam === 'RU' ? Math.max(1, countPerTeam - 1) : countPerTeam;
    const maxLoop = Math.max(usTarget, ruTarget);
    for (let i = 0; i < maxLoop; i++) {
      if (i < usTarget) {
        const usSuffix =
          i >= BOT_NAMES_US.length ? `_${Math.floor(i / BOT_NAMES_US.length) + 1}` : '';
        const usName = `${BOT_NAMES_US[i % BOT_NAMES_US.length]}${usSuffix}`;
        this.spawnBot('US', usName, i);
      }
      if (i < ruTarget) {
        const ruSuffix =
          i >= BOT_NAMES_RU.length ? `_${Math.floor(i / BOT_NAMES_RU.length) + 1}` : '';
        const ruName = `${BOT_NAMES_RU[i % BOT_NAMES_RU.length]}${ruSuffix}`;
        this.spawnBot('RU', ruName, i);
      }
    }
  }

  setBotCountPerSide(countPerTeam = 125, opts = {}) {
    const rawFloor = Math.floor(countPerTeam);
    const cleanCount = rawFloor <= 0 ? 0 : Math.max(25, Math.min(250, rawFloor));
    const nextPlayerTeam =
      opts && Object.prototype.hasOwnProperty.call(opts, 'playerTeam')
        ? opts.playerTeam === 'US' || opts.playerTeam === 'RU'
          ? opts.playerTeam
          : null
        : this.playerSlotTeam;
    const expectedTotal =
      cleanCount === 0 ? 0 : nextPlayerTeam ? cleanCount * 2 - 1 : cleanCount * 2;
    if (
      this.currentBotsPerTeam === cleanCount &&
      this.playerSlotTeam === nextPlayerTeam &&
      this.bots.length === expectedTotal
    ) {
      return;
    }
    for (const b of this.bots) {
      if (b.drivingVehicle) {
        if (b.drivingVehicle.driver === b) b.drivingVehicle.driver = null;
        if (b.drivingVehicle.npcDriver === b) b.drivingVehicle.npcDriver = null;
        b.drivingVehicle = null;
      }
      if (b.parachuteMesh) {
        this.scene.remove(b.parachuteMesh);
        b.parachuteMesh = null;
      }
      if (b.mesh) {
        this.scene.remove(b.mesh);
      }
    }
    this.bots = [];
    this.hitMeshes = [];
    this.squadLeaders = { US: {}, RU: {} };
    this.pendingRetireQuota = { US: 0, RU: 0 };
    if (cleanCount === 0) {
      this.currentBotsPerTeam = 0;
      this.playerSlotTeam = nextPlayerTeam;
      return;
    }
    this.initBots(cleanCount, nextPlayerTeam);
  }

  getActiveBotCount() {
    let active = 0;
    for (let i = 0; i < this.bots.length; i++) {
      if (!this.bots[i].retiredForHuman) active++;
    }
    return active;
  }

  /**
   * Dynamically balances AI slots as real human players join, switch teams, or leave:
   * - Prefers retiring ALREADY-DEAD AI (`b.dead === true`) immediately so zero live AI disappear.
   * - If all AI on that team are currently alive, queues `pendingRetireQuota[team]` so the very
   *   next AI to die naturally in combat stays retired in reserve instead of respawning!
   * - When a human disconnects, reactivates retired AI slots so the battle refills smoothly.
   */
  syncHumanTeamCounts(humansUS = 1, humansRU = 0) {
    const perTeam = this.currentBotsPerTeam || 0;
    if (perTeam <= 0 || this.bots.length === 0) {
      this.pendingRetireQuota = { US: 0, RU: 0 };
      return;
    }
    if (!this.pendingRetireQuota) this.pendingRetireQuota = { US: 0, RU: 0 };

    const adjustTeam = (team, humanCount) => {
      const targetActiveAi = Math.max(0, perTeam - Math.max(0, Math.floor(humanCount)));
      let totalTeamPool = 0;
      let curRetired = 0;
      for (let i = 0; i < this.bots.length; i++) {
        const b = this.bots[i];
        if (b.team !== team) continue;
        totalTeamPool++;
        if (b.retiredForHuman) curRetired++;
      }

      const desiredRetired = Math.max(0, totalTeamPool - targetActiveAi);

      if (curRetired < desiredRetired) {
        let needToRetire = desiredRetired - curRetired;
        // Pass 1: Retire ALREADY-DEAD non-leader AI bots immediately (zero visual pop!)
        for (let i = this.bots.length - 1; i >= 0 && needToRetire > 0; i--) {
          const b = this.bots[i];
          if (b.team !== team || b.retiredForHuman || !b.dead) continue;
          if (b.isCommander || b.isSquadLeader) continue;
          b.retiredForHuman = true;
          needToRetire--;
        }
        // Pass 2: Any remaining dead AI if needed
        for (let i = this.bots.length - 1; i >= 0 && needToRetire > 0; i--) {
          const b = this.bots[i];
          if (b.team !== team || b.retiredForHuman || !b.dead) continue;
          b.retiredForHuman = true;
          needToRetire--;
        }
        // Pass 3: Never despawn live AI mid-fight — retire the next AI(s) that die naturally!
        this.pendingRetireQuota[team] = needToRetire;
      } else if (curRetired > desiredRetired) {
        this.pendingRetireQuota[team] = 0;
        let toRestore = curRetired - desiredRetired;
        for (let i = 0; i < this.bots.length && toRestore > 0; i++) {
          const b = this.bots[i];
          if (b.team !== team || !b.retiredForHuman) continue;
          b.retiredForHuman = false;
          b.respawnTimer = Math.min(b.respawnTimer || 0.8, 0.8);
          toRestore--;
        }
      } else {
        this.pendingRetireQuota[team] = 0;
      }
    };

    adjustTeam('US', humansUS);
    adjustTeam('RU', humansRU);
  }

  /**
   * Reserves 1 faction slot on `playerTeam` ('US' or 'RU') for the human player so total combatants
   * stay evenly balanced (e.g., 250 per side => 249 Friendly AI + 1 Player vs 250 Enemy AI = 500 Total).
   */
  syncPlayerTeamSlot(playerTeam) {
    const cleanTeam =
      playerTeam === 'US' || playerTeam === 'RU' ? playerTeam : null;
    if (!cleanTeam || !this.currentBotsPerTeam) return;
    if (this.playerSlotTeam === cleanTeam && this.bots.length === this.currentBotsPerTeam * 2 - 1) {
      return;
    }
    const perTeam = this.currentBotsPerTeam;
    // Fast O(N) incremental adjustment without rebuilding all 499 meshes!
    this.playerSlotTeam = cleanTeam;
    const wantUS = cleanTeam === 'US' ? Math.max(1, perTeam - 1) : perTeam;
    const wantRU = cleanTeam === 'RU' ? Math.max(1, perTeam - 1) : perTeam;
    let curUS = 0;
    let curRU = 0;
    for (let i = 0; i < this.bots.length; i++) {
      if (this.bots[i].team === 'US') curUS++;
      else if (this.bots[i].team === 'RU') curRU++;
    }
    const removeExcessFromTeam = (team, excess) => {
      let rem = excess;
      for (let i = this.bots.length - 1; i >= 0 && rem > 0; i--) {
        const b = this.bots[i];
        if (b.team !== team || b.isSquadLeader || b.isCommander) continue;
        this.clearBotRescueLinks?.(b);
        if (b.drivingVehicle) {
          if (b.drivingVehicle.driver === b) b.drivingVehicle.driver = null;
          if (b.drivingVehicle.npcDriver === b) b.drivingVehicle.npcDriver = null;
          b.drivingVehicle = null;
        }
        if (b.parachuteMesh) {
          this.scene.remove(b.parachuteMesh);
          b.parachuteMesh = null;
        }
        if (b.mesh) {
          this.scene.remove(b.mesh);
        }
        if (Array.isArray(b.hitMeshes) && b.hitMeshes.length > 0) {
          const dropSet = new Set(b.hitMeshes);
          this.hitMeshes = this.hitMeshes.filter((hm) => !dropSet.has(hm));
        }
        this.bots.splice(i, 1);
        rem--;
      }
    };
    if (curUS > wantUS) removeExcessFromTeam('US', curUS - wantUS);
    if (curRU > wantRU) removeExcessFromTeam('RU', curRU - wantRU);
    while (curUS < wantUS) {
      const idx = curUS;
      const suffix = idx >= BOT_NAMES_US.length ? `_${Math.floor(idx / BOT_NAMES_US.length) + 1}` : '';
      this.spawnBot('US', `${BOT_NAMES_US[idx % BOT_NAMES_US.length]}${suffix}`, idx);
      curUS++;
    }
    while (curRU < wantRU) {
      const idx = curRU;
      const suffix = idx >= BOT_NAMES_RU.length ? `_${Math.floor(idx / BOT_NAMES_RU.length) + 1}` : '';
      this.spawnBot('RU', `${BOT_NAMES_RU[idx % BOT_NAMES_RU.length]}${suffix}`, idx);
      curRU++;
    }
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

    const squadRoster = SQUAD_9MAN_ROSTERS[squadDef.id] || SQUAD_9MAN_ROSTERS.ALPHA;
    let role = squadRoster[squadMemberIndex % squadRoster.length];
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
    const defaultFlagIdx = this.getInitialSquadFlagIndex(
      team,
      squadDef.id,
      this.world.flags.length
    );
    const initFlag = this.world.flags[defaultFlagIdx];
    const fPos = initFlag.pos;
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
    const capInitOff = this.computeObjectiveCaptureOffset(
      { squad: squadDef.id, squadMemberIndex, team, role, era },
      initFlag,
      spInit
    );
    const safeOffset = { x: fPos.x + capInitOff.x, z: fPos.z + capInitOff.z };

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
      limbHealth: {
        head: 100,
        thorax: 100,
        leftArm: 100,
        rightArm: 100,
        leftLeg: 100,
        rightLeg: 100
      },
      armFractured: false,
      legFractured: false,
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
      hasManpads:
        era === 'modern' &&
        role === 'ENGINEER' &&
        (squadDef.id === 'FALCON' || (squadDef.id === 'CHARLIE' && squadMemberIndex % 9 === 4)),
      samMissilesLeft:
        era === 'modern' &&
        role === 'ENGINEER' &&
        (squadDef.id === 'FALCON' || (squadDef.id === 'CHARLIE' && squadMemberIndex % 9 === 4))
          ? BOT.SAM_MISSILES_PER_SPAWN || 1
          : 0,
      rpgRocketsLeft: role === 'ENGINEER' ? (BOT.RPG_ROCKETS_PER_SPAWN || 2) : 0,
      maxRpgRockets: role === 'ENGINEER' ? (BOT.RPG_ROCKETS_PER_SPAWN || 2) : 0,
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
   * Computes live 9-man fireteam slice kit counts for `(team, squadId)` and, when the human player
   * equips a capped specialist kit (`ENGINEER`, `RECON`, `SUPPORT`, `MEDIC`) with Squad Doctrine ON,
   * automatically reassigns 1 excess AI squadmate in the first 9-man slice to `ASSAULT` Rifleman
   * so Squad's 9-man role caps are strictly honored without locking out solo players!
   */
  /**
   * Creates a Player-Founded Custom Specialized Squad (`INFANTRY` 9P, `ARMOR` 4P, `AIR` 4P, or `RECON` 6P):
   * - Registers the squad dynamically in `SQUAD_DEFS` so Scoreboard, Command Net & Deploy Screen all recognize it.
   * - If `locked === false` (`🔓 Open`), automatically recruits up to `maxSize - 1` friendly AI bots into the new squad
   *   and equips them with branch-appropriate kits! If `locked === true` (`🔒 Locked`), reserves it for solo/friends!
   */
  createCustomSquad({ callsign = '', squadType = 'INFANTRY', locked = false, team = 'US' } = {}) {
    const typeKey = ['INFANTRY', 'ARMOR', 'AIR', 'RECON'].includes(String(squadType).toUpperCase())
      ? String(squadType).toUpperCase()
      : 'INFANTRY';
    const typeSpec = SQUAD_KIT_CAPS?.SQUAD_TYPES?.[typeKey] || {
      id: 'INFANTRY',
      maxSize: 9
    };
    const cleaned = String(callsign || '')
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '')
      .slice(0, 12);
    const defaultPrefix =
      typeKey === 'AIR'
        ? 'EAGLE'
        : typeKey === 'ARMOR'
        ? 'TITAN'
        : typeKey === 'RECON'
        ? 'GHOST'
        : 'OMEGA';
    let sqId = cleaned || `${defaultPrefix}-${SQUAD_DEFS.length + 1}`;
    let dedup = 2;
    while (SQUAD_DEFS.some((s) => s.id === sqId)) {
      sqId = `${(cleaned || defaultPrefix).slice(0, 9)}-${dedup++}`;
    }
    const short = sqId.replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'SQD';
    const icon =
      typeKey === 'AIR' ? '✈️' : typeKey === 'ARMOR' ? '🛡️' : typeKey === 'RECON' ? '🎯' : '⚔️';
    const branch = typeKey === 'AIR' ? 'AIR' : typeKey === 'ARMOR' ? 'ARMOR' : typeKey === 'RECON' ? 'RECON' : 'LAND';
    const maxSize = typeSpec.maxSize || (typeKey === 'INFANTRY' ? 9 : typeKey === 'RECON' ? 6 : 4);
    const newSquadDef = {
      id: sqId,
      short,
      branch,
      squadType: typeKey,
      maxSize,
      icon,
      locked: Boolean(locked),
      isCustomSquad: true,
      ownerTeam: team,
      isAirSquad: typeKey === 'AIR',
      isArmorSquad: typeKey === 'ARMOR',
      isReconSquad: typeKey === 'RECON',
      specialty: `CUSTOM ${typeKey} SQUAD (${maxSize}P${locked ? ' • LOCKED' : ' • OPEN'})`,
      defaultFlag: 2
    };
    SQUAD_DEFS.push(newSquadDef);

    let recruitedCount = 0;
    if (!locked && Array.isArray(this.bots) && this.bots.length > 0) {
      const wantAi = Math.max(0, maxSize - 1);
      const roleCycle =
        typeKey === 'AIR'
          ? ['ASSAULT', 'RECON', 'ENGINEER']
          : typeKey === 'ARMOR'
          ? ['ENGINEER', 'ENGINEER', 'MEDIC']
          : typeKey === 'RECON'
          ? ['RECON', 'MEDIC', 'SUPPORT', 'ENGINEER', 'ASSAULT']
          : ['MEDIC', 'SUPPORT', 'ENGINEER', 'ASSAULT', 'MEDIC', 'SUPPORT', 'ASSAULT', 'RECON'];
      for (let i = this.bots.length - 1; i >= 0 && recruitedCount < wantAi; i--) {
        const b = this.bots[i];
        if (!b || b.team !== team || b.retiredForHuman || b.isCommander || b.isSquadLeader) continue;
        b.squad = sqId;
        b.squadShort = short;
        b.squadMemberIndex = recruitedCount + 1;
        if ((this.world?.era || 'modern') === 'modern' && !b.isDinosaur) {
          const nextRole = roleCycle[recruitedCount % roleCycle.length];
          b.role = nextRole;
          if (b.mesh) {
            updateSoldierEquippedWeapon(b.mesh, getDefaultWeaponIdForRole(nextRole, b.team), b.team, {
              role: nextRole
            });
          }
        }
        recruitedCount++;
      }
    }

    return { squad: newSquadDef, recruitedAi: recruitedCount };
  }

  rebalanceAiSquadForPlayerRole(player) {
    if (!player || player.squadDoctrineEnabled === false) return null;
    if ((this.world?.era || 'modern') !== 'modern') return null;
    const team = player.team || 'US';
    const squadId = player.squad || 'ALPHA';
    const sqDef = SQUAD_DEFS.find((s) => s.id === squadId);
    const sqTypeKey = sqDef?.squadType || 'INFANTRY';
    const typeCaps = SQUAD_KIT_CAPS?.SQUAD_TYPES?.[sqTypeKey]?.roleCaps;
    const pRoleLower = String(player.role || 'assault').toLowerCase();
    const maxCap =
      (typeCaps && typeof typeCaps[pRoleLower] === 'number' && typeCaps[pRoleLower] > 0
        ? typeCaps[pRoleLower]
        : null) ??
      SQUAD_KIT_CAPS?.ROLE_MAX_PER_9?.[pRoleLower] ??
      9;
    const sliceLimit = Math.max(3, (sqDef?.maxSize || 9) - 1);
    if (maxCap >= 9) return null;

    const pRoleUpper = pRoleLower.toUpperCase();
    const sliceBots = this.bots.filter(
      (b) => b && b.team === team && b.squad === squadId && (b.squadMemberIndex || 0) < sliceLimit
    );
    const matchingAi = sliceBots.filter((b) => b.role === pRoleUpper);
    // Player occupies 1 slot of `pRoleUpper` in this 9-man squad; ensure AI holds at most `maxCap - 1`
    let excess = matchingAi.length + 1 - maxCap;
    let reassigned = 0;
    for (let i = matchingAi.length - 1; i >= 0 && excess > 0; i--) {
      const b = matchingAi[i];
      if (b.isSquadLeader || b.isCommander) continue;
      b.role = 'ASSAULT';
      b.usingRpg = false;
      b.hasManpads = false;
      b.samMissilesLeft = 0;
      b.rpgRocketsLeft = 0;
      b.maxRpgRockets = 0;
      const parts = b.parts || b.mesh?.userData?.parts;
      if (parts?.rpgShoulderGroup) parts.rpgShoulderGroup.visible = false;
      if (parts?.rpgBackTube) parts.rpgBackTube.visible = false;
      if (parts?.gunGroup) parts.gunGroup.visible = true;
      if (b.mesh) {
        updateSoldierEquippedWeapon(b.mesh, getDefaultWeaponIdForRole('ASSAULT', b.team), b.team, {
          role: 'ASSAULT'
        });
      }
      excess--;
      reassigned++;
    }
    return reassigned;
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
      // along their faction's ±820m Forward Staging Line in cohesive squad assembly zones so each squad
      // marches and fights together as a tactical unit, while Armor & Air crews spawn at HQ Motor Pool / Airfield!
      const anyFlagCaptured = this.world.flags.some((fl) => fl.owner && fl.owner !== 'NEUTRAL');
      const isHqVehicleSquad = squad === 'BRAVO' || squad === 'FALCON';
      const isVanguardInfantry = !anyFlagCaptured && !isHqVehicleSquad;
      if (isVanguardInfantry) {
        const stagingX = baseKey === 'US' ? -820 : 820;
        const squadLaneMap = {
          ALPHA: 0,
          CHARLIE: -210,
          DELTA: 210,
          ECHO: -135,
          FOXTROT: 72,
          GOLF: -72,
          HOTEL: 142,
          KILO: -155
        };
        const laneZ =
          Object.prototype.hasOwnProperty.call(squadLaneMap, squad)
            ? squadLaneMap[squad]
            : 0;
        sx = stagingX + (Math.random() - 0.5) * 24;
        sz = laneZ + (Math.random() - 0.5) * 24;
        source = 'FORWARD_STAGING_LINE';
      } else {
        // Spawn inside the Main Base Motor Pool apron (US_BASE + 28m / RU_BASE - 28m)
        const motorPoolX = baseKey === 'US' ? mainBase.x + 28 : mainBase.x - 28;
        sx = motorPoolX + (Math.random() - 0.5) * 18;
        sz = mainBase.z + (Math.random() - 0.5) * 32;
        source = useRussianEastBase ? 'RU_COALITION_EAST_BASE' : 'MAIN_BASE';
      }
    } else {
      // Cohesive Squad Forward Spawn: always pick the uncontested Forward Base closest to this squad's
      // active Squad Leader (or squad objective) so respawning squadmates rally together instead of scattering!
      let chosenFlag = uncontestedFlags[0];
      const sl = this.squadLeaders?.[team]?.[squad];
      let refX = null;
      let refZ = null;
      if (sl && !sl.dead && !sl.drivingVehicle) {
        refX = sl.pos.x;
        refZ = sl.pos.z;
      } else if (sl && typeof sl.targetFlagIndex === 'number' && this.world.flags[sl.targetFlagIndex]) {
        refX = this.world.flags[sl.targetFlagIndex].pos.x;
        refZ = this.world.flags[sl.targetFlagIndex].pos.z;
      } else if (uncontestedFlags.length > 1) {
        const defFlagIdx = this.getInitialSquadFlagIndex(team, squad, this.world.flags.length);
        const defFl = this.world.flags[defFlagIdx];
        if (defFl) {
          refX = defFl.pos.x;
          refZ = defFl.pos.z;
        }
      }
      if (refX !== null && uncontestedFlags.length > 1) {
        let bestDistSq = Infinity;
        for (let fi = 0; fi < uncontestedFlags.length; fi++) {
          const cand = uncontestedFlags[fi];
          const dxF = cand.pos.x - refX;
          const dzF = cand.pos.z - refZ;
          const dSqF = dxF * dxF + dzF * dzF;
          if (dSqF < bestDistSq) {
            bestDistSq = dSqF;
            chosenFlag = cand;
          }
        }
      }
      const sqIdx = Math.max(0, SQUAD_DEFS.findIndex((s) => s.id === squad));
      const sqBaseAngle = (sqIdx * (Math.PI * 2)) / SQUAD_DEFS.length;
      const angle = sqBaseAngle + (Math.random() - 0.5) * 0.55;
      const dist = 6 + Math.random() * 8;
      sx = chosenFlag.pos.x + Math.cos(angle) * dist;
      sz = chosenFlag.pos.z + Math.sin(angle) * dist;
      source = `FORWARD_FLAG_${chosenFlag.id}`;
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

  getBotSectionKey(bot) {
    if (!bot) return 'US_ALPHA_0';
    const secIdx = Math.floor((bot.squadMemberIndex || 0) / 9);
    return `${bot.team}_${bot.squad || 'ALPHA'}_${secIdx}`;
  }

  /**
   * Group Tactical Alert when ANY soldier in a 9-man Squad Section takes enemy fire or is sniped:
   * - Broadcasts the threat bearing across nearby squadmates so the entire group reacts in unison!
   * - Against long-range snipers (>75m) or elevated rooftop fire (dy > 11m), triggers `COVER_SCRAMBLE`:
   *   1) Computes a shared leeward hard-cover rally point behind the nearest building (or lateral break).
   *   2) Pops a 3D M18 Smoke Screen to mask the casualty & squad movement.
   *   3) Alerts Riflemen/Medics to sprint to cover together while Support/Recon drop prone to counter-suppress!
   */
  alertSquadUnderFire(victimBot, shooterPos = null, rawDamage = 25, isFatalOrHeadshot = false) {
    if (!victimBot || !Array.isArray(this.bots)) return;
    const secKey = this.getBotSectionKey(victimBot);
    if (!this.squadSections) this.squadSections = new Map();
    let sec = this.squadSections.get(secKey);
    if (!sec) {
      sec = {
        key: secKey,
        team: victimBot.team,
        squad: victimBot.squad || 'ALPHA',
        sectionIdx: Math.floor((victimBot.squadMemberIndex || 0) / 9),
        leader: null,
        members: [],
        centroidX: victimBot.pos.x,
        centroidZ: victimBot.pos.z,
        stragglerCount: 0,
        contactTimer: 0,
        underSniperAlertTimer: 0,
        smokeCooldown: 0,
        boundTimer: 2.4,
        activeBoundFireteam: 0,
        flankSign: ((victimBot.squad || 'A').charCodeAt(0) % 2 === 0 ? 1 : -1),
        tacticalMode: 'TACTICAL_WEDGE',
        threatPos: new THREE.Vector3(),
        hasThreatPos: false,
        coverAnchor: null,
        sharedEnemyUnit: null
      };
      this.squadSections.set(secKey, sec);
    }

    sec.contactTimer = Math.max(sec.contactTimer || 0, 7.0);
    let dist3D = 0;
    let dyShooter = 0;
    if (shooterPos && Number.isFinite(shooterPos.x)) {
      sec.threatPos.copy(shooterPos);
      sec.hasThreatPos = true;
      const dx = shooterPos.x - victimBot.pos.x;
      dyShooter = shooterPos.y - victimBot.pos.y;
      const dz = shooterPos.z - victimBot.pos.z;
      dist3D = Math.hypot(dx, dyShooter, dz);
    }

    const isSniperOrElevatedThreat =
      (shooterPos && (dist3D >= 75 || dyShooter >= 11.5)) ||
      rawDamage >= 65 ||
      Boolean(isFatalOrHeadshot);

    if (isSniperOrElevatedThreat) {
      sec.underSniperAlertTimer = Math.max(sec.underSniperAlertTimer || 0, 8.0);
      // Compute shared hard-cover rally point behind nearest building leeward face (or lateral dodge vector)
      const cx = sec.centroidX || victimBot.pos.x;
      const cz = sec.centroidZ || victimBot.pos.z;
      const tx = sec.hasThreatPos ? sec.threatPos.x : cx + (victimBot.team === 'US' ? 80 : -80);
      const tz = sec.hasThreatPos ? sec.threatPos.z : cz;
      const awayX = cx - tx;
      const awayZ = cz - tz;
      const awayLen = Math.hypot(awayX, awayZ) || 1;
      const ux = awayX / awayLen;
      const uz = awayZ / awayLen;

      let bestCoverX = cx + (-uz * sec.flankSign) * 13.5 + ux * 5.5;
      let bestCoverZ = cz + (ux * sec.flankSign) * 13.5 + uz * 5.5;
      if (this.world && Array.isArray(this.world.buildings) && this.world.buildings.length > 0) {
        let bestBld = null;
        let bestBldDist = 42.0;
        for (let bi = 0; bi < this.world.buildings.length; bi++) {
          const bld = this.world.buildings[bi];
          const bCx = (bld.minWx + bld.maxWx) * 0.5;
          const bCz = (bld.minWz + bld.maxWz) * 0.5;
          const dB = Math.hypot(bCx - cx, bCz - cz);
          if (dB < bestBldDist) {
            bestBldDist = dB;
            bestBld = bld;
          }
        }
        if (bestBld) {
          const bCx = (bestBld.minWx + bestBld.maxWx) * 0.5;
          const bCz = (bestBld.minWz + bestBld.maxWz) * 0.5;
          const halfW = (bestBld.maxWx - bestBld.minWx) * 0.5 + 3.2;
          const halfD = (bestBld.maxWz - bestBld.minWz) * 0.5 + 3.2;
          if (Math.abs(ux) > Math.abs(uz)) {
            bestCoverX = bCx + Math.sign(ux || 1) * halfW;
            bestCoverZ = THREE.MathUtils.clamp(cz, bestBld.minWz + 1.0, bestBld.maxWz - 1.0);
          } else {
            bestCoverX = THREE.MathUtils.clamp(cx, bestBld.minWx + 1.0, bestBld.maxWx - 1.0);
            bestCoverZ = bCz + Math.sign(uz || 1) * halfD;
          }
        }
      }
      if (this.world?.pushOutOfBuildingFootprint) {
        const safeCov = this.world.pushOutOfBuildingFootprint(bestCoverX, bestCoverZ, 2.3);
        bestCoverX = safeCov.x;
        bestCoverZ = safeCov.z;
      }
      if (!sec.coverAnchor) sec.coverAnchor = new THREE.Vector3();
      sec.coverAnchor.set(bestCoverX, victimBot.pos.y, bestCoverZ);
      sec.tacticalMode = 'COVER_SCRAMBLE';
    }

    let smokePopper = null;
    for (let i = 0; i < this.bots.length; i++) {
      const ally = this.bots[i];
      if (
        ally.dead ||
        ally.downed ||
        ally.drivingVehicle ||
        ally.team !== victimBot.team ||
        ally.squad !== victimBot.squad
      ) {
        continue;
      }
      const dSq = ally.pos.distanceToSquared(victimBot.pos);
      if (dSq > 36 * 36) continue;
      ally.underFireTimer = Math.max(ally.underFireTimer || 0, 3.2);
      ally.suppressionLevel = Math.min(1.0, (ally.suppressionLevel || 0) + (isSniperOrElevatedThreat ? 0.32 : 0.18));
      if (isSniperOrElevatedThreat) {
        ally._squadUnderSniperAlert = true;
      }
      if (shooterPos && Number.isFinite(shooterPos.x)) {
        if (!ally.lastShooterPos) ally.lastShooterPos = new THREE.Vector3();
        ally.lastShooterPos.copy(shooterPos);
      }
      if (
        !smokePopper &&
        ally !== victimBot &&
        (ally.role === 'MEDIC' || ally.isSquadLeader || ally.role === 'ASSAULT')
      ) {
        smokePopper = ally;
      }
    }

    if (
      isSniperOrElevatedThreat &&
      smokePopper &&
      (this.world?.era || 'modern') === 'modern' &&
      (sec.smokeCooldown || 0) <= 0 &&
      typeof this.spawnRescueSmoke === 'function'
    ) {
      sec.smokeCooldown = 20.0;
      const smokePos = tmpVec3(
        victimBot.pos.x + (sec.hasThreatPos ? Math.sign(sec.threatPos.x - victimBot.pos.x) * 2.2 : 0),
        victimBot.pos.y,
        victimBot.pos.z + (sec.hasThreatPos ? Math.sign(sec.threatPos.z - victimBot.pos.z) * 2.2 : 0)
      );
      this.spawnRescueSmoke(smokePos);
      if (this.player) {
        this.emitBotComms(
          smokePopper,
          this.player,
          dyShooter > 12
            ? '⚠️ SNIPER HIGH! Popping smoke — whole squad scramble to hard cover!'
            : '⚠️ SNIPER CONTACT! Smoke out — squad bound to cover & suppress!',
          'URGENT',
          false
        );
      }
    }
  }

  damageBot(
    bot,
    amount,
    attackerName,
    attackerTeam,
    weaponName,
    isHeadshot,
    onKillFn,
    onAwardXp = null,
    blastMeta = null
  ) {
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
    if (attackerTeam && attackerTeam !== bot.team) {
      let shooterOrigin = blastMeta?.origin || null;
      if (
        !shooterOrigin &&
        this.player &&
        this.player.team === attackerTeam &&
        (attackerName === this.player.name ||
          attackerName === 'YOU (PLAYER)' ||
          String(attackerName || '').includes('PLAYER'))
      ) {
        shooterOrigin = this.player.pos;
      } else if (!shooterOrigin && bot.lastShooterPos) {
        shooterOrigin = bot.lastShooterPos;
      }
      if (shooterOrigin && Number.isFinite(shooterOrigin.x)) {
        if (!bot.lastShooterPos) bot.lastShooterPos = new THREE.Vector3();
        bot.lastShooterPos.copy(shooterOrigin);
      }
      if (typeof this.alertSquadUnderFire === 'function') {
        this.alertSquadUnderFire(bot, shooterOrigin, amount, isHeadshot || amount >= bot.hp);
      }
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

    const rawDamage = amount;
    const hitZone =
      blastMeta?.hitZone ||
      (isHeadshot ? 'head' : 'thorax');
    if (!bot.limbHealth) {
      bot.limbHealth = {
        head: 100,
        thorax: 100,
        leftArm: 100,
        rightArm: 100,
        leftLeg: 100,
        rightLeg: 100
      };
    }
    const isArmHit = hitZone === 'leftArm' || hitZone === 'rightArm';
    const isLegHit = hitZone === 'leftLeg' || hitZone === 'rightLeg';
    // Limb hits (arms/legs) bypass chest plate armor and apply 0.82x/0.86x peripheral trauma + fracture!
    if (isHeadshot && bot.hasHelmet) {
      bot.hasHelmet = false;
      bot.mesh.userData.parts.helmet.visible = false;
      const helmColor = bot.team === 'US' ? HELMET_COLOR_US : HELMET_COLOR_RU;
      this.world.spawnDebris(tmpVec3(bot.pos.x, bot.pos.y + 1.85, bot.pos.z), helmColor, 2);
      amount = Math.round(amount * 0.48);
      hitType = 'armor';
      if (onAwardXp && bot.team !== attackerTeam) onAwardXp(25, 'HELMET KNOCKED OFF');
    } else if (!isHeadshot && !isArmHit && !isLegHit && bot.armorHp > 0) {
      const absorbed = Math.min(bot.armorHp, Math.round(amount * 0.35));
      bot.armorHp -= absorbed;
      amount -= absorbed;
      hitType = 'armor';
    } else if (isArmHit || isLegHit) {
      amount = Math.max(1, Math.round(amount * (isArmHit ? 0.82 : 0.86)));
    }

    const prevZoneHp = bot.limbHealth[hitZone] ?? 100;
    const zoneLoss = Math.round(amount * (isArmHit || isLegHit ? 1.55 : isHeadshot ? 1.8 : 1.15));
    const nextZoneHp = Math.max(0, prevZoneHp - zoneLoss);
    bot.limbHealth[hitZone] = nextZoneHp;
    const wasAlreadyBroken = prevZoneHp <= 0;
    const limbJustBroke = nextZoneHp <= 0;
    if (isArmHit && nextZoneHp <= 35) bot.armFractured = true;
    if (isLegHit && nextZoneHp <= 35) bot.legFractured = true;
    bot.lastHitZone = hitZone;

    const overkill = Math.max(0, amount - Math.max(0, bot.hp));
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

      // Squad-style Catastrophic Overpressure / Heavy Caliber / Limb-Break "Dead-Dead" (Beyond Medic Rescue) + 3D Ragdoll Launch:
      const cat = evaluateCatastrophicKill(
        weaponName,
        blastMeta?.dist ?? 0,
        blastMeta?.radius ?? 0,
        blastMeta?.rng || Math.random,
        {
          hitZone,
          isHeadshot: Boolean(isHeadshot),
          rawDamage,
          overkill,
          limbBroken: limbJustBroke,
          wasAlreadyBroken
        }
      );
      if (cat.beyondRescue) {
        bot.dead = true;
        bot.downed = false;
        bot.beyondRescue = true;
        bot.bleedOutTimer = 0;
        bot.respawnTimer = BOT.RESPAWN_TIMER || 8.0;
        bot.spottedTimer = 0;
        bot.velX = 0;
        bot.velZ = 0;

        // Compute outward 3D blast launch impulse & tumbling angular velocity
        let dirX = 0;
        let dirZ = 0;
        const origin = blastMeta?.origin || null;
        if (origin) {
          const dx = bot.pos.x - origin.x;
          const dz = bot.pos.z - origin.z;
          const len = Math.hypot(dx, dz);
          if (len > 0.05) {
            dirX = dx / len;
            dirZ = dz / len;
          }
        }
        if (dirX === 0 && dirZ === 0) {
          const randAng = (typeof blastMeta?.rng === 'function' ? blastMeta.rng() : Math.random()) * Math.PI * 2;
          dirX = Math.cos(randAng);
          dirZ = Math.sin(randAng);
        }
        bot.ragdollTimer = 3.6;
        bot.ragdollBounces = 0;
        bot.ragdollVelX = dirX * cat.hSpeed;
        bot.ragdollVelY = cat.upSpeed;
        bot.ragdollVelZ = dirZ * cat.hSpeed;
        bot.ragdollSpinX = (dirZ >= 0 ? 1 : -1) * (6.8 + (cat.hSpeed || 6) * 0.35);
        bot.ragdollSpinZ = (dirX >= 0 ? -1 : 1) * (5.2 + (cat.hSpeed || 6) * 0.25);
        if (bot.mesh) {
          bot.mesh.visible = true;
        }

        const playerTeam = this.player?.team || 'US';
        if (bot.team !== playerTeam && this.world && typeof this.world.spawnEnemyLootPack === 'function') {
          this.world.spawnEnemyLootPack(bot);
        }
        events.emit('bot:beyond-rescue', {
          bot,
          attackerName,
          attackerTeam,
          weaponName
        });
        events.emit('bot:killed', {
          bot,
          attackerName,
          attackerTeam,
          weaponName,
          isHeadshot,
          isMedicVictim,
          wasRescuing,
          beyondRescue: true,
          stage: 'beyond_rescue'
        });
        const kiaWeapon = String(weaponName || 'EXPLOSIVE').includes('KIA')
          ? weaponName
          : `${weaponName || 'EXPLOSIVE'} [☠️ KIA]`;
        if (onKillFn) {
          onKillFn(attackerName, attackerTeam, bot.name, bot.team, kiaWeapon, isHeadshot);
        } else {
          events.emit('kill:event', {
            killer: attackerName,
            kTeam: attackerTeam,
            victim: bot.name,
            vTeam: bot.team,
            weapon: kiaWeapon,
            isHs: isHeadshot
          });
        }
        return {
          killed: true,
          beyondRescue: true,
          hitType: isHeadshot ? 'headshot' : hitType,
          isMedicVictim,
          wasRescuing
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

/**
 * Tactical Shooter Catastrophic Trauma / "Dead-Dead" (Unrevivable KIA) Evaluator:
 * - Explosions (Shells, Bombs, Artillery, ATGMs, RPGs, Mortars, C4, Rockets, Mines, M67 Frag Grenades)
 *   have a LARGE chance (62%–100%) of instant unrevivable death + 3D blast ragdoll launch!
 * - Lethal Headshots (`isHeadshot` or `hitZone === 'head'`) have a LARGE chance (80%–92%)
 *   of instant unrevivable death so headshotted targets rarely enter the revivable downed state!
 * - Standard non-headshot small-arms body/limb wounds & bleedout remain 0% Beyond Rescue so Squad Medics can revive them!
 */
export function evaluateCatastrophicKill(
  weaponName = '',
  distFromCenter = 0,
  blastRadius = 0,
  rng = Math.random,
  hitMeta = null
) {
  const w = String(weaponName || '').toUpperCase();
  if (!w || w === 'BLEED') {
    return { beyondRescue: false, chance: 0, hSpeed: 0, upSpeed: 0, tier: 'REVIVABLE' };
  }

  const isCatastrophicShellOrBomb =
    w.includes('105MM') ||
    w.includes('HOWITZER') ||
    w.includes('120MM') ||
    w.includes('125MM') ||
    w.includes('APFSDS') ||
    w.includes('APHE') ||
    w.includes('TOW') ||
    w.includes('KORNET') ||
    w.includes('REFLEKS') ||
    w.includes('LAHAT') ||
    w.includes('HELLFIRE') ||
    w.includes('VIKHR') ||
    w.includes('ATAKA') ||
    w.includes('ATGM') ||
    w.includes('JDAM') ||
    w.includes('GBU') ||
    w.includes('CARPET BOMB') ||
    w.includes('MK-82') ||
    w.includes('500LB') ||
    w.includes('2,000LB') ||
    w.includes('30,000LB') ||
    w.includes('MAVERICK') ||
    w.includes('AGM') ||
    w.includes('KH-29') ||
    w.includes('AIRSTRIKE') ||
    w.includes('ARTILLERY') ||
    w.includes('155MM') ||
    w.includes('DYNAMITE') ||
    w.includes('TREBUCHET') ||
    w.includes('BOULDER') ||
    w.includes('COLLAPSE');

  if (isCatastrophicShellOrBomb) {
    const isDirect = blastRadius > 0 && distFromCenter <= 2.5;
    const isInner = blastRadius <= 0 || distFromCenter <= blastRadius * 0.65;
    const chance = isDirect ? 1.0 : isInner ? 0.94 : 0.76;
    const roll = rng();
    const jitter = rng();
    return {
      beyondRescue: roll < chance,
      chance,
      hSpeed: isInner ? 13.5 + jitter * 4.5 : 8.5 + jitter * 3.5,
      upSpeed: isInner ? 6.5 + jitter * 3.8 : 4.5 + jitter * 2.5,
      tier: 'HEAVY_BLAST'
    };
  }

  const isMediumOrRpgExplosive =
    w.includes('RPG') ||
    w.includes('HEAT') ||
    (w.includes('40MM') && w.includes('BOFORS')) ||
    w.includes('MORTAR') ||
    w.includes('81MM') ||
    w.includes('82MM') ||
    w.includes('C4') ||
    w.includes('70MM') ||
    w.includes('HYDRA') ||
    w.includes('ROCKET') ||
    w.includes('SAM') ||
    w.includes('STINGER') ||
    w.includes('IGLA') ||
    w.includes('MISSILE') ||
    w.includes('MINE') ||
    w.includes('CLAYMORE') ||
    w.includes('BARREL') ||
    w.includes('T-REX');

  if (isMediumOrRpgExplosive) {
    const isInner = blastRadius <= 0 || distFromCenter <= blastRadius * 0.62;
    const chance = isInner ? 0.88 : 0.68;
    const roll = rng();
    const jitter = rng();
    return {
      beyondRescue: roll < chance,
      chance,
      hSpeed: isInner ? 9.0 + jitter * 4.2 : 5.8 + jitter * 2.6,
      upSpeed: isInner ? 5.2 + jitter * 3.0 : 3.4 + jitter * 1.8,
      tier: w.includes('RPG') || w.includes('HEAT') ? 'RPG_BLAST' : 'MEDIUM_BLAST'
    };
  }

  const isGrenadeOrGenericBlast =
    blastRadius > 0 ||
    w.includes('GRENADE') ||
    w.includes('M67') ||
    w.includes('FRAG') ||
    w.includes('EXPLOSI') ||
    w.includes('BLAST') ||
    w.includes('CRASH');

  if (isGrenadeOrGenericBlast) {
    const isInner = blastRadius <= 0 || distFromCenter <= blastRadius * 0.58;
    const chance = isInner ? 0.80 : 0.62;
    const roll = rng();
    const jitter = rng();
    return {
      beyondRescue: roll < chance,
      chance,
      hSpeed: isInner ? 7.2 + jitter * 3.4 : 4.8 + jitter * 2.2,
      upSpeed: isInner ? 4.2 + jitter * 2.2 : 2.8 + jitter * 1.4,
      tier: 'GRENADE_BLAST'
    };
  }

  const isAutocannon =
    w.includes('25MM') ||
    w.includes('30MM') ||
    w.includes('20MM') ||
    w.includes('GAU-12') ||
    w.includes('EQUALIZER') ||
    w.includes('GAU-8') ||
    w.includes('AVENGER') ||
    w.includes('VULCAN') ||
    w.includes('2A38') ||
    w.includes('2A42') ||
    w.includes('AUTOCANNON');

  if (isAutocannon) {
    const chance = Boolean(hitMeta?.isHeadshot || hitMeta?.hitZone === 'head') ? 0.94 : 0.65;
    const roll = rng();
    const jitter = rng();
    return {
      beyondRescue: roll < chance,
      chance,
      hSpeed: 4.5 + jitter * 2.7,
      upSpeed: 2.5 + jitter * 1.7,
      tier: 'AUTOCANNON'
    };
  }

  // Lethal Headshots & Heavy Ballistic Vital Breaks ("Large Chance of Instant KIA Without Revive"):
  const isLethalHeadshot = Boolean(hitMeta && (hitMeta.isHeadshot || hitMeta.hitZone === 'head'));
  if (hitMeta || isLethalHeadshot) {
    const hz = hitMeta?.hitZone || (hitMeta?.isHeadshot ? 'head' : 'thorax');
    const rawDmg = hitMeta?.rawDamage || hitMeta?.finalDamage || 0;
    const overkill = hitMeta?.overkill || 0;
    const isHeavyBallistic =
      w.includes('.50') ||
      w.includes('12.7') ||
      w.includes('HMG') ||
      w.includes('CROWS') ||
      w.includes('KORD') ||
      w.includes('L96') ||
      w.includes('AWP') ||
      w.includes('AWM') ||
      w.includes('SV-98') ||
      w.includes('BARRETT') ||
      w.includes('M82') ||
      w.includes('.338') ||
      w.includes('SNIPER') ||
      w.includes('SLUG') ||
      w.includes('CROSSBOW');
    let breakChance = 0;
    let breakTier = 'LIMB_BREAK';
    if (hz === 'head' || hitMeta?.isHeadshot) {
      breakChance = isHeavyBallistic || rawDmg >= 85 ? 0.92 : 0.80;
      breakTier = isHeavyBallistic || rawDmg >= 85 ? 'HEAD_SHATTER' : 'HEADSHOT_FATAL';
    } else if (hz === 'thorax' && isHeavyBallistic && (rawDmg >= 82 || overkill >= 24)) {
      breakChance = 0.52;
      breakTier = 'THORAX_SHATTER';
    } else if (hz === 'thorax' && hitMeta?.wasAlreadyBroken && overkill >= 25) {
      breakChance = 0.48;
      breakTier = 'VITAL_BREAK';
    } else if (hitMeta?.limbBroken && (isHeavyBallistic || overkill >= 42)) {
      breakChance = 0.35;
      breakTier = 'LIMB_SHATTER';
    }
    if (breakChance > 0) {
      const roll = rng();
      const jitter = rng();
      return {
        beyondRescue: roll < breakChance,
        chance: breakChance,
        hSpeed: 2.4 + jitter * 1.8,
        upSpeed: 1.4 + jitter * 1.0,
        tier: breakTier
      };
    }
  }

  return { beyondRescue: false, chance: 0, hSpeed: 0, upSpeed: 0, tier: 'REVIVABLE' };
}
