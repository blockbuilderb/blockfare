import { SQUAD_DEFS } from '../bots.js?v=35';

export const DeployScreen = {
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

    const nextRoundBtn = this.el('next-round-btn');
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

    const deployBtn = this.el('deploy-btn');
    if (deployBtn) {
      deployBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.triggerDeploy();
      });
    }
    const deployTopBtn = this.el('deploy-top-btn');
    if (deployTopBtn) {
      deployTopBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.triggerDeploy();
      });
    }

    // Game Mode Selector (Singleplayer vs. Multiplayer) & Lobby Controls
    const modeSpBtn = this.el('mode-btn-sp');
    const modeMpBtn = this.el('mode-btn-mp');
    const botScaleBtns = document.querySelectorAll('.bot-scale-btn');
    const mpBotSelect = this.el('mp-bot-mode-select');
    const mpOpenCoopBtn = this.el('mp-open-coop-btn');
    const callsignInput = this.el('mp-callsign-input');
    const roomInput = this.el('mp-room-input');
    const mpJoinBtn = this.el('mp-join-btn');
    const mpCopyBtn = this.el('mp-copy-invite-btn');
    const netIndBtn = this.el('net-indicator-btn');

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
    const scopeAllBtn = this.el('cmd-scope-all');
    const scopeSquadBtn = this.el('cmd-scope-squad');
    const openCmdModalBtn = this.el('cmd-open-modal-btn');
    const cmdOpenWheelBtn = this.el('cmd-open-wheel-btn');
    const cmdPanelMapBtn = this.el('cmd-panel-map-btn');
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
        const existing = this.el('commo-rose');
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
    const hudUavBtn = this.el('hud-uav-btn');
    if (hudUavBtn) {
      hudUavBtn.addEventListener('click', () => {
        this.player.activateUAV();
        this.updateCommandOrderHud();
      });
    }
    const hudAirstrikeBtn = this.el('hud-airstrike-btn');
    if (hudAirstrikeBtn) {
      hudAirstrikeBtn.addEventListener('click', () => {
        this.player.callAirstrike();
        this.updateCommandOrderHud();
      });
    }
    const hudStrikePatternBtn = this.el('hud-strike-pattern-btn');
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
      const activeWheel = this.el('commo-rose');
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
          this.player.commandScope === 'ALL'
            ? '★ ALL 5 SQUADS (40 NPCs)'
            : `▲ ${this.player.squad || 'ALPHA'} SQUAD (8 NPCs)`;
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
  },

  updateMultiplayerLobbyUI() {
    if (!this.network) return;
    const isMp = this.network.isMultiplayer();
    const modeSpBtn = this.el('mode-btn-sp');
    const modeMpBtn = this.el('mode-btn-mp');
    const spBanner = this.el('sp-mode-banner');
    const mpBar = this.el('mp-lobby-bar');
    const mpBotSelect = this.el('mp-bot-mode-select');
    const botScaleBtns = document.querySelectorAll('.bot-scale-btn');

    if (modeSpBtn) modeSpBtn.classList.toggle('active', !isMp);
    if (modeMpBtn) modeMpBtn.classList.toggle('active', isMp);
    if (spBanner) spBanner.classList.toggle('hidden', isMp);
    if (mpBar) mpBar.classList.toggle('hidden', !isMp);
    if (mpBotSelect) mpBotSelect.value = this.network.botPopulateMode;
    botScaleBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.bots === this.network.botPopulateMode);
    });

    const statusEl = this.el('mp-live-status');
    const callsignInput = this.el('mp-callsign-input');
    const roomInput = this.el('mp-room-input');
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

    const modalBody = this.el('mp-modal-dynamic-body');
    if (modalBody) {
      this.renderMultiplayerModalBody(modalBody, lanUrl, localUrl, peers);
    }
  },

  toggleMultiplayerModal() {
    let modal = this.el('mp-invite-modal');
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
    if (this._domCache) this._domCache.set('mp-invite-modal', modal);

    modal.querySelector('#mp-modal-close-btn').addEventListener('click', () => modal.remove());
    modal.querySelector('#mp-modal-mode-sp').addEventListener('click', () => {
      this.network.setGameMode('SINGLEPLAYER');
      this.updateMultiplayerLobbyUI();
      this.addXpNotification(0, '🎮 SWITCHED TO SINGLEPLAYER MODE (OFFLINE)');
    });
    modal.querySelector('#mp-modal-mode-mp').addEventListener('click', () => {
      this.network.setGameMode('MULTIPLAYER');
      this.updateMultiplayerLobbyUI();
      this.addXpNotification(0, `🌐 SWITCHED TO MULTIPLAYER MODE (ROOM ${this.network.roomCode})`);
    });
    modal.querySelector('#mp-modal-open-2nd-btn').addEventListener('click', () => {
      this.network.openCoopTestWindow();
      this.updateMultiplayerLobbyUI();
    });
    modal.querySelector('#mp-modal-apply-btn').addEventListener('click', () => {
      const cVal = modal.querySelector('#mp-modal-callsign').value;
      const rVal = modal.querySelector('#mp-modal-room').value;
      const bVal = modal.querySelector('#mp-modal-bots').value;
      this.network.setGameMode('MULTIPLAYER', bVal);
      this.network.setCallsign(cVal);
      this.network.setRoom(rVal);
      this.updateMultiplayerLobbyUI();
      this.addXpNotification(
        0,
        `🌐 ACTIVE ROOM: ${this.network.roomCode} (${this.network.callsign})`
      );
    });

    this.updateMultiplayerLobbyUI();
  },

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

    const copyLanBtn = container.querySelector('#mp-modal-copy-lan');
    if (copyLanBtn) {
      copyLanBtn.addEventListener('click', () => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(lanUrl).catch(() => {});
        }
        copyLanBtn.textContent = '✅ COPIED!';
      });
    }
    const copyLocalBtn = container.querySelector('#mp-modal-copy-local');
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
        const rIn = this.el('mp-modal-room');
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
        const modal = this.el('mp-invite-modal');
        if (modal) modal.remove();
      });
    });
  },

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
    if (
      this.pendingDeployOrder &&
      this.pendingDeployOrder.action &&
      this.pendingDeployOrder.action !== 'AUTO'
    ) {
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
      const el = this.el(`slot-${idx + 1}-name`);
      if (el) el.textContent = s.def.shortName;
    });

    // Squadmate / Command Net greeting over Proximity/Squad Comms upon deployment
    setTimeout(() => {
      if (this.player.dead) return;
      const mate =
        this.botManager.bots.find(
          (b) =>
            !b.dead &&
            b.team === this.player.team &&
            b.squad === this.player.squad &&
            b.isSquadLeader
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
  },

  showDeployScreen() {
    this.deployScreenEl.classList.remove('hidden');
    this.hudEl.classList.add('hidden');
    this.scopeOverlayEl.classList.add('hidden');
    this.vehicleOverlayEl.classList.add('hidden');
    if (this.downedOverlayEl) this.downedOverlayEl.classList.add('hidden');
    const topBtn = this.el('deploy-top-btn');
    const botBtn = this.el('deploy-btn');
    if (topBtn) topBtn.textContent = 'DEPLOY TO BATTLEFIELD [ENTER / SPACE]';
    if (botBtn) botBtn.textContent = 'DEPLOY TO BATTLEFIELD [ENTER / SPACE]';
  },

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
        const hasBeacon = Boolean(
          this.player.insertionBeacon && this.player.insertionBeacon.spawnsLeft > 0
        );
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
    const ctx = this._getCachedContext2D
      ? this._getCachedContext2D(this.deployMapCanvas, 'deployMapCtx')
      : this.deployMapCtx;
    if (!ctx) return;
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
};

export default DeployScreen;
