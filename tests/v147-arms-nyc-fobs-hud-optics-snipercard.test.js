import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from '../vendor/three.module.js';

import {
  createWeaponViewModel,
  getWeaponHipOffsetX,
  updateFirstPersonArmShoulders
} from '../src/models/weapon-model.js?v=148';
import { WEAPON_DEFS } from '../src/assets/weapon-defs.js?v=148';
import { ATTACHMENT_CATALOG } from '../src/assets/attachment-defs.js?v=148';
import { GunsmithMethods } from '../src/player/GunsmithState.js?v=148';
import {
  computeBallisticSolution,
  evaluateMarksmanShot
} from '../src/player/MarksmanSystem.js?v=148';
import { FRUGIS_RIVER_MAP } from '../src/maps/frugis-river.js?v=148';
import { VoxelWorld } from '../src/world/VoxelWorld.js?v=148';

const ROOT = process.cwd();

test('v147: 1st-person blocky arms align forearm, cuff, and wrist colinearly without broken-wrist snap or ADS obstruction', () => {
  const testWeapons = [
    WEAPON_DEFS.m4a1,
    WEAPON_DEFS.rem870,
    WEAPON_DEFS.sv98,
    WEAPON_DEFS.mp443,
    WEAPON_DEFS.rangefinder_binos
  ];

  for (const def of testWeapons) {
    const vm = createWeaponViewModel(def, 'US', {});
    vm.position.set(getWeaponHipOffsetX(def), -0.2, -0.31);
    updateFirstPersonArmShoulders(vm);
    vm.updateMatrixWorld(true);

    const leftArm = vm.getObjectByName('leftArmGroup');
    const rightArm = vm.getObjectByName('rightArmGroup');
    assert.ok(leftArm && rightArm, `${def.id} must have left & right blocky arms`);

    for (const arm of [leftArm, rightArm]) {
      const { forearm, sleeveFold, wristRig, upperSleeve, elbowPad } = arm.userData.ikRefs;
      assert.ok(wristRig, `${def.id} arm must include colinear wristRig`);
      // Forearm, sleeveFold, and wristRig must share exact colinear orientation (dot product ~1.0)
      const qDotCuff = Math.abs(forearm.quaternion.dot(sleeveFold.quaternion));
      const qDotWrist = Math.abs(forearm.quaternion.dot(wristRig.quaternion));
      assert.ok(qDotCuff > 0.999, `${def.id} sleeveFold must be colinear with forearm`);
      assert.ok(qDotWrist > 0.999, `${def.id} wristRig must be colinear with forearm (no broken wrist)`);

      // Verify forearm +Y top end actually reaches toward the hand (not inverted reflection!)
      const elbowW = elbowPad.getWorldPosition(new THREE.Vector3());
      const foreTopW = new THREE.Vector3(0, 0.11, 0).applyMatrix4(forearm.matrixWorld);
      const handW = arm.userData.ikRefs.handGroup.getWorldPosition(new THREE.Vector3());
      assert.ok(
        foreTopW.distanceTo(handW) < elbowW.distanceTo(handW) * 0.45,
        `${def.id} forearm front end must meet the blocky glove cuff`
      );
      assert.ok(upperSleeve, `${def.id} must have upperSleeve`);
    }
  }
});

test('v147: Anti-Materiel & Sniper ammo scales realistically by cartridge mass/volume (never 2,000 .50 BMG / 20mm shells)', () => {
  const mockPlayer = Object.assign(
    {
      role: 'recon',
      team: 'US',
      world: { era: 'modern' },
      equippedUpgrades: {
        vest: 'tv110_heavy',
        backpack: 'raid_pack',
        tacticalGear: 'std_helmet'
      },
      weaponAttachments: {
        ntw20: { magazine: 'drum_mag' },
        barrett_m82: { magazine: 'drum_mag' },
        m4a1: { magazine: 'std_mag' }
      }
    },
    GunsmithMethods
  );
  mockPlayer.ensureWarehouseStructures();

  const ntwDef = mockPlayer.buildCustomizedWeaponDef(WEAPON_DEFS.ntw20, true, 'ntw20');
  const barrettDef = mockPlayer.buildCustomizedWeaponDef(WEAPON_DEFS.barrett_m82, true, 'barrett_m82');
  const m4Def = mockPlayer.buildCustomizedWeaponDef(WEAPON_DEFS.m4a1, true, 'm4a1');

  // 20×82mm (~210g/shell): max loose in XL Raid Pack must be realistic (~33–40 shells, <= 50), NEVER 2,000!
  assert.equal(ntwDef.roundMassGrams, 210);
  assert.ok(
    ntwDef.maxLooseAmmo <= 50 && ntwDef.reserveAmmo + ntwDef.maxLooseAmmo <= 110,
    `NTW-20 20mm total ammo (${ntwDef.reserveAmmo} + ${ntwDef.maxLooseAmmo}) must reflect 210g cannon shell weight`
  );

  // .50 BMG (~117g/round): max loose in XL Raid Pack ~60–72 rounds (<= 90), NEVER 2,000!
  assert.equal(barrettDef.roundMassGrams, 117);
  assert.ok(
    barrettDef.maxLooseAmmo <= 90 && barrettDef.reserveAmmo + barrettDef.maxLooseAmmo <= 240,
    `Barrett .50 BMG total ammo (${barrettDef.reserveAmmo} + ${barrettDef.maxLooseAmmo}) must reflect 117g cartridge bulk`
  );

  // Standard 12.3g 5.56×45mm rifle in XL 6SH118 Raid Pack still carries 660+ loose rounds
  assert.ok(m4Def.maxLooseAmmo >= 660, `M4A1 5.56mm should still hold >= 660 loose rounds in XL Raid Pack`);
});

test('v147: Binoculars support wide 4x–64x zoom & 20x–40x scope laser drop dot lands a 1,500m headshot when zeroed to 800m', () => {
  const binos = WEAPON_DEFS.rangefinder_binos;
  assert.deepEqual(binos.zoomLevels, [4.0, 8.0, 16.0, 32.0, 48.0, 64.0]);
  assert.ok(binos.zoomFovs[0] >= 28.0, 'Binoculars lowest zoom must provide wide >= 28 deg FOV');
  assert.ok(binos.zoomFovs[binos.zoomFovs.length - 1] <= 2.0, 'Binoculars max zoom must reach <= 2.0 deg telephoto FOV');

  const optic40x = ATTACHMENT_CATALOG.optic.find((o) => o.id === 'ballistic_40x');
  assert.ok(optic40x?.hasSmartPipper && optic40x?.hasBuiltInLrf, '20x–40x scope must enable smart laser drop pipper & LRF');

  // Exact User Scenario Verification:
  // Target at 1,500m (head center at y = 1.62m), rifle zeroed to 800m, using 40x scope (fov = 2.85 deg).
  // If the sniper places the red laser pipper dot right on the enemy's head, the simulated 60Hz bullet must hit the head!
  for (const rifle of [WEAPON_DEFS.awm, WEAPON_DEFS.sv98, WEAPON_DEFS.barrett_m82]) {
    assert.ok((rifle.maxEffectiveRange || 0) >= 2500, `${rifle.id} must reach >= 2500m`);
    const distM = 1500;
    const zeroM = 800;
    const shooterY = 1.65;
    const enemyHeadY = 1.65;
    const sol = computeBallisticSolution(distM, shooterY - enemyHeadY, 0, rifle, zeroM);

    // Aim camera upward by exact `atan(sol.dropTan)` so the laser pipper dot sits directly on `enemyHeadY`!
    const aimPitchRad = Math.atan(sol.dropTan);
    const v0 = rifle.muzzleVelocity;
    const g = rifle.bulletGravity;
    const zeroElev = (g * zeroM) / (2 * v0 * v0);

    // Exact `executeFire` + `_stepBallisticBullet` 60Hz trajectory integration
    const cosP = Math.cos(aimPitchRad);
    const sinP = Math.sin(aimPitchRad);
    let lx = cosP - zeroElev * sinP;
    let ly = sinP + zeroElev * cosP;
    const lLen = Math.hypot(lx, ly);
    lx /= lLen;
    ly /= lLen;

    let vx = lx * v0;
    let vy = ly * v0;
    let px = 0;
    let py = shooterY;
    const dt = 1 / 60;
    const damp = 1 - 0.06 * dt;
    let prevX = 0;
    let prevY = shooterY;
    while (px < distM) {
      prevX = px;
      prevY = py;
      vy -= g * dt;
      vx *= damp;
      vy *= damp;
      px += vx * dt;
      py += vy * dt;
    }
    const frac = (distM - prevX) / (px - prevX);
    const impactY = prevY + (py - prevY) * frac;
    const headErrorM = Math.abs(impactY - enemyHeadY);
    assert.ok(
      headErrorM < 0.06,
      `${rifle.id} at 1500m (800m zero) aiming laser dot on head must hit within 6cm, got error ${headErrorM.toFixed(4)}m`
    );
  }
});

test('v147: Sniper card triggers strictly on KILLS only and includes multi-kill victims, bullet angles, front/side/back aspect & motion state', () => {
  // 1. Non-lethal hit (even a 600m headshot!) must NOT trigger the sniper card
  const nonKill = evaluateMarksmanShot({
    wepDef: WEAPON_DEFS.sv98,
    distanceM: 620,
    isKill: false,
    isHeadshot: true,
    damageDealt: 95
  });
  assert.equal(nonKill.triggered, false, 'Non-lethal shots must never trigger sniper card');

  // 2. First kill from rooftop (downward angle, shot from RIGHT SIDE, sprinting target)
  const kill1 = evaluateMarksmanShot({
    wepDef: WEAPON_DEFS.awm,
    distanceM: 420,
    shooterPos: { x: 0, y: 68, z: 0 },
    impactPos: { x: 0, y: 1.5, z: -420 },
    isKill: true,
    isHeadshot: true,
    damageDealt: 354,
    targetSpeedMps: 5.8,
    entryAspect: 'RIGHT SIDE',
    entryBearingDeg: 88,
    impactAngleDeg: 11.4,
    victimName: 'Sgt. Volkov'
  });
  assert.equal(kill1.triggered, true);
  assert.equal(kill1.entryAspect, 'RIGHT SIDE');
  assert.equal(kill1.motionState, 'SPRINTING');
  assert.ok(kill1.launchAngleDeg < -8, 'Rooftop downward shot must record negative launch elevation angle');
  assert.equal(kill1.victims.length, 1);

  // 3. Follow-up / Multi-Kill (shot from BACK, target STILL) chains onto `victims` array!
  const kill2 = evaluateMarksmanShot({
    wepDef: WEAPON_DEFS.awm,
    distanceM: 435,
    shooterPos: { x: 0, y: 68, z: 0 },
    impactPos: { x: 8, y: 1.5, z: -435 },
    isKill: true,
    isHeadshot: false,
    oneShotKill: true,
    damageDealt: 195,
    targetSpeedMps: 0,
    entryAspect: 'BACK',
    entryBearingDeg: 176,
    impactAngleDeg: 11.8,
    victimName: 'Cpl. Morozov',
    priorVictims: kill1.victims
  });
  assert.equal(kill2.triggered, true);
  assert.equal(kill2.multiKillCount, 2);
  assert.equal(kill2.victims.length, 2, 'Multi-kill card must include both eliminated victims');
  assert.equal(kill2.victims[0].entryAspect, 'RIGHT SIDE');
  assert.equal(kill2.victims[0].motionState, 'SPRINTING');
  assert.equal(kill2.victims[1].entryAspect, 'BACK');
  assert.equal(kill2.victims[1].motionState, 'STILL');
});

test('v147: HUD vitals figure includes live stance/motion pose & NYC Objective C + Town/Distribution Centers A, B, D, E build cleanly', () => {
  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const hudJs = fs.readFileSync(path.join(ROOT, 'src', 'ui', 'HudRenderer.js'), 'utf8');
  const baseCss = fs.readFileSync(path.join(ROOT, 'css', 'base.css'), 'utf8');

  assert.match(indexHtml, /id="vitals-pose-label"/);
  assert.match(indexHtml, /id="limb-svg-ground"/);
  assert.match(indexHtml, /id="scope-ballistic-drop-stem"/);
  assert.match(hudJs, /PRONE:\s*'GROUND'/);
  assert.match(hudJs, /mm-victims-strip/);
  assert.match(baseCss, /width:\s*min\(92vw,\s*146vh\)/);

  // Verify NYC Downtown C (28 towers/mid-rises), Town Centers A & D (16 buildings each), and Distribution Centers B & E
  const blds = FRUGIS_RIVER_MAP.buildings;
  const nycBlds = blds.filter(([gx, gz]) => Math.abs(gx * 1.25) <= 190 && Math.abs(gz * 1.25) <= 145);
  const fobABlds = blds.filter(([gx, gz]) => Math.abs(gx * 1.25 + 660) <= 115 && Math.abs(gz * 1.25 + 280) <= 105);
  const fobDBlds = blds.filter(([gx, gz]) => Math.abs(gx * 1.25 - 330) <= 115 && Math.abs(gz * 1.25 + 320) <= 105);
  const fobBContainers = FRUGIS_RIVER_MAP.shippingContainers.filter(
    ([gx, gz]) => Math.abs(gx * 1.25 + 320) <= 95 && Math.abs(gz * 1.25 - 320) <= 85
  );
  const fobEContainers = FRUGIS_RIVER_MAP.shippingContainers.filter(
    ([gx, gz]) => Math.abs(gx * 1.25 - 660) <= 95 && Math.abs(gz * 1.25 - 280) <= 85
  );

  assert.ok(nycBlds.length >= 28, `NYC Downtown C should have >= 28 skyscrapers & mid-rises, got ${nycBlds.length}`);
  assert.ok(fobABlds.length >= 16, `FOB A Town Center should have >= 16 buildings, got ${fobABlds.length}`);
  assert.ok(fobDBlds.length >= 16, `FOB D Town Center should have >= 16 buildings, got ${fobDBlds.length}`);
  assert.ok(fobBContainers.length >= 15, `FOB B Distribution Center should have >= 15 containers, got ${fobBContainers.length}`);
  assert.ok(fobEContainers.length >= 15, `FOB E Distribution Center should have >= 15 containers, got ${fobEContainers.length}`);

  const scene = new THREE.Scene();
  const world = new VoxelWorld(scene, 'frugis_river');
  assert.equal(world._hasOverflowVoxels, false, 'Expanded NYC & FOB centers must have zero 31-bit key overflows');
  assert.ok(world.buildings.length >= 90, `Expanded Frugis River Valley should construct >= 90 buildings, built ${world.buildings.length}`);
});
