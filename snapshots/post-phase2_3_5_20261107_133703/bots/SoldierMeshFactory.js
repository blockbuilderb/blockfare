import * as THREE from '../../vendor/three.module.js';
import { TEXTURES } from '../textures.js?v=35';

// =========================================================================
// PHASE 3B: SHARED BOT GEOMETRIES & MATERIALS CACHE
// Reuses geometries and team/common materials across all 80 AI soldiers
// instead of allocating ~20 new materials and ~30 geometries per soldier.
// Note: `muzzleFlash` material is intentionally allocated per-bot because
// its `.opacity` is animated independently per soldier during firing.
// =========================================================================
let sharedGeos = null;
const sharedMats = {
  common: null,
  US: null,
  RU: null
};

function getSharedGeometries() {
  if (!sharedGeos) {
    const rpgLauncherTube = new THREE.CylinderGeometry(0.055, 0.065, 1.05, 8);
    const rpgWarheadCone = new THREE.ConeGeometry(0.095, 0.32, 6);
    sharedGeos = {
      belt: new THREE.BoxGeometry(0.54, 0.12, 0.32),
      thigh: new THREE.BoxGeometry(0.22, 0.36, 0.22),
      kneePad: new THREE.BoxGeometry(0.23, 0.1, 0.06),
      shin: new THREE.BoxGeometry(0.2, 0.34, 0.2),
      boot: new THREE.BoxGeometry(0.22, 0.14, 0.29),
      torso: new THREE.BoxGeometry(0.52, 0.68, 0.28),
      vest: new THREE.BoxGeometry(0.56, 0.48, 0.35),
      magPouch: new THREE.BoxGeometry(0.11, 0.18, 0.06),
      backpack: new THREE.BoxGeometry(0.38, 0.42, 0.18),
      crossH: new THREE.BoxGeometry(0.18, 0.05, 0.02),
      crossV: new THREE.BoxGeometry(0.05, 0.18, 0.02),
      rpgBackTube: new THREE.BoxGeometry(0.09, 0.78, 0.09),
      rpgBackCone: new THREE.ConeGeometry(0.08, 0.24, 6),
      reconAntenna: new THREE.BoxGeometry(0.025, 0.55, 0.025),
      slAntenna: new THREE.BoxGeometry(0.03, 0.72, 0.03),
      slAntennaTip: new THREE.BoxGeometry(0.06, 0.08, 0.06),
      neck: new THREE.BoxGeometry(0.24, 0.12, 0.24),
      head: new THREE.BoxGeometry(0.36, 0.36, 0.36),
      balaclava: new THREE.BoxGeometry(0.37, 0.17, 0.37),
      goggles: new THREE.BoxGeometry(0.35, 0.11, 0.06),
      helmet: new THREE.BoxGeometry(0.43, 0.21, 0.43),
      nvgMount: new THREE.BoxGeometry(0.1, 0.09, 0.05),
      rankBand: new THREE.BoxGeometry(0.445, 0.045, 0.445),
      upperArm: new THREE.BoxGeometry(0.17, 0.32, 0.17),
      forearm: new THREE.BoxGeometry(0.15, 0.32, 0.15),
      gunReceiver: new THREE.BoxGeometry(0.075, 0.12, 0.48),
      gunBarrel: new THREE.BoxGeometry(0.04, 0.04, 0.36),
      gunMag: new THREE.BoxGeometry(0.055, 0.18, 0.09),
      gunOptic: new THREE.BoxGeometry(0.06, 0.07, 0.11),
      muzzleFlash: new THREE.OctahedronGeometry(0.14, 0),
      rpgLauncherTube,
      rpgWarheadCone,
      marker: new THREE.OctahedronGeometry(0.12, 0)
    };
  }
  return sharedGeos;
}

function getSharedMaterials(team) {
  if (!sharedMats.common) {
    sharedMats.common = {
      skinMat: new THREE.MeshStandardMaterial({ color: 0xe0b899, roughness: 0.8, flatShading: true }),
      gunMat: new THREE.MeshStandardMaterial({ color: 0x1e2226, roughness: 0.55, flatShading: true }),
      bootMat: new THREE.MeshStandardMaterial({ color: 0x1b1e21, roughness: 0.9 }),
      crossMat: new THREE.MeshBasicMaterial({ color: 0xffffff }),
      warheadMat: new THREE.MeshStandardMaterial({ color: 0x4b6542, roughness: 0.7, flatShading: true }),
      rpgTubeMat: new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.75, flatShading: true }),
      rpgShoulderConeMat: new THREE.MeshStandardMaterial({ color: 0x4b6542, roughness: 0.65, flatShading: true }),
      gogglesMat: new THREE.MeshBasicMaterial({ color: 0x161a20 }),
      tipCmdMat: new THREE.MeshBasicMaterial({ color: 0xf1c40f }),
      tipSlMat: new THREE.MeshBasicMaterial({ color: 0x2ecc71 }),
      bandCmdMat: new THREE.MeshBasicMaterial({ color: 0xf1c40f }),
      bandSlMat: new THREE.MeshBasicMaterial({ color: 0x00d2d3 })
    };
  }

  const teamKey = team === 'US' ? 'US' : 'RU';
  if (!sharedMats[teamKey]) {
    const vestColor = teamKey === 'US' ? 0x263849 : 0x452d25;
    const helmetColor = teamKey === 'US' ? 0x2980b9 : 0xc0392b;
    const pouchColor = teamKey === 'US' ? 0x1c2a38 : 0x33201a;
    sharedMats[teamKey] = {
      uniformMat: new THREE.MeshStandardMaterial({
        map: teamKey === 'US' ? TEXTURES.camoUS : TEXTURES.camoRU,
        roughness: 0.85
      }),
      vestMat: new THREE.MeshStandardMaterial({ color: vestColor, roughness: 0.8, flatShading: true }),
      pouchMat: new THREE.MeshStandardMaterial({ color: pouchColor, roughness: 0.85, flatShading: true }),
      helmetMat: new THREE.MeshStandardMaterial({ color: helmetColor, roughness: 0.65, flatShading: true }),
      markerMat: new THREE.MeshBasicMaterial({ color: teamKey === 'US' ? 0x3498db : 0xe74c3c })
    };
  }

  return {
    ...sharedMats.common,
    ...sharedMats[teamKey]
  };
}

export function createSoldierMesh(team = 'US', role = 'ASSAULT', commandRank = 'MEMBER') {
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

  // =========================================================================
  // 1. ARTICULATED PELVIS & MULTI-JOINT LEGS (HIP -> THIGH -> KNEE -> SHIN -> BOOT)
  // =========================================================================
  const pelvisGroup = new THREE.Group();
  pelvisGroup.position.set(0, 0.78, 0);

  const beltMesh = new THREE.Mesh(geos.belt, pouchMat);
  beltMesh.position.set(0, -0.02, 0);
  pelvisGroup.add(beltMesh);

  // Left Leg Hierarchy (Hip Pivot -> Thigh -> Knee Pivot -> Shin + Boot)
  const leftLegPivot = new THREE.Group();
  leftLegPivot.position.set(-0.14, -0.04, 0);
  const leftThigh = new THREE.Mesh(geos.thigh, uniformMat);
  leftThigh.position.y = -0.18;
  const leftKneePad = new THREE.Mesh(geos.kneePad, bootMat);
  leftKneePad.position.set(0, -0.34, 0.1);

  const leftShinPivot = new THREE.Group();
  leftShinPivot.position.set(0, -0.36, 0);
  const leftShin = new THREE.Mesh(geos.shin, uniformMat);
  leftShin.position.y = -0.17;
  const leftBoot = new THREE.Mesh(geos.boot, bootMat);
  leftBoot.position.set(0, -0.34, 0.03);
  leftShinPivot.add(leftShin, leftBoot);
  leftLegPivot.add(leftThigh, leftKneePad, leftShinPivot);

  // Right Leg Hierarchy (Hip Pivot -> Thigh -> Knee Pivot -> Shin + Boot)
  const rightLegPivot = new THREE.Group();
  rightLegPivot.position.set(0.14, -0.04, 0);
  const rightThigh = new THREE.Mesh(geos.thigh, uniformMat);
  rightThigh.position.y = -0.18;
  const rightKneePad = new THREE.Mesh(geos.kneePad, bootMat);
  rightKneePad.position.set(0, -0.34, 0.1);

  const rightShinPivot = new THREE.Group();
  rightShinPivot.position.set(0, -0.36, 0);
  const rightShin = new THREE.Mesh(geos.shin, uniformMat);
  rightShin.position.y = -0.17;
  const rightBoot = new THREE.Mesh(geos.boot, bootMat);
  rightBoot.position.set(0, -0.34, 0.03);
  rightShinPivot.add(rightShin, rightBoot);
  rightLegPivot.add(rightThigh, rightKneePad, rightShinPivot);

  pelvisGroup.add(leftLegPivot, rightLegPivot);

  // =========================================================================
  // 2. ARTICULATED UPPER BODY (TORSO, PLATE CARRIER, POUCHES & CLASS BACKPACK)
  // =========================================================================
  const upperBody = new THREE.Group();
  upperBody.position.set(0, 0.78, 0);

  const torso = new THREE.Mesh(geos.torso, uniformMat);
  torso.position.set(0, 0.34, 0);

  const vest = new THREE.Mesh(geos.vest, vestMat);
  vest.position.set(0, 0.36, 0);
  vest.userData.isArmor = true;

  // 3 Front Magazine Pouches on Plate Carrier
  for (const px of [-0.14, 0, 0.14]) {
    const pouch = new THREE.Mesh(geos.magPouch, pouchMat);
    pouch.position.set(px, 0.28, 0.19);
    pouch.userData.isArmor = true;
    upperBody.add(pouch);
  }

  // Tactical Backpack differentiated by Soldier Class
  const packRole = typeof role === 'string' ? role.toUpperCase() : 'ASSAULT';
  const backpack = new THREE.Mesh(geos.backpack, pouchMat);
  backpack.position.set(0, 0.37, -0.22);
  upperBody.add(backpack);

  let rpgBackTube = null;
  if (packRole === 'MEDIC') {
    const cH = new THREE.Mesh(geos.crossH, crossMat);
    const cV = new THREE.Mesh(geos.crossV, crossMat);
    cH.position.set(0, 0.38, -0.315);
    cV.position.set(0, 0.38, -0.315);
    upperBody.add(cH, cV);
  } else if (packRole === 'ENGINEER') {
    rpgBackTube = new THREE.Group();
    const tube = new THREE.Mesh(geos.rpgBackTube, gunMat);
    const cone = new THREE.Mesh(geos.rpgBackCone, warheadMat);
    cone.position.set(0, 0.48, 0);
    rpgBackTube.add(tube, cone);
    rpgBackTube.position.set(0.16, 0.48, -0.26);
    rpgBackTube.rotation.z = -0.28;
    upperBody.add(rpgBackTube);
  } else if (packRole === 'RECON') {
    const antenna = new THREE.Mesh(geos.reconAntenna, gunMat);
    antenna.position.set(-0.14, 0.78, -0.22);
    upperBody.add(antenna);
  }

  // Squad Leader [SL] & Force Commander [CMD] Long-Range Tactical Radio Whip Antenna
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
  }

  // =========================================================================
  // 3. HEAD, BALACLAVA, TACTICAL GOGGLES & NVG-MOUNT HELMET
  // =========================================================================
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.86, 0);

  const neck = new THREE.Mesh(geos.neck, pouchMat);
  neck.position.set(0, -0.16, 0);

  const head = new THREE.Mesh(geos.head, skinMat);
  head.userData.isHead = true;

  const balaclava = new THREE.Mesh(geos.balaclava, pouchMat);
  balaclava.position.set(0, -0.09, 0);
  balaclava.userData.isHead = true;

  const goggles = new THREE.Mesh(geos.goggles, gogglesMat);
  goggles.position.set(0, 0.03, 0.17);

  const helmet = new THREE.Mesh(geos.helmet, helmetMat);
  helmet.position.set(0, 0.14, 0);
  helmet.userData.isHead = true;
  helmet.userData.isHelmet = true;

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

  // =========================================================================
  // 4. ARTICULATED SHOULDERS, FOREARMS, RIFLE & 3D MUZZLE FLASH
  // =========================================================================
  const weaponRig = new THREE.Group();
  weaponRig.position.set(0, 0.48, 0);

  const leftArm = new THREE.Group();
  leftArm.position.set(-0.31, 0.04, 0.04);
  const leftUpper = new THREE.Mesh(geos.upperArm, uniformMat);
  leftUpper.position.set(0.05, -0.1, 0.12);
  leftUpper.rotation.set(-0.75, 0.35, 0);
  const leftFore = new THREE.Mesh(geos.forearm, uniformMat);
  leftFore.position.set(0.18, -0.16, 0.34);
  leftFore.rotation.set(-1.35, 0.52, 0);
  leftArm.add(leftUpper, leftFore);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.31, 0.04, 0.04);
  const rightUpper = new THREE.Mesh(geos.upperArm, uniformMat);
  rightUpper.position.set(-0.04, -0.1, 0.08);
  rightUpper.rotation.set(-0.65, -0.15, 0);
  const rightFore = new THREE.Mesh(geos.forearm, uniformMat);
  rightFore.position.set(-0.09, -0.15, 0.26);
  rightFore.rotation.set(-1.3, -0.12, 0);
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

  // Per-bot cloned material since muzzleFlash opacity animates per-bot
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffd32a,
    transparent: true,
    opacity: 0
  });
  const muzzleFlash = new THREE.Mesh(geos.muzzleFlash, flashMat);
  muzzleFlash.position.set(0, 0.02, 0.56);

  gunGroup.add(gunReceiver, gunBarrel, gunMag, gunOptic, muzzleFlash);

  // Shoulder-fired RPG-7 Anti-Armor Launcher (active when Engineer engages enemy Tanks/Cars)
  const rpgShoulderGroup = new THREE.Group();
  rpgShoulderGroup.position.set(0.24, 0.12, 0.18);
  rpgShoulderGroup.visible = false;
  const rpgLauncherTube = new THREE.Mesh(geos.rpgLauncherTube, rpgTubeMat);
  rpgLauncherTube.rotation.x = Math.PI / 2;
  const rpgWarheadCone = new THREE.Mesh(geos.rpgWarheadCone, rpgShoulderConeMat);
  rpgWarheadCone.rotation.x = Math.PI / 2;
  rpgWarheadCone.position.set(0, 0, 0.62);
  rpgShoulderGroup.add(rpgLauncherTube, rpgWarheadCone);

  weaponRig.add(leftArm, rightArm, gunGroup, rpgShoulderGroup);
  upperBody.add(torso, vest, headGroup, weaponRig);

  // Team Marker placeholder (rendered via 3D HUD overlay)
  const marker = new THREE.Mesh(geos.marker, markerMat);
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
