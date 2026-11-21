// Battlefield ("War Tapes" HDR) & Call of Duty: Modern Warfare Inspired
// Multi-Layer Procedural Web Audio API Combat Sound Engine

class SoundManager {
  constructor() {
    this.ctx = null;
    this.masterBus = null;
    this.reverbConvolver = null;
    this.reverbReturnGain = null;
    this.whiteNoiseBuf = null;
    this.pinkNoiseBuf = null;
    this.saturationCurve = null;
    this._lastWhizTime = 0;
    this._activeVoices = 0;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.setupMasterHdrBus();
        this.buildNoiseBuffers();
        this.buildValleyImpulseResponse();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  /**
   * Master "War Tapes" HDR Bus:
   * Subsonic filter -> Warm Soft-Clip Saturation -> Fast Punchy HDR Compressor -> Master Output
   */
  setupMasterHdrBus() {
    if (!this.ctx) return;

    const subFilter = this.ctx.createBiquadFilter();
    subFilter.type = 'highpass';
    subFilter.frequency.value = 26;
    subFilter.Q.value = 0.7;

    // Soft-clipping tube/tape saturation curve for punchy gunfire transients
    const shaper = this.ctx.createWaveShaper();
    const nSamples = 4096;
    const curve = new Float32Array(nSamples);
    const drive = 1.65;
    for (let i = 0; i < nSamples; i++) {
      const x = (i * 2) / nSamples - 1;
      curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
    }
    this.saturationCurve = curve;
    shaper.curve = curve;
    shaper.oversample = '2x';

    // Battlefield "War Tapes" HDR Dynamics Compressor
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -15;
    comp.knee.value = 10;
    comp.ratio.value = 6.5;
    comp.attack.value = 0.002;
    comp.release.value = 0.14;

    const masterGain = this.ctx.createGain();
    masterGain.gain.value = 0.92;

    subFilter.connect(shaper);
    shaper.connect(comp);
    comp.connect(masterGain);
    masterGain.connect(this.ctx.destination);

    this.masterBus = subFilter;
  }

  /**
   * Pre-computes 2.0-second White Noise & Warm Pink Noise (-3dB/oct) buffers
   * so gunshots and explosions can slice random offsets with zero GC hitching.
   */
  buildNoiseBuffers() {
    if (!this.ctx) return;
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * 2.0);

    this.whiteNoiseBuf = this.ctx.createBuffer(1, len, sr);
    this.pinkNoiseBuf = this.ctx.createBuffer(1, len, sr);

    const wData = this.whiteNoiseBuf.getChannelData(0);
    const pData = this.pinkNoiseBuf.getChannelData(0);

    // Paul Kellet's -3dB/octave Pink Noise filter state
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      wData[i] = white;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
      pData[i] = Math.max(-1, Math.min(1, pink * 1.8));
    }
  }

  /**
   * Generates a Stereo Outdoor Alpine Valley & Urban Canyon Impulse Response (1.35s)
   * with discrete building slapback echoes (24ms, 52ms, 86ms, 122ms) and a warm decaying tail.
   */
  buildValleyImpulseResponse() {
    if (!this.ctx || !this.masterBus) return;
    const sr = this.ctx.sampleRate;
    const duration = 1.35;
    const len = Math.floor(sr * duration);
    const irBuf = this.ctx.createBuffer(2, len, sr);
    const left = irBuf.getChannelData(0);
    const right = irBuf.getChannelData(1);

    // Early urban building wall slapback reflections
    const earlyTaps = [
      { time: 0.023, gainL: 0.48, gainR: 0.32 },
      { time: 0.049, gainL: 0.31, gainR: 0.46 },
      { time: 0.082, gainL: 0.26, gainR: 0.22 },
      { time: 0.118, gainL: 0.19, gainR: 0.24 },
      { time: 0.165, gainL: 0.14, gainR: 0.15 }
    ];

    let lpL = 0;
    let lpR = 0;
    for (let i = 0; i < len; i++) {
      const t = i / duration / sr;
      const env = Math.pow(1 - i / len, 2.45);
      // Progressive air-absorption lowpass on the canyon tail
      const damp = Math.max(0.08, 0.55 * (1 - t * 0.75));
      const rawL = (Math.random() * 2 - 1) * env;
      const rawR = (Math.random() * 2 - 1) * env;
      lpL = lpL + damp * (rawL - lpL);
      lpR = lpR + damp * (rawR - lpR);
      left[i] = lpL * 0.38;
      right[i] = lpR * 0.38;
    }

    for (const tap of earlyTaps) {
      const centerIdx = Math.floor(tap.time * sr);
      const spread = Math.floor(0.004 * sr);
      for (let j = -spread; j <= spread; j++) {
        const idx = centerIdx + j;
        if (idx >= 0 && idx < len) {
          const w = 1 - Math.abs(j) / (spread + 1);
          left[idx] += (Math.random() * 2 - 1) * tap.gainL * w;
          right[idx] += (Math.random() * 2 - 1) * tap.gainR * w;
        }
      }
    }

    this.reverbConvolver = this.ctx.createConvolver();
    this.reverbConvolver.buffer = irBuf;

    const revFilter = this.ctx.createBiquadFilter();
    revFilter.type = 'lowpass';
    revFilter.frequency.value = 2600;

    this.reverbReturnGain = this.ctx.createGain();
    this.reverbReturnGain.gain.value = 0.68;

    this.reverbConvolver.connect(revFilter);
    revFilter.connect(this.reverbReturnGain);
    this.reverbReturnGain.connect(this.masterBus);
  }

  createSpatialNode(pan = 0) {
    if (!this.ctx) return this.masterBus;
    if (typeof this.ctx.createStereoPanner === 'function' && Math.abs(pan) > 0.01) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.max(-0.92, Math.min(0.92, pan));
      panner.connect(this.masterBus);
      return panner;
    }
    return this.masterBus;
  }

  /**
   * 6-Layer Battlefield / Call of Duty Gunshot Synthesizer:
   * 1. Supersonic Muzzle Crack / Ignition Snap (0-12ms high-voltage transient)
   * 2. High-Pressure Propellant Blast Body (Sweeping Lowpass/Peaking Pink Noise)
   * 3. Sub-Bass Chest Thump / Pressure Wave (Pitch-dropping sub kick)
   * 4. CoD Modern Warfare Metallic Receiver & Bolt Carrier Group Clank (Close range)
   * 5. Spent Brass Shell Casing Clink & Sniper Bolt Cycling (Local shots)
   * 6. Outdoor Urban Slapback & Valley Convolver Reverb Tail (Distance-scaled)
   */
  playGunshot(type = 'rifle', distance = 0, pan = 0) {
    this.init();
    if (!this.ctx || !this.masterBus) return;

    // Prevent audio node overload during extreme 80-soldier firefights
    if (this._activeVoices > 28 && distance > 25) return;

    const now = this.ctx.currentTime;
    const distNorm = Math.min(1, Math.max(0, distance / 210));
    const vol = Math.max(0.03, Math.pow(1 - distNorm * 0.92, 1.35));

    // Subtle pitch/timbre humanization (±5%) so full-auto bursts never sound robotic
    const humanize = 0.955 + Math.random() * 0.09;
    const outNode = this.createSpatialNode(pan);

    this._activeVoices++;
    setTimeout(() => {
      this._activeVoices = Math.max(0, this._activeVoices - 1);
    }, 350);

    // Caliber acoustic profiles
    const profiles = {
      rifle: {
        bodyDur: 0.19,
        blastStartFreq: 6800,
        blastEndFreq: 520,
        midBarkFreq: 1180,
        midBarkGain: 5.5,
        subStartFreq: 185,
        subEndFreq: 38,
        subDur: 0.095,
        subGain: 0.52,
        crackFreq: 3200,
        crackGain: 0.48,
        reverbSend: 0.36
      },
      smg: {
        bodyDur: 0.135,
        blastStartFreq: 7400,
        blastEndFreq: 680,
        midBarkFreq: 1520,
        midBarkGain: 4.5,
        subStartFreq: 195,
        subEndFreq: 46,
        subDur: 0.075,
        subGain: 0.38,
        crackFreq: 3600,
        crackGain: 0.42,
        reverbSend: 0.26
      },
      lmg: {
        bodyDur: 0.23,
        blastStartFreq: 6200,
        blastEndFreq: 440,
        midBarkFreq: 960,
        midBarkGain: 6.5,
        subStartFreq: 170,
        subEndFreq: 34,
        subDur: 0.115,
        subGain: 0.58,
        crackFreq: 2950,
        crackGain: 0.46,
        reverbSend: 0.42
      },
      sniper: {
        bodyDur: 0.42,
        blastStartFreq: 7800,
        blastEndFreq: 320,
        midBarkFreq: 820,
        midBarkGain: 8.0,
        subStartFreq: 235,
        subEndFreq: 28,
        subDur: 0.165,
        subGain: 0.78,
        crackFreq: 3800,
        crackGain: 0.68,
        reverbSend: 0.72
      },
      pistol: {
        bodyDur: 0.125,
        blastStartFreq: 7200,
        blastEndFreq: 760,
        midBarkFreq: 1680,
        midBarkGain: 4.2,
        subStartFreq: 210,
        subEndFreq: 52,
        subDur: 0.068,
        subGain: 0.34,
        crackFreq: 3900,
        crackGain: 0.38,
        reverbSend: 0.24
      },
      autocannon: {
        bodyDur: 0.32,
        blastStartFreq: 5200,
        blastEndFreq: 260,
        midBarkFreq: 580,
        midBarkGain: 7.5,
        subStartFreq: 155,
        subEndFreq: 26,
        subDur: 0.15,
        subGain: 0.74,
        crackFreq: 2400,
        crackGain: 0.52,
        reverbSend: 0.62
      }
    };

    const prof = profiles[type] || profiles.rifle;

    // =========================================================================
    // LAYER 1: SUPERSONIC MUZZLE CRACK / IGNITION SNAP (0 - 12ms)
    // =========================================================================
    if (this.whiteNoiseBuf && distance < 150) {
      const crackSrc = this.ctx.createBufferSource();
      crackSrc.buffer = this.whiteNoiseBuf;
      const crackHp = this.ctx.createBiquadFilter();
      crackHp.type = 'bandpass';
      crackHp.frequency.setValueAtTime(prof.crackFreq * humanize, now);
      crackHp.Q.setValueAtTime(1.1, now);

      const crackGain = this.ctx.createGain();
      const cLevel = prof.crackGain * vol * (distance < 10 ? 1.15 : 0.85);
      crackGain.gain.setValueAtTime(cLevel, now);
      crackGain.gain.exponentialRampToValueAtTime(0.002, now + 0.014);

      crackSrc.connect(crackHp);
      crackHp.connect(crackGain);
      crackGain.connect(outNode);
      const offset = Math.random() * 1.4;
      crackSrc.start(now, offset, 0.018);
    }

    // High-voltage transient impulse pop (gives the initial 3ms speaker cone snap)
    const snapOsc = this.ctx.createOscillator();
    const snapGain = this.ctx.createGain();
    snapOsc.type = 'triangle';
    snapOsc.frequency.setValueAtTime(2400 * humanize, now);
    snapOsc.frequency.exponentialRampToValueAtTime(180, now + 0.011);
    snapGain.gain.setValueAtTime(0.38 * vol, now);
    snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.012);
    snapOsc.connect(snapGain);
    snapGain.connect(outNode);
    snapOsc.start(now);
    snapOsc.stop(now + 0.013);

    // =========================================================================
    // LAYER 2: HIGH-PRESSURE PROPELLANT BLAST BODY (Sweeping Pink Noise)
    // =========================================================================
    if (this.pinkNoiseBuf) {
      const blastSrc = this.ctx.createBufferSource();
      blastSrc.buffer = this.pinkNoiseBuf;
      blastSrc.playbackRate.value = humanize;

      // Peaking mid-bark EQ for aggressive Battlefield/CoD midrange chest punch
      const barkEq = this.ctx.createBiquadFilter();
      barkEq.type = 'peaking';
      barkEq.frequency.setValueAtTime(prof.midBarkFreq * humanize, now);
      barkEq.Q.setValueAtTime(1.15, now);
      barkEq.gain.setValueAtTime(prof.midBarkGain, now);

      // Dynamic Lowpass Filter Envelope (bright ignition -> warm smoky decay)
      // Distant shots naturally have lower initial high-frequency cutoff due to air absorption
      const distCutoffScale = Math.max(0.28, 1 - distNorm * 0.72);
      const blastLp = this.ctx.createBiquadFilter();
      blastLp.type = 'lowpass';
      blastLp.frequency.setValueAtTime(prof.blastStartFreq * distCutoffScale * humanize, now);
      blastLp.frequency.exponentialRampToValueAtTime(
        Math.max(240, prof.blastEndFreq * distCutoffScale),
        now + prof.bodyDur
      );
      blastLp.Q.setValueAtTime(1.4, now);

      const blastGain = this.ctx.createGain();
      blastGain.gain.setValueAtTime(0.68 * vol, now);
      blastGain.gain.setValueAtTime(0.62 * vol, now + 0.012);
      blastGain.gain.exponentialRampToValueAtTime(0.003, now + prof.bodyDur);

      blastSrc.connect(barkEq);
      barkEq.connect(blastLp);
      blastLp.connect(blastGain);
      blastGain.connect(outNode);

      // Layer 6: Send to Outdoor Valley & Urban Canyon Convolver Reverb
      if (this.reverbConvolver) {
        const revSend = this.ctx.createGain();
        // Distant shots have higher wet/echo ratio across the valley
        const wetRatio = prof.reverbSend * (0.65 + distNorm * 0.85);
        revSend.gain.setValueAtTime(wetRatio * vol, now);
        blastLp.connect(revSend);
        revSend.connect(this.reverbConvolver);
      }

      const offset = Math.random() * 1.2;
      blastSrc.start(now, offset, prof.bodyDur + 0.04);
    }

    // =========================================================================
    // LAYER 3: SUB-BASS CHEST THUMP / PRESSURE WAVE (0 - 115ms)
    // =========================================================================
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(prof.subStartFreq * humanize, now);
    subOsc.frequency.exponentialRampToValueAtTime(prof.subEndFreq, now + prof.subDur);

    subGain.gain.setValueAtTime(prof.subGain * vol, now);
    subGain.gain.exponentialRampToValueAtTime(0.002, now + prof.subDur + 0.01);

    subOsc.connect(subGain);
    subGain.connect(outNode);
    subOsc.start(now);
    subOsc.stop(now + prof.subDur + 0.015);

    // =========================================================================
    // LAYER 4: CALL OF DUTY METALLIC RECEIVER & BOLT CARRIER CLANK (Close range)
    // =========================================================================
    if (distance < 16 && type !== 'sniper') {
      const mechVol = vol * Math.max(0.15, 1 - distance / 16) * 0.24;
      // 1) Bolt carrier rearward buffer impact (+18ms) & 2) Locking lugs forward slam (+44ms)
      const clanks = [
        { delay: 0.016, f1: 2550 * humanize, f2: 4100 * humanize, g: mechVol },
        { delay: 0.042, f1: 1880 * humanize, f2: 3350 * humanize, g: mechVol * 0.82 }
      ];
      for (const c of clanks) {
        const mOsc = this.ctx.createOscillator();
        const mFilter = this.ctx.createBiquadFilter();
        const mGain = this.ctx.createGain();
        mOsc.type = 'square';
        mOsc.frequency.setValueAtTime(c.f1, now + c.delay);
        mOsc.frequency.exponentialRampToValueAtTime(c.f2, now + c.delay + 0.016);

        mFilter.type = 'bandpass';
        mFilter.frequency.setValueAtTime(c.f1 * 1.1, now + c.delay);
        mFilter.Q.value = 3.2;

        mGain.gain.setValueAtTime(c.g, now + c.delay);
        mGain.gain.exponentialRampToValueAtTime(0.001, now + c.delay + 0.019);

        mOsc.connect(mFilter);
        mFilter.connect(mGain);
        mGain.connect(outNode);
        mOsc.start(now + c.delay);
        mOsc.stop(now + c.delay + 0.022);
      }
    }

    // =========================================================================
    // LAYER 5: SNIPER BOLT-ACTION CYCLING & BRASS CASING TINK (Local Player)
    // =========================================================================
    if (distance === 0) {
      if (type === 'sniper') {
        this.playBoltCycle(0.32);
      } else if (Math.random() < 0.65) {
        // Subtle spent brass shell casing bounce clink (+160ms)
        const brassDelay = 0.14 + Math.random() * 0.06;
        const bOsc = this.ctx.createOscillator();
        const bGain = this.ctx.createGain();
        bOsc.type = 'sine';
        bOsc.frequency.setValueAtTime(5200 + Math.random() * 900, now + brassDelay);
        bOsc.frequency.exponentialRampToValueAtTime(3800, now + brassDelay + 0.022);
        bGain.gain.setValueAtTime(0.035, now + brassDelay);
        bGain.gain.exponentialRampToValueAtTime(0.001, now + brassDelay + 0.025);
        bOsc.connect(bGain);
        bGain.connect(this.masterBus);
        bOsc.start(now + brassDelay);
        bOsc.stop(now + brassDelay + 0.028);
      }
    }
  }

  /**
   * Tactile Bolt-Action Sniper Rifle Cycling (Lift -> Pull Back -> Push Forward -> Lock Down)
   */
  playBoltCycle(startDelay = 0.3) {
    if (!this.ctx || !this.masterBus) return;
    const now = this.ctx.currentTime + startDelay;
    const steps = [
      { t: 0.0, fStart: 1450, fEnd: 2200, dur: 0.045, gain: 0.14 },  // Bolt handle lift
      { t: 0.07, fStart: 2600, fEnd: 1800, dur: 0.065, gain: 0.16 }, // Slide bolt rearward + eject
      { t: 0.21, fStart: 1750, fEnd: 2450, dur: 0.06, gain: 0.15 },  // Chamber next .338 round
      { t: 0.29, fStart: 2100, fEnd: 920, dur: 0.04, gain: 0.18 }    // Heavy bolt handle lock down
    ];
    for (const s of steps) {
      const osc = this.ctx.createOscillator();
      const bp = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(s.fStart, now + s.t);
      osc.frequency.linearRampToValueAtTime(s.fEnd, now + s.t + s.dur);
      bp.type = 'bandpass';
      bp.frequency.value = (s.fStart + s.fEnd) * 0.5;
      bp.Q.value = 2.4;
      g.gain.setValueAtTime(s.gain, now + s.t);
      g.gain.exponentialRampToValueAtTime(0.002, now + s.t + s.dur + 0.01);
      osc.connect(bp);
      bp.connect(g);
      g.connect(this.masterBus);
      osc.start(now + s.t);
      osc.stop(now + s.t + s.dur + 0.015);
    }
  }

  /**
   * 120mm M1A2 Abrams / 125mm T-90M Main Battle Tank Cannon Blast
   */
  playTankCannon(distance = 0, pan = 0) {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    const now = this.ctx.currentTime;
    const vol = Math.max(0.06, Math.min(1, 1 - distance / 290));
    const outNode = this.createSpatialNode(pan);

    // 1. Supersonic 120mm Muzzle Shockwave Crack
    this.playGunshot('sniper', distance * 0.6, pan);

    // 2. Massive Artillery Sub-Bass Shockwave (210 Hz -> 24 Hz over 0.45s)
    const sub = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(210, now);
    sub.frequency.exponentialRampToValueAtTime(24, now + 0.45);
    subGain.gain.setValueAtTime(0.92 * vol, now);
    subGain.gain.exponentialRampToValueAtTime(0.004, now + 0.48);
    sub.connect(subGain);
    subGain.connect(outNode);
    sub.start(now);
    sub.stop(now + 0.5);

    // 3. Interior Breech Block Metallic Ring (when player is inside or close to tank)
    if (distance < 15) {
      const ring = this.ctx.createOscillator();
      const ringGain = this.ctx.createGain();
      ring.type = 'triangle';
      ring.frequency.setValueAtTime(1180, now + 0.02);
      ring.frequency.exponentialRampToValueAtTime(420, now + 0.28);
      ringGain.gain.setValueAtTime(0.28 * vol, now + 0.02);
      ringGain.gain.exponentialRampToValueAtTime(0.002, now + 0.3);
      ring.connect(ringGain);
      ringGain.connect(outNode);
      ring.start(now + 0.02);
      ring.stop(now + 0.32);
    }
  }

  /**
   * Battlefield / Squad Supersonic Bullet Snap & Doppler Whiz when enemy rounds pass near the player!
   */
  playBulletWhiz(distance = 8, pan = 0) {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    const nowPerf = performance.now();
    if (nowPerf - this._lastWhizTime < 95) return; // Rate-limit during heavy LMG bursts
    this._lastWhizTime = nowPerf;

    const now = this.ctx.currentTime;
    const vol = Math.max(0.05, Math.min(0.55, (1 - distance / 36) * 0.55));
    const outNode = this.createSpatialNode(pan);

    // 1. Sharp Supersonic Shockwave Whip-Crack ("SNAP!")
    if (this.whiteNoiseBuf && distance < 18) {
      const snapSrc = this.ctx.createBufferSource();
      snapSrc.buffer = this.whiteNoiseBuf;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.setValueAtTime(3900 + Math.random() * 600, now);
      hp.Q.value = 1.6;
      const sGain = this.ctx.createGain();
      sGain.gain.setValueAtTime(vol * 0.95, now);
      sGain.gain.exponentialRampToValueAtTime(0.002, now + 0.011);
      snapSrc.connect(hp);
      hp.connect(sGain);
      sGain.connect(outNode);
      snapSrc.start(now, Math.random() * 1.5, 0.014);
    }

    // 2. Doppler Pitch-Drop Bullet Whiz (2600 Hz -> 480 Hz)
    const whizOsc = this.ctx.createOscillator();
    const whizGain = this.ctx.createGain();
    whizOsc.type = 'sine';
    const startF = 2400 + Math.random() * 600;
    whizOsc.frequency.setValueAtTime(startF, now);
    whizOsc.frequency.exponentialRampToValueAtTime(460 + Math.random() * 120, now + 0.085);

    whizGain.gain.setValueAtTime(0.01, now);
    whizGain.gain.linearRampToValueAtTime(vol * 0.42, now + 0.018);
    whizGain.gain.exponentialRampToValueAtTime(0.002, now + 0.09);

    whizOsc.connect(whizGain);
    whizGain.connect(outNode);
    whizOsc.start(now);
    whizOsc.stop(now + 0.095);
  }

  playRocketLaunch(distance = 0, pan = 0) {
    this.init();
    if (!this.ctx || !this.masterBus) return;

    const vol = Math.max(0.05, Math.min(1, 1 - distance / 220));
    const now = this.ctx.currentTime;
    const outNode = this.createSpatialNode(pan);

    // 1. Initial RPG-7 recoilless tube ignition pop
    const popOsc = this.ctx.createOscillator();
    const popGain = this.ctx.createGain();
    popOsc.type = 'sawtooth';
    popOsc.frequency.setValueAtTime(220, now);
    popOsc.frequency.exponentialRampToValueAtTime(48, now + 0.11);
    popGain.gain.setValueAtTime(0.48 * vol, now);
    popGain.gain.exponentialRampToValueAtTime(0.003, now + 0.12);
    popOsc.connect(popGain);
    popGain.connect(outNode);
    popOsc.start(now);
    popOsc.stop(now + 0.125);

    // 2. Solid-fuel rocket motor whoosh & backblast hiss
    if (this.pinkNoiseBuf) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.pinkNoiseBuf;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(460, now);
      filter.frequency.exponentialRampToValueAtTime(1450, now + 0.22);
      filter.frequency.exponentialRampToValueAtTime(620, now + 0.6);
      filter.Q.value = 0.9;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.58 * vol, now);
      gain.gain.exponentialRampToValueAtTime(0.008, now + 0.62);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(outNode);
      if (this.reverbConvolver) {
        const rev = this.ctx.createGain();
        rev.gain.value = 0.35 * vol;
        filter.connect(rev);
        rev.connect(this.reverbConvolver);
      }
      src.start(now, Math.random() * 0.8, 0.65);
    }
  }

  /**
   * Multi-Stage Battlefield / CoD Detonation:
   * 1. High-velocity detonation crack (0-20ms)
   * 2. Deep chest-crushing sub-bass shockwave (140 Hz -> 22 Hz)
   * 3. Mid-low debris & shrapnel roar (1.25s) + Valley Convolver Thunder
   */
  playExplosion(distance = 0, pan = 0) {
    this.init();
    if (!this.ctx || !this.masterBus) return;

    const distNorm = Math.min(1, Math.max(0, distance / 280));
    const vol = Math.max(0.06, Math.pow(1 - distNorm * 0.88, 1.25));
    const now = this.ctx.currentTime;
    const outNode = this.createSpatialNode(pan);

    // 1. Initial Detonation Snap (if within 160m)
    if (this.whiteNoiseBuf && distance < 160) {
      const snap = this.ctx.createBufferSource();
      snap.buffer = this.whiteNoiseBuf;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1800;
      const sGain = this.ctx.createGain();
      sGain.gain.setValueAtTime(0.65 * vol, now);
      sGain.gain.exponentialRampToValueAtTime(0.003, now + 0.028);
      snap.connect(hp);
      hp.connect(sGain);
      sGain.connect(outNode);
      snap.start(now, Math.random(), 0.032);
    }

    // 2. Massive Sub-Bass Concussion Wave
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(145, now);
    subOsc.frequency.exponentialRampToValueAtTime(22, now + 0.55);
    subGain.gain.setValueAtTime(0.95 * vol, now);
    subGain.gain.exponentialRampToValueAtTime(0.004, now + 0.6);
    subOsc.connect(subGain);
    subGain.connect(outNode);
    subOsc.start(now);
    subOsc.stop(now + 0.62);

    // 3. Rolling Explosion Roar & Debris Tail
    if (this.pinkNoiseBuf) {
      const duration = 1.25;
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.pinkNoiseBuf;
      noise.playbackRate.value = 0.75 + Math.random() * 0.15;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1400 * (1 - distNorm * 0.55), now);
      filter.frequency.exponentialRampToValueAtTime(58, now + duration);
      filter.Q.value = 1.25;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.92 * vol, now);
      gain.gain.exponentialRampToValueAtTime(0.004, now + duration);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(outNode);

      if (this.reverbConvolver) {
        const revSend = this.ctx.createGain();
        revSend.gain.value = 0.85 * vol;
        filter.connect(revSend);
        revSend.connect(this.reverbConvolver);
      }

      noise.start(now, Math.random() * 0.5, duration + 0.05);
    }
  }

  /**
   * Call of Duty / Battlefield Visceral Hitmarker Audio:
   * - 'normal': Crisp CoD double-tick kevlar/flesh thud + high-freq transient snap
   * - 'headshot': Iconic metallic helmet dink + double crunch!
   * - 'kill': Visceral kill-confirm chordal chime + low punch
   * - 'armor': Heavy composite armor ricochet ping
   */
  playHitmarker(mode = 'normal') {
    this.init();
    if (!this.ctx || !this.masterBus) return;

    const now = this.ctx.currentTime;

    if (mode === 'armor') {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(2650, now);
      osc.frequency.exponentialRampToValueAtTime(1120, now + 0.085);
      gain.gain.setValueAtTime(0.32, now);
      gain.gain.exponentialRampToValueAtTime(0.003, now + 0.09);
      osc.connect(gain);
      gain.connect(this.masterBus);
      osc.start(now);
      osc.stop(now + 0.095);
      return;
    }

    // 1. Crisp CoD High-Frequency Hit Tick (filtered white noise micro-transient)
    if (this.whiteNoiseBuf) {
      const tickSrc = this.ctx.createBufferSource();
      tickSrc.buffer = this.whiteNoiseBuf;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = mode === 'headshot' || mode === 'kill' ? 3800 : 2950;
      bp.Q.value = 1.8;
      const tGain = this.ctx.createGain();
      tGain.gain.setValueAtTime(0.38, now);
      tGain.gain.exponentialRampToValueAtTime(0.002, now + 0.024);
      tickSrc.connect(bp);
      bp.connect(tGain);
      tGain.connect(this.masterBus);
      tickSrc.start(now, Math.random(), 0.028);
    }

    // 2. Low-Mid Body Thud Punch
    const thudOsc = this.ctx.createOscillator();
    const thudGain = this.ctx.createGain();
    thudOsc.type = 'triangle';
    thudOsc.frequency.setValueAtTime(mode === 'headshot' ? 320 : 220, now);
    thudOsc.frequency.exponentialRampToValueAtTime(68, now + 0.045);
    thudGain.gain.setValueAtTime(0.32, now);
    thudGain.gain.exponentialRampToValueAtTime(0.003, now + 0.05);
    thudOsc.connect(thudGain);
    thudGain.connect(this.masterBus);
    thudOsc.start(now);
    thudOsc.stop(now + 0.055);

    // 3. Headshot Helmet Dink / Kill Confirm Chime
    if (mode === 'headshot' || mode === 'kill') {
      const dinkOsc = this.ctx.createOscillator();
      const dinkGain = this.ctx.createGain();
      dinkOsc.type = 'sine';
      dinkOsc.frequency.setValueAtTime(mode === 'kill' ? 2850 : 3250, now + 0.012);
      dinkOsc.frequency.exponentialRampToValueAtTime(mode === 'kill' ? 1420 : 1780, now + 0.095);
      dinkGain.gain.setValueAtTime(0.34, now + 0.012);
      dinkGain.gain.exponentialRampToValueAtTime(0.002, now + 0.1);
      dinkOsc.connect(dinkGain);
      dinkGain.connect(this.masterBus);
      dinkOsc.start(now + 0.012);
      dinkOsc.stop(now + 0.105);
    }
  }

  /**
   * 4-Stage Call of Duty Tactical Reload Audio:
   * 1. Mag catch button click (0.03s)
   * 2. Empty magazine extraction slide (0.20s)
   * 3. Fresh magazine insertion thud & latch click (0.58s)
   * 4. Metallic bolt carrier release / charging handle rack (0.86s)
   */
  playReload() {
    this.init();
    if (!this.ctx || !this.masterBus) return;

    const now = this.ctx.currentTime;
    const stages = [
      { offset: 0.03, f1: 2400, f2: 1600, dur: 0.028, type: 'triangle', gain: 0.14 }, // Mag catch click
      { offset: 0.20, f1: 980, f2: 520, dur: 0.065, type: 'sawtooth', gain: 0.12 },   // Mag slide out
      { offset: 0.58, f1: 165, f2: 75, dur: 0.055, type: 'sine', gain: 0.28 },        // Heavy mag palm-slap in
      { offset: 0.61, f1: 2150, f2: 2850, dur: 0.025, type: 'square', gain: 0.13 },   // Mag latch lock
      { offset: 0.86, f1: 1850, f2: 3100, dur: 0.048, type: 'sawtooth', gain: 0.18 }, // Bolt carrier rack back
      { offset: 0.92, f1: 2600, f2: 1150, dur: 0.038, type: 'triangle', gain: 0.22 }  // Bolt slam forward
    ];

    for (const s of stages) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = s.type;
      osc.frequency.setValueAtTime(s.f1, now + s.offset);
      osc.frequency.exponentialRampToValueAtTime(s.f2, now + s.offset + s.dur);
      gain.gain.setValueAtTime(s.gain, now + s.offset);
      gain.gain.exponentialRampToValueAtTime(0.002, now + s.offset + s.dur + 0.008);
      osc.connect(gain);
      gain.connect(this.masterBus);
      osc.start(now + s.offset);
      osc.stop(now + s.offset + s.dur + 0.012);
    }
  }

  playBuildHammer() {
    this.init();
    if (!this.ctx || !this.masterBus) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(95, now + 0.075);
    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.004, now + 0.08);
    osc.connect(gain);
    gain.connect(this.masterBus);
    osc.start(now);
    osc.stop(now + 0.085);
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
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.002, now + 0.08);
    osc.connect(gain);
    gain.connect(this.masterBus);
    osc.start(now);
    osc.stop(now + 0.085);
  }

  /**
   * Battlefield Objective Captured / Ticket Grant Fanfare Chime
   */
  playObjectiveCaptured(isFriendly = true) {
    this.init();
    if (!this.ctx || !this.masterBus) return;
    const now = this.ctx.currentTime;
    const notes = isFriendly ? [523.25, 659.25, 783.99, 1046.5] : [440, 392, 329.63];
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      const t = now + idx * 0.075;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.14, t);
      gain.gain.exponentialRampToValueAtTime(0.002, t + 0.24);
      osc.connect(gain);
      gain.connect(this.masterBus);
      osc.start(t);
      osc.stop(t + 0.25);
    });
  }
}

export const sound = new SoundManager();
