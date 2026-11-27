import {
  WEAPON_DEFS,
  ATTACHMENT_CATALOG,
  CLASS_LOADOUTS,
  CASE_PRICE,
  CASE_GOLD_CHANCE,
  CASE_GUN_POOL,
  GOLD_SPECIAL_POOL
} from '../weapons.js?v=143';
import { CLASS_META, WEAPON_GRID_SIZES, buildWeaponSvg, buildGearSvg } from '../assets/gunsmith-svg.js?v=143';
import { FIELD_REQUISITIONS, VEHICLE_UPGRADE_CATALOG } from '../player/GunsmithState.js?v=143';
import { B2_COLOR_PRESETS } from '../models/vehicle-model.js?v=143';
import { AIRCRAFT_SPEED_RESEARCH } from '../assets/vehicle-defs.js?v=143';
import { getAllowedRoleIds, resolveRoleForEra, ECONOMY, VEHICLE_STATS } from '../config.js?v=143';
import { sound } from '../audio.js?v=143';
import {
  ARMORY_CASE_STATES,
  ARMORY_CASE_EVENTS,
  createArmoryCaseRouletteFSM
} from '../core/StateMachines.js?v=143';

export const GunsmithModal = {
  formatCashAmount(val) {
    const num = typeof val === 'number' && Number.isFinite(val) ? val : 0;
    const hasCents = Math.abs(num - Math.round(num)) > 0.001;
    return hasCents
      ? num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : num.toLocaleString('en-US');
  },

  // ─── GUNSMITH, PERSONAL WAREHOUSE & FIELD ECONOMY HUB ([I] Key or HUD / Deploy Button) ──
  updateCashAndGunsmithHud() {
    if (this.player && typeof this.player.syncTotalCash === 'function') {
      this.player.syncTotalCash();
    }
    const matchCash =
      this.player && typeof this.player.matchCash === 'number'
        ? this.player.matchCash
        : ECONOMY.STARTING_MATCH_CASH || 50;
    const whCash =
      this.player && typeof this.player.warehouseCash === 'number'
        ? this.player.warehouseCash
        : 100000;

    const matchStr = this.formatCashAmount(Math.floor(matchCash));
    const whStr = this.formatCashAmount(Math.floor(whCash));

    if (this.hudCashValEl) {
      this.hudCashValEl.textContent = `⚡$${matchStr} • 🏦$${whStr}`;
    }
    if (this.deployCashValEl) {
      this.deployCashValEl.textContent = `🏦 $${whStr}`;
    }
    if (this.ammoGunsmithBtnEl) {
      this.ammoGunsmithBtnEl.textContent = `🔧 [L] ARMORY (🏦$${whStr})`;
    }
    this.updateFriendlyFireUI?.();
    this.renderDeployExtractedLootBar();
    this.renderDeployB2CustomizerBar();
    const modal = this.el('gunsmith-modal');
    if (modal && !modal.classList.contains('hidden')) {
      this.renderGunsmithModalContent(modal);
    }
  },

  /**
   * Minimal 1-Click Collapsible Vehicle Requisition Bar on `#deploy-screen`:
   * - Replaces the old always-open B-2 livery bar (B-2 livery lives inside `[L] Armory -> Vehicles`).
   * - Collapsed to a sleek 1-line pill by default; 1 click expands role-matched paid vehicles:
   *   • Infantry: On Foot ($0), Dirt Bike (⚡$250), 4×4 Quad ATV (⚡$350)
   *   • Armor Crew: On Foot ($0), Humvee (⚡$450), 8×8 IFV (⚡$850), SPAAG AA (⚡$950), MBT Tank (⚡$1,400)
   *   • Combat Pilot: On Foot ($0), 1903 Flyer (⚡$300), A-10 CAS (⚡$1,100), F-15 Fighter (⚡$1,350), AC-130 (⚡$2,200), B-2 Spirit (⚡$3,200 + 25K)
   */
  renderDeployB2CustomizerBar() {
    if (!this.deployScreenEl || !this.player) return;
    let bar = document.getElementById('deploy-b2-customizer-bar');
    const isModern = !this.world || !this.world.era || this.world.era === 'modern';
    if (!isModern) {
      if (bar) bar.style.display = 'none';
      return;
    }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'deploy-b2-customizer-bar';
      const gridEl = this.deployScreenEl.querySelector('.deploy-grid');
      if (gridEl && gridEl.parentNode) {
        gridEl.parentNode.insertBefore(bar, gridEl);
      } else {
        this.deployScreenEl.appendChild(bar);
      }
    }

    const cls = this.selectedClass || 'engineer';
    const isPilot = cls === 'pilot';
    const isArmor = cls === 'armor';
    const team = this.selectedTeam || 'US';
    const isRU = team === 'RU';
    const matchCash = Math.floor(this.player.matchCash ?? (ECONOMY.STARTING_MATCH_CASH || 50));
    const kills = this.vehicleManager?.getTeamKills ? this.vehicleManager.getTeamKills(team) : 0;
    const reqKills = VEHICLE_STATS.B2_UNLOCK_KILLS || 25;
    const b2Unlocked = this.vehicleManager?.isB2UnlockedForTeam
      ? this.vehicleManager.isB2UnlockedForTeam(team)
      : kills >= reqKills;

    const options = isPilot
      ? [
          { key: 'foot', icon: '🥾', label: 'ON FOOT', sub: 'Runway PDW' },
          {
            key: 'heli_transport',
            icon: '🚁',
            label: isRU ? 'MI-8 TERMINATOR' : 'UH-60 BLACK HAWK',
            sub: '8-Seat Rooftop'
          },
          {
            key: 'heli_attack',
            icon: '🚁',
            label: isRU ? 'KA-52 ALLIGATOR' : 'AH-64E APACHE',
            sub: isRU ? '30mm + Vikhr ATGM' : '30mm + Hellfire'
          },
          { key: 'wright_flyer', icon: '🪁', label: isRU ? '1913 MUROMETS' : '1903 FLYER', sub: 'Light Scout' },
          { key: 'cas', icon: '🐗', label: isRU ? 'SU-25SM CAS' : 'A-10C WARTHOG', sub: '30mm + Rockets' },
          { key: 'fighter', icon: '✈️', label: isRU ? 'SU-57 FELON' : 'F-15EX EAGLE', sub: 'FOX-3 + JDAM' },
          { key: 'gunship', icon: '🛸', label: isRU ? 'TU-95 GUNSHIP' : 'AC-130J GHOST', sub: '25/40/105mm' },
          {
            key: 'b2_spirit',
            icon: '🦇',
            label: isRU ? 'PAK DA STEALTH' : 'B-2A SPIRIT',
            sub: b2Unlocked ? '80× Mk82 + MOP' : `🔒 ${kills}/${reqKills} Kills`,
            killLocked: !b2Unlocked
          }
        ]
      : isArmor
      ? [
          { key: 'foot', icon: '🥾', label: 'ON FOOT', sub: 'Crew PDW + RPG' },
          {
            key: 'truck_transport',
            icon: '🚚',
            label: isRU ? 'KAMAZ 6×6 TRUCK' : 'MTV 6×6 TRUCK',
            sub: '10-Seat + Supply'
          },
          { key: 'car', icon: '🚙', label: isRU ? 'GAZ TIGR HMG' : 'HUMVEE .50', sub: 'Fast Armored' },
          { key: 'apc', icon: '🛡️', label: isRU ? 'BTR-82A IFV' : 'LAV-25 IFV', sub: '30mm Autocannon' },
          { key: 'aa', icon: '🎯', label: isRU ? 'TUNGUSKA AA' : 'LAV-AD SPAAG', sub: 'Rotary + SAM' },
          { key: 'tank', icon: '💥', label: isRU ? 'T-90M MBT' : 'M1A2 ABRAMS', sub: '120mm APFSDS' }
        ]
      : [
          { key: 'foot', icon: '🥾', label: 'ON FOOT', sub: 'Standard Kit' },
          { key: 'bike', icon: '🏍️', label: 'DIRT BIKE', sub: 'M1030M1 Enduro' },
          { key: 'atv', icon: '🛞', label: '4×4 QUAD ATV', sub: 'Polaris MV850' },
          {
            key: 'truck_transport',
            icon: '🚚',
            label: isRU ? 'KAMAZ 6×6 TRUCK' : 'MTV 6×6 TRUCK',
            sub: '10-Seat + Supply'
          },
          {
            key: 'heli_transport',
            icon: '🚁',
            label: isRU ? 'MI-8 TRANSPORT' : 'UH-60 BLACK HAWK',
            sub: '8-Seat Rooftop'
          }
        ];

    const validKeys = options.map((o) => o.key);
    if (!this.selectedDeployVehicle || !validKeys.includes(this.selectedDeployVehicle)) {
      this.selectedDeployVehicle = 'foot';
    }

    // Reset selection back to 'foot' if no longer affordable or locked
    const spawningAtMainBase = !this.selectedSpawn || this.selectedSpawn === 'BASE';
    if (this.selectedDeployVehicle !== 'foot') {
      const selOpt = options.find((o) => o.key === this.selectedDeployVehicle);
      const hasFreeBaseUnit =
        spawningAtMainBase &&
        Boolean(this.vehicleManager?.findAvailableBaseVehicle?.(team, this.selectedDeployVehicle));
      const q = this.player.getVehicleRequisitionQuote?.(this.selectedDeployVehicle) || {
        canAfford: false,
        cooldownRem: 0
      };
      if (!selOpt || selOpt.killLocked || (!hasFreeBaseUnit && (!q.canAfford || q.cooldownRem > 0))) {
        this.selectedDeployVehicle = 'foot';
      }
    }

    const curOpt = options.find((o) => o.key === this.selectedDeployVehicle) || options[0];
    const curFreeBase =
      curOpt.key !== 'foot' &&
      spawningAtMainBase &&
      Boolean(this.vehicleManager?.findAvailableBaseVehicle?.(team, curOpt.key));
    const curQuote = this.player.getVehicleRequisitionQuote?.(curOpt.key) || { totalCost: 0 };
    const isExpanded = Boolean(this._deployVehDrawerOpen);
    const catTag = isPilot ? '✈️ AIR & HELIS' : isArmor ? '🛡️ ARMOR & CONVOY' : '🚁 TRANSPORT & AIRLIFT';
    const expandHint = isPilot
      ? 'APACHE / BLACK HAWK / A-10 / F-15 / AC-130 / B-2'
      : isArmor
      ? '6×6 TRUCK / HUMVEE / IFV / SPAAG AA / TANK'
      : 'BIKE / ATV / 6×6 TROOP TRUCK / BLACK HAWK';

    const sampleCheckKey = isPilot ? 'cas' : isArmor ? 'tank' : 'bike';
    const hasAnyPaidMods = Boolean(this.player.hasModdedVehicleLoadout?.(sampleCheckKey));
    const stockPref = Boolean(this.player.preferStockVehicleRequisition);

    bar.style.cssText =
      'background:rgba(10,18,28,0.94);border:1px solid rgba(0,210,211,0.45);border-radius:5px;padding:4px 10px;margin-bottom:6px;display:flex;flex-direction:column;gap:5px;flex-shrink:0;';

    const chipsHtml = isExpanded
      ? `<div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;padding-top:3px;border-top:1px solid rgba(255,255,255,0.09);">
          ${options
            .map((opt) => {
              const hasFreeBase =
                opt.key !== 'foot' &&
                spawningAtMainBase &&
                Boolean(this.vehicleManager?.findAvailableBaseVehicle?.(team, opt.key));
              const hqRebuildSec =
                !hasFreeBase && spawningAtMainBase && opt.key !== 'foot'
                  ? this.vehicleManager?.getHqVehicleRebuildSeconds?.(team, opt.key) || 0
                  : 0;
              const q = this.player.getVehicleRequisitionQuote?.(opt.key) || {
                totalCost: 0,
                modSurcharge: 0,
                canAfford: true,
                cooldownRem: 0,
                shortBy: 0
              };
              const isSel = opt.key === this.selectedDeployVehicle;
              const locked =
                opt.key !== 'foot' &&
                (opt.killLocked || (!hasFreeBase && (!q.canAfford || q.cooldownRem > 0)));
              const priceTag =
                opt.key === 'foot'
                  ? 'FREE ($0)'
                  : opt.killLocked
                  ? `🔒 ${kills}/${reqKills}K`
                  : hasFreeBase
                  ? 'FREE ($0 HQ)'
                  : q.cooldownRem > 0
                  ? `⏳ ${q.cooldownRem}s • ⚡$${q.totalCost}`
                  : q.canAfford
                  ? `${hqRebuildSec > 0 ? `⏳HQ ${hqRebuildSec}s • ` : ''}⚡$${q.totalCost} DROP${q.modSurcharge > 0 ? ' ★' : ''}`
                  : hqRebuildSec > 0
                  ? `⏳ HQ ${hqRebuildSec}s (⚡$${q.totalCost})`
                  : `🔒 ⚡$${q.totalCost} (-$${q.shortBy})`;
              return `<button type="button" class="dep-veh-req-chip" data-vkey="${opt.key}" ${
                locked ? 'data-locked="1"' : ''
              } style="
                display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border-radius:4px;
                border:${isSel ? '1.5px solid #2ecc71' : locked ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,210,211,0.45)'};
                background:${isSel ? 'rgba(46,204,113,0.22)' : locked ? 'rgba(15,20,26,0.65)' : 'rgba(14,28,42,0.9)'};
                color:${locked ? '#7f8c8d' : '#ecf0f1'};cursor:${locked ? 'not-allowed' : 'pointer'};
                font-size:10px;font-weight:900;opacity:${locked ? '0.68' : '1'};
              " title="${opt.label} (${opt.sub}) — ${
                hasFreeBase ? 'Parked at Main Base HQ ($0 Free!)' : `Field Drop / Extra Requisition: ${priceTag}`
              }">
                <span>${opt.icon} ${opt.label}</span>
                <span style="color:${opt.key === 'foot' || hasFreeBase ? '#7bed9f' : locked ? '#ff7675' : '#f1c40f'};font-family:Consolas,monospace;font-size:9.5px;">${priceTag}</span>
              </button>`;
            })
            .join('')}
        </div>`
      : '';

    const curCostLabel =
      curOpt.key === 'foot' || curFreeBase ? '$0 FREE' : `⚡$${curQuote.totalCost} DROP`;

    bar.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;">
          <span style="font-size:10px;font-weight:900;color:#00d2d3;letter-spacing:0.5px;">${catTag}:</span>
          <button type="button" id="dep-veh-req-toggle-btn" style="
            background:${this.selectedDeployVehicle === 'foot' ? 'rgba(255,255,255,0.07)' : 'rgba(46,204,113,0.22)'};
            border:1px solid ${this.selectedDeployVehicle === 'foot' ? 'rgba(0,210,211,0.5)' : '#2ecc71'};
            color:#ecf0f1;border-radius:4px;padding:2.5px 9px;font-size:10px;font-weight:900;cursor:pointer;
          ">
            ${curOpt.icon} ${curOpt.label} (${curCostLabel}) &bull; <span style="color:#81ecec;">${
      isExpanded ? '▴ HIDE OPTIONS' : `▾ + CHOOSE ${expandHint}`
    }</span>
          </button>
          ${
            hasAnyPaidMods
              ? `<button type="button" id="dep-veh-kit-mode-btn" style="background:rgba(241,196,15,0.14);border:1px solid rgba(241,196,15,0.45);color:#ffeaa7;border-radius:4px;padding:2px 7px;font-size:9.5px;font-weight:900;cursor:pointer;" title="Toggle between deploying your upgraded Armory/Hangar vehicle mods (+small Match Cash fee) vs. Stock $0 surcharge">⚙️ KIT: ${
                  stockPref ? 'STOCK (+$0)' : 'MODDED (+SURCHARGE)'
                }</button>`
              : ''
          }
        </div>
        <div style="display:flex;align-items:center;gap:7px;">
          <span style="font-size:10px;font-weight:900;color:#f1c40f;background:rgba(241,196,15,0.12);border:1px solid rgba(241,196,15,0.38);border-radius:4px;padding:2px 7px;" title="Earned live in-match via Flag Captures (+$180), Revives (+$85), Repairs (+$65), Kills (+$75) & Vehicle Destroys! Resets to $50 each match; unspent Match Cash extracts to your Armory Bank at round end.">⚡ MATCH CASH: $${matchCash.toLocaleString()}</span>
          ${
            isPilot || isArmor
              ? `<button type="button" id="dep-open-hangar-bay-btn" style="background:rgba(9,132,227,0.24);color:#81ecec;border:1px solid rgba(129,236,236,0.5);border-radius:4px;padding:2px 8px;font-size:9.5px;font-weight:900;cursor:pointer;white-space:nowrap;">🔧 HANGAR TECH [L]</button>`
              : ''
          }
        </div>
      </div>
      ${chipsHtml}
    `;

    bar.querySelector('#dep-veh-req-toggle-btn')?.addEventListener('click', () => {
      this._deployVehDrawerOpen = !this._deployVehDrawerOpen;
      this.renderDeployB2CustomizerBar();
    });

    bar.querySelector('#dep-veh-kit-mode-btn')?.addEventListener('click', () => {
      this.player.preferStockVehicleRequisition = !this.player.preferStockVehicleRequisition;
      this.renderDeployB2CustomizerBar();
    });

    bar.querySelector('#dep-open-hangar-bay-btn')?.addEventListener('click', () => {
      this._gunsmithActiveTab = 'vehicles';
      this.toggleGunsmithModal(true);
    });

    bar.querySelectorAll('.dep-veh-req-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const vKey = chip.dataset.vkey || 'foot';
        if (chip.dataset.locked === '1') {
          sound.playEmptyClick?.();
          const q = this.player.getVehicleRequisitionQuote?.(vKey) || { totalCost: 0, shortBy: 0, cooldownRem: 0 };
          const hqWait = spawningAtMainBase
            ? this.vehicleManager?.getHqVehicleRebuildSeconds?.(team, vKey) || 0
            : 0;
          this.addXpNotification?.(
            0,
            vKey === 'b2_spirit' && !b2Unlocked
              ? `🔒 B-2 SPIRIT STEALTH BOMBER REQUIRES ${reqKills} TEAM KILLS (${kills}/${reqKills} KILLS)!`
              : hqWait > 0
              ? `⏳ ALL HQ ${vKey.toUpperCase()} UNITS DESTROYED — FREE HQ REBUILD IN ${hqWait}s (OR PAY ⚡$${q.totalCost} MATCH CASH)!`
              : q.cooldownRem > 0
              ? `⏳ REQUISITION COOLDOWN: WAIT ${q.cooldownRem}s!`
              : `🔒 FRONTLINE DROP NEEDS ⚡$${q.totalCost} MATCH CASH (SELECT MAIN BASE FOR $0 FREE HQ POOL OR EARN ⚡$${q.shortBy} MORE!)`
          );
          return;
        }
        this.selectedDeployVehicle = vKey;
        this._deployVehDrawerOpen = false;
        sound.playWeaponSwitch?.();
        this.renderDeployB2CustomizerBar();
      });
    });
  },

  /**
   * Renders a compact 1-line Extracted Loot bar on `#deploy-screen` only when unsorted round loot is waiting.
   */
  renderDeployExtractedLootBar() {
    if (!this.deployScreenEl || !this.player) return;
    let bar = document.getElementById('deploy-extracted-loot-bar');
    const extracted = Array.isArray(this.player.extractedRoundLoot)
      ? this.player.extractedRoundLoot
      : [];

    if (extracted.length === 0) {
      if (bar) bar.classList.add('hidden');
      return;
    }

    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'deploy-extracted-loot-bar';
      const gridEl = this.deployScreenEl.querySelector('.deploy-grid');
      if (gridEl && gridEl.parentNode) {
        gridEl.parentNode.insertBefore(bar, gridEl);
      } else {
        this.deployScreenEl.appendChild(bar);
      }
    }
    bar.classList.remove('hidden');

    const totalSellVal = extracted.reduce(
      (sum, it) => sum + Math.max(50, Math.round(it.sellPrice || 150)),
      0
    );

    bar.style.cssText =
      'background:rgba(12,22,34,0.95);border:1px solid #2ecc71;border-radius:5px;padding:4px 10px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-shrink:0;';
    bar.innerHTML = `
      <span style="font-size:10.5px;font-weight:800;color:#ecf0f1;white-space:nowrap;">
        🎒 <b style="color:#2ecc71;">${extracted.length} Extracted Loot Item(s)</b> ready:
      </span>
      <div style="display:flex;gap:5px;flex-wrap:nowrap;">
        <button type="button" id="dep-sell-all-loot-btn" style="background:#27ae60;color:#fff;border:none;border-radius:3px;padding:3px 8px;font-size:10px;font-weight:900;cursor:pointer;">
          💵 SELL ALL (+$${totalSellVal.toLocaleString()})
        </button>
        <button type="button" id="dep-save-all-loot-btn" style="background:#2980b9;color:#fff;border:none;border-radius:3px;padding:3px 8px;font-size:10px;font-weight:900;cursor:pointer;">
          🏛️ SAVE ALL
        </button>
        <button type="button" id="dep-open-wh-loot-btn" style="background:#f39c12;color:#111;border:none;border-radius:3px;padding:3px 8px;font-size:10px;font-weight:900;cursor:pointer;">
          INSPECT
        </button>
      </div>
    `;

    bar.querySelectorAll('.dep-sell-loot-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.player.sellExtractedLootItem?.(btn.dataset.uid);
        this.updateCashAndGunsmithHud();
      });
    });
    bar.querySelectorAll('.dep-save-loot-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.player.saveExtractedLootItemToWarehouse?.(btn.dataset.uid);
        this.updateCashAndGunsmithHud();
      });
    });
    const sellAllBtn = bar.querySelector('#dep-sell-all-loot-btn');
    if (sellAllBtn) {
      sellAllBtn.addEventListener('click', () => {
        this.player.sellAllExtractedLoot?.();
        this.updateCashAndGunsmithHud();
      });
    }
    const saveAllBtn = bar.querySelector('#dep-save-all-loot-btn');
    if (saveAllBtn) {
      saveAllBtn.addEventListener('click', () => {
        this.player.saveAllExtractedLootToWarehouse?.();
        this.updateCashAndGunsmithHud();
      });
    }
    const openWhBtn = bar.querySelector('#dep-open-wh-loot-btn');
    if (openWhBtn) {
      openWhBtn.addEventListener('click', () => {
        this._gunsmithActiveTab = 'warehouse';
        this.toggleGunsmithModal(true);
      });
    }
  },

  /**
   * Opens the Unified Role Selection, Gun Selection, Gunsmith Workbench & Visualized Backpack Pop-out ([L] or [I]).
   * Gunsmith Workbench ([L]) requires Deploy Screen, Main Base HQ, Captured Friendly FOB (A–E), or Support Ammo Stash
   * (unless Sandbox Mode `squadDoctrineEnabled === false` is active).
   */
  openLoadoutAndGunsmithModal() {
    const modal = this.el('gunsmith-modal');
    const isOpen = modal && !modal.classList.contains('hidden');
    if (isOpen) {
      this.toggleGunsmithModal(false);
      return;
    }
    const access = this.player?.canAccessGunsmithWorkbench
      ? this.player.canAccessGunsmithWorkbench()
      : { allowed: true, locationLabel: 'ARMORY READY' };
    if (!access.allowed) {
      sound.playEmptyClick?.();
      this.addXpNotification?.(
        0,
        '🔧 GUNSMITH WORKBENCH [L] REQUIRES MAIN BASE HQ, CAPTURED FRIENDLY FOB (A–E), OR AMMO STASH [7]! (USE [I] FOR BACKPACK)'
      );
      return;
    }
    this._gunsmithRole = this.player?.role || this.selectedClass || 'engineer';
    const nearEnemyLoot =
      this.player && typeof this.player.findNearestEnemyLoot === 'function'
        ? this.player.findNearestEnemyLoot(5.0)
        : null;
    if (nearEnemyLoot) {
      this._gunsmithActiveTab = 'backpack';
      this._activeLootPackId = nearEnemyLoot.id;
    } else if (!this._gunsmithActiveTab || this._gunsmithActiveTab === 'backpack') {
      this._gunsmithActiveTab = 'warehouse';
    }
    this.toggleGunsmithModal(true);
  },

  /**
   * Opens directly to the Visualized Backpack & Enemy Loot view ([I], [Shift+B], [F] on a fallen enemy, or HUD Backpack button).
   */
  openBackpackLootView(lootPack = null) {
    this._gunsmithRole = this.player?.role || this.selectedClass || 'engineer';
    this._gunsmithActiveTab = 'backpack';
    if (lootPack && lootPack.id) {
      this._activeLootPackId = lootPack.id;
    }
    this.toggleGunsmithModal(true);
  },

  openBackpackModal(lootPack = null) {
    this.openBackpackLootView(lootPack);
  },

  /**
   * Toggles the Visualized 2D Backpack & Enemy Loot tab directly ([I] key or HUD Backpack buttons).
   * If the modal is already open on another tab, switches immediately to the 2D Backpack tab!
   */
  toggleBackpackModal() {
    const modal = this.el('gunsmith-modal');
    const isOpen = modal && !modal.classList.contains('hidden');
    if (isOpen && this._gunsmithActiveTab === 'backpack') {
      this.toggleGunsmithModal(false);
      return;
    }
    this._gunsmithRole = this.player?.role || this.selectedClass || 'engineer';
    this._gunsmithActiveTab = 'backpack';
    const nearEnemyLoot =
      this.player && typeof this.player.findNearestEnemyLoot === 'function'
        ? this.player.findNearestEnemyLoot(5.0)
        : null;
    if (nearEnemyLoot && nearEnemyLoot.id) {
      this._activeLootPackId = nearEnemyLoot.id;
    }
    this.toggleGunsmithModal(true);
  },

  toggleGunsmithModal(forceState) {
    let modal = this.el('gunsmith-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'gunsmith-modal';
      modal.className = 'hidden';
      document.body.appendChild(modal);
      if (this._domCache) this._domCache.set('gunsmith-modal', modal);
    }
    const isFullScreen = this._gunsmithEdgeFullscreen !== false;
    if (isFullScreen) {
      modal.style.cssText = `
        position: fixed; top: 0; left: 0; transform: none;
        width: 100vw; height: 100vh; max-width: 100vw; max-height: 100vh;
        display: flex; flex-direction: column; overflow: hidden; box-sizing: border-box;
        background-color: rgba(8, 13, 20, 0.985); border: 2px solid #f1c40f;
        border-radius: 0px; padding: 8px 14px; z-index: 10025;
        font-family: 'Rajdhani', 'Segoe UI', sans-serif; color: #ecf0f1;
        box-shadow: 0 22px 70px rgba(0, 0, 0, 0.95); pointer-events: auto;
      `;
    } else {
      modal.style.cssText = `
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
        width: 94vw; height: 92vh; max-width: 96vw; max-height: 94vh;
        display: flex; flex-direction: column; overflow: hidden; box-sizing: border-box;
        background-color: rgba(10, 15, 22, 0.98); border: 2px solid #f1c40f;
        border-radius: 8px; padding: 8px 14px; z-index: 10025;
        font-family: 'Rajdhani', 'Segoe UI', sans-serif; color: #ecf0f1;
        box-shadow: 0 22px 70px rgba(0, 0, 0, 0.95); pointer-events: auto;
      `;
    }

    const willShow =
      typeof forceState === 'boolean' ? forceState : modal.classList.contains('hidden');
    if (willShow) {
      if (this.player) {
        this.player.isFiring = false;
        this.player.isAds = false;
      }
      if (document.pointerLockElement) {
        try {
          document.exitPointerLock();
        } catch (_) {}
      }
      modal.classList.remove('hidden');
      this.renderGunsmithModalContent(modal);
    } else {
      modal.classList.add('hidden');
      if (this.caseRouletteFSM && this.caseRouletteFSM.is(ARMORY_CASE_STATES.CASE_ROLLING_SPIN)) {
        this.caseRouletteFSM.send(ARMORY_CASE_EVENTS.ABORT_SPIN);
      } else if (this._rouletteRafId) {
        if (typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(this._rouletteRafId);
        }
        this._rouletteRafId = null;
        this._isRouletteSpinning = false;
      }
      if (this.player) {
        this.player.isFiring = false;
        this.player.isAds = false;
        if (this.player.keys) {
          this.player.keys['Space'] = false;
          this.player.keys['KeyF'] = false;
        }
        this.player._lastMouseClientX = undefined;
        this.player._lastMouseClientY = undefined;
        this.player._suppressFireUntil = performance.now() + 380;
        if (this.player.activeVehicle && window.game?.telemetry) {
          window.game.telemetry.logEvent('MODAL_CLOSED_IN_VEHICLE', {
            vehicle: this.player.activeVehicle.name,
            speedKmh: Math.round((this.player.activeVehicle.forwardSpeed || 0) * 3.6),
            pitchDeg: Math.round(((this.player.activeVehicle.pitch || 0) * 180) / Math.PI),
            rollDeg: Math.round(((this.player.activeVehicle.roll || 0) * 180) / Math.PI),
            suppressFireMs: 380
          });
        }
        if (typeof this.player.cleanupEmptyLootPacks === 'function') {
          this.player.cleanupEmptyLootPacks();
        }
      }
      if (document.activeElement && typeof document.activeElement.blur === 'function') {
        try {
          document.activeElement.blur();
        } catch (_) {}
      }
      const requestGameplayFocusAndLock = () => {
        if (
          this.player &&
          !this.player.dead &&
          (!this.deployScreenEl || this.deployScreenEl.classList.contains('hidden')) &&
          modal.classList.contains('hidden')
        ) {
          try {
            window.focus();
            const canvas = document.querySelector('#game-container canvas');
            if (canvas && typeof canvas.focus === 'function') {
              canvas.focus();
            }
            if (document.pointerLockElement !== document.body) {
              const p = document.body.requestPointerLock();
              if (p && typeof p.catch === 'function') p.catch(() => {});
            }
          } catch (_) {}
        }
      };
      requestGameplayFocusAndLock();
      setTimeout(requestGameplayFocusAndLock, 50);
    }
  },

  // ─── DYNAMIC SVG WEAPON SILHOUETTE GENERATOR (DELEGATES TO src/assets/gunsmith-svg.js) ───
  buildWeaponSvg(weaponId, attMap = {}, opts = {}) {
    let skinFinish = opts.skinFinish;
    if (skinFinish === undefined && this.player) {
      if (weaponId === 'hammer') {
        skinFinish = this.player.equippedHammerSkin || null;
      } else if (this.player.equippedWeaponSkins && this.player.equippedWeaponSkins[weaponId]) {
        skinFinish = this.player.equippedWeaponSkins[weaponId];
      }
    }
    return buildWeaponSvg(weaponId, attMap, { ...opts, skinFinish });
  },

  // ─── CUSTOM SVG ICONS FOR ARMOR, OPTICS, ATTACHMENTS & FIELD GEAR ──────────
  buildGearSvg(kind, id = '') {
    return buildGearSvg(kind, id);
  },

  // ─── INTERACTIVE SVG BLUEPRINT WORKBENCH (MODE 2 CENTERPIECE) ──────────────
  buildWorkbenchBlueprintSvg(
    baseDef,
    customDef,
    wepAttMap,
    activeHardpoint,
    vestItem,
    backpackItem,
    tacGearItem
  ) {
    const muzzleItem = (ATTACHMENT_CATALOG.muzzle || []).find(
      (i) => i.id === (wepAttMap.muzzle || 'stock')
    ) || { shortName: 'STOCK BARREL', id: 'stock' };
    const opticItem = (ATTACHMENT_CATALOG.optic || []).find(
      (i) => i.id === (wepAttMap.optic || 'factory')
    ) || { shortName: 'IRON SIGHTS', id: 'factory', opticType: null };
    const gripItem = (ATTACHMENT_CATALOG.grip || []).find(
      (i) => i.id === (wepAttMap.grip || 'std_grip')
    ) || { shortName: 'STD HANDGUARD', id: 'std_grip' };
    const magItem = (ATTACHMENT_CATALOG.magazine || []).find(
      (i) => i.id === (wepAttMap.magazine || 'std_mag')
    ) || { shortName: 'STD MAG', id: 'std_mag' };
    const ammoItem = (ATTACHMENT_CATALOG.ammoType || []).find(
      (i) => i.id === (wepAttMap.ammoType || 'fmj')
    ) || { shortName: 'STD FMJ', id: 'fmj' };

    const isSecondary = baseDef.slot === 'secondary';
    const isBareIronSights = !customDef.opticType || customDef.opticType === 'iron';
    const opticNodeLabel = isBareIronSights
      ? 'BARE IRON SIGHTS (1.0X)'
      : opticItem.shortName;

    const nodes = [
      {
        key: 'optic',
        num: '1',
        title: isSecondary ? 'SLIDE OPTIC CUT' : 'UPPER OPTIC RAIL',
        val: opticNodeLabel,
        bx: 185,
        by: 8,
        tx: 295,
        ty: 68,
        upgraded: !isBareIronSights
      },
      {
        key: 'muzzle',
        num: '2',
        title: 'MUZZLE THREAD',
        val: baseDef.silenced && muzzleItem.id === 'stock' ? 'INTEGRAL SUPPRESSOR' : muzzleItem.shortName,
        bx: 350,
        by: 8,
        tx: 510,
        ty: 96,
        upgraded: muzzleItem.id !== 'stock' || Boolean(baseDef.silenced)
      },
      {
        key: 'ammoType',
        num: '3',
        title: 'CHAMBER / LOAD',
        val: ammoItem.shortName,
        bx: 16,
        by: 8,
        tx: 298,
        ty: 96,
        upgraded: ammoItem.id !== 'fmj'
      },
      {
        key: 'backpack',
        num: '7',
        title: 'TARKOV BACKPACK',
        val: backpackItem ? backpackItem.shortName : 'NO PACK (4C)',
        bx: 515,
        by: 8,
        tx: 615,
        ty: 66,
        upgraded: backpackItem && backpackItem.id !== 'no_pack'
      },
      {
        key: 'tacticalGear',
        num: '8',
        title: 'HEADGEAR / NVG & STIM',
        val: tacGearItem ? tacGearItem.shortName : 'ACH HELMET',
        bx: 16,
        by: 174,
        tx: 145,
        ty: 132,
        upgraded: tacGearItem && tacGearItem.id !== 'std_helmet'
      },
      {
        key: 'magazine',
        num: '4',
        title: 'MAGAZINE WELL',
        val: `${magItem.shortName} (${customDef.clipSize}R)`,
        bx: 180,
        by: 174,
        tx: 320,
        ty: 146,
        upgraded: magItem.id !== 'std_mag'
      },
      {
        key: 'grip',
        num: '5',
        title: isSecondary ? 'PISTOL RAIL / LASER' : 'UNDERBARREL RAIL',
        val: gripItem.shortName,
        bx: 350,
        by: 174,
        tx: 392,
        ty: 120,
        upgraded: gripItem.id !== 'std_grip'
      },
      {
        key: 'vest',
        num: '6',
        title: 'CHEST RIG & ARMOR',
        val: vestItem ? vestItem.shortName : 'LIGHT RIG (50)',
        bx: 515,
        by: 174,
        tx: 605,
        ty: 155,
        upgraded: vestItem && vestItem.id !== 'std_vest'
      }
    ];

    const nodesSvg = nodes
      .map((n) => {
        const isSel = activeHardpoint === n.key;
        const stroke = isSel ? '#f1c40f' : n.upgraded ? '#2ecc71' : 'rgba(116, 185, 255, 0.7)';
        const bg = isSel
          ? 'rgba(241, 196, 15, 0.24)'
          : n.upgraded
          ? 'rgba(46, 204, 113, 0.16)'
          : 'rgba(12, 22, 34, 0.92)';
        return `
          <g class="gs-svg-hardpoint" data-hardpoint="${n.key}" style="cursor:pointer;">
            <line x1="${n.bx + 70}" y1="${n.by + 20}" x2="${n.tx}" y2="${n.ty}" stroke="${stroke}" stroke-width="${isSel ? '2' : '1.3'}" stroke-dasharray="${isSel ? 'none' : '4,3'}"/>
            <circle cx="${n.tx}" cy="${n.ty}" r="${isSel ? 5.5 : 4}" fill="${stroke}" stroke="#0b1219" stroke-width="1.5"/>
            <rect x="${n.bx}" y="${n.by}" width="148" height="38" rx="4" fill="${bg}" stroke="${stroke}" stroke-width="${isSel ? '2' : '1.3'}"/>
            <text x="${n.bx + 7}" y="${n.by + 14}" fill="#95a5a6" font-size="9" font-weight="900" font-family="Rajdhani, sans-serif">[${n.num}] ${n.title}</text>
            <text x="${n.bx + 7}" y="${n.by + 29}" fill="${isSel ? '#f1c40f' : n.upgraded ? '#7bed9f' : '#ecf0f1'}" font-size="10.5" font-weight="900" font-family="Rajdhani, sans-serif">${n.val}</text>
          </g>
        `;
      })
      .join('');

    return `
      <div class="abi-workbench-wrap">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;flex-wrap:wrap;gap:6px;">
          <div>
            <span style="font-size:13px;font-weight:900;color:#f1c40f;letter-spacing:0.7px;">
              📐 TACTICAL BLUEPRINT WORKBENCH // ${customDef.name}
            </span>
            <span style="font-size:10.5px;color:#74b9ff;margin-left:8px;font-weight:800;">
              ${customDef.caliber}
            </span>
          </div>
          <div style="font-size:10px;color:#7bed9f;font-weight:900;">
            💡 CLICK ANY HARDPOINT NODE ON THE WEAPON DIAGRAM BELOW TO FILTER ATTACHMENTS
          </div>
        </div>
        <svg viewBox="0 0 685 222" style="width:100%;height:164px;display:block;user-select:none;">
          <!-- Blueprint Technical Reticle Crosshair & Rulers -->
          <line x1="20" y1="110" x2="665" y2="110" stroke="rgba(52,152,219,0.16)" stroke-width="1" stroke-dasharray="6,4"/>
          <line x1="340" y1="15" x2="340" y2="205" stroke="rgba(52,152,219,0.16)" stroke-width="1" stroke-dasharray="6,4"/>
          <text x="16" y="212" fill="rgba(116,185,255,0.5)" font-size="9" font-weight="800" font-family="monospace">CAD-SPEC // ID:${baseDef.id.toUpperCase()} // ADS-FOV:${customDef.adsFov}° // SIGHT:${isBareIronSights ? 'BARREL-IRON-POSTS' : String(customDef.opticType).toUpperCase()}</text>

          <!-- Centered High-Detail Scaled Weapon Silhouette -->
          <g transform="translate(88, 26) scale(1.62)">
            ${this.buildWeaponSvg(baseDef.id, wepAttMap, { height: 98, strokeColor: 'rgba(116, 185, 255, 0.85)' })
              .replace(/<svg[^>]*>/, '')
              .replace(/<\/svg>/, '')}
          </g>

          <!-- Interactive Hardpoint Callout Nodes -->
          ${nodesSvg}
        </svg>
      </div>
    `;
  },

  buildWeaponStatBarsHtml(baseDef, customDef) {
    if (!baseDef || !customDef) return '';
    const baseDmg = (baseDef.damage || 30) * (baseDef.pellets || 1);
    const custDmg = (customDef.damage || 30) * (customDef.pellets || 1);

    const baseRpm = baseDef.rpm || 600;
    const custRpm = customDef.rpm || 600;

    // Ergonomics / Handling score (ADS + Reload speed)
    const baseErgo = Math.round(Math.max(20, Math.min(95, 110 - (baseDef.reloadTime || 1.8) * 28)));
    const custErgo = Math.round(
      Math.max(20, Math.min(99, 110 - (customDef.reloadTime || 1.8) * 28))
    );

    // Recoil control score (0-100, higher is better/lower recoil)
    const baseRecoilScore = Math.round(
      Math.max(10, Math.min(98, 100 - (baseDef.recoilPitch || 0.015) * 1400))
    );
    const custRecoilScore = Math.round(
      Math.max(10, Math.min(99, 100 - (customDef.recoilPitch || 0.015) * 1400))
    );

    // Accuracy score (0-100, higher is tighter spread)
    const baseAccScore = Math.round(
      Math.max(15, Math.min(98, 100 - (baseDef.spreadHip || 0.02) * 1350))
    );
    const custAccScore = Math.round(
      Math.max(15, Math.min(99, 100 - (customDef.spreadHip || 0.02) * 1350))
    );

    // Muzzle stealth score (0-100, higher is lower flash / silenced)
    const baseStealth = baseDef.silenced
      ? 100
      : Math.round((1 - (baseDef.flashMult ?? 1.0)) * 70 + 20);
    const custStealth = customDef.silenced
      ? 100
      : Math.round((1 - (customDef.flashMult ?? 1.0)) * 70 + 20);

    const rows = [
      {
        label:
          customDef.pellets > 1
            ? `BALLISTIC POWER (${customDef.pellets} PELLETS)`
            : customDef.isSlugAmmo && baseDef.pellets > 1
            ? 'STOPPING POWER (AP-20 SLUG)'
            : 'STOPPING POWER',
        valText:
          customDef.pellets > 1
            ? `${customDef.damage}×${customDef.pellets} (${custDmg})`
            : `${custDmg} DMG (${customDef.headshotMult}x HS)`,
        basePct: Math.min(100, Math.round((baseDmg / 130) * 100)),
        custPct: Math.min(100, Math.round((custDmg / 130) * 100))
      },
      {
        label: 'ERGONOMICS & RELOAD',
        valText: `${custErgo} ERGO • ${customDef.reloadTime}s (${customDef.clipSize}R)`,
        basePct: baseErgo,
        custPct: custErgo
      },
      {
        label: 'VERTICAL RECOIL CTRL',
        valText: `${custRecoilScore}/100 STABILITY`,
        basePct: baseRecoilScore,
        custPct: custRecoilScore
      },
      {
        label: 'MOA ACCURACY & PEN',
        valText: `${custAccScore}/100 • PEN ${Math.round((customDef.armorPenMult || 1) * 100)}%`,
        basePct: baseAccScore,
        custPct: custAccScore
      },
      {
        label: 'CYCLIC FIRE RATE',
        valText: `${custRpm} RPM (${customDef.auto ? 'FULL-AUTO' : 'SEMI/BOLT'})`,
        basePct: Math.min(100, Math.round((baseRpm / 1150) * 100)),
        custPct: Math.min(100, Math.round((custRpm / 1150) * 100))
      },
      {
        label: 'MUZZLE SIGNATURE',
        valText: customDef.silenced
          ? 'SILENCED (ZERO FLASH/TRACER)'
          : `${Math.round((customDef.flashMult ?? 1) * 100)}% FLASH`,
        basePct: baseStealth,
        custPct: custStealth
      }
    ];

    return rows
      .map((r) => {
        const diff = r.custPct - r.basePct;
        const barCol = diff > 0 ? '#2ecc71' : diff < 0 ? '#e67e22' : '#3498db';
        const diffBadge =
          diff > 0 ? `<span style="color:#2ecc71;margin-left:3px;">(+${diff})</span>` : diff < 0 ? `<span style="color:#e67e22;margin-left:3px;">(${diff})</span>` : '';
        return `
          <div style="margin-bottom:5px;">
            <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:2px;">
              <span style="font-weight:800;color:#95a5a6;">${r.label}</span>
              <span style="font-weight:900;color:${diff > 0 ? '#7bed9f' : '#ecf0f1'};">${r.valText}${diffBadge}</span>
            </div>
            <div style="height:6px;background:rgba(255,255,255,0.09);border-radius:3px;overflow:hidden;position:relative;">
              <div style="height:100%;width:${r.custPct}%;background:${barCol};border-radius:3px;transition:width 0.2s;"></div>
            </div>
          </div>
        `;
      })
      .join('');
  },

  renderGunsmithModalContent(modal) {
    if (this.player && typeof this.player.ensureWarehouseStructures === 'function') {
      this.player.ensureWarehouseStructures();
      this.player.syncTotalCash();
    }

    const isFullScreen = this._gunsmithEdgeFullscreen !== false;
    if (modal) {
      if (isFullScreen) {
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.transform = 'none';
        modal.style.width = '100vw';
        modal.style.height = '100vh';
        modal.style.maxWidth = '100vw';
        modal.style.maxHeight = '100vh';
        modal.style.borderRadius = '0px';
        modal.style.boxSizing = 'border-box';
      } else {
        modal.style.top = '50%';
        modal.style.left = '50%';
        modal.style.transform = 'translate(-50%, -50%)';
        modal.style.width = '92vw';
        modal.style.height = '90vh';
        modal.style.maxWidth = '96vw';
        modal.style.maxHeight = '94vh';
        modal.style.borderRadius = '8px';
        modal.style.boxSizing = 'border-box';
      }
    }

    const workbenchAccess = this.player?.canAccessGunsmithWorkbench
      ? this.player.canAccessGunsmithWorkbench()
      : { allowed: true, locationLabel: 'ARMORY READY' };
    if (
      !workbenchAccess.allowed &&
      this._gunsmithActiveTab !== 'backpack' &&
      this._gunsmithActiveTab !== 'vehicles' &&
      this._gunsmithActiveTab !== 'requisitions'
    ) {
      this._gunsmithActiveTab = this.player?.activeVehicle ? 'vehicles' : 'backpack';
    }
    const activeTab = this._gunsmithActiveTab || 'warehouse';
    const era = this.world?.era || 'modern';
    const playerTeam = this.player?.team || this.selectedTeam || 'US';
    const activeRole = resolveRoleForEra(
      this._gunsmithRole || this.player?.role || this.selectedClass || 'engineer',
      era,
      playerTeam
    );
    this._gunsmithRole = activeRole;
    const stashFilter = this._gunsmithStashFilter || 'firearms';
    const activeHardpoint = this._gunsmithHardpoint || 'optic';
    const opticFilter = this._gunsmithOpticFilter || 'all';
    const workbenchSlot = this._gunsmithWeaponSlot || 'primary';

    const whCash = this.player.warehouseCash ?? 1200;
    const matchCash = this.player.matchCash ?? 600;
    const totalCash = whCash + matchCash;

    const primaryId = this.player.getSelectedWeaponIdForClass
      ? this.player.getSelectedWeaponIdForClass(activeRole, 'primary')
      : 'm4a1';
    const secondaryId = this.player.getSelectedWeaponIdForClass
      ? this.player.getSelectedWeaponIdForClass(activeRole, 'secondary')
      : 'mp443';

    const basePrimaryDef = WEAPON_DEFS[primaryId] || WEAPON_DEFS.m4a1;
    const customPrimaryDef = this.player.buildCustomizedWeaponDef
      ? this.player.buildCustomizedWeaponDef(basePrimaryDef, true, primaryId)
      : basePrimaryDef;

    const baseSecondaryDef = WEAPON_DEFS[secondaryId] || WEAPON_DEFS.mp443;
    const customSecondaryDef = this.player.buildCustomizedWeaponDef
      ? this.player.buildCustomizedWeaponDef(baseSecondaryDef, false, secondaryId)
      : baseSecondaryDef;

    const ownedWeapons =
      this.player.ownedWeapons || new Set(['m4a1', 'ak15', 'vector', 'm249', 'sv98', 'mp443']);
    const ownedUpgrades = this.player.ownedUpgrades || new Set();
    const primAttMap = this.player.getWeaponAttachmentMap
      ? this.player.getWeaponAttachmentMap(primaryId)
      : this.player.equippedUpgrades || {};
    const secAttMap = this.player.getWeaponAttachmentMap
      ? this.player.getWeaponAttachmentMap(secondaryId)
      : {};

    const workbenchWeaponId = workbenchSlot === 'secondary' ? secondaryId : primaryId;
    const baseWorkbenchDef = workbenchSlot === 'secondary' ? baseSecondaryDef : basePrimaryDef;
    const customWorkbenchDef =
      workbenchSlot === 'secondary' ? customSecondaryDef : customPrimaryDef;
    const wepAttMap = workbenchSlot === 'secondary' ? secAttMap : primAttMap;

    const equippedVestId =
      (this.player.equippedUpgrades && this.player.equippedUpgrades.vest) || 'std_vest';
    const equippedVestItem =
      (ATTACHMENT_CATALOG.vest || []).find((v) => v.id === equippedVestId) ||
      (ATTACHMENT_CATALOG.vest && ATTACHMENT_CATALOG.vest[0]);

    const equippedBackpackId =
      (this.player.equippedUpgrades && this.player.equippedUpgrades.backpack) || 'no_pack';
    const equippedBackpackItem =
      (ATTACHMENT_CATALOG.backpack || []).find((b) => b.id === equippedBackpackId) ||
      (ATTACHMENT_CATALOG.backpack && ATTACHMENT_CATALOG.backpack[0]);

    const equippedTacGearId =
      (this.player.equippedUpgrades && this.player.equippedUpgrades.tacticalGear) || 'std_helmet';
    const equippedTacGearItem =
      (ATTACHMENT_CATALOG.tacticalGear || []).find((g) => g.id === equippedTacGearId) ||
      (ATTACHMENT_CATALOG.tacticalGear && ATTACHMENT_CATALOG.tacticalGear[0]);

    const isPrimitiveEra = era === 'medieval' || era === 'jurassic';
    const primaryGuns = Object.values(WEAPON_DEFS).filter((w) =>
      isPrimitiveEra
        ? w.isPrimitiveOnly && !w.isDinoWeapon && w.slot !== 'secondary'
        : w.type === 'gun' && !w.isPrimitiveOnly && !w.isDinoWeapon && w.slot !== 'secondary'
    );
    const secondaryGuns = Object.values(WEAPON_DEFS).filter((w) =>
      isPrimitiveEra
        ? w.isPrimitiveOnly && !w.isDinoWeapon
        : w.type === 'gun' && !w.isPrimitiveOnly && !w.isDinoWeapon && w.slot === 'secondary'
    );

    const stock = this.player.warehouseStock || { armorPlates: 2, medStims: 2, ammoPacks: 2 };
    const stats = this.player.careerStats || {
      matchesPlayed: 0,
      matchesWon: 0,
      totalExtractedCash: 0
    };

    // ─── LEFT PANEL: OPERATOR EQUIPMENT SLOTS ("PAPER DOLL" RIG VIEW) ─────────
    const renderOperatorRigPanel = () => {
      const allowedEraIds = getAllowedRoleIds(era, playerTeam);
      const visibleClassMeta = CLASS_META.filter((c) => allowedEraIds.includes(c.id));
      const activeClassMeta =
        visibleClassMeta.find((c) => c.id === activeRole) ||
        CLASS_META.find((c) => c.id === activeRole) ||
        visibleClassMeta[0] ||
        CLASS_META[0];
      const classTabsHtml = visibleClassMeta.map((c) => {
        const isSel = c.id === activeRole;
        return `
          <button type="button" class="abi-class-tab gs-role-btn ${isSel ? 'active' : ''}" data-role="${c.id}" title="${c.label}: ${c.gadget}">
            <div>${c.icon} ${c.short}</div>
          </button>
        `;
      }).join('');

      const primMeta = WEAPON_GRID_SIZES[primaryId] || { label: '4×2', cat: 'PRIMARY', weight: '3.4 kg' };
      const isBareIronSights = !customPrimaryDef.opticType || customPrimaryDef.opticType === 'iron';
      const isSecBareIron = !customSecondaryDef.opticType || customSecondaryDef.opticType === 'iron';

      const buildNodePillsForWeapon = (attMap, baseDef, customDef, slotName) => {
        const bareIron = !customDef.opticType || customDef.opticType === 'iron';
        const defs = [
          {
            key: 'optic',
            label: 'OPTIC',
            val: bareIron ? 'IRON' : String(customDef.opticType).toUpperCase(),
            cls: bareIron ? 'iron-sight' : 'upgraded'
          },
          {
            key: 'muzzle',
            label: 'MUZZLE',
            val:
              (attMap.muzzle || 'stock') === 'stock'
                ? baseDef.silenced
                  ? 'INTEGRAL'
                  : 'STOCK'
                : attMap.muzzle.toUpperCase().slice(0, 6),
            cls: (attMap.muzzle || 'stock') !== 'stock' || baseDef.silenced ? 'upgraded' : ''
          },
          {
            key: 'magazine',
            label: 'MAG',
            val: `${customDef.clipSize} RDS`,
            cls: (attMap.magazine || 'std_mag') !== 'std_mag' ? 'upgraded' : ''
          },
          {
            key: 'grip',
            label: slotName === 'secondary' ? 'LASER' : 'GRIP',
            val: (attMap.grip || 'std_grip') === 'std_grip' ? 'STOCK' : 'MODDED',
            cls: (attMap.grip || 'std_grip') !== 'std_grip' ? 'upgraded' : ''
          },
          {
            key: 'ammoType',
            label: 'AMMO',
            val:
              (attMap.ammoType || 'fmj') === 'fmj'
                ? 'FMJ'
                : attMap.ammoType.toUpperCase().slice(0, 6),
            cls: (attMap.ammoType || 'fmj') !== 'fmj' ? 'upgraded' : ''
          }
        ];
        return defs
          .map(
            (n) => `
            <button type="button" class="abi-node-pill gs-jump-hardpoint ${n.cls}" data-hardpoint="${n.key}" data-wep-slot="${slotName}" title="Click to modify ${n.label} on ${customDef.shortName} in Gunsmith Workbench">
              <div style="font-size:8px;color:#95a5a6;font-weight:800;">${n.label}</div>
              <div style="font-size:9px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${n.val}</div>
            </button>
          `
          )
          .join('');
      };

      const nodePillsHtml = buildNodePillsForWeapon(
        primAttMap,
        basePrimaryDef,
        customPrimaryDef,
        'primary'
      );
      const secNodePillsHtml = buildNodePillsForWeapon(
        secAttMap,
        baseSecondaryDef,
        customSecondaryDef,
        'secondary'
      );

      const allowedPrimaryGuns = primaryGuns.filter(
        (w) => !w.allowedClasses || w.allowedClasses.includes(activeRole)
      );
      const primaryQuickSwapHtml = allowedPrimaryGuns
        .map((w) => {
          const isEq = w.id === primaryId;
          const isOwn = ownedWeapons.has(w.id) || (w.warehousePrice || 0) === 0;
          return `
            <button type="button" class="gs-weapon-btn" data-slot="primary" data-weapon="${w.id}" style="
              flex:1;min-width:68px;background:${isEq ? '#27ae60' : isOwn ? 'rgba(41,128,185,0.38)' : 'rgba(241,196,15,0.2)'};
              border:1px solid ${isEq ? '#2ecc71' : isOwn ? '#3498db' : '#f1c40f'};
              color:#fff;border-radius:3px;padding:3px 5px;font-size:9px;font-weight:900;cursor:pointer;
            " title="Select ${w.name} (${w.caliber})">
              ${isEq ? '✓ ' : ''}${w.shortName}${!isOwn ? ` ($${w.warehousePrice})` : ''}
            </button>
          `;
        })
        .join('');

      const sidearmQuickSwapHtml = secondaryGuns
        .map((s) => {
          const isEq = s.id === secondaryId;
          const isOwn = ownedWeapons.has(s.id) || (s.warehousePrice || 0) === 0;
          return `
            <button type="button" class="gs-weapon-btn" data-slot="secondary" data-weapon="${s.id}" style="
              flex:1 1 66px;min-width:64px;white-space:nowrap;background:${isEq ? '#27ae60' : isOwn ? 'rgba(41,128,185,0.35)' : 'rgba(241,196,15,0.2)'};
              border:1px solid ${isEq ? '#2ecc71' : isOwn ? '#3498db' : '#f1c40f'};
              color:#fff;border-radius:3px;padding:3px 5px;font-size:9px;font-weight:900;cursor:pointer;
            ">
              ${isEq ? '✓ ' : ''}${s.shortName}${!isOwn ? ` ($${s.warehousePrice})` : ''}
            </button>
          `;
        })
        .join('');

      const vestQuickBtnsHtml = (ATTACHMENT_CATALOG.vest || [])
        .map((v) => {
          const isEq = v.id === equippedVestId;
          const isOwn = ownedUpgrades.has(v.id) || v.price === 0;
          return `
            <button type="button" class="gunsmith-item-btn" data-cat="vest" data-id="${v.id}" data-weapon="${primaryId}" style="
              flex:1 1 62px;min-width:58px;white-space:nowrap;background:${isEq ? '#27ae60' : isOwn ? 'rgba(41,128,185,0.35)' : 'rgba(241,196,15,0.18)'};
              border:1px solid ${isEq ? '#2ecc71' : isOwn ? '#3498db' : '#f1c40f'};
              color:#fff;border-radius:3px;padding:3px 4px;font-size:8.5px;font-weight:900;cursor:pointer;
            " title="${v.name}: ${v.desc}">
              ${isEq ? '✓ ' : ''}${v.maxArmor}HP/${v.magSlots || 4}M${!isOwn ? ` ($${v.price})` : ''}
            </button>
          `;
        })
        .join('');

      const backpackQuickBtnsHtml = (ATTACHMENT_CATALOG.backpack || [])
        .map((bp) => {
          const isEq = bp.id === equippedBackpackId;
          const isOwn = ownedUpgrades.has(bp.id) || bp.price === 0;
          const shortTag =
            bp.id === 'no_pack'
              ? 'NONE'
              : bp.id === 'sling_pack'
              ? 'S (9C)'
              : bp.id === 'berkut_pack'
              ? 'M (16C)'
              : bp.id === 'beta2_pack'
              ? 'L (25C)'
              : 'XL (36C)';
          return `
            <button type="button" class="gunsmith-item-btn" data-cat="backpack" data-id="${bp.id}" data-weapon="${primaryId}" style="
              flex:1 1 52px;min-width:48px;white-space:nowrap;background:${isEq ? '#27ae60' : isOwn ? 'rgba(41,128,185,0.35)' : 'rgba(241,196,15,0.18)'};
              border:1px solid ${isEq ? '#2ecc71' : isOwn ? '#3498db' : '#f1c40f'};
              color:#fff;border-radius:3px;padding:3px 3px;font-size:8.5px;font-weight:900;cursor:pointer;
            " title="${bp.name}: ${bp.desc}">
              ${isEq ? '✓ ' : ''}${shortTag}${!isOwn ? ` ($${bp.price})` : ''}
            </button>
          `;
        })
        .join('');

      const tacGearQuickBtnsHtml = (ATTACHMENT_CATALOG.tacticalGear || [])
        .map((tg) => {
          const isEq = tg.id === equippedTacGearId;
          const isOwn = ownedUpgrades.has(tg.id) || tg.price === 0;
          const shortTag =
            tg.id === 'std_helmet'
              ? 'ACH'
              : tg.id === 'fast_mt_comtac'
              ? 'FAST MT'
              : tg.id === 'altyn_faceshield'
              ? 'ALTYN'
              : tg.id === 'propital_rig'
              ? 'STIM'
              : 'GPNVG [N]';
          return `
            <button type="button" class="gunsmith-item-btn" data-cat="tacticalGear" data-id="${tg.id}" data-weapon="${primaryId}" style="
              flex:1 1 54px;min-width:50px;white-space:nowrap;background:${isEq ? '#27ae60' : isOwn ? 'rgba(41,128,185,0.35)' : 'rgba(241,196,15,0.18)'};
              border:1px solid ${isEq ? '#2ecc71' : isOwn ? '#3498db' : '#f1c40f'};
              color:#fff;border-radius:3px;padding:3px 4px;font-size:8.5px;font-weight:900;cursor:pointer;
            " title="${tg.name}: ${tg.desc}">
              ${isEq ? '✓ ' : ''}${shortTag}${!isOwn ? ` ($${tg.price})` : ''}
            </button>
          `;
        })
        .join('');

      const magCount = Math.max(
        1,
        Math.round((customPrimaryDef.reserveAmmo || 120) / Math.max(1, customPrimaryDef.clipSize || 30))
      );
      const loosePrimaryRds = customPrimaryDef.maxLooseAmmo || 60;
      const bandagesCount =
        (activeRole === 'medic' ? 6 : 3) +
        (equippedVestItem ? equippedVestItem.bonusBandages : 0) +
        (equippedBackpackItem ? equippedBackpackItem.bonusBandages : 0);
      const fragsCount =
        2 +
        (equippedVestItem ? equippedVestItem.bonusGrenades : 0) +
        (equippedBackpackItem ? equippedBackpackItem.bonusGrenades : 0);

      const primScopeBadge = isBareIronSights
        ? '🎯 BARE IRON SIGHTS'
        : customPrimaryDef.isThermal
        ? `🌡️ FLIR ${customPrimaryDef.zoomLevels ? `${customPrimaryDef.zoomLevels[0]}X⇄${customPrimaryDef.zoomLevels[1]}X` : 'IR'}`
        : Array.isArray(customPrimaryDef.zoomLevels)
        ? `🔭 ${customPrimaryDef.zoomLevels[0]}X ⇄ ${customPrimaryDef.zoomLevels[1]}X`
        : `🔭 SCOPE: ${String(customPrimaryDef.opticType).toUpperCase()}`;

      const rigSubTab = this._rigSubTab || 'weapons';

      return `
        <div class="abi-rig-panel" style="min-width:0;max-width:100%;box-sizing:border-box;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;flex-wrap:wrap;flex-shrink:0;">
            <span style="font-size:11px;font-weight:900;color:#f1c40f;letter-spacing:0.5px;">
              🪖 OPERATOR RIG // ${activeClassMeta.label}
            </span>
            <span style="font-size:9px;color:#7bed9f;font-weight:900;">
              ${activeClassMeta.gadget}
            </span>
          </div>

          <!-- 7-Class Selector Strip -->
          <div class="abi-class-strip" style="flex-shrink:0;">
            ${classTabsHtml}
          </div>

          <!-- Zero-Scroll Rig Sub-Toggle: [WEAPONS & SLOTS] vs [ARMOR, PACK & STATS] -->
          <div style="display:flex;gap:4px;flex-shrink:0;">
            <button type="button" class="gs-rig-subtab-btn" data-rig-sub="weapons" style="flex:1;padding:4px 6px;border-radius:4px;border:1.5px solid ${
              rigSubTab === 'weapons' ? '#2ecc71' : 'rgba(255,255,255,0.18)'
            };background:${
              rigSubTab === 'weapons' ? 'rgba(46,204,113,0.22)' : 'rgba(16,24,34,0.9)'
            };color:${
              rigSubTab === 'weapons' ? '#7bed9f' : '#cbd5e1'
            };font-size:9.5px;font-weight:900;cursor:pointer;">
              🔫 1. WEAPONS &amp; SLOTS
            </button>
            <button type="button" class="gs-rig-subtab-btn" data-rig-sub="gear" style="flex:1;padding:4px 6px;border-radius:4px;border:1.5px solid ${
              rigSubTab === 'gear' ? '#f1c40f' : 'rgba(255,255,255,0.18)'
            };background:${
              rigSubTab === 'gear' ? 'rgba(241,196,15,0.22)' : 'rgba(16,24,34,0.9)'
            };color:${
              rigSubTab === 'gear' ? '#ffeaa7' : '#cbd5e1'
            };font-size:9.5px;font-weight:900;cursor:pointer;">
              🛡️ 2. ARMOR, PACK &amp; STATS
            </button>
          </div>

          <div style="display:${rigSubTab === 'weapons' ? 'flex' : 'none'};flex-direction:column;gap:6px;">
          <!-- SLOT 1: PRIMARY SLING (4x2 CELLS) -->
          <div class="abi-slot-card primary-slot" style="overflow:hidden;min-width:0;max-width:100%;box-sizing:border-box;padding:6px 8px;${workbenchSlot === 'primary' && activeTab === 'attachments' ? 'border-color:#2ecc71;box-shadow:0 0 12px rgba(46,204,113,0.25);' : ''}">
            <div class="abi-slot-header">
              <span style="color:#7bed9f;">SLOT 1 // PRIMARY SLING (${primMeta.cat})</span>
              <span class="abi-cell-tag">${primMeta.label} • ${primMeta.weight}</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px;gap:4px;flex-wrap:wrap;">
              <span style="font-size:12.5px;font-weight:900;color:#fff;">${customPrimaryDef.name}</span>
              <span style="font-size:9px;color:${customPrimaryDef.isThermal ? '#ff9f43' : '#f1c40f'};font-weight:900;">
                ${primScopeBadge}
              </span>
            </div>
            <div style="padding:1px 4px;background:rgba(0,0,0,0.35);border-radius:4px;border:1px solid rgba(255,255,255,0.06);">
              ${this.buildWeaponSvg(primaryId, primAttMap, { height: 48 })}
            </div>
            <div style="margin-top:4px;">
              <div style="font-size:8.5px;font-weight:900;color:#7bed9f;margin-bottom:2px;letter-spacing:0.4px;">
                🔫 SELECT PRIMARY FIREARM FOR ${activeRole.toUpperCase()}:
              </div>
              <div style="display:flex;gap:3px;flex-wrap:wrap;">
                ${primaryQuickSwapHtml}
              </div>
            </div>
            <div class="abi-node-strip">
              ${nodePillsHtml}
            </div>
            <div style="display:flex;gap:5px;margin-top:5px;flex-wrap:wrap;">
              <button type="button" class="gs-wep-workbench-btn" data-wep-slot="primary" style="flex:1.3;background:${workbenchSlot === 'primary' && activeTab === 'attachments' ? '#27ae60' : '#2980b9'};color:#fff;border:none;border-radius:4px;padding:4px 8px;font-size:9.5px;font-weight:900;cursor:pointer;">
                🔧 MODIFY RIFLE IN WORKBENCH
              </button>
              <button type="button" class="gs-tab-btn" data-tab="backpack" style="flex:1;background:rgba(243,156,18,0.22);color:#f1c40f;border:1px solid rgba(241,196,15,0.55);border-radius:4px;padding:4px 8px;font-size:9.5px;font-weight:900;cursor:pointer;">
                🎒 BACKPACK &amp; LOOT
              </button>
            </div>
          </div>

          <!-- SLOT 2: SIDEARM HOLSTER (2x1 CELLS) WITH CALL OF DUTY PISTOL ATTACHMENTS -->
          <div class="abi-slot-card secondary-slot" style="overflow:hidden;min-width:0;max-width:100%;box-sizing:border-box;${workbenchSlot === 'secondary' && activeTab === 'attachments' ? 'border-color:#2ecc71;box-shadow:0 0 12px rgba(46,204,113,0.25);' : ''}">
            <div class="abi-slot-header">
              <span style="color:#74b9ff;">SLOT 2 // HOLSTER SIDEARM (PISTOL ATTACHMENTS)</span>
              <span class="abi-cell-tag">2×1 • ${isSecBareIron ? 'IRON SIGHTS' : String(customSecondaryDef.opticType).toUpperCase()}</span>
            </div>
            <div style="display:grid;grid-template-columns:minmax(0,1fr) 118px;gap:6px;align-items:center;">
              <div style="min-width:0;">
                <div style="font-size:12px;font-weight:900;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${customSecondaryDef.name}</div>
                <div style="font-size:9.5px;color:#bdc3c7;">
                  DMG: <b>${customSecondaryDef.damage}</b> • RPM: <b>${customSecondaryDef.rpm}</b> • MAG: <b>${customSecondaryDef.clipSize}R</b>
                </div>
              </div>
              <div style="background:rgba(0,0,0,0.35);border-radius:4px;padding:2px;overflow:hidden;">
                ${this.buildWeaponSvg(secondaryId, secAttMap, { height: 42 })}
              </div>
            </div>
            <div class="abi-node-strip" style="margin-top:4px;">
              ${secNodePillsHtml}
            </div>
            <div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap;min-width:0;max-width:100%;">
              ${sidearmQuickSwapHtml}
              <button type="button" class="gs-wep-workbench-btn" data-wep-slot="secondary" style="flex:1 1 112px;min-width:106px;white-space:nowrap;background:${workbenchSlot === 'secondary' && activeTab === 'attachments' ? '#27ae60' : '#8e44ad'};color:#fff;border:1px solid #9b59b6;border-radius:3px;padding:4px 7px;font-size:9px;font-weight:900;cursor:pointer;" title="Customize Call of Duty Pistol Optics, Suppressors, Extended/Drum Mags & Laser!">
                🔧 MODIFY PISTOL
              </button>
            </div>
          </div>

          ${
            activeRole === 'engineer' || activeRole === 'armor'
              ? `
                <!-- SLOT 3: ENGINEER / ARMOR CREWMAN COMBINED ANTI-ARMOR (RPG-7) & ANTI-AIR (STINGER SAM) LAUNCHER -->
                <div class="abi-slot-card" style="border-color:rgba(241,196,15,0.65);background:rgba(24,18,12,0.92);">
                  <div class="abi-slot-header">
                    <span style="color:#f1c40f;">SLOT 3 // COMBINED ANTI-ARMOR &amp; ANTI-AIR LAUNCHER [KEY 3]</span>
                    <span class="abi-cell-tag">PRESS [3] IN FIELD TO TOGGLE LIVE</span>
                  </div>
                  <div style="font-size:9.5px;color:#bdc3c7;margin-bottom:4px;">
                    Carries both <b>RPG-7V2 HEAT (Anti-Armor)</b> and <b>FIM-92 Stinger / Igla (Anti-Air SAM)</b>. Choose your default below or press <b>[3]</b> again in combat to swap instantly!
                  </div>
                  <div style="display:flex;gap:5px;">
                    <button type="button" class="gs-eng-launcher-btn" data-launcher="rpg7" style="flex:1;background:${
                      (this.player.preferredEngineerLauncher || 'rpg7') !== 'stinger'
                        ? '#d35400'
                        : 'rgba(255,255,255,0.1)'
                    };border:1.5px solid ${
                      (this.player.preferredEngineerLauncher || 'rpg7') !== 'stinger'
                        ? '#f1c40f'
                        : 'rgba(255,255,255,0.2)'
                    };color:#fff;border-radius:4px;padding:5px 6px;font-size:9.5px;font-weight:900;cursor:pointer;">
                      🚀 RPG-7V2 HEAT (ANTI-ARMOR) ${(this.player.preferredEngineerLauncher || 'rpg7') !== 'stinger' ? '✓' : ''}
                    </button>
                    <button type="button" class="gs-eng-launcher-btn" data-launcher="stinger" style="flex:1;background:${
                      this.player.preferredEngineerLauncher === 'stinger'
                        ? '#27ae60'
                        : 'rgba(255,255,255,0.1)'
                    };border:1.5px solid ${
                      this.player.preferredEngineerLauncher === 'stinger'
                        ? '#2ecc71'
                        : 'rgba(255,255,255,0.2)'
                    };color:#fff;border-radius:4px;padding:5px 6px;font-size:9.5px;font-weight:900;cursor:pointer;">
                      📡 FIM-92 STINGER (ANTI-AIR SAM) ${this.player.preferredEngineerLauncher === 'stinger' ? '✓' : ''}
                    </button>
                  </div>
                </div>
              `
              : ''
          }

          <!-- RIDE & AIRCRAFT CUSTOMIZATION BAY CARD (HIGHLIGHTED FOR ARMOR CREWMAN & COMBAT PILOT) -->
          <div class="abi-slot-card" style="border-color:${
            activeRole === 'armor' || activeRole === 'pilot' || activeTab === 'vehicles'
              ? '#48dbfb'
              : 'rgba(72,219,251,0.42)'
          };background:rgba(12,24,36,0.95);">
            <div class="abi-slot-header">
              <span style="color:#48dbfb;">
                ${
                  activeRole === 'armor'
                    ? '🛡️ ARMOR CREWMAN RIDE BAY // TANK & IFV LOADOUT'
                    : activeRole === 'pilot'
                    ? '✈️ COMBAT PILOT AIRWING BAY // JET & AC-130J LOADOUT'
                    : '🚜 VEHICLE & AIRCRAFT CUSTOMIZATION BAY'
                }
              </span>
              <span class="abi-cell-tag" style="background:rgba(72,219,251,0.22);color:#48dbfb;">
                KEY [X] IN RIDE
              </span>
            </div>
            <div style="font-size:9px;color:#cbd5e1;line-height:1.35;margin-bottom:5px;">
              ${
                activeRole === 'armor'
                  ? '<b>SKILLS:</b> +22 HP/s Hull Auto-Repair • +22% Cannon Reload • <b>[X] Trophy APS &amp; IR Smoke</b> • <b>[4] Wrench (+420 HP)</b> • 0 Bailout Damage'
                  : activeRole === 'pilot'
                  ? '<b>SKILLS:</b> G-Suit (+28% Turn Rate) • +25 HP/s Airframe Repair • <b>[X] ECM Radar Jammer &amp; Angel Flares</b> • Auto-DIRCM • 0 Eject Damage'
                  : 'Customize your <b>Tank / IFV</b> (Trophy APS, Autoloader, ERA Armor) &amp; <b>Fighter / A-10 / AC-130J</b> (ECM Jammer, Ordnance Pods, Titanium Airframe)!'
              }
            </div>
            <button type="button" class="gs-tab-btn" data-tab="vehicles" style="width:100%;background:${
              activeTab === 'vehicles' ? '#0984e3' : 'rgba(9,132,227,0.34)'
            };border:1.5px solid #48dbfb;color:#fff;border-radius:4px;padding:5px 8px;font-size:9.5px;font-weight:900;cursor:pointer;letter-spacing:0.4px;">
              🚜 ${
                activeTab === 'vehicles'
                  ? '✓ CUSTOMIZING RIDE & AIRCRAFT BAY'
                  : 'OPEN VEHICLE & AIRCRAFT CUSTOMIZATION BAY'
              }
            </button>
          </div>

          <!-- SLOT 4: MELEE & BREACHING TOOL (SLEDGEHAMMER / KARAMBIT / BUTTERFLY KNIFE) -->
          <div class="abi-slot-card" style="border-color:${
            this.player?.equippedHammerSkin ? '#ffd32a' : 'rgba(255,255,255,0.22)'
          };background:${
            this.player?.equippedHammerSkin
              ? 'rgba(34,26,10,0.92)'
              : 'rgba(14,22,32,0.92)'
          };">
            <div class="abi-slot-header">
              <span style="color:${this.player?.equippedHammerSkin ? '#ffd32a' : '#bdc3c7'};">
                SLOT 4 // MELEE &amp; BREACHING [KEY 4]
              </span>
              <span class="abi-cell-tag" style="${
                this.player?.equippedHammerSkin
                  ? 'background:rgba(255,211,42,0.25);color:#ffd32a;'
                  : ''
              }">
                ${
                  this.player?.equippedHammerSkin === 'karambit'
                    ? '★ KARAMBIT GOLD (1/10)'
                    : this.player?.equippedHammerSkin === 'butterfly'
                    ? '★ BUTTERFLY KNIFE (1/10)'
                    : 'SLEDGEHAMMER'
                }
              </span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 112px;gap:6px;align-items:center;">
              <div>
                <div style="font-size:11.5px;font-weight:900;color:${
                  this.player?.equippedHammerSkin ? '#ffd32a' : '#fff'
                };">
                  ${
                    this.player?.equippedHammerSkin === 'karambit'
                      ? '★ KARAMBIT // TIGER CLAW GOLD'
                      : this.player?.equippedHammerSkin === 'butterfly'
                      ? '★ BUTTERFLY // SAPPHIRE & GOLD'
                      : 'TACTICAL SLEDGEHAMMER'
                  }
                </div>
                <div style="font-size:9px;color:#bdc3c7;margin-top:2px;">
                  85 DMG • 100 VOXEL BREACH • SLOT [4]
                </div>
              </div>
              <div style="background:rgba(0,0,0,0.38);border-radius:4px;padding:2px;">
                ${this.buildWeaponSvg('hammer', {}, { height: 38 })}
              </div>
            </div>
            <div style="display:flex;gap:4px;margin-top:4px;">
              <button type="button" class="gs-equip-gold-skin-btn" data-skin-id="hammer_karambit" style="flex:1;background:${
                this.player?.equippedHammerSkin === 'karambit'
                  ? '#f39c12'
                  : this.player?.ownedSkins?.has('hammer_karambit')
                  ? 'rgba(241,196,15,0.25)'
                  : 'rgba(255,255,255,0.08)'
              };color:${
                this.player?.equippedHammerSkin === 'karambit' ? '#111' : '#ffd32a'
              };border:1px solid #ffd32a;border-radius:3px;padding:3px 5px;font-size:8.5px;font-weight:900;cursor:pointer;">
                ${
                  this.player?.equippedHammerSkin === 'karambit'
                    ? '✓ ★ KARAMBIT'
                    : this.player?.ownedSkins?.has('hammer_karambit')
                    ? 'EQUIP KARAMBIT'
                    : '🔒 KARAMBIT (CASE)'
                }
              </button>
              <button type="button" class="gs-equip-gold-skin-btn" data-skin-id="hammer_butterfly" style="flex:1;background:${
                this.player?.equippedHammerSkin === 'butterfly'
                  ? '#0652dd'
                  : this.player?.ownedSkins?.has('hammer_butterfly')
                  ? 'rgba(6,82,221,0.3)'
                  : 'rgba(255,255,255,0.08)'
              };color:#fff;border:1px solid #00d2d3;border-radius:3px;padding:3px 5px;font-size:8.5px;font-weight:900;cursor:pointer;">
                ${
                  this.player?.equippedHammerSkin === 'butterfly'
                    ? '✓ ★ BUTTERFLY'
                    : this.player?.ownedSkins?.has('hammer_butterfly')
                    ? 'EQUIP BUTTERFLY'
                    : '🔒 BUTTERFLY (CASE)'
                }
              </button>
              <button type="button" class="gs-tab-btn" data-tab="cases" style="flex:1;background:#d35400;color:#fff;border:1px solid #f1c40f;border-radius:3px;padding:3px 5px;font-size:8.5px;font-weight:900;cursor:pointer;">
                🎰 $500 CASES
              </button>
            </div>
          </div>
          </div>

          <div style="display:${rigSubTab === 'gear' ? 'flex' : 'none'};flex-direction:column;gap:6px;">
          <!-- TARKOV CHEST RIG & ARMORED PLATE CARRIER (3x3 CELLS) -->
          <div class="abi-slot-card armor-slot" style="overflow:hidden;min-width:0;max-width:100%;box-sizing:border-box;">
            <div class="abi-slot-header">
              <span style="color:#f1c40f;">CHEST RIG // ARMOR &amp; FAST-RELOAD MAG POUCHES</span>
              <span class="abi-cell-tag">${equippedVestItem?.magSlots || 4} MAG SLOTS • ${Math.round((1 - (equippedVestItem?.magSwapMult || 1)) * 100)}% FASTER SWAP</span>
            </div>
            <div style="display:grid;grid-template-columns:58px minmax(0,1fr);gap:8px;align-items:center;">
              <div style="background:rgba(0,0,0,0.35);border-radius:4px;padding:2px;">
                ${this.buildGearSvg('vest', equippedVestId)}
              </div>
              <div style="min-width:0;">
                <div style="font-size:11px;font-weight:900;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${equippedVestItem ? equippedVestItem.name : 'LIGHT CHEST RIG'}</div>
                <div style="font-size:9.5px;color:#7bed9f;margin:1px 0 3px 0;">
                  ARMOR: <b>${Math.ceil(this.player.armor ?? (equippedVestItem?.maxArmor || 50))}/${this.player.maxArmor || equippedVestItem?.maxArmor || 50} HP</b> • <b>+${equippedVestItem?.bonusMags || 0} RIG MAGS</b>
                </div>
                <div style="display:flex;gap:3px;flex-wrap:wrap;">
                  ${vestQuickBtnsHtml}
                </div>
              </div>
            </div>
          </div>

          <!-- HEADGEAR, PANORAMIC NVG & TARKOV AUTO-STIM RIG -->
          <div class="abi-slot-card armor-slot" style="border-color:rgba(0, 255, 136, 0.45);overflow:hidden;min-width:0;max-width:100%;box-sizing:border-box;">
            <div class="abi-slot-header">
              <span style="color:#00ff88;">🪖 HEADGEAR, NVG &amp; TARKOV STIM RIG</span>
              <span class="abi-cell-tag">${equippedTacGearItem?.hasThermalGoggles ? 'NVG / IR [N]' : `+${equippedTacGearItem?.bonusArmor || 0} ARMOR`}</span>
            </div>
            <div style="display:grid;grid-template-columns:58px minmax(0,1fr);gap:8px;align-items:center;">
              <div style="background:rgba(0,0,0,0.35);border-radius:4px;padding:2px;">
                ${this.buildGearSvg('tacticalGear', equippedTacGearId)}
              </div>
              <div style="min-width:0;">
                <div style="font-size:11px;font-weight:900;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${equippedTacGearItem ? equippedTacGearItem.name : 'ACH INFANTRY HELMET'}</div>
                <div style="font-size:9px;color:#74b9ff;margin:1px 0 3px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                  ${equippedTacGearItem ? equippedTacGearItem.desc : 'Standard ballistic helmet.'}
                </div>
                <div style="display:flex;gap:3px;flex-wrap:wrap;">
                  ${tacGearQuickBtnsHtml}
                </div>
              </div>
            </div>
          </div>

          <!-- TARKOV BACKPACK // STORAGE & LOOSE BULLETS POOL (S / M / L / XL) -->
          <div class="abi-slot-card armor-slot" style="border-color:rgba(46, 204, 113, 0.45);overflow:hidden;min-width:0;max-width:100%;box-sizing:border-box;">
            <div class="abi-slot-header">
              <span style="color:#2ecc71;">🎒 BACKPACK // LOOSE BULLETS &amp; EXTRA GEAR (TARKOV)</span>
              <span class="abi-cell-tag">${equippedBackpackItem?.gridLabel || '2×2 (4 CELLS)'}</span>
            </div>
            <div style="display:grid;grid-template-columns:58px minmax(0,1fr);gap:8px;align-items:center;">
              <div style="background:rgba(0,0,0,0.35);border-radius:4px;padding:2px;">
                ${this.buildGearSvg('backpack', equippedBackpackId)}
              </div>
              <div style="min-width:0;">
                <div style="font-size:11px;font-weight:900;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${equippedBackpackItem ? equippedBackpackItem.name : 'NO BACKPACK (POCKETS)'}</div>
                <div style="font-size:9.5px;color:#f1c40f;margin:1px 0 3px 0;">
                  LOOSE AMMO: <b>+${loosePrimaryRds} RDS</b> (SLOW PACK [P/HOLD R]) • <b>+${equippedBackpackItem?.bonusMags || 0} MAGS</b>
                </div>
                <div style="display:flex;gap:3px;flex-wrap:wrap;">
                  ${backpackQuickBtnsHtml}
                </div>
                <button type="button" class="gs-tab-btn" data-tab="backpack" style="margin-top:5px;width:100%;background:${activeTab === 'backpack' ? '#8e44ad' : 'rgba(155,89,182,0.32)'};border:1px solid #9b59b6;color:#fff;border-radius:4px;padding:4px 8px;font-size:9.5px;font-weight:900;cursor:pointer;letter-spacing:0.4px;">
                  🎒 ${activeTab === 'backpack' ? '✓ VIEWING 2D BACKPACK & ENEMY LOOT [I]' : 'OPEN 2D BACKPACK & ENEMY LOOT VIEW [I]'}
                </button>
              </div>
            </div>
          </div>

          <!-- TACTICAL RIG POCKETS & POUCHES (1x2 MAGS, LOOSE AMMO, FRAGS, MEDS) -->
          <div>
            <div style="font-size:9.5px;font-weight:900;color:#95a5a6;margin-bottom:4px;letter-spacing:0.5px;">
              FAST RELOAD [R] (CHEST RIG MAGS) vs. SLOW RELOAD [P / HOLD R] (BACKPACK LOOSE BULLETS)
            </div>
            <div class="abi-rig-pockets">
              <div class="abi-pocket-cell">
                <span style="font-size:8px;color:#95a5a6;font-weight:900;">RIG MAGS [R]</span>
                <div style="font-size:12.5px;font-weight:900;color:#f1c40f;">${magCount}× MAGS</div>
                <span style="font-size:8.5px;color:#bdc3c7;">${customPrimaryDef.clipSize}/${customPrimaryDef.reserveAmmo} RDS</span>
              </div>
              <div class="abi-pocket-cell">
                <span style="font-size:8px;color:#95a5a6;font-weight:900;">PACK LOOSE [P]</span>
                <div style="font-size:12.5px;font-weight:900;color:#7bed9f;">🎒 ${loosePrimaryRds} RDS</div>
                <span style="font-size:8.5px;color:#bdc3c7;">SLOW PACK</span>
              </div>
              <div class="abi-pocket-cell">
                <span style="font-size:8px;color:#95a5a6;font-weight:900;">1×1 FRAG</span>
                <div style="font-size:12.5px;font-weight:900;color:#e67e22;">💣 ${fragsCount}× M67</div>
                <span style="font-size:8.5px;color:#bdc3c7;">KEY [G]</span>
              </div>
              <div class="abi-pocket-cell">
                <span style="font-size:8px;color:#95a5a6;font-weight:900;">1×1 IFAK MED</span>
                <div style="font-size:12.5px;font-weight:900;color:#2ecc71;">🩹 ${bandagesCount}× DRESS</div>
                <span style="font-size:8.5px;color:#bdc3c7;">KEY [H]</span>
              </div>
            </div>
          </div>

          <!-- LIVE WEAPON TELEMETRY BARS -->
          <div style="background:rgba(12,18,26,0.95);border:1px solid rgba(255,255,255,0.12);border-radius:5px;padding:7px 9px;">
            <div style="font-size:10px;font-weight:900;color:#f1c40f;margin-bottom:4px;letter-spacing:0.5px;">
              📊 BALLISTIC TELEMETRY (${customWorkbenchDef.shortName})
            </div>
            ${this.buildWeaponStatBarsHtml(baseWorkbenchDef, customWorkbenchDef)}
          </div>
          </div>
        </div>
      `;
    };

    // ─── RIGHT PANEL MODE 1: VISUAL MULTI-CELL STASH GRID ("TETRIS" WAREHOUSE) ──
    const renderVisualStashMode = () => {
      // Build unified Stash Grid items:
      // 1) Primary Firearms (4x2, 3x2, 5x2)
      // 2) Secondary Sidearms (2x1)
      // 3) Optics, Muzzles, Grips, Magazines, Ammo, Armor Vests (2x1 / 1x1 / 2x2)
      // 4) Warehouse Supply Crates (2x2)
      const stashCellsHtml = [];
      let usedCells = 0;

      // Filter helper
      const showFirearms = stashFilter === 'all' || stashFilter === 'firearms';
      const showOptics = stashFilter === 'all' || stashFilter === 'optics';
      const showParts = stashFilter === 'all' || stashFilter === 'parts';
      const showArmorAmmo = stashFilter === 'all' || stashFilter === 'armor_ammo';
      const showCrates = stashFilter === 'all' || stashFilter === 'crates';

      // Sort order: if _stashSorted is toggled, owned & equipped items float to the top
      const sortWeapons = (list) => {
        if (!this._stashSorted) return list;
        return [...list].sort((a, b) => {
          const aOwn = ownedWeapons.has(a.id) || (a.warehousePrice || 0) === 0 ? 1 : 0;
          const bOwn = ownedWeapons.has(b.id) || (b.warehousePrice || 0) === 0 ? 1 : 0;
          return bOwn - aOwn || (a.warehousePrice || 0) - (b.warehousePrice || 0);
        });
      };

      if (showFirearms) {
        for (const w of sortWeapons([...primaryGuns, ...secondaryGuns])) {
          const isSec = w.slot === 'secondary';
          const gMeta = WEAPON_GRID_SIZES[w.id] || {
            cols: isSec ? 2 : 4,
            rows: isSec ? 1 : 2,
            label: isSec ? '2×1' : '4×2',
            cat: isSec ? 'SIDEARM' : 'RIFLE'
          };
          const spanClass = `span-${gMeta.cols}x${gMeta.rows}`;
          const allowed = isSec || !w.allowedClasses || w.allowedClasses.includes(activeRole);
          const isOwned = ownedWeapons.has(w.id) || (w.warehousePrice || 0) === 0;
          const isEquipped = (isSec ? secondaryId : primaryId) === w.id;
          const price = w.warehousePrice || 0;
          const canAfford = totalCash >= price;

          if (isOwned) usedCells += gMeta.cols * gMeta.rows;

          const gunAtts = this.player.getWeaponAttachmentMap
            ? this.player.getWeaponAttachmentMap(w.id)
            : {};

          const borderCol = isEquipped
            ? '#2ecc71'
            : !allowed
            ? 'rgba(255,255,255,0.1)'
            : isOwned
            ? 'rgba(52, 152, 219, 0.72)'
            : canAfford
            ? 'rgba(241, 196, 15, 0.65)'
            : 'rgba(231, 76, 60, 0.4)';

          const bgCol = isEquipped
            ? 'rgba(39, 174, 96, 0.19)'
            : isOwned
            ? 'rgba(22, 36, 50, 0.94)'
            : 'rgba(18, 22, 28, 0.94)';

          let btnLabel = '';
          let btnBg = '';
          if (isEquipped) {
            btnLabel = `✓ EQUIPPED`;
            btnBg = '#27ae60';
          } else if (!allowed) {
            btnLabel = `ONLY: ${(w.allowedClasses || []).map((c) => c.toUpperCase().slice(0, 3)).join('/')}`;
            btnBg = '#374151';
          } else if (isOwned) {
            btnLabel = isSec ? 'EQUIP SIDEARM' : `EQUIP ON ${activeRole.toUpperCase()}`;
            btnBg = '#2980b9';
          } else if (canAfford) {
            btnLabel = `UNLOCK ($${price})`;
            btnBg = '#f39c12';
          } else {
            btnLabel = `LOCKED ($${price})`;
            btnBg = '#4b5563';
          }

          stashCellsHtml.push(`
            <div class="abi-stash-item ${spanClass}" style="background-color:${bgCol};border:1.5px solid ${borderCol};opacity:${allowed ? '1' : '0.58'};">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;">
                <div style="display:flex;align-items:center;gap:4px;min-width:0;">
                  <span class="abi-cell-tag">${gMeta.label}</span>
                  <span style="font-size:11.5px;font-weight:900;color:${isEquipped ? '#7bed9f' : '#fff'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${w.name}</span>
                </div>
                <span style="font-size:10px;font-weight:900;color:${isEquipped ? '#2ecc71' : isOwned ? '#74b9ff' : '#f1c40f'};flex-shrink:0;">
                  ${isEquipped ? 'IN RIG' : price === 0 ? 'STARTER' : isOwned ? 'STASHED' : `$${price}`}
                </span>
              </div>

              <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:2px 4px;">
                ${this.buildWeaponSvg(w.id, gunAtts, { height: isSec ? 34 : 52 })}
              </div>

              <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;margin-top:2px;">
                <span style="font-size:9.5px;color:#bdc3c7;font-weight:800;">
                  DMG <b>${w.damage}${w.pellets ? `×${w.pellets}` : ''}</b> • <b>${w.rpm}</b> RPM • <b>${w.clipSize}R</b>
                </span>
                <div style="display:flex;gap:3px;">
                  ${
                    allowed && isOwned
                      ? `<button type="button" class="gs-stash-build-btn" data-slot="${isSec ? 'secondary' : 'primary'}" data-weapon="${w.id}" style="background:rgba(52,152,219,0.28);border:1px solid #3498db;color:#74b9ff;border-radius:3px;padding:3px 6px;font-size:9.5px;font-weight:900;cursor:pointer;" title="Open ${w.shortName} in Gunsmith Blueprint Workbench">🔧 BUILD</button>`
                      : ''
                  }
                  <button type="button" class="gs-weapon-btn" data-slot="${isSec ? 'secondary' : 'primary'}" data-weapon="${w.id}" ${
                    !allowed ? 'disabled' : ''
                  } style="background:${btnBg};color:${
                    !isEquipped && !isOwned && canAfford && allowed ? '#111' : '#fff'
                  };border:none;border-radius:3px;padding:3px 7px;font-size:9.5px;font-weight:900;cursor:${
                    allowed ? 'pointer' : 'not-allowed'
                  };">
                    ${btnLabel}
                  </button>
                </div>
              </div>
            </div>
          `);
        }
      }

      // Add Attachment / Optic / Armor / Backpack / Tactical Gear cells to the Visual Stash Grid
      const attStashGroups = [
        { key: 'optic', show: showOptics, span: 'span-2x1', cellLabel: '2×1 OPTIC', cells: 2 },
        { key: 'muzzle', show: showParts, span: 'span-2x1', cellLabel: '2×1 MUZZLE', cells: 2 },
        { key: 'grip', show: showParts, span: 'span-2x1', cellLabel: '2×1 GRIP/LASER', cells: 2 },
        { key: 'magazine', show: showParts, span: 'span-2x1', cellLabel: '2×1 MAG', cells: 2 },
        { key: 'ammoType', show: showArmorAmmo, span: 'span-2x1', cellLabel: '2×1 AMMO', cells: 2 },
        { key: 'vest', show: showArmorAmmo, span: 'span-2x2', cellLabel: '2×2 CHEST RIG', cells: 4 },
        { key: 'tacticalGear', show: showArmorAmmo, span: 'span-2x2', cellLabel: '2×2 HEAD/NVG', cells: 4 },
        { key: 'backpack', show: showArmorAmmo, span: 'span-2x2', cellLabel: '2×2 BACKPACK', cells: 4 }
      ];

      for (const grp of attStashGroups) {
        if (!grp.show) continue;
        const list = ATTACHMENT_CATALOG[grp.key] || [];
        for (const item of list) {
          // Skip stock/default $0 items in stash unless optic factory (Bare Iron Sights)
          if (item.price === 0 && grp.key !== 'optic') continue;
          const isGearSlot =
            grp.key === 'vest' || grp.key === 'backpack' || grp.key === 'tacticalGear';
          const isEquipped =
            grp.key === 'vest'
              ? equippedVestId === item.id
              : grp.key === 'backpack'
              ? equippedBackpackId === item.id
              : grp.key === 'tacticalGear'
              ? equippedTacGearId === item.id
              : (wepAttMap[grp.key] || (grp.key === 'optic' ? 'factory' : 'stock')) === item.id;
          const isOwned = ownedUpgrades.has(item.id) || item.price === 0;
          const canAfford = totalCash >= item.price;
          if (isOwned) usedCells += grp.cells;

          const borderCol = isEquipped
            ? '#2ecc71'
            : isOwned
            ? 'rgba(52,152,219,0.68)'
            : canAfford
            ? 'rgba(241,196,15,0.55)'
            : 'rgba(255,255,255,0.14)';

          const stashTagExtra =
            grp.key === 'optic' && item.isThermal
              ? ' • 🌡️ IR'
              : grp.key === 'optic' && Array.isArray(item.zoomLevels)
              ? ` • ${item.zoomLevels[0]}X⇄${item.zoomLevels[1]}X`
              : '';

          const mountedGuns =
            !isGearSlot && typeof this.player?.getWeaponsUsingUpgrade === 'function'
              ? this.player.getWeaponsUsingUpgrade(grp.key, item.id)
              : [];
          const mountedInfo =
            mountedGuns.length > 0
              ? ` • ON: ${mountedGuns.slice(0, 3).join(', ')}${mountedGuns.length > 3 ? ` +${mountedGuns.length - 3}` : ''}`
              : '';

          stashCellsHtml.push(`
            <div class="abi-stash-item ${grp.span}" style="background-color:${
              isEquipped ? 'rgba(46,204,113,0.16)' : 'rgba(16,25,36,0.94)'
            };border:1.5px solid ${borderCol};">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:3px;">
                <span class="abi-cell-tag">${grp.cellLabel}${stashTagExtra}</span>
                <span style="font-size:9.5px;font-weight:900;color:${
                  isEquipped ? '#7bed9f' : isOwned ? '#74b9ff' : '#f1c40f'
                };">${isEquipped ? 'MOUNTED' : item.price === 0 ? 'DEFAULT' : isOwned ? 'OWNED • ∞ GUNS' : `$${item.price}`}</span>
              </div>
              <div style="display:flex;align-items:center;gap:6px;margin:2px 0;">
                ${
                  grp.key === 'vest'
                    ? `<div style="width:46px;flex-shrink:0;">${this.buildGearSvg('vest', item.id)}</div>`
                    : grp.key === 'backpack'
                    ? `<div style="width:46px;flex-shrink:0;">${this.buildGearSvg('backpack', item.id)}</div>`
                    : grp.key === 'tacticalGear'
                    ? `<div style="width:46px;flex-shrink:0;">${this.buildGearSvg('tacticalGear', item.id)}</div>`
                    : ''
                }
                <div style="min-width:0;flex:1;">
                  <div style="font-size:10.5px;font-weight:900;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.shortName || item.name}</div>
                  <div style="font-size:9px;color:#95a5a6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${mountedInfo ? `<b style="color:#74b9ff;">${mountedInfo.slice(3)}</b> • ` : ''}${item.desc}</div>
                </div>
              </div>
              <div style="display:flex;gap:3px;">
                <button type="button" class="gunsmith-item-btn" data-cat="${grp.key}" data-id="${item.id}" data-weapon="${workbenchWeaponId}" style="
                  flex:1;background:${isEquipped ? '#27ae60' : isOwned ? '#2980b9' : canAfford ? '#f39c12' : '#4b5563'};
                  color:${!isEquipped && !isOwned && canAfford ? '#111' : '#fff'};
                  border:none;border-radius:3px;padding:3px 6px;font-size:9px;font-weight:900;cursor:pointer;
                ">
                  ${
                    isEquipped
                      ? `✓ ON ${isGearSlot ? 'OPERATOR' : baseWorkbenchDef.shortName}`
                      : isOwned
                      ? `MOUNT ON ${isGearSlot ? 'OPERATOR' : baseWorkbenchDef.shortName}`
                      : canAfford
                      ? `BUY & MOUNT ($${item.price})`
                      : `NEED $${item.price}`
                  }
                </button>
                ${
                  isOwned && !isGearSlot && item.price > 0
                    ? `<button type="button" class="gs-mount-all-guns-btn" data-cat="${grp.key}" data-id="${item.id}" title="Mount ${item.shortName || item.name} across ALL owned guns simultaneously" style="background:rgba(0,210,211,0.22);border:1px solid #00d2d3;color:#81ecec;border-radius:3px;padding:3px 5px;font-size:8.5px;font-weight:900;cursor:pointer;flex-shrink:0;">⚡ ALL GUNS</button>`
                    : ''
                }
              </div>
            </div>
          `);
        }
      }

      // Add Warehouse Supply Stockpile Crates (2x2 cells)
      if (showCrates) {
        const crateDefs = [
          {
            key: 'armorPlates',
            name: 'ARMOR PLATE CRATE',
            count: stock.armorPlates,
            desc: '+25 Over-Armor Plate HP',
            useLabel: 'EQUIP PLATE',
            col: '#74b9ff'
          },
          {
            key: 'medStims',
            name: 'COMBAT STIM CASE',
            count: stock.medStims,
            desc: 'Full 100 HP + +2 Bandages',
            useLabel: 'INJECT STIM',
            col: '#7bed9f'
          },
          {
            key: 'ammoPacks',
            name: 'BANDOLIER AMMO BOX',
            count: stock.ammoPacks,
            desc: 'Full Mags + +2 Frag Grenades',
            useLabel: 'UNPACK AMMO',
            col: '#f1c40f'
          }
        ];

        for (const c of crateDefs) {
          usedCells += Math.min(8, (c.count || 0) * 2);
          stashCellsHtml.push(`
            <div class="abi-stash-item span-2x2" style="background-color:rgba(18,28,36,0.95);border:1.5px solid rgba(241,196,15,0.45);">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span class="abi-cell-tag">2×2 CRATE</span>
                <span style="font-size:10.5px;font-weight:900;color:${c.col};">×${c.count} IN STASH</span>
              </div>
              <div style="text-align:center;margin:2px 0;">
                ${this.buildGearSvg('crate', c.key)}
                <div style="font-size:10.5px;font-weight:900;color:#fff;">${c.name}</div>
                <div style="font-size:9px;color:#bdc3c7;">${c.desc}</div>
              </div>
              <div style="display:flex;gap:3px;">
                <button type="button" class="gs-stock-buy-btn" data-stock="${c.key}" style="flex:1;background:#f39c12;color:#111;border:none;border-radius:3px;padding:3px 4px;font-size:9px;font-weight:900;cursor:pointer;">+1 ($250)</button>
                <button type="button" class="gs-stock-use-btn" data-stock="${c.key}" style="flex:1.2;background:#27ae60;color:#fff;border:none;border-radius:3px;padding:3px 4px;font-size:9px;font-weight:900;cursor:pointer;">${c.useLabel}</button>
              </div>
            </div>
          `);
        }
      }

      // 6. SAVED PERSONAL WAREHOUSE LOOT ITEMS (ABI Stash Grid cells with EQUIP / USE and SELL FOR CASH buttons!)
      const savedWhItems = Array.isArray(this.player?.warehouseStashItems)
        ? this.player.warehouseStashItems
        : [];
      if (stashFilter === 'all' || stashFilter === 'saved_loot') {
        for (const sItem of savedWhItems) {
          const isWep = sItem.type === 'weapon';
          usedCells += isWep ? 8 : 2;
          const spanCls = isWep ? 'span-2x4' : 'span-2x2';
          stashCellsHtml.push(`
            <div class="abi-stash-item ${spanCls}" style="background-color:rgba(14,26,38,0.96);border:1.5px solid #2ecc71;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span class="abi-cell-tag">${sItem.grid || '2×2'} SAVED LOOT</span>
                <span style="font-size:9.5px;font-weight:900;color:#7bed9f;">🏛️ IN WAREHOUSE</span>
              </div>
              <div style="text-align:center;margin:2px 0;">
                ${
                  isWep && sItem.weaponId
                    ? this.buildWeaponSvg(sItem.weaponId, {}, { height: 42 })
                    : `<div style="font-size:20px;">${sItem.icon || '📦'}</div>`
                }
                <div style="font-size:10.5px;font-weight:900;color:#fff;margin-top:2px;">${sItem.name}</div>
                <div style="font-size:8.5px;color:#bdc3c7;">From: ${sItem.ownerLabel || 'Extracted Spoils'}</div>
              </div>
              <div style="display:flex;gap:4px;">
                <button type="button" class="gs-wh-saved-use-btn" data-uid="${
                  sItem.uid
                }" style="flex:1.15;background:#2980b9;color:#fff;border:none;border-radius:3px;padding:4px 5px;font-size:9px;font-weight:900;cursor:pointer;">
                  ${isWep ? '⚡ EQUIP GUN' : sItem.type === 'bounty' ? '🏷️ TROPHY' : '⚡ EQUIP / USE'}
                </button>
                <button type="button" class="gs-sell-extracted-btn" data-uid="${
                  sItem.uid
                }" style="flex:1;background:#27ae60;color:#fff;border:none;border-radius:3px;padding:4px 5px;font-size:9px;font-weight:900;cursor:pointer;">
                  💵 SELL +$${sItem.sellPrice || 150}
                </button>
              </div>
            </div>
          `);
        }
      }

      const extractedLoot = Array.isArray(this.player?.extractedRoundLoot)
        ? this.player.extractedRoundLoot
        : [];
      const totalExtractSell = extractedLoot.reduce(
        (sum, it) => sum + Math.max(50, Math.round(it.sellPrice || 150)),
        0
      );

      const extractedLootTrayHtml =
        extractedLoot.length > 0
          ? `
            <div style="background:rgba(12,24,36,0.96);border:1.5px solid #2ecc71;border-radius:6px;padding:9px 12px;margin-bottom:8px;">
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:6px;">
                <div>
                  <span style="font-size:11.5px;font-weight:900;color:#2ecc71;letter-spacing:0.5px;">
                    🎒 EXTRACTED ROUND LOOT (${extractedLoot.length} UNSORTED) — SELL FOR MONEY OR SAVE TO PERSONAL WAREHOUSE
                  </span>
                </div>
                <div style="display:flex;gap:5px;">
                  <button type="button" class="gs-sell-all-extracted-btn" style="background:#27ae60;color:#fff;border:none;border-radius:4px;padding:4px 10px;font-size:10px;font-weight:900;cursor:pointer;">
                    💵 SELL ALL (+$${totalExtractSell.toLocaleString()} VAULT)
                  </button>
                  <button type="button" class="gs-save-all-extracted-btn" style="background:#2980b9;color:#fff;border:none;border-radius:4px;padding:4px 10px;font-size:10px;font-weight:900;cursor:pointer;">
                    🏛️ SAVE ALL TO PERSONAL WAREHOUSE (${extractedLoot.length})
                  </button>
                </div>
              </div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:6px;">
                ${extractedLoot
                  .map(
                    (it) => `
                    <div style="background:rgba(16,28,42,0.95);border:1px solid ${
                      it.type === 'weapon' ? '#f1c40f' : 'rgba(46,204,113,0.5)'
                    };border-radius:5px;padding:6px 8px;display:flex;flex-direction:column;justify-content:space-between;gap:5px;">
                      <div>
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                          <span style="font-size:10.5px;font-weight:900;color:${
                            it.type === 'weapon' ? '#f1c40f' : '#7bed9f'
                          };">${it.icon || '📦'} ${it.name}</span>
                          <span class="abi-cell-tag">${it.grid || '1×1'}</span>
                        </div>
                        <div style="font-size:8.5px;color:#bdc3c7;">From: ${it.ownerLabel || 'Fallen Enemy'}</div>
                        <div style="font-size:8.5px;color:#74b9ff;font-weight:800;">🏛️ ${it.saveSummary || 'Saves in Warehouse'}</div>
                      </div>
                      <div style="display:flex;gap:4px;">
                        <button type="button" class="gs-sell-extracted-btn" data-uid="${
                          it.uid
                        }" style="flex:1;background:#27ae60;color:#fff;border:none;border-radius:3px;padding:4px 6px;font-size:9.5px;font-weight:900;cursor:pointer;">
                          💵 SELL (+$${it.sellPrice || 150})
                        </button>
                        <button type="button" class="gs-save-extracted-btn" data-uid="${
                          it.uid
                        }" style="flex:1.15;background:#2980b9;color:#fff;border:none;border-radius:3px;padding:4px 6px;font-size:9.5px;font-weight:900;cursor:pointer;">
                          🏛️ SAVE TO WAREHOUSE
                        </button>
                      </div>
                    </div>
                  `
                  )
                  .join('')}
              </div>
            </div>
          `
          : '';

      const filterDefs = [
        { id: 'all', label: 'ALL STASH ITEMS' },
        { id: 'saved_loot', label: `🎒 SAVED LOOT (${savedWhItems.length})` },
        { id: 'firearms', label: `🔫 FIREARMS (${primaryGuns.length + secondaryGuns.length})` },
        { id: 'optics', label: `🔭 OPTICS & THERMAL (${(ATTACHMENT_CATALOG.optic || []).length})` },
        { id: 'parts', label: '🔧 MUZZLES / GRIPS / MAGS' },
        { id: 'armor_ammo', label: '🛡️ ARMOR, NVG & AMMO' },
        { id: 'crates', label: '📦 SUPPLY CRATES' }
      ];

      const filterPillsHtml = filterDefs
        .map(
          (f) => `
          <button type="button" class="abi-filter-pill gs-stash-filter-btn ${
            stashFilter === f.id ? 'active' : ''
          }" data-filter="${f.id}">
            ${f.label}
          </button>
        `
        )
        .join('');

      return `
        ${extractedLootTrayHtml}
        <div class="abi-filter-bar">
          <div style="display:flex;gap:4px;flex-wrap:wrap;">
            ${filterPillsHtml}
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:10.5px;font-weight:900;color:#7bed9f;">
              📦 STASH CELLS: ${usedCells} / 120
            </span>
            <button type="button" id="gs-autosort-btn" style="background:rgba(52,152,219,0.22);border:1px solid #3498db;color:#74b9ff;border-radius:4px;padding:4px 8px;font-size:10px;font-weight:900;cursor:pointer;">
              ⇅ AUTO-SORT STASH
            </button>
          </div>
        </div>

        <div class="abi-stash-grid">
          ${stashCellsHtml.join('')}
        </div>
      `;
    };

    // ─── RIGHT PANEL MODE 2: INTERACTIVE SVG GUNSMITH WORKBENCH ──────────────
    const renderWorkbenchMode = () => {
      const categories = [
        {
          key: 'optic',
          short: '1. OPTIC RAIL',
          title: '1. UPPER RECEIVER / PISTOL SLIDE OPTIC RAIL (16 REFLEX, HYBRID, LPVO & IR THERMAL SIGHTS)',
          sub: 'Scroll Wheel in ADS switches magnification on Variable/Hybrid Optics • [V] toggles 45° Canted Sight!',
          items: ATTACHMENT_CATALOG.optic || []
        },
        {
          key: 'muzzle',
          short: '2. MUZZLE',
          title: '2. MUZZLE THREAD, BLAST REGULATORS & SUPPRESSOR ATTACHMENTS',
          sub: 'Lantac Dragon Brake (-35% Recoil), SureFire Warden, SOCOM Silencer, or KAC QDC Heavy Suppressor',
          items: ATTACHMENT_CATALOG.muzzle || []
        },
        {
          key: 'ammoType',
          short: '3. CHAMBER AMMO',
          title: '3. TARKOV SPECIALTY AMMUNITION & CHAMBER LOADS (AP-20 SLUGS / M855A1 / RIP)',
          sub: '12G AP-20 Precision Slugs, M855A1/7N23 Penetrators, RIP Flesh Rounds, M995 AP, or Subsonic Match',
          items: ATTACHMENT_CATALOG.ammoType || []
        },
        {
          key: 'magazine',
          short: '4. MAGAZINE',
          title: '4. MAGAZINE WELL & RELOAD UPGRADES (TAPED JUNGLE / QUAD-60 / DRUM MAGS)',
          sub: 'Taped Jungle Dual-Mag (-38% Reload), PMAG D-60 Quad-Stack (+75%), Extended (+50%), or 2x Drum',
          items: ATTACHMENT_CATALOG.magazine || []
        },
        {
          key: 'grip',
          short: '5. RAIL / LASER',
          title: '5. UNDERBARREL FOREGRIPS, BIPODS & TACTICAL GREEN/IR LASER MODULES',
          sub: 'Zenitco RK-1 45° Cant, Magpul RVG, Harris Swivel Bipod, PEQ-15, or BE Meyers MAWL-C1+ Laser',
          items: ATTACHMENT_CATALOG.grip || []
        },
        {
          key: 'vest',
          short: '6. CHEST RIG',
          title: '6. TARKOV TACTICAL CHEST RIG & ARMORED PLATE CARRIERS',
          sub: 'Upgrades Armor HP (50→150), adds Fast-Reload Magazine Pouches (+2 to +6 Mags) & speeds up [R] Mag Swaps!',
          items: ATTACHMENT_CATALOG.vest || []
        },
        {
          key: 'backpack',
          short: '7. BACKPACK',
          title: '7. TARKOV BACKPACKS (S / M / L / XL — LOOSE BULLETS & EXTRA MAGS)',
          sub: 'Carries up to +660 Loose Bullets for Slow Reload ([P] / Hold [R]), +4 Spare Mags, +4 Rockets/C4 & Meds!',
          items: ATTACHMENT_CATALOG.backpack || []
        },
        {
          key: 'tacticalGear',
          short: '8. HEAD / NVG',
          title: '8. HEADGEAR, PANORAMIC NVG & TARKOV AUTO-STIM RIG',
          sub: 'Ops-Core FAST MT, Altyn Titanium Faceshield (-40% HS dmg), Propital Regen Pouch, or L3Harris GPNVG-18 [N]!',
          items: ATTACHMENT_CATALOG.tacticalGear || []
        }
      ];

      const hardpointTabsHtml = [
        `<button type="button" class="abi-hardpoint-btn gs-hardpoint-filter ${
          activeHardpoint === 'all' ? 'active' : ''
        }" data-hardpoint="all" style="text-align:center;">
          <div style="font-size:8.5px;color:#95a5a6;font-weight:900;">VIEW MODE</div>
          <div style="font-size:10px;font-weight:900;color:#f1c40f;">ALL 8 SLOTS</div>
        </button>`,
        ...categories.map((cat) => {
          const isSel = activeHardpoint === cat.key;
          const eqItem =
            cat.key === 'vest'
              ? equippedVestItem
              : cat.key === 'backpack'
              ? equippedBackpackItem
              : cat.key === 'tacticalGear'
              ? equippedTacGearItem
              : (cat.items || []).find(
                  (i) => i.id === (wepAttMap[cat.key] || (cat.key === 'optic' ? 'factory' : 'stock'))
                ) || cat.items[0];
          return `
            <button type="button" class="abi-hardpoint-btn gs-hardpoint-filter ${
              isSel ? 'active' : ''
            }" data-hardpoint="${cat.key}">
              <div style="font-size:8px;color:#95a5a6;font-weight:900;">${cat.short}</div>
              <div style="font-size:9.5px;font-weight:900;color:#7bed9f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                ${eqItem ? eqItem.shortName || eqItem.name : 'STOCK'}
              </div>
            </button>
          `;
        })
      ].join('');

      const visibleCategories =
        activeHardpoint === 'all'
          ? categories
          : categories.filter((c) => c.key === activeHardpoint);

      const matchesOpticFilter = (item) => {
        if (opticFilter === 'all') return true;
        const ot = item.opticType;
        if (opticFilter === '1x') {
          return !ot || ['rmr', 'reddot', 'kobra', 'okp7', 'holo', 'uh1'].includes(ot);
        }
        if (opticFilter === 'mid') {
          return ['prism2x', 'holo3x', 'acog', 'elcan4x'].includes(ot);
        }
        if (opticFilter === 'lpvo_sniper') {
          return ['valday6x', 'lpvo36', 'sniper8x', 'sniper12x'].includes(ot);
        }
        if (opticFilter === 'thermal') {
          return Boolean(item.isThermal || ot === 'flir');
        }
        return true;
      };

      const renderCategoryHtml = (cat) => {
        const isGearCat =
          cat.key === 'vest' || cat.key === 'backpack' || cat.key === 'tacticalGear';
        const filteredItems =
          cat.key === 'optic' ? cat.items.filter(matchesOpticFilter) : cat.items;

        const opticFilterBarHtml =
          cat.key === 'optic'
            ? `
              <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px;">
                ${[
                  { id: 'all', label: `ALL OPTICS (${cat.items.length})` },
                  { id: '1x', label: '1X REFLEX / HOLO' },
                  { id: 'mid', label: '2X–4X MID / HYBRID' },
                  { id: 'lpvo_sniper', label: '3X–12X LPVO / SNIPER' },
                  { id: 'thermal', label: '🌡️ IR THERMAL' }
                ]
                  .map(
                    (f) => `
                  <button type="button" class="abi-filter-pill gs-optic-filter-btn ${
                    opticFilter === f.id ? 'active' : ''
                  }" data-optic-filter="${f.id}" style="padding:3px 8px;font-size:9.5px;">
                    ${f.label}
                  </button>
                `
                  )
                  .join('')}
              </div>
            `
            : '';

        const cardsHtml = filteredItems
          .map((item) => {
            const isEquipped =
              cat.key === 'vest'
                ? equippedVestId === item.id
                : cat.key === 'backpack'
                ? equippedBackpackId === item.id
                : cat.key === 'tacticalGear'
                ? equippedTacGearId === item.id
                : (wepAttMap[cat.key] || (cat.key === 'optic' ? 'factory' : 'stock')) === item.id;
            const isOwned =
              (ownedUpgrades instanceof Set
                ? ownedUpgrades.has(item.id)
                : Boolean(ownedUpgrades[cat.key] && ownedUpgrades[cat.key].includes(item.id))) ||
              item.price === 0;
            const canAfford = totalCash >= item.price;

            const borderCol = isEquipped
              ? '#2ecc71'
              : item.isThermal
              ? '#ff9f43'
              : isOwned
              ? 'rgba(52, 152, 219, 0.7)'
              : canAfford
              ? 'rgba(241, 196, 15, 0.55)'
              : 'rgba(255, 255, 255, 0.14)';
            const bgCol = isEquipped
              ? 'rgba(46, 204, 113, 0.18)'
              : item.isThermal
              ? 'rgba(48, 28, 12, 0.92)'
              : isOwned
              ? 'rgba(41, 128, 185, 0.14)'
              : 'rgba(15, 24, 34, 0.94)';

            let btnText = '';
            let btnBg = '';
            if (isEquipped) {
              btnText = `✓ MOUNTED ON ${isGearCat ? 'OPERATOR' : baseWorkbenchDef.shortName}`;
              btnBg = '#27ae60';
            } else if (isOwned) {
              btnText = `MOUNT ON ${isGearCat ? 'OPERATOR' : baseWorkbenchDef.shortName}`;
              btnBg = '#2980b9';
            } else if (canAfford) {
              btnText = `BUY & MOUNT ($${item.price})`;
              btnBg = '#f39c12';
            } else {
              btnText = `NEED $${item.price} (SHORT $${item.price - totalCash})`;
              btnBg = '#4b5563';
            }

            let badgesRowHtml = '';
            if (cat.key === 'optic') {
              const pills = [];
              if (Array.isArray(item.zoomLevels)) {
                pills.push(
                  `<span style="background:rgba(52,152,219,0.25);border:1px solid #48dbfb;color:#74b9ff;padding:1px 5px;border-radius:3px;font-size:8.5px;font-weight:900;">🔄 ${item.zoomLevels[0]}X ⇄ ${item.zoomLevels[1]}X</span>`
                );
              } else {
                const fixedMag =
                  item.opticType === 'sniper8x'
                    ? '8.0X'
                    : item.opticType === 'acog'
                    ? '3.4X'
                    : item.opticType === 'prism2x'
                    ? '2.0X'
                    : '1.0X';
                pills.push(
                  `<span style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);color:#dfe6e9;padding:1px 5px;border-radius:3px;font-size:8.5px;font-weight:900;">🔭 ${fixedMag}</span>`
                );
              }
              if (item.isThermal) {
                pills.push(
                  `<span style="background:rgba(255,159,67,0.25);border:1px solid #ff9f43;color:#ff9f43;padding:1px 5px;border-radius:3px;font-size:8.5px;font-weight:900;">🌡️ IR THERMAL</span>`
                );
              }
              if (item.grantCanted) {
                pills.push(
                  `<span style="background:rgba(46,204,113,0.18);border:1px solid #2ecc71;color:#7bed9f;padding:1px 5px;border-radius:3px;font-size:8.5px;font-weight:900;">🎯 +45° CANTED [V]</span>`
                );
              }
              badgesRowHtml = `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:3px;">${pills.join('')}</div>`;
            }

            const mountedGuns =
              !isGearCat && typeof this.player?.getWeaponsUsingUpgrade === 'function'
                ? this.player.getWeaponsUsingUpgrade(cat.key, item.id)
                : [];
            const mountedBadgeHtml =
              mountedGuns.length > 0
                ? `<div style="font-size:8.5px;font-weight:900;color:#74b9ff;margin-top:2px;">🔗 MOUNTED ON: ${mountedGuns.slice(0, 4).join(', ')}${mountedGuns.length > 4 ? ` +${mountedGuns.length - 4} MORE` : ''}</div>`
                : '';

            return `
              <div style="background:${bgCol};border:1.5px solid ${borderCol};border-radius:5px;padding:7px 9px;display:flex;flex-direction:column;justify-content:space-between;gap:5px;">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
                    <span style="font-size:11.5px;font-weight:900;color:${isEquipped ? '#7bed9f' : '#fff'};">${item.name}</span>
                    <span style="font-size:10px;font-weight:900;color:${item.price === 0 ? '#95a5a6' : isOwned ? '#74b9ff' : '#f1c40f'};flex-shrink:0;">${
              item.price === 0 ? 'FACTORY ($0)' : isOwned ? 'OWNED • ∞ MULTI-GUN' : `$${item.price}`
            }</span>
                  </div>
                  ${badgesRowHtml}
                  ${mountedBadgeHtml}
                  <div style="font-size:9.5px;color:#bdc3c7;margin-top:3px;line-height:1.3;">${item.desc}</div>
                </div>
                <div style="display:flex;gap:4px;">
                  <button type="button" class="gunsmith-item-btn" data-cat="${cat.key}" data-id="${item.id}" data-weapon="${workbenchWeaponId}" style="flex:1;background:${btnBg};color:${
              !isEquipped && !isOwned && canAfford ? '#111' : '#fff'
            };border:none;border-radius:4px;padding:5px 8px;font-size:9.5px;font-weight:900;cursor:pointer;letter-spacing:0.4px;">
                    ${btnText}
                  </button>
                  ${
                    isOwned && !isGearCat && item.price > 0
                      ? `<button type="button" class="gs-mount-all-guns-btn" data-cat="${cat.key}" data-id="${item.id}" title="Mount ${item.shortName || item.name} across ALL owned guns simultaneously" style="background:rgba(0,210,211,0.22);border:1px solid #00d2d3;color:#81ecec;border-radius:4px;padding:5px 7px;font-size:9px;font-weight:900;cursor:pointer;flex-shrink:0;">⚡ ALL GUNS</button>`
                      : ''
                  }
                </div>
              </div>
            `;
          })
          .join('');

        return `
          <div style="margin-bottom:8px;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;flex-wrap:wrap;">
              <span style="font-size:11px;font-weight:900;color:#f1c40f;letter-spacing:0.6px;">${cat.title}</span>
              <span style="font-size:9.5px;color:#95a5a6;">${cat.sub}</span>
            </div>
            ${opticFilterBarHtml}
            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(195px, 1fr));gap:6px;">
              ${cardsHtml}
            </div>
          </div>
        `;
      };

      return `
        <div style="display:flex;gap:6px;margin-bottom:6px;align-items:center;flex-wrap:wrap;">
          <span style="font-size:10.5px;font-weight:900;color:#f1c40f;letter-spacing:0.5px;">🔧 WORKBENCH WEAPON TARGET:</span>
          <button type="button" class="gs-wep-workbench-btn" data-wep-slot="primary" style="flex:1;min-width:210px;padding:6px 10px;border-radius:4px;border:1.5px solid ${
            workbenchSlot === 'primary' ? '#2ecc71' : 'rgba(255,255,255,0.2)'
          };background:${
            workbenchSlot === 'primary' ? 'rgba(46,204,113,0.24)' : 'rgba(15,24,34,0.9)'
          };color:${
            workbenchSlot === 'primary' ? '#7bed9f' : '#ecf0f1'
          };font-size:11px;font-weight:900;cursor:pointer;">
            🔫 [SLOT 1] PRIMARY FIREARM: ${customPrimaryDef.name} (${customPrimaryDef.clipSize}R)
          </button>
          <button type="button" class="gs-wep-workbench-btn" data-wep-slot="secondary" style="flex:1;min-width:210px;padding:6px 10px;border-radius:4px;border:1.5px solid ${
            workbenchSlot === 'secondary' ? '#2ecc71' : 'rgba(255,255,255,0.2)'
          };background:${
            workbenchSlot === 'secondary' ? 'rgba(46,204,113,0.24)' : 'rgba(15,24,34,0.9)'
          };color:${
            workbenchSlot === 'secondary' ? '#7bed9f' : '#ecf0f1'
          };font-size:11px;font-weight:900;cursor:pointer;">
            🔫 [SLOT 2] SIDEARM PISTOL: ${customSecondaryDef.name} (${customSecondaryDef.clipSize}R)
          </button>
        </div>
        ${this.buildWorkbenchBlueprintSvg(
          baseWorkbenchDef,
          customWorkbenchDef,
          wepAttMap,
          activeHardpoint,
          equippedVestItem,
          equippedBackpackItem,
          equippedTacGearItem
        )}
        <div class="abi-hardpoint-tabs" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(84px, 1fr));gap:4px;margin-bottom:6px;">
          ${hardpointTabsHtml}
        </div>
        <div style="flex:1;min-height:0;overflow-y:auto;padding-right:4px;">
          ${visibleCategories.map(renderCategoryHtml).join('')}
        </div>
      `;
    };

    // ─── RIGHT PANEL MODE 3: IN-GAME FIELD REQUISITIONS & EXTRACTION WIRE ─────
    const renderRequisitionsMode = () => {
      const reqCardsHtml = FIELD_REQUISITIONS.map((req) => {
        const canAfford =
          req.id === 'bank_transfer' ? matchCash >= req.price : totalCash >= req.price;
        return `
          <div style="background:rgba(16,25,36,0.96);border:1.5px solid ${
            canAfford ? '#f1c40f' : 'rgba(255,255,255,0.14)'
          };border-radius:6px;padding:12px;display:flex;flex-direction:column;justify-content:space-between;gap:8px;">
            <div>
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:13px;font-weight:900;color:#f1c40f;">${req.icon} ${req.name}</span>
                <span style="font-size:12px;font-weight:900;color:#7bed9f;">$${req.price}</span>
              </div>
              <div style="font-size:11px;color:#bdc3c7;margin-top:4px;line-height:1.4;">${req.desc}</div>
            </div>
            <button type="button" class="gs-req-btn" data-req="${req.id}" style="background:${
          canAfford ? '#27ae60' : '#4b5563'
        };color:#fff;border:none;border-radius:4px;padding:7px 10px;font-size:11px;font-weight:900;cursor:pointer;">
              ${canAfford ? `CALL REQUISITION ($${req.price})` : `NEED $${req.price} CASH`}
            </button>
          </div>
        `;
      }).join('');

      return `
        <div style="background:rgba(18,30,42,0.95);border:1px solid rgba(52,152,219,0.45);border-radius:6px;padding:10px 14px;font-size:11px;color:#ecf0f1;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <div>
            <b>⚡ EXTRACTION VAULT &amp; TACTICAL ECONOMY:</b>
            Earn <b>In-Match Cash ($${matchCash.toLocaleString()})</b> from Kills, Revives &amp; Captures. Extract unspent cash at round end into your <b>Persistent Warehouse Vault ($${whCash.toLocaleString()})</b> with a <b>1.5× Victory Bonus</b>!
          </div>
          <div style="font-size:10.5px;color:#f1c40f;font-weight:900;">
            🏆 Career Extracted: $${(stats.totalExtractedCash || 0).toLocaleString()} (${stats.matchesWon}/${stats.matchesPlayed} Wins)
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(230px, 1fr));gap:10px;">
          ${reqCardsHtml}
        </div>
      `;
    };

    // ─── RIGHT PANEL MODE 4.5: VEHICLE & AIRCRAFT RIDE CUSTOMIZATION BAY ─────
    const renderVehicleBayMode = () => {
      const ownedV = this.player?.ownedVehicleUpgrades || new Set();
      const eqV = this.player?.equippedVehicleUpgrades || {};
      const curAirKills = this.player?.getAirCombatUnlockKills
        ? this.player.getAirCombatUnlockKills()
        : 0;

      const renderSlotSection = (slotKey, title, subtitle, accentCol) => {
        const list = VEHICLE_UPGRADE_CATALOG[slotKey] || [];
        const cardsHtml = list
          .map((item) => {
            const isEquipped = (eqV[slotKey] || list[0]?.id) === item.id;
            const isOwned = ownedV.has(item.id) || item.price === 0;
            const reqKills = item.unlockKills || 0;
            const isUnlocked =
              isOwned ||
              reqKills <= 0 ||
              (this.player?.isVehicleUpgradeUnlocked
                ? this.player.isVehicleUpgradeUnlocked(item)
                : curAirKills >= reqKills);
            const canAfford = totalCash >= item.price;

            const borderCol = isEquipped
              ? '#2ecc71'
              : !isUnlocked
              ? 'rgba(231, 76, 60, 0.45)'
              : isOwned
              ? accentCol
              : canAfford
              ? 'rgba(241,196,15,0.6)'
              : 'rgba(255,255,255,0.14)';
            const bgCol = isEquipped
              ? 'rgba(46,204,113,0.18)'
              : !isUnlocked
              ? 'rgba(26,14,18,0.94)'
              : isOwned
              ? 'rgba(18,32,48,0.95)'
              : 'rgba(12,18,26,0.95)';

            let btnText = '';
            let btnBg = '';
            if (isEquipped) {
              btnText = '✓ INSTALLED ON YOUR RIDE';
              btnBg = '#27ae60';
            } else if (!isUnlocked) {
              btnText = `🔒 LOCKED (${curAirKills}/${reqKills} AIR KILLS TO UNLOCK)`;
              btnBg = '#3b232a';
            } else if (isOwned) {
              btnText = 'INSTALL ON RIDE';
              btnBg = '#2980b9';
            } else if (canAfford) {
              btnText =
                reqKills > 0
                  ? `🔓 UNLOCKED — BUY & INSTALL ($${item.price})`
                  : `BUY & INSTALL ($${item.price})`;
              btnBg = '#f39c12';
            } else {
              btnText = `NEED $${item.price}`;
              btnBg = '#4b5563';
            }

            const unlockPill =
              reqKills > 0
                ? `<span style="display:inline-block;margin-top:3px;padding:1px 6px;border-radius:3px;font-size:9px;font-weight:900;background:${
                    isUnlocked ? 'rgba(46,204,113,0.18)' : 'rgba(231,76,60,0.2)'
                  };border:1px solid ${isUnlocked ? '#2ecc71' : '#ff6b6b'};color:${
                    isUnlocked ? '#7bed9f' : '#ff7675'
                  };">${
                    isUnlocked
                      ? `🔓 UNLOCKED (${reqKills} AIR KILLS)`
                      : `🔒 UNLOCK REQ: ${curAirKills} / ${reqKills} AIR/GUNSHIP KILLS`
                  }</span>`
                : '';

            return `
              <div style="background:${bgCol};border:1.5px solid ${borderCol};border-radius:6px;padding:9px 11px;display:flex;flex-direction:column;justify-content:space-between;gap:6px;">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
                    <span style="font-size:12px;font-weight:900;color:${
                      isEquipped ? '#7bed9f' : !isUnlocked ? '#cbd5e1' : '#fff'
                    };">${item.icon || '⚙️'} ${item.name}</span>
                    <span style="font-size:10px;font-weight:900;color:${
                      item.price === 0 ? '#94a3b8' : isOwned ? '#48dbfb' : '#f1c40f'
                    };">${
                      item.price === 0 ? 'STOCK ($0)' : isOwned ? 'OWNED' : `$${item.price}`
                    }</span>
                  </div>
                  ${unlockPill}
                  <div style="font-size:10px;color:#cbd5e1;margin-top:3px;line-height:1.35;">${
                    item.desc
                  }</div>
                </div>
                <button type="button" class="gs-vehicle-upgrade-btn" data-vslot="${slotKey}" data-vid="${
                  item.id
                }" style="background:${btnBg};color:${
                  isUnlocked && !isEquipped && !isOwned && canAfford ? '#111' : '#fff'
                };border:${!isUnlocked ? '1px solid rgba(255,107,107,0.5)' : 'none'};border-radius:4px;padding:6px 9px;font-size:10px;font-weight:900;cursor:pointer;letter-spacing:0.4px;">
                  ${btnText}
                </button>
              </div>
            `;
          })
          .join('');

        return `
          <div style="margin-bottom:10px;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px;flex-wrap:wrap;">
              <span style="font-size:11.5px;font-weight:900;color:${accentCol};letter-spacing:0.6px;">${title}</span>
              <span style="font-size:9.5px;color:#94a3b8;">${subtitle}</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(215px, 1fr));gap:8px;">
              ${cardsHtml}
            </div>
          </div>
        `;
      };

      const b2BodyCol = this.player?.b2SpiritColor || '#14181f';
      const b2AccentCol = this.player?.b2SpiritAccentColor || '#00d2d3';
      const b2PresetId = this.player?.b2SpiritPresetId || 'midnight_ram';

      const b2PresetButtonsHtml = (B2_COLOR_PRESETS || [])
        .map((p) => {
          const isSel = b2PresetId === p.id;
          return `
            <button type="button" class="gs-b2-preset-btn" data-preset-id="${p.id}" data-body="${p.body}" data-accent="${p.accent}" style="
              background:${isSel ? 'rgba(0,210,211,0.22)' : 'rgba(12,18,28,0.95)'};
              border:2px solid ${isSel ? '#00d2d3' : 'rgba(255,255,255,0.18)'};
              border-radius:6px;padding:6px 8px;display:flex;align-items:center;gap:7px;cursor:pointer;
              box-shadow:${isSel ? '0 0 12px rgba(0,210,211,0.45)' : 'none'};
            ">
              <span style="display:inline-flex;width:24px;height:18px;border-radius:4px;overflow:hidden;border:1px solid rgba(255,255,255,0.45);flex-shrink:0;">
                <span style="flex:1.5;background:${p.body};"></span>
                <span style="flex:1;background:${p.accent};"></span>
              </span>
              <span style="font-size:10px;font-weight:900;color:${isSel ? '#00d2d3' : '#ecf0f1'};text-align:left;line-height:1.15;">
                ${isSel ? '✓ ' : ''}${p.name}
              </span>
            </button>
          `;
        })
        .join('');

      const teamFunds = this.vehicleManager?.getTeamFunds
        ? Math.floor(this.vehicleManager.getTeamFunds(playerTeam))
        : 3200;
      const teamKills = this.vehicleManager?.getTeamKills
        ? this.vehicleManager.getTeamKills(playerTeam)
        : 0;
      const strictDoctrine = this.player?.squadDoctrineEnabled !== false;
      const defaultVSub =
        activeRole === 'armor' || (this.player?.activeVehicle && !this.player.activeVehicle.isAircraft)
          ? 'armor'
          : this.player?.activeVehicle?.aircraftRole === 'gunship'
          ? 'ac130'
          : 'airwing';
      const vSubTab = this._vehicleBaySubTab || defaultVSub;

      return `
        <div style="display:flex;flex-direction:column;gap:7px;height:100%;min-height:0;">
          <!-- COMPACT 1-ROW VEHICLE DISPATCH & SORTIE STRIP (PINNED TOP — ZERO SCROLL!) -->
          <div style="background:linear-gradient(135deg, rgba(8,22,36,0.99), rgba(14,32,48,0.98));border:1.5px solid #48dbfb;border-radius:6px;padding:7px 10px;flex-shrink:0;">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:5px;">
              <div style="font-size:12.5px;font-weight:900;color:#48dbfb;letter-spacing:0.6px;">
                🚀 1-CLICK REQUEST PLANE, TANK OR RECON BIKE &bull; <span style="font-size:10px;color:#cbd5e1;font-weight:700;">Personal Cash: <b style="color:#7bed9f;">$${totalCash.toLocaleString()}</b></span>
              </div>
              <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                <span style="background:rgba(52,152,219,0.18);border:1px solid #48dbfb;color:#81ecec;border-radius:4px;padding:2px 8px;font-size:9.5px;font-weight:900;">
                  🏛️ ${playerTeam} FUNDS: $${teamFunds.toLocaleString()}
                </span>
                <span style="background:rgba(46,204,113,0.18);border:1px solid #2ecc71;color:#7bed9f;border-radius:4px;padding:2px 8px;font-size:9.5px;font-weight:900;">
                  🎖️ AIR KILLS: ${curAirKills}
                </span>
                <button type="button" class="gs-role-btn" data-role="armor" style="background:${activeRole === 'armor' ? '#27ae60' : 'rgba(241,196,15,0.18)'};border:1px solid ${activeRole === 'armor' ? '#2ecc71' : '#f1c40f'};color:#fff;border-radius:4px;padding:2px 7px;font-size:9px;font-weight:900;cursor:pointer;">
                  🛡️ ${activeRole === 'armor' ? '✓ ARMOR CREW' : 'ARMOR CREW'}
                </button>
                <button type="button" class="gs-role-btn" data-role="pilot" style="background:${activeRole === 'pilot' ? '#27ae60' : 'rgba(72,219,251,0.18)'};border:1px solid ${activeRole === 'pilot' ? '#2ecc71' : '#48dbfb'};color:#fff;border-radius:4px;padding:2px 7px;font-size:9px;font-weight:900;cursor:pointer;">
                  ✈️ ${activeRole === 'pilot' ? '✓ PILOT' : 'PILOT'}
                </button>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1.25fr 1.65fr;gap:6px;">
              <div style="display:flex;gap:4px;">
                <button type="button" class="gs-req-vehicle-now-btn" data-vkind="bike" style="flex:1;background:#27ae60;color:#fff;border:none;border-radius:4px;padding:5px 6px;font-size:9.5px;font-weight:900;cursor:pointer;">🏍️ BIKE ($150) [0]</button>
                <button type="button" class="gs-req-vehicle-now-btn" data-vkind="atv" style="flex:1;background:#16a085;color:#fff;border:none;border-radius:4px;padding:5px 6px;font-size:9.5px;font-weight:900;cursor:pointer;">🛞 ATV ($150)</button>
              </div>
              <div style="display:flex;gap:4px;">
                <button type="button" class="gs-req-vehicle-now-btn" data-vkind="tank" style="flex:1;background:#d35400;color:#fff;border:none;border-radius:4px;padding:5px 6px;font-size:9.5px;font-weight:900;cursor:pointer;">🛡️ TANK ($1,100)</button>
                <button type="button" class="gs-req-vehicle-now-btn" data-vkind="apc" style="flex:1;background:#e67e22;color:#fff;border:none;border-radius:4px;padding:5px 6px;font-size:9.5px;font-weight:900;cursor:pointer;">🛡️ IFV ($650)</button>
                <button type="button" class="gs-req-vehicle-now-btn" data-vkind="aa" style="flex:1;background:#c0392b;color:#fff;border:none;border-radius:4px;padding:5px 6px;font-size:9.5px;font-weight:900;cursor:pointer;">📡 AA ($750)</button>
              </div>
              <div style="display:flex;gap:4px;">
                <button type="button" class="gs-req-vehicle-now-btn" data-vkind="air_fighter" style="flex:1;background:#0984e3;color:#fff;border:none;border-radius:4px;padding:5px 5px;font-size:9.5px;font-weight:900;cursor:pointer;">✈️ F-15 ($950)</button>
                <button type="button" class="gs-req-vehicle-now-btn" data-vkind="air_cas" style="flex:1;background:#2980b9;color:#fff;border:none;border-radius:4px;padding:5px 5px;font-size:9.5px;font-weight:900;cursor:pointer;">🐗 A-10 ($800)</button>
                <button type="button" class="gs-req-vehicle-now-btn" data-vkind="air_gunship" style="flex:1;background:#00b894;color:#fff;border:none;border-radius:4px;padding:5px 5px;font-size:9.5px;font-weight:900;cursor:pointer;">🛸 AC-130 ($1,400)</button>
                <button type="button" class="gs-req-vehicle-now-btn" data-vkind="air_b2" style="flex:1.15;background:#6c5ce7;color:#fff;border:none;border-radius:4px;padding:5px 5px;font-size:9.5px;font-weight:900;cursor:pointer;" title="Requires 25 Team Kills">🦇 B-2 (${teamKills}/25K)</button>
              </div>
            </div>
          </div>

          <!-- 4 ZERO-SCROLL SUB-TABS FOR VEHICLE & AIRCRAFT TECH BAYS -->
          <div style="display:flex;gap:6px;flex-shrink:0;">
            ${[
              { id: 'airwing', lbl: '✈️ 1. JETS & SENSORS (F-15 / A-10 / B-2)', col: '#48dbfb' },
              { id: 'ac130', lbl: '🛸 2. AC-130 EVOLUTION (1968 ➔ 2024)', col: '#2ecc71' },
              { id: 'armor', lbl: '🛡️ 3. TANKS, IFVs & AA BAY', col: '#f1c40f' },
              { id: 'b2_secret', lbl: '🦇 4. B-2 PAINT STUDIO & 1903 CAVE', col: '#00d2d3' }
            ]
              .map((st) => {
                const isAct = vSubTab === st.id;
                return `<button type="button" class="gs-veh-subtab-btn" data-vsub="${st.id}" style="flex:1;padding:6px 8px;border-radius:5px;border:1.5px solid ${
                  isAct ? st.col : 'rgba(255,255,255,0.16)'
                };background:${
                  isAct ? 'rgba(18,36,54,0.98)' : 'rgba(12,18,26,0.9)'
                };color:${isAct ? st.col : '#cbd5e1'};font-size:10.5px;font-weight:900;cursor:pointer;box-shadow:${
                  isAct ? `0 0 10px ${st.col}33` : 'none'
                };">${st.lbl}</button>`;
              })
              .join('')}
          </div>

          <!-- SUB-TAB 1: COMBAT AIRWING HANGAR (2x2 GRID — FITS 100% ON ONE SCREEN!) -->
          <div style="display:${vSubTab === 'airwing' ? 'flex' : 'none'};flex-direction:column;gap:6px;flex:1;min-height:0;overflow-y:auto;">
            <div style="background:rgba(12,18,26,0.96);border:1px solid rgba(72,219,251,0.35);border-radius:6px;padding:8px 10px;">
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:6px;">
                <span style="font-size:11.5px;font-weight:900;color:#48dbfb;">✈️ DEFAULT [9] SORTIE AIRFRAME &amp; AVIONICS TECH BAY</span>
                <div style="display:flex;gap:4px;flex-wrap:wrap;">
                  ${[
                    { id: 'fighter', lbl: '✈️ F-15EX / SU-57' },
                    { id: 'cas', lbl: '🐗 A-10C / SU-25' },
                    { id: 'gunship', lbl: '🛸 AC-130J' },
                    { id: 'b2_spirit', lbl: '🦇 B-2A SPIRIT' }
                  ]
                    .map((p) => {
                      const isPref = (this.player?.preferredAircraftRole || 'cas') === p.id;
                      return `<button type="button" class="gs-select-air-role-btn" data-air-role="${p.id}" style="background:${
                        isPref ? 'rgba(0,210,211,0.28)' : 'rgba(20,30,44,0.92)'
                      };border:1.5px solid ${
                        isPref ? '#00d2d3' : 'rgba(255,255,255,0.18)'
                      };color:${
                        isPref ? '#81ecec' : '#cbd5e1'
                      };border-radius:4px;padding:3px 7px;font-size:9px;font-weight:900;cursor:pointer;">${
                        isPref ? '✓ ' : ''
                      }${p.lbl}</button>`;
                    })
                    .join('')}
                </div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                ${renderSlotSection('airSensor', 'SLOT 1 // NVG & SNIPER XR FLIR [KEY N]', 'DAY ➔ NVG ➔ WHOT IR ➔ BHOT IR', '#00d2d3')}
                ${renderSlotSection('airCountermeasure', 'SLOT 2 // ECM JAMMER & FLARES [KEY X]', 'Spoofs Stinger & SAM radar locks', '#48dbfb')}
                ${renderSlotSection('airOrdnance', 'SLOT 3 // ORDNANCE & FOX-3 AMRAAM', 'Faster reload & +blast damage', '#48dbfb')}
                ${renderSlotSection('airFrame', 'SLOT 4 // TITANIUM AIRFRAME & G-VECTOR', '+Max HP & faster roll/pitch agility', '#48dbfb')}
              </div>
              <div style="margin-top:8px;">
                ${renderSlotSection('airAmmoRack', 'SLOT 5 // HEAVY MUNITIONS RACKS (~2× PAYLOAD: AMBER / BRU-55 / B-2 SBRA)', 'Doubles missiles/bombs & palletized AC-130 ammo (-4% turn rate)', '#ffd32a')}
              </div>
            </div>
          </div>

          <!-- SUB-TAB 2: AC-130 HISTORICAL-TO-MODERN EVOLUTION (FITS 100% ON ONE SCREEN!) -->
          <div style="display:${vSubTab === 'ac130' ? 'flex' : 'none'};flex-direction:column;gap:6px;flex:1;min-height:0;overflow-y:auto;">
            <div style="background:linear-gradient(135deg, rgba(10,22,20,0.98), rgba(12,18,28,0.98));border:1.5px solid #2ecc71;border-radius:6px;padding:8px 10px;">
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:6px;">
                <span style="font-size:12px;font-weight:900;color:#7bed9f;">🛸 AC-130 EVOLUTION (1968 VIETNAM ➔ 2024 GHOSTRIDER) • [Q/Z] ALT 180–9,100M • [SCROLL] ZOOM</span>
                <button type="button" id="gs-open-ac130-manual-btn" style="background:rgba(0,210,211,0.2);border:1px solid #00d2d3;color:#81ecec;border-radius:4px;padding:3px 8px;font-size:9.5px;font-weight:900;cursor:pointer;">📖 [F1] AC-130 MANUAL</button>
              </div>
              ${renderSlotSection('ac130Generation', 'TRACK 1 // AIRFRAME & BELLY EO/IR SENSOR POD [KEY C]', '1968 Rigid Floor ➔ 1995 Belly FLIR Pod ➔ 2024 Ghostrider', '#2ecc71')}
              ${renderSlotSection('ac130Sight', 'TRACK 2 // PILOT LEFT-WINDOW SIGHT (UNLOCK @ 3 KILLS)', 'Analog Pylon HUD ➔ AFSOC EOTech EXPS3 Holographic Sight', '#ff6b81')}
              ${renderSlotSection('ac130Avionics', 'TRACK 3 // FLIR MFD & COUPLED GPS ORBIT [KEY R]', 'Cockpit FLIR Video Repeater (2K) & Coupled GPS Pylon Autopilot (6K)', '#00d2d3')}
              ${renderSlotSection('airAmmoRack', 'TRACK 4 // PALLETIZED CARGO MUNITIONS STOWAGE (~2× ORDNANCE)', '1,800/80/20 Ready Racks ➔ 3,000× 25mm / 192× 40mm / 45× 105mm!', '#ffd32a')}
            </div>
          </div>

          <!-- SUB-TAB 3: GROUND ARMOR BAY (2x2 GRID + HULL STOWAGE — FITS 100% ON ONE SCREEN!) -->
          <div style="display:${vSubTab === 'armor' ? 'flex' : 'none'};flex-direction:column;gap:6px;flex:1;min-height:0;overflow-y:auto;">
            <div style="background:rgba(12,18,26,0.96);border:1px solid rgba(241,196,15,0.35);border-radius:6px;padding:8px 10px;">
              <div style="font-size:11.5px;font-weight:900;color:#f1c40f;margin-bottom:6px;">
                🛡️ GROUND ARMOR BAY (APPLIES IMMEDIATELY ON M1A2 ABRAMS, T-90M, LAV-25, BTR-82A, SPAAG AA &amp; HUMVEE)
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                ${renderSlotSection('armorSensor', 'SLOT 1 // CITV FLIR THERMAL & NVG [KEY N]', 'DAY ➔ NVG ➔ WHOT IR ➔ BHOT IR', '#00d2d3')}
                ${renderSlotSection('armorDefense', 'SLOT 2 // TROPHY APS, ERA & SMOKE [KEY X]', 'Intercepts incoming RPGs & AT missiles', '#f1c40f')}
                ${renderSlotSection('armorWeaponMod', 'SLOT 3 // M829A4 APFSDS & AUTOLOADER', 'Faster cannon reload & higher shell velocity', '#f1c40f')}
                ${renderSlotSection('armorChassis', 'SLOT 4 // AGT-1500 TURBINE & DOZER BLADE', '+Max Hull HP & higher off-road top speed', '#f1c40f')}
              </div>
              <div style="margin-top:8px;">
                ${renderSlotSection('armorAmmoRack', 'SLOT 5 // DEEP-HULL WET AMMO STOWAGE & DOUBLE CANS (~2× MUNITIONS)', '24 ➔ 42 MBT Shells • 210 ➔ 420 IFV 30mm • 8 ➔ 16 SAMs • 1,000 .50 BMG (-4% accel)', '#ffd32a')}
              </div>
            </div>
          </div>

          <!-- SUB-TAB 4: B-2 PAINT STUDIO & 1903 WRIGHT SECRET CAVE (COMPACT SINGLE-VIEW!) -->
          <div style="display:${vSubTab === 'b2_secret' ? 'flex' : 'none'};flex-direction:column;gap:8px;flex:1;min-height:0;overflow-y:auto;">
            <div id="gs-b2-spirit-customizer-card" style="background:linear-gradient(135deg, rgba(10,16,28,0.99), rgba(18,24,42,0.98));border:1.5px solid #00d2d3;border-radius:7px;padding:9px 12px;">
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:6px;">
                <span style="font-size:13px;font-weight:900;color:#00d2d3;">🦇 NORTHROP B-2A SPIRIT STEALTH BOMBER — CUSTOM LIVERY STUDIO</span>
                <div style="display:flex;gap:5px;">
                  <button type="button" id="gs-teleport-b2-lane-btn" style="background:rgba(155,89,182,0.28);border:1px solid #a29bfe;color:#dcdde1;border-radius:4px;padding:5px 9px;font-size:9.5px;font-weight:900;cursor:pointer;">🛫 TELEPORT B-2 LANE 2</button>
                  <button type="button" id="gs-launch-b2-sortie-btn" style="background:linear-gradient(135deg, #00b894, #00cec9);border:1px solid #81ecec;color:#08121a;border-radius:4px;padding:5px 10px;font-size:10px;font-weight:900;cursor:pointer;">🦇 LAUNCH B-2 SORTIE [9]</button>
                </div>
              </div>
              <div style="display:grid;grid-template-columns:185px 1fr;gap:10px;align-items:center;">
                <div style="background:rgba(6,10,16,0.98);border:1px solid rgba(0,210,211,0.4);border-radius:6px;padding:5px;display:flex;justify-content:center;">
                  <svg id="gs-b2-svg-preview" viewBox="0 0 220 130" width="165" height="86">
                    <polygon id="gs-b2-svg-hull" points="110,10 208,82 194,95 162,74 138,94 122,80 110,94 98,80 82,94 58,74 26,95 12,82" fill="${b2BodyCol}" stroke="${b2AccentCol}" stroke-width="2.5"/>
                    <polyline id="gs-b2-svg-trim" points="14,81 110,12 206,81" fill="none" stroke="${b2AccentCol}" stroke-width="3.5"/>
                    <polygon points="110,22 126,56 110,84 94,56" fill="${b2BodyCol}" stroke="${b2AccentCol}" stroke-width="1.2"/>
                    <polygon points="110,28 121,42 114,46 110,36 106,46 99,42" fill="#38bdf8" opacity="0.88"/>
                  </svg>
                </div>
                <div style="display:flex;flex-direction:column;gap:6px;">
                  <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(135px, 1fr));gap:5px;">
                    ${b2PresetButtonsHtml}
                  </div>
                  <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;background:rgba(8,14,22,0.92);border:1px solid rgba(255,255,255,0.14);border-radius:5px;padding:5px 8px;">
                    <label style="display:flex;align-items:center;gap:5px;font-size:10px;font-weight:900;color:#ecf0f1;cursor:pointer;">
                      <span>🎨 HULL:</span>
                      <input type="color" id="gs-b2-body-color-input" value="${b2BodyCol}" style="width:28px;height:20px;border:1px solid #fff;border-radius:3px;background:transparent;cursor:pointer;" />
                    </label>
                    <label style="display:flex;align-items:center;gap:5px;font-size:10px;font-weight:900;color:#ecf0f1;cursor:pointer;">
                      <span>✨ TRIM:</span>
                      <input type="color" id="gs-b2-accent-color-input" value="${b2AccentCol}" style="width:28px;height:20px;border:1px solid #fff;border-radius:3px;background:transparent;cursor:pointer;" />
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div id="gs-wright-flyer-research-card" style="background:linear-gradient(135deg, rgba(28,20,12,0.98), rgba(16,12,8,0.98));border:1.5px solid #f39c12;border-radius:7px;padding:9px 12px;">
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:6px;">
                <span style="font-size:12.5px;font-weight:900;color:#ffd32a;">🕵️ SECRET HQ CAVE: 1903 WRIGHT FLYER I &amp; SPEED ENVELOPE TABLE</span>
                <div style="display:flex;gap:5px;">
                  <button type="button" id="gs-teleport-wright-cave-btn" style="background:rgba(230,126,34,0.28);border:1px solid #f39c12;color:#ffd32a;border-radius:4px;padding:5px 9px;font-size:9.5px;font-weight:900;cursor:pointer;">🕵️ TELEPORT SECRET CAVE</button>
                  <button type="button" id="gs-launch-wright-sortie-btn" style="background:linear-gradient(135deg, #d35400, #f39c12);border:1px solid #ffd32a;color:#111;border-radius:4px;padding:5px 10px;font-size:10px;font-weight:900;cursor:pointer;">🪁 LAUNCH 1903 FLYER</button>
                </div>
              </div>
              <div style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;font-size:9.5px;color:#ecf0f1;background:rgba(0,0,0,0.45);border-radius:4px;overflow:hidden;">
                  <thead>
                    <tr style="background:rgba(243,156,18,0.22);color:#ffd32a;text-align:left;">
                      <th style="padding:4px 7px;">AIRCRAFT</th>
                      <th style="padding:4px 7px;">REAL STALL</th>
                      <th style="padding:4px 7px;">REAL TOP</th>
                      <th style="padding:4px 7px;">GAME MIN / CRUISE / TOP</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${(AIRCRAFT_SPEED_RESEARCH || [])
                      .map(
                        (row) => `
                      <tr style="border-top:1px solid rgba(255,255,255,0.1);">
                        <td style="padding:4px 7px;font-weight:900;color:#74b9ff;">${row.aircraft}</td>
                        <td style="padding:4px 7px;color:#7bed9f;">${row.realLowestSpeed}</td>
                        <td style="padding:4px 7px;color:#ff7675;">${row.realHighestSpeed}</td>
                        <td style="padding:4px 7px;font-weight:900;">${row.gameMinSpeed} / ${row.gameCruiseSpeed} / ${row.gameMaxSpeed}</td>
                      </tr>
                    `
                      )
                      .join('')}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      `;
    };

    // ─── RIGHT PANEL MODE 5: CS2 ARMORY CONTAINER ($50,000 CASE + $250 / IN-BUILDING KEY) ──
    const renderMysteryCasesMode = () => {
      const ownedSkins = this.player?.ownedSkins || new Set();
      const eqWepSkins = this.player?.equippedWeaponSkins || {};
      const eqHammerSkin = this.player?.equippedHammerSkin || null;
      const casesOpened = this.player?.casesOpenedCount || 0;
      const goldUnboxed = this.player?.goldUnboxedCount || 0;
      const caseKeys =
        this.player && typeof this.player.caseKeys === 'number' ? this.player.caseKeys : 1;
      const caseCost = CASE_PRICE || 50000;
      const canAffordCase = totalCash >= caseCost && caseKeys >= 1;
      const canAffordKey = totalCash >= 250;
      const lastRes = this.player?.lastCaseResult || null;
      const goldFilter = this._goldSkinFilter || 'all';
      const isSpinning = Boolean(this._isRouletteSpinning || this._playRouletteSpinNextRender);

      // Build 60-tile CS2 Roulette Strip HTML
      const previewReel =
        lastRes && Array.isArray(lastRes.reel) && lastRes.reel.length > 0
          ? lastRes.reel
          : Array.from({ length: 24 }, (_, idx) => {
              if (idx % 10 === 7) {
                const g = GOLD_SPECIAL_POOL[idx % GOLD_SPECIAL_POOL.length];
                return {
                  isGold: true,
                  id: g.id,
                  name: g.shortName,
                  fullName: g.name,
                  weaponId: g.weaponId,
                  skinFinish: g.skinFinish
                };
              }
              const wId = CASE_GUN_POOL[idx % CASE_GUN_POOL.length];
              const wDef = WEAPON_DEFS[wId] || WEAPON_DEFS.m9_beretta;
              return {
                isGold: false,
                id: wId,
                name: wDef.shortName || wDef.name,
                fullName: wDef.name,
                weaponId: wId,
                skinFinish: null
              };
            });

      const primaryDef = WEAPON_DEFS[primaryId] || WEAPON_DEFS.m4a1;
      const secondaryDef = WEAPON_DEFS[secondaryId] || WEAPON_DEFS.mp443;
      const activePrimarySkin = eqWepSkins[primaryId]
        ? eqWepSkins[primaryId] === 'pure_gold'
          ? '★ 24K GOLD'
          : '★ SAPPHIRE BLUE'
        : 'STANDARD';
      const activeMeleeLabel =
        eqHammerSkin === 'karambit'
          ? '★ KARAMBIT GOLD'
          : eqHammerSkin === 'butterfly'
          ? '★ BUTTERFLY SAPPHIRE'
          : 'BUILD HAMMER';

      const reelTilesHtml = previewReel
        .map((tile, idx) => {
          const isWinTile = Boolean(lastRes && idx === lastRes.winningIndex);
          const showWinHighlight = isWinTile && !isSpinning;
          const rarityBarCol = tile.isGold ? '#ffd700' : '#4b69ff';
          const bgCol = tile.isGold
            ? 'radial-gradient(circle at 50% 45%, rgba(92,70,12,0.95), rgba(18,15,8,0.98))'
            : 'radial-gradient(circle at 50% 45%, rgba(28,45,78,0.95), rgba(12,17,26,0.98))';
          const cleanName = tile.isGold ? `★ ${tile.name.replace(/^★\s*/, '')}` : tile.name;
          return `
            <div class="gs-roulette-tile ${isWinTile ? 'gs-roulette-winner' : ''}" data-tile-idx="${idx}" data-tile-name="${cleanName}" data-tile-gold="${tile.isGold ? '1' : '0'}" style="
              width:128px;min-width:128px;height:98px;border-radius:5px;
              background:${bgCol};border:1.5px solid ${showWinHighlight ? '#2ecc71' : 'rgba(255,255,255,0.16)'};
              border-bottom:4px solid ${showWinHighlight ? '#2ecc71' : rarityBarCol};
              box-shadow:${showWinHighlight ? '0 0 22px rgba(46,204,113,0.9)' : 'none'};
              padding:8px 6px 5px 6px;display:flex;flex-direction:column;justify-content:space-between;
              box-sizing:border-box;position:relative;flex-shrink:0;overflow:visible;
            ">
              <!-- Wheel-of-Fortune Linear Pegs ("Little Pins") along the top rail of every tile -->
              <div class="gs-roulette-pin pin-divider" style="
                position:absolute;top:-8px;left:-4.5px;width:8px;height:14px;border-radius:4px;
                background:radial-gradient(circle at 35% 30%, #ffffff, #ffd700 55%, #b45309 100%);
                border:1.5px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,0.95), 0 0 8px rgba(255,215,0,0.85);
                z-index:7;pointer-events:none;
              "></div>
              <div class="gs-roulette-pin pin-mid" style="
                position:absolute;top:-7px;left:60px;width:7px;height:12px;border-radius:3.5px;
                background:radial-gradient(circle at 35% 30%, #ffffff, #e2e8f0 55%, #64748b 100%);
                border:1px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,0.9), 0 0 6px rgba(255,255,255,0.65);
                z-index:7;pointer-events:none;
              "></div>
              <div style="flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden;">
                ${this.buildWeaponSvg(
                  tile.weaponId || 'm9_beretta',
                  {},
                  { height: 42, skinFinish: tile.skinFinish || null }
                )}
              </div>
              <div style="font-size:9.5px;font-weight:900;color:${
                tile.isGold ? '#ffd700' : '#e2e8f0'
              };white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;">
                ${cleanName}
              </div>
            </div>
          `;
        })
        .join('');

      // Standard 9/10 Case Weapon Pool (CS2 Mil-Spec Blue tiles — minimal text)
      const caseGunCardsHtml = CASE_GUN_POOL.map((wId) => {
        const w = WEAPON_DEFS[wId];
        if (!w) return '';
        const isSec = w.slot === 'secondary';
        const isOwned = ownedWeapons.has(w.id);
        const isEquipped = (isSec ? secondaryId : primaryId) === w.id;
        const allowed = isSec || !w.allowedClasses || w.allowedClasses.includes(activeRole);

        return `
          <div class="${allowed && isOwned ? 'gs-weapon-btn' : ''}" ${
            allowed && isOwned ? `data-slot="${isSec ? 'secondary' : 'primary'}" data-weapon="${w.id}"` : ''
          } style="
            background:radial-gradient(circle at 50% 42%, rgba(30,48,82,0.92), rgba(12,18,28,0.98));
            border:1.5px solid ${isEquipped ? '#2ecc71' : isOwned ? 'rgba(75,105,255,0.65)' : 'rgba(255,255,255,0.12)'};
            border-bottom:4px solid ${isEquipped ? '#2ecc71' : '#4b69ff'};
            border-radius:5px;padding:7px 8px;display:flex;flex-direction:column;justify-content:space-between;
            gap:4px;cursor:${allowed && isOwned ? 'pointer' : 'default'};position:relative;
          " title="${w.name} (${w.caliber})">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-size:8.5px;font-weight:900;color:#94a3b8;">${w.shortName || w.name}</span>
              <span style="font-size:8.5px;font-weight:900;color:${
                isEquipped ? '#2ecc71' : isOwned ? '#7bed9f' : '#64748b'
              };">${isEquipped ? '✓ EQUIPPED' : isOwned ? 'OWNED' : 'MIL-SPEC'}</span>
            </div>
            <div style="height:44px;display:flex;align-items:center;justify-content:center;">
              ${this.buildWeaponSvg(w.id, {}, { height: 38 })}
            </div>
            <div style="font-size:10px;font-weight:900;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;">
              ${w.name}
            </div>
          </div>
        `;
      }).join('');

      // Rare Special Pool (1/10 Gold — Knives + Pure Gold & Pure Blue Skins — NO direct purchase!)
      const filteredGoldPool = GOLD_SPECIAL_POOL.filter((item) => {
        if (goldFilter === 'knives') return item.kind === 'hammer_skin';
        if (goldFilter === 'pure_gold') return item.skinFinish === 'pure_gold';
        if (goldFilter === 'pure_blue') return item.skinFinish === 'pure_blue';
        return true;
      });

      const goldCardsHtml = filteredGoldPool
        .map((item) => {
          const isOwned = ownedSkins.has(item.id);
          const isEquipped =
            item.kind === 'hammer_skin'
              ? eqHammerSkin === item.skinFinish
              : eqWepSkins[item.weaponId] === item.skinFinish;
          const isBlue = item.skinFinish === 'pure_blue' || item.skinFinish === 'butterfly';
          const accent = isBlue ? '#00d2d3' : '#ffd700';

          return `
            <div class="${isOwned ? 'gs-equip-gold-skin-btn' : ''}" ${
              isOwned ? `data-skin-id="${item.id}"` : ''
            } style="
              background:${
                isBlue
                  ? 'radial-gradient(circle at 50% 42%, rgba(12,42,88,0.94), rgba(8,14,26,0.98))'
                  : 'radial-gradient(circle at 50% 42%, rgba(74,56,10,0.94), rgba(16,13,6,0.98))'
              };
              border:1.5px solid ${isEquipped ? '#2ecc71' : isOwned ? accent : 'rgba(255,215,0,0.28)'};
              border-bottom:4px solid ${isEquipped ? '#2ecc71' : '#ffd700'};
              border-radius:5px;padding:7px 8px;display:flex;flex-direction:column;justify-content:space-between;
              gap:4px;cursor:${isOwned ? 'pointer' : 'default'};opacity:${isOwned ? '1' : '0.88'};
            " title="${item.name}">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:8px;font-weight:900;color:${accent};">
                  ${item.kind === 'hammer_skin' ? '★ KNIFE' : isBlue ? '★ SAPPHIRE' : '★ 24K GOLD'}
                </span>
                <span style="font-size:8px;font-weight:900;color:${
                  isEquipped ? '#2ecc71' : isOwned ? '#7bed9f' : '#ffd700'
                };">
                  ${isEquipped ? '✓ EQUIPPED' : isOwned ? 'CLICK TO EQUIP' : '🔒 CASE RNG'}
                </span>
              </div>
              <div style="height:44px;display:flex;align-items:center;justify-content:center;">
                ${this.buildWeaponSvg(
                  item.weaponId || 'hammer',
                  {},
                  { height: 40, skinFinish: item.skinFinish }
                )}
              </div>
              <div style="font-size:9.5px;font-weight:900;color:${accent};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;">
                ${item.shortName || item.name}
              </div>
            </div>
          `;
        })
        .join('');

      return `
        <div style="display:flex;flex-direction:column;gap:10px;width:100%;max-width:100%;min-width:0;overflow-x:hidden;box-sizing:border-box;">
          <!-- CS2 CONTAINER + KEY TOP BAR -->
          <div style="background:linear-gradient(180deg, rgba(18,24,34,0.98), rgba(10,14,20,0.99));border:1.5px solid rgba(255,215,0,0.45);border-radius:7px;padding:12px 14px;width:100%;max-width:100%;min-width:0;box-sizing:border-box;overflow:hidden;">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                <span style="font-size:15px;font-weight:900;color:#ffd700;letter-spacing:0.8px;">
                  📦 CS2 ARMORY CONTAINER
                </span>
                <span style="background:rgba(255,215,0,0.14);border:1px solid #ffd700;color:#ffd700;border-radius:4px;padding:3px 9px;font-size:11px;font-weight:900;">
                  🔑 KEYS: ${caseKeys} <span style="font-size:9px;color:#cbd5e1;font-weight:700;">(FOUND IN BUILDINGS OR $250)</span>
                </span>
                <span style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);color:#cbd5e1;border-radius:4px;padding:3px 8px;font-size:10px;font-weight:900;">
                  UNBOXED: ${casesOpened} (★ ${goldUnboxed})
                </span>
              </div>

              <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                <button type="button" id="gs-case-demo-funds-btn" style="background:rgba(39,174,96,0.22);color:#7bed9f;border:1px solid #2ecc71;border-radius:4px;padding:6px 10px;font-size:10px;font-weight:900;cursor:pointer;" title="Grant +$50,000 to Warehouse Vault for rolling Cases">
                  💵 +$50,000
                </button>
                <button type="button" id="gs-buy-key-btn" style="background:${
                  canAffordKey ? 'rgba(241,196,15,0.22)' : '#334155'
                };color:#ffd700;border:1.5px solid #ffd700;border-radius:4px;padding:6px 11px;font-size:10.5px;font-weight:900;cursor:pointer;">
                  🔑 BUY KEY ($250)
                </button>
                <button type="button" id="gs-open-case-btn" class="gs-roll-case-trigger-btn" ${
                  isSpinning ? 'disabled' : ''
                } style="background:${
                  canAffordCase
                    ? 'linear-gradient(135deg, #16a34a, #22c55e)'
                    : 'linear-gradient(135deg, #ca8a04, #eab308)'
                };color:#fff;border:1.5px solid #bbf7d0;border-radius:4px;padding:7px 16px;font-size:11.5px;font-weight:900;cursor:${
                  isSpinning ? 'wait' : 'pointer'
                };box-shadow:0 0 14px rgba(34,197,94,0.45);letter-spacing:0.5px;">
                  ${
                    isSpinning
                      ? '⏳ ROLLING CASE...'
                      : caseKeys < 1
                      ? '🔑 NEED KEY ($250 OR BUILDINGS)'
                      : `🎲 ROLL CASE ($${caseCost.toLocaleString()} + 1 🔑)`
                  }
                </button>
              </div>
            </div>

            <!-- CS2 HORIZONTAL PEGBOARD ROULETTE VIEWPORT (Wheel-of-Fortune Linear Pins + Bending Red Triangle Flapper) -->
            <div id="gs-case-roulette-viewport" style="position:relative;overflow:hidden;background:#070a0f;border:2px solid rgba(255,215,0,0.38);border-radius:7px;padding:24px 8px 10px 8px;box-shadow:inset 0 6px 18px rgba(0,0,0,0.95);">
              <!-- Top Metallic Pegboard Rail Track -->
              <div style="position:absolute;top:0;left:0;right:0;height:18px;background:linear-gradient(180deg, rgba(30,41,59,0.95), rgba(15,23,42,0.55));border-bottom:1px solid rgba(255,215,0,0.28);z-index:2;pointer-events:none;"></div>
              <!-- Left/Right Edge Vignette Fade -->
              <div style="position:absolute;top:0;bottom:0;left:0;width:68px;background:linear-gradient(90deg, #070a0f, transparent);z-index:8;pointer-events:none;"></div>
              <div style="position:absolute;top:0;bottom:0;right:0;width:68px;background:linear-gradient(270deg, #070a0f, transparent);z-index:8;pointer-events:none;"></div>
              <!-- Subtle Center Vertical Laser Guide Line -->
              <div style="position:absolute;top:24px;bottom:0;left:50%;width:2px;background:linear-gradient(180deg, #ff2e2e, rgba(255,215,0,0.55));z-index:9;transform:translateX(-50%);box-shadow:0 0 10px rgba(255,46,46,0.8);pointer-events:none;"></div>
              <!-- Physical Red Triangle Wheel-of-Fortune Flapper / Clacker (bends & snaps over every pin!) -->
              <div id="gs-roulette-red-triangle" style="
                position:absolute;top:0px;left:50%;width:34px;height:36px;margin-left:-17px;
                transform-origin:50% 6px;transform:rotate(0deg);
                z-index:12;pointer-events:none;filter:drop-shadow(0 3px 8px rgba(255,30,30,0.85));
                will-change:transform;
              ">
                <svg viewBox="0 0 34 36" width="34" height="36" style="display:block;overflow:visible;">
                  <!-- Top Pivot Mounting Bracket & Gold Bolt -->
                  <circle cx="17" cy="6" r="5.5" fill="#1e293b" stroke="#ffd700" stroke-width="1.6"/>
                  <!-- Crimson-Red Wheel-of-Fortune Triangle Flapper Body -->
                  <polygon points="4,6 30,6 17,34" fill="#ff1e1e" stroke="#ffffff" stroke-width="1.8" stroke-linejoin="round"/>
                  <polygon points="9,8 25,8 17,29" fill="#ff5252" opacity="0.65"/>
                  <!-- Center Brass Pivot Pin -->
                  <circle cx="17" cy="6" r="2.6" fill="#ffd700"/>
                </svg>
              </div>
              <div id="gs-case-roulette-track" style="display:flex;gap:6px;align-items:center;will-change:transform;position:relative;z-index:5;">
                ${reelTilesHtml}
              </div>
            </div>

            <!-- LIVE SELECTED WEAPON INDICATOR + RED TRIANGLE POINTER READOUT -->
            <div id="gs-case-result-banner" style="margin-top:8px;padding:8px 12px;border-radius:5px;background:rgba(15,23,42,0.88);border:1.5px solid rgba(255,215,0,0.28);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
              <div id="gs-live-needle-weapon" style="font-size:11.5px;font-weight:900;color:#ffd700;letter-spacing:0.4px;">
                ${
                  isSpinning
                    ? `🔻 RED TRIANGLE ROLLING OVER PINS...`
                    : lastRes && lastRes.reward
                    ? `🔻 LANDED ON: <span style="color:${
                        lastRes.isGold ? '#ffd700' : '#7bed9f'
                      };">${lastRes.isGold ? '★ RARE SPECIAL — ' : ''}${
                        lastRes.reward.fullName
                      } ${
                        lastRes.reward.wasDuplicate ? `(+$${lastRes.reward.rebate} DUPLICATE)` : '• ✓ EQUIPPED'
                      }</span>`
                    : `🔻 READY TO ROLL ($${caseCost.toLocaleString()} + 1 🔑 KEY)`
                }
              </div>
              <div id="gs-selected-weapon-indicator" style="background:rgba(46,204,113,0.16);border:1.5px solid #2ecc71;border-radius:4px;padding:4px 10px;font-size:10.5px;font-weight:900;color:#7bed9f;letter-spacing:0.4px;">
                🎯 SELECTED WEAPON: <span style="color:#fff;">[1] ${
                  primaryDef.shortName || primaryDef.name
                }</span> <span style="color:#ffd700;">(${activePrimarySkin})</span> &bull; <span style="color:#fff;">[2] ${
                  secondaryDef.shortName || secondaryDef.name
                }</span> &bull; <span style="color:#ffd700;">[4] ${activeMeleeLabel}</span>
              </div>
            </div>
          </div>

          <!-- CS2 "CONTAINS ONE OF THE FOLLOWING" VISUAL GRID -->
          <div style="background:rgba(12,17,25,0.96);border:1px solid rgba(255,255,255,0.14);border-radius:6px;padding:10px 12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <span style="font-size:11px;font-weight:900;color:#94a3b8;letter-spacing:0.6px;">
                CONTAINS ONE OF THE FOLLOWING (MIL-SPEC FIREARMS • 90% — CLICK ANY OWNED GUN TO SELECT &amp; EQUIP)
              </span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(135px, 1fr));gap:7px;margin-bottom:12px;">
              ${caseGunCardsHtml}
            </div>

            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:6px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.1);">
              <span style="font-size:11px;font-weight:900;color:#ffd700;letter-spacing:0.6px;">
                ★ OR AN EXCEEDINGLY RARE SPECIAL ITEM (10% RNG ONLY — CANNOT BE BOUGHT DIRECTLY)
              </span>
              <div style="display:flex;gap:4px;">
                <button type="button" class="gs-gold-filter-btn" data-gold-filter="all" style="background:${
                  goldFilter === 'all' ? '#ffd700' : 'rgba(255,255,255,0.08)'
                };color:${goldFilter === 'all' ? '#111' : '#fff'};border:none;border-radius:3px;padding:3px 7px;font-size:9px;font-weight:900;cursor:pointer;">ALL (${GOLD_SPECIAL_POOL.length})</button>
                <button type="button" class="gs-gold-filter-btn" data-gold-filter="knives" style="background:${
                  goldFilter === 'knives' ? '#ef4444' : 'rgba(255,255,255,0.08)'
                };color:#fff;border:none;border-radius:3px;padding:3px 7px;font-size:9px;font-weight:900;cursor:pointer;">★ KNIVES (2)</button>
                <button type="button" class="gs-gold-filter-btn" data-gold-filter="pure_blue" style="background:${
                  goldFilter === 'pure_blue' ? '#2563eb' : 'rgba(255,255,255,0.08)'
                };color:#fff;border:none;border-radius:3px;padding:3px 7px;font-size:9px;font-weight:900;cursor:pointer;">💎 BLUE (19)</button>
                <button type="button" class="gs-gold-filter-btn" data-gold-filter="pure_gold" style="background:${
                  goldFilter === 'pure_gold' ? '#eab308' : 'rgba(255,255,255,0.08)'
                };color:#111;border:none;border-radius:3px;padding:3px 7px;font-size:9px;font-weight:900;cursor:pointer;">👑 GOLD (19)</button>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(135px, 1fr));gap:7px;max-height:230px;overflow-y:auto;padding-right:4px;">
              ${goldCardsHtml}
            </div>
          </div>

          <!-- GIANT BOTTOM-CENTER CASE ROLL DOCK + SELECTED WEAPON INDICATOR -->
          <div id="gs-bottom-center-case-dock" style="
            position:sticky;bottom:0;left:0;right:0;z-index:25;
            background:linear-gradient(180deg, rgba(10,15,24,0.94), rgba(6,9,15,0.99));
            border:2px solid #ffd700;border-radius:8px;padding:10px 18px;
            display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;
            box-shadow:0 -6px 24px rgba(0,0,0,0.9), 0 0 22px rgba(255,215,0,0.28);
          ">
            <div style="font-size:11px;font-weight:900;color:#7bed9f;letter-spacing:0.6px;text-align:center;">
              🎯 ACTIVE SELECTED WEAPON: <span style="color:#ffffff;">${
                primaryDef.name
              }</span> <span style="color:#ffd700;">[${activePrimarySkin}]</span> &bull; MELEE: <span style="color:#ffd700;">${activeMeleeLabel}</span>
            </div>
            <button type="button" id="gs-roll-case-center-btn" class="gs-roll-case-trigger-btn" ${
              isSpinning ? 'disabled' : ''
            } style="
              min-width:390px;max-width:95%;padding:14px 48px;
              background:${
                isSpinning
                  ? 'linear-gradient(135deg, #b45309, #d97706)'
                  : 'linear-gradient(135deg, #f39c12 0%, #e67e22 50%, #d35400 100%)'
              };
              color:#111;border:2.5px solid #ffd700;border-radius:8px;
              font-size:19px;font-weight:900;letter-spacing:1.2px;text-transform:uppercase;
              cursor:${isSpinning ? 'wait' : 'pointer'};
              box-shadow:0 0 28px rgba(243,156,18,0.8), inset 0 2px 0 rgba(255,255,255,0.65);
            ">
              ${
                isSpinning
                  ? '🎰 ROLLING $50,000 CASE...'
                  : `🎲 ROLL CASE ($${caseCost.toLocaleString()})`
              }
            </button>
          </div>
        </div>
      `;
    };

    // ─── FULL-WIDTH 50/50 SIDE-BY-SIDE DRAG-AND-DROP LOOTING & BACKPACK VIEW ──
    const renderBackpackAndLootMode = () => {
      const bpUsage =
        this.player && typeof this.player.getBackpackGridUsage === 'function'
          ? this.player.getBackpackGridUsage()
          : {
              cols: 3,
              rows: 3,
              totalCells: 9,
              usedCells: 3,
              name: 'TACTICAL SLING PACK (3×3)',
              cells: []
            };

      const curWep = this.player?.slots?.[0];
      const secWep = this.player?.slots?.[1];
      const rigMags = curWep?.mags || [];
      const clipSz = curWep?.def?.clipSize || 30;
      const myWepId = curWep?.def?.id || 'm4a1';
      const myWepAtts = this.player?.getWeaponAttachmentMap
        ? this.player.getWeaponAttachmentMap(myWepId)
        : {};
      const myArmorHp = Math.ceil(this.player?.armor ?? 50);
      const myMaxArmor = Math.ceil(this.player?.maxArmor ?? 50);
      const myDressings = this.player?.bandages ?? 2;
      const myFrags = this.player?.grenades ?? 2;

      // Build 2D Visualized Backpack Cells (cols × rows) — each cell is a drop target!
      const gridCellItemsHtml = [];
      for (let idx = 0; idx < bpUsage.totalCells; idx++) {
        const cItem = bpUsage.cells[idx];
        if (cItem) {
          gridCellItemsHtml.push(`
            <div class="gs-drop-target gs-bp-drop-cell" data-drop-zone="backpack" data-cell-index="${idx}" style="background:${cItem.bg};border:1.5px solid ${cItem.col};border-radius:5px;padding:7px 6px;min-height:62px;display:flex;flex-direction:column;justify-content:space-between;position:relative;transition:all 0.15s;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:15px;">${cItem.icon}</span>
                <span style="font-size:8.5px;font-weight:900;color:#95a5a6;">CELL ${idx + 1}</span>
              </div>
              <div>
                <div style="font-size:10px;font-weight:900;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${cItem.title}</div>
                <div style="font-size:9.5px;font-weight:900;color:${cItem.col};">${cItem.sub}</div>
              </div>
            </div>
          `);
        } else {
          gridCellItemsHtml.push(`
            <div class="gs-drop-target gs-bp-drop-cell" data-drop-zone="backpack" data-cell-index="${idx}" style="background:rgba(10,16,24,0.78);border:1.5px dashed rgba(46,204,113,0.35);border-radius:5px;padding:7px 6px;min-height:62px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:rgba(123,237,159,0.55);font-size:9px;font-weight:900;transition:all 0.15s;">
              <span>⬇ DROP LOOT</span>
              <span style="font-size:8px;color:rgba(255,255,255,0.32);">CELL ${idx + 1}</span>
            </div>
          `);
        }
      }

      // Build Visualized Chest Rig Magazine Pouches
      const rigPouchesHtml = [
        { count: curWep?.clip ?? clipSz, label: 'IN GUN' },
        ...rigMags.map((m, i) => ({ count: m, label: `POUCH ${i + 1}` }))
      ]
        .map((m, idx) => {
          const pct = Math.max(0, Math.min(100, Math.round((m.count / Math.max(1, clipSz)) * 100)));
          const col = idx === 0 ? '#2ecc71' : m.count <= 0 ? '#e74c3c' : '#f1c40f';
          return `
            <div style="flex:1;min-width:54px;background:rgba(14,22,32,0.92);border:1.5px solid ${col};border-radius:4px;padding:5px 6px;text-align:center;">
              <div style="font-size:8.5px;color:#95a5a6;font-weight:900;">${m.label}</div>
              <div style="font-size:11.5px;font-weight:900;color:${col};">${m.count}/${clipSz}</div>
              <div style="height:4px;background:rgba(255,255,255,0.1);border-radius:2px;margin-top:2px;overflow:hidden;">
                <div style="height:100%;width:${pct}%;background:${col};"></div>
              </div>
            </div>
          `;
        })
        .join('');

      // Check nearby Fallen Enemy Loot Packs (within 8.5m), keeping the currently open corpse visible
      const nearbyPacks =
        this.player && typeof this.player.findNearbyEnemyLootPacks === 'function'
          ? this.player.findNearbyEnemyLootPacks(8.5, this._activeLootPackId)
          : [];
      let selectedPack =
        nearbyPacks.find((p) => p.id === this._activeLootPackId) || nearbyPacks[0] || null;
      if (selectedPack) {
        this._activeLootPackId = selectedPack.id;
      }

      let enemyLootHtml = '';
      if (selectedPack) {
        const packTabsHtml = nearbyPacks
          .map((p) => {
            const isSel = p.id === selectedPack.id;
            const d = Math.hypot(p.pos.x - this.player.pos.x, p.pos.z - this.player.pos.z).toFixed(
              1
            );
            const remCount = (p.items || []).filter((it) => !it.looted).length;
            const totalCount = (p.items || []).length;
            return `
              <button type="button" class="gs-select-lootpack-btn" data-pack-id="${p.id}" style="
                background:${isSel ? 'rgba(243,156,18,0.28)' : 'rgba(18,28,38,0.9)'};
                border:1.5px solid ${isSel ? '#f1c40f' : 'rgba(255,255,255,0.2)'};
                color:${isSel ? '#f1c40f' : '#ecf0f1'};border-radius:4px;padding:4px 8px;
                font-size:10px;font-weight:900;cursor:pointer;
              ">
                💀 ${p.ownerRank} ${p.ownerName} [${p.ownerTeam} ${p.ownerRole}] (${remCount}/${totalCount} • ${d}m)
              </button>
            `;
          })
          .join('');

        const items = selectedPack.items || [];
        const wepItem = items.find((it) => it.type === 'weapon');
        const plateItem = items.find((it) => it.type === 'armor_plate');
        const magsItem = items.find((it) => it.type === 'mags');
        const dressItem = items.find((it) => it.type === 'dressings');
        const ordItem = items.find((it) => it.type === 'ordnance');
        const bountyItem = items.find((it) => it.type === 'bounty');
        const ammoItem = items.find((it) => it.type === 'loose_ammo');

        const renderRigOrPackSlot = (it, slotLabel, accentCol = '#2ecc71') => {
          if (!it) {
            return `
              <div style="background:rgba(10,16,24,0.72);border:1px dashed rgba(255,255,255,0.15);border-radius:5px;padding:8px;display:flex;flex-direction:column;justify-content:center;align-items:center;color:rgba(255,255,255,0.28);font-size:9px;font-weight:900;min-height:86px;">
                <span>${slotLabel}</span>
                <span>EMPTY SLOT</span>
              </div>
            `;
          }
          const isLooted = Boolean(it.looted);
          return `
            <div
              class="${isLooted ? '' : 'gs-draggable-loot-item'}"
              ${isLooted ? '' : 'draggable="true"'}
              data-pack-id="${selectedPack.id}"
              data-item-id="${it.id}"
              data-item-name="${it.name.replace(/"/g, '&quot;')}"
              data-item-icon="${it.icon || '📦'}"
              data-mode="take"
              style="background:${
                isLooted ? 'rgba(14,20,28,0.65)' : 'rgba(16,28,40,0.96)'
              };border:1.5px ${isLooted ? 'dashed rgba(46,204,113,0.35)' : `solid ${accentCol}`};border-radius:6px;padding:8px 10px;display:flex;flex-direction:column;justify-content:space-between;gap:5px;min-height:88px;opacity:${
                isLooted ? '0.62' : '1'
              };cursor:${isLooted ? 'default' : 'grab'};user-select:none;transition:transform 0.12s, box-shadow 0.12s;"
              title="${isLooted ? 'Already looted into your inventory' : 'Drag this item into your Left Inventory pane (or click to loot immediately)!'}"
            >
              <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;">
                <span style="font-size:8.5px;font-weight:900;color:#95a5a6;letter-spacing:0.4px;">${slotLabel}</span>
                <span class="abi-cell-tag" style="background:rgba(241,196,15,0.18);color:#f1c40f;">${
                  isLooted ? 'LOOTED' : `⠿ DRAG ← (${it.grid || `${it.gridW || 1}×${it.gridH || 1}`})`
                }</span>
              </div>
              <div>
                <div style="font-size:11px;font-weight:900;color:${
                  isLooted ? '#7bed9f' : '#fff'
                };">${it.icon || '📦'} ${it.name}</div>
                <div style="font-size:9px;color:#bdc3c7;line-height:1.25;margin-top:2px;">${it.desc}</div>
              </div>
              <div>
                ${
                  isLooted
                    ? `<div style="background:rgba(46,204,113,0.18);border:1px solid rgba(46,204,113,0.5);color:#7bed9f;border-radius:4px;padding:3px 6px;font-size:9px;font-weight:900;text-align:center;">✓ IN YOUR INVENTORY</div>`
                    : `<button type="button" class="gs-loot-item-btn" data-pack-id="${selectedPack.id}" data-item-id="${it.id}" data-mode="take" style="width:100%;background:#27ae60;color:#fff;border:none;border-radius:4px;padding:5px 8px;font-size:9.5px;font-weight:900;cursor:pointer;">⬅ DRAG TO LEFT OR CLICK TO LOOT</button>`
                }
              </div>
            </div>
          `;
        };

        // 1. Enemy Equipped Primary Firearm Slot (2×4 with SVG Weapon Silhouette) — Draggable!
        const wepSlotHtml = wepItem
          ? `
            <div
              class="${wepItem.looted ? '' : 'gs-draggable-loot-item'}"
              ${wepItem.looted ? '' : 'draggable="true"'}
              data-pack-id="${selectedPack.id}"
              data-item-id="${wepItem.id}"
              data-item-name="${wepItem.name.replace(/"/g, '&quot;')}"
              data-item-icon="🔫"
              data-mode="take"
              style="background:${
                wepItem.looted ? 'rgba(14,20,28,0.65)' : 'rgba(20,28,38,0.98)'
              };border:1.5px ${
                wepItem.looted ? 'dashed rgba(241,196,15,0.35)' : 'solid #f1c40f'
              };border-radius:6px;padding:8px 10px;display:flex;flex-direction:column;justify-content:space-between;gap:5px;cursor:${
                wepItem.looted ? 'default' : 'grab'
              };user-select:none;"
              title="Drag to your Weapon Sling or Backpack on the Left to equip/loot!"
            >
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:9px;font-weight:900;color:#f1c40f;letter-spacing:0.5px;">🔫 ENEMY SLUNG PRIMARY FIREARM</span>
                <span class="abi-cell-tag" style="background:rgba(241,196,15,0.22);color:#f1c40f;">${
                  wepItem.looted ? 'LOOTED' : '⠿ DRAG TO LEFT SLING ← (2×4)'
                }</span>
              </div>
              <div style="display:flex;align-items:center;gap:8px;background:rgba(8,14,20,0.75);border-radius:5px;padding:4px 8px;pointer-events:none;">
                <div style="flex:1;min-width:0;">
                  ${this.buildWeaponSvg(wepItem.weaponId || 'ak15', {}, { height: 44 })}
                </div>
                <div style="flex:1;min-width:0;">
                  <div style="font-size:12px;font-weight:900;color:#f1c40f;">${wepItem.name}</div>
                  <div style="font-size:9px;color:#bdc3c7;">${wepItem.desc}</div>
                </div>
              </div>
              <div style="display:flex;gap:5px;">
                ${
                  wepItem.looted
                    ? `<div style="flex:1;background:rgba(46,204,113,0.18);border:1px solid rgba(46,204,113,0.5);color:#7bed9f;border-radius:4px;padding:4px 8px;font-size:9.5px;font-weight:900;text-align:center;">
                         ✓ ${wepItem.lootedMode === 'scrap' ? `STRIPPED FOR +$${wepItem.scrapValue || 220} PARTS` : 'SWAPPED TO YOUR HANDS'}
                       </div>`
                    : `
                      <button type="button" class="gs-loot-item-btn" data-pack-id="${selectedPack.id}" data-item-id="${wepItem.id}" data-mode="take" style="flex:1.2;background:#e67e22;color:#fff;border:none;border-radius:4px;padding:5px 8px;font-size:9.5px;font-weight:900;cursor:pointer;">
                        ⬅ DRAG OR SWAP TO HANDS
                      </button>
                      <button type="button" class="gs-loot-item-btn" data-pack-id="${selectedPack.id}" data-item-id="${wepItem.id}" data-mode="scrap" style="flex:1;background:#2980b9;color:#fff;border:none;border-radius:4px;padding:5px 8px;font-size:9.5px;font-weight:900;cursor:pointer;">
                        🔩 STRIP (+$${wepItem.scrapValue || 220})
                      </button>
                    `
                }
              </div>
            </div>
          `
          : '';

        // 2. Enemy Equipped Armor Plate & Backpack Slot
        const plateSlotHtml = renderRigOrPackSlot(
          plateItem,
          '🛡️ ENEMY ARMOR & BACKPACK RIG',
          '#3498db'
        );

        enemyLootHtml = `
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:8px;">
            <div style="display:flex;gap:4px;flex-wrap:wrap;">
              ${packTabsHtml}
            </div>
            <div style="display:flex;gap:5px;flex-wrap:wrap;">
              <button type="button" id="gs-loot-all-btn" data-pack-id="${selectedPack.id}" style="background:#27ae60;color:#fff;border:none;border-radius:4px;padding:6px 10px;font-size:10px;font-weight:900;cursor:pointer;" title="Quick-loots 50% Pocket Cash, Loaded Mags, Loose Bullets, Dressings, Grenades & Armor Plate!">
                ⚡ [SPACE] LOOT ALL GEAR &amp; 50% CASH
              </button>
              <button type="button" id="gs-loot-all-swap-btn" data-pack-id="${selectedPack.id}" style="background:#e67e22;color:#fff;border:none;border-radius:4px;padding:6px 10px;font-size:10px;font-weight:900;cursor:pointer;">
                🔫 LOOT ALL + SWAP WEAPON
              </button>
            </div>
          </div>

          <!-- DRAG INSTRUCTION BANNER -->
          <div style="background:rgba(241,196,15,0.14);border:1px solid rgba(241,196,15,0.5);border-radius:5px;padding:5px 10px;margin-bottom:8px;font-size:10px;font-weight:900;color:#f1c40f;display:flex;justify-content:space-between;align-items:center;">
            <span>🖱️ DRAG ANY ITEM CARD BELOW ➔ DROP INTO YOUR INVENTORY ON THE LEFT!</span>
            <span style="color:#7bed9f;">OR SINGLE-CLICK / [SPACE]</span>
          </div>

          <!-- SECTION 1: ENEMY EQUIPPED WEAPON & ARMOR/PACK RIG -->
          <div style="font-size:9.5px;font-weight:900;color:#f1c40f;letter-spacing:0.6px;margin-bottom:4px;">
            1. ENEMY EQUIPPED FIREARM, ARMOR CARRIER &amp; BACKPACK (DRAG TO LEFT)
          </div>
          <div style="display:grid;grid-template-columns:1.22fr 1fr;gap:8px;margin-bottom:9px;">
            ${wepSlotHtml}
            ${plateSlotHtml}
          </div>

          <!-- SECTION 2: ENEMY TACTICAL CHEST RIG POUCHES (MAGS, IFAK DRESSINGS, ORDNANCE) -->
          <div style="font-size:9.5px;font-weight:900;color:#7bed9f;letter-spacing:0.6px;margin-bottom:4px;">
            2. ENEMY TACTICAL CHEST RIG POUCHES (DRAG ANY POUCH TO YOUR RIG / PACK ON LEFT)
          </div>
          <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:7px;margin-bottom:9px;">
            ${renderRigOrPackSlot(magsItem, '▱ RIG MAG POUCHES', '#f1c40f')}
            ${renderRigOrPackSlot(dressItem, '🩹 IFAK MED POUCH', '#2ecc71')}
            ${renderRigOrPackSlot(ordItem, '💣 ORDNANCE POUCH', '#e67e22')}
          </div>

          <!-- SECTION 3: ENEMY POCKETS (50% MATCH CASH & DOGTAG) & BACKPACK LOOSE AMMO -->
          <div style="font-size:9.5px;font-weight:900;color:#74b9ff;letter-spacing:0.6px;margin-bottom:4px;">
            3. ENEMY POCKETS (50% ON-HAND CASH) &amp; BACKPACK CONTENTS (DRAG TO LEFT)
          </div>
          <div style="display:grid;grid-template-columns:1.15fr 1fr;gap:7px;">
            ${renderRigOrPackSlot(bountyItem, '💵 POCKETS & DOGTAG (50% CASH)', '#2ecc71')}
            ${renderRigOrPackSlot(ammoItem, '🎒 BACKPACK AMMO BOX', '#f1c40f')}
          </div>
        `;
      } else {
        enemyLootHtml = `
          <div style="background:rgba(14,22,32,0.92);border:1.5px dashed rgba(241,196,15,0.45);border-radius:6px;padding:28px 18px;text-align:center;">
            <div style="font-size:28px;margin-bottom:8px;">🎒💀</div>
            <div style="font-size:14px;font-weight:900;color:#f1c40f;margin-bottom:6px;">
              NO FALLEN ENEMY BODY WITHIN 8.5M
            </div>
            <div style="font-size:11px;color:#bdc3c7;line-height:1.5;max-width:410px;margin:0 auto;">
              Stand within <b>5m</b> of a downed or eliminated <b>enemy</b> soldier (friendly teammates are revived with [F], never looted):<br/>
              • <b>Quick Tap [F]</b> = Instant Auto-Loot (50% Pocket Cash, Loaded Mags, Loose Bullets, Dressings, Grenades &amp; Armor Plate)<br/>
              • <b>Hold [F] (0.3s)</b> = Opens this <b>50/50 Side-by-Side Drag-and-Drop Loot Screen</b>!
            </div>
          </div>
        `;
      }

      return `
        <div style="margin-bottom:10px;background:linear-gradient(90deg, rgba(9,132,227,0.24), rgba(0,210,211,0.18));border:1.5px solid #48dbfb;border-radius:6px;padding:8px 14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <span style="font-size:11.5px;font-weight:900;color:#81ecec;">
            ✈️🚜 LOOKING FOR PLANE / AC-130 / TANK TECH UPGRADES OR REQUESTING A NEW PLANE, TANK OR RECON BIKE?
          </span>
          <button type="button" id="gs-jump-to-vehicles-tab-btn" style="background:linear-gradient(135deg, #0984e3, #00cec9);color:#fff;border:1.5px solid #81ecec;border-radius:5px;padding:6px 14px;font-size:11px;font-weight:900;cursor:pointer;box-shadow:0 0 12px rgba(0,210,211,0.4);">
            🔧 OPEN 5. VEHICLE &amp; JET BAY [KEY L] ➔
          </button>
        </div>
        <div id="gs-side-by-side-loot-view" style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:stretch;min-height:calc(96vh - 185px);">
          <!-- LEFT VIEW (50% WIDTH): MY OPERATOR INVENTORY, SLING, RIG & 2D BACKPACK DROP ZONES -->
          <div id="gs-my-inventory-drop-pane" class="gs-drop-target" data-drop-zone="inventory" style="background:rgba(12,22,32,0.97);border:2px solid #2ecc71;border-radius:8px;padding:14px 18px;display:flex;flex-direction:column;justify-content:space-between;transition:box-shadow 0.15s, border-color 0.15s;">
            <div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;border-bottom:1px solid rgba(46,204,113,0.3);padding-bottom:6px;">
                <div style="font-size:13.5px;font-weight:900;color:#2ecc71;letter-spacing:0.7px;">
                  🟢 VIEW 1 (LEFT): MY INVENTORY, RIG &amp; BACKPACK
                </div>
                <span style="background:rgba(46,204,113,0.2);border:1px solid #2ecc71;color:#7bed9f;padding:2px 8px;border-radius:4px;font-size:9.5px;font-weight:900;">
                  ⬇ DROP ENEMY LOOT HERE
                </span>
              </div>

              <!-- Drop Target Row 1: My Equipped Primary Sling & Armor/Backpack Carrier -->
              <div style="display:grid;grid-template-columns:1.25fr 1fr;gap:8px;margin-bottom:10px;">
                <div id="gs-drop-weapon-slot" class="gs-drop-target" data-drop-zone="weapon" style="background:rgba(8,14,22,0.92);border:1.5px solid rgba(46,204,113,0.55);border-radius:6px;padding:7px 10px;display:flex;align-items:center;gap:8px;transition:all 0.15s;" title="Drop Enemy Firearm here to Swap into your Hands!">
                  <div style="flex:1;min-width:0;">
                    ${this.buildWeaponSvg(myWepId, myWepAtts, { height: 42 })}
                  </div>
                  <div style="min-width:0;">
                    <div style="font-size:8.5px;color:#7bed9f;font-weight:900;">MY PRIMARY SLING [DROP GUN]</div>
                    <div style="font-size:12px;font-weight:900;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${curWep?.def?.name || 'M4A1'}</div>
                    <div style="font-size:9.5px;color:#f1c40f;font-weight:900;">${curWep?.clip ?? 0}/${clipSz} • ${curWep?.looseAmmo ?? 0} LOOSE</div>
                  </div>
                </div>
                <div id="gs-drop-armor-slot" class="gs-drop-target" data-drop-zone="armor" style="background:rgba(8,14,22,0.92);border:1.5px solid rgba(52,152,219,0.55);border-radius:6px;padding:7px 10px;display:flex;flex-direction:column;justify-content:center;gap:3px;transition:all 0.15s;" title="Drop Enemy Armor Plate / Rig here!">
                  <div style="font-size:10px;font-weight:900;color:#74b9ff;">🛡️ MY ARMOR: ${myArmorHp}/${myMaxArmor} HP</div>
                  <div style="font-size:9.5px;font-weight:900;color:#7bed9f;">🩹 IFAK: ×${myDressings} • 💣 FRAGS: ×${myFrags}</div>
                  <div style="font-size:9px;color:#bdc3c7;">🔫 SIDEARM: ${secWep?.def?.shortName || 'M9'}</div>
                </div>
              </div>

              <!-- Drop Target Row 2: My Visualized Chest Rig Magazine Pouches -->
              <div id="gs-drop-rig-slot" class="gs-drop-target" data-drop-zone="rig" style="background:rgba(8,14,22,0.82);border:1.5px solid rgba(241,196,15,0.45);border-radius:6px;padding:8px 10px;margin-bottom:10px;transition:all 0.15s;" title="Drop Enemy Magazines, Dressings or Grenades into your Chest Rig!">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                  <span style="font-size:10.5px;font-weight:900;color:#f1c40f;">
                    ▱ MY CHEST RIG MAG POUCHES (${curWep?.def?.shortName || 'PRIMARY'}) — DROP MAGS / MEDS HERE
                  </span>
                  <button type="button" id="gs-pack-mags-btn" style="background:rgba(46,204,113,0.22);border:1px solid #2ecc71;color:#7bed9f;border-radius:3px;padding:3px 8px;font-size:9px;font-weight:900;cursor:pointer;">
                    🔄 PACK LOOSE BULLETS [P]
                  </button>
                </div>
                <div style="display:flex;gap:5px;flex-wrap:wrap;">
                  ${rigPouchesHtml}
                </div>
              </div>

              <!-- Drop Target Row 3: My 2D Backpack Cell Grid -->
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <div>
                  <span style="font-size:11px;font-weight:900;color:#2ecc71;">
                    🎒 MY 2D BACKPACK GRID: ${bpUsage.name} (DRAG &amp; DROP ENEMY ITEMS INTO CELLS)
                  </span>
                </div>
                <span style="background:rgba(46,204,113,0.2);border:1px solid #2ecc71;color:#7bed9f;font-size:10px;font-weight:900;padding:2px 8px;border-radius:4px;">
                  CELLS: ${bpUsage.usedCells} / ${bpUsage.totalCells}
                </span>
              </div>
              <div style="display:grid;grid-template-columns:repeat(${bpUsage.cols}, 1fr);gap:6px;">
                ${gridCellItemsHtml.join('')}
              </div>
            </div>

            <!-- Bottom Strip-for-Parts Drop Box inside Left Inventory -->
            <div id="gs-drop-scrap-slot" class="gs-drop-target" data-drop-zone="scrap" style="margin-top:10px;background:rgba(41,128,185,0.16);border:1.5px dashed #3498db;border-radius:5px;padding:6px 10px;text-align:center;font-size:10px;font-weight:900;color:#74b9ff;transition:all 0.15s;">
              🔩 DROP ENEMY FIREARM HERE TO STRIP FOR +$220 FIELD PARTS (INSTEAD OF SWAPPING GUNS)
            </div>
          </div>

          <!-- RIGHT VIEW (50% WIDTH): FALLEN ENEMY GEAR, RIG & BACKPACK (DRAG ITEMS TO LEFT) -->
          <div id="gs-enemy-loot-source-pane" style="background:rgba(12,20,30,0.97);border:2px solid #f1c40f;border-radius:8px;padding:14px 18px;display:flex;flex-direction:column;justify-content:space-between;">
            <div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;border-bottom:1px solid rgba(241,196,15,0.3);padding-bottom:6px;">
                <div style="font-size:13.5px;font-weight:900;color:#f1c40f;letter-spacing:0.7px;">
                  💀 VIEW 2 (RIGHT): ENEMY INVENTORY (${nearbyPacks.length} NEARBY)
                </div>
                <span style="font-size:9.5px;color:#bdc3c7;font-weight:900;">
                  [F] / [ESC] TO CLOSE
                </span>
              </div>
              ${enemyLootHtml}
            </div>
          </div>
        </div>
      `;
    };

    const atResupply =
      this.player && typeof this.player.isAtResupplyPoint === 'function'
        ? this.player.isAtResupplyPoint()
        : false;
    const nearbyEnemyPacksCount =
      this.player && typeof this.player.findNearbyEnemyLootPacks === 'function'
        ? this.player.findNearbyEnemyLootPacks(8.5).length
        : 0;

    modal.innerHTML = `
      <div class="abi-header-bar">
        <div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span style="font-size:17px;font-weight:900;color:#f1c40f;letter-spacing:1.1px;">
              ${
                activeTab === 'backpack'
                  ? '🎒 SIDE-BY-SIDE TACTICAL LOOTING &amp; BACKPACK INVENTORY [F / I]'
                  : '🎒 TACTICAL ROLE, WEAPON, GUNSMITH &amp; VISUALIZED BACKPACK HUB [L / I]'
              }
            </span>
            ${
              workbenchAccess.allowed
                ? `<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(46,204,113,0.18);border:1.5px solid #2ecc71;color:#7bed9f;border-radius:4px;padding:2px 9px;font-size:10.5px;font-weight:900;letter-spacing:0.4px;">📍 WORKBENCH LOCATION: ${workbenchAccess.locationLabel}</span>`
                : `<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(243,156,18,0.18);border:1.5px solid #f39c12;color:#f1c40f;border-radius:4px;padding:2px 9px;font-size:10.5px;font-weight:900;letter-spacing:0.4px;">🔒 FIELD BACKPACK ONLY — VISIT HQ / FOB / AMMO STASH FOR GUNSMITH [L]</span>`
            }
          </div>
          <div style="font-size:10.5px;color:#bdc3c7;">
            ${
              activeTab === 'backpack'
                ? '<span style="color:#7bed9f;font-weight:900;">🖱️ DRAG ANY ENEMY ITEM FROM RIGHT VIEW ➔ DROP INTO YOUR INVENTORY ON LEFT VIEW (OR CLICK / PRESS [SPACE] TO LOOT ALL)!</span>'
                : atResupply
                ? '<span style="color:#2ecc71;font-weight:900;">📦 AT BASE / AMMO STASH — SELECT ANY ROLE, PRIMARY/SECONDARY WEAPON OR ATTACHMENT TO EQUIP &amp; RESUPPLY INSTANTLY!</span>'
                : 'Select Role, Primary/Secondary Firearms, Customize Attachments, or Scavenge Enemy Gear into your Visualized Backpack!'
            }
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <button id="gs-header-roll-case-btn" type="button" style="background:linear-gradient(135deg, #f39c12, #d35400);color:#fff;border:1.5px solid #ffd700;border-radius:4px;padding:6px 10px;font-size:10px;font-weight:900;cursor:pointer;box-shadow:0 0 10px rgba(243,156,18,0.45);opacity:${workbenchAccess.allowed ? '1' : '0.45'};" title="Open CS2 Cases &amp; Roll a $50,000 Armory Case!">🎲 ROLL CASE ($50,000)</button>
          <button id="gs-inspect-weapon-btn" type="button" style="background:rgba(241,196,15,0.22);color:#ffd700;border:1.5px solid #ffd700;border-radius:4px;padding:6px 9px;font-size:10px;font-weight:900;cursor:pointer;" title="Close menu and play Counter-Strike 2 Weapon / Knife Inspect Animation [F / V]">🔍 INSPECT [F/V]</button>
          <select id="gs-playstyle-title-select" title="Choose Scoreboard &amp; HUD Playstyle Title (AUTO adapts to your live battle style, or pin a specific Title!)" style="background:rgba(16,26,38,0.95);color:#ffd32a;border:1.5px solid #ffd32a;border-radius:4px;padding:5px 7px;font-size:10px;font-weight:900;cursor:pointer;">
            ${[
              ['auto', '🏅 TITLE: AUTO (LIVE PLAYSTYLE)'],
              ['sharpshooter', '🎯 SHARPSHOOTER'],
              ['ace_pilot', '✈️ ACE PILOT'],
              ['tank_buster', '💥 TANK BUSTER'],
              ['lifesaver', '⚕️ LIFESAVER'],
              ['attacker', '⚔️ ATTACKER'],
              ['defender', '🛡️ DEFENDER'],
              ['braveheart', '🦁 BRAVEHEART'],
              ['camper', '🏕️ ROOFTOP CAMPER']
            ]
              .map(
                ([tid, tlbl]) =>
                  `<option value="${tid}" ${
                    (this.player?.marksmanProfile?.pinnedTitleId || 'auto') === tid ? 'selected' : ''
                  }>${tlbl}</option>`
              )
              .join('')}
          </select>
          <button id="gs-toggle-bhop-btn" type="button" style="background:${
            this.player?.bhopEnabled !== false ? 'rgba(46,204,113,0.24)' : 'rgba(255,255,255,0.08)'
          };color:${
            this.player?.bhopEnabled !== false ? '#7bed9f' : '#94a3b8'
          };border:1.5px solid ${
            this.player?.bhopEnabled !== false ? '#2ecc71' : 'rgba(255,255,255,0.22)'
          };border-radius:4px;padding:6px 9px;font-size:10px;font-weight:900;cursor:pointer;" title="Toggle Quake Bunnyhopping (Hold Space) + Uncapped Air-Strafing">🐇 BHOP: ${
            this.player?.bhopEnabled !== false ? 'ON' : 'OFF'
          }</button>
          <button id="gs-toggle-ff-btn" type="button" style="background:${
            this.player?.friendlyFireEnabled ? 'rgba(231,76,60,0.3)' : 'rgba(52,152,219,0.18)'
          };color:${
            this.player?.friendlyFireEnabled ? '#ff7675' : '#74b9ff'
          };border:1.5px solid ${
            this.player?.friendlyFireEnabled ? '#ff5252' : '#74b9ff'
          };border-radius:4px;padding:6px 9px;font-size:10px;font-weight:900;cursor:pointer;" title="Toggle Friendly Fire ON/OFF (-$0.10 / 10 cents deducted per teammate kill)">${
            this.player?.friendlyFireEnabled
              ? `⚠️ FF: ON (-10¢/TK${
                  (this.player?.friendlyFireKills || 0) > 0
                    ? ` • -$${(this.player.friendlyFirePenaltyTotal || 0).toFixed(2)}`
                    : ''
                })`
              : '🛡️ FF: OFF (-10¢/TK)'
          }</button>
          <button id="gs-resupply-now-btn" type="button" style="background:#00b894;color:#fff;border:1.5px solid #55efc4;border-radius:4px;padding:6px 10px;font-size:10.5px;font-weight:900;cursor:pointer;" title="Resupply 100% Magazines, Loose Bullets, Field Dressings, Medic Bag & Armor!">📦 [F] RESUPPLY 100%</button>
          <div style="background:rgba(46,204,113,0.15);border:1.5px solid #2ecc71;border-radius:5px;padding:4px 10px;font-size:12.5px;font-weight:900;color:#7bed9f;" title="Persistent Warehouse Vault saved across matches!">
            🏦 VAULT: <span id="gs-wh-cash">$${this.formatCashAmount(whCash)}</span>
          </div>
          <div style="background:rgba(241,196,15,0.16);border:1.5px solid #f1c40f;border-radius:5px;padding:4px 10px;font-size:12.5px;font-weight:900;color:#f1c40f;" title="Current Round Tactical Cash (Extracts to Warehouse at round end with 1.5x Victory Multiplier!)">
            ⚡ MATCH: <span id="gs-modal-cash">$${this.formatCashAmount(matchCash)}</span>
          </div>
          <button id="gs-grant-cash-btn" type="button" style="background:#27ae60;color:#fff;border:none;border-radius:4px;padding:6px 9px;font-size:10px;font-weight:900;cursor:pointer;" title="Grant +$250 stipend to both Match & Warehouse funds!">💵 +$250 STIPEND</button>
          <button id="gs-toggle-fullscreen-btn" type="button" style="background:#8e44ad;color:#fff;border:1px solid #9b59b6;border-radius:4px;padding:6px 9px;font-size:10px;font-weight:900;cursor:pointer;" title="Toggle between 100% Full-Screen View and 92% Windowed Pop-Out">⛶ ${isFullScreen ? 'FULLSCREEN: ON' : 'FULLSCREEN: OFF'}</button>
          <button id="gs-audio-settings-btn" type="button" style="background:#2980b9;color:#fff;border:none;border-radius:4px;padding:6px 9px;font-size:10px;font-weight:900;cursor:pointer;">🔊 SETTINGS</button>
          <button id="gs-close-btn" type="button" style="background:#e74c3c;color:#fff;border:none;border-radius:4px;padding:6px 11px;font-size:10px;font-weight:900;cursor:pointer;">✕ CLOSE [F / ESC / L / I]</button>
        </div>
      </div>

      <div class="abi-mode-tabs" style="display:flex;gap:6px;margin-bottom:6px;flex-shrink:0;">
        <button type="button" class="gs-tab-btn" data-tab="warehouse" style="flex:1;padding:5px 7px;border-radius:5px;border:1.5px solid ${
          activeTab === 'warehouse' ? '#f1c40f' : 'rgba(255,255,255,0.16)'
        };background:${
          activeTab === 'warehouse' ? 'rgba(241,196,15,0.22)' : 'rgba(16,24,34,0.9)'
        };color:${
          activeTab === 'warehouse' ? '#f1c40f' : '#ecf0f1'
        };font-size:10.5px;font-weight:900;cursor:${workbenchAccess.allowed ? 'pointer' : 'not-allowed'};opacity:${workbenchAccess.allowed ? '1' : '0.45'};letter-spacing:0.4px;">
          ${workbenchAccess.allowed ? '🏛️' : '🔒'} 1. WEAPONS &amp; STASH
        </button>
        <button type="button" class="gs-tab-btn" data-tab="attachments" style="flex:1;padding:5px 7px;border-radius:5px;border:1.5px solid ${
          activeTab === 'attachments' ? '#2ecc71' : 'rgba(255,255,255,0.16)'
        };background:${
          activeTab === 'attachments' ? 'rgba(46,204,113,0.22)' : 'rgba(16,24,34,0.9)'
        };color:${
          activeTab === 'attachments' ? '#7bed9f' : '#ecf0f1'
        };font-size:10.5px;font-weight:900;cursor:${workbenchAccess.allowed ? 'pointer' : 'not-allowed'};opacity:${workbenchAccess.allowed ? '1' : '0.45'};letter-spacing:0.4px;">
          ${workbenchAccess.allowed ? '🔧' : '🔒'} 2. GUNSMITH (${baseWorkbenchDef.shortName})
        </button>
        <button type="button" class="gs-tab-btn" data-tab="backpack" style="flex:1.1;padding:5px 7px;border-radius:5px;border:1.5px solid ${
          activeTab === 'backpack' ? '#2ecc71' : 'rgba(255,255,255,0.16)'
        };background:${
          activeTab === 'backpack' ? 'rgba(46,204,113,0.26)' : 'rgba(16,24,34,0.9)'
        };color:${
          activeTab === 'backpack' ? '#7bed9f' : '#ecf0f1'
        };font-size:10.5px;font-weight:900;cursor:pointer;letter-spacing:0.4px;">
          🎒 3. LOOT &amp; BACKPACK${nearbyEnemyPacksCount > 0 ? ` (${nearbyEnemyPacksCount})` : ''}
        </button>
        <button type="button" class="gs-tab-btn" data-tab="requisitions" style="flex:0.8;padding:5px 7px;border-radius:5px;border:1.5px solid ${
          activeTab === 'requisitions' ? '#3498db' : 'rgba(255,255,255,0.16)'
        };background:${
          activeTab === 'requisitions' ? 'rgba(52,152,219,0.22)' : 'rgba(16,24,34,0.9)'
        };color:${
          activeTab === 'requisitions' ? '#74b9ff' : '#ecf0f1'
        };font-size:10.5px;font-weight:900;cursor:pointer;letter-spacing:0.4px;">
          ⚡ 4. REQUISITIONS
        </button>
        <button type="button" class="gs-tab-btn" data-tab="vehicles" style="flex:1.15;padding:5px 7px;border-radius:5px;border:1.5px solid ${
          activeTab === 'vehicles' ? '#48dbfb' : 'rgba(72,219,251,0.75)'
        };background:${
          activeTab === 'vehicles' ? 'rgba(9,132,227,0.38)' : 'rgba(12,28,44,0.96)'
        };color:#48dbfb;font-size:10.5px;font-weight:900;cursor:pointer;letter-spacing:0.4px;">
          🚜✈️ 5. VEHICLE &amp; JET BAY [L]
        </button>
        <button type="button" class="gs-tab-btn" data-tab="cases" style="flex:1.1;padding:5px 7px;border-radius:5px;border:1.5px solid ${
          activeTab === 'cases' ? '#ffd32a' : 'rgba(255,211,42,0.55)'
        };background:${
          activeTab === 'cases'
            ? 'linear-gradient(135deg, rgba(243,156,18,0.38), rgba(255,211,42,0.24))'
            : 'rgba(32,24,10,0.92)'
        };color:#ffd32a;font-size:10.5px;font-weight:900;cursor:${workbenchAccess.allowed ? 'pointer' : 'not-allowed'};opacity:${workbenchAccess.allowed ? '1' : '0.45'};letter-spacing:0.4px;">
          ${workbenchAccess.allowed ? '📦' : '🔒'} 6. CS2 CASES (🔑 ${this.player?.caseKeys ?? 1})
        </button>
      </div>

      <div style="flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;">
      ${
        activeTab === 'backpack'
          ? renderBackpackAndLootMode()
          : activeTab === 'cases'
          ? renderMysteryCasesMode()
          : `
            <div class="abi-split-layout" style="min-width:0;max-width:100%;">
              <!-- LEFT PANEL: OPERATOR EQUIPMENT SLOTS ("PAPER DOLL" RIG VIEW) -->
              ${renderOperatorRigPanel()}

              <!-- RIGHT PANEL: STASH GRID / GUNSMITH WORKBENCH / FIELD REQUISITIONS / VEHICLE BAY -->
              <div class="abi-right-panel" style="min-width:0;max-width:100%;overflow-x:hidden;">
                ${
                  activeTab === 'attachments'
                    ? renderWorkbenchMode()
                    : activeTab === 'requisitions'
                    ? renderRequisitionsMode()
                    : activeTab === 'vehicles'
                    ? renderVehicleBayMode()
                    : renderVisualStashMode()
                }
              </div>
            </div>
          `
      }
      </div>
    `;

    // Wire Close, Resupply, Grant, Audio Settings, and Mode Tab buttons
    const closeBtn = modal.querySelector('#gs-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.toggleGunsmithModal(false);
      });
      closeBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.toggleGunsmithModal(false);
      });
    }

    const resupplyBtn = modal.querySelector('#gs-resupply-now-btn');
    if (resupplyBtn) {
      resupplyBtn.addEventListener('click', () => {
        if (this.player && typeof this.player.resupplyAll === 'function') {
          this.player.resupplyAll(false);
          this._lastMagSignature = '';
          this.renderGunsmithModalContent(modal);
        }
      });
    }

    const packMagsBtn = modal.querySelector('#gs-pack-mags-btn');
    if (packMagsBtn) {
      packMagsBtn.addEventListener('click', () => {
        if (this.player && typeof this.player.startSlowReload === 'function') {
          this.player.startSlowReload();
          this.toggleGunsmithModal(false);
        }
      });
    }

    modal.querySelectorAll('.gs-select-lootpack-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._activeLootPackId = btn.dataset.packId;
        this.renderGunsmithModalContent(modal);
      });
    });

    const executeLootTransfer = (packId, itemId, mode = 'take') => {
      const pack = (this.world?.lootPacks || []).find((p) => p.id === packId);
      if (pack && this.player && typeof this.player.lootItemFromPack === 'function') {
        const ok = this.player.lootItemFromPack(pack, itemId, mode);
        this._lastMagSignature = '';
        this.updateCashAndGunsmithHud();
        return ok;
      }
      return false;
    };

    modal.querySelectorAll('.gs-loot-item-btn').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        executeLootTransfer(btn.dataset.packId, btn.dataset.itemId, btn.dataset.mode || 'take');
      });
    });

    // ─── SIDE-BY-SIDE DRAG-AND-DROP (HTML5 DRAG + POINTER/MOUSE GHOST DRAG) ──
    const dropTargets = modal.querySelectorAll('.gs-drop-target');
    const highlightDropZones = (active, hoveredEl = null) => {
      dropTargets.forEach((zone) => {
        if (!active) {
          zone.style.boxShadow = '';
          zone.style.transform = '';
        } else if (zone === hoveredEl) {
          zone.style.boxShadow = '0 0 18px rgba(46, 204, 113, 0.78)';
          zone.style.transform = 'scale(1.01)';
        } else {
          zone.style.boxShadow = '0 0 10px rgba(46, 204, 113, 0.28)';
          zone.style.transform = '';
        }
      });
    };

    modal.querySelectorAll('.gs-draggable-loot-item').forEach((card) => {
      // 1. Native HTML5 Drag-and-Drop
      card.addEventListener('dragstart', (ev) => {
        const payload = {
          packId: card.dataset.packId,
          itemId: card.dataset.itemId,
          mode: card.dataset.mode || 'take'
        };
        this._activeDragLootPayload = payload;
        if (ev.dataTransfer) {
          try {
            ev.dataTransfer.effectAllowed = 'move';
            ev.dataTransfer.setData('text/plain', JSON.stringify(payload));
          } catch (_) {}
        }
        card.style.opacity = '0.55';
        highlightDropZones(true);
      });

      card.addEventListener('dragend', () => {
        card.style.opacity = '1';
        this._activeDragLootPayload = null;
        highlightDropZones(false);
      });

      // 2. Pointer / Mouse Drag-and-Drop (creates floating visual ghost card & drops on Left View)
      card.addEventListener('mousedown', (ev) => {
        if (ev.button !== 0) return;
        if (ev.target && ev.target.closest('button')) return;
        const startX = ev.clientX;
        const startY = ev.clientY;
        const packId = card.dataset.packId;
        const itemId = card.dataset.itemId;
        const itemName = card.dataset.itemName || 'LOOT ITEM';
        const itemIcon = card.dataset.itemIcon || '📦';
        let ghost = null;
        let isDragging = false;

        const onMouseMove = (moveEv) => {
          const dist = Math.hypot(moveEv.clientX - startX, moveEv.clientY - startY);
          if (!isDragging && dist > 5) {
            isDragging = true;
            this._activeDragLootPayload = { packId, itemId, mode: 'take' };
            card.style.opacity = '0.55';
            ghost = document.createElement('div');
            ghost.id = 'gs-drag-ghost';
            ghost.style.cssText = `
              position: fixed; z-index: 20050; pointer-events: none;
              background: rgba(14, 26, 38, 0.96); border: 2px solid #2ecc71;
              border-radius: 6px; padding: 7px 12px; color: #fff;
              font-family: 'Rajdhani', sans-serif; font-size: 12px; font-weight: 900;
              box-shadow: 0 10px 28px rgba(0,0,0,0.85); transform: translate(-50%, -50%);
              white-space: nowrap;
            `;
            ghost.innerHTML = `${itemIcon} ${itemName} <span style="color:#7bed9f;margin-left:6px;">➔ DROP IN LEFT INVENTORY</span>`;
            document.body.appendChild(ghost);
          }
          if (isDragging && ghost) {
            ghost.style.left = `${moveEv.clientX}px`;
            ghost.style.top = `${moveEv.clientY}px`;
            const elUnder = document.elementFromPoint(moveEv.clientX, moveEv.clientY);
            const dropZ = elUnder ? elUnder.closest('.gs-drop-target') : null;
            highlightDropZones(true, dropZ);
          }
        };

        const onMouseUp = (upEv) => {
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
          if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
          card.style.opacity = '1';
          highlightDropZones(false);
          if (isDragging) {
            const elUnder = document.elementFromPoint(upEv.clientX, upEv.clientY);
            const dropZ = elUnder ? elUnder.closest('.gs-drop-target') : null;
            const leftPane = modal.querySelector('#gs-my-inventory-drop-pane');
            let droppedInLeft = Boolean(dropZ);
            if (!droppedInLeft && leftPane) {
              const rect = leftPane.getBoundingClientRect();
              if (
                upEv.clientX >= rect.left &&
                upEv.clientX <= rect.right &&
                upEv.clientY >= rect.top &&
                upEv.clientY <= rect.bottom
              ) {
                droppedInLeft = true;
              }
            }
            if (droppedInLeft) {
              const zoneType = dropZ ? dropZ.dataset.dropZone : 'inventory';
              const mode = zoneType === 'scrap' ? 'scrap' : 'take';
              executeLootTransfer(packId, itemId, mode);
            }
            this._activeDragLootPayload = null;
          }
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      });
    });

    dropTargets.forEach((zone) => {
      zone.addEventListener('dragover', (ev) => {
        ev.preventDefault();
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
        highlightDropZones(true, zone);
      });
      zone.addEventListener('dragenter', (ev) => {
        ev.preventDefault();
        highlightDropZones(true, zone);
      });
      zone.addEventListener('dragleave', () => {
        highlightDropZones(true, null);
      });
      zone.addEventListener('drop', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        highlightDropZones(false);
        let payload = this._activeDragLootPayload;
        if (!payload && ev.dataTransfer) {
          try {
            payload = JSON.parse(ev.dataTransfer.getData('text/plain'));
          } catch (_) {}
        }
        if (payload && payload.packId && payload.itemId) {
          const zoneType = zone.dataset.dropZone || 'inventory';
          const mode = zoneType === 'scrap' ? 'scrap' : payload.mode || 'take';
          executeLootTransfer(payload.packId, payload.itemId, mode);
        }
        this._activeDragLootPayload = null;
      });
    });

    const lootAllBtn = modal.querySelector('#gs-loot-all-btn');
    if (lootAllBtn) {
      lootAllBtn.addEventListener('click', () => {
        const packId = lootAllBtn.dataset.packId;
        const pack = (this.world?.lootPacks || []).find((p) => p.id === packId);
        if (pack && this.player && typeof this.player.lootAllFromPack === 'function') {
          this.player.lootAllFromPack(pack, false, true);
          this._lastMagSignature = '';
          this.updateCashAndGunsmithHud();
        }
      });
    }

    const lootAllSwapBtn = modal.querySelector('#gs-loot-all-swap-btn');
    if (lootAllSwapBtn) {
      lootAllSwapBtn.addEventListener('click', () => {
        const packId = lootAllSwapBtn.dataset.packId;
        const pack = (this.world?.lootPacks || []).find((p) => p.id === packId);
        if (pack && this.player && typeof this.player.lootAllFromPack === 'function') {
          this.player.lootAllFromPack(pack, true);
          this._lastMagSignature = '';
          this.updateCashAndGunsmithHud();
        }
      });
    }

    const toggleFsBtn = modal.querySelector('#gs-toggle-fullscreen-btn');
    if (toggleFsBtn) {
      toggleFsBtn.addEventListener('click', () => {
        this._gunsmithEdgeFullscreen = this._gunsmithEdgeFullscreen === false ? true : false;
        this.renderGunsmithModalContent(modal);
      });
    }

    const gsToggleFfBtn = modal.querySelector('#gs-toggle-ff-btn');
    const titleSelEl = modal.querySelector('#gs-playstyle-title-select');
    if (titleSelEl && this.player) {
      titleSelEl.addEventListener('change', () => {
        if (!this.player.marksmanProfile) this.player.marksmanProfile = {};
        this.player.marksmanProfile.pinnedTitleId = titleSelEl.value || 'auto';
        try {
          localStorage.setItem('bb_marksman_profile_v1', JSON.stringify(this.player.marksmanProfile));
        } catch (_) {}
        this.addXpNotification?.(
          0,
          `🏅 SCOREBOARD PLAYSTYLE TITLE SET TO: ${titleSelEl.options[titleSelEl.selectedIndex]?.text || 'AUTO'}`
        );
      });
    }
    if (gsToggleFfBtn && this.player && typeof this.player.toggleFriendlyFire === 'function') {
      gsToggleFfBtn.addEventListener('click', () => {
        const nextVal = this.player.toggleFriendlyFire();
        this.updateFriendlyFireUI?.();
        this.renderGunsmithModalContent(modal);
        this.addXpNotification?.(
          0,
          nextVal
            ? '⚠️ FRIENDLY FIRE: ON — KILLING TEAMMATES DEDUCTS $0.10 (10 CENTS) PER TEAMKILL!'
            : '🛡️ FRIENDLY FIRE: OFF — TEAMMATES ARE PROTECTED FROM FRIENDLY DAMAGE'
        );
      });
    }

    const audioBtn = modal.querySelector('#gs-audio-settings-btn');
    if (audioBtn) {
      audioBtn.addEventListener('click', () => {
        if (typeof this.toggleSettingsModal === 'function') {
          this.toggleSettingsModal(true);
        }
      });
    }

    const grantBtn = modal.querySelector('#gs-grant-cash-btn');
    if (grantBtn) {
      grantBtn.addEventListener('click', () => {
        this.player.addCash(250, 'COMBAT SUPPLY STIPEND', false);
        this.player.addCash(250, 'WAREHOUSE VAULT STIPEND', true);
        this.addXpNotification(0, '💰 +$250 MATCH CASH & +$250 WAREHOUSE VAULT STIPEND GRANTED!');
        this.updateCashAndGunsmithHud();
      });
    }

    const autoSortBtn = modal.querySelector('#gs-autosort-btn');
    if (autoSortBtn) {
      autoSortBtn.addEventListener('click', () => {
        this._stashSorted = !this._stashSorted;
        this.renderGunsmithModalContent(modal);
      });
    }

    const jumpVehBtn = modal.querySelector('#gs-jump-to-vehicles-tab-btn');
    if (jumpVehBtn) {
      jumpVehBtn.addEventListener('click', () => {
        this._gunsmithActiveTab = 'vehicles';
        this.renderGunsmithModalContent(modal);
      });
    }

    modal.querySelectorAll('.gs-req-vehicle-now-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!this.player) return;
        const vkind = btn.dataset.vkind || 'bike';
        const strictDoc = this.player.squadDoctrineEnabled !== false;
        if (vkind === 'bike' || vkind === 'atv') {
          this.toggleGunsmithModal(false);
          this.player.requestReconBikeDelivery?.(vkind);
          return;
        }
        if (vkind === 'tank' || vkind === 'apc' || vkind === 'aa') {
          if (strictDoc && this.player.role !== 'armor' && workbenchAccess.allowed) {
            this.player.equipLoadout('armor');
            this.player.resupplyAll?.(true);
            this._gunsmithRole = 'armor';
          }
          this.toggleGunsmithModal(false);
          this.player.requestArmorDelivery?.(vkind);
          return;
        }
        if (vkind.startsWith('air_')) {
          const roleMap = {
            air_fighter: 'fighter',
            air_cas: 'cas',
            air_gunship: 'gunship',
            air_b2: 'b2_spirit'
          };
          const airRole = roleMap[vkind] || 'fighter';
          if (strictDoc && this.player.role !== 'pilot' && workbenchAccess.allowed) {
            this.player.equipLoadout('pilot');
            this.player.resupplyAll?.(true);
            this._gunsmithRole = 'pilot';
          }
          this.toggleGunsmithModal(false);
          this.player.launchAircraftSortie?.(airRole, true);
        }
      });
    });

    modal.querySelectorAll('.gs-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextTab = btn.dataset.tab || 'warehouse';
        if (
          nextTab !== 'backpack' &&
          nextTab !== 'vehicles' &&
          nextTab !== 'requisitions' &&
          !workbenchAccess.allowed
        ) {
          sound.playEmptyClick?.();
          this.addXpNotification?.(
            0,
            '🔧 FIREARM GUNSMITH REQUIRES MAIN BASE HQ, CAPTURED FRIENDLY FOB (A–E), OR AMMO STASH [7]! (TAB 5 VEHICLE & JET BAY IS OPEN ANYWHERE!)'
          );
          return;
        }
        this._gunsmithActiveTab = nextTab;
        this.renderGunsmithModalContent(modal);
      });
    });

    modal.querySelectorAll('.gs-optic-filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._gunsmithOpticFilter = btn.dataset.opticFilter || 'all';
        this.renderGunsmithModalContent(modal);
      });
    });

    modal.querySelectorAll('.gs-stash-filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._gunsmithStashFilter = btn.dataset.filter || 'all';
        this.renderGunsmithModalContent(modal);
      });
    });

    // Wire ABI Extracted Loot Sell / Save / Equip buttons inside the Warehouse & Backpack Hub
    modal.querySelectorAll('.gs-sell-extracted-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const res = this.player?.sellExtractedLootItem?.(btn.dataset.uid);
        if (res && res.ok) {
          this.addXpNotification?.(
            0,
            `💵 SOLD ${res.item.name} FOR +$${res.price} WAREHOUSE VAULT CASH!`
          );
          this.updateCashAndGunsmithHud();
        }
      });
    });

    modal.querySelectorAll('.gs-save-extracted-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const res = this.player?.saveExtractedLootItemToWarehouse?.(btn.dataset.uid);
        if (res && res.ok) {
          this.addXpNotification?.(
            0,
            `🏛️ SAVED ${res.item.name} TO PERSONAL WAREHOUSE STASH!`
          );
          this.updateCashAndGunsmithHud();
        }
      });
    });

    modal.querySelectorAll('.gs-sell-all-extracted-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const res = this.player?.sellAllExtractedLoot?.();
        if (res && res.ok) {
          this.addXpNotification?.(
            0,
            `💵 SOLD ALL ${res.count} LOOT ITEMS FOR +$${res.totalEarned} WAREHOUSE VAULT CASH!`
          );
          this.updateCashAndGunsmithHud();
        }
      });
    });

    modal.querySelectorAll('.gs-save-all-extracted-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const res = this.player?.saveAllExtractedLootToWarehouse?.();
        if (res && res.ok) {
          this.addXpNotification?.(
            0,
            `🏛️ SAVED ALL ${res.count} LOOT ITEMS TO PERSONAL WAREHOUSE!`
          );
          this.updateCashAndGunsmithHud();
        }
      });
    });

    modal.querySelectorAll('.gs-wh-saved-use-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const res = this.player?.equipOrUseWarehouseStashItem?.(btn.dataset.uid);
        if (res && res.ok) {
          this.updateCashAndGunsmithHud();
        }
      });
    });

    modal.querySelectorAll('.gs-hardpoint-filter, .gs-svg-hardpoint').forEach((el) => {
      el.addEventListener('click', () => {
        const hp = el.dataset.hardpoint || 'all';
        this._gunsmithHardpoint = this._gunsmithHardpoint === hp && hp !== 'all' ? 'all' : hp;
        this.renderGunsmithModalContent(modal);
      });
    });

    modal.querySelectorAll('.gs-jump-hardpoint').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.wepSlot) {
          this._gunsmithWeaponSlot = btn.dataset.wepSlot;
        }
        this._gunsmithActiveTab = 'attachments';
        this._gunsmithHardpoint = btn.dataset.hardpoint || 'all';
        this.renderGunsmithModalContent(modal);
      });
    });

    modal.querySelectorAll('.gs-wep-workbench-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._gunsmithWeaponSlot = btn.dataset.wepSlot || 'primary';
        this._gunsmithActiveTab = 'attachments';
        this.renderGunsmithModalContent(modal);
      });
    });

    modal.querySelectorAll('.gs-stash-build-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const wepId = btn.dataset.weapon;
        const slot = btn.dataset.slot || 'primary';
        if (wepId) {
          this.player.buyOrSelectWeapon(activeRole, slot, wepId);
          this._gunsmithWeaponSlot = slot;
          this._gunsmithActiveTab = 'attachments';
          this._gunsmithHardpoint = 'all';
          this._lastMagSignature = '';
          this.updateCashAndGunsmithHud();
        }
      });
    });

    modal.querySelectorAll('.gs-role-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextRole = btn.dataset.role || 'engineer';
        this._gunsmithRole = nextRole;
        this.selectedClass = nextRole;
        const classBtns = document.querySelectorAll('.class-btn');
        classBtns.forEach((b) => b.classList.toggle('active', b.dataset.class === nextRole));
        this.player.equipLoadout(nextRole);
        if (typeof this.player.resupplyAll === 'function') {
          this.player.resupplyAll(true);
        }
        this._lastMagSignature = '';
        this.renderGunsmithModalContent(modal);
      });
    });

    modal.querySelectorAll('.gs-eng-launcher-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const launcher = btn.dataset.launcher === 'stinger' ? 'stinger' : 'rpg7';
        if (this.player) {
          this.player.preferredEngineerLauncher = launcher;
          if (this.player.classLoadoutSelections && this.player.classLoadoutSelections.engineer) {
            this.player.classLoadoutSelections.engineer.gadget = launcher;
          }
          if (this.player.role === 'engineer') {
            this.player.applyCustomizationsToActiveLoadout?.(true);
          }
          this.player.saveGunsmithState?.();
          this.addXpNotification?.(
            0,
            launcher === 'stinger'
              ? '📡 ENGINEER SLOT 3 SET TO FIM-92 STINGER AA SAM (PRESS [3] IN FIELD TO TOGGLE RPG-7)'
              : '🚀 ENGINEER SLOT 3 SET TO RPG-7V2 HEAT ANTI-ARMOR (PRESS [3] IN FIELD TO TOGGLE STINGER)'
          );
          this._lastMagSignature = '';
          this.renderGunsmithModalContent(modal);
        }
      });
    });

    modal.querySelectorAll('.gs-weapon-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const slot = btn.dataset.slot || 'primary';
        const wepId = btn.dataset.weapon;
        const res = this.player.buyOrSelectWeapon(activeRole, slot, wepId);
        if (res && res.ok) {
          this._gunsmithWeaponSlot = slot;
          if (typeof this.player.resupplyAll === 'function') {
            this.player.resupplyAll(true);
          }
          const verb = res.boughtNow ? 'UNLOCKED & ASSIGNED' : 'ASSIGNED';
          this.addXpNotification(
            0,
            `🏛️ ${verb}: ${res.weapon.name} (${activeRole.toUpperCase()})`
          );
          this._lastMagSignature = '';
          this.updateCashAndGunsmithHud();
        } else if (res && res.reason === 'INSUFFICIENT_FUNDS') {
          this.addXpNotification(
            0,
            `⚠️ NEED $${res.shortBy || res.weapon.warehousePrice} MORE FOR ${res.weapon.name} — CLICK [+$500 GRANT] OR EXTRACT MATCH CASH!`
          );
        }
      });
    });

    modal.querySelectorAll('.gunsmith-item-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.cat;
        const itemId = btn.dataset.id;
        const wepId = btn.dataset.weapon || workbenchWeaponId || primaryId;
        const res = this.player.buyOrEquipUpgrade(cat, itemId, wepId);
        if (res && res.ok) {
          const actionVerb = res.action === 'BOUGHT' ? 'PURCHASED & EQUIPPED' : 'EQUIPPED';
          const targetName = WEAPON_DEFS[wepId]?.shortName || wepId.toUpperCase();
          this.addXpNotification(
            0,
            `🔧 ${actionVerb} ON ${targetName}: ${res.item.name.toUpperCase()}`
          );
          this._lastMagSignature = '';
          this.updateCashAndGunsmithHud();
        } else if (res && res.reason === 'INSUFFICIENT_FUNDS') {
          this.addXpNotification(
            0,
            `⚠️ INSUFFICIENT FUNDS FOR ${res.item.name.toUpperCase()} ($${res.item.price}) — CLICK [+$500 GRANT] OR EARN KILLS!`
          );
        }
      });
    });

    modal.querySelectorAll('.gs-mount-all-guns-btn').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const cat = btn.dataset.cat;
        const itemId = btn.dataset.id;
        const res = this.player?.equipUpgradeOnAllOwnedWeapons?.(cat, itemId);
        if (res && res.ok) {
          this.addXpNotification(
            0,
            `⚡ MOUNTED ${res.item.name.toUpperCase()} ACROSS ALL ${res.count} OWNED FIREARMS!`
          );
          this._lastMagSignature = '';
          this.updateCashAndGunsmithHud();
        }
      });
    });

    modal.querySelectorAll('.gs-req-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const reqId = btn.dataset.req;
        const res = this.player.buyFieldRequisition(reqId);
        if (res && res.ok) {
          this.addXpNotification(0, `⚡ FIELD REQUISITION DEPLOYED: ${res.req.name}`);
          this._lastMagSignature = '';
          this.updateCashAndGunsmithHud();
        } else if (res && res.reason === 'INSUFFICIENT_FUNDS') {
          this.addXpNotification(
            0,
            `⚠️ INSUFFICIENT MATCH CASH FOR ${res.req ? res.req.name : 'REQUISITION'}!`
          );
        }
      });
    });

    modal.querySelectorAll('.gs-stock-buy-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.stock;
        const res = this.player.buyWarehouseStock(key, 250);
        if (res && res.ok) {
          this.addXpNotification(0, `🏦 PURCHASED WAREHOUSE SUPPLY CRATE (${key.toUpperCase()})`);
          this.updateCashAndGunsmithHud();
        } else {
          this.addXpNotification(0, '⚠️ NEED $250 TO STOCKPILE WAREHOUSE CRATE!');
        }
      });
    });

    modal.querySelectorAll('.gs-stock-use-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.stock;
        const res = this.player.useWarehouseStock(key);
        if (res && res.ok) {
          this.addXpNotification(0, `📦 USED WAREHOUSE SUPPLY CRATE (${key.toUpperCase()})!`);
          this._lastMagSignature = '';
          this.updateCashAndGunsmithHud();
        } else {
          this.addXpNotification(
            0,
            '⚠️ NO CRATES IN WAREHOUSE STOCK — BUY ONE FOR $250 FIRST!'
          );
        }
      });
    });

    // ─── WIRE CS2 ARMORY CONTAINER ($500 CASE + 1 🔑 KEY), 6.2s ROULETTE SPIN & SKIN EQUIP ───
    const toggleBhopBtn = modal.querySelector('#gs-toggle-bhop-btn');
    if (toggleBhopBtn) {
      toggleBhopBtn.addEventListener('click', () => {
        if (this.player && typeof this.player.toggleBhopEnabled === 'function') {
          const enabled = this.player.toggleBhopEnabled();
          this.addXpNotification?.(
            0,
            enabled
              ? '🐇 QUAKE BUNNYHOPPING & AIR-STRAFING: ENABLED (HOLD SPACE IN AIR)'
              : '🥾 QUAKE BUNNYHOPPING & AIR-STRAFING: DISABLED (STANDARD TACTICAL MOVEMENT)'
          );
          this.renderGunsmithModalContent(modal);
        }
      });
    }

    const inspectWepBtn = modal.querySelector('#gs-inspect-weapon-btn');
    if (inspectWepBtn) {
      inspectWepBtn.addEventListener('click', () => {
        this.toggleGunsmithModal(false);
        if (this.player && typeof this.player.startWeaponInspect === 'function') {
          this.player.startWeaponInspect();
        }
      });
    }

    const buyKeyBtn = modal.querySelector('#gs-buy-key-btn');
    if (buyKeyBtn) {
      buyKeyBtn.addEventListener('click', () => {
        if (!this.player || typeof this.player.buyCaseKey !== 'function') return;
        const res = this.player.buyCaseKey(1, 'auto');
        if (!res || !res.ok) {
          this.addXpNotification?.(
            0,
            '⚠️ NEED $250 TO BUY AN ARMORY KEY (OR FIND KEYS INSIDE BUILDINGS ACROSS THE MAP)!'
          );
          return;
        }
        this.addXpNotification?.(0, `🔑 PURCHASED ARMORY KEY ($250) — KEYS HELD: ${res.caseKeys}`);
        this.updateCashAndGunsmithHud();
      });
    }

    const animateCaseRouletteIfNeeded = () => {
      const track = modal.querySelector('#gs-case-roulette-track');
      const viewport = modal.querySelector('#gs-case-roulette-viewport');
      if (!track || !viewport) return;
      const winTile = track.querySelector('.gs-roulette-winner');
      if (!winTile) return;
      const viewWidth = viewport.clientWidth || 720;
      const tileWidth = 134; // 128px width + 6px gap
      const pinStep = 67; // 2 physical pins per tile (at 0px divider and 67px midpoint)
      const winIdx = Number(winTile.dataset.tileIdx || 52);
      const jitter = this._rouletteJitterPx || 0;
      const targetOffset = Math.max(0, winIdx * tileWidth + 64 + jitter - viewWidth * 0.5);
      const SPIN_DURATION_MS = 6500;

      if (!this.caseRouletteFSM) {
        createArmoryCaseRouletteFSM(this);
      }

      if (this._playRouletteSpinNextRender) {
        this._playRouletteSpinNextRender = false;
        this._isRouletteSpinning = true;
        this._rouletteSpinStart = performance.now();
        this._rouletteTargetOffset = targetOffset;
        this._rouletteLastPinIdx = -1;
        this._rouletteSpringVel = 0;
        this._rouletteSpringAngle = 0;
        if (!this.caseRouletteFSM.is(ARMORY_CASE_STATES.CASE_ROLLING_SPIN)) {
          this.caseRouletteFSM.send(ARMORY_CASE_EVENTS.START_SPIN, {
            deferRender: false,
            spinStart: this._rouletteSpinStart
          });
        }
      }

      if (this._isRouletteSpinning && this._rouletteSpinStart) {
        if (this._rouletteRafId) cancelAnimationFrame(this._rouletteRafId);

        const stepWheelOfFortuneStrip = (now) => {
          const liveTrack = modal.querySelector('#gs-case-roulette-track');
          const liveViewport = modal.querySelector('#gs-case-roulette-viewport');
          const liveTriangle = modal.querySelector('#gs-roulette-red-triangle');
          const liveNeedleText = modal.querySelector('#gs-live-needle-weapon');

          if (!liveTrack || !liveViewport) {
            this.caseRouletteFSM?.send(ARMORY_CASE_EVENTS.ABORT_SPIN);
            return;
          }
          const elapsed = now - this._rouletteSpinStart;
          const t = Math.min(1, Math.max(0, elapsed / SPIN_DURATION_MS));
          // Wheel-of-Fortune quartic/quintic ease-out: fast launch + suspenseful slow pin-by-pin crawl at the end
          const eased = 1 - Math.pow(1 - t, 4.15);
          const curOffset = eased * (this._rouletteTargetOffset || targetOffset);
          const speedNorm = Math.max(0, Math.min(1, Math.pow(1 - t, 3.15)));

          liveTrack.style.transition = 'none';
          liveTrack.style.transform = `translateX(-${curOffset.toFixed(2)}px)`;

          // Compute exact position of the center Red Triangle tip in track coordinates
          const centerTrackX = curOffset + (liveViewport.clientWidth || viewWidth) * 0.5;
          const curPinIdx = Math.floor(centerTrackX / pinStep);
          const pinPhase = centerTrackX - curPinIdx * pinStep; // 0 .. 67px
          const distToNextPin = pinStep - pinPhase; // Distance until the next pin hits the Red Triangle tip

          // 1. Pin-contact deflection: as a pin approaches within 19px of center, it physically pushes the Red Triangle tip left (+deg)
          let contactDeflectDeg = 0;
          if (distToNextPin < 19) {
            const contactRatio = 1 - distToNextPin / 19;
            contactDeflectDeg = contactRatio * (26 + speedNorm * 18); // Up to +44deg bend right before snapping over the pin!
          }

          // 2. Pin snap-over event: when the pin slips past center, snap the Red Triangle back with spring bounce + clack audio!
          const curTileIdx = Math.max(0, Math.min(59, Math.floor(centerTrackX / tileWidth)));
          const allTiles = liveTrack.children;
          const hoveredTileEl = allTiles[curTileIdx] || null;
          const isGoldHover = hoveredTileEl?.dataset?.tileGold === '1';

          if (this._rouletteLastPinIdx !== -1 && curPinIdx > this._rouletteLastPinIdx) {
            this._rouletteSpringAngle = -(14 + speedNorm * 12);
            sound.playCasePinTick?.(speedNorm, isGoldHover);
            if (liveTriangle) {
              liveTriangle.style.filter = isGoldHover
                ? 'drop-shadow(0 0 14px #ffd700) brightness(1.35)'
                : 'drop-shadow(0 0 12px #ff2e2e) brightness(1.25)';
            }
          }
          this._rouletteLastPinIdx = curPinIdx;

          // Decay spring recoil smoothly
          this._rouletteSpringAngle = (this._rouletteSpringAngle || 0) * 0.82;
          const finalTriangleDeg = contactDeflectDeg + (this._rouletteSpringAngle || 0);

          if (liveTriangle) {
            liveTriangle.style.transform = `rotate(${finalTriangleDeg.toFixed(1)}deg)`;
          }

          // Highlight the weapon tile currently directly under the Red Triangle & update live selected indicator
          if (hoveredTileEl && this._lastHighlightedTileIdx !== curTileIdx) {
            if (
              typeof this._lastHighlightedTileIdx === 'number' &&
              allTiles[this._lastHighlightedTileIdx]
            ) {
              const prevEl = allTiles[this._lastHighlightedTileIdx];
              const prevGold = prevEl.dataset.tileGold === '1';
              prevEl.style.borderColor = 'rgba(255,255,255,0.16)';
              prevEl.style.transform = 'scale(1)';
              prevEl.style.boxShadow = 'none';
              prevEl.style.borderBottomColor = prevGold ? '#ffd700' : '#4b69ff';
            }
            this._lastHighlightedTileIdx = curTileIdx;
            hoveredTileEl.style.borderColor = isGoldHover ? '#ffd700' : '#ff2e2e';
            hoveredTileEl.style.transform = 'scale(1.035)';
            hoveredTileEl.style.boxShadow = isGoldHover
              ? '0 0 18px rgba(255,215,0,0.85)'
              : '0 0 14px rgba(255,46,46,0.65)';
            if (liveNeedleText) {
              const tName = hoveredTileEl.dataset.tileName || 'WEAPON';
              liveNeedleText.innerHTML = `🔻 RED TRIANGLE ON: <span style="color:${
                isGoldHover ? '#ffd700' : '#ffffff'
              };font-size:12.5px;">${tName}</span>`;
            }
          }

          if (t < 1) {
            this._rouletteRafId = requestAnimationFrame(stepWheelOfFortuneStrip);
          } else {
            // Spin complete! Settle Red Triangle at 0deg and announce unboxed reward
            const lastRes = this.player?.lastCaseResult;
            this.caseRouletteFSM?.send(ARMORY_CASE_EVENTS.COMPLETE_SPIN, {
              reward: lastRes?.reward || null
            });
            this._isRouletteSpinning = false;
            this._rouletteRafId = null;
            if (liveTriangle) {
              liveTriangle.style.transform = 'rotate(0deg)';
              liveTriangle.style.filter = 'drop-shadow(0 3px 8px rgba(255,30,30,0.85))';
            }
            if (lastRes && lastRes.reward) {
              if (typeof sound.playCaseWinFanfare === 'function') {
                sound.playCaseWinFanfare(lastRes.isGold);
              } else {
                sound.playBuy?.();
              }
              this.addXpNotification?.(
                0,
                lastRes.isGold
                  ? `★ RARE GOLD 1/10 UNBOXED: ${lastRes.reward.fullName}!`
                  : `📦 UNBOXED: ${lastRes.reward.fullName}!`
              );
            }
            if (modal && !modal.classList.contains('hidden')) {
              this.renderGunsmithModalContent(modal);
            }
          }
        };

        this._rouletteRafId = requestAnimationFrame(stepWheelOfFortuneStrip);
      } else if (!this._isRouletteSpinning) {
        track.style.transition = 'none';
        track.style.transform = `translateX(-${targetOffset}px)`;
      }
    };
    animateCaseRouletteIfNeeded();

    const triggerCaseOpen = () => {
      if (!this.caseRouletteFSM) {
        createArmoryCaseRouletteFSM(this);
      }
      if (this._isRouletteSpinning || this.caseRouletteFSM.is(ARMORY_CASE_STATES.CASE_ROLLING_SPIN)) {
        return;
      }
      if (!this.player || typeof this.player.openMysteryCase !== 'function') return;
      const res = this.player.openMysteryCase('auto');
      if (!res || !res.ok) {
        this._gunsmithActiveTab = 'cases';
        this.renderGunsmithModalContent(modal);
        this.addXpNotification?.(
          0,
          res?.needsKey
            ? '🔑 NEED 1 ARMORY KEY TO ROLL CASE — BUY FOR $250 OR FIND INSIDE BUILDINGS!'
            : `⚠️ ${res?.reason || 'NEED $50,000 TO ROLL CASE (CLICK [+$50,000] TO ADD VAULT FUNDS)'}!`
        );
        return;
      }
      this._gunsmithActiveTab = 'cases';
      this._rouletteJitterPx = Math.round((Math.random() - 0.5) * 76);
      this.caseRouletteFSM.send(ARMORY_CASE_EVENTS.START_SPIN, { deferRender: true });
      this._lastMagSignature = '';
      this.updateCashAndGunsmithHud();
    };

    modal.querySelectorAll('.gs-roll-case-trigger-btn, #gs-open-case-btn, #gs-roll-case-center-btn').forEach((btn) => {
      btn.addEventListener('click', () => triggerCaseOpen());
    });

    const headerRollCaseBtn = modal.querySelector('#gs-header-roll-case-btn');
    if (headerRollCaseBtn) {
      headerRollCaseBtn.addEventListener('click', () => {
        if (!workbenchAccess.allowed) {
          sound.playEmptyClick?.();
          this.addXpNotification?.(
            0,
            '🔧 GUNSMITH WORKBENCH [L] REQUIRES MAIN BASE HQ, CAPTURED FRIENDLY FOB (A–E), OR AMMO STASH [7]! (USE [I] FOR BACKPACK)'
          );
          return;
        }
        if (this._gunsmithActiveTab !== 'cases') {
          this._gunsmithActiveTab = 'cases';
          this.renderGunsmithModalContent(modal);
        }
        triggerCaseOpen();
      });
    }

    const caseDemoFundsBtn = modal.querySelector('#gs-case-demo-funds-btn');
    if (caseDemoFundsBtn) {
      caseDemoFundsBtn.addEventListener('click', () => {
        this.player?.addDemoFundsForCases?.(50000);
        this.addXpNotification?.(0, '💵 +$50,000 ADDED TO WAREHOUSE VAULT!');
        this.updateCashAndGunsmithHud();
      });
    }

    modal.querySelectorAll('.gs-equip-gold-skin-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const skinId = btn.dataset.skinId;
        if (!skinId || !this.player) return;
        if (!this.player.ownedSkins?.has(skinId)) {
          this._gunsmithActiveTab = 'cases';
          this.renderGunsmithModalContent(modal);
          this.addXpNotification?.(
            0,
            '🔒 THIS ★ RARE SPECIAL ITEM CAN ONLY BE UNBOXED FROM AN ARMORY CONTAINER (1/10 RNG)!'
          );
          return;
        }
        const res = this.player.equipSpecialSkin?.(skinId);
        if (res && res.ok) {
          this._lastMagSignature = '';
          this.addXpNotification?.(0, `★ ${res.msg}`);
          this.updateCashAndGunsmithHud();
        }
      });
    });

    modal.querySelectorAll('.gs-gold-filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._goldSkinFilter = btn.dataset.goldFilter || 'all';
        this.renderGunsmithModalContent(modal);
      });
    });

    // ─── WIRE NORTHROP B-2A SPIRIT CUSTOM PAINT STUDIO & SORTIE / LANE BUTTONS ───
    modal.querySelectorAll('.gs-b2-preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const presetId = btn.dataset.presetId || 'midnight_ram';
        const bodyHex = btn.dataset.body || '#14181f';
        const accentHex = btn.dataset.accent || '#00d2d3';
        if (this.player && typeof this.player.setB2SpiritColors === 'function') {
          this.player.setB2SpiritColors(bodyHex, accentHex, presetId);
          this.addXpNotification?.(
            0,
            `🦇 B-2A SPIRIT STEALTH COATING UPDATED: ${btn.textContent.trim().toUpperCase()}!`
          );
          this.renderDeployB2CustomizerBar?.();
          this.renderGunsmithModalContent(modal);
        }
      });
    });

    const b2BodyInput = modal.querySelector('#gs-b2-body-color-input');
    const b2AccentInput = modal.querySelector('#gs-b2-accent-color-input');
    const handleCustomB2ColorInput = () => {
      const bodyHex = b2BodyInput ? b2BodyInput.value : this.player?.b2SpiritColor || '#14181f';
      const accentHex = b2AccentInput
        ? b2AccentInput.value
        : this.player?.b2SpiritAccentColor || '#00d2d3';
      if (this.player && typeof this.player.setB2SpiritColors === 'function') {
        this.player.setB2SpiritColors(bodyHex, accentHex, 'custom');
        const hullSvg = modal.querySelector('#gs-b2-svg-hull');
        const trimSvg = modal.querySelector('#gs-b2-svg-trim');
        if (hullSvg) {
          hullSvg.setAttribute('fill', bodyHex);
          hullSvg.setAttribute('stroke', accentHex);
        }
        if (trimSvg) {
          trimSvg.setAttribute('stroke', accentHex);
        }
        this.renderDeployB2CustomizerBar?.();
      }
    };
    if (b2BodyInput) {
      b2BodyInput.addEventListener('input', handleCustomB2ColorInput);
      b2BodyInput.addEventListener('change', () => this.renderGunsmithModalContent(modal));
    }
    if (b2AccentInput) {
      b2AccentInput.addEventListener('input', handleCustomB2ColorInput);
      b2AccentInput.addEventListener('change', () => this.renderGunsmithModalContent(modal));
    }

    const launchB2Btn = modal.querySelector('#gs-launch-b2-sortie-btn');
    if (launchB2Btn) {
      launchB2Btn.addEventListener('click', () => {
        this.toggleGunsmithModal(false);
        if (this.player && typeof this.player.launchAircraftSortie === 'function') {
          this.player.launchAircraftSortie('b2_spirit');
        }
      });
    }

    const teleportB2LaneBtn = modal.querySelector('#gs-teleport-b2-lane-btn');
    if (teleportB2LaneBtn) {
      teleportB2LaneBtn.addEventListener('click', () => {
        this.toggleGunsmithModal(false);
        if (this.player && !this.player.dead) {
          if (this.player.activeVehicle) {
            this.player.exitVehicle?.();
          }
          const isRu = this.player.team === 'RU';
          const laneX = isRu ? 2828 : -2828;
          const laneZ = isRu ? 124 : -124;
          const groundY = this.world ? this.world.getGroundHeightAt(laneX, laneZ) : 1.25;
          this.player.pos.set(laneX, groundY + 0.2, laneZ);
          this.player.yaw = isRu ? Math.PI : 0;
          this.player.pitch = -0.05;
          this.player.syncCameraTransform?.();
          this.addXpNotification?.(
            0,
            '🛫 TELEPORTED TO HQ RUNWAY LANE 2 — PRESS [E] TO BOARD YOUR CUSTOM NORTHROP B-2A SPIRIT!'
          );
        }
      });
    }

    const launchWrightBtn = modal.querySelector('#gs-launch-wright-sortie-btn');
    if (launchWrightBtn) {
      launchWrightBtn.addEventListener('click', () => {
        this.toggleGunsmithModal(false);
        if (this.player && typeof this.player.launchAircraftSortie === 'function') {
          this.player.launchAircraftSortie('wright_flyer');
        }
      });
    }

    const teleportWrightCaveBtn = modal.querySelector('#gs-teleport-wright-cave-btn');
    if (teleportWrightCaveBtn) {
      teleportWrightCaveBtn.addEventListener('click', () => {
        this.toggleGunsmithModal(false);
        if (this.player && !this.player.dead) {
          if (this.player.activeVehicle) {
            this.player.exitVehicle?.();
          }
          const isRu = this.player.team === 'RU';
          const caveX = isRu ? 1024 : -1024;
          const caveZ = isRu ? 34 : -34;
          const groundY = this.world ? this.world.getGroundHeightAt(caveX, caveZ) : 1.25;
          this.player.pos.set(caveX, groundY + 0.2, caveZ);
          this.player.yaw = isRu ? -Math.PI / 2 : Math.PI / 2;
          this.player.pitch = -0.04;
          this.player.syncCameraTransform?.();
          this.addXpNotification?.(
            0,
            '🕵️ TELEPORTED TO SECRET HQ CLIFFSIDE CAVE — PRESS [E] TO BOARD THE 1903 WRIGHT FLYER I!'
          );
        }
      });
    }

    modal.querySelectorAll('.gs-vehicle-upgrade-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const slotKey = btn.dataset.vslot;
        const upgradeId = btn.dataset.vid;
        if (!slotKey || !upgradeId || !this.player) return;
        const res = this.player.buyOrEquipVehicleUpgrade?.(slotKey, upgradeId);
        if (res && res.ok) {
          const verb = res.action === 'BOUGHT' ? 'PURCHASED & INSTALLED' : 'INSTALLED';
          this.addXpNotification?.(
            0,
            `🚜 ${verb} ON RIDE: ${res.item.name.toUpperCase()}!`
          );
          this.updateCashAndGunsmithHud();
        } else if (res && res.reason === 'LOCKED_PROGRESSION') {
          this.addXpNotification?.(
            0,
            `🔒 LOCKED: EARN ${Math.max(1, (res.reqKills || 1) - (res.curKills || 0))} MORE AIR/GUNSHIP KILL(S) TO UNLOCK ${res.item?.shortName || 'UPGRADE'} FOR PURCHASE!`
          );
        } else if (res && res.reason === 'INSUFFICIENT_FUNDS') {
          this.addXpNotification?.(
            0,
            `⚠️ NEED $${res.item?.price || 400} FOR ${res.item?.name || 'VEHICLE UPGRADE'} — CLICK [+$250 STIPEND] OR EARN KILLS!`
          );
        }
      });
    });

    const ac130ManualBtn = modal.querySelector('#gs-open-ac130-manual-btn');
    if (ac130ManualBtn) {
      ac130ManualBtn.addEventListener('click', () => {
        this.toggleControlsHelp?.('ac130');
      });
    }

    modal.querySelectorAll('.gs-rig-subtab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._rigSubTab = btn.dataset.rigSub || 'weapons';
        this.renderGunsmithModalContent(modal);
      });
    });

    modal.querySelectorAll('.gs-veh-subtab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._vehicleBaySubTab = btn.dataset.vsub || 'airwing';
        this.renderGunsmithModalContent(modal);
      });
    });

    modal.querySelectorAll('.gs-select-air-role-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextAirRole = btn.dataset.airRole || 'cas';
        if (this.player) {
          this.player.preferredAircraftRole = nextAirRole;
          this.updateCommandOrderHud?.();
          this.renderGunsmithModalContent(modal);
        }
      });
    });
  }
};
