// ============================================================================
// AUDIO PACKAGE MANIFEST (src/audio/audio-pack.js)
// Unchoked CC0 Public-Domain Multi-Layer Tactical Audio Package:
// - Sources: buddingmonkey/FreeFirearmsSFXLibrary (CC0) & Deases/GunLib (CC0)
// - Full acoustic decay tails preserved (zero 0.15s truncation!)
// - Dedicated .50 BMG / 20mm Anti-Materiel, 12G Shotgun, .338/.408 Heavy Sniper,
//   Supersonic N-Wave Bullet Crack, Silenced Firearms, and Speed-of-Sound Thunder!
// ============================================================================

export const AUDIO_PACK = {
  // 1. INFANTRY WEAPONS & BALLISTICS (assets/audio/infantry/)
  infantry: {
    rifle: {
      url: './assets/audio/infantry/rifle_ar15.wav?v=143',
      altUrl: './assets/audio/infantry/rifle_ak47.wav?v=143',
      volume: 0.66,
      pitch: 1.0,
      pitchJitter: 0.035,
      maxDuration: 0.62,
      fadeOut: 0.14,
      reverbSend: 0.28,
      subPunchHz: 95,
      subPunchVol: 0.12,
      maxRange: 340
    },
    rifle_heavy: {
      url: './assets/audio/infantry/rifle_ak47.wav?v=143',
      altUrl: './assets/audio/heavy_762_shot.wav?v=143',
      volume: 0.72,
      pitch: 0.94,
      pitchJitter: 0.03,
      maxDuration: 0.72,
      fadeOut: 0.16,
      reverbSend: 0.34,
      subPunchHz: 88,
      subPunchVol: 0.18,
      maxRange: 390
    },
    smg: {
      url: './assets/audio/infantry/smg_9mm.wav?v=143',
      altUrl: './assets/audio/mp5_shot.ogg?v=143',
      volume: 0.58,
      pitch: 1.02,
      pitchJitter: 0.04,
      maxDuration: 0.50,
      fadeOut: 0.11,
      reverbSend: 0.22,
      subPunchHz: 112,
      subPunchVol: 0.08,
      maxRange: 250
    },
    shotgun: {
      url: './assets/audio/infantry/shotgun_12g.wav?v=143',
      altUrl: './assets/audio/remington_shot.ogg?v=143',
      volume: 0.84,
      pitch: 0.96,
      pitchJitter: 0.03,
      maxDuration: 0.86,
      fadeOut: 0.20,
      reverbSend: 0.44,
      subPunchHz: 78,
      subPunchVol: 0.32,
      maxRange: 320
    },
    lmg: {
      url: './assets/audio/infantry/lmg_762.wav?v=143',
      altUrl: './assets/audio/heavy_762_shot.wav?v=143',
      volume: 0.70,
      pitch: 0.95,
      pitchJitter: 0.03,
      maxDuration: 0.70,
      fadeOut: 0.15,
      reverbSend: 0.32,
      subPunchHz: 86,
      subPunchVol: 0.18,
      maxRange: 420
    },
    sniper: {
      url: './assets/audio/infantry/sniper_308.wav?v=143',
      altUrl: './assets/audio/sniper_308_shot.wav?v=143',
      volume: 0.84,
      pitch: 0.98,
      pitchJitter: 0.02,
      maxDuration: 1.08,
      fadeOut: 0.24,
      reverbSend: 0.48,
      subPunchHz: 76,
      subPunchVol: 0.26,
      maxRange: 680
    },
    sniper_heavy: {
      url: './assets/audio/awp_shot.ogg?v=143',
      altUrl: './assets/audio/infantry/sniper_308.wav?v=143',
      volume: 0.88,
      pitch: 0.92,
      pitchJitter: 0.02,
      maxDuration: 1.18,
      fadeOut: 0.26,
      reverbSend: 0.54,
      subPunchHz: 68,
      subPunchVol: 0.34,
      maxRange: 820
    },
    amr: {
      url: './assets/audio/infantry/amr_50bmg.wav?v=143',
      altUrl: './assets/audio/awp_shot.ogg?v=143',
      volume: 0.95,
      pitch: 0.94,
      pitchJitter: 0.02,
      maxDuration: 1.30,
      fadeOut: 0.30,
      reverbSend: 0.64,
      subPunchHz: 56,
      subPunchVol: 0.46,
      maxRange: 980
    },
    pistol: {
      url: './assets/audio/infantry/pistol_9mm.wav?v=143',
      altUrl: './assets/audio/infantry/pistol_45.wav?v=143',
      volume: 0.56,
      pitch: 1.02,
      pitchJitter: 0.03,
      maxDuration: 0.48,
      fadeOut: 0.11,
      reverbSend: 0.20,
      maxRange: 195
    },
    pistol_heavy: {
      url: './assets/audio/infantry/pistol_45.wav?v=143',
      volume: 0.64,
      pitch: 0.97,
      pitchJitter: 0.03,
      maxDuration: 0.58,
      fadeOut: 0.14,
      reverbSend: 0.26,
      subPunchHz: 98,
      subPunchVol: 0.14,
      maxRange: 230
    },
    magnum: {
      url: './assets/audio/deagle_shot.ogg?v=143',
      altUrl: './assets/audio/infantry/pistol_45.wav?v=143',
      volume: 0.78,
      pitch: 0.95,
      pitchJitter: 0.025,
      maxDuration: 0.75,
      fadeOut: 0.18,
      reverbSend: 0.40,
      subPunchHz: 78,
      subPunchVol: 0.24,
      maxRange: 340
    },
    silenced_rifle: {
      url: './assets/audio/infantry/silenced_shot.ogg?v=143',
      volume: 0.54,
      pitch: 1.0,
      pitchJitter: 0.03,
      maxDuration: 0.42,
      fadeOut: 0.10,
      reverbSend: 0.08,
      maxRange: 85
    },
    silenced_pistol: {
      url: './assets/audio/infantry/silenced_pistol.ogg?v=143',
      volume: 0.50,
      pitch: 1.04,
      pitchJitter: 0.03,
      maxDuration: 0.38,
      fadeOut: 0.09,
      reverbSend: 0.06,
      maxRange: 72
    },
    bullet_crack: {
      url: './assets/audio/infantry/bullet_crack.wav?v=143',
      volume: 0.82,
      pitch: 1.0,
      pitchJitter: 0.08,
      maxDuration: 0.23,
      fadeOut: 0.05,
      reverbSend: 0.16,
      maxRange: 42
    },
    reload_rifle: {
      url: './assets/audio/infantry/reload_rifle.ogg?v=143',
      volume: 0.50,
      pitch: 1.0,
      pitchJitter: 0.0,
      maxDuration: 1.15,
      fadeOut: 0.12,
      reverbSend: 0.05,
      maxRange: 24
    },
    reload_sniper: {
      url: './assets/audio/infantry/reload_sniper.ogg?v=143',
      altUrl: './assets/audio/awp_reload.ogg?v=143',
      volume: 0.44,
      pitch: 1.05,
      pitchJitter: 0.0,
      maxDuration: 0.85,
      fadeOut: 0.10,
      reverbSend: 0.06,
      maxRange: 24
    },
    reload_shotgun: {
      url: './assets/audio/remington_reload.ogg?v=143',
      volume: 0.48,
      pitch: 1.0,
      pitchJitter: 0.02,
      maxDuration: 1.25,
      fadeOut: 0.12,
      reverbSend: 0.05,
      maxRange: 24
    },
    reload_pistol: {
      url: './assets/audio/deagle_reload.ogg?v=143',
      volume: 0.46,
      pitch: 1.04,
      pitchJitter: 0.0,
      maxDuration: 1.10,
      fadeOut: 0.12,
      reverbSend: 0.05,
      maxRange: 22
    },
    reload_rpg: {
      url: './assets/audio/rpg_reload.ogg?v=143',
      volume: 0.52,
      pitch: 1.0,
      pitchJitter: 0.0,
      maxDuration: 1.65,
      fadeOut: 0.16,
      reverbSend: 0.06,
      maxRange: 26
    },
    weapon_click: {
      url: './assets/audio/infantry/weapon_click.ogg?v=143',
      volume: 0.34,
      pitch: 1.18,
      pitchJitter: 0.05,
      maxDuration: 0.10,
      fadeOut: 0.025,
      reverbSend: 0.0,
      maxRange: 30
    }
  },

  // 2. ARMOR & VEHICLE WEAPONS (assets/audio/armor/)
  armor: {
    autocannon: {
      url: './assets/audio/armor/autocannon_30mm.wav?v=143',
      volume: 0.72,
      pitch: 1.0,
      pitchJitter: 0.03,
      maxDuration: 0.56,
      fadeOut: 0.14,
      reverbSend: 0.42,
      subPunchHz: 72,
      subPunchVol: 0.24,
      maxRange: 520
    },
    hmg: {
      url: './assets/audio/armor/hmg_50cal.wav?v=143',
      volume: 0.68,
      pitch: 1.0,
      pitchJitter: 0.03,
      maxDuration: 0.50,
      fadeOut: 0.12,
      reverbSend: 0.38,
      subPunchHz: 80,
      subPunchVol: 0.20,
      maxRange: 480
    },
    tank_cannon: {
      url: './assets/audio/armor/tank_cannon_120mm.wav?v=143',
      volume: 0.92,
      pitch: 0.98,
      pitchJitter: 0.025,
      maxDuration: 1.35,
      fadeOut: 0.30,
      reverbSend: 0.65,
      maxRange: 950
    },
    armor_ricochet: {
      url: './assets/audio/armor/armor_ricochet.ogg?v=143',
      volume: 0.40,
      pitch: 1.28,
      pitchJitter: 0.06,
      maxDuration: 0.18,
      fadeOut: 0.04,
      reverbSend: 0.14,
      maxRange: 55
    }
  },

  // 3. ORDNANCE & EXPLOSIVES (assets/audio/ordnance/)
  ordnance: {
    rpg_launch: {
      url: './assets/audio/ordnance/rpg_launch.ogg?v=143',
      volume: 0.74,
      pitch: 1.02,
      pitchJitter: 0.04,
      maxDuration: 0.68,
      fadeOut: 0.16,
      reverbSend: 0.40,
      maxRange: 420
    },
    explosion: {
      url: './assets/audio/ordnance/explosion_blast.wav?v=143',
      altUrl: './assets/audio/ordnance/concussion_boom.ogg?v=143',
      volume: 0.88,
      pitch: 1.0,
      pitchJitter: 0.05,
      maxDuration: 1.45,
      fadeOut: 0.32,
      reverbSend: 0.66,
      maxRange: 900
    },
    concussion_boom: {
      url: './assets/audio/ordnance/concussion_boom.ogg?v=143',
      volume: 0.82,
      pitch: 0.92,
      pitchJitter: 0.04,
      maxDuration: 1.20,
      fadeOut: 0.26,
      reverbSend: 0.58,
      maxRange: 850
    },
    distant_boom: {
      url: './assets/audio/ordnance/distant_boom.wav?v=143',
      volume: 0.85,
      pitch: 0.96,
      pitchJitter: 0.05,
      maxDuration: 1.55,
      fadeOut: 0.35,
      reverbSend: 0.70,
      maxRange: 1400
    },
    autocannon_impact: {
      url: './assets/audio/ordnance/autocannon_impact.wav?v=143',
      volume: 0.52,
      pitch: 1.0,
      pitchJitter: 0.05,
      maxDuration: 0.26,
      fadeOut: 0.06,
      reverbSend: 0.25,
      maxRange: 240
    },
    grenade_throw: {
      url: './assets/audio/ordnance/grenade_throw.ogg?v=143',
      volume: 0.46,
      pitch: 1.0,
      pitchJitter: 0.04,
      maxDuration: 0.42,
      fadeOut: 0.08,
      reverbSend: 0.08,
      maxRange: 30
    },
    smoke_hiss: {
      url: './assets/audio/ordnance/smoke_hiss.ogg?v=143',
      volume: 0.44,
      pitch: 1.0,
      pitchJitter: 0.03,
      maxDuration: 1.65,
      fadeOut: 0.30,
      reverbSend: 0.16,
      maxRange: 65
    }
  }
};

export const FLAT_AUDIO_PROFILES = {
  ...AUDIO_PACK.infantry,
  ...AUDIO_PACK.armor,
  ...AUDIO_PACK.ordnance
};
