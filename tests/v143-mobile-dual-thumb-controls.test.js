import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from '../vendor/three.module.js';
import { PlayerController } from '../src/player/PlayerController.js?v=145';
import { MobileTouchControls } from '../src/ui/MobileTouchControls.js?v=145';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

test('v143 Mobile Suite: applyLookDelta optical FOV zoom scaling & analog thumbstick + sprint-lock state', () => {
  // Verify PlayerController.prototype.applyLookDelta scales sensitivity cleanly between 75° hipfire and 6° sniper zoom!
  const mockPlayer = {
    dead: false,
    isAds: false,
    camera: new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 4000),
    keys: {},
    yaw: 0,
    pitch: 0,
    _pendingLookYaw: 0,
    _pendingLookPitch: 0,
    swayX: 0,
    swayY: 0,
    prone: false,
    crouching: false,
    isHoldingBreath: false
  };

  PlayerController.prototype.applyLookDelta.call(mockPlayer, 40, 20, true, false);
  const hipYawDelta = Math.abs(mockPlayer.yaw + mockPlayer._pendingLookYaw);
  assert.ok(hipYawDelta > 0.04, `Expected meaningful hipfire touch yaw turn, got ${hipYawDelta}`);

  // Now switch to 27x Sniper Scope (FOV = 4.1°) and apply identical 40px touch drag
  mockPlayer.yaw = 0;
  mockPlayer._pendingLookYaw = 0;
  mockPlayer.isAds = true;
  mockPlayer.camera.fov = 4.1;
  PlayerController.prototype.applyLookDelta.call(mockPlayer, 40, 20, true, false);
  const sniperYawDelta = Math.abs(mockPlayer.yaw + mockPlayer._pendingLookYaw);
  assert.ok(sniperYawDelta > 0, 'Expected non-zero precision sniper look delta');
  assert.ok(
    sniperYawDelta < hipYawDelta * 0.15,
    `Expected 27x scope touch sensitivity (${sniperYawDelta}) to be <15% of hipfire (${hipYawDelta})`
  );
});

test('v143 Mobile Suite: MobileTouchControls floating joystick, auto-sprint latch, vehicle steering & Fire+Drag-Aim', () => {
  const lookCalls = [];
  const fakePlayer = {
    dead: false,
    downed: false,
    isAds: false,
    isFiring: false,
    keys: {},
    touchMoveX: 0,
    touchMoveZ: 0,
    touchMoveMag: 0,
    touchSprintLocked: false,
    touchHoldBreath: false,
    activeVehicle: null,
    slots: [
      { def: { shortName: 'M4A1' } },
      { def: { shortName: 'MP443' } },
      { def: { shortName: 'RPG-7' } },
      { def: { shortName: 'HAMMER' } }
    ],
    currentSlotIndex: 0,
    grenades: 2,
    applyLookDelta(dx, dy, isTouch) {
      lookCalls.push({ dx, dy, isTouch });
    },
    tryFireSingle() {
      this._singleFired = (this._singleFired || 0) + 1;
    }
  };

  // Headless instantiation (typeof document === 'undefined' in Node)
  const mt = new MobileTouchControls(fakePlayer, {});
  mt.stickKnobEl = { style: {} };
  mt.sprintLatchEl = { classList: { add() {}, remove() {} } };

  // 1. Mode switching ('auto' -> 'on' -> 'off') & sensitivity clamping
  assert.equal(mt.setMode('on'), 'on');
  assert.equal(mt.shouldEnableTouchHud(), true);
  assert.equal(mt.setMode('off'), 'off');
  assert.equal(mt.shouldEnableTouchHud(), false);
  assert.equal(mt.setSensitivity(135), 135);

  // 2. Partial joystick deflection -> smooth 360° analog movement without sprint lock
  mt._applyJoystickVector(26, -26);
  assert.ok(fakePlayer.touchMoveX > 0.3 && fakePlayer.touchMoveZ < -0.3);
  assert.equal(fakePlayer.touchSprintLocked, false);

  // 3. Full upward push (>1.18x stick radius) engages PUBG/CoD Auto-Sprint Lock!
  mt._applyJoystickVector(0, -72);
  assert.equal(fakePlayer.touchSprintLocked, true);

  // 4. Ground Vehicle Driving: Left joystick maps directly to Throttle + Steer keys!
  fakePlayer.activeVehicle = { type: 'humvee', isAircraft: false };
  mt._applyJoystickVector(35, -35);
  assert.equal(fakePlayer.keys['KeyW'], true);
  assert.equal(fakePlayer.keys['KeyD'], true);
  fakePlayer.activeVehicle = null;

  // 5. Simultaneous Fire + Drag-Aim feeds look deltas cleanly
  mt._setFiringState(true);
  assert.equal(fakePlayer.isFiring, true);
  assert.equal(fakePlayer._singleFired, 1);
  mt._feedTouchLook(18, -12);
  assert.equal(lookCalls.length, 1);
  assert.equal(lookCalls[0].isTouch, true);
  mt.resetAllActiveTouches();
  assert.equal(fakePlayer.isFiring, false);

  // 6. Verify mobile CSS & viewport meta tags exist on disk
  const html = fs.readFileSync(path.join(PROJECT_ROOT, 'index.html'), 'utf8');
  assert.ok(html.includes('viewport-fit=cover'), 'Expected viewport-fit=cover in index.html');
  assert.ok(fs.existsSync(path.join(PROJECT_ROOT, 'css/mobile.css')), 'Expected css/mobile.css');
});
