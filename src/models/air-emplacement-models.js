// ============================================================================
// 3D COMBAT AIRCRAFT, SQUAD EMPLACEMENTS & JURASSIC DINO MOUNTS
// (src/models/air-emplacement-models.js)
// High-fidelity, low-draw-call 3D builders for:
//  1. CAS Aircraft: US A-10C Thunderbolt II Warthog vs RU Su-25SM3 Frogfoot
//  2. Strike Bombers: US F-15E Strike Eagle vs RU Su-34 Fullback
//  3. Squad Fortification Emplacements: ZU-23-2 AA, M252/2B14 Mortar, M2HB/NSV HMG
//  4. Jurassic Rideable Mounts: Alpha T-Rex & Alpha Velociraptor
// ============================================================================

import * as THREE from '../../vendor/three.module.js';

const _localGeoCache = new Map();
const _mergedGeoCache = new Map();
const _tmpMat = new THREE.Matrix4();
const _tmpQuat = new THREE.Quaternion();
const _tmpEuler = new THREE.Euler();
const _tmpPos = new THREE.Vector3();
const _tmpScale = new THREE.Vector3(1, 1, 1);
const _upAxis = new THREE.Vector3(0, 1, 0);

let _shared = null;

function markShared(item) {
  item.userData.shared = true;
  return item;
}

function _fallbackGetBox(w, h, d) {
  const key = `box:${w.toFixed(4)}_${h.toFixed(4)}_${d.toFixed(4)}`;
  let g = _localGeoCache.get(key);
  if (!g) {
    g = markShared(new THREE.BoxGeometry(w, h, d));
    _localGeoCache.set(key, g);
  }
  return g;
}

function _fallbackGetCyl(rt, rb, h, seg = 8, rotZ = 0) {
  const key = `cyl:${rt.toFixed(4)}_${rb.toFixed(4)}_${h.toFixed(4)}_${seg}_${rotZ.toFixed(4)}`;
  let g = _localGeoCache.get(key);
  if (!g) {
    g = new THREE.CylinderGeometry(rt, rb, h, seg);
    if (rotZ !== 0) g.rotateZ(rotZ);
    markShared(g);
    _localGeoCache.set(key, g);
  }
  return g;
}

function _fallbackMergeParts(parts) {
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
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.computeBoundingSphere();
  merged.userData.shared = true;
  return merged;
}

function getCachedMergedGeo(key, mergeFn, buildPartsFn) {
  let g = _mergedGeoCache.get(key);
  if (g) return g;
  const parts = buildPartsFn();
  const merger = mergeFn || _fallbackMergeParts;
  g = merger(parts);
  g.userData.shared = true;
  const disposed = new Set();
  for (let i = 0; i < parts.length; i++) {
    const srcGeo = parts[i].geo;
    if (srcGeo && !srcGeo.userData?.shared && !disposed.has(srcGeo)) {
      disposed.add(srcGeo);
      srcGeo.dispose();
    }
  }
  _mergedGeoCache.set(key, g);
  return g;
}

function makeStrutPart(geoFn, p1, p2, w, d) {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const dz = p2[2] - p1[2];
  const len = Math.hypot(dx, dy, dz);
  const dir = new THREE.Vector3(dx / len, dy / len, dz / len);
  const q = new THREE.Quaternion().setFromUnitVectors(_upAxis, dir);
  const e = new THREE.Euler().setFromQuaternion(q);
  return {
    geo: geoFn(w, len, d),
    pos: [(p1[0] + p2[0]) * 0.5, (p1[1] + p2[1]) * 0.5, (p1[2] + p2[2]) * 0.5],
    rot: [e.x, e.y, e.z]
  };
}

function getAirEmpShared() {
  if (!_shared) {
    _shared = {
      // Dedicated CylinderGeometry instances for CAS barrelGroup.children[0] contract
      gauCoreCylGeo: markShared(new THREE.CylinderGeometry(0.14, 0.16, 1.72, 10)),
      gshCoreCylGeo: markShared(new THREE.CylinderGeometry(0.085, 0.098, 1.58, 8)),

      // Aircraft & Ordnance materials
      navRedMat: markShared(new THREE.MeshBasicMaterial({ color: 0xff3838 })),
      navGreenMat: markShared(new THREE.MeshBasicMaterial({ color: 0x2ecc71 })),
      strobeWhiteMat: markShared(new THREE.MeshBasicMaterial({ color: 0xf8fafc })),
      seekerAmberMat: markShared(
        new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.16, metalness: 0.86 })
      ),
      sensorGlassMat: markShared(
        new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          roughness: 0.14,
          metalness: 0.84,
          transparent: true,
          opacity: 0.76
        })
      ),
      steelExhaustMat: markShared(
        new THREE.MeshStandardMaterial({
          color: 0x94a3b8,
          roughness: 0.32,
          metalness: 0.78,
          flatShading: true
        })
      ),
      radomeDarkMat: markShared(
        new THREE.MeshStandardMaterial({
          color: 0x1b2229,
          roughness: 0.42,
          metalness: 0.38,
          flatShading: true
        })
      ),
      ruStarMat: markShared(new THREE.MeshBasicMaterial({ color: 0xe74c3c })),

      // Emplacement materials
      sandbagTanMat: markShared(
        new THREE.MeshStandardMaterial({
          color: 0x9b8a64,
          roughness: 0.9,
          metalness: 0.04,
          flatShading: true
        })
      ),
      sandbagOliveMat: markShared(
        new THREE.MeshStandardMaterial({
          color: 0x676d49,
          roughness: 0.88,
          metalness: 0.06,
          flatShading: true
        })
      ),
      brassMat: markShared(
        new THREE.MeshStandardMaterial({
          color: 0xd4af37,
          roughness: 0.28,
          metalness: 0.82,
          flatShading: true
        })
      ),
      woodCrateMat: markShared(
        new THREE.MeshStandardMaterial({
          color: 0x5c4a2c,
          roughness: 0.85,
          metalness: 0.08,
          flatShading: true
        })
      ),
      armorGlassMat: markShared(
        new THREE.MeshStandardMaterial({
          color: 0x74b9ff,
          roughness: 0.18,
          metalness: 0.68,
          transparent: true,
          opacity: 0.68
        })
      ),

      // Jurassic Dino Mount materials
      trexHideUsMat: markShared(
        new THREE.MeshStandardMaterial({
          color: 0x455830,
          roughness: 0.76,
          metalness: 0.08,
          flatShading: true
        })
      ),
      trexHideRuMat: markShared(
        new THREE.MeshStandardMaterial({
          color: 0x4c4231,
          roughness: 0.76,
          metalness: 0.08,
          flatShading: true
        })
      ),
      raptorHideUsMat: markShared(
        new THREE.MeshStandardMaterial({
          color: 0x316638,
          roughness: 0.72,
          metalness: 0.1,
          flatShading: true
        })
      ),
      raptorHideRuMat: markShared(
        new THREE.MeshStandardMaterial({
          color: 0x3e5c2c,
          roughness: 0.72,
          metalness: 0.1,
          flatShading: true
        })
      ),
      dinoBellyMat: markShared(
        new THREE.MeshStandardMaterial({
          color: 0xb2a57c,
          roughness: 0.84,
          metalness: 0.04,
          flatShading: true
        })
      ),
      dinoRidgeMat: markShared(
        new THREE.MeshStandardMaterial({
          color: 0x242d1e,
          roughness: 0.68,
          metalness: 0.16,
          flatShading: true
        })
      ),
      raptorFeatherUsMat: markShared(
        new THREE.MeshStandardMaterial({
          color: 0x1b4d5c,
          roughness: 0.6,
          metalness: 0.16,
          flatShading: true
        })
      ),
      raptorFeatherRuMat: markShared(
        new THREE.MeshStandardMaterial({
          color: 0x7e2d1e,
          roughness: 0.6,
          metalness: 0.16,
          flatShading: true
        })
      ),
      toothIvoryMat: markShared(
        new THREE.MeshStandardMaterial({
          color: 0xf5f6fa,
          roughness: 0.34,
          metalness: 0.08,
          flatShading: true
        })
      ),
      clawKeratinMat: markShared(
        new THREE.MeshStandardMaterial({
          color: 0x181c20,
          roughness: 0.42,
          metalness: 0.32,
          flatShading: true
        })
      ),
      dinoEyeAmberMat: markShared(new THREE.MeshBasicMaterial({ color: 0xffbe2e })),
      saddleLeatherMat: markShared(
        new THREE.MeshStandardMaterial({
          color: 0x4e3019,
          roughness: 0.78,
          metalness: 0.12,
          flatShading: true
        })
      ),
      saddleSteelMat: markShared(
        new THREE.MeshStandardMaterial({
          color: 0x9aa5b1,
          roughness: 0.32,
          metalness: 0.78,
          flatShading: true
        })
      )
    };
  }
  return _shared;
}

// ============================================================================
// 1. CAS AIRCRAFT: US A-10C THUNDERBOLT II WARTHOG vs RU SU-25SM3 FROGFOOT
// ============================================================================
export function buildCasAircraftWingAndTail(ctx) {
  const {
    isUS,
    group,
    cockpitCanopyParts,
    airMat,
    airWingMat,
    darkMat,
    barrelMat,
    burnerMat,
    ordWhiteMat,
    ordOliveMat
  } = ctx;
  const getBox = ctx.getBox || _fallbackGetBox;
  const getCyl = ctx.getCyl || _fallbackGetCyl;
  const mergeParts = ctx.mergeParts || _fallbackMergeParts;
  const s = getAirEmpShared();

  // --------------------------------------------------------------------------
  // A. Rotary / Twin Nose Cannon `barrelGroup` (pushed to `cockpitCanopyParts`)
  //    CONTRACT: barrelGroup.children[0] MUST be a CylinderGeometry Mesh at z < -6.0!
  // --------------------------------------------------------------------------
  const barrelGroup = new THREE.Group();
  if (isUS) {
    // Primary GAU-8/A Avenger 30mm core tube (children[0] CylinderGeometry at z = -6.55)
    const gauCore = new THREE.Mesh(s.gauCoreCylGeo, barrelMat);
    gauCore.rotation.x = Math.PI / 2;
    gauCore.position.set(-0.04, 0.96, -6.55);
    gauCore.castShadow = true;
    barrelGroup.add(gauCore);

    // 6 surrounding 30mm rotary barrels + dual heavy muzzle clamps
    const rotaryClusterGeo = getCachedMergedGeo('a10_gau8_rotary_cluster', mergeParts, () => {
      const p = [];
      const subTube = getCyl(0.032, 0.032, 1.62, 6);
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2;
        p.push({
          geo: subTube,
          pos: [-0.04 + Math.cos(ang) * 0.105, 0.96 + Math.sin(ang) * 0.105, -6.52],
          rot: [Math.PI / 2, 0, 0]
        });
      }
      const clampRing = getCyl(0.165, 0.165, 0.08, 10);
      p.push({ geo: clampRing, pos: [-0.04, 0.96, -7.22], rot: [Math.PI / 2, 0, 0] });
      p.push({ geo: clampRing, pos: [-0.04, 0.96, -6.78], rot: [Math.PI / 2, 0, 0] });
      return p;
    });
    barrelGroup.add(new THREE.Mesh(rotaryClusterGeo, barrelMat));

    // Ventilated gun-gas deflector shroud & offset chin cannon fairing
    const shroudGeo = getCachedMergedGeo('a10_gau8_shroud', mergeParts, () => [
      { geo: getCyl(0.2, 0.23, 0.95, 10), pos: [-0.04, 0.97, -5.92], rot: [Math.PI / 2, 0, 0] },
      { geo: getBox(0.42, 0.28, 1.35), pos: [-0.04, 1.0, -5.35], rot: [0.05, 0, 0] }
    ]);
    barrelGroup.add(new THREE.Mesh(shroudGeo, darkMat));
  } else {
    // Primary GSh-30-2 30mm Gast-principle barrel #1 (children[0] CylinderGeometry at z = -6.55)
    const gshPrimary = new THREE.Mesh(s.gshCoreCylGeo, barrelMat);
    gshPrimary.rotation.x = Math.PI / 2;
    gshPrimary.position.set(-0.26, 0.94, -6.55);
    gshPrimary.castShadow = true;
    barrelGroup.add(gshPrimary);

    // Parallel second 30mm barrel + heavy muzzle blast collar & port ventral gun blister
    const gshTwinGeo = getCachedMergedGeo('su25_gsh30_twin', mergeParts, () => [
      { geo: getCyl(0.08, 0.092, 1.52, 8), pos: [-0.13, 0.94, -6.5], rot: [Math.PI / 2, 0, 0] },
      { geo: getBox(0.28, 0.14, 0.18), pos: [-0.195, 0.94, -7.12], rot: [0, 0, 0] },
      { geo: getBox(0.34, 0.24, 1.45), pos: [-0.195, 0.98, -5.45], rot: [0.04, 0, 0] }
    ]);
    barrelGroup.add(new THREE.Mesh(gshTwinGeo, darkMat));
  }
  group.add(barrelGroup);
  if (Array.isArray(cockpitCanopyParts) && !cockpitCanopyParts.includes(barrelGroup)) {
    cockpitCanopyParts.push(barrelGroup);
  }

  // --------------------------------------------------------------------------
  // B. Forward Fuselage Armor / Sensor Details at z < -2.0
  //    CONTRACT: ALL meshes with worldPos.z < -2.0 MUST hide in 1P Cockpit!
  // --------------------------------------------------------------------------
  const forwardNoseGroup = new THREE.Group();
  forwardNoseGroup.position.set(0, 0, -3.4);
  if (isUS) {
    // Titanium Bathtub armored cheek chines + offset starboard AN/AAS-35 Pave Penny pod (local z relative to -3.4)
    const bathtubGeo = getCachedMergedGeo('a10_forward_bathtub', mergeParts, () => [
      // Left & right Titanium Bathtub armored lower cockpit cheek chines (world z = -3.35)
      { geo: getBox(0.18, 0.48, 2.35), pos: [-0.66, 1.24, 0.05], rot: [0, 0, 0.14] },
      { geo: getBox(0.18, 0.48, 2.35), pos: [0.66, 1.24, 0.05], rot: [0, 0, -0.14] },
      // Forward cockpit armored coaming & nose RWR blisters (world z = -4.55)
      { geo: getBox(0.84, 0.22, 0.95), pos: [0, 1.52, -1.05], rot: [0.16, 0, 0] },
      // Starboard Pave Penny curved L-pylon & cylindrical pod body (world z = -4.65)
      { geo: getBox(0.28, 0.12, 0.36), pos: [0.56, 1.04, -1.2], rot: [0, 0, -0.35] },
      { geo: getCyl(0.13, 0.13, 1.08, 8), pos: [0.72, 0.94, -1.25], rot: [Math.PI / 2, 0, 0] }
    ]);
    const bathtubMesh = new THREE.Mesh(bathtubGeo, airMat);
    bathtubMesh.position.set(0, 0, 0);
    forwardNoseGroup.add(bathtubMesh);

    const paveSeeker = new THREE.Mesh(getCyl(0.11, 0.125, 0.16, 8), s.seekerAmberMat);
    paveSeeker.rotation.x = Math.PI / 2;
    paveSeeker.position.set(0.72, 0.94, -1.82); // world z = -5.22
    forwardNoseGroup.add(paveSeeker);

    const pitot = new THREE.Mesh(getCyl(0.018, 0.024, 0.72, 6), darkMat);
    pitot.rotation.x = Math.PI / 2;
    pitot.position.set(0.46, 1.18, -2.15); // world z = -5.55
    forwardNoseGroup.add(pitot);
  } else {
    // Su-25SM3 armored flat side cockpit plates, chisel nose & twin pitot probes
    const frogNoseGeo = getCachedMergedGeo('su25_forward_armor', mergeParts, () => [
      { geo: getBox(0.16, 0.52, 2.25), pos: [-0.62, 1.28, 0.1], rot: [0, 0, 0.12] },
      { geo: getBox(0.16, 0.52, 2.25), pos: [0.62, 1.28, 0.1], rot: [0, 0, -0.12] },
      // Chisel nose upper flat slope (world z = -5.15)
      { geo: getBox(0.56, 0.24, 1.15), pos: [0, 1.28, -1.65], rot: [0.22, 0, 0] }
    ]);
    forwardNoseGroup.add(new THREE.Mesh(frogNoseGeo, airMat));

    // Klyon-PS / SOLT-25 chisel-nose laser rangefinder optical window
    const klyonWindow = new THREE.Mesh(getBox(0.32, 0.2, 0.24), s.sensorGlassMat);
    klyonWindow.position.set(0, 1.22, -2.35); // world z = -5.75
    klyonWindow.rotation.x = 0.38;
    forwardNoseGroup.add(klyonWindow);

    // Twin asymmetric Frogfoot nose pitot probes & forward engine intake splitter lips
    const frogProbesGeo = getCachedMergedGeo('su25_forward_probes', mergeParts, () => [
      { geo: getCyl(0.018, 0.025, 0.88, 6), pos: [-0.18, 1.38, -2.65], rot: [Math.PI / 2, 0, 0] },
      { geo: getCyl(0.018, 0.025, 0.76, 6), pos: [0.18, 1.34, -2.58], rot: [Math.PI / 2, 0, 0] }
    ]);
    forwardNoseGroup.add(new THREE.Mesh(frogProbesGeo, darkMat));
  }
  group.add(forwardNoseGroup);
  if (Array.isArray(cockpitCanopyParts)) {
    cockpitCanopyParts.push(forwardNoseGroup);
  }

  // --------------------------------------------------------------------------
  // C. Wings, Nacelles, Empennage & Heavy CAS Ordnance (ALL z >= -1.95!)
  // --------------------------------------------------------------------------
  const rudders = [];
  let leftAileron = null;
  let rightAileron = null;
  let elevator = null;

  if (isUS) {
    // 1. Thick straight unswept low wings (z = -0.25) + downturned wingtip fairings + H-tail + nacelles + sponsons + 6 pylons
    const wingAndTailGeo = getCachedMergedGeo('a10_wing_nacelle_tail', mergeParts, () => {
      const p = [];
      // Main thick straight unswept wingplank + center wing-box fillet
      p.push({ geo: getBox(12.35, 0.25, 2.18), pos: [0, 1.22, -0.25], rot: [0, 0, 0] });
      p.push({ geo: getBox(2.9, 0.18, 2.45), pos: [0, 1.12, -0.2], rot: [0, 0, 0] });

      for (const side of [-1, 1]) {
        // Signature downturned curved Hoerner wingtip fairings
        p.push({
          geo: getBox(0.42, 0.22, 2.14),
          pos: [side * 6.28, 1.15, -0.24],
          rot: [0, 0, -side * 0.48]
        });
        p.push({
          geo: getBox(0.16, 0.42, 1.92),
          pos: [side * 6.42, 0.96, -0.2],
          rot: [0, 0, -side * 0.18]
        });

        // Underwing main-gear wheel sponsons (z = -0.35 >= -1.95!)
        p.push({ geo: getBox(0.56, 0.44, 1.98), pos: [side * 1.52, 0.96, -0.35], rot: [0, 0, 0] });
        p.push({
          geo: getCyl(0.24, 0.27, 0.42, 8),
          pos: [side * 1.52, 0.96, -1.36],
          rot: [Math.PI / 2, 0, 0]
        });

        // 6 Underwing Ordnance Pylons (3 per wing at x = ±2.45, ±3.75, ±4.95; z = -0.25)
        for (const px of [2.45, 3.75, 4.95]) {
          p.push({
            geo: getBox(0.14, 0.34, 1.32),
            pos: [side * px, 0.98, -0.25],
            rot: [0, 0, 0]
          });
        }

        // Angled fuselage engine pylons + High-mounted tilted TF34 high-bypass turbofan nacelles (y = 2.04, z = 2.1)
        p.push({
          geo: getBox(0.76, 0.22, 1.48),
          pos: [side * 0.74, 1.78, 2.08],
          rot: [0.07, 0, side * 0.42]
        });
        p.push({
          geo: getCyl(0.58, 0.54, 2.55, 12),
          pos: [side * 1.2, 2.04, 2.1],
          rot: [Math.PI / 2 + 0.06, 0, 0]
        });
        // Sculpted TF34 intake lip ring
        p.push({
          geo: getCyl(0.56, 0.6, 0.32, 12),
          pos: [side * 1.2, 2.11, 0.82],
          rot: [Math.PI / 2 + 0.06, 0, 0]
        });

        // Twin H-tail extension booms & twin vertical stabilizers + fin-tip RWR pods
        p.push({ geo: getBox(0.22, 1.78, 1.52), pos: [side * 2.22, 2.18, 3.82], rot: [0, 0, 0] });
        p.push({
          geo: getCyl(0.08, 0.08, 0.88, 8),
          pos: [side * 2.22, 3.08, 3.82],
          rot: [Math.PI / 2, 0, 0]
        });
      }

      // Wide H-tail horizontal stabilizer + tailcone RWR fairing
      p.push({ geo: getBox(4.56, 0.18, 1.28), pos: [0, 1.58, 3.82], rot: [0, 0, 0] });
      p.push({ geo: getCyl(0.18, 0.34, 0.85, 8), pos: [0, 1.38, 4.65], rot: [Math.PI / 2, 0, 0] });
      return p;
    });
    const wingAndTailMesh = new THREE.Mesh(wingAndTailGeo, airWingMat);
    wingAndTailMesh.castShadow = true;
    wingAndTailMesh.receiveShadow = true;
    group.add(wingAndTailMesh);

    // 2. Dark recessed TF34 turbofan fan-faces, core exhaust cones, LAU-131 rocket tube faces & flap tracks
    const darkDetailsGeo = getCachedMergedGeo('a10_dark_engine_ord', mergeParts, () => {
      const p = [];
      for (const side of [-1, 1]) {
        // Recessed TF34 front fan disc + central spinner cone
        p.push({
          geo: getCyl(0.49, 0.49, 0.14, 12),
          pos: [side * 1.2, 2.11, 0.74],
          rot: [Math.PI / 2 + 0.06, 0, 0]
        });
        p.push({
          geo: getCyl(0.04, 0.15, 0.28, 8),
          pos: [side * 1.2, 2.12, 0.64],
          rot: [-Math.PI / 2 - 0.06, 0, 0]
        });
        // Rear core exhaust cone extending out of bypass cowling
        p.push({
          geo: getCyl(0.32, 0.44, 0.62, 10),
          pos: [side * 1.2, 1.96, 3.55],
          rot: [Math.PI / 2 + 0.06, 0, 0]
        });
        // LAU-131 7-tube Hydra-70 perforated front & rear faces (at ±3.75)
        p.push({
          geo: getCyl(0.21, 0.21, 0.08, 10),
          pos: [side * 3.75, 0.74, -1.04],
          rot: [Math.PI / 2, 0, 0]
        });
        p.push({
          geo: getCyl(0.2, 0.2, 0.08, 10),
          pos: [side * 3.75, 0.74, 0.54],
          rot: [Math.PI / 2, 0, 0]
        });
        // LAU-88 triple-rail Maverick adapter rack (at ±2.45)
        p.push({ geo: getBox(0.44, 0.14, 1.18), pos: [side * 2.45, 0.82, -0.25], rot: [0, 0, 0] });
      }
      // AN/ALQ-184 ECM pod front/rear dark radome caps (port outer -4.95) & LITENING AT pod sensor head (+4.95)
      p.push({ geo: getCyl(0.12, 0.16, 0.34, 8), pos: [-4.95, 0.76, -1.2], rot: [-Math.PI / 2, 0, 0] });
      p.push({ geo: getCyl(0.14, 0.16, 0.28, 8), pos: [-4.95, 0.76, 0.7], rot: [Math.PI / 2, 0, 0] });
      p.push({ geo: getCyl(0.17, 0.17, 1.72, 10), pos: [4.95, 0.76, -0.22], rot: [Math.PI / 2, 0, 0] });
      return p;
    });
    group.add(new THREE.Mesh(darkDetailsGeo, darkMat));

    // Subtle TF34 core turbine glow
    const glowGeo = getCachedMergedGeo('a10_core_glow', mergeParts, () => [
      { geo: getCyl(0.24, 0.24, 0.12, 8), pos: [-1.2, 1.95, 3.82], rot: [Math.PI / 2, 0, 0] },
      { geo: getCyl(0.24, 0.24, 0.12, 8), pos: [1.2, 1.95, 3.82], rot: [Math.PI / 2, 0, 0] }
    ]);
    group.add(new THREE.Mesh(glowGeo, burnerMat));

    // 3. Olive Ordnance: LAU-131 7-tube Hydra-70 pods (±3.75) + AN/ALQ-184 ECM pod (-4.95)
    const oliveOrdGeo = getCachedMergedGeo('a10_olive_ord', mergeParts, () => [
      { geo: getCyl(0.22, 0.22, 1.54, 10), pos: [-3.75, 0.74, -0.25], rot: [Math.PI / 2, 0, 0] },
      { geo: getCyl(0.22, 0.22, 1.54, 10), pos: [3.75, 0.74, -0.25], rot: [Math.PI / 2, 0, 0] },
      { geo: getBox(0.32, 0.28, 1.66), pos: [-4.95, 0.76, -0.25], rot: [0, 0, 0] }
    ]);
    group.add(new THREE.Mesh(oliveOrdGeo, ordOliveMat));

    // 4. White Ordnance: Triple-rail AGM-65 Maverick missiles (3 per side at ±2.45) with delta wings
    const maverickGeo = getCachedMergedGeo('a10_maverick_triples', mergeParts, () => {
      const p = [];
      const offsets = [
        [0, -0.1],
        [-0.2, -0.24],
        [0.2, -0.24]
      ];
      for (const side of [-1, 1]) {
        for (const [ox, oy] of offsets) {
          const mx = side * 2.45 + ox;
          const my = 0.84 + oy;
          p.push({ geo: getCyl(0.115, 0.115, 1.52, 8), pos: [mx, my, -0.22], rot: [Math.PI / 2, 0, 0] });
          // Cruciform Maverick delta wings & tail control fins
          p.push({ geo: getBox(0.42, 0.03, 0.56), pos: [mx, my, 0.05], rot: [0, 0, 0] });
          p.push({ geo: getBox(0.03, 0.42, 0.56), pos: [mx, my, 0.05], rot: [0, 0, 0] });
        }
      }
      return p;
    });
    group.add(new THREE.Mesh(maverickGeo, ordWhiteMat));

    // Optical electro-optical seeker noses on all 6 AGM-65 Mavericks + LITENING lens
    const mavSeekerGeo = getCachedMergedGeo('a10_mav_seekers', mergeParts, () => {
      const p = [];
      const offsets = [
        [0, -0.1],
        [-0.2, -0.24],
        [0.2, -0.24]
      ];
      for (const side of [-1, 1]) {
        for (const [ox, oy] of offsets) {
          p.push({
            geo: getCyl(0.07, 0.112, 0.16, 8),
            pos: [side * 2.45 + ox, 0.84 + oy, -1.04],
            rot: [-Math.PI / 2, 0, 0]
          });
        }
      }
      p.push({ geo: getCyl(0.12, 0.16, 0.18, 8), pos: [4.95, 0.76, -1.14], rot: [-Math.PI / 2, 0, 0] });
      return p;
    });
    group.add(new THREE.Mesh(mavSeekerGeo, s.seekerAmberMat));

    // Wingtip Navigation Lights (Port Red, Starboard Green)
    const portNav = new THREE.Mesh(getBox(0.1, 0.1, 0.24), s.navRedMat);
    portNav.position.set(-6.48, 1.04, -0.45);
    const stbdNav = new THREE.Mesh(getBox(0.1, 0.1, 0.24), s.navGreenMat);
    stbdNav.position.set(6.48, 1.04, -0.45);
    group.add(portNav, stbdNav);

    // Movable Control Surfaces (A-10C)
    for (const side of [-1, 1]) {
      const rudder = new THREE.Mesh(getBox(0.14, 1.44, 0.44), darkMat);
      rudder.position.set(side * 2.22, 2.18, 4.72);
      group.add(rudder);
      rudders.push(rudder);
    }
    leftAileron = new THREE.Mesh(getBox(2.55, 0.12, 0.48), darkMat);
    leftAileron.position.set(-4.65, 1.21, 0.98);
    rightAileron = new THREE.Mesh(getBox(2.55, 0.12, 0.48), darkMat);
    rightAileron.position.set(4.65, 1.21, 0.98);
    elevator = new THREE.Mesh(getBox(3.9, 0.12, 0.44), darkMat);
    elevator.position.set(0, 1.58, 4.56);
    group.add(leftAileron, rightAileron, elevator);
  } else {
    // ------------------------------------------------------------------------
    // RU SUKHOI SU-25SM3 "FROGFOOT"
    // ------------------------------------------------------------------------
    // 1. Shoulder-mounted anhedral swept wings (y = 1.52, z = -0.15) + wing fences + split-petal wingtip pods
    //    + flank R-195 nacelles (x = ±0.98, y = 1.28, z = 0.55) + 8 pylons + swept single tailfin & parabrake
    const frogWingTailGeo = getCachedMergedGeo('su25_wing_nacelle_tail', mergeParts, () => {
      const p = [];
      for (const side of [-1, 1]) {
        // Anhedral swept-BACK shoulder wing panel
        p.push({
          geo: getBox(5.55, 0.21, 2.08),
          pos: [side * 3.25, 1.44, 0.32],
          rot: [0, -side * 0.16, -side * 0.075]
        });
        // 2 upper-surface aerodynamic wing fences per wing
        p.push({
          geo: getBox(0.06, 0.18, 1.95),
          pos: [side * 2.55, 1.56, 0.22],
          rot: [0, -side * 0.08, 0]
        });
        p.push({
          geo: getBox(0.06, 0.16, 1.75),
          pos: [side * 4.25, 1.44, 0.48],
          rot: [0, -side * 0.08, 0]
        });
        // Signature split-petal wingtip airbrake / ECM pods
        p.push({
          geo: getCyl(0.16, 0.14, 1.95, 8),
          pos: [side * 6.08, 1.24, 0.68],
          rot: [Math.PI / 2, 0, 0]
        });
        p.push({
          geo: getBox(0.24, 0.12, 0.52),
          pos: [side * 6.18, 1.24, 1.52],
          rot: [0, -side * 0.22, 0]
        });

        // Flank-mounted R-195 turbojet nacelles (x = ±0.98, y = 1.28, z = 0.55; front at -1.25 >= -1.95!)
        p.push({
          geo: getCyl(0.5, 0.46, 3.45, 12),
          pos: [side * 0.98, 1.28, 0.55],
          rot: [Math.PI / 2, 0, 0]
        });
        // Dorsal engine cooling scoops & UV-26 flare dispenser packs atop nacelles
        p.push({
          geo: getBox(0.26, 0.22, 1.15),
          pos: [side * 0.96, 1.78, 1.15],
          rot: [-0.08, 0, 0]
        });

        // 8 Underwing Ordnance Pylons (4 per wing at x = ±1.85, ±2.85, ±3.85, ±4.85)
        for (const [px, py] of [
          [1.85, 1.22],
          [2.85, 1.15],
          [3.85, 1.08],
          [4.85, 1.01]
        ]) {
          p.push({
            geo: getBox(0.13, 0.34, 1.28),
            pos: [side * px, py, 0.18],
            rot: [0, 0, 0]
          });
        }

        // Swept-BACK anhedral horizontal tailplanes
        p.push({
          geo: getBox(2.05, 0.15, 1.22),
          pos: [side * 1.18, 1.52, 4.02],
          rot: [0, -side * 0.26, -side * 0.06]
        });
      }

      // Tall swept single Sukhoi vertical tailfin + dorsal fillet + parabrake bullet fairing
      p.push({ geo: getBox(0.28, 0.65, 2.35), pos: [0, 1.92, 2.85], rot: [-0.22, 0, 0] });
      p.push({ geo: getBox(0.24, 2.35, 1.92), pos: [0, 2.58, 3.72], rot: [-0.14, 0, 0] });
      p.push({ geo: getCyl(0.22, 0.14, 1.38, 8), pos: [0, 1.72, 4.48], rot: [Math.PI / 2, 0, 0] });
      return p;
    });
    const frogWingMesh = new THREE.Mesh(frogWingTailGeo, airWingMat);
    frogWingMesh.castShadow = true;
    frogWingMesh.receiveShadow = true;
    group.add(frogWingMesh);

    // 2. Stainless steel R-195 heat-shield exhaust shrouds + B-8M1 20-tube rocket pods (±2.85, ±3.85)
    const steelAndPodsGeo = getCachedMergedGeo('su25_steel_shrouds_b8m1', mergeParts, () => {
      const p = [];
      for (const side of [-1, 1]) {
        // Stainless exhaust shroud collar
        p.push({
          geo: getCyl(0.45, 0.48, 0.78, 10),
          pos: [side * 0.98, 1.28, 2.48],
          rot: [Math.PI / 2, 0, 0]
        });
        // 4× B-8M1 20-tube 80mm aerodynamic rocket pods (2 per wing at ±2.85 & ±3.85)
        for (const [px, py] of [
          [2.85, 0.88],
          [3.85, 0.81]
        ]) {
          p.push({
            geo: getCyl(0.23, 0.23, 1.46, 10),
            pos: [side * px, py, -0.05],
            rot: [Math.PI / 2, 0, 0]
          });
          p.push({
            geo: getCyl(0.11, 0.23, 0.34, 10),
            pos: [side * px, py, -0.94],
            rot: [-Math.PI / 2, 0, 0]
          });
        }
      }
      return p;
    });
    group.add(new THREE.Mesh(steelAndPodsGeo, s.steelExhaustMat));

    // Dark intake mouths, B-8M1 rocket tube faces, exhaust cavities & fin-tip RWR bar
    const frogDarkGeo = getCachedMergedGeo('su25_dark_intakes', mergeParts, () => {
      const p = [];
      for (const side of [-1, 1]) {
        p.push({
          geo: getCyl(0.42, 0.42, 0.16, 10),
          pos: [side * 0.98, 1.28, -1.16],
          rot: [Math.PI / 2, 0, 0]
        });
        for (const [px, py] of [
          [2.85, 0.88],
          [3.85, 0.81]
        ]) {
          p.push({
            geo: getCyl(0.1, 0.1, 0.08, 8),
            pos: [side * px, py, -1.1],
            rot: [Math.PI / 2, 0, 0]
          });
        }
      }
      p.push({ geo: getBox(0.18, 0.12, 0.95), pos: [0, 3.76, 3.92], rot: [0, 0, 0] });
      return p;
    });
    group.add(new THREE.Mesh(frogDarkGeo, darkMat));

    // Orange R-195 turbine glow
    const frogGlowGeo = getCachedMergedGeo('su25_burner_glow', mergeParts, () => [
      { geo: getCyl(0.35, 0.35, 0.18, 10), pos: [-0.98, 1.28, 2.86], rot: [Math.PI / 2, 0, 0] },
      { geo: getCyl(0.35, 0.35, 0.18, 10), pos: [0.98, 1.28, 2.86], rot: [Math.PI / 2, 0, 0] }
    ]);
    group.add(new THREE.Mesh(frogGlowGeo, burnerMat));

    // Kh-29L heavy laser-guided ASM missiles (±1.85) + R-73 self-defense IR missiles (±4.85)
    const frogMissilesGeo = getCachedMergedGeo('su25_kh29_r73', mergeParts, () => {
      const p = [];
      for (const side of [-1, 1]) {
        // Kh-29L heavy missile body + nose canards + cruciform delta wings
        p.push({
          geo: getCyl(0.17, 0.17, 1.82, 8),
          pos: [side * 1.85, 0.92, -0.05],
          rot: [Math.PI / 2, 0, 0]
        });
        p.push({ geo: getBox(0.58, 0.035, 0.56), pos: [side * 1.85, 0.92, 0.35], rot: [0, 0, 0] });
        p.push({ geo: getBox(0.035, 0.58, 0.56), pos: [side * 1.85, 0.92, 0.35], rot: [0, 0, 0] });
        p.push({ geo: getBox(0.36, 0.03, 0.24), pos: [side * 1.85, 0.92, -0.68], rot: [0, 0, 0] });
        // R-73 agile dogfight missile on outer APU-60 rail
        p.push({
          geo: getCyl(0.08, 0.08, 1.56, 8),
          pos: [side * 4.85, 0.78, 0.02],
          rot: [Math.PI / 2, 0, 0]
        });
        p.push({ geo: getBox(0.28, 0.025, 0.34), pos: [side * 4.85, 0.78, 0.58], rot: [0, 0, 0] });
      }
      return p;
    });
    group.add(new THREE.Mesh(frogMissilesGeo, ordWhiteMat));

    // Kh-29L amber laser seeker heads + VKS Red Stars on tailfin & wings
    const khSeekersGeo = getCachedMergedGeo('su25_kh29_seekers', mergeParts, () => [
      { geo: getCyl(0.09, 0.165, 0.22, 8), pos: [-1.85, 0.92, -1.06], rot: [-Math.PI / 2, 0, 0] },
      { geo: getCyl(0.09, 0.165, 0.22, 8), pos: [1.85, 0.92, -1.06], rot: [-Math.PI / 2, 0, 0] }
    ]);
    group.add(new THREE.Mesh(khSeekersGeo, s.seekerAmberMat));

    const vksStarsGeo = getCachedMergedGeo('su25_vks_stars', mergeParts, () => [
      { geo: getCyl(0.32, 0.32, 0.27, 5), pos: [0, 2.75, 3.68], rot: [0, 0, Math.PI / 2] },
      { geo: getCyl(0.42, 0.42, 0.04, 5), pos: [-4.6, 1.46, 0.25], rot: [0, 0, 0.07] },
      { geo: getCyl(0.42, 0.42, 0.04, 5), pos: [4.6, 1.46, 0.25], rot: [0, 0, -0.07] }
    ]);
    group.add(new THREE.Mesh(vksStarsGeo, s.ruStarMat));

    // Movable Control Surfaces (Su-25SM3)
    const suRudder = new THREE.Mesh(getBox(0.16, 1.92, 0.48), darkMat);
    suRudder.position.set(0, 2.58, 4.78);
    group.add(suRudder);
    rudders.push(suRudder);

    leftAileron = new THREE.Mesh(getBox(2.35, 0.12, 0.46), darkMat);
    leftAileron.position.set(-4.55, 1.33, 1.12);
    leftAileron.rotation.z = 0.075;
    rightAileron = new THREE.Mesh(getBox(2.35, 0.12, 0.46), darkMat);
    rightAileron.position.set(4.55, 1.33, 1.12);
    rightAileron.rotation.z = -0.075;
    elevator = new THREE.Mesh(getBox(3.75, 0.12, 0.44), darkMat);
    elevator.position.set(0, 1.49, 4.58);
    group.add(leftAileron, rightAileron, elevator);
  }

  group.userData.controlSurfaces = {
    leftAileron,
    rightAileron,
    elevator,
    rudders,
    wingSpan: 6.2
  };

  return { barrelGroup };
}

// ============================================================================
// 2. STRIKE BOMBER: US F-15E STRIKE EAGLE vs RU SU-34 FULLBACK
// ============================================================================
export function buildBomberAircraftWingAndTail(ctx) {
  const {
    isUS,
    group,
    cockpitCanopyParts,
    airMat,
    airWingMat,
    darkMat,
    burnerMat,
    ordWhiteMat,
    ordOliveMat
  } = ctx;
  const getBox = ctx.getBox || _fallbackGetBox;
  const getCyl = ctx.getCyl || _fallbackGetCyl;
  const mergeParts = ctx.mergeParts || _fallbackMergeParts;
  const s = getAirEmpShared();

  // --------------------------------------------------------------------------
  // A. Forward Intakes / CFT Strakes / Duckbill Chine / Canards at z < -2.0
  //    CONTRACT: ALL meshes with worldPos.z < -2.0 MUST hide in 1P Cockpit!
  // --------------------------------------------------------------------------
  const forwardBomberGroup = new THREE.Group();
  forwardBomberGroup.position.set(0, 0, -3.2);

  if (isUS) {
    // F-15E Angled variable-ramp side intake mouths, forward CFT noses & Sniper XR / LANTIRN pods
    const eagleFwdAirGeo = getCachedMergedGeo('f15e_fwd_intakes_cft', mergeParts, () => [
      // Left & right variable-geometry Eagle forward intake cowls (world z = -2.55)
      { geo: getBox(0.64, 0.74, 1.55), pos: [-0.94, 1.28, 0.65], rot: [0.1, 0, 0.08] },
      { geo: getBox(0.64, 0.74, 1.55), pos: [0.94, 1.28, 0.65], rot: [0.1, 0, -0.08] },
      // Forward CFT nose fairings & LERX glove strakes (world z = -2.35)
      { geo: getBox(0.42, 0.54, 1.25), pos: [-1.14, 1.14, 0.85], rot: [0, -0.18, 0] },
      { geo: getBox(0.42, 0.54, 1.25), pos: [1.14, 1.14, 0.85], rot: [0, 0.18, 0] }
    ]);
    forwardBomberGroup.add(new THREE.Mesh(eagleFwdAirGeo, airMat));

    const eagleFwdDarkGeo = getCachedMergedGeo('f15e_fwd_pods_cavities', mergeParts, () => [
      // Dark variable-ramp intake cavities (world z = -3.32)
      { geo: getBox(0.52, 0.58, 0.24), pos: [-0.94, 1.25, -0.12], rot: [0.22, 0, 0.08] },
      { geo: getBox(0.52, 0.58, 0.24), pos: [0.94, 1.25, -0.12], rot: [0.22, 0, -0.08] },
      // Port AN/AAQ-33 Sniper XR faceted targeting pod (world z = -2.55)
      { geo: getBox(0.24, 0.24, 1.75), pos: [-0.88, 0.78, 0.65], rot: [0, 0, Math.PI / 4] },
      // Starboard AN/AAQ-13 LANTIRN navigation pod (world z = -2.55)
      { geo: getCyl(0.15, 0.15, 1.68, 8), pos: [0.88, 0.78, 0.65], rot: [Math.PI / 2, 0, 0] }
    ]);
    forwardBomberGroup.add(new THREE.Mesh(eagleFwdDarkGeo, darkMat));

    const sniperWindow = new THREE.Mesh(getBox(0.18, 0.18, 0.26), s.sensorGlassMat);
    sniperWindow.position.set(-0.88, 0.78, -0.28); // world z = -3.48
    sniperWindow.rotation.x = 0.35;
    forwardBomberGroup.add(sniperWindow);
  } else {
    // Su-34 Iconic wide flattened armored duckbill side-by-side nose chine + forward tandem canards!
    const fullbackFwdGeo = getCachedMergedGeo('su34_duckbill_canards', mergeParts, () => [
      // Wide side-by-side cockpit armored fuselage broadening (world z = -2.85)
      { geo: getBox(1.74, 0.74, 2.35), pos: [0, 1.38, 0.35], rot: [0.04, 0, 0] },
      // Signature wide flattened horizontal Duckbill nose chine (world z = -4.95)
      { geo: getBox(1.92, 0.22, 2.45), pos: [0, 1.22, -1.65], rot: [0.05, 0, 0] },
      { geo: getBox(1.36, 0.18, 1.55), pos: [0, 1.21, -3.15], rot: [0.06, 0, 0] },
      // Forward tandem triplane canard foreplanes (world z = -2.45)
      { geo: getBox(1.42, 0.1, 0.78), pos: [-1.28, 1.36, 0.75], rot: [0, -0.42, 0] },
      { geo: getBox(1.42, 0.1, 0.78), pos: [1.28, 1.36, 0.75], rot: [0, 0.42, 0] },
      // Blended forward LERX strakes
      { geo: getBox(0.68, 0.14, 1.65), pos: [-1.02, 1.38, 0.65], rot: [0, -0.28, 0] },
      { geo: getBox(0.68, 0.14, 1.65), pos: [1.02, 1.38, 0.65], rot: [0, 0.28, 0] }
    ]);
    forwardBomberGroup.add(new THREE.Mesh(fullbackFwdGeo, airMat));

    const suFwdDarkGeo = getCachedMergedGeo('su34_fwd_intakes_pitot', mergeParts, () => [
      // Ventral engine intake mouths (world z = -2.25)
      { geo: getBox(0.56, 0.52, 0.32), pos: [-0.74, 0.96, 0.95], rot: [0.2, 0, 0] },
      { geo: getBox(0.56, 0.52, 0.32), pos: [0.74, 0.96, 0.95], rot: [0.2, 0, 0] },
      // Nose radar supersonic pitot boom (world z = -7.1)
      { geo: getCyl(0.018, 0.03, 0.92, 6), pos: [0, 1.22, -3.95], rot: [Math.PI / 2, 0, 0] }
    ]);
    forwardBomberGroup.add(new THREE.Mesh(suFwdDarkGeo, darkMat));
  }
  group.add(forwardBomberGroup);
  if (Array.isArray(cockpitCanopyParts)) {
    cockpitCanopyParts.push(forwardBomberGroup);
  }

  // --------------------------------------------------------------------------
  // B. Mid/Aft Fuselage, Wings, Nozzles, Tails & Strike Ordnance (ALL z >= -1.95!)
  // --------------------------------------------------------------------------
  const rudders = [];
  let leftAileron = null;
  let rightAileron = null;
  let elevator = null;

  if (isUS) {
    // 1. F-15E Conformal Fuel Tanks (CFTs), cropped-delta wings (±3.25m), stabilators & twin Eagle tails
    const eagleAirframeGeo = getCachedMergedGeo('f15e_wing_cft_tails', mergeParts, () => {
      const p = [];
      for (const side of [-1, 1]) {
        // Bulged Conformal Fuel Tanks (CFTs) & side engine trunks (front at -1.85 >= -1.95!)
        p.push({ geo: getBox(0.68, 0.72, 5.45), pos: [side * 0.96, 1.24, 0.92], rot: [0, 0, 0] });
        p.push({
          geo: getCyl(0.38, 0.34, 4.95, 10),
          pos: [side * 1.16, 1.12, 0.78],
          rot: [Math.PI / 2, 0, 0]
        });

        // Swept-BACK cropped-delta Strike Eagle wing panels (panel center ±3.25m, ~11.6m span)
        p.push({
          geo: getBox(4.95, 0.19, 2.85),
          pos: [side * 3.25, 1.42, 0.95],
          rot: [0, -side * 0.32, 0]
        });
        p.push({
          geo: getBox(1.95, 0.22, 3.35),
          pos: [side * 1.65, 1.44, 0.55],
          rot: [0, -side * 0.22, 0]
        });

        // Underwing weapons pylons & LAU-128 missile rails
        p.push({ geo: getBox(0.15, 0.34, 1.55), pos: [side * 2.55, 1.14, 0.65], rot: [0, 0, 0] });
        p.push({ geo: getBox(0.36, 0.14, 1.65), pos: [side * 3.68, 1.24, 0.85], rot: [0, 0, 0] });

        // Swept-BACK dogtooth horizontal stabilators
        p.push({
          geo: getBox(2.15, 0.13, 1.45),
          pos: [side * 1.98, 1.32, 4.35],
          rot: [0, -side * 0.34, 0]
        });

        // Twin upright Eagle vertical tails + signature top mass-balance / TEWS antenna pods
        p.push({ geo: getBox(0.2, 2.04, 1.92), pos: [side * 1.06, 2.38, 3.75], rot: [0, 0, 0] });
        p.push({
          geo: getCyl(0.085, 0.085, 1.18, 8),
          pos: [side * 1.06, 3.42, 3.72],
          rot: [Math.PI / 2, 0, 0]
        });
      }
      return p;
    });
    const eagleAirMesh = new THREE.Mesh(eagleAirframeGeo, airWingMat);
    eagleAirMesh.castShadow = true;
    eagleAirMesh.receiveShadow = true;
    group.add(eagleAirMesh);

    // 2. Twin cylindrical turkey-feather F100-PW-229 afterburner nozzles + CFT bomb racks
    const eagleNozzlesGeo = getCachedMergedGeo('f15e_nozzles_racks', mergeParts, () => {
      const p = [];
      for (const side of [-1, 1]) {
        p.push({
          geo: getCyl(0.35, 0.42, 1.04, 12),
          pos: [side * 0.52, 1.3, 4.68],
          rot: [Math.PI / 2, 0, 0]
        });
        p.push({
          geo: getCyl(0.31, 0.36, 0.32, 12),
          pos: [side * 0.52, 1.3, 5.18],
          rot: [Math.PI / 2, 0, 0]
        });
        // Tangential CFT stub pylons
        p.push({ geo: getBox(0.14, 0.18, 0.65), pos: [side * 1.24, 0.88, -0.22], rot: [0, 0, 0] });
        p.push({ geo: getBox(0.14, 0.18, 0.65), pos: [side * 1.24, 0.88, 1.48], rot: [0, 0, 0] });
      }
      return p;
    });
    group.add(new THREE.Mesh(eagleNozzlesGeo, darkMat));

    // Glowing F100 afterburner cores
    const eagleBurnerGeo = getCachedMergedGeo('f15e_burner_cores', mergeParts, () => [
      { geo: getCyl(0.27, 0.29, 0.24, 10), pos: [-0.52, 1.3, 5.26], rot: [Math.PI / 2, 0, 0] },
      { geo: getCyl(0.27, 0.29, 0.24, 10), pos: [0.52, 1.3, 5.26], rot: [Math.PI / 2, 0, 0] }
    ]);
    group.add(new THREE.Mesh(eagleBurnerGeo, burnerMat));

    // 3. Heavy Strike Loadout: Tangential CFT & underwing 500lb GBU-12/JDAMs + Centerline 2,000lb GBU-28 Bunker Buster
    const eagleBombsGeo = getCachedMergedGeo('f15e_jdam_gbu28', mergeParts, () => {
      const p = [];
      for (const side of [-1, 1]) {
        // 4× Tangential CFT 500lb GBU-38 JDAMs
        for (const bz of [-0.22, 1.48]) {
          p.push({
            geo: getCyl(0.14, 0.14, 1.38, 8),
            pos: [side * 1.28, 0.74, bz],
            rot: [Math.PI / 2, 0, 0]
          });
          p.push({ geo: getBox(0.32, 0.04, 0.32), pos: [side * 1.28, 0.74, bz + 0.56], rot: [0, 0, 0] });
        }
        // 2× Underwing 500lb GBU-12 Paveway II laser-guided bombs
        p.push({
          geo: getCyl(0.16, 0.16, 1.78, 8),
          pos: [side * 2.55, 0.9, 0.38],
          rot: [Math.PI / 2, 0, 0]
        });
        p.push({ geo: getBox(0.42, 0.04, 0.42), pos: [side * 2.55, 0.9, 1.12], rot: [0, 0, 0] });
        p.push({ geo: getBox(0.04, 0.42, 0.42), pos: [side * 2.55, 0.9, 1.12], rot: [0, 0, 0] });
      }
      // Centerline 2,000lb GBU-28 Deep-Penetrator Bunker Buster!
      p.push({ geo: getCyl(0.23, 0.23, 2.68, 10), pos: [0, 0.72, 0.35], rot: [Math.PI / 2, 0, 0] });
      p.push({ geo: getCyl(0.1, 0.23, 0.46, 10), pos: [0, 0.72, -1.18], rot: [-Math.PI / 2, 0, 0] });
      p.push({ geo: getBox(0.62, 0.05, 0.52), pos: [0, 0.72, 1.48], rot: [0, 0, Math.PI / 4] });
      p.push({ geo: getBox(0.05, 0.62, 0.52), pos: [0, 0.72, 1.48], rot: [0, 0, Math.PI / 4] });
      return p;
    });
    group.add(new THREE.Mesh(eagleBombsGeo, ordOliveMat));

    // Wing-station AIM-120C AMRAAM missiles (4× on dual LAU-128 rails at ±3.52 & ±3.84)
    const amraamGeo = getCachedMergedGeo('f15e_aim120_amraams', mergeParts, () => {
      const p = [];
      for (const side of [-1, 1]) {
        for (const rx of [3.52, 3.84]) {
          p.push({
            geo: getCyl(0.075, 0.075, 1.82, 8),
            pos: [side * rx, 1.18, 0.45],
            rot: [Math.PI / 2, 0, 0]
          });
          p.push({ geo: getBox(0.28, 0.025, 0.28), pos: [side * rx, 1.18, 0.5], rot: [0, 0, 0] });
          p.push({ geo: getBox(0.26, 0.025, 0.26), pos: [side * rx, 1.18, 1.24], rot: [0, 0, 0] });
        }
      }
      return p;
    });
    group.add(new THREE.Mesh(amraamGeo, ordWhiteMat));

    // Movable Control Surfaces (F-15E)
    for (const side of [-1, 1]) {
      const rudder = new THREE.Mesh(getBox(0.14, 1.62, 0.46), darkMat);
      rudder.position.set(side * 1.06, 2.38, 4.82);
      group.add(rudder);
      rudders.push(rudder);
    }
    leftAileron = new THREE.Mesh(getBox(2.45, 0.12, 0.5), darkMat);
    leftAileron.position.set(-4.15, 1.41, 2.38);
    leftAileron.rotation.y = 0.28;
    rightAileron = new THREE.Mesh(getBox(2.45, 0.12, 0.5), darkMat);
    rightAileron.position.set(4.15, 1.41, 2.38);
    rightAileron.rotation.y = -0.28;
    elevator = new THREE.Mesh(getBox(3.75, 0.12, 0.48), darkMat);
    elevator.position.set(0, 1.32, 4.68);
    group.add(leftAileron, rightAileron, elevator);
  } else {
    // ------------------------------------------------------------------------
    // RU SUKHOI SU-34 "FULLBACK" (HELLDUCK)
    // ------------------------------------------------------------------------
    // 1. Blended LERX + ventral engine ducts + swept main wings + Koma tail-sting radar boom (z = 4.85)
    //    + swept tailplanes + twin canted Sukhoi tailfins
    const fullbackAirGeo = getCachedMergedGeo('su34_wing_sting_tails', mergeParts, () => {
      const p = [];
      for (const side of [-1, 1]) {
        // Ventral twin AL-31F engine ducts (front at -1.85 >= -1.95!) & ventral under-nacelle fins
        p.push({ geo: getBox(0.64, 0.62, 5.65), pos: [side * 0.72, 1.08, 1.02], rot: [0, 0, 0] });
        p.push({
          geo: getBox(0.1, 0.46, 1.35),
          pos: [side * 0.88, 0.68, 3.55],
          rot: [0, 0, side * 0.28]
        });

        // Swept-BACK Flanker/Fullback main strike wings
        p.push({
          geo: getBox(5.1, 0.19, 2.85),
          pos: [side * 3.3, 1.4, 0.98],
          rot: [0, -side * 0.32, 0]
        });
        p.push({
          geo: getBox(1.95, 0.22, 3.25),
          pos: [side * 1.65, 1.42, 0.62],
          rot: [0, -side * 0.22, 0]
        });

        // Underwing strike pylons
        p.push({ geo: getBox(0.15, 0.34, 1.48), pos: [side * 2.35, 1.12, 0.72], rot: [0, 0, 0] });
        p.push({ geo: getBox(0.15, 0.34, 1.48), pos: [side * 3.65, 1.12, 0.92], rot: [0, 0, 0] });

        // Swept-BACK all-moving differential tailplanes
        p.push({
          geo: getBox(2.2, 0.13, 1.45),
          pos: [side * 2.12, 1.3, 4.38],
          rot: [0, -side * 0.35, 0]
        });

        // Twin outward-canted Sukhoi tailfins
        p.push({
          geo: getBox(0.19, 1.98, 1.88),
          pos: [side * 1.08, 2.32, 3.68],
          rot: [0, 0, -side * 0.18]
        });
      }

      // Signature long rear Koma tail-sting radar / APU boom between twin nozzles (z = 4.85)
      p.push({ geo: getCyl(0.24, 0.29, 2.65, 10), pos: [0, 1.36, 4.85], rot: [Math.PI / 2, 0, 0] });
      return p;
    });
    const fullbackAirMesh = new THREE.Mesh(fullbackAirGeo, airWingMat);
    fullbackAirMesh.castShadow = true;
    fullbackAirMesh.receiveShadow = true;
    group.add(fullbackAirMesh);

    // 2. Cylindrical wingtip Khibiny (L175V) ECM pods + Kh-31P supersonic anti-radiation missiles + Koma dielectric tip
    const whitePodsMissilesGeo = getCachedMergedGeo('su34_khibiny_kh31', mergeParts, () => {
      const p = [];
      for (const side of [-1, 1]) {
        // Wingtip cylindrical Khibiny ECM pods
        p.push({
          geo: getCyl(0.16, 0.16, 2.45, 10),
          pos: [side * 5.82, 1.4, 1.18],
          rot: [Math.PI / 2, 0, 0]
        });
        p.push({
          geo: getCyl(0.06, 0.16, 0.32, 10),
          pos: [side * 5.82, 1.4, -0.18],
          rot: [-Math.PI / 2, 0, 0]
        });

        // Kh-31P "Krypton" supersonic missile with 4 distinctive side ramjet air-intake ducts!
        p.push({
          geo: getCyl(0.14, 0.14, 2.15, 8),
          pos: [side * 3.65, 0.88, 0.55],
          rot: [Math.PI / 2, 0, 0]
        });
        p.push({
          geo: getCyl(0.04, 0.14, 0.42, 8),
          pos: [side * 3.65, 0.88, -0.72],
          rot: [-Math.PI / 2, 0, 0]
        });
        // 4 side ramjet ducts on Kh-31P
        p.push({ geo: getBox(0.38, 0.1, 0.98), pos: [side * 3.65, 0.88, 0.68], rot: [0, 0, Math.PI / 4] });
        p.push({
          geo: getBox(0.1, 0.38, 0.98),
          pos: [side * 3.65, 0.88, 0.68],
          rot: [0, 0, Math.PI / 4]
        });
      }
      // Koma tail-sting white dielectric radar dome tip
      p.push({ geo: getCyl(0.1, 0.24, 0.48, 10), pos: [0, 1.36, 6.38], rot: [Math.PI / 2, 0, 0] });
      return p;
    });
    group.add(new THREE.Mesh(whitePodsMissilesGeo, ordWhiteMat));

    // 3. Twin cylindrical AL-31F nozzles + glowing cores
    const al31NozzlesGeo = getCachedMergedGeo('su34_al31_nozzles', mergeParts, () => [
      { geo: getCyl(0.34, 0.42, 1.08, 12), pos: [-0.72, 1.16, 4.38], rot: [Math.PI / 2, 0, 0] },
      { geo: getCyl(0.34, 0.42, 1.08, 12), pos: [0.72, 1.16, 4.38], rot: [Math.PI / 2, 0, 0] },
      { geo: getCyl(0.3, 0.35, 0.34, 12), pos: [-0.72, 1.16, 5.02], rot: [Math.PI / 2, 0, 0] },
      { geo: getCyl(0.3, 0.35, 0.34, 12), pos: [0.72, 1.16, 5.02], rot: [Math.PI / 2, 0, 0] }
    ]);
    group.add(new THREE.Mesh(al31NozzlesGeo, darkMat));

    const al31BurnerGeo = getCachedMergedGeo('su34_al31_burners', mergeParts, () => [
      { geo: getCyl(0.26, 0.28, 0.24, 10), pos: [-0.72, 1.16, 5.14], rot: [Math.PI / 2, 0, 0] },
      { geo: getCyl(0.26, 0.28, 0.24, 10), pos: [0.72, 1.16, 5.14], rot: [Math.PI / 2, 0, 0] }
    ]);
    group.add(new THREE.Mesh(al31BurnerGeo, burnerMat));

    // 4. Underwing KAB-500KR TV-guided bombs (±2.35) + Centerline KAB-1500LG heavy bunker-buster bomb
    const kabBombsGeo = getCachedMergedGeo('su34_kab500_kab1500', mergeParts, () => {
      const p = [];
      for (const side of [-1, 1]) {
        p.push({
          geo: getCyl(0.18, 0.18, 1.68, 8),
          pos: [side * 2.35, 0.88, 0.48],
          rot: [Math.PI / 2, 0, 0]
        });
        p.push({ geo: getBox(0.48, 0.045, 0.48), pos: [side * 2.35, 0.88, 1.12], rot: [0, 0, 0] });
        p.push({ geo: getBox(0.045, 0.48, 0.48), pos: [side * 2.35, 0.88, 1.12], rot: [0, 0, 0] });
      }
      // Centerline KAB-1500LG heavy bomb between ventral engine tunnels
      p.push({ geo: getCyl(0.27, 0.27, 2.48, 10), pos: [0, 0.7, 0.42], rot: [Math.PI / 2, 0, 0] });
      p.push({ geo: getBox(0.72, 0.055, 0.58), pos: [0, 0.7, 1.42], rot: [0, 0, Math.PI / 4] });
      p.push({ geo: getBox(0.055, 0.72, 0.58), pos: [0, 0.7, 1.42], rot: [0, 0, Math.PI / 4] });
      return p;
    });
    group.add(new THREE.Mesh(kabBombsGeo, ordOliveMat));

    const kabSeekersGeo = getCachedMergedGeo('su34_kab_seekers', mergeParts, () => [
      { geo: getCyl(0.11, 0.175, 0.22, 8), pos: [-2.35, 0.88, -0.46], rot: [-Math.PI / 2, 0, 0] },
      { geo: getCyl(0.11, 0.175, 0.22, 8), pos: [2.35, 0.88, -0.46], rot: [-Math.PI / 2, 0, 0] },
      { geo: getCyl(0.14, 0.26, 0.34, 10), pos: [0, 0.7, -0.98], rot: [-Math.PI / 2, 0, 0] }
    ]);
    group.add(new THREE.Mesh(kabSeekersGeo, s.seekerAmberMat));

    const vksStarsGeo = getCachedMergedGeo('su34_vks_stars', mergeParts, () => [
      { geo: getCyl(0.28, 0.28, 0.22, 5), pos: [-1.08, 2.45, 3.68], rot: [0, 0, Math.PI / 2 - 0.18] },
      { geo: getCyl(0.28, 0.28, 0.22, 5), pos: [1.08, 2.45, 3.68], rot: [0, 0, Math.PI / 2 + 0.18] }
    ]);
    group.add(new THREE.Mesh(vksStarsGeo, s.ruStarMat));

    // Movable Control Surfaces (Su-34)
    for (const side of [-1, 1]) {
      const rudder = new THREE.Mesh(getBox(0.14, 1.56, 0.45), darkMat);
      rudder.position.set(side * 1.08, 2.32, 4.74);
      rudder.rotation.z = -side * 0.18;
      group.add(rudder);
      rudders.push(rudder);
    }
    leftAileron = new THREE.Mesh(getBox(2.35, 0.12, 0.48), darkMat);
    leftAileron.position.set(-4.35, 1.39, 2.15);
    leftAileron.rotation.y = -0.3;
    rightAileron = new THREE.Mesh(getBox(2.35, 0.12, 0.48), darkMat);
    rightAileron.position.set(4.35, 1.39, 2.15);
    rightAileron.rotation.y = 0.3;
    elevator = new THREE.Mesh(getBox(3.7, 0.12, 0.48), darkMat);
    elevator.position.set(0, 1.3, 4.72);
    group.add(leftAileron, rightAileron, elevator);
  }

  group.userData.controlSurfaces = {
    leftAileron,
    rightAileron,
    elevator,
    rudders,
    wingSpan: 5.8
  };

  return { barrelGroup: null };
}

// ============================================================================
// 3. SQUAD FORTIFICATION EMPLACEMENTS (`emplace_aa`, `emplace_mortar`, `emplace_hmg`)
//    CRITICAL ORIENTATION: LOCAL `+Z` IS FRONT!
// ============================================================================
export function buildEmplacementModel(ctx) {
  const { cfg, isUS, group, turretPivot, hullMat, eraMat, darkMat, barrelMat } = ctx;
  const getBox = ctx.getBox || _fallbackGetBox;
  const getCyl = ctx.getCyl || _fallbackGetCyl;
  const mergeParts = ctx.mergeParts || _fallbackMergeParts;
  const s = getAirEmpShared();

  // --------------------------------------------------------------------------
  // A. Shared Fortified Base: 8-Segment Sandbagged Revetment Ring + Steel Outriggers
  // --------------------------------------------------------------------------
  const sandbagRingGeo = getCachedMergedGeo('emplace_sandbag_ring', mergeParts, () => {
    const p = [];
    const bagGeo = getBox(0.68, 0.24, 0.38);
    // 7-of-8 arc segments (leaving a neat rear entry step at +Z behind the -Z gun arc) in 2 staggered courses
    for (let course = 0; course < 2; course++) {
      const segs = 8;
      for (let i = 0; i < segs; i++) {
        const ang = (i / segs) * Math.PI * 2 + course * 0.2;
        // Keep rear +Z entryway slightly lower on upper course for gunner access
        if (course === 1 && Math.cos(ang) > 0.82) continue;
        const r = 1.24;
        p.push({
          geo: bagGeo,
          pos: [Math.sin(ang) * r, 0.13 + course * 0.22, Math.cos(ang) * r],
          rot: [0, ang, (i % 2 === 0 ? 1 : -1) * 0.03]
        });
      }
    }
    return p;
  });
  const sandbagRing = new THREE.Mesh(sandbagRingGeo, isUS ? s.sandbagTanMat : s.sandbagOliveMat);
  sandbagRing.castShadow = true;
  sandbagRing.receiveShadow = true;
  group.add(sandbagRing);

  const pedestalOutriggersGeo = getCachedMergedGeo('emplace_steel_outriggers', mergeParts, () => {
    const p = [
      // Central azimuth ring pedestal & base flange
      { geo: getCyl(0.42, 0.56, 0.68, 10), pos: [0, 0.34, 0], rot: [0, 0, 0] },
      { geo: getCyl(0.5, 0.5, 0.12, 12), pos: [0, 0.72, 0], rot: [0, 0, 0] }
    ];
    // 4 splayed heavy steel outrigger legs + circular leveling pads
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const sx = Math.sin(ang);
      const sz = Math.cos(ang);
      p.push({
        geo: getBox(0.14, 0.12, 0.92),
        pos: [sx * 0.62, 0.14, sz * 0.62],
        rot: [0.16, ang, 0]
      });
      p.push({
        geo: getCyl(0.18, 0.2, 0.07, 8),
        pos: [sx * 1.02, 0.04, sz * 1.02],
        rot: [0, 0, 0]
      });
    }
    return p;
  });
  const outriggersMesh = new THREE.Mesh(pedestalOutriggersGeo, darkMat);
  outriggersMesh.castShadow = true;
  group.add(outriggersMesh);

  turretPivot.position.set(0, 0.95, 0);
  const barrelGroup = new THREE.Group();

  if (cfg.type === 'emplace_aa') {
    // ------------------------------------------------------------------------
    // ZU-23-2 TWIN 23MM ANTI-AIR AUTOCANNON + 4-TUBE STINGER/IGLA SAM POD
    // ------------------------------------------------------------------------
    const carriageGeo = getCachedMergedGeo('emplace_aa_carriage', mergeParts, () => [
      // Turntable bed & twin side trunnion cheeks
      { geo: getBox(1.18, 0.22, 1.38), pos: [0, -0.08, -0.05], rot: [0, 0, 0] },
      { geo: getBox(0.16, 0.58, 0.86), pos: [-0.46, 0.22, 0.12], rot: [0, 0, 0] },
      { geo: getBox(0.16, 0.58, 0.86), pos: [0.46, 0.22, 0.12], rot: [0, 0, 0] },
      // Frontal angled splinter shield
      { geo: getBox(1.14, 0.46, 0.08), pos: [0, 0.24, 0.58], rot: [-0.26, 0, 0] }
    ]);
    const carriageMesh = new THREE.Mesh(carriageGeo, hullMat);
    carriageMesh.castShadow = true;
    turretPivot.add(carriageMesh);

    // Gunner bucket seat (-Z), elevation/traverse handwheels & ZAP-23 optical reflex AA sight
    const aaControlsGeo = getCachedMergedGeo('emplace_aa_seat_controls', mergeParts, () => [
      // Contoured gunner bucket seat pan + angled backrest + footrest pedals
      { geo: getBox(0.46, 0.09, 0.44), pos: [-0.18, 0.04, -0.52], rot: [-0.08, 0, 0] },
      { geo: getBox(0.44, 0.46, 0.09), pos: [-0.18, 0.28, -0.74], rot: [-0.22, 0, 0] },
      { geo: getBox(0.52, 0.06, 0.28), pos: [0, -0.14, -0.22], rot: [0, 0, 0] },
      // Left & right elevation/traverse handwheels
      { geo: getCyl(0.16, 0.16, 0.04, 10, Math.PI / 2), pos: [-0.58, 0.26, -0.18], rot: [0, 0, 0] },
      { geo: getCyl(0.16, 0.16, 0.04, 10), pos: [0.34, 0.16, -0.32], rot: [0.45, 0, 0] },
      // ZAP-23 optical reflex AA sight post & collimator mount
      { geo: getBox(0.12, 0.28, 0.18), pos: [-0.18, 0.54, -0.12], rot: [0, 0, 0] }
    ]);
    turretPivot.add(new THREE.Mesh(aaControlsGeo, darkMat));

    const aaSightLens = new THREE.Mesh(getBox(0.14, 0.14, 0.03), s.armorGlassMat);
    aaSightLens.position.set(-0.18, 0.68, -0.08);
    aaSightLens.rotation.x = -0.32;
    turretPivot.add(aaSightLens);

    // Twin side 23mm box magazines + 4-tube Stinger/Igla SAM launcher pod in barrelGroup
    const ammoAndSamGeo = getCachedMergedGeo('emplace_aa_ammo_sampod', mergeParts, () => [
      // Left & right 50-round 23mm ammo boxes
      { geo: getBox(0.24, 0.38, 0.48), pos: [-0.42, 0.2, 0.18], rot: [0, 0, 0] },
      { geo: getBox(0.24, 0.38, 0.48), pos: [0.42, 0.2, 0.18], rot: [0, 0, 0] },
      // Starboard 4-tube Stinger/Igla SAM launcher pod housing
      { geo: getBox(0.42, 0.44, 1.32), pos: [0.72, 0.28, 0.26], rot: [0, 0, 0] },
      // Argon BCU coolant cylinder under SAM pod
      { geo: getCyl(0.075, 0.075, 0.28, 8), pos: [0.72, 0.02, 0.58], rot: [Math.PI / 2, 0, 0] }
    ]);
    barrelGroup.add(new THREE.Mesh(ammoAndSamGeo, eraMat));

    // Twin fluted 23mm 2A14 barrels + recoil springs + conical flash hiders (+Z) + 4 SAM tube mouths
    const aaBarrelsGeo = getCachedMergedGeo('emplace_aa_barrels', mergeParts, () => {
      const p = [];
      for (const side of [-1, 1]) {
        const bx = side * 0.22;
        // Breech & recoil spring cylinder
        p.push({ geo: getBox(0.18, 0.22, 0.68), pos: [bx, 0.18, 0.12], rot: [0, 0, 0] });
        p.push({ geo: getCyl(0.088, 0.095, 0.56, 8), pos: [bx, 0.18, 0.68], rot: [Math.PI / 2, 0, 0] });
        // Long fluted 23mm barrel (+Z)
        p.push({ geo: getCyl(0.058, 0.072, 2.15, 8), pos: [bx, 0.18, 1.48], rot: [Math.PI / 2, 0, 0] });
        // Conical flash hider flaring toward +Z!
        p.push({
          geo: getCyl(0.095, 0.056, 0.28, 8),
          pos: [bx, 0.18, 2.64],
          rot: [Math.PI / 2, 0, 0]
        });
      }
      // 4 SAM launch tube mouths inside pod
      for (const [ox, oy] of [
        [-0.1, 0.1],
        [0.1, 0.1],
        [-0.1, -0.1],
        [0.1, -0.1]
      ]) {
        p.push({
          geo: getCyl(0.075, 0.075, 1.36, 8),
          pos: [0.72 + ox, 0.28 + oy, 0.26],
          rot: [Math.PI / 2, 0, 0]
        });
      }
      return p;
    });
    const aaBarrelsMesh = new THREE.Mesh(aaBarrelsGeo, barrelMat);
    aaBarrelsMesh.castShadow = true;
    barrelGroup.add(aaBarrelsMesh);

    barrelGroup.rotation.x = -0.32;
    turretPivot.add(barrelGroup);
  } else if (cfg.type === 'emplace_mortar') {
    // ------------------------------------------------------------------------
    // 81MM M252 (US) / 82MM 2B14 PODNOS (RU) INDIRECT-FIRE MORTAR PIT
    // ------------------------------------------------------------------------
    // Stationary open olive ammo crate + 3 brass-finned 81mm HE shells inside the sandbag pit
    const ammoCrateMesh = new THREE.Mesh(getBox(0.68, 0.28, 0.46), s.woodCrateMat);
    ammoCrateMesh.position.set(-0.68, 0.16, -0.18);
    ammoCrateMesh.rotation.y = 0.28;
    ammoCrateMesh.castShadow = true;
    group.add(ammoCrateMesh);

    const shellsBrassGeo = getCachedMergedGeo('emplace_mortar_shells', mergeParts, () => {
      const p = [];
      for (const sx of [-0.18, 0, 0.18]) {
        // Teardrop HE mortar bomb body + tail boom + 4 stabilizer fins
        p.push({ geo: getCyl(0.042, 0.055, 0.34, 8), pos: [sx, 0.33, 0.02], rot: [Math.PI / 2, 0, 0] });
        p.push({ geo: getCyl(0.018, 0.045, 0.14, 8), pos: [sx, 0.33, 0.24], rot: [Math.PI / 2, 0, 0] });
        p.push({ geo: getBox(0.11, 0.018, 0.1), pos: [sx, 0.33, -0.18], rot: [0, 0, 0] });
        p.push({ geo: getBox(0.018, 0.11, 0.1), pos: [sx, 0.33, -0.18], rot: [0, 0, 0] });
      }
      return p;
    });
    const shellsMesh = new THREE.Mesh(shellsBrassGeo, s.brassMat);
    shellsMesh.position.set(-0.68, 0, -0.18);
    shellsMesh.rotation.y = 0.28;
    group.add(shellsMesh);

    // Heavy ribbed circular M252/2B14 steel baseplate under turretPivot
    const baseplateGeo = getCachedMergedGeo('emplace_mortar_baseplate', mergeParts, () => {
      const p = [
        { geo: getCyl(0.76, 0.86, 0.14, 12), pos: [0, -0.54, -0.06], rot: [0, 0, 0] },
        { geo: getCyl(0.22, 0.26, 0.2, 8), pos: [0, -0.44, -0.06], rot: [0, 0, 0] }
      ];
      for (let r = 0; r < 4; r++) {
        p.push({
          geo: getBox(1.52, 0.09, 0.09),
          pos: [0, -0.47, -0.06],
          rot: [0, (r * Math.PI) / 4, 0]
        });
      }
      return p;
    });
    turretPivot.add(new THREE.Mesh(baseplateGeo, eraMat));

    // Finned cooling-ring 81mm mortar tube (rotation.x = 0.52 tilts muzzle upward & forward toward +Z!)
    const finnedTubeGeo = getCachedMergedGeo('emplace_mortar_finned_tube', mergeParts, () => {
      const p = [
        { geo: getCyl(0.115, 0.132, 1.78, 12), pos: [0, 0, 0], rot: [0, 0, 0] },
        // Muzzle blast-attenuator cone / collar at +Y top of tube
        { geo: getCyl(0.15, 0.12, 0.18, 12), pos: [0, 0.86, 0], rot: [0, 0, 0] },
        // Breech spherical trunnion ball at -Y bottom
        { geo: getCyl(0.11, 0.07, 0.22, 10), pos: [0, -0.94, 0], rot: [0, 0, 0] }
      ];
      // 9 machined radial heat-dissipation cooling fins along lower half of barrel
      for (let f = 0; f < 9; f++) {
        p.push({
          geo: getCyl(0.148, 0.148, 0.026, 12),
          pos: [0, -0.68 + f * 0.09, 0],
          rot: [0, 0, 0]
        });
      }
      return p;
    });
    const mortarTube = new THREE.Mesh(finnedTubeGeo, barrelMat);
    mortarTube.position.set(0, 0.45, 0.35);
    mortarTube.rotation.x = 0.52;
    mortarTube.castShadow = true;
    barrelGroup.add(mortarTube);

    // A-frame shock-absorber bipod, horizontal traverse screw & M67 optical sight unit
    const bipodGeo = getCachedMergedGeo('emplace_mortar_bipod', mergeParts, () => [
      // Left & right A-frame bipod legs converging from ground pads to barrel clamp
      makeStrutPart(getBox, [-0.46, -0.52, 0.78], [-0.14, 0.44, 0.36], 0.065, 0.065),
      makeStrutPart(getBox, [0.46, -0.52, 0.78], [0.14, 0.44, 0.36], 0.065, 0.065),
      // Twin hydraulic recoil shock-absorber cylinders
      { geo: getCyl(0.048, 0.048, 0.34, 8), pos: [-0.11, 0.48, 0.35], rot: [0.52, 0, 0] },
      { geo: getCyl(0.048, 0.048, 0.34, 8), pos: [0.11, 0.48, 0.35], rot: [0.52, 0, 0] },
      // Horizontal traverse screw housing + handwheel crank
      { geo: getCyl(0.036, 0.036, 0.48, 8, Math.PI / 2), pos: [0, 0.24, 0.46], rot: [0, 0, 0] },
      { geo: getCyl(0.08, 0.08, 0.03, 8, Math.PI / 2), pos: [0.28, 0.24, 0.46], rot: [0, 0, 0] },
      // M67 optical sight body on left yoke
      { geo: getBox(0.12, 0.22, 0.14), pos: [-0.24, 0.46, 0.36], rot: [0, 0, 0] }
    ]);
    barrelGroup.add(new THREE.Mesh(bipodGeo, darkMat));

    const m67Lens = new THREE.Mesh(getCyl(0.04, 0.04, 0.08, 8), s.sensorGlassMat);
    m67Lens.rotation.x = Math.PI / 2;
    m67Lens.position.set(-0.24, 0.53, 0.43);
    barrelGroup.add(m67Lens);

    turretPivot.add(barrelGroup);
  } else {
    // ------------------------------------------------------------------------
    // `emplace_hmg`: .50 CAL M2HB BROWNING (US) / 12.7MM NSV UTYOS (RU) HMG NEST
    // ------------------------------------------------------------------------
    // M3 heavy tripod legs & pintle cradle on turretPivot
    const tripodGeo = getCachedMergedGeo('emplace_hmg_m3_tripod', mergeParts, () => [
      // Front leg (+Z) & twin splayed rear legs (-Z) + T&E elevation bar
      makeStrutPart(getBox, [0, 0.02, 0.08], [0, -0.52, 0.68], 0.075, 0.075),
      makeStrutPart(getBox, [-0.08, 0.02, -0.05], [-0.52, -0.52, -0.68], 0.075, 0.075),
      makeStrutPart(getBox, [0.08, 0.02, -0.05], [0.52, -0.52, -0.68], 0.075, 0.075),
      { geo: getBox(0.24, 0.16, 0.34), pos: [0, 0.04, 0.02], rot: [0, 0, 0] }
    ]);
    turretPivot.add(new THREE.Mesh(tripodGeo, darkMat));

    // Sloped faceted ballistic gun shield (+Z) with vision-slit cutout (strictly low profile <= 0.50 local Y!)
    const shieldGeo = getCachedMergedGeo('emplace_hmg_shield', mergeParts, () => [
      // Lower & upper shield plates flanking the armoured vision port
      { geo: getBox(0.76, 0.28, 0.07), pos: [0, 0.14, 0.44], rot: [-0.18, 0, 0] },
      { geo: getBox(0.76, 0.12, 0.07), pos: [0, 0.43, 0.39], rot: [-0.18, 0, 0] },
      // Left & right angled cheek armor wings
      { geo: getBox(0.36, 0.48, 0.07), pos: [-0.52, 0.25, 0.36], rot: [-0.18, 0.34, 0] },
      { geo: getBox(0.36, 0.48, 0.07), pos: [0.52, 0.25, 0.36], rot: [-0.18, -0.34, 0] }
    ]);
    const shieldMesh = new THREE.Mesh(shieldGeo, hullMat);
    shieldMesh.castShadow = true;
    turretPivot.add(shieldMesh);

    const visionSlit = new THREE.Mesh(getBox(0.46, 0.11, 0.045), s.armorGlassMat);
    visionSlit.position.set(0, 0.32, 0.41);
    visionSlit.rotation.x = -0.18;
    turretPivot.add(visionSlit);

    // Receiver, top feed cover, rear spade grips, perforated cooling jacket, heavy barrel & flash suppressor
    const hmgGunGeo = getCachedMergedGeo('emplace_hmg_receiver_barrel', mergeParts, () => [
      // Heavy boxy .50 cal M2HB / 12.7mm NSV receiver + hinged top feed cover + rear sight leaf
      { geo: getBox(0.24, 0.26, 0.88), pos: [0, 0.18, -0.02], rot: [0, 0, 0] },
      { geo: getBox(0.25, 0.07, 0.54), pos: [0, 0.33, 0.04], rot: [0, 0, 0] },
      { geo: getBox(0.08, 0.1, 0.06), pos: [0, 0.4, -0.28], rot: [0, 0, 0] },
      // Rear dual spade grips + thumb butterfly trigger (-Z)
      { geo: getCyl(0.024, 0.024, 0.24, 6), pos: [-0.11, 0.18, -0.52], rot: [0.22, 0, 0] },
      { geo: getCyl(0.024, 0.024, 0.24, 6), pos: [0.11, 0.18, -0.52], rot: [0.22, 0, 0] },
      { geo: getBox(0.24, 0.04, 0.04), pos: [0, 0.26, -0.52], rot: [0, 0, 0] },
      // Perforated barrel cooling jacket + collar rings
      { geo: getCyl(0.072, 0.078, 0.58, 10), pos: [0, 0.19, 0.68], rot: [Math.PI / 2, 0, 0] },
      // Heavy quick-change 12.7mm barrel (+Z)
      { geo: getCyl(0.044, 0.055, 1.18, 8), pos: [0, 0.19, 1.38], rot: [Math.PI / 2, 0, 0] },
      // Pronged flash suppressor / muzzle brake at +Z tip
      { geo: getCyl(0.068, 0.05, 0.22, 8), pos: [0, 0.19, 2.02], rot: [Math.PI / 2, 0, 0] }
    ]);
    const hmgGunMesh = new THREE.Mesh(hmgGunGeo, barrelMat);
    hmgGunMesh.castShadow = true;
    barrelGroup.add(hmgGunMesh);

    // Side olive ammo can + linked brass .50 BMG cartridge belt feeding into tray
    const ammoCan = new THREE.Mesh(getBox(0.22, 0.28, 0.36), eraMat);
    ammoCan.position.set(-0.28, 0.14, 0.08);
    barrelGroup.add(ammoCan);

    const beltGeo = getCachedMergedGeo('emplace_hmg_brass_belt', mergeParts, () => {
      const p = [];
      for (let c = 0; c < 6; c++) {
        const t = c / 5;
        p.push({
          geo: getCyl(0.014, 0.018, 0.12, 6),
          pos: [-0.26 + t * 0.14, 0.27 + Math.sin(t * Math.PI) * 0.05, 0.08],
          rot: [Math.PI / 2, 0, 0]
        });
      }
      return p;
    });
    barrelGroup.add(new THREE.Mesh(beltGeo, s.brassMat));

    turretPivot.add(barrelGroup);
  }

  return { barrelGroup };
}

// ============================================================================
// 4. JURASSIC RIDEABLE DINO MOUNTS (`trex_mount` & `raptor_mount`)
//    CRITICAL ORIENTATION: LOCAL `-Z` IS FRONT (Head/Snout), `+Z` IS REAR (Tail)!
// ============================================================================
export function buildDinoMountModel(ctx) {
  const { cfg, isUS, group, wheels, turretPivot } = ctx;
  const getBox = ctx.getBox || _fallbackGetBox;
  const getCyl = ctx.getCyl || _fallbackGetCyl;
  const mergeParts = ctx.mergeParts || _fallbackMergeParts;
  const sc = getAirEmpShared();

  const isTRex = cfg.type === 'trex_mount';
  const s = isTRex ? 2.85 : 1.95;
  const skinMat = isTRex
    ? isUS
      ? sc.trexHideUsMat
      : sc.trexHideRuMat
    : isUS
    ? sc.raptorHideUsMat
    : sc.raptorHideRuMat;
  const featherMat = isUS ? sc.raptorFeatherUsMat : sc.raptorFeatherRuMat;

  // --------------------------------------------------------------------------
  // A. Muscular Torso, Tapered Waist, Multi-Segment Tail & Forelimbs (`skinMat`)
  // --------------------------------------------------------------------------
  const torsoKey = isTRex ? 'dino_trex_torso_tail_arms' : 'dino_raptor_torso_tail_arms';
  const torsoTailArmsGeo = getCachedMergedGeo(torsoKey, mergeParts, () => {
    const p = [];
    // Broad muscular forward chest (-Z) + tapered muscular hip/pelvis (+Z)
    p.push({
      geo: getBox((isTRex ? 1.18 : 0.86) * s, (isTRex ? 1.12 : 0.88) * s, 1.42 * s),
      pos: [0, 1.48 * s, -0.45 * s],
      rot: [-0.16, 0, 0]
    });
    p.push({
      geo: getBox((isTRex ? 1.02 : 0.76) * s, (isTRex ? 0.98 : 0.8) * s, 1.24 * s),
      pos: [0, 1.42 * s, 0.62 * s],
      rot: [-0.06, 0, 0]
    });

    // 4-Segment smoothly tapering counterbalance tail extending along +Z
    const tailSegs = [
      [0.82, 0.78, 0.98, 1.41, 1.56, -0.04],
      [0.62, 0.58, 1.02, 1.39, 2.42, 0.02],
      [0.42, 0.38, 1.04, 1.41, 3.28, 0.06],
      [0.22, 0.2, 1.08, 1.46, 4.12, 0.09]
    ];
    const widthScale = isTRex ? 1.0 : 0.72;
    for (const [tw, th, tl, ty, tz, rx] of tailSegs) {
      p.push({
        geo: getBox(tw * widthScale * s, th * widthScale * s, tl * s),
        pos: [0, ty * s, tz * s],
        rot: [rx, 0, 0]
      });
    }

    // Articulated Forelimbs (compact 2-fingered T-Rex arms vs long grasping 3-fingered Raptor arms)
    for (const side of [-1, 1]) {
      if (isTRex) {
        const sx = side * 0.58 * s;
        p.push({
          geo: getBox(0.18 * s, 0.38 * s, 0.2 * s),
          pos: [sx, 1.14 * s, -0.92 * s],
          rot: [0.42, 0, -side * 0.15]
        });
        p.push({
          geo: getBox(0.14 * s, 0.32 * s, 0.15 * s),
          pos: [sx, 0.94 * s, -1.12 * s],
          rot: [1.05, 0, -side * 0.08]
        });
      } else {
        const sx = side * 0.46 * s;
        p.push({
          geo: getBox(0.16 * s, 0.52 * s, 0.18 * s),
          pos: [sx, 1.16 * s, -0.88 * s],
          rot: [0.38, 0, -side * 0.18]
        });
        p.push({
          geo: getBox(0.13 * s, 0.54 * s, 0.15 * s),
          pos: [sx * 1.06, 0.92 * s, -1.18 * s],
          rot: [1.18, 0, -side * 0.12]
        });
      }
    }
    return p;
  });
  const torsoMesh = new THREE.Mesh(torsoTailArmsGeo, skinMat);
  torsoMesh.castShadow = true;
  torsoMesh.receiveShadow = true;
  group.add(torsoMesh);

  // Pale Ventral Belly Scute Plates
  const bellyGeo = getCachedMergedGeo(isTRex ? 'trex_belly' : 'raptor_belly', mergeParts, () => [
    {
      geo: getBox((isTRex ? 1.04 : 0.74) * s, 0.32 * s, 1.38 * s),
      pos: [0, 1.02 * s, -0.42 * s],
      rot: [-0.16, 0, 0]
    },
    {
      geo: getBox((isTRex ? 0.88 : 0.64) * s, 0.28 * s, 1.16 * s),
      pos: [0, 1.02 * s, 0.58 * s],
      rot: [-0.05, 0, 0]
    },
    {
      geo: getBox((isTRex ? 0.58 : 0.42) * s, 0.2 * s, 1.45 * s),
      pos: [0, 1.14 * s, 1.75 * s],
      rot: [0.02, 0, 0]
    }
  ]);
  group.add(new THREE.Mesh(bellyGeo, sc.dinoBellyMat));

  // Merged Dorsal Osteoderm Armor Ridge Plates along Spine & Tail + Forelimb Claws
  const ridgeGeo = getCachedMergedGeo(isTRex ? 'trex_ridges' : 'raptor_ridges', mergeParts, () => {
    const p = [];
    const platePositions = [
      [1.98, -0.82, -0.18, 0.24],
      [1.96, -0.46, -0.14, 0.28],
      [1.86, 0.38, -0.06, 0.26],
      [1.82, 0.82, -0.04, 0.25],
      [1.76, 1.32, -0.02, 0.24],
      [1.7, 1.84, 0.0, 0.22],
      [1.64, 2.38, 0.03, 0.2],
      [1.59, 2.92, 0.05, 0.17],
      [1.56, 3.48, 0.07, 0.14]
    ];
    for (const [py, pz, rx, hScale] of platePositions) {
      p.push({
        geo: getBox(0.12 * s, hScale * s, 0.26 * s),
        pos: [0, py * s, pz * s],
        rot: [rx, 0, 0]
      });
    }
    return p;
  });
  group.add(new THREE.Mesh(ridgeGeo, sc.dinoRidgeMat));

  const foreClawsGeo = getCachedMergedGeo(isTRex ? 'trex_foreclaws' : 'raptor_foreclaws', mergeParts, () => {
    const p = [];
    for (const side of [-1, 1]) {
      const fingers = isTRex ? [-0.04, 0.04] : [-0.055, 0, 0.055];
      const baseX = side * (isTRex ? 0.58 : 0.49) * s;
      const baseY = (isTRex ? 0.84 : 0.78) * s;
      const baseZ = (isTRex ? -1.26 : -1.42) * s;
      const clawLen = (isTRex ? 0.18 : 0.28) * s;
      for (const fx of fingers) {
        p.push({
          geo: getCyl(0.008 * s, 0.034 * s, clawLen, 5),
          pos: [baseX + fx * s, baseY, baseZ],
          rot: [-Math.PI * 0.62, 0, 0]
        });
      }
    }
    return p;
  });
  group.add(new THREE.Mesh(foreClawsGeo, sc.clawKeratinMat));

  // Raptor Wing-Feathers & Tail-Tip Plumage Fan
  if (!isTRex) {
    const plumageGeo = getCachedMergedGeo('raptor_forearm_tail_feathers', mergeParts, () => {
      const p = [];
      for (const side of [-1, 1]) {
        p.push({
          geo: getBox(0.04 * s, 0.34 * s, 0.58 * s),
          pos: [side * 0.52 * s, 0.82 * s, -1.08 * s],
          rot: [0.35, 0, -side * 0.24]
        });
        // Tail-tip pennaceous display frond
        p.push({
          geo: getBox(0.32 * s, 0.045 * s, 0.92 * s),
          pos: [side * 0.16 * s, 1.48 * s, 4.35 * s],
          rot: [0.08, side * 0.22, 0]
        });
      }
      return p;
    });
    group.add(new THREE.Mesh(plumageGeo, featherMat));
  }

  // --------------------------------------------------------------------------
  // B. Articulated `headNeckGroup` (`group.userData.headNeckGroup = headNeckGroup`)
  //    Pivots at shoulder/neck base so VehicleControl.js animates head bob & yaw!
  // --------------------------------------------------------------------------
  const headNeckGroup = new THREE.Group();
  headNeckGroup.position.set(0, 1.68 * s, -0.98 * s);

  const headSkullGeo = getCachedMergedGeo(isTRex ? 'trex_head_skull' : 'raptor_head_skull', mergeParts, () => {
    const p = [];
    // Muscular S-curved neck
    p.push({
      geo: getBox((isTRex ? 0.74 : 0.48) * s, (isTRex ? 0.88 : 0.66) * s, 0.68 * s),
      pos: [0, 0.32 * s, -0.24 * s],
      rot: [0.42, 0, 0]
    });
    // Heavy posterior cranium + cheek jaw-muscle bulges
    const skullW = (isTRex ? 0.88 : 0.54) * s;
    const skullH = (isTRex ? 0.68 : 0.46) * s;
    p.push({
      geo: getBox(skullW, skullH, (isTRex ? 0.78 : 0.66) * s),
      pos: [0, 0.66 * s, -0.52 * s],
      rot: [0.06, 0, 0]
    });
    // Upper maxilla / snout tapering forward (-Z)
    p.push({
      geo: getBox((isTRex ? 0.68 : 0.36) * s, (isTRex ? 0.52 : 0.32) * s, (isTRex ? 0.86 : 0.94) * s),
      pos: [0, 0.61 * s, (isTRex ? -1.16 : -1.18) * s],
      rot: [0.08, 0, 0]
    });
    // Supraorbital armored brow crests & nasal ridge
    for (const side of [-1, 1]) {
      p.push({
        geo: getBox(0.16 * s, 0.16 * s, 0.38 * s),
        pos: [side * (isTRex ? 0.38 : 0.23) * s, (isTRex ? 0.98 : 0.86) * s, -0.58 * s],
        rot: [0.12, 0, -side * 0.25]
      });
    }
    // Lower mandible jaw (slightly agape in fierce predator snarl!)
    p.push({
      geo: getBox((isTRex ? 0.62 : 0.32) * s, (isTRex ? 0.24 : 0.16) * s, (isTRex ? 1.18 : 1.16) * s),
      pos: [0, (isTRex ? 0.22 : 0.32) * s, -0.96 * s],
      rot: [-0.2, 0, 0]
    });
    return p;
  });
  const headSkullMesh = new THREE.Mesh(headSkullGeo, skinMat);
  headSkullMesh.castShadow = true;
  headNeckGroup.add(headSkullMesh);

  // Throat wattle / pale lower jaw underside
  const throatMesh = new THREE.Mesh(
    getBox((isTRex ? 0.56 : 0.3) * s, 0.16 * s, 0.92 * s),
    sc.dinoBellyMat
  );
  throatMesh.position.set(0, (isTRex ? 0.12 : 0.22) * s, -0.82 * s);
  throatMesh.rotation.x = -0.18;
  headNeckGroup.add(throatMesh);

  // Glowing Amber Predator Eyes + Slit Pupils
  const eyesGeo = getCachedMergedGeo(isTRex ? 'trex_eyes' : 'raptor_eyes', mergeParts, () => {
    const ex = (isTRex ? 0.445 : 0.275) * s;
    const ey = (isTRex ? 0.78 : 0.7) * s;
    return [
      { geo: getBox(0.06 * s, 0.11 * s, 0.16 * s), pos: [-ex, ey, -0.62 * s], rot: [0, 0, 0] },
      { geo: getBox(0.06 * s, 0.11 * s, 0.16 * s), pos: [ex, ey, -0.62 * s], rot: [0, 0, 0] }
    ];
  });
  headNeckGroup.add(new THREE.Mesh(eyesGeo, sc.dinoEyeAmberMat));

  // Merged Upper & Lower Serrated Ivory Teeth (`ctx.mergeParts` — 1 draw call!)
  const teethGeo = getCachedMergedGeo(isTRex ? 'trex_teeth' : 'raptor_teeth', mergeParts, () => {
    const p = [];
    const halfJaw = isTRex ? 0.29 : 0.15;
    const upperY = isTRex ? 0.35 : 0.43;
    const lowerY = isTRex ? 0.29 : 0.36;
    const toothR = (isTRex ? 0.038 : 0.022) * s;
    const toothH = (isTRex ? 0.19 : 0.11) * s;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        const tz = (-0.72 - i * 0.14) * s;
        // Upper serrated tooth pointing down
        p.push({
          geo: getCyl(0.004 * s, toothR, toothH, 4),
          pos: [side * halfJaw * s, upperY * s, tz],
          rot: [Math.PI, 0, 0]
        });
        // Interlocking lower tooth pointing up
        if (i < 5) {
          p.push({
            geo: getCyl(0.004 * s, toothR * 0.85, toothH * 0.82, 4),
            pos: [side * (halfJaw - 0.02) * s, lowerY * s, tz - 0.06 * s],
            rot: [0, 0, 0]
          });
        }
      }
    }
    return p;
  });
  headNeckGroup.add(new THREE.Mesh(teethGeo, sc.toothIvoryMat));

  // Raptor swept cranial feather crest
  if (!isTRex) {
    const crestGeo = getCachedMergedGeo('raptor_head_crest', mergeParts, () => [
      { geo: getBox(0.08 * s, 0.22 * s, 0.58 * s), pos: [0, 0.92 * s, -0.32 * s], rot: [0.32, 0, 0] },
      { geo: getBox(0.06 * s, 0.16 * s, 0.48 * s), pos: [0, 0.84 * s, -0.05 * s], rot: [0.48, 0, 0] }
    ]);
    headNeckGroup.add(new THREE.Mesh(crestGeo, featherMat));
  }

  group.add(headNeckGroup);
  group.userData.headNeckGroup = headNeckGroup;

  // --------------------------------------------------------------------------
  // C. Digitigrade 3-Segment Hind Legs (`wheels.push(legPivot)`)
  //    Thigh -> Angled Shin -> Metatarsus Ankle -> 3-Taloned Foot (+ Raptor Sickle Claw!)
  // --------------------------------------------------------------------------
  const legSkinGeo = getCachedMergedGeo(isTRex ? 'trex_hindleg_skin' : 'raptor_hindleg_skin', mergeParts, () => [
    // Segment 1: Massive muscular thigh (femur) angled forward/downward
    {
      geo: getBox((isTRex ? 0.48 : 0.34) * s, 0.72 * s, (isTRex ? 0.64 : 0.48) * s),
      pos: [0, -0.26 * s, -0.1 * s],
      rot: [0.34, 0, 0]
    },
    // Segment 2: Lean angled shin (tibia) sweeping down and back to raised hock
    {
      geo: getBox((isTRex ? 0.32 : 0.22) * s, 0.66 * s, (isTRex ? 0.36 : 0.26) * s),
      pos: [0, -0.76 * s, 0.06 * s],
      rot: [-0.46, 0, 0]
    },
    // Segment 3: Digitigrade metatarsus ankle sweeping down and forward to foot
    {
      geo: getBox((isTRex ? 0.24 : 0.16) * s, 0.48 * s, (isTRex ? 0.24 : 0.18) * s),
      pos: [0, -1.14 * s, 0.08 * s],
      rot: [0.38, 0, 0]
    },
    // Broad 3-toed foot pad on ground (y = -1.31*s relative to hip at y = 1.38*s)
    {
      geo: getBox((isTRex ? 0.44 : 0.32) * s, 0.14 * s, 0.52 * s),
      pos: [0, -1.31 * s, -0.12 * s],
      rot: [0, 0, 0]
    }
  ]);

  for (const side of [-1, 1]) {
    const legPivot = new THREE.Group();
    legPivot.position.set(side * (isTRex ? 0.62 : 0.48) * s, 1.38 * s, 0.18 * s);

    const legMesh = new THREE.Mesh(legSkinGeo, skinMat);
    legMesh.castShadow = true;
    legPivot.add(legMesh);

    const footClawKey = isTRex ? 'trex_foot_claws' : `raptor_foot_claws_${side}`;
    const footClawsGeo = getCachedMergedGeo(footClawKey, mergeParts, () => {
      const p = [];
      for (const tx of [-0.13, 0, 0.13]) {
        p.push({
          geo: getCyl(0.01 * s, 0.05 * s, 0.26 * s, 5),
          pos: [tx * s, -1.32 * s, -0.44 * s],
          rot: [-Math.PI / 2 - 0.15, 0, 0]
        });
      }
      if (!isTRex) {
        // Signature Velociraptor hyper-extendable raised inner 2nd-toe curved Sickle Claw!
        const innerX = -side * 0.18 * s;
        p.push({
          geo: getBox(0.05 * s, 0.18 * s, 0.08 * s),
          pos: [innerX, -1.2 * s, -0.22 * s],
          rot: [0.48, 0, 0]
        });
        p.push({
          geo: getCyl(0.008 * s, 0.052 * s, 0.34 * s, 6),
          pos: [innerX, -1.08 * s, -0.36 * s],
          rot: [-1.18, 0, 0]
        });
      }
      return p;
    });
    legPivot.add(new THREE.Mesh(footClawsGeo, sc.clawKeratinMat));

    group.add(legPivot);
    if (Array.isArray(wheels)) {
      wheels.push(legPivot);
    }
  }

  // --------------------------------------------------------------------------
  // D. Tactical Leather & Steel Battle-Saddle + Harness + Hanging Stirrups
  // --------------------------------------------------------------------------
  const saddleGeo = getCachedMergedGeo(isTRex ? 'trex_saddle' : 'raptor_saddle', mergeParts, () => {
    const sw = (isTRex ? 0.92 : 0.68) * s;
    return [
      // Contoured stitched leather saddle pad & high cantle backrest
      { geo: getBox(sw, 0.14 * s, 0.88 * s), pos: [0, 2.02 * s, -0.06 * s], rot: [-0.12, 0, 0] },
      { geo: getBox(sw * 0.78, 0.24 * s, 0.16 * s), pos: [0, 2.14 * s, 0.34 * s], rot: [-0.28, 0, 0] },
      // Chest harness & girth straps wrapping torso
      { geo: getBox(sw * 1.32, 0.88 * s, 0.11 * s), pos: [0, 1.54 * s, -0.22 * s], rot: [-0.14, 0, 0] },
      // Side tactical saddlebag ammo pouches
      { geo: getBox(0.16 * s, 0.28 * s, 0.38 * s), pos: [-sw * 0.62, 1.78 * s, 0.05 * s], rot: [0, 0, 0.12] },
      { geo: getBox(0.16 * s, 0.28 * s, 0.38 * s), pos: [sw * 0.62, 1.78 * s, 0.05 * s], rot: [0, 0, -0.12] }
    ];
  });
  group.add(new THREE.Mesh(saddleGeo, sc.saddleLeatherMat));

  const stirrupsGeo = getCachedMergedGeo(isTRex ? 'trex_stirrups' : 'raptor_stirrups', mergeParts, () => {
    const sx = (isTRex ? 0.62 : 0.46) * s;
    return [
      // Steel pommel grab-bar & stirrup irons
      { geo: getCyl(0.025 * s, 0.025 * s, 0.48 * s, 8, Math.PI / 2), pos: [0, 2.18 * s, -0.44 * s], rot: [0, 0, 0] },
      { geo: getBox(0.08 * s, 0.16 * s, 0.16 * s), pos: [-sx, 1.48 * s, -0.1 * s], rot: [0, 0, 0] },
      { geo: getBox(0.08 * s, 0.16 * s, 0.16 * s), pos: [sx, 1.48 * s, -0.1 * s], rot: [0, 0, 0] }
    ];
  });
  group.add(new THREE.Mesh(stirrupsGeo, sc.saddleSteelMat));

  turretPivot.position.set(0, 2.1 * s, -1.5 * s);
  const barrelGroup = new THREE.Group();
  turretPivot.add(barrelGroup);

  return { barrelGroup };
}
