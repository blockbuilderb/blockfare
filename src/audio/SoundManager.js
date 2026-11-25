// ============================================================================
// SOUND MANAGER & SPATIAL WEBAUDIO MIXER (src/audio/SoundManager.js)
// Handles 0-100 Master + Category volume mixing, sample playback, 3D stereo
// panning, distance air-absorption filtering, and procedural sub-bass layers.
// ============================================================================

import { AUDIO_PACK, FLAT_AUDIO_PROFILES } from './audio-pack.js?v=123';
import { AUDIO } from '../config.js?v=123';

const AUDIO_STORAGE_KEY = 'bb_audio_settings_v1';

export class SoundManager {
  constructor() {
    this.ctx = null;
    this.masterBus = null;
    this.masterGainNode = null;
    this.pack = AUDIO_PACK;
    this.profiles = FLAT_AUDIO_PROFILES;
    this.buffers = new Map();
    this.loadingStarted = false;
    this._lastWhizTime = 0;
    this._lastExplosionTime = 0;
    this._lastAutocannonImpactTime = 0;
    this._lastSoldierVoiceTime = 0;
    this._activeVoices = 0;
    this._sharedNoiseBuffer = null;
    this._sharedNoiseCtx = null;

    this.volumes = {
      master: AUDIO.DEFAULT_MASTER_VOLUME ?? 80,
      weapons: AUDIO.DEFAULT_WEAPONS_VOLUME ?? 85,
      explosions: AUDIO.DEFAULT_EXPLOSIONS_VOLUME ?? 85,
      radio: AUDIO.DEFAULT_RADIO_VOLUME ?? 80,
      muted: false,
    };
    this.loadAudioSettings();
  }

  loadAudioSettings() {
    try {
      const raw = localStorage.getItem(AUDIO_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      const clampVol = (v, fallback) => {
        const n = Number(v);
        return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : fallback;
      };
      this.volumes.master = clampVol(parsed.master, AUDIO.DEFAULT_MASTER_VOLUME ?? 80);
      this.volumes.weapons = clampVol(parsed.weapons, AUDIO.DEFAULT_WEAPONS_VOLUME ?? 85);
      this.volumes.explosions = clampVol(parsed.explosions, AUDIO.DEFAULT_EXPLOSIONS_VOLUME ?? 85);
      this.volumes.radio = clampVol(parsed.radio, AUDIO.DEFAULT_RADIO_VOLUME ?? 80);
      this.volumes.muted = Boolean(parsed.muted);
    } catch (_) {}
  }

  saveAudioSettings() {
    try {
      localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(this.volumes));
    } catch (_) {}
  }

  updateMasterGain() {
    if (this.masterGainNode) {
      this.masterGainNode.gain.value = this.volumes.muted
        ? 0
        : AUDIO.MASTER_GAIN * (this.volumes.master / 100);
    }
  }

  getCategoryMult(category) {
    return (this.volumes[category] ?? 85) / 100;
  }

  setVolume(category, val0to100) {
    const clamped = Math.max(0, Math.min(100, Math.round(Number(val0to100) || 0)));
    if (
      category === 'master' ||
      category === 'weapons' ||
      category === 'explosions' ||
      category === 'radio'
    ) {
      this.volumes[category] = clamped;
    }
    this.updateMasterGain();
    this.saveAudioSettings();
    return this.volumes[category];
  }

  getVolume(category = 'master') {
    if (category === 'muted') return Boolean(this.volumes.muted);
    return this.volumes[category] ?? 80;
  }

  setMuted(muted) {
    this.volumes.muted = Boolean(muted);
    this.updateMasterGain();
    this.saveAudioSettings();
    return this.volumes.muted;
  }

  toggleMute() {
    return this.setMuted(!this.volumes.muted);
  }

  resetAudioDefaults() {
    this.volumes = {
      master: AUDIO.DEFAULT_MASTER_VOLUME ?? 80,
      weapons: AUDIO.DEFAULT_WEAPONS_VOLUME ?? 85,
      explosions: AUDIO.DEFAULT_EXPLOSIONS_VOLUME ?? 85,
      radio: AUDIO.DEFAULT_RADIO_VOLUME ?? 80,
      muted: false,
    };
    this.updateMasterGain();
    this.saveAudioSettings();
    return { ...this.volumes };
  }

  init() {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.setupCleanMasterBus();
        this.preloadAudioPackage();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  setupCleanMasterBus() {
    if (!this.ctx) return;

    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = -4;
    limiter.knee.value = 6;
    limiter.ratio.value = 4.0;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.08;

    const masterGain = this.ctx.createGain();
    this.masterGainNode = masterGain;
    this.masterGainNode.gain.value = this.volumes.muted
      ? 0
      : AUDIO.MASTER_GAIN * (this.volumes.master / 100);

    limiter.connect(masterGain);
    masterGain.connect(this.ctx.destination);
    this.masterBus = limiter;
  }

  preloadAudioPackage() {
    if (this.loadingStarted || !this.ctx) return;
    this.loadingStarted = true;

    const decodeUrl = (key, url) => {
      if (!url) return;
      fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.arrayBuffer();
        })
        .then((arrBuf) => this.ctx.decodeAudioData(arrBuf))
        .then((audioBuf) => {
          this.buffers.set(key, audioBuf);
        })
        .catch(() => {});
    };

    for (const [key, prof] of Object.entries(this.profiles)) {
      decodeUrl(key, prof.url);
      if (prof.altUrl) {
        decodeUrl(`${key}_alt`, prof.altUrl);
      }
    }
  }

  _getSharedNoiseBuffer() {
    if (!this.ctx) return null;
    if (this._sharedNoiseBuffer && this._sharedNoiseCtx === this.ctx) {
      return this._sharedNoiseBuffer;
    }
    const sampleRate = this.ctx.sampleRate || 44100;
    const frameCount = Math.floor(sampleRate * 1.0);
    const buf = this.ctx.createBuffer(1, frameCount, sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this._sharedNoiseBuffer = buf;
    this._sharedNoiseCtx = this.ctx;
    return buf;
  }

  _bindOneShotCleanup(src, terminalNode, trackVoice = false) {
    if (!src) return;
    if (trackVoice) {
      this._activeVoices++;
    }
    let cleaned = false;
    src.onended = () => {
      if (cleaned) return;
      cleaned = true;
      if (trackVoice) {
        this._activeVoices = Math.max(0, this._activeVoices - 1);
      }
      if (terminalNode) {
        try {
          terminalNode.disconnect();
        } catch (_) {}
      }
      try {
        src.disconnect();
      } catch (_) {}
    };
  }

  _bindMultiShotCleanup(sources, terminalNode, trackVoice = false) {
    let remaining = sources ? sources.length : 0;
    if (remaining <= 0) return;
    if (trackVoice) {
      this._activeVoices++;
    }
    let voiceDone = false;
    for (let i = 0; i < sources.length; i++) {
      const s = sources[i];
      let oneDone = false;
      s.onended = () => {
        if (oneDone) return;
        oneDone = true;
        try {
          s.disconnect();
        } catch (_) {}
        remaining--;
        if (remaining <= 0) {
          if (trackVoice && !voiceDone) {
            voiceDone = true;
            this._activeVoices = Math.max(0, this._activeVoices - 1);
          }
          if (terminalNode) {
            try {
              terminalNode.disconnect();
            } catch (_) {}
          }
        }
      };
    }
  }

  playProfile(
    profileKey,
    distance = 0,
    pan = 0,
    startTimeOffset = 0,
    volumeMult = 1.0,
    pitchMult = 1.0,
    trackVoice = false
  ) {
    if (!this.ctx || !this.masterBus) return false;
    const prof = this.profiles[profileKey] || this.profiles.rifle;
    if (!prof) return false;

    const maxRange = prof.maxRange || 190;
    if (distance >= maxRange) return false;

    const distRatio = Math.min(1, Math.max(0, distance / maxRange));
    const distAtten = Math.pow(1 - distRatio, 1.55);
    const finalVol = Math.min(1.0, (prof.volume || 0.6) * distAtten * volumeMult);
    if (finalVol <= 0.015) return false;

    let bufKey = profileKey;
    if (prof.altUrl && distance > 8 && Math.random() < 0.5 && this.buffers.has(`${profileKey}_alt`)) {
      bufKey = `${profileKey}_alt`;
    }
    const buf = this.buffers.get(bufKey);
    if (!buf) return false;

    const now = this.ctx.currentTime + startTimeOffset;
    const jitter = prof.pitchJitter ? 1 + (Math.random() * 2 - 1) * prof.pitchJitter : 1.0;
    const rate = Math.max(0.4, (prof.pitch || 1.0) * jitter * pitchMult);

    const dur = Math.min(buf.duration / rate, prof.maxDuration || 0.25);
    const fade = Math.min(dur * 0.65, prof.fadeOut || 0.06);
    const fadeStart = Math.max(0.008, dur - fade);

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.setValueAtTime(rate, now);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const cutoff =
      distance <= 4
        ? 18000
        : Math.max(950, 15500 * Math.pow(1 - distRatio, 1.5));
    filter.frequency.setValueAtTime(cutoff, now);
    filter.Q.setValueAtTime(0.6, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(finalVol, now);
    gain.gain.setValueAtTime(finalVol, now + fadeStart);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + dur);

    src.connect(filter);
    filter.connect(gain);

    let terminalNode = gain;
    if (typeof this.ctx.createStereoPanner === 'function' && Math.abs(pan) > 0.01) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-0.9, Math.min(0.9, pan)), now);
      gain.connect(panner);
      panner.connect(this.masterBus);
      terminalNode = panner;
    } else {
      gain.connect(this.masterBus);
    }

    this._bindOneShotCleanup(src, terminalNode, trackVoice);
    src.start(now, 0, dur + 0.01);
    src.stop(now + dur + 0.015);
    return true;
  }

  playBowTwang(distance = 0, pan = 0, isCrossbow = false) {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    const maxDist = isCrossbow ? 62 : 48;
    if (distance >= maxDist) return;
    if (this._activeVoices > AUDIO.MAX_ACTIVE_VOICES && distance > 18) return;

    const catMult = this.getCategoryMult('weapons');
    if (catMult <= 0.001) return;

    const distRatio = Math.min(1, Math.max(0, distance / maxDist));
    const atten = Math.pow(1 - distRatio, 2.1);
    const vol = (isCrossbow ? 0.22 : 0.17) * atten * catMult;
    if (vol <= 0.006) return;

    const now = this.ctx.currentTime;

    // 1. Warm wooden bowstring pluck / crossbow steel prod release (NO firearm click!)
    const stringOsc = this.ctx.createOscillator();
    const stringGain = this.ctx.createGain();
    stringOsc.type = isCrossbow ? 'sawtooth' : 'sine';
    const baseFreq = isCrossbow ? 185 : 138;
    stringOsc.frequency.setValueAtTime(baseFreq * (0.94 + Math.random() * 0.12), now);
    stringOsc.frequency.exponentialRampToValueAtTime(isCrossbow ? 68 : 54, now + (isCrossbow ? 0.085 : 0.11));

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(isCrossbow ? 920 : 620, now);

    stringGain.gain.setValueAtTime(vol, now);
    stringGain.gain.exponentialRampToValueAtTime(0.0008, now + (isCrossbow ? 0.095 : 0.12));

    stringOsc.connect(lp);
    lp.connect(stringGain);

    // 2. Feathered arrow / quarrel air-"whoosh" using shared pre-allocated noise buffer
    const whooshDur = 0.09;
    const noiseBuf = this._getSharedNoiseBuffer();
    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(isCrossbow ? 1650 : 1350, now);
    bp.frequency.exponentialRampToValueAtTime(680, now + whooshDur);
    bp.Q.setValueAtTime(2.2, now);

    const whooshGain = this.ctx.createGain();
    whooshGain.gain.setValueAtTime(0.001, now);
    whooshGain.gain.linearRampToValueAtTime(vol * 0.65, now + whooshDur * 0.35);
    whooshGain.gain.exponentialRampToValueAtTime(0.0008, now + whooshDur);

    noiseSrc.connect(bp);
    bp.connect(whooshGain);

    if (typeof this.ctx.createStereoPanner === 'function' && Math.abs(pan) > 0.01) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-0.9, Math.min(0.9, pan)), now);
      stringGain.connect(panner);
      whooshGain.connect(panner);
      panner.connect(this.masterBus);
      this._bindMultiShotCleanup([stringOsc, noiseSrc], panner, true);
    } else {
      stringGain.connect(this.masterBus);
      whooshGain.connect(this.masterBus);
      this._bindOneShotCleanup(stringOsc, stringGain, true);
      this._bindOneShotCleanup(noiseSrc, whooshGain, false);
    }

    const noiseOffset = Math.random() * Math.max(0, 1.0 - whooshDur - 0.02);
    stringOsc.start(now);
    stringOsc.stop(now + (isCrossbow ? 0.1 : 0.125));
    noiseSrc.start(now, noiseOffset, whooshDur);
    noiseSrc.stop(now + whooshDur + 0.01);
  }

  playMeleeSwing(distance = 0, pan = 0, isHeavy = false) {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    const maxDist = 28;
    if (distance >= maxDist) return;

    const catMult = this.getCategoryMult('weapons');
    if (catMult <= 0.001) return;

    const distRatio = Math.min(1, Math.max(0, distance / maxDist));
    const atten = Math.pow(1 - distRatio, 2.2);
    const vol = (isHeavy ? 0.24 : 0.18) * atten * catMult;
    if (vol <= 0.006) return;

    const now = this.ctx.currentTime;
    const dur = isHeavy ? 0.16 : 0.11;
    const noiseBuf = this._getSharedNoiseBuffer();
    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(isHeavy ? 720 : 1050, now);
    bp.frequency.exponentialRampToValueAtTime(isHeavy ? 260 : 380, now + dur);
    bp.Q.setValueAtTime(1.8, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(vol, now + dur * 0.35);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + dur);

    noiseSrc.connect(bp);
    bp.connect(gain);

    let terminalNode = gain;
    if (typeof this.ctx.createStereoPanner === 'function' && Math.abs(pan) > 0.01) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-0.9, Math.min(0.9, pan)), now);
      gain.connect(panner);
      panner.connect(this.masterBus);
      terminalNode = panner;
    } else {
      gain.connect(this.masterBus);
    }

    const noiseOffset = Math.random() * Math.max(0, 1.0 - dur - 0.02);
    this._bindOneShotCleanup(noiseSrc, terminalNode, false);
    noiseSrc.start(now, noiseOffset, dur);
    noiseSrc.stop(now + dur + 0.01);
  }

  /**
   * Mount & Blade Shield Block Thud (oak-and-iron shield impact) or
   * Zweihänder / Greatsword Steel Crossguard Parry Clash.
   */
  playShieldBlock(isSwordParry = false, distance = 0, pan = 0) {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    const maxDist = 42;
    if (distance >= maxDist) return;

    const catMult = Math.max(0.25, this.getCategoryMult('weapons'));
    const distRatio = Math.min(1, Math.max(0, distance / maxDist));
    const atten = Math.pow(1 - distRatio, 1.85);
    const vol = (isSwordParry ? 0.26 : 0.3) * atten * catMult;
    if (vol <= 0.008) return;

    const now = this.ctx.currentTime;
    let panner = null;
    if (typeof this.ctx.createStereoPanner === 'function' && Math.abs(pan) > 0.01) {
      panner = this.ctx.createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-0.9, Math.min(0.9, pan)), now);
      panner.connect(this.masterBus);
    }
    const outNode = panner || this.masterBus;
    const sources = [];

    if (isSwordParry) {
      // High-carbon steel Zweihänder blade-on-blade parry ring (dual harmonic chime + metallic transient)
      [1580, 2360, 620].forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = idx === 2 ? 'triangle' : 'square';
        const dur = idx === 2 ? 0.14 : 0.19;
        osc.frequency.setValueAtTime(freq * (0.96 + Math.random() * 0.08), now);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.72, now + dur);
        g.gain.setValueAtTime(vol * (idx === 0 ? 0.55 : idx === 1 ? 0.35 : 0.65), now);
        g.gain.exponentialRampToValueAtTime(0.0008, now + dur);
        osc.connect(g);
        g.connect(outNode);
        if (!panner) this._bindOneShotCleanup(osc, g, false);
        sources.push(osc);
        osc.start(now);
        osc.stop(now + dur + 0.01);
      });
    } else {
      // Heavy oak-and-iron Heater / Pavise Shield block thud + brass rim clink
      const thudOsc = this.ctx.createOscillator();
      const thudGain = this.ctx.createGain();
      thudOsc.type = 'triangle';
      thudOsc.frequency.setValueAtTime(142, now);
      thudOsc.frequency.exponentialRampToValueAtTime(44, now + 0.15);
      thudGain.gain.setValueAtTime(vol, now);
      thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      thudOsc.connect(thudGain);
      thudGain.connect(outNode);
      if (!panner) this._bindOneShotCleanup(thudOsc, thudGain, false);
      sources.push(thudOsc);
      thudOsc.start(now);
      thudOsc.stop(now + 0.17);

      const rimOsc = this.ctx.createOscillator();
      const rimGain = this.ctx.createGain();
      rimOsc.type = 'sawtooth';
      rimOsc.frequency.setValueAtTime(880, now);
      rimOsc.frequency.exponentialRampToValueAtTime(310, now + 0.08);
      rimGain.gain.setValueAtTime(vol * 0.42, now);
      rimGain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
      rimOsc.connect(rimGain);
      rimGain.connect(outNode);
      if (!panner) this._bindOneShotCleanup(rimOsc, rimGain, false);
      sources.push(rimOsc);
      rimOsc.start(now);
      rimOsc.stop(now + 0.09);
    }

    if (panner) {
      this._bindMultiShotCleanup(sources, panner, false);
    }
  }

  /**
   * Mount & Blade-style spatial 3D Medieval Soldier vocal synthesizer & shield/armor clatter:
   * - 'battle_cry' / 'charge': Gutsy war roar ("HAAARGH!" / "CHAAARGE!") + metallic sword/shield clash
   * - 'shield_wall': Low rhythmic brace grunt ("HUP! HOLD!") + heavy iron-on-oak shield lock thud
   * - 'retreat': Urgent two-syllable warning shout ("FALL BACK!")
   * - 'pain': Short visceral hit grunt when struck by arrow or blade
   * - 'death': Falling vocal groan when struck down
   * - 'cheer': Rising victorious battle cheer
   */
  playMedievalSoldierVoice(kind = 'battle_cry', distance = 0, pan = 0, force = false) {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    const maxDist = kind === 'pain' ? 48 : 82;
    if (distance >= maxDist) return;

    const nowPerf = performance.now();
    const minCooldown = force ? 60 : distance < 16 ? 180 : 380;
    if (!force && nowPerf - (this._lastSoldierVoiceTime || 0) < minCooldown) return;
    this._lastSoldierVoiceTime = nowPerf;

    const catMult = Math.max(0.25, this.getCategoryMult('radio'));
    const distRatio = Math.min(1, Math.max(0, distance / maxDist));
    const atten = Math.pow(1 - distRatio, 1.75);
    const baseVol =
      kind === 'pain'
        ? 0.22
        : kind === 'death'
        ? 0.26
        : kind === 'shield_wall'
        ? 0.28
        : 0.3;
    const vol = baseVol * atten * catMult;
    if (vol <= 0.008) return;

    const now = this.ctx.currentTime;
    // Randomized baritone/tenor male soldier fundamental pitch (105 Hz - 155 Hz)
    const voicePitch = 108 + Math.random() * 44;
    const dur =
      kind === 'pain'
        ? 0.16
        : kind === 'shield_wall'
        ? 0.25
        : kind === 'retreat'
        ? 0.34
        : kind === 'death'
        ? 0.38
        : 0.44;

    // Glottal vocal cord source (sawtooth) + vibrato modulation
    const glottal = this.ctx.createOscillator();
    glottal.type = 'sawtooth';
    if (kind === 'battle_cry' || kind === 'charge' || kind === 'cheer') {
      glottal.frequency.setValueAtTime(voicePitch * 0.92, now);
      glottal.frequency.linearRampToValueAtTime(voicePitch * 1.32, now + dur * 0.38);
      glottal.frequency.exponentialRampToValueAtTime(voicePitch * (kind === 'cheer' ? 1.18 : 0.86), now + dur);
    } else if (kind === 'shield_wall') {
      glottal.frequency.setValueAtTime(voicePitch * 0.95, now);
      glottal.frequency.exponentialRampToValueAtTime(voicePitch * 0.72, now + dur);
    } else if (kind === 'retreat') {
      glottal.frequency.setValueAtTime(voicePitch * 1.24, now);
      glottal.frequency.setValueAtTime(voicePitch * 1.05, now + dur * 0.48);
      glottal.frequency.exponentialRampToValueAtTime(voicePitch * 0.82, now + dur);
    } else if (kind === 'pain') {
      glottal.frequency.setValueAtTime(voicePitch * 1.28, now);
      glottal.frequency.exponentialRampToValueAtTime(voicePitch * 0.78, now + dur);
    } else {
      // 'death'
      glottal.frequency.setValueAtTime(voicePitch * 1.15, now);
      glottal.frequency.exponentialRampToValueAtTime(voicePitch * 0.54, now + dur);
    }

    // Dual Vowel Formant Filters (F1 ~ 720 Hz open 'AH'/'OR' roar, F2 ~ 1250 Hz chest/throat projection)
    const f1 = this.ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.setValueAtTime(kind === 'shield_wall' ? 580 : 740, now);
    f1.Q.setValueAtTime(4.2, now);

    const f2 = this.ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.setValueAtTime(kind === 'shield_wall' ? 1080 : 1320, now);
    f2.Q.setValueAtTime(3.5, now);

    // Vocal breath/grit noise layer using shared pre-allocated noise buffer
    const noiseBuf = this._getSharedNoiseBuffer();
    const breathSrc = this.ctx.createBufferSource();
    breathSrc.buffer = noiseBuf;
    const breathGain = this.ctx.createGain();
    breathGain.gain.setValueAtTime(0.42, now);

    const voiceGain = this.ctx.createGain();
    voiceGain.gain.setValueAtTime(0.001, now);
    voiceGain.gain.linearRampToValueAtTime(vol, now + 0.025);
    if (kind === 'retreat') {
      // Two-syllable envelope ("FALL - BACK!")
      voiceGain.gain.setValueAtTime(vol * 0.25, now + dur * 0.42);
      voiceGain.gain.linearRampToValueAtTime(vol * 0.95, now + dur * 0.52);
    }
    voiceGain.gain.exponentialRampToValueAtTime(0.0008, now + dur);

    glottal.connect(f1);
    glottal.connect(f2);
    breathSrc.connect(breathGain);
    breathGain.connect(f1);
    breathGain.connect(f2);
    f1.connect(voiceGain);
    f2.connect(voiceGain);

    let panner = null;
    if (typeof this.ctx.createStereoPanner === 'function' && Math.abs(pan) > 0.01) {
      panner = this.ctx.createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-0.9, Math.min(0.9, pan)), now);
      voiceGain.connect(panner);
      panner.connect(this.masterBus);
    } else {
      voiceGain.connect(this.masterBus);
    }

    const sources = [glottal, breathSrc];
    if (!panner) {
      this._bindMultiShotCleanup([glottal, breathSrc], voiceGain, false);
    }

    const noiseOffset = Math.random() * Math.max(0, 1.0 - dur - 0.02);
    glottal.start(now);
    glottal.stop(now + dur + 0.015);
    breathSrc.start(now, noiseOffset, dur);
    breathSrc.stop(now + dur + 0.015);

    // Add physical oak-and-iron shield slam on 'shield_wall' or sword-on-shield clash on 'battle_cry'/'charge'
    if (kind === 'shield_wall') {
      const thudOsc = this.ctx.createOscillator();
      const thudGain = this.ctx.createGain();
      thudOsc.type = 'triangle';
      thudOsc.frequency.setValueAtTime(128, now + 0.04);
      thudOsc.frequency.exponentialRampToValueAtTime(42, now + 0.18);
      thudGain.gain.setValueAtTime(vol * 1.15, now + 0.04);
      thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
      thudOsc.connect(thudGain);
      thudGain.connect(panner || this.masterBus);
      if (!panner) this._bindOneShotCleanup(thudOsc, thudGain, false);
      sources.push(thudOsc);
      thudOsc.start(now + 0.04);
      thudOsc.stop(now + 0.2);
    } else if (kind === 'battle_cry' || kind === 'charge') {
      const clangOsc = this.ctx.createOscillator();
      const clangGain = this.ctx.createGain();
      clangOsc.type = 'square';
      clangOsc.frequency.setValueAtTime(1180 + Math.random() * 280, now + 0.06);
      clangOsc.frequency.exponentialRampToValueAtTime(520, now + 0.15);
      clangGain.gain.setValueAtTime(vol * 0.28, now + 0.06);
      clangGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      clangOsc.connect(clangGain);
      clangGain.connect(panner || this.masterBus);
      if (!panner) this._bindOneShotCleanup(clangOsc, clangGain, false);
      sources.push(clangOsc);
      clangOsc.start(now + 0.06);
      clangOsc.stop(now + 0.17);
    }

    if (panner) {
      this._bindMultiShotCleanup(sources, panner, false);
    }
  }

  /**
   * Mount & Blade Commander War Horn & Troop Chorus Response when issuing
   * CHARGE / ATTACK ('charge'), DEFEND / SHIELD WALL ('defend'), or RETREAT ('retreat') orders.
   */
  playMedievalWarHorn(mode = 'charge') {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    const catMult = Math.max(0.3, this.getCategoryMult('radio'));
    const now = this.ctx.currentTime;
    const dur = mode === 'charge' ? 0.85 : mode === 'defend' ? 0.65 : 0.72;

    const hornOsc1 = this.ctx.createOscillator();
    const hornOsc2 = this.ctx.createOscillator();
    hornOsc1.type = 'sawtooth';
    hornOsc2.type = 'triangle';

    if (mode === 'charge') {
      // Heroic rising fifth war horn blast (A3 -> E4)
      hornOsc1.frequency.setValueAtTime(220, now);
      hornOsc1.frequency.exponentialRampToValueAtTime(330, now + 0.28);
      hornOsc2.frequency.setValueAtTime(440, now);
      hornOsc2.frequency.exponentialRampToValueAtTime(660, now + 0.28);
    } else if (mode === 'defend') {
      // Deep resolute low G3 double-pulse shield-wall horn
      hornOsc1.frequency.setValueAtTime(196, now);
      hornOsc2.frequency.setValueAtTime(392, now);
    } else {
      // Urgent descending retreat horn (D4 -> F#3)
      hornOsc1.frequency.setValueAtTime(293.66, now);
      hornOsc1.frequency.exponentialRampToValueAtTime(185, now + dur * 0.8);
      hornOsc2.frequency.setValueAtTime(587.33, now);
      hornOsc2.frequency.exponentialRampToValueAtTime(370, now + dur * 0.8);
    }

    const hornFilter = this.ctx.createBiquadFilter();
    hornFilter.type = 'lowpass';
    hornFilter.frequency.setValueAtTime(1150, now);
    hornFilter.Q.setValueAtTime(2.4, now);

    const hornGain = this.ctx.createGain();
    const vol = 0.22 * catMult;
    hornGain.gain.setValueAtTime(0.001, now);
    hornGain.gain.linearRampToValueAtTime(vol, now + 0.06);
    hornGain.gain.setValueAtTime(vol * 0.9, now + dur * 0.7);
    hornGain.gain.exponentialRampToValueAtTime(0.0008, now + dur);

    hornOsc1.connect(hornFilter);
    hornOsc2.connect(hornFilter);
    hornFilter.connect(hornGain);
    hornGain.connect(this.masterBus);
    this._bindMultiShotCleanup([hornOsc1, hornOsc2], hornGain, false);

    hornOsc1.start(now);
    hornOsc2.start(now);
    hornOsc1.stop(now + dur + 0.02);
    hornOsc2.stop(now + dur + 0.02);

    // Staggered chorus of nearby soldiers answering the horn!
    const voiceKind =
      mode === 'charge' ? 'battle_cry' : mode === 'defend' ? 'shield_wall' : 'retreat';
    [-0.45, 0.38, -0.15].forEach((p, idx) => {
      setTimeout(() => {
        this.playMedievalSoldierVoice(voiceKind, 6 + idx * 4, p, true);
      }, 180 + idx * 115);
    });
  }

  playGunshot(type = 'rifle', distance = 0, pan = 0, isSilenced = false) {
    this.init();
    if (!this.ctx || !this.masterBus) return;

    // Strict Era Guard: In Medieval or Jurassic Era, NEVER play modern firearm gunshot sounds!
    const activeEra = window.game?.world?.era || window.game?.activeEra || 'modern';
    if (activeEra === 'medieval' || activeEra === 'jurassic' || type === 'bow' || type === 'crossbow') {
      this.playBowTwang(distance, pan, type === 'crossbow');
      return;
    }

    if (this._activeVoices > AUDIO.MAX_ACTIVE_VOICES && distance > AUDIO.VOICE_CULL_DIST) return;

    const catMult = this.getCategoryMult('weapons');
    if (catMult <= 0.001) return;

    if (isSilenced) {
      const maxSilencedDist = 75;
      if (distance >= maxSilencedDist) return;
      const distRatio = Math.min(1, Math.max(0, distance / maxSilencedDist));
      const atten = Math.pow(1 - distRatio, 1.8);
      this.playProfile('weapon_click', distance, pan, 0, 0.45 * atten * catMult, 1.35);
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(340, now);
      osc.frequency.exponentialRampToValueAtTime(75, now + 0.055);
      gain.gain.setValueAtTime(0.22 * atten * catMult, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.connect(gain);
      gain.connect(this.masterBus);
      this._bindOneShotCleanup(osc, gain, true);
      osc.start(now);
      osc.stop(now + 0.065);
      return;
    }

    const profileKey = this.profiles[type] ? type : 'rifle';
    const played = this.playProfile(profileKey, distance, pan, 0, catMult, 1.0, true);

    if (played) {
      if (type === 'sniper' && distance === 0) {
        this.playProfile('reload_sniper', 0, 0, 0.28, catMult);
      }
    } else {
      this.playFallbackDryShot(0.35, distance);
    }
  }

  playTankCannon(distance = 0, pan = 0) {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    if (distance >= AUDIO.TANK_CANNON_MAX_DIST) return;

    const catMult = this.getCategoryMult('explosions');
    if (catMult <= 0.001) return;

    const distRatio = Math.min(1, Math.max(0, distance / AUDIO.TANK_CANNON_MAX_DIST));
    const atten = Math.pow(1 - distRatio, 1.55);
    if (atten <= 0.02) return;

    const played = this.playProfile('tank_cannon', distance, pan, 0, catMult);

    const now = this.ctx.currentTime;
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(115, now);
    subOsc.frequency.exponentialRampToValueAtTime(34, now + 0.24);
    subGain.gain.setValueAtTime(0.36 * atten * catMult, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    subOsc.connect(subGain);

    let subTerm = subGain;
    if (typeof this.ctx.createStereoPanner === 'function' && Math.abs(pan) > 0.01) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-0.9, Math.min(0.9, pan)), now);
      subGain.connect(panner);
      panner.connect(this.masterBus);
      subTerm = panner;
    } else {
      subGain.connect(this.masterBus);
    }
    this._bindOneShotCleanup(subOsc, subTerm, false);
    subOsc.start(now);
    subOsc.stop(now + 0.29);

    if (!played) {
      this.playFallbackDryShot(0.45 * catMult, distance);
    }
  }

  playAutocannon(distance = 0, pan = 0) {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    const catMult = this.getCategoryMult('explosions');
    if (catMult <= 0.001) return;

    if (!this.playProfile('autocannon', distance, pan, 0, catMult)) {
      this.playFallbackDryShot(0.35 * catMult, distance);
    }
  }

  playAutocannonImpact(distance = 0, pan = 0, scale = 0.5) {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    const catMult = this.getCategoryMult('explosions');
    if (catMult <= 0.001) return;
    if (distance >= AUDIO.AUTOCANNON_IMPACT_MAX_DIST) return;

    const nowPerf = performance.now();
    if (nowPerf - this._lastAutocannonImpactTime < AUDIO.AUTOCANNON_COOLDOWN_MS && distance > 12) {
      return;
    }
    this._lastAutocannonImpactTime = nowPerf;
    this.playProfile('autocannon_impact', distance, pan, 0, Math.max(0.5, scale * 1.4) * catMult);
  }

  playAirstrikeFlyby(distance = 0, pan = 0) {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    const catMult = this.getCategoryMult('explosions');
    if (catMult <= 0.001) return;

    const distRatio = Math.min(1, Math.max(0, distance / 300));
    const atten = Math.pow(1 - distRatio, 1.35);
    if (atten <= 0.02) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(185, now);
    osc.frequency.exponentialRampToValueAtTime(62, now + 0.55);
    gain.gain.setValueAtTime(0.18 * atten * catMult, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.58);
    osc.connect(gain);
    gain.connect(this.masterBus);
    this._bindOneShotCleanup(osc, gain, false);
    osc.start(now);
    osc.stop(now + 0.6);
  }

  playBulletWhiz(distance = 8, pan = 0) {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    const catMult = this.getCategoryMult('weapons');
    if (catMult <= 0.001) return;

    const nowPerf = performance.now();
    if (nowPerf - this._lastWhizTime < AUDIO.WHIZ_COOLDOWN_MS) return;
    this._lastWhizTime = nowPerf;

    const volScale = Math.max(0.15, Math.min(0.75, 1 - distance / 28)) * catMult;
    this.playProfile('weapon_click', distance, pan, 0, volScale, 1.45);
  }

  playRocketLaunch(distance = 0, pan = 0) {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    const catMult = this.getCategoryMult('explosions');
    if (catMult <= 0.001) return;

    if (!this.playProfile('rpg_launch', distance, pan, 0, catMult)) {
      this.playFallbackDryShot(0.45 * catMult, distance);
    }
  }

  playExplosion(distance = 0, pan = 0, scale = 1.0) {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    const catMult = this.getCategoryMult('explosions');
    if (catMult <= 0.001) return;

    if (scale <= 0.55) {
      this.playAutocannonImpact(distance, pan, scale);
      return;
    }

    if (distance >= AUDIO.EXPLOSION_MAX_DIST) return;
    const nowPerf = performance.now();
    if (nowPerf - this._lastExplosionTime < AUDIO.EXPLOSION_COOLDOWN_MS && distance > 18) return;
    this._lastExplosionTime = nowPerf;

    const distRatio = Math.min(1, Math.max(0, distance / AUDIO.EXPLOSION_MAX_DIST));
    const atten = Math.pow(1 - distRatio, 1.5);
    if (atten <= 0.02) return;

    const volMult = Math.min(1.25, Math.max(0.7, scale)) * catMult;
    const pitchMult = scale > 1.1 ? 0.88 : 1.0;
    const played = this.playProfile('explosion', distance, pan, 0, volMult, pitchMult);

    const now = this.ctx.currentTime;
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(92, now);
    subOsc.frequency.exponentialRampToValueAtTime(28, now + 0.32);
    subGain.gain.setValueAtTime(0.34 * atten * volMult, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    subOsc.connect(subGain);
    subGain.connect(this.masterBus);
    this._bindOneShotCleanup(subOsc, subGain, false);
    subOsc.start(now);
    subOsc.stop(now + 0.36);

    if (!played) {
      this.playFallbackDryShot(0.45 * catMult, distance);
    }
  }

  playHitmarker(mode = 'normal') {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    const catMult = this.getCategoryMult('weapons');
    if (catMult <= 0.001) return;

    if (mode === 'armor') {
      if (this.playProfile('armor_ricochet', 0, 0, 0, catMult)) return;
    } else {
      const pitchMult = mode === 'headshot' || mode === 'kill' ? 1.28 : 1.0;
      if (this.playProfile('weapon_click', 0, 0, 0, 0.95 * catMult, pitchMult)) return;
    }

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(mode === 'headshot' ? 1650 : 1180, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.035);
    gain.gain.setValueAtTime(0.18 * catMult, now);
    gain.gain.exponentialRampToValueAtTime(0.002, now + 0.038);
    osc.connect(gain);
    gain.connect(this.masterBus);
    this._bindOneShotCleanup(osc, gain, false);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  playReload() {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    const catMult = this.getCategoryMult('weapons');
    if (catMult <= 0.001) return;

    if (!this.playProfile('reload_rifle', 0, 0, 0, catMult)) {
      this.playProfile('weapon_click', 0, 0, 0, catMult);
    }
  }

  playBuildHammer() {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    const catMult = this.getCategoryMult('weapons');
    if (catMult <= 0.001) return;

    if (!this.playProfile('weapon_click', 0, 0, 0, 1.1 * catMult, 0.65)) {
      this.playFallbackDryShot(0.25, 0);
    }
  }

  playRadioBeep(isIncoming = true) {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    const catMult = this.getCategoryMult('radio');
    if (catMult <= 0.001) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isIncoming ? 1420 : 1680, now);
    osc.frequency.setValueAtTime(isIncoming ? 1850 : 1240, now + 0.035);
    gain.gain.setValueAtTime(0.06 * catMult, now);
    gain.gain.exponentialRampToValueAtTime(0.002, now + 0.075);
    osc.connect(gain);
    gain.connect(this.masterBus);
    this._bindOneShotCleanup(osc, gain, false);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  playCaptureTick() {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    const catMult = this.getCategoryMult('radio');
    if (catMult <= 0.001) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(980, now);
    gain.gain.setValueAtTime(0.045 * catMult, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    osc.connect(gain);
    gain.connect(this.masterBus);
    this._bindOneShotCleanup(osc, gain, false);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  playObjectiveSiren(isFriendly = true) {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    const catMult = this.getCategoryMult('radio');
    if (catMult <= 0.001) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isFriendly ? 660 : 520, now);
    osc.frequency.exponentialRampToValueAtTime(isFriendly ? 990 : 360, now + 0.18);
    gain.gain.setValueAtTime(0.08 * catMult, now);
    gain.gain.exponentialRampToValueAtTime(0.002, now + 0.22);
    osc.connect(gain);
    gain.connect(this.masterBus);
    this._bindOneShotCleanup(osc, gain, false);
    osc.start(now);
    osc.stop(now + 0.23);
  }

  /**
   * Realistic Speed-of-Sound Delayed A-10C GAU-8 Avenger "BRRRT!" Acoustic Roar:
   * - Bullets impact first; `distance / 343` seconds later, the iconic 65 Hz / 130 Hz rotary sawtooth
   *   cannon buzz rolls across the battlefield!
   */
  playDelayedA10Brrrt(distance = 0, pan = 0) {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    const catMult = this.getCategoryMult('weapons');
    if (catMult <= 0.001 || distance > 1800) return;

    const nowPerf = performance.now();
    if (nowPerf - (this._lastBrrrtQueuedAt || 0) < 380) return;
    this._lastBrrrtQueuedAt = nowPerf;

    const speedOfSoundDelaySec = Math.min(3.2, Math.max(0, distance / 343));
    const startAt = this.ctx.currentTime + speedOfSoundDelaySec;
    const atten = Math.max(0.08, Math.pow(Math.max(0, 1 - distance / 1850), 1.25));
    const dur = 0.44;

    const oscLow = this.ctx.createOscillator();
    const oscHarm = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    oscLow.type = 'sawtooth';
    oscLow.frequency.setValueAtTime(65, startAt); // 3,900 RPM = 65 Hz fundamental "BRRRT!"
    oscLow.frequency.linearRampToValueAtTime(61, startAt + dur);

    oscHarm.type = 'square';
    oscHarm.frequency.setValueAtTime(130, startAt);
    oscHarm.frequency.linearRampToValueAtTime(122, startAt + dur);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(Math.max(220, 720 - distance * 0.25), startAt);
    filter.Q.value = 1.6;

    const peakGain = Math.min(0.42, 0.34 * atten * catMult);
    gain.gain.setValueAtTime(0.001, startAt);
    gain.gain.linearRampToValueAtTime(peakGain, startAt + 0.04);
    gain.gain.setValueAtTime(peakGain * 0.92, startAt + dur - 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, startAt + dur);

    oscLow.connect(filter);
    oscHarm.connect(filter);
    filter.connect(gain);

    if (typeof this.ctx.createStereoPanner === 'function' && Math.abs(pan) > 0.02) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), startAt);
      gain.connect(panner);
      panner.connect(this.masterBus);
    } else {
      gain.connect(this.masterBus);
    }

    this._bindOneShotCleanup(oscLow, gain, false);
    oscLow.start(startAt);
    oscHarm.start(startAt);
    oscLow.stop(startAt + dur + 0.02);
    oscHarm.stop(startAt + dur + 0.02);
  }

  /**
   * Cockpit Radar Warning Receiver (`RWR`) Audio:
   * - `'track'`: Steady 880 Hz radar lock-acquisition ping when painted by enemy radar/seeker.
   * - `'missile_inbound'`: Urgent alternating 1,480 Hz / 1,960 Hz high-tempo missile launch alarm!
   */
  playRwrTone(mode = 'track') {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    const catMult = this.getCategoryMult('radio');
    if (catMult <= 0.001) return;

    const isInbound = mode === 'missile_inbound';
    const minIntervalMs = isInbound ? 160 : 560;
    const nowPerf = performance.now();
    if (nowPerf - (this._lastRwrToneAt || 0) < minIntervalMs) return;
    this._lastRwrToneAt = nowPerf;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = isInbound ? 'square' : 'sine';
    if (isInbound) {
      this._rwrToggle = !this._rwrToggle;
      osc.frequency.setValueAtTime(this._rwrToggle ? 1960 : 1480, now);
      gain.gain.setValueAtTime(0.095 * catMult, now);
      gain.gain.exponentialRampToValueAtTime(0.002, now + 0.11);
      osc.connect(gain);
      gain.connect(this.masterBus);
      this._bindOneShotCleanup(osc, gain, false);
      osc.start(now);
      osc.stop(now + 0.12);
    } else {
      osc.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0.055 * catMult, now);
      gain.gain.exponentialRampToValueAtTime(0.002, now + 0.09);
      osc.connect(gain);
      gain.connect(this.masterBus);
      this._bindOneShotCleanup(osc, gain, false);
      osc.start(now);
      osc.stop(now + 0.1);
    }
  }

  playObjectiveCaptured(isFriendly = true) {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    this.playRadioBeep(isFriendly);
  }

  playBuy() {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    this.playRadioBeep(true);
  }

  /**
   * Satisfying Wheel-of-Fortune / CS2 peg-clack sound when the Red Triangle Flapper
   * snaps over a physical pin on the horizontal case strip.
   */
  playCasePinTick(speedNorm = 0.5, isGoldTile = false) {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    const catMult = Math.max(0.25, this.getCategoryMult('radio'));
    const now = this.ctx.currentTime;

    // 1. Crisp wooden/brass peg clack transient
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = isGoldTile ? 'sine' : 'triangle';
    const baseFreq = isGoldTile ? 1480 : 940 + speedNorm * 380;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.032);

    const vol = (0.11 + (1 - speedNorm) * 0.08) * catMult;
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.036);
    osc.connect(gain);
    gain.connect(this.masterBus);
    this._bindOneShotCleanup(osc, gain, false);
    osc.start(now);
    osc.stop(now + 0.038);

    // 2. High metallic pin-snap harmonic
    const snapOsc = this.ctx.createOscillator();
    const snapGain = this.ctx.createGain();
    snapOsc.type = 'square';
    snapOsc.frequency.setValueAtTime(isGoldTile ? 2650 : 2100, now);
    snapOsc.frequency.exponentialRampToValueAtTime(680, now + 0.014);
    snapGain.gain.setValueAtTime(vol * 0.35, now);
    snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.016);
    snapOsc.connect(snapGain);
    snapGain.connect(this.masterBus);
    this._bindOneShotCleanup(snapOsc, snapGain, false);
    snapOsc.start(now);
    snapOsc.stop(now + 0.018);
  }

  /**
   * Celebratory multi-note chime when the case spin stops on the winning weapon/skin.
   */
  playCaseWinFanfare(isGold = false) {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    const catMult = Math.max(0.3, this.getCategoryMult('radio'));
    const now = this.ctx.currentTime;
    const notes = isGold ? [523.25, 659.25, 783.99, 1046.5, 1318.5] : [440, 554.37, 659.25, 880];
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = isGold ? 'triangle' : 'sine';
      const t0 = now + idx * 0.075;
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.14 * catMult, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + (isGold ? 0.38 : 0.24));
      osc.connect(g);
      g.connect(this.masterBus);
      this._bindOneShotCleanup(osc, g, false);
      osc.start(t0);
      osc.stop(t0 + (isGold ? 0.4 : 0.26));
    });
  }

  playFallbackDryShot(vol = 0.35, distance = 0) {
    if (!this.ctx || !this.masterBus) return;
    const catMult = this.getCategoryMult('weapons');
    if (catMult <= 0.001) return;

    const noiseBuf = this._getSharedNoiseBuffer();
    if (!noiseBuf) return;
    const now = this.ctx.currentTime;
    const dur = 0.08;
    const src = this.ctx.createBufferSource();
    src.buffer = noiseBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = distance > 40 ? 900 : 1400;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol * 0.45 * catMult, now);
    g.gain.exponentialRampToValueAtTime(0.002, now + dur);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.masterBus);
    const offset = Math.random() * Math.max(0, 1.0 - dur - 0.02);
    this._bindOneShotCleanup(src, g, false);
    src.start(now, offset, dur);
    src.stop(now + dur + 0.01);
  }

  /**
   * Continuous WebAudio Aircraft Engine Synthesizer (`updateAircraftEngineAudio`):
   * - Synthesizes realistic, throttle-responsive cockpit & chase-cam engine sounds when piloting any aircraft:
   *   * Jet Fighter / Stealth Bomber (`fighter`, `b2_spirit`): Low-pressure turbine rumble + high-RPM compressor whine + broadband jet exhaust & afterburner roar (`[W]`).
   *   * CAS Warthog / Frogfoot (`cas`): High-bypass TF34 twin-turbofan dual-rotor buzzsaw whine + jet thrust roar.
   *   * Heavy Gunship (`gunship` — AC-130J / Tu-95MS): 4-engine Allison T56 / NK-12 contra-rotating turboprop drone with blade-pass harmonic modulation.
   *   * 1903 Wright Flyer I (`wright_flyer`): 4-cylinder chugging piston pop + twin chain-driven wooden propeller chop.
   * - Also synthesizes 3D spatial stereo-panned, Doppler-shifted external flyby engine roar when nearby AI/enemy aircraft fly within 450m!
   */
  _ensureAircraftEngineGraph() {
    if (!this.ctx || !this.masterBus) return null;
    if (this._airEngineNodes) return this._airEngineNodes;

    const now = this.ctx.currentTime;
    // Create 2.0-second seamless pink/white jet exhaust turbulence noise loop buffer
    const sampleRate = this.ctx.sampleRate || 44100;
    const len = sampleRate * 2;
    const noiseBuf = this.ctx.createBuffer(1, len, sampleRate);
    const ch = noiseBuf.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      ch[i] = (b0 + b1 + b2 + white * 0.18) * 0.14;
    }

    // 1. Player Aircraft Engine Bus
    const selfBusGain = this.ctx.createGain();
    selfBusGain.gain.setValueAtTime(0.0001, now);
    selfBusGain.connect(this.masterBus);

    const coreOsc = this.ctx.createOscillator();
    coreOsc.type = 'sawtooth';
    coreOsc.frequency.setValueAtTime(85, now);

    const coreFilter = this.ctx.createBiquadFilter();
    coreFilter.type = 'lowpass';
    coreFilter.frequency.setValueAtTime(240, now);
    coreFilter.Q.setValueAtTime(2.2, now);

    const coreGain = this.ctx.createGain();
    coreGain.gain.setValueAtTime(0.18, now);

    // Blade-pass / piston firing LFO modulator on coreGain
    const bladeLfo = this.ctx.createOscillator();
    bladeLfo.type = 'sine';
    bladeLfo.frequency.setValueAtTime(18, now);
    const bladeDepth = this.ctx.createGain();
    bladeDepth.gain.setValueAtTime(0.0, now);
    bladeLfo.connect(bladeDepth);
    bladeDepth.connect(coreGain.gain);

    coreOsc.connect(coreFilter);
    coreFilter.connect(coreGain);
    coreGain.connect(selfBusGain);

    // High-pressure compressor / turbofan whine oscillator
    const whineOsc = this.ctx.createOscillator();
    whineOsc.type = 'triangle';
    whineOsc.frequency.setValueAtTime(520, now);
    const whineGain = this.ctx.createGain();
    whineGain.gain.setValueAtTime(0.04, now);
    whineOsc.connect(whineGain);
    whineGain.connect(selfBusGain);

    // Jet exhaust / afterburner / prop-wash noise source
    const roarSrc = this.ctx.createBufferSource();
    roarSrc.buffer = noiseBuf;
    roarSrc.loop = true;
    const roarFilter = this.ctx.createBiquadFilter();
    roarFilter.type = 'bandpass';
    roarFilter.frequency.setValueAtTime(360, now);
    roarFilter.Q.setValueAtTime(0.85, now);
    const roarGain = this.ctx.createGain();
    roarGain.gain.setValueAtTime(0.22, now);
    roarSrc.connect(roarFilter);
    roarFilter.connect(roarGain);
    roarGain.connect(selfBusGain);

    coreOsc.start(now);
    bladeLfo.start(now);
    whineOsc.start(now);
    roarSrc.start(now);

    // 2. External 3D Flyby Aircraft Engine Bus (for nearby AI / remote planes)
    const extBusGain = this.ctx.createGain();
    extBusGain.gain.setValueAtTime(0.0001, now);
    let extPanner = null;
    if (typeof this.ctx.createStereoPanner === 'function') {
      extPanner = this.ctx.createStereoPanner();
      extBusGain.connect(extPanner);
      extPanner.connect(this.masterBus);
    } else {
      extBusGain.connect(this.masterBus);
    }

    const extOsc = this.ctx.createOscillator();
    extOsc.type = 'sawtooth';
    extOsc.frequency.setValueAtTime(110, now);
    const extLp = this.ctx.createBiquadFilter();
    extLp.type = 'lowpass';
    extLp.frequency.setValueAtTime(340, now);
    extOsc.connect(extLp);
    extLp.connect(extBusGain);

    const extNoise = this.ctx.createBufferSource();
    extNoise.buffer = noiseBuf;
    extNoise.loop = true;
    const extNoiseBp = this.ctx.createBiquadFilter();
    extNoiseBp.type = 'bandpass';
    extNoiseBp.frequency.setValueAtTime(420, now);
    extNoiseBp.Q.setValueAtTime(0.9, now);
    const extNoiseGain = this.ctx.createGain();
    extNoiseGain.gain.setValueAtTime(0.65, now);
    extNoise.connect(extNoiseBp);
    extNoiseBp.connect(extNoiseGain);
    extNoiseGain.connect(extBusGain);

    extOsc.start(now);
    extNoise.start(now);

    this._airEngineNodes = {
      selfBusGain,
      coreOsc,
      coreFilter,
      coreGain,
      bladeLfo,
      bladeDepth,
      whineOsc,
      whineGain,
      roarFilter,
      roarGain,
      extBusGain,
      extPanner,
      extOsc,
      extLp,
      extNoiseBp
    };
    return this._airEngineNodes;
  }

  _setAirParam(param, key, target, now, tc) {
    if (!param) return;
    if (!this._airParamCache) this._airParamCache = Object.create(null);
    const prev = this._airParamCache[key];
    const tol = Math.max(0.0005, Math.abs(target) * 0.008);
    if (prev !== undefined && Math.abs(prev - target) <= tol) return;
    this._airParamCache[key] = target;
    if (typeof param.cancelScheduledValues === 'function') {
      param.cancelScheduledValues(now);
    }
    param.setTargetAtTime(target, now, tc);
  }

  updateAircraftEngineAudio(playerVehicle, allVehicles = [], listenerPos = null, listenerYaw = 0, wHeld = false) {
    if (this.volumes.muted) {
      if (this._airEngineNodes && this.ctx) {
        const now = this.ctx.currentTime;
        this._setAirParam(this._airEngineNodes.selfBusGain.gain, 'selfBus', 0.0001, now, 0.05);
        this._setAirParam(this._airEngineNodes.extBusGain.gain, 'extBus', 0.0001, now, 0.05);
      }
      return;
    }

    const isPilotingPlane = Boolean(
      playerVehicle && playerVehicle.isAircraft && !playerVehicle.dead
    );

    const wallNow = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const pilotingChanged = isPilotingPlane !== Boolean(this._lastPilotingPlane);
    if (!pilotingChanged && this._lastAirAudioWallMs && wallNow - this._lastAirAudioWallMs < 40) {
      return;
    }
    this._lastAirAudioWallMs = wallNow;
    this._lastPilotingPlane = isPilotingPlane;

    // Find nearest active external aircraft within 450m
    let nearestExtPlane = null;
    let nearestExtDist = 450;
    if (listenerPos && Array.isArray(allVehicles)) {
      for (const v of allVehicles) {
        if (!v || !v.isAircraft || v.dead || v === playerVehicle) continue;
        if (!v.driver && !v.aiPilotActive && !v.isShotDown) continue;
        if ((v.forwardSpeed || 0) < 2.0 && !v.isShotDown) continue;
        const d = Math.hypot(
          v.pos.x - listenerPos.x,
          v.pos.y - listenerPos.y,
          v.pos.z - listenerPos.z
        );
        if (d < nearestExtDist) {
          nearestExtDist = d;
          nearestExtPlane = v;
        }
      }
    }

    if (!isPilotingPlane && !nearestExtPlane) {
      if (this._airEngineNodes && this.ctx) {
        const now = this.ctx.currentTime;
        this._setAirParam(this._airEngineNodes.selfBusGain.gain, 'selfBus', 0.0001, now, 0.08);
        this._setAirParam(this._airEngineNodes.extBusGain.gain, 'extBus', 0.0001, now, 0.08);
      }
      return;
    }

    this.init();
    const nodes = this._ensureAircraftEngineGraph();
    if (!nodes || !this.ctx) return;

    const now = this.ctx.currentTime;
    const catMult = Math.max(0.2, this.getCategoryMult('weapons'));

    // 1. Update Player-Piloted Aircraft Engine Sound
    if (isPilotingPlane) {
      const v = playerVehicle;
      const role = v.aircraftRole || 'fighter';
      const maxSpd = Math.max(25, v.maxSpeed || (v.speed || 62) * 1.35);
      const spdNorm = Math.max(0, Math.min(1.2, (v.forwardSpeed || 0) / maxSpd));
      const spool = Math.max(0.18, Math.min(1.0, v.engineSpool ?? Math.max(0.25, spdNorm)));
      const thr = typeof v.throttle === 'number' ? v.throttle : Math.max(0.25, spdNorm);
      const abBoost = wHeld ? 0.25 : 0;
      const power = Math.min(1.25, spool * 0.55 + thr * 0.45 + abBoost);

      if (nodes.coreOsc.type !== 'sawtooth') nodes.coreOsc.type = 'sawtooth';
      if (role === 'wright_flyer') {
        // 1903 4-cylinder chugging piston engine + twin chain-driven wooden propellers
        this._setAirParam(nodes.coreOsc.frequency, 'coreFreq', 34 + power * 28, now, 0.06);
        this._setAirParam(nodes.coreFilter.frequency, 'coreFilt', 190 + power * 180, now, 0.06);
        this._setAirParam(nodes.coreGain.gain, 'coreGain', 0.24, now, 0.06);
        this._setAirParam(nodes.bladeLfo.frequency, 'bladeFreq', 10 + power * 9, now, 0.06);
        this._setAirParam(nodes.bladeDepth.gain, 'bladeDepth', 0.11, now, 0.06);
        this._setAirParam(nodes.whineOsc.frequency, 'whineFreq', 140 + power * 95, now, 0.06);
        this._setAirParam(nodes.whineGain.gain, 'whineGain', 0.03, now, 0.06);
        this._setAirParam(nodes.roarFilter.frequency, 'roarFilt', 260 + power * 220, now, 0.06);
        this._setAirParam(nodes.roarGain.gain, 'roarGain', 0.14 + spdNorm * 0.14, now, 0.06);
      } else if (role === 'gunship') {
        // AC-130J / Tu-95MS 4-Engine Turboprop Drone + Blade-Pass Hum
        this._setAirParam(nodes.coreOsc.frequency, 'coreFreq', 64 + power * 36, now, 0.07);
        this._setAirParam(nodes.coreFilter.frequency, 'coreFilt', 240 + power * 210, now, 0.07);
        this._setAirParam(nodes.coreGain.gain, 'coreGain', 0.26, now, 0.07);
        this._setAirParam(nodes.bladeLfo.frequency, 'bladeFreq', 19 + power * 10, now, 0.07);
        this._setAirParam(nodes.bladeDepth.gain, 'bladeDepth', 0.09, now, 0.07);
        this._setAirParam(nodes.whineOsc.frequency, 'whineFreq', 360 + power * 240, now, 0.07);
        this._setAirParam(nodes.whineGain.gain, 'whineGain', 0.045, now, 0.07);
        this._setAirParam(nodes.roarFilter.frequency, 'roarFilt', 310 + power * 290, now, 0.07);
        this._setAirParam(nodes.roarGain.gain, 'roarGain', 0.2 + power * 0.16, now, 0.07);
      } else if (role === 'cas') {
        // A-10C / Su-25 High-Bypass Twin-Turbofan Whine + Jet Roar
        this._setAirParam(nodes.coreOsc.frequency, 'coreFreq', 78 + power * 58, now, 0.06);
        this._setAirParam(nodes.coreFilter.frequency, 'coreFilt', 310 + power * 340, now, 0.06);
        this._setAirParam(nodes.coreGain.gain, 'coreGain', 0.2, now, 0.06);
        this._setAirParam(nodes.bladeLfo.frequency, 'bladeFreq', 28 + power * 16, now, 0.06);
        this._setAirParam(nodes.bladeDepth.gain, 'bladeDepth', 0.035, now, 0.06);
        this._setAirParam(nodes.whineOsc.frequency, 'whineFreq', 390 + power * 420, now, 0.06);
        this._setAirParam(nodes.whineGain.gain, 'whineGain', 0.07 + power * 0.04, now, 0.06);
        this._setAirParam(nodes.roarFilter.frequency, 'roarFilt', 380 + power * 520, now, 0.06);
        this._setAirParam(nodes.roarGain.gain, 'roarGain', 0.24 + power * 0.22, now, 0.06);
      } else {
        // F-15EX / F-22A / Su-57 / B-2A Spirit Low-Bypass Afterburning Turbofan
        this._setAirParam(nodes.coreOsc.frequency, 'coreFreq', 72 + power * 68, now, 0.06);
        this._setAirParam(nodes.coreFilter.frequency, 'coreFilt', 290 + power * 420, now, 0.06);
        this._setAirParam(nodes.coreGain.gain, 'coreGain', 0.21 + (wHeld ? 0.08 : 0), now, 0.06);
        this._setAirParam(nodes.bladeLfo.frequency, 'bladeFreq', 32 + power * 18, now, 0.06);
        this._setAirParam(nodes.bladeDepth.gain, 'bladeDepth', 0.025, now, 0.06);
        this._setAirParam(nodes.whineOsc.frequency, 'whineFreq', 480 + power * 540, now, 0.06);
        this._setAirParam(nodes.whineGain.gain, 'whineGain', 0.055 + power * 0.035, now, 0.06);
        this._setAirParam(nodes.roarFilter.frequency, 'roarFilt', 340 + power * 640 + (wHeld ? 240 : 0), now, 0.06);
        this._setAirParam(nodes.roarGain.gain, 'roarGain', 0.26 + power * 0.24 + (wHeld ? 0.14 : 0), now, 0.06);
      }

      const targetSelfVol = Math.min(0.42, (0.16 + power * 0.18 + (wHeld ? 0.06 : 0)) * catMult);
      this._setAirParam(nodes.selfBusGain.gain, 'selfBus', targetSelfVol, now, 0.06);
    } else {
      this._setAirParam(nodes.selfBusGain.gain, 'selfBus', 0.0001, now, 0.08);
    }

    // 2. Update External 3D Spatial Flyby Aircraft Engine Sound
    if (nearestExtPlane && listenerPos) {
      const distRatio = Math.min(1, Math.max(0, nearestExtDist / 450));
      const atten = Math.pow(1 - distRatio, 1.65);
      const spd = Math.max(10, nearestExtPlane.forwardSpeed || 45);
      // Simple radial velocity Doppler pitch shift
      const dx = nearestExtPlane.pos.x - listenerPos.x;
      const dz = nearestExtPlane.pos.z - listenerPos.z;
      const invD = 1 / Math.max(1, nearestExtDist);
      const vx = -Math.sin(nearestExtPlane.yaw || 0) * spd;
      const vz = -Math.cos(nearestExtPlane.yaw || 0) * spd;
      const radialVel = (dx * vx + dz * vz) * invD; // negative = approaching, positive = receding
      const doppler = Math.max(0.68, Math.min(1.42, 1.0 - radialVel / 220));

      this._setAirParam(nodes.extOsc.frequency, 'extOsc', 92 * doppler, now, 0.07);
      this._setAirParam(nodes.extLp.frequency, 'extLp', (280 + (1 - distRatio) * 520) * doppler, now, 0.07);
      this._setAirParam(nodes.extNoiseBp.frequency, 'extBp', (360 + (1 - distRatio) * 480) * doppler, now, 0.07);

      if (nodes.extPanner) {
        const rightX = Math.cos(listenerYaw);
        const rightZ = -Math.sin(listenerYaw);
        const pan = Math.max(-0.9, Math.min(0.9, (dx * rightX + dz * rightZ) * invD));
        this._setAirParam(nodes.extPanner.pan, 'extPan', pan, now, 0.06);
      }

      const extVol = Math.min(0.32, 0.28 * atten * catMult);
      this._setAirParam(nodes.extBusGain.gain, 'extBus', Math.max(0.0001, extVol), now, 0.07);
    } else {
      this._setAirParam(nodes.extBusGain.gain, 'extBus', 0.0001, now, 0.08);
    }
  }

  _isMotorizedGroundVehicle(v) {
    if (!v || v.dead || v.isAircraft) return false;
    const t = v.type;
    return (
      t === 'bike' ||
      t === 'atv' ||
      t === 'humvee' ||
      t === 'apc' ||
      t === 'aa' ||
      t === 'tank'
    );
  }

  _ensureGroundEngineGraph() {
    if (!this.ctx) return null;
    if (this._groundEngineNodes) return this._groundEngineNodes;

    const ctx = this.ctx;
    const noiseBuf = this._createNoiseBuffer(2.0);

    // 1. Player / Ridden Ground Vehicle Continuous Engine + Exhaust + Track/Turbine Graph
    const selfBusGain = ctx.createGain();
    selfBusGain.gain.value = 0.0001;
    selfBusGain.connect(this.masterGain || ctx.destination);

    const selfCoreOsc = ctx.createOscillator();
    selfCoreOsc.type = 'sawtooth';
    selfCoreOsc.frequency.value = 54;
    const selfCoreGain = ctx.createGain();
    selfCoreGain.gain.value = 0.45;

    const selfSubOsc = ctx.createOscillator();
    selfSubOsc.type = 'triangle';
    selfSubOsc.frequency.value = 27;
    const selfSubGain = ctx.createGain();
    selfSubGain.gain.value = 0.35;

    // High-frequency turbine / EV inverter / turbocharger whine oscillator
    const selfWhineOsc = ctx.createOscillator();
    selfWhineOsc.type = 'sine';
    selfWhineOsc.frequency.value = 420;
    const selfWhineGain = ctx.createGain();
    selfWhineGain.gain.value = 0.02;

    const selfExhaustLp = ctx.createBiquadFilter();
    selfExhaustLp.type = 'lowpass';
    selfExhaustLp.frequency.value = 260;
    selfExhaustLp.Q.value = 2.4;

    selfCoreOsc.connect(selfCoreGain);
    selfSubOsc.connect(selfSubGain);
    selfCoreGain.connect(selfExhaustLp);
    selfSubGain.connect(selfExhaustLp);
    selfExhaustLp.connect(selfBusGain);

    selfWhineOsc.connect(selfWhineGain);
    selfWhineGain.connect(selfBusGain);

    // Mechanical intake / tire / caterpillar track rumble loop
    const selfMechNoise = ctx.createBufferSource();
    selfMechNoise.buffer = noiseBuf;
    selfMechNoise.loop = true;
    const selfMechBp = ctx.createBiquadFilter();
    selfMechBp.type = 'bandpass';
    selfMechBp.frequency.value = 180;
    selfMechBp.Q.value = 1.4;
    const selfMechGain = ctx.createGain();
    selfMechGain.gain.value = 0.08;
    selfMechNoise.connect(selfMechBp);
    selfMechBp.connect(selfMechGain);
    selfMechGain.connect(selfBusGain);

    selfCoreOsc.start();
    selfSubOsc.start();
    selfWhineOsc.start();
    selfMechNoise.start();

    // 2. Nearest AI / Remote Driven Ground Vehicle Spatial Pass-By + Doppler Bus
    const extBusGain = ctx.createGain();
    extBusGain.gain.value = 0.0001;
    let extPanner = null;
    if (typeof ctx.createStereoPanner === 'function') {
      extPanner = ctx.createStereoPanner();
      extBusGain.connect(extPanner);
      extPanner.connect(this.masterGain || ctx.destination);
    } else {
      extBusGain.connect(this.masterGain || ctx.destination);
    }

    const extOsc = ctx.createOscillator();
    extOsc.type = 'sawtooth';
    extOsc.frequency.value = 62;
    const extLp = ctx.createBiquadFilter();
    extLp.type = 'lowpass';
    extLp.frequency.value = 320;
    extLp.Q.value = 2.1;
    extOsc.connect(extLp);
    extLp.connect(extBusGain);

    const extNoise = ctx.createBufferSource();
    extNoise.buffer = noiseBuf;
    extNoise.loop = true;
    const extNoiseBp = ctx.createBiquadFilter();
    extNoiseBp.type = 'bandpass';
    extNoiseBp.frequency.value = 210;
    extNoiseBp.Q.value = 1.2;
    const extNoiseGain = ctx.createGain();
    extNoiseGain.gain.value = 0.25;
    extNoise.connect(extNoiseBp);
    extNoiseBp.connect(extNoiseGain);
    extNoiseGain.connect(extBusGain);

    extOsc.start();
    extNoise.start();

    this._groundEngineNodes = {
      selfBusGain,
      selfCoreOsc,
      selfCoreGain,
      selfSubOsc,
      selfSubGain,
      selfWhineOsc,
      selfWhineGain,
      selfExhaustLp,
      selfMechBp,
      selfMechGain,
      extBusGain,
      extPanner,
      extOsc,
      extLp,
      extNoiseBp,
      cache: {}
    };
    return this._groundEngineNodes;
  }

  _setGroundParam(audioParam, key, targetVal, now, timeConst = 0.055) {
    if (!audioParam || !this._groundEngineNodes) return;
    const cache = this._groundEngineNodes.cache;
    const prev = cache[key];
    if (prev !== undefined && Math.abs(prev - targetVal) < 0.0015) return;
    cache[key] = targetVal;
    audioParam.setTargetAtTime(targetVal, now, timeConst);
  }

  /**
   * Continuous real-time procedural engine, exhaust, turbine & track audio for ALL motorized
   * ground vehicles (Motorcycles — 4-stroke, 2-stroke, Electric e-Moto — Quad ATVs, Humvees,
   * 8x8 IFVs/SPAAGs, M1A2 Gas-Turbine Tanks & T-90M V-12 Diesel Tanks) + 3D spatial Doppler pass-by!
   */
  updateGroundVehicleEngineAudio(arg1, arg2, listenerPos, listenerYaw = 0) {
    const vehicles = Array.isArray(arg1) ? arg1 : Array.isArray(arg2) ? arg2 : null;
    const playerVeh = Array.isArray(arg1) ? arg2 : arg1;
    if (!this.ctx || !this.enabled || this.muted) {
      if (this._groundEngineNodes && this.ctx) {
        const t = this.ctx.currentTime;
        this._setGroundParam(this._groundEngineNodes.selfBusGain.gain, 'selfBus', 0.0001, t, 0.06);
        this._setGroundParam(this._groundEngineNodes.extBusGain.gain, 'extBus', 0.0001, t, 0.06);
      }
      return;
    }

    const catMult = this.getCategoryGain('vehicles');
    if (catMult <= 0.001) {
      if (this._groundEngineNodes) {
        const t = this.ctx.currentTime;
        this._setGroundParam(this._groundEngineNodes.selfBusGain.gain, 'selfBus', 0.0001, t, 0.06);
        this._setGroundParam(this._groundEngineNodes.extBusGain.gain, 'extBus', 0.0001, t, 0.06);
      }
      return;
    }

    const activePlayerGround = this._isMotorizedGroundVehicle(playerVeh) ? playerVeh : null;
    let nearestExtVeh = null;
    let nearestExtDistSq = 145 * 145;

    if (listenerPos && Array.isArray(vehicles)) {
      for (let i = 0; i < vehicles.length; i++) {
        const v = vehicles[i];
        if (!this._isMotorizedGroundVehicle(v) || v === activePlayerGround || !v.pos) continue;
        const spdAbs = Math.abs(v.forwardSpeed || 0);
        const isOccupied = Boolean(v.driver || v.npcDriver || spdAbs > 0.65);
        if (!isOccupied) continue;
        const dx = v.pos.x - listenerPos.x;
        const dy = v.pos.y - listenerPos.y;
        const dz = v.pos.z - listenerPos.z;
        const dSq = dx * dx + dy * dy + dz * dz;
        if (dSq < nearestExtDistSq) {
          nearestExtDistSq = dSq;
          nearestExtVeh = v;
        }
      }
    }

    if (!activePlayerGround && !nearestExtVeh) {
      if (this._groundEngineNodes) {
        const t = this.ctx.currentTime;
        this._setGroundParam(this._groundEngineNodes.selfBusGain.gain, 'selfBus', 0.0001, t, 0.07);
        this._setGroundParam(this._groundEngineNodes.extBusGain.gain, 'extBus', 0.0001, t, 0.07);
      }
      return;
    }

    if (this.ctx.state === 'suspended') return;
    const nodes = this._ensureGroundEngineGraph();
    if (!nodes) return;
    const now = this.ctx.currentTime;

    // A. Ridden Ground Vehicle Engine Synthesis
    if (activePlayerGround) {
      const v = activePlayerGround;
      const spdAbs = Math.abs(v.forwardSpeed || 0);
      const maxSpd = Math.max(8, v.maxSpeed || 24);
      const spdRatio = Math.min(1.2, spdAbs / maxSpd);
      const rpmNorm =
        typeof v.engineRpm === 'number' && v.maxRpm > 1000
          ? Math.max(0, Math.min(1.12, (v.engineRpm - (v.idleRpm || 1200)) / Math.max(800, v.maxRpm - (v.idleRpm || 1200))))
          : Math.min(1.05, spdRatio * 0.92 + (spdAbs > 0.5 ? 0.14 : 0.0));
      const loadBoost = v.boostActive || v.wheelieFactor > 0.15 ? 0.18 : 0;

      let coreHz = 52;
      let subHz = 26;
      let lpHz = 260;
      let whineHz = 400;
      let whineLvl = 0.01;
      let mechHz = 180;
      let mechLvl = 0.06;
      let masterVol = 0.16;

      if (v.type === 'bike') {
        const isEv = Boolean(v.isElectric || v.bikeEngine === 'electric_stealth');
        const isTwoStroke = Boolean(v.bikeEngine === 'two_stroke_race');
        if (isEv) {
          // Zero FX Electric Recon Bike: quiet stealth idle + futuristic PWM inverter whine + tire hum
          if (nodes.selfCoreOsc.type !== 'sine') nodes.selfCoreOsc.type = 'sine';
          coreHz = 145 + spdRatio * 560;
          subHz = 72 + spdRatio * 240;
          lpHz = 520 + spdRatio * 1400;
          whineHz = 380 + spdRatio * 1420;
          whineLvl = 0.025 + spdRatio * 0.085;
          mechHz = 240 + spdRatio * 420;
          mechLvl = spdRatio * 0.045;
          masterVol = 0.045 + spdRatio * 0.11;
        } else if (isTwoStroke) {
          // 250cc 2-Stroke Dirt Bike: crisp high-revving resonant ring-ding powerband!
          if (nodes.selfCoreOsc.type !== 'sawtooth') nodes.selfCoreOsc.type = 'sawtooth';
          coreHz = 86 + (rpmNorm + loadBoost) * 235;
          subHz = coreHz * 0.5;
          lpHz = 420 + (rpmNorm + loadBoost) * 1650;
          whineHz = coreHz * 2.0;
          whineLvl = 0.025 + rpmNorm * 0.05;
          mechHz = 310 + spdRatio * 380;
          mechLvl = 0.035 + spdRatio * 0.065;
          masterVol = 0.12 + rpmNorm * 0.12;
        } else {
          // 450cc 4-Stroke Single-Cylinder Enduro Thumper ("braaap" exhaust pulse + gear shifts!)
          if (nodes.selfCoreOsc.type !== 'sawtooth') nodes.selfCoreOsc.type = 'sawtooth';
          coreHz = 52 + (rpmNorm + loadBoost) * 168;
          subHz = coreHz * 0.5;
          lpHz = 270 + (rpmNorm + loadBoost) * 1180;
          whineHz = 280 + rpmNorm * 520;
          whineLvl = 0.015 + rpmNorm * 0.035;
          mechHz = 210 + spdRatio * 340;
          mechLvl = 0.04 + spdRatio * 0.065;
          masterVol = 0.125 + rpmNorm * 0.12;
        }
      } else if (v.type === 'atv') {
        // 850cc Twin-Cylinder 4x4 Tactical Quad ATV
        if (nodes.selfCoreOsc.type !== 'sawtooth') nodes.selfCoreOsc.type = 'sawtooth';
        coreHz = 46 + (rpmNorm + loadBoost) * 144;
        subHz = coreHz * 0.5;
        lpHz = 240 + (rpmNorm + loadBoost) * 960;
        whineHz = 240 + rpmNorm * 460;
        whineLvl = 0.018 + rpmNorm * 0.03;
        mechHz = 185 + spdRatio * 290;
        mechLvl = 0.05 + spdRatio * 0.075;
        masterVol = 0.13 + rpmNorm * 0.115;
      } else if (v.type === 'humvee') {
        // 6.5L V8 Turbo-Diesel Armored Utility Truck
        if (nodes.selfCoreOsc.type !== 'sawtooth') nodes.selfCoreOsc.type = 'sawtooth';
        coreHz = 36 + rpmNorm * 102;
        subHz = coreHz * 0.5;
        lpHz = 195 + rpmNorm * 680;
        whineHz = 520 + rpmNorm * 920; // turbocharger whistle
        whineLvl = 0.012 + rpmNorm * 0.042;
        mechHz = 150 + spdRatio * 240;
        mechLvl = 0.055 + spdRatio * 0.075;
        masterVol = 0.135 + rpmNorm * 0.11;
      } else if (v.type === 'apc' || v.type === 'aa') {
        // 8x8 Armored IFV / SPAAG Heavy Inline-6 Turbo-Diesel + Drivetrain Whine
        if (nodes.selfCoreOsc.type !== 'sawtooth') nodes.selfCoreOsc.type = 'sawtooth';
        coreHz = 39 + rpmNorm * 108;
        subHz = coreHz * 0.5;
        lpHz = 210 + rpmNorm * 720;
        whineHz = 480 + rpmNorm * 880;
        whineLvl = 0.018 + rpmNorm * 0.048;
        mechHz = 165 + spdRatio * 260;
        mechLvl = 0.065 + spdRatio * 0.085;
        masterVol = 0.145 + rpmNorm * 0.115;
      } else if (v.type === 'tank') {
        const isAbramsTurbine = v.team !== 'RU';
        if (nodes.selfCoreOsc.type !== 'sawtooth') nodes.selfCoreOsc.type = 'sawtooth';
        if (isAbramsTurbine) {
          // M1A2 SEP v3 Honeywell AGT1500 Gas-Turbine Whine + Steel Track Clatter
          coreHz = 48 + spdRatio * 68;
          subHz = 24 + spdRatio * 34;
          lpHz = 220 + spdRatio * 460;
          whineHz = 690 + spdRatio * 960;
          whineLvl = 0.055 + spdRatio * 0.095;
          mechHz = 135 + spdRatio * 245;
          mechLvl = 0.05 + spdRatio * 0.13;
          masterVol = 0.15 + spdRatio * 0.12;
        } else {
          // T-90M Proryv V-92S2F V-12 Twin-Turbo Diesel Roar + Steel Track Clatter
          coreHz = 31 + spdRatio * 84;
          subHz = 16 + spdRatio * 42;
          lpHz = 185 + spdRatio * 620;
          whineHz = 540 + spdRatio * 840;
          whineLvl = 0.024 + spdRatio * 0.062;
          mechHz = 130 + spdRatio * 235;
          mechLvl = 0.065 + spdRatio * 0.135;
          masterVol = 0.155 + spdRatio * 0.12;
        }
      }

      this._setGroundParam(nodes.selfCoreOsc.frequency, 'sCoreHz', coreHz, now, 0.045);
      this._setGroundParam(nodes.selfSubOsc.frequency, 'sSubHz', subHz, now, 0.045);
      this._setGroundParam(nodes.selfExhaustLp.frequency, 'sLpHz', lpHz, now, 0.05);
      this._setGroundParam(nodes.selfWhineOsc.frequency, 'sWhineHz', whineHz, now, 0.05);
      this._setGroundParam(nodes.selfWhineGain.gain, 'sWhineGain', whineLvl, now, 0.05);
      this._setGroundParam(nodes.selfMechBp.frequency, 'sMechHz', mechHz, now, 0.05);
      this._setGroundParam(nodes.selfMechGain.gain, 'sMechGain', mechLvl, now, 0.05);
      this._setGroundParam(
        nodes.selfBusGain.gain,
        'selfBus',
        Math.max(0.0001, Math.min(0.32, masterVol * catMult)),
        now,
        0.055
      );
    } else {
      this._setGroundParam(nodes.selfBusGain.gain, 'selfBus', 0.0001, now, 0.07);
    }

    // B. Nearest External Ground Vehicle 3D Spatial Pass-By + Doppler Shift
    if (nearestExtVeh && listenerPos) {
      const dist = Math.sqrt(nearestExtDistSq);
      const distRatio = Math.min(1, Math.max(0, dist / 145));
      const atten = Math.pow(1 - distRatio, 1.75);
      const spdSigned = nearestExtVeh.forwardSpeed || 0;
      const spdAbs = Math.abs(spdSigned);
      const maxSpd = Math.max(8, nearestExtVeh.maxSpeed || 22);
      const spdFrac = Math.min(1.15, spdAbs / maxSpd);

      const dx = nearestExtVeh.pos.x - listenerPos.x;
      const dz = nearestExtVeh.pos.z - listenerPos.z;
      const invD = 1 / Math.max(1, dist);
      const vx = -Math.sin(nearestExtVeh.yaw || 0) * spdSigned;
      const vz = -Math.cos(nearestExtVeh.yaw || 0) * spdSigned;
      const radialVel = (dx * vx + dz * vz) * invD;
      const doppler = Math.max(0.76, Math.min(1.32, 1.0 - radialVel / 145));

      const baseExtHz =
        nearestExtVeh.type === 'bike'
          ? nearestExtVeh.isElectric
            ? 190 + spdFrac * 380
            : 64 + spdFrac * 155
          : nearestExtVeh.type === 'atv'
          ? 52 + spdFrac * 125
          : nearestExtVeh.type === 'tank'
          ? 36 + spdFrac * 72
          : 42 + spdFrac * 96;

      this._setGroundParam(nodes.extOsc.frequency, 'extHz', baseExtHz * doppler, now, 0.06);
      this._setGroundParam(
        nodes.extLp.frequency,
        'extLp',
        (220 + (1 - distRatio) * 580 + spdFrac * 360) * doppler,
        now,
        0.06
      );
      this._setGroundParam(
        nodes.extNoiseBp.frequency,
        'extBp',
        (165 + spdFrac * 260) * doppler,
        now,
        0.06
      );

      if (nodes.extPanner) {
        const rightX = Math.cos(listenerYaw);
        const rightZ = -Math.sin(listenerYaw);
        const pan = Math.max(-0.9, Math.min(0.9, (dx * rightX + dz * rightZ) * invD));
        this._setGroundParam(nodes.extPanner.pan, 'extPan', pan, now, 0.055);
      }

      const extVol = Math.min(0.24, (0.08 + spdFrac * 0.14) * atten * catMult);
      this._setGroundParam(nodes.extBusGain.gain, 'extBus', Math.max(0.0001, extVol), now, 0.065);
    } else {
      this._setGroundParam(nodes.extBusGain.gain, 'extBus', 0.0001, now, 0.08);
    }
  }
}

export const sound = new SoundManager();
