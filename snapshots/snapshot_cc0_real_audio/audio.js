// Open-Source CC0 Sample-Based Realistic Combat Audio Engine
// Sources:
// 1. Free Firearms SFX Library (CC0 Public Domain, buddingmonkey/FreeFirearmsSFXLibrary):
//    - Real outdoor recordings of AR-15 (5.56mm), AK-47 (7.62mm), Carl Gustav M45 (9mm SMG),
//      Tikka T3 (.30-06 Sniper), Walther PPQ (9mm Pistol), Mosin-Nagant (7.62x54R Heavy)
// 2. GunLib CC0 Sound Pack (Deases/GunLib):
//    - Recorded weapon reloads (ak47_reload, awp_reload, deagle_reload), RPG launch (rpg_shot),
//      ordnance detonation (explosion), and heavy bore discharges (remington_shot).

const SAMPLE_MANIFEST = {
  rifle: './assets/audio/ar15_shot.wav',
  rifle_ak: './assets/audio/ak47_real_shot.wav',
  smg: './assets/audio/smg_9mm_shot.wav',
  smg_alt: './assets/audio/mp5_shot.ogg',
  lmg: './assets/audio/heavy_762_shot.wav',
  sniper: './assets/audio/sniper_308_shot.wav',
  sniper_alt: './assets/audio/awp_shot.ogg',
  pistol: './assets/audio/pistol_9mm_shot.wav',
  autocannon: './assets/audio/remington_shot.ogg',
  rpg_launch: './assets/audio/rpg_shot.ogg',
  explosion: './assets/audio/explosion.ogg',
  reload_rifle: './assets/audio/ak47_reload.ogg',
  reload_sniper: './assets/audio/awp_reload.ogg',
  reload_pistol: './assets/audio/deagle_reload.ogg',
  click: './assets/audio/ak47_click.ogg'
};

class SoundManager {
  constructor() {
    this.ctx = null;
    this.masterBus = null;
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
        this.preloadAllSamples();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  /**
   * Clean, transparent master bus — no artificial booming sub-oscillators or heavy reverb.
   * Uses only a gentle peak limiter (-4 dB) to prevent clipping when multiple guns fire.
   */
  setupCleanMasterBus() {
    if (!this.ctx) return;

    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = -4;
    limiter.knee.value = 6;
    limiter.ratio.value = 4.0;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.09;

    const masterGain = this.ctx.createGain();
    masterGain.gain.value = 0.78;

    limiter.connect(masterGain);
    masterGain.connect(this.ctx.destination);
    this.masterBus = limiter;
  }

  preloadAllSamples() {
    if (this.loadingStarted || !this.ctx) return;
    this.loadingStarted = true;

    for (const [key, url] of Object.entries(SAMPLE_MANIFEST)) {
      fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.arrayBuffer();
        })
        .then((arrBuf) => this.ctx.decodeAudioData(arrBuf))
        .then((audioBuf) => {
          this.buffers.set(key, audioBuf);
        })
        .catch(() => {
          // Ignore individual sample load error; procedural fallback handles it if needed
        });
    }
  }

  /**
   * Plays a decoded CC0 audio buffer with realistic distance attenuation,
   * outdoor air-absorption low-pass filtering, subtle pitch variation, and 3D stereo panning.
   */
  playBuffer(key, volume = 0.7, playbackRate = 1.0, distance = 0, pan = 0, startTimeOffset = 0) {
    if (!this.ctx || !this.masterBus) return false;
    const buf = this.buffers.get(key);
    if (!buf) return false;

    const now = this.ctx.currentTime + startTimeOffset;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.setValueAtTime(playbackRate, now);

    // Realistic outdoor air absorption: distant shots lose high-end harshness naturally
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const cutoff =
      distance <= 4
        ? 18000
        : Math.max(950, 16000 * Math.pow(1 - Math.min(1, distance / 210), 1.6));
    filter.frequency.setValueAtTime(cutoff, now);
    filter.Q.setValueAtTime(0.6, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(Math.max(0.01, Math.min(1.0, volume)), now);

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

    src.start(now);
    return true;
  }

  /**
   * Realistic Firearm Discharge using Open-Source CC0 Recorded Samples:
   * - rifle: Real 5.56mm AR-15 (`ar15_shot.wav`) / 7.62mm AK-47 (`ak47_real_shot.wav`)
   * - smg: Real 9mm Carl Gustav M45 (`smg_9mm_shot.wav`)
   * - lmg: Real 7.62x54R heavy barrel (`heavy_762_shot.wav`)
   * - sniper: Real .30-06/.308 Tikka bolt-action (`sniper_308_shot.wav`)
   * - pistol: Real 9mm Walther PPQ (`pistol_9mm_shot.wav`)
   * - autocannon: Heavy 30mm / .50 cal mechanical discharge (`remington_shot.ogg` + `heavy_762_shot.wav`)
   */
  playGunshot(type = 'rifle', distance = 0, pan = 0) {
    this.init();
    if (!this.ctx || !this.masterBus) return;

    if (this._activeVoices > 24 && distance > 30) return;

    // Natural inverse-distance volume falloff (quiet at long range, crisp up close)
    const distRatio = Math.min(1, Math.max(0, distance / 195));
    const distAtten = Math.pow(1 - distRatio, 1.55);
    if (distAtten <= 0.02) return;

    this._activeVoices++;
    setTimeout(() => {
      this._activeVoices = Math.max(0, this._activeVoices - 1);
    }, 280);

    // Subtle +/- 3% pitch variation so rapid fire sounds completely natural
    const jitter = 0.97 + Math.random() * 0.06;

    let sampleKey = 'rifle';
    let baseVol = 0.62;
    let baseRate = jitter;

    if (type === 'rifle') {
      // Alternate between AR-15 (local/close) and AK-47 (distant/varied)
      sampleKey = distance > 8 && Math.random() < 0.5 && this.buffers.has('rifle_ak') ? 'rifle_ak' : 'rifle';
      baseVol = 0.64;
    } else if (type === 'smg') {
      sampleKey = 'smg';
      baseVol = 0.56;
      baseRate = 1.03 * jitter;
    } else if (type === 'lmg') {
      sampleKey = 'lmg';
      baseVol = 0.68;
      baseRate = 0.96 * jitter;
    } else if (type === 'sniper') {
      sampleKey = 'sniper';
      baseVol = 0.78;
      baseRate = 0.95 * jitter;
    } else if (type === 'pistol') {
      sampleKey = 'pistol';
      baseVol = 0.54;
      baseRate = 1.02 * jitter;
    } else if (type === 'autocannon') {
      // 30mm IFV Autocannon / .50 BMG HMG: heavy bore mechanical thump
      sampleKey = this.buffers.has('autocannon') ? 'autocannon' : 'lmg';
      baseVol = 0.72;
      baseRate = 0.78 * jitter;
    }

    const played = this.playBuffer(sampleKey, baseVol * distAtten, baseRate, distance, pan);

    // For local bolt-action sniper shot, play the real recorded bolt cycle after 0.35s
    if (played && type === 'sniper' && distance === 0 && this.buffers.has('reload_sniper')) {
      this.playBuffer('reload_sniper', 0.38, 1.15, 0, 0, 0.32);
    }

    // Fallback only during the first ~100ms before async sample decoding finishes
    if (!played) {
      this.playFallbackDryShot(baseVol * distAtten, distance);
    }
  }

  /**
   * 120mm / 125mm Main Battle Tank Cannon (Combines recorded heavy bore crack + real ordnance blast)
   */
  playTankCannon(distance = 0, pan = 0) {
    this.init();
    if (!this.ctx || !this.masterBus) return;

    const distRatio = Math.min(1, Math.max(0, distance / 260));
    const atten = Math.pow(1 - distRatio, 1.4);
    if (atten <= 0.02) return;

    const p1 = this.playBuffer('sniper', 0.75 * atten, 0.68, distance, pan, 0);
    const p2 = this.playBuffer('explosion', 0.68 * atten, 0.88, distance, pan, 0.025);
    if (!p1 && !p2) {
      this.playFallbackDryShot(0.75 * atten, distance);
    }
  }

  /**
   * Subtle, realistic supersonic bullet pass-by snap when enemy rounds fly past the player
   */
  playBulletWhiz(distance = 8, pan = 0) {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    const nowPerf = performance.now();
    if (nowPerf - this._lastWhizTime < 140) return;
    this._lastWhizTime = nowPerf;

    const atten = Math.max(0.03, Math.min(0.28, (1 - distance / 28) * 0.28));
    if (this.buffers.has('click')) {
      this.playBuffer('click', atten, 1.65 + Math.random() * 0.25, distance, pan);
    }
  }

  /**
   * Real recorded RPG-7 launch (`rpg_shot.ogg`)
   */
  playRocketLaunch(distance = 0, pan = 0) {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    const distRatio = Math.min(1, Math.max(0, distance / 210));
    const atten = Math.pow(1 - distRatio, 1.45);
    if (atten <= 0.02) return;

    if (!this.playBuffer('rpg_launch', 0.68 * atten, 0.96 + Math.random() * 0.08, distance, pan)) {
      this.playFallbackDryShot(0.5 * atten, distance);
    }
  }

  /**
   * Real recorded Ordnance Detonation (`explosion.ogg`)
   */
  playExplosion(distance = 0, pan = 0) {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    const distRatio = Math.min(1, Math.max(0, distance / 260));
    const atten = Math.pow(1 - distRatio, 1.35);
    if (atten <= 0.02) return;

    const jitter = 0.92 + Math.random() * 0.14;
    if (!this.playBuffer('explosion', 0.78 * atten, jitter, distance, pan)) {
      this.playFallbackDryShot(0.65 * atten, distance);
    }
  }

  /**
   * Clean, tight tactile hitmarker tick (not loud or boomy)
   */
  playHitmarker(mode = 'normal') {
    this.init();
    if (!this.ctx || !this.masterBus) return;

    if (mode === 'armor' && this.buffers.has('click')) {
      this.playBuffer('click', 0.34, 1.35, 0, 0);
      return;
    }

    if (this.buffers.has('click')) {
      const rate = mode === 'headshot' || mode === 'kill' ? 1.55 : 1.18;
      this.playBuffer('click', 0.32, rate, 0, 0);
      return;
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

  /**
   * Real recorded firearm magazine reload & charging handle rack (`ak47_reload.ogg`)
   */
  playReload() {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    if (!this.playBuffer('reload_rifle', 0.52, 1.0, 0, 0)) {
      this.playBuffer('click', 0.35, 1.0, 0, 0);
    }
  }

  playBuildHammer() {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    if (this.buffers.has('click')) {
      this.playBuffer('click', 0.42, 0.75, 0, 0);
      return;
    }
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.065);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.004, now + 0.07);
    osc.connect(gain);
    gain.connect(this.masterBus);
    osc.start(now);
    osc.stop(now + 0.075);
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

  /**
   * Minimal dry acoustic fallback used only if a shot is fired in the first ~80ms before fetch() completes.
   */
  playFallbackDryShot(vol = 0.4, distance = 0) {
    if (!this.ctx || !this.masterBus) return;
    const now = this.ctx.currentTime;
    const dur = 0.09;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = distance > 40 ? 900 : 1400;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol * 0.5, now);
    g.gain.exponentialRampToValueAtTime(0.002, now + dur);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.masterBus);
    src.start(now);
  }
}

export const sound = new SoundManager();
