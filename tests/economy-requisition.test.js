import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { ECONOMY } from '../src/config.js?v=117';
import { GunsmithMethods } from '../src/player/GunsmithState.js?v=117';
import { VehicleControlMethods } from '../src/player/VehicleControl.js?v=117';

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

describe('3-Pillar Economy: Dual-Wallet Separation, Tarkov Surcharge & HQ Boarding Gate', () => {
  test('migrates legacy v4 matchCash into Armory Bank and starts every match at ⚡$50 Match Cash', () => {
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

    // At 00:00 with ⚡$50 Match Cash (even with 🏦$96,612 in Armory Bank!), player CANNOT buy a $250 Dirt Bike!
    const bikeFail = player.payForVehicleRequisition('bike');
    assert.equal(bikeFail.ok, false);
    assert.equal(bikeFail.reason, 'INSUFFICIENT_MATCH_CASH');
    assert.equal(bikeFail.shortBy, 200);
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

  test('enforces Match Cash requisition gate on unclaimed HQ vehicles while keeping FOB motorpools & hijacked enemy vehicles $0 free', () => {
    const { player } = createEconomyPlayerHarness({ role: 'armor' });
    player.loadGunsmithState(); // matchCash = $50

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
    const fobBike = {
      id: 'fob_b_bike_1',
      name: 'FOB RECON BIKE',
      type: 'bike',
      isAircraft: false,
      fobFlagId: 'B',
      team: 'US',
      dead: false,
      pos: new THREE.Vector3(-200, 0, 0),
      yaw: 0,
      mesh: new THREE.Group()
    };
    const enemyTank = {
      id: 'ru_t90_1',
      name: 'T-90M MBT',
      type: 'tank',
      isAircraft: false,
      team: 'RU',
      dead: false,
      pos: new THREE.Vector3(50, 0, 0),
      yaw: 0,
      mesh: new THREE.Group()
    };

    // 1. Unclaimed HQ Tank at 00:00 (⚡$50) -> BLOCKED!
    assert.equal(player.enterVehicle(hqTank, false), false);
    assert.equal(player.matchCash, 50);

    // 2. Captured FOB Motorpool Bike -> $0 FREE!
    assert.equal(player.enterVehicle(fobBike, false), true);
    assert.equal(player.matchCash, 50);

    // 3. Hijacking Enemy RU Tank -> $0 FREE!
    assert.equal(player.enterVehicle(enemyTank, false), true);
    assert.equal(player.matchCash, 50);

    // 4. Earn ⚡$1,400 -> HQ Tank boards cleanly, deducts ⚡$1,400 once, and re-boarding is $0!
    player.activeVehicle = null;
    player.addCash(1400, 'OBJECTIVES & DESTROYS', false);
    assert.equal(player.enterVehicle(hqTank, false), true);
    assert.equal(player.matchCash, 50);
    assert.equal(hqTank.paidByPlayer, player);

    player.activeVehicle = null;
    hqTank.driver = null;
    assert.equal(player.enterVehicle(hqTank, false), true, 're-boarding already-paid tank is $0');
    assert.equal(player.matchCash, 50);

    // 5. End-of-round extraction deposits unspent Match Cash + Victory multiplier into Armory Bank and resets Match Cash to $50!
    const bankBefore = player.warehouseCash;
    player.kills = 4;
    player.captures = 2;
    player.settleMatchToWarehouse('US');
    assert.equal(player.warehouseCash > bankBefore, true);
    assert.equal(player.matchCash, 50);
  });
});
