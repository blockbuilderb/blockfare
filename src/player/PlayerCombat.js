import * as THREE from '../../vendor/three.module.js';
import { sound } from '../audio.js?v=146';
import {
  PLAYER,
  COMBAT,
  PROJECTILES,
  DISTANCES,
  DEPLOYABLES,
  getAllowedRoleIds,
  resolveRoleForEra
} from '../config.js?v=146';
import { events } from '../events.js?v=146';
import {
  WEAPON_DEFS,
  ATTACHMENT_CATALOG,
  createWeaponViewModel,
  getWeaponHipOffsetX
} from '../weapons.js?v=146';
import { evaluateCatastrophicKill } from '../bots/BotManager.js?v=146';
import {
  evaluateMarksmanShot,
  computeBallisticSolution,
  syncActiveMarksmanTitle,
  saveMarksmanProfile,
  loadMarksmanProfile
} from './MarksmanSystem.js?v=146';

function markShared(asset) {
  if (asset) {
    if (!asset.userData) asset.userData = {};
    asset.userData.shared = true;
  }
  return asset;
}

// ─── Shared Cached Projectile / Arrow / Ordnance Geometries & Materials (userData.shared = true) ───
const _droppedMagGeo = markShared(new THREE.BoxGeometry(0.044, 0.16, 0.072));
const _droppedMagMat = markShared(new THREE.MeshStandardMaterial({ color: 0x22282e, roughness: 0.75 }));
const _brassCasingGeo = markShared(new THREE.BoxGeometry(0.018, 0.018, 0.045));
const _brassCasingMat = markShared(new THREE.MeshBasicMaterial({ color: 0xf1c40f }));
const _rpgRocketGeo = markShared(new THREE.BoxGeometry(0.18, 0.18, 0.68));
const _rpgRocketMat = markShared(new THREE.MeshBasicMaterial({ color: 0xe67e22 }));
const _stingerSamGeo = markShared(new THREE.BoxGeometry(0.2, 0.2, 1.15));
const _stingerSamMat = markShared(new THREE.MeshBasicMaterial({ color: 0x00d2d3 }));
const _fragGrenadeGeo = markShared(new THREE.OctahedronGeometry(0.14, 0));
const _fragGrenadeMat = markShared(new THREE.MeshStandardMaterial({ color: 0x3b5323, roughness: 0.7 }));
const _c4Geo = markShared(new THREE.BoxGeometry(0.26, 0.15, 0.34));
const _c4Mat = markShared(new THREE.MeshStandardMaterial({ color: 0x5c6650 }));

const _arrowShaftGeo = markShared(new THREE.BoxGeometry(0.044, 0.044, 1.45));
const _xbowShaftGeo = markShared(new THREE.BoxGeometry(0.044, 0.044, 1.15));
const _arrowTipGeo = markShared(new THREE.ConeGeometry(0.08, 0.3, 4));
const _arrowFletchHGeo = markShared(new THREE.BoxGeometry(0.22, 0.02, 0.26));
const _arrowFletchVGeo = markShared(new THREE.BoxGeometry(0.02, 0.22, 0.26));
const _fireArrowConeGeo = markShared(new THREE.ConeGeometry(0.14, 0.46, 6));
const _arrowShaftMat = markShared(new THREE.MeshBasicMaterial({ color: 0xc89652 }));
const _xbowShaftMat = markShared(new THREE.MeshBasicMaterial({ color: 0x8b5a2b }));
const _arrowTipMat = markShared(new THREE.MeshBasicMaterial({ color: 0xd0d7de }));
const _fireTipMat = markShared(new THREE.MeshBasicMaterial({ color: 0xff7f00 }));
const _fletchMatRU = markShared(new THREE.MeshBasicMaterial({ color: 0xe74c3c }));
const _fletchMatUS = markShared(new THREE.MeshBasicMaterial({ color: 0xf5f6fa }));
const _fireConeMat = markShared(
  new THREE.MeshBasicMaterial({ color: 0xff5500, transparent: true, opacity: 0.9 })
);

const _hitArmorColor = new THREE.Color(0x48dbfb);
const _hitHeadColor = new THREE.Color(0xff2222);
const _hitBodyColor = new THREE.Color(0xd63031);
const _hitVehColor = new THREE.Color(0xf1c40f);
const _hitGroundColor = new THREE.Color(0x6b7c59);

// Shared Cached Optional Death Cam 3D Trajectory, Animated Bullet Tracer & X-Ray Silhouettes
const _deathTraceCoreGeo = markShared(new THREE.CylinderGeometry(0.032, 0.032, 1, 8, 1, true));
const _deathTraceGlowGeo = markShared(new THREE.CylinderGeometry(0.12, 0.12, 1, 8, 1, true));
const _deathOriginDiamondGeo = markShared(new THREE.OctahedronGeometry(0.52, 0));
const _deathImpactRingGeo = markShared(new THREE.RingGeometry(0.24, 0.44, 20));
const _deathBulletHeadGeo = markShared(new THREE.SphereGeometry(0.24, 10, 8));
const _deathBulletWakeGeo = markShared(new THREE.ConeGeometry(0.22, 2.4, 8, 1, true));
const _deathVicHeadGeo = markShared(new THREE.BoxGeometry(0.38, 0.38, 0.38));
const _deathVicTorsoGeo = markShared(new THREE.BoxGeometry(0.52, 0.66, 0.28));
const _deathVicArmGeo = markShared(new THREE.BoxGeometry(0.18, 0.62, 0.18));
const _deathVicLegGeo = markShared(new THREE.BoxGeometry(0.21, 0.68, 0.22));
const _deathKillerVehBoxGeo = markShared(new THREE.BoxGeometry(3.6, 2.3, 5.8));

const _deathTraceCoreMat = markShared(
  new THREE.MeshBasicMaterial({
    color: 0xff5252,
    transparent: true,
    opacity: 0.55,
    depthWrite: false
  })
);
const _deathTraceGlowMat = markShared(
  new THREE.MeshBasicMaterial({
    color: 0xff7675,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
    depthWrite: false
  })
);
const _deathBulletHeadMat = markShared(
  new THREE.MeshBasicMaterial({
    color: 0xfff3b0,
    transparent: true,
    opacity: 0.98,
    depthTest: false,
    depthWrite: false
  })
);
const _deathBulletWakeMat = markShared(
  new THREE.MeshBasicMaterial({
    color: 0xff4757,
    transparent: true,
    opacity: 0.78,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false
  })
);
const _deathVictimCyanMat = markShared(
  new THREE.MeshBasicMaterial({
    color: 0x00d2d3,
    transparent: true,
    opacity: 0.44,
    depthTest: false,
    depthWrite: false
  })
);
const _deathVictimHitMat = markShared(
  new THREE.MeshBasicMaterial({
    color: 0xff2e43,
    transparent: true,
    opacity: 0.92,
    depthTest: false,
    depthWrite: false
  })
);
const _deathKillerXrayMat = markShared(
  new THREE.MeshBasicMaterial({
    color: 0xff5e2b,
    transparent: true,
    opacity: 0.52,
    depthTest: false,
    depthWrite: false
  })
);
const _deathKillerWireMat = markShared(
  new THREE.MeshBasicMaterial({
    color: 0xff9f43,
    wireframe: true,
    transparent: true,
    opacity: 0.92,
    depthTest: false,
    depthWrite: false
  })
);
const _deathOriginMat = markShared(
  new THREE.MeshBasicMaterial({
    color: 0xff4757,
    wireframe: true,
    transparent: true,
    opacity: 0.95,
    depthTest: false,
    depthWrite: false
  })
);
const _deathImpactMat = markShared(
  new THREE.MeshBasicMaterial({
    color: 0xf1c40f,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.92,
    depthTest: false,
    depthWrite: false
  })
);
const _deathUpAxis = new THREE.Vector3(0, 1, 0);
const _deathSegVec = new THREE.Vector3();
const _deathMidPos = new THREE.Vector3();
const _deathLiveKillerTmp = new THREE.Vector3();

const _COMPASS_DIRS_8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const _HIT_ZONE_LABELS = {
  head: 'HEADSHOT (CRANIAL)',
  thorax: 'THORAX (CHEST)',
  leftArm: 'LEFT ARM',
  rightArm: 'RIGHT ARM',
  leftLeg: 'LEFT LEG',
  rightLeg: 'RIGHT LEG'
};

const _fireCamQuat = new THREE.Quaternion();
const _fireOrigin = new THREE.Vector3();
const _fireFwdDir = new THREE.Vector3();
const _fireMuzzlePos = new THREE.Vector3();
const _firePelletDir = new THREE.Vector3();

const _stepPrevPos = new THREE.Vector3();
const _stepVec = new THREE.Vector3();
const _stepDir = new THREE.Vector3();
const _stepImpactPt = new THREE.Vector3();
const _stepHeadPos = new THREE.Vector3();
const _stepTailPos = new THREE.Vector3();
const _stepLookAt = new THREE.Vector3();

const _muzzleQuat = new THREE.Quaternion();
const _muzzleRight = new THREE.Vector3();
const _muzzleUp = new THREE.Vector3();
const _casingPos = new THREE.Vector3();
const _casingVel = new THREE.Vector3();

export const CombatMethods = {
  getActiveOpticType() {
    const cur = this.currentWeapon();
    if (!cur || !cur.def.opticType) return null;
    if (this.useCantedSight && cur.def.hasCantedSight) {
      return 'reddot';
    }
    return cur.def.opticType;
  },

  /**
   * Finds the nearest injured standing friendly soldier (hp < 100) within `maxDist` meters.
   */
  findNearestInjuredFriendly(maxDist = DISTANCES.INTERACT_RANGE) {
    if (!this.botManager || !this.botManager.bots) return null;
    let best = null;
    let bestDistSq = maxDist * maxDist;
    const teamGrid = this.botManager.teamGrid && this.botManager.teamGrid[this.team];
    if (teamGrid && teamGrid.count > 0) {
      teamGrid.forEachInRadius(this.pos.x, this.pos.z, maxDist, (b) => {
        if (b.dead || b.downed || b.team !== this.team || b.hp >= PLAYER.MAX_HP) return;
        const dSq = b.pos.distanceToSquared(this.pos);
        if (dSq <= bestDistSq) {
          bestDistSq = dSq;
          best = b;
        }
      });
      return best;
    }
    for (let i = 0; i < this.botManager.bots.length; i++) {
      const b = this.botManager.bots[i];
      if (b.dead || b.downed || b.team !== this.team || b.hp >= PLAYER.MAX_HP) continue;
      const dSq = b.pos.distanceToSquared(this.pos);
      if (dSq <= bestDistSq) {
        bestDistSq = dSq;
        best = b;
      }
    }
    return best;
  },

  /**
   * Finds the nearest standing friendly MEDIC soldier within `maxDist` meters who can heal the Player's injuries.
   */
  findNearestFriendlyMedic(maxDist = 6.5) {
    if (!this.botManager || !this.botManager.bots) return null;
    let best = null;
    let bestDistSq = maxDist * maxDist;
    const teamGrid = this.botManager.teamGrid && this.botManager.teamGrid[this.team];
    if (teamGrid && teamGrid.count > 0) {
      teamGrid.forEachInRadius(this.pos.x, this.pos.z, maxDist, (b) => {
        if (b.dead || b.downed || b.drivingVehicle || b.team !== this.team || b.role !== 'MEDIC') return;
        const dSq = b.pos.distanceToSquared(this.pos);
        if (dSq <= bestDistSq) {
          bestDistSq = dSq;
          best = b;
        }
      });
      return best;
    }
    for (let i = 0; i < this.botManager.bots.length; i++) {
      const b = this.botManager.bots[i];
      if (b.dead || b.downed || b.drivingVehicle || b.team !== this.team || b.role !== 'MEDIC') continue;
      const dSq = b.pos.distanceToSquared(this.pos);
      if (dSq <= bestDistSq) {
        bestDistSq = dSq;
        best = b;
      }
    }
    return best;
  },

  /**
   * Finds the nearest uncollected In-Building Armory Case Key within `maxDist` meters.
   */
  findNearestBuildingKey(maxDist = 4.8) {
    if (!this.world || !Array.isArray(this.world.buildingKeys)) return null;
    let best = null;
    let bestDist = maxDist;
    for (const kObj of this.world.buildingKeys) {
      if (!kObj || kObj.collected) continue;
      const d = Math.hypot(
        kObj.pos.x - this.pos.x,
        kObj.pos.y - (this.pos.y + 0.9),
        kObj.pos.z - this.pos.z
      );
      if (d <= bestDist) {
        bestDist = d;
        best = kObj;
      }
    }
    return best;
  },

  /**
   * Collects an In-Building Armory Case Key (worth $250 for unlocking CS2 Mystery Cases!).
   */
  collectBuildingKeyObject(kObj) {
    if (!kObj || kObj.collected) return false;
    kObj.collected = true;
    if (kObj.mesh && this.world && this.world.scene) {
      this.world.scene.remove(kObj.mesh);
    }
    this.ensureWarehouseStructures?.();
    this.caseKeys = (this.caseKeys || 0) + 1;
    this.score = (this.score || 0) + 50;
    this.saveGunsmithState?.();
    sound.playBuy?.();
    if (this.onAwardXp) {
      this.onAwardXp(
        50,
        `🔑 FOUND ARMORY CASE KEY IN ${kObj.roomLabel || 'BUILDING ROOM'}! (KEYS OWNED: ${this.caseKeys})`
      );
    }
    if (window.game?.ui?.updateCashAndGunsmithHud) {
      window.game.ui.updateCashAndGunsmithHud();
    }
    return true;
  },

  /**
   * Finds the nearest Ammo & Kit Stash within `maxDist` meters.
   */
  findNearestAmmoCrate(maxDist = DISTANCES.INTERACT_RANGE) {
    if (!this.world || !this.world.ammoCrates) return null;
    let best = null;
    let bestDist = maxDist;
    for (const crate of this.world.ammoCrates) {
      const d = crate.pos.distanceTo(this.pos);
      if (d <= bestDist) {
        bestDist = d;
        best = crate;
      }
    }
    return best;
  },

  /**
   * Returns true if the player is standing near an Ammo & Kit Stash (<= 5.5m), inside their Main HQ Base (<= 145m),
   * or inside a Friendly Captured Objective FOB zone (<= flag.radius + 14m) where they can resupply [F],
   * swap Roles [F5–F11], and access the Gunsmith Workbench [L].
   */
  isAtResupplyPoint(maxCrateDist = 5.5) {
    if (this.squadDoctrineEnabled === false) return true;
    if (typeof this.canAccessGunsmithWorkbench === 'function' && this.canAccessGunsmithWorkbench()) {
      return true;
    }
    if (this.findNearestAmmoCrate(maxCrateDist)) return true;
    const basePos =
      this.team === 'RU'
        ? this.world?.spawns?.RU_BASE || this.world?.ruBase
        : this.world?.spawns?.US_BASE || this.world?.usBase;
    if (basePos && Math.hypot(this.pos.x - basePos.x, this.pos.z - basePos.z) <= 145) {
      return true;
    }
    if (this.world && Array.isArray(this.world.flags)) {
      for (const f of this.world.flags) {
        if (
          f.owner === this.team &&
          Math.hypot(this.pos.x - f.pos.x, this.pos.z - f.pos.z) <= (f.radius || 28) + 14
        ) {
          return true;
        }
      }
    }
    return false;
  },

  /**
   * Finds the nearest Enemy Loot Pack (or downed/fallen enemy soldier) within `maxDist` meters.
   */
  findNearestEnemyLoot(maxDist = 5.2) {
    if (!this.world) return null;
    let best = null;
    let bestDist = maxDist;

    if (Array.isArray(this.world.lootPacks)) {
      for (const pack of this.world.lootPacks) {
        if (!pack || !pack.items || pack.items.every((it) => it.looted)) continue;
        // Never allow looting friendly teammates!
        if (pack.ownerTeam && pack.ownerTeam === this.team) continue;
        if (pack.botRef && pack.botRef.team === this.team) continue;
        const d = Math.hypot(pack.pos.x - this.pos.x, pack.pos.z - this.pos.z);
        if (d <= bestDist) {
          bestDist = d;
          best = pack;
        }
      }
    }

    // Also check nearby downed enemy bots that don't have a lootPack spawned yet
    if (!best && this.botManager && Array.isArray(this.botManager.bots)) {
      for (const b of this.botManager.bots) {
        if (!b || b.team === this.team || (!b.downed && !b.dead)) continue;
        const d = Math.hypot(b.pos.x - this.pos.x, b.pos.z - this.pos.z);
        if (d <= bestDist) {
          if (!b.lootPack && typeof this.world.spawnEnemyLootPack === 'function') {
            b.lootPack = this.world.spawnEnemyLootPack(b);
          }
          if (b.lootPack && b.lootPack.items && b.lootPack.items.some((it) => !it.looted)) {
            bestDist = d;
            best = b.lootPack;
          }
        }
      }
    }
    return best;
  },

  /**
   * Returns all nearby Enemy Loot Packs within `maxDist` meters, sorted closest-first.
   * Keeps the currently inspected pack visible while the Manual Loot UI is open even as items are looted.
   */
  findNearbyEnemyLootPacks(maxDist = 8.5, activePackId = null) {
    if (!this.world) return [];
    // Ensure any downed enemy within maxDist has a lootPack created
    if (this.botManager && Array.isArray(this.botManager.bots)) {
      for (const b of this.botManager.bots) {
        if (!b || b.team === this.team || (!b.downed && !b.dead)) continue;
        const d = Math.hypot(b.pos.x - this.pos.x, b.pos.z - this.pos.z);
        if (d <= maxDist && !b.lootPack && typeof this.world.spawnEnemyLootPack === 'function') {
          b.lootPack = this.world.spawnEnemyLootPack(b);
        }
      }
    }
    const list = [];
    if (Array.isArray(this.world.lootPacks)) {
      for (const pack of this.world.lootPacks) {
        if (!pack || !pack.items) continue;
        // Never include friendly teammate packs!
        if (pack.ownerTeam && pack.ownerTeam === this.team) continue;
        if (pack.botRef && pack.botRef.team === this.team) continue;
        const isCurrentlyInspected = activePackId && pack.id === activePackId;
        if (!isCurrentlyInspected && pack.items.every((it) => it.looted)) continue;
        const dist = Math.hypot(pack.pos.x - this.pos.x, pack.pos.z - this.pos.z);
        if (dist <= maxDist) {
          list.push({ pack, dist });
        }
      }
    }
    list.sort((a, b) => a.dist - b.dist);
    return list.map((x) => x.pack);
  },

  /**
   * Removes any fully-looted 3D enemy loot packs once the Loot UI is closed.
   */
  cleanupEmptyLootPacks() {
    if (!this.world || !Array.isArray(this.world.lootPacks)) return;
    for (let i = this.world.lootPacks.length - 1; i >= 0; i--) {
      const pack = this.world.lootPacks[i];
      if (pack && Array.isArray(pack.items) && pack.items.every((it) => it.looted)) {
        if (pack.mesh) this.scene.remove(pack.mesh);
        this.world.lootPacks.splice(i, 1);
      }
    }
  },

  /**
   * Swaps the player's active Primary Firearm (`this.slots[0]`) with a looted enemy firearm in the field!
   */
  swapFieldWeapon(weaponId) {
    const baseDef = WEAPON_DEFS[weaponId];
    if (!baseDef || baseDef.type !== 'gun') return false;
    this.ensureWarehouseStructures?.();
    const def = this.buildCustomizedWeaponDef
      ? this.buildCustomizedWeaponDef(baseDef, true, weaponId)
      : baseDef;
    const wepAtts = this.getWeaponAttachmentMap
      ? this.getWeaponAttachmentMap(weaponId)
      : this.equippedUpgrades;
    this.slots[0] = {
      def,
      clip: def.clipSize,
      reserve: def.reserveAmmo,
      looseAmmo: def.maxLooseAmmo || 60,
      maxLooseAmmo: def.maxLooseAmmo || 60,
      mags: this.buildMagArray(def.clipSize, def.reserveAmmo),
      mesh: createWeaponViewModel(def, this.team, wepAtts)
    };
    this.switchSlot(0);
    sound.playReload();
    return true;
  },

  /**
   * Loots a single item from an Enemy Loot Pack into the player's Rig / Backpack.
   */
  lootItemFromPack(pack, itemId, mode = 'take') {
    if (!pack || !Array.isArray(pack.items)) return false;
    const item = pack.items.find((it) => it.id === itemId && !it.looted);
    if (!item) return false;

    const primarySlot = this.slots[0];
    let msg = '';

    if (item.type === 'weapon') {
      if (mode === 'scrap') {
        const scrapCash = item.scrapValue || 220;
        this.addCash?.(scrapCash, `STRIPPED ${item.shortName || item.name} PARTS`, false);
        msg = `🔩 STRIPPED ${item.name} FOR +$${scrapCash} MATCH CASH`;
      } else {
        this.swapFieldWeapon(item.weaponId);
        msg = `🔫 LOOTED & EQUIPPED ENEMY ${item.name} (${pack.ownerName})`;
      }
    } else if (item.type === 'mags') {
      if (primarySlot && primarySlot.def && primarySlot.def.clipSize > 1) {
        const addCount = item.magCount || 2;
        const clipSz = primarySlot.def.clipSize;
        if (!Array.isArray(primarySlot.mags)) primarySlot.mags = [];
        // Fill any partially-depleted mags first, then add full spare pouches
        for (let i = 0; i < primarySlot.mags.length; i++) {
          if (primarySlot.mags[i] < clipSz) primarySlot.mags[i] = clipSz;
        }
        const maxPouches = (primarySlot.def.spareMagSlots || 6) + 2;
        for (let c = 0; c < addCount && primarySlot.mags.length < maxPouches; c++) {
          primarySlot.mags.unshift(clipSz);
        }
        this.syncReserveFromMags(primarySlot);
        msg = `▱ LOOTED +${addCount} LOADED MAGAZINES INTO CHEST RIG (${primarySlot.mags.length} MAGS READY)`;
      }
    } else if (item.type === 'loose_ammo') {
      if (primarySlot) {
        const rounds = item.rounds || 90;
        const cap = Math.max(primarySlot.maxLooseAmmo || 120, (primarySlot.looseAmmo || 0) + rounds);
        primarySlot.maxLooseAmmo = cap;
        primarySlot.looseAmmo = Math.min(cap, (primarySlot.looseAmmo || 0) + rounds);
        msg = `🎒 LOOTED +${rounds} LOOSE BULLETS INTO BACKPACK (${primarySlot.looseAmmo} RDS TOTAL)`;
      }
    } else if (item.type === 'dressings') {
      const addDress = item.dressings || 2;
      const maxD = (this.maxBandages || (this.role === 'medic' ? 9 : 2)) + 2;
      this.bandages = Math.min(maxD, (this.bandages || 0) + addDress);
      const healHp = item.healHp || 35;
      this.hp = Math.min(PLAYER.MAX_HP, this.hp + healHp);
      this.bleeding = false;
      this.armFractured = false;
      this.legFractured = false;
      if (this.limbHealth) {
        for (const lk of Object.keys(this.limbHealth)) {
          this.limbHealth[lk] = Math.min(100, (this.limbHealth[lk] ?? 100) + 45);
        }
      }
      if (this.role === 'medic') {
        this.medicBagSupply = Math.min(
          this.maxMedicBagSupply || 600,
          (this.medicBagSupply || 0) + (item.medicBagBonus || 180)
        );
      }
      msg = `🩹 LOOTED +${addDress} FIELD DRESSINGS (${this.bandages} TOTAL) & +${healHp} HP TRAUMA TREATMENT`;
    } else if (item.type === 'ordnance') {
      this.grenades = Math.min(6, (this.grenades || 0) + (item.grenades || 1));
      if (this.slots[2] && this.slots[2].def) {
        const s2 = this.slots[2];
        if (s2.def.type === 'rpg' || s2.def.type === 'c4' || s2.def.type === 'ammocrate') {
          s2.reserve = (s2.reserve || 0) + (item.rockets || 1);
          if (s2.clip === 0 && s2.reserve > 0) {
            s2.clip = 1;
            s2.reserve--;
          }
        }
      }
      msg = `💣 LOOTED +${item.grenades || 1} FRAG GRENADE & +${item.rockets || 1} ORDNANCE CHARGE`;
    } else if (item.type === 'armor_plate') {
      const addArmor = item.armorAmount || 55;
      let upgradedPackName = '';
      if (item.backpackUpgradeId && this.equippedUpgrades) {
        const bpList = ATTACHMENT_CATALOG.backpack || [];
        const curBp = bpList.find((b) => b.id === (this.equippedUpgrades.backpack || 'no_pack'));
        const newBp = bpList.find((b) => b.id === item.backpackUpgradeId);
        if (newBp && (!curBp || (newBp.cells || 4) > (curBp.cells || 4))) {
          this.equippedUpgrades.backpack = newBp.id;
          this.ownedUpgrades?.add(newBp.id);
          this.saveGunsmithState?.();
          upgradedPackName = ` + EQUIPPED ${newBp.shortName} (${newBp.gridLabel})!`;
        }
      }
      this.maxArmor = Math.max(this.maxArmor || 50, 100);
      this.armor = Math.min(this.maxArmor + 25, (this.armor || 0) + addArmor);
      msg = `🛡️ LOOTED BALLISTIC PLATE (+${addArmor} ARMOR HP)${upgradedPackName}`;
    } else if (item.type === 'bounty') {
      const cashVal = item.cashValue || pack.halfLootCash || 150;
      const totalCarried = item.ownerMatchCash || pack.ownerMatchCash || cashVal * 2;
      if (pack.botRef && typeof pack.botRef.matchCash === 'number') {
        pack.botRef.matchCash = Math.max(0, pack.botRef.matchCash - cashVal);
        pack.botRef.cashLooted = true;
      }
      pack.cashAutoLooted = true;
      this.addCash?.(
        cashVal,
        `LOOTED 50% POCKET CASH (${pack.ownerRank} ${pack.ownerName})`,
        false
      );
      if (!Array.isArray(this.lootedDogtags)) this.lootedDogtags = [];
      this.lootedDogtags.unshift({
        name: `${pack.ownerRank} ${pack.ownerName}`,
        team: pack.ownerTeam,
        role: pack.ownerRole,
        cash: cashVal,
        totalCarried
      });
      if (this.lootedDogtags.length > 8) this.lootedDogtags.pop();
      msg = `💵 AUTO-LOOTED 50% POCKET CASH: +$${cashVal} OF $${totalCarried} ON ${pack.ownerRank} ${pack.ownerName} (MATCH CASH ONLY)`;
    }

    item.looted = true;
    item.lootedMode = mode;
    if (typeof this.recordLootedFieldItem === 'function') {
      this.recordLootedFieldItem(item, pack, mode);
    }
    this.score = (this.score || 0) + 20;
    sound.playReload();
    if (msg && this.onAwardXp) {
      this.onAwardXp(20, msg);
    }

    // If all items in pack are looted AND the manual loot UI is closed, remove its 3D mesh from the world
    const modalEl =
      typeof document !== 'undefined' ? document.getElementById('gunsmith-modal') : null;
    const isLootModalOpen = Boolean(modalEl && !modalEl.classList.contains('hidden'));
    if (
      !isLootModalOpen &&
      pack.items.every((it) => it.looted) &&
      this.world &&
      Array.isArray(this.world.lootPacks)
    ) {
      if (pack.mesh) this.scene.remove(pack.mesh);
      const idx = this.world.lootPacks.indexOf(pack);
      if (idx !== -1) this.world.lootPacks.splice(idx, 1);
    }
    return true;
  },

  /**
   * Automatically loots 50% of any nearby downed/fallen enemy's on-hand Match Cash (excluding Warehouse Vault)
   * when the player walks within `maxDist` meters of their body, and also allows pressing [F] to instantly
   * loot all remaining ammo/meds/plates/pocket-cash from the nearest fallen enemy!
   */
  autoLootNearbyEnemyCash(maxDist = 4.2) {
    if (!this.world || this.dead || this.downed || this.activeVehicle) return 0;
    const packs = this.findNearbyEnemyLootPacks(maxDist);
    let totalLootedCash = 0;
    for (const pack of packs) {
      if (!pack || pack.cashAutoLooted || !Array.isArray(pack.items)) continue;
      const bountyItem = pack.items.find((it) => it.type === 'bounty' && !it.looted);
      if (bountyItem) {
        this.lootItemFromPack(pack, bountyItem.id, 'take');
        totalLootedCash += bountyItem.cashValue || pack.halfLootCash || 0;
      } else {
        pack.cashAutoLooted = true;
      }
    }
    return totalLootedCash;
  },

  /**
   * Loots all non-weapon gear items (plus strips the weapon for parts if not swapping) from an Enemy Loot Pack.
   */
  lootAllFromPack(pack, swapWeaponToo = false, keepWeaponUnlooted = false) {
    if (!pack || !Array.isArray(pack.items)) return false;
    let count = 0;
    for (const item of pack.items) {
      if (item.looted) continue;
      if (item.type === 'weapon') {
        if (keepWeaponUnlooted && !swapWeaponToo) continue;
        this.lootItemFromPack(pack, item.id, swapWeaponToo ? 'take' : 'scrap');
      } else {
        this.lootItemFromPack(pack, item.id, 'take');
      }
      count++;
    }
    return count > 0;
  },

  /**
   * Computes the player's Visualized 2D Backpack Cell Grid (`cols × rows`) and the items occupying cells inside it.
   */
  getBackpackGridUsage() {
    const bpItem = this.getEquippedItem ? this.getEquippedItem('backpack') : null;
    const bpId = bpItem?.id || this.equippedUpgrades?.backpack || 'no_pack';
    const gridDimMap = {
      no_pack: { cols: 2, rows: 2, totalCells: 4, name: 'OPERATOR POCKETS (2×2)' },
      sling_pack: { cols: 3, rows: 3, totalCells: 9, name: 'TACTICAL SLING PACK (3×3)' },
      berkut_pack: { cols: 4, rows: 4, totalCells: 16, name: 'BERKUT ASSAULT PACK (4×4)' },
      beta2_pack: { cols: 5, rows: 5, totalCells: 25, name: 'BETA-2 BATTLE BACKPACK (5×5)' },
      raid_pack: { cols: 6, rows: 6, totalCells: 36, name: '6SH118 RAID RUCKSACK (6×6)' }
    };
    const dim = gridDimMap[bpId] || gridDimMap.no_pack;

    const cells = [];
    const prim = this.slots[0];
    const looseRds = prim ? prim.looseAmmo || 0 : 0;
    const ammoBoxes = Math.ceil(looseRds / 60);
    for (let i = 0; i < ammoBoxes; i++) {
      const boxRds = i === ammoBoxes - 1 ? looseRds - i * 60 || 60 : 60;
      cells.push({
        icon: '📦',
        title: `${prim?.def?.shortName || 'RIFLE'} LOOSE AMMO`,
        sub: `${boxRds} RDS [P]`,
        col: '#f1c40f',
        bg: 'rgba(241, 196, 15, 0.16)'
      });
    }

    // Field Dressings (up to 3 per cell)
    const dressCount = this.bandages || 0;
    const dressStacks = Math.ceil(dressCount / 3);
    for (let i = 0; i < dressStacks; i++) {
      const stackN = i === dressStacks - 1 ? dressCount - i * 3 || 3 : 3;
      cells.push({
        icon: '🩹',
        title: 'FIELD DRESSING',
        sub: `×${stackN} BANDAGE [H/F]`,
        col: '#2ecc71',
        bg: 'rgba(46, 204, 113, 0.16)'
      });
    }

    // Medic Bag (for Medic class, occupies 2 cells)
    if (this.role === 'medic') {
      const bagPct = Math.round(
        ((this.medicBagSupply ?? 600) / (this.maxMedicBagSupply || 600)) * 100
      );
      cells.push({
        icon: '🏥',
        title: 'SQUAD MEDIC BAG',
        sub: `${bagPct}% (${Math.ceil(this.medicBagSupply ?? 600)} HP)`,
        col: '#7bed9f',
        bg: 'rgba(46, 204, 113, 0.24)'
      });
    }

    // Frag Grenades
    const frags = this.grenades || 0;
    if (frags > 0) {
      cells.push({
        icon: '💣',
        title: 'M67 FRAG POUCH',
        sub: `×${frags} GRENADES [G]`,
        col: '#e67e22',
        bg: 'rgba(230, 126, 34, 0.18)'
      });
    }

    // Class Gadget / Ordnance Reserve
    const gadSlot = this.slots[2];
    if (gadSlot && gadSlot.def && (gadSlot.clip + gadSlot.reserve > 0)) {
      cells.push({
        icon: '🚀',
        title: gadSlot.def.shortName || gadSlot.def.name,
        sub: `×${(gadSlot.clip || 0) + (gadSlot.reserve || 0)} READY [3]`,
        col: '#74b9ff',
        bg: 'rgba(52, 152, 219, 0.18)'
      });
    }

    // Looted Enemy Dogtags
    if (Array.isArray(this.lootedDogtags)) {
      for (const dt of this.lootedDogtags.slice(0, 4)) {
        cells.push({
          icon: '🏷️',
          title: `DOGTAG: ${dt.name}`,
          sub: `+$${dt.cash} BOUNTY`,
          col: '#fd79a8',
          bg: 'rgba(232, 67, 147, 0.18)'
        });
      }
    }

    return {
      ...dim,
      bpId,
      usedCells: Math.min(dim.totalCells, cells.length),
      cells: cells.slice(0, dim.totalCells)
    };
  },

  /**
   * Returns true if all weapon slots, bandages, grenades, and armor are already at 100% capacity.
   */
  isFullyResupplied() {
    const vestDef = this.getEquippedItem('vest');
    const backpackDef = this.getEquippedItem('backpack');
    const maxArmor = vestDef ? vestDef.maxArmor : PLAYER.MAX_ARMOR;
    const baseDressings =
      this.role === 'medic' ? PLAYER.FIELD_DRESSINGS_MEDIC || 9 : PLAYER.FIELD_DRESSINGS_OTHER || 2;
    const maxBandages =
      baseDressings +
      (vestDef ? vestDef.bonusBandages : 0) +
      (backpackDef ? backpackDef.bonusBandages : 0);
    const maxGrenades =
      2 + (vestDef ? vestDef.bonusGrenades : 0) + (backpackDef ? backpackDef.bonusGrenades : 0);
    if (this.armor < maxArmor || this.bandages < maxBandages || this.grenades < maxGrenades) {
      return false;
    }
    if (this.role === 'medic' && (this.medicBagSupply || 0) < (this.maxMedicBagSupply || 600)) {
      return false;
    }
    for (const s of this.slots) {
      if (
        s.clip < s.def.clipSize ||
        s.reserve < s.def.reserveAmmo ||
        (s.maxLooseAmmo > 0 && (s.looseAmmo || 0) < s.maxLooseAmmo)
      ) {
        return false;
      }
    }
    return true;
  },

  /**
   * [F] Key Handler:
   * 1. Revive downed friendly soldier (Hold [F], consumes 1 Field Dressing!) or Heal injured standing friendly soldier (Press [F])
   * 2. At Ammo & Kit Stash (Press [F]):
   *    - Resupplies 100% Ammo, Magazines, Field Dressings (9 for Medic, 2+ for others), Medic Bag & Armor
   * 3. Build Defense Fortifications ([F])
   */
  handleInteractKey() {
    if (this.activeVehicle) return;

    // 1a. Downed Friendly within interact range -> Holding [F] revives them (consumes 1 Field Dressing!)
    const nearDowned =
      this.draggedBot || this.botManager.findNearestDownedFriendly(this.pos, this.team, DISTANCES.INTERACT_RANGE);
    if (nearDowned && nearDowned.downed && !nearDowned.dead) {
      this._fUsedForFriendlyAction = true;
      this._pendingEnemyLootPack = null;
      if ((this.bandages || 0) <= 0) {
        if (this.onAwardXp) {
          this.onAwardXp(
            0,
            '⚠️ 0 FIELD DRESSINGS LEFT — RESUPPLY AT AMMO STASH [7] TO REVIVE!'
          );
        }
        return;
      }
      this.reviveTargetBot = nearDowned;
      return;
    }

    // 1b. If Player is injured (hp < 100 or bleeding) and near a friendly MEDIC -> Press [F] to have Medic max out your HP with their Medic Bag!
    if (this.hp < PLAYER.MAX_HP || this.bleeding) {
      const nearMedic = this.findNearestFriendlyMedic(6.5);
      if (nearMedic && (nearMedic.medicBagSupply ?? 600) > 0) {
        this._fUsedForFriendlyAction = true;
        this._pendingEnemyLootPack = null;
        if (this.bleeding && (nearMedic.fieldDressings ?? 9) > 0) {
          nearMedic.fieldDressings = Math.max(0, (nearMedic.fieldDressings ?? 9) - 1);
        }
        this.bleeding = false;
        this.armFractured = false;
        this.legFractured = false;
        this.limbHealth = {
          head: 100,
          thorax: 100,
          leftArm: 100,
          rightArm: 100,
          leftLeg: 100,
          rightLeg: 100
        };
        const neededHp = Math.max(0, PLAYER.MAX_HP - this.hp);
        const healedHp = Math.min(neededHp, nearMedic.medicBagSupply ?? 600);
        this.hp = Math.min(PLAYER.MAX_HP, this.hp + healedHp);
        nearMedic.medicBagSupply = Math.max(0, (nearMedic.medicBagSupply ?? 600) - healedHp);
        this.beingHealedByMedic = `${nearMedic.name} [${nearMedic.fieldDressings ?? 9}/9 DRESSINGS]`;
        this.medicHealTimer = 1.6;
        sound.playReload();
        if (this.onAwardXp) {
          this.onAwardXp(
            25,
            `🏥 MEDIC BAG (${nearMedic.name}): INJURIES HEALED TO ${Math.ceil(this.hp)}/100 HP! (${nearMedic.fieldDressings ?? 9}/9 DRESSINGS LEFT)`
          );
        }
        return;
      }
    }

    // 1c. Injured standing Friendly Soldier within interact range -> Press [F] to Field Heal them!
    // Squad rule: Medics use their Medic Bag (heals to 100/100 HP); Non-Medics must spend 1 Field Dressing!
    const injuredAlly = this.findNearestInjuredFriendly(DISTANCES.INTERACT_RANGE);
    if (injuredAlly) {
      this._fUsedForFriendlyAction = true;
      this._pendingEnemyLootPack = null;
      if (this.role === 'medic') {
        if ((this.medicBagSupply ?? 600) <= 0) {
          if (this.onAwardXp) {
            this.onAwardXp(0, '⚠️ MEDIC BAG DEPLETED — RESUPPLY AT AMMO STASH!');
          }
          return;
        }
        const needed = Math.max(0, PLAYER.MAX_HP - injuredAlly.hp);
        const healAmt = Math.min(needed, this.medicBagSupply ?? 600);
        injuredAlly.hp = Math.min(PLAYER.MAX_HP, injuredAlly.hp + healAmt);
        this.medicBagSupply = Math.max(0, (this.medicBagSupply ?? 600) - healAmt);
        sound.playReload();
        this.score += PLAYER.FIELD_HEAL_XP;
        if (this.onAwardXp) {
          this.onAwardXp(
            PLAYER.FIELD_HEAL_XP,
            `🏥 MEDIC BAG HEALED ${injuredAlly.name} TO ${Math.ceil(injuredAlly.hp)}/100 HP`
          );
        }
      } else {
        if ((this.bandages || 0) <= 0) {
          if (this.onAwardXp) {
            this.onAwardXp(0, '⚠️ 0 FIELD DRESSINGS LEFT — RESUPPLY AT AMMO STASH!');
          }
          return;
        }
        this.bandages--;
        const healAmt = PLAYER.FIELD_HEAL_OTHER;
        injuredAlly.hp = Math.min(PLAYER.MAX_HP, injuredAlly.hp + healAmt);
        sound.playReload();
        this.score += PLAYER.FIELD_HEAL_XP;
        if (this.onAwardXp) {
          this.onAwardXp(
            PLAYER.FIELD_HEAL_XP,
            `🩹 FIELD DRESSING APPLIED TO ${injuredAlly.name} (${this.bandages}/${this.maxBandages || 2} LEFT)`
          );
        }
      }
      return;
    }

    // 2. In-Building Armory Case Key within 4.8m -> Press [F] to pick up the Key!
    const nearKey = this.findNearestBuildingKey(4.8);
    if (nearKey) {
      this._fUsedForFriendlyAction = true;
      this.collectBuildingKeyObject(nearKey);
      return;
    }

    // 3. Squad Ammo & Kit Stash within interact range -> [F] Resupplies All!
    const nearCrate = this.findNearestAmmoCrate(DISTANCES.INTERACT_RANGE);
    if (nearCrate) {
      this.resupplyAll(false);
      return;
    }

    // 4. Fallen Enemy / Enemy Loot Pack within interact range:
    //    - Quick Tap [F] (< 0.28s, triggered on keyup) = Instant Auto-Loot
    //    - Long Press / Hold [F] (>= 0.28s) = Opens the Side-by-Side Enemy Gear & Backpack Manual Loot UI
    const nearEnemyLoot = this.findNearestEnemyLoot(5.2);
    if (nearEnemyLoot) {
      this._pendingEnemyLootPack = nearEnemyLoot;
      this._enemyLootHoldTriggered = false;
      return;
    }

    // 4b. Medieval Siege Trebuchet within 26m -> Press [F] to call men over to set up & hurl boulders!
    const nearTreb = this.vehicleManager?.findNearestTrebuchet?.(this.pos, 26.0, this.team);
    if (nearTreb && typeof this.callMenToSetupTrebuchet === 'function') {
      this._fUsedForFriendlyAction = true;
      this.callMenToSetupTrebuchet(nearTreb);
      return;
    }

    // 5. In-Scope Laser Rangefinder & Auto-Zero ([F] while ADS in a Sniper / DMR / Binocular Optic!)
    const curWep = this.currentWeapon ? this.currentWeapon() : null;
    const activeOpticNow = this.getActiveOpticType ? this.getActiveOpticType() : curWep?.def?.opticType;
    if (
      this.isAds &&
      curWep &&
      !this.useCantedSight &&
      (activeOpticNow === 'sniper8x' ||
        activeOpticNow === 'sniper12x' ||
        activeOpticNow === 'raptor13x' ||
        activeOpticNow === 'sniper16x' ||
        activeOpticNow === 'sniper27x' ||
        activeOpticNow === 'sniper40x' ||
        activeOpticNow === 'sniperFlir' ||
        activeOpticNow === 'valday6x' ||
        activeOpticNow === 'lpvo36' ||
        activeOpticNow === 'acog' ||
        activeOpticNow === 'binos' ||
        curWep.def?.hasRaptarLrf ||
        curWep.def?.type === 'binoculars')
    ) {
      this.fireLaserRangefinder(true);
      return;
    }

    // 5b. CS2 Weapon / Knife Inspect ([F] or [V]) when holding a firearm or Karambit/Butterfly Knife!
    //    (Building fortifications remains on [T] or when holding the Standard Sledgehammer in Slot 4)
    if (
      curWep &&
      (curWep.def.type === 'gun' || curWep.def.skinFinish === 'karambit' || curWep.def.skinFinish === 'butterfly') &&
      typeof this.startWeaponInspect === 'function'
    ) {
      this.startWeaponInspect();
      return;
    }

    // 6. Build Chest Wall / Point Defense Fortifications ([T] or [F] with Sledgehammer)!
    this.tryBuildPointDefenses();
  },

  resupplyAll(silentXp = false) {
    const vestDef = this.getEquippedItem('vest');
    const backpackDef = this.getEquippedItem('backpack');
    this.maxArmor = vestDef ? vestDef.maxArmor : PLAYER.MAX_ARMOR;
    this.armorAbsorbRatio = vestDef ? vestDef.absorbRatio : PLAYER.ARMOR_ABSORB_RATIO;
    for (const s of this.slots) {
      s.clip = s.def.clipSize;
      s.reserve = s.def.reserveAmmo;
      s.looseAmmo = s.def.maxLooseAmmo || 0;
      s.maxLooseAmmo = s.def.maxLooseAmmo || 0;
      s.mags = this.buildMagArray(s.def.clipSize, s.def.reserveAmmo);
    }
    const baseDressings =
      this.role === 'medic' ? PLAYER.FIELD_DRESSINGS_MEDIC || 9 : PLAYER.FIELD_DRESSINGS_OTHER || 2;
    this.maxBandages =
      baseDressings +
      (vestDef ? vestDef.bonusBandages : 0) +
      (backpackDef ? backpackDef.bonusBandages : 0);
    this.bandages = this.maxBandages;
    this.maxMedicBagSupply = this.role === 'medic' ? PLAYER.MEDIC_BAG_MAX_SUPPLY || 600 : 0;
    this.medicBagSupply = this.maxMedicBagSupply;
    this.grenades =
      2 + (vestDef ? vestDef.bonusGrenades : 0) + (backpackDef ? backpackDef.bonusGrenades : 0);
    this.armor = this.maxArmor;
    this.armFractured = false;
    this.legFractured = false;
    this.limbHealth = {
      head: 100,
      thorax: 100,
      leftArm: 100,
      rightArm: 100,
      leftLeg: 100,
      rightLeg: 100
    };
    sound.playReload();
    if (!silentXp && this.onAwardXp) {
      this.onAwardXp(
        20,
        `📦 RESUPPLIED: ${this.bandages} FIELD DRESSINGS${
          this.role === 'medic' ? ' + MEDIC BAG (100%)' : ''
        }, MAGS & LOOSE AMMO`
      );
    }
  },

  /**
   * Squad-Style Field Role / Kit Swap:
   * Changes the player's combat role & weapon kit live in the field when near an Ammo & Kit Stash
   * (or at Main HQ Base) without dying or costing a team ticket!
   */
  changeRoleInField(newRole, requireCrate = true) {
    if (this.dead || this.downed || this.activeVehicle) return false;
    const era = this.world?.era || 'modern';
    const targetRole = resolveRoleForEra(newRole, era, this.team);

    if (requireCrate) {
      if (!this.isAtResupplyPoint(5.5)) {
        if (this.onAwardXp) {
          this.onAwardXp(
            0,
            '⚠️ MOVE TO MAIN BASE HQ, A CAPTURED FRIENDLY FOB, OR AN AMMO STASH [7] TO CHANGE ROLE!'
          );
        }
        return false;
      }
    }

    this.equipLoadout(targetRole);
    this.resupplyAll(true);
    if (targetRole === 'mounted_knight' && this.vehicleManager?.spawnOrGetPersonalMount) {
      const horse = this.vehicleManager.spawnOrGetPersonalMount(this.team, this.pos, this.yaw, 'warhorse');
      if (horse && typeof this.enterVehicle === 'function') {
        this.enterVehicle(horse);
      }
    }
    const primaryWep = this.slots[0]?.def?.shortName || this.slots[0]?.def?.name || 'PRIMARY';
    const gadgetWep = this.slots[2]?.def?.shortName || this.slots[2]?.def?.name || 'GADGET';
    events.emit('player:role-changed', {
      role: targetRole,
      primary: primaryWep,
      gadget: gadgetWep
    });
    if (this.onAwardXp) {
      this.onAwardXp(
        0,
        `🎒 FIELD KIT SWAPPED: ${targetRole.toUpperCase()} (${primaryWep} + ${gadgetWep})`
      );
    }
    return true;
  },

  cycleFieldRole() {
    const era = this.world?.era || 'modern';
    const roles = getAllowedRoleIds(era, this.team);
    const idx = roles.indexOf(this.role || roles[0]);
    const nextRole = roles[(idx + 1) % roles.length];
    return this.changeRoleInField(nextRole, true);
  },

  buildMagArray(clipSize, reserveAmmo) {
    if (!clipSize || clipSize <= 1) return [];
    const count = Math.max(1, Math.round(reserveAmmo / clipSize));
    return Array.from({ length: count }, () => clipSize);
  },

  syncReserveFromMags(slot) {
    if (!slot || !slot.mags || slot.def.clipSize <= 1) return;
    slot.reserve = slot.mags.reduce((sum, n) => sum + n, 0);
  },

  equipLoadout(roleName) {
    this.role = roleName;
    this.applyCustomizationsToActiveLoadout(false);
  },

  switchSlot(index) {
    if (index < 0 || index >= this.slots.length) return;
    this.currentSlotIndex = index;
    this.reloading = false;
    this.fastReload = false;
    this.slowReloading = false;
    this.magPackProgress = 0;
    this.isAds = false;
    this.useCantedSight = false;
    const nextSlot = this.slots[index];
    const zCount = Array.isArray(nextSlot?.def?.zoomLevels) ? nextSlot.def.zoomLevels.length : 0;
    if (!zCount || (this.opticZoomIndex || 0) >= zCount) {
      this.opticZoomIndex = 0;
    }

    while (this.viewModelGroup.children.length > 0) {
      this.viewModelGroup.remove(this.viewModelGroup.children[0]);
    }
    const cur = this.currentWeapon();
    if (cur && cur.mesh) {
      cur.mesh.position.set(getWeaponHipOffsetX(cur.def), -0.34, -0.26);
      this.viewModelGroup.add(cur.mesh);
    }
    this.weaponDrawDuration = cur?.def?.slot === 'secondary' ? 0.19 : 0.26;
    this.weaponDrawTimer = this.weaponDrawDuration;
    this.sprintAnimBlend = 0;
    if (cur && cur.def && cur.def.type === 'melee_sword') {
      // Start in the scabbard (swordSlungBlend = 1.0) and smoothly draw/unsheathe into hand!
      this.swordSlung = false;
      this.swordSlungBlend = 1.0;
      this.swordSwingTimer = 0;
    }
    events.emit('weapon:switched', {
      index,
      slot: cur,
      weapon: cur ? cur.def : null
    });
  },

  toggleSwordSlung(forceState = null) {
    const cur = this.currentWeapon();
    if (!cur || !cur.def || cur.def.type !== 'melee_sword') return false;
    this.swordSlung = typeof forceState === 'boolean' ? forceState : !this.swordSlung;
    this.swordSwingTimer = 0;
    sound.playWeaponSwitch?.();
    return this.swordSlung;
  },

  currentWeapon() {
    return Array.isArray(this.slots) ? this.slots[this.currentSlotIndex || 0] : null;
  },

  // =========================================================================
  // SQUAD-STYLE DEPLOYABLE AMMO & KIT STASH ([7] Key or Support [3] Gadget)
  // =========================================================================
  deployFieldAmmoStash() {
    if (this.dead || this.downed || this.activeVehicle) return false;
    if (this.role !== 'support' && (this.ammoStashCooldown || 0) > 0) {
      if (this.onAwardXp) {
        this.onAwardXp(
          0,
          this.role === 'assault'
            ? `⏳ RIFLEMAN AMMO POUCH COOLDOWN: ${Math.ceil(this.ammoStashCooldown)}s`
            : `⏳ FIELD AMMO & KIT STASH COOLDOWN: ${Math.ceil(this.ammoStashCooldown)}s`
        );
      }
      return false;
    }
    if (this.role === 'assault') {
      // Shock Assault Specialty: Fast 18s-cooldown Rifleman Ammo Pouch (instant mag + +1 grenade top-up)!
      this.ammoStashCooldown = PLAYER.ASSAULT_POUCH_COOLDOWN || 18;
      const prim = this.slots[0];
      if (prim && prim.def && prim.def.clipSize > 1) {
        if (!Array.isArray(prim.mags)) prim.mags = [];
        const maxPouches = (prim.def.spareMagSlots || 6) + 2;
        if (prim.mags.length < maxPouches) {
          prim.mags.unshift(prim.def.clipSize);
        } else {
          for (let i = 0; i < prim.mags.length; i++) {
            if (prim.mags[i] < prim.def.clipSize) {
              prim.mags[i] = prim.def.clipSize;
              break;
            }
          }
        }
        prim.looseAmmo = Math.min(prim.maxLooseAmmo || 150, (prim.looseAmmo || 0) + prim.def.clipSize);
        this.syncReserveFromMags(prim);
      }
      this.grenades = Math.min(5, (this.grenades || 0) + 1);
      this.dropAmmoCrate(true);
      if (this.onAwardXp) {
        this.onAwardXp(
          25,
          `💥 RIFLEMAN AMMO POUCH DROPPED (18S CD): +1 LOADED MAG & +1 FRAG GRENADE (${this.grenades} FRAGS)!`
        );
      }
      return true;
    }
    this.ammoStashCooldown = this.role === 'support' ? 12 : DEPLOYABLES.AMMO_STASH_COOLDOWN || 45;
    this.dropAmmoCrate(true);
    return true;
  },

  dropAmmoCrate(fromFieldKey = false) {
    if (this.dead || this.downed) return;

    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const cratePos = this.pos.clone().addScaledVector(forward, 2.4);
    cratePos.y = this.world.getGroundHeightAt(cratePos.x, cratePos.z);

    // If deployed via [7] field stash key, replace any older non-permanent stash owned by this player
    if (fromFieldKey && this.world.ammoCrates) {
      for (let i = this.world.ammoCrates.length - 1; i >= 0; i--) {
        const c = this.world.ammoCrates[i];
        if (!c.permanent && c.owner === this.name && c.isFieldStash) {
          this.scene.remove(c.mesh);
          this.world.ammoCrates.splice(i, 1);
        }
      }
    }

    if (typeof this.world.addAmmoCrate === 'function') {
      const entry = this.world.addAmmoCrate(
        cratePos.x,
        cratePos.z,
        this.team,
        this.name,
        false,
        DEPLOYABLES.AMMO_CRATE_TIMER || 120
      );
      if (entry) {
        entry.isFieldStash = Boolean(fromFieldKey);
        entry.resupplyRadius = DEPLOYABLES.AMMO_CRATE_RADIUS || 6.0;
      }
    }

    this.score = (this.score || 0) + 25;
    if (this.onAwardXp) {
      this.onAwardXp(
        25,
        '📦 AMMO & KIT STASH DEPLOYED — [F] RESUPPLY • [L] / F5–F9 CHANGE ROLE'
      );
    }
    sound.playReload();
  },

  /**
   * Tarkov Slow Reload (Pressing Loose Bullets one-by-one into Existing Magazines):
   * Triggered by pressing [P], holding [R], or pressing [R] when all Chest Rig mags are empty.
   */
  startSlowReload(fromExplicitKey = false) {
    const cur = this.currentWeapon();
    if (!cur || !cur.mags || cur.def.clipSize <= 1) return false;

    // Allow explicit [P] or Hold-[R] to cancel an in-progress mag-swap reload (e.g. auto-reload after last sniper shot)
    if (this.reloading) {
      if (!fromExplicitKey) return false;
      this.reloading = false;
      this.fastReload = false;
    }

    const clipSize = cur.def.clipSize;
    const hasDepletedMag =
      cur.clip < clipSize || cur.mags.some((m) => m < clipSize);
    const partialRigMags = cur.mags.filter((m) => m > 0 && m < clipSize).length;
    const canConsolidateMags =
      partialRigMags >= 2 || (cur.clip < clipSize && cur.mags.some((m) => m > 0));
    const hasLooseBullets = (cur.looseAmmo || 0) > 0;

    if (!hasDepletedMag) {
      if (fromExplicitKey && this.onAwardXp) {
        this.onAwardXp(
          0,
          `🎒 ALL MAGAZINES FULL (${cur.clip}/${clipSize} IN RIFLE • ${cur.looseAmmo || 0} LOOSE RDS IN PACK)`
        );
      }
      return false;
    }

    if (!hasLooseBullets && !canConsolidateMags) {
      if (fromExplicitKey && this.onAwardXp) {
        this.onAwardXp(
          0,
          '⚠️ 0 LOOSE ROUNDS IN PACK — RESUPPLY NEAR FRIENDLY FOB / AMMO STASH [7] OR LOOT ENEMY [F]!'
        );
      }
      return false;
    }

    this.slowReloading = true;
    this.reloading = false;
    this.fastReload = false;
    this.isAds = false;
    this._rightMouseHeld = false;
    const cohesionReloadMult = this.inSquadCohesion ? 0.82 : 1.0;
    const isSniperCal = Boolean(cur.def.soundType === 'sniper' || clipSize <= 10);
    const basePackTime = isSniperCal
      ? Math.max(0.18, (PLAYER.MAG_PACK_BULLET_TIME || 0.22) * 0.95)
      : PLAYER.MAG_PACK_BULLET_TIME || 0.22;
    const bulletTime = basePackTime * cohesionReloadMult;
    this.magPackBulletTimer = bulletTime;
    this.magPackBulletDuration = bulletTime;
    this.magPackProgress = 0.02;
    this.slowReloadRoundsPacked = 0;
    sound.playReload();
    if (this.onAwardXp) {
      this.onAwardXp(
        0,
        hasLooseBullets
          ? `🎒 SLOW RELOAD: STUFFING BULLETS INTO MAG (${cur.looseAmmo || 0} LOOSE RDS IN PACK)`
          : '🎒 CONSOLIDATING ROUNDS INTO ACTIVE MAGAZINE'
      );
    }
    return true;
  },

  ejectDroppedMagVisual() {
    if (!this.world) return;
    this.camera.getWorldPosition(_casingPos);
    this.camera.getWorldQuaternion(_muzzleQuat);
    _muzzleRight.set(0.05, -0.24, -0.32).applyQuaternion(_muzzleQuat);
    _casingPos.add(_muzzleRight);
    _casingVel.set(0.4, -1.6, -0.6).applyQuaternion(_muzzleQuat);
    if (typeof this.world.spawnCustomDebris === 'function') {
      this.world.spawnCustomDebris(
        _casingPos.x,
        _casingPos.y,
        _casingPos.z,
        _casingVel.x,
        _casingVel.y,
        _casingVel.z,
        6,
        4,
        8,
        0.044,
        0.16,
        0.072,
        0x22282e,
        1.5
      );
      return;
    }
    if (!this.world.debrisParticles || this.world.debrisParticles.length > 120) return;
    const mesh = new THREE.Mesh(_droppedMagGeo, _droppedMagMat);
    mesh.position.copy(_casingPos);
    this.scene.add(mesh);
    this.world.debrisParticles.push({
      mesh,
      vel: _casingVel.clone(),
      rotVel: new THREE.Vector3(6, 4, 8),
      life: 1.5
    });
  },

  startReload(forceSlowReload = false) {
    const cur = this.currentWeapon();
    if (!cur) return;
    if (cur.def.type === 'hammer' || cur.def.type === 'c4' || cur.def.type === 'medkit') return;

    if (forceSlowReload) {
      this.startSlowReload();
      return;
    }

    // Double-Tap [R] while already doing a Fast Mag-Swap triggers Emergency Drop Speed Reload!
    if (this.reloading) {
      if (!this.fastReload) {
        this.fastReload = true;
        this.reloadTimer *= PLAYER.SPEED_RELOAD_MULT;
        this.ejectDroppedMagVisual();
        if (this.onAwardXp) this.onAwardXp(0, '⚡ EMERGENCY SPEED RELOAD (MAG DROPPED)');
      }
      return;
    }

    // If currently Slow-Reloading (pressing bullets into mags) and player taps [R],
    // switch to a Fast Mag-Swap if a fuller magazine exists in the Chest Rig!
    if (this.slowReloading) {
      this.slowReloading = false;
      this.magPackProgress = 0;
    }

    // Check if Chest Rig (`cur.mags`) has a magazine with more rounds than the active clip
    if (cur.mags && cur.def.clipSize > 1) {
      const bestRigMag = cur.mags.reduce((max, m) => Math.max(max, m), 0);
      const canSwapMag =
        cur.clip < cur.def.clipSize && bestRigMag > 0 && bestRigMag > cur.clip;

      if (!canSwapMag) {
        // No fuller magazine in Chest Rig -> automatically start Tarkov Slow Reload (pressing loose bullets into mags)!
        this.startSlowReload();
        return;
      }
    } else if (cur.clip >= cur.def.clipSize || cur.reserve <= 0) {
      return;
    }

    const cohesionReloadMult = (this.inSquadCohesion ? 0.82 : 1.0) * (this.armFractured ? 1.25 : 1.0);
    this.reloadWasEmpty = (cur.clip || 0) <= 0;
    this.reloading = true;
    this.fastReload = false;
    this.slowReloading = false;
    this.weaponDrawTimer = 0;
    this.reloadTotalTime = cur.def.reloadTime * cohesionReloadMult;
    this.reloadTimer = this.reloadTotalTime;
    this.isAds = false;
    sound.playReload(cur.def);
    events.emit('player:reloaded', {
      weapon: cur.def,
      clip: cur.clip,
      reserve: cur.reserve,
      fastReload: false,
      stage: 'start'
    });
  },

  tryFireSingle() {
    const cur = this.currentWeapon();
    if (!cur || this.reloading || this.fireTimer > 0) return;
    if (this.slowReloading) {
      this.slowReloading = false;
      this.magPackProgress = 0;
    }
    this.executeFire(cur);
  },

  fireWeapon(cur) {
    return this.executeFire(cur || this.currentWeapon());
  },

  executeFire(cur) {
    const def = cur.def;
    const interval = 60 / def.rpm;
    const prevDebt = this.isFiring && def.auto && this.fireTimer < 0 ? Math.max(-interval * 3.0, this.fireTimer) : 0;
    this.fireTimer = Math.max(interval * 0.12, interval + prevDebt);

    // Ensure camera world matrix matches the exact current aim before firing raycast
    this.syncCameraTransform();

    if (def.type === 'hammer') {
      this.useHammer(false);
      return;
    }

    if (def.type === 'medkit') {
      if ((this.medicBagSupply ?? 600) <= 0) {
        if (this.onAwardXp) {
          this.onAwardXp(0, '⚠️ MEDIC BAG DEPLETED — RESUPPLY AT AMMO STASH [7]!');
        }
        return;
      }
      const injuredAlly = this.findNearestInjuredFriendly(6.0);
      if (injuredAlly) {
        const needed = Math.max(0, PLAYER.MAX_HP - injuredAlly.hp);
        const healAmt = Math.min(needed, this.medicBagSupply ?? 600);
        injuredAlly.hp = Math.min(PLAYER.MAX_HP, injuredAlly.hp + healAmt);
        this.medicBagSupply = Math.max(0, (this.medicBagSupply ?? 600) - healAmt);
        sound.playReload();
        this.score += PLAYER.FIELD_HEAL_XP;
        if (this.onAwardXp) {
          this.onAwardXp(
            PLAYER.FIELD_HEAL_XP,
            `🏥 MEDIC BAG HEALED ${injuredAlly.name} TO ${Math.ceil(injuredAlly.hp)}/100 MAX HP!`
          );
        }
      }
      if (this.hp < PLAYER.MAX_HP || this.bleeding) {
        this.bleeding = false;
        const healPulse = Math.min(
          PLAYER.MAX_HP - this.hp,
          PLAYER.MEDKIT_HEAL || 35,
          this.medicBagSupply ?? 600
        );
        this.hp = Math.min(PLAYER.MAX_HP, this.hp + healPulse);
        this.medicBagSupply = Math.max(0, (this.medicBagSupply ?? 600) - healPulse);
        sound.playReload();
        if (this.onAwardXp) {
          this.onAwardXp(
            15,
            this.hp >= PLAYER.MAX_HP
              ? '🏥 MEDIC BAG: INJURIES FULLY HEALED (100/100 MAX HP)!'
              : `🏥 MEDIC BAG SELF-HEAL: HP ${Math.ceil(this.hp)}/100`
          );
        }
      }
      return;
    }

    if (def.type === 'ammocrate') {
      this.dropAmmoCrate();
      return;
    }

    if (def.type === 'melee_sword') {
      this.useMeleeSword(def);
      return;
    }

    if (this.inDeepWater && (def.type === 'rpg' || def.type === 'stinger' || def.type === 'c4')) {
      this.fireTimer = 0.35;
      sound.playEmptyClick?.();
      if (this.onAwardXp) {
        this.onAwardXp(
          0,
          '🌊 CANNOT FIRE HEAVY LAUNCHERS OR EXPLOSIVES WHILE SWIMMING IN DEEP WATER!'
        );
      }
      return;
    }

    if (cur.clip <= 0) {
      this.startReload();
      return;
    }

    cur.clip--;

    if (def.type === 'rpg' || def.type === 'stinger') {
      sound.playRocketLaunch(0);
      if (def.type === 'stinger') {
        this.launchStingerMissile();
      } else {
        this.launchRocket();
      }
      events.emit('player:fired', {
        weapon: def,
        type: def.type,
        clip: cur.clip,
        reserve: cur.reserve
      });
      this.recoilKickZ = PLAYER.RECOIL_KICK_Z;
      this.recoilOffsetPitch += def.recoilPitch || 0.014;
      this.yaw += (Math.random() - 0.5) * (def.recoilYaw || 0.006);
      this.addShake(0.32);
      const warhead = cur.mesh.getObjectByName('rpgWarhead');
      if (warhead) warhead.visible = false;
      if (cur.clip === 0 && cur.reserve > 0) {
        setTimeout(() => this.startReload(), 280);
      }
      return;
    }

    if (def.type === 'binoculars') {
      cur.clip = cur.def.clipSize || 99;
      this.fireLaserRangefinder(true);
      return;
    }

    if (def.type === 'c4') {
      this.throwC4();
      events.emit('player:fired', {
        weapon: def,
        type: 'c4',
        clip: cur.clip,
        reserve: cur.reserve
      });
      return;
    }

    if (def.isBow || def.isCrossbow) {
      sound.playBowTwang?.(0, 0, Boolean(def.isCrossbow));
      this.muzzleFlashTimer = 0;
    } else if (def.isThrowingBlade || def.isVenomSpit) {
      sound.playMeleeSwing?.(0, 0, false);
      this.muzzleFlashTimer = 0;
    } else {
      sound.playGunshot(def.audioProfile || def.soundType, 0, 0, Boolean(def.silenced), def);
      this.muzzleFlashTimer = def.flashMult === 0 ? 0 : 0.032;
      this.ejectBrassCasing();
    }
    events.emit('player:fired', {
      weapon: def,
      type: 'gun',
      clip: cur.clip,
      reserve: cur.reserve
    });

    const suppressionSpreadMult = 1 + this.suppressionLevel * PLAYER.SUPPRESSION_SPREAD_MULT; // Suppression degrades accuracy
    const ledgeRested = typeof this.isRestingOnCoverLedge === 'function' ? this.isRestingOnCoverLedge() : false;
    const bipodActive = Boolean(def.hasBipod && (this.prone || this.crouching || ledgeRested));
    const stanceSpreadMult = bipodActive
      ? 0.35
      : this.prone
      ? 0.52
      : this.crouching
      ? 0.72
      : ledgeRested
      ? 0.78
      : 1.0;
    const spread = (this.isAds ? def.spreadAds : def.spreadHip) * suppressionSpreadMult * stanceSpreadMult;
    const muzzleVel = def.muzzleVelocity || 780;
    const bulletGrav = def.bulletGravity ?? 9.81;
    // Authentic ballistic zeroing elevation angle: theta = (g * D_zero) / (2 * v0^2)
    // In ADS, zeroes to `this.zeroDistance` (100m..800m via [X] or LRF [F]); in hipfire, uses a 50m point-blank battle zero.
    const activeZeroDist = this.isAds ? this.zeroDistance || PLAYER.ZERO_DISTANCE_DEFAULT || 100 : 50;
    const zeroElevation = (bulletGrav * activeZeroDist) / (2 * muzzleVel * muzzleVel);
    this.camera.getWorldQuaternion(_fireCamQuat);
    this.camera.getWorldPosition(_fireOrigin);
    _fireFwdDir.set(0, 0, -1).applyQuaternion(_fireCamQuat);
    const muzzleWorldPos = this.getWeaponMuzzleWorldPosition(_fireOrigin, _fireFwdDir, _fireMuzzlePos);
    const pelletCount = def.isSlugAmmo ? 1 : Math.max(1, def.pellets || 1);
    const armorPenMult = def.armorPenMult || 1.0;

    for (let p = 0; p < pelletCount; p++) {
      let sx = 0;
      let sy = 0;
      if (pelletCount > 1) {
        // 12-Gauge 00 Buckshot Circular Pattern:
        // Pellet 0 is the center core pellet; Pellets 1..7 form a radial ring cone that widens over distance
        if (p === 0) {
          sx = (Math.random() - 0.5) * spread * 0.22;
          sy = (Math.random() - 0.5) * spread * 0.22;
        } else {
          const angle = ((p - 1) / (pelletCount - 1)) * Math.PI * 2 + (Math.random() - 0.5) * 0.45;
          const radius = spread * (0.38 + Math.random() * 0.62);
          sx = Math.cos(angle) * radius;
          sy = Math.sin(angle) * radius;
        }
      } else {
        sx = (Math.random() - 0.5) * spread;
        sy = (Math.random() - 0.5) * spread;
      }

      _firePelletDir.set(sx, sy + zeroElevation, -1).normalize().applyQuaternion(_fireCamQuat);

      this.fireBallisticRay(
        _fireOrigin,
        _firePelletDir,
        def.damage,
        def.headshotMult,
        def.voxelDamage,
        def.activeShellName && def.isShotgun
          ? `${def.shortName} [${def.activeShellName}]`
          : def.shortName,
        armorPenMult,
        def,
        pelletCount,
        muzzleWorldPos
      );
    }

    // Apply recoil kick after the round leaves the barrel (Prone reduces recoil by 55%, One-Knee Kneel by 32%,
    // Atlas Bipod / rooftop parapet ledge rest cuts another 45%, and Friendly FOB entrenchment cuts 30%!)
    const stanceScale = this.prone
      ? PLAYER.RECOIL_SCALE_PRONE
      : this.crouching
      ? PLAYER.RECOIL_SCALE_CROUCH
      : 1.0;
    const bipodRecoilMult = bipodActive ? 0.45 : ledgeRested ? 0.78 : 1.0;
    const baseDefenseRecoilMult = this.inFriendlyForwardBase ? 0.70 : 1.0;
    const recoilScale = stanceScale * bipodRecoilMult * baseDefenseRecoilMult;
    this.recoilKickZ = PLAYER.RECOIL_KICK_Z * recoilScale;
    this.recoilOffsetPitch += (def.recoilPitch || 0.014) * recoilScale;
    this.yaw += (Math.random() - 0.5) * (def.recoilYaw || 0.006) * recoilScale;
    this.recoilVisualPitch = Math.min(0.11, (this.recoilVisualPitch || 0) + (def.recoilPitch || 0.016) * 1.65 * recoilScale);
    this.recoilVisualRoll = THREE.MathUtils.clamp(
      (this.recoilVisualRoll || 0) + (Math.random() - 0.42) * 0.048 * recoilScale,
      -0.12,
      0.12
    );
    this.boltCycleTimer = 0.09;
    this.triggerPullTimer = 0.085;
    this.weaponDrawTimer = 0;

    if (cur.clip === 0 && (cur.reserve > 0 || (cur.looseAmmo || 0) > 0)) {
      this.startReload();
    }
  },

  /**
   * Computes distance-based ballistic damage drop-off:
   * - 12-Gauge 00 Buckshot (`pelletCount > 1`):
   *   - 0m–8m (Point-Blank CQB): 100% damage (20 dmg × 8 = 160 max damage — lethal 1-shot CQB!)
   *   - 8m–20m (Short Range): Steep drop from 100% down to 46% (~9 dmg/pellet)
   *   - 20m–34m (Medium Range): Drops from 46% down to 14% (~2.8 dmg/pellet)
   *   - >34m (Long Range): 14% minimum (~2 dmg/pellet), dissipating past 54m.
   * - SMGs & Pistols: 100% up to 35m, smooth drop to 62% at 95m.
   * - Carbines / 5.56 Assault Rifles: 100% up to 85m, smooth drop to 75% at 210m.
   * - 7.62 Battle Rifles, LMGs, DMRs & Snipers: Full velocity & power across long range.
   */
  getDistanceDamageMultiplier(dist, wepDef = null, pelletCount = 1) {
    if (!Number.isFinite(dist) || dist <= 0) return 1.0;

    if (pelletCount > 1 || (wepDef && wepDef.damageFalloffStart !== undefined)) {
      const start = wepDef?.damageFalloffStart ?? 8;
      const mid = 20;
      const end = wepDef?.damageFalloffEnd ?? 34;
      const minMult = wepDef?.minDamageMult ?? 0.14;
      if (dist <= start) return 1.0;
      if (dist <= mid) {
        const t = (dist - start) / Math.max(1, mid - start);
        return 1.0 - t * 0.54; // 1.0 -> 0.46 at 20m
      }
      if (dist <= end) {
        const t = (dist - mid) / Math.max(1, end - mid);
        return 0.46 - t * (0.46 - minMult); // 0.46 -> 0.14 at 34m
      }
      return minMult;
    }

    const sType = wepDef?.soundType || '';
    if (sType === 'smg' || sType === 'pistol') {
      if (dist <= 35) return 1.0;
      if (dist >= 95) return 0.62;
      return 1.0 - ((dist - 35) / 60) * 0.38;
    }
    if (sType === 'rifle' && (wepDef?.damage || 30) < 42) {
      if (dist <= 85) return 1.0;
      if (dist >= 210) return 0.75;
      return 1.0 - ((dist - 85) / 125) * 0.25;
    }
    return 1.0;
  },

  /**
   * Spawns a finite-velocity ballistic bullet in `this.activeBullets` that physically travels
   * through the air at `muzzleVelocity` (m/s) with gravity drop (`9.81 m/s²`) and aerodynamic drag,
   * stepping and raycasting segment-by-segment each frame in `updateBallisticBullets(dt)` so
   * targets are only injured when the bullet physically reaches them!
   */
  fireBallisticRay(
    origin,
    dir,
    damage,
    headshotMult,
    voxelDamage,
    weaponLabel,
    armorPenMult = 1.0,
    wepDef = null,
    pelletCount = 1,
    tracerOriginOverride = null
  ) {
    if (!Array.isArray(this.activeBullets)) {
      this.activeBullets = [];
    }

    const isBuckshot = pelletCount > 1;
    const isMountedMg = Boolean(
      (wepDef && wepDef.isMountedMg) ||
        weaponLabel === '.50 CAL HMG' ||
        weaponLabel === '7.62MM COAX MG' ||
        weaponLabel === '30MM GAU-8 AVENGER' ||
        weaponLabel === '25MM GAU-12 EQUALIZER' ||
        weaponLabel === '20MM VULCAN A2A'
    );
    const isHeavyPenCaliber =
      !isBuckshot && (isMountedMg || damage >= 52 || armorPenMult >= 1.15);
    const isRiflePenCaliber = !isBuckshot && damage >= 26;
    const maxCollateralTargets = isBuckshot ? 1 : isMountedMg ? 4 : isHeavyPenCaliber ? 3 : 2;
    const collateralFalloff = isMountedMg
      ? 0.88
      : isHeavyPenCaliber
      ? 0.82
      : isRiflePenCaliber
      ? 0.68
      : 0.5;
    const maxRayRange =
      wepDef && wepDef.maxEffectiveRange ? wepDef.maxEffectiveRange : DISTANCES.RAYCAST_MAX;

    let muzzleVelocity = wepDef && wepDef.muzzleVelocity ? wepDef.muzzleVelocity : 0;
    if (!muzzleVelocity) {
      if (
        weaponLabel === '20MM VULCAN A2A' ||
        weaponLabel === '30MM GAU-8 AVENGER' ||
        weaponLabel === '25MM GAU-12 EQUALIZER' ||
        weaponLabel === '25MM GAU-12 AA' ||
        weaponLabel === '30MM 2A38M AA'
      ) {
        muzzleVelocity = 360;
      } else if (weaponLabel === '.50 CAL HMG') muzzleVelocity = 890;
      else if (weaponLabel === '7.62MM COAX MG') muzzleVelocity = 840;
      else if (isBuckshot) muzzleVelocity = 410;
      else muzzleVelocity = 780;
    }
    const bulletGravity =
      wepDef && typeof wepDef.bulletGravity === 'number'
        ? wepDef.bulletGravity
        : isMountedMg
        ? 4.5
        : 9.81;

    this.shotsFired = (this.shotsFired || 0) + 1;
    const curWep = typeof this.currentWeapon === 'function' ? this.currentWeapon() : null;
    const isArrowOrBolt = Boolean(
      (wepDef && (wepDef.isBow || wepDef.isCrossbow || wepDef.isThrowingBlade)) ||
        String(weaponLabel || '').includes('BOW') ||
        String(weaponLabel || '').includes('CROSSBOW') ||
        String(weaponLabel || '').includes('BLADE')
    );
    const isFireArrow = Boolean(
      isArrowOrBolt &&
        !(wepDef && wepDef.isThrowingBlade) &&
        ((wepDef && wepDef.isFireArrow) || this.fireArrowsActive)
    );
    if (isFireArrow) {
      damage += 22; // Bonus incendiary burn damage when Fire Arrows [V] are lit!
    }
    const isVenomProj = Boolean(
      (wepDef && wepDef.isVenomSpit) || String(weaponLabel || '').includes('VENOM')
    );
    const hideTracers = Boolean(
      (isArrowOrBolt && !isFireArrow) ||
        (!isMountedMg &&
          !isArrowOrBolt &&
          !isVenomProj &&
          curWep &&
          curWep.def &&
          curWep.def.hideTracers)
    );
    const tracerInterval =
      isFireArrow || isVenomProj
        ? 1
        : wepDef && typeof wepDef.tracerEveryShots === 'number'
        ? wepDef.tracerEveryShots
        : 6;
    const isBrightTracer = !hideTracers && this.shotsFired % tracerInterval === 1;
    const tracerStart =
      tracerOriginOverride || this.getWeaponMuzzleWorldPosition(origin, dir, _fireMuzzlePos);
    const muzzleOffset = new THREE.Vector3(
      tracerStart.x - origin.x,
      tracerStart.y - origin.y,
      tracerStart.z - origin.z
    );

    let tracerLine = null;
    if (!hideTracers && this.scene && this.activeBullets.length < 140) {
      const tracerColor = isVenomProj
        ? 0x2ecc71
        : isFireArrow
        ? 0xff5e00
        : isMountedMg
        ? 0xffb142
        : isBrightTracer
        ? 0xffeaa7
        : 0xf6d365;
      const opacity = isFireArrow || isVenomProj || isBrightTracer || isMountedMg ? 0.94 : 0.55;
      tracerLine = this._acquireTracerLine(
        tracerStart.x,
        tracerStart.y,
        tracerStart.z,
        tracerStart.x + dir.x * 0.35,
        tracerStart.y + dir.y * 0.35,
        tracerStart.z + dir.z * 0.35,
        tracerColor,
        opacity
      );
    }

    let arrowMesh = null;
    if (isArrowOrBolt && this.scene && this.activeBullets.length < 90) {
      arrowMesh = new THREE.Group();
      const isXbow = Boolean(
        (wepDef && wepDef.isCrossbow) || String(weaponLabel || '').includes('CROSSBOW')
      );
      const shaftLen = isXbow ? 1.15 : 1.45;
      const shaft = new THREE.Mesh(
        isXbow ? _xbowShaftGeo : _arrowShaftGeo,
        isXbow ? _xbowShaftMat : _arrowShaftMat
      );
      const tip = new THREE.Mesh(_arrowTipGeo, isFireArrow ? _fireTipMat : _arrowTipMat);
      tip.rotation.x = Math.PI / 2;
      tip.position.set(0, 0, shaftLen * 0.5 + 0.12);
      const fletchMat = this.team === 'RU' ? _fletchMatRU : _fletchMatUS;
      const fletchH = new THREE.Mesh(_arrowFletchHGeo, fletchMat);
      fletchH.position.set(0, 0, -shaftLen * 0.5 + 0.14);
      const fletchV = new THREE.Mesh(_arrowFletchVGeo, fletchMat);
      fletchV.position.set(0, 0, -shaftLen * 0.5 + 0.14);
      arrowMesh.add(shaft, tip, fletchH, fletchV);
      if (isFireArrow) {
        const flameCone = new THREE.Mesh(_fireArrowConeGeo, _fireConeMat);
        flameCone.rotation.x = -Math.PI / 2;
        flameCone.position.set(0, 0, shaftLen * 0.5 + 0.04);
        arrowMesh.add(flameCone);
      }
      arrowMesh.position.set(
        origin.x + dir.x * 0.55,
        origin.y + dir.y * 0.55 - 0.05,
        origin.z + dir.z * 0.55
      );
      _stepLookAt.copy(arrowMesh.position).add(dir);
      arrowMesh.lookAt(_stepLookAt);
      this.scene.add(arrowMesh);
    }

    const normDir = dir.clone().normalize();
    const bullet = {
      pos: origin.clone(),
      startOrigin: origin.clone(),
      tracerStart: tracerStart.clone(),
      muzzleOffset,
      vel: normDir.multiplyScalar(muzzleVelocity),
      muzzleVelocity,
      gravity: bulletGravity,
      traveledDist: 0,
      flightTime: 0,
      maxRayRange,
      damage,
      headshotMult,
      voxelDamage,
      weaponLabel,
      armorPenMult,
      wepDef,
      explosiveSplash: wepDef?.explosiveSplash || null,
      pelletCount,
      isBuckshot,
      isMountedMg,
      isHeavyPenCaliber,
      isRiflePenCaliber,
      maxCollateralTargets,
      collateralFalloff,
      penetratedCover: false,
      coverPenCount: 0,
      maxCoverPenetrations:
        wepDef && typeof wepDef.maxCoverPenetrations === 'number'
          ? wepDef.maxCoverPenetrations
          : wepDef?.isAntiMateriel
          ? wepDef.id === 'ntw20'
            ? 2
            : 1
          : 1,
      coverPenMult: 1.0,
      ignoredVoxelKey: null,
      ignoredVoxelKeys: null,
      hitBots: new Set(),
      collateralHits: 0,
      collateralKills: 0,
      isBrightTracer,
      tracerLine,
      arrowMesh,
      explosiveSplash: wepDef && wepDef.explosiveSplash ? wepDef.explosiveSplash : null,
      shooterWasAds: Boolean(this.isAds),
      shooterUsedCanted: Boolean(this.useCantedSight),
      shooterOpticType: this.getActiveOpticType ? this.getActiveOpticType() : wepDef?.opticType || null,
      shooterStance: this.prone ? 'PRONE' : this.crouching ? 'CROUCH' : 'STANDING',
      shooterHeldBreath: Boolean(this.isHoldingBreath)
    };

    this.activeBullets.push(bullet);
  },

  _acquireTracerLine(x0, y0, z0, x1, y1, z1, colorHex, opacity) {
    if (!this._tracerLinePool) this._tracerLinePool = [];
    let line = this._tracerLinePool.pop();
    if (!line) {
      const geo = new THREE.BufferGeometry();
      const attr = new THREE.Float32BufferAttribute(new Float32Array(6), 3);
      attr.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('position', attr);
      const mat = new THREE.LineBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity
      });
      line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
    } else {
      line.material.color.setHex(colorHex);
      line.material.opacity = opacity;
    }
    const posAttr = line.geometry.attributes.position;
    posAttr.setXYZ(0, x0, y0, z0);
    posAttr.setXYZ(1, x1, y1, z1);
    posAttr.needsUpdate = true;
    line.visible = true;
    this.scene.add(line);
    return line;
  },

  _releaseTracerLine(line) {
    if (!line) return;
    if (this.scene) this.scene.remove(line);
    line.visible = false;
    if (!this._tracerLinePool) this._tracerLinePool = [];
    if (this._tracerLinePool.length < 160) {
      this._tracerLinePool.push(line);
    } else {
      if (line.geometry && !line.geometry.userData?.shared) line.geometry.dispose();
      if (line.material && !line.material.userData?.shared) line.material.dispose();
    }
  },

  /**
   * Advances all in-flight ballistic bullets each frame (`dt`), applying gravity drop (`9.81 m/s²`)
   * and aerodynamic drag, and raycasting strictly along the frame's physical travel segment
   * (`prevPos ➔ nextPos`, length `speed * dt`) so targets take damage only when the bullet arrives.
   */
  updateBallisticBullets(dt) {
    if (!Array.isArray(this.activeBullets) || this.activeBullets.length === 0) return;
    const clampedDt = Math.min(dt, 0.08);
    if (clampedDt <= 0) return;

    for (let i = this.activeBullets.length - 1; i >= 0; i--) {
      const b = this.activeBullets[i];
      const keepAlive = this._stepBallisticBullet(b, clampedDt);
      if (!keepAlive) {
        if (b.tracerLine) {
          this._releaseTracerLine(b.tracerLine);
          b.tracerLine = null;
        }
        if (b.arrowMesh) {
          this.scene.remove(b.arrowMesh);
          b.arrowMesh.traverse((ch) => {
            if (ch.isMesh) {
              if (ch.geometry && !ch.geometry.userData?.shared) ch.geometry.dispose();
              if (ch.material && !ch.material.userData?.shared) ch.material.dispose();
            }
          });
          b.arrowMesh = null;
        }
        this.activeBullets.splice(i, 1);
      }
    }
  },

  _stepBallisticBullet(bullet, dt) {
    _stepPrevPos.copy(bullet.pos);

    // 1. Apply ballistic gravity drop & subtle aerodynamic drag over flight time
    bullet.vel.y -= bullet.gravity * dt;
    const dragFactor = bullet.isBuckshot ? 0.35 : 0.06;
    bullet.vel.multiplyScalar(Math.max(0.88, 1 - dragFactor * dt));

    _stepVec.copy(bullet.vel).multiplyScalar(dt);
    let stepDist = _stepVec.length();
    if (stepDist <= 0.0001) return false;

    const remainingRange = bullet.maxRayRange - bullet.traveledDist;
    if (remainingRange <= 0) return false;

    _stepDir.copy(_stepVec).multiplyScalar(1 / stepDist);
    let reachedMaxRange = false;
    if (stepDist >= remainingRange) {
      stepDist = remainingRange;
      reachedMaxRange = true;
    }

    bullet.flightTime += dt;

    // 2. Check 3D Voxel Grid along this frame's segment `[prevPos, prevPos + stepDir * stepDist]`
    const ignoreArg = bullet.ignoredVoxelKeys || bullet.ignoredVoxelKey;
    let voxelHit = this.world.raycastVoxel(
      _stepPrevPos,
      _stepDir,
      stepDist,
      0,
      ignoreArg
    );
    let maxSegmentEntityDist = stepDist;
    let stoppedByVoxel = null;

    const maxCoverPens = bullet.maxCoverPenetrations || 1;
    let guardPenLoops = 0;
    while (
      voxelHit &&
      voxelHit.distance <= stepDist &&
      voxelHit.voxel &&
      (bullet.coverPenCount || 0) < maxCoverPens &&
      guardPenLoops < 3
    ) {
      guardPenLoops++;
      const vType = voxelHit.voxel.type;
      const isWoodOrProp = Boolean(voxelHit.voxel.isProp || vType === 'wood');
      const isAmrRound = Boolean(bullet.wepDef?.isAntiMateriel);
      const isMasonryOrSandbag =
        vType === 'sandbag' ||
        (bullet.isHeavyPenCaliber && vType === 'brick') ||
        ((bullet.isMountedMg || isAmrRound) &&
          (vType === 'brick' || vType === 'concrete' || vType === 'darkConcrete'));

      let didPierce = false;
      if (isWoodOrProp && bullet.damage >= 22) {
        didPierce = true;
        bullet.penetratedCover = true;
        bullet.coverPenCount = (bullet.coverPenCount || 0) + 1;
        bullet.coverPenMult *= isAmrRound
          ? 0.92
          : bullet.isMountedMg
          ? 0.9
          : bullet.isHeavyPenCaliber
          ? 0.78
          : 0.6;
        this.world.damageVoxel(
          voxelHit.voxel.gx,
          voxelHit.voxel.gy,
          voxelHit.voxel.gz,
          bullet.voxelDamage,
          this.onBroadcast
        );
      } else if (
        isMasonryOrSandbag &&
        (isAmrRound || bullet.isMountedMg || bullet.isHeavyPenCaliber || bullet.armorPenMult > 1.05)
      ) {
        didPierce = true;
        bullet.penetratedCover = true;
        bullet.coverPenCount = (bullet.coverPenCount || 0) + 1;
        bullet.coverPenMult *= isAmrRound
          ? bullet.wepDef?.id === 'ntw20'
            ? 0.85
            : 0.78
          : bullet.isMountedMg
          ? 0.82
          : bullet.isHeavyPenCaliber
          ? 0.68
          : 0.52;
        const chipDmg = isAmrRound
          ? Math.max(55, Math.round(bullet.voxelDamage * 0.85))
          : bullet.isMountedMg
          ? Math.max(24, Math.round(bullet.voxelDamage * 0.65))
          : Math.max(8, Math.round(bullet.voxelDamage * 0.45));
        this.world.damageVoxel(
          voxelHit.voxel.gx,
          voxelHit.voxel.gy,
          voxelHit.voxel.gz,
          chipDmg,
          this.onBroadcast
        );
        // Real-world AMR concrete/masonry back-face spall cone!
        if (isAmrRound && typeof this.world.spawnDebris === 'function') {
          const spallExit = voxelHit.point.clone().addScaledVector(_stepDir, 1.15);
          this.world.spawnDebris(spallExit, voxelHit.voxel.baseColor || _hitGroundColor, 5);
        }
      }

      if (!didPierce) break;

      this.world.spawnBulletImpact(
        voxelHit.point,
        voxelHit.normal,
        voxelHit.voxel.baseColor
      );
      if ((bullet.coverPenCount || 0) === 1 && maxCoverPens <= 1) {
        bullet.ignoredVoxelKey = voxelHit.voxel.key;
      } else {
        if (!bullet.ignoredVoxelKeys) {
          bullet.ignoredVoxelKeys = new Set();
          if (bullet.ignoredVoxelKey !== null && bullet.ignoredVoxelKey !== undefined) {
            bullet.ignoredVoxelKeys.add(bullet.ignoredVoxelKey);
          }
        }
        bullet.ignoredVoxelKeys.add(voxelHit.voxel.key);
        bullet.ignoredVoxelKey = voxelHit.voxel.key;
      }
      voxelHit = this.world.raycastVoxel(
        _stepPrevPos,
        _stepDir,
        stepDist,
        0,
        bullet.ignoredVoxelKeys || bullet.ignoredVoxelKey
      );
    }

    if (voxelHit && voxelHit.distance <= stepDist) {
      maxSegmentEntityDist = voxelHit.distance;
      stoppedByVoxel = voxelHit;
    }

    // 3. Broadphase-Filtered Raycast against Soldiers & Vehicles within `[0, maxSegmentEntityDist]`
    this.raycaster.set(_stepPrevPos, _stepDir);
    this.raycaster.far = Math.max(0.01, maxSegmentEntityDist);

    if (!this._bulletRayTargets) this._bulletRayTargets = [];
    else this._bulletRayTargets.length = 0;
    const targets = this._bulletRayTargets;

    const ppx = _stepPrevPos.x;
    const ppy = _stepPrevPos.y;
    const ppz = _stepPrevPos.z;
    const sdx = _stepDir.x;
    const sdy = _stepDir.y;
    const sdz = _stepDir.z;

    if (this.vehicleManager && Array.isArray(this.vehicleManager.vehicles)) {
      const vehs = this.vehicleManager.vehicles;
      for (let vIdx = 0; vIdx < vehs.length; vIdx++) {
        const v = vehs[vIdx];
        if (
          !v ||
          v.dead ||
          v === this.activeVehicle ||
          (v.team === this.team && !this.friendlyFireEnabled)
        ) {
          continue;
        }
        const vx = v.pos.x - ppx;
        const vy = v.pos.y + (v.isAircraft ? 1.5 : 1.2) - ppy;
        const vz = v.pos.z - ppz;
        const r = v.hitRadius || (v.isAircraft ? 16.0 : 6.5);
        const proj = vx * sdx + vy * sdy + vz * sdz;
        if (proj < -r || proj > maxSegmentEntityDist + r) continue;
        const perpSq = vx * vx + vy * vy + vz * vz - proj * proj;
        if (perpSq <= r * r) {
          if (v.mesh && v.mesh._culledOffFrustum) {
            THREE.Group.prototype.updateMatrixWorld.call(v.mesh, true);
          }
          if (Array.isArray(v.hitMeshes)) {
            for (let m = 0; m < v.hitMeshes.length; m++) {
              targets.push(v.hitMeshes[m]);
            }
          } else if (Array.isArray(this.vehicleManager.hitMeshes)) {
            for (let m = 0; m < this.vehicleManager.hitMeshes.length; m++) {
              const vm = this.vehicleManager.hitMeshes[m];
              if (vm && vm.userData && vm.userData.vehicle === v) {
                targets.push(vm);
              }
            }
          }
        }
      }
    }

    const allowFriendlyBotHit = Boolean(
      this.friendlyFireEnabled && !this.activeVehicle && !bullet.isMountedMg
    );

    const considerBotTarget = (b) => {
      if (
        !b ||
        b.dead ||
        b.downed ||
        (typeof b.hp === 'number' && b.hp <= 0) ||
        (typeof b.bleedOutTimer === 'number' && b.bleedOutTimer > 0) ||
        b.drivingVehicle ||
        (b.team === this.team && !allowFriendlyBotHit) ||
        !b.hitMeshes ||
        bullet.hitBots.has(b)
      ) {
        return;
      }
      const vx = b.pos.x - ppx;
      const vy = b.pos.y + 0.9 - ppy;
      const vz = b.pos.z - ppz;
      const proj = vx * sdx + vy * sdy + vz * sdz;
      if (proj < -2.0 || proj > maxSegmentEntityDist + 2.0) return;
      const perpSq = vx * vx + vy * vy + vz * vz - proj * proj;
      if (perpSq <= 6.25) {
        if (b.mesh && b.mesh._culledOffFrustum) {
          THREE.Group.prototype.updateMatrixWorld.call(b.mesh, true);
        }
        for (let m = 0; m < b.hitMeshes.length; m++) {
          targets.push(b.hitMeshes[m]);
        }
      }
    };

    if (this.botManager) {
      if (this.botManager.spatialGrid && this.botManager.spatialGrid.count > 0) {
        const endX = ppx + sdx * maxSegmentEntityDist;
        const endZ = ppz + sdz * maxSegmentEntityDist;
        const boxMinX = (ppx < endX ? ppx : endX) - 2.5;
        const boxMaxX = (ppx > endX ? ppx : endX) + 2.5;
        const boxMinZ = (ppz < endZ ? ppz : endZ) - 2.5;
        const boxMaxZ = (ppz > endZ ? ppz : endZ) + 2.5;
        this.botManager.spatialGrid.forEachInAABB(boxMinX, boxMaxX, boxMinZ, boxMaxZ, considerBotTarget);
      } else if (this.botManager.bots) {
        for (let i = 0; i < this.botManager.bots.length; i++) {
          considerBotTarget(this.botManager.bots[i]);
        }
      }
    }

    if (this.onGetRemoteMeshes) {
      const rem = this.onGetRemoteMeshes();
      if (rem && rem.length > 0) {
        for (let rIdx = 0; rIdx < rem.length; rIdx++) targets.push(rem[rIdx]);
      }
    }

    let terminatedOnEntity = false;
    _stepImpactPt.copy(_stepPrevPos).addScaledVector(_stepDir, maxSegmentEntityDist);

    if (targets.length > 0) {
      if (!this._bulletRayHits) this._bulletRayHits = [];
      else this._bulletRayHits.length = 0;
      const hits = this.raycaster.intersectObjects(targets, false, this._bulletRayHits);
      for (let hIdx = 0; hIdx < hits.length; hIdx++) {
        const hit = hits[hIdx];
        if (hit.distance > maxSegmentEntityDist + 0.05) break;

        if (hit.object.userData.bot) {
          const bot = hit.object.userData.bot;
          if (
            (bot.team === this.team && !allowFriendlyBotHit) ||
            bot.dead ||
            bot.downed ||
            (typeof bot.hp === 'number' && bot.hp <= 0) ||
            (typeof bot.bleedOutTimer === 'number' && bot.bleedOutTimer > 0) ||
            bullet.hitBots.has(bot)
          ) {
            continue;
          }

          let bestBotHit = hit;
          if (!hit.object.userData.isHead) {
            for (let k = hIdx + 1; k < hits.length; k++) {
              const cand = hits[k];
              if (cand.distance > hit.distance + 0.65) break;
              if (cand.object.userData.bot === bot && cand.object.userData.isHead) {
                bestBotHit = cand;
                break;
              }
            }
          }

          const isHeadshot = Boolean(bestBotHit.object.userData.isHead);
          const relHitY = bestBotHit.point.y - bot.pos.y;
          const isUpperChest =
            !isHeadshot && (Boolean(bestBotHit.object.userData.isTorso) || relHitY >= 0.92);
          const chestZoneMult =
            isUpperChest && bullet.wepDef && bullet.wepDef.chestMult > 1
              ? bullet.wepDef.chestMult
              : 1.0;
          const hitThroughCover = Boolean(bullet.penetratedCover);
          const totalFlightDist = bullet.traveledDist + bestBotHit.distance;

          const penIndex = bullet.hitBots.size;
          const bodyPenMult = Math.pow(bullet.collateralFalloff, penIndex);
          const envMult = hitThroughCover ? bullet.coverPenMult : 1.0;
          const distMult = this.getDistanceDamageMultiplier(
            totalFlightDist,
            bullet.wepDef,
            bullet.pelletCount
          );
          const incendiaryMult = bullet.wepDef?.isIncendiaryAmmo ? 1.15 : 1.0;
          const dmg = Math.max(
            1,
            Math.round(
              bullet.damage *
                incendiaryMult *
                distMult *
                bodyPenMult *
                envMult *
                (isHeadshot ? bullet.headshotMult : chestZoneMult)
            )
          );

          const hitZone =
            bestBotHit.object?.userData?.hitZone ||
            (isHeadshot ? 'head' : isUpperChest ? 'thorax' : 'leftLeg');
          const hpBeforeHit = typeof bot.hp === 'number' ? bot.hp : 100;
          const targetSpeedMps =
            bot.drivingVehicle?.forwardSpeed ||
            bot.ridingVehicle?.forwardSpeed ||
            bot.lastHorizSpeed ||
            0;
          const botRightX = Math.cos(bot.yaw || 0);
          const botRightZ = -Math.sin(bot.yaw || 0);
          const relLateral =
            (bestBotHit.point.x - bot.pos.x) * botRightX +
            (bestBotHit.point.z - bot.pos.z) * botRightZ;

          const res = this.botManager.damageBot(
            bot,
            dmg,
            this.name,
            this.team,
            bullet.weaponLabel,
            isHeadshot,
            this.onKillEvent,
            this.onAwardXp,
            { origin: this.activeVehicle?.pos || this.pos, dist: 0, radius: 0, hitZone }
          );
          if (res && res.ignoredDowned) {
            continue;
          }

          const isFriendlyBot = bot.team === this.team;
          if (!isFriendlyBot && bullet.wepDef?.causesBleed && !bot.dead) {
            bot.bleeding = true;
          }
          if (hitThroughCover && penIndex === 0 && !isFriendlyBot && this.onAwardXp) {
            this.onAwardXp(
              bullet.wepDef?.isAntiMateriel ? 40 : 25,
              bullet.wepDef?.isAntiMateriel
                ? `🧱 AMR MASONRY WALLBANG + SPALL! (${bullet.coverPenCount || 1} WALL${(bullet.coverPenCount || 1) > 1 ? 'S' : ''} PIERCED)`
                : '🧱 COVER PENETRATION WALLBANG!'
            );
          }

          bullet.hitBots.add(bot);
          bullet.collateralHits++;
          _stepImpactPt.copy(bestBotHit.point);

          // Evaluate Sniper Marksman Shot Difficulty, Badges, Feat Ribbons & Earned Titles!
          // Includes Smoke-Screen Ray Check (`throughSmoke` / `targetInSmoke`), Rapid Double-Shot (`<= 4.2s`),
          // Enemy Medic Triage-Denied, Cranial Headshot, and Friendly-Fire (`⚠️ BLUE-ON-BLUE`) Warning Cards!
          if (!this.activeVehicle) {
            if (!this.marksmanProfile) {
              this.marksmanProfile = loadMarksmanProfile();
            }
            const nowHitMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
            const oneShotKill = Boolean(
              !isFriendlyBot && res.killed && hpBeforeHit >= 92 && penIndex === 0
            );
            const rapidDoubleShot = Boolean(
              !isFriendlyBot &&
                res.killed &&
                this._lastMarksmanKillAtMs &&
                nowHitMs - this._lastMarksmanKillAtMs <= 4200
            );
            const flightTimeAtHit =
              bullet.flightTime +
              bestBotHit.distance / Math.max(60, bullet.vel.length() || bullet.muzzleVelocity || 780);

            // Ray-segment check against active Tactical Smoke Screens (`this.botManager.smokeClouds`)
            let throughSmoke = false;
            let targetInSmoke = false;
            let smokeNormPos = 0.65;
            const smokeList = this.botManager?.smokeClouds;
            if (Array.isArray(smokeList) && smokeList.length > 0 && bullet.startOrigin) {
              const ox = bullet.startOrigin.x;
              const oy = bullet.startOrigin.y;
              const oz = bullet.startOrigin.z;
              const segDx = bestBotHit.point.x - ox;
              const segDy = bestBotHit.point.y - oy;
              const segDz = bestBotHit.point.z - oz;
              const segLenSq = Math.max(1, segDx * segDx + segDy * segDy + segDz * segDz);
              for (let si = 0; si < smokeList.length; si++) {
                const sc = smokeList[si];
                const sp = sc?.group?.position || sc?.pos;
                if (!sp) continue;
                const scY = sp.y + 0.9;
                const dTgtSq =
                  (bestBotHit.point.x - sp.x) * (bestBotHit.point.x - sp.x) +
                  (bestBotHit.point.y - scY) * (bestBotHit.point.y - scY) +
                  (bestBotHit.point.z - sp.z) * (bestBotHit.point.z - sp.z);
                if (dTgtSq <= 4.9 * 4.9) {
                  targetInSmoke = true;
                  smokeNormPos = 0.88;
                }
                const projU =
                  ((sp.x - ox) * segDx + (scY - oy) * segDy + (sp.z - oz) * segDz) / segLenSq;
                if (projU > 0.04 && projU < 0.96) {
                  const cx = ox + segDx * projU - sp.x;
                  const cy = oy + segDy * projU - scY;
                  const cz = oz + segDz * projU - sp.z;
                  if (cx * cx + cy * cy + cz * cz <= 4.5 * 4.5) {
                    throughSmoke = true;
                    smokeNormPos = Math.max(0.14, Math.min(0.9, projU));
                  }
                }
              }
            }

            const marksmanEval = evaluateMarksmanShot(
              {
                wepDef: bullet.wepDef,
                weaponLabel: bullet.weaponLabel,
                distanceM: totalFlightDist,
                flightTimeS: flightTimeAtHit,
                gravityMps2: bullet.gravity,
                shooterPos: bullet.startOrigin,
                impactPos: bestBotHit.point,
                damageDealt: dmg,
                isKill: Boolean(res.killed),
                isHeadshot,
                oneShotKill,
                hitZone,
                relHitY,
                relLateral,
                fracturedLimb: res.fracturedLimb || null,
                targetSpeedMps,
                targetRole: bot.role || '',
                penetratedCover: hitThroughCover,
                collateralCount: res.killed ? bullet.collateralKills + 1 : bullet.collateralHits,
                isAds: Boolean(bullet.shooterWasAds),
                useCantedSight: Boolean(bullet.shooterUsedCanted),
                opticType: bullet.shooterOpticType,
                stance: bullet.shooterStance || 'STANDING',
                isHoldingBreath: Boolean(bullet.shooterHeldBreath),
                currentDeadeyeStreak: this.deadeyeStreak || 0,
                isFriendly: Boolean(isFriendlyBot),
                throughSmoke,
                targetInSmoke,
                smokeNormPos,
                rapidDoubleShot,
                wasRescuing: Boolean(res.wasRescuing || bot.rescueTarget)
              },
              this.marksmanProfile
            );
            if (marksmanEval.triggered) {
              if (isFriendlyBot) {
                if (res.killed) this.deadeyeStreak = 0;
              } else if (res.killed) {
                this.deadeyeStreak = marksmanEval.deadeyeStreak;
                this._lastMarksmanKillAtMs = nowHitMs;
                const elevDeltaHere = (bullet.startOrigin?.y || 0) - (bestBotHit.point?.y || 0);
                if (
                  (this.prone || this.crouching || elevDeltaHere >= 8.0) &&
                  totalFlightDist >= 75
                ) {
                  this.camperKills = (this.camperKills || 0) + 1;
                }
              }
              marksmanEval.timestamp = nowHitMs;
              marksmanEval.victimName = bot.name || (isFriendlyBot ? 'FRIENDLY' : 'ENEMY');
              this.lastMarksmanShot = marksmanEval;
              if (!isFriendlyBot && marksmanEval.bonusXp > 0) {
                this.score = (this.score || 0) + marksmanEval.bonusXp;
                this.onAwardXp?.(
                  marksmanEval.bonusXp,
                  `${marksmanEval.badge.icon} MARKSMAN [${marksmanEval.grade}] ${marksmanEval.badge.badgeName}: ${marksmanEval.distanceM}m • ${marksmanEval.anatomy.shortPart} (${dmg} DMG)`
                );
              }
              if (!isFriendlyBot && marksmanEval.bonusCash > 0 && typeof this.addCash === 'function') {
                this.addCash(
                  marksmanEval.bonusCash,
                  `MARKSMAN ${marksmanEval.distanceM}M BONUS`,
                  false
                );
              }
              sound.playMarksmanBadgeStinger?.(marksmanEval.grade);
              if (marksmanEval.newlyUnlockedTitle && this.onKillStreakAnnouncement) {
                this.onKillStreakAnnouncement(
                  `🏅 TITLE EARNED: 「${marksmanEval.newlyUnlockedTitle.icon} ${marksmanEval.newlyUnlockedTitle.title}」!`
                );
              }
              events.emit('marksman:shot', marksmanEval);
            }
          }

          const impactColor = bullet.wepDef?.isIncendiaryAmmo
            ? _hitVehColor
            : res.hitType === 'armor'
            ? _hitArmorColor
            : isHeadshot
            ? _hitHeadColor
            : _hitBodyColor;
          this.world.spawnDebris(
            bestBotHit.point,
            impactColor,
            bullet.wepDef?.isIncendiaryAmmo ? 7 : res.killed ? 6 : 3
          );
          if (bot.mesh.userData.parts && bot.mesh.userData.parts.upperBody) {
            bot.mesh.userData.parts.upperBody.rotation.x = -0.42;
          }

          const hmStyle = res.killed ? 'kill' : res.hitType;
          sound.playHitmarker(hmStyle);
          const colTag = penIndex > 0 ? ` [COLLATERAL x${penIndex + 1}]` : '';
          const breakTag = res.beyondRescue
            ? ' • 💀 CATASTROPHIC BREAK!'
            : res.fracturedLimb === 'leg'
            ? ' • 🦴 LEG FRACTURED!'
            : res.fracturedLimb === 'arm'
            ? ' • 🦴 ARM FRACTURED!'
            : '';
          const hmLabel = isFriendlyBot
            ? res.killed
              ? `⚠️ TEAMKILL! (-$0.10 / -10¢)`
              : `⚠️ FRIENDLY FIRE -${dmg}`
            : res.killed
            ? isHeadshot
              ? `HEADSHOT KILL!${colTag}${breakTag}`
              : bullet.wepDef?.isBoltSniper && isUpperChest
              ? `🎯 SNIPER ONE-SHOT!${colTag}${breakTag}`
              : `ELIMINATED!${colTag}${breakTag}`
            : isHeadshot
            ? `HEADSHOT -${dmg}${colTag}`
            : res.hitType === 'armor'
            ? `ARMOR HIT -${dmg}${colTag}`
            : `HIT -${dmg}${colTag}${breakTag}`;
          if (this.onHitmarker) this.onHitmarker(hmStyle, hmLabel);

          if (this.onFloatingDamage) {
            this.onFloatingDamage(
              bestBotHit.point.clone().add(new THREE.Vector3(0, 0.5 + penIndex * 0.25, 0)),
              dmg,
              isHeadshot
            );
          }

          if (res.killed && !isFriendlyBot) {
            bullet.collateralKills++;
            this.kills++;
            const rawPts = isHeadshot ? COMBAT.KILL_XP_HEADSHOT : COMBAT.KILL_XP_NORMAL;
            const pts = this.inSquadCohesion ? Math.round(rawPts * 1.25) : rawPts;
            const cohTag = this.inSquadCohesion ? ' • 🤝 +25% COHESION' : '';
            this.score += pts;
            if (this.onAwardXp) {
              this.onAwardXp(
                pts,
                isHeadshot
                  ? `ENEMY KILLED [HEADSHOT${colTag}] (${bot.name})${cohTag}`
                  : `ENEMY KILLED${colTag} (${bot.name})${cohTag}`
              );
            }
            if (bot.role === 'MEDIC') {
              this.registerMedicWarCrime(bot.name, Boolean(res.wasRescuing));
            }
            const killInfo = this.registerKill(bot.name);
            if (this.activeVehicle && this.activeVehicle.isAircraft) {
              this.recordAirCombatKill?.(1);
            }
            if (killInfo.announcement && this.onKillStreakAnnouncement) {
              this.onKillStreakAnnouncement(killInfo.announcement);
            }
            if (killInfo.streakAnnouncement && this.onKillStreakAnnouncement) {
              this.onKillStreakAnnouncement(killInfo.streakAnnouncement);
            }
          }

          const stoppedByArmor =
            !bullet.isRiflePenCaliber && !isHeadshot && res.hitType === 'armor';
          if (bullet.hitBots.size >= bullet.maxCollateralTargets || stoppedByArmor) {
            terminatedOnEntity = true;
            break;
          }
        } else if (hit.object.userData.vehicle) {
          const veh = hit.object.userData.vehicle;
          if (!veh || veh === this.activeVehicle || veh.dead) {
            continue;
          }
          _stepImpactPt.copy(hit.point);
          if (veh.team !== this.team && !veh.dead) {
            this.world.spawnDebris(hit.point, _hitVehColor, 3);
            sound.playHitmarker('armor');
            const apDmg = Math.max(
              1,
              Math.round(bullet.voxelDamage * 0.45 * bullet.armorPenMult)
            );
            const shooterPos = this.activeVehicle?.pos || this.pos;
            this.vehicleManager.damageVehicle(
              veh,
              apDmg,
              this.name,
              this.team,
              bullet.weaponLabel,
              this.onKillEvent,
              this.onAwardXp,
              shooterPos,
              hit.point
            );
            const actualDmg = typeof veh.lastAppliedDamage === 'number' ? veh.lastAppliedDamage : apDmg;
            if (this.activeVehicle && this.activeVehicle.isAircraft && actualDmg > 0) {
              this.vehicleManager.notifyPlayerOrdnanceImpact?.({
                pos: hit.point,
                radius: 4,
                damage: actualDmg,
                pType: 'aircraft_gun',
                owner: this
              });
            }
            if (this.onHitmarker) {
              if (veh.lastSubsystemCrit === 'ENGINE_SEIZED') {
                this.onHitmarker('armor', `🔥 ENGINE BLOCK SEIZED! (-${actualDmg})`);
              } else if (veh.lastSubsystemCrit === 'OPTICS') {
                this.onHitmarker(
                  'armor',
                  actualDmg > 0 ? `🔭 OPTICS SHATTERED -${actualDmg}` : '🔭 OPTICS CRACKED! (0 HULL DMG)'
                );
              } else if (veh.lastSubsystemCrit === 'SENSORS') {
                this.onHitmarker(
                  'armor',
                  actualDmg > 0 ? `📡 SENSOR GLITCH -${actualDmg}` : '📡 SENSOR GLITCH! (0 HULL DMG)'
                );
              } else if (veh.lastArmorRicochet) {
                this.onHitmarker(
                  'armor',
                  actualDmg > 0 ? `🛡️ ARMOR RICOCHET -${actualDmg}` : '🛡️ NO PENETRATION (0 DMG)'
                );
              } else if (actualDmg > 0 && veh.isAircraft) {
                const partTag = veh.lastHitDesc || '✈️ AIRFRAME HIT';
                this.onHitmarker('armor', `${partTag} (-${actualDmg})`);
              } else if (actualDmg > 0) {
                this.onHitmarker(
                  'armor',
                  bullet.isMountedMg ? `AP ARMOR HIT -${actualDmg}` : `VEHICLE ARMOR -${actualDmg}`
                );
              }
            }
          }
          terminatedOnEntity = true;
          break;
        } else if (hit.object.userData.remotePlayer) {
          const rp = hit.object.userData.remotePlayer;
          _stepImpactPt.copy(hit.point);
          if (rp.team !== this.team) {
            const isHeadshot = Boolean(hit.object.userData.isHead);
            const dmg = Math.round(
              bullet.damage * (isHeadshot ? bullet.headshotMult : 1)
            );
            sound.playHitmarker(isHeadshot ? 'headshot' : 'normal');
            if (this.onHitmarker) this.onHitmarker(isHeadshot ? 'headshot' : 'normal');
            if (this.onBroadcast) {
              this.onBroadcast({
                type: 'player_hit',
                targetId: rp.id,
                damage: dmg,
                attackerName: this.name,
                attackerTeam: this.team,
                weapon: bullet.weaponLabel
              });
            }
          }
          terminatedOnEntity = true;
          break;
        }
      }
    }

    // 3b. Swept-Sphere Airborne Aircraft Hit Detection along `[prevPos, prevPos + stepDir * maxSegmentEntityDist]`:
    // Ensures dogfight cannon rounds & downward AC-130 rounds that physically cross a lower plane hit moving wings/fuselage!
    if (
      !terminatedOnEntity &&
      this.vehicleManager &&
      Array.isArray(this.vehicleManager.vehicles)
    ) {
      for (let vIdx = 0; vIdx < this.vehicleManager.vehicles.length; vIdx++) {
        const airV = this.vehicleManager.vehicles[vIdx];
        if (
          !airV ||
          !airV.isAircraft ||
          airV.dead ||
          airV === this.activeVehicle ||
          airV.team === this.team
        ) {
          continue;
        }
        const vx = airV.pos.x - ppx;
        const vy = airV.pos.y - ppy;
        const vz = airV.pos.z - ppz;
        const proj = THREE.MathUtils.clamp(
          vx * sdx + vy * sdy + vz * sdz,
          0,
          maxSegmentEntityDist
        );
        const closestX = ppx + sdx * proj;
        const closestY = ppy + sdy * proj;
        const closestZ = ppz + sdz * proj;
        const dx = airV.pos.x - closestX;
        const dy = airV.pos.y - closestY;
        const dz = airV.pos.z - closestZ;
        const distSq = dx * dx + dy * dy + dz * dz;
        const hitRadius =
          airV.aircraftRole === 'gunship' || airV.aircraftRole === 'bomber' ? 10.5 : 7.4;

        if (distSq <= hitRadius * hitRadius) {
          _stepImpactPt.set(closestX, closestY, closestZ);
          this.world.spawnDebris(_stepImpactPt, _hitVehColor, 4);
          sound.playHitmarker('armor');
          const apDmg = Math.max(
            1,
            Math.round(bullet.voxelDamage * 0.45 * bullet.armorPenMult)
          );
          const shooterPos = this.activeVehicle?.pos || this.pos;
          this.vehicleManager.damageVehicle(
            airV,
            apDmg,
            this.name,
            this.team,
            bullet.weaponLabel,
            this.onKillEvent,
            this.onAwardXp,
            shooterPos,
            _stepImpactPt
          );
          const actualAirDmg = typeof airV.lastAppliedDamage === 'number' ? airV.lastAppliedDamage : apDmg;
          if (this.onHitmarker && actualAirDmg > 0) {
            this.onHitmarker(
              'armor',
              airV.lastHitDesc ? `${airV.lastHitDesc} (-${actualAirDmg})` : `✈️ AIRFRAME HIT -${actualAirDmg}`
            );
          }
          terminatedOnEntity = true;
          break;
        }
      }
    }

    // 4. If stopped by a non-penetrated voxel (and didn't already terminate on an entity in front of it)
    if (!terminatedOnEntity && stoppedByVoxel) {
      _stepImpactPt.copy(stoppedByVoxel.point);
      if (stoppedByVoxel.voxel) {
        if (stoppedByVoxel.voxel.isProp || stoppedByVoxel.voxel.type === 'wood') {
          this.world.damageVoxel(
            stoppedByVoxel.voxel.gx,
            stoppedByVoxel.voxel.gy,
            stoppedByVoxel.voxel.gz,
            bullet.voxelDamage,
            this.onBroadcast
          );
        } else if (stoppedByVoxel.voxel.type === 'sandbag') {
          const sandbagChip = bullet.isMountedMg
            ? Math.max(28, Math.round(bullet.voxelDamage * 0.75))
            : Math.max(6, Math.round(bullet.voxelDamage * 0.45));
          this.world.damageVoxel(
            stoppedByVoxel.voxel.gx,
            stoppedByVoxel.voxel.gy,
            stoppedByVoxel.voxel.gz,
            sandbagChip,
            this.onBroadcast
          );
        } else if (
          (bullet.isMountedMg || bullet.wepDef?.isAntiMateriel) &&
          (stoppedByVoxel.voxel.type === 'brick' ||
            stoppedByVoxel.voxel.type === 'concrete')
        ) {
          const wallChip = Math.max(24, Math.round(bullet.voxelDamage * 0.58));
          this.world.damageVoxel(
            stoppedByVoxel.voxel.gx,
            stoppedByVoxel.voxel.gy,
            stoppedByVoxel.voxel.gz,
            wallChip,
            this.onBroadcast
          );
        }
      }
      const impactCol = stoppedByVoxel.voxel
        ? stoppedByVoxel.voxel.baseColor
        : _hitGroundColor;
      this.world.spawnBulletImpact(
        stoppedByVoxel.point,
        stoppedByVoxel.normal,
        impactCol
      );
    }

    const bulletTerminated = Boolean(
      terminatedOnEntity || stoppedByVoxel || reachedMaxRange
    );

    // 5. Near-miss suppression along this frame's segment (Support LMG deals 1.75x enemy suppression!)
    if (this.botManager) {
      const ix = _stepImpactPt.x;
      const iy = _stepImpactPt.y;
      const iz = _stepImpactPt.z;
      const isSupportLmg =
        this.role === 'support' &&
        (bullet.wepDef?.soundType === 'lmg' || (bullet.wepDef?.clipSize || 0) >= 50 || bullet.damage >= 26);
      const suppStep = isSupportLmg ? 0.15 * 1.75 : 0.15;
      const suppRad = isSupportLmg ? 6.8 : 5.2;
      const suppRadSq = suppRad * suppRad;
      if (this.botManager.spatialGrid && this.botManager.spatialGrid.count > 0) {
        this.botManager.spatialGrid.forEachInRadius(ix, iz, suppRad, (bot, dSqXZ) => {
          if (bot.dead || bot.downed || bot.team === this.team) return;
          const dy = bot.pos.y - iy;
          if (dy > suppRad || dy < -suppRad) return;
          const dSq = dSqXZ + dy * dy;
          if (dSq < suppRadSq && dSq > 0.01) {
            bot.suppressionLevel = Math.min(1.0, (bot.suppressionLevel || 0) + suppStep);
            bot.underFireTimer = isSupportLmg ? 3.2 : 2.4;
            if (!bot.lastShooterPos) bot.lastShooterPos = new THREE.Vector3();
            bot.lastShooterPos.copy(this.pos);
          }
        });
      } else if (this.botManager.bots) {
        for (let i = 0; i < this.botManager.bots.length; i++) {
          const bot = this.botManager.bots[i];
          if (bot.dead || bot.downed || bot.team === this.team) continue;
          const dx = bot.pos.x - ix;
          if (dx > suppRad || dx < -suppRad) continue;
          const dz = bot.pos.z - iz;
          if (dz > suppRad || dz < -suppRad) continue;
          const dy = bot.pos.y - iy;
          if (dy > suppRad || dy < -suppRad) continue;
          const dSq = dx * dx + dy * dy + dz * dz;
          if (dSq < suppRadSq && dSq > 0.01) {
            bot.suppressionLevel = Math.min(1.0, (bot.suppressionLevel || 0) + suppStep);
            bot.underFireTimer = isSupportLmg ? 3.2 : 2.4;
            if (!bot.lastShooterPos) bot.lastShooterPos = new THREE.Vector3();
            bot.lastShooterPos.copy(this.pos);
          }
        }
      }
    }

    // 6. If bullet terminated, award any multi-target collateral bonus and trigger explosive HEI splash
    if (bulletTerminated) {
      if (bullet.collateralKills >= 2) {
        const colBonus = bullet.collateralKills * 50;
        this.score += colBonus;
        if (this.onAwardXp) {
          this.onAwardXp(
            colBonus,
            `💀 COLLATERAL PENETRATION KILL! (${bullet.collateralKills}x ALIGNED ENEMIES ONE-SHOT!)`
          );
        }
        if (this.onKillStreakAnnouncement) {
          this.onKillStreakAnnouncement(`🎯 COLLATERAL ${bullet.collateralKills}X KILL!`);
        }
      } else if (bullet.collateralHits >= 2 && this.onAwardXp) {
        this.score += 45;
        this.onAwardXp(
          45,
          `🎯 COLLATERAL PENETRATION HIT! (${bullet.collateralHits} ALIGNED TARGETS PIERCED)`
        );
      }

      if (bullet.explosiveSplash && this.world && (terminatedOnEntity || stoppedByVoxel)) {
        const sp = bullet.explosiveSplash;
        const splashPos = _stepImpactPt.clone();
        this.world.explodeAt(
          splashPos,
          sp.radius || 3.5,
          sp.damage || 105,
          (pos, r, d, broken) => {
            if (this.onExplosionDamage) {
              this.onExplosionDamage(
                pos,
                r,
                d,
                this,
                broken,
                sp.weaponName || bullet.weaponLabel
              );
            } else {
              events.emit('explosion:damage', {
                pos,
                radius: r,
                maxDamage: d,
                owner: this,
                brokenCount: broken,
                weaponOverride: sp.weaponName || bullet.weaponLabel
              });
            }
          },
          this.onBroadcast
        );
      }

      if (this.onBroadcast) {
        this.onBroadcast({
          type: 'shoot',
          origin: bullet.tracerStart.toArray(),
          end: _stepImpactPt.toArray(),
          weapon: bullet.weaponLabel,
          weaponId: bullet.wepDef?.id || null,
          soundType: bullet.wepDef?.soundType || 'rifle',
          silenced: Boolean(bullet.wepDef?.silenced),
          isTracer: bullet.isBrightTracer
        });
      }
      return false;
    }

    // 7. Advance bullet position & update live 3D in-flight tracer streak / 3D arrow mesh
    bullet.pos.addScaledVector(_stepDir, stepDist);
    bullet.traveledDist += stepDist;

    if (bullet.arrowMesh) {
      const blend = Math.max(0, 1 - bullet.traveledDist / 14.0);
      _stepHeadPos.copy(bullet.pos).addScaledVector(bullet.muzzleOffset, blend);
      bullet.arrowMesh.position.copy(_stepHeadPos);
      _stepLookAt.copy(_stepHeadPos).add(_stepDir);
      bullet.arrowMesh.lookAt(_stepLookAt);
    }

    if (bullet.tracerLine) {
      const blend = Math.max(0, 1 - bullet.traveledDist / 14.0);
      _stepHeadPos.copy(bullet.pos).addScaledVector(bullet.muzzleOffset, blend);
      const streakLen = Math.min(
        bullet.traveledDist,
        bullet.isMountedMg ? 22.0 : 14.0
      );
      const tailBlend = Math.max(
        0,
        1 - Math.max(0, bullet.traveledDist - streakLen) / 14.0
      );
      _stepTailPos
        .copy(bullet.pos)
        .addScaledVector(_stepDir, -Math.max(0.45, streakLen))
        .addScaledVector(bullet.muzzleOffset, tailBlend);
      const posAttr = bullet.tracerLine.geometry.attributes.position;
      if (posAttr) {
        posAttr.setXYZ(0, _stepTailPos.x, _stepTailPos.y, _stepTailPos.z);
        posAttr.setXYZ(1, _stepHeadPos.x, _stepHeadPos.y, _stepHeadPos.z);
        posAttr.needsUpdate = true;
      }
    }

    return true;
  },

  /**
   * Computes the exact world-space position of the active weapon's 3D barrel muzzle (`muzzleFlash` mesh),
   * or right-hand weapon barrel offset in hipfire/ADS, so bullet trails originate from the gun barrel
   * instead of the center of the player's body.
   */
  getWeaponMuzzleWorldPosition(origin, dir, out = null) {
    const target = out || new THREE.Vector3();
    if (this.activeVehicle) {
      return target.copy(origin);
    }
    const cur = typeof this.currentWeapon === 'function' ? this.currentWeapon() : this.currentWeapon;
    if (cur && cur.mesh) {
      const flashObj = cur.mesh.getObjectByName('muzzleFlash');
      if (flashObj) {
        this.camera.updateMatrixWorld(true);
        flashObj.getWorldPosition(target);
        if (Number.isFinite(target.x)) {
          return target;
        }
      }
    }
    this.camera.getWorldQuaternion(_muzzleQuat);
    _muzzleRight.set(1, 0, 0).applyQuaternion(_muzzleQuat);
    _muzzleUp.set(0, 1, 0).applyQuaternion(_muzzleQuat);
    const lateralOffset = this.isAds ? 0.01 : 0.24;
    const verticalOffset = this.isAds ? -0.05 : -0.13;
    return target
      .copy(origin)
      .addScaledVector(_muzzleRight, lateralOffset)
      .addScaledVector(_muzzleUp, verticalOffset)
      .addScaledVector(dir, 0.85);
  },

  ejectBrassCasing() {
    if (!this.world) return;
    this.camera.getWorldPosition(_casingPos);
    this.camera.getWorldQuaternion(_muzzleQuat);
    _muzzleRight.set(0.18, -0.1, -0.25).applyQuaternion(_muzzleQuat);
    _casingPos.add(_muzzleRight);
    _casingVel.set(2.2 + Math.random(), 2.4 + Math.random(), 0.5).applyQuaternion(_muzzleQuat);

    if (typeof this.world.spawnCustomDebris === 'function') {
      this.world.spawnCustomDebris(
        _casingPos.x,
        _casingPos.y,
        _casingPos.z,
        _casingVel.x,
        _casingVel.y,
        _casingVel.z,
        14,
        18,
        12,
        0.018,
        0.018,
        0.045,
        0xf1c40f,
        0.75
      );
      return;
    }

    if (this.world.debrisParticles.length > 120) return;
    const mesh = new THREE.Mesh(_brassCasingGeo, _brassCasingMat);
    mesh.position.copy(_casingPos);
    this.scene.add(mesh);

    this.world.debrisParticles.push({
      mesh,
      vel: _casingVel.clone(),
      rotVel: new THREE.Vector3(14, 18, 12),
      life: 0.75
    });
  },

  launchRocket() {
    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(
      this.camera.getWorldQuaternion(_muzzleQuat)
    );

    const rocketMesh = new THREE.Mesh(_rpgRocketGeo, _rpgRocketMat);
    rocketMesh.position.copy(origin).addScaledVector(dir, 1.1);
    _stepLookAt.copy(origin).addScaledVector(dir, 10);
    rocketMesh.lookAt(_stepLookAt);
    this.scene.add(rocketMesh);

    this.world.projectiles.push({
      type: 'rpg',
      mesh: rocketMesh,
      vel: dir.multiplyScalar(PROJECTILES.RPG.speed),
      gravity: PROJECTILES.RPG.gravity,
      life: PROJECTILES.RPG.life,
      owner: this
    });
  },

  /**
   * Launches a FIM-92 Stinger / 9K38 Igla Surface-to-Air Homing Missile (MANPADS).
   * If locked onto an enemy aircraft or vehicle, uses proportional navigation homing;
   * otherwise fires along the sightline and automatically locks onto any enemy aircraft in front!
   */
  launchStingerMissile() {
    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(
      this.camera.getWorldQuaternion(new THREE.Quaternion())
    );

    let lockedTarget = this.stingerLockedTarget;
    if (!lockedTarget && this.vehicleManager && Array.isArray(this.vehicleManager.vehicles)) {
      let bestCos = 0.78;
      for (const v of this.vehicleManager.vehicles) {
        if (v.dead || v.team === this.team) continue;
        if (v.isAircraft) {
          if (!v.driver && !v.aiPilotActive) continue;
          const vGroundH = this.world ? this.world.getGroundHeightAt(v.pos.x, v.pos.z) : 0;
          const vAltAgl = Math.max(0, v.pos.y - vGroundH);
          // Low-altitude ground-effect clutter masking (< 28m AGL or < 4.0s post-takeoff) prevents Stinger lock-on!
          if (vAltAgl < 28.0 || (v.airborneRadarTimer || 0) < 4.0 || v.isLowAltRadarMasked) continue;
        }
        const toV = v.pos.clone().sub(origin);
        const dist = toV.length();
        const maxDist = v.isAircraft ? 1250 : 420;
        if (dist > maxDist || dist < 10) continue;
        toV.normalize();
        const cosA = dir.dot(toV);
        if (cosA > bestCos) {
          bestCos = cosA;
          lockedTarget = v;
        }
      }
    }

    const samMesh = new THREE.Mesh(_stingerSamGeo, _stingerSamMat);
    samMesh.position.copy(origin).addScaledVector(dir, 1.2);
    _stepLookAt.copy(origin).addScaledVector(dir, 12);
    samMesh.lookAt(_stepLookAt);
    this.scene.add(samMesh);

    const samCfg = PROJECTILES.STINGER_SAM || {
      speed: 265,
      gravity: 0,
      life: 6.5,
      turnRate: 5.2,
      blastRadius: 10.5,
      blastDamage: 560
    };

    this.world.projectiles.push({
      type: 'a2a_missile',
      isPitbullActiveSeeker: true,
      mesh: samMesh,
      vel: dir.multiplyScalar(samCfg.speed),
      gravity: samCfg.gravity,
      life: samCfg.life,
      turnRate: Math.max(6.8, samCfg.turnRate || 5.2),
      targetVehicle: lockedTarget || null,
      blastRadius: samCfg.blastRadius,
      blastDamage: samCfg.blastDamage,
      weaponName: this.team === 'RU' ? '9K38 IGLA AA SAM' : 'FIM-92 STINGER AA SAM',
      owner: this
    });

    if (typeof this.onActionPopup === 'function') {
      this.onActionPopup(
        lockedTarget
          ? `🚀 FIM-92 STINGER SAM LAUNCHED — IR LOCK ON ${lockedTarget.name}!`
          : '🚀 FIM-92 STINGER SAM LAUNCHED (ACTIVE SEEKER)'
      );
    }
  },

  /**
   * Updates the FIM-92 Stinger / 9K38 Igla Infrared Seeker Lock-On when the player holds the Stinger MANPADS.
   */
  updateStingerLockOn(dt) {
    const cur = this.currentWeapon ? this.currentWeapon() : null;
    if (!cur || !cur.def || cur.def.type !== 'stinger' || this.activeVehicle || this.dead || this.downed) {
      this.stingerLockedTarget = null;
      this.stingerTrackingTarget = null;
      this.stingerLockProgress = 0;
      return;
    }

    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(
      this.camera.getWorldQuaternion(new THREE.Quaternion())
    );

    let bestCandidate = null;
    let bestScore = 0.86; // ~30 deg seeker cone
    if (this.vehicleManager && Array.isArray(this.vehicleManager.vehicles)) {
      for (const v of this.vehicleManager.vehicles) {
        if (v.dead || v.team === this.team) continue;
        if (v.isAircraft) {
          if (!v.driver && !v.aiPilotActive) continue;
          const vGroundH = this.world ? this.world.getGroundHeightAt(v.pos.x, v.pos.z) : 0;
          const vAltAgl = Math.max(0, v.pos.y - vGroundH);
          // Low-altitude ground-effect clutter masking (< 28m AGL or < 4.0s post-takeoff) prevents Stinger lock-on!
          if (vAltAgl < 28.0 || (v.airborneRadarTimer || 0) < 4.0 || v.isLowAltRadarMasked) continue;
        }
        const toV = v.pos.clone().sub(origin);
        const dist = toV.length();
        const maxDist = v.isAircraft ? 1280 : 420;
        if (dist > maxDist || dist < 8) continue;
        toV.normalize();
        const cosA = dir.dot(toV);
        const score = cosA + (v.isAircraft ? 0.04 : 0);
        if (score > bestScore) {
          bestScore = score;
          bestCandidate = v;
        }
      }
    }

    if (bestCandidate) {
      if (this.stingerTrackingTarget === bestCandidate) {
        this.stingerLockProgress = Math.min(1.0, (this.stingerLockProgress || 0) + dt * 1.45);
      } else {
        this.stingerTrackingTarget = bestCandidate;
        this.stingerLockProgress = Math.min(1.0, dt * 1.45);
      }
      this.stingerLockedTarget = this.stingerLockProgress >= 0.85 ? bestCandidate : null;
    } else {
      this.stingerTrackingTarget = null;
      this.stingerLockedTarget = null;
      this.stingerLockProgress = Math.max(0, (this.stingerLockProgress || 0) - dt * 2.0);
    }
  },

  /**
   * Combined Anti-Armor / Anti-Air Engineer Specialist Toggle:
   * Swaps Slot 3 live between `RPG-7V2 HEAT (Anti-Armor)` and `FIM-92 Stinger / 9K38 Igla (Anti-Air SAM)`!
   */
  toggleEngineerLauncherMode() {
    if (!this.slots || !this.slots[2]) return false;
    const slot3 = this.slots[2];
    const curId = slot3.def?.id;
    if (curId !== 'rpg7' && curId !== 'stinger') return false;

    const targetId = curId === 'rpg7' ? 'stinger' : 'rpg7';
    const newDef = WEAPON_DEFS[targetId];
    if (!newDef) return false;

    const prevClip = slot3.clip;
    const prevReserve = slot3.reserve;
    if (slot3.mesh && this.viewModelGroup) {
      this.viewModelGroup.remove(slot3.mesh);
    }

    const custom = (this.weaponCustomizations && this.weaponCustomizations[targetId]) || {};
    const newMesh = createWeaponViewModel(newDef, this.team, custom);
    newMesh.visible = this.activeSlot === 2 && !this.activeVehicle;
    if (this.viewModelGroup) {
      this.viewModelGroup.add(newMesh);
    }

    slot3.def = { ...newDef };
    slot3.mesh = newMesh;
    slot3.clip = Math.min(newDef.clipSize, Math.max(1, prevClip));
    slot3.reserve = Math.min(newDef.reserveAmmo, Math.max(2, prevReserve));
    this.loadoutIds[2] = targetId;

    if (typeof this.onActionPopup === 'function') {
      this.onActionPopup(
        targetId === 'stinger'
          ? '🚀 SLOT [3] SWAPPED: FIM-92 STINGER AA MANPADS (IR LOCK-ON SURFACE-TO-AIR SAM)'
          : '🚀 SLOT [3] SWAPPED: RPG-7V2 HEAT LAUNCHER (85MM ANTI-ARMOR)'
      );
    }
    return true;
  },

  /**
   * Recon Sniper Specialist Slot [3] Toggle (`AN/PVS-21 LRF Binoculars` ⇄ `C4 Breach Charge`)
   * plus `[\]` Quick-Binoculars toggle!
   */
  toggleReconGadgetMode() {
    if (!this.slots || !this.slots[2]) return false;
    const slot3 = this.slots[2];
    const curId = slot3.def?.id;
    if (curId !== 'rangefinder_binos' && curId !== 'c4') return false;

    if (curId === 'c4') {
      this._savedReconC4Clip = slot3.clip;
      this._savedReconC4Reserve = slot3.reserve;
    }

    const targetId = curId === 'rangefinder_binos' ? 'c4' : 'rangefinder_binos';
    const newDef = WEAPON_DEFS[targetId];
    if (!newDef) return false;

    if (slot3.mesh && this.viewModelGroup) {
      this.viewModelGroup.remove(slot3.mesh);
    }
    const newMesh = createWeaponViewModel(newDef, this.team, {});
    if (this.currentSlotIndex === 2 && !this.activeVehicle && this.viewModelGroup) {
      newMesh.position.set(getWeaponHipOffsetX(newDef), -0.34, -0.26);
      this.viewModelGroup.add(newMesh);
    }

    slot3.def = { ...newDef };
    slot3.mesh = newMesh;
    if (targetId === 'c4') {
      slot3.clip = typeof this._savedReconC4Clip === 'number' ? this._savedReconC4Clip : newDef.clipSize;
      slot3.reserve = typeof this._savedReconC4Reserve === 'number' ? this._savedReconC4Reserve : newDef.reserveAmmo;
      this.isAds = false;
    } else {
      slot3.clip = 99;
      slot3.reserve = 99;
      this.opticZoomIndex = 0;
    }
    if (Array.isArray(this.loadoutIds)) {
      this.loadoutIds[2] = targetId;
    }
    sound.playWeaponSwitch?.();
    this.onAwardXp?.(
      0,
      targetId === 'rangefinder_binos'
        ? '🔭 SLOT [3] SWAPPED: AN/PVS-21 LRF BINOCULARS (HOLD RMB / [O] ZOOM • LMB LASER RANGE & AUTO-ZERO RIFLE!)'
        : '🧨 SLOT [3] SWAPPED: C4 BREACH CHARGE (PRESS [3] AGAIN FOR LRF BINOCULARS)'
    );
    return true;
  },

  toggleQuickBinoculars() {
    if (this.dead || this.downed || this.activeVehicle || !this.slots || !this.slots[2]) return false;
    const cur = this.currentWeapon?.();
    if (cur && cur.def?.id === 'rangefinder_binos') {
      this.isAds = false;
      this.switchSlot(0);
      return false;
    }
    if (this.role === 'recon') {
      if (this.slots[2].def?.id === 'c4') {
        this.toggleReconGadgetMode();
      }
      if (this.slots[2].def?.id === 'rangefinder_binos') {
        this.switchSlot(2);
        this.isAds = true;
        return true;
      }
    }
    return false;
  },

  /**
   * Samples instantaneous Laser Rangefinder telemetry along the camera sightline (up to 1,800m)
   * and computes exact drop/holdover/lead for the player's primary rifle (`slots[0]`).
   */
  sampleLaserRangefinder(maxRange = 2500) {
    if (!this.world || !this.camera) return null;
    this.camera.updateMatrixWorld(true);
    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();

    let bestDist = maxRange;
    let hitPoint = null;
    let targetUnit = null;
    let targetLabel = 'TERRAIN';
    let targetSpeedMps = 0;
    let isEnemy = false;

    // 1. Check voxel buildings / rooftops first to bound entity scan
    if (typeof this.world.raycastVoxel === 'function') {
      const vHit = this.world.raycastVoxel(origin, dir, maxRange);
      if (vHit && vHit.distance < bestDist && vHit.distance > 1.5) {
        bestDist = vHit.distance;
        hitPoint = vHit.point.clone();
        targetLabel = 'STRUCTURE / ROOF';
      }
    }

    // 2. Check terrain heightmap intersection if closer than voxel hit
    for (let d = 6; d < bestDist; d += d < 250 ? 4 : 12) {
      const px = origin.x + dir.x * d;
      const py = origin.y + dir.y * d;
      const pz = origin.z + dir.z * d;
      if (Math.abs(px) > 2500 || Math.abs(pz) > 1700) break;
      const ty = this.world.getGroundHeightAt(px, pz);
      if (py <= ty + 0.35) {
        bestDist = d;
        hitPoint = new THREE.Vector3(px, ty, pz);
        targetLabel = 'TERRAIN';
        break;
      }
    }

    // 3. Check enemy soldiers within sight cone (`perp <= 1.25m`) before `bestDist`
    if (this.botManager && Array.isArray(this.botManager.bots)) {
      for (let i = 0; i < this.botManager.bots.length; i++) {
        const b = this.botManager.bots[i];
        if (!b || b.dead || b.downed || b.team === this.team) continue;
        const vx = b.pos.x - origin.x;
        const vy = b.pos.y + 1.05 - origin.y;
        const vz = b.pos.z - origin.z;
        const proj = vx * dir.x + vy * dir.y + vz * dir.z;
        if (proj < 3 || proj > bestDist) continue;
        const perpSq = vx * vx + vy * vy + vz * vz - proj * proj;
        if (perpSq <= 1.35 * 1.35) {
          bestDist = proj;
          hitPoint = new THREE.Vector3(b.pos.x, b.pos.y + 1.1, b.pos.z);
          targetUnit = b;
          targetLabel = `ENEMY ${b.role || 'SOLDIER'}`;
          targetSpeedMps = b.drivingVehicle?.forwardSpeed || b.ridingVehicle?.forwardSpeed || b.lastHorizSpeed || 0;
          isEnemy = true;
        }
      }
    }

    // 4. Check enemy vehicles / helicopters
    if (this.vehicleManager && Array.isArray(this.vehicleManager.vehicles)) {
      for (let i = 0; i < this.vehicleManager.vehicles.length; i++) {
        const v = this.vehicleManager.vehicles[i];
        if (!v || v.dead || v === this.activeVehicle || v.team === this.team) continue;
        const vx = v.pos.x - origin.x;
        const vy = v.pos.y + 1.4 - origin.y;
        const vz = v.pos.z - origin.z;
        const proj = vx * dir.x + vy * dir.y + vz * dir.z;
        const hitR = v.isAircraft ? 5.5 : 3.4;
        if (proj < 5 || proj > bestDist) continue;
        const perpSq = vx * vx + vy * vy + vz * vz - proj * proj;
        if (perpSq <= hitR * hitR) {
          bestDist = proj;
          hitPoint = v.pos.clone().add(new THREE.Vector3(0, 1.4, 0));
          targetUnit = v;
          targetLabel = v.name ? v.name.split(' (')[0] : 'ENEMY VEHICLE';
          targetSpeedMps = Math.abs(v.forwardSpeed || 0);
          isEnemy = true;
        }
      }
    }

    if (!hitPoint) {
      hitPoint = origin.clone().addScaledVector(dir, bestDist);
    }

    const elevDeltaM = origin.y - hitPoint.y;
    const primaryWepDef = this.slots?.[0]?.def || this.currentWeapon?.()?.def || null;
    const solution = computeBallisticSolution(
      bestDist,
      elevDeltaM,
      targetSpeedMps,
      primaryWepDef,
      this.zeroDistance || 100
    );

    const readout = {
      hitPoint,
      distM: solution.distanceM,
      elevDeltaM: Math.round(elevDeltaM),
      targetUnit,
      targetLabel,
      targetSpeedMps: Number(targetSpeedMps.toFixed(1)),
      isEnemy,
      rifleName: primaryWepDef?.shortName || 'RIFLE',
      solution
    };
    this.liveLrfReadout = readout;
    return readout;
  },

  /**
   * Fires an active Laser Rangefinder & ◆1688 JTAC Laser Designator pulse (`LMB` in Binoculars or `[F]` while Scoped in ADS):
   * - Auto-zeros the player's rifle to the exact ballistic distance (`this.zeroDistance = recommendedZeroM`)
   * - Registers a 25-second `◆ LASER 1688` Moving-Target Designation (`world.activeLaserDesignations[team]`)
   *   so `[J]` calls a Moving-Target Laser-Guided GBU/Maverick Strike AND friendly Aircraft lock on from 2,500m!
   */
  fireLaserRangefinder(autoZeroRifle = true) {
    const lrf = this.sampleLaserRangefinder(2500);
    if (!lrf) return null;

    if (autoZeroRifle) {
      this.zeroDistance = lrf.solution.recommendedZeroM;
      this.isExactLrfZero = true;
    }

    const curWep = this.currentWeapon?.();
    const canLaserDesignate = Boolean(
      this.role === 'recon' ||
        curWep?.def?.type === 'binoculars' ||
        curWep?.def?.hasRaptarLrf ||
        curWep?.def?.opticType === 'raptor13x'
    );

    let laserPainted = false;
    if (canLaserDesignate && this.world) {
      if (!this.world.activeLaserDesignations) {
        this.world.activeLaserDesignations = {};
      }
      const isVehTarget = Boolean(lrf.targetUnit && lrf.targetUnit.maxHp && !lrf.targetUnit.role);
      const isBotTarget = Boolean(lrf.targetUnit && lrf.targetUnit.role);
      if (isVehTarget) {
        lrf.targetUnit.jtacLaserTimer = 25.0;
        lrf.targetUnit.jtacLaserOwner = this;
        lrf.targetUnit.uavRevealed = true;
      } else if (isBotTarget) {
        lrf.targetUnit.spottedTimer = Math.max(lrf.targetUnit.spottedTimer || 0, 25.0);
        lrf.targetUnit.jtacLaserPainted = true;
      }
      this.world.activeLaserDesignations[this.team || 'US'] = {
        pos: lrf.hitPoint.clone(),
        targetUnit: lrf.isEnemy ? lrf.targetUnit : null,
        targetVehicle: isVehTarget ? lrf.targetUnit : null,
        targetBot: isBotTarget ? lrf.targetUnit : null,
        label: lrf.targetLabel,
        distM: Math.round(lrf.distM),
        isEnemy: Boolean(lrf.isEnemy),
        code: 1688,
        timer: 25.0,
        maxTimer: 25.0,
        owner: this,
        ownerName: this.name || 'SNIPER JTAC'
      };
      laserPainted = true;
    }

    this.activePing = {
      pos: lrf.hitPoint.clone().add(new THREE.Vector3(0, 0.8, 0)),
      timer: laserPainted ? 25.0 : 14.0,
      isEnemy: lrf.isEnemy,
      isJtac: laserPainted,
      targetUnit: lrf.isEnemy ? lrf.targetUnit : null,
      label: laserPainted
        ? `◆ LASER 1688: ${lrf.targetLabel} (${Math.round(lrf.distM)}M)`
        : lrf.isEnemy
        ? `🎯 ${lrf.targetLabel} (${Math.round(lrf.distM)}M)`
        : `📡 LRF ${Math.round(lrf.distM)}M`
    };

    if (!this.marksmanProfile) {
      this.marksmanProfile = loadMarksmanProfile();
    }
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    let spotXp = 0;
    if (lrf.isEnemy && lrf.targetUnit && nowMs > (lrf.targetUnit._lrfSpottedUntil || 0)) {
      lrf.targetUnit._lrfSpottedUntil = nowMs + 15000;
      this.marksmanProfile.lrfSpots = (this.marksmanProfile.lrfSpots || 0) + 1;
      spotXp = laserPainted ? 35 : 15;
      this.score = (this.score || 0) + spotXp;
    } else if (!lrf.isEnemy && lrf.distM >= 80) {
      this.marksmanProfile.lrfSpots = (this.marksmanProfile.lrfSpots || 0) + 1;
    }
    const unlockedTitle = syncActiveMarksmanTitle(this.marksmanProfile);
    saveMarksmanProfile(this.marksmanProfile);

    sound.playLaserRangefinderLock?.();
    const leadNote =
      lrf.targetSpeedMps >= 1.6 ? ` • LEAD ${lrf.solution.leadMeters.toFixed(1)}M` : '';
    const zeroNote = autoZeroRifle ? ` • ${lrf.rifleName} ZEROED TO ${this.zeroDistance}M` : '';
    const laserStrikeHint = laserPainted ? ' • [J] LASER GBU STRIKE / BUDDY-LASE ACTIVE (25S)!' : '!';
    this.onAwardXp?.(
      spotXp,
      `${laserPainted ? '◆ LASER 1688 PAINTED' : '📡 LRF LOCKED'}: ${Math.round(lrf.distM)}M (${lrf.targetLabel} • DROP ${lrf.solution.rawGravityDropM.toFixed(2)}M${leadNote})${zeroNote}${laserStrikeHint}`
    );
    if (unlockedTitle && this.onKillStreakAnnouncement) {
      this.onKillStreakAnnouncement(
        `🏅 TITLE EARNED: 「${unlockedTitle.icon} ${unlockedTitle.title}」!`
      );
    }
    return lrf;
  },

  throwFragGrenade() {
    if (this.grenades <= 0) return;
    this.grenades--;
    sound.playGrenadeThrow?.(0, 0);

    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0.22, -1)
      .normalize()
      .applyQuaternion(this.camera.getWorldQuaternion(new THREE.Quaternion()));

    const grenMesh = new THREE.Mesh(_fragGrenadeGeo, _fragGrenadeMat);
    grenMesh.position.copy(origin).addScaledVector(dir, 0.9);
    this.scene.add(grenMesh);

    this.world.projectiles.push({
      type: 'grenade',
      mesh: grenMesh,
      vel: dir.multiplyScalar(PROJECTILES.GRENADE.speed),
      gravity: PROJECTILES.GRENADE.gravity,
      life: PROJECTILES.GRENADE.life, // 2.6-second fuse
      owner: this
    });
  },

  throwC4() {
    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0.16, -1)
      .normalize()
      .applyQuaternion(this.camera.getWorldQuaternion(_muzzleQuat));

    const c4Mesh = new THREE.Mesh(_c4Geo, _c4Mat);
    c4Mesh.position.copy(origin).addScaledVector(dir, 0.9);
    this.scene.add(c4Mesh);

    const proj = {
      type: 'c4',
      mesh: c4Mesh,
      vel: dir.multiplyScalar(PROJECTILES.C4.speed),
      gravity: PROJECTILES.C4.gravity,
      life: PROJECTILES.C4.life,
      owner: this
    };
    this.world.projectiles.push(proj);
    this.plantedC4.push(proj);
  },

  detonateC4() {
    if (this.plantedC4.length === 0) return;
    sound.playExplosion(0);
    this.addShake(0.6);
    for (const c4 of this.plantedC4) {
      const idx = this.world.projectiles.indexOf(c4);
      if (idx !== -1) {
        const pos = c4.mesh.position.clone();
        this.world.explodeAt(
          pos,
          PROJECTILES.C4_BLAST_RADIUS,
          PROJECTILES.C4_BLAST_DAMAGE,
          (blastPos, rad, dmg, broken) => {
            if (this.onExplosionDamage) this.onExplosionDamage(blastPos, rad, dmg, this, broken);
          },
          this.onBroadcast
        );
        this.scene.remove(c4.mesh);
        this.world.projectiles.splice(idx, 1);
      }
    }
    this.plantedC4 = [];
  },

  // Squad-style suppression: call this when bullets land near the player (within ~4m)
  applySuppression(intensity = 0.25) {
    // Entrenched defenders (-50%) & Squad Cohesion Members (-35%) resist incoming suppression!
    let effIntensity = this.inFriendlyForwardBase ? intensity * 0.5 : intensity;
    if (this.inSquadCohesion) {
      effIntensity *= 0.65;
    }
    this.suppressionLevel = Math.min(1.0, this.suppressionLevel + effIntensity);
    this.lastSuppressionHitTime = performance.now();
  },

  // Register a kill for streak/multi-kill tracking
  registerKill(victimName) {
    this.killStreak++;
    this.multiKillCount++;
    this.multiKillTimer = PLAYER.MULTI_KILL_TIMER; // 3.5s window for multi-kills

    // Announce multi-kills
    let announcement = null;
    if (this.multiKillCount === 2) announcement = 'DOUBLE KILL';
    else if (this.multiKillCount === 3) announcement = 'TRIPLE KILL';
    else if (this.multiKillCount === 4) announcement = 'QUAD KILL';
    else if (this.multiKillCount >= 5) announcement = 'RAMPAGE';

    // Announce kill streaks
    let streakAnnouncement = null;
    if (this.killStreak === 5) streakAnnouncement = 'KILLING SPREE (5)';
    else if (this.killStreak === 10) streakAnnouncement = 'UNSTOPPABLE (10)';
    else if (this.killStreak === 15) streakAnnouncement = 'GODLIKE (15)';
    else if (this.killStreak === 20) streakAnnouncement = 'LEGENDARY (20)';

    if (this.botManager && this.botManager.notifyPlayerKill) {
      this.botManager.notifyPlayerKill(this, victimName);
    }

    return { announcement, streakAnnouncement, streak: this.killStreak, multiKill: this.multiKillCount };
  },

  // Register a War Crime when eliminating a Field Medic (especially while rescuing!)
  registerMedicWarCrime(medicName, wasRescuing = false) {
    this.medicKills = (this.medicKills || 0) + 1;
    if (this.onAwardXp) {
      this.onAwardXp(
        0,
        wasRescuing
          ? `⚠️ WAR CRIME! KILLED MEDIC DURING RESCUE (${medicName} • #${this.medicKills})`
          : `⚠️ WAR CRIME: FIELD MEDIC ELIMINATED (${medicName} • #${this.medicKills})`
      );
    }
    if (this.onKillStreakAnnouncement && (wasRescuing || this.medicKills === 1 || this.medicKills % 3 === 0)) {
      this.onKillStreakAnnouncement(
        wasRescuing
          ? '⚠️ GENEVA VIOLATION: KILLED MEDIC ON RESCUE!'
          : `⚠️ WAR CRIME #${this.medicKills}: MEDIC ELIMINATED`
      );
    }
    if (this.botManager && this.botManager.notifyWarCrime) {
      this.botManager.notifyWarCrime(this, medicName, wasRescuing, this.medicKills);
    }
    if (this.onWarCrimeCommitted) {
      this.onWarCrimeCommitted(medicName, wasRescuing, this.medicKills);
    } else {
      events.emit('warcrime:committed', {
        medicName,
        wasRescuing,
        totalCount: this.medicKills
      });
    }
  },

  useMeleeSword(def) {
    const isHeavySwing = Boolean(def.isTwoHandedSword || def.isPolearm || def.isTwoHandedShield);
    if (typeof sound.playMeleeSwing === 'function') {
      sound.playMeleeSwing(0, 0, isHeavySwing);
    } else {
      sound.playWeaponSwitch?.();
    }
    this.swordSlung = false;

    // Determine Mount & Blade 4-Directional Sword / Polearm / Shield Attack from Mouse/WASD Guard Direction!
    // - Holding RMB with 1H Sword & Shield (`def.id === 'longsword'`) executes a Shield Bash + Under-Rim Riposte Thrust!
    // - 2H Large Shield (`def.isTwoHandedShield`) performs a heavy forward Shield Bash Slam (with knockback + stagger)
    // - Polearm (`def.isPolearm`) defaults to long 'THRUST_LUNGE' unless guard direction is 'UP' ('OVERHEAD_CLEAVE')
    // - Zweihänder & 1H Sword follow `this.meleeGuardDir` ('UP' -> OVERHEAD_CLEAVE, 'DOWN' -> THRUST_LUNGE,
    //   'LEFT' -> LEFT_SWEEP, 'RIGHT' -> RIGHT_SLASH), or chain a fluid 4-direction combo if no recent direction input!
    let swingType = 'RIGHT_SLASH';
    let facingSector = 'RIGHT';
    const hasRecentDir = performance.now() - (this._meleeDirInputTime || 0) < 900;
    const comboDirs = ['RIGHT', 'LEFT', 'UP', 'DOWN'];
    const activeDir = hasRecentDir
      ? this.meleeGuardDir || 'RIGHT'
      : this.keys?.['KeyA']
      ? 'LEFT'
      : this.keys?.['KeyD']
      ? 'RIGHT'
      : (this.pitch || 0) > 0.18
      ? 'UP'
      : (this.pitch || 0) < -0.18
      ? 'DOWN'
      : comboDirs[(this.swordAttackCount || 0) % comboDirs.length];
    this.meleeGuardDir = activeDir;

    if (def.isTwoHandedShield) {
      swingType = 'THRUST_LUNGE';
      facingSector = 'SHIELD_BASH';
    } else if (this.isAds && def.id === 'longsword') {
      swingType = 'SHIELD_BASH_RIPOSTE';
      facingSector = 'SHIELD_RIPOSTE';
    } else if (def.isPolearm) {
      if (activeDir === 'UP' || (this.pitch || 0) > 0.2) {
        swingType = 'OVERHEAD_CLEAVE';
        facingSector = 'HALBERD_CHOP';
      } else {
        swingType = 'THRUST_LUNGE';
        facingSector = 'SPEAR_THRUST';
      }
    } else if (activeDir === 'UP') {
      swingType = 'OVERHEAD_CLEAVE';
      facingSector = 'UP';
    } else if (activeDir === 'DOWN') {
      swingType = 'THRUST_LUNGE';
      facingSector = 'DOWN';
    } else if (activeDir === 'LEFT') {
      swingType = 'LEFT_SWEEP';
      facingSector = 'LEFT';
    } else {
      swingType = 'RIGHT_SLASH';
      facingSector = 'RIGHT';
    }

    this.swordSwingType = swingType;
    this.swordFacingSector = facingSector;
    const swingDur = def.isTwoHandedSword ? 0.56 : def.isPolearm ? 0.48 : 0.42;
    this.swordSwingDuration = swingDur;
    this.swordSwingTimer = swingDur;
    this.swordAttackCount = (this.swordAttackCount || 0) + 1;

    if (swingType === 'OVERHEAD_CLEAVE') {
      this.recoilKickZ = -0.22;
      this.recoilOffsetPitch = -0.24;
    } else if (swingType === 'THRUST_LUNGE') {
      this.recoilKickZ = def.isPolearm ? -0.42 : -0.32;
      this.recoilOffsetPitch = 0.04;
    } else if (swingType === 'LEFT_SWEEP') {
      this.recoilKickZ = -0.18;
      this.recoilOffsetPitch = -0.06;
      this.swayX = -0.1;
    } else {
      this.recoilKickZ = -0.18;
      this.recoilOffsetPitch = -0.08;
      this.swayX = 0.1;
    }
    this.addShake(isHeavySwing ? 0.2 : 0.14);

    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
      this.camera.getWorldQuaternion(new THREE.Quaternion())
    );
    const baseReach = def.meleeRange || 4.4;
    const reach = swingType === 'THRUST_LUNGE' ? baseReach + 1.2 : baseReach;
    const baseDmg = def.damage || 115;
    const dmg = swingType === 'OVERHEAD_CLEAVE' ? Math.round(baseDmg * 1.2) : baseDmg;
    const arcMinDot =
      def.isTwoHandedSword && (swingType === 'LEFT_SWEEP' || swingType === 'RIGHT_SLASH')
        ? 0.15
        : swingType === 'LEFT_SWEEP' || swingType === 'RIGHT_SLASH'
        ? 0.28
        : 0.42;
    const maxTargets = def.maxCleaveTargets || (def.isTwoHandedSword ? 3 : 1);

    let hitCount = 0;
    const reachSq = reach * reach;
    const processMeleeBot = (bot) => {
      if (hitCount >= maxTargets) return false;
      if (!bot || bot.dead || bot.downed || bot.team === this.team) return;
      const tbx = bot.pos.x - origin.x;
      const tby = bot.pos.y + 0.9 - origin.y;
      const tbz = bot.pos.z - origin.z;
      const distSq = tbx * tbx + tby * tby + tbz * tbz;
      if (distSq <= reachSq) {
        const dist = Math.sqrt(distSq) || 0.001;
        const dot = (forward.x * tbx + forward.y * tby + forward.z * tbz) / dist;
        if (dot >= arcMinDot || dist <= 2.2) {
          const isHs = tby > 0.35 || swingType === 'OVERHEAD_CLEAVE';
          const antiCavMult = def.isPolearm && bot.isMountedKnight ? 1.85 : 1.0;
          const finalDmg = Math.round(dmg * antiCavMult * (isHs ? def.headshotMult || 1.5 : 1));
          const res = this.botManager.damageBot(
            bot,
            finalDmg,
            this.name,
            this.team,
            def.shortName || 'BROADSWORD',
            isHs,
            this.onKillEvent,
            this.onAwardXp
          );
          if ((def.isTwoHandedShield || swingType === 'SHIELD_BASH_RIPOSTE') && !bot.dead) {
            const kbDist = def.isTwoHandedShield ? 3.1 : 2.2;
            bot.pos.x += forward.x * kbDist;
            bot.pos.z += forward.z * kbDist;
            bot.pos.y = this.world.getGroundHeightAt(bot.pos.x, bot.pos.z);
            bot.flinchTimer = 0.65;
            bot.shootCooldown = Math.max(bot.shootCooldown || 0, 1.25);
            sound.playShieldBlock?.(false, 0, 0);
          }
          hitCount++;
          _stepLookAt.set(bot.pos.x, bot.pos.y + 1.1, bot.pos.z);
          this.world.spawnDebris(_stepLookAt, _hitBodyColor, 5);
          sound.playHitmarker(res?.killed ? 'kill' : 'normal');
          if (this.onHitmarker) {
            const actionLbl = def.isTwoHandedShield
              ? '🛡️ SHIELD BASH'
              : def.isPolearm
              ? '🔱 SPEAR THRUST'
              : def.isTwoHandedSword && hitCount > 1
              ? `🗡️ 2H MULTI-CLEAVE x${hitCount}`
              : `⚔️ ${swingType.replace('_', ' ')}`;
            this.onHitmarker(
              res?.killed ? 'kill' : 'normal',
              res?.killed ? `${actionLbl}! (${bot.name})` : `${actionLbl} -${finalDmg}`
            );
          }
          if (res?.killed) {
            this.kills++;
            const pts = this.inSquadCohesion
              ? Math.round(COMBAT.KILL_XP_NORMAL * 1.25)
              : COMBAT.KILL_XP_NORMAL;
            this.score += pts;
            this.registerKill(bot.name);
          }
        }
      }
    };

    if (this.botManager) {
      if (this.botManager.spatialGrid && this.botManager.spatialGrid.count > 0) {
        this.botManager.spatialGrid.forEachInRadius(origin.x, origin.z, reach + 1.0, processMeleeBot);
      } else if (Array.isArray(this.botManager.bots)) {
        for (let i = 0; i < this.botManager.bots.length; i++) {
          if (processMeleeBot(this.botManager.bots[i]) === false) break;
        }
      }
    }

    // Polearms & Greatswords can also strike enemy Warhorses / Siege Engines in melee range!
    if (hitCount === 0 && this.vehicleManager && Array.isArray(this.vehicleManager.vehicles)) {
      for (const veh of this.vehicleManager.vehicles) {
        if (!veh || veh.dead || veh.team === this.team || veh === this.activeVehicle) continue;
        const dVeh = veh.pos.distanceTo(origin);
        if (dVeh <= reach + 1.5) {
          const antiMountDmg =
            def.isPolearm && veh.type === 'warhorse'
              ? 240
              : def.voxelDamage || 65;
          this.vehicleManager.damageVehicle(
            veh,
            antiMountDmg,
            this.name,
            this.team,
            def.shortName || 'POLEARM',
            this.onKillEvent,
            this.onAwardXp
          );
          sound.playHitmarker('armor');
          hitCount++;
          break;
        }
      }
    }

    if (hitCount === 0) {
      const vHit = this.world.raycastVoxel(origin, forward, reach);
      if (vHit && vHit.voxel) {
        this.world.damageVoxel(
          vHit.voxel.gx,
          vHit.voxel.gy,
          vHit.voxel.gz,
          def.voxelDamage || 55,
          this.onBroadcast
        );
        this.world.spawnBulletImpact(vHit.point, vHit.normal, vHit.voxel.baseColor);
      }
    }
  },

  takeDamage(
    amount,
    attackerName,
    attackerTeam,
    weaponName,
    onKillFn,
    attackerPos = null,
    isHeadshot = false,
    blastMeta = null
  ) {
    if (this.dead || this.downed) return;
    this.outOfCombatTimer = 0;
    if (
      isHeadshot &&
      typeof this.headshotTakenMult === 'number' &&
      this.headshotTakenMult > 0 &&
      this.headshotTakenMult !== 1
    ) {
      amount = Math.max(1, Math.round(amount * this.headshotTakenMult));
    }

    // Mount & Blade Shield Wall, Passive Off-Hand Shield Coverage & Directional Chamber Parry Mechanics:
    // 1. Directional Frontal Arc Check: Shields & Parries protect your frontal/flank arc (dot >= -0.25)!
    // 2. Passive Shield Coverage (Even while walking/swinging without holding RMB!):
    //    - 2H Large Pavise Shield (`tower_shield_2h`): Passively blocks 35% of frontal arrows/bolts & melee!
    //    - 1H Sword & Heater Shield (`longsword`): Off-hand Heater Shield passively blocks 30% of frontal arrows & melee!
    // 3. Active Raised Shield / Directional Parry (`Hold RMB` / `this.isAds`):
    //    - 2H Large Pavise Shield (`tower_shield_2h`): Blocks 92% of all frontal arrows, bolts & melee!
    //    - 1H Sword & 1H Heater Shield (`longsword`): Blocks 75% of all frontal arrows, bolts & melee!
    //    - Knight Polearm / Long Spear (`knight_lance`): Couched Spear Brace blocks 65% melee/cavalry & 30% arrows!
    //    - 2H Double-Handed Greatsword (`greatsword_2h`): Crossguard & Ricasso Parry blocks 60% melee & 25% arrows!
    const curWep = this.currentWeapon ? this.currentWeapon() : null;
    if (
      (!this.activeVehicle || this.activeVehicle.type === 'warhorse') &&
      curWep &&
      curWep.def &&
      curWep.def.type === 'melee_sword' &&
      weaponName !== 'BLEED'
    ) {
      let inFrontalGuardArc = true;
      if (attackerPos) {
        const toAttX = attackerPos.x - this.pos.x;
        const toAttZ = attackerPos.z - this.pos.z;
        const len = Math.hypot(toAttX, toAttZ) || 1;
        const lookX = -Math.sin(this.yaw || 0);
        const lookZ = -Math.cos(this.yaw || 0);
        const dot = (toAttX * lookX + toAttZ * lookZ) / len;
        inFrontalGuardArc = dot >= (curWep.def.isTwoHandedShield ? -0.35 : -0.22);
      }

      if (inFrontalGuardArc) {
        const wDef = curWep.def;
        const isRangedArrowOrBolt =
          String(weaponName || '').includes('BOW') ||
          String(weaponName || '').includes('CROSSBOW') ||
          String(weaponName || '').includes('QUARREL') ||
          String(weaponName || '').includes('ARROW');
        let blockRatio = 0;
        let blockLabel = '';
        let isSwordParry = false;

        if (this.isAds) {
          if (wDef.isTwoHandedShield) {
            blockRatio = 0.92;
            blockLabel = '🛡️ PAVISE SHIELD WALL (-92%)';
          } else if (wDef.id === 'longsword') {
            blockRatio = 0.75;
            blockLabel = '🛡️ HEATER SHIELD BLOCK (-75%)';
          } else if (wDef.isPolearm) {
            blockRatio = isRangedArrowOrBolt ? 0.30 : 0.65;
            blockLabel = '🔱 POLEARM BRACE PARRY (-65%)';
            isSwordParry = true;
          } else if (wDef.isTwoHandedSword) {
            blockRatio = isRangedArrowOrBolt ? 0.25 : 0.60;
            blockLabel = `⚔️ ZWEIHÄNDER ${this.meleeGuardDir || 'CROSS'} PARRY (-${Math.round(blockRatio * 100)}%)`;
            isSwordParry = true;
          }
        } else {
          // Passive Off-Hand Shield Protection while moving or swinging!
          if (wDef.isTwoHandedShield) {
            blockRatio = 0.35;
            blockLabel = '🛡️ PAVISE PASSIVE COVER (-35%)';
          } else if (wDef.id === 'longsword') {
            blockRatio = 0.30;
            blockLabel = '🛡️ OFF-HAND SHIELD DEFLECT (-30%)';
          }
        }

        if (blockRatio > 0) {
          amount = Math.max(1, Math.round(amount * (1 - blockRatio)));
          this.shieldBlockKick = this.isAds ? 0.16 : 0.08;
          if (typeof sound.playShieldBlock === 'function') {
            sound.playShieldBlock(isSwordParry, 0, 0);
          } else {
            sound.playHitmarker?.('armor');
          }
          if (this.onHitmarker && this.isAds) {
            this.onHitmarker('armor', blockLabel);
          }
        }
      }
    }

    // While inside an enclosed Tank, APC, or Armored Car, the armored hull protects the crew's personal HP!
    // NOTE: On an open-saddle Warhorse (`type === 'warhorse'`), the Rider and the Horse have SEPARATE
    // health and armor — so the rider CAN take personal damage and die on horseback while the horse survives!
    if (this.activeVehicle && !this.activeVehicle.dead && this.activeVehicle.type !== 'warhorse') {
      this.notifyVehicleHit(0, attackerName, weaponName || 'SMALL ARMS DEFLECTED', attackerPos);
      return;
    }

    // Taking direct hits always triggers suppression
    this.applySuppression(Math.min(COMBAT.SUPPRESSION_MAX_INTENSITY, amount * COMBAT.SUPPRESSION_INTENSITY_PER_DMG));

    // Real-life & Tactical Shooter Entrenched Forward Base Defender Advantage:
    // Fighting from prepared sandbag parapets, defilade, and built Point Defenses inside a Friendly Forward Base
    // reduces incoming ballistic & explosive damage by 25% to 40% (based on Defense Stage 0-4)!
    if (this.inFriendlyForwardBase && weaponName !== 'BLEED') {
      const defStage = Math.min(4, this.defendedFlagStage || 0);
      const dmgReduction = Math.min(0.42, 0.25 + defStage * 0.04);
      amount = Math.max(1, Math.round(amount * (1 - dmgReduction)));
    }

    // Determine Anatomical Hit Zone (`head`, `thorax`, `leftArm`, `rightArm`, `leftLeg`, `rightLeg`)
    if (!this.limbHealth) {
      this.limbHealth = {
        head: 100,
        thorax: 100,
        leftArm: 100,
        rightArm: 100,
        leftLeg: 100,
        rightLeg: 100
      };
    }
    let hitZone = blastMeta?.hitZone || null;
    if (!hitZone) {
      if (isHeadshot) {
        hitZone = 'head';
      } else if (weaponName === 'FALL DAMAGE' || String(weaponName || '').includes('GROUND IMPACT')) {
        hitZone = Math.random() < 0.5 ? 'leftLeg' : 'rightLeg';
      } else if (weaponName === 'BLEED') {
        hitZone = 'thorax';
      } else {
        const zRoll = typeof blastMeta?.zoneRoll === 'number' ? blastMeta.zoneRoll : Math.random();
        if (zRoll < 0.52) hitZone = 'thorax';
        else if (zRoll < 0.64) hitZone = 'leftArm';
        else if (zRoll < 0.76) hitZone = 'rightArm';
        else if (zRoll < 0.88) hitZone = 'leftLeg';
        else hitZone = 'rightLeg';
      }
    }

    // Body armor plate protects the THORAX (35%–55% absorption); unarmored arms, legs & head bypass chest plates!
    if (this.armor > 0 && weaponName !== 'BLEED' && hitZone === 'thorax') {
      const ratio = this.armorAbsorbRatio || PLAYER.ARMOR_ABSORB_RATIO;
      const absorbed = Math.min(this.armor, Math.round(amount * ratio));
      this.armor -= absorbed;
      amount -= absorbed;
    }

    // Apply Localized Limb Trauma & Fracture Thresholds (<= 30% limb integrity triggers Fracture!)
    if (weaponName !== 'BLEED' && this.limbHealth[hitZone] !== undefined) {
      const limbMult = hitZone === 'head' ? 1.35 : hitZone === 'thorax' ? 1.0 : 1.45;
      this.limbHealth[hitZone] = Math.max(
        0,
        Math.round(this.limbHealth[hitZone] - amount * limbMult)
      );
      if ((hitZone === 'leftArm' || hitZone === 'rightArm') && this.limbHealth[hitZone] <= 30) {
        this.armFractured = true;
      } else if ((hitZone === 'leftLeg' || hitZone === 'rightLeg') && this.limbHealth[hitZone] <= 30) {
        this.legFractured = true;
      }
    }

    this.hp -= amount;
    if (amount >= PLAYER.BLEED_CHANCE_THRESHOLD && Math.random() < PLAYER.BLEED_CHANCE) {
      this.bleeding = true;
    }

    if (this.onDamageTaken) {
      this.onDamageTaken(amount, attackerPos, false, weaponName, attackerName);
    } else {
      events.emit('player:damaged', {
        amount,
        sourcePos: attackerPos,
        inVehicle: false,
        weaponName,
        attackerName
      });
    }

    if (this.hp <= 0) {
      const overkillAmt = Math.max(0, -this.hp);
      const isFatalHs = Boolean(isHeadshot || hitZone === 'head');
      this.hp = 0;
      this.isFiring = false;
      this.isAds = false;
      this.reloading = false;
      if (this.activeVehicle) {
        const exitedVehicle = this.activeVehicle;
        this.activeVehicle.driver = null;
        this.activeVehicle = null;
        events.emit('player:exited-vehicle', { vehicle: exitedVehicle, reason: 'downed' });
      }

      if (onKillFn) {
        onKillFn(attackerName, attackerTeam, this.name, this.team, weaponName, isFatalHs);
      } else {
        events.emit('kill:event', {
          killer: attackerName,
          kTeam: attackerTeam,
          victim: this.name,
          vTeam: this.team,
          weapon: weaponName,
          isHs: isFatalHs
        });
      }

      events.emit('player:killed', {
        killerName: attackerName,
        killerTeam: attackerTeam,
        weaponName,
        pos: this.pos.clone()
      });

      // Evaluate Catastrophic "Dead-Dead" / Fatal Headshot / Explosive Overpressure (Beyond Medic Rescue):
      const cat = evaluateCatastrophicKill(
        weaponName,
        blastMeta?.dist ?? 0,
        blastMeta?.radius ?? 0,
        blastMeta?.rng || Math.random,
        {
          hitZone,
          isHeadshot: isFatalHs,
          rawDamage: amount,
          finalDamage: amount,
          overkill: overkillAmt
        }
      );
      this.beyondRescue = Boolean(cat.beyondRescue);
      if (this.beyondRescue && this.vel) {
        const bOrig = blastMeta?.origin || attackerPos;
        if (bOrig) {
          const kdx = this.pos.x - bOrig.x;
          const kdz = this.pos.z - bOrig.z;
          const klen = Math.hypot(kdx, kdz) || 1;
          this.vel.x = (kdx / klen) * Math.min(14, cat.hSpeed || 8);
          this.vel.z = (kdz / klen) * Math.min(14, cat.hSpeed || 8);
          this.vel.y = Math.min(8, cat.upSpeed || 5);
        }
      }

      // Build Forensic Death Report (used ONLY when Optional Death Cam is toggled ON)
      this._buildDeathReport({
        amount,
        attackerName,
        attackerTeam,
        weaponName,
        attackerPos: attackerPos || blastMeta?.origin || null,
        isHeadshot: Boolean(isHeadshot || hitZone === 'head'),
        hitZone
      });

      // Enter Downed State (2.6s un-revivable blast aftermath if Beyond Rescue, else 120s Medic window)
      this.downed = true;
      this.downedTimer = this.beyondRescue ? 2.6 : PLAYER.DOWNED_TIMER;
      this.giveUpProgress = 0;
      this.downedKiller = attackerName;
      this.downedWeapon = weaponName;
      this.viewModelGroup.visible = false;
      this._deathCamBlend = 0;
      this._deathCamAge = 0;
      this.deathCamMode = 'ZOOM';
      if (this.deathCamEnabled && this.lastDeathReport?.hasKillerOrigin) {
        this.syncDeathCamVisuals(true);
      } else {
        this.clearDeathCamVisuals();
      }
    }
  },

  _resolveKillerEntity(attackerName, attackerTeam, attackerPos) {
    const cleanName = String(attackerName || '').trim();
    if (
      !cleanName ||
      cleanName === this.name ||
      cleanName === 'ENVIRONMENT' ||
      cleanName === 'OUT OF BOUNDS' ||
      cleanName === 'DROWNED'
    ) {
      return {
        unit: null,
        vehicle: null,
        kind: 'self',
        roleLabel: 'SELF / ENVIRONMENT',
        hp: 0,
        maxHp: 100,
        livePos: null
      };
    }

    // 1. Check Vehicles first (direct vehicle attribution or bot/player driver matching attackerName)
    let matchedVehicle = null;
    if (this.vehicleManager && Array.isArray(this.vehicleManager.vehicles)) {
      for (const v of this.vehicleManager.vehicles) {
        if (!v) continue;
        if (v.name === cleanName || (v.driver && v.driver.name === cleanName)) {
          matchedVehicle = v;
          if (!v.dead) break;
        }
      }
    }

    // 2. Check AI Bots
    let matchedBot = null;
    if (this.botManager && Array.isArray(this.botManager.bots)) {
      let bestDistSq = Infinity;
      for (const b of this.botManager.bots) {
        if (!b || b.name !== cleanName) continue;
        if (attackerTeam && b.team && b.team !== attackerTeam) continue;
        const dSq =
          attackerPos && b.pos
            ? (b.pos.x - attackerPos.x) * (b.pos.x - attackerPos.x) +
              (b.pos.z - attackerPos.z) * (b.pos.z - attackerPos.z)
            : 0;
        if (!matchedBot || (!b.dead && matchedBot.dead) || dSq < bestDistSq) {
          matchedBot = b;
          bestDistSq = dSq;
        }
      }
    }

    if (matchedBot && matchedBot.activeVehicle && !matchedBot.activeVehicle.dead) {
      matchedVehicle = matchedBot.activeVehicle;
    }

    if (matchedVehicle) {
      const vehLabel = String(matchedVehicle.name || matchedVehicle.type || 'VEHICLE').toUpperCase();
      return {
        unit: matchedBot || matchedVehicle.driver || matchedVehicle,
        vehicle: matchedVehicle,
        kind: matchedVehicle.isAircraft ? 'aircraft' : 'vehicle',
        roleLabel: vehLabel,
        hp: Math.max(0, Math.round(matchedVehicle.hp ?? 0)),
        maxHp: Math.max(1, Math.round(matchedVehicle.maxHp || 1000)),
        livePos: matchedVehicle.pos ? matchedVehicle.pos.clone() : null
      };
    }

    if (matchedBot) {
      const roleStr = String(matchedBot.role || 'SOLDIER').toUpperCase();
      return {
        unit: matchedBot,
        vehicle: null,
        kind: 'bot',
        roleLabel: roleStr,
        hp: Math.max(0, Math.round(matchedBot.hp ?? 100)),
        maxHp: Math.max(1, Math.round(matchedBot.maxHp || 100)),
        livePos: matchedBot.pos ? matchedBot.pos.clone() : null
      };
    }

    // 3. Check Remote Multiplayer Players if connected
    const net = typeof window !== 'undefined' ? window.game?.network : null;
    if (net && net.remotePlayers) {
      const iter =
        typeof net.remotePlayers.values === 'function'
          ? net.remotePlayers.values()
          : Object.values(net.remotePlayers);
      for (const rp of iter) {
        if (rp && rp.name === cleanName) {
          return {
            unit: rp,
            vehicle: null,
            kind: 'player',
            roleLabel: String(rp.role || 'OPERATOR').toUpperCase(),
            hp: Math.max(0, Math.round(rp.hp ?? 100)),
            maxHp: Math.max(1, Math.round(rp.maxHp || 100)),
            livePos: rp.pos ? rp.pos.clone() : null
          };
        }
      }
    }

    return {
      unit: null,
      vehicle: null,
      kind: 'external',
      roleLabel: attackerTeam ? `${attackerTeam} COMBATANT` : 'HOSTILE FORCE',
      hp: 100,
      maxHp: 100,
      livePos: null
    };
  },

  _buildDeathReport({
    amount,
    attackerName,
    attackerTeam,
    weaponName,
    attackerPos,
    isHeadshot,
    hitZone
  }) {
    const resolved = this._resolveKillerEntity(attackerName, attackerTeam, attackerPos);
    const hitHeight =
      hitZone === 'head'
        ? this.prone
          ? 0.36
          : this.crouching
          ? 0.98
          : 1.56
        : hitZone === 'leftLeg' || hitZone === 'rightLeg'
        ? 0.52
        : this.prone
        ? 0.28
        : this.crouching
        ? 0.78
        : 1.18;
    const victimSnapshotPos = new THREE.Vector3(
      this.pos.x,
      this.pos.y + hitHeight,
      this.pos.z
    );
    const victimFeetPos = new THREE.Vector3(this.pos.x, this.pos.y, this.pos.z);
    const victimStance = this.prone ? 'prone' : this.crouching ? 'crouch' : 'stand';
    const victimYaw = this.yaw || 0;

    let killerOriginPos = null;
    const rawOrigin = attackerPos || resolved.livePos;
    if (rawOrigin && Number.isFinite(rawOrigin.x) && Number.isFinite(rawOrigin.z)) {
      killerOriginPos = new THREE.Vector3(rawOrigin.x, rawOrigin.y || 0, rawOrigin.z);
      // Elevate ground-level unit positions to rifle muzzle / turret height so 3D shot trace aligns cleanly
      const refEntity = resolved.vehicle || resolved.unit;
      if (refEntity && refEntity.pos && Math.abs(killerOriginPos.y - refEntity.pos.y) < 0.35) {
        killerOriginPos.y += resolved.vehicle
          ? resolved.vehicle.isAircraft
            ? 0.0
            : 2.15
          : 1.46;
      }
    }

    let distanceM = 0;
    let elevDeltaM = 0;
    let bearingDeg = 0;
    let bearingCompass = 'N';
    let hasKillerOrigin = false;

    if (killerOriginPos && resolved.kind !== 'self') {
      const dx = killerOriginPos.x - victimSnapshotPos.x;
      const dy = killerOriginPos.y - victimSnapshotPos.y;
      const dz = killerOriginPos.z - victimSnapshotPos.z;
      distanceM = Math.hypot(dx, dy, dz);
      elevDeltaM = Math.round(killerOriginPos.y - this.pos.y);
      const rawDeg = (Math.atan2(dx, -dz) * 180) / Math.PI;
      bearingDeg = ((Math.round(rawDeg) % 360) + 360) % 360;
      bearingCompass = _COMPASS_DIRS_8[Math.round(bearingDeg / 45) % 8];
      hasKillerOrigin = distanceM >= 0.75;
    }

    const cleanWeapon = String(weaponName || 'UNKNOWN WEAPON').trim();
    const cleanKiller = String(attackerName || 'ENVIRONMENT').trim();
    this.lastDeathReport = {
      killerName: cleanKiller,
      killerTeam: attackerTeam || null,
      killerUnit: resolved.unit,
      killerVehicle: resolved.vehicle,
      killerKind: resolved.kind,
      killerRoleLabel: resolved.roleLabel,
      killerHp: resolved.hp,
      killerMaxHp: resolved.maxHp,
      killerLiveHp: resolved.hp,
      killerLiveMaxHp: resolved.maxHp,
      weaponName: cleanWeapon,
      fatalDamage: Math.max(1, Math.round(amount || 0)),
      isHeadshot: Boolean(isHeadshot || hitZone === 'head'),
      hitZone: hitZone || 'thorax',
      hitZoneLabel: _HIT_ZONE_LABELS[hitZone] || 'THORAX (CHEST)',
      distanceM: Number(distanceM.toFixed(1)),
      elevDeltaM,
      bearingDeg,
      bearingCompass,
      killerOriginPos,
      victimSnapshotPos,
      victimFeetPos,
      victimStance,
      victimYaw,
      hasKillerOrigin,
      timestamp: typeof performance !== 'undefined' ? performance.now() : Date.now()
    };
    return this.lastDeathReport;
  },

  _createAnatomySilhouetteGroup(baseMat, wireMat = null) {
    const g = new THREE.Group();
    const parts = {
      head: new THREE.Mesh(_deathVicHeadGeo, baseMat),
      thorax: new THREE.Mesh(_deathVicTorsoGeo, baseMat),
      leftArm: new THREE.Mesh(_deathVicArmGeo, baseMat),
      rightArm: new THREE.Mesh(_deathVicArmGeo, baseMat),
      leftLeg: new THREE.Mesh(_deathVicLegGeo, baseMat),
      rightLeg: new THREE.Mesh(_deathVicLegGeo, baseMat)
    };
    parts.leftLeg.position.set(-0.14, 0.34, 0);
    parts.rightLeg.position.set(0.14, 0.34, 0);
    parts.thorax.position.set(0, 1.02, 0);
    parts.leftArm.position.set(-0.37, 1.02, 0);
    parts.rightArm.position.set(0.37, 1.02, 0);
    parts.head.position.set(0, 1.56, 0);
    for (const k of Object.keys(parts)) {
      parts[k].renderOrder = 996;
      g.add(parts[k]);
      if (wireMat) {
        const w = new THREE.Mesh(parts[k].geometry, wireMat);
        w.position.copy(parts[k].position);
        w.scale.setScalar(1.04);
        w.renderOrder = 997;
        g.add(w);
      }
    }
    g.userData.parts = parts;
    return g;
  },

  syncDeathCamVisuals(active = true) {
    const report = this.lastDeathReport;
    if (!active || !this.deathCamEnabled || !report || !report.hasKillerOrigin || !this.scene) {
      this.clearDeathCamVisuals();
      return false;
    }

    if (!this._deathCamTraceGroup) {
      const grp = new THREE.Group();
      grp.name = 'DeathCamShotTrace';
      const coreBeam = new THREE.Mesh(_deathTraceCoreGeo, _deathTraceCoreMat);
      const glowBeam = new THREE.Mesh(_deathTraceGlowGeo, _deathTraceGlowMat);
      const originBeacon = new THREE.Mesh(_deathOriginDiamondGeo, _deathOriginMat);
      originBeacon.renderOrder = 999;
      const impactRing = new THREE.Mesh(_deathImpactRingGeo, _deathImpactMat);
      impactRing.renderOrder = 998;

      // War Thunder-style Animated Bullet / Shell Tracer flying from Shooter -> Victim Hit Zone
      const bulletGroup = new THREE.Group();
      const bulletHead = new THREE.Mesh(_deathBulletHeadGeo, _deathBulletHeadMat);
      bulletHead.renderOrder = 1000;
      const bulletWake = new THREE.Mesh(_deathBulletWakeGeo, _deathBulletWakeMat);
      bulletWake.position.set(0, -1.2, 0);
      bulletWake.renderOrder = 999;
      bulletGroup.add(bulletHead, bulletWake);

      // Victim 3D Cyan Silhouette ("📍 YOU") with Fatal Hit Zone glowing bright crimson!
      const victimSilhouette = this._createAnatomySilhouetteGroup(_deathVictimCyanMat, null);

      // Killer 3D X-Ray Orange-Red Silhouette ("🎯 KILLER" — visible through windows, trees & smoke!)
      const killerSoldierSil = this._createAnatomySilhouetteGroup(
        _deathKillerXrayMat,
        _deathKillerWireMat
      );
      const killerVehSil = new THREE.Mesh(_deathKillerVehBoxGeo, _deathKillerWireMat);
      killerVehSil.renderOrder = 997;

      grp.add(
        coreBeam,
        glowBeam,
        originBeacon,
        impactRing,
        bulletGroup,
        victimSilhouette,
        killerSoldierSil,
        killerVehSil
      );
      grp.userData = {
        coreBeam,
        glowBeam,
        originBeacon,
        impactRing,
        bulletGroup,
        victimSilhouette,
        killerSoldierSil,
        killerVehSil
      };
      this._deathCamTraceGroup = grp;
    }

    const grp = this._deathCamTraceGroup;
    const {
      coreBeam,
      glowBeam,
      originBeacon,
      impactRing,
      bulletGroup,
      victimSilhouette,
      killerSoldierSil,
      killerVehSil
    } = grp.userData;
    const orig = report.killerOriginPos;
    const dest = report.victimSnapshotPos;

    _deathSegVec.subVectors(dest, orig);
    const segLen = Math.max(0.5, _deathSegVec.length());
    _deathMidPos.addVectors(orig, dest).multiplyScalar(0.5);
    _deathSegVec.divideScalar(segLen);

    const beamThickness = Math.min(2.8, Math.max(0.8, segLen / 95));
    coreBeam.position.copy(_deathMidPos);
    coreBeam.scale.set(beamThickness, segLen, beamThickness);
    coreBeam.quaternion.setFromUnitVectors(_deathUpAxis, _deathSegVec);

    glowBeam.position.copy(_deathMidPos);
    glowBeam.scale.set(beamThickness, segLen, beamThickness);
    glowBeam.quaternion.copy(coreBeam.quaternion);

    // Animated Bullet Tracer loops cleanly along the shot trajectory every 1.25s
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const elapsedSec = Math.max(0, (nowMs - (report.timestamp || nowMs)) / 1000);
    const cycleT = (elapsedSec % 1.25) / 1.25;
    const travelT = Math.min(1, cycleT / 0.86);
    bulletGroup.position.lerpVectors(orig, dest, travelT);
    bulletGroup.quaternion.copy(coreBeam.quaternion);
    const tracerScale = Math.min(3.6, Math.max(0.95, segLen / 58));
    bulletGroup.scale.setScalar(tracerScale);
    bulletGroup.visible = segLen >= 2.0;

    const beaconScale = Math.min(4.2, Math.max(0.9, segLen / 56));
    originBeacon.position.copy(orig);
    originBeacon.scale.setScalar(beaconScale);

    const pulse = 1 + 0.22 * Math.sin(elapsedSec * 9.0);
    impactRing.position.copy(dest);
    impactRing.scale.setScalar(pulse * Math.min(2.4, Math.max(0.9, segLen / 75)));
    impactRing.lookAt(orig);

    // Position Victim 3D Cyan Silhouette ("📍 YOU") with crimson highlighted hit zone
    if (victimSilhouette && report.victimFeetPos) {
      victimSilhouette.position.copy(report.victimFeetPos);
      victimSilhouette.rotation.set(0, report.victimYaw || 0, 0);
      const stanceScaleY =
        report.victimStance === 'prone' ? 0.35 : report.victimStance === 'crouch' ? 0.68 : 1.0;
      victimSilhouette.scale.set(1, stanceScaleY, 1);
      const vParts = victimSilhouette.userData.parts;
      if (vParts) {
        for (const zoneKey of Object.keys(vParts)) {
          vParts[zoneKey].material =
            zoneKey === report.hitZone ? _deathVictimHitMat : _deathVictimCyanMat;
        }
      }
      victimSilhouette.visible = true;
    }

    // Position Killer 3D X-Ray Orange-Red Silhouette ("🎯 KILLER")
    const inKillerPov = this.deathCamMode === 'KILLER_POV';
    if (typeof this.getLiveKillerFocusPos === 'function') {
      this.getLiveKillerFocusPos(_deathLiveKillerTmp);
    } else {
      _deathLiveKillerTmp.copy(orig);
    }
    const isVehKiller =
      report.killerKind === 'vehicle' ||
      report.killerKind === 'aircraft' ||
      Boolean(report.killerVehicle);
    if (inKillerPov) {
      // Hide killer X-ray mesh when camera is directly inside killer's 1st-person eyes!
      killerSoldierSil.visible = false;
      killerVehSil.visible = false;
      originBeacon.visible = false;
    } else if (isVehKiller) {
      killerSoldierSil.visible = false;
      killerVehSil.visible = true;
      originBeacon.visible = true;
      const veh = report.killerVehicle;
      if (veh && veh.pos) {
        killerVehSil.position.set(veh.pos.x, veh.pos.y + 1.25, veh.pos.z);
        killerVehSil.rotation.set(veh.pitch || 0, veh.yaw || 0, veh.roll || 0, 'YXZ');
      } else {
        killerVehSil.position.copy(_deathLiveKillerTmp);
        killerVehSil.rotation.set(0, 0, 0);
      }
    } else {
      killerVehSil.visible = false;
      killerSoldierSil.visible = true;
      originBeacon.visible = true;
      const unit = report.killerUnit;
      if (unit && !unit.dead && unit.pos) {
        killerSoldierSil.position.copy(unit.pos);
        killerSoldierSil.rotation.set(0, unit.yaw || 0, 0);
      } else {
        killerSoldierSil.position.set(orig.x, orig.y - 1.46, orig.z);
        killerSoldierSil.rotation.set(0, Math.atan2(dest.x - orig.x, dest.z - orig.z), 0);
      }
      // Subtle silhouette scale boost at extreme sniper distances so the human figure stays legible!
      const silBoost = Math.min(2.15, Math.max(1.03, segLen / 135));
      killerSoldierSil.scale.setScalar(silBoost);
    }

    grp.visible = true;
    if (grp.parent !== this.scene) {
      this.scene.add(grp);
    }
    return true;
  },

  clearDeathCamVisuals() {
    if (this._deathCamTraceGroup) {
      this._deathCamTraceGroup.visible = false;
      if (this._deathCamTraceGroup.parent) {
        this._deathCamTraceGroup.parent.remove(this._deathCamTraceGroup);
      }
    }
  },

  reviveFromDowned(
    medicName = 'SQUAD MEDIC',
    isMedicRescuer = true,
    dressingsLeft = 8,
    maxDressings = 9
  ) {
    if (!this.downed || this.dead || this.beyondRescue) return;
    this.downed = false;
    this.beyondRescue = false;
    this.downedTimer = 0;
    this.giveUpProgress = 0;
    this._deathCamBlend = 0;
    this.clearDeathCamVisuals();
    if (typeof this.resetDeathCamFov === 'function') {
      this.resetDeathCamFov();
    }
    // Squad 2-Stage Medical Treatment:
    // Stage 1: Field Dressing stabilizes the downed soldier at 35 HP and stops bleeding (-1 Field Dressing).
    // Stage 2: If rescued by a Medic, they immediately follow up with their Medic Bag to heal injuries to 100/100 HP!
    this.hp = isMedicRescuer ? 100 : PLAYER.REVIVE_HP || 35;
    this.bleeding = false;
    if (isMedicRescuer) {
      this.armFractured = false;
      this.legFractured = false;
      this.limbHealth = {
        head: 100,
        thorax: 100,
        leftArm: 100,
        rightArm: 100,
        leftLeg: 100,
        rightLeg: 100
      };
    } else if (this.limbHealth) {
      this.limbHealth.head = Math.max(this.limbHealth.head || 0, 50);
      this.limbHealth.thorax = Math.max(this.limbHealth.thorax || 0, 50);
    }
    this.viewModelGroup.visible = true;
    sound.playReload();
    if (this.onAwardXp) {
      this.onAwardXp(
        COMBAT.REVIVE_XP,
        isMedicRescuer
          ? `🩹 REVIVED BY MEDIC ${medicName} (${dressingsLeft}/${maxDressings} DRESSINGS LEFT) — APPLYING MEDIC BAG TO 100 HP!`
          : `🩹 REVIVED BY ${medicName} (${dressingsLeft}/2 DRESSINGS LEFT • ${this.hp}/100 HP — FIND MEDIC FOR FULL HEAL!)`
      );
    }
  },

  finalizeDeath() {
    this.downed = false;
    this.beyondRescue = false;
    this.dead = true;
    if (typeof this.resetVisionSensors === 'function') {
      this.resetVisionSensors();
    } else {
      this.sensorMode = 'OFF';
      this.nvgActive = false;
    }
    this.deaths++;
    this.killStreak = 0;
    this.deadeyeStreak = 0;
    this.multiKillCount = 0;
    this.multiKillTimer = 0;
    this.suppressionLevel = 0;
    this.respawnTimer = this.respawnDelay; // Start respawn countdown
    if (this.deathCamEnabled && this.lastDeathReport?.hasKillerOrigin) {
      this.deathCamPostMax = 4.2;
      this.deathCamPostTimer = 4.2;
      this.syncDeathCamVisuals(true);
    } else {
      this.deathCamPostTimer = 0;
      this.clearDeathCamVisuals();
      if (typeof this.resetDeathCamFov === 'function') {
        this.resetDeathCamFov();
      }
    }
    if (typeof document !== 'undefined' && document.pointerLockElement === document.body) {
      document.exitPointerLock?.();
    }
    if (this.onPlayerDied) {
      this.onPlayerDied(this.downedKiller, this.downedWeapon);
    } else {
      events.emit('player:died', {
        killerName: this.downedKiller,
        weaponName: this.downedWeapon
      });
    }
  }
};
