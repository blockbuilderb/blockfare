import { getFactionLabel } from '../config.js?v=150';

export const VictoryScreen = {
  showVictoryScreen(winnerTeam, ticketsUS, ticketsRU, matchTimeRemaining, extraction = null) {
    this.lastTicketsUS = ticketsUS;
    this.lastTicketsRU = ticketsRU;
    this.lastMatchTime = matchTimeRemaining;
    const activeEra = (this.world && this.world.era) || 'modern';
    const usShort = getFactionLabel('US', activeEra, 'short');
    const ruShort = getFactionLabel('RU', activeEra, 'short');

    const { usStats, ruStats, squads, allUnits } = this.computeBattleStats();
    if (!this.victoryScreenEl) return;

    this.victoryScreenEl.classList.remove('hidden');
    this.scoreboardEl.classList.add('hidden');
    this.syncAdminControlsUI?.();

    const reason =
      ticketsUS <= 0 || ticketsRU <= 0
        ? 'CONQUEST VICTORY — ENEMY REINFORCEMENT TICKETS DEPLETED'
        : 'CONQUEST VICTORY — TIME LIMIT REACHED';
    if (this.victoryReasonTagEl) this.victoryReasonTagEl.textContent = reason;
    if (this.victoryTitleEl) {
      this.victoryTitleEl.textContent = `${getFactionLabel(winnerTeam, activeEra, 'forces')} VICTORY`;
      this.victoryTitleEl.style.color = winnerTeam === 'US' ? '#5dade2' : '#ec7063';
    }
    if (this.victoryScorelineEl) {
      this.victoryScorelineEl.textContent = `FINAL TICKETS: ${usShort} ${Math.max(
        0,
        Math.floor(ticketsUS)
      )} — ${ruShort} ${Math.max(0, Math.floor(ticketsRU))} • TOTAL KILLS: ${
        usStats.kills + ruStats.kills
      } • TOTAL REVIVES: ${usStats.revives + ruStats.revives}`;
    }

    const ext =
      extraction ||
      (this.player && this.player.lastMatchExtraction) ||
      (this.player && typeof this.player.settleMatchToWarehouse === 'function'
        ? this.player.settleMatchToWarehouse(winnerTeam)
        : null);

    if (this.victorySideSummaryEl) {
      const renderVictoryExtractionAndLoot = () => {
        const curWhCash =
          this.player && typeof this.player.warehouseCash === 'number'
            ? this.player.warehouseCash
            : ext?.newWarehouseBalance || 0;
        const extractedLoot = Array.isArray(this.player?.extractedRoundLoot)
          ? this.player.extractedRoundLoot
          : [];
        const savedWhCount = Array.isArray(this.player?.warehouseStashItems)
          ? this.player.warehouseStashItems.length
          : 0;
        const totalSellVal = extractedLoot.reduce(
          (sum, it) => sum + Math.max(50, Math.round(it.sellPrice || 150)),
          0
        );

        const extractionBannerHtml = ext
          ? `
            <div style="background:linear-gradient(90deg, rgba(241,196,15,0.16), rgba(46,204,113,0.16));border:1.5px solid #f1c40f;border-radius:6px;padding:10px 14px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
              <div>
                <div style="font-size:13px;font-weight:900;color:#f1c40f;letter-spacing:1px;">
                  🏦 WAREHOUSE EXTRACTION &amp; PAYOUT SUMMARY (${
                    ext.isVictory ? '1.5X VICTORY MULTIPLIER!' : '1.15X COMBAT VETERAN BONUS'
                  })
                </div>
                <div style="font-size:11.5px;color:#ecf0f1;margin-top:3px;">
                  Unspent Match Cash: <b style="color:#74b9ff;">$${(
                    ext.matchCashLeft || 0
                  ).toLocaleString()}</b>
                  &nbsp;•&nbsp; Combat Performance Bonus: <b style="color:#7bed9f;">+$${(
                    ext.perfBonus || 0
                  ).toLocaleString()}</b>
                  &nbsp;•&nbsp; Multiplier Bonus: <b style="color:#f1c40f;">+$${(
                    ext.victoryBonus || 0
                  ).toLocaleString()}</b>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:10px;">
                <div style="text-align:right;">
                  <div style="font-size:14px;font-weight:900;color:#2ecc71;">+$${(
                    ext.totalDeposited || 0
                  ).toLocaleString()} DEPOSITED</div>
                  <div style="font-size:11.5px;color:#f1c40f;font-weight:900;">🏦 WAREHOUSE VAULT: $${curWhCash.toLocaleString()}</div>
                </div>
                <button id="victory-open-warehouse-btn" type="button" style="background:#f39c12;color:#111;border:none;border-radius:4px;padding:7px 12px;font-size:11px;font-weight:900;cursor:pointer;letter-spacing:0.6px;">
                  🏛️ OPEN PERSONAL WAREHOUSE [I]
                </button>
              </div>
            </div>
          `
          : '';

        const lootCardsHtml = extractedLoot
          .map(
            (it) => `
            <div style="background:rgba(14,24,36,0.96);border:1.5px solid ${
              it.type === 'weapon' ? '#f1c40f' : 'rgba(46,204,113,0.55)'
            };border-radius:6px;padding:8px 10px;display:flex;flex-direction:column;justify-content:space-between;gap:6px;">
              <div>
                <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
                  <span style="font-size:11.5px;font-weight:900;color:${
                    it.type === 'weapon' ? '#f1c40f' : '#7bed9f'
                  };">${it.icon || '📦'} ${it.name}</span>
                  <span style="background:rgba(255,255,255,0.1);color:#dfe6e9;font-size:9px;font-weight:900;padding:2px 6px;border-radius:3px;">${
                    it.grid || '1×1'
                  }</span>
                </div>
                <div style="font-size:9.5px;color:#bdc3c7;margin-top:2px;">From: ${
                  it.ownerLabel || 'Fallen Enemy'
                }</div>
                <div style="font-size:9px;color:#74b9ff;font-weight:800;margin-top:2px;">🏛️ Save: ${
                  it.saveSummary || 'Stores in Personal Warehouse'
                }</div>
              </div>
              <div style="display:flex;gap:5px;">
                <button type="button" class="vic-sell-loot-btn" data-uid="${
                  it.uid
                }" style="flex:1;background:#27ae60;color:#fff;border:none;border-radius:4px;padding:5px 8px;font-size:10px;font-weight:900;cursor:pointer;">
                  💵 SELL (+$${it.sellPrice || 150})
                </button>
                <button type="button" class="vic-save-loot-btn" data-uid="${
                  it.uid
                }" style="flex:1.15;background:#2980b9;color:#fff;border:none;border-radius:4px;padding:5px 8px;font-size:10px;font-weight:900;cursor:pointer;">
                  🏛️ SAVE TO WAREHOUSE
                </button>
              </div>
            </div>
          `
          )
          .join('');

        const postRoundLootPanelHtml = `
          <div id="victory-loot-sorting-panel" style="background:rgba(10,18,28,0.96);border:1.5px solid #2ecc71;border-radius:6px;padding:10px 14px;margin-bottom:10px;">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
              <div>
                <div style="font-size:12.5px;font-weight:900;color:#2ecc71;letter-spacing:0.7px;">
                  🎒 ABI BETWEEN-ROUNDS LOOT EXTRACTION — SELL FOR MONEY OR SAVE IN PERSONAL WAREHOUSE
                </div>
                <div style="font-size:10.5px;color:#bdc3c7;">
                  ${
                    extractedLoot.length > 0
                      ? `You extracted <b>${extractedLoot.length} scavenged items</b> from the round! Sell them for instant <b>Warehouse Vault Cash</b> or save them into your <b>Personal Warehouse Stash (${savedWhCount} stored)</b>.`
                      : `All extracted round loot has been sorted! (<b>${savedWhCount} items</b> currently stored in your Personal Warehouse Stash • Vault Balance: <b style="color:#f1c40f;">$${curWhCash.toLocaleString()}</b>)`
                  }
                </div>
              </div>
              ${
                extractedLoot.length > 0
                  ? `
                    <div style="display:flex;gap:6px;flex-wrap:wrap;">
                      <button type="button" id="vic-sell-all-loot-btn" style="background:#27ae60;color:#fff;border:none;border-radius:4px;padding:6px 11px;font-size:10.5px;font-weight:900;cursor:pointer;">
                        💵 SELL ALL LOOT (+$${totalSellVal.toLocaleString()} VAULT)
                      </button>
                      <button type="button" id="vic-save-all-loot-btn" style="background:#2980b9;color:#fff;border:none;border-radius:4px;padding:6px 11px;font-size:10.5px;font-weight:900;cursor:pointer;">
                        🏛️ SAVE ALL TO PERSONAL WAREHOUSE (${extractedLoot.length})
                      </button>
                    </div>
                  `
                  : ''
              }
            </div>
            ${
              extractedLoot.length > 0
                ? `<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(240px, 1fr));gap:8px;">${lootCardsHtml}</div>`
                : ''
            }
          </div>
        `;

        this.victorySideSummaryEl.innerHTML =
          extractionBannerHtml +
          postRoundLootPanelHtml +
          this.buildSideComparisonHtml(usStats, ruStats);

        const openWhBtn = this.victorySideSummaryEl.querySelector('#victory-open-warehouse-btn');
        if (openWhBtn && typeof this.toggleGunsmithModal === 'function') {
          openWhBtn.addEventListener('click', () => {
            this._gunsmithActiveTab = 'warehouse';
            this.toggleGunsmithModal(true);
          });
        }

        this.victorySideSummaryEl.querySelectorAll('.vic-sell-loot-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            this.player?.sellExtractedLootItem?.(btn.dataset.uid);
            this.updateCashAndGunsmithHud?.();
            renderVictoryExtractionAndLoot();
          });
        });

        this.victorySideSummaryEl.querySelectorAll('.vic-save-loot-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            this.player?.saveExtractedLootItemToWarehouse?.(btn.dataset.uid);
            this.updateCashAndGunsmithHud?.();
            renderVictoryExtractionAndLoot();
          });
        });

        const sellAllBtn = this.victorySideSummaryEl.querySelector('#vic-sell-all-loot-btn');
        if (sellAllBtn) {
          sellAllBtn.addEventListener('click', () => {
            this.player?.sellAllExtractedLoot?.();
            this.updateCashAndGunsmithHud?.();
            renderVictoryExtractionAndLoot();
          });
        }

        const saveAllBtn = this.victorySideSummaryEl.querySelector('#vic-save-all-loot-btn');
        if (saveAllBtn) {
          saveAllBtn.addEventListener('click', () => {
            this.player?.saveAllExtractedLootToWarehouse?.();
            this.updateCashAndGunsmithHud?.();
            renderVictoryExtractionAndLoot();
          });
        }
      };

      renderVictoryExtractionAndLoot();
    }
    if (this.victorySquadSummaryEl) {
      this.victorySquadSummaryEl.innerHTML = this.buildSquadLeaderboardHtml(squads);
    }

    if (this.victoryMvpCardsEl) {
      const mvpOverall = [...allUnits].sort((a, b) => b.score - a.score)[0];
      const topMedic = [...allUnits].sort((a, b) => b.revives - a.revives || b.score - a.score)[0];
      const topAce = [...allUnits].sort(
        (a, b) => (b.planesDestroyed || 0) - (a.planesDestroyed || 0) || b.score - a.score
      )[0];
      const topAt = [...allUnits].sort(
        (a, b) =>
          (b.tanksDestroyed || 0) * 2 +
            (b.carsDestroyed || 0) -
            ((a.tanksDestroyed || 0) * 2 + (a.carsDestroyed || 0)) || b.score - a.score
      )[0];
      const topKiller = [...allUnits].sort((a, b) => b.kills - a.kills || b.score - a.score)[0];
      const topWarCriminal = [...allUnits].sort(
        (a, b) => (b.medicKills || 0) - (a.medicKills || 0) || b.kills - a.kills
      )[0];

      const cards = [
        {
          title: '★ MOST VALUABLE SOLDIER',
          unit: mvpOverall,
          stat: `${mvpOverall ? mvpOverall.score.toLocaleString() : 0} PTS (${getFactionLabel(
            mvpOverall ? mvpOverall.team : 'US',
            activeEra,
            'short'
          )} ${mvpOverall ? mvpOverall.squad : 'ALPHA'})`
        },
        {
          title: '+ TOP FIELD MEDIC',
          unit: topMedic,
          stat: `${topMedic ? topMedic.revives : 0} FALLEN COMRADES SAVED`
        },
        {
          title: '✈️ TOP SKY ACE / ANTI-AIR',
          unit: topAce,
          stat: `${topAce ? topAce.planesDestroyed || 0 : 0} AIRCRAFT SHOT DOWN`
        },
        {
          title: '🛡️ TOP ANTI-ARMOR HUNTER',
          unit: topAt,
          stat: `${topAt ? topAt.tanksDestroyed || 0 : 0} TANKS/IFV • ${topAt ? topAt.carsDestroyed || 0 : 0} CARS DESTROYED`
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
