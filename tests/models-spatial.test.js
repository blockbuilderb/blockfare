import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { createVehicleMesh } from '../src/models/vehicle-model.js';
import { createRadarTowerMesh, createAmmoStashMesh } from '../src/models/prop-models.js';
import {
  createSoldierMesh,
  updateSoldierEquippedWeapon
} from '../src/models/soldier-model.js';
import { createWeaponViewModel } from '../src/models/weapon-model.js?v=149';
import { WEAPON_DEFS } from '../src/assets/weapon-defs.js?v=149';
import { ATTACHMENT_CATALOG } from '../src/assets/attachment-defs.js?v=149';
import { TerrainGenerator } from '../src/world/TerrainGenerator.js?v=149';
import { SpatialGrid2D } from '../src/utils/SpatialGrid2D.js';

/**
 * Helper: returns true if `obj` and every ancestor up to `root` has `.visible === true`.
 */
function isEffectivelyVisible(obj, root) {
  let cur = obj;
  while (cur) {
    if (!cur.visible) return false;
    if (cur === root) break;
    cur = cur.parent;
  }
  return true;
}

/**
 * Helper: checks whether `target` is `root` or a descendant of `root`.
 */
function isDescendantOf(target, root) {
  let cur = target;
  while (cur) {
    if (cur === root) return true;
    cur = cur.parent;
  }
  return false;
}

// ============================================================================
// 1. 3D Aircraft `cockpitCanopyParts` & Camera Visibility Contracts
// ============================================================================

test('createVehicleMesh: every aircraft role populates a non-empty cockpitCanopyParts array for US and RU', () => {
  const roles = ['fighter', 'cas', 'bomber', 'gunship', 'b2_spirit'];
  const teams = ['US', 'RU'];

  for (const role of roles) {
    for (const team of teams) {
      const { group: mesh } = createVehicleMesh({
        type: 'plane',
        isAircraft: true,
        aircraftRole: role,
        team
      });

      assert.ok(mesh instanceof THREE.Group, `${team} ${role} should return a THREE.Group`);
      const canopyParts = mesh.userData.cockpitCanopyParts;
      assert.ok(
        Array.isArray(canopyParts) && canopyParts.length > 0,
        `${team} ${role} must populate a non-empty mesh.userData.cockpitCanopyParts array`
      );

      for (const part of canopyParts) {
        assert.ok(
          part instanceof THREE.Object3D,
          `${team} ${role} cockpitCanopyParts entry must be a THREE.Object3D`
        );
        assert.equal(
          isDescendantOf(part, mesh),
          true,
          `${team} ${role} cockpitCanopyParts entry must belong to aircraft mesh hierarchy`
        );
        assert.equal(
          part.visible,
          true,
          `${team} ${role} cockpitCanopyParts entry should start visible in 3P exterior view`
        );
      }
    }
  }
});

test('createVehicleMesh (CAS): US A-10C & RU Su-25 include barrelGroup and nose landing wheel in cockpitCanopyParts with zero disembodied nose parts in 1P COCKPIT', () => {
  for (const team of ['US', 'RU']) {
    const { group: mesh, wheels, barrelGroup } = createVehicleMesh({
      type: 'plane',
      isAircraft: true,
      aircraftRole: 'cas',
      team
    });

    const canopyParts = mesh.userData.cockpitCanopyParts;
    assert.ok(Array.isArray(canopyParts) && canopyParts.length > 0);

    // 1. Nose cannon barrelGroup exists, contains the rotary/twin cannon cylinder, and is in cockpitCanopyParts
    assert.ok(barrelGroup instanceof THREE.Group, `${team} CAS must build barrelGroup`);
    assert.ok(barrelGroup.children.length > 0, `${team} CAS barrelGroup must contain nose cannon mesh`);
    const cannonMesh = barrelGroup.children[0];
    assert.equal(cannonMesh.isMesh, true);
    assert.equal(cannonMesh.geometry.type, 'CylinderGeometry');
    assert.ok(
      cannonMesh.position.z < -6.0,
      `${team} CAS cannon barrel should sit forward under the nose (-Z)`
    );
    assert.equal(
      canopyParts.includes(barrelGroup),
      true,
      `${team} CAS cockpitCanopyParts must include barrelGroup`
    );

    // 2. Forward nose landing gear wheel (z < -2.0) exists and is in cockpitCanopyParts
    const noseWheel = wheels.find((w) => w.position.z < -2.0);
    assert.ok(noseWheel, `${team} CAS must have a forward nose landing wheel`);
    assert.equal(
      canopyParts.includes(noseWheel),
      true,
      `${team} CAS cockpitCanopyParts must include the nose landing wheel`
    );

    // Main under-wing landing gear wheels remain outside cockpitCanopyParts
    const mainWheels = wheels.filter((w) => w.position.z > 0);
    assert.equal(mainWheels.length, 2, `${team} CAS should have two rear main gear wheels`);
    for (const mw of mainWheels) {
      assert.equal(canopyParts.includes(mw), false);
    }

    // 3. Simulate switching to 1P COCKPIT: hide all cockpitCanopyParts
    for (const part of canopyParts) {
      part.visible = false;
    }

    assert.equal(barrelGroup.visible, false);
    assert.equal(noseWheel.visible, false);
    assert.equal(isEffectivelyVisible(cannonMesh, mesh), false);

    // Verify ZERO visible meshes remain floating in front of the cockpit (z < -2.0)
    mesh.updateMatrixWorld(true);
    const worldPos = new THREE.Vector3();
    const floatingForwardMeshes = [];
    mesh.traverse((child) => {
      if (!child.isMesh) return;
      if (!isEffectivelyVisible(child, mesh)) return;
      worldPos.setFromMatrixPosition(child.matrixWorld);
      if (worldPos.z < -2.0) {
        floatingForwardMeshes.push(child);
      }
    });
    assert.equal(
      floatingForwardMeshes.length,
      0,
      `${team} CAS must leave zero disembodied forward nose/barrel meshes visible in 1P COCKPIT`
    );

    // Restore to 3P Chase view and verify visibility recovers cleanly
    for (const part of canopyParts) {
      part.visible = true;
    }
    assert.equal(barrelGroup.visible, true);
    assert.equal(noseWheel.visible, true);
    assert.equal(isEffectivelyVisible(cannonMesh, mesh), true);
  }
});

test('createVehicleMesh (gunship): AC-130J & Tu-95MS cockpitCanopyParts hides ONLY forward windshield/crown and NEVER hides cargo fuselage or gunshipBarrelGroup', () => {
  for (const team of ['US', 'RU']) {
    const { group: mesh, barrelGroup } = createVehicleMesh({
      type: 'plane',
      isAircraft: true,
      aircraftRole: 'gunship',
      team
    });

    const canopyParts = mesh.userData.cockpitCanopyParts;
    assert.ok(Array.isArray(canopyParts));
    assert.equal(
      canopyParts.length,
      2,
      `${team} gunship cockpitCanopyParts should contain ONLY [cockpitWindshield, flightDeckCrown]`
    );

    for (const part of canopyParts) {
      assert.equal(part.userData.hideIn1PCockpit, true);
      assert.ok(
        part.position.z < -4.0 && part.position.y > 2.0,
        `${team} gunship canopy part must be located at the upper forward flight deck`
      );
    }

    // Locate main cargo fuselage & port-side gunship weapon battery
    const gunshipBarrelGroup = mesh.userData.gunshipBarrelGroup;
    assert.ok(
      gunshipBarrelGroup instanceof THREE.Group && gunshipBarrelGroup === barrelGroup,
      `${team} gunship must expose mesh.userData.gunshipBarrelGroup`
    );
    assert.equal(
      gunshipBarrelGroup.children.length,
      3,
      `${team} gunshipBarrelGroup should carry 25mm, 40mm Bofors, and 105mm Howitzer barrels`
    );

    // Main pressurized cargo hull sits near origin with >10m length
    const mainCargoBody = mesh.children.find(
      (c) =>
        c.isMesh &&
        Math.abs(c.position.z - 0.15) < 1e-3 &&
        Math.abs(c.position.y - 1.88) < 1e-3
    );
    assert.ok(mainCargoBody, `${team} gunship must have main cargo fuselage mesh`);

    assert.equal(canopyParts.includes(mainCargoBody), false);
    assert.equal(canopyParts.includes(gunshipBarrelGroup), false);

    // Simulate 1P COCKPIT toggle
    for (const part of canopyParts) {
      part.visible = false;
    }

    assert.equal(mesh.visible, true);
    assert.equal(
      isEffectivelyVisible(mainCargoBody, mesh),
      true,
      `${team} gunship main cargo fuselage must NEVER hide in 1P COCKPIT`
    );
    assert.equal(
      isEffectivelyVisible(gunshipBarrelGroup, mesh),
      true,
      `${team} gunshipBarrelGroup must remain visible for port-window firing`
    );
    for (const barrelMesh of gunshipBarrelGroup.children) {
      assert.equal(isEffectivelyVisible(barrelMesh, mesh), true);
    }

    // Every direct child of mesh EXCEPT the 2 windshield/crown meshes stays visible
    const hiddenDirectChildren = mesh.children.filter((c) => !c.visible);
    assert.equal(hiddenDirectChildren.length, 2);
  }
});

test('createVehicleMesh: ground bikes and ATVs expose mesh.userData.riderGroup across postures and teams', () => {
  const configs = [
    { type: 'atv', team: 'US' },
    { type: 'atv', team: 'RU' },
    { type: 'bike', bikeSubType: 'sport_600cc', team: 'US' },
    { type: 'bike', bikeSubType: 'superbike_1000cc', team: 'RU' },
    { type: 'bike', bikeSubType: 'twostroke_250cc', isTwoStroke: true, team: 'US' },
    { type: 'bike', bikeSubType: 'emoto_stark_varg', isElectric: true, team: 'RU' },
    { type: 'bike', bikeSubType: 'scooter_kukirin', isScooter: true, team: 'US' }
  ];

  for (const cfg of configs) {
    const label = `${cfg.team} ${cfg.type}${cfg.bikeSubType ? ':' + cfg.bikeSubType : ''}`;
    const { group: mesh, wheels } = createVehicleMesh(cfg);

    const riderGroup = mesh.userData.riderGroup;
    assert.ok(
      riderGroup instanceof THREE.Group,
      `${label} must expose mesh.userData.riderGroup as a THREE.Group`
    );
    assert.equal(riderGroup.parent, mesh, `${label} riderGroup must be parented to vehicle mesh`);
    assert.equal(
      riderGroup.visible,
      false,
      `${label} riderGroup should default to visible=false while unoccupied`
    );
    assert.ok(
      riderGroup.userData.headPivot instanceof THREE.Group,
      `${label} riderGroup should expose articulated userData.headPivot`
    );
    assert.ok(riderGroup.children.length > 0, `${label} riderGroup must contain 3D rider geometry`);
    assert.equal(
      wheels.length,
      cfg.type === 'atv' ? 4 : 2,
      `${label} should populate expected wheel count`
    );
  }
});

// ============================================================================
// 2. `createSoldierMesh` Parts & Frustum-Culled Matrix World Contracts
// ============================================================================

const REQUIRED_SOLDIER_PART_KEYS = [
  'pelvisGroup',
  'leftLeg',
  'rightLeg',
  'leftShin',
  'rightShin',
  'leftArm',
  'rightArm',
  'leftUpper',
  'leftFore',
  'rightUpper',
  'rightFore',
  'upperBody',
  'headGroup',
  'weaponRig',
  'gunGroup',
  'rpgShoulderGroup',
  'muzzleFlash',
  'defaultMuzzleFlash',
  'helmet',
  'vest',
  'marker'
];

function assertValidSoldierParts(root, label) {
  assert.ok(root instanceof THREE.Group, `${label}: root must be a THREE.Group`);
  const parts = root.userData.parts;
  assert.ok(parts && typeof parts === 'object', `${label}: userData.parts must exist`);
  for (const key of REQUIRED_SOLDIER_PART_KEYS) {
    assert.ok(
      parts[key] instanceof THREE.Object3D,
      `${label}: parts.${key} must be a valid THREE.Object3D`
    );
    assert.equal(
      isDescendantOf(parts[key], root),
      true,
      `${label}: parts.${key} must be attached inside root hierarchy`
    );
  }
}

test('createSoldierMesh: builds valid userData.parts for Modern (US/RU), Medieval, and Jurassic (TREX/RAPTOR) roles', () => {
  // 1. Modern US & RU classes + command ranks
  for (const team of ['US', 'RU']) {
    for (const role of ['ASSAULT', 'MEDIC', 'ENGINEER', 'RECON', 'SUPPORT']) {
      const rank = role === 'ASSAULT' ? 'SQUAD_LEADER' : 'MEMBER';
      const root = createSoldierMesh(team, role, rank, 'modern');
      assertValidSoldierParts(root, `Modern ${team} ${role}`);
      assert.equal(Boolean(root.userData.isDinoMorph), false);
      assert.equal(root.userData.parts.gunGroup.visible, true);
      assert.equal(root.userData.parts.helmet.visible, true);
      assert.equal(root.userData.parts.vest.visible, true);
      if (role === 'ENGINEER') {
        assert.ok(root.userData.parts.rpgBackTube instanceof THREE.Group);
      } else {
        assert.equal(root.userData.parts.rpgBackTube, null);
      }
    }
  }

  // 2. Medieval roles (US & RU)
  const medievalRoles = [
    'SWORDSMAN',
    'GREATSWORD_KNIGHT',
    'POLEARM_KNIGHT',
    'ARCHER',
    'CROSSBOWMAN',
    'MOUNTED_KNIGHT'
  ];
  for (const role of medievalRoles) {
    const team = role === 'CROSSBOWMAN' || role === 'POLEARM_KNIGHT' ? 'RU' : 'US';
    const root = createSoldierMesh(team, role, 'MEMBER', 'medieval');
    assertValidSoldierParts(root, `Medieval ${team} ${role}`);
    assert.equal(Boolean(root.userData.isDinoMorph), false);
    assert.ok(
      root.userData.swordScabbardGroup instanceof THREE.Group,
      `Medieval ${role} should attach swordScabbardGroup`
    );
    assert.ok(
      root.userData.slungSwordHiltGroup instanceof THREE.Group,
      `Medieval ${role} should attach slungSwordHiltGroup`
    );
  }

  // 3. Jurassic roles (TREX & RAPTOR)
  const trex = createSoldierMesh('RU', 'TREX', 'COMMANDER', 'jurassic');
  assertValidSoldierParts(trex, 'Jurassic RU TREX');
  assert.equal(trex.userData.isDinoMorph, true);
  assert.equal(trex.userData.parts.gunGroup.visible, false);
  assert.equal(trex.userData.parts.helmet.visible, false);
  assert.equal(trex.userData.parts.vest.visible, false);
  assert.ok(Math.abs(trex.scale.x - 3.45) < 1e-6, 'TREX should scale to 3.45x');
  assert.equal(
    updateSoldierEquippedWeapon(trex, 'ak15', 'RU', { role: 'TREX' }),
    false,
    'TREX must reject human firearm equip and keep gunGroup hidden'
  );
  assert.equal(trex.userData.parts.gunGroup.visible, false);

  const raptor = createSoldierMesh('RU', 'RAPTOR', 'MEMBER', 'jurassic');
  assertValidSoldierParts(raptor, 'Jurassic RU RAPTOR');
  assert.equal(raptor.userData.isDinoMorph, true);
  assert.equal(raptor.userData.parts.gunGroup.visible, false);
  assert.equal(raptor.userData.parts.helmet.visible, false);
  assert.equal(raptor.userData.parts.vest.visible, false);
  assert.ok(Math.abs(raptor.scale.x - 2.15) < 1e-6, 'RAPTOR should scale to 2.15x');
});

test('createSoldierMesh: root.updateMatrixWorld honors _culledOffFrustum (true skips traversal, false updates world matrices)', () => {
  const root = createSoldierMesh('US', 'ASSAULT', 'MEMBER', 'modern');
  const { headGroup, upperBody, leftLeg } = root.userData.parts;

  // Establish initial world matrices at origin
  assert.equal(root._culledOffFrustum, false);
  root.position.set(0, 0, 0);
  root.updateMatrixWorld(true);
  assert.equal(root.matrixWorld.elements[12], 0);
  assert.equal(headGroup.matrixWorld.elements[12], 0);

  // Mark soldier off-frustum, mutate root & child transforms, and call updateMatrixWorld(true)
  root._culledOffFrustum = true;
  root.position.set(420, 18, -960);
  upperBody.rotation.y = 0.85;
  leftLeg.rotation.x = -0.6;
  root.updateMatrixWorld(true);

  // Matrix traversal MUST be skipped while _culledOffFrustum === true
  assert.equal(
    root.matrixWorld.elements[12],
    0,
    'Culled soldier root.matrixWorld X must not update while _culledOffFrustum is true'
  );
  assert.equal(root.matrixWorld.elements[13], 0);
  assert.equal(root.matrixWorld.elements[14], 0);
  assert.equal(
    headGroup.matrixWorld.elements[12],
    0,
    'Culled soldier child headGroup.matrixWorld must not update while _culledOffFrustum is true'
  );

  // Un-cull soldier (_culledOffFrustum = false) and verify world matrices update immediately
  root._culledOffFrustum = false;
  root.updateMatrixWorld(true);

  assert.ok(Math.abs(root.matrixWorld.elements[12] - 420) < 1e-5);
  assert.ok(Math.abs(root.matrixWorld.elements[13] - 18) < 1e-5);
  assert.ok(Math.abs(root.matrixWorld.elements[14] - -960) < 1e-5);
  assert.ok(
    Math.abs(headGroup.matrixWorld.elements[12] - 420) < 1e-5,
    'Un-culled soldier child headGroup.matrixWorld X must sync with root position'
  );
  assert.ok(
    headGroup.matrixWorld.elements[13] > 18.5,
    'Un-culled soldier child headGroup.matrixWorld Y must include local pelvis/torso/head offset'
  );
});

// ============================================================================
// 3. `SpatialGrid2D` Queries, Ring Ordering, Early Stop & Expanded Bounds
// ============================================================================

test('SpatialGrid2D: insert, dynamic growth, clear, and forEachInRadius exact Euclidean filtering', () => {
  const grid = new SpatialGrid2D(-2912, 2912, -1920, 1920, 32, 64);
  assert.equal(grid.cols, 182);
  assert.equal(grid.rows, 120);
  assert.equal(grid.count, 0);

  // Insert > initialCapacity (64) items to verify _grow() preserves all entries
  for (let i = 0; i < 150; i++) {
    const id = grid.insert(i * 10 - 750, (i % 15) * 12 - 90, { id: i });
    assert.equal(id, i);
  }
  assert.equal(grid.count, 150);
  assert.ok(grid.capacity >= 150);

  // Clear resets count, dirty cells, and item references cleanly
  grid.clear();
  assert.equal(grid.count, 0);
  assert.equal(grid.dirtyCount, 0);
  let afterClearHits = 0;
  grid.forEachInRadius(0, 0, 5000, () => {
    afterClearHits++;
  });
  assert.equal(afterClearHits, 0);

  // Re-populate with known geometry around (100, -200)
  const a = { name: 'center' };
  const b = { name: 'on_circle_edge' }; // dx=30, dz=40 -> dist=50 (exact boundary)
  const c = { name: 'same_cell_band_but_outside_circle' }; // dx=40, dz=40 -> dist=56.57 > 50
  const d = { name: 'far_away' };

  grid.insert(100, -200, a);
  grid.insert(130, -160, b);
  grid.insert(140, -160, c);
  grid.insert(-1800, 1200, d);

  const visited = [];
  grid.forEachInRadius(100, -200, 50, (item, distSq, dx, dz) => {
    visited.push({ item, distSq, dx, dz });
  });

  assert.equal(visited.length, 2);
  const byName = new Map(visited.map((v) => [v.item.name, v]));
  assert.ok(byName.has('center'));
  assert.ok(byName.has('on_circle_edge'));
  assert.equal(byName.has('same_cell_band_but_outside_circle'), false);

  const edgeHit = byName.get('on_circle_edge');
  assert.equal(edgeHit.dx, 30);
  assert.equal(edgeHit.dz, 40);
  assert.equal(edgeHit.distSq, 2500);

  // Early abort on strict `return false` in forEachInRadius
  let radiusStopVisits = 0;
  grid.forEachInRadius(100, -200, 50, () => {
    radiusStopVisits++;
    return false;
  });
  assert.equal(radiusStopVisits, 1);
});

test('SpatialGrid2D: forEachRingOrder enforces nearest-ring-first ordering, zero duplicate corner visits, and early return false stop', () => {
  const grid = new SpatialGrid2D(-2912, 2912, -1920, 1920, 32);

  // Query origin inside cell (cx0, cz0) at (16, 16)
  const qx = 16;
  const qz = 16;
  const cx0 = grid._cellCoordX(qx);
  const cz0 = grid._cellCoordZ(qz);

  // Insert from farthest ring to nearest ring to prove ring order is topological, not insertion order
  grid.insert(qx + 4 * 32, qz - 3 * 32, { tag: 'ring4', expectedRing: 4 });
  grid.insert(qx - 3 * 32, qz + 3 * 32, { tag: 'ring3_corner', expectedRing: 3 });
  grid.insert(qx + 2 * 32, qz, { tag: 'ring2_east', expectedRing: 2 });
  grid.insert(qx - 32, qz - 32, { tag: 'ring1_nw_corner', expectedRing: 1 });
  grid.insert(qx + 32, qz + 32, { tag: 'ring1_se_corner', expectedRing: 1 });
  grid.insert(qx, qz + 32, { tag: 'ring1_south', expectedRing: 1 });
  grid.insert(qx + 4, qz - 4, { tag: 'ring0_center', expectedRing: 0 });

  const order = [];
  grid.forEachRingOrder(qx, qz, 300, (item) => {
    order.push(item);
  });

  assert.equal(order.length, 7, 'All 7 items within 300m must be visited exactly once (no corner duplicates)');
  assert.equal(order[0].tag, 'ring0_center', 'Center cell (ring 0) must be visited first');

  // Verify Chebyshev ring index is monotonically non-decreasing across the entire visit sequence
  for (let i = 1; i < order.length; i++) {
    assert.ok(
      order[i].expectedRing >= order[i - 1].expectedRing,
      `Ring order violated at index ${i}: ring ${order[i].expectedRing} visited after ring ${order[i - 1].expectedRing}`
    );
  }

  // Populate all 8 cells of ring 1 around (qx, qz) to verify zero duplicate or skipped perimeter cells
  grid.clear();
  let ring1Expected = 0;
  for (let dzCell = -1; dzCell <= 1; dzCell++) {
    for (let dxCell = -1; dxCell <= 1; dxCell++) {
      const ix = qx + dxCell * 32;
      const iz = qz + dzCell * 32;
      const ring = Math.max(
        Math.abs(grid._cellCoordX(ix) - cx0),
        Math.abs(grid._cellCoordZ(iz) - cz0)
      );
      grid.insert(ix, iz, { dxCell, dzCell, ring });
      ring1Expected++;
    }
  }
  assert.equal(ring1Expected, 9);

  const seenCells = new Set();
  const seenRings = [];
  grid.forEachRingOrder(qx, qz, 128, (item) => {
    const key = `${item.dxCell},${item.dzCell}`;
    assert.equal(seenCells.has(key), false, `Cell ${key} must not be visited twice`);
    seenCells.add(key);
    seenRings.push(item.ring);
  });
  assert.equal(seenCells.size, 9);
  assert.equal(seenRings[0], 0);
  for (let i = 1; i < seenRings.length; i++) {
    assert.equal(seenRings[i], 1);
  }

  // Verify early `return false` stops immediately both in ring 0 and mid-ring 1
  let stopAtOne = 0;
  grid.forEachRingOrder(qx, qz, 128, () => {
    stopAtOne++;
    return false;
  });
  assert.equal(stopAtOne, 1, 'Returning false in center cell must abort before outer rings');

  let stopAtFour = 0;
  grid.forEachRingOrder(qx, qz, 128, () => {
    stopAtFour++;
    if (stopAtFour === 4) return false;
  });
  assert.equal(stopAtFour, 4, 'Returning false in outer ring must halt remaining cells and rings');
});

test('SpatialGrid2D: clamps exact boundaries and out-of-bounds coordinates across expanded [-2912, 2912] x [-1920, 1920] map bounds', () => {
  const grid = new SpatialGrid2D(-2912, 2912, -1920, 1920, 32, 128);

  // Verify cell coordinate clamping at exact min/max boundaries and beyond
  assert.equal(grid._cellCoordX(-2912), 0);
  assert.equal(grid._cellCoordX(-3600), 0);
  assert.equal(grid._cellCoordX(2912), grid.cols - 1);
  assert.equal(grid._cellCoordX(3600), grid.cols - 1);

  assert.equal(grid._cellCoordZ(-1920), 0);
  assert.equal(grid._cellCoordZ(-2500), 0);
  assert.equal(grid._cellCoordZ(1920), grid.rows - 1);
  assert.equal(grid._cellCoordZ(2500), grid.rows - 1);

  // Insert entities at all 4 expanded map corners AND slightly outside map bounds (e.g. aircraft turnouts)
  const corners = [
    { name: 'NW_exact', x: -2912, z: -1920 },
    { name: 'NE_exact', x: 2912, z: -1920 },
    { name: 'SW_exact', x: -2912, z: 1920 },
    { name: 'SE_exact', x: 2912, z: 1920 },
    { name: 'NW_oob_near', x: -2930, z: -1935 }, // ~23.5m outside NW corner
    { name: 'SE_oob_far', x: 3400, z: 2400 }     // Clamped to SE cell, but >680m away in true Euclidean distance
  ];

  for (const c of corners) {
    grid.insert(c.x, c.z, c);
  }
  assert.equal(grid.count, 6);

  // Query at NW corner (-2912, -1920) with 40m radius: should find NW_exact and NW_oob_near
  const nwRadiusHits = [];
  grid.forEachInRadius(-2912, -1920, 40, (item) => {
    nwRadiusHits.push(item.name);
  });
  assert.deepEqual(nwRadiusHits.sort(), ['NW_exact', 'NW_oob_near']);

  const nwRingHits = [];
  grid.forEachRingOrder(-2912, -1920, 40, (item) => {
    nwRingHits.push(item.name);
  });
  assert.deepEqual(nwRingHits.sort(), ['NW_exact', 'NW_oob_near']);

  // Query at SE corner (2912, 1920) with 64m radius:
  // SE_exact is at dist=0, whereas SE_oob_far is clamped to the same corner cell (181, 119)
  // but its true Euclidean distance is hypot(488, 480) = 684.5m > 64m, so it MUST NOT falsely match!
  const seRadiusHits = [];
  grid.forEachInRadius(2912, 1920, 64, (item) => {
    seRadiusHits.push(item.name);
  });
  assert.deepEqual(seRadiusHits, ['SE_exact']);

  const seRingHits = [];
  grid.forEachRingOrder(2912, 1920, 64, (item) => {
    seRingHits.push(item.name);
  });
  assert.deepEqual(seRingHits, ['SE_exact']);

  // Verify NE and SW corners are also reachable via findNearest & forEachRingOrder
  assert.equal(grid.findNearest(2900, -1910, 50)?.name, 'NE_exact');
  assert.equal(grid.findNearest(-2900, 1910, 50)?.name, 'SW_exact');
});

// ============================================================================
// 4. Upgraded Ground Vehicles, Strike Bombers, Emplacements, Dino Mounts & Props
// ============================================================================

test('createVehicleMesh & prop-models: upgraded faction armor, bombers, emplacements, dinos, radar towers, and ammo stashes satisfy geometry & draw-call contracts', () => {
  // 1. Bomber (F-15E Strike Eagle US / Su-34 Fullback RU): zero forward z < -2.0 obstructions in 1P COCKPIT
  for (const team of ['US', 'RU']) {
    const { group: bomber } = createVehicleMesh({
      type: 'plane',
      isAircraft: true,
      aircraftRole: 'bomber',
      team
    });
    assert.ok(bomber.userData.controlSurfaces?.rudders?.length === 2);
    for (const p of bomber.userData.cockpitCanopyParts) p.visible = false;
    bomber.updateMatrixWorld(true);
    const wp = new THREE.Vector3();
    let forwardLeaks = 0;
    bomber.traverse((c) => {
      if (c.isMesh && isEffectivelyVisible(c, bomber)) {
        wp.setFromMatrixPosition(c.matrixWorld);
        if (wp.z < -2.0) forwardLeaks++;
      }
    });
    assert.equal(forwardLeaks, 0, `${team} bomber must have zero visible z < -2.0 meshes in 1P COCKPIT`);
  }

  // 2. Faction Ground Combat Vehicles (Tank, Humvee/Tigr, APC/BTR-82A, LAV-AD/Tunguska SPAAG)
  const groundSpecs = [
    { type: 'tank', team: 'US', expectedWheels: 12, maxMeshes: 40 },
    { type: 'tank', team: 'RU', expectedWheels: 12, maxMeshes: 40 },
    { type: 'humvee', team: 'US', expectedWheels: 4, maxMeshes: 32 },
    { type: 'humvee', team: 'RU', expectedWheels: 4, maxMeshes: 32 },
    { type: 'apc', team: 'US', expectedWheels: 8, maxMeshes: 40 },
    { type: 'apc', team: 'RU', expectedWheels: 8, maxMeshes: 40 },
    { type: 'aa', team: 'US', expectedWheels: 8, maxMeshes: 40 },
    { type: 'aa', team: 'RU', expectedWheels: 12, maxMeshes: 40 }
  ];
  for (const spec of groundSpecs) {
    const { group, wheels, turretPivot, barrelGroup } = createVehicleMesh(spec);
    assert.equal(wheels.length, spec.expectedWheels, `${spec.team} ${spec.type} wheel count`);
    assert.ok(turretPivot instanceof THREE.Group);
    assert.ok(barrelGroup instanceof THREE.Group && barrelGroup.children.length > 0);
    assert.equal(isDescendantOf(barrelGroup, turretPivot), true);
    let meshCount = 0;
    group.traverse((c) => {
      if (c.isMesh) meshCount++;
    });
    assert.ok(meshCount >= 12 && meshCount <= spec.maxMeshes, `${spec.team} ${spec.type} mesh count (${meshCount}) stays detailed yet draw-call bounded`);
  }

  // 3. Squad Emplacements & Jurassic Rideable Dino Mounts
  for (const empType of ['emplace_hmg', 'emplace_aa', 'emplace_mortar']) {
    const { group, turretPivot, barrelGroup } = createVehicleMesh({
      type: empType,
      isEmplacement: true,
      team: 'US'
    });
    assert.ok(group instanceof THREE.Group);
    assert.ok(barrelGroup instanceof THREE.Group && isDescendantOf(barrelGroup, turretPivot));
  }
  for (const dinoType of ['trex_mount', 'raptor_mount']) {
    const { group, wheels } = createVehicleMesh({ type: dinoType, team: 'US' });
    assert.equal(wheels.length, 2, `${dinoType} hind leg pivots`);
    assert.ok(group.userData.headNeckGroup instanceof THREE.Group, `${dinoType} articulated headNeckGroup`);
  }

  // 4. Radar Tower (<= 5 merged static draw calls) & Ammo Stash (children[3] RingGeometry invariant)
  const radar = createRadarTowerMesh();
  let radarMeshes = 0;
  radar.traverse((c) => {
    if (c.isMesh) {
      radarMeshes++;
      assert.equal(c.matrixAutoUpdate, false);
    }
  });
  assert.ok(radarMeshes >= 3 && radarMeshes <= 5, `Radar tower should use 3..5 merged draw calls, got ${radarMeshes}`);

  for (const perm of [true, false]) {
    const stash = createAmmoStashMesh(perm);
    assert.equal(stash.children.length, 4);
    assert.equal(stash.children[3].geometry.type, 'RingGeometry');
  }
});

test('createWeaponViewModel: builds articulated 1st-person Spec-Ops arms, tactical watch, hard-knuckle gloves, trigger finger/blade, magazine, and bolt carrier while stripping 1P arms cleanly on 3P AI soldiers', () => {
  for (const wId of ['m4a1', 'ak15', 'p90', 'm9_beretta']) {
    const vm = createWeaponViewModel(WEAPON_DEFS[wId], 'US', {});
    const leftArm = vm.getObjectByName('leftArmGroup');
    const rightArm = vm.getObjectByName('rightArmGroup');
    assert.ok(leftArm, `${wId} must include leftArmGroup`);
    assert.ok(rightArm, `${wId} must include rightArmGroup`);
    assert.ok(leftArm.getObjectByName('tacticalWatchGroup'), `${wId} left wrist must include tacticalWatchGroup`);
    assert.ok(leftArm.getObjectByName('leftHandGroup'), `${wId} left arm must include sculpted leftHandGroup`);
    assert.ok(leftArm.getObjectByName('leftThumbGroup'), `${wId} left hand must include opposable thumb`);
    assert.ok(rightArm.getObjectByName('triggerFingerGroup'), `${wId} right hand must include articulated triggerFingerGroup`);
    assert.ok(vm.getObjectByName('triggerBladeMesh'), `${wId} receiver must include articulated triggerBladeMesh`);
    assert.ok(vm.getObjectByName('magazineMesh'), `${wId} must include magazineMesh`);
    assert.ok(vm.getObjectByName('boltCarrierMesh'), `${wId} must include reciprocating boltCarrierMesh`);
  }

  // Verify 3rd-person AI soldier mesh still strips 1P arms and exposes 2-tier distance LOD arrays for 500-player scale
  const soldier = createSoldierMesh('US', 'ASSAULT', 'MEMBER', 'modern');
  assert.ok(Array.isArray(soldier.userData.lodDetailMeshes) && soldier.userData.lodDetailMeshes.length >= 8);
  assert.ok(Array.isArray(soldier.userData.farLimbLodMeshes) && soldier.userData.farLimbLodMeshes.length === 6);
  updateSoldierEquippedWeapon(soldier, 'm4a1', 'US', { role: 'ASSAULT' });
  assert.equal(soldier.userData.parts.gunGroup.getObjectByName('leftArmGroup'), undefined);
  assert.equal(soldier.userData.parts.gunGroup.getObjectByName('rightArmGroup'), undefined);
});

test('All 29 Firearms & Launchers × All 18 Gunsmith Optics have 100% unobstructed center ADS sightlines (including Assault ak15 & Sniper Thermal IR)', () => {
  const opticAttachments = [
    null,
    ...ATTACHMENT_CATALOG.optic.filter((a) => a.id !== 'factory').map((a) => a.id)
  ];
  const opticMap = Object.fromEntries(ATTACHMENT_CATALOG.optic.map((a) => [a.id, a]));
  const firearmDefs = Object.values(WEAPON_DEFS).filter(
    (w) => !w.isBow && !w.isCrossbow && w.type !== 'melee_sword' && w.type !== 'hammer'
  );
  assert.ok(firearmDefs.length >= 27, `Expected >=27 firearms/launchers, got ${firearmDefs.length}`);

  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1),
    0.08,
    2.0
  );
  const blocked = [];

  for (const def of firearmDefs) {
    const isPistol =
      def.slot === 'secondary' || ['mp443', 'usp45', 'g18', 'deagle'].includes(def.id);
    const isLauncher = def.type === 'rpg' || def.type === 'stinger';
    const testOptics = isLauncher ? [null] : opticAttachments;

    for (const opticId of testOptics) {
      const attOpticType = opticId ? opticMap[opticId]?.opticType : null;
      const activeOptic = opticId ? attOpticType : isLauncher ? def.opticType : null;
      const mesh = createWeaponViewModel(def, 'US', opticId ? { optic: opticId } : { optic: 'factory' });

      const isBareIronSights = !activeOptic;
      const isSniper8x = [
        'sniper8x',
        'sniper12x',
        'sniperFlir',
        'valday6x',
        'lpvo36',
        'flir'
      ].includes(activeOptic);
      const isAcog = ['acog', 'elcan4x', 'prism2x', 'holo3x'].includes(activeOptic);
      const isHolo = ['holo', 'uh1'].includes(activeOptic);
      const isKobra = ['kobra', 'okp7', 'rmr'].includes(activeOptic);

      const sightCenterY =
        isLauncher && (isBareIronSights || activeOptic === 'rpgSight')
          ? -0.108
          : isBareIronSights
          ? isPistol
            ? -0.052
            : -0.06
          : isSniper8x
          ? -0.118
          : isAcog
          ? isPistol
            ? -0.072
            : -0.076
          : isHolo || isKobra
          ? isPistol
            ? -0.073
            : -0.082
          : isPistol
          ? -0.076
          : -0.085;

      const baseAdsZ = isLauncher
        ? -0.22
        : isBareIronSights
        ? isPistol
          ? -0.22
          : -0.18
        : isSniper8x
        ? -0.14
        : isAcog
        ? isPistol
          ? -0.21
          : -0.17
        : isPistol
        ? -0.25
        : -0.21;

      mesh.position.set(0, sightCenterY, baseAdsZ);
      const opticNode = mesh.getObjectByName('opticSight');
      if (opticNode && activeOptic) opticNode.visible = false;
      mesh.updateMatrixWorld(true);

      const hits = raycaster.intersectObject(mesh, true).filter((h) => {
        if (!isEffectivelyVisible(h.object, mesh)) return false;
        if (h.object.material?.transparent && (h.object.material.opacity ?? 1) < 0.35) {
          return false;
        }
        return true;
      });
      if (hits.length > 0) {
        blocked.push(`${def.id}+${opticId || 'iron_sights'}@${hits[0].point.z.toFixed(3)}`);
      }
    }
  }

  assert.deepEqual(
    blocked,
    [],
    `Every firearm & launcher ADS sightline must be 100% clear, found blocked: ${blocked.join(', ')}`
  );
});

test('All US & RU Ground Vehicles orient headlights forward (-Z), red taillights aft (+Z), and main barrels forward (-Z)', () => {
  const groundTypes = ['tank', 'humvee', 'apc', 'aa'];
  for (const team of ['US', 'RU']) {
    for (const type of groundTypes) {
      const { group: mesh, turretPivot, barrelGroup } = createVehicleMesh({ type, team });
      // Apply runtime forward-aligned turret transform (`v.turretPivot.rotation.y = v.turretYaw - v.yaw + Math.PI` at yaw=0, turretYaw=0)
      if (turretPivot) turretPivot.rotation.y = Math.PI;
      mesh.updateMatrixWorld(true);

      let minWhiteLightZ = Infinity;
      let maxRedTaillightZ = -Infinity;
      const box = new THREE.Box3();

      mesh.traverse((c) => {
        if (!c.isMesh || !c.material?.color) return;
        const hex = c.material.color.getHex();
        if (
          hex === 0xf5f6fa ||
          hex === 0xfef9e7 ||
          hex === 0xffffff ||
          hex === 0xdff9fb
        ) {
          box.setFromObject(c);
          if (box.min.z < minWhiteLightZ) minWhiteLightZ = box.min.z;
        }
        if (
          hex === 0xd63031 ||
          hex === 0xc0392b ||
          hex === 0xe74c3c ||
          hex === 0xff3b30
        ) {
          box.setFromObject(c);
          if (box.max.z > maxRedTaillightZ) maxRedTaillightZ = box.max.z;
        }
      });

      assert.ok(
        minWhiteLightZ < -1.2,
        `${team} ${type} white headlights must sit on the -Z front nose (got z=${minWhiteLightZ})`
      );
      assert.ok(
        maxRedTaillightZ > 1.2,
        `${team} ${type} red taillights must sit on the +Z rear hull (got z=${maxRedTaillightZ})`
      );

      if (barrelGroup) {
        const bbox = new THREE.Box3().setFromObject(barrelGroup);
        assert.ok(
          bbox.min.z < -1.0,
          `${team} ${type} turret barrel must extend forward along -Z (got min.z=${bbox.min.z})`
        );
      }
    }
  }
});

test('TerrainGenerator ContinentalHorizonSkirt stitches seamlessly to ±3800m × ±2600m ground perimeter out to ±58,000m', () => {
  const worldStub = Object.assign(
    {
      era: 'modern',
      scene: new THREE.Scene(),
      flags: [],
      gradedPads: [],
      addVoxel: () => null,
      spawns: { US_BASE: new THREE.Vector3(-3000, 0, 0), RU_BASE: new THREE.Vector3(3000, 0, 0) },
      getGroundHeightAt(x, z) {
        return this.getTerrainHeight(x, z);
      }
    },
    TerrainGenerator
  );
  const prevDoc = globalThis.document;
  if (!globalThis.document) {
    globalThis.document = {
      createElement: () => ({
        width: 64,
        height: 64,
        getContext: () => ({
          fillStyle: '',
          strokeStyle: '',
          font: '',
          textAlign: '',
          textBaseline: '',
          lineWidth: 1,
          fillRect: () => {},
          strokeRect: () => {},
          fillText: () => {},
          beginPath: () => {},
          moveTo: () => {},
          lineTo: () => {},
          stroke: () => {},
          arc: () => {},
          fill: () => {}
        })
      })
    };
  }
  try {
    worldStub.buildEnvironment();
  } finally {
    globalThis.document = prevDoc;
  }
  assert.ok(worldStub.continentalSkirtMesh instanceof THREE.Mesh, 'Must create continentalSkirtMesh');
  assert.equal(worldStub.continentalSkirtMesh.name, 'ContinentalHorizonSkirt');

  const posAttr = worldStub.continentalSkirtMesh.geometry.attributes.position;
  assert.ok(posAttr.count > 400, 'Continental skirt should contain multi-ring horizon geometry');

  let maxAbsX = 0;
  let maxAbsZ = 0;
  for (let i = 0; i < posAttr.count; i++) {
    maxAbsX = Math.max(maxAbsX, Math.abs(posAttr.getX(i)));
    maxAbsZ = Math.max(maxAbsZ, Math.abs(posAttr.getZ(i)));
  }
  assert.ok(maxAbsX >= 55000 && maxAbsZ >= 55000, 'Continental skirt must extend >=55km to horizon');

  // Inner ring vertices (ring 0: first 112 perimeter vertices) must match exact getGroundHeightAt(x, z) with zero gap!
  for (let i = 0; i < 112; i++) {
    const vx = posAttr.getX(i);
    const vy = posAttr.getY(i);
    const vz = posAttr.getZ(i);
    const expectedY = worldStub.getGroundHeightAt(vx, vz);
    assert.ok(
      Math.abs(vy - expectedY) < 1e-3,
      `Inner skirt seam vertex ${i} at (${vx}, ${vz}) must match ground height ${expectedY}, got ${vy}`
    );
  }
});
