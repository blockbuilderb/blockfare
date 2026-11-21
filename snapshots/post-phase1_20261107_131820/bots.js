import * as THREE from '../vendor/three.module.js';
import { TEXTURES } from './textures.js?v=35';
import { VOXEL_SIZE } from './world.js?v=35';
import { sound } from './audio.js?v=35';
import { BOT, FORMATION } from './config.js?v=35';

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

export const SQUAD_DEFS = [
  { id: 'ALPHA', short: 'ALP', specialty: 'ASSAULT & BREACH', defaultFlag: 2 },
  { id: 'BRAVO', short: 'BRV', specialty: 'ARMOR SQUAD (TANKS & IFVs)', defaultFlag: 0, isArmorSquad: true },
  { id: 'CHARLIE', short: 'CHR', specialty: 'ANTI-ARMOR AT', defaultFlag: 1 },
  { id: 'DELTA', short: 'DLT', specialty: 'TRAUMA MEDICS', defaultFlag: 3 },
  { id: 'ECHO', short: 'ECH', specialty: 'RECON & FLANK', defaultFlag: 4 }
];

export function createSoldierMesh(team = 'US', role = 'ASSAULT', commandRank = 'MEMBER') {
  const root = new THREE.Group();

  const vestColor = team === 'US' ? 0x263849 : 0x452d25;
  const helmetColor = team === 'US' ? 0x2980b9 : 0xc0392b;
  const pouchColor = team === 'US' ? 0x1c2a38 : 0x33201a;
  const skinColor = 0xe0b899;

  const uniformMat = new THREE.MeshStandardMaterial({
    map: team === 'US' ? TEXTURES.camoUS : TEXTURES.camoRU,
    roughness: 0.85
  });
  const vestMat = new THREE.MeshStandardMaterial({ color: vestColor, roughness: 0.8, flatShading: true });
  const pouchMat = new THREE.MeshStandardMaterial({ color: pouchColor, roughness: 0.85, flatShading: true });
  const helmetMat = new THREE.MeshStandardMaterial({ color: helmetColor, roughness: 0.65, flatShading: true });
  const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.8, flatShading: true });
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x1e2226, roughness: 0.55, flatShading: true });
  const bootMat = new THREE.MeshStandardMaterial({ color: 0x1b1e21, roughness: 0.9 });

  // =========================================================================
  // 1. ARTICULATED PELVIS & MULTI-JOINT LEGS (HIP -> THIGH -> KNEE -> SHIN -> BOOT)
  // =========================================================================
  const pelvisGroup = new THREE.Group();
  pelvisGroup.position.set(0, 0.78, 0);

  const beltMesh = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.12, 0.32), pouchMat);
  beltMesh.position.set(0, -0.02, 0);
  pelvisGroup.add(beltMesh);

  const thighGeo = new THREE.BoxGeometry(0.22, 0.36, 0.22);
  const kneePadGeo = new THREE.BoxGeometry(0.23, 0.1, 0.06);
  const shinGeo = new THREE.BoxGeometry(0.2, 0.34, 0.2);
  const bootGeo = new THREE.BoxGeometry(0.22, 0.14, 0.29);

  // Left Leg Hierarchy (Hip Pivot -> Thigh -> Knee Pivot -> Shin + Boot)
  const leftLegPivot = new THREE.Group();
  leftLegPivot.position.set(-0.14, -0.04, 0);
  const leftThigh = new THREE.Mesh(thighGeo, uniformMat);
  leftThigh.position.y = -0.18;
  const leftKneePad = new THREE.Mesh(kneePadGeo, bootMat);
  leftKneePad.position.set(0, -0.34, 0.1);

  const leftShinPivot = new THREE.Group();
  leftShinPivot.position.set(0, -0.36, 0);
  const leftShin = new THREE.Mesh(shinGeo, uniformMat);
  leftShin.position.y = -0.17;
  const leftBoot = new THREE.Mesh(bootGeo, bootMat);
  leftBoot.position.set(0, -0.34, 0.03);
  leftShinPivot.add(leftShin, leftBoot);
  leftLegPivot.add(leftThigh, leftKneePad, leftShinPivot);

  // Right Leg Hierarchy (Hip Pivot -> Thigh -> Knee Pivot -> Shin + Boot)
  const rightLegPivot = new THREE.Group();
  rightLegPivot.position.set(0.14, -0.04, 0);
  const rightThigh = new THREE.Mesh(thighGeo, uniformMat);
  rightThigh.position.y = -0.18;
  const rightKneePad = new THREE.Mesh(kneePadGeo, bootMat);
  rightKneePad.position.set(0, -0.34, 0.1);

  const rightShinPivot = new THREE.Group();
  rightShinPivot.position.set(0, -0.36, 0);
  const rightShin = new THREE.Mesh(shinGeo, uniformMat);
  rightShin.position.y = -0.17;
  const rightBoot = new THREE.Mesh(bootGeo, bootMat);
  rightBoot.position.set(0, -0.34, 0.03);
  rightShinPivot.add(rightShin, rightBoot);
  rightLegPivot.add(rightThigh, rightKneePad, rightShinPivot);

  pelvisGroup.add(leftLegPivot, rightLegPivot);

  // =========================================================================
  // 2. ARTICULATED UPPER BODY (TORSO, PLATE CARRIER, POUCHES & CLASS BACKPACK)
  // =========================================================================
  const upperBody = new THREE.Group();
  upperBody.position.set(0, 0.78, 0);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.68, 0.28), uniformMat);
  torso.position.set(0, 0.34, 0);

  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.48, 0.35), vestMat);
  vest.position.set(0, 0.36, 0);
  vest.userData.isArmor = true;

  // 3 Front Magazine Pouches on Plate Carrier
  const magPouchGeo = new THREE.BoxGeometry(0.11, 0.18, 0.06);
  for (const px of [-0.14, 0, 0.14]) {
    const pouch = new THREE.Mesh(magPouchGeo, pouchMat);
    pouch.position.set(px, 0.28, 0.19);
    pouch.userData.isArmor = true;
    upperBody.add(pouch);
  }

  // Tactical Backpack differentiated by Soldier Class
  const packRole = typeof role === 'string' ? role.toUpperCase() : 'ASSAULT';
  const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 0.18), pouchMat);
  backpack.position.set(0, 0.37, -0.22);
  upperBody.add(backpack);

  let rpgBackTube = null;
  if (packRole === 'MEDIC') {
    const crossMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const cH = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.02), crossMat);
    const cV = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.02), crossMat);
    cH.position.set(0, 0.38, -0.315);
    cV.position.set(0, 0.38, -0.315);
    upperBody.add(cH, cV);
  } else if (packRole === 'ENGINEER') {
    rpgBackTube = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.78, 0.09), gunMat);
    const warheadMat = new THREE.MeshStandardMaterial({ color: 0x4b6542, roughness: 0.7, flatShading: true });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.24, 6), warheadMat);
    cone.position.set(0, 0.48, 0);
    rpgBackTube.add(tube, cone);
    rpgBackTube.position.set(0.16, 0.48, -0.26);
    rpgBackTube.rotation.z = -0.28;
    upperBody.add(rpgBackTube);
  } else if (packRole === 'RECON') {
    const antenna = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.55, 0.025), gunMat);
    antenna.position.set(-0.14, 0.78, -0.22);
    upperBody.add(antenna);
  }

  // Squad Leader [SL] & Force Commander [CMD] Long-Range Tactical Radio Whip Antenna
  if (commandRank === 'COMMANDER' || commandRank === 'SQUAD_LEADER') {
    const slAntenna = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.72, 0.03), gunMat);
    slAntenna.position.set(-0.15, 0.86, -0.24);
    upperBody.add(slAntenna);
    const tipColor = commandRank === 'COMMANDER' ? 0xf1c40f : 0x2ecc71;
    const tipMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.08, 0.06),
      new THREE.MeshBasicMaterial({ color: tipColor })
    );
    tipMesh.position.set(-0.15, 1.24, -0.24);
    upperBody.add(tipMesh);
  }

  // =========================================================================
  // 3. HEAD, BALACLAVA, TACTICAL GOGGLES & NVG-MOUNT HELMET
  // =========================================================================
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.86, 0);

  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.24), pouchMat);
  neck.position.set(0, -0.16, 0);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), skinMat);
  head.userData.isHead = true;

  const balaclava = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.17, 0.37), pouchMat);
  balaclava.position.set(0, -0.09, 0);
  balaclava.userData.isHead = true;

  const goggles = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.11, 0.06),
    new THREE.MeshBasicMaterial({ color: 0x161a20 })
  );
  goggles.position.set(0, 0.03, 0.17);

  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.21, 0.43), helmetMat);
  helmet.position.set(0, 0.14, 0);
  helmet.userData.isHead = true;
  helmet.userData.isHelmet = true;

  const nvgMount = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.05), gunMat);
  nvgMount.position.set(0, 0.14, 0.22);
  helmet.add(nvgMount);

  if (commandRank === 'COMMANDER' || commandRank === 'SQUAD_LEADER') {
    const bandColor = commandRank === 'COMMANDER' ? 0xf1c40f : 0x00d2d3;
    const rankBand = new THREE.Mesh(
      new THREE.BoxGeometry(0.445, 0.045, 0.445),
      new THREE.MeshBasicMaterial({ color: bandColor })
    );
    rankBand.position.set(0, 0.02, 0);
    helmet.add(rankBand);
  }

  headGroup.add(neck, head, balaclava, goggles, helmet);

  // =========================================================================
  // 4. ARTICULATED SHOULDERS, FOREARMS, RIFLE & 3D MUZZLE FLASH
  // =========================================================================
  const weaponRig = new THREE.Group();
  weaponRig.position.set(0, 0.48, 0);

  const upperArmGeo = new THREE.BoxGeometry(0.17, 0.32, 0.17);
  const forearmGeo = new THREE.BoxGeometry(0.15, 0.32, 0.15);

  const leftArm = new THREE.Group();
  leftArm.position.set(-0.31, 0.04, 0.04);
  const leftUpper = new THREE.Mesh(upperArmGeo, uniformMat);
  leftUpper.position.set(0.05, -0.1, 0.12);
  leftUpper.rotation.set(-0.75, 0.35, 0);
  const leftFore = new THREE.Mesh(forearmGeo, uniformMat);
  leftFore.position.set(0.18, -0.16, 0.34);
  leftFore.rotation.set(-1.35, 0.52, 0);
  leftArm.add(leftUpper, leftFore);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.31, 0.04, 0.04);
  const rightUpper = new THREE.Mesh(upperArmGeo, uniformMat);
  rightUpper.position.set(-0.04, -0.1, 0.08);
  rightUpper.rotation.set(-0.65, -0.15, 0);
  const rightFore = new THREE.Mesh(forearmGeo, uniformMat);
  rightFore.position.set(-0.09, -0.15, 0.26);
  rightFore.rotation.set(-1.3, -0.12, 0);
  rightArm.add(rightUpper, rightFore);

  const gunGroup = new THREE.Group();
  gunGroup.position.set(0.18, -0.1, 0.38);
  const gunReceiver = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.12, 0.48), gunMat);
  const gunBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.36), gunMat);
  gunBarrel.position.set(0, 0.02, 0.34);
  const gunMag = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.18, 0.09), pouchMat);
  gunMag.position.set(0, -0.12, 0.06);
  gunMag.rotation.x = 0.22;
  const gunOptic = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.11), gunMat);
  gunOptic.position.set(0, 0.09, 0.02);

  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffd32a,
    transparent: true,
    opacity: 0
  });
  const muzzleFlash = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), flashMat);
  muzzleFlash.position.set(0, 0.02, 0.56);

  gunGroup.add(gunReceiver, gunBarrel, gunMag, gunOptic, muzzleFlash);

  // Shoulder-fired RPG-7 Anti-Armor Launcher (active when Engineer engages enemy Tanks/Cars)
  const rpgShoulderGroup = new THREE.Group();
  rpgShoulderGroup.position.set(0.24, 0.12, 0.18);
  rpgShoulderGroup.visible = false;
  const rpgLauncherTube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.065, 1.05, 8),
    new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.75, flatShading: true })
  );
  rpgLauncherTube.rotation.x = Math.PI / 2;
  const rpgWarheadCone = new THREE.Mesh(
    new THREE.ConeGeometry(0.095, 0.32, 6),
    new THREE.MeshStandardMaterial({ color: 0x4b6542, roughness: 0.65, flatShading: true })
  );
  rpgWarheadCone.rotation.x = Math.PI / 2;
  rpgWarheadCone.position.set(0, 0, 0.62);
  rpgShoulderGroup.add(rpgLauncherTube, rpgWarheadCone);

  weaponRig.add(leftArm, rightArm, gunGroup, rpgShoulderGroup);
  upperBody.add(torso, vest, headGroup, weaponRig);

  // Team Marker placeholder (rendered via 3D HUD overlay)
  const markerGeo = new THREE.OctahedronGeometry(0.12, 0);
  const markerMat = new THREE.MeshBasicMaterial({
    color: team === 'US' ? 0x3498db : 0xe74c3c
  });
  const marker = new THREE.Mesh(markerGeo, markerMat);
  marker.position.set(0, 2.26, 0);
  marker.name = 'teamMarker';
  marker.visible = false;

  root.add(pelvisGroup, upperBody, marker);
  root.userData.parts = {
    pelvisGroup,
    leftLeg: leftLegPivot,
    rightLeg: rightLegPivot,
    leftShin: leftShinPivot,
    rightShin: rightShinPivot,
    leftArm,
    rightArm,
    upperBody,
    headGroup,
    weaponRig,
    gunGroup,
    rpgShoulderGroup,
    rpgBackTube,
    muzzleFlash,
    helmet,
    vest,
    marker
  };
  return root;
}

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
   *
   * Supported actions:
   * - `'OBJECTIVE'` (`flagId: 'A' | 'B' | 'C' | 'D' | 'E'`): Directs the squad(s) + friendly armor to capture/defend Objective `flagId`
   * - `'FOLLOW'`: Rallies the squad(s) to follow the player
   * - `'HOLD'`: Anchors the squad(s) to defend the current sector
   * - `'AUTO'`: Releases manual override back to autonomous AI Squad Leaders
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
      const helmColor = new THREE.Color(bot.team === 'US' ? 0x2980b9 : 0xc0392b);
      this.world.spawnDebris(bot.pos.clone().add(new THREE.Vector3(0, 1.85, 0)), helmColor, 2);
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

  clearBotRescueLinks(bot) {
    // If this bot was actively dragging or bandaging a casualty when the rescue ended/aborted,
    // require a physical weapon-re-equip transition to stow medical gear and unsling their rifle!
    if (bot.rescueState === 'DRAG' || bot.rescueState === 'REVIVE') {
      bot.weaponReadyTimer = Math.max(bot.weaponReadyTimer || 0, 1.45);
      bot.aimRaiseProgress = 0;
      bot.isCrouching = true;
      bot.crouchAmount = Math.max(bot.crouchAmount || 0, 0.9);
      bot.shootCooldown = Math.max(bot.shootCooldown || 0, 1.55);
      bot.transitionState = 'EQUIPPING_WEAPON';
    }
    if (bot.rescueTarget && bot.rescueTarget !== 'PLAYER') {
      if (bot.rescueTarget.rescuer === bot) {
        bot.rescueTarget.rescuer = null;
      }
    }
    bot.rescueTarget = null;
    bot.rescueState = null;
    bot.rescueTimer = 0;
    bot.assessTimer = 0;
    bot.smokePoppedForRescue = false;
    bot.assessedLogged = false;
    bot.assessThreatEnemy = null;
    if (bot.rescuer) {
      if (bot.rescuer.rescueState === 'DRAG' || bot.rescuer.rescueState === 'REVIVE') {
        bot.rescuer.weaponReadyTimer = Math.max(bot.rescuer.weaponReadyTimer || 0, 1.45);
        bot.rescuer.aimRaiseProgress = 0;
        bot.rescuer.isCrouching = true;
        bot.rescuer.crouchAmount = Math.max(bot.rescuer.crouchAmount || 0, 0.9);
        bot.rescuer.shootCooldown = Math.max(bot.rescuer.shootCooldown || 0, 1.55);
        bot.rescuer.transitionState = 'EQUIPPING_WEAPON';
      }
      bot.rescuer.rescueTarget = null;
      bot.rescuer.rescueState = null;
      bot.rescuer.assessThreatEnemy = null;
      bot.rescuer = null;
    }
  }

  /**
   * Multi-Ray "Vision Tube" Sightline Check:
   * Prevents NPCs from seeing or tracking targets through solid buildings, diagonal block seams,
   * active smoke screens, or tiny thin gaps (< 0.55m wide) between structures.
   */
  hasClearSightline(bot, targetPos, checkFov = true) {
    const eyeY = bot.pos.y + (bot.isCrouching ? 1.12 : 1.52);
    const eyePos = new THREE.Vector3(bot.pos.x, eyeY, bot.pos.z);
    const chestPos = new THREE.Vector3(targetPos.x, targetPos.y + 1.15, targetPos.z);

    const dx = chestPos.x - eyePos.x;
    const dy = chestPos.y - eyePos.y;
    const dz = chestPos.z - eyePos.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 1.4) return true;

    // 1. Field-of-View (150° cone) check beyond 14m unless alerted by damage/suppression
    if (checkFov && dist > BOT.FOV_CHECK_BEYOND && (bot.flinchTimer || 0) <= 0 && (bot.suppressionLevel || 0) < 0.25) {
      const horizDist = Math.hypot(dx, dz);
      if (horizDist > 0.1) {
        const fwdX = Math.sin(bot.yaw);
        const fwdZ = Math.cos(bot.yaw);
        const dot = (dx * fwdX + dz * fwdZ) / horizDist;
        if (dot < BOT.FOV_BEHIND_DOT) return false;
      }
    }

    // 2. Tactical Smoke Screen occlusion check
    if (this.smokeClouds && this.smokeClouds.length > 0) {
      for (let i = 0; i < this.smokeClouds.length; i++) {
        const sc = this.smokeClouds[i];
        if (!sc.group) continue;
        const sp = sc.group.position;
        const sx = sp.x - eyePos.x;
        const sy = sp.y + 0.8 - eyePos.y;
        const sz = sp.z - eyePos.z;
        const proj = (sx * dx + sy * dy + sz * dz) / (dist * dist);
        if (proj > 0.05 && proj < 0.95) {
          const cx = eyePos.x + dx * proj - sp.x;
          const cy = eyePos.y + dy * proj - (sp.y + 0.8);
          const cz = eyePos.z + dz * proj - sp.z;
          if (cx * cx + cy * cy + cz * cz < 3.8 * 3.8) {
            return false;
          }
        }
      }
    }

    const dir = new THREE.Vector3(dx / dist, dy / dist, dz / dist);
    const rayLen = Math.max(0.5, dist - 0.55);

    // 3. Center thick ray (0.22m radius padding blocks hairline cracks & diagonal wall seams)
    const centerHit = this.world.raycastVoxel(eyePos, dir, rayLen, 0.22);
    if (centerHit) return false;

    // 4. Lateral "Vision Tube" shoulder offset rays (±0.35m) when firing at close/mid range
    if (!checkFov && dist > 5.0 && dist < 38.0) {
      const horizLen = Math.hypot(dx, dz);
      if (horizLen > 0.1) {
        const perpX = (-dz / horizLen) * 0.35;
        const perpZ = (dx / horizLen) * 0.35;
        const leftOrigin = new THREE.Vector3(eyePos.x + perpX, eyePos.y, eyePos.z + perpZ);
        const rightOrigin = new THREE.Vector3(eyePos.x - perpX, eyePos.y, eyePos.z - perpZ);
        const leftBlocked = Boolean(this.world.raycastVoxel(leftOrigin, dir, rayLen, 0));
        const rightBlocked = Boolean(this.world.raycastVoxel(rightOrigin, dir, rayLen, 0));
        if (leftBlocked && rightBlocked) {
          return false;
        }
      }
    }

    return true;
  }

  canBotSeeTarget(bot, targetKey, targetPos, checkFov = true) {
    if (!bot._losCache) bot._losCache = new Map();
    const now = performance.now();
    const cached = bot._losCache.get(targetKey);
    if (cached && now < cached.exp) {
      return cached.vis;
    }
    // Cap uncached raycasts per bot per frame to prevent frame-time spikes across 80 bots
    if ((bot._raycastsThisFrame || 0) >= 2) {
      return cached ? cached.vis : false;
    }
    bot._raycastsThisFrame = (bot._raycastsThisFrame || 0) + 1;
    const vis = this.hasClearSightline(bot, targetPos, checkFov);
    bot._losCache.set(targetKey, { vis, exp: now + 260 + Math.random() * 160 });
    return vis;
  }

  /**
   * Scans for immediate enemy threats near either the rescuing Medic (`medicRange`)
   * or the downed casualty (`casualtyRange`). Medics use this to assess the situation
   * and neutralize/suppress nearby threats before rushing out to drag/revive.
   */
  findImmediateRescueThreat(
    bot,
    targetPos,
    player,
    medicRange = BOT.RESCUE_THREAT_MEDIC_ASSESS,
    casualtyRange = BOT.RESCUE_THREAT_CASUALTY_ASSESS
  ) {
    const medicRangeSq = medicRange * medicRange;
    const casualtyRangeSq = casualtyRange * casualtyRange;
    let bestThreat = null;
    let bestScoreSq = Infinity;

    if (!player.dead && !player.downed && player.team !== bot.team) {
      const dMedicSq = bot.pos.distanceToSquared(player.pos);
      const dCasSq = targetPos.distanceToSquared(player.pos);
      if (
        (dMedicSq <= medicRangeSq || dCasSq <= casualtyRangeSq) &&
        this.canBotSeeTarget(bot, 'PLAYER', player.pos, false)
      ) {
        bestScoreSq = Math.min(dMedicSq, dCasSq);
        if (player.activeVehicle && !player.activeVehicle.dead) {
          bestThreat = {
            isVehicle: true,
            pos: player.activeVehicle.pos,
            unit: player.activeVehicle,
            distSq: dMedicSq
          };
        } else {
          bestThreat = { isPlayer: true, pos: player.pos, unit: player, distSq: dMedicSq };
        }
      }
    }

    for (let i = 0; i < this.bots.length; i++) {
      const other = this.bots[i];
      if (other.dead || other.downed || other.drivingVehicle || other.team === bot.team) continue;
      const dMedicSq = bot.pos.distanceToSquared(other.pos);
      const dCasSq = targetPos.distanceToSquared(other.pos);
      if (dMedicSq <= medicRangeSq || dCasSq <= casualtyRangeSq) {
        const minSq = Math.min(dMedicSq, dCasSq);
        if (minSq < bestScoreSq && this.canBotSeeTarget(bot, other.id, other.pos, false)) {
          bestScoreSq = minSq;
          bestThreat = { isPlayer: false, pos: other.pos, unit: other, distSq: dMedicSq };
        }
      }
    }

    return bestThreat;
  }

  /**
   * Spawns a 3D tactical M18 smoke screen over a downed casualty when a Medic assesses
   * an active enemy threat, providing visual concealment during threat suppression & drag!
   */
  spawnRescueSmoke(pos) {
    if (this.smokeClouds.length > BOT.SMOKE_MAX_CLOUDS) return;
    const group = new THREE.Group();
    group.position.set(pos.x, this.world.getGroundHeightAt(pos.x, pos.z) + 0.4, pos.z);
    const puffGeo = new THREE.BoxGeometry(1.5, 1.3, 1.5);
    const puffMat = new THREE.MeshLambertMaterial({
      color: 0xdce3e8,
      transparent: true,
      opacity: 0.68
    });

    const puffs = [];
    for (let i = 0; i < 7; i++) {
      const mesh = new THREE.Mesh(puffGeo, puffMat.clone());
      const angle = (i / 7) * Math.PI * 2;
      const r = i === 0 ? 0 : 0.9 + (i % 2) * 0.55;
      mesh.position.set(Math.cos(angle) * r, 0.4 + (i % 3) * 0.45, Math.sin(angle) * r);
      mesh.rotation.set(Math.random() * 0.5, Math.random() * Math.PI, Math.random() * 0.5);
      group.add(mesh);
      puffs.push(mesh);
    }

    this.scene.add(group);
    this.smokeClouds.push({ group, puffs, life: BOT.SMOKE_LIFE, maxLife: BOT.SMOKE_LIFE });
  }

  reviveBot(bot) {
    if (!bot || (!bot.downed && !bot.dead)) return false;
    this.clearBotRescueLinks(bot);
    bot.downed = false;
    bot.dead = false;
    bot.hp = BOT.REVIVE_HP;
    bot.bleedOutTimer = 0;
    bot.mesh.visible = true;
    // Do NOT snap upright or fire immediately! Start from lying flat (-PI/2) and transition
    // through pushing up onto one knee (postReviveTimer: 2.2s) -> grabbing rifle (weaponReadyTimer: 1.85s) -> raising aim!
    bot.postReviveTimer = BOT.POST_REVIVE_TIMER;
    bot.standUpProgress = 0.0;
    bot.weaponReadyTimer = BOT.POST_REVIVE_WEAPON_READY;
    bot.aimRaiseProgress = 0.0;
    bot.transitionState = 'GETTING_UP';
    bot.isCrouching = true;
    bot.crouchAmount = 1.0;
    bot.velX = 0;
    bot.velZ = 0;
    bot.shootCooldown = Math.max(bot.shootCooldown || 0, 1.95);
    bot.rpgCooldown = Math.max(bot.rpgCooldown || 0, 2.2);
    bot.mesh.rotation.x = -Math.PI / 2;
    bot.mesh.rotation.z = 0;
    if (this.onTelemetryEvent) {
      this.onTelemetryEvent('NPC_POST_REVIVE_TRANSITION_START', {
        npc: bot.name,
        role: bot.role,
        team: bot.team,
        postReviveTimer: bot.postReviveTimer,
        weaponReadyTimer: bot.weaponReadyTimer
      });
    }
    return true;
  }

  /**
   * Computes a safer cover position 5m-8m away from the killzone (behind nearby voxel walls/sandbags
   * or toward friendly territory) so rescuers physically drag fallen comrades to safety before reviving.
   */
  computeSafeDragSpot(downedPos, team) {
    const retreatDirX = team === 'US' ? -1 : 1;
    let bestPos = new THREE.Vector3(
      downedPos.x + retreatDirX * 5.5,
      downedPos.y,
      downedPos.z + (Math.random() - 0.5) * 3.0
    );
    let bestScore = -999;

    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      const dist = 4.8 + (i % 2) * 2.2;
      const cx = downedPos.x + Math.cos(angle) * dist;
      const cz = downedPos.z + Math.sin(angle) * dist;
      const cy = this.world.getGroundHeightAt(cx, cz);

      if (this.isPointBlocked(cx, cy, cz)) continue;

      // Score higher if retreating toward friendly side AND if adjacent to a protective wall/sandbag voxel
      let score = Math.cos(angle) * retreatDirX * 2.5;
      const g = this.world.worldToGrid(cx, cy + 0.8, cz);
      const adjDirs = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ];
      for (const [dx, dz] of adjDirs) {
        if (this.world.voxels.has(this.world.key(g.gx + dx, g.gy, g.gz + dz))) {
          score += 4.0; // Next to solid cover!
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestPos.set(cx, cy, cz);
      }
    }

    bestPos.y = this.world.getGroundHeightAt(bestPos.x, bestPos.z);
    return bestPos;
  }

  findNearestDownedFriendly(pos, team, maxDist = 3.8) {
    let best = null;
    let bestDistSq = maxDist * maxDist;
    for (const b of this.bots) {
      if (b.team !== team || !b.downed || b.dead) continue;
      const dSq = b.pos.distanceToSquared(pos);
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        best = b;
      }
    }
    return best;
  }

  spawnTracer(start, end, color = 0xffeaa7) {
    if (this.tracers.length > 90) return;
    const points = [start.clone(), end.clone()];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.85
    });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, life: 0.075 });
  }

  /**
   * Checks if a world position is blocked by waist/head-level voxels OR lies inside
   * a building/container footprint so bots steer cleanly around structures.
   */
  isPointBlocked(wx, wy, wz) {
    if (this.world.isInsideBuildingOrContainer && this.world.isInsideBuildingOrContainer(wx, wz, 1.15)) {
      return true;
    }
    const gWaist = this.world.worldToGrid(wx, wy + 0.75, wz);
    if (this.world.voxels.has(this.world.key(gWaist.gx, gWaist.gy, gWaist.gz))) return true;
    const gHead = this.world.worldToGrid(wx, wy + 1.75, wz);
    return this.world.voxels.has(this.world.key(gHead.gx, gHead.gy, gHead.gz));
  }

  update(dt, player, onKillFn, onTicketBleedFn, vehicleManager = null, onAwardXp = null) {
    // 1. Update Contested / Overrun Base states (Main Bases + Forward Flags A-E)
    this.updateContestedBases(player, onAwardXp);

    // 2. Update Bullet Tracers & 3D Medic Smoke Screens
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        t.line.material.dispose();
        this.tracers.splice(i, 1);
      }
    }

    for (let i = this.smokeClouds.length - 1; i >= 0; i--) {
      const sc = this.smokeClouds[i];
      sc.life -= dt;
      if (sc.life <= 0) {
        this.scene.remove(sc.group);
        for (const p of sc.puffs) {
          p.geometry.dispose();
          p.material.dispose();
        }
        this.smokeClouds.splice(i, 1);
      } else {
        const progress = 1 - sc.life / sc.maxLife;
        const scale = 1.0 + progress * 1.15;
        sc.group.scale.set(scale, 1.0 + progress * 0.7, scale);
        const fade = sc.life < 2.0 ? (sc.life / 2.0) * 0.65 : 0.65;
        for (const p of sc.puffs) {
          p.material.opacity = fade;
        }
      }
    }

    if (this.globalCommsCooldown > 0) {
      this.globalCommsCooldown = Math.max(0, this.globalCommsCooldown - dt);
    }

    for (let bIdx = 0; bIdx < this.bots.length; bIdx++) {
      const bot = this.bots[bIdx];
      bot._raycastsThisFrame = 0;
      const parts = bot.mesh.userData.parts;
      bot.inPlayerSquad = bot.team === player.team && bot.squad === (player.squad || 'ALPHA');

      if (bot.spottedTimer > 0) {
        bot.spottedTimer = Math.max(0, bot.spottedTimer - dt);
      }
      if (bot.speechBubbleTimer > 0) {
        bot.speechBubbleTimer = Math.max(0, bot.speechBubbleTimer - dt);
      }
      if (bot.chatCooldown > 0) {
        bot.chatCooldown = Math.max(0, bot.chatCooldown - dt);
      }
      if (bot.playerOrderTimer > 0) {
        bot.playerOrderTimer = Math.max(0, bot.playerOrderTimer - dt);
        if (bot.playerOrderTimer <= 0) {
          bot.playerOrderMode = null;
        }
      }

      // Suppression decay (Squad-style)
      if (bot.suppressionLevel > 0) {
        bot.suppressionLevel = Math.max(0, bot.suppressionLevel - 0.5 * dt);
      }

      if (bot.dead) {
        if (bot.drivingVehicle) {
          if (bot.drivingVehicle.npcDriver === bot) bot.drivingVehicle.npcDriver = null;
          bot.drivingVehicle = null;
        }
        bot.respawnTimer -= dt;
        if (bot.respawnTimer <= 0) {
          // Contested Base Respawn Lockout Check:
          // If ALL of this faction's bases (Main Base + Forward Flags) are currently contested/overrun,
          // hold dead soldiers in respawn lockout so they NEVER spawn on top of attacking players!
          if (!this.canTeamRespawn(bot.team)) {
            bot.respawnTimer = 1.5;
            if (this.onTelemetryEvent && Math.random() < 0.15) {
              this.onTelemetryEvent('CONTESTED_SPAWN_BLOCKED', {
                team: bot.team,
                squad: bot.squad,
                blockedBase: 'ALL_BASES_CONTESTED',
                redirectedTo: 'LOCKED_OUT'
              });
            }
            continue;
          }

          if (this.canTeamAffordRespawn && !this.canTeamAffordRespawn(bot.team, 1)) {
            bot.respawnTimer = 1.5;
            continue;
          }

          bot.dead = false;
          bot.downed = false;
          bot.hp = BOT.HP;
          bot.hasHelmet = true;
          bot.armorHp = BOT.ARMOR_HP;
          bot.postReviveTimer = 0;
          bot.standUpProgress = 1.0;
          bot.weaponReadyTimer = 0;
          bot.aimRaiseProgress = 0.25;
          bot.transitionState = 'ACTIVE';
          parts.helmet.visible = true;
          bot.mesh.rotation.set(0, bot.yaw, 0);
          const spawnInfo = this.pickSpawnPosition(bot.team, bot.squad, true);
          bot.pos.copy(spawnInfo.pos);
          bot.lastSpawnSource = spawnInfo.source;
          bot.velX = 0;
          bot.velZ = 0;
          bot.velY = 0;
          bot.stuckTimer = 0;
          bot.stuckCount = 0;
          if (bot.lastProgressPos) bot.lastProgressPos.copy(bot.pos);
          // Inherit active Squad Leader / Force Commander order on respawn
          const activeOrder =
            (this.squadOrders[bot.team] && this.squadOrders[bot.team][bot.squad]) ||
            this.commanderOrders[bot.team];
          if (activeOrder && activeOrder.action === 'OBJECTIVE' && activeOrder.flagIndex >= 0) {
            bot.playerOrderMode = 'OBJECTIVE';
            bot.playerOrderFlagIndex = activeOrder.flagIndex;
            bot.targetFlagIndex = activeOrder.flagIndex;
            bot.playerOrderTimer = Math.max(bot.playerOrderTimer || 0, 90);
          }
          bot.mesh.visible = true;
          if (onTicketBleedFn) onTicketBleedFn(bot.team, 1, 'SOLDIER', bot.name);
        }
        continue;
      }

      // If this NPC is currently inside & driving a Tank, APC, or Humvee, keep their
      // soldier mesh hidden inside the hull until they exit or the vehicle is destroyed.
      if (bot.drivingVehicle) {
        if (bot.drivingVehicle.dead || bot.drivingVehicle.npcDriver !== bot) {
          bot.drivingVehicle = null;
          bot.mesh.visible = true;
        } else {
          bot.pos.copy(bot.drivingVehicle.pos);
          bot.mesh.visible = false;
          continue;
        }
      }

      // Downed / Wounded Crawling Animation on Ground
      if (bot.downed) {
        // Pause bleed-out while a Medic, Teammate, or Player is actively dragging/reviving this soldier!
        const beingSavedByBot =
          bot.rescuer &&
          !bot.rescuer.dead &&
          !bot.rescuer.downed &&
          (bot.rescuer.rescueState === 'DRAG' || bot.rescuer.rescueState === 'REVIVE');
        const beingSavedByPlayer =
          player.draggedBot === bot ||
          (player.reviveTargetBot === bot && player.keys && player.keys['KeyF']);
        if (!beingSavedByBot && !beingSavedByPlayer) {
          bot.bleedOutTimer -= dt;
        }

        bot.animPhase += dt * 2.5;
        const gY = this.world.getGroundHeightAt(bot.pos.x, bot.pos.z);
        bot.pos.y = gY + 0.22;
        bot.mesh.rotation.x = -Math.PI / 2;
        parts.pelvisGroup.rotation.y = 0;
        parts.upperBody.position.y = 0.78;
        parts.upperBody.rotation.set(0.15, Math.sin(bot.animPhase) * 0.12, 0);
        parts.headGroup.rotation.set(0.35, Math.sin(bot.animPhase * 0.8) * 0.35, 0);
        parts.leftLeg.rotation.x = Math.sin(bot.animPhase) * 0.25;
        parts.rightLeg.rotation.x = -Math.sin(bot.animPhase) * 0.25;
        parts.leftShin.rotation.x = 0.45;
        parts.rightShin.rotation.x = 0.35;
        if (parts.muzzleFlash) parts.muzzleFlash.material.opacity = 0;

        if (bot.bleedOutTimer <= 0) {
          this.clearBotRescueLinks(bot);
          bot.downed = false;
          bot.dead = true;
          bot.respawnTimer = BOT.RESPAWN_TIMER;
          bot.mesh.visible = false;
          bot.mesh.rotation.x = 0;
        }
        continue;
      }

      // =======================================================================
      // SMARTER TACTICAL MEDIC RESCUE:
      // 1. ASSESS_THREAT (Scan for enemies within 36m/32m -> Pop Smoke -> Crouch & Suppress/Clear Threat!)
      // 2. APPROACH (Advance in low crouch under smoke cover)
      // 3. DRAG (Pull wounded soldier behind solid voxel cover)
      // 4. REVIVE (Kneel & bandage to 80 HP)
      // =======================================================================
      bot.assessThreatEnemy = null;

      // Validate existing rescue target
      if (bot.rescueTarget) {
        if (bot.rescueTarget === 'PLAYER') {
          if (!player.downed || player.dead) {
            bot.rescueTarget = null;
            bot.rescueState = null;
          }
        } else if (
          bot.rescueTarget.dead ||
          !bot.rescueTarget.downed ||
          (bot.rescueTarget.rescuer && bot.rescueTarget.rescuer !== bot) ||
          player.reviveTargetBot === bot.rescueTarget
        ) {
          this.clearBotRescueLinks(bot);
        }
      }

      // Look for a nearby downed friendly comrade (Player or AI Soldier) to rescue
      if (!bot.rescueTarget && (bot.postReviveTimer || 0) <= 0) {
        const isMedic = bot.role === 'MEDIC';
        const maxRescueRange = isMedic ? BOT.RESCUE_RANGE_MEDIC : BOT.RESCUE_RANGE_OTHER;
        let bestTarget = null;
        let bestDistSq = maxRescueRange * maxRescueRange;

        if (
          player.downed &&
          !player.dead &&
          bot.team === player.team &&
          (isMedic || bot.inPlayerSquad)
        ) {
          const dpSq = bot.pos.distanceToSquared(player.pos);
          if (dpSq < bestDistSq) {
            bestDistSq = dpSq;
            bestTarget = 'PLAYER';
          }
        }

        for (let i = 0; i < this.bots.length; i++) {
          const ally = this.bots[i];
          if (ally === bot || ally.team !== bot.team || !ally.downed || ally.dead) continue;
          // Dedicated Medics can take over a casualty claim from a non-medic who hasn't started dragging/reviving yet
          if (
            ally.rescuer &&
            ally.rescuer !== bot &&
            !(isMedic && ally.rescuer.role !== 'MEDIC' && ally.rescuer.rescueState === 'ASSESS_THREAT')
          ) {
            continue;
          }
          if (player.reviveTargetBot === ally) continue;
          const dSq = bot.pos.distanceToSquared(ally.pos);
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            bestTarget = ally;
          }
        }

        if (bestTarget) {
          if (bestTarget !== 'PLAYER' && bestTarget.rescuer && bestTarget.rescuer !== bot) {
            bestTarget.rescuer.rescueTarget = null;
            bestTarget.rescuer.rescueState = null;
          }
          bot.rescueTarget = bestTarget;
          // Always start by ASSESSING the combat situation around the casualty first!
          bot.rescueState = 'ASSESS_THREAT';
          bot.assessTimer = isMedic ? 1.45 : 1.1;
          bot.smokePoppedForRescue = false;
          bot.assessedLogged = false;
          bot.rescueTimer = 0;
          if (bestTarget !== 'PLAYER') {
            bestTarget.rescuer = bot;
          }
        }
      }

      // Execute Active Rescue State Machine (ASSESS_THREAT -> APPROACH -> DRAG -> REVIVE)
      if (bot.rescueTarget) {
        const targetPos =
          bot.rescueTarget === 'PLAYER' ? player.pos : bot.rescueTarget.pos;
        const targetName =
          bot.rescueTarget === 'PLAYER' ? player.name : bot.rescueTarget.name;
        const distToDowned = Math.hypot(targetPos.x - bot.pos.x, targetPos.z - bot.pos.z);

        // If an enemy rushes within point-blank 10m while approaching (and no smoke screen is up),
        // pause the approach and switch back to ASSESS_THREAT to defend themselves & the casualty!
        if (bot.rescueState === 'APPROACH' && !bot.smokePoppedForRescue) {
          const closeAmbush = this.findImmediateRescueThreat(
            bot,
            targetPos,
            player,
            BOT.RESCUE_THREAT_AMBUSH_MEDIC,
            BOT.RESCUE_THREAT_AMBUSH_CASUALTY
          );
          if (closeAmbush) {
            bot.rescueState = 'ASSESS_THREAT';
            bot.assessTimer = 1.15;
            bot.smokePoppedForRescue = true; // Prevent infinite re-assess loop
            if (bot.role === 'MEDIC') {
              this.spawnRescueSmoke(targetPos);
            }
          }
        }

        if (bot.rescueState === 'ASSESS_THREAT') {
          bot.assessTimer -= dt;
          const immediateThreat = this.findImmediateRescueThreat(
            bot,
            targetPos,
            player,
            BOT.RESCUE_THREAT_MEDIC_REASSESS,
            BOT.RESCUE_THREAT_CASUALTY_REASSESS
          );

          if (!immediateThreat) {
            // Sector is clear! Transition to APPROACH immediately!
            if (!bot.assessedLogged) {
              bot.assessedLogged = true;
              this.emitBotComms(
                bot,
                player,
                `Hold on ${targetName}! Sector clear, moving in to get you!`,
                'MEDIC',
                false
              );
              if (this.onTelemetryEvent && bot.role === 'MEDIC') {
                this.onTelemetryEvent('MEDIC_ASSESS_CLEAR', {
                  medic: bot.name,
                  team: bot.team,
                  casualty: targetName,
                  action: 'SECTOR_CLEAR_ADVANCING'
                });
              }
            }
            bot.rescueState = 'APPROACH';
          } else {
            // Active enemy threat detected guarding the casualty or near the Medic!
            // 1) Pop tactical smoke screen over the casualty to blind the enemy
            if (bot.role === 'MEDIC' && !bot.smokePoppedForRescue) {
              bot.smokePoppedForRescue = true;
              this.spawnRescueSmoke(targetPos);
            }
            if (!bot.assessedLogged) {
              bot.assessedLogged = true;
              const threatName = immediateThreat.unit ? immediateThreat.unit.name : 'ENEMY';
              this.emitBotComms(
                bot,
                player,
                `Hang tight ${targetName}! Popping smoke & suppressing shooter first!`,
                'MEDIC',
                true
              );
              if (this.onTelemetryEvent && bot.role === 'MEDIC') {
                this.onTelemetryEvent('MEDIC_ASSESS_THREAT', {
                  medic: bot.name,
                  team: bot.team,
                  casualty: targetName,
                  threat: threatName,
                  threatDistM: Math.round(Math.sqrt(immediateThreat.distSq || 100)),
                  smokeDeployed: bot.smokePoppedForRescue,
                  action: 'ENGAGING_THREAT_BEFORE_RESCUE'
                });
              }
            }

            // Once we have assessed/suppressed the threat for the assessment window and no enemy
            // is within point-blank 12m range, advance in a low tactical crouch to grab the ally!
            const pointBlankThreat = this.findImmediateRescueThreat(
              bot,
              targetPos,
              player,
              BOT.RESCUE_THREAT_POINTBLANK_MEDIC,
              BOT.RESCUE_THREAT_POINTBLANK_CASUALTY
            );
            if (bot.assessTimer <= 0 && (!pointBlankThreat || bot.smokePoppedForRescue)) {
              bot.rescueState = 'APPROACH';
            } else {
              // Hold cover crouch and engage/suppress the threat first!
              bot.isCrouching = true;
              bot.tactic = 'ANCHOR_CROUCH';
              bot.assessThreatEnemy = immediateThreat;
            }
          }
        }

        if (bot.rescueState === 'APPROACH') {
          if (distToDowned <= 2.2) {
            // Reached the fallen comrade! Compute a safe cover spot and begin dragging them!
            bot.rescueState = 'DRAG';
            bot.rescueTimer = BOT.DRAG_TIMER; // Drag for up to 1.75s toward cover
            bot.dragGoalPos.copy(this.computeSafeDragSpot(targetPos, bot.team));
            this.emitBotComms(
              bot,
              player,
              `Got your vest ${targetName}, dragging you behind cover!`,
              'MEDIC',
              false
            );
          } else {
            // Move toward fallen comrade (in a low tactical crouch if enemies are within 48m!)
            const distantThreat = this.findImmediateRescueThreat(
              bot,
              targetPos,
              player,
              BOT.RESCUE_THREAT_APPROACH_MEDIC,
              BOT.RESCUE_THREAT_APPROACH_CASUALTY
            );
            bot.isCrouching = Boolean(distantThreat);
            const toDowned = new THREE.Vector3(
              targetPos.x - bot.pos.x,
              0,
              targetPos.z - bot.pos.z
            ).normalize();
            const spd = distantThreat ? BOT.SPEED_APPROACH_SLOW : BOT.SPEED_APPROACH_FAST;
            const nx = bot.pos.x + toDowned.x * spd * dt;
            const nz = bot.pos.z + toDowned.z * spd * dt;
            if (!this.isPointBlocked(nx, bot.pos.y, nz)) {
              bot.pos.x = nx;
              bot.pos.z = nz;
            } else {
              bot.pos.x += -toDowned.z * spd * dt;
              bot.pos.z += toDowned.x * spd * dt;
            }
            bot.pos.y = this.world.getGroundHeightAt(bot.pos.x, bot.pos.z);
            bot.yaw = Math.atan2(toDowned.x, toDowned.z);
            bot.mesh.rotation.y = bot.yaw;

            // Low tactical approach animation
            const crouchOffset = distantThreat ? 0.16 : 0;
            bot.animPhase += dt * 15;
            parts.pelvisGroup.position.y =
              0.78 - crouchOffset + Math.abs(Math.sin(bot.animPhase)) * 0.055;
            parts.upperBody.position.y = parts.pelvisGroup.position.y;
            parts.upperBody.rotation.set(
              (distantThreat ? 0.42 : 0.28),
              Math.sin(bot.animPhase) * 0.1,
              0
            );
            parts.leftLeg.rotation.x = Math.sin(bot.animPhase) * 0.82 - crouchOffset * 1.4;
            parts.rightLeg.rotation.x = -Math.sin(bot.animPhase) * 0.82 - crouchOffset * 1.4;
            parts.leftShin.rotation.x = Math.max(0, -Math.cos(bot.animPhase) * 1.0) + crouchOffset * 2.2;
            parts.rightShin.rotation.x = Math.max(0, Math.cos(bot.animPhase) * 1.0) + crouchOffset * 2.2;
            continue;
          }
        }

        if (bot.rescueState === 'DRAG') {
          bot.rescueTimer -= dt;
          const toSafe = new THREE.Vector3(
            bot.dragGoalPos.x - bot.pos.x,
            0,
            bot.dragGoalPos.z - bot.pos.z
          );
          const distToSafe = toSafe.length();

          if (bot.rescueTimer <= 0 || distToSafe < 0.9) {
            // Arrived behind cover! Transition to kneeling revive!
            bot.rescueState = 'REVIVE';
            bot.rescueTimer = bot.role === 'MEDIC' ? BOT.MEDIC_REVIVE_TIME : BOT.NON_MEDIC_REVIVE_TIME;
          } else {
            toSafe.normalize();
            const dragSpeed = BOT.DRAG_SPEED;
            const nx = bot.pos.x + toSafe.x * dragSpeed * dt;
            const nz = bot.pos.z + toSafe.z * dragSpeed * dt;
            if (!this.isPointBlocked(nx, bot.pos.y, nz)) {
              bot.pos.x = nx;
              bot.pos.z = nz;
              bot.pos.y = this.world.getGroundHeightAt(bot.pos.x, bot.pos.z);

              // Pull the wounded soldier along the ground right in front of the rescuer!
              const dragTrailX = bot.pos.x - toSafe.x * 1.05;
              const dragTrailZ = bot.pos.z - toSafe.z * 1.05;
              const dragTrailY = this.world.getGroundHeightAt(dragTrailX, dragTrailZ);
              if (bot.rescueTarget === 'PLAYER') {
                player.pos.set(dragTrailX, dragTrailY, dragTrailZ);
                player.downedTimer = Math.max(player.downedTimer, 8.0);
              } else {
                bot.rescueTarget.pos.set(dragTrailX, dragTrailY + 0.22, dragTrailZ);
                bot.rescueTarget.mesh.rotation.y = Math.atan2(toSafe.x, toSafe.z);
              }
            } else {
              // Reached a wall/cover block — immediately start reviving right behind it!
              bot.rescueState = 'REVIVE';
              bot.rescueTimer = bot.role === 'MEDIC' ? BOT.MEDIC_REVIVE_TIME : BOT.NON_MEDIC_REVIVE_TIME;
            }

            // Rescuer faces the wounded soldier while stepping backward pulling their vest!
            bot.yaw = Math.atan2(-toSafe.x, -toSafe.z);
            bot.mesh.rotation.y = bot.yaw;
            bot.animPhase -= dt * 9.0; // Backward stride cycle
            parts.pelvisGroup.position.y = 0.62 + Math.abs(Math.sin(bot.animPhase)) * 0.035;
            parts.upperBody.position.y = parts.pelvisGroup.position.y;
            parts.upperBody.rotation.set(0.46, 0, 0);
            parts.headGroup.rotation.set(0.25, 0, 0);
            parts.weaponRig.rotation.set(0.68, 0, 0);
            parts.leftLeg.rotation.x = Math.sin(bot.animPhase) * 0.55 - 0.3;
            parts.rightLeg.rotation.x = -Math.sin(bot.animPhase) * 0.55 - 0.3;
            parts.leftShin.rotation.x = 0.65;
            parts.rightShin.rotation.x = 0.65;
            continue;
          }
        }

        if (bot.rescueState === 'REVIVE') {
          bot.rescueTimer -= dt;
          bot.animPhase += dt * 12;
          if (bot.rescueTarget !== 'PLAYER' && bot.rescueTarget.bleedOutTimer !== undefined) {
            bot.rescueTarget.bleedOutTimer = Math.max(bot.rescueTarget.bleedOutTimer, 4.0);
          }

          // Kneel down beside the fallen comrade and wrap bandage
          bot.yaw = Math.atan2(targetPos.x - bot.pos.x, targetPos.z - bot.pos.z);
          bot.mesh.rotation.y = bot.yaw;
          parts.pelvisGroup.position.y = 0.52;
          parts.upperBody.position.y = 0.52;
          parts.upperBody.rotation.set(0.54 + Math.sin(bot.animPhase) * 0.08, 0, 0);
          parts.headGroup.rotation.set(0.32, 0, 0);
          parts.weaponRig.rotation.set(0.75 + Math.cos(bot.animPhase) * 0.12, 0, 0);
          parts.leftLeg.rotation.x = -0.8;
          parts.rightLeg.rotation.x = -0.35;
          parts.leftShin.rotation.x = 1.35;
          parts.rightShin.rotation.x = 0.9;

          // Spawn periodic white/green bandage particles while reviving
          if (Math.random() < 0.25) {
            this.world.spawnDebris(
              targetPos.clone().add(new THREE.Vector3(0, 0.55, 0)),
              new THREE.Color(0x2ecc71),
              1
            );
          }

          if (bot.rescueTimer <= 0) {
            bot.revives = (bot.revives || 0) + 1;
            bot.score += 200;
            if (this.onTelemetryEvent) {
              this.onTelemetryEvent('REVIVE_COMPLETE', {
                medic: bot.name,
                role: bot.role,
                team: bot.team,
                casualty: targetName
              });
            }
            if (bot.rescueTarget === 'PLAYER') {
              player.reviveFromDowned(bot.name);
            } else {
              const savedBot = bot.rescueTarget;
              this.reviveBot(savedBot);
              if (onKillFn && bot.pos.distanceTo(player.pos) < 110) {
                onKillFn(bot.name, bot.team, savedBot.name, savedBot.team, 'REVIVED', false);
              }
            }
            // Medic / Rescuer must stow bandages & unsling rifle from kneeling posture before aiming or firing!
            bot.weaponReadyTimer = 1.45;
            bot.aimRaiseProgress = 0.0;
            bot.isCrouching = true;
            bot.crouchAmount = 1.0;
            bot.shootCooldown = Math.max(bot.shootCooldown || 0, 1.55);
            bot.rpgCooldown = Math.max(bot.rpgCooldown || 0, 1.8);
            bot.transitionState = 'EQUIPPING_WEAPON';
            bot.rescueTarget = null;
            bot.rescueState = null;
          }
          continue;
        }
      }

      // Enforce active Player / Squad Leader / Commander Objective Order if set
      if (bot.playerOrderTimer > 0 && bot.playerOrderMode === 'OBJECTIVE' && bot.playerOrderFlagIndex >= 0) {
        bot.targetFlagIndex = bot.playerOrderFlagIndex;
      }

      bot.rethinkTimer -= dt;
      if (bot.rethinkTimer <= 0) {
        bot.rethinkTimer = BOT.RETHINK_TIMER_BASE + Math.random() * BOT.RETHINK_TIMER_RAND;
        if (bot.playerOrderTimer > 0 && bot.playerOrderMode === 'OBJECTIVE' && bot.playerOrderFlagIndex >= 0) {
          bot.targetFlagIndex = bot.playerOrderFlagIndex;
        } else if (!bot.isSquadLeader) {
          // Squad Members follow their Squad Leader's assigned objective so the 8-man Squad fights together!
          const squadLeaderBot = this.bots.find(
            (b) => b.team === bot.team && b.squad === bot.squad && b.isSquadLeader
          );
          if (squadLeaderBot && typeof squadLeaderBot.targetFlagIndex === 'number') {
            bot.targetFlagIndex = squadLeaderBot.targetFlagIndex;
          }
        } else {
          // Autonomous AI Squad Leader selects the best unowned/contested objective for their squad
          const candidateFlags = this.world.flags
            .map((f, idx) => ({ f, idx }))
            .filter((item) => item.f.owner !== bot.team);
          if (candidateFlags.length > 0) {
            const pick = candidateFlags[Math.floor(Math.random() * candidateFlags.length)];
            bot.targetFlagIndex = pick.idx;
          } else {
            bot.targetFlagIndex = Math.floor(Math.random() * this.world.flags.length);
          }
        }
        const fPos = this.world.flags[bot.targetFlagIndex].pos;
        const rawX = fPos.x + (Math.random() - 0.5) * 22;
        const rawZ = fPos.z + (Math.random() - 0.5) * 22;
        const safeGoal = this.world.pushOutOfBuildingFootprint(rawX, rawZ, 2.2);
        bot.waypointOffset.set(safeGoal.x - fPos.x, 0, safeGoal.z - fPos.z);
      }

      // =======================================================================
      // PHYSICAL BASE VEHICLE SEEKING & BOARDING (BRAVO Armor Squad prioritizes crewing Tanks/IFVs/Cars!)
      // =======================================================================
      let seekingVehicle = null;
      if (vehicleManager && vehicleManager.vehicles && !bot.rescueTarget) {
        const isBravoArmorCrew = bot.squad === 'BRAVO';
        const seekRangeSq = isBravoArmorCrew
          ? BOT.VEHICLE_SEEK_RANGE_BRAVO * BOT.VEHICLE_SEEK_RANGE_BRAVO
          : BOT.VEHICLE_SEEK_RANGE_OTHER * BOT.VEHICLE_SEEK_RANGE_OTHER;
        let bestVehDistSq = seekRangeSq;
        for (const veh of vehicleManager.vehicles) {
          if (veh.dead || veh.driver || veh.npcDriver || veh.team !== bot.team) continue;
          const dSq = bot.pos.distanceToSquared(veh.pos);
          if (dSq >= bestVehDistSq) continue;
          // Check if another closer friendly bot (or a BRAVO Armor Squad crewman) is already sprinting to claim this vehicle
          if (
            veh.claimedByBot &&
            veh.claimedByBot !== bot &&
            !veh.claimedByBot.dead &&
            !veh.claimedByBot.downed &&
            !veh.claimedByBot.drivingVehicle &&
            ((veh.claimedByBot.squad === 'BRAVO' && !isBravoArmorCrew) ||
              veh.claimedByBot.pos.distanceToSquared(veh.pos) < dSq)
          ) {
            continue;
          }
          bestVehDistSq = dSq;
          seekingVehicle = veh;
        }

        if (seekingVehicle) {
          seekingVehicle.claimedByBot = bot;
          if (bestVehDistSq <= BOT.VEHICLE_BOARD_DISTANCE * BOT.VEHICLE_BOARD_DISTANCE) {
            // NPC has reached the vehicle at the Base Motor Pool -> Climb Inside & Drive!
            seekingVehicle.npcDriver = bot;
            seekingVehicle.claimedByBot = null;
            bot.drivingVehicle = seekingVehicle;
            bot.mesh.visible = false;
            if (this.onTelemetryEvent) {
              this.onTelemetryEvent('NPC_BOARDED_VEHICLE', {
                npc: bot.name,
                team: bot.team,
                squad: bot.squad,
                role: bot.role,
                vehicleId: seekingVehicle.id,
                vehicleName: seekingVehicle.name,
                x: Math.round(seekingVehicle.pos.x),
                z: Math.round(seekingVehicle.pos.z)
              });
            }
            continue;
          }
        }
      }

      // =======================================================================
      // ANTI-ARMOR TARGETING (ENGINEER RPG-7 SQUADS HUNTING TANKS & ARMORED CARS)
      // =======================================================================
      if (bot.rpgCooldown > 0) {
        bot.rpgCooldown -= dt;
      }

      let nearestArmor = null;
      let nearestArmorDistSq = BOT.ENGAGE_RANGE_RPG_CHECK * BOT.ENGAGE_RANGE_RPG_CHECK;
      if (bot.role === 'ENGINEER' && vehicleManager && vehicleManager.vehicles) {
        for (const veh of vehicleManager.vehicles) {
          if (veh.dead || veh.team === bot.team) continue;
          // Engineers prioritize enemy armor that is actively driven by the Player or an NPC
          const isOccupied = Boolean(veh.driver || veh.npcDriver);
          const dSq = bot.pos.distanceToSquared(veh.pos);
          const effectiveDistSq = isOccupied ? dSq * 0.7 : dSq;
          if (
            effectiveDistSq < nearestArmorDistSq &&
            this.canBotSeeTarget(bot, `veh_${veh.id}`, veh.pos, true)
          ) {
            nearestArmorDistSq = dSq;
            nearestArmor = veh;
          }
        }
      }

      // Toggle shoulder-mounted RPG-7 launcher mesh when hunting enemy armor
      const shouldUseRpg = Boolean(nearestArmor && nearestArmorDistSq < BOT.ENGAGE_RANGE_RPG_TOGGLE * BOT.ENGAGE_RANGE_RPG_TOGGLE);
      if (bot.usingRpg !== shouldUseRpg) {
        bot.usingRpg = shouldUseRpg;
        // Swapping between primary rifle and back-slung RPG-7 requires a physical weapon-ready transition!
        bot.weaponReadyTimer = Math.max(bot.weaponReadyTimer || 0, 0.95);
        bot.aimRaiseProgress = 0.0;
        bot.transitionState = 'EQUIPPING_WEAPON';
        if (parts.gunGroup) parts.gunGroup.visible = !shouldUseRpg;
        if (parts.rpgShoulderGroup) parts.rpgShoulderGroup.visible = shouldUseRpg;
        if (parts.rpgBackTube) parts.rpgBackTube.visible = !shouldUseRpg;
      }

      // Find nearest VISIBLE enemy (up to 115m engagement range, strictly respecting building walls & thin gaps!)
      bot._raycastsThisFrame = 0;
      bot._targetScanTimer = (bot._targetScanTimer || 0) - dt;
      let nearestEnemy = null;
      let nearestDistSq = BOT.ENGAGE_RANGE_INFANTRY * BOT.ENGAGE_RANGE_INFANTRY;

      if (bot.assessThreatEnemy) {
        // Rescuing Medic is assessing & neutralizing the immediate threat around a casualty first!
        nearestEnemy = bot.assessThreatEnemy;
        nearestDistSq = bot.assessThreatEnemy.distSq || bot.pos.distanceToSquared(bot.assessThreatEnemy.pos);
      } else if (nearestArmor) {
        // Engineers prioritize enemy Main Battle Tanks, APCs & Armored Cars!
        nearestDistSq = nearestArmorDistSq;
        nearestEnemy = { isVehicle: true, pos: nearestArmor.pos, unit: nearestArmor };
      } else if (
        bot._targetScanTimer > 0 &&
        bot._cachedEnemy &&
        bot._cachedEnemy.unit &&
        !bot._cachedEnemy.unit.dead &&
        !bot._cachedEnemy.unit.downed &&
        !bot._cachedEnemy.unit.drivingVehicle
      ) {
        nearestEnemy = bot._cachedEnemy;
        nearestDistSq = bot.pos.distanceToSquared(nearestEnemy.pos);
      } else {
        bot._targetScanTimer = 0.16 + Math.random() * 0.14;
        if (!player.dead && !player.downed && player.team !== bot.team) {
          const dSq = bot.pos.distanceToSquared(player.pos);
          if (player.activeVehicle && !player.activeVehicle.dead) {
            if (
              dSq < BOT.COMBAT_RANGE_VEHICLE * BOT.COMBAT_RANGE_VEHICLE &&
              dSq < nearestDistSq &&
              this.canBotSeeTarget(bot, 'PLAYER_VEH', player.activeVehicle.pos, true)
            ) {
              nearestDistSq = dSq;
              nearestEnemy = {
                isVehicle: true,
                pos: player.activeVehicle.pos,
                unit: player.activeVehicle
              };
            }
          } else if (
            dSq < nearestDistSq &&
            this.canBotSeeTarget(bot, 'PLAYER', player.pos, true)
          ) {
            nearestDistSq = dSq;
            nearestEnemy = { isPlayer: true, pos: player.pos, unit: player };
          }
        }

        for (let i = 0; i < this.bots.length; i++) {
          const other = this.bots[i];
          if (other.dead || other.downed || other.drivingVehicle || other.team === bot.team) continue;
          const dSq = bot.pos.distanceToSquared(other.pos);
          if (dSq < nearestDistSq && this.canBotSeeTarget(bot, other.id, other.pos, true)) {
            nearestDistSq = dSq;
            nearestEnemy = { isPlayer: false, pos: other.pos, unit: other };
          }
        }
        bot._cachedEnemy = nearestEnemy;
      }

      const targetFlag = this.world.flags[bot.targetFlagIndex];
      let goal = seekingVehicle
        ? seekingVehicle.pos.clone()
        : targetFlag.pos.clone().add(bot.waypointOffset);

      if (!seekingVehicle && bot.playerOrderTimer > 0 && !player.dead) {
        if (bot.playerOrderMode === 'FOLLOW') {
          goal = player.pos.clone().add(bot.waypointOffset);
        } else if (bot.playerOrderMode === 'HOLD') {
          goal = bot.playerOrderPos.clone().add(bot.waypointOffset);
        }
      }

      // Squad Cohesion: Non-leader squadmates stay grouped around their own Squad Leader (within 3m–6m)
      // so each 8-man Squad (ALPHA, BRAVO, CHARLIE, DELTA, ECHO) stands by itself as a distinct unit!
      let squadLeaderBot = null;
      if (!seekingVehicle && !bot.isSquadLeader) {
        for (let sIdx = 0; sIdx < this.bots.length; sIdx++) {
          const cand = this.bots[sIdx];
          if (
            cand.team === bot.team &&
            cand.squad === bot.squad &&
            cand.isSquadLeader &&
            !cand.dead &&
            !cand.downed &&
            !cand.drivingVehicle
          ) {
            squadLeaderBot = cand;
            break;
          }
        }
        if (squadLeaderBot && bot.memberClusterOffset && squadLeaderBot.pos.distanceTo(goal) < 55) {
          goal.copy(squadLeaderBot.pos).add(bot.memberClusterOffset);
        }
      }

      // Ensure goal coordinate never lies inside a building or container footprint!
      if (!seekingVehicle && this.world.pushOutOfBuildingFootprint) {
        const safeGoal = this.world.pushOutOfBuildingFootprint(goal.x, goal.z, 2.2);
        goal.x = safeGoal.x;
        goal.z = safeGoal.z;
      }

      // Autonomous Contextual Proximity & Squad Teammate Callouts
      if (bot.team === player.team && !player.dead && bot.chatCooldown <= 0 && this.globalCommsCooldown <= 0) {
        const distToPlayer = bot.pos.distanceTo(player.pos);
        if (distToPlayer <= 45 || bot.inPlayerSquad) {
          if (bot.suppressionLevel > 0.45) {
            this.emitBotComms(bot, player, 'Taking heavy suppressive fire! Pinned down here!', 'URGENT');
          } else if (nearestEnemy && nearestEnemy.isVehicle && nearestDistSq < BOT.ENGAGE_RANGE_INFANTRY * BOT.ENGAGE_RANGE_INFANTRY) {
            const cDir = this.getCompassDirection(
              nearestEnemy.pos.x - bot.pos.x,
              nearestEnemy.pos.z - bot.pos.z
            );
            const vType = nearestEnemy.unit && nearestEnemy.unit.type ? nearestEnemy.unit.type.toUpperCase() : 'ARMOR';
            this.emitBotComms(
              bot,
              player,
              `Enemy ${vType} spotted ${cDir} (${Math.round(Math.sqrt(nearestDistSq))}m)! Watch for armor!`,
              'COMBAT'
            );
          } else if (nearestEnemy && nearestDistSq < BOT.COMBAT_RANGE_INFANTRY * BOT.COMBAT_RANGE_INFANTRY) {
            const cDir = this.getCompassDirection(
              nearestEnemy.pos.x - bot.pos.x,
              nearestEnemy.pos.z - bot.pos.z
            );
            const eRole = nearestEnemy.unit && nearestEnemy.unit.role ? nearestEnemy.unit.role : 'INFANTRY';
            this.emitBotComms(
              bot,
              player,
              `Contact ${cDir}, ${Math.round(Math.sqrt(nearestDistSq))}m! Engaging enemy ${eRole}!`,
              'COMBAT'
            );
          } else if (bot.playerOrderTimer > 0 && bot.playerOrderMode === 'FOLLOW' && distToPlayer < 16) {
            this.emitBotComms(bot, player, 'Right on your six Lead, watching your flank!', 'ORDER');
          } else if (bot.pos.distanceTo(targetFlag.pos) < 24 && targetFlag.owner !== bot.team) {
            this.emitBotComms(bot, player, `Pushing Objective ${targetFlag.id}, cover me!`, 'OBJECTIVE');
          }
        }
      }

      // Route across the nearest of the 3 grand river bridges (-110, 0, +110) when crossing the river
      if (!seekingVehicle && Math.sign(bot.pos.x) !== Math.sign(goal.x) && Math.abs(bot.pos.x) < 28) {
        const nearestBridgeZ = Math.abs(bot.pos.z) < 55 ? 0 : bot.pos.z > 0 ? 110 : -110;
        goal.x = Math.sign(goal.x) * 4;
        goal.z = nearestBridgeZ;
      }

      const toGoal = goal.sub(bot.pos);
      toGoal.y = 0;
      const distToGoal = toGoal.length();
      if (distToGoal > 0.01) toGoal.normalize();

      // Determine Desired Velocity Vector based on Combat Archetype
      const desiredDir = new THREE.Vector3();
      let desiredSpeed = 0;
      const inCombat = Boolean(
        !seekingVehicle &&
          nearestEnemy &&
          (nearestEnemy.isVehicle
            ? nearestDistSq < 120 * 120
            : nearestDistSq < BOT.COMBAT_RANGE_INFANTRY * BOT.COMBAT_RANGE_INFANTRY)
      );

      if (seekingVehicle) {
        // Sprinting across the Motor Pool to board an unoccupied Tank, APC, or Humvee!
        bot.isCrouching = false;
        bot.leanDir = 0;
        desiredDir.copy(toGoal);
        desiredSpeed = BOT.SPEED_SPRINT;
      } else if (inCombat && nearestEnemy && nearestEnemy.isVehicle) {
        // Anti-Armor Engineer stance: advance if > 78m, otherwise drop to a stable firing knee!
        const toVeh = nearestEnemy.pos.clone().sub(bot.pos);
        toVeh.y = 0;
        toVeh.normalize();
        if (nearestDistSq > 78 * 78) {
          bot.isCrouching = false;
          bot.leanDir = 0;
          desiredDir.copy(toVeh);
          desiredSpeed = BOT.SPEED_COMBAT_FAST;
        } else if (nearestDistSq < 14 * 14) {
          // Back up slightly to stay outside own RPG blast radius
          bot.isCrouching = false;
          bot.leanDir = 0;
          desiredDir.copy(toVeh).negate();
          desiredSpeed = 5.2;
        } else {
          bot.isCrouching = true;
          bot.leanDir = 0;
          desiredSpeed = 0;
        }
      } else if (inCombat) {
        bot.tacticTimer -= dt;
        if (bot.tacticTimer <= 0) {
          bot.tacticTimer = 1.8 + Math.random() * 2.4;
          bot.tacticPhase = (bot.tacticPhase + 1) % 3;
          if (Math.random() < 0.25) {
            const styles = ['ANCHOR_CROUCH', 'COVER_PEEK', 'ADVANCE_PAUSE', 'FLANK_RUSH', 'HOLD_STAND'];
            bot.tactic = styles[Math.floor(Math.random() * styles.length)];
          }
        }

        const toEnemy = nearestEnemy.pos.clone().sub(bot.pos);
        toEnemy.y = 0;
        toEnemy.normalize();
        const perp = new THREE.Vector3(-toEnemy.z * bot.strafeDir, 0, toEnemy.x * bot.strafeDir);

        if (bot.tactic === 'ANCHOR_CROUCH') {
          bot.isCrouching = true;
          bot.leanDir = 0;
          desiredSpeed = 0;
        } else if (bot.tactic === 'COVER_PEEK') {
          if (bot.tacticPhase === 0) {
            bot.isCrouching = true;
            bot.leanDir = 0;
            desiredSpeed = 0;
          } else {
            bot.isCrouching = false;
            bot.leanDir = bot.strafeDir;
            desiredSpeed = 0;
          }
        } else if (bot.tactic === 'ADVANCE_PAUSE') {
          if (bot.tacticPhase === 0 && nearestDistSq > 16 * 16) {
            bot.isCrouching = false;
            bot.leanDir = 0;
            desiredDir.copy(toEnemy);
            desiredSpeed = BOT.SPEED_COMBAT_SLOW;
          } else {
            bot.isCrouching = bot.tacticPhase === 1;
            bot.leanDir = 0;
            desiredSpeed = 0;
          }
        } else if (bot.tactic === 'FLANK_RUSH') {
          bot.isCrouching = false;
          bot.leanDir = 0;
          if (nearestDistSq > 10 * 10) {
            desiredDir.copy(toEnemy).addScaledVector(perp, 0.55).normalize();
            desiredSpeed = BOT.SPEED_COMBAT_MED;
          } else {
            desiredSpeed = 0;
          }
        } else {
          bot.isCrouching = false;
          bot.leanDir = 0;
          if (bot.tacticPhase === 0 && distToGoal > 6) {
            desiredDir.copy(toGoal);
            desiredSpeed = 4.2;
          } else {
            desiredSpeed = 0;
          }
        }
      } else {
        const isFollowOrHold =
          bot.playerOrderTimer > 0 && (bot.playerOrderMode === 'FOLLOW' || bot.playerOrderMode === 'HOLD');
        const isCloseMode = bot.spacingMode === 'STAY_CLOSE';
        const anchorCenter =
          bot.playerOrderMode === 'HOLD' ? bot.playerOrderPos : player.pos;
        const distToAnchor =
          isFollowOrHold && anchorCenter ? Math.hypot(bot.pos.x - anchorCenter.x, bot.pos.z - anchorCenter.z) : 999;
        const distToSL =
          squadLeaderBot ? Math.hypot(bot.pos.x - squadLeaderBot.pos.x, bot.pos.z - squadLeaderBot.pos.z) : 0;

        const minSqDist = isCloseMode ? 8 : 20;
        const maxSqDist = isCloseMode ? 22 : 42;
        const maxClusterDist = isCloseMode ? 4.8 : 13.0;
        const goalTol = isCloseMode ? 4.2 : 7.5;

        const squadInPosition =
          isFollowOrHold &&
          ((bot.isSquadLeader && distToAnchor >= minSqDist && distToAnchor <= maxSqDist && distToGoal <= 10.0) ||
            (!bot.isSquadLeader && squadLeaderBot && distToSL <= maxClusterDist && distToAnchor <= maxSqDist + 6) ||
            distToGoal <= goalTol);

        if (!squadInPosition && distToGoal > 2.6) {
          bot.isCrouching = false;
          bot.leanDir = 0;
          desiredDir.copy(toGoal);
          desiredSpeed = BOT.SPEED_PATROL;
        } else {
          // Hold cohesive Squad overwatch formation using active spacing mode (STAY_CLOSE vs FAN_OUT)!
          bot.isCrouching = isFollowOrHold && bot.role !== 'MEDIC';
          bot.leanDir = 0;
          desiredSpeed = 0;
        }
      }

      // =======================================================================
      // REALISTIC POST-REVIVE STAND-UP & WEAPON-EQUIP STATE TRANSITIONS
      // =======================================================================
      if (bot.postReviveTimer > 0) {
        bot.postReviveTimer = Math.max(0, bot.postReviveTimer - dt);
        bot.standUpProgress = Math.min(1.0, (bot.standUpProgress || 0) + dt / 1.15);
        // Smooth ease-out from lying flat on back (-PI/2) -> pushing up onto one knee (0)
        const easeStand = 1 - Math.pow(1 - bot.standUpProgress, 2);
        bot.mesh.rotation.x = -Math.PI * 0.5 * (1 - easeStand);
        bot.isCrouching = true;
        if (bot.postReviveTimer > 1.05) {
          // Still pushing up off the ground onto one knee: cannot walk yet
          desiredSpeed = 0;
        } else {
          // Recovering on one knee: slow crouch step only
          desiredSpeed = Math.min(desiredSpeed, 2.5);
        }
      } else {
        bot.standUpProgress = 1.0;
        bot.mesh.rotation.x = 0;
      }

      if (bot.weaponReadyTimer > 0) {
        bot.weaponReadyTimer = Math.max(0, bot.weaponReadyTimer - dt);
        // While stowing medkit / bandages or unslinging rifle, keep pace slow and weapon lowered
        desiredSpeed = Math.min(desiredSpeed, 3.6);
      }

      // =======================================================================
      // BUILDING EXTERIOR REPULSION, 8-ANGLE FAN WHISKERS & ANTI-STUCK WATCHDOG
      // =======================================================================
      if (this.world.isInsideBuildingOrContainer && this.world.isInsideBuildingOrContainer(bot.pos.x, bot.pos.z, 1.35)) {
        const pushedOut = this.world.pushOutOfBuildingFootprint(bot.pos.x, bot.pos.z, 1.9);
        bot.pos.x = pushedOut.x;
        bot.pos.z = pushedOut.z;
      }

      if (bot.avoidanceTimer > 0) {
        bot.avoidanceTimer = Math.max(0, bot.avoidanceTimer - dt);
      }

      // 8-Angle Fan Whisker Obstacle Avoidance so bots smoothly navigate around wide buildings & HESCO walls
      if (desiredSpeed > 0.1) {
        const baseAngle = Math.atan2(desiredDir.x, desiredDir.z);
        const centerBlockedNear = this.isPointBlocked(
          bot.pos.x + Math.sin(baseAngle) * 1.7,
          bot.pos.y,
          bot.pos.z + Math.cos(baseAngle) * 1.7
        );
        const centerBlockedFar = this.isPointBlocked(
          bot.pos.x + Math.sin(baseAngle) * 3.1,
          bot.pos.y,
          bot.pos.z + Math.cos(baseAngle) * 3.1
        );

        if (centerBlockedNear || centerBlockedFar) {
          const sign = bot.avoidanceSign || 1;
          const fanOffsets = [
            0.48 * sign,
            -0.48 * sign,
            0.92 * sign,
            -0.92 * sign,
            1.38 * sign,
            -1.38 * sign,
            1.85 * sign,
            -1.85 * sign
          ];
          let chosenAngle = baseAngle + 1.55 * sign;
          for (let fIdx = 0; fIdx < fanOffsets.length; fIdx++) {
            const testAngle = baseAngle + fanOffsets[fIdx];
            const nearClear = !this.isPointBlocked(
              bot.pos.x + Math.sin(testAngle) * 1.75,
              bot.pos.y,
              bot.pos.z + Math.cos(testAngle) * 1.75
            );
            const farClear = !this.isPointBlocked(
              bot.pos.x + Math.sin(testAngle) * 3.1,
              bot.pos.y,
              bot.pos.z + Math.cos(testAngle) * 3.1
            );
            if (nearClear && farClear) {
              chosenAngle = testAngle;
              if (bot.avoidanceTimer <= 0) {
                bot.avoidanceSign = Math.sign(fanOffsets[fIdx]) || 1;
                bot.avoidanceTimer = 1.4;
              }
              break;
            }
          }
          desiredDir.set(Math.sin(chosenAngle), 0, Math.cos(chosenAngle));
        }
      }

      // Smooth Acceleration & Deceleration (natural momentum, zero robotic snapping)
      const targetVelX = desiredDir.x * desiredSpeed;
      const targetVelZ = desiredDir.z * desiredSpeed;
      const accelRate = Math.min(1, dt * 8.5);
      bot.velX += (targetVelX - bot.velX) * accelRate;
      bot.velZ += (targetVelZ - bot.velZ) * accelRate;

      const actualSpeed = Math.hypot(bot.velX, bot.velZ);

      // Apply horizontal movement & safe low-cover vault (never vault through building windows!)
      if (actualSpeed > 0.15) {
        const nextX = bot.pos.x + bot.velX * dt;
        const nextZ = bot.pos.z + bot.velZ * dt;

        const entersBuilding =
          this.world.isInsideBuildingOrContainer &&
          this.world.isInsideBuildingOrContainer(nextX, nextZ, 1.35);
        const gWaist = this.world.worldToGrid(nextX, bot.pos.y + 0.8, nextZ);
        const gHead = this.world.worldToGrid(nextX, bot.pos.y + 1.9, nextZ);
        const gAbove = this.world.worldToGrid(nextX, bot.pos.y + 2.9, nextZ);
        const blockedLow = this.world.voxels.get(this.world.key(gWaist.gx, gWaist.gy, gWaist.gz));
        const blockedHigh = this.world.voxels.get(this.world.key(gHead.gx, gHead.gy, gHead.gz));
        const blockedAbove = this.world.voxels.get(this.world.key(gAbove.gx, gAbove.gy, gAbove.gz));

        if (!blockedLow && !blockedHigh && !entersBuilding) {
          bot.pos.x = nextX;
          bot.pos.z = nextZ;
        } else if (!entersBuilding && blockedLow && !blockedHigh && !blockedAbove && bot.isGrounded) {
          // Only vault over genuine 1-block low sandbag walls in open terrain (never into windows!)
          bot.velY = BOT.VAULT_JUMP_SPEED;
          bot.isGrounded = false;
          bot.pos.x = nextX;
          bot.pos.z = nextZ;
        } else {
          // Slide tangentially along the wall instead of getting wedged
          const slideX = bot.pos.x + bot.velX * dt;
          const slideZ = bot.pos.z + bot.velZ * dt;
          if (!this.isPointBlocked(slideX, bot.pos.y, bot.pos.z)) {
            bot.pos.x = slideX;
          } else if (!this.isPointBlocked(bot.pos.x, bot.pos.y, slideZ)) {
            bot.pos.z = slideZ;
          } else {
            bot.velX *= -0.25;
            bot.velZ *= -0.25;
            bot.strafeDir = -bot.strafeDir;
            bot.avoidanceSign = -(bot.avoidanceSign || 1);
            bot.avoidanceTimer = 1.2;
          }
        }
      }

      // Anti-Stuck Progress Watchdog: ensures ZERO bots remain trapped behind walls or inside geometry
      if (!bot.lastProgressPos) {
        bot.lastProgressPos = bot.pos.clone();
      }
      if (desiredSpeed > 2.2 && !inCombat && !bot.rescueTarget && (bot.postReviveTimer || 0) <= 0) {
        bot.stuckTimer = (bot.stuckTimer || 0) + dt;
        if (bot.stuckTimer >= 0.85) {
          const movedDist = Math.hypot(
            bot.pos.x - bot.lastProgressPos.x,
            bot.pos.z - bot.lastProgressPos.z
          );
          bot.lastProgressPos.copy(bot.pos);
          bot.stuckTimer = 0;

          if (movedDist < 0.95) {
            bot.stuckCount = (bot.stuckCount || 0) + 1;
            bot.avoidanceSign = -(bot.avoidanceSign || 1);
            bot.avoidanceTimer = 1.6;
            if (bot.stuckCount >= 2) {
              // Relocate cleanly to the nearest open street coordinate in the desired direction
              const stepOutX = bot.pos.x + desiredDir.x * 4.5 + (Math.random() - 0.5) * 3.0;
              const stepOutZ = bot.pos.z + desiredDir.z * 4.5 + (Math.random() - 0.5) * 3.0;
              const safePos = this.world.findSafeSpawnPoint(stepOutX, stepOutZ);
              bot.pos.copy(safePos);
              bot.velX = 0;
              bot.velZ = 0;
              bot.stuckCount = 0;
            }
          } else {
            bot.stuckCount = 0;
          }
        }
      } else {
        bot.stuckTimer = 0;
        bot.stuckCount = 0;
        bot.lastProgressPos.copy(bot.pos);
      }

      // Vertical Gravity & 3D Terrain Following
      bot.velY -= BOT.GRAVITY * dt;
      bot.pos.y += bot.velY * dt;
      const groundY = this.world.getGroundHeightAt(bot.pos.x, bot.pos.z);
      if (bot.pos.y <= groundY) {
        bot.pos.y = groundY;
        bot.velY = 0;
        bot.isGrounded = true;
      }

      // =======================================================================
      // AIM TRACKING, REALISTIC TURN-RATE CAP, WEAPON RAISE & GAIT ANIMATION
      // =======================================================================
      const isSprintingOut = !inCombat && actualSpeed > 5.8;
      const isGettingUp = (bot.postReviveTimer || 0) > 0;
      const isEquippingWeapon = (bot.weaponReadyTimer || 0) > 0;

      // Update Weapon Raise Progress (0.0 = slung/stowed, 0.25 = patrol low-ready, 1.0 = shouldered ADS)
      if (isGettingUp || isEquippingWeapon || isSprintingOut) {
        bot.aimRaiseProgress = Math.max(0, (bot.aimRaiseProgress || 0) - dt * 2.8);
      } else if (!seekingVehicle && nearestEnemy) {
        // Takes ~0.55s to physically raise rifle from low-ready to shoulder sights
        bot.aimRaiseProgress = Math.min(1.0, (bot.aimRaiseProgress || 0) + dt * BOT.AIM_RAISE_RATE);
      } else {
        // Settle at low-ready patrol carry (0.25) when out of combat
        const targetLowReady = 0.25;
        bot.aimRaiseProgress +=
          (targetLowReady - (bot.aimRaiseProgress || 0)) * Math.min(1, dt * 3.5);
      }

      // Update diagnostic transition state
      if (isGettingUp) {
        bot.transitionState = 'GETTING_UP';
      } else if (isEquippingWeapon) {
        bot.transitionState = 'EQUIPPING_WEAPON';
      } else if (!seekingVehicle && nearestEnemy && bot.aimRaiseProgress < BOT.AIM_FIRE_GATE) {
        bot.transitionState = 'RAISING_AIM';
      } else {
        bot.transitionState = 'ACTIVE';
      }

      if (!seekingVehicle && nearestEnemy) {
        const dx = nearestEnemy.pos.x - bot.pos.x;
        const dy = nearestEnemy.pos.y - bot.pos.y;
        const dz = nearestEnemy.pos.z - bot.pos.z;
        const horizDist = Math.max(1, Math.hypot(dx, dz));
        const desiredYaw = Math.atan2(dx, dz);
        let diff = desiredYaw - bot.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;

        // Realistic Angular Turn Velocity Cap (rad/s) — prevents instant 180-degree snap turns!
        const maxTurnRate =
          (bot.postReviveTimer || 0) > 1.0
            ? BOT.TURN_RATE_POST_REVIVE
            : isGettingUp || isEquippingWeapon
              ? BOT.TURN_RATE_GETTING_UP
              : BOT.TURN_RATE_NORMAL;
        const maxTurnStep = maxTurnRate * dt;
        bot.yaw += THREE.MathUtils.clamp(diff, -maxTurnStep, maxTurnStep);

        const remainingDiff = Math.abs(diff) - Math.min(Math.abs(diff), maxTurnStep);
        const targetPitch = THREE.MathUtils.clamp(-Math.atan2(dy, horizDist), -0.55, 0.55);
        bot.aimPitch += (targetPitch - bot.aimPitch) * Math.min(1, dt * 6.5);

        // Strict Firing Gate: Soldier CANNOT open fire until they have finished getting up,
        // finished stowing medkit/unslinging weapon, raised their sights to shoulder (>= 0.85),
        // and physically rotated their body/barrel within ~15 degrees (0.26 rad) of the target!
        const canFireWeapon =
          !isGettingUp &&
          !isEquippingWeapon &&
          bot.aimRaiseProgress >= BOT.AIM_FIRE_GATE &&
          remainingDiff < BOT.AIM_OFF_TARGET_THRESHOLD;

        if (nearestEnemy.isVehicle && bot.role === 'ENGINEER') {
          if (canFireWeapon && bot.rpgCooldown <= 0 && horizDist > 10) {
            bot.rpgCooldown = BOT.RPG_COOLDOWN_BASE + Math.random() * BOT.RPG_COOLDOWN_RAND;
            this.botFireRpgAt(bot, nearestEnemy.unit, player);
          }
        } else {
          bot.shootCooldown -= dt;
          if (canFireWeapon && bot.shootCooldown <= 0) {
            bot.burstCount++;
            bot.shootCooldown =
              bot.burstCount % 4 === 0
                ? BOT.BURST_PAUSE_BASE + Math.random() * BOT.BURST_PAUSE_RAND
                : BOT.BURST_SHOT_INTERVAL;
            this.botFireAt(bot, nearestEnemy, player, onKillFn, vehicleManager);
          }
        }
      } else {
        bot.aimPitch *= 0.9;
        if (actualSpeed > 0.25) {
          const desiredYaw = Math.atan2(bot.velX, bot.velZ);
          let diff = desiredYaw - bot.yaw;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          const maxMoveTurn = (isGettingUp || isEquippingWeapon ? 2.0 : 2.8) * dt;
          bot.yaw += THREE.MathUtils.clamp(diff, -maxMoveTurn, maxMoveTurn);
        }
      }

      bot.mesh.rotation.y = bot.yaw;

      // Compute lower-body orientation relative to upper-body aim so legs walk naturally
      // in the direction of velocity (no sideways moonwalking!)
      let legTwist = 0;
      let walkDirSign = 1;
      if (actualSpeed > 0.25) {
        const velAngle = Math.atan2(bot.velX, bot.velZ);
        let relAngle = velAngle - bot.yaw;
        while (relAngle > Math.PI) relAngle -= Math.PI * 2;
        while (relAngle < -Math.PI) relAngle += Math.PI * 2;
        if (Math.abs(relAngle) > Math.PI * 0.62) {
          walkDirSign = -1;
          relAngle += relAngle > 0 ? -Math.PI : Math.PI;
        }
        legTwist = THREE.MathUtils.clamp(relAngle, -0.85, 0.85);
      }
      parts.pelvisGroup.rotation.y = THREE.MathUtils.lerp(
        parts.pelvisGroup.rotation.y,
        legTwist,
        Math.min(1, dt * 12)
      );

      // Smooth Crouch & Lean interpolation
      const targetCrouch = bot.isCrouching ? 1 : 0;
      bot.crouchAmount += (targetCrouch - bot.crouchAmount) * Math.min(1, dt * 11);

      const targetLean = bot.leanDir;
      bot.leanAmount += (targetLean - bot.leanAmount) * Math.min(1, dt * 10);

      // Decay firing recoil & hit flinch
      bot.recoilKick *= Math.pow(0.01, dt);
      if (bot.flinchTimer > 0) bot.flinchTimer = Math.max(0, bot.flinchTimer - dt);
      if (bot.muzzleFlashTimer > 0) {
        bot.muzzleFlashTimer -= dt;
        parts.muzzleFlash.material.opacity = 0.92;
        parts.muzzleFlash.rotation.z = Math.random() * Math.PI;
      } else {
        parts.muzzleFlash.material.opacity = 0;
      }

      // Multi-Joint Gait Cycle (Hips + Knees + Pelvis Bounce + Torso Counter-Twist)
      let bounceY = 0;
      if (actualSpeed > 0.2 && bot.isGrounded) {
        bot.animPhase += dt * actualSpeed * 1.85 * walkDirSign;
        const isSprinting = !inCombat && actualSpeed > 5.8;
        const hipAmp = isSprinting ? 0.82 : 0.56;
        const kneeAmp = isSprinting ? 1.05 : 0.72;

        const leftHip = Math.sin(bot.animPhase) * hipAmp;
        const rightHip = Math.sin(bot.animPhase + Math.PI) * hipAmp;

        // Knees flex backward naturally during the leg's recovery lift phase
        const leftKnee = Math.max(0, -Math.cos(bot.animPhase) * kneeAmp) + 0.08;
        const rightKnee = Math.max(0, -Math.cos(bot.animPhase + Math.PI) * kneeAmp) + 0.08;

        parts.leftLeg.rotation.x = leftHip - bot.crouchAmount * 0.45;
        parts.rightLeg.rotation.x = rightHip - bot.crouchAmount * 0.45;
        parts.leftShin.rotation.x = leftKnee + bot.crouchAmount * 0.85;
        parts.rightShin.rotation.x = rightKnee + bot.crouchAmount * 0.85;

        // Vertical pelvis bounce (2x per full stride) + subtle lateral hip sway
        bounceY = Math.abs(Math.sin(bot.animPhase)) * (isSprinting ? 0.068 : 0.042);
        parts.pelvisGroup.rotation.z = Math.cos(bot.animPhase) * 0.045;
      } else if (!bot.isGrounded) {
        // Mid-air vault / jump tuck pose
        parts.leftLeg.rotation.x = -0.55;
        parts.rightLeg.rotation.x = -0.25;
        parts.leftShin.rotation.x = 0.95;
        parts.rightShin.rotation.x = 0.65;
        parts.pelvisGroup.rotation.z = 0;
      } else {
        // Standing or Crouched Kneeling Stance + subtle breathing idle
        const idleBreath = Math.sin(performance.now() * 0.003 + bIdx) * 0.015;
        parts.leftLeg.rotation.x = THREE.MathUtils.lerp(
          parts.leftLeg.rotation.x,
          -bot.crouchAmount * 0.75,
          Math.min(1, dt * 10)
        );
        parts.rightLeg.rotation.x = THREE.MathUtils.lerp(
          parts.rightLeg.rotation.x,
          -bot.crouchAmount * 0.35,
          Math.min(1, dt * 10)
        );
        parts.leftShin.rotation.x = THREE.MathUtils.lerp(
          parts.leftShin.rotation.x,
          bot.crouchAmount * 1.25,
          Math.min(1, dt * 10)
        );
        parts.rightShin.rotation.x = THREE.MathUtils.lerp(
          parts.rightShin.rotation.x,
          bot.crouchAmount * 0.85,
          Math.min(1, dt * 10)
        );
        parts.pelvisGroup.rotation.z = 0;
        bounceY = idleBreath;
      }

      const hipY = 0.78 - bot.crouchAmount * 0.26 + bounceY;
      parts.pelvisGroup.position.y = hipY;
      parts.upperBody.position.y = hipY;

      // Upper body forward sprint lean, post-revive / weapon-equip torso lean, combat crouch pitch, hit flinch, and Q/E peek tilt
      const flinchPitch = bot.flinchTimer > 0 ? -0.32 : 0;
      const transitionLean = isGettingUp
        ? 0.44 * (1 - (bot.standUpProgress || 0) * 0.5)
        : isEquippingWeapon
          ? 0.32 * Math.min(1, bot.weaponReadyTimer)
          : 0;
      parts.upperBody.rotation.x =
        (isSprintingOut
          ? 0.26
          : bot.crouchAmount * 0.16 + transitionLean + bot.aimPitch * 0.35 * (bot.aimRaiseProgress || 0)) +
        flinchPitch;
      parts.upperBody.rotation.y = isSprintingOut ? Math.sin(bot.animPhase) * 0.1 : 0;
      parts.upperBody.rotation.z = -bot.leanAmount * 0.24;

      // Head tracks target pitch & tilts into rifle stock when weapon is raised in combat
      parts.headGroup.rotation.x = isSprintingOut
        ? -0.18
        : isGettingUp || isEquippingWeapon
          ? 0.22
          : bot.aimPitch * 0.65;
      parts.headGroup.rotation.y = isSprintingOut ? -Math.sin(bot.animPhase) * 0.08 : 0;
      parts.headGroup.rotation.z = inCombat && (bot.aimRaiseProgress || 0) > 0.7 ? 0.08 : 0;

      // Weapon Rig Pose:
      // 1) Sprinting: Diagonal tactical chest carry
      // 2) Getting Up / Stowing Medkit / Unslinging Weapon: Lowered across chest, gradually rotating into hands
      // 3) Low-Ready -> Shouldered Sight Alignment: Smoothly interpolated by `bot.aimRaiseProgress` (0.0 -> 1.0)
      if (isSprintingOut) {
        parts.weaponRig.position.set(
          0,
          0.46 + Math.abs(Math.cos(bot.animPhase)) * 0.03,
          0
        );
        parts.weaponRig.rotation.set(
          -0.28 + Math.sin(bot.animPhase) * 0.08,
          0.52 + Math.cos(bot.animPhase) * 0.1,
          0.18
        );
      } else if (isGettingUp || isEquippingWeapon) {
        const equipRatio = isGettingUp
          ? 1.0
          : THREE.MathUtils.clamp((bot.weaponReadyTimer || 0) / 1.45, 0, 1);
        parts.weaponRig.position.set(
          0,
          THREE.MathUtils.lerp(0.44, 0.36, equipRatio),
          0
        );
        parts.weaponRig.rotation.set(
          THREE.MathUtils.lerp(0.36, 0.72, equipRatio),
          THREE.MathUtils.lerp(0.28, 0.52, equipRatio),
          THREE.MathUtils.lerp(0.1, 0.24, equipRatio)
        );
      } else {
        const raise = THREE.MathUtils.clamp(bot.aimRaiseProgress || 0, 0, 1);
        parts.weaponRig.position.set(
          0,
          THREE.MathUtils.lerp(0.43, 0.48, raise),
          -bot.recoilKick
        );
        parts.weaponRig.rotation.set(
          THREE.MathUtils.lerp(0.34, bot.aimPitch * 0.65 - bot.recoilKick * 1.4, raise),
          THREE.MathUtils.lerp(0.26, 0, raise),
          THREE.MathUtils.lerp(0.08, 0, raise)
        );
      }
    }
  }

  /**
   * Computes the exact world-space 3D coordinate of the bot's weapon barrel tip (`parts.muzzleFlash`
   * or `parts.rpgShoulderGroup`), so bullet trails and rockets leave from the gun muzzle rather than
   * the center of the soldier's body.
   */
  getBotMuzzleWorldPosition(bot) {
    if (bot && bot.mesh && bot.mesh.userData && bot.mesh.userData.parts) {
      const parts = bot.mesh.userData.parts;
      if (parts.rpgShoulderGroup && bot.usingRpg) {
        bot.mesh.updateMatrixWorld(true);
        const worldRpg = new THREE.Vector3(0, 0.04, 0.72);
        parts.rpgShoulderGroup.localToWorld(worldRpg);
        if (Number.isFinite(worldRpg.x) && worldRpg.distanceToSquared(bot.pos) < 9.0) {
          return worldRpg;
        }
      }
      if (parts.muzzleFlash) {
        bot.mesh.updateMatrixWorld(true);
        const worldMuzzle = new THREE.Vector3();
        parts.muzzleFlash.getWorldPosition(worldMuzzle);
        if (Number.isFinite(worldMuzzle.x) && worldMuzzle.distanceToSquared(bot.pos) < 9.0) {
          return worldMuzzle;
        }
      }
    }
    // Right-hand shoulder/barrel offset fallback (never center of chest!)
    const yaw = bot ? bot.yaw || 0 : 0;
    const fwdX = Math.sin(yaw);
    const fwdZ = Math.cos(yaw);
    const rightX = -Math.cos(yaw);
    const rightZ = Math.sin(yaw);
    const height = bot && bot.isCrouching ? 1.08 : 1.38;
    return new THREE.Vector3(
      bot.pos.x + rightX * 0.22 + fwdX * 0.78,
      bot.pos.y + height,
      bot.pos.z + rightZ * 0.22 + fwdZ * 0.78
    );
  }

  botFireRpgAt(bot, targetVehicle, player) {
    if (!this.hasClearSightline(bot, targetVehicle.pos, false)) return;
    bot.recoilKick = 0.18;
    bot.muzzleFlashTimer = 0.08;

    const start = this.getBotMuzzleWorldPosition(bot);
    const targetCenter = targetVehicle.pos.clone().add(new THREE.Vector3(0, 1.35, 0));
    const dist = start.distanceTo(targetCenter);
    const rocketSpeed = 66;
    const flightTime = dist / rocketSpeed;

    // Lead moving vehicle & compensate for rocket gravity (3.8 m/s^2)
    const vFwd = new THREE.Vector3(
      -Math.sin(targetVehicle.yaw) * (targetVehicle.forwardSpeed || 0),
      0,
      -Math.cos(targetVehicle.yaw) * (targetVehicle.forwardSpeed || 0)
    );
    const aimPoint = targetCenter
      .clone()
      .addScaledVector(vFwd, flightTime * 0.75)
      .add(new THREE.Vector3(0, 0.5 * 3.8 * flightTime * flightTime, 0));

    const dir = aimPoint.sub(start).normalize();
    dir.x += (Math.random() - 0.5) * 0.035;
    dir.y += (Math.random() - 0.5) * 0.025;
    dir.z += (Math.random() - 0.5) * 0.035;
    dir.normalize();

    const distFromPlayer = bot.pos.distanceTo(player.pos);
    if (distFromPlayer < 180) {
      const dx = bot.pos.x - player.pos.x;
      const dz = bot.pos.z - player.pos.z;
      const len = Math.hypot(dx, dz) || 1;
      const pan = (dx * Math.cos(player.yaw || 0) + dz * -Math.sin(player.yaw || 0)) / len;
      sound.playRocketLaunch(distFromPlayer, pan);
    }

    // Backblast smoke behind the Engineer
    this.world.spawnDebris(
      start.clone().addScaledVector(dir, -0.8),
      new THREE.Color(0x95a5a6),
      3
    );

    const rocketMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.2, 0.72),
      new THREE.MeshBasicMaterial({ color: 0xe67e22 })
    );
    rocketMesh.position.copy(start).addScaledVector(dir, 0.65);
    rocketMesh.lookAt(start.clone().addScaledVector(dir, 10));
    this.scene.add(rocketMesh);

    this.world.projectiles.push({
      type: 'rpg',
      mesh: rocketMesh,
      vel: dir.multiplyScalar(rocketSpeed),
      gravity: 3.8,
      life: 4.5,
      owner: bot
    });
  }

  botFireAt(bot, target, player, onKillFn, vehicleManager = null) {
    // Final real-time sightline gate: never fire if target moved behind a building wall or thin gap!
    if (!this.hasClearSightline(bot, target.pos, false)) {
      return;
    }

    bot.recoilKick = 0.085;
    bot.muzzleFlashTimer = 0.045;
    bot.shotsFired = (bot.shotsFired || 0) + 1;
    // NATO 5:1 Ball-to-Tracer belt ratio: 1 Tracer round followed by 5 Regular Ball rounds (1 in 6 shots)
    const isTracerRound = bot.shotsFired % 6 === 1;

    // Origin is the actual 3D gun barrel muzzle tip (not center of body!)
    const start = this.getBotMuzzleWorldPosition(bot);
    const targetEye = target.pos.clone().add(new THREE.Vector3(0, 1.2, 0));
    const dir = targetEye.clone().sub(start).normalize();

    // Suppression degrades NPC accuracy (wider aim cone when suppressed)
    const suppressionMult = 1 + (bot.suppressionLevel || 0) * 3.0;
    dir.x += (Math.random() - 0.5) * 0.075 * suppressionMult;
    dir.y += (Math.random() - 0.5) * 0.055 * suppressionMult;
    dir.z += (Math.random() - 0.5) * 0.075 * suppressionMult;
    dir.normalize();

    const distFromPlayer = bot.pos.distanceTo(player.pos);
    let pan = 0;
    if (distFromPlayer < 190) {
      const dx = bot.pos.x - player.pos.x;
      const dz = bot.pos.z - player.pos.z;
      const len = Math.hypot(dx, dz) || 1;
      pan = (dx * Math.cos(player.yaw || 0) + dz * -Math.sin(player.yaw || 0)) / len;
      const botSoundType =
        bot.role === 'SUPPORT'
          ? 'lmg'
          : bot.role === 'RECON'
          ? 'sniper'
          : bot.role === 'MEDIC'
          ? 'smg'
          : 'rifle';
      sound.playGunshot(botSoundType, distFromPlayer, pan);
    }

    // Supersonic Bullet Snap & Doppler Whiz when enemy rounds pass near the player!
    if (
      bot.team !== player.team &&
      !player.dead &&
      (target.isPlayer || distFromPlayer < 26) &&
      typeof sound.playBulletWhiz === 'function'
    ) {
      sound.playBulletWhiz(Math.min(distFromPlayer, 22), pan);
    }

    const distToTarget = start.distanceTo(targetEye);
    const voxelHit = this.world.raycastVoxel(start, dir, distToTarget, 0.1);
    if (voxelHit && (voxelHit.voxel || voxelHit.isGround)) {
      if (voxelHit.voxel) {
        if (voxelHit.voxel.isProp || voxelHit.voxel.type === 'wood') {
          this.world.damageVoxel(voxelHit.voxel.gx, voxelHit.voxel.gy, voxelHit.voxel.gz, 18);
        } else if (voxelHit.voxel.type === 'sandbag') {
          this.world.damageVoxel(voxelHit.voxel.gx, voxelHit.voxel.gy, voxelHit.voxel.gz, 6);
        }
      }
      if (isTracerRound) {
        this.spawnTracer(start, voxelHit.point, bot.team === 'US' ? 0x74b9ff : 0xff7675);
      }
      return;
    }

    const endPoint = start.clone().addScaledVector(dir, distToTarget);
    if (isTracerRound) {
      this.spawnTracer(start, endPoint, bot.team === 'US' ? 0x74b9ff : 0xff7675);
    }

    const baseHitChance = Math.max(0.1, 0.42 - distToTarget / 170);
    const hitChance = baseHitChance * (1 - (bot.suppressionLevel || 0) * 0.5); // Suppression halves hit rate
    if (Math.random() < hitChance) {
      if (target.isVehicle) {
        const veh = target.unit;
        // Small-arms rifle rounds deflect harmlessly off Tank & APC composite armor (0 hull damage)
        // and only chip 1 HP off Light Armored Cars (Humvee / GAZ Tigr) while protecting the crew inside!
        if (veh.type === 'humvee' && vehicleManager) {
          vehicleManager.damageVehicle(
            veh,
            1,
            bot.name,
            bot.team,
            'AK-15 (ARMOR GRAZE)',
            onKillFn,
            null,
            bot.pos
          );
        } else if (veh.driver === player && typeof player.notifyVehicleHit === 'function') {
          player.notifyVehicleHit(0, bot.name, 'SMALL ARMS DEFLECTED', bot.pos);
        }
      } else if (target.isPlayer) {
        const wasAlive = !player.dead && !player.downed;
        player.takeDamage(8, bot.name, bot.team, 'AK-15', onKillFn, bot.pos);
        if (wasAlive && (player.downed || player.dead) && String(player.role).toUpperCase() === 'MEDIC') {
          bot.medicKills = (bot.medicKills || 0) + 1;
        }
      } else {
        const res = this.damageBot(
          target.unit,
          24,
          bot.name,
          bot.team,
          'AK-15',
          Math.random() < 0.16,
          onKillFn
        );
        if (res.killed) {
          bot.kills++;
          if (target.unit && target.unit.role === 'MEDIC') {
            bot.medicKills = (bot.medicKills || 0) + 1;
          }
          bot.score += 100;
        }
      }
    } else {
      // Near-miss suppression: bullets landing close to player cause suppression (Squad-style)
      if (target.isPlayer && distToTarget < 35 && typeof player.applySuppression === 'function') {
        const intensity = Math.max(0.05, 0.2 * (1 - distToTarget / 35));
        player.applySuppression(intensity);
      }
    }
  }
}
