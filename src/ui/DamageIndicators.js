import { events } from '../events.js?v=144';

export const DamageIndicators = {
  flashDamage(isArmorHit = false) {
    this.damageVignetteEl.style.boxShadow = isArmorHit
      ? 'inset 0 0 95px rgba(243, 156, 18, 0.55)'
      : 'inset 0 0 120px rgba(231, 76, 60, 0.8)';
    setTimeout(() => {
      this.damageVignetteEl.style.boxShadow = this.player.bleeding
        ? 'inset 0 0 85px rgba(192, 57, 43, 0.45)'
        : 'inset 0 0 110px rgba(220, 20, 20, 0)';
    }, 180);
  },

  // Suppression Overlay (Squad-style screen darkening + edge blur when suppressed)
  updateSuppressionOverlay() {
    let el = this.el('suppression-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'suppression-overlay';
      el.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        pointer-events: none; z-index: 50; opacity: 0;
        background: radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.65) 100%);
        transition: opacity 0.12s ease-out;
      `;
      document.body.appendChild(el);
      if (this._domCache) this._domCache.set('suppression-overlay', el);
    }
    const sup = this.player.suppressionLevel || 0;
    if (sup > 0.05) {
      el.style.opacity = String(Math.min(0.85, sup));
    } else {
      el.style.opacity = '0';
    }
  },

  // Floating Damage Number (pooled DOM elements updated via compositor transform/opacity)
  _acquireFloatingDamageSlot(container) {
    if (!this._floatingDmgPool) {
      this._floatingDmgPool = [];
    }
    const pool = this._floatingDmgPool;
    const MAX_POOL = 16;
    for (let i = 0; i < pool.length; i++) {
      if (!pool[i].active) {
        return pool[i];
      }
    }
    if (pool.length < MAX_POOL) {
      const el = document.createElement('div');
      el.className = 'floating-dmg';
      el.style.cssText =
        "position:absolute;left:0px;top:0px;font-weight:900;pointer-events:none;font-family:'Rajdhani',sans-serif;letter-spacing:1px;text-shadow:0 1px 4px rgba(0,0,0,0.9);will-change:transform,opacity;display:none;opacity:0;";
      container.appendChild(el);
      const slot = {
        el,
        active: false,
        x: 0,
        y: 0,
        age: 0,
        duration: 1.2,
        isHeadshot: null,
        text: ''
      };
      pool.push(slot);
      return slot;
    }
    // Recycle oldest active slot if pool is saturated
    let oldest = pool[0];
    for (let i = 1; i < pool.length; i++) {
      if (pool[i].age > oldest.age) oldest = pool[i];
    }
    return oldest;
  },

  spawnFloatingDamage(worldPos, damage, isHeadshot = false) {
    if (!worldPos || !this.player || !this.player.camera) return;
    let container = this.el('floating-damage-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'floating-damage-container';
      container.style.cssText =
        'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:100;overflow:hidden;';
      document.body.appendChild(container);
      if (this._domCache) this._domCache.set('floating-damage-container', container);
    }

    const v = this._floatProjVec || (this._floatProjVec = worldPos.clone());
    v.set(worldPos.x, worldPos.y, worldPos.z).project(this.player.camera);
    if (v.z > 1) return;

    const sx = (v.x * 0.5 + 0.5) * window.innerWidth + (Math.random() - 0.5) * 30;
    const sy = (-v.y * 0.5 + 0.5) * window.innerHeight + (Math.random() - 0.5) * 20;

    const slot = this._acquireFloatingDamageSlot(container);
    const txt = `-${damage}`;
    if (slot.text !== txt) {
      slot.el.textContent = txt;
      slot.text = txt;
    }
    if (slot.isHeadshot !== isHeadshot) {
      slot.el.style.fontSize = isHeadshot ? '28px' : '22px';
      slot.el.style.color = isHeadshot ? '#f39c12' : '#e74c3c';
      slot.isHeadshot = isHeadshot;
    }
    slot.x = sx;
    slot.y = sy;
    slot.age = 0;
    slot.duration = 1.2;
    slot.active = true;
    slot.el.style.display = 'block';
    slot.el.style.opacity = '1';
    slot.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0)`;
  },

  _updateFloatingDamagePool(dt) {
    const pool = this._floatingDmgPool;
    if (!pool || pool.length === 0) return;
    for (let i = 0; i < pool.length; i++) {
      const slot = pool[i];
      if (!slot.active) continue;
      slot.age += dt;
      if (slot.age >= slot.duration) {
        slot.active = false;
        slot.el.style.opacity = '0';
        slot.el.style.display = 'none';
        continue;
      }
      const p = slot.age / slot.duration;
      const easeOut = 1 - (1 - p) * (1 - p);
      const y = slot.y - easeOut * 42;
      const op = p < 0.65 ? 1 : Math.max(0, 1 - (p - 0.65) / 0.35);
      slot.el.style.transform = `translate3d(${slot.x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      slot.el.style.opacity = op.toFixed(2);
    }
  },

  registerDamageIndicator(
    amount,
    attackerPos = null,
    isArmorHit = false,
    weaponName = 'INCOMING FIRE',
    attackerName = 'ENEMY'
  ) {
    if (weaponName !== 'SMALL ARMS DEFLECTED') {
      this.flashDamage(isArmorHit);
    }

    if (!attackerPos) return;

    const dx = attackerPos.x - this.player.pos.x;
    const dz = attackerPos.z - this.player.pos.z;
    const distM = Math.max(1, Math.round(Math.hypot(dx, dz)));

    // Compute initial relative bearing in degrees (-180..+180, 0 = straight ahead)
    const fwdX = -Math.sin(this.player.yaw);
    const fwdZ = -Math.cos(this.player.yaw);
    const rightX = Math.cos(this.player.yaw);
    const rightZ = -Math.sin(this.player.yaw);
    const dotFwd = dx * fwdX + dz * fwdZ;
    const dotRight = dx * rightX + dz * rightZ;
    const bearingDeg = Math.round((Math.atan2(dotRight, dotFwd) * 180) / Math.PI);

    // Merge with existing indicator from a nearby angle so rapid bursts stack cleanly
    let merged = false;
    for (const ind of this.damageIndicators) {
      const dInd = Math.hypot(
        ind.attackerPos.x - attackerPos.x,
        (ind.attackerPos.y || 0) - (attackerPos.y || 0),
        ind.attackerPos.z - attackerPos.z
      );
      if (dInd < 8.0 && ind.isArmorHit === isArmorHit) {
        ind.attackerPos.x = attackerPos.x;
        ind.attackerPos.y = attackerPos.y || 0;
        ind.attackerPos.z = attackerPos.z;
        ind.amount = Math.max(ind.amount, amount);
        ind.weaponName = weaponName;
        ind.attackerName = attackerName;
        ind.distM = distM;
        ind.timer = 2.4;
        ind.maxTimer = 2.4;
        merged = true;
        break;
      }
    }

    if (!merged) {
      this.damageIndicators.push({
        attackerPos:
          typeof attackerPos.clone === 'function'
            ? attackerPos.clone()
            : { x: attackerPos.x || 0, y: attackerPos.y || 0, z: attackerPos.z || 0 },
        amount,
        isArmorHit,
        weaponName,
        attackerName,
        distM,
        timer: 2.4,
        maxTimer: 2.4
      });
      if (this.damageIndicators.length > 5) {
        this.damageIndicators.shift();
      }
    }

    if (amount > 0 || !merged) {
      const dmgPayload = {
        attacker: attackerName,
        weapon: weaponName,
        isArmorHit,
        damage: amount,
        playerHp: Math.round(this.player.hp),
        vehicleHp: this.player.activeVehicle ? Math.round(this.player.activeVehicle.hp) : null,
        bearingDeg,
        distM
      };
      events.emit('telemetry:event', {
        type: 'DIRECTIONAL_DAMAGE',
        payload: dmgPayload
      });
      if (this.telemetry && !this.telemetry._unsubscribeTelemetryEvent) {
        this.telemetry.logEvent('DIRECTIONAL_DAMAGE', dmgPayload);
      }
    }
  },

  _acquireDamageArcSlot(index) {
    if (!this._dmgArcPool) {
      this._dmgArcPool = [];
    }
    let slot = this._dmgArcPool[index];
    if (!slot) {
      const root = document.createElement('div');
      root.className = 'dmg-arc-wrapper';
      const wedge = document.createElement('div');
      wedge.className = 'dmg-arc-wedge';
      const tag = document.createElement('div');
      tag.className = 'dmg-arc-tag';
      root.appendChild(wedge);
      root.appendChild(tag);
      this.damageIndicatorRingEl.appendChild(root);
      slot = {
        root,
        wedge,
        tag,
        visible: true,
        isArmorHit: false,
        transform: '',
        opacity: '',
        tagTransform: '',
        labelText: ''
      };
      this._dmgArcPool[index] = slot;
    } else if (!slot.visible) {
      slot.root.style.display = '';
      slot.visible = true;
    }
    return slot;
  },

  updateDamageIndicators(dt) {
    this._updateFloatingDamagePool(dt);
    if (!this.damageIndicatorRingEl) return;
    if (this.damageIndicators.length === 0) {
      if (this._dmgArcPool) {
        for (let i = 0; i < this._dmgArcPool.length; i++) {
          const slot = this._dmgArcPool[i];
          if (slot && slot.visible) {
            slot.root.style.display = 'none';
            slot.styleOpacity = '0';
            slot.visible = false;
          }
        }
      }
      return;
    }

    const fwdX = -Math.sin(this.player.yaw);
    const fwdZ = -Math.cos(this.player.yaw);
    const rightX = Math.cos(this.player.yaw);
    const rightZ = -Math.sin(this.player.yaw);

    let activeSlotCount = 0;
    for (let i = this.damageIndicators.length - 1; i >= 0; i--) {
      const ind = this.damageIndicators[i];
      ind.timer -= dt;
      if (ind.timer <= 0) {
        this.damageIndicators.splice(i, 1);
        continue;
      }

      const dx = ind.attackerPos.x - this.player.pos.x;
      const dz = ind.attackerPos.z - this.player.pos.z;
      const distM = Math.max(1, Math.round(Math.hypot(dx, dz)));
      const dotFwd = dx * fwdX + dz * fwdZ;
      const dotRight = dx * rightX + dz * rightZ;
      const angleDeg = (Math.atan2(dotRight, dotFwd) * 180) / Math.PI;
      const opacity = Math.min(1, (ind.timer / ind.maxTimer) * 1.35).toFixed(2);
      const isArmor = Boolean(ind.isArmorHit);
      const labelText = isArmor
        ? `HULL HIT: ${ind.weaponName} • ${distM}m`
        : `${ind.weaponName} • ${distM}m`;

      const slot = this._acquireDamageArcSlot(activeSlotCount++);
      if (slot.isArmorHit !== isArmor) {
        slot.root.className = isArmor ? 'dmg-arc-wrapper armor-hit' : 'dmg-arc-wrapper';
        slot.isArmorHit = isArmor;
      }
      const trStr = `rotate(${angleDeg.toFixed(1)}deg)`;
      if (slot.transform !== trStr) {
        slot.root.style.transform = trStr;
        slot.transform = trStr;
      }
      if (slot.opacity !== opacity) {
        slot.root.style.opacity = opacity;
        slot.opacity = opacity;
      }
      const tagTrStr = `translateX(-50%) rotate(${(-angleDeg).toFixed(1)}deg)`;
      if (slot.tagTransform !== tagTrStr) {
        slot.tag.style.transform = tagTrStr;
        slot.tagTransform = tagTrStr;
      }
      if (slot.labelText !== labelText) {
        slot.tag.textContent = labelText;
        slot.labelText = labelText;
      }
    }

    if (this._dmgArcPool) {
      for (let i = activeSlotCount; i < this._dmgArcPool.length; i++) {
        const slot = this._dmgArcPool[i];
        if (slot && slot.visible) {
          slot.root.style.display = 'none';
          slot.visible = false;
        }
      }
    }
  }
};

export default DamageIndicators;
