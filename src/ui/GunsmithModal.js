import {
  WEAPON_DEFS,
  ATTACHMENT_CATALOG,
  CLASS_LOADOUTS,
  PRIMARY_WEAPON_CATEGORIES,
  SECONDARY_WEAPON_CATEGORIES,
  SHOTGUN_SHELL_TYPES,
  getWeaponCategory,
  CASE_PRICE,
  CASE_GOLD_CHANCE,
  CASE_GUN_POOL,
  GOLD_SPECIAL_POOL
} from '../weapons.js?v=149';
import { CLASS_META, WEAPON_GRID_SIZES, buildWeaponSvg, buildGearSvg } from '../assets/gunsmith-svg.js?v=149';
import { FIELD_REQUISITIONS, VEHICLE_UPGRADE_CATALOG } from '../player/GunsmithState.js?v=149';
import { B2_COLOR_PRESETS } from '../models/vehicle-model.js?v=149';
import { AIRCRAFT_SPEED_RESEARCH } from '../assets/vehicle-defs.js?v=149';
import { getAllowedRoleIds, resolveRoleForEra, ECONOMY, VEHICLE_STATS } from '../config.js?v=149';
import { sound } from '../audio.js?v=149';
import {
  ARMORY_CASE_STATES,
  ARMORY_CASE_EVENTS,
  createArmoryCaseRouletteFSM
} from '../core/StateMachines.js?v=149';

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
    this.renderDeployLoadoutCards?.();
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
      const vehAnchor = document.getElementById('deploy-veh-anchor');
      const gridEl = this.deployScreenEl.querySelector('.deploy-grid');
      if (vehAnchor) {
        vehAnchor.appendChild(bar);
      } else if (gridEl && gridEl.parentNode) {
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
    const isFullScreen = this._gunsmithEdgeFullscreen === true;
    if (isFullScreen) {
      modal.style.cssText = `
        position: fixed; top: 0; left: 0; transform: none;
        width: 100vw; height: 100vh; max-width: 100vw; max-height: 100vh;
        display: flex; flex-direction: column; overflow: hidden; box-sizing: border-box;
        background-color: rgba(8, 13, 20, 0.985); border: 2px solid #f1c40f;
        border-radius: 0px; padding: 10px 16px; z-index: 10025;
        font-family: 'Rajdhani', 'Segoe UI', sans-serif; color: #ecf0f1;
        box-shadow: 0 22px 70px rgba(0, 0, 0, 0.95); pointer-events: auto;
      `;
    } else {
      modal.style.cssText = `
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
        width: min(900px, 95vw); height: min(585px, 92vh); max-width: 96vw; max-height: 94vh;
        display: flex; flex-direction: column; overflow: hidden; box-sizing: border-box;
        background-color: rgba(11, 17, 25, 0.98); border: 1.5px solid rgba(241, 196, 15, 0.55);
        border-top: 3px solid #f1c40f; border-radius: 10px; padding: 10px 14px; z-index: 10025;
        font-family: 'Rajdhani', 'Segoe UI', sans-serif; color: #ecf0f1;
        box-shadow: 0 0 0 100vmax rgba(4, 8, 14, 0.72), 0 24px 64px rgba(0, 0, 0, 0.95); pointer-events: auto;
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

    const isFullScreen = this._gunsmithEdgeFullscreen === true;
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
        modal.style.width = 'min(900px, 95vw)';
        modal.style.height = 'min(585px, 92vh)';
        modal.style.maxWidth = '96vw';
        modal.style.maxHeight = '94vh';
        modal.style.borderRadius = '10px';
        modal.style.boxSizing = 'border-box';
      }
    }

    const workbenchAccess = this.player?.canAccessGunsmithWorkbench
      ? this.player.canAccessGunsmithWorkbench()
      : { allowed: true, locationLabel: 'ARMORY READY' };
    if (this._gunsmithActiveTab === 'requisitions') {
      this._gunsmithActiveTab = 'vehicles';
      this._vehicleBaySubTab = 'drops';
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

    // ─── COMPACT STAT BARS (4 CLEAN METRICS) ──────────────────────────────────
    const allowedEraIds = getAllowedRoleIds(era, playerTeam);
    const visibleClassMeta = CLASS_META.filter((c) => allowedEraIds.includes(c.id));
    const classHeaderPillsHtml = visibleClassMeta
      .map((c) => {
        const isSel = c.id === activeRole;
        return `<button type="button" class="abi-class-tab gs-role-btn ${
          isSel ? 'active' : ''
        }" data-role="${c.id}" title="${c.label}: ${c.gadget}">${c.icon} ${c.short}</button>`;
      })
      .join('');

    // ─── TAB 1: CALL OF DUTY CREATE-A-CLASS WEAPONS BROWSER ───────────────────
    const renderCodWeaponsMode = () => {
      const browseSlot = this._codBrowseSlot || 'primary';
      const equippedPrimCat = getWeaponCategory(basePrimaryDef);
      if (
        !this._codPrimaryCategory ||
        !PRIMARY_WEAPON_CATEGORIES.some((c) => c.id === this._codPrimaryCategory)
      ) {
        this._codPrimaryCategory = equippedPrimCat;
      }
      const activeCat = browseSlot === 'secondary' ? 'pistol' : this._codPrimaryCategory;

      const isShotgunView =
        !isPrimitiveEra &&
        browseSlot === 'primary' &&
        (activeCat === 'shotgun' || Boolean(basePrimaryDef.isShotgun));
      const curShellId =
        customPrimaryDef.activeShellId || this.player.activeShotgunShellId || 'buckshot_00';

      const shellStripHtml = isShotgunView
        ? `<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;background:rgba(230,126,34,0.14);border:1px solid rgba(243,156,18,0.45);border-radius:5px;padding:3px 7px;">
            <span style="font-size:9.5px;font-weight:900;color:#f39c12;">12G SHELL [B]:</span>
            ${SHOTGUN_SHELL_TYPES.map(
              (sh) =>
                `<button type="button" class="gs-shell-pill" data-shell-id="${sh.id}" style="background:${
                  curShellId === sh.id ? 'rgba(243,156,18,0.32)' : 'rgba(12,18,26,0.88)'
                };border:1px solid ${
                  curShellId === sh.id ? '#f1c40f' : 'rgba(255,255,255,0.16)'
                };color:${
                  curShellId === sh.id ? '#ffeaa7' : '#cbd5e1'
                };border-radius:4px;padding:2.5px 7px;font-size:9.5px;font-weight:900;cursor:pointer;" title="${sh.name}: ${sh.desc}">${sh.badge}</button>`
            ).join('')}
          </div>`
        : '';

      const catButtonsHtml = isPrimitiveEra
        ? `<span style="font-size:10.5px;font-weight:900;color:#f1c40f;">⚔️ ${era.toUpperCase()} ARSENAL</span>`
        : browseSlot === 'secondary'
        ? SECONDARY_WEAPON_CATEGORIES.map(
            (c) =>
              `<button type="button" class="cod-cat-btn active" data-cod-cat="${c.id}">${c.icon} ${c.label}</button>`
          ).join('')
        : PRIMARY_WEAPON_CATEGORIES.map((c) => {
            const count = primaryGuns.filter((g) => getWeaponCategory(g) === c.id).length;
            return `<button type="button" class="cod-cat-btn ${
              activeCat === c.id ? 'active' : ''
            }" data-cod-cat="${c.id}">${c.icon} ${c.label} <span style="opacity:0.65;font-size:9px;">(${count})</span></button>`;
          }).join('');

      const displayedGuns = (browseSlot === 'secondary' ? secondaryGuns : primaryGuns).filter((w) => {
        if (isPrimitiveEra) {
          return !w.allowedClasses || w.allowedClasses.includes(activeRole);
        }
        if (browseSlot === 'secondary') return true;
        return getWeaponCategory(w) === activeCat;
      });

      const weaponCardsHtml = displayedGuns
        .map((w) => {
          const isSec = browseSlot === 'secondary' || w.slot === 'secondary';
          const isEquipped = (isSec ? secondaryId : primaryId) === w.id;
          const price = w.warehousePrice || 0;
          const isOwned = ownedWeapons.has(w.id) || price === 0;
          const canAfford = totalCash >= price;
          const gunAtts = this.player.getWeaponAttachmentMap
            ? this.player.getWeaponAttachmentMap(w.id)
            : {};
          const dmgLabel = w.pellets > 1 ? `${w.damage}×${w.pellets}` : `${w.damage}`;
          const statusTxt = isEquipped
            ? '✓ EQUIPPED'
            : price === 0
            ? 'STARTER'
            : isOwned
            ? 'OWNED'
            : `$${price.toLocaleString()}`;
          const statusCol = isEquipped
            ? '#2ecc71'
            : isOwned
            ? '#74b9ff'
            : canAfford
            ? '#f1c40f'
            : '#ff7675';

          const btnLabel = isEquipped
            ? '✓ EQUIPPED'
            : isOwned
            ? 'EQUIP'
            : canAfford
            ? `UNLOCK ($${price.toLocaleString()})`
            : `NEED $${price.toLocaleString()}`;
          const btnBg = isEquipped
            ? '#27ae60'
            : isOwned
            ? '#2980b9'
            : canAfford
            ? '#f39c12'
            : '#475569';

          return `
            <div class="cod-gun-card ${isEquipped ? 'equipped' : ''}">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;">
                <span style="font-size:12px;font-weight:900;color:${
                  isEquipped ? '#7bed9f' : '#ffffff'
                };white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${w.shortName || w.name}</span>
                <span style="font-size:9.5px;font-weight:900;color:${statusCol};flex-shrink:0;">${statusTxt}</span>
              </div>

              <div style="height:46px;display:flex;align-items:center;justify-content:center;background:rgba(6,11,18,0.55);border-radius:5px;padding:2px 6px;">
                ${this.buildWeaponSvg(w.id, gunAtts, { height: isSec ? 34 : 42 })}
              </div>

              <div style="display:flex;justify-content:space-between;align-items:center;font-size:9.5px;color:#94a3b8;font-weight:800;">
                <span>DMG <b style="color:#ecf0f1;">${dmgLabel}</b></span>
                <span><b style="color:#ecf0f1;">${w.rpm}</b> RPM</span>
                <span><b style="color:#ecf0f1;">${w.clipSize}R</b> MAG</span>
              </div>

              <div style="display:flex;gap:4px;">
                <button type="button" class="gs-weapon-btn" data-slot="${
                  isSec ? 'secondary' : 'primary'
                }" data-weapon="${w.id}" style="flex:1;background:${btnBg};color:${
            !isEquipped && !isOwned && canAfford ? '#111' : '#fff'
          };border:none;border-radius:4px;padding:4.5px 8px;font-size:10px;font-weight:900;cursor:pointer;">
                  ${btnLabel}
                </button>
                ${
                  isOwned && !isPrimitiveEra
                    ? `<button type="button" class="gs-stash-build-btn" data-slot="${
                        isSec ? 'secondary' : 'primary'
                      }" data-weapon="${w.id}" style="background:rgba(52,152,219,0.22);border:1px solid #3498db;color:#74b9ff;border-radius:4px;padding:4.5px 7px;font-size:9.5px;font-weight:900;cursor:pointer;" title="Customize Optics &amp; Attachments">🔧 MODS</button>`
                    : ''
                }
              </div>
            </div>
          `;
        })
        .join('');

      const activeMeta =
        CLASS_META.find((c) => c.id === activeRole) || CLASS_META[0];
      const gadgetBoxHtml =
        !isPrimitiveEra && (activeRole === 'engineer' || activeRole === 'armor')
          ? `<div style="display:flex;gap:3px;margin-top:3px;">
              <button type="button" class="gs-eng-launcher-btn" data-launcher="rpg7" style="flex:1;background:${
                (this.player.preferredEngineerLauncher || 'rpg7') !== 'stinger'
                  ? '#d35400'
                  : 'rgba(255,255,255,0.08)'
              };border:1px solid #f39c12;color:#fff;border-radius:3px;padding:2px 4px;font-size:8.5px;font-weight:900;cursor:pointer;">🚀 RPG-7</button>
              <button type="button" class="gs-eng-launcher-btn" data-launcher="stinger" style="flex:1;background:${
                this.player.preferredEngineerLauncher === 'stinger'
                  ? '#27ae60'
                  : 'rgba(255,255,255,0.08)'
              };border:1px solid #2ecc71;color:#fff;border-radius:3px;padding:2px 4px;font-size:8.5px;font-weight:900;cursor:pointer;">📡 Stinger</button>
            </div>`
          : `<div style="font-size:9px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${activeMeta.gadget}</div>`;

      const meleeLabel =
        this.player?.equippedHammerSkin === 'karambit'
          ? '★ Karambit'
          : this.player?.equippedHammerSkin === 'butterfly'
          ? '★ Butterfly'
          : 'Sledgehammer';

      return `
        <div style="display:flex;flex-direction:column;flex:1;min-height:0;">
          <!-- Equipped Primary + Secondary + Gadget/Melee Summary Bar -->
          <div class="cod-equipped-bar">
            <div class="cod-slot-box ${browseSlot === 'primary' ? 'active' : ''}" data-cod-slot="primary">
              <div style="min-width:0;flex:1;">
                <div style="font-size:9px;font-weight:900;color:#7bed9f;letter-spacing:0.5px;">[1] PRIMARY WEAPON</div>
                <div style="font-size:13px;font-weight:900;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${customPrimaryDef.shortName || customPrimaryDef.name}</div>
                <div style="font-size:9.5px;color:#94a3b8;">${customPrimaryDef.clipSize}R &bull; ${
                  !customPrimaryDef.opticType || customPrimaryDef.opticType === 'iron'
                    ? 'Iron Sights'
                    : String(customPrimaryDef.opticType).toUpperCase()
                }</div>
              </div>
              <div style="width:96px;flex-shrink:0;">
                ${this.buildWeaponSvg(primaryId, primAttMap, { height: 36 })}
              </div>
              <button type="button" class="gs-wep-workbench-btn" data-wep-slot="primary" style="background:#2980b9;color:#fff;border:none;border-radius:4px;padding:5px 7px;font-size:9.5px;font-weight:900;cursor:pointer;flex-shrink:0;">🔧 Mods</button>
            </div>

            <div class="cod-slot-box ${browseSlot === 'secondary' ? 'active' : ''}" data-cod-slot="secondary">
              <div style="min-width:0;flex:1;">
                <div style="font-size:9px;font-weight:900;color:#74b9ff;letter-spacing:0.5px;">[2] SECONDARY</div>
                <div style="font-size:12.5px;font-weight:900;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${customSecondaryDef.shortName || customSecondaryDef.name}</div>
                <div style="font-size:9.5px;color:#94a3b8;">${customSecondaryDef.clipSize}R &bull; Sidearm</div>
              </div>
              <div style="width:68px;flex-shrink:0;">
                ${this.buildWeaponSvg(secondaryId, secAttMap, { height: 30 })}
              </div>
              <button type="button" class="gs-wep-workbench-btn" data-wep-slot="secondary" style="background:#8e44ad;color:#fff;border:none;border-radius:4px;padding:5px 7px;font-size:9.5px;font-weight:900;cursor:pointer;flex-shrink:0;">🔧 Mods</button>
            </div>

            <div class="cod-slot-box" style="cursor:default;">
              <div style="min-width:0;flex:1;">
                <div style="font-size:9px;font-weight:900;color:#f1c40f;letter-spacing:0.5px;">[3/4] GADGET &amp; MELEE</div>
                ${gadgetBoxHtml}
                <div style="display:flex;align-items:center;gap:4px;margin-top:3px;">
                  <span style="font-size:9.5px;font-weight:900;color:#ffd32a;">[4] ${meleeLabel}</span>
                  ${
                    this.player?.ownedSkins?.has('hammer_karambit')
                      ? `<button type="button" class="gs-equip-gold-skin-btn" data-skin-id="hammer_karambit" style="background:rgba(241,196,15,0.22);border:1px solid #ffd32a;color:#ffd32a;border-radius:3px;padding:1px 4px;font-size:8px;font-weight:900;cursor:pointer;">Karambit</button>`
                      : ''
                  }
                  ${
                    this.player?.ownedSkins?.has('hammer_butterfly')
                      ? `<button type="button" class="gs-equip-gold-skin-btn" data-skin-id="hammer_butterfly" style="background:rgba(0,210,211,0.22);border:1px solid #00d2d3;color:#81ecec;border-radius:3px;padding:1px 4px;font-size:8px;font-weight:900;cursor:pointer;">Butterfly</button>`
                      : ''
                  }
                </div>
              </div>
            </div>
          </div>

          <!-- CoD Category Tabs + Shotgun Shell Bar -->
          <div class="cod-cat-bar">
            <div class="cod-cat-pills">${catButtonsHtml}</div>
            ${shellStripHtml}
          </div>

          <!-- 3-Column Visual Weapon Cards -->
          <div class="cod-weapon-grid">
            ${weaponCardsHtml}
          </div>
        </div>
      `;
    };

    // ─── TAB 3: GEAR, SUPPLY CRATES & EXTRACTED LOOT ──────────────────────────
    const renderGearAndStashMode = () => {
      const renderGearRow = (catKey, title, accentCol, currentId) => {
        const items = ATTACHMENT_CATALOG[catKey] || [];
        return `
          <div style="background:rgba(14,22,32,0.95);border:1px solid rgba(255,255,255,0.13);border-top:2px solid ${accentCol};border-radius:7px;padding:8px 10px;display:flex;flex-direction:column;gap:6px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-size:11px;font-weight:900;color:${accentCol};">${title}</span>
              <div style="width:40px;height:28px;display:flex;align-items:center;justify-content:center;">
                ${this.buildGearSvg(catKey, currentId)}
              </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;">
              ${items
                .map((it) => {
                  const isEq = it.id === currentId;
                  const isOwn = ownedUpgrades.has(it.id) || it.price === 0;
                  const canBuy = totalCash >= it.price;
                  const tag = isEq
                    ? '✓ EQUIPPED'
                    : it.price === 0
                    ? 'DEFAULT'
                    : isOwn
                    ? 'OWNED'
                    : `$${it.price}`;
                  return `
                    <button type="button" class="gunsmith-item-btn" data-cat="${catKey}" data-id="${it.id}" data-weapon="${primaryId}" style="display:flex;justify-content:space-between;align-items:center;gap:6px;background:${
                    isEq ? 'rgba(39,174,96,0.24)' : 'rgba(20,30,42,0.9)'
                  };border:1px solid ${
                    isEq ? '#2ecc71' : isOwn ? 'rgba(52,152,219,0.5)' : 'rgba(255,255,255,0.14)'
                  };color:#ecf0f1;border-radius:5px;padding:5px 7px;font-size:10px;font-weight:800;cursor:pointer;text-align:left;" title="${it.desc}">
                      <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${it.shortName || it.name}</span>
                      <span style="color:${
                        isEq ? '#7bed9f' : isOwn ? '#74b9ff' : canBuy ? '#f1c40f' : '#94a3b8'
                      };font-weight:900;font-size:9px;flex-shrink:0;">${tag}</span>
                    </button>
                  `;
                })
                .join('')}
            </div>
          </div>
        `;
      };

      const extractedLoot = Array.isArray(this.player?.extractedRoundLoot)
        ? this.player.extractedRoundLoot
        : [];
      const savedWhItems = Array.isArray(this.player?.warehouseStashItems)
        ? this.player.warehouseStashItems
        : [];
      const totalExtractSell = extractedLoot.reduce(
        (sum, it) => sum + Math.max(50, Math.round(it.sellPrice || 150)),
        0
      );

      const cratesHtml = [
        { key: 'armorPlates', name: 'Armor Plate (+25 HP)', count: stock.armorPlates, col: '#74b9ff' },
        { key: 'medStims', name: 'Combat Stim (100 HP)', count: stock.medStims, col: '#7bed9f' },
        { key: 'ammoPacks', name: 'Ammo Bandolier', count: stock.ammoPacks, col: '#f1c40f' }
      ]
        .map(
          (c) => `
          <div style="background:rgba(15,24,34,0.94);border:1px solid rgba(255,255,255,0.13);border-radius:6px;padding:7px 9px;display:flex;justify-content:space-between;align-items:center;gap:8px;">
            <div>
              <div style="font-size:10.5px;font-weight:900;color:#fff;">${c.name}</div>
              <div style="font-size:9.5px;color:${c.col};font-weight:800;">In Stash: ×${c.count}</div>
            </div>
            <div style="display:flex;gap:4px;">
              <button type="button" class="gs-stock-buy-btn" data-stock="${c.key}" style="background:#f39c12;color:#111;border:none;border-radius:4px;padding:4px 7px;font-size:9.5px;font-weight:900;cursor:pointer;">+1 ($250)</button>
              <button type="button" class="gs-stock-use-btn" data-stock="${c.key}" style="background:#27ae60;color:#fff;border:none;border-radius:4px;padding:4px 8px;font-size:9.5px;font-weight:900;cursor:pointer;">Use</button>
            </div>
          </div>
        `
        )
        .join('');

      return `
        <div style="display:flex;flex-direction:column;gap:8px;overflow-y:auto;padding-right:3px;flex:1;min-height:0;">
          <div style="display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));gap:8px;">
            ${renderGearRow('vest', '🛡️ PLATE CARRIER & RIG', '#f1c40f', equippedVestId)}
            ${renderGearRow('tacticalGear', '🪖 HELMET & NVG [N]', '#00ff88', equippedTacGearId)}
            ${renderGearRow('backpack', '🎒 TACTICAL BACKPACK', '#2ecc71', equippedBackpackId)}
          </div>

          <div style="display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));gap:8px;">
            ${cratesHtml}
          </div>

          ${
            extractedLoot.length > 0
              ? `<div style="background:rgba(12,24,36,0.96);border:1.5px solid #2ecc71;border-radius:7px;padding:8px 10px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                  <span style="font-size:11px;font-weight:900;color:#7bed9f;">🎒 ${extractedLoot.length} Unsorted Extracted Loot Item(s)</span>
                  <div style="display:flex;gap:5px;">
                    <button type="button" class="gs-sell-all-extracted-btn" style="background:#27ae60;color:#fff;border:none;border-radius:4px;padding:4px 9px;font-size:10px;font-weight:900;cursor:pointer;">💵 Sell All (+$${totalExtractSell.toLocaleString()})</button>
                    <button type="button" class="gs-save-all-extracted-btn" style="background:#2980b9;color:#fff;border:none;border-radius:4px;padding:4px 9px;font-size:10px;font-weight:900;cursor:pointer;">🏛️ Save All</button>
                  </div>
                </div>`
              : ''
          }

          ${
            savedWhItems.length > 0
              ? `<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(190px, 1fr));gap:6px;">
                  ${savedWhItems
                    .map(
                      (sItem) => `
                    <div style="background:rgba(14,24,36,0.95);border:1px solid rgba(46,204,113,0.45);border-radius:6px;padding:6px 8px;display:flex;justify-content:space-between;align-items:center;gap:6px;">
                      <span style="font-size:10px;font-weight:900;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${sItem.icon || '📦'} ${sItem.name}</span>
                      <div style="display:flex;gap:3px;flex-shrink:0;">
                        <button type="button" class="gs-wh-saved-use-btn" data-uid="${sItem.uid}" style="background:#2980b9;color:#fff;border:none;border-radius:3px;padding:3px 6px;font-size:9px;font-weight:900;cursor:pointer;">Equip</button>
                        <button type="button" class="gs-sell-extracted-btn" data-uid="${sItem.uid}" style="background:#27ae60;color:#fff;border:none;border-radius:3px;padding:3px 6px;font-size:9px;font-weight:900;cursor:pointer;">+$${sItem.sellPrice || 150}</button>
                      </div>
                    </div>`
                    )
                    .join('')}
                </div>`
              : ''
          }
        </div>
      `;
    };

    // ─── TAB 2: COMPACT GUNSMITH ATTACHMENT WORKBENCH ─────────────────────────
    const renderWorkbenchMode = () => {
      const categories = [
        { key: 'optic', short: '🔭 OPTIC', items: ATTACHMENT_CATALOG.optic || [] },
        { key: 'muzzle', short: '🔇 MUZZLE', items: ATTACHMENT_CATALOG.muzzle || [] },
        { key: 'grip', short: '🔦 UNDERBARREL', items: ATTACHMENT_CATALOG.grip || [] },
        { key: 'magazine', short: '▱ MAGAZINE', items: ATTACHMENT_CATALOG.magazine || [] },
        { key: 'ammoType', short: '🐚 AMMO / LOAD', items: ATTACHMENT_CATALOG.ammoType || [] }
      ];
      const curHp = categories.some((c) => c.key === activeHardpoint) ? activeHardpoint : 'optic';

      const hardpointTabsHtml = categories
        .map((cat) => {
          const isSel = curHp === cat.key;
          const eqItem =
            (cat.items || []).find(
              (i) => i.id === (wepAttMap[cat.key] || (cat.key === 'optic' ? 'factory' : 'stock'))
            ) || cat.items[0];
          return `
            <button type="button" class="abi-hardpoint-btn gs-hardpoint-filter ${
              isSel ? 'active' : ''
            }" data-hardpoint="${cat.key}">
              <div style="font-size:9px;color:#94a3b8;font-weight:900;">${cat.short}</div>
              <div style="font-size:10px;font-weight:900;color:#7bed9f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                ${eqItem ? eqItem.shortName || eqItem.name : 'STOCK'}
              </div>
            </button>
          `;
        })
        .join('');

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

      const activeCatObj = categories.find((c) => c.key === curHp) || categories[0];
      const filteredItems =
        activeCatObj.key === 'optic'
          ? activeCatObj.items.filter(matchesOpticFilter)
          : activeCatObj.items;

      const opticSubBarHtml =
        activeCatObj.key === 'optic'
          ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px;">
              ${[
                { id: 'all', label: 'All Optics' },
                { id: '1x', label: '1× Reflex' },
                { id: 'mid', label: '2×–4× Mid' },
                { id: 'lpvo_sniper', label: '6×–12× Scope' },
                { id: 'thermal', label: '🌡️ Thermal' }
              ]
                .map(
                  (f) =>
                    `<button type="button" class="abi-filter-pill gs-optic-filter-btn ${
                      opticFilter === f.id ? 'active' : ''
                    }" data-optic-filter="${f.id}">${f.label}</button>`
                )
                .join('')}
            </div>`
          : '';

      const cardsHtml = filteredItems
        .map((item) => {
          const isEquipped =
            (wepAttMap[activeCatObj.key] ||
              (activeCatObj.key === 'optic' ? 'factory' : 'stock')) === item.id;
          const isOwned =
            (ownedUpgrades instanceof Set
              ? ownedUpgrades.has(item.id)
              : Boolean(
                  ownedUpgrades[activeCatObj.key] &&
                    ownedUpgrades[activeCatObj.key].includes(item.id)
                )) || item.price === 0;
          const canAfford = totalCash >= item.price;

          const btnText = isEquipped
            ? '✓ MOUNTED'
            : isOwned
            ? 'MOUNT'
            : canAfford
            ? `BUY ($${item.price})`
            : `$${item.price}`;
          const btnBg = isEquipped
            ? '#27ae60'
            : isOwned
            ? '#2980b9'
            : canAfford
            ? '#f39c12'
            : '#475569';

          return `
            <div style="background:${
              isEquipped ? 'rgba(39,174,96,0.16)' : 'rgba(15,24,34,0.95)'
            };border:1.5px solid ${
            isEquipped
              ? '#2ecc71'
              : isOwned
              ? 'rgba(52,152,219,0.55)'
              : 'rgba(255,255,255,0.13)'
          };border-radius:6px;padding:7px 9px;display:flex;flex-direction:column;justify-content:space-between;gap:5px;">
              <div>
                <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;">
                  <span style="font-size:11px;font-weight:900;color:${
                    isEquipped ? '#7bed9f' : '#ffffff'
                  };white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.shortName || item.name}</span>
                  <span style="font-size:9px;font-weight:900;color:${
                    item.price === 0 ? '#94a3b8' : isOwned ? '#74b9ff' : '#f1c40f'
                  };flex-shrink:0;">${
            item.price === 0 ? 'STOCK' : isOwned ? 'OWNED' : `$${item.price}`
          }</span>
                </div>
                <div style="font-size:9.5px;color:#94a3b8;margin-top:2px;line-height:1.28;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${item.desc}</div>
              </div>
              <div style="display:flex;gap:4px;">
                <button type="button" class="gunsmith-item-btn" data-cat="${activeCatObj.key}" data-id="${item.id}" data-weapon="${workbenchWeaponId}" style="flex:1;background:${btnBg};color:${
            !isEquipped && !isOwned && canAfford ? '#111' : '#fff'
          };border:none;border-radius:4px;padding:4.5px 7px;font-size:9.5px;font-weight:900;cursor:pointer;">
                  ${btnText}
                </button>
                ${
                  isOwned && item.price > 0
                    ? `<button type="button" class="gs-mount-all-guns-btn" data-cat="${activeCatObj.key}" data-id="${item.id}" title="Mount across ALL owned firearms" style="background:rgba(0,210,211,0.2);border:1px solid #00d2d3;color:#81ecec;border-radius:4px;padding:4.5px 6px;font-size:9px;font-weight:900;cursor:pointer;flex-shrink:0;">⚡ All</button>`
                    : ''
                }
              </div>
            </div>
          `;
        })
        .join('');

      return `
        <div style="display:flex;flex-direction:column;gap:7px;flex:1;min-height:0;">
          <div style="display:grid;grid-template-columns:1.25fr 1fr;gap:8px;align-items:stretch;flex-shrink:0;">
            <div class="abi-workbench-wrap" style="display:flex;flex-direction:column;justify-content:space-between;">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
                <div style="display:flex;gap:4px;">
                  <button type="button" class="gs-wep-workbench-btn" data-wep-slot="primary" style="padding:3px 8px;border-radius:4px;border:1px solid ${
                    workbenchSlot === 'primary' ? '#2ecc71' : 'rgba(255,255,255,0.2)'
                  };background:${
                    workbenchSlot === 'primary' ? 'rgba(46,204,113,0.24)' : 'rgba(15,24,34,0.9)'
                  };color:#fff;font-size:10px;font-weight:900;cursor:pointer;">[1] ${customPrimaryDef.shortName}</button>
                  <button type="button" class="gs-wep-workbench-btn" data-wep-slot="secondary" style="padding:3px 8px;border-radius:4px;border:1px solid ${
                    workbenchSlot === 'secondary' ? '#2ecc71' : 'rgba(255,255,255,0.2)'
                  };background:${
                    workbenchSlot === 'secondary' ? 'rgba(46,204,113,0.24)' : 'rgba(15,24,34,0.9)'
                  };color:#fff;font-size:10px;font-weight:900;cursor:pointer;">[2] ${customSecondaryDef.shortName}</button>
                </div>
                <span style="font-size:10px;font-weight:900;color:#f1c40f;">${customWorkbenchDef.name}</span>
              </div>
              <div style="height:68px;display:flex;align-items:center;justify-content:center;">
                ${this.buildWeaponSvg(baseWorkbenchDef.id, wepAttMap, { height: 60 })}
              </div>
            </div>
            <div style="background:rgba(12,18,26,0.95);border:1px solid rgba(255,255,255,0.12);border-radius:7px;padding:7px 10px;overflow-y:auto;max-height:112px;">
              ${this.buildWeaponStatBarsHtml(baseWorkbenchDef, customWorkbenchDef)}
            </div>
          </div>

          <div style="display:grid;grid-template-columns:repeat(5, minmax(0, 1fr));gap:5px;flex-shrink:0;">
            ${hardpointTabsHtml}
          </div>

          <div style="flex:1;min-height:0;overflow-y:auto;padding-right:3px;">
            ${opticSubBarHtml}
            <div style="display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));gap:6px;">
              ${cardsHtml}
            </div>
          </div>
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

          <!-- 5 SUB-TABS FOR VEHICLE, AIRCRAFT & FIELD REQUISITIONS -->
          <div style="display:flex;gap:5px;flex-shrink:0;flex-wrap:wrap;">
            ${[
              { id: 'airwing', lbl: '✈️ Jets & Helis', col: '#48dbfb' },
              { id: 'ac130', lbl: '🛸 AC-130 Tech', col: '#2ecc71' },
              { id: 'armor', lbl: '🛡️ Ground Armor', col: '#f1c40f' },
              { id: 'b2_secret', lbl: '🦇 B-2 & 1903', col: '#00d2d3' },
              { id: 'drops', lbl: '⚡ Field Drops', col: '#3498db' }
            ]
              .map((st) => {
                const isAct = vSubTab === st.id;
                return `<button type="button" class="gs-veh-subtab-btn" data-vsub="${st.id}" style="flex:1;padding:5px 7px;border-radius:5px;border:1.5px solid ${
                  isAct ? st.col : 'rgba(255,255,255,0.16)'
                };background:${
                  isAct ? 'rgba(18,36,54,0.98)' : 'rgba(12,18,26,0.9)'
                };color:${isAct ? st.col : '#cbd5e1'};font-size:10px;font-weight:900;cursor:pointer;">${st.lbl}</button>`;
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

          <!-- SUB-TAB 5: FIELD REQUISITIONS & BANK WIRE -->
          <div style="display:${vSubTab === 'drops' ? 'flex' : 'none'};flex-direction:column;gap:8px;flex:1;min-height:0;overflow-y:auto;">
            ${renderRequisitionsMode()}
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
        <div id="gs-side-by-side-loot-view" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:stretch;flex:1;min-height:0;">
          <!-- LEFT VIEW (50% WIDTH): MY OPERATOR INVENTORY, SLING, RIG & 2D BACKPACK DROP ZONES -->
          <div id="gs-my-inventory-drop-pane" class="gs-drop-target" data-drop-zone="inventory" style="background:rgba(12,22,32,0.97);border:1.5px solid #2ecc71;border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;justify-content:space-between;overflow-y:auto;">
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
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span style="font-size:15px;font-weight:900;color:#f1c40f;letter-spacing:0.8px;">
            ${activeTab === 'backpack' ? '🎒 LOOT &amp; PACK' : '🔫 LOADOUT'}
          </span>
          <div class="gs-role-strip">${classHeaderPillsHtml}</div>
          ${
            !workbenchAccess.allowed
              ? `<span style="background:rgba(243,156,18,0.16);border:1px solid rgba(243,156,18,0.5);color:#ffd32a;border-radius:4px;padding:2px 7px;font-size:9.5px;font-weight:900;" title="Visit Main Base HQ, Friendly FOB, or Ammo Stash [7] for live field resupply">⏳ Applies Next Spawn / At FOB</span>`
              : ''
          }
        </div>
        <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
          <div style="background:rgba(46,204,113,0.14);border:1px solid rgba(46,204,113,0.55);border-radius:5px;padding:3px 8px;font-size:11px;font-weight:900;color:#7bed9f;" title="Persistent Armory Vault">
            🏦 <span id="gs-wh-cash">$${this.formatCashAmount(whCash)}</span>
          </div>
          <div style="background:rgba(241,196,15,0.14);border:1px solid rgba(241,196,15,0.55);border-radius:5px;padding:3px 8px;font-size:11px;font-weight:900;color:#f1c40f;" title="Current Match Cash">
            ⚡ <span id="gs-modal-cash">$${this.formatCashAmount(matchCash)}</span>
          </div>
          <button id="gs-resupply-now-btn" type="button" style="background:rgba(0,184,148,0.24);color:#7bed9f;border:1px solid #00b894;border-radius:5px;padding:4px 8px;font-size:10px;font-weight:900;cursor:pointer;" title="Resupply Magazines, Dressings &amp; Armor at HQ/FOB/Stash">📦 Resupply</button>
          <button id="gs-inspect-weapon-btn" type="button" style="background:rgba(255,255,255,0.08);color:#dfe6e9;border:1px solid rgba(255,255,255,0.2);border-radius:5px;padding:4px 8px;font-size:10px;font-weight:900;cursor:pointer;" title="Play Weapon Inspect Animation [F/V]">🔍 Inspect</button>
          <button id="gs-toggle-fullscreen-btn" type="button" style="background:rgba(255,255,255,0.07);color:#cbd5e1;border:1px solid rgba(255,255,255,0.18);border-radius:5px;padding:4px 7px;font-size:10px;font-weight:900;cursor:pointer;" title="Toggle Compact Centered Window vs Fullscreen">⛶</button>
          <button id="gs-close-btn" type="button" style="background:rgba(231,76,60,0.25);color:#ff7675;border:1px solid #e74c3c;border-radius:5px;padding:4px 10px;font-size:10.5px;font-weight:900;cursor:pointer;">✕ Close</button>
        </div>
      </div>

      <div class="abi-mode-tabs">
        <button type="button" class="gs-tab-btn gs-top-tab ${activeTab === 'warehouse' ? 'active' : ''}" data-tab="warehouse">
          🔫 Weapons
        </button>
        <button type="button" class="gs-tab-btn gs-top-tab ${activeTab === 'attachments' ? 'active' : ''}" data-tab="attachments">
          🔧 Gunsmith (${baseWorkbenchDef.shortName})
        </button>
        <button type="button" class="gs-tab-btn gs-top-tab ${activeTab === 'gear' ? 'active' : ''}" data-tab="gear">
          🛡️ Gear &amp; Stash
        </button>
        <button type="button" class="gs-tab-btn gs-top-tab ${activeTab === 'backpack' ? 'active' : ''}" data-tab="backpack">
          🎒 Pack / Loot${nearbyEnemyPacksCount > 0 ? ` (${nearbyEnemyPacksCount})` : ''}
        </button>
        <button type="button" class="gs-tab-btn gs-top-tab ${activeTab === 'vehicles' ? 'active' : ''}" data-tab="vehicles">
          🚜 Vehicles &amp; Drops
        </button>
        <button type="button" class="gs-tab-btn gs-top-tab ${activeTab === 'cases' ? 'active' : ''}" data-tab="cases">
          🎰 Cases (🔑 ${this.player?.caseKeys ?? 1})
        </button>
      </div>

      <div style="flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;">
        ${
          activeTab === 'backpack'
            ? renderBackpackAndLootMode()
            : activeTab === 'cases'
            ? renderMysteryCasesMode()
            : activeTab === 'attachments'
            ? renderWorkbenchMode()
            : activeTab === 'gear'
            ? renderGearAndStashMode()
            : activeTab === 'vehicles'
            ? renderVehicleBayMode()
            : renderCodWeaponsMode()
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
        this._gunsmithEdgeFullscreen = !this._gunsmithEdgeFullscreen;
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
        this._gunsmithActiveTab = nextTab;
        this.renderGunsmithModalContent(modal);
      });
    });

    modal.querySelectorAll('[data-cod-slot]').forEach((box) => {
      box.addEventListener('click', (ev) => {
        if (ev.target && ev.target.closest('button')) return;
        this._codBrowseSlot = box.dataset.codSlot || 'primary';
        this.renderGunsmithModalContent(modal);
      });
    });

    modal.querySelectorAll('.cod-cat-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.codCat || 'assault_rifle';
        if (cat === 'pistol') {
          this._codBrowseSlot = 'secondary';
        } else {
          this._codBrowseSlot = 'primary';
          this._codPrimaryCategory = cat;
        }
        this.renderGunsmithModalContent(modal);
      });
    });

    modal.querySelectorAll('.gs-shell-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        const shId = btn.dataset.shellId;
        if (shId && typeof this.player?.cycleShotgunShellType === 'function') {
          this.player.cycleShotgunShellType(shId);
          this._lastMagSignature = '';
          this.updateCashAndGunsmithHud();
        }
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
        this._gunsmithHardpoint = el.dataset.hardpoint || 'optic';
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
