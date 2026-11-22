// ============================================================================
// 3D WORLD PROP & DEPLOYABLE MODELS (src/models/prop-models.js)
// Reusable high-fidelity, low-draw-call 3D mesh builders for:
//  - 24m Tapered Steel Lattice Air-Defense Radar Towers (<= 5 static draw calls)
//  - Squad Deployable Ammo & Kit Stashes (preserving children[3] RingGeometry)
// ============================================================================

import * as THREE from '../../vendor/three.module.js';

let propShared = null;

const _tmpMat = new THREE.Matrix4();
const _tmpQuat = new THREE.Quaternion();
const _tmpEuler = new THREE.Euler();
const _tmpPos = new THREE.Vector3();
const _tmpScale = new THREE.Vector3(1, 1, 1);
const _upAxis = new THREE.Vector3(0, 1, 0);

function markShared(item) {
  item.userData.shared = true;
  return item;
}

function mergeStaticParts(parts) {
  let totalVerts = 0;
  const nonIndexed = [];
  for (let i = 0; i < parts.length; i++) {
    const { geo, pos, rot } = parts[i];
    const ni = geo.index ? geo.toNonIndexed() : geo.clone();
    _tmpPos.set(pos[0], pos[1], pos[2]);
    _tmpEuler.set(rot[0], rot[1], rot[2]);
    _tmpQuat.setFromEuler(_tmpEuler);
    _tmpMat.compose(_tmpPos, _tmpQuat, _tmpScale);
    ni.applyMatrix4(_tmpMat);
    totalVerts += ni.attributes.position.count;
    nonIndexed.push(ni);
  }
  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  let offset = 0;
  for (let i = 0; i < nonIndexed.length; i++) {
    const ni = nonIndexed[i];
    positions.set(ni.attributes.position.array, offset);
    normals.set(ni.attributes.normal.array, offset);
    offset += ni.attributes.position.array.length;
    ni.dispose();
  }
  const disposed = new Set();
  for (let i = 0; i < parts.length; i++) {
    const g = parts[i].geo;
    if (g && !g.userData?.shared && !disposed.has(g)) {
      disposed.add(g);
      g.dispose();
    }
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.computeBoundingSphere();
  return markShared(merged);
}

function beamBetween(p1, p2, w, d) {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const dz = p2[2] - p1[2];
  const len = Math.hypot(dx, dy, dz);
  const dir = new THREE.Vector3(dx / len, dy / len, dz / len);
  const q = new THREE.Quaternion().setFromUnitVectors(_upAxis, dir);
  const e = new THREE.Euler().setFromQuaternion(q);
  return {
    geo: new THREE.BoxGeometry(w, len, d),
    pos: [(p1[0] + p2[0]) * 0.5, (p1[1] + p2[1]) * 0.5, (p1[2] + p2[2]) * 0.5],
    rot: [e.x, e.y, e.z]
  };
}

function buildRadarTowerGeometries() {
  const steelParts = [];
  const darkEquipParts = [];
  const redWarnParts = [];
  const whiteWarnParts = [];
  const beaconGlowParts = [];

  // 1. Concrete foundation pads + 4-legged tapered steel lattice tower (y = 0..21m)
  //    with 5 horizontal tiers & diagonal X-cross-bracing across all 4 faces
  const tierYs = [0.4, 4.52, 8.64, 12.76, 16.88, 21.0];
  const halfSpanAt = (y) => 2.65 - (y / 21.0) * 1.72; // tapers from ±2.65m at base to ±0.93m at y=21m

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const baseH = halfSpanAt(0.4);
      // Concrete pier foundation pad + steel baseplate flange
      steelParts.push({
        geo: new THREE.BoxGeometry(1.05, 0.65, 1.05),
        pos: [sx * baseH, 0.325, sz * baseH],
        rot: [0, 0, 0]
      });
      steelParts.push({
        geo: new THREE.BoxGeometry(0.68, 0.14, 0.68),
        pos: [sx * baseH, 0.68, sz * baseH],
        rot: [0, 0, 0]
      });
      // Main tapered corner angle-iron column leg (y = 0.4 -> 21.0m)
      const topH = halfSpanAt(21.0);
      steelParts.push(beamBetween([sx * baseH, 0.4, sz * baseH], [sx * topH, 21.0, sz * topH], 0.22, 0.22));
    }
  }

  // 5 bays of horizontal perimeter girts + diagonal X-cross-bracing across all 4 faces
  for (let b = 0; b < tierYs.length - 1; b++) {
    const y0 = tierYs[b];
    const y1 = tierYs[b + 1];
    const h0 = halfSpanAt(y0);
    const h1 = halfSpanAt(y1);

    const corners0 = [
      [-h0, y0, -h0],
      [h0, y0, -h0],
      [h0, y0, h0],
      [-h0, y0, h0]
    ];
    const corners1 = [
      [-h1, y1, -h1],
      [h1, y1, -h1],
      [h1, y1, h1],
      [-h1, y1, h1]
    ];

    for (let f = 0; f < 4; f++) {
      const nf = (f + 1) % 4;
      // Upper horizontal tier girt on each face
      steelParts.push(beamBetween(corners1[f], corners1[nf], 0.14, 0.14));
      // Diagonal X-cross-bracing across face
      steelParts.push(beamBetween(corners0[f], corners1[nf], 0.095, 0.095));
      steelParts.push(beamBetween(corners0[nf], corners1[f], 0.095, 0.095));
    }
    // Internal horizontal plan-view K/X-diagonals at each tier
    steelParts.push(beamBetween(corners1[0], corners1[2], 0.085, 0.085));
    steelParts.push(beamBetween(corners1[1], corners1[3], 0.085, 0.085));
  }

  // 2. Upper observation catwalk deck (y = 19.8m), safety guardrails, equipment shelter & caged ladder
  const deckW = 3.15;
  const deckHalf = deckW * 0.5;
  darkEquipParts.push({
    geo: new THREE.BoxGeometry(deckW, 0.16, deckW),
    pos: [0, 19.8, 0],
    rot: [0, 0, 0]
  });
  // Guardrail corner & mid posts + waist/knee safety rails around y = 19.8..20.95m
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      darkEquipParts.push({
        geo: new THREE.BoxGeometry(0.08, 1.15, 0.08),
        pos: [sx * (deckHalf - 0.06), 20.38, sz * (deckHalf - 0.06)],
        rot: [0, 0, 0]
      });
    }
    // X-parallel rails & Z-parallel rails (waist & mid-height)
    for (const ry of [20.36, 20.92]) {
      darkEquipParts.push({
        geo: new THREE.BoxGeometry(deckW, 0.06, 0.06),
        pos: [0, ry, sx * (deckHalf - 0.06)],
        rot: [0, 0, 0]
      });
      darkEquipParts.push({
        geo: new THREE.BoxGeometry(0.06, 0.06, deckW),
        pos: [sx * (deckHalf - 0.06), ry, 0],
        rot: [0, 0, 0]
      });
    }
  }

  // Upper radar electronics cabinet on catwalk + Ground base transmitter shelter cabinet
  darkEquipParts.push({
    geo: new THREE.BoxGeometry(0.95, 1.42, 0.82),
    pos: [-0.68, 20.58, -0.58],
    rot: [0, 0, 0]
  });
  darkEquipParts.push({
    geo: new THREE.BoxGeometry(1.48, 1.85, 1.18),
    pos: [-0.65, 0.95, -0.55],
    rot: [0, 0, 0]
  });

  // Vertical access ladder run (y = 0.4..19.8m) + waveguide cable conduit
  darkEquipParts.push({ geo: new THREE.BoxGeometry(0.06, 19.4, 0.06), pos: [-0.24, 10.1, 0.72], rot: [0, 0, 0] });
  darkEquipParts.push({ geo: new THREE.BoxGeometry(0.06, 19.4, 0.06), pos: [0.24, 10.1, 0.72], rot: [0, 0, 0] });
  darkEquipParts.push({
    geo: new THREE.CylinderGeometry(0.075, 0.075, 20.5, 6),
    pos: [0.42, 10.6, -0.35],
    rot: [0, 0, 0]
  });
  for (let ly = 1.0; ly <= 19.4; ly += 0.85) {
    darkEquipParts.push({
      geo: new THREE.BoxGeometry(0.48, 0.04, 0.04),
      pos: [0, ly, 0.72],
      rot: [0, 0, 0]
    });
  }

  // 3. Rotary Azimuth Pedestal + Open-Ribbed Parabolic Air-Search Radar Dish + 3-Strut Feed-Horn Tripod
  steelParts.push({
    geo: new THREE.CylinderGeometry(0.58, 0.72, 1.35, 10),
    pos: [0, 21.65, 0],
    rot: [0, 0, 0]
  });
  darkEquipParts.push({
    geo: new THREE.BoxGeometry(1.15, 0.78, 1.35),
    pos: [-0.15, 22.38, 0],
    rot: [0, 0, 0]
  });

  // Tilted open-ribbed parabolic Air-Search Radar Dish centered at (0.85, 22.65, 0) facing +X and tilted ~18 deg skyward
  const dishCenter = new THREE.Vector3(0.95, 22.65, 0);
  const dishTilt = new THREE.Euler(0, 0, 0.32); // normal (+X) tilted skyward (+Y)
  const dishQuat = new THREE.Quaternion().setFromEuler(dishTilt);
  const toWorldDish = (lx, ly, lz) => {
    const v = new THREE.Vector3(lx, ly, lz).applyQuaternion(dishQuat).add(dishCenter);
    return [v.x, v.y, v.z];
  };

  // Parabolic hub + 12 radial curved truss ribs + outer polygonal rim + 3-strut focal feed-horn tripod
  const hubPt = toWorldDish(0, 0, 0);
  const focalPt = toWorldDish(1.95, 0, 0);
  const dishRadY = 2.15;
  const dishRadZ = 3.15; // Wide elliptical S-band / L-band air-search radar aperture!
  const rimPts = [];
  const ribCount = 12;
  for (let r = 0; r < ribCount; r++) {
    const ang = (r / ribCount) * Math.PI * 2;
    const midPt = toWorldDish(0.28, Math.sin(ang) * dishRadY * 0.55, Math.cos(ang) * dishRadZ * 0.55);
    const rimPt = toWorldDish(0.78, Math.sin(ang) * dishRadY, Math.cos(ang) * dishRadZ);
    rimPts.push(rimPt);
    steelParts.push(beamBetween(hubPt, midPt, 0.075, 0.075));
    steelParts.push(beamBetween(midPt, rimPt, 0.065, 0.065));
  }
  for (let r = 0; r < ribCount; r++) {
    steelParts.push(beamBetween(rimPts[r], rimPts[(r + 1) % ribCount], 0.085, 0.085));
  }
  // 3-strut feed-horn tripod converging from dish rim to focal L-band horn receiver
  for (const idx of [1, 5, 9]) {
    steelParts.push(beamBetween(rimPts[idx], focalPt, 0.065, 0.065));
  }
  // Focal feed-horn assembly + rear counterweight boom
  darkEquipParts.push(beamBetween(toWorldDish(1.7, 0, 0), toWorldDish(2.15, 0, 0), 0.32, 0.32));
  steelParts.push(beamBetween(toWorldDish(-1.35, 0, 0), hubPt, 0.16, 0.16));

  // Central lightning & aviation obstruction mast rising to y = 25.2m
  steelParts.push({
    geo: new THREE.CylinderGeometry(0.065, 0.11, 2.85, 8),
    pos: [-0.35, 23.75, 0],
    rot: [0, 0, 0]
  });

  // 4. Red & White Aviation Warning Bands (y = 21.8..24.8m) + Dish Tip Warning Trim
  for (let band = 0; band < 5; band++) {
    const by = 22.55 + band * 0.48;
    const targetArr = band % 2 === 0 ? redWarnParts : whiteWarnParts;
    targetArr.push({
      geo: new THREE.CylinderGeometry(0.115, 0.125, 0.44, 8),
      pos: [-0.35, by, 0],
      rot: [0, 0, 0]
    });
  }
  // Red warning caps on horizontal dish wingtips & counterweight
  redWarnParts.push({ geo: new THREE.BoxGeometry(0.22, 0.38, 0.32), pos: rimPts[0], rot: [0, 0, 0.32] });
  redWarnParts.push({ geo: new THREE.BoxGeometry(0.22, 0.38, 0.32), pos: rimPts[6], rot: [0, 0, 0.32] });
  redWarnParts.push({
    geo: new THREE.BoxGeometry(0.36, 0.36, 0.36),
    pos: toWorldDish(-1.42, 0, 0),
    rot: [0, 0, 0.32]
  });
  // Secondary white microwave drum relay dish on mid-tower (y = 14.8m)
  whiteWarnParts.push({
    geo: new THREE.CylinderGeometry(0.68, 0.68, 0.32, 12),
    pos: [0, 14.8, 1.52],
    rot: [Math.PI / 2, 0, 0]
  });

  // 5. Glowing Red FAA Obstruction Beacon at y = 25.2m + 4 Catwalk Corner Marker Lights
  beaconGlowParts.push({
    geo: new THREE.CylinderGeometry(0.18, 0.2, 0.36, 10),
    pos: [-0.35, 25.2, 0],
    rot: [0, 0, 0]
  });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      beaconGlowParts.push({
        geo: new THREE.BoxGeometry(0.12, 0.12, 0.12),
        pos: [sx * (deckHalf - 0.06), 21.02, sz * (deckHalf - 0.06)],
        rot: [0, 0, 0]
      });
    }
  }

  return {
    towerSteelGeo: mergeStaticParts(steelParts),
    towerEquipGeo: mergeStaticParts(darkEquipParts),
    towerRedGeo: mergeStaticParts(redWarnParts),
    towerWhiteGeo: mergeStaticParts(whiteWarnParts),
    towerBeaconGeo: mergeStaticParts(beaconGlowParts)
  };
}

function buildAmmoStashGeometries() {
  // 1. Main Ordnance Chest + Overhanging Ribbed Lid + Pallet Skids + Stacked .50 Cal / 5.56mm Ammo Cans
  const boxGeo = mergeStaticParts([
    // Pallet skids under chest
    { geo: new THREE.BoxGeometry(1.42, 0.08, 0.16), pos: [0, -0.37, -0.3], rot: [0, 0, 0] },
    { geo: new THREE.BoxGeometry(1.42, 0.08, 0.16), pos: [0, -0.37, 0.3], rot: [0, 0, 0] },
    // Main beveled chest hull + top overhanging hinged lid + 3 lid ribs
    { geo: new THREE.BoxGeometry(1.34, 0.68, 0.84), pos: [0, -0.02, 0], rot: [0, 0, 0] },
    { geo: new THREE.BoxGeometry(1.4, 0.14, 0.9), pos: [0, 0.36, 0], rot: [0, 0, 0] },
    { geo: new THREE.BoxGeometry(0.12, 0.17, 0.92), pos: [-0.46, 0.37, 0], rot: [0, 0, 0] },
    { geo: new THREE.BoxGeometry(0.12, 0.17, 0.92), pos: [0, 0.37, 0], rot: [0, 0, 0] },
    { geo: new THREE.BoxGeometry(0.12, 0.17, 0.92), pos: [0.46, 0.37, 0], rot: [0, 0, 0] },
    // Secondary M2A1 .50 cal & M19A1 5.56mm steel ammo cans stacked beside front-left corner
    { geo: new THREE.BoxGeometry(0.32, 0.24, 0.18), pos: [-0.52, -0.29, 0.54], rot: [0, 0.18, 0] },
    { geo: new THREE.BoxGeometry(0.28, 0.2, 0.16), pos: [-0.16, -0.31, 0.53], rot: [0, -0.12, 0] },
    { geo: new THREE.BoxGeometry(0.28, 0.2, 0.16), pos: [-0.48, -0.07, 0.53], rot: [0, -0.08, 0] }
  ]);

  // 2. High-Visibility Yellow Ordnance Stencil Band + Ammo Can Stencil Bars
  const stripeGeo = mergeStaticParts([
    { geo: new THREE.BoxGeometry(1.38, 0.14, 0.88), pos: [0, 0, 0], rot: [0, 0, 0] },
    { geo: new THREE.BoxGeometry(0.33, 0.045, 0.19), pos: [-0.52, -0.44, 0.54], rot: [0, 0.18, 0] },
    { geo: new THREE.BoxGeometry(0.29, 0.04, 0.17), pos: [-0.16, -0.47, 0.53], rot: [0, -0.12, 0] }
  ]);

  // 3. Kit-Locker Steel Weapon Rack Frame + Crate Lid Latches & Carry Handles (`rackFrameMat`)
  const rackAndHardwareGeo = mergeStaticParts([
    // Open-front tactical weapon rack base tray, side uprights, slotted barrel bar & header
    { geo: new THREE.BoxGeometry(0.5, 0.1, 0.64), pos: [0.68, 0.05, 0], rot: [0, 0, 0] },
    { geo: new THREE.BoxGeometry(0.46, 0.96, 0.07), pos: [0.68, 0.54, -0.29], rot: [0, 0, 0] },
    { geo: new THREE.BoxGeometry(0.46, 0.96, 0.07), pos: [0.68, 0.54, 0.29], rot: [0, 0, 0] },
    { geo: new THREE.BoxGeometry(0.08, 0.88, 0.58), pos: [0.87, 0.52, 0], rot: [0, 0, 0] },
    { geo: new THREE.BoxGeometry(0.46, 0.08, 0.58), pos: [0.68, 0.68, 0], rot: [0, 0, 0] },
    // Crate front/rear hinged lid latches (4x) & side folding drop carry handles (2x)
    { geo: new THREE.BoxGeometry(0.08, 0.18, 0.05), pos: [-0.52, 0.69, 0.44], rot: [0, 0, 0] },
    { geo: new THREE.BoxGeometry(0.08, 0.18, 0.05), pos: [0.16, 0.69, 0.44], rot: [0, 0, 0] },
    { geo: new THREE.BoxGeometry(0.08, 0.18, 0.05), pos: [-0.52, 0.69, -0.44], rot: [0, 0, 0] },
    { geo: new THREE.BoxGeometry(0.08, 0.18, 0.05), pos: [0.16, 0.69, -0.44], rot: [0, 0, 0] },
    { geo: new THREE.BoxGeometry(0.05, 0.12, 0.28), pos: [-0.87, 0.54, 0], rot: [0, 0, 0] }
  ]);

  // 4. Racked Assault Carbines / DMRs (stocks, receivers, curved mags, optics & barrels)
  const weaponParts = [];
  for (const rz of [-0.16, 0.0, 0.16]) {
    // Buttstock + Receiver + Handguard + Protruding Barrel & Flash Hider
    weaponParts.push({ geo: new THREE.BoxGeometry(0.12, 0.26, 0.06), pos: [0.64, 0.23, rz], rot: [0, 0, 0.08] });
    weaponParts.push({ geo: new THREE.BoxGeometry(0.11, 0.36, 0.065), pos: [0.66, 0.52, rz], rot: [0, 0, 0.08] });
    weaponParts.push({ geo: new THREE.BoxGeometry(0.075, 0.28, 0.06), pos: [0.68, 0.82, rz], rot: [0, 0, 0.08] });
    weaponParts.push({
      geo: new THREE.CylinderGeometry(0.018, 0.022, 0.34, 6),
      pos: [0.7, 1.08, rz],
      rot: [0, 0, -0.08]
    });
    // Curved 30-round magazine + Top Holo/ACOG Optic housing
    weaponParts.push({
      geo: new THREE.BoxGeometry(0.18, 0.065, 0.048),
      pos: [0.55, 0.54, rz],
      rot: [0, 0, 0.28]
    });
    weaponParts.push({
      geo: new THREE.BoxGeometry(0.07, 0.12, 0.052),
      pos: [0.73, 0.54, rz],
      rot: [0, 0, 0.08]
    });
  }
  const rackedWeaponsGeo = mergeStaticParts(weaponParts);

  // 5. Gleaming Brass Cartridge Belt Drape & Crate Clasps
  const brassStashGeo = mergeStaticParts([
    { geo: new THREE.BoxGeometry(0.24, 0.035, 0.14), pos: [-0.42, 0.86, 0.18], rot: [0, 0.25, 0] },
    { geo: new THREE.BoxGeometry(0.05, 0.18, 0.14), pos: [-0.31, 0.78, 0.44], rot: [0, 0, 0] },
    { geo: new THREE.BoxGeometry(0.06, 0.07, 0.04), pos: [-0.18, 0.66, 0.45], rot: [0, 0, 0] }
  ]);

  // 6. Red Trauma IFAK Medkit Pouch + Raised White Cross Emblem
  const medkitPouchGeo = mergeStaticParts([
    { geo: new THREE.BoxGeometry(0.28, 0.24, 0.2), pos: [0.22, 0.94, -0.18], rot: [0, -0.16, 0] }
  ]);
  const medkitCrossGeo = mergeStaticParts([
    { geo: new THREE.BoxGeometry(0.14, 0.045, 0.22), pos: [0.22, 0.94, -0.18], rot: [0, -0.16, 0] },
    { geo: new THREE.BoxGeometry(0.045, 0.14, 0.22), pos: [0.22, 0.94, -0.18], rot: [0, -0.16, 0] },
    { geo: new THREE.BoxGeometry(0.3, 0.045, 0.045), pos: [0.22, 0.94, -0.18], rot: [0, -0.16, 0] },
    { geo: new THREE.BoxGeometry(0.045, 0.14, 0.3), pos: [0.22, 0.94, -0.18], rot: [0, -0.16, 0] }
  ]);

  // 7. Glowing Cyan Kit-Swap Header Badge
  const kitBadgeGeo = mergeStaticParts([
    { geo: new THREE.BoxGeometry(0.5, 0.16, 0.62), pos: [0.68, 0.98, 0], rot: [0, 0, 0] }
  ]);

  return {
    boxGeo,
    stripeGeo,
    rackAndHardwareGeo,
    rackedWeaponsGeo,
    brassStashGeo,
    medkitPouchGeo,
    medkitCrossGeo,
    kitBadgeGeo
  };
}

function getPropShared() {
  if (!propShared) {
    const towerGeos = buildRadarTowerGeometries();
    const stashGeos = buildAmmoStashGeometries();

    propShared = {
      ...towerGeos,
      ...stashGeos,
      ringGeo: markShared(new THREE.RingGeometry(1.15, 1.48, 24)),

      // Shared Materials
      steelMat: markShared(
        new THREE.MeshStandardMaterial({
          color: 0xbdc3c7,
          metalness: 0.62,
          roughness: 0.38,
          flatShading: true
        })
      ),
      redMat: markShared(
        new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.5, flatShading: true })
      ),
      whiteWarnMat: markShared(
        new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.42, flatShading: true })
      ),
      beaconGlowMat: markShared(new THREE.MeshBasicMaterial({ color: 0xff3838 })),

      permBoxMat: markShared(
        new THREE.MeshStandardMaterial({
          color: 0x4b5320,
          roughness: 0.78,
          flatShading: true
        })
      ),
      tempBoxMat: markShared(
        new THREE.MeshStandardMaterial({
          color: 0x2f6b3c,
          roughness: 0.78,
          flatShading: true
        })
      ),
      stripeMat: markShared(new THREE.MeshBasicMaterial({ color: 0xf1c40f })),
      rackFrameMat: markShared(
        new THREE.MeshStandardMaterial({
          color: 0x2c3e50,
          roughness: 0.58,
          metalness: 0.38,
          flatShading: true
        })
      ),
      rifleStockMat: markShared(
        new THREE.MeshStandardMaterial({
          color: 0x1e272e,
          metalness: 0.52,
          roughness: 0.46,
          flatShading: true
        })
      ),
      brassMat: markShared(
        new THREE.MeshStandardMaterial({
          color: 0xd4af37,
          metalness: 0.82,
          roughness: 0.28,
          flatShading: true
        })
      ),
      kitBadgeMat: markShared(new THREE.MeshBasicMaterial({ color: 0x00d2d3 }))
    };
  }
  return propShared;
}

function freezeStaticMeshes(root) {
  root.traverse((child) => {
    if (child.isMesh) {
      child.updateMatrix();
      child.matrixAutoUpdate = false;
    }
  });
}

export function createRadarTowerMesh() {
  const s = getPropShared();
  const group = new THREE.Group();

  // 1. Concrete foundation pads + 4-legged tapered steel lattice + open-ribbed parabolic dish frame
  const latticeStructure = new THREE.Mesh(s.towerSteelGeo, s.steelMat);
  latticeStructure.castShadow = true;
  latticeStructure.receiveShadow = true;

  // 2. Upper observation catwalk (y=19.8m), safety guardrails, equipment cabinets, ladder & feed-horn
  const catwalkAndShelter = new THREE.Mesh(s.towerEquipGeo, s.rackFrameMat);
  catwalkAndShelter.castShadow = true;

  // 3 & 4. Red & White aviation warning bands (y=22.4..24.8m) & microwave drum relay
  const redBands = new THREE.Mesh(s.towerRedGeo, s.redMat);
  const whiteBands = new THREE.Mesh(s.towerWhiteGeo, s.whiteWarnMat);

  // 5. Glowing Red Obstruction Beacon at y = 25.2m
  const beacon = new THREE.Mesh(s.towerBeaconGeo, s.beaconGlowMat);

  group.add(latticeStructure, catwalkAndShelter, redBands, whiteBands, beacon);
  freezeStaticMeshes(group);
  return group;
}

export function createAmmoStashMesh(permanent = true) {
  const s = getPropShared();
  const group = new THREE.Group();

  // 1. Main Olive-Drab Squad Ammo & Ordnance Chest + Side .50 Cal / 5.56mm Cans (index 0)
  const box = new THREE.Mesh(s.boxGeo, permanent ? s.permBoxMat : s.tempBoxMat);
  box.position.set(-0.18, 0.41, 0);
  box.castShadow = true;
  box.receiveShadow = true;

  // 2. High-Visibility Tactical Stencil Band (index 1)
  const stripe = new THREE.Mesh(s.stripeGeo, s.stripeMat);
  stripe.position.set(-0.18, 0.58, 0);

  // 3. Squad Role / Kit-Changing Weapon Rack, Crate Hardware, Trauma Medkit & Racked Rifles (index 2)
  const kitLocker = new THREE.Group();
  const rackFrame = new THREE.Mesh(s.rackAndHardwareGeo, s.rackFrameMat);
  rackFrame.castShadow = true;
  const rackedWeapons = new THREE.Mesh(s.rackedWeaponsGeo, s.rifleStockMat);
  rackedWeapons.castShadow = true;
  const brassBelt = new THREE.Mesh(s.brassStashGeo, s.brassMat);
  const medPouch = new THREE.Mesh(s.medkitPouchGeo, s.redMat);
  const medCross = new THREE.Mesh(s.medkitCrossGeo, s.whiteWarnMat);
  const kitBadge = new THREE.Mesh(s.kitBadgeGeo, s.kitBadgeMat);
  kitLocker.add(rackFrame, rackedWeapons, brassBelt, medPouch, medCross, kitBadge);

  // 4. Pulsing Ground Resupply & Kit-Swap Ring (CRITICAL INVARIANT: MUST stay at index 3 in group.children!)
  const ring = new THREE.Mesh(
    s.ringGeo,
    new THREE.MeshBasicMaterial({
      color: permanent ? 0x00d2d3 : 0x2ecc71,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;

  group.add(box, stripe, kitLocker, ring);
  freezeStaticMeshes(group);
  return group;
}
