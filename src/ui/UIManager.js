import { UI } from '../config.js?v=114';
import { events, makeEventBridge } from '../events.js?v=114';
import { DeployScreen } from './DeployScreen.js?v=114';
import { HudRenderer } from './HudRenderer.js?v=114';
import { Scoreboard } from './Scoreboard.js?v=114';
import { MinimapRenderer } from './MinimapRenderer.js?v=114';
import { CommandPanel } from './CommandPanel.js?v=114';
import { WorldMarkers } from './WorldMarkers.js?v=114';
import { GunsmithModal } from './GunsmithModal.js?v=114';
import { SettingsModal } from './SettingsModal.js?v=114';
import { VictoryScreen } from './VictoryScreen.js?v=114';
import { DamageIndicators } from './DamageIndicators.js?v=114';

export class UIManager {
  constructor(world, player, botManager, vehicleManager, network) {
    this.world = world;
    this.player = player;
    this.botManager = botManager;
    this.vehicleManager = vehicleManager;
    this.network = network;

    this._domCache = new Map();
    this._markerPool = [];

    this.selectedClass = 'engineer';
    this.selectedTeam = 'US';
    this.selectedRank = 'COMMANDER';
    this.selectedSquad = 'ALPHA';
    this.selectedSpawn = 'BASE';
    this.selectedAtmos = 'DAY';
    this.pendingDeployOrder = null;
    this.mapClickMode = 'ORDER'; // 'ORDER' or 'AIRSTRIKE' on the [K] Tactical Map

    this.lastTicketsUS = UI.INITIAL_TICKETS_US;
    this.lastTicketsRU = UI.INITIAL_TICKETS_RU;
    this.lastMatchTime = UI.INITIAL_MATCH_TIME;

    this.hitmarkerTimer = 0;

    // Real-Time FPS & Frame-Time Counter State (Visible at top-right, Toggle via [F2] or HUD/Deploy button)
    this.showFps = true;
    this.fpsSmoothed = UI.FPS_SMOOTHED_DEFAULT;
    this.frameMsSmoothed = UI.FRAME_MS_SMOOTHED_DEFAULT;
    this.frameHistory = [];
    this.fpsUiTimer = 0;

    // Throttled HUD / DOM / Minimap Timers (prevents 60Hz innerHTML & Canvas layout thrashing)
    this._markerTimer = 0;
    this._lastWorldMarkersHtml = '';
    this._minimapTimer = 0;
    this._rosterTimer = 0;
    this._lastMagSignature = '';

    // DOM References (cached via this.el)
    this.hudEl = this.el('hud');
    this.deployScreenEl = this.el('deploy-screen');
    this.scopeOverlayEl = this.el('scope-overlay');
    this.opticFrameEl = this.el('optic-frame');
    this.opticLabelEl = this.el('optic-label');
    this.vehicleOverlayEl = this.el('vehicle-overlay');
    this.vehNameLabel = this.el('veh-name-label');
    this.vehHpLabel = this.el('veh-hp-label');
    this.vehSpeedLabelEl = this.el('veh-speed-label');
    this.fpsPillEl = this.el('fps-counter-pill');
    this.fpsValEl = this.el('fps-val');
    this.fpsMsValEl = this.el('fps-ms-val');
    this.fpsLowValEl = this.el('fps-low-val');
    this.hudFpsToggleEl = this.el('hud-fps-toggle');
    this.deployFpsToggleBtn = this.el('deploy-fps-toggle-btn');
    this.hudCashBtnEl = this.el('hud-cash-btn');
    this.hudCashValEl = this.el('hud-cash-val');
    this.ammoGunsmithBtnEl = this.el('ammo-gunsmith-btn');
    this.deployGunsmithBtnEl = this.el('deploy-gunsmith-btn');
    this.deployCashValEl = this.el('deploy-cash-val');
    this.deploySettingsBtnEl = this.el('deploy-settings-btn');
    this.hudSettingsBtnEl = this.el('hud-settings-btn');
    this.hudMapCmdBarEl = this.el('hud-map-cmd-bar');
    this.hudCmdSummaryTextEl = this.el('hud-cmd-summary-text');
    this.damageVignetteEl = this.el('damage-vignette');
    this.nvgOverlayEl = this.el('nvg-overlay');
    this.worldMarkersEl = this.el('world-markers');

    this.downedOverlayEl = this.el('downed-overlay');
    this.downedKillerEl = this.el('downed-killer-text');
    this.downedMedicDistEl = this.el('downed-medic-dist');
    this.downedTimerValEl = this.el('downed-timer-val');
    this.giveupBarFillEl = this.el('giveup-bar-fill');

    this.ticketsUsEl = this.el('tickets-us');
    this.ticketsRuEl = this.el('tickets-ru');
    this.ticketRateUsEl = this.el('ticket-rate-us');
    this.ticketRateRuEl = this.el('ticket-rate-ru');
    this.ticketEventFeedEl = this.el('ticket-event-feed');
    this.matchClockEl = this.el('match-clock');
    this.matchLeadTextEl = this.el('match-lead-text');
    this.momentumBarUsEl = this.el('momentum-bar-us');
    this.compassHeadingEl = this.el('compass-heading');

    this.captureStatusEl = this.el('capture-status');
    this.captureTitleEl = this.el('capture-title');
    this.captureBarEl = this.el('capture-progress-bar');

    this.hitmarkerEl = this.el('hitmarker');
    this.hitConfirmTagEl = this.el('hit-confirm-tag');
    this.crosshairEl = this.el('crosshair');
    this.interactPromptEl = this.el('interact-prompt');
    this.xpFeedEl = this.el('xp-feed');
    this.killfeedEl = this.el('killfeed');

    this.squadHeaderTitleEl = this.el('squad-header-title');
    this.squadListBodyEl = this.el('squad-list-body');
    this.vehicleVitalsRowEl = this.el('vehicle-vitals-row');
    this.vehHullTagEl = this.el('veh-hull-tag');
    this.vehHullFillEl = this.el('veh-hull-bar-fill');
    this.vehHullValEl = this.el('veh-hull-value');
    this.crewHpLabelEl = this.el('crew-hp-label');
    this.hpFillEl = this.el('hp-bar-fill');
    this.hpValEl = this.el('hp-value');
    this.bleedBadgeEl = this.el('bleed-badge');
    this.armorBadgeEl = this.el('armor-badge');
    this.stanceBadgeEl = this.el('stance-badge');
    this.bandageBadgeEl = this.el('bandage-count-badge');
    this.grenadeBadgeEl = this.el('grenade-count-badge');

    this.damageIndicatorRingEl = this.el('damage-indicator-ring');
    this.damageIndicators = [];

    this.telemetryPanelEl = this.el('telemetry-panel');
    this.telemSummaryGridEl = this.el('telemetry-summary-grid');
    this.telemVehiclesListEl = this.el('telemetry-vehicles-list');
    this.telemEventsListEl = this.el('telemetry-events-list');
    this.telemetry = null;

    this.actionProgressEl = this.el('action-progress');
    this.actionLabelEl = this.el('action-label');
    this.actionFillEl = this.el('action-bar-fill');

    this.weaponNameEl = this.el('weapon-name');
    this.ammoClipEl = this.el('ammo-clip');
    this.ammoReserveEl = this.el('ammo-reserve');
    this.magBarsRowEl = this.el('mag-bars-row');
    this.fireModeEl = this.el('fire-mode');
    this.zeroBadgeEl = this.el('zero-badge');
    this.cantedBadgeEl = this.el('canted-badge');
    this.blueprintBadgeEl = this.el('blueprint-badge');

    this.scoreboardEl = this.el('scoreboard');
    this.sbClockPillEl = this.el('sb-clock-pill');
    this.sbSideCompEl = this.el('sb-side-comparison');
    this.sbSquadGridEl = this.el('sb-squad-leaderboard');
    this.sbUsHeaderEl = this.el('sb-us-header');
    this.sbRuHeaderEl = this.el('sb-ru-header');
    this.sbUsBody = this.el('sb-us-body');
    this.sbRuBody = this.el('sb-ru-body');

    this.victoryScreenEl = this.el('victory-screen');
    this.victoryReasonTagEl = this.el('victory-reason-tag');
    this.victoryTitleEl = this.el('victory-title');
    this.victoryScorelineEl = this.el('victory-scoreline');
    this.victorySideSummaryEl = this.el('victory-side-summary');
    this.victorySquadSummaryEl = this.el('victory-squad-summary');
    this.victoryMvpCardsEl = this.el('victory-mvp-cards');

    this.netLabelEl = this.el('net-label');

    this.minimapCanvas = this.el('minimap-canvas');
    this.minimapCtx = this._getCachedContext2D(this.minimapCanvas, 'minimapCtx');

    this.deployMapCanvas = this.el('deploy-map-canvas');
    this.deployMapCtx = this._getCachedContext2D(this.deployMapCanvas, 'deployMapCtx');

    this.onPlayNextRound = makeEventBridge('ui:play-next-round', () => ({}));
    this.onAtmosphereChange = makeEventBridge('ui:atmosphere-change', (mode) => ({ mode }));
    this.onBeforeDeploy = makeEventBridge('ui:before-deploy', () => ({}));
    this.onPlayerRespawn = makeEventBridge(
      'ui:player-respawn',
      (team, role, spawnSource) => ({ team, role, spawnSource })
    );

    this.bindDeployEvents();
    if (typeof this.bindSettingsEvents === 'function') {
      this.bindSettingsEvents();
    }
  }

  el(id) {
    if (!this._domCache) {
      this._domCache = new Map();
    }
    let elem = this._domCache.get(id);
    if (!elem || !elem.isConnected) {
      elem = document.getElementById(id);
      if (elem) {
        this._domCache.set(id, elem);
      } else {
        this._domCache.delete(id);
      }
    }
    return elem;
  }
}

Object.assign(
  UIManager.prototype,
  DeployScreen,
  HudRenderer,
  Scoreboard,
  MinimapRenderer,
  CommandPanel,
  WorldMarkers,
  GunsmithModal,
  SettingsModal,
  VictoryScreen,
  DamageIndicators
);

export default UIManager;
