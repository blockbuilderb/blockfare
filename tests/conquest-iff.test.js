import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { ConquestSystem as ConquestSystemMethods } from '../src/world/ConquestSystem.js';
import {
  VEHICLE_DEFS,
  OBJECTIVE_MOTORPOOL_BASES
} from '../src/assets/vehicle-defs.js';
import { VehicleManager } from '../src/vehicles.js';
import { events } from '../src/events.js?v=143';

const NODE_FOB_LAYOUT = [
  { id: 'A', name: 'FOB ALPHA', x: -660, z: -280, radius: 28 },
  { id: 'B', name: 'FOB BRAVO', x: -320, z: 320, radius: 28 },
  { id: 'C', name: 'FOB CHARLIE', x: 0, z: 0, radius: 28 },
  { id: 'D', name: 'FOB DELTA', x: 330, z: -320, radius: 28 },
  { id: 'E', name: 'FOB ECHO', x: 660, z: 280, radius: 28 }
];

function createConquestWorld(flagDefs = NODE_FOB_LAYOUT) {
  const scene = new THREE.Scene();
  const world = {
    scene,
    era: 'modern',
    voxels: new Map(),
    projectiles: [],
    flags: flagDefs.map((f) => ({
      id: f.id,
      name: f.name || `FOB ${f.id}`,
      pos: new THREE.Vector3(f.x, 0, f.z),
      radius: f.radius ?? 28,
      owner: f.owner ?? 'NEUTRAL',
      lastTeamOwner: f.lastTeamOwner ?? (f.owner && f.owner !== 'NEUTRAL' ? f.owner : 'NEUTRAL'),
      captureProgress: f.captureProgress ?? 0,
      contested: Boolean(f.contested),
      defenseStage: f.defenseStage ?? 0
    })),
    getGroundHeightAt: () => 0,
    worldToGrid: (x, y, z) => ({
      gx: Math.floor(x),
      gy: Math.floor(y),
      gz: Math.floor(z)
    }),
    key: (gx, gy, gz) => `${gx},${gy},${gz}`,
    spawnDebris: () => {},
    destroyVoxel: () => false
  };
  Object.assign(world, ConquestSystemMethods);
  world.buildConquestFlags();
  return { scene, world };
}

function makeFarPlayerStub() {
  // ConquestSystem treats units[0] as playerUnit (5x/6x weight); place far outside flags
  // whenever testing standard 1x soldier / bot capture weights.
  return {
    id: 'player_far_stub',
    team: 'US',
    pos: new THREE.Vector3(99999, 0, 99999),
    hp: 100,
    dead: false,
    downed: false,
    bleedOutTimer: 0,
    downedTimer: 0,
    postReviveTimer: 0
  };
}

function makeSoldier(team, x, z, overrides = {}) {
  return {
    team,
    pos: new THREE.Vector3(x, 0, z),
    hp: 100,
    dead: false,
    downed: false,
    bleedOutTimer: 0,
    downedTimer: 0,
    postReviveTimer: 0,
    ...overrides
  };
}

// ============================================================================
// 1. ConquestSystemMethods.updateFlags & resetFlagsForNewRound
// ============================================================================

test('ConquestSystem.updateFlags: living soldiers & player capture flags and emit capture callbacks', () => {
  events.clear();
  const { world } = createConquestWorld([{ id: 'C', x: 0, z: 0, radius: 28 }]);
  const flag = world.flags[0];

  const capturedEvents = [];
  const unsub = events.on('flag:captured', (payload) => capturedEvents.push(payload));
  const callbackCalls = [];
  const onFlagCaptured = (fl, newOwner, prevOwner) => {
    callbackCalls.push({ id: fl.id, newOwner, prevOwner });
  };

  try {
    // 1. Human player (units[0]) within <=16m inner core gets 6x capture weight; outside 16m gets 5x
    const playerInner = makeSoldier('US', 5, 0);
    world.updateFlags(0.5, [playerInner], onFlagCaptured);
    assert.equal(flag.usPresent, 1);
    assert.equal(flag.usWeight, 6);
    assert.equal(flag.ruWeight, 0);
    // speed = min(6, 5) * 16 * 0.5 = +40
    assert.equal(flag.captureProgress, 40);
    assert.equal(flag.owner, 'NEUTRAL');
    assert.equal(flag._lastColorHex, 0x3498db);

    const playerOuter = makeSoldier('US', 20, 0);
    world.updateFlags(0.25, [playerOuter], onFlagCaptured);
    assert.equal(flag.usWeight, 5);
    // +40 + (5 * 16 * 0.25 = +20) = +60
    assert.equal(flag.captureProgress, 60);

    // 2. Standard living soldiers (including one with postReviveTimer <= 1.05) finish the capture to +100
    const farPlayer = makeFarPlayerStub();
    const bot1 = makeSoldier('US', 4, 4);
    const botRecovered = makeSoldier('US', -4, 3, { postReviveTimer: 1.05 });
    // +60 + (2 * 16 * 1.25 = +40) = +100
    world.updateFlags(1.25, [farPlayer, bot1, botRecovered], onFlagCaptured);

    assert.equal(flag.usPresent, 2);
    assert.equal(flag.usWeight, 2);
    assert.equal(flag.captureProgress, 100);
    assert.equal(flag.owner, 'US');
    assert.equal(flag.lastTeamOwner, 'US');
    assert.equal(capturedEvents.length, 1);
    assert.equal(capturedEvents[0].newOwner, 'US');
    assert.equal(capturedEvents[0].prevOwner, 'NEUTRAL');
    assert.deepEqual(callbackCalls, [{ id: 'C', newOwner: 'US', prevOwner: 'NEUTRAL' }]);
    assert.ok(Math.abs(flag.bannerMesh.position.y - 9.0) < 1e-6);

    // 3. Also verify botManager.spatialGrid query path excludes downed bodies & never double-counts playerUnit
    const gridBots = [
      makeSoldier('RU', 2, -2),
      makeSoldier('RU', -3, 2, { downed: true })
    ];
    world.botManager = {
      spatialGrid: {
        count: gridBots.length,
        forEachInRadius(_fx, _fz, rad, cb) {
          for (const b of gridBots) {
            const dSq = b.pos.x * b.pos.x + b.pos.z * b.pos.z;
            if (dSq <= rad * rad) cb(b, dSq);
          }
          // Even if playerUnit is also visited in grid, updateFlags skips bot === playerUnit
          cb(farPlayer, 0);
        }
      }
    };
    world.updateFlags(0.5, [farPlayer, ...gridBots]);
    assert.equal(flag.ruPresent, 1);
    assert.equal(flag.ruWeight, 1);
    assert.equal(flag.ruDownedPresent, 1);
    assert.equal(flag.usPresent, 0);
  } finally {
    unsub();
  }
});

test('ConquestSystem.updateFlags: dead, downed, hp <= 0, bleedOutTimer > 0, downedTimer > 0, and postReviveTimer > 1.05 contribute ZERO capture weight', () => {
  const { world } = createConquestWorld([
    { id: 'A', x: -660, z: -280, radius: 28, owner: 'NEUTRAL', captureProgress: 0 },
    { id: 'B', x: -320, z: 320, radius: 28, owner: 'US', captureProgress: 100 }
  ]);
  const neutralFlag = world.flags[0];
  const usOwnedFlag = world.flags[1];
  const farPlayer = makeFarPlayerStub();

  // Place every incapacitated / dead variant directly on neutral FOB A (distance = 0)
  const invalidUsUnits = [
    makeSoldier('US', -660, -280, { dead: true, hp: 100 }),
    makeSoldier('US', -660, -280, { downed: true, hp: 35 }),
    makeSoldier('US', -660, -280, { hp: 0 }),
    makeSoldier('US', -660, -280, { hp: -15 }),
    makeSoldier('US', -660, -280, { bleedOutTimer: 6.5, hp: 25 }),
    makeSoldier('US', -660, -280, { downedTimer: 2.0, hp: 25 }),
    makeSoldier('US', -660, -280, { postReviveTimer: 1.06, hp: 50 }),
    makeSoldier('US', -660, -280, { postReviveTimer: 2.25, hp: 50 })
  ];

  // Also test incapacitated Human Player at units[0] directly on neutral FOB A
  for (const playerVariant of [
    makeSoldier('US', -660, -280, { dead: true }),
    makeSoldier('US', -660, -280, { downed: true }),
    makeSoldier('US', -660, -280, { hp: 0 }),
    makeSoldier('US', -660, -280, { bleedOutTimer: 0.1 }),
    makeSoldier('US', -660, -280, { postReviveTimer: 1.06 })
  ]) {
    world.updateFlags(1.0, [playerVariant, ...invalidUsUnits]);
    assert.equal(neutralFlag.usPresent, 0);
    assert.equal(neutralFlag.usWeight, 0);
    assert.equal(neutralFlag.captureProgress, 0);
    assert.equal(neutralFlag.owner, 'NEUTRAL');
  }

  // Verify non-dead incapacitated bodies increment usDownedPresent while contributing 0 weight
  world.updateFlags(1.0, [farPlayer, ...invalidUsUnits]);
  assert.equal(neutralFlag.usPresent, 0);
  assert.equal(neutralFlag.usWeight, 0);
  assert.equal(neutralFlag.usDownedPresent, 7); // 7 non-dead incapacitated US bodies (dead is skipped first)
  assert.equal(neutralFlag.captureProgress, 0);
  assert.equal(neutralFlag.owner, 'NEUTRAL');

  // Place enemy RU incapacitated/dead bodies directly on US-owned FOB B:
  // must neither contest the base nor pull captureProgress down from 100!
  const invalidRuAttackers = [
    makeSoldier('RU', -320, 320, { dead: true }),
    makeSoldier('RU', -320, 320, { downed: true }),
    makeSoldier('RU', -320, 320, { hp: 0 }),
    makeSoldier('RU', -320, 320, { bleedOutTimer: 4.0 }),
    makeSoldier('RU', -320, 320, { postReviveTimer: 1.2 })
  ];
  world.updateFlags(2.0, [farPlayer, ...invalidRuAttackers]);
  assert.equal(usOwnedFlag.ruPresent, 0);
  assert.equal(usOwnedFlag.ruWeight, 0);
  assert.equal(usOwnedFlag.ruDownedPresent, 4);
  assert.equal(usOwnedFlag.contested, false);
  assert.equal(usOwnedFlag.zoneClashing, false);
  assert.equal(usOwnedFlag.captureProgress, 100);
  assert.equal(usOwnedFlag.owner, 'US');

  // Once postReviveTimer ticks down to <= 1.05, that revived soldier immediately contributes weight
  const newlyReadyFighter = makeSoldier('RU', -320, 320, { postReviveTimer: 1.05, hp: 50 });
  world.updateFlags(0.5, [farPlayer, newlyReadyFighter]);
  assert.equal(usOwnedFlag.ruPresent, 1);
  assert.equal(usOwnedFlag.ruWeight, 1);
  assert.equal(usOwnedFlag.contested, true);
  assert.ok(usOwnedFlag.captureProgress < 100);
});

test('ConquestSystem.updateFlags: neutralizing an enemy flag across 0 immediately flips owner to NEUTRAL before capturing to the new team', () => {
  events.clear();
  const { world } = createConquestWorld([
    {
      id: 'D',
      x: 330,
      z: -320,
      radius: 28,
      owner: 'RU',
      lastTeamOwner: 'RU',
      captureProgress: -100,
      defenseStage: 3
    },
    {
      id: 'B',
      x: -320,
      z: 320,
      radius: 28,
      owner: 'US',
      lastTeamOwner: 'US',
      captureProgress: 100,
      defenseStage: 2
    }
  ]);
  const ruFlag = world.flags[0];
  const usFlag = world.flags[1];
  const farPlayer = makeFarPlayerStub();
  const captures = [];

  const onCaptured = (flag, newOwner, prevOwner) => {
    captures.push({ id: flag.id, newOwner, prevOwner, defenseStage: flag.defenseStage });
  };

  // 5 US soldiers give capped netWeight = +5 -> speed = 5 * 16 * dt = 80 * dt per second
  const usSquad = Array.from({ length: 5 }, (_, i) => makeSoldier('US', 330 + i, -320));

  // Step 1: Pull RU flag from -100 to -12 (dt = 1.1s -> +88 progress, outside |prog| <= 10): still owned by RU!
  world.updateFlags(1.1, [farPlayer, ...usSquad], onCaptured);
  assert.equal(ruFlag.captureProgress, -12);
  assert.equal(ruFlag.owner, 'RU');
  assert.equal(ruFlag.contested, true);
  assert.equal(captures.length, 0);

  // Step 2: Cross 0 in a single step from -12 to +20 (dt = 0.4s -> +32 progress, jumping right over [-10, +10]!)
  // Must immediately flip owner to 'NEUTRAL' without prematurely becoming 'US' or staying 'RU'!
  world.updateFlags(0.4, [farPlayer, ...usSquad], onCaptured);
  assert.equal(ruFlag.captureProgress, 20);
  assert.equal(ruFlag.owner, 'NEUTRAL');
  assert.equal(ruFlag.lastTeamOwner, 'RU');
  assert.equal(captures.length, 0);

  // Step 3: Advance from +20 to +84 (dt = 0.8s -> +64): remains 'NEUTRAL' until >= 99
  world.updateFlags(0.8, [farPlayer, ...usSquad], onCaptured);
  assert.equal(ruFlag.captureProgress, 84);
  assert.equal(ruFlag.owner, 'NEUTRAL');
  assert.equal(captures.length, 0);

  // Step 4: Finish capture to +100 (dt = 0.25s -> +20, clamped to 100): flips to 'US' & resets defenseStage
  world.updateFlags(0.25, [farPlayer, ...usSquad], onCaptured);
  assert.equal(ruFlag.captureProgress, 100);
  assert.equal(ruFlag.owner, 'US');
  assert.equal(ruFlag.lastTeamOwner, 'US');
  assert.equal(ruFlag.defenseStage, 0);
  assert.deepEqual(captures, [{ id: 'D', newOwner: 'US', prevOwner: 'RU', defenseStage: 0 }]);

  // Symmetric check: RU squad pulls US-owned FOB B from +100 -> +12 (still US) -> -20 (NEUTRAL) -> -100 (RU)
  const ruSquad = Array.from({ length: 5 }, (_, i) => makeSoldier('RU', -320 - i, 320));
  world.updateFlags(1.1, [farPlayer, ...ruSquad], onCaptured);
  assert.equal(usFlag.captureProgress, 12);
  assert.equal(usFlag.owner, 'US');

  world.updateFlags(0.4, [farPlayer, ...ruSquad], onCaptured);
  assert.equal(usFlag.captureProgress, -20);
  assert.equal(usFlag.owner, 'NEUTRAL');
  assert.equal(usFlag.lastTeamOwner, 'US');
  assert.equal(captures.length, 1);

  world.updateFlags(1.0, [farPlayer, ...ruSquad], onCaptured);
  assert.equal(usFlag.captureProgress, -100);
  assert.equal(usFlag.owner, 'RU');
  assert.equal(usFlag.lastTeamOwner, 'RU');
  assert.equal(usFlag.defenseStage, 0);
  assert.equal(captures.length, 2);
  assert.deepEqual(captures[1], { id: 'B', newOwner: 'RU', prevOwner: 'US', defenseStage: 0 });
});

test('ConquestSystem.updateFlags: entrenched defender advantage (1.35 + 0.075 * defenseStage) outweighs a lone attacker when fortified', () => {
  const { world } = createConquestWorld([
    {
      id: 'A',
      x: -660,
      z: -280,
      radius: 28,
      owner: 'US',
      lastTeamOwner: 'US',
      captureProgress: 70,
      defenseStage: 0
    },
    {
      id: 'C',
      x: 0,
      z: 0,
      radius: 28,
      owner: 'NEUTRAL',
      lastTeamOwner: 'NEUTRAL',
      captureProgress: 0,
      defenseStage: 4
    }
  ]);
  const usFob = world.flags[0];
  const neutralFob = world.flags[1];
  const farPlayer = makeFarPlayerStub();
  const loneUsDefender = makeSoldier('US', -655, -280);
  const loneRuAttacker = makeSoldier('RU', -665, -280);

  // Verify exact formula 1.35 + 0.075 * min(4, defenseStage) across stages 0..4 (and clamp at 6 -> stage 4)
  for (const [stage, expectedMult] of [
    [0, 1.35],
    [1, 1.425],
    [2, 1.5],
    [3, 1.575],
    [4, 1.65],
    [6, 1.65]
  ]) {
    usFob.owner = 'US';
    usFob.defenseStage = stage;
    usFob.captureProgress = 70;

    world.updateFlags(0.5, [farPlayer, loneUsDefender, loneRuAttacker]);

    const expectedRounded = Math.round(expectedMult * 100) / 100;
    assert.equal(usFob.defenderWeightMult, expectedRounded);
    assert.equal(usFob.usWeight, expectedRounded);
    assert.equal(usFob.ruWeight, 1);
    assert.ok(
      usFob.usWeight > usFob.ruWeight,
      `Expected defender weight ${usFob.usWeight} > lone attacker weight ${usFob.ruWeight} at stage ${stage}`
    );

    // Because netWeight = expectedMult - 1.0 > 0, the entrenched defender pushes captureProgress UP toward +100!
    const expectedDelta = (expectedMult - 1.0) * 16 * 0.5;
    assert.ok(
      Math.abs(usFob.captureProgress - (70 + expectedDelta)) < 1e-6,
      `Expected captureProgress to increase by ${expectedDelta} at stage ${stage}, got ${usFob.captureProgress}`
    );
  }

  // On a fully fortified RU base (defenseStage = 4 -> 1.65x), 1 RU defender outweighs 1 US attacker and pushes toward -100
  usFob.owner = 'RU';
  usFob.lastTeamOwner = 'RU';
  usFob.defenseStage = 4;
  usFob.captureProgress = -70;
  world.updateFlags(1.0, [farPlayer, loneUsDefender, loneRuAttacker]);
  assert.equal(usFob.ruWeight, 1.65);
  assert.equal(usFob.usWeight, 1);
  assert.ok(Math.abs(usFob.captureProgress - (-70 - 0.65 * 16 * 1.0)) < 1e-6);

  // Neutral flags NEVER grant entrenched defender advantage even if defenseStage is non-zero
  world.updateFlags(1.0, [
    farPlayer,
    makeSoldier('US', 2, 0),
    makeSoldier('RU', -2, 0)
  ]);
  assert.equal(neutralFob.usWeight, 1);
  assert.equal(neutralFob.ruWeight, 1);
  assert.equal(neutralFob.captureProgress, 0);
});

test('ConquestSystem.resetFlagsForNewRound: resets all FOB flags to clean NEUTRAL state', () => {
  const { world } = createConquestWorld();
  const farPlayer = makeFarPlayerStub();

  // Dirty multiple flags with occupation, fortifications, clashing & downed counters
  world.flags[0].owner = 'US';
  world.flags[0].lastTeamOwner = 'US';
  world.flags[0].captureProgress = 100;
  world.flags[0].defenseStage = 4;
  world.updateFlags(0.1, [
    farPlayer,
    makeSoldier('US', -660, -280),
    makeSoldier('RU', -658, -280),
    makeSoldier('US', -659, -280, { downed: true })
  ]);

  world.flags[4].owner = 'RU';
  world.flags[4].lastTeamOwner = 'RU';
  world.flags[4].captureProgress = -100;
  world.flags[4].defenseStage = 2;
  world.flags[4].bannerMesh.position.y = 9.0;
  world.flags[4].bannerMesh.material.color.setHex(0xe74c3c);
  world.flags[4].zoneMesh.material.color.setHex(0xe74c3c);

  world.resetFlagsForNewRound();

  for (const flag of world.flags) {
    assert.equal(flag.owner, 'NEUTRAL');
    assert.equal(flag.lastTeamOwner, 'NEUTRAL');
    assert.equal(flag.captureProgress, 0);
    assert.equal(flag.contested, false);
    assert.equal(flag.zoneClashing, false);
    assert.equal(flag.defenseStage, 0);
    assert.equal(flag.usPresent, 0);
    assert.equal(flag.ruPresent, 0);
    assert.equal(flag.usWeight, 0);
    assert.equal(flag.ruWeight, 0);
    assert.equal(flag.usDownedPresent, 0);
    assert.equal(flag.ruDownedPresent, 0);
    assert.equal(flag._lastColorHex, 0x95a5a6);
    assert.equal(flag.bannerMesh.position.y, 2.4);
    assert.equal(flag.bannerMesh.material.color.getHex(), 0x95a5a6);
    assert.equal(flag.zoneMesh.material.color.getHex(), 0x95a5a6);
  }
});

// ============================================================================
// 2. FOB Motorpool & Emplacement {NEUTRAL, US, RU} IFF Sync
// ============================================================================

test('vehicle-defs.js: all FOB A..E motorpool configs start with team NEUTRAL and valid fobFlagId', () => {
  const expectedFobIds = ['A', 'B', 'C', 'D', 'E'];
  const validFobSet = new Set(expectedFobIds);

  // Check OBJECTIVE_MOTORPOOL_BASES definitions for FOBs a..e
  const fobBases = OBJECTIVE_MOTORPOOL_BASES.filter((b) => b.baseId !== 'us_hq' && b.baseId !== 'ru_hq');
  assert.equal(fobBases.length, 5);
  assert.deepEqual(
    fobBases.map((b) => b.fobFlagId),
    expectedFobIds
  );
  for (const base of fobBases) {
    assert.equal(base.team, 'NEUTRAL', `Expected FOB base ${base.baseId} to start NEUTRAL`);
  }

  // Check generated VEHICLE_DEFS motorpool spawn configs for FOBs A..E
  const fobMotorpoolVehicles = VEHICLE_DEFS.filter(
    (cfg) => /^base_[a-e]_bike_\d+$/.test(cfg.id) || cfg.fobFlagId != null
  );
  assert.equal(fobMotorpoolVehicles.length, 25, 'Expected 5 motorpool bikes/ATVs at each of FOBs A..E');

  for (const fobId of expectedFobIds) {
    const forFlag = fobMotorpoolVehicles.filter((cfg) => cfg.fobFlagId === fobId);
    assert.equal(forFlag.length, 5, `Expected 5 motorpool configs assigned to fobFlagId=${fobId}`);
    for (const cfg of forFlag) {
      assert.equal(cfg.team, 'NEUTRAL', `Expected ${cfg.id} to start with team='NEUTRAL'`);
      assert.ok(validFobSet.has(cfg.fobFlagId), `Invalid fobFlagId on ${cfg.id}: ${cfg.fobFlagId}`);
      assert.ok(cfg.type === 'bike' || cfg.type === 'atv', `Unexpected FOB motorpool type: ${cfg.type}`);
    }
  }

  // Main HQ motorpools remain faction-owned without a fobFlagId
  const usHqBikes = VEHICLE_DEFS.filter((cfg) => cfg.id.startsWith('base_us_hq_bike_'));
  const ruHqBikes = VEHICLE_DEFS.filter((cfg) => cfg.id.startsWith('base_ru_hq_bike_'));
  assert.equal(usHqBikes.length, 5);
  assert.equal(ruHqBikes.length, 5);
  assert.ok(usHqBikes.every((cfg) => cfg.team === 'US' && cfg.fobFlagId === null));
  assert.ok(ruHqBikes.every((cfg) => cfg.team === 'RU' && cfg.fobFlagId === null));
});

test('VehicleManager.refreshTeamVehicleLists & FOB IFF Sync: buckets NEUTRAL, US, and RU motorpool bikes/ATVs and emplacements accurately across flag ownership changes', () => {
  const { scene, world } = createConquestWorld();
  const vm = new VehicleManager(scene, world);
  const flagA = world.flags.find((fl) => fl.id === 'A');
  assert.ok(flagA);

  // Spawn an unoccupied non-warehouse FOB recon bike & ATV at FOB Alpha (boardable by AI/ground lists),
  // plus a FOB AA emplacement and a tactical ground vehicle assigned to FOB Alpha.
  const fobReconBike = vm.spawnVehicle({
    id: 'test_fob_a_recon_bike',
    name: 'FOB ALPHA RECON BIKE',
    fobFlagId: 'A',
    type: 'bike',
    isBike: true,
    isWarehouseBike: false,
    isEmplacement: false,
    team: 'NEUTRAL',
    spawnPos: new THREE.Vector3(flagA.pos.x + 6, 0, flagA.pos.z + 6),
    spawnYaw: 0,
    maxHp: 180,
    speed: 24,
    weaponType: 'hmg',
    rpm: 600,
    patrolPoints: [flagA.pos.clone()]
  });

  const fobReconAtv = vm.spawnVehicle({
    id: 'test_fob_a_recon_atv',
    name: 'FOB ALPHA TACTICAL ATV',
    fobFlagId: 'A',
    type: 'atv',
    isAtv: true,
    isWarehouseBike: false,
    isEmplacement: false,
    team: 'NEUTRAL',
    spawnPos: new THREE.Vector3(flagA.pos.x - 6, 0, flagA.pos.z + 6),
    spawnYaw: 0,
    maxHp: 240,
    speed: 22,
    weaponType: 'hmg',
    rpm: 600,
    patrolPoints: [flagA.pos.clone()]
  });

  const fobHumvee = vm.spawnVehicle({
    id: 'test_fob_a_humvee',
    name: 'FOB ALPHA GARRISON HUMVEE',
    fobFlagId: 'A',
    type: 'humvee',
    isWarehouseBike: false,
    isEmplacement: false,
    team: 'NEUTRAL',
    spawnPos: new THREE.Vector3(flagA.pos.x + 12, 0, flagA.pos.z - 8),
    spawnYaw: 0,
    maxHp: 450,
    speed: 20,
    weaponType: 'hmg',
    rpm: 650,
    patrolPoints: [flagA.pos.clone()]
  });

  // Spawn a FOB AA emplacement within 58m of FOB Alpha starting NEUTRAL
  const fobAaEmplacement = vm.spawnEmplacement(
    'emplace_aa',
    'NEUTRAL',
    new THREE.Vector3(flagA.pos.x + 10, 0, flagA.pos.z - 10),
    0
  );
  const defaultWarehouseFobBike = vm.vehicles.find((v) => v.id === 'base_a_bike_1');
  assert.ok(defaultWarehouseFobBike);

  // -------------------------------------------------------------------------
  // PHASE 1: FOB Alpha is NEUTRAL
  // -------------------------------------------------------------------------
  vm.refreshTeamVehicleLists();

  // 1a. NEUTRAL unoccupied non-emplacement FOB bikes/ATVs are boardable by BOTH US and RU
  assert.ok(vm.boardableGroundByTeam.US.includes(fobReconBike));
  assert.ok(vm.boardableGroundByTeam.RU.includes(fobReconBike));
  assert.ok(vm.boardableGroundByTeam.US.includes(fobReconAtv));
  assert.ok(vm.boardableGroundByTeam.RU.includes(fobReconAtv));

  // Emplacements (isEmplacement: true) are never placed into boardableGroundByTeam
  assert.ok(!vm.boardableGroundByTeam.US.includes(fobAaEmplacement));
  assert.ok(!vm.boardableGroundByTeam.RU.includes(fobAaEmplacement));

  // 1b. NEUTRAL vehicles & emplacements are NEVER in activeGroundTargetsByTeam.US or .RU
  for (const v of vm.vehicles) {
    if (v.team === 'NEUTRAL') {
      assert.ok(
        !vm.activeGroundTargetsByTeam.US.includes(v),
        `NEUTRAL vehicle ${v.id} must NEVER appear in activeGroundTargetsByTeam.US`
      );
      assert.ok(
        !vm.activeGroundTargetsByTeam.RU.includes(v),
        `NEUTRAL vehicle ${v.id} must NEVER appear in activeGroundTargetsByTeam.RU`
      );
    }
  }

  // 1c. Autonomous AA emplacement sentry does NOT fire at aircraft while NEUTRAL
  const ruAirTarget = vm.vehicles.find((v) => v.isAircraft && v.team === 'RU' && !v.b2LockedUntilKills);
  assert.ok(ruAirTarget);
  ruAirTarget.dead = false;
  ruAirTarget.aiPilotActive = true;
  ruAirTarget.pos.set(flagA.pos.x, 120, flagA.pos.z - 90);
  fobAaEmplacement.aiFireTimer = 0;
  fobAaEmplacement.turretYaw = Math.atan2(-(ruAirTarget.pos.x - fobAaEmplacement.pos.x), -(ruAirTarget.pos.z - fobAaEmplacement.pos.z));
  world.projectiles.length = 0;

  vm.update(0.05);
  assert.equal(fobAaEmplacement.team, 'NEUTRAL');
  assert.equal(world.projectiles.length, 0, 'NEUTRAL emplace_aa must not fire at aircraft');

  // -------------------------------------------------------------------------
  // PHASE 2: US captures FOB Alpha (NEUTRAL -> US)
  // -------------------------------------------------------------------------
  const farPlayer = makeFarPlayerStub();
  const usCapturers = Array.from({ length: 5 }, (_, i) =>
    makeSoldier('US', flagA.pos.x + i, flagA.pos.z)
  );
  world.updateFlags(1.5, [farPlayer, ...usCapturers]);
  assert.equal(flagA.owner, 'US');

  // Sync unoccupied FOB vehicles & emplacements to FOB Alpha's new owner ('US') and refresh lists
  fobAaEmplacement.aiFireTimer = 0;
  vm.update(0.05);
  vm.refreshTeamVehicleLists();

  assert.equal(fobReconBike.team, 'US');
  assert.equal(fobReconAtv.team, 'US');
  assert.equal(fobHumvee.team, 'US');
  assert.equal(fobAaEmplacement.team, 'US');
  assert.equal(defaultWarehouseFobBike.team, 'US');

  // Unoccupied US FOB bikes/ATVs are now boardable ONLY by US (not RU), and still not hostile ground targets while unoccupied
  assert.ok(vm.boardableGroundByTeam.US.includes(fobReconBike));
  assert.ok(!vm.boardableGroundByTeam.RU.includes(fobReconBike));
  assert.ok(!vm.activeGroundTargetsByTeam.RU.includes(fobReconBike));
  assert.ok(!vm.activeGroundTargetsByTeam.US.includes(fobReconBike));

  // Owned US non-bike/non-ATV vehicles & US emplacements ARE hostile ground targets for RU (never US)
  assert.ok(vm.activeGroundTargetsByTeam.RU.includes(fobHumvee));
  assert.ok(!vm.activeGroundTargetsByTeam.US.includes(fobHumvee));
  assert.ok(vm.activeGroundTargetsByTeam.RU.includes(fobAaEmplacement));
  assert.ok(!vm.activeGroundTargetsByTeam.US.includes(fobAaEmplacement));
  assert.ok(!vm.boardableGroundByTeam.US.includes(fobAaEmplacement));

  // US-owned emplace_aa autonomous sentry now engages airborne RU aircraft!
  assert.ok(
    world.projectiles.length > 0,
    'US-synced emplace_aa should engage enemy RU aircraft once FOB is captured by US'
  );

  // Occupying a US FOB bike moves it out of boardableGroundByTeam.US and into activeGroundTargetsByTeam.RU
  const usRider = makeSoldier('US', fobReconBike.pos.x, fobReconBike.pos.z);
  fobReconBike.driver = usRider;
  vm.refreshTeamVehicleLists();
  assert.ok(!vm.boardableGroundByTeam.US.includes(fobReconBike));
  assert.ok(!vm.boardableGroundByTeam.RU.includes(fobReconBike));
  assert.ok(vm.activeGroundTargetsByTeam.RU.includes(fobReconBike));
  assert.ok(!vm.activeGroundTargetsByTeam.US.includes(fobReconBike));

  // Dismounting restores unoccupied state
  fobReconBike.driver = null;

  // -------------------------------------------------------------------------
  // PHASE 3: RU neutralizes FOB Alpha across 0 (US -> NEUTRAL) and captures (NEUTRAL -> RU)
  // -------------------------------------------------------------------------
  const ruCapturers = Array.from({ length: 5 }, (_, i) =>
    makeSoldier('RU', flagA.pos.x - i, flagA.pos.z)
  );
  // +100 -> -12 (crosses 0 -> immediately NEUTRAL!)
  world.updateFlags(1.4, [farPlayer, ...ruCapturers]);
  assert.equal(flagA.owner, 'NEUTRAL');

  world.projectiles.length = 0;
  fobAaEmplacement.aiFireTimer = 0;
  vm.update(0.05);
  vm.refreshTeamVehicleLists();

  // Immediately back to NEUTRAL: boardable by BOTH teams, targeted by NEITHER team, sentry silent
  assert.equal(fobReconBike.team, 'NEUTRAL');
  assert.equal(fobAaEmplacement.team, 'NEUTRAL');
  assert.ok(vm.boardableGroundByTeam.US.includes(fobReconBike));
  assert.ok(vm.boardableGroundByTeam.RU.includes(fobReconBike));
  assert.ok(!vm.activeGroundTargetsByTeam.US.includes(fobHumvee));
  assert.ok(!vm.activeGroundTargetsByTeam.RU.includes(fobHumvee));
  assert.ok(!vm.activeGroundTargetsByTeam.US.includes(fobAaEmplacement));
  assert.ok(!vm.activeGroundTargetsByTeam.RU.includes(fobAaEmplacement));
  assert.equal(world.projectiles.length, 0);

  // Finish capture to -100 -> RU owns FOB Alpha
  world.updateFlags(1.2, [farPlayer, ...ruCapturers]);
  assert.equal(flagA.owner, 'RU');

  vm.update(0.05);
  vm.refreshTeamVehicleLists();

  assert.equal(fobReconBike.team, 'RU');
  assert.equal(fobReconAtv.team, 'RU');
  assert.equal(fobHumvee.team, 'RU');
  assert.equal(fobAaEmplacement.team, 'RU');
  assert.equal(defaultWarehouseFobBike.team, 'RU');

  // Unoccupied RU bike/ATV boardable ONLY by RU; owned RU humvee & emplace_aa targeted ONLY by US
  assert.ok(vm.boardableGroundByTeam.RU.includes(fobReconBike));
  assert.ok(!vm.boardableGroundByTeam.US.includes(fobReconBike));
  assert.ok(vm.activeGroundTargetsByTeam.US.includes(fobHumvee));
  assert.ok(!vm.activeGroundTargetsByTeam.RU.includes(fobHumvee));
  assert.ok(vm.activeGroundTargetsByTeam.US.includes(fobAaEmplacement));
  assert.ok(!vm.activeGroundTargetsByTeam.RU.includes(fobAaEmplacement));

  // Occupied RU ATV becomes an active ground target for US (and not boardable)
  fobReconAtv.npcDriver = makeSoldier('RU', fobReconAtv.pos.x, fobReconAtv.pos.z);
  vm.refreshTeamVehicleLists();
  assert.ok(!vm.boardableGroundByTeam.RU.includes(fobReconAtv));
  assert.ok(vm.activeGroundTargetsByTeam.US.includes(fobReconAtv));
  assert.ok(!vm.activeGroundTargetsByTeam.RU.includes(fobReconAtv));
  fobReconAtv.npcDriver = null;

  // Round reset returns all flags & unoccupied FOB assets cleanly to NEUTRAL
  world.resetFlagsForNewRound();
  vm.update(0.05);
  vm.refreshTeamVehicleLists();
  assert.equal(fobReconBike.team, 'NEUTRAL');
  assert.equal(fobReconAtv.team, 'NEUTRAL');
  assert.equal(fobHumvee.team, 'NEUTRAL');
  assert.equal(fobAaEmplacement.team, 'NEUTRAL');
  assert.ok(vm.boardableGroundByTeam.US.includes(fobReconBike));
  assert.ok(vm.boardableGroundByTeam.RU.includes(fobReconBike));
  assert.ok(!vm.activeGroundTargetsByTeam.US.includes(fobAaEmplacement));
  assert.ok(!vm.activeGroundTargetsByTeam.RU.includes(fobAaEmplacement));
});
