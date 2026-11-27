// ============================================================================
// GENERAL MIDI SYNTHESIZER, .MID PARSER & ADAPTIVE COMBAT SCORE ENGINE
// (src/audio/MidiSynthEngine.js)
// - Zero-dependency Web Audio General MIDI (GM) polyphonic synthesizer + Channel 10
//   orchestral/industrial drum kit + Standard MIDI File (.mid SMF Format 0/1) parser.
// - Drives adaptive era-aware combat music ('deploy', 'patrol', 'combat', 'finale')
//   and event stingers ('victory', 'defeat', 'objective_captured', 'objective_lost').
// ============================================================================

function midiToFreq(note) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

function writeVarLen(value) {
  let v = Math.max(0, value >>> 0);
  const bytes = [v & 0x7f];
  while ((v >>= 7) > 0) {
    bytes.unshift((v & 0x7f) | 0x80);
  }
  return bytes;
}

/**
 * Encodes a note/program event list into a genuine Standard MIDI File (.mid SMF Format 0)
 * Uint8Array so all procedural scores are true General MIDI streams.
 */
export function buildStandardMidiBytes(events, ticksPerBeat = 96, bpm = 120) {
  const sorted = [...events].sort((a, b) => a.tick - b.tick || (a.order || 0) - (b.order || 0));
  const trackBytes = [];

  // Tempo meta event FF 51 03 tt tt tt (microseconds per quarter note)
  const mpqn = Math.round(60000000 / Math.max(30, bpm));
  trackBytes.push(0x00, 0xff, 0x51, 0x03, (mpqn >> 16) & 0xff, (mpqn >> 8) & 0xff, mpqn & 0xff);

  let lastTick = 0;
  for (let i = 0; i < sorted.length; i++) {
    const ev = sorted[i];
    const delta = Math.max(0, Math.round(ev.tick - lastTick));
    lastTick += delta;
    trackBytes.push(...writeVarLen(delta));
    const ch = (ev.channel ?? 0) & 0x0f;
    if (ev.type === 'program') {
      trackBytes.push(0xc0 | ch, (ev.program ?? 0) & 0x7f);
    } else if (ev.type === 'noteOn') {
      trackBytes.push(0x90 | ch, (ev.note ?? 60) & 0x7f, Math.max(1, Math.min(127, ev.velocity ?? 96)));
    } else if (ev.type === 'noteOff') {
      trackBytes.push(0x80 | ch, (ev.note ?? 60) & 0x7f, 0x00);
    }
  }
  // End of Track FF 2F 00
  trackBytes.push(0x00, 0xff, 0x2f, 0x00);

  const out = new Uint8Array(14 + 8 + trackBytes.length);
  const view = new DataView(out.buffer);
  // MThd
  out.set([0x4d, 0x54, 0x68, 0x64], 0);
  view.setUint32(4, 6, false);
  view.setUint16(8, 0, false); // Format 0
  view.setUint16(10, 1, false); // 1 track
  view.setUint16(12, ticksPerBeat, false);
  // MTrk
  out.set([0x4d, 0x54, 0x72, 0x6b], 14);
  view.setUint32(18, trackBytes.length, false);
  out.set(trackBytes, 22);
  return out;
}

/**
 * Parses a Standard MIDI File (.mid SMF Format 0 or 1) Uint8Array/ArrayBuffer
 * into timed note & program events in seconds.
 */
export function parseStandardMidiBytes(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 22) return { bpm: 120, durationSec: 0, notes: [], programs: [] };
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== 'MThd') return { bpm: 120, durationSec: 0, notes: [], programs: [] };

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerLen = view.getUint32(4, false);
  const numTracks = view.getUint16(10, false);
  const division = view.getUint16(12, false);
  const ticksPerBeat = division & 0x7fff || 96;

  let offset = 8 + headerLen;
  let bpm = 120;
  const rawEvents = [];

  for (let t = 0; t < numTracks && offset + 8 <= bytes.length; t++) {
    const chunkId = String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3]
    );
    const chunkLen = view.getUint32(offset + 4, false);
    const end = Math.min(bytes.length, offset + 8 + chunkLen);
    let pos = offset + 8;
    let tick = 0;
    let runningStatus = 0;

    const readVLQ = () => {
      let val = 0;
      for (let k = 0; k < 4 && pos < end; k++) {
        const b = bytes[pos++];
        val = (val << 7) | (b & 0x7f);
        if ((b & 0x80) === 0) break;
      }
      return val;
    };

    if (chunkId === 'MTrk') {
      while (pos < end) {
        tick += readVLQ();
        if (pos >= end) break;
        let status = bytes[pos];
        if (status < 0x80) {
          status = runningStatus;
        } else {
          pos++;
          if (status < 0xf0) runningStatus = status;
        }

        if (status === 0xff) {
          const metaType = bytes[pos++];
          const len = readVLQ();
          if (metaType === 0x51 && len === 3 && pos + 3 <= end) {
            const mpqn = (bytes[pos] << 16) | (bytes[pos + 1] << 8) | bytes[pos + 2];
            if (mpqn > 0) bpm = Math.round(60000000 / mpqn);
          }
          pos += len;
        } else if (status === 0xf0 || status === 0xf7) {
          const len = readVLQ();
          pos += len;
        } else {
          const cmd = status & 0xf0;
          const ch = status & 0x0f;
          if (cmd === 0xc0 || cmd === 0xd0) {
            const d1 = bytes[pos++] & 0x7f;
            if (cmd === 0xc0) rawEvents.push({ tick, type: 'program', channel: ch, program: d1 });
          } else {
            const d1 = bytes[pos++] & 0x7f;
            const d2 = bytes[pos++] & 0x7f;
            if (cmd === 0x90 && d2 > 0) {
              rawEvents.push({ tick, type: 'noteOn', channel: ch, note: d1, velocity: d2 });
            } else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) {
              rawEvents.push({ tick, type: 'noteOff', channel: ch, note: d1 });
            }
          }
        }
      }
    }
    offset = end;
  }

  rawEvents.sort((a, b) => a.tick - b.tick);
  const secPerTick = 60 / (Math.max(30, bpm) * ticksPerBeat);
  const active = new Map();
  const notes = [];
  const programs = [];
  let maxSec = 0;

  for (let i = 0; i < rawEvents.length; i++) {
    const ev = rawEvents[i];
    const timeSec = ev.tick * secPerTick;
    if (timeSec > maxSec) maxSec = timeSec;
    if (ev.type === 'program') {
      programs.push({ timeSec, channel: ev.channel, program: ev.program });
    } else if (ev.type === 'noteOn') {
      const key = `${ev.channel}:${ev.note}`;
      active.set(key, { timeSec, velocity: ev.velocity, channel: ev.channel, note: ev.note });
    } else if (ev.type === 'noteOff') {
      const key = `${ev.channel}:${ev.note}`;
      const start = active.get(key);
      if (start) {
        active.delete(key);
        const dur = Math.max(0.05, timeSec - start.timeSec);
        notes.push({
          timeSec: start.timeSec,
          durationSec: dur,
          channel: start.channel,
          note: start.note,
          velocity: start.velocity
        });
        if (start.timeSec + dur > maxSec) maxSec = start.timeSec + dur;
      }
    }
  }

  return { bpm, ticksPerBeat, durationSec: maxSec, notes, programs };
}

// Helper to author compact multi-channel General MIDI score loops (encoded to SMF .mid and parsed!)
function compileLoopScore(bpm, bars, beatsPerBar, trackDefs) {
  const TPB = 96;
  const events = [];
  for (const tr of trackDefs) {
    const ch = tr.channel ?? 0;
    if (tr.program !== undefined && ch !== 9) {
      events.push({ tick: 0, order: 0, type: 'program', channel: ch, program: tr.program });
    }
    for (const [beat, note, durBeats, vel = 92] of tr.notes) {
      const startTick = Math.round(beat * TPB);
      const endTick = Math.max(startTick + 12, Math.round((beat + durBeats) * TPB));
      events.push({ tick: startTick, order: 1, type: 'noteOn', channel: ch, note, velocity: vel });
      events.push({ tick: endTick, order: 0, type: 'noteOff', channel: ch, note });
    }
  }
  const midiBytes = buildStandardMidiBytes(events, TPB, bpm);
  const parsed = parseStandardMidiBytes(midiBytes);
  parsed.loopDurationSec = (bars * beatsPerBar * 60) / bpm;
  parsed.midiBytes = midiBytes;
  return parsed;
}

// ============================================================================
// BUILT-IN ADAPTIVE GENERAL MIDI SCORES (Modern Combined-Arms & Medieval Era)
// ============================================================================
function buildAdaptiveScoreBank() {
  // 1. MODERN DEPLOY BRIEFING (76 BPM, 4 bars = 12.63s): Deep D-minor tactical pulse + French Horn motif
  const modern_deploy = compileLoopScore(76, 4, 4, [
    {
      channel: 0,
      program: 38, // GM Synth Sub-Bass ("DUN-DUN" tactical heartbeat)
      notes: [
        [0, 38, 0.45, 84], [0.75, 38, 0.45, 72],
        [4, 38, 0.45, 84], [4.75, 38, 0.45, 72],
        [8, 34, 0.45, 86], [8.75, 34, 0.45, 74],
        [12, 33, 0.45, 88], [12.75, 38, 0.65, 80]
      ]
    },
    {
      channel: 1,
      program: 49, // GM Slow Strings pad (D2-A2-F3 -> Bb1-F2-D3 -> A1-E2-C#3)
      notes: [
        [0, 50, 7.6, 58], [0, 57, 7.6, 54], [0, 65, 7.6, 50],
        [8, 46, 3.8, 60], [8, 53, 3.8, 54], [8, 62, 3.8, 52],
        [12, 45, 3.8, 62], [12, 52, 3.8, 54], [12, 61, 3.8, 50]
      ]
    },
    {
      channel: 2,
      program: 60, // GM French Horn solemn theme
      notes: [
        [2.0, 62, 1.8, 72], [4.0, 65, 1.5, 78], [5.5, 64, 2.2, 70],
        [10.0, 62, 1.8, 74], [12.0, 57, 3.5, 76]
      ]
    },
    {
      channel: 9, // GM Percussion
      notes: [
        [0, 36, 0.5, 85], [0.75, 36, 0.5, 68],
        [4, 36, 0.5, 82], [4.75, 36, 0.5, 66],
        [8, 36, 0.5, 86], [8.75, 36, 0.5, 70],
        [12, 36, 0.5, 88], [14.0, 45, 0.5, 64]
      ]
    }
  ]);

  // 2. MODERN PATROL / TACTICAL TENSION (92 BPM, 4 bars): Subtle low-profile sub-pulse so footsteps stay clear
  const modern_patrol = compileLoopScore(92, 4, 4, [
    {
      channel: 0,
      program: 38,
      notes: [
        [0, 38, 0.35, 64], [3.5, 38, 0.35, 52],
        [8, 34, 0.35, 64], [11.5, 36, 0.35, 56]
      ]
    },
    {
      channel: 1,
      program: 49,
      notes: [
        [0, 50, 7.5, 42], [0, 57, 7.5, 38],
        [8, 46, 7.5, 42], [8, 53, 7.5, 38]
      ]
    },
    {
      channel: 9,
      notes: [
        [0, 36, 0.4, 62], [8, 36, 0.4, 62], [15.0, 42, 0.25, 42]
      ]
    }
  ]);

  // 3. MODERN COMBAT / CONTESTED OBJECTIVE (124 BPM, 4 bars):
  //    Signature Battlefield "DUN-DUN DUN-DUN-DUN" syncopated bass + brass stabs + metallic anvil percussion!
  const modern_combat = compileLoopScore(124, 4, 4, [
    {
      channel: 0,
      program: 38, // Industrial Saturated Sub-Bass (BF3/BF4 3+3+2 / syncopated riff!)
      notes: [
        [0, 38, 0.4, 102], [0.5, 38, 0.4, 92], [1.5, 38, 0.4, 104], [2.0, 38, 0.4, 94], [2.5, 41, 0.45, 100],
        [4, 38, 0.4, 102], [4.5, 38, 0.4, 92], [5.5, 38, 0.4, 104], [6.0, 43, 0.4, 96], [6.5, 41, 0.45, 98],
        [8, 34, 0.4, 104], [8.5, 34, 0.4, 92], [9.5, 34, 0.4, 104], [10.0, 34, 0.4, 94], [10.5, 38, 0.45, 100],
        [12, 36, 0.4, 104], [12.5, 36, 0.4, 94], [13.5, 36, 0.4, 104], [14.0, 40, 0.45, 100], [15.0, 37, 0.6, 102]
      ]
    },
    {
      channel: 1,
      program: 48, // Spiccato String Ostinato
      notes: [
        [0, 62, 0.35, 74], [0.5, 62, 0.35, 66], [1.0, 65, 0.35, 72], [1.5, 62, 0.35, 76],
        [2.0, 69, 0.35, 74], [2.5, 65, 0.35, 70], [3.0, 62, 0.35, 68], [3.5, 64, 0.35, 72],
        [4, 62, 0.35, 74], [4.5, 62, 0.35, 66], [5.0, 65, 0.35, 72], [5.5, 62, 0.35, 76],
        [6.0, 70, 0.35, 78], [6.5, 69, 0.35, 74], [7.0, 65, 0.35, 70], [7.5, 64, 0.35, 72],
        [8, 58, 0.35, 76], [8.5, 58, 0.35, 68], [9.0, 62, 0.35, 74], [9.5, 65, 0.35, 78],
        [10.0, 69, 0.35, 76], [10.5, 65, 0.35, 72], [11.0, 62, 0.35, 70], [11.5, 60, 0.35, 72],
        [12, 60, 0.35, 78], [12.5, 64, 0.35, 74], [13.0, 67, 0.35, 78], [13.5, 69, 0.35, 82],
        [14.0, 67, 0.4, 78], [14.5, 64, 0.4, 74], [15.0, 61, 0.75, 84]
      ]
    },
    {
      channel: 2,
      program: 61, // Brass Section Stabs
      notes: [
        [0, 50, 1.2, 86], [2.5, 53, 1.0, 84],
        [6.0, 55, 0.9, 88], [8.0, 46, 1.5, 90],
        [12.0, 48, 1.4, 90], [14.0, 49, 1.8, 92]
      ]
    },
    {
      channel: 9, // Drum Kit (Kick + Snare + Taiko + Metallic Anvil Clang!)
      notes: [
        [0, 36, 0.3, 108], [0.5, 36, 0.3, 94], [1.5, 36, 0.3, 106], [2.0, 38, 0.3, 98], [2.5, 42, 0.25, 88], [3.5, 45, 0.3, 86],
        [4, 36, 0.3, 108], [4.5, 36, 0.3, 94], [5.5, 36, 0.3, 106], [6.0, 38, 0.3, 102], [6.5, 46, 0.35, 90], [7.5, 38, 0.25, 84],
        [8, 36, 0.3, 110], [8.5, 36, 0.3, 94], [9.5, 36, 0.3, 106], [10.0, 38, 0.3, 100], [10.5, 42, 0.25, 88], [11.5, 43, 0.3, 90],
        [12, 36, 0.3, 110], [12.5, 41, 0.3, 96], [13.5, 36, 0.3, 108], [14.0, 38, 0.3, 106], [14.5, 38, 0.25, 92], [15.0, 49, 0.8, 96]
      ]
    }
  ]);

  // 4. MODERN FINALE / LOW TICKETS (<85 TICKETS OR <90s — 138 BPM, 4 bars): Full Orchestral + Choir + Industrial Crescendo!
  const modern_finale = compileLoopScore(138, 4, 4, [
    {
      channel: 0,
      program: 38,
      notes: [
        [0, 38, 0.35, 112], [0.5, 38, 0.35, 100], [1.5, 38, 0.35, 112], [2.0, 38, 0.35, 102], [2.5, 41, 0.4, 108], [3.0, 43, 0.4, 106],
        [4, 34, 0.35, 112], [4.5, 34, 0.35, 100], [5.5, 34, 0.35, 112], [6.0, 38, 0.4, 106], [6.5, 41, 0.4, 108], [7.0, 40, 0.4, 106],
        [8, 36, 0.35, 112], [8.5, 36, 0.35, 100], [9.5, 36, 0.35, 112], [10.0, 40, 0.4, 108], [10.5, 43, 0.4, 110], [11.0, 45, 0.4, 108],
        [12, 37, 0.35, 114], [12.5, 37, 0.35, 104], [13.5, 37, 0.35, 114], [14.0, 45, 0.45, 112], [15.0, 38, 0.75, 116]
      ]
    },
    {
      channel: 2,
      program: 60, // Soaring Heroic French Horn Lead
      notes: [
        [0, 62, 1.5, 102], [1.5, 65, 1.0, 104], [2.5, 69, 1.4, 108],
        [4, 70, 1.5, 110], [5.5, 69, 1.0, 104], [6.5, 65, 1.4, 102],
        [8, 67, 1.5, 108], [9.5, 69, 1.0, 108], [10.5, 72, 1.4, 112],
        [12, 73, 2.0, 114], [14, 69, 1.8, 110]
      ]
    },
    {
      channel: 3,
      program: 52, // Choir Aahs
      notes: [
        [0, 62, 3.8, 78], [0, 69, 3.8, 74],
        [4, 58, 3.8, 80], [4, 65, 3.8, 76],
        [8, 60, 3.8, 82], [8, 67, 3.8, 78],
        [12, 61, 3.8, 86], [12, 69, 3.8, 82]
      ]
    },
    {
      channel: 9,
      notes: [
        [0, 36, 0.3, 116], [0, 49, 0.9, 98], [0.5, 36, 0.3, 102], [1.0, 42, 0.2, 86], [1.5, 36, 0.3, 112],
        [2.0, 38, 0.3, 110], [2.5, 46, 0.3, 96], [3.0, 41, 0.3, 98], [3.5, 38, 0.25, 96],
        [4, 36, 0.3, 116], [4.5, 36, 0.3, 102], [5.0, 42, 0.2, 86], [5.5, 36, 0.3, 112],
        [6.0, 38, 0.3, 112], [6.5, 43, 0.3, 100], [7.0, 45, 0.3, 100], [7.5, 38, 0.25, 102],
        [8, 36, 0.3, 116], [8, 49, 0.8, 92], [8.5, 36, 0.3, 104], [9.5, 36, 0.3, 112],
        [10.0, 38, 0.3, 112], [10.5, 46, 0.3, 98], [11.0, 41, 0.3, 102], [11.5, 43, 0.3, 104],
        [12, 36, 0.3, 118], [12.5, 41, 0.3, 106], [13.0, 38, 0.3, 108], [13.5, 36, 0.3, 114],
        [14.0, 38, 0.3, 116], [14.5, 38, 0.25, 108], [15.0, 38, 0.25, 112], [15.5, 49, 0.8, 106]
      ]
    }
  ]);

  // 5. MEDIEVAL ERA DEPLOY / TAVERN & KEEP (88 BPM, 4 bars): Plucked Medieval Lute + Bowed Strings + Frame Drum
  const medieval_deploy = compileLoopScore(88, 4, 4, [
    {
      channel: 0,
      program: 24, // GM Acoustic Lute / Harp arpeggio (D Dorian: D-E-F-G-A-B-C)
      notes: [
        [0, 50, 0.9, 82], [0.5, 57, 0.9, 76], [1.0, 62, 0.9, 84], [1.5, 65, 0.9, 78],
        [2.0, 64, 0.9, 80], [2.5, 62, 0.9, 76], [3.0, 57, 0.9, 74], [3.5, 60, 0.9, 78],
        [4, 48, 0.9, 82], [4.5, 55, 0.9, 76], [5.0, 60, 0.9, 84], [5.5, 64, 0.9, 78],
        [6.0, 62, 0.9, 80], [6.5, 60, 0.9, 74], [7.0, 55, 0.9, 72], [7.5, 57, 0.9, 76],
        [8, 46, 0.9, 84], [8.5, 53, 0.9, 76], [9.0, 58, 0.9, 82], [9.5, 62, 0.9, 80],
        [10.0, 65, 0.9, 84], [10.5, 62, 0.9, 76], [11.0, 58, 0.9, 74], [11.5, 57, 0.9, 76],
        [12, 45, 1.2, 84], [13.0, 52, 1.0, 78], [14.0, 57, 1.8, 86]
      ]
    },
    {
      channel: 1,
      program: 49,
      notes: [
        [0, 50, 7.6, 54], [0, 57, 7.6, 50],
        [8, 46, 3.8, 56], [12, 45, 3.8, 58]
      ]
    },
    {
      channel: 9,
      notes: [
        [0, 41, 0.5, 76], [3.0, 45, 0.4, 62],
        [4, 41, 0.5, 74], [7.0, 45, 0.4, 62],
        [8, 41, 0.5, 78], [12, 41, 0.6, 82], [14, 43, 0.5, 68]
      ]
    }
  ]);

  // 6. MEDIEVAL ERA CAVALRY & SHIELD-WALL CHARGE (132 BPM, 4 bars): Mount & Blade War Drums + Heroic Brass + Choir!
  const medieval_combat = compileLoopScore(132, 4, 4, [
    {
      channel: 0,
      program: 48, // Driving Low Cello/String Gallop
      notes: [
        [0, 38, 0.4, 96], [0.5, 38, 0.25, 82], [0.75, 38, 0.25, 86], [1.0, 38, 0.4, 94], [2.0, 45, 0.45, 92], [3.0, 43, 0.45, 90],
        [4, 38, 0.4, 96], [4.5, 38, 0.25, 82], [4.75, 38, 0.25, 86], [5.0, 41, 0.4, 94], [6.0, 43, 0.45, 94], [7.0, 40, 0.45, 90],
        [8, 36, 0.4, 98], [8.5, 36, 0.25, 84], [8.75, 36, 0.25, 88], [9.0, 36, 0.4, 96], [10.0, 43, 0.45, 94], [11.0, 40, 0.45, 92],
        [12, 34, 0.8, 100], [13.0, 36, 0.8, 102], [14.0, 38, 1.8, 106]
      ]
    },
    {
      channel: 2,
      program: 60, // Heroic War Horn / Brass Fifths (D Dorian Fanfare!)
      notes: [
        [0, 62, 1.5, 98], [1.5, 69, 1.5, 104], [3.0, 67, 0.9, 96],
        [4, 65, 1.5, 100], [5.5, 64, 1.0, 94], [6.5, 62, 1.4, 96],
        [8, 60, 1.5, 100], [9.5, 64, 1.0, 98], [10.5, 67, 1.4, 104],
        [12, 69, 2.0, 108], [14.0, 62, 1.8, 104]
      ]
    },
    {
      channel: 3,
      program: 52, // Male/Mixed War Choir
      notes: [
        [0, 50, 3.8, 74], [0, 57, 3.8, 72],
        [4, 53, 3.8, 76], [4, 60, 3.8, 72],
        [8, 48, 3.8, 76], [8, 55, 3.8, 74],
        [12, 50, 3.8, 82], [12, 62, 3.8, 78]
      ]
    },
    {
      channel: 9, // War Taiko Toms + Shield Slam + Sword Steel Ring
      notes: [
        [0, 41, 0.4, 110], [0.75, 43, 0.25, 88], [1.0, 41, 0.35, 102], [2.0, 45, 0.35, 98], [3.0, 43, 0.35, 94], [3.5, 41, 0.25, 90],
        [4, 41, 0.4, 110], [4.75, 43, 0.25, 88], [5.0, 41, 0.35, 102], [6.0, 38, 0.35, 96], [7.0, 45, 0.35, 98], [7.5, 43, 0.25, 92],
        [8, 41, 0.4, 112], [8.75, 43, 0.25, 90], [9.0, 41, 0.35, 104], [10.0, 45, 0.35, 100], [11.0, 43, 0.35, 96],
        [12, 36, 0.4, 112], [12, 49, 0.9, 92], [13.0, 41, 0.4, 106], [14.0, 41, 0.5, 114], [15.0, 43, 0.4, 100]
      ]
    }
  ]);

  return {
    modern_deploy,
    modern_patrol,
    modern_combat,
    modern_finale,
    medieval_deploy,
    medieval_combat
  };
}

export class MidiSynthEngine {
  constructor(soundManager) {
    this.sm = soundManager;
    this.scoreBank = buildAdaptiveScoreBank();
    this.channelPrograms = new Uint8Array(16);
    this.currentCueKey = null;
    this.musicBus = null;
    this.musicFilter = null;
    this._loopAnchorTime = 0;
    this._scheduledCycle = 0;
    this._scheduledPosInCycle = 0;
    this._lastTickWallMs = 0;
    this._combatHoldUntilMs = 0;
  }

  _ensureMusicBus() {
    const ctx = this.sm?.ctx;
    if (!ctx || !this.sm.masterBus) return null;
    if (this.musicBus && this._busCtx === ctx) return this.musicBus;

    this._busCtx = ctx;
    const bus = ctx.createGain();
    const volMult = this.sm.getCategoryMult('music');
    bus.gain.value = Math.max(0.0001, 0.34 * volMult);

    const warmthLp = ctx.createBiquadFilter();
    warmthLp.type = 'lowpass';
    warmthLp.frequency.value = 5400;
    warmthLp.Q.value = 0.55;

    bus.connect(warmthLp);
    warmthLp.connect(this.sm.masterBus);

    // Also feed environmental hall/valley ConvolverNode so orchestral brass & drums bloom in stereo!
    if (typeof this.sm.connectToReverbSend === 'function') {
      this.sm.connectToReverbSend(warmthLp, 0.38);
    }

    this.musicBus = bus;
    this.musicFilter = warmthLp;
    return bus;
  }

  syncVolume() {
    if (!this.musicBus || !this.sm?.ctx) return;
    const volMult = this.sm.volumes?.muted ? 0 : this.sm.getCategoryMult('music');
    const cueScale = this.currentCueKey?.endsWith('_patrol') ? 0.22 : 0.34;
    const target = Math.max(0.0001, cueScale * volMult);
    try {
      this.musicBus.gain.setTargetAtTime(target, this.sm.ctx.currentTime, 0.08);
    } catch (_) {
      this.musicBus.gain.value = target;
    }
  }

  /**
   * Synthesizes a single General MIDI note or Channel 10 Drum hit at exact WebAudio time `when`.
   */
  triggerMidiNote(channel, program, note, velocity = 96, when = 0, durationSec = 0.35) {
    const ctx = this.sm?.ctx;
    const bus = this._ensureMusicBus();
    if (!ctx || !bus) return;

    const start = Math.max(ctx.currentTime, when);
    const velNorm = Math.max(0.08, Math.min(1.0, velocity / 127));

    if (channel === 9) {
      this._triggerGmDrum(ctx, bus, note, velNorm, start);
      return;
    }

    const freq = midiToFreq(note);
    const dur = Math.max(0.06, Math.min(8.5, durationSec));

    // Patch 38: Battlefield Industrial Saturated Sub-Bass
    if (program === 38 || program === 39) {
      const sub = ctx.createOscillator();
      const saw = ctx.createOscillator();
      sub.type = 'sine';
      saw.type = 'sawtooth';
      sub.frequency.setValueAtTime(freq, start);
      saw.frequency.setValueAtTime(freq * 1.003, start);

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(110 + velNorm * 580, start);
      lp.frequency.exponentialRampToValueAtTime(85, start + dur);
      lp.Q.value = 3.2;

      const g = ctx.createGain();
      const peak = 0.26 * velNorm;
      g.gain.setValueAtTime(0.0008, start);
      g.gain.linearRampToValueAtTime(peak, start + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0008, start + dur + 0.04);

      sub.connect(g);
      saw.connect(lp);
      lp.connect(g);
      g.connect(bus);
      this.sm._bindMultiShotCleanup([sub, saw], g, false);
      sub.start(start);
      saw.start(start);
      sub.stop(start + dur + 0.06);
      saw.stop(start + dur + 0.06);
      return;
    }

    // Patch 60 / 61: GM French Horn & Orchestral Brass Section
    if (program >= 56 && program <= 63) {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc2.type = 'sawtooth';
      osc1.frequency.setValueAtTime(freq * 0.997, start);
      osc2.frequency.setValueAtTime(freq * 1.003, start);

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(280, start);
      lp.frequency.exponentialRampToValueAtTime(950 + velNorm * 1650, start + Math.min(0.14, dur * 0.35));
      lp.frequency.exponentialRampToValueAtTime(620, start + dur + 0.08);
      lp.Q.value = 1.9;

      const g = ctx.createGain();
      const peak = 0.16 * velNorm;
      g.gain.setValueAtTime(0.0008, start);
      g.gain.linearRampToValueAtTime(peak, start + Math.min(0.065, dur * 0.25));
      g.gain.setValueAtTime(peak * 0.85, start + dur * 0.78);
      g.gain.exponentialRampToValueAtTime(0.0008, start + dur + 0.12);

      osc1.connect(lp);
      osc2.connect(lp);
      lp.connect(g);
      g.connect(bus);
      this.sm._bindMultiShotCleanup([osc1, osc2], g, false);
      osc1.start(start);
      osc2.start(start);
      osc1.stop(start + dur + 0.14);
      osc2.stop(start + dur + 0.14);
      return;
    }

    // Patch 24 / 46: Medieval Lute / Orchestral Harp Plucked String
    if (program === 24 || program === 46) {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type = 'triangle';
      osc2.type = 'sawtooth';
      osc1.frequency.setValueAtTime(freq, start);
      osc2.frequency.setValueAtTime(freq * 2.0, start);

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(2600 * velNorm + 600, start);
      lp.frequency.exponentialRampToValueAtTime(420, start + dur + 0.18);

      const osc2Gain = ctx.createGain();
      osc2Gain.gain.setValueAtTime(0.22, start);
      osc2Gain.gain.exponentialRampToValueAtTime(0.01, start + 0.12);

      const g = ctx.createGain();
      const peak = 0.18 * velNorm;
      g.gain.setValueAtTime(0.001, start);
      g.gain.linearRampToValueAtTime(peak, start + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0008, start + dur + 0.2);

      osc1.connect(lp);
      osc2.connect(osc2Gain);
      osc2Gain.connect(lp);
      lp.connect(g);
      g.connect(bus);
      this.sm._bindMultiShotCleanup([osc1, osc2], g, false);
      osc1.start(start);
      osc2.start(start);
      osc1.stop(start + dur + 0.22);
      osc2.stop(start + dur + 0.22);
      return;
    }

    // Patch 52: Choir Aahs (Dual Vowel Formant Ensemble)
    if (program === 52 || program === 53) {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc2.type = 'sawtooth';
      osc1.frequency.setValueAtTime(freq * 0.995, start);
      osc2.frequency.setValueAtTime(freq * 1.005, start);

      const f1 = ctx.createBiquadFilter();
      f1.type = 'bandpass';
      f1.frequency.value = 730;
      f1.Q.value = 3.6;

      const f2 = ctx.createBiquadFilter();
      f2.type = 'bandpass';
      f2.frequency.value = 1240;
      f2.Q.value = 3.2;

      const g = ctx.createGain();
      const peak = 0.14 * velNorm;
      const atk = Math.min(0.28, dur * 0.3);
      g.gain.setValueAtTime(0.0008, start);
      g.gain.linearRampToValueAtTime(peak, start + atk);
      g.gain.setValueAtTime(peak * 0.88, start + Math.max(atk, dur * 0.8));
      g.gain.exponentialRampToValueAtTime(0.0008, start + dur + 0.22);

      osc1.connect(f1);
      osc2.connect(f1);
      osc1.connect(f2);
      osc2.connect(f2);
      f1.connect(g);
      f2.connect(g);
      g.connect(bus);
      this.sm._bindMultiShotCleanup([osc1, osc2], g, false);
      osc1.start(start);
      osc2.start(start);
      osc1.stop(start + dur + 0.25);
      osc2.stop(start + dur + 0.25);
      return;
    }

    // Default / Patch 48 & 49: Lush Stereo-Detuned String Ensemble (Spiccato or Slow Pad)
    const isSlowPad = program === 49 || dur > 1.2;
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o2.type = 'sawtooth';
    o1.frequency.setValueAtTime(freq * 0.996, start);
    o2.frequency.setValueAtTime(freq * 1.004, start);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(isSlowPad ? 1350 : 2150, start);
    lp.Q.value = 0.8;

    const g = ctx.createGain();
    const peak = (isSlowPad ? 0.11 : 0.135) * velNorm;
    const atk = isSlowPad ? Math.min(0.35, dur * 0.28) : 0.015;
    g.gain.setValueAtTime(0.0008, start);
    g.gain.linearRampToValueAtTime(peak, start + atk);
    g.gain.exponentialRampToValueAtTime(0.0008, start + dur + (isSlowPad ? 0.25 : 0.06));

    o1.connect(lp);
    o2.connect(lp);
    lp.connect(g);
    g.connect(bus);
    this.sm._bindMultiShotCleanup([o1, o2], g, false);
    o1.start(start);
    o2.start(start);
    o1.stop(start + dur + 0.28);
    o2.stop(start + dur + 0.28);
  }

  _triggerGmDrum(ctx, bus, note, velNorm, start) {
    const noiseBuf = this.sm._getSharedNoiseBuffer();

    // 35/36: Orchestral / Industrial Bass Drum
    if (note === 35 || note === 36) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(124, start);
      osc.frequency.exponentialRampToValueAtTime(34, start + 0.24);
      g.gain.setValueAtTime(0.32 * velNorm, start);
      g.gain.exponentialRampToValueAtTime(0.0008, start + 0.28);
      osc.connect(g);
      g.connect(bus);
      this.sm._bindOneShotCleanup(osc, g, false);
      osc.start(start);
      osc.stop(start + 0.3);
      return;
    }

    // 41/43/45/47: Taiko / War Toms
    if (note === 41 || note === 43 || note === 45 || note === 47) {
      const baseHz = note === 41 ? 82 : note === 43 ? 104 : 128;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(baseHz * 1.45, start);
      osc.frequency.exponentialRampToValueAtTime(baseHz * 0.65, start + 0.26);
      g.gain.setValueAtTime(0.26 * velNorm, start);
      g.gain.exponentialRampToValueAtTime(0.0008, start + 0.3);
      osc.connect(g);
      g.connect(bus);
      this.sm._bindOneShotCleanup(osc, g, false);
      osc.start(start);
      osc.stop(start + 0.32);
      return;
    }

    // 38/40: Military Field Snare
    if (note === 38 || note === 40) {
      const body = ctx.createOscillator();
      const bodyG = ctx.createGain();
      body.type = 'triangle';
      body.frequency.setValueAtTime(210, start);
      body.frequency.exponentialRampToValueAtTime(112, start + 0.09);
      bodyG.gain.setValueAtTime(0.18 * velNorm, start);
      bodyG.gain.exponentialRampToValueAtTime(0.0008, start + 0.11);
      body.connect(bodyG);
      bodyG.connect(bus);
      this.sm._bindOneShotCleanup(body, bodyG, false);
      body.start(start);
      body.stop(start + 0.12);

      if (noiseBuf) {
        const nSrc = ctx.createBufferSource();
        nSrc.buffer = noiseBuf;
        const hp = ctx.createBiquadFilter();
        hp.type = 'bandpass';
        hp.frequency.value = 2200;
        hp.Q.value = 1.1;
        const nG = ctx.createGain();
        nG.gain.setValueAtTime(0.19 * velNorm, start);
        nG.gain.exponentialRampToValueAtTime(0.0008, start + 0.16);
        nSrc.connect(hp);
        hp.connect(nG);
        nG.connect(bus);
        this.sm._bindOneShotCleanup(nSrc, nG, false);
        nSrc.start(start, Math.random() * 0.5, 0.17);
        nSrc.stop(start + 0.18);
      }
      return;
    }

    // 42/44/46: Battlefield Metallic Anvil / Hi-Hat Clang
    if (note === 42 || note === 44 || note === 46) {
      const isAnvil = note === 46;
      if (isAnvil) {
        const m1 = ctx.createOscillator();
        const m2 = ctx.createOscillator();
        const mg = ctx.createGain();
        m1.type = 'square';
        m2.type = 'triangle';
        m1.frequency.setValueAtTime(1180, start);
        m2.frequency.setValueAtTime(1795, start);
        mg.gain.setValueAtTime(0.11 * velNorm, start);
        mg.gain.exponentialRampToValueAtTime(0.0008, start + 0.22);
        m1.connect(mg);
        m2.connect(mg);
        mg.connect(bus);
        this.sm._bindMultiShotCleanup([m1, m2], mg, false);
        m1.start(start);
        m2.start(start);
        m1.stop(start + 0.24);
        m2.stop(start + 0.24);
      } else if (noiseBuf) {
        const nSrc = ctx.createBufferSource();
        nSrc.buffer = noiseBuf;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 5800;
        const nG = ctx.createGain();
        nG.gain.setValueAtTime(0.08 * velNorm, start);
        nG.gain.exponentialRampToValueAtTime(0.0008, start + 0.06);
        nSrc.connect(hp);
        hp.connect(nG);
        nG.connect(bus);
        this.sm._bindOneShotCleanup(nSrc, nG, false);
        nSrc.start(start, Math.random() * 0.5, 0.07);
        nSrc.stop(start + 0.08);
      }
      return;
    }

    // 49/57: Orchestral Crash / Tam-Tam Swell
    if (noiseBuf) {
      const nSrc = ctx.createBufferSource();
      nSrc.buffer = noiseBuf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 4200;
      bp.Q.value = 0.7;
      const nG = ctx.createGain();
      nG.gain.setValueAtTime(0.001, start);
      nG.gain.linearRampToValueAtTime(0.14 * velNorm, start + 0.015);
      nG.gain.exponentialRampToValueAtTime(0.0008, start + 0.65);
      nSrc.connect(bp);
      bp.connect(nG);
      nG.connect(bus);
      this.sm._bindOneShotCleanup(nSrc, nG, false);
      nSrc.start(start, 0, 0.68);
      nSrc.stop(start + 0.7);
    }
  }

  /**
   * Plays a crisp one-shot General MIDI orchestral stinger ('victory', 'defeat', 'objective_captured', 'objective_lost').
   */
  playStinger(kind = 'victory') {
    if (!this.sm?.ctx || this.sm.volumes?.muted) return;
    if (this.sm.getCategoryMult('music') <= 0.01) return;
    const now = this.sm.ctx.currentTime + 0.02;

    if (kind === 'victory') {
      // Heroic D-Major Orchestral Brass + Timpani Fanfare!
      const notes = [
        [0.0, 2, 60, 62, 0.26, 108],
        [0.26, 2, 60, 69, 0.26, 110],
        [0.52, 2, 60, 74, 1.15, 118],
        [0.52, 1, 48, 66, 1.15, 96],
        [0.52, 3, 52, 69, 1.2, 92],
        [0.0, 9, 0, 36, 0.3, 115],
        [0.26, 9, 0, 41, 0.3, 105],
        [0.52, 9, 0, 49, 0.9, 108]
      ];
      for (const [dt, ch, prog, n, dur, vel] of notes) {
        this.triggerMidiNote(ch, prog, n, vel, now + dt, dur);
      }
    } else if (kind === 'defeat') {
      // Somber D-minor descending French Horn + low drum cadence
      const notes = [
        [0.0, 2, 60, 65, 0.45, 92],
        [0.45, 2, 60, 64, 0.45, 88],
        [0.9, 2, 60, 62, 1.35, 96],
        [0.9, 1, 49, 50, 1.4, 84],
        [0.0, 9, 0, 41, 0.4, 96],
        [0.9, 9, 0, 36, 0.5, 102]
      ];
      for (const [dt, ch, prog, n, dur, vel] of notes) {
        this.triggerMidiNote(ch, prog, n, vel, now + dt, dur);
      }
    } else if (kind === 'objective_captured') {
      this.triggerMidiNote(2, 60, 62, 96, now, 0.18);
      this.triggerMidiNote(2, 60, 69, 104, now + 0.18, 0.48);
      this.triggerMidiNote(9, 0, 41, 92, now, 0.25);
    } else if (kind === 'objective_lost') {
      this.triggerMidiNote(2, 60, 65, 90, now, 0.2);
      this.triggerMidiNote(2, 60, 58, 94, now + 0.2, 0.48);
      this.triggerMidiNote(9, 0, 36, 92, now + 0.2, 0.3);
    }
  }

  /**
   * Lookahead scheduler called smoothly from the main game loop.
   * Automatically selects the right General MIDI cue for Deploy Menu, Calm Patrol,
   * Active Combat / Contested Flag, Low-Ticket Finale, and Medieval Era!
   */
  updateAdaptiveMusic(state = {}) {
    if (!this.sm?.ctx || this.sm.ctx.state !== 'running') return;
    const wallMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (wallMs - this._lastTickWallMs < 110) return;
    this._lastTickWallMs = wallMs;

    if (this.sm.volumes?.muted || this.sm.getCategoryMult('music') <= 0.01) {
      this.syncVolume();
      return;
    }

    const era = state.era || 'modern';
    const isMedieval = era === 'medieval' || era === 'jurassic';
    const onDeploy = Boolean(state.onDeployMenu);
    const matchEnded = Boolean(state.matchEnded);
    if (matchEnded) return;

    if (state.inCombat) {
      this._combatHoldUntilMs = Math.max(this._combatHoldUntilMs, wallMs + 9500);
    }
    const combatActive = Boolean(state.inCombat || wallMs < this._combatHoldUntilMs);
    const lowTickets =
      Number.isFinite(state.minTickets) && state.minTickets > 0 && state.minTickets <= 85;
    const lowTime =
      Number.isFinite(state.matchTimeRemaining) &&
      state.matchTimeRemaining > 0 &&
      state.matchTimeRemaining <= 90;

    let targetCue = 'modern_patrol';
    if (isMedieval) {
      targetCue = onDeploy ? 'medieval_deploy' : combatActive || lowTickets || lowTime ? 'medieval_combat' : 'medieval_deploy';
    } else if (onDeploy) {
      targetCue = 'modern_deploy';
    } else if (lowTickets || lowTime) {
      targetCue = 'modern_finale';
    } else if (combatActive) {
      targetCue = 'modern_combat';
    } else {
      targetCue = 'modern_patrol';
    }

    const now = this.sm.ctx.currentTime;
    if (this.currentCueKey !== targetCue) {
      this.currentCueKey = targetCue;
      this._loopAnchorTime = now + 0.05;
      this._scheduledCycle = 0;
      this._scheduledPosInCycle = 0;
      const score = this.scoreBank[targetCue];
      if (score) {
        for (const p of score.programs) {
          this.channelPrograms[p.channel & 0x0f] = p.program & 0x7f;
        }
      }
      this.syncVolume();
    }

    const score = this.scoreBank[this.currentCueKey];
    if (!score || !(score.loopDurationSec > 0.25)) return;

    const lookaheadSec = 0.28;
    const elapsed = now - this._loopAnchorTime;
    if (elapsed < -0.1) return;

    const loopLen = score.loopDurationSec;
    const targetWindowEnd = Math.max(0, elapsed + lookaheadSec);
    const currentScheduledSec = this._scheduledCycle * loopLen + this._scheduledPosInCycle;

    // If tab was backgrounded or clock jumped > 1 loop ahead, fast-forward cleanly instead of bursting notes
    if (targetWindowEnd - currentScheduledSec > loopLen) {
      const safeNow = Math.max(0, elapsed);
      this._scheduledCycle = Math.floor(safeNow / loopLen);
      this._scheduledPosInCycle = Math.max(0, Math.min(loopLen - 1e-4, safeNow - this._scheduledCycle * loopLen));
    }

    // Integer-cycle lookahead scheduler (immune to IEEE-754 (k*loopLen)/loopLen rounding traps + hard step cap!)
    let safetySteps = 0;
    while (safetySteps++ < 6) {
      const cycleStartSec = this._scheduledCycle * loopLen;
      const absCursor = cycleStartSec + this._scheduledPosInCycle;
      if (absCursor >= targetWindowEnd - 1e-6) break;

      const localFrom = this._scheduledPosInCycle;
      const remainingInWindow = targetWindowEnd - cycleStartSec;
      const wrapsCycle = remainingInWindow >= loopLen - 1e-6;
      const localTo = wrapsCycle ? loopLen : remainingInWindow;

      if (localTo > localFrom) {
        for (let i = 0; i < score.notes.length; i++) {
          const n = score.notes[i];
          if (n.timeSec >= localFrom && n.timeSec < localTo) {
            const playWhen = this._loopAnchorTime + cycleStartSec + n.timeSec;
            const prog = this.channelPrograms[n.channel & 0x0f] || 48;
            this.triggerMidiNote(n.channel, prog, n.note, n.velocity, playWhen, n.durationSec);
          }
        }
      }

      if (wrapsCycle) {
        this._scheduledCycle += 1;
        this._scheduledPosInCycle = 0;
      } else {
        this._scheduledPosInCycle = localTo;
        break;
      }
    }
  }
}
