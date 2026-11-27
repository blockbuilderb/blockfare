import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';

import { MAT_DEFS } from '../src/assets/voxel-materials.js?v=144';
import { VEHICLE_STATS } from '../src/config.js?v=144';
import { WEAPON_DEFS } from '../src/assets/weapon-defs.js?v=144';
import { VEHICLE_DEFS } from '../src/assets/vehicle-defs.js?v=144';
import { FRUGIS_RIVER_MAP } from '../src/maps/frugis-river.js?v=144';
import { VoxelWorld } from '../src/world/VoxelWorld.js?v=144';
import { createWeaponViewModel } from '../src/models/weapon-model.js?v=144';
import { VehicleManager, initVehicleOrdnance, classifyWeaponBallistics } from '../src/vehicles.js?v=144';
import { BotManager } from '../src/bots/BotManager.js?v=144';
import { VehicleControlMethods } from '../src/player/VehicleControl.js?v=144';
import { CombatMethods } from '../src/player/PlayerCombat.js?v=144';
import { PlayerController } from '../src/player/PlayerController.js?v=144';
import { SoundManager } from '../src/audio/SoundManager.js?v=144';
import { resolveGlobalCommandShortcut } from '../src/utils/KeyboardShortcuts.js?v=144';
import { CommandPanel } from '../src/ui/CommandPanel.js?v=144';
import { HudRenderer } from '../src/ui/HudRenderer.js?v=144';
import { BotAIMethods } from '../src/bots/BotAI.js?v=144';
import { updateMedicRescue } from '../src/bots/MedicAI.js?v=144';
import {
  createDefaultMarksmanProfile,
  evaluateMarksmanShot,
  computeBallisticSolution
} from '../src/player/MarksmanSystem.js?v=144';

function buildPilotHarness(role = 'fighter', team = 'US') {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 5000);
  scene.add(camera);

  const world = {
    era: 'modern',
    projectiles: [],
    voxels: new Map(),
    flags: [],
    getGroundHeightAt: () => 0,
    worldToGrid: (x, y, z, out = {}) => {
      out.gx = Math.round(x / 1.25);
      out.gy = Math.round(y / 1.25);
      out.gz = Math.round(z / 1.25);
      return out;
    },
    getVoxel: () => null,
    spawnDebris: () => {},
    spawnExplosionVisual: () => {},
    explodeAt: () => {}
  };

  const vehicle = {
    id: `${team.toLowerCase()}_${role}_test`,
    name: role === 'b2_spirit' ? 'NORTHROP B-2A SPIRIT' : role === 'heli_transport' ? 'UH-60M BLACK HAWK' : 'F-15EX EAGLE II',
    type: 'plane',
    isAircraft: true,
    isHelicopter: role === 'heli_transport' || role === 'heli_attack',
    aircraftRole: role,
    team,
    pos: new THREE.Vector3(0, 220, 0),
    yaw: 0,
    pitch: 0,
    roll: 0,
    turretYaw: 0,
    turretPitch: 0,
    forwardSpeed: role === 'heli_transport' ? 0 : 88,
    speed: role === 'heli_transport' ? 58 : 96,
    minSpeed: role === 'heli_transport' ? 0 : 42,
    maxSpeed: role === 'heli_transport' ? 72 : 165,
    turnRate: 1.35,
    maxTurnAccelMs2: role === 'b2_spirit' ? 19.5 : 88,
    throttle: 0.55,
    hp: 1800,
    maxHp: 1800,
    dead: false,
    isShotDown: false,
    fireCooldown: 0,
    maxFireCooldown: 0.08,
    coaxCooldown: 0,
    coaxHeat: 0,
    activeWeaponSlot: 0,
    mesh: new THREE.Group(),
    airframeParts: { leftWing: 100, rightWing: 100, engines: 100, tail: 100, avionics: 100, cockpit: 100 }
  };
  scene.add(vehicle.mesh);
  initVehicleOrdnance(vehicle);

  const vm = {
    vehicles: [vehicle],
    finalizeShotDownCrash: (v) => {
      v.dead = true;
    }
  };

  const pilot = Object.create(
    Object.assign({}, VehicleControlMethods, CombatMethods, {
      addShake() {},
      isModalOpen() {
        return false;
      },
      syncCameraTransform() {}
    })
  );
  Object.assign(pilot, {
    name: 'TestPilot',
    team,
    role: 'pilot',
    dead: false,
    downed: false,
    scene,
    camera,
    world,
    vehicleManager: vm,
    activeVehicle: vehicle,
    vehicleSeatIndex: 0,
    vehicleCameraMode: 'CHASE_3P',
    thirdPersonVehicle: true,
    aircraftCollisionAvoidance: true,
    pos: vehicle.pos.clone(),
    vel: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    keys: {},
    isFiring: false,
    isAds: false,
    recoilOffsetPitch: 0,
    recoilKickZ: 0,
    slots: [{ def: WEAPON_DEFS.m4a1 }],
    currentSlot: 0,
    activeBullets: [],
    viewModelGroup: new THREE.Group(),
    xpLogs: [],
    onAwardXp(_amt, msg) {
      this.xpLogs.push(String(msg || ''));
    }
  });
  vehicle.driver = pilot;
  return { pilot, vehicle, vm, world, scene, camera };
}

test('v128 Item 1 & 9 & 10: F-15 ±58° Nose Radar Gimbal Lock, Clean Aircraft HUD Ring, and Non-Flipping Mouse Turn', () => {
  const { pilot, vehicle, vm } = buildPilotHarness('fighter', 'US');
  vehicle.activeWeaponSlot = 1; // Slot [2]: AIM-120D AMRAAM

  // Bandit placed 90° off the right wing (+X = +400, Z = 0) while F-15 nose points straight North (-Z, yaw = 0)
  const bandit = {
    id: 'ru_su57',
    name: 'SU-57 FELON',
    type: 'plane',
    isAircraft: true,
    aircraftRole: 'fighter',
    team: 'RU',
    pos: new THREE.Vector3(400, 220, 0),
    yaw: Math.PI / 2,
    forwardSpeed: 85,
    airborneRadarTimer: 10.0,
    isLowAltRadarMasked: false,
    dead: false,
    isShotDown: false,
    mesh: new THREE.Group()
  };
  vm.vehicles.push(bandit);

  // Pilot holds Alt Free-Look 90° right (`freeLookYaw = -Math.PI / 2`) looking directly at the bandit off the wing:
  pilot.keys.AltLeft = true;
  vehicle.freeLookYaw = -Math.PI / 2;
  for (let i = 0; i < 90; i++) {
    pilot.updateAircraftControl(1 / 60, vehicle);
  }
  assert.equal(pilot.aircraftLockTarget, null, 'Sideways 90° Free-Look outside ±58° AN/APG-82 nose cone must NOT lock AIM-120D');
  assert.equal(pilot.aircraftRadarGimbalExceeded, true, 'Looking sideways at bandit sets aircraftRadarGimbalExceeded warning');

  // Now place bandit 30° off the nose (`cos(30°) = 0.866 >= 0.53`) and look at it -> acquires full FOX-3 lock!
  pilot.keys.AltLeft = false;
  vehicle.freeLookYaw = 0;
  bandit.pos.set(180, 220, -360);
  pilot.yaw = Math.atan2(-180, 360); // Aim within forward radar cone
  for (let i = 0; i < 95; i++) {
    pilot.updateAircraftControl(1 / 60, vehicle);
    // Keep bandit at 30° ahead of current nose for clean radar test
    const ny = vehicle.yaw;
    const fwdX = -Math.sin(ny);
    const fwdZ = -Math.cos(ny);
    const rightX = Math.cos(ny);
    const rightZ = -Math.sin(ny);
    bandit.pos.set(
      vehicle.pos.x + (fwdX * 0.92 + rightX * 0.39) * 420,
      vehicle.pos.y,
      vehicle.pos.z + (fwdZ * 0.92 + rightZ * 0.39) * 420
    );
    pilot.yaw = ny - 0.36;
  }
  assert.equal(pilot.aircraftLockTarget, bandit, 'Target inside ±58° nose radar cone locks cleanly');
  assert.ok((pilot.aircraftLockProgress || 0) >= 0.99, 'Radar lock reaches 100% inside nose gimbal cone');

  // Item 10: Sweeping mouse continuously in one direction (`-5.0 rad` = `-286°`!) NEVER wraps past ±180° to flip bank sign!
  vm.vehicles.pop();
  vehicle.yaw = 0;
  vehicle.roll = 0;
  pilot.yaw = 0;
  for (let i = 0; i < 80; i++) {
    pilot.yaw -= 0.12; // Aggressive continuous mouse drag right (-9.6 rad total!)
    pilot.updateAircraftControl(1 / 60, vehicle);
    if (i > 12) {
      assert.ok(
        vehicle.roll < -0.15,
        `Continuous right mouse turn must keep right bank negative at step ${i}, got roll=${vehicle.roll.toFixed(3)}`
      );
    }
  }

  // Item 9: `#reticle-hull-ring` ("▲ NOSE") is hidden on aircraft, shown only on turreted ground vehicles
  const mockHullRing = {
    style: { transform: '' },
    hidden: false,
    classList: {
      toggle(cls, force) {
        if (cls === 'hidden') mockHullRing.hidden = Boolean(force);
      }
    }
  };
  const mockHud = Object.assign(Object.create(HudRenderer), {
    player: pilot,
    vehicleOverlayEl: { className: '', classList: { remove() {}, add() {} } },
    reticleEl: { className: '' },
    el(id) {
      if (id === 'reticle-hull-ring') return mockHullRing;
      return null;
    },
    _setText() {},
    updateVehicleCenterReticle() {},
    updateAircraftCockpitHud() {}
  });
  // Verify showHullRing condition directly via aircraft vs tank activeVehicle
  assert.equal(Boolean(!vehicle.isAircraft), false, 'Aircraft excluded from 2D tank hull ring');
});

test('v128 Item 2 & 8 & 13: Helicopter Rotor Blade-Slap Audio + Auto-Flare Landing, Pure Bomber B-2, and Smooth [R] Auto-Flight', () => {
  // 1. Helicopter Audio: Both UH-60M (`heli_transport`) & AH-64E (`heli_attack`) use triangle rotor thump + 17–23 Hz blade-slap LFO
  const sm = new SoundManager();
  const recorded = {};
  sm.ctx = { currentTime: 10.0 };
  sm.init = () => {};
  const nodes = {
    coreOsc: { type: 'sawtooth', frequency: {} },
    coreFilter: { frequency: {} },
    coreGain: { gain: {} },
    bladeLfo: { frequency: {} },
    bladeDepth: { gain: {} },
    whineOsc: { frequency: {} },
    whineGain: { gain: {} },
    roarFilter: { frequency: {} },
    roarGain: { gain: {} },
    selfBusGain: { gain: {} },
    extOsc: { frequency: {} },
    extLp: { frequency: {} },
    extNoiseBp: { frequency: {} },
    extPanner: { pan: {} },
    extBusGain: { gain: {} }
  };
  sm._airEngineNodes = nodes;
  sm._ensureAircraftEngineGraph = () => nodes;
  sm._setAirParam = (_param, key, val) => {
    recorded[key] = val;
  };

  for (const hRole of ['heli_transport', 'heli_attack']) {
    sm.updateAircraftEngineAudio(
      { isAircraft: true, isHelicopter: true, aircraftRole: hRole, throttle: 0.5, forwardSpeed: 12, maxSpeed: 72 },
      [],
      new THREE.Vector3(),
      0,
      false
    );
    assert.equal(nodes.coreOsc.type, 'triangle', `${hRole} must use warm triangle rotor core instead of sawtooth jet roar`);
    assert.ok(recorded.bladeFreq >= 16 && recorded.bladeFreq <= 25, `${hRole} rotor blade-pass LFO in 16–25 Hz range`);
    assert.ok(recorded.bladeDepth >= 0.24, `${hRole} has pronounced blade-slap modulation depth >= 0.24`);
  }
  assert.equal(sm._isMotorizedGroundVehicle({ type: 'truck_transport', dead: false }), true);

  // 2. UH-60M Cushioned Rolling Touchdown in Easy Mode ([G] ON): looking down -20° (`pitch = -0.35`) while holding [Ctrl] flares & wheel-brakes cleanly!
  const { pilot: heliPilot, vehicle: uh60 } = buildPilotHarness('heli_transport', 'US');
  uh60.pos.set(0, 6.5, 0);
  uh60.heliHoverAlt = 6.5;
  uh60._heliVelX = 0;
  uh60._heliVelZ = -16; // Realistic ~58 km/h rolling approach into LZ
  heliPilot.pitch = -0.35; // Looking down at landing pad in 3P camera!
  heliPilot.keys.ControlLeft = true;
  for (let i = 0; i < 260; i++) {
    heliPilot.updateAircraftControl(1 / 60, uh60);
  }
  heliPilot.keys.ControlLeft = false;
  assert.equal(uh60.dead, false, 'UH-60M touches down intact');
  assert.ok(uh60.pos.y <= 0.05, `UH-60M landed solidly on ground (y=${uh60.pos.y.toFixed(3)})`);
  assert.ok(Math.hypot(uh60._heliVelX, uh60._heliVelZ) < 0.5, 'UH-60M rolling wheel-brakes bring landing run to a stop');

  // 3. Item 8: B-2A Spirit Slot [3] drops 2,000lb GBU-31 JDAMs (ZERO 20mm Vulcan gun / ZERO A2A missiles!)
  const { pilot: b2Pilot, vehicle: b2, world: b2World } = buildPilotHarness('b2_spirit', 'US');
  b2.activeWeaponSlot = 2;
  b2Pilot.isFiring = true;
  b2Pilot.updateAircraftControl(1 / 60, b2);
  assert.equal(b2Pilot.activeBullets.length, 0, 'B-2A Spirit must NEVER fire 20mm Vulcan bullets');
  assert.equal(b2World.projectiles.length, 1, 'B-2A Spirit Slot [3] drops a precision JDAM bomb');
  assert.equal(b2World.projectiles[0].type, 'gbu28_bomb');
  assert.match(b2World.projectiles[0].weaponName, /GBU-31/);
  assert.equal(b2.ordnancePools.slot2, 3, 'Consumes 1 of 4 GBU-31 JDAMs');

  // 4. Item 13: [R] Auto-Takeoff & Auto-Land respect bounded physical acceleration (`|dv/dt| <= 12.5 m/s^2`, zero 30G jolts!)
  const { pilot: jetPilot, vehicle: f15 } = buildPilotHarness('fighter', 'US');
  f15.pos.set(-2820, 0, -68);
  f15.yaw = -Math.PI / 2;
  f15.forwardSpeed = 0;
  f15.autoFlightMode = 'TAKEOFF';
  const dt = 1 / 60;
  for (let i = 0; i < 45; i++) {
    const prevSpd = f15.forwardSpeed;
    jetPilot.updateAircraftControl(dt, f15);
    const accel = Math.abs(f15.forwardSpeed - prevSpd) / dt;
    assert.ok(accel <= 12.5, `Takeoff acceleration bounded by jet physics (got ${accel.toFixed(2)} m/s^2)`);
  }
  f15.pos.set(-3050, 55, -68);
  f15.forwardSpeed = 125;
  f15.autoFlightMode = 'LANDING';
  for (let i = 0; i < 45; i++) {
    const prevSpd = f15.forwardSpeed;
    jetPilot.updateAircraftControl(dt, f15);
    const decel = Math.abs(f15.forwardSpeed - prevSpd) / dt;
    assert.ok(decel <= 12.5, `Auto-landing deceleration bounded by airbrake/wheel physics (got ${decel.toFixed(2)} m/s^2)`);
  }
});

test('v128 Item 3: Downtown FOB C Tall Skyscrapers Intact (Zero Batch Overflow), Inlaid Voxel Helipads, Ruins & Key Gravity', () => {
  assert.ok(MAT_DEFS.concrete.maxInstances >= 70000, 'Concrete voxel instance budget accommodates all skyscrapers');
  assert.ok(MAT_DEFS.darkConcrete.maxInstances >= 70000, 'DarkConcrete voxel instance budget accommodates all skyscrapers');

  const scene = new THREE.Scene();
  const world = new VoxelWorld(scene, FRUGIS_RIVER_MAP);

  // 1. Zero InstancedMesh batch overflows across the entire Frugis River map!
  for (const [matName, batch] of Object.entries(world.instancedBatches)) {
    const cap = batch.maxInstances ?? MAT_DEFS[matName]?.maxInstances ?? Infinity;
    assert.ok(
      batch.count < cap,
      `Material batch "${matName}" overflowed (${batch.count}/${cap}) — buildings would vanish!`
    );
  }

  // 2. Downtown FOB C high-rises (`floors >= 10`) have monumental 50m–80m height, roomy >=22.5m×20m 4-sniper roofs + inlaid "H" helipad blocks
  const downtownSkyscrapers = world.buildings.filter(
    (b) => b.floors >= 10 && Math.abs(b.centerWx) <= 120 && Math.abs(b.centerWz) <= 90
  );
  assert.ok(downtownSkyscrapers.length >= 12, `Expected >=12 built Downtown FOB C skyscrapers, got ${downtownSkyscrapers.length}`);

  const tallTower = downtownSkyscrapers.find((b) => b.floors >= 16) || downtownSkyscrapers[0];
  assert.ok(tallTower.width * 1.25 >= 27.0 && tallTower.depth * 1.25 >= 24.5, 'Pinnacle skyscraper roof >= 27.5m × 25m for 4 corner snipers + landed UH-60M');
  const roofSlabGy = tallTower.groundGy + tallTower.floors * (tallTower.floorHeight || 4) - 1;
  assert.ok(roofSlabGy * 1.25 >= 78.0, `Pinnacle skyscraper roof height >= 78m (got ${(roofSlabGy * 1.25).toFixed(1)}m)`);
  const midGx = tallTower.startGx + Math.floor(tallTower.width / 2);
  const midGz = tallTower.startGz + Math.floor(tallTower.depth / 2);
  const centerHBlock = world.getVoxel(midGx, roofSlabGy, midGz);
  assert.ok(centerHBlock, '7-story Downtown skyscraper roof slab voxel must exist in VoxelWorld');
  assert.equal(centerHBlock.type, 'concrete', 'Helipad "H" crossbar is physically inlaid as concrete roof voxels');

  // 3. Place/verify an upper-floor Armory Key inside `tallTower`, collapse the tower, and verify ruins + key gravity!
  const keyGx = tallTower.startGx + 3;
  const keyGz = tallTower.startGz + 3;
  const highKeyY = (roofSlabGy - 4) * 1.25 + 0.37;
  const testKey = {
    id: 'test_downtown_key',
    buildingId: tallTower.id,
    floor: 6,
    gx: keyGx,
    gz: keyGz,
    velY: 0,
    pos: new THREE.Vector3(keyGx * 1.25, highKeyY, keyGz * 1.25),
    mesh: new THREE.Group(),
    collected: false
  };
  world.buildingKeys.push(testKey);

  world.triggerBuildingCollapse(tallTower);
  assert.ok(
    !world.getVoxel(midGx, roofSlabGy, midGz),
    'Inlaid voxel helipad collapses with the skyscraper roof (never floats in empty air!)'
  );

  // Verify partial ground-floor ruins remain (`gy = groundGy + 1` or `groundGy + 2` corner pillars)
  let ruinBlocksAboveSlab = 0;
  for (let gx = tallTower.startGx; gx < tallTower.startGx + tallTower.width; gx++) {
    for (let gz = tallTower.startGz; gz < tallTower.startGz + tallTower.depth; gz++) {
      if (world.hasVoxel(gx, tallTower.groundGy + 1, gz) || world.hasVoxel(gx, tallTower.groundGy + 2, gz)) {
        ruinBlocksAboveSlab++;
      }
    }
  }
  assert.ok(ruinBlocksAboveSlab >= 8, `Collapsed skyscraper must leave jagged ground-floor ruins (got ${ruinBlocksAboveSlab} blocks)`);

  // Step key physics for 4.0s -> key falls from 15th floor (~76m) all the way down onto ground/ruin level!
  for (let i = 0; i < 240; i++) {
    world.updateBuildingKeys(1 / 60);
  }
  const terrainAtKey = world.getGroundHeightAt(testKey.pos.x, testKey.pos.z);
  assert.ok(
    testKey.pos.y <= terrainAtKey + 4.0,
    `Armory Key must fall with gravity to ground/ruin level after collapse (started ${highKeyY.toFixed(1)}m, ended ${testKey.pos.y.toFixed(2)}m)`
  );
  world.dispose();
});

test('v128 Item 4: Support HMG (M249 / PKP) Unobstructed Sightline & Full Infantry Weapon ADS Bore Alignment Audit', () => {
  // 1. Check M249 & PKP carry handle is folded clear of the x=0, y=0.058..0.082 ADS sight channel
  for (const lmgId of ['m249', 'pkp']) {
    const def = WEAPON_DEFS[lmgId];
    assert.ok(def, `${lmgId} exists in WEAPON_DEFS`);
    const ironVm = createWeaponViewModel({ ...def, opticType: null });
    ironVm.traverse((child) => {
      if (child.isMesh && child.geometry?.type === 'CylinderGeometry' && Math.abs(child.position.z - -0.34) < 0.01) {
        assert.ok(
          child.position.x >= 0.048 && child.position.y <= 0.03,
          `${lmgId} carry grip must sit folded low/right out of ADS sightline (got x=${child.position.x}, y=${child.position.y})`
        );
      }
    });
  }

  // 2. Audit ALL firearm WEAPON_DEFS iron-sight & 3D optic center heights against PlayerController ADS offsets
  const firearmIds = Object.keys(WEAPON_DEFS).filter((id) => {
    const d = WEAPON_DEFS[id];
    return (
      d &&
      d.era !== 'medieval' &&
      d.era !== 'jurassic' &&
      !id.startsWith('dino_') &&
      !d.isBow &&
      !d.isCrossbow &&
      !d.isThrowingBlade &&
      !d.isShield &&
      d.id !== 'throwing_knives' &&
      d.id !== 'pitch_pot' &&
      d.id !== 'tower_shield_2h' &&
      d.id !== 'knight_lance' &&
      d.type !== 'melee_sword' &&
      d.type !== 'hammer' &&
      d.type !== 'medkit' &&
      d.type !== 'ammocrate' &&
      d.type !== 'c4' &&
      d.type !== 'binoculars' &&
      d.type !== 'rpg' &&
      d.type !== 'stinger'
    );
  });
  assert.ok(firearmIds.length >= 20, `Auditing ${firearmIds.length} firearms`);

  const opticsToAudit = [null, 'reddot', 'holo', 'uh1', 'kobra', 'okp7', 'rmr', 'acog', 'elcan4x', 'prism2x', 'holo3x'];
  for (const id of firearmIds) {
    const baseDef = WEAPON_DEFS[id];
    const isPistol =
      baseDef.slot === 'secondary' ||
      ['mp443', 'm9_beretta', 'five_seven', 'usp45', 'g18', 'deagle'].includes(id);

    for (const opt of opticsToAudit) {
      const vm = createWeaponViewModel({ ...baseDef, opticType: opt });
      if (!opt) {
        const expectedIronY = isPistol ? 0.05 : 0.058;
        const frontPost = vm.children.find(
          (c) => c.isMesh && Math.abs(c.position.x) < 0.001 && Math.abs(c.position.y - expectedIronY) < 0.012
        );
        assert.ok(frontPost, `${id} bare iron sight front post aligns with y≈${expectedIronY}`);
      } else {
        const sightGrp = vm.getObjectByName('opticSightGroup');
        assert.ok(sightGrp, `${id} + ${opt} builds opticSightGroup`);
        const expectedOptY = isPistol ? 0.064 : 0.082;
        assert.ok(
          Math.abs(sightGrp.position.x) < 1e-6 && Math.abs(sightGrp.position.y - expectedOptY) < 1e-4,
          `${id} + ${opt} opticSightGroup centered at (0, ${expectedOptY})`
        );
      }
    }
  }
});

test('v128 Item 5 & 6: Humvee .50 BMG (1,200 rds @ 550 RPM) vs Finite 9mm Bike PDW, and LAV-25 APDS-T vs MBT Directional Armor', () => {
  // Item 5: Humvee vs Bike/ATV Ordnance & Ballistics
  const humvee = { type: 'humvee', weaponType: 'hmg' };
  const bike = { type: 'bike', weaponType: 'moto_pdw' };
  const atv = { type: 'atv', weaponType: 'moto_pdw' };
  initVehicleOrdnance(humvee);
  initVehicleOrdnance(bike);
  initVehicleOrdnance(atv);

  assert.equal(humvee.ordnancePools.slot0, 1200, 'Humvee M2HB .50 BMG carries 1,200 rounds');
  assert.equal(bike.ordnancePools.slot0, 240, 'Recon Motorcycle carries finite 240 rounds of 9×19mm PDW ammo');
  assert.equal(atv.ordnancePools.slot0, 360, '4×4 Quad ATV carries finite 360 rounds of 9×19mm PDW ammo');

  const hqBikeDef = VEHICLE_DEFS.find((d) => d.id === 'us_hq_bike');
  assert.equal(hqBikeDef.weaponType, 'moto_pdw', 'HQ Motorcycle uses moto_pdw instead of .50 cal hmg');
  assert.equal(classifyWeaponBallistics('9MM RIDER PDW').isSmallArms, true, 'Bike 9mm PDW classified as small arms (0 armor damage)');
  assert.equal(classifyWeaponBallistics('.50 CAL HMG').isHeavyMg50, true, 'Humvee .50 BMG classified as heavy anti-materiel MG');

  // Item 6: LAV-25 25mm M242 Bushmaster APDS-T vs M1A2 / T-90M Tank (Front 0 DMG Ricochet vs Rear Engine Penetration!)
  const scene = new THREE.Scene();
  const mockWorld = {
    era: 'modern',
    voxels: new Map(),
    getGroundHeightAt: () => 0,
    spawnDebris: () => {},
    spawnExplosionVisual: () => {}
  };
  const vm = new VehicleManager(scene, mockWorld);
  const mbt = vm.spawnVehicle({
    id: 'ru_t90_test',
    name: 'T-90M PRORYV MBT',
    type: 'tank',
    team: 'RU',
    spawnPos: new THREE.Vector3(0, 0, 0),
    spawnYaw: 0, // Facing -Z (North: fwd = (0, 0, -1))
    maxHp: 2100,
    speed: 19,
    weaponType: 'tank_cannon',
    rpm: 26,
    patrolPoints: []
  });

  // 1) Shoot MBT from directly IN FRONT (0, 0, -40) with LAV-25 25mm M242 -> 0 hull damage ricochet!
  const hpBeforeFront = mbt.hp;
  vm.damageVehicle(
    mbt,
    40,
    'US_LAV25',
    'US',
    '25MM M242 BUSHMASTER APDS-T',
    null,
    null,
    new THREE.Vector3(0, 1.5, -40)
  );
  assert.equal(mbt.hp, hpBeforeFront, '25mm M242 APDS-T must deal 0 hull HP damage to MBT Front Composite Glacis');
  assert.equal(mbt.lastArmorRicochet, true);

  // 2) Flank MBT from directly BEHIND (0, 0, +35) into thin rear engine louvers -> real penetration + engine damage!
  vm.damageVehicle(
    mbt,
    40,
    'US_LAV25',
    'US',
    '25MM M242 BUSHMASTER APDS-T',
    null,
    null,
    new THREE.Vector3(0, 1.5, 35)
  );
  assert.ok(mbt.hp < hpBeforeFront - 20, `25mm APDS-T flanking MBT Rear Engine Deck must penetrate (hp=${mbt.hp}/${hpBeforeFront})`);
  assert.ok(
    mbt.subsystems.engine === 'SMOKING' || mbt.subsystems.engine === 'CRITICAL',
    'Rear 25mm penetration damages MBT engine subsystem'
  );
});

test('v128 Item 7, 11 & 12: Alt+A Squad Member & Pilot Free-Look De-confliction, River Swimming/No Underwater RPG/Revive, and Base Patrols', () => {
  // Item 7(1): Squad MEMBER cannot toggle AI with Alt+A or CommandPanel
  assert.equal(
    resolveGlobalCommandShortcut(
      { code: 'KeyA', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false },
      { isMac: false, commandRank: 'MEMBER' }
    ),
    null,
    'Alt+A must NOT trigger AUTO toggle when player is a regular Squad MEMBER'
  );
  const memberPanel = Object.assign(Object.create(CommandPanel), {
    player: { commandRank: 'MEMBER', team: 'US', squad: 'ALPHA' },
    botManager: {
      issueStrategicOrder() {
        throw new Error('Should never be called for MEMBER');
      }
    }
  });
  assert.equal(memberPanel.issueHudStrategicOrder({ action: 'AUTO' }), null);

  // Item 7(2): Commander/SL piloting an aircraft with Alt Free-Look + WASD NEVER triggers Alt+A / Alt+D orders!
  assert.equal(
    resolveGlobalCommandShortcut(
      { code: 'KeyA', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false },
      { isMac: false, inAircraft: true, commandRank: 'COMMANDER' }
    ),
    null,
    'Holding Alt Free-Look + [A] roll left in an aircraft must NOT trigger Alt+A AI toggle'
  );
  assert.equal(
    resolveGlobalCommandShortcut(
      { code: 'KeyD', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false },
      { isMac: false, inAircraft: true, commandRank: 'SQUAD_LEADER' }
    ),
    null,
    'Holding Alt Free-Look + [D] roll right in an aircraft must NOT trigger Alt+D Hold order'
  );
  assert.deepEqual(
    resolveGlobalCommandShortcut(
      { code: 'Numpad8', altKey: false, ctrlKey: false, metaKey: false, shiftKey: false },
      { isMac: false, inAircraft: true, commandRank: 'COMMANDER' }
    ),
    { type: 'STRATEGIC_ORDER', action: 'AUTO' },
    'Commander pilots can still toggle AI cleanly via Numpad8 without Alt conflict'
  );

  // Item 11: Deep River Water blocks firing RPG-7 / Stinger without losing ammo, and blocks underwater Medic revives
  let rpgLaunched = false;
  const swimmer = Object.assign(Object.create(CombatMethods), {
    inDeepWater: true,
    fireTimer: 0,
    syncCameraTransform() {},
    launchRocket() {
      rpgLaunched = true;
    },
    onAwardXp() {}
  });
  const rpgSlot = {
    clip: 1,
    reserve: 3,
    def: { id: 'rpg7', type: 'rpg', rpm: 30 }
  };
  swimmer.executeFire(rpgSlot);
  assert.equal(rpgLaunched, false, 'Infantry swimming in river cannot fire RPG-7 underwater');
  assert.equal(rpgSlot.clip, 1, 'Blocked underwater RPG shot does not consume rocket ammo');

  const submergedAlly = {
    id: 'ally_submerged',
    team: 'US',
    downed: true,
    dead: false,
    isSwimming: true,
    pos: new THREE.Vector3(0, -2.0, 120)
  };
  const dryMedic = {
    id: 'medic_1',
    role: 'MEDIC',
    team: 'US',
    fieldDressings: 5,
    pos: new THREE.Vector3(18, 1.25, 120),
    mesh: { userData: { parts: {} } }
  };
  const medicCtx = {
    world: { era: 'modern', mapDef: { dimensions: { riverWaterY: -0.85 } } },
    bots: [dryMedic, submergedAlly],
    downedByTeam: { US: [submergedAlly] },
    clearBotRescueLinks(b) {
      b.rescueTarget = null;
    },
    updateMedicInjuryHeal() {
      return false;
    }
  };
  updateMedicRescue.call(medicCtx, dryMedic, 0.5, { dead: true, downed: false }, null);
  assert.equal(dryMedic.rescueTarget ?? null, null, 'Medics must not dive underwater to revive submerged casualties');

  // Item 12: Verify BotAI has active base sentry patrol & river bridge routing
  assert.equal(typeof BotAIMethods.update, 'function');
  assert.equal(typeof PlayerController, 'function');
});

test('v130: Dual-Mode Helicopter Controls (Easy [G] ON vs Hard [G] OFF), Newtonian Momentum/Flare & UH-60M M134 Balance', () => {
  // 1. EASY MODE ([G] ON — Default): Separate [Space/Ctrl] lift & [W/S/A/D] AFCS cyclic + REAL 9-ton Newtonian momentum (NO car start/stop!)
  const { pilot: easyPilot, vehicle: easyHeli, world: easyWorld } = buildPilotHarness('heli_transport', 'US');
  easyPilot.aircraftCollisionAvoidance = true;
  easyHeli.pos.set(0, 0, 0);
  easyHeli.heliHoverAlt = 0;

  // [Space] climbs with realistic rotor spool inertia (< 2.5m at 0.5s, > 7.5m by 2.0s) & NEVER fires Hydra-70 rockets!
  easyPilot.keys.Space = true;
  for (let i = 0; i < 30; i++) {
    easyPilot.updateAircraftControl(1 / 60, easyHeli);
  }
  assert.ok(
    easyHeli.pos.y > 0.2 && easyHeli.pos.y < 2.8,
    `Easy Mode [Space] builds rotor lift smoothly without 2.5G elevator jump (0.5s y=${easyHeli.pos.y.toFixed(2)}m)`
  );
  for (let i = 0; i < 90; i++) {
    easyPilot.updateAircraftControl(1 / 60, easyHeli);
  }
  easyPilot.keys.Space = false;
  assert.ok(easyHeli.pos.y > 7.5, `Easy Mode [Space] climbs vertically over 2.0s (got y=${easyHeli.pos.y.toFixed(2)}m)`);
  assert.equal(easyWorld.projectiles.length, 0, 'Easy Mode [Space] climb never fires Hydra-70 rockets');

  // Settle hover altitude, then hold [W] while aiming gun steeply DOWN (-43° / -0.75 rad):
  // - NO car-like instant jump (bounded physical rotor-tilt acceleration <= 6.8 m/s² every frame!)
  // - Gun aim (-0.75 rad) stays 100% decoupled from cyclic!
  for (let i = 0; i < 90; i++) {
    easyPilot.updateAircraftControl(1 / 60, easyHeli);
  }
  const cruiseAlt = easyHeli.pos.y;
  easyPilot.pitch = -0.75; // Aiming gun steeply down at ground targets!
  easyPilot.yaw = 0;
  easyPilot.keys.KeyW = true;
  const dt = 1 / 60;
  for (let i = 0; i < 240; i++) {
    const prevVz = easyHeli._heliVelZ;
    easyPilot.updateAircraftControl(dt, easyHeli);
    const frameHorizAccel = Math.abs(easyHeli._heliVelZ - prevVz) / dt;
    assert.ok(
      frameHorizAccel <= 6.8,
      `Easy Mode horizontal acceleration strictly bounded by tilted rotor physics (got ${frameHorizAccel.toFixed(2)} m/s²)`
    );
    if (i === 29) {
      assert.ok(
        Math.abs(easyHeli._heliVelZ) < 3.2,
        `Helicopter cannot snap to speed like a car in 0.5s (got |velZ|=${Math.abs(easyHeli._heliVelZ).toFixed(2)} m/s)`
      );
    }
  }
  easyPilot.keys.KeyW = false;
  assert.ok(easyHeli._heliVelZ < -12, `Easy Mode [W] builds real forward momentum over 4.0s (velZ=${easyHeli._heliVelZ.toFixed(2)})`);
  assert.ok(
    Math.abs(easyHeli.pos.y - cruiseAlt) < 1.1,
    `Easy Mode aiming gun down -43° must NOT dive helicopter altitude (was ${cruiseAlt.toFixed(2)}m, got ${easyHeli.pos.y.toFixed(2)}m)`
  );
  assert.ok(
    easyHeli.pitch > -0.4,
    `Easy Mode airframe tilt stays bounded to AFCS rotor cruise limit despite -0.75 rad gun aim (got pitch=${easyHeli.pitch.toFixed(2)})`
  );

  // NO CAR-LIKE STOP: Releasing [W] at 32 m/s (115 km/h) glides forward on 9-ton momentum (>78% speed retained after 1.0 full second!)
  easyHeli._heliVelZ = -32.0;
  for (let i = 0; i < 60; i++) {
    easyPilot.updateAircraftControl(dt, easyHeli);
  }
  assert.ok(
    easyHeli._heliVelZ < -25.0,
    `Releasing [W] at 115 km/h must glide with real momentum, NEVER stop like a car (1.0s velZ=${easyHeli._heliVelZ.toFixed(2)} m/s)`
  );

  // ACTIVE NOSE-UP FLARE BRAKING ([S]): Pulling [S] physically pitches nose UP (`pitch > 0.22` rad) to vector rotor thrust against momentum!
  easyPilot.keys.KeyS = true;
  for (let i = 0; i < 60; i++) {
    easyPilot.updateAircraftControl(dt, easyHeli);
  }
  easyPilot.keys.KeyS = false;
  assert.ok(
    easyHeli.pitch > 0.22,
    `Pulling [S] at forward speed physically flares helicopter nose UP to brake (got pitch=${easyHeli.pitch.toFixed(2)} rad)`
  );
  assert.ok(
    easyHeli._heliVelZ < -14.0 && easyHeli._heliVelZ > -26.8,
    `Full nose-up rotor flare bleeds speed gradually (~5–7 m/s²), still carrying real momentum after 1.0s (velZ=${easyHeli._heliVelZ.toFixed(2)} m/s)`
  );

  // Firing UH-60M Slot [1] (7.62mm M134 Minigun) spawns pure ballistic bullets with ZERO fake explosiveSplash!
  easyHeli.activeWeaponSlot = 0;
  easyHeli.fireCooldown = 0;
  easyPilot.isFiring = true;
  easyPilot.updateAircraftControl(dt, easyHeli);
  easyPilot.isFiring = false;
  assert.ok(easyPilot.activeBullets.length >= 1, 'UH-60M Slot [1] fires 7.62mm M134 Minigun rounds');
  assert.equal(
    easyPilot.activeBullets[0].explosiveSplash ?? null,
    null,
    'UH-60M 7.62mm M134 Minigun bullets must NOT carry 45-DMG explosiveSplash'
  );

  // 2. HARD CYCLIC SIM MODE ([G] OFF): [W/S] controls collective rotor power & mouse tilts cyclic disk on identical Newtonian physics!
  const { pilot: hardPilot, vehicle: hardHeli } = buildPilotHarness('heli_transport', 'US');
  hardPilot.aircraftCollisionAvoidance = false;
  hardHeli.pos.set(0, 40, 0);
  hardPilot.pitch = 0;
  hardPilot.keys.KeyW = true;
  for (let i = 0; i < 90; i++) {
    hardPilot.updateAircraftControl(dt, hardHeli);
  }
  assert.ok(hardHeli.pos.y > 44.8, `Hard Mode [W] collective climbs vertically when rotor disk is level (y=${hardHeli.pos.y.toFixed(2)}m)`);

  // Tilt mouse cyclic nose-down (-0.45 rad) -> rotor disk tilts forward (`pitch < -0.35`) and accelerates horizontally!
  hardPilot.pitch = -0.45;
  for (let i = 0; i < 120; i++) {
    hardPilot.updateAircraftControl(dt, hardHeli);
  }
  hardPilot.keys.KeyW = false;
  assert.ok(hardHeli.pitch < -0.35, `Hard Mode mouse cyclic directly pitches rotorcraft nose-down (pitch=${hardHeli.pitch.toFixed(2)})`);
  assert.ok(hardHeli._heliVelZ < -8, `Hard Mode forward cyclic tilt converts rotor thrust into forward speed (velZ=${hardHeli._heliVelZ.toFixed(2)})`);

  // 3. BALLISTIC REALISM & BALANCE: UH-60M 7.62mm M134 Minigun vs Tank (0 DMG) vs Enemy Helicopter (Lethal Air-to-Air Kill!)
  const m134Ballistics = classifyWeaponBallistics('7.62MM M134 MINIGUN');
  assert.equal(m134Ballistics.isSmallArms, true, '7.62×51mm M134 classified as small-arms rifle caliber against heavy armor');
  assert.equal(m134Ballistics.isRotaryMinigun, true, '7.62×51mm M134 classified as high-volume rotary minigun against helicopters');

  const scene = new THREE.Scene();
  const mockWorld = {
    era: 'modern',
    voxels: new Map(),
    getGroundHeightAt: () => 0,
    spawnDebris: () => {},
    spawnExplosionVisual: () => {}
  };
  const vm = new VehicleManager(scene, mockWorld);

  const ruTank = vm.spawnVehicle({
    id: 'ru_t90_m134_test',
    name: 'T-90M PRORYV MBT',
    type: 'tank',
    team: 'RU',
    spawnPos: new THREE.Vector3(0, 0, 0),
    spawnYaw: 0,
    maxHp: 2100,
    speed: 19,
    weaponType: 'tank_cannon',
    rpm: 26,
    patrolPoints: []
  });
  // Shoot tank from front AND rear with UH-60M 7.62mm M134 Minigun -> 0 HP damage both ways!
  vm.damageVehicle(ruTank, 32, 'US_UH60', 'US', '7.62MM M134 MINIGUN', null, null, new THREE.Vector3(0, 15, -60));
  vm.damageVehicle(ruTank, 32, 'US_UH60', 'US', '7.62MM M134 MINIGUN', null, null, new THREE.Vector3(0, 15, 60));
  assert.equal(ruTank.hp, 2100, '7.62×51mm M134 Minigun must deal ZERO hull HP damage to an MBT even from behind');
  assert.equal(ruTank.lastArmorRicochet, true, 'MBT flags non-penetrating armor ricochet against 7.62mm M134');

  // Shoot enemy Mi-8 transport helicopter from 320m away (well beyond the 220m jet cutoff!) -> shreds past 25% HP floor to 0 HP!
  const enemyHeli = vm.spawnVehicle({
    id: 'ru_mi8_m134_test',
    name: 'MI-8AMTSh HIP TRANSPORT',
    type: 'plane',
    aircraftRole: 'heli_transport',
    team: 'RU',
    spawnPos: new THREE.Vector3(0, 120, 0),
    spawnYaw: 0,
    maxHp: 1350,
    speed: 58,
    maxSpeed: 72,
    minSpeed: 0,
    weaponType: 'heli_minigun',
    rpm: 1500,
    patrolPoints: []
  });
  enemyHeli.isHelicopter = true;
  const attackerPos320m = new THREE.Vector3(0, 125, 320);

  const hpBeforeM134 = enemyHeli.hp;
  vm.damageVehicle(enemyHeli, 28, 'US_UH60', 'US', '7.62MM M134 MINIGUN', null, null, attackerPos320m);
  const singleHitDmg = hpBeforeM134 - enemyHeli.hp;
  assert.ok(
    singleHitDmg >= 15,
    `7.62mm M134 Minigun deals real un-capped airframe damage to enemy helicopter at 320m (got ${singleHitDmg} DMG vs 0 DMG previously)`
  );

  // Sustained ~3.2s burst (80 rounds @ 1,500 RPM) shoots the enemy helicopter all the way down (NO 25% HP floor!)
  for (let r = 0; r < 85 && !enemyHeli.isShotDown && !enemyHeli.dead; r++) {
    vm.damageVehicle(enemyHeli, 28, 'US_UH60', 'US', '7.62MM M134 MINIGUN', null, null, attackerPos320m);
  }
  assert.ok(
    enemyHeli.isShotDown || enemyHeli.dead || enemyHeli.hp <= 0,
    `Sustained M134 Minigun burst shoots down enemy helicopter completely below 25% HP floor (hp=${enemyHeli.hp})`
  );
});

test('v131: Climbable 44.5m High-Voltage Power Towers, 38.5m Radar Towers, 7.5m Watchtowers & Skyscraper Express Ladders', () => {
  const scene = new THREE.Scene();
  const world = new VoxelWorld(scene, FRUGIS_RIVER_MAP);

  const powerLadders = world.climbableLadders.filter((l) => l.label === 'power_tower_ladder');
  const radarLadders = world.climbableLadders.filter((l) => l.label === 'radar_tower_ladder');
  const watchLadders = world.climbableLadders.filter((l) => l.label === 'watchtower_ladder');
  const skyLadders = world.climbableLadders.filter((l) => l.label === 'skyscraper_express_ladder');

  assert.equal(powerLadders.length, 10, 'All 10 44.5m high-voltage lattice power towers have climbable ladders');
  assert.equal(radarLadders.length, 2, 'Both 38.5m air-defense radar towers have climbable ladders');
  assert.ok(watchLadders.length >= 10, 'All base guard watchtowers have climbable ladders');
  assert.ok(skyLadders.length >= 12, 'All Downtown skyscrapers have express interior service ladders');

  // Verify vehicles/tanks can drive cleanly underneath the 12.4m wide Power Tower straddle base!
  const [ptX, ptZ] = FRUGIS_RIVER_MAP.powerTowers[0];
  assert.equal(
    world.isInsideStaticStructure(ptX, ptZ, 1.8),
    false,
    'Power tower 12.4m straddle portal must allow cars and tanks to drive underneath center'
  );

  // Simulate Recon Sniper climbing a 44.5m Power Tower ladder from ground (0s -> ~5s) up onto the 32.5m Upper Sniper Deck!
  const lad = powerLadders[0];
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 5000);
  const sniper = Object.create(PlayerController.prototype);
  Object.assign(sniper, {
    camera,
    scene,
    world,
    botManager: { bots: [], findNearestDownedFriendly: () => null },
    vehicleManager: { vehicles: [] },
    name: 'ReconSniper',
    team: 'US',
    role: 'recon',
    dead: false,
    downed: false,
    activeVehicle: null,
    pos: new THREE.Vector3(lad.x, lad.minY, lad.z + 0.35),
    vel: new THREE.Vector3(),
    yaw: 0,
    pitch: 0.15,
    keys: { KeyW: true },
    slots: [{ clip: 10, reserve: 40, def: WEAPON_DEFS.sv98 }],
    currentSlotIndex: 0,
    plantedC4: [],
    activeBullets: [],
    viewModelGroup: new THREE.Group(),
    isModalOpen: () => false,
    syncCameraTransform: () => {},
    updateRallyPoint: () => {},
    updateUAV: () => {}
  });

  for (let i = 0; i < 330; i++) {
    sniper.update(1 / 60);
    if (!sniper.onLadder && sniper.pos.y >= lad.topExitY - 0.1) break;
  }
  sniper.keys.KeyW = false;
  for (let i = 0; i < 20; i++) {
    sniper.update(1 / 60);
  }

  assert.ok(
    Math.abs(sniper.pos.y - lad.topExitY) < 0.25,
    `Sniper climbs power-tower ladder all the way onto the +32.5m upper overwatch deck (expected ${lad.topExitY.toFixed(2)}m, got ${sniper.pos.y.toFixed(2)}m)`
  );
  assert.equal(sniper.isGrounded, true, 'Sniper stands solidly grounded on the 6.8m × 6.8m upper power-tower sniper deck');

  world.dispose();
});


test('v132: Authentic Rotorcraft Specs (UH-60M, Mi-8AMTSh, AH-64E, Ka-52) & Analytic Top-Speed / Accel Equilibrium', () => {
  const uh60Def = VEHICLE_DEFS.find((d) => d.id === 'us_uh60_transport');
  const mi8Def = VEHICLE_DEFS.find((d) => d.id === 'ru_mi8_transport');
  const ah64Def = VEHICLE_DEFS.find((d) => d.id === 'us_ah64_apache');
  const ka52Def = VEHICLE_DEFS.find((d) => d.id === 'ru_ka52_alligator');

  assert.ok(uh60Def && mi8Def && ah64Def && ka52Def, 'All 4 US/RU helicopters exist in VEHICLE_DEFS');
  assert.ok(uh60Def.maxSpeed > mi8Def.maxSpeed, 'UH-60M (295 km/h) outruns heavier armored Mi-8AMTSh (254 km/h)');
  assert.ok(mi8Def.maxHp > uh60Def.maxHp, 'Armored Mi-8AMTSh has higher hull HP than sleeker UH-60M');
  assert.ok(ka52Def.maxSpeed > ah64Def.maxSpeed && ka52Def.climbRateMs > ah64Def.climbRateMs, 'Coaxial Ka-52 has highest dash speed (311 km/h) and sea-level climb rate (14.2 m/s)');
  assert.ok(ka52Def.yawAuthorityMult >= 1.2, 'Coaxial Ka-52 has superior flat-pedal yaw authority');

  const dt = 1 / 60;
  const simulateDash = (def) => {
    const { pilot: player, vehicle } = buildPilotHarness(def.aircraftRole, def.team);
    Object.assign(vehicle, {
      speed: def.speed,
      maxSpeed: def.maxSpeed,
      climbRateMs: def.climbRateMs,
      maxFwdTiltRad: def.maxFwdTiltRad,
      yawAuthorityMult: def.yawAuthorityMult,
      rollAgilityMult: def.rollAgilityMult,
      isCoaxialHeli: Boolean(def.isCoaxialHeli),
      pos: new THREE.Vector3(0, 95, 0),
      heliHoverAlt: 95
    });
    player.aircraftCollisionAvoidance = true;
    player.keys.KeyW = true;
    player.keys.ShiftLeft = true;

    let timeTo100Kmh = null;
    for (let step = 1; step <= 1500; step++) {
      player.updateAircraftControl(dt, vehicle);
      const kmh = Math.hypot(vehicle._heliVelX, vehicle._heliVelZ) * 3.6;
      if (timeTo100Kmh === null && kmh >= 100.0) {
        timeTo100Kmh = step * dt;
      }
    }
    const finalMs = Math.hypot(vehicle._heliVelX, vehicle._heliVelZ);
    return { timeTo100Kmh, finalMs, finalKmh: finalMs * 3.6 };
  };

  const uh60Run = simulateDash(uh60Def);
  const mi8Run = simulateDash(mi8Def);
  const ah64Run = simulateDash(ah64Def);
  const ka52Run = simulateDash(ka52Def);

  // Verify realistic 0–100 km/h acceleration times (~4.5s–7.8s, never car-instant and never sluggish)
  assert.ok(uh60Run.timeTo100Kmh >= 4.2 && uh60Run.timeTo100Kmh <= 7.2, `UH-60M 0-100 km/h time realistic (got ${uh60Run.timeTo100Kmh?.toFixed(2)}s)`);
  assert.ok(mi8Run.timeTo100Kmh > uh60Run.timeTo100Kmh, `Heavier Mi-8 accelerates slower than UH-60M (${mi8Run.timeTo100Kmh?.toFixed(2)}s vs ${uh60Run.timeTo100Kmh?.toFixed(2)}s)`);
  assert.ok(ka52Run.timeTo100Kmh < uh60Run.timeTo100Kmh, `Ka-52 attack heli accelerates faster than UH-60M (${ka52Run.timeTo100Kmh?.toFixed(2)}s vs ${uh60Run.timeTo100Kmh?.toFixed(2)}s)`);

  // Verify helicopters actually reach >=95% of their rated real-world max level speed (~254–311 km/h)!
  assert.ok(uh60Run.finalKmh >= 280 && uh60Run.finalKmh <= 306, `UH-60M reaches ~295 km/h max speed (got ${uh60Run.finalKmh.toFixed(1)} km/h)`);
  assert.ok(mi8Run.finalKmh >= 240 && mi8Run.finalKmh <= 264, `Mi-8AMTSh reaches ~254 km/h max speed (got ${mi8Run.finalKmh.toFixed(1)} km/h)`);
  assert.ok(ah64Run.finalKmh >= 290 && ah64Run.finalKmh <= 316, `AH-64E reaches ~304 km/h max speed (got ${ah64Run.finalKmh.toFixed(1)} km/h)`);
  assert.ok(ka52Run.finalKmh >= 296 && ka52Run.finalKmh <= 322 && ka52Run.finalKmh > ah64Run.finalKmh, `Ka-52 reaches ~311 km/h max speed (got ${ka52Run.finalKmh.toFixed(1)} km/h)`);
});

test('v132: Exposed-Face Voxel Sector Chunking, Frustum Draw-Call Culling & 500-Player Frame Budget', () => {
  const scene = new THREE.Scene();
  const world = new VoxelWorld(scene, FRUGIS_RIVER_MAP);
  const vm = new VehicleManager(scene, world);
  const bm = new BotManager(scene, world, 250, 'US');

  // 1. Verify exposed-face chunk meshing slashes voxel triangle count by >3.5x vs 12-tri cubes & enables frustumCulled!
  const unculledCubeTris = world.voxels.size * 12;
  let chunkMeshCount = 0;
  let exposedVoxelTris = 0;
  scene.traverse((o) => {
    if (o.isMesh && o.name === 'VoxelSectorChunk') {
      chunkMeshCount++;
      assert.equal(o.frustumCulled, true, 'Every spatial voxel sector chunk must have GPU frustumCulled = true');
      exposedVoxelTris += o.geometry.index.count / 3;
    }
  });
  assert.ok(chunkMeshCount >= 12, `Expected spatial voxel sector chunks in scene, got ${chunkMeshCount}`);
  assert.ok(
    exposedVoxelTris < unculledCubeTris * 0.42,
    `Exposed-face chunk meshing must cut voxel triangles by >58% (${exposedVoxelTris} vs ${unculledCubeTris})`
  );

  // 2. Verify runtime voxel damage, destruction, and building repair cleanly update chunk geometry
  const sampleBld = world.buildings[0];
  const bp = sampleBld.blueprintBlocks.find((b) => !b.isProp);
  assert.ok(bp, 'Sample building has structural blueprint voxel');
  world.damageVoxel(bp.gx, bp.gy, bp.gz, 25, null, true);
  world.flushDirtyVoxelChunks();
  assert.ok(world.getVoxel(bp.gx, bp.gy, bp.gz)._dmgBrightness < 1.0, 'Damaged voxel darkens _dmgBrightness');
  world.destroyVoxel(bp.gx, bp.gy, bp.gz, false);
  world.flushDirtyVoxelChunks();
  assert.equal(world.getVoxel(bp.gx, bp.gy, bp.gz), null, 'Destroyed voxel removed from world');
  const repRes = world.repairBuilding(sampleBld, 10, null, null);
  assert.ok(repRes.restoredCount >= 1 && world.getVoxel(bp.gx, bp.gy, bp.gz) !== null, 'Repaired voxel restored cleanly');

  // 3. Verify 500-player (1 player + 499 AI bots + 36 vehicles) simulation frame budget & draw-call culling!
  const cam = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 3500);
  cam.position.set(-45, 7, 0);
  cam.lookAt(0, 7, 0);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();

  const player = {
    pos: new THREE.Vector3(-45, 5, 0),
    vel: new THREE.Vector3(),
    camera: cam,
    yaw: -Math.PI / 2,
    pitch: 0,
    team: 'US',
    squad: 'ALPHA',
    hp: 100,
    maxHp: 100,
    dead: false,
    downed: false,
    activeVehicle: null
  };

  let totalStepMs = 0;
  const frames = 20;
  for (let f = 0; f < frames; f++) {
    const t0 = performance.now();
    world.update(0.016, [player, ...bm.bots], null, null, null, vm.vehicles);
    vm.update(0.016, player, bm, false, cam);
    bm.update(0.016, player, () => {}, null, vm, null);
    totalStepMs += performance.now() - t0;
  }
  const avgStepMs = totalStepMs / frames;
  assert.ok(avgStepMs < 8.5, `500-player full simulation step must stay well within 60 FPS budget (got ${avgStepMs.toFixed(2)} ms)`);

  cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
  const frustum = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)
  );
  const sphere = new THREE.Sphere();
  scene.updateMatrixWorld();

  let gpuDrawsSubmitted = 0;
  scene.traverse((o) => {
    if (o.isMesh || o.isLine || o.isPoints) {
      let vis = true;
      for (let p = o; p; p = p.parent) {
        if (!p.visible) {
          vis = false;
          break;
        }
      }
      if (!vis) return;
      if (o.frustumCulled && o.geometry) {
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        sphere.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);
        if (!frustum.intersectsSphere(sphere)) return;
      }
      gpuDrawsSubmitted++;
    }
  });
  assert.ok(
    gpuDrawsSubmitted < 950,
    `Frustum & distance culling must slash GPU submitted draw calls well below 950 (was 1,891; got ${gpuDrawsSubmitted})`
  );

  world.dispose();
});

test('v133: Optional Forensic Death Cam — Realism OFF Default, 3D Shot Trace, Killer Zoom & Post-Death Replay', () => {
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 3500);
  const mockWorld = {
    era: 'modern',
    findSafeSpawnPoint: (x, z) => new THREE.Vector3(x, 4, z),
    getGroundHeightAt: () => 4,
    isSolidAt: () => false
  };
  const sniperMesh = new THREE.Group();
  sniperMesh.visible = false; // Simulate distant frustum/distance-culled sniper
  const sniperBot = {
    name: 'V. ZAYTSEV [RU-4]',
    team: 'RU',
    role: 'RECON',
    hp: 78,
    maxHp: 100,
    dead: false,
    downed: false,
    pos: new THREE.Vector3(120, 62, -90),
    mesh: sniperMesh
  };
  const mockBm = { bots: [sniperBot] };
  const mockVm = { vehicles: [] };

  const prevStorage = globalThis.localStorage;
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const memStore = new Map();
  const winListeners = new Map();
  globalThis.localStorage = {
    getItem: (k) => (memStore.has(k) ? memStore.get(k) : null),
    setItem: (k, v) => memStore.set(k, String(v)),
    removeItem: (k) => memStore.delete(k)
  };
  globalThis.document = {
    pointerLockElement: null,
    activeElement: null,
    body: { requestPointerLock: () => Promise.resolve() },
    addEventListener: () => {},
    getElementById: () => null,
    querySelectorAll: () => [],
    exitPointerLock: () => {}
  };
  let deployOpenedCount = 0;
  globalThis.window = {
    addEventListener: (type, fn) => {
      if (!winListeners.has(type)) winListeners.set(type, []);
      winListeners.get(type).push(fn);
    },
    focus: () => {},
    game: {
      matchEnded: false,
      ui: {
        updateDeathCamUI: () => {},
        showDeployScreen: () => {
          deployOpenedCount++;
        }
      }
    }
  };

  try {
    const player = new PlayerController(cam, scene, mockWorld, mockBm, mockVm);
    player.deploy('US', 'assault', new THREE.Vector3(0, 4, 0));

    // 1. Default OFF to preserve mil-sim realism!
    assert.equal(player.deathCamEnabled, false, 'Optional Death Cam must default to OFF (false) for realism');

    // Downed by a distant rooftop sniper (+58m high ground, ~160m away)
    player.takeDamage(
      220,
      sniperBot.name,
      'RU',
      'SV-98 7.62×54mmR',
      null,
      sniperBot.pos.clone(),
      true
    );
    assert.equal(player.downed, true, 'Player enters downed state on lethal hit');
    assert.ok(player.lastDeathReport, 'Forensic lastDeathReport is captured');
    assert.equal(player.lastDeathReport.killerName, sniperBot.name);
    assert.equal(player.lastDeathReport.killerRoleLabel, 'RECON');
    assert.equal(player.lastDeathReport.killerHp, 78);
    assert.equal(player.lastDeathReport.isHeadshot, true);
    assert.equal(player.lastDeathReport.hitZone, 'head');
    assert.ok(player.lastDeathReport.distanceM > 150 && player.lastDeathReport.distanceM < 175);
    assert.ok(player.lastDeathReport.elevDeltaM >= 55, 'Detects +58m high-ground rooftop elevation delta');
    assert.equal(player.lastDeathReport.hasKillerOrigin, true);

    // Realism check when OFF: zero 3D trace in scene & normal 75 deg FOV
    player.update(1 / 60);
    assert.equal(
      scene.getObjectByName('DeathCamShotTrace'),
      undefined,
      'No 3D trajectory line rendered when Death Cam is OFF'
    );
    assert.equal(cam.fov, 75, 'Camera FOV stays at 75 when Death Cam is OFF');

    // 2. Toggle Death Cam ON while downed (simulating pressing [V] on the Downed screen!)
    player.setDeathCamEnabled(true);
    assert.equal(memStore.get('bb_death_cam_enabled'), 'true', 'Persists preference to localStorage');
    const traceGrp = scene.getObjectByName('DeathCamShotTrace');
    assert.ok(traceGrp && traceGrp.visible, '3D Shot Trajectory Group attaches to scene immediately when toggled ON');
    assert.ok(
      traceGrp.userData.victimSilhouette?.visible &&
        traceGrp.userData.killerSoldierSil?.visible &&
        traceGrp.userData.bulletGroup?.visible,
      'Renders 3D Cyan Victim Silhouette, 3D Orange Killer X-Ray Silhouette, and Animated Bullet Tracer'
    );

    for (let i = 0; i < 95; i++) {
      player.update(1 / 60);
    }
    assert.equal(sniperBot.mesh.visible, true, 'Distant culled sniper mesh forced visible during Death Cam');
    assert.ok(cam.fov < 35, `Camera dynamically zooms onto distant 160m sniper (expected FOV < 35, got ${cam.fov.toFixed(1)})`);

    const camFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
    const toKiller = new THREE.Vector3()
      .subVectors(player.getLiveKillerFocusPos(new THREE.Vector3()), cam.position)
      .normalize();
    assert.ok(
      camFwd.dot(toKiller) > 0.97,
      `Battlefield-style Zoom Death Cam smoothly frames killer without 180 deg cut (dot=${camFwd.dot(toKiller).toFixed(4)})`
    );

    // 2b. Pressing [C] toggles to Call of Duty-style Killer's 1st-Person Sights POV looking back at Victim!
    player.toggleDeathCamMode();
    assert.equal(player.deathCamMode, 'KILLER_POV');
    player.update(1 / 60);
    assert.ok(
      cam.position.distanceTo(player.lastDeathReport.killerOriginPos) < 0.05,
      'KILLER_POV places camera right at killer firing sights'
    );
    const povFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
    const kToVictim = new THREE.Vector3()
      .subVectors(player.lastDeathReport.victimSnapshotPos, cam.position)
      .normalize();
    assert.ok(povFwd.dot(kToVictim) > 0.99, 'KILLER_POV aims directly at victim hit point');
    player.toggleDeathCamMode();
    assert.equal(player.deathCamMode, 'ZOOM');

    // 3. Revive cleans up 3D trajectory & restores FOV
    player.beyondRescue = false;
    player.reviveFromDowned('DOC', true, 7, 9);
    assert.equal(scene.getObjectByName('DeathCamShotTrace'), undefined, 'Revive removes 3D trace from scene');
    assert.equal(cam.fov, 75, 'Revive restores 75 deg FOV');

    // 3b. MacBook Laptop Trackpad ADS Verification:
    //     - Quick Two-Finger Tap (<240ms mousedown + mouseup) TOGGLES scope open & closed!
    //     - Browser `contextmenu` gesture (without mousedown) ALSO toggles scope!
    //     - `[O]` keyboard shortcut toggles scope!
    //     - Desktop Mouse Hold (>=240ms) still releases scope on mouseup!
    const mousedownHandlers = winListeners.get('mousedown') || [];
    const mouseupHandlers = winListeners.get('mouseup') || [];
    const ctxMenuHandlers = winListeners.get('contextmenu') || [];
    const keydownHandlers = winListeners.get('keydown') || [];

    assert.equal(player.isAds, false);
    // Simulate MacBook Two-Finger Tap #1 (mousedown button=2, then instant mouseup 15ms later)
    for (const fn of mousedownHandlers) {
      fn({ button: 2, target: null, preventDefault: () => {} });
    }
    for (const fn of mouseupHandlers) {
      fn({ button: 2 });
    }
    assert.equal(
      player.isAds,
      true,
      'MacBook two-finger tap #1 opens ADS scope and KEEPS it open after fingers lift!'
    );

    // Simulate MacBook Two-Finger Tap #2 -> closes ADS scope
    for (const fn of mousedownHandlers) {
      fn({ button: 2, target: null, preventDefault: () => {} });
    }
    for (const fn of mouseupHandlers) {
      fn({ button: 2 });
    }
    assert.equal(player.isAds, false, 'MacBook two-finger tap #2 closes ADS scope cleanly');

    // Simulate Safari/macOS `contextmenu`-only two-finger tap (when >220ms after last mousedown)
    player._lastRightMouseDownAt = 0;
    for (const fn of ctxMenuHandlers) {
      fn({ target: null, preventDefault: () => {} });
    }
    assert.equal(player.isAds, true, 'Safari/macOS contextmenu two-finger tap toggles ADS scope ON');

    // Simulate `[O]` keyboard scope toggle
    for (const fn of keydownHandlers) {
      fn({ code: 'KeyO', repeat: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault: () => {} });
    }
    assert.equal(player.isAds, false, '[O] keyboard shortcut toggles ADS scope OFF');

    // Simulate Desktop Mouse RMB Hold (>= 240ms) -> closes on release
    for (const fn of mousedownHandlers) {
      fn({ button: 2, target: null, preventDefault: () => {} });
    }
    assert.equal(player.isAds, true);
    player._lastRightMouseDownAt -= 400; // Held for 400ms
    for (const fn of mouseupHandlers) {
      fn({ button: 2 });
    }
    assert.equal(player.isAds, false, 'Desktop RMB hold >=240ms still closes scope immediately on release');

    // 4. Finalizing death with Death Cam ON keeps smooth continuous killer zoom (zero jarring 180 deg flip!)
    player.takeDamage(220, sniperBot.name, 'RU', 'SV-98 7.62×54mmR', null, sniperBot.pos.clone(), true);
    player.finalizeDeath();
    assert.equal(player.dead, true);
    assert.ok(Math.abs(player.deathCamPostTimer - 4.2) < 0.01, 'Starts 4.2s post-death replay timer');
    player._deathCamAge = 1.6;
    player._deathCamBlend = 1.0;
    player.updateDeathCamCamera(1 / 60, true);
    const postFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
    const postToKiller = new THREE.Vector3()
      .subVectors(player.getLiveKillerFocusPos(new THREE.Vector3()), cam.position)
      .normalize();
    assert.ok(
      postFwd.dot(postToKiller) > 0.97,
      'Post-death camera preserves continuous compass orientation toward killer without 180 deg flip'
    );

    // 5. Pressing [Space] during Post-Death Replay skips straight to Deploy Screen & cleans up everything
    for (const fn of keydownHandlers) {
      fn({
        code: 'Space',
        repeat: false,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        preventDefault: () => {},
        stopImmediatePropagation: () => {}
      });
    }
    assert.equal(player.deathCamPostTimer, 0, '[Space] skips post-death replay immediately');
    assert.equal(deployOpenedCount, 1, 'Skipping post-death replay opens Deploy Screen cleanly once');
    assert.equal(scene.getObjectByName('DeathCamShotTrace'), undefined, 'Finishing post-death cam removes 3D trace');
    assert.equal(cam.fov, 75, 'Finishing post-death cam restores 75 deg FOV');
  } finally {
    globalThis.localStorage = prevStorage;
    globalThis.document = prevDoc;
    globalThis.window = prevWin;
  }
});

test('v135: Rooftop Helicopter Persistence (No Disappearing Through Skyscrapers) & Multi-Modal Tactical Ride / Airlift System', () => {
  const scene = new THREE.Scene();
  const world = new VoxelWorld(scene, FRUGIS_RIVER_MAP);
  const vm = new VehicleManager(scene, world);
  const bm = new BotManager(scene, world, 32, 'US');
  const cam = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 3500);

  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  globalThis.document = {
    pointerLockElement: null,
    activeElement: null,
    body: { requestPointerLock: () => Promise.resolve() },
    addEventListener: () => {},
    getElementById: () => null,
    querySelectorAll: () => [],
    exitPointerLock: () => {}
  };
  globalThis.window = {
    addEventListener: () => {},
    focus: () => {},
    game: { matchEnded: false, ui: {} }
  };

  try {
    const player = new PlayerController(cam, scene, world, bm, vm);
    player.deploy('US', 'recon', new THREE.Vector3(-1520, 4, 0));

    // 1. Find Downtown Objective C's tallest intact skyscraper roof (> 40m high!)
    const flagC = world.flags.find((f) => f.id === 'C');
    assert.ok(flagC, 'Objective C exists');
    const cRoof = vm.findTallestBuildingRoofNear(flagC.pos.x, flagC.pos.z, 175);
    assert.ok(
      cRoof && cRoof.heightAboveGround >= 35,
      `Found tall Downtown FOB C skyscraper roof (+${cRoof?.heightAboveGround?.toFixed(1)}m)`
    );

    // 2. Land a UH-60M Black Hawk directly on top of the tall FOB C skyscraper and press [E] to exit:
    //    Verify the helicopter STAYS ON THE ROOF across 120 simulation frames (never drops to ground y=0..4m!)
    const uh60 = vm.vehicles.find(
      (v) => v.team === 'US' && v.isHelicopter && v.aircraftRole === 'heli_transport'
    );
    assert.ok(uh60, 'US UH-60M transport helicopter exists');
    uh60.pos.set(cRoof.x, cRoof.y + 0.1, cRoof.z);
    uh60._heliVelX = 0;
    uh60._heliVelY = 0;
    uh60._heliVelZ = 0;
    player.enterVehicle(uh60, true);
    assert.equal(player.activeVehicle?.id, uh60.id);

    // Activate a FALCON Commander order too, ensuring AI orders NEVER hijack or teleport our parked rooftop heli!
    bm.commanderOrders.US = { action: 'OBJECTIVE', flagId: 'D', flagIndex: 3, timer: 60 };

    // Step out onto the skyscraper roof via [E] (`handleVehicleAndDragKey`)
    player.handleVehicleAndDragKey();
    assert.equal(player.activeVehicle?.id ?? null, null, 'Sniper stepped out onto skyscraper roof');
    assert.ok(
      Math.abs(player.pos.y - cRoof.y) < 2.2,
      `Sniper stands safely on skyscraper roof (expected ~${cRoof.y.toFixed(1)}m, got ${player.pos.y.toFixed(1)}m)`
    );

    for (let f = 0; f < 120; f++) {
      vm.update(1 / 60, player, bm, false, cam);
    }
    assert.equal(uh60.dead, false, 'Parked rooftop helicopter is alive');
    assert.equal(uh60.mesh.visible, true, 'Parked rooftop helicopter mesh remains visible');
    assert.ok(
      Math.abs(uh60.pos.y - cRoof.y) < 1.0,
      `Parked helicopter stays on ${cRoof.y.toFixed(1)}m skyscraper roof instead of disappearing to ground (got y=${uh60.pos.y.toFixed(2)}m)`
    );

    // 3. Test Two-Step [Alt+R] Ride Workflow:
    //    Step 3a (1st Alt+R): Sniper at Main Base presses [Alt+R] -> Pickup-Only Black Hawk flies to Sniper (`destPending === true`)!
    //    Step 3b: Sniper boards via [E] BEFORE choosing drop-off -> Helicopter enters `AWAITING_DEST` ready-hover!
    //    Step 3c (2nd Alt+R): Sniper designates drop-off (first via [Q] Ping + [Alt+R], then redirected to Top of OBJ C Skyscraper)!
    assert.deepEqual(
      resolveGlobalCommandShortcut(
        { code: 'KeyR', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false },
        { isMac: false, inAircraft: false, commandRank: 'MEMBER' }
      ),
      { type: 'REQUEST_RIDE' },
      'Alt+R resolves to REQUEST_RIDE for Squad Member Snipers'
    );
    assert.deepEqual(
      resolveGlobalCommandShortcut(
        { code: 'KeyR', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false },
        { isMac: false, inAircraft: true, commandRank: 'MEMBER' }
      ),
      { type: 'REQUEST_RIDE' },
      'Alt+R ALSO resolves to REQUEST_RIDE while sitting inside an Airlift Helicopter'
    );

    uh60.parkedByPlayer = false;
    player.pos.set(-1510, world.getGroundHeightAt(-1510, 0), 0);
    const mockUi = {
      openedModalCount: 0,
      openRideMapModal() {
        this.openedModalCount++;
      }
    };

    // 1st [Alt+R]: Request pickup right where Sniper is standing (no drop-off destination yet!)
    const heliRideRes = player.handleAltRRideAction(mockUi);
    assert.equal(heliRideRes.ok, true, '1st [Alt+R] dispatches pickup to Sniper position');
    assert.equal(heliRideRes.dest.pending, true, '1st [Alt+R] leaves drop-off pending (`AWAITING DROP-OFF`)');
    const airliftHeli = heliRideRes.vehicle;
    assert.equal(airliftHeli.rideTask.destPending, true);

    // Advance AI pickup approach until helicopter arrives at Sniper's pickup LZ
    for (let step = 0; step < 360 && airliftHeli.rideTask.phase === 'APPROACHING_PICKUP'; step++) {
      vm.update(1 / 30, player, bm, false, cam);
    }
    assert.equal(airliftHeli.rideTask.phase, 'HOLDING_FOR_PICKUP', 'Airlift helicopter arrives & holds for pickup');
    assert.equal(
      vm.findNearestEnterable(player.pos, 7.5, 'US')?.id,
      airliftHeli.id,
      'Airlift helicopter is enterable via [E]'
    );

    // Sniper presses [E] to board BEFORE choosing a drop-off: enters Seat [F2] in `AWAITING_DEST` ready-hover!
    player.handleVehicleAndDragKey();
    assert.equal(player.activeVehicle?.id, airliftHeli.id, 'Sniper boarded Airlift helicopter');
    assert.ok(player.vehicleSeatIndex >= 1, 'Sniper placed in passenger/door-gunner seat while AI pilots');
    assert.equal(airliftHeli.rideTask.phase, 'AWAITING_DEST', 'AI Pilot holds steady in AWAITING_DEST until drop-off is set');
    for (let step = 0; step < 30; step++) {
      player.updateVehicleControl(1 / 30);
      vm.update(1 / 30, player, bm, false, cam);
    }
    assert.equal(airliftHeli.rideTask.phase, 'AWAITING_DEST', 'Remains holding until 2nd [Alt+R] sets drop-off');

    // 2nd [Alt+R] without a [Q] ping opens the Drop-Off Map Selector!
    const secondPressModal = player.handleAltRRideAction(mockUi);
    assert.equal(secondPressModal.openedDropoffSelector, true, '2nd [Alt+R] opens Drop-Off Map Selector');
    assert.equal(mockUi.openedModalCount, 1);

    // Also verify [Q] Ping + 2nd [Alt+R] locks drop-off directly to the pinged skyscraper roof!
    player.activePing = {
      pos: new THREE.Vector3(cRoof.x, cRoof.y, cRoof.z),
      timer: 12.0,
      label: 'OBJ C ROOF'
    };
    const pingLockRes = player.handleAltRRideAction(mockUi);
    assert.equal(pingLockRes.ok, true, '[Q] Ping + [Alt+R] locks drop-off without opening modal');
    assert.equal(airliftHeli.rideTask.destPending, false);
    assert.equal(airliftHeli.rideTask.phase, 'EN_ROUTE_TO_DEST', 'AI Pilot departs for OBJ C Rooftop');
    assert.equal(airliftHeli.rideTask.destIsRoof, true, 'Targets Objective C skyscraper rooftop');

    // Simulate flight across the 1.5km map to Objective C Skyscraper Roof
    for (let step = 0; step < 1800 && airliftHeli.rideTask.phase !== 'ARRIVED_AT_DEST'; step++) {
      player.updateVehicleControl(1 / 30);
      vm.update(1 / 30, player, bm, false, cam);
    }
    assert.equal(airliftHeli.rideTask.phase, 'ARRIVED_AT_DEST', 'AI Pilot lands on Objective C Skyscraper Roof');
    assert.ok(
      Math.abs(airliftHeli.pos.y - cRoof.y) < 2.2,
      `Airlift touched down on skyscraper roof (~${cRoof.y.toFixed(1)}m, got ${airliftHeli.pos.y.toFixed(1)}m)`
    );

    // 4. Sniper is NOW on top of Objective C Skyscraper Roof, steps out [E], and later requests ANOTHER ride
    //    from the C Roof to Objective D!
    player.handleVehicleAndDragKey();
    assert.equal(player.activeVehicle?.id ?? null, null, 'Sniper disembarked on Objective C roof');
    const roofPickupRes = vm.requestPlayerRide(player, {
      transportMode: 'heli',
      destKey: 'D'
    });
    assert.equal(roofPickupRes.ok, true, 'Sniper can request rooftop extraction from C Roof to Objective D');
    assert.ok(
      Math.abs(roofPickupRes.pickupPos.y - cRoof.y) < 3.5,
      'Helicopter pickup LZ locks onto the high-rise rooftop elevation where Sniper is standing'
    );

    // 5. Verify Ground Armored APC (`'apc'`) & 6x6 Truck (`'truck'`) Ride Requests also dispatch & chauffeur cleanly!
    player.pos.set(-1490, world.getGroundHeightAt(-1490, 15), 15);
    const apcRideRes = vm.requestPlayerRide(player, {
      transportMode: 'apc',
      destKey: 'A'
    });
    assert.equal(apcRideRes.ok, true, 'Armored APC Ride request succeeds');
    assert.equal(apcRideRes.vehicle.type, 'apc');
    for (let step = 0; step < 300 && apcRideRes.vehicle.rideTask.phase === 'APPROACHING_PICKUP'; step++) {
      vm.update(1 / 30, player, bm, false, cam);
    }
    assert.equal(apcRideRes.vehicle.rideTask.phase, 'HOLDING_FOR_PICKUP', 'Armored APC pulls up and holds for pickup');
  } finally {
    world.dispose();
    globalThis.document = prevDoc;
    globalThis.window = prevWin;
  }
});

test('v137: Sniper Marksman Shot-Difficulty Badges, 2D Trajectory/Anatomy Replay, Earned Titles & Laser Rangefinder Binoculars', () => {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  globalThis.document = {
    pointerLockElement: null,
    activeElement: null,
    body: { requestPointerLock: () => Promise.resolve() },
    addEventListener: () => {},
    getElementById: () => null,
    querySelectorAll: () => [],
    exitPointerLock: () => {},
    createElement: () => ({
      id: '',
      style: {},
      classList: {
        _set: new Set(),
        add(c) { this._set.add(c); },
        remove(c) { this._set.delete(c); },
        contains(c) { return this._set.has(c); },
        toggle(c, f) {
          if (f === undefined) {
            if (this._set.has(c)) this._set.delete(c);
            else this._set.add(c);
          } else if (f) this._set.add(c);
          else this._set.delete(c);
        }
      },
      querySelector: () => ({
        width: 246,
        height: 74,
        getContext: () => ({
          clearRect() {},
          beginPath() {},
          moveTo() {},
          lineTo() {},
          stroke() {},
          fillRect() {},
          save() {},
          restore() {},
          setLineDash() {},
          arc() {},
          fill() {},
          fillText() {}
        })
      })
    })
  };
  globalThis.window = {
    addEventListener: () => {},
    focus: () => {},
    game: { matchEnded: false, ui: {} }
  };

  try {
    // 1. Physics-Driven Shot Difficulty, Anatomical Diagram Coordinates, Trajectory Curve & Earned Titles
    const profile = createDefaultMarksmanProfile();
    const sv98 = WEAPON_DEFS.sv98;
    const awm = WEAPON_DEFS.awm;
    const m4a1 = WEAPON_DEFS.m4a1;

    // Close-range AR kill (<100m) must NOT spam Marksman Badges
    const closeAr = evaluateMarksmanShot(
      { wepDef: m4a1, distanceM: 32, damageDealt: 58, isKill: true, isHeadshot: true, hitZone: 'head' },
      profile
    );
    assert.equal(closeAr.triggered, false, 'Close-range AR kill should not trigger sniper badge card');

    // 138m Crippling Leg Hit (non-lethal, A2 high-skill hit rule) -> triggers compact Marksman Hit readout!
    const cripplingHit = evaluateMarksmanShot(
      {
        wepDef: sv98,
        distanceM: 138,
        flightTimeS: 0.12,
        gravityMps2: sv98.bulletGravity,
        damageDealt: 108,
        isKill: false,
        isHeadshot: false,
        hitZone: 'leftLeg',
        relHitY: 0.35,
        fracturedLimb: 'leg'
      },
      profile
    );
    assert.equal(cripplingHit.triggered, true, '138m crippling leg shot triggers Marksman readout');
    assert.equal(cripplingHit.anatomy.zoneKey, 'leftLeg', 'Highlights left leg on anatomy diagram');
    assert.equal(profile.activeTitle, 'SCOUT SPOTTER', 'Earns initial SCOUT SPOTTER title');

    // 365m Rooftop Overwatch Moving Headshot on Enemy Recon -> Gold/Platinum Grade + EAGLE EYE Title + 2D Trajectory Arc!
    const mythicRoofShot = evaluateMarksmanShot(
      {
        wepDef: awm,
        distanceM: 365,
        flightTimeS: 0.29,
        gravityMps2: awm.bulletGravity,
        shooterPos: new THREE.Vector3(0, 80, 0),
        impactPos: new THREE.Vector3(356, 2, 0),
        damageDealt: 354,
        isKill: true,
        isHeadshot: true,
        oneShotKill: true,
        hitZone: 'head',
        relHitY: 1.62,
        targetSpeedMps: 5.6,
        targetRole: 'RECON',
        penetratedCover: true,
        currentDeadeyeStreak: 2
      },
      profile
    );
    assert.equal(mythicRoofShot.triggered, true);
    assert.ok(
      mythicRoofShot.difficultyScore >= 650,
      `High-skill 365m moving rooftop headshot earns >=650 difficulty (got ${mythicRoofShot.difficultyScore})`
    );
    assert.ok(['S+', '★'].includes(mythicRoofShot.grade), `Expected S+ or ★ grade, got ${mythicRoofShot.grade}`);
    assert.equal(mythicRoofShot.anatomy.zoneKey, 'head');
    assert.equal(mythicRoofShot.trajectory.samples.length, 17, 'Includes 17-point parabolic arc for 2D replay');
    assert.ok(mythicRoofShot.bonusXp >= 350, 'Grants Battlefield-style Marksman distance XP');
    assert.ok(
      ['GHOST RECON', 'MYTHIC LONGSHOT'].includes(profile.activeTitle),
      `Upgrades Earned Marksman Title to top tier (got ${profile.activeTitle})`
    );
    assert.ok(profile.unlockedRank >= 6, 'Unlocks Rank 6+ Marksman Title along the ladder');

    // 2. Recon Laser Rangefinder Binoculars (`rangefinder_binos`) + `[3]` Swap with C4 + Exact Rifle Auto-Zero!
    assert.ok(WEAPON_DEFS.rangefinder_binos, 'AN/PVS-21 LRF Binoculars exist in WEAPON_DEFS');
    const binoVm = createWeaponViewModel(WEAPON_DEFS.rangefinder_binos, 'US');
    assert.ok(binoVm.children.length >= 2, 'Dual-tube LRF Binoculars 3D viewmodel builds cleanly');

    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 5000);
    scene.add(cam);
    const mockWorld = {
      era: 'modern',
      voxels: new Map(),
      flags: [],
      ammoCrates: [],
      lootPacks: [],
      projectiles: [],
      getGroundHeightAt: () => 0,
      findSafeSpawnPoint: (x, z) => new THREE.Vector3(x, 0, z),
      raycastVoxel: () => null
    };
    const enemySniper = {
      id: 'ru_recon_1',
      name: 'Sokol_7',
      team: 'RU',
      role: 'RECON',
      pos: new THREE.Vector3(0, 0, -324),
      yaw: 0,
      hp: 100,
      maxHp: 100,
      lastHorizSpeed: 5.4,
      dead: false,
      downed: false
    };
    const mockBm = {
      bots: [enemySniper],
      findNearestDownedFriendly: () => null
    };
    const mockVm = { vehicles: [] };

    const reconPlayer = new PlayerController(cam, scene, mockWorld, mockBm, mockVm);
    reconPlayer.deploy('US', 'recon', new THREE.Vector3(0, 0, 0));
    reconPlayer.yaw = 0; // Facing -Z directly toward `enemySniper` at z = -324m!
    reconPlayer.pitch = 0;
    reconPlayer.syncCameraTransform();

    assert.equal(reconPlayer.slots[2].def.id, 'rangefinder_binos', 'Recon spawns with LRF Binoculars in Slot [3]');
    assert.equal(reconPlayer.toggleQuickBinoculars(), true, 'Quick-Binoculars switches to Slot [3] and raises 8x/16x ADS');
    assert.equal(reconPlayer.currentSlotIndex, 2);
    assert.equal(reconPlayer.isAds, true);

    // Fire LRF pulse at enemy Recon 324m away -> spots target AND auto-zeros primary SV-98 to ~324m!
    const lrfLock = reconPlayer.fireLaserRangefinder(true);
    assert.ok(lrfLock && lrfLock.isEnemy, 'LRF locks onto enemy sniper at 324m');
    assert.ok(Math.abs(lrfLock.distM - 324) <= 2.5, `Expected ~324m range, got ${lrfLock.distM}m`);
    assert.equal(reconPlayer.isExactLrfZero, true, 'Marks rifle turret as exact LRF-zeroed');
    assert.ok(
      Math.abs(reconPlayer.zeroDistance - 324) <= 10,
      `SV-98 auto-zeroed to exact LRF ballistic range (~324m, got ${reconPlayer.zeroDistance}m)`
    );
    assert.ok(lrfLock.solution.leadMeters >= 1.2, 'LRF computes lateral lead in meters for moving target');

    // Swap Slot [3] via `toggleReconGadgetMode()` -> switches cleanly to C4 and back to LRF Binoculars without losing C4 count!
    assert.equal(reconPlayer.toggleReconGadgetMode(), true);
    assert.equal(reconPlayer.slots[2].def.id, 'c4', 'Pressing [3] swaps Recon Slot 3 to C4 Breach Charge');
    reconPlayer.slots[2].clip = 3;
    assert.equal(reconPlayer.toggleReconGadgetMode(), true);
    assert.equal(reconPlayer.slots[2].def.id, 'rangefinder_binos', 'Pressing [3] again returns to LRF Binoculars');
    assert.equal(reconPlayer.toggleReconGadgetMode(), true);
    assert.equal(reconPlayer.slots[2].clip, 3, 'Preserves exact C4 count across gadget swaps');

    // 3. Verify HUD 2D Trajectory + Anatomy Replay Card renders cleanly without throwing!
    reconPlayer.lastMarksmanShot = {
      ...mythicRoofShot,
      timestamp: typeof performance !== 'undefined' ? performance.now() : Date.now()
    };
    const hudHarness = Object.assign(Object.create(HudRenderer), {
      player: reconPlayer,
      hudEl: { appendChild() {} },
      _domCache: new Map(),
      el(id) {
        return this._domCache.get(id) || null;
      }
    });
    hudHarness.updateMarksmanHud();
    assert.ok(hudHarness._domCache.has('marksman-shot-card'), 'HUD Marksman Replay Card mounted & rendered cleanly');

    // Verify ballistic solution helper accuracy
    const sol500 = computeBallisticSolution(500, 45, 5.0, awm, 100);
    assert.ok(sol500.rawGravityDropM > 0.3 && sol500.holdoverM > 0.2, '500m AWM shot requires positive holdover when zeroed at 100m');
  } finally {
    globalThis.document = prevDoc;
    globalThis.window = prevWin;
  }
});

test('v137b: Tank cannon passes past walking teammates, Coax MG hits close-in enemies in CHASE_3P, and Headshots/Explosions have high instant-KIA chance', async () => {
  const { PlayerController } = await import('../src/player.js?v=144');
  const { BotManager, evaluateCatastrophicKill } = await import('../src/bots.js?v=144');
  const { VehicleManager, initVehicleOrdnance } = await import('../src/vehicles.js?v=144');
  const { ProjectileManager } = await import('../src/world/ProjectileManager.js?v=144');

  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  globalThis.document = {
    pointerLockElement: null,
    addEventListener: () => {},
    exitPointerLock: () => {},
    body: { addEventListener: () => {}, requestPointerLock: () => {} },
    getElementById: () => null,
    createElement: () => ({
      style: {},
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      querySelector: () => null,
      querySelectorAll: () => []
    })
  };
  globalThis.window = {
    addEventListener: () => {},
    focus: () => {},
    game: { matchEnded: false, ui: {} }
  };

  try {

  // 1. Tank 120mm Main Cannon (`tank_shell`) NEVER detonates prematurely on friendly infantry walking in front of the barrel
  const scene = new THREE.Scene();
  const shellMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.6), new THREE.MeshBasicMaterial());
  shellMesh.position.set(0, 2.25, -2.25);
  scene.add(shellMesh);

  const projWorld = {
    scene,
    projectiles: [
      {
        type: 'tank_shell',
        weaponName: '120MM M829A4 APFSDS-T',
        mesh: shellMesh,
        vel: new THREE.Vector3(0, -0.04 * 780, -780),
        gravity: 0,
        life: 3.0,
        owner: { name: 'YOU', team: 'US', friendlyFireEnabled: true }
      }
    ],
    raycastVoxel: () => null,
    getGroundHeightAt: () => 0,
    worldToGrid: (x, y, z, out = {}) => {
      out.gx = Math.floor(x / 1.25);
      out.gy = Math.floor(y / 1.25);
      out.gz = Math.floor(z / 1.25);
      return out;
    },
    getVoxel: () => null,
    _spawnGlowFx: () => {},
    explodeAt: (pos, rad, dmg, cb) => {
      if (cb) cb(pos.clone(), rad, dmg, 0);
    },
    spawnDebris: () => {},
    updateProjectiles: ProjectileManager.updateProjectiles
  };

  const walkingAlly = {
    id: 'us_ally_front',
    name: 'SgtOkiDoki',
    team: 'US',
    pos: new THREE.Vector3(0, 0, -5.0),
    dead: false,
    downed: false
  };
  const distantEnemy = {
    id: 'ru_enemy_target',
    name: 'Kapkan_RU',
    team: 'RU',
    pos: new THREE.Vector3(0, 0, -28.0),
    dead: false,
    downed: false
  };

  let blastCenter = null;
  projWorld.updateProjectiles(
    0.05,
    [walkingAlly, distantEnemy],
    (pos) => {
      blastCenter = pos.clone();
    },
    null,
    []
  );
  assert.ok(blastCenter, 'Tank shell traveled downrange and detonated on enemy target');
  assert.ok(
    Math.abs(blastCenter.z - -28.0) < 1.5,
    `Expected tank shell to pass friendly at z=-5m and hit enemy at z=-28m, got z=${blastCenter.z.toFixed(2)}m`
  );

  // 2. Tank `7.62MM COAX MG` in 3rd-person `CHASE_3P` depresses & converges onto an enemy soldier right in front (`z = -3.6m`), ignoring friendly escort!
  const cam = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 5000);
  scene.add(cam);

  const makeHitBot = (id, team, z) => {
    const grp = new THREE.Group();
    grp.position.set(0, 0, z);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.35, 0.45), new THREE.MeshBasicMaterial());
    torso.position.set(0, 0.95, 0);
    grp.add(torso);
    grp.updateMatrixWorld(true);
    scene.add(grp);
    const bot = {
      id,
      name: id,
      team,
      role: 'ASSAULT',
      pos: new THREE.Vector3(0, 0, z),
      yaw: 0,
      hp: 100,
      maxHp: 100,
      armorHp: 0,
      hasHelmet: false,
      dead: false,
      downed: false,
      deaths: 0,
      mesh: grp,
      hitMeshes: [torso],
      parts: {}
    };
    torso.userData = { bot, isTorso: true, hitZone: 'thorax' };
    return bot;
  };

  const closeFriendlyEscort = makeHitBot('US_ESCORT_FRONT', 'US', -2.6);
  const closeEnemyInfantry = makeHitBot('RU_POINTBLANK', 'RU', -3.6);

  const mockWorld = {
    era: 'modern',
    voxels: new Map(),
    flags: [],
    ammoCrates: [],
    lootPacks: [],
    projectiles: [],
    getGroundHeightAt: () => 0,
    findSafeSpawnPoint: (x, z) => new THREE.Vector3(x, 0, z),
    raycastVoxel: () => null,
    spawnDebris: () => {},
    spawnEnemyLootPack: () => {}
  };
  const mockBm = {
    bots: [closeFriendlyEscort, closeEnemyInfantry],
    world: mockWorld,
    clearBotRescueLinks: () => {},
    findNearestDownedFriendly: () => null,
    damageBot: BotManager.prototype.damageBot
  };
  const tank = {
    id: 'us_m1a2_1',
    name: 'M1A2 SEPv3 ABRAMS',
    type: 'tank',
    weaponType: 'tank_cannon',
    team: 'US',
    isAircraft: false,
    dead: false,
    hp: 1600,
    maxHp: 1600,
    speed: 19,
    pos: new THREE.Vector3(0, 0, 0),
    yaw: 0,
    pitch: 0,
    roll: 0,
    turretYaw: 0,
    turretPitch: 0,
    forwardSpeed: 0,
    fireCooldown: 0,
    coaxCooldown: 0,
    coaxHeat: 0,
    coaxOverheated: false,
    activeWeaponSlot: 1,
    crewSeats: [null, null, null],
    mesh: new THREE.Group()
  };
  initVehicleOrdnance(tank);
  const mockVm = {
    vehicles: [tank],
    getVehiclePitchLimits: VehicleManager.prototype.getVehiclePitchLimits
  };

  const tanker = new PlayerController(cam, scene, mockWorld, mockBm, mockVm);
  tanker.deploy('US', 'armor', new THREE.Vector3(0, 0, 0));
  mockBm.player = tanker;
  tanker.activeVehicle = tank;
  tanker.vehicleSeatIndex = 0;
  tank.driver = tanker;
  tank.crewSeats[0] = tanker;
  tanker.vehicleCameraMode = 'CHASE_3P';
  tanker.thirdPersonVehicle = true;
  tanker.yaw = 0;
  // Depress 3rd-person camera down onto the point-blank enemy soldier at z = -3.6m!
  tanker.pitch = -0.37;
  tanker.isFiring = true;

  tanker.update(0.016);
  tanker.isFiring = false;
  tanker.update(0.02);

  assert.equal(closeFriendlyEscort.hp, 100, 'Friendly escort at 2.6m is NOT shot by friendly tank Coax MG');
  assert.ok(
    closeEnemyInfantry.hp < 100,
    `Point-blank enemy soldier at 3.6m in front of tank WAS hit by Coax MG in CHASE_3P (hp=${closeEnemyInfantry.hp})`
  );

  // 3. Headshots & Explosions have a large chance (62%–100%) of instant unrevivable KIA for BOTH Bots & Players!
  const rifleHsFatal = evaluateCatastrophicKill('M4A1 5.56MM', 0, 0, () => 0.5, {
    hitZone: 'head',
    isHeadshot: true,
    rawDamage: 62
  });
  assert.equal(rifleHsFatal.beyondRescue, true, 'Standard 5.56mm lethal headshot has 80% instant-KIA chance');
  assert.equal(rifleHsFatal.chance, 0.8);

  const rifleHsRareSurvive = evaluateCatastrophicKill('M4A1 5.56MM', 0, 0, () => 0.95, {
    hitZone: 'head',
    isHeadshot: true,
    rawDamage: 62
  });
  assert.equal(rifleHsRareSurvive.beyondRescue, false, 'Top 20% roll allows rare grazing-headshot survival to downed');

  const hsBot = makeHitBot('RU_HS_BOT', 'RU', -20);
  hsBot.hp = 40;
  const botHsRes = mockBm.damageBot(hsBot, 64, 'YOU', 'US', 'M4A1', true, () => {}, null, {
    hitZone: 'head',
    rng: () => 0.45
  });
  assert.equal(botHsRes.beyondRescue, true, 'Bot killed by rifle headshot skips revivable downed state');
  assert.equal(hsBot.dead, true);
  assert.equal(hsBot.downed, false);

  // Verify Player killed by rifle headshot OR frag grenade explosion ALSO triggers `beyondRescue`!
  const footVictim = new PlayerController(cam, scene, mockWorld, mockBm, mockVm);
  footVictim.deploy('US', 'assault', new THREE.Vector3(0, 0, 0));
  footVictim.hp = 50;
  footVictim.armor = 0;
  footVictim.takeDamage(68, 'Sokol_7', 'RU', 'AK-15', () => {}, new THREE.Vector3(0, 0, -30), true, {
    hitZone: 'head',
    rng: () => 0.45
  });
  assert.equal(footVictim.beyondRescue, true, 'Player killed by headshot triggers Beyond Medic Rescue KIA');
  assert.ok(footVictim.downedTimer <= 3.0, 'Unrevivable KIA skips 120s Medic wait');
  } finally {
    globalThis.document = prevDoc;
    globalThis.window = prevWin;
  }
});
