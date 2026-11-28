// ============================================================================
// SOUND MANAGER, SPATIAL CONVOLUTION REVERB & GENERAL MIDI MIXER
// (src/audio/SoundManager.js)
// - 0-100 Master + Category volume mixing (weapons, explosions, vehicles, radio, music)
// - Multi-layer CC0 firearm & anti-materiel cannon playback ("Crack + Thump + Tail")
// - Dynamic 3-Space WebAudio ConvolverNode Reverb ('open_valley', 'urban_canyon', 'indoor_room')
// - Speed-of-Sound (343 m/s) delayed distant explosions, tank cannons & sniper thunder
// - Supersonic N-Wave ballistic bullet crack + Doppler pass-by whip
// - Continuous procedural Aircraft & Ground Vehicle (Humvee, Tank, IFV, Moto) engines
// - Adaptive General MIDI Combat Soundtrack & Orchestral Stingers (MidiSynthEngine)
// ============================================================================

import { AUDIO_PACK, FLAT_AUDIO_PROFILES } from './audio-pack.js?v=150';
import { AUDIO } from '../config.js?v=150';
import { MidiSynthEngine } from './MidiSynthEngine.js?v=150';

const AUDIO_STORAGE_KEY = 'bb_audio_settings_v1';
const SPEED_OF_SOUND = AUDIO.SPEED_OF_SOUND_MPS || 343;

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

    // Spatial Environment & Convolution Reverb State
    this._reverbNodes = null;
    this._reverbCtx = null;
    this.currentEnvironment = 'open_valley'; // 'open_valley' | 'urban_canyon' | 'indoor_room'
    this._lastEnvCheckMs = 0;
    this._combatPulseUntilMs = 0;

    this.volumes = {
      master: AUDIO.DEFAULT_MASTER_VOLUME ?? 80,
      weapons: AUDIO.DEFAULT_WEAPONS_VOLUME ?? 85,
      explosions: AUDIO.DEFAULT_EXPLOSIONS_VOLUME ?? 85,
      vehicles: AUDIO.DEFAULT_VEHICLES_VOLUME ?? 80,
      radio: AUDIO.DEFAULT_RADIO_VOLUME ?? 80,
      music: AUDIO.DEFAULT_MUSIC_VOLUME ?? 65,
      reverbEnabled: true,
      muted: false
    };
    this.loadAudioSettings();

    // Adaptive General MIDI Combat Soundtrack & Stinger Engine
    this.midiEngine = new MidiSynthEngine(this);
  }

  get enabled() {
    return !this.volumes.muted;
  }

  get muted() {
    return Boolean(this.volumes.muted);
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
      this.volumes.vehicles = clampVol(parsed.vehicles, AUDIO.DEFAULT_VEHICLES_VOLUME ?? 80);
      this.volumes.radio = clampVol(parsed.radio, AUDIO.DEFAULT_RADIO_VOLUME ?? 80);
      this.volumes.music = clampVol(parsed.music, AUDIO.DEFAULT_MUSIC_VOLUME ?? 65);
      if (typeof parsed.reverbEnabled === 'boolean') {
        this.volumes.reverbEnabled = parsed.reverbEnabled;
      }
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
    this.midiEngine?.syncVolume();
  }

  getCategoryMult(category) {
    if (category === 'vehicles' && this.volumes.vehicles === undefined) {
      return (this.volumes.weapons ?? 85) / 100;
    }
    return (this.volumes[category] ?? 80) / 100;
  }

  getCategoryGain(category) {
    return this.getCategoryMult(category);
  }

  setVolume(category, val0to100) {
    const clamped = Math.max(0, Math.min(100, Math.round(Number(val0to100) || 0)));
    if (
      category === 'master' ||
      category === 'weapons' ||
      category === 'explosions' ||
      category === 'vehicles' ||
      category === 'radio' ||
      category === 'music'
    ) {
      this.volumes[category] = clamped;
    }
    this.updateMasterGain();
    this.saveAudioSettings();
    return this.volumes[category];
  }

  getVolume(category = 'master') {
    if (category === 'muted') return Boolean(this.volumes.muted);
    if (category === 'reverbEnabled') return this.volumes.reverbEnabled !== false;
    return this.volumes[category] ?? 80;
  }

  setReverbEnabled(enabled) {
    this.volumes.reverbEnabled = Boolean(enabled);
    this._syncReverbBusWeights();
    this.saveAudioSettings();
    return this.volumes.reverbEnabled;
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
      vehicles: AUDIO.DEFAULT_VEHICLES_VOLUME ?? 80,
      radio: AUDIO.DEFAULT_RADIO_VOLUME ?? 80,
      music: AUDIO.DEFAULT_MUSIC_VOLUME ?? 65,
      reverbEnabled: true,
      muted: false
    };
    this.updateMasterGain();
    this._syncReverbBusWeights();
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
        this.setupReverbSystem();
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
    this.masterGain = masterGain;
  }

  // ==========================================================================
  // 3-SPACE CONVOLUTION REVERB ENGINE (Open Valley / Urban Canyon / Indoor)
  // Generates realistic stereo acoustic Impulse Responses (IRs) on a shared
  // ConvolverNode send bus — zero per-shot CPU cost!
  // ==========================================================================
  _buildImpulseResponseBuffer(kind = 'open_valley') {
    const sr = this.ctx.sampleRate || 44100;
    const dur = kind === 'indoor_room' ? 0.46 : kind === 'urban_canyon' ? 1.08 : 1.35;
    const len = Math.floor(sr * dur);
    const buf = this.ctx.createBuffer(2, len, sr);
    const chL = buf.getChannelData(0);
    const chR = buf.getChannelData(1);

    // Deterministic LCG so IRs are smooth and repeatable
    let s = kind === 'urban_canyon' ? 0x13579bdf : kind === 'indoor_room' ? 0x2468ace1 : 0x9e3779b9;
    const nextRand = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return (s / 4294967296) * 2 - 1;
    };

    let lpL = 0;
    let lpR = 0;
    const decayRate = kind === 'indoor_room' ? 8.2 : kind === 'urban_canyon' ? 3.5 : 2.55;
    const lpAlpha = kind === 'indoor_room' ? 0.34 : kind === 'urban_canyon' ? 0.24 : 0.14;

    for (let i = 0; i < len; i++) {
      const t = i / sr;
      // Leave 8ms pre-delay so direct transient stays razor-sharp
      if (t < 0.008) continue;
      const nL = nextRand();
      const nR = nextRand();
      lpL += lpAlpha * (nL - lpL);
      lpR += lpAlpha * (nR - lpR);
      const env = Math.exp(-(t - 0.008) * decayRate) * 0.26;
      chL[i] = lpL * env;
      chR[i] = lpR * env;
    }

    // Stamp discrete physical early reflections / skyscraper slapback taps!
    const taps =
      kind === 'urban_canyon'
        ? [
            [0.031, 0.46, 0.18],
            [0.054, 0.16, 0.44],
            [0.089, 0.36, 0.22],
            [0.136, 0.2, 0.34],
            [0.195, 0.25, 0.25],
            [0.275, 0.16, 0.18]
          ]
        : kind === 'indoor_room'
        ? [
            [0.009, 0.48, 0.32],
            [0.016, 0.3, 0.46],
            [0.025, 0.34, 0.28],
            [0.038, 0.22, 0.24]
          ]
        : [
            // Open Valley: subtle ground bounce + wide stereo hillside slapback
            [0.019, 0.28, 0.26],
            [0.118, 0.26, 0.14],
            [0.172, 0.14, 0.25],
            [0.268, 0.16, 0.17]
          ];

    for (const [tapSec, gainL, gainR] of taps) {
      const center = Math.floor(tapSec * sr);
      const spread = Math.floor(0.0045 * sr);
      for (let k = -spread; k <= spread; k++) {
        const idx = center + k;
        if (idx <= 0 || idx >= len) continue;
        const win = 0.5 * (1 + Math.cos((Math.PI * k) / spread));
        chL[idx] += nextRand() * gainL * win;
        chR[idx] += nextRand() * gainR * win;
      }
    }
    return buf;
  }

  setupReverbSystem() {
    if (!this.ctx || !this.masterBus || typeof this.ctx.createConvolver !== 'function') return;
    if (this._reverbNodes && this._reverbCtx === this.ctx) return;
    this._reverbCtx = this.ctx;

    try {
      const sendInput = this.ctx.createGain();
      sendInput.gain.value = 1.0;

      // High-pass at 120 Hz so reverb never muddies sub-bass explosions
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 120;
      sendInput.connect(hp);

      const makeSpaceBranch = (kind, initialGain) => {
        const conv = this.ctx.createConvolver();
        conv.buffer = this._buildImpulseResponseBuffer(kind);
        const wetGain = this.ctx.createGain();
        wetGain.gain.value = initialGain;
        hp.connect(conv);
        conv.connect(wetGain);
        wetGain.connect(this.masterBus);
        return { conv, wetGain };
      };

      const valley = makeSpaceBranch('open_valley', 0.42);
      const urban = makeSpaceBranch('urban_canyon', 0.0001);
      const indoor = makeSpaceBranch('indoor_room', 0.0001);

      this._reverbNodes = { sendInput, valley, urban, indoor };
      this._syncReverbBusWeights();
    } catch (_) {
      this._reverbNodes = null;
    }
  }

  _syncReverbBusWeights() {
    if (!this._reverbNodes || !this.ctx) return;
    const now = this.ctx.currentTime;
    const on = this.volumes.reverbEnabled !== false && !this.volumes.muted;
    const env = this.currentEnvironment || 'open_valley';

    const wValley = !on ? 0.0001 : env === 'open_valley' ? 0.44 : env === 'urban_canyon' ? 0.14 : 0.04;
    const wUrban = !on ? 0.0001 : env === 'urban_canyon' ? 0.52 : 0.0001;
    const wIndoor = !on ? 0.0001 : env === 'indoor_room' ? 0.48 : 0.0001;

    try {
      this._reverbNodes.valley.wetGain.gain.setTargetAtTime(wValley, now, 0.18);
      this._reverbNodes.urban.wetGain.gain.setTargetAtTime(wUrban, now, 0.18);
      this._reverbNodes.indoor.wetGain.gain.setTargetAtTime(wIndoor, now, 0.14);
    } catch (_) {
      this._reverbNodes.valley.wetGain.gain.value = wValley;
      this._reverbNodes.urban.wetGain.gain.value = wUrban;
      this._reverbNodes.indoor.wetGain.gain.value = wIndoor;
    }
  }

  connectToReverbSend(sourceNode, sendAmount = 0.28, startTime = null) {
    if (!this.ctx || !sourceNode || sendAmount <= 0.01 || this.volumes.reverbEnabled === false) {
      return null;
    }
    if (!this._reverbNodes || this._reverbCtx !== this.ctx) {
      this.setupReverbSystem();
    }
    if (!this._reverbNodes) return null;

    const sendGain = this.ctx.createGain();
    const t = startTime ?? this.ctx.currentTime;
    sendGain.gain.setValueAtTime(Math.min(0.95, sendAmount), t);
    sourceNode.connect(sendGain);
    sendGain.connect(this._reverbNodes.sendInput);
    return sendGain;
  }

  /**
   * Samples surrounding VoxelWorld building geometry at 4 Hz to smoothly blend between:
   * - 'indoor_room': Listener is inside a building footprint below roof height
   * - 'urban_canyon': Listener is surrounded by 2+ buildings within 48m (Downtown / Village street)
   * - 'open_valley': Open terrain, bridge, river valley, or aircraft cockpit
   */
  updateListenerEnvironment(listenerPos, world, inAircraft = false) {
    const wallMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (wallMs - this._lastEnvCheckMs < 240) return this.currentEnvironment;
    this._lastEnvCheckMs = wallMs;

    let nextEnv = 'open_valley';
    if (!inAircraft && listenerPos && world && Array.isArray(world.buildings)) {
      const px = listenerPos.x;
      const py = listenerPos.y || 0;
      const pz = listenerPos.z;
      let nearBuildings = 0;
      let insideFootprint = false;

      for (let i = 0; i < world.buildings.length; i++) {
        const b = world.buildings[i];
        if (!b || b.collapsed) continue;
        if (px >= b.minWx && px <= b.maxWx && pz >= b.minWz && pz <= b.maxWz) {
          const roofY = b.maxWy ?? b.roofY ?? 13.5;
          if (py + 0.8 < roofY) {
            insideFootprint = true;
            break;
          }
        }
        const cx = (b.minWx + b.maxWx) * 0.5;
        const cz = (b.minWz + b.maxWz) * 0.5;
        const dx = cx - px;
        const dz = cz - pz;
        if (dx * dx + dz * dz <= 48 * 48) {
          nearBuildings++;
        }
      }

      if (insideFootprint) {
        nextEnv = 'indoor_room';
      } else if (nearBuildings >= 2) {
        nextEnv = 'urban_canyon';
      }
    }

    if (nextEnv !== this.currentEnvironment) {
      this.currentEnvironment = nextEnv;
      this._syncReverbBusWeights();
    }
    return this.currentEnvironment;
  }

  /**
   * Main per-frame hook called from BattleBitGame.loop():
   * Updates both the 3D Acoustic Reverb Environment AND the Adaptive General MIDI Combat Soundtrack!
   */
  updateAdaptiveAudio(gameState = {}) {
    if (gameState.listenerPos && gameState.world) {
      this.updateListenerEnvironment(
        gameState.listenerPos,
        gameState.world,
        Boolean(gameState.inAircraft)
      );
    }
    if (this.midiEngine) {
      const wallMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const inCombat = Boolean(gameState.inCombat || wallMs < this._combatPulseUntilMs);
      this.midiEngine.updateAdaptiveMusic({
        ...gameState,
        inCombat
      });
    }
  }

  playMusicStinger(kind = 'victory') {
    this.init();
    this.midiEngine?.playStinger(kind);
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

  _createNoiseBuffer(durationSec = 2.0) {
    if (!this.ctx) return null;
    const sampleRate = this.ctx.sampleRate || 44100;
    const frameCount = Math.max(1024, Math.floor(sampleRate * durationSec));
    const buf = this.ctx.createBuffer(1, frameCount, sampleRate);
    const ch = buf.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < frameCount; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      ch[i] = (b0 + b1 + b2 + white * 0.22) * 0.16;
    }
    return buf;
  }

  _bindOneShotCleanup(src, terminalNode, trackVoice = false, extraNode = null) {
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
      if (extraNode) {
        try {
          extraNode.disconnect();
        } catch (_) {}
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
    trackVoice = false,
    occluded = false
  ) {
    if (!this.ctx || !this.masterBus) return false;
    const prof = this.profiles[profileKey] || this.profiles.rifle;
    if (!prof) return false;

    const maxRange = prof.maxRange || 280;
    if (distance >= maxRange) return false;

    const distRatio = Math.min(1, Math.max(0, distance / maxRange));
    // Realistic inverse-power falloff that stays audible across open valleys while keeping close shots crisp
    const distAtten = Math.pow(1 - distRatio, 1.45);
    const occlusionVolMult = occluded ? 0.62 : 1.0;
    const finalVol = Math.min(1.0, (prof.volume || 0.6) * distAtten * volumeMult * occlusionVolMult);
    if (finalVol <= 0.012) return false;

    let bufKey = profileKey;
    if (prof.altUrl && distance > 8 && Math.random() < 0.5 && this.buffers.has(`${profileKey}_alt`)) {
      bufKey = `${profileKey}_alt`;
    }
    const buf = this.buffers.get(bufKey);
    if (!buf) return false;

    const now = this.ctx.currentTime + Math.max(0, startTimeOffset);
    const jitter = prof.pitchJitter ? 1 + (Math.random() * 2 - 1) * prof.pitchJitter : 1.0;
    const rate = Math.max(0.4, (prof.pitch || 1.0) * jitter * pitchMult);

    const dur = Math.min(buf.duration / rate, prof.maxDuration || 0.65);
    const fade = Math.min(dur * 0.55, prof.fadeOut || 0.12);
    const fadeStart = Math.max(0.01, dur - fade);

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.setValueAtTime(rate, now);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    let cutoff =
      distance <= 5
        ? 19000
        : Math.max(720, 16500 * Math.pow(1 - distRatio, 1.45));
    if (occluded) {
      cutoff = Math.max(380, cutoff * 0.32); // Concrete wall / ridge acoustic low-pass occlusion!
    }
    filter.frequency.setValueAtTime(cutoff, now);
    filter.Q.setValueAtTime(0.65, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(finalVol, now);
    gain.gain.setValueAtTime(finalVol, now + fadeStart);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + dur);

    src.connect(filter);
    filter.connect(gain);

    let terminalNode = gain;
    if (typeof this.ctx.createStereoPanner === 'function' && Math.abs(pan) > 0.01) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-0.92, Math.min(0.92, pan)), now);
      gain.connect(panner);
      panner.connect(this.masterBus);
      terminalNode = panner;
    } else {
      gain.connect(this.masterBus);
    }

    // Spatial Wet Reverb Send: increases proportionally with distance & occlusion so distant gunfire blooms across the valley/city!
    const baseReverb = prof.reverbSend ?? 0.22;
    let reverbNode = null;
    if (baseReverb > 0.01) {
      const distWetBoost = 1.0 + distRatio * 0.85 + (occluded ? 0.35 : 0);
      reverbNode = this.connectToReverbSend(terminalNode, baseReverb * distWetBoost, now);
    }

    this._bindOneShotCleanup(src, terminalNode, trackVoice, reverbNode);
    src.start(now, 0, dur + 0.01);
    src.stop(now + dur + 0.015);
    return true;
  }

  // ==========================================================================
  // TACTICAL FOLEY & MICRO-SFX (Previously Missing Call Sites Restored!)
  // ==========================================================================
  playEmptyClick() {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    const catMult = Math.max(0.25, this.getCategoryMult('weapons'));
    if (this.playProfile('weapon_click', 0, 0, 0, 0.72 * catMult, 1.32)) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1480, now);
    osc.frequency.exponentialRampToValueAtTime(340, now + 0.028);
    g.gain.setValueAtTime(0.12 * catMult, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.032);
    osc.connect(g);
    g.connect(this.masterBus);
    this._bindOneShotCleanup(osc, g, false);
    osc.start(now);
    osc.stop(now + 0.035);
  }

  playWeaponSwitch() {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    const catMult = this.getCategoryMult('weapons');
    if (catMult <= 0.001) return;

    const now = this.ctx.currentTime;
    const noiseBuf = this._getSharedNoiseBuffer();
    if (noiseBuf) {
      // Tactical Cordura sling/holster cloth rustle + receiver safety click
      const src = this.ctx.createBufferSource();
      src.buffer = noiseBuf;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(920, now);
      bp.frequency.exponentialRampToValueAtTime(1650, now + 0.095);
      bp.Q.value = 1.8;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(0.095 * catMult, now + 0.025);
      g.gain.exponentialRampToValueAtTime(0.0008, now + 0.11);
      src.connect(bp);
      bp.connect(g);
      g.connect(this.masterBus);
      this._bindOneShotCleanup(src, g, false);
      src.start(now, Math.random() * 0.5, 0.115);
      src.stop(now + 0.12);
    }

    const clack = this.ctx.createOscillator();
    const cg = this.ctx.createGain();
    clack.type = 'triangle';
    clack.frequency.setValueAtTime(1120, now + 0.055);
    clack.frequency.exponentialRampToValueAtTime(480, now + 0.085);
    cg.gain.setValueAtTime(0.065 * catMult, now + 0.055);
    cg.gain.exponentialRampToValueAtTime(0.0008, now + 0.09);
    clack.connect(cg);
    cg.connect(this.masterBus);
    this._bindOneShotCleanup(clack, cg, false);
    clack.start(now + 0.055);
    clack.stop(now + 0.095);
  }

  /**
   * Subtle metallic brass shell-casing bounce (`220ms` after firing on hard urban/indoor ground).
   */
  playShellCasingBounce(isShell12G = false, delaySec = 0.24) {
    if (!this.ctx || !this.masterBus) return;
    const catMult = this.getCategoryMult('weapons');
    if (catMult <= 0.01) return;

    const t0 = this.ctx.currentTime + delaySec + Math.random() * 0.05;
    if (isShell12G) {
      // Plastic/brass 12-gauge hull hollow bounce
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(840 + Math.random() * 90, t0);
      osc.frequency.exponentialRampToValueAtTime(410, t0 + 0.045);
      g.gain.setValueAtTime(0.055 * catMult, t0);
      g.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.05);
      osc.connect(g);
      g.connect(this.masterBus);
      this._bindOneShotCleanup(osc, g, false);
      osc.start(t0);
      osc.stop(t0 + 0.055);
      return;
    }

    // Two crisp high-pitched brass casing clinks (primary impact + secondary bounce)
    [0, 0.085].forEach((offset, idx) => {
      const start = t0 + offset;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      const base = 3650 + Math.random() * 620;
      osc.frequency.setValueAtTime(base, start);
      osc.frequency.exponentialRampToValueAtTime(base * 0.88, start + 0.04);
      const amp = (idx === 0 ? 0.045 : 0.026) * catMult;
      g.gain.setValueAtTime(amp, start);
      g.gain.exponentialRampToValueAtTime(0.0006, start + 0.045);
      osc.connect(g);
      g.connect(this.masterBus);
      this._bindOneShotCleanup(osc, g, false);
      osc.start(start);
      osc.stop(start + 0.05);
    });
  }

  playGrenadeThrow(distance = 0, pan = 0) {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    const catMult = this.getCategoryMult('weapons');
    if (catMult <= 0.001) return;
    if (!this.playProfile('grenade_throw', distance, pan, 0, catMult)) {
      this.playMeleeSwing(distance, pan, false);
    }
  }

  playSmokeHiss(distance = 0, pan = 0) {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    const catMult = this.getCategoryMult('explosions');
    if (catMult <= 0.001) return;
    this.playProfile('smoke_hiss', distance, pan, 0, catMult);
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
      glottal.frequency.setValueAtTime(voicePitch * 1.15, now);
      glottal.frequency.exponentialRampToValueAtTime(voicePitch * 0.54, now + dur);
    }

    const f1 = this.ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.setValueAtTime(kind === 'shield_wall' ? 580 : 740, now);
    f1.Q.setValueAtTime(4.2, now);

    const f2 = this.ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.setValueAtTime(kind === 'shield_wall' ? 1080 : 1320, now);
    f2.Q.setValueAtTime(3.5, now);

    const noiseBuf = this._getSharedNoiseBuffer();
    const breathSrc = this.ctx.createBufferSource();
    breathSrc.buffer = noiseBuf;
    const breathGain = this.ctx.createGain();
    breathGain.gain.setValueAtTime(0.42, now);

    const voiceGain = this.ctx.createGain();
    voiceGain.gain.setValueAtTime(0.001, now);
    voiceGain.gain.linearRampToValueAtTime(vol, now + 0.025);
    if (kind === 'retreat') {
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
      hornOsc1.frequency.setValueAtTime(220, now);
      hornOsc1.frequency.exponentialRampToValueAtTime(330, now + 0.28);
      hornOsc2.frequency.setValueAtTime(440, now);
      hornOsc2.frequency.exponentialRampToValueAtTime(660, now + 0.28);
    } else if (mode === 'defend') {
      hornOsc1.frequency.setValueAtTime(196, now);
      hornOsc2.frequency.setValueAtTime(392, now);
    } else {
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
    const revNode = this.connectToReverbSend(hornGain, 0.45, now);
    this._bindMultiShotCleanup([hornOsc1, hornOsc2], hornGain, false);
    if (revNode) {
      setTimeout(() => {
        try {
          revNode.disconnect();
        } catch (_) {}
      }, Math.ceil((dur + 0.2) * 1000));
    }

    hornOsc1.start(now);
    hornOsc2.start(now);
    hornOsc1.stop(now + dur + 0.02);
    hornOsc2.stop(now + dur + 0.02);

    const voiceKind =
      mode === 'charge' ? 'battle_cry' : mode === 'defend' ? 'shield_wall' : 'retreat';
    [-0.45, 0.38, -0.15].forEach((p, idx) => {
      setTimeout(() => {
        this.playMedievalSoldierVoice(voiceKind, 6 + idx * 4, p, true);
      }, 180 + idx * 115);
    });
  }

  playLaserRangefinderLock() {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    const now = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc1.type = 'sine';
    osc2.type = 'triangle';
    osc1.frequency.setValueAtTime(1680, now);
    osc1.frequency.setValueAtTime(2240, now + 0.055);
    osc2.frequency.setValueAtTime(840, now);
    osc2.frequency.setValueAtTime(1120, now + 0.055);
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.09, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0008, now + 0.14);
    osc1.connect(g);
    osc2.connect(g);
    g.connect(this.masterBus);
    this._bindMultiShotCleanup([osc1, osc2], g, false);
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.15);
    osc2.stop(now + 0.15);
  }

  playMarksmanBadgeStinger(grade = 'A') {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    const now = this.ctx.currentTime;
    const notes =
      grade === '★' || grade === 'S+'
        ? [659.25, 880, 1174.66, 1760]
        : grade === 'S'
        ? [587.33, 880, 1174.66]
        : grade === 'A'
        ? [523.25, 783.99]
        : [440, 659.25];
    notes.forEach((freq, idx) => {
      const t0 = now + idx * 0.055;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = idx === notes.length - 1 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0.001, t0);
      gain.gain.linearRampToValueAtTime(0.085, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.28);
      osc.connect(gain);
      gain.connect(this.masterBus);
      this._bindOneShotCleanup(osc, gain, false);
      osc.start(t0);
      osc.stop(t0 + 0.3);
    });
  }

  // ==========================================================================
  // 3-LAYER TACTICAL GUNFIRE ("CRACK + MUZZLE THUMP + CONVOLUTION TAIL")
  // ==========================================================================
  playGunshot(type = 'rifle', distance = 0, pan = 0, isSilenced = false, wepDef = null, occluded = false) {
    this.init();
    if (!this.ctx || !this.masterBus) return;

    // Strict Era Guard: In Medieval or Jurassic Era, NEVER play modern firearm gunshot sounds!
    const activeEra = (typeof window !== 'undefined' && (window.game?.world?.era || window.game?.activeEra)) || 'modern';
    if (activeEra === 'medieval' || activeEra === 'jurassic' || type === 'bow' || type === 'crossbow') {
      this.playBowTwang(distance, pan, type === 'crossbow');
      return;
    }

    if (this._activeVoices > AUDIO.MAX_ACTIVE_VOICES && distance > AUDIO.VOICE_CULL_DIST) return;

    const catMult = this.getCategoryMult('weapons');
    if (catMult <= 0.001) return;

    if (distance <= 35) {
      const wallMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
      this._combatPulseUntilMs = Math.max(this._combatPulseUntilMs, wallMs + 6500);
    }

    // 1. Suppressed Firearms: Real CC0 suppressed rifle/pistol recording + subsonic baffle thump
    if (isSilenced) {
      const silKey = type === 'smg' || type === 'pistol' ? 'silenced_pistol' : 'silenced_rifle';
      const maxSilencedDist = 85;
      if (distance >= maxSilencedDist) return;
      const distRatio = Math.min(1, Math.max(0, distance / maxSilencedDist));
      const atten = Math.pow(1 - distRatio, 1.75);
      const playedSil = this.playProfile(silKey, distance, pan, 0, catMult, 1.0, true, occluded);
      if (!playedSil) {
        this.playProfile('weapon_click', distance, pan, 0, 0.55 * atten * catMult, 1.35);
      }
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(68, now + 0.065);
      gain.gain.setValueAtTime(0.24 * atten * catMult, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.072);
      osc.connect(gain);
      gain.connect(this.masterBus);
      this._bindOneShotCleanup(osc, gain, !playedSil);
      osc.start(now);
      osc.stop(now + 0.075);
      return;
    }

    // 2. Resolve Specific Caliber Audio Profile (AMR .50 BMG / 20mm, 12G Shotgun, .50 AE Magnum, .338 Heavy Sniper, 7.62 Heavy Rifle)
    let resolvedKey = wepDef?.audioProfile || type || 'rifle';
    if (!this.profiles[resolvedKey]) {
      resolvedKey = this.profiles[type] ? type : 'rifle';
    }

    // Speed-of-Sound acoustic propagation delay on distant heavy shots (>45m)
    const speedDelay =
      distance > 45 && (resolvedKey === 'amr' || resolvedKey === 'sniper' || resolvedKey === 'sniper_heavy')
        ? Math.min(2.6, distance / SPEED_OF_SOUND)
        : 0;

    const played = this.playProfile(resolvedKey, distance, pan, speedDelay, catMult, 1.0, true, occluded);
    const prof = this.profiles[resolvedKey] || this.profiles.rifle;

    // 3. Muzzle Overpressure Sub-Bass Chest Thump Layer (gives shots visceral physical weight!)
    if (distance < 55 && (prof.subPunchVol || 0) > 0.04) {
      const now = this.ctx.currentTime + speedDelay;
      const closeAtten = Math.pow(Math.max(0, 1 - distance / 55), 1.6);
      const subVol = prof.subPunchVol * closeAtten * catMult;
      if (subVol > 0.015) {
        const subOsc = this.ctx.createOscillator();
        const subGain = this.ctx.createGain();
        subOsc.type = 'sine';
        const startHz = prof.subPunchHz || 90;
        const subDur = resolvedKey === 'amr' ? 0.28 : resolvedKey === 'shotgun' || resolvedKey === 'sniper_heavy' ? 0.2 : 0.12;
        subOsc.frequency.setValueAtTime(startHz, now);
        subOsc.frequency.exponentialRampToValueAtTime(Math.max(26, startHz * 0.36), now + subDur);
        subGain.gain.setValueAtTime(subVol, now);
        subGain.gain.exponentialRampToValueAtTime(0.0008, now + subDur + 0.02);
        subOsc.connect(subGain);
        if (typeof this.ctx.createStereoPanner === 'function' && Math.abs(pan) > 0.02) {
          const panner = this.ctx.createStereoPanner();
          panner.pan.setValueAtTime(Math.max(-0.9, Math.min(0.9, pan)), now);
          subGain.connect(panner);
          panner.connect(this.masterBus);
          this._bindOneShotCleanup(subOsc, panner, false);
        } else {
          subGain.connect(this.masterBus);
          this._bindOneShotCleanup(subOsc, subGain, false);
        }
        subOsc.start(now);
        subOsc.stop(now + subDur + 0.03);
      }
    }

    // 4. Distant Valley Thunder Tail for Anti-Materiel & Heavy Sniper Shots!
    if (resolvedKey === 'amr' || (distance > 90 && (resolvedKey === 'sniper' || resolvedKey === 'sniper_heavy'))) {
      const tailDelay = speedDelay + 0.08;
      const tailVol = (resolvedKey === 'amr' ? 0.52 : 0.32) * catMult;
      this.playProfile('distant_boom', Math.min(distance, 900), pan * 0.65, tailDelay, tailVol, 1.18, false, true);
    }

    if (played) {
      if (distance === 0) {
        // Bolt cycling on bolt-action snipers + subtle brass/hull casing bounce on semi/bolt/shotgun!
        if ((type === 'sniper' || resolvedKey === 'sniper_heavy' || resolvedKey === 'amr') && (!wepDef || wepDef.isBoltSniper)) {
          this.playProfile('reload_sniper', 0, 0, 0.32, catMult * 0.85);
        }
        if (!wepDef?.auto || resolvedKey === 'shotgun' || resolvedKey === 'amr') {
          this.playShellCasingBounce(resolvedKey === 'shotgun', resolvedKey === 'amr' ? 0.34 : 0.24);
        }
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
    const atten = Math.pow(1 - distRatio, 1.35);
    if (atten <= 0.015) return;

    const speedDelay = distance > 35 ? Math.min(2.8, distance / SPEED_OF_SOUND) : 0;
    const played = this.playProfile('tank_cannon', distance, pan, speedDelay, catMult);
    if (distance > 45) {
      this.playProfile('distant_boom', distance, pan * 0.7, speedDelay + 0.09, 0.75 * catMult, 0.92);
    }

    const now = this.ctx.currentTime + speedDelay;
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(118, now);
    subOsc.frequency.exponentialRampToValueAtTime(28, now + 0.38);
    subGain.gain.setValueAtTime(0.42 * atten * catMult, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.44);
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
    subOsc.stop(now + 0.45);

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

    const distRatio = Math.min(1, Math.max(0, distance / 420));
    const atten = Math.pow(1 - distRatio, 1.35);
    if (atten <= 0.02) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(210, now);
    osc.frequency.exponentialRampToValueAtTime(58, now + 0.72);
    gain.gain.setValueAtTime(0.22 * atten * catMult, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.76);
    osc.connect(gain);
    gain.connect(this.masterBus);
    this._bindOneShotCleanup(osc, gain, false);
    osc.start(now);
    osc.stop(now + 0.78);
  }

  /**
   * True Supersonic N-Wave Ballistic Crack + Doppler Whip (`playBulletWhiz`):
   * Incoming enemy supersonic rounds snap sharply across stereo space and trigger combat music tension!
   */
  playBulletWhiz(distance = 8, pan = 0) {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    const catMult = this.getCategoryMult('weapons');
    if (catMult <= 0.001) return;

    const nowPerf = performance.now();
    if (nowPerf - this._lastWhizTime < AUDIO.WHIZ_COOLDOWN_MS) return;
    this._lastWhizTime = nowPerf;
    this._combatPulseUntilMs = Math.max(this._combatPulseUntilMs, nowPerf + 8500);

    const proximity = Math.max(0, Math.min(1, 1 - distance / 28));
    const volScale = (0.24 + proximity * 0.68) * catMult;
    const pitchShift = 0.92 + proximity * 0.22;
    const played = this.playProfile('bullet_crack', Math.min(distance, 34), pan, 0, volScale, pitchShift);

    // Layer live procedural supersonic whip-snap + Doppler pass-by sweep so close misses (<6m) crackle!
    const now = this.ctx.currentTime;
    const whipOsc = this.ctx.createOscillator();
    const whipGain = this.ctx.createGain();
    whipOsc.type = proximity > 0.55 ? 'sawtooth' : 'triangle';
    whipOsc.frequency.setValueAtTime(2800 + proximity * 1100, now);
    whipOsc.frequency.exponentialRampToValueAtTime(480, now + 0.095);
    const whipAmp = (played ? 0.14 : 0.28) * volScale;
    whipGain.gain.setValueAtTime(whipAmp, now);
    whipGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.1);
    whipOsc.connect(whipGain);

    if (typeof this.ctx.createStereoPanner === 'function' && Math.abs(pan) > 0.01) {
      const panner = this.ctx.createStereoPanner();
      const clampedPan = Math.max(-0.95, Math.min(0.95, pan));
      panner.pan.setValueAtTime(clampedPan, now);
      panner.pan.linearRampToValueAtTime(-clampedPan * 0.35, now + 0.1);
      whipGain.connect(panner);
      panner.connect(this.masterBus);
      this._bindOneShotCleanup(whipOsc, panner, false);
    } else {
      whipGain.connect(this.masterBus);
      this._bindOneShotCleanup(whipOsc, whipGain, false);
    }
    whipOsc.start(now);
    whipOsc.stop(now + 0.11);
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

  /**
   * Multi-Layer Speed-of-Sound (`343 m/s`) Explosion Acoustics:
   * - Close blasts (<35m): Instantaneous concussion crack + sub-bass shockwave + environmental tail
   * - Distant blasts (35m - 900m): Realistic speed-of-sound delay (`distance / 343` s) + rolling valley thunder!
   */
  playExplosion(distance = 0, pan = 0, scale = 1.0) {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    const catMult = this.getCategoryMult('explosions');
    if (catMult <= 0.001) return;

    if (scale <= 0.55) {
      this.playAutocannonImpact(distance, pan, scale);
      return;
    }

    const maxDist = AUDIO.EXPLOSION_MAX_DIST || 900;
    if (distance >= maxDist) return;
    const nowPerf = performance.now();
    if (nowPerf - this._lastExplosionTime < AUDIO.EXPLOSION_COOLDOWN_MS && distance > 18) return;
    this._lastExplosionTime = nowPerf;
    if (distance < 140) {
      this._combatPulseUntilMs = Math.max(this._combatPulseUntilMs, nowPerf + 9000);
    }

    const distRatio = Math.min(1, Math.max(0, distance / maxDist));
    const atten = Math.pow(1 - distRatio, 1.32);
    if (atten <= 0.015) return;

    const speedDelay = distance > 32 ? Math.min(2.75, distance / SPEED_OF_SOUND) : 0;
    const volMult = Math.min(1.35, Math.max(0.72, scale)) * catMult;
    const pitchMult = scale > 1.15 ? 0.86 : scale > 1.02 ? 0.93 : 1.0;

    let played = false;
    if (distance < 360) {
      played = this.playProfile('explosion', distance, pan, speedDelay, volMult, pitchMult);
      if (scale >= 1.1 && distance < 180) {
        this.playProfile('concussion_boom', distance, pan, speedDelay + 0.02, volMult * 0.78, pitchMult);
      }
    }
    if (distance >= 38) {
      const boomPlayed = this.playProfile(
        'distant_boom',
        distance,
        pan * 0.75,
        speedDelay + (distance < 360 ? 0.08 : 0),
        volMult * 0.92,
        pitchMult * 0.95
      );
      played = played || boomPlayed;
    }

    const now = this.ctx.currentTime + speedDelay;
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(98, now);
    subOsc.frequency.exponentialRampToValueAtTime(24, now + 0.46);
    subGain.gain.setValueAtTime(0.42 * atten * volMult, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.52);
    subOsc.connect(subGain);
    if (typeof this.ctx.createStereoPanner === 'function' && Math.abs(pan) > 0.02) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-0.9, Math.min(0.9, pan)), now);
      subGain.connect(panner);
      panner.connect(this.masterBus);
      this._bindOneShotCleanup(subOsc, panner, false);
    } else {
      subGain.connect(this.masterBus);
      this._bindOneShotCleanup(subOsc, subGain, false);
    }
    subOsc.start(now);
    subOsc.stop(now + 0.54);

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
    }

    // Crisp ZzFX-style dual-layer tactile hitmarker (meaty thud + headshot/kill metallic bell)
    const now = this.ctx.currentTime;
    const isKillOrHead = mode === 'headshot' || mode === 'kill';
    const thud = this.ctx.createOscillator();
    const tg = this.ctx.createGain();
    thud.type = 'triangle';
    thud.frequency.setValueAtTime(isKillOrHead ? 1920 : 1320, now);
    thud.frequency.exponentialRampToValueAtTime(340, now + 0.042);
    tg.gain.setValueAtTime(0.2 * catMult, now);
    tg.gain.exponentialRampToValueAtTime(0.001, now + 0.046);
    thud.connect(tg);
    tg.connect(this.masterBus);
    this._bindOneShotCleanup(thud, tg, false);
    thud.start(now);
    thud.stop(now + 0.05);

    if (isKillOrHead) {
      const bell = this.ctx.createOscillator();
      const bg = this.ctx.createGain();
      bell.type = 'sine';
      bell.frequency.setValueAtTime(mode === 'headshot' ? 2640 : 2120, now + 0.012);
      bell.frequency.exponentialRampToValueAtTime(1760, now + 0.14);
      bg.gain.setValueAtTime(0.14 * catMult, now + 0.012);
      bg.gain.exponentialRampToValueAtTime(0.0008, now + 0.15);
      bell.connect(bg);
      bg.connect(this.masterBus);
      this._bindOneShotCleanup(bell, bg, false);
      bell.start(now + 0.012);
      bell.stop(now + 0.16);
    }
  }

  playReload(wepDefOrKind = null) {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    const catMult = this.getCategoryMult('weapons');
    if (catMult <= 0.001) return;

    let reloadKey = 'reload_rifle';
    if (typeof wepDefOrKind === 'string' && this.profiles[wepDefOrKind]) {
      reloadKey = wepDefOrKind;
    } else if (wepDefOrKind && typeof wepDefOrKind === 'object') {
      const def = wepDefOrKind;
      if (def.type === 'rpg' || def.type === 'stinger') reloadKey = 'reload_rpg';
      else if (def.audioProfile === 'shotgun' || def.pellets > 1) reloadKey = 'reload_shotgun';
      else if (def.soundType === 'pistol' || def.audioProfile === 'magnum') reloadKey = 'reload_pistol';
      else if (def.soundType === 'sniper' || def.isBoltSniper) reloadKey = 'reload_sniper';
    }

    if (!this.playProfile(reloadKey, 0, 0, 0, catMult)) {
      if (!this.playProfile('reload_rifle', 0, 0, 0, catMult)) {
        this.playProfile('weapon_click', 0, 0, 0, catMult);
      }
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
    gain.gain.setValueAtTime(0.065 * catMult, now);
    gain.gain.exponentialRampToValueAtTime(0.002, now + 0.08);
    osc.connect(gain);
    gain.connect(this.masterBus);
    this._bindOneShotCleanup(osc, gain, false);
    osc.start(now);
    osc.stop(now + 0.085);
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

  playDelayedA10Brrrt(distance = 0, pan = 0) {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    const catMult = this.getCategoryMult('weapons');
    if (catMult <= 0.001 || distance > 1800) return;

    const nowPerf = performance.now();
    if (nowPerf - (this._lastBrrrtQueuedAt || 0) < 380) return;
    this._lastBrrrtQueuedAt = nowPerf;

    const speedOfSoundDelaySec = Math.min(3.2, Math.max(0, distance / SPEED_OF_SOUND));
    const startAt = this.ctx.currentTime + speedOfSoundDelaySec;
    const atten = Math.max(0.08, Math.pow(Math.max(0, 1 - distance / 1850), 1.25));
    const dur = 0.44;

    const oscLow = this.ctx.createOscillator();
    const oscHarm = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    oscLow.type = 'sawtooth';
    oscLow.frequency.setValueAtTime(65, startAt);
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

    let termNode = gain;
    if (typeof this.ctx.createStereoPanner === 'function' && Math.abs(pan) > 0.02) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), startAt);
      gain.connect(panner);
      panner.connect(this.masterBus);
      termNode = panner;
    } else {
      gain.connect(this.masterBus);
    }

    const revNode = this.connectToReverbSend(termNode, 0.45, startAt);
    this._bindOneShotCleanup(oscLow, termNode, false, revNode);
    oscLow.start(startAt);
    oscHarm.start(startAt);
    oscLow.stop(startAt + dur + 0.02);
    oscHarm.stop(startAt + dur + 0.02);
  }

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
    this.playMusicStinger(isFriendly ? 'objective_captured' : 'objective_lost');
  }

  playBuy() {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    this.playRadioBeep(true);
  }

  playCasePinTick(speedNorm = 0.5, isGoldTile = false) {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    const catMult = Math.max(0.25, this.getCategoryMult('radio'));
    const now = this.ctx.currentTime;

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
    const dur = 0.14;
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
    const rev = this.connectToReverbSend(g, 0.24, now);
    const offset = Math.random() * Math.max(0, 1.0 - dur - 0.02);
    this._bindOneShotCleanup(src, g, false, rev);
    src.start(now, offset, dur);
    src.stop(now + dur + 0.01);
  }

  // ==========================================================================
  // CONTINUOUS AIRCRAFT ENGINE SYNTHESIZER (Jets, CAS, Gunships, Helicopters)
  // ==========================================================================
  _ensureAircraftEngineGraph() {
    if (!this.ctx || !this.masterBus) return null;
    if (this._airEngineNodes) return this._airEngineNodes;

    const now = this.ctx.currentTime;
    const noiseBuf = this._createNoiseBuffer(2.0);

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

    const whineOsc = this.ctx.createOscillator();
    whineOsc.type = 'triangle';
    whineOsc.frequency.setValueAtTime(520, now);
    const whineGain = this.ctx.createGain();
    whineGain.gain.setValueAtTime(0.04, now);
    whineOsc.connect(whineGain);
    whineGain.connect(selfBusGain);

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
    const catMult = this.getCategoryMult('vehicles');
    if (catMult <= 0.001) {
      this._setAirParam(nodes.selfBusGain.gain, 'selfBus', 0.0001, now, 0.06);
      this._setAirParam(nodes.extBusGain.gain, 'extBus', 0.0001, now, 0.06);
      return;
    }

    if (isPilotingPlane) {
      const v = playerVehicle;
      const role = v.aircraftRole || 'fighter';
      const maxSpd = Math.max(25, v.maxSpeed || (v.speed || 62) * 1.35);
      const spdNorm = Math.max(0, Math.min(1.2, (v.forwardSpeed || 0) / maxSpd));
      const spool = Math.max(0.18, Math.min(1.0, v.engineSpool ?? Math.max(0.25, spdNorm)));
      const thr = typeof v.throttle === 'number' ? v.throttle : Math.max(0.25, spdNorm);
      const abBoost = wHeld ? 0.25 : 0;
      const power = Math.min(1.25, spool * 0.55 + thr * 0.45 + abBoost);

      const isHeliAudio = Boolean(
        v.isHelicopter || role === 'heli_transport' || role === 'heli_attack'
      );
      if (isHeliAudio) {
        if (nodes.coreOsc.type !== 'triangle') nodes.coreOsc.type = 'triangle';
        const heliCollective = wHeld ? 0.22 : 0;
        const heliPower = Math.min(1.15, 0.42 + thr * 0.42 + spdNorm * 0.22 + heliCollective);
        const bladeRateHz = role === 'heli_attack' ? 19.5 + heliPower * 3.2 : 17.2 + heliPower * 3.0;
        this._setAirParam(nodes.coreOsc.frequency, 'coreFreq', 48 + heliPower * 20, now, 0.06);
        this._setAirParam(nodes.coreFilter.frequency, 'coreFilt', 165 + heliPower * 125, now, 0.06);
        this._setAirParam(nodes.coreGain.gain, 'coreGain', 0.28, now, 0.06);
        this._setAirParam(nodes.bladeLfo.frequency, 'bladeFreq', bladeRateHz, now, 0.05);
        this._setAirParam(nodes.bladeDepth.gain, 'bladeDepth', 0.24 + spdNorm * 0.05, now, 0.05);
        this._setAirParam(nodes.whineOsc.frequency, 'whineFreq', 520 + heliPower * 165, now, 0.07);
        this._setAirParam(nodes.whineGain.gain, 'whineGain', 0.022 + heliPower * 0.014, now, 0.07);
        this._setAirParam(nodes.roarFilter.frequency, 'roarFilt', 195 + heliPower * 135, now, 0.06);
        this._setAirParam(nodes.roarGain.gain, 'roarGain', 0.14 + heliPower * 0.1, now, 0.06);
      } else {
        if (nodes.coreOsc.type !== 'sawtooth') nodes.coreOsc.type = 'sawtooth';
        if (role === 'wright_flyer') {
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
      }

      const targetSelfVol = Math.min(0.42, (0.16 + power * 0.18 + (wHeld ? 0.06 : 0)) * catMult);
      this._setAirParam(nodes.selfBusGain.gain, 'selfBus', targetSelfVol, now, 0.06);
    } else {
      this._setAirParam(nodes.selfBusGain.gain, 'selfBus', 0.0001, now, 0.08);
    }

    if (nearestExtPlane && listenerPos) {
      const distRatio = Math.min(1, Math.max(0, nearestExtDist / 450));
      const atten = Math.pow(1 - distRatio, 1.65);
      const spd = Math.max(10, nearestExtPlane.forwardSpeed || 45);
      const dx = nearestExtPlane.pos.x - listenerPos.x;
      const dz = nearestExtPlane.pos.z - listenerPos.z;
      const invD = 1 / Math.max(1, nearestExtDist);
      const vx = -Math.sin(nearestExtPlane.yaw || 0) * spd;
      const vz = -Math.cos(nearestExtPlane.yaw || 0) * spd;
      const radialVel = (dx * vx + dz * vz) * invD;
      const doppler = Math.max(0.68, Math.min(1.42, 1.0 - radialVel / 220));

      const extIsHeli = Boolean(
        nearestExtPlane.isHelicopter ||
          nearestExtPlane.aircraftRole === 'heli_transport' ||
          nearestExtPlane.aircraftRole === 'heli_attack'
      );
      if (extIsHeli) {
        const chopPulse = 0.72 + 0.28 * Math.sin(now * 20.0 * Math.PI * 2);
        this._setAirParam(nodes.extOsc.frequency, 'extOsc', 56 * doppler, now, 0.05);
        this._setAirParam(nodes.extLp.frequency, 'extLp', (165 + (1 - distRatio) * 190) * doppler, now, 0.05);
        this._setAirParam(nodes.extNoiseBp.frequency, 'extBp', (210 + (1 - distRatio) * 210) * doppler * chopPulse, now, 0.04);
      } else {
        this._setAirParam(nodes.extOsc.frequency, 'extOsc', 92 * doppler, now, 0.07);
        this._setAirParam(nodes.extLp.frequency, 'extLp', (280 + (1 - distRatio) * 520) * doppler, now, 0.07);
        this._setAirParam(nodes.extNoiseBp.frequency, 'extBp', (360 + (1 - distRatio) * 480) * doppler, now, 0.07);
      }

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

  // ==========================================================================
  // CONTINUOUS GROUND VEHICLE ENGINE SYNTHESIZER (Humvee, Tank, IFV, ATV, Moto)
  // ==========================================================================
  _isMotorizedGroundVehicle(v) {
    if (!v || v.dead || v.isAircraft) return false;
    const t = v.type;
    return (
      t === 'bike' ||
      t === 'atv' ||
      t === 'humvee' ||
      t === 'truck_transport' ||
      t === 'apc' ||
      t === 'aa' ||
      t === 'tank'
    );
  }

  _ensureGroundEngineGraph() {
    if (!this.ctx || !this.masterBus) return null;
    if (this._groundEngineNodes) return this._groundEngineNodes;

    const ctx = this.ctx;
    const noiseBuf = this._createNoiseBuffer(2.0);
    const outTarget = this.masterBus;

    const selfBusGain = ctx.createGain();
    selfBusGain.gain.value = 0.0001;
    selfBusGain.connect(outTarget);

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

    const extBusGain = ctx.createGain();
    extBusGain.gain.value = 0.0001;
    let extPanner = null;
    if (typeof ctx.createStereoPanner === 'function') {
      extPanner = ctx.createStereoPanner();
      extBusGain.connect(extPanner);
      extPanner.connect(outTarget);
    } else {
      extBusGain.connect(outTarget);
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
    if (typeof audioParam.setTargetAtTime === 'function') {
      audioParam.setTargetAtTime(targetVal, now, timeConst);
    } else {
      audioParam.value = targetVal;
    }
  }

  updateGroundVehicleEngineAudio(arg1, arg2, listenerPos, listenerYaw = 0) {
    const vehicles = Array.isArray(arg1) ? arg1 : Array.isArray(arg2) ? arg2 : null;
    const playerVeh = Array.isArray(arg1) ? arg2 : arg1;

    if (this.volumes.muted) {
      if (this._groundEngineNodes && this.ctx) {
        const t = this.ctx.currentTime;
        this._setGroundParam(this._groundEngineNodes.selfBusGain.gain, 'selfBus', 0.0001, t, 0.06);
        this._setGroundParam(this._groundEngineNodes.extBusGain.gain, 'extBus', 0.0001, t, 0.06);
      }
      return;
    }

    const catMult = this.getCategoryMult('vehicles');
    if (catMult <= 0.001) {
      if (this._groundEngineNodes && this.ctx) {
        const t = this.ctx.currentTime;
        this._setGroundParam(this._groundEngineNodes.selfBusGain.gain, 'selfBus', 0.0001, t, 0.06);
        this._setGroundParam(this._groundEngineNodes.extBusGain.gain, 'extBus', 0.0001, t, 0.06);
      }
      return;
    }

    const activePlayerGround = this._isMotorizedGroundVehicle(playerVeh) ? playerVeh : null;
    let nearestExtVeh = null;
    let nearestExtDistSq = 155 * 155;

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
      if (this._groundEngineNodes && this.ctx) {
        const t = this.ctx.currentTime;
        this._setGroundParam(this._groundEngineNodes.selfBusGain.gain, 'selfBus', 0.0001, t, 0.07);
        this._setGroundParam(this._groundEngineNodes.extBusGain.gain, 'extBus', 0.0001, t, 0.07);
      }
      return;
    }

    this.init();
    if (!this.ctx || this.ctx.state === 'suspended') return;
    const nodes = this._ensureGroundEngineGraph();
    if (!nodes) return;
    const now = this.ctx.currentTime;

    if (activePlayerGround) {
      const v = activePlayerGround;
      const spdAbs = Math.abs(v.forwardSpeed || 0);
      const maxSpd = Math.max(8, v.maxSpeed || 24);
      const spdRatio = Math.min(1.2, spdAbs / maxSpd);
      const rpmNorm =
        typeof v.engineRpm === 'number' && v.maxRpm > 1000
          ? Math.max(
              0,
              Math.min(
                1.12,
                (v.engineRpm - (v.idleRpm || 1200)) / Math.max(800, v.maxRpm - (v.idleRpm || 1200))
              )
            )
          : Math.min(1.05, spdRatio * 0.92 + (spdAbs > 0.5 ? 0.14 : 0.0));
      const loadBoost = v.boostActive || v.wheelieFactor > 0.15 ? 0.18 : 0;

      let coreHz = 52;
      let subHz = 26;
      let lpHz = 260;
      let whineHz = 400;
      let whineLvl = 0.01;
      let mechHz = 180;
      let mechLvl = 0.06;
      let masterVol = 0.18;

      if (v.type === 'bike') {
        const isEv = Boolean(v.isElectric || v.bikeEngine === 'electric_stealth');
        const isTwoStroke = Boolean(v.bikeEngine === 'two_stroke_race');
        if (isEv) {
          if (nodes.selfCoreOsc.type !== 'sine') nodes.selfCoreOsc.type = 'sine';
          coreHz = 145 + spdRatio * 560;
          subHz = 72 + spdRatio * 240;
          lpHz = 520 + spdRatio * 1400;
          whineHz = 380 + spdRatio * 1420;
          whineLvl = 0.025 + spdRatio * 0.085;
          mechHz = 240 + spdRatio * 420;
          mechLvl = spdRatio * 0.045;
          masterVol = 0.055 + spdRatio * 0.12;
        } else if (isTwoStroke) {
          if (nodes.selfCoreOsc.type !== 'sawtooth') nodes.selfCoreOsc.type = 'sawtooth';
          coreHz = 86 + (rpmNorm + loadBoost) * 235;
          subHz = coreHz * 0.5;
          lpHz = 420 + (rpmNorm + loadBoost) * 1650;
          whineHz = coreHz * 2.0;
          whineLvl = 0.025 + rpmNorm * 0.05;
          mechHz = 310 + spdRatio * 380;
          mechLvl = 0.035 + spdRatio * 0.065;
          masterVol = 0.13 + rpmNorm * 0.13;
        } else {
          if (nodes.selfCoreOsc.type !== 'sawtooth') nodes.selfCoreOsc.type = 'sawtooth';
          coreHz = 52 + (rpmNorm + loadBoost) * 168;
          subHz = coreHz * 0.5;
          lpHz = 270 + (rpmNorm + loadBoost) * 1180;
          whineHz = 280 + rpmNorm * 520;
          whineLvl = 0.015 + rpmNorm * 0.035;
          mechHz = 210 + spdRatio * 340;
          mechLvl = 0.04 + spdRatio * 0.065;
          masterVol = 0.135 + rpmNorm * 0.13;
        }
      } else if (v.type === 'atv') {
        if (nodes.selfCoreOsc.type !== 'sawtooth') nodes.selfCoreOsc.type = 'sawtooth';
        coreHz = 46 + (rpmNorm + loadBoost) * 144;
        subHz = coreHz * 0.5;
        lpHz = 240 + (rpmNorm + loadBoost) * 960;
        whineHz = 240 + rpmNorm * 460;
        whineLvl = 0.018 + rpmNorm * 0.03;
        mechHz = 185 + spdRatio * 290;
        mechLvl = 0.05 + spdRatio * 0.075;
        masterVol = 0.14 + rpmNorm * 0.125;
      } else if (v.type === 'humvee' || v.type === 'truck_transport') {
        if (nodes.selfCoreOsc.type !== 'sawtooth') nodes.selfCoreOsc.type = 'sawtooth';
        coreHz = 36 + rpmNorm * 102;
        subHz = coreHz * 0.5;
        lpHz = 195 + rpmNorm * 680;
        whineHz = 520 + rpmNorm * 920;
        whineLvl = 0.014 + rpmNorm * 0.045;
        mechHz = 150 + spdRatio * 240;
        mechLvl = 0.055 + spdRatio * 0.08;
        masterVol = 0.15 + rpmNorm * 0.125;
      } else if (v.type === 'apc' || v.type === 'aa') {
        if (nodes.selfCoreOsc.type !== 'sawtooth') nodes.selfCoreOsc.type = 'sawtooth';
        coreHz = 39 + rpmNorm * 108;
        subHz = coreHz * 0.5;
        lpHz = 210 + rpmNorm * 720;
        whineHz = 480 + rpmNorm * 880;
        whineLvl = 0.02 + rpmNorm * 0.05;
        mechHz = 165 + spdRatio * 260;
        mechLvl = 0.065 + spdRatio * 0.085;
        masterVol = 0.16 + rpmNorm * 0.125;
      } else if (v.type === 'tank') {
        const isAbramsTurbine = v.team !== 'RU';
        if (nodes.selfCoreOsc.type !== 'sawtooth') nodes.selfCoreOsc.type = 'sawtooth';
        if (isAbramsTurbine) {
          coreHz = 48 + spdRatio * 68;
          subHz = 24 + spdRatio * 34;
          lpHz = 220 + spdRatio * 460;
          whineHz = 690 + spdRatio * 960;
          whineLvl = 0.055 + spdRatio * 0.095;
          mechHz = 135 + spdRatio * 245;
          mechLvl = 0.05 + spdRatio * 0.13;
          masterVol = 0.165 + spdRatio * 0.13;
        } else {
          coreHz = 31 + spdRatio * 84;
          subHz = 16 + spdRatio * 42;
          lpHz = 185 + spdRatio * 620;
          whineHz = 540 + spdRatio * 840;
          whineLvl = 0.024 + spdRatio * 0.062;
          mechHz = 130 + spdRatio * 235;
          mechLvl = 0.065 + spdRatio * 0.135;
          masterVol = 0.17 + spdRatio * 0.13;
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
        Math.max(0.0001, Math.min(0.36, masterVol * catMult)),
        now,
        0.055
      );
    } else {
      this._setGroundParam(nodes.selfBusGain.gain, 'selfBus', 0.0001, now, 0.07);
    }

    if (nearestExtVeh && listenerPos) {
      const dist = Math.sqrt(nearestExtDistSq);
      const distRatio = Math.min(1, Math.max(0, dist / 155));
      const atten = Math.pow(1 - distRatio, 1.7);
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

      const extVol = Math.min(0.26, (0.09 + spdFrac * 0.15) * atten * catMult);
      this._setGroundParam(nodes.extBusGain.gain, 'extBus', Math.max(0.0001, extVol), now, 0.065);
    } else {
      this._setGroundParam(nodes.extBusGain.gain, 'extBus', 0.0001, now, 0.08);
    }
  }
}

export const sound = new SoundManager();
