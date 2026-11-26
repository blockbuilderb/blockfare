import {
  WEAPON_DEFS,
  CLASS_LOADOUTS,
  ATTACHMENT_CATALOG,
  CASE_PRICE,
  CASE_GOLD_CHANCE,
  CASE_GUN_POOL,
  GOLD_SPECIAL_POOL,
  createWeaponViewModel
} from '../weapons.js?v=136';
import { sound } from '../audio.js?v=136';
import { PLAYER, ECONOMY, CLASS_TRAITS, resolveRoleForEra } from '../config.js?v=136';
import { events } from '../events.js?v=136';
import { B2_COLOR_PRESETS, applyB2SpiritColorToMesh } from '../models/vehicle-model.js?v=136';

const DEFAULT_WEAPON_ATTACHMENTS = {
  muzzle: 'stock',
  magazine: 'std_mag',
  optic: 'factory',
  grip: 'std_grip',
  ammoType: 'fmj'
};

const DEFAULT_CLASS_SELECTIONS = {
  engineer: { primary: 'm4a1', secondary: 'mp443' },
  assault: { primary: 'ak15', secondary: 'mp443' },
  medic: { primary: 'vector', secondary: 'mp443' },
  support: { primary: 'm249', secondary: 'mp443' },
  recon: { primary: 'sv98', secondary: 'mp443' },
  armor: { primary: 'vector', secondary: 'mp443' },
  pilot: { primary: 'mp7', secondary: 'mp443' },
  swordsman: { primary: 'longsword', secondary: 'throwing_knives' },
  greatsword_knight: { primary: 'greatsword_2h', secondary: 'throwing_knives' },
  polearm_knight: { primary: 'knight_lance', secondary: 'longsword' },
  archer: { primary: 'warbow', secondary: 'longsword' },
  crossbowman: { primary: 'heavy_crossbow', secondary: 'tower_shield_2h' },
  mounted_knight: { primary: 'warbow', secondary: 'knight_lance' }
};

export const VEHICLE_UPGRADE_CATALOG = {
  armorSensor: [
    {
      id: 'std_tank_day',
      name: 'STANDARD DAYLIGHT PERISCOPE & FCS OPTICS (STOCK)',
      shortName: 'DAY OPTICS',
      icon: '🔭',
      price: 0,
      hasNvg: false,
      hasFlir: false,
      zoomFov: 44,
      desc: 'Factory daylight optical sight for Tank, IFV, SPAAG & MRAP turrets.'
    },
    {
      id: 'vvs2_tank_nvg',
      name: 'AN/VVS-2 GEN-3 CREW NIGHT VISION INTENSIFIER [KEY N]',
      shortName: 'CREW NVG [N]',
      icon: '🥽',
      price: 400,
      hasNvg: true,
      hasFlir: false,
      zoomFov: 38,
      desc: 'Adds Green-Phosphor Night Vision [N] to all ground vehicles + slightly deeper gunner zoom!'
    },
    {
      id: 'citv_flir_pod',
      name: '3RD-GEN CITV COMMANDER FLIR THERMAL + NVG SUITE [KEY N]',
      shortName: 'CITV FLIR IR [N]',
      icon: '🌡️',
      price: 800,
      hasNvg: true,
      hasFlir: true,
      zoomFov: 30,
      desc: 'Full Multi-Spectrum [N] Cycling (DAY ➔ NVG GREEN ➔ WHITE-HOT IR ➔ BLACK-HOT IR) + High-Contrast Thermal Target Highlighting & 2.5× Gunner Zoom!'
    }
  ],
  armorDefense: [
    {
      id: 'smoke_disp',
      name: 'M250 IR THERMAL SMOKE DISCHARGER (STOCK)',
      shortName: 'IR SMOKE [X]',
      icon: '💨',
      price: 0,
      bonusHp: 0,
      dmgResist: 0,
      hasTrophyAps: false,
      desc: 'Press [X] inside any Tank/APC/AA to pop a 360° IR Smoke Screen & +180 HP emergency field patch (14s CD).'
    },
    {
      id: 'trophy_aps',
      name: 'TROPHY HV ACTIVE PROTECTION SYSTEM (APS) + SMOKE',
      shortName: 'TROPHY APS [X]',
      icon: '🛡️',
      price: 650,
      bonusHp: 150,
      dmgResist: 0.1,
      hasTrophyAps: true,
      desc: 'Intercepts & destroys incoming RPG-7s, Tank Shells & Missiles during [X] active window (4.5s) + +150 Hull HP & +250 HP patch!'
    },
    {
      id: 'era_bricks',
      name: 'KONTAKT-5 / ARAT-2 HEAVY REACTIVE ARMOR BRICKS',
      shortName: 'HEAVY ERA (+400 HP)',
      icon: '🧱',
      price: 800,
      bonusHp: 400,
      dmgResist: 0.2,
      hasTrophyAps: false,
      desc: 'Bolts Explosive Reactive Armor bricks around the hull & turret: +400 Max Hull HP & -20% incoming explosive damage!'
    }
  ],
  armorWeaponMod: [
    {
      id: 'std_autoloader',
      name: 'STANDARD ORDNANCE & COAXIAL FEED (STOCK)',
      shortName: 'STOCK CANNON',
      icon: '🎯',
      price: 0,
      damageMult: 1.0,
      rpmMult: 1.0,
      coaxHeatMult: 1.0,
      desc: 'Standard factory main gun breech and coaxial machine gun feed.'
    },
    {
      id: 'depleted_uranium',
      name: 'M829A4 APFSDS DEPLETED-URANIUM / HE-FRAG SHELLS',
      shortName: 'DU APFSDS (+28% DMG)',
      icon: '💥',
      price: 750,
      damageMult: 1.28,
      rpmMult: 1.15,
      coaxHeatMult: 0.85,
      desc: '+28% Main Cannon / 30mm Autocannon damage, +15% faster reload & higher muzzle velocity!'
    },
    {
      id: 'coax_minigun',
      name: 'CROWS II M134 / LIQUID-COOLED COAX OVERDRIVE',
      shortName: 'LIQUID COAX (+35% RPM)',
      icon: '🔥',
      price: 600,
      damageMult: 1.12,
      rpmMult: 1.35,
      coaxHeatMult: 0.45,
      desc: '+35% faster firing cadence, -55% Coaxial MG heat buildup & +12% weapon damage!'
    }
  ],
  armorChassis: [
    {
      id: 'std_turbine',
      name: 'FACTORY POWERTRAIN & TORSION BARS (STOCK)',
      shortName: 'STOCK CHASSIS',
      icon: '⚙️',
      price: 0,
      speedMult: 1.0,
      accelMult: 1.0,
      bonusHp: 0,
      hasDozerBlade: false,
      desc: 'Factory military transmission and standard track/wheel suspension.'
    },
    {
      id: 'agt1500_overdrive',
      name: 'AGT-1500 GAS TURBINE OVERDRIVE + HYDRO-SUSPENSION',
      shortName: 'TURBINE (+24% SPD)',
      icon: '⚡',
      price: 550,
      speedMult: 1.24,
      accelMult: 1.35,
      bonusHp: 75,
      hasDozerBlade: false,
      desc: '+24% Top Off-Road Speed, +35% Acceleration & +75 Hull HP across all ground vehicles!'
    },
    {
      id: 'mine_plow',
      name: 'M9 ASSAULT DOZER BLADE & REINFORCED BELLY ARMOR',
      shortName: 'DOZER BLADE (+250 HP)',
      icon: '🚜',
      price: 500,
      speedMult: 1.06,
      accelMult: 1.15,
      bonusHp: 250,
      hasDozerBlade: true,
      desc: 'Mounts a 3D Steel Dozer Blade on the front hull: +250 Max Hull HP & rams through barricades!'
    }
  ],
  armorAmmoRack: [
    {
      id: 'std_armor_rack',
      name: 'STANDARD TURRET BUSTLE / CAROUSEL READY-RACK (STOCK)',
      shortName: 'STD READY-RACK (1×)',
      icon: '📦',
      price: 0,
      isExpandedRack: false,
      accelMult: 1.0,
      desc: 'Authentic ready-to-fire turret stowage: 24 MBT Shells (1,200 MG), 210 IFV 30mm (1,200 Coax), 600 AA + 8 SAMs, 500 .50 BMG.'
    },
    {
      id: 'heavy_hull_stowage',
      name: 'FULL COMBAT LOAD // DEEP-HULL WET STOWAGE & DOUBLE AMMO CANS (~2×)',
      shortName: 'FULL HULL RACK (~2×)',
      icon: '💣',
      price: 700,
      isExpandedRack: true,
      accelMult: 0.96,
      desc: 'Authentic full hull combat stowage (-4% accel mass): 42 MBT Shells (2,400 MG), 420 IFV 30mm, 1,200 AA + 16 SAMs, 1,000 .50 BMG, 48 Mortar!'
    }
  ],
  airSensor: [
    {
      id: 'std_air_hud',
      name: 'FACTORY DAYLIGHT HUD OPTICS (AC-130 & B-2 KEEP BUILT-IN EO/IR)',
      shortName: 'DAY HUD',
      icon: '🔭',
      price: 0,
      hasNvg: false,
      hasFlir: false,
      zoomFov: 46,
      lockRangeMult: 1.0,
      desc: 'Standard optical HUD on Fighters & CAS jets. (AC-130J Ghostrider & B-2A Spirit include built-in NVG + White-Hot / Black-Hot FLIR standard!)'
    },
    {
      id: 'avs9_nvg_pod',
      name: 'AN/AVS-9 AVIATOR GEN-3 NIGHT VISION + LASER SPOTTER [KEY N]',
      shortName: 'AVS-9 NVG [N]',
      icon: '🥽',
      price: 450,
      hasNvg: true,
      hasFlir: false,
      zoomFov: 38,
      lockRangeMult: 1.15,
      desc: 'Equips Green-Phosphor Aviator Night Vision [N] on EVERY plane (F-15EX, A-10C, Su-57, Su-25) + +15% A2A Radar Lock Range!'
    },
    {
      id: 'aaq33_flir_pod',
      name: 'AN/AAQ-33 SNIPER XR EO/IR TARGETING POD (NVG + WHOT/BHOT IR) [KEY N]',
      shortName: 'SNIPER FLIR IR [N]',
      icon: '🌡️',
      price: 850,
      hasNvg: true,
      hasFlir: true,
      zoomFov: 24,
      lockRangeMult: 1.3,
      desc: 'Unlocks Full Multi-Spectrum [N] Cycling (DAY ➔ NVG GREEN ➔ WHITE-HOT FLIR ➔ BLACK-HOT FLIR) on ALL aircraft + Thermal Target Highlighting, High-Mag RMB Sensor Zoom & +30% AMRAAM Lock Range!'
    }
  ],
  airCountermeasure: [
    {
      id: 'std_flares',
      name: 'ALE-47 CHAFF & FLARE DISPENSER (STOCK)',
      shortName: 'STD FLARES [X]',
      icon: '✨',
      price: 0,
      bonusHp: 0,
      flareCdMult: 1.0,
      hasAutoDircm: false,
      desc: 'Press [X] in flight to deploy IR decoy flares that spoof incoming Stinger/SAM/AIM-9X missiles (9s CD).'
    },
    {
      id: 'dircm_ecm',
      name: 'AN/ALQ-184 ECM RADAR JAMMER + AUTO-DIRCM POD',
      shortName: 'ECM + AUTO-DIRCM',
      icon: '📡',
      price: 750,
      bonusHp: 200,
      flareCdMult: 0.65,
      hasAutoDircm: true,
      desc: 'Automatically spoofs incoming SAMs with laser DIRCM + [X] grants 5s ECM Stealth Jamming & +250 HP Airframe Repair!'
    },
    {
      id: 'stealth_coating',
      name: 'RADAR-ABSORBENT RAM COATING & IR EXHAUST SHIELD',
      shortName: 'STEALTH RAM (+350 HP)',
      icon: '🦇',
      price: 850,
      bonusHp: 350,
      flareCdMult: 0.75,
      hasAutoDircm: true,
      desc: '+350 Max Airframe HP, -25% faster flare reload & automatic IR missile countermeasure pod!'
    }
  ],
  airOrdnance: [
    {
      id: 'std_pylons',
      name: 'STANDARD WING PYLONS & ROTARY CANNON (STOCK)',
      shortName: 'STOCK PYLONS',
      icon: '🚀',
      price: 0,
      damageMult: 1.0,
      cooldownMult: 1.0,
      desc: 'Standard factory GAU-8 / Vulcan cannon belt and wing ordnance pylons.'
    },
    {
      id: 'depleted_gau',
      name: 'PGU-14/B DEPLETED-URANIUM API CANNON BELT',
      shortName: 'DU CANNON (+28% DMG)',
      icon: '🔥',
      price: 700,
      damageMult: 1.28,
      cooldownMult: 0.82,
      desc: '+28% Rotary Cannon, Bofors & Howitzer damage + 18% faster weapon reload!'
    },
    {
      id: 'heavy_pylons',
      name: 'BRU-61 SMART ORDNANCE RACK (HEAVY JDAM / AGM-65)',
      shortName: 'SMART PYLONS (+32% BLAST)',
      icon: '💣',
      price: 800,
      damageMult: 1.32,
      cooldownMult: 0.72,
      desc: '+32% Rocket, JDAM Bomb, AIM-9X & 105mm Howitzer damage + 28% faster ordnance reload!'
    }
  ],
  airFrame: [
    {
      id: 'std_airframe',
      name: 'STANDARD ALUMINUM-LITHIUM AIRFRAME (STOCK)',
      shortName: 'STOCK AIRFRAME',
      icon: '✈️',
      price: 0,
      bonusHp: 0,
      speedMult: 1.0,
      turnMult: 1.0,
      desc: 'Standard factory wing spars and turbofan/turboprop engine tuning.'
    },
    {
      id: 'titanium_tub',
      name: 'TITANIUM BATHTUB COCKPIT & SELF-SEALING TANKS',
      shortName: 'TITANIUM TUB (+500 HP)',
      icon: '🛡️',
      price: 750,
      bonusHp: 500,
      speedMult: 1.06,
      turnMult: 1.08,
      desc: '+500 Max Airframe HP across all jets & gunships + heavy flak damage resistance!'
    },
    {
      id: 'thrust_vector',
      name: '2D THRUST-VECTORING AFTERBURNERS & FLY-BY-WIRE',
      shortName: 'THRUST VECTOR (+25% TURN)',
      icon: '⚡',
      price: 650,
      bonusHp: 200,
      speedMult: 1.18,
      turnMult: 1.25,
      desc: '+25% Bank/Turn Agility, +18% Afterburner Top Speed & +200 Airframe HP!'
    }
  ],
  airAmmoRack: [
    {
      id: 'std_air_rack',
      name: 'STANDARD TACTICAL SORTIE PYLONS & ROTARY BAY (STOCK)',
      shortName: 'STD MUNITIONS (1×)',
      icon: '🎯',
      price: 0,
      isExpandedRack: false,
      turnMult: 1.0,
      desc: 'Authentic standard sortie load: AC-130 (1,800/80/20), A-10C (1,150/14/4), F-15EX (500/6/4), B-2 CSRL (40× Mk-82 / 1 Twin MOP / 4 AIM-9X).'
    },
    {
      id: 'amber_heavy_racks',
      name: 'AMBER / BRU-55 / B-2 SBRA HEAVY MUNITIONS RACKS (~2× PAYLOAD)',
      shortName: 'AMBER/SBRA (~2× AMMO)',
      icon: '🚀',
      price: 850,
      isExpandedRack: true,
      turnMult: 0.96,
      desc: 'Real-world heavy racks (-4% turn rate): AC-130 Palletized (3,000/192/45), A-10 Dual-LAU (1,350/38/8), F-15EX AMBER (940/12/8), B-2 SBRA (80× Mk-82 / 2 Twin MOPs / 8 AIM-9X)!'
    }
  ],
  ac130Generation: [
    {
      id: 'ac130a_1968',
      name: '1968 AC-130A "PROJECT GUNSHIP II" (VIETNAM STOCK)',
      shortName: '1968 AC-130A',
      eraTag: '1968 VIETNAM',
      icon: '🕰️',
      unlockKills: 0,
      price: 0,
      bonusHp: 0,
      maxMountArcRad: 0.16, // ±9° rigid floor mount trim — aimed by flying & banking left!
      allowBellySensorCam: false,
      hasNvg: false,
      hasFlir: false,
      reloadMult: 1.0,
      damageMult: 1.0,
      desc: 'Original 1968 Vietnam gunship: guns bolted nearly rigid (±9°) to the cargo floor. Aimed through the Pilot Left-Window HUD by banking steeper/shallower in a manual left turn!'
    },
    {
      id: 'ac130h_1973',
      name: '1973 AC-130H "SPECTRE" (105MM M102 + LOW-LIGHT NVG)',
      shortName: '1973 AC-130H',
      eraTag: '1973 SPECTRE',
      icon: '🦅',
      unlockKills: 2,
      price: 650,
      bonusHp: 300,
      maxMountArcRad: 0.28, // ±16° early damped mount
      allowBellySensorCam: false,
      hasNvg: true,
      hasFlir: false,
      reloadMult: 0.92,
      damageMult: 1.12,
      desc: 'UNLOCK AT 2 AIR KILLS: Adds heavy 105mm M102 Howitzer (+12% DMG), ±16° gun mount travel, Gen-2 Night Vision [N] & +300 Airframe HP!'
    },
    {
      id: 'ac130u_1995',
      name: '1995 AC-130U "SPOOKY II" (HYDRAULIC TRAINABLE MOUNTS)',
      shortName: '1995 AC-130U',
      eraTag: '1995 SPOOKY II',
      icon: '⚙️',
      unlockKills: 5,
      price: 1200,
      bonusHp: 550,
      maxMountArcRad: 0.62, // ±35° motorized hydraulic Trainable Gun Mounts!
      allowBellySensorCam: true,
      hasNvg: true,
      hasFlir: true,
      reloadMult: 0.85,
      damageMult: 1.2,
      desc: 'UNLOCK AT 5 AIR KILLS: Motorized Hydraulic Trainable Gun Mounts (±35° servo swing!), Belly FLIR/TV Sensor Pod Camera [C], White-Hot/Black-Hot IR [N] & +550 HP!'
    },
    {
      id: 'ac130j_2024',
      name: '2024 AC-130J "GHOSTRIDER" (MODERN AFSOC PRECISION)',
      shortName: '2024 AC-130J',
      eraTag: '2024 GHOSTRIDER',
      icon: '🛸',
      unlockKills: 10,
      price: 1950,
      bonusHp: 900,
      maxMountArcRad: 1.12, // ±64° wide-angle digital servo mounts!
      allowBellySensorCam: true,
      hasNvg: true,
      hasFlir: true,
      reloadMult: 0.74,
      damageMult: 1.32,
      desc: 'UNLOCK AT 10 AIR KILLS: Peak modern AFSOC Ghostrider! Wide ±64° digital servo gun mounts, AN/AAQ-39 HD WHOT/BHOT FLIR, +32% weapon lethality, -26% reload & +900 HP!'
    }
  ],
  ac130Sight: [
    {
      id: 'sight_1968_hud',
      name: 'FAMOUS SIDEWAYS LEFT-WINDOW ANALOG PYLON HUD (STOCK)',
      shortName: 'SIDEWAYS HUD',
      icon: '🪟',
      unlockKills: 0,
      price: 0,
      isEotech: false,
      desc: 'Classic sideways-mounted green collimated glass reflector HUD inside the pilot left window with roll scale & Pylon Steering Pipper.'
    },
    {
      id: 'sight_afsoc_eotech',
      name: 'REAL AFSOC LEFT-WINDOW EOTECH EXPS3 HOLOGRAPHIC SIGHT',
      shortName: 'EOTECH EXPS3',
      icon: '🎯',
      unlockKills: 3,
      price: 750,
      isEotech: true,
      desc: 'FIRST UNLOCK (3 AIR KILLS), THEN PURCHASE: Real US Air Force Special Ops rail-mounted EOTech EXPS3 Holographic Sight (68 MOA crimson ring + 1 MOA dot + HMD Target Cue) bolted inside the left cockpit window!'
    }
  ],
  ac130Avionics: [
    {
      id: 'avio_manual_1968',
      name: '1960s MANUAL PILOT LEFT-BANK PYLON FLYING (STOCK)',
      shortName: 'MANUAL PYLON',
      icon: '🕹️',
      unlockKills: 0,
      price: 0,
      hasFlirRepeater: false,
      hasCoupledAutopilot: false,
      desc: 'Press [R] to toggle Forward Transit Flight ⇄ Left-Window Orbit Mode. Pilot manually banks left [A/D] to hold the circle around the target.'
    },
    {
      id: 'avio_flir_repeater',
      name: 'COCKPIT DASHBOARD FLIR VIDEO REPEATER MFD',
      shortName: 'FLIR MFD SCREEN',
      icon: '📺',
      unlockKills: 2,
      price: 600,
      hasFlirRepeater: true,
      hasCoupledAutopilot: false,
      desc: 'UNLOCK AT 2 AIR KILLS: Installs a live Cockpit Multifunction Display (MFD) repeating White-Hot FLIR thermal video of ground targets off your left wing!'
    },
    {
      id: 'avio_coupled_autopilot',
      name: 'COUPLED GPS PYLON AUTOPILOT + COCKPIT FLIR REPEATER MFD',
      shortName: 'COUPLED AUTOPILOT',
      icon: '🔄',
      unlockKills: 6,
      price: 1450,
      hasFlirRepeater: true,
      hasCoupledAutopilot: true,
      desc: 'FIRST UNLOCK (6 AIR KILLS), THEN PURCHASE: Includes Cockpit FLIR Video Repeater MFD + Coupled GPS Pylon Autopilot! Press [R] or [F] to lock hands-free circular autopilot around any FOB while aiming freely!'
    }
  ]
};

const DEFAULT_VEHICLE_UPGRADES = {
  armorSensor: 'std_tank_day',
  armorDefense: 'smoke_disp',
  armorWeaponMod: 'std_autoloader',
  armorChassis: 'std_turbine',
  armorAmmoRack: 'std_armor_rack',
  airSensor: 'std_air_hud',
  airCountermeasure: 'std_flares',
  airOrdnance: 'std_pylons',
  airFrame: 'std_airframe',
  airAmmoRack: 'std_air_rack',
  ac130Generation: 'ac130a_1968',
  ac130Sight: 'sight_1968_hud',
  ac130Avionics: 'avio_manual_1968'
};

export const FIELD_REQUISITIONS = [
  {
    id: 'build_covered_bunker',
    name: 'BUILD COVERED SHOOTING BUNKER',
    icon: '🛡️',
    price: 350,
    desc: 'Constructs a Squad-style Covered Sandbag & Timber Roof Pillbox ahead of you with protected firing slits.'
  },
  {
    id: 'build_hmg_nest',
    name: 'BUILD .50 CAL HMG EMPLACEMENT',
    icon: '🔫',
    price: 450,
    desc: 'Constructs a Sandbag Heavy Machine Gun Nest ahead of you with a mountable [E] 750 RPM .50 Cal M2HB / DShK turret.'
  },
  {
    id: 'build_mortar_pit',
    name: 'BUILD 81MM INDIRECT MORTAR PIT',
    icon: '🎯',
    price: 600,
    desc: 'Constructs a Sandbag Mortar Ring ahead of you with a mountable [E] 81mm Mortar (60m–550m indirect HE + 3-round barrage).'
  },
  {
    id: 'build_aa_emplace',
    name: 'BUILD ZU-23-2 / STINGER AA BATTERY',
    icon: '📡',
    price: 650,
    desc: 'Constructs a Dual-Barrel 23mm Proximity AA + Stinger SAM Turret ahead of you (mountable [E] + autonomous base defense!).'
  },
  {
    id: 'build_bunker',
    name: 'BUILD FORTIFIED COMMAND BUNKER [8]',
    icon: '🏰',
    price: 1000,
    desc: 'Constructs a 5×5 walk-in Reinforced Concrete & Sandbag Command Bunker ahead of you with 360° firing slits & overhead blast roof.'
  },
  {
    id: 'build_house',
    name: 'BUILD 2-STORY TACTICAL HOUSE [8]',
    icon: '🏠',
    price: 1000,
    desc: 'Constructs a 6×6 walk-in 2-Story Brick & Concrete Tactical House ahead of you with doorways, firing windows & interior stairs.'
  },
  {
    id: 'resupply_drop',
    name: 'FIELD ARMOR & AMMO RESUPPLY',
    icon: '📦',
    price: 250,
    desc: 'Instantly refills 100% Armor HP, full magazines across all slots, +2 Bandages & +1 Frag Grenade.'
  },
  {
    id: 'combat_stim',
    name: 'COMBAT ADRENALINE STIM',
    icon: '💉',
    price: 300,
    desc: 'Instantly heals to 100 HP, coagulates active bleeding & clears incoming fire suppression.'
  },
  {
    id: 'emergency_uav',
    name: 'EMERGENCY UAV OVERFLIGHT',
    icon: '📡',
    price: 550,
    desc: 'Resets Commander UAV cooldown and launches an immediate 3D & Minimap UAV recon sweep.'
  },
  {
    id: 'bank_transfer',
    name: 'WIRE $500 TO WAREHOUSE VAULT',
    icon: '🏦',
    price: 500,
    desc: 'Extracts $500 of In-Match Cash directly into your Persistent Personal Warehouse Bank mid-battle.'
  }
];

export const GunsmithMethods = {
  syncTotalCash() {
    if (typeof this.warehouseCash !== 'number' || !Number.isFinite(this.warehouseCash)) {
      this.warehouseCash = 100000;
    }
    if (typeof this.matchCash !== 'number' || !Number.isFinite(this.matchCash)) {
      this.matchCash = PLAYER.STARTING_CASH || 150;
    }
    this.warehouseCash = Math.max(0, Math.round(this.warehouseCash * 100) / 100);
    this.matchCash = Math.max(0, Math.round(this.matchCash * 100) / 100);
    this.cash = Math.round((this.matchCash + this.warehouseCash) * 100) / 100;
    return this.cash;
  },

  ensureWarehouseStructures() {
    if (!(this.ownedWeapons instanceof Set)) {
      this.ownedWeapons = new Set(['m4a1', 'ak15', 'vector', 'mp7', 'm249', 'sv98', 'mp443']);
    } else {
      this.ownedWeapons.add('mp7');
    }
    if (!this.classLoadoutSelections || typeof this.classLoadoutSelections !== 'object') {
      this.classLoadoutSelections = JSON.parse(JSON.stringify(DEFAULT_CLASS_SELECTIONS));
    }
    for (const [cls, defSel] of Object.entries(DEFAULT_CLASS_SELECTIONS)) {
      if (!this.classLoadoutSelections[cls]) {
        this.classLoadoutSelections[cls] = { ...defSel };
      } else {
        if (!WEAPON_DEFS[this.classLoadoutSelections[cls].primary]) {
          this.classLoadoutSelections[cls].primary = defSel.primary;
        }
        if (!WEAPON_DEFS[this.classLoadoutSelections[cls].secondary]) {
          this.classLoadoutSelections[cls].secondary = defSel.secondary;
        }
      }
    }
    if (!this.weaponAttachments || typeof this.weaponAttachments !== 'object') {
      this.weaponAttachments = {};
    }
    if (!this.warehouseStock || typeof this.warehouseStock !== 'object') {
      this.warehouseStock = { armorPlates: 2, medStims: 2, ammoPacks: 2 };
    }
    if (!Array.isArray(this.extractedRoundLoot)) {
      this.extractedRoundLoot = [];
    }
    if (!Array.isArray(this.warehouseStashItems)) {
      this.warehouseStashItems = [];
    }
    if (!this.careerStats || typeof this.careerStats !== 'object') {
      this.careerStats = { matchesPlayed: 0, matchesWon: 0, totalExtractedCash: 0 };
    }
    if (!(this.ownedUpgrades instanceof Set)) {
      this.ownedUpgrades = new Set([
        'stock',
        'std_mag',
        'factory',
        'sniper8x',
        'nightforce_12x',
        'std_grip',
        'fmj',
        'std_vest',
        'no_pack',
        'std_helmet'
      ]);
    } else {
      this.ownedUpgrades.add('fmj');
      this.ownedUpgrades.add('no_pack');
      this.ownedUpgrades.add('std_helmet');
      this.ownedUpgrades.add('sniper8x');
    }
    if (!this.equippedUpgrades || typeof this.equippedUpgrades !== 'object') {
      this.equippedUpgrades = {
        ...DEFAULT_WEAPON_ATTACHMENTS,
        vest: 'std_vest',
        backpack: 'no_pack',
        tacticalGear: 'std_helmet'
      };
    } else {
      if (!this.equippedUpgrades.ammoType) this.equippedUpgrades.ammoType = 'fmj';
      if (!this.equippedUpgrades.backpack) this.equippedUpgrades.backpack = 'no_pack';
      if (!this.equippedUpgrades.tacticalGear) this.equippedUpgrades.tacticalGear = 'std_helmet';
    }
    if (!(this.ownedSkins instanceof Set)) {
      this.ownedSkins = new Set();
    }
    if (!this.equippedWeaponSkins || typeof this.equippedWeaponSkins !== 'object') {
      this.equippedWeaponSkins = {};
    }
    if (this.equippedHammerSkin === undefined) {
      this.equippedHammerSkin = null;
    }
    if (typeof this.casesOpenedCount !== 'number') {
      this.casesOpenedCount = 0;
    }
    if (typeof this.goldUnboxedCount !== 'number') {
      this.goldUnboxedCount = 0;
    }
    if (typeof this.caseKeys !== 'number' || !Number.isFinite(this.caseKeys)) {
      this.caseKeys = 1;
    }
    if (!(this.ownedVehicleUpgrades instanceof Set)) {
      this.ownedVehicleUpgrades = new Set(Object.values(DEFAULT_VEHICLE_UPGRADES));
    } else {
      Object.values(DEFAULT_VEHICLE_UPGRADES).forEach((id) => this.ownedVehicleUpgrades.add(id));
    }
    if (!this.equippedVehicleUpgrades || typeof this.equippedVehicleUpgrades !== 'object') {
      this.equippedVehicleUpgrades = { ...DEFAULT_VEHICLE_UPGRADES };
    } else {
      for (const [k, defId] of Object.entries(DEFAULT_VEHICLE_UPGRADES)) {
        if (!this.equippedVehicleUpgrades[k]) {
          this.equippedVehicleUpgrades[k] = defId;
        }
      }
    }
    if (typeof this.b2SpiritColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(this.b2SpiritColor)) {
      this.b2SpiritColor = '#14181f';
    }
    if (
      typeof this.b2SpiritAccentColor !== 'string' ||
      !/^#[0-9a-fA-F]{6}$/.test(this.b2SpiritAccentColor)
    ) {
      this.b2SpiritAccentColor = '#00d2d3';
    }
    if (typeof this.b2SpiritPresetId !== 'string') {
      this.b2SpiritPresetId = 'midnight_ram';
    }
    if (typeof this.friendlyFireEnabled !== 'boolean') {
      this.friendlyFireEnabled = false;
    }
    if (typeof this.friendlyFireKills !== 'number' || !Number.isFinite(this.friendlyFireKills)) {
      this.friendlyFireKills = 0;
    }
    if (
      typeof this.friendlyFirePenaltyTotal !== 'number' ||
      !Number.isFinite(this.friendlyFirePenaltyTotal)
    ) {
      this.friendlyFirePenaltyTotal = 0;
    }
  },

  getWeaponAttachmentMap(weaponId) {
    this.ensureWarehouseStructures();
    const id = weaponId || this.getSelectedWeaponIdForClass(this.role, 'primary') || 'm4a1';
    const defaultOpticForWep =
      id === 'sv98' ? 'sniper8x' : id === 'awm' ? 'nightforce_12x' : DEFAULT_WEAPON_ATTACHMENTS.optic;
    if (!this.weaponAttachments[id] || typeof this.weaponAttachments[id] !== 'object') {
      this.weaponAttachments[id] = {
        ...DEFAULT_WEAPON_ATTACHMENTS,
        optic: defaultOpticForWep
      };
    }
    for (const k of ['muzzle', 'magazine', 'optic', 'grip', 'ammoType']) {
      if (!this.weaponAttachments[id][k]) {
        this.weaponAttachments[id][k] =
          k === 'optic' ? defaultOpticForWep : DEFAULT_WEAPON_ATTACHMENTS[k];
      }
    }
    return this.weaponAttachments[id];
  },

  getSelectedWeaponIdForClass(roleName = this.role, slotType = 'primary') {
    this.ensureWarehouseStructures();
    const cls = roleName && DEFAULT_CLASS_SELECTIONS[roleName] ? roleName : 'engineer';
    const sel = this.classLoadoutSelections[cls] || DEFAULT_CLASS_SELECTIONS[cls];
    return slotType === 'secondary' ? sel.secondary : sel.primary;
  },

  syncActiveEquippedUpgrades(weaponId = null) {
    this.ensureWarehouseStructures();
    const activePrimaryId = weaponId || this.getSelectedWeaponIdForClass(this.role, 'primary');
    const att = this.getWeaponAttachmentMap(activePrimaryId);
    for (const k of ['muzzle', 'magazine', 'optic', 'grip', 'ammoType']) {
      this.equippedUpgrades[k] = att[k] || DEFAULT_WEAPON_ATTACHMENTS[k];
    }
    if (!this.equippedUpgrades.vest) {
      this.equippedUpgrades.vest = 'std_vest';
    }
    if (!this.equippedUpgrades.backpack) {
      this.equippedUpgrades.backpack = 'no_pack';
    }
    if (!this.equippedUpgrades.tacticalGear) {
      this.equippedUpgrades.tacticalGear = 'std_helmet';
    }
  },

  /**
   * Checks whether the player is currently allowed to access the Gunsmith / Armory Workbench ([L]):
   * - Allowed on the Deploy Screen (`#deploy-screen` visible) or while `this.dead`
   * - Allowed anywhere when Sandbox Mode (`this.squadDoctrineEnabled === false`) is active
   * - Allowed within 145m of Friendly Main Base HQ (`US_BASE` / `RU_BASE`)
   * - Allowed within `(flag.radius || 24) + 14` meters of any Captured Friendly FOB (`flag.owner === this.team`)
   * - Allowed within 5.5m of any Support Ammo & Kit Stash (`this.world.ammoCrates`)
   */
  canAccessGunsmithWorkbench() {
    const deployEl =
      typeof document !== 'undefined' ? document.getElementById('deploy-screen') : null;
    if ((deployEl && !deployEl.classList.contains('hidden')) || this.dead) {
      return { allowed: true, locationLabel: 'PRE-DEPLOYMENT ARMORY' };
    }
    if (this.squadDoctrineEnabled === false) {
      return { allowed: true, locationLabel: 'SANDBOX MODE' };
    }
    if (this.pos) {
      const baseKey = this.team === 'RU' ? 'RU_BASE' : 'US_BASE';
      const basePos =
        this.world?.spawns?.[baseKey] ||
        (this.team === 'RU' ? this.world?.ruBase : this.world?.usBase);
      if (basePos && Math.hypot(this.pos.x - basePos.x, this.pos.z - basePos.z) <= 225) {
        return { allowed: true, locationLabel: 'MAIN BASE HQ ARMORY' };
      }
      const onFriendlyRearAirbase =
        (this.team === 'RU' ? this.pos.x >= 2475 : this.pos.x <= -2475) &&
        Math.abs(this.pos.z) <= 300;
      if (onFriendlyRearAirbase) {
        return { allowed: true, locationLabel: 'STRATEGIC REAR AIRBASE HANGAR' };
      }
      if (this.world && Array.isArray(this.world.flags)) {
        for (const flag of this.world.flags) {
          if (flag && flag.owner === this.team && flag.pos) {
            const maxR = (flag.radius || 24) + 14;
            if (Math.hypot(this.pos.x - flag.pos.x, this.pos.z - flag.pos.z) <= maxR) {
              return { allowed: true, locationLabel: `FOB OBJECTIVE ${flag.id} ARMORY` };
            }
          }
        }
      }
      if (this.world && Array.isArray(this.world.ammoCrates)) {
        for (const crate of this.world.ammoCrates) {
          if (
            crate &&
            crate.pos &&
            Math.hypot(this.pos.x - crate.pos.x, this.pos.z - crate.pos.z) <= 5.5
          ) {
            return { allowed: true, locationLabel: 'FIELD AMMO & KIT STASH' };
          }
        }
      }
    }
    return { allowed: false, locationLabel: 'IN FIELD (NO ARMORY)' };
  },

  loadGunsmithState() {
    this.ensureWarehouseStructures();
    try {
      // v5 Dual-Wallet Separation:
      // - `warehouseCash` (🏦 Armory Bank) persists permanently across sessions in localStorage!
      // - `matchCash` (⚡ Match Cash) ALWAYS starts every fresh session/match at `ECONOMY.STARTING_MATCH_CASH` ($50)!
      // - Any leftover `matchCash` from legacy v4 saves is migrated into `warehouseCash` so zero player wealth is lost.
      const rawV5 = localStorage.getItem('bb_warehouse_state_v5');
      const rawV4 = localStorage.getItem('bb_warehouse_state_v4');
      const rawV3 = localStorage.getItem('bb_warehouse_state_v3');
      const rawV2 = localStorage.getItem('bb_warehouse_state_v2');
      const rawV1 = localStorage.getItem('bb_gunsmith_state_v1');
      const isV5 = Boolean(rawV5);
      const isV4OrNewer = Boolean(rawV5 || rawV4);
      const isV3OrNewer = Boolean(rawV5 || rawV4 || rawV3);
      const parsed = rawV5
        ? JSON.parse(rawV5)
        : rawV4
        ? JSON.parse(rawV4)
        : rawV3
        ? JSON.parse(rawV3)
        : rawV2
        ? JSON.parse(rawV2)
        : rawV1
        ? JSON.parse(rawV1)
        : null;
      if (parsed) {
        if (typeof parsed.warehouseCash === 'number' && Number.isFinite(parsed.warehouseCash)) {
          const whVal = Math.max(0, Math.round(parsed.warehouseCash * 100) / 100);
          this.warehouseCash = isV4OrNewer ? whVal : Math.min(450, whVal);
        } else if (typeof parsed.cash === 'number' && Number.isFinite(parsed.cash)) {
          this.warehouseCash = isV4OrNewer ? Math.max(350, Math.round(parsed.cash * 100) / 100) : 350;
        }
        // Migrate legacy v4 saved matchCash above $50 safely into persistent Armory Bank!
        if (!isV5 && typeof parsed.matchCash === 'number' && Number.isFinite(parsed.matchCash) && parsed.matchCash > 50) {
          this.warehouseCash = Math.round((this.warehouseCash + (parsed.matchCash - 50)) * 100) / 100;
        }
        this.matchCash = ECONOMY.STARTING_MATCH_CASH || PLAYER.STARTING_CASH || 50;
        if (Array.isArray(parsed.ownedUpgrades || parsed.owned)) {
          (parsed.ownedUpgrades || parsed.owned).forEach((id) => this.ownedUpgrades.add(id));
        }
        if (Array.isArray(parsed.ownedWeapons)) {
          parsed.ownedWeapons.forEach((id) => {
            if (WEAPON_DEFS[id]) this.ownedWeapons.add(id);
          });
        }
        if (parsed.classLoadoutSelections && typeof parsed.classLoadoutSelections === 'object') {
          for (const [cls, sel] of Object.entries(parsed.classLoadoutSelections)) {
            if (this.classLoadoutSelections[cls] && sel && typeof sel === 'object') {
              if (sel.primary && WEAPON_DEFS[sel.primary]) {
                this.classLoadoutSelections[cls].primary = sel.primary;
              }
              if (sel.secondary && WEAPON_DEFS[sel.secondary]) {
                this.classLoadoutSelections[cls].secondary = sel.secondary;
              }
            }
          }
        }
        if (parsed.weaponAttachments && typeof parsed.weaponAttachments === 'object') {
          for (const [wId, attMap] of Object.entries(parsed.weaponAttachments)) {
            if (attMap && typeof attMap === 'object') {
              this.weaponAttachments[wId] = {
                ...DEFAULT_WEAPON_ATTACHMENTS,
                ...attMap,
                optic: isV3OrNewer && attMap.optic ? attMap.optic : 'factory'
              };
            }
          }
        }
        if (parsed.equipped && typeof parsed.equipped === 'object') {
          for (const k of [
            'muzzle',
            'magazine',
            'optic',
            'grip',
            'ammoType',
            'vest',
            'backpack',
            'tacticalGear'
          ]) {
            if (parsed.equipped[k]) {
              this.equippedUpgrades[k] = k === 'optic' && !isV3OrNewer ? 'factory' : parsed.equipped[k];
            }
          }
        }
        if (parsed.warehouseStock && typeof parsed.warehouseStock === 'object') {
          this.warehouseStock = {
            armorPlates: Math.max(0, Number(parsed.warehouseStock.armorPlates ?? 2)),
            medStims: Math.max(0, Number(parsed.warehouseStock.medStims ?? 2)),
            ammoPacks: Math.max(0, Number(parsed.warehouseStock.ammoPacks ?? 2))
          };
        }
        if (parsed.careerStats && typeof parsed.careerStats === 'object') {
          this.careerStats = {
            matchesPlayed: Math.max(0, Number(parsed.careerStats.matchesPlayed || 0)),
            matchesWon: Math.max(0, Number(parsed.careerStats.matchesWon || 0)),
            totalExtractedCash: Math.max(0, Number(parsed.careerStats.totalExtractedCash || 0))
          };
        }
        if (Array.isArray(parsed.extractedRoundLoot)) {
          this.extractedRoundLoot = parsed.extractedRoundLoot.slice(0, 24);
        }
        if (Array.isArray(parsed.warehouseStashItems)) {
          this.warehouseStashItems = parsed.warehouseStashItems.slice(0, 36);
        }
        if (Array.isArray(parsed.ownedSkins)) {
          parsed.ownedSkins.forEach((sId) => this.ownedSkins.add(sId));
        }
        if (parsed.equippedWeaponSkins && typeof parsed.equippedWeaponSkins === 'object') {
          this.equippedWeaponSkins = { ...parsed.equippedWeaponSkins };
        }
        if (parsed.equippedHammerSkin === 'karambit' || parsed.equippedHammerSkin === 'butterfly') {
          this.equippedHammerSkin = parsed.equippedHammerSkin;
        }
        if (typeof parsed.casesOpenedCount === 'number') {
          this.casesOpenedCount = Math.max(0, Math.floor(parsed.casesOpenedCount));
        }
        if (typeof parsed.goldUnboxedCount === 'number') {
          this.goldUnboxedCount = Math.max(0, Math.floor(parsed.goldUnboxedCount));
        }
        if (typeof parsed.caseKeys === 'number' && Number.isFinite(parsed.caseKeys)) {
          this.caseKeys = Math.max(0, Math.floor(parsed.caseKeys));
        }
        if (Array.isArray(parsed.ownedVehicleUpgrades)) {
          parsed.ownedVehicleUpgrades.forEach((id) => this.ownedVehicleUpgrades.add(id));
        }
        if (typeof parsed.airCombatUnlockKills === 'number' && Number.isFinite(parsed.airCombatUnlockKills)) {
          this.airCombatUnlockKills = Math.max(0, Math.floor(parsed.airCombatUnlockKills));
        }
        if (parsed.equippedVehicleUpgrades && typeof parsed.equippedVehicleUpgrades === 'object') {
          this.equippedVehicleUpgrades = {
            ...DEFAULT_VEHICLE_UPGRADES,
            ...parsed.equippedVehicleUpgrades
          };
        }
        if (typeof parsed.b2SpiritColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(parsed.b2SpiritColor)) {
          this.b2SpiritColor = parsed.b2SpiritColor;
        }
        if (
          typeof parsed.b2SpiritAccentColor === 'string' &&
          /^#[0-9a-fA-F]{6}$/.test(parsed.b2SpiritAccentColor)
        ) {
          this.b2SpiritAccentColor = parsed.b2SpiritAccentColor;
        }
        if (typeof parsed.b2SpiritPresetId === 'string') {
          this.b2SpiritPresetId = parsed.b2SpiritPresetId;
        }
        if (typeof parsed.friendlyFireEnabled === 'boolean') {
          this.friendlyFireEnabled = parsed.friendlyFireEnabled;
        }
        if (typeof parsed.friendlyFireKills === 'number' && Number.isFinite(parsed.friendlyFireKills)) {
          this.friendlyFireKills = Math.max(0, Math.floor(parsed.friendlyFireKills));
        }
        if (
          typeof parsed.friendlyFirePenaltyTotal === 'number' &&
          Number.isFinite(parsed.friendlyFirePenaltyTotal)
        ) {
          this.friendlyFirePenaltyTotal = Math.max(
            0,
            Math.round(parsed.friendlyFirePenaltyTotal * 100) / 100
          );
        }
        if (!isV5) {
          this.saveGunsmithState();
        }
      } else {
        this.matchCash = ECONOMY.STARTING_MATCH_CASH || PLAYER.STARTING_CASH || 50;
      }
    } catch (_) {
      this.matchCash = ECONOMY.STARTING_MATCH_CASH || PLAYER.STARTING_CASH || 50;
    }
    this.syncActiveEquippedUpgrades();
    this.syncTotalCash();
  },

  saveGunsmithState() {
    this.ensureWarehouseStructures();
    this.syncTotalCash();
    try {
      const payload = {
        warehouseCash: this.warehouseCash,
        ownedWeapons: Array.from(this.ownedWeapons),
        classLoadoutSelections: this.classLoadoutSelections,
        weaponAttachments: this.weaponAttachments,
        warehouseStock: this.warehouseStock,
        extractedRoundLoot: (this.extractedRoundLoot || []).slice(0, 24),
        warehouseStashItems: (this.warehouseStashItems || []).slice(0, 36),
        careerStats: this.careerStats,
        ownedUpgrades: Array.from(this.ownedUpgrades),
        owned: Array.from(this.ownedUpgrades),
        equipped: this.equippedUpgrades,
        ownedSkins: Array.from(this.ownedSkins),
        equippedWeaponSkins: this.equippedWeaponSkins,
        equippedHammerSkin: this.equippedHammerSkin,
        casesOpenedCount: this.casesOpenedCount,
        goldUnboxedCount: this.goldUnboxedCount,
        caseKeys: this.caseKeys,
        ownedVehicleUpgrades: Array.from(this.ownedVehicleUpgrades || []),
        equippedVehicleUpgrades: this.equippedVehicleUpgrades,
        airCombatUnlockKills: this.airCombatUnlockKills || 0,
        b2SpiritColor: this.b2SpiritColor || '#14181f',
        b2SpiritAccentColor: this.b2SpiritAccentColor || '#00d2d3',
        b2SpiritPresetId: this.b2SpiritPresetId || 'midnight_ram',
        friendlyFireEnabled: Boolean(this.friendlyFireEnabled),
        friendlyFireKills: this.friendlyFireKills || 0,
        friendlyFirePenaltyTotal: this.friendlyFirePenaltyTotal || 0
      };
      localStorage.setItem('bb_warehouse_state_v5', JSON.stringify(payload));
      localStorage.setItem('bb_warehouse_state_v4', JSON.stringify(payload));
    } catch (_) {}
  },

  toggleFriendlyFire(forceState = undefined) {
    this.ensureWarehouseStructures();
    this.friendlyFireEnabled =
      typeof forceState === 'boolean' ? forceState : !this.friendlyFireEnabled;
    this.saveGunsmithState();
    sound.playRadioBeep?.(true);
    if (window.game?.ui) {
      window.game.ui.updateFriendlyFireUI?.();
      window.game.ui.updateCashAndGunsmithHud?.();
    }
    return this.friendlyFireEnabled;
  },

  deductFriendlyFirePenalty(teammateName = 'TEAMMATE', weaponName = '') {
    this.ensureWarehouseStructures();
    const penalty = 0.10; // 10 cents ($0.10) deducted per teammate kill
    this.syncTotalCash();
    if (this.matchCash >= penalty) {
      this.matchCash = Math.max(0, Math.round((this.matchCash - penalty) * 100) / 100);
    } else {
      const rem = Math.max(0, Math.round((penalty - this.matchCash) * 100) / 100);
      this.matchCash = 0;
      this.warehouseCash = Math.max(0, Math.round((this.warehouseCash - rem) * 100) / 100);
    }
    this.friendlyFireKills = (this.friendlyFireKills || 0) + 1;
    this.friendlyFirePenaltyTotal =
      Math.round(((this.friendlyFirePenaltyTotal || 0) + penalty) * 100) / 100;
    this.syncTotalCash();
    this.saveGunsmithState();
    this.emitCashUpdate(-penalty, `FRIENDLY FIRE TEAMKILL (${teammateName})`);
    if (window.game?.ui) {
      const wepTag = weaponName ? ` [${weaponName}]` : '';
      window.game.ui.addXpNotification?.(
        0,
        `⚠️ FRIENDLY FIRE TEAMKILL (${teammateName})${wepTag} — <span style="color:#ff5252;font-weight:900;">-$0.10 (-10¢) DEDUCTED!</span> (TEAMKILLS: ${this.friendlyFireKills} • TOTAL PENALTY: -$${this.friendlyFirePenaltyTotal.toFixed(2)})`
      );
      window.game.ui.updateFriendlyFireUI?.();
      window.game.ui.updateCashAndGunsmithHud?.();
    }
    return {
      penalty,
      friendlyFireKills: this.friendlyFireKills,
      friendlyFirePenaltyTotal: this.friendlyFirePenaltyTotal,
      matchCash: this.matchCash,
      warehouseCash: this.warehouseCash,
      cash: this.cash
    };
  },

  setB2SpiritColors(bodyHex, accentHex = null, presetId = null) {
    this.ensureWarehouseStructures();
    if (presetId) {
      const preset = B2_COLOR_PRESETS.find((p) => p.id === presetId);
      if (preset) {
        this.b2SpiritPresetId = preset.id;
        this.b2SpiritColor = preset.bodyHex;
        this.b2SpiritAccentColor = preset.accentHex;
      }
    } else {
      if (typeof bodyHex === 'string' && /^#[0-9a-fA-F]{6}$/.test(bodyHex)) {
        this.b2SpiritColor = bodyHex;
      }
      if (typeof accentHex === 'string' && /^#[0-9a-fA-F]{6}$/.test(accentHex)) {
        this.b2SpiritAccentColor = accentHex;
      }
      const matched = B2_COLOR_PRESETS.find(
        (p) =>
          p.bodyHex.toLowerCase() === this.b2SpiritColor.toLowerCase() &&
          p.accentHex.toLowerCase() === this.b2SpiritAccentColor.toLowerCase()
      );
      this.b2SpiritPresetId = matched ? matched.id : 'custom';
    }
    this.saveGunsmithState();
    sound.playWeaponSwitch?.();

    const vm = this.vehicleManager || window.game?.vehicleManager;
    if (vm && Array.isArray(vm.vehicles)) {
      for (const v of vm.vehicles) {
        if (v && v.aircraftRole === 'b2_spirit' && v.mesh) {
          applyB2SpiritColorToMesh(v.mesh, this.b2SpiritColor, this.b2SpiritAccentColor);
        }
      }
    }
    return {
      ok: true,
      bodyHex: this.b2SpiritColor,
      accentHex: this.b2SpiritAccentColor,
      presetId: this.b2SpiritPresetId
    };
  },

  getEquippedItem(category, weaponId = null) {
    this.ensureWarehouseStructures();
    const list = ATTACHMENT_CATALOG[category] || [];
    if (category === 'vest' || category === 'backpack' || category === 'tacticalGear') {
      const gearId = this.equippedUpgrades[category];
      return list.find((it) => it.id === gearId) || list[0] || null;
    }
    const resolvedWepId = weaponId || this.getSelectedWeaponIdForClass(this.role, 'primary');
    const attMap = this.getWeaponAttachmentMap(resolvedWepId);
    const targetId =
      (attMap && attMap[category]) || DEFAULT_WEAPON_ATTACHMENTS[category] || list[0]?.id;
    return list.find((it) => it.id === targetId) || list[0] || null;
  },

  getWeaponsUsingUpgrade(category, itemId) {
    this.ensureWarehouseStructures();
    if (
      !category ||
      !itemId ||
      category === 'vest' ||
      category === 'backpack' ||
      category === 'tacticalGear' ||
      DEFAULT_WEAPON_ATTACHMENTS[category] === itemId
    ) {
      return [];
    }
    const candidateIds = new Set(this.ownedWeapons || []);
    for (const sel of Object.values(DEFAULT_CLASS_SELECTIONS)) {
      if (sel.primary) candidateIds.add(sel.primary);
      if (sel.secondary) candidateIds.add(sel.secondary);
    }
    for (const wId of Object.keys(this.weaponAttachments || {})) {
      candidateIds.add(wId);
    }
    const names = [];
    for (const wId of candidateIds) {
      const def = WEAPON_DEFS[wId];
      if (!def || def.type !== 'gun' || def.isPrimitiveOnly) continue;
      const attMap = this.weaponAttachments?.[wId];
      const curVal =
        attMap && attMap[category]
          ? attMap[category]
          : category === 'optic' && (wId === 'sv98' || wId === 'awm')
          ? wId === 'sv98'
            ? 'sniper8x'
            : 'nightforce_12x'
          : DEFAULT_WEAPON_ATTACHMENTS[category];
      if (curVal === itemId) {
        names.push(def.shortName || def.name);
      }
    }
    return names;
  },

  equipUpgradeOnAllOwnedWeapons(category, itemId) {
    this.ensureWarehouseStructures();
    if (category === 'vest' || category === 'backpack' || category === 'tacticalGear') {
      return this.buyOrEquipUpgrade(category, itemId);
    }
    const list = ATTACHMENT_CATALOG[category];
    if (!Array.isArray(list)) return { ok: false, reason: 'INVALID_CATEGORY' };
    const item = list.find((it) => it.id === itemId);
    if (!item) return { ok: false, reason: 'ITEM_NOT_FOUND' };
    if (!this.ownedUpgrades.has(item.id) && (item.price || 0) > 0) {
      return { ok: false, reason: 'NOT_OWNED', item };
    }
    this.ownedUpgrades.add(item.id);

    const targetIds = new Set(this.ownedWeapons || []);
    for (const sel of Object.values(DEFAULT_CLASS_SELECTIONS)) {
      if (sel.primary) targetIds.add(sel.primary);
      if (sel.secondary) targetIds.add(sel.secondary);
    }
    for (const sel of Object.values(this.classLoadoutSelections || {})) {
      if (sel?.primary) targetIds.add(sel.primary);
      if (sel?.secondary) targetIds.add(sel.secondary);
    }

    const updatedWeaponIds = [];
    for (const wId of targetIds) {
      const def = WEAPON_DEFS[wId];
      if (!def || def.type !== 'gun' || def.isPrimitiveOnly) continue;
      const attMap = this.getWeaponAttachmentMap(wId);
      attMap[category] = item.id;
      updatedWeaponIds.push(wId);
    }
    this.syncActiveEquippedUpgrades();
    this.saveGunsmithState();
    this.applyCustomizationsToActiveLoadout(true);
    sound.playReload?.();
    this.emitCashUpdate(0, `MOUNTED ${item.shortName || item.name} ON ALL ${updatedWeaponIds.length} GUNS`);
    return {
      ok: true,
      action: 'MOUNTED_ALL',
      item,
      count: updatedWeaponIds.length,
      weaponIds: updatedWeaponIds
    };
  },

  getUpgradeMods(weaponId = null) {
    return {
      muzzle: this.getEquippedItem('muzzle', weaponId),
      magazine: this.getEquippedItem('magazine', weaponId),
      optic: this.getEquippedItem('optic', weaponId),
      grip: this.getEquippedItem('grip', weaponId),
      ammoType: this.getEquippedItem('ammoType', weaponId),
      vest: this.getEquippedItem('vest'),
      backpack: this.getEquippedItem('backpack'),
      tacticalGear: this.getEquippedItem('tacticalGear')
    };
  },

  getEquippedVehicleUpgrade(slotKey) {
    this.ensureWarehouseStructures();
    const list = VEHICLE_UPGRADE_CATALOG[slotKey] || [];
    const eqId = this.equippedVehicleUpgrades[slotKey] || DEFAULT_VEHICLE_UPGRADES[slotKey];
    return list.find((it) => it.id === eqId) || list[0] || null;
  },

  getVehicleUpgradeMods() {
    this.ensureWarehouseStructures();
    return {
      armorSensor: this.getEquippedVehicleUpgrade('armorSensor'),
      armorDefense: this.getEquippedVehicleUpgrade('armorDefense'),
      armorWeaponMod: this.getEquippedVehicleUpgrade('armorWeaponMod'),
      armorChassis: this.getEquippedVehicleUpgrade('armorChassis'),
      armorAmmoRack: this.getEquippedVehicleUpgrade('armorAmmoRack'),
      airSensor: this.getEquippedVehicleUpgrade('airSensor'),
      airCountermeasure: this.getEquippedVehicleUpgrade('airCountermeasure'),
      airOrdnance: this.getEquippedVehicleUpgrade('airOrdnance'),
      airFrame: this.getEquippedVehicleUpgrade('airFrame'),
      airAmmoRack: this.getEquippedVehicleUpgrade('airAmmoRack'),
      ac130Generation: this.getEquippedVehicleUpgrade('ac130Generation'),
      ac130Sight: this.getEquippedVehicleUpgrade('ac130Sight'),
      ac130Avionics: this.getEquippedVehicleUpgrade('ac130Avionics')
    };
  },

  getAirCombatUnlockKills() {
    return Math.max(0, Math.floor(this.airCombatUnlockKills || 0));
  },

  isVehicleUpgradeUnlocked(item) {
    if (!item) return false;
    const req = item.unlockKills || 0;
    if (req <= 0) return true;
    if (this.ownedVehicleUpgrades && this.ownedVehicleUpgrades.has(item.id)) return true;
    return this.getAirCombatUnlockKills() >= req;
  },

  recordAirCombatKill(weight = 1) {
    this.ensureWarehouseStructures();
    const prev = this.getAirCombatUnlockKills();
    const next = prev + Math.max(1, Math.round(weight));
    this.airCombatUnlockKills = next;

    const newlyUnlocked = [];
    for (const slotKey of ['ac130Generation', 'ac130Sight', 'ac130Avionics']) {
      const list = VEHICLE_UPGRADE_CATALOG[slotKey] || [];
      for (const it of list) {
        const req = it.unlockKills || 0;
        if (req > 0 && prev < req && next >= req && !this.ownedVehicleUpgrades.has(it.id)) {
          newlyUnlocked.push(it);
        }
      }
    }
    this.saveGunsmithState();
    if (newlyUnlocked.length > 0 && this.onAwardXp) {
      const names = newlyUnlocked.map((u) => u.shortName || u.name).join(' & ');
      this.onAwardXp(
        75,
        `🔓 AC-130 UPGRADE UNLOCKED FOR PURCHASE IN [L] HANGAR: ${names}!`
      );
    }
    return next;
  },

  buyOrEquipVehicleUpgrade(slotKey, upgradeId, paySource = 'auto') {
    this.ensureWarehouseStructures();
    const list = VEHICLE_UPGRADE_CATALOG[slotKey];
    if (!Array.isArray(list)) {
      return { ok: false, reason: 'INVALID_SLOT' };
    }
    const item = list.find((it) => it.id === upgradeId);
    if (!item) {
      return { ok: false, reason: 'INVALID_UPGRADE' };
    }
    if (!this.isVehicleUpgradeUnlocked(item)) {
      return {
        ok: false,
        reason: 'LOCKED_PROGRESSION',
        reqKills: item.unlockKills || 0,
        curKills: this.getAirCombatUnlockKills(),
        item
      };
    }
    const alreadyOwned = this.ownedVehicleUpgrades.has(item.id) || (item.price || 0) <= 0;
    let bought = false;
    if (!alreadyOwned) {
      const spend = this.spendFunds(item.price, paySource === 'auto' ? 'warehouse' : paySource);
      if (!spend.ok) {
        return { ok: false, reason: spend.reason || 'INSUFFICIENT_FUNDS', shortBy: spend.shortBy, item };
      }
      this.ownedVehicleUpgrades.add(item.id);
      bought = true;
      this.emitCashUpdate(-item.price, `VEHICLE BAY: ${item.shortName}`);
    }
    this.equippedVehicleUpgrades[slotKey] = item.id;
    this.saveGunsmithState();
    sound.playWeaponSwitch?.();
    if (this.activeVehicle) {
      this.applyPlayerRideCustomizations(this.activeVehicle);
    }
    return { ok: true, bought, action: bought ? 'BOUGHT' : 'EQUIPPED', item };
  },

  /**
   * Applies the player's equipped Vehicle Bay upgrades AND Armor Crewman / Combat Pilot
   * Operator Class skills to any mounted ground vehicle or aircraft!
   */
  applyPlayerRideCustomizations(v) {
    if (!v || v.dead) return;
    this.ensureWarehouseStructures();
    const forceStock = Boolean(v._paidAsStock);
    const mods = forceStock ? {} : this.getVehicleUpgradeMods();

    if (typeof v._baseMaxHp !== 'number') {
      v._baseMaxHp = v.maxHp || 1000;
      v._baseSpeed = v.speed || 15;
      v._baseMaxSpeed = v.maxSpeed || (v.speed ? v.speed * 1.4 : 85);
      v._baseAccelRate = v.accelRate || 2.0;
      v._baseTurnRate = v.turnRate || 1.2;
      v._baseRpm = v.rpm || 30;
    }

    const oldMaxHp = v.maxHp || v._baseMaxHp;
    const hpRatio = oldMaxHp > 0 ? Math.min(1, (v.hp || oldMaxHp) / oldMaxHp) : 1;

    const applyOrdnanceRackScale = (isExpanded) => {
      if (!v._baseOrdnancePools && v.maxOrdnancePools) {
        v._baseOrdnancePools = { ...v.maxOrdnancePools };
      }
      if (!v._baseOrdnancePools) return;
      let targetMax = { ...v._baseOrdnancePools };
      if (isExpanded) {
        if (v.isAircraft) {
          const role = v.aircraftRole || 'cas';
          if (role === 'gunship') {
            targetMax = { slot0: 3000, slot1: 192, slot2: 45 }; // Palletized AC-130 Heavy Combat Stowage
          } else if (role === 'cas') {
            targetMax = { slot0: 1350, slot1: 38, slot2: 8 }; // Full GAU-8 Drum + Dual LAU-131 + TER AGM-65
          } else if (role === 'b2_spirit') {
            targetMax = { slot0: 16, slot1: 2, slot2: 8 }; // B-2 SBRA Smart Bomb Rack Assembly (80× Mk-82 + 2 Twin MOPs)
          } else if (role === 'wright_flyer') {
            targetMax = { slot0: 1200, slot1: 16, slot2: 8 };
          } else {
            targetMax = { slot0: 940, slot1: 12, slot2: 8 }; // F-15EX AMBER / Su-57 Heavy External Pylons
          }
        } else if (v.type === 'tank') {
          targetMax = { slot0: 42, slot1: 2400 }; // Full M1A2 / T-90M Deep-Hull + Turret Bustle Combat Load (42 shells!)
        } else if (v.type === 'apc') {
          targetMax = { slot0: 420, slot1: 2400 }; // Hull-Stowed Spare 25mm/30mm Ammo Bins (420 rds)
        } else if (v.type === 'aa' || v.type === 'emplace_aa') {
          targetMax = { slot0: 1200, slot1: 16 }; // Dual Stinger / 9M311 Reload Cassettes (16 SAMs)
        } else if (v.type === 'emplace_mortar') {
          targetMax = { slot0: 48, slot1: 12 };
        } else if (v.type === 'humvee' || v.type === 'emplace_hmg') {
          targetMax = { slot0: 1000, slot1: 1000 }; // Extended .50 BMG Tombstone Drum Cans
        }
      }
      const prevMax = v.maxOrdnancePools || v._baseOrdnancePools;
      const prevCur = v.ordnancePools || { ...prevMax };
      const nextCur = {};
      for (const k of Object.keys(targetMax)) {
        const oldM = Math.max(1, prevMax[k] || targetMax[k]);
        const curV = prevCur[k] ?? oldM;
        const wasFull = curV >= oldM;
        nextCur[k] = wasFull ? targetMax[k] : Math.min(targetMax[k], Math.round((curV / oldM) * targetMax[k]));
      }
      v.maxOrdnancePools = targetMax;
      v.ordnancePools = nextCur;
    };

    if (v.isAircraft) {
      const sen = mods.airSensor || {};
      const cm = mods.airCountermeasure || {};
      const ord = mods.airOrdnance || {};
      const frame = mods.airFrame || {};
      const airRack = mods.airAmmoRack || {};
      const acGen = mods.ac130Generation || {};
      const acSight = mods.ac130Sight || {};
      const acAvio = mods.ac130Avionics || {};
      const isPilotRole = this.role === 'pilot';
      const isGunship = v.aircraftRole === 'gunship';
      const isB2 = v.aircraftRole === 'b2_spirit';

      const bonusHp =
        (cm.bonusHp || 0) +
        (frame.bonusHp || 0) +
        (isGunship ? acGen.bonusHp || 0 : 0) +
        (isPilotRole ? 350 : 0);
      const speedMult = (frame.speedMult || 1.0) * (isPilotRole ? 1.15 : 1.0);
      const turnMult =
        (frame.turnMult || 1.0) * (airRack.turnMult || 1.0) * (isPilotRole ? 1.22 : 1.0);
      applyOrdnanceRackScale(Boolean(airRack.isExpandedRack));

      v.maxHp = Math.round(v._baseMaxHp + bonusHp);
      v.hp = Math.min(v.maxHp, Math.max(v.hp || v.maxHp, Math.round(v.maxHp * hpRatio)));
      v.speed = Number((v._baseSpeed * speedMult).toFixed(1));
      v.maxSpeed = Number((v._baseMaxSpeed * speedMult).toFixed(1));
      v.turnRate = Number((v._baseTurnRate * turnMult).toFixed(2));
      v.customDamageMult =
        (ord.damageMult || 1.0) *
        (isGunship ? acGen.damageMult || 1.0 : 1.0) *
        (isPilotRole ? 1.12 : 1.0);
      v.customCooldownMult =
        (ord.cooldownMult || 1.0) *
        (isGunship ? acGen.reloadMult || 1.0 : 1.0) *
        (isPilotRole ? 0.82 : 1.0);
      v.customFlareCdMult = (cm.flareCdMult || 1.0) * (isPilotRole ? 0.72 : 1.0);

      if (isGunship) {
        v.ac130GenId = acGen.id || 'ac130a_1968';
        v.ac130EraLabel = acGen.shortName || '1968 AC-130A';
        v.ac130MaxMountArc = acGen.maxMountArcRad || 0.16;
        v.ac130AllowBellyCam = Boolean(acGen.allowBellySensorCam);
        v.ac130HasEotechSight = Boolean(acSight.isEotech);
        v.ac130HasFlirRepeater = Boolean(acAvio.hasFlirRepeater || acAvio.hasCoupledAutopilot);
        v.ac130HasCoupledAutopilot = Boolean(acAvio.hasCoupledAutopilot);
        v.hasNightVision = Boolean(acGen.hasNvg || sen.hasNvg);
        v.hasThermalFlir = Boolean(acGen.hasFlir || sen.hasFlir);
        if (v.team !== 'RU') {
          v.name =
            acGen.id === 'ac130j_2024'
              ? 'AC-130J GHOSTRIDER (2024 AFSOC)'
              : acGen.id === 'ac130u_1995'
              ? 'AC-130U SPOOKY II (1995 TGM)'
              : acGen.id === 'ac130h_1973'
              ? 'AC-130H SPECTRE (1973 105MM)'
              : 'AC-130A GUNSHIP II (1968 VIETNAM)';
        }
        if (!v.ac130AllowBellyCam && this.activeVehicle === v && this.vehicleCameraMode === 'OPTIC_NOSE') {
          this.vehicleCameraMode = 'COCKPIT_1P';
          this.thirdPersonVehicle = false;
        }
      } else {
        v.hasNightVision = Boolean(isB2 || sen.hasNvg);
        v.hasThermalFlir = Boolean(isB2 || sen.hasFlir);
      }

      v.sensorZoomFov = v.hasThermalFlir
        ? isGunship
          ? 22
          : 26
        : isGunship
        ? 34
        : sen.zoomFov || 46;
      v.lockRangeMult = sen.lockRangeMult || 1.0;
      v.hasExplicitAutoDircmPod = Boolean(cm.hasAutoDircm);
      v.hasAutoDircm = Boolean(cm.hasAutoDircm);
      v.passiveRegenPerSec = isPilotRole ? 25 : isB2 ? 18 : 8;
      if (isB2 && v.mesh) {
        applyB2SpiritColorToMesh(v.mesh, this.b2SpiritColor, this.b2SpiritAccentColor);
      }
      const senBadge = v.hasThermalFlir
        ? 'FLIR+NVG [N]'
        : v.hasNightVision
        ? 'NVG [N]'
        : 'DAY HUD';
      v.customLoadoutLabel = isGunship
        ? `${v.ac130EraLabel} • ${v.ac130HasEotechSight ? 'EOTECH EXPS3' : 'SIDEWAYS HUD'} • ${v.ac130HasCoupledAutopilot ? 'COUPLED AP' : v.ac130HasFlirRepeater ? 'FLIR MFD' : 'MANUAL PYLON'}`
        : `${senBadge} • ${cm.shortName || 'STD FLARES'} • ${ord.shortName || 'STOCK PYLONS'} • ${frame.shortName || 'STOCK FRAME'}${isPilotRole ? ' • ✈️ PILOT ACE' : ''}`;
    } else {
      const sen = mods.armorSensor || {};
      const def = mods.armorDefense || {};
      const wep = mods.armorWeaponMod || {};
      const chas = mods.armorChassis || {};
      const armRack = mods.armorAmmoRack || {};
      const isArmorRole = this.role === 'armor';

      const bonusHp = (def.bonusHp || 0) + (chas.bonusHp || 0) + (isArmorRole ? 300 : 0);
      const speedMult = (chas.speedMult || 1.0) * (isArmorRole ? 1.14 : 1.0);
      const accelMult =
        (chas.accelMult || 1.0) * (armRack.accelMult || 1.0) * (isArmorRole ? 1.2 : 1.0);
      const rpmMult = (wep.rpmMult || 1.0) * (isArmorRole ? 1.18 : 1.0);
      applyOrdnanceRackScale(Boolean(armRack.isExpandedRack));

      v.maxHp = Math.round(v._baseMaxHp + bonusHp);
      v.hp = Math.min(v.maxHp, Math.max(v.hp || v.maxHp, Math.round(v.maxHp * hpRatio)));
      if (!v.isEmplacement) {
        v.speed = Number((v._baseSpeed * speedMult).toFixed(1));
        v.accelRate = Number((v._baseAccelRate * accelMult).toFixed(2));
      }
      v.rpm = Math.round(v._baseRpm * rpmMult);
      v.customDamageMult = (wep.damageMult || 1.0) * (isArmorRole ? 1.12 : 1.0);
      v.customCoaxHeatMult = (wep.coaxHeatMult || 1.0) * (isArmorRole ? 0.65 : 1.0);
      v.hasNightVision = Boolean(sen.hasNvg);
      v.hasThermalFlir = Boolean(sen.hasFlir);
      v.sensorZoomFov = sen.zoomFov || 44;
      v.hasTrophyAps = Boolean(def.hasTrophyAps || isArmorRole);
      v.hasDozerBlade = Boolean(chas.hasDozerBlade);
      v.passiveRegenPerSec = isArmorRole ? 22 : 6;
      const senBadge = v.hasThermalFlir
        ? 'CITV FLIR [N]'
        : v.hasNightVision
        ? 'CREW NVG [N]'
        : 'DAY OPTICS';
      v.customLoadoutLabel = `${senBadge} • ${def.shortName || 'IR SMOKE'} • ${wep.shortName || 'STOCK GUN'} • ${chas.shortName || 'STOCK CHASSIS'}${isArmorRole ? ' • 🛡️ ARMOR CREW' : ''}`;
    }
  },

  emitCashUpdate(delta, reason) {
    this.syncTotalCash();
    if (this.onCashChanged) {
      this.onCashChanged(this.cash, delta, reason);
    } else {
      events.emit('cash:changed', {
        balance: this.cash,
        matchCash: this.matchCash,
        warehouseCash: this.warehouseCash,
        delta,
        reason
      });
    }
  },

  addCash(amount, reason = '', toWarehouse = false) {
    const clean = Math.round((amount || 0) * 100) / 100;
    if (clean === 0) return;
    this.ensureWarehouseStructures();
    if (toWarehouse) {
      this.warehouseCash = Math.max(0, Math.round(((this.warehouseCash || 0) + clean) * 100) / 100);
    } else {
      this.matchCash = Math.max(0, Math.round(((this.matchCash || 0) + clean) * 100) / 100);
    }
    this.saveGunsmithState();
    this.emitCashUpdate(clean, reason);
  },

  spendFunds(price, preferredSource = 'auto') {
    const cost = Math.max(0, Math.round(price || 0));
    if (cost === 0) return { ok: true, spentMatch: 0, spentWarehouse: 0 };
    this.syncTotalCash();

    if (preferredSource === 'match') {
      if (this.matchCash < cost) {
        return { ok: false, reason: 'INSUFFICIENT_MATCH_CASH', shortBy: cost - this.matchCash };
      }
      this.matchCash -= cost;
      this.syncTotalCash();
      return { ok: true, spentMatch: cost, spentWarehouse: 0 };
    }

    if (preferredSource === 'warehouse') {
      if (this.warehouseCash < cost) {
        return {
          ok: false,
          reason: 'INSUFFICIENT_WAREHOUSE_CASH',
          shortBy: cost - this.warehouseCash
        };
      }
      this.warehouseCash -= cost;
      this.syncTotalCash();
      return { ok: true, spentMatch: 0, spentWarehouse: cost };
    }

    // 'auto': spend from Match Cash first (or Warehouse first if preferredSource === 'warehouse_auto'),
    // combining both wallets if needed so players can always buy upgrades smoothly
    if (this.cash < cost) {
      return { ok: false, reason: 'INSUFFICIENT_FUNDS', shortBy: cost - this.cash };
    }

    if (preferredSource === 'warehouse_first') {
      const fromWh = Math.min(this.warehouseCash, cost);
      const fromMatch = cost - fromWh;
      this.warehouseCash -= fromWh;
      this.matchCash -= fromMatch;
      this.syncTotalCash();
      return { ok: true, spentMatch: fromMatch, spentWarehouse: fromWh };
    }

    const fromMatch = Math.min(this.matchCash, cost);
    const fromWh = cost - fromMatch;
    this.matchCash -= fromMatch;
    this.warehouseCash -= fromWh;
    this.syncTotalCash();
    return { ok: true, spentMatch: fromMatch, spentWarehouse: fromWh };
  },

  spendCash(amount) {
    const res = this.spendFunds(amount, 'match');
    if (res.ok && amount > 0) {
      this.saveGunsmithState();
      this.emitCashUpdate(-amount, 'MATCH REQUISITION');
    }
    return Boolean(res.ok);
  },

  hasModdedVehicleLoadout(vehKey = 'tank') {
    this.ensureWarehouseStructures();
    const mods = this.getVehicleUpgradeMods ? this.getVehicleUpgradeMods() : {};
    const isAir =
      vehKey === 'wright_flyer' ||
      vehKey === 'heli_transport' ||
      vehKey === 'heli_attack' ||
      vehKey === 'cas' ||
      vehKey === 'fighter' ||
      vehKey === 'gunship' ||
      vehKey === 'b2_spirit';
    if (vehKey === 'foot' || vehKey === 'bike' || vehKey === 'atv' || vehKey === 'wright_flyer') {
      return false;
    }
    if (isAir) {
      const slots =
        vehKey === 'gunship'
          ? [mods.airSensor, mods.airCountermeasure, mods.airOrdnance, mods.airFrame, mods.airAmmoRack, mods.ac130Generation, mods.ac130Sight, mods.ac130Avionics]
          : [mods.airSensor, mods.airCountermeasure, mods.airOrdnance, mods.airFrame, mods.airAmmoRack];
      return slots.some((s) => s && (s.price || 0) > 0);
    }
    const gSlots = [mods.armorSensor, mods.armorDefense, mods.armorWeaponMod, mods.armorChassis, mods.armorAmmoRack];
    return gSlots.some((s) => s && (s.price || 0) > 0);
  },

  getVehicleCooldownRemaining(vehKey) {
    if (!vehKey || vehKey === 'foot' || !this._vehCooldownUntil) return 0;
    const nowSec = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    const rem = (this._vehCooldownUntil[vehKey] || 0) - nowSec;
    return rem > 0.2 ? Math.ceil(rem) : 0;
  },

  startVehicleRequisitionCooldown(vehKey) {
    if (!vehKey || vehKey === 'foot') return;
    if (!this._vehCooldownUntil) this._vehCooldownUntil = {};
    const cdSec = ECONOMY.VEHICLE_COOLDOWN_SEC?.[vehKey] || 0;
    if (cdSec > 0) {
      const nowSec = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
      this._vehCooldownUntil[vehKey] = nowSec + cdSec;
    }
  },

  getVehicleRequisitionQuote(vehKey = 'foot', forceStock = null) {
    this.syncTotalCash();
    const normKey = vehKey === 'bomber' ? 'b2_spirit' : vehKey || 'foot';
    const baseCost = ECONOMY.VEHICLE_BASE_COST?.[normKey] ?? 0;
    const isModded = this.hasModdedVehicleLoadout(normKey);
    const useStock =
      forceStock !== null
        ? Boolean(forceStock)
        : Boolean(this.preferStockVehicleRequisition || !isModded);
    const rawSurcharge = isModded ? ECONOMY.VEHICLE_MOD_SURCHARGE?.[normKey] || 0 : 0;
    const modSurcharge = useStock ? 0 : rawSurcharge;
    const totalCost = baseCost + modSurcharge;
    const cooldownRem = this.getVehicleCooldownRemaining(normKey);
    const canAfford = this.matchCash >= totalCost;
    const canAffordStock = this.matchCash >= baseCost;
    return {
      vehKey: normKey,
      baseCost,
      rawSurcharge,
      modSurcharge,
      totalCost,
      isModded,
      useStock,
      cooldownRem,
      canAfford,
      canAffordStock,
      matchCash: this.matchCash,
      shortBy: Math.max(0, Math.ceil(totalCost - this.matchCash))
    };
  },

  payForVehicleRequisition(vehKey, opts = {}) {
    const normKey = vehKey === 'bomber' ? 'b2_spirit' : vehKey || 'foot';
    if (normKey === 'foot') {
      return { ok: true, cost: 0, useStock: true };
    }
    const cdRem = opts.ignoreCooldown ? 0 : this.getVehicleCooldownRemaining(normKey);
    if (cdRem > 0) {
      return { ok: false, reason: 'COOLDOWN', cooldownRem: cdRem, cost: 0 };
    }
    let quote = this.getVehicleRequisitionQuote(normKey, opts.forceStock ?? null);
    // Helpful Tarkov fallback: if player has enough for Stock hull but is slightly short for Modded surcharge, auto-fallback to Stock!
    if (!quote.canAfford && quote.canAffordStock && opts.allowStockFallback !== false) {
      quote = this.getVehicleRequisitionQuote(normKey, true);
    }
    if (!quote.canAfford) {
      return {
        ok: false,
        reason: 'INSUFFICIENT_MATCH_CASH',
        cost: quote.totalCost,
        baseCost: quote.baseCost,
        matchCash: this.matchCash,
        shortBy: quote.shortBy
      };
    }
    const payRes = this.spendFunds(quote.totalCost, 'match');
    if (!payRes.ok) {
      return {
        ok: false,
        reason: 'INSUFFICIENT_MATCH_CASH',
        cost: quote.totalCost,
        matchCash: this.matchCash,
        shortBy: payRes.shortBy || quote.shortBy
      };
    }
    if (!opts.ignoreCooldown) {
      this.startVehicleRequisitionCooldown(normKey);
    }
    this.saveGunsmithState();
    this.emitCashUpdate(
      -quote.totalCost,
      `REQUISITIONED ${normKey.toUpperCase()}${quote.modSurcharge > 0 ? ` (+$${quote.modSurcharge} MOD KIT)` : ''}`
    );
    return {
      ok: true,
      cost: quote.totalCost,
      baseCost: quote.baseCost,
      modSurcharge: quote.modSurcharge,
      useStock: quote.useStock,
      matchCashRemaining: this.matchCash
    };
  },

  buyOrSelectWeapon(roleName, slotType, weaponId, paySource = 'warehouse') {
    this.ensureWarehouseStructures();
    const wepDef = WEAPON_DEFS[weaponId];
    if (!wepDef || wepDef.type !== 'gun') {
      return { ok: false, reason: 'INVALID_WEAPON' };
    }
    const targetRole = roleName && DEFAULT_CLASS_SELECTIONS[roleName] ? roleName : this.role;
    const targetSlot = slotType === 'secondary' || wepDef.slot === 'secondary' ? 'secondary' : 'primary';

    if (
      targetSlot === 'primary' &&
      Array.isArray(wepDef.allowedClasses) &&
      !wepDef.allowedClasses.includes(targetRole)
    ) {
      return { ok: false, reason: 'CLASS_RESTRICTED', weapon: wepDef };
    }

    let boughtNow = false;
    const price = wepDef.warehousePrice || 0;
    if (!this.ownedWeapons.has(weaponId) && price > 0) {
      const payRes = this.spendFunds(price, paySource);
      if (!payRes.ok) {
        return { ok: false, reason: 'INSUFFICIENT_FUNDS', weapon: wepDef, shortBy: payRes.shortBy };
      }
      this.ownedWeapons.add(weaponId);
      boughtNow = true;
    } else {
      this.ownedWeapons.add(weaponId);
    }

    this.classLoadoutSelections[targetRole][targetSlot] = weaponId;
    this.getWeaponAttachmentMap(weaponId);

    if (targetRole === this.role) {
      this.syncActiveEquippedUpgrades();
      this.applyCustomizationsToActiveLoadout(true);
    }

    this.saveGunsmithState();
    sound.playReload();
    const delta = boughtNow ? -price : 0;
    const reason = boughtNow
      ? `UNLOCKED & ASSIGNED: ${wepDef.name}`
      : `ASSIGNED TO ${targetRole.toUpperCase()}: ${wepDef.name}`;
    this.emitCashUpdate(delta, reason);

    return {
      ok: true,
      boughtNow,
      action: boughtNow ? 'BOUGHT' : 'EQUIPPED',
      weapon: wepDef,
      role: targetRole,
      slot: targetSlot
    };
  },

  buyOrEquipUpgrade(category, itemId, weaponId = null, paySource = 'warehouse') {
    this.ensureWarehouseStructures();
    const list = ATTACHMENT_CATALOG[category];
    if (!list) return { ok: false, reason: 'INVALID CATEGORY' };
    const item = list.find((it) => it.id === itemId);
    if (!item) return { ok: false, reason: 'ITEM NOT FOUND' };

    let boughtNow = false;
    if (!this.ownedUpgrades.has(item.id) && item.price > 0) {
      const payRes = this.spendFunds(item.price, paySource);
      if (!payRes.ok) {
        return {
          ok: false,
          reason: 'INSUFFICIENT_FUNDS',
          item,
          shortBy: payRes.shortBy || item.price - this.cash
        };
      }
      this.ownedUpgrades.add(item.id);
      boughtNow = true;
    } else {
      this.ownedUpgrades.add(item.id);
    }

    const activePrimaryId = this.getSelectedWeaponIdForClass(this.role, 'primary');
    const targetWeaponId = weaponId || activePrimaryId;
    if (category === 'vest' || category === 'backpack' || category === 'tacticalGear') {
      this.equippedUpgrades[category] = item.id;
    } else {
      const attMap = this.getWeaponAttachmentMap(targetWeaponId);
      attMap[category] = item.id;
      if (targetWeaponId === activePrimaryId) {
        this.equippedUpgrades[category] = item.id;
      }
    }

    this.saveGunsmithState();
    this.applyCustomizationsToActiveLoadout(true);
    sound.playReload();
    const delta = boughtNow ? -item.price : 0;
    const reason = boughtNow ? `PURCHASED & EQUIPPED: ${item.name}` : `EQUIPPED: ${item.name}`;
    this.emitCashUpdate(delta, reason);
    return {
      ok: true,
      boughtNow,
      action: boughtNow ? 'BOUGHT' : 'EQUIPPED',
      item,
      weaponId: targetWeaponId
    };
  },

  buyFieldRequisition(reqId) {
    this.ensureWarehouseStructures();
    const req = FIELD_REQUISITIONS.find((r) => r.id === reqId);
    if (!req) return { ok: false, reason: 'UNKNOWN_REQUISITION' };

    const buildMap = {
      build_covered_bunker: 'COVERED_BUNKER',
      build_hmg_nest: 'HMG_NEST',
      build_mortar_pit: 'MORTAR_PIT',
      build_aa_emplace: 'AA_EMPLACE',
      build_bunker: 'BUNKER',
      build_house: 'HOUSE'
    };
    if (buildMap[reqId]) {
      if (typeof this.buildPaidHouseOrBunker === 'function') {
        return this.buildPaidHouseOrBunker(buildMap[reqId]);
      }
    }

    // Field requisitions strictly spend In-Match Cash (⚡ Match Cash)!
    const paySource = 'match';
    const payRes = this.spendFunds(req.price, paySource);
    if (!payRes.ok) {
      return {
        ok: false,
        reason: 'INSUFFICIENT_FUNDS',
        req,
        shortBy: payRes.shortBy || req.price - this.matchCash
      };
    }

    if (reqId === 'resupply_drop') {
      if (typeof this.resupplyAll === 'function') {
        this.resupplyAll();
      }
      this.armor = this.maxArmor || PLAYER.MAX_ARMOR;
      this.bandages = (this.bandages || 3) + 2;
      this.grenades = (this.grenades || 2) + 1;
    } else if (reqId === 'combat_stim') {
      this.hp = this.maxHp || PLAYER.MAX_HP;
      this.bleeding = false;
      this.armFractured = false;
      this.legFractured = false;
      this.limbHealth = {
        head: 100,
        thorax: 100,
        leftArm: 100,
        rightArm: 100,
        leftLeg: 100,
        rightLeg: 100
      };
      this.suppressionLevel = 0;
      sound.playReload();
    } else if (reqId === 'emergency_uav') {
      this.uavCooldown = 0;
      if (typeof this.activateUAV === 'function') {
        this.activateUAV();
      }
    } else if (reqId === 'bank_transfer') {
      this.warehouseCash += req.price;
      this.careerStats.totalExtractedCash =
        (this.careerStats.totalExtractedCash || 0) + req.price;
      sound.playReload();
    }

    this.saveGunsmithState();
    this.emitCashUpdate(-req.price, `FIELD REQUISITION: ${req.name}`);
    return { ok: true, req };
  },

  buyWarehouseStock(stockKey, price = 250) {
    this.ensureWarehouseStructures();
    if (!(stockKey in this.warehouseStock)) return { ok: false, reason: 'INVALID_STOCK' };
    const payRes = this.spendFunds(price, 'warehouse_first');
    if (!payRes.ok) return { ok: false, reason: 'INSUFFICIENT_FUNDS' };
    this.warehouseStock[stockKey] = (this.warehouseStock[stockKey] || 0) + 1;
    this.saveGunsmithState();
    sound.playReload();
    this.emitCashUpdate(-price, `WAREHOUSE STOCKPILED: ${stockKey.toUpperCase()}`);
    return { ok: true, count: this.warehouseStock[stockKey] };
  },

  useWarehouseStock(stockKey) {
    this.ensureWarehouseStructures();
    if (!this.warehouseStock[stockKey] || this.warehouseStock[stockKey] <= 0) {
      return { ok: false, reason: 'OUT_OF_STOCK' };
    }
    this.warehouseStock[stockKey]--;
    if (stockKey === 'armorPlates') {
      this.armor = (this.maxArmor || PLAYER.MAX_ARMOR) + 25;
    } else if (stockKey === 'medStims') {
      this.hp = this.maxHp || PLAYER.MAX_HP;
      this.bleeding = false;
      this.armFractured = false;
      this.legFractured = false;
      this.limbHealth = {
        head: 100,
        thorax: 100,
        leftArm: 100,
        rightArm: 100,
        leftLeg: 100,
        rightLeg: 100
      };
      this.bandages = (this.bandages || 3) + 2;
    } else if (stockKey === 'ammoPacks') {
      if (typeof this.resupplyAll === 'function') this.resupplyAll();
      this.grenades = (this.grenades || 2) + 2;
    }
    this.saveGunsmithState();
    sound.playReload();
    this.emitCashUpdate(0, `DEPLOYED WAREHOUSE CRATE: ${stockKey.toUpperCase()}`);
    return { ok: true, remaining: this.warehouseStock[stockKey] };
  },

  /**
   * ABI / Tarkov Loot Extraction Tracker:
   * Records every scavenged enemy item into `this.extractedRoundLoot` so between rounds (or in the Warehouse Hub)
   * the player can choose to SELL it for Warehouse Vault Cash OR SAVE it in their Personal Warehouse!
   */
  recordLootedFieldItem(item, pack, mode = 'take') {
    this.ensureWarehouseStructures();
    if (!item) return null;
    // If the player stripped a weapon on the spot for match cash, it was already converted to cash
    if (item.type === 'weapon' && mode === 'scrap') return null;

    const ownerLabel = pack
      ? `${pack.ownerRank || 'SGT'} ${pack.ownerName || 'OPERATOR'} [${pack.ownerTeam || 'RU'} ${
          pack.ownerRole || 'ASSAULT'
        }]`
      : 'FALLEN ENEMY OPERATOR';

    let sellPrice = 150;
    let saveSummary = 'STORES IN PERSONAL WAREHOUSE STASH';
    let displayName = item.name || 'SCAVENGED TACTICAL GEAR';
    let icon = item.icon || '📦';
    let grid = item.grid || '1×1';

    if (item.type === 'weapon') {
      const wepDef = WEAPON_DEFS[item.weaponId];
      sellPrice = Math.max(
        240,
        item.scrapValue || Math.round((wepDef?.warehousePrice || 450) * 0.65)
      );
      saveSummary = `UNLOCKS ${wepDef?.shortName || item.name} IN ARMORY + STORES IN WAREHOUSE`;
      grid = '2×4';
      icon = '🔫';
    } else if (item.type === 'armor_plate') {
      sellPrice = 220;
      saveSummary = 'UNLOCKS TACTICAL BACKPACK + ADDS +1 ARMOR PLATE CRATE TO WAREHOUSE';
      grid = '2×2';
      icon = '🛡️';
    } else if (item.type === 'mags') {
      sellPrice = 140;
      saveSummary = 'ADDS +1 LOADED AMMO & MAG CRATE TO PERSONAL WAREHOUSE';
      grid = '1×2';
      icon = '▱';
    } else if (item.type === 'loose_ammo') {
      sellPrice = 120;
      saveSummary = 'ADDS +1 AMMO PACK CRATE TO PERSONAL WAREHOUSE';
      grid = '2×1';
      icon = '🔸';
    } else if (item.type === 'dressings') {
      sellPrice = 150;
      saveSummary = 'ADDS +1 COMBAT MED STIM & TRAUMA CRATE TO PERSONAL WAREHOUSE';
      grid = '1×1';
      icon = '🩹';
    } else if (item.type === 'ordnance') {
      sellPrice = 165;
      saveSummary = 'ADDS +1 ORDNANCE & AMMO CRATE TO PERSONAL WAREHOUSE';
      grid = '1×1';
      icon = '💣';
    } else if (item.type === 'bounty') {
      sellPrice = 180;
      displayName = `DOGTAG TROPHY: ${pack?.ownerRank || 'SGT'} ${pack?.ownerName || 'VOLKOV'}`;
      saveSummary = 'STORES ENEMY DOGTAG TROPHY IN PERSONAL WAREHOUSE VAULT';
      grid = '1×1';
      icon = '🏷️';
    }

    const entry = {
      uid: `loot_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: item.type,
      name: displayName,
      desc: item.desc || `Scavenged from ${ownerLabel}`,
      icon,
      grid,
      weaponId: item.weaponId || null,
      backpackUpgradeId: item.backpackUpgradeId || null,
      ownerLabel,
      sellPrice,
      saveSummary
    };

    this.extractedRoundLoot.unshift(entry);
    if (this.extractedRoundLoot.length > 24) {
      this.extractedRoundLoot.length = 24;
    }
    this.saveGunsmithState();
    return entry;
  },

  /**
   * Sells a single extracted loot item (or saved warehouse stash item) for Warehouse Vault Cash (`warehouseCash`).
   */
  sellExtractedLootItem(uid) {
    this.ensureWarehouseStructures();
    let idx = this.extractedRoundLoot.findIndex((it) => it.uid === uid);
    let item = idx !== -1 ? this.extractedRoundLoot.splice(idx, 1)[0] : null;
    if (!item) {
      const sIdx = this.warehouseStashItems.findIndex((it) => it.uid === uid);
      if (sIdx !== -1) {
        item = this.warehouseStashItems.splice(sIdx, 1)[0];
      }
    }
    if (!item) return { ok: false, reason: 'ITEM_NOT_FOUND' };

    const price = Math.max(50, Math.round(item.sellPrice || 150));
    this.warehouseCash = (this.warehouseCash || 0) + price;
    this.careerStats.totalExtractedCash = (this.careerStats.totalExtractedCash || 0) + price;
    this.saveGunsmithState();
    sound.playReload();
    this.emitCashUpdate(price, `SOLD LOOT TO MARKET: ${item.name} (+$${price} VAULT)`);
    return { ok: true, item, price, newWarehouseBalance: this.warehouseCash };
  },

  /**
   * Saves a single extracted loot item from the previous round into the player's Personal Warehouse (`warehouseStashItems`),
   * also unlocking its weapon/backpack or incrementing the corresponding Warehouse Supply Crate stock!
   */
  saveExtractedLootItemToWarehouse(uid) {
    this.ensureWarehouseStructures();
    const idx = this.extractedRoundLoot.findIndex((it) => it.uid === uid);
    if (idx === -1) return { ok: false, reason: 'ITEM_NOT_FOUND' };
    const item = this.extractedRoundLoot.splice(idx, 1)[0];

    this._applyLootItemToWarehouseStorage(item);
    this.saveGunsmithState();
    sound.playReload();
    this.emitCashUpdate(0, `SAVED TO PERSONAL WAREHOUSE: ${item.name}`);
    return { ok: true, item };
  },

  _applyLootItemToWarehouseStorage(item) {
    if (!item) return;
    if (item.type === 'weapon' && item.weaponId && WEAPON_DEFS[item.weaponId]) {
      this.ownedWeapons.add(item.weaponId);
    } else if (item.type === 'armor_plate') {
      this.warehouseStock.armorPlates = (this.warehouseStock.armorPlates || 0) + 1;
      if (item.backpackUpgradeId) {
        this.ownedUpgrades.add(item.backpackUpgradeId);
      }
    } else if (item.type === 'mags' || item.type === 'loose_ammo' || item.type === 'ordnance') {
      this.warehouseStock.ammoPacks = (this.warehouseStock.ammoPacks || 0) + 1;
    } else if (item.type === 'dressings') {
      this.warehouseStock.medStims = (this.warehouseStock.medStims || 0) + 1;
    }
    this.warehouseStashItems.unshift({
      ...item,
      savedAt: Date.now()
    });
    if (this.warehouseStashItems.length > 36) {
      this.warehouseStashItems.length = 36;
    }
  },

  /**
   * Sells ALL unsorted extracted loot items from the previous round for Warehouse Vault Cash (`warehouseCash`).
   */
  sellAllExtractedLoot() {
    this.ensureWarehouseStructures();
    if (!this.extractedRoundLoot || this.extractedRoundLoot.length === 0) {
      return { ok: false, count: 0, totalEarned: 0 };
    }
    const count = this.extractedRoundLoot.length;
    const totalEarned = this.extractedRoundLoot.reduce(
      (sum, it) => sum + Math.max(50, Math.round(it.sellPrice || 150)),
      0
    );
    this.extractedRoundLoot = [];
    this.warehouseCash = (this.warehouseCash || 0) + totalEarned;
    this.careerStats.totalExtractedCash = (this.careerStats.totalExtractedCash || 0) + totalEarned;
    this.saveGunsmithState();
    sound.playReload();
    this.emitCashUpdate(
      totalEarned,
      `SOLD ALL ${count} EXTRACTED LOOT ITEMS (+$${totalEarned} TO WAREHOUSE VAULT)`
    );
    return { ok: true, count, totalEarned, newWarehouseBalance: this.warehouseCash };
  },

  /**
   * Saves ALL unsorted extracted loot items from the previous round into the Personal Warehouse!
   */
  saveAllExtractedLootToWarehouse() {
    this.ensureWarehouseStructures();
    if (!this.extractedRoundLoot || this.extractedRoundLoot.length === 0) {
      return { ok: false, count: 0 };
    }
    const items = [...this.extractedRoundLoot];
    this.extractedRoundLoot = [];
    for (const it of items) {
      this._applyLootItemToWarehouseStorage(it);
    }
    this.saveGunsmithState();
    sound.playReload();
    this.emitCashUpdate(
      0,
      `SAVED ALL ${items.length} EXTRACTED LOOT ITEMS TO PERSONAL WAREHOUSE!`
    );
    return { ok: true, count: items.length };
  },

  /**
   * Equips or uses a saved item directly from `this.warehouseStashItems` in the Personal Warehouse.
   */
  equipOrUseWarehouseStashItem(uid) {
    this.ensureWarehouseStructures();
    const idx = this.warehouseStashItems.findIndex((it) => it.uid === uid);
    if (idx === -1) return { ok: false, reason: 'ITEM_NOT_FOUND' };
    const item = this.warehouseStashItems[idx];

    if (item.type === 'weapon' && item.weaponId && WEAPON_DEFS[item.weaponId]) {
      const wepDef = WEAPON_DEFS[item.weaponId];
      const targetRole =
        Array.isArray(wepDef.allowedClasses) && !wepDef.allowedClasses.includes(this.role)
          ? wepDef.allowedClasses[0]
          : this.role;
      this.buyOrSelectWeapon(
        targetRole,
        wepDef.slot === 'secondary' ? 'secondary' : 'primary',
        item.weaponId
      );
      return { ok: true, action: 'EQUIPPED_WEAPON', item };
    }

    if (item.type === 'armor_plate') {
      if (item.backpackUpgradeId) {
        this.equippedUpgrades.backpack = item.backpackUpgradeId;
        this.ownedUpgrades.add(item.backpackUpgradeId);
      }
      this.armor = (this.maxArmor || PLAYER.MAX_ARMOR) + 35;
      this.warehouseStashItems.splice(idx, 1);
      this.saveGunsmithState();
      this.applyCustomizationsToActiveLoadout(true);
      sound.playReload();
      this.emitCashUpdate(0, `EQUIPPED SAVED WAREHOUSE GEAR: ${item.name}`);
      return { ok: true, action: 'USED_GEAR', item };
    }

    if (item.type === 'dressings') {
      this.hp = this.maxHp || PLAYER.MAX_HP;
      this.bleeding = false;
      this.bandages = (this.bandages || 3) + 3;
      this.warehouseStashItems.splice(idx, 1);
      this.saveGunsmithState();
      sound.playReload();
      this.emitCashUpdate(0, `USED SAVED TRAUMA KIT: ${item.name}`);
      return { ok: true, action: 'USED_MEDS', item };
    }

    if (item.type === 'mags' || item.type === 'loose_ammo' || item.type === 'ordnance') {
      if (typeof this.resupplyAll === 'function') this.resupplyAll(true);
      this.grenades = (this.grenades || 2) + 2;
      this.warehouseStashItems.splice(idx, 1);
      this.saveGunsmithState();
      sound.playReload();
      this.emitCashUpdate(0, `LOADED SAVED AMMO & ORDNANCE: ${item.name}`);
      return { ok: true, action: 'USED_AMMO', item };
    }

    // For bounty dogtags, clicking action sells it to Intelligence for Vault Cash
    return this.sellExtractedLootItem(uid);
  },

  settleMatchToWarehouse(winnerTeam, roundEpoch = null) {
    if (
      roundEpoch !== null &&
      this._lastSettledRoundEpoch === roundEpoch &&
      this.lastMatchExtraction
    ) {
      return this.lastMatchExtraction;
    }
    if (roundEpoch !== null) {
      this._lastSettledRoundEpoch = roundEpoch;
    }
    this.ensureWarehouseStructures();
    this.syncTotalCash();
    const matchCashLeft = Math.max(0, Math.round(this.matchCash || 0));
    const perfBonus =
      (this.kills || 0) * 45 +
      (this.revives || 0) * 75 +
      (this.captures || 0) * 100 +
      (this.planesDestroyed || 0) * 260 +
      (this.tanksDestroyed || 0) * 180 +
      (this.carsDestroyed || 0) * 95;
    const isVictory = winnerTeam === this.team;
    const mult = isVictory ? 1.5 : 1.15;
    const baseTotal = matchCashLeft + perfBonus;
    const totalDeposited = Math.round(baseTotal * mult);
    const victoryBonus = totalDeposited - baseTotal;

    this.warehouseCash += totalDeposited;
    this.matchCash = PLAYER.STARTING_CASH || 150;
    this.careerStats.matchesPlayed = (this.careerStats.matchesPlayed || 0) + 1;
    if (isVictory) {
      this.careerStats.matchesWon = (this.careerStats.matchesWon || 0) + 1;
    }
    this.careerStats.totalExtractedCash =
      (this.careerStats.totalExtractedCash || 0) + totalDeposited;

    // Ensure the player always has Battlefield Spoils from the completed round ready to Sell or Save to Warehouse!
    if (!Array.isArray(this.extractedRoundLoot) || this.extractedRoundLoot.length === 0) {
      const enemyTeam = this.team === 'US' ? 'RU' : 'US';
      const trophyWepId = enemyTeam === 'RU' ? 'ak15' : 'scar_h';
      const trophyWepDef =
        WEAPON_DEFS[trophyWepId] || WEAPON_DEFS.ak15 || WEAPON_DEFS.m4a1 || Object.values(WEAPON_DEFS)[0];
      this.extractedRoundLoot = [
        {
          uid: `loot_${Date.now()}_wep`,
          type: 'weapon',
          name: trophyWepDef.name,
          desc: `Captured enemy primary rifle (${trophyWepDef.caliber}) recovered at end of round`,
          icon: '🔫',
          grid: '2×4',
          weaponId: trophyWepDef.id,
          backpackUpgradeId: null,
          ownerLabel: `CAPTURED ${enemyTeam} SQUAD LEADER`,
          sellPrice: 340,
          saveSummary: `UNLOCKS ${trophyWepDef.shortName} IN ARMORY + STORES IN PERSONAL WAREHOUSE`
        },
        {
          uid: `loot_${Date.now()}_plate`,
          type: 'armor_plate',
          name: '6B43 BALLISTIC PLATE & BERKUT PACK (4×4)',
          desc: '+55 Armor Plate & Berkut 16-Cell Assault Backpack recovered from battlefield',
          icon: '🛡️',
          grid: '2×2',
          weaponId: null,
          backpackUpgradeId: 'berkut_pack',
          ownerLabel: `CAPTURED ${enemyTeam} ENGINEER`,
          sellPrice: 220,
          saveSummary: 'UNLOCKS BERKUT 4×4 BACKPACK + ADDS +1 ARMOR PLATE CRATE TO WAREHOUSE'
        },
        {
          uid: `loot_${Date.now()}_med`,
          type: 'dressings',
          name: 'SQUAD IFAK TRAUMA KIT & 3× LOADED MAGS',
          desc: 'Recovered field medical kit & loaded rifle magazines',
          icon: '🩹',
          grid: '1×2',
          weaponId: null,
          backpackUpgradeId: null,
          ownerLabel: `CAPTURED ${enemyTeam} MEDIC`,
          sellPrice: 160,
          saveSummary: 'ADDS +1 COMBAT MED STIM & TRAUMA CRATE TO PERSONAL WAREHOUSE'
        }
      ];
    }

    this.saveGunsmithState();
    this.lastMatchExtraction = {
      matchCashLeft,
      perfBonus,
      victoryBonus,
      mult,
      isVictory,
      totalDeposited,
      newWarehouseBalance: this.warehouseCash,
      extractedLootCount: this.extractedRoundLoot.length
    };
    this.emitCashUpdate(totalDeposited, 'END-OF-ROUND WAREHOUSE EXTRACTION');
    return this.lastMatchExtraction;
  },

  addDemoFundsForCases(amount = 50000) {
    this.ensureWarehouseStructures();
    this.warehouseCash = (this.warehouseCash || 0) + Math.max(500, Math.floor(amount));
    if ((this.caseKeys || 0) < 1) {
      this.caseKeys = 1;
    }
    this.syncTotalCash();
    this.saveGunsmithState();
    sound.playBuy();
    this.emitCashUpdate(amount, 'MYSTERY CASE VAULT FUNDS');
    return this.cash;
  },

  equipSpecialSkin(skinId) {
    this.ensureWarehouseStructures();
    const item = GOLD_SPECIAL_POOL.find((entry) => entry.id === skinId);
    if (!item) return { ok: false, reason: 'SKIN NOT FOUND' };
    if (!this.ownedSkins.has(item.id)) {
      return { ok: false, reason: 'LOCKED — UNBOX IN $50,000 MYSTERY CASE (1/10 GOLD)' };
    }
    if (item.kind === 'hammer_skin') {
      if (this.equippedHammerSkin === item.skinFinish) {
        this.equippedHammerSkin = null;
      } else {
        this.equippedHammerSkin = item.skinFinish;
      }
      this.saveGunsmithState();
      this.applyCustomizationsToActiveLoadout(false);
      sound.playBuy();
      return {
        ok: true,
        equipped: this.equippedHammerSkin === item.skinFinish,
        item,
        msg:
          this.equippedHammerSkin === item.skinFinish
            ? `EQUIPPED ${item.name} IN SLOT [4] MELEE!`
            : `RESTORED STANDARD TACTICAL HAMMER IN SLOT [4]`
      };
    }

    if (item.kind === 'weapon_skin' && item.weaponId) {
      const wepId = item.weaponId;
      // Ensure the base weapon is also unlocked and equipped if applicable
      this.ownedWeapons.add(wepId);
      if (this.equippedWeaponSkins[wepId] === item.skinFinish) {
        delete this.equippedWeaponSkins[wepId];
      } else {
        this.equippedWeaponSkins[wepId] = item.skinFinish;
      }
      const wepDef = WEAPON_DEFS[wepId];
      if (wepDef && this.equippedWeaponSkins[wepId] === item.skinFinish) {
        if (wepDef.slot === 'secondary') {
          this.classLoadoutSelections[this.role].secondary = wepId;
        } else if (
          Array.isArray(wepDef.allowedClasses) &&
          wepDef.allowedClasses.includes(this.role)
        ) {
          this.classLoadoutSelections[this.role].primary = wepId;
        }
      }
      this.saveGunsmithState();
      this.applyCustomizationsToActiveLoadout(false);
      sound.playBuy();
      return {
        ok: true,
        equipped: this.equippedWeaponSkins[wepId] === item.skinFinish,
        item,
        msg:
          this.equippedWeaponSkins[wepId] === item.skinFinish
            ? `EQUIPPED ${item.name}!`
            : `REMOVED SKIN FROM ${wepDef ? wepDef.name : wepId.toUpperCase()}`
      };
    }
    return { ok: false, reason: 'INVALID SKIN TYPE' };
  },

  buyCaseKey(count = 1, paySource = 'warehouse') {
    this.ensureWarehouseStructures();
    const qty = Math.max(1, Math.floor(count || 1));
    const keyPrice = 250 * qty;
    const spendRes = this.spendFunds(keyPrice, paySource);
    if (!spendRes || !spendRes.ok) {
      sound.playEmptyClick?.();
      return {
        ok: false,
        reason: `NEED 🏦 $${keyPrice} IN ARMORY BANK TO BUY ${qty} ARMORY KEY(S)`
      };
    }
    this.caseKeys = Math.max(0, (this.caseKeys || 0) + qty);
    this.saveGunsmithState();
    sound.playBuy();
    this.emitCashUpdate(-keyPrice, `🔑 BOUGHT ${qty}x ARMORY KEY (${this.caseKeys} HELD)`);
    return {
      ok: true,
      caseKeys: this.caseKeys
    };
  },

  openMysteryCase(paySource = 'warehouse') {
    this.ensureWarehouseStructures();
    if ((this.caseKeys || 0) < 1) {
      sound.playEmptyClick?.();
      return {
        ok: false,
        needsKey: true,
        reason: 'NEED 1 🔑 ARMORY KEY ($250 OR FOUND IN BUILDINGS)'
      };
    }
    const price = CASE_PRICE || 50000;
    const spendRes = this.spendFunds(price, paySource);
    if (!spendRes || !spendRes.ok) {
      sound.playEmptyClick?.();
      return {
        ok: false,
        reason: `NEED $${price.toLocaleString()} FOR ARMORY CASE`
      };
    }

    this.caseKeys = Math.max(0, (this.caseKeys || 0) - 1);
    this.casesOpenedCount = (this.casesOpenedCount || 0) + 1;

    // Pure RNG 1/10 (10%) exact chance for the Rare Gold Section!
    // Guaranteed gold or buying specific gold is strictly prohibited.
    const roll = Math.random();
    const isGold = roll < (CASE_GOLD_CHANCE || 0.1);

    // Build a 60-tile CS2 horizontal roulette reel where index 52 is the winning item
    const WINNING_INDEX = 52;
    const TOTAL_TILES = 60;
    const buildRouletteReel = (winningTile) => {
      const reel = [];
      for (let i = 0; i < TOTAL_TILES; i++) {
        if (i === WINNING_INDEX) {
          reel.push(winningTile);
          continue;
        }
        const tileIsGold = Math.random() < (CASE_GOLD_CHANCE || 0.1);
        if (tileIsGold) {
          const g = GOLD_SPECIAL_POOL[Math.floor(Math.random() * GOLD_SPECIAL_POOL.length)];
          reel.push({
            isGold: true,
            id: g.id,
            name: g.shortName || g.name,
            fullName: g.name,
            weaponId: g.weaponId,
            skinFinish: g.skinFinish,
            kind: g.kind
          });
        } else {
          const wId = CASE_GUN_POOL[Math.floor(Math.random() * CASE_GUN_POOL.length)];
          const wDef = WEAPON_DEFS[wId] || WEAPON_DEFS.m9_beretta;
          reel.push({
            isGold: false,
            id: wId,
            name: wDef.shortName || wDef.name,
            fullName: wDef.name,
            weaponId: wId,
            skinFinish: null,
            kind: 'weapon'
          });
        }
      }
      return reel;
    };

    if (isGold) {
      this.goldUnboxedCount = (this.goldUnboxedCount || 0) + 1;
      // Pure RNG selection from the Gold Special Pool (headline items weighted slightly if unowned)
      const headlineIds = [
        'hammer_karambit',
        'hammer_butterfly',
        'skin_mp443_blue',
        'skin_m9_beretta_gold',
        'skin_m9_beretta_blue',
        'skin_m4a1_gold',
        'skin_ak15_gold',
        'skin_awm_gold',
        'skin_deagle_gold'
      ];
      const unownedHeadlines = GOLD_SPECIAL_POOL.filter(
        (g) => headlineIds.includes(g.id) && !this.ownedSkins.has(g.id)
      );
      const unownedAll = GOLD_SPECIAL_POOL.filter((g) => !this.ownedSkins.has(g.id));
      let chosenGold = null;
      if (unownedHeadlines.length > 0 && Math.random() < 0.72) {
        chosenGold = unownedHeadlines[Math.floor(Math.random() * unownedHeadlines.length)];
      } else if (unownedAll.length > 0) {
        chosenGold = unownedAll[Math.floor(Math.random() * unownedAll.length)];
      } else {
        chosenGold = GOLD_SPECIAL_POOL[Math.floor(Math.random() * GOLD_SPECIAL_POOL.length)];
      }

      const wasOwned = this.ownedSkins.has(chosenGold.id);
      this.ownedSkins.add(chosenGold.id);

      // Auto-equip the unboxed Gold item so the player immediately sees it!
      if (chosenGold.kind === 'hammer_skin') {
        this.equippedHammerSkin = chosenGold.skinFinish;
      } else if (chosenGold.kind === 'weapon_skin' && chosenGold.weaponId) {
        this.ownedWeapons.add(chosenGold.weaponId);
        this.equippedWeaponSkins[chosenGold.weaponId] = chosenGold.skinFinish;
        const wDef = WEAPON_DEFS[chosenGold.weaponId];
        if (wDef) {
          if (wDef.slot === 'secondary') {
            this.classLoadoutSelections[this.role].secondary = chosenGold.weaponId;
          } else if (
            Array.isArray(wDef.allowedClasses) &&
            wDef.allowedClasses.includes(this.role)
          ) {
            this.classLoadoutSelections[this.role].primary = chosenGold.weaponId;
          }
        }
      }

      let rebate = 0;
      if (wasOwned) {
        rebate = 350;
        this.warehouseCash += rebate;
        this.syncTotalCash();
      }

      this.applyCustomizationsToActiveLoadout(false);
      this.saveGunsmithState();
      sound.playBuy();
      this.emitCashUpdate(-price + rebate, `★ UNBOXED RARE GOLD: ${chosenGold.shortName}`);

      const winningTile = {
        isGold: true,
        id: chosenGold.id,
        name: chosenGold.shortName || chosenGold.name,
        fullName: chosenGold.name,
        desc: chosenGold.desc,
        weaponId: chosenGold.weaponId,
        skinFinish: chosenGold.skinFinish,
        kind: chosenGold.kind,
        wasDuplicate: wasOwned,
        rebate
      };

      this.lastCaseResult = {
        ok: true,
        isGold: true,
        reward: winningTile,
        reel: buildRouletteReel(winningTile),
        winningIndex: WINNING_INDEX
      };
      return this.lastCaseResult;
    }

    // Standard 9/10 (90%) Case Roll: M9 Beretta + Misc Case Weapons
    const weightedPool = [];
    for (const wId of CASE_GUN_POOL) {
      if (!WEAPON_DEFS[wId]) continue;
      const isOwned = this.ownedWeapons.has(wId);
      const weight = wId === 'm9_beretta' && !isOwned ? 5 : !isOwned ? 3 : 1;
      for (let k = 0; k < weight; k++) weightedPool.push(wId);
    }
    const wonWeaponId =
      weightedPool[Math.floor(Math.random() * weightedPool.length)] || 'm9_beretta';
    const wonDef = WEAPON_DEFS[wonWeaponId] || WEAPON_DEFS.m9_beretta;
    const wasOwned = this.ownedWeapons.has(wonWeaponId);
    this.ownedWeapons.add(wonWeaponId);
    this.getWeaponAttachmentMap(wonWeaponId);

    // Auto-equip if it fits current class or is a sidearm
    if (wonDef.slot === 'secondary') {
      this.classLoadoutSelections[this.role].secondary = wonWeaponId;
    } else if (
      Array.isArray(wonDef.allowedClasses) &&
      wonDef.allowedClasses.includes(this.role)
    ) {
      this.classLoadoutSelections[this.role].primary = wonWeaponId;
    }

    let rebate = 0;
    if (wasOwned) {
      rebate = 200;
      this.warehouseCash += rebate;
      this.syncTotalCash();
    }

    this.applyCustomizationsToActiveLoadout(false);
    this.saveGunsmithState();
    sound.playBuy();
    this.emitCashUpdate(-price + rebate, `UNBOXED WEAPON: ${wonDef.name}`);

    const winningTile = {
      isGold: false,
      id: wonWeaponId,
      name: wonDef.shortName || wonDef.name,
      fullName: wonDef.name,
      desc: `${wonDef.caliber} • ${wonDef.rpm} RPM • ${wonDef.damage} DMG`,
      weaponId: wonWeaponId,
      skinFinish: this.equippedWeaponSkins[wonWeaponId] || null,
      kind: 'weapon',
      wasDuplicate: wasOwned,
      rebate
    };

    this.lastCaseResult = {
      ok: true,
      isGold: false,
      reward: winningTile,
      reel: buildRouletteReel(winningTile),
      winningIndex: WINNING_INDEX
    };
    return this.lastCaseResult;
  },

  buildCustomizedWeaponDef(baseDef, isPrimaryGun = false, weaponIdOverride = null) {
    if (!baseDef) return baseDef;
    this.ensureWarehouseStructures();
    const vest = this.getEquippedItem('vest');
    const backpack = this.getEquippedItem('backpack');

    // Non-firearm gadgets (RPG-7, C4, Ammo Crate), Medieval/Jurassic weapons & Melee Hammer skins
    if (baseDef.type !== 'gun' || baseDef.isBow || baseDef.isThrowingBlade || baseDef.isVenomSpit) {
      if (baseDef.type === 'hammer' && this.equippedHammerSkin) {
        const isKarambit = this.equippedHammerSkin === 'karambit';
        return {
          ...baseDef,
          name: isKarambit
            ? '★ KARAMBIT // TIGER CLAW GOLD'
            : '★ BUTTERFLY KNIFE // SAPPHIRE & GOLD',
          shortName: isKarambit ? '★ KARAMBIT' : '★ BUTTERFLY',
          caliber: isKarambit
            ? 'RARE GOLD 1/10 • HAWKBILL CLAW + BREACHING TOOL'
            : 'RARE GOLD 1/10 • BALISONG + BREACHING TOOL',
          skinFinish: this.equippedHammerSkin,
          bodyColor: isKarambit ? 0xffd32a : 0x0652dd,
          accentColor: isKarambit ? 0x1a1e24 : 0xffd32a
        };
      }
      if (baseDef.type === 'rpg' || baseDef.type === 'c4' || baseDef.type === 'ammocrate') {
        const bonusGadgets = backpack && backpack.bonusGadgets ? backpack.bonusGadgets : 0;
        return {
          ...baseDef,
          reserveAmmo: (baseDef.reserveAmmo || 0) + bonusGadgets,
          maxLooseAmmo: 0
        };
      }
      return baseDef;
    }

    const targetWepId = weaponIdOverride || baseDef.id;
    const muzzle = this.getEquippedItem('muzzle', targetWepId);
    const mag = this.getEquippedItem('magazine', targetWepId);
    const optic = this.getEquippedItem('optic', targetWepId);
    const grip = this.getEquippedItem('grip', targetWepId);
    const ammo = this.getEquippedItem('ammoType', targetWepId);

    const capMult = mag ? mag.capMult : 1.0;
    const newClip = Math.max(1, Math.round(baseDef.clipSize * capMult));

    // Tarkov Chest Rig (`vest`) + Backpack (`backpack`) + Class Trait (`CLASS_TRAITS`) expand spare magazine count & Loose Bullet capacity!
    const classTrait = CLASS_TRAITS[this.role] || {};
    const classReserveMult = classTrait.reserveMagMult || 1.0;
    const classReloadMult = classTrait.reloadTimeMult || 1.0;
    const classRecoilMult = classTrait.recoilMult || 1.0;
    const baseSpareMags = Math.max(
      1,
      Math.round((baseDef.reserveAmmo / Math.max(1, baseDef.clipSize)) * (isPrimaryGun ? classReserveMult : 1.0))
    );
    const rigBonusMags = isPrimaryGun
      ? vest?.bonusMags || 0
      : Math.ceil((vest?.bonusMags || 0) * 0.5);
    const packBonusMags = isPrimaryGun
      ? backpack?.bonusMags || 0
      : Math.ceil((backpack?.bonusMags || 0) * 0.5);
    const totalSpareMags = Math.max(1, baseSpareMags + rigBonusMags + packBonusMags);
    const newReserve = Math.max(newClip, totalSpareMags * newClip);

    const baseLoose = isPrimaryGun
      ? backpack?.looseAmmoPrimary ?? 60
      : backpack?.looseAmmoSecondary ?? 36;
    const maxLooseAmmo = Math.max(newClip, Math.round(baseLoose * capMult * classReserveMult));
    const vestSwapMult = vest?.magSwapMult || 1.0;

    const dmgMult = ammo && ammo.dmgMult ? ammo.dmgMult : 1.0;
    const armorPenMult =
      (baseDef.armorPenMult || 1.0) * (ammo && ammo.armorPenMult ? ammo.armorPenMult : 1.0);
    const voxelMult = ammo && ammo.voxelMult ? ammo.voxelMult : 1.0;
    const velMult =
      (ammo && ammo.velocityMult ? ammo.velocityMult : 1.0) *
      (muzzle && muzzle.velocityMult ? muzzle.velocityMult : 1.0);
    const baseVel = baseDef.muzzleVelocity || 780;
    const finalMuzzleVel =
      ammo && ammo.subsonicCap
        ? Math.min(ammo.subsonicCap, Math.round(baseVel * velMult))
        : Math.round(baseVel * velMult);

    const recoilMult =
      (muzzle ? muzzle.recoilMult : 1.0) *
      (grip ? grip.recoilMult : 1.0) *
      (ammo && ammo.recoilMult ? ammo.recoilMult : 1.0) *
      classRecoilMult;
    const muzzleSpreadMult = muzzle && muzzle.spreadMult ? muzzle.spreadMult : 1.0;
    const gripSpreadMult = grip ? grip.spreadMult : 1.0;
    const spreadMult =
      gripSpreadMult *
      (ammo && ammo.spreadMult ? ammo.spreadMult : 1.0) *
      muzzleSpreadMult;
    const rpmMult = grip ? grip.rpmMult : 1.0;

    // Tarkov AP-20 Precision Solid Slug conversion for multi-pellet 12G shotguns!
    const isShotgunSlug = Boolean(
      ammo && ammo.isSlugAmmo && baseDef.pellets && baseDef.pellets > 1
    );

    // Explicit 'factory' selects bare iron sights even on factory-scoped sniper rifles (SV-98 / AWM)
    const explicitBareIron = Boolean(optic && optic.id === 'factory');
    const useCustomOptic = Boolean(optic && optic.id !== 'factory' && optic.opticType);
    const finalOpticType = explicitBareIron ? null : useCustomOptic ? optic.opticType : baseDef.opticType;
    const finalAdsFov = explicitBareIron
      ? 56
      : useCustomOptic && optic.adsFov
      ? optic.adsFov
      : baseDef.adsFov || 56;
    const finalHasCanted = explicitBareIron
      ? false
      : Boolean(baseDef.hasCantedSight || (useCustomOptic && optic.grantCanted));
    const finalIsScoped = Boolean(
      finalOpticType === 'sniper8x' ||
        finalOpticType === 'sniper12x' ||
        finalOpticType === 'sniperFlir' ||
        finalOpticType === 'lpvo36' ||
        finalOpticType === 'flir'
    );

    const tags = [];
    const activeSkinFinish = this.equippedWeaponSkins
      ? this.equippedWeaponSkins[targetWepId]
      : null;
    if (activeSkinFinish === 'pure_gold') tags.push('★ 24K GOLD');
    else if (activeSkinFinish === 'pure_blue') tags.push('★ PURE BLUE');
    if (muzzle && muzzle.id !== 'stock') tags.push(muzzle.shortName);
    if (mag && mag.id !== 'std_mag') tags.push(mag.shortName);
    if (useCustomOptic) tags.push(optic.shortName);
    if (grip && grip.id !== 'std_grip') tags.push(grip.shortName);
    if (ammo && ammo.id !== 'fmj') tags.push(ammo.shortName);

    const isIntegralSuppressed = Boolean(baseDef.silenced);
    const finalFlashMult = isIntegralSuppressed
      ? 0
      : muzzle && muzzle.flashMult !== undefined
      ? muzzle.flashMult
      : 1.0;

    return {
      ...baseDef,
      name:
        activeSkinFinish === 'pure_gold'
          ? `★ ${baseDef.name} // 24K GOLD`
          : activeSkinFinish === 'pure_blue'
          ? `★ ${baseDef.name} // PURE BLUE`
          : baseDef.name,
      skinFinish: activeSkinFinish || baseDef.skinFinish || null,
      bodyColor:
        activeSkinFinish === 'pure_gold'
          ? 0xffd32a
          : activeSkinFinish === 'pure_blue'
          ? 0x0652dd
          : baseDef.bodyColor,
      accentColor:
        activeSkinFinish === 'pure_gold'
          ? 0xd4af37
          : activeSkinFinish === 'pure_blue'
          ? 0x00d2d3
          : baseDef.accentColor,
      pellets: isShotgunSlug ? 1 : baseDef.pellets,
      damage: isShotgunSlug
        ? Math.round(baseDef.damage * 4.8 * dmgMult)
        : Math.max(1, Math.round(baseDef.damage * dmgMult)),
      headshotMult: isShotgunSlug ? 2.1 : baseDef.headshotMult,
      damageFalloffStart: isShotgunSlug ? 35 : baseDef.damageFalloffStart,
      damageFalloffEnd: isShotgunSlug ? 110 : baseDef.damageFalloffEnd,
      maxEffectiveRange: isShotgunSlug ? 160 : baseDef.maxEffectiveRange,
      muzzleVelocity: isShotgunSlug ? 510 : finalMuzzleVel,
      bulletGravity: baseDef.bulletGravity ?? 9.81,
      voxelDamage: Math.max(1, Math.round((baseDef.voxelDamage || 20) * voxelMult)),
      armorPenMult: Number(armorPenMult.toFixed(2)),
      clipSize: newClip,
      reserveAmmo: newReserve,
      spareMagSlots: totalSpareMags,
      maxLooseAmmo,
      vestSwapMult,
      reloadTime: Number((baseDef.reloadTime * (mag ? mag.reloadMult : 1.0) * vestSwapMult * classReloadMult).toFixed(2)),
      recoilPitch: Number((baseDef.recoilPitch * recoilMult).toFixed(4)),
      recoilYaw: Number((baseDef.recoilYaw * recoilMult).toFixed(4)),
      spreadHip: isShotgunSlug
        ? Number((0.028 * gripSpreadMult * muzzleSpreadMult).toFixed(4))
        : Number((baseDef.spreadHip * spreadMult).toFixed(4)),
      spreadAds: isShotgunSlug
        ? Number((0.0004 * gripSpreadMult * muzzleSpreadMult).toFixed(4))
        : Number(((baseDef.spreadAds || 0.0001) * spreadMult).toFixed(4)),
      rpm: Math.round(baseDef.rpm * rpmMult),
      opticId: explicitBareIron ? 'factory' : useCustomOptic ? optic.id : baseDef.opticType || 'factory',
      opticName: explicitBareIron ? 'IRON SIGHTS' : useCustomOptic ? optic.name : baseDef.opticType ? baseDef.opticType.toUpperCase() : 'IRON SIGHTS',
      opticType: finalOpticType,
      adsFov: finalAdsFov,
      zoomLevels: explicitBareIron
        ? null
        : useCustomOptic && Array.isArray(optic.zoomLevels)
        ? optic.zoomLevels
        : Array.isArray(baseDef.zoomLevels)
        ? baseDef.zoomLevels
        : null,
      zoomFovs: explicitBareIron
        ? null
        : useCustomOptic && Array.isArray(optic.zoomFovs)
        ? optic.zoomFovs
        : Array.isArray(baseDef.zoomFovs)
        ? baseDef.zoomFovs
        : null,
      isThermal: Boolean(!explicitBareIron && ((useCustomOptic && optic.isThermal) || baseDef.isThermal)),
      isSlugAmmo: Boolean(ammo && ammo.isSlugAmmo),
      isIncendiaryAmmo: Boolean(ammo && ammo.isIncendiaryAmmo),
      hasCantedSight: finalHasCanted,
      isScoped: finalIsScoped,
      flashMult: finalFlashMult,
      silenced: isIntegralSuppressed || Boolean(muzzle && muzzle.silenced),
      hideTracers: Boolean(baseDef.hideTracers || (muzzle && muzzle.hideTracers)),
      customTags: tags,
      caliber:
        tags.length > 0
          ? `${baseDef.caliber.split('•')[0].trim()} • ${tags.join(' + ')}`
          : baseDef.caliber
    };
  },

  applyCustomizationsToActiveLoadout(refillAmmoAndArmor = false) {
    this.ensureWarehouseStructures();
    this.syncActiveEquippedUpgrades();
    const era = this.world?.era || 'modern';
    this.role = resolveRoleForEra(this.role, era, this.team);

    const vestDef = this.getEquippedItem('vest');
    const backpackDef = this.getEquippedItem('backpack');
    const tacGearDef = this.getEquippedItem('tacticalGear');
    const classTrait = CLASS_TRAITS[this.role] || {};
    const baseVestArmor = vestDef ? vestDef.maxArmor : PLAYER.MAX_ARMOR;
    const vestDelta = baseVestArmor - PLAYER.MAX_ARMOR;
    const tacBonusArmor = tacGearDef && tacGearDef.bonusArmor ? tacGearDef.bonusArmor : 0;
    const tacMoveMult = tacGearDef && tacGearDef.moveMult ? tacGearDef.moveMult : 1.0;

    this.maxArmor = Math.max(15, (classTrait.maxArmor ?? PLAYER.MAX_ARMOR) + vestDelta + tacBonusArmor);
    this.armorAbsorbRatio = classTrait.armorAbsorbRatio ?? (vestDef ? vestDef.absorbRatio : PLAYER.ARMOR_ABSORB_RATIO);
    this.classMoveSpeedMult = Number(((classTrait.moveSpeedMult || 1.0) * tacMoveMult).toFixed(3));
    this.passiveRegenBonus = tacGearDef && tacGearDef.passiveRegen ? tacGearDef.passiveRegen : 0;
    this.headshotTakenMult =
      tacGearDef && typeof tacGearDef.headshotTakenMult === 'number'
        ? tacGearDef.headshotTakenMult
        : 1.0;
    this.hasThermalGoggles = Boolean(tacGearDef && tacGearDef.hasThermalGoggles);
    this.equippedTacticalGear = tacGearDef || null;
    this.canFlyAircraft = Boolean(classTrait.canFlyAircraft);
    const baseDressings =
      this.role === 'medic' ? PLAYER.FIELD_DRESSINGS_MEDIC || 9 : PLAYER.FIELD_DRESSINGS_OTHER || 2;
    this.maxBandages =
      baseDressings +
      (vestDef ? vestDef.bonusBandages : 0) +
      (backpackDef ? backpackDef.bonusBandages : 0);
    this.maxMedicBagSupply = this.role === 'medic' ? PLAYER.MEDIC_BAG_MAX_SUPPLY || 600 : 0;
    if (this.medicBagSupply === undefined || refillAmmoAndArmor) {
      this.medicBagSupply = this.maxMedicBagSupply;
    }
    const maxGrenadesForClass = Math.max(
      1,
      2 +
        (classTrait.bonusGrenades || 0) +
        (vestDef ? vestDef.bonusGrenades : 0) +
        (backpackDef ? backpackDef.bonusGrenades : 0)
    );
    this.maxGrenades = maxGrenadesForClass;
    if (refillAmmoAndArmor) {
      this.armor = this.maxArmor;
      this.bandages = this.maxBandages;
      this.grenades = maxGrenadesForClass;
    }

    const baseLoadout = CLASS_LOADOUTS[this.role] || CLASS_LOADOUTS.engineer;
    const isPrimitiveEra = era === 'medieval' || era === 'jurassic';
    const rawSel = this.classLoadoutSelections[this.role] || {};
    const sel = isPrimitiveEra
      ? {
          primary:
            rawSel.primary && WEAPON_DEFS[rawSel.primary]?.isPrimitiveOnly ? rawSel.primary : null,
          secondary:
            rawSel.secondary && WEAPON_DEFS[rawSel.secondary]?.isPrimitiveOnly
              ? rawSel.secondary
              : null
        }
      : rawSel;
    const primaryId = sel.primary && WEAPON_DEFS[sel.primary] ? sel.primary : baseLoadout[0];
    const secondaryId =
      sel.secondary && WEAPON_DEFS[sel.secondary] ? sel.secondary : baseLoadout[1];
    const gadgetId =
      !isPrimitiveEra &&
      this.role === 'engineer' &&
      (this.preferredEngineerLauncher === 'stinger' || sel.gadget === 'stinger')
        ? 'stinger'
        : baseLoadout[2];
    const weaponIds = [primaryId, secondaryId, gadgetId, ...baseLoadout.slice(3)];

    const prevSlotIdx = this.currentSlotIndex || 0;
    this.slots = weaponIds.map((id, idx) => {
      const baseDef = WEAPON_DEFS[id];
      const isPrimary = idx === 0;
      const def = this.buildCustomizedWeaponDef(baseDef, isPrimary, id);
      if (def && !def.id) {
        def.id = id;
      }
      const wepAtts = baseDef && baseDef.type === 'gun' ? this.getWeaponAttachmentMap(id) : this.equippedUpgrades;
      return {
        weaponId: id,
        def,
        clip: def.clipSize,
        reserve: def.reserveAmmo,
        looseAmmo: def.maxLooseAmmo || 0,
        maxLooseAmmo: def.maxLooseAmmo || 0,
        mags: this.buildMagArray(def.clipSize, def.reserveAmmo),
        mesh: createWeaponViewModel(def, this.team, wepAtts)
      };
    });
    this.switchSlot(Math.min(prevSlotIdx, this.slots.length - 1));
  }
};
