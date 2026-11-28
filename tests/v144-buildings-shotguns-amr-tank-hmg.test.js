import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { WEAPON_DEFS, SHOTGUN_SHELL_TYPES } from '../src/assets/weapon-defs.js?v=150';
import { ATTACHMENT_CATALOG } from '../src/assets/attachment-defs.js?v=150';
import { VoxelWorld } from '../src/world/VoxelWorld.js?v=150';
import {
  VehicleManager,
  classifyWeaponBallistics,
  initVehicleOrdnance,
  PITCH_LIMITS_TANK_CANNON,
  PITCH_LIMITS_TANK_ROOF_HMG
} from '../src/vehicles.js?v=150';
import { PlayerController } from '../src/player/PlayerController.js?v=150';

test('v144 #1: Scaled-Up Enterable Buildings, 6.25m Stories, High-Cube Containers & Roomy Bunkers', () => {
  const scene = new THREE.Scene();
  const world = new VoxelWorld(scene, 'frugis_river');

  // Every multi-story apartment/town building should be scaled up (>= 14x12 voxels = 17.5m x 15m) with 5-voxel (6.25m) stories
  assert.ok(world.buildings.length >= 60, 'Expected map buildings to be constructed');
  const townBld = world.buildings.find((b) => !b.isHybridSkyscraper && b.floors <= 4);
  assert.ok(townBld, 'Expected at least one town/village apartment building');
  assert.equal(townBld.floorHeight, 5, 'Story height must be 5 voxels (6.25m, 5.0m clear ceiling)');
  assert.ok(
    townBld.width >= 14 && townBld.depth >= 12,
    `Small 11x9 town buildings should scale up to >=14x12 voxels (got ${townBld.width}x${townBld.depth})`
  );

  // Verify ground doorway has 4 full voxels (5.0m) of open vertical clearance
  const midGx = townBld.startGx + Math.floor(townBld.width / 2);
  const northDoorGz = townBld.startGz;
  for (let y = 0; y < 4; y++) {
    assert.equal(
      world.getVoxel(midGx, townBld.groundGy + y, northDoorGz),
      null,
      `Ground doorway voxel at y=${y} must be open for comfortable entry`
    );
  }

  // Verify ISO High-Cube shipping containers are 8x4x4 voxels (10m x 5m x 5m) with 2-voxel wide open doors
  assert.ok(world.containers.length >= 4, 'Expected shipping containers');
  const c0 = world.containers[0];
  assert.ok(
    (c0.maxX === 8 && c0.maxZ === 4) || (c0.maxX === 4 && c0.maxZ === 8),
    `Shipping container should be 8x4 voxels (got ${c0.maxX}x${c0.maxZ})`
  );

  // Verify Player-Built Command Bunker & 2-Story Tactical House are spacious (8x8 and 9x9)
  const bunkerRes = world.buildPlayerHouseOrBunker(180, 180, 0, 'BUNKER');
  assert.equal(bunkerRes.ok, true);
  assert.ok(bunkerRes.building.width >= 8 && bunkerRes.building.depth >= 8);

  const houseRes = world.buildPlayerHouseOrBunker(210, 180, 0, 'HOUSE');
  assert.equal(houseRes.ok, true);
  assert.ok(houseRes.building.width >= 9 && houseRes.building.depth >= 9);
  assert.equal(houseRes.building.floors, 2);

  world.dispose();
});

test('v144 #2: Combat Shotguns (M870 Free Pump, M1014 Semi, AA-12 Full-Auto Drum) & 4 Live-Switchable 12G Shells', () => {
  assert.ok(WEAPON_DEFS.rem870 && WEAPON_DEFS.rem870.isShotgun, 'Remington 870 MCS 12G Pump must exist');
  assert.equal(WEAPON_DEFS.rem870.warehousePrice, 0, 'Remington 870 MCS must be $0 unlocked for new players');
  assert.ok(WEAPON_DEFS.m1014 && WEAPON_DEFS.m1014.isShotgun, 'Benelli M1014 Semi-Auto 12G must exist');
  assert.ok(WEAPON_DEFS.aa12 && WEAPON_DEFS.aa12.isShotgun && WEAPON_DEFS.aa12.auto, 'AA-12 Drum Auto-Shotgun must be full-auto');
  assert.equal(WEAPON_DEFS.aa12.clipSize, 20);

  assert.equal(SHOTGUN_SHELL_TYPES.length, 4, 'Must define 4 distinct 12-gauge shell loads');
  const shellIds = SHOTGUN_SHELL_TYPES.map((s) => s.id);
  assert.deepEqual(shellIds, ['buckshot_00', 'flechette_12g', 'slug_ap20', 'frag12_he']);

  // Verify Gunsmith ammoType catalog also exposes Flechette & FRAG-12 HE
  const ammoCatalogIds = ATTACHMENT_CATALOG.ammoType.map((a) => a.id);
  assert.ok(ammoCatalogIds.includes('flechette_12g'));
  assert.ok(ammoCatalogIds.includes('ap20_slug'));
  assert.ok(ammoCatalogIds.includes('frag12_he'));

  // Test live in-field [B] shell cycling via PlayerController prototype
  const fakePlayer = Object.create(PlayerController.prototype);
  Object.assign(fakePlayer, {
    role: 'assault',
    team: 'US',
    ownedWeapons: new Set(['ak15', 'rem870', 'mp443']),
    ownedUpgrades: new Set(['stock', 'std_mag', 'factory', 'std_grip', 'fmj', 'std_vest', 'no_pack']),
    equippedUpgrades: {
      muzzle: 'stock',
      magazine: 'std_mag',
      optic: 'factory',
      grip: 'std_grip',
      ammoType: 'fmj',
      vest: 'std_vest',
      backpack: 'no_pack'
    },
    weaponAttachments: {},
    classLoadoutSelections: { assault: { primary: 'rem870', secondary: 'mp443' } },
    equippedWeaponSkins: {},
    activeShotgunShellId: 'buckshot_00',
    slots: [{ def: { ...WEAPON_DEFS.rem870 }, clip: 7, reserve: 49 }]
  });

  // 1) Default 00 Buckshot -> Cycle [B] -> Flechette Darts (14 steel darts, 1.55x armor pen, bleed)
  const flech = fakePlayer.cycleShotgunShellType();
  assert.equal(flech.id, 'flechette_12g');
  assert.equal(fakePlayer.slots[0].def.pellets, 14);
  assert.equal(fakePlayer.slots[0].def.causesBleed, true);
  assert.ok(fakePlayer.slots[0].def.armorPenMult >= 1.5);

  // 2) Cycle [B] -> AP-20 Solid Slug (1 heavy precision projectile, >115 dmg, >150m range)
  const slug = fakePlayer.cycleShotgunShellType();
  assert.equal(slug.id, 'slug_ap20');
  assert.equal(fakePlayer.slots[0].def.pellets, 1);
  assert.equal(fakePlayer.slots[0].def.isSlugAmmo, true);
  assert.ok(fakePlayer.slots[0].def.damage >= 115);
  assert.ok(fakePlayer.slots[0].def.maxEffectiveRange >= 160);

  // 3) Cycle [B] -> FRAG-12 High-Explosive Fin Slug (2.8m explosive splash warhead)
  const frag12 = fakePlayer.cycleShotgunShellType();
  assert.equal(frag12.id, 'frag12_he');
  assert.equal(fakePlayer.slots[0].def.isFrag12He, true);
  assert.ok(fakePlayer.slots[0].def.explosiveSplash && fakePlayer.slots[0].def.explosiveSplash.radius >= 2.5);

  // 4) Cycle [B] -> Wraps cleanly back to 00 Buckshot (9 pellets on M870)
  const buck = fakePlayer.cycleShotgunShellType();
  assert.equal(buck.id, 'buckshot_00');
  assert.equal(fakePlayer.slots[0].def.pellets, 9);
});

test('v144 #3: Real-Life Anti-Materiel Rifle Concrete Wall Penetration, Engine-Block Seizure & Tank Optics Shatter', () => {
  // 1) Ballistic classification distinguishes .50 BMG & 20mm AMRs from aircraft autocannons
  const b82 = classifyWeaponBallistics('BARRETT .50 BMG');
  const b20 = classifyWeaponBallistics('NTW-20 20MM AMR');
  assert.equal(b82.isAntiMaterielRifle, true);
  assert.equal(b82.is50BmgAmr, true);
  assert.equal(b20.isAntiMaterielRifle, true);
  assert.equal(b20.is20mmAmr, true);
  assert.equal(b20.isAutocannon, false, '20mm AMR must use dedicated AMR doctrine, not jet/IFV autocannon');

  // 2) Multi-wall concrete penetration: NTW-20 20x82mm punches through TWO solid concrete walls to hit enemy behind cover!
  const voxels = new Map();
  const key = (gx, gy, gz) => `${gx},${gy},${gz}`;
  voxels.set(key(4, 1, 0), { key: '4,1,0', gx: 4, gy: 1, gz: 0, type: 'concrete', baseColor: new THREE.Color(0x999999) });
  voxels.set(key(6, 1, 0), { key: '6,1,0', gx: 6, gy: 1, gz: 0, type: 'concrete', baseColor: new THREE.Color(0x999999) });

  const mockWorld = {
    voxels,
    damageVoxel() {},
    spawnBulletImpact() {},
    spawnDebris() {},
    explodeAt() {},
    raycastVoxel(origin, dir, maxDist, _r = 0, ignoreKey = null) {
      const isSet = ignoreKey instanceof Set;
      for (let d = 0.25; d <= maxDist; d += 0.25) {
        const px = origin.x + dir.x * d;
        const py = origin.y + dir.y * d;
        const pz = origin.z + dir.z * d;
        const k = key(Math.round(px / 1.25), Math.floor(py / 1.25), Math.round(pz / 1.25));
        const v = voxels.get(k);
        if (v && (isSet ? !ignoreKey.has(v.key) : v.key !== ignoreKey)) {
          return { voxel: v, distance: d, point: new THREE.Vector3(px, py, pz), normal: new THREE.Vector3(-1, 0, 0) };
        }
      }
      return null;
    }
  };

  const botMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshBasicMaterial());
  const enemyBot = {
    name: 'WALL_HIDING_ENEMY',
    team: 'RU',
    hp: 100,
    dead: false,
    downed: false,
    pos: new THREE.Vector3(12, 1.0, 0),
    yaw: 0,
    mesh: new THREE.Group(),
    hitMeshes: [botMesh]
  };
  botMesh.position.set(12, 1.5, 0);
  botMesh.updateMatrixWorld(true);
  botMesh.userData = { bot: enemyBot, isTorso: true, hitZone: 'thorax' };

  let wallbangXpReason = '';
  const sniperCtrl = Object.create(PlayerController.prototype);
  Object.assign(sniperCtrl, {
    name: 'RECON_PLAYER',
    team: 'US',
    role: 'recon',
    pos: new THREE.Vector3(0, 1.5, 0),
    raycaster: new THREE.Raycaster(),
    world: mockWorld,
    vehicleManager: { vehicles: [] },
    botManager: {
      bots: [enemyBot],
      damageBot(bot, dmg) {
        bot.hp = Math.max(0, bot.hp - dmg);
        bot.dead = bot.hp <= 0;
        return { killed: bot.dead, hitType: 'normal' };
      }
    },
    onAwardXp(_pts, reason) {
      if (String(reason).includes('AMR MASONRY WALLBANG')) wallbangXpReason = reason;
    },
    registerKill: () => ({})
  });

  sniperCtrl.fireBallisticRay(
    new THREE.Vector3(0, 1.5, 0),
    new THREE.Vector3(1, 0, 0),
    WEAPON_DEFS.ntw20.damage,
    WEAPON_DEFS.ntw20.headshotMult,
    WEAPON_DEFS.ntw20.voxelDamage,
    WEAPON_DEFS.ntw20.shortName,
    WEAPON_DEFS.ntw20.armorPenMult,
    WEAPON_DEFS.ntw20,
    1,
    new THREE.Vector3(0, 1.5, 0)
  );
  sniperCtrl.updateBallisticBullets(0.02);
  assert.equal(enemyBot.dead, true, 'NTW-20 20mm AMR must pierce 2 concrete walls and eliminate enemy behind cover');
  assert.ok(wallbangXpReason.includes('2 WALLS PIERCED'), `Expected 2-wall AMR wallbang callout, got "${wallbangXpReason}"`);

  // 3) Doctrinal AMR Vehicle Effects: Humvee Engine-Block Seizure vs MBT 0-Hull-HP + Shattered CITV Optics!
  const vmProto = Object.create(VehicleManager.prototype);
  vmProto.world = { getGroundHeightAt: () => 0, spawnDebris() {}, spawnExplosionVisual() {} };

  const humvee = {
    name: 'GAZ TIGR (.50 CAL)',
    type: 'humvee',
    team: 'RU',
    hp: 800,
    maxHp: 800,
    dead: false,
    yaw: 0, // Facing -Z (forward = (0, 0, -1))
    pos: new THREE.Vector3(0, 0, 0),
    mesh: new THREE.Group(),
    _forceCritRoll: 0.2
  };
  vmProto.damageVehicle(
    humvee,
    165,
    'RECON_PLAYER',
    'US',
    'BARRETT .50 BMG',
    null,
    null,
    new THREE.Vector3(0, 2, -120), // Shooting straight into front engine grill (-Z)
    new THREE.Vector3(0, 1.1, -2.2)
  );
  assert.equal(humvee.lastSubsystemCrit, 'ENGINE_SEIZED', '.50 BMG front hit must seize Humvee/Tigr engine block');
  assert.ok(humvee.amrEngineSeizedTimer >= 6.0 && humvee.subsystems.engine === 'CRITICAL');

  const mbt = {
    name: 'T-90M PRORYV MBT',
    type: 'tank',
    team: 'RU',
    hp: 2100,
    maxHp: 2100,
    dead: false,
    yaw: 0,
    pos: new THREE.Vector3(0, 0, 0),
    mesh: new THREE.Group(),
    _forceCritRoll: 0.25
  };
  vmProto.damageVehicle(
    mbt,
    165,
    'RECON_PLAYER',
    'US',
    'BARRETT .50 BMG',
    null,
    null,
    new THREE.Vector3(0, 2, -150),
    new THREE.Vector3(0, 2.2, -1.5)
  );
  assert.equal(mbt.hp, 2100, '.50 BMG AMR must deal 0 hull HP to heavy MBT frontal composite armor');
  assert.equal(mbt.lastSubsystemCrit, 'OPTICS', '.50 BMG precision hit must shatter Tank CITV / thermal optics');
  assert.ok(mbt.opticsGlitchTimer >= 15.0);
});

test('v144 #4: Separate Tank 120mm Cannon (+20° Max), 7.62mm Coax MG (+20° Max), +62° Roof .50 Cal AA HMG & [4] ATGM', () => {
  assert.ok(PITCH_LIMITS_TANK_CANNON.max <= 0.36, 'Main tank cannon barrel must be mechanically clamped to +20° (0.35 rad)');
  assert.ok(PITCH_LIMITS_TANK_ROOF_HMG.max >= 1.05, 'Roof .50 Cal CROWS / 12.7mm Kord RWS must elevate to +62° (1.08 rad)');

  const tank = {
    id: 'test_abrams',
    name: 'M1A2 ABRAMS MBT (120MM + COAX + .50 CROWS)',
    type: 'tank',
    weaponType: 'tank_cannon',
    rpm: 20,
    coaxRpm: 950,
    team: 'US',
    dead: false,
    pos: new THREE.Vector3(0, 0, 0),
    yaw: 0,
    pitch: 0,
    roll: 0,
    turretYaw: 0,
    turretPitch: 0,
    roofRwsPitch: 0,
    forwardSpeed: 0,
    hp: 2100,
    maxHp: 2100,
    fireCooldown: 0,
    coaxCooldown: 0,
    roofHmgCooldown: 0,
    activeWeaponSlot: 0,
    seatNames: ['DRIVER', 'GUNNER', 'COMMANDER'],
    crewSeats: [null, null, null],
    mesh: new THREE.Group(),
    wheels: []
  };
  initVehicleOrdnance(tank);
  assert.equal(tank.ordnancePools.slot0, 24, '24 main cannon shells');
  assert.equal(tank.ordnancePools.slot1, 1200, '1,200 coaxial 7.62mm rounds');
  assert.equal(tank.ordnancePools.roofHmg, 1200, '1,200 independent roof .50 cal HMG rounds');
  assert.equal(tank.ordnancePools.slot2, 4, '4 gun-launched ATGMs');

  const firedLabels = [];
  const scene = new THREE.Scene();
  const tanker = Object.create(PlayerController.prototype);
  Object.assign(tanker, {
    scene,
    world: {
      era: 'modern',
      projectiles: [],
      getGroundHeightAt: () => 0,
      raycastVoxel: () => null,
      spawnDebris: () => {}
    },
    botManager: { bots: [] },
    vehicleManager: { vehicles: [tank], getVehiclePitchLimits: () => PITCH_LIMITS_TANK_CANNON },
    camera: new THREE.PerspectiveCamera(75, 1.77, 0.1, 3000),
    activeVehicle: tank,
    vehicleSeatIndex: 0,
    vehicleCameraMode: 'COCKPIT_1P',
    isFiring: false,
    isAds: false,
    keys: {},
    pos: new THREE.Vector3(0, 0, 0),
    yaw: 0,
    pitch: 0,
    recoilOffsetPitch: 0,
    team: 'US',
    isModalOpen: () => false,
    addShake: () => {},
    fireBallisticRay: (_orig, _dir, _dmg, _hs, _vox, label) => {
      firedLabels.push(label);
    }
  });
  tank.driver = tanker;
  tank.crewSeats[0] = tanker;

  // Verify 4-slot switching ([1] Cannon, [2] Coax, [3] Roof .50 AA HMG, [4] Gun-ATGM)
  tanker.switchVehicleWeaponSlot(2);
  assert.equal(tank.activeWeaponSlot, 2, 'Slot [3] selects Roof .50 Cal CROWS HMG');
  tanker.switchVehicleWeaponSlot(3);
  assert.equal(tank.activeWeaponSlot, 3, 'Slot [4] selects Gun-Launched ATGM');
  tanker.switchVehicleWeaponSlot(0);
  assert.equal(tank.activeWeaponSlot, 0, 'Slot [1] returns to 120mm Main Cannon');

  // 1) Level aim (0°): [LMB] fires 120mm Cannon AND [SPACE] simultaneously fires 7.62mm Coax MG!
  tanker.pitch = 0.05;
  tanker.isFiring = true;
  tanker.keys['Space'] = true;
  tanker.updateVehicleControl(0.02);
  assert.equal(tank.ordnancePools.slot0, 23, '120mm Main Cannon fired 1 shell at +3° elevation');
  assert.ok(firedLabels.includes('7.62MM COAX MG'), '[SPACE] at level elevation must fire 7.62mm Coax MG');
  assert.equal(tank.ordnancePools.roofHmg, 1200, 'Roof .50 HMG pool untouched at level Coax fire');

  // 2) Aim steep UPWARD (+55° = 0.96 rad) at an overhead Helicopter / Skyscraper Sniper!
  firedLabels.length = 0;
  tank.fireCooldown = 0;
  tank.coaxCooldown = 0;
  tank.roofHmgCooldown = 0;
  tanker.pitch = 0.96; // +55° skyward!
  tanker.isFiring = true;
  tanker.keys['Space'] = true;
  tanker.updateVehicleControl(0.02);

  assert.ok(tank.turretPitch <= 0.351, `Main 120mm cannon barrel must clamp at +20° (got ${tank.turretPitch.toFixed(3)} rad)`);
  assert.ok(tank.roofRwsPitch >= 0.95, `Roof .50 CROWS must elevate to +55° (got ${tank.roofRwsPitch.toFixed(3)} rad)`);
  assert.equal(tank.ordnancePools.slot0, 23, '120mm Cannon must NOT fire through turret roof above +20°');
  assert.ok(
    firedLabels.includes('.50 CAL CROWS RWS'),
    '[SPACE] while aiming > +20° skyward must automatically fire the high-elevation Roof .50 Cal CROWS HMG!'
  );
  assert.ok(tank.ordnancePools.roofHmg < 1200, 'Roof .50 HMG consumes from its dedicated 1,200-round chest');
});
