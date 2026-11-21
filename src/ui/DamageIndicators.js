import { events } from '../events.js?v=90';

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

  // Floating Damage Number (shows damage dealt on enemies in world space)
  spawnFloatingDamage(worldPos, damage, isHeadshot = false) {
    let container = this.el('floating-damage-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'floating-damage-container';
      container.style.cssText =
        'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:100;overflow:hidden;';
      document.body.appendChild(container);
      if (this._domCache) this._domCache.set('floating-damage-container', container);
    }

    const el = document.createElement('div');
    el.className = 'floating-dmg';
    el.textContent = `-${damage}`;
    el.style.cssText = `
      position: absolute; font-weight: 900; pointer-events: none;
      font-family: 'Rajdhani', sans-serif; letter-spacing: 1px;
      text-shadow: 0 1px 4px rgba(0,0,0,0.9);
      animation: floatDmgUp 1.2s ease-out forwards;
      font-size: ${isHeadshot ? '28px' : '22px'};
      color: ${isHeadshot ? '#f39c12' : '#e74c3c'};
    `;

    // Project world position to screen
    const v = worldPos.clone();
    v.project(this.player.camera);
    const sx = (v.x * 0.5 + 0.5) * window.innerWidth + (Math.random() - 0.5) * 30;
    const sy = (-v.y * 0.5 + 0.5) * window.innerHeight + (Math.random() - 0.5) * 20;
    el.style.left = `${sx}px`;
    el.style.top = `${sy}px`;

    container.appendChild(el);
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 1300);
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

  updateDamageIndicators(dt) {
    if (!this.damageIndicatorRingEl) return;
    if (this.damageIndicators.length === 0) {
      if (this.damageIndicatorRingEl.innerHTML !== '') {
        this.damageIndicatorRingEl.innerHTML = '';
      }
      return;
    }

    const fwdX = -Math.sin(this.player.yaw);
    const fwdZ = -Math.cos(this.player.yaw);
    const rightX = Math.cos(this.player.yaw);
    const rightZ = -Math.sin(this.player.yaw);

    const htmlParts = [];
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
      const cls = ind.isArmorHit ? 'dmg-arc-wrapper armor-hit' : 'dmg-arc-wrapper';
      const labelText = ind.isArmorHit
        ? `HULL HIT: ${ind.weaponName} • ${distM}m`
        : `${ind.weaponName} • ${distM}m`;

      htmlParts.push(`
        <div class="${cls}" style="transform: rotate(${angleDeg.toFixed(1)}deg); opacity: ${opacity}">
          <div class="dmg-arc-wedge"></div>
          <div class="dmg-arc-tag" style="transform: translateX(-50%) rotate(${(-angleDeg).toFixed(
            1
          )}deg)">${labelText}</div>
        </div>
      `);
    }

    this.damageIndicatorRingEl.innerHTML = htmlParts.join('');
  }
};

export default DamageIndicators;
