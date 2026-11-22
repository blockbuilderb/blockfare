import { SQUAD_DEFS } from '../bots.js?v=110';

export const Scoreboard = {
  computeBattleStats() {
    const usUnits = [];
    const ruUnits = [];

    const selfPlanes = this.player.planesDestroyed || 0;
    const selfTanks = this.player.tanksDestroyed || 0;
    const selfCars = this.player.carsDestroyed || 0;
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
      planesDestroyed: selfPlanes,
      tanksDestroyed: selfTanks,
      carsDestroyed: selfCars,
      vehiclesDestroyed: this.player.vehiclesDestroyed || selfPlanes + selfTanks + selfCars,
      captures: this.player.captures || 0,
      score: this.player.score || 0,
      isSelf: true
    };

    if (this.player.team === 'US') usUnits.push(selfEntry);
    else ruUnits.push(selfEntry);

    for (const rp of this.network.remotePlayers.values()) {
      const rpPlanes = rp.planesDestroyed || 0;
      const rpTanks = rp.tanksDestroyed || 0;
      const rpCars = rp.carsDestroyed || 0;
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
        planesDestroyed: rpPlanes,
        tanksDestroyed: rpTanks,
        carsDestroyed: rpCars,
        vehiclesDestroyed: rp.vehiclesDestroyed || rpPlanes + rpTanks + rpCars,
        captures: rp.captures || 0,
        score: rp.score || 0
      };
      if (rp.team === 'US') usUnits.push(entry);
      else ruUnits.push(entry);
    }

    for (const b of this.botManager.bots) {
      const bPlanes = b.planesDestroyed || 0;
      const bTanks = b.tanksDestroyed || 0;
      const bCars = b.carsDestroyed || 0;
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
        planesDestroyed: bPlanes,
        tanksDestroyed: bTanks,
        carsDestroyed: bCars,
        vehiclesDestroyed: b.vehiclesDestroyed || bPlanes + bTanks + bCars,
        captures: b.captures || 0,
        score: b.score || 0
      };
      if (b.team === 'US') usUnits.push(entry);
      else ruUnits.push(entry);
    }

    usUnits.sort((a, b) => b.score - a.score || b.kills - a.kills);
    ruUnits.sort((a, b) => b.score - a.score || b.kills - a.kills);

    const sumTeam = (arr, team) => {
      let flags = 0;
      for (let i = 0; i < this.world.flags.length; i++) {
        if (this.world.flags[i].owner === team) flags++;
      }
      let kills = 0;
      let deaths = 0;
      let revives = 0;
      let medicKills = 0;
      let planes = 0;
      let tanks = 0;
      let cars = 0;
      let vehicles = 0;
      let score = 0;
      for (let i = 0; i < arr.length; i++) {
        const u = arr[i];
        kills += u.kills;
        deaths += u.deaths;
        revives += u.revives;
        medicKills += u.medicKills || 0;
        planes += u.planesDestroyed || 0;
        tanks += u.tanksDestroyed || 0;
        cars += u.carsDestroyed || 0;
        vehicles += u.vehiclesDestroyed;
        score += u.score;
      }
      return {
        team,
        tickets: Math.max(0, Math.floor(team === 'US' ? this.lastTicketsUS : this.lastTicketsRU)),
        flags,
        kills,
        deaths,
        revives,
        medicKills,
        planes,
        tanks,
        cars,
        vehicles,
        score
      };
    };

    const usStats = sumTeam(usUnits, 'US');
    const ruStats = sumTeam(ruUnits, 'RU');

    // Compute all 12 Tactical Squads (US ALPHA..FALCON & RU ALPHA..FALCON)
    const allUnits = [...usUnits, ...ruUnits];
    const squads = [];
    for (const team of ['US', 'RU']) {
      for (const sqDef of SQUAD_DEFS) {
        const members = allUnits.filter((u) => u.team === team && u.squad === sqDef.id);
        const sqKills = members.reduce((s, u) => s + u.kills, 0);
        const sqRevives = members.reduce((s, u) => s + u.revives, 0);
        const sqMedicKills = members.reduce((s, u) => s + (u.medicKills || 0), 0);
        const sqPlanes = members.reduce((s, u) => s + (u.planesDestroyed || 0), 0);
        const sqTanks = members.reduce((s, u) => s + (u.tanksDestroyed || 0), 0);
        const sqCars = members.reduce((s, u) => s + (u.carsDestroyed || 0), 0);
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
          planes: sqPlanes,
          tanks: sqTanks,
          cars: sqCars,
          vehicles: sqVehicles,
          score: sqScore,
          hasPlayer
        });
      }
    }
    squads.sort((a, b) => b.score - a.score || b.kills - a.kills);

    return { usUnits, ruUnits, usStats, ruStats, squads, allUnits };
  },

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
      spentArmor: 0,
      spentPlanes: 0
    };
    const ruTStat = (this.ticketStats && this.ticketStats.RU) || {
      gainedCapture: 0,
      lostFlags: 0,
      lostBleed: 0,
      spentSoldiers: 0,
      spentCars: 0,
      spentArmor: 0,
      spentPlanes: 0
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
          <span class="side-metric-pill" style="color:#00d2d3;border-color:rgba(0,210,211,0.45)">✈️ PLANES DOWNED: ${usStats.planes}</span>
          <span class="side-metric-pill" style="color:#f39c12;border-color:rgba(243,156,18,0.45)">🛡️ TANKS/IFV KILLED: ${usStats.tanks}</span>
          <span class="side-metric-pill" style="color:#ffeaa7;border-color:rgba(241,196,15,0.4)">🚙 CARS KILLED: ${usStats.cars}</span>
          <span class="side-metric-pill" style="color:#2ecc71;border-color:rgba(46,204,113,0.45)">🎟️ +${usTStat.gainedCapture} CAP / -${usTStat.lostFlags || 0} FLG • -${usTStat.spentSoldiers} INF / -${usTStat.spentCars} CAR / -${usTStat.spentArmor} TNK / -${usTStat.spentPlanes || 0} AIR / -${Math.floor(usTStat.lostBleed || 0)} BLD</span>
          <span class="side-metric-pill" style="color:#ff7675;border-color:rgba(231,76,60,0.45)">⚠️ WAR CRIMES: ${usStats.medicKills}</span>
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
          <span class="side-metric-pill" style="color:#00d2d3;border-color:rgba(0,210,211,0.45)">✈️ PLANES DOWNED: ${ruStats.planes}</span>
          <span class="side-metric-pill" style="color:#f39c12;border-color:rgba(243,156,18,0.45)">🛡️ TANKS/IFV KILLED: ${ruStats.tanks}</span>
          <span class="side-metric-pill" style="color:#ffeaa7;border-color:rgba(241,196,15,0.4)">🚙 CARS KILLED: ${ruStats.cars}</span>
          <span class="side-metric-pill" style="color:#2ecc71;border-color:rgba(46,204,113,0.45)">🎟️ +${ruTStat.gainedCapture} CAP / -${ruTStat.lostFlags || 0} FLG • -${ruTStat.spentSoldiers} INF / -${ruTStat.spentCars} CAR / -${ruTStat.spentArmor} TNK / -${ruTStat.spentPlanes || 0} AIR / -${Math.floor(ruTStat.lostBleed || 0)} BLD</span>
          <span class="side-metric-pill" style="color:#ff7675;border-color:rgba(231,76,60,0.45)">⚠️ WAR CRIMES: ${ruStats.medicKills}</span>
        </div>
      </div>
    `;
  },

  buildSquadLeaderboardHtml(squads) {
    return squads
      .slice(0, 6)
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
            <span>${sq.kills}K &bull; ${sq.revives}REV &bull; ✈️${sq.planes} 🛡️${sq.tanks} 🚙${sq.cars} &bull; <span style="color:#ff7675">⚠️${sq.medicKills}CRM</span></span>
            <span class="sq-score-val">${sq.score.toLocaleString()} PTS</span>
          </div>
        </div>
      `
      )
      .join('');
  },

  renderScoreboard(force = false) {
    const now = performance.now();
    if (!force && this._lastScoreboardRenderAt && now - this._lastScoreboardRenderAt < 250) {
      return;
    }
    this._lastScoreboardRenderAt = now;
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

    const MAX_RENDERED_ROWS = 40;
    const renderUnitRow = (u, idx) =>
      `<tr class="${u.isSelf ? 'self-row' : idx === 0 ? 'mvp-row' : ''}">
        <td>${idx === 0 ? '★1' : idx + 1}</td>
        <td>${u.name}${u.isSelf ? ' (YOU)' : ''}</td>
        <td><span class="sq-pill">${u.squadShort}</span></td>
        <td>${u.role.slice(0, 4)}</td>
        <td>${u.kills}</td>
        <td>${u.deaths}</td>
        <td>${u.revives}</td>
        <td style="color:${(u.planesDestroyed || 0) > 0 ? '#00d2d3' : '#7f8c8d'};font-weight:${(u.planesDestroyed || 0) > 0 ? '800' : '400'}">${u.planesDestroyed || 0}</td>
        <td style="color:${(u.tanksDestroyed || 0) > 0 ? '#f39c12' : '#7f8c8d'};font-weight:${(u.tanksDestroyed || 0) > 0 ? '800' : '400'}">${u.tanksDestroyed || 0}</td>
        <td style="color:${(u.carsDestroyed || 0) > 0 ? '#ffeaa7' : '#7f8c8d'};font-weight:${(u.carsDestroyed || 0) > 0 ? '800' : '400'}">${u.carsDestroyed || 0}</td>
        <td style="color:${u.medicKills > 0 ? '#ff6b6b' : '#7f8c8d'};font-weight:${
        u.medicKills > 0 ? '800' : '400'
      }">${u.medicKills || 0}</td>
        <td><strong>${u.score.toLocaleString()}</strong></td>
      </tr>`;

    const renderRows = (units) => {
      if (units.length <= MAX_RENDERED_ROWS) {
        return units.map((u, idx) => renderUnitRow(u, idx)).join('');
      }
      const topHtml = units
        .slice(0, MAX_RENDERED_ROWS)
        .map((u, idx) => renderUnitRow(u, idx))
        .join('');
      const selfIdx = units.findIndex((u) => u.isSelf);
      const selfRowHtml =
        selfIdx >= MAX_RENDERED_ROWS ? renderUnitRow(units[selfIdx], selfIdx) : '';
      const hiddenCount =
        units.length - MAX_RENDERED_ROWS - (selfIdx >= MAX_RENDERED_ROWS ? 1 : 0);
      const footerHtml =
        hiddenCount > 0
          ? `<tr style="opacity:0.75;font-size:11px;text-align:center;"><td colspan="12" style="padding:6px;color:#95a5a6;">+ ${hiddenCount} MORE SOLDIERS DEPLOYED ON THIS FACTION (${units.length} TOTAL)</td></tr>`
          : '';
      return topHtml + selfRowHtml + footerHtml;
    };

    this.sbUsBody.innerHTML = renderRows(usUnits);
    this.sbRuBody.innerHTML = renderRows(ruUnits);
  }
};

export default Scoreboard;
