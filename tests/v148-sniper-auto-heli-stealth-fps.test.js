import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from '../vendor/three.module.js';

import { WEAPON_DEFS } from '../src/assets/weapon-defs.js?v=148';
import { GunsmithMethods } from '../src/player/GunsmithState.js?v=148';
import { CombatMethods } from '../src/player/PlayerCombat.js?v=148';
import { VehicleControlMethods } from '../src/player/VehicleControl.js?v=148';
import { VoxelWorld } from '../src/world/VoxelWorld.js?v=148';
import { VehicleManager } from '../src/vehicles.js?v=148';
import { BotManager } from '../src/bots.js?v=148';
import { hasClearSightline } from '../src/bots/SightlineSystem.js?v=148';

const ROOT = process.cwd();

test('v148 #1: Sniper & semi-auto rifles never dump magazine when holding RMB scope + clicking LMB', () => {
  const pcSrc = fs.readFileSync(path.join(ROOT, 'src/player/PlayerController.js'), 'utf8');
  assert.ok(
    !pcSrc.includes('if (e.button === 0 && !this._rightMouseHeld)'),
    'mouseup(button===0) must ALWAYS clear isFiring even while holding Right-Click scope (_rightMouseHeld)'
  );
  assert.ok(
    pcSrc.includes('if (e.button === 0) {\n        this.isFiring = false;\n        this._semiTriggerArmed = true;') ||
      pcSrc.includes('if (e.button === 0) {\r\n        this.isFiring = false;\r\n        this._semiTriggerArmed = true;'),
    'mouseup(button===0) must clear isFiring and re-arm _semiTriggerArmed without closing RMB scope'
  );

  const cam = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 3000);
  const mockPlayer = Object.assign(
    {},
    GunsmithMethods,
    CombatMethods,
    {
      role: 'recon',
      team: 'US',
      pos: new THREE.Vector3(0, 20, 0),
      yaw: 0,
      pitch: 0,
      hp: 100,
      suppressionLevel: 0,
      zeroDistance: 100,
      isAds: true,
      isFiring: false,
      _semiTriggerArmed: true,
      reloading: false,
      slowReloading: false,
      fireTimer: 0,
      camera: cam,
      world: { era: 'modern' },
      syncCameraTransform() {
        cam.position.copy(this.pos);
        cam.updateMatrixWorld(true);
      },
      getWeaponMuzzleWorldPosition(orig, dir, out) {
        return out.copy(orig).addScaledVector(dir, 0.5);
      },
      fireBallisticRay() {
        this._raysFired = (this._raysFired || 0) + 1;
      },
      ejectBrassCasing() {},
      startReload() {
        this.reloading = true;
      }
    }
  );
  mockPlayer.ensureWarehouseStructures();

  for (const id of ['sv98', 'awm', 'm40a5', 'dvl10', 'm200_intervention', 'barrett_m82', 'gm6_lynx', 'ntw20', 'mk14', 'sr25']) {
    const customDef = mockPlayer.buildCustomizedWeaponDef(WEAPON_DEFS[id], true, id);
    assert.equal(customDef.auto, false, `${id} must strictly remain semi-auto / bolt-action (auto: false)`);

    const slotObj = {
      def: customDef,
      clip: customDef.clipSize,
      reserve: customDef.reserveAmmo,
      looseAmmo: 0
    };
    mockPlayer.currentWeapon = () => slotObj;
    mockPlayer._raysFired = 0;
    mockPlayer.reloading = false;
    mockPlayer.fireTimer = 0;

    // Simulate holding RMB (_rightMouseHeld = true) + pressing LMB (isFiring = true, _semiTriggerArmed = true)
    mockPlayer._rightMouseHeld = true;
    mockPlayer.isFiring = true;
    mockPlayer._semiTriggerArmed = true;
    mockPlayer.tryFireSingle();
    assert.equal(slotObj.clip, customDef.clipSize - 1, `${id} should fire 1 round on LMB press`);
    assert.equal(mockPlayer._semiTriggerArmed, false, `${id} trigger latch must disarm until mouseup`);

    // Even if fireTimer expires while LMB is still held, semi/bolt latch must block any second shot!
    mockPlayer.fireTimer = 0;
    mockPlayer.tryFireSingle();
    assert.equal(slotObj.clip, customDef.clipSize - 1, `${id} must NEVER fire a second shot without releasing LMB`);

    // Releasing LMB re-arms trigger for the next intentional shot
    mockPlayer.isFiring = false;
    mockPlayer._semiTriggerArmed = true;
    mockPlayer.isFiring = true;
    mockPlayer.tryFireSingle();
    assert.equal(slotObj.clip, Math.max(0, customDef.clipSize - 2), `${id} fires cleanly on next LMB click`);
  }
});

test('v148 #2: Helicopter airlift rides & helicopters suppress airplane SHOOT LEAD pippers and reuse zero-alloc lead vectors', () => {
  const wmSrc = fs.readFileSync(path.join(ROOT, 'src/ui/WorldMarkers.js'), 'utf8');
  const hudSrc = fs.readFileSync(path.join(ROOT, 'src/ui/HudRenderer.js'), 'utf8');

  assert.ok(
    wmSrc.includes('!isHeliAircraft') && wmSrc.includes('isPassengerRide'),
    'WorldMarkers must suppress airplane SHOOT LEAD pippers and dogfight arrows for helicopters & passenger rides'
  );
  assert.ok(
    hudSrc.includes('isAirPassengerRide') && hudSrc.includes("this._lastCenterReticleType = 'passenger_ride_clean'"),
    'HudRenderer must hide pilot #aircraft-cockpit-hud and center turret reticle clutter during Alt+R passenger airlift rides'
  );

  // Verify computeAircraftLeadData reuses scratch vectors without allocating new Vector3 objects every frame
  const leadHost = { ...VehicleControlMethods };
  const targetJet = {
    pos: new THREE.Vector3(400, 160, -200),
    velVector: new THREE.Vector3(-75, 2, 30),
    trackedYawRate: 0.08,
    isShotDown: false,
    aiPilotActive: true
  };
  const shooterPos = new THREE.Vector3(0, 140, 0);
  const res1 = leadHost.computeAircraftLeadData(targetJet, shooterPos, 360, 4.5);
  const leadRef1 = res1.leadPos;
  targetJet.pos.x += 12;
  const res2 = leadHost.computeAircraftLeadData(targetJet, shooterPos, 360, 4.5);
  assert.equal(res2, res1, 'computeAircraftLeadData should reuse output object to prevent GC frame drops');
  assert.equal(res2.leadPos, leadRef1, 'computeAircraftLeadData should reuse scratch Vector3 instances');
});

test('v148 #3: Silent rooftop sniper is not shelled on landing, suppressor preserves stealth, and skyscrapers block shells', () => {
  const scene = new THREE.Scene();
  const world = new VoxelWorld(scene, 'frugis_river');
  const vm = new VehicleManager(scene, world);
  const bm = new BotManager(scene, world);
  vm.botManager = bm;

  // Pick a tall NYC Midtown skyscraper in Downtown C (including outer towers!)
  const nycTowers = world.buildings.filter((b) => b.isHybridSkyscraper && b.floors >= 12);
  assert.ok(nycTowers.length >= 8, 'Expected NYC Midtown modular skyscrapers');
  const outerTower =
    nycTowers.reduce((best, b) =>
      Math.hypot(b.centerWx, b.centerWz) > Math.hypot(best.centerWx, best.centerWz) ? b : best
    ) || nycTowers[0];

  // 1) Verify raycastVoxel hits outer NYC tower cores & upper stories (previously missed outside |x|<165, y<96!)
  const highCoreY = outerTower.solidHullBox.maxY - 2.0;
  const rayHit = world.raycastVoxel(
    new THREE.Vector3(outerTower.maxWx + 10, highCoreY, outerTower.maxWz - 2.5),
    new THREE.Vector3(-1, 0, 0),
    30
  );
  assert.ok(
    rayHit && rayHit.isSkyscraperCore,
    `raycastVoxel must hit outer modular skyscraper core at x=${outerTower.centerWx.toFixed(1)}, y=${highCoreY.toFixed(1)}`
  );

  // 2) Verify tank/autocannon shells fired at a skyscraper core detonate on the exterior wall instead of passing through!
  let blastPos = null;
  const projMesh = new THREE.Mesh();
  projMesh.position.set(
    outerTower.maxWx + 8,
    (outerTower.solidHullBox.minY + outerTower.solidHullBox.maxY) * 0.5,
    outerTower.maxWz - 3
  );
  scene.add(projMesh);
  world.projectiles.push({
    mesh: projMesh,
    vel: new THREE.Vector3(-280, 0, 0),
    gravity: 0,
    life: 4.0,
    type: 'autocannon',
    owner: { team: 'RU' }
  });
  for (let step = 0; step < 6 && world.projectiles.length > 0; step++) {
    world.updateProjectiles(0.016, [], (pos) => {
      blastPos = pos.clone();
    });
  }
  assert.equal(world.projectiles.length, 0, 'Autocannon shell must be stopped by modular skyscraper core');
  assert.ok(
    blastPos && blastPos.x >= outerTower.maxWx - 1.2,
    'Shell must detonate on exterior skyscraper wall instead of tunneling inside'
  );

  // 3) Place silent US sniper on top of the skyscraper roof right after disembarking heli (0 shots fired)
  const roofY = outerTower.topGy * 1.25 + 0.15;
  const sniperPlayer = Object.assign(
    {},
    CombatMethods,
    {
      team: 'US',
      squad: 'ALPHA',
      role: 'recon',
      pos: new THREE.Vector3(outerTower.maxWx - 1.2, roofY, outerTower.centerWz),
      yaw: 0,
      pitch: 0,
      dead: false,
      downed: false,
      unsuppressedExposureTimer: 0,
      spottedTimer: 0,
      uavRevealed: false,
      camera: new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 3000),
      syncCameraTransform() {},
      getWeaponMuzzleWorldPosition(o, d, out) {
        return out.copy(o);
      },
      fireBallisticRay() {},
      ejectBrassCasing() {}
    }
  );

  // Place an enemy RU SPAAG AA vehicle on the street within horizontal range & clear elevation angle,
  // and verify it does NOT shell the silent rooftop sniper!
  const ruAa = vm.vehicles.find((v) => v.team === 'RU' && v.type === 'aa');
  assert.ok(ruAa, 'Expected RU SPAAG AA vehicle');
  const streetX = outerTower.maxWx + 65;
  const streetZ = outerTower.centerWz;
  ruAa.pos.set(streetX, world.getGroundHeightAt(streetX, streetZ), streetZ);
  ruAa.npcDriver = {
    id: 'ru_crew_test',
    name: 'CREW',
    team: 'RU',
    dead: false,
    downed: false,
    pos: new THREE.Vector3()
  };
  ruAa._aiTargetScanTimer = 0;
  ruAa._cachedAiTarget = null;
  ruAa.aiFireTimer = 0.01;
  const projBefore = world.projectiles.length;
  vm.update(0.05, sniperPlayer, null, () => {}, () => {}, () => {}, false);
  assert.equal(
    ruAa._cachedAiTarget?.kind,
    null,
    'Enemy AA/armor on the street must NOT omnisciently target a silent sniper who just landed on a skyscraper roof'
  );
  assert.equal(world.projectiles.length, projBefore, 'Silent rooftop sniper must not be shelled on landing');

  // 4) Street bot fighting horizontally (`underFireTimer > 0`) does NOT magically spot silent sniper 80m overhead
  const streetBot = {
    pos: new THREE.Vector3(outerTower.maxWx + 45, world.getGroundHeightAt(outerTower.maxWx + 45, streetZ), streetZ),
    yaw: -Math.PI / 2,
    role: 'ASSAULT',
    underFireTimer: 2.5,
    _squadUnderSniperAlert: false
  };
  const sightCtx = { world, smokeClouds: [], vehicleManager: vm };
  assert.equal(
    hasClearSightline.call(sightCtx, streetBot, sniperPlayer.pos, true, sniperPlayer),
    false,
    'Street infantry in horizontal firefights should not snap 60+ deg upward to spot a silent rooftop sniper'
  );

  // 5) Firing a SUPPRESSED sniper rifle keeps unsuppressedExposureTimer === 0; UNSUPPRESSED exposes position!
  const silentSlot = { def: { ...WEAPON_DEFS.dvl10, silenced: true }, clip: 10, reserve: 40 };
  sniperPlayer.executeFire(silentSlot);
  assert.equal(
    sniperPlayer.unsuppressedExposureTimer || 0,
    0,
    'Suppressed sniper shot must keep rooftop sniper concealed (unsuppressedExposureTimer === 0)'
  );

  const loudSlot = { def: { ...WEAPON_DEFS.sv98, silenced: false }, clip: 10, reserve: 40 };
  sniperPlayer.executeFire(loudSlot);
  assert.ok(
    sniperPlayer.unsuppressedExposureTimer >= 7.0,
    'Unsuppressed sniper shot must expose sniper muzzle signature for realistic counter-fire'
  );

  // 6) Even when exposed, stepping behind the skyscraper / parapet so raycastVoxel is blocked prevents X-ray vehicle targeting!
  sniperPlayer.pos.set(outerTower.minWx - 8, world.getGroundHeightAt(outerTower.minWx - 8, streetZ), streetZ);
  sniperPlayer.pos.y = outerTower.topGy * 1.25 + 0.15;
  sniperPlayer.pos.set(outerTower.minWx + 2.5, roofY, streetZ); // Opposite edge of roof, occluded from +X street by roof parapet/tower!
  ruAa._aiTargetScanTimer = 0;
  ruAa._cachedAiTarget = null;
  ruAa._aiLosCache?.clear();
  vm.update(0.05, sniperPlayer, null, () => {}, () => {}, () => {}, false);
  assert.notEqual(
    ruAa._cachedAiTarget?.kind,
    'player',
    'AI vehicles must require clear raycastVoxel LOS and never aim through solid roof parapets or skyscrapers'
  );

  world.dispose();
});

test('v148 #4: Modular 4F–18F building floors, shared GPU shell cache, 75% terrain tri reduction & 40x scoped frustum culling', () => {
  const scene = new THREE.Scene();
  const world = new VoxelWorld(scene, 'frugis_river');
  const bm = new BotManager(scene, world);
  bm.initBots(125, 'US');

  const modularBlds = world.buildings.filter((b) => b.isHybridSkyscraper);
  assert.ok(
    modularBlds.length >= 50,
    `All 4F–18F modern tall buildings should use modular floor shells (got ${modularBlds.length})`
  );
  assert.ok(
    world.voxels.size < 210000,
    `Modularizing tall building floors should cut total voxel count well below 210k (got ${world.voxels.size})`
  );

  const sharedCoreGeos = new Set(modularBlds.map((b) => b.archMesh?.children?.[0]?.geometry).filter(Boolean));
  assert.ok(
    sharedCoreGeos.size < modularBlds.length * 0.5,
    `Modular building shells must share cached GPU BufferGeometries (${sharedCoreGeos.size} unique for ${modularBlds.length} buildings)`
  );

  // Verify 40x scope (fov = 2.85 deg) frustum-culls off-screen bots instead of rendering all 250+ bots!
  const cam = new THREE.PerspectiveCamera(2.85, 16 / 9, 0.1, 4500);
  cam.position.set(0, 92, 0);
  cam.lookAt(500, 4, 0);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
  const player = {
    team: 'US',
    squad: 'ALPHA',
    pos: new THREE.Vector3(0, 92, 0),
    yaw: -Math.PI / 2,
    pitch: -0.18,
    dead: false,
    downed: false,
    camera: cam,
    activeVehicle: null
  };
  bm.update(0.016, player, () => {}, null, () => {});
  const visibleCount = bm.bots.filter((b) => b.mesh?.visible).length;
  assert.ok(
    visibleCount < bm.bots.length * 0.25,
    `40x scope must frustum-cull off-screen bots (visible: ${visibleCount} of ${bm.bots.length})`
  );

  world.dispose();
});
