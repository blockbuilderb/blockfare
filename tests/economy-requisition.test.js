import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { ECONOMY, VEHICLE_STATS } from '../src/config.js?v=118';
import { GunsmithMethods } from '../src/player/GunsmithState.js?v=118';
import { VehicleControlMethods } from '../src/player/VehicleControl.js?v=118';
import { VehicleManager } from '../src/vehicles.js?v=118';

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
    // $6,662 - $50 = $6,612 migrated safely into persistent Armory Bank!
    assert.equal(player.warehouseCash, 96612);

    // Personal on-demand field-drop Dirt Bike costs ⚡$100 (short by $50 at 00:00; parked HQ/FOB bikes are $0 free!)
    assert.equal(ECONOMY.VEHICLE_BASE_COST.bike, 100);
    assert.equal(ECONOMY.VEHICLE_BASE_COST.atv, 150);
    const bikeFail = player.payForVehicleRequisition('bike');
    assert.equal(bikeFail.ok, false);
    assert.equal(bikeFail.reason, 'INSUFFICIENT_MATCH_CASH');
    assert.equal(bikeFail.shortBy, 50);
    assert.equal(player.warehouseCash, 96612, 'Armory Bank is untouched by failed field requisition');

    // Buying a permanent Hangar/Armory upgrade in [L] spends Armory Bank, leaving ⚡$50 Match Cash intact!
    const buyFlir = player.buyOrEquipVehicleUpgrade('armorSensor', 'citv_flir_pod');
    assert.equal(buyFlir.ok, true);
    assert.equal(player.warehouseCash, 96612 - 800);
    assert.equal(player.matchCash, 50);
  });

  test('applies Tarkov modded vehicle surcharge when modded and auto-falls back to Stock ($0 surcharge) when tight on Match Cash', () => {
    const { player } = createEconomyPlayerHarness({ role: 'armor' });
    player.warehouseCash = 10000;
    player.matchCash = 50;

    // Unlock & equip CITV FLIR ($800) from Armory Bank -> Tank now has +$150 modded surcharge ($1,400 + $150 = $1,550)
    player.buyOrEquipVehicleUpgrade('armorSensor', 'citv_flir_pod');
    const moddedQuote = player.getVehicleRequisitionQuote('tank');
    assert.equal(moddedQuote.isModded, true);
    assert.equal(moddedQuote.baseCost, 1400);
    assert.equal(moddedQuote.modSurcharge, 150);
    assert.equal(moddedQuote.totalCost, 1550);

    // Earn ⚡$1,370 in combat -> total ⚡$1,420 (enough for $1,400 Stock Abrams, $130 short of $1,550 Modded)
    player.addCash(1370, 'CAPTURES & AT KILLS', false);
    assert.equal(player.matchCash, 1420);

    const stockFallbackPay = player.payForVehicleRequisition('tank');
    assert.equal(stockFallbackPay.ok, true);
    assert.equal(stockFallbackPay.cost, 1400);
    assert.equal(stockFallbackPay.useStock, true);
    assert.equal(player.matchCash, 20);

    // Stock vehicle does NOT receive paid CITV thermal FLIR when _paidAsStock === true
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

    // 1. findAvailableBaseVehicle locates parked HQ pool units for $0 Main Base deploy!
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

    // 2. Combat Pilot boards parked HQ runway A-10 Warthog at 00:00 (⚡$50) for $0 FREE!
    assert.equal(pilot.enterVehicle(hqPlane, false), true);
    assert.equal(pilot.matchCash, 50);

    // 3. Non-pilot Engineer is still blocked by class license on aircraft, NOT cash, and rides HQ bike for $0 FREE!
    hqPlane.driver = null;
    const { player: eng } = createEconomyPlayerHarness({ role: 'engineer' });
    eng.loadGunsmithState();
    assert.equal(eng.enterVehicle(hqPlane, false), false, 'Non-pilot blocked by class doctrine');
    assert.equal(eng.enterVehicle(hqBike, false), true, 'HQ motorpool bike is $0 free at 00:00!');
    assert.equal(eng.matchCash, 50);

    // 4. Armor Crewman boards parked HQ Abrams at 00:00 for $0 FREE!
    const { player: crew } = createEconomyPlayerHarness({ role: 'armor' });
    crew.loadGunsmithState();
    assert.equal(crew.enterVehicle(hqTank, false), true, 'HQ Abrams is $0 free for Armor Crewman!');
    assert.equal(crew.matchCash, 50);

    // 5. End-of-round extraction deposits unspent Match Cash + Victory multiplier into Armory Bank and resets Match Cash to $50!
    const bankBefore = crew.warehouseCash;
    crew.kills = 4;
    crew.captures = 2;
    crew.settleMatchToWarehouse('US');
    assert.equal(crew.warehouseCash > bankBefore, true);
    assert.equal(crew.matchCash, 50);
  });
});

describe('Realistic Airspace Stratification & AC-130 / A-10 Ballistics vs. Jets & MBTs', () => {
  test('stratifies Fighter & B-2 speeds well above subsonic CAS and blocks AC-130 side guns from hitting airborne aircraft', () => {
    assert.equal(VEHICLE_STATS.PLANE_FIGHTER.speed > VEHICLE_STATS.PLANE_CAS.maxSpeed, true);
    assert.equal(VEHICLE_STATS.PLANE_B2_SPIRIT.speed > VEHICLE_STATS.PLANE_CAS.maxSpeed, true);

    const vm = {
      world: { getGroundHeightAt: () => 0, spawnDebris: () => {} },
      damageVehicle: VehicleManager.prototype.damageVehicle
    };

    const airborneF15 = {
      id: 'ru_su57_fighter',
      type: 'plane',
      isAircraft: true,
      aircraftRole: 'fighter',
      aiPilotActive: true,
      forwardSpeed: 114,
      dead: false,
      hp: 580,
      maxHp: 580,
      pos: new THREE.Vector3(0, 345, 0)
    };

    // AC-130 25mm, 40mm, and 105mm are downward ground-attack mounts -> 0 damage to airborne jets!
    assert.equal(
      vm.damageVehicle(airborneF15, 165, 'VIPER_1', 'US', '25MM GAU-12 EQUALIZER', null, null, new THREE.Vector3(0, 168, 200)),
      false
    );
    assert.equal(airborneF15.hp, 580);

    assert.equal(
      vm.damageVehicle(airborneF15, 580, 'VIPER_1', 'US', '105MM M102 HOWITZER', null, null, new THREE.Vector3(0, 168, 200)),
      false
    );
    assert.equal(airborneF15.hp, 580);
  });

  test('enforces MBT armor ricochets vs AC-130 25mm & shallow A-10 30mm, while rewarding AC-130 105mm & steep A-10 top/rear dives', () => {
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
      yaw: 0, // facing -Z (fwd = (0, 0, -1))
      eraBlocksIntact: 4,
      pos: new THREE.Vector3(0, 0, 0)
    });

    // 1. AC-130 25mm GAU-12 bounces off MBT armor (ricochet!)
    const tankVs25 = makeTank();
    vm.damageVehicle(tankVs25, 165, 'VIPER_1', 'US', '25MM GAU-12 EQUALIZER', null, null, new THREE.Vector3(0, 168, -220));
    assert.equal(tankVs25.lastArmorRicochet, true);
    assert.equal(tankVs25.lastAppliedDamage <= 12, true);

    // 2. AC-130 105mm M102 Howitzer punches straight through MBT roof deck!
    const tankVs105 = makeTank();
    vm.damageVehicle(tankVs105, 580, 'VIPER_1', 'US', '105MM M102 HOWITZER', null, null, new THREE.Vector3(120, 168, 0));
    assert.equal(tankVs105.lastArmorRicochet, false);
    assert.equal(tankVs105.lastAppliedDamage >= 450, true);

    // 3. A-10 30mm GAU-8 at shallow frontal angle bounces off Chobham/ERA glacis!
    const tankShallowFront = makeTank();
    vm.damageVehicle(
      tankShallowFront,
      185,
      'VIPER_1',
      'US',
      '30MM GAU-8 AVENGER',
      null,
      null,
      new THREE.Vector3(0, 35, -260) // ~7.6° shallow frontal pass
    );
    assert.equal(tankShallowFront.lastArmorRicochet, true);
    assert.equal(tankShallowFront.lastAppliedDamage <= 12, true);

    // 4. A-10 30mm GAU-8 on a steep >=30° top-down dive penetrates thin turret/engine roof!
    const tankSteepDive = makeTank();
    vm.damageVehicle(
      tankSteepDive,
      185,
      'VIPER_1',
      'US',
      '30MM GAU-8 AVENGER',
      null,
      null,
      new THREE.Vector3(0, 160, -220) // ~36° steep dive (elevSin = 0.588 >= 0.42)
    );
    assert.equal(tankSteepDive.lastArmorRicochet, false);
    assert.equal(tankSteepDive.lastAppliedDamage >= 45, true);
  });
});
