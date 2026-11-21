import * as THREE from '../vendor/three.module.js';
import { SQUAD_DEFS } from './bots.js?v=35';
import { ATTACHMENT_CATALOG } from './weapons.js?v=35';
import { UI } from './config.js?v=35';

export class UIManager {
  constructor(world, player, botManager, vehicleManager, network) {
    this.world = world;
    this.player = player;
    this.botManager = botManager;
    this.vehicleManager = vehicleManager;
    this.network = network;

    this.selectedClass = 'engineer';
    this.selectedTeam = 'US';
    this.selectedRank = 'COMMANDER';
    this.selectedSquad = 'ALPHA';
    this.selectedSpawn = 'A';
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

    // DOM References
    this.hudEl = document.getElementById('hud');
    this.deployScreenEl = document.getElementById('deploy-screen');
    this.scopeOverlayEl = document.getElementById('scope-overlay');
    this.opticFrameEl = document.getElementById('optic-frame');
    this.opticLabelEl = document.getElementById('optic-label');
    this.vehicleOverlayEl = document.getElementById('vehicle-overlay');
    this.vehNameLabel = document.getElementById('veh-name-label');
    this.vehHpLabel = document.getElementById('veh-hp-label');
    this.vehSpeedLabelEl = document.getElementById('veh-speed-label');
    this.fpsPillEl = document.getElementById('fps-counter-pill');
    this.fpsValEl = document.getElementById('fps-val');
    this.fpsMsValEl = document.getElementById('fps-ms-val');
    this.fpsLowValEl = document.getElementById('fps-low-val');
    this.hudFpsToggleEl = document.getElementById('hud-fps-toggle');
    this.deployFpsToggleBtn = document.getElementById('deploy-fps-toggle-btn');
    this.hudCashBtnEl = document.getElementById('hud-cash-btn');
    this.hudCashValEl = document.getElementById('hud-cash-val');
    this.ammoGunsmithBtnEl = document.getElementById('ammo-gunsmith-btn');
    this.deployGunsmithBtnEl = document.getElementById('deploy-gunsmith-btn');
    this.deployCashValEl = document.getElementById('deploy-cash-val');
    this.hudMapCmdBarEl = document.getElementById('hud-map-cmd-bar');
    this.hudCmdSummaryTextEl = document.getElementById('hud-cmd-summary-text');
    this.damageVignetteEl = document.getElementById('damage-vignette');
    this.nvgOverlayEl = document.getElementById('nvg-overlay');
    this.worldMarkersEl = document.getElementById('world-markers');

    this.downedOverlayEl = document.getElementById('downed-overlay');
    this.downedKillerEl = document.getElementById('downed-killer-text');
    this.downedMedicDistEl = document.getElementById('downed-medic-dist');
    this.downedTimerValEl = document.getElementById('downed-timer-val');
    this.giveupBarFillEl = document.getElementById('giveup-bar-fill');

    this.ticketsUsEl = document.getElementById('tickets-us');
    this.ticketsRuEl = document.getElementById('tickets-ru');
    this.ticketRateUsEl = document.getElementById('ticket-rate-us');
    this.ticketRateRuEl = document.getElementById('ticket-rate-ru');
    this.ticketEventFeedEl = document.getElementById('ticket-event-feed');
    this.matchClockEl = document.getElementById('match-clock');
    this.matchLeadTextEl = document.getElementById('match-lead-text');
    this.momentumBarUsEl = document.getElementById('momentum-bar-us');
    this.compassHeadingEl = document.getElementById('compass-heading');

    this.captureStatusEl = document.getElementById('capture-status');
    this.captureTitleEl = document.getElementById('capture-title');
    this.captureBarEl = document.getElementById('capture-progress-bar');

    this.hitmarkerEl = document.getElementById('hitmarker');
    this.hitConfirmTagEl = document.getElementById('hit-confirm-tag');
    this.crosshairEl = document.getElementById('crosshair');
    this.interactPromptEl = document.getElementById('interact-prompt');
    this.xpFeedEl = document.getElementById('xp-feed');
    this.killfeedEl = document.getElementById('killfeed');

    this.squadHeaderTitleEl = document.getElementById('squad-header-title');
    this.squadListBodyEl = document.getElementById('squad-list-body');
    this.vehicleVitalsRowEl = document.getElementById('vehicle-vitals-row');
    this.vehHullTagEl = document.getElementById('veh-hull-tag');
    this.vehHullFillEl = document.getElementById('veh-hull-bar-fill');
    this.vehHullValEl = document.getElementById('veh-hull-value');
    this.crewHpLabelEl = document.getElementById('crew-hp-label');
    this.hpFillEl = document.getElementById('hp-bar-fill');
    this.hpValEl = document.getElementById('hp-value');
    this.bleedBadgeEl = document.getElementById('bleed-badge');
    this.armorBadgeEl = document.getElementById('armor-badge');
    this.stanceBadgeEl = document.getElementById('stance-badge');
    this.bandageBadgeEl = document.getElementById('bandage-count-badge');
    this.grenadeBadgeEl = document.getElementById('grenade-count-badge');

    this.damageIndicatorRingEl = document.getElementById('damage-indicator-ring');
    this.damageIndicators = [];

    this.telemetryPanelEl = document.getElementById('telemetry-panel');
    this.telemSummaryGridEl = document.getElementById('telemetry-summary-grid');
    this.telemVehiclesListEl = document.getElementById('telemetry-vehicles-list');
    this.telemEventsListEl = document.getElementById('telemetry-events-list');
    this.telemetry = null;

    this.actionProgressEl = document.getElementById('action-progress');
    this.actionLabelEl = document.getElementById('action-label');
    this.actionFillEl = document.getElementById('action-bar-fill');

    this.weaponNameEl = document.getElementById('weapon-name');
    this.ammoClipEl = document.getElementById('ammo-clip');
    this.ammoReserveEl = document.getElementById('ammo-reserve');
    this.magBarsRowEl = document.getElementById('mag-bars-row');
    this.fireModeEl = document.getElementById('fire-mode');
    this.zeroBadgeEl = document.getElementById('zero-badge');
    this.cantedBadgeEl = document.getElementById('canted-badge');
    this.blueprintBadgeEl = document.getElementById('blueprint-badge');

    this.scoreboardEl = document.getElementById('scoreboard');
    this.sbClockPillEl = document.getElementById('sb-clock-pill');
    this.sbSideCompEl = document.getElementById('sb-side-comparison');
    this.sbSquadGridEl = document.getElementById('sb-squad-leaderboard');
    this.sbUsHeaderEl = document.getElementById('sb-us-header');
    this.sbRuHeaderEl = document.getElementById('sb-ru-header');
    this.sbUsBody = document.getElementById('sb-us-body');
    this.sbRuBody = document.getElementById('sb-ru-body');

    this.victoryScreenEl = document.getElementById('victory-screen');
    this.victoryReasonTagEl = document.getElementById('victory-reason-tag');
    this.victoryTitleEl = document.getElementById('victory-title');
    this.victoryScorelineEl = document.getElementById('victory-scoreline');
    this.victorySideSummaryEl = document.getElementById('victory-side-summary');
    this.victorySquadSummaryEl = document.getElementById('victory-squad-summary');
    this.victoryMvpCardsEl = document.getElementById('victory-mvp-cards');

    this.netLabelEl = document.getElementById('net-label');

    this.minimapCanvas = document.getElementById('minimap-canvas');
    this.minimapCtx = this.minimapCanvas.getContext('2d');

    this.deployMapCanvas = document.getElementById('deploy-map-canvas');
    this.deployMapCtx = this.deployMapCanvas.getContext('2d');

    this.bindDeployEvents();
  }

  bindDeployEvents() {
    const classBtns = document.querySelectorAll('.class-btn');
    classBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        classBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedClass = btn.dataset.class;
      });
    });

    const teamBtns = document.querySelectorAll('.team-btn');
    teamBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        teamBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedTeam = btn.dataset.team;
      });
    });

    const rankBtns = document.querySelectorAll('.rank-btn');
    rankBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        rankBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedRank = btn.dataset.rank || 'COMMANDER';
      });
    });

    const squadBtns = document.querySelectorAll('.squad-btn');
    squadBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        squadBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedSquad = btn.dataset.squad;
      });
    });

    const nextRoundBtn = document.getElementById('next-round-btn');
    if (nextRoundBtn) {
      nextRoundBtn.addEventListener('click', () => {
        if (this.onPlayNextRound) this.onPlayNextRound();
      });
    }

    const atmosBtns = document.querySelectorAll('.atmos-btn');
    atmosBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        atmosBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedAtmos = btn.dataset.atmos;
        if (this.onAtmosphereChange) {
          this.onAtmosphereChange(this.selectedAtmos);
        }
      });
    });

    const spawnBtns = document.querySelectorAll('.spawn-btn');
    spawnBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.classList.contains('locked-spawn')) return;
        const sp = btn.dataset.spawn;
        if (sp !== 'BASE' && sp !== 'SQUAD' && sp !== 'RALLY' && sp !== 'BEACON') {
          const flag = this.world.flags.find((f) => f.id === sp);
          if (flag && flag.owner !== this.selectedTeam) {
            return; // Cannot select unowned forward base
          }
        }
        spawnBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedSpawn = sp;
      });
      btn.addEventListener('dblclick', () => {
        this.triggerDeploy();
      });
    });

    this.deployMapCanvas.addEventListener('click', (e) => {
      const rect = this.deployMapCanvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const wx = (cx / this.deployMapCanvas.width - 0.5) * 720;
      const wz = (cy / this.deployMapCanvas.height - 0.5) * 440;

      let bestKey = 'BASE';
      const basePos =
        this.selectedTeam === 'US' ? this.world.spawns.US_BASE : this.world.spawns.RU_BASE;
      let bestDist = Math.hypot(wx - basePos.x, wz - basePos.z);

      for (const f of this.world.flags) {
        if (f.owner !== this.selectedTeam) continue;
        const d = Math.hypot(wx - f.pos.x, wz - f.pos.z);
        if (d < bestDist) {
          bestDist = d;
          bestKey = f.id;
        }
      }

      this.selectedSpawn = bestKey;
      spawnBtns.forEach((b) => {
        b.classList.toggle('active', b.dataset.spawn === bestKey);
      });
    });

    this.deployMapCanvas.addEventListener('dblclick', () => {
      this.triggerDeploy();
    });

    const deployBtn = document.getElementById('deploy-btn');
    if (deployBtn) {
      deployBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.triggerDeploy();
      });
    }
    const deployTopBtn = document.getElementById('deploy-top-btn');
    if (deployTopBtn) {
      deployTopBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.triggerDeploy();
      });
    }

    // Game Mode Selector (Singleplayer vs. Multiplayer) & Lobby Controls
    const modeSpBtn = document.getElementById('mode-btn-sp');
    const modeMpBtn = document.getElementById('mode-btn-mp');
    const botScaleBtns = document.querySelectorAll('.bot-scale-btn');
    const mpBotSelect = document.getElementById('mp-bot-mode-select');
    const mpOpenCoopBtn = document.getElementById('mp-open-coop-btn');
    const callsignInput = document.getElementById('mp-callsign-input');
    const roomInput = document.getElementById('mp-room-input');
    const mpJoinBtn = document.getElementById('mp-join-btn');
    const mpCopyBtn = document.getElementById('mp-copy-invite-btn');
    const netIndBtn = document.getElementById('net-indicator-btn');

    if (modeSpBtn && this.network) {
      modeSpBtn.addEventListener('click', () => {
        this.network.setGameMode('SINGLEPLAYER');
        this.updateMultiplayerLobbyUI();
        this.addXpNotification(0, '🎮 MODE: SINGLEPLAYER CAMPAIGN (OFFLINE SOLO + AI)');
      });
    }
    if (modeMpBtn && this.network) {
      modeMpBtn.addEventListener('click', () => {
        this.network.setGameMode('MULTIPLAYER');
        this.updateMultiplayerLobbyUI();
        this.addXpNotification(0, `🌐 MODE: MULTIPLAYER SERVER (ROOM ${this.network.roomCode})`);
      });
    }
    botScaleBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const bMode = btn.dataset.bots || 'FULL_AI';
        if (this.network) {
          this.network.setBotPopulateMode(bMode);
        }
        this.updateMultiplayerLobbyUI();
      });
    });
    if (mpBotSelect && this.network) {
      mpBotSelect.value = this.network.botPopulateMode;
      mpBotSelect.addEventListener('change', () => {
        this.network.setBotPopulateMode(mpBotSelect.value);
        this.updateMultiplayerLobbyUI();
      });
    }
    if (mpOpenCoopBtn && this.network) {
      mpOpenCoopBtn.addEventListener('click', () => {
        this.network.openCoopTestWindow();
        this.updateMultiplayerLobbyUI();
      });
    }

    if (callsignInput && this.network) {
      callsignInput.value = this.network.callsign;
      callsignInput.addEventListener('change', () => {
        this.network.setCallsign(callsignInput.value);
        this.updateMultiplayerLobbyUI();
      });
    }
    if (roomInput && this.network) {
      roomInput.value = this.network.roomCode;
    }
    if (mpJoinBtn && this.network) {
      mpJoinBtn.addEventListener('click', () => {
        this.network.setGameMode('MULTIPLAYER');
        if (callsignInput) this.network.setCallsign(callsignInput.value);
        if (roomInput) this.network.setRoom(roomInput.value);
        if (mpBotSelect) this.network.setBotPopulateMode(mpBotSelect.value);
        this.updateMultiplayerLobbyUI();
        this.addXpNotification(0, `🌐 JOINED MULTIPLAYER ROOM: ${this.network.roomCode}`);
      });
    }
    if (mpCopyBtn && this.network) {
      mpCopyBtn.addEventListener('click', () => {
        this.network.setGameMode('MULTIPLAYER');
        if (callsignInput) this.network.setCallsign(callsignInput.value);
        if (roomInput) this.network.setRoom(roomInput.value);
        const inviteUrl = this.network.getShareUrl(true);
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(inviteUrl).catch(() => {});
        }
        mpCopyBtn.textContent = '✅ LINK COPIED!';
        setTimeout(() => {
          mpCopyBtn.textContent = '📋 COPY INVITE LINK';
        }, 2000);
        this.updateMultiplayerLobbyUI();
      });
    }
    if (netIndBtn) {
      netIndBtn.addEventListener('click', () => {
        this.toggleMultiplayerModal();
      });
    }

    // Squad & Force Commander HUD Order Panel Controls
    const scopeAllBtn = document.getElementById('cmd-scope-all');
    const scopeSquadBtn = document.getElementById('cmd-scope-squad');
    const openCmdModalBtn = document.getElementById('cmd-open-modal-btn');
    const cmdOpenWheelBtn = document.getElementById('cmd-open-wheel-btn');
    const cmdPanelMapBtn = document.getElementById('cmd-panel-map-btn');
    const cmdOrderBtns = document.querySelectorAll('.cmd-order-btn');
    const topFlagBadges = document.querySelectorAll('#flags-hud .flag-badge');

    if (scopeAllBtn) {
      scopeAllBtn.addEventListener('click', () => {
        this.setCommandScope('ALL');
      });
    }
    if (scopeSquadBtn) {
      scopeSquadBtn.addEventListener('click', () => {
        this.setCommandScope('SQUAD');
      });
    }
    if (openCmdModalBtn) {
      openCmdModalBtn.addEventListener('click', () => {
        this.toggleCommandModal();
      });
    }
    if (cmdPanelMapBtn) {
      cmdPanelMapBtn.addEventListener('click', () => {
        this.toggleCommandModal();
      });
    }
    if (cmdOpenWheelBtn) {
      cmdOpenWheelBtn.addEventListener('click', () => {
        const existing = document.getElementById('commo-rose');
        if (existing) this.closeCommoRose();
        else this.openCommoRose();
      });
    }
    if (this.hudMapCmdBarEl) {
      this.hudMapCmdBarEl.addEventListener('click', () => {
        this.toggleCommandModal();
      });
    }
    cmdOrderBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action || 'OBJECTIVE';
        const flagId = btn.dataset.flag || null;
        this.pendingDeployOrder = { action, flagId };
        this.issueHudStrategicOrder({ action, flagId });
      });
    });
    const cmdSpacingBtns = document.querySelectorAll('.cmd-spacing-btn');
    cmdSpacingBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const spacingMode = btn.dataset.spacing || 'FAN_OUT';
        this.issueHudFormationSpacing(spacingMode);
      });
    });
    const hudUavBtn = document.getElementById('hud-uav-btn');
    if (hudUavBtn) {
      hudUavBtn.addEventListener('click', () => {
        this.player.activateUAV();
        this.updateCommandOrderHud();
      });
    }
    const hudAirstrikeBtn = document.getElementById('hud-airstrike-btn');
    if (hudAirstrikeBtn) {
      hudAirstrikeBtn.addEventListener('click', () => {
        this.player.callAirstrike();
        this.updateCommandOrderHud();
      });
    }
    const hudStrikePatternBtn = document.getElementById('hud-strike-pattern-btn');
    if (hudStrikePatternBtn) {
      hudStrikePatternBtn.addEventListener('click', () => {
        this.player.cycleAirstrikePattern();
        this.updateCommandOrderHud();
      });
    }
    topFlagBadges.forEach((badge) => {
      badge.addEventListener('click', () => {
        const flagId = badge.dataset.flag;
        if (flagId) {
          this.issueHudStrategicOrder({ action: 'OBJECTIVE', flagId });
        }
      });
    });
    if (this.hudFpsToggleEl) {
      this.hudFpsToggleEl.addEventListener('click', () => {
        this.toggleFpsCounter();
      });
    }
    if (this.deployFpsToggleBtn) {
      this.deployFpsToggleBtn.addEventListener('click', () => {
        this.toggleFpsCounter();
      });
    }
    if (this.fpsPillEl) {
      this.fpsPillEl.addEventListener('click', () => {
        this.toggleFpsCounter();
      });
    }
    if (this.hudCashBtnEl) {
      this.hudCashBtnEl.addEventListener('click', () => {
        this.toggleGunsmithModal();
      });
    }
    if (this.ammoGunsmithBtnEl) {
      this.ammoGunsmithBtnEl.addEventListener('click', () => {
        this.toggleGunsmithModal();
      });
    }
    if (this.deployGunsmithBtnEl) {
      this.deployGunsmithBtnEl.addEventListener('click', () => {
        this.toggleGunsmithModal();
      });
    }
    this.updateCashAndGunsmithHud();

    if (this.network) {
      this.network.onLobbyUpdated = () => {
        this.updateMultiplayerLobbyUI();
      };
      setTimeout(() => this.updateMultiplayerLobbyUI(), 200);
    }

    window.addEventListener('keydown', (e) => {
      const tag = document.activeElement ? document.activeElement.tagName : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        if (e.code === 'Escape') {
          document.activeElement.blur();
        }
        return;
      }

      if (e.code === 'F2') {
        e.preventDefault();
        this.toggleFpsCounter();
        return;
      }

      if (e.code === 'KeyI') {
        e.preventDefault();
        this.toggleGunsmithModal();
        return;
      }
      if (e.code === 'KeyO') {
        e.preventDefault();
        this.toggleMultiplayerModal();
        return;
      }
      if (e.code === 'KeyK' || e.code === 'CapsLock') {
        e.preventDefault();
        this.toggleCommandModal();
        return;
      }

      // If [Y] Commander Radial Wheel (#commo-rose) is open, allow pressing 1-8 or -/+ to execute order immediately
      const activeWheel = document.getElementById('commo-rose');
      if (activeWheel) {
        const wheelMap = {
          Digit1: { action: 'OBJECTIVE', flagId: 'A' },
          Numpad1: { action: 'OBJECTIVE', flagId: 'A' },
          Digit2: { action: 'OBJECTIVE', flagId: 'B' },
          Numpad2: { action: 'OBJECTIVE', flagId: 'B' },
          Digit3: { action: 'OBJECTIVE', flagId: 'C' },
          Numpad3: { action: 'OBJECTIVE', flagId: 'C' },
          Digit4: { action: 'OBJECTIVE', flagId: 'D' },
          Numpad4: { action: 'OBJECTIVE', flagId: 'D' },
          Digit5: { action: 'OBJECTIVE', flagId: 'E' },
          Numpad5: { action: 'OBJECTIVE', flagId: 'E' },
          Digit6: { action: 'FOLLOW' },
          Numpad6: { action: 'FOLLOW' },
          Digit7: { action: 'HOLD' },
          Numpad7: { action: 'HOLD' },
          Digit8: { action: 'TOGGLE_SCOPE' },
          Numpad8: { action: 'TOGGLE_SCOPE' },
          NumpadSubtract: { action: 'SPACING', spacingMode: 'STAY_CLOSE' },
          Minus: { action: 'SPACING', spacingMode: 'STAY_CLOSE' },
          NumpadAdd: { action: 'SPACING', spacingMode: 'FAN_OUT' },
          Equal: { action: 'SPACING', spacingMode: 'FAN_OUT' }
        };
        if (wheelMap[e.code]) {
          e.preventDefault();
          const ord = wheelMap[e.code];
          if (ord.action === 'TOGGLE_SCOPE') {
            this.setCommandScope(this.player.commandScope === 'ALL' ? 'SQUAD' : 'ALL');
            this.openCommoRose();
          } else if (ord.action === 'SPACING') {
            this.issueHudFormationSpacing(ord.spacingMode);
            this.closeCommoRose();
          } else {
            this.issueHudStrategicOrder(ord);
            this.closeCommoRose();
          }
          return;
        }
      }

      // Formation Spacing Hotkeys: [Num -] / [-] = STAY CLOSE, [Num +] / [+] = FAN OUT
      if (e.code === 'NumpadSubtract' || e.code === 'Minus') {
        e.preventDefault();
        this.issueHudFormationSpacing('STAY_CLOSE');
        return;
      }
      if (e.code === 'NumpadAdd' || e.code === 'Equal') {
        e.preventDefault();
        this.issueHudFormationSpacing('FAN_OUT');
        return;
      }

      // Direct Commander & Squad Leader Order Hotkeys (Alt+1..5, Alt+F Follow, Alt+H/D Defend Here, Alt+A Auto, Alt+0 Scope, or Numpad 1..8)
      if (
        (e.altKey && ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].includes(e.code)) ||
        ['Numpad1', 'Numpad2', 'Numpad3', 'Numpad4', 'Numpad5'].includes(e.code)
      ) {
        e.preventDefault();
        const flagMap = {
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
        this.issueHudStrategicOrder({ action: 'OBJECTIVE', flagId: flagMap[e.code] });
        return;
      }
      if ((e.altKey && e.code === 'KeyF') || e.code === 'Numpad6') {
        e.preventDefault();
        this.issueHudStrategicOrder({ action: 'FOLLOW' });
        return;
      }
      if ((e.altKey && (e.code === 'KeyH' || e.code === 'KeyD')) || e.code === 'Numpad7') {
        e.preventDefault();
        this.issueHudStrategicOrder({ action: 'HOLD' });
        return;
      }
      if ((e.altKey && e.code === 'KeyA') || e.code === 'Numpad8') {
        e.preventDefault();
        this.issueHudStrategicOrder({ action: 'AUTO' });
        return;
      }
      if ((e.altKey && e.code === 'Digit0') || e.code === 'Numpad0') {
        e.preventDefault();
        this.setCommandScope(this.player.commandScope === 'ALL' ? 'SQUAD' : 'ALL');
        const nextScopeLabel =
          this.player.commandScope === 'ALL' ? '★ ALL 5 SQUADS (40 NPCs)' : `▲ ${this.player.squad || 'ALPHA'} SQUAD (8 NPCs)`;
        this.addXpNotification(0, `COMMAND SCOPE: ${nextScopeLabel}`);
        return;
      }
      if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') {
        const deployVisible =
          this.deployScreenEl && !this.deployScreenEl.classList.contains('hidden');
        const victoryVisible =
          this.victoryScreenEl && !this.victoryScreenEl.classList.contains('hidden');
        if (victoryVisible && this.onPlayNextRound) {
          e.preventDefault();
          this.onPlayNextRound();
          return;
        }
        if (deployVisible) {
          e.preventDefault();
          this.triggerDeploy();
          return;
        }
      }
      if (e.code === 'KeyL') {
        const modes = ['DAY', 'SUNSET', 'NIGHT'];
        const nextIdx = (modes.indexOf(this.selectedAtmos) + 1) % modes.length;
        this.selectedAtmos = modes[nextIdx];
        atmosBtns.forEach((b) => {
          b.classList.toggle('active', b.dataset.atmos === this.selectedAtmos);
        });
        if (this.onAtmosphereChange) {
          this.onAtmosphereChange(this.selectedAtmos);
        }
        this.addXpNotification(0, `TIME OF DAY: ${this.selectedAtmos}`);
      }
      if (e.code === 'KeyM' && !this.player.dead) {
        this.player.dead = true;
        this.player.downed = false;
        if (this.player.activeVehicle) {
          this.player.activeVehicle.driver = null;
          this.player.activeVehicle = null;
        }
        if (document.pointerLockElement === document.body) {
          document.exitPointerLock();
        }
        this.showDeployScreen();
      }
      if (e.code === 'Tab') {
        e.preventDefault();
        this.scoreboardEl.classList.remove('hidden');
        this.renderScoreboard();
      }
      if (e.code === 'F3') {
        e.preventDefault();
        if (this.telemetryPanelEl) {
          this.telemetryPanelEl.classList.toggle('hidden');
          this.updateTelemetryPanel();
        }
      }
      // [F1] Controls Reference Overlay
      if (e.code === 'F1') {
        e.preventDefault();
        this.toggleControlsOverlay();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Tab') {
        this.scoreboardEl.classList.add('hidden');
      }
    });
  }

  toggleFpsCounter(forceState) {
    this.showFps = typeof forceState === 'boolean' ? forceState : !this.showFps;
    if (this.fpsPillEl) {
      this.fpsPillEl.classList.toggle('hidden', !this.showFps);
    }
    if (this.hudFpsToggleEl) {
      this.hudFpsToggleEl.textContent = `[F2] Show FPS: ${this.showFps ? 'ON' : 'OFF'}`;
      this.hudFpsToggleEl.style.color = this.showFps ? '#2ecc71' : '#7bed9f';
    }
    if (this.deployFpsToggleBtn) {
      this.deployFpsToggleBtn.textContent = `⏱ [F2] SHOW FPS: ${this.showFps ? 'ON' : 'OFF'}`;
      this.deployFpsToggleBtn.classList.toggle('active', this.showFps);
    }
    if (!this.player.dead) {
      this.addXpNotification(0, `⏱ FPS COUNTER: ${this.showFps ? 'ON' : 'OFF'}`);
    }
    return this.showFps;
  }

  updateFpsMetrics(rawDt) {
    const clampedDt = Math.max(0.001, Math.min(0.25, rawDt || 0.0167));
    const instFps = 1.0 / clampedDt;
    const instMs = clampedDt * 1000;
    this.fpsSmoothed = this.fpsSmoothed * 0.9 + instFps * 0.1;
    this.frameMsSmoothed = this.frameMsSmoothed * 0.9 + instMs * 0.1;
    this.frameHistory.push(instFps);
    if (this.frameHistory.length > 60) {
      this.frameHistory.shift();
    }

    if (!this.showFps || !this.fpsPillEl) return;
    this.fpsUiTimer -= clampedDt;
    if (this.fpsUiTimer > 0) return;
    this.fpsUiTimer = 0.15;

    const avgFps = Math.round(this.fpsSmoothed);
    const msStr = `${this.frameMsSmoothed.toFixed(1)} ms`;
    const sorted = [...this.frameHistory].sort((a, b) => a - b);
    const lowFps = Math.round(sorted[Math.max(0, Math.floor(sorted.length * 0.1))] || avgFps);

    if (this.fpsValEl) this.fpsValEl.textContent = String(avgFps);
    if (this.fpsMsValEl) this.fpsMsValEl.textContent = msStr;
    if (this.fpsLowValEl) this.fpsLowValEl.textContent = `LOW: ${lowFps}`;

    this.fpsPillEl.classList.toggle('fps-warn', avgFps >= 30 && avgFps < 50);
    this.fpsPillEl.classList.toggle('fps-low', avgFps < 30);
  }

  // ─── GUNSMITH & TACTICAL ARMORY SHOP ([I] Key or HUD / Deploy Button) ──
  updateCashAndGunsmithHud() {
    const cash = this.player && typeof this.player.cash === 'number' ? this.player.cash : 600;
    const cashStr = `$${cash.toLocaleString()}`;
    if (this.hudCashValEl) this.hudCashValEl.textContent = cashStr;
    if (this.deployCashValEl) this.deployCashValEl.textContent = cashStr;
    if (this.ammoGunsmithBtnEl) {
      this.ammoGunsmithBtnEl.textContent = `🔧 [I] GUNSMITH (💰 ${cashStr})`;
    }
    const modal = document.getElementById('gunsmith-modal');
    if (modal && !modal.classList.contains('hidden')) {
      this.renderGunsmithModalContent(modal);
    }
  }

  toggleGunsmithModal(forceState) {
    let modal = document.getElementById('gunsmith-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'gunsmith-modal';
      modal.className = 'hidden';
      modal.style.cssText = `
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
        width: 900px; max-width: 96vw; max-height: 90vh; overflow-y: auto;
        background: rgba(11, 18, 25, 0.98); border: 2px solid #f1c40f;
        border-radius: 8px; padding: 16px 20px; z-index: 10025;
        font-family: 'Rajdhani', 'Segoe UI', sans-serif; color: #ecf0f1;
        box-shadow: 0 18px 60px rgba(0, 0, 0, 0.92); pointer-events: auto;
      `;
      document.body.appendChild(modal);
    }

    const willShow =
      typeof forceState === 'boolean' ? forceState : modal.classList.contains('hidden');
    if (willShow) {
      if (document.pointerLockElement === document.body) {
        document.exitPointerLock();
      }
      modal.classList.remove('hidden');
      this.renderGunsmithModalContent(modal);
    } else {
      modal.classList.add('hidden');
      if (
        !this.player.dead &&
        this.deployScreenEl &&
        this.deployScreenEl.classList.contains('hidden')
      ) {
        document.body.requestPointerLock();
      }
    }
  }

  renderGunsmithModalContent(modal) {
    const cash = this.player.cash || 0;
    const eq = this.player.equippedUpgrades || {};
    const owned = this.player.ownedUpgrades || {};

    const categories = [
      {
        key: 'muzzle',
        title: '1. MUZZLE & BARREL ATTACHMENTS (FLASH HIDER / SILENCER)',
        sub: 'Eliminates ADS muzzle flash, muffles gunshot report, hides tracers & stabilizes recoil',
        items: ATTACHMENT_CATALOG.muzzle || []
      },
      {
        key: 'magazine',
        title: '2. MAGAZINE & AMMUNITION CAPACITY UPGRADES',
        sub: 'Extends clip capacity (+50% Extended Mag or 2x 60-Round Casket/Drum Mag) & spare magazines',
        items: ATTACHMENT_CATALOG.magazine || []
      },
      {
        key: 'optic',
        title: '3. OPTICS, HOLOGRAPHICS & MAGNIFIED SCOPES',
        sub: 'Customizes primary ADS reticle, magnification FOV & [V] 45° Canted Red Dot backup sight',
        items: ATTACHMENT_CATALOG.optic || []
      },
      {
        key: 'grip',
        title: '4. UNDERBARREL GRIPS & LASER / MATCH TRIGGER',
        sub: 'Reduces vertical recoil kick, tightens hipfire/ADS spread & boosts cyclic RPM',
        items: ATTACHMENT_CATALOG.grip || []
      },
      {
        key: 'vest',
        title: '5. TACTICAL BODY ARMOR VESTS & RIG CARRIERS',
        sub: 'Upgrades Armor HP (50 → 100 → 150), bullet damage absorption & medical/frag pouches',
        items: ATTACHMENT_CATALOG.vest || []
      }
    ];

    const renderCategoryHtml = (cat) => {
      const cardsHtml = cat.items
        .map((item) => {
          const isEquipped = eq[cat.key] === item.id;
          const isOwned = Boolean(owned[cat.key] && owned[cat.key].includes(item.id)) || item.price === 0;
          const canAfford = cash >= item.price;

          const borderCol = isEquipped
            ? '#2ecc71'
            : isOwned
            ? 'rgba(52, 152, 219, 0.7)'
            : canAfford
            ? 'rgba(241, 196, 15, 0.55)'
            : 'rgba(255, 255, 255, 0.14)';
          const bgCol = isEquipped
            ? 'rgba(46, 204, 113, 0.18)'
            : isOwned
            ? 'rgba(41, 128, 185, 0.14)'
            : 'rgba(18, 28, 38, 0.9)';

          let btnText = '';
          let btnBg = '';
          if (isEquipped) {
            btnText = '✓ EQUIPPED ON LOADOUT';
            btnBg = '#27ae60';
          } else if (isOwned) {
            btnText = 'EQUIP ATTACHMENT';
            btnBg = '#2980b9';
          } else if (canAfford) {
            btnText = `BUY & EQUIP ($${item.price})`;
            btnBg = '#f39c12';
          } else {
            btnText = `NEED $${item.price} (SHORT $${item.price - cash})`;
            btnBg = '#4b5563';
          }

          return `
            <div style="background:${bgCol};border:1.5px solid ${borderCol};border-radius:6px;padding:9px 11px;display:flex;flex-direction:column;justify-content:space-between;gap:6px;">
              <div>
                <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
                  <span style="font-size:12.5px;font-weight:900;color:${isEquipped ? '#7bed9f' : '#fff'};">${item.name}</span>
                  <span style="font-size:11px;font-weight:900;color:${item.price === 0 ? '#95a5a6' : isOwned ? '#74b9ff' : '#f1c40f'};">${
            item.price === 0 ? 'STOCK ($0)' : isOwned ? 'OWNED' : `$${item.price}`
          }</span>
                </div>
                <div style="font-size:10.5px;color:#bdc3c7;margin-top:3px;line-height:1.35;">${item.desc}</div>
              </div>
              <button type="button" class="gunsmith-item-btn" data-cat="${cat.key}" data-id="${item.id}" style="background:${btnBg};color:${
            !isEquipped && !isOwned && canAfford ? '#111' : '#fff'
          };border:none;border-radius:4px;padding:5px 8px;font-size:10.5px;font-weight:900;cursor:pointer;letter-spacing:0.5px;">
                ${btnText}
              </button>
            </div>
          `;
        })
        .join('');

      return `
        <div style="margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;">
            <span style="font-size:12px;font-weight:900;color:#f1c40f;letter-spacing:0.8px;">${cat.title}</span>
            <span style="font-size:10px;color:#95a5a6;">${cat.sub}</span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(210px, 1fr));gap:8px;">
            ${cardsHtml}
          </div>
        </div>
      `;
    };

    const curWep = this.player.currentWeapon ? this.player.currentWeapon() : null;
    const wepSummary = curWep
      ? `${curWep.def.name} • CLIP: ${curWep.def.clipSize} RDS • FLASH: ${Math.round(
          (curWep.def.flashMult !== undefined ? curWep.def.flashMult : 1) * 100
        )}% • ARMOR: ${Math.ceil(this.player.armor)}/${this.player.maxArmor || 50}`
      : `ARMOR: ${Math.ceil(this.player.armor)}/${this.player.maxArmor || 50}`;

    modal.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.14);padding-bottom:10px;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
        <div>
          <div style="font-size:19px;font-weight:900;color:#f1c40f;letter-spacing:1.2px;">🔧 GUNSMITH &amp; TACTICAL ARMORY SHOP [I]</div>
          <div style="font-size:11px;color:#bdc3c7;">Earn Combat Cash ($) from Kills (+$110), Revives (+$220), Captures (+$220) &amp; Armor Kills (+$275) — Upgrades apply immediately!</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="background:rgba(241,196,15,0.16);border:1.5px solid #f1c40f;border-radius:5px;padding:5px 12px;font-size:15px;font-weight:900;color:#f1c40f;">
            💰 FUNDS: <span id="gs-modal-cash">$${cash.toLocaleString()}</span>
          </div>
          <button id="gs-grant-cash-btn" type="button" style="background:#27ae60;color:#fff;border:none;border-radius:4px;padding:6px 10px;font-size:11px;font-weight:900;cursor:pointer;" title="Instant Combat Supply Grant for testing any weapon attachment or armor vest!">💵 +$500 SUPPLY GRANT</button>
          <button id="gs-close-btn" type="button" style="background:#e74c3c;color:#fff;border:none;border-radius:4px;padding:6px 12px;font-size:11px;font-weight:900;cursor:pointer;">✕ CLOSE [I]</button>
        </div>
      </div>

      <div style="background:rgba(22,34,46,0.9);border:1px solid rgba(46,204,113,0.4);border-radius:5px;padding:6px 12px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;font-size:11.5px;">
        <span>🔫 <b>ACTIVE LOADOUT PREVIEW:</b> <strong style="color:#7bed9f;">${wepSummary}</strong></span>
        <span style="color:#74b9ff;font-size:10.5px;">💡 Tip: Equipping <b>Flash Hider</b> cuts ADS flash by 82%; <b>SOCOM Silencer</b> eliminates 100% of muzzle flash &amp; tracers!</span>
      </div>

      ${categories.map(renderCategoryHtml).join('')}
    `;

    const closeBtn = modal.querySelector('#gs-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.toggleGunsmithModal(false));
    }

    const grantBtn = modal.querySelector('#gs-grant-cash-btn');
    if (grantBtn) {
      grantBtn.addEventListener('click', () => {
        this.player.addCash(500, 'COMBAT SUPPLY GRANT');
        this.addXpNotification(0, '💰 +$500 COMBAT FUNDS GRANTED!');
        this.updateCashAndGunsmithHud();
      });
    }

    modal.querySelectorAll('.gunsmith-item-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.cat;
        const itemId = btn.dataset.id;
        const res = this.player.buyOrEquipUpgrade(cat, itemId);
        if (res && res.ok) {
          const actionVerb = res.action === 'BOUGHT' ? 'PURCHASED & EQUIPPED' : 'EQUIPPED';
          this.addXpNotification(0, `🔧 ${actionVerb}: ${res.item.name.toUpperCase()}`);
          this._lastMagSignature = '';
          this.updateCashAndGunsmithHud();
        } else if (res && res.reason === 'INSUFFICIENT_FUNDS') {
          this.addXpNotification(
            0,
            `⚠️ INSUFFICIENT FUNDS FOR ${res.item.name.toUpperCase()} ($${res.item.price}) — CLICK [+$500 SUPPLY GRANT] OR EARN KILLS!`
          );
        }
      });
    });
  }

  // Controls Reference Overlay [F1]
  toggleControlsOverlay() {
    let el = document.getElementById('controls-overlay');
    if (el) {
      el.remove();
      return;
    }
    el = document.createElement('div');
    el.id = 'controls-overlay';
    el.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.92); border: 1px solid rgba(255,255,255,0.15);
      border-radius: 8px; padding: 24px 32px; z-index: 10000;
      font-family: 'Rajdhani', 'Segoe UI', sans-serif; color: #ecf0f1;
      max-width: 560px; font-size: 13px; line-height: 1.65;
      pointer-events: auto; cursor: pointer;
    `;
    el.innerHTML = `
      <div style="font-size:18px;font-weight:800;color:#f1c40f;margin-bottom:12px;letter-spacing:2px">⌨️ CONTROLS REFERENCE</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 24px;">
        <div><b>WASD</b> — Move</div><div><b>Shift</b> — Sprint</div>
        <div><b>Space</b> — Jump / Vault</div><div><b>C / Ctrl</b> — Crouch</div>
        <div><b>Z</b> — Prone</div><div><b>E</b> — Enter/Exit Vehicle • Drag Ally</div>
        <div><b>LMB</b> — Fire</div><div><b>RMB</b> — ADS / Scope</div>
        <div><b>R</b> — Reload (2x = Speed)</div><div><b>H</b> — Self Bandage</div>
        <div><b>G</b> — Frag Grenade</div><div><b>F</b> — Revive/Heal • Ammo • Build Chest Wall</div>
        <div><b>1-4</b> — Weapon Slots</div><div><b>5</b> — Place Rally Point</div>
        <div><b>6</b> — Recon Spawn Beacon</div><div><b>Y (Hold)</b> — Commo Rose</div>
        <div><b>K / CapsLock</b> — Squad &amp; Commander Map</div><div><b>Alt+1..5</b> — Order Take Obj A–E</div>
        <div><b>Num - / -</b> — Formation: Stay Close</div><div><b>Num + / =</b> — Formation: Fan Out</div>
        <div><b>U</b> — UAV Recon Datalink</div><div><b>J / Shift+J</b> — Airstrike / Cycle Mode</div>
        <div><b>V</b> — Canted Sight Toggle</div><div><b>X</b> — Zero Range Cycle</div>
        <div><b>B</b> — Blueprint Cycle</div><div><b>T</b> — Build Fortification</div>
        <div><b>P</b> — Pack Magazines</div><div><b>N</b> — Night Vision (NVG)</div>
        <div><b>L</b> — Atmosphere Cycle</div><div><b>M</b> — Redeploy</div>
        <div><b>MMB</b> — Tactical Ping</div><div><b>Tab</b> — Scoreboard</div>
        <div><b>F1</b> — This Help</div><div><b>F3</b> — Telemetry Panel</div>
      </div>
      <div style="margin-top:12px;color:#95a5a6;font-size:11px;text-align:center">Click to close or press [F1] again</div>
    `;
    el.addEventListener('click', () => el.remove());
    document.body.appendChild(el);
  }

  updateMultiplayerLobbyUI() {
    if (!this.network) return;
    const isMp = this.network.isMultiplayer();
    const modeSpBtn = document.getElementById('mode-btn-sp');
    const modeMpBtn = document.getElementById('mode-btn-mp');
    const spBanner = document.getElementById('sp-mode-banner');
    const mpBar = document.getElementById('mp-lobby-bar');
    const mpBotSelect = document.getElementById('mp-bot-mode-select');
    const botScaleBtns = document.querySelectorAll('.bot-scale-btn');

    if (modeSpBtn) modeSpBtn.classList.toggle('active', !isMp);
    if (modeMpBtn) modeMpBtn.classList.toggle('active', isMp);
    if (spBanner) spBanner.classList.toggle('hidden', isMp);
    if (mpBar) mpBar.classList.toggle('hidden', !isMp);
    if (mpBotSelect) mpBotSelect.value = this.network.botPopulateMode;
    botScaleBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.bots === this.network.botPopulateMode);
    });

    const statusEl = document.getElementById('mp-live-status');
    const callsignInput = document.getElementById('mp-callsign-input');
    const roomInput = document.getElementById('mp-room-input');
    if (callsignInput && document.activeElement !== callsignInput) {
      callsignInput.value = this.network.callsign;
    }
    if (roomInput && document.activeElement !== roomInput) {
      roomInput.value = this.network.roomCode;
    }
    const peers = Array.from(this.network.remotePlayers.values());
    const lanUrl = this.network.getShareUrl(true);
    const localUrl = `http://localhost:${this.network.serverPort}/?mode=multiplayer&room=${encodeURIComponent(
      this.network.roomCode
    )}`;
    if (statusEl) {
      const peerNames =
        peers.length > 0
          ? ` &bull; <span style="color:#2ecc71">ONLINE (${peers.length + 1}): YOU, ${peers
              .map((p) => `${p.name} [${p.team}]`)
              .join(', ')}</span>`
          : ' &bull; <span style="color:#95a5a6">WAITING FOR PLAYERS TO JOIN LINK</span>';
      statusEl.innerHTML = `🟢 ROOM <strong style="color:#f1c40f">${this.network.roomCode}</strong> &bull; LAN JOIN URL: <code style="color:#74b9ff;background:rgba(0,0,0,0.45);padding:2px 5px;border-radius:2px;">${lanUrl}</code>${peerNames}`;
    }

    const modalBody = document.getElementById('mp-modal-dynamic-body');
    if (modalBody) {
      this.renderMultiplayerModalBody(modalBody, lanUrl, localUrl, peers);
    }
  }

  toggleMultiplayerModal() {
    let modal = document.getElementById('mp-invite-modal');
    if (modal) {
      modal.remove();
      return;
    }
    if (document.pointerLockElement === document.body) {
      document.exitPointerLock();
    }

    modal = document.createElement('div');
    modal.id = 'mp-invite-modal';
    modal.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: 650px; max-width: 95vw; background: rgba(10, 18, 26, 0.96);
      border: 2px solid #2ecc71; border-radius: 8px; padding: 20px 24px;
      z-index: 10001; color: #ecf0f1; font-family: 'Rajdhani', 'Segoe UI', sans-serif;
      box-shadow: 0 12px 40px rgba(0,0,0,0.85); pointer-events: auto;
    `;
    modal.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.12);padding-bottom:10px;margin-bottom:12px;">
        <div>
          <div style="font-size:18px;font-weight:900;color:#2ecc71;letter-spacing:1.5px;">🎮 / 🌐 GAME MODE &amp; MULTIPLAYER SERVER LOBBY [O]</div>
          <div style="font-size:11px;color:#95a5a6;">Switch between Offline Singleplayer and Online/LAN Multiplayer (Co-Op with AI or Pure PvP)!</div>
        </div>
        <button id="mp-modal-close-btn" style="background:#c0392b;color:#fff;border:none;border-radius:4px;padding:4px 10px;font-weight:900;cursor:pointer;">CLOSE [ESC]</button>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
        <button id="mp-modal-mode-sp" style="padding:8px 10px;border-radius:5px;border:1.5px solid #3498db;background:rgba(41,128,185,0.22);color:#fff;font-weight:900;cursor:pointer;font-size:12px;">🎮 SINGLEPLAYER MODE (OFFLINE SOLO + AI)</button>
        <button id="mp-modal-mode-mp" style="padding:8px 10px;border-radius:5px;border:1.5px solid #2ecc71;background:rgba(39,174,96,0.22);color:#fff;font-weight:900;cursor:pointer;font-size:12px;">🌐 MULTIPLAYER MODE (LAN / CO-OP / PVP)</button>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px;">
        <label style="font-size:12px;font-weight:700;">CALLSIGN:
          <input id="mp-modal-callsign" type="text" maxlength="18" value="${this.network.callsign}" style="background:#0d161e;color:#fff;border:1px solid rgba(255,255,255,0.25);padding:5px 8px;border-radius:4px;font-weight:800;width:115px;margin-left:4px;" />
        </label>
        <label style="font-size:12px;font-weight:700;">ROOM:
          <input id="mp-modal-room" type="text" maxlength="20" value="${this.network.roomCode}" style="background:#0d161e;color:#f1c40f;border:1px solid rgba(241,196,15,0.45);padding:5px 8px;border-radius:4px;font-weight:900;width:95px;margin-left:4px;text-transform:uppercase;" />
        </label>
        <label style="font-size:12px;font-weight:700;">AI BOTS:
          <select id="mp-modal-bots" style="background:#0d161e;color:#7bed9f;border:1px solid rgba(46,204,113,0.45);padding:5px 6px;border-radius:4px;font-weight:800;margin-left:4px;">
            <option value="FULL_AI" ${this.network.botPopulateMode === 'FULL_AI' ? 'selected' : ''}>80 AI (40v40 FULL)</option>
            <option value="SQUAD_AI" ${this.network.botPopulateMode === 'SQUAD_AI' ? 'selected' : ''}>32 AI (16v16 SQUAD)</option>
            <option value="NO_AI" ${this.network.botPopulateMode === 'NO_AI' ? 'selected' : ''}>0 AI (PURE PVP)</option>
          </select>
        </label>
        <button id="mp-modal-apply-btn" style="background:#27ae60;color:#fff;border:none;border-radius:4px;padding:6px 12px;font-weight:900;cursor:pointer;">JOIN / APPLY</button>
        <button id="mp-modal-open-2nd-btn" style="background:#f39c12;color:#111;border:none;border-radius:4px;padding:6px 10px;font-weight:900;cursor:pointer;">🪟 OPEN 2ND PLAYER</button>
      </div>
      <div id="mp-modal-dynamic-body"></div>
    `;
    document.body.appendChild(modal);

    document.getElementById('mp-modal-close-btn').addEventListener('click', () => modal.remove());
    document.getElementById('mp-modal-mode-sp').addEventListener('click', () => {
      this.network.setGameMode('SINGLEPLAYER');
      this.updateMultiplayerLobbyUI();
      this.addXpNotification(0, '🎮 SWITCHED TO SINGLEPLAYER MODE (OFFLINE)');
    });
    document.getElementById('mp-modal-mode-mp').addEventListener('click', () => {
      this.network.setGameMode('MULTIPLAYER');
      this.updateMultiplayerLobbyUI();
      this.addXpNotification(0, `🌐 SWITCHED TO MULTIPLAYER MODE (ROOM ${this.network.roomCode})`);
    });
    document.getElementById('mp-modal-open-2nd-btn').addEventListener('click', () => {
      this.network.openCoopTestWindow();
      this.updateMultiplayerLobbyUI();
    });
    document.getElementById('mp-modal-apply-btn').addEventListener('click', () => {
      const cVal = document.getElementById('mp-modal-callsign').value;
      const rVal = document.getElementById('mp-modal-room').value;
      const bVal = document.getElementById('mp-modal-bots').value;
      this.network.setGameMode('MULTIPLAYER', bVal);
      this.network.setCallsign(cVal);
      this.network.setRoom(rVal);
      this.updateMultiplayerLobbyUI();
      this.addXpNotification(0, `🌐 ACTIVE ROOM: ${this.network.roomCode} (${this.network.callsign})`);
    });

    this.updateMultiplayerLobbyUI();
  }

  renderMultiplayerModalBody(container, lanUrl, localUrl, peers) {
    const rooms = this.network.availableRooms || [];
    const roomPillsHtml = rooms
      .map(
        (r) =>
          `<button class="mp-quick-room-btn" data-room="${r.code}" style="background:${
            r.code === this.network.roomCode ? '#2980b9' : 'rgba(255,255,255,0.08)'
          };color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:3px;padding:3px 9px;font-size:11px;font-weight:800;cursor:pointer;">${
            r.code
          } (${r.playerCount} ONLINE)</button>`
      )
      .join(' ');

    const peersRowsHtml =
      peers.length === 0
        ? `<div style="padding:10px;background:rgba(0,0,0,0.35);border-radius:4px;color:#95a5a6;font-size:12px;">No other human players in room <strong>${this.network.roomCode}</strong> yet. Open the Invite URL below in another browser tab, window, or computer on your Wi-Fi/LAN to join immediately!</div>`
        : peers
            .map(
              (p) => `
          <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.06);padding:6px 10px;border-radius:4px;margin-bottom:4px;font-size:12px;">
            <div>
              <strong style="color:${p.team === 'US' ? '#5dade2' : '#ec7063'}">[${p.team}] ${
                p.name
              }</strong>
              <span style="color:#95a5a6;margin-left:6px;">${p.role || 'SOLDIER'} &bull; ${
                p.squad || 'ALPHA'
              } SQUAD &bull; ${Math.round(this.player.pos.distanceTo(p.pos))}m away</span>
            </div>
            <button class="mp-teleport-peer-btn" data-peer="${
              p.id
            }" style="background:#f39c12;color:#000;border:none;border-radius:3px;padding:3px 9px;font-size:11px;font-weight:900;cursor:pointer;">⚡ TELEPORT TO PLAYER</button>
          </div>`
            )
            .join('');

    container.innerHTML = `
      <div style="background:rgba(0,0,0,0.45);border:1px solid rgba(52,152,219,0.35);border-radius:5px;padding:10px 12px;margin-bottom:12px;font-size:12px;">
        <div style="margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <span><strong>LAN / WI-FI INVITE LINK:</strong> <code style="color:#2ecc71;font-size:12.5px;">${lanUrl}</code></span>
          <button id="mp-modal-copy-lan" style="background:#2980b9;color:#fff;border:none;border-radius:3px;padding:3px 9px;font-size:11px;font-weight:800;cursor:pointer;">📋 COPY LAN LINK</button>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <span><strong>SAME PC (NEW TAB/WINDOW):</strong> <code style="color:#74b9ff;font-size:12px;">${localUrl}</code></span>
          <button id="mp-modal-copy-local" style="background:rgba(255,255,255,0.14);color:#fff;border:none;border-radius:3px;padding:3px 9px;font-size:11px;font-weight:800;cursor:pointer;">📋 COPY LOCAL LINK</button>
        </div>
      </div>
      <div style="margin-bottom:10px;">
        <div style="font-size:11px;font-weight:800;color:#bdc3c7;margin-bottom:4px;">ACTIVE SERVER ROOMS (CLICK TO SWITCH):</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">${roomPillsHtml || '<span style="font-size:11px;color:#7f8c8d">FRUGIS-1</span>'}</div>
      </div>
      <div>
        <div style="font-size:11px;font-weight:800;color:#2ecc71;margin-bottom:5px;">CONNECTED HUMAN PLAYERS IN ROOM (${
          peers.length + 1
        }):</div>
        ${peersRowsHtml}
      </div>
    `;

    const copyLanBtn = document.getElementById('mp-modal-copy-lan');
    if (copyLanBtn) {
      copyLanBtn.addEventListener('click', () => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(lanUrl).catch(() => {});
        }
        copyLanBtn.textContent = '✅ COPIED!';
      });
    }
    const copyLocalBtn = document.getElementById('mp-modal-copy-local');
    if (copyLocalBtn) {
      copyLocalBtn.addEventListener('click', () => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(localUrl).catch(() => {});
        }
        copyLocalBtn.textContent = '✅ COPIED!';
      });
    }

    container.querySelectorAll('.mp-quick-room-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const code = btn.dataset.room;
        const rIn = document.getElementById('mp-modal-room');
        if (rIn) rIn.value = code;
        this.network.setRoom(code);
        this.updateMultiplayerLobbyUI();
      });
    });

    container.querySelectorAll('.mp-teleport-peer-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const peer = this.network.remotePlayers.get(btn.dataset.peer);
        if (!peer) return;
        const safe = this.world.findSafeSpawnPoint(peer.pos.x + 2.2, peer.pos.z + 2.2);
        if (this.player.dead) {
          this.selectedTeam = peer.team || this.selectedTeam;
          this.selectedSpawn = 'FRIEND';
          this.triggerDeploy();
        } else {
          this.player.pos.copy(safe);
          this.player.syncCameraTransform();
        }
        this.addXpNotification(0, `⚡ DEPLOYED TO PLAYER: ${peer.name}`);
        const modal = document.getElementById('mp-invite-modal');
        if (modal) modal.remove();
      });
    });
  }

  triggerDeploy() {
    if (this._lastDeployTime && performance.now() - this._lastDeployTime < 250) {
      return;
    }
    // Block deploy while respawn timer is active
    if (this.player.respawnTimer > 0) {
      return;
    }
    this._lastDeployTime = performance.now();
    const activeClassBtn = document.querySelector('.class-btn.active');
    if (activeClassBtn && activeClassBtn.dataset.class) {
      this.selectedClass = activeClassBtn.dataset.class;
    }
    const activeTeamBtn = document.querySelector('.team-btn.active');
    if (activeTeamBtn && activeTeamBtn.dataset.team) {
      this.selectedTeam = activeTeamBtn.dataset.team;
    }
    const activeRankBtn = document.querySelector('.rank-btn.active');
    if (activeRankBtn && activeRankBtn.dataset.rank) {
      this.selectedRank = activeRankBtn.dataset.rank;
    }
    const activeSquadBtn = document.querySelector('.squad-btn.active');
    if (activeSquadBtn && activeSquadBtn.dataset.squad) {
      this.selectedSquad = activeSquadBtn.dataset.squad;
    }
    const activeSpawnBtn = document.querySelector('.spawn-btn.active');
    if (activeSpawnBtn && activeSpawnBtn.dataset.spawn) {
      this.selectedSpawn = activeSpawnBtn.dataset.spawn;
    }
    if (this.onBeforeDeploy) {
      this.onBeforeDeploy();
    }
    let spawnVec =
      this.selectedTeam === 'US'
        ? this.world.spawns.US_BASE.clone()
        : this.world.spawns.RU_BASE.clone();
    let spawnSource = 'MAIN_BASE';

    if (this.selectedSpawn === 'FRIEND') {
      const peers = Array.from(this.network.remotePlayers.values());
      const sameTeamPeer = peers.find((p) => !p.dead && p.team === this.selectedTeam) || peers[0];
      if (sameTeamPeer) {
        spawnVec.set(sameTeamPeer.pos.x + 2.4, 0, sameTeamPeer.pos.z + 2.4);
        spawnSource = `COOP_PLAYER_${sameTeamPeer.name}`;
      }
    } else if (this.selectedSpawn === 'SQUAD') {
      const friendlies = this.botManager.bots.filter(
        (b) => !b.dead && b.team === this.selectedTeam && b.squad === this.selectedSquad
      );
      if (friendlies.length > 0) {
        const mate = friendlies[Math.floor(Math.random() * friendlies.length)];
        spawnVec.copy(mate.pos).addScalar(2.2);
        spawnSource = mate.lastSpawnSource || 'MAIN_BASE';
      }
    } else if (this.selectedSpawn === 'RALLY') {
      // Rally Point spawn (Squad Leader deployed beacon)
      if (this.player.rallyPoint && this.player.rallyPoint.timer > 0) {
        const offsetAngle = Math.random() * Math.PI * 2;
        const dist = 2 + Math.random() * 3;
        spawnVec.set(
          this.player.rallyPoint.pos.x + Math.cos(offsetAngle) * dist,
          0,
          this.player.rallyPoint.pos.z + Math.sin(offsetAngle) * dist
        );
        spawnSource = 'RALLY_POINT';
      }
    } else if (this.selectedSpawn === 'BEACON') {
      // Recon Insertion Beacon spawn (consumes 1 of 2 charges)
      if (this.player.insertionBeacon && this.player.insertionBeacon.spawnsLeft > 0) {
        const offsetAngle = Math.random() * Math.PI * 2;
        const dist = 1.5 + Math.random() * 2;
        spawnVec.set(
          this.player.insertionBeacon.pos.x + Math.cos(offsetAngle) * dist,
          0,
          this.player.insertionBeacon.pos.z + Math.sin(offsetAngle) * dist
        );
        this.player.insertionBeacon.spawnsLeft--;
        if (this.player.insertionBeacon.spawnsLeft <= 0) {
          if (this.player.insertionBeacon.mesh) {
            this.player.scene.remove(this.player.insertionBeacon.mesh);
          }
          this.player.insertionBeacon = null;
        }
        spawnSource = 'INSERTION_BEACON';
      }
    } else if (this.selectedSpawn !== 'BASE') {
      let flag = this.world.flags.find(
        (f) => f.id === this.selectedSpawn && f.owner === this.selectedTeam && !f.contested
      );
      if (!flag) {
        // Enforce strict uncontested occupied-forward-base spawning
        flag =
          this.world.flags.find((f) => f.owner === this.selectedTeam && !f.contested) || null;
      }
      if (flag) {
        const offsetAngle = Math.random() * Math.PI * 2;
        const dist = 7 + Math.random() * 8;
        spawnVec.set(
          flag.pos.x + Math.cos(offsetAngle) * dist,
          0,
          flag.pos.z + Math.sin(offsetAngle) * dist
        );
        spawnSource = `FORWARD_FLAG_${flag.id}`;
      } else {
        const motorPoolX = this.selectedTeam === 'US' ? -294 : 294;
        spawnVec.set(
          motorPoolX + (Math.random() - 0.5) * 10,
          0,
          (Math.random() - 0.5) * 16
        );
        spawnSource = 'MAIN_BASE';
      }
    } else {
      const mainContested = Boolean(
        this.botManager.baseState &&
          this.botManager.baseState[this.selectedTeam] &&
          this.botManager.baseState[this.selectedTeam].contested
      );
      const fallbackFlag = mainContested
        ? this.world.flags.find((f) => f.owner === this.selectedTeam && !f.contested)
        : null;
      if (fallbackFlag) {
        spawnVec.set(fallbackFlag.pos.x + 8, 0, fallbackFlag.pos.z + 8);
        spawnSource = `FORWARD_FLAG_${fallbackFlag.id}`;
      } else {
        const motorPoolX = this.selectedTeam === 'US' ? -294 : 294;
        spawnVec.set(
          motorPoolX + (Math.random() - 0.5) * 10,
          0,
          (Math.random() - 0.5) * 16
        );
        spawnSource = 'MAIN_BASE';
      }
    }
    spawnVec.y = this.world.getGroundHeightAt(spawnVec.x, spawnVec.z);

    const sqDef = SQUAD_DEFS.find((s) => s.id === this.selectedSquad) || SQUAD_DEFS[0];
    this.player.squad = sqDef.id;
    this.player.squadShort = sqDef.short;
    this.player.commandRank = this.selectedRank || 'COMMANDER';
    this.player.commandScope = this.player.commandRank === 'COMMANDER' ? 'ALL' : 'SQUAD';
    this.setCommandScope(this.player.commandScope);
    this.player.deploy(this.selectedTeam, this.selectedClass, spawnVec);
    if (this.pendingDeployOrder && this.pendingDeployOrder.action && this.pendingDeployOrder.action !== 'AUTO') {
      this.issueHudStrategicOrder(this.pendingDeployOrder);
    } else {
      this.updateCommandOrderHud();
    }
    if (this.onPlayerRespawn) {
      this.onPlayerRespawn(this.selectedTeam, this.selectedClass, spawnSource);
    }
    this.deployScreenEl.classList.add('hidden');
    if (this.victoryScreenEl) this.victoryScreenEl.classList.add('hidden');
    if (this.scoreboardEl) this.scoreboardEl.classList.add('hidden');
    this.hudEl.classList.remove('hidden');

    if (this.telemetry) {
      this.telemetry.logEvent('PLAYER_SPAWN', {
        team: this.selectedTeam,
        squad: this.selectedSquad,
        role: this.selectedClass,
        source: spawnSource,
        x: Math.round(spawnVec.x),
        z: Math.round(spawnVec.z)
      });
    }

    this.player.slots.forEach((s, idx) => {
      const el = document.getElementById(`slot-${idx + 1}-name`);
      if (el) el.textContent = s.def.shortName;
    });

    // Squadmate / Command Net greeting over Proximity/Squad Comms upon deployment
    setTimeout(() => {
      if (this.player.dead) return;
      const mate =
        this.botManager.bots.find(
          (b) => !b.dead && b.team === this.player.team && b.squad === this.player.squad && b.isSquadLeader
        ) ||
        this.botManager.bots.find(
          (b) => !b.dead && b.team === this.player.team && b.squad === this.player.squad
        );
      if (mate) {
        const greetMsg =
          this.player.commandRank === 'COMMANDER'
            ? `Force Commander on the ground! All 5 Squads (${this.player.team} ALPHA–ECHO) standing by on Command Net — click [A]–[E] or press [K]!`
            : this.player.commandRank === 'SQUAD_LEADER'
              ? `${this.player.squad} Squad formed up on you, Squad Lead! Click [A]–[E], [K], or hold [Y] to issue squad orders!`
              : `Welcome to ${this.player.squad} Squad! Follow Squad Leader ${mate.name} or take command anytime on the HUD!`;
        this.botManager.emitBotComms(
          mate,
          this.player,
          greetMsg,
          this.player.commandRank === 'COMMANDER' ? 'COMMAND' : 'SQUAD',
          true,
          this.player.commandRank === 'COMMANDER' ? 'CMD NET' : 'SQUAD'
        );
      }
    }, 550);
  }

  setCommandScope(scope) {
    const cleanScope = scope === 'SQUAD' ? 'SQUAD' : 'ALL';
    this.player.commandScope = cleanScope;
    if (cleanScope === 'ALL' && this.player.commandRank === 'MEMBER') {
      this.player.commandRank = 'COMMANDER';
    }
    const allBtn = document.getElementById('cmd-scope-all');
    const sqBtn = document.getElementById('cmd-scope-squad');
    if (allBtn) allBtn.classList.toggle('active', cleanScope === 'ALL');
    if (sqBtn) sqBtn.classList.toggle('active', cleanScope === 'SQUAD');
    this.updateCommandOrderHud();
  }

  issueHudStrategicOrder(opts = {}) {
    if (!this.botManager || typeof this.botManager.issueStrategicOrder !== 'function') return null;
    const scope = opts.scope || this.player.commandScope || 'ALL';
    const targetSquad = opts.targetSquad || this.player.squad || 'ALPHA';
    const action = (opts.action || 'OBJECTIVE').toUpperCase();
    const flagId = opts.flagId || null;

    const res = this.botManager.issueStrategicOrder(this.player, {
      scope,
      targetSquad,
      action,
      flagId
    });
    if (!res) return null;

    const scopeLabel = res.scope === 'ALL' ? `ALL 5 SQUADS (${res.unitsOrdered} NPCs)` : `${targetSquad} SQUAD (${res.unitsOrdered} NPCs)`;
    const orderSummary =
      res.action === 'OBJECTIVE'
        ? `⚔️ ${scopeLabel} -> ATTACK / CAPTURE OBJECTIVE ${res.flagId}!`
        : res.action === 'FOLLOW'
          ? `🏃 ${scopeLabel} -> FOLLOW ME (RALLY ON COMMANDER)!`
          : res.action === 'HOLD'
            ? `🛡️ ${scopeLabel} -> DEFEND HERE (HOLD CURRENT POSITION)!`
            : `🤖 ${scopeLabel} -> AI SQUAD LEADERS AUTONOMOUS`;

    this.addXpNotification(res.action === 'AUTO' ? 0 : 25, orderSummary);
    if (res.action !== 'AUTO') {
      const bannerText =
        res.action === 'OBJECTIVE'
          ? `★ ORDER [${res.scope === 'ALL' ? 'ALL 5 SQUADS' : targetSquad}]: ⚔️ ATTACK OBJ ${res.flagId}!`
          : res.action === 'FOLLOW'
          ? `★ ORDER [${res.scope === 'ALL' ? 'ALL 5 SQUADS' : targetSquad}]: 🏃 FOLLOW ME!`
          : `★ ORDER [${res.scope === 'ALL' ? 'ALL 5 SQUADS' : targetSquad}]: 🛡️ DEFEND HERE!`;
      this.showKillStreakAnnouncement(bannerText);
    }
    this.addTacticalCommsMessage(
      this.network && this.network.callsign ? this.network.callsign : 'YOU',
      res.scope === 'ALL' ? 'CMD' : 'SL',
      res.scope === 'ALL' ? 'COMMAND' : 'SQUAD',
      0,
      orderSummary,
      true
    );
    if (this.network && this.network.isMultiplayer()) {
      this.network.send({
        type: 'order_sync',
        team: this.player.team,
        scope: res.scope,
        targetSquad,
        action: res.action,
        flagId: res.flagId,
        commanderName: this.network.callsign
      });
    }
    this.updateCommandOrderHud();
    const cmdModal = document.getElementById('command-modal');
    if (cmdModal) {
      this.renderCommandModalContent(cmdModal);
    }
    return res;
  }

  issueHudFormationSpacing(spacingMode = 'FAN_OUT', opts = {}) {
    if (!this.botManager || typeof this.botManager.issueFormationSpacing !== 'function') return null;
    const scope = opts.scope || this.player.commandScope || 'ALL';
    const targetSquad = opts.targetSquad || this.player.squad || 'ALPHA';
    const mode = String(spacingMode || 'FAN_OUT').toUpperCase() === 'STAY_CLOSE' ? 'STAY_CLOSE' : 'FAN_OUT';

    const res = this.botManager.issueFormationSpacing(this.player, {
      scope,
      targetSquad,
      spacingMode: mode
    });
    if (!res) return null;

    const scopeLabel =
      res.scope === 'ALL'
        ? `ALL 5 SQUADS (${res.unitsOrdered} NPCs + ARMOR)`
        : `${targetSquad} SQUAD (${res.unitsOrdered} NPCs)`;

    const spacingSummary =
      res.spacingMode === 'STAY_CLOSE'
        ? `🤝 ${scopeLabel} -> STAY CLOSE [Num -] (TIGHT 2–4m SQUADS • 15m STANDOFF • ARMOR 35–42m)!`
        : `↔️ ${scopeLabel} -> FAN OUT [Num +] (SPREAD 7–12m SQUADS • 25m+ STANDOFF • ARMOR ~100m)!`;

    this.addXpNotification(15, spacingSummary);
    this.showKillStreakAnnouncement(
      res.spacingMode === 'STAY_CLOSE'
        ? `★ FORMATION [${res.scope === 'ALL' ? 'ALL 5 SQUADS' : targetSquad}]: 🤝 STAY CLOSE [-]!`
        : `★ FORMATION [${res.scope === 'ALL' ? 'ALL 5 SQUADS' : targetSquad}]: ↔️ FAN OUT [+]`
    );
    this.addTacticalCommsMessage(
      this.network && this.network.callsign ? this.network.callsign : 'YOU',
      res.scope === 'ALL' ? 'CMD' : 'SL',
      res.scope === 'ALL' ? 'COMMAND' : 'SQUAD',
      0,
      spacingSummary,
      true
    );

    this.updateCommandOrderHud();
    const cmdModal = document.getElementById('command-modal');
    if (cmdModal) {
      this.renderCommandModalContent(cmdModal);
    }
    return res;
  }

  updateCommandOrderHud() {
    const rankBadgeEl = document.getElementById('cmd-rank-badge');
    const panelTitleEl = document.getElementById('cmd-panel-title');
    const orderTextEl = document.getElementById('cmd-active-order-text');
    const hudStatusLineEl = document.getElementById('cmd-hud-status-line');
    const deployOrderStatusEl = document.getElementById('deploy-order-status');
    const allBtn = document.getElementById('cmd-scope-all');
    const sqBtn = document.getElementById('cmd-scope-squad');
    const team = this.player.team || 'US';
    const sqId = this.player.squad || 'ALPHA';

    const aliveTeamBots = this.botManager.bots.filter((b) => !b.dead && b.team === team).length;
    const aliveSquadBots = this.botManager.bots.filter(
      (b) => !b.dead && b.team === team && b.squad === sqId
    ).length;

    if (allBtn) {
      allBtn.textContent = `★ ALL 5 SQUADS (${aliveTeamBots})`;
      allBtn.classList.toggle('active', this.player.commandScope === 'ALL');
    }
    if (sqBtn) {
      sqBtn.textContent = `▲ ${sqId} SQUAD (${aliveSquadBots})`;
      sqBtn.classList.toggle('active', this.player.commandScope === 'SQUAD');
    }

    if (panelTitleEl) {
      panelTitleEl.textContent =
        this.player.commandScope === 'ALL'
          ? '★ FORCE COMMANDER ORDERS'
          : `▲ ${sqId} SQUAD ORDERS`;
    }

    if (rankBadgeEl) {
      if (this.player.commandRank === 'COMMANDER') {
        rankBadgeEl.textContent = '★ CMD';
        rankBadgeEl.style.color = '#f1c40f';
      } else if (this.player.commandRank === 'SQUAD_LEADER') {
        rankBadgeEl.textContent = `▲ ${sqId.slice(0, 3)} SL`;
        rankBadgeEl.style.color = '#2ecc71';
      } else {
        rankBadgeEl.textContent = `● ${sqId.slice(0, 3)}`;
        rankBadgeEl.style.color = '#74b9ff';
      }
    }

    const activeOrder =
      this.player.commandScope === 'ALL'
        ? this.botManager.commanderOrders && this.botManager.commanderOrders[team]
        : this.botManager.squadOrders &&
          this.botManager.squadOrders[team] &&
          this.botManager.squadOrders[team][sqId];

    const activeSpacing =
      this.botManager && typeof this.botManager.getEffectiveSpacingMode === 'function'
        ? this.botManager.getEffectiveSpacingMode(
            team,
            this.player.commandScope === 'SQUAD' ? sqId : null
          )
        : 'FAN_OUT';
    const spacingShort = activeSpacing === 'STAY_CLOSE' ? 'CLOSE [-]' : 'FAN OUT [+]';

    document.querySelectorAll('.cmd-order-btn').forEach((btn) => {
      const act = btn.dataset.action;
      const flg = btn.dataset.flag;
      const isMatch =
        activeOrder && activeOrder.timer > 0
          ? activeOrder.action === act && (!flg || activeOrder.flagId === flg)
          : act === 'AUTO';
      btn.classList.toggle('active', Boolean(isMatch));
    });

    document.querySelectorAll('.cmd-spacing-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.spacing === activeSpacing);
    });

    if (orderTextEl) {
      if (activeOrder && activeOrder.timer > 0) {
        const scopeTag = activeOrder.scope === 'ALL' ? 'ALL' : sqId.slice(0, 3);
        const desc =
          activeOrder.action === 'OBJECTIVE'
            ? `ATK ${activeOrder.flagId}`
            : activeOrder.action === 'FOLLOW'
              ? 'FOLLOW ME'
              : 'DEFEND HERE';
        orderTextEl.textContent = `${scopeTag}→${desc} (${spacingShort})`;
        orderTextEl.style.color = '#f1c40f';
      } else {
        orderTextEl.textContent = `AI AUTO • ${spacingShort}`;
        orderTextEl.style.color = '#7bed9f';
      }
    }

    if (hudStatusLineEl) {
      if (activeOrder && activeOrder.timer > 0) {
        const scopeFull = activeOrder.scope === 'ALL' ? `ALL 5 SQUADS (${aliveTeamBots})` : `${sqId} SQUAD (${aliveSquadBots})`;
        const actLabel =
          activeOrder.action === 'OBJECTIVE'
            ? `⚔️ ATTACK OBJ ${activeOrder.flagId}`
            : activeOrder.action === 'FOLLOW'
            ? '🏃 FOLLOW ME'
            : '🛡️ DEFEND HERE';
        hudStatusLineEl.textContent = `ACTIVE: ${scopeFull} → ${actLabel} • ${spacingShort} (${Math.ceil(activeOrder.timer)}s)`;
        hudStatusLineEl.style.color = '#f1c40f';
      } else {
        hudStatusLineEl.textContent = `FORMATION: ${spacingShort} • [Num -] STAY CLOSE / [Num +] FAN OUT`;
        hudStatusLineEl.style.color = '#7bed9f';
      }
    }

    if (deployOrderStatusEl) {
      if (activeOrder && activeOrder.timer > 0) {
        const actLabel =
          activeOrder.action === 'OBJECTIVE'
            ? `⚔️ ATTACK OBJ ${activeOrder.flagId}`
            : activeOrder.action === 'FOLLOW'
            ? '🏃 FOLLOW ME'
            : '🛡️ DEFEND HERE';
        deployOrderStatusEl.textContent = `ACTIVE: ${actLabel} (${spacingShort})`;
        deployOrderStatusEl.style.color = '#f1c40f';
      } else {
        deployOrderStatusEl.textContent = `ACTIVE: AI AUTO (${spacingShort})`;
        deployOrderStatusEl.style.color = '#7bed9f';
      }
    }

    // Update the sleek 1-line summary bar above the Minimap (#hud-cmd-summary-text)
    if (this.hudCmdSummaryTextEl) {
      const rankShort =
        this.player.commandRank === 'COMMANDER'
          ? '★ CMD'
          : this.player.commandRank === 'SQUAD_LEADER'
          ? `▲ ${sqId} SL`
          : `● ${sqId}`;
      if (activeOrder && activeOrder.timer > 0) {
        const shortAct =
          activeOrder.action === 'OBJECTIVE'
            ? `OBJ ${activeOrder.flagId}`
            : activeOrder.action;
        this.hudCmdSummaryTextEl.textContent = `${rankShort} • ${
          activeOrder.scope === 'ALL' ? 'ALL' : sqId.slice(0, 3)
        }→${shortAct} (${activeSpacing === 'STAY_CLOSE' ? 'CLOSE' : 'FAN'})`;
      } else {
        this.hudCmdSummaryTextEl.textContent = `${rankShort} • ${sqId.slice(0, 3)} (${aliveSquadBots + 1}) • ${
          activeSpacing === 'STAY_CLOSE' ? 'CLOSE' : 'FAN'
        }`;
      }
    }

    // Update Commander Support Row Buttons (UAV [U], Airstrike [J], Strike Pattern [Shift+J])
    const hudUavBtn = document.getElementById('hud-uav-btn');
    if (hudUavBtn) {
      if (this.player.uavActive) {
        hudUavBtn.textContent = `📡 UAV ACTIVE (${Math.ceil(this.player.uavTimer)}s)`;
        hudUavBtn.classList.add('active');
      } else if (this.player.uavCooldown > 0) {
        hudUavBtn.textContent = `📡 UAV (${Math.ceil(this.player.uavCooldown)}s)`;
        hudUavBtn.classList.remove('active');
      } else {
        hudUavBtn.textContent = '📡 UAV [U]';
        hudUavBtn.classList.remove('active');
      }
    }
    const hudAirstrikeBtn = document.getElementById('hud-airstrike-btn');
    if (hudAirstrikeBtn) {
      if (this.player.airstrikeTarget) {
        hudAirstrikeBtn.textContent = `💥 INBOUND (${this.player.airstrikeTarget.timer.toFixed(1)}s)`;
        hudAirstrikeBtn.classList.add('active');
      } else if (this.player.airstrikeCooldown > 0) {
        hudAirstrikeBtn.textContent = `💥 STRIKE (${Math.ceil(this.player.airstrikeCooldown)}s)`;
        hudAirstrikeBtn.classList.remove('active');
      } else {
        hudAirstrikeBtn.textContent = '💥 STRIKE [J]';
        hudAirstrikeBtn.classList.remove('active');
      }
    }
    const hudStrikePatternBtn = document.getElementById('hud-strike-pattern-btn');
    if (hudStrikePatternBtn) {
      const pat = this.player.airstrikePattern || 'CARPET';
      hudStrikePatternBtn.textContent =
        pat === 'BUNKER_BUSTER'
          ? '🎯 GBU'
          : pat === 'ARTILLERY'
          ? '🌧️ ARTY'
          : '✈️ CARPET';
    }
  }

  toggleCommandModal() {
    let modal = document.getElementById('command-modal');
    if (modal) {
      modal.remove();
      return;
    }
    if (document.pointerLockElement === document.body) {
      document.exitPointerLock();
    }

    modal = document.createElement('div');
    modal.id = 'command-modal';
    modal.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: 820px; max-width: 96vw; max-height: 92vh; overflow-y: auto;
      background: rgba(10, 16, 24, 0.96);
      border: 2px solid #f1c40f; border-radius: 8px; padding: 14px 18px;
      z-index: 10002; color: #ecf0f1; font-family: 'Rajdhani', 'Segoe UI', sans-serif;
      box-shadow: 0 14px 44px rgba(0,0,0,0.88); pointer-events: auto;
    `;
    document.body.appendChild(modal);
    this.renderCommandModalContent(modal);
  }

  renderCommandModalContent(modal) {
    const team = this.player.team || 'US';
    const playerSquadId = this.player.squad || 'ALPHA';
    const aliveAll = this.botManager.bots.filter((b) => !b.dead && b.team === team).length;
    const cmdOrder = this.botManager.commanderOrders && this.botManager.commanderOrders[team];
    const cmdStatus =
      cmdOrder && cmdOrder.timer > 0
        ? `<span style="color:#f1c40f;font-weight:900;">${cmdOrder.action}${
            cmdOrder.flagId ? ' OBJ ' + cmdOrder.flagId : ''
          } (${Math.ceil(cmdOrder.timer)}s)</span>`
        : '<span style="color:#95a5a6;">AUTONOMOUS AI SQUAD LEADERS</span>';

    const squadRowsHtml = SQUAD_DEFS.map((sq) => {
      const sqBots = this.botManager.bots.filter((b) => b.team === team && b.squad === sq.id);
      const aliveCount = sqBots.filter((b) => !b.dead).length;
      const slBot = sqBots.find((b) => b.isSquadLeader) || sqBots[0];
      const sqOrd =
        this.botManager.squadOrders &&
        this.botManager.squadOrders[team] &&
        this.botManager.squadOrders[team][sq.id];
      const ordLabel =
        sqOrd && sqOrd.timer > 0
          ? `${sqOrd.action}${sqOrd.flagId ? ' OBJ ' + sqOrd.flagId : ''}`
          : slBot && this.world.flags[slBot.targetFlagIndex]
            ? `AI -> OBJ ${this.world.flags[slBot.targetFlagIndex].id}`
            : 'PATROL';
      const isPlayerSq = playerSquadId === sq.id;

      return `
        <div style="display:flex;justify-content:space-between;align-items:center;background:${
          isPlayerSq ? 'rgba(46,204,113,0.12)' : 'rgba(255,255,255,0.04)'
        };border:1px solid ${
          isPlayerSq ? 'rgba(46,204,113,0.45)' : 'rgba(255,255,255,0.1)'
        };border-radius:4px;padding:4px 8px;margin-bottom:4px;font-size:11.5px;">
          <div>
            <strong style="color:${isPlayerSq ? '#2ecc71' : '#74b9ff'}">${sq.id}</strong>
            <span style="color:#95a5a6;font-size:10.5px;margin-left:4px;">(${sq.specialty} • ${aliveCount}/8)</span>
            <span style="margin-left:5px;padding:1px 5px;border-radius:3px;background:rgba(241,196,15,0.15);color:#f1c40f;font-weight:800;font-size:10px;">${ordLabel}</span>
          </div>
          <div style="display:flex;gap:2px;">
            ${['A', 'B', 'C', 'D', 'E']
              .map(
                (fid) =>
                  `<button class="modal-sq-order-btn" data-scope="SQUAD" data-squad="${sq.id}" data-action="OBJECTIVE" data-flag="${fid}" style="background:#2980b9;color:#fff;border:none;border-radius:3px;padding:2px 6px;font-size:10px;font-weight:900;cursor:pointer;">${fid}</button>`
              )
              .join('')}
            <button class="modal-sq-order-btn" data-scope="SQUAD" data-squad="${sq.id}" data-action="FOLLOW" style="background:#27ae60;color:#fff;border:none;border-radius:3px;padding:2px 5px;font-size:10px;font-weight:900;cursor:pointer;">FLW</button>
            <button class="modal-sq-order-btn" data-scope="SQUAD" data-squad="${sq.id}" data-action="HOLD" style="background:#8e44ad;color:#fff;border:none;border-radius:3px;padding:2px 5px;font-size:10px;font-weight:900;cursor:pointer;">HLD</button>
          </div>
        </div>
      `;
    }).join('');

    // Build active player Squad Roster for the right side of the [K] Map & Command View
    const mySqBots = this.botManager.bots.filter(
      (b) => b.team === team && b.squad === playerSquadId
    );
    const selfRankLabel =
      this.player.commandRank === 'COMMANDER'
        ? 'CMD'
        : this.player.commandRank === 'SQUAD_LEADER'
        ? 'SL'
        : 'MBR';
    const rosterEntries = [
      {
        name: `YOU (${selfRankLabel})`,
        role: (this.player.role || 'ENG').toUpperCase().slice(0, 3),
        hp: Math.ceil(this.player.hp),
        downed: this.player.downed,
        dead: this.player.dead
      },
      ...mySqBots.map((b) => ({
        name: `${b.isCommander ? '★' : b.isSquadLeader ? '▲' : ''}${b.name}`,
        role: b.isSquadLeader ? 'SL' : b.role.slice(0, 3),
        hp: Math.ceil(b.hp),
        downed: b.downed,
        dead: b.dead
      }))
    ];
    const rosterHtml = rosterEntries
      .map((r) => {
        const isDown = r.dead || r.downed;
        const stText = r.dead ? 'KIA' : r.downed ? 'BLEEDING' : `${r.hp} HP`;
        const stCol = isDown ? '#ff5252' : '#2ecc71';
        return `<div style="display:flex;justify-content:space-between;padding:2.5px 6px;border-bottom:1px solid rgba(255,255,255,0.06);font-size:11px;">
          <span><strong style="color:#95a5a6">[${r.role}]</strong> <strong style="color:#ecf0f1">${r.name}</strong></span>
          <strong style="color:${stCol}">${stText}</strong>
        </div>`;
      })
      .join('');

    const curPattern = this.player.airstrikePattern || 'CARPET';
    const isStrikeClickMode = this.mapClickMode === 'AIRSTRIKE';
    const uavStatusLabel = this.player.uavActive
      ? `📡 UAV ACTIVE (${Math.ceil(this.player.uavTimer)}s • ${
          this.player.uavRevealedBots.filter((b) => !b.dead).length
        } INF / ${
          (this.player.uavRevealedVehicles || []).filter((v) => !v.dead).length
        } ARMOR)`
      : this.player.uavCooldown > 0
      ? `📡 UAV COOLDOWN (${Math.ceil(this.player.uavCooldown)}s)`
      : '📡 LAUNCH MQ-9 UAV DATALINK [U]';
    const strikeStatusLabel = this.player.airstrikeTarget
      ? `💥 STRIKE INBOUND (${this.player.airstrikeTarget.timer.toFixed(1)}s)`
      : this.player.airstrikeCooldown > 0
      ? `💥 STRIKE COOLDOWN (${Math.ceil(this.player.airstrikeCooldown)}s)`
      : '💥 CALL AIRSTRIKE AT CROSSHAIR [J]';

    modal.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.15);padding-bottom:8px;margin-bottom:10px;">
        <div>
          <div style="font-size:17px;font-weight:900;color:#f1c40f;letter-spacing:1.2px;">🗺️ TACTICAL MAP &amp; FORCE COMMANDER / SQUAD VIEW [K]</div>
          <div style="font-size:11px;color:#bdc3c7;">Left-click map to ${
            isStrikeClickMode
              ? '<strong style="color:#ff6b6b">CALL AIRSTRIKE AT EXACT MAP COORDS</strong>'
              : 'issue Squad Orders'
          }, or <strong>Right-Click anywhere on the map</strong> to drop an Airstrike immediately!</div>
        </div>
        <button id="cmd-modal-close" style="background:#c0392b;color:#fff;border:none;border-radius:4px;padding:5px 12px;font-weight:900;cursor:pointer;">CLOSE [K]</button>
      </div>

      <div style="position:relative;background:#121c14;border:1.5px solid ${
        isStrikeClickMode ? '#e74c3c' : 'rgba(241,196,15,0.45)'
      };border-radius:6px;padding:6px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;font-size:11px;flex-wrap:wrap;gap:4px;">
          <span style="color:${isStrikeClickMode ? '#ff7675' : '#f1c40f'};font-weight:900;">${
            isStrikeClickMode
              ? '💥 AIRSTRIKE TARGETING MODE — CLICK ANYWHERE ON MAP TO CALL STRIKE AT THOSE EXACT COORDINATES!'
              : `📍 FRUGIS RIVER VALLEY — CLICK OBJECTIVE A–E TO ORDER (${
                  this.player.commandScope === 'ALL' ? 'ALL 5 SQUADS' : playerSquadId + ' SQUAD'
                }) OR RIGHT-CLICK TO STRIKE`
          }</span>
          <div style="display:flex;gap:4px;flex-wrap:wrap;">
            <button id="cmd-map-mode-order" style="background:${
              !isStrikeClickMode ? '#27ae60' : 'rgba(255,255,255,0.12)'
            };color:#fff;border:1px solid ${
              !isStrikeClickMode ? '#2ecc71' : 'rgba(255,255,255,0.2)'
            };border-radius:3px;padding:2px 8px;font-size:10.5px;font-weight:900;cursor:pointer;">📍 CLICK: ORDER SQUADS</button>
            <button id="cmd-map-mode-strike" style="background:${
              isStrikeClickMode ? '#c0392b' : 'rgba(231,76,60,0.22)'
            };color:#fff;border:1px solid #e74c3c;border-radius:3px;padding:2px 8px;font-size:10.5px;font-weight:900;cursor:pointer;">💥 CLICK: CALL AIRSTRIKE</button>
            <button id="cmd-map-scope-all" style="background:${
              this.player.commandScope === 'ALL' ? '#f39c12' : 'rgba(255,255,255,0.12)'
            };color:${
              this.player.commandScope === 'ALL' ? '#000' : '#fff'
            };border:none;border-radius:3px;padding:2px 8px;font-size:10.5px;font-weight:900;cursor:pointer;">SCOPE: ALL 5 SQUADS</button>
            <button id="cmd-map-scope-sq" style="background:${
              this.player.commandScope === 'SQUAD' ? '#2ecc71' : 'rgba(255,255,255,0.12)'
            };color:${
              this.player.commandScope === 'SQUAD' ? '#000' : '#fff'
            };border:none;border-radius:3px;padding:2px 8px;font-size:10.5px;font-weight:900;cursor:pointer;">SCOPE: ${playerSquadId}</button>
          </div>
        </div>
        <canvas id="cmd-tactical-map-canvas" width="760" height="205" style="width:100%;height:205px;display:block;border-radius:4px;cursor:crosshair;"></canvas>
      </div>

      <div style="background:rgba(241,196,15,0.1);border:1px solid rgba(241,196,15,0.45);border-radius:5px;padding:8px 10px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <span style="font-size:12.5px;font-weight:900;color:#f1c40f;">⭐ FORCE COMMANDER ORDER — ALL 5 SQUADS (${aliveAll} FRIENDLY NPCs + ARMOR)</span>
          <span style="font-size:11px;">STATUS: ${cmdStatus}</span>
        </div>
        <div style="display:flex;gap:5px;flex-wrap:wrap;">
          ${['A', 'B', 'C', 'D', 'E']
            .map((fid) => {
              const flg = this.world.flags.find((f) => f.id === fid);
              const ownerTag = flg ? flg.owner : 'NEUTRAL';
              return `<button class="modal-sq-order-btn" data-scope="ALL" data-action="OBJECTIVE" data-flag="${fid}" style="flex:1;background:#d35400;color:#fff;border:1px solid #f1c40f;border-radius:4px;padding:5px 6px;font-size:11px;font-weight:900;cursor:pointer;">ALL -> OBJ ${fid} (${ownerTag})</button>`;
            })
            .join('')}
          <button class="modal-sq-order-btn" data-scope="ALL" data-action="FOLLOW" style="background:#27ae60;color:#fff;border:none;border-radius:4px;padding:5px 9px;font-size:10.5px;font-weight:900;cursor:pointer;">ALL FOLLOW ME</button>
          <button class="modal-sq-order-btn" data-scope="ALL" data-action="HOLD" style="background:#8e44ad;color:#fff;border:none;border-radius:4px;padding:5px 9px;font-size:10.5px;font-weight:900;cursor:pointer;">ALL HOLD</button>
          <button class="modal-sq-order-btn" data-scope="ALL" data-action="AUTO" style="background:rgba(255,255,255,0.14);color:#fff;border:none;border-radius:4px;padding:5px 9px;font-size:10.5px;font-weight:900;cursor:pointer;">RESET TO AI</button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1.45fr 1fr;gap:10px;margin-bottom:10px;">
        <div>
          <div style="font-size:11px;font-weight:900;color:#2ecc71;margin-bottom:4px;letter-spacing:0.6px;">▲ INDIVIDUAL SQUAD ORDERS (ALPHA – ECHO):</div>
          ${squadRowsHtml}
        </div>
        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(46,204,113,0.35);border-radius:5px;padding:7px 9px;">
          <div style="font-size:11px;font-weight:900;color:#2ecc71;margin-bottom:5px;letter-spacing:0.6px;">👥 YOUR SQUAD ROSTER (${playerSquadId} SQUAD):</div>
          ${rosterHtml}
        </div>
      </div>

      <div style="background:rgba(192,57,43,0.12);border:1px solid rgba(231,76,60,0.45);border-radius:5px;padding:8px 10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:6px;">
          <span style="font-size:12px;font-weight:900;color:#ff7675;">✈️ COMMANDER FIRE SUPPORT &amp; RECON DATALINK:</span>
          <div style="display:flex;gap:4px;align-items:center;">
            <span style="font-size:10.5px;color:#bdc3c7;font-weight:800;">STRIKE PATTERN [Shift+J]:</span>
            <button class="modal-strike-pat-btn" data-pattern="CARPET" style="background:${
              curPattern === 'CARPET' ? '#e67e22' : 'rgba(255,255,255,0.12)'
            };color:#fff;border:1px solid #f39c12;border-radius:3px;padding:2px 7px;font-size:10px;font-weight:900;cursor:pointer;">✈️ CARPET RUN (9x JDAM)</button>
            <button class="modal-strike-pat-btn" data-pattern="BUNKER_BUSTER" style="background:${
              curPattern === 'BUNKER_BUSTER' ? '#e67e22' : 'rgba(255,255,255,0.12)'
            };color:#fff;border:1px solid #f39c12;border-radius:3px;padding:2px 7px;font-size:10px;font-weight:900;cursor:pointer;">🎯 GBU-28 BUNKER BUSTER</button>
            <button class="modal-strike-pat-btn" data-pattern="ARTILLERY" style="background:${
              curPattern === 'ARTILLERY' ? '#e67e22' : 'rgba(255,255,255,0.12)'
            };color:#fff;border:1px solid #f39c12;border-radius:3px;padding:2px 7px;font-size:10px;font-weight:900;cursor:pointer;">🌧️ 155MM ARTILLERY (12x HE)</button>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;">
          <div style="display:flex;gap:5px;flex-wrap:wrap;">
            <button id="cmd-asset-uav" style="background:#2980b9;color:#fff;border:1px solid #74b9ff;border-radius:4px;padding:5px 10px;font-size:11px;font-weight:900;cursor:pointer;">${uavStatusLabel}</button>
            <button id="cmd-asset-airstrike" style="background:#c0392b;color:#fff;border:1px solid #ff7675;border-radius:4px;padding:5px 10px;font-size:11px;font-weight:900;cursor:pointer;">${strikeStatusLabel}</button>
            <button id="cmd-asset-rally" style="background:#27ae60;color:#fff;border:none;border-radius:4px;padding:5px 10px;font-size:11px;font-weight:900;cursor:pointer;">🟢 RALLY [5]</button>
          </div>
          <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;">
            <span style="font-size:10px;color:#fab1a0;font-weight:900;">1-CLICK STRIKE OBJ:</span>
            ${['A', 'B', 'C', 'D', 'E']
              .map(
                (fid) =>
                  `<button class="modal-strike-flag-btn" data-flag="${fid}" style="background:#922b21;color:#fff;border:1px solid #ff7675;border-radius:3px;padding:4px 7px;font-size:10.5px;font-weight:900;cursor:pointer;">💥 ${fid}</button>`
              )
              .join('')}
          </div>
        </div>
      </div>
    `;

    const closeBtn = modal.querySelector('#cmd-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', () => modal.remove());

    const mapModeOrderBtn = modal.querySelector('#cmd-map-mode-order');
    if (mapModeOrderBtn) {
      mapModeOrderBtn.addEventListener('click', () => {
        this.mapClickMode = 'ORDER';
        this.renderCommandModalContent(modal);
      });
    }
    const mapModeStrikeBtn = modal.querySelector('#cmd-map-mode-strike');
    if (mapModeStrikeBtn) {
      mapModeStrikeBtn.addEventListener('click', () => {
        this.mapClickMode = 'AIRSTRIKE';
        this.renderCommandModalContent(modal);
      });
    }

    const mapScopeAllBtn = modal.querySelector('#cmd-map-scope-all');
    if (mapScopeAllBtn) {
      mapScopeAllBtn.addEventListener('click', () => {
        this.setCommandScope('ALL');
        this.renderCommandModalContent(modal);
      });
    }
    const mapScopeSqBtn = modal.querySelector('#cmd-map-scope-sq');
    if (mapScopeSqBtn) {
      mapScopeSqBtn.addEventListener('click', () => {
        this.setCommandScope('SQUAD');
        this.renderCommandModalContent(modal);
      });
    }

    modal.querySelectorAll('.modal-strike-pat-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pat = btn.dataset.pattern || 'CARPET';
        this.player.airstrikePattern = pat;
        this.updateCommandOrderHud();
        this.renderCommandModalContent(modal);
      });
    });

    modal.querySelectorAll('.modal-strike-flag-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const fid = btn.dataset.flag;
        const flg = this.world.flags.find((f) => f.id === fid);
        if (flg) {
          this.player.callAirstrike(new THREE.Vector3(flg.pos.x, 0, flg.pos.z));
          this.updateCommandOrderHud();
          this.renderCommandModalContent(modal);
        }
      });
    });

    const mapCanvas = modal.querySelector('#cmd-tactical-map-canvas');
    if (mapCanvas) {
      this.drawCommandTacticalMap(mapCanvas);
      const triggerMapAirstrikeAt = (e) => {
        const rect = mapCanvas.getBoundingClientRect();
        const cx = ((e.clientX - rect.left) / rect.width) * mapCanvas.width;
        const cy = ((e.clientY - rect.top) / rect.height) * mapCanvas.height;
        const wx = (cx / mapCanvas.width - 0.5) * 720;
        const wz = (cy / mapCanvas.height - 0.5) * 440;
        this.player.callAirstrike(new THREE.Vector3(wx, 0, wz));
        this.updateCommandOrderHud();
        this.renderCommandModalContent(modal);
      };
      mapCanvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        triggerMapAirstrikeAt(e);
      });
      mapCanvas.addEventListener('click', (e) => {
        if (this.mapClickMode === 'AIRSTRIKE') {
          triggerMapAirstrikeAt(e);
          return;
        }
        const rect = mapCanvas.getBoundingClientRect();
        const cx = ((e.clientX - rect.left) / rect.width) * mapCanvas.width;
        const cy = ((e.clientY - rect.top) / rect.height) * mapCanvas.height;
        const wx = (cx / mapCanvas.width - 0.5) * 720;
        const wz = (cy / mapCanvas.height - 0.5) * 440;

        let nearestFlag = null;
        let bestDist = Infinity;
        for (const f of this.world.flags) {
          const d = Math.hypot(wx - f.pos.x, wz - f.pos.z);
          if (d < bestDist) {
            bestDist = d;
            nearestFlag = f;
          }
        }
        if (nearestFlag) {
          this.issueHudStrategicOrder({
            scope: this.player.commandScope || 'ALL',
            targetSquad: this.player.squad || 'ALPHA',
            action: 'OBJECTIVE',
            flagId: nearestFlag.id
          });
        }
      });
    }

    modal.querySelectorAll('.modal-sq-order-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const scope = btn.dataset.scope || 'ALL';
        const targetSquad = btn.dataset.squad || this.player.squad || 'ALPHA';
        const action = btn.dataset.action || 'OBJECTIVE';
        const flagId = btn.dataset.flag || null;
        this.setCommandScope(scope);
        this.issueHudStrategicOrder({ scope, targetSquad, action, flagId });
      });
    });

    const uavBtn = modal.querySelector('#cmd-asset-uav');
    if (uavBtn) {
      uavBtn.addEventListener('click', () => {
        this.player.triggerCommanderUAV();
        modal.remove();
      });
    }
    const airBtn = modal.querySelector('#cmd-asset-airstrike');
    if (airBtn) {
      airBtn.addEventListener('click', () => {
        this.player.callCommanderAirstrike();
        modal.remove();
      });
    }
    const rallyBtn = modal.querySelector('#cmd-asset-rally');
    if (rallyBtn) {
      rallyBtn.addEventListener('click', () => {
        this.player.placeRallyPoint();
        modal.remove();
      });
    }
  }

  drawCommandTacticalMap(canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = '#162318';
    ctx.fillRect(0, 0, w, h);

    const toMapX = (wx) => (wx / 720 + 0.5) * w;
    const toMapY = (wz) => (wz / 440 + 0.5) * h;

    // Subtle tactical grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx < w; gx += 76) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, h);
      ctx.stroke();
    }
    for (let gy = 0; gy < h; gy += 51) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(w, gy);
      ctx.stroke();
    }

    // North-South River
    ctx.fillStyle = '#1f536e';
    ctx.fillRect(toMapX(-20), 0, 26, h);

    // 3 Grand Bridges & Main Road Network
    ctx.fillStyle = '#2f363d';
    ctx.fillRect(0, toMapY(-8), w, 10);
    ctx.fillRect(toMapX(-24), toMapY(-116), 34, 8);
    ctx.fillRect(toMapX(-24), toMapY(104), 34, 8);

    // Base HQs
    const usX = toMapX(this.world.spawns.US_BASE.x);
    const usY = toMapY(this.world.spawns.US_BASE.z);
    ctx.fillStyle = '#3498db';
    ctx.fillRect(usX - 7, usY - 7, 14, 14);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('US HQ', usX, usY - 10);

    const ruX = toMapX(this.world.spawns.RU_BASE.x);
    const ruY = toMapY(this.world.spawns.RU_BASE.z);
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(ruX - 7, ruY - 7, 14, 14);
    ctx.fillStyle = '#fff';
    ctx.fillText('RU HQ', ruX, ruY - 10);

    const team = this.player.team || 'US';
    const cmdOrder = this.botManager.commanderOrders && this.botManager.commanderOrders[team];

    // 5 Capture Flags (Interactive click targets)
    for (const f of this.world.flags) {
      const fx = toMapX(f.pos.x);
      const fy = toMapY(f.pos.z);
      const isOrdered =
        cmdOrder && cmdOrder.timer > 0 && cmdOrder.action === 'OBJECTIVE' && cmdOrder.flagId === f.id;

      ctx.fillStyle =
        f.owner === 'US'
          ? 'rgba(52, 152, 219, 0.38)'
          : f.owner === 'RU'
          ? 'rgba(231, 76, 60, 0.38)'
          : 'rgba(149, 165, 166, 0.3)';
      ctx.beginPath();
      ctx.arc(fx, fy, 16, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = isOrdered ? '#f1c40f' : '#ffffff';
      ctx.lineWidth = isOrdered ? 3 : 1.3;
      ctx.stroke();

      if (isOrdered) {
        ctx.fillStyle = '#f1c40f';
        ctx.font = 'bold 9px sans-serif';
        ctx.fillText('★ ORDER TARGET', fx, fy - 20);
      }

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(f.id, fx, fy + 4);
    }

    // Active Vehicles on Tactical Map (highlight UAV-revealed enemy armor with orange targeting ring!)
    for (const v of this.vehicleManager.vehicles) {
      if (v.dead) continue;
      const vx = toMapX(v.pos.x);
      const vy = toMapY(v.pos.z);
      ctx.fillStyle = v.team === 'US' ? '#74b9ff' : '#ff7675';
      ctx.fillRect(vx - 3.5, vy - 3.5, 7, 7);
      if (v.team !== team && v.uavRevealed) {
        ctx.strokeStyle = '#f39c12';
        ctx.lineWidth = 1.6;
        ctx.strokeRect(vx - 5.5, vy - 5.5, 11, 11);
      }
    }

    // Active Airstrike Target Zone on Tactical Map
    if (this.player.airstrikeTarget && this.player.airstrikeTarget.pos) {
      const ax = toMapX(this.player.airstrikeTarget.pos.x);
      const ay = toMapY(this.player.airstrikeTarget.pos.z);
      ctx.fillStyle = 'rgba(231, 76, 60, 0.28)';
      ctx.beginPath();
      ctx.arc(ax, ay, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ff3838';
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.fillStyle = '#ff7675';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`💥 STRIKE (${this.player.airstrikeTarget.timer.toFixed(1)}s)`, ax, ay - 21);
    }

    // Friendly Bots & Spotted Enemies
    for (const bot of this.botManager.bots) {
      if (bot.dead) continue;
      if (bot.team === team) {
        ctx.fillStyle = bot.inPlayerSquad ? '#2ecc71' : '#5dade2';
        ctx.fillRect(toMapX(bot.pos.x) - 2, toMapY(bot.pos.z) - 2, 4, 4);
      } else if (bot.uavRevealed || (bot.spottedTimer && bot.spottedTimer > 0)) {
        ctx.fillStyle = '#ff3838';
        ctx.fillRect(toMapX(bot.pos.x) - 2, toMapY(bot.pos.z) - 2, 4, 4);
      }
    }

    // Local Player Marker
    if (!this.player.dead) {
      const px = toMapX(this.player.pos.x);
      const py = toMapY(this.player.pos.z);
      ctx.fillStyle = '#f1c40f';
      ctx.beginPath();
      ctx.arc(px, py, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f1c40f';
      ctx.font = 'bold 9px sans-serif';
      ctx.fillText('YOU', px, py + 14);
    }
  }

  showDeployScreen() {
    this.deployScreenEl.classList.remove('hidden');
    this.hudEl.classList.add('hidden');
    this.scopeOverlayEl.classList.add('hidden');
    this.vehicleOverlayEl.classList.add('hidden');
    if (this.downedOverlayEl) this.downedOverlayEl.classList.add('hidden');
    const topBtn = document.getElementById('deploy-top-btn');
    const botBtn = document.getElementById('deploy-btn');
    if (topBtn) topBtn.textContent = 'DEPLOY TO BATTLEFIELD [ENTER / SPACE]';
    if (botBtn) botBtn.textContent = 'DEPLOY TO BATTLEFIELD [ENTER / SPACE]';
  }

  showHitmarker(type = 'normal', label = 'HIT') {
    this.hitmarkerEl.classList.remove('hidden', 'headshot', 'armor', 'kill');
    if (type === 'headshot') this.hitmarkerEl.classList.add('headshot');
    else if (type === 'armor') this.hitmarkerEl.classList.add('armor');
    else if (type === 'kill') this.hitmarkerEl.classList.add('kill');
    if (this.hitConfirmTagEl) {
      this.hitConfirmTagEl.textContent = label;
    }
    this.hitmarkerTimer = type === 'kill' ? 0.34 : 0.22;
  }

  addTicketEvent(team, delta, category, label) {
    if (!this.ticketEventFeedEl) return;
    const pill = document.createElement('div');
    pill.className = 'ticket-event-pill';
    const isGain = delta > 0;
    const sign = isGain ? '+' : '';
    const borderCol = isGain
      ? '#2ecc71'
      : category === 'ARMOR'
      ? '#e67e22'
      : category === 'CAR'
      ? '#f1c40f'
      : team === 'US'
      ? '#5dade2'
      : '#ec7063';
    const teamCol = team === 'US' ? '#70bdff' : '#ff7878';
    const deltaCol = isGain ? '#2ecc71' : '#ff9f43';
    pill.style.borderLeftColor = borderCol;
    pill.innerHTML = `<span style="color:${teamCol}">${team}</span> <strong style="color:${deltaCol}">${sign}${delta} 🎟️</strong> <span style="color:#dfe6e9">&bull; ${label}</span>`;
    this.ticketEventFeedEl.prepend(pill);

    while (this.ticketEventFeedEl.children.length > 3) {
      this.ticketEventFeedEl.removeChild(this.ticketEventFeedEl.lastChild);
    }

    setTimeout(() => {
      if (pill.parentNode) pill.parentNode.removeChild(pill);
    }, 3400);
  }

  addXpNotification(points, reason) {
    const item = document.createElement('div');
    item.className = 'xp-item';
    const ptsHtml = points > 0 ? `<span class="xp-pts">+${points} XP</span>` : '';
    item.innerHTML = `${ptsHtml}<span>${reason}</span>`;
    this.xpFeedEl.prepend(item);

    while (this.xpFeedEl.children.length > 5) {
      this.xpFeedEl.removeChild(this.xpFeedEl.lastChild);
    }

    setTimeout(() => {
      if (item.parentNode) item.parentNode.removeChild(item);
    }, 3200);
  }

  flashDamage(isArmorHit = false) {
    this.damageVignetteEl.style.boxShadow = isArmorHit
      ? 'inset 0 0 95px rgba(243, 156, 18, 0.55)'
      : 'inset 0 0 120px rgba(231, 76, 60, 0.8)';
    setTimeout(() => {
      this.damageVignetteEl.style.boxShadow = this.player.bleeding
        ? 'inset 0 0 85px rgba(192, 57, 43, 0.45)'
        : 'inset 0 0 110px rgba(220, 20, 20, 0)';
    }, 180);
  }

  // Kill Streak / Multi-Kill Announcement (Battlefield-style center screen text)
  showKillStreakAnnouncement(text) {
    let el = document.getElementById('kill-streak-announcement');
    if (!el) {
      el = document.createElement('div');
      el.id = 'kill-streak-announcement';
      el.style.cssText = `
        position: fixed; top: 28%; left: 50%; transform: translateX(-50%);
        font-size: 32px; font-weight: 900; color: #f39c12;
        text-shadow: 0 0 20px rgba(243,156,18,0.8), 0 2px 8px rgba(0,0,0,0.9);
        letter-spacing: 4px; font-family: 'Rajdhani', sans-serif;
        pointer-events: none; z-index: 9999; opacity: 0;
        transition: opacity 0.15s ease-out, transform 0.3s ease-out;
      `;
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.opacity = '1';
    el.style.transform = 'translateX(-50%) scale(1.15)';
    setTimeout(() => {
      el.style.transform = 'translateX(-50%) scale(1.0)';
    }, 150);
    setTimeout(() => {
      el.style.opacity = '0';
    }, 2200);
  }

  // Suppression Overlay (Squad-style screen darkening + edge blur when suppressed)
  updateSuppressionOverlay() {
    let el = document.getElementById('suppression-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'suppression-overlay';
      el.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        pointer-events: none; z-index: 50; opacity: 0;
        background: radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.65) 100%);
        transition: opacity 0.12s ease-out;
      `;
      document.body.appendChild(el);
    }
    const sup = this.player.suppressionLevel || 0;
    if (sup > 0.05) {
      el.style.opacity = String(Math.min(0.85, sup));
    } else {
      el.style.opacity = '0';
    }
  }

  // Floating Damage Number (shows damage dealt on enemies in world space)
  spawnFloatingDamage(worldPos, damage, isHeadshot = false) {
    let container = document.getElementById('floating-damage-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'floating-damage-container';
      container.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:100;overflow:hidden;';
      document.body.appendChild(container);
    }

    const el = document.createElement('div');
    el.className = 'floating-dmg';
    el.textContent = `-${damage}`;
    el.style.cssText = `
      position: absolute; font-weight: 900; pointer-events: none;
      font-family: 'Rajdhani', sans-serif; letter-spacing: 1px;
      text-shadow: 0 1px 4px rgba(0,0,0,0.9);
      animation: floatDmgUp 1.2s ease-out forwards;
      font-size: ${isHeadshot ? '28px' : '22px'};
      color: ${isHeadshot ? '#f39c12' : '#e74c3c'};
    `;

    // Project world position to screen
    const v = worldPos.clone();
    v.project(this.player.camera);
    const sx = (v.x * 0.5 + 0.5) * window.innerWidth + (Math.random() - 0.5) * 30;
    const sy = (-v.y * 0.5 + 0.5) * window.innerHeight + (Math.random() - 0.5) * 20;
    el.style.left = `${sx}px`;
    el.style.top = `${sy}px`;

    container.appendChild(el);
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 1300);
  }

  registerDamageIndicator(
    amount,
    attackerPos = null,
    isArmorHit = false,
    weaponName = 'INCOMING FIRE',
    attackerName = 'ENEMY'
  ) {
    if (weaponName !== 'SMALL ARMS DEFLECTED') {
      this.flashDamage(isArmorHit);
    }

    if (!attackerPos) return;

    const dx = attackerPos.x - this.player.pos.x;
    const dz = attackerPos.z - this.player.pos.z;
    const distM = Math.max(1, Math.round(Math.hypot(dx, dz)));

    // Compute initial relative bearing in degrees (-180..+180, 0 = straight ahead)
    const fwdX = -Math.sin(this.player.yaw);
    const fwdZ = -Math.cos(this.player.yaw);
    const rightX = Math.cos(this.player.yaw);
    const rightZ = -Math.sin(this.player.yaw);
    const dotFwd = dx * fwdX + dz * fwdZ;
    const dotRight = dx * rightX + dz * rightZ;
    const bearingDeg = Math.round((Math.atan2(dotRight, dotFwd) * 180) / Math.PI);

    // Merge with existing indicator from a nearby angle so rapid bursts stack cleanly
    let merged = false;
    for (const ind of this.damageIndicators) {
      if (ind.attackerPos.distanceTo(attackerPos) < 8.0 && ind.isArmorHit === isArmorHit) {
        ind.attackerPos.copy(attackerPos);
        ind.amount = Math.max(ind.amount, amount);
        ind.weaponName = weaponName;
        ind.attackerName = attackerName;
        ind.distM = distM;
        ind.timer = 2.4;
        ind.maxTimer = 2.4;
        merged = true;
        break;
      }
    }

    if (!merged) {
      this.damageIndicators.push({
        attackerPos: attackerPos.clone(),
        amount,
        isArmorHit,
        weaponName,
        attackerName,
        distM,
        timer: 2.4,
        maxTimer: 2.4
      });
      if (this.damageIndicators.length > 5) {
        this.damageIndicators.shift();
      }
    }

    if (this.telemetry && (amount > 0 || !merged)) {
      this.telemetry.logEvent('DIRECTIONAL_DAMAGE', {
        attacker: attackerName,
        weapon: weaponName,
        isArmorHit,
        damage: amount,
        playerHp: Math.round(this.player.hp),
        vehicleHp: this.player.activeVehicle ? Math.round(this.player.activeVehicle.hp) : null,
        bearingDeg,
        distM
      });
    }
  }

  updateDamageIndicators(dt) {
    if (!this.damageIndicatorRingEl) return;
    if (this.damageIndicators.length === 0) {
      if (this.damageIndicatorRingEl.innerHTML !== '') {
        this.damageIndicatorRingEl.innerHTML = '';
      }
      return;
    }

    const fwdX = -Math.sin(this.player.yaw);
    const fwdZ = -Math.cos(this.player.yaw);
    const rightX = Math.cos(this.player.yaw);
    const rightZ = -Math.sin(this.player.yaw);

    const htmlParts = [];
    for (let i = this.damageIndicators.length - 1; i >= 0; i--) {
      const ind = this.damageIndicators[i];
      ind.timer -= dt;
      if (ind.timer <= 0) {
        this.damageIndicators.splice(i, 1);
        continue;
      }

      const dx = ind.attackerPos.x - this.player.pos.x;
      const dz = ind.attackerPos.z - this.player.pos.z;
      const distM = Math.max(1, Math.round(Math.hypot(dx, dz)));
      const dotFwd = dx * fwdX + dz * fwdZ;
      const dotRight = dx * rightX + dz * rightZ;
      const angleDeg = (Math.atan2(dotRight, dotFwd) * 180) / Math.PI;
      const opacity = Math.min(1, (ind.timer / ind.maxTimer) * 1.35).toFixed(2);
      const cls = ind.isArmorHit ? 'dmg-arc-wrapper armor-hit' : 'dmg-arc-wrapper';
      const labelText = ind.isArmorHit
        ? `HULL HIT: ${ind.weaponName} • ${distM}m`
        : `${ind.weaponName} • ${distM}m`;

      htmlParts.push(`
        <div class="${cls}" style="transform: rotate(${angleDeg.toFixed(1)}deg); opacity: ${opacity}">
          <div class="dmg-arc-wedge"></div>
          <div class="dmg-arc-tag" style="transform: translateX(-50%) rotate(${(-angleDeg).toFixed(
            1
          )}deg)">${labelText}</div>
        </div>
      `);
    }

    this.damageIndicatorRingEl.innerHTML = htmlParts.join('');
  }

  updateTelemetryPanel() {
    if (
      !this.telemetryPanelEl ||
      this.telemetryPanelEl.classList.contains('hidden') ||
      !this.telemetry
    ) {
      return;
    }
    const snap = this.telemetry.buildSnapshot();
    if (!snap) return;

    const d = snap.diagnostics;
    const usContested = snap.mainBases && snap.mainBases.US && snap.mainBases.US.contested;
    const ruContested = snap.mainBases && snap.mainBases.RU && snap.mainBases.RU.contested;
    const contestedFlags = snap.flags.filter((f) => f.contested).map((f) => f.id);
    const contestedList = [
      ...(usContested ? ['US_BASE'] : []),
      ...(ruContested ? ['RU_BASE'] : []),
      ...contestedFlags.map((id) => `OBJ_${id}`)
    ];
    const contestedLabel =
      contestedList.length > 0
        ? `LOCKED: ${contestedList.join(', ')} (${d.blockedContestedSpawns} BLOCKED)`
        : `ALL CLEAR (${d.blockedContestedSpawns} BLOCKED SPAWNS)`;

    if (this.telemSummaryGridEl) {
      this.telemSummaryGridEl.innerHTML = `
        <div class="telem-stat-box">
          <div class="telem-stat-label">SPAWN RULE AUDIT (BASE / FLAG)</div>
          <div class="telem-stat-val ok">US ${d.usBaseSpawns}B/${d.usFlagSpawns}F • RU ${d.ruBaseSpawns}B/${d.ruFlagSpawns}F (0 ILLEGAL)</div>
        </div>
        <div class="telem-stat-box">
          <div class="telem-stat-label">CONTESTED BASE SPAWN LOCKOUT</div>
          <div class="telem-stat-val ${contestedList.length > 0 ? 'warn' : 'ok'}">${contestedLabel}</div>
        </div>
        <div class="telem-stat-box">
          <div class="telem-stat-label">MEDIC SITUATION ASSESSMENT</div>
          <div class="telem-stat-val ok">${d.medicThreatAssessments} THREAT / ${d.medicSmokeScreens} SMOKE / ${d.medicClearAssessments} CLEAR</div>
        </div>
        <div class="telem-stat-box">
          <div class="telem-stat-label">ARMOR &amp; CREW / BOARDINGS</div>
          <div class="telem-stat-val">${d.npcVehicleBoardings} BOARDED • ${d.playerArmorProtectedHits} HULL HITS</div>
        </div>
      `;
    }

    if (this.telemVehiclesListEl) {
      this.telemVehiclesListEl.innerHTML = snap.vehicles
        .slice(0, 8)
        .map(
          (v) => `
          <div class="telem-veh-item">
            <span><strong>[${v.team}]</strong> ${v.name.split(' (')[0]} (${v.hp}/${v.maxHp})</span>
            <span style="color: ${
              v.status.startsWith('NPC_DRIVEN') || v.status.startsWith('PLAYER')
                ? '#2ecc71'
                : '#f1c40f'
            }">${v.status}</span>
          </div>
        `
        )
        .join('');
    }

    if (this.telemEventsListEl) {
      this.telemEventsListEl.innerHTML = snap.recentEvents
        .slice(0, 7)
        .map(
          (ev) => `
          <div class="telem-ev-item">
            <span style="color: #70bdff">[${ev.type}]</span>
            <span>${
              ev.medic || ev.base || ev.blockedBase || ev.npc || ev.attacker || ev.source || ev.message || ''
            } ${ev.action || ev.redirectedTo || ev.vehicleName || ev.weapon || ''}</span>
          </div>
        `
        )
        .join('');
    }
  }

  addKillfeed(killer, killerTeam, victim, victimTeam, weapon, isHeadshot) {
    const item = document.createElement('div');
    item.className = 'kill-item';
    const kClass = killerTeam === 'US' ? 'kill-us' : 'kill-ru';
    const vClass = victimTeam === 'US' ? 'kill-us' : 'kill-ru';
    const hsTag = isHeadshot ? ' [HEADSHOT]' : '';
    item.innerHTML = `<span class="${kClass}">${killer}</span> <span class="kill-weapon">[${weapon}${hsTag}]</span> <span class="${vClass}">${victim}</span>`;
    this.killfeedEl.prepend(item);

    while (this.killfeedEl.children.length > 6) {
      this.killfeedEl.removeChild(this.killfeedEl.lastChild);
    }

    setTimeout(() => {
      if (item.parentNode) item.parentNode.removeChild(item);
    }, 6500);
  }

  update(dt, ticketsUS, ticketsRU, matchTimeRemaining = 900, rawDt = dt) {
    this.updateFpsMetrics(rawDt || dt);
    this.lastTicketsUS = ticketsUS;
    this.lastTicketsRU = ticketsRU;
    this.lastMatchTime = matchTimeRemaining;

    if (this.player.dead) {
      // Respawn timer countdown
      if (this.player.respawnTimer > 0) {
        this.player.respawnTimer -= dt;
        const topBtn = document.getElementById('deploy-top-btn');
        const botBtn = document.getElementById('deploy-btn');
        const remaining = Math.ceil(this.player.respawnTimer);
        if (topBtn) topBtn.textContent = `RESPAWNING IN ${remaining}s...`;
        if (botBtn) botBtn.textContent = `RESPAWNING IN ${remaining}s...`;
      } else {
        const topBtn = document.getElementById('deploy-top-btn');
        const botBtn = document.getElementById('deploy-btn');
        if (topBtn && topBtn.textContent.includes('RESPAWNING')) {
          topBtn.textContent = 'DEPLOY TO BATTLEFIELD [ENTER / SPACE]';
        }
        if (botBtn && botBtn.textContent.includes('RESPAWNING')) {
          botBtn.textContent = 'DEPLOY TO BATTLEFIELD [ENTER / SPACE]';
        }
      }
      this.drawDeployMap();
      return;
    }

    if (this.nvgOverlayEl) {
      this.nvgOverlayEl.classList.toggle('hidden', !this.player.nvgActive);
    }

    // Downed State Overlay
    if (this.player.downed) {
      this.downedOverlayEl.classList.remove('hidden');
      this.scopeOverlayEl.classList.add('hidden');
      this.crosshairEl.style.opacity = '0';
      if (this.downedKillerEl) {
        this.downedKillerEl.textContent = `HIT BY ${this.player.downedKiller}`;
      }
      if (this.downedTimerValEl) {
        this.downedTimerValEl.textContent = Math.max(0, Math.ceil(this.player.downedTimer));
      }
      if (this.giveupBarFillEl) {
        this.giveupBarFillEl.style.width = `${Math.min(100, this.player.giveUpProgress * 100)}%`;
      }
      // Find nearest friendly Medic or Squadmate distance
      let bestMedicDist = Infinity;
      let bestMedicName = null;
      for (const b of this.botManager.bots) {
        if (b.dead || b.downed || b.team !== this.player.team) continue;
        if (b.role === 'MEDIC' || b.inPlayerSquad) {
          const d = b.pos.distanceTo(this.player.pos);
          if (d < bestMedicDist) {
            bestMedicDist = d;
            bestMedicName = b.name;
          }
        }
      }
      if (this.downedMedicDistEl) {
        this.downedMedicDistEl.textContent = bestMedicName
          ? `NEAREST MEDIC: ${bestMedicName} (${Math.round(bestMedicDist)}m) — EN ROUTE`
          : 'NEAREST MEDIC: NONE IN RANGE';
      }
    } else if (this.downedOverlayEl) {
      this.downedOverlayEl.classList.add('hidden');
    }

    const tUS = Math.max(0, Math.floor(ticketsUS));
    const tRU = Math.max(0, Math.floor(ticketsRU));
    this.ticketsUsEl.textContent = tUS;
    this.ticketsRuEl.textContent = tRU;

    // Update Top Match Clock, Lead Status & Momentum Tug-of-War Bar
    const mins = Math.floor(matchTimeRemaining / 60);
    const secs = Math.floor(matchTimeRemaining % 60);
    const clockStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    if (this.matchClockEl) this.matchClockEl.textContent = clockStr;

    const usFlagsHeld = this.world.flags.filter((f) => f.owner === 'US').length;
    const ruFlagsHeld = this.world.flags.filter((f) => f.owner === 'RU').length;

    // Squad AAS Territory Bleed & Mercy Bleed Calculation for Top Conquest Bar
    const usBleedPerMin =
      ruFlagsHeld >= 5 ? 60 : ruFlagsHeld === 4 ? 15 : ruFlagsHeld === 3 && ruFlagsHeld > usFlagsHeld ? 6 : 0;
    const ruBleedPerMin =
      usFlagsHeld >= 5 ? 60 : usFlagsHeld === 4 ? 15 : usFlagsHeld === 3 && usFlagsHeld > ruFlagsHeld ? 6 : 0;

    if (this.ticketRateUsEl) {
      if (usBleedPerMin >= 60) {
        this.ticketRateUsEl.textContent = `⚠️ -60/m MERCY (${usFlagsHeld}F)`;
        this.ticketRateUsEl.style.color = '#ff3838';
      } else if (usBleedPerMin > 0) {
        this.ticketRateUsEl.textContent = `-${usBleedPerMin}/m BLEED (${usFlagsHeld}F)`;
        this.ticketRateUsEl.style.color = '#ff9f43';
      } else {
        this.ticketRateUsEl.textContent = `HOLD ${usFlagsHeld}/5F`;
        this.ticketRateUsEl.style.color = usFlagsHeld >= 3 ? '#2ecc71' : '#74b9ff';
      }
    }
    if (this.ticketRateRuEl) {
      if (ruBleedPerMin >= 60) {
        this.ticketRateRuEl.textContent = `⚠️ -60/m MERCY (${ruFlagsHeld}F)`;
        this.ticketRateRuEl.style.color = '#ff3838';
      } else if (ruBleedPerMin > 0) {
        this.ticketRateRuEl.textContent = `-${ruBleedPerMin}/m BLEED (${ruFlagsHeld}F)`;
        this.ticketRateRuEl.style.color = '#ff9f43';
      } else {
        this.ticketRateRuEl.textContent = `HOLD ${ruFlagsHeld}/5F`;
        this.ticketRateRuEl.style.color = ruFlagsHeld >= 3 ? '#2ecc71' : '#ec7063';
      }
    }

    const diff = tUS - tRU;
    const bleedText =
      ruBleedPerMin >= 60
        ? ` • ⚠️ RU MERCY BLEED (-60/m • 5-0 FLAGS)`
        : usBleedPerMin >= 60
        ? ` • ⚠️ US MERCY BLEED (-60/m • 0-5 FLAGS)`
        : ruBleedPerMin > 0
        ? ` • RU BLEEDING -${ruBleedPerMin}/m (${usFlagsHeld}-${ruFlagsHeld} FLAGS)`
        : usBleedPerMin > 0
        ? ` • US BLEEDING -${usBleedPerMin}/m (${usFlagsHeld}-${ruFlagsHeld} FLAGS)`
        : ` • FLAGS ${usFlagsHeld}-${ruFlagsHeld} (NO BLEED)`;

    if (this.matchLeadTextEl) {
      if (diff > 5) {
        this.matchLeadTextEl.textContent = `US LEADING +${diff}${bleedText}`;
        this.matchLeadTextEl.style.color = '#70bdff';
      } else if (diff < -5) {
        this.matchLeadTextEl.textContent = `RU LEADING +${Math.abs(diff)}${bleedText}`;
        this.matchLeadTextEl.style.color = '#ff7878';
      } else {
        this.matchLeadTextEl.textContent = `CONTESTED MATCH (${tUS}-${tRU})${bleedText}`;
        this.matchLeadTextEl.style.color = '#f1c40f';
      }
    }

    if (this.momentumBarUsEl) {
      const totalT = Math.max(1, tUS + tRU);
      const usPct = Math.max(8, Math.min(92, (tUS / totalT) * 100));
      this.momentumBarUsEl.style.width = `${usPct}%`;
    }

    if (!this.scoreboardEl.classList.contains('hidden')) {
      this.renderScoreboard();
    }

    // Update 5 Flag Badges
    let activeCaptureFlag = null;
    for (const flag of this.world.flags) {
      const badge = document.getElementById(`flag-ui-${flag.id}`);
      const fill = document.getElementById(`flag-fill-${flag.id}`);
      if (badge && fill) {
        const pct = Math.abs(flag.captureProgress);
        fill.style.height = `${pct}%`;
        const col =
          flag.captureProgress > 15
            ? '#3498db'
            : flag.captureProgress < -15
            ? '#e74c3c'
            : '#7f8c8d';
        fill.style.backgroundColor = col;
        badge.style.borderColor = col;
      }

      const d = Math.hypot(this.player.pos.x - flag.pos.x, this.player.pos.z - flag.pos.z);
      if (d <= flag.radius) {
        activeCaptureFlag = flag;
      }
    }

    // Check if the player is inside an Enemy Main Base Perimeter (58m radius)
    const enemyTeam = this.player.team === 'US' ? 'RU' : 'US';
    const enemyBasePos =
      enemyTeam === 'US' ? this.world.spawns.US_BASE : this.world.spawns.RU_BASE;
    const distToEnemyBase = Math.hypot(
      this.player.pos.x - enemyBasePos.x,
      this.player.pos.z - enemyBasePos.z
    );
    const enemyBaseInfo =
      this.botManager.baseState && this.botManager.baseState[enemyTeam]
        ? this.botManager.baseState[enemyTeam]
        : null;

    if (distToEnemyBase <= 58 && enemyBaseInfo) {
      this.captureStatusEl.classList.remove('hidden');
      if (enemyBaseInfo.contested) {
        this.captureTitleEl.textContent = `⚠️ ${enemyTeam} MAIN BASE CONTESTED — ALL DEFENDERS ELIMINATED (SPAWNS LOCKED!)`;
        this.captureBarEl.style.width = '100%';
        this.captureBarEl.style.backgroundColor = '#f39c12';
      } else {
        this.captureTitleEl.textContent = `${enemyTeam} MAIN BASE PERIMETER — ELIMINATE ${enemyBaseInfo.defenders} DEFENDERS TO LOCK SPAWNS`;
        const clearPct = Math.max(15, 100 - enemyBaseInfo.defenders * 18);
        this.captureBarEl.style.width = `${clearPct}%`;
        this.captureBarEl.style.backgroundColor = '#e74c3c';
      }
    } else if (activeCaptureFlag) {
      this.captureStatusEl.classList.remove('hidden');
      const isFriendlyHeld = activeCaptureFlag.owner === this.player.team;
      const defStage = activeCaptureFlag.defenseStage || 0;
      const contestSuffix = activeCaptureFlag.contested
        ? ' [CONTESTED — ENEMY SPAWN LOCKED!]'
        : isFriendlyHeld
        ? ` (${activeCaptureFlag.owner} HELD • DEFENSES ${defStage}/4 — PRESS [F] TO BUILD CHEST WALL)`
        : ` (${activeCaptureFlag.owner})`;
      this.captureTitleEl.textContent = `${activeCaptureFlag.name}${contestSuffix}`;
      const norm = (activeCaptureFlag.captureProgress + 100) / 2;
      this.captureBarEl.style.width = `${norm}%`;
      this.captureBarEl.style.backgroundColor = activeCaptureFlag.contested
        ? '#f39c12'
        : activeCaptureFlag.captureProgress >= 0
        ? '#3498db'
        : '#e74c3c';
    } else {
      this.captureStatusEl.classList.add('hidden');
    }

    // Compass Heading
    let deg = Math.round(((-this.player.yaw * 180) / Math.PI) % 360);
    if (deg < 0) deg += 360;
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const dirStr = dirs[Math.round(deg / 45) % 8];
    this.compassHeadingEl.textContent = `${String(deg).padStart(3, '0')}° ${dirStr}`;

    // Dynamic Weather Status (Battlefield 2042 inspired)
    const weatherStatus = this.world.getWeatherStatus ? this.world.getWeatherStatus() : null;
    let weatherEl = document.getElementById('weather-status');
    if (weatherStatus) {
      if (!weatherEl) {
        weatherEl = document.createElement('div');
        weatherEl.id = 'weather-status';
        weatherEl.style.cssText = `
          position: fixed; top: 68px; left: 50%; transform: translateX(-50%);
          font-size: 13px; font-weight: 700; color: #f39c12;
          text-shadow: 0 1px 6px rgba(0,0,0,0.8);
          font-family: 'Rajdhani', sans-serif; letter-spacing: 2px;
          pointer-events: none; z-index: 200;
        `;
        document.body.appendChild(weatherEl);
      }
      weatherEl.textContent = weatherStatus;
      weatherEl.style.display = 'block';
    } else if (weatherEl) {
      weatherEl.style.display = 'none';
    }

    // Hitmarker decay
    if (this.hitmarkerTimer > 0) {
      this.hitmarkerTimer -= dt;
      if (this.hitmarkerTimer <= 0) {
        this.hitmarkerEl.classList.add('hidden');
      }
    }

    // Vehicle Overlay vs Infantry Scope/Crosshair
    const activeVeh = this.player.activeVehicle;
    if (activeVeh) {
      this.vehicleOverlayEl.classList.remove('hidden');
      this.scopeOverlayEl.classList.add('hidden');
      this.crosshairEl.style.opacity = '0';
      this.vehNameLabel.textContent = activeVeh.name;
      this.vehHpLabel.textContent = `VEHICLE HP: ${Math.ceil(activeVeh.hp)} / ${activeVeh.maxHp}`;
      if (this.vehSpeedLabelEl) {
        const curKmh = Math.round(Math.abs(activeVeh.forwardSpeed || 0) * 3.6);
        const maxKmh = Math.round((activeVeh.speed || 20) * 3.6);
        this.vehSpeedLabelEl.textContent = `SPEED: ${curKmh} KM/H (MAX ${maxKmh} KM/H)`;
      }
      this.interactPromptEl.classList.add('hidden');
    } else if (!this.player.downed) {
      this.vehicleOverlayEl.classList.add('hidden');
      const cur = this.player.currentWeapon();
      const opticType = this.player.getActiveOpticType();
      const inAdsOptic = Boolean(opticType && this.player.adsAmount > 0.55);

      if (inAdsOptic && this.opticFrameEl) {
        this.scopeOverlayEl.classList.remove('hidden');
        const isBlackout = opticType === 'sniper8x';
        this.scopeOverlayEl.classList.toggle('full-blackout', isBlackout);
        this.scopeOverlayEl.classList.toggle('reflex-vignette', !isBlackout);
        this.opticFrameEl.className = `optic-${opticType}`;

        const opticLabels = {
          holo: 'EOTECH EXPS3 • 1.0X HOLOGRAPHIC',
          kobra: 'KOBRA EKP-8-18 • REFLEX SIGHT',
          reddot: this.player.useCantedSight
            ? 'CANTED 45° AIMPOINT • 1.0X RED DOT'
            : 'AIMPOINT MICRO T-2 • RED DOT',
          acog: `TRIJICON ACOG • 3.4X (ZERO ${this.player.zeroDistance}M)`,
          sniper8x: `PSO-1M2 • 8.0X MIL-DOT (ZERO ${this.player.zeroDistance}M)`,
          rpgSight: 'PGO-7V • ROCKET OPTICAL GRID',
          iron: 'TRITIUM 3-DOT NIGHT SIGHTS'
        };
        if (this.opticLabelEl) {
          this.opticLabelEl.textContent = opticLabels[opticType] || 'OPTIC SIGHT';
        }
        // Subtle zoom-pulse kick on the ADS optic housing when firing (zero Y translation
        // so the aiming dot always stays locked to the exact 50vw, 50vh barrel axis)
        this.opticFrameEl.style.transform = `scale(${1 + this.player.recoilKickZ * 0.28})`;
      } else {
        this.scopeOverlayEl.classList.add('hidden');
      }

      this.crosshairEl.style.opacity = this.player.adsAmount > 0.45 ? '0' : '1';

      // Check proximity to Downed Friendlies ([F] Revive / [E] Drag), Vehicles ([E] Enter),
      // Injured Allies ([F] Heal), Ammo Crates ([F] Pick Up Ammo), or Captured Objectives ([F] Build Chest Wall)
      const downedMate = this.botManager.findNearestDownedFriendly(
        this.player.pos,
        this.player.team,
        4.5
      );
      const injuredMate =
        typeof this.player.findNearestInjuredFriendly === 'function'
          ? this.player.findNearestInjuredFriendly(4.5)
          : null;
      const nearVeh = this.vehicleManager.findNearestEnterable(
        this.player.pos,
        6.5,
        this.player.team
      );
      let nearCrate = false;
      for (const crate of this.world.ammoCrates) {
        if (crate.pos.distanceTo(this.player.pos) <= 4.5) {
          nearCrate = true;
          break;
        }
      }
      const nearFlag =
        typeof this.player.findNearbyFlag === 'function'
          ? this.player.findNearbyFlag(18)
          : activeCaptureFlag;
      const bpName =
        typeof this.player.getBlueprintName === 'function'
          ? this.player.getBlueprintName()
          : 'CHEST WALL';

      if (this.player.draggedBot) {
        this.interactPromptEl.textContent = `DRAGGING ${this.player.draggedBot.name} TO COVER • HOLD [F] TO REVIVE • PRESS [E] TO DROP`;
        this.interactPromptEl.classList.remove('hidden');
      } else if (downedMate) {
        this.interactPromptEl.textContent = `HOLD [F] TO REVIVE ${downedMate.name} (+250 XP) • PRESS [E] TO DRAG TO COVER`;
        this.interactPromptEl.classList.remove('hidden');
      } else if (nearVeh) {
        const vehPrompt = nearVeh.npcDriver
          ? `PRESS [E] TO COMMANDEER ${nearVeh.name} FROM ${nearVeh.npcDriver.name}`
          : `PRESS [E] TO ENTER ${nearVeh.name}`;
        const fSuffix = nearCrate
          ? ' • [F] PICK UP AMMO'
          : nearFlag && nearFlag.owner === this.player.team
          ? ` • [F] BUILD ${bpName}`
          : '';
        this.interactPromptEl.textContent = `${vehPrompt}${fSuffix}`;
        this.interactPromptEl.classList.remove('hidden');
      } else if (injuredMate) {
        this.interactPromptEl.textContent = `PRESS [F] TO HEAL ${injuredMate.name} (${Math.ceil(
          injuredMate.hp
        )}/100 HP)`;
        this.interactPromptEl.classList.remove('hidden');
      } else if (nearCrate) {
        this.interactPromptEl.textContent = 'PRESS [F] TO PICK UP AMMO, ROCKETS & FRAGS';
        this.interactPromptEl.classList.remove('hidden');
      } else if (nearFlag && nearFlag.owner === this.player.team) {
        const defSt = nearFlag.defenseStage || 0;
        this.interactPromptEl.textContent =
          defSt < 4
            ? `PRESS [F] TO BUILD ${bpName} & FORTIFY OBJ ${nearFlag.id} DEFENSES (${defSt}/4) • [B] CYCLE`
            : `PRESS [F] TO BUILD ${bpName} AT OBJ ${nearFlag.id} • [B] CYCLE`;
        this.interactPromptEl.classList.remove('hidden');
      } else {
        this.interactPromptEl.classList.add('hidden');
      }
    }

    // Update 360° Directional Incoming Fire & Armor Impact Indicators + Telemetry Panel
    this.updateDamageIndicators(dt);
    this.updateTelemetryPanel();

    // Vehicle Hull Armor Integrity Row + Crew Health, Armor, Bleeding, Grenades & Stance
    if (activeVeh && this.vehicleVitalsRowEl) {
      this.vehicleVitalsRowEl.classList.remove('hidden');
      const hullPct = Math.max(0, Math.min(100, (activeVeh.hp / activeVeh.maxHp) * 100));
      if (this.vehHullTagEl) {
        this.vehHullTagEl.textContent = activeVeh.type === 'tank' ? 'TANK' : 'HULL';
      }
      if (this.vehHullFillEl) this.vehHullFillEl.style.width = `${hullPct}%`;
      if (this.vehHullValEl) this.vehHullValEl.textContent = Math.ceil(activeVeh.hp);
      if (this.crewHpLabelEl) this.crewHpLabelEl.textContent = 'CREW';
      this.armorBadgeEl.textContent = `HULL ARMOR: ${Math.ceil(activeVeh.hp)}/${activeVeh.maxHp}`;
    } else {
      if (this.vehicleVitalsRowEl) this.vehicleVitalsRowEl.classList.add('hidden');
      if (this.crewHpLabelEl) this.crewHpLabelEl.textContent = 'HP';
      this.armorBadgeEl.textContent = `ARMOR: ${Math.ceil(this.player.armor)}/${this.player.maxArmor || 50}`;
    }

    this.hpValEl.textContent = Math.ceil(this.player.hp);
    this.hpFillEl.style.width = `${Math.max(0, this.player.hp)}%`;
    this.bleedBadgeEl.classList.toggle('hidden', !this.player.bleeding);
    this.stanceBadgeEl.textContent = activeVeh
      ? 'CREW PROTECTED'
      : this.player.downed
      ? 'INCAPACITATED'
      : this.player.prone
      ? 'PRONE [Z]'
      : this.player.crouching
      ? 'CROUCHED [C]'
      : 'STANDING';
    this.bandageBadgeEl.textContent = `BANDAGES: ${this.player.bandages}`;
    this.grenadeBadgeEl.textContent = `FRAGS [G]: ${this.player.grenades}`;

    // Action Progress
    const cur = this.player.currentWeapon();
    if (this.player.reviveProgress > 0 && this.player.reviveTargetBot) {
      this.actionProgressEl.classList.remove('hidden');
      this.actionLabelEl.textContent = this.player.isDraggingAlly
        ? `DRAGGING ${this.player.reviveTargetBot.name} TO SAFE COVER (STOP TO REVIVE)...`
        : `WRAPPING BANDAGE — REVIVING ${this.player.reviveTargetBot.name}...`;
      this.actionFillEl.style.width = `${Math.min(100, this.player.reviveProgress * 100)}%`;
    } else if (this.player.magPackProgress > 0) {
      this.actionProgressEl.classList.remove('hidden');
      this.actionLabelEl.textContent = 'CONSOLIDATING PARTIAL MAGAZINES [P]...';
      this.actionFillEl.style.width = `${Math.min(100, this.player.magPackProgress * 100)}%`;
    } else if (this.player.bandageProgress > 0) {
      this.actionProgressEl.classList.remove('hidden');
      this.actionLabelEl.textContent = 'WRAPPING BANDAGE...';
      this.actionFillEl.style.width = `${Math.min(100, this.player.bandageProgress * 100)}%`;
    } else if (this.player.reloading && cur) {
      this.actionProgressEl.classList.remove('hidden');
      this.actionLabelEl.textContent = this.player.fastReload
        ? 'SPEED RELOAD (MAG DROPPED)...'
        : 'TACTICAL RELOAD (MAG RETAINED)...';
      const totalTime = cur.def.reloadTime * (this.player.fastReload ? 0.62 : 1.0);
      const pct = 1 - this.player.reloadTimer / totalTime;
      this.actionFillEl.style.width = `${Math.max(0, Math.min(100, pct * 100))}%`;
    } else {
      this.actionProgressEl.classList.add('hidden');
    }

    if (activeVeh) {
      this.weaponNameEl.textContent = activeVeh.name;
      if (activeVeh.weaponType === 'tank_cannon') {
        this.ammoClipEl.textContent = activeVeh.fireCooldown > 0 ? 'LOAD' : 'RDY';
        this.ammoReserveEl.textContent = 'APHE';
        this.fireModeEl.textContent = '120MM CANNON [LMB] + COAX MG [SPACE]';
      } else {
        this.ammoClipEl.textContent = 'INF';
        this.ammoReserveEl.textContent = 'BELT';
        this.fireModeEl.textContent =
          activeVeh.weaponType === 'autocannon'
            ? '30MM HE-FRAG AUTOCANNON'
            : '.50 CAL BROWNING HMG';
      }
      if (this.magBarsRowEl) this.magBarsRowEl.innerHTML = '';
    } else if (cur) {
      this.weaponNameEl.textContent = cur.def.name;
      this.ammoClipEl.textContent = cur.clip;
      this.ammoReserveEl.textContent = cur.reserve;
      this.fireModeEl.textContent = cur.def.caliber;
      this.updateMagBars(cur);
    }

    // Update Zeroing, Canted Sight, and Fortification Blueprint Badges
    if (this.zeroBadgeEl) {
      this.zeroBadgeEl.textContent = `ZERO [X]: ${this.player.zeroDistance}m`;
    }
    if (this.cantedBadgeEl && cur) {
      this.cantedBadgeEl.textContent = cur.def.hasCantedSight
        ? `OPTIC [V]: ${this.player.useCantedSight ? 'CANTED 45°' : 'PRIMARY'}`
        : 'OPTIC: PRIMARY';
    }
    if (this.blueprintBadgeEl) {
      const bpName =
        typeof this.player.getBlueprintName === 'function'
          ? this.player.getBlueprintName()
          : 'CHEST WALL';
      this.blueprintBadgeEl.textContent = `BUILD [F / B]: ${bpName}`;
    }

    for (let i = 0; i < 4; i++) {
      const slotEl = document.getElementById(`slot-${i + 1}`);
      if (slotEl) {
        slotEl.classList.toggle('active', i === this.player.currentSlotIndex && !activeVeh);
      }
    }

    // Throttled HUD updates to eliminate 60Hz DOM layout thrashing & boost FPS
    this._rosterTimer -= dt;
    if (this._rosterTimer <= 0) {
      this._rosterTimer = UI.ROSTER_UPDATE_INTERVAL; // 4 Hz
      const remoteCount = this.network.remotePlayers.size;
      if (this.network && this.network.isMultiplayer()) {
        this.netLabelEl.textContent = `🌐 MULTIPLAYER [${this.network.roomCode}] • ${
          1 + remoteCount
        } PLAYERS • ${this.botManager.bots.length} BOTS`;
      } else {
        this.netLabelEl.textContent = `🎮 SINGLEPLAYER (OFFLINE) • ${this.botManager.bots.length} AI BOTS`;
      }
      this.updateCommandOrderHud();
      this.updateSquadRoster();
    }

    this._markerTimer -= dt;
    if (this._markerTimer <= 0) {
      this._markerTimer = UI.MARKER_UPDATE_INTERVAL; // 20 Hz
      this.updateWorldSpaceMarkers();
    }

    this._minimapTimer -= dt;
    if (this._minimapTimer <= 0) {
      this._minimapTimer = UI.MINIMAP_UPDATE_INTERVAL; // 15 Hz
      this.drawMinimap();
      const cmdMapCanvas = document.getElementById('cmd-tactical-map-canvas');
      if (cmdMapCanvas) {
        this.drawCommandTacticalMap(cmdMapCanvas);
      }
    }

    // Suppression visual overlay (Squad-style screen darkening when suppressed)
    this.updateSuppressionOverlay();

    // Kill streak HUD badge + War Crimes (Medics Killed) HUD badge
    this.updateKillStreakBadge();
    this.updateWarCrimeBadge();

    // Commander UAV HUD indicator
    this.updateUAVOverlay();

    // Commo Rose chat callout decay
    this.updateCommoCallout(dt);

    // Airstrike inbound countdown
    this.updateAirstrikeHUD();
  }

  // Kill Streak HUD Badge (bottom-right corner, shows active streak)
  updateKillStreakBadge() {
    let el = document.getElementById('kill-streak-badge');
    const sbOpen = this.scoreboardEl && !this.scoreboardEl.classList.contains('hidden');
    if (this.player.killStreak >= 3 && !sbOpen) {
      if (!el) {
        el = document.createElement('div');
        el.id = 'kill-streak-badge';
        el.style.cssText = `
          position: fixed; bottom: 165px; right: 18px;
          font-size: 14px; font-weight: 700; color: #f39c12;
          text-shadow: 0 1px 6px rgba(0,0,0,0.8);
          font-family: 'Rajdhani', sans-serif; letter-spacing: 2px;
          pointer-events: none; z-index: 200;
        `;
        document.body.appendChild(el);
      }
      el.textContent = `🔥 STREAK: ${this.player.killStreak}`;
      el.style.display = 'block';
    } else if (el) {
      el.style.display = 'none';
    }
  }

  // War Crimes HUD Badge (shows enemy Medics eliminated by the player)
  updateWarCrimeBadge() {
    let el = document.getElementById('war-crime-badge');
    const crimes = this.player.medicKills || 0;
    const sbOpen = this.scoreboardEl && !this.scoreboardEl.classList.contains('hidden');
    if (crimes > 0 && !sbOpen) {
      if (!el) {
        el = document.createElement('div');
        el.id = 'war-crime-badge';
        el.style.cssText = `
          position: fixed; bottom: 188px; right: 18px;
          font-size: 13px; font-weight: 800; color: #ff6b6b;
          background: rgba(192, 57, 43, 0.22);
          border: 1px solid rgba(231, 76, 60, 0.55);
          padding: 3px 10px; border-radius: 4px;
          text-shadow: 0 1px 6px rgba(0,0,0,0.9);
          font-family: 'Rajdhani', sans-serif; letter-spacing: 1.5px;
          pointer-events: none; z-index: 200;
        `;
        document.body.appendChild(el);
      }
      el.textContent = `⚠️ WAR CRIMES (MEDICS KILLED): ${crimes}`;
      el.style.display = 'block';
    } else if (el) {
      el.style.display = 'none';
    }
  }

  // ─── COMMANDER & SQUAD TACTICAL ORDER WHEEL / COMMO ROSE [Y] ─────────────
  openCommoRose() {
    let el = document.getElementById('commo-rose');
    if (el) el.remove();

    el = document.createElement('div');
    el.id = 'commo-rose';
    el.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: 360px; height: 360px; border-radius: 50%;
      background: radial-gradient(circle, rgba(10,16,24,0.92) 32%, rgba(10,16,24,0.68) 72%, transparent 100%);
      border: 2px solid rgba(241,196,15,0.45);
      z-index: 9999; pointer-events: auto;
      font-family: 'Rajdhani', 'Segoe UI', sans-serif;
    `;

    const scopeStr =
      this.player.commandScope === 'ALL'
        ? '★ ALL 5 SQUADS (40)'
        : `▲ ${this.player.squad || 'ALPHA'} SQUAD (8)`;

    const commands = [
      { id: 'atk_a', label: '[1] ⚔️ ATTACK OBJ A', angle: 0, order: { action: 'OBJECTIVE', flagId: 'A' } },
      { id: 'atk_b', label: '[2] ⚔️ ATTACK OBJ B', angle: 45, order: { action: 'OBJECTIVE', flagId: 'B' } },
      { id: 'atk_c', label: '[3] ⚔️ ATTACK OBJ C', angle: 90, order: { action: 'OBJECTIVE', flagId: 'C' } },
      { id: 'atk_d', label: '[4] ⚔️ ATTACK OBJ D', angle: 135, order: { action: 'OBJECTIVE', flagId: 'D' } },
      { id: 'atk_e', label: '[5] ⚔️ ATTACK OBJ E', angle: 180, order: { action: 'OBJECTIVE', flagId: 'E' } },
      { id: 'follow_me', label: '[6] 🏃 FOLLOW ME', angle: 225, order: { action: 'FOLLOW' } },
      { id: 'hold_position', label: '[7] 🛡️ DEFEND HERE', angle: 270, order: { action: 'HOLD' } },
      { id: 'toggle_scope', label: '[8] 🔄 SCOPE: ALL / SQUAD', angle: 315, order: { action: 'TOGGLE_SCOPE' } }
    ];

    commands.forEach((cmd) => {
      const btn = document.createElement('div');
      const rad = ((cmd.angle - 90) * Math.PI) / 180;
      const dist = 128;
      const bx = Math.cos(rad) * dist;
      const by = Math.sin(rad) * dist;
      btn.className = 'commo-rose-btn';
      btn.dataset.cmd = cmd.id;
      btn.textContent = cmd.label;
      btn.style.cssText = `
        position: absolute; top: 50%; left: 50%;
        transform: translate(calc(-50% + ${bx}px), calc(-50% + ${by}px));
        padding: 6px 11px; font-size: 11.5px; font-weight: 900;
        color: #ecf0f1; background: rgba(24, 38, 52, 0.94);
        border: 1.5px solid rgba(241,196,15,0.45); border-radius: 4px;
        cursor: pointer; letter-spacing: 0.8px; text-align: center;
        white-space: nowrap; user-select: none;
        box-shadow: 0 3px 10px rgba(0,0,0,0.65);
        transition: background 0.1s, transform 0.1s;
      `;
      btn.addEventListener('mouseenter', () => {
        btn.style.background = '#f39c12';
        btn.style.borderColor = '#f1c40f';
        btn.style.color = '#111';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'rgba(24, 38, 52, 0.94)';
        btn.style.borderColor = 'rgba(241,196,15,0.45)';
        btn.style.color = '#ecf0f1';
      });
      btn.addEventListener('click', () => {
        if (cmd.order.action === 'TOGGLE_SCOPE') {
          this.setCommandScope(this.player.commandScope === 'ALL' ? 'SQUAD' : 'ALL');
          this.openCommoRose();
          return;
        }
        this.issueHudStrategicOrder(cmd.order);
        this.closeCommoRose();
      });
      el.appendChild(btn);
    });

    // Center label showing active scope & key instructions + Formation Spacing buttons [- / +]
    const center = document.createElement('div');
    center.style.cssText = `
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      font-size: 10.5px; color: #f1c40f; letter-spacing: 1px; font-weight: 900;
      text-align: center; line-height: 1.35; pointer-events: auto;
    `;
    center.innerHTML = `
      <div style="color:#fff;font-size:11.5px;pointer-events:none;">COMMAND WHEEL [Y]</div>
      <div style="color:#2ecc71;pointer-events:none;">${scopeStr}</div>
      <div style="color:#95a5a6;font-size:9px;margin-bottom:4px;pointer-events:none;">PRESS [1-8] OR [- / +]</div>
      <div style="display:flex;gap:4px;justify-content:center;">
        <button id="wheel-spacing-close" type="button" style="background:rgba(41,128,185,0.85);color:#fff;border:1px solid #3498db;border-radius:3px;padding:3px 6px;font-size:9.5px;font-weight:900;cursor:pointer;">[-] CLOSE</button>
        <button id="wheel-spacing-fan" type="button" style="background:rgba(39,174,96,0.85);color:#fff;border:1px solid #2ecc71;border-radius:3px;padding:3px 6px;font-size:9.5px;font-weight:900;cursor:pointer;">[+] FAN OUT</button>
      </div>
    `;
    el.appendChild(center);

    document.body.appendChild(el);

    const closeSpBtn = document.getElementById('wheel-spacing-close');
    if (closeSpBtn) {
      closeSpBtn.addEventListener('click', () => {
        this.issueHudFormationSpacing('STAY_CLOSE');
        this.closeCommoRose();
      });
    }
    const fanSpBtn = document.getElementById('wheel-spacing-fan');
    if (fanSpBtn) {
      fanSpBtn.addEventListener('click', () => {
        this.issueHudFormationSpacing('FAN_OUT');
        this.closeCommoRose();
      });
    }
  }

  closeCommoRose() {
    const el = document.getElementById('commo-rose');
    if (el) el.remove();
  }

  // Show callout above player's head when a commo command is sent
  showCommoCallout(commandId, text, icon) {
    let el = document.getElementById('commo-callout');
    if (!el) {
      el = document.createElement('div');
      el.id = 'commo-callout';
      el.style.cssText = `
        position: fixed; top: 62%; left: 50%; transform: translateX(-50%);
        font-size: 20px; font-weight: 800; color: #2ecc71;
        text-shadow: 0 0 12px rgba(46,204,113,0.6), 0 2px 6px rgba(0,0,0,0.9);
        letter-spacing: 3px; font-family: 'Rajdhani', sans-serif;
        pointer-events: none; z-index: 9998; opacity: 0;
        transition: opacity 0.15s ease-out;
      `;
      document.body.appendChild(el);
    }
    el.textContent = `${icon} ${text}`;
    el.style.opacity = '1';
    this._commoCalloutTimer = 2.5;
  }

  updateCommoCallout(dt) {
    if (this._commoCalloutTimer && this._commoCalloutTimer > 0) {
      this._commoCalloutTimer -= dt;
      if (this._commoCalloutTimer <= 0) {
        const el = document.getElementById('commo-callout');
        if (el) el.style.opacity = '0';
      }
    }
  }

  // ─── PROXIMITY & SQUAD TACTICAL COMMS FEED (COMPACT & NON-OBSTRUCTIVE) ──
  addTacticalCommsMessage(speakerName, role, channel, distM, text, isSelf = false) {
    let feed = document.getElementById('tactical-comms-feed');
    if (!feed) {
      feed = document.createElement('div');
      feed.id = 'tactical-comms-feed';
      feed.style.cssText = `
        position: fixed; bottom: 392px; left: 16px; width: 256px;
        display: flex; flex-direction: column; gap: 3px;
        pointer-events: none; z-index: 150;
        font-family: 'Rajdhani', 'Segoe UI', sans-serif;
      `;
      document.body.appendChild(feed);
    }

    const item = document.createElement('div');
    const isLocal = channel === 'LOCAL';
    const isCmdNet = channel === 'CMD NET';
    const isCommand = channel === 'COMMAND' || isCmdNet || isSelf;
    const badgeColor = isCommand ? '#f1c40f' : isLocal ? '#2ecc71' : '#5dade2';
    const channelLabel = isCmdNet
      ? '★CMD'
      : isCommand
      ? 'RADIO'
      : isLocal
      ? `${distM}m`
      : `${this.player.squadShort || 'ALP'}`;

    item.style.cssText = `
      background: rgba(10, 16, 22, 0.56);
      border-left: 2px solid ${badgeColor};
      border-radius: 3px;
      padding: 2.5px 6px;
      font-size: 10.5px;
      color: #ecf0f1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      transition: opacity 0.25s ease-out;
    `;
    item.innerHTML = `<span style="font-size:9px;font-weight:900;color:${badgeColor};margin-right:4px;">[${channelLabel}]</span><strong style="color:${isSelf ? '#f1c40f' : '#fff'};margin-right:4px;">${speakerName}:</strong><span style="color:#dfe6e9;">${text}</span>`;

    feed.appendChild(item);
    while (feed.children.length > 2) {
      feed.removeChild(feed.firstChild);
    }

    setTimeout(() => {
      item.style.opacity = '0';
      setTimeout(() => {
        if (item.parentNode) item.parentNode.removeChild(item);
      }, 280);
    }, 3400);
  }

  // ─── COMMANDER UAV HUD OVERLAY ──────────────────────────────────────
  updateUAVOverlay() {
    let el = document.getElementById('uav-hud');
    if (this.player.uavActive) {
      if (!el) {
        el = document.createElement('div');
        el.id = 'uav-hud';
        el.style.cssText = `
          position: fixed; top: 8px; left: 50%; transform: translateX(-50%);
          font-size: 13px; font-weight: 800; color: #00d2d3;
          background: rgba(8, 16, 24, 0.85); padding: 4px 16px;
          border: 1.5px solid rgba(0, 210, 211, 0.65); border-radius: 4px;
          font-family: 'Rajdhani', sans-serif; letter-spacing: 1.5px;
          pointer-events: none; z-index: 9990;
          text-shadow: 0 0 8px rgba(0, 210, 211, 0.55);
          white-space: nowrap;
        `;
        document.body.appendChild(el);
      }
      const infCount = (this.player.uavRevealedBots || []).filter((b) => !b.dead).length;
      const vehCount = (this.player.uavRevealedVehicles || []).filter((v) => !v.dead).length;
      const hotspot = this.player.uavHotspotFlag ? ` • HOTSPOT: OBJ ${this.player.uavHotspotFlag}` : '';
      const assists = this.player.uavAssists ? ` • ASSISTS: ${this.player.uavAssists}` : '';
      el.textContent = `📡 MQ-9 UAV DATALINK ACTIVE — ${Math.ceil(this.player.uavTimer)}s • ${infCount} INF / ${vehCount} ARMOR PAINTED${hotspot}${assists}`;
      el.style.display = 'block';
    } else if (el) {
      el.style.display = 'none';
    }
  }

  // ─── AIRSTRIKE INBOUND HUD ─────────────────────────────────────────
  updateAirstrikeHUD() {
    let el = document.getElementById('airstrike-hud');
    if (this.player.airstrikeTarget) {
      if (!el) {
        el = document.createElement('div');
        el.id = 'airstrike-hud';
        el.style.cssText = `
          position: fixed; top: 36px; left: 50%; transform: translateX(-50%);
          font-size: 15px; font-weight: 900; color: #ff6b6b;
          background: rgba(20, 8, 8, 0.85); padding: 4px 16px;
          border: 1.5px solid rgba(231, 76, 60, 0.75); border-radius: 4px;
          font-family: 'Rajdhani', sans-serif; letter-spacing: 2px;
          pointer-events: none; z-index: 9990;
          animation: airstrikeFlash 0.5s infinite alternate;
          white-space: nowrap;
        `;
        document.body.appendChild(el);
      }
      const pat = this.player.airstrikeTarget.pattern || 'CARPET';
      const patLabel =
        pat === 'BUNKER_BUSTER'
          ? '🎯 GBU-28 BUNKER BUSTER'
          : pat === 'ARTILLERY'
          ? '🌧️ 155MM ARTILLERY BARRAGE'
          : '✈️ F-15E JDAM CARPET RUN';
      const secs = Math.max(0, this.player.airstrikeTarget.timer).toFixed(1);
      el.textContent = `💥 ${patLabel} INBOUND — ${secs}s`;
      el.style.display = 'block';
    } else if (el) {
      el.style.display = 'none';
    }
  }

  updateMagBars(cur) {
    if (!this.magBarsRowEl) return;
    if (!cur.mags || cur.def.clipSize <= 1) {
      if (this._lastMagSignature !== 'EMPTY') {
        this._lastMagSignature = 'EMPTY';
        this.magBarsRowEl.innerHTML = '';
      }
      return;
    }
    const sig = `${cur.def.name}:${cur.clip}:${cur.reserve}:${cur.mags.join(',')}`;
    if (sig === this._lastMagSignature) return;
    this._lastMagSignature = sig;
    // Render active clip + reserve magazines as BattleBit vertical magazine fill bars
    const allMags = [
      { count: cur.clip, active: true },
      ...cur.mags.map((m) => ({ count: m, active: false }))
    ];
    this.magBarsRowEl.innerHTML = allMags
      .map((m) => {
        const pct = Math.max(0, Math.min(100, Math.round((m.count / cur.def.clipSize) * 100)));
        const fillCol = pct < 35 ? '#e74c3c' : m.active ? '#2ecc71' : '#f1c40f';
        return `<div class="mag-pill" style="border-color:${
          m.active ? '#2ecc71' : 'rgba(255,255,255,0.28)'
        }"><div class="mag-pill-fill" style="height:${pct}%;background:${fillCol}"></div></div>`;
      })
      .join('');
  }

  updateSquadRoster() {
    if (!this.squadListBodyEl) return;
    const playerSquadId = this.player.squad || 'ALPHA';
    const squadBots = this.botManager.bots.filter(
      (b) => b.team === this.player.team && b.squad === playerSquadId
    );
    const totalSqScore =
      (this.player.score || 0) + squadBots.reduce((acc, b) => acc + (b.score || 0), 0);
    if (this.squadHeaderTitleEl) {
      this.squadHeaderTitleEl.textContent = `★ ${playerSquadId} SQUAD • ${totalSqScore} PTS`;
    }
    const selfRankLabel =
      this.player.commandRank === 'COMMANDER'
        ? 'CMD'
        : this.player.commandRank === 'SQUAD_LEADER'
          ? 'SL'
          : 'MBR';
    const rows = [
      {
        name: `YOU (${selfRankLabel})`,
        role: this.player.role.toUpperCase().slice(0, 3),
        hp: Math.ceil(this.player.hp),
        downed: this.player.downed,
        dead: this.player.dead
      },
      ...squadBots.slice(0, 4).map((b) => ({
        name: `${b.isCommander ? '★' : b.isSquadLeader ? '▲' : ''}${b.name}`,
        role: b.isSquadLeader ? 'SL' : b.role.slice(0, 3),
        hp: Math.ceil(b.hp),
        downed: b.downed,
        dead: b.dead
      }))
    ];

    this.squadListBodyEl.innerHTML = rows
      .map((r) => {
        const isDown = r.dead || r.downed;
        const statusText = r.dead ? 'KIA' : r.downed ? 'BLEEDING' : `${r.hp} HP`;
        return `<div class="squad-member-row">
          <div><span class="sq-role">[${r.role}]</span> <span class="sq-name">${r.name}</span></div>
          <span class="sq-status ${isDown ? 'down' : 'ok'}">${statusText}</span>
        </div>`;
      })
      .join('');
  }

  updateWorldSpaceMarkers() {
    if (!this.worldMarkersEl) return;
    const cam = this.player.camera;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const inAds = this.player.adsAmount > 0.25;
    const isPlayerMedic = String(this.player.role || '').toUpperCase() === 'MEDIC';
    const htmlParts = [];

    const projVec = this._projVec || (this._projVec = new THREE.Vector3());
    const projectToScreen = (worldPos, yOffset = 0) => {
      projVec.set(worldPos.x, worldPos.y + yOffset, worldPos.z).project(cam);
      if (projVec.z > 1) return null;
      const sx = Math.round((projVec.x * 0.5 + 0.5) * w);
      const sy = Math.round((-projVec.y * 0.5 + 0.5) * h);
      const centerDist = Math.hypot(sx - cx, sy - cy);
      return { x: sx, y: sy, centerDist };
    };

    // Sightline Auto-Fade: markers near the crosshair fade strongly in both Hipfire and ADS
    // so they never obstruct enemies standing behind or near friendly units/objectives!
    const getSightlineOpacity = (centerDist, baseOpacity = 0.78, minOpacity = 0.16) => {
      if (inAds) {
        return centerDist < 170 ? 0.12 : 0.26;
      }
      if (centerDist < 165) {
        const t = Math.max(0, centerDist / 165);
        return Number((minOpacity + (baseOpacity - minOpacity) * (t * t)).toFixed(2));
      }
      return baseOpacity;
    };

    // 1. 3D Floating Objective Diamonds (A-E) — compact & auto-faded near crosshair, highlighted when ordered!
    const team = this.player.team || 'US';
    const sqId = this.player.squad || 'ALPHA';
    const activeCmdOrder =
      this.player.commandScope === 'ALL'
        ? this.botManager.commanderOrders && this.botManager.commanderOrders[team]
        : this.botManager.squadOrders &&
          this.botManager.squadOrders[team] &&
          this.botManager.squadOrders[team][sqId];

    for (const flag of this.world.flags) {
      const scr = projectToScreen(flag.pos, 7.2);
      if (!scr) continue;
      const dist = Math.round(this.player.pos.distanceTo(flag.pos));
      const isOrderedFlag =
        activeCmdOrder &&
        activeCmdOrder.timer > 0 &&
        activeCmdOrder.action === 'OBJECTIVE' &&
        activeCmdOrder.flagId === flag.id;
      const bgCol =
        flag.owner === 'US'
          ? 'rgba(41, 128, 185, 0.78)'
          : flag.owner === 'RU'
          ? 'rgba(192, 57, 43, 0.78)'
          : 'rgba(127, 140, 141, 0.68)';
      const borderStyle = isOrderedFlag ? ';border:2px solid #f1c40f;box-shadow:0 0 12px #f1c40f;' : '';
      const op = getSightlineOpacity(scr.centerDist, isOrderedFlag ? 0.94 : 0.82, 0.18);
      htmlParts.push(
        `<div class="world-marker" style="left:${scr.x}px;top:${scr.y}px;opacity:${op}">
          <div class="world-flag-diamond" style="background:${bgCol}${borderStyle}"><span>${flag.id}</span></div>
          ${
            isOrderedFlag && !inAds
              ? `<div class="world-marker-dist" style="color:#f1c40f;font-weight:900;">⚔️ ORDER (${dist}m)</div>`
              : scr.centerDist > 90 && !inAds
              ? `<div class="world-marker-dist">${dist}m</div>`
              : ''
          }
        </div>`
      );
    }

    // 1b. 3D Marker for "DEFEND HERE" (HOLD) Order Position
    if (activeCmdOrder && activeCmdOrder.timer > 0 && activeCmdOrder.action === 'HOLD' && activeCmdOrder.pos) {
      const holdScr = projectToScreen(activeCmdOrder.pos, 2.6);
      if (holdScr) {
        const holdDist = Math.round(this.player.pos.distanceTo(activeCmdOrder.pos));
        const op = getSightlineOpacity(holdScr.centerDist, 0.9, 0.2);
        htmlParts.push(
          `<div class="world-marker" style="left:${holdScr.x}px;top:${holdScr.y}px;opacity:${op}">
            <div style="background:rgba(39,174,96,0.88);border:1.5px solid #f1c40f;color:#fff;font-size:10px;font-weight:900;padding:2px 6px;border-radius:3px;white-space:nowrap;">🛡️ DEFEND HERE (${holdDist}m)</div>
          </div>`
        );
      }
    }

    // 2. Friendly Chevrons, Clustered Downed '+' Micro-Dots, and Spotted Enemy Diamonds
    //    (Zero bulky text banners on the horizon — clusters of downed allies merge into a single tiny '+N' dot!)
    const maxDownedIconDist = isPlayerMedic ? 42 : 28;
    const downedClusters = [];

    for (const bot of this.botManager.bots) {
      if (bot.dead) continue;
      const dist = this.player.pos.distanceTo(bot.pos);

      if (bot.team === this.player.team) {
        if (bot.downed && dist < maxDownedIconDist) {
          const scr = projectToScreen(bot.pos, 1.05);
          if (scr) {
            // Merge nearby downed markers within 52px on screen so clusters of casualties never stack!
            let merged = false;
            for (const cl of downedClusters) {
              if (Math.hypot(cl.x - scr.x, cl.y - scr.y) < 52) {
                cl.count++;
                if (dist < cl.minDist) {
                  cl.minDist = dist;
                  cl.x = scr.x;
                  cl.y = scr.y;
                  cl.centerDist = scr.centerDist;
                  cl.closestBot = bot;
                }
                if (bot.rescuer && !bot.rescuer.dead && !bot.rescuer.downed) {
                  cl.hasRescuer = true;
                  if (bot.rescuer.rescueState === 'REVIVE') cl.isReviving = true;
                }
                merged = true;
                break;
              }
            }
            if (!merged) {
              const hasRescuer = Boolean(bot.rescuer && !bot.rescuer.dead && !bot.rescuer.downed);
              const isReviving = Boolean(hasRescuer && bot.rescuer.rescueState === 'REVIVE');
              downedClusters.push({
                x: scr.x,
                y: scr.y,
                centerDist: scr.centerDist,
                minDist: dist,
                count: 1,
                closestBot: bot,
                hasRescuer,
                isReviving
              });
            }
          }
        } else if (!bot.downed && !bot.drivingVehicle && dist < 55) {
          const scr = projectToScreen(bot.pos, 2.2);
          if (scr) {
            const color = bot.inPlayerSquad
              ? '#2ecc71'
              : bot.role === 'MEDIC'
              ? '#7bed9f'
              : '#48dbfb';
            const op = getSightlineOpacity(scr.centerDist, 0.68, 0.14);
            // Only show a short name when very close (< 8m) and outside the central aiming reticle
            const showShortName = dist < 8 && scr.centerDist > 85 && !inAds;
            htmlParts.push(
              `<div class="world-marker" style="left:${scr.x}px;top:${scr.y}px;opacity:${op}">
                <div class="world-ally-chevron" style="border-top-color:${color}"></div>
                ${
                  showShortName
                    ? `<div class="world-marker-dist" style="color:${color}">${bot.name}</div>`
                    : ''
                }
              </div>`
            );
          }
        }
      } else if (
        !bot.downed &&
        ((bot.spottedTimer > 0 && dist < 160) || (bot.uavRevealed && dist < 380))
      ) {
        const scr = projectToScreen(bot.pos, 2.25);
        if (scr) {
          const op = getSightlineOpacity(scr.centerDist, bot.uavRevealed ? 0.88 : 0.85, 0.25);
          htmlParts.push(
            `<div class="world-marker" style="left:${scr.x}px;top:${scr.y}px;opacity:${op}">
              <div class="world-spot-diamond"></div>
              ${
                bot.uavRevealed && scr.centerDist > 95 && !inAds && dist < 180
                  ? `<div class="world-marker-dist" style="color:#ff5252">${Math.round(dist)}m</div>`
                  : ''
              }
            </div>`
          );
        }
      }
    }

    // 2a. UAV-Revealed Enemy Armor & Vehicles (3D Orange Target Boxes in World View!)
    if (this.player.uavActive && this.vehicleManager && this.vehicleManager.vehicles) {
      for (const v of this.vehicleManager.vehicles) {
        if (v.dead || v.team === this.player.team || !v.uavRevealed) continue;
        const vDist = Math.round(this.player.pos.distanceTo(v.pos));
        if (vDist > 420) continue;
        const scr = projectToScreen(v.pos, 3.4);
        if (scr) {
          const op = getSightlineOpacity(scr.centerDist, 0.92, 0.28);
          const vTypeLabel =
            v.type === 'tank' ? 'TANK' : v.type === 'apc' ? 'BTR/APC' : 'ARMORED CAR';
          htmlParts.push(
            `<div class="world-marker" style="left:${scr.x}px;top:${scr.y}px;opacity:${op}">
              <div style="background:rgba(211,84,0,0.88);border:1.5px solid #f1c40f;color:#fff;font-size:9.5px;font-weight:900;padding:1.5px 5px;border-radius:3px;white-space:nowrap;">⚠️ ${v.team} ${vTypeLabel} (${vDist}m)</div>
            </div>`
          );
        }
      }
    }

    // 2a-2. 3D Inbound Airstrike Target Marker in World View
    if (this.player.airstrikeTarget && this.player.airstrikeTarget.pos) {
      const aPos = this.player.airstrikeTarget.pos;
      const aScr = projectToScreen(aPos, 2.5);
      if (aScr) {
        const aDist = Math.round(this.player.pos.distanceTo(aPos));
        const aSecs = Math.max(0, this.player.airstrikeTarget.timer).toFixed(1);
        htmlParts.push(
          `<div class="world-marker" style="left:${aScr.x}px;top:${aScr.y}px;opacity:0.95">
            <div style="background:rgba(192,57,43,0.92);border:1.5px solid #ff7675;color:#fff;font-size:10.5px;font-weight:900;padding:2px 7px;border-radius:3px;white-space:nowrap;box-shadow:0 0 12px rgba(231,76,60,0.85);">💥 STRIKE TARGET ${aSecs}s (${aDist}m)</div>
          </div>`
        );
      }
    }

    // Render merged downed ally micro-dots (14px '+' circle; only shows '[F]' prompt within 5m reach)
    for (const cl of downedClusters) {
      const stateClass = cl.isReviving ? 'reviving' : cl.hasRescuer ? 'enroute' : '';
      const dotLabel = cl.count > 1 ? `+${cl.count}` : '+';
      const op = cl.minDist <= 4.8 ? 0.85 : getSightlineOpacity(cl.centerDist, 0.65, 0.15);
      const closePrompt =
        cl.minDist <= 4.8 && !inAds
          ? `<div class="world-marker-dist">[F] REVIVE • [E] DRAG (${cl.closestBot.name})</div>`
          : '';
      htmlParts.push(
        `<div class="world-marker" style="left:${cl.x}px;top:${cl.y}px;opacity:${op}">
          <div class="world-revive-dot ${stateClass}">${dotLabel}</div>
          ${closePrompt}
        </div>`
      );
    }

    // 2b. Remote Multiplayer Human Teammates
    if (this.network && this.network.remotePlayers) {
      for (const rp of this.network.remotePlayers.values()) {
        if (rp.dead || rp.team !== this.player.team) continue;
        const dist = this.player.pos.distanceTo(rp.pos);
        if (dist < 100) {
          const scr = projectToScreen(rp.pos, 2.3);
          if (scr) {
            const inSq = rp.squad === this.player.squad;
            const color = inSq ? '#2ecc71' : '#f1c40f';
            const op = getSightlineOpacity(scr.centerDist, 0.82, 0.22);
            htmlParts.push(
              `<div class="world-marker" style="left:${scr.x}px;top:${scr.y}px;opacity:${op}">
                <div class="world-ally-chevron" style="border-top-color:${color}"></div>
                ${
                  scr.centerDist > 75 && !inAds
                    ? `<div class="world-marker-dist" style="color:${color}">${rp.name}</div>`
                    : ''
                }
              </div>`
            );
          }
        }
      }
    }

    // 3. 3D Squad Ping [MMB]
    if (this.player.activePing) {
      const ping = this.player.activePing;
      const scr = projectToScreen(ping.pos, 0.6);
      if (scr) {
        const dist = Math.round(this.player.pos.distanceTo(ping.pos));
        const col = ping.isEnemy ? '#ff2e2e' : '#f1c40f';
        htmlParts.push(
          `<div class="world-marker" style="left:${scr.x}px;top:${scr.y}px;opacity:0.85">
            <div class="world-ping-diamond" style="background:${col}"></div>
            <div class="world-marker-dist" style="color:${col}">${dist}m</div>
          </div>`
        );
      }
    }

    const newHtml = htmlParts.join('');
    if (newHtml !== this._lastWorldMarkersHtml) {
      this._lastWorldMarkersHtml = newHtml;
      this.worldMarkersEl.innerHTML = newHtml;
    }
  }

  drawMinimap() {
    const ctx = this.minimapCtx;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;
    const scale = 0.62;

    ctx.fillStyle = '#182419';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w / 2, h / 2);

    // River strip
    ctx.fillStyle = '#1f4e68';
    ctx.fillRect((-18 - this.player.pos.x) * scale, -h * 2, 36 * scale, h * 4);

    // Main Highway Road & 3 Bridges
    ctx.fillStyle = '#2d3436';
    ctx.fillRect(
      (-380 - this.player.pos.x) * scale,
      (-7 - this.player.pos.z) * scale,
      760 * scale,
      14 * scale
    );
    ctx.fillRect(
      (-22 - this.player.pos.x) * scale,
      (-118 - this.player.pos.z) * scale,
      44 * scale,
      16 * scale
    );
    ctx.fillRect(
      (-22 - this.player.pos.x) * scale,
      (102 - this.player.pos.z) * scale,
      44 * scale,
      16 * scale
    );

    // 5 Conquest Flags
    for (const flag of this.world.flags) {
      const fx = (flag.pos.x - this.player.pos.x) * scale;
      const fz = (flag.pos.z - this.player.pos.z) * scale;
      ctx.strokeStyle =
        flag.owner === 'US' ? '#3498db' : flag.owner === 'RU' ? '#e74c3c' : '#95a5a6';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(fx, fz, flag.radius * scale, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(flag.id, fx, fz + 3.5);
    }

    // Vehicles on Minimap
    for (const v of this.vehicleManager.vehicles) {
      if (v.dead) continue;
      const vx = (v.pos.x - this.player.pos.x) * scale;
      const vz = (v.pos.z - this.player.pos.z) * scale;
      ctx.fillStyle = v.team === 'US' ? '#74b9ff' : '#ff7675';
      ctx.fillRect(vx - 3.5, vz - 3.5, 7, 7);
    }

    // Rally Point on Minimap (green diamond)
    if (this.player.rallyPoint && this.player.rallyPoint.timer > 0) {
      const rx = (this.player.rallyPoint.pos.x - this.player.pos.x) * scale;
      const rz = (this.player.rallyPoint.pos.z - this.player.pos.z) * scale;
      ctx.fillStyle = '#2ecc71';
      ctx.save();
      ctx.translate(rx, rz);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-4, -4, 8, 8);
      ctx.restore();
    }

    // Insertion Beacon on Minimap (cyan diamond)
    if (this.player.insertionBeacon && this.player.insertionBeacon.spawnsLeft > 0) {
      const bx = (this.player.insertionBeacon.pos.x - this.player.pos.x) * scale;
      const bz = (this.player.insertionBeacon.pos.z - this.player.pos.z) * scale;
      ctx.fillStyle = '#00d2d3';
      ctx.save();
      ctx.translate(bx, bz);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-3.5, -3.5, 7, 7);
      ctx.restore();
    }

    // Active Airstrike Target Zone on Minimap (pulsing red ring)
    if (this.player.airstrikeTarget) {
      const ax = (this.player.airstrikeTarget.pos.x - this.player.pos.x) * scale;
      const az = (this.player.airstrikeTarget.pos.z - this.player.pos.z) * scale;
      ctx.strokeStyle = 'rgba(231, 76, 60, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ax, az, 10 * scale, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Ammo Crates on Minimap (green squares)
    if (this.world.ammoCrates) {
      for (const crate of this.world.ammoCrates) {
        const cx = (crate.pos.x - this.player.pos.x) * scale;
        const cz = (crate.pos.z - this.player.pos.z) * scale;
        ctx.fillStyle = '#27ae60';
        ctx.fillRect(cx - 2.5, cz - 2.5, 5, 5);
      }
    }

    // UAV-Revealed & Spotted Enemy Bots on Minimap (red diamonds)
    for (const bot of this.botManager.bots) {
      if (bot.dead || bot.team === this.player.team) continue;
      if (bot.uavRevealed || (bot.spottedTimer && bot.spottedTimer > 0)) {
        const ex = (bot.pos.x - this.player.pos.x) * scale;
        const ez = (bot.pos.z - this.player.pos.z) * scale;
        ctx.fillStyle = '#ff3838';
        ctx.beginPath();
        ctx.arc(ex, ez, 2.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Friendly Bots & Downed Revive Crosses
    for (const bot of this.botManager.bots) {
      if (bot.dead || bot.team !== this.player.team) continue;
      const bx = (bot.pos.x - this.player.pos.x) * scale;
      const bz = (bot.pos.z - this.player.pos.z) * scale;
      if (bot.downed) {
        ctx.fillStyle = '#ff5252';
        ctx.fillRect(bx - 3, bz - 1, 6, 2);
        ctx.fillRect(bx - 1, bz - 3, 2, 6);
      } else {
        ctx.fillStyle = bot.inPlayerSquad ? '#2ecc71' : '#5dade2';
        ctx.beginPath();
        ctx.arc(bx, bz, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Incoming Fire Threat Vectors on Minimap
    for (const ind of this.damageIndicators) {
      const tx = (ind.attackerPos.x - this.player.pos.x) * scale;
      const tz = (ind.attackerPos.z - this.player.pos.z) * scale;
      ctx.strokeStyle = ind.isArmorHit ? 'rgba(255, 159, 26, 0.9)' : 'rgba(255, 55, 55, 0.9)';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(tx, tz);
      ctx.stroke();

      ctx.fillStyle = ind.isArmorHit ? '#ff9f1a' : '#ff3737';
      ctx.beginPath();
      ctx.arc(tx, tz, 4.0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Local Player + View Cone
    ctx.save();
    ctx.rotate(-this.player.yaw);
    ctx.fillStyle = 'rgba(241, 196, 15, 0.2)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-18, -38);
    ctx.lineTo(18, -38);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#f1c40f';
    ctx.beginPath();
    ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  drawDeployMap() {
    // Update spawn buttons so only Main Base, Squad, and Occupied Forward Flags are selectable
    const spawnBtns = document.querySelectorAll('.spawn-btn');
    spawnBtns.forEach((btn) => {
      const sp = btn.dataset.spawn;
      if (sp === 'FRIEND') {
        const peers = Array.from(this.network.remotePlayers.values());
        const hasPeer = peers.length > 0;
        btn.classList.toggle('locked-spawn', !hasPeer);
        btn.textContent = hasPeer
          ? `🟢 JOIN PLAYER: ${peers[0].name}`
          : '🟢 JOIN PLAYER (WAITING)';
        if (!hasPeer && this.selectedSpawn === 'FRIEND') {
          this.selectedSpawn = 'A';
          spawnBtns.forEach((b) => b.classList.toggle('active', b.dataset.spawn === 'A'));
        }
      } else if (sp === 'RALLY') {
        // Rally Point: available only if player has placed one
        const hasRally = Boolean(this.player.rallyPoint && this.player.rallyPoint.timer > 0);
        btn.classList.toggle('locked-spawn', !hasRally);
        btn.textContent = hasRally
          ? `🟢 RALLY POINT (${Math.ceil(this.player.rallyPoint.timer)}s)`
          : '🟢 RALLY POINT [5] (NOT PLACED)';
        if (!hasRally && this.selectedSpawn === 'RALLY') {
          this.selectedSpawn = 'BASE';
          spawnBtns.forEach((b) => b.classList.toggle('active', b.dataset.spawn === 'BASE'));
        }
      } else if (sp === 'BEACON') {
        const hasBeacon = Boolean(this.player.insertionBeacon && this.player.insertionBeacon.spawnsLeft > 0);
        btn.classList.toggle('locked-spawn', !hasBeacon);
        btn.textContent = hasBeacon
          ? `🔵 RECON BEACON (${this.player.insertionBeacon.spawnsLeft} LEFT)`
          : '🔵 RECON BEACON [6] (NONE)';
        if (!hasBeacon && this.selectedSpawn === 'BEACON') {
          this.selectedSpawn = 'BASE';
          spawnBtns.forEach((b) => b.classList.toggle('active', b.dataset.spawn === 'BASE'));
        }
      } else if (sp !== 'BASE' && sp !== 'SQUAD') {
        const flag = this.world.flags.find((f) => f.id === sp);
        const owned = Boolean(flag && flag.owner === this.selectedTeam);
        btn.classList.toggle('locked-spawn', !owned);
        if (!owned && this.selectedSpawn === sp) {
          this.selectedSpawn = 'BASE';
          spawnBtns.forEach((b) => b.classList.toggle('active', b.dataset.spawn === 'BASE'));
        }
      }
    });
    const ctx = this.deployMapCtx;
    const w = this.deployMapCanvas.width;
    const h = this.deployMapCanvas.height;

    ctx.fillStyle = '#1b281c';
    ctx.fillRect(0, 0, w, h);

    const toMapX = (wx) => (wx / 720 + 0.5) * w;
    const toMapY = (wz) => (wz / 440 + 0.5) * h;

    // North-South River
    ctx.fillStyle = '#1f536e';
    ctx.fillRect(toMapX(-20), 0, 22, h);

    // 3 Grand Bridges & Main Road Network
    ctx.fillStyle = '#2f363d';
    ctx.fillRect(0, toMapY(-8), w, 10);
    ctx.fillRect(toMapX(-24), toMapY(-116), 28, 8);
    ctx.fillRect(toMapX(-24), toMapY(104), 28, 8);

    // Base HQs
    const usX = toMapX(this.world.spawns.US_BASE.x);
    const usY = toMapY(this.world.spawns.US_BASE.z);
    ctx.fillStyle = '#3498db';
    ctx.fillRect(usX - 8, usY - 8, 16, 16);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('US HQ', usX, usY - 11);

    const ruX = toMapX(this.world.spawns.RU_BASE.x);
    const ruY = toMapY(this.world.spawns.RU_BASE.z);
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(ruX - 8, ruY - 8, 16, 16);
    ctx.fillStyle = '#fff';
    ctx.fillText('RU HQ', ruX, ruY - 11);

    // 5 Capture Flags
    for (const f of this.world.flags) {
      const fx = toMapX(f.pos.x);
      const fy = toMapY(f.pos.z);

      ctx.fillStyle =
        f.owner === 'US'
          ? 'rgba(52, 152, 219, 0.35)'
          : f.owner === 'RU'
          ? 'rgba(231, 76, 60, 0.35)'
          : 'rgba(149, 165, 166, 0.3)';
      ctx.beginPath();
      ctx.arc(fx, fy, 17, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = this.selectedSpawn === f.id ? '#2ecc71' : '#ffffff';
      ctx.lineWidth = this.selectedSpawn === f.id ? 2.5 : 1.2;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(f.id, fx, fy + 4);
    }

    // Active Vehicles on Deploy Map
    for (const v of this.vehicleManager.vehicles) {
      if (v.dead) continue;
      ctx.fillStyle = '#f1c40f';
      ctx.fillRect(toMapX(v.pos.x) - 3, toMapY(v.pos.z) - 3, 6, 6);
    }

    // 60 Active Bots dots
    for (const bot of this.botManager.bots) {
      if (bot.dead) continue;
      ctx.fillStyle = bot.team === 'US' ? '#5dade2' : '#ec7063';
      ctx.fillRect(toMapX(bot.pos.x) - 1.5, toMapY(bot.pos.z) - 1.5, 3, 3);
    }
  }

  computeBattleStats() {
    const usUnits = [];
    const ruUnits = [];

    const selfEntry = {
      name: this.player.name,
      team: this.player.team,
      squad: this.player.squad || 'ALPHA',
      squadShort: this.player.squadShort || 'ALP',
      role: this.player.role.toUpperCase(),
      kills: this.player.kills || 0,
      deaths: this.player.deaths || 0,
      revives: this.player.revives || 0,
      medicKills: this.player.medicKills || 0,
      vehiclesDestroyed: this.player.vehiclesDestroyed || 0,
      captures: this.player.captures || 0,
      score: this.player.score || 0,
      isSelf: true
    };

    if (this.player.team === 'US') usUnits.push(selfEntry);
    else ruUnits.push(selfEntry);

    for (const rp of this.network.remotePlayers.values()) {
      const entry = {
        name: rp.name,
        team: rp.team,
        squad: rp.squad || 'ALPHA',
        squadShort: 'ALP',
        role: rp.role,
        kills: rp.kills || 0,
        deaths: rp.deaths || 0,
        revives: rp.revives || 0,
        medicKills: rp.medicKills || 0,
        vehiclesDestroyed: rp.vehiclesDestroyed || 0,
        captures: rp.captures || 0,
        score: rp.score || 0
      };
      if (rp.team === 'US') usUnits.push(entry);
      else ruUnits.push(entry);
    }

    for (const b of this.botManager.bots) {
      const entry = {
        name: b.name,
        team: b.team,
        squad: b.squad || 'ALPHA',
        squadShort: b.squadShort || 'ALP',
        role: b.role,
        kills: b.kills || 0,
        deaths: b.deaths || 0,
        revives: b.revives || 0,
        medicKills: b.medicKills || 0,
        vehiclesDestroyed: b.vehiclesDestroyed || 0,
        captures: b.captures || 0,
        score: b.score || 0
      };
      if (b.team === 'US') usUnits.push(entry);
      else ruUnits.push(entry);
    }

    usUnits.sort((a, b) => b.score - a.score || b.kills - a.kills);
    ruUnits.sort((a, b) => b.score - a.score || b.kills - a.kills);

    const sumTeam = (arr, team) => ({
      team,
      tickets: Math.max(0, Math.floor(team === 'US' ? this.lastTicketsUS : this.lastTicketsRU)),
      flags: this.world.flags.filter((f) => f.owner === team).length,
      kills: arr.reduce((s, u) => s + u.kills, 0),
      deaths: arr.reduce((s, u) => s + u.deaths, 0),
      revives: arr.reduce((s, u) => s + u.revives, 0),
      medicKills: arr.reduce((s, u) => s + (u.medicKills || 0), 0),
      vehicles: arr.reduce((s, u) => s + u.vehiclesDestroyed, 0),
      score: arr.reduce((s, u) => s + u.score, 0)
    });

    const usStats = sumTeam(usUnits, 'US');
    const ruStats = sumTeam(ruUnits, 'RU');

    // Compute all 10 Tactical Squads (US ALPHA..ECHO & RU ALPHA..ECHO)
    const allUnits = [...usUnits, ...ruUnits];
    const squads = [];
    for (const team of ['US', 'RU']) {
      for (const sqDef of SQUAD_DEFS) {
        const members = allUnits.filter((u) => u.team === team && u.squad === sqDef.id);
        const sqKills = members.reduce((s, u) => s + u.kills, 0);
        const sqRevives = members.reduce((s, u) => s + u.revives, 0);
        const sqMedicKills = members.reduce((s, u) => s + (u.medicKills || 0), 0);
        const sqVehicles = members.reduce((s, u) => s + u.vehiclesDestroyed, 0);
        const sqScore = members.reduce((s, u) => s + u.score, 0);
        const hasPlayer = members.some((u) => u.isSelf);
        const leader = members[0] ? members[0].name : `${sqDef.short}-1`;
        squads.push({
          team,
          id: sqDef.id,
          short: sqDef.short,
          specialty: sqDef.specialty,
          leader,
          kills: sqKills,
          revives: sqRevives,
          medicKills: sqMedicKills,
          vehicles: sqVehicles,
          score: sqScore,
          hasPlayer
        });
      }
    }
    squads.sort((a, b) => b.score - a.score || b.kills - a.kills);

    return { usUnits, ruUnits, usStats, ruStats, squads, allUnits };
  }

  buildSideComparisonHtml(usStats, ruStats) {
    const totalPower = Math.max(
      1,
      usStats.tickets * 20 + usStats.score + (ruStats.tickets * 20 + ruStats.score)
    );
    const usAdvantagePct = Math.round(
      ((usStats.tickets * 20 + usStats.score) / totalPower) * 100
    );
    const ruAdvantagePct = 100 - usAdvantagePct;
    const verdict =
      usStats.tickets > ruStats.tickets
        ? `US FORCES DOMINATING (+${usStats.tickets - ruStats.tickets} TICKETS)`
        : ruStats.tickets > usStats.tickets
        ? `RU FORCES DOMINATING (+${ruStats.tickets - usStats.tickets} TICKETS)`
        : 'DEADLOCKED FRONTLINE';

    const usTStat = (this.ticketStats && this.ticketStats.US) || {
      gainedCapture: 0,
      lostFlags: 0,
      lostBleed: 0,
      spentSoldiers: 0,
      spentCars: 0,
      spentArmor: 0
    };
    const ruTStat = (this.ticketStats && this.ticketStats.RU) || {
      gainedCapture: 0,
      lostFlags: 0,
      lostBleed: 0,
      spentSoldiers: 0,
      spentCars: 0,
      spentArmor: 0
    };

    return `
      <div class="side-stat-box us">
        <div class="side-title-row">
          <span>US FORCES (${usStats.flags}/5 FLAGS)</span>
          <span>${usStats.tickets} TICKETS</span>
        </div>
        <div class="side-metrics-row">
          <span class="side-metric-pill">SCORE: ${usStats.score.toLocaleString()}</span>
          <span class="side-metric-pill">KILLS: ${usStats.kills}</span>
          <span class="side-metric-pill">REVIVES: ${usStats.revives}</span>
          <span class="side-metric-pill">ARMOR KILLED: ${usStats.vehicles}</span>
          <span class="side-metric-pill" style="color:#2ecc71;border-color:rgba(46,204,113,0.45)">🎟️ +${usTStat.gainedCapture} CAP / -${usTStat.lostFlags || 0} FLAG LOST • -${usTStat.spentSoldiers} INF / -${usTStat.spentCars} CAR / -${usTStat.spentArmor} ARMOR / -${Math.floor(usTStat.lostBleed || 0)} BLEED</span>
          <span class="side-metric-pill" style="color:#ff7675;border-color:rgba(231,76,60,0.45)">⚠️ WAR CRIMES (MEDICS KILLED): ${usStats.medicKills}</span>
        </div>
      </div>

      <div class="side-center-tug">
        <div class="tug-verdict">${verdict}</div>
        <div class="tug-bar-outer">
          <div class="tug-bar-us" style="width:${usAdvantagePct}%"></div>
        </div>
        <div class="tug-sub">US MOMENTUM ${usAdvantagePct}% &mdash; ${ruAdvantagePct}% RU MOMENTUM</div>
      </div>

      <div class="side-stat-box ru">
        <div class="side-title-row">
          <span>${ruStats.tickets} TICKETS</span>
          <span>RU FORCES (${ruStats.flags}/5 FLAGS)</span>
        </div>
        <div class="side-metrics-row">
          <span class="side-metric-pill">SCORE: ${ruStats.score.toLocaleString()}</span>
          <span class="side-metric-pill">KILLS: ${ruStats.kills}</span>
          <span class="side-metric-pill">REVIVES: ${ruStats.revives}</span>
          <span class="side-metric-pill">ARMOR KILLED: ${ruStats.vehicles}</span>
          <span class="side-metric-pill" style="color:#2ecc71;border-color:rgba(46,204,113,0.45)">🎟️ +${ruTStat.gainedCapture} CAP / -${ruTStat.lostFlags || 0} FLAG LOST • -${ruTStat.spentSoldiers} INF / -${ruTStat.spentCars} CAR / -${ruTStat.spentArmor} ARMOR / -${Math.floor(ruTStat.lostBleed || 0)} BLEED</span>
          <span class="side-metric-pill" style="color:#ff7675;border-color:rgba(231,76,60,0.45)">⚠️ WAR CRIMES (MEDICS KILLED): ${ruStats.medicKills}</span>
        </div>
      </div>
    `;
  }

  buildSquadLeaderboardHtml(squads) {
    return squads
      .slice(0, 5)
      .map(
        (sq, idx) => `
        <div class="sb-squad-card ${sq.team === 'US' ? 'us-sq' : 'ru-sq'} ${
          sq.hasPlayer ? 'player-sq' : ''
        }">
          <div class="sq-card-top">
            <span style="color:${sq.team === 'US' ? '#5dade2' : '#ec7063'}">${sq.team} ${
          sq.id
        }</span>
            <span class="sq-rank-badge">#${idx + 1} SQUAD</span>
          </div>
          <div class="sq-spec">${sq.specialty} &bull; LDR: ${sq.leader}</div>
          <div class="sq-stats-line">
            <span>${sq.kills}K &bull; ${sq.revives}REV &bull; ${sq.vehicles}AT &bull; <span style="color:#ff7675">⚠️${sq.medicKills}CRM</span></span>
            <span class="sq-score-val">${sq.score.toLocaleString()} PTS</span>
          </div>
        </div>
      `
      )
      .join('');
  }

  renderScoreboard() {
    const { usUnits, ruUnits, usStats, ruStats, squads } = this.computeBattleStats();

    if (this.sbClockPillEl) {
      const mins = Math.floor(this.lastMatchTime / 60);
      const secs = Math.floor(this.lastMatchTime % 60);
      this.sbClockPillEl.textContent = `${String(mins).padStart(2, '0')}:${String(
        secs
      ).padStart(2, '0')} REMAINING`;
    }

    if (this.sbSideCompEl) {
      this.sbSideCompEl.innerHTML = this.buildSideComparisonHtml(usStats, ruStats);
    }

    if (this.sbSquadGridEl) {
      this.sbSquadGridEl.innerHTML = this.buildSquadLeaderboardHtml(squads);
    }

    if (this.sbUsHeaderEl) {
      this.sbUsHeaderEl.innerHTML = `<span>US FORCES — INDIVIDUAL RANKINGS</span><span>MVP: ${
        usUnits[0] ? usUnits[0].name : '-'
      } (${usUnits[0] ? usUnits[0].score : 0} PTS)</span>`;
    }
    if (this.sbRuHeaderEl) {
      this.sbRuHeaderEl.innerHTML = `<span>RU FORCES — INDIVIDUAL RANKINGS</span><span>MVP: ${
        ruUnits[0] ? ruUnits[0].name : '-'
      } (${ruUnits[0] ? ruUnits[0].score : 0} PTS)</span>`;
    }

    const renderRows = (units) =>
      units
        .map(
          (u, idx) =>
            `<tr class="${u.isSelf ? 'self-row' : idx === 0 ? 'mvp-row' : ''}">
              <td>${idx === 0 ? '★1' : idx + 1}</td>
              <td>${u.name}${u.isSelf ? ' (YOU)' : ''}</td>
              <td><span class="sq-pill">${u.squadShort}</span></td>
              <td>${u.role.slice(0, 4)}</td>
              <td>${u.kills}</td>
              <td>${u.deaths}</td>
              <td>${u.revives}</td>
              <td>${u.vehiclesDestroyed}</td>
              <td style="color:${u.medicKills > 0 ? '#ff6b6b' : '#7f8c8d'};font-weight:${
              u.medicKills > 0 ? '800' : '400'
            }">${u.medicKills || 0}</td>
              <td><strong>${u.score.toLocaleString()}</strong></td>
            </tr>`
        )
        .join('');

    this.sbUsBody.innerHTML = renderRows(usUnits);
    this.sbRuBody.innerHTML = renderRows(ruUnits);
  }

  showVictoryScreen(winnerTeam, ticketsUS, ticketsRU, matchTimeRemaining) {
    this.lastTicketsUS = ticketsUS;
    this.lastTicketsRU = ticketsRU;
    this.lastMatchTime = matchTimeRemaining;

    const { usStats, ruStats, squads, allUnits } = this.computeBattleStats();
    if (!this.victoryScreenEl) return;

    this.victoryScreenEl.classList.remove('hidden');
    this.scoreboardEl.classList.add('hidden');

    const reason =
      ticketsUS <= 0 || ticketsRU <= 0
        ? 'CONQUEST VICTORY — ENEMY REINFORCEMENT TICKETS DEPLETED'
        : 'CONQUEST VICTORY — TIME LIMIT REACHED';
    if (this.victoryReasonTagEl) this.victoryReasonTagEl.textContent = reason;
    if (this.victoryTitleEl) {
      this.victoryTitleEl.textContent = `${winnerTeam} FORCES VICTORY`;
      this.victoryTitleEl.style.color = winnerTeam === 'US' ? '#5dade2' : '#ec7063';
    }
    if (this.victoryScorelineEl) {
      this.victoryScorelineEl.textContent = `FINAL TICKETS: US ${Math.max(
        0,
        Math.floor(ticketsUS)
      )} — RU ${Math.max(0, Math.floor(ticketsRU))} • TOTAL KILLS: ${
        usStats.kills + ruStats.kills
      } • TOTAL REVIVES: ${usStats.revives + ruStats.revives}`;
    }

    if (this.victorySideSummaryEl) {
      this.victorySideSummaryEl.innerHTML = this.buildSideComparisonHtml(usStats, ruStats);
    }
    if (this.victorySquadSummaryEl) {
      this.victorySquadSummaryEl.innerHTML = this.buildSquadLeaderboardHtml(squads);
    }

    if (this.victoryMvpCardsEl) {
      const mvpOverall = [...allUnits].sort((a, b) => b.score - a.score)[0];
      const topMedic = [...allUnits].sort((a, b) => b.revives - a.revives || b.score - a.score)[0];
      const topAt = [...allUnits].sort(
        (a, b) => b.vehiclesDestroyed - a.vehiclesDestroyed || b.score - a.score
      )[0];
      const topKiller = [...allUnits].sort((a, b) => b.kills - a.kills || b.score - a.score)[0];
      const topWarCriminal = [...allUnits].sort(
        (a, b) => (b.medicKills || 0) - (a.medicKills || 0) || b.kills - a.kills
      )[0];

      const cards = [
        {
          title: '★ MOST VALUABLE SOLDIER',
          unit: mvpOverall,
          stat: `${mvpOverall ? mvpOverall.score.toLocaleString() : 0} PTS (${
            mvpOverall ? mvpOverall.team : 'US'
          } ${mvpOverall ? mvpOverall.squad : 'ALPHA'})`
        },
        {
          title: '+ TOP FIELD MEDIC',
          unit: topMedic,
          stat: `${topMedic ? topMedic.revives : 0} FALLEN COMRADES SAVED`
        },
        {
          title: '⚡ TOP ANTI-ARMOR HUNTER',
          unit: topAt,
          stat: `${topAt ? topAt.vehiclesDestroyed : 0} TANKS & APCs DESTROYED`
        },
        {
          title: '⌖ TOP COMBAT SHARPSHOOTER',
          unit: topKiller,
          stat: `${topKiller ? topKiller.kills : 0} CONFIRMED ELIMINATIONS`
        },
        {
          title: '⚠️ GENEVA TRIBUNAL — WAR CRIMES',
          unit: topWarCriminal,
          stat: `${topWarCriminal ? topWarCriminal.medicKills || 0 : 0} ENEMY MEDICS ELIMINATED`
        }
      ];

      this.victoryMvpCardsEl.innerHTML = cards
        .map(
          (c) => `
          <div class="mvp-card">
            <div class="mvp-award-title">${c.title}</div>
            <div class="mvp-soldier-name">${c.unit ? c.unit.name : '-'}</div>
            <div class="mvp-soldier-meta">${c.stat}</div>
          </div>
        `
        )
        .join('');
    }
  }

  hideVictoryScreen() {
    if (this.victoryScreenEl) {
      this.victoryScreenEl.classList.add('hidden');
    }
  }
}
