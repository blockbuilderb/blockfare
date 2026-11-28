import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {
  createVehicleMesh,
  syncMotoWheeliePose,
  computeMotoLocalPointWorld
} from '../src/models/vehicle-model.js?v=150';
import { WEAPON_DEFS } from '../src/assets/weapon-defs.js?v=150';
import { GunsmithMethods } from '../src/player/GunsmithState.js?v=150';
import { CombatMethods } from '../src/player/PlayerCombat.js?v=150';
import { ProjectileManager } from '../src/world/ProjectileManager.js?v=150';
import { SettingsModal } from '../src/ui/SettingsModal.js?v=150';

describe('v150 — Rear-Wheel Motorcycle Wheelie Pivot & Developer Options Nuke Ammo', () => {
  test('1. Motorcycle, Scooter & ATV wheelies rotate strictly around the rear wheel axle so rear tire maintains 100% ground contact', () => {
    const configs = [
      {
        label: '600cc Supersport Motorcycle',
        cfg: { type: 'bike', team: 'US', bikeSubType: 'sport_600cc' },
        expectedRearRadius: 0.39,
        expectedRearZ: 0.88
      },
      {
        label: '1000cc Superbike (scale 1.08)',
        cfg: { type: 'bike', team: 'RU', bikeSubType: 'superbike_1000cc' },
        expectedRearRadius: 0.39 * 1.08,
        expectedRearZ: 0.88 * 1.08
      },
      {
        label: 'Kukirin G4 Max Electric Scooter',
        cfg: { type: 'bike', team: 'US', bikeSubType: 'scooter_kukirin', isScooter: true },
        expectedRearRadius: 0.29,
        expectedRearZ: 0.78
      },
      {
        label: '4x4 Quad ATV',
        cfg: { type: 'atv', team: 'US' },
        expectedRearRadius: 0.44,
        expectedRearZ: 0.96
      }
    ];

    const flatWorld = { getGroundHeightAt: () => 0 };

    for (const item of configs) {
      const built = createVehicleMesh(item.cfg);
      const mesh = built.group;
      assert.ok(mesh.userData.rearWheelPivot, `${item.label} has rearWheelPivot group`);

      const frontWheel = built.wheels[0];
      const rearWheel = built.wheels[built.wheels.length - 1];
      const veh = {
        type: item.cfg.type,
        pos: mesh.position,
        mesh,
        yaw: 0.42,
        pitch: 0,
        roll: 0
      };
      veh.pos.set(12, 0, -8);

      const frontWorld = new THREE.Vector3();
      const rearWorld = new THREE.Vector3();

      // Sweep wheelie angles from flat (0 rad) up to steep wheelie (0.48 rad ~ 27.5 deg)
      for (const pitch of [0, 0.12, 0.24, 0.36, 0.48]) {
        veh.pitch = pitch;
        veh.roll = 0;
        syncMotoWheeliePose(veh, flatWorld);
        mesh.updateMatrixWorld(true);

        frontWheel.getWorldPosition(frontWorld);
        rearWheel.getWorldPosition(rearWorld);

        const rearTireBottomY = rearWorld.y - item.expectedRearRadius;
        assert.ok(
          Math.abs(rearTireBottomY - 0) < 1e-4,
          `${item.label} at pitch=${pitch}: rear tire bottom must touch ground y=0 (got ${rearTireBottomY})`
        );

        if (pitch > 0) {
          assert.ok(
            frontWorld.y > rearWorld.y + 0.15,
            `${item.label} at pitch=${pitch}: front wheel lifts cleanly above rear wheel (${frontWorld.y.toFixed(3)} > ${rearWorld.y.toFixed(3)})`
          );
        }
      }

      // Verify 1st-person rider eye rises cleanly with the wheelie instead of clipping into handlebars
      veh.pitch = 0;
      syncMotoWheeliePose(veh, flatWorld);
      const eyeFlat = computeMotoLocalPointWorld(veh, 0, 1.56, 0.12, new THREE.Vector3());
      veh.pitch = 0.36;
      syncMotoWheeliePose(veh, flatWorld);
      const eyeWheelie = computeMotoLocalPointWorld(veh, 0, 1.56, 0.12, new THREE.Vector3());
      assert.ok(
        eyeWheelie.y > eyeFlat.y + 0.15,
        `${item.label}: 1st-person rider eye rises naturally during wheelie (${eyeWheelie.y.toFixed(3)} > ${eyeFlat.y.toFixed(3)})`
      );
    }
  });

  test('2. Developer Options code (LEFT, RIGHT, LEFT, RIGHT, UP, DOWN) unlocks & arms Nuke Ammo that nukes where any gun shoots', () => {
    const scene = new THREE.Scene();
    const explosions = [];
    let nukeVisualCount = 0;

    const mockWorld = Object.assign({}, ProjectileManager, {
      scene,
      voxels: new Map(),
      elevatedPlatforms: [],
      skyscraperHullBoxes: [],
      getGroundHeightAt: () => 0,
      raycastVoxel(origin, dir, maxDist) {
        // Intersect flat ground y = 0 along ray
        if (dir.y < -0.001) {
          const t = -origin.y / dir.y;
          if (t > 0 && t <= maxDist) {
            return {
              voxel: null,
              isGround: true,
              distance: t,
              point: new THREE.Vector3(
                origin.x + dir.x * t,
                0,
                origin.z + dir.z * t
              ),
              normal: new THREE.Vector3(0, 1, 0)
            };
          }
        }
        return null;
      },
      damageAreaVoxels: () => {},
      spawnBulletImpact: () => {}
    });

    const origSpawnNuke = mockWorld.spawnNukeExplosionVisual.bind(mockWorld);
    mockWorld.spawnNukeExplosionVisual = (pos, radius) => {
      nukeVisualCount++;
      origSpawnNuke(pos, radius);
    };

    const cam = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 3000);
    cam.position.set(0, 1.65, 0);
    cam.lookAt(0, 0, -40);
    cam.updateMatrixWorld(true);

    const player = Object.assign({}, GunsmithMethods, CombatMethods, {
      name: 'DEV_TESTER',
      team: 'US',
      role: 'assault',
      pos: new THREE.Vector3(0, 1.65, 0),
      yaw: 0,
      pitch: -0.04,
      hp: 100,
      dead: false,
      downed: false,
      isAds: true,
      adsAmount: 1,
      zeroDistance: 100,
      suppressionLevel: 0,
      reloading: false,
      slowReloading: false,
      fireTimer: 0,
      camera: cam,
      scene,
      world: mockWorld,
      raycaster: new THREE.Raycaster(),
      activeBullets: [],
      syncCameraTransform() {
        cam.position.set(0, 1.65, 0);
        cam.lookAt(0, 0, -40);
        cam.updateMatrixWorld(true);
      },
      ejectBrassCasing() {},
      startReload() {},
      onExplosionDamage: (pos, radius, maxDamage, _owner, _broken, weaponLabel) => {
        explosions.push({ pos: pos.clone(), radius, maxDamage, weaponLabel });
      }
    });

    // Wrong sequence does NOT unlock Nuke Ammo
    player.feedDevCodeInput('LEFT');
    player.feedDevCodeInput('UP');
    assert.equal(Boolean(player.devNukeAmmoEnabled), false);

    // Exact directional sequence LEFT, RIGHT, LEFT, RIGHT, UP, DOWN unlocks & activates Nuke Ammo!
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'ArrowUp']) {
      const r = player.feedDevCodeInput(key);
      assert.equal(r.matched, false);
    }
    const finalRes = player.feedDevCodeInput('ArrowDown');
    assert.equal(finalRes.matched, true);
    assert.equal(player.devNukeCodeUnlocked, true);
    assert.equal(player.devNukeAmmoEnabled, true);

    // Also verify text code entry ('left right left right up down') works in Developer Options
    player.setDevNukeAmmo(false);
    assert.equal(player.devNukeAmmoEnabled, false);
    const txtRes = player.submitDevCodeText('left right left right up down');
    assert.equal(txtRes.matched, true);
    assert.equal(player.devNukeAmmoEnabled, true);

    // Verify SettingsModal renders the Developer Options tab & Armed Nuke Ammo toggle
    const fakeModal = {
      innerHTML: '',
      querySelectorAll: () => [],
      querySelector: () => null
    };
    const settingsHost = Object.assign({}, SettingsModal, {
      _settingsActiveTab: 'developer',
      player,
      world: mockWorld,
      el: () => null,
      updateAudioSettingsHud: () => {}
    });
    settingsHost.renderSettingsModalContent(fakeModal);
    assert.ok(fakeModal.innerHTML.includes('DEVELOPER SECRET CODE CONSOLE'));
    assert.ok(fakeModal.innerHTML.includes('NUKE AMMO ACTIVE'));
    assert.ok(fakeModal.innerHTML.includes('settings-dev-nuke-toggle-btn'));

    // Fire multiple completely different guns (Assault Rifle M4A1, Pistol MP-443, Sniper SV-98, and Multi-Pellet Shotgun)
    const shotgunDef = Object.values(WEAPON_DEFS).find((w) => w && w.isShotgun);
    assert.ok(shotgunDef && (shotgunDef.pellets || 0) > 1, 'found multi-pellet shotgun in WEAPON_DEFS');
    const testGuns = [WEAPON_DEFS.m4a1, WEAPON_DEFS.mp443, WEAPON_DEFS.sv98, shotgunDef];
    for (const def of testGuns) {
      const slotObj = {
        weaponId: def.id,
        def,
        clip: def.clipSize || 8,
        reserve: 60,
        looseAmmo: 60,
        mags: [def.clipSize || 8],
        mesh: new THREE.Group()
      };
      player.slots = [slotObj];
      player.currentSlotIndex = 0;
      player.currentWeapon = () => slotObj;
      player.fireTimer = 0;
      player._semiTriggerArmed = true;

      const prevCount = explosions.length;
      player.tryFireSingle();

      // Advance bullets until impact on ground ~40m ahead
      for (let step = 0; step < 15 && player.activeBullets.length > 0; step++) {
        player.updateBallisticBullets(0.03);
      }

      assert.equal(
        explosions.length,
        prevCount + 1,
        `${def.shortName} detonated exactly 1 Tactical Nuke at the impact point (even for multi-pellet shotgun)`
      );
      const lastBlast = explosions[explosions.length - 1];
      assert.equal(lastBlast.weaponLabel, '☢️ TACTICAL NUKE AMMO');
      assert.ok(lastBlast.radius >= 30);
      assert.ok(lastBlast.maxDamage >= 2500);
      assert.ok(
        Math.abs(lastBlast.pos.z - -40) < 10.0,
        `Nuke detonated where player aimed (z=${lastBlast.pos.z.toFixed(1)})`
      );
    }
    assert.equal(nukeVisualCount, testGuns.length, '3D Mushroom Cloud visual spawned for every shot');

    // ─── Verify Dev Tab is ON by default right now, and turning it OFF hides tab + disarms Nuke Ammo ───
    assert.equal(player.isDevTabEnabled(), true, 'Dev Tab is left ON by default right now');
    assert.ok(
      fakeModal.innerHTML.includes('data-stab="developer"'),
      'SettingsModal shows the Dev Options tab while enabled'
    );
    assert.ok(
      fakeModal.innerHTML.includes('dev-disable-tab-btn'),
      'Dev Options panel provides 1-click Turn Off & Hide Dev Tab button'
    );

    // Turn OFF the Dev Tab -> immediately disarms Nuke Ammo, hides Dev Tab, and restores realistic balance!
    player.setDevTabEnabled(false);
    assert.equal(player.isDevTabEnabled(), false);
    assert.equal(player.devNukeAmmoEnabled, false, 'Turning off Dev Tab immediately disarms Nuke Ammo');
    assert.equal(player.devNukeCodeUnlocked, false, 'Turning off Dev Tab clears unlocked cheat state');

    // Secret code entry & setDevNukeAmmo(true) must be completely blocked while Dev Tab is OFF
    const blockedTextRes = player.submitDevCodeText('left right left right up down');
    assert.equal(blockedTextRes.matched, false, 'Typed cheat code rejected when Dev Tab is OFF');
    assert.equal(player.setDevNukeAmmo(true), false, 'Cannot arm Nuke Ammo when Dev Tab is OFF');
    assert.equal(player.devNukeAmmoEnabled, false);

    // SettingsModal hides `🛠️ Dev Options` tab and switches back to Gameplay showing `OFF (Realistic)`
    settingsHost._settingsActiveTab = 'developer';
    settingsHost.renderSettingsModalContent(fakeModal);
    assert.equal(
      settingsHost._settingsActiveTab,
      'gameplay',
      'Active tab automatically falls back from developer to gameplay when Dev Tab is turned off'
    );
    assert.ok(
      !fakeModal.innerHTML.includes('data-stab="developer"'),
      'Dev Options tab is completely hidden from Settings header when turned OFF'
    );
    assert.ok(
      fakeModal.innerHTML.includes('settings-dev-tab-toggle-btn') &&
        fakeModal.innerHTML.includes('OFF (Realistic)'),
      'Gameplay settings exposes toggle showing OFF (Realistic) so user can turn it back ON later'
    );

    // Firing a gun while Dev Tab is OFF fires normal ballistic ammo (0 Nuke detonations!)
    const explosionsBeforeNormalShot = explosions.length;
    player.fireTimer = 0;
    player._semiTriggerArmed = true;
    player.tryFireSingle();
    for (let step = 0; step < 15 && player.activeBullets.length > 0; step++) {
      player.updateBallisticBullets(0.03);
    }
    assert.equal(
      explosions.length,
      explosionsBeforeNormalShot,
      'Standard ballistic shot does NOT detonate a Nuke when Dev Tab is OFF'
    );

    // Turning Dev Tab back ON restores the tab (still disarmed until code is entered again),
    // and Multiplayer Host Admin disabling Dev Options overrides non-admin clients!
    player.setDevTabEnabled(true);
    assert.equal(player.isDevTabEnabled(), true);
    assert.equal(player.devNukeAmmoEnabled, false);
    settingsHost.renderSettingsModalContent(fakeModal);
    assert.ok(fakeModal.innerHTML.includes('data-stab="developer"'), 'Dev Tab re-appears when turned back ON');

    player.submitDevCodeText('left right left right up down');
    assert.equal(player.devNukeAmmoEnabled, true);
    player.network = {
      isMultiplayer: () => true,
      isLocalAdmin: () => false,
      roomAllowDevOptions: false
    };
    assert.equal(
      player.isDevTabEnabled(),
      false,
      'Non-admin client in Multiplayer respects Host Admin disabling Dev Options'
    );
    assert.equal(
      player.devNukeAmmoEnabled,
      false,
      'Non-admin client Nuke Ammo is automatically disarmed when Host Admin disables Dev Options'
    );
  });
});
