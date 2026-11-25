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

export function buildTroopTruckModel(ctx) {
  const { isUS, group, wheels, turretPivot, hullMat, eraMat, darkMat, barrelMat, glassMat, getTreadTire } =
    ctx;

  const canvasMat = new THREE.MeshStandardMaterial({
    color: isUS ? 0x8d7f5e : 0x46543f,
    roughness: 0.88,
    metalness: 0.05,
    flatShading: true
  });
  const woodBenchMat = new THREE.MeshStandardMaterial({
    color: 0x6e4f32,
    roughness: 0.82,
    flatShading: true
  });
  const supplyCrateMat = new THREE.MeshStandardMaterial({
    color: 0x4b5320,
    roughness: 0.72,
    flatShading: true
  });
  const headlightMat = new THREE.MeshBasicMaterial({ color: 0xfff3c4 });

  // 1. Heavy 6x6 Frame Rails & Bumpers (Length ~7.2m: Cab -3.4..-1.2, Cargo Troop Bed -1.0..+3.5)
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.42, 7.1), darkMat);
  chassis.position.set(0, 0.82, 0.05);
  chassis.castShadow = true;
  group.add(chassis);

  const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(2.48, 0.36, 0.34), darkMat);
  frontBumper.position.set(0, 0.78, -3.58);
  group.add(frontBumper);

  // 2. 6 Heavy Off-Road 6x6 Military Tires (Front Steer Axle + Tandem Rear Drive Axles)
  const tireGeo = getTreadTire
    ? getTreadTire(0.56, 0.38, 12, 10, 0.4, 0.06, 0.12, 0.56)
    : new THREE.CylinderGeometry(0.56, 0.56, 0.38, 12);
  if (!getTreadTire) tireGeo.rotateZ(Math.PI / 2);

  for (const az of [-2.35, 1.15, 2.55]) {
    for (const side of [-1, 1]) {
      const wheel = new THREE.Mesh(tireGeo, darkMat);
      wheel.position.set(side * 1.18, 0.56, az);
      wheel.castShadow = true;
      group.add(wheel);
      wheels.push(wheel);
    }
  }

  // 3. Armored Military Cab-Over-Engine (M1083 MTV / KamAZ-5350) + Split Windshield
  const cabLower = new THREE.Mesh(new THREE.BoxGeometry(2.42, 1.08, 2.15), hullMat);
  cabLower.position.set(0, 1.52, -2.35);
  cabLower.castShadow = true;
  cabLower.receiveShadow = true;
  group.add(cabLower);

  const cabRoof = new THREE.Mesh(new THREE.BoxGeometry(2.38, 0.22, 2.05), hullMat);
  cabRoof.position.set(0, 2.72, -2.3);
  cabRoof.userData.hideIn1PCockpit = true;
  group.add(cabRoof);

  const windshield = new THREE.Mesh(new THREE.BoxGeometry(2.22, 0.68, 0.12), glassMat);
  windshield.position.set(0, 2.32, -3.32);
  windshield.rotation.x = 0.12;
  windshield.userData.hideIn1PCockpit = true;
  group.add(windshield);

  const cabBackWall = new THREE.Mesh(new THREE.BoxGeometry(2.38, 0.75, 0.18), hullMat);
  cabBackWall.position.set(0, 2.32, -1.32);
  group.add(cabBackWall);

  group.userData.cockpitCanopyParts = [cabRoof, windshield];

  // Grille & Headlights
  const grille = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.62, 0.08), darkMat);
  grille.position.set(0, 1.42, -3.44);
  group.add(grille);
  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.18, 0.08), headlightMat);
    lamp.position.set(side * 0.96, 1.28, -3.44);
    group.add(lamp);

    // Side Fuel Tank & Step Ladder
    const tank = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.45, 1.15), eraMat);
    tank.position.set(side * 1.08, 0.88, -0.55);
    group.add(tank);
  }

  // 4. Open-Back 8-Soldier Troop & Logistics Cargo Bed (-1.05 .. +3.55)
  const bedFloor = new THREE.Mesh(new THREE.BoxGeometry(2.46, 0.24, 4.65), hullMat);
  bedFloor.position.set(0, 1.16, 1.25);
  bedFloor.castShadow = true;
  bedFloor.receiveShadow = true;
  group.add(bedFloor);

  // Side Slatted Stake Walls + Twin Troop Benches + Folded Canvas Canopy Ribs
  for (const side of [-1, 1]) {
    const sideWall = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.88, 4.6), hullMat);
    sideWall.position.set(side * 1.16, 1.68, 1.25);
    sideWall.castShadow = true;
    group.add(sideWall);

    const troopBench = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 3.65), woodBenchMat);
    troopBench.position.set(side * 0.86, 1.58, 1.65);
    group.add(troopBench);
  }

  const tailgate = new THREE.Mesh(new THREE.BoxGeometry(2.38, 0.72, 0.14), hullMat);
  tailgate.position.set(0, 1.62, 3.52);
  group.add(tailgate);

  // Forward Rolled Canvas Cover Arch & Logistics Ammo/Supply Crates inside the front of the bed!
  const frontCanvasHood = new THREE.Mesh(new THREE.BoxGeometry(2.44, 1.15, 1.25), canvasMat);
  frontCanvasHood.position.set(0, 2.38, -0.42);
  frontCanvasHood.castShadow = true;
  group.add(frontCanvasHood);

  for (const mz of [0.85, 2.1, 3.35]) {
    const archTop = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.07, 0.07), darkMat);
    archTop.position.set(0, 2.86, mz);
    group.add(archTop);
    for (const side of [-1, 1]) {
      const archPost = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.78, 0.07), darkMat);
      archPost.position.set(side * 1.16, 2.48, mz);
      group.add(archPost);
    }
  }

  for (const cx of [-0.46, 0.46]) {
    const supplyBox = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.56, 0.78), supplyCrateMat);
    supplyBox.position.set(cx, 1.56, -0.42);
    group.add(supplyBox);
  }

  // 5. Cab Roof Ring-Mount 7.62mm Convoy Defense MG (`turretPivot` + `barrelGroup` for [F2] Co-Driver!)
  turretPivot.position.set(0.45, 2.84, -2.15);
  const ringShield = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.22, 10), eraMat);
  turretPivot.add(ringShield);

  const barrelGroup = new THREE.Group();
  const mgReceiver = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.55), darkMat);
  mgReceiver.position.set(0, 0.16, 0.1);
  const mgBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.85, 6), barrelMat);
  mgBarrel.rotation.x = Math.PI / 2;
  mgBarrel.position.set(0, 0.16, 0.65);
  barrelGroup.add(mgReceiver, mgBarrel);
  turretPivot.add(barrelGroup);

  return { barrelGroup };
}
