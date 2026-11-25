import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { ECONOMY, VEHICLE_STATS, SQUAD_KIT_CAPS, PROJECTILES } from '../src/config.js?v=124';
import { GunsmithMethods } from '../src/player/GunsmithState.js?v=124';
import { VehicleControlMethods } from '../src/player/VehicleControl.js?v=124';
import {
  VehicleManager,
  PITCH_LIMITS_CAR,
  PITCH_LIMITS_COMMANDER_RWS,
  classifyWeaponBallistics,
  getVehicleSeatLayout,
  initVehicleOrdnance
} from '../src/vehicles.js?v=124';
import { WEAPON_DEFS } from '../src/assets/weapon-defs.js?v=124';
import { ATTACHMENT_CATALOG } from '../src/assets/attachment-defs.js?v=124';
import { sound } from '../src/audio/SoundManager.js?v=124';
import { BotManager, SQUAD_9MAN_ROSTERS, evaluateCatastrophicKill } from '../src/bots.js?v=124';
import { NetworkManager } from '../src/network.js?v=124';
import { ConquestSystem } from '../src/world/ConquestSystem.js?v=124';
import { resolveGlobalCommandShortcut } from '../src/utils/KeyboardShortcuts.js?v=124';

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
    buildMagArray: (clip = 30, res = 90) => Array.from({ length: Math.max(1, Math.round(res / Math.max(1, clip))) }, () => clip),
    switchSlot: () => {},
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

  test('Roadmap 1-4: Multi-Crew [F1-F4] seats, Co-op AI/Revive sync, Finite Vehicle Ordnance + <45m HQ Rearm, and 20s Burning Wrecks', () => {
    // 1. Multi-Crew Seat Layouts & [F1-F4] In-Vehicle Shortcut Switching
    assert.deepEqual(getVehicleSeatLayout({ type: 'tank' }), ['DRIVER', 'GUNNER', 'COMMANDER']);
    assert.deepEqual(getVehicleSeatLayout({ isAircraft: true, aircraftRole: 'gunship' }), [
      'PILOT',
      'TV_GUNNER',
      'HOWITZER_FCO',
      'LOADMASTER'
    ]);
    assert.equal(
      resolveGlobalCommandShortcut({ code: 'F1' }, { inVehicle: false })?.type,
      'TOGGLE_MANUAL',
      'F1 on foot still toggles Manual overlay'
    );
    assert.deepEqual(
      resolveGlobalCommandShortcut({ code: 'F2' }, { inVehicle: true }),
      { type: 'SWITCH_VEHICLE_SEAT', seatIndex: 1 },
      'F2 inside vehicle switches to Seat [F2] Gunner'
    );

    const { player } = createEconomyPlayerHarness({ role: 'pilot' });
    const ac130 = {
      id: 'us_ac130_mc',
      name: 'AC-130J GHOSTRIDER',
      type: 'plane',
      isAircraft: true,
      aircraftRole: 'gunship',
      team: 'US',
      dead: false,
      pos: new THREE.Vector3(-1350, 260, 0),
      gunshipManualFlight: true,
      ac130AllowBellyCam: true,
      seatNames: getVehicleSeatLayout({ isAircraft: true, aircraftRole: 'gunship' }),
      crewSeats: [null, null, null, null]
    };
    initVehicleOrdnance(ac130);
    assert.equal(ac130.ordnancePools.slot2, 20, 'AC-130 starts with 20× 105mm shells');
    player.activeVehicle = ac130;
    player.vehicleSeatIndex = 0;
    ac130.crewSeats[0] = player;

    assert.equal(player.switchVehicleSeat(2), true, 'Switches cleanly to [F3] HOWITZER_FCO');
    assert.equal(player.vehicleSeatIndex, 2);
    assert.equal(ac130.gunshipManualFlight, false, 'Switching to Gunner/FCO engages Orbit Autopilot');
    assert.equal(ac130.activeWeaponSlot, 2, 'HOWITZER_FCO selects Slot [3] 105mm');

    // 2. Finite Ordnance Consumption & <45m HQ Runway Low-Pass Rearm
    ac130.ordnancePools.slot2 = 1;
    assert.equal(player.consumeVehicleOrdnance(ac130, 'slot2', 1, '105MM'), true);
    assert.equal(ac130.ordnancePools.slot2, 0);
    assert.equal(player.consumeVehicleOrdnance(ac130, 'slot2', 1, '105MM'), false, 'Blocks firing at 0 rounds');

    const vmStub = {
      scene: new THREE.Scene(),
      world: { getGroundHeightAt: () => 0, spawnDebris: () => {} },
      vehicles: [ac130],
      activeWrecks: [],
      refreshTeamVehicleLists: () => {},
      rearmVehicleOrdnance: VehicleManager.prototype.rearmVehicleOrdnance,
      spawnVehicleWreck: VehicleManager.prototype.spawnVehicleWreck,
      raycastWreckCover: VehicleManager.prototype.raycastWreckCover
    };
    vmStub.rearmVehicleOrdnance(ac130);
    assert.equal(ac130.ordnancePools.slot2, 20, 'HQ Runway / FOB Rearm restores 20/20 105mm shells');

    // 3. Persistent 20s Burning 3D Vehicle Wreck Cover Raycast
    const destroyedTank = {
      id: 'ru_t90_wreck',
      type: 'tank',
      isAircraft: false,
      pos: new THREE.Vector3(20, 0, 0),
      yaw: 0
    };
    const wreck = vmStub.spawnVehicleWreck(destroyedTank);
    assert.ok(wreck && wreck.life === 20.0, 'Destroyed tank spawns a 20s burning 3D wreck');
    const coverHit = vmStub.raycastWreckCover(
      new THREE.Vector3(0, 1.0, 0),
      new THREE.Vector3(1, 0, 0),
      40
    );
    assert.equal(coverHit, wreck, 'Burning 3D tank wreck blocks sightline raycasts for infantry cover');

    // 4. Co-op AI Bot Sync & Human-to-Human Drag / Revive
    const botA = { id: 'US_bot_0', pos: new THREE.Vector3(12, 0, -8), yaw: 1.2, hp: 74, dead: false, downed: true, mesh: new THREE.Group() };
    const hostNet = {
      botManager: { bots: [botA] },
      buildCoopBotSyncPacket: NetworkManager.prototype.buildCoopBotSyncPacket
    };
    const syncPkt = hostNet.buildCoopBotSyncPacket();
    assert.equal(syncPkt.type, 'bot_sync');

    const guestBotA = { id: 'US_bot_0', pos: new THREE.Vector3(0, 0, 0), yaw: 0, hp: 100, dead: false, downed: false, mesh: new THREE.Group() };
    const guestPlayer = { dead: false, downed: true, bleeding: true, downedTimer: 45, giveUpProgress: 0.4, hp: 0, pos: new THREE.Vector3() };
    const guestNet = {
      clientId: 'c_guest',
      player: guestPlayer,
      botManager: { bots: [guestBotA] },
      isRoomAuthority: () => false,
      applyRemoteBotSync: NetworkManager.prototype.applyRemoteBotSync,
      applyRemoteAllyDrag: NetworkManager.prototype.applyRemoteAllyDrag,
      applyRemotePlayerRevive: NetworkManager.prototype.applyRemotePlayerRevive
    };
    guestNet.applyRemoteBotSync(syncPkt);
    assert.equal(guestBotA.downed, true);
    assert.equal(guestBotA.hp, 74);

    guestNet.applyRemoteAllyDrag({ targetId: 'c_guest', pos: [5, 0, 10] });
    assert.equal(guestPlayer.pos.x, 5);
    assert.ok(guestPlayer.beingDraggedByAllyTimer > 0, 'Ally drag pauses downed bleedout timer');

    guestNet.applyRemotePlayerRevive({ targetId: 'c_guest', hp: 100, reviverName: 'MEDIC_BRO' });
    assert.equal(guestPlayer.downed, false, 'Human-to-human revive restores downed ally into live combat');
    assert.equal(guestPlayer.hp, 100);
  });

  test('Stock vehicle ordnance ready-racks, ~2x Armory ammo rack upgrades, +60° RWS elevation, >6km aircraft ceilings, ground engine audio & CoD thermal sniping', () => {
    // 1. Real-world stock vehicle ordnance baselines (Ready-Rack / Standard Sortie)
    const tank = { type: 'tank', isAircraft: false };
    initVehicleOrdnance(tank);
    assert.equal(tank.ordnancePools.slot0, 24, 'M1A2/T-90M stock 24 ready-rack shells');
    assert.equal(tank.ordnancePools.slot1, 1200);

    const f15 = { type: 'plane', isAircraft: true, aircraftRole: 'fighter' };
    initVehicleOrdnance(f15);
    assert.equal(f15.ordnancePools.slot0, 500, 'F-15EX stock 500-rd 20mm M61 Vulcan');
    assert.equal(f15.ordnancePools.slot1, 6, '6x AIM-120D AMRAAM missiles');
    assert.equal(f15.ordnancePools.slot2, 4);

    // 2. ~2x Ordnance Rack Upgrades in [L] Armory (heavy_hull_stowage & amber_heavy_racks)
    const { player } = createEconomyPlayerHarness({ role: 'armor' });
    player.loadGunsmithState();
    player.equippedVehicleUpgrades.armorAmmoRack = 'heavy_hull_stowage';
    player.equippedVehicleUpgrades.airAmmoRack = 'amber_heavy_racks';
    player.applyPlayerRideCustomizations(tank);
    player.applyPlayerRideCustomizations(f15);
    assert.equal(tank.maxOrdnancePools.slot0, 42, 'Full Hull Stowage expands MBT shells to 42');
    assert.equal(tank.maxOrdnancePools.slot1, 2400, 'Full Hull Stowage doubles MG ammo to 2,400');
    assert.equal(f15.maxOrdnancePools.slot0, 940, 'AMBER heavy racks expand cannon to 940');
    assert.equal(f15.maxOrdnancePools.slot1, 12, 'AMBER heavy racks double fighter missiles to 12');
    assert.equal(f15.maxOrdnancePools.slot2, 8, 'AMBER heavy racks double fighter bombs to 8');

    // 3. +60° (1.05 rad) Elevation on Humvee / HMG Emplacement & Tank Seat [F3] Commander RWS
    assert.ok(PITCH_LIMITS_CAR.max >= 1.04, 'Humvee .50 cal roof RWS elevates to +60°');
    assert.ok(PITCH_LIMITS_COMMANDER_RWS.max >= 1.04, 'Tank Commander [F3] .50 cal RWS elevates to +60°');
    assert.ok(VEHICLE_STATS.HUMVEE.maxPitchRad >= 1.04);

    // 4. Realistic Per-Aircraft High-Altitude Service Ceilings (> 6,000m)
    const ceilings = VEHICLE_STATS.SERVICE_CEILINGS;
    assert.equal(ceilings.wright_flyer, 2400);
    assert.equal(ceilings.gunship, 9100);
    assert.equal(ceilings.cas, 13700);
    assert.equal(ceilings.b2_spirit, 15240);
    assert.equal(ceilings.bomber, 18300);
    assert.equal(ceilings.fighter, 19800);
    assert.ok(VEHICLE_STATS.AIRSPACE_MAX_ALT >= 19800);

    // 5. Continuous Ground Vehicle & Motorcycle Engine Audio method exists & runs safely headless
    assert.equal(typeof sound.updateGroundVehicleEngineAudio, 'function');
    sound.updateGroundVehicleEngineAudio(
      [{ type: 'bike', isAircraft: false, dead: false, forwardSpeed: 18, pos: new THREE.Vector3(5, 0, 0) }],
      { type: 'bike', isAircraft: false, dead: false, forwardSpeed: 22 },
      new THREE.Vector3(0, 0, 0),
      0
    );

    // 6. Sniper Thermal IR Scope (AN/PAS-13G 6x-12x) & CoD Snappy Bolt-Action Upper-Chest OSK
    const sniperIr = ATTACHMENT_CATALOG.optic.find((o) => o.id === 'an_pas13_sniper_ir');
    assert.ok(sniperIr && sniperIr.opticType === 'sniperFlir' && sniperIr.isThermal === true);
    assert.ok(WEAPON_DEFS.sv98.adsSpeed >= 22 && WEAPON_DEFS.sv98.chestMult >= 1.5);
    assert.ok(WEAPON_DEFS.awm.adsSpeed >= 21 && WEAPON_DEFS.awm.chestMult >= 1.6);
    assert.ok(WEAPON_DEFS.sv98.damage * WEAPON_DEFS.sv98.chestMult >= 160, 'SV-98 upper-chest One-Shot-Kill');
  });

  test('Distinct 3D Aircraft Crash Wrecks (never tank turrets) & Offworld Squad 9-Man Kit Slot Caps (~12.8% LAT vs old 50% bug)', () => {
    // 1. Crashed Aircraft spawn distinct swept-wing/flying-wing/cargo airframe wrecks with ZERO tank turrets
    const vmWreck = {
      scene: new THREE.Scene(),
      world: { getGroundHeightAt: () => 0 },
      activeWrecks: [],
      spawnVehicleWreck: VehicleManager.prototype.spawnVehicleWreck
    };

    for (const role of ['fighter', 'cas', 'gunship', 'b2_spirit', 'wright_flyer']) {
      const w = vmWreck.spawnVehicleWreck({
        id: `plane_${role}`,
        type: 'plane',
        isAircraft: true,
        aircraftRole: role,
        pos: new THREE.Vector3(10, 0, 10),
        yaw: 0.4
      });
      assert.equal(w.wreckKind, 'aircraft', `${role} wreck must be aircraft kind`);
      assert.equal(
        w.mesh.getObjectByName('tankWreckTurret'),
        undefined,
        `Crashed ${role} plane must NEVER spawn a tank turret!`
      );
      assert.ok(
        w.mesh.getObjectByName('aircraftWreckFuselage') && w.mesh.getObjectByName('aircraftWreckWingL'),
        `Crashed ${role} plane must include aircraft fuselage & wing wreckage`
      );
    }

    const truckWreck = vmWreck.spawnVehicleWreck({
      id: 'us_humvee_1',
      type: 'humvee',
      isAircraft: false,
      pos: new THREE.Vector3(0, 0, 0),
      yaw: 0
    });
    assert.equal(truckWreck.wreckKind, 'truck');
    assert.equal(truckWreck.mesh.getObjectByName('tankWreckTurret'), undefined);
    assert.ok(truckWreck.mesh.getObjectByName('truckWreckCab'));

    const tankWreck = vmWreck.spawnVehicleWreck({
      id: 'ru_t90_1',
      type: 'tank',
      isAircraft: false,
      pos: new THREE.Vector3(0, 0, 0),
      yaw: 0
    });
    assert.equal(tankWreck.wreckKind, 'armor');
    assert.ok(tankWreck.mesh.getObjectByName('tankWreckTurret'));
    assert.ok(tankWreck.mesh.getObjectByName('tankWreckBarrel'));

    // 2. Squad 9-Man Kit Slot Caps: <=2 LAT Engineers, <=2 Medics, <=1 Recon Marksman, <=3 Fire-Support per 9-man squad
    let totalSlots = 0;
    let totalEngineers = 0;
    let totalRecons = 0;
    for (const [sqId, roster] of Object.entries(SQUAD_9MAN_ROSTERS)) {
      assert.equal(roster.length, 9, `${sqId} roster must be a 9-man Squad template`);
      const counts = { ASSAULT: 0, MEDIC: 0, ENGINEER: 0, SUPPORT: 0, RECON: 0 };
      for (const r of roster) {
        counts[r] = (counts[r] || 0) + 1;
        totalSlots++;
        if (r === 'ENGINEER') totalEngineers++;
        if (r === 'RECON') totalRecons++;
      }
      assert.ok(counts.ENGINEER <= SQUAD_KIT_CAPS.ROLE_MAX_PER_9.engineer, `${sqId} LAT cap <=2`);
      assert.ok(counts.MEDIC <= SQUAD_KIT_CAPS.ROLE_MAX_PER_9.medic, `${sqId} Medic cap <=2`);
      assert.ok(counts.RECON <= SQUAD_KIT_CAPS.ROLE_MAX_PER_9.recon, `${sqId} Marksman cap <=1`);
      const fireSupportTotal = counts.ENGINEER + counts.SUPPORT + counts.RECON;
      assert.ok(
        fireSupportTotal <= SQUAD_KIT_CAPS.MAX_FIRE_SUPPORT_PER_9,
        `${sqId} combined Fire-Support roles (${fireSupportTotal}) must be <= 3`
      );
    }
    const teamEngineerRatio = totalEngineers / totalSlots;
    assert.ok(
      teamEngineerRatio > 0.1 && teamEngineerRatio <= 0.16,
      `Team-wide LAT Engineer ratio should be ~13% (got ${(teamEngineerRatio * 100).toFixed(1)}%)`
    );
    assert.ok(totalRecons >= 2, 'ECHO and ALPHA squads now field actual RECON marksmen');
  });

  test('v124: consistent $0 HQ vehicle pool for Armor Crew & Pilots, solo FOB tank capture/resupply, multi-gun scopes, AC-130 port sector, autopilot & localized damage', () => {
    // 1. Offline Solo Default: NetworkManager without URL MP params starts in SINGLEPLAYER so cloud relay never hijacks solo FOB captures
    const prevWin = globalThis.window;
    globalThis.window = { location: { search: '', hostname: 'blockbuilderb.github.io', protocol: 'https:' } };
    const soloNet = new NetworkManager({ team: 'US', pos: new THREE.Vector3() }, { bots: [] }, { voxels: new Map() });
    assert.equal(soloNet.gameMode, 'SINGLEPLAYER');
    assert.equal(soloNet.isMultiplayer(), false);
    globalThis.window = prevWin;

    // 2. Multi-Gun Shared Scope Equipping: one purchased optic equips across M4A1, AK-15 & MP-443 simultaneously without unequipping others!
    const { player } = createEconomyPlayerHarness({ role: 'assault' });
    player.warehouseCash = 15000;
    player.ownedWeapons.add('m4a1');
    player.ownedWeapons.add('ak15');
    player.ownedWeapons.add('mp443');
    assert.equal(player.buyOrEquipUpgrade('optic', 'holo', 'm4a1').ok, true);
    assert.equal(player.buyOrEquipUpgrade('optic', 'holo', 'ak15').ok, true);
    assert.equal(player.getEquippedItem('optic', 'm4a1')?.id, 'holo');
    assert.equal(player.getEquippedItem('optic', 'ak15')?.id, 'holo');
    assert.equal(player.getEquippedItem('optic', 'mp443')?.id, 'factory');
    const mountAll = player.equipUpgradeOnAllOwnedWeapons('optic', 'holo');
    assert.equal(mountAll.ok, true);
    assert.equal(player.getEquippedItem('optic', 'mp443')?.id, 'holo');
    assert.ok(player.getWeaponsUsingUpgrade('optic', 'holo').length >= 3);

    // 2b. Hyper-Velocity APFSDS Tank Shell (780 m/s) vs. SACLOS Wire/Laser-Guided ATGM (Slot [3] on Tanks & IFVs)
    assert.ok(PROJECTILES.TANK_SHELL.speed >= 700, 'Tank APFSDS shell flies at hyper-velocity (>=700 m/s)');
    assert.ok(PROJECTILES.ATGM_TOW.turnRate >= 4.0 && PROJECTILES.ATGM_TOW.gravity === 0, 'TOW/Kornet ATGM is zero-gravity SACLOS guided');

    // 3. Consistent $0 HQ Pool Boarding for Armor Crewman (even after AI bots board HQ Tanks!) + Pre-Deploy B-2 Kill Guard
    const mockWorld = {
      era: 'modern',
      spawns: { US_BASE: new THREE.Vector3(-1520, 0, 0), RU_BASE: new THREE.Vector3(1520, 0, 0) },
      flags: [{ id: 'A', owner: 'NEUTRAL', radius: 34, progress: 0, contested: false, pos: new THREE.Vector3(-420, 0, 0) }],
      ammoCrates: [],
      getTeamHex: () => 0x3498db,
      getGroundHeightAt: () => 0,
      spawnDebris: () => {},
      spawnExplosionVisual: () => {}
    };
    Object.assign(mockWorld, ConquestSystem);
    const vm = new VehicleManager(new THREE.Scene(), mockWorld);
    vm._suppressPreDeployKills = true;
    for (let i = 0; i < 30; i++) vm.recordTeamKillAndCheckB2('US');
    assert.equal(vm.isB2UnlockedForTeam('US'), false, 'Pre-deploy background AI skirmishes must not unlock B-2 early');
    vm._suppressPreDeployKills = false;

    const aiBot = { name: 'CPL_BAKER', team: 'US', dead: false, downed: false, pos: new THREE.Vector3(-900, 0, 0), mesh: new THREE.Group() };
    const hqTank = vm.spawnVehicle({
      id: 'us_abrams_hq',
      name: 'M1A2 ABRAMS MBT',
      type: 'tank',
      team: 'US',
      spawnPos: new THREE.Vector3(-1456, 0, -5),
      spawnYaw: -Math.PI / 2,
      maxHp: 2100,
      speed: 16,
      weaponType: 'tank_cannon'
    });
    // Simulate AI bot boarding & driving the HQ tank out toward the frontline during deploy screen
    hqTank.npcDriver = aiBot;
    aiBot.drivingVehicle = hqTank;
    hqTank.pos.set(-780, 0, -18);
    hqTank.hp = 1650;

    const availTank = vm.findAvailableBaseVehicle('US', 'tank');
    assert.equal(availTank, hqTank, 'Human Armor Crewman at Main Base gets $0 HQ priority over AI-crewed fleet tank');
    const claimedTank = vm.claimBaseVehicleForPlayerDeploy(player, 'US', 'tank');
    assert.equal(claimedTank, hqTank);
    assert.equal(hqTank.npcDriver, null);
    assert.equal(aiBot.drivingVehicle, null);
    assert.equal(hqTank.hp, 2100, 'Reclaimed HQ tank resets cleanly to 100% HP at Main Base');
    assert.ok(Math.hypot(hqTank.pos.x - -1456, hqTank.pos.z - -5) < 25, 'Reclaimed HQ tank spawns cleanly at HQ Motor Pool');

    // 4. Tank Captures Neutral FOB & Resupplies inside Captured FOB (or Friendly [7] Ammo Crate)
    player.activeVehicle = hqTank;
    hqTank.driver = player;
    hqTank.pos.set(-412, 0, 4); // Inside Flag A (34m radius), while player.pos is still at (0,0,0)
    player.pos.set(0, 0, 0);
    for (let step = 0; step < 45; step++) {
      mockWorld.updateFlags(0.5, player, []);
    }
    assert.equal(mockWorld.flags[0].owner, 'US', 'Player driving a Tank inside FOB radius captures the FOB solo');

    hqTank.ordnancePools.slot0 = 4;
    hqTank.hp = 1500;
    const rearmRes = vm.triggerManualVehicleRearm(hqTank);
    assert.equal(rearmRes, true, '[R] Manual Rearm inside captured friendly FOB refills tank shells & repairs hull');
    assert.equal(hqTank.ordnancePools.slot0, hqTank.maxOrdnancePools.slot0);

    // 5. Aircraft [R] LAAP Level-Hold Autopilot, [F] SPI Sight Lock, AC-130 Calibration & Modular 6-Zone Airframe Damage
    const jet = vm.spawnVehicle({
      id: 'us_f15_test',
      name: 'F-15EX EAGLE',
      type: 'plane',
      isAircraft: true,
      aircraftRole: 'fighter',
      team: 'US',
      spawnPos: new THREE.Vector3(-1436, 120, -138),
      spawnYaw: -Math.PI / 2,
      maxHp: 1500,
      speed: 68
    });
    assert.ok(jet.airframeParts && jet.airframeParts.leftWing === 100 && jet.airframeParts.engines === 100);
    // Strike left wing in local space (-X = left wing; at yaw = 0, local -X is world -X)
    jet.yaw = 0;
    jet.pitch = 0;
    jet.roll = 0;
    jet.pos.set(0, 120, 0);
    vm.damageVehicle(
      jet,
      320,
      'PANTSIR',
      'RU',
      '30MM AA AUTOCANNON',
      null,
      null,
      new THREE.Vector3(0, 0, -200),
      new THREE.Vector3(-4.5, 120, 0)
    );
    assert.equal(jet.lastAirframePart, 'leftWing');
    assert.ok(jet.airframeParts.leftWing < 65, 'Left wing hit degrades leftWing integrity');
    assert.equal(jet.airframeParts.rightWing, 100, 'Right wing stays intact on isolated left-wing cannon hit');

    player.activeVehicle = jet;
    jet.driver = player;
    assert.equal(player.toggleAircraftLevelAutopilot(), true);
    assert.equal(jet.levelAutopilot, true);

    // AC-130 FCS Calibration: stationary tank 12m away from ground aim point must NOT yank shot sideways
    const parkedEnemyTank = vm.spawnVehicle({
      id: 'ru_parked_tank',
      name: 'T-90M',
      type: 'tank',
      team: 'RU',
      spawnPos: new THREE.Vector3(112, 0, 0),
      spawnYaw: 0,
      maxHp: 2100,
      speed: 16
    });
    parkedEnemyTank.forwardSpeed = 0;
    player.vehicleManager = vm;
    const fcsSol = player.computeGunshipFcsSolution(
      new THREE.Vector3(100, 0, 0),
      new THREE.Vector3(0, 175, 0),
      { aircraftRole: 'gunship' },
      210,
      2.2
    );
    assert.equal(fcsSol.trackedVehicle, null, 'AC-130 FCS never snaps sideways onto nearby stationary vehicles');
    assert.equal(fcsSol.interceptPos.x, 100);

    // 6. Soldier & Player Anatomical Limb Fractures + Catastrophic Unrevivable Break
    const heavySniperHead = evaluateCatastrophicKill('M82 .50 BMG', 0, 0, () => 0.5, {
      hitZone: 'head',
      isHeadshot: true,
      finalDamage: 220,
      overkill: 120
    });
    assert.equal(heavySniperHead.beyondRescue, true, '.50 BMG headshot causes catastrophic unrevivable break');
    const rifleArm = evaluateCatastrophicKill('M4A1 5.56MM', 0, 0, () => 0.01, {
      hitZone: 'leftArm',
      isHeadshot: false,
      finalDamage: 34,
      overkill: 5
    });
    assert.equal(rifleArm.beyondRescue, false, 'Standard 5.56mm arm finish remains revivable by Squad Medics');
  });
});
