// ============================================================================
// AUDIO PACKAGE MANIFEST (src/audio/audio-pack.js)
// Edit this file to patch Infantry, Armor, and Ordnance sound file URLs,
// volumes, pitches, and strict maxDuration / fadeOut envelopes.
// ============================================================================

export const AUDIO_PACK = {
  // 1. INFANTRY WEAPONS (assets/audio/infantry/)
  infantry: {
    rifle: {
      url: './assets/audio/infantry/rifle_ar15.wav',
      altUrl: './assets/audio/infantry/rifle_ak47.wav',
      volume: 0.62,
      pitch: 1.0,
      pitchJitter: 0.04,
      maxDuration: 0.22,
      fadeOut: 0.06,
      maxRange: 190
    },
    smg: {
      url: './assets/audio/infantry/smg_9mm.wav',
      volume: 0.54,
      pitch: 1.03,
      pitchJitter: 0.04,
      maxDuration: 0.16,
      fadeOut: 0.045,
      maxRange: 165
    },
    lmg: {
      url: './assets/audio/infantry/lmg_762.wav',
      volume: 0.65,
      pitch: 0.96,
      pitchJitter: 0.03,
      maxDuration: 0.23,
      fadeOut: 0.065,
      maxRange: 200
    },
    sniper: {
      url: './assets/audio/infantry/sniper_308.wav',
      volume: 0.76,
      pitch: 0.96,
      pitchJitter: 0.02,
      maxDuration: 0.38,
      fadeOut: 0.10,
      maxRange: 250
    },
    pistol: {
      url: './assets/audio/infantry/pistol_9mm.wav',
      volume: 0.52,
      pitch: 1.02,
      pitchJitter: 0.03,
      maxDuration: 0.15,
      fadeOut: 0.04,
      maxRange: 140
    },
    reload_rifle: {
      url: './assets/audio/infantry/reload_rifle.ogg',
      volume: 0.48,
      pitch: 1.0,
      pitchJitter: 0.0,
      maxDuration: 0.95,
      fadeOut: 0.12,
      maxRange: 20
    },
    reload_sniper: {
      url: './assets/audio/infantry/reload_sniper.ogg',
      volume: 0.36,
      pitch: 1.15,
      pitchJitter: 0.0,
      maxDuration: 0.45,
      fadeOut: 0.08,
      maxRange: 20
    },
    weapon_click: {
      url: './assets/audio/infantry/weapon_click.ogg',
      volume: 0.32,
      pitch: 1.2,
      pitchJitter: 0.05,
      maxDuration: 0.08,
      fadeOut: 0.025,
      maxRange: 30
    }
  },

  // 2. ARMOR & VEHICLE WEAPONS (assets/audio/armor/)
  armor: {
    autocannon: {
      url: './assets/audio/armor/autocannon_30mm.wav?v=135',
      volume: 0.56,
      pitch: 1.0,
      pitchJitter: 0.03,
      maxDuration: 0.16,
      fadeOut: 0.045,
      maxRange: 175
    },
    hmg: {
      url: './assets/audio/armor/hmg_50cal.wav?v=135',
      volume: 0.54,
      pitch: 1.0,
      pitchJitter: 0.03,
      maxDuration: 0.15,
      fadeOut: 0.04,
      maxRange: 175
    },
    tank_cannon: {
      url: './assets/audio/armor/tank_cannon_120mm.wav?v=135',
      volume: 0.76,
      pitch: 1.0,
      pitchJitter: 0.025,
      maxDuration: 0.50,
      fadeOut: 0.12,
      maxRange: 250
    },
    armor_ricochet: {
      url: './assets/audio/armor/armor_ricochet.ogg',
      volume: 0.34,
      pitch: 1.35,
      pitchJitter: 0.06,
      maxDuration: 0.075,
      fadeOut: 0.025,
      maxRange: 40
    }
  },

  // 3. ORDNANCE & EXPLOSIVES (assets/audio/ordnance/)
  ordnance: {
    rpg_launch: {
      url: './assets/audio/ordnance/rpg_launch.ogg',
      volume: 0.62,
      pitch: 1.05,
      pitchJitter: 0.04,
      maxDuration: 0.28,
      fadeOut: 0.08,
      maxRange: 185
    },
    explosion: {
      url: './assets/audio/ordnance/explosion_blast.wav?v=135',
      volume: 0.72,
      pitch: 1.0,
      pitchJitter: 0.05,
      maxDuration: 0.56,
      fadeOut: 0.14,
      maxRange: 250
    },
    autocannon_impact: {
      url: './assets/audio/ordnance/autocannon_impact.wav?v=135',
      volume: 0.44,
      pitch: 1.0,
      pitchJitter: 0.05,
      maxDuration: 0.20,
      fadeOut: 0.05,
      maxRange: 145
    }
  }
};

export const FLAT_AUDIO_PROFILES = {
  ...AUDIO_PACK.infantry,
  ...AUDIO_PACK.armor,
  ...AUDIO_PACK.ordnance
};
