// =========================================================================
// VEHICLE DEFINITIONS (src/assets/vehicle-defs.js)
// Data-driven spawn configs for all 12 fleet vehicles.
// Positions stored as arrays [x, y, z] — y is computed at runtime via getGroundHeightAt.
// =========================================================================

import { VEHICLE_STATS } from '../config.js?v=148';

export const VEHICLE_DEFS = [
  // ===================== US FLEET (Open Motor Pool Apron aligned with 28m Main Gate at x = -904..-884, z = -10..+10) =====================
  {
    id: 'us_abrams_hq',
    name: 'M1A2 ABRAMS MBT (120MM + COAX + .50 CROWS)',
    type: 'tank',
    team: 'US',
    spawnPos: [-1456, 0, -5],
    spawnYaw: -Math.PI / 2,
    maxHp: VEHICLE_STATS.TANK.maxHp,
    speed: VEHICLE_STATS.TANK.speed,
    weaponType: 'tank_cannon',
    rpm: VEHICLE_STATS.RPM_TANK_US,
    coaxRpm: VEHICLE_STATS.RPM_COAX,
    patrolPoints: [
      [-620, 0, -28],
      [-380, 0, -42],
      [-185, 0, -32],
      [-55, 0, -14],
      [55, 0, -14]
    ]
  },
  {
    id: 'us_abrams_fwd_a',
    name: 'M1A2 ABRAMS SEP (120MM + COAX)',
    type: 'tank',
    team: 'US',
    spawnPos: [-1456, 0, 5],
    spawnYaw: -Math.PI / 2,
    maxHp: VEHICLE_STATS.TANK.maxHp,
    speed: VEHICLE_STATS.TANK.speed,
    weaponType: 'tank_cannon',
    rpm: VEHICLE_STATS.RPM_TANK_US,
    coaxRpm: VEHICLE_STATS.RPM_COAX,
    patrolPoints: [
      [-620, 0, -34],
      [-418, 0, -92],
      [-260, 0, -68],
      [-78, 0, -24]
    ]
  },
  {
    id: 'us_abrams_fwd_c',
    name: 'M1A2 ABRAMS TUSK (120MM + COAX)',
    type: 'tank',
    team: 'US',
    spawnPos: [-1472, 0, -10],
    spawnYaw: -Math.PI / 2,
    maxHp: VEHICLE_STATS.TANK.maxHp,
    speed: VEHICLE_STATS.TANK.speed,
    weaponType: 'tank_cannon',
    rpm: VEHICLE_STATS.RPM_TANK_US,
    coaxRpm: VEHICLE_STATS.RPM_COAX,
    patrolPoints: [
      [-620, 0, 28],
      [-370, 0, 36],
      [-185, 0, 92],
      [-55, 0, 16]
    ]
  },
  {
    id: 'us_lav25_hq',
    name: 'LAV-25 IFV (25MM M242 APDS-T + TOW-2B)',
    type: 'apc',
    team: 'US',
    spawnPos: [-1456, 0, 11],
    spawnYaw: -Math.PI / 2,
    maxHp: VEHICLE_STATS.APC.maxHp,
    speed: VEHICLE_STATS.APC.speed,
    weaponType: 'autocannon',
    rpm: VEHICLE_STATS.RPM_APC,
    coaxRpm: VEHICLE_STATS.RPM_COAX,
    patrolPoints: [
      [-620, 0, 34],
      [-365, 0, 42],
      [-180, 0, 96],
      [-54, 0, 28]
    ]
  },
  {
    id: 'us_lav_ad',
    name: 'LAV-AD AIR DEFENSE (25MM GAU-12 + STINGER SAM)',
    type: 'aa',
    team: 'US',
    spawnPos: [-1456, 0, -11],
    spawnYaw: -Math.PI / 2,
    maxHp: VEHICLE_STATS.AA_VEHICLE.maxHp,
    speed: VEHICLE_STATS.AA_VEHICLE.speed,
    weaponType: 'aa_autocannon',
    rpm: VEHICLE_STATS.RPM_AA_AUTOCANNON,
    coaxRpm: 45,
    patrolPoints: [
      [-618, 0, -32],
      [-380, 0, -34],
      [-185, 0, -24],
      [-68, 0, -8]
    ]
  },
  {
    id: 'us_humvee_hq',
    name: 'M1151 HUMVEE (.50 CAL)',
    type: 'humvee',
    team: 'US',
    spawnPos: [-1472, 0, 0],
    spawnYaw: -Math.PI / 2,
    maxHp: VEHICLE_STATS.HUMVEE.maxHp,
    speed: VEHICLE_STATS.HUMVEE.speed,
    weaponType: 'hmg',
    rpm: VEHICLE_STATS.RPM_HUMVEE,
    patrolPoints: [
      [-618, 0, 0],
      [-380, 0, -58],
      [-210, 0, -42],
      [-56, 0, 6]
    ]
  },
  {
    id: 'us_humvee_fwd',
    name: 'M1151 ASSAULT HUMVEE (.50 CAL)',
    type: 'humvee',
    team: 'US',
    spawnPos: [-1472, 0, 10],
    spawnYaw: -Math.PI / 2,
    maxHp: VEHICLE_STATS.HUMVEE.maxHp,
    speed: VEHICLE_STATS.HUMVEE.speed,
    weaponType: 'hmg',
    rpm: VEHICLE_STATS.RPM_HUMVEE,
    patrolPoints: [
      [-620, 0, 28],
      [-375, 0, 34],
      [-185, 0, 96],
      [-56, 0, 32]
    ]
  },

  // ===================== RU FLEET (Open Motor Pool Apron aligned with 28m Main Gate at x = +884..+904, z = -10..+10) =====================
  {
    id: 'ru_t90_hq',
    name: 'T-90M PRORYV MBT (125MM + COAX + 12.7 KORD)',
    type: 'tank',
    team: 'RU',
    spawnPos: [1456, 0, 5],
    spawnYaw: Math.PI / 2,
    maxHp: VEHICLE_STATS.TANK.maxHp,
    speed: VEHICLE_STATS.TANK.speed,
    weaponType: 'tank_cannon',
    rpm: VEHICLE_STATS.RPM_TANK_RU,
    coaxRpm: VEHICLE_STATS.RPM_COAX,
    patrolPoints: [
      [620, 0, 28],
      [380, 0, 42],
      [195, 0, 32],
      [55, 0, 14],
      [-55, 0, 14]
    ]
  },
  {
    id: 'ru_t90_fwd_c',
    name: 'T-90M GUARD MBT (125MM + COAX)',
    type: 'tank',
    team: 'RU',
    spawnPos: [1456, 0, -5],
    spawnYaw: Math.PI / 2,
    maxHp: VEHICLE_STATS.TANK.maxHp,
    speed: VEHICLE_STATS.TANK.speed,
    weaponType: 'tank_cannon',
    rpm: VEHICLE_STATS.RPM_TANK_RU,
    coaxRpm: VEHICLE_STATS.RPM_COAX,
    patrolPoints: [
      [620, 0, -28],
      [370, 0, -36],
      [195, 0, -92],
      [55, 0, -16]
    ]
  },
  {
    id: 'ru_t90_fwd_a',
    name: 'T-90M ASSAULT MBT (125MM + COAX)',
    type: 'tank',
    team: 'RU',
    spawnPos: [1472, 0, 10],
    spawnYaw: Math.PI / 2,
    maxHp: VEHICLE_STATS.TANK.maxHp,
    speed: VEHICLE_STATS.TANK.speed,
    weaponType: 'tank_cannon',
    rpm: VEHICLE_STATS.RPM_TANK_RU,
    coaxRpm: VEHICLE_STATS.RPM_COAX,
    patrolPoints: [
      [620, 0, 34],
      [418, 0, 82],
      [260, 0, 68],
      [58, 0, 16]
    ]
  },
  {
    id: 'ru_btr82_hq',
    name: 'BTR-82A APC (30MM 2A72 APDS-T + KORNET)',
    type: 'apc',
    team: 'RU',
    spawnPos: [1456, 0, -11],
    spawnYaw: Math.PI / 2,
    maxHp: VEHICLE_STATS.APC.maxHp,
    speed: VEHICLE_STATS.APC.speed,
    weaponType: 'autocannon',
    rpm: VEHICLE_STATS.RPM_APC,
    coaxRpm: VEHICLE_STATS.RPM_COAX,
    patrolPoints: [
      [620, 0, -34],
      [365, 0, -42],
      [190, 0, -96],
      [54, 0, -28]
    ]
  },
  {
    id: 'ru_tunguska',
    name: '2K22 TUNGUSKA-M1 SPAAG (TWIN 30MM + 9M311 SAM)',
    type: 'aa',
    team: 'RU',
    spawnPos: [1456, 0, 11],
    spawnYaw: Math.PI / 2,
    maxHp: VEHICLE_STATS.AA_VEHICLE.maxHp,
    speed: VEHICLE_STATS.AA_VEHICLE.speed,
    weaponType: 'aa_autocannon',
    rpm: VEHICLE_STATS.RPM_AA_AUTOCANNON,
    coaxRpm: 45,
    patrolPoints: [
      [618, 0, 32],
      [380, 0, 34],
      [195, 0, 24],
      [68, 0, 8]
    ]
  },
  {
    id: 'ru_tigr_hq',
    name: 'GAZ TIGR (.50 CAL)',
    type: 'humvee',
    team: 'RU',
    spawnPos: [1472, 0, 0],
    spawnYaw: Math.PI / 2,
    maxHp: VEHICLE_STATS.HUMVEE.maxHp,
    speed: VEHICLE_STATS.HUMVEE.speed,
    weaponType: 'hmg',
    rpm: VEHICLE_STATS.RPM_HUMVEE,
    patrolPoints: [
      [618, 0, 0],
      [380, 0, 58],
      [210, 0, 42],
      [56, 0, -6]
    ]
  },
  {
    id: 'ru_tigr_fwd',
    name: 'GAZ TIGR ASSAULT (.50 CAL)',
    type: 'humvee',
    team: 'RU',
    spawnPos: [1472, 0, -10],
    spawnYaw: Math.PI / 2,
    maxHp: VEHICLE_STATS.HUMVEE.maxHp,
    speed: VEHICLE_STATS.HUMVEE.speed,
    weaponType: 'hmg',
    rpm: VEHICLE_STATS.RPM_HUMVEE,
    patrolPoints: [
      [620, 0, -28],
      [375, 0, -34],
      [195, 0, -96],
      [56, 0, -32]
    ]
  },
  // ===================== HQ MOTOR POOL RECON BIKES & 4×4 QUAD ATVS ($0 FREE AT MAIN BASE) =====================
  {
    id: 'us_hq_bike',
    name: 'M1030M1 USMC MILITARY RECON ENDURO',
    type: 'bike',
    isBike: true,
    isWarehouseBike: true,
    bikeSubType: 'twostroke_250cc',
    cc: 250,
    team: 'US',
    spawnPos: [-1484, 0, -6],
    spawnYaw: -Math.PI / 2,
    maxHp: VEHICLE_STATS.BIKE_250CC_2T.maxHp,
    speed: VEHICLE_STATS.BIKE_250CC_2T.speed,
    weaponType: 'moto_pdw',
    rpm: 750,
    patrolPoints: [[-620, 0, -18]]
  },
  {
    id: 'us_hq_atv',
    name: 'POLARIS MV850 TACTICAL 4×4 QUAD ATV',
    type: 'atv',
    isAtv: true,
    isWarehouseBike: true,
    bikeSubType: 'atv_quad',
    cc: 850,
    team: 'US',
    spawnPos: [-1484, 0, 6],
    spawnYaw: -Math.PI / 2,
    maxHp: VEHICLE_STATS.ATV_QUAD.maxHp,
    speed: VEHICLE_STATS.ATV_QUAD.speed,
    weaponType: 'moto_pdw',
    rpm: 750,
    patrolPoints: [[-620, 0, 18]]
  },
  {
    id: 'ru_hq_bike',
    name: 'M1030M1 RECON ENDURO MOTORCYCLE',
    type: 'bike',
    isBike: true,
    isWarehouseBike: true,
    bikeSubType: 'twostroke_250cc',
    cc: 250,
    team: 'RU',
    spawnPos: [1484, 0, 6],
    spawnYaw: Math.PI / 2,
    maxHp: VEHICLE_STATS.BIKE_250CC_2T.maxHp,
    speed: VEHICLE_STATS.BIKE_250CC_2T.speed,
    weaponType: 'moto_pdw',
    rpm: 750,
    patrolPoints: [[620, 0, 18]]
  },
  {
    id: 'ru_hq_atv',
    name: 'RM-800 TACTICAL 4×4 QUAD ATV',
    type: 'atv',
    isAtv: true,
    isWarehouseBike: true,
    bikeSubType: 'atv_quad',
    cc: 850,
    team: 'RU',
    spawnPos: [1484, 0, -6],
    spawnYaw: Math.PI / 2,
    maxHp: VEHICLE_STATS.ATV_QUAD.maxHp,
    speed: VEHICLE_STATS.ATV_QUAD.speed,
    weaponType: 'moto_pdw',
    rpm: 750,
    patrolPoints: [[620, 0, -18]]
  },

  // ===================== 6×6 TROOP TRANSPORT & LOGISTICS CONVOY TRUCKS (10 SEATS + MOBILE RESUPPLY • $0 FREE AT HQ) =====================
  {
    id: 'us_truck_1',
    name: 'M1083A1 MTV 6×6 TROOP & LOGISTICS TRUCK (10 SEATS + RESUPPLY)',
    type: 'truck_transport',
    isLogisticsTruck: true,
    team: 'US',
    spawnPos: [-1490, 0, -18],
    spawnYaw: -Math.PI / 2,
    maxHp: VEHICLE_STATS.TRUCK_TRANSPORT.maxHp,
    speed: VEHICLE_STATS.TRUCK_TRANSPORT.speed,
    weaponType: 'hmg',
    rpm: 650,
    patrolPoints: [
      [-660, 0, -245],
      [-320, 0, 285],
      [-58, 0, 0]
    ]
  },
  {
    id: 'us_truck_2',
    name: 'M1083A1 MTV 6×6 ASSAULT TRANSPORT TRUCK (10 SEATS + RESUPPLY)',
    type: 'truck_transport',
    isLogisticsTruck: true,
    team: 'US',
    spawnPos: [-1490, 0, 18],
    spawnYaw: -Math.PI / 2,
    maxHp: VEHICLE_STATS.TRUCK_TRANSPORT.maxHp,
    speed: VEHICLE_STATS.TRUCK_TRANSPORT.speed,
    weaponType: 'hmg',
    rpm: 650,
    patrolPoints: [
      [-620, 0, 16],
      [-320, 0, 290],
      [-62, 0, 4]
    ]
  },
  {
    id: 'ru_truck_1',
    name: 'KAMAZ-5350 MUSTANG 6×6 TROOP & LOGISTICS TRUCK (10 SEATS + RESUPPLY)',
    type: 'truck_transport',
    isLogisticsTruck: true,
    team: 'RU',
    spawnPos: [1490, 0, 18],
    spawnYaw: Math.PI / 2,
    maxHp: VEHICLE_STATS.TRUCK_TRANSPORT.maxHp,
    speed: VEHICLE_STATS.TRUCK_TRANSPORT.speed,
    weaponType: 'hmg',
    rpm: 650,
    patrolPoints: [
      [660, 0, 245],
      [330, 0, -285],
      [58, 0, 0]
    ]
  },
  {
    id: 'ru_truck_2',
    name: 'URAL-4320 6×6 ASSAULT TRANSPORT TRUCK (10 SEATS + RESUPPLY)',
    type: 'truck_transport',
    isLogisticsTruck: true,
    team: 'RU',
    spawnPos: [1490, 0, -18],
    spawnYaw: Math.PI / 2,
    maxHp: VEHICLE_STATS.TRUCK_TRANSPORT.maxHp,
    speed: VEHICLE_STATS.TRUCK_TRANSPORT.speed,
    weaponType: 'hmg',
    rpm: 650,
    patrolPoints: [
      [620, 0, -16],
      [330, 0, -290],
      [62, 0, -4]
    ]
  },

  // ===================== MAIN BASE HQ ROTORCRAFT HELIPADS (TRANSPORT BLACK HAWK / MI-8 + ATTACK APACHE / KA-52) =====================
  {
    id: 'us_uh60_transport',
    name: 'UH-60M BLACK HAWK ASSAULT TRANSPORT (8 SEATS • TWIN M134 MINIGUNS)',
    type: 'plane',
    isAircraft: true,
    isHelicopter: true,
    aircraftRole: 'heli_transport',
    team: 'US',
    spawnPos: [-1504, 0, -44],
    spawnYaw: -Math.PI / 2,
    maxHp: VEHICLE_STATS.HELI_TRANSPORT.maxHp,
    speed: VEHICLE_STATS.HELI_TRANSPORT.speed,
    minSpeed: 0,
    maxSpeed: VEHICLE_STATS.HELI_TRANSPORT.maxSpeed,
    climbRateMs: VEHICLE_STATS.HELI_TRANSPORT.climbRateMs,
    maxFwdTiltRad: VEHICLE_STATS.HELI_TRANSPORT.maxFwdTiltRad,
    yawAuthorityMult: VEHICLE_STATS.HELI_TRANSPORT.yawAuthorityMult,
    rollAgilityMult: VEHICLE_STATS.HELI_TRANSPORT.rollAgilityMult,
    massTonnes: VEHICLE_STATS.HELI_TRANSPORT.massTonnes,
    weaponType: 'heli_minigun',
    rpm: VEHICLE_STATS.RPM_HELI_MINIGUN,
    coaxRpm: 180,
    patrolPoints: [
      [-660, 68, -280],
      [-52, 58, 0],
      [-320, 65, 320]
    ]
  },
  {
    id: 'us_ah64_apache',
    name: 'AH-64E APACHE LONGBOW ATTACK HELI (30MM M230 + HYDRA + 8× HELLFIRE ATGM)',
    type: 'plane',
    isAircraft: true,
    isHelicopter: true,
    aircraftRole: 'heli_attack',
    team: 'US',
    spawnPos: [-1504, 0, 44],
    spawnYaw: -Math.PI / 2,
    maxHp: VEHICLE_STATS.HELI_ATTACK.maxHp,
    speed: VEHICLE_STATS.HELI_ATTACK.speed,
    minSpeed: 0,
    maxSpeed: VEHICLE_STATS.HELI_ATTACK.maxSpeed,
    climbRateMs: VEHICLE_STATS.HELI_ATTACK.climbRateMs,
    maxFwdTiltRad: VEHICLE_STATS.HELI_ATTACK.maxFwdTiltRad,
    yawAuthorityMult: VEHICLE_STATS.HELI_ATTACK.yawAuthorityMult,
    rollAgilityMult: VEHICLE_STATS.HELI_ATTACK.rollAgilityMult,
    massTonnes: VEHICLE_STATS.HELI_ATTACK.massTonnes,
    weaponType: 'heli_attack',
    rpm: VEHICLE_STATS.RPM_HELI_30MM,
    coaxRpm: 210,
    patrolPoints: [
      [-480, 74, -220],
      [0, 72, -120],
      [-280, 75, 260],
      [180, 74, 120]
    ]
  },
  {
    id: 'ru_mi8_transport',
    name: 'MI-8AMTSH TERMINATOR TRANSPORT HELI (8 SEATS • PKT DOOR GUNS + S-8)',
    type: 'plane',
    isAircraft: true,
    isHelicopter: true,
    aircraftRole: 'heli_transport',
    team: 'RU',
    spawnPos: [1504, 0, 44],
    spawnYaw: Math.PI / 2,
    maxHp: VEHICLE_STATS.HELI_MI8.maxHp,
    speed: VEHICLE_STATS.HELI_MI8.speed,
    minSpeed: 0,
    maxSpeed: VEHICLE_STATS.HELI_MI8.maxSpeed,
    climbRateMs: VEHICLE_STATS.HELI_MI8.climbRateMs,
    maxFwdTiltRad: VEHICLE_STATS.HELI_MI8.maxFwdTiltRad,
    yawAuthorityMult: VEHICLE_STATS.HELI_MI8.yawAuthorityMult,
    rollAgilityMult: VEHICLE_STATS.HELI_MI8.rollAgilityMult,
    massTonnes: VEHICLE_STATS.HELI_MI8.massTonnes,
    weaponType: 'heli_minigun',
    rpm: VEHICLE_STATS.RPM_HELI_MINIGUN,
    coaxRpm: 180,
    patrolPoints: [
      [660, 68, 280],
      [52, 58, 0],
      [330, 65, -320]
    ]
  },
  {
    id: 'ru_ka52_alligator',
    name: 'KA-52 ALLIGATOR COAXIAL ATTACK HELI (30MM 2A42 + S-8 + 8× VIKHR ATGM)',
    type: 'plane',
    isAircraft: true,
    isHelicopter: true,
    aircraftRole: 'heli_attack',
    isCoaxialHeli: true,
    team: 'RU',
    spawnPos: [1504, 0, -44],
    spawnYaw: Math.PI / 2,
    maxHp: VEHICLE_STATS.HELI_KA52.maxHp,
    speed: VEHICLE_STATS.HELI_KA52.speed,
    minSpeed: 0,
    maxSpeed: VEHICLE_STATS.HELI_KA52.maxSpeed,
    climbRateMs: VEHICLE_STATS.HELI_KA52.climbRateMs,
    maxFwdTiltRad: VEHICLE_STATS.HELI_KA52.maxFwdTiltRad,
    yawAuthorityMult: VEHICLE_STATS.HELI_KA52.yawAuthorityMult,
    rollAgilityMult: VEHICLE_STATS.HELI_KA52.rollAgilityMult,
    massTonnes: VEHICLE_STATS.HELI_KA52.massTonnes,
    weaponType: 'heli_attack',
    rpm: VEHICLE_STATS.RPM_HELI_30MM,
    coaxRpm: 210,
    patrolPoints: [
      [480, 74, 220],
      [0, 72, 120],
      [280, 75, -260],
      [-180, 74, -120]
    ]
  },

  // ===================== US & RU COMBAT AIRCRAFT WINGS (PARKED ON OUTER SIDE APRON z = ∓138: BIGGEST IN BACK -> FASTEST IN FRONT!) =====================
  {
    id: 'us_a10_cas',
    name: 'A-10C WARTHOG (30MM GAU-8 + ROCKETS)',
    type: 'plane',
    isAircraft: true,
    aircraftRole: 'cas',
    team: 'US',
    spawnPos: [-2780, 0, -138],
    spawnYaw: -Math.PI / 2 - 0.32,
    maxHp: VEHICLE_STATS.PLANE_CAS.maxHp,
    speed: VEHICLE_STATS.PLANE_CAS.speed,
    minSpeed: VEHICLE_STATS.PLANE_CAS.minSpeed,
    maxSpeed: VEHICLE_STATS.PLANE_CAS.maxSpeed,
    weaponType: 'plane_cas',
    rpm: VEHICLE_STATS.RPM_GAU8,
    coaxRpm: 180,
    patrolPoints: [
      [-660, 115, -280],
      [0, 110, 0],
      [330, 120, -320],
      [-320, 115, 320]
    ]
  },
  {
    id: 'us_f22_fighter',
    name: 'F-15EX / F-22A STRIKE FIGHTER (AIM-9X A2A + JDAM BOMBS)',
    type: 'plane',
    isAircraft: true,
    aircraftRole: 'fighter',
    team: 'US',
    spawnPos: [-2736, 0, -138],
    spawnYaw: -Math.PI / 2 - 0.32,
    maxHp: VEHICLE_STATS.PLANE_FIGHTER.maxHp,
    speed: VEHICLE_STATS.PLANE_FIGHTER.speed,
    minSpeed: VEHICLE_STATS.PLANE_FIGHTER.minSpeed,
    maxSpeed: VEHICLE_STATS.PLANE_FIGHTER.maxSpeed,
    weaponType: 'plane_fighter',
    rpm: VEHICLE_STATS.RPM_FIGHTER_VULCAN,
    coaxRpm: 45,
    patrolPoints: [
      [-340, 340, -260],
      [340, 355, -240],
      [360, 345, 260],
      [-340, 335, 240]
    ]
  },
  {
    id: 'us_ac130_gunship',
    name: 'AC-130J GHOSTRIDER GUNSHIP (25MM + 40MM BOFORS + 105MM)',
    type: 'plane',
    isAircraft: true,
    aircraftRole: 'gunship',
    team: 'US',
    spawnPos: [-2876, 0, -138],
    spawnYaw: -Math.PI / 2 - 0.32,
    maxHp: VEHICLE_STATS.PLANE_GUNSHIP.maxHp,
    speed: VEHICLE_STATS.PLANE_GUNSHIP.speed,
    minSpeed: VEHICLE_STATS.PLANE_GUNSHIP.minSpeed,
    maxSpeed: VEHICLE_STATS.PLANE_GUNSHIP.maxSpeed,
    weaponType: 'plane_gunship',
    rpm: VEHICLE_STATS.RPM_AC130_25MM,
    coaxRpm: VEHICLE_STATS.RPM_AC130_40MM,
    patrolPoints: [
      [-320, 165, 320],
      [195, 168, 165],
      [330, 165, -320],
      [-185, 168, -165]
    ]
  },
  {
    id: 'ru_su25_cas',
    name: 'SU-25SM FROGFOOT (30MM + S-8 ROCKETS)',
    type: 'plane',
    isAircraft: true,
    aircraftRole: 'cas',
    team: 'RU',
    spawnPos: [2780, 0, 138],
    spawnYaw: Math.PI / 2 - 0.32,
    maxHp: VEHICLE_STATS.PLANE_CAS.maxHp,
    speed: VEHICLE_STATS.PLANE_CAS.speed,
    minSpeed: VEHICLE_STATS.PLANE_CAS.minSpeed,
    maxSpeed: VEHICLE_STATS.PLANE_CAS.maxSpeed,
    weaponType: 'plane_cas',
    rpm: VEHICLE_STATS.RPM_GAU8,
    coaxRpm: 180,
    patrolPoints: [
      [660, 115, 280],
      [0, 110, 0],
      [-320, 120, 320],
      [330, 115, -320]
    ]
  },
  {
    id: 'ru_su57_fighter',
    name: 'SU-34 / SU-57 STRIKE FIGHTER (R-73 A2A + KAB-500 BOMBS)',
    type: 'plane',
    isAircraft: true,
    aircraftRole: 'fighter',
    team: 'RU',
    spawnPos: [2736, 0, 138],
    spawnYaw: Math.PI / 2 - 0.32,
    maxHp: VEHICLE_STATS.PLANE_FIGHTER.maxHp,
    speed: VEHICLE_STATS.PLANE_FIGHTER.speed,
    minSpeed: VEHICLE_STATS.PLANE_FIGHTER.minSpeed,
    maxSpeed: VEHICLE_STATS.PLANE_FIGHTER.maxSpeed,
    weaponType: 'plane_fighter',
    rpm: VEHICLE_STATS.RPM_FIGHTER_VULCAN,
    coaxRpm: 45,
    patrolPoints: [
      [340, 340, 260],
      [-340, 355, 240],
      [-360, 345, -260],
      [340, 335, -240]
    ]
  },
  {
    id: 'ru_tu95_gunship',
    name: 'TU-95MS HEAVY GUNSHIP (25MM + 40MM + 105MM HOWITZER)',
    type: 'plane',
    isAircraft: true,
    aircraftRole: 'gunship',
    team: 'RU',
    spawnPos: [2876, 0, 138],
    spawnYaw: Math.PI / 2 - 0.32,
    maxHp: VEHICLE_STATS.PLANE_GUNSHIP.maxHp,
    speed: VEHICLE_STATS.PLANE_GUNSHIP.speed,
    minSpeed: VEHICLE_STATS.PLANE_GUNSHIP.minSpeed,
    maxSpeed: VEHICLE_STATS.PLANE_GUNSHIP.maxSpeed,
    weaponType: 'plane_gunship',
    rpm: VEHICLE_STATS.RPM_AC130_25MM,
    coaxRpm: VEHICLE_STATS.RPM_AC130_40MM,
    patrolPoints: [
      [330, 165, -320],
      [-185, 168, -165],
      [-320, 165, 320],
      [195, 168, 165]
    ]
  },
  // ── Dedicated HQ Stealth Lane: Northrop B-2A Spirit Flying-Wing Stealth Carpet Bomber ──
  {
    id: 'us_b2_spirit',
    name: 'NORTHROP B-2A SPIRIT STEALTH BOMBER (80× CARPET BOMBS + GBU-57 MOP)',
    type: 'plane',
    isAircraft: true,
    isStealthAircraft: true,
    stealthFactor: 0.12,
    aircraftRole: 'b2_spirit',
    team: 'US',
    spawnPos: [-2828, 0, -138],
    spawnYaw: -Math.PI / 2 - 0.32,
    maxHp: VEHICLE_STATS.PLANE_B2_SPIRIT.maxHp,
    speed: VEHICLE_STATS.PLANE_B2_SPIRIT.speed,
    minSpeed: VEHICLE_STATS.PLANE_B2_SPIRIT.minSpeed,
    maxSpeed: VEHICLE_STATS.PLANE_B2_SPIRIT.maxSpeed,
    weaponType: 'b2_carpet_bomber',
    rpm: VEHICLE_STATS.RPM_B2_CARPET,
    coaxRpm: 60,
    patrolPoints: [
      [-660, 485, -280],
      [0, 510, 0],
      [660, 495, 280],
      [330, 505, -320]
    ]
  },
  {
    id: 'ru_b2_spirit',
    name: 'TUPOLEV PAK DA POSLANNIK STEALTH BOMBER (80× FAB-250 CARPET + FOAB)',
    type: 'plane',
    isAircraft: true,
    isStealthAircraft: true,
    stealthFactor: 0.12,
    aircraftRole: 'b2_spirit',
    team: 'RU',
    spawnPos: [2828, 0, 138],
    spawnYaw: Math.PI / 2 - 0.32,
    maxHp: VEHICLE_STATS.PLANE_B2_SPIRIT.maxHp,
    speed: VEHICLE_STATS.PLANE_B2_SPIRIT.speed,
    minSpeed: VEHICLE_STATS.PLANE_B2_SPIRIT.minSpeed,
    maxSpeed: VEHICLE_STATS.PLANE_B2_SPIRIT.maxSpeed,
    weaponType: 'b2_carpet_bomber',
    rpm: VEHICLE_STATS.RPM_B2_CARPET,
    coaxRpm: 60,
    patrolPoints: [
      [660, 485, 280],
      [0, 510, 0],
      [-660, 495, -280],
      [-320, 505, 320]
    ]
  },
  // ── Permanent Hardened HQ Strategic Airbase C-RAM Phalanx CIWS & Patriot / S-400 SAM Batteries ──
  // Prevents enemy jets from landing on or strafing parked aircraft on the opposing team's rear runway!
  {
    id: 'us_airbase_ciws_front',
    name: 'CENTURION C-RAM PHALANX & PATRIOT PAC-3 AIRBASE DEFENSE',
    type: 'emplace_aa',
    isEmplacement: true,
    isAirbaseDefenseBattery: true,
    team: 'US',
    spawnPos: [-2518, 0, -138],
    spawnYaw: -Math.PI / 2,
    maxHp: 3200,
    speed: 0,
    weaponType: 'aa_autocannon',
    rpm: 900,
    patrolPoints: [[-2518, 0, -138]]
  },
  {
    id: 'us_airbase_ciws_rear',
    name: 'CENTURION C-RAM PHALANX & PATRIOT PAC-3 AIRBASE DEFENSE',
    type: 'emplace_aa',
    isEmplacement: true,
    isAirbaseDefenseBattery: true,
    team: 'US',
    spawnPos: [-2948, 0, 138],
    spawnYaw: -Math.PI / 2,
    maxHp: 3200,
    speed: 0,
    weaponType: 'aa_autocannon',
    rpm: 900,
    patrolPoints: [[-2948, 0, 138]]
  },
  {
    id: 'ru_airbase_ciws_front',
    name: 'PANTSIR-S1M CIWS & S-400 TRIUMF AIRBASE DEFENSE',
    type: 'emplace_aa',
    isEmplacement: true,
    isAirbaseDefenseBattery: true,
    team: 'RU',
    spawnPos: [2518, 0, 138],
    spawnYaw: Math.PI / 2,
    maxHp: 3200,
    speed: 0,
    weaponType: 'aa_autocannon',
    rpm: 900,
    patrolPoints: [[2518, 0, 138]]
  },
  {
    id: 'ru_airbase_ciws_rear',
    name: 'PANTSIR-S1M CIWS & S-400 TRIUMF AIRBASE DEFENSE',
    type: 'emplace_aa',
    isEmplacement: true,
    isAirbaseDefenseBattery: true,
    team: 'RU',
    spawnPos: [2948, 0, -138],
    spawnYaw: Math.PI / 2,
    maxHp: 3200,
    speed: 0,
    weaponType: 'aa_autocannon',
    rpm: 900,
    patrolPoints: [[2948, 0, -138]]
  }
];

// =========================================================================
// REALISTIC MILITARY RECON MOTORCYCLES & TACTICAL 4×4 QUAD ATVS
// 5 Combat Recon Bikes / ATVs stationed at EVERY Objective Base (A, B, C, D, E)
// (Main HQ Base no longer has the civilian bike showroom warehouse)
// =========================================================================
export const WAREHOUSE_BAY_CATALOG = [
  {
    key: 'recon_m1030_1',
    shortBayLabel: 'M1030M1 RECON',
    name: 'M1030M1 USMC MILITARY RECON ENDURO (OLIVE DRAB)',
    type: 'bike',
    bikeSubType: 'twostroke_250cc',
    cc: 250,
    isTwoStroke: false,
    colorHex: 0x4b5320,
    accentHex: 0x1e2418,
    stats: VEHICLE_STATS.BIKE_250CC_2T
  },
  {
    key: 'recon_christini_2',
    shortBayLabel: 'AWD 450 TACTICAL',
    name: 'CHRISTINI II AWD 450 MILITARY TACTICAL ENDURO (DESERT TAN)',
    type: 'bike',
    bikeSubType: 'twostroke_500cc',
    cc: 450,
    isTwoStroke: false,
    colorHex: 0x8c7d60,
    accentHex: 0x26241f,
    stats: VEHICLE_STATS.BIKE_500CC_2T
  },
  {
    key: 'recon_sof_stealth_3',
    shortBayLabel: 'SOF SILENT RECON',
    name: 'SOF SILENT TACTICAL RECON MOTO (MATTE BLACK)',
    type: 'bike',
    bikeSubType: 'emoto_surron',
    isElectric: true,
    colorHex: 0x22282c,
    accentHex: 0x4b5320,
    stats: VEHICLE_STATS.EMOTO_SURRON
  },
  {
    key: 'recon_scout_4',
    shortBayLabel: 'KLR650 SCOUT',
    name: 'KLR650 DIESEL MILITARY FIELD SCOUT (WOODLAND CAMO)',
    type: 'bike',
    bikeSubType: 'sport_600cc',
    cc: 650,
    colorHex: 0x3b4d2b,
    accentHex: 0x1c2218,
    stats: VEHICLE_STATS.BIKE_600CC
  },
  {
    key: 'tactical_mv850_atv_5',
    shortBayLabel: 'MV850 4×4 ATV',
    name: 'POLARIS MV850 MILITARY TACTICAL 4×4 QUAD ATV',
    type: 'atv',
    bikeSubType: 'atv_quad',
    cc: 850,
    colorHex: 0x4b5320,
    accentHex: 0x202420,
    stats: VEHICLE_STATS.ATV_QUAD
  }
];

export const OBJECTIVE_MOTORPOOL_BASES = [
  {
    baseId: 'us_hq',
    label: 'US MAIN BASE',
    cx: -1494,
    cz: 0,
    yaw: -Math.PI / 2,
    team: 'US',
    // Fast-response bikes & quad ATV parked right beside the US Main Base troop spawn
    spots: [
      [-6, -7, -Math.PI / 2],
      [-6, 7, -Math.PI / 2],
      [-8, -14, -Math.PI / 2],
      [-8, 14, -Math.PI / 2],
      [-10, 0, -Math.PI / 2]
    ]
  },
  {
    baseId: 'ru_hq',
    label: 'RU MAIN BASE',
    cx: 1494,
    cz: 0,
    yaw: Math.PI / 2,
    team: 'RU',
    // Fast-response bikes & quad ATV parked right beside the RU Main Base troop spawn
    spots: [
      [6, 7, Math.PI / 2],
      [6, -7, Math.PI / 2],
      [8, 14, Math.PI / 2],
      [8, -14, Math.PI / 2],
      [10, 0, Math.PI / 2]
    ]
  },
  {
    baseId: 'a',
    fobFlagId: 'A',
    label: 'FOB ALPHA',
    cx: -660,
    cz: -280,
    yaw: -Math.PI / 2,
    team: 'NEUTRAL',
    // Parked right next to FOB Alpha spawn ring (8m–13m from flag) for immediate walk-up riding!
    spots: [
      [-9, 8, -1.15],
      [9, 9, -1.85],
      [-10, -8, -0.65],
      [10, -8, -2.15],
      [0, 12, -Math.PI / 2]
    ]
  },
  {
    baseId: 'b',
    fobFlagId: 'B',
    label: 'FOB BRAVO',
    cx: -320,
    cz: 320,
    yaw: -Math.PI / 2,
    team: 'NEUTRAL',
    // Parked right next to FOB Bravo spawn ring (8m–13m from flag)
    spots: [
      [-9, -8, -1.2],
      [9, -9, -1.9],
      [-10, 8, -0.6],
      [10, 8, -2.25],
      [0, -12, -Math.PI / 2]
    ]
  },
  {
    baseId: 'c',
    fobFlagId: 'C',
    label: 'FOB CHARLIE',
    cx: 0,
    cz: 0,
    yaw: 0,
    team: 'NEUTRAL',
    // Parked right on the West & East dry bank spawn points of FOB Charlie (x = ±22, z = ±8)
    spots: [
      [-23, -7, -Math.PI / 2],
      [-23, 7, -Math.PI / 2],
      [23, -7, Math.PI / 2],
      [23, 7, Math.PI / 2],
      [-19, 0, -Math.PI / 2]
    ]
  },
  {
    baseId: 'd',
    fobFlagId: 'D',
    label: 'FOB DELTA',
    cx: 330,
    cz: -320,
    yaw: Math.PI / 2,
    team: 'NEUTRAL',
    // Parked right next to FOB Delta spawn ring (8m–13m from flag)
    spots: [
      [-9, 8, 1.2],
      [9, 9, 1.9],
      [-10, -8, 0.6],
      [10, -8, 2.25],
      [0, 12, Math.PI / 2]
    ]
  },
  {
    baseId: 'e',
    fobFlagId: 'E',
    label: 'FOB ECHO',
    cx: 660,
    cz: 280,
    yaw: Math.PI / 2,
    team: 'NEUTRAL',
    // Parked right next to FOB Echo spawn ring (8m–13m from flag)
    spots: [
      [-9, -8, 1.15],
      [9, -9, 1.85],
      [-10, 8, 0.65],
      [10, 8, 2.15],
      [0, -12, Math.PI / 2]
    ]
  }
];

for (const base of OBJECTIVE_MOTORPOOL_BASES) {
  for (let i = 0; i < WAREHOUSE_BAY_CATALOG.length; i++) {
    const item = WAREHOUSE_BAY_CATALOG[i];
    const spot = (base.spots && base.spots[i]) || [(i - 2) * 8.5, 18, base.yaw];
    const sx = base.cx + spot[0];
    const sz = base.cz + spot[1];
    const syaw = spot[2] !== undefined ? spot[2] : base.yaw;

    VEHICLE_DEFS.push({
      id: `base_${base.baseId}_bike_${i + 1}`,
      name: `${item.name} [${base.label}]`,
      shortBayLabel: item.shortBayLabel,
      fobFlagId: base.fobFlagId || null,
      type: item.type,
      bikeSubType: item.bikeSubType,
      isBike: item.type === 'bike',
      isAtv: item.type === 'atv',
      isWarehouseBike: true,
      isTwoStroke: Boolean(item.isTwoStroke),
      isElectric: Boolean(item.isElectric),
      isScooter: false,
      cc: item.cc || 0,
      colorHex: item.colorHex,
      accentHex: item.accentHex,
      team: base.team,
      spawnPos: [sx, 0, sz],
      spawnYaw: syaw,
      maxHp: item.stats.maxHp,
      speed: item.stats.speed,
      accelRate: item.stats.accelRate,
      brakeRate: item.stats.brakeRate,
      turnRate: item.stats.turnRate,
      weaponType: 'hmg',
      rpm: 850,
      patrolPoints: [
        [-320, 0, 320],
        [0, 0, 0],
        [330, 0, -320]
      ]
    });
  }
}

/**
 * Real-World vs. In-Game Speed Envelope Research for All Implemented Aircraft (US vs. Russian Origin)
 */
export const AIRCRAFT_SPEED_RESEARCH = [
  {
    role: 'gunship',
    aircraft: 'US: AC-130J Ghostrider • RU: Tupolev Tu-95MS Bear-H',
    era: 'Heavy Orbital Gunship',
    realLowestSpeed: '185 km/h (100 kn / 115 mph stall) • Tu-95MS: ~235 km/h',
    realHighestSpeed: '670 km/h (417 mph / 362 kn) • Tu-95MS: 925 km/h (575 mph)',
    gameMinSpeed: '108 km/h (30 m/s)',
    gameCruiseSpeed: '158 km/h (44 m/s)',
    gameMaxSpeed: '223 km/h (62 m/s)',
    location: 'Rear Strategic Airbase Bay 1 — Back (x = ∓2876, z = ∓138 • C-RAM Protected)'
  },
  {
    role: 'cas',
    aircraft: 'US: A-10C Thunderbolt II ("Warthog") • RU: Sukhoi Su-25SM Frogfoot',
    era: 'Close Air Support Attack Jet',
    realLowestSpeed: '220 km/h (120 kn / 138 mph stall) • Su-25SM: ~205 km/h',
    realHighestSpeed: '706 km/h (439 mph / 381 kn; Vne 833 km/h) • Su-25SM: 975 km/h',
    gameMinSpeed: '115 km/h (32 m/s)',
    gameCruiseSpeed: '209 km/h (58 m/s)',
    gameMaxSpeed: '302 km/h (84 m/s)',
    location: 'Rear Strategic Airbase Bay 3 — Mid-Front (x = ∓2780, z = ∓138 • C-RAM Protected)'
  },
  {
    role: 'fighter',
    aircraft: 'US: F-15EX Eagle II / F-22A • RU: Sukhoi Su-57 Felon / Su-34 Fullback',
    era: 'Air Superiority & Strike Fighter',
    realLowestSpeed: '195–240 km/h (105–130 kn approach / thrust-vector post-stall)',
    realHighestSpeed: '2,655 km/h (Mach 2.5 F-15EX; Mach 2.0 Su-57 Felon)',
    gameMinSpeed: '151 km/h (42 m/s)',
    gameCruiseSpeed: '281 km/h (78 m/s)',
    gameMaxSpeed: '414 km/h (115 m/s)',
    location: 'Rear Strategic Airbase Bay 4 — Front (x = ∓2736, z = ∓138 • C-RAM Protected)'
  },
  {
    role: 'b2_spirit',
    aircraft: 'US: Northrop B-2A Spirit • RU: Tupolev PAK DA "Poslannik" Stealth Bomber',
    era: 'Flying-Wing Stealth Carpet Bomber',
    realLowestSpeed: '222–250 km/h (120–135 kn fly-by-wire envelope floor)',
    realHighestSpeed: '1,010 km/h (628 mph / Mach 0.95 B-2A & PAK DA)',
    gameMinSpeed: '173 km/h (48 m/s)',
    gameCruiseSpeed: '450 km/h (125 m/s)',
    gameMaxSpeed: '666 km/h (185 m/s Overdrive)',
    location: 'Rear Strategic Stealth Canopy Bay 2 — Back-Mid (x = ∓2828, z = ∓138 • C-RAM Protected)'
  }
];

// ============================================================================
// MEDIEVAL ERA VEHICLE & SIEGE ENGINE DEFINITIONS (NO PLANES, NO B-2, NO TANKS)
// Only Counterweight Siege Trebuchets (`trebuchet`) & Armored Warhorses (`warhorse`)
// ============================================================================
export const MEDIEVAL_VEHICLE_DEFS = [
  // ── Counterweight Siege Trebuchets (Mountable [E]: Hurls Flaming Stone Boulders 70m–600m) ──
  {
    id: 'us_trebuchet_hq_1',
    name: 'ROYAL COUNTERWEIGHT SIEGE TREBUCHET (FLAMING BOULDER)',
    type: 'trebuchet',
    isEmplacement: true,
    team: 'US',
    spawnPos: [-1496, 0, 5],
    spawnYaw: -Math.PI / 2,
    maxHp: 550,
    speed: 0,
    weaponType: 'trebuchet_boulder',
    rpm: 28,
    patrolPoints: [[-660, 0, -280]]
  },
  {
    id: 'us_trebuchet_hq_2',
    name: 'ROYAL COUNTERWEIGHT SIEGE TREBUCHET (FLAMING BOULDER)',
    type: 'trebuchet',
    isEmplacement: true,
    team: 'US',
    spawnPos: [-1478, 0, 16],
    spawnYaw: -Math.PI / 2,
    maxHp: 550,
    speed: 0,
    weaponType: 'trebuchet_boulder',
    rpm: 28,
    patrolPoints: [[-320, 0, 320]]
  },
  {
    id: 'ru_trebuchet_hq_1',
    name: 'IMPERIAL SIEGE TREBUCHET (FLAMING BOULDER)',
    type: 'trebuchet',
    isEmplacement: true,
    team: 'RU',
    spawnPos: [1496, 0, -5],
    spawnYaw: Math.PI / 2,
    maxHp: 550,
    speed: 0,
    weaponType: 'trebuchet_boulder',
    rpm: 28,
    patrolPoints: [[660, 0, 280]]
  },
  {
    id: 'ru_trebuchet_hq_2',
    name: 'IMPERIAL SIEGE TREBUCHET (FLAMING BOULDER)',
    type: 'trebuchet',
    isEmplacement: true,
    team: 'RU',
    spawnPos: [1478, 0, -16],
    spawnYaw: Math.PI / 2,
    maxHp: 550,
    speed: 0,
    weaponType: 'trebuchet_boulder',
    rpm: 28,
    patrolPoints: [[330, 0, -320]]
  },
  {
    id: 'us_trebuchet_obj_a',
    name: 'BARONY KEEP SIEGE TREBUCHET',
    type: 'trebuchet',
    isEmplacement: true,
    team: 'US',
    spawnPos: [-624, 0, -278],
    spawnYaw: -Math.PI / 2,
    maxHp: 550,
    speed: 0,
    weaponType: 'trebuchet_boulder',
    rpm: 28,
    patrolPoints: [[0, 0, 0]]
  },
  {
    id: 'us_trebuchet_obj_b',
    name: 'ROYAL ENCAMPMENT SIEGE TREBUCHET',
    type: 'trebuchet',
    isEmplacement: true,
    team: 'US',
    spawnPos: [-287, 0, 317],
    spawnYaw: -Math.PI / 2,
    maxHp: 550,
    speed: 0,
    weaponType: 'trebuchet_boulder',
    rpm: 28,
    patrolPoints: [[0, 0, 0]]
  },
  {
    id: 'us_trebuchet_obj_c',
    name: "KING'S BRIDGE WEST TREBUCHET",
    type: 'trebuchet',
    isEmplacement: true,
    team: 'US',
    spawnPos: [-34, 0, -14],
    spawnYaw: -Math.PI / 2,
    maxHp: 550,
    speed: 0,
    weaponType: 'trebuchet_boulder',
    rpm: 28,
    patrolPoints: [[330, 0, -320]]
  },
  {
    id: 'ru_trebuchet_obj_c',
    name: "KING'S BRIDGE EAST TREBUCHET",
    type: 'trebuchet',
    isEmplacement: true,
    team: 'RU',
    spawnPos: [34, 0, 14],
    spawnYaw: Math.PI / 2,
    maxHp: 550,
    speed: 0,
    weaponType: 'trebuchet_boulder',
    rpm: 28,
    patrolPoints: [[-320, 0, 320]]
  },
  {
    id: 'ru_trebuchet_obj_d',
    name: 'HIGHLAND FORTRESS SIEGE TREBUCHET',
    type: 'trebuchet',
    isEmplacement: true,
    team: 'RU',
    spawnPos: [295, 0, -317],
    spawnYaw: Math.PI / 2,
    maxHp: 550,
    speed: 0,
    weaponType: 'trebuchet_boulder',
    rpm: 28,
    patrolPoints: [[0, 0, 0]]
  },
  {
    id: 'ru_trebuchet_obj_e',
    name: 'IRON CITADEL SIEGE TREBUCHET',
    type: 'trebuchet',
    isEmplacement: true,
    team: 'RU',
    spawnPos: [624, 0, 278],
    spawnYaw: Math.PI / 2,
    maxHp: 550,
    speed: 0,
    weaponType: 'trebuchet_boulder',
    rpm: 28,
    patrolPoints: [[0, 0, 0]]
  },

  // ── Armored Royal Warhorses (Mountable [E]: Gallop + Shoot Warbow Arrows from Horseback!) ──
  {
    id: 'us_warhorse_hq_1',
    name: 'ROYAL BARDED DESTRIER WARHORSE (MOUNTED LONGBOW)',
    type: 'warhorse',
    isHorseMount: true,
    team: 'US',
    spawnPos: [-1512, 0, 14],
    spawnYaw: -Math.PI / 2,
    maxHp: 340,
    speed: 13.5,
    accelRate: 1.95,
    brakeRate: 4.5,
    turnRate: 1.85,
    weaponType: 'mounted_warbow',
    rpm: 95,
    patrolPoints: [
      [-660, 0, 0],
      [-660, 0, -280],
      [0, 0, 0]
    ]
  },
  {
    id: 'us_warhorse_hq_2',
    name: 'ROYAL BARDED DESTRIER WARHORSE (MOUNTED LONGBOW)',
    type: 'warhorse',
    isHorseMount: true,
    team: 'US',
    spawnPos: [-1502, 0, 14],
    spawnYaw: -Math.PI / 2,
    maxHp: 340,
    speed: 13.5,
    accelRate: 1.95,
    brakeRate: 4.5,
    turnRate: 1.85,
    weaponType: 'mounted_warbow',
    rpm: 95,
    patrolPoints: [
      [-660, 0, 0],
      [-320, 0, 320],
      [0, 0, 0]
    ]
  },
  {
    id: 'us_warhorse_obj_a',
    name: 'WEST BARONY CHARGER WARHORSE (MOUNTED LONGBOW)',
    type: 'warhorse',
    isHorseMount: true,
    team: 'US',
    spawnPos: [-646, 0, -264],
    spawnYaw: -Math.PI / 2,
    maxHp: 340,
    speed: 13.5,
    accelRate: 1.95,
    brakeRate: 4.5,
    turnRate: 1.85,
    weaponType: 'mounted_warbow',
    rpm: 95,
    patrolPoints: [
      [-320, 0, 320],
      [0, 0, 0]
    ]
  },
  {
    id: 'ru_warhorse_hq_1',
    name: 'IMPERIAL CATAPHRACT WARHORSE (MOUNTED LONGBOW)',
    type: 'warhorse',
    isHorseMount: true,
    team: 'RU',
    spawnPos: [1512, 0, -14],
    spawnYaw: Math.PI / 2,
    maxHp: 340,
    speed: 13.5,
    accelRate: 1.95,
    brakeRate: 4.5,
    turnRate: 1.85,
    weaponType: 'mounted_warbow',
    rpm: 95,
    patrolPoints: [
      [660, 0, 0],
      [660, 0, 280],
      [0, 0, 0]
    ]
  },
  {
    id: 'ru_warhorse_hq_2',
    name: 'IMPERIAL CATAPHRACT WARHORSE (MOUNTED LONGBOW)',
    type: 'warhorse',
    isHorseMount: true,
    team: 'RU',
    spawnPos: [1502, 0, -14],
    spawnYaw: Math.PI / 2,
    maxHp: 340,
    speed: 13.5,
    accelRate: 1.95,
    brakeRate: 4.5,
    turnRate: 1.85,
    weaponType: 'mounted_warbow',
    rpm: 95,
    patrolPoints: [
      [660, 0, 0],
      [330, 0, -320],
      [0, 0, 0]
    ]
  },
  {
    id: 'ru_warhorse_obj_e',
    name: 'IRON CITADEL CHARGER WARHORSE (MOUNTED LONGBOW)',
    type: 'warhorse',
    isHorseMount: true,
    team: 'RU',
    spawnPos: [646, 0, 264],
    spawnYaw: Math.PI / 2,
    maxHp: 340,
    speed: 13.5,
    accelRate: 1.95,
    brakeRate: 4.5,
    turnRate: 1.85,
    weaponType: 'mounted_warbow',
    rpm: 95,
    patrolPoints: [
      [330, 0, -320],
      [0, 0, 0]
    ]
  }
];

// ============================================================================
// JURASSIC ERA MOUNT & APEX DINOSAUR DEFINITIONS (USA + RUSSIA VS DINOSAURS — NO GUNS!)
// ============================================================================
export const JURASSIC_VEHICLE_DEFS = [
  // ── USA Expedition Forces (West Base US_BASE, Allied Human Coalition `team: 'US'`, Bow & Spear Mounts — NO GUNS!) ──
  {
    id: 'us_jungle_warhorse_hq_1',
    name: 'USA EXPEDITION OUTRIDER STALLION (HUNTING LONGBOW)',
    type: 'warhorse',
    isHorseMount: true,
    team: 'US',
    subFaction: 'US',
    spawnPos: [-1482, 0, 12],
    spawnYaw: -Math.PI / 2,
    maxHp: 380,
    speed: 13.5,
    accelRate: 1.95,
    brakeRate: 4.5,
    turnRate: 1.85,
    weaponType: 'mounted_warbow',
    rpm: 95,
    patrolPoints: [
      [-640, 0, 18],
      [-660, 0, -280],
      [0, 0, 0]
    ]
  },
  {
    id: 'us_jungle_warhorse_hq_2',
    name: 'USA EXPEDITION STALKER CHARGER (HUNTING LONGBOW)',
    type: 'warhorse',
    isHorseMount: true,
    team: 'US',
    subFaction: 'US',
    spawnPos: [-1498, 0, -10],
    spawnYaw: -Math.PI / 2,
    maxHp: 380,
    speed: 13.5,
    accelRate: 1.95,
    brakeRate: 4.5,
    turnRate: 1.85,
    weaponType: 'mounted_warbow',
    rpm: 95,
    patrolPoints: [
      [-660, 0, 0],
      [-660, 0, -280],
      [0, 0, 0]
    ]
  },
  {
    id: 'us_jungle_warhorse_obj_a',
    name: 'WEST PADDOCK RANGER MOUNT (HUNTING LONGBOW)',
    type: 'warhorse',
    isHorseMount: true,
    team: 'US',
    subFaction: 'US',
    spawnPos: [-645, 0, -268],
    spawnYaw: -Math.PI / 2,
    maxHp: 380,
    speed: 13.5,
    accelRate: 1.95,
    brakeRate: 4.5,
    turnRate: 1.85,
    weaponType: 'mounted_warbow',
    rpm: 95,
    patrolPoints: [
      [-320, 0, 320],
      [0, 0, 0]
    ]
  },
  // ── Russian Expedition Forces (East Base RU_BASE, Allied Human Coalition `team: 'US'`, Bow & Spear Mounts — NO GUNS!) ──
  {
    id: 'ru_coalition_warhorse_hq_1',
    name: 'RUSSIA EXPEDITION STEPPE DESTRIER (HUNTING LONGBOW)',
    type: 'warhorse',
    isHorseMount: true,
    team: 'US',
    subFaction: 'RU',
    spawnPos: [1482, 0, 12],
    spawnYaw: Math.PI / 2,
    maxHp: 380,
    speed: 13.5,
    accelRate: 1.95,
    brakeRate: 4.5,
    turnRate: 1.85,
    weaponType: 'mounted_warbow',
    rpm: 95,
    patrolPoints: [
      [640, 0, 18],
      [660, 0, 280],
      [0, 0, 0]
    ]
  },
  {
    id: 'ru_coalition_warhorse_hq_2',
    name: 'RUSSIA EXPEDITION COSSACK MOUNT (HUNTING LONGBOW)',
    type: 'warhorse',
    isHorseMount: true,
    team: 'US',
    subFaction: 'RU',
    spawnPos: [1498, 0, -10],
    spawnYaw: Math.PI / 2,
    maxHp: 380,
    speed: 13.5,
    accelRate: 1.95,
    brakeRate: 4.5,
    turnRate: 1.85,
    weaponType: 'mounted_warbow',
    rpm: 95,
    patrolPoints: [
      [640, 0, 0],
      [660, 0, 280],
      [0, 0, 0]
    ]
  },
  // ── Prehistoric Dinosaur Pack (`team: 'RU'`, Spawning at Island Jungle Nests — NOT Russia Base!) ──
  {
    id: 'dino_alpha_trex_north',
    name: '🦖 COLOSSAL ALPHA TYRANNOSAURUS REX (APEX JAW CRUSH + METEOR ROAR)',
    type: 'trex_mount',
    isHorseMount: true,
    isDinoMount: true,
    team: 'RU',
    spawnPos: [0, 0, -510],
    spawnYaw: 0,
    maxHp: 1350,
    speed: 14.0,
    accelRate: 1.45,
    brakeRate: 4.0,
    turnRate: 1.15,
    weaponType: 'trex_roar_bite',
    rpm: 65,
    patrolPoints: [
      [-320, 0, 320],
      [0, 0, 0],
      [330, 0, -320]
    ]
  },
  {
    id: 'dino_alpha_trex_d',
    name: '🦖 HIGHLAND REX MATRIARCH (APEX JAW CRUSH)',
    type: 'trex_mount',
    isHorseMount: true,
    isDinoMount: true,
    team: 'RU',
    spawnPos: [317, 0, -307],
    spawnYaw: Math.PI / 2,
    maxHp: 1350,
    speed: 14.0,
    accelRate: 1.45,
    brakeRate: 4.0,
    turnRate: 1.15,
    weaponType: 'trex_roar_bite',
    rpm: 65,
    patrolPoints: [
      [0, 0, 0],
      [-660, 0, -280]
    ]
  },
  {
    id: 'dino_alpha_raptor_e',
    name: '🦖 GIANT ALPHA VELOCIRAPTOR PACK LEADER (VENOM & TALONS)',
    type: 'raptor_mount',
    isHorseMount: true,
    isDinoMount: true,
    team: 'RU',
    spawnPos: [-270, 0, 460],
    spawnYaw: Math.PI,
    maxHp: 620,
    speed: 18.5,
    accelRate: 2.1,
    brakeRate: 5.0,
    turnRate: 2.15,
    weaponType: 'mounted_warbow',
    rpm: 135,
    patrolPoints: [
      [0, 0, 0],
      [-320, 0, 320]
    ]
  }
];
