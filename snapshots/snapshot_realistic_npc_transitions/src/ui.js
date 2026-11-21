import * as THREE from '../vendor/three.module.js';
import { SQUAD_DEFS } from './bots.js?v=21';

export class UIManager {
  constructor(world, player, botManager, vehicleManager, network) {
    this.world = world;
    this.player = player;
    this.botManager = botManager;
    this.vehicleManager = vehicleManager;
    this.network = network;

    this.selectedClass = 'engineer';
    this.selectedTeam = 'US';
    this.selectedSquad = 'ALPHA';
    this.selectedSpawn = 'A';
    this.selectedAtmos = 'DAY';

    this.lastTicketsUS = 400;
    this.lastTicketsRU = 400;
    this.lastMatchTime = 900;

    this.hitmarkerTimer = 0;

    // DOM References
    this.hudEl = document.getElementById('hud');
    this.deployScreenEl = document.getElementById('deploy-screen');
    this.scopeOverlayEl = document.getElementById('scope-overlay');
    this.opticFrameEl = document.getElementById('optic-frame');
    this.opticLabelEl = document.getElementById('optic-label');
    this.vehicleOverlayEl = document.getElementById('vehicle-overlay');
    this.vehNameLabel = document.getElementById('veh-name-label');
    this.vehHpLabel = document.getElementById('veh-hp-label');
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

    // Multiplayer Lobby Callsign, Room Code & Copy Invite Link Controls
    const callsignInput = document.getElementById('mp-callsign-input');
    const roomInput = document.getElementById('mp-room-input');
    const mpJoinBtn = document.getElementById('mp-join-btn');
    const mpCopyBtn = document.getElementById('mp-copy-invite-btn');
    const netIndBtn = document.getElementById('net-indicator-btn');

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
        if (callsignInput) this.network.setCallsign(callsignInput.value);
        if (roomInput) this.network.setRoom(roomInput.value);
        this.updateMultiplayerLobbyUI();
        this.addXpNotification(0, `🌐 JOINED MULTIPLAYER ROOM: ${this.network.roomCode}`);
      });
    }
    if (mpCopyBtn && this.network) {
      mpCopyBtn.addEventListener('click', () => {
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

      if (e.code === 'KeyO') {
        e.preventDefault();
        this.toggleMultiplayerModal();
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
        <div><b>Z</b> — Prone</div><div><b>Q / E</b> — Lean Left/Right</div>
        <div><b>LMB</b> — Fire</div><div><b>RMB</b> — ADS / Scope</div>
        <div><b>R</b> — Reload (2x = Speed)</div><div><b>H</b> — Bandage Heal</div>
        <div><b>G</b> — Frag Grenade</div><div><b>F</b> — Interact / Drag / Revive</div>
        <div><b>1-4</b> — Weapon Slots</div><div><b>5</b> — Place Rally Point</div>
        <div><b>6</b> — Recon Spawn Beacon</div><div><b>Y (Hold)</b> — Commo Rose</div>
        <div><b>U</b> — Commander UAV Scan</div><div><b>J</b> — Commander Airstrike</div>
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
    const localUrl = `http://localhost:${this.network.serverPort}/?room=${encodeURIComponent(
      this.network.roomCode
    )}`;
    if (statusEl) {
      const peerNames =
        peers.length > 0
          ? ` &bull; <span style="color:#2ecc71">ONLINE (${peers.length + 1}): YOU, ${peers
              .map((p) => `${p.name} [${p.team}]`)
              .join(', ')}</span>`
          : ' &bull; <span style="color:#95a5a6">WAITING FOR FRIENDS TO JOIN LINK</span>';
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
      width: 620px; max-width: 94vw; background: rgba(10, 18, 26, 0.96);
      border: 2px solid #2ecc71; border-radius: 8px; padding: 20px 24px;
      z-index: 10001; color: #ecf0f1; font-family: 'Rajdhani', 'Segoe UI', sans-serif;
      box-shadow: 0 12px 40px rgba(0,0,0,0.85); pointer-events: auto;
    `;
    modal.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.12);padding-bottom:10px;margin-bottom:12px;">
        <div>
          <div style="font-size:18px;font-weight:900;color:#2ecc71;letter-spacing:1.5px;">🌐 MULTIPLAYER LOBBY &amp; CO-OP INVITE [O]</div>
          <div style="font-size:11px;color:#95a5a6;">Friends on the same Wi-Fi/LAN or another browser window can join your room in real time!</div>
        </div>
        <button id="mp-modal-close-btn" style="background:#c0392b;color:#fff;border:none;border-radius:4px;padding:4px 10px;font-weight:900;cursor:pointer;">CLOSE [ESC]</button>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px;">
        <label style="font-size:12px;font-weight:700;">CALLSIGN:
          <input id="mp-modal-callsign" type="text" maxlength="18" value="${this.network.callsign}" style="background:#0d161e;color:#fff;border:1px solid rgba(255,255,255,0.25);padding:5px 8px;border-radius:4px;font-weight:800;width:130px;margin-left:4px;" />
        </label>
        <label style="font-size:12px;font-weight:700;">ROOM CODE:
          <input id="mp-modal-room" type="text" maxlength="20" value="${this.network.roomCode}" style="background:#0d161e;color:#f1c40f;border:1px solid rgba(241,196,15,0.45);padding:5px 8px;border-radius:4px;font-weight:900;width:115px;margin-left:4px;text-transform:uppercase;" />
        </label>
        <button id="mp-modal-apply-btn" style="background:#27ae60;color:#fff;border:none;border-radius:4px;padding:6px 14px;font-weight:900;cursor:pointer;">JOIN / APPLY</button>
      </div>
      <div id="mp-modal-dynamic-body"></div>
    `;
    document.body.appendChild(modal);

    document.getElementById('mp-modal-close-btn').addEventListener('click', () => modal.remove());
    document.getElementById('mp-modal-apply-btn').addEventListener('click', () => {
      const cVal = document.getElementById('mp-modal-callsign').value;
      const rVal = document.getElementById('mp-modal-room').value;
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
    this.player.deploy(this.selectedTeam, this.selectedClass, spawnVec);
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

    // Squadmate greeting over Proximity/Squad Comms upon deployment
    setTimeout(() => {
      if (this.player.dead) return;
      const mate = this.botManager.bots.find(
        (b) => !b.dead && b.team === this.player.team && b.squad === this.player.squad
      );
      if (mate) {
        this.botManager.emitBotComms(
          mate,
          this.player,
          'Squad Lead on the ground! Ready on your mark — hold [Y] for orders!',
          'SQUAD',
          true
        );
      }
    }, 550);
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

  update(dt, ticketsUS, ticketsRU, matchTimeRemaining = 900) {
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
    const usUncontestedFlags = this.world.flags.filter((f) => f.owner === 'US' && !f.contested).length;
    const ruUncontestedFlags = this.world.flags.filter((f) => f.owner === 'RU' && !f.contested).length;

    if (this.ticketRateUsEl) {
      const usRate = (usUncontestedFlags * 0.25).toFixed(2);
      this.ticketRateUsEl.textContent = `+${usRate}/s (${usFlagsHeld}F)`;
      this.ticketRateUsEl.style.color = usUncontestedFlags > 0 ? '#2ecc71' : '#95a5a6';
    }
    if (this.ticketRateRuEl) {
      const ruRate = (ruUncontestedFlags * 0.25).toFixed(2);
      this.ticketRateRuEl.textContent = `+${ruRate}/s (${ruFlagsHeld}F)`;
      this.ticketRateRuEl.style.color = ruUncontestedFlags > 0 ? '#2ecc71' : '#95a5a6';
    }

    const diff = tUS - tRU;
    const bleedText =
      usFlagsHeld > ruFlagsHeld
        ? ` • RU BLEEDING (${usFlagsHeld}-${ruFlagsHeld} FLAGS)`
        : ruFlagsHeld > usFlagsHeld
        ? ` • US BLEEDING (${usFlagsHeld}-${ruFlagsHeld} FLAGS)`
        : ` • FLAGS ${usFlagsHeld}-${ruFlagsHeld}`;

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
      const contestSuffix = activeCaptureFlag.contested
        ? ' [CONTESTED — ENEMY SPAWN LOCKED!]'
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

      // Check proximity to Downed Friendlies, Vehicles, or Ammo Crates for [F] Prompt
      const downedMate = this.botManager.findNearestDownedFriendly(
        this.player.pos,
        this.player.team,
        4.2
      );
      const nearVeh = this.vehicleManager.findNearestEnterable(
        this.player.pos,
        5.8,
        this.player.team
      );
      let nearCrate = false;
      for (const crate of this.world.ammoCrates) {
        if (crate.pos.distanceTo(this.player.pos) <= 4.5) {
          nearCrate = true;
          break;
        }
      }

      if (this.player.draggedBot) {
        this.interactPromptEl.textContent = `DRAGGING ${this.player.draggedBot.name} TO COVER • HOLD [F] TO REVIVE • TAP [F] TO DROP`;
        this.interactPromptEl.classList.remove('hidden');
      } else if (downedMate) {
        this.interactPromptEl.textContent = `PRESS [F] ONCE TO DRAG ${downedMate.name} • HOLD [F] TO REVIVE (+250 XP)`;
        this.interactPromptEl.classList.remove('hidden');
      } else if (nearVeh) {
        this.interactPromptEl.textContent = nearVeh.npcDriver
          ? `PRESS [F] TO COMMANDEER ${nearVeh.name} FROM ${nearVeh.npcDriver.name}`
          : `PRESS [F] TO ENTER ${nearVeh.name}`;
        this.interactPromptEl.classList.remove('hidden');
      } else if (nearCrate) {
        this.interactPromptEl.textContent = 'PRESS [F] TO RESUPPLY AMMO, ROCKETS & FRAGS';
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
      this.armorBadgeEl.textContent = `ARMOR: ${Math.ceil(this.player.armor)}`;
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
          : 'SANDBAG WALL';
      this.blueprintBadgeEl.textContent = `BUILD [B/T]: ${bpName}`;
    }

    for (let i = 0; i < 4; i++) {
      const slotEl = document.getElementById(`slot-${i + 1}`);
      if (slotEl) {
        slotEl.classList.toggle('active', i === this.player.currentSlotIndex && !activeVeh);
      }
    }

    const remoteCount = this.network.remotePlayers.size;
    this.netLabelEl.textContent = `${1 + remoteCount} PLAYERS • ${this.botManager.bots.length} BOTS • ${this.world.voxels.size} VOXELS`;

    this.updateSquadRoster();
    this.updateWorldSpaceMarkers();
    this.drawMinimap();

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

  // ─── COMMO ROSE / QUICK CHAT WHEEL [Y] ─────────────────────────────
  openCommoRose() {
    let el = document.getElementById('commo-rose');
    if (el) el.remove();

    el = document.createElement('div');
    el.id = 'commo-rose';
    el.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: 320px; height: 320px; border-radius: 50%;
      background: radial-gradient(circle, rgba(0,0,0,0.85) 30%, rgba(0,0,0,0.55) 70%, transparent 100%);
      border: 2px solid rgba(255,255,255,0.12);
      z-index: 9999; pointer-events: auto;
      font-family: 'Rajdhani', 'Segoe UI', sans-serif;
    `;

    const commands = [
      { id: 'go_go_go', label: 'GO GO GO!', angle: 0 },
      { id: 'contact_east', label: 'CONTACT!', angle: 45 },
      { id: 'need_ammo', label: 'NEED AMMO', angle: 90 },
      { id: 'negative', label: 'NEGATIVE', angle: 135 },
      { id: 'hold_position', label: 'HOLD POS', angle: 180 },
      { id: 'enemy_vehicle', label: 'ENEMY VEH', angle: 225 },
      { id: 'need_medic', label: 'MEDIC!', angle: 270 },
      { id: 'affirmative', label: 'AFFIRM', angle: 315 },
    ];

    commands.forEach(cmd => {
      const btn = document.createElement('div');
      const rad = (cmd.angle - 90) * Math.PI / 180;
      const dist = 115;
      const bx = Math.cos(rad) * dist;
      const by = Math.sin(rad) * dist;
      btn.className = 'commo-rose-btn';
      btn.dataset.cmd = cmd.id;
      btn.textContent = cmd.label;
      btn.style.cssText = `
        position: absolute; top: 50%; left: 50%;
        transform: translate(calc(-50% + ${bx}px), calc(-50% + ${by}px));
        padding: 6px 12px; font-size: 12px; font-weight: 700;
        color: #ecf0f1; background: rgba(44, 62, 80, 0.85);
        border: 1px solid rgba(255,255,255,0.18); border-radius: 4px;
        cursor: pointer; letter-spacing: 1.5px; text-align: center;
        white-space: nowrap; user-select: none;
        transition: background 0.1s, transform 0.1s;
      `;
      btn.addEventListener('mouseenter', () => {
        btn.style.background = 'rgba(46, 204, 113, 0.75)';
        btn.style.borderColor = '#2ecc71';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'rgba(44, 62, 80, 0.85)';
        btn.style.borderColor = 'rgba(255,255,255,0.18)';
      });
      btn.addEventListener('click', () => {
        this.player.sendCommoCommand(cmd.id);
        this.closeCommoRose();
      });
      el.appendChild(btn);
    });

    // Center label
    const center = document.createElement('div');
    center.style.cssText = `
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      font-size: 11px; color: #95a5a6; letter-spacing: 2px; font-weight: 600;
      text-align: center;
    `;
    center.textContent = 'COMMS\n[Y]';
    el.appendChild(center);

    document.body.appendChild(el);
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

  // ─── PROXIMITY & SQUAD TACTICAL COMMS FEED (SINGLE-PLAYER NPC + MULTIPLAYER) ──
  addTacticalCommsMessage(speakerName, role, channel, distM, text, isSelf = false) {
    let feed = document.getElementById('tactical-comms-feed');
    if (!feed) {
      feed = document.createElement('div');
      feed.id = 'tactical-comms-feed';
      feed.style.cssText = `
        position: fixed; bottom: 265px; left: 16px; width: 350px;
        display: flex; flex-direction: column; gap: 5px;
        pointer-events: none; z-index: 150;
        font-family: 'Rajdhani', 'Segoe UI', sans-serif;
      `;
      document.body.appendChild(feed);
    }

    const item = document.createElement('div');
    const isLocal = channel === 'LOCAL';
    const isCommand = channel === 'COMMAND' || isSelf;
    const badgeColor = isCommand ? '#f1c40f' : isLocal ? '#2ecc71' : '#5dade2';
    const badgeBg = isCommand
      ? 'rgba(241, 196, 15, 0.18)'
      : isLocal
      ? 'rgba(46, 204, 113, 0.18)'
      : 'rgba(52, 152, 219, 0.18)';
    const channelLabel = isCommand
      ? 'RADIO • OUT'
      : isLocal
      ? `PROX • ${distM}m`
      : `SQUAD • ${this.player.squadShort || 'ALP'}`;
    const roleShort = (role || 'SOLDIER').toUpperCase().slice(0, 5);

    item.style.cssText = `
      background: rgba(12, 18, 24, 0.84);
      border-left: 3px solid ${badgeColor};
      border-radius: 3px;
      padding: 5px 9px;
      font-size: 12.5px;
      color: #ecf0f1;
      box-shadow: 0 2px 8px rgba(0,0,0,0.45);
      transition: opacity 0.35s ease-out;
    `;
    item.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:1px;">
        <span style="font-size:10px;font-weight:800;color:${badgeColor};background:${badgeBg};padding:1px 5px;border-radius:2px;letter-spacing:0.8px;">${channelLabel}</span>
        <span style="font-weight:800;color:${isSelf ? '#f1c40f' : '#ffffff'};letter-spacing:0.5px;">${speakerName}</span>
        <span style="font-size:10px;color:#95a5a6;font-weight:700;">[${roleShort}]</span>
      </div>
      <div style="color:#dfe6e9;font-weight:600;line-height:1.25;">“${text}”</div>
    `;

    feed.appendChild(item);
    while (feed.children.length > 5) {
      feed.removeChild(feed.firstChild);
    }

    setTimeout(() => {
      item.style.opacity = '0';
      setTimeout(() => {
        if (item.parentNode) item.parentNode.removeChild(item);
      }, 380);
    }, 6500);
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
          font-size: 14px; font-weight: 700; color: #3498db;
          background: rgba(0,0,0,0.7); padding: 4px 16px;
          border: 1px solid rgba(52,152,219,0.5); border-radius: 4px;
          font-family: 'Rajdhani', sans-serif; letter-spacing: 2px;
          pointer-events: none; z-index: 9990;
          text-shadow: 0 0 8px rgba(52,152,219,0.5);
        `;
        document.body.appendChild(el);
      }
      el.textContent = `📡 UAV SCAN ACTIVE — ${Math.ceil(this.player.uavTimer)}s — ${this.player.uavRevealedBots.filter(b => !b.dead).length} HOSTILES`;
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
          font-size: 16px; font-weight: 800; color: #e74c3c;
          background: rgba(0,0,0,0.7); padding: 4px 16px;
          border: 1px solid rgba(231,76,60,0.5); border-radius: 4px;
          font-family: 'Rajdhani', sans-serif; letter-spacing: 2px;
          pointer-events: none; z-index: 9990;
          animation: airstrikeFlash 0.5s infinite alternate;
        `;
        document.body.appendChild(el);
      }
      const secs = Math.ceil(this.player.airstrikeTarget.timer);
      el.textContent = `💥 AIRSTRIKE INBOUND — ${secs}s`;
      el.style.display = 'block';
    } else if (el) {
      el.style.display = 'none';
    }
  }

  updateMagBars(cur) {
    if (!this.magBarsRowEl) return;
    if (!cur.mags || cur.def.clipSize <= 1) {
      this.magBarsRowEl.innerHTML = '';
      return;
    }
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
    const rows = [
      {
        name: 'YOU (LDR)',
        role: this.player.role.toUpperCase().slice(0, 3),
        hp: Math.ceil(this.player.hp),
        downed: this.player.downed,
        dead: this.player.dead
      },
      ...squadBots.slice(0, 3).map((b) => ({
        name: b.name,
        role: b.role.slice(0, 3),
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
    const htmlParts = [];

    const projectToScreen = (worldPos) => {
      const v = worldPos.clone().project(cam);
      if (v.z > 1) return null;
      return {
        x: (v.x * 0.5 + 0.5) * w,
        y: (-v.y * 0.5 + 0.5) * h
      };
    };

    // 1. 3D Floating Objective Diamonds (A-E) with live distance
    for (const flag of this.world.flags) {
      const worldPt = flag.pos.clone().add(new THREE.Vector3(0, 7.2, 0));
      const scr = projectToScreen(worldPt);
      if (!scr) continue;
      const dist = Math.round(this.player.pos.distanceTo(flag.pos));
      const bgCol =
        flag.owner === 'US'
          ? 'rgba(41, 128, 185, 0.85)'
          : flag.owner === 'RU'
          ? 'rgba(192, 57, 43, 0.85)'
          : 'rgba(127, 140, 141, 0.75)';
      htmlParts.push(
        `<div class="world-marker" style="left:${scr.x}px;top:${scr.y}px;opacity:${
          this.player.adsAmount > 0.5 ? 0.35 : 0.92
        }">
          <div class="world-flag-diamond" style="background:${bgCol}"><span>${flag.id}</span></div>
          <div class="world-marker-dist">${dist}m</div>
        </div>`
      );
    }

    // 2. Friendly Chevrons, Downed Revive Crosses, and Spotted Enemy Diamonds
    for (const bot of this.botManager.bots) {
      if (bot.dead) continue;
      const dist = this.player.pos.distanceTo(bot.pos);

      if (bot.team === this.player.team) {
        if (bot.downed && dist < 85) {
          const scr = projectToScreen(bot.pos.clone().add(new THREE.Vector3(0, 1.35, 0)));
          if (scr) {
            let badgeText = `+ REVIVE / DRAG [F]`;
            let badgeStyle = '';
            if (bot.rescuer && !bot.rescuer.dead && !bot.rescuer.downed) {
              if (bot.rescuer.rescueState === 'ASSESS_THREAT') {
                badgeText = `+ MEDIC ${bot.rescuer.name} CLEARING THREAT & POPPING SMOKE`;
                badgeStyle = 'background:rgba(230,126,34,0.95);';
              } else if (bot.rescuer.rescueState === 'DRAG') {
                badgeText = `+ ${bot.rescuer.name} DRAGGING TO COVER`;
                badgeStyle = 'background:rgba(243,156,18,0.92);';
              } else if (bot.rescuer.rescueState === 'REVIVE') {
                badgeText = `+ ${bot.rescuer.name} REVIVING...`;
                badgeStyle = 'background:rgba(46,204,113,0.92);';
              } else {
                badgeText = `+ MEDIC ${bot.rescuer.name} EN ROUTE`;
              }
            }
            htmlParts.push(
              `<div class="world-marker" style="left:${scr.x}px;top:${scr.y}px">
                <div class="world-revive-badge" style="${badgeStyle}">${badgeText}</div>
                <div class="world-marker-dist">${bot.name} • ${Math.round(dist)}m (${Math.ceil(
                bot.bleedOutTimer
              )}s)</div>
              </div>`
            );
          }
        } else if (!bot.downed && dist < 85) {
          const scr = projectToScreen(bot.pos.clone().add(new THREE.Vector3(0, 2.35, 0)));
          if (scr) {
            const color = bot.inPlayerSquad
              ? '#2ecc71'
              : bot.role === 'MEDIC'
              ? '#7bed9f'
              : '#48dbfb';
            const rolePrefix =
              bot.role === 'MEDIC' ? '[+MED] ' : bot.role === 'ENGINEER' ? '[AT-ENG] ' : '';
            const actionSuffix =
              bot.rescueState === 'ASSESS_THREAT'
                ? ' [ASSESSING THREAT + SMOKE]'
                : bot.rescueState === 'DRAG'
                ? ' [DRAGGING ALLY]'
                : bot.rescueState === 'REVIVE'
                ? ' [REVIVING]'
                : bot.usingRpg
                ? ' [RPG-7 ANTI-ARMOR]'
                : '';
            const speechBubbleHtml =
              bot.speechBubbleTimer > 0 && bot.speechBubbleText && dist < 48
                ? `<div style="background:rgba(12,20,28,0.92);border:1px solid ${color};color:#fff;padding:2px 7px;border-radius:4px;font-size:11px;font-weight:700;margin-bottom:3px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.6);">💬 “${bot.speechBubbleText}”</div>`
                : '';
            htmlParts.push(
              `<div class="world-marker" style="left:${scr.x}px;top:${scr.y}px">
                ${speechBubbleHtml}
                <div class="world-ally-chevron" style="border-top-color:${color}"></div>
                ${
                  dist < 34 || bot.rescueState || bot.speechBubbleTimer > 0
                    ? `<div class="world-marker-dist" style="color:${color}">${rolePrefix}${bot.name}${actionSuffix}</div>`
                    : ''
                }
              </div>`
            );
          }
        }
      } else if (bot.spottedTimer > 0 && !bot.downed && dist < 160) {
        const scr = projectToScreen(bot.pos.clone().add(new THREE.Vector3(0, 2.35, 0)));
        if (scr) {
          htmlParts.push(
            `<div class="world-marker" style="left:${scr.x}px;top:${scr.y}px">
              <div class="world-spot-diamond"></div>
              <div class="world-marker-dist" style="color:#ff5252">${Math.round(dist)}m</div>
            </div>`
          );
        }
      }
    }

    // 2b. Remote Multiplayer Human Teammates & 3D Proximity Speech Bubbles
    if (this.network && this.network.remotePlayers) {
      for (const rp of this.network.remotePlayers.values()) {
        if (rp.dead || rp.team !== this.player.team) continue;
        const dist = this.player.pos.distanceTo(rp.pos);
        if (dist < 100) {
          const scr = projectToScreen(rp.pos.clone().add(new THREE.Vector3(0, 2.4, 0)));
          if (scr) {
            const inSq = rp.squad === this.player.squad;
            const color = inSq ? '#2ecc71' : '#f1c40f';
            const rpSpeechHtml =
              rp.speechBubbleTimer > 0 && rp.speechBubbleText && dist < 50
                ? `<div style="background:rgba(12,20,28,0.92);border:1px solid ${color};color:#fff;padding:2px 7px;border-radius:4px;font-size:11px;font-weight:700;margin-bottom:3px;white-space:nowrap;">💬 “${rp.speechBubbleText}”</div>`
                : '';
            htmlParts.push(
              `<div class="world-marker" style="left:${scr.x}px;top:${scr.y}px">
                ${rpSpeechHtml}
                <div class="world-ally-chevron" style="border-top-color:${color}"></div>
                <div class="world-marker-dist" style="color:${color}">[PLAYER] ${rp.name} (${Math.round(dist)}m)</div>
              </div>`
            );
          }
        }
      }
    }

    // 3. 3D Squad Ping [MMB]
    if (this.player.activePing) {
      const ping = this.player.activePing;
      const scr = projectToScreen(ping.pos.clone().add(new THREE.Vector3(0, 0.6, 0)));
      if (scr) {
        const dist = Math.round(this.player.pos.distanceTo(ping.pos));
        const col = ping.isEnemy ? '#ff2e2e' : '#f1c40f';
        htmlParts.push(
          `<div class="world-marker" style="left:${scr.x}px;top:${scr.y}px">
            <div class="world-ping-diamond" style="background:${col}"></div>
            <div class="world-marker-dist" style="color:${col}">${ping.label} • ${dist}m</div>
          </div>`
        );
      }
    }

    this.worldMarkersEl.innerHTML = htmlParts.join('');
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
      gainedPassive: 0,
      spentSoldiers: 0,
      spentCars: 0,
      spentArmor: 0
    };
    const ruTStat = (this.ticketStats && this.ticketStats.RU) || {
      gainedCapture: 0,
      gainedPassive: 0,
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
          <span class="side-metric-pill" style="color:#2ecc71;border-color:rgba(46,204,113,0.45)">🎟️ +${usTStat.gainedCapture} CAP / +${Math.floor(usTStat.gainedPassive)} GEN • -${usTStat.spentSoldiers} INF / -${usTStat.spentCars} CAR / -${usTStat.spentArmor} ARMOR</span>
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
          <span class="side-metric-pill" style="color:#2ecc71;border-color:rgba(46,204,113,0.45)">🎟️ +${ruTStat.gainedCapture} CAP / +${Math.floor(ruTStat.gainedPassive)} GEN • -${ruTStat.spentSoldiers} INF / -${ruTStat.spentCars} CAR / -${ruTStat.spentArmor} ARMOR</span>
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
