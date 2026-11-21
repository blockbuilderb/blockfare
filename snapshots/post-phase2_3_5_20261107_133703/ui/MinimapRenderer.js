export const MinimapRenderer = {
  _getCachedContext2D(canvas, propName) {
    if (!canvas) return null;
    if (propName && this[propName] && this[propName].canvas === canvas) {
      return this[propName];
    }
    const ctx = canvas._cachedCtx2d || (canvas._cachedCtx2d = canvas.getContext('2d'));
    if (propName) {
      this[propName] = ctx;
    }
    return ctx;
  },

  drawMinimap() {
    const ctx = this._getCachedContext2D(this.minimapCanvas, 'minimapCtx');
    if (!ctx) return;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;
    const scale = 0.62;

    ctx.fillStyle = '#182419';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w / 2, h / 2);

    // River strip
    ctx.fillStyle = '#1f4e68';
    ctx.fillRect((-18 - this.player.pos.x) * scale, -h * 2, 36 * scale, h * 4);

    // Main Highway Road & 3 Bridges
    ctx.fillStyle = '#2d3436';
    ctx.fillRect(
      (-380 - this.player.pos.x) * scale,
      (-7 - this.player.pos.z) * scale,
      760 * scale,
      14 * scale
    );
    ctx.fillRect(
      (-22 - this.player.pos.x) * scale,
      (-118 - this.player.pos.z) * scale,
      44 * scale,
      16 * scale
    );
    ctx.fillRect(
      (-22 - this.player.pos.x) * scale,
      (102 - this.player.pos.z) * scale,
      44 * scale,
      16 * scale
    );

    // 5 Conquest Flags
    for (const flag of this.world.flags) {
      const fx = (flag.pos.x - this.player.pos.x) * scale;
      const fz = (flag.pos.z - this.player.pos.z) * scale;
      ctx.strokeStyle =
        flag.owner === 'US' ? '#3498db' : flag.owner === 'RU' ? '#e74c3c' : '#95a5a6';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(fx, fz, flag.radius * scale, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(flag.id, fx, fz + 3.5);
    }

    // Vehicles on Minimap
    for (const v of this.vehicleManager.vehicles) {
      if (v.dead) continue;
      const vx = (v.pos.x - this.player.pos.x) * scale;
      const vz = (v.pos.z - this.player.pos.z) * scale;
      ctx.fillStyle = v.team === 'US' ? '#74b9ff' : '#ff7675';
      ctx.fillRect(vx - 3.5, vz - 3.5, 7, 7);
    }

    // Rally Point on Minimap (green diamond)
    if (this.player.rallyPoint && this.player.rallyPoint.timer > 0) {
      const rx = (this.player.rallyPoint.pos.x - this.player.pos.x) * scale;
      const rz = (this.player.rallyPoint.pos.z - this.player.pos.z) * scale;
      ctx.fillStyle = '#2ecc71';
      ctx.save();
      ctx.translate(rx, rz);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-4, -4, 8, 8);
      ctx.restore();
    }

    // Insertion Beacon on Minimap (cyan diamond)
    if (this.player.insertionBeacon && this.player.insertionBeacon.spawnsLeft > 0) {
      const bx = (this.player.insertionBeacon.pos.x - this.player.pos.x) * scale;
      const bz = (this.player.insertionBeacon.pos.z - this.player.pos.z) * scale;
      ctx.fillStyle = '#00d2d3';
      ctx.save();
      ctx.translate(bx, bz);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-3.5, -3.5, 7, 7);
      ctx.restore();
    }

    // Active Airstrike Target Zone on Minimap (pulsing red ring)
    if (this.player.airstrikeTarget) {
      const ax = (this.player.airstrikeTarget.pos.x - this.player.pos.x) * scale;
      const az = (this.player.airstrikeTarget.pos.z - this.player.pos.z) * scale;
      ctx.strokeStyle = 'rgba(231, 76, 60, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ax, az, 10 * scale, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Ammo Crates on Minimap (green squares)
    if (this.world.ammoCrates) {
      for (const crate of this.world.ammoCrates) {
        const cx = (crate.pos.x - this.player.pos.x) * scale;
        const cz = (crate.pos.z - this.player.pos.z) * scale;
        ctx.fillStyle = '#27ae60';
        ctx.fillRect(cx - 2.5, cz - 2.5, 5, 5);
      }
    }

    // UAV-Revealed & Spotted Enemy Bots on Minimap (red diamonds)
    for (const bot of this.botManager.bots) {
      if (bot.dead || bot.team === this.player.team) continue;
      if (bot.uavRevealed || (bot.spottedTimer && bot.spottedTimer > 0)) {
        const ex = (bot.pos.x - this.player.pos.x) * scale;
        const ez = (bot.pos.z - this.player.pos.z) * scale;
        ctx.fillStyle = '#ff3838';
        ctx.beginPath();
        ctx.arc(ex, ez, 2.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Friendly Bots & Downed Revive Crosses
    for (const bot of this.botManager.bots) {
      if (bot.dead || bot.team !== this.player.team) continue;
      const bx = (bot.pos.x - this.player.pos.x) * scale;
      const bz = (bot.pos.z - this.player.pos.z) * scale;
      if (bot.downed) {
        ctx.fillStyle = '#ff5252';
        ctx.fillRect(bx - 3, bz - 1, 6, 2);
        ctx.fillRect(bx - 1, bz - 3, 2, 6);
      } else {
        ctx.fillStyle = bot.inPlayerSquad ? '#2ecc71' : '#5dade2';
        ctx.beginPath();
        ctx.arc(bx, bz, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Incoming Fire Threat Vectors on Minimap
    for (const ind of this.damageIndicators) {
      const tx = (ind.attackerPos.x - this.player.pos.x) * scale;
      const tz = (ind.attackerPos.z - this.player.pos.z) * scale;
      ctx.strokeStyle = ind.isArmorHit ? 'rgba(255, 159, 26, 0.9)' : 'rgba(255, 55, 55, 0.9)';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(tx, tz);
      ctx.stroke();

      ctx.fillStyle = ind.isArmorHit ? '#ff9f1a' : '#ff3737';
      ctx.beginPath();
      ctx.arc(tx, tz, 4.0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Local Player + View Cone
    ctx.save();
    ctx.rotate(-this.player.yaw);
    ctx.fillStyle = 'rgba(241, 196, 15, 0.2)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-18, -38);
    ctx.lineTo(18, -38);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#f1c40f';
    ctx.beginPath();
    ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.restore();
  },

  drawCommandTacticalMap(canvas) {
    if (!canvas) return;
    const ctx = this._getCachedContext2D(canvas, '_cmdMapCtx');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = '#162318';
    ctx.fillRect(0, 0, w, h);

    const toMapX = (wx) => (wx / 720 + 0.5) * w;
    const toMapY = (wz) => (wz / 440 + 0.5) * h;

    // Subtle tactical grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx < w; gx += 76) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, h);
      ctx.stroke();
    }
    for (let gy = 0; gy < h; gy += 51) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(w, gy);
      ctx.stroke();
    }

    // North-South River
    ctx.fillStyle = '#1f536e';
    ctx.fillRect(toMapX(-20), 0, 26, h);

    // 3 Grand Bridges & Main Road Network
    ctx.fillStyle = '#2f363d';
    ctx.fillRect(0, toMapY(-8), w, 10);
    ctx.fillRect(toMapX(-24), toMapY(-116), 34, 8);
    ctx.fillRect(toMapX(-24), toMapY(104), 34, 8);

    // Base HQs
    const usX = toMapX(this.world.spawns.US_BASE.x);
    const usY = toMapY(this.world.spawns.US_BASE.z);
    ctx.fillStyle = '#3498db';
    ctx.fillRect(usX - 7, usY - 7, 14, 14);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('US HQ', usX, usY - 10);

    const ruX = toMapX(this.world.spawns.RU_BASE.x);
    const ruY = toMapY(this.world.spawns.RU_BASE.z);
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(ruX - 7, ruY - 7, 14, 14);
    ctx.fillStyle = '#fff';
    ctx.fillText('RU HQ', ruX, ruY - 10);

    const team = this.player.team || 'US';
    const cmdOrder = this.botManager.commanderOrders && this.botManager.commanderOrders[team];

    // 5 Capture Flags (Interactive click targets)
    for (const f of this.world.flags) {
      const fx = toMapX(f.pos.x);
      const fy = toMapY(f.pos.z);
      const isOrdered =
        cmdOrder && cmdOrder.timer > 0 && cmdOrder.action === 'OBJECTIVE' && cmdOrder.flagId === f.id;

      ctx.fillStyle =
        f.owner === 'US'
          ? 'rgba(52, 152, 219, 0.38)'
          : f.owner === 'RU'
          ? 'rgba(231, 76, 60, 0.38)'
          : 'rgba(149, 165, 166, 0.3)';
      ctx.beginPath();
      ctx.arc(fx, fy, 16, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = isOrdered ? '#f1c40f' : '#ffffff';
      ctx.lineWidth = isOrdered ? 3 : 1.3;
      ctx.stroke();

      if (isOrdered) {
        ctx.fillStyle = '#f1c40f';
        ctx.font = 'bold 9px sans-serif';
        ctx.fillText('★ ORDER TARGET', fx, fy - 20);
      }

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(f.id, fx, fy + 4);
    }

    // Active Vehicles on Tactical Map (highlight UAV-revealed enemy armor with orange targeting ring!)
    for (const v of this.vehicleManager.vehicles) {
      if (v.dead) continue;
      const vx = toMapX(v.pos.x);
      const vy = toMapY(v.pos.z);
      ctx.fillStyle = v.team === 'US' ? '#74b9ff' : '#ff7675';
      ctx.fillRect(vx - 3.5, vy - 3.5, 7, 7);
      if (v.team !== team && v.uavRevealed) {
        ctx.strokeStyle = '#f39c12';
        ctx.lineWidth = 1.6;
        ctx.strokeRect(vx - 5.5, vy - 5.5, 11, 11);
      }
    }

    // Active Airstrike Target Zone on Tactical Map
    if (this.player.airstrikeTarget && this.player.airstrikeTarget.pos) {
      const ax = toMapX(this.player.airstrikeTarget.pos.x);
      const ay = toMapY(this.player.airstrikeTarget.pos.z);
      ctx.fillStyle = 'rgba(231, 76, 60, 0.28)';
      ctx.beginPath();
      ctx.arc(ax, ay, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ff3838';
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.fillStyle = '#ff7675';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`💥 STRIKE (${this.player.airstrikeTarget.timer.toFixed(1)}s)`, ax, ay - 21);
    }

    // Friendly Bots & Spotted Enemies
    for (const bot of this.botManager.bots) {
      if (bot.dead) continue;
      if (bot.team === team) {
        ctx.fillStyle = bot.inPlayerSquad ? '#2ecc71' : '#5dade2';
        ctx.fillRect(toMapX(bot.pos.x) - 2, toMapY(bot.pos.z) - 2, 4, 4);
      } else if (bot.uavRevealed || (bot.spottedTimer && bot.spottedTimer > 0)) {
        ctx.fillStyle = '#ff3838';
        ctx.fillRect(toMapX(bot.pos.x) - 2, toMapY(bot.pos.z) - 2, 4, 4);
      }
    }

    // Local Player Marker
    if (!this.player.dead) {
      const px = toMapX(this.player.pos.x);
      const py = toMapY(this.player.pos.z);
      ctx.fillStyle = '#f1c40f';
      ctx.beginPath();
      ctx.arc(px, py, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f1c40f';
      ctx.font = 'bold 9px sans-serif';
      ctx.fillText('YOU', px, py + 14);
    }
  }
};

export default MinimapRenderer;
