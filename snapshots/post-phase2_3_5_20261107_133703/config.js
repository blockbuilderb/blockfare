// =========================================================================
// CENTRALIZED GAME CONFIGURATION — BattleBit Clone
// All gameplay-affecting magic numbers extracted into named constants.
// Phase 1 Refactor: import { PLAYER, COMBAT, BOT, ... } from './config.js'
// =========================================================================

// ---------------------------------------------------------------------------
// PLAYER
// ---------------------------------------------------------------------------
export const PLAYER = {
  HP: 100,
  MAX_HP: 100,
  ARMOR: 50,
  MAX_ARMOR: 50,
  ARMOR_ABSORB_RATIO: 0.35,
  SUPPRESSION_DECAY_RATE: 0.6,
  RESPAWN_DELAY: 10,
  STARTING_CASH: 600,
  STARTING_BANDAGES: 3,
  STARTING_GRENADES: 2,

  // Mouse sensitivity
  SENSITIVITY_ADS: 0.0011,
  SENSITIVITY_HIP: 0.0021,

  // Zeroing
  ZERO_DISTANCE_DEFAULT: 100,
  ZEROING_OPTIONS: [100, 200, 300, 400],
  ZERO_ELEVATION_FACTOR: 0.00007,

  // Eye heights (stance)
  EYE_HEIGHT_DOWNED: 0.32,
  EYE_HEIGHT_PRONE: 0.48,
  EYE_HEIGHT_CROUCH: 1.05,
  EYE_HEIGHT_STAND: 1.65,

  // Recoil
  RECOIL_KICK_Z: 0.085,
  RECOIL_SCALE_PRONE: 0.55,   // prone reduces recoil by 45%
  RECOIL_SCALE_CROUCH: 0.78,  // crouch reduces recoil by 22%

  // Suppression spread
  SUPPRESSION_SPREAD_MULT: 3.5,

  // Downed state
  DOWNED_TIMER: 15.0,
  REVIVE_HP: 65,
  GIVE_UP_RATE: 0.85,       // seconds to hold space to give up

  // Multi-kill timer
  MULTI_KILL_TIMER: 3.5,

  // Bleed
  BLEED_TICK_INTERVAL: 1.2,
  BLEED_DAMAGE: 3,
  BLEED_CHANCE_THRESHOLD: 12,
  BLEED_CHANCE: 0.28,

  // Bandaging
  BANDAGE_DURATION_MEDIC: 1.25,
  BANDAGE_DURATION_OTHER: 1.9,
  BANDAGE_HEAL_MEDIC: 70,
  BANDAGE_HEAL_OTHER: 50,

  // Medkit
  MEDKIT_HEAL: 12,

  // Field heal (press F on injured ally)
  FIELD_HEAL_MEDIC: 75,
  FIELD_HEAL_OTHER: 50,
  FIELD_HEAL_XP: 50,

  // Revive
  REVIVE_DURATION_MEDIC: 1.15,
  REVIVE_DURATION_OTHER: 1.75,
  REVIVE_DRAG_XP: 250,
  REVIVE_XP: 200,

  // Mag packing
  MAG_PACK_DURATION: 1.3,

  // Speed reload
  SPEED_RELOAD_MULT: 0.62,

  // Walk bob / Sway limits
  SWAY_MULT: 0.45,
  SWAY_LIMIT: 0.04,
  LEAN_OFFSET: 0.52,
  LEAN_TILT: 0.16,

  // Camera pitch limit
  MAX_PITCH_OFFSET: 0.06,

  // Vehicle camera
  VEHICLE_3RD_PERSON_HEIGHT: 4.2,
  VEHICLE_3RD_PERSON_DIST: -8.5,
  VEHICLE_1ST_PERSON_HEIGHT: 3.05,
  VEHICLE_FOV_ADS: 42,
  VEHICLE_FOV_NORMAL: 75,
};

// ---------------------------------------------------------------------------
// COMBAT
// ---------------------------------------------------------------------------
export const COMBAT = {
  // Kill XP
  KILL_XP_HEADSHOT: 140,
  KILL_XP_NORMAL: 100,
  HEAL_XP: 50,
  REVIVE_XP: 50,

  // Spot / Ping
  SPOT_DISTANCE: 220,
  SPOT_PERP_RADIUS: 3.2,
  SPOTTED_TIMER: 7.5,
  PING_TIMER_ENEMY: 5.0,
  PING_TIMER_SQUAD: 6.5,
  SPOT_XP: 25,

  // Suppression
  SUPPRESSION_INTENSITY_PER_DMG: 0.015,
  SUPPRESSION_MAX_INTENSITY: 0.5,

  // Commo Rose
  COMMS_XP: 15,
  COMMS_MEDIC_RANGE: 35,
  COMMS_SUPPORT_RANGE: 35,
  COMMS_MEDIC_HEAL: 45,
};

// ---------------------------------------------------------------------------
// PROJECTILES
// ---------------------------------------------------------------------------
export const PROJECTILES = {
  RPG: { speed: 62, gravity: 4.2, life: 4.5 },
  GRENADE: { speed: 22, gravity: 22, life: 2.6 },
  C4: { speed: 17, gravity: 24, life: 60 },
  TANK_SHELL: { speed: 115, gravity: 2.1, life: 3.5 },
  AUTOCANNON: { speed: 92, gravity: 2.5, life: 3.0 },
  C4_BLAST_RADIUS: 5.6,
  C4_BLAST_DAMAGE: 250,
};

// ---------------------------------------------------------------------------
// DISTANCES
// ---------------------------------------------------------------------------
export const DISTANCES = {
  INTERACT_RANGE: 4.5,
  VEHICLE_ENTER_RANGE: 6.5,
  FLAG_EXTRA_PAD: 18,
  RAYCAST_MAX: 420,
  HAMMER_RANGE: 5.2,
};

// ---------------------------------------------------------------------------
// RALLY & BEACON
// ---------------------------------------------------------------------------
export const DEPLOYABLES = {
  // Rally Point
  RALLY_TIMER: 120,
  RALLY_COOLDOWN: 90,
  RALLY_ENEMY_CLEAR_RADIUS: 20,
  RALLY_ENEMY_DESTROY_RADIUS: 8,

  // Insertion Beacon
  BEACON_SPAWNS: 2,
  BEACON_TIMER: 180,

  // Ammo Crate
  AMMO_CRATE_TIMER: 60,
  AMMO_CRATE_RADIUS: 6,
};

// ---------------------------------------------------------------------------
// VEHICLES (type stats — shared by all vehicles of same type)
// ---------------------------------------------------------------------------
export const VEHICLE_STATS = {
  TANK: { maxHp: 1600, speed: 17.5 },
  APC: { maxHp: 1050, speed: 23.0 },
  HUMVEE: { maxHp: 700, speed: 30.0 },

  // RPM values
  RPM_TANK_US: 28,
  RPM_TANK_RU: 26,
  RPM_APC: 210,
  RPM_HUMVEE: 460,
  RPM_COAX: 620,

  // Respawn delays (seconds)
  RESPAWN_DELAY_TANK: 28.0,
  RESPAWN_DELAY_APC: 22.0,
  RESPAWN_DELAY_HUMVEE: 15.0,

  // Ticket costs
  TICKET_COST_TANK: 15,
  TICKET_COST_APC: 10,
  TICKET_COST_HUMVEE: 5,

  // Standoff radii (STAY_CLOSE vs FAN_OUT)
  STANDOFF_CLOSE_TANK: 42,
  STANDOFF_CLOSE_APC: 36,
  STANDOFF_CLOSE_HUMVEE: 32,
  STANDOFF_FAN_TANK: 105,
  STANDOFF_FAN_APC: 100,
  STANDOFF_FAN_HUMVEE: 95,

  // AI Vehicle engage ranges
  ENGAGE_RANGE_VEHICLE: 155,
  ENGAGE_RANGE_INFANTRY: 135,

  // Combat & XP
  DESTROY_XP_TANK: 400,
  DESTROY_XP_OTHER: 250,
  BAILOUT_DAMAGE: 42,
  ROADKILL_XP: 150,
  ROADKILL_DAMAGE_BOT: 160,
  ROADKILL_DAMAGE_PLAYER: 150,
};
export const VEHICLES = VEHICLE_STATS;

// ---------------------------------------------------------------------------
// CAMERA & RENDERER
// ---------------------------------------------------------------------------
export const CAMERA = {
  FOV: 75,
  NEAR: 0.08,
  FAR: 1100,
  PIXEL_RATIO_CAP: 1.35,
};

// ---------------------------------------------------------------------------
// LIGHTING
// ---------------------------------------------------------------------------
export const LIGHTING = {
  HEMI_INTENSITY: 0.78,
  SUN_INTENSITY: 1.25,
  SUN_POSITION: [160, 220, 120],
  SHADOW_MAP_SIZE: 1024,
  SHADOW_NEAR: 10,
  SHADOW_FAR: 550,
  SHADOW_EXTENT: 260,
};

// ---------------------------------------------------------------------------
// MATCH
// ---------------------------------------------------------------------------
export const MATCH = {
  DURATION: 15 * 60,  // 900 seconds
  BLEED_POPUP_INTERVAL: 10.0,
  MAX_TICKETS: 999,

  // Contested base bleed rates (per min)
  CONTESTED_BLEED_CAN_RESPAWN: 36,
  CONTESTED_BLEED_LOCKED: 90,

  // Death orbit camera
  ORBIT_SPEED: 0.12,
  ORBIT_RADIUS_X: 85,
  ORBIT_RADIUS_Z: 62,
  ORBIT_HEIGHT: 46,

  // Cash gain
  CASH_MIN: 15,
  CASH_MULT: 1.1,

  // UAV recon assist
  UAV_RECON_ASSIST_PTS: 35,
};

// ---------------------------------------------------------------------------
// WEATHER
// ---------------------------------------------------------------------------
export const WEATHER = {
  TIMER_MIN: 120,
  TIMER_RAND: 180,
  FOG_DENSITY_BASE: 0.0014,
};

// ---------------------------------------------------------------------------
// TERRAIN
// ---------------------------------------------------------------------------
export const TERRAIN = {
  MAX_SPAN: 3,          // structural integrity cantilever span
  BRIDGE_DECK_HEIGHT: 1.15,
  BUILDING_COLLAPSE_THRESHOLD: 0.45, // ratio: <= 0.45 means >55% destroyed -> collapse
  FLAG_RADIUS_DEFAULT: 22,
  FLAG_RADIUS_CHARLIE: 24,
};

// ---------------------------------------------------------------------------
// MATERIALS (voxel HP values)
// ---------------------------------------------------------------------------
export const MAT_HP = {
  BRICK: 90,
  CONCRETE: 130,
  DARK_CONCRETE: 165,
  SANDBAG: 85,
  WOOD: 55,
  CONTAINER: 150,
  PROP: 35,
};

// ---------------------------------------------------------------------------
// BOT
// ---------------------------------------------------------------------------
export const BOT = {
  HP: 100,
  MAX_HP: 100,
  ARMOR_HP: 35,
  BLEEDOUT_TIMER: 22.0,
  RESPAWN_TIMER: 3.5,

  // Engage ranges
  ENGAGE_RANGE_INFANTRY: 115,
  ENGAGE_RANGE_RPG_CHECK: 135,
  ENGAGE_RANGE_RPG_TOGGLE: 130,
  COMBAT_RANGE_INFANTRY: 68,
  COMBAT_RANGE_VEHICLE: 65,

  // Rescue threat ranges — medic assess/re-assess/approach/point-blank/ambush
  RESCUE_THREAT_MEDIC_ASSESS: 36,
  RESCUE_THREAT_CASUALTY_ASSESS: 32,
  RESCUE_THREAT_MEDIC_REASSESS: 34,
  RESCUE_THREAT_CASUALTY_REASSESS: 28,
  RESCUE_THREAT_APPROACH_MEDIC: 48,
  RESCUE_THREAT_APPROACH_CASUALTY: 42,
  RESCUE_THREAT_POINTBLANK_MEDIC: 12,
  RESCUE_THREAT_POINTBLANK_CASUALTY: 10,
  RESCUE_THREAT_AMBUSH_MEDIC: 10,
  RESCUE_THREAT_AMBUSH_CASUALTY: 9,

  // Rescue ranges
  RESCUE_RANGE_MEDIC: 62,
  RESCUE_RANGE_OTHER: 12,

  // Revive
  REVIVE_HP: 80,
  POST_REVIVE_TIMER: 2.2,
  POST_REVIVE_WEAPON_READY: 1.85,
  MEDIC_REVIVE_TIME: 1.55,
  NON_MEDIC_REVIVE_TIME: 2.25,

  // Drag
  DRAG_TIMER: 1.75,
  DRAG_SPEED: 4.5,

  // Movement speeds
  SPEED_SPRINT: 8.4,
  SPEED_APPROACH_SLOW: 7.2,
  SPEED_APPROACH_FAST: 8.4,
  SPEED_COMBAT_SLOW: 6.2,
  SPEED_COMBAT_MED: 6.5,
  SPEED_COMBAT_FAST: 6.8,
  SPEED_PATROL: 7.6,

  // Physics
  GRAVITY: 24.0,
  VAULT_JUMP_SPEED: 7.6,

  // Shoot cooldowns
  BURST_PAUSE_BASE: 0.48,
  BURST_PAUSE_RAND: 0.4,
  BURST_SHOT_INTERVAL: 0.11,
  RPG_COOLDOWN_BASE: 3.6,
  RPG_COOLDOWN_RAND: 1.4,

  // AI think
  RETHINK_TIMER_BASE: 3.5,
  RETHINK_TIMER_RAND: 4.5,

  // Speech
  SPEECH_BUBBLE_TIMER: 4.2,
  COMMS_FORCE_COOLDOWN: 0.45,
  COMMS_NORMAL_COOLDOWN: 2.6,

  // FOV cone
  FOV_BEHIND_DOT: -0.3,     // dot < -0.3 means behind
  FOV_CHECK_BEYOND: 14,     // only check FOV beyond 14m

  // Smoke screen
  SMOKE_MAX_CLOUDS: 18,
  SMOKE_LIFE: 7.5,

  // Base radii
  MAIN_BASE_RADIUS: 58,
  FLAG_CONTEST_RADIUS: 34,

  // Vehicle seeking
  VEHICLE_SEEK_RANGE_BRAVO: 185,
  VEHICLE_SEEK_RANGE_OTHER: 58,
  VEHICLE_BOARD_DISTANCE: 4.8,

  // Turn rates
  TURN_RATE_POST_REVIVE: 1.35,
  TURN_RATE_GETTING_UP: 2.15,
  TURN_RATE_NORMAL: 3.2,

  // Aim
  AIM_RAISE_RATE: 1.85,
  AIM_FIRE_GATE: 0.85,
  AIM_OFF_TARGET_THRESHOLD: 0.26,
};

// ---------------------------------------------------------------------------
// FORMATION SPACING (STAY_CLOSE vs FAN_OUT)
// ---------------------------------------------------------------------------
export const FORMATION = {
  CLOSE_STANDOFF_BASE: 11,
  CLOSE_STANDOFF_STEP: 2.0,
  FAN_STANDOFF_BASE: 25,
  FAN_STANDOFF_STEP: 3.5,

  CLOSE_OBJ_BASE: 8,
  CLOSE_OBJ_STEP: 1.5,
  FAN_OBJ_BASE: 16,
  FAN_OBJ_STEP: 2.8,

  CLOSE_CLUSTER_BASE: 2.0,
  CLOSE_CLUSTER_ALT: 1.8,
  FAN_CLUSTER_BASE: 6.5,
  FAN_CLUSTER_ALT: 5.0,
};

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------
export const UI = {
  INITIAL_TICKETS_US: 400,
  INITIAL_TICKETS_RU: 400,
  INITIAL_MATCH_TIME: 900,
  FPS_SMOOTHED_DEFAULT: 60,
  FRAME_MS_SMOOTHED_DEFAULT: 16.7,
  ROSTER_UPDATE_INTERVAL: 0.25,   // 4 Hz
  MARKER_UPDATE_INTERVAL: 0.05,   // 20 Hz
  MINIMAP_UPDATE_INTERVAL: 0.066, // 15 Hz
};

// ---------------------------------------------------------------------------
// AUDIO
// ---------------------------------------------------------------------------
export const AUDIO = {
  MASTER_GAIN: 0.78,
  MAX_ACTIVE_VOICES: 24,
  VOICE_CULL_DIST: 30,
  TANK_CANNON_MAX_DIST: 250,
  EXPLOSION_MAX_DIST: 250,
  AUTOCANNON_IMPACT_MAX_DIST: 145,
  WHIZ_COOLDOWN_MS: 150,
  EXPLOSION_COOLDOWN_MS: 55,
  AUTOCANNON_COOLDOWN_MS: 75,
};

// ---------------------------------------------------------------------------
// NETWORK
// ---------------------------------------------------------------------------
export const NETWORK = {
  BOTS_FULL_AI: 40,
  BOTS_SQUAD_AI: 16,
  WS_SYNC_INTERVAL: 0.06,
  HTTP_SYNC_INTERVAL: 0.16,
  ROOM_POLL_INTERVAL: 2.2,
  REMOTE_TIMEOUT_MS: 5500,
  SPEECH_BUBBLE_TIMER: 4.5,
  REMOTE_GUNSHOT_RANGE: 130,
};

// ---------------------------------------------------------------------------
// TELEMETRY
// ---------------------------------------------------------------------------
export const TELEMETRY = {
  SNAPSHOT_INTERVAL: 3.5,
  FLUSH_INTERVAL: 1.5,
  MAX_EVENTS: 80,
};

// ---------------------------------------------------------------------------
// GROUP ALIASES (for convenience)
// ---------------------------------------------------------------------------
export const SQUADS = FORMATION;
export const TICKETS = MATCH;
export const COOLDOWNS = {
  RALLY_COOLDOWN: DEPLOYABLES.RALLY_COOLDOWN,
  BURST_PAUSE_BASE: BOT.BURST_PAUSE_BASE,
  BURST_PAUSE_RAND: BOT.BURST_PAUSE_RAND,
  BURST_SHOT_INTERVAL: BOT.BURST_SHOT_INTERVAL,
  RPG_COOLDOWN_BASE: BOT.RPG_COOLDOWN_BASE,
  RPG_COOLDOWN_RAND: BOT.RPG_COOLDOWN_RAND,
  COMMS_FORCE_COOLDOWN: BOT.COMMS_FORCE_COOLDOWN,
  COMMS_NORMAL_COOLDOWN: BOT.COMMS_NORMAL_COOLDOWN,
};

// ---------------------------------------------------------------------------
// SKY / FOG COLOR  (shared scene.background & scene.fog)
// ---------------------------------------------------------------------------
export const SKY_FOG_COLOR = 0x87b8d8;
