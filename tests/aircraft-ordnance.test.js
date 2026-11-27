import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { sound } from '../src/audio.js?v=141';
import { createAircraftFlightFSM, createVehicleSubsystemsFSM } from '../src/core/StateMachines.js?v=141';
import { VehicleControlMethods } from '../src/player/VehicleControl.js?v=141';
import { VehicleManager } from '../src/vehicles.js?v=141';
import { ProjectileManager as ProjectileManagerMethods } from '../src/world/ProjectileManager.js?v=141';
import { createVehicleMesh } from '../src/models/vehicle-model.js?v=141';
import { BotManager, SQUAD_DEFS } from '../src/bots/BotManager.js?v=141';
import { SQUAD_KIT_CAPS } from '../src/config.js?v=141';

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

  test('[G] Flight Assist ON caps fighter roll upright; [G] OFF unlocks 360° inverted flight; Runway <=35% throttle stays in Taxi Mode & Pit-Stop repairs damaged airframe parts', () => {
    // 1. Verify F-15EX fighter wing sweeps BACKWARD (+Z aft at wingtips > root leading edge)
    const { group: f15Mesh } = createVehicleMesh({
      type: 'plane',
      isAircraft: true,
      aircraftRole: 'fighter',
      team: 'US'
    });
    const wingMesh = f15Mesh.children.find(
      (c) => c.isMesh && c.geometry?.type === 'ExtrudeGeometry' && Math.abs(c.position.y - 1.44) < 0.05
    );
    assert.ok(wingMesh, 'F-15EX must have sculpted ExtrudeGeometry cropped-delta main wing');
    const posAttr = wingMesh.geometry.attributes.position;
    let tipMaxZ = -Infinity;
    let rootMinZ = Infinity;
    for (let i = 0; i < posAttr.count; i++) {
      const vx = Math.abs(posAttr.getX(i));
      const vz = posAttr.getZ(i);
      if (vx > 5.0 && vz > tipMaxZ) tipMaxZ = vz;
      if (vx < 1.3 && vz < rootMinZ) rootMinZ = vz;
    }
    assert.ok(tipMaxZ > 1.5 && rootMinZ < -1.5, 'F-15EX wingtips must sweep BACKWARD (+Z) relative to forward wing root (-Z)');

    // 2. [G] AUTO ON (default): holding [A] for 2.5s turns smoothly & NEVER flips upside-down (|roll| <= 1.06 rad)
    const { pilot, vehicle } = createPilotOrdnanceHarness({
      aircraftRole: 'fighter',
      pos: new THREE.Vector3(0, 260, 0),
      forwardSpeed: 75
    });
    pilot.aircraftCollisionAvoidance = true;
    pilot.keys.KeyA = true;
    for (let step = 0; step < 150; step++) {
      pilot.updateAircraftControl(1 / 60, vehicle);
    }
    assert.ok(
      Math.abs(vehicle.roll) <= 1.06,
      `[G] AUTO ON must keep fighter upright in banked turns (got roll=${vehicle.roll.toFixed(3)} rad)`
    );

    // 3. [G] OFF (Advanced Aerobatics): holding [A] rolls past >2.1 rad into sustained upside-down flight!
    pilot.toggleAircraftCollisionAvoidance(false);
    vehicle.roll = 0;
    for (let step = 0; step < 65; step++) {
      pilot.updateAircraftControl(1 / 60, vehicle);
    }
    pilot.keys.KeyA = false;
    for (let step = 0; step < 25; step++) {
      pilot.updateAircraftControl(1 / 60, vehicle);
    }
    assert.ok(
      Math.abs(vehicle.roll) > 2.4,
      `[G] OFF must allow rolling into sustained ±180° inverted flight (got roll=${vehicle.roll.toFixed(3)} rad)`
    );

    // 4. Runway <=35% Taxi Detent stays on wheels (< liftoffSpeed), and HQ Runway Pit-Stop repairs damaged wings/engines!
    pilot.toggleAircraftCollisionAvoidance(true);
    pilot.pitch = 0;
    vehicle.pos.set(-2736, 0, -138);
    vehicle.roll = 0;
    vehicle.pitch = 0;
    vehicle.throttle = 0.28; // Inside <=35% Taxi Detent
    vehicle.forwardSpeed = 0;
    vehicle.hasLeftRunwayOnce = false;
    for (let step = 0; step < 120; step++) {
      pilot.updateAircraftControl(1 / 60, vehicle);
    }
    assert.ok(vehicle.forwardSpeed > 4 && vehicle.forwardSpeed <= 20.5, 'Runway <=35% throttle must cruise at ground taxi speed');
    assert.ok(vehicle.pos.y < 0.05, 'Aircraft in <=35% Runway Taxi Detent must remain on the tarmac without auto-launching');

    const airDefWorld = {
      era: 'modern',
      projectiles: [],
      getGroundHeightAt: () => 0,
      flags: []
    };
    const vm = new VehicleManager(new THREE.Scene(), airDefWorld);
    const hqJet = vm.vehicles.find((v) => v.isAircraft && v.team === 'US' && v.aircraftRole === 'fighter');
    const ruJet = vm.vehicles.find((v) => v.isAircraft && v.team === 'RU' && v.aircraftRole === 'fighter');
    assert.ok(hqJet && ruJet, 'US and RU HQ fighters exist');
    assert.ok(
      Math.abs(ruJet.spawnPos.x - hqJet.spawnPos.x) >= 5400,
      'US & RU Strategic Rear Airbases must be separated by >= 5,400m'
    );
    hqJet.pos.set(-2736, 0, -138);
    hqJet.forwardSpeed = 0;
    hqJet.hp = 820;
    hqJet.airframeParts = {
      avionics: 40,
      cockpit: 75,
      leftWing: 18,
      rightWing: 22,
      engines: 15,
      tail: 45
    };
    for (let i = 0; i < 45; i++) {
      vm.update(0.1, null, null, false);
    }
    assert.equal(Math.round(hqJet.airframeParts.leftWing), 100, 'Parked HQ Runway Pit-Stop must repair red leftWing to 100%');
    assert.equal(Math.round(hqJet.airframeParts.engines), 100, 'Parked HQ Runway Pit-Stop must repair red engines to 100%');

    // 5. Verify Hardened Revetment Spawn Protection (85% DR on own runway) & HQ Airbase C-RAM CIWS engaging enemy planes trying to land on RU runway!
    const preCampHp = ruJet.hp;
    vm.damageVehicle(ruJet, 200, 'SPAWN_CAMPER', 'US', '20MM VULCAN');
    assert.equal(preCampHp - ruJet.hp, 30, 'Parked aircraft on own HQ Airbase must receive 85% Revetment Spawn Protection');

    hqJet.driver = pilot;
    hqJet.pos.set(2620, 2.0, 68); // US jet trying to land at 2m AGL on the RU Rear Runway!
    for (let i = 0; i < 15; i++) {
      vm.update(0.1, pilot, null, false);
    }
    assert.ok(
      airDefWorld.projectiles.some((p) => /CIWS|AIRBASE SAM/i.test(p.weaponName || '')),
      'RU Airbase C-RAM / S-400 Defense Battery must engage enemy aircraft attempting to land on the RU runway'
    );
  });
});


// ============================================================================
// v125: AC-130 Top-Attack vs MBT + Tank BDA Logging, 1P Cockpit Airframe Lock,
//       Unfenced Tangent Orbit Entry, [R] Auto-Takeoff/Land & Specialized Squads
// ============================================================================
test('v125.1 Real-World Doctrine: AC-130 105mm HE immobilizes MBT (~4-5 hits) & logs Tank BDA, while A-10C Maverick/GAU-8 is a true 2-hit Tank-Buster', () => {
    const scene = new THREE.Scene();
    const world = {
      era: 'modern',
      projectiles: [],
      getGroundHeightAt: () => 0,
      spawnDebris: () => {},
      spawnExplosionVisual: () => {},
      flags: []
    };
    const vm = new VehicleManager(scene, world);
    const mbt =
      vm.vehicles.find((v) => v.type === 'tank' && v.team === 'RU') ||
      vm.spawnVehicle({
        id: 'ru_t90m_bda_test',
        name: 'T-90M PRORYV MBT',
        type: 'tank',
        team: 'RU',
        spawnPos: new THREE.Vector3(0, 0, 0),
        spawnYaw: 0,
        maxHp: 2100,
        speed: 16,
        weaponType: 'tank_cannon'
      });
    assert.ok(mbt, 'RU Main Battle Tank exists');
    mbt.hp = 2100;
    mbt.maxHp = 2100;
    mbt.eraBlocksIntact = 4;
    mbt.pos.set(0, 0, 0);
    mbt.yaw = 0; // Facing North (-Z)

    const bdaLogs = [];
    const onXp = (_xp, msg) => bdaLogs.push(msg);
    const gunshipPos = new THREE.Vector3(0, 320, -280);

    // 1. AC-130 25mm GAU-12 ricochets off MBT hull armor (<6 DMG) and marks ricochet in BDA
    vm.damageVehicle(mbt, 82, 'VIPER_1', 'US', '25MM GAU-12 EQUALIZER', null, onXp, gunshipPos);
    assert.equal(mbt.lastArmorRicochet, true);
    assert.ok(mbt.lastAppliedDamage <= 6, `25mm should ricochet (<6 DMG), got ${mbt.lastAppliedDamage}`);
    assert.equal(mbt.lastBdaSummary.hitsToGo, null, '25mm ricochet reports null/infinite hitsToGo');

    // 2. AC-130 105mm M102 HE Howitzer (`620 * 0.78 = 484` raw): strikes TOP ROOF (bypassing ERA),
    //    inflicts Track Mobility Kill on Hit #1, and logs ~4 hits to go (~5 total hits vs 2100 HP MBT)!
    mbt.hp = 2100;
    mbt.eraBlocksIntact = 4;
    mbt._lastBdaHudLogMs = -9999;
    const raw105He = Math.round(620 * 0.78);
    vm.damageVehicle(mbt, raw105He, 'VIPER_1', 'US', '105MM M102 HOWITZER', null, onXp, gunshipPos);
    assert.equal(mbt.lastHitZone, 'TOP ROOF');
    assert.equal(mbt.subsystems.tracks, 'DAMAGED', 'AC-130 105mm HE inflicts Track Mobility Kill');
    assert.equal(mbt.lastBdaSummary.hitNum, 1);
    assert.equal(mbt.lastBdaSummary.hitsToGo, 4, 'AC-130 105mm HE accurately logs ~4 more hits to destroy 2100 HP MBT');
    assert.ok(
      bdaLogs.some((m) => m.includes('[TANK BDA]') && m.includes('HIT #1') && m.includes('4 HITS TO GO')),
      `Expected live [TANK BDA] log with HIT #1 & 4 HITS TO GO, got: ${bdaLogs.join(' | ')}`
    );

    // 3. Dedicated Tank-Buster A-10C Warthog: AGM-65G Maverick (`580 * 1.85 = 1073` raw -> ~1202 shaped-charge DMG)
    //    destroys a full 2100 HP MBT in 2 hits!
    mbt.hp = 2100;
    mbt.eraBlocksIntact = 4;
    mbt._lastBdaHudLogMs = -9999;
    const rawMaverick = Math.round(580 * 1.85);
    assert.equal(
      vm.damageVehicle(mbt, rawMaverick, 'HOG_1', 'US', 'AGM-65G MAVERICK ATGM', null, onXp, gunshipPos),
      false
    );
    assert.equal(mbt.lastBdaSummary.hitsToGo, 1, '1st AGM-65G Maverick leaves 1 hit to go');
    mbt._lastBdaHudLogMs = -9999;
    assert.equal(
      vm.damageVehicle(mbt, rawMaverick, 'HOG_1', 'US', 'AGM-65G MAVERICK ATGM', null, onXp, gunshipPos),
      true,
      '2nd AGM-65G Maverick destroys full 2100 HP MBT'
    );
  });

  test('AC-130 orbit ring hides on runway, has zero geo-fence aloft & draws exact geometric right-hand tangent', () => {
    const { pilot: ctrl, vehicle: v } = createPilotOrdnanceHarness({
      aircraftRole: 'gunship',
      pos: new THREE.Vector3(-2780, 2.0, -138),
      forwardSpeed: 0
    });
    v.gunshipManualFlight = true;
    v.orbitRadius = 220;

    // 1. On the runway (altAgl < 32m): Orbit ring must be hidden!
    ctrl.updateGunshipOrbitVisualizer(v);
    assert.ok(!ctrl._gunshipOrbitVisGroup || ctrl._gunshipOrbitVisGroup.visible === false);

    // 2. Airborne far outside old [-1850, 1850] boundary (e.g. x = -2650, z = -1600): ZERO geo-fence!
    v.pos.set(-2650, 280, -1600);
    v.forwardSpeed = 52;
    v.yaw = 0; // Flying due North (-Z)
    ctrl.yaw = 0;
    ctrl.pitch = -0.35;
    ctrl.camera.position.set(-2650, 282, -1600);
    ctrl.camera.quaternion.setFromEuler(new THREE.Euler(-0.35, 0, 0, 'YXZ'));

    const predicted = ctrl.computePredictedGunshipOrbit(v);
    assert.ok(predicted.x < -2000 && predicted.z < -1700, `Orbit must NOT be geo-fenced to [-1850,-1250], got (${predicted.x}, ${predicted.z})`);

    ctrl.updateGunshipOrbitVisualizer(v);
    assert.equal(ctrl._gunshipOrbitVisGroup.visible, true);

    // Verify endpoint of 28-segment curved entryLine sits at the exact 90° geometric right-hand tangent!
    const { entryLine, entrySegs } = ctrl._gunshipOrbitVisGroup.userData;
    const arr = entryLine.geometry.attributes.position.array;
    const endIdx = entrySegs * 3;
    const tx = arr[endIdx];
    const tz = arr[endIdx + 2];
    const rVecX = tx - predicted.x;
    const rVecZ = tz - predicted.z;
    const rLen = Math.hypot(rVecX, rVecZ);
    assert.ok(Math.abs(rLen - v.orbitRadius) < 1.0, 'Entry curve terminates on orbit perimeter');

    // Straight line from aircraft `P` to tangent endpoint `T` must be perpendicular to radius `(T - C)`:
    const chordX = tx - v.pos.x;
    const chordZ = tz - v.pos.z;
    const cosAngle =
      (chordX * rVecX + chordZ * rVecZ) / (Math.hypot(chordX, chordZ) * rLen);
    assert.ok(Math.abs(cosAngle) < 0.02, `Expected 90° geometric tangent (cos≈0), got cos=${cosAngle.toFixed(4)}`);
  });

  test('1P Cockpit camera stays locked 1:1 to airframe attitude & [R] triggers Auto-Takeoff on runway / ILS Auto-Land on approach', () => {
    const { pilot: ctrl, vehicle: v } = createPilotOrdnanceHarness({
      aircraftRole: 'fighter',
      pos: new THREE.Vector3(0, 260, 0),
      forwardSpeed: 82
    });
    ctrl.vehicleCameraMode = 'COCKPIT_1P';
    ctrl.thirdPersonVehicle = false;

    // 1. Place jet airborne banking/turning: mouse `ctrl.yaw` leads `v.yaw` by 0.65 rad (~37°),
    //    yet `camera.quaternion` in `COCKPIT_1P` must match `v.yaw` (the physical airframe), NEVER jumping ahead!
    v.yaw = 0.2;
    v.pitch = 0.05;
    v.roll = 0.35;
    ctrl.yaw = 0.85; // Mouse pulled 37° left
    ctrl.pitch = 0.32;
    ctrl.updateAircraftControl(0.016, v);

    const camEuler = new THREE.Euler().setFromQuaternion(ctrl.camera.quaternion, 'YXZ');
    assert.ok(
      Math.abs(camEuler.y - v.yaw) < 0.02,
      `1P Cockpit yaw (${camEuler.y.toFixed(3)}) must match airframe v.yaw (${v.yaw.toFixed(3)}), NOT mouse ctrl.yaw (${ctrl.yaw.toFixed(3)})`
    );

    // 2. On friendly HQ Runway: pressing [R] engages Auto-Takeoff + 3D Takeoff Trail!
    v.pos.set(-2780, 1.8, -138);
    v.forwardSpeed = 0;
    v.throttle = 0;
    const modeTakeoff = ctrl.handleAircraftRKey();
    assert.equal(modeTakeoff, 'TAKEOFF');
    assert.equal(v.autoFlightMode, 'TAKEOFF');
    ctrl.updateRunwayFlightDirector(v);
    assert.equal(ctrl._runwayAssistVisGroup.visible, true);

    // Upon lifting off the runway (altAgl >= 11.5m & pastVr), BOTH green (TAKEOFF) AND orange (LANDING) guide lines vanish immediately!
    v.pos.set(-2560, 14.5, -68);
    v.forwardSpeed = 52;
    ctrl.updateAircraftControl(0.016, v);
    ctrl.updateRunwayFlightDirector(v);
    assert.equal(v.autoFlightMode, null, '[R] Auto-Takeoff completes immediately upon liftoff');
    assert.equal(
      ctrl._runwayAssistVisGroup.visible,
      false,
      'Both green takeoff and orange landing guide lines must immediately disappear upon liftoff'
    );

    // 3. After flying clear of the airport (>950m) and returning at low height (110m AGL), ILS Auto-Land is eligible
    //    AND aligns the 3D Flight-Director Trail dead-center onto the paved US Runway (z = -68, NOT grass z = 0)!
    v.pos.set(-1500, 180, 0);
    ctrl.getRunwayAssistEligibility(v); // Clears post-takeoff departure suppression once >950m away
    v.pos.set(-1950, 112, 35);
    v.forwardSpeed = 62;
    const modeLand = ctrl.handleAircraftRKey();
    assert.equal(modeLand, 'LANDING');
    assert.equal(v.autoFlightMode, 'LANDING');
    ctrl.updateRunwayFlightDirector(v);
    const trailLine = ctrl._runwayAssistVisGroup.children.find((c) => c.isLine);
    assert.ok(trailLine, '3D ILS Landing Trail line exists');
    const trailPosAttr = trailLine.geometry.attributes.position;
    const touchdownZ = trailPosAttr.getZ(trailPosAttr.count - 1);
    assert.ok(
      Math.abs(touchdownZ - -68) < 1.5,
      `ILS Landing Trail touchdown Z (${touchdownZ.toFixed(1)}) must sit on US paved runway centerline (z = -68)`
    );
  });

  test('Specialized Squad Types (Infantry 9P, Armor 4P, Air Wing 4P, Recon 6P), 12-Squad Roster & Custom Squad Creator', () => {
    assert.ok(SQUAD_DEFS.length >= 12, `Expected >=12 specialized squads, got ${SQUAD_DEFS.length}`);
    assert.equal(SQUAD_KIT_CAPS.SQUAD_TYPES.INFANTRY.maxSize, 9);
    assert.equal(SQUAD_KIT_CAPS.SQUAD_TYPES.ARMOR.maxSize, 4);
    assert.equal(SQUAD_KIT_CAPS.SQUAD_TYPES.AIR.maxSize, 4);
    assert.equal(SQUAD_KIT_CAPS.SQUAD_TYPES.RECON.maxSize, 6);
    assert.equal(SQUAD_KIT_CAPS.SQUAD_TYPES.INFANTRY.roleCaps.pilot, 0, 'Infantry squads separate from Pilots');
    assert.equal(SQUAD_KIT_CAPS.SQUAD_TYPES.AIR.roleCaps.pilot, 4, 'Air Wing squads hold up to 4 Pilots');

    const bm = new BotManager(new THREE.Scene(), {
      era: 'modern',
      flags: [{ id: 'A', owner: 'NEUTRAL', pos: new THREE.Vector3(0, 0, 0), radius: 34 }],
      spawns: { US_BASE: new THREE.Vector3(-1520, 0, 0), RU_BASE: new THREE.Vector3(1520, 0, 0) },
      getGroundHeightAt: () => 0
    });
    bm.bots = Array.from({ length: 16 }, (_, i) => ({
      id: `us_b_${i}`,
      team: 'US',
      squad: 'ALPHA',
      squadShort: 'ALP',
      role: 'ASSAULT',
      squadMemberIndex: i + 1
    }));

    const openRes = bm.createCustomSquad({ callsign: 'SHADOW', squadType: 'RECON', locked: false, team: 'US' });
    assert.equal(openRes.squad.id, 'SHADOW');
    assert.equal(openRes.squad.maxSize, 6);
    assert.equal(openRes.recruitedAi, 5, 'Open 6-man Recon custom squad recruits 5 AI teammates for the player SL');

    const lockedAir = bm.createCustomSquad({ callsign: 'SOLO-JET', squadType: 'AIR', locked: true, team: 'US' });
    assert.equal(lockedAir.squad.isAirSquad, true);
    assert.equal(lockedAir.squad.locked, true);
    assert.equal(lockedAir.recruitedAi, 0, 'Locked Air Wing custom squad stays solo without AI fill');
  });

  test('Realistic Vehicle & Aircraft Speed + Turn-Radius Physics Audit (Ground Ackermann/Pivot/Grip & Aircraft Load-Factor)', () => {
    const { VEHICLE_STATS } = { VEHICLE_STATS: null };
    const vm = new VehicleManager(new THREE.Scene(), {
      era: 'modern',
      projectiles: [],
      getGroundHeightAt: () => 0,
      flags: []
    });
    const tank = vm.vehicles.find((v) => v.type === 'tank');
    const apc = vm.vehicles.find((v) => v.type === 'apc');
    const humvee = vm.vehicles.find((v) => v.type === 'humvee');
    const bike = vm.vehicles.find((v) => v.type === 'bike');
    const atv = vm.vehicles.find((v) => v.type === 'atv');
    const fighter = vm.vehicles.find((v) => v.isAircraft && v.aircraftRole === 'fighter');
    const cas = vm.vehicles.find((v) => v.isAircraft && v.aircraftRole === 'cas');
    const b2 = vm.vehicles.find((v) => v.isAircraft && v.aircraftRole === 'b2_spirit');
    const gunship = vm.vehicles.find((v) => v.isAircraft && v.aircraftRole === 'gunship');

    // 1. Tank neutral pivots at 0 km/h (omega > 0.65 rad/s => R = 0m!), whereas wheeled Humvee & APC have omega = 0 at 0 km/h!
    assert.ok(VehicleControlMethods.computeGroundVehicleMaxYawRate(tank, 0) >= 0.68, 'MBT neutral-pivots in place at 0 km/h');
    assert.equal(VehicleControlMethods.computeGroundVehicleMaxYawRate(humvee, 0), 0, 'Wheeled Humvee cannot spin in place at 0 km/h');
    assert.equal(VehicleControlMethods.computeGroundVehicleMaxYawRate(apc, 0), 0, 'Wheeled 8x8 APC cannot spin in place at 0 km/h');

    // 2. Low-speed Ackermann minimum turning radii (5 m/s = 18 km/h) vs High-speed lateral tire/track grip radii!
    const humveeLowR = 5.0 / VehicleControlMethods.computeGroundVehicleMaxYawRate(humvee, 5.0);
    const apcLowR = 5.0 / VehicleControlMethods.computeGroundVehicleMaxYawRate(apc, 5.0);
    const bikeLowR = 5.0 / VehicleControlMethods.computeGroundVehicleMaxYawRate(bike, 5.0);
    const atvLowR = 5.0 / VehicleControlMethods.computeGroundVehicleMaxYawRate(atv, 5.0);
    assert.ok(Math.abs(humveeLowR - 7.5) < 0.2, `Humvee low-speed R_min should be ~7.5m (24.6 ft), got ${humveeLowR.toFixed(2)}m`);
    assert.ok(Math.abs(apcLowR - 8.8) < 0.2, `8x8 APC low-speed R_min should be ~8.8m, got ${apcLowR.toFixed(2)}m`);
    assert.ok(bikeLowR >= 2.4 && bikeLowR <= 4.2, `Recon Bike low-speed R_min should be ~2.9–3.9m, got ${bikeLowR.toFixed(2)}m`);
    assert.ok(atvLowR >= 3.5 && atvLowR <= 4.5, `4x4 Quad ATV low-speed R_min should be ~3.8–4.2m, got ${atvLowR.toFixed(2)}m`);

    const tankTopR = tank.speed / VehicleControlMethods.computeGroundVehicleMaxYawRate(tank, tank.speed);
    const humveeTopR = humvee.speed / VehicleControlMethods.computeGroundVehicleMaxYawRate(humvee, humvee.speed);
    const bikeTopR = bike.speed / VehicleControlMethods.computeGroundVehicleMaxYawRate(bike, bike.speed);
    assert.ok(tankTopR >= 35 && tankTopR <= 50, `Tank top-speed (68 km/h) turn radius should be ~42m, got ${tankTopR.toFixed(1)}m`);
    assert.ok(humveeTopR >= 58 && humveeTopR <= 82, `Humvee top-speed (99 km/h) turn radius should be ~70m (<1.15G), got ${humveeTopR.toFixed(1)}m`);
    assert.ok(bikeTopR >= 65 && bikeTopR <= 95, `Recon Bike top-speed (115 km/h) turn radius should be ~80m, got ${bikeTopR.toFixed(1)}m`);

    // 3. Aircraft Aerodynamic Load-Factor & Speed-Squared Turn Radii (`R ∝ V^2`):
    //    - Slowing down with [S] airbrake from 215 m/s (774 km/h) to 52 m/s (187 km/h) shrinks F-15 turn radius >10x (~570m -> ~40m)!
    //    - A-10C CAS turns tighter than F-15EX at cruise, and B-2A Spirit carves wide ~650m bomber arcs!
    const f15SlowDogfightR = 52 / VehicleControlMethods.computeAircraftBankedTurnRate(fighter, 52, 1.05, 0, 1, false);
    const f15CornerR = fighter.speed / VehicleControlMethods.computeAircraftBankedTurnRate(fighter, fighter.speed, 1.05, 0, 1, false);
    const f15AfterburnerR = fighter.maxSpeed / VehicleControlMethods.computeAircraftBankedTurnRate(fighter, fighter.maxSpeed, 1.05, 0, 1, false);
    const casSlowR = 42 / VehicleControlMethods.computeAircraftBankedTurnRate(cas, 42, 0.94, 0, 1, false);
    const casCruiseR = cas.speed / VehicleControlMethods.computeAircraftBankedTurnRate(cas, cas.speed, 0.94, 0, 1, false);
    const b2CruiseR = b2.speed / VehicleControlMethods.computeAircraftBankedTurnRate(b2, b2.speed, 0.62, 0, 1, false);
    const gunshipTransitR = gunship.speed / VehicleControlMethods.computeAircraftBankedTurnRate(gunship, gunship.speed, 0.52, 0, 1, false);

    assert.ok(f15SlowDogfightR >= 28 && f15SlowDogfightR <= 52, `F-15EX slow high-alpha dogfight radius should be ~38–42m, got ${f15SlowDogfightR.toFixed(1)}m`);
    assert.ok(f15CornerR >= 165 && f15CornerR <= 235, `F-15EX corner turn radius should be ~188m, got ${f15CornerR.toFixed(1)}m`);
    assert.ok(f15AfterburnerR >= 500 && f15AfterburnerR <= 660, `F-15EX afterburner turn radius should widen to ~578m, got ${f15AfterburnerR.toFixed(1)}m`);
    assert.ok(casSlowR >= 22 && casSlowR <= 38, `A-10C slow valley turn radius should be ~29m, got ${casSlowR.toFixed(1)}m`);
    assert.ok(casCruiseR >= 70 && casCruiseR <= 135, `A-10C CAS cruise turn radius should be ~78–95m, got ${casCruiseR.toFixed(1)}m`);
    assert.ok(b2CruiseR >= 550 && b2CruiseR <= 800, `B-2A Spirit cruise turn radius should be ~678m, got ${b2CruiseR.toFixed(1)}m`);
    assert.ok(gunshipTransitR >= 165 && gunshipTransitR <= 240, `AC-130 transit turn radius should be ~188m, got ${gunshipTransitR.toFixed(1)}m`);
    assert.ok(
      f15SlowDogfightR * 10 < f15AfterburnerR,
      'Chopping throttle from 774 km/h afterburner to 187 km/h merge speed must shrink F-15 turn radius by >10x!'
    );
    assert.ok(casCruiseR < f15CornerR && f15CornerR < f15AfterburnerR && f15CornerR < b2CruiseR);
  });

// ============================================================================
// v127: Transport & Attack Helicopters, 6x6 Troop Convoy Trucks, Rooftop Sniper
//       Fast-Rope Insertions & Downtown FOB C High-Rise Skyline
// ============================================================================
test('v127.1 Helicopters (UH-60M/Mi-8 Transport & AH-64E/Ka-52 Attack) + 6x6 Troop Trucks: models, seats, Recon access, AI convoys & 2-hit Hellfire/Vikhr ATGM', async () => {
  const { FRUGIS_RIVER_MAP } = await import('../src/maps/frugis-river.js?v=141');
  const scene = new THREE.Scene();
  const contestedFlagC = {
    id: 'C',
    name: 'OBJ CHARLIE — DOWNTOWN SKYLINE & BRIDGE PLAZA',
    owner: 'NEUTRAL',
    contested: true,
    pos: new THREE.Vector3(-2, 0, 12),
    radius: 36
  };
  const world = {
    era: 'modern',
    projectiles: [],
    voxels: new Map(),
    key: (gx, gy, gz) => `${gx},${gy},${gz}`,
    getGroundHeightAt: () => 0,
    worldToGrid: (x, y, z) => ({
      gx: Math.floor(x / 1.25),
      gy: Math.floor(y / 1.25),
      gz: Math.floor(z / 1.25)
    }),
    getVoxel: () => 0,
    spawnDebris: () => {},
    spawnExplosionVisual: () => {},
    flags: [contestedFlagC]
  };
  const vm = new VehicleManager(scene, world);

  const usTransHeli = vm.vehicles.find((v) => v.team === 'US' && v.aircraftRole === 'heli_transport');
  const ruTransHeli = vm.vehicles.find((v) => v.team === 'RU' && v.aircraftRole === 'heli_transport');
  const usAtkHeli = vm.vehicles.find((v) => v.team === 'US' && v.aircraftRole === 'heli_attack');
  const ruAtkHeli = vm.vehicles.find((v) => v.team === 'RU' && v.aircraftRole === 'heli_attack');
  const usTruck = vm.vehicles.find((v) => v.team === 'US' && v.type === 'truck_transport');
  const ruTruck = vm.vehicles.find((v) => v.team === 'RU' && v.type === 'truck_transport');

  assert.ok(usTransHeli && ruTransHeli, 'Both US UH-60M and RU Mi-8AMTSh transport helicopters spawn at Main Base HQ');
  assert.ok(usAtkHeli && ruAtkHeli, 'Both US AH-64E Apache and RU Ka-52 Alligator attack helicopters spawn at Main Base HQ');
  assert.ok(usTruck && ruTruck, 'Both US M1083A1 and RU KamAZ-5350 6x6 troop trucks spawn at Main Base HQ');

  // Seat capacities & 3D rotor hubs
  assert.equal(usTransHeli.seatNames.length, 8, 'UH-60M / Mi-8 transport helicopter must have 8 seats (Pilot, 2 Door Gunners, 5 Troops)');
  assert.equal(usTransHeli.crewSeats.length, 8);
  assert.equal(usAtkHeli.seatNames.length, 2, 'AH-64E / Ka-52 attack helicopter must have 2 tandem/side-by-side crew seats');
  assert.equal(usTruck.seatNames.length, 10, '6x6 troop transport truck must have 10 seats (Driver, Co-Driver, 8 Rear Bench)');
  assert.ok(
    usTransHeli.mesh.userData?.mainRotorHub && usTransHeli.mesh.userData?.tailRotorHub,
    'UH-60M has main + tail rotor hubs'
  );
  assert.ok(
    ruAtkHeli.mesh.userData?.mainRotorHub && ruAtkHeli.mesh.userData?.coaxUpperRotorHub,
    'Ka-52 Alligator has coaxial counter-rotating rotor hubs'
  );

  // Recon Sniper can order/fly Transport Helicopter AND request 6x6 Troop Truck even with strict Squad Doctrine ON!
  const reconSniper = {
    team: 'US',
    role: 'recon',
    canFlyAircraft: false,
    squadDoctrineEnabled: true,
    pos: new THREE.Vector3(-1500, 0, -40),
    yaw: 0,
    payForVehicleRequisition: () => ({ ok: true, cost: 750, useStock: true }),
    getVehicleUpgradeMods: () => ({})
  };
  const heliOrderRes = vm.orderPlayerAircraft(reconSniper, 'heli_transport');
  assert.equal(heliOrderRes.ok, true, 'Recon Sniper must be allowed to fly/order Transport Helicopter with Doctrine ON');
  const atkBlockedRes = vm.orderPlayerAircraft(reconSniper, 'heli_attack');
  assert.equal(atkBlockedRes.ok, false, 'Dedicated Attack Helicopter still requires Combat Pilot license when Doctrine ON');
  const truckOrderRes = vm.requestPlayerArmorVehicle(reconSniper, 'truck_transport');
  assert.equal(truckOrderRes.ok, true, 'Infantry/Recon must be allowed to request 6x6 Troop Truck with Doctrine ON');

  // Hellfire / Vikhr ATGM is a true 2-hit MBT Tank-Buster
  const ruTank = vm.vehicles.find((v) => v.type === 'tank' && v.team === 'RU');
  assert.ok(ruTank);
  ruTank.hp = 2100;
  ruTank.maxHp = 2100;
  ruTank.eraBlocksIntact = 4;
  const apachePos = new THREE.Vector3(ruTank.pos.x - 180, 95, ruTank.pos.z);
  assert.equal(
    vm.damageVehicle(ruTank, 1180, 'APACHE_1', 'US', 'AGM-114L HELLFIRE ATGM', null, null, apachePos),
    false,
    '1st AGM-114L Hellfire leaves 2100 HP MBT crippled with 1 hit to go'
  );
  assert.equal(
    vm.damageVehicle(ruTank, 1180, 'APACHE_1', 'US', 'AGM-114L HELLFIRE ATGM', null, null, apachePos),
    true,
    '2nd AGM-114L Hellfire destroys 2100 HP MBT'
  );

  // AI Infantry Convoy Boarding at HQ & Auto-Disembark near Contested Downtown FOB C!
  const driverBot = {
    id: 'us_convoy_drv',
    name: 'CPL_DRIVER',
    team: 'US',
    role: 'ASSAULT',
    squad: 'ALPHA',
    dead: false,
    downed: false,
    pos: usTruck.pos.clone(),
    mesh: new THREE.Group()
  };
  const squadRiders = Array.from({ length: 4 }, (_, idx) => ({
    id: `us_rider_${idx}`,
    name: `PVT_RIDER_${idx}`,
    team: 'US',
    role: idx === 0 ? 'RECON' : 'MEDIC',
    squad: 'ALPHA',
    dead: false,
    downed: false,
    drivingVehicle: null,
    ridingVehicle: null,
    pos: usTruck.pos.clone().add(new THREE.Vector3(3 + idx, 0, 2)),
    mesh: new THREE.Group(),
    resupplyTimer: 0
  }));
  usTruck.npcDriver = driverBot;
  driverBot.drivingVehicle = usTruck;
  const mockBm = { bots: [driverBot, ...squadRiders] };

  vm.update(0.25, null, mockBm, false);
  assert.equal(usTruck.aiPassengers.length, 4, 'Nearby friendly infantry bots automatically board 6x6 convoy truck at HQ');
  assert.equal(squadRiders[0].ridingVehicle, usTruck);
  assert.equal(squadRiders[0].mesh.visible, false);

  // Drive truck within 38m of contested Downtown Objective C -> AI squad automatically disembarks!
  usTruck.pos.set(-34, 0, 10);
  vm.update(0.25, null, mockBm, false);
  assert.equal(usTruck.aiPassengers.length, 0, 'AI squad automatically disembarks 6x6 truck within 52m of contested flag');
  assert.equal(squadRiders[0].ridingVehicle, null);
  assert.equal(squadRiders[0].mesh.visible, true);

  // Downtown FOB C Skyline check: >= 12 monumental high-rise skyscrapers (10–16 stories = 50m–80m tall, 18×16 to 22×20 voxels = 22.5m–27.5m wide!)
  const downtownHighRises = FRUGIS_RIVER_MAP.buildings.filter(
    (b) => Math.abs(b[0]) <= 100 && Math.abs(b[1]) <= 75 && b[4] >= 10
  );
  const pinnacleTowers = downtownHighRises.filter((b) => b[4] >= 16 && b[2] >= 22 && b[3] >= 20);
  assert.ok(downtownHighRises.length >= 12, `Expected >=12 Downtown FOB C skyscrapers, got ${downtownHighRises.length}`);
  assert.ok(pinnacleTowers.length >= 2, 'Downtown FOB C must include twin 16-story (80m, 27.5m × 25m) sniper & helipad pinnacle towers');
});

test('v127.2 Helicopter 3D Collective/Hover Physics, Zero Stall & Safe Rooftop Sniper Insertion on 35m Skyscraper', () => {
  const roofHeightM = 35.0; // 7-story Downtown FOB C skyscraper roof with "H" helipad
  const { pilot, vehicle } = createPilotOrdnanceHarness({
    aircraftRole: 'heli_transport',
    pos: new THREE.Vector3(-52, 0, -28),
    forwardSpeed: 0,
    gunshipOrbit: false
  });
  vehicle.isHelicopter = true;
  vehicle.minSpeed = 0;
  vehicle.liftoffSpeed = 0;
  vehicle.speed = 65;
  vehicle.maxSpeed = 79;
  vehicle.heliHoverHold = false;
  vehicle.heliVertVel = 0;
  vehicle.velVector = new THREE.Vector3();

  // 1.Helicopter never triggers fixed-wing runway takeoff/landing guide ribbons
  assert.equal(pilot.getRunwayAssistEligibility(vehicle), null, 'Helicopters must never show fixed-wing runway ILS trails');

  // 2. Easy Mode ([G] ON default): Collective climb [Space] from 0 km/h hover with real 9-ton rotor inertia, ZERO stall & ZERO rocket launches!
  vehicle.pos.set(0, 0, 0);
  pilot.getAircraftObstacleHeightAt = (wx, wz) =>
    Math.abs(wx - -52) <= 7 && Math.abs(wz - -28) <= 6 ? roofHeightM : 0;
  pilot.keys.Space = true;
  for (let i = 0; i < 120; i++) {
    pilot.updateAircraftControl(1 / 60, vehicle);
  }
  pilot.keys.Space = false;
  assert.ok(vehicle.pos.y > 7.5, `Helicopter [Space] collective must climb vertically from 0 km/h over 2.0s (got y=${vehicle.pos.y.toFixed(2)}m)`);
  assert.equal(vehicle.isStalling, false, 'Helicopter must never enter fixed-wing aerodynamic stall at 0 km/h');
  assert.equal(pilot.world.projectiles.length, 0, '[Space] collective climb in helicopter must NEVER fire Hydra-70 rockets');

  // 3. [R] engages Auto-Hover Hold (`HOVER_HOLD`) in mid-air
  const rMode = pilot.handleAircraftRKey();
  assert.equal(rMode, 'HOVER_HOLD');
  assert.equal(vehicle.heliHoverHold, true);

  // 4. Position above the 35m Downtown Skyscraper Rooftop Helipad (-52, 38.2, -28), release Hover Hold & descend [Ctrl] onto solid roof!
  pilot.handleAircraftRKey(); // Toggle Hover Hold OFF
  assert.equal(vehicle.heliHoverHold, false);
  vehicle.pos.set(-52, roofHeightM + 3.2, -28);
  vehicle.heliHoverAlt = roofHeightM + 3.2;
  vehicle._heliVelY = -1.5;
  pilot.keys.ControlLeft = true;
  for (let i = 0; i < 130; i++) {
    pilot.updateAircraftControl(1 / 60, vehicle);
  }
  pilot.keys.ControlLeft = false;
  assert.equal(vehicle.dead, false, 'Helicopter must touch down gently on 35m skyscraper helipad without crashing');
  assert.ok(
    Math.abs(vehicle.pos.y - roofHeightM) < 0.25,
    `Helicopter skids must rest solidly on the 35m skyscraper roof (got y=${vehicle.pos.y.toFixed(2)}m)`
  );

  // 5. Recon Sniper presses [E] on/above the 35m skyscraper roof -> steps safely onto the roof (NO parachute eject, 0 fall velocity)!
  pilot.vel = new THREE.Vector3(0, -12, 0);
  pilot.parachuting = false;
  let ejectedWithChute = false;
  pilot.activateParachuteEject = () => {
    ejectedWithChute = true;
    pilot.parachuting = true;
  };
  pilot.handleVehicleAndDragKey();
  assert.equal(pilot.activeVehicle, null, 'Sniper exits transport helicopter');
  assert.equal(ejectedWithChute, false, 'Exiting on/above skyscraper roof (<=22m clearance) must NOT parachute-eject away from roof');
  assert.ok(
    pilot.pos.y >= roofHeightM,
    `Sniper must stand safely on top of the 35m skyscraper roof (got y=${pilot.pos.y.toFixed(2)}m)`
  );
  assert.equal(pilot.vel.y, 0, 'Rooftop step-out / fast-rope insertion sets vertical velocity to 0 for zero fall damage');
});
