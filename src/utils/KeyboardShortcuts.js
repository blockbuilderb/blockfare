// ============================================================================
// CROSS-PLATFORM (MACOS & WINDOWS/LINUX PC) KEYBOARD SHORTCUT RESOLVER
// Fixes macOS Option (`⌥`) Unicode/Dead-key translation (`Option+G` -> `©`),
// supports both `⌥ Option` and `⌃ Control` chords on Mac (plus `⌘+G` in-game),
// prevents modifier chord collisions with single-key gameplay actions (`G`, `1-5`, `0`, `R`, `F`, `C`),
// protects MacBook `⌃+Click` right-click ADS from involuntary `ControlLeft` crouch,
// cures macOS `⌘ Command` / `⌥ Option` swallowed-`keyup` stuck movement keys,
// and provides Numpad-free & `fn`-free MacBook alternatives (`?`, `Shift+1..7` incl. `F11` Pilot).
// ============================================================================

const FLAG_BY_DIGIT = {
  Digit1: 'A',
  Digit2: 'B',
  Digit3: 'C',
  Digit4: 'D',
  Digit5: 'E',
  Numpad1: 'A',
  Numpad2: 'B',
  Numpad3: 'C',
  Numpad4: 'D',
  Numpad5: 'E'
};

const FKEY_TO_ROLE_INDEX = {
  F5: 0,
  F6: 1,
  F7: 2,
  F8: 3,
  F9: 4,
  F10: 5,
  F11: 6
};

const SHIFT_DIGIT_TO_ROLE_INDEX = {
  Digit1: 0,
  Digit2: 1,
  Digit3: 2,
  Digit4: 3,
  Digit5: 4,
  Digit6: 5,
  Digit7: 6
};

export function isMacPlatform(navOverride = null) {
  const nav =
    navOverride || (typeof navigator !== 'undefined' ? navigator : null);
  if (!nav) return false;
  const uaPlatform = nav.userAgentData?.platform || '';
  const platform = nav.platform || '';
  const ua = nav.userAgent || '';
  return /Mac|iPhone|iPad|iPod/i.test(`${uaPlatform} ${platform} ${ua}`);
}

export function getOrderModifierLabel(isMac = isMacPlatform()) {
  return isMac ? '⌥/⌃' : 'Alt';
}

export function getShortOrderModifierLabel(isMac = isMacPlatform()) {
  return isMac ? '⌥' : 'Alt';
}

/**
 * True if any non-Shift modifier (`Alt`/`⌥`, `Ctrl`/`⌃`, `Cmd`/`⌘`) is held.
 * Single-key gameplay bindings (`G`, `R`, `F`, `C`, `1-9`, `0`, `WASD`, etc.)
 * MUST check `!hasAnyModifier(e)` so pressing `Alt+G` / `⌥+G` / `⌃+G` never
 * simultaneously throws a grenade, switches slots, reloads, or strafes!
 */
export function hasAnyModifier(e) {
  if (!e) return false;
  return Boolean(e.altKey || e.ctrlKey || e.metaKey);
}

/**
 * True when the event uses the platform's Command/Squad Order modifier:
 * - Windows / Linux PC: `Alt + Key` (`e.altKey && !e.ctrlKey && !e.metaKey`)
 * - macOS:
 *   1) `⌥ Option + Key` (`e.altKey && !e.metaKey`) — matched via physical `e.code` (ignoring `e.key === '©'`)
 *   2) `⌃ Control + Key` (`e.ctrlKey && !e.metaKey`) — conflict-free with macOS browser `⌘` shortcuts
 *   3) `⌘ Command + G` (`e.metaKey && e.code === 'KeyG'`) ONLY when actively pointer-locked in battle
 *      (never intercepts `⌘+R` reload, `⌘+W` close tab, `⌘+Q` quit, `⌘+T` new tab, `⌘+L` URL bar, etc.!)
 */
export function isCommandOrderModifier(e, isMac = isMacPlatform(), isPointerLocked = false) {
  if (!e) return false;
  if (e.metaKey) {
    return Boolean(isMac && isPointerLocked && !e.altKey && !e.ctrlKey && e.code === 'KeyG');
  }
  if (isMac) {
    return Boolean(e.altKey || e.ctrlKey);
  }
  return Boolean(e.altKey && !e.ctrlKey);
}

/**
 * On macOS browsers (Safari, Chrome, Arc, Firefox), releasing a movement key while
 * `⌘ Command` (`Meta`) is held swallows the `keyup` event, leaving WASD stuck on.
 */
export function shouldClearStuckKeysOnKeyup(code, isMac = isMacPlatform()) {
  if (!code) return false;
  if (code === 'MetaLeft' || code === 'MetaRight') return true;
  if (isMac && (code === 'AltLeft' || code === 'AltRight')) return true;
  return false;
}

/**
 * On MacBooks, `⌃ Control + Trackpad Click` is Secondary Click (Right-Click ADS).
 * `ControlLeft` must NOT toggle crouch on Mac; `[C]` handles crouch cleanly on both platforms.
 */
export function shouldControlLeftCrouch(e, isMac = isMacPlatform()) {
  if (!e || isMac) return false;
  return Boolean(e.code === 'ControlLeft' && !e.altKey && !e.metaKey && !e.shiftKey);
}

/**
 * Maps `F5..F11` OR `Shift + 1..7` (MacBook-friendly bypass for `fn` media keys
 * and macOS's OS-reserved `F11` "Show Desktop" shortcut) to role index `0..6`.
 */
export function resolveFieldRoleShortcutIndex(e) {
  if (!e || hasAnyModifier(e)) return -1;
  if (!e.shiftKey && Object.prototype.hasOwnProperty.call(FKEY_TO_ROLE_INDEX, e.code)) {
    return FKEY_TO_ROLE_INDEX[e.code];
  }
  if (e.shiftKey && Object.prototype.hasOwnProperty.call(SHIFT_DIGIT_TO_ROLE_INDEX, e.code)) {
    return SHIFT_DIGIT_TO_ROLE_INDEX[e.code];
  }
  return -1;
}

/**
 * Resolves global UI & Commander/Squad Leader order shortcuts across Mac & PC.
 * @param {KeyboardEvent|object} e
 * @param {object} ctx - `{ isMac, isPointerLocked, inGunship }`
 * @returns {object|null}
 */
export function resolveGlobalCommandShortcut(e, ctx = {}) {
  if (!e || !e.code) return null;
  const isMac = typeof ctx.isMac === 'boolean' ? ctx.isMac : isMacPlatform();
  const isPointerLocked = Boolean(ctx.isPointerLocked);
  const inGunship = Boolean(ctx.inGunship);
  const inVehicle = Boolean(ctx.inVehicle);
  const cmdMod = isCommandOrderModifier(e, isMac, isPointerLocked);
  const anyMod = hasAnyModifier(e);

  // Never hijack browser/OS Command (`⌘`) or Windows/Linux `Ctrl+R/W/T/L` shortcuts
  if (e.metaKey && !cmdMod) return null;

  // 0. Multi-Crew Vehicle Seat Switching ([F1–F4] when inside any vehicle; Shift+?/Alt+P/Alt+`/Shift+L still open overlays!)
  if (
    inVehicle &&
    !anyMod &&
    !e.shiftKey &&
    (e.code === 'F1' || e.code === 'F2' || e.code === 'F3' || e.code === 'F4')
  ) {
    return { type: 'SWITCH_VEHICLE_SEAT', seatIndex: Number(e.code.slice(1)) - 1 };
  }

  // 1. Utility Overlays (F1-F4 + MacBook `fn`-free chords)
  if ((!anyMod && e.code === 'F1') || (!anyMod && e.shiftKey && e.code === 'Slash')) {
    return { type: 'TOGGLE_MANUAL' };
  }
  if ((!anyMod && e.code === 'F2') || (cmdMod && e.code === 'KeyP')) {
    return { type: 'TOGGLE_FPS' };
  }
  if ((!anyMod && e.code === 'F3') || (cmdMod && e.code === 'Backquote')) {
    return { type: 'TOGGLE_TELEMETRY' };
  }
  if ((!anyMod && e.code === 'F4') || (!anyMod && e.shiftKey && e.code === 'KeyL')) {
    return { type: 'CYCLE_ATMOS' };
  }

  // 2. Commander & Squad Strategic Orders (`Alt+...` on PC, `⌥+...` or `⌃+...` on Mac, or Numpad)
  if (cmdMod && e.code === 'KeyG') {
    return { type: 'STRATEGIC_ORDER', action: 'GARRISON' };
  }
  if (cmdMod && e.code === 'KeyC') {
    return { type: 'STRATEGIC_ORDER', action: 'CHARGE' };
  }
  if (cmdMod && e.code === 'KeyR') {
    return { type: 'STRATEGIC_ORDER', action: 'RETREAT' };
  }
  if ((cmdMod && e.code === 'KeyF') || (!anyMod && !e.shiftKey && e.code === 'Numpad6')) {
    return { type: 'STRATEGIC_ORDER', action: 'FOLLOW' };
  }
  if (
    (cmdMod && (e.code === 'KeyH' || e.code === 'KeyD')) ||
    (!anyMod && !e.shiftKey && e.code === 'Numpad7')
  ) {
    return { type: 'STRATEGIC_ORDER', action: 'HOLD' };
  }
  if ((cmdMod && e.code === 'KeyA') || (!anyMod && !e.shiftKey && e.code === 'Numpad8')) {
    return { type: 'STRATEGIC_ORDER', action: 'AUTO' };
  }
  if (
    (cmdMod && ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].includes(e.code)) ||
    (!anyMod && !e.shiftKey && ['Numpad1', 'Numpad2', 'Numpad3', 'Numpad4', 'Numpad5'].includes(e.code))
  ) {
    return { type: 'STRATEGIC_ORDER', action: 'OBJECTIVE', flagId: FLAG_BY_DIGIT[e.code] };
  }
  if ((cmdMod && e.code === 'Digit0') || (!anyMod && !e.shiftKey && e.code === 'Numpad0')) {
    return { type: 'TOGGLE_SCOPE' };
  }

  // 3. Formation Spacing (`Num -` / `Num +`, `Alt/⌥ + -/=`, or bare `-/=` when NOT flying AC-130)
  if (
    (!anyMod && e.code === 'NumpadSubtract') ||
    (cmdMod && e.code === 'Minus') ||
    (!anyMod && !e.shiftKey && !inGunship && e.code === 'Minus')
  ) {
    return { type: 'SPACING', spacingMode: 'STAY_CLOSE' };
  }
  if (
    (!anyMod && e.code === 'NumpadAdd') ||
    (cmdMod && e.code === 'Equal') ||
    (!anyMod && !e.shiftKey && !inGunship && e.code === 'Equal')
  ) {
    return { type: 'SPACING', spacingMode: 'FAN_OUT' };
  }

  return null;
}
