// ============================================================================
// PUBG MOBILE / COD MOBILE DUAL-THUMB TOUCH CONTROLLER
// (src/ui/MobileTouchControls.js)
// - Multi-touch identifier-isolated zones (simultaneous Move + Aim + Fire/Recoil!)
// - Left Zone: Floating analog 360° thumbstick + upward Auto-Sprint Lock latch
//              (doubles as Ground Vehicle Steer + Throttle when driving!)
// - Right Zone: Optical-FOV-scaled free-look touchpad + speed-curve flick turn
// - Right Trigger Arc: Fire + Simultaneous Drag-Aim, ADS/Scope toggle, Jump/Vault,
//   Tap-Crouch / Hold-Prone, Reload, plus Left-Index Sniper Fire button
// - Scope-Only Bar: Hold Breath, LRF Auto-Zero, Variable Zoom
// - Context-Smart Pill: Auto-shows Revive, Bandage, Board/Exit Vehicle, Resupply & Ride
// ============================================================================

import { sound } from '../audio.js?v=144';

const TOUCH_MODE_STORAGE_KEY = 'bb_mobile_touch_mode_v1';
const TOUCH_SENS_STORAGE_KEY = 'bb_mobile_touch_sens_v1';

export function isCoarseTouchHardware() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const hasPoints = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
  const coarse = Boolean(window.matchMedia?.('(pointer: coarse)')?.matches);
  return Boolean(hasPoints && (coarse || window.innerWidth <= 1024));
}

export class MobileTouchControls {
  constructor(player, ui) {
    this.player = player;
    this.ui = ui;

    // 'auto' | 'on' | 'off'
    this.mode = 'auto';
    this.touchSensPct = 100; // 25..200%
    this._hardwareTouchSeen = isCoarseTouchHardware();
    this.active = false;
    this._portraitDismissed = false;

    // Multi-touch active pointer tracking
    this._moveTouchId = null;
    this._moveOriginX = 0;
    this._moveOriginY = 0;
    this._stickRadius = 52;

    this._lookTouchId = null;
    this._lookLastX = 0;
    this._lookLastY = 0;

    this._fireTouchId = null;
    this._fireLastX = 0;
    this._fireLastY = 0;

    this._leftFireTouchId = null;
    this._crouchHoldTimer = null;
    this._crouchDidProne = false;
    this._reloadHoldTimer = null;
    this._reloadDidSlow = false;
    this._lastContextScanAt = 0;
    this._currentContextAction = null;
    this._lastSlotSig = '';

    this.loadSettings();
    this._buildDom();
    this._bindGlobalTouchDetector();
    this.syncVisibility();
  }

  loadSettings() {
    try {
      const savedMode = localStorage.getItem(TOUCH_MODE_STORAGE_KEY);
      if (savedMode === 'auto' || savedMode === 'on' || savedMode === 'off') {
        this.mode = savedMode;
      }
      const savedSens = Number(localStorage.getItem(TOUCH_SENS_STORAGE_KEY));
      if (Number.isFinite(savedSens) && savedSens >= 25 && savedSens <= 250) {
        this.touchSensPct = Math.round(savedSens);
      }
    } catch (_) {}
  }

  saveSettings() {
    try {
      localStorage.setItem(TOUCH_MODE_STORAGE_KEY, this.mode);
      localStorage.setItem(TOUCH_SENS_STORAGE_KEY, String(this.touchSensPct));
    } catch (_) {}
  }

  setMode(nextMode) {
    if (nextMode === 'auto' || nextMode === 'on' || nextMode === 'off') {
      this.mode = nextMode;
      this.saveSettings();
      this.syncVisibility();
    }
    return this.mode;
  }

  cycleMode() {
    const order = ['auto', 'on', 'off'];
    const next = order[(order.indexOf(this.mode) + 1) % order.length];
    return this.setMode(next);
  }

  setSensitivity(pct) {
    const clamped = Math.max(25, Math.min(200, Math.round(Number(pct) || 100)));
    this.touchSensPct = clamped;
    this.saveSettings();
    return clamped;
  }

  shouldEnableTouchHud() {
    if (this.mode === 'off') return false;
    if (this.mode === 'on') return true;
    return Boolean(this._hardwareTouchSeen);
  }

  _markTouchActivity() {
    if (this.player) {
      this.player._lastTouchEventAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    }
    sound.init?.();
  }

  _bindGlobalTouchDetector() {
    if (typeof window === 'undefined') return;
    const onFirstTouch = () => {
      if (!this._hardwareTouchSeen) {
        this._hardwareTouchSeen = true;
        this.syncVisibility();
      }
      if (this.player) {
        this.player._lastTouchEventAt = performance.now();
      }
    };
    window.addEventListener('touchstart', onFirstTouch, { passive: true });
    window.addEventListener('resize', () => this.syncVisibility(), { passive: true });
    window.addEventListener('orientationchange', () => this.syncVisibility(), { passive: true });

    // Allow tapping the top-left Minimap directly to open [M] Detailed Squad GPS Map!
    const minimapBox = document.getElementById('minimap-box');
    if (minimapBox && !minimapBox._boundMobileMapTap) {
      minimapBox._boundMobileMapTap = true;
      minimapBox.style.pointerEvents = 'auto';
      minimapBox.style.cursor = 'pointer';
      minimapBox.title = 'Tap or press [M] to open Detailed Squad GPS Map';
      minimapBox.addEventListener('click', (e) => {
        if (e.target && e.target.closest('button')) return;
        this.ui?.toggleCommandModal?.();
      });
    }
  }

  _buildDom() {
    if (typeof document === 'undefined') return;
    let root = document.getElementById('mobile-touch-layer');
    if (root) root.remove();

    root = document.createElement('div');
    root.id = 'mobile-touch-layer';
    root.className = 'hidden';
    root.innerHTML = `
      <!-- Portrait Rotate Hint Banner (Non-blocking, dismissible) -->
      <div id="mt-portrait-banner" class="hidden">
        <span>📱 Rotate phone to <b>Landscape</b> for best Dual-Thumb FPS control</span>
        <button type="button" id="mt-portrait-dismiss">✕</button>
      </div>

      <!-- 1. Left-Half Floating Analog Joystick Zone -->
      <div id="mt-left-zone">
        <div id="mt-stick-base">
          <div id="mt-sprint-latch">🏃 SPRINT</div>
          <div id="mt-stick-knob"></div>
        </div>
      </div>

      <!-- 2. Right-Half Free-Look Aiming Touchpad -->
      <div id="mt-right-zone"></div>

      <!-- 3. Upper-Left Secondary Fire Button (Claw / Sniper Stationary Tap-Fire) -->
      <button type="button" id="mt-left-fire-btn" class="mt-btn mt-fire-sec" aria-label="Secondary Fire">🔥</button>

      <!-- 4. Top-Right Compact Mobile Utility Strip -->
      <div id="mt-top-utils">
        <button type="button" id="mt-map-btn" class="mt-util-pill">🗺️ MAP</button>
        <button type="button" id="mt-ride-btn" class="mt-util-pill">🚁 RIDE</button>
        <button type="button" id="mt-armory-btn" class="mt-util-pill">🎒 GEAR</button>
        <button type="button" id="mt-fs-btn" class="mt-util-pill" title="Toggle Fullscreen">⛶</button>
      </div>

      <!-- 5. Scope-Only Precision Bar (Appears automatically while ADS / Scoped) -->
      <div id="mt-scope-bar" class="hidden">
        <button type="button" id="mt-breath-btn" class="mt-scope-pill">🫁 HOLD BREATH</button>
        <button type="button" id="mt-lrf-btn" class="mt-scope-pill">📡 RANGE [LRF]</button>
        <button type="button" id="mt-zoom-btn" class="mt-scope-pill">🔍 ZOOM</button>
      </div>

      <!-- 6. Context-Smart Action Pill (Revive, Bandage, Shotgun Shell Cycle, Enter/Exit Vehicle, Resupply) -->
      <div id="mt-context-bar">
        <button type="button" id="mt-shell-btn" class="mt-context-pill hidden">🐚 00 BUCK</button>
        <button type="button" id="mt-context-btn" class="mt-context-pill hidden">➕ REVIVE</button>
        <button type="button" id="mt-heal-btn" class="mt-context-pill mt-heal-pill hidden">🩹 HEAL</button>
        <button type="button" id="mt-exit-veh-btn" class="mt-context-pill mt-veh-exit hidden">🚪 EXIT</button>
        <button type="button" id="mt-cam-veh-btn" class="mt-context-pill hidden">🎥 CAM</button>
      </div>

      <!-- 7. Right-Thumb Combat Arc (Fire+Drag-Aim, ADS/Scope, Jump, Crouch/Hold-Prone, Reload) -->
      <div id="mt-right-cluster">
        <button type="button" id="mt-fire-btn" class="mt-btn mt-fire-main" aria-label="Fire & Aim">
          <span class="mt-icon">🔥</span>
          <span class="mt-lbl">FIRE</span>
        </button>
        <button type="button" id="mt-ads-btn" class="mt-btn mt-ads" aria-label="Aim Down Sights">
          <span class="mt-icon">🎯</span>
          <span class="mt-lbl">SCOPE</span>
        </button>
        <button type="button" id="mt-jump-btn" class="mt-btn mt-jump" aria-label="Jump or Vault">
          <span class="mt-icon">⬆️</span>
          <span class="mt-lbl">JUMP</span>
        </button>
        <button type="button" id="mt-crouch-btn" class="mt-btn mt-crouch" aria-label="Tap Crouch, Hold Prone">
          <span class="mt-icon" id="mt-crouch-icon">🧎</span>
          <span class="mt-lbl" id="mt-crouch-lbl">CROUCH</span>
        </button>
        <button type="button" id="mt-reload-btn" class="mt-btn mt-reload" aria-label="Reload">
          <span class="mt-icon">🔄</span>
          <span class="mt-lbl">RELOAD</span>
        </button>
      </div>

      <!-- 8. Bottom Center Tap-to-Switch Weapon & Grenade Bar -->
      <div id="mt-weapon-strip">
        <button type="button" class="mt-slot-btn active" data-slot="0"><span class="mt-slot-num">1</span><span class="mt-slot-name" id="mt-slot-lbl-0">PRIMARY</span></button>
        <button type="button" class="mt-slot-btn" data-slot="1"><span class="mt-slot-num">2</span><span class="mt-slot-name" id="mt-slot-lbl-1">SIDEARM</span></button>
        <button type="button" class="mt-slot-btn" data-slot="2"><span class="mt-slot-num">3</span><span class="mt-slot-name" id="mt-slot-lbl-2">GADGET</span></button>
        <button type="button" class="mt-slot-btn" data-slot="3"><span class="mt-slot-num">4</span><span class="mt-slot-name" id="mt-slot-lbl-3">MELEE</span></button>
        <button type="button" id="mt-grenade-btn" class="mt-slot-btn mt-gren-btn"><span class="mt-slot-num">G</span><span class="mt-slot-name" id="mt-gren-lbl">💥 2</span></button>
      </div>

      <!-- 9. Downed State Mobile Rescue / Give-Up Bar -->
      <div id="mt-downed-bar" class="hidden">
        <button type="button" id="mt-call-medic-btn" class="mt-downed-pill">📢 CALL MEDIC</button>
        <button type="button" id="mt-giveup-btn" class="mt-downed-pill mt-danger">💀 HOLD TO REDEPLOY</button>
      </div>
    `;
    document.body.appendChild(root);
    this.rootEl = root;
    this.leftZoneEl = root.querySelector('#mt-left-zone');
    this.stickBaseEl = root.querySelector('#mt-stick-base');
    this.stickKnobEl = root.querySelector('#mt-stick-knob');
    this.sprintLatchEl = root.querySelector('#mt-sprint-latch');
    this.rightZoneEl = root.querySelector('#mt-right-zone');
    this.fireBtnEl = root.querySelector('#mt-fire-btn');
    this.leftFireBtnEl = root.querySelector('#mt-left-fire-btn');
    this.adsBtnEl = root.querySelector('#mt-ads-btn');
    this.jumpBtnEl = root.querySelector('#mt-jump-btn');
    this.crouchBtnEl = root.querySelector('#mt-crouch-btn');
    this.crouchLblEl = root.querySelector('#mt-crouch-lbl');
    this.crouchIconEl = root.querySelector('#mt-crouch-icon');
    this.reloadBtnEl = root.querySelector('#mt-reload-btn');
    this.scopeBarEl = root.querySelector('#mt-scope-bar');
    this.breathBtnEl = root.querySelector('#mt-breath-btn');
    this.lrfBtnEl = root.querySelector('#mt-lrf-btn');
    this.zoomBtnEl = root.querySelector('#mt-zoom-btn');
    this.contextBtnEl = root.querySelector('#mt-context-btn');
    this.healBtnEl = root.querySelector('#mt-heal-btn');
    this.exitVehBtnEl = root.querySelector('#mt-exit-veh-btn');
    this.camVehBtnEl = root.querySelector('#mt-cam-veh-btn');
    this.weaponStripEl = root.querySelector('#mt-weapon-strip');
    this.downedBarEl = root.querySelector('#mt-downed-bar');
    this.portraitBannerEl = root.querySelector('#mt-portrait-banner');

    this._bindZoneEvents();
  }

  _vibrate(ms = 12) {
    try {
      navigator?.vibrate?.(ms);
    } catch (_) {}
  }

  _bindZoneEvents() {
    if (!this.rootEl) return;

    const dismissBtn = this.rootEl.querySelector('#mt-portrait-dismiss');
    dismissBtn?.addEventListener('click', () => {
      this._portraitDismissed = true;
      this.portraitBannerEl?.classList.add('hidden');
    });

    // ------------------------------------------------------------------------
    // 1. LEFT FLOATING ANALOG JOYSTICK + AUTO-SPRINT LATCH
    // ------------------------------------------------------------------------
    this.leftZoneEl.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        this._markTouchActivity();
        if (this._moveTouchId !== null) return;
        const t = e.changedTouches[0];
        if (!t) return;
        this._moveTouchId = t.identifier;
        const rect = this.leftZoneEl.getBoundingClientRect();
        const pad = 64;
        this._moveOriginX = Math.max(pad, Math.min(rect.width - pad, t.clientX - rect.left));
        this._moveOriginY = Math.max(pad, Math.min(rect.height - pad, t.clientY - rect.top));
        if (this.player) {
          this.player.touchSprintLocked = false;
        }
        this.stickBaseEl.style.left = `${this._moveOriginX}px`;
        this.stickBaseEl.style.top = `${this._moveOriginY}px`;
        this.stickBaseEl.classList.add('active');
        this.stickKnobEl.style.transform = 'translate(-50%, -50%)';
        this.sprintLatchEl.classList.remove('latched');
      },
      { passive: false }
    );

    this.leftZoneEl.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault();
        this._markTouchActivity();
        if (this._moveTouchId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (t.identifier === this._moveTouchId) {
            const rect = this.leftZoneEl.getBoundingClientRect();
            const dx = t.clientX - rect.left - this._moveOriginX;
            const dy = t.clientY - rect.top - this._moveOriginY;
            this._applyJoystickVector(dx, dy);
            break;
          }
        }
      },
      { passive: false }
    );

    const endMoveTouch = (e) => {
      if (this._moveTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this._moveTouchId) {
          this._moveTouchId = null;
          this.stickBaseEl.classList.remove('active');
          this.stickKnobEl.style.transform = 'translate(-50%, -50%)';
          if (this.player && !this.player.touchSprintLocked) {
            this._clearJoystickMovement();
          } else if (this.player && this.player.touchSprintLocked) {
            // Keep locked forward sprint running hands-free!
            this.player.touchMoveX = 0;
            this.player.touchMoveZ = -1;
            this.player.touchMoveMag = 1;
            this.stickKnobEl.style.transform = 'translate(-50%, calc(-50% - 36px))';
          }
          break;
        }
      }
    };
    this.leftZoneEl.addEventListener('touchend', endMoveTouch, { passive: true });
    this.leftZoneEl.addEventListener('touchcancel', endMoveTouch, { passive: true });

    // ------------------------------------------------------------------------
    // 2. RIGHT FREE-LOOK AIMING TOUCHPAD
    // ------------------------------------------------------------------------
    this.rightZoneEl.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        this._markTouchActivity();
        if (this._lookTouchId !== null) return;
        const t = e.changedTouches[0];
        if (!t) return;
        this._lookTouchId = t.identifier;
        this._lookLastX = t.clientX;
        this._lookLastY = t.clientY;
      },
      { passive: false }
    );

    this.rightZoneEl.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault();
        this._markTouchActivity();
        if (this._lookTouchId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (t.identifier === this._lookTouchId) {
            const dx = t.clientX - this._lookLastX;
            const dy = t.clientY - this._lookLastY;
            this._lookLastX = t.clientX;
            this._lookLastY = t.clientY;
            this._feedTouchLook(dx, dy);
            break;
          }
        }
      },
      { passive: false }
    );

    const endLookTouch = (e) => {
      if (this._lookTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this._lookTouchId) {
          this._lookTouchId = null;
          break;
        }
      }
    };
    this.rightZoneEl.addEventListener('touchend', endLookTouch, { passive: true });
    this.rightZoneEl.addEventListener('touchcancel', endLookTouch, { passive: true });

    // ------------------------------------------------------------------------
    // 3. MAIN RIGHT FIRE BUTTON (WITH SIMULTANEOUS DRAG-AIM / RECOIL CONTROL!)
    // ------------------------------------------------------------------------
    this.fireBtnEl.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._markTouchActivity();
        const t = e.changedTouches[0];
        if (!t) return;
        this._fireTouchId = t.identifier;
        this._fireLastX = t.clientX;
        this._fireLastY = t.clientY;
        this.fireBtnEl.classList.add('pressed');
        this._setFiringState(true);
      },
      { passive: false }
    );

    this.fireBtnEl.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._markTouchActivity();
        if (this._fireTouchId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (t.identifier === this._fireTouchId) {
            const dx = t.clientX - this._fireLastX;
            const dy = t.clientY - this._fireLastY;
            this._fireLastX = t.clientX;
            this._fireLastY = t.clientY;
            // CoD Mobile / PUBG Mobile simultaneous Fire + Drag-Recoil Aiming!
            this._feedTouchLook(dx, dy);
            break;
          }
        }
      },
      { passive: false }
    );

    const endFireTouch = (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this._fireTouchId) {
          this._fireTouchId = null;
          this.fireBtnEl.classList.remove('pressed');
          if (this._leftFireTouchId === null) {
            this._setFiringState(false);
          }
          break;
        }
      }
    };
    this.fireBtnEl.addEventListener('touchend', endFireTouch, { passive: true });
    this.fireBtnEl.addEventListener('touchcancel', endFireTouch, { passive: true });

    // Secondary Left-Side Fire Button (stationary sniping / claw grip)
    this.leftFireBtnEl.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._markTouchActivity();
        const t = e.changedTouches[0];
        if (!t) return;
        this._leftFireTouchId = t.identifier;
        this.leftFireBtnEl.classList.add('pressed');
        this._setFiringState(true);
      },
      { passive: false }
    );
    const endLeftFire = (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this._leftFireTouchId) {
          this._leftFireTouchId = null;
          this.leftFireBtnEl.classList.remove('pressed');
          if (this._fireTouchId === null) {
            this._setFiringState(false);
          }
          break;
        }
      }
    };
    this.leftFireBtnEl.addEventListener('touchend', endLeftFire, { passive: true });
    this.leftFireBtnEl.addEventListener('touchcancel', endLeftFire, { passive: true });

    // ------------------------------------------------------------------------
    // 4. ADS / SCOPE, JUMP, CROUCH / HOLD-PRONE & RELOAD
    // ------------------------------------------------------------------------
    this._bindTapButton(this.adsBtnEl, () => {
      if (!this.player) return;
      if (this.player.touchSprintLocked) {
        this.player.touchSprintLocked = false;
        if (this._moveTouchId === null) this._clearJoystickMovement();
      }
      this.player.toggleAdsScope?.();
      this._vibrate(10);
    });

    this.jumpBtnEl.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._markTouchActivity();
        if (!this.player) return;
        this.player.keys['Space'] = true;
        this.player._spaceJumpConsumed = false;
        this.jumpBtnEl.classList.add('pressed');
      },
      { passive: false }
    );
    const endJump = () => {
      if (this.player) {
        this.player.keys['Space'] = false;
        this.player._spaceJumpConsumed = false;
      }
      this.jumpBtnEl.classList.remove('pressed');
    };
    this.jumpBtnEl.addEventListener('touchend', endJump, { passive: true });
    this.jumpBtnEl.addEventListener('touchcancel', endJump, { passive: true });

    // Crouch (Tap) vs Prone (Hold 300ms) — classic PUBG / CoD Mobile stance button!
    this.crouchBtnEl.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._markTouchActivity();
        this._crouchDidProne = false;
        this.crouchBtnEl.classList.add('pressed');
        clearTimeout(this._crouchHoldTimer);
        this._crouchHoldTimer = setTimeout(() => {
          if (!this.player || this.player.dead || this.player.downed || this.player.activeVehicle) return;
          this._crouchDidProne = true;
          this.player.touchSprintLocked = false;
          this.player.prone = !this.player.prone;
          if (this.player.prone) this.player.crouching = false;
          this._vibrate(20);
        }, 300);
      },
      { passive: false }
    );
    const endCrouch = () => {
      clearTimeout(this._crouchHoldTimer);
      this.crouchBtnEl.classList.remove('pressed');
      if (!this._crouchDidProne && this.player && !this.player.dead && !this.player.downed && !this.player.activeVehicle) {
        this.player.touchSprintLocked = false;
        if (this.player.prone) {
          this.player.prone = false;
          this.player.crouching = true;
        } else {
          this.player.crouching = !this.player.crouching;
        }
        this._vibrate(10);
      }
    };
    this.crouchBtnEl.addEventListener('touchend', endCrouch, { passive: true });
    this.crouchBtnEl.addEventListener('touchcancel', () => {
      clearTimeout(this._crouchHoldTimer);
      this.crouchBtnEl.classList.remove('pressed');
    }, { passive: true });

    // Reload (Tap = Standard Reload, Hold 450ms = Tarkov Mag-Consolidation Slow Reload!)
    this.reloadBtnEl.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._markTouchActivity();
        this._reloadDidSlow = false;
        this.reloadBtnEl.classList.add('pressed');
        clearTimeout(this._reloadHoldTimer);
        this._reloadHoldTimer = setTimeout(() => {
          this._reloadDidSlow = true;
          this.player?.startSlowMagPackReload?.();
          this._vibrate(16);
        }, 450);
      },
      { passive: false }
    );
    this.reloadBtnEl.addEventListener(
      'touchend',
      () => {
        clearTimeout(this._reloadHoldTimer);
        this.reloadBtnEl.classList.remove('pressed');
        if (!this._reloadDidSlow) {
          if (this.player?.activeVehicle) {
            this.player.reloadActiveVehicleWeapon?.();
          } else {
            this.player?.startReload?.(false);
          }
        }
      },
      { passive: true }
    );

    // ------------------------------------------------------------------------
    // 5. SCOPE-ONLY BAR (HOLD BREATH, LRF AUTO-ZERO, ZOOM CYCLE)
    // ------------------------------------------------------------------------
    this.breathBtnEl.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._markTouchActivity();
        if (this.player) this.player.touchHoldBreath = true;
        this.breathBtnEl.classList.add('active');
      },
      { passive: false }
    );
    const endBreath = () => {
      if (this.player) this.player.touchHoldBreath = false;
      this.breathBtnEl.classList.remove('active');
    };
    this.breathBtnEl.addEventListener('touchend', endBreath, { passive: true });
    this.breathBtnEl.addEventListener('touchcancel', endBreath, { passive: true });

    this._bindTapButton(this.lrfBtnEl, () => {
      this.player?.triggerLaserRangefinder?.();
      this._vibrate(14);
    });

    this._bindTapButton(this.zoomBtnEl, () => {
      const cur = this.player?.currentWeapon?.();
      if (!cur?.def) return;
      const zLevels = Array.isArray(cur.def.zoomLevels) ? cur.def.zoomLevels : null;
      if (zLevels && zLevels.length > 1 && !this.player.useCantedSight) {
        this.player.opticZoomIndex = ((this.player.opticZoomIndex || 0) + 1) % zLevels.length;
        sound.playEmptyClick?.();
      } else if (cur.def.hasCantedSight) {
        this.player.useCantedSight = !this.player.useCantedSight;
        sound.playEmptyClick?.();
      }
    });

    // ------------------------------------------------------------------------
    // 6. WEAPON SLOTS [1-4], FRAG GRENADE, CONTEXT INTERACT & TOP UTILS
    // ------------------------------------------------------------------------
    this.rootEl.querySelectorAll('.mt-slot-btn[data-slot]').forEach((btn) => {
      this._bindTapButton(btn, () => {
        const idx = Number(btn.dataset.slot || 0);
        if (!this.player || this.player.dead || this.player.downed) return;
        if (this.player.activeVehicle) {
          if (typeof this.player.switchVehicleWeaponSlot === 'function') {
            this.player.switchVehicleWeaponSlot(idx);
          } else {
            this.player.activeVehicle.activeWeaponSlot = idx;
            sound.playWeaponSwitch?.();
          }
        } else if (typeof this.player.switchSlot === 'function') {
          this.player.switchSlot(idx);
        } else if (this.player.slots?.[idx]) {
          this.player.currentSlotIndex = idx;
          this.player.isAds = false;
          this.player.rebuildViewModel?.();
          sound.playWeaponSwitch?.();
        }
      });
    });

    this._bindTapButton(this.rootEl.querySelector('#mt-grenade-btn'), () => {
      this.player?.throwFragGrenade?.();
      this._vibrate(15);
    });

    // Context-Smart Hold/Tap Button (Revive holds KeyF; Vehicle/Supply triggers immediately)
    this.contextBtnEl.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._markTouchActivity();
        if (!this.player) return;
        if (this._currentContextAction === 'vehicle') {
          this.player.handleVehicleAndDragKey?.();
        } else {
          this.player.keys['KeyF'] = true;
          this.player.handleInteractKey?.();
        }
        this.contextBtnEl.classList.add('pressed');
      },
      { passive: false }
    );
    const endContext = () => {
      if (this.player) this.player.keys['KeyF'] = false;
      this.contextBtnEl.classList.remove('pressed');
    };
    this.contextBtnEl.addEventListener('touchend', endContext, { passive: true });
    this.contextBtnEl.addEventListener('touchcancel', endContext, { passive: true });

    // Heal / Bandage Hold/Tap Pill
    this.healBtnEl.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._markTouchActivity();
        if (this.player) this.player.keys['KeyH'] = true;
        this.healBtnEl.classList.add('pressed');
      },
      { passive: false }
    );
    const endHeal = () => {
      if (this.player) this.player.keys['KeyH'] = false;
      this.healBtnEl.classList.remove('pressed');
    };
    this.healBtnEl.addEventListener('touchend', endHeal, { passive: true });
    this.healBtnEl.addEventListener('touchcancel', endHeal, { passive: true });

    this._bindTapButton(this.exitVehBtnEl, () => {
      this.player?.handleVehicleAndDragKey?.();
    });
    this.shellBtnEl = this.rootEl.querySelector('#mt-shell-btn');
    this._bindTapButton(this.shellBtnEl, () => {
      this.player?.cycleShotgunShellType?.();
      this._vibrate(14);
    });
    this._bindTapButton(this.camVehBtnEl, () => {
      if (this.player?.activeVehicle) {
        this.player.vehicleThirdPerson = !this.player.vehicleThirdPerson;
        sound.playEmptyClick?.();
      }
    });

    this._bindTapButton(this.rootEl.querySelector('#mt-map-btn'), () => {
      this.ui?.toggleCommandModal?.();
    });
    this._bindTapButton(this.rootEl.querySelector('#mt-ride-btn'), () => {
      this.player?.handleAltRRideAction?.(this.ui);
    });
    this._bindTapButton(this.rootEl.querySelector('#mt-armory-btn'), () => {
      if (this.ui) {
        this.ui._gunsmithActiveTab = this.player?.activeVehicle ? 'vehicles' : 'gunsmith';
        this.ui.toggleGunsmithModal?.(true);
      }
    });
    this._bindTapButton(this.rootEl.querySelector('#mt-fs-btn'), () => {
      const docEl = document.documentElement;
      if (!document.fullscreenElement) {
        docEl.requestFullscreen?.().catch?.(() => {});
      } else {
        document.exitFullscreen?.().catch?.(() => {});
      }
    });

    // Downed State Buttons (Call Medic / Hold Space to Give Up)
    this._bindTapButton(this.rootEl.querySelector('#mt-call-medic-btn'), () => {
      this.player?.onCommoCommand?.('need_medic', 'NEED A MEDIC!', '➕');
    });
    const giveUpBtn = this.rootEl.querySelector('#mt-giveup-btn');
    giveUpBtn?.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._markTouchActivity();
        if (this.player) this.player.keys['Space'] = true;
      },
      { passive: false }
    );
    const endGiveUp = () => {
      if (this.player) this.player.keys['Space'] = false;
    };
    giveUpBtn?.addEventListener('touchend', endGiveUp, { passive: true });
    giveUpBtn?.addEventListener('touchcancel', endGiveUp, { passive: true });
  }

  _bindTapButton(el, handler) {
    if (!el) return;
    let handledByTouch = false;
    el.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        handledByTouch = true;
        this._markTouchActivity();
        handler();
      },
      { passive: false }
    );
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (handledByTouch) {
        handledByTouch = false;
        return;
      }
      handler();
    });
  }

  _applyJoystickVector(dx, dy) {
    if (!this.player) return;
    const dist = Math.hypot(dx, dy);
    const r = this._stickRadius;
    const clampedDist = Math.min(r, dist);
    const nx = dist > 0.001 ? dx / dist : 0;
    const ny = dist > 0.001 ? dy / dist : 0;

    this.stickKnobEl.style.transform = `translate(calc(-50% + ${nx * clampedDist}px), calc(-50% + ${ny * clampedDist}px))`;

    const mag = Math.min(1.0, dist / r);
    if (mag < 0.1) {
      this._clearJoystickMovement();
      return;
    }

    // Upward push past 1.25x stick radius engages PUBG/CoD Auto-Sprint Lock!
    const sprintPush = dy < -r * 1.18 && Math.abs(dx) < r * 0.85;
    if (sprintPush && !this.player.touchSprintLocked) {
      this.player.touchSprintLocked = true;
      this.sprintLatchEl.classList.add('latched');
      this._vibrate(14);
    } else if (dy > -r * 0.45 && this.player.touchSprintLocked) {
      this.player.touchSprintLocked = false;
      this.sprintLatchEl.classList.remove('latched');
    }

    if (this.player.activeVehicle && !this.player.activeVehicle.isAircraft) {
      // Ground Vehicle Driving via Left Stick (Throttle + Steer + Boost!)
      this.player.touchMoveX = 0;
      this.player.touchMoveZ = 0;
      this.player.touchMoveMag = 0;
      this.player.keys['KeyW'] = ny < -0.28;
      this.player.keys['KeyS'] = ny > 0.32;
      this.player.keys['KeyA'] = nx < -0.28;
      this.player.keys['KeyD'] = nx > 0.28;
      this.player.keys['ShiftLeft'] = Boolean(sprintPush);
    } else {
      // 360° Smooth Infantry Analog Stride
      this.player.keys['KeyW'] = false;
      this.player.keys['KeyS'] = false;
      this.player.keys['KeyA'] = false;
      this.player.keys['KeyD'] = false;
      this.player.touchMoveX = nx * mag;
      this.player.touchMoveZ = ny * mag;
      this.player.touchMoveMag = mag;
    }
  }

  _clearJoystickMovement() {
    if (!this.player) return;
    this.player.touchMoveX = 0;
    this.player.touchMoveZ = 0;
    this.player.touchMoveMag = 0;
    this.player.touchSprintLocked = false;
    this.player.keys['KeyW'] = false;
    this.player.keys['KeyS'] = false;
    this.player.keys['KeyA'] = false;
    this.player.keys['KeyD'] = false;
    this.player.keys['ShiftLeft'] = false;
    this.sprintLatchEl?.classList.remove('latched');
  }

  _feedTouchLook(dxPx, dyPx) {
    if (!this.player || typeof this.player.applyLookDelta !== 'function') return;
    const speedPx = Math.hypot(dxPx, dyPx);
    if (speedPx <= 0.001 || speedPx > 140) return;

    // CoD Mobile subtle speed-acceleration curve on hip-fire flicks (disabled while ADS so sniping is 1:1 linear!)
    const accel = this.player.isAds ? 1.0 : 1.0 + Math.min(0.85, speedPx * 0.022);
    const scale = 1.65 * (this.touchSensPct / 100) * accel;
    this.player.applyLookDelta(dxPx * scale, dyPx * scale, true);
  }

  _setFiringState(firing) {
    if (!this.player || this.player.dead || this.player.downed) return;
    if (firing) {
      this.player.isFiring = true;
      if (!this.player.activeVehicle) {
        this.player.tryFireSingle?.();
      }
    } else {
      this.player.isFiring = false;
    }
  }

  resetAllActiveTouches() {
    this._moveTouchId = null;
    this._lookTouchId = null;
    this._fireTouchId = null;
    this._leftFireTouchId = null;
    this._clearJoystickMovement();
    if (this.player) {
      this.player.isFiring = false;
      this.player.touchHoldBreath = false;
      this.player.keys['KeyF'] = false;
      this.player.keys['KeyH'] = false;
      this.player.keys['Space'] = false;
    }
    this.stickBaseEl?.classList.remove('active');
    this.fireBtnEl?.classList.remove('pressed');
    this.leftFireBtnEl?.classList.remove('pressed');
  }

  syncVisibility() {
    if (!this.rootEl || typeof document === 'undefined') return;
    const wantTouch = this.shouldEnableTouchHud();
    document.body.classList.toggle('mobile-touch-active', wantTouch);

    const onMainMenu = (() => {
      const mm = document.getElementById('main-menu-screen');
      return Boolean(mm && !mm.classList.contains('hidden') && mm.style.display !== 'none');
    })();
    const modalOpen = Boolean(this.player?.isModalOpen?.());
    const showInGameTouch = Boolean(wantTouch && !onMainMenu && !modalOpen && this.player && !this.player.dead);

    if (!showInGameTouch && this.active) {
      this.resetAllActiveTouches();
    }
    this.active = showInGameTouch;
    this.rootEl.classList.toggle('hidden', !showInGameTouch);

    if (showInGameTouch && this.portraitBannerEl) {
      const isPortrait = window.innerHeight > window.innerWidth * 1.05;
      this.portraitBannerEl.classList.toggle('hidden', !isPortrait || this._portraitDismissed);
    }
  }

  update() {
    this.syncVisibility();
    if (!this.active || !this.player) return;

    const p = this.player;
    const isDowned = Boolean(p.downed);
    this.downedBarEl.classList.toggle('hidden', !isDowned);
    this.weaponStripEl.classList.toggle('hidden', isDowned);
    this.rightZoneEl.style.pointerEvents = isDowned ? 'none' : 'auto';

    if (isDowned) return;

    // 1. Update ADS, Scope Bar & Stance Badges
    this.adsBtnEl.classList.toggle('toggled-on', Boolean(p.isAds));
    const inVeh = Boolean(p.activeVehicle);
    this.scopeBarEl.classList.toggle('hidden', !p.isAds || inVeh);
    this.crouchBtnEl.classList.toggle('hidden', inVeh);
    this.jumpBtnEl.classList.toggle('hidden', inVeh);

    if (!inVeh) {
      if (p.prone) {
        this.crouchIconEl.textContent = '🐍';
        this.crouchLblEl.textContent = 'PRONE';
        this.crouchBtnEl.classList.add('toggled-on');
      } else if (p.crouching) {
        this.crouchIconEl.textContent = '🧎';
        this.crouchLblEl.textContent = 'CROUCH';
        this.crouchBtnEl.classList.add('toggled-on');
      } else {
        this.crouchIconEl.textContent = '🧎';
        this.crouchLblEl.textContent = 'CROUCH';
        this.crouchBtnEl.classList.remove('toggled-on');
      }
    }

    // 2. Update Bottom Weapon Strip Labels & Active Slot
    const grenCount = p.grenades || 0;
    const curSlot = inVeh ? p.activeVehicle.activeWeaponSlot || 0 : p.currentSlotIndex || 0;
    const slotSig = `${inVeh ? p.activeVehicle.type : p.role}:${curSlot}:${grenCount}:${p.slots?.map((s) => s?.def?.shortName || '').join('|')}`;
    if (slotSig !== this._lastSlotSig) {
      this._lastSlotSig = slotSig;
      this.rootEl.querySelectorAll('.mt-slot-btn[data-slot]').forEach((btn) => {
        const idx = Number(btn.dataset.slot || 0);
        btn.classList.toggle('active', idx === curSlot);
        const lbl = btn.querySelector('.mt-slot-name');
        if (lbl) {
          if (inVeh) {
            if (p.activeVehicle.type === 'tank') {
              lbl.textContent =
                idx === 0 ? '120MM' : idx === 1 ? '7.62 COAX' : idx === 2 ? '.50 AA' : 'ATGM';
            } else {
              lbl.textContent = idx === 0 ? 'MAIN GUN' : idx === 1 ? 'COAX / 2ND' : idx === 2 ? 'ORDNANCE' : 'AUX';
            }
          } else {
            const s = p.slots?.[idx];
            lbl.textContent = s?.def?.shortName || `SLOT ${idx + 1}`;
          }
        }
      });
      const grenLbl = this.rootEl.querySelector('#mt-gren-lbl');
      if (grenLbl) grenLbl.textContent = `💥 ${grenCount}`;
    }

    // 3. Throttled Context-Smart Interact Pill (10 Hz)
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - this._lastContextScanAt < 100) return;
    this._lastContextScanAt = now;

    this.exitVehBtnEl.classList.toggle('hidden', !inVeh);
    this.camVehBtnEl.classList.toggle('hidden', !inVeh);

    const curWep = !inVeh && typeof p.currentWeapon === 'function' ? p.currentWeapon() : null;
    const holdingShotgun = Boolean(
      curWep?.def && (curWep.def.isShotgun || curWep.def.activeShellBadge)
    );
    if (this.shellBtnEl) {
      this.shellBtnEl.classList.toggle('hidden', !holdingShotgun);
      if (holdingShotgun) {
        this.shellBtnEl.textContent = `${curWep.def.activeShellBadge || '🐚 00 BUCK'} ⟳`;
      }
    }

    const showHeal = Boolean(!inVeh && (p.bleeding || p.hp < 88) && (p.bandages || 0) > 0);
    this.healBtnEl.classList.toggle('hidden', !showHeal);
    if (showHeal) {
      this.healBtnEl.textContent = p.bleeding
        ? `🩸 STOP BLEED (${p.bandages})`
        : `🩹 BANDAGE (${p.bandages})`;
    }

    if (inVeh) {
      this.contextBtnEl.classList.add('hidden');
      this._currentContextAction = null;
      return;
    }

    // Check nearby downed ally, vehicle, or ammo crate
    let ctxLabel = null;
    let ctxKind = null;
    const nearDowned = p.botManager?.findNearestDownedFriendly?.(p.pos, p.team, 4.2);
    if (nearDowned) {
      ctxLabel = `➕ HOLD REVIVE ${nearDowned.name}`;
      ctxKind = 'revive';
    } else {
      const nearVeh = p.vehicleManager?.findNearestEnterableVehicle?.(p.pos, 5.5, p.team, p);
      if (nearVeh) {
        const vShort = (nearVeh.name || nearVeh.type || 'VEHICLE').split(' (')[0];
        ctxLabel = `🚙 BOARD ${vShort}`;
        ctxKind = 'vehicle';
      } else if (Array.isArray(p.world?.ammoCrates)) {
        for (let i = 0; i < p.world.ammoCrates.length; i++) {
          const c = p.world.ammoCrates[i];
          if (c && p.pos.distanceToSquared(c.pos) <= 4.5 * 4.5) {
            ctxLabel = '📦 RESUPPLY AMMO';
            ctxKind = 'interact';
            break;
          }
        }
      }
    }

    this._currentContextAction = ctxKind;
    if (ctxLabel) {
      this.contextBtnEl.textContent = ctxLabel;
      this.contextBtnEl.classList.remove('hidden');
    } else {
      this.contextBtnEl.classList.add('hidden');
    }
  }
}
