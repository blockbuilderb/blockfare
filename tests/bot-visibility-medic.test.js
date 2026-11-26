import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { BOT } from '../src/config.js?v=136';
import { sound } from '../src/audio.js?v=136';
import { BotManager } from '../src/bots/BotManager.js?v=136';
import { BotAIMethods } from '../src/bots/BotAI.js?v=136';
import { MedicAIMethods } from '../src/bots/MedicAI.js?v=136';
import {
  MEDIC_RESCUE_EVENTS,
  MEDIC_RESCUE_STATES,
  createMedicRescueFSM
} from '../src/core/StateMachines.js?v=136';

function createMockWorld(overrides = {}) {
  const voxels = new Map();
  const groundHeightFn = overrides.getGroundHeightAt || (() => 0);

  const flags = overrides.flags || [
    { id: 'A', owner: 'NEUTRAL', contested: false, captureProgress: 0, radius: 34, defenseStage: 0, pos: new THREE.Vector3(-600, 0, -120) },
    { id: 'B', owner: 'NEUTRAL', contested: false, captureProgress: 0, radius: 34, defenseStage: 0, pos: new THREE.Vector3(-300, 0, 100) },
    { id: 'C', owner: 'NEUTRAL', contested: false, captureProgress: 0, radius: 36, defenseStage: 0, pos: new THREE.Vector3(0, 0, 0) },
    { id: 'D', owner: 'NEUTRAL', contested: false, captureProgress: 0, radius: 34, defenseStage: 0, pos: new THREE.Vector3(300, 0, -100) },
    { id: 'E', owner: 'NEUTRAL', contested: false, captureProgress: 0, radius: 34, defenseStage: 0, pos: new THREE.Vector3(600, 0, 120) }
  ];

  return {
    era: overrides.era || 'modern',
    spawns: {
      US_BASE: new THREE.Vector3(-1520, 0, 0),
      RU_BASE: new THREE.Vector3(1520, 0, 0)
    },
    flags,
    voxels,
    ammoCrates: [],
    key(gx, gy, gz) {
      return `${gx},${gy},${gz}`;
    },
    hasVoxel(gx, gy, gz) {
      return voxels.has(`${gx},${gy},${gz}`);
    },
    worldToGrid(wx, wy, wz) {
      return {
        gx: Math.floor(wx / 1.25),
        gy: Math.floor(wy / 1.25),
        gz: Math.floor(wz / 1.25)
      };
    },
    getGroundHeightAt(x, z) {
      return groundHeightFn(x, z);
    },
    findSafeSpawnPoint(x, z) {
      return new THREE.Vector3(x, groundHeightFn(x, z), z);
    },
    pushOutOfBuildingFootprint(x, z) {
      return { x, z };
    },
    isInsideBuildingOrContainer() {
      return false;
    },
    raycastVoxel() {
      return null;
    },
    spawnDebris() {},
    damageVoxel() {},
    spawnEnemyLootPack() {},
    ...overrides
  };
}

function createMockPlayer({
  x = 0,
  y = 0,
  z = 0,
  pitchDeg = 0,
  yawDeg = 0,
  fov = 75,
  inAircraft = false,
  team = 'US',
  squad = 'ALPHA'
} = {}) {
  const camera = new THREE.PerspectiveCamera(fov, 16 / 9, 0.1, 18000);
  camera.rotation.order = 'YXZ';
  const pitchRad = THREE.MathUtils.degToRad(pitchDeg);
  const yawRad = THREE.MathUtils.degToRad(yawDeg);
  camera.position.set(x, y, z);
  camera.rotation.set(pitchRad, yawRad, 0);
  camera.updateMatrixWorld(true);

  return {
    name: 'TestPlayer',
    team,
    squad,
    role: 'pilot',
    hp: 100,
    dead: false,
    downed: false,
    bleeding: false,
    isFiring: false,
    pos: new THREE.Vector3(x, y, z),
    vel: new THREE.Vector3(),
    yaw: yawRad,
    pitch: pitchRad,
    camera,
    keys: {},
    activeVehicle: inAircraft
      ? {
          id: 'ac130_us_1',
          type: 'plane',
          aircraftRole: 'gunship',
          isAircraft: true,
          dead: false,
          pos: new THREE.Vector3(x, y, z)
        }
      : null,
    draggedBot: null,
    reviveTargetBot: null,
    takeDamage() {},
    applySuppression() {},
    reviveFromDowned() {}
  };
}

function spawnConfiguredBot(botMgr, { team = 'US', name = 'Bot', index = 0, role = null, x = 0, y = 0, z = 0 } = {}) {
  botMgr.spawnBot(team, name, index);
  const bot = botMgr.bots[botMgr.bots.length - 1];
  if (role) {
    bot.role = role;
    bot.fieldDressings = role === 'MEDIC' ? 9 : 2;
    bot.maxFieldDressings = bot.fieldDressings;
    bot.hasMedicBag = role === 'MEDIC';
    bot.medicBagSupply = role === 'MEDIC' ? 600 : 0;
    bot.maxMedicBagSupply = bot.medicBagSupply;
  }
  bot.pos.set(x, y, z);
  bot.mesh.position.copy(bot.pos);
  bot.lastProgressPos.copy(bot.pos);
  // Prevent unsolicited scan side effects unless explicitly tested
  bot._rescueScanTimer = 99;
  bot._healScanTimer = 99;
  bot._medicAuraTimer = 99;
  return bot;
}

function putBotDowned(bot, bleedOut = BOT.BLEEDOUT_TIMER) {
  bot.downed = true;
  bot.dead = false;
  bot.hp = 0;
  bot.bleedOutTimer = bleedOut;
  bot.mesh.rotation.x = -Math.PI / 2;
  return bot;
}

function setMedicRescueState(medic, casualty, state) {
  if (!medic.medicRescueFSM) {
    createMedicRescueFSM(medic);
  }
  if (medic.medicRescueFSM.state !== MEDIC_RESCUE_STATES.IDLE) {
    medic.medicRescueFSM.send(MEDIC_RESCUE_EVENTS.ABORT_RESCUE);
  }
  assert.equal(medic.medicRescueFSM.send(MEDIC_RESCUE_EVENTS.CLAIM_CASUALTY, { target: casualty }), true);
  medic.assessedLogged = true;
  medic.assessTimer = 1.45;
  if (state === MEDIC_RESCUE_STATES.ASSESS_THREAT) {
    return;
  }
  assert.equal(medic.medicRescueFSM.send(MEDIC_RESCUE_EVENTS.SECTOR_CLEAR_APPROACH), true);
  if (state === MEDIC_RESCUE_STATES.APPROACH) {
    return;
  }
  assert.equal(medic.medicRescueFSM.send(MEDIC_RESCUE_EVENTS.REACHED_CASUALTY_DRAG), true);
  medic.rescueTimer = 2.2;
  medic.dragGoalPos.set(medic.pos.x, medic.pos.y, medic.pos.z + 8);
  if (state === MEDIC_RESCUE_STATES.DRAG) {
    return;
  }
  assert.equal(medic.medicRescueFSM.send(MEDIC_RESCUE_EVENTS.REACHED_COVER_REVIVE), true);
  medic.rescueTimer = BOT.MEDIC_REVIVE_TIME;
}

// ============================================================================
// 1. Bot 3D Render Distance & Steep-Angle Frustum Visibility (BotAIMethods.update)
// ============================================================================

test('BotAIMethods.update: AC-130 at y=600m looking down -80° with zoomed FOV=13° keeps bots at 350m–2,500m slant range visible and un-culled (including downed & APPROACH/DRAG/REVIVE Medics)', () => {
  const scene = new THREE.Scene();
  // Provide an elevated 265m ridge near z=-95 so a ground soldier sits at ~350m slant range from y=600m
  const world = createMockWorld({
    getGroundHeightAt(x, z) {
      if (Math.abs(x) < 30 && z > -130 && z < -60) return 265;
      return 0;
    }
  });
  const botMgr = new BotManager(scene, world);
  assert.equal(botMgr.update, BotAIMethods.update);

  const player = createMockPlayer({
    x: 0,
    y: 600,
    z: 0,
    pitchDeg: -80,
    yawDeg: 0,
    fov: 13,
    inAircraft: true
  });

  // 1) ~350m slant range on elevated ridge (dy ≈ -334m, dz = -95m -> slant ≈ 347m)
  const active350 = spawnConfiguredBot(botMgr, { team: 'RU', name: 'Active350', index: 0, role: 'ASSAULT', x: 0, y: 265, z: -95 });

  // 2) ~605m slant range at +Z behind aircraft nose in 2D XZ, but directly inside the -80° downward 3D view cone!
  //    (Proves 2D XZ frustum math never falsely culls ground units slightly behind aircraft horizontal nose)
  const downedNadirPlusZ = putBotDowned(
    spawnConfiguredBot(botMgr, { team: 'US', name: 'DownedPlusZ605', index: 1, role: 'ASSAULT', x: 0, y: 0, z: 80 })
  );

  // 3) ~950m slant range: Medic in APPROACH + downed casualty (dz = -735m, y = 0 -> slant ≈ 949m)
  const casualtyApproach = putBotDowned(
    spawnConfiguredBot(botMgr, { team: 'US', name: 'CasApproach950', index: 2, role: 'SUPPORT', x: -18, y: 0, z: -745 })
  );
  const medicApproach = spawnConfiguredBot(botMgr, { team: 'US', name: 'MedicApproach950', index: 3, role: 'MEDIC', x: -18, y: 0, z: -730 });
  setMedicRescueState(medicApproach, casualtyApproach, MEDIC_RESCUE_STATES.APPROACH);

  // 4) ~1,650m slant range: Medic in DRAG + downed casualty (dz = -1535m, y = 0 -> slant ≈ 1648m)
  const casualtyDrag = putBotDowned(
    spawnConfiguredBot(botMgr, { team: 'US', name: 'CasDrag1650', index: 4, role: 'ENGINEER', x: 25, y: 0, z: -1535 })
  );
  const medicDrag = spawnConfiguredBot(botMgr, { team: 'US', name: 'MedicDrag1650', index: 5, role: 'MEDIC', x: 25, y: 0, z: -1534 });
  setMedicRescueState(medicDrag, casualtyDrag, MEDIC_RESCUE_STATES.DRAG);

  // 5) ~2,500m slant range: Medic in REVIVE + downed casualty + active infantry (dz = -2425m, y = 0 -> slant ≈ 2498m)
  const casualtyRevive = putBotDowned(
    spawnConfiguredBot(botMgr, { team: 'US', name: 'CasRevive2500', index: 6, role: 'ASSAULT', x: -40, y: 0, z: -2425 })
  );
  const medicRevive = spawnConfiguredBot(botMgr, { team: 'US', name: 'MedicRevive2500', index: 7, role: 'MEDIC', x: -40, y: 0, z: -2424 });
  setMedicRescueState(medicRevive, casualtyRevive, MEDIC_RESCUE_STATES.REVIVE);
  const active2500 = spawnConfiguredBot(botMgr, { team: 'RU', name: 'Active2500', index: 8, role: 'SUPPORT', x: 35, y: 0, z: -2425 });

  const trackedBots = [
    active350,
    downedNadirPlusZ,
    casualtyApproach,
    medicApproach,
    casualtyDrag,
    medicDrag,
    casualtyRevive,
    medicRevive,
    active2500
  ];

  // Pre-poison visibility & frustum flags to prove update() un-culls BEFORE early `continue` branches
  for (const b of trackedBots) {
    const slant = b.pos.distanceTo(player.camera.position);
    assert.ok(slant >= 340 && slant <= 2510, `Expected ${b.name} slant=${slant.toFixed(1)}m within 350m–2,500m band`);
    b.mesh.visible = false;
    b.mesh._culledOffFrustum = true;
  }

  botMgr.update(0.016, player);

  // Confirm rescue states were still active (early-continue branches ran) AND visibility was restored
  assert.equal(downedNadirPlusZ.downed, true);
  assert.equal(medicApproach.rescueState, MEDIC_RESCUE_STATES.APPROACH);
  assert.equal(medicDrag.rescueState, MEDIC_RESCUE_STATES.DRAG);
  assert.equal(medicRevive.rescueState, MEDIC_RESCUE_STATES.REVIVE);

  for (const b of trackedBots) {
    assert.equal(b.mesh.visible, true, `${b.name} must have mesh.visible === true`);
    assert.equal(b.mesh._culledOffFrustum, false, `${b.name} must have mesh._culledOffFrustum === false`);
  }
});

test('BotAIMethods.update: High-altitude AC-130 at y=1500m looking down -80° with FOV=13° keeps active, downed, and rescuing bots visible up to 2,500m slant range', () => {
  const scene = new THREE.Scene();
  const world = createMockWorld();
  const botMgr = new BotManager(scene, world);

  const player = createMockPlayer({
    x: 0,
    y: 1500,
    z: 0,
    pitchDeg: -80,
    yawDeg: 0,
    fov: 13,
    inAircraft: true
  });

  // Slant ranges from (0, 1500, 0):
  // - z = +140 -> slant ≈ 1506m (slightly +Z of nose, well inside -80° downward cone)
  // - z = -1150 -> slant ≈ 1890m
  // - z = -1995 -> slant ≈ 2496m
  const downed1506 = putBotDowned(
    spawnConfiguredBot(botMgr, { team: 'US', name: 'Downed1506', index: 0, role: 'ASSAULT', x: 0, y: 0, z: 140 })
  );
  const cas1890 = putBotDowned(
    spawnConfiguredBot(botMgr, { team: 'US', name: 'Cas1890', index: 1, role: 'SUPPORT', x: 20, y: 0, z: -1150 })
  );
  const medicDrag1890 = spawnConfiguredBot(botMgr, { team: 'US', name: 'MedicDrag1890', index: 2, role: 'MEDIC', x: 20, y: 0, z: -1149 });
  setMedicRescueState(medicDrag1890, cas1890, MEDIC_RESCUE_STATES.DRAG);

  const cas2500 = putBotDowned(
    spawnConfiguredBot(botMgr, { team: 'US', name: 'Cas2500', index: 3, role: 'ENGINEER', x: -30, y: 0, z: -1995 })
  );
  const medicRevive2500 = spawnConfiguredBot(botMgr, { team: 'US', name: 'MedicRevive2500', index: 4, role: 'MEDIC', x: -30, y: 0, z: -1994 });
  setMedicRescueState(medicRevive2500, cas2500, MEDIC_RESCUE_STATES.REVIVE);
  const active2500 = spawnConfiguredBot(botMgr, { team: 'RU', name: 'Active2500', index: 5, role: 'ASSAULT', x: 40, y: 0, z: -1995 });

  const bots = [downed1506, cas1890, medicDrag1890, cas2500, medicRevive2500, active2500];
  for (const b of bots) {
    b.mesh.visible = false;
    b.mesh._culledOffFrustum = true;
  }

  botMgr.update(0.016, player);

  for (const b of bots) {
    assert.equal(b.mesh.visible, true, `${b.name} should be visible from y=1500m gunship`);
    assert.equal(b.mesh._culledOffFrustum, false, `${b.name} should not be frustum-culled from y=1500m gunship`);
  }
});

test('BotAIMethods.update: culls bots genuinely behind 3D camera (dot3D < -0.35, >25m behind) and immediately un-culls when camera turns toward them (even while downed or rescuing)', () => {
  const scene = new THREE.Scene();
  const world = createMockWorld();
  const botMgr = new BotManager(scene, world);

  // Camera at (0, 2, 0) facing -Z (yaw = 0°, pitch = 0°) -> +Z is directly behind the 3D camera
  const player = createMockPlayer({
    x: 0,
    y: 2,
    z: 0,
    pitchDeg: 0,
    yawDeg: 0,
    fov: 75,
    inAircraft: false
  });

  // Close behind (<22m) should stay un-culled; >25m with dot3D < -0.35 must cull
  const closeBehind = spawnConfiguredBot(botMgr, { team: 'US', name: 'CloseBehind14m', index: 0, role: 'ASSAULT', x: 0, y: 0, z: 14 });
  const activeBehind = spawnConfiguredBot(botMgr, { team: 'RU', name: 'ActiveBehind65m', index: 1, role: 'ASSAULT', x: 0, y: 0, z: 65 });
  // Oblique behind: dist = hypot(40, 30) = 50m > 25m, dot3D = -30 / 50 = -0.60 < -0.35
  const obliqueBehind = spawnConfiguredBot(botMgr, { team: 'RU', name: 'ObliqueBehind50m', index: 2, role: 'SUPPORT', x: 40, y: 0, z: 30 });

  const downedSoloBehind = putBotDowned(
    spawnConfiguredBot(botMgr, { team: 'US', name: 'DownedBehind70m', index: 3, role: 'ASSAULT', x: -15, y: 0, z: 70 })
  );

  const casApproachBehind = putBotDowned(
    spawnConfiguredBot(botMgr, { team: 'US', name: 'CasApproachBehind', index: 4, role: 'SUPPORT', x: 18, y: 0, z: 95 })
  );
  const medicApproachBehind = spawnConfiguredBot(botMgr, { team: 'US', name: 'MedicApproachBehind', index: 5, role: 'MEDIC', x: 18, y: 0, z: 82 });
  setMedicRescueState(medicApproachBehind, casApproachBehind, MEDIC_RESCUE_STATES.APPROACH);

  const casDragBehind = putBotDowned(
    spawnConfiguredBot(botMgr, { team: 'US', name: 'CasDragBehind', index: 6, role: 'ENGINEER', x: -28, y: 0, z: 105 })
  );
  const medicDragBehind = spawnConfiguredBot(botMgr, { team: 'US', name: 'MedicDragBehind', index: 7, role: 'MEDIC', x: -28, y: 0, z: 104 });
  setMedicRescueState(medicDragBehind, casDragBehind, MEDIC_RESCUE_STATES.DRAG);

  const casReviveBehind = putBotDowned(
    spawnConfiguredBot(botMgr, { team: 'US', name: 'CasReviveBehind', index: 8, role: 'ASSAULT', x: 32, y: 0, z: 120 })
  );
  const medicReviveBehind = spawnConfiguredBot(botMgr, { team: 'US', name: 'MedicReviveBehind', index: 9, role: 'MEDIC', x: 32, y: 0, z: 119 });
  setMedicRescueState(medicReviveBehind, casReviveBehind, MEDIC_RESCUE_STATES.REVIVE);

  const behindBots = [
    activeBehind,
    obliqueBehind,
    downedSoloBehind,
    casApproachBehind,
    medicApproachBehind,
    casDragBehind,
    medicDragBehind,
    casReviveBehind,
    medicReviveBehind
  ];

  // Frame 1: camera facing -Z -> all >25m +Z bots have dot3D < -0.35 and must be frustum-culled
  botMgr.update(0.016, player);

  assert.equal(closeBehind.mesh._culledOffFrustum, false, 'Close (<22m) behind bot stays un-culled');
  for (const b of behindBots) {
    assert.equal(b.mesh._culledOffFrustum, true, `${b.name} (>25m behind, dot3D < -0.35) must be culled`);
  }

  // Frame 2: turn 3D camera 180° toward +Z -> all bots must un-cull immediately on the very next update!
  player.yaw = Math.PI;
  player.camera.rotation.set(0, Math.PI, 0);
  player.camera.updateMatrixWorld(true);

  botMgr.update(0.016, player);

  assert.equal(downedSoloBehind.downed, true);
  assert.equal(medicApproachBehind.rescueState, MEDIC_RESCUE_STATES.APPROACH);
  assert.equal(medicDragBehind.rescueState, MEDIC_RESCUE_STATES.DRAG);
  assert.equal(medicReviveBehind.rescueState, MEDIC_RESCUE_STATES.REVIVE);

  for (const b of behindBots) {
    assert.equal(b.mesh.visible, true, `${b.name} must be visible when camera turns toward it`);
    assert.equal(b.mesh._culledOffFrustum, false, `${b.name} must un-cull immediately when camera turns toward it`);
  }
});

// ============================================================================
// 2. Medic Rescue & Casualty Invariants (MedicAIMethods)
// ============================================================================

test('MedicAIMethods & BotAIMethods.update: downed bleedout timer pauses across ASSESS_THREAT, APPROACH, DRAG, and REVIVE, and resumes without a valid rescuer', () => {
  const scene = new THREE.Scene();
  const world = createMockWorld();
  const botMgr = new BotManager(scene, world);
  assert.equal(botMgr.updateMedicRescue, MedicAIMethods.updateMedicRescue);

  const player = createMockPlayer({ x: 0, y: 2, z: -20 });
  const casualty = putBotDowned(
    spawnConfiguredBot(botMgr, { team: 'US', name: 'WoundedAlly', index: 0, role: 'ASSAULT', x: 0, y: 0, z: -50 }),
    60.0
  );
  const medic = spawnConfiguredBot(botMgr, { team: 'US', name: 'FieldMedic', index: 1, role: 'MEDIC', x: 0, y: 0, z: -30 });
  medic.fieldDressings = 0; // Prevent autonomous scan during unrescued baseline step

  // 1) No rescuer -> bleedOutTimer ticks down by dt
  botMgr.update(0.5, player);
  assert.ok(Math.abs(casualty.bleedOutTimer - 59.5) < 1e-6, 'Unrescued casualty bleeds out normally');

  medic.fieldDressings = 9;

  // 2) ASSESS_THREAT -> bleedOutTimer paused
  // Place an enemy within point-blank threat range (<12m) so medic stays in ASSESS_THREAT across update()
  const threatBot = spawnConfiguredBot(botMgr, { team: 'RU', name: 'EnemyGuard', index: 2, role: 'ASSAULT', x: 6, y: 0, z: -48 });
  threatBot.shootCooldown = 99;
  medic.shootCooldown = 99;
  medic.pos.set(0, 0, -45);
  setMedicRescueState(medic, casualty, MEDIC_RESCUE_STATES.ASSESS_THREAT);
  medic.assessTimer = 2.0;
  assert.equal(casualty.rescuer, medic);
  assert.equal(medic.rescueState, MEDIC_RESCUE_STATES.ASSESS_THREAT);
  botMgr.update(0.5, player);
  assert.equal(medic.rescueState, MEDIC_RESCUE_STATES.ASSESS_THREAT, 'Medic remains in ASSESS_THREAT while suppressing close threat');
  assert.equal(casualty.bleedOutTimer, 59.5, 'Bleedout must pause while Medic is in ASSESS_THREAT');

  // Remove enemy threat for clean APPROACH / DRAG / REVIVE steps
  threatBot.dead = true;
  threatBot.respawnTimer = 99;

  // 3) APPROACH -> bleedOutTimer paused
  medic.pos.set(0, 0, -30);
  setMedicRescueState(medic, casualty, MEDIC_RESCUE_STATES.APPROACH);
  botMgr.update(0.5, player);
  assert.equal(medic.rescueState, MEDIC_RESCUE_STATES.APPROACH);
  assert.equal(casualty.bleedOutTimer, 59.5, 'Bleedout must pause while Medic is in APPROACH');

  // 4) DRAG -> bleedOutTimer paused
  medic.pos.set(0, 0, -49.5);
  setMedicRescueState(medic, casualty, MEDIC_RESCUE_STATES.DRAG);
  medic.dragGoalPos.set(0, 0, -40);
  medic.rescueTimer = 2.0;
  botMgr.update(0.25, player);
  assert.equal(medic.rescueState, MEDIC_RESCUE_STATES.DRAG);
  assert.equal(casualty.bleedOutTimer, 59.5, 'Bleedout must pause while Medic is in DRAG');

  // 5) REVIVE -> bleedOutTimer paused
  setMedicRescueState(medic, casualty, MEDIC_RESCUE_STATES.REVIVE);
  medic.rescueTimer = 1.5;
  botMgr.update(0.25, player);
  assert.equal(medic.rescueState, MEDIC_RESCUE_STATES.REVIVE);
  assert.equal(casualty.bleedOutTimer, 59.5, 'Bleedout must pause while Medic is in REVIVE');

  // 6) Rescuer incapacitated (downed/dead) -> bleedOutTimer resumes ticking down
  medic.dead = true;
  medic.respawnTimer = 99;
  botMgr.update(0.5, player);
  assert.ok(Math.abs(casualty.bleedOutTimer - 59.0) < 1e-6, 'Bleedout resumes if rescuer dies');
});

test('MedicAIMethods.updateMedicRescue: DRAG moves rescueTarget.pos along behind the Medic and syncs rescueTarget.mesh.visible & frustum flag', () => {
  const scene = new THREE.Scene();
  const world = createMockWorld();
  const botMgr = new BotManager(scene, world);
  const player = createMockPlayer({ x: 0, y: 2, z: 0 });

  const casualty = putBotDowned(
    spawnConfiguredBot(botMgr, { team: 'US', name: 'DraggedCasualty', index: 0, role: 'ASSAULT', x: 20, y: 0, z: 49 })
  );
  const medic = spawnConfiguredBot(botMgr, { team: 'US', name: 'DraggingMedic', index: 1, role: 'MEDIC', x: 20, y: 0, z: 50 });

  setMedicRescueState(medic, casualty, MEDIC_RESCUE_STATES.DRAG);
  // Drag goal is +Z (20, 0, 62), so toSafe = (0, 0, +1)
  medic.dragGoalPos.set(20, 0, 62);
  medic.rescueTimer = 2.4;

  // Medic is visible & in-frustum; casualty starts hidden/culled to verify DRAG visibility sync
  medic.mesh.visible = true;
  medic.mesh._culledOffFrustum = false;
  casualty.mesh.visible = false;
  casualty.mesh._culledOffFrustum = true;

  const dt = 0.25;
  const handled1 = botMgr.updateMedicRescue(medic, dt, player);
  assert.equal(handled1, true);
  assert.equal(medic.rescueState, MEDIC_RESCUE_STATES.DRAG);

  const expectedMedicZ1 = 50 + BOT.DRAG_SPEED * dt;
  const expectedCasualtyZ1 = expectedMedicZ1 - 1.05;
  assert.ok(Math.abs(medic.pos.z - expectedMedicZ1) < 1e-5, 'Medic steps toward safe drag goal');
  assert.ok(Math.abs(casualty.pos.x - 20) < 1e-5, 'Casualty X stays aligned with drag path');
  assert.ok(Math.abs(casualty.pos.z - expectedCasualtyZ1) < 1e-5, 'Casualty trails 1.05m behind Medic movement vector');
  assert.ok(Math.abs(casualty.pos.y - 0.22) < 1e-5, 'Casualty Y stays at ground + 0.22m');
  assert.equal(casualty.mesh.visible, true, 'DRAG must sync rescueTarget.mesh.visible = true when Medic is visible');
  assert.equal(casualty.mesh._culledOffFrustum, false, 'DRAG must sync rescueTarget.mesh._culledOffFrustum with Medic');

  // Advance a second tick to confirm continuous dragging motion
  botMgr.updateMedicRescue(medic, dt, player);
  const expectedMedicZ2 = expectedMedicZ1 + BOT.DRAG_SPEED * dt;
  assert.ok(Math.abs(casualty.pos.z - (expectedMedicZ2 - 1.05)) < 1e-5, 'Casualty continues moving behind Medic on subsequent ticks');
});

test('MedicAIMethods: REVIVE pauses (rescueTimer >= 1.15) while underFireTimer > 0, and reviveBot enforces postReviveTimer > 0 + weaponReadyTimer > 0 (no snap-fire) + single-rescuer cleanup via clearBotRescueLinks', (t) => {
  const origSoundInit = sound.init;
  sound.init = () => {};
  t.after(() => {
    sound.init = origSoundInit;
  });

  const scene = new THREE.Scene();
  const world = createMockWorld();
  const botMgr = new BotManager(scene, world);
  const player = createMockPlayer({ x: -100, y: 2, z: 0 });

  const casualty = putBotDowned(
    spawnConfiguredBot(botMgr, { team: 'US', name: 'DownedSoldier', index: 0, role: 'ASSAULT', x: 0, y: 0, z: 0 }),
    45.0
  );
  const nonMedicRescuer = spawnConfiguredBot(botMgr, { team: 'US', name: 'RiflemanHelper', index: 1, role: 'ASSAULT', x: 3, y: 0, z: 0 });
  const medic1 = spawnConfiguredBot(botMgr, { team: 'US', name: 'PrimaryMedic', index: 2, role: 'MEDIC', x: 1, y: 0, z: 0 });
  const medic2 = spawnConfiguredBot(botMgr, { team: 'US', name: 'SecondaryMedic', index: 3, role: 'MEDIC', x: 2, y: 0, z: 0 });

  // Single-rescuer invariant check #1: non-medic claims casualty in ASSESS_THREAT, then Medic takes over cleanly
  setMedicRescueState(nonMedicRescuer, casualty, MEDIC_RESCUE_STATES.ASSESS_THREAT);
  assert.equal(casualty.rescuer, nonMedicRescuer);

  setMedicRescueState(medic1, casualty, MEDIC_RESCUE_STATES.REVIVE);
  assert.equal(casualty.rescuer, medic1, 'Casualty points exclusively to taking-over Medic');
  assert.equal(nonMedicRescuer.rescueTarget, null, 'Previous rescuer target cleared on takeover');
  assert.equal(nonMedicRescuer.rescueState, null, 'Previous rescuer state cleared on takeover');
  assert.equal(nonMedicRescuer.medicRescueFSM.state, MEDIC_RESCUE_STATES.IDLE);

  // Single-rescuer invariant check #2: second Medic scanning will NOT double-claim casualty already rescued by medic1
  medic2._rescueScanTimer = 0;
  botMgr.downedByTeam.US = [casualty];
  botMgr.updateMedicRescue(medic2, 0.1, player);
  assert.equal(medic2.rescueTarget, null, 'Second Medic must not claim a casualty already claimed by another Medic');
  assert.equal(casualty.rescuer, medic1);

  // Under-fire pause check: while medic1.underFireTimer > 0 (or casualty.underFireTimer > 0), rescueTimer stays >= 1.15
  medic1.rescueTimer = 0.3;
  medic1.underFireTimer = 1.4;
  botMgr.updateMedicRescue(medic1, 0.5, player);
  assert.ok(medic1.rescueTimer >= 1.15, `Expected rescueTimer >= 1.15 while Medic under fire, got ${medic1.rescueTimer}`);
  assert.equal(medic1.isCrouching, true);
  assert.equal(casualty.downed, true, 'Casualty must not be revived while rescuer is under fire');

  medic1.underFireTimer = 0;
  medic1.rescueTimer = 0.4;
  casualty.underFireTimer = 1.2;
  botMgr.updateMedicRescue(medic1, 0.5, player);
  assert.ok(medic1.rescueTimer >= 1.15, `Expected rescueTimer >= 1.15 while casualty under fire, got ${medic1.rescueTimer}`);
  assert.equal(casualty.downed, true, 'Casualty must not be revived while casualty is under fire');

  casualty.underFireTimer = 0;

  // Test reviveBot directly: verifies link cleanup via clearBotRescueLinks + postReviveTimer > 0 + weaponReadyTimer > 0
  const revived = botMgr.reviveBot(casualty, false);
  assert.equal(revived, true);

  // Single-rescuer link cleanup assertions on both casualty and medic1
  assert.equal(casualty.rescuer, null, 'reviveBot must clear casualty.rescuer via clearBotRescueLinks');
  assert.equal(medic1.rescueTarget, null, 'clearBotRescueLinks must clear rescuer.rescueTarget');
  assert.equal(medic1.rescueState, null, 'clearBotRescueLinks must clear rescuer.rescueState');
  assert.equal(medic1.medicRescueFSM.state, MEDIC_RESCUE_STATES.IDLE);
  assert.ok(medic1.weaponReadyTimer >= 1.45, 'Rescuer leaving REVIVE must stow medical kit before firing');
  assert.equal(medic1.transitionState, 'EQUIPPING_WEAPON');

  // Revived soldier physical state assertions
  assert.equal(casualty.downed, false);
  assert.equal(casualty.dead, false);
  assert.equal(casualty.hp, BOT.REVIVE_HP);
  assert.equal(casualty.postReviveTimer, BOT.POST_REVIVE_TIMER);
  assert.ok(casualty.postReviveTimer > 0, 'postReviveTimer must be > 0');
  assert.equal(casualty.weaponReadyTimer, BOT.POST_REVIVE_WEAPON_READY);
  assert.ok(casualty.weaponReadyTimer > 0, 'weaponReadyTimer must be > 0');
  assert.equal(casualty.aimRaiseProgress, 0);
  assert.ok(casualty.shootCooldown >= 1.95);
  assert.equal(casualty.transitionState, 'GETTING_UP');
  assert.equal(casualty.mesh.rotation.x, -Math.PI / 2);

  // Place an exposed enemy 12m directly in front of the revived soldier and force shootCooldown=0:
  // BotAIMethods.update MUST block snap-firing while postReviveTimer > 0 / weaponReadyTimer > 0!
  const enemy = spawnConfiguredBot(botMgr, { team: 'RU', name: 'CloseEnemy', index: 4, role: 'ASSAULT', x: 0, y: 0, z: 12 });
  enemy.shootCooldown = 99;
  casualty.yaw = 0; // facing +Z directly toward (0, 0, 12)
  casualty.shootCooldown = 0;
  casualty._targetScanTimer = 0;

  botMgr.update(0.05, player);
  assert.equal(casualty.shotsFired, 0, 'Revived bot must NOT snap-fire during post-revive recovery');
  assert.equal(botMgr.botBullets?.length || 0, 0, 'Zero bullets fired while getting up & readying weapon');
  assert.ok(casualty.postReviveTimer > 0);
  assert.ok(casualty.weaponReadyTimer > 0);
  assert.equal(casualty.transitionState, 'GETTING_UP');

  // Positive control: once postReviveTimer & weaponReadyTimer finish and weapon raises to shoulder, bot CAN fire
  casualty.postReviveTimer = 0;
  casualty.weaponReadyTimer = 0;
  casualty.aimRaiseProgress = 1.0;
  casualty.shootCooldown = 0;
  botMgr.update(0.05, player);
  assert.ok(casualty.shotsFired >= 1, 'Soldier fires normally once recovery & weapon-ready transitions finish');

  // Direct clearBotRescueLinks(rescuer) check from DRAG state
  putBotDowned(casualty, 50);
  setMedicRescueState(medic1, casualty, MEDIC_RESCUE_STATES.DRAG);
  medic1.weaponReadyTimer = 0;
  botMgr.clearBotRescueLinks(medic1);
  assert.equal(casualty.rescuer, null);
  assert.equal(medic1.rescueTarget, null);
  assert.equal(medic1.rescueState, null);
  assert.equal(medic1.medicRescueFSM.state, MEDIC_RESCUE_STATES.IDLE);
  assert.ok(medic1.weaponReadyTimer >= 1.45);
});

// ============================================================================
// 3. Army Size Scaling & Vanguard Staging (BotManager)
// ============================================================================

test('BotManager.pickSpawnPosition: stages opening-round foot squads (ALPHA, CHARLIE, DELTA, ECHO) at ±820m when 0 flags are owned while keeping BRAVO & FALCON at HQ', () => {
  const scene = new THREE.Scene();
  const world = createMockWorld();
  const botMgr = new BotManager(scene, world);

  const vanguardSquads = ['ALPHA', 'CHARLIE', 'DELTA', 'ECHO'];
  const hqVehicleSquads = ['BRAVO', 'FALCON'];

  // Opening round: 0 flags owned (all NEUTRAL)
  for (const sq of vanguardSquads) {
    for (let sample = 0; sample < 8; sample++) {
      const usSpawn = botMgr.pickSpawnPosition('US', sq, true);
      assert.equal(usSpawn.source, 'FORWARD_STAGING_LINE', `US ${sq} should stage forward when 0 flags owned`);
      assert.ok(
        usSpawn.pos.x >= -838 && usSpawn.pos.x <= -802,
        `US ${sq} x=${usSpawn.pos.x.toFixed(1)} must be at -820m ± 18m staging line`
      );

      const ruSpawn = botMgr.pickSpawnPosition('RU', sq, true);
      assert.equal(ruSpawn.source, 'FORWARD_STAGING_LINE', `RU ${sq} should stage forward when 0 flags owned`);
      assert.ok(
        ruSpawn.pos.x >= 802 && ruSpawn.pos.x <= 838,
        `RU ${sq} x=${ruSpawn.pos.x.toFixed(1)} must be at +820m ± 18m staging line`
      );

      if (sq === 'ALPHA') {
        assert.ok(Math.abs(usSpawn.pos.z) <= 22 && Math.abs(ruSpawn.pos.z) <= 22);
      } else if (sq === 'CHARLIE') {
        assert.ok(usSpawn.pos.z >= -232 && usSpawn.pos.z <= -188);
      } else if (sq === 'DELTA') {
        assert.ok(usSpawn.pos.z >= 188 && usSpawn.pos.z <= 232);
      } else if (sq === 'ECHO') {
        assert.ok(Math.abs(usSpawn.pos.z) <= 182);
      }
    }
  }

  for (const sq of hqVehicleSquads) {
    for (let sample = 0; sample < 8; sample++) {
      const usHq = botMgr.pickSpawnPosition('US', sq, true);
      assert.equal(usHq.source, 'MAIN_BASE', `US ${sq} must spawn at HQ Motor Pool / Airfield`);
      // US_BASE.x (-1520) + 28 ± 9 => [-1501, -1483]
      assert.ok(
        usHq.pos.x >= -1501 && usHq.pos.x <= -1483,
        `US ${sq} x=${usHq.pos.x.toFixed(1)} must stay at US HQ (-1492m ± 9m)`
      );

      const ruHq = botMgr.pickSpawnPosition('RU', sq, true);
      assert.equal(ruHq.source, 'MAIN_BASE', `RU ${sq} must spawn at HQ Motor Pool / Airfield`);
      // RU_BASE.x (+1520) - 28 ± 9 => [1483, 1501]
      assert.ok(
        ruHq.pos.x >= 1483 && ruHq.pos.x <= 1501,
        `RU ${sq} x=${ruHq.pos.x.toFixed(1)} must stay at RU HQ (+1492m ± 9m)`
      );
    }
  }

  // Once at least 1 flag is owned, opening-round ±820m vanguard staging is disabled
  world.flags[0].owner = 'US';
  for (const sq of vanguardSquads) {
    const usAfterCapture = botMgr.pickSpawnPosition('US', sq, true);
    const ruAfterCapture = botMgr.pickSpawnPosition('RU', sq, true);
    assert.notEqual(usAfterCapture.source, 'FORWARD_STAGING_LINE');
    assert.equal(ruAfterCapture.source, 'MAIN_BASE');
  }
});

test('BotManager.setBotCountPerSide: clamps army size [25, 250] per side (up to 500 combatants), supports 1 Player + 499 AI balance, and cleans up meshes/vehicle links', () => {
  const scene = new THREE.Scene();
  const world = createMockWorld();
  const botMgr = new BotManager(scene, world);

  // Lower-bound clamp (<25 -> 25 per side = 50 total)
  botMgr.setBotCountPerSide(10);
  assert.equal(botMgr.currentBotsPerTeam, 25);
  assert.equal(botMgr.bots.length, 50);

  for (const b of botMgr.bots) {
    if (b.squad === 'BRAVO' || b.squad === 'FALCON') {
      assert.equal(b.lastSpawnSource, 'MAIN_BASE');
      assert.ok(Math.abs(b.pos.x) > 1450);
    } else {
      assert.equal(b.lastSpawnSource, 'FORWARD_STAGING_LINE');
      assert.ok(Math.abs(b.pos.x) >= 802 && Math.abs(b.pos.x) <= 838);
    }
  }

  // Verify cleanup of scene meshes and vehicle driver links on rescale
  const firstBot = botMgr.bots[0];
  const mockVehicle = { driver: firstBot, npcDriver: firstBot };
  firstBot.drivingVehicle = mockVehicle;
  assert.equal(firstBot.mesh.parent, scene);

  botMgr.setBotCountPerSide(36);
  assert.equal(botMgr.currentBotsPerTeam, 36);
  assert.equal(botMgr.bots.length, 72);
  assert.equal(firstBot.mesh.parent, null, 'Previous bot meshes must be removed from scene on resize');
  assert.equal(mockVehicle.driver, null, 'Previous bot vehicle driver link must be cleared');
  assert.equal(mockVehicle.npcDriver, null, 'Previous bot vehicle npcDriver link must be cleared');

  // Calling again with identical count is a clean no-op
  const currentRef = botMgr.bots[0];
  botMgr.setBotCountPerSide(36);
  assert.equal(botMgr.bots[0], currentRef);

  // Upper-bound clamp (>250 -> 250 per side = 500 total when no human slot reserved)
  botMgr.setBotCountPerSide(310);
  assert.equal(botMgr.currentBotsPerTeam, 250);
  assert.equal(botMgr.bots.length, 500);

  // 500-Player Singleplayer Scale (1 Human Player on US + 499 AI = 249 US AI + 250 RU AI)
  botMgr.setBotCountPerSide(250, { playerTeam: 'US' });
  assert.equal(botMgr.currentBotsPerTeam, 250);
  assert.equal(botMgr.bots.length, 499);
  assert.equal(botMgr.bots.filter((b) => b.team === 'US').length, 249);
  assert.equal(botMgr.bots.filter((b) => b.team === 'RU').length, 250);

  // Switching human player faction to RU swaps the reserved slot seamlessly (250 US AI + 249 RU AI = 499 AI)
  botMgr.syncPlayerTeamSlot('RU');
  assert.equal(botMgr.bots.length, 499);
  assert.equal(botMgr.bots.filter((b) => b.team === 'US').length, 250);
  assert.equal(botMgr.bots.filter((b) => b.team === 'RU').length, 249);
});
