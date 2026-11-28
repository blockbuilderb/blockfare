import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AUDIO_PACK,
  FLAT_AUDIO_PROFILES,
  SoundManager,
  MidiSynthEngine,
  buildStandardMidiBytes,
  parseStandardMidiBytes
} from '../src/audio/index.js?v=150';
import { WEAPON_DEFS } from '../src/assets/weapon-defs.js?v=150';
import { AUDIO } from '../src/config.js?v=150';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

function makeParam(initial = 0) {
  const scheduled = [];
  return {
    value: initial,
    scheduled,
    setValueAtTime(v, t) {
      this.value = v;
      scheduled.push({ op: 'set', v, t });
    },
    linearRampToValueAtTime(v, t) {
      this.value = v;
      scheduled.push({ op: 'lin', v, t });
    },
    exponentialRampToValueAtTime(v, t) {
      this.value = v;
      scheduled.push({ op: 'exp', v, t });
    },
    setTargetAtTime(v, t, tc) {
      this.value = v;
      scheduled.push({ op: 'target', v, t, tc });
    },
    cancelScheduledValues() {}
  };
}

function createMockAudioContext() {
  const created = {
    oscillators: [],
    bufferSources: [],
    filters: [],
    gains: [],
    convolvers: [],
    panners: []
  };
  const ctx = {
    state: 'running',
    currentTime: 10.0,
    sampleRate: 32000,
    destination: { kind: 'destination' },
    created,
    resume: () => Promise.resolve(),
    createDynamicsCompressor() {
      return {
        threshold: makeParam(-4),
        knee: makeParam(6),
        ratio: makeParam(4),
        attack: makeParam(0.003),
        release: makeParam(0.08),
        connect() {}
      };
    },
    createGain() {
      const g = {
        gain: makeParam(1),
        connectedTo: [],
        connect(dest) {
          this.connectedTo.push(dest);
        },
        disconnect() {}
      };
      created.gains.push(g);
      return g;
    },
    createBiquadFilter() {
      const f = {
        type: 'lowpass',
        frequency: makeParam(1000),
        Q: makeParam(1),
        connect() {},
        disconnect() {}
      };
      created.filters.push(f);
      return f;
    },
    createStereoPanner() {
      const p = {
        pan: makeParam(0),
        connect() {},
        disconnect() {}
      };
      created.panners.push(p);
      return p;
    },
    createConvolver() {
      const c = {
        buffer: null,
        connect() {},
        disconnect() {}
      };
      created.convolvers.push(c);
      return c;
    },
    createOscillator() {
      const o = {
        type: 'sine',
        frequency: makeParam(440),
        startedAt: null,
        stoppedAt: null,
        onended: null,
        connect() {},
        disconnect() {},
        start(t = 10.0) {
          this.startedAt = t;
        },
        stop(t = 10.1) {
          this.stoppedAt = t;
        }
      };
      created.oscillators.push(o);
      return o;
    },
    createBufferSource() {
      const s = {
        buffer: null,
        loop: false,
        playbackRate: makeParam(1),
        startedAt: null,
        durationArg: null,
        onended: null,
        connect() {},
        disconnect() {},
        start(t = 10.0, _off = 0, dur = null) {
          this.startedAt = t;
          this.durationArg = dur;
        },
        stop() {}
      };
      created.bufferSources.push(s);
      return s;
    },
    createBuffer(channels, length, sampleRate) {
      const chData = Array.from({ length: channels }, () => new Float32Array(length));
      return {
        numberOfChannels: channels,
        length,
        sampleRate,
        duration: length / sampleRate,
        getChannelData(c) {
          return chData[c];
        }
      };
    }
  };
  return ctx;
}

test('v141 Layer 1: All CC0 audio files in AUDIO_PACK exist on disk and gun envelopes are unchoked', () => {
  const entries = Object.entries(FLAT_AUDIO_PROFILES);
  assert.ok(entries.length >= 24, 'Expected expanded CC0 tactical audio profile catalog');

  for (const [key, prof] of entries) {
    const cleanRel = prof.url.replace(/^\.\//, '').split('?')[0];
    const absPath = path.join(PROJECT_ROOT, cleanRel);
    assert.ok(fs.existsSync(absPath), `Missing primary audio file for '${key}': ${cleanRel}`);
    assert.ok(fs.statSync(absPath).size > 1000, `Audio file too small for '${key}': ${cleanRel}`);

    if (prof.altUrl) {
      const altRel = prof.altUrl.replace(/^\.\//, '').split('?')[0];
      const altAbs = path.join(PROJECT_ROOT, altRel);
      assert.ok(fs.existsSync(altAbs), `Missing alt audio file for '${key}': ${altRel}`);
    }
  }

  // Verify choked 0.15s-0.22s cutoffs are gone!
  assert.ok(AUDIO_PACK.infantry.rifle.maxDuration >= 0.55);
  assert.ok(AUDIO_PACK.infantry.smg.maxDuration >= 0.45);
  assert.ok(AUDIO_PACK.infantry.shotgun.maxDuration >= 0.80);
  assert.ok(AUDIO_PACK.infantry.sniper.maxDuration >= 1.0);
  assert.ok(AUDIO_PACK.infantry.amr.maxDuration >= 1.25);
  assert.ok(AUDIO_PACK.armor.tank_cannon.maxDuration >= 1.3);
  assert.ok(AUDIO_PACK.ordnance.explosion.maxDuration >= 1.4);

  // Verify heavy calibers & shotguns are tagged with dedicated audioProfiles while preserving gameplay soundType
  assert.equal(WEAPON_DEFS.ntw20.audioProfile, 'amr');
  assert.equal(WEAPON_DEFS.ntw20.soundType, 'sniper');
  assert.equal(WEAPON_DEFS.barrett_m82.audioProfile, 'amr');
  assert.equal(WEAPON_DEFS.gm6_lynx.audioProfile, 'amr');
  assert.equal(WEAPON_DEFS.m1014.audioProfile, 'shotgun');
  assert.equal(WEAPON_DEFS.m1014.soundType, 'rifle');
  assert.equal(WEAPON_DEFS.deagle.audioProfile, 'magnum');
});

test('v141 Layer 1 & 2: Ground Vehicle Engine Audio bugfix, 3-Space ConvolverNode Reverb, Occlusion & Speed-of-Sound', () => {
  const sm = new SoundManager();
  const mockCtx = createMockAudioContext();
  sm.ctx = mockCtx;
  sm.init = () => {}; // bypass browser window check in Node test
  sm.setupCleanMasterBus();
  sm.setupReverbSystem();

  // Pre-populate synthetic decoded AudioBuffers for all profiles
  for (const key of Object.keys(sm.profiles)) {
    sm.buffers.set(key, mockCtx.createBuffer(1, 32000 * 2, 32000));
  }

  // 1. 3 ConvolverNodes built ('open_valley', 'urban_canyon', 'indoor_room')
  assert.equal(mockCtx.created.convolvers.length, 3);
  assert.equal(sm.currentEnvironment, 'open_valley');

  // Test environment switching: Urban Canyon (2+ buildings within 48m) vs Indoor Room (inside building footprint)
  const mockWorld = {
    buildings: [
      { minWx: -10, maxWx: 10, minWz: -10, maxWz: 10, maxWy: 16 },
      { minWx: 18, maxWx: 34, minWz: -8, maxWz: 12, maxWy: 22 }
    ]
  };
  sm._lastEnvCheckMs = -1000;
  assert.equal(sm.updateListenerEnvironment({ x: 14, y: 1.5, z: 0 }, mockWorld, false), 'urban_canyon');
  sm._lastEnvCheckMs = -1000;
  assert.equal(sm.updateListenerEnvironment({ x: 0, y: 1.5, z: 0 }, mockWorld, false), 'indoor_room');
  sm._lastEnvCheckMs = -1000;
  assert.equal(sm.updateListenerEnvironment({ x: 400, y: 1.5, z: 400 }, mockWorld, false), 'open_valley');

  // 2. Ground Vehicle Engine Audio now initializes & modulates Humvee / Tank / Bike engines cleanly!
  sm.setVolume('vehicles', 85);
  sm.updateGroundVehicleEngineAudio(
    [{ type: 'tank', team: 'RU', dead: false, isAircraft: false, forwardSpeed: 14, maxSpeed: 20, pos: { x: 25, y: 0, z: 0 } }],
    { type: 'humvee', dead: false, isAircraft: false, forwardSpeed: 18, maxSpeed: 26 },
    { x: 0, y: 0, z: 0 },
    0
  );
  assert.ok(sm._groundEngineNodes, 'Expected _groundEngineNodes graph to be created without throwing');
  assert.ok(sm._groundEngineNodes.selfBusGain.gain.value > 0.05, 'Expected active Humvee engine gain > 0.05');
  assert.ok(sm._groundEngineNodes.extBusGain.gain.value > 0.01, 'Expected nearby external T-90M pass-by gain > 0.01');

  // 3. Speed-of-Sound (343 m/s) delay on distant 343m explosion (~1.0s delay after ctx.currentTime = 10.0)
  const srcCountBefore = mockCtx.created.bufferSources.length;
  sm._lastExplosionTime = -1000;
  sm.playExplosion(343, 0.35, 1.2);
  const newSources = mockCtx.created.bufferSources.slice(srcCountBefore);
  assert.ok(newSources.length >= 1, 'Expected distant explosion buffer source');
  const expectedStart = 10.0 + 343 / (AUDIO.SPEED_OF_SOUND_MPS || 343);
  assert.ok(
    Math.abs(newSources[0].startedAt - expectedStart) < 0.05,
    `Expected speed-of-sound delayed start ~${expectedStart.toFixed(2)}s, got ${newSources[0].startedAt}`
  );

  // 4. Wall Occlusion lowers lowpass filter cutoff & Supersonic Bullet Whiz + Micro-SFX execute cleanly
  const filtBefore = mockCtx.created.filters.length;
  sm.playProfile('rifle', 40, 0, 0, 1.0, 1.0, false, false);
  const openCutoff = mockCtx.created.filters[filtBefore].frequency.value;
  sm.playProfile('rifle', 40, 0, 0, 1.0, 1.0, false, true);
  const occludedCutoff = mockCtx.created.filters[filtBefore + 1].frequency.value;
  assert.ok(occludedCutoff < openCutoff * 0.5, 'Expected occluded gunshot LPF cutoff < 50% of open LOS');

  sm._lastWhizTime = -1000;
  sm.playBulletWhiz(4, -0.6);
  sm.playEmptyClick();
  sm.playWeaponSwitch();
  sm.playGunshot('amr', 0, 0, false, WEAPON_DEFS.ntw20);
});

test('v141 Layer 3: Standard MIDI (.mid SMF) parser & Adaptive General MIDI Combat Soundtrack Engine', () => {
  // 1. Round-trip Standard MIDI File (.mid) binary encode + decode
  const rawMidi = buildStandardMidiBytes(
    [
      { tick: 0, order: 0, type: 'program', channel: 2, program: 60 },
      { tick: 0, order: 1, type: 'noteOn', channel: 2, note: 62, velocity: 100 },
      { tick: 96, order: 0, type: 'noteOff', channel: 2, note: 62 },
      { tick: 96, order: 1, type: 'noteOn', channel: 9, note: 36, velocity: 112 },
      { tick: 144, order: 0, type: 'noteOff', channel: 9, note: 36 }
    ],
    96,
    120
  );
  assert.equal(String.fromCharCode(rawMidi[0], rawMidi[1], rawMidi[2], rawMidi[3]), 'MThd');
  const parsed = parseStandardMidiBytes(rawMidi);
  assert.equal(parsed.bpm, 120);
  assert.equal(parsed.programs.length, 1);
  assert.equal(parsed.programs[0].program, 60);
  assert.equal(parsed.notes.length, 2);
  assert.ok(Math.abs(parsed.notes[0].durationSec - 0.5) < 0.02);

  // 2. Adaptive MIDI cue transitions (Deploy -> Patrol -> Combat -> Finale -> Medieval) + Music volume slider
  const sm = new SoundManager();
  const mockCtx = createMockAudioContext();
  sm.ctx = mockCtx;
  sm.init = () => {};
  sm.setupCleanMasterBus();
  sm.setupReverbSystem();
  sm.setVolume('music', 75);
  assert.equal(sm.getVolume('music'), 75);

  const midi = sm.midiEngine;
  assert.ok(midi instanceof MidiSynthEngine);

  midi._lastTickWallMs = -1000;
  midi.updateAdaptiveMusic({ era: 'modern', onDeployMenu: true, minTickets: 800, matchTimeRemaining: 900, inCombat: false });
  assert.equal(midi.currentCueKey, 'modern_deploy');

  midi._lastTickWallMs = -1000;
  midi.updateAdaptiveMusic({ era: 'modern', onDeployMenu: false, minTickets: 800, matchTimeRemaining: 850, inCombat: false });
  assert.equal(midi.currentCueKey, 'modern_patrol');

  midi._lastTickWallMs = -1000;
  midi.updateAdaptiveMusic({ era: 'modern', onDeployMenu: false, minTickets: 500, matchTimeRemaining: 600, inCombat: true });
  assert.equal(midi.currentCueKey, 'modern_combat');

  midi._lastTickWallMs = -1000;
  midi.updateAdaptiveMusic({ era: 'modern', onDeployMenu: false, minTickets: 60, matchTimeRemaining: 400, inCombat: true });
  assert.equal(midi.currentCueKey, 'modern_finale');

  midi._lastTickWallMs = -1000;
  midi.updateAdaptiveMusic({ era: 'medieval', onDeployMenu: false, minTickets: 400, matchTimeRemaining: 500, inCombat: true });
  assert.equal(midi.currentCueKey, 'medieval_combat');

  const oscBefore = mockCtx.created.oscillators.length;
  sm.playMusicStinger('victory');
  assert.ok(mockCtx.created.oscillators.length > oscBefore, 'Expected victory MIDI stinger to schedule oscillators');
});
