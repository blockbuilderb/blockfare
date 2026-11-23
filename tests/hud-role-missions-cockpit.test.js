import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { CommandPanel } from '../src/ui/CommandPanel.js?v=116';
import { HudRenderer } from '../src/ui/HudRenderer.js?v=116';

function makeMockElement(id = '') {
  const attrs = new Map();
  const classes = new Set();
  return {
    id,
    dataset: {},
    style: {},
    innerHTML: '',
    textContent: '',
    classList: {
      add: (...c) => c.forEach((x) => classes.add(x)),
      remove: (...c) => c.forEach((x) => classes.delete(x)),
      toggle: (c, force) => {
        const shouldHave = force === undefined ? !classes.has(c) : Boolean(force);
        if (shouldHave) classes.add(c);
        else classes.delete(c);
        return shouldHave;
      },
      contains: (c) => classes.has(c)
    },
    setAttribute: (k, v) => attrs.set(k, String(v)),
    getAttribute: (k) => attrs.get(k) ?? null,
    addEventListener: () => {},
    querySelectorAll: () => []
  };
}

function makeUiHarness({ player, world, botManager, vehicleManager }) {
  const elements = new Map();
  const getEl = (id) => {
    if (!elements.has(id)) {
      elements.set(id, makeMockElement(id));
    }
    return elements.get(id);
  };
  const ctx = {
    player,
    world,
    botManager: botManager || { bots: [] },
    vehicleManager: vehicleManager || { vehicles: [] },
    el: getEl,
    elements
  };
  Object.assign(ctx, CommandPanel, HudRenderer);
  return ctx;
}

describe('Rank-Tiered Left Tactical Hub & Dynamic Role Mission Feed', () => {
  test('shows full Commander panel for COMMANDER, simpler Squad panel for SQUAD_LEADER, and dynamic auto-hiding missions for MEMBER', () => {
    const prevDoc = globalThis.document;
    globalThis.document = { querySelectorAll: () => [] };
    try {
      const world = {
        era: 'modern',
        getGroundHeightAt: () => 0,
        flags: [
          { id: 'A', owner: 'RU', contested: false, pos: new THREE.Vector3(-400, 0, -200) },
          { id: 'B', owner: 'US', contested: true, pos: new THREE.Vector3(0, 0, -300) },
          { id: 'C', owner: 'US', contested: false, pos: new THREE.Vector3(300, 0, 0) }
        ],
        activeCasRequest: null
      };
      const enemyJet = {
        id: 'ru_jet_1',
        type: 'plane',
        isAircraft: true,
        aircraftRole: 'fighter',
        team: 'RU',
        dead: false,
        forwardSpeed: 88,
        pos: new THREE.Vector3(250, 180, -250)
      };
      const player = {
        team: 'US',
        squad: 'FALCON',
        role: 'pilot',
        commandRank: 'COMMANDER',
        commandScope: 'ALL',
        pos: new THREE.Vector3(0, 0, 0),
        activeVehicle: null
      };
      const ui = makeUiHarness({
        player,
        world,
        botManager: { bots: [] },
        vehicleManager: { vehicles: [enemyJet] }
      });

      // 1. COMMANDER tier
      ui.updateCommandOrderHud('modern');
      const cmdPanel = ui.el('command-order-panel');
      assert.equal(cmdPanel.dataset.hudTier, 'COMMANDER');
      assert.equal(cmdPanel.classList.contains('hidden'), false);
      assert.equal(ui.el('cmd-panel-title').textContent, '★ FORCE COMMANDER ORDERS');

      // 2. SQUAD_LEADER tier (forces SQUAD scope and shows compact Squad Lead title)
      player.commandRank = 'SQUAD_LEADER';
      player.commandScope = 'ALL';
      ui.updateCommandOrderHud('modern');
      assert.equal(cmdPanel.dataset.hudTier, 'SQUAD_LEADER');
      assert.equal(player.commandScope, 'SQUAD');
      assert.equal(cmdPanel.classList.contains('hidden'), false);
      assert.match(ui.el('cmd-panel-title').textContent, /FALCON SQUAD LEAD/);

      // 3. MEMBER (Pilot) with active enemy fighter + contested B + enemy A -> shows Pilot Sortie Missions!
      player.commandRank = 'MEMBER';
      ui.updateCommandOrderHud('modern');
      assert.equal(cmdPanel.dataset.hudTier, 'MEMBER');
      assert.equal(cmdPanel.classList.contains('hidden'), false);
      assert.equal(ui.el('cmd-panel-title').textContent, '✈️ PILOT SORTIE MISSIONS');
      assert.equal(ui._latestRoleMissions.length, 3);
      assert.match(ui._latestRoleMissions[0].text, /INTERCEPT ENEMY FIGHTER/);
      assert.match(ui._latestRoleMissions[1].text, /CLOSE AIR ON OBJ B/);
      assert.match(ui._latestRoleMissions[2].text, /BOMB ENEMY OBJ A/);

      // 4. When all objectives are friendly & uncontested and enemy air is eliminated -> hides panel completely!
      enemyJet.dead = true;
      world.flags.forEach((f) => {
        f.owner = 'US';
        f.contested = false;
      });
      ui.updateCommandOrderHud('modern');
      assert.equal(ui._latestRoleMissions.length, 0);
      assert.equal(cmdPanel.classList.contains('hidden'), true);
      assert.equal(cmdPanel.style.display, 'none');

      // 5. Medic & Engineer role-specific triage / repair tasks
      player.role = 'medic';
      ui.botManager.bots = [
        { team: 'US', dead: false, downed: true, hp: 20, maxHp: 100, pos: new THREE.Vector3(30, 0, -40) }
      ];
      ui.updateCommandOrderHud('modern');
      assert.equal(cmdPanel.classList.contains('hidden'), false);
      assert.equal(ui.el('cmd-panel-title').textContent, '➕ MEDIC TRIAGE MISSIONS');
      assert.match(ui._latestRoleMissions[0].text, /REVIVE DOWNED ALLY/);

      player.role = 'engineer';
      ui.botManager.bots = [];
      ui.vehicleManager.vehicles = [
        { id: 'us_tank_1', type: 'tank', isAircraft: false, team: 'US', dead: false, hp: 600, maxHp: 1500, pos: new THREE.Vector3(25, 0, 0) }
      ];
      ui.updateCommandOrderHud('modern');
      assert.equal(cmdPanel.classList.contains('hidden'), false);
      assert.equal(ui.el('cmd-panel-title').textContent, '🛠️ ENGINEER FIELD TASKS');
      assert.match(ui._latestRoleMissions[0].text, /REPAIR TANK \(40% HP\)/);
    } finally {
      globalThis.document = prevDoc;
    }
  });
});

describe('Bottom-Right Aircraft Cockpit HUD: Engine RPM, Climb/Dive Profile & Compass', () => {
  test('updates analog Engine RPM meter, side-profile Climb/Dive pitch gauge, and 360° Compass + target bearing bug', () => {
    const world = {
      era: 'modern',
      getGroundHeightAt: () => 0,
      flags: [{ id: 'A', owner: 'RU', contested: false, pos: new THREE.Vector3(500, 0, 0) }],
      activeCasRequest: null
    };
    const jet = {
      id: 'us_f15_1',
      type: 'plane',
      isAircraft: true,
      aircraftRole: 'fighter',
      team: 'US',
      dead: false,
      isShotDown: false,
      hp: 1500,
      maxHp: 1500,
      pos: new THREE.Vector3(0, 220, 0),
      velVector: new THREE.Vector3(0, 24, -85),
      forwardSpeed: 88,
      minSpeed: 30,
      speed: 68,
      maxSpeed: 105,
      yaw: -Math.PI / 2, // Heading 090° East (+X)
      pitch: (18 * Math.PI) / 180, // +18° nose-up climb
      roll: 0
    };
    const player = {
      team: 'US',
      role: 'pilot',
      keys: { KeyW: true },
      yaw: jet.yaw,
      pitch: jet.pitch,
      activeVehicle: jet,
      activePing: {
        pos: new THREE.Vector3(0, 0, -400), // Due North (000°) -> 90° left of East heading!
        timer: 10,
        label: 'BOMB OBJ A'
      }
    };
    const ui = makeUiHarness({ player, world });

    ui.updateAircraftCockpitHud(jet, 0.05);

    // 1. Engine RPM Tachometer responds to WEP/Afterburner ([W])
    assert.equal(ui.el('air-rpm-pct').textContent, '108% WEP/AB');
    assert.match(ui.el('air-rpm-num').textContent, /RPM$/);
    assert.match(ui.el('air-rpm-needle').getAttribute('transform'), /^rotate\(/);

    // 2. Side-Profile Climb / Dive Gauge tilts nose UP (negative SVG rotation) and shows ▲ CLIMB
    assert.equal(ui.el('air-profile-plane-group').getAttribute('transform'), 'rotate(-18.0 54 56)');
    assert.match(ui.el('air-profile-footer').textContent, /^▲ CLIMB \+18°/);

    // 3. Dedicated Compass rotates -90° for 090° E heading and points target bug -90° (North)
    assert.equal(ui.el('air-compass-ring').getAttribute('transform'), 'rotate(-90.0 56 56)');
    assert.equal(ui.el('air-compass-tgt-bug').getAttribute('opacity'), '1');
    assert.equal(ui.el('air-compass-tgt-bug').getAttribute('transform'), 'rotate(-90.0 56 56)');
    assert.equal(ui.el('air-compass-footer').textContent, '090° E • ▶WP');

    // 4. Diving + Shot-down state flips Climb/Dive to ▼ DIVE and Engine RPM to 0% FAIL
    jet.pitch = (-20 * Math.PI) / 180;
    jet.velVector.y = -28;
    jet.isShotDown = true;
    player.keys = {};
    ui._airCockpitHudAccum = 0.05;
    ui.updateAircraftCockpitHud(jet, 1.0);

    assert.equal(ui.el('air-rpm-pct').textContent, '0% FAIL');
    assert.equal(ui.el('air-profile-plane-group').getAttribute('transform'), 'rotate(20.0 54 56)');
    assert.match(ui.el('air-profile-footer').textContent, /^▼ DIVE -20°/);
  });
});
