// ============================================================================
// GUNSMITH ATTACHMENT & ARMORY DEFINITIONS (src/assets/attachment-defs.js)
// Edit this file to patch muzzle devices, magazines, optics, foregrips,
// ammunition types, and body armor vests.
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
      id: 'silencer',
      name: 'SOCOM TACTICAL SILENCER',
      shortName: 'SILENCER',
      price: 2600,
      flashMult: 0.0,
      recoilMult: 0.8,
      silenced: true,
      hideTracers: true,
      desc: '100% Zero Muzzle Flash, suppressed subsonic audio, hides tracers & -20% recoil!'
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
      id: 'ext_mag',
      name: 'EXTENDED TACTICAL MAG',
      shortName: 'EXT MAG (+50%)',
      price: 1350,
      capMult: 1.5,
      reloadMult: 1.05,
      desc: '+50% Magazine & Reserve Ammo capacity (45 rnds Rifle / 60 SMG / 15 Sniper).'
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
      name: 'BARE IRON SIGHTS (AIM DOWN BARREL)',
      shortName: 'IRON SIGHTS',
      price: 0,
      opticType: null,
      adsFov: 56,
      grantCanted: false,
      desc: 'No optic mounted — unobstructed aim straight down the receiver rail and front barrel post.'
    },
    {
      id: 'reddot',
      name: 'AIMPOINT MICRO T-2 (1.0X)',
      shortName: 'RED DOT 1X',
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
      desc: 'Russian open-top 1.0x tactical chevron reflex sight.'
    },
    {
      id: 'holo',
      name: 'EOTECH EXPS3 HOLO (1.0X)',
      shortName: 'EOTECH HOLO',
      price: 1150,
      opticType: 'holo',
      adsFov: 44,
      grantCanted: true,
      desc: '1.0x holographic ring-and-dot reticle + unlocks [V] Canted Sight.'
    },
    {
      id: 'acog',
      name: 'TRIJICON ACOG (3.4X + CANTED)',
      shortName: 'ACOG 3.4X',
      price: 1750,
      opticType: 'acog',
      adsFov: 28,
      grantCanted: true,
      desc: '3.4x medium-range ballistic chevron scope + [V] 45° Canted Red Dot!'
    },
    {
      id: 'sniper8x',
      name: 'RAZOR HD (8.0X SCOPE + CANTED)',
      shortName: '8.0X SCOPE',
      price: 2800,
      opticType: 'sniper8x',
      adsFov: 15,
      grantCanted: true,
      desc: 'High-power 8.0x mil-dot marksman optic + [V] 45° Canted Red Dot!'
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
      id: 'match_laser',
      name: 'PEQ-15 LASER + MATCH TRIGGER',
      shortName: 'MATCH + LASER',
      price: 2200,
      recoilMult: 0.72,
      spreadMult: 0.62,
      rpmMult: 1.08,
      desc: '-28% Recoil, -38% Hipfire Spread & +8% Cyclic Rate of Fire!'
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
      desc: '+35% Armor & Vehicle Penetration, +8% Muzzle Velocity, +25% Structural Damage, +6% Base Damage'
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
      desc: '+15% Stopping Power & +15% High-Velocity Muzzle Speed, +6% Recoil kick'
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
      desc: '305 m/s Subsonic velocity (quiet, no crack), -15% Recoil & -20% Bullet Spread for laser accuracy'
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
  ]
};
