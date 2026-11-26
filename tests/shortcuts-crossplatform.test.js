import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  isMacPlatform,
  getOrderModifierLabel,
  getShortOrderModifierLabel,
  hasAnyModifier,
  isCommandOrderModifier,
  shouldClearStuckKeysOnKeyup,
  shouldControlLeftCrouch,
  resolveFieldRoleShortcutIndex,
  resolveGlobalCommandShortcut
} from '../src/utils/KeyboardShortcuts.js';

/**
 * Builds a synthetic KeyboardEvent-like object matching browser dispatch payloads.
 */
function keyEvent(overrides = {}) {
  return {
    key: '',
    code: '',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    repeat: false,
    ...overrides
  };
}

// ============================================================================
// 1. Platform Detection & HUD Modifier Labels
// ============================================================================
describe('1. Platform detection across macOS, Apple Silicon, iOS, Windows & Linux', () => {
  test('detects Intel macOS (MacIntel) and classic Macintosh navigator signatures', () => {
    assert.equal(
      isMacPlatform({
        platform: 'MacIntel',
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
      }),
      true
    );

    assert.equal(
      isMacPlatform({
        platform: 'Macintosh',
        userAgent: 'Mozilla/5.0 (Macintosh; PPC Mac OS X)'
      }),
      true
    );
  });

  test('detects Apple Silicon macOS via NavigatorUAData (userAgentData.platform === "macOS")', () => {
    assert.equal(
      isMacPlatform({
        userAgentData: { platform: 'macOS' },
        platform: '',
        userAgent: 'Mozilla/5.0'
      }),
      true
    );
  });

  test('detects iOS / iPadOS devices (iPhone, iPad, iPod, and iPadOS desktop-class MacIntel)', () => {
    assert.equal(
      isMacPlatform({
        platform: 'iPhone',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)'
      }),
      true
    );
    assert.equal(
      isMacPlatform({
        platform: 'iPad',
        userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X)'
      }),
      true
    );
    assert.equal(
      isMacPlatform({
        platform: 'iPod',
        userAgent: 'Mozilla/5.0 (iPod touch; CPU iPhone OS 16_0 like Mac OS X)'
      }),
      true
    );
  });

  test('returns false on Windows (Win32), Linux, and empty navigator stubs', () => {
    assert.equal(
      isMacPlatform({
        userAgentData: { platform: 'Windows' },
        platform: 'Win32',
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36'
      }),
      false
    );

    assert.equal(
      isMacPlatform({
        userAgentData: { platform: 'Linux' },
        platform: 'Linux x86_64',
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0'
      }),
      false
    );

    assert.equal(isMacPlatform({}), false);
  });

  test('returns platform-appropriate full and short HUD order modifier labels', () => {
    assert.equal(getOrderModifierLabel(true), '⌥/⌃');
    assert.equal(getOrderModifierLabel(false), 'Alt');

    assert.equal(getShortOrderModifierLabel(true), '⌥');
    assert.equal(getShortOrderModifierLabel(false), 'Alt');
  });
});

// ============================================================================
// 2. Why Alt+G Failed on Mac & How All 3 Mac Ways Work Safely
// ============================================================================
describe('2. Garrison order (Alt+G / ⌥+G / ⌃+G / ⌘+G) & sacred browser shortcut protection', () => {
  test('Way 1 on Mac: ⌥ Option + G (key: "©", code: "KeyG") resolves to GARRISON and blocks grenade/collision via hasAnyModifier', () => {
    const macOptG = keyEvent({ altKey: true, key: '©', code: 'KeyG' });

    assert.equal(hasAnyModifier(macOptG), true, 'hasAnyModifier must block single-key G grenade/collision');
    assert.equal(isCommandOrderModifier(macOptG, true, false), true);
    assert.deepEqual(resolveGlobalCommandShortcut(macOptG, { isMac: true, isPointerLocked: false }), {
      type: 'STRATEGIC_ORDER',
      action: 'GARRISON'
    });

    // Also works on non-US Mac layouts where Option+G produces a Dead key or accent
    const macDeadOptG = keyEvent({ altKey: true, key: 'Dead', code: 'KeyG' });
    assert.equal(hasAnyModifier(macDeadOptG), true);
    assert.deepEqual(resolveGlobalCommandShortcut(macDeadOptG, { isMac: true }), {
      type: 'STRATEGIC_ORDER',
      action: 'GARRISON'
    });
  });

  test('Way 2 on Mac: ⌃ Control + G resolves to GARRISON on Mac, while NOT triggering orders on Windows', () => {
    const ctrlG = keyEvent({ ctrlKey: true, key: 'g', code: 'KeyG' });

    // macOS: Control+G triggers GARRISON
    assert.equal(hasAnyModifier(ctrlG), true);
    assert.equal(isCommandOrderModifier(ctrlG, true, false), true);
    assert.deepEqual(resolveGlobalCommandShortcut(ctrlG, { isMac: true, isPointerLocked: false }), {
      type: 'STRATEGIC_ORDER',
      action: 'GARRISON'
    });

    // Windows/Linux: Control is separate from Alt (used for crouch / OS shortcuts) -> must NOT trigger GARRISON
    assert.equal(isCommandOrderModifier(ctrlG, false, true), false);
    assert.equal(resolveGlobalCommandShortcut(ctrlG, { isMac: false, isPointerLocked: true }), null);
  });

  test('Way 3 on Mac: ⌘ Command + G and ⌘ Command + R resolve on Mac ONLY when isPointerLocked === true (preventing accidental mid-battle ⌘+R round wipe!)', () => {
    const cmdG = keyEvent({ metaKey: true, key: 'g', code: 'KeyG' });
    const cmdR = keyEvent({ metaKey: true, key: 'r', code: 'KeyR' });

    // Pointer-locked in active combat on Mac -> GARRISON & REQUEST_RIDE
    assert.equal(hasAnyModifier(cmdG), true);
    assert.equal(isCommandOrderModifier(cmdG, true, true), true);
    assert.deepEqual(resolveGlobalCommandShortcut(cmdG, { isMac: true, isPointerLocked: true }), {
      type: 'STRATEGIC_ORDER',
      action: 'GARRISON'
    });
    assert.equal(isCommandOrderModifier(cmdR, true, true), true);
    assert.deepEqual(
      resolveGlobalCommandShortcut(cmdR, { isMac: true, isPointerLocked: true, commandRank: 'MEMBER' }),
      { type: 'REQUEST_RIDE' }
    );

    // Unlocked cursor on Mac (Deploy screen, browser UI) or ⌘+Shift+R hard reload -> null
    assert.equal(isCommandOrderModifier(cmdG, true, false), false);
    assert.equal(resolveGlobalCommandShortcut(cmdG, { isMac: true, isPointerLocked: false }), null);
    assert.equal(isCommandOrderModifier(cmdR, true, false), false);
    assert.equal(resolveGlobalCommandShortcut(cmdR, { isMac: true, isPointerLocked: false }), null);
    assert.equal(
      resolveGlobalCommandShortcut(keyEvent({ metaKey: true, shiftKey: true, key: 'R', code: 'KeyR' }), {
        isMac: true,
        isPointerLocked: true
      }),
      null
    );

    // Windows Win+G (Xbox Game Bar) / Win+R (Run dialog) -> null even in pointer lock
    assert.equal(isCommandOrderModifier(cmdG, false, true), false);
    assert.equal(resolveGlobalCommandShortcut(cmdG, { isMac: false, isPointerLocked: true }), null);
    assert.equal(isCommandOrderModifier(cmdR, false, true), false);
    assert.equal(resolveGlobalCommandShortcut(cmdR, { isMac: false, isPointerLocked: true }), null);

    // Multi-modifier ⌘+⌥+G or ⌘+⌃+G -> null
    assert.equal(
      resolveGlobalCommandShortcut(
        keyEvent({ metaKey: true, altKey: true, key: '©', code: 'KeyG' }),
        { isMac: true, isPointerLocked: true }
      ),
      null
    );
    assert.equal(
      resolveGlobalCommandShortcut(
        keyEvent({ metaKey: true, ctrlKey: true, key: 'g', code: 'KeyG' }),
        { isMac: true, isPointerLocked: true }
      ),
      null
    );
  });

  test('Sacred macOS browser shortcuts (⌘+W, ⌘+Q, ⌘+T, ⌘+L, ⌘+Shift+R, ⌘+1..5, etc.) return null even in pointer lock', () => {
    const sacredCmdChords = [
      { key: 'R', code: 'KeyR', shiftKey: true }, // Hard reload page (⌘+Shift+R)
      { key: 'w', code: 'KeyW' }, // Close tab
      { key: 'q', code: 'KeyQ' }, // Quit browser
      { key: 't', code: 'KeyT' }, // New tab
      { key: 'l', code: 'KeyL' }, // Focus URL bar
      { key: '1', code: 'Digit1' }, // Switch tab 1
      { key: '2', code: 'Digit2' }, // Switch tab 2
      { key: '3', code: 'Digit3' }, // Switch tab 3
      { key: '4', code: 'Digit4' }, // Switch tab 4
      { key: '5', code: 'Digit5' }, // Switch tab 5
      { key: '0', code: 'Digit0' }, // Reset zoom
      { key: '-', code: 'Minus' }, // Zoom out
      { key: '=', code: 'Equal' }, // Zoom in
      { key: 'c', code: 'KeyC' }, // Copy
      { key: 'h', code: 'KeyH' }, // Hide app
      { key: 'f', code: 'KeyF' }, // Find in page
      { key: 'a', code: 'KeyA' }, // Select all
      { key: 'p', code: 'KeyP' }, // Print
      { key: '`', code: 'Backquote' } // Cycle app windows
    ];

    for (const { key, code, shiftKey } of sacredCmdChords) {
      const ev = keyEvent({ metaKey: true, shiftKey: Boolean(shiftKey), key, code });
      assert.equal(
        isCommandOrderModifier(ev, true, true),
        false,
        `⌘+${code} must never be treated as a command modifier`
      );
      assert.equal(
        resolveGlobalCommandShortcut(ev, { isMac: true, isPointerLocked: true }),
        null,
        `⌘+${code} must return null even during pointer lock`
      );
    }
  });
});

// ============================================================================
// 3. All Commander / Squad Chords Across Windows, Mac (⌥ Unicode & ⌃), and Numpad
// ============================================================================
describe('3. Commander & Squad chords on Windows (Alt+...), Mac (⌥ Unicode & ⌃), and Numpad 0..8', () => {
  const CHORD_SPECS = [
    {
      label: 'Charge (C)',
      code: 'KeyC',
      pcKey: 'c',
      macOptKey: 'ç',
      expected: { type: 'STRATEGIC_ORDER', action: 'CHARGE' }
    },
    {
      label: 'Hold via H',
      code: 'KeyH',
      pcKey: 'h',
      macOptKey: '˙',
      expected: { type: 'STRATEGIC_ORDER', action: 'HOLD' }
    },
    {
      label: 'Hold via D',
      code: 'KeyD',
      pcKey: 'd',
      macOptKey: '∂',
      expected: { type: 'STRATEGIC_ORDER', action: 'HOLD' }
    },
    {
      label: 'Retreat / Fall Back (B)',
      code: 'KeyB',
      pcKey: 'b',
      macOptKey: '∫',
      expected: { type: 'STRATEGIC_ORDER', action: 'RETREAT' }
    },
    {
      label: 'Personal Ride Pickup & Drop-Off (R)',
      code: 'KeyR',
      pcKey: 'r',
      macOptKey: '®',
      expected: { type: 'REQUEST_RIDE' }
    },
    {
      label: 'Follow (F)',
      code: 'KeyF',
      pcKey: 'f',
      macOptKey: 'ƒ',
      expected: { type: 'STRATEGIC_ORDER', action: 'FOLLOW' }
    },
    {
      label: 'Auto / Initiative (A)',
      code: 'KeyA',
      pcKey: 'a',
      macOptKey: 'å',
      expected: { type: 'STRATEGIC_ORDER', action: 'AUTO' }
    },
    {
      label: 'Objective A (1)',
      code: 'Digit1',
      pcKey: '1',
      macOptKey: '¡',
      expected: { type: 'STRATEGIC_ORDER', action: 'OBJECTIVE', flagId: 'A' }
    },
    {
      label: 'Objective B (2)',
      code: 'Digit2',
      pcKey: '2',
      macOptKey: '™',
      expected: { type: 'STRATEGIC_ORDER', action: 'OBJECTIVE', flagId: 'B' }
    },
    {
      label: 'Objective C (3)',
      code: 'Digit3',
      pcKey: '3',
      macOptKey: '£',
      expected: { type: 'STRATEGIC_ORDER', action: 'OBJECTIVE', flagId: 'C' }
    },
    {
      label: 'Objective D (4)',
      code: 'Digit4',
      pcKey: '4',
      macOptKey: '¢',
      expected: { type: 'STRATEGIC_ORDER', action: 'OBJECTIVE', flagId: 'D' }
    },
    {
      label: 'Objective E (5)',
      code: 'Digit5',
      pcKey: '5',
      macOptKey: '∞',
      expected: { type: 'STRATEGIC_ORDER', action: 'OBJECTIVE', flagId: 'E' }
    },
    {
      label: 'Scope Toggle (0)',
      code: 'Digit0',
      pcKey: '0',
      macOptKey: 'º',
      expected: { type: 'TOGGLE_SCOPE' }
    }
  ];

  test('resolves every Commander/Squad chord on Windows via Alt+Key (and rejects Ctrl+Key on Windows)', () => {
    for (const spec of CHORD_SPECS) {
      const winAlt = keyEvent({ altKey: true, key: spec.pcKey, code: spec.code });
      assert.equal(hasAnyModifier(winAlt), true);
      assert.deepEqual(
        resolveGlobalCommandShortcut(winAlt, { isMac: false }),
        spec.expected,
        `Windows Alt+${spec.code} (${spec.label}) failed`
      );

      const winCtrl = keyEvent({ ctrlKey: true, key: spec.pcKey, code: spec.code });
      assert.equal(
        resolveGlobalCommandShortcut(winCtrl, { isMac: false }),
        null,
        `Windows Ctrl+${spec.code} must not trigger ${spec.label}`
      );
    }
  });

  test('resolves every Commander/Squad chord on Mac via BOTH ⌥ Option (with Unicode e.key) AND ⌃ Control', () => {
    for (const spec of CHORD_SPECS) {
      const macOption = keyEvent({ altKey: true, key: spec.macOptKey, code: spec.code });
      assert.equal(hasAnyModifier(macOption), true);
      assert.deepEqual(
        resolveGlobalCommandShortcut(macOption, { isMac: true }),
        spec.expected,
        `Mac ⌥+${spec.code} (key="${spec.macOptKey}") failed for ${spec.label}`
      );

      const macCtrl = keyEvent({ ctrlKey: true, key: spec.pcKey, code: spec.code });
      assert.equal(hasAnyModifier(macCtrl), true);
      assert.deepEqual(
        resolveGlobalCommandShortcut(macCtrl, { isMac: true }),
        spec.expected,
        `Mac ⌃+${spec.code} failed for ${spec.label}`
      );
    }
  });

  test('bare unmodified gameplay keys (G, C, H, D, R, F, A, 1..5, 0) never trigger strategic orders', () => {
    for (const spec of [{ code: 'KeyG', pcKey: 'g' }, ...CHORD_SPECS]) {
      const bare = keyEvent({ key: spec.pcKey, code: spec.code });
      assert.equal(hasAnyModifier(bare), false);
      assert.equal(resolveGlobalCommandShortcut(bare, { isMac: true, isPointerLocked: true }), null);
      assert.equal(resolveGlobalCommandShortcut(bare, { isMac: false, isPointerLocked: true }), null);
    }
  });

  test('resolves Numpad 0..8 without modifiers on both Mac and Windows', () => {
    const numpadSpecs = [
      { code: 'Numpad0', key: '0', expected: { type: 'TOGGLE_SCOPE' } },
      { code: 'Numpad1', key: '1', expected: { type: 'STRATEGIC_ORDER', action: 'OBJECTIVE', flagId: 'A' } },
      { code: 'Numpad2', key: '2', expected: { type: 'STRATEGIC_ORDER', action: 'OBJECTIVE', flagId: 'B' } },
      { code: 'Numpad3', key: '3', expected: { type: 'STRATEGIC_ORDER', action: 'OBJECTIVE', flagId: 'C' } },
      { code: 'Numpad4', key: '4', expected: { type: 'STRATEGIC_ORDER', action: 'OBJECTIVE', flagId: 'D' } },
      { code: 'Numpad5', key: '5', expected: { type: 'STRATEGIC_ORDER', action: 'OBJECTIVE', flagId: 'E' } },
      { code: 'Numpad6', key: '6', expected: { type: 'STRATEGIC_ORDER', action: 'FOLLOW' } },
      { code: 'Numpad7', key: '7', expected: { type: 'STRATEGIC_ORDER', action: 'HOLD' } },
      { code: 'Numpad8', key: '8', expected: { type: 'STRATEGIC_ORDER', action: 'AUTO' } }
    ];

    for (const { code, key, expected } of numpadSpecs) {
      const ev = keyEvent({ key, code });
      assert.deepEqual(
        resolveGlobalCommandShortcut(ev, { isMac: false }),
        expected,
        `Windows ${code} failed`
      );
      assert.deepEqual(
        resolveGlobalCommandShortcut(ev, { isMac: true }),
        expected,
        `Mac ${code} failed`
      );
    }
  });
});

// ============================================================================
// 4. Formation Spacing vs AC-130 Gunship Altitude De-confliction
// ============================================================================
describe('4. Formation Spacing (- / =) vs AC-130 Gunship Altitude de-confliction', () => {
  test('on foot (inGunship: false), bare Minus and Equal resolve to STAY_CLOSE and FAN_OUT on Mac & PC', () => {
    const bareMinus = keyEvent({ key: '-', code: 'Minus' });
    const bareEqual = keyEvent({ key: '=', code: 'Equal' });

    for (const isMac of [false, true]) {
      assert.deepEqual(resolveGlobalCommandShortcut(bareMinus, { isMac, inGunship: false }), {
        type: 'SPACING',
        spacingMode: 'STAY_CLOSE'
      });
      assert.deepEqual(resolveGlobalCommandShortcut(bareEqual, { isMac, inGunship: false }), {
        type: 'SPACING',
        spacingMode: 'FAN_OUT'
      });
    }
  });

  test('inside AC-130 (inGunship: true), bare Minus and Equal return null so Gunship altitude keys work unimpeded', () => {
    const bareMinus = keyEvent({ key: '-', code: 'Minus' });
    const bareEqual = keyEvent({ key: '=', code: 'Equal' });

    for (const isMac of [false, true]) {
      assert.equal(resolveGlobalCommandShortcut(bareMinus, { isMac, inGunship: true }), null);
      assert.equal(resolveGlobalCommandShortcut(bareEqual, { isMac, inGunship: true }), null);
    }
  });

  test('Alt/⌥/⌃ + Minus/Equal and NumpadSubtract/NumpadAdd still adjust spacing even inside the AC-130', () => {
    // Windows Alt + Minus / Equal in Gunship
    assert.deepEqual(
      resolveGlobalCommandShortcut(keyEvent({ altKey: true, key: '-', code: 'Minus' }), {
        isMac: false,
        inGunship: true
      }),
      { type: 'SPACING', spacingMode: 'STAY_CLOSE' }
    );
    assert.deepEqual(
      resolveGlobalCommandShortcut(keyEvent({ altKey: true, key: '=', code: 'Equal' }), {
        isMac: false,
        inGunship: true
      }),
      { type: 'SPACING', spacingMode: 'FAN_OUT' }
    );

    // Mac ⌥ Option + Minus ('–') / Equal ('≠') in Gunship
    assert.deepEqual(
      resolveGlobalCommandShortcut(keyEvent({ altKey: true, key: '–', code: 'Minus' }), {
        isMac: true,
        inGunship: true
      }),
      { type: 'SPACING', spacingMode: 'STAY_CLOSE' }
    );
    assert.deepEqual(
      resolveGlobalCommandShortcut(keyEvent({ altKey: true, key: '≠', code: 'Equal' }), {
        isMac: true,
        inGunship: true
      }),
      { type: 'SPACING', spacingMode: 'FAN_OUT' }
    );

    // Mac ⌃ Control + Minus / Equal in Gunship
    assert.deepEqual(
      resolveGlobalCommandShortcut(keyEvent({ ctrlKey: true, key: '-', code: 'Minus' }), {
        isMac: true,
        inGunship: true
      }),
      { type: 'SPACING', spacingMode: 'STAY_CLOSE' }
    );
    assert.deepEqual(
      resolveGlobalCommandShortcut(keyEvent({ ctrlKey: true, key: '=', code: 'Equal' }), {
        isMac: true,
        inGunship: true
      }),
      { type: 'SPACING', spacingMode: 'FAN_OUT' }
    );

    // NumpadSubtract & NumpadAdd in Gunship (Mac & PC)
    for (const isMac of [false, true]) {
      assert.deepEqual(
        resolveGlobalCommandShortcut(keyEvent({ key: '-', code: 'NumpadSubtract' }), {
          isMac,
          inGunship: true
        }),
        { type: 'SPACING', spacingMode: 'STAY_CLOSE' }
      );
      assert.deepEqual(
        resolveGlobalCommandShortcut(keyEvent({ key: '+', code: 'NumpadAdd' }), {
          isMac,
          inGunship: true
        }),
        { type: 'SPACING', spacingMode: 'FAN_OUT' }
      );
    }
  });
});

// ============================================================================
// 5. MacBook Trackpad & Stuck-Key Protections + fn-Free Role/Utility Shortcuts
// ============================================================================
describe('5. MacBook trackpad ADS protection, stuck-key cure, and fn-free utility/role shortcuts', () => {
  test('shouldControlLeftCrouch returns false on Mac (protecting ⌃+Click right-click ADS) and true on Windows/Linux', () => {
    const ctrlLeft = keyEvent({ key: 'Control', code: 'ControlLeft', ctrlKey: true });

    // Mac: never crouch on ControlLeft so Control + Trackpad Click ADS works cleanly
    assert.equal(shouldControlLeftCrouch(ctrlLeft, true), false);

    // Windows/Linux: bare ControlLeft crouches
    assert.equal(shouldControlLeftCrouch(ctrlLeft, false), true);

    // ControlRight or multi-modifier combos do not trigger ControlLeft crouch
    assert.equal(
      shouldControlLeftCrouch(keyEvent({ key: 'Control', code: 'ControlRight', ctrlKey: true }), false),
      false
    );
    assert.equal(
      shouldControlLeftCrouch(
        keyEvent({ key: 'Control', code: 'ControlLeft', ctrlKey: true, shiftKey: true }),
        false
      ),
      false
    );
    assert.equal(
      shouldControlLeftCrouch(
        keyEvent({ key: 'Control', code: 'ControlLeft', ctrlKey: true, altKey: true }),
        false
      ),
      false
    );
    assert.equal(shouldControlLeftCrouch(null, false), false);
  });

  test('shouldClearStuckKeysOnKeyup clears on MetaLeft/MetaRight everywhere and AltLeft/AltRight on Mac', () => {
    // Meta swallows movement keyup events across OSes
    assert.equal(shouldClearStuckKeysOnKeyup('MetaLeft', true), true);
    assert.equal(shouldClearStuckKeysOnKeyup('MetaRight', true), true);
    assert.equal(shouldClearStuckKeysOnKeyup('MetaLeft', false), true);
    assert.equal(shouldClearStuckKeysOnKeyup('MetaRight', false), true);

    // Option/Alt on Mac also mutates/swallows in-flight key sequences
    assert.equal(shouldClearStuckKeysOnKeyup('AltLeft', true), true);
    assert.equal(shouldClearStuckKeysOnKeyup('AltRight', true), true);
    assert.equal(shouldClearStuckKeysOnKeyup('AltLeft', false), false);
    assert.equal(shouldClearStuckKeysOnKeyup('AltRight', false), false);

    // Ordinary movement / modifier keys do not clear all held movement keys
    assert.equal(shouldClearStuckKeysOnKeyup('KeyW', true), false);
    assert.equal(shouldClearStuckKeysOnKeyup('ControlLeft', true), false);
    assert.equal(shouldClearStuckKeysOnKeyup('ShiftLeft', true), false);
    assert.equal(shouldClearStuckKeysOnKeyup('', true), false);
  });

  test('resolveGlobalCommandShortcut maps F1..F4 AND fn-free chords (? -> F1, ⌥/Alt+P -> F2, ⌥/Alt+` -> F3, Shift+L -> F4)', () => {
    for (const isMac of [false, true]) {
      // F1 & Shift+Slash (?) -> TOGGLE_MANUAL
      assert.deepEqual(resolveGlobalCommandShortcut(keyEvent({ key: 'F1', code: 'F1' }), { isMac }), {
        type: 'TOGGLE_MANUAL'
      });
      assert.deepEqual(
        resolveGlobalCommandShortcut(keyEvent({ key: '?', code: 'Slash', shiftKey: true }), { isMac }),
        { type: 'TOGGLE_MANUAL' }
      );
      assert.equal(resolveGlobalCommandShortcut(keyEvent({ key: '/', code: 'Slash' }), { isMac }), null);

      // F2 & ⌥/Alt+P -> TOGGLE_FPS
      assert.deepEqual(resolveGlobalCommandShortcut(keyEvent({ key: 'F2', code: 'F2' }), { isMac }), {
        type: 'TOGGLE_FPS'
      });
      assert.deepEqual(
        resolveGlobalCommandShortcut(
          keyEvent({ key: isMac ? 'π' : 'p', code: 'KeyP', altKey: true }),
          { isMac }
        ),
        { type: 'TOGGLE_FPS' }
      );
      assert.equal(resolveGlobalCommandShortcut(keyEvent({ key: 'p', code: 'KeyP' }), { isMac }), null);

      // F3 & ⌥/Alt+Backquote -> TOGGLE_TELEMETRY
      assert.deepEqual(resolveGlobalCommandShortcut(keyEvent({ key: 'F3', code: 'F3' }), { isMac }), {
        type: 'TOGGLE_TELEMETRY'
      });
      assert.deepEqual(
        resolveGlobalCommandShortcut(keyEvent({ key: '`', code: 'Backquote', altKey: true }), { isMac }),
        { type: 'TOGGLE_TELEMETRY' }
      );
      assert.equal(
        resolveGlobalCommandShortcut(keyEvent({ key: '`', code: 'Backquote' }), { isMac }),
        null
      );

      // F4 & Shift+KeyL -> CYCLE_ATMOS
      assert.deepEqual(resolveGlobalCommandShortcut(keyEvent({ key: 'F4', code: 'F4' }), { isMac }), {
        type: 'CYCLE_ATMOS'
      });
      assert.deepEqual(
        resolveGlobalCommandShortcut(keyEvent({ key: 'L', code: 'KeyL', shiftKey: true }), { isMac }),
        { type: 'CYCLE_ATMOS' }
      );
      assert.equal(resolveGlobalCommandShortcut(keyEvent({ key: 'l', code: 'KeyL' }), { isMac }), null);
    }

    // Mac ⌃ Control also works for ⌃+P and ⌃+Backquote, while Windows Ctrl+P (Print) returns null
    assert.deepEqual(
      resolveGlobalCommandShortcut(keyEvent({ key: 'p', code: 'KeyP', ctrlKey: true }), { isMac: true }),
      { type: 'TOGGLE_FPS' }
    );
    assert.deepEqual(
      resolveGlobalCommandShortcut(keyEvent({ key: '`', code: 'Backquote', ctrlKey: true }), {
        isMac: true
      }),
      { type: 'TOGGLE_TELEMETRY' }
    );
    assert.equal(
      resolveGlobalCommandShortcut(keyEvent({ key: 'p', code: 'KeyP', ctrlKey: true }), { isMac: false }),
      null
    );

    // Defensive null/missing-code handling
    assert.equal(resolveGlobalCommandShortcut(null), null);
    assert.equal(resolveGlobalCommandShortcut({}), null);
  });

  test('resolveFieldRoleShortcutIndex maps F5..F11 and Shift+Digit1..Digit7 -> 0..6 (incl. Shift+Digit7 -> 6 Combat Pilot when macOS steals F11) and returns -1 with Alt/Ctrl/Meta', () => {
    const fKeys = ['F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11'];
    const shiftedDigits = [
      { code: 'Digit1', key: '!' },
      { code: 'Digit2', key: '@' },
      { code: 'Digit3', key: '#' },
      { code: 'Digit4', key: '$' },
      { code: 'Digit5', key: '%' },
      { code: 'Digit6', key: '^' },
      { code: 'Digit7', key: '&' } // Combat Pilot bypass when macOS steals F11 for Show Desktop
    ];

    for (let idx = 0; idx < 7; idx++) {
      // Bare F5..F11 -> 0..6
      assert.equal(resolveFieldRoleShortcutIndex(keyEvent({ key: fKeys[idx], code: fKeys[idx] })), idx);

      // Shift + Digit1..Digit7 -> 0..6
      assert.equal(
        resolveFieldRoleShortcutIndex(
          keyEvent({ key: shiftedDigits[idx].key, code: shiftedDigits[idx].code, shiftKey: true })
        ),
        idx
      );

      // Bare Digit1..Digit7 (weapon/gadget slots) MUST return -1
      assert.equal(
        resolveFieldRoleShortcutIndex(
          keyEvent({ key: String(idx + 1), code: shiftedDigits[idx].code, shiftKey: false })
        ),
        -1
      );
    }

    // Explicit assertion for Combat Pilot (index 6) via Shift+Digit7
    assert.equal(
      resolveFieldRoleShortcutIndex(keyEvent({ key: '&', code: 'Digit7', shiftKey: true })),
      6
    );

    // Returns -1 when Alt, Ctrl, or Meta is held (e.g., Alt+1 Objective A, Ctrl+F5 refresh, ⌘+Shift+3/4/5 macOS screenshot)
    for (const mod of [{ altKey: true }, { ctrlKey: true }, { metaKey: true }]) {
      assert.equal(resolveFieldRoleShortcutIndex(keyEvent({ code: 'F5', ...mod })), -1);
      assert.equal(resolveFieldRoleShortcutIndex(keyEvent({ code: 'F11', ...mod })), -1);
      assert.equal(
        resolveFieldRoleShortcutIndex(keyEvent({ code: 'Digit1', shiftKey: true, ...mod })),
        -1
      );
      assert.equal(
        resolveFieldRoleShortcutIndex(keyEvent({ code: 'Digit7', shiftKey: true, ...mod })),
        -1
      );
    }

    // Out-of-range keys return -1
    assert.equal(resolveFieldRoleShortcutIndex(keyEvent({ code: 'ShiftLeft', shiftKey: true })), -1);
    assert.equal(resolveFieldRoleShortcutIndex(keyEvent({ code: 'Digit8', shiftKey: true })), -1);
    assert.equal(resolveFieldRoleShortcutIndex(keyEvent({ code: 'F5', shiftKey: true })), -1);
    assert.equal(resolveFieldRoleShortcutIndex(keyEvent({ code: 'F4' })), -1);
    assert.equal(resolveFieldRoleShortcutIndex(keyEvent({ code: 'F12' })), -1);
    assert.equal(resolveFieldRoleShortcutIndex(null), -1);
  });
});
