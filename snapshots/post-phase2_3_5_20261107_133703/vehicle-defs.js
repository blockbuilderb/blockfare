// =========================================================================
// VEHICLE DEFINITIONS — BattleBit Clone
// Data-driven spawn configs for all 12 fleet vehicles.
// Positions stored as arrays [x, y, z] — y is computed at runtime via getGroundHeightAt.
// Patrol point y-values are 0 (ground level).
// =========================================================================

import { VEHICLE_STATS } from './config.js?v=35';

export const VEHICLE_DEFS = [
  // ===================== US FLEET =====================
  {
    id: 'us_abrams_hq',
    name: 'M1A2 ABRAMS MBT (120MM + COAX)',
    type: 'tank',
    team: 'US',
    spawnPos: [-274, 0, -8],
    spawnYaw: -Math.PI / 2,
    maxHp: VEHICLE_STATS.TANK.maxHp,
    speed: VEHICLE_STATS.TANK.speed,
    weaponType: 'tank_cannon',
    rpm: VEHICLE_STATS.RPM_TANK_US,
    coaxRpm: VEHICLE_STATS.RPM_COAX,
    patrolPoints: [
      [-215, 0, -24],
      [-128, 0, -28],
      [-42, 0, -8],
      [36, 0, -8]
    ]
  },
  {
    id: 'us_abrams_fwd_a',
    name: 'M1A2 ABRAMS SEP (120MM + COAX)',
    type: 'tank',
    team: 'US',
    spawnPos: [-274, 0, 8],
    spawnYaw: -Math.PI / 2,
    maxHp: VEHICLE_STATS.TANK.maxHp,
    speed: VEHICLE_STATS.TANK.speed,
    weaponType: 'tank_cannon',
    rpm: VEHICLE_STATS.RPM_TANK_US,
    coaxRpm: VEHICLE_STATS.RPM_COAX,
    patrolPoints: [
      [-210, 0, -38],
      [-156, 0, -42],
      [-68, 0, -18]
    ]
  },
  {
    id: 'us_abrams_fwd_c',
    name: 'M1A2 ABRAMS TUSK (120MM + COAX)',
    type: 'tank',
    team: 'US',
    spawnPos: [-288, 0, -18],
    spawnYaw: -Math.PI / 2,
    maxHp: VEHICLE_STATS.TANK.maxHp,
    speed: VEHICLE_STATS.TANK.speed,
    weaponType: 'tank_cannon',
    rpm: VEHICLE_STATS.RPM_TANK_US,
    coaxRpm: VEHICLE_STATS.RPM_COAX,
    patrolPoints: [
      [-210, 0, 24],
      [-105, 0, 52],
      [-38, 0, 14]
    ]
  },
  {
    id: 'us_lav25_hq',
    name: 'LAV-25 IFV (30MM HE)',
    type: 'apc',
    team: 'US',
    spawnPos: [-274, 0, 22],
    spawnYaw: -Math.PI / 2,
    maxHp: VEHICLE_STATS.APC.maxHp,
    speed: VEHICLE_STATS.APC.speed,
    weaponType: 'autocannon',
    rpm: VEHICLE_STATS.RPM_APC,
    patrolPoints: [
      [-200, 0, 28],
      [-98, 0, 62],
      [-34, 0, 18]
    ]
  },
  {
    id: 'us_humvee_hq',
    name: 'M1151 HUMVEE (.50 CAL)',
    type: 'humvee',
    team: 'US',
    spawnPos: [-288, 0, 0],
    spawnYaw: -Math.PI / 2,
    maxHp: VEHICLE_STATS.HUMVEE.maxHp,
    speed: VEHICLE_STATS.HUMVEE.speed,
    weaponType: 'hmg',
    rpm: VEHICLE_STATS.RPM_HUMVEE,
    patrolPoints: [
      [-215, 0, -14],
      [-135, 0, -36],
      [-48, 0, 6]
    ]
  },
  {
    id: 'us_humvee_fwd',
    name: 'M1151 ASSAULT HUMVEE (.50 CAL)',
    type: 'humvee',
    team: 'US',
    spawnPos: [-288, 0, 18],
    spawnYaw: -Math.PI / 2,
    maxHp: VEHICLE_STATS.HUMVEE.maxHp,
    speed: VEHICLE_STATS.HUMVEE.speed,
    weaponType: 'hmg',
    rpm: VEHICLE_STATS.RPM_HUMVEE,
    patrolPoints: [
      [-205, 0, 22],
      [-115, 0, 56],
      [-52, 0, 28]
    ]
  },

  // ===================== RU FLEET =====================
  {
    id: 'ru_t90_hq',
    name: 'T-90M PRORYV MBT (125MM + COAX)',
    type: 'tank',
    team: 'RU',
    spawnPos: [274, 0, 8],
    spawnYaw: Math.PI / 2,
    maxHp: VEHICLE_STATS.TANK.maxHp,
    speed: VEHICLE_STATS.TANK.speed,
    weaponType: 'tank_cannon',
    rpm: VEHICLE_STATS.RPM_TANK_RU,
    coaxRpm: VEHICLE_STATS.RPM_COAX,
    patrolPoints: [
      [215, 0, 24],
      [128, 0, 28],
      [42, 0, 8],
      [-36, 0, 8]
    ]
  },
  {
    id: 'ru_t90_fwd_c',
    name: 'T-90M GUARD MBT (125MM + COAX)',
    type: 'tank',
    team: 'RU',
    spawnPos: [274, 0, -8],
    spawnYaw: Math.PI / 2,
    maxHp: VEHICLE_STATS.TANK.maxHp,
    speed: VEHICLE_STATS.TANK.speed,
    weaponType: 'tank_cannon',
    rpm: VEHICLE_STATS.RPM_TANK_RU,
    coaxRpm: VEHICLE_STATS.RPM_COAX,
    patrolPoints: [
      [210, 0, -24],
      [115, 0, -48],
      [44, 0, -14]
    ]
  },
  {
    id: 'ru_t90_fwd_a',
    name: 'T-90M ASSAULT MBT (125MM + COAX)',
    type: 'tank',
    team: 'RU',
    spawnPos: [288, 0, 18],
    spawnYaw: Math.PI / 2,
    maxHp: VEHICLE_STATS.TANK.maxHp,
    speed: VEHICLE_STATS.TANK.speed,
    weaponType: 'tank_cannon',
    rpm: VEHICLE_STATS.RPM_TANK_RU,
    coaxRpm: VEHICLE_STATS.RPM_COAX,
    patrolPoints: [
      [210, 0, 38],
      [156, 0, 44],
      [58, 0, 16]
    ]
  },
  {
    id: 'ru_btr82_hq',
    name: 'BTR-82A APC (30MM HE)',
    type: 'apc',
    team: 'RU',
    spawnPos: [274, 0, -22],
    spawnYaw: Math.PI / 2,
    maxHp: VEHICLE_STATS.APC.maxHp,
    speed: VEHICLE_STATS.APC.speed,
    weaponType: 'autocannon',
    rpm: VEHICLE_STATS.RPM_APC,
    patrolPoints: [
      [200, 0, -28],
      [105, 0, -56],
      [38, 0, -18]
    ]
  },
  {
    id: 'ru_tigr_hq',
    name: 'GAZ TIGR (.50 CAL)',
    type: 'humvee',
    team: 'RU',
    spawnPos: [288, 0, 0],
    spawnYaw: Math.PI / 2,
    maxHp: VEHICLE_STATS.HUMVEE.maxHp,
    speed: VEHICLE_STATS.HUMVEE.speed,
    weaponType: 'hmg',
    rpm: VEHICLE_STATS.RPM_HUMVEE,
    patrolPoints: [
      [215, 0, 14],
      [135, 0, 36],
      [48, 0, -6]
    ]
  },
  {
    id: 'ru_tigr_fwd',
    name: 'GAZ TIGR ASSAULT (.50 CAL)',
    type: 'humvee',
    team: 'RU',
    spawnPos: [288, 0, -18],
    spawnYaw: Math.PI / 2,
    maxHp: VEHICLE_STATS.HUMVEE.maxHp,
    speed: VEHICLE_STATS.HUMVEE.speed,
    weaponType: 'hmg',
    rpm: VEHICLE_STATS.RPM_HUMVEE,
    patrolPoints: [
      [205, 0, -22],
      [115, 0, -56],
      [46, 0, -24]
    ]
  }
];
