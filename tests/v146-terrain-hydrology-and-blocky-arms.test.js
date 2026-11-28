import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';

import { VoxelWorld } from '../src/world/VoxelWorld.js?v=149';
import { WEAPON_DEFS } from '../src/weapons.js?v=149';
import {
  createWeaponViewModel,
  updateFirstPersonArmShoulders
} from '../src/models/weapon-model.js?v=149';
import { PlayerController } from '../src/player/PlayerController.js?v=149';
import { BotManager } from '../src/bots/BotManager.js?v=149';
import { VehicleManager } from '../src/vehicles.js?v=149';
import { DISTANCES } from '../src/config.js?v=149';

test('v146: C-to-D corridor, dry valley & HQ sunken bunkers never false-trigger river water or floating infantry', () => {
  const scene = new THREE.Scene();
  const world = new VoxelWorld(scene, 'frugis_river');

  // 1. Bridges at z = -400, 0, +400 must be dry bridge decks (+1.25m), while open river at z = 120 is water
  for (const bz of [-400, 0, 400]) {
    assert.equal(world.isOnBridgeDeck(0, bz), true, `Bridge at z=${bz} should be detected`);
    assert.equal(world.isRiverWaterAt(0, bz), false, `Bridge deck at z=${bz} must NOT be river water`);
    assert.equal(world.getGroundHeightAt(0, bz), 1.25);
  }
  const rCx120 = world.getRiverCenterX(120);
  assert.equal(world.isRiverWaterAt(rCx120, 120), true, 'Open river gorge center must be river water');
  assert.equal(
    world.isSubmergedInRiver(rCx120, -3.2, 120, 0.95),
    true,
    'Deep riverbed point inside river channel must register submerged'
  );

  // 2. Every point along C (0,0) -> D (330,-320) AND the former [-11.57m] basin at (150, -240)
  //    must be dry land above the river water table and NEVER trigger river swimming!
  for (let i = 1; i <= 20; i++) {
    const t = i / 20;
    const x = 330 * t;
    const z = -320 * t;
    if (Math.abs(x - world.getRiverCenterX(z)) < 26) continue;
    const gH = world.getGroundHeightAt(x, z);
    assert.ok(
      gH > -0.6,
      `C-to-D point (${x.toFixed(1)}, ${z.toFixed(1)}) should stay above river water table, got ${gH.toFixed(2)}`
    );
    assert.equal(world.isRiverWaterAt(x, z), false);
    assert.equal(world.isSubmergedInRiver(x, gH, z, 0.9), false);
  }
  assert.ok(world.getGroundHeightAt(150, -240) > -0.5, 'Former (150, -240) basin must stay above water table');

  // 3. Subterranean HQ Sunken Bunkers (-1605, -38) & (+1605, +38) sit at y = -3.75m (< riverWaterY),
  //    yet MUST NEVER trigger river water or submerged revive lockouts!
  for (const [bx, bz] of [
    [-1605, -38],
    [1605, 38]
  ]) {
    const bunkerY = world.getGroundHeightAt(bx, bz);
    assert.ok(bunkerY < -2.5, `HQ sunken bunker at (${bx}, ${bz}) should be excavated (< -2.5m), got ${bunkerY}`);
    assert.equal(world.isRiverWaterAt(bx, bz), false, 'HQ sunken bunker is NOT river water');
    assert.equal(
      world.isSubmergedInRiver(bx, bunkerY, bz, 0.9),
      false,
      'Soldiers & casualties at -3.75m inside HQ sunken bunker must NOT be marked submerged!'
    );
  }

  // 4. Visual groundGeo mesh must closely match physics getTerrainHeight(x, z) along C -> D
  const groundMesh = scene.children.find(
    (c) => c.isMesh && c.geometry?.type === 'PlaneGeometry' && c !== world.riverMesh
  );
  assert.ok(groundMesh, 'Ground terrain mesh should exist in scene');
  const posAttr = groundMesh.geometry.attributes.position;
  // Spot-check vertices in the C-to-D sector [40..330] x [-330..-40]
  let checkedVerts = 0;
  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vy = posAttr.getY(i);
    const vz = posAttr.getZ(i);
    if (vx >= 40 && vx <= 330 && vz >= -330 && vz <= -40) {
      checkedVerts++;
      const expected = world.getTerrainHeight(vx, vz);
      assert.ok(
        Math.abs(vy - expected) < 1e-3,
        `Ground vertex (${vx.toFixed(1)}, ${vz.toFixed(1)}) y=${vy} must match getTerrainHeight=${expected}`
      );
    }
  }
  assert.ok(checkedVerts > 1500, `Expected high-density combat-zone mesh in C-to-D sector, got ${checkedVerts} vertices`);
});

test('v146: Player on foot, AI teammates, downed casualties & bikes share identical ground Y on C-to-D & in HQ bunkers', () => {
  const prevWin = globalThis.window;
  const prevDoc = globalThis.document;
  const dummyElem = { addEventListener: () => {}, style: {}, classList: { contains: () => false } };
  globalThis.document = {
    addEventListener: () => {},
    getElementById: () => null,
    pointerLockElement: dummyElem,
    body: dummyElem
  };
  globalThis.window = {
    addEventListener: () => {},
    innerWidth: 1280,
    innerHeight: 720
  };

  try {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.08, 5000);
    scene.add(camera);
    const world = new VoxelWorld(scene, 'frugis_river');
    const botManager = new BotManager(scene, world);
    botManager.initBots(2);
    const vehicleManager = new VehicleManager(scene, world);
    const player = new PlayerController(camera, scene, world, botManager, vehicleManager);
    const friendlyBots = botManager.bots.filter((b) => b.team === player.team);
    for (const enemyBot of botManager.bots) {
      if (enemyBot.team !== player.team) {
        enemyBot.dead = true;
        enemyBot.respawnTimer = 999;
      }
    }

    // Test both C-to-D valley midpoint (195, -190) AND excavated -3.75m HQ bunker (-1605, -38)
    for (const [tx, tz] of [
      [195, -190],
      [-1605, -38]
    ]) {
      const gY = world.getGroundHeightAt(tx, tz);
      player.dead = false;
      player.downed = false;
      player.activeVehicle = null;
      player.parachuting = false;
      player.pos.set(tx, gY + 0.5, tz);
      player.vel.set(0, 0, 0);

      const bike = vehicleManager.spawnVehicle({
        id: `test_bike_${tx}`,
        name: 'TEST BIKE',
        type: 'bike',
        team: 'US',
        spawnPos: new THREE.Vector3(tx + 1.5, world.getGroundHeightAt(tx + 1.5, tz), tz),
        spawnYaw: 0,
        maxHp: 400,
        speed: 30,
        weaponType: 'moto_pdw',
        rpm: 700,
        patrolPoints: []
      });

      const standingAlly = friendlyBots[0];
      standingAlly.dead = false;
      standingAlly.downed = false;
      standingAlly.drivingVehicle = null;
      standingAlly.pos.set(tx - 1.5, world.getGroundHeightAt(tx - 1.5, tz), tz);
      standingAlly.velY = 0;

      const downedAlly = friendlyBots[1];
      downedAlly.dead = false;
      downedAlly.downed = true;
      downedAlly.drivingVehicle = null;
      downedAlly.bleedOutTimer = 60;
      downedAlly.pos.set(tx + 1.0, world.getGroundHeightAt(tx + 1.0, tz) + 0.22, tz + 1.0);

      // Step 15 physics frames
      for (let step = 0; step < 15; step++) {
        player.update(0.05);
        botManager.update(0.05, player, null, null, vehicleManager, null);
      }

      assert.equal(player.inDeepWater, false, `Player at (${tx}, ${tz}) must NOT be inDeepWater`);
      assert.equal(standingAlly.isSwimming, false, `Teammate at (${tx}, ${tz}) must NOT float/swim`);
      assert.ok(
        Math.abs(player.pos.y - gY) < 0.25,
        `Player feet (${player.pos.y.toFixed(2)}) must touch ground (${gY.toFixed(2)}) at (${tx}, ${tz})`
      );
      assert.ok(
        Math.abs(standingAlly.pos.y - world.getGroundHeightAt(standingAlly.pos.x, standingAlly.pos.z)) < 0.35,
        `Teammate (${standingAlly.pos.y.toFixed(2)}) must touch ground at (${tx}, ${tz})`
      );

      // Verify player can reach & board the bike AND reach & revive the downed teammate!
      const distToBike = player.pos.distanceTo(bike.pos);
      assert.ok(
        distToBike < DISTANCES.VEHICLE_ENTER_RANGE,
        `Bike must be within boarding reach (${distToBike.toFixed(2)}m < ${DISTANCES.VEHICLE_ENTER_RANGE}m)`
      );
      const foundDowned = botManager.findNearestDownedFriendly(
        player.pos,
        player.team,
        DISTANCES.INTERACT_RANGE
      );
      assert.equal(foundDowned, downedAlly, `Downed ally at (${tx}, ${tz}) must be reachable for [F] revive!`);
    }
  } finally {
    globalThis.window = prevWin;
    globalThis.document = prevDoc;
  }
});

test('v146: 1st-person arms use strictly blocky flat-shaded BoxGeometry (zero round cylinder/sphere noodles)', () => {
  for (const def of [WEAPON_DEFS.m4a1, WEAPON_DEFS.rem870, WEAPON_DEFS.rangefinder_binos]) {
    const vm = createWeaponViewModel(def, 'US', {});
    vm.position.set(def.id === 'rangefinder_binos' ? 0 : 0.19, -0.25, -0.45);
    updateFirstPersonArmShoulders(vm);
    vm.updateMatrixWorld(true);

    for (const armName of ['leftArmGroup', 'rightArmGroup']) {
      const arm = vm.getObjectByName(armName);
      assert.ok(arm, `${def.id} must have ${armName}`);
      let boxCount = 0;
      arm.traverse((node) => {
        if (node.isMesh && node.geometry) {
          assert.equal(
            node.geometry.type,
            'BoxGeometry',
            `${def.id} ${armName} child mesh (${node.name || 'part'}) must use blocky BoxGeometry, got ${node.geometry.type}`
          );
          boxCount++;
        }
      });
      assert.ok(boxCount >= 12, `${def.id} ${armName} should contain full blocky sleeve, wrist, watch/cuff & hand parts`);
    }

    const leftShoulderCam = new THREE.Vector3(0, -0.11, 0).applyMatrix4(
      vm.getObjectByName('leftArmGroup').userData.ikRefs.upperSleeve.matrixWorld
    );
    const rightShoulderCam = new THREE.Vector3(0, -0.11, 0).applyMatrix4(
      vm.getObjectByName('rightArmGroup').userData.ikRefs.upperSleeve.matrixWorld
    );
    assert.ok(leftShoulderCam.x < -0.20, 'Left blocky arm must anchor to left shoulder');
    assert.ok(rightShoulderCam.x > 0.20, 'Right blocky arm must anchor to right shoulder');
  }
});
