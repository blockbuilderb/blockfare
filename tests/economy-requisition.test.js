import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { ECONOMY, VEHICLE_STATS } from '../src/config.js?v=120';
import { GunsmithMethods } from '../src/player/GunsmithState.js?v=120';
import { VehicleControlMethods } from '../src/player/VehicleControl.js?v=120';
import { VehicleManager, classifyWeaponBallistics } from '../src/vehicles.js?v=120';
import { BotManager, evaluateCatastrophicKill } from '../src/bots.js?v=120';
import { NetworkManager } from '../src/network.js?v=120';

function createEconomyPlayerHarness(overrides = {}) {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k)
  };

  const player = {
    name: 'VIPER_1',
    team: 'US',
    role: 'engineer',
    squadDoctrineEnabled: true,
    dead: false,
    downed: false,
    pos: new THREE.Vector3(0, 0, 0),
    yaw: 0,
    pitch: 0,
    camera: new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 6000),
    viewModelGroup: new THREE.Group(),
    activeVehicle: null,
    world: { era: 'modern', getGroundHeightAt: () => 0 },
    vehicleManager: { getTeamKills: () => 30, isB2UnlockedForTeam: () => true },
    applyCustomizationsToActiveLoadout: () => {},
    syncCameraTransform: () => {},
    onAwardXp: () => {},
    ...overrides
  };
  Object.assign(player, GunsmithMethods, VehicleControlMethods);
  player.ensureWarehouseStructures();
  return { player, storage };
}

describe('3-Pillar Economy: Dual-Wallet Separation, Tarkov Surcharge & $0 Free HQ Pool Boarding', () => {
  test('migrates legacy v4 matchCash into Armory Bank, starts at ⚡$50 Match Cash, and prices field-drop Dirt Bike at ⚡$100', () => {
    const { player, storage } = createEconomyPlayerHarness();
    storage.set(
      'bb_warehouse_state_v4',
      JSON.stringify({
        warehouseCash: 90000,
        matchCash: 6662,
        ownedWeapons: ['m4a1']
      })
    );

    player.loadGunsmithState();
    assert.equal(player.matchCash, ECONOMY.STARTING_MATCH_CASH);
    assert.equal(player.matchCash, 50);
    assert.equal(player.warehouseCash, 96612);

    assert.equal(ECONOMY.VEHICLE_BASE_COST.bike, 100);
    assert.equal(ECONOMY.VEHICLE_BASE_COST.atv, 150);
    const bikeFail = player.payForVehicleRequisition('bike');
    assert.equal(bikeFail.ok, false);
    assert.equal(bikeFail.reason, 'INSUFFICIENT_MATCH_CASH');
    assert.equal(bikeFail.shortBy, 50);
    assert.equal(player.warehouseCash, 96612, 'Armory Bank is untouched by failed field requisition');

    const buyFlir = player.buyOrEquipVehicleUpgrade('armorSensor', 'citv_flir_pod');
    assert.equal(buyFlir.ok, true);
    assert.equal(player.warehouseCash, 96612 - 800);
    assert.equal(player.matchCash, 50);
  });

  test('applies Tarkov modded vehicle surcharge when modded and auto-falls back to Stock ($0 surcharge) when tight on Match Cash', () => {
    const { player } = createEconomyPlayerHarness({ role: 'armor' });
    player.warehouseCash = 10000;
    player.matchCash = 50;

    player.buyOrEquipVehicleUpgrade('armorSensor', 'citv_flir_pod');
    const moddedQuote = player.getVehicleRequisitionQuote('tank');
    assert.equal(moddedQuote.isModded, true);
    assert.equal(moddedQuote.baseCost, 1400);
    assert.equal(moddedQuote.modSurcharge, 150);
    assert.equal(moddedQuote.totalCost, 1550);

    player.addCash(1370, 'CAPTURES & AT KILLS', false);
    assert.equal(player.matchCash, 1420);

    const stockFallbackPay = player.payForVehicleRequisition('tank');
    assert.equal(stockFallbackPay.ok, true);
    assert.equal(stockFallbackPay.cost, 1400);
    assert.equal(stockFallbackPay.useStock, true);
    assert.equal(player.matchCash, 20);

    const dummyTank = {
      id: 'req_tank_1',
      type: 'tank',
      isAircraft: false,
      dead: false,
      hp: 1600,
      maxHp: 1600,
      speed: 18,
      accelRate: 2.2,
      rpm: 20,
      _paidAsStock: true
    };
    player.applyPlayerRideCustomizations(dummyTank);
    assert.equal(dummyTank.hasThermalFlir, false);
  });

  test('allows $0 free walk-up & Main Base HQ pool boarding for parked HQ planes, HQ armor & HQ/FOB bikes at 00:00', () => {
    const { player: pilot } = createEconomyPlayerHarness({ role: 'pilot' });
    pilot.loadGunsmithState();
    assert.equal(pilot.matchCash, 50);

    const hqPlane = {
      id: 'us_a10_cas',
      name: 'A-10C WARTHOG CAS',
      type: 'plane',
      isAircraft: true,
      aircraftRole: 'cas',
      team: 'US',
      dead: false,
      pos: new THREE.Vector3(-1560, 0, 120),
      yaw: 0,
      mesh: new THREE.Group()
    };
    const hqBike = {
      id: 'us_hq_bike_1',
      name: 'US HQ RECON BIKE',
      type: 'bike',
      isAircraft: false,
      team: 'US',
      dead: false,
      pos: new THREE.Vector3(-1494, 0, 0),
      yaw: 0,
      mesh: new THREE.Group()
    };
    const hqTank = {
      id: 'us_abrams_hq',
      name: 'M1A2 ABRAMS MBT',
      type: 'tank',
      isAircraft: false,
      team: 'US',
      dead: false,
      pos: new THREE.Vector3(-1450, 0, 0),
      yaw: 0,
      mesh: new THREE.Group()
    };

    const vmStub = {
      vehicles: [hqPlane, hqBike, hqTank],
      b2UnlockedByTeam: { US: false, RU: false },
      getTeamKills: () => 0,
      isB2UnlockedForTeam: VehicleManager.prototype.isB2UnlockedForTeam,
      findAvailableBaseVehicle: VehicleManager.prototype.findAvailableBaseVehicle
    };
    assert.equal(vmStub.findAvailableBaseVehicle('US', 'cas'), hqPlane);
    assert.equal(vmStub.findAvailableBaseVehicle('US', 'bike'), hqBike);
    assert.equal(vmStub.findAvailableBaseVehicle('US', 'tank'), hqTank);
    assert.equal(vmStub.findAvailableBaseVehicle('US', 'b2_spirit'), null, 'B-2 stays locked before 25 kills');

    assert.equal(pilot.enterVehicle(hqPlane, false), true);
    assert.equal(pilot.matchCash, 50);

    hqPlane.driver = null;
    const { player: eng } = createEconomyPlayerHarness({ role: 'engineer' });
    eng.loadGunsmithState();
    assert.equal(eng.enterVehicle(hqPlane, false), false, 'Non-pilot blocked by class doctrine');
    assert.equal(eng.enterVehicle(hqBike, false), true, 'HQ motorpool bike is $0 free at 00:00!');
    assert.equal(eng.matchCash, 50);

    const { player: crew } = createEconomyPlayerHarness({ role: 'armor' });
    crew.loadGunsmithState();
    assert.equal(crew.enterVehicle(hqTank, false), true, 'HQ Abrams is $0 free for Armor Crewman!');
    assert.equal(crew.matchCash, 50);

    const bankBefore = crew.warehouseCash;
    crew.kills = 4;
    crew.captures = 2;
    crew.settleMatchToWarehouse('US');
    assert.equal(crew.warehouseCash > bankBefore, true);
    assert.equal(crew.matchCash, 50);
  });
});

describe('Squad Caliber Penetration, Optics/Sensor Crits, Avionics FCS & Beyond-Rescue Ragdoll Physics', () => {
  test('blocks infantry rifles & LMGs from blowing up Tanks/IFVs or shooting down Jets, while supporting rare Optics/Sensor crits & AC-130 downward air hits', () => {
    assert.equal(VEHICLE_STATS.PLANE_FIGHTER.speed > VEHICLE_STATS.PLANE_CAS.maxSpeed, true);
    assert.equal(VEHICLE_STATS.PLANE_B2_SPIRIT.speed > VEHICLE_STATS.PLANE_CAS.maxSpeed, true);
    assert.equal(classifyWeaponBallistics('M4A1 Tactical').isSmallArms, true);
    assert.equal(classifyWeaponBallistics('M249 SAW').isLmgOrSniper, true);
    assert.equal(classifyWeaponBallistics('RPG-7 HEAT').isHeavyAntiArmor, true);

    const vm = {
      world: { getGroundHeightAt: () => 0, spawnDebris: () => {} },
      damageVehicle: VehicleManager.prototype.damageVehicle
    };

    // 1. Infantry Rifle & LMG vs MBT -> ZERO hull HP damage (never explodes!), rare Optics crit works!
    const mbt = {
      id: 'ru_t90_1',
      type: 'tank',
      isAircraft: false,
      dead: false,
      hp: 1600,
      maxHp: 1600,
      yaw: 0,
      eraBlocksIntact: 4,
      pos: new THREE.Vector3(0, 0, 0),
      _forceCritRoll: 0.5 // normal non-crit roll
    };
    for (let i = 0; i < 50; i++) {
      vm.damageVehicle(mbt, 18, 'VIPER_1', 'US', 'M4A1 Tactical', null, null, new THREE.Vector3(0, 1, -40));
      vm.damageVehicle(mbt, 24, 'VIPER_1', 'US', 'M249 SAW', null, null, new THREE.Vector3(0, 1, 40));
    }
    assert.equal(mbt.hp, 1600, 'Rifles and LMGs deal 0 hull HP to MBTs');
    assert.equal(mbt.lastArmorRicochet, true);

    // Rare Optics Crit roll (< 0.018 on LMG) cracks Periscope/CITV Optics while keeping 1600/1600 Hull HP!
    mbt._forceCritRoll = 0.004;
    vm.damageVehicle(mbt, 24, 'VIPER_1', 'US', 'M249 SAW', null, null, new THREE.Vector3(0, 1, -40));
    assert.equal(mbt.hp, 1600);
    assert.equal(mbt.subsystems.optics, 'DAMAGED');
    assert.equal(mbt.lastSubsystemCrit, 'OPTICS');

    // 2. A-10C Titanium Bathtub shrugs off infantry rifles & LMGs (0 hull HP), while rare crit glitches HUD sensors!
    const a10 = {
      id: 'ru_su25_cas',
      type: 'plane',
      isAircraft: true,
      aircraftRole: 'cas',
      dead: false,
      hp: 900,
      maxHp: 900,
      pos: new THREE.Vector3(0, 95, 0),
      _forceCritRoll: 0.005
    };
    vm.damageVehicle(a10, 22, 'VIPER_1', 'US', 'M249 SAW', null, null, new THREE.Vector3(0, 0, 80));
    assert.equal(a10.hp, 900, 'CAS titanium tub takes 0 hull HP from infantry LMG');
    assert.equal(a10.lastSubsystemCrit, 'SENSORS');
    assert.equal(a10.sensorGlitchTimer > 0, true);

    // 3. Fast Jet vs close-range infantry LMG: scratches down to 25% HP floor, NEVER shoots down the plane!
    const lowJet = {
      id: 'ru_su57_fighter',
      type: 'plane',
      isAircraft: true,
      aircraftRole: 'fighter',
      dead: false,
      hp: 152, // 25% floor of 600 maxHp is 150
      maxHp: 600,
      pos: new THREE.Vector3(0, 80, 0),
      _forceCritRoll: 0.5
    };
    for (let i = 0; i < 20; i++) {
      vm.damageVehicle(lowJet, 25, 'VIPER_1', 'US', 'PKP PECHENEG LMG', null, null, new THREE.Vector3(0, 0, 90));
    }
    assert.equal(lowJet.hp, 150, 'Infantry LMG cannot reduce fast jet below 25% HP floor or destroy it');
    assert.equal(lowJet.dead, false);

    // 4. AC-130 downward port cannon DOES damage a lower-flying aircraft that crosses below its guns!
    const planeBelowGunship = {
      id: 'ru_su25_low',
      type: 'plane',
      isAircraft: true,
      aircraftRole: 'cas',
      dead: false,
      hp: 900,
      maxHp: 900,
      pos: new THREE.Vector3(0, 90, 0),
      _forceCritRoll: 0.05
    };
    vm.damageVehicle(
      planeBelowGunship,
      150,
      'VIPER_1',
      'US',
      '25MM GAU-12 EQUALIZER',
      null,
      null,
      new THREE.Vector3(0, 168, 180)
    );
    assert.equal(planeBelowGunship.hp < 900, true, 'Physical hit from AC-130 port gun damages lower aircraft');
    assert.equal(planeBelowGunship.sensorGlitchTimer > 0, true);
  });

  test('enforces MBT directional penetration vs AC-130 25mm/105mm & A-10 30mm dives, and AC-130 FCS auto-leads moving ground vehicles only', () => {
    const vm = {
      world: { getGroundHeightAt: () => 0, spawnDebris: () => {} },
      damageVehicle: VehicleManager.prototype.damageVehicle
    };
    const makeTank = () => ({
      id: 'ru_t90_1',
      type: 'tank',
      isAircraft: false,
      dead: false,
      hp: 1600,
      maxHp: 1600,
      yaw: 0,
      eraBlocksIntact: 4,
      pos: new THREE.Vector3(0, 0, 0)
    });

    const tankVs25 = makeTank();
    vm.damageVehicle(tankVs25, 165, 'VIPER_1', 'US', '25MM GAU-12 EQUALIZER', null, null, new THREE.Vector3(0, 168, -220));
    assert.equal(tankVs25.lastArmorRicochet, true);
    assert.equal(tankVs25.lastAppliedDamage <= 12, true);

    const tankVs105 = makeTank();
    vm.damageVehicle(tankVs105, 580, 'VIPER_1', 'US', '105MM M102 HOWITZER', null, null, new THREE.Vector3(120, 168, 0));
    assert.equal(tankVs105.lastAppliedDamage >= 450, true);

    const tankShallowFront = makeTank();
    vm.damageVehicle(tankShallowFront, 185, 'VIPER_1', 'US', '30MM GAU-8 AVENGER', null, null, new THREE.Vector3(0, 35, -260));
    assert.equal(tankShallowFront.lastArmorRicochet, true);

    const tankSteepDive = makeTank();
    vm.damageVehicle(tankSteepDive, 185, 'VIPER_1', 'US', '30MM GAU-8 AVENGER', null, null, new THREE.Vector3(0, 160, -220));
    assert.equal(tankSteepDive.lastArmorRicochet, false);
    assert.equal(tankSteepDive.lastAppliedDamage >= 45, true);

    // AC-130 Computerized Ground FCS Auto-Lead tracks moving enemy tank on ground, ignores airborne aircraft!
    const movingTank = {
      id: 'ru_t90_mov',
      type: 'tank',
      isAircraft: false,
      team: 'RU',
      dead: false,
      pos: new THREE.Vector3(5, 0, 0),
      yaw: 0, // moving along -Z at 16 m/s
      forwardSpeed: 16
    };
    const enemyJet = {
      id: 'ru_su57',
      type: 'plane',
      isAircraft: true,
      team: 'RU',
      dead: false,
      pos: new THREE.Vector3(2, 0, 0),
      yaw: 0,
      forwardSpeed: 120
    };
    const { player: gunshipPilot } = createEconomyPlayerHarness({
      role: 'pilot',
      vehicleManager: { vehicles: [enemyJet, movingTank] }
    });
    const gunship = { id: 'us_ac130', isAircraft: true, aircraftRole: 'gunship', team: 'US' };
    const fcs = gunshipPilot.computeGunshipFcsSolution(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(-180, 170, 0),
      gunship,
      210,
      2.2
    );
    assert.equal(fcs.trackedVehicle, movingTank, 'FCS tracks ground vehicle and ignores aircraft');
    assert.equal(fcs.leadMeters > 10, true, 'FCS leads moving ground target ahead of current position');
    assert.equal(fcs.interceptPos.z < -10, true);
  });

  test('triggers Beyond-Rescue ("Dead-Dead") + 3D Ragdoll launch on AC-130/Tank/RPG core hits while keeping Frag Grenades & Rifles revivable', () => {
    // 1. Hand Grenades & Rifles are ALWAYS 0% Beyond-Rescue (Medics can rescue!)
    assert.equal(evaluateCatastrophicKill('M67 FRAG GRENADE', 0.5, 5.0, () => 0.01).beyondRescue, false);
    assert.equal(evaluateCatastrophicKill('M4A1 Tactical', 0, 0, () => 0.01).beyondRescue, false);

    // 2. RPG-7: 75% Beyond-Rescue inside 2.8m core, 0% Beyond-Rescue on >2.8m outer shrapnel!
    assert.equal(evaluateCatastrophicKill('RPG-7 HEAT', 1.5, 5.0, () => 0.5).beyondRescue, true);
    assert.equal(evaluateCatastrophicKill('RPG-7 HEAT', 4.2, 5.0, () => 0.01).beyondRescue, false);

    // 3. AC-130 105mm & Tank 120mm: 92-100% Beyond-Rescue + heavy ragdoll launch velocity!
    const howCat = evaluateCatastrophicKill('105MM M102 HOWITZER', 3.0, 14.5, () => 0.4);
    assert.equal(howCat.beyondRescue, true);
    assert.equal(howCat.hSpeed >= 13.5, true);
    assert.equal(howCat.upSpeed >= 6.5, true);

    // 4. BotManager.damageBot puts Grenade victim into revivable `downed`, while launching 105mm victim as Beyond-Rescue ragdoll!
    const bmStub = {
      world: { era: 'modern', getGroundHeightAt: () => 0, spawnDebris: () => {}, spawnEnemyLootPack: () => {} },
      player: { team: 'US' },
      clearBotRescueLinks: () => {},
      damageBot: BotManager.prototype.damageBot
    };
    const makeBot = (id, x, z) => ({
      id,
      name: id,
      team: 'RU',
      role: 'ASSAULT',
      hp: 100,
      maxHp: 100,
      armorHp: 0,
      hasHelmet: false,
      dead: false,
      downed: false,
      deaths: 0,
      pos: new THREE.Vector3(x, 0, z),
      mesh: new THREE.Group(),
      parts: {}
    });

    const grenVictim = makeBot('RU_GREN_1', 2, 0);
    bmStub.damageBot(grenVictim, 180, 'VIPER_1', 'US', 'M67 FRAG GRENADE', false, () => {}, null, {
      origin: new THREE.Vector3(0, 0, 0),
      dist: 2.0,
      radius: 5.0,
      rng: () => 0.01
    });
    assert.equal(grenVictim.downed, true, 'Frag grenade victim enters revivable downed state');
    assert.equal(grenVictim.dead, false);

    const howitzerVictim = makeBot('RU_105_1', 4, 0);
    const res105 = bmStub.damageBot(
      howitzerVictim,
      580,
      'VIPER_1',
      'US',
      '105MM M102 HOWITZER',
      false,
      () => {},
      null,
      {
        origin: new THREE.Vector3(0, 0, 0),
        dist: 4.0,
        radius: 14.5,
        rng: () => 0.2
      }
    );
    assert.equal(res105.beyondRescue, true);
    assert.equal(howitzerVictim.dead, true, '105mm victim skips downed state -> immediate KIA');
    assert.equal(howitzerVictim.downed, false);
    assert.equal(howitzerVictim.beyondRescue, true);
    assert.equal(howitzerVictim.ragdollTimer > 3.0, true);
    assert.equal(howitzerVictim.ragdollVelX > 12, true, 'Body is blown outward away from blast origin');
    assert.equal(howitzerVictim.ragdollVelY > 6, true, 'Body is launched upward into ragdoll arc');
    assert.equal(howitzerVictim.mesh.visible, true, 'Corpse stays visible in flight during ragdoll tumble');
  });

  test('Squad-calibrated RPG-7 PG-7V HEAT: defeated by MBT front composite, ~5-6 side hits + track crit, 3-4 rear hits + engine crit', () => {
    const vm = {
      world: { getGroundHeightAt: () => 0, spawnDebris: () => {} },
      damageVehicle: VehicleManager.prototype.damageVehicle
    };
    const makeTank = () => ({
      id: 'us_m1a2_test',
      type: 'tank',
      isAircraft: false,
      dead: false,
      hp: 1600,
      maxHp: 1600,
      yaw: 0, // nose faces -Z, rear faces +Z, right faces +X
      eraBlocksIntact: 2,
      pos: new THREE.Vector3(0, 0, 0)
    });

    // 1. Frontal RPG-7 hit (from -Z ahead of nose): defeated by Chobham composite (< 45 chip dmg)
    const frontTank = makeTank();
    vm.damageVehicle(frontTank, 220, 'LAT_RU', 'RU', 'RPG-7 HEAT', null, null, new THREE.Vector3(0, 1, -40));
    assert.equal(frontTank.lastArmorRicochet, true, 'MBT frontal composite must defeat single-stage RPG-7 HEAT');
    assert.ok(frontTank.lastAppliedDamage <= 45, `Expected <=45 frontal chip dmg, got ${frontTank.lastAppliedDamage}`);
    assert.ok(frontTank.hp > 1550);

    // 2. Side RPG-7 hit (from +X flank): penetrates side skirt (~245-320 dmg -> 5-6 hits to destroy + track mobility crit)
    const sideTank = makeTank();
    sideTank.eraBlocksIntact = 0;
    vm.damageVehicle(sideTank, 220, 'LAT_RU', 'RU', 'RPG-7 HEAT', null, null, new THREE.Vector3(35, 1, 0));
    assert.ok(
      sideTank.lastAppliedDamage >= 280 && sideTank.lastAppliedDamage <= 350,
      `Expected ~319 side RPG dmg (~5 hits on 1600 HP MBT), got ${sideTank.lastAppliedDamage}`
    );
    assert.equal(sideTank.subsystems.tracks, 'DAMAGED', 'Side RPG-7 hit degrades track mobility');

    // 3. Rear Engine Deck RPG-7 hit (from +Z behind hull): 3-4 hits to destroy (~473 dmg + engine smoking/critical)
    const rearTank = makeTank();
    vm.damageVehicle(rearTank, 220, 'LAT_RU', 'RU', 'RPG-7 HEAT', null, null, new THREE.Vector3(0, 1, 35));
    assert.ok(
      rearTank.lastAppliedDamage >= 440 && rearTank.lastAppliedDamage <= 510,
      `Expected ~473 rear engine-deck RPG dmg (3-4 hits on 1600 HP MBT), got ${rearTank.lastAppliedDamage}`
    );
    assert.ok(rearTank.subsystems.engine === 'SMOKING' || rearTank.subsystems.engine === 'CRITICAL');
  });

  test('prevents Sell-All-Loot <-> Deploy-Next-Round infinite loop from stale MP conquest_sync packets or duplicate round settlement', () => {
    const { player } = createEconomyPlayerHarness();
    player.matchCash = 300;
    player.kills = 4;

    // 1. Round 1 ends -> settleMatchToWarehouse(US, roundEpoch=1) populates fallback loot once
    const ext1 = player.settleMatchToWarehouse('US', 1);
    assert.equal(player.extractedRoundLoot.length, 3);
    const cashAfterSettle = player.warehouseCash;

    // 2. User clicks "Sell All Loot" -> extractedRoundLoot becomes [] and Vault Cash increases
    const soldRes = player.sellAllExtractedLoot();
    assert.equal(soldRes.ok, true);
    assert.equal(player.extractedRoundLoot.length, 0);
    const cashAfterSellAll = player.warehouseCash;
    assert.ok(cashAfterSellAll > cashAfterSettle);

    // 3. Calling settleMatchToWarehouse AGAIN for the same roundEpoch=1 is idempotent (never conjures 3 new loot items!)
    const ext1Dup = player.settleMatchToWarehouse('US', 1);
    assert.equal(ext1Dup, ext1);
    assert.equal(player.extractedRoundLoot.length, 0, 'Same roundEpoch must never re-generate fallback loot after selling');
    assert.equal(player.warehouseCash, cashAfterSellAll);

    // 4. User clicks "Deploy to Next Round" -> roundEpoch advances to 2, tickets reset to 1200
    const gameStub = {
      roundEpoch: 2,
      _matchResetGraceUntil: performance.now() + 12000,
      matchEnded: false,
      ticketsUS: 1200,
      ticketsRU: 1200,
      matchTimeRemaining: 900
    };
    const netStub = {
      gameRef: gameStub,
      world: { flags: [] },
      isRoomAuthority: () => false,
      applyRemoteConquestSync: NetworkManager.prototype.applyRemoteConquestSync,
      buildConquestSyncPacket: NetworkManager.prototype.buildConquestSyncPacket
    };

    // Stale peer still sitting on Round 1 Victory Screen (or legacy ?v=119 peer without roundEpoch) sends ticketsRU: 0
    netStub.applyRemoteConquestSync({
      type: 'conquest_sync',
      ticketsUS: 640,
      ticketsRU: 0,
      matchTimeRemaining: 0,
      flags: []
    });
    assert.equal(gameStub.ticketsRU, 1200, 'Stale Round 1 conquest_sync must NOT overwrite Round 2 tickets back to 0');
    assert.equal(gameStub.matchTimeRemaining, 900);

    // Peer sitting on matchEnded === true only emits conquest_sync once per roundEpoch (no Victory Screen spam)
    const endedGameStub = {
      roundEpoch: 1,
      matchEnded: true,
      ticketsUS: 500,
      ticketsRU: 0,
      matchTimeRemaining: 120
    };
    const endedNetStub = {
      gameRef: endedGameStub,
      world: { flags: [] },
      buildConquestSyncPacket: NetworkManager.prototype.buildConquestSyncPacket
    };
    assert.ok(endedNetStub.buildConquestSyncPacket() !== null, 'First matchEnded sync packet is emitted');
    assert.equal(endedNetStub.buildConquestSyncPacket(), null, 'Subsequent matchEnded sync spam is suppressed');
  });
});
