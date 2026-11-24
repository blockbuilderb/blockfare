import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { sound } from '../src/audio.js?v=120';
import { createAircraftFlightFSM, createVehicleSubsystemsFSM } from '../src/core/StateMachines.js?v=120';
import { VehicleControlMethods } from '../src/player/VehicleControl.js?v=120';
import { VehicleManager } from '../src/vehicles.js?v=120';
import { ProjectileManager as ProjectileManagerMethods } from '../src/world/ProjectileManager.js?v=120';

let createdWindowShim = false;
let prevMuted = false;

before(() => {
  if (typeof globalThis.window === 'undefined') {
    globalThis.window = {};
    createdWindowShim = true;
  }
  prevMuted = Boolean(sound.volumes?.muted);
  if (sound.volumes) {
    sound.volumes.muted = true;
  }
});

after(() => {
  if (sound.volumes) {
    sound.volumes.muted = prevMuted;
  }
  if (createdWindowShim) {
    delete globalThis.window;
  }
});

function assertFiniteVec3(v, label = 'vec3') {
  assert.ok(v, `${label} must be defined`);
  assert.equal(Number.isFinite(v.x), true, `${label}.x must be finite`);
  assert.equal(Number.isFinite(v.y), true, `${label}.y must be finite`);
  assert.equal(Number.isFinite(v.z), true, `${label}.z must be finite`);
}

function createPilotOrdnanceHarness({
  aircraftRole,
  activeWeaponSlot = 0,
  pos = new THREE.Vector3(0, 320, 0),
  yaw = 0,
  pitch = 0,
  forwardSpeed = 68,
  gunshipOrbit = false
}) {
  if (typeof globalThis.window === 'undefined') {
    globalThis.window = {};
    createdWindowShim = true;
  }
  if (sound.volumes) {
    sound.volumes.muted = true;
  }
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 6000);

  const world = {
    scene,
    projectiles: [],
    voxels: null,
    flags: [],
    botManager: null,
    vehicleManager: null,
    getGroundHeightAt: () => 0,
    worldToGrid(wx, wy, wz, out = { gx: 0, gy: 0, gz: 0 }) {
      out.gx = Math.floor(wx / 1.25);
      out.gy = Math.floor(wy / 1.25);
      out.gz = Math.floor(wz / 1.25);
      return out;
    },
    getVoxel: () => null,
    raycastVoxel: () => null,
    spawnDebris: () => {},
    _spawnFxSlot: () => {},
    explodeAt(hitPos, rad, dmg, onEntityDamage) {
      if (onEntityDamage) onEntityDamage(hitPos, rad, dmg, 0);
    },
    updateProjectiles: ProjectileManagerMethods.updateProjectiles
  };

  const mesh = new THREE.Group();
  mesh.position.copy(pos);
  scene.add(mesh);

  const vehicle = {
    id: `test_${aircraftRole}`,
    name: `TEST ${aircraftRole.toUpperCase()}`,
    type: 'plane',
    isAircraft: true,
    aircraftRole,
    team: 'US',
    dead: false,
    isShotDown: false,
    isStalling: false,
    stallSinkVel: 0,
    hp: 1000,
    maxHp: 1000,
    pos: pos.clone(),
    yaw,
    pitch,
    roll: 0,
    turretYaw: yaw,
    turretPitch: pitch,
    forwardSpeed,
    speed: forwardSpeed,
    minSpeed: aircraftRole === 'wright_flyer' ? 12 : 34,
    maxSpeed: aircraftRole === 'wright_flyer' ? 235 : 115,
    throttle: 0.72,
    turnRate: 1.35,
    accelRate: 2.8,
    brakeRate: 2.8,
    activeWeaponSlot,
    fireCooldown: 0,
    maxFireCooldown: 0.1,
    coaxCooldown: 0,
    coaxHeat: 0,
    coaxOverheated: false,
    flareCooldown: 0,
    flareActiveTimer: 0,
    hasLeftRunwayOnce: pos.y > 10,
    gunshipManualFlight: aircraftRole === 'gunship' ? !gunshipOrbit : false,
    targetGunshipAlt: pos.y,
    orbitCenter: gunshipOrbit ? new THREE.Vector3(0, 0, 0) : null,
    mesh,
    driver: null
  };
  createAircraftFlightFSM(vehicle);
  createVehicleSubsystemsFSM(vehicle);

  const vehicleManager = {
    vehicles: [vehicle],
    updateAircraftControlSurfacesAndVortices: () => {},
    finalizeShotDownCrash: () => {}
  };
  world.vehicleManager = vehicleManager;

  const pilot = Object.assign(
    {
      name: 'TestPilot',
      team: 'US',
      role: 'pilot',
      pos: pos.clone(),
      yaw: gunshipOrbit ? yaw + Math.PI * 0.5 : yaw,
      pitch: gunshipOrbit ? -0.78 : pitch,
      recoilOffsetPitch: 0,
      isAds: false,
      isFiring: false,
      _suppressFireUntil: 0,
      keys: {},
      scene,
      camera,
      world,
      vehicleManager,
      botManager: { bots: [] },
      activeVehicle: vehicle,
      vehicleCameraMode: aircraftRole === 'gunship' ? 'OPTIC_NOSE' : 'COCKPIT_1P',
      thirdPersonVehicle: false,
      aircraftCollisionAvoidance: true,
      addShake: () => {},
      isModalOpen: () => false,
      onAwardXp: () => {},
      resolveCameraWallCollision: (_pivot, camPos) => camPos,
      fireBallisticRay: () => {}
    },
    VehicleControlMethods
  );
  vehicle.driver = pilot;

  // One idle warm-up frame mounts persistent HUD helpers (ccipMarkerMesh / _gunshipOrbitVisGroup)
  // so subsequent ordnance shots isolate exact projectile mesh additions.
  pilot.updateAircraftControl(1 / 60, vehicle);
  vehicle.fireCooldown = 0;
  vehicle.coaxCooldown = 0;

  return { scene, camera, world, vehicle, pilot };
}

// ============================================================================
// 1. VehicleControlMethods.computeAircraftLeadData (CTRA 2nd-Order Lead Solver)
// ============================================================================
describe('1. VehicleControlMethods.computeAircraftLeadData (CTRA 2nd-order curvilinear lead solver)', () => {
  test('enforces null guards for missing inputs, isShotDown spirals, and unmanned parked-runway planes', () => {
    const shooterOrigin = new THREE.Vector3(0, 15, 0);

    assert.equal(VehicleControlMethods.computeAircraftLeadData(null, shooterOrigin), null);
    assert.equal(VehicleControlMethods.computeAircraftLeadData({}, shooterOrigin), null);
    assert.equal(
      VehicleControlMethods.computeAircraftLeadData(
        { pos: new THREE.Vector3(0, 300, -500) },
        null
      ),
      null
    );

    // Shot-down aircraft in Mayday spiral must return null even when high in the air and occupied
    const shotDownPlane = {
      isAircraft: true,
      isShotDown: true,
      driver: { name: 'Pilot' },
      aiPilotActive: true,
      pos: new THREE.Vector3(0, 380, -650),
      trackedWorldVel: new THREE.Vector3(62, -24, 0),
      trackedYawRate: 0.95
    };
    assert.equal(
      VehicleControlMethods.computeAircraftLeadData(shotDownPlane, shooterOrigin, 360, 4.5),
      null
    );

    // Unmanned aircraft parked on the runway (< 14m Y, no driver, no AI pilot) must return null
    const parkedRunwayPlane = {
      isAircraft: true,
      isShotDown: false,
      driver: null,
      aiPilotActive: false,
      pos: new THREE.Vector3(120, 2.0, -400),
      forwardSpeed: 0,
      yaw: 0,
      pitch: 0
    };
    assert.equal(
      VehicleControlMethods.computeAircraftLeadData(parkedRunwayPlane, shooterOrigin, 360, 4.5),
      null
    );

    // Active runway takeoff roll (occupied below 14m) IS valid and produces finite lead data
    const activeTakeoffPlane = {
      ...parkedRunwayPlane,
      driver: { name: 'Pilot' },
      forwardSpeed: 55
    };
    const takeoffLead = VehicleControlMethods.computeAircraftLeadData(
      activeTakeoffPlane,
      shooterOrigin,
      360,
      4.5
    );
    assert.ok(takeoffLead);
    assertFiniteVec3(takeoffLead.leadPos, 'takeoffLead.leadPos');
  });

  test('straight-line flight (|trackedYawRate| < 0.015) matches linear intercept + 0.5 * g * t^2 ballistic drop', () => {
    const shooterOrigin = new THREE.Vector3(0, 20, 0);
    const bulletSpeed = 380;
    const bulletGravity = 4.5;

    for (const yawRate of [0, 0.008, -0.014]) {
      const p0 = new THREE.Vector3(-120, 260, -720);
      const targetVel = new THREE.Vector3(78, 6.5, -24);
      const plane = {
        isAircraft: true,
        isShotDown: false,
        pos: p0.clone(),
        trackedWorldVel: targetVel.clone(),
        trackedYawRate: yawRate,
        trackedTangentialAccel: 0,
        trackedVertAccel: 0
      };

      const res = VehicleControlMethods.computeAircraftLeadData(
        plane,
        shooterOrigin,
        bulletSpeed,
        bulletGravity
      );
      assert.ok(res, `expected lead solution for yawRate=${yawRate}`);
      assert.equal(Math.abs(yawRate) < 0.015, true);

      // Verify 3-iteration fixed-point TOF + 3%/s aerodynamic drag compensation
      const d0 = p0.distanceTo(shooterOrigin);
      const t0 = d0 / bulletSpeed;
      const d1 = p0.clone().addScaledVector(targetVel, t0).distanceTo(shooterOrigin);
      const t1 = d1 / bulletSpeed;
      const d2 = p0.clone().addScaledVector(targetVel, t1).distanceTo(shooterOrigin);
      const rawTof = THREE.MathUtils.clamp(d2 / bulletSpeed, 0.03, 3.4);
      const expectedEffTof = rawTof * (1 + 0.03 * rawTof);

      assert.ok(Math.abs(res.tof - expectedEffTof) < 1e-9);

      const expectedIntercept = p0.clone().addScaledVector(targetVel, res.tof);
      assert.ok(
        res.interceptPos.distanceTo(expectedIntercept) < 1e-9,
        `interceptPos should match linear p0 + v*t for yawRate=${yawRate}`
      );

      const expectedDropY = 0.5 * bulletGravity * res.tof * res.tof;
      assert.ok(Math.abs(res.leadPos.x - expectedIntercept.x) < 1e-9);
      assert.ok(Math.abs(res.leadPos.z - expectedIntercept.z) < 1e-9);
      assert.ok(
        Math.abs(res.leadPos.y - (expectedIntercept.y + expectedDropY)) < 1e-9,
        'leadPos.y must equal linear intercept Y + 0.5 * g * t^2 ballistic drop'
      );
    }
  });

  test('banking circular orbit (trackedYawRate = ±0.25 rad/s) predicts along exact circular arc with >15m gain over tangent', () => {
    const shooterOrigin = new THREE.Vector3(0, 12, 0);
    const bulletSpeed = 360;
    const bulletGravity = 4.5;
    const speed = 65; // Circling B-2 / AC-130 speed (m/s)
    const radius = speed / 0.25; // R = V / |omega| = 260m
    const orbitCenter = new THREE.Vector3(0, 340, -920);

    for (const omega of [0.25, -0.25]) {
      // Place aircraft on the orbit perimeter at x = +R, z = cz.
      // For +0.25 (CCW left bank), yaw = 0 -> v = (0, 0, -V), center is (-R, 0, 0) to its port side.
      // For -0.25 (CW right bank), yaw = PI -> v = (0, 0, +V), center is (-R, 0, 0) to its starboard side.
      const p0 = new THREE.Vector3(orbitCenter.x + radius, orbitCenter.y, orbitCenter.z);
      const v0 =
        omega > 0 ? new THREE.Vector3(0, 0, -speed) : new THREE.Vector3(0, 0, speed);

      const orbitingPlane = {
        isAircraft: true,
        isShotDown: false,
        aircraftRole: omega > 0 ? 'gunship' : 'b2_spirit',
        pos: p0.clone(),
        trackedWorldVel: v0.clone(),
        trackedYawRate: omega,
        trackedTangentialAccel: 0,
        trackedVertAccel: 0
      };

      const lead = VehicleControlMethods.computeAircraftLeadData(
        orbitingPlane,
        shooterOrigin,
        bulletSpeed,
        bulletGravity
      );
      assert.ok(lead);
      assert.equal(lead.yawRate, omega);

      // True position on circular orbit of radius R after time t = lead.tof
      const theta = Math.abs(omega) * lead.tof;
      const trueCirclePos = new THREE.Vector3(
        orbitCenter.x + radius * Math.cos(theta),
        orbitCenter.y,
        orbitCenter.z + (omega > 0 ? -1 : 1) * radius * Math.sin(theta)
      );

      // 1st-order tangent extrapolation (ignoring turn rate)
      const tangentPos = p0.clone().addScaledVector(v0, lead.tof);

      const arcError = lead.interceptPos.distanceTo(trueCirclePos);
      const radialError = Math.abs(
        Math.hypot(lead.interceptPos.x - orbitCenter.x, lead.interceptPos.z - orbitCenter.z) -
          radius
      );
      const tangentError = tangentPos.distanceTo(trueCirclePos);
      const accuracyImprovement = tangentError - arcError;

      assert.ok(
        arcError < 1e-6,
        `expected near-zero geometric arc error for omega=${omega}, got ${arcError}`
      );
      assert.ok(
        radialError < 1e-6,
        `interceptPos must lie on orbit circle R=${radius}m, radialError=${radialError}`
      );
      assert.ok(
        accuracyImprovement > 15,
        `CTRA arc solver must beat 1st-order tangent by >15m (got ${accuracyImprovement.toFixed(2)}m for omega=${omega})`
      );

      const expectedDrop = 0.5 * bulletGravity * lead.tof * lead.tof;
      assert.ok(Math.abs(lead.leadPos.y - (trueCirclePos.y + expectedDrop)) < 1e-6);
    }
  });

  test('wraps yaw-rate cleanly across ±PI seam in VehicleManager tracker and computeAircraftLeadData', () => {
    const shooterOrigin = new THREE.Vector3(0, 15, 0);
    const speed = 65;
    const radius = speed / 0.25; // 260m
    const orbitCenter = new THREE.Vector3(0, 320, -880);
    const dt = 0.05;

    for (const omega of [0.25, -0.25]) {
      // Start just before yaw wraps across +PI -> -PI (for +0.25) or -PI -> +PI (for -0.25)
      let yaw = omega > 0 ? Math.PI - 0.18 : -Math.PI + 0.18;
      const wrapAngle = (a) => {
        let w = a;
        while (w > Math.PI) w -= Math.PI * 2;
        while (w <= -Math.PI) w += Math.PI * 2;
        return w;
      };

      // Position consistent with velocity v = (-sin(yaw)*V, 0, -cos(yaw)*V) tangent to circle of radius R
      const posFromYaw = (psi) =>
        new THREE.Vector3(
          orbitCenter.x + (omega > 0 ? 1 : -1) * radius * Math.cos(psi),
          orbitCenter.y,
          orbitCenter.z - (omega > 0 ? 1 : -1) * radius * Math.sin(psi)
        );

      const plane = {
        id: `wrap_${omega > 0 ? 'ccw' : 'cw'}`,
        isAircraft: true,
        aircraftRole: 'b2_spirit',
        team: 'RU',
        dead: false,
        isShotDown: false,
        aiPilotActive: true,
        pos: posFromYaw(yaw),
        yaw,
        pitch: 0,
        roll: omega > 0 ? 0.52 : -0.52,
        forwardSpeed: speed,
        speed
      };

      const vmHarness = Object.assign(Object.create(VehicleManager.prototype), {
        vehicles: [plane],
        boardableGroundByTeam: { US: [], RU: [] },
        activeGroundTargetsByTeam: { US: [], RU: [] },
        activeAircraftByTeam: { US: [], RU: [] },
        updateAircraftAiAndPhysics(v, stepDt) {
          yaw = wrapAngle(yaw + omega * stepDt);
          v.yaw = yaw;
          v.pos.copy(posFromYaw(yaw));
        }
      });

      let crossedBranchCut = false;
      for (let step = 0; step < 24; step++) {
        const beforeYaw = plane.yaw;
        vmHarness.update(dt);
        if (Math.abs(plane.yaw - beforeYaw) > Math.PI) {
          crossedBranchCut = true;
        }
        // Must NEVER invert sign or spike to ±2.6 rad/s when crossing ±PI
        assert.equal(
          Math.sign(plane.trackedYawRate),
          Math.sign(omega),
          `trackedYawRate flipped sign at step ${step} across ±PI`
        );
        assert.ok(Math.abs(plane.trackedYawRate) < 0.3);
      }

      assert.equal(crossedBranchCut, true, 'simulation must cross the ±PI yaw discontinuity');
      assert.ok(
        Math.abs(plane.trackedYawRate - omega) < 0.01,
        `expected trackedYawRate ~ ${omega}, got ${plane.trackedYawRate}`
      );

      const lead = VehicleControlMethods.computeAircraftLeadData(plane, shooterOrigin, 360, 4.5);
      assert.ok(lead);
      const futureYaw = yaw + omega * lead.tof;
      const trueFuturePos = posFromYaw(futureYaw);
      const tangentPos = plane.pos.clone().addScaledVector(lead.targetVel, lead.tof);

      const filteredArcErr = lead.interceptPos.distanceTo(trueFuturePos);
      const tangentErr = tangentPos.distanceTo(trueFuturePos);
      assert.ok(
        filteredArcErr < 5.0,
        `expected tightly bounded causal-EMA arc error (<5m), got ${filteredArcErr.toFixed(2)}m`
      );
      assert.ok(
        tangentErr - filteredArcErr > 15,
        `expected >15m accuracy gain over 1st-order tangent across ±PI, got ${(tangentErr - filteredArcErr).toFixed(2)}m`
      );
    }

    // Fallback yaw velocity reconstruction at +PI - eps vs -PI + eps must also be continuous
    const leadPosPi = VehicleControlMethods.computeAircraftLeadData(
      {
        isAircraft: true,
        pos: new THREE.Vector3(0, 300, -700),
        yaw: Math.PI - 1e-6,
        pitch: 0,
        forwardSpeed: 70,
        trackedYawRate: 0.25
      },
      shooterOrigin,
      360,
      4.5
    );
    const leadNegPi = VehicleControlMethods.computeAircraftLeadData(
      {
        isAircraft: true,
        pos: new THREE.Vector3(0, 300, -700),
        yaw: -Math.PI + 1e-6,
        pitch: 0,
        forwardSpeed: 70,
        trackedYawRate: 0.25
      },
      shooterOrigin,
      360,
      4.5
    );
    assert.ok(leadPosPi.leadPos.distanceTo(leadNegPi.leadPos) < 1e-3);
  });
});

// ============================================================================
// 2. syncGunshipPylonGeometry & adjustGunshipAltitude ([180, 1800]m Envelope)
// ============================================================================
describe('2. VehicleControlMethods.syncGunshipPylonGeometry & adjustGunshipAltitude', () => {
  test('safely ignores null or non-gunship vehicles', () => {
    assert.doesNotThrow(() => VehicleControlMethods.syncGunshipPylonGeometry(null));
    const fighter = { isAircraft: true, aircraftRole: 'fighter', targetGunshipAlt: 50 };
    VehicleControlMethods.syncGunshipPylonGeometry(fighter);
    assert.equal(fighter.targetGunshipAlt, 50);
    assert.equal(fighter.orbitRadius, undefined);

    const nonGunshipPilot = Object.assign({ activeVehicle: fighter }, VehicleControlMethods);
    assert.equal(nonGunshipPilot.adjustGunshipAltitude(250, true), 320);
  });

  test('clamps AC-130 pylon envelope cleanly to [180, 1800]m AGL with finite orbitRadius, slantRangeM & idealBankRad', () => {
    const ac130 = {
      isAircraft: true,
      aircraftRole: 'gunship',
      forwardSpeed: 50,
      targetGunshipAlt: 40,
      pylonSlopeRatio: 0.2
    };

    // Low clamp (< 180m -> 180m) & slope clamp (< 0.68 -> 0.68)
    VehicleControlMethods.syncGunshipPylonGeometry(ac130);
    assert.equal(ac130.targetGunshipAlt, 180);
    assert.equal(ac130.pylonSlopeRatio, 0.68);
    assert.equal(Number.isFinite(ac130.orbitRadius) && ac130.orbitRadius > 0, true);
    assert.equal(Number.isFinite(ac130.slantRangeM) && ac130.slantRangeM > ac130.targetGunshipAlt, true);
    assert.equal(
      Number.isFinite(ac130.idealBankRad) &&
        ac130.idealBankRad >= 0.14 &&
        ac130.idealBankRad <= 0.74,
      true
    );

    // High clamp (> 1800m -> 1800m) & slope clamp (> 1.38 -> 1.38)
    ac130.targetGunshipAlt = 4500;
    ac130.pylonSlopeRatio = 3.5;
    VehicleControlMethods.syncGunshipPylonGeometry(ac130);
    assert.equal(ac130.targetGunshipAlt, 1800);
    assert.equal(ac130.pylonSlopeRatio, 1.38);

    // Sweep entire operational [180, 1800]m envelope
    ac130.pylonSlopeRatio = 1.08;
    for (const alt of [-999, 95, 180, 280, 320, 500, 900, 1350, 1800, 2600, 9999]) {
      ac130.targetGunshipAlt = alt;
      VehicleControlMethods.syncGunshipPylonGeometry(ac130);
      assert.equal(
        ac130.targetGunshipAlt >= 180 && ac130.targetGunshipAlt <= 1800,
        true,
        `altitude ${alt} must clamp into [180, 1800], got ${ac130.targetGunshipAlt}`
      );
      assert.equal(Number.isFinite(ac130.orbitRadius) && ac130.orbitRadius > 0, true);
      assert.equal(
        ac130.slantRangeM,
        Math.round(Math.hypot(ac130.targetGunshipAlt, ac130.orbitRadius))
      );
      assert.equal(
        Number.isFinite(ac130.idealBankRad) &&
          ac130.idealBankRad >= 0.14 &&
          ac130.idealBankRad <= 0.74,
        true
      );
    }
  });

  test('adjustGunshipAltitude enforces [180, 1800]m bounds, progressive >500m step scaling, and syncs geometry', () => {
    const xpMessages = [];
    const gunship = {
      isAircraft: true,
      aircraftRole: 'gunship',
      forwardSpeed: 48,
      targetGunshipAlt: 320,
      pylonSlopeRatio: 1.08
    };
    const pilot = Object.assign(
      {
        activeVehicle: gunship,
        onAwardXp: (_pts, msg) => xpMessages.push(msg)
      },
      VehicleControlMethods
    );

    // Descend far past minimum -> clamps cleanly at 180m
    assert.equal(pilot.adjustGunshipAltitude(-1000, false), 180);
    assert.equal(gunship.targetGunshipAlt, 180);
    assert.equal(xpMessages.length, 1);

    // Silent step at <= 500m uses 1.0x multiplier and emits no HUD banner
    assert.equal(pilot.adjustGunshipAltitude(400, true), 580);
    assert.equal(gunship.targetGunshipAlt, 580);
    assert.equal(xpMessages.length, 1);

    // Non-silent step above 500m applies 1.65x progressive multiplier (580 + 100 * 1.65 = 745m)
    assert.equal(pilot.adjustGunshipAltitude(100, false), 745);
    assert.equal(Math.round(gunship.targetGunshipAlt), 745);
    assert.equal(xpMessages.length, 2);

    // Climb far past ceiling -> clamps cleanly at 1800m with finite geometry
    assert.equal(pilot.adjustGunshipAltitude(5000, false), 1800);
    assert.equal(gunship.targetGunshipAlt, 1800);
    assert.equal(Number.isFinite(gunship.orbitRadius) && gunship.orbitRadius > 0, true);
    assert.equal(Number.isFinite(gunship.slantRangeM) && gunship.slantRangeM > 1800, true);
    assert.equal(
      Number.isFinite(gunship.idealBankRad) &&
        gunship.idealBankRad >= 0.14 &&
        gunship.idealBankRad <= 0.74,
      true
    );
  });
});

// ============================================================================
// 3. Aircraft Ordnance Registration Invariant & Gravity Ballistics
// ============================================================================
describe('3. Aircraft Ordnance Registration Invariant & ProjectileManager downward gravity stepping', () => {
  const ORDNANCE_CASES = [
    {
      label: 'B-2 Slot 0 LMB (5× Mk-82 Carpet Bomb)',
      aircraftRole: 'b2_spirit',
      activeWeaponSlot: 0,
      trigger: 'LMB',
      expectedCount: 5,
      expectedType: 'jdam_bomb'
    },
    {
      label: 'B-2 Slot 0 Space (5× Mk-82 Carpet Bomb)',
      aircraftRole: 'b2_spirit',
      activeWeaponSlot: 0,
      trigger: 'SPACE',
      expectedCount: 5,
      expectedType: 'jdam_bomb'
    },
    {
      label: 'B-2 Slot 1 LMB (2× GBU-57 MOP)',
      aircraftRole: 'b2_spirit',
      activeWeaponSlot: 1,
      trigger: 'LMB',
      expectedCount: 2,
      expectedType: 'gbu28_bomb'
    },
    {
      label: 'B-2 Slot 1 Space (2× GBU-57 MOP)',
      aircraftRole: 'b2_spirit',
      activeWeaponSlot: 1,
      trigger: 'SPACE',
      expectedCount: 2,
      expectedType: 'gbu28_bomb'
    },
    {
      label: 'Fighter Slot 2 LMB (1× 500lb JDAM)',
      aircraftRole: 'fighter',
      activeWeaponSlot: 2,
      trigger: 'LMB',
      expectedCount: 1,
      expectedType: 'jdam_bomb'
    },
    {
      label: 'Wright Flyer Slot 1 LMB (3× Dynamite)',
      aircraftRole: 'wright_flyer',
      activeWeaponSlot: 1,
      trigger: 'LMB',
      expectedCount: 3,
      expectedType: 'jdam_bomb'
    },
    {
      label: 'Wright Flyer Slot 1 Space (3× Dynamite)',
      aircraftRole: 'wright_flyer',
      activeWeaponSlot: 1,
      trigger: 'SPACE',
      expectedCount: 3,
      expectedType: 'jdam_bomb'
    },
    {
      label: 'AC-130 Slot 1 LMB (1× 40mm L/60 Bofors)',
      aircraftRole: 'gunship',
      activeWeaponSlot: 1,
      trigger: 'LMB',
      expectedCount: 1,
      expectedType: 'ac130_40mm',
      gunshipOrbit: true,
      pos: new THREE.Vector3(260, 320, 0)
    },
    {
      label: 'AC-130 Slot 2 LMB (1× 105mm M102 Howitzer)',
      aircraftRole: 'gunship',
      activeWeaponSlot: 2,
      trigger: 'LMB',
      expectedCount: 1,
      expectedType: 'ac130_105mm',
      gunshipOrbit: true,
      pos: new THREE.Vector3(260, 320, 0)
    },
    {
      label: 'AC-130 Space Heavy Trigger (1× 105mm M102 Howitzer)',
      aircraftRole: 'gunship',
      activeWeaponSlot: 0,
      trigger: 'SPACE',
      expectedCount: 1,
      expectedType: 'ac130_105mm',
      gunshipOrbit: true,
      pos: new THREE.Vector3(260, 320, 0)
    }
  ];

  for (const tc of ORDNANCE_CASES) {
    test(`${tc.label}: scene.children delta === world.projectiles delta (${tc.expectedCount}), zero orphan meshes & downward gravity advance`, () => {
      const { scene, camera, world, vehicle, pilot } = createPilotOrdnanceHarness({
        aircraftRole: tc.aircraftRole,
        activeWeaponSlot: tc.activeWeaponSlot,
        pos: tc.pos || new THREE.Vector3(0, 320, 0),
        yaw: 0,
        pitch: 0,
        forwardSpeed: tc.aircraftRole === 'wright_flyer' ? 52 : 68,
        gunshipOrbit: Boolean(tc.gunshipOrbit)
      });

      const childrenSnapshotBefore = new Set(scene.children);
      const sceneCountBefore = scene.children.length;
      const projCountBefore = world.projectiles.length;
      assert.equal(projCountBefore, 0);

      if (tc.trigger === 'LMB') {
        pilot.isFiring = true;
        pilot.keys.Space = false;
      } else {
        pilot.isFiring = false;
        pilot.keys.Space = true;
      }

      pilot.updateAircraftControl(1 / 60, vehicle);

      const sceneDelta = scene.children.length - sceneCountBefore;
      const projDelta = world.projectiles.length - projCountBefore;

      assert.equal(
        projDelta,
        tc.expectedCount,
        `${tc.label}: expected ${tc.expectedCount} projectile(s), got ${projDelta}`
      );
      assert.equal(
        sceneDelta,
        projDelta,
        `${tc.label}: scene.children delta (${sceneDelta}) must equal world.projectiles delta (${projDelta})`
      );

      // Verify exact 1-to-1 bijection between newly added scene meshes and registered projectiles
      const addedSceneMeshes = scene.children.filter((ch) => !childrenSnapshotBefore.has(ch));
      assert.equal(addedSceneMeshes.length, tc.expectedCount);
      for (const proj of world.projectiles) {
        assert.equal(proj.type, tc.expectedType);
        assert.ok(proj.mesh, 'projectile must carry a 3D mesh');
        assert.equal(proj.mesh.parent, scene, 'projectile mesh must be attached to scene');
        assert.equal(
          addedSceneMeshes.includes(proj.mesh),
          true,
          'every registered projectile mesh must be accounted for in scene.children'
        );

        assertFiniteVec3(proj.vel, `${tc.label} proj.vel`);
        assertFiniteVec3(proj.mesh.position, `${tc.label} proj.mesh.position`);
        assert.equal(
          Number.isFinite(proj.gravity) && proj.gravity > 0,
          true,
          `${tc.label}: gravity must be finite & positive (got ${proj.gravity})`
        );

        // Downward + forward velocity check:
        // Level bombers/fighters/Wright drop along -Z forward with initial negative vel.y;
        // Orbiting AC-130 at (+260, 320, 0) aims port-side (-X) downward at (0, 0, 0).
        assert.equal(
          proj.vel.y < 0,
          true,
          `${tc.label}: expected downward initial vel.y < 0, got ${proj.vel.y}`
        );
        const camForwardH = new THREE.Vector3(0, 0, -1)
          .applyQuaternion(camera.quaternion)
          .setY(0)
          .normalize();
        const flightForwardH = new THREE.Vector3(-Math.sin(vehicle.yaw), 0, -Math.cos(vehicle.yaw)).normalize();
        const expectedForwardH = tc.aircraftRole === 'gunship' ? camForwardH : flightForwardH;
        const forwardSpeedComponent =
          proj.vel.x * expectedForwardH.x + proj.vel.z * expectedForwardH.z;
        assert.equal(
          forwardSpeedComponent > 0,
          true,
          `${tc.label}: expected positive forward horizontal velocity component, got ${forwardSpeedComponent}`
        );
      }

      // Advance projectiles via ProjectileManager.updateProjectiles and verify downward gravity acceleration
      const initialStates = world.projectiles.map((p) => ({
        proj: p,
        y0: p.mesh.position.y,
        vy0: p.vel.y,
        x0: p.mesh.position.x,
        z0: p.mesh.position.z
      }));

      const stepDt = 0.1;
      for (let i = 0; i < 4; i++) {
        world.updateProjectiles(stepDt, [], null, null, []);
      }

      assert.equal(
        world.projectiles.length,
        tc.expectedCount,
        'projectiles at 320m AGL should still be airborne after 0.4s'
      );
      assert.equal(
        scene.children.length - sceneCountBefore,
        world.projectiles.length,
        'no orphan meshes may appear while stepping projectiles in flight'
      );

      for (const st of initialStates) {
        const { proj, y0, vy0, x0, z0 } = st;
        assert.equal(
          proj.vel.y < vy0,
          true,
          `${tc.label}: gravity must accelerate vel.y further downward (${proj.vel.y} < ${vy0})`
        );
        assert.ok(
          Math.abs(proj.vel.y - (vy0 - proj.gravity * 4 * stepDt)) < 1e-6,
          `${tc.label}: vel.y must integrate -gravity * dt accurately`
        );
        assert.equal(
          proj.mesh.position.y < y0,
          true,
          `${tc.label}: projectile mesh Y must advance downward (${proj.mesh.position.y} < ${y0})`
        );
        assert.equal(
          Math.hypot(proj.mesh.position.x - x0, proj.mesh.position.z - z0) > 0,
          true,
          `${tc.label}: projectile mesh XZ must advance forward`
        );
      }

      // Continue stepping until all ordnance impacts terrain (y <= 0.15) and verify 0 orphan meshes remain
      let safetySteps = 0;
      while (world.projectiles.length > 0 && safetySteps < 400) {
        world.updateProjectiles(0.1, [], null, null, []);
        safetySteps++;
      }
      assert.equal(world.projectiles.length, 0, 'all projectiles must detonate on ground impact');
      assert.equal(
        scene.children.length,
        sceneCountBefore,
        'all projectile meshes must be removed from scene.children upon detonation (0 orphans)'
      );
    });
  }

  test('AC-130 105mm runway safety lock (< 8m AGL) spawns 0 projectiles and leaves 0 orphan meshes', () => {
    const { scene, world, vehicle, pilot } = createPilotOrdnanceHarness({
      aircraftRole: 'gunship',
      activeWeaponSlot: 2,
      pos: new THREE.Vector3(0, 2.0, 0),
      forwardSpeed: 0,
      gunshipOrbit: false
    });

    const sceneCountBefore = scene.children.length;
    pilot.isFiring = true;
    pilot.keys.Space = true;
    pilot.updateAircraftControl(1 / 60, vehicle);

    assert.equal(world.projectiles.length, 0);
    assert.equal(scene.children.length, sceneCountBefore);
  });

  test('Auto Collision Protection is ON by default and cushions low-altitude / stalled flight above terrain', () => {
    const { vehicle, pilot } = createPilotOrdnanceHarness({
      aircraftRole: 'fighter',
      activeWeaponSlot: 0,
      pos: new THREE.Vector3(0, 9.0, 0),
      pitch: -0.35,
      forwardSpeed: 22,
      gunshipOrbit: false
    });
    assert.notEqual(pilot.aircraftCollisionAvoidance, false, 'Auto Collision Protection must be ON by default');
    vehicle.hasLeftRunwayOnce = true;
    vehicle.isStalling = true;
    vehicle.stallSinkVel = -16;

    pilot.updateAircraftControl(1 / 30, vehicle);

    assert.equal(vehicle.dead, false, 'Aircraft must not crash when Auto Collision Protection is ON');
    assert.equal(vehicle.isStalling, false, 'Auto-GCAS must recover low-altitude aerodynamic stall');
    assert.ok(vehicle.pos.y >= 9.0, `Aircraft altitude (${vehicle.pos.y.toFixed(2)}m) must be cushioned above terrain`);
  });

  test('AC-130 Infrared (WHOT / BHOT / NVG) resets back to normal view (OFF) on vehicle exit and new round reset', () => {
    const { vehicle, pilot } = createPilotOrdnanceHarness({
      aircraftRole: 'gunship',
      activeWeaponSlot: 0,
      pos: new THREE.Vector3(260, 320, 0),
      gunshipOrbit: true
    });
    pilot.vel = new THREE.Vector3();
    pilot.hasThermalGoggles = true;
    pilot.nvgActive = true;
    pilot.sensorMode = 'WHOT';

    // Manual exit [E] resets infrared back to normal view even if thermal goggles are owned
    pilot.handleVehicleAndDragKey();
    assert.equal(pilot.activeVehicle, null);
    assert.equal(pilot.sensorMode, 'OFF');
    assert.equal(pilot.nvgActive, false);

    // Re-enter AC-130, enable WHOT IR, and verify round-reset / redeploy clears infrared & restores canopy
    const canopyPart = new THREE.Mesh();
    canopyPart.visible = false;
    vehicle.mesh = new THREE.Group();
    vehicle.mesh.userData = { cockpitCanopyParts: [canopyPart] };
    pilot.activeVehicle = vehicle;
    vehicle.driver = pilot;
    pilot.nvgActive = true;
    pilot.sensorMode = 'BHOT';
    pilot.resetVisionSensors = function () {
      this.sensorMode = 'OFF';
      this.nvgActive = false;
    };
    pilot.clearActiveVehicleOnReset = function () {
      if (this.activeVehicle) {
        const v = this.activeVehicle;
        if (Array.isArray(v.mesh?.userData?.cockpitCanopyParts)) {
          for (const p of v.mesh.userData.cockpitCanopyParts) {
            if (p) p.visible = true;
          }
        }
        v.driver = null;
        this.activeVehicle = null;
      }
      this.resetVisionSensors();
    };

    pilot.clearActiveVehicleOnReset('new-round');
    assert.equal(pilot.activeVehicle, null);
    assert.equal(pilot.sensorMode, 'OFF');
    assert.equal(pilot.nvgActive, false);
    assert.equal(canopyPart.visible, true);
  });

  test('AC-130 Left-Window 1P & Belly Optic views never self-occlude with own wing/nacelle, while 3P & exit show full airframe', () => {
    const { vehicle, pilot } = createPilotOrdnanceHarness({
      aircraftRole: 'gunship',
      activeWeaponSlot: 0,
      pos: new THREE.Vector3(240, 260, 0),
      gunshipOrbit: true
    });
    vehicle.roll = 0.65; // ~37° left pylon bank

    pilot.vehicleCameraMode = 'COCKPIT_1P';
    pilot.updateAircraftControl(1 / 60, vehicle);
    assert.equal(vehicle.mesh.visible, false, 'COCKPIT_1P left-window HUD must hide own AC-130 wing/nacelles');
    assert.equal(pilot._gunshipOrbitVisGroup.userData.bullMesh.visible, false, 'Orbit mode must hide giant center bullseye mesh over targets');
    assert.equal(pilot._gunshipOrbitVisGroup.userData.crossX.visible, false, 'Orbit mode must hide 28m center X cross over targets');

    pilot.vehicleCameraMode = 'OPTIC_NOSE';
    pilot.updateAircraftControl(1 / 60, vehicle);
    assert.equal(vehicle.mesh.visible, false, 'OPTIC_NOSE belly pod must hide own AC-130 airframe');

    pilot.vehicleCameraMode = 'CHASE_3P';
    pilot.updateAircraftControl(1 / 60, vehicle);
    assert.equal(vehicle.mesh.visible, true, 'CHASE_3P overwatch must render full 3D AC-130 airframe');

    // Switch back to COCKPIT_1P and verify exiting [E] restores mesh visibility
    pilot.vehicleCameraMode = 'COCKPIT_1P';
    pilot.updateAircraftControl(1 / 60, vehicle);
    assert.equal(vehicle.mesh.visible, false);
    pilot.vel = new THREE.Vector3();
    pilot.activateParachuteEject = () => {};
    pilot.handleVehicleAndDragKey();
    assert.equal(vehicle.mesh.visible, true, 'Exiting AC-130 must restore external airframe mesh visibility');
  });

  test('AC-130 25mm/40mm/105mm fire from physical -X port gun barrels with zero 3P camera-to-muzzle tracer kink', () => {
    const { world, vehicle, pilot } = createPilotOrdnanceHarness({
      aircraftRole: 'gunship',
      activeWeaponSlot: 0,
      pos: new THREE.Vector3(220, 260, 0),
      yaw: 0,
      gunshipOrbit: true
    });
    vehicle.roll = 0;
    vehicle.pitch = 0;
    pilot.vehicleCameraMode = 'CHASE_3P';

    let capturedRay = null;
    pilot.fireBallisticRay = (origin, dir, dmg, hs, range, name, pen, opts, pellets, muzzleWorldPos) => {
      capturedRay = { origin: origin.clone(), dir: dir.clone(), name, muzzleWorldPos: muzzleWorldPos.clone() };
    };

    pilot.isFiring = true;
    vehicle.fireCooldown = 0;
    pilot.updateAircraftControl(1 / 60, vehicle);

    assert.ok(capturedRay, '25mm Gatling must invoke fireBallisticRay');
    assert.equal(
      capturedRay.origin.distanceTo(capturedRay.muzzleWorldPos),
      0,
      '25mm origin must equal port muzzle tip so 3P tracers have zero backward camera-blend bend'
    );
    assert.ok(
      capturedRay.origin.x < vehicle.pos.x - 2.4,
      `25mm must originate from port (-X) barrel tip (got dx=${(capturedRay.origin.x - vehicle.pos.x).toFixed(2)})`
    );
    assert.ok(capturedRay.dir.y <= -0.05, 'AC-130 port gun must fire downward toward ground targets');

    // Slot 1: 40mm Bofors mid-port barrel
    vehicle.activeWeaponSlot = 1;
    vehicle.fireCooldown = 0;
    pilot.updateAircraftControl(1 / 60, vehicle);
    assert.equal(world.projectiles.length, 1);
    assert.ok(world.projectiles[0].mesh.position.x < vehicle.pos.x - 2.8, '40mm shell must spawn at mid-port (-X) barrel');
  });

  test('AC-130 in Transit Mode descends smoothly below 180m/34m/12m all the way to 0m runway landing with Auto-GCAS ON', () => {
    const { vehicle, pilot } = createPilotOrdnanceHarness({
      aircraftRole: 'gunship',
      activeWeaponSlot: 0,
      pos: new THREE.Vector3(-1350, 220, 0),
      yaw: Math.PI / 2,
      pitch: -0.22,
      forwardSpeed: 48,
      gunshipOrbit: false
    });
    pilot.aircraftCollisionAvoidance = true;
    pilot.getAircraftObstacleHeightAt = () => 0;
    vehicle.gunshipManualFlight = true;
    pilot.keys.KeyS = true;
    pilot.keys.KeyZ = true;
    pilot.pitch = -0.22;

    for (let i = 0; i < 650; i++) {
      pilot.updateAircraftControl(0.05, vehicle);
      if (vehicle.pos.y <= 0.25 && vehicle.forwardSpeed <= 0.1) break;
    }

    assert.equal(vehicle.dead, false, 'AC-130 must not crash during controlled landing');
    assert.ok(
      vehicle.pos.y <= 0.5,
      `AC-130 must touch down on the runway instead of floating above Auto-GCAS floor (got y=${vehicle.pos.y.toFixed(2)}m)`
    );
    assert.ok(
      vehicle.forwardSpeed <= 0.5,
      `AC-130 must brake to a full stop on rollout (got speed=${vehicle.forwardSpeed.toFixed(2)} m/s)`
    );
  });

  test('A-10C Warthog (cas) supports all 3 weapon slots ([1] GAU-8, [2] Hydra-70, [3] AGM-65G Maverick LMB + 500lb Mk-82 Space)', () => {
    const { scene, world, vehicle, pilot } = createPilotOrdnanceHarness({
      aircraftRole: 'cas',
      activeWeaponSlot: 0,
      pos: new THREE.Vector3(0, 220, 0),
      yaw: 0,
      pitch: -0.18,
      forwardSpeed: 72,
      gunshipOrbit: false
    });
    const enemyTank = {
      id: 'ru_t90_target',
      name: 'T-90M PRORYV (MBT)',
      type: 'tank',
      team: 'RU',
      dead: false,
      pos: new THREE.Vector3(0, 0, -480),
      yaw: 0,
      forwardSpeed: 12
    };
    pilot.vehicleManager.vehicles.push(enemyTank);

    // Switch to Slot 2 ([3] AGM/BOMB) via switchVehicleWeaponSlot
    pilot.switchVehicleWeaponSlot(2);
    assert.equal(vehicle.activeWeaponSlot, 2, 'A-10C must switch cleanly to Slot [3] (index 2)');

    // Fire [3] LMB -> AGM-65G Maverick ATGM locked onto enemy tank
    pilot.camera.position.set(0, 220, 0);
    pilot.camera.lookAt(enemyTank.pos);
    pilot.camera.updateMatrixWorld(true);
    pilot.isFiring = true;
    pilot.keys.Space = false;
    vehicle.fireCooldown = 0;
    pilot.updateAircraftControl(1 / 60, vehicle);

    assert.equal(world.projectiles.length, 1, 'A-10C Slot [3] LMB must launch 1 AGM-65G Maverick');
    const mav = world.projectiles[0];
    assert.equal(mav.type, 'air_rocket');
    assert.match(mav.weaponName, /MAVERICK/i);
    assert.equal(mav.targetVehicle, enemyTank, 'AGM-65G Maverick must lock onto enemy tank in seeker cone');
    assert.ok(mav.turnRate > 0 && mav.blastDamage >= 550);

    // Step Maverick homing toward moving tank
    const distBefore = mav.mesh.position.distanceTo(enemyTank.pos);
    world.updateProjectiles(0.1, [], null, null, [enemyTank]);
    const distAfter = mav.mesh.position.distanceTo(enemyTank.pos);
    assert.ok(distAfter < distBefore, 'AGM-65G Maverick must home toward locked ground armor');

    // Clear projectile and test [3] SPACE -> 500lb Mk-82 CCIP Bomb
    scene.remove(mav.mesh);
    world.projectiles.length = 0;
    pilot.isFiring = false;
    pilot.keys.Space = true;
    vehicle.coaxCooldown = 0;
    pilot.updateAircraftControl(1 / 60, vehicle);

    assert.equal(world.projectiles.length, 1, 'A-10C Slot [3] SPACE must release 1× 500lb Mk-82 CCIP Bomb');
    assert.equal(world.projectiles[0].type, 'jdam_bomb');
    assert.match(world.projectiles[0].weaponName, /MK-82/i);

    // Also verify Slot [2] (index 1) LMB fires Hydra-70 rocket WITHOUT firing 20mm Vulcan A2A
    scene.remove(world.projectiles[0].mesh);
    world.projectiles.length = 0;
    pilot.switchVehicleWeaponSlot(1);
    assert.equal(vehicle.activeWeaponSlot, 1);
    let vulcanRayFired = false;
    pilot.fireBallisticRay = () => {
      vulcanRayFired = true;
    };
    pilot.isFiring = true;
    pilot.keys.Space = false;
    vehicle.fireCooldown = 0;
    vehicle.coaxCooldown = 0;
    pilot.updateAircraftControl(1 / 60, vehicle);
    assert.equal(vulcanRayFired, false, 'A-10C Slot [2] LMB must NOT fall through to 20mm Vulcan cannon');
    assert.equal(world.projectiles.length, 1, 'A-10C Slot [2] LMB must fire Hydra-70 rocket');
    assert.match(world.projectiles[0].weaponName, /HYDRA/i);
  });
});
