// Modular CC0 Sample-Based Audio Engine for BattleBit Clone
// All sound file paths, volumes, pitches, and strict maxDuration envelopes
// are packaged centrally in `./audio-pack.js` (`assets/audio/infantry/`, `armor/`, `ordnance/`).

import { AUDIO_PACK, FLAT_AUDIO_PROFILES } from './audio-pack.js?v=20';

class SoundManager {
  constructor() {
    this.ctx = null;
    this.masterBus = null;
    this.pack = AUDIO_PACK;
    this.profiles = FLAT_AUDIO_PROFILES;
    this.buffers = new Map();
    this.loadingStarted = false;
    this._lastWhizTime = 0;
    this._activeVoices = 0;
  }

  init() {
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

  /**
   * Transparent master bus with gentle peak limiting (-4 dB) to prevent clipping.
   */
  setupCleanMasterBus() {
    if (!this.ctx) return;

    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = -4;
    limiter.knee.value = 6;
    limiter.ratio.value = 4.0;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.08;

    const masterGain = this.ctx.createGain();
    masterGain.gain.value = 0.78;

    limiter.connect(masterGain);
    masterGain.connect(this.ctx.destination);
    this.masterBus = limiter;
  }

  /**
   * Preloads all categorized Infantry, Armor, and Ordnance audio files from `AUDIO_PACK`.
   */
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

  /**
   * Plays a packaged sound profile (`infantry`, `armor`, or `ordnance`) with:
   * - Strict `maxDuration` & `fadeOut` envelope so armor/ordnance sounds never drag on
   * - Distance volume attenuation & outdoor air-absorption low-pass filtering
   * - 3D stereo panning
   */
  playProfile(profileKey, distance = 0, pan = 0, startTimeOffset = 0, volumeMult = 1.0, pitchMult = 1.0) {
    if (!this.ctx || !this.masterBus) return false;
    const prof = this.profiles[profileKey] || this.profiles.rifle;
    if (!prof) return false;

    const maxRange = prof.maxRange || 190;
    if (distance >= maxRange) return false;

    const distRatio = Math.min(1, Math.max(0, distance / maxRange));
    const distAtten = Math.pow(1 - distRatio, 1.55);
    const finalVol = Math.min(1.0, (prof.volume || 0.6) * distAtten * volumeMult);
    if (finalVol <= 0.015) return false;

    // Select primary or alternate buffer (e.g. AR-15 vs AK-47)
    let bufKey = profileKey;
    if (prof.altUrl && distance > 8 && Math.random() < 0.5 && this.buffers.has(`${profileKey}_alt`)) {
      bufKey = `${profileKey}_alt`;
    }
    const buf = this.buffers.get(bufKey);
    if (!buf) return false;

    const now = this.ctx.currentTime + startTimeOffset;
    const jitter = prof.pitchJitter ? 1 + (Math.random() * 2 - 1) * prof.pitchJitter : 1.0;
    const rate = Math.max(0.4, (prof.pitch || 1.0) * jitter * pitchMult);

    // Enforce strict maxDuration & smooth fadeOut from `AUDIO_PACK`
    const dur = Math.min(buf.duration / rate, prof.maxDuration || 0.25);
    const fade = Math.min(dur * 0.65, prof.fadeOut || 0.06);
    const fadeStart = Math.max(0.008, dur - fade);

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.setValueAtTime(rate, now);

    // Outdoor air-absorption lowpass filter
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const cutoff =
      distance <= 4
        ? 18000
        : Math.max(950, 15500 * Math.pow(1 - distRatio, 1.5));
    filter.frequency.setValueAtTime(cutoff, now);
    filter.Q.setValueAtTime(0.6, now);

    // Tight amplitude envelope (guarantees zero lingering tail past `maxDuration`)
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(finalVol, now);
    gain.gain.setValueAtTime(finalVol, now + fadeStart);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + dur);

    src.connect(filter);
    filter.connect(gain);

    if (typeof this.ctx.createStereoPanner === 'function' && Math.abs(pan) > 0.01) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-0.9, Math.min(0.9, pan)), now);
      gain.connect(panner);
      panner.connect(this.masterBus);
    } else {
      gain.connect(this.masterBus);
    }

    src.start(now, 0, dur + 0.01);
    src.stop(now + dur + 0.015);
    return true;
  }

  playGunshot(type = 'rifle', distance = 0, pan = 0) {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    if (this._activeVoices > 24 && distance > 30) return;

    const profileKey = this.profiles[type] ? type : 'rifle';
    const played = this.playProfile(profileKey, distance, pan);

    if (played) {
      this._activeVoices++;
      const durMs = Math.round(((this.profiles[profileKey] && this.profiles[profileKey].maxDuration) || 0.22) * 1000);
      setTimeout(() => {
        this._activeVoices = Math.max(0, this._activeVoices - 1);
      }, durMs);

      // Local sniper bolt-action cycle
      if (type === 'sniper' && distance === 0) {
        this.playProfile('reload_sniper', 0, 0, 0.28);
      }
    } else {
      this.playFallbackDryShot(0.35, distance);
    }
  }

  /**
   * 120mm / 125mm Main Battle Tank Cannon — uses packaged `armor.tank_cannon` (0.38s tight punch!)
   */
  playTankCannon(distance = 0, pan = 0) {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    if (!this.playProfile('tank_cannon', distance, pan)) {
      this.playFallbackDryShot(0.55, distance);
    }
  }

  playBulletWhiz(distance = 8, pan = 0) {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    const nowPerf = performance.now();
    if (nowPerf - this._lastWhizTime < 150) return;
    this._lastWhizTime = nowPerf;

    const volScale = Math.max(0.15, Math.min(0.75, 1 - distance / 28));
    this.playProfile('weapon_click', distance, pan, 0, volScale, 1.45);
  }

  playRocketLaunch(distance = 0, pan = 0) {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    if (!this.playProfile('rpg_launch', distance, pan)) {
      this.playFallbackDryShot(0.45, distance);
    }
  }

  playExplosion(distance = 0, pan = 0) {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    if (!this.playProfile('explosion', distance, pan)) {
      this.playFallbackDryShot(0.55, distance);
    }
  }

  playHitmarker(mode = 'normal') {
    this.init();
    if (!this.ctx || !this.masterBus) return;

    if (mode === 'armor') {
      if (this.playProfile('armor_ricochet', 0, 0)) return;
    } else {
      const pitchMult = mode === 'headshot' || mode === 'kill' ? 1.28 : 1.0;
      if (this.playProfile('weapon_click', 0, 0, 0, 0.95, pitchMult)) return;
    }

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(mode === 'headshot' ? 1650 : 1180, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.035);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.002, now + 0.038);
    osc.connect(gain);
    gain.connect(this.masterBus);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  playReload() {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    if (!this.playProfile('reload_rifle', 0, 0)) {
      this.playProfile('weapon_click', 0, 0);
    }
  }

  playBuildHammer() {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    if (!this.playProfile('weapon_click', 0, 0, 0, 1.1, 0.65)) {
      this.playFallbackDryShot(0.25, 0);
    }
  }

  playRadioBeep(isIncoming = true) {
    this.init();
    if (!this.ctx || !this.masterBus) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isIncoming ? 1420 : 1680, now);
    osc.frequency.setValueAtTime(isIncoming ? 1850 : 1240, now + 0.035);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.002, now + 0.075);
    osc.connect(gain);
    gain.connect(this.masterBus);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  playObjectiveCaptured(isFriendly = true) {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    this.playRadioBeep(isFriendly);
  }

  playFallbackDryShot(vol = 0.35, distance = 0) {
    if (!this.ctx || !this.masterBus) return;
    const now = this.ctx.currentTime;
    const dur = 0.08;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = distance > 40 ? 900 : 1400;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol * 0.45, now);
    g.gain.exponentialRampToValueAtTime(0.002, now + dur);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.masterBus);
    src.start(now);
  }
}

export const sound = new SoundManager();
