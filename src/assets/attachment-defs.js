// ============================================================================
// GUNSMITH ATTACHMENT & ARMORY DEFINITIONS (src/assets/attachment-defs.js)
// Edit this file to patch muzzle devices, magazines, optics, foregrips,
// ammunition types, body armor vests, backpacks, and tactical headgear/NVG/stims.
// ============================================================================

export const ATTACHMENT_CATALOG = {
  muzzle: [
    {
      id: 'stock',
      name: 'STOCK BARREL',
      shortName: 'STOCK',
      price: 0,
      flashMult: 1.0,
      recoilMult: 1.0,
      silenced: false,
      hideTracers: false,
      desc: 'Factory barrel with reduced low-profile ADS flash.'
    },
    {
      id: 'flash_hider',
      name: '3-PRONG FLASH HIDER',
      shortName: 'FLASH HIDER',
      price: 800,
      flashMult: 0.18,
      recoilMult: 0.85,
      silenced: false,
      hideTracers: false,
      desc: 'Eliminates 82% of muzzle flash in ADS & hipfire; -15% vertical recoil.'
    },
    {
      id: 'warden_blast',
      name: 'SUREFIRE WARDEN BLAST REGULATOR',
      shortName: 'WARDEN BLAST',
      price: 1100,
      flashMult: 0.35,
      recoilMult: 0.80,
      velocityMult: 1.04,
      spreadMult: 0.92,
      silenced: false,
      hideTracers: false,
      desc: 'Direct-thread blast diffuser: -65% muzzle flash, -20% recoil, +4% velocity & tighter grouping.'
    },
    {
      id: 'compensator',
      name: 'TACTICAL MUZZLE COMPENSATOR',
      shortName: 'COMPENSATOR',
      price: 1250,
      flashMult: 0.55,
      recoilMult: 0.72,
      silenced: false,
      hideTracers: false,
      desc: 'Vented muzzle brake cuts vertical & horizontal recoil by 28% and flash by 45%.'
    },
    {
      id: 'lantac_dragon',
      name: 'LANTAC DRAGON MUZZLE BRAKE',
      shortName: 'LANTAC DRAGON',
      price: 1550,
      flashMult: 0.7,
      recoilMult: 0.65,
      silenced: false,
      hideTracers: false,
      desc: 'Competition dual-chamber brake: -35% vertical/horizontal recoil for flat full-auto beams.'
    },
    {
      id: 'silencer',
      name: 'SOCOM TACTICAL SILENCER',
      shortName: 'SILENCER',
      price: 2600,
      flashMult: 0.0,
      recoilMult: 0.8,
      silenced: true,
      hideTracers: true,
      desc: '100% Zero Muzzle Flash, suppressed subsonic audio, hides tracers & -20% recoil!'
    },
    {
      id: 'qdc_suppressor',
      name: 'KAC QDC / SANDMAN-S HEAVY SUPPRESSOR',
      shortName: 'QDC SUPPRESSOR',
      price: 3100,
      flashMult: 0.0,
      recoilMult: 0.72,
      silenced: true,
      hideTracers: true,
      desc: 'Tier-1 QD heavy suppressor: 100% Zero Flash, hides tracers, suppressed audio & -28% recoil!'
    }
  ],
  magazine: [
    {
      id: 'std_mag',
      name: 'STANDARD ISSUE MAG',
      shortName: 'STD MAG',
      price: 0,
      capMult: 1.0,
      reloadMult: 1.0,
      desc: 'Factory capacity magazine (30 rnds Rifle / 40 SMG / 10 Sniper / 100 LMG).'
    },
    {
      id: 'fast_mag',
      name: 'MAGPUL FAST-PULL MAG',
      shortName: 'FAST MAG',
      price: 700,
      capMult: 1.0,
      reloadMult: 0.72,
      desc: 'High-speed ranger floorplate cuts reload duration by 28% with standard capacity.'
    },
    {
      id: 'jungle_taped',
      name: 'TAPED JUNGLE DUAL-MAG',
      shortName: 'JUNGLE TAPED',
      price: 1150,
      capMult: 1.0,
      reloadMult: 0.62,
      desc: '-38% ultra-fast flip reload with twin combat-taped magazines!'
    },
    {
      id: 'ext_mag',
      name: 'EXTENDED TACTICAL MAG',
      shortName: 'EXT MAG (+50%)',
      price: 1350,
      capMult: 1.5,
      reloadMult: 1.05,
      desc: '+50% Magazine & Reserve Ammo capacity (45 rnds Rifle / 60 SMG / 15 Sniper).'
    },
    {
      id: 'quad_60',
      name: 'PMAG D-60 / 6L31 QUAD-STACK',
      shortName: 'QUAD-60 (+75%)',
      price: 2200,
      capMult: 1.75,
      reloadMult: 1.06,
      desc: '+75% Magazine & Reserve Ammo capacity with fast quad-stack handling.'
    },
    {
      id: 'drum_mag',
      name: '60R CASKET / DRUM MAG',
      shortName: 'DRUM MAG (2X)',
      price: 3100,
      capMult: 2.0,
      reloadMult: 1.14,
      desc: 'Doubles (2x) Magazine & Reserve Ammo capacity for sustained firefights!'
    }
  ],
  optic: [
    {
      id: 'factory',
      name: 'BARE IRON SIGHTS (1.0X)',
      shortName: 'IRON SIGHTS',
      price: 0,
      opticType: null,
      adsFov: 56,
      grantCanted: false,
      desc: 'No optic mounted — unobstructed aim straight down the receiver rail and front barrel post.'
    },
    {
      id: 'rmr_mini',
      name: 'TRIJICON RMR MICRO REFLEX (1.0X)',
      shortName: 'RMR 1.0X',
      price: 550,
      opticType: 'rmr',
      adsFov: 50,
      grantCanted: false,
      desc: 'Ultra-low-profile pistol & carbine amber/red 3.25 MOA reflex dot with zero peripheral obstruction.'
    },
    {
      id: 'reddot',
      name: 'AIMPOINT MICRO T-2 (1.0X)',
      shortName: 'MICRO T-2 1X',
      price: 650,
      opticType: 'reddot',
      adsFov: 48,
      grantCanted: false,
      desc: 'Clean 1.0x precision red dot with wide peripheral sight picture.'
    },
    {
      id: 'kobra',
      name: 'KOBRA EKP-8-18 REFLEX (1.0X)',
      shortName: 'KOBRA 1X',
      price: 750,
      opticType: 'kobra',
      adsFov: 46,
      grantCanted: false,
      desc: 'Russian open-top 1.0x tactical chevron-and-bars reflex sight.'
    },
    {
      id: 'okp7',
      name: 'OKP-7 RIMLESS GREEN REFLEX (1.0X)',
      shortName: 'OKP-7 GREEN',
      price: 900,
      opticType: 'okp7',
      adsFov: 47,
      grantCanted: false,
      desc: 'Iconic Escape from Tarkov rimless green chevron-circle sight with crystal-clear field of view!'
    },
    {
      id: 'holo',
      name: 'EOTECH EXPS3-0 HOLO (1.0X)',
      shortName: 'EXPS3 HOLO',
      price: 1150,
      opticType: 'holo',
      adsFov: 44,
      grantCanted: true,
      desc: '1.0x 68-MOA holographic ring-and-dot reticle + unlocks [V] 45° Canted Sight.'
    },
    {
      id: 'vortex_uh1',
      name: 'VORTEX AMG UH-1 GEN II HOLO (1.0X)',
      shortName: 'UH-1 HOLO',
      price: 1250,
      opticType: 'uh1',
      adsFov: 44,
      grantCanted: true,
      desc: 'Boxy tactical holographic EBR-CQB reticle with CQB triangle reference + [V] 45° Canted Sight.'
    },
    {
      id: 'prism_2x',
      name: 'PRIMARY ARMS GLX PRISM (2.0X)',
      shortName: 'PRISM 2.0X',
      price: 1400,
      opticType: 'prism2x',
      adsFov: 35,
      grantCanted: true,
      desc: 'Crisp 2.0x etched ACSS horseshoe-chevron mid-close combat optic + [V] 45° Canted Red Dot!'
    },
    {
      id: 'holo_g33',
      name: 'EOTECH HHS-I HYBRID (1.0X ⇄ 3.0X FLIP)',
      shortName: 'HOLO 1X/3X',
      price: 1950,
      opticType: 'holo3x',
      adsFov: 44,
      zoomLevels: [1.0, 3.0],
      zoomFovs: [44, 28],
      grantCanted: false,
      desc: 'EXPS3 Holo + G33 3x Flip-to-Side Magnifier — Scroll Wheel or [V] in ADS flips between 1.0x & 3.0x!'
    },
    {
      id: 'acog',
      name: 'TRIJICON ACOG TA31 (3.4X + CANTED)',
      shortName: 'ACOG 3.4X',
      price: 1750,
      opticType: 'acog',
      adsFov: 26,
      grantCanted: true,
      desc: '3.4x fiber-optic ballistic chevron scope + [V] 45° Canted Red Dot!'
    },
    {
      id: 'elcan_dr',
      name: 'ELCAN SPECTER-DR (1.0X ⇄ 4.0X LEVER)',
      shortName: 'ELCAN 1X/4X',
      price: 2250,
      opticType: 'elcan4x',
      adsFov: 22,
      zoomLevels: [1.0, 4.0],
      zoomFovs: [46, 22],
      grantCanted: true,
      desc: 'Tarkov & CoD legend: Scroll Wheel in ADS throws lever instantly between 1x CQB & 4x ballistic cross (+ [V] Canted)!'
    },
    {
      id: 'valday_1_6x',
      name: 'VALDAY PS-320 LPVO (1.0X ⇄ 6.0X)',
      shortName: 'VALDAY 1-6X',
      price: 2500,
      opticType: 'valday6x',
      adsFov: 45,
      zoomLevels: [1.0, 6.0],
      zoomFovs: [45, 16.5],
      grantCanted: true,
      desc: '1.0x–6.0x Low Power Variable Optic: Scroll Wheel toggles true 1x CQB dot to 6x precision BDC (+ [V] Canted)!'
    },
    {
      id: 'vudu_3_6x',
      name: 'EOTECH VUDU DUAL-ZOOM (3.0X ⇄ 6.0X + CANTED)',
      shortName: 'VUDU 3X/6X',
      price: 2700,
      opticType: 'lpvo36',
      adsFov: 28,
      zoomLevels: [3.0, 6.0],
      zoomFovs: [28, 16.0],
      grantCanted: true,
      desc: '3.0x & 6.0x first-focal-plane speed-ring variable scope (Scroll Wheel) + [V] 45° Canted Red Dot!'
    },
    {
      id: 'flir_thermal',
      name: 'TRIJICON REAP-IR / FLIR THERMAL (2.5X ⇄ 5.0X IR)',
      shortName: 'FLIR IR 2.5-5X',
      price: 3800,
      opticType: 'flir',
      adsFov: 31,
      zoomLevels: [2.5, 5.0],
      zoomFovs: [31, 18.5],
      isThermal: true,
      grantCanted: true,
      desc: 'Infrared Thermal Imaging (2.5x ⇄ 5.0x) — highlights live enemies & vehicles in glowing white-hot/amber contrast (+ [V] Canted)!'
    },
    {
      id: 'sniper8x',
      name: 'VORTEX RAZOR HD (8.0X MIL-DOT + CANTED)',
      shortName: 'RAZOR 8.0X',
      price: 2800,
      opticType: 'sniper8x',
      adsFov: 14.5,
      grantCanted: true,
      desc: 'High-power 8.0x mil-dot marksman optic + [V] 45° Canted Red Dot!'
    },
    {
      id: 'nightforce_12x',
      name: 'NIGHTFORCE ATACR (6.0X ⇄ 12.0X BALLISTIC)',
      shortName: 'ATACR 6-12X',
      price: 3400,
      opticType: 'sniper12x',
      adsFov: 16.5,
      zoomLevels: [6.0, 12.0],
      zoomFovs: [16.5, 9.5],
      grantCanted: true,
      desc: 'Extreme long-range 6.0x ⇄ 12.0x Horus Tremor3 ballistic sniper optic (Scroll Wheel) + [V] 45° Canted Red Dot!'
    }
  ],
  grip: [
    {
      id: 'std_grip',
      name: 'FACTORY HANDGUARD',
      shortName: 'STD GRIP',
      price: 0,
      recoilMult: 1.0,
      spreadMult: 1.0,
      rpmMult: 1.0,
      desc: 'Standard issue handguard & trigger assembly.'
    },
    {
      id: 'angled_grip',
      name: 'ANGLED FOREGRIP',
      shortName: 'ANGLED GRIP',
      price: 850,
      recoilMult: 0.78,
      spreadMult: 0.85,
      rpmMult: 1.0,
      desc: '-22% Vertical/Horizontal Recoil & tighter aim stability.'
    },
    {
      id: 'vert_foregrip',
      name: 'MAGPUL RVG VERTICAL FOREGRIP',
      shortName: 'RVG VERTICAL',
      price: 950,
      recoilMult: 0.75,
      spreadMult: 0.90,
      rpmMult: 1.0,
      desc: '-25% Vertical Recoil & -10% Spread for controlled full-auto bursts.'
    },
    {
      id: 'bipod_grip',
      name: 'HARRIS SWIVEL BIPOD + FOREGRIP',
      shortName: 'BIPOD + GRIP',
      price: 1400,
      recoilMult: 0.64,
      spreadMult: 0.78,
      rpmMult: 1.0,
      desc: '-36% sustained recoil & -22% bullet spread for DMR/LMG fire support.'
    },
    {
      id: 'rk1_b25u',
      name: 'ZENITCO RK-1 ON B-25U 45° CANT MOUNT',
      shortName: 'RK-1 B-25U 45°',
      price: 1650,
      recoilMult: 0.68,
      spreadMult: 0.82,
      rpmMult: 1.0,
      desc: 'Tarkov meta 45° canted Zenitco foregrip: -32% recoil & -18% spread!'
    },
    {
      id: 'match_laser',
      name: 'PEQ-15 LASER + MATCH TRIGGER',
      shortName: 'MATCH + LASER',
      price: 2200,
      recoilMult: 0.72,
      spreadMult: 0.62,
      rpmMult: 1.08,
      desc: '-28% Recoil, -38% Hipfire Spread & +8% Cyclic Rate of Fire!'
    },
    {
      id: 'mawl_c1',
      name: 'BE MEYERS MAWL-C1+ GREEN/IR LASER + GEISSELE TRIGGER',
      shortName: 'MAWL-C1+ LASER',
      price: 2900,
      recoilMult: 0.68,
      spreadMult: 0.52,
      rpmMult: 1.11,
      desc: '-48% hipfire spread, -32% recoil & +11% RPM with Geissele 3-Gun trigger!'
    }
  ],
  ammoType: [
    {
      id: 'fmj',
      name: 'STANDARD ISSUE FMJ',
      shortName: 'STD FMJ',
      price: 0,
      dmgMult: 1.0,
      armorPenMult: 1.0,
      recoilMult: 1.0,
      spreadMult: 1.0,
      voxelMult: 1.0,
      velocityMult: 1.0,
      desc: 'Standard M855/7N6 full metal jacket ball ammunition (factory muzzle velocity).'
    },
    {
      id: 'subsonic_match',
      name: 'MATCH-GRADE SUBSONIC LOAD (305 M/S)',
      shortName: 'MATCH SUBSONIC',
      price: 950,
      dmgMult: 1.0,
      armorPenMult: 1.0,
      recoilMult: 0.85,
      spreadMult: 0.8,
      voxelMult: 1.0,
      velocityMult: 0.65,
      subsonicCap: 305,
      desc: '305 m/s Subsonic velocity (quiet, no crack), -15% Recoil & -20% Bullet Spread for laser accuracy.'
    },
    {
      id: 'ap_rounds',
      name: 'M995 TUNGSTEN ARMOR-PIERCING',
      shortName: 'AP TUNGSTEN',
      price: 1600,
      dmgMult: 1.06,
      armorPenMult: 1.35,
      recoilMult: 1.0,
      spreadMult: 1.0,
      voxelMult: 1.25,
      velocityMult: 1.08,
      desc: '+35% Armor & Vehicle Penetration, +8% Muzzle Velocity, +25% Structural Damage, +6% Base Damage.'
    },
    {
      id: 'rip_flesh',
      name: 'TARKOV RIP / HOLLOW-POINT FLESH ROUNDS',
      shortName: 'RIP FLESH',
      price: 1700,
      dmgMult: 1.24,
      armorPenMult: 0.78,
      recoilMult: 1.04,
      spreadMult: 0.95,
      voxelMult: 0.9,
      velocityMult: 0.96,
      desc: '+24% raw flesh/limb stopping power & fragmenting CQB trauma (-22% armor pen).'
    },
    {
      id: 'overpressure',
      name: '+P HOLLOW-POINT OVERPRESSURE',
      shortName: '+P OVERPRESSURE',
      price: 1850,
      dmgMult: 1.15,
      armorPenMult: 1.0,
      recoilMult: 1.06,
      spreadMult: 1.0,
      voxelMult: 1.0,
      velocityMult: 1.15,
      desc: '+15% Stopping Power & +15% High-Velocity Muzzle Speed, +6% Recoil kick.'
    },
    {
      id: 'ap20_slug',
      name: '12G AP-20 ARMOR-PIERCING SOLID SLUG / SNIPER SABOT',
      shortName: 'AP-20 SLUG',
      price: 2100,
      dmgMult: 1.10,
      armorPenMult: 1.55,
      recoilMult: 1.08,
      spreadMult: 0.35,
      voxelMult: 1.4,
      velocityMult: 1.22,
      isSlugAmmo: true,
      desc: 'Converts 12G Shotguns to 1-Shot Precision Slugs (<110m) & +55% AP on rifles!'
    },
    {
      id: 'm855a1_bp',
      name: 'M855A1 / 7N23 ENHANCED PENETRATOR',
      shortName: 'M855A1 / 7N23',
      price: 2400,
      dmgMult: 1.12,
      armorPenMult: 1.48,
      recoilMult: 1.05,
      spreadMult: 0.95,
      voxelMult: 1.35,
      velocityMult: 1.12,
      isIncendiaryAmmo: true,
      desc: '+48% armor pen, +12% damage & velocity + hardened steel penetrator core!'
    }
  ],
  vest: [
    {
      id: 'std_vest',
      name: 'BANK ROBBER / LIGHT KEVLAR RIG (50 ARMOR • 4 MAG POUCHES)',
      shortName: 'LIGHT RIG (50/4M)',
      price: 0,
      maxArmor: 50,
      absorbRatio: 0.35,
      magSlots: 4,
      bonusMags: 0,
      magSwapMult: 1.0,
      bonusBandages: 0,
      bonusGrenades: 0,
      gridLabel: '3×2 RIG',
      desc: '50 Armor HP (35% absorb) • Holds 4 Loaded Magazines in Chest Rig for [R] Fast Mag-Swap Reloads.'
    },
    {
      id: 'triton_rig',
      name: 'TRITON M43-A TACTICAL CHEST RIG (75 ARMOR • 6 MAG POUCHES)',
      shortName: 'TRITON RIG (75/6M)',
      price: 900,
      maxArmor: 75,
      absorbRatio: 0.4,
      magSlots: 6,
      bonusMags: 2,
      magSwapMult: 0.9,
      bonusBandages: 1,
      bonusGrenades: 1,
      gridLabel: '3×3 RIG',
      desc: '75 Armor HP (40% absorb) • 6 Rig Mag Pouches (+2 Mags), -10% Fast Mag-Swap Reload time, +1 Bandage, +1 Frag.'
    },
    {
      id: 'plate_vest',
      name: 'TV-110 ARMORED PLATE CARRIER RIG (110 ARMOR • 8 MAG POUCHES)',
      shortName: 'TV-110 RIG (110/8M)',
      price: 1650,
      maxArmor: 110,
      absorbRatio: 0.46,
      magSlots: 8,
      bonusMags: 4,
      magSwapMult: 0.85,
      bonusBandages: 2,
      bonusGrenades: 1,
      gridLabel: '3×3 RIG',
      desc: '110 Ceramic Armor (46% absorb) • 8 Rig Mag Pouches (+4 Mags), -15% Fast Mag-Swap Reload time, +2 Bandages, +1 Frag!'
    },
    {
      id: 'heavy_vest',
      name: 'ARS ARMA CPC MOD.2 HEAVY RIG (150 ARMOR • 10 MAG POUCHES)',
      shortName: 'CPC HEAVY RIG (150/10M)',
      price: 3400,
      maxArmor: 150,
      absorbRatio: 0.55,
      magSlots: 10,
      bonusMags: 6,
      magSwapMult: 0.8,
      bonusBandages: 3,
      bonusGrenades: 2,
      gridLabel: '4×3 RIG',
      desc: '150 Heavy Plate Rig (55% absorb) • 10 Rig Mag Pouches (+6 Mags), -20% Fast Mag-Swap Reload time, +3 Bandages, +2 Frags!'
    }
  ],
  backpack: [
    {
      id: 'no_pack',
      name: 'UNIFORM POCKETS ONLY (NO BACKPACK • 4 CELLS)',
      shortName: 'NO PACK (POCKETS)',
      price: 0,
      cells: 4,
      gridLabel: '2×2 (4 CELLS)',
      looseAmmoPrimary: 60,
      looseAmmoSecondary: 36,
      bonusMags: 0,
      bonusBandages: 0,
      bonusGrenades: 0,
      bonusGadgets: 0,
      desc: 'Standard pockets only: carries +60 Loose Primary Bullets & +36 Loose Pistol Bullets for [P / Hold R] slow mag-packing.'
    },
    {
      id: 'sling_pack',
      name: 'TACTICAL DAYPACK SLING (SMALL • 3×3 / 9 CELLS)',
      shortName: 'SLING PACK (S • 9C)',
      price: 650,
      cells: 9,
      gridLabel: '3×3 (9 CELLS)',
      looseAmmoPrimary: 150,
      looseAmmoSecondary: 72,
      bonusMags: 1,
      bonusBandages: 1,
      bonusGrenades: 0,
      bonusGadgets: 1,
      desc: 'Small 9-cell sling bag: carries +150 Loose Rifle Bullets, +72 Loose Pistol Bullets, +1 Spare Mag, +1 Bandage & +1 Rocket/C4.'
    },
    {
      id: 'berkut_pack',
      name: 'BERKUT BB-102 ASSAULT PACK (MEDIUM • 4×4 / 16 CELLS)',
      shortName: 'BERKUT PACK (M • 16C)',
      price: 1350,
      cells: 16,
      gridLabel: '4×4 (16 CELLS)',
      looseAmmoPrimary: 270,
      looseAmmoSecondary: 120,
      bonusMags: 2,
      bonusBandages: 2,
      bonusGrenades: 1,
      bonusGadgets: 2,
      desc: 'Medium 16-cell Tarkov patrol pack: +270 Loose Rifle Bullets, +120 Pistol Bullets, +2 Spare Mags, +1 Frag & +2 Rockets/C4.'
    },
    {
      id: 'beta2_pack',
      name: 'ANA TACTICAL BETA 2 BATTLE PACK (LARGE • 5×5 / 25 CELLS)',
      shortName: 'BETA-2 PACK (L • 25C)',
      price: 2250,
      cells: 25,
      gridLabel: '5×5 (25 CELLS)',
      looseAmmoPrimary: 420,
      looseAmmoSecondary: 180,
      bonusMags: 3,
      bonusBandages: 3,
      bonusGrenades: 2,
      bonusGadgets: 3,
      desc: 'Large 25-cell battle pack: +420 Loose Rifle Bullets, +180 Pistol Bullets, +3 Spare Mags, +2 Frags & +3 Rockets/C4!'
    },
    {
      id: 'raid_pack',
      name: '6SH118 MOUNTAIN RAID BACKPACK (XL RAID • 6×6 / 36 CELLS)',
      shortName: '6SH118 RAID (XL • 36C)',
      price: 3300,
      cells: 36,
      gridLabel: '6×6 (36 CELLS)',
      looseAmmoPrimary: 660,
      looseAmmoSecondary: 260,
      bonusMags: 4,
      bonusBandages: 4,
      bonusGrenades: 3,
      bonusGadgets: 4,
      desc: 'Massive 36-cell Tarkov Raid Pack: +660 Loose Rifle Bullets, +260 Pistol Bullets, +4 Spare Mags, +3 Frags & +4 Rockets/C4!'
    }
  ],
  tacticalGear: [
    {
      id: 'std_helmet',
      name: '6B47 / ACH INFANTRY HELMET',
      shortName: 'ACH HELMET',
      price: 0,
      bonusArmor: 0,
      moveMult: 1.0,
      passiveRegen: 0,
      headshotTakenMult: 1.0,
      hasThermalGoggles: false,
      desc: 'Standard ballistic helmet.'
    },
    {
      id: 'fast_mt_comtac',
      name: 'OPS-CORE FAST MT + PELTOR COMTAC IV',
      shortName: 'FAST MT + COMTAC',
      price: 1200,
      bonusArmor: 18,
      moveMult: 1.04,
      passiveRegen: 0,
      headshotTakenMult: 0.9,
      hasThermalGoggles: false,
      desc: '+18 Armor HP & +4% Combat Mobility.'
    },
    {
      id: 'altyn_faceshield',
      name: 'ALTYN / RYS-T TITANIUM FACESHIELD HELMET',
      shortName: 'ALTYN SHIELD',
      price: 2600,
      bonusArmor: 45,
      moveMult: 0.95,
      passiveRegen: 0,
      headshotTakenMult: 0.6,
      hasThermalGoggles: false,
      desc: '+45 Heavy Armor & -40% Headshot Damage Taken (-5% speed).'
    },
    {
      id: 'propital_rig',
      name: 'TARKOV PROPITAL + ZAGUSTIN AUTO-STIM POUCH',
      shortName: 'PROPITAL STIM',
      price: 2900,
      bonusArmor: 12,
      moveMult: 1.02,
      passiveRegen: 2.5,
      headshotTakenMult: 0.95,
      hasThermalGoggles: false,
      desc: '+2.5 HP/s continuous passive combat regen + +12 Armor!'
    },
    {
      id: 'gpnvg18_nvg',
      name: 'L3HARRIS GPNVG-18 PANORAMIC NVG + IR MONOCLE',
      shortName: 'GPNVG-18 NVG [N]',
      price: 3500,
      bonusArmor: 20,
      moveMult: 1.03,
      passiveRegen: 1.0,
      headshotTakenMult: 0.88,
      hasThermalGoggles: true,
      desc: '+20 Armor, +1 HP/s regen & Press [N] anywhere for Panoramic Green Night/IR Vision!'
    }
  ]
};
