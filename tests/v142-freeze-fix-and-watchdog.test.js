import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SoundManager, MidiSynthEngine } from '../src/audio/index.js?v=145';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

test('v142 Regression: MidiSynthEngine runs 30 full minutes (0..1800s) across ALL 6 BPM cues without hanging on IEEE-754 cycle boundaries', () => {
  const sm = new SoundManager();
  let fakeTime = 0;
  sm.ctx = {
    state: 'running',
    get currentTime() {
      return fakeTime;
    },
    sampleRate: 32000,
    destination: {}
  };
  sm.masterBus = {};
  sm.init = () => {};
  sm.setVolume('music', 75);

  const midi = sm.midiEngine;
  assert.ok(midi instanceof MidiSynthEngine);

  // Stub triggerMidiNote so we purely stress-test the scheduler loop across 16,000+ ticks per cue!
  let scheduledNoteCount = 0;
  midi.triggerMidiNote = (_ch, _prog, _note, _vel, when) => {
    assert.ok(Number.isFinite(when), 'Scheduled note timestamp must be finite');
    scheduledNoteCount++;
  };

  const scenarios = [
    { label: 'modern_deploy (76 BPM — previously froze at k=3 / 37.9s!)', state: { era: 'modern', onDeployMenu: true, minTickets: 800, matchTimeRemaining: 900, inCombat: false } },
    { label: 'modern_patrol (92 BPM — previously froze at k=13 / 135.7s!)', state: { era: 'modern', onDeployMenu: false, minTickets: 800, matchTimeRemaining: 800, inCombat: false } },
    { label: 'modern_combat (124 BPM — previously froze at k=11 / 85.2s!)', state: { era: 'modern', onDeployMenu: false, minTickets: 500, matchTimeRemaining: 600, inCombat: true } },
    { label: 'modern_finale (138 BPM — previously froze at k=27 / 187.8s!)', state: { era: 'modern', onDeployMenu: false, minTickets: 50, matchTimeRemaining: 60, inCombat: true } },
    { label: 'medieval_deploy (88 BPM — previously froze at k=27 / 294.5s!)', state: { era: 'medieval', onDeployMenu: true, minTickets: 800, matchTimeRemaining: 900, inCombat: false } },
    { label: 'medieval_combat (132 BPM — previously froze at k=57 / 414.5s!)', state: { era: 'medieval', onDeployMenu: false, minTickets: 400, matchTimeRemaining: 500, inCombat: true } }
  ];

  const tStartWall = performance.now();
  for (const sc of scenarios) {
    fakeTime += 10.0;
    const baseTime = fakeTime;
    // Simulate 1,800 seconds (30 full minutes!) at 120ms intervals, PLUS a 180s tab-background jump in the middle
    for (let step = 0; step <= 15000; step++) {
      fakeTime = baseTime + step * 0.12 + (step > 7500 ? 180.0 : 0);
      midi._lastTickWallMs = -1000;
      midi.updateAdaptiveMusic(sc.state);
    }
  }
  const elapsedWallMs = performance.now() - tStartWall;
  assert.ok(elapsedWallMs < 2500, `Expected 3 hours of simulated MIDI scheduling to finish in <2.5s, took ${elapsedWallMs.toFixed(1)}ms`);
  assert.ok(scheduledNoteCount > 10000, `Expected >10,000 MIDI notes scheduled cleanly, got ${scheduledNoteCount}`);
});

test('v142 Watchdog Timer, Per-Stage Fault Isolation & Budgeted Chunk Flushing are wired in main.js, VoxelWorld.js & HudRenderer.js', () => {
  const mainSrc = fs.readFileSync(path.join(PROJECT_ROOT, 'src/main.js'), 'utf8');
  assert.ok(mainSrc.includes('window.getWatchdogReport'), 'Expected window.getWatchdogReport() helper');
  assert.ok(mainSrc.includes('_runTimedStage('), 'Expected _runTimedStage fault-isolated timer wrapper');
  assert.ok(mainSrc.includes('_watchdogTimerId = setInterval'), 'Expected 750ms heartbeat watchdog timer');

  const hudSrc = fs.readFileSync(path.join(PROJECT_ROOT, 'src/ui/HudRenderer.js'), 'utf8');
  assert.ok(hudSrc.includes('Watchdog Timer [F2]'), 'Expected Watchdog Timer readout on [F2] FPS HUD');

  const worldSrc = fs.readFileSync(path.join(PROJECT_ROOT, 'src/world/VoxelWorld.js'), 'utf8');
  assert.ok(worldSrc.includes('flushDirtyVoxelChunks(8.5)'), 'Expected 8.5ms per-frame budget on runtime dirty chunk rebuilds');
});
