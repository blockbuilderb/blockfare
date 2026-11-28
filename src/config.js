// =========================================================================
// CENTRALIZED GAME CONFIGURATION — BattleBit Clone
// All gameplay-affecting magic numbers extracted into named constants.
// Phase 1 Refactor: import { PLAYER, COMBAT, BOT, ... } from './config.js'
// =========================================================================

// ---------------------------------------------------------------------------
// DEVELOPER SANDBOX OPTIONS
// Default ON for now; can be toggled OFF anytime in Settings -> Gameplay
// (or locked build-wide by setting ENABLE_DEV_TAB_MASTER: false).
// ---------------------------------------------------------------------------
export const DEV_OPTIONS = {
  ENABLE_DEV_TAB_MASTER: true,
  DEFAULT_DEV_TAB_ENABLED: true
};

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
  STARTING_CASH: 50,
  STARTING_BANDAGES: 3,
  STARTING_GRENADES: 2,

  // Mouse sensitivity
  SENSITIVITY_ADS: 0.0011,
  SENSITIVITY_HIP: 0.0021,

  // Zeroing
  ZERO_DISTANCE_DEFAULT: 100,
  ZEROING_OPTIONS: [100, 200, 300, 400, 600, 800],
  ZERO_ELEVATION_FACTOR: 0.00007,

  // Eye heights (3-stance system: Standing vs. One-Knee Kneel [C] vs. Prone [Z])
  EYE_HEIGHT_DOWNED: 0.32,
  EYE_HEIGHT_PRONE: 0.42,
  EYE_HEIGHT_CROUCH: 1.08,
  EYE_HEIGHT_STAND: 1.65,

  // Recoil & Sway Stance Multipliers + Low-Profile Hit Reduction
  RECOIL_KICK_Z: 0.085,
  RECOIL_SCALE_PRONE: 0.45,   // prone reduces recoil by 55%
  RECOIL_SCALE_CROUCH: 0.68,  // one-knee kneel reduces recoil by 32%
  SWAY_SCALE_PRONE: 0.28,     // prone cuts weapon sway by 72%
  SWAY_SCALE_CROUCH: 0.58,    // one-knee cuts weapon sway by 42%
  SWAY_SCALE_BIPOD: 0.12,     // deployed bipod / ledge rest cuts sway by 88%
  PROFILE_HIT_MULT_CROUCH: 0.72, // one-knee lowers exposed profile (-28% AI hit prob)
  PROFILE_HIT_MULT_PRONE: 0.48,  // prone minimizes silhouette (-52% AI hit prob at >18m)

  // Suppression spread
  SUPPRESSION_SPREAD_MULT: 3.5,

  // Downed state (Squad-calibrated generous 120s bleed-out window so Medics have ample time to rescue)
  DOWNED_TIMER: 120.0,
  REVIVE_HP: 35,            // Field Dressing revive stabilizes soldier at 35 HP; Medic Bag then heals to 100 HP!
  REVIVE_HP_DOCTRINE: 30,   // Under strict Squad Doctrine, non-medics stabilize casualties at 30 HP
  GIVE_UP_RATE: 0.85,       // seconds to hold space to give up

  // Multi-kill timer
  MULTI_KILL_TIMER: 3.5,

  // Bleed (Squad-calibrated slow wound bleed: 2 HP every 2.5s = ~0.8 HP/s so players & medics never have to panic)
  BLEED_TICK_INTERVAL: 2.5,
  BLEED_DAMAGE: 2,
  BLEED_CHANCE_THRESHOLD: 15,
  BLEED_CHANCE: 0.25,

  // Squad 2-Item Medical System:
  // 1) Field Dressings (Bandages): Medics carry 9, other classes carry 2 (+Rig/Pack bonus).
  //    Used to stop bleeding [Hold H] or revive downed teammates [Hold F] (1 Dressing per revive!).
  // 2) Medic Bag (Medical Kit): Carried by Medics (600 HP trauma supply).
  //    Used to heal injured standing teammates & self all the way to 100/100 Max HP!
  FIELD_DRESSINGS_MEDIC: 9,
  FIELD_DRESSINGS_OTHER: 2,
  MEDIC_BAG_MAX_SUPPLY: 600,
  BANDAGE_DURATION_MEDIC: 1.25,
  BANDAGE_DURATION_OTHER: 1.9,
  BANDAGE_HEAL_MEDIC: 100,
  BANDAGE_HEAL_OTHER: 40,

  // Medkit / Medic Bag
  MEDKIT_HEAL: 35,

  // Field heal (press F on injured ally or get healed by friendly Medic to 100% Max HP)
  FIELD_HEAL_MEDIC: 100,
  FIELD_HEAL_OTHER: 50,
  FIELD_HEAL_XP: 50,

  // Revive
  REVIVE_DURATION_MEDIC: 1.8,
  REVIVE_DURATION_OTHER: 1.75,
  REVIVE_DURATION_OTHER_DOCTRINE: 3.8,
  REVIVE_DRAG_XP: 250,
  REVIVE_XP: 200,
  ASSAULT_POUCH_COOLDOWN: 18,

  // Tarkov-style Slow Reload / Bullet-by-Bullet Mag Packing (time per single round pressed into mag)
  MAG_PACK_BULLET_TIME: 0.22,
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

  // Quake / CPMA / Source Engine Air-Strafe & Auto-Bunnyhop Physics (Uncapped Horizontal Speed!)
  GROUND_ACCEL: 11.5,         // Ground acceleration rate
  GROUND_FRICTION: 6.2,       // Ground friction (skipped on landing frame when holding Space to bunnyhop!)
  GROUND_STOP_SPEED: 3.2,     // Minimum speed threshold for ground friction curve
  AIR_ACCEL: 16.0,            // Quake air acceleration multiplier
  AIR_WISH_SPEED_CAP: 4.5,    // Quake/Source wishspeed dot-product cap in mid-air (turning into A/D builds uncapped speed!)
  CPM_AIR_CONTROL: 155.0,     // CPMA-style smooth air steering when holding W or S in mid-air

  // Vehicle camera
  VEHICLE_3RD_PERSON_HEIGHT: 4.2,
  VEHICLE_3RD_PERSON_DIST: -8.5,
  VEHICLE_1ST_PERSON_HEIGHT: 3.05,
  VEHICLE_FOV_ADS: 42,
  VEHICLE_FOV_NORMAL: 75,
};

// ---------------------------------------------------------------------------
// CLASS TRAITS (UNIQUE STRENGTHS & WEAKNESSES PER COMBAT ROLE)
// - In Modern Era, ONLY the `pilot` class is flight-certified to pilot aircraft!
// - Each class has balanced movement speed, body armor, reload/recoil handling,
//   and role-specific combat strengths and weaknesses.
// ---------------------------------------------------------------------------
export const CLASS_TRAITS = {
  pilot: {
    id: 'pilot',
    title: '✈️ COMBAT PILOT (FLIGHT OFFICER)',
    canFlyAircraft: true,
    moveSpeedMult: 1.12,      // +12% agile flight-suit foot speed
    maxArmor: 25,             // WEAKNESS: Light G-Suit vest (25 Armor vs 50 standard)
    armorAbsorbRatio: 0.25,
    recoilMult: 1.05,         // Compact PDW handling
    reloadTimeMult: 0.90,     // +10% faster PDW reloads
    reserveMagMult: 0.75,     // WEAKNESS: Fewer spare magazines in survival rig
    bonusGrenades: -1,        // WEAKNESS: Carries 1 grenade instead of 2
    strengths: 'EXCLUSIVE AIRCRAFT / B-2 LICENSE • Order Planes [9 / K] • +28% Turn Rate G-Suit • +25 HP/s Airframe Auto-Repair • Zero-Damage Ejection Seat • +12% Sprint Speed',
    weaknesses: 'Light Flight-Suit Armor (25 Max Armor) • Cannot Operate Heavy Tanks (Doctrine ON) • Compact PDW Primary Only • Only 1 Frag Grenade'
  },
  armor: {
    id: 'armor',
    title: '🛡️ ARMOR CREWMAN (TANK / IFV COMMANDER)',
    canFlyAircraft: false,
    moveSpeedMult: 0.92,      // WEAKNESS: Heavy spall-liner flak vest (-8% foot speed)
    maxArmor: 65,             // STRENGTH: Reinforced crewman flak armor (65 Armor)
    armorAbsorbRatio: 0.42,
    recoilMult: 0.95,
    reloadTimeMult: 0.95,
    reserveMagMult: 0.85,     // WEAKNESS: Compact vehicle crew ammo rig
    bonusGrenades: 0,
    strengths: 'EXCLUSIVE TANK / IFV / SPAAG LICENSE • Requisition Armor Ahead [9 / K] • +22 HP/s Hull Auto-Repair • +22% Faster Cannon Reload • [X] Trophy APS & 65 Flak Armor',
    weaknesses: 'Cannot Fly Aircraft • -8% Infantry Movement Speed (Heavy Spall Vest) • Short-Range Crew PDW Primary'
  },
  engineer: {
    id: 'engineer',
    title: '🛠️ COMBAT ENGINEER (AT/AA & FORTIFICATIONS)',
    canFlyAircraft: false,
    moveSpeedMult: 0.94,      // WEAKNESS: Heavy RPG-7 / Stinger tubes & tool kit (-6% speed)
    maxArmor: 55,             // STRENGTH: Reinforced blast vest (55 Armor)
    armorAbsorbRatio: 0.38,
    recoilMult: 1.08,         // WEAKNESS: +8% weapon recoil due to heavy ordnance load
    reloadTimeMult: 1.0,
    reserveMagMult: 1.0,
    bonusGrenades: 0,
    strengths: 'Dual RPG-7 HEAT (AT) & FIM-92 Stinger SAM (AA) on [3] • 2.5× Faster Vehicle & Building Repair • -25% Cost Discount on Squad Gun Emplacements',
    weaknesses: 'Cannot Fly Planes or Crew Heavy Armor (Doctrine ON) • -6% Move Speed • +8% Rifle Recoil'
  },
  assault: {
    id: 'assault',
    title: '💥 SHOCK ASSAULT (FRONT-LINE BREACHER)',
    canFlyAircraft: false,
    moveSpeedMult: 1.08,      // STRENGTH: +8% aggressive breach sprint speed
    maxArmor: 50,
    armorAbsorbRatio: 0.35,
    recoilMult: 0.82,         // STRENGTH: -18% weapon recoil control
    reloadTimeMult: 0.76,     // STRENGTH: -24% faster magazine reloads
    reserveMagMult: 1.25,     // STRENGTH: +25% extra rifle magazines
    bonusGrenades: 1,         // STRENGTH: +1 Extra Frag Grenade (3 total) + C4 Breach Charges
    strengths: '18s Rifleman Ammo Pouch [7] (+Mag & +1 Frag Top-Up) • -24% Faster Reload • -18% Recoil • +8% Sprint Speed • C4 Breach Charges',
    weaknesses: 'Cannot Fly Planes or Crew Heavy Armor (Doctrine ON) • No Long-Range AT/AA Rockets'
  },
  medic: {
    id: 'medic',
    title: '➕ FIELD COMBAT MEDIC (TRAUMA SPECIALIST)',
    canFlyAircraft: false,
    moveSpeedMult: 1.06,      // STRENGTH: +6% rapid rescue foot speed
    maxArmor: 38,             // WEAKNESS: Lighter trauma vest (38 Armor vs 50)
    armorAbsorbRatio: 0.30,
    recoilMult: 0.92,
    reloadTimeMult: 0.90,
    reserveMagMult: 1.0,
    bonusGrenades: -1,        // WEAKNESS: Focuses on medical triage instead of heavy ordnance
    strengths: '1.8s Rapid Revive to 100 HP (vs 3.8s / 30 HP Non-Medic) • 9 Field Dressings + 600 HP Medic Bag • +4 HP/s Self-Triage Regen • +6% Speed',
    weaknesses: 'Cannot Fly Planes or Crew Heavy Armor (Doctrine ON) • Lighter Trauma Vest (38 Armor) • Zero Anti-Armor Explosives'
  },
  support: {
    id: 'support',
    title: '📦 HEAVY SUPPORT GUNNER (EXO-ARMOR & RESUPPLY)',
    canFlyAircraft: false,
    moveSpeedMult: 0.88,      // WEAKNESS: Heavy 100-round LMG + ballistic plates (-12% foot speed)
    maxArmor: 80,             // STRENGTH: Heavy steel ballistic plates (80 Armor, 48% absorb)
    armorAbsorbRatio: 0.48,
    recoilMult: 0.88,         // Heavy bipod/barrel stability
    reloadTimeMult: 1.15,     // WEAKNESS: +15% slower box-mag reload
    reserveMagMult: 1.50,     // STRENGTH: +50% reserve ammunition
    bonusGrenades: 1,
    strengths: '1.75× LMG Enemy Suppression • Heavy Plate Armor (80 Max Armor) • Deploys Squad Ammo & Kit Stashes [7] (12s CD) • +50% Reserve Ammo',
    weaknesses: 'Cannot Fly Planes or Crew Heavy Armor (Doctrine ON) • -12% Move Speed • +15% Slower Box Reload'
  },
  recon: {
    id: 'recon',
    title: '🎯 RECON SNIPER (STEALTH MARKSMAN)',
    canFlyAircraft: false,
    moveSpeedMult: 1.14,      // STRENGTH: +14% ghillie recon sprint speed
    maxArmor: 25,             // WEAKNESS: Ultra-light ghillie rig (25 Armor)
    armorAbsorbRatio: 0.25,
    recoilMult: 0.85,
    reloadTimeMult: 0.92,
    reserveMagMult: 1.0,
    bonusGrenades: -1,        // WEAKNESS: 1 grenade
    strengths: 'Crouch/Prone Masks from Enemy UAV • 20s JTAC Laser Target Paint [Q / MMB] • Deploys Spawn Beacon [6] • +14% Sprint Speed',
    weaknesses: 'Cannot Fly Planes or Crew Heavy Armor (Doctrine ON) • Ultra-Light Ghillie Suit (25 Max Armor)'
  },
  swordsman: {
    id: 'swordsman',
    title: '⚔️ FOOTMAN SERGEANT (1H SWORD & 1H SHIELD)',
    canFlyAircraft: false,
    moveSpeedMult: 0.98,
    maxArmor: 80,
    armorAbsorbRatio: 0.48,
    recoilMult: 1.0,
    reloadTimeMult: 1.0,
    reserveMagMult: 1.0,
    bonusGrenades: 0,
    strengths: '80 Heavy Mail & Plate Armor • 1H Heater Shield Blocks 70% Frontal Arrows & Melee [RMB] • Fast 132 RPM 1H Arming Sword + Throwing Blades',
    weaknesses: 'Foot Mobility Only (No Personal Horse at Spawn) • Shorter 4.2m Reach Than Polearms & 2H Greatswords'
  },
  greatsword_knight: {
    id: 'greatsword_knight',
    title: '🗡️ SHOCK CHAMPION (2H LONGSWORD + 2H LARGE SHIELD)',
    canFlyAircraft: false,
    moveSpeedMult: 0.92,
    maxArmor: 95,
    armorAbsorbRatio: 0.52,
    recoilMult: 1.0,
    reloadTimeMult: 1.0,
    reserveMagMult: 1.0,
    bonusGrenades: 0,
    strengths: '165 DMG 2H Zweihänder Greatsword (Cleaves up to 3 Enemies at 5.4m Reach!) • Slot [2] Carries 2H Large Pavise Tower Shield (92% Shield Wall Block!) • 95 Full Plate Armor',
    weaknesses: 'Cannot Block Arrows While Swinging 2H Greatsword (Switch to Slot [2] 2H Large Shield Against Archers!) • -8% Move Speed'
  },
  polearm_knight: {
    id: 'polearm_knight',
    title: '🔱 LANCER KNIGHT (POLEARM / LONG SPEAR + WARHORSE)',
    canFlyAircraft: false,
    moveSpeedMult: 0.95,
    maxArmor: 85,
    armorAbsorbRatio: 0.50,
    recoilMult: 1.0,
    reloadTimeMult: 1.0,
    reserveMagMult: 1.0,
    bonusGrenades: 0,
    strengths: 'Spawns with Armored Warhorse + Couched Cavalry Lance (280 DMG Charge!) • 5.8m Long Spear Reach on Foot + Anti-Cavalry Spear Brace [RMB] • Slot [2] 1H Sword & Shield',
    weaknesses: 'Narrow Piercing Thrust Arc Requires Precise Aim in Close Quarters • Slower Swing Cadence Than 1H Swords'
  },
  archer: {
    id: 'archer',
    title: '🏹 FOOT LONGBOW ARCHER (YEW LONGBOW + 1H SWORD & SHIELD)',
    canFlyAircraft: false,
    moveSpeedMult: 1.08,
    maxArmor: 40,
    armorAbsorbRatio: 0.32,
    recoilMult: 0.85,
    reloadTimeMult: 0.85,
    reserveMagMult: 1.25,
    bonusGrenades: 0,
    strengths: 'Rapid-Draw 150-lb Royal Yew Longbow (98 DMG Bodkin Arrows • 2.5× Headshot) • +8% Agile Foot Speed • Slot [2] 1H Sword & 1H Shield + Slot [3] Trauma Medkit',
    weaknesses: 'Light Brigandine Archer Vest (40 Max Armor) • Vulnerable to Heavy Cavalry Charges if Caught in the Open'
  },
  crossbowman: {
    id: 'crossbowman',
    title: '🎯 SIEGE CROSSBOWMAN (ARBALEST + 2H LARGE PAVISE SHIELD)',
    canFlyAircraft: false,
    moveSpeedMult: 0.96,
    maxArmor: 65,
    armorAbsorbRatio: 0.42,
    recoilMult: 0.80,
    reloadTimeMult: 1.0,
    reserveMagMult: 1.15,
    bonusGrenades: 0,
    strengths: '148 DMG Flat-Trajectory Heavy Siege Crossbow (260 m/s Armor-Piercing Quarrels!) • Slot [2] 2H Large Pavise Tower Shield (92% Shield Wall Block!) • Slot [3] 1H Sword',
    weaknesses: '1.95s Windlass Reload Between Bolts • Must Swap to Slot [2] Pavise Shield While Advancing Under Fire'
  },
  mounted_knight: {
    id: 'mounted_knight',
    title: '🏇 MOUNTED CAVALRY ARCHER (WARHORSE + LONGBOW + LANCE)',
    canFlyAircraft: false,
    moveSpeedMult: 1.05,
    maxArmor: 55,
    armorAbsorbRatio: 0.38,
    recoilMult: 0.90,
    reloadTimeMult: 0.90,
    reserveMagMult: 1.2,
    bonusGrenades: 0,
    strengths: 'Deploys Mounted on Armored Royal Warhorse (81 km/h Gallop + Trample) • Slot [1] Yew Longbow + Slot [2] Couched Cavalry Lance + Slot [3] 1H Sword & Shield',
    weaknesses: 'Medium Cavalry Mail Armor (55 Max Armor) • Larger Silhouette While Mounted on Horseback'
  },
  dino_raptor: {
    id: 'dino_raptor',
    title: '🦖 VELOCIRAPTOR ALPHA PACK HUNTER',
    canFlyAircraft: false,
    moveSpeedMult: 1.45,
    maxArmor: 60,
    armorAbsorbRatio: 0.40,
    recoilMult: 1.0,
    reloadTimeMult: 0.8,
    reserveMagMult: 1.0,
    bonusGrenades: 0,
    strengths: '+45% Apex Predator Sprint Speed • 110 DMG Sickle Talon Lunge + Neurotoxic Venom Spit • Can Mount Alpha T-Rex [E]',
    weaknesses: 'Cannot Revive Downed Packmates • Cannot Use Human Firearms or Fortifications'
  }
};

// ---------------------------------------------------------------------------
// CENTRALIZED ERA ROLE & KIT SETTINGS (ISOLATED FROM UI & CONTROLLER FUNCTIONS)
// Single source of truth for selectable classes, hotkeys (F5-F11), icons, and
// descriptions across Modern, Medieval (Mount & Blade), and Jurassic eras.
// ---------------------------------------------------------------------------
export const ERA_ROLES = {
  modern: [
    { id: 'engineer', key: 'F5', icon: '🛠️', label: 'ENGINEER', short: 'ENG', sub: '2.5× REPAIR + -25% EMPL', gadgetId: 'rpg7', gadget: 'RPG-7 HEAT / STINGER AA [3]' },
    { id: 'assault', key: 'F6', icon: '💥', label: 'ASSAULT', short: 'ASL', sub: '18S POUCH [7] + C4', gadgetId: 'c4', gadget: 'C4 BREACH + AMMO POUCH [7]' },
    { id: 'medic', key: 'F7', icon: '➕', label: 'MEDIC', short: 'MED', sub: '1.8S 100HP REVIVE', gadgetId: 'medkit', gadget: '600HP MEDIC BAG + 9 DRESSINGS' },
    { id: 'support', key: 'F8', icon: '📦', label: 'SUPPORT', short: 'SUP', sub: '1.75× SUPP + STASH', gadgetId: 'ammocrate', gadget: 'AMMO STASH [7] + 80 ARMOR' },
    { id: 'recon', key: 'F9', icon: '🎯', label: 'RECON', short: 'RCN', sub: 'JTAC [Q] + UAV STEALTH', gadgetId: 'c4', gadget: 'BEACON [6] + 20S JTAC PAINT' },
    { id: 'armor', key: 'F10', icon: '🛡️', label: 'ARMOR', short: 'ARM', sub: 'TANK LICENSE + ORDER [9]', gadgetId: 'rpg7', gadget: 'TANK/IFV LICENSE + ORDER [9]' },
    { id: 'pilot', key: 'F11', icon: '✈️', label: 'PILOT', short: 'PLT', sub: 'PILOT LICENSE + ORDER [9]', gadgetId: 'stinger', gadget: 'PLANE/B-2 LICENSE + ORDER [9]' }
  ],
  medieval: [
    { id: 'swordsman', key: 'F5', icon: '⚔️', label: 'FOOTMAN (1H)', short: '1H', sub: '1H SWORD + 1H SHIELD', gadgetId: 'pitch_pot', gadget: '1H SWORD & 1H HEATER SHIELD (70% BLOCK)' },
    { id: 'greatsword_knight', key: 'F6', icon: '🗡️', label: 'CHAMPION (2H)', short: '2H', sub: '2H LONGSWORD + 2H SHIELD', gadgetId: 'tower_shield_2h', gadget: '2H GREATSWORD (165 DMG) + 2H LARGE SHIELD' },
    { id: 'polearm_knight', key: 'F7', icon: '🔱', label: 'LANCER KNIGHT', short: 'LNC', sub: 'POLEARM SPEAR + HORSE', gadgetId: 'knight_lance', gadget: 'LONG SPEAR / COUCHED LANCE + WARHORSE' },
    { id: 'archer', key: 'F8', icon: '🏹', label: 'ARCHER', short: 'ARC', sub: 'YEW LONGBOW + 1H SWORD', gadgetId: 'medkit', gadget: 'ROYAL YEW LONGBOW + 1H SWORD & SHIELD' },
    { id: 'crossbowman', key: 'F9', icon: '🎯', label: 'CROSSBOWMAN', short: 'XBW', sub: 'CROSSBOW + 2H SHIELD', gadgetId: 'tower_shield_2h', gadget: 'HEAVY ARBALEST (148 DMG) + 2H PAVISE SHIELD' },
    { id: 'mounted_knight', key: 'F10', icon: '🏇', label: 'HORSE ARCHER', short: 'CAV', sub: 'WARHORSE + BOW + LANCE', gadgetId: 'knight_lance', gadget: 'ARMORED WARHORSE + LONGBOW + LANCE' }
  ],
  jurassic_human: [
    { id: 'archer', key: 'F5', icon: '🏹', label: 'BOW HUNTER', short: 'BOW', sub: 'YEW LONGBOW + SWORD', gadgetId: 'medkit', gadget: 'YEW HUNTING LONGBOW + 1H SWORD & SHIELD' },
    { id: 'crossbowman', key: 'F6', icon: '🎯', label: 'ARBALEST HUNTER', short: 'XBW', sub: 'HEAVY CROSSBOW + 2H SHIELD', gadgetId: 'tower_shield_2h', gadget: 'HEAVY DINO CROSSBOW (148 DMG) + 2H PAVISE SHIELD' },
    { id: 'polearm_knight', key: 'F7', icon: '🔱', label: 'SPEAR LANCER', short: 'SPR', sub: 'LONG DINO SPEAR + SWORD', gadgetId: 'knight_lance', gadget: 'LONG DINO-PIERCING SPEAR (5.8M) + WARHORSE' },
    { id: 'mounted_knight', key: 'F8', icon: '🏇', label: 'MOUNTED HUNTER', short: 'CAV', sub: 'WARHORSE + BOW + LANCE', gadgetId: 'knight_lance', gadget: 'WARHORSE MOUNT + LONGBOW + COUCHED LANCE' },
    { id: 'greatsword_knight', key: 'F9', icon: '🗡️', label: 'APEX CLEAVER (2H)', short: '2H', sub: '2H GREATSWORD + 2H SHIELD', gadgetId: 'tower_shield_2h', gadget: '2H GREATSWORD (165 DMG) + 2H LARGE SHIELD' },
    { id: 'swordsman', key: 'F10', icon: '⚔️', label: 'BLADE TRACKER (1H)', short: '1H', sub: '1H SWORD & SHIELD + DAGGERS', gadgetId: 'pitch_pot', gadget: '1H BLADE & SHIELD + THROWING SPEARS' }
  ],
  jurassic_dino: [
    { id: 'dino_raptor', key: 'F5', icon: '🦖', label: 'VELOCIRAPTOR', short: 'RAP', sub: 'TALONS + VENOM + T-REX', gadgetId: 'medkit', gadget: 'SICKLE TALONS + ACID SPIT + MOUNT T-REX' }
  ]
};

export function getEraRoles(era = 'modern', team = 'US') {
  const normEra = String(era || 'modern').toLowerCase();
  if (normEra === 'medieval') {
    return ERA_ROLES.medieval;
  }
  if (normEra === 'jurassic') {
    return team === 'RU' ? ERA_ROLES.jurassic_dino : ERA_ROLES.jurassic_human;
  }
  return ERA_ROLES.modern;
}

export function getAllowedRoleIds(era = 'modern', team = 'US') {
  return getEraRoles(era, team).map((r) => r.id);
}

export function resolveRoleForEra(role, era = 'modern', team = 'US') {
  const allowed = getAllowedRoleIds(era, team);
  const norm = String(role || '').toLowerCase();
  return allowed.includes(norm) ? norm : allowed[0];
}

export function getRoleByHotkey(keyCode, era = 'modern', team = 'US') {
  const list = getEraRoles(era, team);
  const found = list.find((r) => r.key === keyCode);
  return found ? found.id : null;
}

/**
 * Returns era-accurate faction display labels so Medieval Era displays
 * WEST / WEST KINGDOM / WEST KEEP vs EAST / EAST EMPIRE / EAST CITADEL
 * instead of US vs RU, while keeping internal `'US'` / `'RU'` simulation IDs intact.
 */
export function getFactionLabel(team = 'US', era = 'modern', variant = 'short') {
  const normEra = String(era || 'modern').toLowerCase();
  const isRu = team === 'RU';
  if (normEra === 'medieval') {
    if (variant === 'forces' || variant === 'full') {
      return isRu ? 'EAST EMPIRE' : 'WEST KINGDOM';
    }
    if (variant === 'hq') {
      return isRu ? 'EAST CITADEL' : 'WEST KEEP';
    }
    return isRu ? 'EAST' : 'WEST';
  }
  if (normEra === 'jurassic') {
    if (variant === 'forces' || variant === 'full') {
      return isRu ? 'DINOSAURS' : 'USA + RUSSIA';
    }
    if (variant === 'hq') {
      return isRu ? 'DINO CALDERA' : 'HUMAN HQ';
    }
    return isRu ? 'DINO' : 'HUMAN';
  }
  if (variant === 'forces' || variant === 'full') {
    return isRu ? 'RU FORCES' : 'US FORCES';
  }
  if (variant === 'hq') {
    return isRu ? 'RU HQ' : 'US HQ';
  }
  return isRu ? 'RU' : 'US';
}

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
  TANK_SHELL: { speed: 780, gravity: 1.85, life: 4.5 },
  AUTOCANNON: { speed: 460, gravity: 2.1, life: 3.6 },
  ATGM_TOW: {
    speed: 118,
    maxSpeed: 235,
    accel: 115,
    gravity: 0.0,
    life: 9.5,
    turnRate: 4.4,
    blastRadius: 7.2,
    blastDamage: 430
  },
  AIR_ROCKET: { speed: 175, gravity: 0.65, life: 4.5 },
  A2A_MISSILE: { speed: 215, gravity: 0.0, life: 6.5, turnRate: 3.8 },
  STINGER_SAM: { speed: 265, gravity: 0.0, life: 6.5, turnRate: 5.2, blastRadius: 10.5, blastDamage: 560 },
  JDAM_BOMB: { speed: 42, gravity: 26.0, life: 68.0, blastRadius: 11.5, blastDamage: 380 },
  GBU28_BOMB: { speed: 38, gravity: 28.0, life: 68.0, blastRadius: 16.5, blastDamage: 560 },
  B2_CARPET_BOMB: { speed: 95, gravity: 28.0, life: 68.0, blastRadius: 13.5, blastDamage: 460 },
  GBU57_MOP: { speed: 85, gravity: 28.0, life: 68.0, blastRadius: 24.0, blastDamage: 950 },
  WRIGHT_DYNAMITE: { speed: 28, gravity: 20.0, life: 45.0, blastRadius: 15.0, blastDamage: 680 },
  MORTAR_SHELL: { speed: 78, gravity: 18.0, life: 18.0, blastRadius: 11.5, blastDamage: 340 },
  AC130_40MM: { speed: 165, gravity: 1.8, life: 32.0, blastRadius: 7.5, blastDamage: 240 },
  AC130_105MM: { speed: 145, gravity: 4.5, life: 36.0, blastRadius: 14.5, blastDamage: 620 },
  C4_BLAST_RADIUS: 5.6,
  C4_BLAST_DAMAGE: 250,
};

// ---------------------------------------------------------------------------
// DISTANCES
// ---------------------------------------------------------------------------
export const DISTANCES = {
  INTERACT_RANGE: 4.5,
  VEHICLE_ENTER_RANGE: 7.5,
  FLAG_EXTRA_PAD: 18,
  RAYCAST_MAX: 4800,
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

  // Squad Field Ammo & Kit Stash / Supply Crate
  AMMO_CRATE_TIMER: 120,
  AMMO_CRATE_RADIUS: 6.0,
  AMMO_STASH_COOLDOWN: 45,
};

// ---------------------------------------------------------------------------
// VEHICLES (Realistic Combat Speeds & Physical Turn-Radius Envelopes Across All Eras)
// - Ground Vehicles obey both low-speed Ackermann / Skid-Steer R_min AND high-speed lateral tire/track G-limits:
//   * Main Battle Tank (M1A2 / T-90M): 19.0 m/s (68 km/h), 0.0m neutral pivot in place, ~42m turn radius @ 68 km/h (~0.88G)
//   * Mobile Air Defense (LAV-AD / Tunguska): 21.5 m/s (77 km/h), 0.0m/6.2m low-speed, ~49m turn radius @ 77 km/h (~0.96G)
//   * Wheeled 8x8 IFV / APC (LAV-25 / BTR-82A): 24.0 m/s (86 km/h), 8.8m R_min (17.6m circle), ~60m @ 86 km/h (~0.98G)
//   * Tactical 4x4 Armored Car (M1151 Humvee / GAZ Tigr): 27.5 m/s (99 km/h), 7.5m R_min (24.6 ft), ~70m @ 99 km/h (~1.10G)
//   * Tactical 4x4 Quad ATV (Polaris MV850): 28.5 m/s (103 km/h), 3.8m R_min, ~69m @ 103 km/h (~1.20G)
//   * Military Recon Motorcycles (M1030M1 / AWD 450 / KLR650): 29.0–36.5 m/s (104–131 km/h), 2.8–3.3m R_min, ~67–96m @ top speed
// - Fixed-Wing Aircraft obey aerodynamic load-factor bank-to-turn physics (R = V^2 / a_lat):
//   * 1903 Wright Flyer I: 22 m/s (79 km/h) cruise, 34 m/s (122 km/h) max, ~29m tight biplane turn radius
//   * AC-130J / Tu-95MS Gunship: 54 m/s (194 km/h) orbit, 86 m/s (310 km/h) transit, 195m–1,220m pylon / ~188–450m transit radius
//   * A-10C / Su-25SM CAS: 78 m/s (281 km/h) cruise, 128 m/s (461 km/h) dash, ~132m valley loiter turn radius (4.7G)
//   * F-15EX / Su-57 Fighter: 125 m/s (450 km/h) corner, 215 m/s (774 km/h) afterburner, ~244m corner / ~616m AB radius (6.5–7.6G)
//   * B-2A Spirit / PAK DA Stealth Bomber: 115 m/s (414 km/h) cruise, 164 m/s (590 km/h) max, ~678m–1,280m wide bomber radius (2.0G)
// ---------------------------------------------------------------------------
export const VEHICLE_STATS = {
  TANK: { maxHp: 1600, speed: 19.0, accelRate: 1.45, brakeRate: 2.4, turnRate: 0.72, minTurnRadiusM: 5.5, maxLatAccelMs2: 8.6, canNeutralPivot: true, minPitchRad: -0.18, maxPitchRad: 0.35 },
  APC: { maxHp: 1050, speed: 24.0, accelRate: 1.95, brakeRate: 2.8, turnRate: 1.15, minTurnRadiusM: 8.8, maxLatAccelMs2: 9.6, minPitchRad: -0.18, maxPitchRad: 0.52 },
  AA_VEHICLE: { maxHp: 980, speed: 21.5, accelRate: 1.9, brakeRate: 2.7, turnRate: 0.80, minTurnRadiusM: 6.2, maxLatAccelMs2: 9.4, canNeutralPivot: true, minPitchRad: -0.14, maxPitchRad: 1.48 },
  HUMVEE: { maxHp: 700, speed: 27.5, accelRate: 2.55, brakeRate: 3.4, turnRate: 1.45, minTurnRadiusM: 7.5, maxLatAccelMs2: 10.8, minPitchRad: -0.26, maxPitchRad: 1.05 },
  TRUCK_TRANSPORT: { maxHp: 920, speed: 23.0, accelRate: 1.85, brakeRate: 2.9, turnRate: 1.05, minTurnRadiusM: 9.4, maxLatAccelMs2: 9.0, minPitchRad: -0.22, maxPitchRad: 0.95 },
  HELI_TRANSPORT: { maxHp: 1750, speed: 68.0, minSpeed: 0, maxSpeed: 82.0, climbRateMs: 11.2, maxFwdTiltRad: 0.46, yawAuthorityMult: 1.0, rollAgilityMult: 1.0, massTonnes: 9.1, accelRate: 4.9, brakeRate: 4.2, turnRate: 1.55, maxTurnAccelMs2: 24.0, dialMaxKmh: 360, serviceCeilingM: 5790 },
  HELI_MI8: { maxHp: 1920, speed: 62.5, minSpeed: 0, maxSpeed: 70.5, climbRateMs: 9.4, maxFwdTiltRad: 0.40, yawAuthorityMult: 0.88, rollAgilityMult: 0.88, massTonnes: 11.8, accelRate: 4.15, brakeRate: 3.9, turnRate: 1.38, maxTurnAccelMs2: 21.5, dialMaxKmh: 360, serviceCeilingM: 5000 },
  HELI_ATTACK: { maxHp: 1580, speed: 74.0, minSpeed: 0, maxSpeed: 84.5, climbRateMs: 12.7, maxFwdTiltRad: 0.51, yawAuthorityMult: 1.08, rollAgilityMult: 1.15, massTonnes: 8.0, accelRate: 5.5, brakeRate: 4.5, turnRate: 1.82, maxTurnAccelMs2: 29.0, dialMaxKmh: 360, serviceCeilingM: 6400 },
  HELI_KA52: { maxHp: 1650, speed: 75.5, minSpeed: 0, maxSpeed: 86.5, climbRateMs: 14.2, maxFwdTiltRad: 0.53, yawAuthorityMult: 1.24, rollAgilityMult: 1.18, massTonnes: 10.4, accelRate: 5.75, brakeRate: 4.6, turnRate: 2.05, maxTurnAccelMs2: 31.0, dialMaxKmh: 360, serviceCeilingM: 5500 },
  PLANE_CAS: { maxHp: 1550, speed: 70, minSpeed: 32, maxSpeed: 104, accelRate: 3.1, brakeRate: 3.4, turnRate: 1.15, maxTurnAccelMs2: 58.0, dialMaxKmh: 440, serviceCeilingM: 13700 },
  PLANE_BOMBER: { maxHp: 1400, speed: 105, minSpeed: 44, maxSpeed: 175, accelRate: 4.2, brakeRate: 3.2, turnRate: 0.88, maxTurnAccelMs2: 48.0, dialMaxKmh: 680, serviceCeilingM: 18300 },
  PLANE_FIGHTER: { maxHp: 1300, speed: 125, minSpeed: 45, maxSpeed: 215, accelRate: 5.8, brakeRate: 3.8, turnRate: 1.02, maxTurnAccelMs2: 64.0, dialMaxKmh: 820, serviceCeilingM: 19800 },
  PLANE_GUNSHIP: { maxHp: 3200, speed: 54, minSpeed: 30, maxSpeed: 86, accelRate: 2.4, brakeRate: 2.5, turnRate: 0.48, maxTurnAccelMs2: 15.5, dialMaxKmh: 340, serviceCeilingM: 9100 },
  PLANE_B2_SPIRIT: { maxHp: 2400, speed: 115, minSpeed: 46, maxSpeed: 164, accelRate: 4.0, brakeRate: 3.0, turnRate: 0.45, maxTurnAccelMs2: 19.5, stealthFactor: 0.12, dialMaxKmh: 620, serviceCeilingM: 15240 },
  // 1903 Wright Flyer I ("Kitty Hawk Flyer" — Pioneer Spruce-and-Muslin Biplane):
  // Real-world stall ~30 km/h (8.5 m/s), barnstorming cruise 79 km/h (22 m/s), max dive/tailwind 122 km/h (34 m/s), ~29m turn radius!
  PLANE_WRIGHT_FLYER: { maxHp: 1800, speed: 22.0, minSpeed: 8.5, maxSpeed: 34.0, accelRate: 1.15, brakeRate: 2.1, turnRate: 1.45, maxTurnAccelMs2: 16.5, stealthFactor: 0.25, dialMaxKmh: 160, serviceCeilingM: 2400 },
  EMPLACEMENT: { maxHp: 650, speed: 0, accelRate: 0, brakeRate: 10, turnRate: 0, minPitchRad: -0.26, maxPitchRad: 1.05 },

  // Military Recon Motorcycles, Silent E-Motos & Tactical 4x4 Quad ATV Stats (Realistic speed & lean-grip turn radii)
  BIKE_50CC: { maxHp: 380, speed: 18.5, accelRate: 3.5, brakeRate: 4.8, turnRate: 2.45, minTurnRadiusM: 2.4, maxLatAccelMs2: 11.5, cc: 50 },
  BIKE_125CC_2T: { maxHp: 420, speed: 29.0, accelRate: 4.8, brakeRate: 5.2, turnRate: 2.4, minTurnRadiusM: 2.8, maxLatAccelMs2: 12.6, cc: 125, isTwoStroke: true },
  BIKE_250CC_2T: { maxHp: 460, speed: 32.0, accelRate: 5.5, brakeRate: 5.4, turnRate: 2.35, minTurnRadiusM: 2.9, maxLatAccelMs2: 12.8, cc: 250, isTwoStroke: false },
  BIKE_500CC_2T: { maxHp: 520, speed: 35.0, accelRate: 6.2, brakeRate: 5.6, turnRate: 2.25, minTurnRadiusM: 3.1, maxLatAccelMs2: 13.0, cc: 450, isTwoStroke: false },
  BIKE_600CC: { maxHp: 560, speed: 36.5, accelRate: 5.8, brakeRate: 6.0, turnRate: 2.15, minTurnRadiusM: 3.3, maxLatAccelMs2: 13.0, cc: 650 },
  BIKE_750CC: { maxHp: 600, speed: 38.0, accelRate: 6.3, brakeRate: 6.2, turnRate: 2.1, minTurnRadiusM: 3.4, maxLatAccelMs2: 13.2, cc: 750 },
  BIKE_1000CC: { maxHp: 650, speed: 40.5, accelRate: 7.0, brakeRate: 6.8, turnRate: 2.05, minTurnRadiusM: 3.5, maxLatAccelMs2: 13.5, cc: 1000 },
  SCOOTER_KUKIRIN: { maxHp: 360, speed: 22.0, accelRate: 6.0, brakeRate: 5.5, turnRate: 2.6, minTurnRadiusM: 2.5, maxLatAccelMs2: 11.8, isElectric: true },
  EMOTO_TUTTIO: { maxHp: 390, speed: 21.5, accelRate: 6.2, brakeRate: 5.4, turnRate: 2.55, minTurnRadiusM: 2.5, maxLatAccelMs2: 11.8, isElectric: true },
  EMOTO_YOZMA: { maxHp: 430, speed: 25.5, accelRate: 6.8, brakeRate: 5.5, turnRate: 2.45, minTurnRadiusM: 2.7, maxLatAccelMs2: 12.2, isElectric: true },
  EMOTO_CEMOTO: { maxHp: 460, speed: 29.0, accelRate: 7.2, brakeRate: 5.6, turnRate: 2.4, minTurnRadiusM: 2.8, maxLatAccelMs2: 12.6, isElectric: true },
  EMOTO_SURRON: { maxHp: 480, speed: 32.0, accelRate: 7.8, brakeRate: 5.8, turnRate: 2.4, minTurnRadiusM: 2.9, maxLatAccelMs2: 12.8, isElectric: true },
  EMOTO_STARK_VARG: { maxHp: 550, speed: 35.5, accelRate: 8.8, brakeRate: 6.2, turnRate: 2.3, minTurnRadiusM: 3.1, maxLatAccelMs2: 13.0, isElectric: true },
  ATV_QUAD: { maxHp: 680, speed: 28.5, accelRate: 4.8, brakeRate: 5.2, turnRate: 2.1, minTurnRadiusM: 3.8, maxLatAccelMs2: 11.8 },

  // RPM values (Upgraded high-cadence mounted weapons: .50 Cal M2HB 720 RPM, 7.62mm Coax MG 950 RPM, 30mm Autocannon 330 RPM, A-10 GAU-8 1320 RPM)
  RPM_TANK_US: 28,
  RPM_TANK_RU: 26,
  RPM_APC: 330,
  RPM_AA_AUTOCANNON: 1050,
  RPM_HUMVEE: 550,
  RPM_COAX: 950,
  RPM_GAU8: 1320,
  RPM_BOMBER_JDAM: 48,
  RPM_B2_CARPET: 260,
  RPM_WRIGHT_GATLING: 840,
  RPM_FIGHTER_VULCAN: 1080,
  RPM_AC130_25MM: 1600,
  RPM_AC130_40MM: 120,
  RPM_AC130_105MM: 18,
  RPM_EMPLACE_HMG: 750,
  RPM_EMPLACE_AA: 1100,
  RPM_MORTAR: 24,
  RPM_HELI_MINIGUN: 1500,
  RPM_HELI_30MM: 650,

  // Respawn delays (seconds) & Faction War-Chest Economy (Crew + Equipment Replacement)
  RESPAWN_DELAY_TANK: 34.0,
  RESPAWN_DELAY_APC: 26.0,
  RESPAWN_DELAY_HUMVEE: 18.0,
  RESPAWN_DELAY_TRUCK: 20.0,
  RESPAWN_DELAY_HELI: 34.0,
  RESPAWN_DELAY_PLANE: 42.0,
  RESPAWN_DELAY_B2_SPIRIT: 95.0,

  // Faction Treasury / Money costs for aircraft, heavy armor & car replacements + requisitions
  INITIAL_FACTION_FUNDS: 6000,
  FACTION_KILL_REWARD: 135,
  FACTION_CAPTURE_REWARD: 550,
  FACTION_COST_PLANE: 1500,
  FACTION_COST_CAS: 800,
  FACTION_COST_FIGHTER: 900,
  FACTION_COST_GUNSHIP: 1200,
  FACTION_COST_B2_SPIRIT: 2500,
  FACTION_COST_HELI_TRANSPORT: 700,
  FACTION_COST_HELI_ATTACK: 1150,
  FACTION_COST_TANK: 1300,
  FACTION_COST_APC: 800,
  FACTION_COST_AA: 850,
  FACTION_COST_CAR: 350,
  FACTION_COST_TRUCK: 250,
  B2_UNLOCK_KILLS: 25,

  // Ticket costs (Trained Crew Personnel + Expensive Military Hardware)
  TICKET_COST_TRUCK: 6,
  TICKET_COST_HUMVEE: 8,
  TICKET_COST_APC: 16,
  TICKET_COST_AA: 16,
  TICKET_COST_HELI_TRANSPORT: 18,
  TICKET_COST_TANK: 24,
  TICKET_COST_HELI_ATTACK: 26,
  TICKET_COST_PLANE: 30,
  TICKET_COST_GUNSHIP: 34,
  TICKET_COST_B2_SPIRIT: 45,

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
  ENGAGE_RANGE_AIRCRAFT: 650,

  // Combat & XP (Scaled to Asset Value: Plane > Tank > IFV/AA > Car)
  DESTROY_XP_B2: 900,
  DESTROY_XP_PLANE: 650,
  DESTROY_XP_TANK: 500,
  DESTROY_XP_APC: 380,
  DESTROY_XP_CAR: 250,
  DESTROY_XP_OTHER: 250,
  BAILOUT_DAMAGE: 42,
  ROADKILL_XP: 150,
  ROADKILL_DAMAGE_BOT: 160,
  ROADKILL_DAMAGE_PLAYER: 150,

  // Expanded Battlefield Two-Tier Map & Realistic Stratosphere Airspace Bounds (19,800m / 65,000 ft Fighter Ceiling)
  AIRSPACE_MAX_X: 4600,
  AIRSPACE_MAX_Z: 3400,
  AIRSPACE_MAX_ALT: 19800,
  AIRSPACE_DEFAULT_ALT: 220,
  SERVICE_CEILINGS: {
    wright_flyer: 2400,  // Barnstorming biplane unpressurized open-frame ceiling (~7,870 ft)
    heli_transport: 6100,// UH-60M Black Hawk / Mi-8AMTSh utility rotorcraft ceiling (~20,000 ft)
    heli_attack: 6400,   // AH-64E Apache Longbow / Ka-52 Alligator attack rotorcraft ceiling (~21,000 ft)
    gunship: 9100,       // AC-130J / Tu-95MS pressurized turboprop ceiling (30,000 ft)
    cas: 13700,          // A-10C Thunderbolt II / Su-25SM service ceiling (45,000 ft)
    b2_spirit: 15240,    // Northrop B-2A Spirit high-altitude stealth cruise ceiling (50,000 ft)
    bomber: 18300,       // F-15E Strike Eagle / Su-34 Fullback ceiling (60,000 ft)
    fighter: 19800       // F-15EX / F-22A / Su-57 stratosphere ceiling (65,000 ft)
  },
};
export const VEHICLES = VEHICLE_STATS;

// ---------------------------------------------------------------------------
// CAMERA & RENDERER
// ---------------------------------------------------------------------------
export const CAMERA = {
  FOV: 75,
  NEAR: 0.08,
  FAR: 68000,
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

  // Cash gain & Unified 3-Pillar Economy (CoD Match Cash + Squad Asset Risk + Tarkov Armory Bank)
  CASH_MIN: 15,
  CASH_MULT: 0.65,

  // UAV recon assist
  UAV_RECON_ASSIST_PTS: 45,
};

export const ECONOMY = {
  STARTING_MATCH_CASH: 50,
  VICTORY_EXTRACTION_MULT: 1.5,
  DEFEAT_EXTRACTION_MULT: 1.15,

  // Base ⚡ Match Cash Requisition Prices for ON-DEMAND Field Drops / Extra Sorties
  // (Vehicles already parked at Main Base HQ Runway & Motor Pool are ALWAYS $0 FREE to board!)
  VEHICLE_BASE_COST: {
    foot: 0,
    bike: 100,
    atv: 150,
    truck_transport: 300,
    car: 450,
    heli_transport: 750,
    apc: 850,
    aa: 950,
    heli_attack: 1250,
    tank: 1400,
    wright_flyer: 300,
    cas: 1100,
    fighter: 1350,
    gunship: 2200,
    b2_spirit: 3200
  },

  // Tarkov-style Modded Kit Surcharge (Only when paid Hangar/Armor mods are equipped & Stock mode is OFF)
  VEHICLE_MOD_SURCHARGE: {
    foot: 0,
    bike: 0,
    atv: 0,
    truck_transport: 0,
    car: 50,
    heli_transport: 75,
    apc: 100,
    aa: 100,
    heli_attack: 125,
    tank: 150,
    wright_flyer: 0,
    cas: 125,
    fighter: 125,
    gunship: 200,
    b2_spirit: 250
  },

  // Squad-style Per-Asset Requisition Cooldowns (seconds)
  VEHICLE_COOLDOWN_SEC: {
    foot: 0,
    bike: 20,
    atv: 25,
    truck_transport: 25,
    car: 25,
    heli_transport: 40,
    apc: 40,
    aa: 45,
    heli_attack: 55,
    tank: 65,
    wright_flyer: 25,
    cas: 50,
    fighter: 55,
    gunship: 80,
    b2_spirit: 110
  },

  // Role-Balanced ⚡ Match Cash Faucets
  REWARDS: {
    FLAG_NEUTRALIZE: 90,
    FLAG_CAPTURE: 180,
    INFANTRY_KILL: 75,
    HEADSHOT_BONUS: 25,
    MEDIC_REVIVE: 85,
    MEDIC_HEAL: 35,
    ENGINEER_REPAIR: 65,
    AT_AA_HIT: 50,
    DESTROY_CAR: 150,
    DESTROY_APC: 260,
    DESTROY_TANK: 380,
    DESTROY_AIRCRAFT: 450,
    LOGISTICS_ASSIST: 45
  }
};

// ---------------------------------------------------------------------------
// WEATHER
// ---------------------------------------------------------------------------
export const WEATHER = {
  TIMER_MIN: 120,
  TIMER_RAND: 180,
  FOG_DENSITY_BASE: 0.0006,
};

// ---------------------------------------------------------------------------
// TERRAIN
// ---------------------------------------------------------------------------
export const TERRAIN = {
  MAX_SPAN: 4,          // structural integrity cantilever span
  BRIDGE_DECK_HEIGHT: 1.25,
  BUILDING_COLLAPSE_THRESHOLD: 0.40, // ratio: <= 0.40 means >=60% of story load-bearing supports destroyed -> collapse!
  FLAG_RADIUS_DEFAULT: 34,
  FLAG_RADIUS_CHARLIE: 36,
};

// ---------------------------------------------------------------------------
// MATERIALS (voxel HP values)
// ---------------------------------------------------------------------------
export const MAT_HP = {
  BRICK: 90,
  CONCRETE: 130,
  DARK_CONCRETE: 165,
  STEEL_BEAM: 750,
  SANDBAG: 85,
  WOOD: 55,
  CONTAINER: 150,
  PROP: 35,
};

// ---------------------------------------------------------------------------
// SQUAD 9-MAN KIT & FIRE-SUPPORT CATEGORY CAPS (Offworld Industries Squad Rules)
// - Standard 9-man infantry squad: 1 SL + 3–4 Riflemen + max 2 Medics + max 3 Fire-Support
// - Fire-Support / Specialist caps prevent RPG-7 & Sniper spam across 500-player battles!
// ---------------------------------------------------------------------------
export const SQUAD_KIT_CAPS = {
  SQUAD_SIZE: 9,
  MAX_FIRE_SUPPORT_PER_9: 3, // Combined cap across ENGINEER (LAT), SUPPORT (LMG), and RECON (Marksman)
  ROLE_MAX_PER_9: {
    assault: 9,   // Unlimited Rifleman / Breacher backbone
    medic: 2,     // Max 2 Combat Medics per 9-man squad
    engineer: 2,  // Max 2 LAT (RPG-7) per 9-man squad (1 in standard squads, 2 in Charlie Anti-Armor)
    support: 2,   // Max 2 Automatic Riflemen (LMG) per 9-man squad
    recon: 1,     // Max 1 Marksman / Sniper per 9-man squad
    armor: 9,     // Dedicated BRAVO / IRON Armor Crewmen (PDW + Repair, no RPG spam)
    pilot: 9      // Dedicated FALCON / VIPER Combat Pilots
  },
  // Specialized Squad Types (Squad / Project Reality Combined-Arms Organization for up to 250v250):
  // Differentiates 9-Man Infantry Squads, 6-Man Recon Teams, 4-Man Armor Crews, and 4-Man Pilot Wings!
  SQUAD_TYPES: {
    INFANTRY: {
      id: 'INFANTRY',
      label: '🪖 INFANTRY SQUAD (9P)',
      shortTag: 'INF • 9P',
      maxSize: 9,
      roleCaps: { assault: 9, medic: 2, engineer: 2, support: 2, recon: 1, armor: 0, pilot: 0 }
    },
    RECON: {
      id: 'RECON',
      label: '🎯 RECON / JTAC TEAM (6P)',
      shortTag: 'REC • 6P',
      maxSize: 6,
      roleCaps: { assault: 6, medic: 2, engineer: 1, support: 1, recon: 2, armor: 0, pilot: 0 }
    },
    ARMOR: {
      id: 'ARMOR',
      label: '🛡️ ARMOR CREW SQUAD (4P)',
      shortTag: 'ARM • 4P',
      maxSize: 4,
      roleCaps: { armor: 4, engineer: 2, medic: 1, assault: 1, support: 0, recon: 0, pilot: 0 }
    },
    AIR: {
      id: 'AIR',
      label: '✈️ TACTICAL AIR WING (4P)',
      shortTag: 'AIR • 4P',
      maxSize: 4,
      roleCaps: { pilot: 4, recon: 1, engineer: 1, medic: 0, assault: 0, support: 0, armor: 0 }
    }
  },
  BADGE_LABELS: {
    assault: 'UNLIMITED RIFLEMAN',
    medic: 'MAX 2 / SQUAD',
    engineer: 'MAX 1–2 LAT / SQUAD',
    support: 'MAX 2 LMG / SQUAD',
    recon: 'MAX 1–2 SNIPER / SQUAD',
    armor: 'ARMOR SQUAD (4P CREW)',
    pilot: 'AIR WING SQUAD (4P)'
  }
};

// ---------------------------------------------------------------------------
// BOT
// ---------------------------------------------------------------------------
export const BOT = {
  HP: 100,
  MAX_HP: 100,
  ARMOR_HP: 35,
  BLEEDOUT_TIMER: 95.0,
  RESPAWN_TIMER: 3.5,

  // Engage ranges (Squad-calibrated LAT RPG-7 effective anti-armor range < 92m)
  ENGAGE_RANGE_INFANTRY: 115,
  ENGAGE_RANGE_RPG_CHECK: 92,
  ENGAGE_RANGE_RPG_TOGGLE: 86,
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
  RESCUE_RANGE_MEDIC: 95,
  RESCUE_RANGE_OTHER: 20,

  // Medic Injury Healing & Squad Medical Supplies (9 Field Dressings for Medics, 2 for others + 1 Medic Bag)
  FIELD_DRESSINGS_MEDIC: 9,
  FIELD_DRESSINGS_OTHER: 2,
  MEDIC_BAG_MAX_SUPPLY: 600,
  MEDIC_HEAL_RANGE: 60,
  MEDIC_HEAL_AURA_RADIUS: 7.5,
  MEDIC_HEAL_RATE: 34,

  // Revive (Field Dressing stabilizes casualty at 40 HP; Medic Bag then heals to 100 HP!)
  REVIVE_HP: 40,
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

  // Shoot cooldowns (Squad LAT RPG-7 single-tube manual reload: 9.5–13.0s, 2 HEAT rockets per spawn, 1 MANPADS SAM for AA techs)
  BURST_PAUSE_BASE: 0.48,
  BURST_PAUSE_RAND: 0.4,
  BURST_SHOT_INTERVAL: 0.11,
  RPG_COOLDOWN_BASE: 9.5,
  RPG_COOLDOWN_RAND: 3.5,
  RPG_ROCKETS_PER_SPAWN: 2,
  SAM_MISSILES_PER_SPAWN: 1,

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
  VEHICLE_SEEK_RANGE_BRAVO: 240,
  VEHICLE_SEEK_RANGE_OTHER: 95,
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
  INITIAL_TICKETS_US: 800,
  INITIAL_TICKETS_RU: 800,
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
  DEFAULT_MASTER_VOLUME: 80,
  DEFAULT_WEAPONS_VOLUME: 85,
  DEFAULT_EXPLOSIONS_VOLUME: 85,
  DEFAULT_VEHICLES_VOLUME: 80,
  DEFAULT_RADIO_VOLUME: 80,
  DEFAULT_MUSIC_VOLUME: 65,
  SPEED_OF_SOUND_MPS: 343,
  MAX_ACTIVE_VOICES: 36,
  VOICE_CULL_DIST: 55,
  TANK_CANNON_MAX_DIST: 950,
  EXPLOSION_MAX_DIST: 900,
  AUTOCANNON_IMPACT_MAX_DIST: 240,
  WHIZ_COOLDOWN_MS: 115,
  EXPLOSION_COOLDOWN_MS: 50,
  AUTOCANNON_COOLDOWN_MS: 65,
};

// ---------------------------------------------------------------------------
// NETWORK & BATTLEBIT AI POPULATION SCALE (Up to 250 per side = 500 Combatants: 1 Player + 499 AI)
// ---------------------------------------------------------------------------
export const NETWORK = {
  BOTS_ULTRA_AI: 250,    // 500 Total Combatants (1 Player + 499 AI = 250 US vs 250 RU)
  BOTS_MASSIVE_AI: 125,  // 125 US + 125 RU = 250 Scale
  BOTS_LARGE_AI: 80,     // 80 US + 80 RU = 160 Scale
  BOTS_TACTICAL_AI: 40,  // 40 US + 40 RU = 80 Scale
  BOTS_FULL_AI: 125,     // Classic 250 Scale
  BOTS_SQUAD_AI: 16,     // 16 US + 16 RU = 32 Scale
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
