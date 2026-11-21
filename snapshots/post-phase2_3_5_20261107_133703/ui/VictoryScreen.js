export const VictoryScreen = {
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
  },

  hideVictoryScreen() {
    if (this.victoryScreenEl) {
      this.victoryScreenEl.classList.add('hidden');
    }
  }
};

export default VictoryScreen;
