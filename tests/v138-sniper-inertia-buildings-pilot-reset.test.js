import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { WEAPON_DEFS } from '../src/assets/weapon-defs.js?v=142';
import { ATTACHMENT_CATALOG } from '../src/assets/attachment-defs.js?v=142';
import { VoxelWorld } from '../src/world/VoxelWorld.js?v=142';
import { VehicleManager } from '../src/vehicles.js?v=142';
import {
  evaluateMarksmanShot,
  resolveUnitPlaystyleTitle
} from '../src/player/MarksmanSystem.js?v=142';
import { HudRenderer } from '../src/ui/HudRenderer.js?v=142';
import { CommandPanel } from '../src/ui/CommandPanel.js?v=142';
import { MinimapRenderer } from '../src/ui/MinimapRenderer.js?v=142';
import { PlayerController } from '../src/player/PlayerController.js?v=142';

function makeMockElement(id = '') {
  const classes = new Set();
  return {
    id,
    style: {},
    dataset: {},
    children: [],
    isConnected: true,
    offsetParent: {},
    width: 760,
    height: 275,
    textContent: '',
    innerHTML: '',
    classList: {
      add: (...c) => c.forEach((x) => classes.add(x)),
      remove: (...c) => c.forEach((x) => classes.delete(x)),
      contains: (x) => classes.has(x),
      toggle: (x, force) => {
        const next = typeof force === 'boolean' ? force : !classes.has(x);
        if (next) classes.add(x);
        else classes.delete(x);
        return next;
      }
    },
    appendChild(ch) {
      this.children.push(ch);
      return ch;
    },
    prepend(ch) {
      this.children.unshift(ch);
      return ch;
    },
    removeChild(ch) {
      const idx = this.children.indexOf(ch);
      if (idx >= 0) this.children.splice(idx, 1);
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    addEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 760, height: 275 }),
    getContext: () => ({
      fillRect() {},
      clearRect() {},
      strokeRect() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      arc() {},
      fill() {},
      stroke() {},
      fillText() {},
      save() {},
      restore() {},
      setLineDash() {}
    })
  };
}

test('v138: Sniper & Anti-Materiel Arsenal, 13x-40x Optics, Marksman Shot Card Variants & Playstyle Titles', () => {
  for (const id of ['m40a5', 'dvl10', 'm200_intervention', 'barrett_m82', 'gm6_lynx', 'ntw20']) {
    assert.ok(WEAPON_DEFS[id], `Missing weapon def ${id}`);
  }
  assert.ok(WEAPON_DEFS.ntw20.damage >= 165, 'NTW-20 20mm AMR should deal devastating damage');
  assert.ok(WEAPON_DEFS.ntw20.voxelDamage >= 200, 'NTW-20 20mm AMR should punch hard into cover');

  const opticTypes = (ATTACHMENT_CATALOG.optic || []).map((o) => o.opticType).filter(Boolean);
  for (const ot of ['raptor13x', 'sniper16x', 'sniper27x', 'sniper40x']) {
    assert.ok(opticTypes.includes(ot), `Missing high-mag opticType ${ot}`);
  }

  // Smoke ray check + Smoke Piercer, Medic, Double-Shot, Friendly Fire & Headshot cards
  if (typeof PlayerController.prototype._checkShotSmokeOcclusion === 'function') {
    const fakePlayer = Object.create(PlayerController.prototype);
    fakePlayer.botManager = {
      smokeClouds: [{ pos: new THREE.Vector3(50, 2, 0), radius: 9.0, timer: 10 }]
    };
    const smokeRes = fakePlayer._checkShotSmokeOcclusion(
      new THREE.Vector3(0, 2, 0),
      new THREE.Vector3(120, 2, 0)
    );
    assert.equal(smokeRes.throughSmoke, true);
  }

  const medicHit = evaluateMarksmanShot({
    wepDef: WEAPON_DEFS.m200_intervention,
    distanceM: 420,
    hitZone: 'thorax',
    damageDealt: 135,
    isKill: true,
    oneShotKill: true,
    targetRole: 'MEDIC'
  });
  assert.equal(medicHit.cardVariant, 'medic_sniped');

  const smokeHit = evaluateMarksmanShot({
    wepDef: WEAPON_DEFS.barrett_m82,
    distanceM: 310,
    hitZone: 'thorax',
    damageDealt: 148,
    isKill: true,
    throughSmoke: true
  });
  assert.equal(smokeHit.cardVariant, 'smoke_piercer');

  const doubleHit = evaluateMarksmanShot({
    wepDef: WEAPON_DEFS.ntw20,
    distanceM: 280,
    hitZone: 'thorax',
    damageDealt: 195,
    isKill: true,
    collateralCount: 2
  });
  assert.equal(doubleHit.cardVariant, 'double_shot');

  const ffHit = evaluateMarksmanShot({
    wepDef: WEAPON_DEFS.m40a5,
    distanceM: 190,
    hitZone: 'leftArm',
    damageDealt: 45,
    isFriendly: true
  });
  assert.equal(ffHit.cardVariant, 'friendly_fire');

  const sharpshooterTitle = resolveUnitPlaystyleTitle({
    role: 'RECON',
    kills: 14,
    deaths: 2,
    captures: 1
  });
  assert.equal(sharpshooterTitle.id, 'sharpshooter');

  const acePilotTitle = resolveUnitPlaystyleTitle({
    role: 'PILOT',
    kills: 12,
    planesDestroyed: 4,
    pilotMissionsCompleted: 2
  });
  assert.equal(acePilotTitle.id, 'ace_pilot');
});

test('v138: Scope Viewport Freeze Fix (HudRenderer THREE import & smart ballistic pipper)', () => {
  const prevDoc = globalThis.document;
  if (!globalThis.document) {
    globalThis.document = {
      body: makeMockElement('body'),
      getElementById: () => null,
      createElement: () => makeMockElement()
    };
  }
  const lrfEl = makeMockElement('scope-lrf-readout');
  const pipperEl = makeMockElement('scope-ballistic-pipper');
  const scopeOverlayEl = makeMockElement('scope-overlay');
  const opticFrameEl = makeMockElement('optic-frame');
  const opticLabelEl = makeMockElement('optic-label');

  const elCache = new Map([
    ['scope-lrf-readout', lrfEl],
    ['scope-ballistic-pipper', pipperEl]
  ]);
  // Directly invoke the HudRenderer scope update path with a smart-pipper sniper rifle (Barrett M82 + 27x)
  const baseHud = Object.create(HudRenderer);
  baseHud.scopeOverlayEl = scopeOverlayEl;
  baseHud.opticFrameEl = opticFrameEl;
  baseHud.opticLabelEl = opticLabelEl;
  baseHud.scoreboardEl = makeMockElement('sb');
  baseHud.scoreboardEl.classList.add('hidden');
  baseHud.downedOverlayEl = makeMockElement('downed');
  baseHud.downedOverlayEl.classList.add('hidden');
  baseHud.deployScreenEl = makeMockElement('deploy');
  baseHud.deployScreenEl.classList.add('hidden');
  baseHud.victoryScreenEl = makeMockElement('victory');
  baseHud.victoryScreenEl.classList.add('hidden');
  baseHud.el = (id) => {
    if (!elCache.has(id)) elCache.set(id, makeMockElement(id));
    return elCache.get(id);
  };
  const fakeHud = new Proxy(baseHud, {
    get(target, prop, receiver) {
      if (prop in target) return Reflect.get(target, prop, receiver);
      if (typeof prop === 'string' && prop.endsWith('El')) {
        const m = makeMockElement(prop);
        target[prop] = m;
        return m;
      }
      if (typeof prop === 'string' && (prop.startsWith('update') || prop.startsWith('draw') || prop.startsWith('render'))) {
        return () => {};
      }
      return undefined;
    }
  });
  fakeHud.world = {
    era: 'modern',
    flags: [],
    spawns: { US_BASE: new THREE.Vector3(-1520, 0, 0), RU_BASE: new THREE.Vector3(1520, 0, 0) },
    ammoCrates: [],
    buildingKeys: [],
    activeLaserDesignations: { US: null, RU: null }
  };
  fakeHud.botManager = {
    bots: [],
    baseState: { US: { contested: false, defenders: 4 }, RU: { contested: false, defenders: 4 } },
    findNearestDownedFriendly: () => null
  };
  fakeHud.vehicleManager = { vehicles: [], findNearestEnterable: () => null };
  fakeHud.player = {
    dead: false,
    downed: false,
    team: 'US',
    pos: new THREE.Vector3(0, 2, 0),
    yaw: 0,
    pitch: 0,
    hp: 100,
    armor: 50,
    maxArmor: 50,
    isAds: true,
    adsAmount: 1.0,
    opticZoomIndex: 2,
    zeroDistance: 300,
    recoilKickZ: 0,
    camera: { fov: 2.8 },
    slots: [],
    currentWeapon: () => ({
      def: {
        ...WEAPON_DEFS.barrett_m82,
        opticType: 'sniper27x',
        zoomLevels: [9, 18, 27],
        zoomFovs: [8.4, 4.2, 2.8],
        hasSmartPipper: true,
        hasRaptarLrf: true
      },
      clip: 10,
      reserve: 30,
      mags: [10, 10, 10]
    }),
    getActiveOpticType: () => 'sniper27x',
    sampleLaserRangefinder: () => ({
      distM: 640,
      isEnemy: true,
      targetSpeedMps: 45,
      targetLabel: 'SU-57 JET',
      solution: {
        rawGravityDropM: 4.85,
        holdoverM: 2.15,
        leadMeters: 32.4,
        recommendedZeroM: 600
      }
    })
  };
  // Stub bottom-half HUD sub-renderers not under test
  fakeHud.updateInfantryBottomHud = () => {};
  fakeHud.updateDamageIndicators = () => {};
  fakeHud.updateWorldMarkers = () => {};
  fakeHud.drawMinimap = () => {};
  fakeHud.updateCommandOrderHud = () => {};
  fakeHud.updatePilotTaskingHud = () => {};

  // Verify scoping in on an airborne plane with smart pipper NEVER throws ReferenceError: THREE is not defined!
  try {
    assert.doesNotThrow(() => {
      fakeHud.update(0.016, 800, 800, 850, 0.016);
    });
    assert.equal(pipperEl.classList.contains('hidden'), false);
    assert.ok(pipperEl.style.top.endsWith('%'), 'Ballistic pipper top offset should be computed cleanly');
  } finally {
    globalThis.document = prevDoc;
  }
});

test('v138: Hybrid Blocky 3D Downtown Skyscrapers, Greedy Chunk Merging, Walkable Stairs, Steel Beams & Round Reset', () => {
  const scene = new THREE.Scene();
  const world = new VoxelWorld(scene, 'frugis_river');

  // Verify Downtown C skyscrapers use Hybrid 3D Blocky Core (`isHybridSkyscraper` + `archMesh` + `solidHullBox`)
  const skyscrapers = world.buildings.filter((b) => b.isHybridSkyscraper);
  assert.ok(skyscrapers.length >= 10, 'Downtown C should build hybrid 3D blocky skyscrapers');
  const tallTower = skyscrapers[0];
  assert.ok(tallTower.archMesh, 'Hybrid skyscraper should have a 3D blocky architectural shell');
  assert.ok(tallTower.solidHullBox && tallTower.solidHullBox.active, 'Hybrid skyscraper should have an active O(1) solid hull box');
  assert.ok(
    tallTower.blueprintBlocks.length < 6000,
    `Hybrid 18F skyscraper should use <6000 voxels instead of >13000 (actual: ${tallTower.blueprintBlocks.length})`
  );

  // Verify O(1) raycastVoxel hits the solid 3D middle core shaft on exterior, while stairwell shaft stays open
  const midCoreY = (tallTower.solidHullBox.minY + tallTower.solidHullBox.maxY) * 0.5;
  const rayOrig = new THREE.Vector3(tallTower.maxWx + 8, midCoreY, tallTower.maxWz - 3);
  const rayDir = new THREE.Vector3(-1, 0, 0);
  const coreHit = world.raycastVoxel(rayOrig, rayDir, 30);
  assert.ok(coreHit && coreHit.isSkyscraperCore, 'Bullets/LOS should hit the solid 3D skyscraper core');

  // Verify walkable 'wood' U-turn staircase exists on every story up to the roof!
  for (let f = 0; f < tallTower.floors; f++) {
    const fBaseGy = tallTower.groundGy + f * 4;
    const step1 = world.getVoxel(tallTower.startGx + 1, fBaseGy, tallTower.startGz + 3);
    const step4 = world.getVoxel(tallTower.startGx + 3, fBaseGy + 3, tallTower.startGz + 3);
    assert.equal(step1?.type, 'wood', `Missing stair Flight A step on floor ${f + 1}`);
    assert.equal(step4?.type, 'wood', `Missing stair Flight B top step on floor ${f + 1}`);
  }

  // Verify steelBeam resists small arms / autocannons (< 160) and breaks under heavy demolition (>= 160)
  const cornerSteel = world.getVoxel(tallTower.startGx, tallTower.groundGy, tallTower.startGz);
  assert.equal(cornerSteel?.type, 'steelBeam');
  const preHp = cornerSteel.hp;
  assert.equal(world.damageVoxel(cornerSteel.gx, cornerSteel.gy, cornerSteel.gz, 95), false);
  assert.equal(cornerSteel.hp, preHp, 'steelBeam must be immune to small arms / light autocannons (< 160)');
  world.damageVoxel(cornerSteel.gx, cornerSteel.gy, cornerSteel.gz, 800, null, true);
  assert.equal(world.getVoxel(cornerSteel.gx, cornerSteel.gy, cornerSteel.gz), null);

  // Trigger collapse on tallTower & spawn a fake loot pack, then verify 100% Round Reset restores everything!
  world.triggerBuildingCollapse(tallTower, null, 0);
  tallTower.collapsed = true;
  assert.equal(tallTower.archMesh.visible, false);
  world.lootPacks.push({ id: 'test_loot', mesh: new THREE.Group() });
  scene.add(world.lootPacks[0].mesh);

  world.resetWorldForNewRound();
  assert.equal(world.lootPacks.length, 0, 'Round reset must clear all dropped enemy loot packs');
  const restoredSkyscrapers = world.buildings.filter((b) => b.isHybridSkyscraper && !b.collapsed);
  assert.equal(restoredSkyscrapers.length, skyscrapers.length, 'Round reset must restore all collapsed skyscrapers');
  assert.equal(restoredSkyscrapers[0].archMesh.visible, true);

  // Verify VehicleManager.resetForNewRound restores THREE.Vector3 spawnPos vehicles & removes temporary ride helis
  const vm = new VehicleManager(scene, world);
  const baseHumvee = vm.vehicles.find((v) => v.type === 'humvee');
  const origPos = baseHumvee.spawnPos.clone();
  baseHumvee.pos.set(123, 5, -456);
  baseHumvee.hp = 120;
  vm.spawnVehicle({
    id: 'ride_heli_us_temp',
    isTemporaryRide: true,
    name: 'TEMP RIDE HELI',
    type: 'plane',
    aircraftRole: 'heli_transport',
    isHelicopter: true,
    isAircraft: true,
    team: 'US',
    spawnPos: new THREE.Vector3(0, 50, 0),
    spawnYaw: 0,
    maxHp: 900,
    speed: 68,
    patrolPoints: []
  });
  vm.resetForNewRound();
  assert.equal(vm.vehicles.some((v) => v.id === 'ride_heli_us_temp'), false, 'Temp ride vehicles must be purged on round reset');
  assert.ok(baseHumvee.pos.distanceTo(origPos) < 2.5, 'Base Humvee with Vector3 spawnPos must return to HQ on round reset');
  assert.equal(baseHumvee.hp, baseHumvee.maxHp);

  world.dispose();
});

test('v138: Fast Helicopter Return from Objective C Rooftop, 1-Press Alt+R Zoomable Ride Map & FPS-Independent Humvee HMG', () => {
  const scene = new THREE.Scene();
  const world = new VoxelWorld(scene, 'frugis_river');
  const vm = new VehicleManager(scene, world);

  // 1. Heli return speed from 75m C rooftop back to US HQ Base (-1520, 0) must cruise fast (> 60 m/s), never 4.0 m/s!
  const heli = vm.vehicles.find((v) => v.team === 'US' && v.aircraftRole === 'heli_transport');
  assert.ok(heli, 'Expected US transport helicopter');
  const mockPlayer = {
    dead: false,
    downed: false,
    team: 'US',
    pos: new THREE.Vector3(0, 75, 0),
    activeVehicle: heli,
    preferredRideMode: 'heli'
  };
  heli.driver = mockPlayer;
  heli.pos.set(0, 75, 0);
  heli.rideTask = {
    active: true,
    transportMode: 'heli',
    phase: 'EN_ROUTE_TO_DEST',
    pickupPos: new THREE.Vector3(0, 75, 0),
    liftoffClearY: 90,
    destPos: new THREE.Vector3(-1520, 2, 0),
    destLabel: 'US MAIN BASE',
    preferRoof: false,
    waitTimer: 30
  };
  for (let i = 0; i < 120; i++) {
    vm.stepAiHeliRide(heli, 0.05, mockPlayer);
  }
  assert.ok(
    heli.forwardSpeed > 60,
    `Heli returning from C roof to HQ should cruise >60 m/s, got ${heli.forwardSpeed.toFixed(1)} m/s`
  );

  // 2. 1-Press Alt+R opens zoomable ride map at 4.6x C-rooftop zoom when at HQ Base
  let openedModal = false;
  const fakeCmdPanel = Object.assign(Object.create(CommandPanel), MinimapRenderer, {
    deployScreenEl: { classList: { contains: () => true } },
    victoryScreenEl: { classList: { contains: () => true } },
    player: { dead: false, pos: new THREE.Vector3(-1520, 2, 0), activePing: null, preferredRideMode: 'heli' },
    world,
    vehicleManager: vm,
    botManager: { bots: [], commanderOrders: {} },
    isCommandModalVisible: () => false,
    el: () => null,
    toggleCommandModal() {
      openedModal = true;
    }
  });
  const shortcutRes = fakeCmdPanel.handleRideShortcut();
  assert.equal(shortcutRes, 'OPENED_RIDE_MAP');
  assert.equal(openedModal, true);
  assert.equal(fakeCmdPanel.mapClickMode, 'RIDE');
  assert.ok(fakeCmdPanel._cmdMapZoom >= 4.5, 'At HQ Base, Alt+R map should auto-zoom onto Downtown C rooftops');

  // 3. FPS-Independent Humvee .50 Cal HMG Fire Rate: 22 FPS vs 120 FPS must fire nearly identical round counts!
  const runHumveeBurst = (dt, durationSec) => {
    const humvee = {
      id: 'test_humvee',
      name: 'M1151 HUMVEE',
      type: 'humvee',
      weaponType: 'hmg',
      rpm: 550,
      team: 'US',
      dead: false,
      isEmplacement: true,
      pos: new THREE.Vector3(0, 2, 0),
      yaw: 0,
      pitch: 0,
      roll: 0,
      turretYaw: 0,
      turretPitch: 0,
      forwardSpeed: 0,
      hp: 800,
      maxHp: 800,
      fireCooldown: 0,
      coaxCooldown: 0,
      mesh: new THREE.Group(),
      wheels: []
    };
    let shots = 0;
    const fakeCtrl = Object.create(PlayerController.prototype);
    Object.assign(fakeCtrl, {
      scene,
      world,
      botManager: { bots: [] },
      vehicleManager: { vehicles: [humvee] },
      camera: new THREE.PerspectiveCamera(75, 1.77, 0.1, 3000),
      activeVehicle: humvee,
      vehicleSeatIndex: 0,
      vehicleCameraMode: 'COCKPIT_1P',
      isFiring: true,
      isAds: false,
      keys: {},
      pos: new THREE.Vector3(0, 2, 0),
      yaw: 0,
      pitch: 0,
      recoilOffsetPitch: 0,
      team: 'US',
      isModalOpen: () => false,
      addShake: () => {},
      fireBallisticRay: () => {
        shots++;
      }
    });
    humvee.driver = fakeCtrl;
    const steps = Math.round(durationSec / dt);
    for (let s = 0; s < steps; s++) {
      humvee.fireCooldown = Math.max(-0.18, (humvee.fireCooldown || 0) - dt);
      fakeCtrl.updateVehicleControl(dt);
    }
    return shots;
  };

  const shotsAt22Fps = runHumveeBurst(1 / 22, 2.0);
  const shotsAt120Fps = runHumveeBurst(1 / 120, 2.0);
  assert.ok(
    Math.abs(shotsAt22Fps - shotsAt120Fps) <= 1,
    `Humvee HMG shots over 2.0s should be FPS-independent (22 FPS: ${shotsAt22Fps}, 120 FPS: ${shotsAt120Fps})`
  );

  world.dispose();
});
