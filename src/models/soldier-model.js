// ============================================================================
// 3D SOLDIER CHARACTER MODEL BUILDER (src/models/soldier-model.js)
// Shared-geometry & shared-material 3D soldier character mesh builder
// supporting up to 250 active AI soldiers with minimal memory overhead.
// ============================================================================

import * as THREE from '../../vendor/three.module.js';
import { TEXTURES } from '../assets/textures.js?v=136';
import { WEAPON_DEFS } from '../assets/weapon-defs.js?v=136';
import { createWeaponViewModel } from './weapon-model.js?v=136';

export function getDefaultWeaponIdForRole(team = 'US', role = 'ASSAULT') {
  const r = String(role || 'ASSAULT').toUpperCase();
  const isRU = team === 'RU';
  if (r === 'SWORDSMAN') return 'longsword';
  if (r === 'GREATSWORD_KNIGHT') return 'greatsword_2h';
  if (r === 'POLEARM_KNIGHT') return 'knight_lance';
  if (r === 'ARCHER') return 'warbow';
  if (r === 'CROSSBOWMAN') return 'heavy_crossbow';
  if (r === 'MOUNTED_KNIGHT') return 'warbow';
  if (r === 'RAPTOR' || r === 'TRICERATOPS' || r === 'TREX') return 'raptor_claws';
  if (r === 'DILOPHOSAURUS') return 'dino_venom';
  if (r === 'RECON') return isRU ? 'sv98' : 'mk14';
  if (r === 'SUPPORT') return isRU ? 'pkp' : 'm249';
  if (r === 'MEDIC') return isRU ? 'mp7' : 'vector';
  return isRU ? 'ak15' : 'm4a1';
}

let sharedGeos = null;
const sharedMats = {
  common: null,
  US: null,
  RU: null
};

function markShared(item) {
  item.userData.shared = true;
  return item;
}

const SHARED_MUZZLE_FLASH_MAT = markShared(
  new THREE.MeshBasicMaterial({
    color: 0xffd166,
    transparent: true,
    opacity: 0.92,
    depthWrite: false
  })
);

const _boxGeoCache = new Map();
const _cylGeoCache = new Map();
const _coneGeoCache = new Map();
const _sphereGeoCache = new Map();
const _torusGeoCache = new Map();
const _stdMatCache = new Map();
const _basicMatCache = new Map();

function getCachedBoxGeo(w, h, d) {
  const k = `${w}|${h}|${d}`;
  let g = _boxGeoCache.get(k);
  if (!g) {
    g = markShared(new THREE.BoxGeometry(w, h, d));
    _boxGeoCache.set(k, g);
  }
  return g;
}

function getCachedCylGeo(rt, rb, h, seg = 8) {
  const k = `${rt}|${rb}|${h}|${seg}`;
  let g = _cylGeoCache.get(k);
  if (!g) {
    g = markShared(new THREE.CylinderGeometry(rt, rb, h, seg));
    _cylGeoCache.set(k, g);
  }
  return g;
}

function getCachedConeGeo(r, h, seg = 6) {
  const k = `${r}|${h}|${seg}`;
  let g = _coneGeoCache.get(k);
  if (!g) {
    g = markShared(new THREE.ConeGeometry(r, h, seg));
    _coneGeoCache.set(k, g);
  }
  return g;
}

function getCachedSphereGeo(r, ws = 8, hs = 8) {
  const k = `${r}|${ws}|${hs}`;
  let g = _sphereGeoCache.get(k);
  if (!g) {
    g = markShared(new THREE.SphereGeometry(r, ws, hs));
    _sphereGeoCache.set(k, g);
  }
  return g;
}

function getCachedTorusGeo(r, tube, rs = 6, ts = 12, arc = Math.PI * 2) {
  const k = `${r}|${tube}|${rs}|${ts}|${arc}`;
  let g = _torusGeoCache.get(k);
  if (!g) {
    g = markShared(new THREE.TorusGeometry(r, tube, rs, ts, arc));
    _torusGeoCache.set(k, g);
  }
  return g;
}

function getCachedStdMat(color, roughness = 0.8, metalness = 0, flatShading = false) {
  const k = `${color}|${roughness}|${metalness}|${flatShading ? 1 : 0}`;
  let m = _stdMatCache.get(k);
  if (!m) {
    m = markShared(
      new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading })
    );
    _stdMatCache.set(k, m);
  }
  return m;
}

function getCachedBasicMat(color) {
  let m = _basicMatCache.get(color);
  if (!m) {
    m = markShared(new THREE.MeshBasicMaterial({ color }));
    _basicMatCache.set(color, m);
  }
  return m;
}

function getSharedGeometries() {
  if (!sharedGeos) {
    const rpgLauncherTube = markShared(new THREE.CylinderGeometry(0.055, 0.065, 1.05, 8));
    const rpgWarheadCone = markShared(new THREE.ConeGeometry(0.095, 0.32, 6));
    sharedGeos = {
      belt: markShared(new THREE.BoxGeometry(0.54, 0.12, 0.32)),
      thigh: markShared(new THREE.BoxGeometry(0.22, 0.36, 0.22)),
      kneePad: markShared(new THREE.BoxGeometry(0.23, 0.1, 0.06)),
      shin: markShared(new THREE.BoxGeometry(0.2, 0.34, 0.2)),
      boot: markShared(new THREE.BoxGeometry(0.22, 0.14, 0.29)),
      torso: markShared(new THREE.BoxGeometry(0.52, 0.68, 0.28)),
      vest: markShared(new THREE.BoxGeometry(0.56, 0.48, 0.35)),
      magPouch: markShared(new THREE.BoxGeometry(0.11, 0.18, 0.06)),
      backpack: markShared(new THREE.BoxGeometry(0.38, 0.42, 0.18)),
      crossH: markShared(new THREE.BoxGeometry(0.18, 0.05, 0.02)),
      crossV: markShared(new THREE.BoxGeometry(0.05, 0.18, 0.02)),
      rpgBackTube: markShared(new THREE.BoxGeometry(0.09, 0.78, 0.09)),
      rpgBackCone: markShared(new THREE.ConeGeometry(0.08, 0.24, 6)),
      reconAntenna: markShared(new THREE.BoxGeometry(0.025, 0.55, 0.025)),
      slAntenna: markShared(new THREE.BoxGeometry(0.03, 0.72, 0.03)),
      slAntennaTip: markShared(new THREE.BoxGeometry(0.06, 0.08, 0.06)),
      neck: markShared(new THREE.BoxGeometry(0.24, 0.12, 0.24)),
      head: markShared(new THREE.BoxGeometry(0.36, 0.36, 0.36)),
      balaclava: markShared(new THREE.BoxGeometry(0.37, 0.17, 0.37)),
      goggles: markShared(new THREE.BoxGeometry(0.35, 0.11, 0.06)),
      helmet: markShared(new THREE.BoxGeometry(0.43, 0.21, 0.43)),
      nvgMount: markShared(new THREE.BoxGeometry(0.1, 0.09, 0.05)),
      rankBand: markShared(new THREE.BoxGeometry(0.445, 0.045, 0.445)),
      upperArm: markShared(new THREE.BoxGeometry(0.17, 0.32, 0.17)),
      forearm: markShared(new THREE.BoxGeometry(0.15, 0.32, 0.15)),
      gunReceiver: markShared(new THREE.BoxGeometry(0.075, 0.12, 0.48)),
      gunBarrel: markShared(new THREE.BoxGeometry(0.04, 0.04, 0.36)),
      gunMag: markShared(new THREE.BoxGeometry(0.055, 0.18, 0.09)),
      gunOptic: markShared(new THREE.BoxGeometry(0.06, 0.07, 0.11)),
      muzzleFlash: markShared(new THREE.OctahedronGeometry(0.14, 0)),
      rpgLauncherTube,
      rpgWarheadCone,
      marker: markShared(new THREE.OctahedronGeometry(0.12, 0))
    };
  }
  return sharedGeos;
}

function getSharedMaterials(team) {
  if (!sharedMats.common) {
    sharedMats.common = {
      skinMat: markShared(new THREE.MeshStandardMaterial({ color: 0xe0b899, roughness: 0.8, flatShading: true })),
      gunMat: markShared(new THREE.MeshStandardMaterial({ color: 0x1e2226, roughness: 0.55, flatShading: true })),
      bootMat: markShared(new THREE.MeshStandardMaterial({ color: 0x1b1e21, roughness: 0.9 })),
      crossMat: markShared(new THREE.MeshBasicMaterial({ color: 0xffffff })),
      warheadMat: markShared(new THREE.MeshStandardMaterial({ color: 0x4b6542, roughness: 0.7, flatShading: true })),
      rpgTubeMat: markShared(new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.75, flatShading: true })),
      rpgShoulderConeMat: markShared(new THREE.MeshStandardMaterial({ color: 0x4b6542, roughness: 0.65, flatShading: true })),
      gogglesMat: markShared(new THREE.MeshBasicMaterial({ color: 0x161a20 })),
      tipCmdMat: markShared(new THREE.MeshBasicMaterial({ color: 0xf1c40f })),
      tipSlMat: markShared(new THREE.MeshBasicMaterial({ color: 0x2ecc71 })),
      bandCmdMat: markShared(new THREE.MeshBasicMaterial({ color: 0xf1c40f })),
      bandSlMat: markShared(new THREE.MeshBasicMaterial({ color: 0x00d2d3 }))
    };
  }

  const teamKey = team === 'US' ? 'US' : 'RU';
  if (!sharedMats[teamKey]) {
    const vestColor = teamKey === 'US' ? 0x263849 : 0x452d25;
    const helmetColor = teamKey === 'US' ? 0x2980b9 : 0xc0392b;
    const pouchColor = teamKey === 'US' ? 0x1c2a38 : 0x33201a;
    sharedMats[teamKey] = {
      uniformMat: markShared(
        new THREE.MeshStandardMaterial({
          map: teamKey === 'US' ? TEXTURES.camoUS : TEXTURES.camoRU,
          roughness: 0.85
        })
      ),
      vestMat: markShared(new THREE.MeshStandardMaterial({ color: vestColor, roughness: 0.8, flatShading: true })),
      pouchMat: markShared(new THREE.MeshStandardMaterial({ color: pouchColor, roughness: 0.85, flatShading: true })),
      helmetMat: markShared(new THREE.MeshStandardMaterial({ color: helmetColor, roughness: 0.65, flatShading: true })),
      markerMat: markShared(new THREE.MeshBasicMaterial({ color: teamKey === 'US' ? 0x3498db : 0xe74c3c }))
    };
  }

  return {
    ...sharedMats.common,
    ...sharedMats[teamKey]
  };
}

export function createSoldierMesh(team = 'US', role = 'ASSAULT', commandRank = 'MEMBER', era = 'modern') {
  const root = new THREE.Group();
  const geos = getSharedGeometries();
  const mats = getSharedMaterials(team);

  const {
    uniformMat,
    vestMat,
    pouchMat,
    helmetMat,
    skinMat,
    gunMat,
    bootMat,
    crossMat,
    warheadMat,
    rpgTubeMat,
    rpgShoulderConeMat,
    gogglesMat,
    tipCmdMat,
    tipSlMat,
    bandCmdMat,
    bandSlMat,
    markerMat
  } = mats;

  // 1. ARTICULATED PELVIS & MULTI-JOINT LEGS
  const pelvisGroup = new THREE.Group();
  pelvisGroup.position.set(0, 0.78, 0);

  const beltMesh = new THREE.Mesh(geos.belt, pouchMat);
  beltMesh.position.set(0, -0.02, 0);
  pelvisGroup.add(beltMesh);

  const leftLegPivot = new THREE.Group();
  leftLegPivot.position.set(-0.14, -0.04, 0);
  const leftThigh = new THREE.Mesh(geos.thigh, uniformMat);
  leftThigh.position.y = -0.18;
  leftThigh.userData.hitZone = 'leftLeg';
  const leftKneePad = new THREE.Mesh(geos.kneePad, bootMat);
  leftKneePad.position.set(0, -0.34, 0.1);
  leftKneePad.userData.hitZone = 'leftLeg';

  const leftShinPivot = new THREE.Group();
  leftShinPivot.position.set(0, -0.36, 0);
  const leftShin = new THREE.Mesh(geos.shin, uniformMat);
  leftShin.position.y = -0.17;
  leftShin.userData.hitZone = 'leftLeg';
  const leftBoot = new THREE.Mesh(geos.boot, bootMat);
  leftBoot.position.set(0, -0.34, 0.03);
  leftBoot.userData.hitZone = 'leftLeg';
  leftShinPivot.add(leftShin, leftBoot);
  leftLegPivot.add(leftThigh, leftKneePad, leftShinPivot);

  const rightLegPivot = new THREE.Group();
  rightLegPivot.position.set(0.14, -0.04, 0);
  const rightThigh = new THREE.Mesh(geos.thigh, uniformMat);
  rightThigh.position.y = -0.18;
  rightThigh.userData.hitZone = 'rightLeg';
  const rightKneePad = new THREE.Mesh(geos.kneePad, bootMat);
  rightKneePad.position.set(0, -0.34, 0.1);
  rightKneePad.userData.hitZone = 'rightLeg';

  const rightShinPivot = new THREE.Group();
  rightShinPivot.position.set(0, -0.36, 0);
  const rightShin = new THREE.Mesh(geos.shin, uniformMat);
  rightShin.position.y = -0.17;
  rightShin.userData.hitZone = 'rightLeg';
  const rightBoot = new THREE.Mesh(geos.boot, bootMat);
  rightBoot.position.set(0, -0.34, 0.03);
  rightBoot.userData.hitZone = 'rightLeg';
  rightShinPivot.add(rightShin, rightBoot);
  rightLegPivot.add(rightThigh, rightKneePad, rightShinPivot);

  pelvisGroup.add(leftLegPivot, rightLegPivot);

  // 2. ARTICULATED UPPER BODY
  const upperBody = new THREE.Group();
  upperBody.position.set(0, 0.78, 0);

  const torso = new THREE.Mesh(geos.torso, uniformMat);
  torso.position.set(0, 0.34, 0);
  torso.userData.isTorso = true;
  torso.userData.hitZone = 'thorax';

  const vest = new THREE.Mesh(geos.vest, vestMat);
  vest.position.set(0, 0.36, 0);
  vest.userData.isArmor = true;
  vest.userData.isTorso = true;
  vest.userData.hitZone = 'thorax';

  const magPouches = [];
  for (const px of [-0.14, 0, 0.14]) {
    const pouch = new THREE.Mesh(geos.magPouch, pouchMat);
    pouch.position.set(px, 0.28, 0.19);
    pouch.userData.isArmor = true;
    upperBody.add(pouch);
    magPouches.push(pouch);
  }

  const packRole = typeof role === 'string' ? role.toUpperCase() : 'ASSAULT';
  const backpack = new THREE.Mesh(geos.backpack, pouchMat);
  backpack.position.set(0, 0.37, -0.22);
  upperBody.add(backpack);

  let rpgBackTube = null;
  const modernGearExtras = [];
  if (packRole === 'MEDIC') {
    const cH = new THREE.Mesh(geos.crossH, crossMat);
    const cV = new THREE.Mesh(geos.crossV, crossMat);
    cH.position.set(0, 0.38, -0.315);
    cV.position.set(0, 0.38, -0.315);
    upperBody.add(cH, cV);
    modernGearExtras.push(cH, cV);
  } else if (packRole === 'ENGINEER') {
    rpgBackTube = new THREE.Group();
    const tube = new THREE.Mesh(geos.rpgBackTube, gunMat);
    const cone = new THREE.Mesh(geos.rpgBackCone, warheadMat);
    cone.position.set(0, 0.48, 0);
    rpgBackTube.add(tube, cone);
    rpgBackTube.position.set(0.16, 0.48, -0.26);
    rpgBackTube.rotation.z = -0.28;
    upperBody.add(rpgBackTube);
    modernGearExtras.push(rpgBackTube);
  } else if (packRole === 'RECON') {
    const antenna = new THREE.Mesh(geos.reconAntenna, gunMat);
    antenna.position.set(-0.14, 0.78, -0.22);
    upperBody.add(antenna);
    modernGearExtras.push(antenna);
  }

  if (commandRank === 'COMMANDER' || commandRank === 'SQUAD_LEADER') {
    const slAntenna = new THREE.Mesh(geos.slAntenna, gunMat);
    slAntenna.position.set(-0.15, 0.86, -0.24);
    upperBody.add(slAntenna);
    const tipMesh = new THREE.Mesh(
      geos.slAntennaTip,
      commandRank === 'COMMANDER' ? tipCmdMat : tipSlMat
    );
    tipMesh.position.set(-0.15, 1.24, -0.24);
    upperBody.add(tipMesh);
    modernGearExtras.push(slAntenna, tipMesh);
  }

  // 3. HEAD, BALACLAVA, TACTICAL GOGGLES & NVG-MOUNT HELMET
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.86, 0);

  const neck = new THREE.Mesh(geos.neck, pouchMat);
  neck.position.set(0, -0.16, 0);

  const head = new THREE.Mesh(geos.head, skinMat);
  head.userData.isHead = true;
  head.userData.hitZone = 'head';

  const balaclava = new THREE.Mesh(geos.balaclava, pouchMat);
  balaclava.position.set(0, -0.09, 0);
  balaclava.userData.isHead = true;
  balaclava.userData.hitZone = 'head';

  const goggles = new THREE.Mesh(geos.goggles, gogglesMat);
  goggles.position.set(0, 0.03, 0.17);
  goggles.userData.isHead = true;
  goggles.userData.hitZone = 'head';

  const helmet = new THREE.Mesh(geos.helmet, helmetMat);
  helmet.position.set(0, 0.14, 0);
  helmet.userData.isHead = true;
  helmet.userData.isHelmet = true;
  helmet.userData.hitZone = 'head';

  const nvgMount = new THREE.Mesh(geos.nvgMount, gunMat);
  nvgMount.position.set(0, 0.14, 0.22);
  helmet.add(nvgMount);

  if (commandRank === 'COMMANDER' || commandRank === 'SQUAD_LEADER') {
    const rankBand = new THREE.Mesh(
      geos.rankBand,
      commandRank === 'COMMANDER' ? bandCmdMat : bandSlMat
    );
    rankBand.position.set(0, 0.02, 0);
    helmet.add(rankBand);
  }

  headGroup.add(neck, head, balaclava, goggles, helmet);

  // 4. ARTICULATED SHOULDERS, FOREARMS, RIFLE & 3D MUZZLE FLASH
  const weaponRig = new THREE.Group();
  weaponRig.position.set(0, 0.48, 0);

  const leftArm = new THREE.Group();
  leftArm.position.set(-0.31, 0.04, 0.04);
  const leftUpper = new THREE.Mesh(geos.upperArm, uniformMat);
  leftUpper.position.set(0.05, -0.1, 0.12);
  leftUpper.rotation.set(-0.75, 0.35, 0);
  leftUpper.userData.hitZone = 'leftArm';
  const leftFore = new THREE.Mesh(geos.forearm, uniformMat);
  leftFore.position.set(0.18, -0.16, 0.34);
  leftFore.rotation.set(-1.35, 0.52, 0);
  leftFore.userData.hitZone = 'leftArm';
  leftArm.add(leftUpper, leftFore);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.31, 0.04, 0.04);
  const rightUpper = new THREE.Mesh(geos.upperArm, uniformMat);
  rightUpper.position.set(-0.04, -0.1, 0.08);
  rightUpper.rotation.set(-0.65, -0.15, 0);
  rightUpper.userData.hitZone = 'rightArm';
  const rightFore = new THREE.Mesh(geos.forearm, uniformMat);
  rightFore.position.set(-0.09, -0.15, 0.26);
  rightFore.rotation.set(-1.3, -0.12, 0);
  rightFore.userData.hitZone = 'rightArm';
  rightArm.add(rightUpper, rightFore);

  const gunGroup = new THREE.Group();
  gunGroup.position.set(0.18, -0.1, 0.38);
  const gunReceiver = new THREE.Mesh(geos.gunReceiver, gunMat);
  const gunBarrel = new THREE.Mesh(geos.gunBarrel, gunMat);
  gunBarrel.position.set(0, 0.02, 0.34);
  const gunMag = new THREE.Mesh(geos.gunMag, pouchMat);
  gunMag.position.set(0, -0.12, 0.06);
  gunMag.rotation.x = 0.22;
  const gunOptic = new THREE.Mesh(geos.gunOptic, gunMat);
  gunOptic.position.set(0, 0.09, 0.02);

  // Shape the shared-geometry AI weapon by role (zero extra geometries/materials for 250-bot scale!)
  if (packRole === 'RECON') {
    gunBarrel.scale.set(0.9, 0.9, 1.55);
    gunBarrel.position.set(0, 0.02, 0.44);
    gunOptic.scale.set(1.1, 1.25, 1.85);
  } else if (packRole === 'SUPPORT') {
    gunReceiver.scale.set(1.2, 1.15, 1.12);
    gunBarrel.scale.set(1.15, 1.15, 1.28);
    gunBarrel.position.set(0, 0.02, 0.38);
    gunMag.scale.set(1.65, 1.1, 1.35);
  } else if (packRole === 'MEDIC') {
    gunReceiver.scale.set(0.95, 1.0, 0.78);
    gunBarrel.scale.set(0.95, 0.95, 0.72);
    gunBarrel.position.set(0, 0.02, 0.25);
  }

  const muzzleFlash = new THREE.Mesh(geos.muzzleFlash, SHARED_MUZZLE_FLASH_MAT);
  muzzleFlash.visible = false;
  muzzleFlash.position.set(0, 0.02, packRole === 'RECON' ? 0.72 : packRole === 'MEDIC' ? 0.44 : 0.56);
  muzzleFlash.userData.skipHitbox = true;

  gunReceiver.userData.skipHitbox = true;
  gunBarrel.userData.skipHitbox = true;
  gunMag.userData.skipHitbox = true;
  gunOptic.userData.skipHitbox = true;
  gunGroup.add(gunReceiver, gunBarrel, gunMag, gunOptic, muzzleFlash);

  const rpgShoulderGroup = new THREE.Group();
  rpgShoulderGroup.position.set(0.24, 0.12, 0.18);
  rpgShoulderGroup.visible = false;
  const rpgLauncherTube = new THREE.Mesh(geos.rpgLauncherTube, rpgTubeMat);
  rpgLauncherTube.rotation.x = Math.PI / 2;
  rpgLauncherTube.userData.skipHitbox = true;
  const rpgWarheadCone = new THREE.Mesh(geos.rpgWarheadCone, rpgShoulderConeMat);
  rpgWarheadCone.rotation.x = Math.PI / 2;
  rpgWarheadCone.position.set(0, 0, 0.62);
  rpgWarheadCone.userData.skipHitbox = true;
  rpgShoulderGroup.add(rpgLauncherTube, rpgWarheadCone);

  weaponRig.add(leftArm, rightArm, gunGroup, rpgShoulderGroup);
  upperBody.add(torso, vest, headGroup, weaponRig);

  const marker = new THREE.Mesh(geos.marker, markerMat);
  marker.position.set(0, 2.26, 0);
  marker.name = 'teamMarker';
  marker.visible = false;

  root.add(pelvisGroup, upperBody, marker);

  // ===========================================================================
  // ERA-ACCURATE 3D CHARACTER TRANSFORMATIONS (MEDIEVAL KNIGHTS & JURASSIC DINOS)
  // ===========================================================================
  const isDinoRole =
    (era === 'jurassic' && team === 'RU') ||
    packRole === 'RAPTOR' ||
    packRole === 'DILOPHOSAURUS' ||
    packRole === 'TRICERATOPS' ||
    packRole === 'TREX';
  const isMedievalRole =
    !isDinoRole &&
    (era === 'medieval' ||
      era === 'jurassic' ||
      packRole === 'SWORDSMAN' ||
      packRole === 'GREATSWORD_KNIGHT' ||
      packRole === 'POLEARM_KNIGHT' ||
      packRole === 'ARCHER' ||
      packRole === 'CROSSBOWMAN' ||
      packRole === 'MOUNTED_KNIGHT');

  if (isMedievalRole) {
    // Hide modern firearm parts, modern magazine pouches, backpacks & radio antennas
    gunReceiver.visible = false;
    gunBarrel.visible = false;
    gunMag.visible = false;
    gunOptic.visible = false;
    muzzleFlash.visible = false;
    goggles.visible = false;
    nvgMount.visible = false;
    backpack.visible = false;
    for (const p of magPouches) p.visible = false;
    for (const ex of modernGearExtras) ex.visible = false;

    const steelMat = getCachedStdMat(0xd0d7de, 0.25, 0.85, true);
    const goldMat = getCachedStdMat(0xd4af37, 0.3, 0.8, false);
    const heraldMat = getCachedStdMat(team === 'US' ? 0x1d4ed8 : 0xb91c1c, 0.65, 0, false);
    const woodMat = getCachedStdMat(0x6b4226, 0.85, 0, false);

    // Crusader Great Helm Visor Cross & Heraldic Plume
    const helmVisor = new THREE.Mesh(getCachedBoxGeo(0.39, 0.32, 0.39), steelMat);
    helmVisor.position.set(0, 0.22, 0);
    helmVisor.userData.isHead = true;
    const visorCross = new THREE.Mesh(getCachedBoxGeo(0.24, 0.24, 0.04), goldMat);
    visorCross.position.set(0, 0.22, 0.19);
    visorCross.userData.skipHitbox = true;
    const plume = new THREE.Mesh(getCachedBoxGeo(0.1, 0.26, 0.32), heraldMat);
    plume.position.set(0, 0.44, -0.06);
    plume.userData.skipHitbox = true;
    headGroup.add(helmVisor, visorCross, plume);

    // 3D Hip/Back Scabbard + Slung Broadsword Hilt (`swordScabbardGroup` & `slungSwordHiltGroup`)
    const swordScabbardGroup = new THREE.Group();
    swordScabbardGroup.name = 'swordScabbardGroup';
    swordScabbardGroup.position.set(0.23, 0.04, -0.08);
    swordScabbardGroup.rotation.set(0.72, 0.14, -0.22);
    const scabbardSheath = new THREE.Mesh(getCachedBoxGeo(0.06, 0.78, 0.028), woodMat);
    scabbardSheath.position.set(0, -0.28, 0);
    scabbardSheath.userData.skipHitbox = true;
    const scabbardLocket3p = new THREE.Mesh(getCachedBoxGeo(0.072, 0.045, 0.036), goldMat);
    scabbardLocket3p.position.set(0, 0.09, 0);
    scabbardLocket3p.userData.skipHitbox = true;
    const scabbardChape3p = new THREE.Mesh(getCachedConeGeo(0.036, 0.12, 4), goldMat);
    scabbardChape3p.position.set(0, -0.71, 0);
    scabbardChape3p.rotation.x = Math.PI;
    scabbardChape3p.rotation.y = Math.PI / 4;
    scabbardChape3p.userData.skipHitbox = true;
    swordScabbardGroup.add(scabbardSheath, scabbardLocket3p, scabbardChape3p);

    const slungSwordHiltGroup = new THREE.Group();
    slungSwordHiltGroup.name = 'slungSwordHiltGroup';
    const slungCrossguard = new THREE.Mesh(getCachedBoxGeo(0.22, 0.032, 0.038), goldMat);
    slungCrossguard.position.set(0, 0.12, 0);
    slungCrossguard.userData.skipHitbox = true;
    const slungGrip = new THREE.Mesh(getCachedCylGeo(0.018, 0.02, 0.16, 8), woodMat);
    slungGrip.position.set(0, 0.21, 0);
    slungGrip.userData.skipHitbox = true;
    const slungPommel = new THREE.Mesh(getCachedSphereGeo(0.028, 8, 8), goldMat);
    slungPommel.position.set(0, 0.30, 0);
    slungPommel.userData.skipHitbox = true;
    slungSwordHiltGroup.add(slungCrossguard, slungGrip, slungPommel);
    slungSwordHiltGroup.visible =
      packRole === 'MOUNTED_KNIGHT' || packRole === 'ARCHER' || packRole === 'CROSSBOWMAN';
    swordScabbardGroup.add(slungSwordHiltGroup);
    pelvisGroup.add(swordScabbardGroup);
    root.userData.swordScabbardGroup = swordScabbardGroup;
    root.userData.slungSwordHiltGroup = slungSwordHiltGroup;

    if (packRole === 'MOUNTED_KNIGHT') {
      // Curved English Yew Longbow in hands (with Broadsword visibly slung in hip scabbard!)
      const bowArc = new THREE.Mesh(getCachedTorusGeo(0.42, 0.025, 6, 12, Math.PI), woodMat);
      bowArc.rotation.y = Math.PI / 2;
      bowArc.position.set(0, 0.05, 0.25);
      bowArc.userData.skipHitbox = true;
      gunGroup.add(bowArc);

      // 3D Armored Warhorse Mount underneath the Mounted Knight
      const horseGroup = new THREE.Group();
      const horseBody = new THREE.Mesh(getCachedBoxGeo(0.52, 0.64, 1.54), woodMat);
      horseBody.position.set(0, 0.88, 0);
      horseBody.userData.skipHitbox = true;
      const horseBarding = new THREE.Mesh(getCachedBoxGeo(0.56, 0.56, 1.48), heraldMat);
      horseBarding.position.set(0, 0.82, 0);
      horseBarding.userData.skipHitbox = true;
      const horseNeck = new THREE.Mesh(getCachedBoxGeo(0.32, 0.72, 0.38), woodMat);
      horseNeck.position.set(0, 1.35, 0.68);
      horseNeck.rotation.x = -0.45;
      horseNeck.userData.skipHitbox = true;
      const horseHead = new THREE.Mesh(getCachedBoxGeo(0.28, 0.32, 0.58), steelMat);
      horseHead.position.set(0, 1.62, 0.98);
      horseHead.rotation.x = -0.35;
      horseHead.userData.skipHitbox = true;
      horseGroup.add(horseBody, horseBarding, horseNeck, horseHead);
      const horseLegGeo = getCachedBoxGeo(0.15, 0.82, 0.15);
      for (const [lx, lz] of [
        [-0.21, -0.54],
        [0.21, -0.54],
        [-0.21, 0.54],
        [0.21, 0.54]
      ]) {
        const hLeg = new THREE.Mesh(horseLegGeo, woodMat);
        hLeg.position.set(lx, 0.41, lz);
        hLeg.userData.skipHitbox = true;
        horseGroup.add(hLeg);
      }
      root.add(horseGroup);
      pelvisGroup.position.y += 0.58;
      upperBody.position.y += 0.58;
      marker.position.y += 0.58;
    } else if (packRole === 'ARCHER') {
      // Foot Longbow Archer: Curved English Yew Longbow + Back Arrow Quiver
      const bowArc = new THREE.Mesh(getCachedTorusGeo(0.45, 0.026, 6, 12, Math.PI), woodMat);
      bowArc.rotation.y = Math.PI / 2;
      bowArc.position.set(0, 0.05, 0.25);
      bowArc.userData.skipHitbox = true;
      gunGroup.add(bowArc);
    } else if (packRole === 'CROSSBOWMAN') {
      // Rhodok Siege Crossbowman: Horizontal Arbalest Crossbow in hands + Large Pavise Tower Shield slung on back!
      const xbowStock = new THREE.Mesh(getCachedBoxGeo(0.06, 0.08, 0.62), woodMat);
      xbowStock.position.set(0, 0.02, 0.22);
      xbowStock.userData.skipHitbox = true;
      const xbowProd = new THREE.Mesh(getCachedBoxGeo(0.58, 0.035, 0.04), steelMat);
      xbowProd.position.set(0, 0.05, 0.48);
      xbowProd.userData.skipHitbox = true;
      gunGroup.add(xbowStock, xbowProd);
      const backPavise = new THREE.Mesh(getCachedBoxGeo(0.58, 0.86, 0.045), heraldMat);
      backPavise.position.set(0, 0.38, -0.32);
      backPavise.userData.skipHitbox = true;
      upperBody.add(backPavise);
    } else if (packRole === 'POLEARM_KNIGHT') {
      // Knight with Long Spear / Polearm: 2.3m ash shaft + steel spearhead & halberd axe blade + heraldic pennant
      const spearShaft = new THREE.Mesh(getCachedCylGeo(0.024, 0.028, 2.25, 8), woodMat);
      spearShaft.rotation.x = Math.PI / 2 - 0.18;
      spearShaft.position.set(0, 0.16, 0.58);
      spearShaft.userData.skipHitbox = true;
      const spearHead = new THREE.Mesh(getCachedConeGeo(0.05, 0.36, 4), steelMat);
      spearHead.rotation.x = Math.PI / 2 - 0.18;
      spearHead.position.set(0, 0.38, 1.72);
      spearHead.userData.skipHitbox = true;
      const pennant = new THREE.Mesh(getCachedBoxGeo(0.24, 0.12, 0.01), heraldMat);
      pennant.position.set(0.12, 0.32, 1.42);
      pennant.userData.skipHitbox = true;
      gunGroup.add(spearShaft, spearHead, pennant);
    } else if (packRole === 'GREATSWORD_KNIGHT') {
      // 2H Double-Handed Greatsword / Zweihänder (No Shield — Pure Two-Handed Shock Blade)
      const greatBlade = new THREE.Mesh(getCachedBoxGeo(0.072, 1.28, 0.024), steelMat);
      greatBlade.name = 'thirdPersonSwordBlade';
      greatBlade.position.set(0, 0.56, 0.18);
      greatBlade.rotation.x = 0.32;
      greatBlade.userData.skipHitbox = true;
      const greatGuard = new THREE.Mesh(getCachedBoxGeo(0.36, 0.045, 0.045), goldMat);
      greatGuard.name = 'thirdPersonCrossGuard';
      greatGuard.position.set(0, 0.04, 0.04);
      greatGuard.userData.skipHitbox = true;
      gunGroup.add(greatBlade, greatGuard);
    } else {
      // 1H Templar Arming Sword (Right Hand) + 1H Heraldic Heater Shield (Left Arm)
      const swordBlade = new THREE.Mesh(getCachedBoxGeo(0.05, 0.88, 0.02), steelMat);
      swordBlade.name = 'thirdPersonSwordBlade';
      swordBlade.position.set(0, 0.38, 0.18);
      swordBlade.rotation.x = 0.35;
      swordBlade.userData.skipHitbox = true;
      const crossGuard = new THREE.Mesh(getCachedBoxGeo(0.24, 0.04, 0.04), goldMat);
      crossGuard.name = 'thirdPersonCrossGuard';
      crossGuard.position.set(0, 0.02, 0.04);
      crossGuard.userData.skipHitbox = true;
      const kiteShield = new THREE.Mesh(getCachedBoxGeo(0.46, 0.68, 0.05), heraldMat);
      kiteShield.name = 'thirdPersonKiteShield';
      kiteShield.position.set(-0.36, 0.02, 0.12);
      kiteShield.rotation.y = 0.35;
      kiteShield.userData.skipHitbox = true;
      gunGroup.add(swordBlade, crossGuard, kiteShield);
    }
  } else if (isDinoRole) {
    // ─── JURASSIC ERA DINOSAUR MORPH (VELOCIRAPTOR / DILOPHOSAURUS / TRICERATOPS / T-REX) ───
    // Completely hide ALL human firearms, muzzle flashes, magazine pouches, backpacks, boots, helmets & radio antennas!
    root.userData.isDinoMorph = true;
    gunGroup.visible = false;
    gunReceiver.visible = false;
    gunBarrel.visible = false;
    gunMag.visible = false;
    gunOptic.visible = false;
    muzzleFlash.visible = false;
    rpgShoulderGroup.visible = false;
    helmet.visible = false;
    vest.visible = false;
    beltMesh.visible = false;
    backpack.visible = false;
    goggles.visible = false;
    nvgMount.visible = false;
    balaclava.visible = false;
    leftKneePad.visible = false;
    rightKneePad.visible = false;
    leftBoot.visible = false;
    rightBoot.visible = false;
    for (const p of magPouches) p.visible = false;
    for (const ex of modernGearExtras) ex.visible = false;

    const isTRex = packRole === 'TREX' || commandRank === 'COMMANDER';
    const isTrike = packRole === 'TRICERATOPS';
    const isDilo = packRole === 'DILOPHOSAURUS';
    const dinoColor = isTRex
      ? 0x4a5d32
      : isTrike
      ? 0x6e5a3b
      : isDilo
      ? 0x2e7d32
      : 0x3b6e35;
    const dinoSkinMat = getCachedStdMat(dinoColor, 0.78, 0, true);
    const boneHornMat = getCachedStdMat(0xf1ebd8, 0.5, 0, false);
    const eyeGlowMat = getCachedBasicMat(0xffd32a);

    torso.material = dinoSkinMat;
    torso.scale.set(1.25, 1.15, 1.65);
    head.material = dinoSkinMat;
    neck.material = dinoSkinMat;
    leftThigh.material = dinoSkinMat;
    rightThigh.material = dinoSkinMat;
    leftShin.material = dinoSkinMat;
    rightShin.material = dinoSkinMat;
    leftUpper.material = dinoSkinMat;
    leftFore.material = dinoSkinMat;
    rightUpper.material = dinoSkinMat;
    rightFore.material = dinoSkinMat;

    // Pose Dinosaur clawed forelimbs tucked at chest level with 3 ivory sickle talons per hand (NEVER holding a gun!)
    leftUpper.position.set(0.02, -0.14, 0.14);
    leftUpper.rotation.set(-0.55, 0.1, 0);
    leftFore.position.set(0.02, -0.26, 0.30);
    leftFore.rotation.set(-1.1, 0.08, 0);
    rightUpper.position.set(-0.02, -0.14, 0.14);
    rightUpper.rotation.set(-0.55, -0.1, 0);
    rightFore.position.set(-0.02, -0.26, 0.30);
    rightFore.rotation.set(-1.1, -0.08, 0);

    const talonGeo = getCachedConeGeo(0.024, 0.18, 4);
    for (const clawFore of [leftFore, rightFore]) {
      for (const cx of [-0.04, 0, 0.04]) {
        const talon = new THREE.Mesh(talonGeo, boneHornMat);
        talon.rotation.x = Math.PI / 2.2;
        talon.position.set(cx, -0.16, 0.08);
        talon.userData.skipHitbox = true;
        clawFore.add(talon);
      }
    }

    // Elongated Dinosaur Snout, Jaws, Teeth & Glowing Predator Eyes on `headGroup`
    const dinoSnout = new THREE.Mesh(getCachedBoxGeo(0.48, 0.38, 0.82), dinoSkinMat);
    dinoSnout.position.set(0, 0.22, 0.36);
    dinoSnout.userData.isHead = true;
    const dinoJaw = new THREE.Mesh(getCachedBoxGeo(0.42, 0.18, 0.74), boneHornMat);
    dinoJaw.position.set(0, 0.04, 0.34);
    dinoJaw.rotation.x = 0.24;
    dinoJaw.userData.isHead = true;
    const dinoEyeGeo = getCachedBoxGeo(0.08, 0.08, 0.12);
    const leftEye = new THREE.Mesh(dinoEyeGeo, eyeGlowMat);
    leftEye.position.set(-0.25, 0.3, 0.25);
    leftEye.userData.skipHitbox = true;
    const rightEye = new THREE.Mesh(dinoEyeGeo, eyeGlowMat);
    rightEye.position.set(0.25, 0.3, 0.25);
    rightEye.userData.skipHitbox = true;
    headGroup.add(dinoSnout, dinoJaw, leftEye, rightEye);

    if (isDilo) {
      // Dilophosaurus Dual Venom Neck Frill
      const frill = new THREE.Mesh(
        getCachedCylGeo(0.55, 0.18, 0.08, 8),
        getCachedStdMat(0xe67e22, 0.6, 0, false)
      );
      frill.rotation.x = Math.PI / 2;
      frill.position.set(0, 0.24, 0.05);
      frill.userData.skipHitbox = true;
      headGroup.add(frill);
    } else if (isTrike) {
      // Triceratops Brow Shield & 3 Ivory Horns
      const shield = new THREE.Mesh(getCachedBoxGeo(0.92, 0.72, 0.12), dinoSkinMat);
      shield.position.set(0, 0.42, -0.05);
      shield.rotation.x = -0.25;
      shield.userData.isHead = true;
      headGroup.add(shield);
      const trikeHornGeo = getCachedConeGeo(0.07, 0.62, 5);
      for (const hx of [-0.26, 0.26]) {
        const horn = new THREE.Mesh(trikeHornGeo, boneHornMat);
        horn.rotation.x = Math.PI / 2.2;
        horn.position.set(hx, 0.38, 0.55);
        horn.userData.skipHitbox = true;
        headGroup.add(horn);
      }
    }

    // Long Counterbalancing Dinosaur Tail extending behind torso
    const dinoTail = new THREE.Mesh(getCachedConeGeo(0.28, 1.85, 6), dinoSkinMat);
    dinoTail.rotation.x = -Math.PI / 2 + 0.18;
    dinoTail.position.set(0, -0.05, -0.95);
    dinoTail.userData.skipHitbox = true;
    upperBody.add(dinoTail);

    // Scale up Dinosaurs significantly so T-Rex, Triceratops, Velociraptors & Dilophosaurus tower over infantry!
    if (isTRex) {
      root.scale.setScalar(3.45);
    } else if (isTrike) {
      root.scale.setScalar(2.55);
    } else if (isDilo) {
      root.scale.setScalar(1.95);
    } else {
      root.scale.setScalar(2.15);
    }
  }

  const parts = {
    pelvisGroup,
    leftLeg: leftLegPivot,
    rightLeg: rightLegPivot,
    leftShin: leftShinPivot,
    rightShin: rightShinPivot,
    leftArm,
    rightArm,
    leftUpper,
    leftFore,
    rightUpper,
    rightFore,
    upperBody,
    headGroup,
    weaponRig,
    gunGroup,
    rpgShoulderGroup,
    rpgBackTube,
    muzzleFlash,
    defaultMuzzleFlash: muzzleFlash,
    helmet,
    vest,
    marker
  };
  root.userData.parts = parts;
  root.userData.lodDetailMeshes =
    isMedievalRole || isDinoRole
      ? null
      : [
          beltMesh,
          leftKneePad,
          rightKneePad,
          ...magPouches,
          backpack,
          ...modernGearExtras.filter((ex) => ex !== rpgBackTube),
          neck,
          balaclava,
          goggles,
          nvgMount
        ];
  root.userData.farLimbLodMeshes =
    isMedievalRole || isDinoRole
      ? null
      : [leftUpper, leftFore, rightUpper, rightFore, leftBoot, rightBoot];

  // Freeze static leaf Mesh matrices while keeping all Group pivots & dynamic parts auto-updating
  const dynamicSet = new Set(Object.values(parts).filter(Boolean));
  root.traverse((child) => {
    if (child.isMesh && !dynamicSet.has(child)) {
      child.updateMatrix();
      child.matrixAutoUpdate = false;
    }
  });

  root._culledOffFrustum = false;
  root.updateMatrixWorld = function updateSoldierMatrixWorld(force) {
    if (!this.visible || this._culledOffFrustum) return;
    THREE.Group.prototype.updateMatrixWorld.call(this, force);
  };

  return root;
}

/**
 * Dynamically updates a 3rd-person soldier's held weapon mesh (`parts.gunGroup`) and arm grip posture
 * to match the exact weapon (`weaponId`), skin (`skinFinish`), and Gunsmith attachments (`attachments`)
 * that a player or bot is currently using.
 */
export function updateSoldierEquippedWeapon(
  soldierMesh,
  weaponId,
  team = 'US',
  opts = {}
) {
  if (!soldierMesh || !soldierMesh.userData || !soldierMesh.userData.parts) {
    return false;
  }
  const parts = soldierMesh.userData.parts;
  const { gunGroup, leftUpper, leftFore, rightUpper, rightFore, rpgBackTube } = parts;
  if (!gunGroup) return false;

  const roleKey = String(opts.role || 'ASSAULT').toUpperCase();
  const fallbackId = getDefaultWeaponIdForRole(team, roleKey);
  const cleanId = weaponId && WEAPON_DEFS[weaponId] ? weaponId : fallbackId;
  const baseDef = WEAPON_DEFS[cleanId] || WEAPON_DEFS.m4a1;

  // Dinosaurs NEVER hold human firearms or wear RPG tubes on their backs!
  if (
    soldierMesh.userData.isDinoMorph ||
    roleKey === 'RAPTOR' ||
    roleKey === 'DILOPHOSAURUS' ||
    roleKey === 'TRICERATOPS' ||
    roleKey === 'TREX' ||
    baseDef.isDinoClaws ||
    baseDef.isVenomSpit
  ) {
    gunGroup.visible = false;
    if (rpgBackTube) rpgBackTube.visible = false;
    if (parts.muzzleFlash) parts.muzzleFlash.visible = false;
    return false;
  }
  const skinFinish = opts.skinFinish || null;
  const attObj =
    opts.attachments && typeof opts.attachments === 'object' ? opts.attachments : null;
  const attSig = attObj
    ? `${attObj.muzzle || ''}:${attObj.magazine || ''}:${attObj.optic || ''}:${attObj.grip || ''}`
    : '';
  const sig = `${cleanId}|${team}|${skinFinish || ''}|${attSig}`;

  if (soldierMesh.userData.equippedWeaponSig === sig) {
    return false;
  }
  soldierMesh.userData.equippedWeaponSig = sig;
  soldierMesh.userData.equippedWeaponId = cleanId;
  soldierMesh.userData.equippedWeaponName = baseDef.shortName || baseDef.name || cleanId.toUpperCase();
  soldierMesh.userData.equippedWeaponType = baseDef.type || 'gun';
  soldierMesh.userData.equippedWeaponSlot =
    baseDef.slot || (baseDef.type === 'gun' ? 'primary' : baseDef.type);

  // Build customized weapon definition with active skin and optic
  let activeOpticType = baseDef.opticType || null;
  if (attObj && attObj.optic && attObj.optic !== 'factory') {
    activeOpticType =
      attObj.optic === 'holo'
        ? 'holo'
        : attObj.optic === 'acog'
        ? 'acog'
        : attObj.optic === 'sniper8x'
        ? 'sniper8x'
        : 'reddot';
  }
  const customDef = {
    ...baseDef,
    opticType: activeOpticType,
    ...(skinFinish ? { skinFinish } : {})
  };

  // Clear previous weapon meshes inside gunGroup while keeping defaultMuzzleFlash available as fallback
  while (gunGroup.children.length > 0) {
    gunGroup.remove(gunGroup.children[0]);
  }

  const vmGroup = createWeaponViewModel(customDef, team, attObj || {});
  const fpLeft = vmGroup.getObjectByName('leftArmGroup');
  if (fpLeft && fpLeft.parent) fpLeft.parent.remove(fpLeft);
  const fpRight = vmGroup.getObjectByName('rightArmGroup');
  if (fpRight && fpRight.parent) fpRight.parent.remove(fpRight);

  vmGroup.traverse((child) => {
    if (child.isMesh) {
      child.userData.skipHitbox = true;
    }
  });

  // First-person viewmodels face -Z; rotate 180° around Y so the barrel faces +Z (soldier forward)
  vmGroup.rotation.set(0, Math.PI, 0);

  const isPistol = baseDef.type === 'gun' && baseDef.slot === 'secondary';
  const isLauncher = baseDef.type === 'rpg' || baseDef.type === 'stinger';
  const isMelee = baseDef.type === 'hammer';
  const isGadget =
    baseDef.type === 'c4' || baseDef.type === 'medkit' || baseDef.type === 'ammocrate';

  if (isPistol) {
    // Secondary Handgun (M9 Beretta, MP-443, Glock 18C, Desert Eagle, USP .45)
    vmGroup.scale.setScalar(1.38);
    vmGroup.position.set(-0.08, 0.05, 0.22);
    if (leftUpper && leftFore && rightUpper && rightFore) {
      leftUpper.position.set(0.08, -0.1, 0.14);
      leftUpper.rotation.set(-0.85, 0.48, 0);
      leftFore.position.set(0.24, -0.12, 0.30);
      leftFore.rotation.set(-1.42, 0.68, 0);
      rightUpper.position.set(-0.06, -0.1, 0.12);
      rightUpper.rotation.set(-0.82, -0.22, 0);
      rightFore.position.set(-0.11, -0.12, 0.30);
      rightFore.rotation.set(-1.42, -0.18, 0);
    }
  } else if (isLauncher) {
    // Shoulder-Fired Anti-Tank / Anti-Air Launcher (RPG-7, FIM-92 Stinger)
    vmGroup.scale.setScalar(1.26);
    vmGroup.position.set(0.06, 0.18, 0.14);
    if (leftUpper && leftFore && rightUpper && rightFore) {
      leftUpper.position.set(0.06, -0.06, 0.14);
      leftUpper.rotation.set(-0.92, 0.42, 0);
      leftFore.position.set(0.22, -0.04, 0.36);
      leftFore.rotation.set(-1.52, 0.56, 0);
      rightUpper.position.set(-0.02, -0.04, 0.08);
      rightUpper.rotation.set(-0.95, -0.08, 0);
      rightFore.position.set(-0.04, -0.02, 0.24);
      rightFore.rotation.set(-1.55, -0.05, 0);
    }
  } else if (isMelee || isGadget) {
    // Tactical Sledgehammer, ★ Karambit, ★ Butterfly Knife, C4, Medkit, Ammo Crate
    vmGroup.scale.setScalar(1.35);
    vmGroup.position.set(-0.04, 0.04, 0.22);
    if (leftUpper && leftFore && rightUpper && rightFore) {
      leftUpper.position.set(0.05, -0.11, 0.10);
      leftUpper.rotation.set(-0.68, 0.36, 0);
      leftFore.position.set(0.18, -0.15, 0.28);
      leftFore.rotation.set(-1.28, 0.48, 0);
      rightUpper.position.set(-0.04, -0.10, 0.10);
      rightUpper.rotation.set(-0.72, -0.16, 0);
      rightFore.position.set(-0.08, -0.14, 0.28);
      rightFore.rotation.set(-1.35, -0.14, 0);
    }
  } else {
    // Primary Rifle / Carbine / Bullpup / SMG / Shotgun / LMG / DMR / Sniper Rifle
    vmGroup.scale.setScalar(1.32);
    vmGroup.position.set(0, 0.04, 0.24);
    if (leftUpper && leftFore && rightUpper && rightFore) {
      leftUpper.position.set(0.05, -0.1, 0.12);
      leftUpper.rotation.set(-0.75, 0.35, 0);
      leftFore.position.set(0.18, -0.16, 0.34);
      leftFore.rotation.set(-1.35, 0.52, 0);
      rightUpper.position.set(-0.04, -0.1, 0.08);
      rightUpper.rotation.set(-0.65, -0.15, 0);
      rightFore.position.set(-0.09, -0.15, 0.26);
      rightFore.rotation.set(-1.3, -0.12, 0);
    }
  }

  if (rpgBackTube) {
    rpgBackTube.visible = !isLauncher;
  }

  gunGroup.add(vmGroup);

  const vmFlash = vmGroup.getObjectByName('muzzleFlash');
  if (vmFlash) {
    parts.muzzleFlash = vmFlash;
  } else if (parts.defaultMuzzleFlash) {
    parts.defaultMuzzleFlash.position.set(0, 0.04, isPistol ? 0.42 : 0.78);
    parts.defaultMuzzleFlash.visible = false;
    gunGroup.add(parts.defaultMuzzleFlash);
    parts.muzzleFlash = parts.defaultMuzzleFlash;
  }

  return true;
}
