import { ATTACHMENT_CATALOG } from '../weapons.js?v=35';

export const GunsmithModal = {
  // ─── GUNSMITH & TACTICAL ARMORY SHOP ([I] Key or HUD / Deploy Button) ──
  updateCashAndGunsmithHud() {
    const cash = this.player && typeof this.player.cash === 'number' ? this.player.cash : 600;
    const cashStr = `$${cash.toLocaleString()}`;
    if (this.hudCashValEl) this.hudCashValEl.textContent = cashStr;
    if (this.deployCashValEl) this.deployCashValEl.textContent = cashStr;
    if (this.ammoGunsmithBtnEl) {
      this.ammoGunsmithBtnEl.textContent = `🔧 [I] GUNSMITH (💰 ${cashStr})`;
    }
    const modal = this.el('gunsmith-modal');
    if (modal && !modal.classList.contains('hidden')) {
      this.renderGunsmithModalContent(modal);
    }
  },

  toggleGunsmithModal(forceState) {
    let modal = this.el('gunsmith-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'gunsmith-modal';
      modal.className = 'hidden';
      modal.style.cssText = `
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
        width: 900px; max-width: 96vw; max-height: 90vh; overflow-y: auto;
        background: rgba(11, 18, 25, 0.98); border: 2px solid #f1c40f;
        border-radius: 8px; padding: 16px 20px; z-index: 10025;
        font-family: 'Rajdhani', 'Segoe UI', sans-serif; color: #ecf0f1;
        box-shadow: 0 18px 60px rgba(0, 0, 0, 0.92); pointer-events: auto;
      `;
      document.body.appendChild(modal);
      if (this._domCache) this._domCache.set('gunsmith-modal', modal);
    }

    const willShow =
      typeof forceState === 'boolean' ? forceState : modal.classList.contains('hidden');
    if (willShow) {
      if (document.pointerLockElement === document.body) {
        document.exitPointerLock();
      }
      modal.classList.remove('hidden');
      this.renderGunsmithModalContent(modal);
    } else {
      modal.classList.add('hidden');
      if (
        !this.player.dead &&
        this.deployScreenEl &&
        this.deployScreenEl.classList.contains('hidden')
      ) {
        document.body.requestPointerLock();
      }
    }
  },

  renderGunsmithModalContent(modal) {
    const cash = this.player.cash || 0;
    const eq = this.player.equippedUpgrades || {};
    const owned = this.player.ownedUpgrades || {};

    const categories = [
      {
        key: 'muzzle',
        title: '1. MUZZLE & BARREL ATTACHMENTS (FLASH HIDER / SILENCER)',
        sub: 'Eliminates ADS muzzle flash, muffles gunshot report, hides tracers & stabilizes recoil',
        items: ATTACHMENT_CATALOG.muzzle || []
      },
      {
        key: 'magazine',
        title: '2. MAGAZINE & AMMUNITION CAPACITY UPGRADES',
        sub: 'Extends clip capacity (+50% Extended Mag or 2x 60-Round Casket/Drum Mag) & spare magazines',
        items: ATTACHMENT_CATALOG.magazine || []
      },
      {
        key: 'optic',
        title: '3. OPTICS, HOLOGRAPHICS & MAGNIFIED SCOPES',
        sub: 'Customizes primary ADS reticle, magnification FOV & [V] 45° Canted Red Dot backup sight',
        items: ATTACHMENT_CATALOG.optic || []
      },
      {
        key: 'grip',
        title: '4. UNDERBARREL GRIPS & LASER / MATCH TRIGGER',
        sub: 'Reduces vertical recoil kick, tightens hipfire/ADS spread & boosts cyclic RPM',
        items: ATTACHMENT_CATALOG.grip || []
      },
      {
        key: 'vest',
        title: '5. TACTICAL BODY ARMOR VESTS & RIG CARRIERS',
        sub: 'Upgrades Armor HP (50 → 100 → 150), bullet damage absorption & medical/frag pouches',
        items: ATTACHMENT_CATALOG.vest || []
      }
    ];

    const renderCategoryHtml = (cat) => {
      const cardsHtml = cat.items
        .map((item) => {
          const isEquipped = eq[cat.key] === item.id;
          const isOwned = Boolean(owned[cat.key] && owned[cat.key].includes(item.id)) || item.price === 0;
          const canAfford = cash >= item.price;

          const borderCol = isEquipped
            ? '#2ecc71'
            : isOwned
            ? 'rgba(52, 152, 219, 0.7)'
            : canAfford
            ? 'rgba(241, 196, 15, 0.55)'
            : 'rgba(255, 255, 255, 0.14)';
          const bgCol = isEquipped
            ? 'rgba(46, 204, 113, 0.18)'
            : isOwned
            ? 'rgba(41, 128, 185, 0.14)'
            : 'rgba(18, 28, 38, 0.9)';

          let btnText = '';
          let btnBg = '';
          if (isEquipped) {
            btnText = '✓ EQUIPPED ON LOADOUT';
            btnBg = '#27ae60';
          } else if (isOwned) {
            btnText = 'EQUIP ATTACHMENT';
            btnBg = '#2980b9';
          } else if (canAfford) {
            btnText = `BUY & EQUIP ($${item.price})`;
            btnBg = '#f39c12';
          } else {
            btnText = `NEED $${item.price} (SHORT $${item.price - cash})`;
            btnBg = '#4b5563';
          }

          return `
            <div style="background:${bgCol};border:1.5px solid ${borderCol};border-radius:6px;padding:9px 11px;display:flex;flex-direction:column;justify-content:space-between;gap:6px;">
              <div>
                <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
                  <span style="font-size:12.5px;font-weight:900;color:${isEquipped ? '#7bed9f' : '#fff'};">${item.name}</span>
                  <span style="font-size:11px;font-weight:900;color:${item.price === 0 ? '#95a5a6' : isOwned ? '#74b9ff' : '#f1c40f'};">${
            item.price === 0 ? 'STOCK ($0)' : isOwned ? 'OWNED' : `$${item.price}`
          }</span>
                </div>
                <div style="font-size:10.5px;color:#bdc3c7;margin-top:3px;line-height:1.35;">${item.desc}</div>
              </div>
              <button type="button" class="gunsmith-item-btn" data-cat="${cat.key}" data-id="${item.id}" style="background:${btnBg};color:${
            !isEquipped && !isOwned && canAfford ? '#111' : '#fff'
          };border:none;border-radius:4px;padding:5px 8px;font-size:10.5px;font-weight:900;cursor:pointer;letter-spacing:0.5px;">
                ${btnText}
              </button>
            </div>
          `;
        })
        .join('');

      return `
        <div style="margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;">
            <span style="font-size:12px;font-weight:900;color:#f1c40f;letter-spacing:0.8px;">${cat.title}</span>
            <span style="font-size:10px;color:#95a5a6;">${cat.sub}</span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(210px, 1fr));gap:8px;">
            ${cardsHtml}
          </div>
        </div>
      `;
    };

    const curWep = this.player.currentWeapon ? this.player.currentWeapon() : null;
    const wepSummary = curWep
      ? `${curWep.def.name} • CLIP: ${curWep.def.clipSize} RDS • FLASH: ${Math.round(
          (curWep.def.flashMult !== undefined ? curWep.def.flashMult : 1) * 100
        )}% • ARMOR: ${Math.ceil(this.player.armor)}/${this.player.maxArmor || 50}`
      : `ARMOR: ${Math.ceil(this.player.armor)}/${this.player.maxArmor || 50}`;

    modal.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.14);padding-bottom:10px;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
        <div>
          <div style="font-size:19px;font-weight:900;color:#f1c40f;letter-spacing:1.2px;">🔧 GUNSMITH &amp; TACTICAL ARMORY SHOP [I]</div>
          <div style="font-size:11px;color:#bdc3c7;">Earn Combat Cash ($) from Kills (+$110), Revives (+$220), Captures (+$220) &amp; Armor Kills (+$275) — Upgrades apply immediately!</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="background:rgba(241,196,15,0.16);border:1.5px solid #f1c40f;border-radius:5px;padding:5px 12px;font-size:15px;font-weight:900;color:#f1c40f;">
            💰 FUNDS: <span id="gs-modal-cash">$${cash.toLocaleString()}</span>
          </div>
          <button id="gs-grant-cash-btn" type="button" style="background:#27ae60;color:#fff;border:none;border-radius:4px;padding:6px 10px;font-size:11px;font-weight:900;cursor:pointer;" title="Instant Combat Supply Grant for testing any weapon attachment or armor vest!">💵 +$500 SUPPLY GRANT</button>
          <button id="gs-close-btn" type="button" style="background:#e74c3c;color:#fff;border:none;border-radius:4px;padding:6px 12px;font-size:11px;font-weight:900;cursor:pointer;">✕ CLOSE [I]</button>
        </div>
      </div>

      <div style="background:rgba(22,34,46,0.9);border:1px solid rgba(46,204,113,0.4);border-radius:5px;padding:6px 12px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;font-size:11.5px;">
        <span>🔫 <b>ACTIVE LOADOUT PREVIEW:</b> <strong style="color:#7bed9f;">${wepSummary}</strong></span>
        <span style="color:#74b9ff;font-size:10.5px;">💡 Tip: Equipping <b>Flash Hider</b> cuts ADS flash by 82%; <b>SOCOM Silencer</b> eliminates 100% of muzzle flash &amp; tracers!</span>
      </div>

      ${categories.map(renderCategoryHtml).join('')}
    `;

    const closeBtn = modal.querySelector('#gs-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.toggleGunsmithModal(false));
    }

    const grantBtn = modal.querySelector('#gs-grant-cash-btn');
    if (grantBtn) {
      grantBtn.addEventListener('click', () => {
        this.player.addCash(500, 'COMBAT SUPPLY GRANT');
        this.addXpNotification(0, '💰 +$500 COMBAT FUNDS GRANTED!');
        this.updateCashAndGunsmithHud();
      });
    }

    modal.querySelectorAll('.gunsmith-item-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.cat;
        const itemId = btn.dataset.id;
        const res = this.player.buyOrEquipUpgrade(cat, itemId);
        if (res && res.ok) {
          const actionVerb = res.action === 'BOUGHT' ? 'PURCHASED & EQUIPPED' : 'EQUIPPED';
          this.addXpNotification(0, `🔧 ${actionVerb}: ${res.item.name.toUpperCase()}`);
          this._lastMagSignature = '';
          this.updateCashAndGunsmithHud();
        } else if (res && res.reason === 'INSUFFICIENT_FUNDS') {
          this.addXpNotification(
            0,
            `⚠️ INSUFFICIENT FUNDS FOR ${res.item.name.toUpperCase()} ($${res.item.price}) — CLICK [+$500 SUPPLY GRANT] OR EARN KILLS!`
          );
        }
      });
    });
  }
};

export default GunsmithModal;
