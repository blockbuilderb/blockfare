import {
  WEAPON_DEFS,
  CLASS_LOADOUTS,
  ATTACHMENT_CATALOG,
  createWeaponViewModel
} from '../weapons.js?v=35';
import { sound } from '../audio.js?v=35';
import { PLAYER } from '../config.js?v=35';

export const GunsmithMethods = {
  loadGunsmithState() {
    try {
      const raw = localStorage.getItem('bb_gunsmith_state_v1');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (typeof parsed.cash === 'number' && Number.isFinite(parsed.cash)) {
        this.cash = Math.max(0, Math.floor(parsed.cash));
      }
      if (Array.isArray(parsed.owned)) {
        parsed.owned.forEach((id) => this.ownedUpgrades.add(id));
      }
      if (parsed.equipped && typeof parsed.equipped === 'object') {
        for (const k of ['muzzle', 'magazine', 'optic', 'grip', 'vest']) {
          if (parsed.equipped[k]) {
            this.equippedUpgrades[k] = parsed.equipped[k];
          }
        }
      }
    } catch (_) {}
  },

  saveGunsmithState() {
    try {
      localStorage.setItem(
        'bb_gunsmith_state_v1',
        JSON.stringify({
          cash: this.cash,
          owned: Array.from(this.ownedUpgrades),
          equipped: this.equippedUpgrades
        })
      );
    } catch (_) {}
  },

  getEquippedItem(category) {
    const list = ATTACHMENT_CATALOG[category] || [];
    const targetId = this.equippedUpgrades[category];
    return list.find((it) => it.id === targetId) || list[0] || null;
  },

  getUpgradeMods() {
    return {
      muzzle: this.getEquippedItem('muzzle'),
      magazine: this.getEquippedItem('magazine'),
      optic: this.getEquippedItem('optic'),
      grip: this.getEquippedItem('grip'),
      vest: this.getEquippedItem('vest')
    };
  },

  addCash(amount, reason = '') {
    const clean = Math.round(amount || 0);
    if (clean === 0) return;
    this.cash = Math.max(0, (this.cash || 0) + clean);
    this.saveGunsmithState();
    if (this.onCashChanged) {
      this.onCashChanged(this.cash, clean, reason);
    }
  },

  buyOrEquipUpgrade(category, itemId) {
    const list = ATTACHMENT_CATALOG[category];
    if (!list) return { ok: false, reason: 'INVALID CATEGORY' };
    const item = list.find((it) => it.id === itemId);
    if (!item) return { ok: false, reason: 'ITEM NOT FOUND' };

    let boughtNow = false;
    if (!this.ownedUpgrades.has(item.id)) {
      if (this.cash < item.price) {
        return { ok: false, reason: `NEED $${item.price - this.cash} MORE CASH!` };
      }
      this.cash -= item.price;
      this.ownedUpgrades.add(item.id);
      boughtNow = true;
    }

    this.equippedUpgrades[category] = item.id;
    this.saveGunsmithState();
    this.applyCustomizationsToActiveLoadout(true);
    sound.playReload();
    if (this.onCashChanged) {
      this.onCashChanged(
        this.cash,
        boughtNow ? -item.price : 0,
        boughtNow ? `PURCHASED & EQUIPPED: ${item.name}` : `EQUIPPED: ${item.name}`
      );
    }
    return { ok: true, boughtNow, item };
  },

  buildCustomizedWeaponDef(baseDef, isPrimaryGun = false) {
    if (!baseDef || baseDef.type !== 'gun') return baseDef;
    const muzzle = this.getEquippedItem('muzzle');
    const mag = this.getEquippedItem('magazine');
    const optic = this.getEquippedItem('optic');
    const grip = this.getEquippedItem('grip');

    const capMult = mag ? mag.capMult : 1.0;
    const newClip = Math.max(1, Math.round(baseDef.clipSize * capMult));
    const newReserve = Math.max(newClip, Math.round(baseDef.reserveAmmo * capMult));
    const recoilMult = (muzzle ? muzzle.recoilMult : 1.0) * (grip ? grip.recoilMult : 1.0);
    const spreadMult = grip ? grip.spreadMult : 1.0;
    const rpmMult = grip ? grip.rpmMult : 1.0;

    // Primary weapons use custom optic if selected; sidearm keeps iron/reddot
    const useCustomOptic = isPrimaryGun && optic && optic.id !== 'factory' && optic.opticType;
    const finalOpticType = useCustomOptic ? optic.opticType : baseDef.opticType;
    const finalAdsFov = useCustomOptic && optic.adsFov ? optic.adsFov : baseDef.adsFov;
    const finalHasCanted = Boolean(baseDef.hasCantedSight || (useCustomOptic && optic.grantCanted));

    const tags = [];
    if (muzzle && muzzle.id !== 'stock') tags.push(muzzle.shortName);
    if (mag && mag.id !== 'std_mag') tags.push(mag.shortName);
    if (useCustomOptic) tags.push(optic.shortName);
    if (grip && grip.id !== 'std_grip') tags.push(grip.shortName);

    return {
      ...baseDef,
      clipSize: newClip,
      reserveAmmo: newReserve,
      reloadTime: Number((baseDef.reloadTime * (mag ? mag.reloadMult : 1.0)).toFixed(2)),
      recoilPitch: baseDef.recoilPitch * recoilMult,
      recoilYaw: baseDef.recoilYaw * recoilMult,
      spreadHip: baseDef.spreadHip * spreadMult,
      rpm: Math.round(baseDef.rpm * rpmMult),
      opticType: finalOpticType,
      adsFov: finalAdsFov,
      hasCantedSight: finalHasCanted,
      isScoped: finalOpticType === 'sniper8x' || Boolean(baseDef.isScoped && finalOpticType === 'sniper8x'),
      flashMult: muzzle ? muzzle.flashMult : 1.0,
      silenced: Boolean(muzzle && muzzle.silenced),
      hideTracers: Boolean(muzzle && muzzle.hideTracers),
      customTags: tags,
      caliber: tags.length > 0 ? `${baseDef.caliber.split('•')[0].trim()} • ${tags.join(' + ')}` : baseDef.caliber
    };
  },

  applyCustomizationsToActiveLoadout(refillAmmoAndArmor = false) {
    const vestDef = this.getEquippedItem('vest');
    this.maxArmor = vestDef ? vestDef.maxArmor : PLAYER.MAX_ARMOR;
    this.armorAbsorbRatio = vestDef ? vestDef.absorbRatio : PLAYER.ARMOR_ABSORB_RATIO;
    if (refillAmmoAndArmor) {
      this.armor = this.maxArmor;
      this.bandages = Math.max(
        this.bandages,
        (this.role === 'medic' ? 6 : 3) + (vestDef ? vestDef.bonusBandages : 0)
      );
      this.grenades = Math.max(this.grenades, 2 + (vestDef ? vestDef.bonusGrenades : 0));
    }

    const weaponIds = CLASS_LOADOUTS[this.role] || CLASS_LOADOUTS.engineer;
    const prevSlotIdx = this.currentSlotIndex;
    this.slots = weaponIds.map((id, idx) => {
      const baseDef = WEAPON_DEFS[id];
      const def = this.buildCustomizedWeaponDef(baseDef, idx === 0);
      return {
        def,
        clip: def.clipSize,
        reserve: def.reserveAmmo,
        mags: this.buildMagArray(def.clipSize, def.reserveAmmo),
        mesh: createWeaponViewModel(def, this.team, this.equippedUpgrades)
      };
    });
    this.switchSlot(Math.min(prevSlotIdx, this.slots.length - 1));
  }
};
