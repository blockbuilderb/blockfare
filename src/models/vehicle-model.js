// ============================================================================
// 3D VEHICLE MODEL BUILDER (src/models/vehicle-model.js)
// Builds 3D articulated hulls, caterpillar tracks/wheels, rotating turrets,
// and recoiling cannon barrels for Main Battle Tanks, 8x8 APCs, and Humvees.
// ============================================================================

import * as THREE from '../../vendor/three.module.js';
import {
  buildTankModel,
  buildHumveeModel,
  buildApcModel,
  buildSpaagModel
} from './armor-models.js?v=150';
import {
  buildCasAircraftWingAndTail,
  buildBomberAircraftWingAndTail,
  buildEmplacementModel,
  buildDinoMountModel
} from './air-emplacement-models.js?v=150';
import { buildHelicopterModel, buildTroopTruckModel } from './heli-truck-models.js?v=150';

// ─── SHARED VEHICLE GEOMETRY & WHEEL MERGE CACHES (userData.shared = true) ───
const _vehGeoCache = new Map();
const _tmpMergeMat = new THREE.Matrix4();
const _tmpMergeQuat = new THREE.Quaternion();
const _tmpMergeEuler = new THREE.Euler();
const _tmpMergePos = new THREE.Vector3();
const _tmpMergeScale = new THREE.Vector3(1, 1, 1);
const _tmpMotoEuler = new THREE.Euler(0, 0, 0, 'YXZ');

function _wrapVehicleChildrenInRearWheelPivot(group, rearWheelRadius, rearAxleZ) {
  const rearWheelPivot = new THREE.Group();
  rearWheelPivot.name = 'rearWheelPivot';
  rearWheelPivot.position.set(0, rearWheelRadius, rearAxleZ);

  const bodyRoot = new THREE.Group();
  bodyRoot.name = 'wheelieBodyRoot';
  bodyRoot.position.set(0, -rearWheelRadius, -rearAxleZ);

  while (group.children.length > 0) {
    bodyRoot.add(group.children[0]);
  }
  rearWheelPivot.add(bodyRoot);
  group.add(rearWheelPivot);
  group.userData.rearWheelPivot = rearWheelPivot;
  group.userData.wheelieBodyRoot = bodyRoot;
  group.userData.rearWheelRadius = rearWheelRadius;
  group.userData.rearAxleZ = rearAxleZ;
  return rearWheelPivot;
}

/**
 * Updates a motorcycle, electric scooter, or quad ATV's 3D transform so wheelie pitch (`v.pitch`)
 * rotates strictly around the Rear Wheel Axle `(0, rearWheelRadius, +rearAxleZ)` instead of the
 * geometric center `(0, 0, 0)`, keeping the rear tire planted in continuous ground contact!
 */
export function syncMotoWheeliePose(v, world = null) {
  if (!v || !v.mesh) return;
  if (v.pos && v.mesh.position !== v.pos) {
    v.mesh.position.copy(v.pos);
  }
  const ud = v.mesh.userData;
  const rearWheelPivot = ud?.rearWheelPivot;
  if (rearWheelPivot) {
    const rearRadius = ud.rearWheelRadius ?? 0.39;
    const rearAxleZ = ud.rearAxleZ ?? 0.88;
    const yaw = v.yaw || 0;
    const roll = v.roll || 0;
    const pitch = v.pitch || 0;

    v.mesh.rotation.set(0, yaw, roll, 'YXZ');

    let slopeDeltaY = 0;
    if (world && typeof world.getGroundHeightAt === 'function' && v.pos) {
      const rearWorldX = v.pos.x + Math.sin(yaw) * rearAxleZ;
      const rearWorldZ = v.pos.z + Math.cos(yaw) * rearAxleZ;
      const rearGroundY = world.getGroundHeightAt(rearWorldX, rearWorldZ) + (v.climbOffsetY || 0);
      slopeDeltaY = THREE.MathUtils.clamp(rearGroundY - v.pos.y, -0.65, 0.65);
    }
    rearWheelPivot.position.set(0, rearRadius + slopeDeltaY, rearAxleZ);
    rearWheelPivot.rotation.x = pitch;
    v._lastRearSlopeDeltaY = slopeDeltaY;
  } else {
    v.mesh.rotation.set(v.pitch || 0, v.yaw || 0, v.roll || 0, 'YXZ');
  }
}

/**
 * Transforms a bike-local point `(localX, localY, localZ)` into world space accounting for
 * rear-wheel wheelie rotation, cornering roll, and hull yaw.
 */
export function computeMotoLocalPointWorld(v, localX, localY, localZ, out = new THREE.Vector3()) {
  const ud = v?.mesh?.userData;
  const rearRadius = ud?.rearWheelRadius ?? 0.39;
  const rearAxleZ = ud?.rearAxleZ ?? 0.88;
  const slopeDeltaY = v?._lastRearSlopeDeltaY || 0;
  const pitch = v?.pitch || 0;
  const yaw = v?.yaw || 0;
  const roll = v?.roll || 0;

  // 1. Pitch around Rear Wheel Axle (0, rearRadius, rearAxleZ)
  const dy = localY - rearRadius;
  const dz = localZ - rearAxleZ;
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);
  const py = rearRadius + slopeDeltaY + dy * cosP - dz * sinP;
  const pz = rearAxleZ + dy * sinP + dz * cosP;

  // 2. Apply outer group roll & yaw + world v.pos
  out.set(localX, py, pz);
  _tmpMotoEuler.set(0, yaw, roll, 'YXZ');
  out.applyEuler(_tmpMotoEuler);
  if (v?.pos) out.add(v.pos);
  return out;
}

function _getCachedBoxGeo(w, h, d) {
  const key = `box:${w.toFixed(4)}_${h.toFixed(4)}_${d.toFixed(4)}`;
  let g = _vehGeoCache.get(key);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    g.userData.shared = true;
    _vehGeoCache.set(key, g);
  }
  return g;
}

function _getCachedCylGeo(rt, rb, h, seg = 8, rotZ = 0) {
  const key = `cyl:${rt.toFixed(4)}_${rb.toFixed(4)}_${h.toFixed(4)}_${seg}_${rotZ.toFixed(4)}`;
  let g = _vehGeoCache.get(key);
  if (!g) {
    g = new THREE.CylinderGeometry(rt, rb, h, seg);
    if (rotZ !== 0) g.rotateZ(rotZ);
    g.userData.shared = true;
    _vehGeoCache.set(key, g);
  }
  return g;
}

function _mergePartGeometries(parts) {
  let totalVerts = 0;
  const nonIndexed = [];
  for (let i = 0; i < parts.length; i++) {
    const { geo, pos, rot } = parts[i];
    const ni = geo.index ? geo.toNonIndexed() : geo.clone();
    _tmpMergePos.set(pos[0], pos[1], pos[2]);
    _tmpMergeEuler.set(rot[0], rot[1], rot[2]);
    _tmpMergeQuat.setFromEuler(_tmpMergeEuler);
    _tmpMergeMat.compose(_tmpMergePos, _tmpMergeQuat, _tmpMergeScale);
    ni.applyMatrix4(_tmpMergeMat);
    totalVerts += ni.attributes.position.count;
    nonIndexed.push(ni);
  }
  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  let offset = 0;
  for (let i = 0; i < nonIndexed.length; i++) {
    const ni = nonIndexed[i];
    const pArr = ni.attributes.position.array;
    const nArr = ni.attributes.normal.array;
    positions.set(pArr, offset);
    normals.set(nArr, offset);
    offset += pArr.length;
    ni.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.computeBoundingSphere();
  merged.userData.shared = true;
  return merged;
}

function _getMergedTreadTireGeo(radius, width, radialSegs, lugCount, lugW, lugH, lugD, lugRadius) {
  const key = `treadTire:${radius.toFixed(4)}_${width.toFixed(4)}_${radialSegs}_${lugCount}_${lugW.toFixed(4)}_${lugH.toFixed(4)}_${lugD.toFixed(4)}_${lugRadius.toFixed(4)}`;
  let g = _vehGeoCache.get(key);
  if (g) return g;
  const parts = [];
  const baseCyl = new THREE.CylinderGeometry(radius, radius, width, radialSegs);
  parts.push({ geo: baseCyl, pos: [0, 0, 0], rot: [0, 0, Math.PI / 2] });
  const baseLug = new THREE.BoxGeometry(lugW, lugH, lugD);
  for (let t = 0; t < lugCount; t++) {
    const ang = (t / lugCount) * Math.PI * 2;
    parts.push({
      geo: baseLug,
      pos: [0, Math.cos(ang) * lugRadius, Math.sin(ang) * lugRadius],
      rot: [-ang, 0, 0]
    });
  }
  g = _mergePartGeometries(parts);
  baseCyl.dispose();
  baseLug.dispose();
  _vehGeoCache.set(key, g);
  return g;
}

function _getMergedLugRingGeo(lugCount, lugW, lugH, lugD, lugRadius) {
  const key = `lugRing:${lugCount}_${lugW.toFixed(4)}_${lugH.toFixed(4)}_${lugD.toFixed(4)}_${lugRadius.toFixed(4)}`;
  let g = _vehGeoCache.get(key);
  if (g) return g;
  const parts = [];
  const baseLug = new THREE.BoxGeometry(lugW, lugH, lugD);
  for (let t = 0; t < lugCount; t++) {
    const ang = (t / lugCount) * Math.PI * 2;
    parts.push({
      geo: baseLug,
      pos: [0, Math.cos(ang) * lugRadius, Math.sin(ang) * lugRadius],
      rot: [-ang, 0, 0]
    });
  }
  g = _mergePartGeometries(parts);
  baseLug.dispose();
  _vehGeoCache.set(key, g);
  return g;
}

function _getMergedSpokesGeo(spokeCount, w, h, d) {
  const key = `spokes:${spokeCount}_${w.toFixed(4)}_${h.toFixed(4)}_${d.toFixed(4)}`;
  let g = _vehGeoCache.get(key);
  if (g) return g;
  const parts = [];
  const baseSpoke = new THREE.BoxGeometry(w, h, d);
  for (let s = 0; s < spokeCount; s++) {
    parts.push({ geo: baseSpoke, pos: [0, 0, 0], rot: [(s * Math.PI) / spokeCount, 0, 0] });
  }
  g = _mergePartGeometries(parts);
  baseSpoke.dispose();
  _vehGeoCache.set(key, g);
  return g;
}

function _vPart(geo, x, y, z, rx = 0, ry = 0, rz = 0) {
  return { geo, pos: [x, y, z], rot: [rx, ry, rz] };
}

function _addVehMerged(parent, cacheKey, mat, buildFn, castShadow = true, receiveShadow = false) {
  let geo = _vehGeoCache.get(cacheKey);
  if (!geo) {
    const parts = [];
    buildFn(parts);
    geo = _mergePartGeometries(parts);
    _vehGeoCache.set(cacheKey, geo);
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  parent.add(mesh);
  return mesh;
}

export const B2_COLOR_PRESETS = [
  {
    id: 'midnight_ram',
    name: 'MIDNIGHT RAM BLACK',
    shortName: 'MIDNIGHT BLACK',
    bodyHex: '#14181f',
    accentHex: '#00d2d3',
    desc: 'Factory Whiteman AFB Radar-Absorbent Material (RAM) obsidian finish with cyan stealth trim.'
  },
  {
    id: 'ghost_slate',
    name: 'WHITEMAN GHOST SLATE',
    shortName: 'GHOST SLATE',
    bodyHex: '#2f3640',
    accentHex: '#74b9ff',
    desc: 'High-altitude daytime low-observable tactical slate grey with sky-blue leading-edge trim.'
  },
  {
    id: 'royal_gold',
    name: '24K IMPERIAL STEALTH GOLD',
    shortName: '24K GOLD',
    bodyHex: '#d4af37',
    accentHex: '#11151c',
    desc: 'Mirror-burnished 24-Karat Gold flying wing with obsidian carbon-fiber stealth accents.'
  },
  {
    id: 'crimson_wraith',
    name: 'CRIMSON RED WRAITH',
    shortName: 'CRIMSON RED',
    bodyHex: '#b71540',
    accentHex: '#ffd32a',
    desc: 'Deep blood-crimson anodized stealth composite with 24K gold sawtooth trim.'
  },
  {
    id: 'cobalt_sapphire',
    name: 'SAPPHIRE COBALT NIGHTHAWK',
    shortName: 'SAPPHIRE BLUE',
    bodyHex: '#0652dd',
    accentHex: '#00d2d3',
    desc: 'Deep Sapphire Doppler-absorbent blue airframe with neon cyan leading edges.'
  },
  {
    id: 'arctic_phantom',
    name: 'ARCTIC WHITE PHANTOM',
    shortName: 'ARCTIC WHITE',
    bodyHex: '#dfe6e9',
    accentHex: '#2d3436',
    desc: 'Polar stratospheric anti-flash white coat with dark carbon-matrix serrated intakes.'
  },
  {
    id: 'emerald_viper',
    name: 'CYBER EMERALD MATRIX',
    shortName: 'EMERALD GREEN',
    bodyHex: '#009432',
    accentHex: '#7bed9f',
    desc: 'Experimental night-vision emerald stealth finish with luminous lime trim.'
  },
  {
    id: 'amethyst_night',
    name: 'OBSIDIAN VIOLET SPECTRE',
    shortName: 'VIOLET SPECTRE',
    bodyHex: '#4a148c',
    accentHex: '#e056fd',
    desc: 'Ultraviolet plasma-stealth coat with magenta serrated trailing-edge accents.'
  }
];

export function applyB2SpiritColorToMesh(group, bodyHex = '#14181f', accentHex = '#00d2d3') {
  if (!group) return;
  const cleanBody = /^#[0-9a-fA-F]{6}$/.test(String(bodyHex || '')) ? bodyHex : '#14181f';
  const cleanAccent = /^#[0-9a-fA-F]{6}$/.test(String(accentHex || '')) ? accentHex : '#00d2d3';
  const bodyCol = new THREE.Color(cleanBody);
  const accentCol = new THREE.Color(cleanAccent);
  const isGold = cleanBody.toLowerCase() === '#d4af37' || cleanBody.toLowerCase() === '#ffd700';

  group.userData.b2BodyHex = cleanBody;
  group.userData.b2AccentHex = cleanAccent;

  group.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    if (child.userData.isB2Paintable) {
      child.material.color.copy(bodyCol);
      child.material.metalness = isGold ? 0.82 : 0.42;
      child.material.roughness = isGold ? 0.24 : 0.36;
      child.material.needsUpdate = true;
    } else if (child.userData.isB2Accent) {
      child.material.color.copy(accentCol);
      child.material.needsUpdate = true;
    }
  });
}

/**
 * Builds an articulated 3D Rider / Player Model for 3rd-person view on Motorcycles,
 * Two-Strokes, E-Motos, Kukirin Stand-Up Scooters, and 4x4 Quad ATVs.
 * Hidden when the vehicle is unoccupied or in 1st-person camera view ([C]).
 */
export function createDetailedVehicleRider(opts = {}) {
  const {
    posture = 'mx', // 'scooter' | 'sport' | 'mx' | 'atv'
    isUS = true,
    scale = 1.0,
    accentHex = 0xe74c3c,
    seatY = 1.02,
    seatZ = 0.22,
    barY = 1.24,
    barZ = -0.48,
    barHalfW = 0.36,
    pegX = 0.21,
    pegY = 0.44,
    pegZ = 0.08
  } = opts;

  const riderGroup = new THREE.Group();
  riderGroup.name = 'VehicleRider3D';
  riderGroup.visible = false; // Enabled dynamically when driven in 3rd-person or by AI!

  const suitMat = new THREE.MeshStandardMaterial({
    color: isUS ? 0x3b4d38 : 0x2c343c,
    roughness: 0.72,
    metalness: 0.15,
    flatShading: true
  });
  const armorMat = new THREE.MeshStandardMaterial({
    color: isUS ? 0x6b6046 : 0x1e2428,
    roughness: 0.58,
    metalness: 0.28,
    flatShading: true
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    roughness: 0.32,
    metalness: 0.55,
    flatShading: true
  });
  const bootGloveMat = new THREE.MeshStandardMaterial({
    color: 0x15181c,
    roughness: 0.5,
    metalness: 0.3
  });
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0x00d2d3,
    roughness: 0.12,
    metalness: 0.92
  });

  const addLimbSegment = (parent, p1, p2, r1, r2, mat) => {
    const dir = new THREE.Vector3().subVectors(p2, p1);
    const len = dir.length();
    if (len < 0.001) return null;
    const mesh = new THREE.Mesh(_getCachedCylGeo(r2, r1, len, 8), mat);
    mesh.position.copy(p1).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };

  // Determine hip, shoulder, knee, and head coordinates from vehicle posture
  const isScooter = posture === 'scooter';
  const isSport = posture === 'sport';
  const isAtv = posture === 'atv';

  const hipPos = isScooter
    ? new THREE.Vector3(0, pegY + 0.54 * scale, pegZ + 0.08 * scale)
    : new THREE.Vector3(0, seatY + 0.08 * scale, seatZ);

  const torsoLeanRad = isScooter ? 0.14 : isSport ? 0.78 : isAtv ? 0.26 : 0.38;
  const torsoLen = 0.48 * scale;
  const shoulderCenter = new THREE.Vector3(
    0,
    hipPos.y + Math.cos(torsoLeanRad) * torsoLen,
    hipPos.z - Math.sin(torsoLeanRad) * torsoLen
  );

  // 1. Pelvis & Articulated Torso + Tactical Plate Carrier / Spine Protector
  const pelvis = new THREE.Mesh(
    new THREE.BoxGeometry(0.32 * scale, 0.16 * scale, 0.22 * scale),
    suitMat
  );
  pelvis.position.copy(hipPos);
  pelvis.castShadow = true;
  riderGroup.add(pelvis);

  const torsoPivot = new THREE.Group();
  torsoPivot.position.copy(hipPos);
  torsoPivot.rotation.x = -torsoLeanRad;

  const chest = new THREE.Mesh(
    new THREE.BoxGeometry(0.36 * scale, torsoLen, 0.23 * scale),
    suitMat
  );
  chest.position.set(0, torsoLen * 0.52, 0);
  chest.castShadow = true;
  torsoPivot.add(chest);

  const plateVest = new THREE.Mesh(
    new THREE.BoxGeometry(0.38 * scale, torsoLen * 0.74, 0.26 * scale),
    armorMat
  );
  plateVest.position.set(0, torsoLen * 0.56, 0);
  torsoPivot.add(plateVest);

  const chestStripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.39 * scale, 0.07 * scale, 0.27 * scale),
    accentMat
  );
  chestStripe.position.set(0, torsoLen * 0.72, 0);
  torsoPivot.add(chestStripe);

  const spineHump = new THREE.Mesh(
    new THREE.BoxGeometry(0.22 * scale, 0.26 * scale, 0.11 * scale),
    isSport ? accentMat : armorMat
  );
  spineHump.position.set(0, torsoLen * 0.62, 0.15 * scale);
  torsoPivot.add(spineHump);

  // Tactical MOLLE Front Mag Pouches & Padded Neck-Brace Collar on Rider Torso
  for (const mx of [-0.1 * scale, 0, 0.1 * scale]) {
    const magPouch = new THREE.Mesh(
      new THREE.BoxGeometry(0.08 * scale, 0.13 * scale, 0.055 * scale),
      bootGloveMat
    );
    magPouch.position.set(mx, torsoLen * 0.42, -0.145 * scale);
    torsoPivot.add(magPouch);
  }
  const neckBraceCollar = new THREE.Mesh(
    new THREE.BoxGeometry(0.28 * scale, 0.055 * scale, 0.25 * scale),
    bootGloveMat
  );
  neckBraceCollar.position.set(0, torsoLen * 0.96, -0.01 * scale);
  torsoPivot.add(neckBraceCollar);

  riderGroup.add(torsoPivot);

  // 2. Full-Face Sculpted Motocross / Carbon Aero Street Helmet + Goggle Strap & Comms Pod
  const headPivot = new THREE.Group();
  headPivot.position.set(
    0,
    shoulderCenter.y + 0.15 * scale,
    shoulderCenter.z - 0.05 * scale
  );

  const helmetShell = new THREE.Mesh(
    new THREE.BoxGeometry(0.25 * scale, 0.25 * scale, 0.29 * scale),
    accentMat
  );
  helmetShell.castShadow = true;
  headPivot.add(helmetShell);

  const helmetCrown = new THREE.Mesh(
    new THREE.BoxGeometry(0.19 * scale, 0.055 * scale, 0.31 * scale),
    bootGloveMat
  );
  helmetCrown.position.set(0, 0.125 * scale, 0.015 * scale);
  headPivot.add(helmetCrown);

  const goggleStrap = new THREE.Mesh(
    new THREE.BoxGeometry(0.262 * scale, 0.055 * scale, 0.22 * scale),
    bootGloveMat
  );
  goggleStrap.position.set(0, 0.02 * scale, 0.04 * scale);
  headPivot.add(goggleStrap);

  const commsPod = new THREE.Mesh(
    new THREE.BoxGeometry(0.035 * scale, 0.065 * scale, 0.095 * scale),
    armorMat
  );
  commsPod.position.set(-0.135 * scale, -0.03 * scale, 0.02 * scale);
  headPivot.add(commsPod);

  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.256 * scale, 0.1 * scale, 0.18 * scale),
    visorMat
  );
  visor.position.set(0, 0.02 * scale, -0.08 * scale);
  headPivot.add(visor);

  const chinBar = new THREE.Mesh(
    new THREE.BoxGeometry(0.21 * scale, 0.1 * scale, 0.17 * scale),
    bootGloveMat
  );
  chinBar.position.set(0, -0.08 * scale, -0.11 * scale);
  headPivot.add(chinBar);

  if (!isSport) {
    // Motocross Peak Sun Visor
    const mxPeak = new THREE.Mesh(
      new THREE.BoxGeometry(0.22 * scale, 0.03 * scale, 0.18 * scale),
      bootGloveMat
    );
    mxPeak.position.set(0, 0.11 * scale, -0.15 * scale);
    mxPeak.rotation.x = 0.22;
    headPivot.add(mxPeak);
  }

  riderGroup.add(headPivot);
  riderGroup.userData.headPivot = headPivot;

  // 3. Left & Right Articulated Arms (Shoulder -> Elbow -> Handlebar Grip) & Legs (Hip -> Knee -> Footpeg)
  for (const side of [-1, 1]) {
    const shoulderPos = new THREE.Vector3(
      side * 0.21 * scale,
      shoulderCenter.y - 0.04 * scale,
      shoulderCenter.z
    );
    const handPos = new THREE.Vector3(side * barHalfW, barY + 0.02 * scale, barZ);
    const elbowPos = new THREE.Vector3()
      .lerpVectors(shoulderPos, handPos, 0.52)
      .add(
        new THREE.Vector3(
          side * (isSport ? 0.08 : 0.14) * scale,
          (isSport ? -0.07 : -0.03) * scale,
          0.08 * scale
        )
      );

    // Shoulder Pad + Upper Arm + Elbow Guard + Forearm + Riding Glove
    const shoulderPad = new THREE.Mesh(
      new THREE.BoxGeometry(0.11 * scale, 0.11 * scale, 0.12 * scale),
      armorMat
    );
    shoulderPad.position.copy(shoulderPos);
    riderGroup.add(shoulderPad);

    addLimbSegment(riderGroup, shoulderPos, elbowPos, 0.055 * scale, 0.048 * scale, suitMat);
    addLimbSegment(riderGroup, elbowPos, handPos, 0.046 * scale, 0.038 * scale, suitMat);

    const glove = new THREE.Mesh(
      new THREE.BoxGeometry(0.085 * scale, 0.075 * scale, 0.095 * scale),
      bootGloveMat
    );
    glove.position.copy(handPos);
    riderGroup.add(glove);

    // Hip -> Knee -> Footpeg / Deck
    const hipJoint = new THREE.Vector3(
      side * (isScooter ? 0.11 : 0.13) * scale,
      hipPos.y - 0.04 * scale,
      hipPos.z
    );
    const footPos = new THREE.Vector3(
      side * pegX,
      pegY + 0.05 * scale,
      isScooter ? pegZ + (side < 0 ? -0.14 : 0.14) : pegZ
    );
    const kneePos = isScooter
      ? new THREE.Vector3(
          side * 0.12 * scale,
          (hipJoint.y + footPos.y) * 0.52,
          (hipJoint.z + footPos.z) * 0.5 - 0.08 * scale
        )
      : new THREE.Vector3(
          side * (isAtv ? 0.42 : isSport ? 0.22 : 0.24) * scale,
          hipJoint.y - (isSport ? 0.18 : 0.22) * scale,
          hipJoint.z - (isSport ? 0.26 : 0.28) * scale
        );

    addLimbSegment(riderGroup, hipJoint, kneePos, 0.075 * scale, 0.062 * scale, suitMat);

    const kneeGuard = new THREE.Mesh(
      new THREE.BoxGeometry(0.11 * scale, 0.13 * scale, 0.12 * scale),
      accentMat
    );
    kneeGuard.position.copy(kneePos);
    riderGroup.add(kneeGuard);

    addLimbSegment(riderGroup, kneePos, footPos, 0.06 * scale, 0.052 * scale, bootGloveMat);

    const ridingBoot = new THREE.Mesh(
      new THREE.BoxGeometry(0.11 * scale, 0.1 * scale, 0.24 * scale),
      bootGloveMat
    );
    ridingBoot.position.set(footPos.x, footPos.y - 0.01 * scale, footPos.z - 0.04 * scale);
    riderGroup.add(ridingBoot);
  }

  return riderGroup;
}

export function createVehicleMesh(cfg) {
  const group = new THREE.Group();
  const isUS = cfg.team === 'US';
  const hullColor = isUS
    ? cfg.type === 'tank'
      ? 0x8f8260
      : cfg.type === 'apc'
      ? 0x4b5d46
      : 0x9b8c6b
    : cfg.type === 'tank'
    ? 0x3b4938
    : cfg.type === 'apc'
    ? 0x3e4d3c
    : 0x555d47;

  const eraColor = isUS ? 0x6e6347 : 0x2c3629;

  const hullMat = new THREE.MeshStandardMaterial({
    color: hullColor,
    roughness: 0.76,
    metalness: 0.24,
    flatShading: true
  });
  const eraMat = new THREE.MeshStandardMaterial({
    color: eraColor,
    roughness: 0.82,
    metalness: 0.28,
    flatShading: true
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x202428,
    roughness: 0.85,
    flatShading: true
  });
  const barrelMat = new THREE.MeshStandardMaterial({
    color: 0x2b3035,
    roughness: 0.55,
    metalness: 0.45,
    flatShading: true
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x74b9ff,
    roughness: 0.2,
    metalness: 0.6,
    transparent: true,
    opacity: 0.65
  });

  const wheels = [];
  const turretPivot = new THREE.Group();
  let barrelGroup = null;
  const modelCtx = {
    cfg,
    isUS,
    group,
    wheels,
    turretPivot,
    hullMat,
    eraMat,
    darkMat,
    barrelMat,
    glassMat,
    getBox: _getCachedBoxGeo,
    getCyl: _getCachedCylGeo,
    getTreadTire: _getMergedTreadTireGeo,
    getSpokes: _getMergedSpokesGeo,
    mergeParts: _mergePartGeometries
  };

  if (cfg.type === 'tank') {
    ({ barrelGroup } = buildTankModel(modelCtx));
  } else if (cfg.type === 'humvee') {
    ({ barrelGroup } = buildHumveeModel(modelCtx));
  } else if (cfg.type === 'truck_transport') {
    ({ barrelGroup } = buildTroopTruckModel(modelCtx));
  } else if (
    cfg.isHelicopter ||
    cfg.aircraftRole === 'heli_transport' ||
    cfg.aircraftRole === 'heli_attack'
  ) {
    ({ barrelGroup } = buildHelicopterModel(modelCtx));
  } else if (cfg.type === 'plane' || cfg.isAircraft) {
    // =========================================================================
    // 3D COMBAT AIRCRAFT MODELS (Nose points along -Z to match flight vector):
    // 1. CAS ('cas'): A-10C Thunderbolt II Warthog (US) / Su-25SM Frogfoot (RU)
    // 2. BOMBER ('bomber'): F-15E Strike Eagle (US) / Su-34 Fullback (RU)
    // 3. FIGHTER ('fighter'): F-22A Raptor (US) / Su-57 Felon (RU)
    // =========================================================================
    const role = cfg.aircraftRole || 'cas';
    const airColor = isUS
      ? role === 'cas'
        ? 0x576574
        : role === 'bomber'
        ? 0x3d4852
        : 0x636e72
      : role === 'cas'
      ? 0x3b4d3b
      : role === 'bomber'
      ? 0x2c3e50
      : 0x485460;
    const wingColor = isUS ? 0x4b5563 : 0x2f3640;
    const airMat = new THREE.MeshStandardMaterial({
      color: airColor,
      roughness: 0.45,
      metalness: 0.38,
      flatShading: true
    });
    const airWingMat = new THREE.MeshStandardMaterial({
      color: wingColor,
      roughness: 0.5,
      metalness: 0.35,
      flatShading: true
    });
    const burnerMat = new THREE.MeshBasicMaterial({ color: 0xff9f1a });
    const ordWhiteMat = new THREE.MeshStandardMaterial({ color: 0xdfe6e9, roughness: 0.4 });
    const ordOliveMat = new THREE.MeshStandardMaterial({ color: 0x4b5320, roughness: 0.6 });

    // Tricycle Landing Gear Wheels (omitted for the 1903 Wright Flyer which uses wooden sled skids!)
    let noseGearWheel = null;
    if (role !== 'wright_flyer') {
      const lgWheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.24, 8);
      lgWheelGeo.rotateZ(Math.PI / 2);
      for (const [wx, wy, wz] of [
        [0, 0.32, -3.4],
        [-1.45, 0.32, 0.8],
        [1.45, 0.32, 0.8]
      ]) {
        const w = new THREE.Mesh(lgWheelGeo, darkMat);
        w.position.set(wx, wy, wz);
        group.add(w);
        wheels.push(w);
        if (wz < -2.0) noseGearWheel = w;
      }
    }

    if (role === 'wright_flyer') {
      // =======================================================================
      // 1903 WRIGHT BROTHERS "WRIGHT FLYER I" (KITTY HAWK PIONEER BIPLANE)
      // - Unbleached "Pride of the West" cream muslin double wings (13.6m span)
      // - Sitka spruce & ash wood spars, 18 exposed wing ribs & vertical interplane struts
      // - Diagonal steel piano-wire truss rigging across all wing bays
      // - Forward biplane canard elevator ("front rudder") on wooden outriggers
      // - Aft twin vertical box rudder on rear truss booms
      // - 12-HP 4-cylinder cast-aluminum engine, bicycle chain drives & twin spinning pusher propellers
      // - Twin extended spruce landing skids + brass 1903 Gatling MG & Dynamite crate!
      // =======================================================================
      const muslinMat = new THREE.MeshStandardMaterial({
        color: 0xf3ead6,
        roughness: 0.82,
        metalness: 0.04,
        flatShading: true
      });
      const spruceMat = new THREE.MeshStandardMaterial({
        color: 0x9c6634,
        roughness: 0.72,
        metalness: 0.08,
        flatShading: true
      });
      const darkSpruceMat = new THREE.MeshStandardMaterial({
        color: 0x6f4518,
        roughness: 0.76,
        metalness: 0.1,
        flatShading: true
      });
      const wireMat = new THREE.MeshStandardMaterial({
        color: 0x4b5563,
        roughness: 0.4,
        metalness: 0.75
      });
      const engineAlumMat = new THREE.MeshStandardMaterial({
        color: 0x95a5a6,
        roughness: 0.35,
        metalness: 0.72
      });
      const brassMat = new THREE.MeshStandardMaterial({
        color: 0xd4af37,
        roughness: 0.28,
        metalness: 0.82
      });
      const dynamiteRedMat = new THREE.MeshStandardMaterial({
        color: 0xc0392b,
        roughness: 0.65
      });

      const wingSpan = 13.6;
      const wingChord = 2.25;
      const lowerWingY = 1.05;
      const upperWingY = 2.68;

      // 1. Upper & Lower Biplane Muslin Wings + Spruce Spars & 17 Exposed Ribs
      for (const wy of [lowerWingY, upperWingY]) {
        const fabricWing = new THREE.Mesh(
          new THREE.BoxGeometry(wingSpan, 0.07, wingChord),
          muslinMat
        );
        fabricWing.position.set(0, wy, 0);
        fabricWing.castShadow = true;
        fabricWing.receiveShadow = true;
        group.add(fabricWing);

        // Leading & Trailing Edge Sitka Spruce Spars
        const leadSpar = new THREE.Mesh(
          new THREE.BoxGeometry(wingSpan + 0.12, 0.1, 0.11),
          spruceMat
        );
        leadSpar.position.set(0, wy + 0.01, -wingChord * 0.48);
        group.add(leadSpar);

        const trailSpar = new THREE.Mesh(
          new THREE.BoxGeometry(wingSpan + 0.08, 0.09, 0.1),
          spruceMat
        );
        trailSpar.position.set(0, wy + 0.01, wingChord * 0.44);
        group.add(trailSpar);

        // Chordwise Wooden Wing Ribs
        for (let rx = -6.4; rx <= 6.4; rx += 0.8) {
          const rib = new THREE.Mesh(
            new THREE.BoxGeometry(0.05, 0.095, wingChord + 0.04),
            darkSpruceMat
          );
          rib.position.set(rx, wy + 0.015, 0);
          group.add(rib);
        }
      }

      // 2. Vertical Spruce Interplane Struts & Diagonal Steel Piano-Wire Cross-Bracing
      const strutXs = [-6.3, -4.2, -2.1, -0.75, 0.75, 2.1, 4.2, 6.3];
      for (let i = 0; i < strutXs.length; i++) {
        const sx = strutXs[i];
        for (const sz of [-0.88, 0.82]) {
          const vStrut = new THREE.Mesh(
            new THREE.BoxGeometry(0.085, upperWingY - lowerWingY, 0.11),
            spruceMat
          );
          vStrut.position.set(sx, (lowerWingY + upperWingY) * 0.5, sz);
          vStrut.castShadow = true;
          group.add(vStrut);
        }
        // Diagonal rigging wires between adjacent strut bays
        if (i < strutXs.length - 1) {
          const nextX = strutXs[i + 1];
          const midX = (sx + nextX) * 0.5;
          const bayW = nextX - sx;
          const bayH = upperWingY - lowerWingY;
          const diagLen = Math.hypot(bayW, bayH);
          const angle = Math.atan2(bayH, bayW);
          for (const dir of [-1, 1]) {
            const wire = new THREE.Mesh(
              new THREE.BoxGeometry(diagLen, 0.025, 0.025),
              wireMat
            );
            wire.position.set(midX, (lowerWingY + upperWingY) * 0.5, -0.85);
            wire.rotation.z = dir * angle;
            group.add(wire);
          }
        }
      }

      // 3. Twin Extended Sitka Spruce Landing Skids / Sled Runners & Forward Outriggers
      for (const side of [-1, 1]) {
        const sx = side * 0.85;
        // Main bottom runner extending from aft of wings all the way under the front canard
        const runner = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.15, 7.6), spruceMat);
        runner.position.set(sx, 0.22, -1.15);
        runner.castShadow = true;
        group.add(runner);

        // Upturned front sled ski tip
        const skiTip = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.14, 1.35), spruceMat);
        skiTip.position.set(sx, 0.56, -5.35);
        skiTip.rotation.x = 0.52;
        group.add(skiTip);

        // Vertical skid-to-wing struts
        for (const kz of [-0.88, 0.82]) {
          const skidPost = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.85, 0.1), spruceMat);
          skidPost.position.set(sx, 0.62, kz);
          group.add(skidPost);
        }

        // Upper forward outrigger boom supporting the front biplane canard
        const upperBoom = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 3.95), spruceMat);
        upperBoom.position.set(sx, 1.55, -2.75);
        upperBoom.rotation.x = 0.14;
        group.add(upperBoom);
      }

      // 4. Iconic Forward Biplane Canard Elevator ("Front Rudder" at z = -4.65m)
      const canardElevatorGroup = new THREE.Group();
      canardElevatorGroup.position.set(0, 1.15, -4.65);
      for (const cy of [-0.38, 0.38]) {
        const canardSurf = new THREE.Mesh(new THREE.BoxGeometry(3.85, 0.055, 0.86), muslinMat);
        canardSurf.position.set(0, cy, 0);
        canardSurf.castShadow = true;
        canardElevatorGroup.add(canardSurf);

        const canardSpar = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.075, 0.08), spruceMat);
        canardSpar.position.set(0, cy, -0.38);
        canardElevatorGroup.add(canardSpar);
      }
      for (const cx of [-1.75, 0, 1.75]) {
        const canardPost = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.82, 0.08), spruceMat);
        canardPost.position.set(cx, 0, 0);
        canardElevatorGroup.add(canardPost);
      }
      group.add(canardElevatorGroup);

      // 5. Aft Twin Vertical Box Rudder on Rear Outrigger Truss Booms (z = +4.05m)
      for (const side of [-1, 1]) {
        for (const by of [lowerWingY + 0.1, upperWingY - 0.1]) {
          const rearBoom = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 3.35), spruceMat);
          rearBoom.position.set(side * 0.58, by, 2.45);
          group.add(rearBoom);
        }
      }
      const rearRudderGroup = new THREE.Group();
      rearRudderGroup.position.set(0, 1.88, 4.05);
      for (const side of [-1, 1]) {
        const rVane = new THREE.Mesh(new THREE.BoxGeometry(0.055, 1.95, 0.92), muslinMat);
        rVane.position.set(side * 0.52, 0, 0);
        rVane.castShadow = true;
        rearRudderGroup.add(rVane);

        const rFrame = new THREE.Mesh(new THREE.BoxGeometry(0.075, 2.02, 0.08), spruceMat);
        rFrame.position.set(side * 0.52, 0, -0.42);
        rearRudderGroup.add(rFrame);
      }
      for (const ry of [-0.88, 0, 0.88]) {
        const rCross = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.07, 0.88), spruceMat);
        rCross.position.set(0, ry, 0);
        rearRudderGroup.add(rCross);
      }
      group.add(rearRudderGroup);

      // 6. 1903 12-HP Wright 4-Cylinder Engine (Starboard) + Prone Pilot Cradle & Brass Gatling (Port)
      const engineBlock = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.42, 0.95), engineAlumMat);
      engineBlock.position.set(0.52, lowerWingY + 0.25, -0.05);
      group.add(engineBlock);

      const flywheel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 12), darkMat);
      flywheel.rotation.x = Math.PI / 2;
      flywheel.position.set(0.52, lowerWingY + 0.26, -0.58);
      group.add(flywheel);

      const brassRadiator = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.25, 0.22), brassMat);
      brassRadiator.position.set(0.75, (lowerWingY + upperWingY) * 0.5, -0.82);
      group.add(brassRadiator);

      // Prone Pilot Hip-Cradle & Vintage Brass Gatling Gun + 1903 Dynamite Crate on Port Side
      const pilotCradle = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.14, 1.45), darkSpruceMat);
      pilotCradle.position.set(-0.42, lowerWingY + 0.09, -0.15);
      group.add(pilotCradle);

      const gatlingBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 1.25), brassMat);
      gatlingBarrel.position.set(-0.42, lowerWingY + 0.26, -1.15);
      group.add(gatlingBarrel);

      const dynamiteCrate = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.32, 0.58), dynamiteRedMat);
      dynamiteCrate.position.set(0.0, lowerWingY - 0.18, 0.15);
      group.add(dynamiteCrate);

      // 7. Twin Counter-Rotating Wooden Pusher Propellers & Bicycle-Chain Drive Tubes
      const wrightProps = [];
      for (const side of [-1, 1]) {
        const propX = side * 1.95;
        const propY = 1.85;
        const propZ = 1.42;

        // Tubular chain guide from engine to propeller shaft
        const chainTube = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.06, 0.08), wireMat);
        chainTube.position.set(side * 1.05, 1.56, 0.72);
        chainTube.rotation.z = side * 0.24;
        chainTube.rotation.y = -side * 0.35;
        group.add(chainTube);

        const shaftStrut = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.75), wireMat);
        shaftStrut.position.set(propX, propY, 1.05);
        group.add(shaftStrut);

        const propPivot = new THREE.Group();
        propPivot.position.set(propX, propY, propZ);
        const hub = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.18), brassMat);
        propPivot.add(hub);

        const blade1 = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.28, 0.06), spruceMat);
        blade1.rotation.x = side * 0.28;
        propPivot.add(blade1);

        const blade2 = new THREE.Mesh(new THREE.BoxGeometry(0.28, 2.55, 0.06), darkSpruceMat);
        blade2.rotation.y = side * 0.28;
        propPivot.add(blade2);

        propPivot.userData.spinDir = side;
        group.add(propPivot);
        wrightProps.push(propPivot);
      }

        const leftAileron = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.35), muslinMat);
        leftAileron.position.set(-5.2, upperWingY, 0.95);
        group.add(leftAileron);

        const rightAileron = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.35), muslinMat);
        rightAileron.position.set(5.2, upperWingY, 0.95);
        group.add(rightAileron);

        // If Russian team (!isUS): 1913 Sikorsky S-22 "Ilya Muromets" (World's First 4-Engine Bomber, Saint Petersburg 1913)
        // Adds the enclosed glazed Russian promenade fuselage cabin + 2 outer tractor propellers + Red Star wing roundels!
        if (!isUS) {
          const sikorskyCabin = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.05, 7.8), spruceMat);
          sikorskyCabin.position.set(0, 1.48, -0.35);
          group.add(sikorskyCabin);
          const noseGlaze = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.72, 1.35), glassMat);
          noseGlaze.position.set(0, 1.62, -4.15);
          group.add(noseGlaze);
          const ruStarMat = new THREE.MeshBasicMaterial({ color: 0xe74c3c });
          for (const side of [-1, 1]) {
            const roundel = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.09, 6), ruStarMat);
            roundel.position.set(side * 4.8, upperWingY + 0.04, 0);
            group.add(roundel);
            // Outer tractor engines (#3 & #4) of the 4-engine Sikorsky Ilya Muromets
            const outerProp = new THREE.Group();
            outerProp.position.set(side * 3.55, 1.52, -1.05);
            const ob1 = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.24, 0.06), darkSpruceMat);
            const ob2 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 2.1, 0.06), spruceMat);
            outerProp.add(ob1, ob2);
            outerProp.userData.spinDir = -side;
            group.add(outerProp);
            wrightProps.push(outerProp);
          }
        }

        group.userData.wrightProps = wrightProps;
        group.userData.controlSurfaces = {
          leftAileron,
          rightAileron,
          elevator: canardElevatorGroup,
          rudders: [rearRudderGroup],
          wingSpan: 6.8
        };
      } else if (role === 'b2_spirit') {
      // =======================================================================
      // NORTHROP B-2A SPIRIT FLYING-WING STEALTH BOMBER (Custom Paintable!)
      // - Iconic 33° swept leading edge & sawtooth "W" double-diamond trailing edge
      // - Blended dorsal crew & avionics nacelle (zero vertical tail fins = stealth!)
      // - 4-pane flush darkly-tinted radar-reflective cockpit windshields
      // - Serrated dorsal S-duct stealth engine intakes & shielded upper exhausts
      // - Twin ventral internal rotary bomb bays loaded with 80x Carpet Bombs & GBU-57 MOP
      // =======================================================================
      let savedBodyHex = isUS ? '#14181f' : '#1e272e';
      let savedAccentHex = isUS ? '#00d2d3' : '#ffd32a';
      try {
        const raw = localStorage.getItem('bb_warehouse_state_v4');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed.b2SpiritColor === 'string') {
            savedBodyHex = parsed.b2SpiritColor;
          }
          if (parsed && typeof parsed.b2SpiritAccentColor === 'string') {
            savedAccentHex = parsed.b2SpiritAccentColor;
          }
        }
      } catch (_) {}

      const b2BodyMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(savedBodyHex),
        roughness: 0.34,
        metalness: 0.45,
        flatShading: false
      });
      const b2AccentMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(savedAccentHex),
        roughness: 0.28,
        metalness: 0.65,
        flatShading: false
      });
      const b2CockpitMat = new THREE.MeshStandardMaterial({
        color: 0x0abde3,
        roughness: 0.12,
        metalness: 0.88,
        transparent: true,
        opacity: 0.78
      });
      const b2ExhaustGlowMat = new THREE.MeshBasicMaterial({ color: 0x00d2d3 });

      // 1. Iconic Northrop B-2 Flying-Wing Planform (2D Shape in X,Y -> Extruded & rotated to X,Z)
      //    Shape Y maps to +Z after rotateX(Math.PI / 2):
      //    Hawk-beak nose at (0, -6.2), swept leading edges out to wingtips (±9.2, 1.4),
      //    chamfered stealth wingtips (±8.6, 2.35), and sawtooth "W" trailing edge:
      //    (±8.6, 2.35) -> (±5.6, 4.45) -> (±2.8, 2.05) -> (0, 4.65)!
      const wingShape = new THREE.Shape();
      wingShape.moveTo(0, -6.2);
      wingShape.lineTo(9.2, 1.4);
      wingShape.lineTo(8.6, 2.35);
      wingShape.lineTo(5.6, 4.45);
      wingShape.lineTo(2.8, 2.05);
      wingShape.lineTo(0, 4.65);
      wingShape.lineTo(-2.8, 2.05);
      wingShape.lineTo(-5.6, 4.45);
      wingShape.lineTo(-8.6, 2.35);
      wingShape.lineTo(-9.2, 1.4);
      wingShape.closePath();

      const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
        depth: 0.34,
        bevelEnabled: true,
        bevelThickness: 0.14,
        bevelSize: 0.22,
        bevelSegments: 3
      });
      wingGeo.rotateX(Math.PI / 2);
      wingGeo.computeVertexNormals();
      const flyingWingMesh = new THREE.Mesh(wingGeo, b2BodyMat);
      flyingWingMesh.position.set(0, 1.42, 0);
      flyingWingMesh.castShadow = true;
      flyingWingMesh.receiveShadow = true;
      flyingWingMesh.userData.isB2Paintable = true;
      group.add(flyingWingMesh);

      // 2. Blended Central Crew & Avionics Nacelle Hump (smooth aerodynamic spine)
      const nacelleShape = new THREE.Shape();
      nacelleShape.moveTo(0, -5.65);
      nacelleShape.lineTo(2.45, -1.2);
      nacelleShape.lineTo(2.15, 2.15);
      nacelleShape.lineTo(0, 4.15);
      nacelleShape.lineTo(-2.15, 2.15);
      nacelleShape.lineTo(-2.45, -1.2);
      nacelleShape.closePath();

      const nacelleGeo = new THREE.ExtrudeGeometry(nacelleShape, {
        depth: 0.52,
        bevelEnabled: true,
        bevelThickness: 0.24,
        bevelSize: 0.45,
        bevelSegments: 4
      });
      nacelleGeo.rotateX(Math.PI / 2);
      nacelleGeo.computeVertexNormals();
      const nacelleMesh = new THREE.Mesh(nacelleGeo, b2BodyMat);
      nacelleMesh.position.set(0, 1.85, 0);
      nacelleMesh.castShadow = true;
      nacelleMesh.userData.isB2Paintable = true;
      group.add(nacelleMesh);

      // Upper Crew Cabin Crown
      const crownGeo = new THREE.BoxGeometry(2.1, 0.38, 4.2);
      const crownMesh = new THREE.Mesh(crownGeo, b2BodyMat);
      crownMesh.position.set(0, 2.02, -1.35);
      crownMesh.userData.isB2Paintable = true;
      crownMesh.userData.hideIn1PCockpit = true;
      group.add(crownMesh);

      // 3. Signature 4-Pane Flush Stealth Cockpit Windscreens along the forward beak
      const cockpitCanopyParts = [crownMesh];
      for (const side of [-1, 1]) {
        const innerPane = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.22, 0.95), b2CockpitMat);
        innerPane.position.set(side * 0.42, 2.1, -3.15);
        innerPane.rotation.y = -side * 0.32;
        innerPane.rotation.x = 0.22;
        innerPane.userData.hideIn1PCockpit = true;
        group.add(innerPane);
        cockpitCanopyParts.push(innerPane);

        const outerPane = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.2, 0.88), b2CockpitMat);
        outerPane.position.set(side * 1.02, 2.02, -2.55);
        outerPane.rotation.y = -side * 0.62;
        outerPane.rotation.x = 0.18;
        outerPane.userData.hideIn1PCockpit = true;
        group.add(outerPane);
        cockpitCanopyParts.push(outerPane);
      }
      group.userData.cockpitCanopyParts = cockpitCanopyParts;

      // 4. Swept Leading-Edge Stealth RAM Trim Strips & Sawtooth Dorsal S-Duct Engine Intakes
      const rudders = [];
      for (const side of [-1, 1]) {
        // Leading-Edge Accent Trim Strip
        const leadStrip = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.12, 0.26), b2AccentMat);
        leadStrip.position.set(side * 4.45, 1.28, -2.35);
        leadStrip.rotation.y = -side * 0.69; // Matches 33° sweep
        leadStrip.userData.isB2Accent = true;
        group.add(leadStrip);

        // Sawtooth Trailing-Edge Accent Strips
        const outerTrailStrip = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.1, 0.22), b2AccentMat);
        outerTrailStrip.position.set(side * 7.1, 1.26, 3.4);
        outerTrailStrip.rotation.y = side * 0.61;
        outerTrailStrip.userData.isB2Accent = true;
        group.add(outerTrailStrip);

        const innerTrailStrip = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.1, 0.22), b2AccentMat);
        innerTrailStrip.position.set(side * 1.4, 1.26, 3.35);
        innerTrailStrip.rotation.y = side * 0.74;
        innerTrailStrip.userData.isB2Accent = true;
        group.add(innerTrailStrip);

        // Dorsal Serrated S-Duct Engine Nacelle (F118-GE-100 Quad Stealth Turbofans)
        const intakeHousing = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.42, 2.85), b2BodyMat);
        intakeHousing.position.set(side * 2.15, 1.62, -0.35);
        intakeHousing.userData.isB2Paintable = true;
        group.add(intakeHousing);

        const intakeLip = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.16, 0.45), b2AccentMat);
        intakeLip.position.set(side * 2.15, 1.76, -1.78);
        intakeLip.rotation.x = 0.28;
        intakeLip.userData.isB2Accent = true;
        group.add(intakeLip);

        const intakeDarkCavity = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.26, 0.35), darkMat);
        intakeDarkCavity.position.set(side * 2.15, 1.58, -1.76);
        group.add(intakeDarkCavity);

        // Recessed Upper-Deck Stealth Exhaust Troughs (shielded from ground IR/radar below)
        const exhaustTrough = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.18, 1.45), darkMat);
        exhaustTrough.position.set(side * 1.95, 1.48, 1.85);
        group.add(exhaustTrough);

        const exhaustGlow = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.14, 0.38), b2ExhaustGlowMat);
        exhaustGlow.position.set(side * 1.95, 1.54, 1.25);
        group.add(exhaustGlow);

        // Twin Ventral Internal Rotary Bomb Bays (Open bay doors + 80x Mk-82 Carpet Bombs & GBU-57 MOP)
        const bayDoorOuter = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.48, 2.95), b2AccentMat);
        bayDoorOuter.position.set(side * 1.35, 0.82, -0.35);
        bayDoorOuter.rotation.z = side * 0.28;
        bayDoorOuter.userData.isB2Accent = true;
        group.add(bayDoorOuter);

        // Rotary Bomb Rack Drum inside Weapon Bay
        for (const bz of [-1.25, -0.35, 0.55]) {
          const carpetBomb = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.78), ordOliveMat);
          carpetBomb.position.set(side * 0.72, 0.92, bz);
          group.add(carpetBomb);
        }

        // Split Wingtip Drag-Rudder / Elevon Control Surfaces
        const splitRudder = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.14, 0.48), b2AccentMat);
        splitRudder.position.set(side * 7.6, 1.26, 2.75);
        splitRudder.rotation.y = side * 0.61;
        splitRudder.userData.isB2Accent = true;
        group.add(splitRudder);
        rudders.push(splitRudder);
      }

      // Centerline GBU-57A/B MOP (30,000lb Massive Ordnance Penetrator Bunker-Buster) in Central Bay
      const mopBomb = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.54, 2.75), ordWhiteMat);
      mopBomb.position.set(0, 0.86, -0.25);
      group.add(mopBomb);

      const leftAileron = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 0.48), b2AccentMat);
      leftAileron.position.set(-5.8, 1.26, 3.65);
      leftAileron.rotation.y = -0.61;
      leftAileron.userData.isB2Accent = true;
      group.add(leftAileron);

      const rightAileron = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 0.48), b2AccentMat);
      rightAileron.position.set(5.8, 1.26, 3.65);
      rightAileron.rotation.y = 0.61;
      rightAileron.userData.isB2Accent = true;
      group.add(rightAileron);

      const elevator = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.12, 0.46), b2AccentMat);
      elevator.position.set(0, 1.26, 4.15);
      elevator.userData.isB2Accent = true;
      group.add(elevator);

      // If Russian team (!isUS): Tupolev PAK DA "Poslannik" Russian Stealth Bomber
      // Adds swept cranked-arrow wingtip winglets & Russian VKS Red Star insignia!
      if (!isUS) {
        const ruStarMat = new THREE.MeshBasicMaterial({ color: 0xff3838 });
        for (const side of [-1, 1]) {
          const pakWinglet = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.05, 1.55), b2BodyMat);
          pakWinglet.position.set(side * 8.65, 1.85, 1.85);
          pakWinglet.rotation.z = -side * 0.32;
          pakWinglet.userData.isB2Paintable = true;
          group.add(pakWinglet);

          const vksStar = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 5), ruStarMat);
          vksStar.position.set(side * 5.2, 1.82, 0.65);
          group.add(vksStar);
        }
      }

      group.userData.controlSurfaces = {
        leftAileron,
        rightAileron,
        elevator,
        rudders,
        wingSpan: 9.0
      };
      applyB2SpiritColorToMesh(group, savedBodyHex, savedAccentHex);
    } else if (role === 'gunship') {
      // =======================================================================
      // LOCKHEED AC-130J GHOSTRIDER / C-130 HERCULES GUNSHIP (US)
      // & TUPOLEV TU-95MS BEAR-H HEAVY GUNSHIP (RU)
      // Dedicated full-bodied cargo/gunship airframe (fuselage NEVER hides!)
      // =======================================================================
      const gsUpperMat = new THREE.MeshStandardMaterial({
        color: isUS ? 0x525e6a : 0x4b5662,
        roughness: 0.52,
        metalness: 0.34,
        flatShading: true
      });
      const gsBellyMat = new THREE.MeshStandardMaterial({
        color: isUS ? 0x353e47 : 0x2f3740,
        roughness: 0.58,
        metalness: 0.3,
        flatShading: true
      });
      const radomeMat = new THREE.MeshStandardMaterial({
        color: 0x1d2329,
        roughness: 0.45,
        metalness: 0.35,
        flatShading: true
      });
      const propBladeMat = new THREE.MeshStandardMaterial({
        color: 0x252b31,
        roughness: 0.42,
        metalness: 0.45
      });
      const propTipMat = new THREE.MeshBasicMaterial({ color: 0xf1c40f });

      // 1. Wide Pressurized C-130 Cargo Fuselage Hull + Belly Chine + Dorsal Wing-Box Spine
      const mainCargoBody = new THREE.Mesh(
        new THREE.BoxGeometry(isUS ? 2.65 : 2.15, isUS ? 2.18 : 1.95, isUS ? 10.6 : 12.2),
        gsUpperMat
      );
      mainCargoBody.position.set(0, 1.88, 0.15);
      mainCargoBody.castShadow = true;
      mainCargoBody.receiveShadow = true;
      group.add(mainCargoBody);

      const lowerBelly = new THREE.Mesh(
        new THREE.BoxGeometry(isUS ? 2.42 : 1.95, 0.52, isUS ? 10.2 : 11.6),
        gsBellyMat
      );
      lowerBelly.position.set(0, 0.78, 0.1);
      group.add(lowerBelly);

      const dorsalWingBox = new THREE.Mesh(
        new THREE.BoxGeometry(isUS ? 2.35 : 1.85, 0.44, 3.8),
        gsUpperMat
      );
      dorsalWingBox.position.set(0, 3.08, -0.35);
      group.add(dorsalWingBox);

      // 2. Iconic C-130 Main Landing Gear Side Sponson Pods + Heavy Tandem Twin Wheels
      for (const side of [-1, 1]) {
        const sponson = new THREE.Mesh(
          new THREE.BoxGeometry(0.62, 0.92, 4.1),
          gsBellyMat
        );
        sponson.position.set(side * (isUS ? 1.48 : 1.22), 1.02, 0.35);
        sponson.castShadow = true;
        group.add(sponson);

        const bogieGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 10);
        bogieGeo.rotateZ(Math.PI / 2);
        for (const bz of [-0.35, 0.85]) {
          const mw = new THREE.Mesh(bogieGeo, darkMat);
          mw.position.set(side * (isUS ? 1.52 : 1.25), 0.42, bz);
          group.add(mw);
          wheels.push(mw);
        }
      }

      // 3. Stepped C-130 Forward Flight Deck, Multi-Pane Glazed Greenhouse Windshield & Radar Radome
      const forwardNoseLower = new THREE.Mesh(
        new THREE.BoxGeometry(isUS ? 2.32 : 1.88, 1.38, 2.35),
        gsUpperMat
      );
      forwardNoseLower.position.set(0, 1.46, isUS ? -5.85 : -6.65);
      forwardNoseLower.castShadow = true;
      group.add(forwardNoseLower);

      const noseRadome = new THREE.Mesh(
        new THREE.CylinderGeometry(0.52, 0.92, 1.45, 10),
        radomeMat
      );
      noseRadome.rotation.x = -Math.PI / 2;
      noseRadome.position.set(0, 1.32, isUS ? -7.45 : -8.25);
      group.add(noseRadome);

      const cockpitWindshield = new THREE.Mesh(
        new THREE.BoxGeometry(isUS ? 2.18 : 1.78, 0.72, 1.55),
        glassMat
      );
      cockpitWindshield.position.set(0, 2.38, isUS ? -5.42 : -6.15);
      cockpitWindshield.rotation.x = 0.28;
      cockpitWindshield.userData.hideIn1PCockpit = true;
      group.add(cockpitWindshield);

      const flightDeckCrown = new THREE.Mesh(
        new THREE.BoxGeometry(isUS ? 2.15 : 1.75, 0.34, 1.85),
        gsUpperMat
      );
      flightDeckCrown.position.set(0, 2.82, isUS ? -4.55 : -5.25);
      flightDeckCrown.userData.hideIn1PCockpit = true;
      group.add(flightDeckCrown);

      // Only hide the small cockpit glass/roof in 1P pilot view — NEVER hide the AC-130 cargo fuselage!
      group.userData.cockpitCanopyParts = [cockpitWindshield, flightDeckCrown];

      // Ventral AN/AAQ-39 EO/IR FLIR Gimbal Sensor Turret Ball under the forward port chin
      const flirBall = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 10), radomeMat);
      flirBall.position.set(-0.65, 0.56, -4.55);
      const flirLens = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.22, 0.16), glassMat);
      flirLens.position.set(-0.82, 0.52, -4.62);
      group.add(flirBall, flirLens);

      // 4. Upswept C-130 Rear Cargo Ramp ("Beaver Tail") & Tail Cone
      const rearRamp = new THREE.Mesh(
        new THREE.BoxGeometry(isUS ? 2.38 : 1.92, 1.62, 3.25),
        gsUpperMat
      );
      rearRamp.position.set(0, 2.08, isUS ? 6.45 : 7.25);
      rearRamp.rotation.x = 0.24;
      rearRamp.castShadow = true;
      group.add(rearRamp);

      // 5. High-Mounted Straight Hercules Wing (17.8m span) OR Tu-95MS 35° Swept Wings
      if (isUS) {
        const highWing = new THREE.Mesh(new THREE.BoxGeometry(17.8, 0.36, 2.95), airWingMat);
        highWing.position.set(0, 2.95, -0.35);
        highWing.castShadow = true;
        highWing.receiveShadow = true;
        group.add(highWing);
      } else {
        for (const side of [-1, 1]) {
          const sweptHalf = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.34, 2.45), airWingMat);
          sweptHalf.position.set(side * 4.35, 2.55, 0.85);
          sweptHalf.rotation.y = -side * 0.46;
          sweptHalf.castShadow = true;
          group.add(sweptHalf);
        }
      }

      // 6. 4 Turboprop Engine Nacelles, Spinners, 4-Blade Propellers & Underwing Fuel Tanks
      const gunshipProps = [];
      for (const wx of [-6.35, -3.55, 3.55, 6.35]) {
        const nacZ = isUS ? -0.95 : Math.abs(wx) * 0.38 - 0.85;
        const nacY = isUS ? 2.62 : 2.32;
        const nac = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.92, 2.95), gsBellyMat);
        nac.position.set(wx, nacY, nacZ);
        nac.castShadow = true;
        group.add(nac);

        const exhaustPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.55, 8), darkMat);
        exhaustPipe.rotation.x = Math.PI / 2;
        exhaustPipe.position.set(wx, nacY - 0.28, nacZ + 1.45);
        group.add(exhaustPipe);

        // Spinning 4-Blade Propeller Hub (rotates cleanly around forward Z shaft!)
        const propPivot = new THREE.Group();
        propPivot.position.set(wx, nacY + 0.06, nacZ - 1.56);
        const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.68, 8), radomeMat);
        spinner.rotation.x = -Math.PI / 2;
        spinner.position.set(0, 0, -0.22);
        propPivot.add(spinner);

        const bladeH = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.22, 0.06), propBladeMat);
        const bladeV = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.35, 0.06), propBladeMat);
        propPivot.add(bladeH, bladeV);
        for (const [tx, ty] of [[-1.12, 0], [1.12, 0], [0, -1.12], [0, 1.12]]) {
          const tip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.07), propTipMat);
          tip.position.set(tx, ty, 0);
          propPivot.add(tip);
        }
        propPivot.userData.spinDir = wx < 0 ? 1 : -1;
        group.add(propPivot);
        gunshipProps.push(propPivot);
      }
      group.userData.wrightProps = gunshipProps;

      // External Underwing Sargent-Fletcher Fuel Tanks between inner & outer engines
      if (isUS) {
        for (const side of [-1, 1]) {
          const fuelTank = new THREE.Mesh(
            new THREE.CylinderGeometry(0.34, 0.34, 3.1, 10),
            gsUpperMat
          );
          fuelTank.rotation.x = Math.PI / 2;
          fuelTank.position.set(side * 4.95, 2.28, -0.45);
          group.add(fuelTank);
        }
      }

      // 7. Tall Swept C-130 Vertical Tail Fin, Dorsal Fillet & Wide Horizontal Tailplane
      const dorsalFillet = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.35, 2.85), gsUpperMat);
      dorsalFillet.position.set(0, 3.25, isUS ? 5.15 : 5.85);
      dorsalFillet.rotation.x = -0.35;
      group.add(dorsalFillet);

      const tallTail = new THREE.Mesh(new THREE.BoxGeometry(0.36, 3.65, 2.65), airWingMat);
      tallTail.position.set(0, 4.35, isUS ? 6.85 : 7.55);
      tallTail.castShadow = true;
      group.add(tallTail);

      const rudder = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.15, 0.62), darkMat);
      rudder.position.set(0, 4.35, isUS ? 8.35 : 9.05);
      group.add(rudder);

      const tailStab = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.24, 1.75), airWingMat);
      tailStab.position.set(0, 2.75, isUS ? 6.95 : 7.65);
      group.add(tailStab);

      const leftAileron = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.14, 0.55), darkMat);
      leftAileron.position.set(-6.8, 2.94, 1.15);
      group.add(leftAileron);
      const rightAileron = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.14, 0.55), darkMat);
      rightAileron.position.set(6.8, 2.94, 1.15);
      group.add(rightAileron);
      const elevator = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.14, 0.5), darkMat);
      elevator.position.set(0, 2.75, isUS ? 7.92 : 8.62);
      group.add(elevator);
      group.userData.controlSurfaces = { leftAileron, rightAileron, elevator, rudders: [rudder], wingSpan: 8.9 };

      // 8. Armored Port-Side (-X) Gunship Embrasures & Trainable Weapon Battery (25mm, 40mm Bofors, 105mm M102 Howitzer)
      const portHullX = isUS ? -1.35 : -1.12;
      for (const ez of [-2.05, 0.15, 2.35]) {
        const embrasure = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.68, 0.92), radomeMat);
        embrasure.position.set(portHullX, 1.52, ez);
        group.add(embrasure);
      }

      barrelGroup = new THREE.Group();
      const gau25 = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 1.55, 8), barrelMat);
      gau25.rotation.z = Math.PI / 2;
      gau25.rotation.y = 0.14;
      gau25.position.set(portHullX - 0.65, 1.56, -2.05);
      barrelGroup.add(gau25);

      const bofors40 = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 2.05, 8), barrelMat);
      bofors40.rotation.z = Math.PI / 2;
      bofors40.rotation.y = 0.12;
      bofors40.position.set(portHullX - 0.85, 1.48, 0.15);
      barrelGroup.add(bofors40);

      const howitzer105 = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 2.55, 10), darkMat);
      howitzer105.rotation.z = Math.PI / 2;
      howitzer105.rotation.y = 0.1;
      howitzer105.position.set(portHullX - 1.05, 1.38, 2.35);
      barrelGroup.add(howitzer105);

      group.add(barrelGroup);
      group.userData.gunshipBarrelGroup = barrelGroup;
    } else {
      // Sculpted Modern Tactical Fighter & CAS Airframe (oriented along -Z)
      const bodyLen = role === 'bomber' ? 9.4 : role === 'fighter' ? 8.8 : 8.4;
      const radomeDarkMat = new THREE.MeshStandardMaterial({
        color: 0x1e252c,
        roughness: 0.38,
        metalness: 0.42,
        flatShading: true
      });
      const canopyTintMat = new THREE.MeshStandardMaterial({
        color: isUS ? 0x38bdf8 : 0x60a5fa,
        roughness: 0.14,
        metalness: 0.82,
        transparent: true,
        opacity: 0.72
      });

      const fuselage = new THREE.Mesh(
        new THREE.BoxGeometry(role === 'cas' ? 1.28 : 1.38, 0.92, bodyLen),
        airMat
      );
      fuselage.position.set(0, 1.32, 0.15);
      fuselage.castShadow = true;
      group.add(fuselage);

      // Sleek Dorsal Spine Fairing behind the Teardrop Canopy
      const dorsalSpine = new THREE.Mesh(
        new THREE.BoxGeometry(0.76, 0.34, bodyLen * 0.54),
        airMat
      );
      dorsalSpine.position.set(0, 1.84, 1.55);
      group.add(dorsalSpine);

      // Tapered Forward Cockpit Fuselage & Conical Radar Nose Radome
      const noseCone = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.68, 2.25), airMat);
      noseCone.position.set(0, 1.26, -bodyLen * 0.5 - 0.85);
      noseCone.castShadow = true;
      group.add(noseCone);

      const noseRadome = new THREE.Mesh(
        new THREE.ConeGeometry(role === 'cas' ? 0.44 : 0.48, role === 'cas' ? 1.45 : 2.15, 10),
        role === 'cas' ? airMat : radomeDarkMat
      );
      noseRadome.rotation.x = -Math.PI / 2;
      noseRadome.position.set(0, 1.24, -bodyLen * 0.5 - (role === 'cas' ? 2.55 : 2.95));
      group.add(noseRadome);

      // Aerodynamic Teardrop Bubble Canopy (angled windscreen + curved crown + tapered rear fairing — zero shoebox!)
      const canopyWindscreen = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.46, 1.25, 8),
        canopyTintMat
      );
      canopyWindscreen.rotation.x = -Math.PI / 2 + 0.24;
      canopyWindscreen.scale.set(1.0, 1.0, 0.78);
      canopyWindscreen.position.set(0, 1.86, -2.65);
      group.add(canopyWindscreen);

      const canopy = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.45, role === 'bomber' ? 1.65 : 1.2, 6, 10),
        canopyTintMat
      );
      canopy.rotation.x = Math.PI / 2;
      canopy.scale.set(1.02, 1.0, 0.74);
      canopy.position.set(0, 1.92, -1.55);
      canopy.userData.hideIn1PCockpit = true;
      group.add(canopy);

      // Hide forward exterior hull/canopy/radome/nose-gear in 1P Cockpit so ZERO disembodied parts float in front of the HUD!
      const cockpitCanopyParts = [canopy, canopyWindscreen, fuselage, dorsalSpine, noseCone, noseRadome];
      if (noseGearWheel) cockpitCanopyParts.push(noseGearWheel);
      group.userData.cockpitCanopyParts = cockpitCanopyParts;

      if (role === 'cas') {
        ({ barrelGroup } = buildCasAircraftWingAndTail({
          ...modelCtx,
          bodyLen,
          cockpitCanopyParts,
          airMat,
          airWingMat,
          burnerMat,
          ordWhiteMat,
          ordOliveMat
        }));
      } else if (role === 'bomber') {
        ({ barrelGroup } = buildBomberAircraftWingAndTail({
          ...modelCtx,
          bodyLen,
          cockpitCanopyParts,
          airMat,
          airWingMat,
          burnerMat,
          ordWhiteMat,
          ordOliveMat
        }));
      } else {
        // US: McDonnell Douglas / Boeing F-15EX Eagle II (45° Swept-Back Cropped-Delta Wing, NO Canards, Upright Twin Tails)
        // RU: Sukhoi Su-57 Felon / Su-35S Flanker-E (Swept-Back Trapezoidal Delta Wing, Canted Twin Tails & Rear Tail-Sting)
        // 1. Sculpted True 45° Swept-Back Cropped-Delta Main Wing Planform (Shape Y maps to +Z aft after rotateX(PI/2)!)
        const fWingShape = new THREE.Shape();
        fWingShape.moveTo(0, -1.85);
        fWingShape.lineTo(1.14, -1.85);
        fWingShape.lineTo(5.62, 1.92); // 45° swept-BACK leading edge out to wingtip!
        fWingShape.lineTo(5.18, 2.74); // Characteristic raked/cropped F-15 wingtip
        fWingShape.lineTo(1.08, 2.52); // Nearly straight F-15 trailing edge
        fWingShape.lineTo(-1.08, 2.52);
        fWingShape.lineTo(-5.18, 2.74);
        fWingShape.lineTo(-5.62, 1.92);
        fWingShape.lineTo(-1.14, -1.85);
        fWingShape.closePath();

        const fWingGeo = new THREE.ExtrudeGeometry(fWingShape, {
          depth: 0.16,
          bevelEnabled: true,
          bevelThickness: 0.03,
          bevelSize: 0.05,
          bevelSegments: 1
        });
        fWingGeo.rotateX(Math.PI / 2);
        fWingGeo.computeVertexNormals();
        const fWingMesh = new THREE.Mesh(fWingGeo, airWingMat);
        fWingMesh.position.set(0, 1.44, 0.05);
        fWingMesh.castShadow = true;
        fWingMesh.receiveShadow = true;
        group.add(fWingMesh);

        // 2. Swept-Back All-Moving Dogtooth Horizontal Stabilators (z = +3.30 .. +5.05 aft, matching CCW winding!)
        for (const side of [-1, 1]) {
          const stabShape = new THREE.Shape();
          if (side > 0) {
            stabShape.moveTo(0.92, 3.28);
            stabShape.lineTo(3.02, 4.58);
            stabShape.lineTo(2.76, 5.08);
            stabShape.lineTo(0.92, 4.92);
          } else {
            stabShape.moveTo(-0.92, 4.92);
            stabShape.lineTo(-2.76, 5.08);
            stabShape.lineTo(-3.02, 4.58);
            stabShape.lineTo(-0.92, 3.28);
          }
          stabShape.closePath();
          const stabGeo = new THREE.ExtrudeGeometry(stabShape, {
            depth: 0.12,
            bevelEnabled: false
          });
          stabGeo.rotateX(Math.PI / 2);
          stabGeo.computeVertexNormals();
          const tailplane = new THREE.Mesh(stabGeo, airWingMat);
          tailplane.position.set(0, 1.36, 0);
          tailplane.castShadow = true;
          group.add(tailplane);

          // Twin Chiseled 2D Variable-Ramp Side Engine Intakes & Conformal Fuel Tank (CFT) Shoulders (NO forward canards!)
          const intakeDuct = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.72, 5.35), airMat);
          intakeDuct.position.set(side * 0.94, 1.25, 0.62);
          intakeDuct.castShadow = true;
          group.add(intakeDuct);
          cockpitCanopyParts.push(intakeDuct);

          const intakeRamp = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.16, 0.95), airWingMat);
          intakeRamp.position.set(side * 0.94, 1.56, -2.18);
          intakeRamp.rotation.x = 0.24;
          group.add(intakeRamp);
          cockpitCanopyParts.push(intakeRamp);

          const intakeMouth = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.56, 0.35), darkMat);
          intakeMouth.position.set(side * 0.94, 1.22, -2.12);
          intakeMouth.rotation.x = 0.22;
          group.add(intakeMouth);
          cockpitCanopyParts.push(intakeMouth);
        }

        if (!isUS) {
          // Sukhoi Su-57 / Su-35S Signature Rear Radar Tail-Sting Boom between Twin Nozzles
          const suTailSting = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.36, 2.15), airMat);
          suTailSting.position.set(0, 1.38, 4.65);
          group.add(suTailSting);
        }

        const rudders = [];
        for (const side of [-1, 1]) {
          // US F-15EX: Iconic Twin Upright Vertical Tails + Fin-Tip TEWS Pods • RU Su-57: Canted Twin Tails
          const tailCant = isUS ? -side * 0.04 : -side * 0.36;
          const vertTail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.98, 1.88), airWingMat);
          vertTail.position.set(side * 1.04, 2.3, 3.55);
          vertTail.rotation.z = tailCant;
          vertTail.castShadow = true;
          group.add(vertTail);
          if (isUS) {
            const tewsPod = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.12, 8), airMat);
            tewsPod.rotation.x = Math.PI / 2;
            tewsPod.position.set(side * 1.08, 3.3, 3.52);
            group.add(tewsPod);
          }
          const rudder = new THREE.Mesh(new THREE.BoxGeometry(0.13, 1.52, 0.42), darkMat);
          rudder.position.set(side * 1.04, 2.28, 4.58);
          rudder.rotation.z = tailCant;
          group.add(rudder);
          rudders.push(rudder);

          // Twin Cylindrical Turkey-Feather F110-GE-129 Afterburner Nozzles + Glowing Core
          const nozzleShroud = new THREE.Mesh(
            new THREE.CylinderGeometry(0.34, 0.4, 0.95, 10),
            darkMat
          );
          nozzleShroud.rotation.x = Math.PI / 2;
          nozzleShroud.position.set(side * (isUS ? 0.52 : 0.64), 1.32, 4.55);
          group.add(nozzleShroud);

          const burner = new THREE.Mesh(
            new THREE.CylinderGeometry(0.26, 0.3, 0.45, 10),
            burnerMat
          );
          burner.rotation.x = Math.PI / 2;
          burner.position.set(side * (isUS ? 0.52 : 0.64), 1.32, 4.92);
          group.add(burner);

          // Underwing Dual LAU-128 Pylon AIM-120D AMRAAM / R-77MFOX-3 Missiles (authentic F-15 underwing stations!)
          for (const mx of [3.35, 3.72]) {
            const a2aMissile = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 1.82), ordWhiteMat);
            a2aMissile.position.set(side * mx, 1.18, 1.05);
            group.add(a2aMissile);
          }

          // Inboard Underwing 500lb JDAM / KAB-500 Precision Bombs
          const jdam = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 1.78), ordOliveMat);
          jdam.position.set(side * 2.25, 1.02, 0.92);
          group.add(jdam);
        }
        // Centerline 2,000lb GBU-28 / KAB-1500 Heavy Bomb
        const gbu = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.44, 2.35), ordOliveMat);
        gbu.position.set(0, 0.78, 0.45);
        group.add(gbu);
        const leftAileron = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.11, 0.42), darkMat);
        leftAileron.position.set(-3.45, 1.36, 2.66);
        leftAileron.rotation.y = 0.05;
        group.add(leftAileron);
        const rightAileron = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.11, 0.42), darkMat);
        rightAileron.position.set(3.45, 1.36, 2.66);
        rightAileron.rotation.y = -0.05;
        group.add(rightAileron);
        const elevator = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.11, 0.42), darkMat);
        elevator.position.set(0, 1.32, 4.86);
        group.add(elevator);
        group.userData.controlSurfaces = { leftAileron, rightAileron, elevator, rudders, wingSpan: 5.6 };
      }
    }
  } else if (cfg.isEmplacement && cfg.type !== 'trebuchet') {
    ({ barrelGroup } = buildEmplacementModel(modelCtx));
  } else if (cfg.type === 'aa') {
    ({ barrelGroup } = buildSpaagModel(modelCtx));
  } else if (cfg.type === 'atv') {
    // =========================================================================
    // POLARIS SPORTSMAN MV850 / RM-800 TACTICAL 4x4 QUAD ATV (High-Fidelity Merged Model)
    // - Nose points along -Z, Rear points along +Z
    // - Sculpted multi-plane tactical bodywork, dual arched A-arm IRS suspension,
    //   Fox piggyback coil-overs, CV half-shafts, finned 850cc twin engine,
    //   tubular exo-bumpers, Warn winch, rifle scabbard & Lock-and-Ride expedition gear!
    // =========================================================================
    const primaryColor = cfg.colorHex ?? (isUS ? 0x4e5b31 : 0x3d4a3a);
    const accentColor = cfg.accentHex ?? 0x1e2326;
    const primaryMat = new THREE.MeshStandardMaterial({
      color: primaryColor,
      roughness: 0.52,
      metalness: 0.28,
      flatShading: true
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: accentColor,
      roughness: 0.48,
      metalness: 0.48,
      flatShading: true
    });
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xdcdde1,
      roughness: 0.2,
      metalness: 0.88
    });
    const shockMat = new THREE.MeshStandardMaterial({
      color: isUS ? 0xd4a017 : 0xe67e22,
      metalness: 0.78,
      roughness: 0.24
    });
    const ledMat = new THREE.MeshBasicMaterial({ color: 0x00d2d3 });
    const headBeamMat = new THREE.MeshBasicMaterial({ color: 0xf5f6fa });
    const tailLedMat = new THREE.MeshBasicMaterial({ color: 0xd63031 });
    const jerryCanMat = new THREE.MeshStandardMaterial({
      color: 0xb33939,
      roughness: 0.52,
      flatShading: true
    });
    const ammoBoxMat = new THREE.MeshStandardMaterial({
      color: 0x3d4c2c,
      roughness: 0.68,
      flatShading: true
    });

    // 1. 4 Deep-Lug Directional Mud Tires + 6-Spoke Beadlock Rims + Ventilated Brake Discs
    const atvTireGeo = _getMergedTreadTireGeo(0.44, 0.36, 16, 12, 0.37, 0.055, 0.085, 0.432);
    const atvRimHubGeo = (() => {
      let g = _vehGeoCache.get('atv:rimHub6');
      if (!g) {
        const pts = [
          _vPart(_getCachedCylGeo(0.255, 0.255, 0.37, 14, Math.PI / 2), 0, 0, 0),
          _vPart(_getCachedCylGeo(0.095, 0.11, 0.41, 10, Math.PI / 2), 0, 0, 0)
        ];
        g = _mergePartGeometries(pts);
        _vehGeoCache.set('atv:rimHub6', g);
      }
      return g;
    })();
    const atvBeadGeo = _getCachedCylGeo(0.27, 0.27, 0.388, 14, Math.PI / 2);
    const atvSpokeRotorGeo = (() => {
      let g = _vehGeoCache.get('atv:spokeRotor6');
      if (!g) {
        const pts = [
          _vPart(_getMergedSpokesGeo(6, 0.395, 0.036, 0.48), 0, 0, 0),
          _vPart(_getCachedCylGeo(0.195, 0.195, 0.022, 12, Math.PI / 2), 0, 0, 0)
        ];
        g = _mergePartGeometries(pts);
        _vehGeoCache.set('atv:spokeRotor6', g);
      }
      return g;
    })();

    for (const [wx, wz] of [
      [-0.82, -0.96],
      [0.82, -0.96],
      [-0.82, 0.96],
      [0.82, 0.96]
    ]) {
      const wheelPivot = new THREE.Group();
      wheelPivot.position.set(wx, 0.44, wz);

      const tire = new THREE.Mesh(atvTireGeo, darkMat);
      tire.castShadow = true;
      wheelPivot.add(tire);

      wheelPivot.add(new THREE.Mesh(atvRimHubGeo, accentMat));
      wheelPivot.add(new THREE.Mesh(atvBeadGeo, shockMat));
      wheelPivot.add(new THREE.Mesh(atvSpokeRotorGeo, chromeMat));

      group.add(wheelPivot);
      wheels.push(wheelPivot);
    }

    // 2. Sculpted Multi-Faceted Tactical ATV Bodywork, Beak Hood & Swept Mudguard Fenders (primaryMat)
    _addVehMerged(
      group,
      'atv:v2:bodyPrimary',
      primaryMat,
      (p) => {
        // Tapered shark-nose front cowl (-Z) + sculpted power-bulge hood + side radiator shrouds
        p.push(_vPart(_getCachedBoxGeo(0.92, 0.2, 0.44), 0, 1.0, -0.96, 0.28, 0, 0));
        p.push(_vPart(_getCachedBoxGeo(1.04, 0.24, 0.68), 0, 1.09, -0.58, 0.16, 0, 0));
        p.push(_vPart(_getCachedBoxGeo(0.58, 0.08, 0.56), 0, 1.21, -0.56, 0.16, 0, 0));
        // Ergonomically pinched center knee-grip fuel tank & rear body spine
        p.push(_vPart(_getCachedBoxGeo(0.68, 0.36, 0.92), 0, 0.98, 0.02));
        p.push(_vPart(_getCachedBoxGeo(0.98, 0.28, 0.68), 0, 0.99, 0.72, -0.08, 0, 0));
        for (const s of [-1, 1]) {
          // Angled radiator side wings
          p.push(_vPart(_getCachedBoxGeo(0.14, 0.34, 0.62), s * 0.49, 0.92, -0.52, 0.18, s * -0.14, 0));
          // Multi-segment swept front mudguard fenders (over ±0.82, -0.96)
          p.push(_vPart(_getCachedBoxGeo(0.48, 0.09, 0.52), s * 0.74, 1.04, -0.94, 0.06, 0, s * -0.06));
          p.push(_vPart(_getCachedBoxGeo(0.46, 0.08, 0.34), s * 0.74, 0.97, -1.24, 0.38, 0, 0));
          p.push(_vPart(_getCachedBoxGeo(0.44, 0.34, 0.14), s * 0.72, 0.84, -0.64, -0.44, 0, 0));
          // Multi-segment swept rear mudguard fenders (over ±0.82, +0.96)
          p.push(_vPart(_getCachedBoxGeo(0.5, 0.09, 0.56), s * 0.75, 1.05, 0.92, -0.06, 0, s * -0.06));
          p.push(_vPart(_getCachedBoxGeo(0.48, 0.08, 0.32), s * 0.75, 0.98, 1.22, -0.38, 0, 0));
          p.push(_vPart(_getCachedBoxGeo(0.44, 0.34, 0.14), s * 0.72, 0.84, 0.6, 0.44, 0, 0));
          // Handlebar wrap-around tactical handguards
          p.push(_vPart(_getCachedBoxGeo(0.2, 0.1, 0.09), s * 0.42, 1.55, -0.46, 0, s * -0.18, 0));
        }
      },
      true,
      true
    );

    // 3. Tubular Steel Chassis, Arched Dual A-Arms, Exo-Bumpers & Lock-and-Ride Cargo Racks (accentMat)
    _addVehMerged(
      group,
      'atv:v2:chassisAccent',
      accentMat,
      (p) => {
        // Stamped full-belly steel skidplate + boxed lower frame + front/rear differentials
        p.push(_vPart(_getCachedBoxGeo(0.78, 0.1, 2.08), 0, 0.43, 0));
        p.push(_vPart(_getCachedBoxGeo(0.74, 0.28, 1.88), 0, 0.6, 0));
        p.push(_vPart(_getCachedBoxGeo(0.24, 0.1, 0.44), 0, 0.56, -1.16, 0.48, 0, 0));
        p.push(_vPart(_getCachedBoxGeo(0.28, 0.24, 0.28), 0, 0.46, -0.96));
        p.push(_vPart(_getCachedBoxGeo(0.28, 0.24, 0.28), 0, 0.46, 0.96));

        // Dual arched high-clearance upper & lower A-arm wishbones + hub knuckles (all 4 corners)
        for (const [wx, wz] of [
          [-0.82, -0.96],
          [0.82, -0.96],
          [-0.82, 0.96],
          [0.82, 0.96]
        ]) {
          const s = Math.sign(wx);
          for (const ay of [0.39, 0.55]) {
            p.push(_vPart(_getCachedBoxGeo(0.46, 0.042, 0.065), wx * 0.58, ay, wz - 0.09, 0, s * 0.16, s * -0.1));
            p.push(_vPart(_getCachedBoxGeo(0.46, 0.042, 0.065), wx * 0.58, ay, wz + 0.09, 0, s * -0.16, s * -0.1));
          }
          p.push(_vPart(_getCachedBoxGeo(0.11, 0.22, 0.14), wx * 0.84, 0.46, wz));
        }

        // Serrated mud-draining footwells + raised heel-guard cages
        for (const s of [-1, 1]) {
          p.push(_vPart(_getCachedBoxGeo(0.44, 0.06, 0.78), s * 0.63, 0.46, 0.04));
          p.push(_vPart(_getCachedBoxGeo(0.42, 0.18, 0.05), s * 0.63, 0.56, 0.44, -0.22, 0, 0));
          p.push(_vPart(_getCachedBoxGeo(0.05, 0.07, 0.78), s * 0.84, 0.49, 0.04));
        }

        // Heavy Front Tubular Exo-Brushguard Bumper (-Z) & Rear Bumper + Hitch (+Z)
        p.push(_vPart(_getCachedBoxGeo(1.28, 0.14, 0.14), 0, 0.74, -1.24));
        p.push(_vPart(_getCachedBoxGeo(1.36, 0.055, 0.055), 0, 1.02, -1.25));
        p.push(_vPart(_getCachedBoxGeo(0.92, 0.05, 0.05), 0, 1.15, -1.2));
        for (const bx of [-0.62, -0.28, 0.28, 0.62]) {
          p.push(_vPart(_getCachedBoxGeo(0.055, 0.42, 0.07), bx, 0.88, -1.24, 0.14, 0, 0));
        }
        p.push(_vPart(_getCachedBoxGeo(1.26, 0.12, 0.12), 0, 0.74, 1.22));
        p.push(_vPart(_getCachedBoxGeo(0.12, 0.08, 0.18), 0, 0.52, 1.24));

        // Tubular Front & Rear Lock-and-Ride Cargo Racks with Raised Perimeter Rails
        p.push(_vPart(_getCachedBoxGeo(1.36, 0.05, 0.56), 0, 1.2, -0.84));
        p.push(_vPart(_getCachedBoxGeo(1.38, 0.09, 0.045), 0, 1.26, -1.11));
        for (const s of [-1, 1]) {
          p.push(_vPart(_getCachedBoxGeo(0.045, 0.09, 0.56), s * 0.67, 1.26, -0.84));
        }
        p.push(_vPart(_getCachedBoxGeo(1.4, 0.05, 0.62), 0, 1.2, 0.88));
        p.push(_vPart(_getCachedBoxGeo(1.42, 0.1, 0.045), 0, 1.26, 1.18));
        for (const s of [-1, 1]) {
          p.push(_vPart(_getCachedBoxGeo(0.045, 0.1, 0.62), s * 0.69, 1.26, 0.88));
          // Passenger grab handles flanking rear saddle
          p.push(_vPart(_getCachedBoxGeo(0.06, 0.12, 0.28), s * 0.34, 1.28, 0.48));
        }

        // Angled Steering Column Stem + Angled Hard Rifle Scabbard on Right Rear Flank
        p.push(_vPart(_getCachedCylGeo(0.042, 0.046, 0.54, 8), 0, 1.34, -0.44, 0.24, 0, 0));
        p.push(_vPart(_getCachedBoxGeo(0.1, 0.22, 0.96), 0.76, 1.16, 0.56, 0.36, 0.08, -0.14));
      },
      true,
      false
    );

    // 4. Stepped 2-Up Tactical Saddle, Overfender Flares, Radiator Grille, Pelican Case & Handlebars (darkMat)
    _addVehMerged(
      group,
      'atv:v2:trimDark',
      darkMat,
      (p) => {
        // Contoured rider saddle + stepped rear pillion pad + lumbar backrest + tank cap
        p.push(_vPart(_getCachedBoxGeo(0.46, 0.18, 0.64), 0, 1.19, 0.08));
        p.push(_vPart(_getCachedBoxGeo(0.5, 0.22, 0.42), 0, 1.25, 0.52));
        p.push(_vPart(_getCachedBoxGeo(0.46, 0.28, 0.14), 0, 1.42, 0.68, -0.18, 0, 0));
        p.push(_vPart(_getCachedCylGeo(0.055, 0.06, 0.04, 8), 0, 1.21, -0.26));

        // Honeycomb front radiator grille core + forward Pelican recon gear case on front rack
        p.push(_vPart(_getCachedBoxGeo(0.68, 0.26, 0.06), 0, 0.88, -1.14, 0.14, 0, 0));
        p.push(_vPart(_getCachedBoxGeo(0.62, 0.16, 0.34), 0, 1.3, -0.82));

        // Black textured overfender flares + Renthal handlebars + grips + mirrors + rifle buttstock in scabbard
        p.push(_vPart(_getCachedCylGeo(0.024, 0.024, 0.92, 8, Math.PI / 2), 0, 1.54, -0.38));
        p.push(_vPart(_getCachedBoxGeo(0.24, 0.11, 0.08), 0, 1.58, -0.45, -0.35, 0, 0));
        p.push(_vPart(_getCachedBoxGeo(0.06, 0.14, 0.34), 0.78, 1.34, 0.98, 0.36, 0.08, -0.14));
        for (const s of [-1, 1]) {
          p.push(_vPart(_getCachedBoxGeo(0.08, 0.06, 0.52), s * 0.96, 1.02, -0.94));
          p.push(_vPart(_getCachedBoxGeo(0.08, 0.06, 0.56), s * 0.98, 1.03, 0.92));
          p.push(_vPart(_getCachedCylGeo(0.032, 0.032, 0.15, 8, Math.PI / 2), s * 0.4, 1.54, -0.38));
          p.push(_vPart(_getCachedBoxGeo(0.14, 0.08, 0.05), s * 0.46, 1.68, -0.44, 0, s * -0.22, 0));
        }
      },
      true,
      false
    );

    // 5. 850cc Finned Twin Engine, CV Axles, Warn Winch & Dual Stainless Exhausts (chromeMat) + Fox Shocks (shockMat)
    _addVehMerged(
      group,
      'atv:v2:mechChrome',
      chromeMat,
      (p) => {
        // 850cc DOHC twin-cylinder jugs + CVT primary clutch housing
        p.push(_vPart(_getCachedBoxGeo(0.46, 0.32, 0.58), 0, 0.66, 0.02));
        p.push(_vPart(_getCachedCylGeo(0.13, 0.13, 0.24, 10), 0, 0.78, -0.1, 0.28, 0, 0));
        p.push(_vPart(_getCachedCylGeo(0.13, 0.13, 0.24, 10), 0, 0.78, 0.16, -0.24, 0, 0));
        p.push(_vPart(_getCachedCylGeo(0.16, 0.16, 0.58, 10, Math.PI / 2), 0, 0.58, 0.08));

        // 4 CV axle shafts + Warn front winch drum + roller fairlead + twin rear exhaust canisters
        for (const az of [-0.96, 0.96]) {
          p.push(_vPart(_getCachedCylGeo(0.028, 0.028, 1.48, 8, Math.PI / 2), 0, 0.45, az));
        }
        p.push(_vPart(_getCachedCylGeo(0.085, 0.085, 0.34, 10, Math.PI / 2), 0, 0.74, -1.26));
        for (const s of [-1, 1]) {
          p.push(_vPart(_getCachedCylGeo(0.036, 0.036, 0.68, 8), s * 0.28, 0.76, 0.55, Math.PI / 2 - 0.1, 0, 0));
          p.push(_vPart(_getCachedCylGeo(0.068, 0.062, 0.46, 10), s * 0.36, 0.84, 1.02, Math.PI / 2 - 0.08, 0, 0));
        }
      },
      false,
      false
    );

    _addVehMerged(
      group,
      'atv:v2:foxShocks',
      shockMat,
      (p) => {
        for (const [wx, wz] of [
          [-0.82, -0.96],
          [0.82, -0.96],
          [-0.82, 0.96],
          [0.82, 0.96]
        ]) {
          const s = Math.sign(wx);
          p.push(_vPart(_getCachedCylGeo(0.052, 0.052, 0.52, 10), wx * 0.7, 0.7, wz * 0.94, 0, 0, s * 0.28));
          // Piggyback nitrogen reservoir cylinder
          p.push(_vPart(_getCachedCylGeo(0.028, 0.028, 0.18, 8), wx * 0.74, 0.82, wz * 0.88, 0, 0, s * 0.28));
        }
      },
      false,
      false
    );

    // 6. Rear Rack NATO Ammo Crate, Strapped Red Jerry Can + Winch Hook, Projector Headlights & LED Bars
    _addVehMerged(
      group,
      'atv:v2:ammoCargo',
      ammoBoxMat,
      (p) => {
        p.push(_vPart(_getCachedBoxGeo(0.58, 0.24, 0.4), -0.28, 1.34, 0.9));
        p.push(_vPart(_getCachedBoxGeo(0.38, 0.16, 0.26), -0.28, 1.52, 0.9));
      },
      true,
      false
    );
    _addVehMerged(
      group,
      'atv:v2:redCargo',
      jerryCanMat,
      (p) => {
        p.push(_vPart(_getCachedBoxGeo(0.3, 0.36, 0.24), 0.36, 1.4, 0.9));
        p.push(_vPart(_getCachedBoxGeo(0.08, 0.09, 0.08), 0, 0.72, -1.32));
      },
      false,
      false
    );
    _addVehMerged(
      group,
      'atv:v2:headlights',
      headBeamMat,
      (p) => {
        for (const s of [-1, 1]) {
          // Aggressive V-slash projector headlights + DRL brow
          p.push(_vPart(_getCachedBoxGeo(0.24, 0.09, 0.06), s * 0.34, 1.01, -1.16, 0, s * -0.18, s * -0.16));
        }
        p.push(_vPart(_getCachedBoxGeo(0.58, 0.07, 0.06), 0, 1.09, -1.21));
      },
      false,
      false
    );
    _addVehMerged(
      group,
      'atv:v2:cyanDash',
      ledMat,
      (p) => {
        p.push(_vPart(_getCachedBoxGeo(0.2, 0.09, 0.04), 0, 1.59, -0.42, -0.35, 0, 0));
      },
      false,
      false
    );
    _addVehMerged(
      group,
      'atv:v2:taillights',
      tailLedMat,
      (p) => {
        p.push(_vPart(_getCachedBoxGeo(0.48, 0.08, 0.05), 0, 1.04, 1.18));
        for (const s of [-1, 1]) {
          p.push(_vPart(_getCachedBoxGeo(0.14, 0.06, 0.05), s * 0.52, 1.02, 1.16));
        }
      },
      false,
      false
    );

    // 7. Articulated 3rd-Person Rider Model Straddling the Quad ATV
    const riderGroup = createDetailedVehicleRider({
      posture: 'atv',
      isUS,
      scale: 1.0,
      accentHex: primaryColor,
      seatY: 1.24,
      seatZ: 0.18,
      barY: 1.54,
      barZ: -0.38,
      barHalfW: 0.42,
      pegX: 0.56,
      pegY: 0.52,
      pegZ: 0.04
    });
    group.add(riderGroup);
    group.userData.riderGroup = riderGroup;

    turretPivot.position.set(0, 1.48, -0.45);
    barrelGroup = new THREE.Group();
    for (const side of [-1, 1]) {
      const pdw = new THREE.Mesh(_getCachedBoxGeo(0.07, 0.09, 0.62), barrelMat);
      pdw.position.set(side * 0.28, 0.04, 0.35);
      barrelGroup.add(pdw);
    }
    turretPivot.add(barrelGroup);

    // Anchor ATV wheelie rotation strictly at the Rear Wheel Axle (y = 0.44, z = +0.96)
    _wrapVehicleChildrenInRearWheelPivot(group, 0.44, 0.96);
  } else if (cfg.type === 'bike') {
    // =========================================================================
    // ADVANCED REALISTIC 3D MOTORCYCLE, MILITARY RECON ENDURO, DAKAR SCOUT,
    // 2-STROKE, E-MOTO, SUPERSPORT & KUKIRIN HYPER SCOOTER LINEUP
    // - Nose / Front Wheel points along -Z, Rear Wheel / Exhaust points along +Z
    // - Cross-laced wire spokes / Y-spokes, drilled wave rotors, radial Brembo calipers,
    //   USD forks + fork guards, twin-spar frame + trellis subframe, progressive linkage,
    //   finned engines / HV batteries, mandrel headers, military panniers & 3D Rider!
    // =========================================================================
    const sub = cfg.bikeSubType || 'sport_600cc';
    const nameUpper = String(cfg.name || '').toUpperCase();
    const isScooter = Boolean(cfg.isScooter || sub === 'scooter_kukirin');
    const isMilitaryAdv = Boolean(cfg.isMilitaryAdv || nameUpper.includes('KLR650'));
    const isMilitaryRecon = Boolean(
      cfg.isMilitaryRecon ||
        isMilitaryAdv ||
        nameUpper.includes('M1030') ||
        nameUpper.includes('RECON') ||
        nameUpper.includes('CHRISTINI')
    );
    const isAwdMoto = Boolean(cfg.isAwdMoto || nameUpper.includes('AWD'));
    const isTwoStroke = Boolean(
      cfg.isTwoStroke || (!isMilitaryRecon && sub.startsWith('twostroke_'))
    );
    const isElectric = Boolean(cfg.isElectric || sub.startsWith('emoto_') || isScooter);
    const isSport =
      !isMilitaryAdv &&
      (sub === 'sport_600cc' || sub === 'sport_750cc' || sub === 'superbike_1000cc');

    const scale =
      sub === 'gas_50cc'
        ? 0.78
        : sub === 'emoto_tuttio'
        ? 0.86
        : sub === 'superbike_1000cc' || sub === 'emoto_stark_varg' || sub === 'twostroke_500cc'
        ? 1.08
        : 1.0;

    const defaultBikeHex = isScooter
      ? 0xff9f1a
      : isMilitaryRecon
      ? isUS
        ? 0x4b5320
        : 0x3b4938
      : 0xe74c3c;
    const primaryColor = cfg.colorHex ?? defaultBikeHex;
    const accentColor = cfg.accentHex ?? 0x1e272e;

    const primaryMat = new THREE.MeshStandardMaterial({
      color: primaryColor,
      roughness: isSport ? 0.22 : isMilitaryRecon ? 0.62 : 0.36,
      metalness: isSport ? 0.62 : isMilitaryRecon ? 0.24 : 0.38,
      flatShading: true
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: accentColor,
      roughness: 0.42,
      metalness: 0.5,
      flatShading: true
    });
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xe5e7eb,
      roughness: 0.16,
      metalness: 0.9
    });
    const rawPipeMat = new THREE.MeshStandardMaterial({
      color: 0xd4c5a9,
      roughness: 0.24,
      metalness: 0.86
    });
    const goldForkMat = new THREE.MeshStandardMaterial({
      color: isMilitaryRecon ? 0x2f3640 : 0xf1c40f,
      roughness: isMilitaryRecon ? 0.38 : 0.22,
      metalness: 0.85
    });
    const redCaliperMat = new THREE.MeshStandardMaterial({
      color: isMilitaryRecon ? 0x576574 : 0xe84118,
      roughness: 0.3,
      metalness: 0.65
    });
    const whitePlateMat = new THREE.MeshStandardMaterial({
      color: 0xf5f6fa,
      roughness: 0.35,
      metalness: 0.1
    });
    const pannierMat = new THREE.MeshStandardMaterial({
      color: isUS ? 0x3d4828 : 0x2c352d,
      roughness: 0.72,
      metalness: 0.22,
      flatShading: true
    });
    const ledHeadMat = new THREE.MeshBasicMaterial({
      color: isElectric && !isMilitaryRecon ? 0x00d2d3 : 0xf5f6fa
    });
    const tailLedMat = new THREE.MeshBasicMaterial({ color: 0xd63031 });

    if (isScooter) {
      // -----------------------------------------------------------------------
      // KUKIRIN G4 MAX DUAL-MOTOR HYPER ELECTRIC SCOOTER + STANDING 3D RIDER
      // -----------------------------------------------------------------------
      const scootTireGeo = _getMergedTreadTireGeo(0.29, 0.19, 16, 10, 0.2, 0.032, 0.055, 0.285);
      for (const wz of [-0.78, 0.78]) {
        const wheelPivot = new THREE.Group();
        wheelPivot.position.set(0, 0.29, wz);

        const tire = new THREE.Mesh(scootTireGeo, darkMat);
        tire.castShadow = true;
        wheelPivot.add(tire);

        wheelPivot.add(new THREE.Mesh(_getCachedCylGeo(0.18, 0.18, 0.21, 14, Math.PI / 2), accentMat));
        wheelPivot.add(new THREE.Mesh(_getCachedCylGeo(0.205, 0.205, 0.196, 14, Math.PI / 2), primaryMat));
        const brakeDisc = new THREE.Mesh(_getCachedCylGeo(0.165, 0.165, 0.016, 14, Math.PI / 2), chromeMat);
        brakeDisc.position.x = 0.11;
        wheelPivot.add(brakeDisc);

        group.add(wheelPivot);
        wheels.push(wheelPivot);
      }

      // Forged Anodized C-Arm Suspension, Kick-Plate, Neck Gusset & Grips (primaryMat)
      _addVehMerged(
        group,
        'scooter:v2:primary',
        primaryMat,
        (p) => {
          for (const wz of [-0.78, 0.78]) {
            for (const sx of [-0.13, 0.13]) {
              p.push(_vPart(_getCachedBoxGeo(0.042, 0.11, 0.48), sx, 0.31, wz * 0.68, wz < 0 ? 0.18 : -0.18, 0, 0));
            }
          }
          // Front angled aluminum bashplate + rear angled kicktail + forged folding neck latch
          p.push(_vPart(_getCachedBoxGeo(0.38, 0.08, 0.32), 0, 0.4, -0.58, -0.52, 0, 0));
          p.push(_vPart(_getCachedBoxGeo(0.38, 0.14, 0.38), 0, 0.46, 0.56, 0.44, 0, 0));
          p.push(_vPart(_getCachedBoxGeo(0.22, 0.44, 0.26), 0, 0.56, -0.56, -0.36, 0, 0));
          for (const sx of [-0.34, 0.34]) {
            p.push(_vPart(_getCachedCylGeo(0.033, 0.033, 0.14, 8, Math.PI / 2), sx, 1.56, -0.56));
          }
        },
        true,
        false
      );

      // Extruded CNC Hollow Battery Deck, Dual-Crown Downhill Stem & Triple Clamps (accentMat)
      _addVehMerged(
        group,
        'scooter:v2:accent',
        accentMat,
        (p) => {
          p.push(_vPart(_getCachedBoxGeo(0.45, 0.15, 1.18), 0, 0.34, 0));
          for (const sx of [-0.068, 0.068]) {
            p.push(_vPart(_getCachedCylGeo(0.03, 0.03, 1.24, 10), sx, 1.0, -0.66, 0.16, 0, 0));
          }
          // Dual-crown stem clamps + riser block
          p.push(_vPart(_getCachedBoxGeo(0.22, 0.045, 0.12), 0, 0.82, -0.69, 0.16, 0, 0));
          p.push(_vPart(_getCachedBoxGeo(0.22, 0.045, 0.12), 0, 1.38, -0.6, 0.16, 0, 0));
          p.push(_vPart(_getCachedBoxGeo(0.12, 0.08, 0.1), 0, 1.52, -0.57));
        },
        true,
        true
      );

      // Grip-Tape Deck, Tire-Hugging Carbon Fenders, Handlebars & Hydraulic Levers (darkMat)
      _addVehMerged(
        group,
        'scooter:v2:dark',
        darkMat,
        (p) => {
          p.push(_vPart(_getCachedBoxGeo(0.39, 0.02, 1.08), 0, 0.42, 0));
          p.push(_vPart(_getCachedBoxGeo(0.24, 0.035, 0.36), 0, 0.56, -0.82, 0.32, 0, 0));
          p.push(_vPart(_getCachedBoxGeo(0.24, 0.035, 0.38), 0, 0.56, 0.84, -0.32, 0, 0));
          p.push(_vPart(_getCachedCylGeo(0.024, 0.024, 0.76, 8, Math.PI / 2), 0, 1.56, -0.56));
          p.push(_vPart(_getCachedBoxGeo(0.26, 0.15, 0.11), 0, 0.78, -0.74));
          for (const sx of [-0.24, 0.24]) {
            p.push(_vPart(_getCachedBoxGeo(0.11, 0.022, 0.035), sx, 1.56, -0.61, 0, sx > 0 ? 0.2 : -0.2, 0));
          }
        },
        false,
        false
      );

      // Piggyback Red Coil Shocks & Hydraulic Brake Calipers
      _addVehMerged(
        group,
        'scooter:v2:caliperShock',
        redCaliperMat,
        (p) => {
          for (const wz of [-0.78, 0.78]) {
            p.push(_vPart(_getCachedCylGeo(0.044, 0.044, 0.28, 8), 0, 0.4, wz * 0.56, wz < 0 ? -0.45 : 0.45, 0, 0));
            p.push(_vPart(_getCachedBoxGeo(0.045, 0.075, 0.09), 0.12, 0.36, wz + (wz < 0 ? 0.08 : -0.08)));
          }
        },
        false,
        false
      );

      for (const sx of [-0.228, 0.228]) {
        const neonStrip = new THREE.Mesh(
          _getCachedBoxGeo(0.024, 0.048, 1.06),
          new THREE.MeshBasicMaterial({ color: 0xff9f1a })
        );
        neonStrip.position.set(sx, 0.34, 0);
        group.add(neonStrip);
      }

      const displayScreen = new THREE.Mesh(_getCachedBoxGeo(0.18, 0.04, 0.13), ledHeadMat);
      displayScreen.position.set(0, 1.61, -0.56);
      displayScreen.rotation.x = -0.25;
      group.add(displayScreen);

      const dualHeadlight = new THREE.Mesh(_getCachedBoxGeo(0.23, 0.12, 0.05), ledHeadMat);
      dualHeadlight.position.set(0, 0.78, -0.8);
      group.add(dualHeadlight);

      const scootTailLight = new THREE.Mesh(_getCachedBoxGeo(0.18, 0.06, 0.04), tailLedMat);
      scootTailLight.position.set(0, 0.52, 0.99);
      group.add(scootTailLight);

      const riderGroup = createDetailedVehicleRider({
        posture: 'scooter',
        isUS,
        scale: 1.0,
        accentHex: primaryColor,
        seatY: 1.12,
        seatZ: 0.08,
        barY: 1.56,
        barZ: -0.56,
        barHalfW: 0.33,
        pegX: 0.14,
        pegY: 0.43,
        pegZ: 0.06
      });
      group.add(riderGroup);
      group.userData.riderGroup = riderGroup;
    } else {
      // -----------------------------------------------------------------------
      // HIGH-FIDELITY MOTORCYCLE / MILITARY RECON / DAKAR SCOUT / 2T / E-MOTO / SUPERSPORT
      // -----------------------------------------------------------------------
      const wheelRadius = 0.39 * scale;
      const frontWheelWidth = (isSport ? 0.18 : 0.13) * scale;
      const rearWheelWidth = (isSport ? 0.25 : 0.16) * scale;
      const wheelbaseHalf = 0.88 * scale;
      const spokeCount = isSport ? 5 : 8; // 5-split cast alloy on Supersports vs 8-cross wire spokes on MX/Military!

      const rimMat =
        sub === 'emoto_tuttio' || sub === 'emoto_surron'
          ? goldForkMat
          : sub === 'emoto_yozma' || sub === 'superbike_1000cc'
          ? primaryMat
          : accentMat;

      // 1. Front (-Z) & Rear (+Z) Multi-Spoke Wheels, Drilled Wave Rotors & Rear Sprocket
      for (const isRear of [false, true]) {
        const wz = isRear ? wheelbaseHalf : -wheelbaseHalf;
        const wWidth = isRear ? rearWheelWidth : frontWheelWidth;
        const wheelPivot = new THREE.Group();
        wheelPivot.position.set(0, wheelRadius, wz);

        if (isSport) {
          const tire = new THREE.Mesh(
            _getCachedCylGeo(wheelRadius, wheelRadius, wWidth, 20, Math.PI / 2),
            darkMat
          );
          tire.castShadow = true;
          wheelPivot.add(tire);

          wheelPivot.add(
            new THREE.Mesh(
              _getMergedLugRingGeo(6, wWidth * 1.02, 0.028 * scale, 0.036 * scale, wheelRadius - 0.005),
              accentMat
            )
          );
        } else {
          const tire = new THREE.Mesh(
            _getMergedTreadTireGeo(
              wheelRadius,
              wWidth,
              18,
              14,
              wWidth * 1.02,
              0.032 * scale,
              0.062 * scale,
              wheelRadius - 0.004
            ),
            darkMat
          );
          tire.castShadow = true;
          wheelPivot.add(tire);
        }

        // Alloy Rim Hoop + Billet Axle Hub + Multi-Spokes + Drilled Wave Brake Rotors
        wheelPivot.add(
          new THREE.Mesh(
            _getCachedCylGeo(wheelRadius * 0.69, wheelRadius * 0.69, wWidth * 1.03, 16, Math.PI / 2),
            rimMat
          )
        );
        wheelPivot.add(
          new THREE.Mesh(
            _getCachedCylGeo(wheelRadius * 0.18, wheelRadius * 0.18, wWidth * 1.12, 10, Math.PI / 2),
            accentMat
          )
        );
        wheelPivot.add(
          new THREE.Mesh(
            _getMergedSpokesGeo(spokeCount, wWidth * 0.92, (isSport ? 0.032 : 0.016) * scale, wheelRadius * 1.34),
            chromeMat
          )
        );

        const rotorSides = isSport && !isRear ? [-1, 1] : [-1];
        for (const rSide of rotorSides) {
          const rotor = new THREE.Mesh(
            _getCachedCylGeo(wheelRadius * 0.49, wheelRadius * 0.49, 0.014 * scale, 14, Math.PI / 2),
            chromeMat
          );
          rotor.position.x = rSide * (wWidth * 0.56);
          wheelPivot.add(rotor);
        }

        if (isRear) {
          const sprocket = new THREE.Mesh(
            _getCachedCylGeo(wheelRadius * 0.43, wheelRadius * 0.43, 0.018 * scale, 14, Math.PI / 2),
            goldForkMat
          );
          sprocket.position.x = -wWidth * 0.61;
          wheelPivot.add(sprocket);
        }

        group.add(wheelPivot);
        wheels.push(wheelPivot);
      }

      const barY = (isSport ? 1.08 : isMilitaryAdv ? 1.29 : 1.25) * scale;
      const barZ = (isSport ? -0.52 : -0.48) * scale;
      const barHalfW = (isSport ? 0.34 : 0.39) * scale;
      const variantTag = `${sub}_${isSport ? 'sp' : isMilitaryAdv ? 'adv' : isMilitaryRecon ? 'mil' : 'mx'}_${isElectric ? 'ev' : isTwoStroke ? '2t' : '4t'}_${isAwdMoto ? 'awd' : '2wd'}_${scale.toFixed(2)}`;

      // 2. Inverted USD Forks, Gullwing Swingarm, Perimeter Frame, Engine/Headers & Levers (chromeMat / goldForkMat)
      const upperForkMat =
        sub === 'emoto_stark_varg' || sub === 'twostroke_250cc'
          ? isMilitaryRecon
            ? accentMat
            : whitePlateMat
          : isSport || isElectric || isTwoStroke
          ? goldForkMat
          : chromeMat;

      for (const sx of [-0.125 * scale, 0.125 * scale]) {
        const upperFork = new THREE.Mesh(
          _getCachedCylGeo(0.036 * scale, 0.034 * scale, 0.56 * scale, 10),
          upperForkMat
        );
        upperFork.position.set(sx, 0.89 * scale, -0.61 * scale);
        upperFork.rotation.x = 0.36;
        group.add(upperFork);
      }

      _addVehMerged(
        group,
        `bike:v2:chrome:${variantTag}`,
        chromeMat,
        (p) => {
          for (const sx of [-0.125 * scale, 0.125 * scale]) {
            // Lower fork stanchion sliders + axle pinch lugs
            p.push(_vPart(_getCachedCylGeo(0.027 * scale, 0.025 * scale, 0.48 * scale, 10), sx, 0.52 * scale, -0.76 * scale, 0.36, 0, 0));
            // Gullwing braced rear swingarm + upper triangulated brace + rear axle block
            p.push(_vPart(_getCachedBoxGeo(0.044 * scale, 0.088 * scale, 0.76 * scale), sx, 0.42 * scale, 0.53 * scale, -0.09, 0, 0));
            p.push(_vPart(_getCachedBoxGeo(0.036 * scale, 0.055 * scale, 0.48 * scale), sx, 0.5 * scale, 0.44 * scale, -0.26, 0, 0));
            // Serrated rider footpegs + passenger pillion pegs + brake/clutch levers
            p.push(
              _vPart(
                _getCachedBoxGeo(0.13 * scale, 0.028 * scale, 0.055 * scale),
                sx > 0 ? 0.21 * scale : -0.21 * scale,
                (isSport ? 0.52 : 0.44) * scale,
                (isSport ? 0.22 : 0.08) * scale
              )
            );
            p.push(
              _vPart(
                _getCachedBoxGeo(0.12 * scale, 0.02 * scale, 0.03 * scale),
                Math.sign(sx) * (barHalfW - 0.06 * scale),
                barY,
                barZ - 0.06 * scale,
                0,
                Math.sign(sx) * 0.22,
                0
              )
            );
            // CHRISTINI II AWD 450 telescopic front-wheel-drive shafts!
            if (isAwdMoto) {
              p.push(_vPart(_getCachedCylGeo(0.014 * scale, 0.014 * scale, 0.72 * scale, 8), sx * 0.78, 0.72 * scale, -0.66 * scale, 0.36, 0, 0));
            }
          }
          // Steering stem nut + progressive rear shock linkage
          p.push(_vPart(_getCachedCylGeo(0.024 * scale, 0.024 * scale, 0.04 * scale, 8), 0, 1.1 * scale, -0.5 * scale, 0.36, 0, 0));
          p.push(_vPart(_getCachedBoxGeo(0.14 * scale, 0.06 * scale, 0.18 * scale), 0, 0.38 * scale, 0.26 * scale, -0.2, 0, 0));

          if (!isElectric) {
            // Finned cylinder barrel, DOHC valve head, clutch cover & twin side aluminum radiators
            p.push(_vPart(_getCachedCylGeo(0.135 * scale, 0.135 * scale, 0.39 * scale, 12, Math.PI / 2), 0, 0.47 * scale, 0.06 * scale));
            p.push(_vPart(_getCachedBoxGeo(0.27 * scale, 0.26 * scale, 0.24 * scale), 0, 0.71 * scale, -0.14 * scale, 0.22, 0, 0));
            p.push(_vPart(_getCachedBoxGeo(0.29 * scale, 0.075 * scale, 0.26 * scale), 0, 0.85 * scale, -0.18 * scale, 0.22, 0, 0));
            if (sub !== 'gas_50cc') {
              for (const s of [-1, 1]) {
                p.push(_vPart(_getCachedBoxGeo(0.13 * scale, 0.28 * scale, 0.11 * scale), s * 0.14 * scale, 0.85 * scale, -0.34 * scale, 0.24, s * -0.12, 0));
              }
            }
            if (!isTwoStroke) {
              // 4-Stroke mandrel-bent header pipe -> mid-pipe collector -> hydroformed titanium muffler
              p.push(_vPart(_getCachedCylGeo(0.032 * scale, 0.032 * scale, 0.34 * scale, 8), 0.11 * scale, 0.62 * scale, -0.32 * scale, 0.45, 0, -0.28));
              p.push(_vPart(_getCachedCylGeo(0.038 * scale, 0.036 * scale, 0.56 * scale, 8), 0.16 * scale, 0.42 * scale, 0.08 * scale, Math.PI / 2 - 0.16, 0, 0));
              p.push(
                _vPart(
                  _getCachedCylGeo(0.068 * scale, 0.056 * scale, 0.58 * scale, 10),
                  0.19 * scale,
                  (isMilitaryAdv ? 0.78 : 0.66) * scale,
                  0.56 * scale,
                  Math.PI / 2 - (isMilitaryAdv ? 0.16 : 0.28),
                  0,
                  0
                )
              );
            } else {
              // 2-Stroke rear aluminum stinger silencer
              p.push(_vPart(_getCachedCylGeo(0.05 * scale, 0.05 * scale, 0.52 * scale, 10), 0.18 * scale, 0.89 * scale, 0.58 * scale, Math.PI / 2 - 0.24, 0, 0));
            }
          } else {
            // Coaxial E-Moto billet motor cover & jackshaft
            p.push(_vPart(_getCachedCylGeo(0.135 * scale, 0.135 * scale, 0.35 * scale, 12, Math.PI / 2), 0, 0.48 * scale, 0.12 * scale));
          }
        },
        true,
        false
      );

      // 2-Stroke Raw Welded Hydroformed Expansion Chamber ("Fat Pipe")
      if (isTwoStroke && !isElectric) {
        _addVehMerged(
          group,
          `bike:v2:raw2t:${scale.toFixed(2)}`,
          rawPipeMat,
          (p) => {
            p.push(_vPart(_getCachedCylGeo(0.062 * scale, 0.04 * scale, 0.28 * scale, 10), 0.14 * scale, 0.62 * scale, -0.34 * scale, 0, 0, -0.45));
            p.push(_vPart(_getCachedCylGeo(0.115 * scale, 0.085 * scale, 0.54 * scale, 12), 0.2 * scale, 0.56 * scale, -0.14 * scale, Math.PI / 2 - 0.12, 0, 0));
            p.push(_vPart(_getCachedCylGeo(0.038 * scale, 0.105 * scale, 0.32 * scale, 10), 0.19 * scale, 0.66 * scale, 0.22 * scale, Math.PI / 2 - 0.35, 0, 0));
          },
          true,
          false
        );
      }

      // 3. Twin-Spar Perimeter Frame, Subframe Trellis, Triple Clamps, Crankcase & Crash Bars (accentMat)
      _addVehMerged(
        group,
        `bike:v2:accent:${variantTag}`,
        accentMat,
        (p) => {
          // CNC upper & lower triple clamps + steering head tube
          p.push(_vPart(_getCachedBoxGeo(0.31 * scale, 0.038 * scale, 0.12 * scale), 0, 1.06 * scale, -0.52 * scale, 0.36, 0, 0));
          p.push(_vPart(_getCachedBoxGeo(0.31 * scale, 0.042 * scale, 0.13 * scale), 0, 0.84 * scale, -0.6 * scale, 0.36, 0, 0));
          p.push(_vPart(_getCachedCylGeo(0.038 * scale, 0.04 * scale, 0.26 * scale, 8), 0, 0.95 * scale, -0.56 * scale, 0.36, 0, 0));

          for (const s of [-1, 1]) {
            // Twin-spar perimeter frame beams + diagonal rear trellis subframe + lower cradle bashplate
            p.push(_vPart(_getCachedBoxGeo(0.042 * scale, 0.105 * scale, 0.78 * scale), s * 0.155 * scale, 0.82 * scale, -0.18 * scale, 0.28, 0, 0));
            p.push(_vPart(_getCachedBoxGeo(0.032 * scale, 0.045 * scale, 0.64 * scale), s * 0.125 * scale, 0.84 * scale, 0.44 * scale, 0.32, 0, 0));
            p.push(_vPart(_getCachedCylGeo(0.02 * scale, 0.02 * scale, 0.56 * scale, 8), s * 0.12 * scale, 0.56 * scale, -0.32 * scale, -0.62, 0, 0));
            // Lower wrap-around fork stanchion guards
            p.push(_vPart(_getCachedBoxGeo(0.048 * scale, 0.38 * scale, 0.068 * scale), s * 0.135 * scale, 0.52 * scale, -0.8 * scale, 0.36, 0, 0));

            if (isMilitaryRecon) {
              // Heavy tubular steel military engine crash-bars + rear pannier rack frame
              p.push(_vPart(_getCachedBoxGeo(0.48 * scale, 0.28 * scale, 0.045 * scale), 0, 0.64 * scale, -0.38 * scale, 0.2, 0, 0));
              p.push(_vPart(_getCachedBoxGeo(0.04 * scale, 0.24 * scale, 0.46 * scale), s * 0.18 * scale, 0.9 * scale, 0.56 * scale));
            }
          }
          p.push(_vPart(_getCachedBoxGeo(0.28 * scale, 0.045 * scale, 0.52 * scale), 0, 0.33 * scale, -0.04 * scale));

          if (!isElectric) {
            // Cast engine crankcase + throttle body / airbox boot
            p.push(_vPart(_getCachedBoxGeo(0.32 * scale, 0.28 * scale, 0.44 * scale), 0, 0.48 * scale, -0.02 * scale));
            p.push(_vPart(_getCachedBoxGeo(0.14 * scale, 0.14 * scale, 0.22 * scale), 0, 0.74 * scale, 0.08 * scale));
          } else {
            // Finned CNC billet E-Moto motor controller heatsink
            p.push(_vPart(_getCachedBoxGeo(0.28 * scale, 0.2 * scale, 0.14 * scale), 0, 0.82 * scale, -0.32 * scale, 0.26, 0, 0));
          }

          if (isSport) {
            // Supersport lower aerodynamic race belly pan + MotoGP downforce winglets
            p.push(_vPart(_getCachedBoxGeo(0.42 * scale, 0.24 * scale, 0.88 * scale), 0, 0.43 * scale, -0.06 * scale));
            if (sub === 'superbike_1000cc' || sub === 'sport_750cc') {
              for (const sx of [-0.28 * scale, 0.28 * scale]) {
                p.push(_vPart(_getCachedBoxGeo(0.2 * scale, 0.032 * scale, 0.26 * scale), sx, 0.88 * scale, -0.68 * scale, 0, 0, sx > 0 ? -0.24 : 0.24));
                p.push(_vPart(_getCachedBoxGeo(0.18 * scale, 0.028 * scale, 0.22 * scale), sx * 0.95, 0.8 * scale, -0.64 * scale, 0, 0, sx > 0 ? -0.24 : 0.24));
              }
            }
          }
          if (isMilitaryRecon) {
            // Rear tactical VHF whip antenna on military recon bikes
            p.push(_vPart(_getCachedCylGeo(0.01 * scale, 0.016 * scale, 0.78 * scale, 6), -0.16 * scale, 1.38 * scale, 0.86 * scale, -0.18, 0, 0));
          }
        },
        true,
        false
      );

      // 4. Sculpted Fuel Tank, Fairings / Radiator Shrouds, Tail Cowl & Handguards (primaryMat)
      _addVehMerged(
        group,
        `bike:v2:primary:${variantTag}`,
        primaryMat,
        (p) => {
          // Multi-faceted sculpted fuel tank with knee cutouts + upper spine
          p.push(_vPart(_getCachedBoxGeo((isSport ? 0.46 : isMilitaryAdv ? 0.42 : 0.34) * scale, 0.24 * scale, 0.42 * scale), 0, 1.02 * scale, -0.22 * scale, -0.12, 0, 0));
          p.push(_vPart(_getCachedBoxGeo((isSport ? 0.34 : 0.26) * scale, 0.22 * scale, 0.32 * scale), 0, 0.97 * scale, 0.04 * scale, -0.18, 0, 0));
          // Grips
          for (const s of [-1, 1]) {
            p.push(_vPart(_getCachedCylGeo(0.029 * scale, 0.029 * scale, 0.14 * scale, 8, Math.PI / 2), s * barHalfW, barY, barZ));
          }

          if (isSport) {
            // Multi-layered Supersport shark-nose fairing + sculpted side fairings + stepped aero tail
            p.push(_vPart(_getCachedBoxGeo(0.46 * scale, 0.34 * scale, 0.56 * scale), 0, 0.94 * scale, -0.66 * scale, 0.32, 0, 0));
            p.push(_vPart(_getCachedBoxGeo(0.38 * scale, 0.16 * scale, 0.34 * scale), 0, 0.84 * scale, -0.82 * scale, 0.42, 0, 0));
            p.push(_vPart(_getCachedBoxGeo(0.21 * scale, 0.048 * scale, 0.42 * scale), 0, 0.76 * scale, -0.88 * scale, 0.28, 0, 0));
            for (const s of [-1, 1]) {
              // Layered shark-gill side fairings
              p.push(_vPart(_getCachedBoxGeo(0.055 * scale, 0.38 * scale, 0.62 * scale), s * 0.21 * scale, 0.74 * scale, -0.38 * scale, 0.24, s * -0.08, 0));
              p.push(_vPart(_getCachedBoxGeo(0.045 * scale, 0.14 * scale, 0.48 * scale), s * 0.17 * scale, 1.03 * scale, 0.68 * scale, 0.24, s * 0.08, 0));
            }
            p.push(_vPart(_getCachedBoxGeo(0.28 * scale, 0.14 * scale, 0.62 * scale), 0, 1.04 * scale, 0.72 * scale, 0.24, 0, 0));
          } else if (isMilitaryAdv) {
            // KLR650 Dakar / Military Adventure Scout upright rally tower + beak + side cowls
            p.push(_vPart(_getCachedBoxGeo(0.38 * scale, 0.44 * scale, 0.38 * scale), 0, 1.08 * scale, -0.64 * scale, 0.14, 0, 0));
            p.push(_vPart(_getCachedBoxGeo(0.22 * scale, 0.06 * scale, 0.48 * scale), 0, 0.88 * scale, -0.82 * scale, 0.2, 0, 0));
            for (const s of [-1, 1]) {
              p.push(_vPart(_getCachedBoxGeo(0.055 * scale, 0.32 * scale, 0.56 * scale), s * 0.21 * scale, 0.94 * scale, -0.36 * scale, 0.18, s * -0.1, 0));
              p.push(_vPart(_getCachedBoxGeo(0.16 * scale, 0.09 * scale, 0.07 * scale), s * (barHalfW - 0.04 * scale), barY, barZ - 0.07 * scale));
            }
            p.push(_vPart(_getCachedBoxGeo(0.24 * scale, 0.12 * scale, 0.62 * scale), 0, 1.02 * scale, 0.68 * scale, 0.18, 0, 0));
          } else {
            // Motocross / Military Recon Enduro high front fender + swept radiator wings + sharp rear fender
            p.push(_vPart(_getCachedBoxGeo(0.18 * scale, 0.05 * scale, 0.54 * scale), 0, 0.87 * scale, -0.82 * scale, 0.2, 0, 0));
            p.push(_vPart(_getCachedBoxGeo(0.21 * scale, 0.11 * scale, 0.64 * scale), 0, 1.03 * scale, 0.7 * scale, 0.24, 0, 0));
            for (const s of [-1, 1]) {
              p.push(_vPart(_getCachedBoxGeo(0.045 * scale, 0.28 * scale, 0.52 * scale), s * 0.19 * scale, 0.9 * scale, -0.28 * scale, 0.25, s * -0.12, 0));
              if (isMilitaryRecon) {
                p.push(_vPart(_getCachedBoxGeo(0.15 * scale, 0.085 * scale, 0.065 * scale), s * (barHalfW - 0.04 * scale), barY, barZ - 0.07 * scale));
              }
            }
          }
        },
        true,
        true
      );

      // 5. Saddle, Handlebars, Tire Hugger, Number Plates, E-Moto Battery & Military Panniers
      const saddleMat =
        sub === 'emoto_tuttio'
          ? new THREE.MeshStandardMaterial({ color: 0x8c5828, roughness: 0.65 })
          : sub === 'twostroke_125cc' && !isMilitaryRecon
          ? primaryMat
          : darkMat;
      _addVehMerged(
        group,
        `bike:v2:saddleBars:${variantTag}`,
        saddleMat,
        (p) => {
          // Contoured ribbed motorcycle saddle + rear tire mud-hugger + handlebars + master cylinder
          p.push(_vPart(_getCachedBoxGeo(0.26 * scale, 0.12 * scale, 0.68 * scale), 0, 0.97 * scale, 0.32 * scale, 0.08, 0, 0));
          p.push(_vPart(_getCachedCylGeo(0.02 * scale, 0.02 * scale, barHalfW * 2, 8, Math.PI / 2), 0, barY, barZ));
          p.push(_vPart(_getCachedBoxGeo(0.18 * scale, 0.035 * scale, 0.34 * scale), 0, 0.64 * scale, 0.58 * scale, 0.48, 0, 0));
          if (isSport) {
            p.push(_vPart(_getCachedBoxGeo(0.14 * scale, 0.09 * scale, 0.12 * scale), 0, 0.92 * scale, -0.92 * scale));
            for (const s of [-1, 1]) {
              p.push(_vPart(_getCachedBoxGeo(0.15 * scale, 0.065 * scale, 0.05 * scale), s * 0.29 * scale, 1.16 * scale, -0.68 * scale, 0, s * -0.25, 0));
            }
          }
        },
        true,
        false
      );

      // Mono-Shock + Upper & Lower Drive Chain Runs + Radial Brembo Brake Calipers
      _addVehMerged(
        group,
        `bike:v2:goldDrive:${scale.toFixed(2)}`,
        goldForkMat,
        (p) => {
          // Upper & lower 520 O-ring drive chain runs between countershaft & rear sprocket
          p.push(_vPart(_getCachedBoxGeo(0.018 * scale, 0.022 * scale, 0.74 * scale), -0.14 * scale, 0.49 * scale, 0.52 * scale, -0.07, 0, 0));
          p.push(_vPart(_getCachedBoxGeo(0.018 * scale, 0.022 * scale, 0.74 * scale), -0.14 * scale, 0.35 * scale, 0.52 * scale, -0.11, 0, 0));
          p.push(_vPart(_getCachedCylGeo(0.052 * scale, 0.052 * scale, 0.42 * scale, 8), 0, 0.68 * scale, 0.31 * scale, -0.38, 0, 0));
          p.push(_vPart(_getCachedCylGeo(0.028 * scale, 0.028 * scale, 0.16 * scale, 8), 0.06 * scale, 0.78 * scale, 0.26 * scale, -0.38, 0, 0));
        },
        false,
        false
      );

      _addVehMerged(
        group,
        `bike:v2:calipers:${isSport ? 'sp' : 'mx'}_${scale.toFixed(2)}`,
        isSport ? goldForkMat : redCaliperMat,
        (p) => {
          p.push(_vPart(_getCachedBoxGeo(0.052 * scale, 0.088 * scale, 0.11 * scale), -frontWheelWidth * 0.62, wheelRadius + 0.12 * scale, -wheelbaseHalf + 0.1 * scale));
          if (isSport) {
            p.push(_vPart(_getCachedBoxGeo(0.052 * scale, 0.088 * scale, 0.11 * scale), frontWheelWidth * 0.62, wheelRadius + 0.12 * scale, -wheelbaseHalf + 0.1 * scale));
          }
          p.push(_vPart(_getCachedBoxGeo(0.05 * scale, 0.082 * scale, 0.1 * scale), -rearWheelWidth * 0.62, wheelRadius + 0.11 * scale, wheelbaseHalf - 0.1 * scale));
        },
        false,
        false
      );

      if (isElectric) {
        const battMat =
          sub === 'emoto_stark_varg'
            ? goldForkMat
            : sub === 'emoto_cemoto'
            ? primaryMat
            : darkMat;
        const battPack = new THREE.Mesh(
          _getCachedBoxGeo(0.31 * scale, 0.46 * scale, 0.44 * scale),
          battMat
        );
        battPack.position.set(0, 0.71 * scale, -0.08 * scale);
        battPack.castShadow = true;
        group.add(battPack);

        if (!isMilitaryRecon) {
          const socLed = new THREE.Mesh(
            _getCachedBoxGeo(0.33 * scale, 0.055 * scale, 0.18 * scale),
            new THREE.MeshBasicMaterial({
              color:
                sub === 'emoto_surron'
                  ? 0x00d2d3
                  : sub === 'emoto_stark_varg'
                  ? 0xff3838
                  : sub === 'emoto_yozma'
                  ? 0x2ecc71
                  : 0xe056fd
            })
          );
          socLed.position.set(0, 0.86 * scale, -0.08 * scale);
          group.add(socLed);
        }
      }

      // Competition Number Plates (MX / 2T / Stark Varg) OR Military Tactical Saddlebag Panniers
      if (isMilitaryRecon) {
        _addVehMerged(
          group,
          `bike:v2:milPanniers:${isMilitaryAdv ? 'adv' : 'rec'}_${scale.toFixed(2)}`,
          pannierMat,
          (p) => {
            for (const s of [-1, 1]) {
              // Twin side tactical pannier ammo cases + rear rack roll-pack
              p.push(
                _vPart(
                  _getCachedBoxGeo(0.15 * scale, (isMilitaryAdv ? 0.3 : 0.24) * scale, (isMilitaryAdv ? 0.44 : 0.36) * scale),
                  s * 0.25 * scale,
                  0.88 * scale,
                  0.6 * scale
                )
              );
            }
            p.push(_vPart(_getCachedBoxGeo(0.32 * scale, 0.16 * scale, 0.26 * scale), 0, 1.12 * scale, 0.78 * scale));
          },
          true,
          false
        );
      } else if (!isSport) {
        const useWhitePlates = isTwoStroke || sub === 'emoto_stark_varg' || sub === 'gas_50cc';
        _addVehMerged(
          group,
          `bike:v2:plates:${scale.toFixed(2)}`,
          useWhitePlates ? whitePlateMat : accentMat,
          (p) => {
            p.push(_vPart(_getCachedBoxGeo(0.25 * scale, 0.26 * scale, 0.05 * scale), 0, 1.07 * scale, -0.67 * scale, -0.28, 0, 0));
            for (const s of [-1, 1]) {
              p.push(_vPart(_getCachedBoxGeo(0.038 * scale, 0.2 * scale, 0.42 * scale), s * 0.16 * scale, 0.94 * scale, 0.48 * scale, 0.16, 0, 0));
            }
          },
          false,
          false
        );
      }

      // Windscreen (Supersport Double-Bubble OR KLR650 Dakar Rally Screen)
      if (isSport || isMilitaryAdv) {
        const windscreen = new THREE.Mesh(
          _getCachedBoxGeo((isSport ? 0.36 : 0.34) * scale, (isSport ? 0.26 : 0.36) * scale, (isSport ? 0.36 : 0.12) * scale),
          glassMat
        );
        windscreen.position.set(0, (isSport ? 1.15 : 1.36) * scale, (isSport ? -0.56 : -0.64) * scale);
        windscreen.rotation.x = isSport ? 0.58 : 0.28;
        group.add(windscreen);
      }

      // Headlights, TFT Cockpit Dash & Rear LED Tail Light
      _addVehMerged(
        group,
        `bike:v2:headlights:${isSport ? 'sp' : isMilitaryAdv ? 'adv' : 'mx'}_${scale.toFixed(2)}`,
        ledHeadMat,
        (p) => {
          p.push(_vPart(_getCachedBoxGeo(0.15 * scale, 0.03 * scale, 0.09 * scale), 0, barY + 0.04 * scale, barZ - 0.04 * scale, -0.35, 0, 0));
          if (isSport) {
            for (const s of [-1, 1]) {
              p.push(_vPart(_getCachedBoxGeo(0.15 * scale, 0.075 * scale, 0.06 * scale), s * 0.14 * scale, 0.88 * scale, -0.91 * scale, 0, 0, s * -0.18));
            }
          } else if (isMilitaryAdv) {
            p.push(_vPart(_getCachedCylGeo(0.07 * scale, 0.07 * scale, 0.06 * scale, 10), -0.08 * scale, 1.12 * scale, -0.84 * scale, Math.PI / 2, 0, 0));
            p.push(_vPart(_getCachedCylGeo(0.055 * scale, 0.055 * scale, 0.06 * scale, 10), 0.09 * scale, 1.12 * scale, -0.84 * scale, Math.PI / 2, 0, 0));
          } else {
            p.push(_vPart(_getCachedBoxGeo(0.18 * scale, 0.095 * scale, 0.05 * scale), 0, 1.03 * scale, -0.71 * scale));
          }
        },
        false,
        false
      );

      const tailLight = new THREE.Mesh(
        _getCachedBoxGeo(0.17 * scale, 0.06 * scale, 0.045 * scale),
        tailLedMat
      );
      tailLight.position.set(0, 1.05 * scale, 0.99 * scale);
      group.add(tailLight);

      // 8. Articulated 3rd-Person Rider Model (MotoGP Sport Tuck vs. Motocross / Tactical Attack Posture!)
      const riderGroup = createDetailedVehicleRider({
        posture: isSport ? 'sport' : 'mx',
        isUS,
        scale,
        accentHex: primaryColor,
        seatY: 1.02 * scale,
        seatZ: (isSport ? 0.28 : 0.22) * scale,
        barY,
        barZ,
        barHalfW: barHalfW * 0.92,
        pegX: 0.21 * scale,
        pegY: (isSport ? 0.52 : 0.44) * scale,
        pegZ: (isSport ? 0.22 : 0.08) * scale
      });
      group.add(riderGroup);
      group.userData.riderGroup = riderGroup;
    }

    // Handlebar-Mounted Tactical Drive-By PDW / SMG Barrel Group
    turretPivot.position.set(0, 1.15 * scale, -0.45 * scale);
    barrelGroup = new THREE.Group();
    const smg = new THREE.Mesh(_getCachedBoxGeo(0.06, 0.08, 0.48), barrelMat);
    smg.position.set(0.16, 0.05, 0.25);
    barrelGroup.add(smg);
    turretPivot.add(barrelGroup);

    // Anchor Motorcycle / Scooter wheelie rotation strictly at the Rear Wheel Axle
    const bikeRearRadius = isScooter ? 0.29 : 0.39 * scale;
    const bikeRearAxleZ = isScooter ? 0.78 : 0.88 * scale;
    _wrapVehicleChildrenInRearWheelPivot(group, bikeRearRadius, bikeRearAxleZ);
  } else if (cfg.type === 'trebuchet') {
    // ─── MEDIEVAL COUNTERWEIGHT SIEGE TREBUCHET (AUTHENTIC TIMBER A-FRAME & SLING) ─
    const oakTimberMat = new THREE.MeshStandardMaterial({
      color: 0x6b4226,
      roughness: 0.88,
      flatShading: true
    });
    const weatheredWoodMat = new THREE.MeshStandardMaterial({
      color: 0x52321b,
      roughness: 0.92,
      flatShading: true
    });
    const darkIronMat = new THREE.MeshStandardMaterial({
      color: 0x262b30,
      metalness: 0.72,
      roughness: 0.4,
      flatShading: true
    });
    const ropeHempMat = new THREE.MeshStandardMaterial({
      color: 0xc2a675,
      roughness: 0.92,
      flatShading: true
    });
    const stoneBoulderMat = new THREE.MeshStandardMaterial({
      color: 0x7f8c8d,
      roughness: 0.9,
      flatShading: true
    });
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff7f11 });
    const goldBannerTrimMat = new THREE.MeshStandardMaterial({
      color: 0xf1c40f,
      metalness: 0.75,
      roughness: 0.3
    });
    const heraldMat = new THREE.MeshStandardMaterial({
      color: isUS ? 0x1d4ed8 : 0xb91c1c,
      roughness: 0.6,
      side: THREE.DoubleSide
    });

    // Heavy Timber Base Sills, Central Boulder Launch Trough & Crossbeams (rotates with turretPivot to aim!)
    turretPivot.position.set(0, 0.15, 0);

    // Central wooden slide trough where the boulder rests before launch
    const slideTrough = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.18, 6.6), weatheredWoodMat);
    slideTrough.position.set(0, 0.14, 0.4);
    slideTrough.receiveShadow = true;
    turretPivot.add(slideTrough);

    for (const side of [-1, 1]) {
      const troughRail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.34, 6.6), oakTimberMat);
      troughRail.position.set(side * 0.52, 0.26, 0.4);
      turretPivot.add(troughRail);

      const sill = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 7.6), oakTimberMat);
      sill.position.set(side * 1.65, 0.23, 0.1);
      sill.castShadow = true;
      turretPivot.add(sill);

      // Towering A-Frame Upright Main King-Posts + Angled Front/Rear Trestle Struts rising to 5.0m pivot axle
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.44, 5.1, 0.44), oakTimberMat);
      post.position.set(side * 1.52, 2.65, -0.5);
      post.castShadow = true;
      turretPivot.add(post);

      const frontBrace = new THREE.Mesh(new THREE.BoxGeometry(0.36, 5.5, 0.36), weatheredWoodMat);
      frontBrace.position.set(side * 1.52, 2.5, -1.9);
      frontBrace.rotation.x = 0.48;
      frontBrace.castShadow = true;
      turretPivot.add(frontBrace);

      const rearBrace = new THREE.Mesh(new THREE.BoxGeometry(0.36, 5.8, 0.36), weatheredWoodMat);
      rearBrace.position.set(side * 1.52, 2.5, 1.25);
      rearBrace.rotation.x = -0.52;
      rearBrace.castShadow = true;
      turretPivot.add(rearBrace);

      // Side Lateral Outrigger Flying Buttress Struts (authentic wide siege engine stance)
      const sideButtress = new THREE.Mesh(new THREE.BoxGeometry(0.32, 4.4, 0.32), oakTimberMat);
      sideButtress.position.set(side * 2.25, 2.0, -0.5);
      sideButtress.rotation.z = side * 0.38;
      turretPivot.add(sideButtress);

      // Forged Iron Axle Bearing Cap at top of each A-frame tower
      const ironCap = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.52, 0.64), darkIronMat);
      ironCap.position.set(side * 1.52, 5.05, -0.5);
      turretPivot.add(ironCap);
    }

    for (const cz of [-3.4, -0.5, 1.6, 3.5]) {
      const crossTie = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.38, 0.42), weatheredWoodMat);
      crossTie.position.set(0, 0.22, cz);
      turretPivot.add(crossTie);
    }

    // Main Forged Iron Pivot Axle at height 4.95m
    const mainAxle = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 3.8, 12), darkIronMat);
    mainAxle.rotation.z = Math.PI / 2;
    mainAxle.position.set(0, 4.95, -0.5);
    turretPivot.add(mainAxle);

    // Tall Heraldic Siege Banner Pole & Team Pennant on Left Upright so Trebuchet is Easy to Spot
    const bannerPole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.2, 8), oakTimberMat);
    bannerPole.position.set(-1.52, 6.45, -0.5);
    turretPivot.add(bannerPole);
    const bannerFinial = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), goldBannerTrimMat);
    bannerFinial.position.set(-1.52, 8.1, -0.5);
    turretPivot.add(bannerFinial);
    const siegePennant = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.25, 2.35), heraldMat);
    siegePennant.position.set(-1.52, 7.25, 0.65);
    turretPivot.add(siegePennant);

    // Dual Rear Timber Windlass Capstan Wheels (Crew winds these to cock the Counterweight Arm!)
    const winchWheels = [];
    for (const side of [-1, 1]) {
      const winchGroup = new THREE.Group();
      winchGroup.position.set(side * 1.82, 1.45, 2.85);
      const wheelRim = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.1, 8, 16), oakTimberMat);
      wheelRim.rotation.y = Math.PI / 2;
      const spoke1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.85, 0.1), weatheredWoodMat);
      const spoke2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.85), weatheredWoodMat);
      const spoke3 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.85, 0.1), weatheredWoodMat);
      spoke3.rotation.x = Math.PI / 4;
      const spoke4 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.85, 0.1), weatheredWoodMat);
      spoke4.rotation.x = -Math.PI / 4;
      winchGroup.add(wheelRim, spoke1, spoke2, spoke3, spoke4);
      turretPivot.add(winchGroup);
      winchWheels.push(winchGroup);
    }
    const winchDrum = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 3.6, 12), ropeHempMat);
    winchDrum.rotation.z = Math.PI / 2;
    winchDrum.position.set(0, 1.45, 2.85);
    turretPivot.add(winchDrum);

    // Siege Ammo Stockpile of Heavy Stone Boulders + Flaming Ignition Brazier beside the frame
    for (const [bx, by, bz] of [
      [-2.55, 0.42, 1.6],
      [-2.95, 0.42, 2.35],
      [-2.35, 0.42, 2.55],
      [-2.62, 0.95, 2.15],
      [2.55, 0.42, 1.95]
    ]) {
      const ammoRock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.46, 1), stoneBoulderMat);
      ammoRock.position.set(bx, by, bz);
      turretPivot.add(ammoRock);
    }
    const brazierStand = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.52, 0.95, 8), darkIronMat);
    brazierStand.position.set(2.55, 0.48, -1.2);
    const brazierFire = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 0), flameMat);
    brazierFire.position.set(2.55, 1.12, -1.2);
    turretPivot.add(brazierStand, brazierFire);

    // Swinging Throwing Beam + Hinged Counterweight Hopper Box + Rope Sling & Boulder (`barrelGroup`)
    barrelGroup = new THREE.Group();
    barrelGroup.position.set(0, 4.95, -0.5);

    // Long tapering timber throwing arm (8.8m long, with iron reinforcement bands)
    const throwingArm = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.46, 8.8), oakTimberMat);
    throwingArm.position.set(0, 0, 1.95);
    throwingArm.rotation.x = -0.38;
    throwingArm.castShadow = true;
    barrelGroup.add(throwingArm);

    for (const bzOff of [-1.8, 0.0, 2.2, 4.4, 5.8]) {
      const ironBand = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.52, 0.18), darkIronMat);
      ironBand.position.set(0, -bzOff * Math.sin(0.38), 1.95 + bzOff * Math.cos(0.38));
      ironBand.rotation.x = -0.38;
      barrelGroup.add(ironBand);
    }

    // Massive Hinged Timber & Iron Counterweight Hopper Box at short forward end of beam (-Z)
    for (const side of [-1, 1]) {
      const hangerBar = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.65, 0.22), darkIronMat);
      hangerBar.position.set(side * 0.72, -0.15, -1.75);
      barrelGroup.add(hangerBar);
    }
    const cwBox = new THREE.Mesh(new THREE.BoxGeometry(1.95, 2.15, 1.75), weatheredWoodMat);
    cwBox.position.set(0, -1.55, -1.75);
    cwBox.castShadow = true;
    const cwRoof = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.35, 1.9), oakTimberMat);
    cwRoof.position.set(0, -0.38, -1.75);
    const cwIronTrim = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.28, 1.84), heraldMat);
    cwIronTrim.position.set(0, -0.85, -1.75);
    const cwIronBase = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.24, 1.84), darkIronMat);
    cwIronBase.position.set(0, -2.42, -1.75);
    barrelGroup.add(cwBox, cwRoof, cwIronTrim, cwIronBase);

    // Hemp Sling Ropes connecting tip of throwing arm to the Flaming Stone Boulder in the pouch!
    for (const side of [-1, 1]) {
      const slingRope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.35, 6), ropeHempMat);
      slingRope.position.set(side * 0.22, -1.85, 5.45);
      slingRope.rotation.x = 0.28;
      barrelGroup.add(slingRope);
    }

    // Flaming Stone Boulder nested in the leather sling pouch ready to hurl!
    const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(0.68, 1), stoneBoulderMat);
    boulder.name = 'trebuchetSlingBoulder';
    boulder.position.set(0, -2.65, 5.2);
    const fireAura = new THREE.Mesh(new THREE.DodecahedronGeometry(0.82, 0), flameMat);
    fireAura.name = 'trebuchetFireAura';
    fireAura.position.set(0, -2.55, 5.2);
    barrelGroup.add(boulder, fireAura);

    group.userData.boulderMesh = boulder;
    group.userData.fireAuraMesh = fireAura;
    group.userData.winchWheels = winchWheels;

    turretPivot.add(barrelGroup);
  } else if (cfg.type === 'warhorse') {
    // ─── MEDIEVAL ARMORED ROYAL WARHORSE + MOUNTED KNIGHT ARCHER ─────────────────
    const coatMat = new THREE.MeshStandardMaterial({
      color: isUS ? 0x4a2f1d : 0x241c18,
      roughness: 0.78,
      flatShading: true
    });
    const bardingClothMat = new THREE.MeshStandardMaterial({
      color: isUS ? 0x1d4ed8 : 0xb91c1c,
      roughness: 0.62,
      flatShading: true
    });
    const goldTrimMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      metalness: 0.82,
      roughness: 0.28
    });
    const steelPlateMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      metalness: 0.86,
      roughness: 0.24,
      flatShading: true
    });
    const maneMat = new THREE.MeshStandardMaterial({ color: 0x161210, roughness: 0.9 });

    // Slim, accurate Horse Torso & Heraldic Caparison Barding Skirt (tight hitbox!)
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.68, 1.58), coatMat);
    torso.position.set(0, 1.18, 0);
    torso.castShadow = true;
    group.add(torso);

    const caparison = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.62, 1.52), bardingClothMat);
    caparison.position.set(0, 1.05, 0.02);
    caparison.userData.skipHitbox = true;
    const goldBorder = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 1.55), goldTrimMat);
    goldBorder.position.set(0, 0.72, 0.02);
    goldBorder.userData.skipHitbox = true;
    group.add(caparison, goldBorder);

    // Muscular Neck, Head, Pointed Ears, Flowing Mane, Leather Reins & Steel Chanfron Faceplate
    // Positioned naturally forward and below the rider's 1st-person eye line (ear tips ~1.84m vs eye height 2.38m)
    // so the horse's head rests in the lower periphery and never blocks forward archery aiming!
    const headNeckGroup = new THREE.Group();
    headNeckGroup.position.set(0, 1.16, -0.68);

    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.58, 0.36), coatMat);
    neck.position.set(0, 0.14, -0.14);
    neck.rotation.x = 0.48;

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.28, 0.58), coatMat);
    head.position.set(0, 0.4, -0.48);
    head.rotation.x = 0.34;

    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.32), coatMat);
    snout.position.set(0, 0.28, -0.78);
    snout.rotation.x = 0.34;
    snout.userData.skipHitbox = true;

    // Pointed Horse Ears (positioned low enough to never obstruct the archer's sightline)
    const leftEar = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.16, 5), coatMat);
    leftEar.position.set(-0.1, 0.6, -0.34);
    leftEar.rotation.set(-0.18, 0, 0.14);
    leftEar.userData.skipHitbox = true;
    const rightEar = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.16, 5), coatMat);
    rightEar.position.set(0.1, 0.6, -0.34);
    rightEar.rotation.set(-0.18, 0, -0.14);
    rightEar.userData.skipHitbox = true;

    // Steel & Gold Chamfron Armor Plate on Horse's Forehead/Crown
    const chanfron = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.56), steelPlateMat);
    chanfron.position.set(0, 0.48, -0.5);
    chanfron.rotation.x = 0.34;
    chanfron.userData.skipHitbox = true;
    const chanfronCrest = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.48), goldTrimMat);
    chanfronCrest.position.set(0, 0.54, -0.46);
    chanfronCrest.rotation.x = 0.34;
    chanfronCrest.userData.skipHitbox = true;

    // Flowing Dark Horsehair Mane along the back of the neck
    const mane = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.58, 0.18), maneMat);
    mane.position.set(0, 0.22, 0.03);
    mane.rotation.x = 0.48;
    mane.userData.skipHitbox = true;

    // Leather Bridle & Reins running back from the horse's bit toward the Knight's hands
    const reinMat = new THREE.MeshStandardMaterial({ color: 0x3b2314, roughness: 0.85 });
    const leftRein = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.78), reinMat);
    leftRein.position.set(-0.15, 0.28, -0.22);
    leftRein.rotation.x = -0.18;
    leftRein.userData.skipHitbox = true;
    const rightRein = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.78), reinMat);
    rightRein.position.set(0.15, 0.28, -0.22);
    rightRein.rotation.x = -0.18;
    rightRein.userData.skipHitbox = true;

    headNeckGroup.add(
      neck,
      head,
      snout,
      leftEar,
      rightEar,
      chanfron,
      chanfronCrest,
      mane,
      leftRein,
      rightRein
    );
    group.add(headNeckGroup);
    group.userData.headNeckGroup = headNeckGroup;

    // Raised Medieval War Saddle Pommel & Cantle
    const saddlePommel = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.16), goldTrimMat);
    saddlePommel.position.set(0, 1.58, -0.32);
    saddlePommel.userData.skipHitbox = true;
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.78, 0.18), maneMat);
    tail.position.set(0, 1.02, 0.88);
    tail.rotation.x = 0.32;
    tail.userData.skipHitbox = true;
    group.add(saddlePommel, tail);

    // Four Articulated Galloping Horse Legs (`wheels` array so VehicleManager animates them smoothly!)
    for (const [lx, lz] of [
      [-0.21, -0.56],
      [0.21, -0.56],
      [-0.21, 0.56],
      [0.21, 0.56]
    ]) {
      const legPivot = new THREE.Group();
      legPivot.position.set(lx, 0.92, lz);
      const legMesh = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.9, 0.16), coatMat);
      legMesh.position.set(0, -0.44, 0);
      legMesh.userData.skipHitbox = true;
      const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.14, 0.2), maneMat);
      hoof.position.set(0, -0.86, -0.02);
      hoof.userData.skipHitbox = true;
      legPivot.add(legMesh, hoof);
      group.add(legPivot);
      wheels.push(legPivot);
    }

    // 3rd-Person Armored Knight Rider with Great Helm, Plume, Cape & Drawn Longbow!
    const riderGroup = new THREE.Group();
    const knightTorso = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.64, 0.32), steelPlateMat);
    knightTorso.position.set(0, 1.88, 0.05);
    knightTorso.userData.skipHitbox = true;
    const knightSurcoat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.34), bardingClothMat);
    knightSurcoat.position.set(0, 1.74, 0.05);
    knightSurcoat.userData.skipHitbox = true;
    const greatHelm = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.21, 0.36, 10), steelPlateMat);
    greatHelm.position.set(0, 2.42, 0.05);
    greatHelm.userData.skipHitbox = true;
    const helmCross = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.05), goldTrimMat);
    helmCross.position.set(0, 2.42, -0.15);
    helmCross.userData.skipHitbox = true;
    const plume = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.26, 0.34), bardingClothMat);
    plume.position.set(0, 2.7, 0.12);
    plume.userData.skipHitbox = true;
    const riderBow = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.028, 8, 16, Math.PI), goldTrimMat);
    riderBow.position.set(-0.28, 2.0, -0.32);
    riderBow.rotation.y = Math.PI / 2;
    riderBow.userData.skipHitbox = true;
    riderGroup.add(knightTorso, knightSurcoat, greatHelm, helmCross, plume, riderBow);
    group.add(riderGroup);
    group.userData.riderGroup = riderGroup;

    turretPivot.position.set(0, 1.95, -0.35);
    barrelGroup = new THREE.Group();
    turretPivot.add(barrelGroup);
  } else if (cfg.type === 'trex_mount' || cfg.type === 'raptor_mount') {
    ({ barrelGroup } = buildDinoMountModel(modelCtx));
  } else {
    ({ barrelGroup } = buildApcModel(modelCtx));
  }

  group.add(turretPivot);

  // Deduplicate unbaked BoxGeometry primitives across fleet & freeze static leaf Mesh local matrices
  const dynamicNodes = new Set();
  dynamicNodes.add(group);
  dynamicNodes.add(turretPivot);
  if (barrelGroup) dynamicNodes.add(barrelGroup);
  for (let i = 0; i < wheels.length; i++) {
    if (wheels[i]) dynamicNodes.add(wheels[i]);
  }
  const ud = group.userData;
  if (ud) {
    if (Array.isArray(ud.wrightProps)) {
      for (let i = 0; i < ud.wrightProps.length; i++) dynamicNodes.add(ud.wrightProps[i]);
    }
    if (ud.controlSurfaces) {
      const cs = ud.controlSurfaces;
      if (cs.leftAileron) dynamicNodes.add(cs.leftAileron);
      if (cs.rightAileron) dynamicNodes.add(cs.rightAileron);
      if (cs.elevator) dynamicNodes.add(cs.elevator);
      if (Array.isArray(cs.rudders)) {
        for (let i = 0; i < cs.rudders.length; i++) dynamicNodes.add(cs.rudders[i]);
      }
    }
    if (ud.riderGroup) {
      dynamicNodes.add(ud.riderGroup);
      if (ud.riderGroup.userData?.headPivot) dynamicNodes.add(ud.riderGroup.userData.headPivot);
    }
    if (ud.rearWheelPivot) dynamicNodes.add(ud.rearWheelPivot);
    if (ud.boulderMesh) dynamicNodes.add(ud.boulderMesh);
    if (ud.fireAuraMesh) dynamicNodes.add(ud.fireAuraMesh);
    if (Array.isArray(ud.winchWheels)) {
      for (let i = 0; i < ud.winchWheels.length; i++) dynamicNodes.add(ud.winchWheels[i]);
    }
    if (ud.headNeckGroup) dynamicNodes.add(ud.headNeckGroup);
    if (ud.mainRotorHub) dynamicNodes.add(ud.mainRotorHub);
    if (ud.coaxUpperRotorHub) dynamicNodes.add(ud.coaxUpperRotorHub);
    if (ud.tailRotorHub) dynamicNodes.add(ud.tailRotorHub);
  }

  group.traverse((child) => {
    if (!child.isMesh) return;
    const geo = child.geometry;
    if (geo && geo.type === 'BoxGeometry' && geo.parameters && !geo.userData?.shared) {
      const p = geo.parameters;
      if (
        (p.widthSegments || 1) === 1 &&
        (p.heightSegments || 1) === 1 &&
        (p.depthSegments || 1) === 1
      ) {
        const sharedBox = _getCachedBoxGeo(p.width, p.height, p.depth);
        if (sharedBox !== geo) {
          child.geometry = sharedBox;
          geo.dispose();
        }
      }
    }
    if (!dynamicNodes.has(child)) {
      child.updateMatrix();
      child.matrixAutoUpdate = false;
    }
  });

  return { group, wheels, turretPivot, barrelGroup };
}
