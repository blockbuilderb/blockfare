import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from '../vendor/three.module.js';

import {
  WEAPON_DEFS,
  ALL_MODERN_ROLES,
  PRIMARY_WEAPON_CATEGORIES,
  SECONDARY_WEAPON_CATEGORIES,
  getWeaponCategory
} from '../src/weapons.js?v=146';
import {
  createWeaponViewModel,
  getWeaponHipOffsetX,
  updateFirstPersonArmShoulders
} from '../src/models/weapon-model.js?v=146';
import { GunsmithMethods } from '../src/player/GunsmithState.js?v=146';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

test('v145: CoD Primary & Secondary weapon categories cover all 33 modern guns and allow universal role equip', () => {
  const primIds = PRIMARY_WEAPON_CATEGORIES.map((c) => c.id);
  assert.deepEqual(primIds, ['assault_rifle', 'smg', 'shotgun', 'lmg', 'marksman', 'sniper']);
  assert.deepEqual(SECONDARY_WEAPON_CATEGORIES.map((c) => c.id), ['pistol']);

  // Explicit category checks
  assert.equal(getWeaponCategory(WEAPON_DEFS.m4a1), 'assault_rifle');
  assert.equal(getWeaponCategory(WEAPON_DEFS.ak15), 'assault_rifle');
  assert.equal(getWeaponCategory(WEAPON_DEFS.vector), 'smg');
  assert.equal(getWeaponCategory(WEAPON_DEFS.rem870), 'shotgun');
  assert.equal(getWeaponCategory(WEAPON_DEFS.m1014), 'shotgun');
  assert.equal(getWeaponCategory(WEAPON_DEFS.aa12), 'shotgun');
  assert.equal(getWeaponCategory(WEAPON_DEFS.m249), 'lmg');
  assert.equal(getWeaponCategory(WEAPON_DEFS.mk14), 'marksman');
  assert.equal(getWeaponCategory(WEAPON_DEFS.sr25), 'marksman');
  assert.equal(getWeaponCategory(WEAPON_DEFS.sv98), 'sniper');
  assert.equal(getWeaponCategory(WEAPON_DEFS.barrett_m82), 'sniper');
  assert.equal(getWeaponCategory(WEAPON_DEFS.mp443), 'pistol');
  assert.equal(getWeaponCategory(WEAPON_DEFS.deagle), 'pistol');

  const modernGuns = Object.values(WEAPON_DEFS).filter(
    (w) => w.type === 'gun' && !w.isBow && !w.isThrowingBlade && !w.isVenomSpit
  );
  assert.equal(modernGuns.length, 33, `Expected 33 modern guns, got ${modernGuns.length}`);

  for (const gun of modernGuns) {
    for (const role of ALL_MODERN_ROLES) {
      assert.ok(
        Array.isArray(gun.allowedClasses) && gun.allowedClasses.includes(role),
        `Modern gun ${gun.id} should allow modern role ${role}`
      );
    }
  }

  // Verify GunsmithState.buyOrSelectWeapon equips shotguns, snipers & rifles on ANY modern role
  const mockPlayer = Object.assign(Object.create(GunsmithMethods), {
    role: 'recon',
    warehouseCash: 100000,
    matchCash: 5000,
    ownedWeapons: new Set(['m4a1', 'sv98', 'mp443', 'rem870']),
    ownedUpgrades: new Set(),
    weaponAttachments: {},
    equippedUpgrades: {},
    classLoadoutSelections: {},
    syncTotalCash() {},
    saveGunsmithState() {},
    emitCashUpdate() {},
    syncActiveEquippedUpgrades() {},
    applyCustomizationsToActiveLoadout() {},
    spendFunds(amount) {
      this.warehouseCash -= amount;
      return { ok: true };
    }
  });

  for (const role of ALL_MODERN_ROLES) {
    mockPlayer.role = role;
    const r870Res = mockPlayer.buyOrSelectWeapon(role, 'primary', 'rem870');
    assert.equal(r870Res.ok, true, `${role} should equip rem870 shotgun`);
    assert.equal(mockPlayer.classLoadoutSelections[role].primary, 'rem870');

    const m1014Res = mockPlayer.buyOrSelectWeapon(role, 'primary', 'm1014');
    assert.equal(m1014Res.ok, true, `${role} should unlock & equip m1014 shotgun`);
    assert.equal(mockPlayer.classLoadoutSelections[role].primary, 'm1014');

    const sv98Res = mockPlayer.buyOrSelectWeapon(role, 'primary', 'sv98');
    assert.equal(sv98Res.ok, true, `${role} should equip sv98 sniper`);

    const deagleRes = mockPlayer.buyOrSelectWeapon(role, 'secondary', 'deagle');
    assert.equal(deagleRes.ok, true, `${role} should equip deagle secondary`);
  }
});

test('v145: 1st-person dual-arm IK anchors left arm to left shoulder and right arm to right shoulder', () => {
  // Symmetrical 2-handed items must center at x = 0 instead of right-side +0.22
  assert.equal(getWeaponHipOffsetX(WEAPON_DEFS.rangefinder_binos), 0);
  assert.equal(getWeaponHipOffsetX(WEAPON_DEFS.medkit), 0);
  assert.equal(getWeaponHipOffsetX(WEAPON_DEFS.ammocrate), 0);
  assert.ok(getWeaponHipOffsetX(WEAPON_DEFS.m4a1) > 0.15);

  const testCases = [
    { def: WEAPON_DEFS.rangefinder_binos, pos: new THREE.Vector3(0, -0.25, -0.45) },
    { def: WEAPON_DEFS.m4a1, pos: new THREE.Vector3(0.19, -0.25, -0.45) },
    { def: WEAPON_DEFS.rem870, pos: new THREE.Vector3(0.19, -0.25, -0.45) }
  ];

  for (const { def, pos } of testCases) {
    const vm = createWeaponViewModel(def, 'US', {});
    vm.position.copy(pos);
    updateFirstPersonArmShoulders(vm);
    vm.updateMatrixWorld(true);

    const leftArm = vm.getObjectByName('leftArmGroup');
    const rightArm = vm.getObjectByName('rightArmGroup');
    assert.ok(leftArm?.userData?.ikRefs, `${def.id} missing leftArmGroup ikRefs`);
    assert.ok(rightArm?.userData?.ikRefs, `${def.id} missing rightArmGroup ikRefs`);

    // Upper-arm root (local y = -0.11 of upperSleeve) in camera space must sit at negative X (left shoulder)
    // for left arm and positive X (right shoulder) for right arm — NEVER both on the right side!
    const leftShoulderCam = new THREE.Vector3(0, -0.11, 0).applyMatrix4(
      leftArm.userData.ikRefs.upperSleeve.matrixWorld
    );
    const rightShoulderCam = new THREE.Vector3(0, -0.11, 0).applyMatrix4(
      rightArm.userData.ikRefs.upperSleeve.matrixWorld
    );
    const leftElbowCam = leftArm.userData.ikRefs.elbowPad.getWorldPosition(new THREE.Vector3());
    const rightElbowCam = rightArm.userData.ikRefs.elbowPad.getWorldPosition(new THREE.Vector3());

    assert.ok(
      leftShoulderCam.x < -0.2,
      `${def.id}: left shoulder camX (${leftShoulderCam.x.toFixed(3)}) must be on left side (< -0.20)`
    );
    assert.ok(
      rightShoulderCam.x > 0.2,
      `${def.id}: right shoulder camX (${rightShoulderCam.x.toFixed(3)}) must be on right side (> +0.20)`
    );
    assert.ok(
      leftElbowCam.y <= -0.21 && rightElbowCam.y <= -0.21,
      `${def.id}: elbows must stay below center sightline`
    );
  }
});

test('v145: Deploy, Loadout/Gunsmith, and Settings use compact centered windows', () => {
  const deployCss = fs.readFileSync(path.join(ROOT, 'css', 'deploy.css'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const gunsmithJs = fs.readFileSync(path.join(ROOT, 'src', 'ui', 'GunsmithModal.js'), 'utf8');
  const settingsJs = fs.readFileSync(path.join(ROOT, 'src', 'ui', 'SettingsModal.js'), 'utf8');

  assert.match(deployCss, /width:\s*min\(880px,\s*95vw\)/);
  assert.match(deployCss, /height:\s*min\(565px,\s*93vh\)/);
  assert.ok(indexHtml.includes('id="deploy-cod-loadout"'));
  assert.ok(indexHtml.includes('id="deploy-squad-select"'));

  assert.match(gunsmithJs, /width:\s*min\(900px,\s*95vw\)/);
  assert.match(gunsmithJs, /height:\s*min\(585px,\s*92vh\)/);
  assert.ok(gunsmithJs.includes('renderCodWeaponsMode'));
  assert.ok(gunsmithJs.includes('cod-cat-btn'));

  assert.match(settingsJs, /width:\s*min\(650px,\s*94vw\)/);
  assert.ok(settingsJs.includes('settings-tab-btn'));
});
