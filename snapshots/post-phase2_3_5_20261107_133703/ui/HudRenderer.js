import { UI } from '../config.js?v=35';

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
      this.armorBadgeEl.textContent = `ARMOR: ${Math.ceil(this.player.armor)}/${
        this.player.maxArmor || 50
      }`;
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
      const slotEl = this.el(`slot-${i + 1}`);
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
      const cmdMapCanvas = this.el('cmd-tactical-map-canvas');
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
  },

  // Kill Streak HUD Badge (bottom-right corner, shows active streak)
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
      el.textContent = `🔥 STREAK: ${this.player.killStreak}`;
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
