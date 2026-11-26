import * as THREE from '../vendor/three.module.js';
import { sound } from './audio.js?v=136';
import { VEHICLE_STATS, ECONOMY, PROJECTILES } from './config.js?v=136';
import {
  VEHICLE_DEFS,
  MEDIEVAL_VEHICLE_DEFS,
  JURASSIC_VEHICLE_DEFS
} from './assets/vehicle-defs.js?v=136';
import { createVehicleMesh } from './models/vehicle-model.js?v=136';
import { tmpVec3, tmpVec3Copy } from './utils/VectorPool.js?v=136';
import { getRideShortcutLabel } from './utils/KeyboardShortcuts.js?v=136';
import { events, makeEventBridge } from './events.js?v=136';
import {
  AIRCRAFT_FLIGHT_EVENTS,
  AIRCRAFT_FLIGHT_STATES,
  GROUND_VEHICLE_EVENTS,
  VEHICLE_CM_EVENTS,
  VEHICLE_THERMAL_EVENTS,
  createAircraftFlightFSM,
  createGroundVehicleFSM,
  createVehicleSubsystemsFSM,
  syncAircraftFlightFSM,
  syncGroundVehicleFSM,
  syncVehicleSubsystemsFSM
} from './core/StateMachines.js?v=136';

function markShared(item) {
  item.userData.shared = true;
  return item;
}

const SHARED_WRECK_HULL_GEO = markShared(new THREE.BoxGeometry(3.4, 1.55, 6.2));
const SHARED_WRECK_TURRET_GEO = markShared(new THREE.BoxGeometry(2.3, 0.85, 2.7));
const SHARED_WRECK_BARREL_GEO = markShared(new THREE.CylinderGeometry(0.11, 0.13, 3.3, 7));
const SHARED_WRECK_CAB_GEO = markShared(new THREE.BoxGeometry(2.25, 0.92, 2.35));
const SHARED_AIR_FUSELAGE_GEO = markShared(new THREE.CylinderGeometry(0.56, 0.86, 7.8, 7));
const SHARED_AIR_CARGO_FUSELAGE_GEO = markShared(new THREE.CylinderGeometry(1.15, 1.24, 10.2, 8));
const SHARED_AIR_WING_GEO = markShared(new THREE.BoxGeometry(4.3, 0.16, 1.85));
const SHARED_AIR_CARGO_WING_GEO = markShared(new THREE.BoxGeometry(5.6, 0.24, 1.95));
const SHARED_AIR_TAIL_FIN_GEO = markShared(new THREE.BoxGeometry(0.16, 1.68, 1.45));
const SHARED_AIR_NOZZLE_GEO = markShared(new THREE.CylinderGeometry(0.35, 0.44, 1.15, 8));
const SHARED_AIR_B2_CENTER_GEO = markShared(new THREE.BoxGeometry(5.8, 0.42, 3.8));
const SHARED_AIR_B2_WING_GEO = markShared(new THREE.BoxGeometry(4.8, 0.18, 2.2));
const SHARED_AIR_SCORCH_GEO = markShared(new THREE.CircleGeometry(4.6, 12));
SHARED_AIR_SCORCH_GEO.rotateX(-Math.PI / 2);
const SHARED_WRECK_FIRE_GEO = markShared(new THREE.BoxGeometry(1.45, 1.25, 1.45));
const SHARED_WRECK_SCORCH_MAT = markShared(
  new THREE.MeshBasicMaterial({ color: 0x111315, transparent: true, opacity: 0.78 })
);
const SHARED_WRECK_HULL_MAT = markShared(
  new THREE.MeshLambertMaterial({ color: 0x1b1d20, flatShading: true })
);
const SHARED_WRECK_CHAR_MAT = markShared(
  new THREE.MeshLambertMaterial({ color: 0x26292d, flatShading: true })
);
const SHARED_WRECK_WOOD_CHAR_MAT = markShared(
  new THREE.MeshLambertMaterial({ color: 0x3b2a1e, flatShading: true })
);
const SHARED_WRECK_FIRE_MAT = markShared(
  new THREE.MeshBasicMaterial({ color: 0xff6b1a, transparent: true, opacity: 0.78 })
);

/**
 * Multi-Crew Seat Layout (`[F1–F4]`):
 * - Tanks / SPAAG AA: `['DRIVER', 'GUNNER', 'COMMANDER']` (3 seats)
 * - IFVs / APCs / Humvees: `['DRIVER', 'GUNNER', 'PASSENGER_1', 'PASSENGER_2']` (4 seats)
 * - AC-130 Gunship: `['PILOT', 'TV_GUNNER', 'HOWITZER_FCO', 'LOADMASTER']` (4 seats)
 * - Bikes / ATVs / Mounts: `['DRIVER', 'PILLION']` (2 seats)
 * - Single-seat Jets & Emplacements: `['PILOT']` / `['GUNNER']` (1 seat)
 */
export function getVehicleSeatLayout(v) {
  if (!v) return ['DRIVER'];
  if (v.isAircraft) {
    if (v.aircraftRole === 'heli_transport') {
      return [
        'PILOT',
        'LEFT_MINIGUN',
        'RIGHT_MINIGUN',
        'TROOP_1',
        'TROOP_2',
        'TROOP_3',
        'TROOP_4',
        'TROOP_5'
      ];
    }
    if (v.aircraftRole === 'heli_attack') {
      return ['PILOT', 'CPG_GUNNER'];
    }
    if (v.aircraftRole === 'gunship') {
      return ['PILOT', 'TV_GUNNER', 'HOWITZER_FCO', 'LOADMASTER'];
    }
    return ['PILOT'];
  }
  if (v.isEmplacement || v.type === 'trebuchet') {
    return ['GUNNER'];
  }
  if (v.type === 'truck_transport') {
    return [
      'DRIVER',
      'CO_GUNNER',
      'TROOP_1',
      'TROOP_2',
      'TROOP_3',
      'TROOP_4',
      'TROOP_5',
      'TROOP_6',
      'TROOP_7',
      'TROOP_8'
    ];
  }
  if (
    v.type === 'bike' ||
    v.type === 'atv' ||
    v.type === 'warhorse' ||
    v.type === 'raptor_mount'
  ) {
    return ['DRIVER', 'PILLION'];
  }
  if (v.type === 'tank' || v.type === 'aa' || v.type === 'trex_mount') {
    return ['DRIVER', 'GUNNER', 'COMMANDER'];
  }
  return ['DRIVER', 'GUNNER', 'PASSENGER_1', 'PASSENGER_2'];
}

/**
 * Initializes realistic finite vehicle ordnance pools (replenished via `<45m` HQ Runway Low-Pass,
 * HQ Helipads, HQ Motor Pool, Friendly FOB Supply Stations, or 6×6 Logistics Trucks!).
 */
export function initVehicleOrdnance(v) {
  if (!v) return null;
  if (v.isSecretOmegaFlyer) {
    v.ordnancePools = null;
    v.maxOrdnancePools = null;
    return null;
  }
  let maxPools = null;
  if (v.isAircraft) {
    const role = v.aircraftRole || 'cas';
    if (role === 'heli_transport') {
      maxPools = { slot0: 2400, slot1: 14, slot2: 4 }; // 2,400× Twin 7.62mm M134 Miniguns, 14× 70mm Hydra/S-8, 4× Stinger/Igla
    } else if (role === 'heli_attack') {
      maxPools = { slot0: 600, slot1: 19, slot2: 8 }; // 600× 30mm M230/2A42 Chain Gun, 19× Hydra-70/S-8, 8× AGM-114L Hellfire / 9K121 Vikhr ATGMs
    } else if (role === 'gunship') {
      maxPools = { slot0: 1800, slot1: 80, slot2: 20 }; // 1800× 25mm, 80× 40mm Bofors, 20× 105mm ready rack
    } else if (role === 'cas') {
      maxPools = { slot0: 1150, slot1: 14, slot2: 4 }; // 1150× 30mm GAU-8 drum, 14× Hydra-70, 4× AGM-65 Maverick
    } else if (role === 'b2_spirit') {
      maxPools = { slot0: 8, slot1: 1, slot2: 4 }; // Stock CSRL: 8 Carpet Waves (40× 500lb Mk-82), 1× Twin GBU-57 MOP drop (2 MOPs), 4× GBU-31 2,000lb Precision JDAMs (ZERO guns/A2A!)
    } else if (role === 'wright_flyer') {
      maxPools = { slot0: 600, slot1: 8, slot2: 4 };
    } else {
      maxPools = { slot0: 500, slot1: 6, slot2: 4 }; // 500× 20mm M61 Vulcan, 6× AIM-120D AMRAAM, 4× JDAM/GBU-28
    }
  } else if (v.type === 'tank') {
    maxPools = { slot0: 24, slot1: 1200, slot2: 4 }; // 24× 120mm/125mm APFSDS/HE Shells, 1,200× Coax/.50 MG, 4× Gun-Launched ATGMs
  } else if (v.type === 'apc') {
    maxPools = { slot0: 210, slot1: 1200, slot2: 6 }; // 210× 30mm Autocannon, 1,200× Coax MG, 6× Wire-Guided TOW-2B / Kornet ATGMs
  } else if (v.type === 'aa' || v.type === 'emplace_aa') {
    maxPools = { slot0: 600, slot1: 8 }; // 600× Radar AA Bursts, 8× Ready-Pod Stinger / 9M311 SAMs
  } else if (v.type === 'emplace_mortar') {
    maxPools = { slot0: 24, slot1: 6 }; // 24× 81mm HE Shells, 6× 3-Round Rapid Barrages
  } else if (v.type === 'truck_transport') {
    maxPools = { slot0: 600, slot1: 600 }; // 600× 7.62mm M240B / PKP Roof Ring Defense MG
  } else if (v.type === 'humvee' || v.type === 'emplace_hmg') {
    maxPools = { slot0: 1200, slot1: 1200 }; // 1,200× .50 BMG (12.7×99mm M2HB / Kord — 6×200-rd heavy ammo cans)
  } else if (v.type === 'bike') {
    maxPools = { slot0: 240 }; // 240× 9×19mm Rider PDW (8×30-rd magazines — finite ammo, resupply at HQ/FOB/Stash)
  } else if (v.type === 'atv') {
    maxPools = { slot0: 360 }; // 360× 9×19mm Rider PDW (12×30-rd magazines — finite ammo, resupply at HQ/FOB/Stash)
  }

  v._baseOrdnancePools = maxPools ? { ...maxPools } : null;
  v.maxOrdnancePools = maxPools ? { ...maxPools } : null;
  v.ordnancePools = maxPools ? { ...maxPools } : null;
  return v.ordnancePools;
}

/**
 * Squad-style Ballistic Caliber vs. Armor Classification:
 * - Heavy Anti-Armor (`isHeavyAntiArmor`): 105mm/120mm/125mm Shells, RPG-7 HEAT, AGM/Maverick, JDAM/GBU/500lb Bombs, C4, Mortar, SAMs.
 * - Medium Autocannon (`isAutocannon`): 20mm/25mm/30mm/40mm Cannons & 70mm Hydra Rockets.
 * - Heavy MG .50 BMG (`isHeavyMg50`): 12.7mm / .50 Cal M2HB / Kord / 1903 Gatling.
 * - Infantry Small Arms (`isSmallArms`): Pistols, SMGs, Assault Rifles, 7.62mm LMGs/Snipers, Coax MGs & Hand Grenades.
 */
export function classifyWeaponBallistics(weaponName = '') {
  const w = String(weaponName || '').toUpperCase();
  const isFragGrenade = w.includes('GRENADE') || w.includes('M67') || w.includes('FRAG');
  const isHeavyAntiArmor =
    !isFragGrenade &&
    (w.includes('120MM') ||
      w.includes('125MM') ||
      w.includes('105MM') ||
      w.includes('HOWITZER') ||
      w.includes('RPG') ||
      w.includes('HEAT') ||
      w.includes('TOW') ||
      w.includes('KORNET') ||
      w.includes('REFLEKS') ||
      w.includes('LAHAT') ||
      w.includes('ATGM') ||
      w.includes('APFSDS') ||
      w.includes('APHE') ||
      w.includes('MAVERICK') ||
      w.includes('HELLFIRE') ||
      w.includes('VIKHR') ||
      w.includes('ATAKA') ||
      w.includes('AGM') ||
      w.includes('KH-29') ||
      w.includes('JDAM') ||
      w.includes('GBU') ||
      w.includes('CARPET BOMB') ||
      w.includes('MK-82') ||
      w.includes('500LB') ||
      w.includes('2,000LB') ||
      w.includes('30,000LB') ||
      w.includes('AIRSTRIKE') ||
      w.includes('ARTILLERY') ||
      w.includes('155MM') ||
      w.includes('C4') ||
      w.includes('MORTAR') ||
      w.includes('81MM') ||
      w.includes('82MM') ||
      w.includes('TREBUCHET') ||
      w.includes('BOULDER') ||
      w.includes('DYNAMITE') ||
      w.includes('T-REX') ||
      w.includes('MISSILE') ||
      w.includes('STINGER') ||
      w.includes('IGLA') ||
      w.includes('SAM') ||
      w.includes('AIM-') ||
      w.includes('R-73') ||
      w.includes('R-77'));

  const isAutocannon =
    !isHeavyAntiArmor &&
    (w.includes('30MM') ||
      w.includes('25MM') ||
      w.includes('40MM') ||
      w.includes('20MM') ||
      w.includes('GAU-8') ||
      w.includes('AVENGER') ||
      w.includes('GAU-12') ||
      w.includes('EQUALIZER') ||
      w.includes('BOFORS') ||
      w.includes('VULCAN') ||
      w.includes('AUTOCANNON') ||
      w.includes('2A38') ||
      w.includes('2A42') ||
      w.includes('ZU-23') ||
      w.includes('70MM') ||
      w.includes('HYDRA') ||
      w.includes('ROCKET'));

  const isHeavyMg50 =
    !isHeavyAntiArmor &&
    !isAutocannon &&
    (w.includes('.50') ||
      w.includes('50 CAL') ||
      w.includes('50BMG') ||
      w.includes('M2HB') ||
      w.includes('12.7') ||
      w.includes('KORD') ||
      w.includes('1903 BRASS GATLING'));

  const isMeleeOrPrimitive =
    w.includes('SWORD') ||
    w.includes('POLEARM') ||
    w.includes('LANCE') ||
    w.includes('HALBERD') ||
    w.includes('SHIELD') ||
    w.includes('LONGBOW') ||
    w.includes('CROSSBOW') ||
    w.includes('ARROW') ||
    w.includes('VENOM') ||
    w.includes('TALON');

  const isSmallArms = !isHeavyAntiArmor && !isAutocannon && !isHeavyMg50 && !isMeleeOrPrimitive;
  const isRotaryMinigun =
    isSmallArms &&
    (w.includes('M134') || w.includes('MINIGUN') || w.includes('PKT DOOR'));
  const isLmgOrSniper =
    isSmallArms &&
    !isFragGrenade &&
    (isRotaryMinigun ||
      w.includes('M249') ||
      w.includes('SAW') ||
      w.includes('PKP') ||
      w.includes('PECHENEG') ||
      w.includes('RPK') ||
      w.includes('LMG') ||
      w.includes('SV-98') ||
      w.includes('SVD') ||
      w.includes('M110') ||
      w.includes('SNIPER') ||
      w.includes('.338') ||
      w.includes('7.62') ||
      w.includes('COAX'));

  return {
    isHeavyAntiArmor,
    isAutocannon,
    isHeavyMg50,
    isSmallArms,
    isRotaryMinigun,
    isLmgOrSniper,
    isFragGrenade,
    isMeleeOrPrimitive
  };
}

const SHARED_TREB_BOULDER_GEO = markShared(new THREE.DodecahedronGeometry(0.68, 1));
const SHARED_TREB_BOULDER_MAT = markShared(new THREE.MeshBasicMaterial({ color: 0xff6b00 }));
const SHARED_AI_SAM_GEO = markShared(new THREE.BoxGeometry(0.24, 0.24, 1.35));
const SHARED_AI_SAM_MAT = markShared(new THREE.MeshBasicMaterial({ color: 0x00d2d3 }));
const SHARED_AI_AA_SHELL_GEO = markShared(new THREE.BoxGeometry(0.18, 0.18, 0.65));
const SHARED_AI_AA_SHELL_MAT = markShared(new THREE.MeshBasicMaterial({ color: 0xff5252 }));
const SHARED_AI_TANK_SHELL_GEO = markShared(new THREE.BoxGeometry(0.24, 0.24, 0.78));
const SHARED_AI_TANK_SHELL_MAT = markShared(new THREE.MeshBasicMaterial({ color: 0xffaa00 }));
const SHARED_AI_AUTO_SHELL_GEO = markShared(new THREE.BoxGeometry(0.16, 0.16, 0.48));
const SHARED_AI_AUTO_SHELL_MAT = markShared(new THREE.MeshBasicMaterial({ color: 0xffcc00 }));

const PITCH_LIMITS_DEFAULT = Object.freeze({ min: -0.18, max: 0.35 });
const PITCH_LIMITS_AA = Object.freeze({ min: -0.14, max: 1.48 });
const PITCH_LIMITS_MORTAR = Object.freeze({ min: -0.35, max: 0.85 });
const PITCH_LIMITS_APC = Object.freeze({ min: -0.18, max: 0.52 });
export const PITCH_LIMITS_CAR = Object.freeze({ min: -0.26, max: 1.05 }); // -15° to +60° real-world CROWS / OGPK Roof .50 Cal elevation!
export const PITCH_LIMITS_COMMANDER_RWS = Object.freeze({ min: -0.31, max: 1.05 }); // -18° to +60° Tank Commander Roof .50 Cal RWS!

const COLOR_FIRE_ORANGE = new THREE.Color(0xff7f11);
const COLOR_ERA_SPARK = new THREE.Color(0xff9f1a);
const COLOR_HORSE_DEBRIS = new THREE.Color(0x8b4513);
const COLOR_SMOKE_RED = new THREE.Color(0xff5252);
const COLOR_SMOKE_DARK = new THREE.Color(0x2f3640);
const COLOR_SMOKE_GREY = new THREE.Color(0x636e72);
const COLOR_2STROKE_SMOKE = new THREE.Color(0x95afc0);
const COLOR_BLOOD = new THREE.Color(0x8b1e1e);
const COLOR_VORTEX_WHITE = new THREE.Color(0xecf0f1);
const COLOR_B2_CYAN = new THREE.Color(0x00d2d3);
const COLOR_FLARE_GOLD = new THREE.Color(0xffd32a);
const COLOR_MUZZLE_GOLD = new THREE.Color(0xffaa00);
const _wingtipOffsetScratch = new THREE.Vector3();

export class VehicleManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.vehicles = [];
    this.hitMeshes = [];
    this.boardableGroundByTeam = { US: [], RU: [] };
    this.activeGroundTargetsByTeam = { US: [], RU: [] };
    this.activeAircraftByTeam = { US: [], RU: [] };
    this.teamKills = { US: 0, RU: 0 };
    this.teamFunds = {
      US: VEHICLE_STATS.INITIAL_FACTION_FUNDS || 5000,
      RU: VEHICLE_STATS.INITIAL_FACTION_FUNDS || 5000
    };
    this.b2UnlockedByTeam = { US: false, RU: false };
    this.onVehicleRespawn = makeEventBridge(
      'vehicle:respawn',
      (vehicle, cost, category, stage, moneyCost = 0) => ({
        vehicle,
        cost,
        category,
        stage,
        moneyCost
      })
    );

    this.initVehicles();
    this.refreshTeamVehicleLists();
  }

  refreshTeamVehicleLists() {
    this.boardableGroundByTeam.US.length = 0;
    this.boardableGroundByTeam.RU.length = 0;
    this.activeGroundTargetsByTeam.US.length = 0;
    this.activeGroundTargetsByTeam.RU.length = 0;
    this.activeAircraftByTeam.US.length = 0;
    this.activeAircraftByTeam.RU.length = 0;

    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      if (!v) continue;
      v.fleetIndex = i;
      if (v.dead) continue;
      if (v.team !== 'US' && v.team !== 'RU') {
        // Neutral unoccupied FOB motorpool bikes/ATVs are boardable by either team,
        // while neutral unoccupied FOB emplacements are never treated as hostile targets!
        if (
          !v.isAircraft &&
          !v.isEmplacement &&
          !v.isWarehouseBike &&
          !v.driver &&
          !v.npcDriver &&
          !(v.claimedByPlayer && (v.claimedByPlayerTimer || 0) > 0)
        ) {
          this.boardableGroundByTeam.US.push(v);
          this.boardableGroundByTeam.RU.push(v);
        }
        continue;
      }
      const team = v.team;
      const enemyTeam = team === 'US' ? 'RU' : 'US';

      if (v.isAircraft) {
        this.activeAircraftByTeam[team].push(v);
      } else {
        if (
          !v.isEmplacement &&
          !v.isWarehouseBike &&
          !v.driver &&
          !v.npcDriver &&
          !(v.claimedByPlayer && (v.claimedByPlayerTimer || 0) > 0)
        ) {
          this.boardableGroundByTeam[team].push(v);
        }
        const isOccupied = Boolean(v.driver || v.npcDriver);
        if (isOccupied || (!v.isWarehouseBike && v.type !== 'bike' && v.type !== 'atv')) {
          this.activeGroundTargetsByTeam[enemyTeam].push(v);
        }
      }
    }
  }

  getTeamKills(team = 'US') {
    return this.teamKills?.[team] || 0;
  }

  getTeamFunds(team = 'US') {
    return this.teamFunds?.[team] ?? (VEHICLE_STATS.INITIAL_FACTION_FUNDS || 5000);
  }

  addTeamFunds(team = 'US', amount = 0) {
    if (!this.teamFunds) {
      this.teamFunds = { US: 5000, RU: 5000 };
    }
    this.teamFunds[team] = Math.max(0, Math.round((this.teamFunds[team] || 0) + amount));
    return this.teamFunds[team];
  }

  isB2UnlockedForTeam(team = 'US') {
    const reqKills = VEHICLE_STATS.B2_UNLOCK_KILLS || 25;
    return Boolean(this.b2UnlockedByTeam?.[team] || this.getTeamKills(team) >= reqKills);
  }

  findAvailableBaseVehicle(team = 'US', vehKey = 'foot') {
    if (!vehKey || vehKey === 'foot' || vehKey === 'wright_flyer') return null;
    if (vehKey === 'b2_spirit' && !this.isB2UnlockedForTeam(team)) return null;
    const bx =
      team === 'RU'
        ? (this.world?.spawns?.RU_BASE?.x ?? this.world?.ruBase?.x ?? 1520)
        : (this.world?.spawns?.US_BASE?.x ?? this.world?.usBase?.x ?? -1520);
    const bz =
      team === 'RU'
        ? (this.world?.spawns?.RU_BASE?.z ?? this.world?.ruBase?.z ?? 0)
        : (this.world?.spawns?.US_BASE?.z ?? this.world?.usBase?.z ?? 0);

    const matchesKey = (v) => {
      if (!v || v.dead || v.isShotDown || v.team !== team) return false;
      if (v.driver || v.remoteDriverId) return false; // Never take a human player's vehicle!
      if (String(v.id || '').startsWith('secret_')) return false;
      if (v.isAircraft) {
        return v.aircraftRole === vehKey && !v.b2LockedUntilKills;
      }
      if (v.isEmplacement) return false;
      if (vehKey === 'car') return v.type === 'humvee' || v.type === 'car';
      return v.type === vehKey;
    };

    // Pass 1: Prefer an unoccupied vehicle parked directly inside Main Base HQ (<= 340m) or on the HQ Flight Line
    for (const v of this.vehicles || []) {
      if (!matchesKey(v)) continue;
      if (v.npcDriver || v.aiPilotActive) continue;
      if (!v.isAircraft) {
        const distToBase = Math.hypot((v.pos?.x || 0) - bx, (v.pos?.z || 0) - bz);
        if (distToBase > 340) continue;
      }
      return v;
    }

    // Pass 2: Consistent Human Crew Priority at Main Base HQ (matches Combat Pilot <-> Armor Crewman <-> HQ Recon):
    // Even if AI bots boarded HQ Motor Pool Tanks/IFVs/SPAAG/Humvees (or launched an AI sortie) while the human
    // was on the Deploy Screen, any live non-destroyed fleet hull not used by another human is available for $0 HQ!
    let bestAiCandidate = null;
    let bestAiDist = Infinity;
    for (const v of this.vehicles || []) {
      if (!matchesKey(v)) continue;
      const d = Math.hypot((v.pos?.x || 0) - bx, (v.pos?.z || 0) - bz);
      if (d < bestAiDist) {
        bestAiDist = d;
        bestAiCandidate = v;
      }
    }
    return bestAiCandidate;
  }

  getHqVehicleRebuildSeconds(team = 'US', vehKey = 'foot') {
    if (!vehKey || vehKey === 'foot') return 0;
    let minRem = Infinity;
    for (const v of this.vehicles || []) {
      if (!v || !v.dead || v.team !== team || v.b2LockedUntilKills) continue;
      const isMatch = v.isAircraft
        ? v.aircraftRole === vehKey
        : vehKey === 'car'
        ? v.type === 'humvee' || v.type === 'car'
        : v.type === vehKey;
      if (isMatch && typeof v.respawnTimer === 'number' && v.respawnTimer > 0) {
        minRem = Math.min(minRem, v.respawnTimer);
      }
    }
    return Number.isFinite(minRem) ? Math.max(1, Math.ceil(minRem)) : 0;
  }

  claimBaseVehicleForPlayerDeploy(player, team = 'US', vehKey = 'foot') {
    const v = this.findAvailableBaseVehicle(team, vehKey);
    if (!v || !player) return null;

    const wasAiOccupied = Boolean(v.npcDriver || v.aiPilotActive);
    if (v.npcDriver) {
      const npc = v.npcDriver;
      v.npcDriver = null;
      npc.drivingVehicle = null;
      if (npc.mesh && !npc.dead) {
        npc.mesh.position.copy(npc.pos);
        npc.mesh.visible = true;
      }
    }
    if (Array.isArray(v.aiPassengers) && v.aiPassengers.length > 0) {
      for (const pax of v.aiPassengers) {
        if (pax) {
          pax.ridingVehicle = null;
          if (pax.mesh && !pax.dead) pax.mesh.visible = true;
        }
      }
      v.aiPassengers.length = 0;
    }
    v.aiPilotActive = false;

    const bx =
      team === 'RU'
        ? (this.world?.spawns?.RU_BASE?.x ?? this.world?.ruBase?.x ?? 1520)
        : (this.world?.spawns?.US_BASE?.x ?? this.world?.usBase?.x ?? -1520);
    const bz =
      team === 'RU'
        ? (this.world?.spawns?.RU_BASE?.z ?? this.world?.ruBase?.z ?? 0)
        : (this.world?.spawns?.US_BASE?.z ?? this.world?.usBase?.z ?? 0);
    const distFromHq = Math.hypot((v.pos?.x || 0) - bx, (v.pos?.z || 0) - bz);

    // Ensure any reclaimed HQ fleet vehicle starts cleanly at Main Base HQ at 100% HP & 100% Ordnance!
    v.hp = v.maxHp;
    v.hullIntegrityPct = 100;
    v.armorZones = { front: 100, left: 100, right: 100, rear: 100 };
    v.eraBlocksIntact = v.maxEraBlocks || 0;
    v.subsystems = { tracks: 'OK', turret: 'OK', engine: 'OK', optics: 'OK' };
    v.isShotDown = false;
    v.isStalling = false;
    v.stallSinkVel = 0;
    v.coaxHeat = 0;
    v.coaxOverheated = false;
    v.fireCooldown = 0;
    v.coaxCooldown = 0;
    this.rearmVehicleOrdnance(v);

    if (wasAiOccupied || distFromHq > 240) {
      const originPos = v.spawnPos
        ? v.spawnPos.clone()
        : new THREE.Vector3(bx + (team === 'RU' ? -56 : 56), 0, bz);
      const targetYaw =
        typeof v.spawnYaw === 'number' ? v.spawnYaw : team === 'RU' ? Math.PI / 2 : -Math.PI / 2;
      if (v.isAircraft) {
        const gY = this.world ? this.world.getGroundHeightAt(originPos.x, originPos.z) : 0;
        v.pos.set(originPos.x, gY, originPos.z);
        v.yaw = targetYaw;
        v.pitch = 0;
        v.roll = 0;
        v.turretYaw = targetYaw;
        v.throttle = 0;
        v.forwardSpeed = 0;
        v._heliVelX = 0;
        v._heliVelY = 0;
        v._heliVelZ = 0;
        v.heliHoverHold = false;
        v.flightFSM?.send(AIRCRAFT_FLIGHT_EVENTS.RESPAWN_RUNWAY);
      } else {
        const safePt = this.world?.findSafeVehicleSpawnPoint
          ? this.world.findSafeVehicleSpawnPoint(
              originPos.x,
              originPos.z,
              targetYaw,
              v.hullHalfWidth || 1.95,
              v.hullHalfLength || 3.55,
              this.vehicles
            )
          : originPos;
        const safeYaw = typeof safePt.safeYaw === 'number' ? safePt.safeYaw : targetYaw;
        safePt.y = this.world ? this.world.getGroundHeightAt(safePt.x, safePt.z) : 0;
        v.pos.copy(safePt);
        v.yaw = safeYaw;
        v.pitch = 0;
        v.roll = 0;
        v.turretYaw = safeYaw;
        v.turretPitch = 0;
        v.forwardSpeed = 0;
      }
      if (v.mesh) {
        v.mesh.position.copy(v.pos);
        v.mesh.rotation.set(0, v.yaw, 0, 'YXZ');
        v.mesh.visible = true;
      }
    }
    return v;
  }

  recordTeamKillAndCheckB2(team = 'US') {
    if (team !== 'US' && team !== 'RU') return false;
    // Do NOT count background menu-preview AI skirmishes toward the 25-kill B-2 unlock before the player deploys!
    if (this._suppressPreDeployKills) return false;
    if (!this.teamKills) this.teamKills = { US: 0, RU: 0 };
    if (!this.b2UnlockedByTeam) this.b2UnlockedByTeam = { US: false, RU: false };
    this.teamKills[team] = (this.teamKills[team] || 0) + 1;
    this.addTeamFunds(team, VEHICLE_STATS.FACTION_KILL_REWARD || 120);

    const reqKills = VEHICLE_STATS.B2_UNLOCK_KILLS || 25;
    if (!this.b2UnlockedByTeam[team] && this.teamKills[team] >= reqKills) {
      this.b2UnlockedByTeam[team] = true;
      for (const v of this.vehicles) {
        if (v && v.team === team && v.aircraftRole === 'b2_spirit' && v.b2LockedUntilKills) {
          v.b2LockedUntilKills = false;
          v.respawnTimer = 0.05;
        }
      }
      events.emit('xp:awarded', {
        amount: 0,
        reason: `🦇 ${team} FORCES REACHED ${reqKills} KILLS — NORTHROP B-2A SPIRIT CARPET BOMBER UNLOCKED AT HQ RUNWAY!`
      });
      return true;
    }
    return false;
  }

  initVehicles() {
    const era = this.world?.era || this.world?.mapDef?.era || 'modern';
    const defsToSpawn =
      era === 'medieval'
        ? MEDIEVAL_VEHICLE_DEFS
        : era === 'jurassic'
        ? JURASSIC_VEHICLE_DEFS
        : VEHICLE_DEFS;
    for (const def of defsToSpawn) {
      const [sx, sy, sz] = def.spawnPos;
      const isPlane = Boolean(def.type === 'plane' || def.isAircraft || def.isHelicopter);
      const isHeliDef = Boolean(
        def.isHelicopter ||
          def.aircraftRole === 'heli_transport' ||
          def.aircraftRole === 'heli_attack'
      );
      const isBikeOrAtv = Boolean(
        def.type === 'bike' ||
          def.type === 'atv' ||
          def.type === 'warhorse' ||
          def.type === 'trex_mount' ||
          def.type === 'raptor_mount' ||
          def.type === 'trebuchet' ||
          def.isWarehouseBike ||
          def.isHorseMount
      );
      const halfW = isPlane
        ? isHeliDef
          ? 3.8
          : 4.5
        : def.type === 'bike'
        ? 0.48
        : def.type === 'atv'
        ? 0.85
        : def.type === 'tank'
        ? 1.95
        : def.type === 'truck_transport'
        ? 1.55
        : def.type === 'apc'
        ? 1.65
        : 1.45;
      const halfL = isPlane
        ? isHeliDef
          ? 4.4
          : 4.8
        : def.type === 'bike'
        ? 1.02
        : def.type === 'atv'
        ? 1.22
        : def.type === 'tank'
        ? 3.55
        : def.type === 'truck_transport'
        ? 3.65
        : def.type === 'apc'
        ? 3.35
        : 2.65;
      let safeYaw = def.spawnYaw || 0;
      const safeSpawn = isPlane
        ? this.world.findSafeVehicleSpawnPoint
          ? (() => {
              const airSafe = this.world.findSafeVehicleSpawnPoint(
                sx,
                sz,
                safeYaw,
                7.2,
                6.2,
                this.vehicles,
                true
              );
              airSafe.y += sy || 0;
              return airSafe;
            })()
          : new THREE.Vector3(sx, this.world.getGroundHeightAt(sx, sz) + (sy || 0), sz)
        : this.world.findSafeVehicleSpawnPoint
        ? (() => {
            const gndSafe = this.world.findSafeVehicleSpawnPoint(
              sx,
              sz,
              safeYaw,
              halfW,
              halfL,
              this.vehicles,
              Boolean(def.isEmplacement || def.type === 'trebuchet')
            );
            if (typeof gndSafe.safeYaw === 'number') {
              safeYaw = gndSafe.safeYaw;
            }
            gndSafe.y += sy || 0;
            return gndSafe;
          })()
        : new THREE.Vector3(sx, this.world.getGroundHeightAt(sx, sz) + (sy || 0), sz);
      const safePatrolPoints = def.patrolPoints.map((p) => {
        if (isPlane) {
          return new THREE.Vector3(p[0], p[1] || 135, p[2]);
        }
        const pushed = this.world.pushOutOfBuildingFootprint
          ? this.world.pushOutOfBuildingFootprint(p[0], p[2], halfL + 5.5)
          : { x: p[0], z: p[2] };
        return new THREE.Vector3(pushed.x, this.world.getGroundHeightAt(pushed.x, pushed.z), pushed.z);
      });
      const cfg = {
        ...def,
        isAircraft: isPlane,
        spawnPos: safeSpawn,
        spawnYaw: safeYaw,
        patrolPoints: safePatrolPoints
      };
      this.spawnVehicle(cfg);
    }
  }

  spawnVehicle(cfg) {
    const { group, wheels, turretPivot, barrelGroup, dynamicNodes } = createVehicleMesh(cfg);
    group.position.copy(cfg.spawnPos);
    group.rotation.y = cfg.spawnYaw;
    this.scene.add(group);

    const isInitialReinforcement = false;
    const initialDelay = 0;

    const isHeli = Boolean(
      cfg.isHelicopter ||
        cfg.aircraftRole === 'heli_transport' ||
        cfg.aircraftRole === 'heli_attack'
    );
    const isPlane = Boolean(cfg.type === 'plane' || cfg.isAircraft || isHeli);
    const isRegularB2 = Boolean(
      isPlane && cfg.aircraftRole === 'b2_spirit' && !String(cfg.id || '').startsWith('secret_')
    );
    const b2Locked = isRegularB2 && !this.isB2UnlockedForTeam(cfg.team);
    if (isInitialReinforcement || b2Locked) {
      group.visible = false;
    }

    const isLightBikeOrMount = Boolean(
      cfg.isWarehouseBike ||
        cfg.type === 'bike' ||
        cfg.type === 'atv' ||
        cfg.type === 'warhorse' ||
        cfg.type === 'raptor_mount'
    );
    const isHeavyArmorType = Boolean(
      !isPlane && (cfg.type === 'tank' || cfg.type === 'apc' || cfg.type === 'aa' || cfg.type === 'trex_mount')
    );
    const ticketCost = isPlane
      ? cfg.aircraftRole === 'b2_spirit'
        ? VEHICLE_STATS.TICKET_COST_B2_SPIRIT || 45
        : cfg.aircraftRole === 'gunship'
        ? VEHICLE_STATS.TICKET_COST_GUNSHIP || 34
        : cfg.aircraftRole === 'heli_transport'
        ? VEHICLE_STATS.TICKET_COST_HELI_TRANSPORT || 18
        : cfg.aircraftRole === 'heli_attack'
        ? VEHICLE_STATS.TICKET_COST_HELI_ATTACK || 26
        : VEHICLE_STATS.TICKET_COST_PLANE || 30
      : cfg.type === 'tank' || cfg.type === 'trex_mount'
      ? VEHICLE_STATS.TICKET_COST_TANK || 24
      : cfg.type === 'apc' || cfg.type === 'aa'
      ? VEHICLE_STATS.TICKET_COST_APC || 16
      : cfg.type === 'truck_transport'
      ? VEHICLE_STATS.TICKET_COST_TRUCK || 6
      : isLightBikeOrMount
      ? 4
      : VEHICLE_STATS.TICKET_COST_HUMVEE || 8;
    const factionMoneyCost = isPlane
      ? cfg.aircraftRole === 'b2_spirit'
        ? VEHICLE_STATS.FACTION_COST_B2_SPIRIT || 2500
        : cfg.aircraftRole === 'heli_transport'
        ? VEHICLE_STATS.FACTION_COST_HELI_TRANSPORT || 700
        : cfg.aircraftRole === 'heli_attack'
        ? VEHICLE_STATS.FACTION_COST_HELI_ATTACK || 1150
        : VEHICLE_STATS.FACTION_COST_PLANE || 1500
      : cfg.type === 'tank'
      ? VEHICLE_STATS.FACTION_COST_TANK || 1300
      : cfg.type === 'apc'
      ? VEHICLE_STATS.FACTION_COST_APC || 800
      : cfg.type === 'aa'
      ? VEHICLE_STATS.FACTION_COST_AA || 850
      : cfg.type === 'truck_transport'
      ? VEHICLE_STATS.FACTION_COST_TRUCK || 250
      : cfg.type === 'humvee'
      ? VEHICLE_STATS.FACTION_COST_CAR || 350
      : 0;
    const ticketCategory = isPlane ? 'PLANE' : isHeavyArmorType ? 'TANK' : 'CAR';
    const statBlock = isPlane
      ? cfg.aircraftRole === 'heli_transport'
        ? cfg.team === 'RU' && VEHICLE_STATS.HELI_MI8
          ? VEHICLE_STATS.HELI_MI8
          : VEHICLE_STATS.HELI_TRANSPORT
        : cfg.aircraftRole === 'heli_attack'
        ? cfg.team === 'RU' && VEHICLE_STATS.HELI_KA52
          ? VEHICLE_STATS.HELI_KA52
          : VEHICLE_STATS.HELI_ATTACK
        : cfg.aircraftRole === 'wright_flyer'
        ? VEHICLE_STATS.PLANE_WRIGHT_FLYER
        : cfg.aircraftRole === 'b2_spirit'
        ? VEHICLE_STATS.PLANE_B2_SPIRIT
        : cfg.aircraftRole === 'fighter'
        ? VEHICLE_STATS.PLANE_FIGHTER
        : cfg.aircraftRole === 'gunship'
        ? VEHICLE_STATS.PLANE_GUNSHIP
        : cfg.aircraftRole === 'bomber'
        ? VEHICLE_STATS.PLANE_BOMBER
        : VEHICLE_STATS.PLANE_CAS
      : cfg.isEmplacement
      ? VEHICLE_STATS.EMPLACEMENT
      : cfg.type === 'tank'
      ? VEHICLE_STATS.TANK
      : cfg.type === 'aa'
      ? VEHICLE_STATS.AA_VEHICLE
      : cfg.type === 'apc'
      ? VEHICLE_STATS.APC
      : cfg.type === 'truck_transport'
      ? VEHICLE_STATS.TRUCK_TRANSPORT
      : cfg.type === 'atv'
      ? VEHICLE_STATS.ATV_QUAD
      : cfg.type === 'bike'
      ? VEHICLE_STATS.BIKE_250CC_2T
      : VEHICLE_STATS.HUMVEE;
    const turnRate =
      cfg.turnRate ?? statBlock.turnRate ?? (cfg.type === 'tank' ? 0.95 : cfg.type === 'apc' ? 1.22 : 1.45);
    const accelRate =
      cfg.accelRate ?? statBlock.accelRate ?? (cfg.type === 'tank' ? 1.35 : cfg.type === 'apc' ? 1.85 : 2.45);
    const brakeRate =
      cfg.brakeRate ?? statBlock.brakeRate ?? (cfg.type === 'tank' ? 2.2 : cfg.type === 'apc' ? 2.6 : 3.2);
    const hullHalfWidth = isPlane
      ? isHeli
        ? 3.8
        : cfg.aircraftRole === 'b2_spirit'
        ? 7.5
        : cfg.aircraftRole === 'wright_flyer'
        ? 6.2
        : 4.8
      : cfg.type === 'warhorse'
      ? 0.28
      : cfg.type === 'raptor_mount'
      ? 0.55
      : cfg.type === 'bike'
      ? 0.48
      : cfg.type === 'atv'
      ? 0.85
      : cfg.isEmplacement
      ? 1.15
      : cfg.type === 'tank'
      ? 1.95
      : cfg.type === 'truck_transport'
      ? 1.55
      : cfg.type === 'apc' || cfg.type === 'aa'
      ? 1.65
      : 1.45;
    const hullHalfLength = isPlane
      ? isHeli
        ? 4.4
        : 4.8
      : cfg.type === 'warhorse'
      ? 0.65
      : cfg.type === 'raptor_mount'
      ? 1.1
      : cfg.type === 'bike'
      ? 1.02
      : cfg.type === 'atv'
      ? 1.22
      : cfg.isEmplacement
      ? 1.15
      : cfg.type === 'tank'
      ? 3.55
      : cfg.type === 'truck_transport'
      ? 3.65
      : cfg.type === 'apc' || cfg.type === 'aa'
      ? 3.35
      : 2.65;
    const massTonnes =
      cfg.massTonnes ??
      statBlock.massTonnes ??
      (isPlane
        ? isHeli
          ? 10.2
          : 18
        : cfg.type === 'bike'
        ? 0.18
        : cfg.type === 'atv'
        ? 0.42
        : cfg.isEmplacement
        ? 2.5
        : cfg.type === 'tank'
        ? 65
        : cfg.type === 'truck_transport'
        ? 12.5
        : cfg.type === 'apc' || cfg.type === 'aa'
        ? 16
        : 5.5);

    const vehicle = {
      ...cfg,
      isAircraft: isPlane,
      isHelicopter: isHeli,
      turnRate,
      accelRate,
      brakeRate,
      minTurnRadiusM: cfg.minTurnRadiusM ?? statBlock.minTurnRadiusM ?? null,
      maxLatAccelMs2: cfg.maxLatAccelMs2 ?? statBlock.maxLatAccelMs2 ?? null,
      canNeutralPivot: Boolean(cfg.canNeutralPivot ?? statBlock.canNeutralPivot ?? false),
      maxTurnAccelMs2: cfg.maxTurnAccelMs2 ?? statBlock.maxTurnAccelMs2 ?? null,
      hullHalfWidth,
      hullHalfLength,
      massTonnes,
      ticketCost,
      factionMoneyCost,
      ticketCategory,
      b2LockedUntilKills: b2Locked,
      hp: cfg.maxHp,
      hullIntegrityPct: 100,
      armorZones: { front: 100, left: 100, right: 100, rear: 100 },
      maxEraBlocks: cfg.type === 'tank' ? 6 : cfg.type === 'apc' ? 2 : 0,
      eraBlocksIntact: cfg.type === 'tank' ? 6 : cfg.type === 'apc' ? 2 : 0,
      subsystems: { tracks: 'OK', turret: 'OK', engine: 'OK', optics: 'OK' },
      airframeParts: isPlane
        ? { leftWing: 100, rightWing: 100, engines: 100, tail: 100, avionics: 100, cockpit: 100 }
        : null,
      lastAirframePart: null,
      lastHitZone: 'FRONT',
      lastHitDesc: '',
      climbOffsetY: 0,
      armor: cfg.type === 'warhorse' ? cfg.maxArmor || 120 : 0,
      maxArmor: cfg.type === 'warhorse' ? cfg.maxArmor || 120 : 0,
      dead: isInitialReinforcement || b2Locked,
      respawnTimer: b2Locked ? 999999 : initialDelay,
      replacementTicketPaid: false,
      _killCredited: false,
      pos: group.position,
      yaw: cfg.spawnYaw,
      pitch: 0,
      roll: 0,
      turretYaw: cfg.spawnYaw,
      turretPitch: 0,
      forwardSpeed: 0,
      flareCooldown: 0,
      flareActiveTimer: 0,
      aiPilotActive: false,
      aiSortieLaunchDelay: isPlane ? 2.5 + Math.random() * 2.5 : 0,
      driver: null,
      npcDriver: null,
      activeWeaponSlot: 0, // 0 = Main Cannon / Primary, 1 = Secondary / Rockets / A2A Missiles
      maxFireCooldown: 60 / (cfg.rpm || 18),
      fireCooldown: 0,
      coaxCooldown: 0,
      coaxHeat: 0,
      coaxOverheated: false,
      barrelRecoil: 0,
      patrolIndex: 0,
      aiFireTimer: cfg.isAirbaseDefenseBattery ? 0.12 : 1.5 + Math.random() * 2.5,
      setupState: cfg.type === 'trebuchet' ? 'UNSET' : 'READY_FIRING',
      setupProgress: cfg.type === 'trebuchet' ? 0 : 1.0,
      crewCalled: false,
      assignedCrewBots: [],
      armSwingTimer: 0,
      bouldersLaunched: 0,
      commandedTargetPos: null,
      mesh: group,
      turretPivot,
      barrelGroup,
      wheels,
      dynamicNodes: dynamicNodes || group.userData?.dynamicNodes || null,
      controlSurfaces: group.userData?.controlSurfaces || null,
      vortexTimer: 0
    };

    if (cfg.type === 'trebuchet') {
      if (group.userData?.boulderMesh) group.userData.boulderMesh.visible = false;
      if (group.userData?.fireAuraMesh) group.userData.fireAuraMesh.visible = false;
      if (barrelGroup) barrelGroup.rotation.x = 0.52;
    }

    if (isPlane) {
      createAircraftFlightFSM(vehicle);
    } else {
      createGroundVehicleFSM(vehicle);
    }
    createVehicleSubsystemsFSM(vehicle);
    const seatNames = getVehicleSeatLayout(vehicle);
    vehicle.seatNames = seatNames;
    vehicle.crewSeats = new Array(seatNames.length).fill(null);
    vehicle.aiPassengers = [];
    initVehicleOrdnance(vehicle);

    const vehHitMeshes = [];
    vehicle.hitMeshes = vehHitMeshes;
    vehicle.hitRadius = isPlane
      ? cfg.type === 'gunship' ||
        cfg.type === 'bomber' ||
        cfg.aircraftRole === 'gunship' ||
        cfg.aircraftRole === 'bomber' ||
        cfg.aircraftRole === 'b2_spirit'
        ? 24.0
        : 13.0
      : 6.5;
    vehicle.fleetIndex = this.vehicles.length;

    group.traverse((child) => {
      if (child.isMesh) {
        child.userData.vehicle = vehicle;
        if (!child.userData.skipHitbox) {
          vehHitMeshes.push(child);
          this.hitMeshes.push(child);
        }
      }
    });

    this.vehicles.push(vehicle);
    return vehicle;
  }

  /**
   * Spawns or repositions the player's personal Armored Warhorse (`warhorse`) when deploying
   * as `mounted_knight` ("Knight on Horse with Bow") in the Medieval Era!
   */
  spawnOrGetPersonalMount(team = 'US', worldPos, yaw = 0, mountType = 'warhorse') {
    const mountId = `player_personal_${mountType}_${team.toLowerCase()}`;
    let existing = this.vehicles.find((v) => v && v.id === mountId);
    const spawnPos = new THREE.Vector3(
      worldPos.x,
      this.world.getGroundHeightAt(worldPos.x, worldPos.z),
      worldPos.z
    );
    if (existing) {
      existing.dead = false;
      existing.hp = existing.maxHp || 340;
      existing.armor = existing.maxArmor || 120;
      existing.respawnTimer = 0;
      existing.driver = null;
      existing.npcDriver = null;
      existing.pos.copy(spawnPos);
      existing.yaw = yaw;
      existing.turretYaw = yaw;
      existing.forwardSpeed = 0;
      existing.mesh.visible = true;
      existing.mesh.position.copy(spawnPos);
      existing.mesh.rotation.set(0, yaw, 0);
      return existing;
    }

    const cfg = {
      id: mountId,
      name:
        team === 'RU'
          ? 'IMPERIAL ROYAL WARHORSE (KNIGHT LONGBOW)'
          : 'ROYAL BARDED DESTRIER WARHORSE (KNIGHT LONGBOW)',
      type: mountType,
      isHorseMount: true,
      team,
      spawnPos,
      spawnYaw: yaw,
      maxHp: 340,
      speed: 13.5,
      accelRate: 1.95,
      brakeRate: 4.5,
      turnRate: 1.85,
      weaponType: 'mounted_warbow',
      rpm: 95,
      patrolPoints: [spawnPos.clone()]
    };
    return this.spawnVehicle(cfg);
  }

  /**
   * Spawns a Squad-style Mountable Base-Building Emplacement (`emplace_hmg`, `emplace_aa`, `emplace_mortar`)
   * inside a constructed gun pit so the player or AI can mount it with [E] and operate it!
   */
  spawnEmplacement(emplaceType, team = 'US', worldPos, yaw = 0) {
    const isUS = team === 'US';
    const nameMap = {
      emplace_hmg: isUS ? '.50 CAL M2HB HMG EMPLACEMENT' : 'NSV 12.7MM HMG EMPLACEMENT',
      emplace_aa: isUS ? 'C-RAM / ZU-23-2 AA + STINGER EMPLACEMENT' : 'ZU-23-2 TWIN 23MM + IGLA AA EMPLACEMENT',
      emplace_mortar: isUS ? '81MM M252 INDIRECT-FIRE MORTAR PIT' : '82MM 2B14 PODNOS MORTAR PIT',
      trebuchet: isUS ? 'ROYAL COUNTERWEIGHT SIEGE TREBUCHET' : 'IMPERIAL COUNTERWEIGHT SIEGE TREBUCHET'
    };
    const rpmMap = {
      emplace_hmg: VEHICLE_STATS.RPM_EMPLACE_HMG || 750,
      emplace_aa: VEHICLE_STATS.RPM_EMPLACE_AA || 1100,
      emplace_mortar: VEHICLE_STATS.RPM_MORTAR || 24,
      trebuchet: 28
    };
    const weaponMap = {
      emplace_hmg: 'hmg',
      emplace_aa: 'aa_autocannon',
      emplace_mortar: 'mortar_tube',
      trebuchet: 'trebuchet_boulder'
    };
    const cfg = {
      id: `${team.toLowerCase()}_${emplaceType}_${Date.now()}_${Math.floor(Math.random() * 999)}`,
      name: nameMap[emplaceType] || '.50 CAL HMG EMPLACEMENT',
      type: emplaceType,
      isEmplacement: true,
      team,
      spawnPos: worldPos.clone(),
      spawnYaw: yaw,
      maxHp: VEHICLE_STATS.EMPLACEMENT.maxHp || 650,
      speed: 0,
      weaponType: weaponMap[emplaceType] || 'hmg',
      rpm: rpmMap[emplaceType] || 750,
      coaxRpm: 35,
      patrolPoints: []
    };
    return this.spawnVehicle(cfg);
  }

  /**
   * Finds the nearest friendly (or uncrewed) Siege Trebuchet within `maxDist` meters of `pos`.
   */
  findNearestTrebuchet(pos, maxDist = 85.0, team = null) {
    let best = null;
    let bestDist = maxDist;
    for (const v of this.vehicles) {
      if (!v || v.dead || v.type !== 'trebuchet') continue;
      if (team && v.team !== team) continue;
      const d = v.pos.distanceTo(pos);
      if (d <= bestDist) {
        bestDist = d;
        best = v;
      }
    }
    return best;
  }

  /**
   * Summons 3 nearby friendly soldiers to run over to a Siege Trebuchet (`treb`), wind the
   * counterweight winch wheels to set it up (`setupProgress: 0 -> 1.0`), load flaming boulders,
   * and continuously hurl boulders toward enemy concentrations & castles!
   * If no friendly trebuchet is within 55m, constructs a new Field Siege Trebuchet frame 9m ahead of the player!
   */
  callMenToSetupTrebuchet(player, botManager, preferredTrebuchet = null) {
    if (!player) return null;
    const team = player.team || 'US';
    let treb = preferredTrebuchet || this.findNearestTrebuchet(player.pos, 65.0, team);

    if (!treb) {
      const fwd = new THREE.Vector3(-Math.sin(player.yaw || 0), 0, -Math.cos(player.yaw || 0));
      const rawX = player.pos.x + fwd.x * 9.5;
      const rawZ = player.pos.z + fwd.z * 9.5;
      const safe = this.world?.pushOutOfBuildingFootprint
        ? this.world.pushOutOfBuildingFootprint(rawX, rawZ, 4.5)
        : { x: rawX, z: rawZ };
      const spawnPos = new THREE.Vector3(
        safe.x,
        this.world ? this.world.getGroundHeightAt(safe.x, safe.z) : player.pos.y,
        safe.z
      );
      treb = this.spawnEmplacement('trebuchet', team, spawnPos, player.yaw || 0);
    }

    // Designate target point along player's sightline (or towards enemy territory)
    const lookFwd = new THREE.Vector3(-Math.sin(player.yaw || 0), 0, -Math.cos(player.yaw || 0));
    const aimDist = 185;
    const tx = THREE.MathUtils.clamp(treb.pos.x + lookFwd.x * aimDist, -980, 980);
    const tz = THREE.MathUtils.clamp(treb.pos.z + lookFwd.z * aimDist, -580, 580);
    const ty = this.world ? this.world.getGroundHeightAt(tx, tz) : 0;
    treb.commandedTargetPos = new THREE.Vector3(tx, ty + 0.5, tz);

    // Summon up to 3 friendly infantry bots to crew & winch this trebuchet
    const crewBots = [];
    if (botManager && Array.isArray(botManager.bots)) {
      const candidates = botManager.bots
        .filter(
          (b) =>
            b &&
            !b.dead &&
            !b.downed &&
            !b.drivingVehicle &&
            b.team === team &&
            (!b.assignedTrebuchet || b.assignedTrebuchet === treb)
        )
        .sort((a, b) => a.pos.distanceToSquared(treb.pos) - b.pos.distanceToSquared(treb.pos));

      for (let i = 0; i < Math.min(3, candidates.length); i++) {
        const b = candidates[i];
        b.assignedTrebuchet = treb;
        b.trebuchetCrewSlot = i;
        // If the summoned soldier is far away (>22m), rally them close to the trebuchet so the player sees them run up!
        if (b.pos.distanceTo(treb.pos) > 22) {
          const angle = (player.yaw || 0) + Math.PI + (i - 1) * 0.65;
          const rx = treb.pos.x + Math.cos(angle) * 11.5;
          const rz = treb.pos.z + Math.sin(angle) * 11.5;
          b.pos.set(rx, this.world ? this.world.getGroundHeightAt(rx, rz) : treb.pos.y, rz);
          if (b.mesh) b.mesh.position.copy(b.pos);
        }
        crewBots.push(b);
      }
    }

    treb.assignedCrewBots = crewBots;
    treb.crewCalled = true;
    if ((treb.setupProgress || 0) < 1.0) {
      treb.setupState = 'SETTING_UP';
      treb.setupProgress = Math.max(treb.setupProgress || 0, 0.25);
    } else {
      treb.setupState = 'READY_FIRING';
      this.fireTrebuchetBoulder(treb, treb.commandedTargetPos, player, botManager);
    }

    sound.playRadioBeep?.(false);
    if (player.onAwardXp) {
      player.onAwardXp(
        35,
        treb.setupState === 'READY_FIRING'
          ? `☄️ SIEGE CREW (${crewBots.length} MEN) LAUNCHING BOULDER BARRAGE FROM ${treb.name}!`
          : `🏰 CALLED ${crewBots.length} MEN TO SET UP ${treb.name} & HURL BOULDERS AT THE ENEMY!`
      );
    }
    return treb;
  }

  /**
   * Launches a flaming counterweight stone boulder from a Siege Trebuchet (`v`) toward `targetPos`
   * with full throwing-arm whip animation!
   */
  fireTrebuchetBoulder(v, targetPos, player = null, botManager = null) {
    if (!v || v.dead || !targetPos) return false;
    v.armSwingTimer = 1.15;
    v.barrelRecoil = 1.45;
    v.bouldersLaunched = (v.bouldersLaunched || 0) + 1;
    v.aiFireTimer = 4.2 + Math.random() * 1.6;

    const distToPlayer = player ? v.pos.distanceTo(player.pos) : 999;
    if (distToPlayer < 220) {
      sound.playRocketLaunch?.(distToPlayer);
      if (player && distToPlayer < 35) {
        player.addShake?.(0.28);
      }
    }
    if (this.world?.spawnDebris) {
      this.world.spawnDebris(
        tmpVec3(v.pos.x, v.pos.y + 4.4, v.pos.z),
        COLOR_FIRE_ORANGE,
        7
      );
    }

    const g = PROJECTILES.MORTAR_SHELL?.gravity || 18.0;
    const dx = targetPos.x - v.pos.x;
    const dz = targetPos.z - v.pos.z;
    const dy = (targetPos.y || 0) - (v.pos.y + 4.8);
    const horizDist = Math.max(24, Math.hypot(dx, dz));
    const flightTime = THREE.MathUtils.clamp(2.1 + horizDist / 110, 2.1, 5.8);
    const vx = dx / flightTime;
    const vz = dz / flightTime;
    const vy = (dy + 0.5 * g * flightTime * flightTime) / flightTime;

    const mMesh = new THREE.Mesh(SHARED_TREB_BOULDER_GEO, SHARED_TREB_BOULDER_MAT);
    mMesh.position.set(v.pos.x, v.pos.y + 4.8, v.pos.z);
    this.scene.add(mMesh);

    const crewLead =
      (Array.isArray(v.assignedCrewBots) && v.assignedCrewBots.find((b) => b && !b.dead)) ||
      v.npcDriver ||
      (v.team === player?.team ? player : null) || {
        name: v.name,
        team: v.team,
        isAiVehicle: true,
        pos: v.pos.clone()
      };

    this.world.projectiles.push({
      type: 'mortar_shell',
      isTrebBoulder: true,
      weaponName: 'SIEGE TREBUCHET BOULDER',
      mesh: mMesh,
      vel: new THREE.Vector3(vx, vy, vz),
      gravity: g,
      life: flightTime + 2.5,
      blastRadius: 14.5,
      blastDamage: 380,
      owner: crewLead
    });
    return true;
  }

  findNearestEnterable(pos, maxDist = 7.5, playerTeam = null) {
    let best = null;
    let bestScore = Infinity;
    for (const v of this.vehicles) {
      if (v.dead) continue;
      const seatCount = v.seatNames ? v.seatNames.length : getVehicleSeatLayout(v).length;
      const hasRemoteDriver = Boolean(v.remoteDriverId);
      if (v.driver) continue;
      // Allow boarding a friendly human-driven multi-crew vehicle into an open Gunner/Passenger seat!
      if (hasRemoteDriver) {
        if (!playerTeam || v.team !== playerTeam || seatCount <= 1) continue;
        const remoteOccupied =
          1 + (v.remoteGunnerId ? 1 : 0) + (Array.isArray(v.remotePassengers) ? v.remotePassengers.length : 0);
        if (remoteOccupied >= seatCount) continue;
      }
      // Allow player to enter any unoccupied vehicle OR commandeer a friendly NPC-driven vehicle!
      if (v.npcDriver && playerTeam && v.team !== playerTeam) continue;
      if (v.isAircraft && v.aiPilotActive && playerTeam && v.team !== playerTeam) continue;
      const isActiveRidePickup = Boolean(
        v.rideTask && v.rideTask.active && v.rideTask.phase !== 'RTB_DEPART' && (!playerTeam || v.team === playerTeam)
      );
      const effMax = isActiveRidePickup && v.isHelicopter
        ? Math.max(maxDist, 14.5)
        : v.isAircraft
        ? Math.max(maxDist, 10.5)
        : isActiveRidePickup
        ? Math.max(maxDist, 9.5)
        : maxDist;
      const d = v.pos.distanceTo(pos);
      if (d >= effMax) continue;
      // Prioritize player's requested Ride vehicle symmetrically regardless of array order!
      const priorityBonus = isActiveRidePickup ? 12.0 : v.isAircraft ? 2.5 : 0;
      const score = d - priorityBonus;
      if (score < bestScore) {
        bestScore = score;
        best = v;
      }
    }
    return best;
  }

  /**
   * Replenishes 100% of finite vehicle ordnance pools + ERA blocks + countermeasures.
   */
  rearmVehicleOrdnance(v) {
    if (!v) return false;
    let rearmed = false;
    if (!v.maxOrdnancePools && !v.isSecretOmegaFlyer) {
      initVehicleOrdnance(v);
    }
    if (v.maxOrdnancePools && v.ordnancePools) {
      for (const k of Object.keys(v.maxOrdnancePools)) {
        if ((v.ordnancePools[k] ?? 0) < v.maxOrdnancePools[k]) {
          v.ordnancePools[k] = v.maxOrdnancePools[k];
          rearmed = true;
        }
      }
    }
    if ((v.eraBlocksIntact ?? 0) < (v.maxEraBlocks || 0)) {
      v.eraBlocksIntact = v.maxEraBlocks || 0;
      rearmed = true;
    }
    if ((v.flareCooldown || 0) > 0) {
      v.flareCooldown = 0;
      rearmed = true;
    }
    v.coaxHeat = 0;
    v.coaxOverheated = false;
    if (v.subsystems) {
      v.subsystems.tracks = 'OK';
      v.subsystems.turret = 'OK';
      v.subsystems.engine = 'OK';
      v.subsystems.optics = 'OK';
    }
    if (v.airframeParts) {
      v.airframeParts.leftWing = 100;
      v.airframeParts.rightWing = 100;
      v.airframeParts.engines = 100;
      v.airframeParts.tail = 100;
      v.airframeParts.avionics = 100;
      v.airframeParts.cockpit = 100;
    }
    v.opticsGlitchTimer = 0;
    v.sensorGlitchTimer = 0;
    return rearmed;
  }

  /**
   * Triggered when pressing `[R]` inside a ground vehicle:
   * Immediately rearms ordnance & patches hull if inside a Friendly FOB, HQ Motor Pool, or `[7]` Field Ammo Stash,
   * or displays clear tactical guidance if parked inside an uncaptured Neutral/Enemy FOB!
   */
  triggerManualVehicleRearm(v) {
    if (!v || v.dead || v.isAircraft) return false;
    const drv = v.driver;
    let inZone = Boolean(v.inRearmZone);
    if (!inZone) {
      const hqBase =
        v.team === 'RU'
          ? this.world?.spawns?.RU_BASE || { x: 1520, z: 0 }
          : this.world?.spawns?.US_BASE || { x: -1520, z: 0 };
      if (Math.hypot(v.pos.x - hqBase.x, v.pos.z - hqBase.z) <= 145) {
        inZone = true;
        v.activeSupplyLabel = 'HQ MOTOR POOL DEPOT';
      } else if (Array.isArray(this.world?.flags)) {
        for (let fi = 0; fi < this.world.flags.length; fi++) {
          const fl = this.world.flags[fi];
          if (
            fl &&
            fl.owner === v.team &&
            Math.hypot(v.pos.x - fl.pos.x, v.pos.z - fl.pos.z) <= (fl.radius || 34) + 10
          ) {
            inZone = true;
            v.activeSupplyLabel = `OBJ ${fl.id} FORWARD BASE DEPOT`;
            break;
          }
        }
      }
      if (!inZone && Array.isArray(this.world?.ammoCrates)) {
        for (let ci = 0; ci < this.world.ammoCrates.length; ci++) {
          const crate = this.world.ammoCrates[ci];
          if (
            crate &&
            (!crate.team || crate.team === v.team) &&
            crate.pos &&
            Math.hypot(v.pos.x - crate.pos.x, v.pos.z - crate.pos.z) <= 16.0
          ) {
            inZone = true;
            v.activeSupplyLabel = 'FIELD AMMO & VEHICLE LOGISTICS STASH [7]';
            break;
          }
        }
      }
      if (inZone) v.inRearmZone = true;
    }
    if (inZone) {
      const didRearm = this.rearmVehicleOrdnance(v);
      let didHeal = false;
      if (v.hp < v.maxHp) {
        v.hp = Math.min(v.maxHp, v.hp + 160);
        v.hullIntegrityPct = Math.round((v.hp / Math.max(1, v.maxHp)) * 100);
        didHeal = true;
      }
      sound.playReload?.();
      if (drv?.onAwardXp) {
        const lbl = v.activeSupplyLabel || 'VEHICLE LOGISTICS DEPOT';
        drv.onAwardXp(
          didRearm || didHeal ? 15 : 0,
          didRearm || didHeal
            ? `🛠️⛽ ${lbl}: ORDNANCE REARMED & HULL SERVICED!`
            : `✅ ${lbl}: ORDNANCE & HULL ALREADY AT 100%!`
        );
      }
      return true;
    }

    let uncapturedFob = null;
    if (Array.isArray(this.world?.flags)) {
      for (let fi = 0; fi < this.world.flags.length; fi++) {
        const fl = this.world.flags[fi];
        if (fl && Math.hypot(v.pos.x - fl.pos.x, v.pos.z - fl.pos.z) <= (fl.radius || 34) + 14) {
          uncapturedFob = fl;
          break;
        }
      }
    }
    sound.playEmptyClick?.();
    if (drv?.onAwardXp) {
      if (uncapturedFob && uncapturedFob.owner !== v.team) {
        const progPct = Math.round(Math.abs(uncapturedFob.captureProgress || 0));
        drv.onAwardXp(
          0,
          `⚠️ OBJ ${uncapturedFob.id} IS ${uncapturedFob.owner} (${progPct}%) — STAY IN CIRCLE TO CAPTURE FOB FIRST (OR DROP [7] AMMO STASH / RETURN TO HQ) TO RESUPPLY!`
        );
      } else {
        drv.onAwardXp(
          0,
          '⛽ NO VEHICLE DEPOT HERE — DRIVE TO CAPTURED FRIENDLY FOB, HQ MOTOR POOL, OR DEPLOY [7] AMMO STASH TO REARM!'
        );
      }
    }
    return false;
  }

  /**
   * Spawns a persistent 20-second burning 3D Vehicle Wreck at `vehicle.pos` providing real LOS/ballistic cover!
   */
  spawnVehicleWreck(vehicle) {
    if (
      !vehicle ||
      !this.scene ||
      vehicle.isWarehouseBike ||
      vehicle.type === 'bike' ||
      vehicle.type === 'atv' ||
      vehicle.type === 'warhorse' ||
      vehicle.type === 'raptor_mount' ||
      vehicle.type === 'trex_mount' ||
      vehicle.isSecretOmegaFlyer
    ) {
      return null;
    }
    if (!this.activeWrecks) this.activeWrecks = [];
    if (this.activeWrecks.length >= 14) {
      const oldest = this.activeWrecks.shift();
      if (oldest?.mesh) this.scene.remove(oldest.mesh);
    }
    const gY = this.world ? this.world.getGroundHeightAt(vehicle.pos.x, vehicle.pos.z) : vehicle.pos.y;
    const grp = new THREE.Group();
    const fireGlow = new THREE.Mesh(SHARED_WRECK_FIRE_GEO, SHARED_WRECK_FIRE_MAT);

    if (vehicle.isAircraft) {
      const aRole = vehicle.aircraftRole || 'fighter';
      grp.userData.wreckKind = 'aircraft';
      grp.userData.aircraftRole = aRole;

      // Ground crash scorch / skid crater disc
      const scorch = new THREE.Mesh(SHARED_AIR_SCORCH_GEO, SHARED_WRECK_SCORCH_MAT);
      scorch.position.set(0, 0.05, 0.4);
      scorch.scale.set(aRole === 'gunship' || aRole === 'b2_spirit' ? 1.45 : 1.05, 1, 1.35);
      grp.add(scorch);

      if (aRole === 'b2_spirit') {
        // Crashed Stealth Flying-Wing Wreck: nose-buried center body + sheared jagged delta wings (zero tail/turret!)
        const centerWing = new THREE.Mesh(SHARED_AIR_B2_CENTER_GEO, SHARED_WRECK_HULL_MAT);
        centerWing.name = 'aircraftWreckFuselage';
        centerWing.position.set(0, 0.58, -0.2);
        centerWing.rotation.set(-0.18, 0.08, 0.11);
        grp.add(centerWing);

        const leftWing = new THREE.Mesh(SHARED_AIR_B2_WING_GEO, SHARED_WRECK_CHAR_MAT);
        leftWing.name = 'aircraftWreckWingL';
        leftWing.position.set(-4.2, 0.85, 0.75);
        leftWing.rotation.set(-0.12, 0.42, 0.22);
        grp.add(leftWing);

        const rightWing = new THREE.Mesh(SHARED_AIR_B2_WING_GEO, SHARED_WRECK_CHAR_MAT);
        rightWing.name = 'aircraftWreckWingR';
        rightWing.position.set(4.1, 0.24, 1.35); // Sheared starboard wing lying flat on ground
        rightWing.rotation.set(0.05, -0.58, -0.08);
        grp.add(rightWing);

        fireGlow.position.set(-0.4, 0.95, 0.35);
        fireGlow.scale.set(1.45, 1.1, 1.35);
      } else if (aRole === 'gunship') {
        // Crashed AC-130J / Tu-95MS Heavy Gunship Wreck: broken pressurized cargo tube + high wing + tall vertical tail fin
        const cargoBody = new THREE.Mesh(SHARED_AIR_CARGO_FUSELAGE_GEO, SHARED_WRECK_HULL_MAT);
        cargoBody.name = 'aircraftWreckFuselage';
        cargoBody.position.set(0, 1.02, 0);
        cargoBody.rotation.set(Math.PI / 2 - 0.14, 0.06, 0.12);
        grp.add(cargoBody);

        const portWing = new THREE.Mesh(SHARED_AIR_CARGO_WING_GEO, SHARED_WRECK_CHAR_MAT);
        portWing.name = 'aircraftWreckWingL';
        portWing.position.set(-3.4, 1.35, -0.35);
        portWing.rotation.set(0.08, 0.12, 0.28);
        grp.add(portWing);

        const stbdWing = new THREE.Mesh(SHARED_AIR_CARGO_WING_GEO, SHARED_WRECK_CHAR_MAT);
        stbdWing.name = 'aircraftWreckWingR';
        stbdWing.position.set(3.8, 0.32, 0.65);
        stbdWing.rotation.set(-0.06, -0.34, -0.14);
        grp.add(stbdWing);

        const tallFin = new THREE.Mesh(SHARED_AIR_TAIL_FIN_GEO, SHARED_WRECK_CHAR_MAT);
        tallFin.name = 'aircraftWreckTailFin';
        tallFin.position.set(0.18, 2.25, 4.15);
        tallFin.scale.set(1.3, 1.45, 1.35);
        tallFin.rotation.set(-0.16, 0.08, 0.15);
        grp.add(tallFin);

        fireGlow.position.set(-0.65, 1.65, -0.45);
        fireGlow.scale.set(1.6, 1.35, 1.5);
      } else if (aRole === 'wright_flyer') {
        // Crashed 1903 Biplane Wreck: splintered upper/lower spruce-and-canvas wings + broken skids
        const lowerWing = new THREE.Mesh(SHARED_AIR_WING_GEO, SHARED_WRECK_WOOD_CHAR_MAT);
        lowerWing.name = 'aircraftWreckWingL';
        lowerWing.position.set(0, 0.32, 0);
        lowerWing.scale.set(1.55, 0.85, 0.9);
        lowerWing.rotation.set(0.08, 0.14, -0.09);
        grp.add(lowerWing);

        const upperWing = new THREE.Mesh(SHARED_AIR_WING_GEO, SHARED_WRECK_CHAR_MAT);
        upperWing.name = 'aircraftWreckFuselage';
        upperWing.position.set(0.25, 0.88, -0.35);
        upperWing.scale.set(1.48, 0.85, 0.9);
        upperWing.rotation.set(-0.24, -0.18, 0.26);
        grp.add(upperWing);

        fireGlow.position.set(0, 0.82, 0.1);
        fireGlow.scale.set(0.95, 0.9, 0.95);
      } else {
        // Crashed Jet Fighter / Bomber / A-10 CAS Wreck: nose-buried fuselage + swept wings + canted twin tail fins + jet nozzles!
        const fuselage = new THREE.Mesh(SHARED_AIR_FUSELAGE_GEO, SHARED_WRECK_HULL_MAT);
        fuselage.name = 'aircraftWreckFuselage';
        fuselage.position.set(0, 0.72, 0.1);
        fuselage.rotation.set(Math.PI / 2 - 0.22, 0.05, 0.14); // Nose buried at -12.6° into ground
        grp.add(fuselage);

        const leftWing = new THREE.Mesh(SHARED_AIR_WING_GEO, SHARED_WRECK_CHAR_MAT);
        leftWing.name = 'aircraftWreckWingL';
        leftWing.position.set(-2.35, 0.92, 0.35);
        leftWing.rotation.set(-0.08, aRole === 'cas' ? 0.06 : 0.34, 0.26); // Tilted skyward
        grp.add(leftWing);

        const rightWing = new THREE.Mesh(SHARED_AIR_WING_GEO, SHARED_WRECK_CHAR_MAT);
        rightWing.name = 'aircraftWreckWingR';
        rightWing.position.set(2.65, 0.22, 1.05); // Sheared wing slab torn off on ground
        rightWing.rotation.set(0.04, aRole === 'cas' ? -0.18 : -0.48, -0.11);
        grp.add(rightWing);

        for (const s of [-1, 1]) {
          const tailFin = new THREE.Mesh(SHARED_AIR_TAIL_FIN_GEO, SHARED_WRECK_HULL_MAT);
          tailFin.name = s < 0 ? 'aircraftWreckTailFinL' : 'aircraftWreckTailFinR';
          tailFin.position.set(s * (aRole === 'cas' ? 1.15 : 0.58), 1.48, 3.05);
          tailFin.rotation.set(-0.18, 0.05, s * -0.24 + 0.12);
          grp.add(tailFin);

          const nozzle = new THREE.Mesh(SHARED_AIR_NOZZLE_GEO, SHARED_WRECK_CHAR_MAT);
          nozzle.position.set(
            s * 0.42,
            aRole === 'cas' ? 1.38 : 0.96,
            aRole === 'cas' ? 1.85 : 3.65
          );
          nozzle.rotation.x = Math.PI / 2 - 0.2;
          grp.add(nozzle);
        }

        fireGlow.position.set(0.1, 1.15, -0.35);
        fireGlow.scale.set(1.25, 1.1, 1.25);
      }
      grp.add(fireGlow);
    } else if (vehicle.type === 'humvee' || vehicle.isEmplacement) {
      // Charred 4x4 Tactical Truck / Emplacement Wreck (NO tank turret!)
      grp.userData.wreckKind = 'truck';
      const chassis = new THREE.Mesh(SHARED_WRECK_HULL_GEO, SHARED_WRECK_HULL_MAT);
      chassis.position.set(0, 0.62, 0);
      chassis.scale.set(0.76, 0.72, 0.78);
      grp.add(chassis);

      const cab = new THREE.Mesh(SHARED_WRECK_CAB_GEO, SHARED_WRECK_CHAR_MAT);
      cab.name = 'truckWreckCab';
      cab.position.set(0, 1.24, 0.15);
      cab.rotation.set(-0.06, 0.04, 0.08);
      grp.add(cab);

      fireGlow.position.set(0, 1.18, -1.15); // Burning front V8 engine bay
      fireGlow.scale.set(0.92, 0.92, 0.92);
      grp.add(fireGlow);
    } else {
      // Heavy Armored Tank / IFV / SPAAG Wreck: charred hull + blown-off tilted turret + snapped cannon barrel
      grp.userData.wreckKind = 'armor';
      const hull = new THREE.Mesh(SHARED_WRECK_HULL_GEO, SHARED_WRECK_HULL_MAT);
      hull.position.set(0, 0.78, 0);
      const scaleX = vehicle.type === 'tank' ? 1.05 : 0.88;
      const scaleZ = vehicle.type === 'tank' ? 1.05 : 0.9;
      hull.scale.set(scaleX, 1.0, scaleZ);
      grp.add(hull);

      const turret = new THREE.Mesh(SHARED_WRECK_TURRET_GEO, SHARED_WRECK_CHAR_MAT);
      turret.name = 'tankWreckTurret';
      turret.position.set(0.15, 1.65, -0.2);
      turret.rotation.set(0.14, 0.38, -0.18);
      grp.add(turret);

      const barrel = new THREE.Mesh(SHARED_WRECK_BARREL_GEO, SHARED_WRECK_HULL_MAT);
      barrel.name = 'tankWreckBarrel';
      barrel.position.set(0.72, 1.48, -2.05);
      barrel.rotation.set(Math.PI / 2 + 0.18, 0, -0.36); // Drooping snapped main cannon barrel
      grp.add(barrel);

      fireGlow.position.set(0, 1.45, 0.35);
      grp.add(fireGlow);
    }

    grp.position.set(vehicle.pos.x, gY, vehicle.pos.z);
    grp.rotation.set(vehicle.isAircraft ? -0.04 : 0.05, vehicle.yaw || 0, -0.06);
    this.scene.add(grp);

    const wreck = {
      id: `wreck_${vehicle.id}_${Date.now()}`,
      wreckKind: grp.userData.wreckKind,
      mesh: grp,
      fireMesh: fireGlow,
      pos: new THREE.Vector3(vehicle.pos.x, gY, vehicle.pos.z),
      radius: vehicle.isAircraft ? 4.2 : vehicle.type === 'tank' ? 3.2 : 2.7,
      height: vehicle.isAircraft ? 2.15 : 2.35,
      life: 20.0,
      maxLife: 20.0,
      smokeTimer: 0
    };
    this.activeWrecks.push(wreck);
    return wreck;
  }

  clearAllWrecks() {
    if (!Array.isArray(this.activeWrecks)) return;
    for (const w of this.activeWrecks) {
      if (w?.mesh && this.scene) {
        this.scene.remove(w.mesh);
      }
    }
    this.activeWrecks.length = 0;
  }

  /**
   * Fast 3D Cylinder/AABB Raycast against active 20s Burning Vehicle Wrecks for infantry tactical cover!
   */
  raycastWreckCover(origin, dir, maxDist = 120) {
    if (!Array.isArray(this.activeWrecks) || this.activeWrecks.length === 0 || !origin || !dir) {
      return null;
    }
    let bestHit = null;
    let bestT = maxDist;
    for (let i = 0; i < this.activeWrecks.length; i++) {
      const w = this.activeWrecks[i];
      if (!w || w.life <= 0) continue;
      const wx = w.pos.x - origin.x;
      const wy = w.pos.y + w.height * 0.5 - origin.y;
      const wz = w.pos.z - origin.z;
      const proj = wx * dir.x + wy * dir.y + wz * dir.z;
      if (proj < 0.6 || proj > bestT) continue;
      const cx = origin.x + dir.x * proj - w.pos.x;
      const cy = origin.y + dir.y * proj - w.pos.y;
      const cz = origin.z + dir.z * proj - w.pos.z;
      if (cy >= -0.2 && cy <= w.height && cx * cx + cz * cz <= w.radius * w.radius) {
        bestT = proj;
        bestHit = w;
      }
    }
    return bestHit;
  }

  /**
   * Finds or launches a friendly Combat Aircraft ('cas' A-10C/Su-25, 'bomber' F-15E/Su-34, or 'fighter' F-22A/Su-57)
   * directly into an airborne sortie over the battlefield for the player!
   */
  findOrLaunchPlayerAircraft(player, preferredRole = 'cas', allowSecretBypass = false) {
    if (!player) return null;
    const team = player.team || 'US';
    if (preferredRole === 'b2_spirit' && !allowSecretBypass && !this.isB2UnlockedForTeam(team)) {
      return null;
    }

    let plane =
      this.vehicles.find(
        (v) =>
          v.isAircraft &&
          v.team === team &&
          v.aircraftRole === preferredRole &&
          !v.driver &&
          !v.remoteDriverId &&
          (allowSecretBypass || (!v.b2LockedUntilKills && (!v.dead || v.respawnTimer <= 0.5)))
      ) ||
      (preferredRole !== 'b2_spirit'
        ? this.vehicles.find(
            (v) =>
              v.isAircraft &&
              v.team === team &&
              !v.driver &&
              !v.b2LockedUntilKills &&
              (!v.dead || v.respawnTimer <= 0.5)
          )
        : null);

    // Dynamically spawn a B-2A Spirit or 1903 Wright Flyer I ONLY when `allowSecretBypass` is true
    if (!plane && preferredRole === 'b2_spirit' && allowSecretBypass) {
      plane = this.spawnVehicle({
        id: `secret_b2_spirit_${team.toLowerCase()}_${Date.now()}`,
        name:
          team === 'RU'
            ? 'PAK DA / B-2A SPIRIT STEALTH BOMBER'
            : 'NORTHROP B-2A SPIRIT STEALTH BOMBER',
        type: 'plane',
        aircraftRole: 'b2_spirit',
        isAircraft: true,
        isStealthAircraft: true,
        stealthFactor: 0.12,
        team,
        spawnPos: new THREE.Vector3(player.pos.x, 185, player.pos.z),
        spawnYaw: team === 'US' ? -Math.PI / 2 : Math.PI / 2,
        maxHp: 850,
        speed: 125.0,
        weaponType: 'b2_carpet_bomb',
        secondaryWeaponType: 'b2_precision_jdam',
        rpm: 380,
        coaxRpm: 95,
        patrolPoints: []
      });
    } else if (!plane && preferredRole === 'wright_flyer' && allowSecretBypass) {
      plane = this.spawnVehicle({
        id: `secret_wright_flyer_${team.toLowerCase()}_${Date.now()}`,
        name: '1903 WRIGHT FLYER I',
        type: 'plane',
        aircraftRole: 'wright_flyer',
        isAircraft: true,
        isSecretOmegaFlyer: true,
        isStealthAircraft: true,
        stealthFactor: 0.05,
        team,
        spawnPos: new THREE.Vector3(player.pos.x, 75, player.pos.z),
        spawnYaw: team === 'US' ? -Math.PI / 2 : Math.PI / 2,
        maxHp: 99999,
        speed: 235.0,
        weaponType: 'wright_gatling',
        secondaryWeaponType: 'wright_dynamite',
        rpm: 1200,
        coaxRpm: 180,
        patrolPoints: []
      });
    }
    if (plane && preferredRole === 'wright_flyer' && allowSecretBypass) {
      plane.isSecretOmegaFlyer = true;
      plane.speed = 145.0;
      plane.maxSpeed = 235.0;
      plane.maxHp = 99999;
      plane.hp = 99999;
    }

    if (!plane) return null;

    if (plane.npcDriver) {
      plane.npcDriver.drivingVehicle = null;
      plane.npcDriver = null;
    }

    plane.dead = false;
    plane.hp = plane.maxHp;
    plane.mesh.visible = true;
    plane.aiPilotActive = false;
    plane.coaxHeat = 0;
    plane.coaxOverheated = false;
    plane.fireCooldown = 0;
    plane.coaxCooldown = 0;

    // Position the aircraft airborne entering over the player's sector heading toward enemy lines
    const isHeliLaunch = Boolean(
      plane.isHelicopter ||
        plane.aircraftRole === 'heli_transport' ||
        plane.aircraftRole === 'heli_attack'
    );
    if (isHeliLaunch) plane.isHelicopter = true;
    const entryBackDist = isHeliLaunch ? 24 : 140;
    const headingYaw = team === 'US' ? -Math.PI / 2 : Math.PI / 2;
    const startX = THREE.MathUtils.clamp(
      player.pos.x + (team === 'US' ? -entryBackDist : entryBackDist),
      -2450,
      2450
    );
    const startZ = THREE.MathUtils.clamp(player.pos.z, -1650, 1650);
    const gStart = this.world ? this.world.getGroundHeightAt(startX, startZ) : 0;
    const alt = isHeliLaunch
      ? Math.max(gStart + 38, 44)
      : plane.aircraftRole === 'wright_flyer'
      ? 62
      : plane.aircraftRole === 'b2_spirit'
      ? 185
      : plane.aircraftRole === 'gunship'
      ? 165
      : plane.aircraftRole === 'fighter'
      ? 155
      : plane.aircraftRole === 'bomber'
      ? 145
      : 120;

    plane.pos.set(startX, alt, startZ);
    plane.yaw = headingYaw;
    plane.pitch = isHeliLaunch
      ? 0.0
      : plane.aircraftRole === 'wright_flyer'
      ? 0.0
      : plane.aircraftRole === 'gunship'
      ? -0.02
      : -0.04;
    plane.roll = plane.aircraftRole === 'gunship' ? 0.34 : 0;
    plane.orbitAssist = plane.aircraftRole === 'gunship';
    plane.turretYaw = headingYaw;
    plane.isShotDown = false;
    plane.isStalling = false;
    plane.stallSinkVel = 0;
    plane.heliHoverHold = false;
    plane.throttle = isHeliLaunch ? 0.48 : plane.aircraftRole === 'wright_flyer' ? 0.14 : 0.58;
    plane.forwardSpeed = isHeliLaunch
      ? 8.0
      : plane.aircraftRole === 'wright_flyer'
      ? 13.5
      : plane.speed ||
        (plane.aircraftRole === 'b2_spirit'
          ? 125
          : 62);
    if (isHeliLaunch) {
      plane._heliVelX = -Math.sin(headingYaw) * 8.0;
      plane._heliVelY = 0;
      plane._heliVelZ = -Math.cos(headingYaw) * 8.0;
    }
    plane.mesh.position.copy(plane.pos);
    plane.mesh.rotation.set(plane.pitch, plane.yaw, plane.roll, 'YXZ');

    return plane;
  }

  /**
   * Pilot Air Wing Requisition (`orderPlayerAircraft`):
   * Spends Faction Command Funds (`cas: $800`, `fighter: $900`, `gunship: $1200`, `b2_spirit: $2000`, `wright_flyer: $0`)
   * to either launch an immediate airborne sortie (`launchAirborne = true`) or park a fresh 100% HP aircraft
   * on the friendly HQ Side Flight-Line Parking Apron (`z = ∓86`, `launchAirborne = false`).
   */
  orderPlayerAircraft(player, aircraftRole = 'cas', launchAirborne = true) {
    if (!player) return { ok: false, reason: 'NO_PLAYER' };
    const era = this.world?.era || 'modern';
    if (era !== 'modern') {
      return { ok: false, reason: 'ERA_LOCKED' };
    }
    if (
      player.squadDoctrineEnabled !== false &&
      player.role !== 'pilot' &&
      aircraftRole !== 'heli_transport'
    ) {
      return { ok: false, reason: 'REQUIRES_PILOT_LICENSE' };
    }
    const team = player.team || 'US';
    const normRole = aircraftRole === 'bomber' ? 'b2_spirit' : aircraftRole || 'cas';
    const isHeliRole = normRole === 'heli_transport' || normRole === 'heli_attack';

    if (normRole === 'b2_spirit' && !this.isB2UnlockedForTeam(team)) {
      return {
        ok: false,
        reason: 'B2_LOCKED',
        kills: this.getTeamKills(team),
        reqKills: VEHICLE_STATS.B2_UNLOCK_KILLS || 25
      };
    }

    let cost = ECONOMY.VEHICLE_BASE_COST?.[normRole] ?? 1100;
    let paidAsStock = false;
    if (typeof player.payForVehicleRequisition === 'function') {
      const payRes = player.payForVehicleRequisition(normRole);
      if (!payRes.ok) {
        return payRes;
      }
      cost = payRes.cost;
      paidAsStock = Boolean(payRes.useStock);
    } else {
      const funds = this.getTeamFunds(team);
      if (cost > 0 && funds < cost) {
        return { ok: false, reason: 'INSUFFICIENT_FUNDS', cost, funds };
      }
      if (cost > 0) {
        this.addTeamFunds(team, -cost);
      }
    }

    let plane = this.vehicles.find(
      (v) =>
        v &&
        v.isAircraft &&
        v.team === team &&
        v.aircraftRole === normRole &&
        !v.driver &&
        !String(v.id || '').startsWith('secret_')
    );

    if (!plane) {
      const isRU = team === 'RU';
      const apronZ = isHeliRole
        ? normRole === 'heli_transport'
          ? isRU
            ? 44
            : -44
          : isRU
          ? -44
          : 44
        : isRU
        ? 138
        : -138;
      const apronX = isHeliRole
        ? isRU
          ? 1504
          : -1504
        : normRole === 'gunship'
        ? isRU
          ? 2876
          : -2876
        : normRole === 'b2_spirit'
        ? isRU
          ? 2828
          : -2828
        : normRole === 'cas'
        ? isRU
          ? 2780
          : -2780
        : isRU
        ? 2736
        : -2736;
      const gH = this.world ? this.world.getGroundHeightAt(apronX, apronZ) : 0;
      const nameByRole = {
        heli_transport: isRU
          ? 'MI-8AMTSH TERMINATOR TRANSPORT HELI (8 SEATS • PKT DOOR GUNS + S-8)'
          : 'UH-60M BLACK HAWK ASSAULT TRANSPORT (8 SEATS • TWIN M134 MINIGUNS)',
        heli_attack: isRU
          ? 'KA-52 ALLIGATOR COAXIAL ATTACK HELI (30MM 2A42 + S-8 + 8× VIKHR ATGM)'
          : 'AH-64E APACHE LONGBOW ATTACK HELI (30MM M230 + HYDRA + 8× HELLFIRE ATGM)',
        cas: isRU
          ? 'SU-25SM FROGFOOT (30MM + S-8 ROCKETS)'
          : 'A-10C WARTHOG (30MM GAU-8 + ROCKETS)',
        fighter: isRU
          ? 'SU-34 / SU-57 STRIKE FIGHTER (R-73 A2A + KAB-500 BOMBS)'
          : 'F-15EX / F-22A STRIKE FIGHTER (AIM-9X A2A + JDAM BOMBS)',
        gunship: isRU
          ? 'TU-95MS HEAVY GUNSHIP (25MM + 40MM + 105MM)'
          : 'AC-130J GHOSTRIDER GUNSHIP (25MM + 40MM BOFORS + 105MM)',
        b2_spirit: isRU
          ? 'PAK DA STEALTH CARPET BOMBER'
          : 'NORTHROP B-2A SPIRIT STEALTH BOMBER',
        wright_flyer: '1903 WRIGHT FLYER I'
      };
      const statByRole = {
        heli_transport: VEHICLE_STATS.HELI_TRANSPORT,
        heli_attack: VEHICLE_STATS.HELI_ATTACK,
        cas: VEHICLE_STATS.PLANE_CAS,
        fighter: VEHICLE_STATS.PLANE_FIGHTER,
        gunship: VEHICLE_STATS.PLANE_GUNSHIP,
        b2_spirit: VEHICLE_STATS.PLANE_B2_SPIRIT,
        wright_flyer: VEHICLE_STATS.PLANE_WRIGHT_FLYER
      };
      const sb = statByRole[normRole] || VEHICLE_STATS.PLANE_CAS;
      plane = this.spawnVehicle({
        id: `req_${normRole}_${team.toLowerCase()}_${Date.now()}`,
        name: nameByRole[normRole] || nameByRole.cas,
        type: 'plane',
        isAircraft: true,
        isHelicopter: isHeliRole,
        aircraftRole: normRole,
        isStealthAircraft: normRole === 'b2_spirit' || normRole === 'wright_flyer',
        stealthFactor: normRole === 'b2_spirit' ? 0.12 : normRole === 'wright_flyer' ? 0.25 : 1.0,
        team,
        spawnPos: new THREE.Vector3(apronX, gH, apronZ),
        spawnYaw: isHeliRole
          ? isRU
            ? Math.PI / 2
            : -Math.PI / 2
          : isRU
          ? Math.PI / 2 - 0.32
          : -Math.PI / 2 - 0.32,
        maxHp: sb.maxHp || 1550,
        speed: sb.speed || 62,
        minSpeed: sb.minSpeed ?? (isHeliRole ? 0 : 32),
        maxSpeed: sb.maxSpeed || 95,
        weaponType:
          normRole === 'heli_transport'
            ? 'heli_minigun'
            : normRole === 'heli_attack'
            ? 'heli_attack'
            : normRole === 'b2_spirit'
            ? 'b2_carpet_bomb'
            : normRole === 'wright_flyer'
            ? 'wright_gatling'
            : `plane_${normRole}`,
        secondaryWeaponType:
          normRole === 'b2_spirit'
            ? 'b2_precision_jdam'
            : normRole === 'wright_flyer'
            ? 'wright_dynamite'
            : undefined,
        rpm:
          normRole === 'heli_transport'
            ? VEHICLE_STATS.RPM_HELI_MINIGUN
            : normRole === 'heli_attack'
            ? VEHICLE_STATS.RPM_HELI_30MM
            : normRole === 'gunship'
            ? VEHICLE_STATS.RPM_AC130_25MM
            : normRole === 'fighter'
            ? VEHICLE_STATS.RPM_FIGHTER_VULCAN
            : normRole === 'b2_spirit'
            ? VEHICLE_STATS.RPM_B2_CARPET
            : VEHICLE_STATS.RPM_GAU8,
        coaxRpm: 120,
        patrolPoints: [
          new THREE.Vector3(-260, 155, -180),
          new THREE.Vector3(260, 160, -180),
          new THREE.Vector3(260, 155, 180),
          new THREE.Vector3(-260, 160, 180)
        ]
      });
    }

    if (plane.npcDriver) {
      plane.npcDriver.drivingVehicle = null;
      plane.npcDriver = null;
    }

    plane.b2LockedUntilKills = false;
    plane.paidByPlayer = player;
    plane._paidAsStock = paidAsStock;
    plane.dead = false;
    plane.respawnTimer = 0;
    plane.replacementTicketPaid = false;
    plane.replacementFundsPaid = false;
    plane._killCredited = false;
    plane.hp = plane.maxHp;
    plane.hullIntegrityPct = 100;
    plane.isShotDown = false;
    plane.isStalling = false;
    plane.stallSinkVel = 0;
    plane.coaxHeat = 0;
    plane.coaxOverheated = false;
    plane.fireCooldown = 0;
    plane.coaxCooldown = 0;
    plane.aiPilotActive = false;
    plane.mesh.visible = true;

    if (launchAirborne) {
      const entryBackDist = isHeliRole ? 28 : 140;
      const headingYaw = team === 'US' ? -Math.PI / 2 : Math.PI / 2;
      const startX = THREE.MathUtils.clamp(
        player.pos.x + (team === 'US' ? -entryBackDist : entryBackDist),
        -2450,
        2450
      );
      const startZ = THREE.MathUtils.clamp(player.pos.z, -1650, 1650);
      const gStart = this.world ? this.world.getGroundHeightAt(startX, startZ) : 0;
      const alt = isHeliRole
        ? Math.max(gStart + 46, 52)
        : normRole === 'wright_flyer'
        ? 62
        : normRole === 'b2_spirit'
        ? 185
        : normRole === 'gunship'
        ? 165
        : normRole === 'fighter'
        ? 155
        : 120;
      plane.pos.set(startX, alt, startZ);
      plane.yaw = headingYaw;
      plane.pitch = isHeliRole
        ? 0.0
        : normRole === 'wright_flyer'
        ? 0.0
        : normRole === 'gunship'
        ? -0.02
        : -0.04;
      plane.roll = 0;
      plane.isHelicopter = isHeliRole;
      plane.heliHoverHold = false;
      plane.gunshipManualFlight = normRole === 'gunship';
      plane.orbitAssist = false;
      plane.turretYaw = headingYaw;
      plane.throttle = isHeliRole ? 0.48 : normRole === 'wright_flyer' ? 0.14 : 0.58;
      plane.forwardSpeed = isHeliRole
        ? 8.0
        : normRole === 'wright_flyer'
        ? 13.5
        : plane.speed || (normRole === 'b2_spirit' ? 125 : 62);
      if (isHeliRole) {
        plane._heliVelX = -Math.sin(headingYaw) * 8.0;
        plane._heliVelY = 0;
        plane._heliVelZ = -Math.cos(headingYaw) * 8.0;
      }
      plane.mesh.position.copy(plane.pos);
      plane.mesh.rotation.set(plane.pitch, plane.yaw, plane.roll, 'YXZ');
      syncAircraftFlightFSM(plane, { onRunway: false });
    } else {
      const isRU = team === 'RU';
      const apronZ = isHeliRole
        ? plane.spawnPos
          ? plane.spawnPos.z
          : normRole === 'heli_transport'
          ? isRU
            ? 44
            : -44
          : isRU
          ? -44
          : 44
        : isRU
        ? 138
        : -138;
      const apronX = plane.spawnPos
        ? plane.spawnPos.x
        : isHeliRole
        ? isRU
          ? 1504
          : -1504
        : normRole === 'gunship'
        ? isRU
          ? 2876
          : -2876
        : normRole === 'b2_spirit'
        ? isRU
          ? 2828
          : -2828
        : normRole === 'cas'
        ? isRU
          ? 2780
          : -2780
        : isRU
        ? 2736
        : -2736;
      const groundY = this.world ? this.world.getGroundHeightAt(apronX, apronZ) : 0;
      plane.pos.set(apronX, groundY, apronZ);
      plane.yaw = plane.spawnYaw ?? (isHeliRole ? (isRU ? Math.PI / 2 : -Math.PI / 2) : isRU ? Math.PI / 2 - 0.32 : -Math.PI / 2 - 0.32);
      plane.pitch = 0;
      plane.roll = 0;
      plane.turretYaw = plane.yaw;
      plane.throttle = 0;
      plane.forwardSpeed = 0;
      plane._heliVelX = 0;
      plane._heliVelY = 0;
      plane._heliVelZ = 0;
      plane.heliHoverHold = false;
      plane.claimedByPlayer = true;
      plane.claimedByPlayerTimer = 45.0;
      plane.mesh.position.copy(plane.pos);
      plane.mesh.rotation.set(0, plane.yaw, 0, 'YXZ');
      if (plane.flightFSM) {
        plane.flightFSM.send(AIRCRAFT_FLIGHT_EVENTS.RESPAWN_RUNWAY);
      }
      if (this.world?.spawnDebris) {
        this.world.spawnDebris(tmpVec3(apronX, groundY + 2.2, apronZ), COLOR_B2_CYAN, 10);
      }
    }

    this.refreshTeamVehicleLists();
    return {
      ok: true,
      vehicle: plane,
      cost,
      fundsRemaining: this.getTeamFunds(team),
      launchAirborne
    };
  }

  /**
   * Any-Class Light Recon Motorcycle / 4x4 Tactical Quad ATV Delivery (`requestPlayerLightBike`):
   * Spends $150 (from Personal Cash or Faction Funds) to deliver a 100% HP Recon Enduro Bike or
   * Polaris MV850 4x4 Quad ATV 5.5m ahead on safe clear ground!
   */
  requestPlayerLightBike(player, subKind = 'bike') {
    if (!player) return { ok: false, reason: 'NO_PLAYER' };
    const era = this.world?.era || 'modern';
    if (era !== 'modern') {
      return { ok: false, reason: 'ERA_LOCKED' };
    }
    const isAtv = subKind === 'atv';
    const vehKey = isAtv ? 'atv' : 'bike';
    let cost = ECONOMY.VEHICLE_BASE_COST?.[vehKey] ?? (isAtv ? 350 : 250);
    const team = player.team || 'US';
    let paidSource = 'MATCH_CASH';
    if (typeof player.payForVehicleRequisition === 'function') {
      const payRes = player.payForVehicleRequisition(vehKey);
      if (!payRes.ok) {
        return payRes;
      }
      cost = payRes.cost;
    } else if (typeof player.spendCash === 'function' && player.spendCash(cost)) {
      paidSource = 'MATCH_CASH';
    } else {
      return { ok: false, reason: 'INSUFFICIENT_MATCH_CASH', cost, funds: player.matchCash || 0 };
    }

    const fwdX = -Math.sin(player.yaw || 0);
    const fwdZ = -Math.cos(player.yaw || 0);
    const rawX = THREE.MathUtils.clamp(player.pos.x + fwdX * 5.8, -2450, 2450);
    const rawZ = THREE.MathUtils.clamp(player.pos.z + fwdZ * 5.8, -1650, 1650);
    const halfW = isAtv ? 0.88 : 0.55;
    const halfL = isAtv ? 1.28 : 1.08;
    const dropPos = this.world?.findSafeVehicleSpawnPoint
      ? this.world.findSafeVehicleSpawnPoint(rawX, rawZ, player.yaw || 0, halfW, halfL, this.vehicles)
      : new THREE.Vector3(
          rawX,
          this.world ? this.world.getGroundHeightAt(rawX, rawZ) : player.pos.y,
          rawZ
        );
    const safeYaw = typeof dropPos.safeYaw === 'number' ? dropPos.safeYaw : player.yaw || 0;
    const stats = isAtv ? VEHICLE_STATS.ATV_QUAD : VEHICLE_STATS.BIKE_500CC_2T;

    const veh = this.spawnVehicle({
      id: `req_${isAtv ? 'atv' : 'bike'}_${team.toLowerCase()}_${Date.now()}`,
      name: isAtv
        ? 'POLARIS MV850 TACTICAL 4×4 QUAD ATV'
        : 'M1030M1 MILITARY RECON ENDURO MOTORCYCLE',
      shortBayLabel: isAtv ? 'MV850 4×4 ATV' : 'M1030M1 RECON',
      type: isAtv ? 'atv' : 'bike',
      bikeSubType: isAtv ? 'atv_quad' : 'twostroke_500cc',
      isBike: !isAtv,
      isAtv,
      isWarehouseBike: true,
      cc: isAtv ? 850 : 450,
      colorHex: 0x4b5320,
      accentHex: 0x1e2418,
      team,
      spawnPos: dropPos.clone(),
      spawnYaw: safeYaw,
      maxHp: stats.maxHp,
      speed: stats.speed,
      accelRate: stats.accelRate,
      brakeRate: stats.brakeRate,
      turnRate: stats.turnRate,
      weaponType: 'moto_pdw',
      rpm: 750,
      patrolPoints: [dropPos.clone()]
    });
    veh.claimedByBot = null;
    veh.paidByPlayer = player;
    veh._paidAsStock = true;
    veh.claimedByPlayer = true;
    veh.claimedByPlayerTimer = 45.0;
    veh.mesh.visible = true;
    this.refreshTeamVehicleLists();
    if (this.world?.spawnDebris) {
      this.world.spawnDebris(tmpVec3(dropPos.x, dropPos.y + 1.4, dropPos.z), COLOR_B2_CYAN, 8);
    }
    return { ok: true, vehicle: veh, cost, paidSource };
  }

  /**
   * Armor Crew Heavy Vehicle Requisition (`requestPlayerArmorVehicle`):
   * Spends Faction Command Funds (`tank: $1,100`, `apc: $650`, `aa: $750`) to deliver a 100% HP
   * Main Battle Tank, 8x8 IFV, or Mobile SPAAG AA `10.5m` ahead of the player with 30s anti-bot claim protection!
   */
  requestPlayerArmorVehicle(player, armorType = 'tank') {
    if (!player) return { ok: false, reason: 'NO_PLAYER' };
    const era = this.world?.era || 'modern';
    if (era !== 'modern') {
      return { ok: false, reason: 'ERA_LOCKED' };
    }
    if (
      player.squadDoctrineEnabled !== false &&
      player.role !== 'armor' &&
      armorType !== 'truck_transport'
    ) {
      return { ok: false, reason: 'REQUIRES_ARMOR_LICENSE' };
    }
    const team = player.team || 'US';
    const isRU = team === 'RU';
    const normType =
      armorType === 'truck_transport'
        ? 'truck_transport'
        : armorType === 'car' || armorType === 'humvee'
        ? 'car'
        : armorType === 'apc'
        ? 'apc'
        : armorType === 'aa'
        ? 'aa'
        : 'tank';
    let cost = ECONOMY.VEHICLE_BASE_COST?.[normType] ?? 1400;
    let paidAsStock = false;
    if (typeof player.payForVehicleRequisition === 'function') {
      const payRes = player.payForVehicleRequisition(normType);
      if (!payRes.ok) {
        return payRes;
      }
      cost = payRes.cost;
      paidAsStock = Boolean(payRes.useStock);
    } else {
      const funds = this.getTeamFunds(team);
      if (funds < cost) {
        return { ok: false, reason: 'INSUFFICIENT_FUNDS', cost, funds };
      }
      this.addTeamFunds(team, -cost);
    }

    const fwdX = -Math.sin(player.yaw || 0);
    const fwdZ = -Math.cos(player.yaw || 0);
    const rawX = THREE.MathUtils.clamp(player.pos.x + fwdX * 10.5, -2450, 2450);
    const rawZ = THREE.MathUtils.clamp(player.pos.z + fwdZ * 10.5, -1650, 1650);
    const halfW = normType === 'tank' ? 1.95 : 1.65;
    const halfL = normType === 'tank' ? 3.55 : 3.35;
    const pushed = this.world?.pushOutOfBuildingFootprint
      ? this.world.pushOutOfBuildingFootprint(rawX, rawZ, halfL + 1.8)
      : { x: rawX, z: rawZ };
    const dropPos = this.world?.findSafeVehicleSpawnPoint
      ? this.world.findSafeVehicleSpawnPoint(
          pushed.x,
          pushed.z,
          player.yaw || 0,
          halfW,
          halfL,
          this.vehicles
        )
      : new THREE.Vector3(
          pushed.x,
          this.world ? this.world.getGroundHeightAt(pushed.x, pushed.z) : player.pos.y,
          pushed.z
        );

    // Revive a destroyed friendly fleet slot of that armor type if one is waiting on cooldown; else spawn fresh!
    let veh = this.vehicles.find(
      (v) =>
        v &&
        v.dead &&
        !v.isAircraft &&
        !v.isEmplacement &&
        v.team === team &&
        v.type === normType &&
        !v.driver &&
        !v.npcDriver
    );

    if (veh) {
      veh.dead = false;
      veh.respawnTimer = 0;
      veh.replacementTicketPaid = false;
      veh.replacementFundsPaid = false;
      veh._killCredited = false;
      veh.hp = veh.maxHp;
      veh.hullIntegrityPct = 100;
      veh.armorZones = { front: 100, left: 100, right: 100, rear: 100 };
      veh.eraBlocksIntact = veh.maxEraBlocks || 0;
      veh.subsystems = { tracks: 'OK', turret: 'OK', engine: 'OK', optics: 'OK' };
      veh.driver = null;
      veh.npcDriver = null;
      veh.forwardSpeed = 0;
      veh.coaxHeat = 0;
      veh.coaxOverheated = false;
      veh.fireCooldown = 0;
      veh.coaxCooldown = 0;
      veh.pos.copy(dropPos);
      veh.yaw = player.yaw || 0;
      veh.pitch = 0;
      veh.roll = 0;
      veh.turretYaw = player.yaw || 0;
      veh.mesh.position.copy(dropPos);
      veh.mesh.rotation.set(0, veh.yaw, 0, 'YXZ');
      veh.mesh.visible = true;
      if (veh.occupancyFSM) {
        veh.occupancyFSM.send(GROUND_VEHICLE_EVENTS.RESPAWN_READY);
      }
      veh.cmFSM?.send(VEHICLE_CM_EVENTS.RESET);
      veh.thermalFSM?.send(VEHICLE_THERMAL_EVENTS.RESET);
    } else {
      const nameMap = {
        truck_transport: isRU
          ? 'KAMAZ-5350 MUSTANG 6×6 TROOP & LOGISTICS TRUCK (10 SEATS + RESUPPLY)'
          : 'M1083A1 MTV 6×6 TROOP & LOGISTICS TRUCK (10 SEATS + RESUPPLY)',
        car: isRU ? 'GAZ TIGR UP-ARMORED SCOUT (.50 HMG)' : 'M1151 UP-ARMORED HUMVEE (.50 HMG)',
        tank: isRU
          ? 'T-90M PRORYV MBT (125MM + COAX)'
          : 'M1A2 SEP v3 ABRAMS MBT (120MM + COAX)',
        apc: isRU ? 'BTR-82A 8x8 IFV (30MM HE)' : 'LAV-25A2 8x8 IFV (30MM HE)',
        aa: isRU
          ? '2K22 TUNGUSKA-M1 SPAAG (TWIN 30MM + 9M311 SAM)'
          : 'M163 PIVADS / LAV-AD SPAAG (25MM + STINGER SAM)'
      };
      const statBlock =
        normType === 'truck_transport'
          ? VEHICLE_STATS.TRUCK_TRANSPORT
          : normType === 'car'
          ? VEHICLE_STATS.HUMVEE || { maxHp: 750, speed: 24 }
          : normType === 'tank'
          ? VEHICLE_STATS.TANK
          : normType === 'apc'
          ? VEHICLE_STATS.APC
          : VEHICLE_STATS.AA_VEHICLE;
      veh = this.spawnVehicle({
        id: `req_${normType}_${team.toLowerCase()}_${Date.now()}`,
        name: nameMap[normType],
        type: normType,
        isLogisticsTruck: normType === 'truck_transport',
        team,
        spawnPos: dropPos.clone(),
        spawnYaw: player.yaw || 0,
        maxHp: statBlock.maxHp,
        speed: statBlock.speed,
        weaponType:
          normType === 'truck_transport' || normType === 'car'
            ? 'hmg'
            : normType === 'tank'
            ? 'tank_cannon'
            : normType === 'apc'
            ? 'autocannon'
            : 'aa_autocannon',
        rpm:
          normType === 'truck_transport'
            ? 650
            : normType === 'car'
            ? 750
            : normType === 'tank'
            ? isRU
              ? VEHICLE_STATS.RPM_TANK_RU
              : VEHICLE_STATS.RPM_TANK_US
            : normType === 'apc'
            ? VEHICLE_STATS.RPM_APC
            : VEHICLE_STATS.RPM_AA_AUTOCANNON,
        coaxRpm: normType === 'aa' ? 45 : VEHICLE_STATS.RPM_COAX,
        patrolPoints: [
          dropPos.clone(),
          new THREE.Vector3(0, this.world ? this.world.getGroundHeightAt(0, 0) : 0, 0)
        ]
      });
    }

    veh.claimedByBot = null;
    veh.paidByPlayer = player;
    veh._paidAsStock = paidAsStock;
    veh.claimedByPlayer = true;
    veh.claimedByPlayerTimer = 30.0;
    this.refreshTeamVehicleLists();

    if (this.world?.spawnDebris) {
      this.world.spawnDebris(
        tmpVec3(dropPos.x, dropPos.y + 1.8, dropPos.z),
        COLOR_FLARE_GOLD,
        14
      );
    }
    sound.playRadioBeep?.(false);
    const shortName = veh.name.split(' (')[0];
    if (player.onAwardXp) {
      player.onAwardXp(
        35,
        `🛡️ HEAVY ARMOR DELIVERED (-$${cost.toLocaleString()} FACTION FUNDS): ${shortName} READY TO BOARD [E]!`
      );
    }
    if (window.game?.botManager?.emitBotComms) {
      const bravoSl =
        window.game.botManager.bots.find(
          (b) => !b.dead && b.team === team && b.squad === 'BRAVO' && b.isSquadLeader
        ) || window.game.botManager.bots.find((b) => !b.dead && b.team === team);
      if (bravoSl) {
        window.game.botManager.emitBotComms(
          bravoSl,
          player,
          `Armor Logistics: ${shortName} dropped 10m ahead of your grid (-$${cost.toLocaleString()} Faction Funds, $${this.getTeamFunds(team).toLocaleString()} left) — locked to you for 30s!`,
          'COMMAND',
          true,
          'CMD NET'
        );
      }
    }
    events.emit('telemetry:event', {
      type: 'PLAYER_ARMOR_REQUISITIONED',
      payload: {
        team,
        armorType: normType,
        vehicleName: veh.name,
        cost,
        fundsRemaining: this.getTeamFunds(team),
        x: Math.round(dropPos.x),
        z: Math.round(dropPos.z)
      }
    });

    return {
      ok: true,
      vehicle: veh,
      cost,
      fundsRemaining: this.getTeamFunds(team)
    };
  }

  /**
   * Returns realistic physical turret gun depression/elevation limits (in radians):
   * - Main Battle Tank (M1A2 / T-90M): -10° depression (-0.18 rad) to +20° max elevation (+0.35 rad)
   * - Wheeled IFV / APC (LAV-25 / BTR-82A): -10° (-0.18 rad) to +30° (+0.52 rad)
   * - Tactical Armored Car / HMG (Humvee / Tigr): -12° (-0.21 rad) to +35° (+0.61 rad)
   * - Dedicated Anti-Air (LAV-AD / Tunguska / ZU-23-2): -8° (-0.14 rad) to +85° (+1.48 rad)
   */
  getVehiclePitchLimits(v) {
    if (!v) return PITCH_LIMITS_DEFAULT;
    if (v.type === 'aa' || v.type === 'emplace_aa' || v.weaponType === 'aa_autocannon') {
      return PITCH_LIMITS_AA;
    }
    if (v.type === 'emplace_mortar' || v.weaponType === 'mortar_tube') {
      return PITCH_LIMITS_MORTAR;
    }
    if (v.type === 'tank' || v.weaponType === 'tank_cannon') {
      return PITCH_LIMITS_DEFAULT;
    }
    if (v.type === 'apc' || v.weaponType === 'autocannon') {
      return PITCH_LIMITS_APC;
    }
    return PITCH_LIMITS_CAR;
  }

  classifyVehicleKillCategory(vehicle) {
    if (!vehicle) return 'CAR';
    if (vehicle.isAircraft || vehicle.type === 'plane') return 'PLANE';
    if (
      vehicle.type === 'tank' ||
      vehicle.type === 'apc' ||
      vehicle.type === 'aa' ||
      vehicle.type === 'trex_mount'
    ) {
      return 'TANK';
    }
    return 'CAR';
  }

  creditAttackerVehicleKill(vehicle, attackerName, attackerTeam, weaponName = '') {
    if (!vehicle || vehicle._killCredited) return;
    vehicle._killCredited = true;
    const category = this.classifyVehicleKillCategory(vehicle);
    events.emit('vehicle:credit-kill', {
      vehicle,
      category,
      attackerName,
      attackerTeam,
      weaponName
    });
  }

  /**
   * Finalizes ground impact explosion for an aircraft that was shot down (`isShotDown = true`)
   * and spiraled into the terrain. If the pilot did NOT press [E] to eject before ground impact,
   * the crash is fatal!
   */
  finalizeShotDownCrash(vehicle) {
    if (!vehicle || vehicle.dead) return;
    const att = vehicle.shotDownAttacker || {};
    const attackerName = att.attackerName || 'GROUND IMPACT';
    const attackerTeam = att.attackerTeam || (vehicle.team === 'US' ? 'RU' : 'US');
    const weaponName = att.weaponName || 'AIRCRAFT CRASH';
    const onKillFn = att.onKillFn || this.onKill || null;
    const onAwardXp = att.onAwardXp || null;

    this.creditAttackerVehicleKill(vehicle, attackerName, attackerTeam, weaponName);

    vehicle.isShotDown = false;
    vehicle.isStalling = false;
    vehicle.stallSinkVel = 0;
    vehicle.hp = 0;
    vehicle.dead = true;
    vehicle.respawnTimer =
      vehicle.aircraftRole === 'b2_spirit'
        ? VEHICLE_STATS.RESPAWN_DELAY_B2_SPIRIT || 95.0
        : VEHICLE_STATS.RESPAWN_DELAY_PLANE || 42.0;
    vehicle.replacementTicketPaid = false;
    vehicle.replacementFundsPaid = false;
    vehicle.mesh.visible = false;
    vehicle.aiPilotActive = false;
    if (vehicle.flightFSM) {
      if (!vehicle.flightFSM.send(AIRCRAFT_FLIGHT_EVENTS.CRASH_IMPACT)) {
        vehicle.flightFSM.send(AIRCRAFT_FLIGHT_EVENTS.DESTROY_GROUND);
      }
    }

    const respawnCost =
      vehicle.ticketCost ||
      (vehicle.aircraftRole === 'b2_spirit'
        ? VEHICLE_STATS.TICKET_COST_B2_SPIRIT || 45
        : VEHICLE_STATS.TICKET_COST_PLANE || 30);
    const moneyCost =
      vehicle.factionMoneyCost ??
      (vehicle.aircraftRole === 'b2_spirit'
        ? VEHICLE_STATS.FACTION_COST_B2_SPIRIT || 2500
        : VEHICLE_STATS.FACTION_COST_PLANE || 1500);
    const respawnCategory = 'PLANE';
    events.emit('vehicle:destroyed', {
      vehicle,
      attackerName,
      attackerTeam,
      weaponName,
      cost: respawnCost,
      moneyCost,
      category: respawnCategory
    });
    events.emit('vehicle:respawn', {
      vehicle,
      cost: respawnCost,
      moneyCost,
      category: respawnCategory,
      stage: 'VEHICLE_DESTROYED'
    });
    if (this.onVehicleRespawn && !this.onVehicleRespawn._isEventsBridge) {
      this.onVehicleRespawn(vehicle, respawnCost, respawnCategory, 'VEHICLE_DESTROYED', moneyCost);
    }
    vehicle.replacementTicketPaid = true;

    const listenerPos =
      (vehicle.driver && vehicle.driver.pos) ||
      (this.lastPlayer && this.lastPlayer.pos) ||
      null;
    const distToListener = listenerPos ? listenerPos.distanceTo(vehicle.pos) : 0;
    sound.playExplosion(distToListener, 0, 1.35);
    this.world.spawnExplosionVisual(
      tmpVec3(vehicle.pos.x, vehicle.pos.y + 1.8, vehicle.pos.z),
      10.5
    );
    this.spawnVehicleWreck(vehicle);

    // If the pilot stayed inside the burning plane and failed to press [E] to eject before hitting the ground, they die on impact!
    if (vehicle.driver) {
      const driver = vehicle.driver;
      vehicle.driver = null;
      driver.activeVehicle = null;
      if (driver.viewModelGroup) driver.viewModelGroup.visible = true;
      events.emit('player:exited-vehicle', { vehicle, reason: 'crashed' });
      driver.pos.copy(vehicle.pos);
      driver.pos.y = this.world.getGroundHeightAt(driver.pos.x, driver.pos.z);
      driver.takeDamage(
        9999,
        attackerName,
        attackerTeam,
        `${weaponName} (CRASHED — FAILED TO EJECT [E])`,
        onKillFn,
        att?.attackerPos || vehicle.pos
      );
    }

    events.emit('kill:event', {
      killer: attackerName,
      kTeam: attackerTeam,
      victim: vehicle.name,
      vTeam: vehicle.team,
      weapon: weaponName,
      isHs: false
    });
    if (onKillFn && !onKillFn._isEventsBridge) {
      onKillFn(attackerName, attackerTeam, vehicle.name, vehicle.team, weaponName, false);
    }

    if (onAwardXp && !att._xpAlreadyAwarded) {
      const xpPts =
        vehicle.aircraftRole === 'b2_spirit'
          ? VEHICLE_STATS.DESTROY_XP_B2 || 900
          : VEHICLE_STATS.DESTROY_XP_PLANE || 650;
      const xpReason = `✈️ AIRCRAFT SHOT DOWN! (${vehicle.name} • -${respawnCost} ENEMY 🎟️)`;
      events.emit('xp:awarded', { amount: xpPts, reason: xpReason });
      if (!onAwardXp._isEventsBridge) {
        onAwardXp(xpPts, xpReason);
      }
    }
  }

  damageVehicle(
    vehicle,
    amount,
    attackerName,
    attackerTeam,
    weaponName,
    onKillFn,
    onAwardXp,
    attackerPos = null,
    hitPoint = null
  ) {
    vehicle.lastAppliedDamage = 0;
    vehicle.lastArmorRicochet = false;
    vehicle.lastSubsystemCrit = null;
    vehicle.lastAirframePart = null;
    if (vehicle.dead) return false;
    if (vehicle.isShotDown) {
      vehicle.hp = 1;
      return false;
    }

    const wepUp = String(weaponName || '').toUpperCase();
    const isAc13025mm = wepUp.includes('25MM GAU-12') || wepUp.includes('EQUALIZER');
    const isAc13040mm = wepUp.includes('40MM') && wepUp.includes('BOFORS');
    const isAc130105mm = wepUp.includes('105MM') && wepUp.includes('HOWITZER');
    const isAc130SideGun = isAc13025mm || isAc13040mm || isAc130105mm;
    const isA10Gau8 = wepUp.includes('30MM GAU-8') || wepUp.includes('AVENGER');
    const ballistics = classifyWeaponBallistics(weaponName);
    const critRng =
      typeof vehicle._forceCritRoll === 'number' ? vehicle._forceCritRoll : Math.random();
    const distToAttacker = attackerPos ? attackerPos.distanceTo(vehicle.pos) : 120;

    // =========================================================================
    // SQUAD-STYLE AIRCRAFT SKIN & TITANIUM BATHTUB PENETRATION + SENSOR CRITS
    // - AC-130 downward port cannons DO damage lower-flying aircraft that cross below its guns!
    // - A-10 / Su-25 (`cas`) 1,200-lb titanium bathtub shrugs off infantry rifles/LMGs (0 hull HP; rare 1.5% HUD sensor glitch).
    // - Fast Jets & Gunships (`fighter`, `b2_spirit`, `gunship`): immune to rifles/SMGs/pistols; close-range (<220m) 7.62mm LMG
    //   only scratches airframe (never below 25% HP — infantry MGs CANNOT shoot down a jet!) with 2.5% HUD/FLIR sensor glitch!
    // =========================================================================
    if (vehicle.isAircraft) {
      const aRole = vehicle.aircraftRole || vehicle.type;
      if (isAc130SideGun && critRng < 0.14) {
        vehicle.sensorGlitchTimer = Math.max(vehicle.sensorGlitchTimer || 0, 4.5);
        vehicle.lastSubsystemCrit = 'SENSORS';
      }

      if (aRole !== 'wright_flyer') {
        if (ballistics.isSmallArms) {
          const isTargetHeli = Boolean(
            vehicle.isHelicopter || aRole === 'heli_transport' || aRole === 'heli_attack'
          );
          if (aRole === 'cas') {
            // Titanium armored bathtub: 0 hull damage from small arms, rare 1.5% external targeting-pod/HUD glitch
            if (ballistics.isLmgOrSniper && distToAttacker <= 260 && critRng < 0.015) {
              vehicle.sensorGlitchTimer = Math.max(vehicle.sensorGlitchTimer || 0, 5.0);
              vehicle.lastSubsystemCrit = 'SENSORS';
              vehicle.lastHitDesc = '📡 EXTERNAL TGP / HUD SENSOR GLITCHED BY GROUND FIRE (0 HULL DMG)';
            } else {
              vehicle.lastHitDesc = '🛡️ TITANIUM ARMOR TUB DEFLECTED SMALL ARMS (0 DMG)';
            }
            vehicle.lastArmorRicochet = true;
            if (vehicle.driver && typeof vehicle.driver.notifyVehicleHit === 'function') {
              vehicle.driver.notifyVehicleHit(0, attackerName, vehicle.lastHitDesc, attackerPos);
            }
            return false;
          }

          if (isTargetHeli && ballistics.isRotaryMinigun) {
            // Helicopter-vs-Helicopter 7.62×51mm M134 / PKT Rotary Minigun Dogfight:
            // High-volume 1,500 RPM API stream penetrates aluminum tailbooms, turboshaft intakes, hydraulic lines & rotor links!
            if (distToAttacker > 620) {
              vehicle.lastArmorRicochet = true;
              vehicle.lastHitDesc = '🛡️ OUT OF 7.62MM MINIGUN EFFECTIVE RANGE (>620M)';
              return false;
            }
            const rangeFalloff = distToAttacker <= 280 ? 1.0 : Math.max(0.45, 1 - (distToAttacker - 280) / 420);
            const armorMultHeli = aRole === 'heli_attack' ? 0.78 : 1.0; // Attack helis have heavier cockpit/engine armor than utility transports
            amount = Math.max(6, Math.round(amount * 0.72 * rangeFalloff * armorMultHeli));
            if (critRng < 0.04) {
              vehicle.sensorGlitchTimer = Math.max(vehicle.sensorGlitchTimer || 0, 3.2);
              vehicle.lastSubsystemCrit = 'SENSORS';
            }
          } else {
            // Fast Fighter Jets, B-2 Stealth Bombers, AC-130 Gunships & Ground Infantry Rifles vs. Aircraft:
            if (!ballistics.isLmgOrSniper || distToAttacker > (isTargetHeli ? 260 : 220)) {
              if (distToAttacker <= 180 && critRng < 0.01) {
                vehicle.sensorGlitchTimer = Math.max(vehicle.sensorGlitchTimer || 0, 3.5);
                vehicle.lastSubsystemCrit = 'SENSORS';
                vehicle.lastHitDesc = '📡 AVIONICS RADOME SCRATCHED BY SMALL ARMS (0 HULL DMG)';
              } else {
                vehicle.lastHitDesc = '🛡️ AIRFRAME SKIN DEFLECTED SMALL ARMS (0 DMG)';
              }
              vehicle.lastArmorRicochet = true;
              return false;
            }

            // Close-range (<220–260m) Infantry 7.62mm LMG / Sniper harassment:
            // Helicopters can be chipped down slowly by heavy squad LMG/Sniper focus fire (3–5 DMG),
            // whereas fast fixed-wing jets cannot be reduced below 25% HP by infantry rifles!
            if (critRng < 0.025) {
              vehicle.sensorGlitchTimer = Math.max(vehicle.sensorGlitchTimer || 0, 4.5);
              vehicle.lastSubsystemCrit = 'SENSORS';
            }
            if (isTargetHeli) {
              amount = Math.min(4, Math.max(2, Math.round(amount * 0.14)));
            } else {
              const minHpFloor = Math.ceil((vehicle.maxHp || 600) * 0.25);
              if (vehicle.hp <= minHpFloor) {
                vehicle.lastArmorRicochet = true;
                vehicle.lastHitDesc = '🛡️ SMALL ARMS CANNOT DOWN JET AIRFRAME — USE .50 HMG / AA / STINGER!';
                return false;
              }
              amount = Math.min(2, Math.max(1, vehicle.hp - minHpFloor));
            }
          }
        } else if (ballistics.isHeavyMg50) {
          if (distToAttacker > 680) {
            vehicle.lastArmorRicochet = true;
            return false;
          }
          if (critRng < 0.055) {
            vehicle.sensorGlitchTimer = Math.max(vehicle.sensorGlitchTimer || 0, 4.5);
            vehicle.lastSubsystemCrit = 'SENSORS';
          }
          if (aRole === 'cas') {
            amount = Math.max(1, Math.round(amount * 0.34));
          }
        }
      }

      // Realistic Subsonic CAS vs. Supersonic Fighter / High-Altitude Stealth Bomber Envelope:
      if (isA10Gau8 && (aRole === 'fighter' || aRole === 'b2_spirit') && distToAttacker > 160) {
        amount = Math.max(2, Math.round(amount * 0.22));
      }
    }

    // =========================================================================
    // SQUAD-STYLE ALL-OR-NOTHING ARMOR PENETRATION VS. TANKS, IFVs & SPAAG AA
    // - Infantry rifles, SMGs, pistols, LMGs & frag grenades deal ZERO hull HP damage to Tanks/IFVs/AA
    //   (a rifle can NEVER make a tank explode!), with a tiny 1.8% LMG/Sniper chance to crack external Optics!
    // - .50 BMG HMG deals 0 hull HP to MBTs (6% Optics crit chance) and only penetrates thin APC side/rear plates!
    // =========================================================================
    const isArmoredHull =
      vehicle.type === 'tank' || vehicle.type === 'apc' || vehicle.type === 'aa';
    if (isArmoredHull && (ballistics.isSmallArms || (ballistics.isHeavyMg50 && vehicle.type === 'tank'))) {
      if (!vehicle.subsystems) {
        vehicle.subsystems = { tracks: 'OK', turret: 'OK', engine: 'OK', optics: 'OK' };
      }
      const opticsCritChance = ballistics.isHeavyMg50
        ? 0.06
        : ballistics.isLmgOrSniper
        ? 0.018
        : 0.005;
      if (critRng < opticsCritChance) {
        vehicle.subsystems.optics = 'DAMAGED';
        vehicle.opticsGlitchTimer = 14.0;
        vehicle.lastSubsystemCrit = 'OPTICS';
        vehicle.lastHitDesc =
          '🔭 PERISCOPE / CITV OPTIC CRACKED BY SMALL ARMS (0 HULL DMG — REPAIR [F]/[T])!';
      } else {
        vehicle.lastHitDesc = '🛡️ NON-PENETRATION: SMALL ARMS BOUNCED OFF HEAVY ARMOR (0 DMG)';
      }
      vehicle.lastArmorRicochet = true;
      if (vehicle.driver && typeof vehicle.driver.notifyVehicleHit === 'function') {
        vehicle.driver.notifyVehicleHit(
          0,
          attackerName,
          vehicle.lastSubsystemCrit === 'OPTICS' ? vehicle.lastHitDesc : 'SMALL ARMS DEFLECTED',
          attackerPos
        );
      }
      return false;
    }

    if (vehicle.type === 'warhorse' && (vehicle.armor || 0) > 0) {
      const absorbed = Math.min(vehicle.armor, Math.round(amount * 0.45));
      vehicle.armor -= absorbed;
      amount = Math.max(1, amount - absorbed);
    }

    // =========================================================================
    // DIRECTIONAL TANK / IFV ARMOR ZONES, COMPOSITE GLACIS, ERA & HULL INTEGRITY
    // =========================================================================
    let hitZone = 'FRONT';
    let armorNote = '';
    const isArmoredGround =
      vehicle.type === 'tank' || vehicle.type === 'apc' || vehicle.type === 'aa';
    if (isArmoredGround) {
      if (!vehicle.armorZones) {
        vehicle.armorZones = { front: 100, left: 100, right: 100, rear: 100 };
      }
      if (!vehicle.subsystems) {
        vehicle.subsystems = { tracks: 'OK', turret: 'OK', engine: 'OK', optics: 'OK' };
      }
      const wUpArmor = String(weaponName || '').toUpperCase();
      const isStandardRpg =
        /RPG/.test(wUpArmor) && !/TANDEM|MAVERICK|AGM|KH-29/.test(wUpArmor);
      let elevSinFromAttacker = 0;
      if (attackerPos) {
        const dyElev = attackerPos.y - vehicle.pos.y;
        const dist3DElev = Math.max(1, Math.hypot(attackerPos.x - vehicle.pos.x, dyElev, attackerPos.z - vehicle.pos.z));
        elevSinFromAttacker = dyElev / dist3DElev;
      }
      // Steep overhead top-attack (>=20° above horizon OR aerial howitzer/bomb/mortar) strikes thin 25-35mm turret roof
      // & rear engine louvers, completely bypassing horizontal Chobham frontal glacis & frontal ERA blocks!
      const isOverheadTopAttack =
        !isStandardRpg &&
        !isA10Gau8 &&
        !isAc13025mm &&
        (elevSinFromAttacker >= 0.34 ||
          isAc130105mm ||
          isAc13040mm ||
          /JDAM|GBU|MORTAR|CARPET|MK-82|FAB-250|MOP|FOAB|HELLFIRE|GRIFFIN/.test(wUpArmor));

      if (isOverheadTopAttack) {
        hitZone = 'TOP ROOF';
        armorNote = 'OVERHEAD TOP-ROOF / ENGINE-DECK STRIKE (BYPASSED FRONT GLACIS!)';
        vehicle.armorZones.rear = Math.max(
          0,
          Math.round((vehicle.armorZones.rear ?? 100) - (amount / Math.max(1, vehicle.maxHp)) * 145)
        );
      } else if (attackerPos) {
        const dx = attackerPos.x - vehicle.pos.x;
        const dz = attackerPos.z - vehicle.pos.z;
        const horiz = Math.hypot(dx, dz);
        if (horiz > 0.25) {
          const fwdX = -Math.sin(vehicle.yaw || 0);
          const fwdZ = -Math.cos(vehicle.yaw || 0);
          const rightX = Math.cos(vehicle.yaw || 0);
          const rightZ = -Math.sin(vehicle.yaw || 0);
          const frontDot = (dx * fwdX + dz * fwdZ) / horiz;
          const rightDot = (dx * rightX + dz * rightZ) / horiz;

          if (frontDot >= 0.55) {
            hitZone = 'FRONT';
            if (vehicle.type === 'tank') {
              if (isStandardRpg) {
                // Squad / Real-Life MBT Chobham & Relikt Frontal Composite Glacis:
                // Defeats single-stage PG-7V 85mm HEAT warhead (~86% defeated; requires Side/Rear flanking!)
                if ((vehicle.eraBlocksIntact || 0) > 0) {
                  vehicle.eraBlocksIntact--;
                  this.world?.spawnDebris?.(
                    tmpVec3(vehicle.pos.x + fwdX * 2.6, vehicle.pos.y + 1.5, vehicle.pos.z + fwdZ * 2.6),
                    new THREE.Color(0xff9f1a),
                    5
                  );
                }
                vehicle.lastArmorRicochet = true;
                amount = Math.max(8, Math.round(amount * 0.14));
                armorNote =
                  '🛡️ MBT FRONT COMPOSITE DEFEATED RPG-7 HEAT — FLANK SIDES OR REAR ENGINE DECK!';
              } else {
                // Heavy sloped Chobham / Composite Front Glacis deflects 35% of heavy APFSDS/ATGM fire
                let mult = 0.65;
                if ((vehicle.eraBlocksIntact || 0) > 0 && amount >= 65) {
                  vehicle.eraBlocksIntact--;
                  mult = 0.48;
                  armorNote = `FRONT ERA REACTIVE BLOCK DETONATED (-52% DMG • ${vehicle.eraBlocksIntact} ERA LEFT)`;
                  this.world?.spawnDebris?.(
                    tmpVec3(vehicle.pos.x + fwdX * 2.6, vehicle.pos.y + 1.5, vehicle.pos.z + fwdZ * 2.6),
                    new THREE.Color(0xff9f1a),
                    5
                  );
                } else {
                  armorNote = 'FRONT COMPOSITE GLACIS DEFLECTION (-35% DMG)';
                }
                amount = Math.max(1, Math.round(amount * mult));
              }
            } else {
              amount = Math.max(1, Math.round(amount * 0.82));
              armorNote = 'FRONTAL ARMOR PLATE (-18% DMG)';
            }
            vehicle.armorZones.front = Math.max(
              0,
              Math.round((vehicle.armorZones.front ?? 100) - (amount / Math.max(1, vehicle.maxHp)) * 135)
            );
          } else if (frontDot <= -0.55) {
            hitZone = 'REAR';
            // Vulnerable Rear Engine Louver Deck: 2.15× critical penetration vs RPG-7 HEAT (3–4 rear hits), 1.45× vs shells!
            const rearMult =
              vehicle.type === 'tank' ? (isStandardRpg ? 2.15 : 1.45) : isStandardRpg ? 1.55 : 1.3;
            amount = Math.max(1, Math.round(amount * rearMult));
            armorNote = isStandardRpg
              ? '🔥 CRITICAL REAR ENGINE DECK RPG PENETRATION (ENGINE HIT!)'
              : 'CRITICAL REAR ENGINE DECK PENETRATION (1.45× DMG!)';
            vehicle.armorZones.rear = Math.max(
              0,
              Math.round((vehicle.armorZones.rear ?? 100) - (amount / Math.max(1, vehicle.maxHp)) * 165)
            );
            if (amount >= 75 || vehicle.armorZones.rear < 55) {
              vehicle.subsystems.engine =
                vehicle.hp - amount < vehicle.maxHp * 0.35 ? 'CRITICAL' : 'SMOKING';
            }
          } else {
            hitZone = rightDot >= 0 ? 'RIGHT' : 'LEFT';
            const sideKey = rightDot >= 0 ? 'right' : 'left';
            if (vehicle.type === 'tank' && isStandardRpg) {
              // Squad-calibrated Side Hull / Track Skirt RPG-7 hit (~5–6 side hits + immediate track mobility damage)
              amount = Math.max(1, Math.round(amount * 1.45));
            }
            if ((vehicle.eraBlocksIntact || 0) > 0 && amount >= 95) {
              vehicle.eraBlocksIntact--;
              amount = Math.max(1, Math.round(amount * 0.78));
              armorNote = `${hitZone} SKIRT ERA BLOCK DETONATED (-22% DMG • ${vehicle.eraBlocksIntact} ERA LEFT)`;
            } else {
              armorNote = `${hitZone} HULL / TRACK SKIRT HIT`;
            }
            vehicle.armorZones[sideKey] = Math.max(
              0,
              Math.round((vehicle.armorZones[sideKey] ?? 100) - (amount / Math.max(1, vehicle.maxHp)) * 145)
            );
            if (amount >= 105 || vehicle.armorZones[sideKey] < 45) {
              vehicle.subsystems.tracks = 'DAMAGED';
              armorNote += ' • TRACK MOBILITY DEGRADED';
            }
            if (amount >= 145 || vehicle.hp - amount < vehicle.maxHp * 0.42) {
              vehicle.subsystems.turret = 'DAMAGED';
            }
          }
        }
      }
      vehicle.lastHitZone = hitZone;
      vehicle.lastHitDesc = armorNote;

      // .50 BMG HMG vs APC / SPAAG: bounces off frontal glacis (0 DMG + 6% Optics crit), light 0.28x penetration on thin Side/Rear plates
      if (ballistics.isHeavyMg50 && (vehicle.type === 'apc' || vehicle.type === 'aa')) {
        if (critRng < 0.06 && vehicle.subsystems) {
          vehicle.subsystems.optics = 'DAMAGED';
          vehicle.opticsGlitchTimer = 14.0;
          vehicle.lastSubsystemCrit = 'OPTICS';
        }
        if (hitZone === 'FRONT') {
          vehicle.lastArmorRicochet = true;
          vehicle.lastHitDesc =
            vehicle.lastSubsystemCrit === 'OPTICS'
              ? '🔭 .50 BMG CRACKED FRONT OPTIC (0 HULL DMG — REPAIR [F]/[T])!'
              : '🛡️ .50 BMG BOUNCED OFF APC FRONTAL ARMOR (0 DMG — FLANK SIDE/REAR!)';
          return false;
        }
        amount = Math.max(1, Math.round(amount * 0.28));
      }
    }

    // =========================================================================
    // REAL-WORLD AIRFRAME DOCTRINE: AC-130 (SOFT/LIGHT/INFANTRY CAS) VS. A-10C WARTHOG (TANK-BUSTER!)
    // - AC-130 is an infantry/truck/compound gunship (NOT a dedicated tank killer):
    //     * [1] 25mm GAU-12: Ricochets off MBT hull (0 pen), cracks external Optics.
    //     * [2] 40mm Bofors: Light HE concussion + Track damage vs MBTs (~30+ hits solo).
    //     * [3] 105mm M102 Howitzer (HE artillery shell): Inflicts Track Mobility Kill + ~485 HE roof concussion
    //           (~4–5 direct 105mm hits to destroy a 2,100 HP MBT; immobilizes it for friendly A-10s / Engineers!).
    // - A-10C Warthog / Su-25SM Frogfoot IS the dedicated Anti-Armor Tank-Buster:
    //     * [3] AGM-65G Maverick / Kh-29T Shaped-Charge ATGM: ~1,200 DMG top-attack -> 2 hits destroy any MBT!
    //     * [1] 30mm GAU-8 Depleted-Uranium "BRRRT!": Steep >=20° roof dive or rear pass shreds an MBT in ~1.0s!
    // =========================================================================
    if (vehicle.type === 'tank') {
      const isDedicatedAtgm = /MAVERICK|AGM-65|KH-29|HELLFIRE|VIKHR|ATAKA|GRIFFIN/.test(
        String(weaponName || '').toUpperCase()
      );
      if (isDedicatedAtgm) {
        amount = Math.round(amount * 1.12);
        if (vehicle.subsystems) {
          vehicle.subsystems.tracks = 'DAMAGED';
          vehicle.subsystems.engine = 'CRITICAL';
        }
        armorNote = '🎯 AGM-65 / KH-29 SHAPED-CHARGE TANK-BUSTER PENETRATION (CRITICAL!)';
        vehicle.lastHitDesc = armorNote;
      } else if (isAc13025mm) {
        amount = Math.max(1, Math.round(amount * 0.06));
        vehicle.lastArmorRicochet = true;
        if (critRng < 0.25 && vehicle.subsystems) {
          vehicle.subsystems.optics = 'DAMAGED';
          vehicle.opticsGlitchTimer = 12.0;
          vehicle.lastSubsystemCrit = 'OPTICS';
          armorNote = '🔭 25MM SHATTERED TANK OPTICS (RICOCHET — USE A-10 CAS / ATGM VS TANKS!)';
        } else {
          armorNote = 'RICOCHET: 25MM CANNOT PENETRATE MBT — USE [3] 105MM TO TRACK OR CALL A-10 TANK-BUSTER!';
        }
        vehicle.lastHitDesc = armorNote;
      } else if (isAc13040mm) {
        amount = Math.max(10, Math.round(amount * 0.62));
        if (vehicle.subsystems) {
          vehicle.subsystems.tracks = 'DAMAGED';
        }
        armorNote = '💥 40MM HE CONCUSSION (TRACK MOBILITY KILL — LOW HULL PEN VS HEAVY MBT)';
        vehicle.lastHitDesc = armorNote;
      } else if (isAc130105mm) {
        // Real 105mm M102 fires HE artillery shells (not APFSDS/HEAT): immobilizes tracks & deals ~485 roof concussion (4–5 direct hits!)
        amount = Math.max(40, Math.round(amount * 1.0));
        if (vehicle.subsystems) {
          if (amount >= 220) {
            vehicle.subsystems.tracks = 'DAMAGED';
          }
          if (vehicle.hp - amount < vehicle.maxHp * 0.45) {
            vehicle.subsystems.engine = 'CRITICAL';
          } else if (amount >= 350 && vehicle.subsystems.engine === 'OK') {
            vehicle.subsystems.engine = 'SMOKING';
          }
        }
        armorNote = '💥 105MM HE ROOF CONCUSSION (MOBILITY KILL — A-10 WARTHOG / AT RECOMMENDED VS MBT!)';
        vehicle.lastHitDesc = armorNote;
      } else if (isA10Gau8) {
        let elevSin = 0;
        if (attackerPos) {
          const dy = attackerPos.y - vehicle.pos.y;
          const dist3D = Math.max(1, attackerPos.distanceTo(vehicle.pos));
          elevSin = dy / dist3D;
        }
        const isSteepTopAttack = elevSin >= 0.34; // >= ~20° dive onto thin top roof/engine deck
        if (isSteepTopAttack || hitZone === 'REAR') {
          amount = Math.max(12, Math.round(amount * 1.05));
          if (vehicle.subsystems) {
            vehicle.subsystems.engine =
              vehicle.hp - amount < vehicle.maxHp * 0.5 ? 'CRITICAL' : 'SMOKING';
            vehicle.subsystems.tracks = 'DAMAGED';
          }
          armorNote = isSteepTopAttack
            ? '🔥 30MM DU GAU-8 TANK-BUSTER TOP-ROOF PENETRATION!'
            : '🔥 30MM DU GAU-8 REAR ENGINE DECK PENETRATION!';
        } else if (hitZone === 'FRONT') {
          amount = Math.max(1, Math.round(amount * 0.08));
          vehicle.lastArmorRicochet = true;
          armorNote = 'RICOCHET: 30MM BOUNCED OFF MBT FRONT GLACIS — DIVE >=20° ON TOP/REAR OR FIRE [3] AGM-65 MAVERICK!';
        } else {
          amount = Math.max(6, Math.round(amount * 0.38));
          if (vehicle.subsystems) vehicle.subsystems.tracks = 'DAMAGED';
          armorNote = '30MM GAU-8 SIDE SKIRT PENETRATION (TRACKS SHREDDED)';
        }
        vehicle.lastHitDesc = armorNote;
      } else if (/M242|BUSHMASTER|2A72|30MM AUTOCANNON/i.test(String(weaponName || ''))) {
        // Real-World LAV-25 (25mm M242 M791/M919 APDS-T) & BTR-82A (30mm 2A72 3UBR8 APDS-T) vs 65-ton MBT:
        // - Front Glacis (~650–800mm RHAe Chobham/Relikt): 0 hull HP pen (ricochet + 22% chance to shatter Tank Optics!).
        // - Side Skirts (~75mm): Light flanking chip damage + shreds Tank Tracks (Mobility Kill!).
        // - Rear Engine Louver Deck (~30–40mm): True armor-piercing penetration + Engine Smoking/Critical!
        if (hitZone === 'FRONT') {
          vehicle.lastArmorRicochet = true;
          if (critRng < 0.22 && vehicle.subsystems) {
            vehicle.subsystems.optics = 'DAMAGED';
            vehicle.opticsGlitchTimer = 10.0;
            vehicle.lastSubsystemCrit = 'OPTICS';
            armorNote =
              '🔭 25MM/30MM SHATTERED MBT FRONT OPTICS (0 HULL DMG — FLANK REAR ENGINE DECK OR FIRE [3] TOW ATGM!)';
          } else {
            armorNote =
              '🛡️ RICOCHET: 25MM/30MM CANNOT PENETRATE MBT FRONT GLACIS — FLANK REAR OR FIRE [3] TOW-2B / KORNET ATGM!';
          }
          vehicle.lastHitDesc = armorNote;
          vehicle.lastBdaHitmarker = armorNote;
          if (vehicle.driver && typeof vehicle.driver.recordIncomingFire === 'function') {
            vehicle.driver.recordIncomingFire(attackerName, armorNote, attackerPos);
          }
          return false;
        } else if (hitZone === 'REAR' || hitZone === 'TOP ROOF') {
          amount = Math.max(24, Math.round(amount * 0.88));
          if (vehicle.subsystems) {
            vehicle.subsystems.engine =
              vehicle.hp - amount < vehicle.maxHp * 0.45 ? 'CRITICAL' : 'SMOKING';
          }
          armorNote = '🔥 25MM/30MM APDS-T PENETRATED MBT REAR ENGINE LOUVERS (ENGINE HIT!)';
          vehicle.lastHitDesc = armorNote;
          vehicle.lastBdaHitmarker = armorNote;
        } else {
          amount = Math.max(10, Math.round(amount * 0.34));
          if (vehicle.subsystems) {
            vehicle.subsystems.tracks = 'DAMAGED';
          }
          armorNote = '⚙️ 25MM/30MM APDS-T FLANKED MBT SIDE SKIRT (TRACKS DAMAGED!)';
          vehicle.lastHitDesc = armorNote;
          vehicle.lastBdaHitmarker = armorNote;
        }
      }
    }

    // =========================================================================
    // MODULAR 6-ZONE AIRFRAME COMPONENT DAMAGE (WINGS, ENGINES, TAIL, AVIONICS, COCKPIT)
    // =========================================================================
    if (vehicle.isAircraft && amount > 0) {
      if (!vehicle.airframeParts) {
        vehicle.airframeParts = {
          leftWing: 100,
          rightWing: 100,
          engines: 100,
          tail: 100,
          avionics: 100,
          cockpit: 100
        };
      }
      // Hardened Rear Airbase Revetment & CIWS Spawn-Protection Shield:
      // Friendly aircraft parked on their own HQ Airbase or rolling for takeoff (< 18m AGL) take 85% less damage
      // so enemies can NEVER spawn-camp planes on the runway before they lift off!
      if (vehicle.pos && attackerTeam && attackerTeam !== vehicle.team) {
        const isUsAir = vehicle.team !== 'RU';
        const onOwnRearAirbase =
          (isUsAir ? vehicle.pos.x <= -2475 : vehicle.pos.x >= 2475) &&
          Math.abs(vehicle.pos.z) <= 300;
        if (onOwnRearAirbase) {
          const gY = this.world ? this.world.getGroundHeightAt(vehicle.pos.x, vehicle.pos.z) : 0;
          if (vehicle.pos.y - gY < 18.0) {
            amount = Math.max(1, Math.round(amount * 0.15));
          }
        }
      }
      const refPt = hitPoint || attackerPos;
      let partKey = 'engines';
      if (refPt && vehicle.pos) {
        const invEuler = new THREE.Euler(
          vehicle.pitch || 0,
          vehicle.yaw || 0,
          vehicle.roll || 0,
          'YXZ'
        );
        const invQuat = new THREE.Quaternion().setFromEuler(invEuler).invert();
        const localHit = new THREE.Vector3(
          refPt.x - vehicle.pos.x,
          refPt.y - vehicle.pos.y,
          refPt.z - vehicle.pos.z
        ).applyQuaternion(invQuat);

        if (!hitPoint) {
          // Directional aspect estimation when hit by splash/SAM without exact mesh ray point
          localHit.normalize().multiplyScalar(3.2);
        }

        if (localHit.x < -1.35) {
          partKey = 'leftWing';
        } else if (localHit.x > 1.35) {
          partKey = 'rightWing';
        } else if (localHit.z < -2.15 && localHit.y > 0.55) {
          partKey = 'cockpit';
        } else if (localHit.z < -1.65) {
          partKey = 'avionics';
        } else if (localHit.z > 1.95 && (Math.abs(localHit.x) > 1.05 || localHit.y > 0.95)) {
          partKey = 'tail';
        } else {
          partKey = 'engines';
        }
      }

      const basePartLoss = Math.max(
        4,
        Math.round((amount / Math.max(1, vehicle.maxHp || 1500)) * (hitPoint ? 215 : 155))
      );
      vehicle.airframeParts[partKey] = Math.max(
        0,
        Math.round((vehicle.airframeParts[partKey] ?? 100) - basePartLoss)
      );
      // Heavy missile / flak AoE splash also peppers adjacent control surfaces & engines
      if (!hitPoint && amount >= 180) {
        const splashLoss = Math.max(6, Math.round(basePartLoss * 0.38));
        for (const k of ['leftWing', 'rightWing', 'engines', 'tail']) {
          if (k !== partKey) {
            vehicle.airframeParts[k] = Math.max(
              0,
              Math.round((vehicle.airframeParts[k] ?? 100) - splashLoss)
            );
          }
        }
      }
      vehicle.lastAirframePart = partKey;
      const partLabelMap = {
        leftWing: 'LEFT WING / AILERON',
        rightWing: 'RIGHT WING / AILERON',
        engines: 'TURBOFAN ENGINE',
        tail: 'TAIL / ELEVATOR',
        avionics: 'RADAR / AVIONICS',
        cockpit: 'COCKPIT CANOPY'
      };
      const remPct = vehicle.airframeParts[partKey];
      armorNote = `✈️ ${partLabelMap[partKey]} HIT (${remPct}%)`;
      vehicle.lastHitZone = partKey.toUpperCase();
      vehicle.lastHitDesc = armorNote;

      if (partKey === 'avionics' && remPct < 45) {
        vehicle.sensorGlitchTimer = Math.max(vehicle.sensorGlitchTimer || 0, 3.8);
        vehicle.lastSubsystemCrit = 'SENSORS';
      } else if (
        partKey === 'cockpit' &&
        vehicle.aircraftRole !== 'cas' &&
        vehicle.driver &&
        !vehicle.driver.dead &&
        !vehicle.driver.downed &&
        amount >= 18
      ) {
        const shrapnelDmg = Math.min(28, Math.max(5, Math.round(amount * 0.12)));
        vehicle.driver.hp = Math.max(12, (vehicle.driver.hp || 100) - shrapnelDmg);
        vehicle.driver.bleeding = true;
        armorNote += ` • 🩸 PILOT GRAZED (-${shrapnelDmg} HP)`;
        vehicle.lastHitDesc = armorNote;
      }
    }

    const prevVehicleHp = vehicle.hp;
    if (prevVehicleHp >= (vehicle.maxHp || 1) * 0.98) {
      vehicle._bdaHitCount = 0;
      vehicle._bdaRicochetCount = 0;
    }
    vehicle.lastAppliedDamage = amount;
    vehicle.hp = Math.max(0, vehicle.hp - amount);
    vehicle.hullIntegrityPct = Math.max(
      0,
      Math.min(100, Math.round((vehicle.hp / Math.max(1, vehicle.maxHp)) * 100))
    );
    if (isArmoredGround && vehicle.subsystems) {
      if (vehicle.hullIntegrityPct < 35) {
        vehicle.subsystems.engine = 'CRITICAL';
      } else if (vehicle.hullIntegrityPct < 65 && vehicle.subsystems.engine === 'OK') {
        vehicle.subsystems.engine = 'SMOKING';
      }
      if (vehicle.hullIntegrityPct < 45 && amount >= 85) {
        vehicle.subsystems.tracks = 'DAMAGED';
      }
    }

    // =========================================================================
    // LIVE ARMOR BATTLE-DAMAGE ASSESSMENT (BDA) & "HITS TO GO" TELEMETRY LOGGING
    // Tracks penetrating hit count, exact HP remaining, and estimated hits left to destroy!
    // =========================================================================
    if (isArmoredGround) {
      const isRicochet = Boolean(vehicle.lastArmorRicochet || amount <= 6);
      if (isRicochet) {
        vehicle._bdaRicochetCount = (vehicle._bdaRicochetCount || 0) + 1;
      } else if (amount > 0) {
        vehicle._bdaHitCount = (vehicle._bdaHitCount || 0) + 1;
      }
      const hitNum = vehicle._bdaHitCount || 0;
      const hpLeft = Math.ceil(vehicle.hp);
      const maxHpVal = Math.round(vehicle.maxHp || 2100);
      const hitsToGo =
        vehicle.hp <= 0 ? 0 : isRicochet ? null : Math.ceil(vehicle.hp / Math.max(1, amount));
      const shortVehName = String(vehicle.name || vehicle.type || 'TANK').split(' (')[0];
      const shortWpn = String(weaponName || 'ANTI-ARMOR').trim();
      const mobKill = vehicle.subsystems?.tracks === 'DAMAGED';
      const engCrit = vehicle.subsystems?.engine === 'CRITICAL';
      const critBadge =
        mobKill && engCrit
          ? ' • MOBILITY+ENG CRIT'
          : mobKill
          ? ' • MOBILITY KILL'
          : engCrit
          ? ' • ENGINE CRIT'
          : '';

      vehicle.lastBdaSummary = {
        hitNum,
        ricochetCount: vehicle._bdaRicochetCount || 0,
        dmg: amount,
        hpLeft,
        maxHp: maxHpVal,
        hpPct: vehicle.hullIntegrityPct,
        hitsToGo,
        zone: hitZone,
        weapon: shortWpn,
        mobKill,
        engCrit,
        ricochet: isRicochet,
        destroyed: vehicle.hp <= 0
      };

      if (vehicle.hp <= 0) {
        vehicle.lastBdaHitmarker = `💥 ${
          vehicle.type === 'tank' ? 'TANK' : 'ARMOR'
        } DESTROYED IN ${Math.max(1, hitNum)} HIT${Math.max(1, hitNum) === 1 ? '' : 'S'}! (-${amount} HP)`;
      } else if (isRicochet) {
        vehicle.lastBdaHitmarker = `🛡️ RICOCHET (-${amount} HP) • USE [3] 105MM / AT!`;
      } else {
        const toGoTxt = `${hitsToGo} HIT${hitsToGo === 1 ? '' : 'S'} TO GO`;
        vehicle.lastBdaHitmarker = `🎯 HIT #${hitNum} (-${amount} HP) • ~${toGoTxt} [${vehicle.hullIntegrityPct}% HP${critBadge}]`;
      }

      // Emit live HUD combat-feed log & browser console telemetry when local player hits enemy armor!
      const isLocalPlayerAttacker = Boolean(
        onAwardXp || (this.lastPlayer && attackerName === this.lastPlayer.name)
      );
      if (isLocalPlayerAttacker) {
        const nowBdaMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const isRapidAutocannon = isAc13025mm || isA10Gau8 || /VULCAN|GATLING|COAX|MG/.test(shortWpn.toUpperCase());
        const hudCooldownMs = vehicle.hp <= 0 ? 0 : isRapidAutocannon ? 1150 : isAc13040mm ? 520 : 80;
        const consoleCooldownMs = vehicle.hp <= 0 ? 0 : isRapidAutocannon ? 400 : 0;

        if (this.lastPlayer?.ui?.showHitmarker) {
          this.lastPlayer.ui.showHitmarker(
            vehicle.hp <= 0 ? 'kill' : 'armor',
            vehicle.lastBdaHitmarker
          );
        }

        if (onAwardXp && nowBdaMs - (vehicle._lastBdaHudLogMs || 0) >= hudCooldownMs) {
          vehicle._lastBdaHudLogMs = nowBdaMs;
          const bdaFeedLine =
            vehicle.hp <= 0
              ? `💥 [TANK BDA] ${shortVehName} DESTROYED IN ${Math.max(1, hitNum)} HIT${
                  Math.max(1, hitNum) === 1 ? '' : 'S'
                } (${shortWpn} • FINAL -${amount} DMG)!`
              : isRicochet
              ? `🛡️ [TANK BDA] ${shortWpn} RICOCHETED OFF ${shortVehName} (${hitZone}: -${amount} DMG → ${hpLeft}/${maxHpVal} HP • USE [2] 40MM OR [3] 105MM)!`
              : `📊 [TANK BDA] HIT #${hitNum} (${shortWpn} • ${hitZone}): -${amount} DMG → ${hpLeft}/${maxHpVal} HP (${vehicle.hullIntegrityPct}%) • ~${hitsToGo} HIT${
                  hitsToGo === 1 ? '' : 'S'
                } TO GO!${critBadge ? ` [${critBadge.slice(3)}]` : ''}`;
          onAwardXp(0, bdaFeedLine);
        }

        const inNodeTest =
          typeof process !== 'undefined' && Boolean(process.env && process.env.NODE_TEST_CONTEXT);
        if (!inNodeTest && nowBdaMs - (vehicle._lastBdaConsoleMs || 0) >= consoleCooldownMs) {
          vehicle._lastBdaConsoleMs = nowBdaMs;
          const subTxt = vehicle.subsystems
            ? `TRACKS=${vehicle.subsystems.tracks}, ENG=${vehicle.subsystems.engine}, OPTICS=${vehicle.subsystems.optics}`
            : 'N/A';
          console.info(
            `[TANK BDA] ${shortVehName} | ${
              vehicle.hp <= 0
                ? `DESTROYED ON HIT #${Math.max(1, hitNum)}`
                : isRicochet
                ? `RICOCHET #${vehicle._bdaRicochetCount}`
                : `Hit #${hitNum}`
            } via ${shortWpn} [${hitZone}] | -${amount} DMG | HP: ${hpLeft}/${maxHpVal} (${
              vehicle.hullIntegrityPct
            }%) | Hits To Go: ${hitsToGo === null ? '∞ (RICOCHET)' : hitsToGo} | ${subTxt}`
          );
        }
      }
    }

    // Notify local player inside the vehicle with directional armor impact indicator!
    if (vehicle.driver && typeof vehicle.driver.notifyVehicleHit === 'function' && amount > 0) {
      const hitLabel = armorNote ? `${weaponName || 'ANTI-ARMOR'} • ${armorNote}` : weaponName || 'ANTI-ARMOR';
      vehicle.driver.notifyVehicleHit(amount, attackerName, hitLabel, attackerPos);
    }
    // Forward PvP vehicle hit to remote human pilot/driver over WebRTC / Cloud Relay!
    if (
      vehicle.remoteDriverId &&
      !vehicle._receivingRemoteDamage &&
      amount > 0 &&
      this.lastPlayer?.onBroadcast &&
      attackerName === this.lastPlayer.name
    ) {
      this.lastPlayer.onBroadcast({
        type: 'veh_hit',
        vehicleId: vehicle.id,
        targetDriverId: vehicle.remoteDriverId,
        damage: amount,
        attackerName,
        attackerTeam,
        weapon: weaponName || 'ANTI-ARMOR',
        attackerPos: attackerPos ? [attackerPos.x, attackerPos.y, attackerPos.z] : null
      });
    }

    if (vehicle.hp <= 0) {
      // Airborne planes do NOT immediately explode mid-air! Instead they enter a burning Mayday spiral
      // so the pilot must press [E] to eject their seat before crashing into the ground!
      const groundH = this.world ? this.world.getGroundHeightAt(vehicle.pos.x, vehicle.pos.z) : 0;
      if (vehicle.isAircraft && vehicle.pos.y > groundH + 4.0) {
        vehicle.hp = 1;
        if (!vehicle.flightFSM) createAircraftFlightFSM(vehicle);
        vehicle.flightFSM.send(AIRCRAFT_FLIGHT_EVENTS.SHOT_DOWN_AIRBORNE);
        vehicle.isShotDown = true;
        vehicle.isStalling = false;
        vehicle.stallSinkVel = 0;
        vehicle.aiPilotActive = false;
        vehicle.shotDownTimer = 14.0;
        vehicle.shotDownSpinDir = Math.random() < 0.5 ? -1 : 1;
        this.creditAttackerVehicleKill(
          vehicle,
          attackerName || 'ANTI-AIR SAM',
          attackerTeam || (vehicle.team === 'US' ? 'RU' : 'US'),
          weaponName || 'ANTI-AIR SAM'
        );
        let shotDownXpAwarded = false;
        if (onAwardXp) {
          shotDownXpAwarded = true;
          const xpPts =
            vehicle.aircraftRole === 'b2_spirit'
              ? VEHICLE_STATS.DESTROY_XP_B2 || 900
              : VEHICLE_STATS.DESTROY_XP_PLANE || 650;
          const tLoss =
            vehicle.ticketCost ||
            (vehicle.aircraftRole === 'b2_spirit'
              ? VEHICLE_STATS.TICKET_COST_B2_SPIRIT || 45
              : VEHICLE_STATS.TICKET_COST_PLANE || 30);
          const xpReason = `✈️ SPLASH ONE! AIRCRAFT SHOT DOWN (${vehicle.name} • -${tLoss} ENEMY 🎟️)`;
          events.emit('xp:awarded', { amount: xpPts, reason: xpReason });
          if (!onAwardXp._isEventsBridge) {
            onAwardXp(xpPts, xpReason);
          }
        }
        vehicle.shotDownAttacker = {
          attackerName: attackerName || 'ANTI-AIR SAM',
          attackerTeam: attackerTeam || (vehicle.team === 'US' ? 'RU' : 'US'),
          weaponName: weaponName || 'ANTI-AIR SAM',
          onKillFn,
          onAwardXp,
          _xpAlreadyAwarded: shotDownXpAwarded,
          attackerPos
        };

        const listenerPos =
          (vehicle.driver && vehicle.driver.pos) ||
          (this.lastPlayer && this.lastPlayer.pos) ||
          null;
        const distToListener = listenerPos ? listenerPos.distanceTo(vehicle.pos) : 0;
        sound.playExplosion(distToListener, 0, 1.15);
        this.world.spawnExplosionVisual(
          tmpVec3(vehicle.pos.x, vehicle.pos.y + 1.2, vehicle.pos.z),
          5.2
        );

        if (vehicle.driver) {
          if (typeof vehicle.driver.addShake === 'function') {
            vehicle.driver.addShake(0.65);
          }
          if (vehicle.driver.onAwardXp) {
            vehicle.driver.onAwardXp(
              0,
              '🚨 MAYDAY! AIRFRAME SHOT DOWN — PRESS [E] TO EJECT SEAT BEFORE GROUND CRASH!'
            );
          }
        } else if (typeof window !== 'undefined' && window.game?.botManager?.bots && vehicle.pos.y > groundH + 16) {
          // Eject an AI pilot with parachute while the burning plane spirals down!
          const pilotBot = window.game.botManager.bots.find(
            (b) => b.team === vehicle.team && !b.drivingVehicle && (b.dead || !b.downed)
          );
          if (pilotBot) {
            pilotBot.dead = false;
            pilotBot.downed = false;
            pilotBot.hp = 85;
            pilotBot.parachuting = true;
            pilotBot.pos.copy(vehicle.pos).add(new THREE.Vector3(0, 4.8, 0));
            pilotBot.mesh.position.copy(pilotBot.pos);
            pilotBot.mesh.visible = true;
          }
        }
        return true;
      }

      vehicle.hp = 0;
      vehicle.dead = true;
      vehicle.isShotDown = false;
      vehicle.isStalling = false;
      vehicle.stallSinkVel = 0;
      // Tiered vehicle replacement delay (B-2 Spirit 90s, Standard Plane 35s, MBT 28s, IFV/APC 22s, Car 15s)
      vehicle.respawnTimer = vehicle.isAircraft
        ? vehicle.aircraftRole === 'b2_spirit'
          ? VEHICLE_STATS.RESPAWN_DELAY_B2_SPIRIT || 90.0
          : VEHICLE_STATS.RESPAWN_DELAY_PLANE || 35.0
        : vehicle.type === 'tank'
        ? VEHICLE_STATS.RESPAWN_DELAY_TANK
        : vehicle.type === 'apc'
        ? VEHICLE_STATS.RESPAWN_DELAY_APC
        : VEHICLE_STATS.RESPAWN_DELAY_HUMVEE;
      vehicle.replacementTicketPaid = false;
      vehicle.replacementFundsPaid = false;
      vehicle.mesh.visible = false;
      vehicle.aiPilotActive = false;
      if (Array.isArray(vehicle.aiPassengers) && vehicle.aiPassengers.length > 0) {
        for (const pax of vehicle.aiPassengers) {
          if (pax) {
            pax.ridingVehicle = null;
            if (!pax.dead) {
              pax.pos.set(
                vehicle.pos.x + (Math.random() - 0.5) * 4.5,
                groundH,
                vehicle.pos.z + (Math.random() - 0.5) * 4.5
              );
              if (pax.mesh) {
                pax.mesh.position.copy(pax.pos);
                pax.mesh.visible = true;
              }
            }
          }
        }
        vehicle.aiPassengers.length = 0;
      }
      if (Array.isArray(vehicle.crewSeats)) {
        vehicle.crewSeats.fill(null);
      }
      this.spawnVehicleWreck(vehicle);
      if (vehicle.flightFSM) {
        vehicle.flightFSM.send(AIRCRAFT_FLIGHT_EVENTS.DESTROY_GROUND);
      }
      if (vehicle.occupancyFSM) {
        vehicle.occupancyFSM.send(GROUND_VEHICLE_EVENTS.DESTROY);
      }

      this.creditAttackerVehicleKill(
        vehicle,
        attackerName,
        attackerTeam,
        weaponName || 'RPG-7 HEAT'
      );
      const respawnCategory = this.classifyVehicleKillCategory(vehicle);
      const isUncrewedNeutralBike =
        Boolean(vehicle.isWarehouseBike || vehicle.type === 'bike' || vehicle.type === 'atv') &&
        !vehicle.driver &&
        !vehicle.npcDriver;
      const respawnCost = isUncrewedNeutralBike
        ? 0
        : vehicle.ticketCost ||
          (respawnCategory === 'PLANE'
            ? VEHICLE_STATS.TICKET_COST_PLANE || 30
            : vehicle.type === 'tank'
            ? VEHICLE_STATS.TICKET_COST_TANK || 24
            : respawnCategory === 'TANK'
            ? VEHICLE_STATS.TICKET_COST_APC || 16
            : VEHICLE_STATS.TICKET_COST_HUMVEE || 8);
      const moneyCost = isUncrewedNeutralBike ? 0 : vehicle.factionMoneyCost || 0;
      events.emit('vehicle:destroyed', {
        vehicle,
        attackerName,
        attackerTeam,
        weaponName: weaponName || 'RPG-7 HEAT',
        cost: respawnCost,
        moneyCost,
        category: respawnCategory
      });
      if (respawnCost > 0) {
        events.emit('vehicle:respawn', {
          vehicle,
          cost: respawnCost,
          moneyCost,
          category: respawnCategory,
          stage: 'VEHICLE_DESTROYED'
        });
        if (this.onVehicleRespawn && !this.onVehicleRespawn._isEventsBridge) {
          this.onVehicleRespawn(vehicle, respawnCost, respawnCategory, 'VEHICLE_DESTROYED', moneyCost);
        }
      }
      vehicle.replacementTicketPaid = true;

      const listenerPos =
        (vehicle.driver && vehicle.driver.pos) ||
        (this.lastPlayer && this.lastPlayer.pos) ||
        null;
      const distToListener = listenerPos ? listenerPos.distanceTo(vehicle.pos) : 0;
      if (vehicle.type === 'warhorse' || vehicle.type === 'raptor_mount' || vehicle.type === 'trex_mount') {
        sound.playMeleeSwing?.(distToListener, 0, true);
        this.world.spawnDebris(
          tmpVec3(vehicle.pos.x, vehicle.pos.y + 1.2, vehicle.pos.z),
          new THREE.Color(0x8b4513),
          6
        );
      } else {
        sound.playExplosion(distToListener, 0, vehicle.isAircraft ? 1.3 : vehicle.type === 'tank' ? 1.2 : 1.0);
        this.world.spawnExplosionVisual(
          tmpVec3(vehicle.pos.x, vehicle.pos.y + 1.6, vehicle.pos.z),
          vehicle.isAircraft ? 9.5 : vehicle.type === 'tank' ? 8.5 : 6.5
        );
      }

      if (vehicle.driver) {
        const driver = vehicle.driver;
        if (Array.isArray(vehicle.mesh?.userData?.cockpitCanopyParts)) {
          for (const p of vehicle.mesh.userData.cockpitCanopyParts) {
            if (p) p.visible = true;
          }
        }
        vehicle.driver = null;
        driver.activeVehicle = null;
        if (driver.viewModelGroup) driver.viewModelGroup.visible = true;
        events.emit('player:exited-vehicle', { vehicle, reason: 'destroyed' });
        if (vehicle.isAircraft && typeof driver.activateParachuteEject === 'function') {
          driver.activateParachuteEject(vehicle.pos);
        } else if (vehicle.type === 'warhorse') {
          driver.pos.copy(vehicle.pos);
          driver.pos.y = this.world.getGroundHeightAt(driver.pos.x, driver.pos.z);
        } else {
          driver.pos.x += 2.6;
          driver.pos.y = this.world.getGroundHeightAt(driver.pos.x, driver.pos.z);
        }
        const hasBailoutProtection =
          driver.role === 'armor' ||
          driver.role === 'pilot' ||
          vehicle.type === 'warhorse' ||
          vehicle.type === 'raptor_mount' ||
          vehicle.type === 'trex_mount';
        if (!hasBailoutProtection) {
          driver.takeDamage(
            VEHICLE_STATS.BAILOUT_DAMAGE,
            attackerName,
            attackerTeam,
            `${weaponName || 'RPG-7 HEAT'} (BAIL OUT)`,
            onKillFn,
            attackerPos || vehicle.pos
          );
        } else if (driver.onAwardXp) {
          driver.onAwardXp(
            25,
            vehicle.type === 'warhorse'
              ? `🐴 YOUR WARHORSE WAS SLAIN (${weaponName || 'ENEMY HIT'}) — YOU SURVIVED ON FOOT (${Math.ceil(driver.hp)} HP)!`
              : vehicle.isAircraft
              ? '🪂 ZERO-ZERO PILOT EJECTION SEAT — 0 BAILOUT DAMAGE!'
              : '🛡️ BLOWOUT AMMO RACK SURVIVAL — 0 BAILOUT DAMAGE!'
          );
        }
      }

      if (vehicle.npcDriver) {
        const npc = vehicle.npcDriver;
        vehicle.npcDriver = null;
        npc.drivingVehicle = null;
        const gY = this.world.getGroundHeightAt(vehicle.pos.x, vehicle.pos.z);
        if (vehicle.isAircraft && vehicle.pos.y > gY + 12) {
          // Eject AI Pilot with 3D Parachute Canopy in mid-air!
          npc.dead = false;
          npc.downed = false;
          npc.hp = 75;
          npc.parachuting = true;
          npc.pos.copy(vehicle.pos).add(new THREE.Vector3(0, 4.5, 0));
          npc.mesh.position.copy(npc.pos);
          npc.mesh.visible = true;
        } else if (vehicle.type === 'warhorse') {
          // Separate Horse & Rider Health: When an AI Knight's Warhorse is slain, the Knight survives on foot!
          npc.dead = false;
          npc.downed = false;
          npc.hp = Math.max(45, npc.hp || 100);
          npc.pos.set(vehicle.pos.x, gY, vehicle.pos.z);
          npc.mesh.position.copy(npc.pos);
          npc.mesh.visible = true;
        } else {
          npc.mesh.visible = true;
          npc.pos.copy(vehicle.pos);
          npc.hp = 0;
          npc.downed = false;
          npc.dead = true;
          npc.deaths = (npc.deaths || 0) + 1;
          npc.respawnTimer = 6.5;
          npc.mesh.visible = false;
        }
      } else if (
        vehicle.isAircraft &&
        !vehicle.driver &&
        typeof window !== 'undefined' &&
        window.game?.botManager?.bots
      ) {
        // If an autonomous AI aircraft was shot down in mid-air, eject a surviving AI Pilot with Parachute!
        const gY = this.world.getGroundHeightAt(vehicle.pos.x, vehicle.pos.z);
        if (vehicle.pos.y > gY + 12) {
          const pilotBot = window.game.botManager.bots.find(
            (b) => b.team === vehicle.team && !b.drivingVehicle && (b.dead || !b.downed)
          );
          if (pilotBot) {
            pilotBot.dead = false;
            pilotBot.downed = false;
            pilotBot.hp = 85;
            pilotBot.parachuting = true;
            pilotBot.pos.copy(vehicle.pos).add(new THREE.Vector3(0, 4.8, 0));
            pilotBot.mesh.position.copy(pilotBot.pos);
            pilotBot.mesh.visible = true;
          }
        }
      }

      events.emit('kill:event', {
        killer: attackerName,
        kTeam: attackerTeam,
        victim: vehicle.name,
        vTeam: vehicle.team,
        weapon: weaponName || 'RPG-7 HEAT',
        isHs: false
      });
      if (onKillFn && !onKillFn._isEventsBridge) {
        onKillFn(
          attackerName,
          attackerTeam,
          vehicle.name,
          vehicle.team,
          weaponName || 'RPG-7 HEAT',
          false
        );
      }

      if (onAwardXp) {
        const xpPts =
          respawnCategory === 'PLANE'
            ? vehicle.aircraftRole === 'b2_spirit'
              ? VEHICLE_STATS.DESTROY_XP_B2 || 900
              : VEHICLE_STATS.DESTROY_XP_PLANE || 650
            : vehicle.type === 'tank'
            ? VEHICLE_STATS.DESTROY_XP_TANK || 500
            : respawnCategory === 'TANK'
            ? VEHICLE_STATS.DESTROY_XP_APC || 380
            : VEHICLE_STATS.DESTROY_XP_CAR || 250;
        const xpReason =
          respawnCategory === 'PLANE'
            ? `✈️ AIRCRAFT DESTROYED! (${vehicle.name} • -${respawnCost} ENEMY 🎟️)`
            : respawnCategory === 'TANK'
            ? `🛡️ HEAVY ARMOR & CREW DESTROYED! (${vehicle.name} • -${respawnCost} ENEMY 🎟️)`
            : `🚙 TACTICAL VEHICLE DESTROYED! (${vehicle.name}${respawnCost > 0 ? ` • -${respawnCost} ENEMY 🎟️` : ''})`;
        events.emit('xp:awarded', { amount: xpPts, reason: xpReason });
        if (!onAwardXp._isEventsBridge) {
          onAwardXp(xpPts, xpReason);
        }
      }
      return true;
    }
    return false;
  }

  update(dt, player = null, botManager = null, onDeployMenu = false, cameraArg = null) {
    if (player) this.lastPlayer = player;
    const isDeployFlag = Boolean(onDeployMenu && !onDeployMenu.isCamera);
    const activeCam =
      (cameraArg && cameraArg.isCamera ? cameraArg : null) ||
      (onDeployMenu && onDeployMenu.isCamera ? onDeployMenu : null) ||
      player?.camera ||
      null;
    this._suppressPreDeployKills = Boolean(
      isDeployFlag && (!player || (player.dead && (player.deaths || 0) === 0))
    );
    this.refreshTeamVehicleLists();

    // Precompute 3D Camera Frustum & Fog-Safe Distance LOD once per frame to cull 600+ off-screen / 2.8km HQ apron draw calls!
    let hasVehFrustum = false;
    let camPosX = player ? player.pos.x : 0;
    let camPosY = player ? player.pos.y + 1.6 : 0;
    let camPosZ = player ? player.pos.z : 0;
    let opticZoomScale = 1.0;
    if (activeCam?.projectionMatrix && activeCam?.matrixWorld) {
      if (!this._vehProjScreenMat) this._vehProjScreenMat = new THREE.Matrix4();
      if (!this._vehFrustum) this._vehFrustum = new THREE.Frustum();
      if (!this._vehCullSphere) this._vehCullSphere = new THREE.Sphere(new THREE.Vector3(), 22);
      if (activeCam.matrixWorldInverse) {
        activeCam.matrixWorldInverse.copy(activeCam.matrixWorld).invert();
        this._vehProjScreenMat.multiplyMatrices(
          activeCam.projectionMatrix,
          activeCam.matrixWorldInverse
        );
        this._vehFrustum.setFromProjectionMatrix(this._vehProjScreenMat);
        hasVehFrustum = true;
      }
      const ce = activeCam.matrixWorld.elements;
      camPosX = ce[12];
      camPosY = ce[13];
      camPosZ = ce[14];
      opticZoomScale = THREE.MathUtils.clamp(75 / Math.max(10, activeCam.fov || 75), 1.0, 6.5);
    }
    const playerInAir = Boolean(player?.activeVehicle && player.activeVehicle.isAircraft);
    const maxGroundVehVisDist = Math.min(2600, (playerInAir ? 1350 : 720) * opticZoomScale);
    const maxGroundVehVisDistSq = maxGroundVehVisDist * maxGroundVehVisDist;
    const maxAirborneVisDistSq = 3200 * 3200;

    // Update persistent 20s Burning 3D Vehicle Wrecks (fire flicker + smoke column + clean expiry)
    if (Array.isArray(this.activeWrecks) && this.activeWrecks.length > 0) {
      for (let wi = this.activeWrecks.length - 1; wi >= 0; wi--) {
        const w = this.activeWrecks[wi];
        w.life -= dt;
        if (w.life <= 0) {
          if (w.mesh && this.scene) this.scene.remove(w.mesh);
          this.activeWrecks.splice(wi, 1);
          continue;
        }
        if (w.fireMesh) {
          const fade = Math.min(1, w.life / 4.0);
          w.fireMesh.visible = w.life > 2.5;
          const pulse = 0.85 + Math.sin(w.life * 14.0) * 0.22;
          w.fireMesh.scale.set(pulse, pulse * fade, pulse);
        }
        w.smokeTimer = (w.smokeTimer || 0) + dt;
        if (w.smokeTimer >= 0.42 && this.world?.spawnDebris) {
          w.smokeTimer = 0;
          this.world.spawnDebris(
            tmpVec3(w.pos.x, w.pos.y + 1.85, w.pos.z),
            w.life > 8 ? COLOR_FIRE_ORANGE : new THREE.Color(0x2d3436),
            2
          );
        }
      }
    }

    for (const v of this.vehicles) {
      if (v.dead) {
        if (isDeployFlag) continue;
        // B-2 Spirit Stealth Bomber stays locked in hangar until its faction reaches 25 kills!
        if (v.b2LockedUntilKills) {
          if (this.isB2UnlockedForTeam(v.team)) {
            v.b2LockedUntilKills = false;
            v.respawnTimer = 0;
          } else {
            continue;
          }
        }
        v.respawnTimer -= dt;
        if (v.respawnTimer <= 0) {
          // Check if faction can afford the vehicle replacement ticket cost & equipment/crew treasury cost
          const category = this.classifyVehicleKillCategory(v);
          const cost =
            v.ticketCost ||
            (category === 'PLANE' ? 30 : v.type === 'tank' ? 24 : category === 'TANK' ? 16 : 8);
          const moneyCost =
            v.factionMoneyCost ??
            (category === 'PLANE'
              ? v.aircraftRole === 'b2_spirit'
                ? VEHICLE_STATS.FACTION_COST_B2_SPIRIT || 2500
                : VEHICLE_STATS.FACTION_COST_PLANE || 1500
              : v.type === 'tank'
              ? VEHICLE_STATS.FACTION_COST_TANK || 1300
              : category === 'TANK'
              ? VEHICLE_STATS.FACTION_COST_APC || 800
              : v.type === 'humvee'
              ? VEHICLE_STATS.FACTION_COST_CAR || 350
              : 0);
          if (!v.replacementTicketPaid && this.canTeamAffordRespawn && !this.canTeamAffordRespawn(v.team, cost)) {
            v.respawnTimer = 2.0;
            continue;
          }
          if (moneyCost > 0 && !v.replacementFundsPaid) {
            if (this.getTeamFunds(v.team) < moneyCost) {
              // Allow slow emergency war-chest trickle so depleted teams wait much longer (+12s) for expensive replacements
              this.addTeamFunds(v.team, 140);
              v.respawnTimer = 6.0;
              continue;
            }
            this.addTeamFunds(v.team, -moneyCost);
            v.replacementFundsPaid = true;
          }
          v._killCredited = false;
          if (!v.replacementTicketPaid) {
            events.emit('vehicle:respawn', {
              vehicle: v,
              cost,
              moneyCost,
              category,
              stage: 'VEHICLE_RESPAWN'
            });
            if (this.onVehicleRespawn && !this.onVehicleRespawn._isEventsBridge) {
              this.onVehicleRespawn(v, cost, category, 'VEHICLE_RESPAWN', moneyCost);
            }
          }
          // Respawn UNOCCUPIED at its faction's Main Base Motor Pool, FOB Bike Pool, or Airfield Outer Apron!
          const safeRespawn = v.isAircraft
            ? v.spawnPos.clone()
            : this.world.findSafeVehicleSpawnPoint
            ? this.world.findSafeVehicleSpawnPoint(
                v.spawnPos.x,
                v.spawnPos.z,
                v.spawnYaw,
                v.hullHalfWidth || (v.type === 'bike' ? 0.5 : v.type === 'atv' ? 0.85 : 1.95),
                v.hullHalfLength || (v.type === 'bike' ? 1.05 : v.type === 'atv' ? 1.25 : 3.55),
                this.vehicles
              )
            : v.spawnPos;
          const respawnYaw =
            typeof safeRespawn.safeYaw === 'number' ? safeRespawn.safeYaw : v.spawnYaw;
          v.dead = false;
          v.isShotDown = false;
          v.isStalling = false;
          v.stallSinkVel = 0;
          v.throttle = 0;
          v.replacementTicketPaid = false;
          v.replacementFundsPaid = false;
          v.hp = v.maxHp;
          v.hullIntegrityPct = 100;
          v.armorZones = { front: 100, left: 100, right: 100, rear: 100 };
          v.eraBlocksIntact = v.maxEraBlocks || 0;
          v.subsystems = { tracks: 'OK', turret: 'OK', engine: 'OK', optics: 'OK' };
          v.lastHitZone = 'FRONT';
          v.lastHitDesc = '';
          v.climbOffsetY = 0;
          v.armor = v.maxArmor || 0;
          v.driver = null;
          v.npcDriver = null;
          v.aiPilotActive = false;
          v.aiSortieLaunchDelay = v.isAircraft ? 3.0 : 0;
          v.activeWeaponSlot = 0;
          v.coaxHeat = 0;
          v.coaxOverheated = false;
          v.patrolIndex = 0;
          v.pos.copy(safeRespawn);
          v.yaw = respawnYaw;
          v.pitch = 0;
          v.roll = 0;
          v.turretYaw = respawnYaw;
          v.forwardSpeed = 0;
          v.barrelRecoil = 0;
          this.rearmVehicleOrdnance(v);
          if (Array.isArray(v.crewSeats)) v.crewSeats.fill(null);
          if (Array.isArray(v.aiPassengers)) v.aiPassengers.length = 0;
          v.mesh.position.copy(safeRespawn);
          v.mesh.rotation.set(0, respawnYaw, 0, 'YXZ');
          v.mesh.visible = true;
          if (v.flightFSM) {
            v.flightFSM.send(AIRCRAFT_FLIGHT_EVENTS.RESPAWN_RUNWAY);
          }
          if (v.occupancyFSM) {
            v.occupancyFSM.send(GROUND_VEHICLE_EVENTS.RESPAWN_READY);
          }
          v.cmFSM?.send(VEHICLE_CM_EVENTS.RESET);
          v.thermalFSM?.send(VEHICLE_THERMAL_EVENTS.RESET);
        }
        continue;
      }

      if (v.fireCooldown > 0) v.fireCooldown = Math.max(0, v.fireCooldown - dt);
      if (v.coaxCooldown > 0) v.coaxCooldown = Math.max(0, v.coaxCooldown - dt);
      if (v.flareCooldown > 0) v.flareCooldown = Math.max(0, v.flareCooldown - dt);
      if (v.flareActiveTimer > 0) v.flareActiveTimer = Math.max(0, v.flareActiveTimer - dt);
      if ((v.claimedByPlayerTimer || 0) > 0) {
        v.claimedByPlayerTimer = Math.max(0, v.claimedByPlayerTimer - dt);
        if (v.claimedByPlayerTimer <= 0) {
          v.claimedByPlayer = false;
        }
      }
      if (v.coaxHeat > 0) {
        v.coaxHeat = Math.max(0, v.coaxHeat - dt * (v.coaxOverheated ? 0.34 : 0.42));
        if (v.coaxOverheated && v.coaxHeat <= 0.15) {
          v.coaxOverheated = false;
        }
      }
      if (
        !v.cmFSM ||
        !v.thermalFSM ||
        (v.flareActiveTimer || 0) > 0 ||
        (v.flareCooldown || 0) > 0 ||
        (v.coaxHeat || 0) > 0 ||
        v.coaxOverheated ||
        v.cmState !== 'CM_READY' ||
        v.thermalState !== 'THERMAL_NORMAL'
      ) {
        syncVehicleSubsystemsFSM(v);
      }
      if (v.barrelRecoil > 0) {
        v.barrelRecoil = Math.max(0, v.barrelRecoil - dt * 1.8);
      }
      if (v.barrelGroup && v.type === 'tank') {
        v.barrelGroup.position.z = 1.35 - v.barrelRecoil * 0.55;
      }

      // HQ Runway Parked Pit-Stop + Low-Pass (< 45m AGL) + HQ Motor Pool + Friendly FOB Supply Station Rearm & Subsystem Repair!
      const isParkedHqPlane =
        v.isAircraft &&
        !v.isShotDown &&
        ((v.team !== 'RU' ? v.pos.x <= -2475 : v.pos.x >= 2475) && Math.abs(v.pos.z) <= 300);
      if (v.driver || v.npcDriver || v.aiPilotActive || isParkedHqPlane) {
        const gHere = this.world ? this.world.getGroundHeightAt(v.pos.x, v.pos.z) : 0;
        let inSupplyZone = false;
        let isRunwayParkedPitStop = false;
        let supplyLabel = '';
        let repairMult = 1.0;
        if (v.isAircraft) {
          const isUsPlane = v.team !== 'RU';
          const overFriendlyAirfield =
            (isUsPlane ? v.pos.x <= -2475 : v.pos.x >= 2475) && Math.abs(v.pos.z) <= 300;
          const hqBaseAir =
            v.team === 'RU'
              ? this.world?.spawns?.RU_BASE || { x: 1520, z: 0 }
              : this.world?.spawns?.US_BASE || { x: -1520, z: 0 };
          const overHqHelipad =
            Boolean(v.isHelicopter) &&
            Math.hypot(v.pos.x - hqBaseAir.x, v.pos.z - hqBaseAir.z) <= 155;
          let overFobHelipad = false;
          let fobPadId = '';
          if (v.isHelicopter && Array.isArray(this.world?.flags)) {
            for (let fi = 0; fi < this.world.flags.length; fi++) {
              const fl = this.world.flags[fi];
              if (fl && fl.owner === v.team && Math.hypot(v.pos.x - fl.pos.x, v.pos.z - fl.pos.z) <= 44) {
                overFobHelipad = true;
                fobPadId = fl.id;
                break;
              }
            }
          }
          const altAglHere = v.pos.y - gHere;
          if (overFriendlyAirfield && altAglHere <= 45.0 && !v.isShotDown) {
            inSupplyZone = true;
            isRunwayParkedPitStop = altAglHere <= 5.5 && Math.abs(v.forwardSpeed || 0) < 26.0;
            supplyLabel = isRunwayParkedPitStop
              ? 'HQ RUNWAY GROUND CREW PIT-STOP'
              : 'HQ RUNWAY LOW-PASS (<45M)';
            repairMult = isRunwayParkedPitStop ? 2.2 : 1.35;
          } else if ((overHqHelipad || overFobHelipad) && altAglHere <= 28.0 && !v.isShotDown) {
            inSupplyZone = true;
            isRunwayParkedPitStop = altAglHere <= 4.5 && Math.abs(v.forwardSpeed || 0) < 12.0;
            supplyLabel = overHqHelipad
              ? 'MAIN BASE HQ HELIPAD FARP'
              : `OBJ ${fobPadId} FORWARD HELIPAD FARP`;
            repairMult = isRunwayParkedPitStop ? 2.1 : 1.25;
          }
        } else {
          const hqBase =
            v.team === 'RU'
              ? this.world?.spawns?.RU_BASE || { x: 1520, z: 0 }
              : this.world?.spawns?.US_BASE || { x: -1520, z: 0 };
          if (Math.hypot(v.pos.x - hqBase.x, v.pos.z - hqBase.z) <= 145) {
            inSupplyZone = true;
            supplyLabel = 'HQ MOTOR POOL DEPOT';
            repairMult = 1.4;
          } else if (Array.isArray(this.world?.flags)) {
            for (let fi = 0; fi < this.world.flags.length; fi++) {
              const fl = this.world.flags[fi];
              const fobRearmRad = (fl?.radius || 34) + 10;
              if (fl && fl.owner === v.team && Math.hypot(v.pos.x - fl.pos.x, v.pos.z - fl.pos.z) <= fobRearmRad) {
                inSupplyZone = true;
                const hasEngStation = (fl.defenseStage || 0) >= 1;
                supplyLabel = hasEngStation
                  ? `OBJ ${fl.id} ENGINEER VEHICLE SUPPLY STATION`
                  : `OBJ ${fl.id} FORWARD BASE DEPOT`;
                repairMult = hasEngStation ? 1.65 : 1.15;
                break;
              }
            }
          }
          if (!inSupplyZone && Array.isArray(this.world?.ammoCrates)) {
            for (let ci = 0; ci < this.world.ammoCrates.length; ci++) {
              const crate = this.world.ammoCrates[ci];
              if (
                crate &&
                (!crate.team || crate.team === v.team) &&
                crate.pos &&
                Math.hypot(v.pos.x - crate.pos.x, v.pos.z - crate.pos.z) <= 16.0
              ) {
                inSupplyZone = true;
                supplyLabel = 'FIELD AMMO & VEHICLE LOGISTICS STASH [7]';
                repairMult = 0.85;
                break;
              }
            }
          }
        }
        v.inRearmZone = inSupplyZone;
        v.activeSupplyLabel = inSupplyZone ? supplyLabel : '';
        if (inSupplyZone) {
          const prevHp = v.hp;
          if (v.hp < v.maxHp) {
            v.hp = Math.min(v.maxHp, v.hp + 110 * repairMult * dt);
            v.hullIntegrityPct = Math.round((v.hp / Math.max(1, v.maxHp)) * 100);
          }

          // Progressive Modular Airframe Subsystem Repair & Part Replacement on HQ Runway!
          // - Parked / Taxiing on Runway (`isRunwayParkedPitStop`): Full Ground Crew replaces damaged Wings, Engines,
          //   Tail, Avionics/Radar & Cockpit Canopy at +26%/sec (~3.8s from 0% -> 100%)!
          // - Airborne Low-Pass (<45m): Light field patch at +7.5%/sec.
          let completedAirframeOverhaul = false;
          if (v.isAircraft && v.airframeParts) {
            const partKeys = ['avionics', 'cockpit', 'leftWing', 'rightWing', 'engines', 'tail'];
            let hadDamagedPart = false;
            let allRestoredNow = true;
            const partRate = isRunwayParkedPitStop ? 26.0 : 7.5;
            for (let pkIdx = 0; pkIdx < partKeys.length; pkIdx++) {
              const pk = partKeys[pkIdx];
              const curPct = v.airframeParts[pk] ?? 100;
              if (curPct < 99.9) {
                if (curPct < 88) v._hadSignificantPartDmg = true;
                hadDamagedPart = true;
                const nextPct = Math.min(100, curPct + partRate * dt);
                v.airframeParts[pk] = nextPct;
                if (nextPct < 99.9) allRestoredNow = false;
              }
            }
            if (isRunwayParkedPitStop) {
              v.sensorGlitchTimer = 0;
              v.opticsGlitchTimer = 0;
            }
            if (hadDamagedPart && allRestoredNow && v._hadSignificantPartDmg) {
              v._hadSignificantPartDmg = false;
              completedAirframeOverhaul = true;
            }
          } else if (!v.isAircraft) {
            if (v.armorZones) {
              const zStep = 18.0 * repairMult * dt;
              v.armorZones.front = Math.min(100, (v.armorZones.front ?? 100) + zStep);
              v.armorZones.left = Math.min(100, (v.armorZones.left ?? 100) + zStep);
              v.armorZones.right = Math.min(100, (v.armorZones.right ?? 100) + zStep);
              v.armorZones.rear = Math.min(100, (v.armorZones.rear ?? 100) + zStep);
            }
            if (v.subsystems && v.hullIntegrityPct >= 75) {
              v.subsystems.tracks = 'OK';
              v.subsystems.turret = 'OK';
              v.subsystems.engine = 'OK';
              v.subsystems.optics = 'OK';
            }
          }

          v._rearmTick = (v._rearmTick || 0) + dt * repairMult;
          if (v._rearmTick >= 1.1 || completedAirframeOverhaul) {
            if (v._rearmTick >= 1.1) v._rearmTick = 0;
            const didRearm = this.rearmVehicleOrdnance(v);
            if (
              (completedAirframeOverhaul || didRearm || (prevHp < v.maxHp * 0.95 && v.hp >= v.maxHp)) &&
              v.driver?.onAwardXp
            ) {
              const nowMs = performance.now();
              if (completedAirframeOverhaul || nowMs - (v._lastRearmBannerMs || 0) > 6500) {
                v._lastRearmBannerMs = nowMs;
                v.driver.onAwardXp(
                  20,
                  completedAirframeOverhaul
                    ? `🛠️✈️ ${supplyLabel}: ALL DAMAGED AIRFRAME PARTS REPLACED & 100% ORDNANCE REARMED!`
                    : `🛠️⛽ ${supplyLabel}: 100% ORDNANCE REARMED & HULL REPAIRED!`
                );
              }
            }
          }
        } else {
          v._rearmTick = 0;
        }
      }

      // ─── 6×6 TROOP TRANSPORT & MOBILE LOGISTICS TRUCK CONVOY + RESUPPLY AURA ─────────
      // 1) Opening-Round AI Squad Convoy: friendly infantry bots board NPC-driven or human-driven 6×6 Troop Trucks
      //    at HQ/rear (`> 75m` from uncaptured objectives) and automatically disembark on foot when arriving within
      //    `48m` of a neutral/contested/enemy Objective Flag!
      // 2) Mobile Logistics Resupply Aura (`<= 14m`): refills nearby friendly soldiers' loose ammo & field dressings!
      if (v.type === 'truck_transport' && !v.dead) {
        if (!Array.isArray(v.aiPassengers)) v.aiPassengers = [];
        for (let pi = v.aiPassengers.length - 1; pi >= 0; pi--) {
          const pax = v.aiPassengers[pi];
          if (!pax || pax.dead || pax.downed || pax.ridingVehicle !== v) {
            if (pax && pax.ridingVehicle === v) pax.ridingVehicle = null;
            v.aiPassengers.splice(pi, 1);
          } else {
            pax.pos.copy(v.pos);
            if (pax.mesh) pax.mesh.visible = false;
          }
        }

        if ((v.npcDriver || v.driver) && botManager && Array.isArray(botManager.bots)) {
          let nearAssaultFlag = null;
          if (Array.isArray(this.world?.flags)) {
            for (let fi = 0; fi < this.world.flags.length; fi++) {
              const fl = this.world.flags[fi];
              if (fl && (fl.owner !== v.team || fl.contested)) {
                const dFl = Math.hypot(v.pos.x - fl.pos.x, v.pos.z - fl.pos.z);
                if (dFl <= 52) {
                  nearAssaultFlag = fl;
                  break;
                }
              }
            }
          }

          // Auto-disembark AI infantry squad when the 6×6 Troop Truck reaches the objective zone (or takes heavy damage)!
          if (v.aiPassengers.length > 0 && (nearAssaultFlag || v.hp < v.maxHp * 0.45)) {
            const gDrop = this.world ? this.world.getGroundHeightAt(v.pos.x, v.pos.z) : v.pos.y;
            for (let pi = 0; pi < v.aiPassengers.length; pi++) {
              const pax = v.aiPassengers[pi];
              if (!pax) continue;
              pax.ridingVehicle = null;
              const sideSign = pi % 2 === 0 ? 1 : -1;
              const backDist = 3.8 + Math.floor(pi / 2) * 1.15;
              const dxDrop = Math.sin(v.yaw || 0) * backDist + Math.cos(v.yaw || 0) * sideSign * 2.1;
              const dzDrop = Math.cos(v.yaw || 0) * backDist - Math.sin(v.yaw || 0) * sideSign * 2.1;
              const safeDrop = this.world?.pushOutOfBuildingFootprint
                ? this.world.pushOutOfBuildingFootprint(v.pos.x + dxDrop, v.pos.z + dzDrop, 1.4)
                : { x: v.pos.x + dxDrop, z: v.pos.z + dzDrop };
              pax.pos.set(
                safeDrop.x,
                this.world ? this.world.getGroundHeightAt(safeDrop.x, safeDrop.z) : gDrop,
                safeDrop.z
              );
              if (pax.mesh) {
                pax.mesh._culledOffFrustum = false;
                pax.mesh.position.copy(pax.pos);
                pax.mesh.visible = true;
              }
            }
            v.aiPassengers.length = 0;
            v._convoyDropCooldown = 14.0;
          } else {
            v._convoyDropCooldown = Math.max(0, (v._convoyDropCooldown || 0) - dt);
            const maxTruckPax = 9;
            if (
              v._convoyDropCooldown <= 0 &&
              !nearAssaultFlag &&
              v.aiPassengers.length < maxTruckPax &&
              Math.abs(v.forwardSpeed || 0) < 16.0
            ) {
              v._truckBoardTimer = (v._truckBoardTimer || 0) - dt;
              if (v._truckBoardTimer <= 0) {
                v._truckBoardTimer = 0.55;
                for (let bi = 0; bi < botManager.bots.length && v.aiPassengers.length < maxTruckPax; bi++) {
                  const b = botManager.bots[bi];
                  if (
                    !b ||
                    b.dead ||
                    b.downed ||
                    b.drivingVehicle ||
                    b.ridingVehicle ||
                    b.team !== v.team ||
                    b.rescueTarget ||
                    b.role === 'PILOT' ||
                    b.squad === 'BRAVO' ||
                    b.squad === 'FALCON'
                  ) {
                    continue;
                  }
                  if (b.pos.distanceToSquared(v.pos) <= 28 * 28) {
                    b.ridingVehicle = v;
                    if (b.mesh) b.mesh.visible = false;
                    v.aiPassengers.push(b);
                  }
                }
              }
            }
          }
        }

        // Mobile Squad Logistics Resupply Aura (`<= 14m` around any friendly 6×6 Troop & Supply Truck)
        v._logiSupplyTimer = (v._logiSupplyTimer || 0) + dt;
        if (v._logiSupplyTimer >= 3.5) {
          v._logiSupplyTimer = 0;
          if (
            player &&
            !player.dead &&
            !player.downed &&
            player.team === v.team &&
            !player.activeVehicle &&
            player.pos.distanceToSquared(v.pos) <= 14 * 14
          ) {
            let resuppliedPlayer = false;
            const prim = player.slots?.[0];
            if (prim && prim.def && prim.def.clipSize > 1) {
              const maxLoose = prim.maxLooseAmmo || 120;
              if ((prim.looseAmmo || 0) < maxLoose) {
                prim.looseAmmo = Math.min(maxLoose, (prim.looseAmmo || 0) + 30);
                resuppliedPlayer = true;
              }
            }
            const maxBand = player.role === 'medic' ? 9 : 3;
            if ((player.bandages || 0) < maxBand) {
              player.bandages = Math.min(maxBand, (player.bandages || 0) + 1);
              resuppliedPlayer = true;
            }
            if (resuppliedPlayer && player.onAwardXp) {
              const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
              if (nowMs - (v._lastLogiToastMs || 0) > 10000) {
                v._lastLogiToastMs = nowMs;
                player.onAwardXp(10, '🚚📦 6×6 LOGISTICS TRUCK RESUPPLIED AMMO & FIELD DRESSINGS!');
              }
            }
          }
        }
      }

      // Multi-Crew AI Squadmate Passenger Boarding when Player drives a multi-seat ground vehicle
      if (
        !v.isAircraft &&
        !v.isEmplacement &&
        player &&
        v.driver === player &&
        botManager &&
        Array.isArray(botManager.bots)
      ) {
        if (!Array.isArray(v.aiPassengers)) v.aiPassengers = [];
        for (let pi = v.aiPassengers.length - 1; pi >= 0; pi--) {
          const pax = v.aiPassengers[pi];
          if (!pax || pax.dead || pax.downed || pax.ridingVehicle !== v) {
            if (pax && pax.ridingVehicle === v) pax.ridingVehicle = null;
            v.aiPassengers.splice(pi, 1);
          } else {
            pax.pos.copy(v.pos);
            if (pax.mesh) pax.mesh.visible = false;
          }
        }
        const maxAiPax = Math.max(0, (v.seatNames ? v.seatNames.length : 1) - 1);
        if (v.aiPassengers.length < maxAiPax && Math.abs(v.forwardSpeed || 0) < 11.0) {
          v._paxScanTimer = (v._paxScanTimer || 0) - dt;
          if (v._paxScanTimer <= 0) {
            v._paxScanTimer = 0.75;
            for (let bi = 0; bi < botManager.bots.length && v.aiPassengers.length < maxAiPax; bi++) {
              const b = botManager.bots[bi];
              if (
                !b ||
                b.dead ||
                b.downed ||
                b.drivingVehicle ||
                b.ridingVehicle ||
                b.team !== player.team ||
                b.squad !== player.squad ||
                b.rescueTarget
              ) {
                continue;
              }
              if (b.pos.distanceToSquared(v.pos) <= 10.5 * 10.5) {
                b.ridingVehicle = v;
                if (b.mesh) b.mesh.visible = false;
                v.aiPassengers.push(b);
              }
            }
          }
        }
      }

      // Dedicated 3D Flight & AI Dogfight / CAS Loop for Combat Aircraft
      if (v.isAircraft) {
        const prevX = v.pos.x;
        const prevY = v.pos.y;
        const prevZ = v.pos.z;
        const prevYaw = v.yaw || 0;
        if (Array.isArray(v.mesh?.userData?.cockpitCanopyParts)) {
          const hide1P = Boolean(
            player &&
              player.activeVehicle === v &&
              !player.dead &&
              (player.vehicleCameraMode === 'COCKPIT_1P' ||
                (!player.vehicleCameraMode && !player.thirdPersonVehicle))
          );
          const wantVis = !hide1P;
          for (let ci = 0; ci < v.mesh.userData.cockpitCanopyParts.length; ci++) {
            const part = v.mesh.userData.cockpitCanopyParts[ci];
            if (part && part.visible !== wantVis) {
              part.visible = wantVis;
            }
          }
        }
        this.updateAircraftAiAndPhysics(v, dt, player, botManager, onDeployMenu);
        // Track true 3D Doppler World Velocity + Curvilinear Turn-Rate / Acceleration (CTRA Kalman State)
        // so the Fire-Control Lead Computer accurately leads circling B-2s, orbiting AC-130s & banked turns!
        if (dt > 0.001) {
          const instVx = (v.pos.x - prevX) / dt;
          const instVy = (v.pos.y - prevY) / dt;
          const instVz = (v.pos.z - prevZ) / dt;
          const instSpdTotal = Math.hypot(instVx, instVy, instVz);
          let dYaw = (v.yaw || 0) - prevYaw;
          while (dYaw > Math.PI) dYaw -= Math.PI * 2;
          while (dYaw < -Math.PI) dYaw += Math.PI * 2;
          if (instSpdTotal < 420) {
            const instYawRate = THREE.MathUtils.clamp(dYaw / dt, -2.6, 2.6);
            v.trackedYawRate = THREE.MathUtils.lerp(
              v.trackedYawRate || 0,
              instYawRate,
              Math.min(1, dt * 9)
            );
            const curInstSpdH = Math.hypot(instVx, instVz);
            const instTangAccel = THREE.MathUtils.clamp(
              (curInstSpdH - (v._prevInstSpdH ?? curInstSpdH)) / dt,
              -24,
              24
            );
            const instVertAccel = THREE.MathUtils.clamp(
              (instVy - (v._prevInstVy ?? instVy)) / dt,
              -28,
              28
            );
            v._prevInstSpdH = curInstSpdH;
            v._prevInstVy = instVy;
            if (!v.trackedWorldVel) {
              v.trackedWorldVel = new THREE.Vector3(instVx, instVy, instVz);
              v.trackedTangentialAccel = 0;
              v.trackedVertAccel = 0;
            } else {
              const alpha = Math.min(1, dt * 14);
              v.trackedWorldVel.x += (instVx - v.trackedWorldVel.x) * alpha;
              v.trackedWorldVel.y += (instVy - v.trackedWorldVel.y) * alpha;
              v.trackedWorldVel.z += (instVz - v.trackedWorldVel.z) * alpha;
              const accAlpha = Math.min(1, dt * 6);
              v.trackedTangentialAccel = THREE.MathUtils.lerp(
                v.trackedTangentialAccel || 0,
                instTangAccel,
                accAlpha
              );
              v.trackedVertAccel = THREE.MathUtils.lerp(
                v.trackedVertAccel || 0,
                instVertAccel,
                accAlpha
              );
            }
          }
        }
        continue;
      }

      // Sync unoccupied FOB Motorpool Bikes/ATVs & FOB Emplacements to the FOB's current faction owner!
      if (!v.driver && !v.npcDriver && !v.isAircraft && this.world?.flags) {
        if (v.fobFlagId) {
          const fobFlag = this.world.flags.find((fl) => fl.id === v.fobFlagId);
          if (fobFlag) v.team = fobFlag.owner || 'NEUTRAL';
        } else if (v.isEmplacement || v.isWarehouseBike || v.type === 'bike' || v.type === 'atv') {
          for (let fi = 0; fi < this.world.flags.length; fi++) {
            const fl = this.world.flags[fi];
            const dxF = v.pos.x - fl.pos.x;
            const dzF = v.pos.z - fl.pos.z;
            if (dxF * dxF + dzF * dzF <= 58 * 58) {
              v.team = fl.owner || 'NEUTRAL';
              break;
            }
          }
        }
      }

      // Distance-based 3D Render Culling for unoccupied Motorcycle Warehouse bikes (>220m away)
      if (v.isWarehouseBike && !v.driver && !v.npcDriver && Math.abs(v.forwardSpeed || 0) < 0.05) {
        if (player) {
          const withinWarehouseRender = player.pos.distanceToSquared(v.pos) <= 220 * 220;
          if (v.mesh.visible !== withinWarehouseRender) {
            v.mesh.visible = withinWarehouseRender;
          }
          if (!withinWarehouseRender) {
            continue;
          }
        }
      } else if (!v.dead && !v.mesh.visible) {
        v.mesh.visible = true;
      }

      // Self-healing building footprint guard: ONLY eject if trapped inside a multi-block tall solid wall (>1 block high)
      if (
        (v.driver || v.npcDriver || Math.abs(v.forwardSpeed || 0) > 0.05) &&
        !v.isWarehouseBike &&
        this.world.isInsideBuildingOrContainer &&
        this.world.isInsideBuildingOrContainer(v.pos.x, v.pos.z, 0.25)
      ) {
        const gCenter = this.world.worldToGrid(
          v.pos.x,
          this.world.getGroundHeightAt(v.pos.x, v.pos.z) + 0.5,
          v.pos.z
        );
        const vUp1 = this.world.voxels.get(this.world.key(gCenter.gx, gCenter.gy + 1, gCenter.gz));
        const vUp2 = this.world.voxels.get(this.world.key(gCenter.gx, gCenter.gy + 2, gCenter.gz));
        if ((vUp1 && !vUp1.isProp) || (vUp2 && !vUp2.isProp)) {
          const ejected = this.world.pushOutOfBuildingFootprint(
            v.pos.x,
            v.pos.z,
            (v.hullHalfWidth || 1.95) + 0.85
          );
          v.pos.x = ejected.x;
          v.pos.z = ejected.z;
          v.pos.y = this.world.getGroundHeightAt(v.pos.x, v.pos.z);
          v.mesh.position.copy(v.pos);
        }
      }

      // Sync Hull Integrity Percentage & Progressive Engine Smoke / Fire Embers at Low Hull Integrity
      v.hullIntegrityPct = Math.max(
        0,
        Math.min(100, Math.round((v.hp / Math.max(1, v.maxHp)) * 100))
      );
      if (
        (v.type === 'tank' || v.type === 'apc' || v.type === 'aa') &&
        v.hullIntegrityPct < 65 &&
        this.world?.spawnDebris
      ) {
        v._hullDamageSmokeTimer = (v._hullDamageSmokeTimer || 0) - dt;
        const isCriticalHull = v.hullIntegrityPct < 35;
        if (v._hullDamageSmokeTimer <= 0) {
          v._hullDamageSmokeTimer = isCriticalHull ? 0.14 : 0.28;
          const deckX = v.pos.x + Math.sin(v.yaw) * 2.1 + (Math.random() - 0.5) * 0.6;
          const deckZ = v.pos.z + Math.cos(v.yaw) * 2.1 + (Math.random() - 0.5) * 0.6;
          const smokeCol = isCriticalHull
            ? Math.random() < 0.45
              ? COLOR_SMOKE_RED
              : COLOR_SMOKE_DARK
            : COLOR_SMOKE_GREY;
          this.world.spawnDebris(
            tmpVec3(deckX, v.pos.y + 1.45, deckZ),
            smokeCol,
            isCriticalHull ? 3 : 1
          );
        }
      }

      // Clear invalid NPC driver if that NPC died or was downed
      if (v.npcDriver && (v.npcDriver.dead || v.npcDriver.downed || v.driver || v.remoteDriverId)) {
        v.npcDriver.drivingVehicle = null;
        v.npcDriver = null;
      }
      const curThirdPerson = Boolean(v.driver?.thirdPersonVehicle);
      if (
        !v.occupancyFSM ||
        v._lastSyncDead !== v.dead ||
        v._lastSyncDriver !== v.driver ||
        v._lastSyncNpcDriver !== v.npcDriver ||
        v._lastSyncThirdPerson !== curThirdPerson
      ) {
        syncGroundVehicleFSM(v);
        v._lastSyncDead = v.dead;
        v._lastSyncDriver = v.driver;
        v._lastSyncNpcDriver = v.npcDriver;
        v._lastSyncThirdPerson = curThirdPerson;
      }

      // =====================================================================
      // TACTICAL GROUND RIDE / CHAUFFEUR DISPATCH (UNBOARDED PICKUP & RTB)
      // =====================================================================
      if (!v.driver && !v.remoteDriverId && v.rideTask && v.rideTask.active && !v.isAircraft) {
        this.stepAiGroundRide(v, dt, player);
      } else if (!v.driver && !v.remoteDriverId && v.npcDriver && v.patrolPoints && v.patrolPoints.length > 0) {
        let wp = v.patrolPoints[v.patrolIndex % v.patrolPoints.length];
        const drv = v.npcDriver;
        const vIdx = v.fleetIndex ?? Math.max(0, this.vehicles.indexOf(v));
        const vAngle = vIdx * 1.38 + (v.team === 'US' ? 0.35 : -0.35);
        const spacingMode =
          drv.spacingMode ||
          (botManager && botManager.teamSpacingMode && botManager.teamSpacingMode[v.team]) ||
          'FAN_OUT';
        const isStayClose = spacingMode === 'STAY_CLOSE';
        // Dynamic Vehicle Standoff: ~32m–42m in STAY_CLOSE [Num -] vs ~95m–105m (~100m) in FAN_OUT [Num +]!
        const standoffRadius = isStayClose
          ? v.type === 'tank'
            ? VEHICLE_STATS.STANDOFF_CLOSE_TANK
            : v.type === 'apc'
            ? VEHICLE_STATS.STANDOFF_CLOSE_APC
            : VEHICLE_STATS.STANDOFF_CLOSE_HUMVEE
          : v.type === 'tank'
          ? VEHICLE_STATS.STANDOFF_FAN_TANK
          : v.type === 'apc'
          ? VEHICLE_STATS.STANDOFF_FAN_APC
          : VEHICLE_STATS.STANDOFF_FAN_HUMVEE;

        if (drv.playerOrderTimer > 0) {
          if (drv.playerOrderMode === 'OBJECTIVE' && drv.playerOrderFlagIndex >= 0 && this.world.flags[drv.playerOrderFlagIndex]) {
            const flagPos = this.world.flags[drv.playerOrderFlagIndex].pos;
            const rawX = flagPos.x + Math.cos(vAngle) * (standoffRadius * 0.75);
            const rawZ = flagPos.z + Math.sin(vAngle) * (standoffRadius * 0.75);
            const pushed = this.world.pushOutOfBuildingFootprint
              ? this.world.pushOutOfBuildingFootprint(rawX, rawZ, 6.5)
              : { x: rawX, z: rawZ };
            wp = tmpVec3(pushed.x, flagPos.y, pushed.z);
          } else if (drv.playerOrderMode === 'FOLLOW' && player && !player.dead) {
            const rawX = player.pos.x + Math.cos(vAngle) * standoffRadius;
            const rawZ = player.pos.z + Math.sin(vAngle) * standoffRadius;
            const pushed = this.world.pushOutOfBuildingFootprint
              ? this.world.pushOutOfBuildingFootprint(rawX, rawZ, 6.5)
              : { x: rawX, z: rawZ };
            wp = tmpVec3(pushed.x, player.pos.y, pushed.z);
          } else if (drv.playerOrderMode === 'HOLD') {
            wp = v.pos;
          }
        }
        // Route across the nearest bridge if crossing the central river
        let targetX = wp.x;
        let targetZ = wp.z;
        if (Math.sign(v.pos.x) !== Math.sign(targetX) && Math.abs(v.pos.x) < 34) {
          targetX = Math.sign(targetX) * 4;
          targetZ = Math.abs(v.pos.z) < 200 ? 0 : v.pos.z > 0 ? 400 : -400;
        }
        const dx = targetX - v.pos.x;
        const dz = targetZ - v.pos.z;
        const distToWp = Math.hypot(dx, dz);

        // Check distance to Commander/Player so friendly armor & cars stay ~100m away in overwatch!
        const distToCommander =
          player && !player.dead && v.team === player.team
            ? Math.hypot(player.pos.x - v.pos.x, player.pos.z - v.pos.z)
            : 999;
        const inFollowOverwatchRange =
          drv.playerOrderTimer > 0 &&
          drv.playerOrderMode === 'FOLLOW' &&
          distToCommander <= standoffRadius + 6;
        const tooCloseToFriendlyPlayer =
          !player?.activeVehicle && distToCommander < 25;

        if (distToWp < 14.0 || inFollowOverwatchRange || tooCloseToFriendlyPlayer) {
          if (drv.playerOrderTimer > 0 || tooCloseToFriendlyPlayer) {
            const decelStep = (v.brakeRate || 2.8) * 1.45 * dt;
            if (Math.abs(v.forwardSpeed) <= decelStep) {
              v.forwardSpeed = 0;
            } else {
              v.forwardSpeed -= Math.sign(v.forwardSpeed) * decelStep;
            }
            v.engineSpool = Math.max(0, (v.engineSpool || 0) - dt * 1.5);
          } else {
            v.patrolIndex = (v.patrolIndex + 1) % v.patrolPoints.length;
          }
        } else {
          // Vehicle forward vector is (-sin(yaw), -cos(yaw)); steer smoothly around buildings & static walls!
          let desiredYaw = Math.atan2(-dx, -dz);
          if (this.world?.isVehicleBoxBlocked) {
            const lookDist = (v.hullHalfLength || 3.2) + 7.5;
            const testX = v.pos.x - Math.sin(desiredYaw) * lookDist;
            const testZ = v.pos.z - Math.cos(desiredYaw) * lookDist;
            if (this.world.isVehicleBoxBlocked(testX, testZ, desiredYaw, v.hullHalfWidth || 1.75, 2.2, 1.1)) {
              for (const steerOff of [0.58, -0.58, 1.08, -1.08, 1.55, -1.55]) {
                const altYaw = desiredYaw + steerOff;
                const ax = v.pos.x - Math.sin(altYaw) * lookDist;
                const az = v.pos.z - Math.cos(altYaw) * lookDist;
                if (!this.world.isVehicleBoxBlocked(ax, az, altYaw, v.hullHalfWidth || 1.75, 2.2, 0.9)) {
                  desiredYaw = altYaw;
                  break;
                }
              }
            }
          }
          let yawDiff = desiredYaw - v.yaw;
          while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
          while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
          const tracksDmg = v.subsystems?.tracks === 'DAMAGED';
          const engState = v.subsystems?.engine || 'OK';
          const aiMobMult =
            (tracksDmg ? 0.22 : 1.0) *
            (engState === 'CRITICAL' ? 0.35 : engState === 'SMOKING' ? 0.75 : 1.0);
          const aiSpdAbs = Math.abs(v.forwardSpeed || 0);
          const minTurnR =
            v.minTurnRadiusM ||
            (v.type === 'apc' ? 8.8 : v.type === 'humvee' ? 7.5 : v.type === 'tank' ? 5.5 : 3.5);
          const maxLatAcc =
            v.maxLatAccelMs2 ||
            (v.type === 'tank' ? 8.6 : v.type === 'apc' || v.type === 'aa' ? 9.5 : 10.8);
          const canPivot = Boolean(
            v.canNeutralPivot || v.type === 'tank' || v.type === 'aa' || v.type === 'warhorse'
          );
          const geomRate = canPivot
            ? Math.max(v.turnRate || 0.75, aiSpdAbs / minTurnR)
            : Math.max(0.28, aiSpdAbs / minTurnR);
          const gripRate = aiSpdAbs > 3.0 ? maxLatAcc / aiSpdAbs : geomRate;
          const physAiTurnRate = Math.min(geomRate, gripRate);
          const aiTurnStep = physAiTurnRate * (tracksDmg ? 0.42 : 0.92) * dt;
          v.yaw += THREE.MathUtils.clamp(yawDiff, -aiTurnStep, aiTurnStep);
          const rawTargetSpeed = Math.abs(yawDiff) < 0.65 ? v.speed * 0.72 : v.speed * 0.34;
          const targetSpeed = rawTargetSpeed * aiMobMult;
          // Progressive mass-inertia drivetrain acceleration for AI vehicles (never jumps to top speed)
          v.engineSpool = Math.min(1.0, (v.engineSpool || 0) + dt * (v.type === 'tank' ? 0.48 : 0.68));
          const spdRatio = Math.min(1.1, Math.abs(v.forwardSpeed || 0) / Math.max(1, v.speed || 15));
          const baseMs2 =
            v.type === 'tank'
              ? 3.2
              : v.type === 'apc' || v.type === 'aa'
              ? 4.4
              : v.type === 'warhorse'
              ? 3.1
              : 5.8;
          const stepAccel = baseMs2 * (0.38 + 0.62 * v.engineSpool) * Math.max(0.15, 1 - 0.65 * spdRatio * spdRatio);
          if ((v.forwardSpeed || 0) < targetSpeed) {
            v.forwardSpeed = Math.min(targetSpeed, (v.forwardSpeed || 0) + stepAccel * dt);
          } else {
            v.forwardSpeed = Math.max(targetSpeed, (v.forwardSpeed || 0) - (v.brakeRate || 2.6) * 1.3 * dt);
          }
        }

        // Keep NPC driver's world coordinates synced with the vehicle they are piloting
        v.npcDriver.pos.copy(v.pos);

        // Throttled 5 Hz AI Tank/IFV/AA Target Acquisition Scan using spatial grids & pre-bucketed fleet lists
        let bestTargetPos = null;
        let bestAirTarget = null;
        const isAaUnit = v.type === 'aa' || v.type === 'emplace_aa' || v.weaponType === 'aa_autocannon';
        const pitchLimits = this.getVehiclePitchLimits(v);
        const turretOriginY = v.pos.y + (v.type === 'tank' ? 2.25 : v.isEmplacement ? 1.45 : 2.5);
        const enemyTeam = v.team === 'US' ? 'RU' : 'US';

        const isWithinElevationLimits = (tx, ty, tz) => {
          const horiz = Math.max(0.5, Math.hypot(tx - v.pos.x, tz - v.pos.z));
          const elevRad = Math.atan2(ty - turretOriginY, horiz);
          return elevRad >= pitchLimits.min && elevRad <= pitchLimits.max;
        };

        v._aiTargetScanTimer = (v._aiTargetScanTimer || 0) - dt;
        let usedCachedAiTarget = false;
        if (v._aiTargetScanTimer > 0 && v._cachedAiTarget && v._cachedAiTarget.unit) {
          const ct = v._cachedAiTarget;
          const u = ct.unit;
          if (
            ct.kind === 'air' &&
            !u.dead &&
            !u.isShotDown &&
            (u.driver || u.aiPilotActive) &&
            !((u.aircraftRole === 'b2_spirit' || u.isStealthAircraft) && (u.flareActiveTimer || 0) > 0) &&
            isWithinElevationLimits(u.pos.x, u.pos.y, u.pos.z)
          ) {
            bestAirTarget = u;
            bestTargetPos = tmpVec3(u.pos.x, u.pos.y, u.pos.z);
            usedCachedAiTarget = true;
          } else if (
            ct.kind === 'groundVeh' &&
            !u.dead &&
            isWithinElevationLimits(u.pos.x, u.pos.y + 1.4, u.pos.z)
          ) {
            bestTargetPos = tmpVec3(u.pos.x, u.pos.y + 1.4, u.pos.z);
            usedCachedAiTarget = true;
          } else if (
            ct.kind === 'bot' &&
            !u.dead &&
            !u.downed &&
            !u.drivingVehicle &&
            isWithinElevationLimits(u.pos.x, u.pos.y + 1.1, u.pos.z)
          ) {
            bestTargetPos = tmpVec3(u.pos.x, u.pos.y + 1.1, u.pos.z);
            usedCachedAiTarget = true;
          } else if (
            ct.kind === 'player' &&
            !u.dead &&
            !u.downed &&
            isWithinElevationLimits(u.pos.x, u.pos.y + 1.2, u.pos.z)
          ) {
            bestTargetPos = tmpVec3(u.pos.x, u.pos.y + 1.2, u.pos.z);
            usedCachedAiTarget = true;
          } else {
            ct.unit = null;
          }
        }

        if (!usedCachedAiTarget && v._aiTargetScanTimer <= 0) {
          v._aiTargetScanTimer = 0.18 + Math.random() * 0.04;
          let selectedKind = null;
          let selectedUnit = null;
          let bestDistSq = isAaUnit
            ? VEHICLE_STATS.ENGAGE_RANGE_AIRCRAFT * VEHICLE_STATS.ENGAGE_RANGE_AIRCRAFT
            : VEHICLE_STATS.ENGAGE_RANGE_VEHICLE * VEHICLE_STATS.ENGAGE_RANGE_VEHICLE;

          if (isAaUnit) {
            const enemyPlanes = this.activeAircraftByTeam?.[enemyTeam] || this.vehicles;
            for (let ai = 0; ai < enemyPlanes.length; ai++) {
              const airV = enemyPlanes[ai];
              if (!airV.isAircraft || airV.dead || airV.team === v.team) continue;
              if (!airV.driver && !airV.aiPilotActive) continue;
              const airGroundY = this.world.getGroundHeightAt(airV.pos.x, airV.pos.z);
              const airAltAgl = Math.max(0, airV.pos.y - airGroundY);
              if (airAltAgl < 28.0 || (airV.airborneRadarTimer || 0) < 4.0 || airV.isLowAltRadarMasked) continue;
              const isStealthB2 = airV.aircraftRole === 'b2_spirit' || airV.isStealthAircraft;
              if (isStealthB2 && (airV.flareActiveTimer || 0) > 0) continue;
              const stealthMult = isStealthB2 ? airV.stealthFactor || 0.12 : 1.0;
              const maxAirDist = VEHICLE_STATS.ENGAGE_RANGE_AIRCRAFT * stealthMult;
              const dSq = v.pos.distanceToSquared(airV.pos);
              if (
                dSq < maxAirDist * maxAirDist &&
                dSq < bestDistSq &&
                isWithinElevationLimits(airV.pos.x, airV.pos.y, airV.pos.z)
              ) {
                bestDistSq = dSq;
                bestAirTarget = airV;
                selectedKind = 'air';
                selectedUnit = airV;
                bestTargetPos = tmpVec3(airV.pos.x, airV.pos.y, airV.pos.z);
              }
            }
          }

          if (!bestTargetPos) {
            bestDistSq = VEHICLE_STATS.ENGAGE_RANGE_VEHICLE * VEHICLE_STATS.ENGAGE_RANGE_VEHICLE;
            const groundTargets = this.activeGroundTargetsByTeam?.[v.team] || this.vehicles;
            for (let gi = 0; gi < groundTargets.length; gi++) {
              const otherV = groundTargets[gi];
              if (otherV.dead || otherV.team === v.team || otherV.isAircraft) continue;
              if (
                !otherV.driver &&
                !otherV.npcDriver &&
                (otherV.isWarehouseBike || otherV.type === 'bike' || otherV.type === 'atv')
              ) {
                continue;
              }
              const dSq = v.pos.distanceToSquared(otherV.pos);
              if (dSq < bestDistSq && isWithinElevationLimits(otherV.pos.x, otherV.pos.y + 1.4, otherV.pos.z)) {
                bestDistSq = dSq;
                selectedKind = 'groundVeh';
                selectedUnit = otherV;
                bestTargetPos = tmpVec3(otherV.pos.x, otherV.pos.y + 1.4, otherV.pos.z);
              }
            }
          }

          if (!bestTargetPos && botManager) {
            const infMaxR = VEHICLE_STATS.ENGAGE_RANGE_INFANTRY;
            const infMaxSq = infMaxR * infMaxR;
            const enemyGrid = botManager.teamGrid && botManager.teamGrid[enemyTeam];
            if (enemyGrid) {
              enemyGrid.forEachInRadius(v.pos.x, v.pos.z, infMaxR, (b, dSq2D) => {
                if (b.dead || b.downed || b.drivingVehicle || b.team === v.team) return;
                if (v.type === 'tank' && b.parachuting) return;
                const dy = b.pos.y - v.pos.y;
                const dSq = dSq2D + dy * dy;
                if (
                  dSq < infMaxSq &&
                  dSq < bestDistSq &&
                  isWithinElevationLimits(b.pos.x, b.pos.y + 1.1, b.pos.z)
                ) {
                  bestDistSq = dSq;
                  selectedKind = 'bot';
                  selectedUnit = b;
                }
              });
              if (selectedKind === 'bot' && selectedUnit) {
                bestTargetPos = tmpVec3(selectedUnit.pos.x, selectedUnit.pos.y + 1.1, selectedUnit.pos.z);
              }
            } else if (botManager.bots) {
              for (const b of botManager.bots) {
                if (b.dead || b.downed || b.drivingVehicle || b.team === v.team) continue;
                if (v.type === 'tank' && b.parachuting) continue;
                const dSq = v.pos.distanceToSquared(b.pos);
                if (
                  dSq < infMaxSq &&
                  dSq < bestDistSq &&
                  isWithinElevationLimits(b.pos.x, b.pos.y + 1.1, b.pos.z)
                ) {
                  bestDistSq = dSq;
                  selectedKind = 'bot';
                  selectedUnit = b;
                  bestTargetPos = tmpVec3(b.pos.x, b.pos.y + 1.1, b.pos.z);
                }
              }
            }
          }

          if (
            !bestTargetPos &&
            player &&
            !player.dead &&
            !player.downed &&
            player.team !== v.team &&
            !(v.type === 'tank' && player.parachuting)
          ) {
            const dSq = v.pos.distanceToSquared(player.pos);
            if (
              dSq < VEHICLE_STATS.ENGAGE_RANGE_INFANTRY * VEHICLE_STATS.ENGAGE_RANGE_INFANTRY &&
              isWithinElevationLimits(player.pos.x, player.pos.y + 1.2, player.pos.z)
            ) {
              selectedKind = 'player';
              selectedUnit = player;
              bestTargetPos = tmpVec3(player.pos.x, player.pos.y + 1.2, player.pos.z);
            }
          }

          if (!v._cachedAiTarget) {
            v._cachedAiTarget = { kind: selectedKind, unit: selectedUnit };
          } else {
            v._cachedAiTarget.kind = selectedKind;
            v._cachedAiTarget.unit = selectedUnit;
          }
        }

        if (bestTargetPos) {
          const tdx = bestTargetPos.x - v.pos.x;
          const tdz = bestTargetPos.z - v.pos.z;
          const horiz = Math.max(0.5, Math.hypot(tdx, tdz));
          const desiredTurretPitch = THREE.MathUtils.clamp(
            Math.atan2(bestTargetPos.y - turretOriginY, horiz),
            pitchLimits.min,
            pitchLimits.max
          );
          v.turretPitch = THREE.MathUtils.lerp(v.turretPitch || 0, desiredTurretPitch, dt * 4.0);
          const desiredTurretYaw = Math.atan2(-tdx, -tdz);
          let tDiff = desiredTurretYaw - v.turretYaw;
          while (tDiff > Math.PI) tDiff -= Math.PI * 2;
          while (tDiff < -Math.PI) tDiff += Math.PI * 2;
          const slewDegraded =
            v.subsystems?.turret === 'DAMAGED' || v.subsystems?.optics === 'DAMAGED';
          const aiSlewRate = slewDegraded ? 0.78 : 1.8;
          v.turretYaw += THREE.MathUtils.clamp(tDiff, -aiSlewRate * dt, aiSlewRate * dt);

          v.aiFireTimer -= dt;
          if (v.aiFireTimer <= 0 && Math.abs(tDiff) < 0.35) {
            v.aiFireTimer =
              v.weaponType === 'tank_cannon'
                ? 3.8 + Math.random() * 2.2
                : v.weaponType === 'aa_autocannon'
                ? 1.35 + Math.random() * 0.75
                : v.weaponType === 'autocannon'
                ? 1.6 + Math.random() * 1.2
                : 1.1 + Math.random() * 0.9;
            this.fireAiVehicleWeapon(v, bestTargetPos, player, bestAirTarget);
          }
        } else {
          v.turretYaw = THREE.MathUtils.lerp(v.turretYaw, v.yaw, dt * 2.0);
          v.turretPitch = THREE.MathUtils.lerp(v.turretPitch || 0, 0, dt * 3.0);
        }
      } else if (!v.driver) {
        // Unoccupied vehicle sits stationary at the Motor Pool (or wherever parked)
        v.forwardSpeed *= Math.pow(0.05, dt);

        // Autonomous Base Air-Defense Sentry for constructed ZU-23-2 & Permanent HQ Airbase C-RAM Phalanx / Patriot-S400 Batteries!
        if (v.type === 'emplace_aa' && (v.team === 'US' || v.team === 'RU')) {
          const isAirbaseCiws = Boolean(v.isAirbaseDefenseBattery);
          if (isAirbaseCiws && v.hp < v.maxHp) {
            v.hp = Math.min(v.maxHp, v.hp + 120 * dt);
          }
          const engageRadius = isAirbaseCiws ? 860 : VEHICLE_STATS.ENGAGE_RANGE_AIRCRAFT;
          let airTarget = null;
          let groundIntruderPos = null;
          let bestAirSq = engageRadius * engageRadius;
          const enemyTeam = v.team === 'US' ? 'RU' : 'US';
          const enemyPlanes = isAirbaseCiws
            ? this.vehicles
            : this.activeAircraftByTeam?.[enemyTeam] || this.vehicles;
          for (let ai = 0; ai < enemyPlanes.length; ai++) {
            const airV = enemyPlanes[ai];
            if (!airV.isAircraft || airV.dead || airV.team === v.team) continue;
            // Airbase C-RAM engages ANY enemy aircraft inside the airbase zone — even at 0m on the runway tarmac!
            const onEnemyTarmac =
              isAirbaseCiws &&
              (v.team === 'US' ? airV.pos.x <= -2350 : airV.pos.x >= 2350);
            if (!airV.driver && !airV.aiPilotActive && !onEnemyTarmac) continue;
            const isStealthB2 = airV.aircraftRole === 'b2_spirit' || airV.isStealthAircraft;
            if (!isAirbaseCiws && isStealthB2 && (airV.flareActiveTimer || 0) > 0) continue;
            const stealthMult = isAirbaseCiws
              ? isStealthB2
                ? 0.55
                : 1.0
              : isStealthB2
              ? airV.stealthFactor || 0.12
              : 1.0;
            const maxR = engageRadius * stealthMult;
            const dSq = v.pos.distanceToSquared(airV.pos);
            if (dSq < maxR * maxR && dSq < bestAirSq) {
              bestAirSq = dSq;
              airTarget = airV;
            }
          }
          // If an enemy pilot/soldier or ground vehicle tries to camp the runway on foot/wheels within 360m, C-RAM engages them too!
          if (!airTarget && isAirbaseCiws && player && !player.dead && !player.downed && player.team !== v.team) {
            const pSq = v.pos.distanceToSquared(player.pos);
            if (pSq < 360 * 360) {
              groundIntruderPos = tmpVec3(player.pos.x, player.pos.y + 1.1, player.pos.z);
            }
          }

          const engagePos = airTarget ? airTarget.pos : groundIntruderPos;
          if (engagePos) {
            if (
              isAirbaseCiws &&
              airTarget &&
              airTarget.driver === player &&
              player?.onAwardXp
            ) {
              const nowWarn = performance.now();
              if (nowWarn - (airTarget._lastCiwsWarnMs || 0) > 5500) {
                airTarget._lastCiwsWarnMs = nowWarn;
                player.onAwardXp(
                  0,
                  `🚨 RESTRICTED ENEMY AIRBASE AIRSPACE — ${
                    v.team === 'US' ? 'C-RAM PHALANX & PATRIOT PAC-3' : 'PANTSIR-S1M & S-400 SAM'
                  } ENGAGING! TURN BACK!`
                );
              }
            }
            const tdx = engagePos.x - v.pos.x;
            const tdz = engagePos.z - v.pos.z;
            const desiredYaw = Math.atan2(-tdx, -tdz);
            let tDiff = desiredYaw - v.turretYaw;
            while (tDiff > Math.PI) tDiff -= Math.PI * 2;
            while (tDiff < -Math.PI) tDiff += Math.PI * 2;
            v.turretYaw += THREE.MathUtils.clamp(
              tDiff,
              (isAirbaseCiws ? -9.5 : -2.5) * dt,
              (isAirbaseCiws ? 9.5 : 2.5) * dt
            );
            v.aiFireTimer = (v.aiFireTimer || 0) - dt;
            if (v.aiFireTimer <= 0 && Math.abs(tDiff) < (isAirbaseCiws ? 0.85 : 0.4)) {
              v.aiFireTimer = isAirbaseCiws ? 0.22 : 0.65 + Math.random() * 0.55;
              this.fireAiVehicleWeapon(v, engagePos, player, airTarget);
            }
          }
        }
      }

      // ─── CREW-SERVED MEDIEVAL SIEGE TREBUCHET SETUP & BOULDER BARRAGE LOOP ─────────
      if (v.type === 'trebuchet') {
        let crewNearCount = 0;
        if (Array.isArray(v.assignedCrewBots)) {
          let writeIdx = 0;
          for (let ci = 0; ci < v.assignedCrewBots.length; ci++) {
            const b = v.assignedCrewBots[ci];
            if (b && !b.dead && !b.downed && b.assignedTrebuchet === v) {
              v.assignedCrewBots[writeIdx++] = b;
              if (b.pos.distanceToSquared(v.pos) <= 13.5 * 13.5) {
                crewNearCount++;
              }
            }
          }
          v.assignedCrewBots.length = writeIdx;
        } else {
          v.assignedCrewBots = [];
        }

        if (v.driver) {
          v.setupState = 'READY_FIRING';
          v.setupProgress = 1.0;
        } else if (v.crewCalled || crewNearCount > 0) {
          if ((v.setupProgress || 0) < 1.0) {
            v.setupState = 'SETTING_UP';
            const rate = 0.35 + crewNearCount * 0.22;
            v.setupProgress = Math.min(1.0, (v.setupProgress || 0) + dt * rate);
            if (v.setupProgress >= 1.0) {
              v.setupState = 'READY_FIRING';
              v.aiFireTimer = 0.35;
              if (player && v.team === player.team && player.onAwardXp) {
                player.onAwardXp(
                  50,
                  `🏰 ${v.name} SET UP BY SIEGE CREW (${Math.max(1, v.assignedCrewBots.length)} MEN) — HURLING BOULDERS AT ENEMY!`
                );
              }
            }
          } else {
            v.setupState = 'READY_FIRING';
          }
        }

        // Spin rear capstan winch wheels while crew is winching the arm down
        const winchWheels = v.mesh?.userData?.winchWheels;
        if (
          Array.isArray(winchWheels) &&
          (v.setupState === 'SETTING_UP' || (v.setupState === 'READY_FIRING' && (v.armSwingTimer || 0) <= 0 && (v.aiFireTimer || 0) > 1.2))
        ) {
          for (const ww of winchWheels) {
            ww.rotation.x += dt * 2.8;
          }
        }

        // Update throwing arm (`barrelGroup.rotation.x`) & loaded boulder visibility
        const bMesh = v.mesh?.userData?.boulderMesh;
        const fMesh = v.mesh?.userData?.fireAuraMesh;
        if ((v.armSwingTimer || 0) > 0) {
          v.armSwingTimer = Math.max(0, v.armSwingTimer - dt);
          const p = 1.0 - v.armSwingTimer / 1.15;
          if (v.barrelGroup) {
            if (p < 0.32) {
              // Counterweight drops & throwing arm whips rapidly upward (-0.42 -> +0.85)
              const whip = Math.sin(((p / 0.32) * Math.PI) * 0.5);
              v.barrelGroup.rotation.x = THREE.MathUtils.lerp(-0.42, 0.85, whip);
            } else {
              // Arm settles and begins winching back down (+0.85 -> -0.42)
              const rewind = (p - 0.32) / 0.68;
              v.barrelGroup.rotation.x = THREE.MathUtils.lerp(0.85, -0.42, rewind);
            }
          }
          if (bMesh) bMesh.visible = false;
          if (fMesh) fMesh.visible = false;
        } else {
          const prog = THREE.MathUtils.clamp(v.setupProgress || 0, 0, 1);
          if (v.barrelGroup) {
            v.barrelGroup.rotation.x = THREE.MathUtils.lerp(0.52, -0.42, prog);
          }
          const showBoulder = prog >= 0.78;
          if (bMesh) bMesh.visible = showBoulder;
          if (fMesh) fMesh.visible = showBoulder;
        }

        // Autonomous Siege Crew Target Acquisition & Boulder Launching towards the Enemy!
        if (!v.driver && v.setupState === 'READY_FIRING' && !isDeployFlag) {
          v.aiFireTimer = (v.aiFireTimer || 0) - dt;
          v._trebScanCooldown = Math.max(0, (v._trebScanCooldown || 0) - dt);

          // Only run full spatial target scan when aiFireTimer <= 0.25 (or no cached target yet)
          if ((v.aiFireTimer <= 0.25 && v._trebScanCooldown <= 0) || !v._cachedBoulderTargetPos) {
            v._trebScanCooldown = 0.2;
            let bestTargetSrc = null;
            let bestDistSq = 520 * 520;
            const minDistSq = 35 * 35;
            const enemyTeam = v.team === 'US' ? 'RU' : 'US';
            const enemyGrid = botManager?.teamGrid?.[enemyTeam];

            if (enemyGrid) {
              enemyGrid.forEachRingOrder(v.pos.x, v.pos.z, 520, (eb, dSq2D) => {
                if (!eb || eb.dead || eb.downed || eb.team === v.team) return;
                const dy = eb.pos.y - v.pos.y;
                const dSq = dSq2D + dy * dy;
                if (dSq >= minDistSq && dSq <= bestDistSq) {
                  bestDistSq = dSq;
                  bestTargetSrc = eb.pos;
                }
              });
            } else if (botManager && Array.isArray(botManager.bots)) {
              for (const eb of botManager.bots) {
                if (!eb || eb.dead || eb.downed || eb.team === v.team) continue;
                const dSq = v.pos.distanceToSquared(eb.pos);
                if (dSq >= minDistSq && dSq <= bestDistSq) {
                  bestDistSq = dSq;
                  bestTargetSrc = eb.pos;
                }
              }
            }
            if (!bestTargetSrc && v.commandedTargetPos) {
              bestTargetSrc = v.commandedTargetPos;
            }
            if (!bestTargetSrc && this.world && Array.isArray(this.world.flags)) {
              let enemyFlag = null;
              for (let fi = 0; fi < this.world.flags.length; fi++) {
                if (this.world.flags[fi].owner !== v.team) {
                  enemyFlag = this.world.flags[fi];
                  break;
                }
              }
              if (!enemyFlag) enemyFlag = this.world.flags[2];
              if (enemyFlag) bestTargetSrc = enemyFlag.pos;
            }
            if (bestTargetSrc) {
              if (!v._cachedBoulderTargetPos) v._cachedBoulderTargetPos = new THREE.Vector3();
              v._cachedBoulderTargetPos.copy(bestTargetSrc);
            }
          }

          const boulderTarget = v._cachedBoulderTargetPos;
          if (boulderTarget) {
            const tdx = boulderTarget.x - v.pos.x;
            const tdz = boulderTarget.z - v.pos.z;
            const desiredYaw = Math.atan2(-tdx, -tdz);
            let tDiff = desiredYaw - v.turretYaw;
            while (tDiff > Math.PI) tDiff -= Math.PI * 2;
            while (tDiff < -Math.PI) tDiff += Math.PI * 2;
            v.turretYaw += THREE.MathUtils.clamp(tDiff, -1.6 * dt, 1.6 * dt);

            if (v.aiFireTimer <= 0 && Math.abs(tDiff) < 0.45) {
              this.fireTrebuchetBoulder(v, boulderTarget, player, botManager);
              v._cachedBoulderTargetPos = null;
            }
          }
        }
      }

      if (Math.abs(v.forwardSpeed) > 0.05) {
        const stepDx = -Math.sin(v.yaw) * v.forwardSpeed * dt;
        const stepDz = -Math.cos(v.yaw) * v.forwardSpeed * dt;
        const nextX = v.pos.x + stepDx;
        const nextZ = v.pos.z + stepDz;
        const moveSign = Math.sign(v.forwardSpeed) || 1;
        const fwdX = -Math.sin(v.yaw) * moveSign;
        const fwdZ = -Math.cos(v.yaw) * moveSign;
        const rightX = Math.cos(v.yaw);
        const rightZ = -Math.sin(v.yaw);
        const halfW = v.hullHalfWidth || (v.type === 'tank' ? 1.95 : 1.55);
        const halfL = v.hullHalfLength || (v.type === 'tank' ? 3.55 : 2.95);

        // =====================================================================
        // TANK & VEHICLE 1-BLOCK HIGH OBSTACLE CLIMB / RUN-OVER & WALL SLIDING
        // - Any 1-block high obstacle (v0 at ground level with NO solid wall voxel stacked
        //   above it at gy+1 or gy+2) NEVER blocks a tank or armored vehicle!
        // - Destructible 1-block obstacles (sandbags, props, fortifications) are crushed.
        // - Indestructible 1-block obstacles (or when building destruction is OFF) are
        //   physically climbed and run right over by raising v.climbOffsetY & pitching hull!
        // - Multi-block walls (>= 2 blocks high) deflect/slide the vehicle smoothly along
        //   the wall axis when grazed at an angle instead of stopping dead.
        // =====================================================================
        const evaluateHullCandidate = (candX, candZ, allowCrush = true) => {
          const candGroundY = this.world.getGroundHeightAt(candX, candZ);
          if (v.type === 'warhorse') {
            const horseCheckPts = [
              [candX, candZ],
              [candX + fwdX * 0.55, candZ + fwdZ * 0.55]
            ];
            let maxClimb = 0;
            for (const [hx, hz] of horseCheckPts) {
              const hGroundY = this.world.getGroundHeightAt(hx, hz);
              const g = this.world.worldToGrid(hx, hGroundY + 0.65, hz);
              const v0 = this.world.voxels.get(this.world.key(g.gx, g.gy, g.gz));
              const v1 = this.world.voxels.get(this.world.key(g.gx, g.gy + 1, g.gz));
              const v2 = this.world.voxels.get(this.world.key(g.gx, g.gy + 2, g.gz));
              if ((v1 && !v1.isProp) || (v2 && !v2.isProp)) {
                return { blocked: true, climbY: 0 };
              }
              if (v0 && !v0.isProp) {
                const topH = Math.max(0, (v0.maxY ?? hGroundY + 1.25) - hGroundY);
                if (topH <= 1.45) {
                  maxClimb = Math.max(maxClimb, topH);
                } else {
                  return { blocked: true, climbY: 0 };
                }
              }
            }
            return { blocked: false, climbY: maxClimb };
          }

          const bumperOffsets = [
            [0, 0],
            [halfL + 0.25, 0],
            [halfL + 0.18, halfW * 0.88],
            [halfL + 0.18, -halfW * 0.88],
            [0, halfW * 0.92],
            [0, -halfW * 0.92],
            [-halfL * 0.65, 0]
          ];

          let maxClimb = 0;
          const canClimbOneBlock =
            v.type === 'tank' ||
            v.type === 'apc' ||
            v.type === 'aa' ||
            v.type === 'humvee' ||
            v.type === 'atv' ||
            v.type === 'bike' ||
            v.type === 'trex_mount' ||
            v.type === 'raptor_mount';

          for (let i = 0; i < bumperOffsets.length; i++) {
            const [longOff, latOff] = bumperOffsets[i];
            const checkX = candX + fwdX * longOff + rightX * latOff;
            const checkZ = candZ + fwdZ * longOff + rightZ * latOff;
            if (this.world.isInsideStaticStructure && this.world.isInsideStaticStructure(checkX, checkZ, 0.35)) {
              return { blocked: true, climbY: 0 };
            }
            const ptGroundY = this.world.getGroundHeightAt(checkX, checkZ);
            const g = this.world.worldToGrid(checkX, ptGroundY + 0.65, checkZ);
            const v0 = this.world.voxels.get(this.world.key(g.gx, g.gy, g.gz));
            const v1 = this.world.voxels.get(this.world.key(g.gx, g.gy + 1, g.gz));
            const v2 = this.world.voxels.get(this.world.key(g.gx, g.gy + 2, g.gz));

            // Check if there is a 2nd or 3rd block stacked above ground level (multi-block wall >= 2.5m)
            const upper1Solid = Boolean(
              v1 && !v1.isProp && v1.type !== 'sandbag' && !(v.type === 'tank' && v1.isFortification)
            );
            const upper2Solid = Boolean(
              v2 && !v2.isProp && v2.type !== 'sandbag' && !(v.type === 'tank' && v2.isFortification)
            );

            if (upper1Solid || upper2Solid) {
              return { blocked: true, climbY: 0 };
            }

            // Crush any destructible upper fortification / sandbag blocks in front of a tank
            if (allowCrush) {
              if (v1 && (v1.type === 'sandbag' || v1.isProp || (v.type === 'tank' && v1.isFortification))) {
                this.world.destroyVoxel(g.gx, g.gy + 1, g.gz, true);
              }
              if (v2 && (v2.type === 'sandbag' || v2.isProp || (v.type === 'tank' && v2.isFortification))) {
                this.world.destroyVoxel(g.gx, g.gy + 2, g.gz, true);
              }
            }

            // 1-Block High Obstacle at ground level (v0 exists, with NO solid upper wall at gy+1 or gy+2)
            if (v0) {
              const canDestroyV0 =
                v0.type === 'sandbag' ||
                v0.isProp ||
                (v.type === 'tank' &&
                  (v0.isFortification || this.world.buildingDestructionEnabled === true));
              if (allowCrush && canDestroyV0) {
                const destroyed = this.world.destroyVoxel(g.gx, g.gy, g.gz, true);
                if (!destroyed && canClimbOneBlock) {
                  // Could not be destroyed (e.g. indestructible 1-block obstacle): Tank climbs right over it!
                  const blockH = Math.min(1.35, Math.max(0.4, (v0.maxY ?? ptGroundY + 1.25) - ptGroundY));
                  maxClimb = Math.max(maxClimb, blockH);
                }
              } else if (canClimbOneBlock) {
                // Indestructible 1-block high obstacle: Tank / APC / Vehicle runs right over it!
                const blockH = Math.min(1.35, Math.max(0.4, (v0.maxY ?? ptGroundY + 1.25) - ptGroundY));
                maxClimb = Math.max(maxClimb, blockH);
              } else {
                return { blocked: true, climbY: 0 };
              }
            }
          }
          return { blocked: false, climbY: maxClimb, groundY: candGroundY };
        };

        let stepRes = evaluateHullCandidate(nextX, nextZ, true);
        let finalX = nextX;
        let finalZ = nextZ;

        // Smooth wall-sliding deflection when grazing a multi-block wall at an oblique angle
        if (stepRes.blocked) {
          const slideX = evaluateHullCandidate(nextX, v.pos.z, false);
          const slideZ = evaluateHullCandidate(v.pos.x, nextZ, false);
          if (!slideX.blocked && Math.abs(stepDx) > 0.001) {
            finalX = nextX;
            finalZ = v.pos.z;
            stepRes = slideX;
            v.forwardSpeed *= 0.92;
          } else if (!slideZ.blocked && Math.abs(stepDz) > 0.001) {
            finalX = v.pos.x;
            finalZ = nextZ;
            stepRes = slideZ;
            v.forwardSpeed *= 0.92;
          }
        }

        if (!stepRes.blocked) {
          v.pos.x = Math.max(-2800, Math.min(2800, finalX));
          v.pos.z = Math.max(-1800, Math.min(1800, finalZ));
          const baseGroundY = this.world.getGroundHeightAt(v.pos.x, v.pos.z);
          const targetClimbY = stepRes.climbY || 0;
          const climbLerpRate = targetClimbY > (v.climbOffsetY || 0) ? 10.5 : 7.5;
          v.climbOffsetY = THREE.MathUtils.lerp(
            v.climbOffsetY || 0,
            targetClimbY,
            Math.min(1, dt * climbLerpRate)
          );
          if (v.climbOffsetY < 0.01) v.climbOffsetY = 0;
          v.pos.y = baseGroundY + v.climbOffsetY;
        } else {
          v.forwardSpeed = 0;
          if (!v.driver && v.npcDriver && v.patrolPoints) {
            v.patrolIndex = (v.patrolIndex + 1) % v.patrolPoints.length;
          }
        }

        if (v.type === 'warhorse' || v.type === 'trex_mount' || v.type === 'raptor_mount') {
          v._legPhase = (v._legPhase || 0) + v.forwardSpeed * dt * 1.45;
          const swingAmp = Math.min(0.68, Math.abs(v.forwardSpeed) * 0.065);
          for (let wi = 0; wi < v.wheels.length; wi++) {
            const phaseOffset = wi % 2 === 0 ? 0 : Math.PI;
            v.wheels[wi].rotation.x = Math.sin(v._legPhase + phaseOffset) * swingAmp;
          }
          if (v.mesh?.userData?.riderGroup) {
            v.mesh.userData.riderGroup.visible =
              v.driver === player ? Boolean(player.thirdPersonVehicle) : Boolean(v.driver || v.npcDriver);
          }
        } else {
          for (const w of v.wheels) {
            w.rotation.x -= v.forwardSpeed * dt * (v.type === 'bike' || v.type === 'atv' ? 2.6 : 1.4);
          }
        }

        // Authentic 2-Stroke Blue-Grey Expansion Chamber Exhaust Smoke Puffs (125cc YZ125, 250cc KTM SX, 500cc CR500R)
        if (v.isTwoStroke && Math.abs(v.forwardSpeed) > 2.2 && this.world?.spawnDebris) {
          v._twoStrokeSmokeTimer = (v._twoStrokeSmokeTimer || 0) - dt;
          if (v._twoStrokeSmokeTimer <= 0) {
            v._twoStrokeSmokeTimer = 0.09;
            const exhaustX = v.pos.x + Math.sin(v.yaw) * 0.85;
            const exhaustZ = v.pos.z + Math.cos(v.yaw) * 0.85;
            this.world.spawnDebris(
              tmpVec3(exhaustX, v.pos.y + 0.78, exhaustZ),
              COLOR_2STROKE_SMOKE,
              1
            );
          }
        }

        // Vehicular Roadkill & Cavalry Warhorse Trample Physics (Tanks, 8x8 APCs, Tactical Cars, Warhorses, Dino Mounts, Motorcycles & ATVs)
        const minRoadkillSpeed =
          v.type === 'tank'
            ? 2.6
            : v.type === 'warhorse' || v.type === 'trex_mount' || v.type === 'raptor_mount'
            ? 3.0
            : v.type === 'apc'
            ? 3.6
            : 4.0;
        if (Math.abs(v.forwardSpeed) >= minRoadkillSpeed && (botManager || player)) {
          this.checkVehicleRoadkills(v, player, botManager);
        }
      }

      if (v.type === 'bike' || v.type === 'atv') {
        if (!v.driver) {
          v.pitch = THREE.MathUtils.lerp(v.pitch || 0, 0, dt * 6.0);
          v.roll = THREE.MathUtils.lerp(v.roll || 0, 0, dt * 6.0);
        }
        v.mesh.rotation.set(v.pitch || 0, v.yaw || 0, v.roll || 0, 'YXZ');

        // Show 3D Articulated Rider Model in 3rd-Person Chase View (or when driven by an AI bot)
        const riderGroup = v.mesh?.userData?.riderGroup;
        if (riderGroup) {
          const showRider = Boolean(
            (v.driver && (v.driver !== player || player.thirdPersonVehicle !== false)) ||
              v.npcDriver
          );
          riderGroup.visible = showRider;
          if (showRider) {
            const rollVal = v.roll || 0;
            riderGroup.rotation.z = rollVal * 0.28;
            riderGroup.position.x = -rollVal * (v.type === 'atv' ? 0.08 : 0.15);
            if (riderGroup.userData?.headPivot) {
              riderGroup.userData.headPivot.rotation.y = rollVal * 0.48;
            }
          }
        }
      } else if (!v.isEmplacement && v.type !== 'trebuchet') {
        // 3D Terrain & 1-Block Obstacle Pitch / Roll Alignment for Moving Tanks, APCs, AA & Tactical Cars
        if (Math.abs(v.forwardSpeed || 0) > 0.05 || (v.climbOffsetY || 0) > 0.01) {
          const fwdX = -Math.sin(v.yaw || 0);
          const fwdZ = -Math.cos(v.yaw || 0);
          const rightX = Math.cos(v.yaw || 0);
          const rightZ = -Math.sin(v.yaw || 0);
          const sampleSupportY = (sx, sz) => {
            const gy = this.world.getGroundHeightAt(sx, sz);
            const g = this.world.worldToGrid(sx, gy + 0.65, sz);
            const v0 = this.world.voxels.get(this.world.key(g.gx, g.gy, g.gz));
            const v1 = this.world.voxels.get(this.world.key(g.gx, g.gy + 1, g.gz));
            if (v0 && !v1 && !v0.isProp) {
              return Math.min(gy + 1.35, v0.maxY ?? gy + 1.25);
            }
            return gy;
          };
          const pSpanL = Math.max(1.2, (v.hullHalfLength || 2.8) * 0.75);
          const pSpanW = Math.max(0.8, (v.hullHalfWidth || 1.6) * 0.75);
          const frontY = sampleSupportY(v.pos.x + fwdX * pSpanL, v.pos.z + fwdZ * pSpanL);
          const rearY = sampleSupportY(v.pos.x - fwdX * pSpanL, v.pos.z - fwdZ * pSpanL);
          const rightY = sampleSupportY(v.pos.x + rightX * pSpanW, v.pos.z + rightZ * pSpanW);
          const leftY = sampleSupportY(v.pos.x - rightX * pSpanW, v.pos.z - rightZ * pSpanW);
          const targetPitch = THREE.MathUtils.clamp(
            Math.atan2(frontY - rearY, pSpanL * 2),
            -0.34,
            0.34
          );
          const targetRoll = THREE.MathUtils.clamp(
            Math.atan2(leftY - rightY, pSpanW * 2),
            -0.28,
            0.28
          );
          v.pitch = THREE.MathUtils.lerp(v.pitch || 0, targetPitch, Math.min(1, dt * 8.5));
          v.roll = THREE.MathUtils.lerp(v.roll || 0, targetRoll, Math.min(1, dt * 8.5));
        }
        v.mesh.position.copy(v.pos);
        v.mesh.rotation.set(v.pitch || 0, v.yaw || 0, v.roll || 0, 'YXZ');
      } else {
        v.mesh.position.copy(v.pos);
        v.mesh.rotation.y = v.yaw;
      }
      v.turretPivot.rotation.y = v.turretYaw - v.yaw + Math.PI;
      if (v.barrelGroup && !v.isAircraft && v.type !== 'emplace_mortar' && v.type !== 'trebuchet') {
        const pLim = this.getVehiclePitchLimits(v);
        const clampedP = THREE.MathUtils.clamp(v.turretPitch || 0, pLim.min, pLim.max);
        v.barrelGroup.rotation.x = -clampedP;
      }
    }

    // Fast O(36) 3D Frustum & Fog-Horizon Visibility Culling across all multi-part vehicles & parked HQ aircraft!
    if (hasVehFrustum || player) {
      for (let vi = 0; vi < this.vehicles.length; vi++) {
        const v = this.vehicles[vi];
        if (!v || !v.mesh || v.dead || v.b2LockedUntilKills) continue;
        if (v === player?.activeVehicle || v.driver === player) {
          if (!v.mesh.visible) v.mesh.visible = true;
          continue;
        }
        const dxC = v.pos.x - camPosX;
        const dyC = v.pos.y - camPosY;
        const dzC = v.pos.z - camPosZ;
        const dSq = dxC * dxC + dyC * dyC + dzC * dzC;
        const isAirborneActive = Boolean(
          v.isAircraft && (v.driver || v.aiPilotActive || v.pos.y > 14.0)
        );
        const isParkedSmallMoto = Boolean(
          !v.driver &&
            !v.npcDriver &&
            (v.isWarehouseBike || v.type === 'bike' || v.type === 'atv')
        );
        const parkMotoDist = Math.min(1200, (playerInAir ? 360 : 165) * opticZoomScale);
        const maxSq = isAirborneActive
          ? maxAirborneVisDistSq
          : isParkedSmallMoto
          ? parkMotoDist * parkMotoDist
          : maxGroundVehVisDistSq;
        let showVeh = dSq <= maxSq;
        if (showVeh && hasVehFrustum && dSq > 52 * 52) {
          this._vehCullSphere.center.set(v.pos.x, v.pos.y + 2.2, v.pos.z);
          this._vehCullSphere.radius = v.isAircraft ? 24.0 : 12.5;
          showVeh = this._vehFrustum.intersectsSphere(this._vehCullSphere);
        }
        if (v.mesh.visible !== showVeh) {
          v.mesh.visible = showVeh;
        }
      }
    }

    // Update 3D spatial aircraft flyby engine audio & continuous ground/motorcycle engine audio
    if (player && (!player.activeVehicle || !player.activeVehicle.isAircraft)) {
      sound.updateAircraftEngineAudio?.(
        null,
        this.vehicles,
        player.pos,
        player.yaw || 0,
        false
      );
    }
    if (isDeployFlag || !player || player.dead) {
      sound.updateGroundVehicleEngineAudio?.(null, null, null, 0);
    } else {
      sound.updateGroundVehicleEngineAudio?.(
        player.activeVehicle && !player.activeVehicle.isAircraft ? player.activeVehicle : null,
        this.vehicles,
        player.pos,
        player.yaw || 0
      );
    }
  }

  /**
   * Checks if a moving Tank (`M1A2 Abrams` / `T-90M`), 8x8 APC (`LAV-25` / `BTR-82A`),
   * Tactical Car (`M1151 Humvee` / `GAZ Tigr`), Motorcycle/ATV, or Cavalry Warhorse (`warhorse`)
   * runs over / tramples enemy soldiers in its oriented footprint.
   */
  checkVehicleRoadkills(v, player, botManager) {
    if (v.dead) return;
    const nowMs = performance.now();
    const fwdX = -Math.sin(v.yaw);
    const fwdZ = -Math.cos(v.yaw);
    const rightX = Math.cos(v.yaw);
    const rightZ = -Math.sin(v.yaw);
    const moveSign = Math.sign(v.forwardSpeed) || 1;
    const absSpd = Math.abs(v.forwardSpeed || 0);
    const isHorse = v.type === 'warhorse';
    const isDino = v.type === 'trex_mount' || v.type === 'raptor_mount';
    // Warhorse Cavalry Trample Hitbox covers the full barded war-steed chest, shoulders & front hooves (1.05m half-width x 1.65m half-length)
    const halfW = isHorse
      ? 1.05
      : isDino
      ? 1.35
      : (v.hullHalfWidth || 1.65) + 0.42;
    const halfL = isHorse
      ? 1.65
      : isDino
      ? 2.15
      : (v.hullHalfLength || 3.1) + 0.52;

    const attackerName =
      v.driver === player && player
        ? player.name
        : v.npcDriver
        ? `${v.npcDriver.name} [${v.type.toUpperCase()}]`
        : v.name;
    const attackerTeam = v.team;
    const roadkillWeapon = isHorse
      ? 'CAVALRY WARHORSE TRAMPLE'
      : isDino
      ? 'THEROPOD STAMPEDE TRAMPLE'
      : v.type === 'tank'
      ? 'ROADKILL (TANK TRACKS)'
      : v.type === 'apc'
      ? 'ROADKILL (8x8 ARMOR)'
      : v.type === 'bike' || v.type === 'atv'
      ? 'ROADKILL (MOTO/ATV)'
      : 'ROADKILL (HUMVEE/TIGR)';
    // Mount & Blade Cavalry Charge Trample Damage scales with Warhorse gait speed:
    // - Trot/Canter (3.0..7.2 m/s): 75..125 DMG + Heavy Hoof Knockback
    // - Full Gallop Charge (>= 7.2 m/s / 26+ km/h): 165 DMG lethal warhorse trample crush!
    const trampleDamage = isHorse
      ? Math.round(THREE.MathUtils.clamp(55 + absSpd * 14.5, 75, 175))
      : 160;
    const onKillCb =
      (player && (player.onKillEvent || player.onKill)) || this.onKill || null;

    // 1. Check enemy NPCs in the vehicle's path via SpatialGrid2D (or friendly NPCs if human driver has Friendly Fire ON)
    if (botManager && botManager.bots) {
      const allowFriendlyRoadkill = Boolean(
        v.driver === player && player && player.friendlyFireEnabled
      );
      const testBotRoadkill = (bot) => {
        if (bot.dead || bot.drivingVehicle || (bot.team === v.team && !allowFriendlyRoadkill)) {
          return;
        }
        if (bot._lastTrampleHitMs && nowMs - bot._lastTrampleHitMs < 480) {
          return;
        }
        const dy = Math.abs(bot.pos.y - v.pos.y);
        if (dy > 2.6) return;

        const dx = bot.pos.x - v.pos.x;
        const dz = bot.pos.z - v.pos.z;
        const longitudinal = dx * fwdX + dz * fwdZ;
        const lateral = dx * rightX + dz * rightZ;

        if (Math.abs(lateral) <= halfW && Math.abs(longitudinal) <= halfL) {
          // Ensure soldier is in front of or underneath the moving hull / hooves
          if (longitudinal * moveSign < -halfL * 0.65) return;
          bot._lastTrampleHitMs = nowMs;

          // Knock body forward & aside from bumper/tracks/hooves
          const pushSide = lateral >= 0 ? 1 : -1;
          const knockX = bot.pos.x + fwdX * moveSign * (isHorse ? 2.2 : 1.9) + rightX * pushSide * 1.45;
          const knockZ = bot.pos.z + fwdZ * moveSign * (isHorse ? 2.2 : 1.9) + rightZ * pushSide * 1.45;
          if (!botManager.isPointBlocked(knockX, bot.pos.y, knockZ)) {
            bot.pos.x = knockX;
            bot.pos.z = knockZ;
            bot.pos.y = this.world.getGroundHeightAt(bot.pos.x, bot.pos.z);
          }
          if (typeof bot.velX === 'number') {
            bot.velX = fwdX * moveSign * 7.5 + rightX * pushSide * 4.5;
            bot.velZ = fwdZ * moveSign * 7.5 + rightZ * pushSide * 4.5;
          }

          if (bot.downed) {
            // Running over / trampling an already downed enemy finishes them immediately under tracks/hooves
            bot.bleedOutTimer = Math.min(bot.bleedOutTimer || 0.1, 0.05);
            return;
          }

          this.world.spawnDebris(
            tmpVec3(bot.pos.x, bot.pos.y + 0.9, bot.pos.z),
            COLOR_BLOOD,
            5
          );
          if (isHorse) {
            const distToListener = player ? player.pos.distanceTo(v.pos) : 0;
            sound.playShieldBlock?.(distToListener, 0);
          }

          const isFriendlyVictim = bot.team === v.team;
          const prevDead = bot.dead || bot.downed;
          botManager.damageBot(
            bot,
            trampleDamage,
            attackerName,
            attackerTeam,
            roadkillWeapon,
            false,
            onKillCb,
            v.driver === player && player ? player.onAwardXp : null
          );
          const didEliminate = !prevDead && (bot.dead || bot.downed);

          if (v.driver === player && player) {
            player.addShake(isHorse ? 0.18 : 0.26);
            events.emit('hitmarker:show', {
              type: didEliminate ? 'kill' : 'hit',
              label: isFriendlyVictim
                ? '⚠️ TEAMKILL! (-$0.10 / -10¢)'
                : isHorse
                ? didEliminate
                  ? `🐎 CAVALRY TRAMPLE! (${trampleDamage} DMG)`
                  : `🐎 HOOF TRAMPLE! (+${trampleDamage} DMG)`
                : 'ROADKILL!'
            });
            if (player.onHitMarker && !player.onHitMarker._isEventsBridge) {
              player.onHitMarker(didEliminate ? 'kill' : 'hit');
            }
            if (!isFriendlyVictim && didEliminate) {
              player.kills = (player.kills || 0) + 1;
              player.score = (player.score || 0) + 150;
              const rkReason = isHorse
                ? `🐎 CAVALRY WARHORSE TRAMPLE! (${bot.name})`
                : `🛞 ROADKILL! (${bot.name})`;
              events.emit('xp:awarded', { amount: 150, reason: rkReason });
              if (player.onAwardXp && !player.onAwardXp._isEventsBridge) {
                player.onAwardXp(150, rkReason);
              }
            }
          } else if (v.npcDriver && !isFriendlyVictim && didEliminate) {
            v.npcDriver.kills = (v.npcDriver.kills || 0) + 1;
            v.npcDriver.score = (v.npcDriver.score || 0) + 150;
          }

          const roadkillPayload = {
            vehicleId: v.id,
            vehicleType: v.type,
            driver: attackerName,
            team: v.team,
            victim: bot.name,
            speedMs: Number(Math.abs(v.forwardSpeed).toFixed(1)),
            speedKmh: Math.round(Math.abs(v.forwardSpeed) * 3.6)
          };
          events.emit('telemetry:event', {
            type: 'VEHICLE_ROADKILL',
            payload: roadkillPayload
          });
          if (botManager.onTelemetryEvent && !botManager.onTelemetryEvent._isEventsBridge) {
            botManager.onTelemetryEvent('VEHICLE_ROADKILL', roadkillPayload);
          }
        }
      };

      const queryR = Math.hypot(halfW, halfL) + 0.5;
      if (botManager.spatialGrid && botManager.spatialGrid.count > 0) {
        if (!allowFriendlyRoadkill && botManager.teamGrid) {
          const enemyGrid = botManager.teamGrid[v.team === 'US' ? 'RU' : 'US'];
          if (enemyGrid) enemyGrid.forEachInRadius(v.pos.x, v.pos.z, queryR, testBotRoadkill);
        } else {
          botManager.spatialGrid.forEachInRadius(v.pos.x, v.pos.z, queryR, testBotRoadkill);
        }
      } else {
        for (const bot of botManager.bots) {
          testBotRoadkill(bot);
        }
      }
    }

    // 2. Check opposing human player on foot
    if (
      player &&
      !player.dead &&
      !player.downed &&
      !player.activeVehicle &&
      player.team !== v.team
    ) {
      const dy = Math.abs(player.pos.y - v.pos.y);
      const dx = player.pos.x - v.pos.x;
      const dz = player.pos.z - v.pos.z;
      const longitudinal = dx * fwdX + dz * fwdZ;
      const lateral = dx * rightX + dz * rightZ;
      if (dy <= 2.6 && Math.abs(lateral) <= halfW && Math.abs(longitudinal) <= halfL) {
        if (longitudinal * moveSign >= -halfL * 0.65) {
          const pushSide = lateral >= 0 ? 1 : -1;
          player.pos.x += fwdX * moveSign * 2.2 + rightX * pushSide * 1.6;
          player.pos.z += fwdZ * moveSign * 2.2 + rightZ * pushSide * 1.6;
          player.pos.y = this.world.getGroundHeightAt(player.pos.x, player.pos.z);
          player.takeDamage(150, attackerName, attackerTeam, roadkillWeapon, onKillCb, v.pos);
        }
      }
    }
  }

  /**
   * Animates 3D aircraft control surfaces (ailerons, elevator, rudders) and spawns wingtip vortex
   * contrail puffs during high-G banked turns.
   */
  updateAircraftControlSurfacesAndVortices(v, dt, rollInput = 0, pitchInput = 0, yawRateInput = 0) {
    const cs = v.controlSurfaces || v.mesh?.userData?.controlSurfaces;
    if (cs) {
      const aileronDeflect = THREE.MathUtils.clamp(rollInput * 0.55, -0.45, 0.45);
      if (cs.leftAileron) cs.leftAileron.rotation.x = aileronDeflect;
      if (cs.rightAileron) cs.rightAileron.rotation.x = -aileronDeflect;
      if (cs.elevator) {
        cs.elevator.rotation.x = THREE.MathUtils.clamp(-pitchInput * 0.65, -0.48, 0.48);
      }
      if (Array.isArray(cs.rudders)) {
        const rudderDeflect = THREE.MathUtils.clamp(-yawRateInput * 0.5, -0.42, 0.42);
        for (const r of cs.rudders) {
          r.rotation.y = rudderDeflect;
        }
      }
    }

    // Spawn subtle white wingtip vapor vortex puffs when banking hard (> 26 deg) in flight
    const bankMag = Math.abs(v.roll || 0);
    if ((v.driver || v.aiPilotActive) && bankMag > 0.45 && (v.forwardSpeed || 0) > 38 && this.world?.spawnDebris) {
      v.vortexTimer = (v.vortexTimer || 0) - dt;
      if (v.vortexTimer <= 0) {
        v.vortexTimer = 0.065;
        const span = cs?.wingSpan || 5.5;
        const q = v.mesh.quaternion;
        for (const side of [-1, 1]) {
          _wingtipOffsetScratch.set(side * span, 1.35, 0.85).applyQuaternion(q);
          this.world.spawnDebris(
            tmpVec3(
              v.pos.x + _wingtipOffsetScratch.x,
              v.pos.y + _wingtipOffsetScratch.y,
              v.pos.z + _wingtipOffsetScratch.z
            ),
            COLOR_VORTEX_WHITE,
            1
          );
        }
      }
    }
  }

  /**
   * 3D Flight & AI Dogfight / CAS Loop for Combat Aircraft:
   * - Human-piloted aircraft are steered by `VehicleControl.js` and synced here.
   * - Enemy aircraft launch into 3D air combat patrols over the valley with a smooth runway takeoff roll & climb.
   * - ALL Friendly aircraft (A-10C CAS, F-15EX/F-22A Strike Fighter, AC-130J Gunship) remain parked on the
   *   friendly Airfield Runway for walk-up [E] takeoff (or instant [9] Mid-Air Sortie Call-In) so they never
   *   disappear while a player is running toward them!
   */
  updateAircraftAiAndPhysics(v, dt, player, botManager, onDeployMenu = false) {
    if (v.isHelicopter && v.mesh?.userData) {
      const isLiveHeli = Boolean(
        v.driver || v.remoteDriverId || v.aiPilotActive || Math.abs(v.forwardSpeed || 0) > 0.5
      );
      v._rotorSpinSpeed = THREE.MathUtils.lerp(
        v._rotorSpinSpeed || 0,
        isLiveHeli ? 28.0 : 3.2,
        Math.min(1, dt * (isLiveHeli ? 3.5 : 1.2))
      );
      const dRot = v._rotorSpinSpeed * dt;
      if (v.mesh.userData.mainRotorHub) {
        v.mesh.userData.mainRotorHub.rotation.y += dRot;
      }
      if (v.mesh.userData.coaxUpperRotorHub) {
        v.mesh.userData.coaxUpperRotorHub.rotation.y -= dRot;
      }
      if (v.mesh.userData.tailRotorHub) {
        v.mesh.userData.tailRotorHub.rotation.x += dRot * 1.85;
      }
    }
    if (v.aircraftRole === 'gunship' && v.wheels && (v.driver || v.remoteDriverId || v.aiPilotActive)) {
      for (const prop of v.wheels) {
        prop.rotation.z += dt * 22;
      }
    }
    if (
      v.aircraftRole === 'wright_flyer' &&
      v.mesh?.userData?.wrightProps &&
      (v.driver || v.remoteDriverId || v.aiPilotActive)
    ) {
      for (const prop of v.mesh.userData.wrightProps) {
        prop.rotation.z += dt * 20 * (prop.userData.spinDir || 1);
      }
    }

    // Automatic AN/AAQ-24 DIRCM / Stealth RAM Jammer for Heavy Gunship (AC-130J) & Northrop B-2A Spirit Stealth Bomber
    if (
      (v.aircraftRole === 'gunship' || v.aircraftRole === 'b2_spirit' || v.isStealthAircraft) &&
      (v.driver || v.aiPilotActive) &&
      (v.flareCooldown || 0) <= 0 &&
      this.world &&
      Array.isArray(this.world.projectiles)
    ) {
      for (const p of this.world.projectiles) {
        if (p.type === 'a2a_missile' && p.targetVehicle === v && p.mesh) {
          const dSq = p.mesh.position.distanceToSquared(v.pos);
          if (dSq < 320 * 320) {
            // Only trigger passive auto-spoof on player gunships if an explicit DIRCM/Stealth pod is equipped,
            // and use realistic 14s–18s AI flare reload windows so F-15 follow-up AIM-120D shots reliably splash targets!
            if (v.driver === player && v.aircraftRole === 'gunship' && !v.hasExplicitAutoDircmPod) {
              continue;
            }
            v.flareActiveTimer = 3.8;
            v.flareCooldown = v.driver
              ? v.aircraftRole === 'b2_spirit'
                ? 9.0
                : 12.0
              : v.aircraftRole === 'b2_spirit'
              ? 14.0
              : 18.0;
            p.targetVehicle = null;
            this.world.spawnDebris(
              tmpVec3(v.pos.x, v.pos.y - 1.5, v.pos.z),
              new THREE.Color(v.aircraftRole === 'b2_spirit' ? 0x00d2d3 : 0xffd32a),
              8
            );
            if (v.driver === player && player?.onAwardXp) {
              player.onAwardXp(
                0,
                v.aircraftRole === 'b2_spirit'
                  ? '🦇 B-2 SPIRIT PASSIVE RAM STEALTH SPOOFED INCOMING SAM LOCK!'
                  : '✨ AC-130J AUTO-DIRCM FLARES DEPLOYED — INCOMING SAM SPOOFED!'
              );
            }
            break;
          }
        }
      }
    }

    if (v.driver || v.remoteDriverId) {
      v.mesh.position.copy(v.pos);
      v.mesh.rotation.set(v.pitch || 0, v.yaw || 0, v.roll || 0, 'YXZ');
      return;
    }

    // Active Tactical Helicopter Ride / Airlift Dispatch (flying to player rooftop/ground pickup, holding at LZ, or departing RTB)
    if (v.isHelicopter && v.rideTask && v.rideTask.active) {
      this.stepAiHeliRide(v, dt, player);
      v.turretYaw = v.yaw;
      v.mesh.position.copy(v.pos);
      v.mesh.rotation.set(v.pitch || 0, v.yaw || 0, v.roll || 0, 'YXZ');
      return;
    }

    // If an unmanned aircraft was shot down (or the pilot ejected via [E]), continue its burning Mayday spiral until it crashes into the ground!
    if (v.isShotDown) {
      v.shotDownTimer = (v.shotDownTimer || 14.0) - dt;
      const spinDir = v.shotDownSpinDir || 1;
      v.pitch = THREE.MathUtils.lerp(v.pitch || 0, -0.78, dt * 2.4);
      v.roll = (v.roll || 0) + spinDir * 3.5 * dt;
      v.yaw = (v.yaw || 0) + spinDir * 1.45 * dt;
      v.forwardSpeed = THREE.MathUtils.lerp(v.forwardSpeed || 45, 52, dt * 1.2);

      v.shotDownSmokeTimer = (v.shotDownSmokeTimer || 0) - dt;
      if (v.shotDownSmokeTimer <= 0 && this.world?.spawnDebris) {
        v.shotDownSmokeTimer = 0.06;
        this.world.spawnDebris(
          tmpVec3(v.pos.x, v.pos.y, v.pos.z),
          new THREE.Color(Math.random() < 0.45 ? 0xff5252 : 0x2f3640),
          3
        );
      }

      const cosP = Math.cos(v.pitch);
      const vx = -Math.sin(v.yaw) * cosP * v.forwardSpeed;
      const vy = Math.sin(v.pitch) * v.forwardSpeed - 18.0;
      const vz = -Math.cos(v.yaw) * cosP * v.forwardSpeed;
      const maxAiAirX = VEHICLE_STATS.AIRSPACE_MAX_X || 4600;
      const maxAiAirZ = VEHICLE_STATS.AIRSPACE_MAX_Z || 3400;
      v.pos.x = THREE.MathUtils.clamp(v.pos.x + vx * dt, -maxAiAirX, maxAiAirX);
      v.pos.z = THREE.MathUtils.clamp(v.pos.z + vz * dt, -maxAiAirZ, maxAiAirZ);
      v.pos.y += vy * dt;

      const groundH = this.world.getGroundHeightAt(v.pos.x, v.pos.z);
      if (v.pos.y <= groundH + 2.4 || v.shotDownTimer <= 0) {
        v.pos.y = groundH;
        this.finalizeShotDownCrash(v);
        return;
      }
      v.mesh.position.copy(v.pos);
      v.mesh.rotation.set(v.pitch || 0, v.yaw || 0, v.roll || 0, 'YXZ');
      return;
    }

    const playerTeam = (player && player.team) || 'US';
    // Check active FALCON Air Wing Squad Order (or Team Commander Order) for this aircraft's faction!
    const falconOrder =
      (botManager?.squadOrders?.[v.team]?.FALCON &&
      botManager.squadOrders[v.team].FALCON.timer > 0
        ? botManager.squadOrders[v.team].FALCON
        : null) ||
      (botManager?.commanderOrders?.[v.team] && botManager.commanderOrders[v.team].timer > 0
        ? botManager.commanderOrders[v.team]
        : null);
    const hasActiveFalconOrder = Boolean(
      falconOrder && falconOrder.timer > 0 && falconOrder.action !== 'AUTO'
    );
    const playerNearRunwayPlane = Boolean(
      player &&
        !player.dead &&
        v.team === playerTeam &&
        !v.aiPilotActive &&
        player.pos.distanceToSquared(v.pos) <= 36 * 36
    );
    // Enemy aircraft auto-sortie; Friendly FALCON Air Wing jets/gunships ALSO scramble when ordered via FALCON / ALL Command!
    // NOTE: Never hijack Transport Helicopters (`heli_transport`), active Ride helicopters (`v.rideTask?.active`),
    // or helicopters parked by the player on a skyscraper rooftop (`v.parkedByPlayer`)!
    const shouldAutoSortie =
      !v.isSecretAircraft &&
      !v.parkedByPlayer &&
      !(v.rideTask && v.rideTask.active) &&
      (v.team !== playerTeam ||
        (hasActiveFalconOrder &&
          v.aircraftRole !== 'b2_spirit' &&
          v.aircraftRole !== 'heli_transport' &&
          !(v.claimedByPlayer && (v.claimedByPlayerTimer || 0) > 0) &&
          !playerNearRunwayPlane));

    if (!shouldAutoSortie && v.aiPilotActive) {
      // If player switched teams or Falcon order ended, return AI jets to friendly runway (never teleport player-parked rooftop helis!)
      v.aiPilotActive = false;
      if (v.flightFSM) {
        v.flightFSM.send(AIRCRAFT_FLIGHT_EVENTS.CANCEL_AI_SORTIE);
      }
      v.forwardSpeed = 0;
      v.pitch = 0;
      v.roll = 0;
      if (!v.parkedByPlayer) {
        v.yaw = v.spawnYaw;
        v.pos.copy(v.spawnPos);
        v.pos.y = this.world.getGroundHeightAt(v.pos.x, v.pos.z);
      }
    } else if (!v.aiPilotActive && shouldAutoSortie && !onDeployMenu) {
      if (v.flightFSM && v.flightFSM.is(AIRCRAFT_FLIGHT_STATES.PARKED_RUNWAY)) {
        v.flightFSM.send(AIRCRAFT_FLIGHT_EVENTS.START_AI_PREFLIGHT);
      }
      v.aiSortieLaunchDelay = Math.max(0, (v.aiSortieLaunchDelay || 0) - dt);
      if (v.aiSortieLaunchDelay <= 0) {
        v.aiPilotActive = true;
        if (v.flightFSM) {
          v.flightFSM.send(AIRCRAFT_FLIGHT_EVENTS.AI_LAUNCH_SORTIE);
        }
        v.aiTakeoffComplete = false;
        v.forwardSpeed = Math.max(v.forwardSpeed || 0, 8.0);
      }
    }

    if (v.aiPilotActive && v.patrolPoints && v.patrolPoints.length > 0) {
      const groundHNow = this.world.getGroundHeightAt(v.pos.x, v.pos.z);
      const altAgl = v.pos.y - groundHNow;
      if (altAgl < 6.5) {
        v.airborneRadarTimer = 0;
      } else {
        v.airborneRadarTimer = (v.airborneRadarTimer || 0) + dt;
      }
      v.isLowAltRadarMasked = altAgl < 28.0 || (v.airborneRadarTimer || 0) < 4.0;
      const inTakeoffRoll = altAgl < 20.0 && (v.aiTakeoffComplete !== true);
      if (altAgl >= 22.0) {
        v.aiTakeoffComplete = true;
      }

      const wpCount = v.patrolPoints.length;
      const curWp = v.patrolPoints[v.patrolIndex % wpCount];
      const nextWp = v.patrolPoints[(v.patrolIndex + 1) % wpCount];

      // Air-to-Air Dogfight Priority: Fighter / CAS AI tracks nearby enemy aircraft in the sky
      // (Pure bombers/gunships like Northrop B-2A Spirit & AC-130 have ZERO forward guns/A2A missiles and NEVER dogfight!)
      let dogfightTarget = null;
      let bestAirDist = 680;
      const canAiDogfight =
        v.aircraftRole !== 'b2_spirit' &&
        v.aircraftRole !== 'gunship' &&
        v.aircraftRole !== 'heli_transport';
      const enemyAirTeam = v.team === 'US' ? 'RU' : 'US';
      const enemyPlanes = canAiDogfight
        ? this.activeAircraftByTeam?.[enemyAirTeam] || this.vehicles
        : [];
      for (let ai = 0; ai < enemyPlanes.length; ai++) {
        const other = enemyPlanes[ai];
        if (!other.isAircraft || other.dead || other.team === v.team) continue;
        if (!other.driver && !other.aiPilotActive) continue;
        const otherGroundH = this.world.getGroundHeightAt(other.pos.x, other.pos.z);
        const otherAltAgl = Math.max(0, other.pos.y - otherGroundH);
        if (otherAltAgl < 28.0 || (other.airborneRadarTimer || 0) < 4.0 || other.isLowAltRadarMasked) continue;
        const isStealthB2 = other.aircraftRole === 'b2_spirit' || other.isStealthAircraft;
        if (isStealthB2 && (other.flareActiveTimer || 0) > 0) continue;
        const maxSpotDist = isStealthB2 ? 680 * (other.stealthFactor || 0.12) : 680;
        const d = v.pos.distanceTo(other.pos);
        if (d < maxSpotDist && d < bestAirDist) {
          bestAirDist = d;
          dogfightTarget = other;
        }
      }

      // Smooth Lookahead Orbit Guidance & Extend-and-Reattack Dogfight Passes
      v.dogfightExtendTimer = Math.max(0, (v.dogfightExtendTimer || 0) - dt);
      let targetX = curWp.x;
      let targetY = curWp.y || 145;
      let targetZ = curWp.z;
      let falconAnchorPos = null;

      if (hasActiveFalconOrder && !inTakeoffRoll) {
        const act = falconOrder.action;
        if (
          (act === 'OBJECTIVE' || act === 'CHARGE' || act === 'ATTACK' || act === 'RETREAT') &&
          falconOrder.flagIndex >= 0 &&
          this.world.flags[falconOrder.flagIndex]
        ) {
          falconAnchorPos = this.world.flags[falconOrder.flagIndex].pos;
        } else if (act === 'FOLLOW' && player && !player.dead && v.team === player.team) {
          falconAnchorPos = player.pos;
        } else if (falconOrder.pos) {
          falconAnchorPos = falconOrder.pos;
        }
      }

      const rawWpDist = Math.hypot(curWp.x - v.pos.x, curWp.z - v.pos.z);
      if (falconAnchorPos && !dogfightTarget) {
        // FALCON Air Wing Squad Order: Orbit & strike the ordered objective / sector!
        v._falconOrbitAngle = (v._falconOrbitAngle ?? (v.fleetIndex || 0) * 1.6) + dt * (v.aircraftRole === 'gunship' ? 0.34 : 0.48);
        const orbitR = v.aircraftRole === 'gunship' ? 145 : 195;
        targetX = THREE.MathUtils.clamp(falconAnchorPos.x + Math.cos(v._falconOrbitAngle) * orbitR, -1950, 1950);
        targetZ = THREE.MathUtils.clamp(falconAnchorPos.z + Math.sin(v._falconOrbitAngle) * orbitR, -1350, 1350);
        targetY = v.aircraftRole === 'gunship' ? 162 : v.aircraftRole === 'fighter' ? 152 : 118;
      } else if (!dogfightTarget) {
        const switchR = Math.max(115, (v.speed || 85) * 1.45);
        const blendStartR = switchR * 1.75;
        if (rawWpDist < blendStartR) {
          // Blend smoothly toward the next waypoint before switching so the aircraft flies wide, sweeping curves
          const blend = THREE.MathUtils.clamp(1.0 - (rawWpDist - switchR) / Math.max(40, blendStartR - switchR), 0, 1);
          targetX = THREE.MathUtils.lerp(curWp.x, nextWp.x, blend);
          targetY = THREE.MathUtils.lerp(curWp.y || 145, nextWp.y || 145, blend);
          targetZ = THREE.MathUtils.lerp(curWp.z, nextWp.z, blend);
          if (rawWpDist < switchR) {
            v.patrolIndex = (v.patrolIndex + 1) % wpCount;
          }
        }
      }

      if (dogfightTarget && v.aircraftRole === 'fighter' && !inTakeoffRoll) {
        if (bestAirDist < 135 && v.dogfightExtendTimer <= 0) {
          // Perform a realistic high-speed zoom-and-extend pass instead of jittering in tight circles
          v.dogfightExtendTimer = 3.6;
          v.dogfightExtendYaw = v.yaw + (Math.random() < 0.5 ? 0.45 : -0.45);
        }
        if (v.dogfightExtendTimer > 0) {
          const extYaw = v.dogfightExtendYaw ?? v.yaw;
          targetX = v.pos.x - Math.sin(extYaw) * 280;
          targetZ = v.pos.z - Math.cos(extYaw) * 280;
          targetY = Math.max(125, dogfightTarget.pos.y + 24);
        } else {
          // Lead the enemy aircraft slightly along its velocity vector
          const leadT = THREE.MathUtils.clamp(bestAirDist / 260, 0.2, 1.5);
          const tvx = dogfightTarget.velVector ? dogfightTarget.velVector.x : 0;
          const tvz = dogfightTarget.velVector ? dogfightTarget.velVector.z : 0;
          targetX = dogfightTarget.pos.x + tvx * leadT;
          targetZ = dogfightTarget.pos.z + tvz * leadT;
          targetY = Math.max(105, dogfightTarget.pos.y + 8);
        }
      }

      const dx = targetX - v.pos.x;
      const dy = targetY - v.pos.y;
      const dz = targetZ - v.pos.z;
      const horizDist = Math.max(1, Math.hypot(dx, dz));

      const cruiseSpeed = v.speed || 64;
      const targetAirSpd = inTakeoffRoll ? cruiseSpeed * 0.88 : cruiseSpeed;
      const curAirSpd = v.forwardSpeed || 8.0;
      // Progressive turbofan thrust spool & aerodynamic drag so AI planes accelerate gradually down the runway and in climbs/dives
      v.engineSpool = Math.min(1.0, (v.engineSpool || 0.25) + dt * 0.42);
      const gravPitchAccel = inTakeoffRoll ? 0 : -Math.sin(v.pitch || 0) * 14.0;
      const maxThrustAccel = (v.accelRate || 2.8) * 3.6 * v.engineSpool;
      const airSpdDiff = targetAirSpd - curAirSpd;
      const thrustStep = THREE.MathUtils.clamp(airSpdDiff, -6.5 * dt, maxThrustAccel * dt);
      v.forwardSpeed = THREE.MathUtils.clamp(
        curAirSpd + thrustStep + gravPitchAccel * dt,
        8.0,
        (v.maxSpeed || cruiseSpeed * 1.35)
      );

      let desiredYaw = inTakeoffRoll ? v.spawnYaw : Math.atan2(-dx, -dz);
      let yawDiff = desiredYaw - v.yaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;

      // =====================================================================
      // TRUE COORDINATED BANK-TO-TURN AERODYNAMICS FOR AI AIRCRAFT:
      // 1. Aircraft rolls its wings smoothly into the turn (+yawDiff -> +roll left wing down).
      // 2. The aircraft's yaw turn rate d(v.yaw)/dt is physically driven by sin(v.roll),
      //    so the plane banks first and carves a smooth, natural circular arc through the sky!
      // =====================================================================
      const maxBank = v.aircraftRole === 'gunship' ? 0.42 : v.aircraftRole === 'b2_spirit' ? 0.55 : 0.78;
      const targetRoll = inTakeoffRoll
        ? 0
        : THREE.MathUtils.clamp(yawDiff * 1.25, -maxBank, maxBank);
      v.roll = THREE.MathUtils.lerp(v.roll || 0, targetRoll, Math.min(1, dt * 3.2));

      const fineRudder = THREE.MathUtils.clamp(yawDiff, -0.1, 0.1) * 0.22;
      const effAirSpd = Math.max(v.minSpeed || 32, Math.abs(v.forwardSpeed || 60));
      const maxTurnAcc =
        v.maxTurnAccelMs2 ||
        (v.aircraftRole === 'fighter'
          ? 64.0
          : v.aircraftRole === 'cas'
          ? 46.0
          : v.aircraftRole === 'b2_spirit'
          ? 19.5
          : v.aircraftRole === 'gunship'
          ? 15.5
          : 48.0);
      const bankNorm = THREE.MathUtils.clamp(Math.sin(v.roll) / Math.max(0.25, Math.sin(maxBank)), -1, 1);
      const bankedYawRate = inTakeoffRoll
        ? THREE.MathUtils.clamp(yawDiff * 1.5, -0.4, 0.4)
        : (bankNorm * maxTurnAcc) / effAirSpd + fineRudder;
      v.yaw += bankedYawRate * dt;

      // Smooth pitch control with Runway Rotation & Terrain Avoidance Pull-Up (never slides flat with nose down!)
      let desiredPitch;
      if (inTakeoffRoll) {
        desiredPitch = v.forwardSpeed >= 34 ? 0.22 : 0.02;
      } else {
        desiredPitch = THREE.MathUtils.clamp(
          Math.atan2(dy, Math.max(65, horizDist)) + Math.abs(Math.sin(v.roll)) * 0.055,
          -0.30,
          0.32
        );
        // Smooth Auto-Terrain Pull-Up when below 72m AGL
        if (altAgl < 72.0) {
          const pullUpFrac = THREE.MathUtils.clamp((72.0 - altAgl) / 38.0, 0, 1);
          desiredPitch = Math.max(desiredPitch, pullUpFrac * 0.26);
        }
      }
      v.pitch = THREE.MathUtils.lerp(v.pitch || 0, desiredPitch, Math.min(1, dt * 2.6));
      this.updateAircraftControlSurfacesAndVortices(v, dt, targetRoll - v.roll, desiredPitch - v.pitch, yawDiff);

      const cosP = Math.cos(v.pitch);
      const noseDir = tmpVec3(
        -Math.sin(v.yaw) * cosP,
        Math.sin(v.pitch),
        -Math.cos(v.yaw) * cosP
      ).normalize();
      if (!v._aiAeroDir) {
        v._aiAeroDir = noseDir.clone();
      } else {
        v._aiAeroDir.lerp(noseDir, Math.min(1, dt * 5.5)).normalize();
      }
      const vx = v._aiAeroDir.x * v.forwardSpeed;
      const vy = v._aiAeroDir.y * v.forwardSpeed;
      const vz = v._aiAeroDir.z * v.forwardSpeed;
      if (!v.velVector) v.velVector = new THREE.Vector3();
      v.velVector.set(vx, vy, vz);

      const maxAiAirX = VEHICLE_STATS.AIRSPACE_MAX_X || 4600;
      const maxAiAirZ = VEHICLE_STATS.AIRSPACE_MAX_Z || 3400;
      v.pos.x = THREE.MathUtils.clamp(v.pos.x + vx * dt, -maxAiAirX, maxAiAirX);
      v.pos.z = THREE.MathUtils.clamp(v.pos.z + vz * dt, -maxAiAirZ, maxAiAirZ);
      const groundH = this.world.getGroundHeightAt(v.pos.x, v.pos.z);
      const nextY = v.pos.y + vy * dt;
      const minSafeAlt = inTakeoffRoll ? groundH : groundH + 22;
      const clampedY = THREE.MathUtils.clamp(nextY, minSafeAlt, VEHICLE_STATS.AIRSPACE_MAX_ALT || 3500);
      if (clampedY > nextY + 0.01) {
        v.pitch = Math.max(v.pitch, 0.08);
        v.velVector.y = Math.max(0, v.velVector.y);
      }
      v.pos.y = clampedY;

      // AI Air-to-Air Dogfight & FALCON Air Wing Ground CAS / Gunship Orbit Strikes
      v.aiFireTimer -= dt;
      if (v.aiFireTimer <= 0 && dogfightTarget && bestAirDist < 460 && Math.abs(yawDiff) < 0.35) {
        v.aiFireTimer = 0.95 + Math.random() * 0.95;
        if (botManager && typeof botManager.spawnTracer === 'function') {
          botManager.spawnTracer(v.pos.clone(), dogfightTarget.pos.clone(), 0xff5252);
        }
        // Apply light AI dogfight chip damage to AI planes (or light warning chip to player plane)
        const dmg = dogfightTarget.driver ? 10 : 38;
        this.damageVehicle(
          dogfightTarget,
          dmg,
          `${v.name} [AI PILOT]`,
          v.team,
          '20MM AIR-TO-AIR CANNON',
          player ? player.onKillEvent : null,
          null,
          v.pos
        );
      } else if (v.aiFireTimer <= 0 && falconAnchorPos && botManager && !inTakeoffRoll) {
        const enemyTeam = v.team === 'US' ? 'RU' : 'US';
        let strikeBot = null;
        let bestGroundSq = 185 * 185;
        const enemyGrid = botManager.teamGrid?.[enemyTeam];
        if (enemyGrid) {
          enemyGrid.forEachInRadius(falconAnchorPos.x, falconAnchorPos.z, 185, (eb, dSq) => {
            if (!eb || eb.dead || eb.downed || eb.drivingVehicle || eb.team === v.team) return;
            if (dSq < bestGroundSq) {
              bestGroundSq = dSq;
              strikeBot = eb;
            }
          });
        }
        if (strikeBot && v.pos.distanceToSquared(strikeBot.pos) < 520 * 520) {
          v.aiFireTimer = v.aircraftRole === 'gunship' ? 0.85 : 1.15;
          if (typeof botManager.spawnTracer === 'function') {
            botManager.spawnTracer(
              v.pos.clone(),
              strikeBot.pos.clone().add(new THREE.Vector3(0, 1.0, 0)),
              v.team === 'US' ? 0x00d2d3 : 0xff9f1a
            );
          }
          if (this.world?.spawnDebris) {
            this.world.spawnDebris(
              tmpVec3(strikeBot.pos.x, strikeBot.pos.y + 0.8, strikeBot.pos.z),
              COLOR_FIRE_ORANGE,
              3
            );
          }
          botManager.damageBot(
            strikeBot,
            v.aircraftRole === 'gunship' ? 42 : 34,
            `FALCON WING [${v.name.split(' (')[0]}]`,
            v.team,
            v.aircraftRole === 'gunship' ? 'AC-130 ORBITAL CANNON' : 'FALCON CAS STRAFE',
            false,
            player ? player.onKillEvent : null,
            null
          );
        }
      }
    } else {
      // Parked on the Airfield Runway, Helipad, OR High-Rise Skyscraper Rooftop!
      // CRITICAL FIX: Helicopters must use 5-point rooftop/helipad support height (`getAircraftSupportHeightAt`)
      // instead of `getGroundHeightAt` so landing & exiting on a 60m–100m Downtown FOB C skyscraper roof
      // NEVER teleports the helicopter down into the ground floor!
      v.forwardSpeed *= Math.pow(0.05, dt);
      v.pitch = THREE.MathUtils.lerp(v.pitch || 0, 0, dt * 5);
      v.roll = THREE.MathUtils.lerp(v.roll || 0, 0, dt * 5);
      if (v.isHelicopter) {
        v._heliVelX = (v._heliVelX || 0) * Math.pow(0.05, dt);
        v._heliVelZ = (v._heliVelZ || 0) * Math.pow(0.05, dt);
        const supportY = this.getAircraftSupportHeightAt(v.pos.x, v.pos.z, v.pos.y + 3.8, true);
        if (v.heliHoverHold && v.pos.y > supportY + 0.35) {
          const targetH = Math.max(supportY, v.heliHoverAlt ?? v.pos.y);
          v.pos.y = THREE.MathUtils.lerp(v.pos.y, targetH, Math.min(1, dt * 3.0));
          v._heliVelY = 0;
        } else if (v.pos.y > supportY + 0.12) {
          v._heliVelY = Math.max(-7.5, (v._heliVelY || 0) - 9.81 * dt);
          v.pos.y = Math.max(supportY, v.pos.y + v._heliVelY * dt);
          if (v.pos.y <= supportY + 0.02) {
            v.pos.y = supportY;
            v._heliVelY = 0;
          }
        } else {
          v.pos.y = supportY;
          v._heliVelY = 0;
        }
      } else {
        v.pos.y = this.world.getGroundHeightAt(v.pos.x, v.pos.z);
      }
      this.updateAircraftControlSurfacesAndVortices(v, dt, 0, 0, 0);
    }

    v.turretYaw = v.yaw;
    v.mesh.position.copy(v.pos);
    v.mesh.rotation.set(v.pitch || 0, v.yaw || 0, v.roll || 0, 'YXZ');
  }

  fireAiVehicleWeapon(v, targetPos, player, airTarget = null) {
    const muzzleOrigin = tmpVec3(v.pos.x, v.pos.y + (v.type === 'tank' ? 2.25 : v.isEmplacement ? 1.45 : 2.5), v.pos.z);
    const rawVec = tmpVec3Copy(targetPos).sub(muzzleOrigin);
    const pitchLimits = this.getVehiclePitchLimits(v);
    const horizDist = Math.max(0.5, Math.hypot(rawVec.x, rawVec.z));
    const clampedElev = THREE.MathUtils.clamp(Math.atan2(rawVec.y, horizDist), pitchLimits.min, pitchLimits.max);
    rawVec.y = horizDist * Math.tan(clampedElev);
    const dir = rawVec.normalize();
    dir.x += (Math.random() - 0.5) * 0.04;
    dir.y += (Math.random() - 0.5) * 0.025;
    dir.z += (Math.random() - 0.5) * 0.04;
    dir.normalize();

    const distToPlayer = player ? v.pos.distanceTo(player.pos) : 999;
    let pan = 0;
    if (player && distToPlayer < 220) {
      const dx = v.pos.x - player.pos.x;
      const dz = v.pos.z - player.pos.z;
      const len = Math.hypot(dx, dz) || 1;
      const rightX = Math.cos(player.yaw || 0);
      const rightZ = -Math.sin(player.yaw || 0);
      pan = (dx * rightX + dz * rightZ) / len;
    }
    const ownerObj = v.npcDriver || {
      name: v.name,
      team: v.team,
      isAiVehicle: true,
      pos: v.pos.clone()
    };

    if (v.weaponType === 'aa_autocannon') {
      const isAirbaseCiws = Boolean(v.isAirbaseDefenseBattery);
      if (distToPlayer < (isAirbaseCiws ? 450 : 240)) sound.playGunshot('autocannon', distToPlayer, pan);
      // Launch Homing SAM periodically when tracking an enemy aircraft (Patriot PAC-3 / S-400 on Airbase CIWS!)
      if (airTarget && v.coaxCooldown <= 0) {
        v.coaxCooldown = isAirbaseCiws ? 4.2 : 15.5;
        const samMesh = new THREE.Mesh(SHARED_AI_SAM_GEO, SHARED_AI_SAM_MAT);
        samMesh.position.copy(muzzleOrigin).addScaledVector(dir, 2.8);
        samMesh.lookAt(targetPos);
        this.scene.add(samMesh);
        this.world.projectiles.push({
          type: 'a2a_missile',
          isPitbullActiveSeeker: isAirbaseCiws,
          mesh: samMesh,
          vel: dir.clone().multiplyScalar(isAirbaseCiws ? 340 : PROJECTILES.STINGER_SAM?.speed || 255),
          gravity: 0,
          life: isAirbaseCiws ? 7.5 : 6.5,
          turnRate: isAirbaseCiws ? 7.2 : 4.2,
          targetVehicle: airTarget,
          blastRadius: isAirbaseCiws ? 12.5 : 9.5,
          blastDamage: isAirbaseCiws ? 420 : airTarget.driver ? 145 : 280,
          weaponName: isAirbaseCiws
            ? v.team === 'US'
              ? 'PATRIOT PAC-3 AIRBASE SAM'
              : 'S-400 TRIUMF AIRBASE SAM'
            : v.team === 'US'
            ? 'FIM-92 STINGER SAM'
            : '9M311 / IGLA SAM',
          owner: ownerObj
        });
        return;
      }
      const shellMesh = new THREE.Mesh(SHARED_AI_AA_SHELL_GEO, SHARED_AI_AA_SHELL_MAT);
      shellMesh.position.copy(muzzleOrigin).addScaledVector(dir, 2.5);
      this.scene.add(shellMesh);
      this.world.projectiles.push({
        type: 'autocannon',
        isAaProximity: isAirbaseCiws,
        mesh: shellMesh,
        vel: dir.clone().multiplyScalar(isAirbaseCiws ? 310 : 155),
        gravity: isAirbaseCiws ? 0.25 : 0.65,
        life: 3.8,
        blastRadius: isAirbaseCiws ? 8.5 : 6.5,
        blastDamage: isAirbaseCiws ? 72 : airTarget?.driver ? 28 : 65,
        weaponName: isAirbaseCiws
          ? v.team === 'US'
            ? '20MM C-RAM PHALANX CIWS'
            : '30MM PANTSIR-S1M CIWS'
          : v.team === 'US'
          ? '25MM GAU-12 AA'
          : '30MM 2A38M AA',
        owner: ownerObj
      });
    } else if (v.weaponType === 'tank_cannon') {
      v.barrelRecoil = 1.0;
      if (distToPlayer < 220) sound.playTankCannon(distToPlayer, pan);
      this.world.spawnDebris(
        tmpVec3Copy(muzzleOrigin).addScaledVector(dir, 3.8),
        COLOR_MUZZLE_GOLD,
        4
      );
      const shellMesh = new THREE.Mesh(SHARED_AI_TANK_SHELL_GEO, SHARED_AI_TANK_SHELL_MAT);
      shellMesh.position.copy(muzzleOrigin).addScaledVector(dir, 4.0);
      shellMesh.lookAt(targetPos);
      this.scene.add(shellMesh);

      this.world.projectiles.push({
        type: 'tank_shell',
        mesh: shellMesh,
        vel: dir.clone().multiplyScalar(540),
        gravity: 1.85,
        life: 3.5,
        owner: ownerObj
      });
    } else if (v.weaponType === 'autocannon') {
      if (distToPlayer < 170) sound.playGunshot('autocannon', distToPlayer, pan);
      const shellMesh = new THREE.Mesh(SHARED_AI_AUTO_SHELL_GEO, SHARED_AI_AUTO_SHELL_MAT);
      shellMesh.position.copy(muzzleOrigin).addScaledVector(dir, 2.4);
      this.scene.add(shellMesh);
      const aiAcName =
        v.team === 'RU' ? '30MM 2A72 APDS-T AUTOCANNON' : '25MM M242 BUSHMASTER APDS-T';
      this.world.projectiles.push({
        type: 'autocannon',
        weaponName: aiAcName,
        weaponLabel: aiAcName,
        mesh: shellMesh,
        vel: dir.clone().multiplyScalar(340),
        gravity: 2.1,
        life: 3.0,
        owner: ownerObj
      });
    } else if (v.weaponType === 'hmg') {
      if (distToPlayer < 170) sound.playGunshot('hmg', distToPlayer, pan);
      const shellMesh = new THREE.Mesh(SHARED_AI_AUTO_SHELL_GEO, SHARED_AI_AUTO_SHELL_MAT);
      shellMesh.position.copy(muzzleOrigin).addScaledVector(dir, 2.2);
      this.scene.add(shellMesh);
      this.world.projectiles.push({
        type: 'autocannon',
        weaponName: '.50 CAL HMG',
        weaponLabel: '.50 CAL HMG',
        blastRadius: 1.8,
        blastDamage: 68,
        mesh: shellMesh,
        vel: dir.clone().multiplyScalar(420),
        gravity: 1.8,
        life: 2.4,
        owner: ownerObj
      });
    }
  }

  // ===========================================================================
  // ROOFTOP SUPPORT HEIGHT & MULTI-MODAL TACTICAL RIDE / EXTRACTION SYSTEM
  // Supports: 'heli' (UH-60M / Mi-8 Rooftop Airlift), 'apc' (LAV-25 / BTR-82A),
  //           'truck' (6x6 Troop & Ammo Truck), and 'humvee' (Up-Armored 4x4)
  // ===========================================================================

  getAircraftSupportHeightAt(wx, wz, refMaxY = 175, sampleSkids = false) {
    const sampleColumn = (sx, sz) => {
      const terrY = this.world ? this.world.getGroundHeightAt(sx, sz) : 0;
      if (!this.world) return terrY;
      let maxY = terrY;
      const platforms = this.world.elevatedPlatforms;
      if (Array.isArray(platforms)) {
        for (let i = 0; i < platforms.length; i++) {
          const p = platforms[i];
          if (
            sx >= p.minX &&
            sx <= p.maxX &&
            sz >= p.minZ &&
            sz <= p.maxZ &&
            p.topY > maxY &&
            p.topY <= refMaxY
          ) {
            maxY = p.topY;
          }
        }
      }
      if (this.world.voxels && typeof this.world.worldToGrid === 'function') {
        const g = this.world.worldToGrid(sx, terrY + 0.5, sz);
        const maxDy = Math.min(126, Math.max(8, Math.ceil((refMaxY - terrY) / 1.25)));
        for (let dy = 0; dy <= maxDy; dy++) {
          const vox = this.world.getVoxel
            ? this.world.getVoxel(g.gx, g.gy + dy, g.gz)
            : this.world.voxels.get(this.world.key(g.gx, g.gy + dy, g.gz));
          if (vox && !vox.isProp) {
            const top = vox.maxY ?? terrY + (dy + 1) * 1.25;
            if (top > maxY && top <= refMaxY) {
              maxY = top;
            }
          }
        }
      }
      return maxY;
    };

    let bestY = sampleColumn(wx, wz);
    if (sampleSkids) {
      const offsets = [
        [1.5, 1.7],
        [-1.5, 1.7],
        [1.5, -1.7],
        [-1.5, -1.7]
      ];
      for (let i = 0; i < offsets.length; i++) {
        const sy = sampleColumn(wx + offsets[i][0], wz + offsets[i][1]);
        if (sy > bestY) bestY = sy;
      }
    }
    return bestY;
  }

  /**
   * Finds the highest intact building rooftop near `(wx, wz)` within `searchRadius` meters
   * so Helicopter Airlifts can land snipers directly on top of Downtown FOB C skyscrapers!
   */
  findTallestBuildingRoofNear(wx, wz, searchRadius = 145) {
    if (!this.world) return null;
    let best = null;
    const rSq = searchRadius * searchRadius;
    if (Array.isArray(this.world.buildings)) {
      for (let i = 0; i < this.world.buildings.length; i++) {
        const b = this.world.buildings[i];
        if (!b || b.collapsed) continue;
        const cx = Number.isFinite(b.centerWx)
          ? b.centerWx
          : Number.isFinite(b.cx)
          ? b.cx
          : ((b.minWx ?? b.minX ?? 0) + (b.maxWx ?? b.maxX ?? 0)) * 0.5;
        const cz = Number.isFinite(b.centerWz)
          ? b.centerWz
          : Number.isFinite(b.cz)
          ? b.cz
          : ((b.minWz ?? b.minZ ?? 0) + (b.maxWz ?? b.maxZ ?? 0)) * 0.5;
        const padX =
          Number.isFinite(b.startGx) && Number.isFinite(b.width)
            ? (b.startGx + Math.floor(b.width * 0.5)) * 1.25
            : cx;
        const padZ =
          Number.isFinite(b.startGz) && Number.isFinite(b.depth)
            ? (b.startGz + Math.floor(b.depth * 0.5)) * 1.25
            : cz;
        const dSq = (padX - wx) * (padX - wx) + (padZ - wz) * (padZ - wz);
        if (dSq > rSq) continue;
        const groundY = this.world.getGroundHeightAt(padX, padZ);
        const roofY = this.getAircraftSupportHeightAt(padX, padZ, 185, true);
        const hAbove = roofY - groundY;
        if (hAbove < 6.5) continue;
        if (!best || roofY > best.y + 0.5 || (Math.abs(roofY - best.y) <= 0.5 && dSq < best.dSq)) {
          best = { x: padX, y: roofY, z: padZ, heightAboveGround: hAbove, dSq, building: b };
        }
      }
    }
    if (!best) {
      const groundY = this.world.getGroundHeightAt(wx, wz);
      const roofY = this.getAircraftSupportHeightAt(wx, wz, 185, true);
      if (roofY - groundY >= 6.5) {
        best = { x: wx, y: roofY, z: wz, heightAboveGround: roofY - groundY, dSq: 0, building: null };
      }
    }
    return best;
  }

  resolveRideDestination(player, opts = {}) {
    const team = player?.team || 'US';
    const isHeli = (opts.transportMode || 'heli') === 'heli';
    const destKey = String(opts.destKey || '').toUpperCase();

    if (destKey === 'OBJ_C_ROOF' || destKey === 'C_ROOF') {
      const flagC = this.world?.flags?.find((f) => f.id === 'C') || { pos: { x: 0, z: 0 } };
      const roof = this.findTallestBuildingRoofNear(flagC.pos.x, flagC.pos.z, 175);
      if (roof && isHeli) {
        return {
          pos: new THREE.Vector3(roof.x, roof.y, roof.z),
          label: `🏢 OBJ C SKYSCRAPER ROOF (+${Math.round(roof.heightAboveGround)}M)`,
          isRoof: true
        };
      }
      const gy = this.world ? this.world.getGroundHeightAt(flagC.pos.x, flagC.pos.z) : 0;
      return {
        pos: new THREE.Vector3(flagC.pos.x, gy, flagC.pos.z),
        label: '🚩 OBJECTIVE C (DOWNTOWN)',
        isRoof: false
      };
    }

    if (destKey === 'BASE' || destKey === 'HQ') {
      const baseSpawn =
        team === 'RU'
          ? this.world?.spawns?.RU_BASE || { x: 1520, z: 0 }
          : this.world?.spawns?.US_BASE || { x: -1520, z: 0 };
      const gy = this.world ? this.world.getGroundHeightAt(baseSpawn.x, baseSpawn.z) : 0;
      return {
        pos: new THREE.Vector3(baseSpawn.x + (team === 'RU' ? -18 : 18), gy, baseSpawn.z),
        label: `🏠 ${team} MAIN BASE HQ`,
        isRoof: false
      };
    }

    if (['A', 'B', 'C', 'D', 'E'].includes(destKey)) {
      const fl = this.world?.flags?.find((f) => f.id === destKey);
      if (fl) {
        if (isHeli && opts.preferRoof) {
          const roof = this.findTallestBuildingRoofNear(fl.pos.x, fl.pos.z, 125);
          if (roof) {
            return {
              pos: new THREE.Vector3(roof.x, roof.y, roof.z),
              label: `🏢 OBJ ${destKey} ROOFTOP (+${Math.round(roof.heightAboveGround)}M)`,
              isRoof: true
            };
          }
        }
        const safeGnd =
          !isHeli && this.world?.pushOutOfBuildingFootprint
            ? this.world.pushOutOfBuildingFootprint(fl.pos.x + 12, fl.pos.z, 4.5)
            : { x: fl.pos.x + (isHeli ? 0 : 12), z: fl.pos.z };
        const gy = isHeli
          ? this.getAircraftSupportHeightAt(safeGnd.x, safeGnd.z, 175, true)
          : this.world
          ? this.world.getGroundHeightAt(safeGnd.x, safeGnd.z)
          : 0;
        const gndBase = this.world ? this.world.getGroundHeightAt(safeGnd.x, safeGnd.z) : 0;
        return {
          pos: new THREE.Vector3(safeGnd.x, gy, safeGnd.z),
          label: gy - gndBase > 6.5 ? `🏢 OBJ ${destKey} ROOF` : `🚩 OBJECTIVE ${destKey}`,
          isRoof: gy - gndBase > 6.5
        };
      }
    }

    if (Number.isFinite(opts.destX) && Number.isFinite(opts.destZ)) {
      const cx = THREE.MathUtils.clamp(opts.destX, -2350, 2350);
      const cz = THREE.MathUtils.clamp(opts.destZ, -1550, 1550);
      if (isHeli && opts.preferRoof !== false) {
        const nearRoof = this.findTallestBuildingRoofNear(cx, cz, 32);
        if (nearRoof) {
          return {
            pos: new THREE.Vector3(nearRoof.x, nearRoof.y, nearRoof.z),
            label:
              opts.customLabel ||
              `🏢 ROOFTOP LZ (+${Math.round(nearRoof.heightAboveGround)}M)`,
            isRoof: true
          };
        }
        const supY = this.getAircraftSupportHeightAt(cx, cz, 175, true);
        const gY = this.world ? this.world.getGroundHeightAt(cx, cz) : 0;
        return {
          pos: new THREE.Vector3(cx, supY, cz),
          label:
            opts.customLabel ||
            (supY - gY > 6.5
              ? `🏢 ROOFTOP LZ (+${Math.round(supY - gY)}M)`
              : `📍 MAP LZ (${Math.round(cx)}, ${Math.round(cz)})`),
          isRoof: supY - gY > 6.5
        };
      }
      const pushed = this.world?.pushOutOfBuildingFootprint
        ? this.world.pushOutOfBuildingFootprint(cx, cz, 4.5)
        : { x: cx, z: cz };
      const gy = this.world ? this.world.getGroundHeightAt(pushed.x, pushed.z) : 0;
      return {
        pos: new THREE.Vector3(pushed.x, gy, pushed.z),
        label: opts.customLabel || `📍 GROUND LZ (${Math.round(pushed.x)}, ${Math.round(pushed.z)})`,
        isRoof: false
      };
    }

    // Smart Context-Aware Default Destination:
    // - If player is near Objective C (or on C's skyscraper roof!) -> fly to nearest uncaptured/contested objective!
    // - Otherwise (e.g., at Main Base as a Sniper!) -> fly straight to TOP OF OBJ C SKYSCRAPER ROOF (for Heli) or OBJ C!
    const flagC = this.world?.flags?.find((f) => f.id === 'C');
    const distToC = flagC && player ? Math.hypot(player.pos.x - flagC.pos.x, player.pos.z - flagC.pos.z) : 999;
    if (distToC > 135) {
      return this.resolveRideDestination(player, {
        transportMode: isHeli ? 'heli' : opts.transportMode,
        destKey: isHeli ? 'OBJ_C_ROOF' : 'C'
      });
    }
    let nextFlag =
      this.world?.flags?.find((f) => f.id !== 'C' && f.owner !== team) ||
      this.world?.flags?.find((f) => f.id === 'D') ||
      this.world?.flags?.[0];
    return this.resolveRideDestination(player, {
      transportMode: opts.transportMode,
      destKey: nextFlag ? nextFlag.id : 'BASE',
      preferRoof: isHeli
    });
  }

  cancelPlayerRide(player) {
    const v = player?.activeRideVehicle || this.vehicles.find((veh) => veh?.rideTask?.active);
    if (!v || !v.rideTask) return false;
    if (player && player.activeVehicle === v && (player.vehicleSeatIndex || 0) >= 1) {
      // Player is inside: hand control or start gentle hover/stop
      v.rideTask.active = false;
    } else {
      v.rideTask.phase = 'RTB_DEPART';
      v.rideTask.departDelay = 0.2;
    }
    if (player) player.activeRideVehicle = null;
    return true;
  }

  /**
   * Dispatches an AI-piloted / AI-driven Transport (`'heli'`, `'apc'`, `'truck'`, `'humvee'`)
   * to pick up `player` (from Main Base, open terrain, OR top of a tall skyscraper!) and carry
   * them to `dest` (including rooftop sniper insertions at Downtown FOB C!).
   */
  requestPlayerRide(player, opts = {}) {
    if (!player || player.dead || player.downed) return { ok: false, reason: 'PLAYER_DOWN' };
    if ((this.world?.era || 'modern') !== 'modern') {
      return { ok: false, reason: 'ERA_LOCKED' };
    }

    const team = player.team || 'US';
    const isRU = team === 'RU';
    const playerGndY = this.world ? this.world.getGroundHeightAt(player.pos.x, player.pos.z) : 0;
    const playerOnHighRoof = player.pos.y - playerGndY > 6.5;

    let mode = String(opts.transportMode || player.preferredRideMode || 'heli').toLowerCase();
    if (!['heli', 'apc', 'truck', 'humvee'].includes(mode)) mode = 'heli';
    player.preferredRideMode = mode;

    const rideHk = getRideShortcutLabel();
    const isPickupOnly = Boolean(opts.pickupOnly);
    const dest = isPickupOnly
      ? {
          pos: null,
          label: `⏳ AWAITING DROP-OFF [${rideHk}]`,
          isRoof: false,
          pending: true
        }
      : this.resolveRideDestination(player, { ...opts, transportMode: mode });

    // 1. If player is ALREADY onboard an active Ride vehicle (or piloting/riding a matching transport), lock/redirect drop-off live!
    if (player.activeVehicle && !player.activeVehicle.dead && !isPickupOnly) {
      const curV = player.activeVehicle;
      const curMatchesMode =
        (mode === 'heli' && curV.isHelicopter) ||
        (mode === 'apc' && curV.type === 'apc') ||
        (mode === 'truck' && curV.type === 'truck_transport') ||
        (mode === 'humvee' && (curV.type === 'humvee' || curV.type === 'car'));
      if (curV.rideTask?.active || curMatchesMode) {
        if ((player.vehicleSeatIndex || 0) === 0 && (curV.seatNames?.length || 2) > 1) {
          // Move player into Passenger / Door-Gunner Seat [F2] so AI Chauffeur takes the controls!
          if (Array.isArray(curV.crewSeats)) curV.crewSeats[0] = null;
          player.vehicleSeatIndex = 1;
          if (Array.isArray(curV.crewSeats)) curV.crewSeats[1] = player;
          player.vehicleCameraMode = 'CHASE_3P';
          player.thirdPersonVehicle = true;
        }
        curV.rideTask = {
          active: true,
          transportMode: mode,
          phase: 'EN_ROUTE_TO_DEST',
          pickupPos: curV.pos.clone(),
          destPos: dest.pos.clone(),
          destLabel: dest.label,
          destIsRoof: Boolean(dest.isRoof),
          destPending: false,
          _consumedPingRef: opts._consumedPingRef || curV.rideTask?._consumedPingRef || null,
          arrivedAnnounced: false,
          pickupAnnounced: true,
          departDelay: 0,
          liftoffClearY: curV.pos.y + (curV.isHelicopter ? 16 : 0)
        };
        player.activeRideVehicle = curV;
        sound.playRadioBeep?.(true);
        player.onAwardXp?.(
          0,
          `${curV.isHelicopter ? '🚁 AIRLIFT-1' : '🛡️ CONVOY-1'}: DROP-OFF LOCKED → ${dest.label}!`
        );
        return { ok: true, vehicle: curV, dest, redirected: true };
      }
    }

    // 1b. If an unboarded pickup vehicle of the SAME mode is ALREADY inbound/waiting, update its drop-off in-place without resetting approach!
    if (
      !isPickupOnly &&
      player.activeRideVehicle &&
      player.activeRideVehicle !== player.activeVehicle &&
      !player.activeRideVehicle.dead &&
      player.activeRideVehicle.rideTask?.active &&
      player.activeRideVehicle.rideTask.phase !== 'RTB_DEPART' &&
      player.activeRideVehicle.rideTask.transportMode === mode
    ) {
      const inboundV = player.activeRideVehicle;
      inboundV.rideTask.destPos = dest.pos.clone();
      inboundV.rideTask.destLabel = dest.label;
      inboundV.rideTask.destIsRoof = Boolean(dest.isRoof);
      inboundV.rideTask.destPending = false;
      inboundV.rideTask.arrivedAnnounced = false;
      if (opts._consumedPingRef) {
        inboundV.rideTask._consumedPingRef = opts._consumedPingRef;
      }
      sound.playRadioBeep?.(true);
      player.onAwardXp?.(
        0,
        `🎯 DROP-OFF DESIGNATED → ${dest.label}! (BOARD INBOUND RIDE WITH [E])`
      );
      return {
        ok: true,
        vehicle: inboundV,
        dest,
        pickupPos: inboundV.rideTask.pickupPos,
        transportMode: mode,
        updatedDropoff: true
      };
    }

    // Cancel any previous unboarded ride vehicle (e.g. if switching transport mode)
    if (player.activeRideVehicle && player.activeRideVehicle !== player.activeVehicle) {
      const prev = player.activeRideVehicle;
      if (prev.rideTask) prev.rideTask.active = false;
      player.activeRideVehicle = null;
    }

    // 2. Find an available unoccupied friendly transport of the requested mode, or spawn a dedicated shuttle
    let rideVeh = null;
    if (mode === 'heli') {
      rideVeh = this.vehicles.find(
        (v) =>
          v &&
          !v.dead &&
          v.team === team &&
          v.isHelicopter &&
          v.aircraftRole === 'heli_transport' &&
          !v.driver &&
          !v.remoteDriverId &&
          !v.parkedByPlayer
      );
      if (!rideVeh) {
        const sb = VEHICLE_STATS.HELI_TRANSPORT || { maxHp: 1750, speed: 68, maxSpeed: 82 };
        rideVeh = this.spawnVehicle({
          id: `ride_heli_${team.toLowerCase()}_${Date.now()}`,
          name: isRU
            ? 'MI-8AMTSH AIRLIFT-1 SHUTTLE (8 SEATS • DOOR GUNS)'
            : 'UH-60M BLACK HAWK AIRLIFT-1 (8 SEATS • TWIN M134)',
          type: 'plane',
          isAircraft: true,
          isHelicopter: true,
          aircraftRole: 'heli_transport',
          team,
          spawnPos: new THREE.Vector3(isRU ? 1504 : -1504, 4, isRU ? 44 : -44),
          spawnYaw: isRU ? Math.PI / 2 : -Math.PI / 2,
          maxHp: sb.maxHp || 1750,
          speed: sb.speed || 68,
          minSpeed: 0,
          maxSpeed: sb.maxSpeed || 82,
          weaponType: 'heli_minigun',
          rpm: VEHICLE_STATS.RPM_HELI_MINIGUN || 2000,
          coaxRpm: 120,
          patrolPoints: [new THREE.Vector3(0, 95, 0)]
        });
      }
    } else {
      const wantType = mode === 'apc' ? 'apc' : mode === 'truck' ? 'truck_transport' : 'humvee';
      rideVeh = this.vehicles.find(
        (v) =>
          v &&
          !v.dead &&
          !v.isAircraft &&
          !v.isEmplacement &&
          v.team === team &&
          (v.type === wantType || (wantType === 'humvee' && v.type === 'car')) &&
          !v.driver &&
          !v.remoteDriverId
      );
      if (rideVeh && rideVeh.npcDriver) {
        rideVeh.npcDriver.drivingVehicle = null;
        rideVeh.npcDriver = null;
      }
      if (!rideVeh) {
        const statBlock =
          wantType === 'apc'
            ? VEHICLE_STATS.APC || { maxHp: 1450, speed: 21 }
            : wantType === 'truck_transport'
            ? VEHICLE_STATS.TRUCK_TRANSPORT || { maxHp: 1050, speed: 22 }
            : VEHICLE_STATS.HUMVEE || { maxHp: 850, speed: 26 };
        const nameStr =
          wantType === 'apc'
            ? isRU
              ? 'BTR-82A ARMORED TRANSPORT (8 SEATS • 30MM)'
              : 'LAV-25A2 ARMORED TRANSPORT (8 SEATS • 25MM)'
            : wantType === 'truck_transport'
            ? isRU
              ? 'KAMAZ-5350 6×6 TROOP & AMMO SHUTTLE'
              : 'M1083A1 6×6 TROOP & AMMO SHUTTLE'
            : isRU
            ? 'GAZ TIGR SCOUT TRANSPORT (.50 HMG)'
            : 'M1151 HUMVEE SCOUT TRANSPORT (.50 HMG)';
        rideVeh = this.spawnVehicle({
          id: `ride_${mode}_${team.toLowerCase()}_${Date.now()}`,
          name: nameStr,
          type: wantType === 'humvee' ? 'humvee' : wantType,
          isLogisticsTruck: wantType === 'truck_transport',
          team,
          spawnPos: new THREE.Vector3(isRU ? 1480 : -1480, 4, 24),
          spawnYaw: isRU ? Math.PI / 2 : -Math.PI / 2,
          maxHp: statBlock.maxHp,
          speed: statBlock.speed,
          weaponType: wantType === 'apc' ? 'autocannon' : 'hmg',
          rpm: wantType === 'apc' ? 330 : 600,
          coaxRpm: 650,
          patrolPoints: [new THREE.Vector3(0, 0, 0)]
        });
      }
    }

    // 3. Compute safe Pickup LZ & position inbound shuttle ~55m–85m out if it was far away at HQ (~4–6s realistic arrival!)
    let pickupPos;
    const approachAngle = team === 'RU' ? 0.25 : Math.PI - 0.25;
    if (mode === 'heli') {
      const supY = this.getAircraftSupportHeightAt(player.pos.x, player.pos.z, player.pos.y + 8, true);
      // Offset 4.5m on flat ground, or hover directly over/beside player on narrow high-rise roofs!
      const offDist = playerOnHighRoof ? 3.2 : 5.5;
      const px = player.pos.x + Math.cos(approachAngle) * offDist;
      const pz = player.pos.z + Math.sin(approachAngle) * offDist;
      const padSupY = this.getAircraftSupportHeightAt(px, pz, supY + 6, true);
      const finalPx = Math.abs(padSupY - supY) <= 1.8 ? px : player.pos.x;
      const finalPz = Math.abs(padSupY - supY) <= 1.8 ? pz : player.pos.z;
      const finalPy = Math.abs(padSupY - supY) <= 1.8 ? padSupY : supY + 2.6;
      pickupPos = new THREE.Vector3(finalPx, finalPy, finalPz);

      if (rideVeh.pos.distanceTo(pickupPos) > 145) {
        const sx = THREE.MathUtils.clamp(pickupPos.x + (isRU ? 82 : -82), -2400, 2400);
        const sz = THREE.MathUtils.clamp(pickupPos.z + 28, -1600, 1600);
        const sgY = this.getAircraftSupportHeightAt(sx, sz, 175, false);
        rideVeh.pos.set(sx, Math.max(pickupPos.y + 26, sgY + 34), sz);
        rideVeh.yaw = Math.atan2(-(pickupPos.x - sx), -(pickupPos.z - sz));
        rideVeh.pitch = -0.14;
        rideVeh.roll = 0;
        rideVeh._heliVelX = -Math.sin(rideVeh.yaw) * 22;
        rideVeh._heliVelY = -2.0;
        rideVeh._heliVelZ = -Math.cos(rideVeh.yaw) * 22;
        rideVeh.forwardSpeed = 22;
        rideVeh.mesh.position.copy(rideVeh.pos);
      }
      rideVeh.heliHoverHold = false;
      rideVeh.aiPilotActive = false;
    } else {
      const rawPx = player.pos.x + Math.cos(approachAngle) * 6.5;
      const rawPz = player.pos.z + Math.sin(approachAngle) * 6.5;
      const safeP = this.world?.pushOutOfBuildingFootprint
        ? this.world.pushOutOfBuildingFootprint(rawPx, rawPz, 4.5)
        : { x: rawPx, z: rawPz };
      const pGy = this.world ? this.world.getGroundHeightAt(safeP.x, safeP.z) : 0;
      pickupPos = new THREE.Vector3(safeP.x, pGy, safeP.z);

      if (rideVeh.pos.distanceTo(pickupPos) > 110) {
        const rawSx = THREE.MathUtils.clamp(pickupPos.x + (isRU ? 48 : -48), -2400, 2400);
        const rawSz = THREE.MathUtils.clamp(pickupPos.z + 18, -1600, 1600);
        const safeS = this.world?.pushOutOfBuildingFootprint
          ? this.world.pushOutOfBuildingFootprint(rawSx, rawSz, 4.8)
          : { x: rawSx, z: rawSz };
        const sGy = this.world ? this.world.getGroundHeightAt(safeS.x, safeS.z) : 0;
        rideVeh.pos.set(safeS.x, sGy, safeS.z);
        rideVeh.yaw = Math.atan2(-(pickupPos.x - safeS.x), -(pickupPos.z - safeS.z));
        rideVeh.forwardSpeed = 12;
        rideVeh.mesh.position.copy(rideVeh.pos);
      }
    }

    rideVeh.hp = Math.max(rideVeh.hp || rideVeh.maxHp, rideVeh.maxHp * 0.85);
    rideVeh.dead = false;
    rideVeh.isShotDown = false;
    rideVeh.claimedByPlayer = true;
    rideVeh.claimedByPlayerTimer = 90.0;
    rideVeh.mesh.visible = true;
    rideVeh.rideTask = {
      active: true,
      transportMode: mode,
      phase: 'APPROACHING_PICKUP',
      pickupPos,
      destPos: dest.pos ? dest.pos.clone() : null,
      destLabel: dest.label,
      destIsRoof: Boolean(dest.isRoof),
      destPending: Boolean(dest.pending),
      _consumedPingRef: opts._consumedPingRef || player.activePing || null,
      playerOnRoofPickup: playerOnHighRoof,
      pickupAnnounced: false,
      arrivedAnnounced: false,
      departDelay: 0,
      liftoffClearY: pickupPos.y + 16
    };
    player.activeRideVehicle = rideVeh;

    sound.playRadioBeep?.(true);
    const modeTitle =
      mode === 'heli'
        ? '🚁 AIRLIFT-1 (BLACK HAWK / MI-8)'
        : mode === 'apc'
        ? '🛡️ ARMOR TAXI (8×8 APC)'
        : mode === 'truck'
        ? '🚚 LOGISTICS CONVOY (6×6 TRUCK)'
        : '🚙 RECON SHUTTLE (HUMVEE)';
    const roofNote =
      playerOnHighRoof && mode !== 'heli'
        ? ' — PICKUP AT STREET BASE BELOW YOUR BUILDING!'
        : '';
    player.onAwardXp?.(
      0,
      dest.pending
        ? `${modeTitle} INBOUND TO YOUR POSITION${roofNote}! (PRESS [E] TO BOARD • PRESS [${rideHk}] NOW OR LATER TO SET DROP-OFF!)`
        : `${modeTitle} INBOUND FOR PICKUP → DEST: ${dest.label}${roofNote} (PRESS [E] WHEN IT ARRIVES!)`
    );

    return { ok: true, vehicle: rideVeh, dest, pickupPos, transportMode: mode };
  }

  /**
   * Smooth Newtonian Rotorcraft AI Pilot for Player Airlift Requests (`APPROACHING_PICKUP` ->
   * `HOLDING_FOR_PICKUP` -> `EN_ROUTE_TO_DEST` -> `ARRIVED_AT_DEST` -> `RTB_DEPART`).
   */
  stepAiHeliRide(v, dt, player) {
    const task = v.rideTask;
    if (!task || !task.active) return;

    if (typeof v._heliVelX !== 'number') v._heliVelX = 0;
    if (typeof v._heliVelY !== 'number') v._heliVelY = 0;
    if (typeof v._heliVelZ !== 'number') v._heliVelZ = 0;

    // Keep pickup LZ gently tracking player if they shift slightly on the rooftop/pad while waiting
    if (
      (task.phase === 'APPROACHING_PICKUP' || task.phase === 'HOLDING_FOR_PICKUP') &&
      player &&
      !player.dead &&
      !player.activeVehicle
    ) {
      const pSupY = this.getAircraftSupportHeightAt(player.pos.x, player.pos.z, player.pos.y + 6, true);
      if (Math.hypot(player.pos.x - task.pickupPos.x, player.pos.z - task.pickupPos.z) < 26) {
        const dxKeep = task.pickupPos.x - player.pos.x;
        const dzKeep = task.pickupPos.z - player.pos.z;
        const dKeep = Math.hypot(dxKeep, dzKeep);
        if (dKeep > 6.5) {
          task.pickupPos.x = player.pos.x + (dxKeep / dKeep) * 4.5;
          task.pickupPos.z = player.pos.z + (dzKeep / dKeep) * 4.5;
          const candSup = this.getAircraftSupportHeightAt(task.pickupPos.x, task.pickupPos.z, pSupY + 5, true);
          task.pickupPos.y = Math.abs(candSup - pSupY) <= 1.8 ? candSup : pSupY + 2.4;
        }
      }
    }

    if (task.phase === 'RTB_DEPART') {
      task.departDelay = Math.max(0, (task.departDelay || 0) - dt);
      const curSupY = this.getAircraftSupportHeightAt(v.pos.x, v.pos.z, v.pos.y + 4, true);
      if (task.departDelay > 0) {
        v._heliVelX *= Math.pow(0.08, dt);
        v._heliVelZ *= Math.pow(0.08, dt);
        v._heliVelY = 0;
        v.pos.y = Math.max(curSupY, v.pos.y);
        v.pitch = THREE.MathUtils.lerp(v.pitch || 0, 0, Math.min(1, dt * 4));
        v.roll = THREE.MathUtils.lerp(v.roll || 0, 0, Math.min(1, dt * 4));
        return;
      }
      // Climb +45m clear of skyscrapers and return toward friendly HQ helipad
      const rtbX = v.team === 'RU' ? 1504 : -1504;
      const rtbZ = v.team === 'RU' ? 44 : -44;
      const dxR = rtbX - v.pos.x;
      const dzR = rtbZ - v.pos.z;
      const distR = Math.hypot(dxR, dzR);
      if (distR < 35) {
        task.active = false;
        v.pos.set(rtbX, this.world ? this.world.getGroundHeightAt(rtbX, rtbZ) : 0, rtbZ);
        v._heliVelX = 0;
        v._heliVelY = 0;
        v._heliVelZ = 0;
        v.forwardSpeed = 0;
        v.pitch = 0;
        v.roll = 0;
        if (player && player.activeRideVehicle === v) player.activeRideVehicle = null;
        return;
      }
      const desYaw = Math.atan2(-dxR, -dzR);
      let yErr = desYaw - (v.yaw || 0);
      while (yErr > Math.PI) yErr -= Math.PI * 2;
      while (yErr < -Math.PI) yErr += Math.PI * 2;
      v.yaw = (v.yaw || 0) + THREE.MathUtils.clamp(yErr * 1.5, -1.1, 1.1) * dt;
      v.pitch = THREE.MathUtils.lerp(v.pitch || 0, -0.22, Math.min(1, dt * 2.5));
      v.roll = THREE.MathUtils.lerp(v.roll || 0, THREE.MathUtils.clamp(yErr * 0.5, -0.35, 0.35), Math.min(1, dt * 3));
      const spd = 48;
      v._heliVelX = THREE.MathUtils.lerp(v._heliVelX, -Math.sin(v.yaw) * spd, Math.min(1, dt * 1.8));
      v._heliVelZ = THREE.MathUtils.lerp(v._heliVelZ, -Math.cos(v.yaw) * spd, Math.min(1, dt * 1.8));
      v._heliVelY = THREE.MathUtils.clamp((Math.max(curSupY + 38, 95) - v.pos.y) * 1.4, -5, 8.5);
      v.pos.x += v._heliVelX * dt;
      v.pos.y += v._heliVelY * dt;
      v.pos.z += v._heliVelZ * dt;
      v.forwardSpeed = Math.hypot(v._heliVelX, v._heliVelZ);
      return;
    }

    // Player boarded before designating a drop-off (`[Alt+R]`): hold a steady ready-hover right above the pad!
    if (task.phase === 'AWAITING_DEST' || ((task.phase === 'EN_ROUTE_TO_DEST' || task.phase === 'ARRIVED_AT_DEST') && !task.destPos)) {
      const holdSupY = this.getAircraftSupportHeightAt(v.pos.x, v.pos.z, v.pos.y + 6.0, true);
      const readyHoverY = holdSupY + 3.2;
      v._heliVelX *= Math.pow(0.06, dt);
      v._heliVelZ *= Math.pow(0.06, dt);
      v._heliVelY = THREE.MathUtils.lerp(
        v._heliVelY,
        THREE.MathUtils.clamp((readyHoverY - v.pos.y) * 2.0, -3.0, 5.5),
        Math.min(1, dt * 4.5)
      );
      v.pos.x += v._heliVelX * dt;
      v.pos.z += v._heliVelZ * dt;
      v.pos.y = Math.max(holdSupY, v.pos.y + v._heliVelY * dt);
      v.pitch = THREE.MathUtils.lerp(v.pitch || 0, 0, Math.min(1, dt * 4.0));
      v.roll = THREE.MathUtils.lerp(v.roll || 0, 0, Math.min(1, dt * 4.0));
      v.forwardSpeed = Math.hypot(v._heliVelX, v._heliVelZ);
      if (!v.velVector) v.velVector = new THREE.Vector3();
      v.velVector.set(v._heliVelX, v._heliVelY, v._heliVelZ);
      if (v.mesh?.userData) {
        v._rotorSpinSpeed = 29.0;
        const dRot = v._rotorSpinSpeed * dt;
        if (v.mesh.userData.mainRotorHub) v.mesh.userData.mainRotorHub.rotation.y += dRot;
        if (v.mesh.userData.coaxUpperRotorHub) v.mesh.userData.coaxUpperRotorHub.rotation.y -= dRot;
        if (v.mesh.userData.tailRotorHub) v.mesh.userData.tailRotorHub.rotation.x += dRot * 1.85;
      }
      return;
    }

    const isGoingToDest = task.phase === 'EN_ROUTE_TO_DEST' || task.phase === 'ARRIVED_AT_DEST';
    const targetLz = isGoingToDest ? task.destPos : task.pickupPos;
    const dx = targetLz.x - v.pos.x;
    const dz = targetLz.z - v.pos.z;
    const horizDist = Math.hypot(dx, dz);
    const lzSupportY = this.getAircraftSupportHeightAt(targetLz.x, targetLz.z, Math.max(targetLz.y, v.pos.y) + 8, true);
    const desiredTouchY = Math.max(targetLz.y, lzSupportY);

    // Check obstacle clearance immediately ahead so the helicopter climbs cleanly over Downtown skyscrapers!
    const lookAheadDist = Math.min(horizDist, 42);
    const dirX = horizDist > 0.5 ? dx / horizDist : -Math.sin(v.yaw || 0);
    const dirZ = horizDist > 0.5 ? dz / horizDist : -Math.cos(v.yaw || 0);
    const midObsY =
      horizDist > 14
        ? Math.max(
            this.getAircraftSupportHeightAt(v.pos.x, v.pos.z, 175, true),
            this.getAircraftSupportHeightAt(
              v.pos.x + dirX * lookAheadDist,
              v.pos.z + dirZ * lookAheadDist,
              175,
              false
            )
          )
        : desiredTouchY;

    // Initial vertical liftoff clearance when departing from a rooftop or enclosed courtyard
    const needInitialClimb =
      isGoingToDest &&
      horizDist > 18 &&
      v.pos.y < (task.liftoffClearY || desiredTouchY) - 2.0;

    // Smooth Cruise -> Approach Flare -> Vertical Cushion Touchdown Speed Profile
    const maxCruise = v.speed || 66;
    const desiredHorizSpd = needInitialClimb
      ? 4.0
      : horizDist > 120
      ? maxCruise
      : horizDist > 22
      ? THREE.MathUtils.lerp(8.5, maxCruise, (horizDist - 22) / 98)
      : horizDist > 0.35
      ? Math.max(0.85, horizDist * 0.55)
      : 0;

    if (horizDist > 2.0) {
      const desYaw = Math.atan2(-dx, -dz);
      let yErr = desYaw - (v.yaw || 0);
      while (yErr > Math.PI) yErr -= Math.PI * 2;
      while (yErr < -Math.PI) yErr += Math.PI * 2;
      v.yaw = (v.yaw || 0) + THREE.MathUtils.clamp(yErr * 1.9, -1.25, 1.25) * dt;
      v.roll = THREE.MathUtils.lerp(
        v.roll || 0,
        THREE.MathUtils.clamp(yErr * 0.55, -0.38, 0.38),
        Math.min(1, dt * 3.5)
      );
    } else {
      v.roll = THREE.MathUtils.lerp(v.roll || 0, 0, Math.min(1, dt * 5.0));
    }

    const curHorizSpd = Math.hypot(v._heliVelX, v._heliVelZ);
    const desVx = horizDist > 0.4 ? dirX * desiredHorizSpd : 0;
    const desVz = horizDist > 0.4 ? dirZ * desiredHorizSpd : 0;
    const maxHorizAccel = curHorizSpd > desiredHorizSpd + 3 ? 13.5 : 10.5;
    const dvx = desVx - v._heliVelX;
    const dvz = desVz - v._heliVelZ;
    const dvLen = Math.hypot(dvx, dvz);
    if (dvLen > maxHorizAccel * dt && dvLen > 0.001) {
      v._heliVelX += (dvx / dvLen) * maxHorizAccel * dt;
      v._heliVelZ += (dvz / dvLen) * maxHorizAccel * dt;
    } else {
      v._heliVelX = desVx;
      v._heliVelZ = desVz;
    }

    // Realistic visual cyclic nose pitch: tilts nose down when accelerating/cruising, flares nose UP when braking into LZ!
    const isFlareBraking = horizDist < 90 && curHorizSpd > desiredHorizSpd + 2.2;
    const targetPitch =
      horizDist <= 3.0 && curHorizSpd < 2.0
        ? 0
        : isFlareBraking
        ? THREE.MathUtils.clamp((curHorizSpd - desiredHorizSpd) * 0.032, 0.08, 0.34)
        : -THREE.MathUtils.clamp((desiredHorizSpd / Math.max(30, maxCruise)) * 0.32, 0, 0.34);
    v.pitch = THREE.MathUtils.lerp(v.pitch || 0, targetPitch, Math.min(1, dt * 3.6));

    // Altitude profile: clear obstacles en route, then descend smoothly onto rooftop / ground pad
    const safeCruiseY = Math.max(midObsY + 18, desiredTouchY + 22, 58);
    const targetAlt = needInitialClimb
      ? Math.max(task.liftoffClearY, midObsY + 14)
      : horizDist > 55
      ? safeCruiseY
      : horizDist > 10
      ? THREE.MathUtils.lerp(desiredTouchY + 3.2, safeCruiseY, (horizDist - 10) / 45)
      : desiredTouchY;

    const altErr = targetAlt - v.pos.y;
    const maxClimb = 11.2;
    const maxSink = horizDist < 12 && Math.abs(altErr) < 6 ? 2.4 : 7.5;
    const desVy = THREE.MathUtils.clamp(altErr * 1.85, -maxSink, maxClimb);
    v._heliVelY = THREE.MathUtils.lerp(v._heliVelY, desVy, Math.min(1, dt * 4.2));

    v.pos.x = THREE.MathUtils.clamp(v.pos.x + v._heliVelX * dt, -2400, 2400);
    v.pos.z = THREE.MathUtils.clamp(v.pos.z + v._heliVelZ * dt, -1650, 1650);
    const curSupportY = this.getAircraftSupportHeightAt(v.pos.x, v.pos.z, v.pos.y + 4.0, true);
    v.pos.y = Math.max(curSupportY, v.pos.y + v._heliVelY * dt);
    if (v.pos.y <= curSupportY + 0.04 && targetAlt <= curSupportY + 0.25) {
      v.pos.y = curSupportY;
      v._heliVelY = 0;
    }
    v.forwardSpeed = Math.hypot(v._heliVelX, v._heliVelZ);
    if (!v.velVector) v.velVector = new THREE.Vector3();
    v.velVector.set(v._heliVelX, v._heliVelY, v._heliVelZ);

    // Spin 3D Main & Tail Rotors
    if (v.mesh?.userData) {
      v._rotorSpinSpeed = 29.0;
      const dRot = v._rotorSpinSpeed * dt;
      if (v.mesh.userData.mainRotorHub) v.mesh.userData.mainRotorHub.rotation.y += dRot;
      if (v.mesh.userData.coaxUpperRotorHub) v.mesh.userData.coaxUpperRotorHub.rotation.y -= dRot;
      if (v.mesh.userData.tailRotorHub) v.mesh.userData.tailRotorHub.rotation.x += dRot * 1.85;
    }

    // Phase Arrival Checks & Radio Callouts
    const vertDist = Math.abs(v.pos.y - desiredTouchY);
    if (!isGoingToDest && horizDist <= 5.5 && vertDist <= 4.5) {
      task.phase = 'HOLDING_FOR_PICKUP';
      if (!task.pickupAnnounced) {
        task.pickupAnnounced = true;
        sound.playRadioBeep?.(true);
        player?.onAwardXp?.(
          0,
          `🚁 AIRLIFT-1 ON STATION! WALK UP & PRESS [E] TO BOARD FOR ${task.destLabel}!`
        );
      }
    } else if (isGoingToDest && horizDist <= 3.2 && vertDist <= 1.8 && v.forwardSpeed < 2.5) {
      task.phase = 'ARRIVED_AT_DEST';
      v._heliVelX = 0;
      v._heliVelZ = 0;
      v.forwardSpeed = 0;
      v.pitch = 0;
      v.roll = 0;
      if (!task.arrivedAnnounced) {
        task.arrivedAnnounced = true;
        sound.playRadioBeep?.(true);
        player?.onAwardXp?.(
          25,
          `🚁🎯 AIRLIFT TOUCHDOWN AT ${task.destLabel}! PRESS [E] TO STEP OUT ON ROOF/LZ (OR [K] FOR NEXT LZ)!`
        );
      }
    }
  }

  /**
   * Bridge-aware & Building-avoiding AI Ground Chauffeur for Armored APC, 6x6 Supply Truck & Humvee Rides!
   */
  stepAiGroundRide(v, dt, player) {
    const task = v.rideTask;
    if (!task || !task.active) return;

    if (task.phase === 'RTB_DEPART') {
      task.departDelay = Math.max(0, (task.departDelay || 0) - dt);
      v.forwardSpeed = 0;
      if (task.departDelay <= 0) {
        task.active = false;
        if (player && player.activeRideVehicle === v) player.activeRideVehicle = null;
      }
      return;
    }

    if (task.phase === 'AWAITING_DEST' || ((task.phase === 'EN_ROUTE_TO_DEST' || task.phase === 'ARRIVED_AT_DEST') && !task.destPos)) {
      v.forwardSpeed = 0;
      const gY = this.world ? this.world.getGroundHeightAt(v.pos.x, v.pos.z) : v.pos.y;
      v.pos.y = gY;
      return;
    }

    const isGoingToDest = task.phase === 'EN_ROUTE_TO_DEST' || task.phase === 'ARRIVED_AT_DEST';
    const rawGoal = isGoingToDest ? task.destPos : task.pickupPos;

    // Route cleanly across the nearest bridge if crossing the central river (`|x| < 34`)
    let targetX = rawGoal.x;
    let targetZ = rawGoal.z;
    if (Math.sign(v.pos.x) !== Math.sign(targetX) && Math.abs(v.pos.x) > 34) {
      const bridgeZ = Math.abs(v.pos.z) < 220 ? 0 : v.pos.z > 0 ? 400 : -400;
      if (Math.abs(v.pos.z - bridgeZ) > 26) {
        targetX = Math.sign(v.pos.x) * 42;
        targetZ = bridgeZ;
      }
    }

    const dx = targetX - v.pos.x;
    const dz = targetZ - v.pos.z;
    const dist = Math.hypot(dx, dz);
    const goalDist = Math.hypot(rawGoal.x - v.pos.x, rawGoal.z - v.pos.z);
    const stopRadius = isGoingToDest ? 7.5 : 6.5;

    if (goalDist <= stopRadius) {
      const brakeStep = 14.0 * dt;
      v.forwardSpeed =
        Math.abs(v.forwardSpeed || 0) <= brakeStep
          ? 0
          : v.forwardSpeed - Math.sign(v.forwardSpeed) * brakeStep;
      if (Math.abs(v.forwardSpeed) < 0.4) {
        v.forwardSpeed = 0;
        if (!isGoingToDest) {
          task.phase = 'HOLDING_FOR_PICKUP';
          if (!task.pickupAnnounced) {
            task.pickupAnnounced = true;
            sound.playRadioBeep?.(true);
            player?.onAwardXp?.(
              0,
              `🛡️ TRANSPORT READY FOR PICKUP! PRESS [E] TO BOARD FOR ${task.destLabel}!`
            );
          }
        } else {
          task.phase = 'ARRIVED_AT_DEST';
          if (!task.arrivedAnnounced) {
            task.arrivedAnnounced = true;
            sound.playRadioBeep?.(true);
            player?.onAwardXp?.(
              25,
              `🛡️🎯 ARRIVED AT ${task.destLabel}! PRESS [E] TO DISEMBARK (OR [K] TO PICK NEXT LZ)!`
            );
          }
        }
      }
    } else {
      let desiredYaw = Math.atan2(-dx, -dz);
      if (this.world?.isVehicleBoxBlocked) {
        const lookDist = (v.hullHalfLength || 3.2) + 7.0;
        const tx = v.pos.x - Math.sin(desiredYaw) * lookDist;
        const tz = v.pos.z - Math.cos(desiredYaw) * lookDist;
        if (this.world.isVehicleBoxBlocked(tx, tz, desiredYaw, v.hullHalfWidth || 1.75, 2.2, 1.0)) {
          for (const off of [0.55, -0.55, 1.05, -1.05, 1.5, -1.5]) {
            const ay = desiredYaw + off;
            const ax = v.pos.x - Math.sin(ay) * lookDist;
            const az = v.pos.z - Math.cos(ay) * lookDist;
            if (!this.world.isVehicleBoxBlocked(ax, az, ay, v.hullHalfWidth || 1.75, 2.2, 0.9)) {
              desiredYaw = ay;
              break;
            }
          }
        }
      }
      let yDiff = desiredYaw - (v.yaw || 0);
      while (yDiff > Math.PI) yDiff -= Math.PI * 2;
      while (yDiff < -Math.PI) yDiff += Math.PI * 2;
      const maxTurn = 1.65 * dt;
      v.yaw = (v.yaw || 0) + THREE.MathUtils.clamp(yDiff, -maxTurn, maxTurn);

      const topSpd = v.speed || 22;
      const desSpd =
        goalDist < 28
          ? THREE.MathUtils.lerp(5.5, topSpd, goalDist / 28)
          : Math.abs(yDiff) > 0.7
          ? topSpd * 0.52
          : topSpd;
      const curSpd = v.forwardSpeed || 0;
      const accelStep = (curSpd < desSpd ? 6.8 : 11.5) * dt;
      v.forwardSpeed =
        Math.abs(desSpd - curSpd) <= accelStep
          ? desSpd
          : curSpd + Math.sign(desSpd - curSpd) * accelStep;
    }

    // When unboarded (`!v.driver`), `VehicleManager.update` steps position below line 5209;
    // when player is onboard (`v.driver === player`), step hull position cleanly here!
    if (v.driver === player && Math.abs(v.forwardSpeed || 0) > 0.02) {
      const nextX = THREE.MathUtils.clamp(v.pos.x - Math.sin(v.yaw) * v.forwardSpeed * dt, -2550, 2550);
      const nextZ = THREE.MathUtils.clamp(v.pos.z - Math.cos(v.yaw) * v.forwardSpeed * dt, -1700, 1700);
      const safeNext = this.world?.pushOutOfBuildingFootprint
        ? this.world.pushOutOfBuildingFootprint(nextX, nextZ, (v.hullHalfWidth || 1.75) + 0.4)
        : { x: nextX, z: nextZ };
      v.pos.x = safeNext.x;
      v.pos.z = safeNext.z;
      v.pos.y = this.world ? this.world.getGroundHeightAt(v.pos.x, v.pos.z) : v.pos.y;
      v.mesh.position.copy(v.pos);
      v.mesh.rotation.set(v.pitch || 0, v.yaw || 0, v.roll || 0, 'YXZ');
    }
  }
}
