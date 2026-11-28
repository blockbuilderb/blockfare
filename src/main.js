import * as THREE from '../vendor/three.module.js';
import { VoxelWorld } from './world.js?v=148';
import { VehicleManager } from './vehicles.js?v=148';
import { BotManager } from './bots.js?v=148';
import { PlayerController } from './player.js?v=148';
import { NetworkManager } from './network.js?v=148';
import { UIManager } from './ui.js?v=148';
import { TelemetryLogger } from './telemetry.js?v=148';
import { sound } from './audio.js?v=148';
import { CAMERA, LIGHTING, MATCH, ECONOMY, WEATHER, SKY_FOG_COLOR } from './config.js?v=148';
import { events, makeEventBridge } from './events.js?v=148';
import { GameStateMachineRegistry } from './core/StateMachines.js?v=148';

class BattleBitGame {
  constructor() {
    this.container = document.getElementById('game-container');

    // Scene, Atmospheric Fog & Sky
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SKY_FOG_COLOR);
    this.scene.fog = new THREE.FogExp2(SKY_FOG_COLOR, WEATHER.FOG_DENSITY_BASE);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      CAMERA.FOV,
      window.innerWidth / window.innerHeight,
      CAMERA.NEAR,
      CAMERA.FAR
    );
    this.scene.add(this.camera);

    // Renderer (auto-caps DPR at 1.35 on mobile coarse-pointer devices to sustain 60 FPS without thermal throttling)
    const isCoarseMobileBoot = Boolean(
      (navigator.maxTouchPoints || 0) > 0 &&
        (window.matchMedia?.('(pointer: coarse)')?.matches || window.innerWidth <= 1024)
    );
    this.isMobileDevice = isCoarseMobileBoot;
    this.renderer = new THREE.WebGLRenderer({
      antialias: !isCoarseMobileBoot,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, isCoarseMobileBoot ? 1.35 : CAMERA.PIXEL_RATIO_CAP)
    );
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.container.appendChild(this.renderer.domElement);

    this.setupLighting();
    this._coreSceneChildren = new Set(this.scene.children);

    // Squad-Aligned AAS / Conquest Ticket Economy (Crew + Equipment Replacement Costs):
    // - 800 Starting Tickets per side, ZERO passive ticket printing (tickets only rise on Flag Captures!)
    // - Infantry Give-Up/Respawn: -1 (0 if Revived by Medic/Squadmate)
    // - Vehicle & Crew Losses (Counted Separately): Car -8 ($350), IFV/AA -16 ($800), Tank -24 ($1,300), Plane -30 ($1,500), B-2 -45 ($2,500)
    // - Flag Capture Swing: Neutral Flag +20; Enemy Flag +30 to Attacker & -10 to Defender (40-ticket swing!)
    // - Territory Bleed: Enemy holding 3/5 flags = -6/min (-0.10/s); 4/5 flags = -15/min (-0.25/s); 5/5 flags = -60/min (-1.00/s MERCY BLEED!)
    this.ticketEconomy = {
      START_TICKETS: 800,
      SOLDIER_RESPAWN_COST: 1,
      CAR_RESPAWN_COST: 8,
      APC_RESPAWN_COST: 16,
      TANK_RESPAWN_COST: 24,
      PLANE_RESPAWN_COST: 30,
      B2_RESPAWN_COST: 45,
      NEUTRAL_CAPTURE_GRANT: 20,
      ENEMY_CAPTURE_GRANT: 30,
      FLAG_LOST_PENALTY: 10,
      FLAG_CAPTURE_GRANT: 30,
      FLAG_PASSIVE_RATE: 0,
      BLEED_3_FLAGS_PER_MIN: 6,
      BLEED_4_FLAGS_PER_MIN: 15,
      MERCY_BLEED_5_FLAGS_PER_MIN: 60
    };
    this.ticketsUS = this.ticketEconomy.START_TICKETS;
    this.ticketsRU = this.ticketEconomy.START_TICKETS;
    this.ticketStats = {
      US: { gainedCapture: 0, gainedPassive: 0, lostFlags: 0, lostBleed: 0, spentSoldiers: 0, spentCars: 0, spentArmor: 0, spentPlanes: 0 },
      RU: { gainedCapture: 0, gainedPassive: 0, lostFlags: 0, lostBleed: 0, spentSoldiers: 0, spentCars: 0, spentArmor: 0, spentPlanes: 0 }
    };
    this.bleedPopupTimer = MATCH.BLEED_POPUP_INTERVAL;
    this.matchTimeRemaining = MATCH.DURATION;
    this.matchEnded = false;
    this.roundEpoch = 1;
    this._matchResetGraceUntil = 0;
    this.orbitAngle = 0;
    this._allUnits = [];

    // Core Subsystems + Live Telemetry Logger
    const initParams = new URLSearchParams(window.location.search);
    const initialEra = initParams.get('era') || initParams.get('map') || 'modern';
    const urlModeUpper = (initParams.get('mode') || '').trim().toUpperCase();
    const isInitialMp =
      urlModeUpper === 'MULTIPLAYER' ||
      urlModeUpper === 'MP' ||
      urlModeUpper === 'COOP' ||
      Boolean((initParams.get('room') || initParams.get('r') || '').trim());
    const urlBotsUpper = (initParams.get('bots') || '').trim().toUpperCase();
    const initialBotsPerSide =
      urlBotsUpper === 'SQUAD_AI' || urlBotsUpper === '32'
        ? 25
        : urlBotsUpper === 'TACTICAL_AI' || urlBotsUpper === '80'
        ? 40
        : urlBotsUpper === 'LARGE_AI' || urlBotsUpper === '160'
        ? 80
        : urlBotsUpper === 'FULL_AI' || urlBotsUpper === 'MASSIVE_AI' || urlBotsUpper === '250'
        ? 125
        : isInitialMp
        ? 125
        : isCoarseMobileBoot
        ? 75
        : 250;
    this.syncMatchTicketsForArmyScale(initialBotsPerSide, true);
    this.telemetry = new TelemetryLogger(this);
    this.world = new VoxelWorld(this.scene, initialEra);
    this.activeEra = this.world.era || 'modern';
    this.vehicleManager = new VehicleManager(this.scene, this.world);
    this.botManager = new BotManager(this.scene, this.world);
    this.vehicleManager.botManager = this.botManager;
    // Default Singleplayer 500-Player Scale: 1 Human Player + 499 AI Soldiers (249 US AI + 1 Player vs 250 RU AI)
    this.botManager.initBots(initialBotsPerSide, isInitialMp ? null : 'US');

    this.player = new PlayerController(
      this.camera,
      this.scene,
      this.world,
      this.botManager,
      this.vehicleManager
    );
    this.network = new NetworkManager(this.scene, this.world, this.player, this.botManager, {
      gameMode: isInitialMp ? 'MULTIPLAYER' : 'SINGLEPLAYER'
    });
    this.network.gameRef = this;
    this.ui = new UIManager(
      this.world,
      this.player,
      this.botManager,
      this.vehicleManager,
      this.network
    );
    this.ui.telemetry = this.telemetry;
    this.ui.ticketStats = this.ticketStats;
    this.player.setB2SpiritColors?.(
      this.player.b2SpiritColor,
      this.player.b2SpiritAccentColor,
      this.player.b2SpiritPresetId
    );
    this.ui.syncEraUI?.(this.activeEra);
    this.ui.renderDeployB2CustomizerBar?.();
    this.stateMachines = new GameStateMachineRegistry(this);
    this.getStateSnapshot = () => this.stateMachines.getSnapshot();

    window.selectGameEra = (era, closeMainMenu = true) => this.switchEra(era, closeMainMenu);

    this.wireCallbacks();
    this.setupDemoScenarioIfRequested();

    if (initParams.get('era') || initParams.get('map') || initParams.get('demo')) {
      this.ui.closeMainMenu?.();
    }

    if (window._pendingDeployClick) {
      window._pendingDeployClick = false;
      this.ui.triggerDeploy();
    }

    window.addEventListener('resize', () => this.onResize());
    // Default to smooth VSync requestAnimationFrame pacing to prevent WebGL command-queue saturation & stutter;
    // Uncapped MessageChannel mode remains opt-in via Settings / localStorage ('bb_uncapped_fps' === 'true').
    this.uncappedFps = false;
    try {
      const savedUncapped = localStorage.getItem('bb_uncapped_fps');
      if (savedUncapped === 'true') this.uncappedFps = true;
    } catch (_) {}
    this._framePending = false;
    if (typeof MessageChannel !== 'undefined') {
      this._fpsChannel = new MessageChannel();
      this._fpsChannel.port1.onmessage = () => {
        this._framePending = false;
        this.loop();
      };
    }
    this.lastTime = performance.now();
    this.watchdog = {
      frameCount: 0,
      stageMs: { world: 0, vehicles: 0, player: 0, bots: 0, network: 0, audio: 0, ui: 0, render: 0, total: 0 },
      peakStageMs: { world: 0, vehicles: 0, player: 0, bots: 0, network: 0, audio: 0, ui: 0, render: 0, total: 0 },
      slowestStage: 'none',
      slowestMs: 0,
      maxSpikeMs: 0,
      lastSpike: null,
      recentSpikes: [],
      recoveredErrors: 0,
      heartbeatRestarts: 0,
      lastError: null,
      lastToastAtMs: 0
    };
    window.getWatchdogReport = () => ({
      frameCount: this.watchdog.frameCount,
      msSinceLastFrame: Math.round((performance.now() - this.lastTime) * 10) / 10,
      stageMs: { ...this.watchdog.stageMs },
      peakStageMs: { ...this.watchdog.peakStageMs },
      maxSpikeMs: this.watchdog.maxSpikeMs,
      lastSpike: this.watchdog.lastSpike,
      recentSpikes: [...this.watchdog.recentSpikes],
      recoveredErrors: this.watchdog.recoveredErrors,
      heartbeatRestarts: this.watchdog.heartbeatRestarts,
      lastError: this.watchdog.lastError
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.lastTime = performance.now();
        if (!this._framePending) this.scheduleNextFrame();
      }
    });
    this._watchdogTimerId = setInterval(() => {
      if (document.hidden) return;
      const idleMs = performance.now() - this.lastTime;
      if (idleMs > 900) {
        this.watchdog.heartbeatRestarts++;
        this._framePending = false;
        this.lastTime = performance.now();
        console.warn(`[Blockfare Watchdog] Frame loop stalled for ${Math.round(idleMs)}ms — restarting heartbeat!`);
        this.scheduleNextFrame();
      }
    }, 750);
    this.scheduleNextFrame();
  }

  _runTimedStage(stageName, fn) {
    const t0 = performance.now();
    try {
      fn();
    } catch (err) {
      this.watchdog.recoveredErrors++;
      const msg = err?.message || String(err);
      if (this.watchdog.lastError !== `${stageName}:${msg}`) {
        this.watchdog.lastError = `${stageName}:${msg}`;
        console.error(`[Blockfare Watchdog] Recovered error in '${stageName}':`, err);
        this.telemetry?.logEvent?.('WATCHDOG_RECOVERED_ERROR', { stage: stageName, error: msg });
      }
    }
    const elapsed = performance.now() - t0;
    this.watchdog.stageMs[stageName] = Math.round(elapsed * 100) / 100;
    if (elapsed > (this.watchdog.peakStageMs[stageName] || 0)) {
      this.watchdog.peakStageMs[stageName] = Math.round(elapsed * 100) / 100;
    }
    return elapsed;
  }

  syncMatchTicketsForArmyScale(countPerSide = 250, resetCurrent = false) {
    const targetStart = countPerSide >= 200 ? 1200 : 800;
    const prevStart = this.ticketEconomy.START_TICKETS;
    this.ticketEconomy.START_TICKETS = targetStart;
    if (resetCurrent || (this.ticketsUS === prevStart && this.ticketsRU === prevStart)) {
      this.ticketsUS = targetStart;
      this.ticketsRU = targetStart;
    }
  }

  setUncappedFps(enabled) {
    this.uncappedFps = Boolean(enabled);
    try {
      localStorage.setItem('bb_uncapped_fps', this.uncappedFps ? 'true' : 'false');
    } catch (_) {}
    return this.uncappedFps;
  }

  toggleUncappedFps() {
    return this.setUncappedFps(!this.uncappedFps);
  }

  scheduleNextFrame() {
    if (this._framePending) return;
    this._framePending = true;
    if (this.uncappedFps && this._fpsChannel && !document.hidden) {
      this._fpsChannel.port2.postMessage(0);
    } else {
      requestAnimationFrame(() => {
        this._framePending = false;
        this.loop();
      });
    }
  }

  switchEra(eraId = 'modern', closeMainMenu = true) {
    const normalized = String(eraId || 'modern').toLowerCase();
    const targetEra =
      normalized.includes('medieval')
        ? 'medieval'
        : normalized.includes('jurassic') || normalized.includes('dino')
        ? 'jurassic'
        : 'modern';

    if (this.world && this.world.era === targetEra) {
      this.activeEra = targetEra;
      this.ui?.syncEraUI?.(targetEra);
      if (closeMainMenu) {
        this.ui?.closeMainMenu?.();
      }
      return this.world;
    }

    const prevBotsPerTeam =
      (this.botManager && this.botManager.currentBotsPerTeam) || 250;
    const prevPlayerSlotTeam =
      this.botManager && this.botManager.playerSlotTeam
        ? this.botManager.playerSlotTeam
        : !this.network || !this.network.isMultiplayer()
        ? this.player?.team || 'US'
        : null;

    if (this.player) {
      this.player._hasDeployedInRound = false;
      if (typeof this.player.clearActiveVehicleOnReset === 'function') {
        this.player.clearActiveVehicleOnReset('era-switch');
      } else {
        if (this.player.activeVehicle) {
          this.player.activeVehicle.driver = null;
          this.player.activeVehicle = null;
        }
        this.player.sensorMode = 'OFF';
        this.player.nvgActive = false;
      }
      this.player.dead = true;
      this.player.downed = false;
      this.player.thirdPersonSoldierMesh = null;
      this.player.targetRingMesh = null;
      this.player.parachuteMesh = null;
      this.player.uavDroneMesh = null;
      this.player.uavSweepRingMesh = null;
      this.player.rallyPoint = null;
      this.player.insertionBeacon = null;
      this.player.plantedC4 = [];
      this.player.activeBullets = [];
    }

    if (typeof this.world?.dispose === 'function') {
      this.world.dispose();
    }
    if (typeof this.vehicleManager?.dispose === 'function') {
      this.vehicleManager.dispose();
    }
    if (typeof this.botManager?.dispose === 'function') {
      this.botManager.dispose();
    }

    const disposeSubtree = (root) => {
      if (!root || typeof root.traverse !== 'function') return;
      root.traverse((obj) => {
        if (obj.geometry && !obj.geometry.userData?.shared) {
          obj.geometry.dispose();
        }
        const mat = obj.material;
        if (mat) {
          if (Array.isArray(mat)) {
            for (let mIdx = 0; mIdx < mat.length; mIdx++) {
              const m = mat[mIdx];
              if (m && !m.userData?.shared) m.dispose();
            }
          } else if (!mat.userData?.shared) {
            mat.dispose();
          }
        }
      });
    };

    // Remove all previous world/vehicle/bot meshes from the scene while keeping lighting & camera
    for (let i = this.scene.children.length - 1; i >= 0; i--) {
      const child = this.scene.children[i];
      if (!this._coreSceneChildren || !this._coreSceneChildren.has(child)) {
        disposeSubtree(child);
        this.scene.remove(child);
      }
    }

    this.ticketsUS = this.ticketEconomy.START_TICKETS;
    this.ticketsRU = this.ticketEconomy.START_TICKETS;
    this.matchTimeRemaining = MATCH.DURATION;
    this.matchEnded = false;

    this.world = new VoxelWorld(this.scene, targetEra);
    this.activeEra = this.world.era || targetEra;
    this.vehicleManager = new VehicleManager(this.scene, this.world);
    this.botManager = new BotManager(this.scene, this.world);
    this.vehicleManager.botManager = this.botManager;
    this.botManager.initBots(prevBotsPerTeam, prevPlayerSlotTeam);

    if (this.player) {
      this.player.world = this.world;
      this.player.vehicleManager = this.vehicleManager;
      this.player.botManager = this.botManager;
      if (this.activeEra === 'modern') {
        this.player.setB2SpiritColors?.(
          this.player.b2SpiritColor,
          this.player.b2SpiritAccentColor,
          this.player.b2SpiritPresetId
        );
      }
    }
    if (this.network) {
      this.network.world = this.world;
      this.network.botManager = this.botManager;
    }
    if (this.ui) {
      this.ui.world = this.world;
      this.ui.vehicleManager = this.vehicleManager;
      this.ui.botManager = this.botManager;
      this.ui.syncEraUI?.(this.activeEra);
      this.ui.showDeployScreen?.();
      if (closeMainMenu) {
        this.ui.closeMainMenu?.();
      }
      this.ui.addXpNotification?.(
        0,
        this.activeEra === 'medieval'
          ? '🏰 ERA SWITCHED: MEDIEVAL CASTLE SIEGE [BETA] (IRONKEEP CITADEL)'
          : this.activeEra === 'jurassic'
          ? '🦖 ERA SWITCHED: JURASSIC ISLAND [BETA] (ISLA CARNIVORA — HUMANS VS DINOSAURS)'
          : '✈️ ERA SWITCHED: MODERN COMBINED ARMS (FRUGIS RIVER VALLEY)'
      );
    }

    this.renderer.shadowMap.needsUpdate = true;
    return this.world;
  }

  setupDemoScenarioIfRequested() {
    const params = new URLSearchParams(window.location.search);
    const demo = params.get('demo');
    if (!demo) return;

    this.ui.triggerDeploy();
    this.player.deploy('US', 'engineer', new THREE.Vector3(-175, 0, -38));

    const usTank = this.vehicleManager.vehicles.find((v) => v.id === 'us_abrams_fwd_a');
    const ruTank = this.vehicleManager.vehicles.find((v) => v.id === 'ru_t90_fwd_a');

    if (demo === 'tank' && usTank && ruTank) {
      usTank.pos.set(-165, this.world.getGroundHeightAt(-165, -38), -38);
      usTank.yaw = -Math.PI / 2;
      ruTank.pos.set(-134, this.world.getGroundHeightAt(-134, -38), -38);
      ruTank.yaw = Math.PI / 2;
      ruTank.aiPatrol = false;

      this.player.activeVehicle = usTank;
      usTank.paidByPlayer = this.player;
      usTank.driver = this.player;
      this.player.thirdPersonVehicle = true;
      this.player.viewModelGroup.visible = false;
      this.player.yaw = -Math.PI / 2;
      this.player.pitch = -0.04;
      setTimeout(() => {
        if (this.player.activeVehicle) {
          this.player.isFiring = true;
          setTimeout(() => {
            this.player.isFiring = false;
          }, 180);
        }
      }, 350);
    } else if (demo === 'engineers' && ruTank) {
      this.player.pos.set(-172, this.world.getGroundHeightAt(-172, -38), -38);
      this.player.yaw = -Math.PI / 2;
      this.player.pitch = -0.02;
      this.player.switchSlot(2); // Equip RPG-7 in player hands too!

      ruTank.pos.set(-136, this.world.getGroundHeightAt(-136, -38), -38);
      ruTank.yaw = Math.PI / 2;
      ruTank.aiPatrol = false;

      const usEngs = this.botManager.bots.filter((b) => b.team === 'US' && b.role === 'ENGINEER');
      if (usEngs[0]) {
        usEngs[0].pos.set(-162, this.world.getGroundHeightAt(-162, -36), -36);
        usEngs[0].rpgCooldown = 0.25;
      }
      if (usEngs[1]) {
        usEngs[1].pos.set(-161, this.world.getGroundHeightAt(-161, -40.5), -40.5);
        usEngs[1].rpgCooldown = 0.45;
      }
    } else if (demo === 'drag_revive') {
      this.player.pos.set(-170, this.world.getGroundHeightAt(-170, -38), -38);
      this.player.yaw = -Math.PI / 2;
      this.player.pitch = -0.14;

      const usBots = this.botManager.bots.filter((b) => b.team === 'US');
      const downed1 = usBots.find((b) => b.role === 'ASSAULT') || usBots[0];
      const downed2 = usBots.find((b) => b !== downed1 && b.role !== 'MEDIC') || usBots[1];
      const medic = usBots.find((b) => b.role === 'MEDIC') || usBots[2];

      if (downed1) {
        downed1.downed = true;
        downed1.bleedOutTimer = 21.0;
        downed1.pos.set(-168.5, this.world.getGroundHeightAt(-168.5, -38) + 0.22, -38);
        this.player.draggedBot = downed1;
        this.player.reviveTargetBot = downed1;
        this.player.isDraggingAlly = true;
      }
      if (downed2 && medic) {
        downed2.downed = true;
        downed2.bleedOutTimer = 19.5;
        downed2.pos.set(-161, this.world.getGroundHeightAt(-161, -36.5) + 0.22, -36.5);
        medic.pos.set(-162.1, this.world.getGroundHeightAt(-162.1, -36.5), -36.5);
        medic.rescueTarget = downed2;
        downed2.rescuer = medic;
        medic.rescueState = 'DRAG';
        medic.dragGoalPos.set(-166, 0, -35);
      }
    } else if (demo === 'stats' || demo === 'victory') {
      // Seed realistic mid-battle / end-of-battle stats across all 5 Squads (ALPHA-ECHO) and Soldiers
      this.ticketsUS = demo === 'victory' ? 148 : 342;
      this.ticketsRU = demo === 'victory' ? 0 : 286;
      this.matchTimeRemaining = demo === 'victory' ? 312 : 685;
      this.world.flags[0].owner = 'US';
      this.world.flags[0].captureProgress = 100;
      this.world.flags[1].owner = 'US';
      this.world.flags[1].captureProgress = 100;
      this.world.flags[2].owner = 'US';
      this.world.flags[2].captureProgress = 85;
      this.world.flags[3].owner = 'RU';
      this.world.flags[3].captureProgress = -100;
      this.world.flags[4].owner = 'RU';
      this.world.flags[4].captureProgress = -100;

      this.player.kills = 14;
      this.player.deaths = 2;
      this.player.revives = 6;
      this.player.medicKills = 3;
      this.player.vehiclesDestroyed = 3;
      this.player.captures = 4;
      this.player.score = 3850;

      this.botManager.bots.forEach((b, i) => {
        const isUS = b.team === 'US';
        b.kills = Math.max(1, ((i * 7 + (isUS ? 5 : 3)) % 13));
        b.deaths = Math.max(1, ((i * 5 + (isUS ? 2 : 4)) % 10));
        b.revives = b.role === 'MEDIC' ? 3 + (i % 7) : i % 3;
        b.medicKills = i % 4 === 0 ? 1 + (i % 3) : 0;
        b.vehiclesDestroyed = b.role === 'ENGINEER' ? 1 + (i % 3) : 0;
        b.captures = 1 + (i % 4);
        b.score =
          b.kills * 100 +
          b.revives * 200 +
          b.vehiclesDestroyed * 300 +
          b.captures * 200;
      });

      if (demo === 'stats') {
        this.ui.scoreboardEl.classList.remove('hidden');
        this.ui.renderScoreboard();
      } else if (demo === 'victory') {
        this.triggerMatchVictory('US');
      }
    } else if (demo === 'telemetry') {
      // Showcase US Base Motor Pool NPC vehicle boarding, Vehicle Hull Armor Protection,
      // 360° Directional Incoming Fire Indicators, and [F3] Live Telemetry Panel
      const hqTank = this.vehicleManager.vehicles.find((v) => v.id === 'us_abrams_hq');
      if (hqTank) {
        this.player.activeVehicle = hqTank;
        hqTank.driver = this.player;
        this.player.thirdPersonVehicle = true;
        this.player.viewModelGroup.visible = false;
        this.player.yaw = -Math.PI / 2;
        this.player.pitch = -0.06;
        this.vehicleManager.damageVehicle(
          hqTank,
          135,
          'Krechet',
          'RU',
          'RPG-7 HEAT',
          this.player.onKillEvent,
          null,
          new THREE.Vector3(-220, 2, -45)
        );
      }
      this.ui.registerDamageIndicator(
        18,
        new THREE.Vector3(-225, 2, 32),
        false,
        'AK-15 RIFLE FIRE',
        'Strelok'
      );
      if (this.ui.telemetryPanelEl) {
        this.ui.telemetryPanelEl.classList.remove('hidden');
        this.ui.updateTelemetryPanel();
      }
    } else if (demo === 'medic_contested') {
      // Showcase:
      // 1) RU Main Base CONTESTED (all RU defenders inside RU_BASE eliminated while Player is present -> RU Main Base Respawns LOCKED!)
      // 2) Smarter Tactical Medic Situation Assessment (US Medic VoxelMedic assesses threat, pops 3D smoke screen over casualty, crouches & shoots threat before rushing to drag/revive!)
      const bx = 286;
      const bz = -4;
      this.player.pos.set(bx, this.world.getGroundHeightAt(bx, bz), bz);
      this.player.yaw = Math.PI * 0.54; // Looking West-Northwest toward the Medic, casualty & distant threat
      this.player.pitch = -0.06;

      // Move all RU bots outside the 58m RU_BASE perimeter so RU_BASE has 0 defenders and is CONTESTED!
      const ruBots = this.botManager.bots.filter((b) => b.team === 'RU');
      ruBots.forEach((b, idx) => {
        const fx = 105 + (idx % 5) * 14;
        const fz = -75 + Math.floor(idx / 5) * 12;
        b.pos.set(fx, this.world.getGroundHeightAt(fx, fz), fz);
      });

      // Place one RU rifleman at x = 246 (64m from RU_BASE center 310, so outside the 58m base perimeter,
      // but 28m from our US Medic & downed soldier so the Medic detects & engages the threat first!)
      const threatBot = ruBots[0];
      if (threatBot) {
        threatBot.dead = false;
        threatBot.downed = false;
        threatBot.drivingVehicle = null;
        threatBot.mesh.visible = true;
        threatBot.hp = 100;
        threatBot.pos.set(248, this.world.getGroundHeightAt(248, -6), -6);
        threatBot.yaw = -Math.PI / 2;
      }

      // Place a downed US soldier at (272, -5.5) and a US Medic at (277, -2.5) assessing the situation!
      const usBots = this.botManager.bots.filter((b) => b.team === 'US');
      const casualty = usBots.find((b) => b.role === 'ASSAULT') || usBots[0];
      const medic = usBots.find((b) => b.role === 'MEDIC') || usBots[1];
      if (casualty && medic) {
        casualty.dead = false;
        casualty.downed = true;
        casualty.drivingVehicle = null;
        casualty.mesh.visible = true;
        casualty.bleedOutTimer = 21.5;
        casualty.pos.set(272, this.world.getGroundHeightAt(272, -5.5) + 0.22, -5.5);

        medic.dead = false;
        medic.downed = false;
        medic.drivingVehicle = null;
        medic.mesh.visible = true;
        medic.pos.set(276.5, this.world.getGroundHeightAt(276.5, -2.2), -2.2);
        medic.rescueTarget = casualty;
        casualty.rescuer = medic;
        medic.rescueState = 'ASSESS_THREAT';
        medic.assessTimer = 4.5;
        medic.smokePoppedForRescue = false;
        medic.assessedLogged = false;
        medic.shootCooldown = 0.05;
      }

      // Force an immediate contested base evaluation & open [F3] Telemetry panel
      this.botManager.updateContestedBases(this.player, this.player.onAwardXp);
      // Simulate a blocked RU main base respawn event for telemetry visibility
      this.botManager.pickSpawnPosition('RU', 'ALPHA', true);
      if (this.ui.telemetryPanelEl) {
        this.ui.telemetryPanelEl.classList.remove('hidden');
        this.ui.updateTelemetryPanel();
      }
    }
  }

  setupLighting() {
    this.hemiLight = new THREE.HemisphereLight(0xe2f3f5, 0x4b5d3b, LIGHTING.HEMI_INTENSITY);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff4e0, LIGHTING.SUN_INTENSITY);
    this.sunLight.position.set(LIGHTING.SUN_POSITION[0], LIGHTING.SUN_POSITION[1], LIGHTING.SUN_POSITION[2]);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = LIGHTING.SHADOW_MAP_SIZE;
    this.sunLight.shadow.mapSize.height = LIGHTING.SHADOW_MAP_SIZE;
    this.sunLight.shadow.camera.near = LIGHTING.SHADOW_NEAR;
    this.sunLight.shadow.camera.far = LIGHTING.SHADOW_FAR;
    const d = LIGHTING.SHADOW_EXTENT;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.scene.add(this.sunLight);
  }

  wireCallbacks() {
    // Clear any prior listeners from previous game instances while preserving telemetry's listener
    events.clear();
    if (this.telemetry) {
      this.telemetry._unsubscribeTelemetryEvent = events.on(
        'telemetry:event',
        (data, legacyPayload) => {
          if (data && typeof data === 'object' && typeof data.type === 'string') {
            this.telemetry.logEvent(data.type, data.payload || {});
          } else if (typeof data === 'string') {
            this.telemetry.logEvent(data, legacyPayload || {});
          }
        }
      );
    }

    // Backwards-compatible callback bridges on subsystem instances (delegate to events.emit without double-firing)
    this.ui.onAtmosphereChange = makeEventBridge('ui:atmosphere-change', (mode) => ({ mode }));
    this.ui.onPlayNextRound = makeEventBridge('ui:play-next-round', () => ({}));
    this.ui.onBeforeDeploy = makeEventBridge('ui:before-deploy', () => ({}));
    this.ui.onPlayerRespawn = makeEventBridge(
      'ui:player-respawn',
      (team, role, source) => ({ team, role, source })
    );

    this.player.onHitmarker = makeEventBridge('hitmarker:show', (type, label) => ({ type, label }));
    this.player.onHitMarker = this.player.onHitmarker;
    this.player.onDamageTaken = makeEventBridge(
      'player:damaged',
      (amount, sourcePos, inVehicle, weaponName, attackerName) => ({
        amount,
        sourcePos,
        inVehicle,
        weaponName,
        attackerName
      })
    );
    this.player.onAwardXp = makeEventBridge('xp:awarded', (amount, reason) => ({ amount, reason }));
    this.player.onCashChanged = makeEventBridge('cash:changed', (balance, delta, reason) => ({
      balance,
      delta,
      reason
    }));
    this.player.onKillEvent = makeEventBridge(
      'kill:event',
      (killer, kTeam, victim, vTeam, weapon, isHs) => ({
        killer,
        kTeam,
        victim,
        vTeam,
        weapon,
        isHs
      })
    );
    this.player.onKillStreakAnnouncement = makeEventBridge('killstreak:announced', (text) => ({
      text
    }));
    this.player.onFloatingDamage = makeEventBridge(
      'damage:floating',
      (worldPos, damage, isHeadshot) => ({ worldPos, damage, isHeadshot })
    );
    this.player.onCommoRoseOpen = makeEventBridge('commo:open', () => ({}));
    this.player.onCommoRoseClose = makeEventBridge('commo:close', () => ({}));
    this.player.onCommoCommand = makeEventBridge('commo:command', (cmdId, text, icon) => ({
      cmdId,
      text,
      icon
    }));
    this.player.onPlayerDied = makeEventBridge('player:died', (killerName, weaponName) => ({
      killerName,
      weaponName
    }));
    this.player.onExplosionDamage = makeEventBridge(
      'explosion:damage',
      (pos, radius, maxDamage, owner, brokenCount, customLabel) => ({
        pos,
        radius,
        maxDamage,
        owner,
        brokenCount,
        customLabel
      })
    );
    this.player.onWarCrimeCommitted = makeEventBridge(
      'warcrime:committed',
      (medicName, wasRescuing, totalCount) => ({
        medicName,
        wasRescuing,
        totalCount
      })
    );

    this.botManager.onBotComms = makeEventBridge(
      'bot:comms',
      (bot, text, channel, dist, category) => ({ bot, text, channel, dist, category })
    );
    this.botManager.onTelemetryEvent = makeEventBridge('telemetry:event', (type, payload) => ({
      type,
      payload
    }));
    this.world.onBuildingCollapsed = makeEventBridge(
      'building:collapsed',
      (centerPos, radius, collapsedVoxels) => ({ centerPos, radius, collapsedVoxels })
    );
    this.vehicleManager.onVehicleRespawn = makeEventBridge(
      'vehicle:respawn',
      (vehicle, cost, category, stage) => ({ vehicle, cost, category, stage })
    );
    this.network.onRemoteCommsMessage = makeEventBridge('network:remote-comms', (msg, rp) => ({
      msg,
      rp
    }));
    this.network.onPlayerJoinedRoom = makeEventBridge('network:player-joined', (msg) => ({ msg }));

    // Synchronous query/transport hooks
    this.network.vehicleManager = this.vehicleManager;
    this.player.onBroadcast = (payload) => this.network.send(payload);
    this.player.onGetRemoteMeshes = () => this.network.getRemoteMeshes();
    this.botManager.canTeamAffordRespawn = (team, cost) => this.canTeamAffordRespawn(team, cost);
    this.vehicleManager.canTeamAffordRespawn = (team, cost) => this.canTeamAffordRespawn(team, cost);

    // ─── EVENT BUS SUBSCRIPTIONS ──────────────────────────────────────────────

    events.on('ui:atmosphere-change', (data) => {
      const mode = data && data.mode !== undefined ? data.mode : data;
      this.world.setAtmosphereMode(mode, this.hemiLight, this.sunLight);
      this.renderer.shadowMap.needsUpdate = true;
    });

    events.on('ui:play-next-round', () => {
      this.resetMatch();
    });

    events.on('ui:before-deploy', () => {
      if (
        this.matchEnded ||
        this.ticketsUS <= 0 ||
        this.ticketsRU <= 0 ||
        this.matchTimeRemaining <= 0
      ) {
        this.resetMatch();
      }
    });

    events.on('ui:player-respawn', ({ team, role }) => {
      if (this.matchEnded) return;
      this.spendRespawnTickets(
        team,
        'SOLDIER',
        `${this.network.callsign || 'YOU'} (${String(role).toUpperCase()})`,
        this.ticketEconomy.SOLDIER_RESPAWN_COST
      );
    });

    events.on('hitmarker:show', (data, legacyLabel) => {
      const type = data && typeof data === 'object' ? data.type : data;
      const label = data && typeof data === 'object' ? data.label : legacyLabel;
      this.ui.showHitmarker(type, label);
    });

    events.on('player:damaged', (data) => {
      if (!data) return;
      this.ui.registerDamageIndicator(
        data.amount,
        data.sourcePos,
        Boolean(data.inVehicle),
        data.weaponName,
        data.attackerName
      );
    });

    events.on('player:killed', () => {
      // Player entered downed state; final death/deploy screen handled on 'player:died'
    });

    events.on('player:died', (data) => {
      events.emit('telemetry:event', {
        type: 'PLAYER_DIED',
        payload: {
          killer: data?.killerName || 'UNKNOWN',
          weapon: data?.weaponName || 'UNKNOWN',
          x: Math.round(this.player?.pos?.x || 0),
          y: Number((this.player?.pos?.y || 0).toFixed(2)),
          z: Math.round(this.player?.pos?.z || 0),
          wasInVehicle: this.player?.activeVehicle?.name || null
        }
      });
      // Tickets are deducted upon RESPAWN (-1 per soldier respawn), so if a Medic revives a downed soldier,
      // no ticket is lost!
      // When Optional Death Cam is ON (`deathCamPostTimer > 0`), `loop()` runs the 3.8s Over-The-Shoulder
      // Killer Replay first (skippable via [Space]/[Enter]/[Esc]) before opening the Deploy Screen.
      if (
        this.player.deathCamEnabled &&
        this.player.deathCamPostTimer > 0 &&
        this.player.lastDeathReport?.hasKillerOrigin
      ) {
        return;
      }
      setTimeout(() => {
        if (this.player.dead && !this.matchEnded && !(this.player.deathCamPostTimer > 0)) {
          this.ui.showDeployScreen();
        }
      }, 1600);
    });

    events.on('player:fired', (data) => {
      if (data && data.type === 'rpg' && this.telemetry && this.telemetry.counters) {
        this.telemetry.counters.rpgsFired++;
      }
    });

    events.on('player:reloaded', () => {});

    events.on('player:entered-vehicle', () => {});

    events.on('player:exited-vehicle', () => {});

    events.on('weapon:switched', () => {});

    events.on('xp:awarded', (data, legacyReason) => {
      const pts = data && typeof data === 'object' ? data.amount : data;
      const reason = data && typeof data === 'object' ? data.reason : legacyReason;
      this.player.score += pts;
      let cashGain = 0;
      if (pts > 0 && typeof this.player.addCash === 'function') {
        const up = String(reason || '').toUpperCase();
        const rw = ECONOMY.REWARDS || {};
        if (up.includes('DESTROYED') && (up.includes('B-2') || up.includes('PLANE') || up.includes('FIGHTER') || up.includes('GUNSHIP') || up.includes('WARTHOG') || up.includes('AIRCRAFT'))) {
          cashGain = rw.DESTROY_AIRCRAFT || 450;
        } else if (up.includes('DESTROYED') && (up.includes('TANK') || up.includes('ABRAMS') || up.includes('T-90'))) {
          cashGain = rw.DESTROY_TANK || 380;
        } else if (up.includes('DESTROYED') && (up.includes('IFV') || up.includes('APC') || up.includes('BTR') || up.includes('LAV') || up.includes('SPAAG') || up.includes('AA'))) {
          cashGain = rw.DESTROY_APC || 260;
        } else if (up.includes('DESTROYED') && (up.includes('HUMVEE') || up.includes('TIGR') || up.includes('BIKE') || up.includes('ATV') || up.includes('VEHICLE'))) {
          cashGain = rw.DESTROY_CAR || 150;
        } else if (up.includes('CAPTURED')) {
          cashGain = rw.FLAG_CAPTURE || 180;
        } else if (up.includes('NEUTRALIZED')) {
          cashGain = rw.FLAG_NEUTRALIZE || 90;
        } else if (up.includes('REVIVE')) {
          cashGain = rw.MEDIC_REVIVE || 85;
        } else if (up.includes('HEAL')) {
          cashGain = rw.MEDIC_HEAL || 35;
        } else if (up.includes('REPAIR')) {
          cashGain = rw.ENGINEER_REPAIR || 65;
        } else if (up.includes('ELIMINATED') || up.includes('KILL')) {
          cashGain = (rw.INFANTRY_KILL || 75) + (up.includes('HEADSHOT') ? rw.HEADSHOT_BONUS || 25 : 0);
        } else if (up.includes('RESUPPLY') || up.includes('STASH') || up.includes('BEACON') || up.includes('ASSIST')) {
          cashGain = rw.LOGISTICS_ASSIST || 45;
        } else {
          cashGain = Math.max(MATCH.CASH_MIN, Math.round(pts * MATCH.CASH_MULT));
        }
        this.player.addCash(cashGain, reason, false);
      }
      const displayReason =
        cashGain > 0
          ? `${reason} <span style="color:#f1c40f;font-weight:900;">(+⚡$${cashGain})</span>`
          : reason;
      this.ui.addXpNotification(pts, displayReason);
    });

    events.on('cash:changed', () => {
      if (this.ui && typeof this.ui.updateCashAndGunsmithHud === 'function') {
        this.ui.updateCashAndGunsmithHud();
      }
    });

    events.on('kill:event', (data) => {
      if (!data) return;
      const { killer, kTeam, victim, vTeam, weapon, isHs, _fromNetwork } = data;
      this.ui.addKillfeed(killer, kTeam, victim, vTeam, weapon, isHs);
      if (
        !_fromNetwork &&
        this.network?.isMultiplayer?.() &&
        (killer === this.player?.name || victim === this.player?.name)
      ) {
        this.network.send({
          type: 'kill_sync',
          killer,
          kTeam,
          victim,
          vTeam,
          weapon,
          isHs: Boolean(isHs)
        });
      }
      // Track faction kills (+1 kill, +$120 faction funds) and unlock B-2 Spirit Stealth Bomber at 25 kills!
      if (weapon !== 'REVIVED' && kTeam && kTeam !== vTeam && this.vehicleManager?.recordTeamKillAndCheckB2) {
        this.vehicleManager.recordTeamKillAndCheckB2(kTeam);
      }
      // If Commander UAV Datalink is active and a friendly unit eliminates a painted enemy, grant UAV Recon Assist!
      if (
        this.player.uavActive &&
        kTeam === this.player.team &&
        vTeam !== this.player.team &&
        weapon !== 'REVIVED'
      ) {
        this.player.uavAssists = (this.player.uavAssists || 0) + 1;
        this.player.score = (this.player.score || 0) + MATCH.UAV_RECON_ASSIST_PTS;
        this.player.addCash(MATCH.UAV_RECON_ASSIST_PTS, 'UAV RECON ASSIST');
        if (killer !== this.player.name && this.player.uavAssists % 2 === 1) {
          this.ui.addXpNotification(
            MATCH.UAV_RECON_ASSIST_PTS,
            `📡 UAV DATALINK ASSIST (${killer} -> ${victim}) <span style="color:#f1c40f;font-weight:900;">(+$${MATCH.UAV_RECON_ASSIST_PTS})</span>`
          );
        }
      }
    });

    events.on('killstreak:announced', (data) => {
      const text = data && typeof data === 'object' ? data.text : data;
      if (text) {
        this.ui.showKillStreakAnnouncement(text);
      }
    });

    events.on('damage:floating', (data) => {
      if (!data) return;
      this.ui.spawnFloatingDamage(data.worldPos, data.damage, data.isHeadshot);
    });

    events.on('commo:open', () => {
      this.ui.openCommoRose();
    });

    events.on('commo:close', () => {
      this.ui.closeCommoRose();
    });

    events.on('commo:command', (data) => {
      if (!data) return;
      const { cmdId, text, icon } = data;
      this.ui.showCommoCallout(cmdId, text, icon);
      this.ui.addTacticalCommsMessage(
        this.network.callsign || 'YOU (LEAD)',
        this.player.role,
        'COMMAND',
        0,
        text,
        true
      );
      if (cmdId !== 'ping') {
        events.emit('xp:awarded', { amount: 15, reason: `SQUAD COMMS: ${text}` });
      }
      // Broadcast over WebSocket / BroadcastChannel / HTTP Relay for Multiplayer teammates
      this.network.send({
        type: 'comms_message',
        name: this.network.callsign || `PLAYER_${this.network.clientId.slice(2, 5).toUpperCase()}`,
        team: this.player.team,
        squad: this.player.squad || 'ALPHA',
        role: this.player.role.toUpperCase(),
        pos: this.player.pos.toArray(),
        cmdId,
        text
      });
      // Friendly AI reaction + verbal reply + order execution
      setTimeout(() => {
        if (!this.player.dead) {
          this.botManager.handlePlayerCommsOrder(this.player, cmdId, text);
        }
      }, 380);
      if (cmdId === 'need_medic' && (this.player.hp < 100 || this.player.bleeding)) {
        const nearMedic = this.botManager.bots.find(
          (b) =>
            !b.dead &&
            !b.downed &&
            b.team === this.player.team &&
            b.role === 'MEDIC' &&
            b.pos.distanceTo(this.player.pos) < 35
        );
        if (nearMedic) {
          this.player.hp = Math.min(this.player.maxHp, this.player.hp + 45);
          this.player.bleeding = false;
          this.player.bandages = Math.min(3, this.player.bandages + 1);
          this.ui.addXpNotification(0, `${nearMedic.name} [MEDIC]: PATCHING YOU UP!`);
        }
      } else if (cmdId === 'need_ammo') {
        const nearSup = this.botManager.bots.find(
          (b) =>
            !b.dead &&
            !b.downed &&
            b.team === this.player.team &&
            b.role === 'SUPPORT' &&
            b.pos.distanceTo(this.player.pos) < 35
        );
        if (nearSup) {
          this.player.grenades = Math.min(2, this.player.grenades + 1);
          for (const slot of this.player.slots) {
            if (slot.mags && slot.mags.length < 6 && slot.def.clipSize > 1) {
              slot.mags.push(slot.def.clipSize);
            }
          }
          this.ui.addXpNotification(0, `${nearSup.name} [SUPPORT]: AMMO RESUPPLIED!`);
        }
      }
      events.emit('telemetry:event', {
        type: 'COMMO_ROSE',
        payload: { command: cmdId, text }
      });
    });

    // Single-Player NPC Teammate Proximity & Squad Radio Comms
    events.on('bot:comms', (data) => {
      if (!data || !data.bot) return;
      this.ui.addTacticalCommsMessage(
        data.bot.name,
        data.bot.role,
        data.channel,
        data.dist,
        data.text,
        false
      );
    });

    events.on('bot:downed', () => {});

    events.on('bot:killed', () => {});

    events.on('bot:beyond-rescue', ({ bot }) => {
      if (!bot || bot._alreadyBledTicket || this.matchEnded) return;
      bot._alreadyBledTicket = true;
      this.spendRespawnTickets(bot.team, 'SOLDIER', `${bot.name} (KIA)`, 1);
    });

    // Multiplayer Human Teammate Proximity & Squad Radio Comms
    events.on('network:remote-comms', ({ msg, rp }) => {
      if (!msg || msg.team !== this.player.team) return;
      const rPos = rp ? rp.pos : msg.pos ? new THREE.Vector3().fromArray(msg.pos) : this.player.pos;
      const distM = Math.round(rPos.distanceTo(this.player.pos));
      const inSquad = msg.squad === this.player.squad;
      if (distM <= 48 || inSquad) {
        const channel = distM <= 45 ? 'LOCAL' : 'SQUAD';
        this.ui.addTacticalCommsMessage(
          msg.name || 'ALLY PLAYER',
          msg.role || 'SOLDIER',
          channel,
          distM,
          msg.text,
          false
        );
      }
    });

    events.on('network:player-joined', ({ msg }) => {
      if (!msg) return;
      const joinName = msg.name || 'ALLY SOLDIER';
      const joinTeam = msg.team || 'US';
      this.ui.addXpNotification(0, `🌐 ${joinName} [${joinTeam}] JOINED ROOM ${this.network.roomCode}!`);
      this.ui.addTacticalCommsMessage(
        joinName,
        msg.role || 'SOLDIER',
        'SQUAD',
        0,
        `Joined room ${this.network.roomCode} — ready to deploy!`,
        false
      );
      this.ui.updateMultiplayerLobbyUI();
    });

    events.on('flag:contested', () => {});

    events.on('flag:captured', ({ flag, newOwner, prevOwner = 'NEUTRAL' }) => {
      if (!flag || !newOwner) return;
      if (this.vehicleManager?.addTeamFunds) {
        this.vehicleManager.addTeamFunds(newOwner, 450);
      }
      // Squad AAS Flag Capture Ticket Swing:
      // - Capturing a Neutral Flag: +20 Tickets to Capturing Team
      // - Capturing an Enemy Flag: +30 Tickets to Capturing Team AND -10 Tickets to Defending Team (40-Ticket Swing!)
      const wasEnemyFlag = prevOwner && prevOwner !== 'NEUTRAL' && prevOwner !== newOwner;
      const capGrant = wasEnemyFlag
        ? this.ticketEconomy.ENEMY_CAPTURE_GRANT
        : this.ticketEconomy.NEUTRAL_CAPTURE_GRANT;
      const lossPenalty = wasEnemyFlag ? this.ticketEconomy.FLAG_LOST_PENALTY : 0;

      this.grantFlagTickets(
        newOwner,
        capGrant,
        wasEnemyFlag
          ? `OBJ ${flag.id} SEIZED FROM ${prevOwner} (+${capGrant} 🎟️)`
          : `NEUTRAL OBJ ${flag.id} SECURED (+${capGrant} 🎟️)`,
        true
      );

      if (wasEnemyFlag && lossPenalty > 0) {
        this.penalizeFlagLossTickets(
          prevOwner,
          lossPenalty,
          `LOST OBJ ${flag.id} TO ${newOwner} (-${lossPenalty} 🎟️)`
        );
      }

      if (typeof sound.playObjectiveCaptured === 'function') {
        sound.playObjectiveCaptured(newOwner === this.player.team);
      }

      if (!this.player.dead && !this.player.downed && newOwner === this.player.team) {
        const d = this.player.pos.distanceTo(flag.pos);
        const swingNote = wasEnemyFlag
          ? `+${capGrant} US / -${lossPenalty} ${prevOwner}`
          : `+${capGrant} TICKETS`;
        if (d <= flag.radius * 1.5) {
          this.player.captures = (this.player.captures || 0) + 1;
          events.emit('xp:awarded', {
            amount: 200,
            reason: `OBJECTIVE ${flag.id} CAPTURED (${swingNote}!) • PRESS [F] TO BUILD CHEST WALL DEFENSES!`
          });
        } else {
          this.ui.addXpNotification(
            0,
            `🚩 ALLIES CAPTURED OBJ ${flag.id} (${swingNote}!) • [F] BUILD POINT DEFENSES`
          );
        }
      }
      for (const b of this.botManager.bots) {
        if (
          !b.dead &&
          !b.downed &&
          (b.hp === undefined || b.hp > 0) &&
          (b.bleedOutTimer || 0) <= 0 &&
          b.team === newOwner &&
          b.pos.distanceTo(flag.pos) <= flag.radius * 1.5
        ) {
          b.captures = (b.captures || 0) + 1;
          b.score = (b.score || 0) + 200;
        }
      }
    });

    events.on('vehicle:credit-kill', ({ vehicle, category, attackerName, attackerTeam }) => {
      if (!vehicle || !attackerTeam || attackerTeam === vehicle.team) return;
      const cat = category || 'CAR';
      const applyCredit = (unit, isBot = false) => {
        if (!unit) return;
        if (cat === 'PLANE') {
          unit.planesDestroyed = (unit.planesDestroyed || 0) + 1;
        } else if (cat === 'TANK') {
          unit.tanksDestroyed = (unit.tanksDestroyed || 0) + 1;
        } else {
          unit.carsDestroyed = (unit.carsDestroyed || 0) + 1;
        }
        unit.vehiclesDestroyed =
          (unit.planesDestroyed || 0) + (unit.tanksDestroyed || 0) + (unit.carsDestroyed || 0);
        if (isBot) {
          const pts = cat === 'PLANE' ? 650 : cat === 'TANK' ? 450 : 250;
          unit.score = (unit.score || 0) + pts;
        }
      };

      const cleanAttacker = String(attackerName || '');
      const playerCallsign = this.network?.callsign || '';
      if (
        attackerTeam === this.player.team &&
        (cleanAttacker === this.player.name ||
          (playerCallsign && cleanAttacker.includes(playerCallsign)) ||
          cleanAttacker.startsWith('YOU'))
      ) {
        applyCredit(this.player, false);
        if (this.player.activeVehicle && this.player.activeVehicle.isAircraft) {
          this.player.recordAirCombatKill?.(cat === 'PLANE' || cat === 'TANK' ? 2 : 1);
        }
        return;
      }

      const botKiller = this.botManager.bots.find(
        (b) => b.team === attackerTeam && (b.name === cleanAttacker || cleanAttacker.includes(b.name))
      );
      if (botKiller) {
        applyCredit(botKiller, true);
      } else {
        // Credit an active AI Pilot / Armor / Engineer on the attacking team when shot down by AI Aircraft/SAM
        const fallbackBot =
          this.botManager.bots.find(
            (b) =>
              !b.dead &&
              b.team === attackerTeam &&
              (cat === 'PLANE' ? b.squad === 'FALCON' || b.role === 'ENGINEER' : b.role === 'ENGINEER' || b.squad === 'BRAVO')
          ) || this.botManager.bots.find((b) => !b.dead && b.team === attackerTeam);
        if (fallbackBot) applyCredit(fallbackBot, true);
      }
    });

    events.on('vehicle:destroyed', ({ vehicle, attackerName, weaponName, cost, category }) => {
      if (!vehicle) return;
      events.emit('telemetry:event', {
        type: 'VEHICLE_DESTROYED',
        payload: {
          vehicle: vehicle.name,
          category: category || vehicle.ticketCategory || 'CAR',
          team: vehicle.team,
          attacker: attackerName,
          weapon: weaponName,
          respawnTicketCost: cost || vehicle.ticketCost || 8
        }
      });
    });

    events.on('vehicle:respawn', ({ vehicle, cost, moneyCost = 0, category, stage }) => {
      if (this.matchEnded || !vehicle || cost <= 0) return;
      const shortName = vehicle.name ? vehicle.name.split(' (')[0] : vehicle.type.toUpperCase();
      const effCost = moneyCost || vehicle.factionMoneyCost || 0;
      const labelWithFunds =
        effCost > 0
          ? `${shortName} (CREW+EQUIP • -$${effCost.toLocaleString()})`
          : shortName;
      this.spendRespawnTickets(vehicle.team, category, labelWithFunds, cost);
    });

    events.on('airstrike:called', () => {});

    events.on(
      'round:ended',
      ({ winnerTeam, ticketsUS, ticketsRU, matchTimeRemaining, extraction }) => {
        sound.playMusicStinger?.(winnerTeam === this.player?.team ? 'victory' : 'defeat');
        this.ui.showVictoryScreen(
          winnerTeam,
          ticketsUS,
          ticketsRU,
          matchTimeRemaining,
          extraction
        );
      }
    );

    events.on('building:collapsed', ({ centerPos, radius, collapsedVoxels }) => {
      if (!centerPos) return;
      events.emit('xp:awarded', {
        amount: 250,
        reason: `🏢 BUILDING DEMOLISHED (${collapsedVoxels} BLOCKS)!`
      });
      events.emit('killstreak:announced', { text: '🏢 BUILDING COLLAPSED!' });
      this.applyExplosionDamageToUnits(centerPos, radius, 260, this.player, collapsedVoxels);
      events.emit('telemetry:event', {
        type: 'BUILDING_COLLAPSED',
        payload: {
          x: Math.round(centerPos.x),
          z: Math.round(centerPos.z),
          blocks: collapsedVoxels
        }
      });
    });

    events.on('explosion:damage', (data) => {
      if (!data) return;
      this.applyExplosionDamageToUnits(
        data.pos,
        data.radius,
        data.maxDamage,
        data.owner,
        data.brokenCount,
        data.customLabel || data.weaponOverride || null
      );
    });

    events.on('warcrime:committed', ({ medicName, wasRescuing, totalCount }) => {
      events.emit('telemetry:event', {
        type: 'WAR_CRIME_MEDIC_KILL',
        payload: {
          victim: medicName,
          wasRescuing,
          totalWarCrimes: totalCount
        }
      });
    });
  }

  applyExplosionDamageToUnits(
    blastPos,
    radius,
    maxDamage,
    owner,
    brokenCount = 0,
    customWeaponLabel = null
  ) {
    const isPlayerOwner = owner === this.player;
    const ownerName = owner ? owner.name : 'EXPLOSIVE';
    const ownerTeam = owner ? owner.team : 'NEUTRAL';
    const shooterPos = owner && owner.pos ? owner.pos.clone() : blastPos;
    const weaponLabel =
      customWeaponLabel ||
      (maxDamage >= 300 ? '120MM APHE' : maxDamage >= 220 ? 'RPG-7 HEAT' : 'EXPLOSIVE');
    const isHeavyBarrage = Boolean(
      customWeaponLabel || maxDamage >= 400 || radius >= 10
    );

    // Camera shake for local player based on blast proximity
    const distToPlayer = this.player.pos.distanceTo(blastPos);
    const shakeMaxDist = isHeavyBarrage ? 95 : 48;
    if (distToPlayer < shakeMaxDist) {
      this.player.addShake(
        Math.max(0.14, (1 - distToPlayer / shakeMaxDist) * (isHeavyBarrage ? 0.92 : 0.78))
      );
    }

    if (brokenCount >= 3 && isPlayerOwner) {
      this.player.onAwardXp(30, `WALL BREACHED (${brokenCount} BLOCKS)`);
    }

    // Damage local player if on foot and caught in an ENEMY blast (Commander's own airstrike has friendly-fire protection)
    if (
      !this.player.dead &&
      !this.player.downed &&
      !this.player.activeVehicle &&
      ownerTeam !== this.player.team &&
      distToPlayer <= radius * 1.4
    ) {
      const pDmg = Math.round(maxDamage * 0.35 * (1 - distToPlayer / (radius * 1.5)));
      if (pDmg > 0) {
        this.player.takeDamage(
          pDmg,
          ownerName,
          ownerTeam,
          weaponLabel,
          this.player.onKillEvent,
          shooterPos,
          false,
          { origin: blastPos, dist: distToPlayer, radius }
        );
      }
    }

    // Damage enemy soldiers in blast radius (Layered Inner Core Obliteration + Outer Shrapnel Wave)
    const maxInfantryDist = radius * (isHeavyBarrage ? 1.85 : 1.55);
    const coreRadius = radius * (isHeavyBarrage ? 0.72 : 0.35);
    for (const bot of this.botManager.bots) {
      if (
        bot.dead ||
        bot.downed ||
        (typeof bot.hp === 'number' && bot.hp <= 0) ||
        (typeof bot.bleedOutTimer === 'number' && bot.bleedOutTimer > 0) ||
        bot.drivingVehicle
      ) {
        continue;
      }
      // Use horizontal-weighted distance for airstrike bombs so rooftop impacts also catch soldiers inside/below!
      const dx = bot.pos.x - blastPos.x;
      const dz = bot.pos.z - blastPos.z;
      const dy = (bot.pos.y - blastPos.y) * (isHeavyBarrage ? 0.45 : 1.0);
      const dist = Math.hypot(dx, dy, dz);
      if (dist <= maxInfantryDist) {
        const falloff =
          dist <= coreRadius
            ? 1.0
            : Math.max(0.18, 1 - (dist - coreRadius) / (maxInfantryDist - coreRadius + 1.0));
        const dmg = Math.round(maxDamage * falloff);
        const allowFriendlyBlast = Boolean(isPlayerOwner && this.player && this.player.friendlyFireEnabled);
        if (dmg > 0 && (bot.team !== ownerTeam || allowFriendlyBlast)) {
          const res = this.botManager.damageBot(
            bot,
            dmg,
            ownerName,
            ownerTeam,
            weaponLabel,
            false,
            this.player.onKillEvent,
            null,
            { origin: blastPos, dist, radius }
          );
          if (res && res.ignoredDowned) {
            continue;
          }
          const isFriendlyVictim = bot.team === ownerTeam;
          if (isPlayerOwner) {
            this.ui.showHitmarker(
              res.killed ? 'kill' : 'normal',
              isFriendlyVictim
                ? res.killed
                  ? '⚠️ TEAMKILL! (-$0.10 / -10¢)'
                  : `⚠️ FRIENDLY FIRE -${dmg}`
                : ''
            );
          }
          if (res.killed && !isFriendlyVictim) {
            if (isPlayerOwner) {
              this.player.kills++;
              this.player.onAwardXp(
                isHeavyBarrage ? 140 : 120,
                `${isHeavyBarrage ? '💥 AIRSTRIKE' : 'EXPLOSIVE'} KILL (${bot.name})`
              );
              if (bot.role === 'MEDIC') {
                this.player.registerMedicWarCrime(bot.name, Boolean(res.wasRescuing));
              }
              const killInfo = this.player.registerKill(bot.name);
              if (this.player.activeVehicle && this.player.activeVehicle.isAircraft) {
                this.player.recordAirCombatKill?.(1);
              }
              if (killInfo.announcement) {
                this.ui.showKillStreakAnnouncement(killInfo.announcement);
              }
              if (killInfo.streakAnnouncement) {
                this.ui.showKillStreakAnnouncement(killInfo.streakAnnouncement);
              }
            } else if (owner && typeof owner.kills === 'number') {
              owner.kills++;
              if (bot.role === 'MEDIC') {
                owner.medicKills = (owner.medicKills || 0) + 1;
              }
              owner.score = (owner.score || 0) + 120;
            }
          }
        }
      }
    }

    // Damage enemy armored vehicles & tanks in blast radius:
    // - Shaped-charge RPG-7 HEAT requires a direct/near-direct hull impact (`<= 4.2m`, NOT 10.75m dirt splash!)
    //   and delegates front/side/rear Chobham composite penetration to `damageVehicle`.
    // - A-10C / Su-25 AGM-65G Maverick / Kh-29T ATGM & Heavy Bombs are true Anti-Armor Tank-Busters (2-hit MBT kill)!
    // - AC-130 105mm M102 / 40mm Bofors fire HE artillery/frag shells: devastating vs infantry, buildings, cars & APCs,
    //   while against 65-ton MBTs they inflict Track Mobility Kills + HE concussion (~4–5 direct 105mm hits solo)!
    const isRpgHeat = /RPG/i.test(weaponLabel) && !/TANDEM|MAVERICK|AGM|KH-29/i.test(weaponLabel);
    const isAtgmMissile = /MAVERICK|AGM-65|KH-29|HELLFIRE|GRIFFIN|TOW|KORNET|REFLEKS|LAHAT/i.test(weaponLabel);
    const isHydraRocket = /HYDRA|S-8|POD/i.test(weaponLabel);
    const isAc130Howitzer = /105MM|HOWITZER/i.test(weaponLabel);
    const isAc130Bofors = /40MM|BOFORS/i.test(weaponLabel);
    const isIfvAutocannon = /M242|BUSHMASTER|2A72|30MM AUTOCANNON/i.test(weaponLabel);
    const isHeavyAerialBomb = /JDAM|GBU|CARPET|MK-82|FAB-250|MOP|FOAB|AIRSTRIKE/i.test(weaponLabel);
    for (const v of this.vehicleManager.vehicles) {
      if (v.dead) continue;
      const dist = Math.hypot(v.pos.x - blastPos.x, v.pos.z - blastPos.z);
      const maxArmorBlast = isRpgHeat
        ? v.type === 'tank'
          ? 4.2
          : 3.6
        : isIfvAutocannon
        ? v.type === 'tank'
          ? 3.8
          : 4.5
        : radius * (isHeavyBarrage ? 2.0 : 1.75) + (v.type === 'tank' ? 2.0 : 1.0);
      if (dist <= maxArmorBlast) {
        const falloff = isRpgHeat
          ? dist <= 3.6
            ? 1.0
            : 0.72
          : dist <= radius * 0.65
          ? 1.0
          : Math.max(0.38, 1 - dist / (maxArmorBlast + 1.5));
        const armorMult = isAtgmMissile
          ? v.type === 'tank'
            ? 1.85
            : 1.95
          : isHeavyAerialBomb
          ? v.type === 'tank'
            ? 1.45
            : 1.65
          : isHydraRocket
          ? v.type === 'tank'
            ? 0.34
            : 1.15
          : isAc130Howitzer
          ? v.type === 'tank'
            ? 0.78
            : 1.85
          : isAc130Bofors
          ? v.type === 'tank'
            ? 0.38
            : 1.15
          : isIfvAutocannon
          ? v.type === 'tank'
            ? 0.42
            : v.type === 'apc' || v.type === 'aa'
            ? 0.92
            : 1.25
          : isRpgHeat
          ? v.type === 'tank'
            ? 1.0
            : v.type === 'apc' || v.type === 'aa'
            ? 0.95
            : 1.45
          : isHeavyBarrage
          ? v.type === 'tank'
            ? 0.95
            : 1.15
          : v.type === 'tank'
          ? 0.55
          : v.type === 'apc'
          ? 0.75
          : 0.9;
        const dmg = Math.round(maxDamage * armorMult * falloff);
        if (dmg > 0 && v.team !== ownerTeam) {
          const destroyed = this.vehicleManager.damageVehicle(
            v,
            dmg,
            ownerName,
            ownerTeam,
            weaponLabel,
            this.player.onKillEvent,
            isPlayerOwner ? this.player.onAwardXp : null,
            shooterPos
          );
          if (isPlayerOwner) {
            const actualDealt = typeof v.lastAppliedDamage === 'number' ? v.lastAppliedDamage : dmg;
            if (destroyed || actualDealt > 0) {
              const bdaTag =
                v.lastBdaHitmarker ||
                (destroyed
                  ? `${v.type === 'tank' ? 'TANK' : 'VEHICLE'} DESTROYED`
                  : `${v.type === 'tank' ? 'TANK' : 'VEHICLE'} HIT`);
              this.ui.showHitmarker(destroyed ? 'kill' : 'armor', bdaTag);
            } else if (v.lastArmorRicochet) {
              this.ui.showHitmarker('armor', v.lastHitDesc || '🛡️ NO PENETRATION (0 DMG)');
            }
          }
          if (destroyed && !isPlayerOwner && owner && typeof owner.kills === 'number') {
            owner.kills++;
          }
        }
      }
    }
  }

  canTeamAffordRespawn(team, cost = 1) {
    const pool = team === 'US' ? this.ticketsUS : this.ticketsRU;
    return pool >= cost;
  }

  spendRespawnTickets(team, category = 'SOLDIER', unitName = 'SOLDIER', cost = 1) {
    if (this.matchEnded) return;
    if (team === 'US') {
      this.ticketsUS = Math.max(0, this.ticketsUS - cost);
    } else {
      this.ticketsRU = Math.max(0, this.ticketsRU - cost);
    }

    const st = this.ticketStats[team];
    if (st) {
      if (category === 'PLANE') st.spentPlanes = (st.spentPlanes || 0) + cost;
      else if (category === 'CAR') st.spentCars += cost;
      else if (category === 'TANK' || category === 'ARMOR') st.spentArmor += cost;
      else st.spentSoldiers += cost;
    }

    const label =
      category === 'PLANE'
        ? `✈️ AIRCRAFT & PILOT LOST: ${unitName}`
        : category === 'TANK' || category === 'ARMOR'
        ? `🛡️ ARMOR & CREW LOST: ${unitName}`
        : category === 'CAR'
        ? `🚙 VEHICLE & CREW LOST: ${unitName}`
        : `SOLDIER RESPAWN: ${unitName}`;

    if (this.ui) {
      // Always show Plane, Tank/Armor & Car losses, Player respawns, and a throttled stream of AI soldier respawns
      const isVehicleOrSelf =
        category === 'PLANE' ||
        category === 'TANK' ||
        category === 'CAR' ||
        category === 'ARMOR' ||
        unitName.includes(this.network.callsign || 'YOU');
      const nowPerf = performance.now();
      if (isVehicleOrSelf || !this._lastSoldierTicketToast || nowPerf - this._lastSoldierTicketToast > 1800) {
        if (!isVehicleOrSelf) this._lastSoldierTicketToast = nowPerf;
        this.ui.addTicketEvent(team, -cost, category, label);
      }
    }

    if (this.telemetry && (category === 'PLANE' || category === 'TANK' || category === 'CAR' || category === 'ARMOR')) {
      this.telemetry.logEvent('TICKET_SPENT_RESPAWN', {
        team,
        category,
        unit: unitName,
        cost,
        remainingTickets: Math.floor(team === 'US' ? this.ticketsUS : this.ticketsRU)
      });
    }
  }

  grantFlagTickets(team, amount, reason, isCapture = false) {
    if (this.matchEnded) return;
    if (team === 'US') {
      this.ticketsUS = Math.min(MATCH.MAX_TICKETS, this.ticketsUS + amount);
    } else {
      this.ticketsRU = Math.min(MATCH.MAX_TICKETS, this.ticketsRU + amount);
    }

    const st = this.ticketStats[team];
    if (st) {
      if (isCapture) st.gainedCapture += amount;
      else st.gainedPassive += amount;
    }

    if (this.ui) {
      this.ui.addTicketEvent(team, Math.round(amount), 'FLAG', reason);
    }

    if (isCapture && this.telemetry) {
      this.telemetry.logEvent('TICKETS_GRANTED_CAPTURE', {
        team,
        amount,
        reason,
        newTotal: Math.floor(team === 'US' ? this.ticketsUS : this.ticketsRU)
      });
    }
  }

  penalizeFlagLossTickets(team, amount, reason) {
    if (this.matchEnded || amount <= 0) return;
    if (team === 'US') {
      this.ticketsUS = Math.max(0, this.ticketsUS - amount);
    } else {
      this.ticketsRU = Math.max(0, this.ticketsRU - amount);
    }

    const st = this.ticketStats[team];
    if (st) {
      st.lostFlags = (st.lostFlags || 0) + amount;
    }

    if (this.ui) {
      this.ui.addTicketEvent(team, -Math.round(amount), 'FLAG', reason);
    }

    if (this.telemetry) {
      this.telemetry.logEvent('TICKETS_LOST_FLAG', {
        team,
        amount,
        reason,
        remainingTickets: Math.floor(team === 'US' ? this.ticketsUS : this.ticketsRU)
      });
    }
  }

  computeTeamBleedRates() {
    let usFlags = 0;
    let ruFlags = 0;
    const flags = this.world.flags;
    for (let i = 0; i < flags.length; i++) {
      const owner = flags[i].owner;
      if (owner === 'US') usFlags++;
      else if (owner === 'RU') ruFlags++;
    }

    let bleedUSPerMin = 0;
    let bleedRUPerMin = 0;
    let usMercyBleed = false;
    let ruMercyBleed = false;

    // Squad AAS Territory Bleed: holding 3+ of 5 flags (past the midpoint) bleeds the opposing faction!
    if (usFlags >= 5) {
      bleedRUPerMin = this.ticketEconomy.MERCY_BLEED_5_FLAGS_PER_MIN; // 60/min = 1.0/sec Mercy Bleed
      ruMercyBleed = true;
    } else if (usFlags === 4) {
      bleedRUPerMin = this.ticketEconomy.BLEED_4_FLAGS_PER_MIN; // 15/min = 0.25/sec
    } else if (usFlags === 3 && usFlags > ruFlags) {
      bleedRUPerMin = this.ticketEconomy.BLEED_3_FLAGS_PER_MIN; // 6/min = 0.10/sec
    }

    if (ruFlags >= 5) {
      bleedUSPerMin = this.ticketEconomy.MERCY_BLEED_5_FLAGS_PER_MIN; // 60/min = 1.0/sec Mercy Bleed
      usMercyBleed = true;
    } else if (ruFlags === 4) {
      bleedUSPerMin = this.ticketEconomy.BLEED_4_FLAGS_PER_MIN; // 15/min = 0.25/sec
    } else if (ruFlags === 3 && ruFlags > usFlags) {
      bleedUSPerMin = this.ticketEconomy.BLEED_3_FLAGS_PER_MIN; // 6/min = 0.10/sec
    }

    // Additional Contested / Overrun Main Base Bleed
    if (this.botManager && this.botManager.baseState) {
      if (this.botManager.baseState.RU && this.botManager.baseState.RU.contested) {
        bleedRUPerMin += this.botManager.canTeamRespawn('RU') ? MATCH.CONTESTED_BLEED_CAN_RESPAWN : MATCH.CONTESTED_BLEED_LOCKED;
      }
      if (this.botManager.baseState.US && this.botManager.baseState.US.contested) {
        bleedUSPerMin += this.botManager.canTeamRespawn('US') ? MATCH.CONTESTED_BLEED_CAN_RESPAWN : MATCH.CONTESTED_BLEED_LOCKED;
      }
    }

    return {
      usFlags,
      ruFlags,
      bleedUSPerMin,
      bleedRUPerMin,
      bleedUSPerSec: bleedUSPerMin / 60,
      bleedRUPerSec: bleedRUPerMin / 60,
      usMercyBleed,
      ruMercyBleed
    };
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  loop() {
    this.scheduleNextFrame();
    const frameT0 = performance.now();
    const now = frameT0;
    const rawDt = Math.max(0.00002, (now - this.lastTime) / 1000);
    const dt = Math.min(0.05, rawDt);
    this.lastTime = now;
    this.watchdog.frameCount++;

    const allUnits = this._allUnits || (this._allUnits = []);
    allUnits.length = 0;
    allUnits.push(this.player);
    const botsList = this.botManager.bots;
    for (let i = 0; i < botsList.length; i++) {
      allUnits.push(botsList[i]);
    }
    if (this.network.remotePlayers.size > 0) {
      for (const rp of this.network.remotePlayers.values()) {
        allUnits.push(rp);
      }
    }

    const onDeployMenu =
      this.ui.deployScreenEl && !this.ui.deployScreenEl.classList.contains('hidden');
    const preRoundWaitingToStart = Boolean(
      onDeployMenu && this.matchTimeRemaining >= MATCH.DURATION - 0.5
    );

    if (!preRoundWaitingToStart) {
      this._runTimedStage('world', () => {
        this.world.update(
          dt,
          allUnits,
          this.player.onExplosionDamage,
          (payload) => this.network.send(payload),
          null,
          this.vehicleManager.vehicles
        );
      });
    } else {
      this.watchdog.stageMs.world = 0;
    }

    this._runTimedStage('vehicles', () => {
      this.vehicleManager.update(dt, this.player, this.botManager, onDeployMenu, this.camera);
    });

    this._runTimedStage('player', () => {
      if (this.player.dead) {
        if (
          !onDeployMenu &&
          !this.matchEnded &&
          this.player.deathCamEnabled &&
          this.player.deathCamPostTimer > 0 &&
          this.player.lastDeathReport?.hasKillerOrigin
        ) {
          this.player.deathCamPostTimer = Math.max(0, this.player.deathCamPostTimer - dt);
          this.player.updateDeathCamCamera(dt, true);
          if (this.player.deathCamPostTimer <= 0) {
            this.player.finishPostDeathCam();
          }
        } else {
          this.orbitAngle += dt * MATCH.ORBIT_SPEED;
          this.camera.position.set(
            Math.cos(this.orbitAngle) * MATCH.ORBIT_RADIUS_X,
            MATCH.ORBIT_HEIGHT,
            Math.sin(this.orbitAngle) * MATCH.ORBIT_RADIUS_Z
          );
          this.camera.lookAt(0, 4, 0);
          this.camera.updateMatrixWorld();
        }
      } else if (!onDeployMenu) {
        this.player.update(dt);
        this.camera.updateMatrixWorld();
      } else {
        this.camera.updateMatrixWorld();
      }
    });

    if (!preRoundWaitingToStart) {
      this._runTimedStage('bots', () => {
        this.botManager.update(
          dt,
          this.player,
          this.player.onKillEvent,
          (team, amount, category = 'SOLDIER', botName = 'SOLDIER') => {
            if (onDeployMenu || this.matchEnded) return;
            this.spendRespawnTickets(team, category, botName, amount);
          },
          this.vehicleManager,
          this.player.onAwardXp
        );
      });
    } else {
      this.watchdog.stageMs.bots = 0;
    }

    if (this.player.deathCamEnabled && (this.player.downed || this.player.deathCamPostTimer > 0)) {
      this.player.ensureDeathCamTargetVisible?.();
    }

    // Squad-Aligned AAS Ticket Economy:
    if (!this.matchEnded && !onDeployMenu) {
      this.matchTimeRemaining = Math.max(0, this.matchTimeRemaining - dt);
      const bleedInfo = this.computeTeamBleedRates();
      this.currentBleedInfo = bleedInfo;

      if (bleedInfo.bleedUSPerSec > 0) {
        const lossUS = bleedInfo.bleedUSPerSec * dt;
        this.ticketsUS = Math.max(0, this.ticketsUS - lossUS);
        this.ticketStats.US.lostBleed = (this.ticketStats.US.lostBleed || 0) + lossUS;
      }
      if (bleedInfo.bleedRUPerSec > 0) {
        const lossRU = bleedInfo.bleedRUPerSec * dt;
        this.ticketsRU = Math.max(0, this.ticketsRU - lossRU);
        this.ticketStats.RU.lostBleed = (this.ticketStats.RU.lostBleed || 0) + lossRU;
      }

      this.bleedPopupTimer -= dt;
      if (this.bleedPopupTimer <= 0) {
        this.bleedPopupTimer = MATCH.BLEED_POPUP_INTERVAL;
        if (bleedInfo.bleedRUPerMin > 0 && this.ui) {
          const drop = Math.max(1, Math.round(bleedInfo.bleedRUPerSec * 10));
          const label = bleedInfo.ruMercyBleed
            ? `MERCY BLEED — US HOLDS ALL 5 FLAGS (-${bleedInfo.bleedRUPerMin}/m)`
            : `TERRITORY BLEED — US HOLDS ${bleedInfo.usFlags}/5 FLAGS (-${bleedInfo.bleedRUPerMin}/m)`;
          this.ui.addTicketEvent('RU', -drop, 'FLAG', label);
        }
        if (bleedInfo.bleedUSPerMin > 0 && this.ui) {
          const drop = Math.max(1, Math.round(bleedInfo.bleedUSPerSec * 10));
          const label = bleedInfo.usMercyBleed
            ? `MERCY BLEED — RU HOLDS ALL 5 FLAGS (-${bleedInfo.bleedUSPerMin}/m)`
            : `TERRITORY BLEED — RU HOLDS ${bleedInfo.ruFlags}/5 FLAGS (-${bleedInfo.bleedUSPerMin}/m)`;
          this.ui.addTicketEvent('US', -drop, 'FLAG', label);
        }
      }

      if (this.ticketsUS <= 0 || this.ticketsRU <= 0 || this.matchTimeRemaining <= 0) {
        const winner = this.ticketsUS >= this.ticketsRU ? 'US' : 'RU';
        this.triggerMatchVictory(winner);
      }
    }

    this._runTimedStage('network', () => {
      this.network.update(dt);
      if (this.stateMachines) this.stateMachines.update(dt);
    });

    this._runTimedStage('audio', () => {
      sound.updateAdaptiveAudio?.({
        listenerPos: this.player?.pos,
        world: this.world,
        inAircraft: Boolean(this.player?.activeVehicle?.isAircraft),
        onDeployMenu,
        matchEnded: this.matchEnded,
        era: this.world?.era || 'modern',
        minTickets: Math.min(this.ticketsUS, this.ticketsRU),
        matchTimeRemaining: this.matchTimeRemaining,
        inCombat: Boolean(
          (this.player?.suppressionLevel || 0) > 0.12 ||
            this.currentBleedInfo?.bleedUSPerMin > 0 ||
            this.currentBleedInfo?.bleedRUPerMin > 0
        )
      });
    });

    this._runTimedStage('ui', () => {
      this.ui.update(dt, this.ticketsUS, this.ticketsRU, this.matchTimeRemaining, rawDt);
      this.ui.mobileTouch?.update?.();
      if (this.telemetry) this.telemetry.update(dt);
    });

    this._runTimedStage('render', () => {
      const flirRestore = this.syncThermalSceneState();
      let savedDayHazeDensity = null;
      if (!flirRestore && this.scene.fog && this.player && !this.player.dead) {
        const inAir = Boolean(this.player.activeVehicle && this.player.activeVehicle.isAircraft);
        const curFov = this.camera?.fov || 75;
        if (inAir || curFov < 42) {
          savedDayHazeDensity = this.scene.fog.density;
          this.scene.fog.density = savedDayHazeDensity * (inAir && curFov < 36 ? 0.34 : 0.48);
        }
      }
      try {
        this.renderer.render(this.scene, this.camera);
      } finally {
        if (savedDayHazeDensity !== null && this.scene.fog) {
          this.scene.fog.density = savedDayHazeDensity;
        }
        if (flirRestore) this.restorePostRenderThermalAtmosphere(flirRestore);
      }
    });

    // Record total frame CPU time & detect any frame-spike bottleneck (>55ms)
    const totalCpuMs = Math.round((performance.now() - frameT0) * 100) / 100;
    this.watchdog.stageMs.total = totalCpuMs;
    if (totalCpuMs > this.watchdog.peakStageMs.total) {
      this.watchdog.peakStageMs.total = totalCpuMs;
    }

    let topStage = 'render';
    let topMs = 0;
    const stages = this.watchdog.stageMs;
    for (const k of ['world', 'vehicles', 'player', 'bots', 'network', 'audio', 'ui', 'render']) {
      if (stages[k] > topMs) {
        topMs = stages[k];
        topStage = k;
      }
    }
    this.watchdog.slowestStage = topStage;
    this.watchdog.slowestMs = topMs;

    if (totalCpuMs >= 55 && this.watchdog.frameCount > 5) {
      const spikeEntry = {
        totalMs: Math.round(totalCpuMs),
        stage: topStage.toUpperCase(),
        stageMs: Math.round(topMs),
        atMs: Math.round(now)
      };
      this.watchdog.lastSpike = spikeEntry;
      if (totalCpuMs > this.watchdog.maxSpikeMs) {
        this.watchdog.maxSpikeMs = Math.round(totalCpuMs);
      }
      this.watchdog.recentSpikes.push(spikeEntry);
      if (this.watchdog.recentSpikes.length > 12) {
        this.watchdog.recentSpikes.shift();
      }
      if (totalCpuMs >= 160 && now - this.watchdog.lastToastAtMs > 8000) {
        this.watchdog.lastToastAtMs = now;
        console.warn(
          `[Blockfare Watchdog] Frame spike ${spikeEntry.totalMs}ms (slowest: ${spikeEntry.stage} ${spikeEntry.stageMs}ms)`,
          this.watchdog.stageMs
        );
        this.telemetry?.logEvent?.('WATCHDOG_FRAME_SPIKE', spikeEntry);
      }
    }
  }

  /**
   * Call of Duty ("Death From Above" / MW2 AC-130) True 3D Scene-Level FLIR Thermal Radiance:
   * Instead of drawing fake 2D dots over units, switches actual 3D soldier & vehicle materials
   * to physical LWIR thermal emission (37°C incandescent human limbs/heads contrasting against
   * tactical vests/rifles, and 220°C hot vehicle treads/tires/exhausts/barrels against warm armor hulls)
   * while cooling ambient sky, clouds, and terrain to dark FLIR slate!
   */
  syncThermalSceneState() {
    const p = this.player;
    const onDeployMenu =
      this.ui?.deployScreenEl && !this.ui.deployScreenEl.classList.contains('hidden');
    const isSensorFlir = Boolean(
      p && !p.dead && !onDeployMenu && p.nvgActive && (p.sensorMode === 'WHOT' || p.sensorMode === 'BHOT')
    );
    const curWep = p && !p.activeVehicle ? p.currentWeapon?.() : null;
    const activeOptic =
      p && !p.activeVehicle && typeof p.getActiveOpticType === 'function'
        ? p.getActiveOpticType()
        : curWep?.def?.opticType;
    const isScopeFlir = Boolean(
      p &&
        !p.dead &&
        !onDeployMenu &&
        !p.activeVehicle &&
        p.isAds &&
        (p.adsAmount || 0) > 0.42 &&
        !p.useCantedSight &&
        (activeOptic === 'flir' || activeOptic === 'sniperFlir' || curWep?.def?.isThermal)
    );
    const wantFlir = isSensorFlir || isScopeFlir;

    if (!this._flirModifiedMats) this._flirModifiedMats = [];
    if (!this._flirGen) this._flirGen = 1;

    if (!wantFlir) {
      if (this._flirSceneActive) {
        this._flirSceneActive = false;
        this._flirGen++;
        for (let i = 0; i < this._flirModifiedMats.length; i++) {
          const mat = this._flirModifiedMats[i];
          const orig = mat?.userData?._origFlir;
          if (!mat || !orig) continue;
          if (mat.color) mat.color.setHex(orig.colorHex);
          if ('map' in mat && mat.map !== orig.map) {
            mat.map = orig.map;
            mat.needsUpdate = true;
          }
          if (orig.hasEmissive && mat.emissive) {
            mat.emissive.setHex(orig.emissiveHex);
            mat.emissiveIntensity = orig.emissiveIntensity;
          }
        }
        this._flirModifiedMats.length = 0;
        if (this.world?.skyCloudGroup) {
          this.world.skyCloudGroup.traverse((c) => {
            if (c.isMesh && c.material && c.material.userData?._origCloudHex !== undefined) {
              c.material.color.setHex(c.material.userData._origCloudHex);
              delete c.material.userData._origCloudHex;
            }
            if (c.isMesh && c.material?.userData?.uSkyBgColor && c.material.userData._origCloudSkyHex !== undefined) {
              c.material.userData.uSkyBgColor.value.setHex(c.material.userData._origCloudSkyHex);
              delete c.material.userData._origCloudSkyHex;
            }
          });
        }
      }
      return null;
    }

    this._flirSceneActive = true;
    const gen = this._flirGen;

    const tagRootThermal = (root, isVehicle = false, isDeadVeh = false) => {
      if (!root) return;
      if (
        root.userData._flirTaggedGen === gen &&
        root.userData._flirDeadFlag === isDeadVeh
      ) {
        return;
      }
      root.userData._flirTaggedGen = gen;
      root.userData._flirDeadFlag = isDeadVeh;

      root.traverse((obj) => {
        if (!obj.isMesh || !obj.material) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (let mi = 0; mi < mats.length; mi++) {
          const mat = mats[mi];
          if (!mat || !mat.color) continue;
          if (mat.transparent && (mat.opacity ?? 1) < 0.55) continue;

          if (!mat.userData._origFlir) {
            mat.userData._origFlir = {
              colorHex: mat.color.getHex(),
              map: mat.map || null,
              hasEmissive: Boolean(mat.emissive),
              emissiveHex: mat.emissive ? mat.emissive.getHex() : 0x000000,
              emissiveIntensity: mat.emissiveIntensity ?? 1
            };
          }
          if (mat.userData._flirAppliedGen !== gen || isVehicle) {
            if (mat.userData._flirAppliedGen !== gen) {
              mat.userData._flirAppliedGen = gen;
              this._flirModifiedMats.push(mat);
            }
            const orig = mat.userData._origFlir;
            const r = ((orig.colorHex >> 16) & 255) / 255;
            const g = ((orig.colorHex >> 8) & 255) / 255;
            const b = (orig.colorHex & 255) / 255;
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;

            if (isVehicle) {
              if (isDeadVeh) {
                mat.color.setHex(0x424850);
                if (mat.emissive) {
                  mat.emissive.setHex(0x161a1e);
                  mat.emissiveIntensity = 0.2;
                }
              } else if (lum < 0.23) {
                // Tires, caterpillar treads, exhausts, gun barrels & engine grilles: 220°C white-hot!
                mat.color.setHex(0xffffff);
                if (mat.emissive) {
                  mat.emissive.setHex(0xffffff);
                  mat.emissiveIntensity = 0.98;
                }
              } else {
                // Main vehicle hull & turret armor plates: warm metallic signature with facet shading!
                mat.color.setHex(0xdce4ee);
                if (mat.emissive) {
                  mat.emissive.setHex(0xa8b4c2);
                  mat.emissiveIntensity = 0.52;
                }
              }
            } else {
              // 3D Soldier / Biological Mesh:
              // Exposed skin & uniform limbs/torso (`orig.map` camo or warm flesh) glow 37°C pure white-hot;
              // ballistic helmets, plate carriers, boots & rifles stay slightly cooler (`0xc8d1dc`) for crisp 3D limb detail!
              const isWarmBodyOrUniform = Boolean(orig.map) || (r > 0.62 && g > 0.42);
              if (isWarmBodyOrUniform) {
                mat.color.setHex(0xffffff);
                if ('map' in mat && mat.map !== null) {
                  mat.map = null;
                  mat.needsUpdate = true;
                }
                if (mat.emissive) {
                  mat.emissive.setHex(0xffffff);
                  mat.emissiveIntensity = 0.96;
                }
              } else {
                mat.color.setHex(0xc8d1dc);
                if ('map' in mat && mat.map !== null) {
                  mat.map = null;
                  mat.needsUpdate = true;
                }
                if (mat.emissive) {
                  mat.emissive.setHex(0x8894a2);
                  mat.emissiveIntensity = 0.4;
                }
              }
            }
          }
        }
      });
    };

    if (this.botManager?.bots) {
      for (let i = 0; i < this.botManager.bots.length; i++) {
        const b = this.botManager.bots[i];
        if (b?.mesh) tagRootThermal(b.mesh, false, false);
      }
    }
    if (p?.thirdPersonSoldierMesh) {
      tagRootThermal(p.thirdPersonSoldierMesh, false, false);
    }
    if (this.network?.remotePlayers?.size > 0) {
      for (const rp of this.network.remotePlayers.values()) {
        if (rp?.mesh) tagRootThermal(rp.mesh, false, false);
      }
    }
    if (this.vehicleManager?.vehicles) {
      for (let i = 0; i < this.vehicleManager.vehicles.length; i++) {
        const v = this.vehicleManager.vehicles[i];
        if (v?.mesh && v !== p?.activeVehicle) {
          tagRootThermal(v.mesh, true, Boolean(v.dead));
        }
      }
    }
    if (this.world?._debrisPool?.mesh) {
      tagRootThermal(this.world._debrisPool.mesh, true, false);
    }

    // Cool high-altitude sky clouds once per FLIR activation so they read as dark overcast vapor without per-frame traversal
    if (this.world?.skyCloudGroup && this.world.skyCloudGroup.userData._flirCloudGen !== gen) {
      this.world.skyCloudGroup.userData._flirCloudGen = gen;
      this.world.skyCloudGroup.traverse((c) => {
        if (c.isMesh && c.material && c.material.color) {
          if (c.material.userData._origCloudHex === undefined) {
            c.material.userData._origCloudHex = c.material.color.getHex();
          }
          c.material.color.setHex(0x2b313a);
          if (c.material.userData?.uSkyBgColor) {
            if (c.material.userData._origCloudSkyHex === undefined) {
              c.material.userData._origCloudSkyHex = c.material.userData.uSkyBgColor.value.getHex();
            }
            c.material.userData.uSkyBgColor.value.setHex(0x1b2026);
          }
        }
      });
    }

    const savedBgHex = this.scene.background ? this.scene.background.getHex() : null;
    const savedFogHex = this.scene.fog?.color ? this.scene.fog.color.getHex() : null;
    const savedFogDensity = this.scene.fog ? this.scene.fog.density : 0;
    if (this.scene.background) this.scene.background.setHex(0x1b2026);
    if (this.scene.fog) {
      this.scene.fog.color.setHex(0x1b2026);
      this.scene.fog.density = savedFogDensity * 0.42; // LWIR thermal cuts cleanly through battlefield haze!
    }
    return { savedBgHex, savedFogHex, savedFogDensity };
  }

  restorePostRenderThermalAtmosphere(saved) {
    if (!saved) return;
    if (saved.savedBgHex !== null && this.scene.background) {
      this.scene.background.setHex(saved.savedBgHex);
    }
    if (saved.savedFogHex !== null && this.scene.fog) {
      this.scene.fog.color.setHex(saved.savedFogHex);
      this.scene.fog.density = saved.savedFogDensity;
    }
  }

  triggerMatchVictory(winnerTeam) {
    if (this.matchEnded) return;
    this.matchEnded = true;
    this.player.dead = true;
    this.player.downed = false;
    if (typeof this.player.clearActiveVehicleOnReset === 'function') {
      this.player.clearActiveVehicleOnReset('round-ended');
    } else {
      if (this.player.activeVehicle) {
        const exitedVehicle = this.player.activeVehicle;
        this.player.activeVehicle.driver = null;
        this.player.activeVehicle = null;
        events.emit('player:exited-vehicle', { vehicle: exitedVehicle, reason: 'round-ended' });
      }
      this.player.sensorMode = 'OFF';
      this.player.nvgActive = false;
    }
    if (document.pointerLockElement === document.body) {
      document.exitPointerLock();
    }
    const extraction =
      this.player && typeof this.player.settleMatchToWarehouse === 'function'
        ? this.player.settleMatchToWarehouse(winnerTeam, this.roundEpoch || 1)
        : null;
    events.emit('round:ended', {
      winnerTeam,
      ticketsUS: this.ticketsUS,
      ticketsRU: this.ticketsRU,
      matchTimeRemaining: this.matchTimeRemaining,
      extraction
    });
  }

  resetMatch(fromRemote = false) {
    if (!fromRemote) {
      this.roundEpoch = (this.roundEpoch || 1) + 1;
    }
    this._matchResetGraceUntil = performance.now() + 12000;
    this.syncMatchTicketsForArmyScale(this.botManager?.currentBotsPerTeam || 250, true);
    this.ticketsUS = this.ticketEconomy.START_TICKETS;
    this.ticketsRU = this.ticketEconomy.START_TICKETS;
    this.ticketStats.US = { gainedCapture: 0, gainedPassive: 0, lostFlags: 0, lostBleed: 0, spentSoldiers: 0, spentCars: 0, spentArmor: 0, spentPlanes: 0 };
    this.ticketStats.RU = { gainedCapture: 0, gainedPassive: 0, lostFlags: 0, lostBleed: 0, spentSoldiers: 0, spentCars: 0, spentArmor: 0, spentPlanes: 0 };
    this.matchTimeRemaining = MATCH.DURATION;
    this.matchEnded = false;
    if (this.player) {
      this.player.lastMatchExtraction = null;
    }

    // Reset AC-130 / Aircraft Infrared (WHOT / BHOT) & Night Vision back to normal daylight view for the new round!
    if (this.player) {
      this.player._hasDeployedInRound = false;
      if (typeof this.player.clearActiveVehicleOnReset === 'function') {
        this.player.clearActiveVehicleOnReset('new-round');
      } else {
        this.player.sensorMode = 'OFF';
        this.player.nvgActive = false;
      }
    }

    // 1. Rebuild 100% clean world structures, collapsed buildings, crates, keys, loot packs & neutral FOBs!
    if (typeof this.world?.resetWorldForNewRound === 'function') {
      this.world.resetWorldForNewRound();
    } else {
      this.world?.resetFlagsForNewRound?.();
    }
    if (this.botManager?.baseState) {
      if (this.botManager.baseState.US) {
        this.botManager.baseState.US.contested = false;
        this.botManager.baseState.US.enemiesInBase = 0;
      }
      if (this.botManager.baseState.RU) {
        this.botManager.baseState.RU.contested = false;
        this.botManager.baseState.RU.enemiesInBase = 0;
      }
    }
    if (this.botManager) {
      if (Array.isArray(this.botManager.smokeClouds)) {
        for (const sc of this.botManager.smokeClouds) {
          if (sc?.mesh && this.scene) this.scene.remove(sc.mesh);
        }
        this.botManager.smokeClouds.length = 0;
      }
      if (Array.isArray(this.botManager.tracers)) {
        for (const tr of this.botManager.tracers) {
          if (tr?.mesh && this.scene) this.scene.remove(tr.mesh);
        }
        this.botManager.tracers.length = 0;
      }
    }

    // 2. Reset player deployables, C4, airstrike jets/markers, bullets & round stats
    if (Array.isArray(this.player.plantedC4)) {
      for (const c4 of this.player.plantedC4) {
        if (c4?.mesh && this.scene) this.scene.remove(c4.mesh);
      }
      this.player.plantedC4.length = 0;
    }
    if (Array.isArray(this.player.activeBullets)) {
      for (const bul of this.player.activeBullets) {
        if (bul?.tracerMesh && this.scene) this.scene.remove(bul.tracerMesh);
      }
      this.player.activeBullets.length = 0;
    }
    if (this.player.rallyPoint?.mesh && this.scene) {
      this.scene.remove(this.player.rallyPoint.mesh);
    }
    this.player.rallyPoint = null;
    if (this.player.insertionBeacon?.mesh && this.scene) {
      this.scene.remove(this.player.insertionBeacon.mesh);
    }
    this.player.insertionBeacon = null;
    if (this.player.airstrikeTarget) {
      if (this.player.airstrikeTarget.ringMesh && this.scene) {
        this.scene.remove(this.player.airstrikeTarget.ringMesh);
      }
      if (this.player.airstrikeTarget.smokeMesh && this.scene) {
        this.scene.remove(this.player.airstrikeTarget.smokeMesh);
      }
      this.player.airstrikeTarget = null;
    }
    if (Array.isArray(this.player.pendingAirstrikeBombs)) {
      this.player.pendingAirstrikeBombs.length = 0;
    }
    if (Array.isArray(this.player.activeAirstrikeJets)) {
      for (const jet of this.player.activeAirstrikeJets) {
        if (jet?.mesh && this.scene) this.scene.remove(jet.mesh);
      }
      this.player.activeAirstrikeJets.length = 0;
    }
    this.player.uavActive = false;
    this.player.uavTimer = 0;
    if (this.player.uavDroneMesh) this.player.uavDroneMesh.visible = false;
    if (this.player.uavSweepRingMesh) this.player.uavSweepRingMesh.visible = false;
    this.player.activeRideVehicle = null;
    this.player.kills = 0;
    this.player.deaths = 0;
    this.player.revives = 0;
    this.player.medicKills = 0;
    this.player.planesDestroyed = 0;
    this.player.tanksDestroyed = 0;
    this.player.carsDestroyed = 0;
    this.player.vehiclesDestroyed = 0;
    this.player.captures = 0;
    this.player.score = 0;
    this.player.matchCash = ECONOMY.STARTING_MATCH_CASH || 50;
    this.player._vehCooldownUntil = {};
    if (typeof this.player.syncTotalCash === 'function') {
      this.player.syncTotalCash();
    }
    this.player._hasDeployedInRound = false;
    if (typeof this.player.saveGunsmithState === 'function') {
      this.player.saveGunsmithState();
    }
    if (this.ui) {
      this.ui.selectedDeployVehicle = 'foot';
      if (typeof this.ui.updateCashAndGunsmithHud === 'function') {
        this.ui.updateCashAndGunsmithHud();
      }
    }

    // 3. Return all Vehicles to their clean HQ Motor Pool & Airbase Apron bays at 100% HP & 100% Ordnance
    if (typeof this.vehicleManager?.resetForNewRound === 'function') {
      this.vehicleManager.resetForNewRound();
    } else {
      this.vehicleManager?.clearAllWrecks?.();
    }

    // 4. Return all AI Soldiers to their respective Main Bases (US_BASE / RU_BASE) at full HP
    const usBase = this.world?.spawns?.US_BASE || { x: -1520, z: 0 };
    const ruBase = this.world?.spawns?.RU_BASE || { x: 1520, z: 0 };
    let usIdx = 0;
    let ruIdx = 0;
    for (const b of this.botManager.bots) {
      b.kills = 0;
      b.deaths = 0;
      b.revives = 0;
      b.medicKills = 0;
      b.planesDestroyed = 0;
      b.tanksDestroyed = 0;
      b.carsDestroyed = 0;
      b.vehiclesDestroyed = 0;
      b.captures = 0;
      b.score = 0;
      b.drivingVehicle = null;
      b.ridingVehicle = null;
      b.downed = false;
      b.dead = false;
      b.hp = b.maxHp || 100;
      b.bleedOutTimer = 0;
      b.respawnTimer = 0;
      b.rpgRocketsLeft = b.role === 'ENGINEER' ? 2 : 0;
      b._losCache?.clear();
      b._seekingVehicleRef = null;
      b._defendedFlagRef = null;
      if (typeof this.botManager.pickSpawnPosition === 'function') {
        const spawnInfo = this.botManager.pickSpawnPosition(
          b.team,
          b.squad,
          true,
          b.subFaction
        );
        b.pos.copy(spawnInfo.pos);
        b.lastSpawnSource = spawnInfo.source;
      } else {
        const idx = b.team === 'US' ? usIdx++ : ruIdx++;
        const base = b.team === 'US' ? usBase : ruBase;
        const col = (idx % 20) - 9.5;
        const row = Math.floor(idx / 20) - 6;
        const dirSign = b.team === 'US' ? 1 : -1;
        const bx = base.x + dirSign * (24 + row * 3.4);
        const bz = base.z + col * 3.2;
        const by = this.world ? this.world.getGroundHeightAt(bx, bz) : 1.25;
        b.pos.set(bx, by, bz);
      }
      if (b.mesh) {
        b.mesh.position.copy(b.pos);
        b.mesh.rotation.set(0, b.yaw || 0, 0);
        b.mesh.visible = true;
      }
    }
    if (this.ui) {
      this.ui.selectedSpawn = 'BASE';
      this.ui.drawDeployMap?.(true);
    }
    this.ui.hideVictoryScreen();
    this.ui.showDeployScreen();
    if (!fromRemote && this.network?.isMultiplayer?.()) {
      this.network.send({
        type: 'match_reset',
        roundEpoch: this.roundEpoch,
        ticketsUS: this.ticketsUS,
        ticketsRU: this.ticketsRU,
        matchTimeRemaining: this.matchTimeRemaining
      });
    }
  }
}

function bootBattleBitGame() {
  if (!window.game) {
    window.game = new BattleBitGame();
    const unlockAudioOnce = () => {
      sound.init?.();
      window.removeEventListener('pointerdown', unlockAudioOnce);
      window.removeEventListener('keydown', unlockAudioOnce);
    };
    window.addEventListener('pointerdown', unlockAudioOnce, { passive: true });
    window.addEventListener('keydown', unlockAudioOnce, { passive: true });
  }
  return window.game;
}

window.forceEnterGame = () => {
  const g = bootBattleBitGame();
  if (g && g.ui) {
    g.ui.triggerDeploy();
  }
};

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', bootBattleBitGame);
} else {
  bootBattleBitGame();
}
