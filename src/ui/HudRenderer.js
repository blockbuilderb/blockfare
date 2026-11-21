import { UI, getEraRoles } from '../config.js?v=90';

export const HudRenderer = {
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
  },

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
  },

  // Controls Reference Overlay [F1]
  toggleControlsOverlay() {
    let el = this.el('controls-overlay');
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
    if (this._domCache) this._domCache.set('controls-overlay', el);
  },

  showHitmarker(type = 'normal', label = 'HIT') {
    this.hitmarkerEl.classList.remove('hidden', 'headshot', 'armor', 'kill');
    if (type === 'headshot') this.hitmarkerEl.classList.add('headshot');
    else if (type === 'armor') this.hitmarkerEl.classList.add('armor');
    else if (type === 'kill') this.hitmarkerEl.classList.add('kill');
    if (this.hitConfirmTagEl) {
      this.hitConfirmTagEl.textContent = label;
    }
    this.hitmarkerTimer = type === 'kill' ? 0.34 : 0.22;
  },

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
  },

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
  },

  // Kill Streak / Multi-Kill Announcement (Battlefield-style center screen text)
  showKillStreakAnnouncement(text) {
    let el = this.el('kill-streak-announcement');
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
      if (this._domCache) this._domCache.set('kill-streak-announcement', el);
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
  },

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
      const fsmSnap = snap.stateMachines || (window.game?.stateMachines ? window.game.stateMachines.getSnapshot() : null);
      const fsmSummary = fsmSnap
        ? `${fsmSnap.match.state} • UI:${fsmSnap.uiModal.state} • PLR:${fsmSnap.player.vitality.state}/${fsmSnap.player.stance.state}/${fsmSnap.player.weapon.state}`
        : 'ACTIVE';
      const invOk = !fsmSnap || fsmSnap.invariants.valid;
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
        <div class="telem-stat-box" style="grid-column: 1 / -1;">
          <div class="telem-stat-label">FINITE STATE MACHINES &amp; INVARIANTS (${invOk ? '100% VALID' : 'VIOLATION'})</div>
          <div class="telem-stat-val ${invOk ? 'ok' : 'warn'}">${fsmSummary}</div>
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
              ev.medic ||
              ev.base ||
              ev.blockedBase ||
              ev.npc ||
              ev.attacker ||
              ev.source ||
              ev.message ||
              ''
            } ${ev.action || ev.redirectedTo || ev.vehicleName || ev.weapon || ''}</span>
          </div>
        `
        )
        .join('');
    }
  },

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
  },

  update(dt, ticketsUS, ticketsRU, matchTimeRemaining = 900, rawDt = dt) {
    this.updateFpsMetrics(rawDt || dt);
    this.lastTicketsUS = ticketsUS;
    this.lastTicketsRU = ticketsRU;
    this.lastMatchTime = matchTimeRemaining;

    if (this.player.dead) {
      // Respawn timer countdown
      if (this.player.respawnTimer > 0) {
        this.player.respawnTimer -= dt;
        const topBtn = this.el('deploy-top-btn');
        const botBtn = this.el('deploy-btn');
        const remaining = Math.ceil(this.player.respawnTimer);
        if (topBtn) topBtn.textContent = `RESPAWNING IN ${remaining}s...`;
        if (botBtn) botBtn.textContent = `RESPAWNING IN ${remaining}s...`;
      } else {
        const topBtn = this.el('deploy-top-btn');
        const botBtn = this.el('deploy-btn');
        if (topBtn && topBtn.textContent.includes('RESPAWNING')) {
          topBtn.textContent = 'DEPLOY [ENTER / SPACE]';
        }
        if (botBtn && botBtn.textContent.includes('RESPAWNING')) {
          botBtn.textContent = 'DEPLOY [ENTER / SPACE]';
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
      // Find nearest friendly Medic or Squadmate distance who still has Field Dressings (> 0) to revive!
      let bestMedicDist = Infinity;
      let bestMedicName = null;
      let bestMedicDressings = 0;
      let bestMedicMaxDressings = 9;
      for (const b of this.botManager.bots) {
        if (b.dead || b.downed || b.team !== this.player.team || (b.fieldDressings ?? 1) <= 0) continue;
        if (b.role === 'MEDIC' || b.inPlayerSquad) {
          const d = b.pos.distanceTo(this.player.pos);
          if (d < bestMedicDist) {
            bestMedicDist = d;
            bestMedicName = b.name;
            bestMedicDressings = b.fieldDressings ?? 9;
            bestMedicMaxDressings = b.maxFieldDressings || (b.role === 'MEDIC' ? 9 : 2);
          }
        }
      }
      if (this.downedMedicDistEl) {
        this.downedMedicDistEl.textContent = bestMedicName
          ? `NEAREST MEDIC: ${bestMedicName} (${Math.round(bestMedicDist)}m • ${bestMedicDressings}/${bestMedicMaxDressings} DRESSINGS) — EN ROUTE`
          : 'NEAREST MEDIC: NONE WITH FIELD DRESSINGS IN RANGE';
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

    // Update 5 Flag Badges (using cached DOM lookups)
    let activeCaptureFlag = null;
    for (const flag of this.world.flags) {
      const badge = this.el(`flag-ui-${flag.id}`);
      const fill = this.el(`flag-fill-${flag.id}`);
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
      const absPct = Math.round(Math.abs(activeCaptureFlag.captureProgress));
      const usInZone = activeCaptureFlag.usPresent ?? 0;
      const ruInZone = activeCaptureFlag.ruPresent ?? 0;
      const downedExcluded =
        (activeCaptureFlag.usDownedPresent || 0) + (activeCaptureFlag.ruDownedPresent || 0);
      const downedNote = downedExcluded > 0 ? ` • ${downedExcluded} DOWNED EXCLUDED` : '';
      const myCount = this.player.team === 'US' ? usInZone : ruInZone;
      const enemyCount = this.player.team === 'US' ? ruInZone : usInZone;

      let statusLabel = '';
      const garSquad =
        activeCaptureFlag.garrisonSquad && activeCaptureFlag.garrisonSquad[this.player.team]
          ? ` • 🏰 GARRISON: ${activeCaptureFlag.garrisonSquad[this.player.team]}`
          : '';
      const defDmgPct = Math.min(42, 25 + defStage * 4);
      const holdMult = activeCaptureFlag.defenderWeightMult || (1.35 + defStage * 0.075).toFixed(2);
      if (enemyCount > 0 && myCount > 0) {
        statusLabel = ` • ⚔️ CONTESTED (US ${usInZone} vs RU ${ruInZone} ACTIVE${downedNote}${garSquad} • DEFENDER BUFF: -${defDmgPct}% DMG, -30% RECOIL, ${holdMult}× HOLD)`;
      } else if (!isFriendlyHeld && activeCaptureFlag.owner !== 'NEUTRAL') {
        statusLabel = ` • 🔻 LOWERING ${activeCaptureFlag.owner} FLAG (${absPct}% -> 0%${downedNote} • SPAWN LOCKED!)`;
      } else if (!isFriendlyHeld && activeCaptureFlag.owner === 'NEUTRAL') {
        statusLabel = ` • 🔺 RAISING ${this.player.team} FLAG (${absPct}% -> 100%${downedNote})`;
      } else {
        statusLabel = ` (${activeCaptureFlag.owner} HELD ${absPct}%${downedNote}${garSquad} • 🛡️ DEFENDER ADVANTAGE: -${defDmgPct}% DMG, -30% RECOIL, +HP/ARMOR TRIAGE, ${holdMult}× HOLD • FORT ${defStage}/4 [F])`;
      }
      this.captureTitleEl.textContent = `${activeCaptureFlag.name}${statusLabel}`;
      this.captureBarEl.style.width = `${absPct}%`;
      this.captureBarEl.style.backgroundColor =
        enemyCount > 0 && myCount > 0
          ? '#f39c12'
          : activeCaptureFlag.captureProgress > 5
          ? '#3498db'
          : activeCaptureFlag.captureProgress < -5
          ? '#e74c3c'
          : '#95a5a6';
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
    let weatherEl = this.el('weather-status');
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
        if (this._domCache) this._domCache.set('weather-status', weatherEl);
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
    const cur = this.player.currentWeapon ? this.player.currentWeapon() : null;
    const activeVeh = this.player.activeVehicle;
    const ammoPanelEl = this.el('ammo-panel');
    const airCockpitHudEl = this.el('aircraft-cockpit-hud');
    const vehOrientPanelEl = this.el('veh-orientation-panel');
    const reticleHullRingEl = this.el('reticle-hull-ring');
    const slotListEl = this.el('slot-list');
    const selWepIndEl = this.el('selected-weapon-indicator');

    if (activeVeh && activeVeh.isSecretOmegaFlyer) {
      this.vehicleOverlayEl.classList.add('hidden');
      this.scopeOverlayEl.classList.add('hidden');
      if (airCockpitHudEl) airCockpitHudEl.classList.add('hidden');
      if (vehOrientPanelEl) vehOrientPanelEl.classList.add('hidden');
      if (this.vehicleVitalsRowEl) this.vehicleVitalsRowEl.classList.add('hidden');
      this.crosshairEl.style.opacity = '1';
    } else if (activeVeh) {
      this.vehicleOverlayEl.classList.remove('hidden');
      this.scopeOverlayEl.classList.add('hidden');
      this.crosshairEl.style.opacity = '0';

      const vehTheme = activeVeh.isAircraft
        ? 'veh-theme-aircraft'
        : activeVeh.type === 'bike' || activeVeh.type === 'atv'
        ? 'veh-theme-moto'
        : activeVeh.type === 'apc'
        ? 'veh-theme-apc'
        : activeVeh.type === 'aa' || activeVeh.type === 'emplace_aa'
        ? 'veh-theme-aa'
        : activeVeh.type === 'humvee' || activeVeh.type === 'emplace_hmg'
        ? 'veh-theme-humvee'
        : activeVeh.type === 'warhorse'
        ? 'veh-theme-warhorse'
        : activeVeh.type === 'trebuchet'
        ? 'veh-theme-trebuchet'
        : activeVeh.type === 'emplace_mortar'
        ? 'veh-theme-mortar'
        : activeVeh.type === 'trex_mount' || activeVeh.type === 'raptor_mount'
        ? 'veh-theme-dino'
        : 'veh-theme-tank';

      if (this._lastVehOverlayTheme !== vehTheme) {
        this._lastVehOverlayTheme = vehTheme;
        this.vehicleOverlayEl.className = vehTheme;
      }

      const showHullRing =
        activeVeh.type === 'tank' ||
        activeVeh.type === 'apc' ||
        activeVeh.type === 'aa' ||
        activeVeh.type === 'humvee';
      if (reticleHullRingEl) {
        reticleHullRingEl.classList.toggle('hidden', !showHullRing);
      }

      this.updateVehicleCenterReticle(activeVeh);

      const isHorseMount = activeVeh.type === 'warhorse';
      const gunTagsEl = this.ammoPanelEl ? this.ammoPanelEl.querySelector('.tactical-gun-tags') : null;
      if (gunTagsEl) gunTagsEl.style.display = isHorseMount ? '' : 'none';

      if (activeVeh.isAircraft) {
        if (ammoPanelEl) ammoPanelEl.classList.add('hidden');
        if (vehOrientPanelEl) vehOrientPanelEl.classList.add('hidden');
        if (slotListEl) slotListEl.classList.add('hidden');
        if (selWepIndEl) selWepIndEl.classList.add('hidden');
        if (airCockpitHudEl) airCockpitHudEl.classList.remove('hidden');
        this.updateAircraftCockpitHud(activeVeh, dt);
      } else if (isHorseMount) {
        // Mounted Warhorse Archer: Clean Archery & Mount HUD (NO Tank Turret/FCS Orientation Box!)
        if (ammoPanelEl) ammoPanelEl.classList.remove('hidden');
        if (vehOrientPanelEl) vehOrientPanelEl.classList.add('hidden');
        if (slotListEl) slotListEl.classList.remove('hidden');
        if (selWepIndEl) selWepIndEl.classList.remove('hidden');
        if (airCockpitHudEl) airCockpitHudEl.classList.add('hidden');
      } else {
        if (ammoPanelEl) ammoPanelEl.classList.remove('hidden');
        if (vehOrientPanelEl) vehOrientPanelEl.classList.remove('hidden');
        if (slotListEl) slotListEl.classList.add('hidden');
        if (selWepIndEl) selWepIndEl.classList.remove('hidden');
        if (airCockpitHudEl) airCockpitHudEl.classList.add('hidden');
        this.vehNameLabel.textContent = activeVeh.name;
        const hpPrefix =
          activeVeh.type === 'warhorse'
            ? 'MOUNT HP'
            : activeVeh.type === 'trex_mount' || activeVeh.type === 'raptor_mount'
            ? 'PREDATOR HP'
            : activeVeh.type === 'trebuchet'
            ? 'SIEGE ENGINE HP'
            : activeVeh.type === 'bike' || activeVeh.type === 'atv'
            ? 'CHASSIS HP'
            : 'VEHICLE HP';
        this.vehHpLabel.textContent =
          activeVeh.type === 'tank' || activeVeh.type === 'apc'
            ? `HULL INTEGRITY: ${Math.round(
                activeVeh.hullIntegrityPct ?? (activeVeh.hp / Math.max(1, activeVeh.maxHp)) * 100
              )}% (${Math.ceil(activeVeh.hp)}/${activeVeh.maxHp} HP${
                activeVeh.maxEraBlocks ? ` • ERA ${activeVeh.eraBlocksIntact ?? activeVeh.maxEraBlocks}/${activeVeh.maxEraBlocks}` : ''
              })`
            : `${hpPrefix}: ${Math.ceil(activeVeh.hp)} / ${activeVeh.maxHp}`;
        if (this.vehSpeedLabelEl) {
          const curKmh = Math.round(Math.abs(activeVeh.forwardSpeed || 0) * 3.6);
          const maxKmh = Math.round((activeVeh.speed || 0) * 3.6);
          this.vehSpeedLabelEl.textContent =
            activeVeh.type === 'trebuchet' || activeVeh.isStaticEmplacement
              ? `RANGE: ${Math.round(this.player?.mortarRangeM || 200)}M (MAX 0 KM/H)`
              : `SPEED: ${curKmh} KM/H (MAX ${maxKmh} KM/H)`;
        }
        this.updateVehicleOrientationHud(activeVeh);
      }
      if (activeVeh.isAircraft && activeVeh.isShotDown) {
        this.interactPromptEl.textContent =
          '🚨 MAYDAY! AIRFRAME SHOT DOWN — PRESS [E] TO EJECT SEAT BEFORE GROUND CRASH!';
        this.interactPromptEl.classList.remove('hidden');
      } else if (activeVeh.isAircraft && activeVeh.isStalling) {
        this.interactPromptEl.textContent =
          '⚠️ AERODYNAMIC STALL (LOW AIRSPEED) — HOLD [W] THROTTLE UP & LOWER NOSE TO RECOVER!';
        this.interactPromptEl.classList.remove('hidden');
      } else {
        this.interactPromptEl.classList.add('hidden');
      }
    } else if (!this.player.downed) {
      this._lastVehOverlayTheme = null;
      this.vehicleOverlayEl.className = 'hidden';
      const gunTagsEl = this.ammoPanelEl ? this.ammoPanelEl.querySelector('.tactical-gun-tags') : null;
      if (gunTagsEl) gunTagsEl.style.display = '';
      if (ammoPanelEl) ammoPanelEl.classList.remove('hidden');
      if (slotListEl) slotListEl.classList.remove('hidden');
      if (selWepIndEl) selWepIndEl.classList.remove('hidden');
      if (airCockpitHudEl) airCockpitHudEl.classList.add('hidden');
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
          sniper8x: `RAZOR HD • 8.0X MIL-DOT (ZERO ${this.player.zeroDistance}M)`,
          rpgSight: 'PGO-7V • ROCKET OPTICAL GRID'
        };
        if (this.opticLabelEl) {
          this.opticLabelEl.textContent = opticLabels[opticType] || 'OPTIC SIGHT';
        }
        // Subtle zoom-pulse kick on the ADS optic housing when firing (zero Y translation
        // so the aiming dot always stays locked to the exact 50vw, 50vh barrel axis)
        this.opticFrameEl.style.transform = `scale(${1 + this.player.recoilKickZ * 0.28})`;
      } else {
        // When opticType is null (Bare Iron Sights / Aim Down Barrel), keep 2D scope overlay hidden
        // so the player aims directly down the 3D barrel and glowing tritium front sight pin!
        this.scopeOverlayEl.classList.add('hidden');
      }

      const activeWepDef = cur && cur.def ? cur.def : null;
      const isFootBowOrXbow = Boolean(
        activeWepDef && (activeWepDef.isBow || activeWepDef.isCrossbow)
      );
      if (isFootBowOrXbow && this.player.adsAmount > 0.35) {
        // Show dedicated Medieval Bow / Crossbow Arbor Sight when aiming (ADS) on foot!
        this.vehicleOverlayEl.className = 'veh-theme-warhorse';
        if (vehOrientPanelEl) vehOrientPanelEl.classList.add('hidden');
        if (reticleHullRingEl) reticleHullRingEl.classList.add('hidden');
        this.updateVehicleCenterReticle({
          type: 'warhorse',
          isFootArcherySight: true,
          isCrossbowSight: Boolean(activeWepDef.isCrossbow)
        });
        this.crosshairEl.style.opacity = '0';
      } else {
        const keepCrosshairInAds = Boolean(
          !inAdsOptic &&
            activeWepDef &&
            (activeWepDef.isBow ||
              activeWepDef.isCrossbow ||
              activeWepDef.isThrowingBlade ||
              activeWepDef.isVenomSpit ||
              activeWepDef.type === 'melee_sword')
        );
        this.crosshairEl.style.opacity =
          this.player.adsAmount > 0.45 && !keepCrosshairInAds ? '0' : '1';
        this.crosshairEl.style.transform =
          keepCrosshairInAds && this.player.adsAmount > 0.2
            ? `translate(-50%, -50%) scale(${(1 - this.player.adsAmount * 0.34).toFixed(2)})`
            : '';
      }

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
      const nearFriendlyMedic =
        (this.player.hp < 100 || this.player.bleeding) &&
        typeof this.player.findNearestFriendlyMedic === 'function'
          ? this.player.findNearestFriendlyMedic(6.5)
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
      const nearEnemyLoot =
        typeof this.player.findNearestEnemyLoot === 'function'
          ? this.player.findNearestEnemyLoot(4.8)
          : null;
      const nearBuildingKey =
        typeof this.player.findNearestBuildingKey === 'function'
          ? this.player.findNearestBuildingKey(5.2)
          : null;
      if (this.world && Array.isArray(this.world.buildingKeys)) {
        for (const kObj of this.world.buildingKeys) {
          if (!kObj.collected && kObj.mesh) {
            kObj.mesh.rotation.y += dt * 1.8;
          }
        }
      }
      const nearFlag =
        typeof this.player.findNearbyFlag === 'function'
          ? this.player.findNearbyFlag(18)
          : activeCaptureFlag;
      const damagedBld =
        typeof this.world.findNearestDamagedBuilding === 'function'
          ? this.world.findNearestDamagedBuilding(this.player.pos, 14.0)
          : null;
      const bpName =
        typeof this.player.getBlueprintName === 'function'
          ? this.player.getBlueprintName()
          : 'CHEST WALL';

      const maxDressings =
        this.player.maxBandages || (this.player.role === 'medic' ? 9 : 2);
      if (this.player.parachuting) {
        this.interactPromptEl.textContent =
          '🪂 PARACHUTE ACTIVE — STEER [WASD] • PRESS [C] OR [X] TO CUT PARACHUTE (FAST DROP)';
        this.interactPromptEl.classList.remove('hidden');
      } else if (this.player.parachuteCut && !this.player.grounded) {
        this.interactPromptEl.textContent =
          '⚡ PARACHUTE CUT (FREEFALL) — PRESS [SPACE] BEFORE GROUND IMPACT TO PULL RESERVE CHUTE!';
        this.interactPromptEl.classList.remove('hidden');
      } else if (this.player.draggedBot) {
        this.interactPromptEl.textContent =
          (this.player.bandages || 0) > 0
            ? `DRAGGING ${this.player.draggedBot.name} TO COVER • HOLD [F] TO REVIVE (-1 DRESSING • ${this.player.bandages}/${maxDressings}) • [E] DROP`
            : `DRAGGING ${this.player.draggedBot.name} • ⚠️ 0/${maxDressings} DRESSINGS LEFT (RESUPPLY AT STASH TO REVIVE!) • [E] DROP`;
        this.interactPromptEl.classList.remove('hidden');
      } else if (downedMate) {
        this.interactPromptEl.textContent =
          (this.player.bandages || 0) > 0
            ? `🩹 HOLD [F] TO REVIVE ${downedMate.name} (-1 DRESSING • ${this.player.bandages}/${maxDressings} LEFT) • PRESS [E] TO DRAG TO COVER`
            : `⚠️ 0/${maxDressings} FIELD DRESSINGS LEFT — RESUPPLY AT AMMO STASH [7] TO REVIVE ${downedMate.name} • [E] DRAG`;
        this.interactPromptEl.classList.remove('hidden');
      } else if (nearVeh) {
        const isModernEra = (this.world?.era || 'modern') === 'modern';
        const needsPilot = Boolean(nearVeh.isAircraft && isModernEra && this.player.role !== 'pilot');
        const vehPrompt = needsPilot
          ? `🔒 ${nearVeh.name} — ONLY [PILOT] CLASS CAN FLY AIRCRAFT! (SWITCH TO PILOT AT AMMO STASH [L] / DEPLOY)`
          : nearVeh.npcDriver
          ? `PRESS [E] TO COMMANDEER ${nearVeh.name} FROM ${nearVeh.npcDriver.name}`
          : `PRESS [E] TO ENTER ${nearVeh.name}`;
        const fSuffix = nearCrate
          ? ' • [F] RESUPPLY ALL • [L] ROLE/GUN/GUNSMITH'
          : damagedBld
          ? ` • [F] REPAIR BUILDING (${damagedBld.info.integrityPct}%)`
          : nearFlag && nearFlag.owner === this.player.team
          ? ` • [F] BUILD ${bpName}`
          : '';
        this.interactPromptEl.textContent = `${vehPrompt}${fSuffix}`;
        this.interactPromptEl.classList.remove('hidden');
      } else if (nearFriendlyMedic) {
        this.interactPromptEl.textContent = `🏥 MEDIC ${nearFriendlyMedic.name} TREATING YOUR INJURIES (${Math.ceil(
          this.player.hp
        )}/100 HP) • PRESS [F] FOR INSTANT MAX HEAL`;
        this.interactPromptEl.classList.remove('hidden');
      } else if (injuredMate) {
        this.interactPromptEl.textContent = `PRESS [F] TO HEAL ${injuredMate.name} (${Math.ceil(
          injuredMate.hp
        )}/100 HP)`;
        this.interactPromptEl.classList.remove('hidden');
      } else if (nearCrate) {
        this.interactPromptEl.textContent =
          '📦 AMMO & KIT STASH — PRESS [F] TO RESUPPLY ALL • PRESS [L] FOR ROLE, WEAPON & GUNSMITH MENU';
        this.interactPromptEl.classList.remove('hidden');
      } else if (nearBuildingKey) {
        this.interactPromptEl.textContent =
          '🔑 ARMORY CASE KEY FOUND IN BUILDING ROOM — PRESS [F] OR WALK OVER TO COLLECT (+1 🔑 KEY & +50 XP)!';
        this.interactPromptEl.classList.remove('hidden');
      } else if (nearEnemyLoot) {
        const remItems = (nearEnemyLoot.items || []).filter((it) => !it.looted).length;
        const cashTag = nearEnemyLoot.cashAutoLooted
          ? `💵 +$${nearEnemyLoot.halfLootCash || 140} (50% CASH LOOTED)`
          : `💵 +$${nearEnemyLoot.halfLootCash || 140} (50% OF $${nearEnemyLoot.ownerMatchCash || 280} CASH)`;
        this.interactPromptEl.textContent = `🎒 ENEMY LOOT: ${nearEnemyLoot.ownerRank} ${nearEnemyLoot.ownerName} • ${cashTag} • TAP [F] AUTO-LOOT GEAR & 50% CASH • HOLD [F] / [I] MANUAL LOOT (${remItems} ITEMS)`;
        this.interactPromptEl.classList.remove('hidden');
      } else if (damagedBld) {
        this.interactPromptEl.textContent = `🔨 BUILDING COVER DAMAGED (${damagedBld.info.integrityPct}% INTACT) — PRESS [F] OR [T] TO REPAIR BUILDING (+75 XP)`;
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

      // Render Squad-style Field Role & Kit Switcher Bar whenever standing near an Ammo & Kit Stash
      this.updateFieldKitBar(nearCrate);
    } else {
      this.updateFieldKitBar(false);
    }

    // Update 360° Directional Incoming Fire & Armor Impact Indicators + Telemetry Panel
    this.updateDamageIndicators(dt);
    this.updateTelemetryPanel();

    // Vehicle Hull Armor Integrity Row + Crew Health, Armor, Bleeding, Grenades & Stance
    if (activeVeh && !activeVeh.isSecretOmegaFlyer && this.vehicleVitalsRowEl) {
      this.vehicleVitalsRowEl.classList.remove('hidden');
      const hullPct = Math.max(0, Math.min(100, (activeVeh.hp / activeVeh.maxHp) * 100));
      if (this.vehHullTagEl) {
        this.vehHullTagEl.textContent =
          activeVeh.type === 'tank'
            ? 'TANK'
            : activeVeh.type === 'apc'
            ? '8×8 IFV'
            : activeVeh.type === 'aa' || activeVeh.type === 'emplace_aa'
            ? 'SPAAG'
            : activeVeh.type === 'humvee'
            ? 'MRAP'
            : activeVeh.type === 'bike'
            ? 'MOTO'
            : activeVeh.type === 'atv'
            ? 'QUAD'
            : activeVeh.type === 'warhorse'
            ? 'STEED'
            : activeVeh.type === 'trebuchet'
            ? 'SIEGE'
            : activeVeh.type === 'trex_mount' || activeVeh.type === 'raptor_mount'
            ? 'DINO'
            : 'MOUNT';
      }
      if (this.vehHullFillEl) {
        this.vehHullFillEl.style.width = `${hullPct}%`;
        this.vehHullFillEl.style.background =
          hullPct < 35 ? '#e74c3c' : hullPct < 65 ? '#f39c12' : '#2ecc71';
      }
      if (this.vehHullValEl) {
        if (activeVeh.type === 'warhorse') {
          const horseBarding = Math.ceil(activeVeh.armor || 0);
          this.vehHullValEl.textContent = `${Math.ceil(activeVeh.hp)} HP • ${horseBarding} BARDING`;
        } else if (activeVeh.type === 'tank' || activeVeh.type === 'apc') {
          this.vehHullValEl.textContent = `${Math.round(hullPct)}% (${Math.ceil(activeVeh.hp)})`;
        } else {
          this.vehHullValEl.textContent = Math.ceil(activeVeh.hp);
        }
      }
      if (this.crewHpLabelEl) {
        this.crewHpLabelEl.textContent =
          activeVeh.type === 'bike' || activeVeh.type === 'atv' || activeVeh.type === 'warhorse'
            ? 'RIDER HP'
            : activeVeh.type === 'trex_mount' || activeVeh.type === 'raptor_mount'
            ? 'HUNTER'
            : 'CREW';
      }
      if (activeVeh.type === 'warhorse') {
        const horseBarding = Math.ceil(activeVeh.armor || 0);
        const horseMaxBarding = activeVeh.maxArmor || 120;
        this.armorBadgeEl.textContent = `RIDER ARMOR: ${Math.ceil(this.player.armor)}/${
          this.player.maxArmor || 45
        } • STEED BARDING: ${horseBarding}/${horseMaxBarding}`;
      } else if (activeVeh.type === 'tank' || activeVeh.type === 'apc') {
        const az = activeVeh.armorZones || { front: 100, left: 100, right: 100, rear: 100 };
        const sidePct = Math.round(Math.min(az.left ?? 100, az.right ?? 100));
        const sub = activeVeh.subsystems || {};
        const subStatus =
          sub.tracks === 'DAMAGED'
            ? '⚠️ TRACKS DMG'
            : sub.engine === 'CRITICAL'
            ? '🔥 ENG CRIT'
            : sub.engine === 'SMOKING'
            ? '💨 ENG SMOKE'
            : sub.turret === 'DAMAGED'
            ? '⚠️ TURRET RING'
            : 'SYS OK';
        this.armorBadgeEl.textContent = `HULL ${Math.round(hullPct)}% • F:${Math.round(
          az.front ?? 100
        )}% S:${sidePct}% R:${Math.round(az.rear ?? 100)}% • ${subStatus}`;
      } else {
        const armorPrefix =
          activeVeh.type === 'bike' || activeVeh.type === 'atv'
            ? 'CHASSIS'
            : activeVeh.type === 'trebuchet'
            ? 'TIMBER FRAME'
            : activeVeh.type === 'trex_mount' || activeVeh.type === 'raptor_mount'
            ? 'SCALED HIDE'
            : 'HULL ARMOR';
        this.armorBadgeEl.textContent = `${armorPrefix}: ${Math.ceil(activeVeh.hp)}/${activeVeh.maxHp}`;
      }
    } else {
      if (this.vehicleVitalsRowEl) this.vehicleVitalsRowEl.classList.add('hidden');
      if (this.crewHpLabelEl) this.crewHpLabelEl.textContent = 'HP';
      this.armorBadgeEl.textContent = `ARMOR: ${Math.ceil(this.player.armor)}/${
        this.player.maxArmor || 50
      }`;
    }

    this.hpValEl.textContent = Math.ceil(this.player.hp);
    this.hpFillEl.style.width = `${Math.max(0, this.player.hp)}%`;
    const isMedicTreating = Boolean(
      !this.player.bleeding && this.player.medicHealTimer > 0 && this.player.beingHealedByMedic
    );
    this.bleedBadgeEl.classList.toggle('hidden', !this.player.bleeding && !isMedicTreating);
    if (this.player.bleeding) {
      const approxBleedSecs = Math.ceil((Math.max(1, this.player.hp) / 2) * 2.5);
      this.bleedBadgeEl.textContent = `BLEEDING [HOLD H] (~${approxBleedSecs}s)`;
      this.bleedBadgeEl.style.background = '';
      this.bleedBadgeEl.style.color = '';
    } else if (isMedicTreating) {
      this.bleedBadgeEl.textContent = `🏥 MEDIC ${this.player.beingHealedByMedic} HEALING (${Math.ceil(
        this.player.hp
      )}/100 HP)`;
      this.bleedBadgeEl.style.background = 'rgba(46, 204, 113, 0.28)';
      this.bleedBadgeEl.style.color = '#7bed9f';
    }
    const curSpeedMps = this.player.horizSpeed || Math.hypot(this.player.vel?.x || 0, this.player.vel?.z || 0);
    const isBhopping = !activeVeh && !this.player.parachuting && !this.player.downed && curSpeedMps > 10.3;
    this.stanceBadgeEl.textContent = activeVeh
      ? activeVeh.isAircraft
        ? '✈️ PILOT [E EJECT]'
        : activeVeh.type === 'bike' || activeVeh.type === 'atv'
        ? '🏍️ RIDER [SPACE WHEELIE]'
        : activeVeh.type === 'warhorse'
        ? '🐎 MOUNTED CAVALRY'
        : activeVeh.type === 'trebuchet'
        ? '🪨 SIEGE CREW [T/G]'
        : activeVeh.type === 'trex_mount' || activeVeh.type === 'raptor_mount'
        ? '🦖 APEX PREDATOR'
        : activeVeh.type === 'humvee'
        ? '🚙 MRAP GUNNER'
        : activeVeh.type === 'apc'
        ? '🛡️ 8×8 IFV CREW'
        : activeVeh.type === 'aa' || activeVeh.type === 'emplace_aa'
        ? '📡 SPAAG RADAR CREW'
        : '🛡️ ARMOR CREW PROTECTED'
      : this.player.parachuting
      ? '🪂 PARACHUTE [WASD]'
      : this.player.downed
      ? 'INCAPACITATED'
      : isBhopping
      ? `⚡ BHOP ${curSpeedMps.toFixed(1)} M/S`
      : this.player.prone
      ? 'PRONE [Z]'
      : this.player.crouching
      ? 'CROUCHED [C]'
      : 'STANDING';
    const maxPlayerDressings =
      this.player.maxBandages || (this.player.role === 'medic' ? 9 : 2);
    if (this.player.role === 'medic') {
      const bagPct = Math.round(
        ((this.player.medicBagSupply ?? 600) / (this.player.maxMedicBagSupply || 600)) * 100
      );
      this.bandageBadgeEl.textContent = `DRESSINGS: ${this.player.bandages}/${maxPlayerDressings} • BAG: ${bagPct}%`;
    } else {
      this.bandageBadgeEl.textContent = `DRESSINGS: ${this.player.bandages}/${maxPlayerDressings}`;
    }
    this.grenadeBadgeEl.textContent = `FRAGS [G]: ${this.player.grenades}`;
    const backpackBadgeEl = this.el('backpack-hud-badge');
    if (backpackBadgeEl) {
      const curWep = this.player.currentWeapon ? this.player.currentWeapon() : null;
      const looseRds = curWep && typeof curWep.looseAmmo === 'number' ? curWep.looseAmmo : 0;
      const lootCount = Array.isArray(this.player.backpackItems)
        ? this.player.backpackItems.length
        : 0;
      backpackBadgeEl.textContent =
        lootCount > 0
          ? `🎒 PACK [I]: +${looseRds}R • ${lootCount} LOOT`
          : `🎒 PACK [I]: +${looseRds} RDS`;
    }

    if (this.player.reloading || this.player.slowReloading) {
      this.interactPromptEl.classList.add('hidden');
    }
    this.updateReloadAnimationHud(cur);

    if (this.player.reviveProgress > 0 && this.player.reviveTargetBot) {
      this.actionProgressEl.classList.remove('hidden');
      this.actionLabelEl.textContent = this.player.isDraggingAlly
        ? `DRAGGING ${this.player.reviveTargetBot.name} TO SAFE COVER (STOP TO REVIVE)...`
        : `WRAPPING BANDAGE — REVIVING ${this.player.reviveTargetBot.name}...`;
      this.actionFillEl.style.width = `${Math.min(100, this.player.reviveProgress * 100)}%`;
    } else if (this.player.bandageProgress > 0) {
      this.actionProgressEl.classList.remove('hidden');
      this.actionLabelEl.textContent = 'WRAPPING BANDAGE...';
      this.actionFillEl.style.width = `${Math.min(100, this.player.bandageProgress * 100)}%`;
    } else {
      // Reloading & slow bullet-packing now display the animated cutaway visualizer (#reload-anim-hud)
      this.actionProgressEl.classList.add('hidden');
    }

    if (activeVeh && activeVeh.isSecretOmegaFlyer) {
      this.vehicleOverlayEl.classList.add('hidden');
      this.scopeOverlayEl.classList.add('hidden');
      if (airCockpitHudEl) airCockpitHudEl.classList.add('hidden');
      if (vehOrientPanelEl) vehOrientPanelEl.classList.add('hidden');
      if (this.vehicleVitalsRowEl) this.vehicleVitalsRowEl.classList.add('hidden');
      this.crosshairEl.style.opacity = '1';
    } else if (activeVeh) {
      const activeSlot = activeVeh.activeWeaponSlot || 0;
      this.weaponNameEl.textContent = activeVeh.name;
      if (activeVeh.isAircraft) {
        const aRole = activeVeh.aircraftRole || activeVeh.type;
        if (aRole === 'cas') {
          this.ammoClipEl.textContent = activeSlot === 1 ? 'POD' : 'BRRT';
          this.ammoReserveEl.textContent = activeSlot === 1 ? '70MM' : '30MM';
          this.fireModeEl.textContent =
            '[1] 30MM GAU-8 AVENGER [LMB] • [2] HYDRA-70 ROCKETS [SPACE] • [9] SWITCH JET • [E] EJECT PARACHUTE';
        } else if (aRole === 'gunship') {
          this.ammoClipEl.textContent = activeSlot === 2 ? '105' : activeSlot === 1 ? '40MM' : '25MM';
          this.ammoReserveEl.textContent = activeSlot === 2 ? 'HOWZ' : activeSlot === 1 ? 'BOFR' : 'GATL';
          this.fireModeEl.textContent =
            '[1] 25MM GATLING • [2] 40MM BOFORS • [3/SPACE] 105MM HOWITZER • [9] SWITCH JET • [E] EJECT PARACHUTE';
        } else {
          // Combined Strike Fighter + Precision Ground Bomber
          const lockReady = this.player.aircraftLockTarget && this.player.aircraftLockProgress >= 1;
          this.ammoClipEl.textContent =
            activeSlot === 2 ? 'JDAM' : activeSlot === 1 ? (lockReady ? 'LOCK' : 'SEEK') : '20MM';
          this.ammoReserveEl.textContent =
            activeSlot === 2 ? 'GBU' : activeSlot === 1 ? 'A2A' : 'VULC';
          this.fireModeEl.textContent =
            '[1] 20MM VULCAN • [2] AIM-9X A2A [SPACE] • [3] JDAM/GBU-28 BOMBS (CCIP) • [9] SWITCH JET • [E] EJECT';
        }
      } else if (activeVeh.type === 'aa' || activeVeh.type === 'emplace_aa') {
        const lockReady = this.player.aircraftLockTarget && this.player.aircraftLockProgress >= 1;
        this.ammoClipEl.textContent = activeSlot === 1 ? (lockReady ? 'LOCK' : 'SAM') : '1050';
        this.ammoReserveEl.textContent = activeSlot === 1 ? 'POD' : 'PROX';
        this.fireModeEl.textContent =
          '[1] TWIN 25/30MM PROXIMITY AA [LMB] • [2] STINGER/9M311 SAM [SPACE] • [E] EXIT';
      } else if (activeVeh.type === 'emplace_mortar') {
        const mRange = Math.round(this.player.mortarRangeM || 200);
        this.ammoClipEl.textContent = activeSlot === 1 ? '3xHE' : '81MM';
        this.ammoReserveEl.textContent = `${mRange}M`;
        this.fireModeEl.textContent =
          `[1] 81MM INDIRECT HE (${mRange}M) [LMB] • [2] 3-ROUND BARRAGE [SPACE] • PITCH TO AIM RANGE`;
      } else if (activeVeh.type === 'trebuchet') {
        const mRange = Math.round(this.player.mortarRangeM || 200);
        this.ammoClipEl.textContent =
          activeVeh.fireCooldown > 0 ? `${activeVeh.fireCooldown.toFixed(1)}s` : '90KG';
        this.ammoReserveEl.textContent = `${mRange}M`;
        this.fireModeEl.textContent =
          `FLAMING SIEGE BOULDER (${mRange}M ARC) [LMB] • [W/S] RANGE • [T] CREW / [G] WINCH`;
      } else if (activeVeh.type === 'warhorse') {
        const spdKmh = Math.round(Math.abs(activeVeh.forwardSpeed || 0) * 3.6);
        this.ammoClipEl.textContent =
          activeVeh.fireCooldown > 0 ? `${activeVeh.fireCooldown.toFixed(1)}s` : 'YEW';
        this.ammoReserveEl.textContent = `${spdKmh}KMH`;
        this.fireModeEl.textContent =
          'MOUNTED YEW WARBOW (BODKIN ARROWS [LMB]) • CAVALRY GALLOP & TRAMPLE [WASD + SPACE]';
      } else if (activeVeh.type === 'trex_mount' || activeVeh.type === 'raptor_mount') {
        const isTrex = activeVeh.type === 'trex_mount';
        const spdKmh = Math.round(Math.abs(activeVeh.forwardSpeed || 0) * 3.6);
        this.ammoClipEl.textContent = isTrex ? 'JAWS' : 'CLAW';
        this.ammoReserveEl.textContent = `${spdKmh}KMH`;
        this.fireModeEl.textContent = isTrex
          ? 'CRUSHING THEROPOD JAWS & STOMP [LMB] • APEX ROAR & CHARGE [SPACE]'
          : 'SICKLE TALONS & VENOM SPIT [LMB] • PREDATOR POUNCE LEAP [SPACE]';
      } else if (activeVeh.type === 'bike' || activeVeh.type === 'atv') {
        const spdKmh = Math.round(Math.abs(activeVeh.forwardSpeed || 0) * 3.6);
        const gearStr = activeVeh.isElectric ? 'EV' : `G${activeVeh.currentGear || 'N'}`;
        this.ammoClipEl.textContent = `${spdKmh}`;
        this.ammoReserveEl.textContent = `KM/H (${gearStr})`;
        this.fireModeEl.textContent =
          activeVeh.type === 'atv'
            ? 'TWIN 9MM QUAD PDW [LMB] • [SPACE] OVERDRIVE BOOST • [WASD] STEER'
            : '9MM HANDLEBAR SMG [LMB] • [SPACE] WHEELIE / BOOST • [A/D] LEAN';
      } else if (activeVeh.weaponType === 'tank_cannon') {
        if (activeSlot === 1) {
          this.ammoClipEl.textContent = activeVeh.coaxOverheated ? 'HOT' : 'INF';
          this.ammoReserveEl.textContent = '7.62 AP';
          this.fireModeEl.textContent = '[2] 950 RPM AP COAX MG (FLAT AIM AT +) • [1] CANNON';
        } else {
          this.ammoClipEl.textContent =
            activeVeh.fireCooldown > 0 ? `${activeVeh.fireCooldown.toFixed(1)}s` : 'RDY';
          this.ammoReserveEl.textContent = 'APHE';
          this.fireModeEl.textContent = '[1] MAIN CANNON [LMB] (ARC >135M) • COAX MG [SPACE / 2] (FLAT)';
        }
      } else if (activeVeh.weaponType === 'autocannon') {
        this.ammoClipEl.textContent = activeSlot === 1 ? 'COAX' : '30MM';
        this.ammoReserveEl.textContent = 'BELT';
        this.fireModeEl.textContent =
          activeSlot === 1
            ? '[2] 950 RPM 7.62MM AP COAX [LMB / SPACE] (FLAT) • [1] 30MM'
            : '[1] 330 RPM 30MM HE [LMB] • COAX MG [SPACE / 2] (FLAT)';
      } else {
        this.ammoClipEl.textContent = '50BMG';
        this.ammoReserveEl.textContent = 'AP-I';
        this.fireModeEl.textContent = 'ROOF .50 CAL M2HB RWS (720 RPM AP-I • FLAT AIM AT +)';
      }
      if (this.magBarsRowEl) this.magBarsRowEl.innerHTML = '';
    } else if (cur) {
      this.weaponNameEl.textContent = cur.def.name;
      this.ammoClipEl.textContent = cur.clip;
      this.ammoReserveEl.textContent = cur.reserve;
      if (cur.def.type === 'stinger') {
        const sTgt = this.player.stingerLockTarget;
        const sPct = Math.round((this.player.stingerLockProgress || 0) * 100);
        this.fireModeEl.textContent = sTgt
          ? sPct >= 100
            ? `🔒 IR LOCKED ON ${sTgt.name.split(' ')[0]} — FIRE [LMB]! • [3] SWAP TO RPG-7 AT`
            : `📡 SEEKING ${sTgt.name.split(' ')[0]} (${sPct}%) • [3] SWAP TO RPG-7 AT`
          : 'IR ANTI-AIR SAM (AIM AT ENEMY JET) • PRESS [3] AGAIN TO SWAP TO RPG-7 AT';
      } else if (cur.def.type === 'rpg') {
        this.fireModeEl.textContent = `${cur.def.caliber} • PRESS [3] AGAIN TO SWAP TO STINGER AA`;
      } else if (cur.def.type === 'melee_sword') {
        const dirIconMap = {
          UP: '▴ OVERHEAD CLEAVE',
          DOWN: '▾ HALF-SWORD THRUST',
          LEFT: '◂ LEFT ZORNHAU SWEEP',
          RIGHT: '▸ RIGHT ZORNHAU SLASH'
        };
        const gDir = this.player.meleeGuardDir || 'RIGHT';
        const dirTag = cur.def.isTwoHandedShield
          ? '🛡️ LMB: HEAVY SHIELD BASH (KNOCKBACK)'
          : cur.def.isPolearm
          ? gDir === 'UP'
            ? '🔱 LMB: HALBERD OVERHEAD CHOP'
            : '🔱 LMB: 5.8M SPEAR THRUST'
          : this.player.isAds && cur.def.id === 'longsword'
          ? '🛡️⚔️ LMB: SHIELD BASH + RIPOSTE THRUST'
          : `⚔️ ${dirIconMap[gDir] || '▸ RIGHT SLASH'}`;
        const blockTag = cur.def.isTwoHandedShield
          ? this.player.isAds
            ? '🛡️ RMB WALL: ACTIVE (-92% DMG)'
            : '🛡️ PASSIVE SHIELD: -35% (HOLD RMB: -92%)'
          : cur.def.id === 'longsword'
          ? this.player.isAds
            ? '🛡️ RMB SHIELD BLOCK: ACTIVE (-75% DMG)'
            : '🛡️ OFF-HAND SHIELD: -30% (HOLD RMB: -75%)'
          : cur.def.isPolearm
          ? this.player.isAds
            ? '🔱 RMB SPEAR BRACE: ACTIVE (-65% DMG)'
            : 'HOLD RMB: ANTI-CAVALRY SPEAR BRACE (-65%)'
          : this.player.isAds
          ? `⚔️ RMB ${gDir} PARRY: ACTIVE (-60% MELEE / -25% ARROW)`
          : 'HOLD RMB: 4-DIR ZWEIHÄNDER PARRY (-60% DMG)';
        this.fireModeEl.textContent = `${dirTag} • ${blockTag}`;
      } else {
        const mv = cur.def.muzzleVelocity ? ` • ${cur.def.muzzleVelocity} M/S` : '';
        this.fireModeEl.textContent = `${cur.def.caliber}${mv} • [F/V] INSPECT`;
      }
      this.updateMagBars(cur);
    }

    // Update Zeroing, Arrow/Optic Type, and Fortification Blueprint Badges
    const isBowOrXbowActive = Boolean(
      (activeVeh && activeVeh.type === 'warhorse') ||
        (cur && cur.def && (cur.def.isBow || cur.def.isCrossbow))
    );
    if (this.zeroBadgeEl) {
      this.zeroBadgeEl.textContent = isBowOrXbowActive
        ? `ELEV [X]: ${this.player.zeroDistance || 50}M`
        : `ZERO [X]: ${this.player.zeroDistance}m`;
    }
    if (this.cantedBadgeEl && (cur || (activeVeh && activeVeh.type === 'warhorse'))) {
      if (isBowOrXbowActive) {
        const isFire = Boolean(this.player.fireArrowsActive);
        this.cantedBadgeEl.textContent = isFire
          ? '🔥 [V] ARROW: FIRE ARROW (+BURN)'
          : '🏹 [V] ARROW: REGULAR BODKIN';
        this.cantedBadgeEl.style.color = isFire ? '#ff7f50' : '#7bed9f';
      } else {
        this.cantedBadgeEl.style.color = '';
        if (!cur.def.opticType) {
          this.cantedBadgeEl.textContent = 'OPTIC: IRON SIGHTS';
        } else if (cur.def.hasCantedSight) {
          this.cantedBadgeEl.textContent = `OPTIC [V]: ${
            this.player.useCantedSight ? 'CANTED 45°' : cur.def.opticType.toUpperCase()
          }`;
        } else {
          this.cantedBadgeEl.textContent = `OPTIC: ${cur.def.opticType.toUpperCase()}`;
        }
      }
    }
    if (this.blueprintBadgeEl) {
      const bpName =
        typeof this.player.getBlueprintName === 'function'
          ? this.player.getBlueprintName()
          : 'CHEST WALL';
      const stashCd = Math.ceil(this.player.ammoStashCooldown || 0);
      const stashText = stashCd > 0 ? `STASH [7]: ${stashCd}s` : 'STASH [7]: RDY';
      const isModernEra = (this.world?.era || 'modern') === 'modern';
      this.blueprintBadgeEl.textContent = isModernEra
        ? `BUILD [F/T/B]: ${bpName} • 🏰 EMPLACE [8] • ✈️ JET/AC-130 [9] • ${stashText}`
        : `BUILD [F/T/B]: ${bpName} • 🏰 FORTIFY [8] • ${stashText}`;
    }

    const selWepIndNameEl = this.el('selected-weapon-indicator-name');
    if (selWepIndNameEl) {
      if (activeVeh && activeVeh.isSecretOmegaFlyer) {
        this.vehicleOverlayEl.classList.add('hidden');
        this.scopeOverlayEl.classList.add('hidden');
        if (airCockpitHudEl) airCockpitHudEl.classList.add('hidden');
        if (vehOrientPanelEl) vehOrientPanelEl.classList.add('hidden');
        if (this.vehicleVitalsRowEl) this.vehicleVitalsRowEl.classList.add('hidden');
        this.crosshairEl.style.opacity = '1';
      } else if (activeVeh && activeVeh.type === 'warhorse') {
        const wSlot = activeVeh.activeWeaponSlot || 0;
        const arrTag = this.player.fireArrowsActive ? '🔥 FIRE ARROWS' : 'BODKIN ARROWS';
        selWepIndNameEl.textContent =
          wSlot === 1
            ? '[2] COUCHED CAVALRY LANCE (PRESS [1] FOR LONGBOW)'
            : `[1] ROYAL YEW LONGBOW (${arrTag} • [V] TOGGLE FIRE • [2] LANCE)`;
      } else if (activeVeh) {
        const vSlot = (activeVeh.activeWeaponSlot || 0) + 1;
        selWepIndNameEl.textContent = `[VEHICLE SLOT ${vSlot}] ${activeVeh.name}`;
      } else if (cur && cur.def) {
        const sIdx = (this.player.currentSlotIndex || 0) + 1;
        const wId = cur.def.id;
        const eqSkin =
          wId === 'hammer'
            ? this.player.equippedHammerSkin
            : this.player.equippedWeaponSkins?.[wId];
        const skinSuffix =
          eqSkin === 'pure_gold'
            ? ' • ★ 24K GOLD'
            : eqSkin === 'pure_blue'
            ? ' • ★ SAPPHIRE BLUE'
            : eqSkin === 'karambit'
            ? ' • ★ KARAMBIT GOLD'
            : eqSkin === 'butterfly'
            ? ' • ★ BUTTERFLY SAPPHIRE'
            : '';
        selWepIndNameEl.textContent = `[SLOT ${sIdx}] ${cur.def.name}${skinSuffix}`;
      }
    }

    for (let i = 0; i < 4; i++) {
      const slotEl = this.el(`slot-${i + 1}`);
      if (slotEl) {
        const isActiveSlot = i === this.player.currentSlotIndex && !activeVeh;
        slotEl.classList.toggle('active', isActiveSlot);
        const sDef = this.player.slots[i]?.def;
        if (sDef) {
          const isEngSlot3 = i === 2 && this.player.role === 'engineer';
          const shortLbl = isEngSlot3
            ? `${sDef.shortName || sDef.name} [AT/AA]`
            : sDef.shortName || sDef.name;
          const expectedText = `${i + 1}:${shortLbl}`;
          if (slotEl.dataset.label !== expectedText) {
            slotEl.dataset.label = expectedText;
            slotEl.innerHTML = `<span class="slot-key">${i + 1}</span><span class="slot-title">${shortLbl}</span><span class="slot-active-pill">▲ SELECTED</span>`;
          }
        }
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
      const cmdMapCanvas = this.el('cmd-tactical-map-canvas');
      if (cmdMapCanvas) {
        this.drawCommandTacticalMap(cmdMapCanvas);
      }
    }

    // Suppression visual overlay (Squad-style screen darkening when suppressed)
    this.updateSuppressionOverlay();

    // Kill streak HUD badge + War Crimes (Medics Killed) HUD badge + Forward Base Defender Buff badge
    this.updateKillStreakBadge();
    this.updateWarCrimeBadge();
    this.updateForwardBaseDefenseBadge();

    // Commander UAV HUD indicator
    this.updateUAVOverlay();

    // Commo Rose chat callout decay
    this.updateCommoCallout(dt);

    // Airstrike inbound countdown
    this.updateAirstrikeHUD();
  },

  /**
   * Dedicated Visual Aircraft Cockpit Flight Instrument Cluster (`#aircraft-cockpit-hud`):
   * - Analog + Digital Airspeed Indicator (Speedometer Dial + Rotating Needle + Cruise Bug + Throttle Bar)
   * - Turn Coordinator (Banking Miniature Aircraft Silhouette + Standard-Rate Turn Marks)
   * - Slip / Skid Inclinometer ("Ball-in-Curved-Tube" that shifts left/right with slip & skid forces)
   * - Artificial Horizon (ADI Pitch/Roll Sphere) + Vertical Altimeter & VSI Bars
   * - Visual Ordnance Pylon & Countermeasure Strip ([1], [2], [3], [X])
   */
  updateAircraftCockpitHud(v, dt = 0.016) {
    if (!v || !v.isAircraft) return;

    // Bind interactive pylon click handlers once
    if (!this._airCockpitPylonsBound) {
      this._airCockpitPylonsBound = true;
      [0, 1, 2].forEach((slotIdx) => {
        const pEl = this.el(`air-pylon-${slotIdx + 1}`);
        if (pEl) {
          pEl.style.cursor = 'pointer';
          pEl.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (this.player?.activeVehicle?.isAircraft) {
              this.player.activeVehicle.activeWeaponSlot = slotIdx;
            }
          });
        }
      });
      const cmEl = this.el('air-pylon-cm');
      if (cmEl) {
        cmEl.style.cursor = 'pointer';
        cmEl.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.player?.activateVehicleCountermeasure?.();
        });
      }
    }

    const aRole = v.aircraftRole || v.type || 'fighter';
    const isWright = aRole === 'wright_flyer';
    const isB2 = aRole === 'b2_spirit';
    const isCas = aRole === 'cas';
    const isGunship = aRole === 'gunship';

    // 1. Header Bar: Aircraft Tail Badge, Airframe Integrity Bar & Heading / G-Load Pill
    const iconEl = this.el('air-hud-icon');
    const modelEl = this.el('air-hud-model');
    if (iconEl) {
      iconEl.textContent = isWright ? '🪁' : isB2 ? '🦇' : isGunship ? '🛸' : '✈️';
    }
    if (modelEl) {
      modelEl.textContent = isWright
        ? v.team === 'RU'
          ? '1913 ILYA MUROMETS'
          : '1903 WRIGHT FLYER I'
        : isB2
        ? v.team === 'RU'
          ? 'TUPOLEV PAK DA'
          : 'B-2A SPIRIT STEALTH'
        : isCas
        ? v.team === 'RU'
          ? 'SU-25SM FROGFOOT'
          : 'A-10C WARTHOG'
        : isGunship
        ? v.team === 'RU'
          ? 'TU-95MS GUNSHIP'
          : 'AC-130J GHOSTRIDER'
        : v.team === 'RU'
        ? 'SU-57 FELON'
        : 'F-15EX EAGLE';
    }

    const hpPct = v.isShotDown
      ? 0
      : Math.max(0, Math.min(100, Math.round(((v.hp || 0) / (v.maxHp || 1500)) * 100)));
    const hpFillEl = this.el('air-hud-hp-fill');
    const hpValEl = this.el('air-hud-hp-val');
    if (hpFillEl) {
      hpFillEl.style.width = `${hpPct}%`;
      hpFillEl.style.background =
        hpPct > 55
          ? 'linear-gradient(90deg, #27ae60, #2ecc71)'
          : hpPct > 25
          ? 'linear-gradient(90deg, #e67e22, #f1c40f)'
          : 'linear-gradient(90deg, #c0392b, #ff4757)';
    }
    if (hpValEl) {
      hpValEl.textContent = v.isShotDown ? 'MAYDAY' : `${hpPct}%`;
      hpValEl.style.color = hpPct > 55 ? '#7bed9f' : hpPct > 25 ? '#f1c40f' : '#ff6b6b';
    }

    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    let hdgDeg = Math.round(((-(v.yaw || 0) * 180) / Math.PI) % 360);
    if (hdgDeg < 0) hdgDeg += 360;
    const hdgDirStr = dirs[Math.round(hdgDeg / 45) % 8];

    // Load factor G-force from bank angle (1 / cos(roll)) + pitch rate
    const rollRad = v.roll || 0;
    const pitchRad = v.pitch || 0;
    const gLoad = Math.min(
      9.0,
      Math.max(0.5, 1.0 / Math.max(0.22, Math.cos(Math.min(1.25, Math.abs(rollRad)))) + Math.max(0, pitchRad * 1.4))
    );
    const hdgPillEl = this.el('air-hud-hdg-pill');
    if (hdgPillEl) {
      hdgPillEl.textContent = v.isShotDown
        ? '🚨 SHOT DOWN — PRESS [E] EJECT!'
        : v.isStalling
        ? '⚠️ STALL — HOLD [W] & NOSE DOWN!'
        : `HDG ${String(hdgDeg).padStart(3, '0')}° ${hdgDirStr} • ${gLoad.toFixed(1)}G`;
      hdgPillEl.style.color = v.isShotDown || v.isStalling ? '#ff6b6b' : '';
    }

    // 2. Speedometer (Airspeed Indicator Dial) + Vertical Throttle Bar
    const spdMs = Math.max(0, v.forwardSpeed || 0);
    const kmh = Math.round(spdMs * 3.6);
    const kts = Math.round(spdMs * 1.94384);
    const mach = (spdMs / 340.3).toFixed(2);
    const scaleMaxKmh = isWright ? 900 : 720;

    if (this._lastAsiScaleMax !== scaleMaxKmh) {
      this._lastAsiScaleMax = scaleMaxKmh;
      const step = scaleMaxKmh / 6;
      for (let i = 0; i <= 6; i++) {
        const lblEl = this.el(`asi-lbl-${i}`);
        if (lblEl) lblEl.textContent = String(Math.round(i * step));
      }
    }

    // Rotate Speedometer Needle (-120° at 0 km/h to +120° at scaleMaxKmh)
    const asiNeedleEl = this.el('air-asi-needle');
    if (asiNeedleEl) {
      const needleFrac = Math.max(0, Math.min(1.04, kmh / scaleMaxKmh));
      const needleDeg = -120 + needleFrac * 240;
      asiNeedleEl.setAttribute('transform', `rotate(${needleDeg.toFixed(1)} 65 65)`);
    }

    // Rotate Cruise Speed Bug on outer dial rim
    const cruiseBugEl = this.el('air-asi-cruise-bug');
    if (cruiseBugEl) {
      const cruiseKmh = (v.speed || 62) * 3.6;
      const cruiseDeg = -120 + Math.max(0, Math.min(1, cruiseKmh / scaleMaxKmh)) * 240;
      cruiseBugEl.setAttribute('transform', `rotate(${cruiseDeg.toFixed(1)} 65 65)`);
    }

    const minKmh = (v.minSpeed || 30) * 3.6;
    const maxKmh = (v.maxSpeed || 96) * 3.6;
    const wHeld = Boolean(this.player?.keys?.['KeyW']);
    const sHeld = Boolean(this.player?.keys?.['KeyS']);

    const asiKmhEl = this.el('air-asi-kmh');
    const asiKtsEl = this.el('air-asi-kts');
    const asiMachEl = this.el('air-asi-mach');
    if (asiKmhEl) {
      asiKmhEl.textContent = String(kmh).padStart(3, '0');
      asiKmhEl.setAttribute(
        'fill',
        v.isShotDown || v.isStalling || kmh <= minKmh * 1.06
          ? '#ff4757'
          : wHeld || kmh >= maxKmh * 0.92
          ? '#00d2d3'
          : '#7bed9f'
      );
    }
    if (asiKtsEl) {
      asiKtsEl.textContent = `${kts}KT`;
    }
    if (asiMachEl) {
      const stateTag = v.isShotDown
        ? '🚨 EJECT [E]'
        : v.isStalling || kmh <= minKmh * 1.06
        ? '⚠️ STALL'
        : wHeld || kmh >= maxKmh * 0.92
        ? isWright
          ? '⚡ MAX SPOOL'
          : '⚡ AB/WEP'
        : sHeld
        ? '🛑 BRAKE'
        : 'CRUISE';
      asiMachEl.textContent = `M ${mach} • ${stateTag}`;
      asiMachEl.setAttribute(
        'fill',
        v.isShotDown || v.isStalling || kmh <= minKmh * 1.06
          ? '#ff6b6b'
          : wHeld
          ? '#00d2d3'
          : sHeld
          ? '#f39c12'
          : '#f1c40f'
      );
    }

    // Vertical Throttle Bar (0% to 100%)
    const spdSpan = Math.max(1, maxKmh - minKmh * 0.6);
    const rawThrPct =
      typeof v.throttle === 'number'
        ? Math.round(v.throttle * 100)
        : Math.round(((kmh - minKmh * 0.6) / spdSpan) * 100);
    const thrPct = Math.max(4, Math.min(100, rawThrPct));
    const thrFillEl = this.el('air-thr-fill');
    const thrValEl = this.el('air-thr-val');
    if (thrFillEl) {
      thrFillEl.style.height = `${thrPct}%`;
      thrFillEl.style.background = wHeld
        ? 'linear-gradient(180deg, #00d2d3 0%, #48dbfb 50%, #2ecc71 100%)'
        : sHeld
        ? 'linear-gradient(180deg, #f39c12 0%, #e67e22 100%)'
        : 'linear-gradient(180deg, #2ecc71 0%, #27ae60 100%)';
    }
    if (thrValEl) {
      thrValEl.textContent = wHeld ? 'AB' : `${thrPct}%`;
      thrValEl.style.color = wHeld ? '#00d2d3' : sHeld ? '#f39c12' : '#7bed9f';
    }

    // 3. Turn Coordinator & Slip/Skid Inclinometer ("Step on the Ball")
    let rawYawRate = 0;
    if (this._lastAirHudVeh === v && typeof this._lastAirHudYaw === 'number' && dt > 0.0005) {
      let dYaw = (v.yaw || 0) - this._lastAirHudYaw;
      while (dYaw > Math.PI) dYaw -= Math.PI * 2;
      while (dYaw < -Math.PI) dYaw += Math.PI * 2;
      rawYawRate = dYaw / Math.max(0.004, Math.min(0.1, dt));
    }
    this._lastAirHudVeh = v;
    this._lastAirHudYaw = v.yaw || 0;
    this._smoothedYawRate =
      (this._smoothedYawRate || 0) + (rawYawRate - (this._smoothedYawRate || 0)) * Math.min(1, dt * 8.5);

    // Bank angle in degrees (negative = left wing down on cockpit dial, positive = right wing down)
    const bankDeg = Math.round(((-rollRad * 180) / Math.PI));
    const turnRateDegPerSec = Math.round(((-this._smoothedYawRate * 180) / Math.PI));
    const tcPlaneAngle = Math.max(-38, Math.min(38, bankDeg * 0.65 + turnRateDegPerSec * 0.28));

    const tcPlaneEl = this.el('air-tc-plane');
    if (tcPlaneEl) {
      tcPlaneEl.setAttribute('transform', `rotate(${tcPlaneAngle.toFixed(1)} 65 54)`);
    }
    const tcRateValEl = this.el('air-tc-rate-val');
    if (tcRateValEl) {
      const bankSide = bankDeg < -2 ? 'L' : bankDeg > 2 ? 'R' : 'LVL';
      tcRateValEl.textContent = `${Math.abs(bankDeg)}° ${bankSide} • ${Math.abs(turnRateDegPerSec)}°/S`;
    }

    // Slip / Skid Ball Physics inside the Curved Inclinometer Glass Tube:
    // - Coordinated turn rate for current bank angle: sin(roll) * turnRate * 1.15
    // - Uncoordinated yaw demand (yawDiff or A/D rudder input) creates centrifugal SKID toward outside of turn
    // - Banking without matching turn rate creates gravitational SLIP toward inside (low wing) of turn
    let yawDiff = (this.player?.yaw || 0) - (v.yaw || 0);
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    const bankKey = (this.player?.keys?.['KeyA'] ? 1 : 0) - (this.player?.keys?.['KeyD'] ? 1 : 0);
    const coordYawRate = Math.sin(rollRad) * (v.turnRate || 1.35) * 1.15;

    const rawSlipBall = Math.max(
      -1,
      Math.min(
        1,
        (this._smoothedYawRate - coordYawRate * 0.82) * 0.95 +
          yawDiff * 1.35 +
          bankKey * 0.35 -
          Math.sin(rollRad) * 0.32
      )
    );
    this._smoothedSlipBall =
      (this._smoothedSlipBall || 0) + (rawSlipBall - (this._smoothedSlipBall || 0)) * Math.min(1, dt * 7.5);

    const slipBallEl = this.el('air-slip-ball');
    if (slipBallEl) {
      const ballDx = this._smoothedSlipBall * 24;
      const ballDy = -(this._smoothedSlipBall * this._smoothedSlipBall) * 5.2;
      slipBallEl.setAttribute('transform', `translate(${ballDx.toFixed(1)}, ${ballDy.toFixed(1)})`);
    }

    const slipStatusEl = this.el('air-slip-status');
    if (slipStatusEl) {
      const absBall = Math.abs(this._smoothedSlipBall);
      if (absBall <= 0.16) {
        slipStatusEl.textContent = '● COORDINATED';
        slipStatusEl.setAttribute('fill', '#2ecc71');
      } else {
        const isSlip =
          (rollRad > 0.06 && this._smoothedSlipBall < -0.16) ||
          (rollRad < -0.06 && this._smoothedSlipBall > 0.16);
        const dirArrow = this._smoothedSlipBall < 0 ? '◄ ' : ' ►';
        const label = isSlip ? 'SLIP' : 'SKID';
        slipStatusEl.textContent =
          this._smoothedSlipBall < 0 ? `${dirArrow}${label} (STEP L)` : `${label} (STEP R)${dirArrow}`;
        slipStatusEl.setAttribute('fill', isSlip ? '#f1c40f' : '#ff6b6b');
      }
    }

    // 4. Artificial Horizon (ADI Sphere) + Altimeter & Vertical Speed (VSI)
    const adiRollGroup = this.el('air-adi-roll-group');
    const adiPitchGroup = this.el('air-adi-pitch-group');
    if (adiRollGroup) {
      adiRollGroup.setAttribute('transform', `rotate(${(-bankDeg).toFixed(1)} 56 58)`);
    }
    if (adiPitchGroup) {
      const pitchDeg = (pitchRad * 180) / Math.PI;
      const pitchPx = Math.max(-30, Math.min(30, pitchDeg * 0.65));
      adiPitchGroup.setAttribute('transform', `translate(0, ${pitchPx.toFixed(1)})`);
    }

    const groundY = this.world ? this.world.getGroundHeightAt(v.pos.x, v.pos.z) : 0;
    const altAgl = Math.max(0, Math.round(v.pos.y - groundY));
    const vsiMs = Math.round(v.velVector ? v.velVector.y : Math.sin(pitchRad) * spdMs);
    const vsiStr = `${vsiMs >= 0 ? '+' : ''}${vsiMs}M/S`;

    const adiFooterEl = this.el('air-adi-footer');
    if (adiFooterEl) {
      adiFooterEl.textContent = `ALT ${altAgl}M • VSI ${vsiStr}`;
    }
    const altFillEl = this.el('air-alt-fill');
    if (altFillEl) {
      const altPct = Math.max(4, Math.min(100, Math.round((altAgl / 350) * 100)));
      altFillEl.style.height = `${altPct}%`;
    }
    const altValEl = this.el('air-alt-val');
    if (altValEl) altValEl.textContent = `${altAgl}M`;
    const vsiValEl = this.el('air-vsi-val');
    if (vsiValEl) {
      vsiValEl.textContent = vsiStr;
      vsiValEl.style.color = vsiMs > 2 ? '#7bed9f' : vsiMs < -8 ? '#ff7675' : '#bdc3c7';
    }

    // 5. Visual Weapon Bay Pylon & Countermeasure Strip ([1], [2], [3], [X])
    const activeSlot = v.activeWeaponSlot || 0;
    const pylonDefs = isWright
      ? [
          { icon: '⚙️', lbl: 'GATLING' },
          { icon: '🧨', lbl: 'DYNAMITE' },
          { icon: '🧨', lbl: '3× SALVO' }
        ]
      : isB2
      ? [
          { icon: '💣', lbl: '80× MK82' },
          { icon: '☢️', lbl: 'GBU-57 MOP' },
          { icon: '🎯', lbl: '20MM+AIM9' }
        ]
      : isCas
      ? [
          { icon: '🔥', lbl: '30MM GAU8' },
          { icon: '🚀', lbl: 'HYDRA-70' },
          { icon: '💣', lbl: 'AGM/BOMB' }
        ]
      : isGunship
      ? [
          { icon: '🔥', lbl: '25MM GATL' },
          { icon: '💥', lbl: '40MM BOFR' },
          { icon: '🎯', lbl: '105 HOWZ' }
        ]
      : [
          { icon: '🔥', lbl: '20MM VULC' },
          { icon: '🚀', lbl: 'AIM-9X AA' },
          { icon: '💣', lbl: 'JDAM/GBU' }
        ];

    const secCd = v.secondaryCooldown || 0;
    const maxSecCd = isGunship ? 3.2 : aRole === 'fighter' ? 1.8 : 0.6;
    const secReadyPct = secCd > 0.04 ? Math.max(8, Math.min(100, ((maxSecCd - secCd) / maxSecCd) * 100)) : 100;

    for (let i = 0; i < 3; i++) {
      const slotCard = this.el(`air-pylon-${i + 1}`);
      const iconNode = this.el(`air-pylon-${i + 1}-icon`);
      const lblNode = this.el(`air-pylon-${i + 1}-lbl`);
      const barNode = this.el(`air-pylon-${i + 1}-bar`);
      if (slotCard) slotCard.classList.toggle('active', activeSlot === i);
      if (iconNode) iconNode.textContent = pylonDefs[i].icon;
      if (lblNode) lblNode.textContent = pylonDefs[i].lbl;
      if (barNode) {
        if (i === 0) {
          const priCd = v.fireCooldown || 0;
          const priPct = priCd > 0.12 ? Math.max(15, Math.min(100, (1 - priCd / 0.85) * 100)) : 100;
          barNode.style.width = `${priPct}%`;
          barNode.style.background = priCd > 0.12 ? '#f39c12' : '#2ecc71';
        } else if (i === 1 && aRole === 'fighter' && this.player?.aircraftLockTarget) {
          const lockPct = Math.round((this.player.aircraftLockProgress || 0) * 100);
          barNode.style.width = `${Math.max(25, lockPct)}%`;
          barNode.style.background = lockPct >= 100 ? '#ff4757' : '#f1c40f';
          if (lblNode) lblNode.textContent = lockPct >= 100 ? '🔒 LOCKED' : `SEEK ${lockPct}%`;
        } else {
          barNode.style.width = `${secReadyPct}%`;
          barNode.style.background = secCd > 0.04 ? '#f39c12' : '#2ecc71';
        }
      }
    }

    // Countermeasure Slot [X] (Flares / RAM Cloak / Kitty Hawk Tailwind)
    const cmIconEl = this.el('air-pylon-cm-icon');
    const cmLblEl = this.el('air-pylon-cm-lbl');
    const cmBarEl = this.el('air-pylon-cm-bar');
    const flareAct = v.flareActiveTimer || 0;
    const flareCd = v.flareCooldown || 0;
    const maxFlareCd = isWright ? 6.0 : isB2 ? 7.5 : 9.0;

    if (cmIconEl) {
      cmIconEl.textContent = isWright ? '🌬️' : isB2 ? '🦇' : '✨';
    }
    if (cmLblEl) {
      cmLblEl.textContent =
        flareAct > 0
          ? isB2
            ? `CLOAK ${flareAct.toFixed(0)}S`
            : `ACTIVE ${flareAct.toFixed(0)}S`
          : flareCd > 0
          ? `WAIT ${flareCd.toFixed(0)}S`
          : isWright
          ? 'TAILWIND'
          : isB2
          ? 'RAM CLOAK'
          : 'ECM/FLARE';
    }
    if (cmBarEl) {
      if (flareAct > 0) {
        cmBarEl.style.width = '100%';
        cmBarEl.style.background = isB2 ? '#a29bfe' : '#ffd32a';
      } else if (flareCd > 0) {
        const cdPct = Math.max(5, Math.min(100, ((maxFlareCd - flareCd) / maxFlareCd) * 100));
        cmBarEl.style.width = `${cdPct}%`;
        cmBarEl.style.background = '#f39c12';
      } else {
        cmBarEl.style.width = '100%';
        cmBarEl.style.background = '#00d2d3';
      }
    }
  },

  /**
   * Vehicle-Specific Center-Screen Reticle (`#turret-reticle-box`):
   * Every vehicle class renders its own distinct sight geometry, color palette, and telemetry tags
   * so non-tank vehicles never display a generic tank gunner box.
   */
  updateVehicleCenterReticle(v) {
    if (!v) return;
    const boxEl = this.el('turret-reticle-box');
    const dynLayer = this.el('tr-dynamic-layer');
    const topTagEl = this.el('tr-top-tag');
    const botTagEl = this.el('tr-bottom-tag');
    const ladderEl = this.el('tr-range-ladder');
    const centerEl = this.el('tr-center-mark');
    if (!boxEl || !dynLayer) return;

    const rKey = v.isAircraft ? `air_${v.aircraftRole || v.type}` : v.type;
    if (this._lastCenterReticleType !== rKey) {
      this._lastCenterReticleType = rKey;
      const corners = boxEl.querySelectorAll('.tr-corner');
      const setCorners = (show, color = '#2ecc71', w = 24, h = 24) => {
        corners.forEach((c) => {
          c.style.display = show ? 'block' : 'none';
          c.style.borderColor = color;
          c.style.width = `${w}px`;
          c.style.height = `${h}px`;
        });
      };

      if (v.isAircraft) {
        setCorners(false);
        if (ladderEl) ladderEl.style.display = 'none';
        if (centerEl) {
          centerEl.textContent = '⊕';
          centerEl.style.color = '#00d2d3';
          centerEl.style.textShadow = '0 0 8px #00d2d3';
        }
        dynLayer.innerHTML = `
          <svg viewBox="0 0 320 240" width="320" height="240">
            <!-- Aviation Velocity Vector & Pitch Ladder Bars -->
            <line x1="95" y1="85" x2="132" y2="85" stroke="#00d2d3" stroke-width="1.8"/>
            <line x1="95" y1="85" x2="95" y2="93" stroke="#00d2d3" stroke-width="1.8"/>
            <line x1="188" y1="85" x2="225" y2="85" stroke="#00d2d3" stroke-width="1.8"/>
            <line x1="225" y1="85" x2="225" y2="93" stroke="#00d2d3" stroke-width="1.8"/>
            <line x1="115" y1="120" x2="142" y2="120" stroke="#2ecc71" stroke-width="2"/>
            <line x1="178" y1="120" x2="205" y2="120" stroke="#2ecc71" stroke-width="2"/>
            <line x1="95" y1="155" x2="132" y2="155" stroke="#00d2d3" stroke-width="1.8" stroke-dasharray="4 3"/>
            <line x1="188" y1="155" x2="225" y2="155" stroke="#00d2d3" stroke-width="1.8" stroke-dasharray="4 3"/>
            <circle cx="160" cy="120" r="36" fill="none" stroke="rgba(0, 210, 211, 0.35)" stroke-width="1.4" stroke-dasharray="6 4"/>
          </svg>
        `;
      } else if (v.type === 'bike' || v.type === 'atv') {
        setCorners(false);
        if (ladderEl) ladderEl.style.display = 'none';
        if (centerEl) {
          centerEl.textContent = '•';
          centerEl.style.color = '#00d2d3';
          centerEl.style.textShadow = '0 0 8px #00d2d3';
        }
        dynLayer.innerHTML = `
          <svg viewBox="0 0 320 240" width="320" height="240">
            <!-- Sleek Open Handlebar Rider Reflex Arc (No Tank Box!) -->
            <path d="M 108 102 A 56 56 0 0 1 212 102" fill="none" stroke="rgba(0, 210, 211, 0.65)" stroke-width="2" stroke-linecap="round"/>
            <path d="M 122 142 A 44 44 0 0 0 198 142" fill="none" stroke="rgba(46, 204, 113, 0.5)" stroke-width="1.8" stroke-dasharray="4 3"/>
            <circle cx="160" cy="120" r="14" fill="none" stroke="#00d2d3" stroke-width="1.5"/>
          </svg>
        `;
      } else if (v.type === 'humvee' || v.type === 'emplace_hmg') {
        setCorners(false);
        if (ladderEl) ladderEl.style.display = 'none';
        if (centerEl) {
          centerEl.textContent = '+';
          centerEl.style.color = '#c4e538';
          centerEl.style.textShadow = '0 0 6px #a3cb38';
        }
        dynLayer.innerHTML = `
          <svg viewBox="0 0 320 240" width="320" height="240">
            <!-- Open .50 Cal M2HB Reflex Ring Sight -->
            <circle cx="160" cy="120" r="34" fill="none" stroke="rgba(196, 229, 56, 0.78)" stroke-width="2"/>
            <line x1="104" y1="120" x2="122" y2="120" stroke="#c4e538" stroke-width="2.2"/>
            <line x1="198" y1="120" x2="216" y2="120" stroke="#c4e538" stroke-width="2.2"/>
            <line x1="160" y1="68" x2="160" y2="82" stroke="#c4e538" stroke-width="2"/>
            <line x1="160" y1="158" x2="160" y2="172" stroke="#c4e538" stroke-width="2"/>
          </svg>
        `;
      } else if (v.type === 'aa' || v.type === 'emplace_aa') {
        setCorners(false);
        if (ladderEl) ladderEl.style.display = 'none';
        if (centerEl) {
          centerEl.textContent = '⊹';
          centerEl.style.color = '#f1c40f';
          centerEl.style.textShadow = '0 0 8px #f1c40f';
        }
        dynLayer.innerHTML = `
          <svg viewBox="0 0 320 240" width="320" height="240">
            <!-- 360° SPAAG Radar Lead-Computing Optical Sight (LCOS) -->
            <circle cx="160" cy="120" r="68" fill="none" stroke="rgba(241, 196, 15, 0.55)" stroke-width="1.8" stroke-dasharray="8 4"/>
            <circle cx="160" cy="120" r="32" fill="none" stroke="rgba(0, 210, 211, 0.72)" stroke-width="1.6"/>
            <line x1="82" y1="120" x2="122" y2="120" stroke="#f1c40f" stroke-width="1.6"/>
            <line x1="198" y1="120" x2="238" y2="120" stroke="#f1c40f" stroke-width="1.6"/>
            <line x1="160" y1="42" x2="160" y2="82" stroke="#f1c40f" stroke-width="1.6"/>
            <line x1="160" y1="158" x2="160" y2="198" stroke="#f1c40f" stroke-width="1.6"/>
          </svg>
        `;
      } else if (v.type === 'apc') {
        setCorners(true, '#00d2d3', 28, 20);
        if (ladderEl) {
          ladderEl.style.display = 'flex';
          ladderEl.style.color = '#00d2d3';
          ladderEl.innerHTML = '<span>150</span><span>300</span><span>450</span>';
        }
        if (centerEl) {
          centerEl.textContent = '✛';
          centerEl.style.color = '#00d2d3';
          centerEl.style.textShadow = '0 0 7px #00d2d3';
        }
        dynLayer.innerHTML = `
          <svg viewBox="0 0 320 240" width="320" height="240">
            <!-- 8×8 IFV 30mm Autocannon Mil-Hash Crossbars -->
            <line x1="92" y1="120" x2="138" y2="120" stroke="rgba(0, 210, 211, 0.65)" stroke-width="1.6"/>
            <line x1="182" y1="120" x2="228" y2="120" stroke="rgba(0, 210, 211, 0.65)" stroke-width="1.6"/>
            <rect x="136" y="98" width="48" height="44" rx="4" fill="none" stroke="rgba(0, 210, 211, 0.35)" stroke-width="1.2"/>
          </svg>
        `;
      } else if (v.type === 'warhorse') {
        setCorners(false);
        const isXbow = Boolean(
          v.isCrossbowSight || (this.player?.currentWeapon?.()?.def?.isCrossbow && v.isFootArcherySight)
        );
        const isFire = Boolean(this.player?.fireArrowsActive);
        const sightCol = isFire ? '#ff7f50' : isXbow ? '#81ecec' : '#f1c40f';
        if (ladderEl) {
          ladderEl.style.display = 'flex';
          ladderEl.style.color = sightCol;
          ladderEl.innerHTML = isXbow
            ? '<span>40M</span><span>80M</span>'
            : '<span>25M</span><span>50M</span><span>75M</span>';
        }
        if (centerEl) {
          centerEl.textContent = isXbow ? '✛' : '▴';
          centerEl.style.color = sightCol;
          centerEl.style.textShadow = `0 0 6px ${sightCol}`;
        }
        dynLayer.innerHTML = isXbow
          ? `
            <svg viewBox="0 0 320 240" width="320" height="240">
              <!-- Arbalest Crossbow Horizontal Iron-Arbor Windage Bar & Bolt Drop Post -->
              <line x1="116" y1="120" x2="148" y2="120" stroke="${sightCol}" stroke-width="2" stroke-linecap="round"/>
              <line x1="172" y1="120" x2="204" y2="120" stroke="${sightCol}" stroke-width="2" stroke-linecap="round"/>
              <line x1="160" y1="130" x2="160" y2="164" stroke="${sightCol}" stroke-width="1.6" stroke-dasharray="4 4"/>
            </svg>
          `
          : `
            <svg viewBox="0 0 320 240" width="320" height="240">
              <!-- Clean Medieval Longbow Draw Brackets & Drop Pins (Never blocks center target) -->
              <path d="M 132 86 Q 114 120 132 154" fill="none" stroke="${sightCol}" stroke-width="2" stroke-linecap="round" opacity="0.82"/>
              <path d="M 188 86 Q 206 120 188 154" fill="none" stroke="${sightCol}" stroke-width="2" stroke-linecap="round" opacity="0.82"/>
            </svg>
          `;
      } else if (v.type === 'trebuchet' || v.type === 'emplace_mortar') {
        setCorners(false);
        if (ladderEl) {
          ladderEl.style.display = 'flex';
          ladderEl.style.color = '#ff9f43';
          ladderEl.innerHTML = '<span>100M</span><span>200M</span><span>300M</span>';
        }
        if (centerEl) {
          centerEl.textContent = '⊕';
          centerEl.style.color = '#ff9f43';
          centerEl.style.textShadow = '0 0 8px #e67e22';
        }
        dynLayer.innerHTML = `
          <svg viewBox="0 0 320 240" width="320" height="240">
            <!-- Siege / Indirect Artillery Elevation Quadrant -->
            <path d="M 105 162 A 64 64 0 0 1 215 162" fill="none" stroke="rgba(230, 126, 34, 0.75)" stroke-width="2" stroke-dasharray="6 3"/>
            <line x1="160" y1="62" x2="160" y2="182" stroke="rgba(241, 196, 15, 0.55)" stroke-width="1.6"/>
          </svg>
        `;
      } else if (v.type === 'trex_mount' || v.type === 'raptor_mount') {
        setCorners(false);
        if (ladderEl) ladderEl.style.display = 'none';
        if (centerEl) {
          centerEl.textContent = '❖';
          centerEl.style.color = '#ff5252';
          centerEl.style.textShadow = '0 0 8px #ff5252';
        }
        dynLayer.innerHTML = `
          <svg viewBox="0 0 320 240" width="320" height="240">
            <!-- Primal Theropod Fang & Claw Strike Arcs -->
            <path d="M 118 84 Q 96 120 124 156" fill="none" stroke="#ff5252" stroke-width="2.6" stroke-linecap="round"/>
            <path d="M 202 84 Q 224 120 196 156" fill="none" stroke="#ff5252" stroke-width="2.6" stroke-linecap="round"/>
          </svg>
        `;
      } else {
        // Main Battle Tank ('tank')
        setCorners(true, '#2ecc71', 24, 24);
        if (ladderEl) {
          ladderEl.style.display = 'flex';
          ladderEl.style.color = 'rgba(46, 204, 113, 0.78)';
          ladderEl.innerHTML = '<span>200</span><span>400</span><span>600</span>';
        }
        if (centerEl) {
          centerEl.textContent = '+';
          centerEl.style.color = '#2ecc71';
          centerEl.style.textShadow = '0 0 6px #2ecc71';
        }
        dynLayer.innerHTML = '';
      }
    }

    // Live per-frame top & bottom telemetry tags on the center sight
    const kmh = Math.round(Math.abs(v.forwardSpeed || 0) * 3.6);
    const maxKmh = Math.round((v.speed || 0) * 3.6);
    if (topTagEl && botTagEl) {
      if (v.isAircraft) {
        const gY = this.world ? this.world.getGroundHeightAt(v.pos.x, v.pos.z) : 0;
        const alt = Math.max(0, Math.round(v.pos.y - gY));
        const avoidAuto = this.player ? this.player.aircraftCollisionAvoidance !== false : true;
        const avoidTag = avoidAuto ? '🛡️ AVOID: AUTO [G]' : '💥 AVOID: OFF (CRASH) [G]';
        topTagEl.textContent = `✈️ ${v.name.split(' (')[0]} • IAS ${kmh} KM/H • ALT ${alt}M • ${avoidTag}`;
        botTagEl.textContent = v.isStalling
          ? '⚠️ STALL WARNING — HOLD [W] & LOWER NOSE'
          : (v.flareActiveTimer || 0) > 0
          ? `✨ COUNTERMEASURES ACTIVE (${v.flareActiveTimer.toFixed(1)}S) — ANGEL-WING FLARES & ECM SPOOFING MISSILES!`
          : '[LMB] PRIMARY • [SPACE] ORDNANCE • [X] COUNTERMEASURES • [G] COLLISION AVOIDANCE';
      } else if (v.type === 'bike' || v.type === 'atv') {
        const leanDeg = Math.round(((v.roll || 0) * 180) / Math.PI);
        const gearStr = v.isElectric ? 'EV' : `G${v.currentGear || 'N'}`;
        topTagEl.textContent = `🏍️ ${kmh} / ${maxKmh} KM/H • ${gearStr} • LEAN ${leanDeg >= 0 ? '+' : ''}${leanDeg}°`;
        botTagEl.textContent = '[LMB] 9MM DRIVE-BY SMG • [SPACE] WHEELIE / NITRO BOOST';
      } else if (v.type === 'humvee' || v.type === 'emplace_hmg') {
        topTagEl.textContent = `🚙 .50 CAL M2HB RWS • ${kmh} / ${maxKmh} KM/H`;
        botTagEl.textContent = '720 RPM .50 BMG AP-I (FLAT TRAJECTORY)';
      } else if (v.type === 'aa' || v.type === 'emplace_aa') {
        const lockTgt = this.player?.aircraftLockTarget;
        const lockPct = Math.round((this.player?.aircraftLockProgress || 0) * 100);
        topTagEl.textContent = `📡 SPAAG 360° AIR-DEFENSE RADAR • ${kmh}/${maxKmh} KM/H`;
        botTagEl.textContent = lockTgt
          ? lockPct >= 100
            ? `🔒 SAM LOCKED ON ${lockTgt.name.split(' ')[0]} — PRESS [SPACE]!`
            : `📡 TRACKING ${lockTgt.name.split(' ')[0]} (${lockPct}%)`
          : '[LMB] 1,050 RPM PROXIMITY FLAK • [SPACE] SAM LOCK';
      } else if (v.type === 'apc') {
        topTagEl.textContent = `🛡️ 8×8 IFV 30MM AUTOCANNON • ${kmh}/${maxKmh} KM/H`;
        botTagEl.textContent = '[1] 30MM HE-FRAG (330 RPM) • [2/SPACE] 7.62MM COAX';
      } else if (v.type === 'warhorse') {
        // Keep the center archery sight completely free of tank-turret telemetry banners!
        topTagEl.textContent = '';
        botTagEl.textContent = '';
      } else if (v.type === 'trebuchet') {
        const rng = Math.round(this.player?.mortarRangeM || 200);
        const crewCnt = v.setupCrewIds ? v.setupCrewIds.length : 0;
        topTagEl.textContent = `🪨 SIEGE TREBUCHET • IMPACT ARC ${rng}M`;
        botTagEl.textContent = `CREW ${crewCnt}/2 [T] • [W/S] ELEVATION • [LMB] LOOSE BOULDER`;
      } else if (v.type === 'emplace_mortar') {
        const rng = Math.round(this.player?.mortarRangeM || 200);
        topTagEl.textContent = `🎯 81MM INDIRECT MORTAR • IMPACT ${rng}M`;
        botTagEl.textContent = '[LMB] 81MM HE • [SPACE] 3-ROUND RAPID BARRAGE';
      } else if (v.type === 'trex_mount' || v.type === 'raptor_mount') {
        const isTrex = v.type === 'trex_mount';
        topTagEl.textContent = `🦖 ${isTrex ? 'APEX T-REX' : 'VELOCIRAPTOR'} • ${kmh}/${maxKmh} KM/H`;
        botTagEl.textContent = isTrex
          ? '[LMB] CRUSHING JAWS & STOMP • [SPACE] APEX ROAR'
          : '[LMB] SICKLE TALONS & VENOM • [SPACE] POUNCE LEAP';
      } else {
        const hullIntPct = Math.round(
          v.hullIntegrityPct ?? (v.hp / Math.max(1, v.maxHp)) * 100
        );
        const eraTag = v.maxEraBlocks
          ? ` • ERA ${v.eraBlocksIntact ?? v.maxEraBlocks}/${v.maxEraBlocks}`
          : '';
        const subWarn =
          v.subsystems && v.subsystems.tracks === 'DAMAGED'
            ? ' • ⚠️ TRACKS'
            : v.subsystems && v.subsystems.engine === 'CRITICAL'
            ? ' • 🔥 ENGINE CRIT'
            : '';
        topTagEl.textContent = `🛡️ MBT FCS • HULL ${hullIntPct}%${eraTag}${subWarn} • ${kmh}/${maxKmh} KM/H`;
        botTagEl.textContent =
          v.fireCooldown > 0.05
            ? `⏳ RELOADING MAIN CANNON (${v.fireCooldown.toFixed(1)}S) • [SPACE] COAX MG`
            : '[1] 120/125MM APFSDS-T [LMB] • [2/SPACE] 7.62MM COAX MG';
      }
    }
  },

  // Vehicle Orientation & Telemetry Panel (Bottom-Right, Custom SVG & Gauges per Vehicle)
  updateVehicleOrientationHud(v) {
    if (!v) return;
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

    let hullDeg = Math.round(((-v.yaw * 180) / Math.PI) % 360);
    if (hullDeg < 0) hullDeg += 360;
    const hullDirStr = dirs[Math.round(hullDeg / 45) % 8];

    const rawTurretYaw = v.turretYaw !== undefined ? v.turretYaw : this.player.yaw;
    let turretDeg = Math.round(((-rawTurretYaw * 180) / Math.PI) % 360);
    if (turretDeg < 0) turretDeg += 360;
    const turretDirStr = dirs[Math.round(turretDeg / 45) % 8];

    // Relative angle of Hull compared to our Turret/Camera Viewpoint (12 o'clock = 0 deg)
    const hullRelDeg = ((hullDeg - turretDeg + 540) % 360) - 180;
    // Relative angle of Turret compared to Hull nose (+Right / -Left)
    const turretOffsetDeg = ((turretDeg - hullDeg + 540) % 360) - 180;

    // 1. Rotate SVG World Compass Ring (-turretDeg) & Vehicle Hull Silhouette (hullRelDeg)
    const isMotoDash = v.type === 'bike' || v.type === 'atv';
    const compassGroup = this.el('veh-svg-compass');
    if (compassGroup) {
      compassGroup.style.display = isMotoDash ? 'none' : '';
      if (!isMotoDash) {
        compassGroup.setAttribute('transform', `rotate(${-turretDeg} 60 60)`);
      }
    }
    const hullGroup = this.el('veh-svg-hull');
    const turretGroup = this.el('veh-svg-turret');
    if (hullGroup) {
      if (isMotoDash) {
        const leanDeg = Math.max(-38, Math.min(38, Math.round(((v.roll || 0) * 180) / Math.PI)));
        hullGroup.setAttribute('transform', `rotate(${leanDeg} 60 60)`);
      } else {
        hullGroup.setAttribute('transform', `rotate(${hullRelDeg} 60 60)`);
      }
    }

    // 1B. Dynamically Adapt Vehicle SVG Silhouette, Panel Title & Telemetry Labels per Vehicle Type
    if (hullGroup && turretGroup && this._lastHudVehSvgType !== v.type) {
      this._lastHudVehSvgType = v.type;
      const titleEl = this.el('veh-orient-title');
      const legTurEl = this.el('veh-leg-turret');
      const legHulEl = this.el('veh-leg-hull');
      const lbl1El = this.el('vor-lbl-1');
      const lbl2El = this.el('vor-lbl-2');
      const lbl3El = this.el('vor-lbl-3');
      const lbl4El = this.el('vor-lbl-4');
      const bannerCtrlEl = this.el('veh-banner-controls');

      let hullSvg = '';
      let turretSvg = '';
      let pTitle = 'MBT FIRE CONTROL & ARMOR';
      let legTur = '▲ TURRET AIM';
      let legHul = '▬ HULL FRONT';
      let l1 = 'TURRET HDG';
      let l2 = 'HULL HDG';
      let l3 = 'SLEW OFFSET';
      let l4 = 'DRIVE GEAR';
      let ctrlText = 'WASD Drive • Mouse Aim Turret • [1/2] Weapons • [E] Exit';

      if (v.type === 'bike' || v.type === 'atv') {
        const isAtv = v.type === 'atv';
        pTitle = isAtv ? 'QUAD ATV DIGITAL TACH & LEAN' : 'MOTO TACHOMETER & LEAN GAUGE';
        legTur = '▲ RPM / SPEED';
        legHul = '▬ LEAN ANGLE';
        l1 = 'RIDER AIM';
        l2 = isAtv ? 'QUAD HDG' : 'BIKE HDG';
        l3 = 'LEAN / LOOK';
        l4 = 'GEAR & RPM';
        ctrlText = isAtv
          ? 'W/S Throttle/Reverse • A/D Steer Quad • [SPACE] Overdrive Boost • LMB Fire Dual PDW • [E] Dismount'
          : 'W/S Throttle/Brake • A/D Lean & Steer • [SPACE] Wheelie/Boost • LMB Fire SMG • [E] Dismount';
        // Tilting Bike/Quad Lean Horizon inside hullGroup
        hullSvg = `
          <line x1="22" y1="60" x2="98" y2="60" stroke="rgba(46, 204, 113, 0.45)" stroke-width="1.6" stroke-dasharray="3 2"/>
          <line x1="34" y1="48" x2="86" y2="48" stroke="#2ecc71" stroke-width="2.8" stroke-linecap="round"/>
          <circle cx="60" cy="60" r="5" fill="#2ecc71"/>
          <line x1="60" y1="36" x2="60" y2="84" stroke="#2ecc71" stroke-width="2.4" stroke-linecap="round"/>
        `;
        // Motorsport Analog Tachometer Arc + Rotating Needle + Digital Speedo Readout inside turretGroup
        turretSvg = `
          <path d="M 24 84 A 44 44 0 1 1 96 84" fill="none" stroke="rgba(0, 210, 211, 0.35)" stroke-width="5" stroke-linecap="round"/>
          <path d="M 84 26 A 44 44 0 0 1 96 84" fill="none" stroke="rgba(255, 82, 82, 0.75)" stroke-width="5" stroke-linecap="round"/>
          <g id="moto-tach-needle" transform="rotate(-120 60 60)">
            <line x1="60" y1="60" x2="60" y2="18" stroke="#ff5252" stroke-width="2.6" stroke-linecap="round"/>
          </g>
          <rect x="34" y="68" width="52" height="30" rx="4" fill="rgba(6, 12, 18, 0.94)" stroke="rgba(0, 210, 211, 0.6)" stroke-width="1.2"/>
          <text id="moto-dial-kmh" x="60" y="83" fill="#00d2d3" font-size="12" font-weight="900" font-family="Consolas, monospace" text-anchor="middle">000</text>
          <text id="moto-dial-gear" x="60" y="94" fill="#f1c40f" font-size="7.5" font-weight="900" text-anchor="middle">KM/H • N</text>
        `;
      } else if (v.type === 'humvee') {
        pTitle = '4×4 TACTICAL MRAP & RWS';
        legTur = '▲ .50 CAL RWS';
        legHul = '▬ 4×4 CHASSIS';
        l1 = 'RWS HDG';
        l2 = 'CHASSIS HDG';
        l3 = 'MOUNT OFFSET';
        l4 = 'DRIVETRAIN';
        ctrlText = 'WASD Drive 4×4 • Mouse Aim Roof .50 Cal HMG • LMB Fire • [E] Exit Vehicle';
        hullSvg = `
          <rect x="35" y="32" width="6" height="16" rx="2" fill="rgba(25, 32, 38, 0.95)" stroke="#2ecc71" stroke-width="1.3"/>
          <rect x="79" y="32" width="6" height="16" rx="2" fill="rgba(25, 32, 38, 0.95)" stroke="#2ecc71" stroke-width="1.3"/>
          <rect x="35" y="72" width="6" height="16" rx="2" fill="rgba(25, 32, 38, 0.95)" stroke="#2ecc71" stroke-width="1.3"/>
          <rect x="79" y="72" width="6" height="16" rx="2" fill="rgba(25, 32, 38, 0.95)" stroke="#2ecc71" stroke-width="1.3"/>
          <rect x="41" y="27" width="38" height="66" rx="5" fill="rgba(46, 204, 113, 0.22)" stroke="#2ecc71" stroke-width="2"/>
          <rect x="45" y="42" width="30" height="12" rx="2" fill="rgba(0, 210, 211, 0.18)" stroke="#2ecc71" stroke-width="1.2"/>
          <polygon points="60,21 53,27 67,27" fill="#2ecc71"/>
          <text x="60" y="84" fill="#2ecc71" font-size="7.5" font-weight="900" text-anchor="middle">4×4</text>
        `;
        turretSvg = `
          <polygon points="60,60 40,12 80,12" fill="rgba(0, 210, 211, 0.10)"/>
          <line x1="60" y1="52" x2="60" y2="16" stroke="#00d2d3" stroke-width="3.2" stroke-linecap="round"/>
          <circle cx="60" cy="60" r="9" fill="rgba(12, 22, 32, 0.95)" stroke="#00d2d3" stroke-width="2"/>
          <polygon points="60,11 56,19 64,19" fill="#00d2d3"/>
        `;
      } else if (v.type === 'apc') {
        pTitle = '8×8 AMPHIBIOUS IFV / APC';
        legTur = '▲ 30MM TURRET';
        legHul = '▬ 8×8 HULL';
        l1 = 'TURRET HDG';
        l2 = '8×8 HULL HDG';
        l3 = 'TURRET OFFSET';
        l4 = '8×8 DRIVE';
        ctrlText = 'WASD Drive 8×8 IFV • Mouse Aim 30mm Autocannon • [1] 30mm HE / [2/SPACE] Coax MG • [E] Exit';
        hullSvg = `
          <rect x="35" y="28" width="5" height="11" rx="1.5" fill="rgba(25, 32, 38, 0.95)" stroke="#2ecc71" stroke-width="1.1"/>
          <rect x="35" y="43" width="5" height="11" rx="1.5" fill="rgba(25, 32, 38, 0.95)" stroke="#2ecc71" stroke-width="1.1"/>
          <rect x="35" y="64" width="5" height="11" rx="1.5" fill="rgba(25, 32, 38, 0.95)" stroke="#2ecc71" stroke-width="1.1"/>
          <rect x="35" y="79" width="5" height="11" rx="1.5" fill="rgba(25, 32, 38, 0.95)" stroke="#2ecc71" stroke-width="1.1"/>
          <rect x="80" y="28" width="5" height="11" rx="1.5" fill="rgba(25, 32, 38, 0.95)" stroke="#2ecc71" stroke-width="1.1"/>
          <rect x="80" y="43" width="5" height="11" rx="1.5" fill="rgba(25, 32, 38, 0.95)" stroke="#2ecc71" stroke-width="1.1"/>
          <rect x="80" y="64" width="5" height="11" rx="1.5" fill="rgba(25, 32, 38, 0.95)" stroke="#2ecc71" stroke-width="1.1"/>
          <rect x="80" y="79" width="5" height="11" rx="1.5" fill="rgba(25, 32, 38, 0.95)" stroke="#2ecc71" stroke-width="1.1"/>
          <polygon points="48,23 72,23 80,35 80,92 40,92 40,35" fill="rgba(46, 204, 113, 0.22)" stroke="#2ecc71" stroke-width="2"/>
          <polygon points="60,17 53,23 67,23" fill="#2ecc71"/>
          <text x="60" y="85" fill="#2ecc71" font-size="7.5" font-weight="900" text-anchor="middle">8×8 IFV</text>
        `;
        turretSvg = `
          <polygon points="60,60 38,12 82,12" fill="rgba(0, 210, 211, 0.11)"/>
          <line x1="60" y1="50" x2="60" y2="14" stroke="#00d2d3" stroke-width="3.6" stroke-linecap="round"/>
          <polygon points="52,47 68,47 72,68 48,68" fill="rgba(12, 22, 32, 0.95)" stroke="#00d2d3" stroke-width="2"/>
          <polygon points="60,9 55,17 65,17" fill="#00d2d3"/>
        `;
      } else if (v.type === 'aa' || v.type === 'emplace_aa') {
        pTitle = 'SPAAG AIR-DEFENSE RADAR & FLAK';
        legTur = '▲ TWIN AA + SAM';
        legHul = '▬ SPAAG HULL';
        l1 = 'RADAR HDG';
        l2 = 'CHASSIS HDG';
        l3 = 'TURRET OFFSET';
        l4 = 'CHASSIS DRIVE';
        ctrlText = 'WASD Drive • Mouse Aim Flak & SAM Radar • LMB Twin AA • [SPACE] Fire Locked SAM • [E] Exit';
        hullSvg = `
          <rect x="36" y="28" width="7" height="64" rx="2" fill="rgba(39, 174, 96, 0.25)" stroke="#2ecc71" stroke-width="1.5"/>
          <rect x="77" y="28" width="7" height="64" rx="2" fill="rgba(39, 174, 96, 0.25)" stroke="#2ecc71" stroke-width="1.5"/>
          <rect x="43" y="30" width="34" height="60" rx="4" fill="rgba(46, 204, 113, 0.2)" stroke="#2ecc71" stroke-width="2"/>
          <polygon points="60,21 52,30 68,30" fill="#2ecc71"/>
          <text x="60" y="83" fill="#2ecc71" font-size="7.5" font-weight="900" text-anchor="middle">SPAAG</text>
        `;
        turretSvg = `
          <polygon points="60,60 34,12 86,12" fill="rgba(0, 210, 211, 0.12)"/>
          <line x1="55" y1="50" x2="55" y2="15" stroke="#00d2d3" stroke-width="2.8" stroke-linecap="round"/>
          <line x1="65" y1="50" x2="65" y2="15" stroke="#00d2d3" stroke-width="2.8" stroke-linecap="round"/>
          <rect x="44" y="52" width="5" height="14" rx="1" fill="#f39c12" stroke="#00d2d3" stroke-width="1.2"/>
          <rect x="71" y="52" width="5" height="14" rx="1" fill="#f39c12" stroke="#00d2d3" stroke-width="1.2"/>
          <circle cx="60" cy="60" r="12" fill="rgba(12, 22, 32, 0.95)" stroke="#00d2d3" stroke-width="2.2"/>
          <path d="M 51 69 Q 60 76 69 69" fill="none" stroke="#f1c40f" stroke-width="2.2"/>
        `;
      } else if (v.type === 'warhorse') {
        pTitle = 'CAVALRY DESTRIER MOUNT';
        legTur = '▲ ARCHER AIM';
        legHul = '▬ STEED BODY';
        l1 = 'BOW AIM HDG';
        l2 = 'STEED HDG';
        l3 = 'SADDLE ANGLE';
        l4 = 'GAIT SPEED';
        ctrlText = 'W/S Gallop/Trot • A/D Turn Steed • [SPACE] Rear / Jump • LMB Loose Warbow Arrow • [E] Dismount';
        hullSvg = `
          <ellipse cx="60" cy="64" rx="11" ry="22" fill="rgba(212, 172, 13, 0.25)" stroke="#f1c40f" stroke-width="2"/>
          <ellipse cx="60" cy="36" rx="6" ry="11" fill="rgba(212, 172, 13, 0.35)" stroke="#f1c40f" stroke-width="1.8"/>
          <polygon points="55,27 53,21 58,25" fill="#f1c40f"/>
          <polygon points="65,27 67,21 62,25" fill="#f1c40f"/>
          <path d="M 60 86 Q 57 95 62 98" fill="none" stroke="#f1c40f" stroke-width="2.5" stroke-linecap="round"/>
          <text x="60" y="68" fill="#f1c40f" font-size="6.5" font-weight="900" text-anchor="middle">STEED</text>
        `;
        turretSvg = `
          <polygon points="60,60 38,12 82,12" fill="rgba(0, 210, 211, 0.10)"/>
          <path d="M 46 34 Q 60 22 74 34" fill="none" stroke="#00d2d3" stroke-width="2.4"/>
          <line x1="46" y1="34" x2="74" y2="34" stroke="rgba(0, 210, 211, 0.55)" stroke-width="1.2"/>
          <line x1="60" y1="56" x2="60" y2="15" stroke="#00d2d3" stroke-width="2.4" stroke-linecap="round"/>
          <polygon points="60,10 56,18 64,18" fill="#00d2d3"/>
          <circle cx="60" cy="56" r="6" fill="rgba(12, 22, 32, 0.95)" stroke="#00d2d3" stroke-width="2"/>
        `;
      } else if (v.type === 'trebuchet') {
        pTitle = 'SIEGE TREBUCHET BALLISTICS';
        legTur = '▲ SLING ARC';
        legHul = '▬ OAK A-FRAME';
        l1 = 'FIRING AZIMUTH';
        l2 = 'FRAME BEARING';
        l3 = 'TRAVERSE';
        l4 = 'IMPACT RANGE';
        ctrlText = 'A/D Traverse Timber Frame • W/S Adjust Boulder Range • LMB Loose Flaming Boulder • [T/G] Crew • [E] Leave';
        hullSvg = `
          <rect x="38" y="28" width="6" height="64" rx="1.5" fill="rgba(211, 84, 0, 0.30)" stroke="#e67e22" stroke-width="1.8"/>
          <rect x="76" y="28" width="6" height="64" rx="1.5" fill="rgba(211, 84, 0, 0.30)" stroke="#e67e22" stroke-width="1.8"/>
          <line x1="38" y1="36" x2="82" y2="36" stroke="#e67e22" stroke-width="2.2"/>
          <line x1="38" y1="54" x2="82" y2="54" stroke="#e67e22" stroke-width="2.5"/>
          <line x1="38" y1="84" x2="82" y2="84" stroke="#e67e22" stroke-width="2.2"/>
          <polygon points="60,20 53,28 67,28" fill="#e67e22"/>
          <text x="60" y="74" fill="#f39c12" font-size="6.5" font-weight="900" text-anchor="middle">SIEGE</text>
        `;
        turretSvg = `
          <polygon points="60,60 42,10 78,10" fill="rgba(243, 156, 18, 0.14)"/>
          <line x1="60" y1="82" x2="60" y2="16" stroke="#f1c40f" stroke-width="4" stroke-linecap="round"/>
          <rect x="52" y="38" width="16" height="10" rx="2" fill="rgba(44, 62, 80, 0.95)" stroke="#f39c12" stroke-width="1.8"/>
          <circle cx="60" cy="82" r="5" fill="#e74c3c" stroke="#f1c40f" stroke-width="1.5"/>
          <polygon points="60,9 55,18 65,18" fill="#f1c40f"/>
        `;
      } else if (v.type === 'trex_mount' || v.type === 'raptor_mount') {
        const isTrex = v.type === 'trex_mount';
        pTitle = isTrex ? 'APEX T-REX PREDATOR' : 'VELOCIRAPTOR PACK HUNTER';
        legTur = '▲ JAW / TALON AIM';
        legHul = '▬ THEROPOD BODY';
        l1 = 'GAZE HDG';
        l2 = 'BODY HDG';
        l3 = 'NECK ANGLE';
        l4 = 'STRIDE SPEED';
        ctrlText = 'WASD Sprint/Stalk • Mouse Aim Jaws • LMB Savage Bite / Claws • [SPACE] Leap / Roar • [E] Release';
        hullSvg = `
          <ellipse cx="60" cy="60" rx="${isTrex ? 14 : 10}" ry="22" fill="rgba(231, 76, 60, 0.25)" stroke="#ff5252" stroke-width="2"/>
          <polygon points="52,40 60,20 68,40" fill="rgba(231, 76, 60, 0.35)" stroke="#ff5252" stroke-width="1.8"/>
          <path d="M 60 82 Q 55 95 63 102" fill="none" stroke="#ff5252" stroke-width="3.2" stroke-linecap="round"/>
          <text x="60" y="64" fill="#ff5252" font-size="6.5" font-weight="900" text-anchor="middle">${isTrex ? 'T-REX' : 'RAPTOR'}</text>
        `;
        turretSvg = `
          <polygon points="60,60 36,12 84,12" fill="rgba(255, 82, 82, 0.14)"/>
          <line x1="60" y1="54" x2="60" y2="16" stroke="#ff5252" stroke-width="3" stroke-linecap="round"/>
          <polygon points="60,10 54,19 66,19" fill="#ff5252"/>
          <circle cx="60" cy="56" r="7" fill="rgba(28, 14, 14, 0.95)" stroke="#ff5252" stroke-width="2"/>
        `;
      } else if (v.type === 'emplace_mortar' || v.type === 'emplace_hmg') {
        const isMortar = v.type === 'emplace_mortar';
        pTitle = isMortar ? '81MM INDIRECT MORTAR PIT' : 'HEAVY MG BUNKER EMPLACEMENT';
        legTur = isMortar ? '▲ TUBE AZIMUTH' : '▲ HMG BARREL';
        legHul = '▬ SANDBAG PIT';
        l1 = 'BARREL HDG';
        l2 = 'MOUNT HDG';
        l3 = 'TRAVERSE ARC';
        l4 = isMortar ? 'IMPACT RANGE' : 'MOUNT STATUS';
        ctrlText = isMortar
          ? 'A/D Traverse Tube • W/S Elevation Range • LMB Fire 81mm HE • [SPACE] 3-Round Barrage • [E] Exit'
          : 'Mouse Aim HMG • LMB Sustained .50 Cal Fire • [E] Dismount Emplacement';
        hullSvg = `
          <circle cx="60" cy="60" r="28" fill="rgba(46, 204, 113, 0.15)" stroke="#2ecc71" stroke-width="2" stroke-dasharray="6 3"/>
          <line x1="60" y1="60" x2="40" y2="82" stroke="#2ecc71" stroke-width="2.2"/>
          <line x1="60" y1="60" x2="80" y2="82" stroke="#2ecc71" stroke-width="2.2"/>
          <polygon points="60,26 53,34 67,34" fill="#2ecc71"/>
        `;
        turretSvg = `
          <polygon points="60,60 40,12 80,12" fill="rgba(0, 210, 211, 0.12)"/>
          <line x1="60" y1="58" x2="60" y2="16" stroke="#00d2d3" stroke-width="4.2" stroke-linecap="round"/>
          <circle cx="60" cy="60" r="9" fill="rgba(12, 22, 32, 0.95)" stroke="#00d2d3" stroke-width="2"/>
          <polygon points="60,10 55,18 65,18" fill="#00d2d3"/>
        `;
      } else {
        // Default: Main Battle Tank ('tank') with Live Directional Armor Zone Bars (Front Glacis, Left/Right Skirts, Rear Engine Deck)
        hullSvg = `
          <rect id="tank-svg-armor-front" x="42" y="22" width="36" height="5" rx="2" fill="#2ecc71"/>
          <rect id="tank-svg-armor-left" x="35" y="28" width="7" height="64" rx="2" fill="rgba(39, 174, 96, 0.35)" stroke="#2ecc71" stroke-width="1.6"/>
          <rect id="tank-svg-armor-right" x="78" y="28" width="7" height="64" rx="2" fill="rgba(39, 174, 96, 0.35)" stroke="#2ecc71" stroke-width="1.6"/>
          <rect id="tank-svg-armor-rear" x="42" y="92" width="36" height="5" rx="2" fill="#2ecc71"/>
          <rect id="tank-svg-hull-body" x="43" y="30" width="34" height="60" rx="4" fill="rgba(46, 204, 113, 0.22)" stroke="#2ecc71" stroke-width="2"/>
          <polygon points="60,16 53,22 67,22" fill="#2ecc71"/>
          <text id="tank-svg-hull-pct" x="60" y="83" fill="#2ecc71" font-size="8" font-weight="900" text-anchor="middle">100%</text>
        `;
        turretSvg = `
          <polygon points="60,60 36,12 84,12" fill="rgba(0, 210, 211, 0.11)"/>
          <line x1="60" y1="60" x2="36" y2="12" stroke="rgba(0, 210, 211, 0.35)" stroke-width="1" stroke-dasharray="3 3"/>
          <line x1="60" y1="60" x2="84" y2="12" stroke="rgba(0, 210, 211, 0.35)" stroke-width="1" stroke-dasharray="3 3"/>
          <line x1="60" y1="48" x2="60" y2="14" stroke="#00d2d3" stroke-width="4.5" stroke-linecap="round"/>
          <line x1="65" y1="48" x2="65" y2="28" stroke="#f39c12" stroke-width="2" stroke-linecap="round"/>
          <polygon points="60,9 55,17 65,17" fill="#00d2d3"/>
          <circle cx="60" cy="60" r="13" fill="rgba(12, 22, 32, 0.95)" stroke="#00d2d3" stroke-width="2.2"/>
          <circle cx="60" cy="60" r="3" fill="#00d2d3"/>
        `;
      }

      hullGroup.innerHTML = hullSvg;
      turretGroup.innerHTML = turretSvg;
      if (titleEl) titleEl.textContent = pTitle;
      if (legTurEl) legTurEl.textContent = legTur;
      if (legHulEl) legHulEl.textContent = legHul;
      if (lbl1El) lbl1El.textContent = l1;
      if (lbl2El) lbl2El.textContent = l2;
      if (lbl3El) lbl3El.textContent = l3;
      if (lbl4El) lbl4El.textContent = l4;
      if (bannerCtrlEl) bannerCtrlEl.textContent = ctrlText;
    }

    if (v.type === 'tank' && hullGroup) {
      const hullPct = Math.max(
        0,
        Math.min(100, Math.round(v.hullIntegrityPct ?? (v.hp / Math.max(1, v.maxHp)) * 100))
      );
      const az = v.armorZones || { front: 100, left: 100, right: 100, rear: 100 };
      const zoneColor = (pct) => (pct < 38 ? '#ff5252' : pct < 70 ? '#f39c12' : '#2ecc71');
      const fEl = hullGroup.querySelector('#tank-svg-armor-front');
      const lEl = hullGroup.querySelector('#tank-svg-armor-left');
      const rEl = hullGroup.querySelector('#tank-svg-armor-right');
      const bEl = hullGroup.querySelector('#tank-svg-armor-rear');
      const bodyEl = hullGroup.querySelector('#tank-svg-hull-body');
      const pctEl = hullGroup.querySelector('#tank-svg-hull-pct');
      if (fEl) fEl.setAttribute('fill', zoneColor(az.front ?? 100));
      if (lEl) lEl.setAttribute('stroke', zoneColor(az.left ?? 100));
      if (rEl) rEl.setAttribute('stroke', zoneColor(az.right ?? 100));
      if (bEl) bEl.setAttribute('fill', zoneColor(az.rear ?? 100));
      if (bodyEl) bodyEl.setAttribute('stroke', zoneColor(hullPct));
      if (pctEl) {
        pctEl.textContent = `${hullPct}%`;
        pctEl.setAttribute('fill', zoneColor(hullPct));
      }
    }

    if (isMotoDash && turretGroup) {
      const kmh = Math.round(Math.abs(v.forwardSpeed || 0) * 3.6);
      const maxKmh = Math.max(80, Math.round((v.speed || 32) * 3.6));
      const rpmFrac = v.engineRpm
        ? Math.min(1, Math.max(0, (v.engineRpm - 1200) / 10800))
        : Math.min(1, kmh / maxKmh);
      const needleDeg = -120 + rpmFrac * 240;
      const needleEl = turretGroup.querySelector('#moto-tach-needle');
      if (needleEl) needleEl.setAttribute('transform', `rotate(${needleDeg.toFixed(1)} 60 60)`);
      const dialKmhEl = turretGroup.querySelector('#moto-dial-kmh');
      if (dialKmhEl) dialKmhEl.textContent = String(kmh).padStart(3, '0');
      const dialGearEl = turretGroup.querySelector('#moto-dial-gear');
      if (dialGearEl) {
        const gStr = v.isElectric ? 'EV' : `G${v.currentGear || 'N'}`;
        dialGearEl.textContent = `KM/H • ${gStr}`;
      }
    }

    // 2. Rotate Peripheral Hull Ring around Center Gunner Reticle
    const reticleHullRing = this.el('reticle-hull-ring');
    if (reticleHullRing) {
      reticleHullRing.style.transform = `rotate(${hullRelDeg}deg)`;
    }
    const reticleHullChevron = this.el('reticle-hull-chevron');
    if (reticleHullChevron) {
      const hullWord =
        v.type === 'bike' || v.type === 'atv'
          ? 'FRAME'
          : v.type === 'warhorse'
          ? 'STEED'
          : v.type === 'trebuchet'
          ? 'A-FRAME'
          : 'HULL';
      reticleHullChevron.textContent =
        Math.abs(hullRelDeg) <= 6
          ? `▲ ${hullWord} ALIGNED`
          : `▲ ${hullWord} (${hullRelDeg > 0 ? '+' : ''}${Math.round(hullRelDeg)}°)`;
    }

    // 3. Update Digital Heading Readouts
    const turretHdgEl = this.el('veh-turret-hdg-val');
    if (turretHdgEl) {
      turretHdgEl.textContent = `${String(turretDeg).padStart(3, '0')}° ${turretDirStr}`;
    }
    const hullHdgEl = this.el('veh-hull-hdg-val');
    if (hullHdgEl) {
      hullHdgEl.textContent = `${String(hullDeg).padStart(3, '0')}° ${hullDirStr}`;
    }
    const offsetEl = this.el('veh-offset-val');
    if (offsetEl) {
      const absOff = Math.abs(Math.round(turretOffsetDeg));
      if (absOff <= 5) {
        offsetEl.textContent = `ALIGNED (${absOff}°)`;
        offsetEl.className = 'vor-val aligned';
      } else {
        const side = turretOffsetDeg > 0 ? 'RIGHT' : 'LEFT';
        offsetEl.textContent = `${turretOffsetDeg > 0 ? '+' : '-'}${absOff}° ${side}`;
        offsetEl.className = 'vor-val offset';
      }
    }
    const gearEl = this.el('veh-gear-val');
    if (gearEl) {
      const spd = v.forwardSpeed || 0;
      const kmh = Math.round(Math.abs(spd) * 3.6);
      const maxKmh = Math.round((v.speed || 0) * 3.6);
      if (v.isAircraft) {
        const gY = this.world ? this.world.getGroundHeightAt(v.pos.x, v.pos.z) : 0;
        const alt = Math.max(0, Math.round(v.pos.y - gY));
        gearEl.textContent = `ALT ${alt}M • ${kmh} KM/H`;
      } else if (v.type === 'trebuchet' || v.type === 'emplace_mortar') {
        const rng = Math.round(this.player?.mortarRangeM || 200);
        gearEl.textContent = `ARC ${rng}M • STATIC`;
      } else if (v.type === 'warhorse' || v.type === 'trex_mount' || v.type === 'raptor_mount') {
        const gait =
          kmh > maxKmh * 0.72 ? 'GALLOP' : kmh > maxKmh * 0.3 ? 'CANTER' : kmh > 2 ? 'TROT' : 'HALT';
        gearEl.textContent = `${gait} • ${kmh}/${maxKmh} KM/H`;
      } else if (v.type === 'bike' || v.type === 'atv') {
        const gearLabel = v.isElectric
          ? spd > 0.3
            ? 'DIRECT EV'
            : spd < -0.3
            ? 'REV EV'
            : 'READY EV'
          : typeof v.currentGear === 'number'
          ? `GEAR ${v.currentGear}`
          : `GEAR ${v.currentGear || 'N'}`;
        const rpmVal = v.engineRpm || (v.isElectric ? 0 : 1400);
        gearEl.textContent = `${gearLabel} • ${rpmVal} RPM • ${kmh} KM/H`;
      } else {
        const gearStr = spd > 0.4 ? 'FWD [W]' : spd < -0.4 ? 'REV [S]' : 'NEUTRAL';
        gearEl.textContent = `${gearStr} • ${kmh}/${maxKmh} KM/H`;
      }
    }

    // 4. Update Dual Weapon Fire-Control Cards (Specific to each vehicle class)
    const activeSlot = v.activeWeaponSlot || 0;
    const cardPrimary = this.el('veh-wpn-card-primary');
    const cardCoax = this.el('veh-wpn-card-coax');
    const hasCoax = Boolean(
      v.type === 'tank' ||
        v.type === 'apc' ||
        v.type === 'aa' ||
        v.type === 'emplace_aa' ||
        v.type === 'emplace_mortar' ||
        v.type === 'trebuchet' ||
        v.type === 'warhorse' ||
        v.type === 'trex_mount' ||
        v.type === 'raptor_mount' ||
        v.type === 'bike' ||
        v.type === 'atv' ||
        v.isAircraft
    );

    if (cardPrimary) {
      cardPrimary.classList.toggle('active', activeSlot === 0);
    }
    if (cardCoax) {
      cardCoax.style.display = hasCoax ? 'block' : 'none';
      cardCoax.classList.toggle('active', activeSlot >= 1);
    }

    const wpn1NameEl = this.el('veh-wpn1-name');
    const wpn1KeyEl = this.el('veh-wpn1-key');
    const wpn1BarEl = this.el('veh-wpn1-bar');
    const wpn1StatusEl = this.el('veh-wpn1-status');
    const wpn2NameEl = this.el('veh-wpn2-name');

    if (v.isAircraft) {
      const aRole = v.aircraftRole || v.type;
      if (wpn1NameEl) {
        wpn1NameEl.textContent =
          aRole === 'wright_flyer'
            ? '[1] 1903 BRASS GATLING MG (840 RPM)'
            : aRole === 'b2_spirit'
            ? '[1] 80× MK-82 CARPET BOMB BAY'
            : aRole === 'cas'
            ? '[1] 30MM GAU-8 BRRRT'
            : aRole === 'gunship'
            ? '[1] 25MM GATLING + [2] 40MM BOFORS'
            : '[1] 20MM VULCAN + [3] JDAM BOMBS';
      }
      if (wpn1KeyEl) {
        wpn1KeyEl.textContent = activeSlot === 0 ? 'LMB ACTIVE' : 'LMB / [1/2/3]';
      }
      if (wpn1BarEl && wpn1StatusEl) {
        if (v.fireCooldown > 0.08 && aRole === 'fighter' && activeSlot === 2) {
          const maxCd = v.maxFireCooldown || 0.85;
          const pct = Math.max(0, Math.min(100, ((maxCd - v.fireCooldown) / maxCd) * 100));
          wpn1BarEl.style.width = `${pct}%`;
          wpn1BarEl.style.background = '#f39c12';
          wpn1StatusEl.textContent = `BOMB BAY CYCLING... ${v.fireCooldown.toFixed(1)}s`;
          wpn1StatusEl.style.color = '#f39c12';
        } else {
          wpn1BarEl.style.width = '100%';
          wpn1BarEl.style.background = '#2ecc71';
          wpn1StatusEl.textContent =
            aRole === 'wright_flyer'
              ? 'READY • 1903 GATLING [LMB] + 3× DYNAMITE [SPACE]'
              : aRole === 'b2_spirit'
              ? activeSlot === 1
                ? 'READY • TWIN 30,000LB GBU-57 MOP [LMB/SPACE]'
                : activeSlot === 2
                ? 'READY • 20MM STEALTH CANNON [LMB] + AIM-9X [SPACE]'
                : 'READY • 5-BOMB ROLLING CARPET SALVO (HOLD LMB/SPACE)'
              : aRole === 'cas'
              ? 'READY • 1,320 RPM AP-HEI STRAFE'
              : aRole === 'gunship'
              ? activeSlot === 1
                ? 'READY • 40MM BOFORS AIRBURST [LMB]'
                : 'READY • 1,600 RPM 25MM GATLING [LMB]'
              : activeSlot === 2
              ? 'READY • ⊕ 500LB JDAM [LMB] / GBU-28 [SPACE]'
              : 'READY • 1,080 RPM A2A CANNON + [3] BOMBS';
          wpn1StatusEl.style.color = '#2ecc71';
        }
      }

      if (wpn2NameEl) {
        wpn2NameEl.textContent =
          aRole === 'wright_flyer'
            ? '[2/SPACE] 3× DYNAMITE CRATES + [X] TAILWIND'
            : aRole === 'b2_spirit'
            ? '[2] 2× GBU-57 MOP + [X] RAM STEALTH'
            : aRole === 'cas'
            ? '[2] HYDRA-70 ROCKETS'
            : aRole === 'gunship'
            ? '[3/SPACE] 105MM M102 HOWITZER'
            : activeSlot === 2
            ? '[SPACE] 2,000LB GBU-28'
            : '[2/SPACE] AIM-9X / R-73 A2A';
      }
      const wpn2KeyEl = this.el('veh-wpn2-key');
      const wpn2BarEl = this.el('veh-wpn2-bar');
      const wpn2StatusEl = this.el('veh-wpn2-status');
      if (wpn2KeyEl) {
        wpn2KeyEl.textContent =
          aRole === 'b2_spirit' ? 'SPACE / [2] / [X]' : aRole === 'gunship' ? 'SPACE / [3]' : 'SPACE / [2]';
      }
      if (wpn2BarEl && wpn2StatusEl) {
        const secCd = v.secondaryCooldown || 0;
        if (secCd > 0.05) {
          const maxSec = aRole === 'gunship' ? 3.2 : aRole === 'fighter' ? 1.8 : 0.45;
          const pct = Math.max(0, Math.min(100, ((maxSec - secCd) / maxSec) * 100));
          wpn2BarEl.style.width = `${pct}%`;
          wpn2BarEl.style.background = '#f39c12';
          wpn2StatusEl.textContent = `RELOADING ORDNANCE... ${secCd.toFixed(1)}s`;
          wpn2StatusEl.style.color = '#f39c12';
        } else if (aRole === 'b2_spirit') {
          const cloakActive = (v.flareActiveTimer || 0) > 0;
          wpn2BarEl.style.width = '100%';
          wpn2BarEl.style.background = cloakActive ? '#a29bfe' : '#00d2d3';
          wpn2StatusEl.textContent = cloakActive
            ? `🦇 ACTIVE RAM CLOAK: ${v.flareActiveTimer.toFixed(1)}S (0% RADAR SIGNATURE)`
            : '🦇 88% LOW-OBSERVABLE STEALTH • [X] ACTIVE CLOAK';
          wpn2StatusEl.style.color = cloakActive ? '#dcdde1' : '#7bed9f';
        } else if (aRole === 'fighter' && activeSlot !== 2) {
          const lockTgt = this.player.aircraftLockTarget;
          const lockPct = Math.round((this.player.aircraftLockProgress || 0) * 100);
          wpn2BarEl.style.width = lockTgt ? `${Math.max(25, lockPct)}%` : '100%';
          wpn2BarEl.style.background = lockTgt && lockPct >= 100 ? '#ff3838' : '#00d2d3';
          wpn2StatusEl.textContent = lockTgt
            ? lockPct >= 100
              ? `🎯 LOCKED ON ${lockTgt.name.split(' ')[0]} — PRESS [SPACE]!`
              : `📡 SEEKING ${lockTgt.name.split(' ')[0]} (${lockPct}%)`
            : 'READY • AIM AT JET FOR LOCK OR [3] FOR BOMBS';
          wpn2StatusEl.style.color = lockTgt && lockPct >= 100 ? '#ff5252' : '#7bed9f';
        } else {
          wpn2BarEl.style.width = '100%';
          wpn2BarEl.style.background = '#00d2d3';
          wpn2StatusEl.textContent =
            aRole === 'cas'
              ? 'READY • 70MM HE-AT ROCKET SALVO [SPACE]'
              : aRole === 'gunship'
              ? 'READY • 105MM AERIAL ARTILLERY SHELL [SPACE]'
              : 'READY • 2,000LB BUNKER BUSTER [SPACE]';
          wpn2StatusEl.style.color = '#7bed9f';
        }
      }
      return;
    }

    if (v.type === 'aa' || v.type === 'emplace_aa') {
      if (wpn1NameEl) wpn1NameEl.textContent = '[1] TWIN 25/30MM PROXIMITY AA';
      if (wpn1KeyEl) wpn1KeyEl.textContent = activeSlot === 0 ? 'LMB ACTIVE' : 'PRESS [1]';
      if (wpn1BarEl && wpn1StatusEl) {
        wpn1BarEl.style.width = '100%';
        wpn1BarEl.style.background = '#2ecc71';
        wpn1StatusEl.textContent = 'READY • 1,050 RPM PROXIMITY AIRBURST FLAK';
        wpn1StatusEl.style.color = '#2ecc71';
      }
      if (wpn2NameEl) wpn2NameEl.textContent = '[2] STINGER / 9M311 SAM POD';
      const wpn2KeyEl = this.el('veh-wpn2-key');
      const wpn2BarEl = this.el('veh-wpn2-bar');
      const wpn2StatusEl = this.el('veh-wpn2-status');
      if (wpn2KeyEl) wpn2KeyEl.textContent = 'SPACE / [2]';
      if (wpn2BarEl && wpn2StatusEl) {
        const lockTgt = this.player.aircraftLockTarget;
        const lockPct = Math.round((this.player.aircraftLockProgress || 0) * 100);
        wpn2BarEl.style.width = lockTgt ? `${Math.max(25, lockPct)}%` : '100%';
        wpn2BarEl.style.background = lockTgt && lockPct >= 100 ? '#ff3838' : '#00d2d3';
        wpn2StatusEl.textContent = lockTgt
          ? lockPct >= 100
            ? `🔒 SAM LOCKED ON ${lockTgt.name.split(' ')[0]} — PRESS [SPACE]!`
            : `📡 RADAR TRACKING ${lockTgt.name.split(' ')[0]} (${lockPct}%)`
          : 'READY • TRACK ENEMY AIRCRAFT FOR SAM LOCK';
        wpn2StatusEl.style.color = lockTgt && lockPct >= 100 ? '#ff5252' : '#7bed9f';
      }
      return;
    }

    if (v.type === 'emplace_mortar') {
      const mRange = Math.round(this.player.mortarRangeM || 200);
      if (wpn1NameEl) wpn1NameEl.textContent = `[1] 81MM INDIRECT HE (${mRange}M)`;
      if (wpn1KeyEl) wpn1KeyEl.textContent = 'LMB FIRE';
      if (wpn1BarEl && wpn1StatusEl) {
        wpn1BarEl.style.width = '100%';
        wpn1BarEl.style.background = '#f1c40f';
        wpn1StatusEl.textContent = `ELEVATED INDIRECT ARC • IMPACT AT ${mRange}M (⊕ RING)`;
        wpn1StatusEl.style.color = '#f1c40f';
      }
      if (wpn2NameEl) wpn2NameEl.textContent = '[2] 3-ROUND RAPID BARRAGE';
      const wpn2KeyEl = this.el('veh-wpn2-key');
      const wpn2BarEl = this.el('veh-wpn2-bar');
      const wpn2StatusEl = this.el('veh-wpn2-status');
      if (wpn2KeyEl) wpn2KeyEl.textContent = 'SPACE / [2]';
      if (wpn2BarEl && wpn2StatusEl) {
        wpn2BarEl.style.width = '100%';
        wpn2BarEl.style.background = '#e67e22';
        wpn2StatusEl.textContent = 'READY • 3× 81MM HE SALVO [SPACE]';
        wpn2StatusEl.style.color = '#7bed9f';
      }
      return;
    }

    if (v.type === 'bike' || v.type === 'atv') {
      const spdKmh = Math.round(Math.abs(v.forwardSpeed || 0) * 3.6);
      const maxKmh = Math.round((v.speed || 30) * 3.6);
      const leanDeg = Math.round(((v.roll || 0) * 180) / Math.PI);
      const isWheelie = Boolean(this.player?.keys?.['Space'] || (v.flareActiveTimer || 0) > 0);
      if (wpn1NameEl) {
        wpn1NameEl.textContent =
          v.type === 'atv' ? '[LMB] TWIN 9MM QUAD RACK PDW' : '[LMB] 9MM HANDLEBAR DRIVE-BY SMG';
      }
      if (wpn1KeyEl) wpn1KeyEl.textContent = 'LMB FIRE';
      if (wpn1BarEl && wpn1StatusEl) {
        wpn1BarEl.style.width = '100%';
        wpn1BarEl.style.background = '#2ecc71';
        wpn1StatusEl.textContent = `READY • ${v.rpm || 850} RPM DRIVE-BY AUTO • LEAN ${leanDeg >= 0 ? '+' : ''}${leanDeg}°`;
        wpn1StatusEl.style.color = '#2ecc71';
      }
      if (wpn2NameEl) {
        wpn2NameEl.textContent = v.isElectric
          ? '[SPACE/X] 80HP ELECTRIC OVERDRIVE'
          : v.isTwoStroke
          ? '[SPACE/X] 2-STROKE POWERBAND BOOST'
          : '[SPACE/X] WHEELIE / NITRO BOOST';
      }
      const wpn2KeyEl = this.el('veh-wpn2-key');
      const wpn2BarEl = this.el('veh-wpn2-bar');
      const wpn2StatusEl = this.el('veh-wpn2-status');
      if (wpn2KeyEl) wpn2KeyEl.textContent = 'HOLD SPACE / [X]';
      if (wpn2BarEl && wpn2StatusEl) {
        const pct = Math.min(100, Math.round((spdKmh / Math.max(1, maxKmh)) * 100));
        const gearTag = v.isElectric ? 'EV DRIVE' : `GEAR ${v.currentGear || 'N'}`;
        const rpmTag = `${v.engineRpm || 0} RPM`;
        wpn2BarEl.style.width = `${Math.max(12, pct)}%`;
        wpn2BarEl.style.background = isWheelie ? '#f1c40f' : '#00d2d3';
        wpn2StatusEl.textContent = isWheelie
          ? `🔥 WHEELIE / BOOST • ${spdKmh} KM/H (${gearTag} • ${rpmTag})`
          : `${spdKmh} / ${maxKmh} KM/H (${gearTag} • ${rpmTag}) • [SPACE] WHEELIE`;
        wpn2StatusEl.style.color = isWheelie ? '#f1c40f' : '#7bed9f';
      }
      return;
    }

    if (v.type === 'trebuchet') {
      const mRange = Math.round(this.player.mortarRangeM || 200);
      const crewCnt = v.setupCrewIds ? v.setupCrewIds.length : 0;
      const isReady = v.isTrebuchetReady !== false || crewCnt >= 2;
      if (wpn1NameEl) wpn1NameEl.textContent = `[LMB] FLAMING SIEGE BOULDER (${mRange}M)`;
      if (wpn1KeyEl) wpn1KeyEl.textContent = 'LMB LOOSE';
      if (wpn1BarEl && wpn1StatusEl) {
        if (v.fireCooldown > 0.05) {
          const maxCd = v.maxFireCooldown || 3.3;
          const pct = Math.max(0, Math.min(100, ((maxCd - v.fireCooldown) / maxCd) * 100));
          wpn1BarEl.style.width = `${pct}%`;
          wpn1BarEl.style.background = '#f39c12';
          wpn1StatusEl.textContent = `WINCHING COUNTERWEIGHT... ${v.fireCooldown.toFixed(1)}s`;
          wpn1StatusEl.style.color = '#f39c12';
        } else {
          wpn1BarEl.style.width = '100%';
          wpn1BarEl.style.background = isReady ? '#2ecc71' : '#e67e22';
          wpn1StatusEl.textContent = isReady
            ? `READY • 90KG PITCH BOULDER ARC (${mRange}M IMPACT)`
            : 'HOLD [G] OR CALL CREW [T] TO COCK COUNTERWEIGHT';
          wpn1StatusEl.style.color = isReady ? '#2ecc71' : '#f39c12';
        }
      }
      if (wpn2NameEl) wpn2NameEl.textContent = '[T / G] SIEGE CREW & WINCH';
      const wpn2KeyEl = this.el('veh-wpn2-key');
      const wpn2BarEl = this.el('veh-wpn2-bar');
      const wpn2StatusEl = this.el('veh-wpn2-status');
      if (wpn2KeyEl) wpn2KeyEl.textContent = '[T] CREW / [G] WINCH';
      if (wpn2BarEl && wpn2StatusEl) {
        wpn2BarEl.style.width = `${Math.min(100, Math.max(25, crewCnt * 50))}%`;
        wpn2BarEl.style.background = crewCnt >= 2 ? '#2ecc71' : '#00d2d3';
        wpn2StatusEl.textContent = `CREW ASSIGNED: ${crewCnt}/2 ENGINEERS • [W/S] ELEVATION`;
        wpn2StatusEl.style.color = '#7bed9f';
      }
      return;
    }

    if (v.type === 'warhorse') {
      const spdKmh = Math.round(Math.abs(v.forwardSpeed || 0) * 3.6);
      const maxKmh = Math.round((v.speed || 12.5) * 3.6);
      if (wpn1NameEl) wpn1NameEl.textContent = '[LMB] MOUNTED ROYAL YEW LONGBOW';
      if (wpn1KeyEl) wpn1KeyEl.textContent = 'LMB LOOSE';
      if (wpn1BarEl && wpn1StatusEl) {
        if (v.fireCooldown > 0.05) {
          const maxCd = v.maxFireCooldown || 0.7;
          const pct = Math.max(0, Math.min(100, ((maxCd - v.fireCooldown) / maxCd) * 100));
          wpn1BarEl.style.width = `${pct}%`;
          wpn1BarEl.style.background = '#f39c12';
          wpn1StatusEl.textContent = `NOCKING BODKIN ARROW... ${v.fireCooldown.toFixed(1)}s`;
          wpn1StatusEl.style.color = '#f39c12';
        } else {
          wpn1BarEl.style.width = '100%';
          wpn1BarEl.style.background = '#2ecc71';
          wpn1StatusEl.textContent = 'READY • 110LB DRAW BODKIN ARROW + TRAMPLE CHARGE';
          wpn1StatusEl.style.color = '#2ecc71';
        }
      }
      if (wpn2NameEl) wpn2NameEl.textContent = '[SPACE] CAVALRY GALLOP & REAR JUMP';
      const wpn2KeyEl = this.el('veh-wpn2-key');
      const wpn2BarEl = this.el('veh-wpn2-bar');
      const wpn2StatusEl = this.el('veh-wpn2-status');
      if (wpn2KeyEl) wpn2KeyEl.textContent = 'W/S + [SPACE]';
      if (wpn2BarEl && wpn2StatusEl) {
        const pct = Math.min(100, Math.round((spdKmh / Math.max(1, maxKmh)) * 100));
        wpn2BarEl.style.width = `${Math.max(15, pct)}%`;
        wpn2BarEl.style.background = '#f1c40f';
        wpn2StatusEl.textContent = `DESTRIER PACE: ${spdKmh} / ${maxKmh} KM/H • TRAMPLE ACTIVE > 28 KM/H`;
        wpn2StatusEl.style.color = '#f1c40f';
      }
      return;
    }

    if (v.type === 'trex_mount' || v.type === 'raptor_mount') {
      const isTrex = v.type === 'trex_mount';
      const spdKmh = Math.round(Math.abs(v.forwardSpeed || 0) * 3.6);
      const maxKmh = Math.round((v.speed || 20.5) * 3.6);
      if (wpn1NameEl) {
        wpn1NameEl.textContent = isTrex
          ? '[LMB] CRUSHING JAWS & SEISMIC STOMP'
          : '[LMB] SICKLE TALONS & VENOM SPIT';
      }
      if (wpn1KeyEl) wpn1KeyEl.textContent = 'LMB SAVAGE';
      if (wpn1BarEl && wpn1StatusEl) {
        wpn1BarEl.style.width = '100%';
        wpn1BarEl.style.background = '#ff5252';
        wpn1StatusEl.textContent = isTrex
          ? 'READY • 160 DMG APEX JAW CRUSH + SHOCKWAVE'
          : 'READY • 78 DMG TALON SLASH / ACID SPIT';
        wpn1StatusEl.style.color = '#ff5252';
      }
      if (wpn2NameEl) {
        wpn2NameEl.textContent = isTrex ? '[SPACE] APEX ROAR & CHARGE' : '[SPACE] PREDATOR POUNCE LEAP';
      }
      const wpn2KeyEl = this.el('veh-wpn2-key');
      const wpn2BarEl = this.el('veh-wpn2-bar');
      const wpn2StatusEl = this.el('veh-wpn2-status');
      if (wpn2KeyEl) wpn2KeyEl.textContent = 'SPACE';
      if (wpn2BarEl && wpn2StatusEl) {
        const pct = Math.min(100, Math.round((spdKmh / Math.max(1, maxKmh)) * 100));
        wpn2BarEl.style.width = `${Math.max(18, pct)}%`;
        wpn2BarEl.style.background = '#e74c3c';
        wpn2StatusEl.textContent = `STRIDE SPEED: ${spdKmh} / ${maxKmh} KM/H`;
        wpn2StatusEl.style.color = '#ff7979';
      }
      return;
    }

    if (wpn2NameEl) {
      wpn2NameEl.textContent = '[2] 7.62MM COAX MG';
    }

    if (wpn1NameEl) {
      wpn1NameEl.textContent =
        v.weaponType === 'tank_cannon'
          ? v.team === 'RU'
            ? '[1] 125MM CANNON'
            : '[1] 120MM CANNON'
          : v.weaponType === 'autocannon'
          ? '[1] 30MM HE CANNON'
          : '[1] .50 CAL HMG';
    }
    if (wpn1KeyEl) {
      wpn1KeyEl.textContent = activeSlot === 0 ? 'LMB ACTIVE' : 'PRESS [1]';
    }
    if (wpn1BarEl && wpn1StatusEl) {
      const maxCd = v.maxFireCooldown || 60 / (v.rpm || 18);
      if (v.fireCooldown > 0.05 && v.weaponType === 'tank_cannon') {
        const pct = Math.max(0, Math.min(100, ((maxCd - v.fireCooldown) / maxCd) * 100));
        wpn1BarEl.style.width = `${pct}%`;
        wpn1BarEl.style.background = '#f39c12';
        wpn1StatusEl.textContent = `RELOADING SHELL... ${v.fireCooldown.toFixed(1)}s`;
        wpn1StatusEl.style.color = '#f39c12';
      } else {
        wpn1BarEl.style.width = '100%';
        wpn1BarEl.style.background = '#2ecc71';
        wpn1StatusEl.textContent =
          v.weaponType === 'tank_cannon'
            ? 'READY • APFSDS/HE (135M ZERO • 200-600 ARC)'
            : v.weaponType === 'autocannon'
            ? 'READY • 330 RPM HE-FRAG (145M ZERO)'
            : 'READY • 720 RPM .50 BMG AP-I (FLAT AT +)';
        wpn1StatusEl.style.color = '#2ecc71';
      }
    }

    if (hasCoax) {
      const wpn2KeyEl = this.el('veh-wpn2-key');
      const wpn2BarEl = this.el('veh-wpn2-bar');
      const wpn2StatusEl = this.el('veh-wpn2-status');
      const heatPct = Math.round(Math.min(100, (v.coaxHeat || 0) * 100));

      if (wpn2KeyEl) {
        wpn2KeyEl.textContent = activeSlot === 1 ? 'LMB / SPACE' : 'HOLD SPACE / [2]';
      }
      if (wpn2BarEl) {
        wpn2BarEl.style.width = `${heatPct}%`;
      }
      if (wpn2StatusEl) {
        if (v.coaxOverheated) {
          wpn2StatusEl.textContent = `⚠️ OVERHEATED (${heatPct}%) — COOLING`;
          wpn2StatusEl.style.color = '#ff5252';
        } else {
          wpn2StatusEl.textContent = `READY • 950 RPM AP (FLAT AT + • HEAT ${heatPct}%)`;
          wpn2StatusEl.style.color = '#bdc3c7';
        }
      }
    }
  },
  updateKillStreakBadge() {
    let el = this.el('kill-streak-badge');
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
        if (this._domCache) this._domCache.set('kill-streak-badge', el);
      }
      const inAircraft = Boolean(this.player.activeVehicle && this.player.activeVehicle.isAircraft);
      el.style.bottom = inAircraft ? '252px' : '165px';
      el.textContent = `🔥 STREAK: ${this.player.killStreak}`;
      el.style.display = 'block';
    } else if (el) {
      el.style.display = 'none';
    }
  },

  // Forward Base Entrenched Defender Advantage Badge (shows active real-life & tactical shooter defensive buffs)
  updateForwardBaseDefenseBadge() {
    let el = this.el('fob-defense-badge');
    const sbOpen = this.scoreboardEl && !this.scoreboardEl.classList.contains('hidden');
    if (
      this.player.inFriendlyForwardBase &&
      !this.player.activeVehicle?.isAircraft &&
      !this.player.dead &&
      !this.player.downed &&
      !sbOpen
    ) {
      if (!el) {
        el = document.createElement('div');
        el.id = 'fob-defense-badge';
        el.style.cssText = `
          position: fixed; bottom: 215px; right: 18px;
          font-size: 11.5px; font-weight: 900; color: #7bed9f;
          background: rgba(16, 42, 32, 0.88);
          border: 1.5px solid rgba(46, 204, 113, 0.75);
          padding: 5px 10px; border-radius: 5px;
          text-shadow: 0 1px 4px rgba(0,0,0,0.9);
          font-family: 'Rajdhani', sans-serif; letter-spacing: 0.9px;
          pointer-events: none; z-index: 200;
          box-shadow: 0 4px 14px rgba(0,0,0,0.65);
        `;
        document.body.appendChild(el);
        if (this._domCache) this._domCache.set('fob-defense-badge', el);
      }
      const stg = this.player.defendedFlagStage || 0;
      const dmgRed = Math.min(42, 25 + stg * 4);
      const holdMult = (1.35 + stg * 0.075).toFixed(2);
      const garSq = this.player.defendedFlagGarrisonSquad
        ? ` • GARRISON: ${this.player.defendedFlagGarrisonSquad}`
        : '';
      el.innerHTML = `
        <div style="color:#2ecc71;font-size:12px;">🏰 OBJ ${this.player.defendedFlagId || 'BASE'} ENTRENCHED DEFENSE (STAGE ${stg}/4${garSq})</div>
        <div style="color:#dfe6e9;font-size:10.5px;font-weight:800;">🛡️ -${dmgRed}% DMG TAKEN • 🎯 -30% RECOIL • ⚖️ ${holdMult}× HOLD • 🏥 +HP/ARMOR/AMMO</div>
      `;
      el.style.display = 'block';
    } else if (el) {
      el.style.display = 'none';
    }
  },

  // War Crimes HUD Badge (shows enemy Medics eliminated by the player)
  updateWarCrimeBadge() {
    let el = this.el('war-crime-badge');
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
        if (this._domCache) this._domCache.set('war-crime-badge', el);
      }
      const inAircraft = Boolean(this.player.activeVehicle && this.player.activeVehicle.isAircraft);
      el.style.bottom = inAircraft ? '275px' : '188px';
      el.textContent = `⚠️ WAR CRIMES (MEDICS KILLED): ${crimes}`;
      el.style.display = 'block';
    } else if (el) {
      el.style.display = 'none';
    }
  },

  // ─── PROXIMITY & SQUAD TACTICAL COMMS FEED (COMPACT & NON-OBSTRUCTIVE) ──
  addTacticalCommsMessage(speakerName, role, channel, distM, text, isSelf = false) {
    let feed = this.el('tactical-comms-feed');
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
      if (this._domCache) this._domCache.set('tactical-comms-feed', feed);
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
    item.innerHTML = `<span style="font-size:9px;font-weight:900;color:${badgeColor};margin-right:4px;">[${channelLabel}]</span><strong style="color:${
      isSelf ? '#f1c40f' : '#fff'
    };margin-right:4px;">${speakerName}:</strong><span style="color:#dfe6e9;">${text}</span>`;

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
  },

  // ─── COMMANDER UAV HUD OVERLAY ──────────────────────────────────────
  updateUAVOverlay() {
    let el = this.el('uav-hud');
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
        if (this._domCache) this._domCache.set('uav-hud', el);
      }
      const infCount = (this.player.uavRevealedBots || []).filter((b) => !b.dead).length;
      const vehCount = (this.player.uavRevealedVehicles || []).filter((v) => !v.dead).length;
      const hotspot = this.player.uavHotspotFlag ? ` • HOTSPOT: OBJ ${this.player.uavHotspotFlag}` : '';
      const assists = this.player.uavAssists ? ` • ASSISTS: ${this.player.uavAssists}` : '';
      el.textContent = `📡 MQ-9 UAV DATALINK ACTIVE — ${Math.ceil(
        this.player.uavTimer
      )}s • ${infCount} INF / ${vehCount} ARMOR PAINTED${hotspot}${assists}`;
      el.style.display = 'block';
    } else if (el) {
      el.style.display = 'none';
    }
  },

  // ─── AIRSTRIKE INBOUND HUD ─────────────────────────────────────────
  updateAirstrikeHUD() {
    let el = this.el('airstrike-hud');
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
        if (this._domCache) this._domCache.set('airstrike-hud', el);
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
  },

  // ─── SQUAD FIELD AMMO & KIT-SWAP BAR (WHEN NEAR ANY AMMO STASH) ─────
  updateFieldKitBar(nearCrate) {
    let el = this.el('field-kit-bar');
    if (!nearCrate || this.player.dead || this.player.downed || this.player.activeVehicle) {
      if (el) el.style.display = 'none';
      return;
    }

    if (!el) {
      el = document.createElement('div');
      el.id = 'field-kit-bar';
      el.style.cssText = `
        position: fixed; bottom: 138px; left: 50%; transform: translateX(-50%);
        display: flex; align-items: center; gap: 6px; padding: 6px 12px;
        background: rgba(11, 18, 26, 0.92); border: 1.5px solid rgba(0, 210, 211, 0.75);
        border-radius: 6px; font-family: 'Rajdhani', sans-serif; z-index: 950;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.75); pointer-events: auto;
      `;
      document.body.appendChild(el);
      if (this._domCache) this._domCache.set('field-kit-bar', el);
    }

    const era = this.world?.era || 'modern';
    const activeRole = (this.player.role || 'engineer').toLowerCase();
    const curWepName = this.player.slots?.[0]?.def?.shortName || 'RIFLE';
    const sig = `${era}:${ this.player.team}:${activeRole}:${curWepName}`;
    if (el.dataset.sig !== sig) {
      el.dataset.sig = sig;
      const roles = getEraRoles(era, this.player.team);
      el.innerHTML =
        `<button id="fkb-resupply-btn" style="background:#00b894;border:1.5px solid #55efc4;color:#fff;border-radius:4px;padding:4px 9px;cursor:pointer;font-family:'Rajdhani',sans-serif;font-weight:900;font-size:11.5px;white-space:nowrap;">📦 [F] RESUPPLY 100%</button>` +
        `<button id="fkb-loadout-modal-btn" style="background:rgba(241,196,15,0.22);border:1.5px solid #f1c40f;color:#f1c40f;border-radius:4px;padding:4px 10px;cursor:pointer;font-family:'Rajdhani',sans-serif;font-weight:900;font-size:11.5px;white-space:nowrap;">🎒 [L] ROLE, GUN (${curWepName}) &amp; GUNSMITH</button>` +
        roles
          .map((r) => {
            const isAct = r.id === activeRole;
            const bg = isAct ? 'rgba(46, 204, 113, 0.28)' : 'rgba(30, 42, 56, 0.85)';
            const border = isAct ? '#2ecc71' : 'rgba(255,255,255,0.2)';
            const col = isAct ? '#2ecc71' : '#ecf0f1';
            return `<button class="field-kit-role-btn" data-role="${r.id}" style="
              background:${bg}; border:1.5px solid ${border}; color:${col};
              border-radius:4px; padding:3px 8px; cursor:pointer;
              font-family:'Rajdhani',sans-serif; font-weight:800; font-size:12px;
              display:flex; flex-direction:column; align-items:center; line-height:1.1;
            ">
              <span>[${r.key}] ${r.icon} ${r.label}</span>
              <span style="font-size:9px;color:#95a5a6;font-weight:700;">${r.sub}</span>
            </button>`;
          })
          .join('');

      const resBtn = el.querySelector('#fkb-resupply-btn');
      if (resBtn) {
        resBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (typeof this.player.resupplyAll === 'function') {
            this.player.resupplyAll(false);
          }
        });
      }
      const openMenuBtn = el.querySelector('#fkb-loadout-modal-btn');
      if (openMenuBtn) {
        openMenuBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (typeof this.openLoadoutAndGunsmithModal === 'function') {
            this.openLoadoutAndGunsmithModal();
          }
        });
      }
      el.querySelectorAll('.field-kit-role-btn').forEach((btn) => {
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const role = btn.dataset.role;
          if (role && typeof this.player.changeRoleInField === 'function') {
            this.player.changeRoleInField(role, true);
            el.dataset.sig = '';
          }
        });
      });
    }
    el.style.display = 'flex';
  },

  // ─── ANIMATED HUD RELOAD & BULLET-PACKING CUTAWAY VISUALIZER ────────
  updateReloadAnimationHud(cur) {
    let el = this.el('reload-anim-hud');
    const isReloading = Boolean(
      cur && !this.player.dead && !this.player.downed && !this.player.activeVehicle &&
      (this.player.reloading || this.player.slowReloading)
    );
    if (!isReloading) {
      if (el) el.style.display = 'none';
      return;
    }

    if (!el) {
      el = document.createElement('div');
      el.id = 'reload-anim-hud';
      el.style.cssText = `
        position: fixed; bottom: 196px; left: 50%; transform: translateX(-50%);
        width: 325px; background: rgba(10, 16, 24, 0.94);
        border: 1.5px solid rgba(241, 196, 15, 0.78); border-radius: 7px;
        padding: 8px 12px; z-index: 960; pointer-events: none;
        font-family: 'Rajdhani', 'Segoe UI', sans-serif; color: #ecf0f1;
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.85);
      `;
      document.body.appendChild(el);
      if (this._domCache) this._domCache.set('reload-anim-hud', el);
    }
    el.style.display = 'block';

    if (this.player.reloading) {
      const totalTime =
        (this.player.reloadTotalTime || cur.def.reloadTime) * (this.player.fastReload ? 0.62 : 1.0);
      const pct = Math.max(0, Math.min(1, 1 - this.player.reloadTimer / Math.max(0.2, totalTime)));
      const stage = pct < 0.36 ? 1 : pct < 0.74 ? 2 : 3;
      const s1 = stage === 1 ? pct / 0.36 : 1;
      const s2 = stage === 2 ? (pct - 0.36) / 0.38 : stage > 2 ? 1 : 0;
      const s3 = stage === 3 ? (pct - 0.74) / 0.26 : 0;

      // Old mag drops out in stage 1; Fresh mag rises in stage 2; Bolt racks in stage 3
      const oldMagY = Math.round(28 + s1 * 32);
      const oldMagOp = stage === 1 ? (1 - s1 * 0.65).toFixed(2) : '0.15';
      const newMagY = stage === 1 ? 62 : Math.round(62 - s2 * 34);
      const boltX = stage === 3 ? Math.round(Math.sin(s3 * Math.PI) * 18) : 0;
      const chamberRoundX = stage === 3 ? Math.round((1 - s3) * 14) : 14;

      const stageTitle =
        stage === 1
          ? '1. UNLATCH & EJECT MAGAZINE'
          : stage === 2
          ? '2. INSERT FRESH MAG FROM RIG'
          : '3. RELEASE BOLT & CHAMBER ROUND';

      el.style.borderColor = this.player.fastReload ? '#e67e22' : '#f1c40f';
      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <span style="font-size:11.5px;font-weight:900;color:${this.player.fastReload ? '#ff9f43' : '#f1c40f'};letter-spacing:0.6px;">
            ${this.player.fastReload ? '⚡ EMERGENCY DROP RELOAD' : '🔄 FAST MAG-SWAP RELOAD [R]'}
          </span>
          <span style="font-size:10.5px;font-weight:900;color:#7bed9f;">${Math.round(pct * 100)}%</span>
        </div>
        <svg viewBox="0 0 280 76" style="width:100%;height:72px;display:block;background:rgba(6,10,16,0.75);border-radius:4px;border:1px solid rgba(255,255,255,0.08);">
          <!-- Receiver & Barrel Cutaway Silhouette -->
          <rect x="65" y="14" width="125" height="18" rx="2" fill="#2c3e50" stroke="#74b9ff" stroke-width="1.2"/>
          <rect x="190" y="19" width="62" height="7" rx="1" fill="#34495e" stroke="#74b9ff" stroke-width="1"/>
          <rect x="34" y="16" width="31" height="14" rx="2" fill="#1e272e" stroke="#576574" stroke-width="1"/>
          <!-- Magwell Housing -->
          <path d="M118 32 L144 32 L141 44 L116 44 Z" fill="#1e272e" stroke="#74b9ff" stroke-width="1"/>

          <!-- Animated Bolt Carrier & Chambering Brass Round -->
          <g transform="translate(${-boltX}, 0)">
            <rect x="108" y="16" width="34" height="8" rx="1.5" fill="${stage === 3 ? '#2ecc71' : '#95a5a6'}" stroke="#111" stroke-width="1"/>
            <line x1="108" y1="12" x2="116" y2="16" stroke="#f1c40f" stroke-width="2"/>
          </g>
          ${
            stage >= 2
              ? `<g transform="translate(${-chamberRoundX}, 0)">
                  <rect x="132" y="20" width="11" height="4" rx="1" fill="#f1c40f"/>
                  <polygon points="143,20 149,22 143,24" fill="#e67e22"/>
                </g>`
              : ''
          }

          <!-- Stage 1: Ejecting Old Magazine (Slides Down & Out) -->
          <g transform="translate(88, ${oldMagY}) rotate(${Math.round(s1 * 16)})" opacity="${oldMagOp}">
            <rect x="0" y="0" width="16" height="28" rx="2" fill="#3d3d3d" stroke="#e74c3c" stroke-width="1.2"/>
            <text x="2" y="18" fill="#ff7675" font-size="7.5" font-weight="900">OLD</text>
          </g>

          <!-- Stage 2: Fresh Brass-Topped Magazine Rising into Magwell -->
          <g transform="translate(121, ${newMagY})">
            <rect x="0" y="0" width="18" height="30" rx="2" fill="#22313f" stroke="#2ecc71" stroke-width="1.5"/>
            <!-- Stacked Brass Cartridges in Fresh Mag -->
            <rect x="3" y="2" width="12" height="3.5" rx="1" fill="#f1c40f"/>
            <rect x="3" y="7" width="12" height="3.5" rx="1" fill="#f1c40f"/>
            <rect x="3" y="12" width="12" height="3.5" rx="1" fill="#f1c40f"/>
            <rect x="3" y="17" width="12" height="3.5" rx="1" fill="#f1c40f"/>
          </g>

          <!-- Stage Callout Text -->
          <text x="10" y="69" fill="#f1c40f" font-size="9.5" font-weight="900" font-family="Rajdhani, sans-serif">${stageTitle}</text>
        </svg>
      `;
    } else if (this.player.slowReloading) {
      const bp = Math.max(0, Math.min(1, this.player.magPackProgress || 0));
      const pressY = Math.round(bp * 16);
      const bestRigMag = cur.mags && cur.mags.length > 0 ? cur.mags[0] : 0;
      const targetRounds = cur.clip < cur.def.clipSize ? cur.clip : bestRigMag;
      const targetMax = cur.def.clipSize || 30;
      const fillRatio = Math.max(0, Math.min(1, targetRounds / targetMax));
      const visibleStackCount = Math.max(1, Math.min(6, Math.ceil(fillRatio * 6)));

      let stackSvg = '';
      for (let i = 0; i < visibleStackCount; i++) {
        const ry = 56 - i * 6 + Math.round(bp * 3);
        stackSvg += `
          <g transform="translate(202, ${ry})">
            <rect x="0" y="0" width="22" height="4.5" rx="1.5" fill="#f1c40f" stroke="#b7950b" stroke-width="0.6"/>
            <polygon points="22,0 28,2.25 22,4.5" fill="#e67e22"/>
          </g>
        `;
      }

      el.style.borderColor = '#2ecc71';
      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <span style="font-size:11.5px;font-weight:900;color:#7bed9f;letter-spacing:0.6px;">
            🎒 TARKOV SLOW RELOAD — PRESSING BULLETS [P]
          </span>
          <span style="font-size:10.5px;font-weight:900;color:#f1c40f;">+${this.player.slowReloadRoundsPacked || 0} RDS PACKED</span>
        </div>
        <svg viewBox="0 0 280 76" style="width:100%;height:72px;display:block;background:rgba(6,10,16,0.75);border-radius:4px;border:1px solid rgba(255,255,255,0.08);">
          <!-- Cutaway Magazine Body -->
          <rect x="196" y="22" width="38" height="48" rx="3" fill="#18222c" stroke="#2ecc71" stroke-width="1.6"/>
          <!-- Magazine Follower Spring at Bottom -->
          <polyline points="202,67 228,64 202,61 228,58" fill="none" stroke="#95a5a6" stroke-width="1.4"/>

          <!-- Stacked Brass Cartridges Inside Magazine -->
          ${stackSvg}

          <!-- Animated Thumb + Loose Brass Cartridge Pressing Down into Feed Lips -->
          <g transform="translate(200, ${4 + pressY})">
            <!-- Gloved Thumb Pressing Down -->
            <rect x="-14" y="-6" width="24" height="9" rx="4" fill="#2ecc71" opacity="0.85"/>
            <!-- Gleaming Brass Cartridge Being Pressed In -->
            <rect x="2" y="4" width="22" height="5" rx="1.5" fill="#ffeaa7" stroke="#f1c40f" stroke-width="1"/>
            <polygon points="24,4 31,6.5 24,9" fill="#e67e22"/>
          </g>

          <!-- Live Telemetry Callouts -->
          <text x="12" y="30" fill="#7bed9f" font-size="10.5" font-weight="900" font-family="Rajdhani, sans-serif">MAG FILL: ${targetRounds} / ${targetMax} RDS</text>
          <text x="12" y="47" fill="#f1c40f" font-size="10" font-weight="900" font-family="Rajdhani, sans-serif">🎒 LOOSE POOL: ${cur.looseAmmo || 0} RDS</text>
          <text x="12" y="64" fill="#95a5a6" font-size="8.5" font-weight="800" font-family="Rajdhani, sans-serif">[LMB] FIRE NOW • [R] FAST SWAP</text>
        </svg>
      `;
    }
  },

  updateMagBars(cur) {
    if (!this.magBarsRowEl) return;
    if (!cur.mags || cur.def.clipSize <= 1) {
      if (this._lastMagSignature !== 'EMPTY') {
        this._lastMagSignature = 'EMPTY';
        this.magBarsRowEl.innerHTML = '';
      }
      return;
    }
    const looseCount = cur.looseAmmo || 0;
    const sig = `${cur.def.name}:${cur.clip}:${cur.reserve}:${looseCount}:${cur.mags.join(',')}`;
    if (sig === this._lastMagSignature) return;
    this._lastMagSignature = sig;
    // Render active clip + Chest Rig reserve magazines (including 0-round empty mags!) + Backpack Loose Bullets badge
    const allMags = [
      { count: cur.clip, active: true },
      ...cur.mags.map((m) => ({ count: m, active: false }))
    ];
    const magPillsHtml = allMags
      .map((m) => {
        const pct = Math.max(0, Math.min(100, Math.round((m.count / cur.def.clipSize) * 100)));
        const isEmpty = m.count <= 0;
        const fillCol = pct < 35 ? '#e74c3c' : m.active ? '#2ecc71' : '#f1c40f';
        const borderCol = m.active
          ? '#2ecc71'
          : isEmpty
          ? 'rgba(231, 76, 60, 0.75)'
          : 'rgba(255,255,255,0.28)';
        return `<div class="mag-pill" title="${m.active ? 'Active Mag' : 'Chest Rig Mag'}: ${m.count}/${cur.def.clipSize} Rds" style="border-color:${borderCol};${isEmpty ? 'border-style:dashed;' : ''}"><div class="mag-pill-fill" style="height:${pct}%;background:${fillCol}"></div></div>`;
      })
      .join('');

    const looseBadgeHtml = `
      <div onclick="window.game && window.game.ui && window.game.ui.toggleBackpackModal && window.game.ui.toggleBackpackModal()" style="margin-left:5px;padding:1px 5px;background:rgba(16,26,36,0.9);border:1px solid ${
        looseCount > 0 ? 'rgba(46,204,113,0.65)' : 'rgba(231,76,60,0.55)'
      };border-radius:3px;font-size:9.5px;font-weight:900;color:${
        looseCount > 0 ? '#7bed9f' : '#ff7675'
      };display:flex;align-items:center;gap:3px;white-space:nowrap;cursor:pointer;pointer-events:auto;" title="Click or press [I] to open Visualized 2D Backpack • Press [P] or Hold [R] for Tarkov Slow Reload">
        🎒 +${looseCount} LOOSE [P / I]
      </div>
    `;
    this.magBarsRowEl.innerHTML = magPillsHtml + looseBadgeHtml;
  },

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
};

export default HudRenderer;
