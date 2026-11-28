import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { BotManager } from '../src/bots/BotManager.js?v=150';
import { VoxelWorld } from '../src/world/VoxelWorld.js?v=150';

function createTacticalMockWorld() {
  const voxels = new Map();
  const key = (gx, gy, gz) => `${gx},${gy},${gz}`;
  return {
    era: 'modern',
    voxels,
    key,
    hasVoxel(gx, gy, gz) {
      return voxels.has(key(gx, gy, gz));
    },
    getVoxel(gx, gy, gz) {
      return voxels.get(key(gx, gy, gz)) || null;
    },
    worldToGrid(wx, wy, wz) {
      return {
        gx: Math.round(wx / 1.25),
        gy: Math.floor(wy / 1.25),
        gz: Math.round(wz / 1.25)
      };
    },
    getGroundHeightAt() {
      return 0;
    },
    findSafeSpawnPoint(x, z) {
      return new THREE.Vector3(x, 0, z);
    },
    pushOutOfBuildingFootprint(x, z) {
      return { x, z };
    },
    isInsideBuildingOrContainer() {
      return false;
    },
    raycastVoxel(origin, dir, maxDist) {
      const steps = Math.max(4, Math.ceil(maxDist / 0.4));
      const stepLen = maxDist / steps;
      for (let i = 1; i <= steps; i++) {
        const d = i * stepLen;
        const px = origin.x + dir.x * d;
        const py = origin.y + dir.y * d;
        const pz = origin.z + dir.z * d;
        const gx = Math.round(px / 1.25);
        const gy = Math.floor(py / 1.25);
        const gz = Math.round(pz / 1.25);
        const vox = voxels.get(key(gx, gy, gz));
        if (vox) {
          return {
            voxel: vox,
            distance: d,
            point: new THREE.Vector3(px, py, pz)
          };
        }
      }
      return null;
    },
    spawnDebris() {},
    projectiles: [],
    buildings: [
      { minWx: -418, maxWx: -404, minWz: 8, maxWz: 22 }
    ],
    spawns: {
      US_BASE: new THREE.Vector3(-1520, 0, 0),
      RU_BASE: new THREE.Vector3(1520, 0, 0)
    },
    flags: [
      { id: 'A', pos: new THREE.Vector3(-560, 0, -90), owner: 'NEUTRAL', radius: 34, contested: false, captureProgress: 0 },
      { id: 'B', pos: new THREE.Vector3(-280, 0, 85), owner: 'NEUTRAL', radius: 34, contested: false, captureProgress: 0 },
      { id: 'C', pos: new THREE.Vector3(0, 0, 0), owner: 'NEUTRAL', radius: 36, contested: false, captureProgress: 0 },
      { id: 'D', pos: new THREE.Vector3(280, 0, -85), owner: 'NEUTRAL', radius: 34, contested: false, captureProgress: 0 },
      { id: 'E', pos: new THREE.Vector3(560, 0, 90), owner: 'NEUTRAL', radius: 34, contested: false, captureProgress: 0 }
    ]
  };
}

function makeMockPlayer(team = 'US', pos = new THREE.Vector3(-1500, 0, 0)) {
  const cam = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 5000);
  cam.position.copy(pos).add(new THREE.Vector3(0, 1.6, 0));
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return {
    name: 'YOU (PLAYER)',
    team,
    squad: 'ALPHA',
    role: 'recon',
    hp: 100,
    dead: false,
    downed: false,
    prone: false,
    crouching: false,
    pos: pos.clone(),
    vel: new THREE.Vector3(),
    yaw: 0,
    camera: cam,
    keys: {}
  };
}

test('v139: Cohesive 9-Man Squad Wedge Movement (>55m from objective), Pace Sync & Automatic 2IC Leader Succession', () => {
  const scene = new THREE.Scene();
  const world = createTacticalMockWorld();
  const botMgr = new BotManager(scene, world);
  botMgr.initBots(36, null);

  const alphaSectionBots = botMgr.bots.filter(
    (b) => b.team === 'US' && b.squad === 'ALPHA' && Math.floor((b.squadMemberIndex || 0) / 9) === 0
  );
  assert.ok(alphaSectionBots.length >= 3, 'US ALPHA section 0 should have multiple squadmates');

  const leader = alphaSectionBots.find((b) => b.isSquadLeader);
  assert.ok(leader, 'ALPHA should have an initial Squad Leader');

  // Position leader 420m away from Flag C (well beyond the old 55m cutoff!) and scatter squadmates 24m behind
  leader.targetFlagIndex = 2; // Flag C at (0, 0, 0)
  leader.pos.set(-420, 0, 0);
  for (let i = 0; i < alphaSectionBots.length; i++) {
    const m = alphaSectionBots[i];
    m.targetFlagIndex = 2;
    if (m !== leader) {
      m.pos.set(-448 - i * 4, 0, (i % 2 === 0 ? 1 : -1) * 14);
    }
  }

  const player = makeMockPlayer('US');
  botMgr.update(0.1, player, null, null, null, null);

  const sec = botMgr.squadSections.get('US_ALPHA_0');
  assert.ok(sec, 'US_ALPHA_0 tactical section must be registered');
  assert.equal(sec.leader, leader, 'Squad Leader should lead US_ALPHA_0');
  assert.equal(sec.tacticalMode, 'TACTICAL_WEDGE');
  assert.ok(sec.stragglerCount >= 2, 'Leader should detect trailing squadmates (>16m behind)');

  // Verify stragglers sprint faster than the waiting leader so the group tightens up in transit!
  const follower = alphaSectionBots.find((b) => b !== leader);
  assert.ok(
    follower.lastHorizSpeed > leader.lastHorizSpeed,
    `Trailing squadmate (${follower.lastHorizSpeed.toFixed(2)} m/s) must move faster than pacing leader (${leader.lastHorizSpeed.toFixed(2)} m/s)`
  );

  // Eliminate Squad Leader -> verify automatic Acting Leader (2IC) succession on the very next tick!
  leader.dead = true;
  leader.respawnTimer = 15;
  botMgr.update(0.1, player, null, null, null, null);
  assert.ok(sec.leader && sec.leader !== leader && !sec.leader.dead, '2IC must immediately succeed fallen Squad Leader');
});

test('v139: Two-Fireteam Synchronized Bounding Overwatch & Alternating Base-of-Fire Leapfrog', () => {
  const scene = new THREE.Scene();
  const world = createTacticalMockWorld();
  const botMgr = new BotManager(scene, world);
  botMgr.initBots(48, null);

  const usAlpha = botMgr.bots.filter(
    (b) => b.team === 'US' && b.squad === 'ALPHA' && Math.floor((b.squadMemberIndex || 0) / 9) === 0
  );
  const ruEnemy = botMgr.bots.find((b) => b.team === 'RU');
  ruEnemy.pos.set(-355, 0, 4);
  for (let i = 0; i < usAlpha.length; i++) {
    usAlpha[i].targetFlagIndex = 2;
    usAlpha[i].pos.set(-400, 0, (i - 2) * 3.5);
    usAlpha[i]._targetScanTimer = 0;
  }

  const player = makeMockPlayer('US');
  botMgr.update(0.1, player, null, null, null, null);

  const sec = botMgr.squadSections.get('US_ALPHA_0');
  assert.ok(sec.contactTimer > 0, 'Squad section must share active enemy contact');
  assert.equal(sec.tacticalMode, 'BOUNDING_OVERWATCH');

  const phaseA = sec.activeBoundFireteam;
  const stationaryPhaseA = usAlpha.filter((b) => b.lastHorizSpeed === 0 && (b.isCrouching || b.isProne));
  const boundingPhaseA = usAlpha.filter((b) => b.lastHorizSpeed > 4.0);
  assert.ok(stationaryPhaseA.length >= 1, 'Overwatch fireteam must drop to knee/prone base-of-fire');
  assert.ok(boundingPhaseA.length >= 1, 'Assault fireteam must bound forward simultaneously');

  // Advance past bound timer so Fireteam A & Fireteam B swap roles!
  sec.boundTimer = 0.02;
  botMgr.update(0.1, player, null, null, null, null);
  assert.notEqual(sec.activeBoundFireteam, phaseA, 'Fireteams must alternate bounding vs overwatch phases');
});

test('v139: 1,000m Rooftop Sniper Casualty Triggers Squad COVER_SCRAMBLE, 3D M18 Smoke Screen & Leeward Cover Sprint', () => {
  const scene = new THREE.Scene();
  const world = createTacticalMockWorld();
  const botMgr = new BotManager(scene, world);
  botMgr.initBots(36, null);

  const ruSquad = botMgr.bots.filter(
    (b) => b.team === 'RU' && b.squad === 'ALPHA' && Math.floor((b.squadMemberIndex || 0) / 9) === 0
  );
  assert.ok(ruSquad.length >= 3);
  for (let i = 0; i < ruSquad.length; i++) {
    ruSquad[i].pos.set(-398, 0, 14 + i * 2.5);
  }

  // Player sniper perched 1,000m away & 75m high on a Downtown skyscraper roof!
  const sniperPlayer = makeMockPlayer('US', new THREE.Vector3(602, 75, 14));
  botMgr.player = sniperPlayer;

  const victim = ruSquad[0];
  botMgr.damageBot(
    victim,
    185,
    sniperPlayer.name,
    'US',
    'M82A1 .50 BMG',
    true,
    null,
    null,
    { origin: sniperPlayer.pos, hitZone: 'head' }
  );

  const sec = botMgr.squadSections.get('RU_ALPHA_0');
  assert.ok(sec, 'RU_ALPHA_0 section should exist');
  assert.ok(sec.underSniperAlertTimer >= 7.5, '1,000m rooftop sniper kill must trigger squad sniper alert');
  assert.equal(sec.tacticalMode, 'COVER_SCRAMBLE');
  assert.ok(sec.coverAnchor, 'Squad must compute a shared leeward building cover rally point');
  assert.ok(botMgr.smokeClouds.length >= 1, 'Squadmate must pop a 3D M18 smoke screen to conceal the group');

  botMgr.update(0.1, sniperPlayer, null, null, null, null);
  const survivors = ruSquad.filter((b) => !b.dead && !b.downed);
  const reactingGroup = survivors.filter(
    (b) =>
      (b.lastHorizSpeed || 0) >= 6.0 ||
      Math.hypot(b.velX || 0, b.velZ || 0) >= 0.5 ||
      b.isProne ||
      b.isCrouching ||
      Boolean(b.healTarget || b.rescueTarget)
  );
  assert.equal(
    reactingGroup.length,
    survivors.length,
    'Every surviving squadmate must sprint to cover, perform combat triage under smoke, or drop prone/kneeling to counter-suppress'
  );
});

test('v139: Stance-Aware Rooftop Sightlines, Unalerted Street Gaze Cone & Solid Downtown Skyscraper Parapets', () => {
  const scene = new THREE.Scene();
  const mockWorld = createTacticalMockWorld();
  const botMgr = new BotManager(scene, mockWorld);

  // Build a 1.25m rooftop parapet wall at gx = 0, gy = 16 (y = 20.0m..21.25m), gz = -3..3
  // Roof slab is gy = 15 (top surface y = 20.0m)
  for (let gz = -3; gz <= 3; gz++) {
    mockWorld.voxels.set(mockWorld.key(0, 15, gz), { gx: 0, gy: 15, gz, type: 'concrete' });
    mockWorld.voxels.set(mockWorld.key(0, 16, gz), { gx: 0, gy: 16, gz, type: 'darkConcrete' });
  }

  // Street-level bot at x = -28m, y = 0m looking East (+X, yaw = PI/2) toward rooftop sniper at x = +1.5m, y = 20.0m
  const streetBot = {
    pos: new THREE.Vector3(-28, 0, 0),
    yaw: Math.PI / 2,
    role: 'ASSAULT',
    flinchTimer: 0,
    suppressionLevel: 0,
    underFireTimer: 0,
    _squadUnderSniperAlert: false
  };
  const sniperTarget = {
    pos: new THREE.Vector3(1.5, 20.0, 0),
    prone: false,
    crouching: false
  };

  // 1) Unalerted street soldier does NOT passively stare >35° straight up at quiet rooftop targets
  assert.equal(
    botMgr.hasClearSightline(streetBot, sniperTarget.pos, true, sniperTarget),
    false,
    'Unalerted street patrol bot must not passively spot a quiet sniper high overhead (>25° elevation)'
  );

  // 2) Once alerted by gunfire/sniper alert, standing sniper behind parapet IS visible over/near edge,
  //    EXCEPT when sniper drops PRONE ([Z], +0.38m) behind the solid 1.25m parapet!
  streetBot._squadUnderSniperAlert = true;
  sniperTarget.prone = true;
  assert.equal(
    botMgr.hasClearSightline(streetBot, sniperTarget.pos, true, sniperTarget),
    false,
    'Prone sniper (+0.38m) behind a solid 1.25m rooftop parapet must be 100% occluded from street fire'
  );

  // 3) Verify real VoxelWorld Downtown skyscrapers build continuous non-gapped perimeter parapets
  const realScene = new THREE.Scene();
  const vWorld = new VoxelWorld(realScene, 'frugis_river');
  const tallTower = vWorld.buildings.find((b) => b.isHybridSkyscraper);
  assert.ok(tallTower, 'Downtown C should have hybrid skyscrapers');
  const topGy = tallTower.groundGy + tallTower.floors * (tallTower.floorHeight || 4);
  // South edge (z = startGz + depth - 1) is outside stairwell headhouse and must have 100% solid parapet blocks!
  const southGz = tallTower.startGz + tallTower.depth - 1;
  for (let gx = tallTower.startGx; gx < tallTower.startGx + tallTower.width; gx++) {
    assert.equal(
      vWorld.hasVoxel(gx, topGy, southGz),
      true,
      `Skyscraper south roof edge at gx=${gx}, gy=${topGy}, gz=${southGz} must have continuous solid parapet cover`
    );
  }
});
