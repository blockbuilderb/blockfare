// ============================================================================
// 3D HELICOPTER & 6x6 TROOP TRANSPORT TRUCK MODELS (src/models/heli-truck-models.js)
// - Transport Helicopters: UH-60M Black Hawk (US) / Mi-8AMTSh Terminator (RU)
// - Attack Helicopters:    AH-64E Apache Longbow (US) / Ka-52 Alligator Coaxial (RU)
// - 6x6 Troop & Supply Trucks: M1083A1 MTV (US) / KamAZ-5350 / Ural-4320 (RU)
// ============================================================================

import * as THREE from '../../vendor/three.module.js';

export function buildHelicopterModel(ctx) {
  const { cfg, isUS, group, wheels, turretPivot, darkMat, barrelMat, glassMat } = ctx;
  const isAttack = cfg.aircraftRole === 'heli_attack';

  const bodyHex = isUS
    ? isAttack
      ? 0x3b4438 // US Army Apache Helo Drab
      : 0x2c3530 // US Army Black Hawk Olive-Black
    : isAttack
    ? 0x2f3e46 // RU VKS Ka-52 Slate Blue-Grey
    : 0x485846; // RU Mi-8 Woodland Green

  const bellyHex = isUS ? 0x252b28 : 0x5c7cfa;
  const bodyMat = new THREE.MeshStandardMaterial({
    color: bodyHex,
    roughness: 0.58,
    metalness: 0.32,
    flatShading: true
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: isUS ? 0x1e2326 : bellyHex,
    roughness: 0.62,
    metalness: 0.28,
    flatShading: true
  });
  const rotorBladeMat = new THREE.MeshStandardMaterial({
    color: 0x191c20,
    roughness: 0.45,
    metalness: 0.52
  });
  const rotorTipMat = new THREE.MeshBasicMaterial({ color: 0xf1c40f });
  const ordMat = new THREE.MeshStandardMaterial({
    color: 0x4b5320,
    roughness: 0.55,
    metalness: 0.3
  });
  const hellfireTipMat = new THREE.MeshBasicMaterial({ color: 0xff9f1a });

  const cockpitCanopyParts = [];
  let barrelGroup = new THREE.Group();

  if (isAttack) {
    // =========================================================================
    // DEDICATED ATTACK HELICOPTER: AH-64E APACHE LONGBOW (US) / KA-52 ALLIGATOR (RU)
    // =========================================================================
    const fuselageW = isUS ? 1.24 : 1.56; // Tandem narrow Apache vs side-by-side Ka-52
    const mainHull = new THREE.Mesh(new THREE.BoxGeometry(fuselageW, 1.22, 6.4), bodyMat);
    mainHull.position.set(0, 1.55, 0.15);
    mainHull.castShadow = true;
    mainHull.receiveShadow = true;
    group.add(mainHull);

    // Tapered Shark / Chisel Nose + FLIR / PNVS Electro-Optical Sensor Turret
    const noseCone = new THREE.Mesh(new THREE.BoxGeometry(fuselageW * 0.84, 0.78, 1.85), bodyMat);
    noseCone.position.set(0, 1.32, -3.75);
    noseCone.rotation.x = 0.14;
    group.add(noseCone);

    const flirTurret = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.42, 10), darkMat);
    flirTurret.position.set(0, 1.22, -4.75);
    flirTurret.rotation.x = Math.PI / 2;
    group.add(flirTurret);

    const flirLens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 0.08, 8),
      new THREE.MeshBasicMaterial({ color: 0x00d2d3 })
    );
    flirLens.position.set(0, 1.22, -4.96);
    flirLens.rotation.x = Math.PI / 2;
    group.add(flirLens);

    // Stepped Armored Canopy Glazing (hidden in COCKPIT_1P for clean view)
    const frontCanopy = new THREE.Mesh(
      new THREE.BoxGeometry(fuselageW * 0.86, 0.62, 2.35),
      glassMat
    );
    frontCanopy.position.set(0, 2.26, -1.75);
    frontCanopy.rotation.x = 0.16;
    frontCanopy.userData.hideIn1PCockpit = true;
    group.add(frontCanopy);
    cockpitCanopyParts.push(frontCanopy);

    const canopyFrame = new THREE.Mesh(
      new THREE.BoxGeometry(fuselageW * 0.9, 0.1, 2.45),
      darkMat
    );
    canopyFrame.position.set(0, 2.58, -1.65);
    canopyFrame.userData.hideIn1PCockpit = true;
    group.add(canopyFrame);
    cockpitCanopyParts.push(canopyFrame);

    // Twin Side Turboshaft Engine Nacelles + IR Suppressor Exhausts
    for (const side of [-1, 1]) {
      const nacelle = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.72, 2.85), trimMat);
      nacelle.position.set(side * (fuselageW * 0.5 + 0.32), 2.15, 0.45);
      nacelle.castShadow = true;
      group.add(nacelle);

      // Stub Weapons Wing + Hydra/S-8 Rocket Pod + 4× Hellfire / Vikhr Tank-Buster ATGMs per wing!
      const stubWing = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.16, 0.95), bodyMat);
      stubWing.position.set(side * (fuselageW * 0.5 + 0.92), 1.48, -0.15);
      stubWing.rotation.z = -side * 0.06;
      stubWing.castShadow = true;
      group.add(stubWing);

      // Inner Pylon: 19-Tube 70mm Hydra-70 / 80mm S-8 Rocket Pod
      const rocketPod = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 1.48, 8), ordMat);
      rocketPod.rotation.x = Math.PI / 2;
      rocketPod.position.set(side * (fuselageW * 0.5 + 0.75), 1.18, -0.15);
      group.add(rocketPod);

      // Outer Pylon: Quad-Rail AGM-114L Hellfire / 9K121 Vikhr Tank-Buster Missiles
      for (const [mx, my] of [
        [-0.14, 0.0],
        [0.14, 0.0],
        [-0.14, -0.2],
        [0.14, -0.2]
      ]) {
        const atgmBody = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 1.52, 6), darkMat);
        atgmBody.rotation.x = Math.PI / 2;
        atgmBody.position.set(side * (fuselageW * 0.5 + 1.45) + mx, 1.24 + my, -0.18);
        group.add(atgmBody);

        const seekerNose = new THREE.Mesh(
          new THREE.CylinderGeometry(0.03, 0.075, 0.18, 6),
          hellfireTipMat
        );
        seekerNose.rotation.x = -Math.PI / 2;
        seekerNose.position.set(side * (fuselageW * 0.5 + 1.45) + mx, 1.24 + my, -1.02);
        group.add(seekerNose);
      }
    }

    // Tail Boom & Stabilizers
    const tailBoom = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.68, 4.9), bodyMat);
    tailBoom.position.set(0, 1.65, 5.45);
    tailBoom.castShadow = true;
    group.add(tailBoom);

    if (isUS) {
      // Single Vertical Tail Fin + Stabilator + Tail Rotor (AH-64E)
      const vFin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.75, 1.15), bodyMat);
      vFin.position.set(0, 2.42, 7.65);
      vFin.rotation.x = -0.18;
      group.add(vFin);

      const hStab = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 0.68), trimMat);
      hStab.position.set(0, 1.48, 7.85);
      group.add(hStab);

      const tailRotorHub = new THREE.Group();
      tailRotorHub.position.set(-0.22, 2.95, 7.85);
      for (let b = 0; b < 2; b++) {
        const trBlade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.65, 0.14), rotorBladeMat);
        trBlade.rotation.x = (b * Math.PI) / 2 + 0.35;
        tailRotorHub.add(trBlade);
      }
      group.add(tailRotorHub);
      group.userData.tailRotorHub = tailRotorHub;
    } else {
      // Ka-52 Signature Twin Vertical Tail Endplates (Coaxial — Zero Tail Rotor!)
      const hTail = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.12, 0.85), bodyMat);
      hTail.position.set(0, 1.72, 7.55);
      group.add(hTail);
      for (const side of [-1, 1]) {
        const endFin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.45, 0.95), trimMat);
        endFin.position.set(side * 1.42, 2.05, 7.55);
        group.add(endFin);
      }
    }

    // Main Rotor Mast + 4-Blade Rotor (or Coaxial Counter-Rotating Twin Rotors on Ka-52!) + Longbow Radar Dome
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.95, 8), darkMat);
    mast.position.set(0, 2.85, -0.15);
    group.add(mast);

    const mainRotorHub = new THREE.Group();
    mainRotorHub.position.set(0, 3.18, -0.15);
    const bladeCount = isUS ? 4 : 3;
    for (let i = 0; i < bladeCount; i++) {
      const bladePivot = new THREE.Group();
      bladePivot.rotation.y = (i / bladeCount) * Math.PI * 2;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.045, 6.2), rotorBladeMat);
      blade.position.set(0, 0, -3.25);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.05, 0.28), rotorTipMat);
      tip.position.set(0, 0, -6.28);
      bladePivot.add(blade, tip);
      mainRotorHub.add(bladePivot);
    }
    group.add(mainRotorHub);
    group.userData.mainRotorHub = mainRotorHub;

    if (isUS) {
      // Iconic AN/APG-78 Longbow Fire-Control Millimeter-Wave Radar "Cheese Wheel" Radome!
      const longbowDome = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.72, 0.36, 12), trimMat);
      longbowDome.position.set(0, 3.52, -0.15);
      group.add(longbowDome);
    } else {
      // Ka-52 Upper Counter-Rotating Coaxial Rotor!
      const upperMast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.78, 8), darkMat);
      upperMast.position.set(0, 3.55, -0.15);
      group.add(upperMast);

      const coaxUpperRotorHub = new THREE.Group();
      coaxUpperRotorHub.position.set(0, 3.92, -0.15);
      for (let i = 0; i < 3; i++) {
        const bladePivot = new THREE.Group();
        bladePivot.rotation.y = (i / 3) * Math.PI * 2 + 0.52;
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.045, 6.2), rotorBladeMat);
        blade.position.set(0, 0, -3.25);
        const tip = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.05, 0.28), rotorTipMat);
        tip.position.set(0, 0, -6.28);
        bladePivot.add(blade, tip);
        coaxUpperRotorHub.add(bladePivot);
      }
      group.add(coaxUpperRotorHub);
      group.userData.coaxUpperRotorHub = coaxUpperRotorHub;
    }

    // Under-Chin 30mm M230 Chain Gun / 2A42 Cannon on Turret Pivot
    turretPivot.position.set(0, 0.82, -2.85);
    const chinMount = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.28, 0.52), darkMat);
    turretPivot.add(chinMount);
    const gunBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 1.55, 8), barrelMat);
    gunBarrel.rotation.x = Math.PI / 2;
    gunBarrel.position.set(0, -0.04, 0.85);
    barrelGroup.add(gunBarrel);
    turretPivot.add(barrelGroup);

    // Crashworthy Wheeled Gear
    const wheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.22, 8);
    wheelGeo.rotateZ(Math.PI / 2);
    for (const [wx, wy, wz] of [
      [-1.02, 0.28, -1.65],
      [1.02, 0.28, -1.65],
      [0, 0.24, 6.85]
    ]) {
      const w = new THREE.Mesh(wheelGeo, darkMat);
      w.position.set(wx, wy, wz);
      group.add(w);
      wheels.push(w);
    }
  } else {
    // =========================================================================
    // TRANSPORT / ASSAULT HELICOPTER: UH-60M BLACK HAWK (US) / MI-8AMTSh (RU)
    // Open Troop Cabin + Twin Side Door Miniguns + 8-Soldier Rooftop Insertion!
    // =========================================================================
    const cabW = 2.08;
    const cabinFloor = new THREE.Mesh(new THREE.BoxGeometry(cabW, 0.28, 5.6), bodyMat);
    cabinFloor.position.set(0, 0.86, 0.1);
    cabinFloor.castShadow = true;
    group.add(cabinFloor);

    const cabinRoof = new THREE.Mesh(new THREE.BoxGeometry(cabW, 0.34, 5.4), bodyMat);
    cabinRoof.position.set(0, 2.38, 0.15);
    cabinRoof.castShadow = true;
    group.add(cabinRoof);

    // Forward Cockpit Nose & Angled Windscreen (hidden in COCKPIT_1P)
    const noseLower = new THREE.Mesh(new THREE.BoxGeometry(cabW * 0.92, 0.82, 1.65), bodyMat);
    noseLower.position.set(0, 1.16, -3.35);
    noseLower.rotation.x = 0.12;
    group.add(noseLower);

    const windscreen = new THREE.Mesh(new THREE.BoxGeometry(cabW * 0.88, 0.86, 1.25), glassMat);
    windscreen.position.set(0, 1.88, -2.95);
    windscreen.rotation.x = 0.38;
    windscreen.userData.hideIn1PCockpit = true;
    group.add(windscreen);
    cockpitCanopyParts.push(windscreen);

    const roofBrow = new THREE.Mesh(new THREE.BoxGeometry(cabW * 0.9, 0.14, 1.1), trimMat);
    roofBrow.position.set(0, 2.38, -2.55);
    roofBrow.userData.hideIn1PCockpit = true;
    group.add(roofBrow);
    cockpitCanopyParts.push(roofBrow);

    // Rear Cabin Bulkhead + Troop Bench Seats + Open Sliding Doorway + Twin Door M134 Miniguns!
    const aftBulkhead = new THREE.Mesh(new THREE.BoxGeometry(cabW, 1.38, 1.55), bodyMat);
    aftBulkhead.position.set(0, 1.62, 2.15);
    group.add(aftBulkhead);

    const centerBench = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.48, 2.35), trimMat);
    centerBench.position.set(0, 1.22, 0.15);
    group.add(centerBench);

    for (const side of [-1, 1]) {
      // Forward cockpit door pillar
      const fwdPillar = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.35, 0.85), bodyMat);
      fwdPillar.position.set(side * (cabW * 0.5 - 0.09), 1.62, -1.95);
      group.add(fwdPillar);

      // Pintle-Mounted Side Door M134 7.62mm Minigun / PKM!
      const pintlePost = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.65, 6), darkMat);
      pintlePost.position.set(side * (cabW * 0.5 + 0.06), 1.32, -0.95);
      group.add(pintlePost);

      const minigunBarrels = new THREE.Mesh(
        new THREE.CylinderGeometry(0.085, 0.085, 1.05, 8),
        barrelMat
      );
      minigunBarrels.rotation.z = Math.PI / 2;
      minigunBarrels.rotation.y = -side * 0.35;
      minigunBarrels.position.set(side * (cabW * 0.5 + 0.42), 1.58, -1.08);
      group.add(minigunBarrels);

      // Top Twin T700 / TV3-117 Turboshaft Nacelles
      const topEng = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.58, 2.95), trimMat);
      topEng.position.set(side * 0.56, 2.74, 0.25);
      group.add(topEng);
    }

    // Tail Boom, Swept Tail Pylon, Stabilator & Canted Tail Rotor
    const tailBoom = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.82, 5.2), bodyMat);
    tailBoom.position.set(0, 1.92, 5.35);
    tailBoom.castShadow = true;
    group.add(tailBoom);

    const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.95, 1.25), bodyMat);
    tailFin.position.set(0, 2.75, 7.75);
    tailFin.rotation.x = -0.22;
    group.add(tailFin);

    const stabilator = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.11, 0.78), trimMat);
    stabilator.position.set(0, 1.72, 7.95);
    group.add(stabilator);

    const tailRotorHub = new THREE.Group();
    tailRotorHub.position.set(0.24, 3.35, 7.95);
    for (let b = 0; b < 2; b++) {
      const trBlade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.85, 0.16), rotorBladeMat);
      trBlade.rotation.x = (b * Math.PI) / 2;
      tailRotorHub.add(trBlade);
    }
    group.add(tailRotorHub);
    group.userData.tailRotorHub = tailRotorHub;

    // Main Rotor Mast + 4-Blade (UH-60M) / 5-Blade (Mi-8) Main Rotor
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.75, 8), darkMat);
    mast.position.set(0, 3.15, -0.05);
    group.add(mast);

    const mainRotorHub = new THREE.Group();
    mainRotorHub.position.set(0, 3.48, -0.05);
    const bladeCount = isUS ? 4 : 5;
    for (let i = 0; i < bladeCount; i++) {
      const bladePivot = new THREE.Group();
      bladePivot.rotation.y = (i / bladeCount) * Math.PI * 2;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.048, 6.8), rotorBladeMat);
      blade.position.set(0, 0, -3.55);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.052, 0.3), rotorTipMat);
      tip.position.set(0, 0, -6.82);
      bladePivot.add(blade, tip);
      mainRotorHub.add(bladePivot);
    }
    group.add(mainRotorHub);
    group.userData.mainRotorHub = mainRotorHub;

    // Nose Sensor Pod & Turret Pivot
    turretPivot.position.set(0, 0.92, -3.65);
    turretPivot.add(barrelGroup);

    // Heavy Crashworthy Landing Gear Struts & Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.24, 8);
    wheelGeo.rotateZ(Math.PI / 2);
    for (const [wx, wy, wz] of [
      [-1.22, 0.32, -1.25],
      [1.22, 0.32, -1.25],
      [0, 0.26, 7.25]
    ]) {
      const w = new THREE.Mesh(wheelGeo, darkMat);
      w.position.set(wx, wy, wz);
      group.add(w);
      wheels.push(w);
    }
  }

  group.userData.cockpitCanopyParts = cockpitCanopyParts;
  return { barrelGroup };
}

// ─── SHARED 6x6 TRUCK GEOMETRY & MATERIAL CACHE (.userData.shared = true) ──
const _truckGeoCache = new Map();

function _markTruckShared(res) {
  if (res) {
    res.userData = res.userData || {};
    res.userData.shared = true;
  }
  return res;
}

const _truckHeadlightMat = _markTruckShared(new THREE.MeshBasicMaterial({ color: 0xf5f6fa }));
const _truckTaillightMat = _markTruckShared(new THREE.MeshBasicMaterial({ color: 0xd63031 }));
const _truckAmberMat = _markTruckShared(new THREE.MeshBasicMaterial({ color: 0xff9f1a }));
const _truckOpticMat = _markTruckShared(
  new THREE.MeshStandardMaterial({
    color: 0x1dd1a1,
    roughness: 0.18,
    metalness: 0.84,
    flatShading: true
  })
);
const _truckCanvasUsMat = _markTruckShared(
  new THREE.MeshStandardMaterial({
    color: 0x8f8160,
    roughness: 0.88,
    metalness: 0.05,
    flatShading: true
  })
);
const _truckCanvasRuMat = _markTruckShared(
  new THREE.MeshStandardMaterial({
    color: 0x485740,
    roughness: 0.88,
    metalness: 0.05,
    flatShading: true
  })
);
const _truckWoodMat = _markTruckShared(
  new THREE.MeshStandardMaterial({
    color: 0x6e4f32,
    roughness: 0.82,
    flatShading: true
  })
);
const _truckSupplyMat = _markTruckShared(
  new THREE.MeshStandardMaterial({
    color: 0x525e34,
    roughness: 0.74,
    metalness: 0.16,
    flatShading: true
  })
);
const _truckJerryRedMat = _markTruckShared(
  new THREE.MeshStandardMaterial({
    color: 0xb33939,
    roughness: 0.52,
    metalness: 0.28,
    flatShading: true
  })
);

function _tPart(geo, x, y, z, rx = 0, ry = 0, rz = 0) {
  return { geo, pos: [x, y, z], rot: [rx, ry, rz] };
}

function _addTruckMerged(parent, key, ctx, mat, buildFn, castShadow = true, receiveShadow = false) {
  let geo = _truckGeoCache.get(key);
  if (!geo) {
    const parts = [];
    buildFn(parts);
    geo = _markTruckShared(ctx.mergeParts(parts));
    _truckGeoCache.set(key, geo);
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  parent.add(mesh);
  return mesh;
}

function _getTruck6x6HubGeo(ctx) {
  let g = _truckGeoCache.get('truck6x6:ctisHub');
  if (!g) {
    const parts = [];
    // Deep-dish heavy steel beadlock wheel rim
    parts.push(_tPart(ctx.getCyl(0.34, 0.34, 0.39, 12, Math.PI / 2), 0, 0, 0));
    // Outer beadlock clamping ring
    parts.push(_tPart(ctx.getCyl(0.355, 0.355, 0.41, 12, Math.PI / 2), 0, 0, 0));
    // Protruding central CTIS planetary reduction hub + armored air-inflation line guard
    parts.push(_tPart(ctx.getCyl(0.16, 0.185, 0.46, 10, Math.PI / 2), 0, 0, 0));
    parts.push(_tPart(ctx.getBox(0.47, 0.075, 0.52), 0, 0, 0));
    // 5-spoke lug bolt pattern + inner brake drum
    parts.push(_tPart(ctx.getSpokes(5, 0.42, 0.042, 0.6), 0, 0, 0));
    g = _markTruckShared(ctx.mergeParts(parts));
    _truckGeoCache.set('truck6x6:ctisHub', g);
  }
  return g;
}

export function buildTroopTruckModel(ctx) {
  const {
    isUS,
    group,
    wheels,
    turretPivot,
    hullMat,
    eraMat,
    darkMat,
    barrelMat,
    glassMat,
    getTreadTire
  } = ctx;
  const sideTag = isUS ? 'us' : 'ru';
  const canvasMat = isUS ? _truckCanvasUsMat : _truckCanvasRuMat;

  // =========================================================================
  // 1. 6 ARTICULATED HEAVY 6x6 OFF-ROAD TIRES + BEADLOCK CTIS PLANETARY HUBS
  //    Front Steer Axle (z = -2.35) + Tandem Rear Walking-Beam Bogie (z = +1.15, +2.55)
  // =========================================================================
  const tireGeo = getTreadTire
    ? getTreadTire(0.58, 0.42, 14, 12, 0.43, 0.058, 0.105, 0.575)
    : _markTruckShared(new THREE.CylinderGeometry(0.58, 0.58, 0.42, 14).rotateZ(Math.PI / 2));
  const hubGeo = ctx.mergeParts ? _getTruck6x6HubGeo(ctx) : null;

  for (const az of [-2.35, 1.15, 2.55]) {
    for (const side of [-1, 1]) {
      const wheelPivot = new THREE.Group();
      wheelPivot.position.set(side * 1.18, 0.58, az);

      const tire = new THREE.Mesh(tireGeo, darkMat);
      tire.castShadow = true;
      wheelPivot.add(tire);

      if (hubGeo) {
        const hub = new THREE.Mesh(hubGeo, eraMat);
        wheelPivot.add(hub);
      }

      group.add(wheelPivot);
      wheels.push(wheelPivot);
    }
  }

  // =========================================================================
  // 2. HEAVY C-CHANNEL LADDER FRAME, 3 PORTAL AXLES, WALKING-BEAM BOGIE,
  //    TRANSFER CASE, DRIVESHAFTS, WINCH BUMPER, EXHAUST STACK & SNORKEL (darkMat)
  // =========================================================================
  _addTruckMerged(
    group,
    `truck6x6:${sideTag}:chassisDark`,
    ctx,
    darkMat,
    (p) => {
      // Twin full-length heavy C-channel steel frame rails + 6 crossmembers
      for (const s of [-1, 1]) {
        p.push(_tPart(ctx.getBox(0.16, 0.34, 7.22), s * 0.56, 0.86, 0.04));
      }
      for (const cz of [-3.35, -1.95, -0.55, 0.85, 2.15, 3.48]) {
        p.push(_tPart(ctx.getBox(1.26, 0.24, 0.16), 0, 0.86, cz));
      }

      // Central 6x6 transfer case + angled front & tandem rear driveshafts
      p.push(_tPart(ctx.getBox(0.56, 0.42, 0.62), 0, 0.74, -0.55));
      p.push(_tPart(ctx.getCyl(0.055, 0.055, 1.82, 8), 0, 0.66, -1.45, Math.PI / 2 - 0.09, 0, 0));
      p.push(_tPart(ctx.getCyl(0.055, 0.055, 1.72, 8), 0, 0.66, 0.3, Math.PI / 2 + 0.09, 0, 0));
      p.push(_tPart(ctx.getCyl(0.055, 0.055, 1.4, 8), 0, 0.6, 1.85, Math.PI / 2, 0, 0));

      // 3 live beam axles + differential pumpkins + multi-leaf spring packs
      for (const az of [-2.35, 1.15, 2.55]) {
        p.push(_tPart(ctx.getCyl(0.095, 0.095, 2.18, 8, Math.PI / 2), 0, 0.58, az));
        p.push(_tPart(ctx.getBox(0.38, 0.36, 0.38), az < 0 ? 0.22 : 0, 0.58, az));
        for (const s of [-1, 1]) {
          p.push(_tPart(ctx.getBox(0.12, 0.11, 1.05), s * 0.68, 0.69, az));
        }
      }
      // Tandem rear walking-beam bogie trunnion & torque arms
      for (const s of [-1, 1]) {
        p.push(_tPart(ctx.getBox(0.14, 0.2, 1.56), s * 0.72, 0.64, 1.85));
        p.push(_tPart(ctx.getCyl(0.13, 0.13, 0.22, 8, Math.PI / 2), s * 0.72, 0.68, 1.85));
        // Rubber mudflaps behind front steer tires & rear bogie tires
        p.push(_tPart(ctx.getBox(0.46, 0.42, 0.04), s * 1.16, 0.56, -1.68, 0.12, 0, 0));
        p.push(_tPart(ctx.getBox(0.46, 0.46, 0.04), s * 1.16, 0.56, 3.26, -0.1, 0, 0));
      }

      // Front heavy steel winch bumper, underride skidplate & brush guard (-Z front)
      p.push(_tPart(ctx.getBox(2.52, 0.34, 0.32), 0, 0.82, -3.62));
      p.push(_tPart(ctx.getBox(1.56, 0.12, 0.68), 0, 0.68, -3.32, 0.38, 0, 0));
      if (isUS) {
        // Oshkosh M1083A1 armored 5-bar horizontal radiator grille & headlight brush guards
        p.push(_tPart(ctx.getBox(1.58, 0.64, 0.08), 0, 1.48, -3.48));
        for (let gy = 1.24; gy <= 1.72; gy += 0.12) {
          p.push(_tPart(ctx.getBox(1.48, 0.045, 0.12), 0, gy, -3.51));
        }
        // Tubular steel brush guard around cab nose
        p.push(_tPart(ctx.getBox(2.38, 0.065, 0.065), 0, 1.22, -3.76));
        p.push(_tPart(ctx.getBox(1.68, 0.065, 0.065), 0, 1.76, -3.72));
        for (const bx of [-1.14, -0.78, 0.78, 1.14]) {
          p.push(_tPart(ctx.getBox(0.065, 0.58, 0.08), bx, 1.24, -3.74));
        }
        // Right-rear vertical perforated exhaust stack + high desert cyclone snorkel
        p.push(_tPart(ctx.getCyl(0.085, 0.085, 1.85, 8), 1.14, 1.98, -1.06));
        p.push(_tPart(ctx.getCyl(0.125, 0.125, 1.15, 10), 1.14, 1.95, -1.06));
        p.push(_tPart(ctx.getCyl(0.055, 0.055, 0.34, 8), 1.18, 2.98, -1.02, 0, 0, -0.38));
        p.push(_tPart(ctx.getBox(0.22, 0.95, 0.22), -1.14, 2.12, -1.06));
        p.push(_tPart(ctx.getCyl(0.18, 0.16, 0.16, 10), -1.14, 2.68, -1.06));
      } else {
        // KamAZ-5350 / Ural-4320 slatted V-cowl grille + heavy welded bullbar ram bumper
        p.push(_tPart(ctx.getBox(1.64, 0.56, 0.09), 0, 1.46, -3.56));
        for (let gy = 1.26; gy <= 1.66; gy += 0.1) {
          p.push(_tPart(ctx.getBox(1.52, 0.04, 0.13), 0, gy, -3.59));
        }
        p.push(_tPart(ctx.getBox(2.44, 0.075, 0.075), 0, 1.32, -3.8));
        for (const bx of [-0.88, 0.88]) {
          p.push(_tPart(ctx.getBox(0.08, 0.64, 0.1), bx, 1.22, -3.78, -0.1, 0, 0));
        }
        // Behind-cab full-size 6x6 spare tire + crane carrier bracket (signature KamAZ-5350 detail!)
        p.push(_tPart(ctx.getCyl(0.54, 0.54, 0.38, 14, Math.PI / 2), 0.62, 1.82, -0.96));
        p.push(_tPart(ctx.getBox(0.12, 1.08, 0.36), 0.62, 1.42, -0.96));
        // Left-side vertical snorkel & under-frame exhaust muffler
        p.push(_tPart(ctx.getCyl(0.08, 0.08, 1.45, 8), -1.16, 2.05, -1.12));
        p.push(_tPart(ctx.getCyl(0.16, 0.14, 0.16, 10), -1.16, 2.82, -1.12));
      }

      // West-Coast dual towing mirrors, cab grab handles, boarding steps & wipers
      for (const s of [-1, 1]) {
        p.push(_tPart(ctx.getBox(0.08, 0.46, 0.22), s * 1.36, 2.24, -3.05, 0, s * -0.18, 0));
        p.push(_tPart(ctx.getBox(0.18, 0.04, 0.04), s * 1.28, 2.44, -3.05));
        p.push(_tPart(ctx.getBox(0.18, 0.04, 0.04), s * 1.28, 2.04, -3.05));
        // Dual cab boarding stirrup steps below doors
        p.push(_tPart(ctx.getBox(0.18, 0.05, 0.48), s * 1.24, 0.88, -2.35));
        p.push(_tPart(ctx.getBox(0.18, 0.05, 0.48), s * 1.24, 1.12, -2.35));
        p.push(_tPart(ctx.getBox(0.05, 0.44, 0.05), s * 1.24, 1.86, -1.82));
        // Dual windshield wipers
        p.push(_tPart(ctx.getBox(0.42, 0.03, 0.03), s * 0.56, 2.04, -3.41, 0, 0, 0.24));
      }

      // Overhead tubular steel cargo canopy bows & rear NATO pintle bumper (+Z rear)
      for (const mz of [0.55, 1.95, 3.35]) {
        p.push(_tPart(ctx.getBox(2.42, 0.065, 0.065), 0, 2.9, mz));
        for (const s of [-1, 1]) {
          p.push(_tPart(ctx.getBox(0.065, 0.86, 0.065), s * 1.18, 2.48, mz));
        }
      }
      p.push(_tPart(ctx.getBox(2.38, 0.24, 0.22), 0, 0.88, 3.62));
      p.push(_tPart(ctx.getBox(0.22, 0.22, 0.26), 0, 0.88, 3.74));
    },
    true,
    false
  );

  // =========================================================================
  // 3. SCULPTED ARMORED CAB (US M1083A1P2 B-KIT COE vs RU KAMAZ-5350 MUSTANG)
  //    & CORRUGATED STAKE-SIDE TROOP / LOGISTICS BED (hullMat)
  // =========================================================================
  _addTruckMerged(
    group,
    `truck6x6:${sideTag}:bodyHull`,
    ctx,
    hullMat,
    (p) => {
      if (isUS) {
        // Oshkosh M1083A1P2 Cab-Over-Engine lower armored cowl & sloped nose apron
        p.push(_tPart(ctx.getBox(2.42, 0.88, 2.08), 0, 1.48, -2.36));
        p.push(_tPart(ctx.getBox(2.38, 0.34, 0.48), 0, 1.84, -3.22, 0.32, 0, 0));
        // Flared front armored wheel-arch fenders
        for (const s of [-1, 1]) {
          p.push(_tPart(ctx.getBox(0.38, 0.12, 1.18), s * 1.18, 1.24, -2.35));
          p.push(_tPart(ctx.getBox(0.36, 0.38, 0.22), s * 1.18, 1.06, -2.96, 0.45, 0, 0));
          p.push(_tPart(ctx.getBox(0.36, 0.38, 0.22), s * 1.18, 1.06, -1.74, -0.45, 0, 0));
          // Armored A/B cab pillars & center ballistic windshield mullion
          p.push(_tPart(ctx.getBox(0.14, 0.78, 0.16), s * 1.13, 2.28, -3.26, 0.16, 0, 0));
          p.push(_tPart(ctx.getBox(0.15, 0.82, 0.24), s * 1.14, 2.3, -1.48));
        }
        p.push(_tPart(ctx.getBox(0.12, 0.76, 0.14), 0, 2.28, -3.28, 0.16, 0, 0));
        p.push(_tPart(ctx.getBox(2.4, 0.86, 0.2), 0, 2.28, -1.36));
      } else {
        // KamAZ-5350 Mustang beveled forward engine hood cowl + wide armored crew cab
        p.push(_tPart(ctx.getBox(2.26, 0.78, 0.92), 0, 1.44, -3.12));
        p.push(_tPart(ctx.getBox(2.18, 0.24, 0.94), 0, 1.84, -3.08, 0.22, 0, 0));
        p.push(_tPart(ctx.getBox(2.44, 0.92, 1.56), 0, 1.5, -2.02));
        for (const s of [-1, 1]) {
          p.push(_tPart(ctx.getBox(0.38, 0.12, 1.22), s * 1.18, 1.24, -2.35));
          p.push(_tPart(ctx.getBox(0.36, 0.36, 0.24), s * 1.18, 1.06, -2.98, 0.42, 0, 0));
          p.push(_tPart(ctx.getBox(0.14, 0.76, 0.16), s * 1.14, 2.28, -2.72, 0.18, 0, 0));
          p.push(_tPart(ctx.getBox(0.15, 0.8, 0.24), s * 1.15, 2.3, -1.34));
        }
        p.push(_tPart(ctx.getBox(0.11, 0.74, 0.14), 0, 2.28, -2.74, 0.18, 0, 0));
        p.push(_tPart(ctx.getBox(2.42, 0.84, 0.2), 0, 2.28, -1.26));
      }

      // Heavy Steel Troop & Logistics Flatbed Deck + Tandem Rear Fender Arches (-0.68 .. +3.58)
      p.push(_tPart(ctx.getBox(2.48, 0.22, 4.32), 0, 1.18, 1.44));
      for (const s of [-1, 1]) {
        // Tandem rear bogie steel mudguard fenders
        p.push(_tPart(ctx.getBox(0.42, 0.1, 2.86), s * 1.14, 1.22, 1.85));
        // Corrugated steel dropside cargo walls + 6 external vertical stake ribs
        p.push(_tPart(ctx.getBox(0.12, 0.86, 4.26), s * 1.18, 1.72, 1.44));
        p.push(_tPart(ctx.getBox(0.16, 0.09, 4.3), s * 1.19, 2.14, 1.44));
        for (const sz of [-0.45, 0.3, 1.05, 1.8, 2.55, 3.32]) {
          p.push(_tPart(ctx.getBox(0.17, 0.92, 0.09), s * 1.19, 1.7, sz));
        }
      }
      // Front cargo headboard & rear hinged tailgate with stiffener ribs
      p.push(_tPart(ctx.getBox(2.42, 0.96, 0.12), 0, 1.76, -0.66));
      p.push(_tPart(ctx.getBox(2.38, 0.78, 0.12), 0, 1.66, 3.55));
      for (const tx of [-0.85, 0, 0.85]) {
        p.push(_tPart(ctx.getBox(0.09, 0.78, 0.16), tx, 1.66, 3.56));
      }
    },
    true,
    true
  );

  // Separate Cab Roof & Ballistic Windshield Meshes for clean `cockpitCanopyParts` 1P hiding!
  const cabRoof = _addTruckMerged(
    group,
    `truck6x6:${sideTag}:cabRoof`,
    ctx,
    hullMat,
    (p) => {
      if (isUS) {
        p.push(_tPart(ctx.getBox(2.4, 0.16, 2.02), 0, 2.72, -2.32));
        // Forward armored sun-visor brow
        p.push(_tPart(ctx.getBox(2.36, 0.1, 0.28), 0, 2.68, -3.38, 0.24, 0, 0));
      } else {
        p.push(_tPart(ctx.getBox(2.42, 0.16, 1.62), 0, 2.72, -2.02));
        p.push(_tPart(ctx.getBox(2.38, 0.11, 0.3), 0, 2.68, -2.88, 0.26, 0, 0));
      }
    },
    true,
    false
  );
  cabRoof.userData.hideIn1PCockpit = true;

  const windshield = _addTruckMerged(
    group,
    `truck6x6:${sideTag}:cabGlass`,
    ctx,
    glassMat,
    (p) => {
      const wz = isUS ? -3.28 : -2.74;
      const doorZ = isUS ? -2.35 : -2.05;
      for (const s of [-1, 1]) {
        // Split left & right armored windshield panes
        p.push(_tPart(ctx.getBox(0.96, 0.58, 0.08), s * 0.56, 2.28, wz, 0.17, 0, 0));
        // Recessed ballistic side door windows
        p.push(_tPart(ctx.getBox(0.06, 0.42, 0.68), s * 1.19, 2.28, doorZ));
      }
    },
    false,
    false
  );
  windshield.userData.hideIn1PCockpit = true;
  group.userData.cockpitCanopyParts = [cabRoof, windshield];

  // =========================================================================
  // 4. B-KIT APPLIQUE DOOR ARMOR, SADDLE FUEL TANKS, AIR RESERVOIRS & WINCH (eraMat / barrelMat)
  // =========================================================================
  _addTruckMerged(
    group,
    `truck6x6:${sideTag}:armorEra`,
    ctx,
    eraMat,
    (p) => {
      const doorZ = isUS ? -2.35 : -2.05;
      for (const s of [-1, 1]) {
        // Bolt-on armored crew door panels + heavy exterior ballistic hinges
        p.push(_tPart(ctx.getBox(0.11, 0.78, 0.96), s * 1.22, 1.62, doorZ));
        p.push(_tPart(ctx.getBox(0.1, 0.48, 0.88), s * 1.2, 2.26, doorZ));
        p.push(_tPart(ctx.getBox(0.14, 0.09, 0.14), s * 1.24, 1.84, doorZ - 0.38));
        p.push(_tPart(ctx.getBox(0.14, 0.09, 0.14), s * 1.24, 1.42, doorZ - 0.38));

        // Saddle diesel fuel tanks + compressed-air brake tanks between steer & bogie axles
        if (isUS) {
          p.push(_tPart(ctx.getBox(0.48, 0.48, 1.24), s * 1.02, 0.86, -0.45));
        } else {
          p.push(_tPart(ctx.getCyl(0.26, 0.26, 1.28, 10), s * 1.0, 0.86, -0.25, Math.PI / 2, 0, 0));
          p.push(_tPart(ctx.getBox(0.44, 0.36, 0.56), -1.0, 0.9, -1.05));
        }
      }
      if (!isUS) {
        // Spare wheel CTIS hub cap behind KamAZ cab
        p.push(_tPart(ctx.getCyl(0.32, 0.32, 0.4, 10, Math.PI / 2), 0.62, 1.82, -0.96));
      }
    },
    true,
    false
  );

  _addTruckMerged(
    group,
    `truck6x6:${sideTag}:steelHardware`,
    ctx,
    barrelMat,
    (p) => {
      // Front Warn winch cable drum + forged D-ring recovery shackles + rear tow shackles + whip antenna
      p.push(_tPart(ctx.getCyl(0.11, 0.11, 0.52, 8, Math.PI / 2), 0, 0.84, -3.78));
      for (const s of [-1, 1]) {
        p.push(_tPart(ctx.getBox(0.08, 0.13, 0.16), s * 0.88, 0.8, -3.8));
        p.push(_tPart(ctx.getBox(0.08, 0.13, 0.16), s * 0.88, 0.86, 3.72));
      }
      p.push(_tPart(ctx.getCyl(0.016, 0.026, 1.38, 6), -1.16, 3.35, -1.42, -0.14, 0, 0));
    },
    false,
    false
  );

  // =========================================================================
  // 5. MULTI-RIBBED TACTICAL CANVAS HOOD, SLATTED WOOD TROOP BENCHES & SUPPLY CARGO
  // =========================================================================
  _addTruckMerged(
    group,
    `truck6x6:${sideTag}:canvasHood`,
    ctx,
    canvasMat,
    (p) => {
      // Forward covered supply bay tactical canvas hood + rolled side tarps
      p.push(_tPart(ctx.getBox(2.44, 0.88, 1.48), 0, 2.48, 0.05));
      p.push(_tPart(ctx.getBox(2.26, 0.22, 1.48), 0, 2.94, 0.05));
      for (const s of [-1, 1]) {
        p.push(_tPart(ctx.getCyl(0.11, 0.11, 2.75, 8), s * 1.18, 2.86, 2.08, Math.PI / 2, 0, 0));
      }
    },
    true,
    false
  );

  _addTruckMerged(
    group,
    `truck6x6:${sideTag}:woodBenches`,
    ctx,
    _truckWoodMat,
    (p) => {
      for (const s of [-1, 1]) {
        // Slatted hardwood 4-man troop bench seats + backrests + cargo pallet skids
        p.push(_tPart(ctx.getBox(0.46, 0.08, 2.72), s * 0.86, 1.6, 2.08));
        p.push(_tPart(ctx.getBox(0.07, 0.28, 2.72), s * 1.08, 1.88, 2.08));
      }
      p.push(_tPart(ctx.getBox(1.88, 0.1, 1.18), 0, 1.34, 0.05));
    },
    false,
    false
  );

  _addTruckMerged(
    group,
    `truck6x6:${sideTag}:supplyCargo`,
    ctx,
    _truckSupplyMat,
    (p) => {
      // Stacked NATO/Russian ammo crates, artillery shell cases & field ration trunks
      p.push(_tPart(ctx.getBox(0.82, 0.54, 0.86), -0.48, 1.66, 0.02));
      p.push(_tPart(ctx.getBox(0.82, 0.48, 0.84), 0.48, 1.63, 0.04));
      p.push(_tPart(ctx.getBox(0.68, 0.36, 0.62), -0.44, 2.11, 0.02, 0, 0.08, 0));
      p.push(_tPart(ctx.getBox(0.56, 0.42, 0.38), 0.52, 1.54, 0.72));
    },
    true,
    false
  );

  _addTruckMerged(
    group,
    `truck6x6:${sideTag}:jerryCans`,
    ctx,
    _truckJerryRedMat,
    (p) => {
      // Twin strapped steel fuel Jerry cans & trauma kit inside supply bay
      p.push(_tPart(ctx.getBox(0.22, 0.46, 0.34), 0.24, 2.1, 0.08));
      p.push(_tPart(ctx.getBox(0.22, 0.46, 0.34), 0.52, 2.1, 0.08));
    },
    false,
    false
  );

  // =========================================================================
  // 6. LED PROJECTOR HEADLIGHTS (-Z FRONT), CAB MARKER LIGHTS & RED TAILLIGHTS (+Z REAR)
  // =========================================================================
  _addTruckMerged(
    group,
    `truck6x6:${sideTag}:headlights`,
    ctx,
    _truckHeadlightMat,
    (p) => {
      const hz = isUS ? -3.52 : -3.62;
      for (const s of [-1, 1]) {
        p.push(_tPart(ctx.getBox(0.28, 0.16, 0.06), s * 0.96, 1.24, hz));
        p.push(_tPart(ctx.getCyl(0.075, 0.075, 0.06, 8), s * 0.68, 0.84, -3.76, Math.PI / 2, 0, 0));
      }
    },
    false,
    false
  );

  _addTruckMerged(
    group,
    `truck6x6:${sideTag}:amberMarkers`,
    ctx,
    _truckAmberMat,
    (p) => {
      const roofZ = isUS ? -3.32 : -2.82;
      for (const mx of [-0.36, 0, 0.36]) {
        p.push(_tPart(ctx.getBox(0.11, 0.06, 0.08), mx, 2.81, roofZ));
      }
      for (const s of [-1, 1]) {
        p.push(_tPart(ctx.getBox(0.12, 0.08, 0.06), s * 1.14, 1.24, isUS ? -3.52 : -3.62));
      }
    },
    false,
    false
  );

  _addTruckMerged(
    group,
    `truck6x6:${sideTag}:taillights`,
    ctx,
    _truckTaillightMat,
    (p) => {
      for (const s of [-1, 1]) {
        p.push(_tPart(ctx.getBox(0.24, 0.12, 0.06), s * 0.96, 0.92, 3.72));
        p.push(_tPart(ctx.getBox(0.18, 0.1, 0.05), s * 1.06, 1.38, 3.61));
      }
    },
    false,
    false
  );

  // =========================================================================
  // 7. CAB ROOF SKATE-RING BALLISTIC SHIELD & .50 CAL M2HB / 12.7MM KORD TURRET
  //    `turretPivot` at (0.45, 2.82, -2.15): local +Z points forward (-Z world)
  //    when vehicles.js applies `turretPivot.rotation.y = turretYaw - yaw + Math.PI`!
  //    All turret geometry kept <= 0.30 local Y (<= 3.12 world Y < 3.18 optic / 3.28 1P).
  // =========================================================================
  turretPivot.position.set(0.45, 2.82, -2.15);

  _addTruckMerged(
    turretPivot,
    `truck6x6:${sideTag}:turretShield`,
    ctx,
    eraMat,
    (p) => {
      // Circular roof skate-ring collar + angled front/cheek ballistic gun-shield plates
      p.push(_tPart(ctx.getCyl(0.46, 0.5, 0.09, 12), 0, -0.02, 0));
      p.push(_tPart(ctx.getBox(0.38, 0.24, 0.055), 0, 0.13, 0.44, -0.14, 0, 0));
      for (const s of [-1, 1]) {
        p.push(_tPart(ctx.getBox(0.32, 0.24, 0.055), s * 0.32, 0.13, 0.34, -0.1, s * 0.58, 0));
        p.push(_tPart(ctx.getBox(0.055, 0.2, 0.36), s * 0.45, 0.11, 0.02));
      }
      // Side .50 cal / 12.7mm ammo box on pintle cradle
      p.push(_tPart(ctx.getBox(0.17, 0.16, 0.3), isUS ? -0.24 : 0.24, 0.13, 0.1));
    },
    true,
    false
  );

  _addTruckMerged(
    turretPivot,
    `truck6x6:${sideTag}:turretOptic`,
    ctx,
    _truckOpticMat,
    (p) => {
      p.push(_tPart(ctx.getBox(0.18, 0.075, 0.065), 0, 0.21, 0.45));
    },
    false,
    false
  );

  const barrelGroup = new THREE.Group();
  barrelGroup.position.set(0, 0.12, 0.12);

  _addTruckMerged(
    barrelGroup,
    `truck6x6:${sideTag}:bgDark`,
    ctx,
    darkMat,
    (p) => {
      // Heavy HMG receiver, feed cover, spade grips, perforated barrel jacket & muzzle brake
      p.push(_tPart(ctx.getBox(0.16, 0.16, 0.56), 0, 0.02, 0.02));
      for (const s of [-1, 1]) {
        p.push(_tPart(ctx.getCyl(0.018, 0.018, 0.14, 6), s * 0.075, 0.01, -0.32));
      }
      p.push(_tPart(ctx.getCyl(0.05, 0.055, 0.38, 8), 0, 0.03, 0.48, Math.PI / 2, 0, 0));
      p.push(_tPart(ctx.getBox(0.085, 0.065, 0.14), 0, 0.03, 1.42));
    },
    true,
    false
  );

  _addTruckMerged(
    barrelGroup,
    `truck6x6:${sideTag}:bgBarrel`,
    ctx,
    barrelMat,
    (p) => {
      p.push(_tPart(ctx.getCyl(0.032, 0.04, 1.02, 8), 0, 0.03, 0.88, Math.PI / 2, 0, 0));
    },
    true,
    false
  );

  turretPivot.add(barrelGroup);
  return { barrelGroup };
}
