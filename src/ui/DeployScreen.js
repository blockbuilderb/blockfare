import { SQUAD_DEFS } from '../bots.js?v=124';
import { CLASS_TRAITS, VEHICLE_STATS, SQUAD_KIT_CAPS, getAllowedRoleIds } from '../config.js?v=124';
import { events } from '../events.js?v=124';
import {
  DEPLOYABLE_EVENTS,
  syncSquadDeployablesFSM,
  syncBaseProtectionFSM
} from '../core/StateMachines.js?v=124';
import {
  isMacPlatform,
  hasAnyModifier,
  resolveGlobalCommandShortcut
} from '../utils/KeyboardShortcuts.js?v=124';

export const DeployScreen = {
  bindDeployEvents() {
    const classBtns = document.querySelectorAll('.class-btn');
    classBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        classBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedClass = btn.dataset.class;
        if ((this.world?.era || 'modern') === 'modern') {
          if (this.player?.squadDoctrineEnabled !== false) {
            const autoSquad =
              this.selectedClass === 'pilot'
                ? 'FALCON'
                : this.selectedClass === 'armor'
                ? 'BRAVO'
                : null;
            if (autoSquad) {
              this.selectedSquad = autoSquad;
              document.querySelectorAll('.squad-btn').forEach((sb) => {
                sb.classList.toggle('active', sb.dataset.squad === autoSquad);
              });
            }
          }
          // Consistent HQ Vehicle Crew Auto-Selection:
          // Selecting Armor Crewman or Combat Pilot at Main Base HQ automatically pre-selects an available $0 HQ Tank or Jet!
          const atMainBase = !this.selectedSpawn || this.selectedSpawn === 'BASE';
          const tm = this.selectedTeam || 'US';
          if (atMainBase && this.vehicleManager?.findAvailableBaseVehicle) {
            if (this.selectedClass === 'armor') {
              const prefArmor = ['tank', 'apc', 'aa', 'car'].find((k) =>
                this.vehicleManager.findAvailableBaseVehicle(tm, k)
              );
              if (prefArmor) {
                this.selectedDeployVehicle = prefArmor;
                this._deployVehDrawerOpen = true;
              }
            } else if (this.selectedClass === 'pilot') {
              const prefAir = ['fighter', 'cas', 'gunship'].find((k) =>
                this.vehicleManager.findAvailableBaseVehicle(tm, k)
              );
              if (prefAir) {
                this.selectedDeployVehicle = prefAir;
                this._deployVehDrawerOpen = true;
              }
            } else {
              this.selectedDeployVehicle = 'foot';
            }
          }
        }
        this.updateDeployClassTraitsCard?.();
        this.renderDeployB2CustomizerBar?.();
      });
    });

    const teamBtns = document.querySelectorAll('.team-btn');
    teamBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        teamBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedTeam = btn.dataset.team;
        this.selectedSubFaction = btn.dataset.subfaction || btn.dataset.team;
        this.botManager?.syncPlayerTeamSlot?.(this.selectedTeam);
        this.network?.syncDynamicHumanSlots?.(this.selectedTeam);
        this.syncEraUI?.();
      });
    });

    // Main Menu & Era Switcher Controls (Merged: Card & Button both open that Era's Configure/Deploy screen)
    const openMainMenuBtn = document.getElementById('open-main-menu-btn');
    if (openMainMenuBtn) {
      openMainMenuBtn.addEventListener('click', () => {
        this.openMainMenu();
      });
    }
    const enterEraConfig = (era) => {
      const targetEra = era || 'modern';
      if (window.game && typeof window.game.switchEra === 'function') {
        window.game.switchEra(targetEra, true);
      } else {
        this.syncEraUI(targetEra);
        this.closeMainMenu();
      }
    };
    document.querySelectorAll('.main-menu-era-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target && e.target.closest('button')) return;
        enterEraConfig(card.dataset.eraCard || 'modern');
      });
    });
    document.querySelectorAll('.era-select-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        enterEraConfig(btn.dataset.era || 'modern');
      });
    });

    this.syncEraUI?.();

    const rankBtns = document.querySelectorAll('.rank-btn');
    rankBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        rankBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedRank = btn.dataset.rank || 'MEMBER';
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
        if (
          sp !== 'BASE' &&
          sp !== 'B2_LANE' &&
          sp !== 'WRIGHT_CAVE' &&
          sp !== 'SQUAD' &&
          sp !== 'RALLY' &&
          sp !== 'BEACON'
        ) {
          const flag = this.world.flags.find((f) => f.id === sp);
          if (flag && flag.owner !== this.selectedTeam) {
            return; // Cannot select unowned forward base
          }
        }
        spawnBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedSpawn = sp;
        this.renderDeployB2CustomizerBar?.();
      });
      btn.addEventListener('dblclick', () => {
        this.triggerDeploy();
      });
    });

    this.deployMapCanvas.addEventListener('click', (e) => {
      const rect = this.deployMapCanvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const wx = (cx / this.deployMapCanvas.width - 0.5) * 3480;
      const wz = (cy / this.deployMapCanvas.height - 0.5) * 2120;

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
      this.drawDeployMap?.(true);
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
    const spBotSelect = this.el('sp-bot-mode-select');
    const botScaleBtns = document.querySelectorAll('.bot-scale-btn[data-bots]');
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
    if (spBotSelect && this.network) {
      spBotSelect.value = this.network.botPopulateMode;
      spBotSelect.addEventListener('change', () => {
        this.network.setBotPopulateMode(spBotSelect.value);
        this.updateMultiplayerLobbyUI();
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

    const destrToggleBtn = this.el('deploy-destruction-toggle-btn');
    const doctrineToggleBtn = this.el('deploy-doctrine-toggle-btn');
    if (doctrineToggleBtn && this.player && typeof this.player.toggleSquadDoctrineEnabled === 'function') {
      this.updateSquadDoctrineUI?.();
      doctrineToggleBtn.addEventListener('click', () => {
        const nextVal = this.player.toggleSquadDoctrineEnabled();
        this.updateSquadDoctrineUI?.();
        this.addXpNotification(
          0,
          nextVal
            ? '🎖️ SQUAD DOCTRINE: ON (PILOT/ARMOR LICENSES, ENGINEER WALLS & BASE/FOB GUNSMITH)'
            : '🔓 SQUAD DOCTRINE: OFF (ALL CLASSES CAN FLY PLANES, DRIVE TANKS, BUILD & USE GUNSMITH ANYWHERE)'
        );
      });
    }
    if (destrToggleBtn && this.world) {
      this.updateBuildingDestructionUI();
      destrToggleBtn.addEventListener('click', () => {
        const nextVal = !this.world.buildingDestructionEnabled;
        this.world.setBuildingDestruction(nextVal);
        this.updateBuildingDestructionUI();
        this.addXpNotification(
          0,
          nextVal
            ? '💥 BUILDING DESTRUCTION: ENABLED (DEFAULT YES • REPAIR WITH [F]/[T])'
            : '🛡️ BUILDING DESTRUCTION: DISABLED (BUILDINGS CANNOT BE DESTROYED)'
        );
      });
    }

    const ffToggleBtn = this.el('deploy-friendly-fire-toggle-btn');
    if (ffToggleBtn && this.player && typeof this.player.toggleFriendlyFire === 'function') {
      this.updateFriendlyFireUI?.();
      ffToggleBtn.addEventListener('click', () => {
        const nextVal = this.player.toggleFriendlyFire();
        this.updateFriendlyFireUI?.();
        this.addXpNotification(
          0,
          nextVal
            ? '⚠️ FRIENDLY FIRE: ON — KILLING TEAMMATES DEDUCTS $0.10 (10 CENTS) PER TEAMKILL!'
            : '🛡️ FRIENDLY FIRE: OFF — TEAMMATES ARE PROTECTED FROM FRIENDLY DAMAGE'
        );
      });
    }

    const hudFfBtn = this.el('hud-friendly-fire-btn');
    if (hudFfBtn && this.player && typeof this.player.toggleFriendlyFire === 'function') {
      hudFfBtn.addEventListener('click', () => {
        const nextVal = this.player.toggleFriendlyFire();
        this.updateFriendlyFireUI?.();
        this.addXpNotification(
          0,
          nextVal
            ? '⚠️ FRIENDLY FIRE: ON — KILLING TEAMMATES DEDUCTS $0.10 (10 CENTS) PER TEAMKILL!'
            : '🛡️ FRIENDLY FIRE: OFF — TEAMMATES ARE PROTECTED FROM FRIENDLY DAMAGE'
        );
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
    const hudBuildBunkerBtn = this.el('hud-build-bunker-btn');
    if (hudBuildBunkerBtn) {
      hudBuildBunkerBtn.addEventListener('click', () => {
        if (this.player && typeof this.player.buildPaidHouseOrBunker === 'function') {
          this.player.buildPaidHouseOrBunker('AUTO');
          this.updateCashAndGunsmithHud?.();
        }
      });
    }
    const hudLaunchPlaneBtn = this.el('hud-launch-plane-btn');
    if (hudLaunchPlaneBtn) {
      hudLaunchPlaneBtn.addEventListener('click', (ev) => {
        if (!this.player) return;
        if (this.player.role === 'armor' && !(this.player.activeVehicle && this.player.activeVehicle.isAircraft)) {
          if (ev.shiftKey && typeof this.player.cycleArmorOrderType === 'function') {
            this.player.cycleArmorOrderType();
          } else if (typeof this.player.requestArmorDelivery === 'function') {
            this.player.requestArmorDelivery();
          }
        } else if (ev.shiftKey && typeof this.player.cycleAircraftRole === 'function') {
          this.player.cycleAircraftRole();
        } else if (typeof this.player.launchAircraftSortie === 'function') {
          this.player.launchAircraftSortie();
        }
        this.updateCommandOrderHud?.();
      });
      hudLaunchPlaneBtn.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        if (!this.player) return;
        if (this.player.role === 'armor' && !(this.player.activeVehicle && this.player.activeVehicle.isAircraft)) {
          this.player.cycleArmorOrderType?.();
        } else if (typeof this.player.cycleAircraftRole === 'function') {
          this.player.cycleAircraftRole();
        }
        this.updateCommandOrderHud?.();
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
    const openCasesTabDirectly = () => {
      this._gunsmithActiveTab = 'cases';
      this.toggleGunsmithModal(true);
    };
    const hudRollCaseBtn = this.el('hud-roll-case-btn');
    if (hudRollCaseBtn) {
      hudRollCaseBtn.addEventListener('click', openCasesTabDirectly);
    }
    const ammoRollCaseBtn = this.el('ammo-roll-case-btn');
    if (ammoRollCaseBtn) {
      ammoRollCaseBtn.addEventListener('click', openCasesTabDirectly);
    }
    const deployRollCaseBtn = this.el('deploy-roll-case-btn');
    if (deployRollCaseBtn) {
      deployRollCaseBtn.addEventListener('click', openCasesTabDirectly);
    }
    const bottomCenterRollCaseBtn = this.el('bottom-center-roll-case-btn');
    if (bottomCenterRollCaseBtn) {
      bottomCenterRollCaseBtn.addEventListener('click', openCasesTabDirectly);
    }
    const deployBottomCenterRollBtn = this.el('deploy-bottom-center-roll-btn');
    if (deployBottomCenterRollBtn) {
      deployBottomCenterRollBtn.addEventListener('click', openCasesTabDirectly);
    }
    for (let i = 0; i < 4; i++) {
      const slotEl = this.el(`slot-${i + 1}`);
      if (slotEl) {
        slotEl.addEventListener('click', () => {
          if (this.player && typeof this.player.switchSlot === 'function') {
            this.player.switchSlot(i);
          }
        });
      }
    }
    const hudBackpackBtnEl = this.el('hud-backpack-btn');
    if (hudBackpackBtnEl) {
      hudBackpackBtnEl.addEventListener('click', () => {
        this.toggleBackpackModal();
      });
    }
    const backpackHudBadgeEl = this.el('backpack-hud-badge');
    if (backpackHudBadgeEl) {
      backpackHudBadgeEl.addEventListener('click', () => {
        this.toggleBackpackModal();
      });
    }
    const ammoBackpackBtnEl = this.el('ammo-backpack-btn');
    if (ammoBackpackBtnEl) {
      ammoBackpackBtnEl.addEventListener('click', () => {
        this.toggleBackpackModal();
      });
    }
    const deployBackpackBtnEl = this.el('deploy-backpack-btn');
    if (deployBackpackBtnEl) {
      deployBackpackBtnEl.addEventListener('click', () => {
        this.toggleBackpackModal();
      });
    }
    this.updateCashAndGunsmithHud();

    if (this.network) {
      this.network.onLobbyUpdated = () => {
        this.updateMultiplayerLobbyUI();
      };
      setTimeout(() => this.updateMultiplayerLobbyUI(), 200);
    }

    window.addEventListener(
      'keydown',
      (e) => {
        const tag = document.activeElement ? document.activeElement.tagName : '';
        if (tag === 'INPUT' || tag === 'TEXTAREA') {
          if (e.code === 'Escape') {
            document.activeElement.blur();
          }
          return;
        }

        // If [Y] Commander Radial Wheel (#commo-rose) is open, allow pressing bare 1-8 or -/+ to execute order immediately
        const activeWheel = this.el('commo-rose');
        if (activeWheel && !hasAnyModifier(e) && !e.shiftKey) {
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
            if (!e.repeat) {
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
            }
            return;
          }
        }

        // Cross-Platform Global Utility & Commander/Squad Order Shortcuts (Mac ⌥/⌃/⌘+G & Windows/Linux Alt+...)
        const globalShortcut = resolveGlobalCommandShortcut(e, {
          isPointerLocked: Boolean(document.pointerLockElement),
          inGunship: Boolean(this.player?.activeVehicle?.aircraftRole === 'gunship'),
          inVehicle: Boolean(this.player?.activeVehicle && !this.player.dead)
        });
        if (globalShortcut) {
          e.preventDefault();
          if (!e.repeat) {
            switch (globalShortcut.type) {
              case 'SWITCH_VEHICLE_SEAT':
                this.player?.switchVehicleSeat?.(globalShortcut.seatIndex);
                break;
              case 'TOGGLE_MANUAL':
                this.toggleControlsOverlay();
                break;
              case 'TOGGLE_FPS':
                this.toggleFpsCounter();
                break;
              case 'TOGGLE_TELEMETRY':
                if (this.telemetryPanelEl) {
                  this.telemetryPanelEl.classList.toggle('hidden');
                  this.updateTelemetryPanel(true);
                }
                break;
              case 'CYCLE_ATMOS': {
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
                break;
              }
              case 'STRATEGIC_ORDER':
                this.issueHudStrategicOrder({
                  action: globalShortcut.action,
                  flagId: globalShortcut.flagId || null
                });
                break;
              case 'TOGGLE_SCOPE': {
                this.setCommandScope(this.player.commandScope === 'ALL' ? 'SQUAD' : 'ALL');
                const perTeam = (this.botManager && this.botManager.currentBotsPerTeam) || 125;
                const sqTotal = SQUAD_DEFS.length || 6;
                const perSquad = Math.round(perTeam / sqTotal);
                const nextScopeLabel =
                  this.player.commandScope === 'ALL'
                    ? `★ ALL ${sqTotal} SQUADS (${perTeam} NPCs)`
                    : `▲ ${this.player.squad || 'ALPHA'} SQUAD (${perSquad} NPCs)`;
                this.addXpNotification(0, `COMMAND SCOPE: ${nextScopeLabel}`);
                break;
              }
              case 'SPACING':
                this.issueHudFormationSpacing(globalShortcut.spacingMode);
                break;
            }
          }
          return;
        }

        if (!hasAnyModifier(e) && (e.code === 'KeyI' || (e.code === 'KeyB' && e.shiftKey))) {
          e.preventDefault();
          if (!e.repeat && !e._backpackHandled) {
            e._backpackHandled = true;
            const gsModal = this.el('gunsmith-modal');
            const gsOpen = Boolean(gsModal && !gsModal.classList.contains('hidden'));
            if (
              e.code === 'KeyI' &&
              !gsOpen &&
              this.player &&
              !this.player.dead &&
              this.player.activeVehicle
            ) {
              this._gunsmithActiveTab = 'vehicles';
              this.toggleGunsmithModal(true);
            } else {
              this.toggleBackpackModal();
            }
          }
          return;
        }
        if (!hasAnyModifier(e) && e.code === 'KeyO') {
          e.preventDefault();
          if (!e.repeat) {
            this.toggleMultiplayerModal();
          }
          return;
        }
        if (
          !hasAnyModifier(e) &&
          (e.code === 'KeyK' || (!isMacPlatform() && e.code === 'CapsLock'))
        ) {
          e.preventDefault();
          if (!e.repeat) {
            this.toggleCommandModal();
          }
          return;
        }

        if (
          !hasAnyModifier(e) &&
          (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space')
        ) {
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
        if (!hasAnyModifier(e) && !e.repeat && e.code === 'KeyM' && !this.player.dead) {
          this.player.dead = true;
          this.player.downed = false;
          if (typeof this.player.clearActiveVehicleOnReset === 'function') {
            this.player.clearActiveVehicleOnReset('redeploy-menu');
          } else {
            if (this.player.activeVehicle) {
              this.player.activeVehicle.driver = null;
              this.player.activeVehicle = null;
            }
            this.player.sensorMode = 'OFF';
            this.player.nvgActive = false;
          }
          if (document.pointerLockElement === document.body) {
            document.exitPointerLock();
          }
          this.showDeployScreen();
        }
        if (!hasAnyModifier(e) && e.code === 'Tab') {
          e.preventDefault();
          if (!e.repeat && this.scoreboardEl && this.scoreboardEl.classList.contains('hidden')) {
            this.scoreboardEl.classList.remove('hidden');
            this._scoreboardTimer = 0.25;
            this.renderScoreboard(true);
          }
        }
      },
      true
    );

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Tab') {
        this.scoreboardEl.classList.add('hidden');
        this._scoreboardTimer = 0;
        this._lastScoreboardRenderAt = 0;
      }
    });
  },

  updateMultiplayerLobbyUI() {
    if (!this.network) return;
    const isMp = this.network.isMultiplayer();
    const modeSpBtn = this.el('mode-btn-sp');
    const modeMpBtn = this.el('mode-btn-mp');
    const spBanner = this.el('sp-mode-banner');
    const spAiWrap = this.el('sp-ai-scale-wrap');
    const spBotSelect = this.el('sp-bot-mode-select');
    const mpBar = this.el('mp-lobby-bar');
    const mpBotSelect = this.el('mp-bot-mode-select');
    const botScaleBtns = document.querySelectorAll('.bot-scale-btn[data-bots]');

    if (modeSpBtn) modeSpBtn.classList.toggle('active', !isMp);
    if (modeMpBtn) modeMpBtn.classList.toggle('active', isMp);
    if (spBanner) spBanner.classList.toggle('hidden', isMp);
    if (spAiWrap) spAiWrap.style.display = isMp ? 'none' : '';
    if (mpBar) mpBar.classList.toggle('hidden', !isMp);
    if (spBotSelect && this.network.botPopulateMode !== 'NO_AI') {
      spBotSelect.value = this.network.botPopulateMode;
    }
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
    const localUrl = this.network.getShareUrl(false);
    const transportInfo = this.network.getTransportSummary?.() || {
      label: '🌐 MULTIPLAYER',
      isCloudRelay: false,
      isWebRtc: true
    };
    if (statusEl) {
      const peerNames =
        peers.length > 0
          ? ` &bull; <span style="color:#2ecc71">ONLINE (${peers.length + 1}): YOU, ${peers
              .map((p) => `${p.name} [${p.team}]`)
              .join(', ')}</span>`
          : ' &bull; <span style="color:#95a5a6">SHARE INVITE LINK WITH FRIENDS ANYWHERE!</span>';
      statusEl.innerHTML = `<span style="color:#7bed9f;font-weight:900;">${transportInfo.label}</span> &bull; ROOM <strong style="color:#f1c40f">${this.network.roomCode}</strong> &bull; INVITE: <code style="color:#74b9ff;background:rgba(0,0,0,0.45);padding:2px 5px;border-radius:2px;">${lanUrl}</code>${peerNames}`;
    }

    // 1-Click Live Active Rooms Pill Strip on Deploy Screen (`/api/mp/rooms` live discovery!)
    const roomsPillWrap = this.el('mp-active-rooms-pills');
    if (roomsPillWrap) {
      const liveRooms = (this.network.availableRooms || []).filter(
        (rm) => rm && rm.room && (rm.players || rm.count || 0) > 0
      );
      if (liveRooms.length === 0) {
        roomsPillWrap.innerHTML = `<span style="font-size:9.5px;color:#7f8c8d;padding:1px 6px;border:1px dashed rgba(255,255,255,0.16);border-radius:10px;">📡 Live Rooms: ${this.network.roomCode} (1P)</span>`;
      } else {
        roomsPillWrap.innerHTML = liveRooms
          .slice(0, 5)
          .map((rm) => {
            const code = String(rm.room).toUpperCase();
            const cnt = rm.players || rm.count || 1;
            const isCur = code === String(this.network.roomCode || '').toUpperCase();
            return `<button type="button" class="mp-quick-room-pill" data-room="${code}" style="background:${
              isCur ? 'rgba(46,204,113,0.28)' : 'rgba(241,196,15,0.2)'
            };color:${isCur ? '#7bed9f' : '#ffeaa7'};border:1px solid ${
              isCur ? '#2ecc71' : '#f1c40f'
            };border-radius:10px;padding:2px 8px;font-size:9.5px;font-weight:900;cursor:pointer;" title="1-Click Join Live Room ${code}">${
              isCur ? '🟢' : '⚡'
            } ${code} (${cnt}P)${isCur ? '' : ' • JOIN'}</button>`;
          })
          .join('');
        roomsPillWrap.querySelectorAll('.mp-quick-room-pill').forEach((pill) => {
          pill.addEventListener('click', () => {
            const targetRoom = pill.dataset.room;
            if (!targetRoom) return;
            this.network.setGameMode('MULTIPLAYER');
            this.network.setRoom(targetRoom);
            this.updateMultiplayerLobbyUI();
            this.addXpNotification(0, `🌐 SWITCHED TO LIVE ROOM: ${this.network.roomCode}`);
          });
        });
      }
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
      if (this._domCache) this._domCache.delete('mp-invite-modal');
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
            <option value="ULTRA_AI" ${this.network.botPopulateMode === 'ULTRA_AI' ? 'selected' : ''}>500P (499 AI ULTRA)</option>
            <option value="FULL_AI" ${this.network.botPopulateMode === 'FULL_AI' || this.network.botPopulateMode === 'MASSIVE_AI' ? 'selected' : ''}>250P (125v125 MASSIVE)</option>
            <option value="LARGE_AI" ${this.network.botPopulateMode === 'LARGE_AI' ? 'selected' : ''}>160P (80v80 LARGE)</option>
            <option value="TACTICAL_AI" ${this.network.botPopulateMode === 'TACTICAL_AI' ? 'selected' : ''}>80P (40v40 TACTICAL)</option>
            <option value="SQUAD_AI" ${this.network.botPopulateMode === 'SQUAD_AI' ? 'selected' : ''}>32P (16v16 SQUAD)</option>
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

    modal.querySelector('#mp-modal-close-btn').addEventListener('click', () => {
      modal.remove();
      if (this._domCache) this._domCache.delete('mp-invite-modal');
    });
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

    const transportInfo = this.network.getTransportSummary?.() || {
      label: '🌐 MULTIPLAYER',
      isCloudRelay: false,
      isWebRtc: true
    };
    const curRelay = this.network.relayWsUrl || '';
    const githubInternetUrl = `https://blockbuilderb.github.io/blockfare/?mode=multiplayer&room=${encodeURIComponent(
      this.network.roomCode
    )}${
      this.network.botPopulateMode !== 'FULL_AI'
        ? `&bots=${encodeURIComponent(this.network.botPopulateMode)}`
        : ''
    }${curRelay ? `&relay=${encodeURIComponent(curRelay)}` : ''}`;

    container.innerHTML = `
      <div style="background:rgba(0,0,0,0.48);border:1px solid rgba(46,204,113,0.45);border-radius:5px;padding:10px 12px;margin-bottom:10px;font-size:12px;">
        <div style="margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
          <span><strong>ACTIVE TRANSPORT:</strong> <span style="color:#2ecc71;font-weight:900;">${transportInfo.label}</span></span>
          <span style="color:#95a5a6;font-size:11px;">Option 1: Zero-Server WebRTC P2P &bull; Option 2: Cloud WSS Relay</span>
        </div>
        <div style="margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"><strong>🌍 INTERNET INVITE LINK:</strong> <code style="color:#2ecc71;font-size:11.5px;">${
            this.network.isStaticHost ? lanUrl : githubInternetUrl
          }</code></span>
          <button id="mp-modal-copy-lan" style="background:#27ae60;color:#fff;border:none;border-radius:3px;padding:3px 9px;font-size:11px;font-weight:900;cursor:pointer;flex-shrink:0;">📋 COPY INTERNET LINK</button>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"><strong>📡 LOCAL / LAN LINK:</strong> <code style="color:#74b9ff;font-size:11.5px;">${lanUrl}</code></span>
          <button id="mp-modal-copy-local" style="background:#2980b9;color:#fff;border:none;border-radius:3px;padding:3px 9px;font-size:11px;font-weight:800;cursor:pointer;flex-shrink:0;">📋 COPY LAN LINK</button>
        </div>
      </div>

      <div style="background:rgba(12,22,34,0.85);border:1px solid rgba(0,210,211,0.4);border-radius:5px;padding:8px 12px;margin-bottom:10px;font-size:11.5px;">
        <div style="font-weight:900;color:#00d2d3;margin-bottom:4px;">☁️ OPTION 2 — CLOUDFLARE EDGE RELAY (DEFAULT • 32–64+ PLAYERS) OR OPTION 1 WEBRTC P2P:</div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
          <input id="mp-modal-relay-input" type="text" placeholder="wss://blockfare-relay.blockbuilderb.workers.dev/ws" value="${curRelay}" style="flex:1;min-width:240px;background:#091118;color:#81ecec;border:1px solid rgba(0,210,211,0.45);padding:4px 8px;border-radius:4px;font-family:Consolas,monospace;font-size:11px;" />
          <button id="mp-modal-relay-save" type="button" style="background:#00b894;color:#fff;border:none;border-radius:4px;padding:4px 10px;font-size:11px;font-weight:900;cursor:pointer;">☁️ USE CLOUD RELAY</button>
          <button id="mp-modal-relay-clear" type="button" style="background:rgba(255,255,255,0.12);color:#dfe6e9;border:none;border-radius:4px;padding:4px 8px;font-size:11px;font-weight:800;cursor:pointer;">🌐 USE P2P WEBRTC</button>
        </div>
      </div>

      <div style="margin-bottom:10px;">
        <div style="font-size:11px;font-weight:800;color:#bdc3c7;margin-bottom:4px;">QUICK ROOM CHANNELS (CLICK TO SWITCH):</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">${
          roomPillsHtml ||
          ['FRUGIS-1', 'ALPHA-SQUAD', 'AIR-COMBAT']
            .map(
              (c) =>
                `<button class="mp-quick-room-btn" data-room="${c}" style="background:${
                  c === this.network.roomCode ? '#2980b9' : 'rgba(255,255,255,0.08)'
                };color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:3px;padding:3px 9px;font-size:11px;font-weight:800;cursor:pointer;">${c}</button>`
            )
            .join(' ')
        }</div>
      </div>
      <div>
        <div style="font-size:11px;font-weight:800;color:#2ecc71;margin-bottom:5px;">CONNECTED HUMAN PLAYERS IN ROOM (${
          peers.length + 1
        }):</div>
        ${peersRowsHtml}
      </div>
    `;

    const internetShareTarget = this.network.isStaticHost ? lanUrl : githubInternetUrl;
    const copyLanBtn = container.querySelector('#mp-modal-copy-lan');
    if (copyLanBtn) {
      copyLanBtn.addEventListener('click', () => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(internetShareTarget).catch(() => {});
        }
        copyLanBtn.textContent = '✅ COPIED!';
      });
    }
    const copyLocalBtn = container.querySelector('#mp-modal-copy-local');
    if (copyLocalBtn) {
      copyLocalBtn.addEventListener('click', () => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(lanUrl).catch(() => {});
        }
        copyLocalBtn.textContent = '✅ COPIED!';
      });
    }
    const relayInput = container.querySelector('#mp-modal-relay-input');
    const relaySaveBtn = container.querySelector('#mp-modal-relay-save');
    const relayClearBtn = container.querySelector('#mp-modal-relay-clear');
    if (relaySaveBtn && relayInput) {
      relaySaveBtn.addEventListener('click', () => {
        this.network.setGameMode('MULTIPLAYER');
        const urlToUse =
          relayInput.value.trim() || 'wss://blockfare-relay.blockbuilderb.workers.dev/ws';
        relayInput.value = urlToUse;
        const saved = this.network.setRelayUrl(urlToUse);
        this.updateMultiplayerLobbyUI();
        this.addXpNotification(
          0,
          saved ? `☁️ CLOUD RELAY ACTIVE: ${saved}` : '🌐 USING WEBRTC P2P TRANSPORT'
        );
      });
    }
    if (relayClearBtn) {
      relayClearBtn.addEventListener('click', () => {
        this.network.setRelayUrl('');
        this.updateMultiplayerLobbyUI();
        this.addXpNotification(0, '🌐 SWITCHED TO FREE ZERO-SERVER WEBRTC P2P');
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

  openMainMenu() {
    if (document.pointerLockElement === document.body) {
      document.exitPointerLock();
    }
    const mm = document.getElementById('main-menu-screen');
    if (mm) {
      mm.classList.remove('hidden');
      mm.style.display = 'flex';
    }
    this.syncEraUI?.();
  },

  closeMainMenu() {
    const mm = document.getElementById('main-menu-screen');
    if (mm) {
      mm.classList.add('hidden');
      mm.style.display = 'none';
    }
  },

  syncEraUI(eraOverride) {
    const era = eraOverride || (this.world && this.world.era) || 'modern';
    this.selectedEra = era;

    // 1. Update Main Menu Era Cards
    document.querySelectorAll('.main-menu-era-card').forEach((card) => {
      const isCardEra = card.dataset.eraCard === era;
      card.classList.toggle('active', isCardEra);
      card.style.boxShadow = isCardEra ? '0 0 24px rgba(241,196,15,0.45)' : 'none';
      const pill = card.querySelector('.era-card-status-pill');
      if (pill) {
        pill.textContent = isCardEra ? '✓ ACTIVE' : 'SELECT';
        pill.style.color = isCardEra ? '#7bed9f' : '#95a5a6';
      }
    });

    // 2. Update Deploy Screen Header Title & Faction Labels
    const eraTagEl = document.getElementById('deploy-era-tag');
    const mapTitleEl = document.getElementById('deploy-map-title');
    const betaPillEl = document.getElementById('deploy-beta-pill');
    const usTeamBtn = document.getElementById('us-team-btn') || document.querySelector('.team-btn[data-subfaction="US"]');
    const ruTeamBtn = document.getElementById('ru-team-btn') || document.querySelector('.team-btn[data-subfaction="RU"]');
    const dinoTeamBtn = document.getElementById('dino-team-btn');
    const hudUsLbl = document.querySelector('#top-bar .us-team .team-label');
    const hudRuLbl = document.querySelector('#top-bar .ru-team .team-label');

    if (era === 'medieval') {
      if (eraTagEl) eraTagEl.textContent = '🏰 MEDIEVAL BLOCKFARE';
      if (mapTitleEl) mapTitleEl.textContent = 'IRONKEEP CITADEL';
      if (betaPillEl) {
        betaPillEl.classList.remove('hidden');
        betaPillEl.style.display = 'inline-flex';
      }
      if (typeof document !== 'undefined') {
        document.title = 'MEDIEVAL BLOCKFARE — Ironkeep Citadel (Beta)';
      }
      if (usTeamBtn) {
        usTeamBtn.dataset.team = 'US';
        usTeamBtn.dataset.subfaction = 'US';
        usTeamBtn.textContent = '🏰 WEST KINGDOM';
      }
      if (ruTeamBtn) {
        ruTeamBtn.dataset.team = 'RU';
        ruTeamBtn.dataset.subfaction = 'RU';
        ruTeamBtn.textContent = '⚔️ EAST EMPIRE';
      }
      if (dinoTeamBtn) {
        dinoTeamBtn.classList.add('hidden');
        dinoTeamBtn.style.display = 'none';
      }
      if (hudUsLbl) hudUsLbl.textContent = 'WEST KINGDOM';
      if (hudRuLbl) hudRuLbl.textContent = 'EAST EMPIRE';
    } else if (era === 'jurassic') {
      if (eraTagEl) eraTagEl.textContent = '🦖 JURASSIC BLOCKFARE';
      if (mapTitleEl) mapTitleEl.textContent = 'ISLA CARNIVORA';
      if (betaPillEl) {
        betaPillEl.classList.remove('hidden');
        betaPillEl.style.display = 'inline-flex';
      }
      if (typeof document !== 'undefined') {
        document.title = 'JURASSIC BLOCKFARE — Isla Carnivora (Beta)';
      }
      if (usTeamBtn) {
        usTeamBtn.dataset.team = 'US';
        usTeamBtn.dataset.subfaction = 'US';
        usTeamBtn.textContent = '🇺🇸 US HUNTERS';
      }
      if (ruTeamBtn) {
        ruTeamBtn.dataset.team = 'US';
        ruTeamBtn.dataset.subfaction = 'RU';
        ruTeamBtn.textContent = '🇷🇺 RU HUNTERS';
      }
      if (dinoTeamBtn) {
        dinoTeamBtn.classList.remove('hidden');
        dinoTeamBtn.style.display = '';
        dinoTeamBtn.dataset.team = 'RU';
        dinoTeamBtn.dataset.subfaction = 'DINO';
        dinoTeamBtn.textContent = '🦖 DINOSAURS';
      }
      const activeBtn = document.querySelector('.team-btn.active');
      if (activeBtn) {
        this.selectedTeam = activeBtn.dataset.team || 'US';
        this.selectedSubFaction = activeBtn.dataset.subfaction || 'US';
      }
      if (hudUsLbl) hudUsLbl.textContent = 'USA + RUSSIA';
      if (hudRuLbl) hudRuLbl.textContent = 'DINOSAURS';
    } else {
      if (eraTagEl) eraTagEl.textContent = '✈️ MODERN BLOCKFARE';
      if (mapTitleEl) mapTitleEl.textContent = 'FRUGIS RIVER VALLEY';
      if (betaPillEl) {
        betaPillEl.classList.add('hidden');
        betaPillEl.style.display = 'none';
      }
      if (typeof document !== 'undefined') {
        document.title = 'MODERN BLOCKFARE — Frugis River Valley';
      }
      if (usTeamBtn) {
        usTeamBtn.dataset.team = 'US';
        usTeamBtn.dataset.subfaction = 'US';
        usTeamBtn.textContent = 'US FORCES (BLUE)';
      }
      if (ruTeamBtn) {
        ruTeamBtn.dataset.team = 'RU';
        ruTeamBtn.dataset.subfaction = 'RU';
        ruTeamBtn.textContent = 'RU FORCES (RED)';
      }
      if (dinoTeamBtn) {
        dinoTeamBtn.classList.add('hidden');
        dinoTeamBtn.style.display = 'none';
      }
      const activeBtn = document.querySelector('.team-btn.active');
      if (activeBtn && activeBtn === dinoTeamBtn && usTeamBtn) {
        dinoTeamBtn.classList.remove('active');
        usTeamBtn.classList.add('active');
        this.selectedTeam = 'US';
        this.selectedSubFaction = 'US';
      } else if (activeBtn) {
        this.selectedTeam = activeBtn.dataset.team || 'US';
        this.selectedSubFaction = activeBtn.dataset.subfaction || this.selectedTeam;
      }
      if (hudUsLbl) hudUsLbl.textContent = 'US FORCES';
      if (hudRuLbl) hudRuLbl.textContent = 'RU FORCES';
    }

    // 3. Filter Selectable Classes by Era (Isolated in src/config.js — Medieval & Jurassic Eras have ZERO guns!)
    const classBtns = Array.from(document.querySelectorAll('.class-btn'));
    const allowedClasses = getAllowedRoleIds(era, this.selectedTeam);

    classBtns.forEach((btn) => {
      const cls = btn.dataset.class;
      const isAllowed = allowedClasses.includes(cls);
      btn.classList.toggle('hidden', !isAllowed);
      btn.style.display = isAllowed ? '' : 'none';
    });

    if (!allowedClasses.includes(this.selectedClass)) {
      this.selectedClass = allowedClasses[0];
    }
    classBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.class === this.selectedClass);
    });

    // 4. Filter Modern-Only Spawn Buttons (B2_LANE, WRIGHT_CAVE) & Update Objective Labels
    const flagLabels =
      era === 'medieval'
        ? {
            A: 'OBJ A (WEST KEEP)',
            B: 'OBJ B (TREBUCHET RIDGE)',
            C: 'OBJ C (RIVER CITADEL)',
            D: 'OBJ D (WATCHTOWER)',
            E: 'OBJ E (EAST FORTRESS)'
          }
        : era === 'jurassic'
        ? {
            A: 'OBJ A (RAPTOR PADDOCK)',
            B: 'OBJ B (SKELETON CANYON)',
            C: 'OBJ C (LAGOON CROSSING)',
            D: 'OBJ D (VOLCANIC RIDGE)',
            E: 'OBJ E (T-REX NEST)'
          }
        : {
            A: 'OBJ A (WEST TOWN)',
            B: 'OBJ B (CONTAINERS)',
            C: 'OBJ C (RIVER CITY)',
            D: 'OBJ D (RADAR HILL)',
            E: 'OBJ E (INDUSTRIAL)'
          };

    document.querySelectorAll('.spawn-btn').forEach((btn) => {
      const sp = btn.dataset.spawn;
      if (sp === 'B2_LANE' || sp === 'WRIGHT_CAVE') {
        const showModernSpawns = era === 'modern';
        btn.classList.toggle('hidden', !showModernSpawns);
        btn.style.display = showModernSpawns ? '' : 'none';
        if (!showModernSpawns && this.selectedSpawn === sp) {
          this.selectedSpawn = 'BASE';
        }
      } else if (flagLabels[sp]) {
        btn.textContent = flagLabels[sp];
      }
    });

    this.updateCommandOrderHud?.(era);
    this.renderDeployB2CustomizerBar?.();
    this.updateDeployClassTraitsCard?.();
    this.drawDeployMap?.(true);
  },

    updateDeployClassTraitsCard() {
    const airEcoEl = document.getElementById('deploy-air-economy-bar');
    if (airEcoEl) {
      const era = (this.world && this.world.era) || 'modern';
      if (era !== 'modern') {
        airEcoEl.style.display = 'none';
      } else {
        airEcoEl.style.display = 'flex';
        const team = this.selectedTeam || 'US';
        const mCash = Math.floor(this.player?.matchCash ?? 50);
        const kills = this.vehicleManager?.getTeamKills ? this.vehicleManager.getTeamKills(team) : 0;
        const reqKills = VEHICLE_STATS.B2_UNLOCK_KILLS || 25;
        const b2Unlocked = this.vehicleManager?.isB2UnlockedForTeam
          ? this.vehicleManager.isB2UnlockedForTeam(team)
          : kills >= reqKills;
        airEcoEl.innerHTML =
          `<span style="color:#f1c40f;" title="In-Match Requisition Cash (Starts at $50 • Earned via Captures, Revives, Repairs & Kills)">⚡ MATCH: $${mCash.toLocaleString()}</span>` +
          `<span style="color:${b2Unlocked ? '#00d2d3' : '#ff9f43'};" title="B-2 Spirit Bomber costs ⚡$3,200 Match Cash + ${reqKills} Team Kills">${
            b2Unlocked ? `🦇 B-2 READY` : `🔒 B-2: ${kills}/${reqKills}K`
          }</span>`;
      }
    }

    // Render Squad-style 9-Man Kit Slot Cap Badges on Modern Combat Role Buttons
    if (typeof document !== 'undefined') {
      const era = (this.world && this.world.era) || 'modern';
      const doctrineOn = this.player?.squadDoctrineEnabled !== false;
      document.querySelectorAll('.class-btn[data-class]').forEach((btn) => {
        const cls = btn.dataset.class;
        const titleEl = btn.querySelector('.class-title');
        if (!titleEl) return;
        let badgeEl = titleEl.querySelector('.squad-kit-cap-pill');
        if (era !== 'modern' || !SQUAD_KIT_CAPS?.BADGE_LABELS?.[cls]) {
          if (badgeEl) badgeEl.style.display = 'none';
          return;
        }
        if (!badgeEl) {
          badgeEl = document.createElement('span');
          badgeEl.className = 'squad-kit-cap-pill';
          badgeEl.style.cssText =
            'float:right;font-size:9px;font-weight:900;padding:1px 6px;border-radius:3px;letter-spacing:0.6px;';
          titleEl.appendChild(badgeEl);
        }
        badgeEl.style.display = 'inline-block';
        const isUnlimited = cls === 'assault';
        badgeEl.textContent = doctrineOn ? SQUAD_KIT_CAPS.BADGE_LABELS[cls] : 'DOCTRINE OFF';
        badgeEl.style.background = isUnlimited
          ? 'rgba(46, 204, 113, 0.2)'
          : 'rgba(241, 196, 15, 0.18)';
        badgeEl.style.border = isUnlimited
          ? '1px solid rgba(46, 204, 113, 0.55)'
          : '1px solid rgba(241, 196, 15, 0.55)';
        badgeEl.style.color = isUnlimited ? '#7bed9f' : '#ffeaa7';
      });
    }
  },

  triggerDeploy() {
    this.closeMainMenu();
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
      this.selectedSubFaction = activeTeamBtn.dataset.subfaction || this.selectedTeam;
    }
    const eraNow = (this.world && this.world.era) || 'modern';
    const isJurassicRussianCoalition =
      eraNow === 'jurassic' && this.selectedTeam === 'US' && this.selectedSubFaction === 'RU';
    const isJurassicDino = eraNow === 'jurassic' && this.selectedTeam === 'RU';
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
    this.botManager?.rebalanceAiSquadForPlayerRole?.({
      team: this.selectedTeam,
      squad: this.selectedSquad,
      role: this.selectedClass,
      squadDoctrineEnabled: this.player?.squadDoctrineEnabled
    });
    let spawnVec = isJurassicDino
      ? this.world.spawns.US_BASE.clone().set(0, 0, -330)
      : isJurassicRussianCoalition || this.selectedTeam === 'RU'
      ? this.world.spawns.RU_BASE.clone()
      : this.world.spawns.US_BASE.clone();
    let spawnSource = isJurassicDino
      ? 'NORTH_VOLCANIC_CALDERA'
      : isJurassicRussianCoalition
      ? 'RU_COALITION_EAST_BASE'
      : 'MAIN_BASE';

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
          this.player.beaconDeployableFSM?.send(DEPLOYABLE_EVENTS.DEPLETE_SPAWNS);
          if ((this.player.beaconCooldown || 0) <= 0) {
            this.player.beaconDeployableFSM?.send(DEPLOYABLE_EVENTS.COOLDOWN_DONE);
          }
        }
        syncSquadDeployablesFSM(this.player);
        spawnSource = 'INSERTION_BEACON';
      }
    } else if (this.selectedSpawn === 'B2_LANE') {
      // Dedicated Northrop B-2A Spirit Stealth Bomber HQ Runway Lane 2 (US: [-925, -92], RU: [925, 92])
      // Requires 25 Faction Kills to unlock & Pilot class to fly!
      const b2Unlocked = this.vehicleManager?.isB2UnlockedForTeam
        ? this.vehicleManager.isB2UnlockedForTeam(this.selectedTeam)
        : false;
      const curKills = this.vehicleManager?.getTeamKills
        ? this.vehicleManager.getTeamKills(this.selectedTeam)
        : 0;
      if (eraNow === 'modern' && this.selectedClass !== 'pilot' && this.player?.squadDoctrineEnabled === false) {
        this.selectedClass = 'pilot';
        document.querySelectorAll('.class-btn').forEach((b) => {
          b.classList.toggle('active', b.dataset.class === 'pilot');
        });
      } else if (eraNow === 'modern' && this.selectedClass !== 'pilot') {
        setTimeout(() => {
          this.addXpNotification?.(
            0,
            '🔒 B-2 SPIRIT REQUIRES [COMBAT PILOT] LICENSE — PRESS [L] AT HQ HANGAR TO SWITCH TO PILOT OR TOGGLE DOCTRINE OFF!'
          );
        }, 420);
      }
      if (!b2Unlocked) {
        const isRu = this.selectedTeam === 'RU';
        spawnVec.set(isRu ? 1492 : -1492, 0, isRu ? 60 : -60);
        spawnSource = 'MAIN_BASE';
        setTimeout(() => {
          this.addXpNotification?.(
            0,
            `🔒 B-2 SPIRIT REQUIRES 25 FACTION KILLS (${curKills}/25) — DEPLOYED AS [PILOT] AT HQ RUNWAY!`
          );
        }, 350);
      } else {
        const isRu = this.selectedTeam === 'RU';
        spawnVec.set(isRu ? 1528 : -1528, 0, isRu ? 124 : -124);
        spawnSource = 'HQ_B2_SPIRIT_LANE';
      }
    } else if (this.selectedSpawn === 'WRIGHT_CAVE') {
      // Secret Cliffside Rock Cave at the Very Back of the HQ Base (US: [-1594, -34], RU: [1594, 34])
      const isRu = this.selectedTeam === 'RU';
      spawnVec.set(isRu ? 1594 : -1594, 0, isRu ? 32 : -32);
      spawnSource = 'SECRET_HQ_WRIGHT_CAVE';
    } else if (this.selectedSpawn !== 'BASE') {
      let flag = this.world.flags.find(
        (f) => f.id === this.selectedSpawn && f.owner === this.selectedTeam
      );
      if (!flag) {
        flag =
          this.world.flags.find((f) => f.owner === this.selectedTeam && !f.contested) ||
          this.world.flags.find((f) => f.owner === this.selectedTeam) ||
          null;
      }
      if (flag) {
        const teamDirX = this.selectedTeam === 'US' ? -1 : 1;
        if (flag.id === 'C') {
          // Objective C sits beside the central river (x = -2, z = 12); spawn on the dry bank at C
          spawnVec.set(
            flag.pos.x + teamDirX * (21 + Math.random() * 5),
            0,
            flag.pos.z + (Math.random() - 0.5) * 12
          );
        } else if (flag.contested) {
          spawnVec.set(
            flag.pos.x + teamDirX * (16 + Math.random() * 6),
            0,
            flag.pos.z + (Math.random() - 0.5) * 12
          );
        } else {
          const offsetAngle = Math.random() * Math.PI * 2;
          const dist = 7 + Math.random() * 8;
          spawnVec.set(
            flag.pos.x + Math.cos(offsetAngle) * dist,
            0,
            flag.pos.z + Math.sin(offsetAngle) * dist
          );
        }
        spawnSource = `FORWARD_FLAG_${flag.id}`;
      } else {
        const baseOriginX = this.selectedTeam === 'US'
          ? (this.world?.spawns?.US_BASE?.x ?? -1520) + 28
          : (this.world?.spawns?.RU_BASE?.x ?? 1520) - 28;
        spawnVec.set(
          baseOriginX + (Math.random() - 0.5) * 10,
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
      } else if (isJurassicDino) {
        spawnVec.set((Math.random() - 0.5) * 18, 0, -330 + (Math.random() - 0.5) * 18);
        spawnSource = 'NORTH_VOLCANIC_CALDERA';
      } else {
        const isRuSide = isJurassicRussianCoalition || this.selectedTeam === 'RU';
        const baseX = isRuSide
          ? (this.world?.spawns?.RU_BASE?.x ?? 1520) - 28
          : (this.world?.spawns?.US_BASE?.x ?? -1520) + 28;
        if (eraNow === 'modern' && this.selectedClass === 'pilot') {
          // Spawn Combat Pilots right at the HQ Airfield Flight-Line Gate facing the 4-bay Aircraft Apron!
          spawnVec.set(
            (isRuSide ? 1495 : -1495) + (Math.random() - 0.5) * 6,
            0,
            isRuSide ? 62 : -62
          );
        } else {
          spawnVec.set(
            baseX + (Math.random() - 0.5) * 6,
            0,
            (Math.random() - 0.5) * 10
          );
        }
        spawnSource = isJurassicRussianCoalition ? 'RU_COALITION_EAST_BASE' : 'MAIN_BASE';
      }
    }
    spawnVec.y = this.world.getGroundHeightAt(spawnVec.x, spawnVec.z);

    const sqDef = SQUAD_DEFS.find((s) => s.id === this.selectedSquad) || SQUAD_DEFS[0];
    this.player.squad = sqDef.id;
    this.player.squadShort = sqDef.short;
    this.player.subFaction = this.selectedSubFaction || this.selectedTeam;
    this.player.commandRank = this.selectedRank || 'MEMBER';
    this.player.commandScope = this.player.commandRank === 'COMMANDER' ? 'ALL' : 'SQUAD';
    this.setCommandScope(this.player.commandScope);
    if (!this.network || !this.network.isMultiplayer()) {
      this.botManager?.syncPlayerTeamSlot?.(this.selectedTeam);
    }
    this.player.deploy(this.selectedTeam, this.selectedClass, spawnVec);

    // Fulfill 1-Click Deploy Vehicle Selection:
    // - If spawning at MAIN BASE and an unclaimed HQ Pool vehicle of that type is parked there -> $0 FREE!
    // - Otherwise (frontline FOB/Squad spawn or all HQ hulls taken/on cooldown) -> Paid ⚡ Match Cash Drop/Sortie!
    const reqVehKey = eraNow === 'modern' ? this.selectedDeployVehicle || 'foot' : 'foot';
    const spawnedAtMainBase = !this.selectedSpawn || this.selectedSpawn === 'BASE';
    this.selectedDeployVehicle = 'foot';
    this._deployVehDrawerOpen = false;
    if (reqVehKey !== 'foot' && this.vehicleManager) {
      const freeHqVeh = spawnedAtMainBase
        ? this.vehicleManager.claimBaseVehicleForPlayerDeploy
          ? this.vehicleManager.claimBaseVehicleForPlayerDeploy(
              this.player,
              this.selectedTeam,
              reqVehKey
            )
          : this.vehicleManager.findAvailableBaseVehicle?.(this.selectedTeam, reqVehKey)
        : null;
      if (freeHqVeh) {
        this.player.pos.copy(freeHqVeh.pos);
        this.player.enterVehicle?.(freeHqVeh, true);
      } else if (
        reqVehKey === 'wright_flyer' ||
        reqVehKey === 'cas' ||
        reqVehKey === 'fighter' ||
        reqVehKey === 'gunship' ||
        reqVehKey === 'b2_spirit'
      ) {
        this.player.launchAircraftSortie?.(reqVehKey, true);
      } else if (reqVehKey === 'bike' || reqVehKey === 'atv') {
        const res = this.vehicleManager.requestPlayerLightBike?.(this.player, reqVehKey);
        if (res && res.ok && res.vehicle) {
          this.player.enterVehicle?.(res.vehicle, true);
        }
      } else if (
        reqVehKey === 'car' ||
        reqVehKey === 'apc' ||
        reqVehKey === 'aa' ||
        reqVehKey === 'tank'
      ) {
        const res = this.vehicleManager.requestPlayerArmorVehicle?.(this.player, reqVehKey);
        if (res && res.ok && res.vehicle) {
          this.player.enterVehicle?.(res.vehicle, true);
        }
      }
    }
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

    const spawnPayload = {
      team: this.selectedTeam,
      squad: this.selectedSquad,
      role: this.selectedClass,
      source: spawnSource,
      x: Math.round(spawnVec.x),
      z: Math.round(spawnVec.z)
    };
    events.emit('telemetry:event', {
      type: 'PLAYER_SPAWN',
      payload: spawnPayload
    });
    if (this.telemetry && !this.telemetry._unsubscribeTelemetryEvent) {
      this.telemetry.logEvent('PLAYER_SPAWN', spawnPayload);
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
            ? `Force Commander on the ground! All 6 Squads (${this.player.team} ALPHA–FALCON) standing by on Command Net — click [A]–[E] or press [K]!`
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
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.remove(
        'nvg-green-mode',
        'flir-whot-mode',
        'flir-bhot-mode',
        'flir-scope-mode'
      );
    }
    const nvgOv = this.el('nvg-overlay');
    if (nvgOv) {
      nvgOv.classList.add('hidden');
      nvgOv.classList.remove('sensor-whot', 'sensor-bhot');
    }
    const flirFs = this.el('flir-fullscreen-canvas');
    if (flirFs) flirFs.classList.add('hidden');
    const topBtn = this.el('deploy-top-btn');
    const botBtn = this.el('deploy-btn');
    if (topBtn) {
      if (this._setText) this._setText(topBtn, 'DEPLOY [ENTER / SPACE]');
      else topBtn.textContent = 'DEPLOY [ENTER / SPACE]';
    }
    if (botBtn) {
      if (this._setText) this._setText(botBtn, 'DEPLOY [ENTER / SPACE]');
      else botBtn.textContent = 'DEPLOY [ENTER / SPACE]';
    }
    if (typeof this.renderDeployExtractedLootBar === 'function') {
      this.renderDeployExtractedLootBar();
    }
    if (typeof this.renderDeployB2CustomizerBar === 'function') {
      this.renderDeployB2CustomizerBar();
    }
    this.drawDeployMap(true);
  },

  drawDeployMap(force = false) {
    if (this.deployScreenEl && this.deployScreenEl.classList.contains('hidden')) {
      return;
    }
    const now = performance.now();
    if (!force && this._lastDeployMapDrawAt && now - this._lastDeployMapDrawAt < 83) {
      return;
    }
    this._lastDeployMapDrawAt = now;

    this.updateDeployClassTraitsCard?.();
    // Update spawn buttons so only Main Base, Squad, and Occupied Forward Flags are selectable
    const spawnBtns = document.querySelectorAll('.spawn-btn');
    spawnBtns.forEach((btn) => {
      const sp = btn.dataset.spawn;
      if (sp === 'FRIEND') {
        const peers = Array.from(this.network.remotePlayers.values());
        const hasPeer = peers.length > 0;
        btn.classList.toggle('locked-spawn', !hasPeer);
        btn.textContent = hasPeer ? `🟢 JOIN: ${peers[0].name}` : '🟢 CO-OP PEER';
        if (!hasPeer && this.selectedSpawn === 'FRIEND') {
          this.selectedSpawn = 'BASE';
          spawnBtns.forEach((b) => b.classList.toggle('active', b.dataset.spawn === 'BASE'));
        }
      } else if (sp === 'RALLY') {
        // Rally Point: available only if player has placed one
        const hasRally = Boolean(this.player.rallyPoint && this.player.rallyPoint.timer > 0);
        btn.classList.toggle('locked-spawn', !hasRally);
        btn.textContent = hasRally
          ? `🟢 RALLY (${Math.ceil(this.player.rallyPoint.timer)}s)`
          : '🟢 RALLY [5]';
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
          ? `🔵 BEACON (${this.player.insertionBeacon.spawnsLeft}×)`
          : '🔵 BEACON [6]';
        if (!hasBeacon && this.selectedSpawn === 'BEACON') {
          this.selectedSpawn = 'BASE';
          spawnBtns.forEach((b) => b.classList.toggle('active', b.dataset.spawn === 'BASE'));
        }
      } else if (sp === 'B2_LANE') {
        const kills = this.vehicleManager?.getTeamKills
          ? this.vehicleManager.getTeamKills(this.selectedTeam)
          : 0;
        const reqKills = VEHICLE_STATS.B2_UNLOCK_KILLS || 25;
        const b2Unlocked = this.vehicleManager?.isB2UnlockedForTeam
          ? this.vehicleManager.isB2UnlockedForTeam(this.selectedTeam)
          : kills >= reqKills;
        btn.classList.toggle('locked-spawn', !b2Unlocked);
        btn.textContent = b2Unlocked
          ? '🦇 B-2 SPIRIT LANE'
          : `🔒 B-2 (${kills}/${reqKills} KILLS)`;
        if (!b2Unlocked && this.selectedSpawn === 'B2_LANE') {
          this.selectedSpawn = 'BASE';
          spawnBtns.forEach((b) => b.classList.toggle('active', b.dataset.spawn === 'BASE'));
        }
      } else if (sp === 'BASE') {
        const baseEntry = this.botManager?.baseState?.[this.selectedTeam];
        if (baseEntry) {
          syncBaseProtectionFSM(baseEntry, this.selectedTeam);
        }
        const mainContested = Boolean(baseEntry && baseEntry.contested);
        const fallbackFlag = mainContested
          ? this.world.flags.find((f) => f.owner === this.selectedTeam && !f.contested)
          : null;
        btn.classList.toggle('locked-spawn', Boolean(mainContested && fallbackFlag));
        if (mainContested && fallbackFlag && this.selectedSpawn === 'BASE') {
          this.selectedSpawn = fallbackFlag.id;
          spawnBtns.forEach((b) =>
            b.classList.toggle('active', b.dataset.spawn === fallbackFlag.id)
          );
        }
      } else if (sp !== 'BASE' && sp !== 'B2_LANE' && sp !== 'WRIGHT_CAVE' && sp !== 'SQUAD') {
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

    const toMapX = (wx) => (wx / 3480 + 0.5) * w;
    const toMapY = (wz) => (wz / 2120 + 0.5) * h;

    // North-South River
    ctx.fillStyle = '#1f536e';
    ctx.fillRect(toMapX(-24), 0, 12, h);

    // 3 Grand Bridges & Main Road Network
    ctx.fillStyle = '#2f363d';
    ctx.fillRect(0, toMapY(-8), w, 6);
    ctx.fillRect(toMapX(-28), toMapY(-406), 22, 5);
    ctx.fillRect(toMapX(-28), toMapY(394), 22, 5);

    // Base HQs (In Jurassic Era, both US HQ West and RU HQ East belong to the Allied Human Coalition!)
    const isJur = this.world && this.world.era === 'jurassic';
    const usX = toMapX(this.world.spawns.US_BASE.x);
    const usY = toMapY(this.world.spawns.US_BASE.z);
    ctx.fillStyle = '#3498db';
    ctx.fillRect(usX - 8, usY - 8, 16, 16);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(isJur ? 'USA HQ' : 'US HQ', usX, usY - 11);

    const ruX = toMapX(this.world.spawns.RU_BASE.x);
    const ruY = toMapY(this.world.spawns.RU_BASE.z);
    ctx.fillStyle = isJur ? '#00d2d3' : '#e74c3c';
    ctx.fillRect(ruX - 8, ruY - 8, 16, 16);
    ctx.fillStyle = '#fff';
    ctx.fillText(isJur ? 'RUS HQ' : 'RU HQ', ruX, ruY - 11);

    if (isJur) {
      // Draw Dinosaur Jungle Nests across the island
      const nests = [
        [-390, -295],
        [0, -340],
        [-135, 315],
        [390, 295]
      ];
      for (const [nx, nz] of nests) {
        const mx = toMapX(nx);
        const my = toMapY(nz);
        ctx.fillStyle = 'rgba(231, 76, 60, 0.78)';
        ctx.beginPath();
        ctx.arc(mx, my, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ff7675';
        ctx.font = 'bold 8px sans-serif';
        ctx.fillText('DINO NEST', mx, my - 9);
      }
    }

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
