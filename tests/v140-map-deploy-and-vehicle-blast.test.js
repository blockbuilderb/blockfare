import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { BotManager } from '../src/bots/BotManager.js?v=150';
import { VehicleManager } from '../src/vehicles.js?v=150';
import { CommandPanel } from '../src/ui/CommandPanel.js?v=150';
import { MinimapRenderer } from '../src/ui/MinimapRenderer.js?v=150';
import { DeployScreen } from '../src/ui/DeployScreen.js?v=150';
import { WEAPON_DEFS } from '../src/assets/weapon-defs.js?v=150';

function makeMock2dCanvas(width = 760, height = 240) {
  const textCalls = [];
  const ctx = {
    canvas: null,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    fill() {},
    stroke() {},
    fillRect() {},
    strokeRect() {},
    setLineDash() {},
    fillText(str, x, y) {
      textCalls.push({ str: String(str), x, y });
    }
  };
  const canvas = {
    width,
    height,
    isConnected: true,
    style: { display: 'block' },
    offsetParent: {},
    _textCalls: textCalls,
    getContext() {
      ctx.canvas = canvas;
      return ctx;
    }
  };
  ctx.canvas = canvas;
  return canvas;
}

function makeMockElement(id, initialHidden = false) {
  const classes = new Set(initialHidden ? ['hidden'] : []);
  return {
    id,
    isConnected: true,
    textContent: '',
    style: { display: initialHidden ? 'none' : '' },
    offsetParent: initialHidden ? null : {},
    classList: {
      add(...names) {
        names.forEach((n) => classes.add(n));
      },
      remove(...names) {
        names.forEach((n) => classes.delete(n));
      },
      toggle(name, force) {
        if (typeof force === 'boolean') {
          if (force) classes.add(name);
          else classes.delete(name);
          return force;
        }
        if (classes.has(name)) {
          classes.delete(name);
          return false;
        }
        classes.add(name);
        return true;
      },
      contains(name) {
        return classes.has(name);
      }
    }
  };
}

function createSimpleMockWorld() {
  return {
    era: 'modern',
    voxels: new Map(),
    key: (x, y, z) => `${x},${y},${z}`,
    hasVoxel: () => false,
    getVoxel: () => null,
    worldToGrid: (wx, wy, wz) => ({
      gx: Math.round(wx / 1.25),
      gy: Math.floor(wy / 1.25),
      gz: Math.round(wz / 1.25)
    }),
    getGroundHeightAt: () => 0,
    findSafeSpawnPoint: (x, z) => new THREE.Vector3(x, 0, z),
    findSafeVehicleSpawnPoint: (x, z) => new THREE.Vector3(x, 0, z),
    pushOutOfBuildingFootprint: (x, z) => ({ x, z }),
    isInsideBuildingOrContainer: () => false,
    raycastVoxel: () => null,
    spawnDebris() {},
    spawnExplosionVisual() {},
    projectiles: [],
    buildings: [{ id: 0, minWx: -12, maxWx: 12, minWz: -10, maxWz: 10, centerWx: 0, centerWz: 0, floors: 14 }],
    spawns: {
      US_BASE: new THREE.Vector3(-1520, 0, 0),
      RU_BASE: new THREE.Vector3(1520, 0, 0)
    },
    flags: [
      { id: 'A', pos: new THREE.Vector3(-560, 0, -90), owner: 'US', radius: 34, contested: false, captureProgress: 100 },
      { id: 'B', pos: new THREE.Vector3(-280, 0, 85), owner: 'US', radius: 34, contested: false, captureProgress: 100 },
      { id: 'C', pos: new THREE.Vector3(0, 0, 0), owner: 'NEUTRAL', radius: 36, contested: true, captureProgress: 0 },
      { id: 'D', pos: new THREE.Vector3(280, 0, -85), owner: 'RU', radius: 34, contested: false, captureProgress: -100 },
      { id: 'E', pos: new THREE.Vector3(560, 0, 90), owner: 'RU', radius: 34, contested: false, captureProgress: -100 }
    ]
  };
}

test('v140: [M] Squad Navigation Guide & Tactical Map renders YOU, ★ SL, Squad Group & 🎯 GO HERE Waypoint', () => {
  const scene = new THREE.Scene();
  const world = createSimpleMockWorld();
  const botMgr = new BotManager(scene, world);
  botMgr.initBots(36, null);

  // Place US ALPHA Squad Leader & squadmates near (-180, 0, 12) advancing toward Flag C (0, 0, 0)
  const usAlpha = botMgr.bots.filter((b) => b.team === 'US' && b.squad === 'ALPHA');
  const sl = usAlpha.find((b) => b.isSquadLeader);
  assert.ok(sl, 'ALPHA Squad Leader must exist');
  usAlpha.forEach((b, idx) => {
    b.targetFlagIndex = 2; // Flag C
    b.pos.set(-180 - idx * 4, 0, 12 + idx * 2);
  });

  // Player is lost back at US HQ (-1500, 0, 0)
  const player = {
    name: 'YOU (PLAYER)',
    team: 'US',
    squad: 'ALPHA',
    role: 'recon',
    commandRank: 'MEMBER',
    hp: 100,
    dead: false,
    downed: false,
    pos: new THREE.Vector3(-1500, 0, 0),
    yaw: 0
  };

  const cmdModalEl = makeMockElement('command-modal', false);
  const minimapCanvas = makeMock2dCanvas(180, 180);
  const tacCanvas = makeMock2dCanvas(760, 240);
  const uiCtx = Object.assign({}, CommandPanel, MinimapRenderer, {
    world,
    player,
    botManager: botMgr,
    vehicleManager: { vehicles: [] },
    damageIndicators: [],
    minimapCanvas,
    el(id) {
      return id === 'command-modal' ? cmdModalEl : null;
    }
  });

  const nav = uiCtx.computeSquadNavigationGuide();
  assert.equal(nav.playerSectorLabel, 'US MAIN BASE HQ');
  assert.ok(nav.squadLeader, 'Must locate Squad Leader');
  assert.equal(nav.squadLeader.name, sl.name);
  assert.ok(nav.squadLeader.distM > 1250, 'Distance from HQ to Squad Leader should be >1,250m');
  assert.equal(nav.squadLeader.dirStr, 'E', 'Squad Leader East of US HQ must read bearing E');
  assert.ok(nav.squadCentroid && nav.squadCentroid.aliveCount === usAlpha.length);
  assert.ok(nav.targetWaypoint && nav.targetWaypoint.flagId === 'C');
  assert.match(nav.targetWaypoint.label, /OBJ C/i);

  uiCtx.drawCommandTacticalMap(tacCanvas);
  const renderedLabels = tacCanvas._textCalls.map((c) => c.str).join(' | ');
  assert.match(renderedLabels, /📍 YOU/, 'Tactical map must label 📍 YOU');
  assert.match(renderedLabels, /★ SL/, 'Tactical map must label ★ SL (Squad Leader)');
  assert.match(renderedLabels, /🎯 GO HERE/, 'Tactical map must label 🎯 GO HERE on squad target');
  assert.match(renderedLabels, /ALPHA/, 'Tactical map must label player squad group centroid');

  uiCtx.drawMinimap();
  const mmLabels = minimapCanvas._textCalls.map((c) => c.str).join(' | ');
  assert.match(mmLabels, /SL/, 'HUD minimap must clamp off-screen SL indicator onto rim');
});

test('v140: Non-Destructive Class Screen, Back-to-Game [ESC] & Deploy-New-Round vs Respawn-Into-Existing-Round', () => {
  const deployScreenEl = makeMockElement('deploy-screen', false);
  const victoryScreenEl = makeMockElement('victory-screen', true);
  const scoreboardEl = makeMockElement('scoreboard', true);
  const hudEl = makeMockElement('hud', true);
  const scopeOverlayEl = makeMockElement('scope-overlay', true);
  const vehicleOverlayEl = makeMockElement('vehicle-overlay', true);
  const downedOverlayEl = makeMockElement('downed-overlay', true);
  const deployBtn = makeMockElement('deploy-btn', false);
  const deployTopBtn = makeMockElement('deploy-top-btn', false);
  const resumeBtn = makeMockElement('deploy-resume-btn', true);
  const hdrResumeBtn = makeMockElement('deploy-header-resume-btn', true);
  const newRoundBtn = makeMockElement('deploy-new-round-btn', true);
  const statusPill = makeMockElement('deploy-round-status-pill', false);

  const elMap = new Map([
    ['deploy-screen', deployScreenEl],
    ['victory-screen', victoryScreenEl],
    ['scoreboard', scoreboardEl],
    ['hud', hudEl],
    ['scope-overlay', scopeOverlayEl],
    ['vehicle-overlay', vehicleOverlayEl],
    ['downed-overlay', downedOverlayEl],
    ['deploy-btn', deployBtn],
    ['deploy-top-btn', deployTopBtn],
    ['deploy-resume-btn', resumeBtn],
    ['deploy-header-resume-btn', hdrResumeBtn],
    ['deploy-new-round-btn', newRoundBtn],
    ['deploy-round-status-pill', statusPill]
  ]);

  const player = {
    dead: true,
    downed: false,
    _hasDeployedInRound: false,
    hp: 100,
    pos: new THREE.Vector3(15, 75, -8)
  };

  const uiMock = Object.assign({}, DeployScreen, {
    player,
    deployScreenEl,
    victoryScreenEl,
    scoreboardEl,
    hudEl,
    scopeOverlayEl,
    vehicleOverlayEl,
    downedOverlayEl,
    lastTicketsUS: 764,
    lastTicketsRU: 741,
    lastMatchTime: 785,
    el: (id) => elMap.get(id) || null,
    closeMainMenu() {},
    drawDeployMap() {}
  });

  // 1) Initial Fresh Round before first deploy
  uiMock.showDeployScreen();
  assert.equal(uiMock.canResumeActiveBattle(), false);
  assert.match(deployBtn.textContent, /DEPLOY TO NEW ROUND/);
  assert.equal(resumeBtn.classList.contains('hidden'), true);
  assert.equal(newRoundBtn.classList.contains('hidden'), true);

  // 2) Active Mid-Round while player is ALIVE on a Downtown skyscraper roof -> opens Class Screen via [Shift+M]
  player.dead = false;
  player._hasDeployedInRound = true;
  deployScreenEl.classList.add('hidden');
  hudEl.classList.remove('hidden');

  uiMock.openDeployScreenNonDestructive();
  assert.equal(player.dead, false, 'Opening Class Screen must NOT kill the live player');
  assert.equal(player.pos.y, 75, 'Player rooftop position must remain untouched');
  assert.equal(uiMock.canResumeActiveBattle(), true);
  assert.equal(resumeBtn.classList.contains('hidden'), false, 'Back to Game button must be visible');
  assert.equal(newRoundBtn.classList.contains('hidden'), false, 'Deploy to New Round button must be visible');
  assert.match(deployBtn.textContent, /RESPAWN INTO EXISTING ROUND/);
  assert.match(statusPill.textContent, /EXISTING ROUND LIVE/);

  // Clicking "Back to Game" returns immediately to live HUD without respawning or resetting
  const resumed = uiMock.resumeActiveBattle();
  assert.equal(resumed, true);
  assert.equal(deployScreenEl.classList.contains('hidden'), true);
  assert.equal(hudEl.classList.contains('hidden'), false);
  assert.equal(player.pos.y, 75);

  // 3) Mid-Round after dying in combat -> Respawn into Existing Round vs Deploy to New Round
  player.dead = true;
  uiMock.showDeployScreen();
  assert.equal(uiMock.canResumeActiveBattle(), false);
  assert.equal(resumeBtn.classList.contains('hidden'), true);
  assert.equal(newRoundBtn.classList.contains('hidden'), false);
  assert.match(deployBtn.textContent, /RESPAWN INTO EXISTING ROUND/);
});

test('v140: Anti-Materiel Rifle Car Destruction Detonates Lethal Fuel/Ammo Blast Against Nearby & Riding Infantry', () => {
  assert.ok(WEAPON_DEFS.ntw20.explosiveSplash.radius >= 2.0);
  assert.ok(WEAPON_DEFS.ntw20.explosiveSplash.damage >= 65);

  const scene = new THREE.Scene();
  const world = createSimpleMockWorld();
  const botMgr = new BotManager(scene, world);
  botMgr.initBots(25, null);
  const vehMgr = new VehicleManager(scene, world);
  vehMgr.botManager = botMgr;

  const ruCar = vehMgr.vehicles.find((v) => v.team === 'RU' && v.type === 'humvee');
  assert.ok(ruCar, 'RU Humvee car must exist');
  ruCar.pos.set(120, 0, 20);
  ruCar.hp = 80;

  // Position 3 RU enemy soldiers: 1 passenger inside, 1 standing 2.8m beside the car, 1 standing 8.2m away, and 1 safe 45m away
  const ruBots = botMgr.bots.filter((b) => b.team === 'RU' && !b.drivingVehicle);
  const paxBot = ruBots[0];
  const closeBot = ruBots[1];
  const midBot = ruBots[2];
  const farBot = ruBots[3];

  paxBot.ridingVehicle = ruCar;
  ruCar.aiPassengers = [paxBot];
  closeBot.pos.set(122.8, 0, 20);
  midBot.pos.set(128.2, 0, 20);
  farBot.pos.set(175, 0, 20);

  const player = {
    name: 'YOU (PLAYER)',
    team: 'US',
    role: 'recon',
    hp: 100,
    kills: 0,
    dead: false,
    downed: false,
    friendlyFireEnabled: false,
    pos: new THREE.Vector3(-220, 65, 20),
    registerKill() {
      return {};
    }
  };
  botMgr.player = player;
  vehMgr.lastPlayer = player;

  const killFeed = [];
  const destroyed = vehMgr.damageVehicle(
    ruCar,
    260,
    player.name,
    'US',
    'BARRETT M82A1 .50 BMG',
    (killer, kTeam, victim, vTeam, weapon) => {
      killFeed.push({ killer, victim, weapon });
    },
    null,
    player.pos
  );

  assert.equal(destroyed, true, 'AMR shot must destroy the damaged RU Humvee');
  assert.ok(paxBot.dead || paxBot.downed, 'Passenger inside exploding car must be killed/incapacitated');
  assert.ok(closeBot.dead || closeBot.downed, 'Infantry 2.8m from exploding car must be killed by blast');
  assert.ok(midBot.hp < 100 || midBot.dead || midBot.downed, 'Infantry 8.2m away must take shrapnel blast damage');
  assert.equal(farBot.hp, 100, 'Infantry 55m away must be unharmed');
  assert.ok(player.kills >= 2, `Player must be credited for secondary vehicle blast kills (got ${player.kills})`);
  assert.ok(
    killFeed.some((k) => /VEHICLE EXPLOSION/i.test(k.weapon)),
    'Killfeed must log secondary VEHICLE EXPLOSION infantry kills'
  );
});
