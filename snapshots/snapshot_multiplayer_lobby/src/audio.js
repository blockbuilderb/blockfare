// Procedural Web Audio API sound synthesizer for BattleBit Clone

class SoundManager {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playGunshot(type = 'rifle', distance = 0) {
    this.init();
    if (!this.ctx) return;

    const vol = Math.max(0.02, Math.min(1, 1 - distance / 210));
    const now = this.ctx.currentTime;

    const duration =
      type === 'sniper'
        ? 0.36
        : type === 'autocannon'
        ? 0.28
        : type === 'pistol'
        ? 0.11
        : type === 'smg'
        ? 0.1
        : 0.17;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const env = Math.pow(1 - i / bufferSize, type === 'sniper' ? 1.4 : 2.3);
      data[i] = (Math.random() * 2 - 1) * env;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    const freqMap = {
      sniper: 880,
      autocannon: 520,
      lmg: 1100,
      pistol: 1650,
      smg: 1750,
      rifle: 1280
    };
    filter.frequency.setValueAtTime(freqMap[type] || 1280, now);
    filter.Q.setValueAtTime(0.85, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4 * vol, now);
    gain.gain.exponentialRampToValueAtTime(0.004, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(now);

    // Mechanical bolt & low-end thump
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(type === 'autocannon' ? 115 : type === 'sniper' ? 145 : 195, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.095);

    oscGain.gain.setValueAtTime(0.34 * vol, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.105);
  }

  playRocketLaunch(distance = 0) {
    this.init();
    if (!this.ctx) return;

    const vol = Math.max(0.05, Math.min(1, 1 - distance / 220));
    const now = this.ctx.currentTime;
    const duration = 0.55;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const t = i / bufferSize;
      data[i] = (Math.random() * 2 - 1) * Math.sin(t * Math.PI);
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(420, now);
    filter.frequency.linearRampToValueAtTime(980, now + 0.35);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.45 * vol, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    src.start(now);
  }

  playExplosion(distance = 0) {
    this.init();
    if (!this.ctx) return;

    const vol = Math.max(0.06, Math.min(1, 1 - distance / 260));
    const now = this.ctx.currentTime;
    const duration = 1.05;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      const env = Math.pow(1 - i / bufferSize, 1.4);
      data[i] = (Math.random() * 2 - 1) * env;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(560, now);
    filter.frequency.exponentialRampToValueAtTime(65, now + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.82 * vol, now);
    gain.gain.exponentialRampToValueAtTime(0.004, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(now);
  }

  playHitmarker(mode = 'normal') {
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    if (mode === 'armor') {
      // Iconic BattleBit helmet/armor crack metallic ping
      osc.type = 'sine';
      osc.frequency.setValueAtTime(2450, now);
      osc.frequency.exponentialRampToValueAtTime(1100, now + 0.085);
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.004, now + 0.09);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.095);
      return;
    }

    const isHeadshot = mode === 'headshot';
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isHeadshot ? 1980 : 1340, now);
    osc.frequency.exponentialRampToValueAtTime(isHeadshot ? 880 : 620, now + 0.05);

    gain.gain.setValueAtTime(0.26, now);
    gain.gain.exponentialRampToValueAtTime(0.005, now + 0.055);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  playReload() {
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    [0, 0.24, 0.65].forEach((offset, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(idx === 0 ? 440 : idx === 1 ? 660 : 520, now + offset);
      gain.gain.setValueAtTime(0.09, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.002, now + offset + 0.045);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.05);
    });
  }

  playBuildHammer() {
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(360, now);
    osc.frequency.exponentialRampToValueAtTime(115, now + 0.075);
    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.005, now + 0.08);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.085);
  }

  playRadioBeep(isIncoming = true) {
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isIncoming ? 1420 : 1680, now);
    osc.frequency.setValueAtTime(isIncoming ? 1850 : 1240, now + 0.035);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.002, now + 0.08);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.085);
  }
}

export const sound = new SoundManager();
