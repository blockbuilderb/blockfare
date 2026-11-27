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
    const scale = 0.36;
    const px = this.player.pos.x;
    const pz = this.player.pos.z;
    const viewRangeX = (w * 0.5) / scale + 12;
    const viewRangeZ = (h * 0.5) / scale + 12;

    ctx.fillStyle = '#182419';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w / 2, h / 2);

    // River strip
    ctx.fillStyle = '#1f4e68';
    ctx.fillRect((-18 - px) * scale, -h * 2, 36 * scale, h * 4);

    // Main Highway Road & 3 Bridges
    ctx.fillStyle = '#2d3436';
    ctx.fillRect((-1000 - px) * scale, (-7 - pz) * scale, 2000 * scale, 14 * scale);
    ctx.fillRect((-22 - px) * scale, (-228 - pz) * scale, 44 * scale, 16 * scale);
    ctx.fillRect((-22 - px) * scale, (212 - pz) * scale, 44 * scale, 16 * scale);

    // 5 Conquest Flags
    const flags = this.world.flags;
    ctx.lineWidth = 1.6;
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i < flags.length; i++) {
      const flag = flags[i];
      const dx = flag.pos.x - px;
      const dz = flag.pos.z - pz;
      const flagPad = flag.radius + 14;
      if (
        dx > viewRangeX + flagPad ||
        dx < -viewRangeX - flagPad ||
        dz > viewRangeZ + flagPad ||
        dz < -viewRangeZ - flagPad
      ) {
        continue;
      }
      const fx = dx * scale;
      const fz = dz * scale;
      ctx.strokeStyle =
        flag.owner === 'US' ? '#3498db' : flag.owner === 'RU' ? '#e74c3c' : '#95a5a6';
      ctx.beginPath();
      ctx.arc(fx, fz, flag.radius * scale, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.fillText(flag.id, fx, fz + 3.5);
    }

    // Vehicles & Combat Aircraft on Minimap (pre-culled outside minimap viewRange)
    const vehicles = this.vehicleManager.vehicles;
    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      if (v.dead) continue;
      const dx = v.pos.x - px;
      if (dx > viewRangeX || dx < -viewRangeX) continue;
      const dz = v.pos.z - pz;
      if (dz > viewRangeZ || dz < -viewRangeZ) continue;

      const vx = dx * scale;
      const vz = dz * scale;
      ctx.fillStyle = v.isWarehouseBike
        ? '#00d2d3'
        : v.team === 'US'
        ? '#74b9ff'
        : '#ff7675';
      if (v.isAircraft) {
        ctx.save();
        ctx.translate(vx, vz);
        ctx.rotate(-(v.yaw || 0));
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(-4.5, 4.5);
        ctx.lineTo(0, 2);
        ctx.lineTo(4.5, 4.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (v.type === 'bike' || v.type === 'atv') {
        ctx.fillRect(vx - 2.2, vz - 2.2, 4.4, 4.4);
      } else {
        ctx.fillRect(vx - 3.5, vz - 3.5, 7, 7);
      }
    }

    // Rally Point on Minimap (green diamond)
    if (this.player.rallyPoint && this.player.rallyPoint.timer > 0) {
      const dx = this.player.rallyPoint.pos.x - px;
      const dz = this.player.rallyPoint.pos.z - pz;
      if (Math.abs(dx) <= viewRangeX && Math.abs(dz) <= viewRangeZ) {
        ctx.fillStyle = '#2ecc71';
        ctx.save();
        ctx.translate(dx * scale, dz * scale);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-4, -4, 8, 8);
        ctx.restore();
      }
    }

    // Insertion Beacon on Minimap (cyan diamond)
    if (this.player.insertionBeacon && this.player.insertionBeacon.spawnsLeft > 0) {
      const dx = this.player.insertionBeacon.pos.x - px;
      const dz = this.player.insertionBeacon.pos.z - pz;
      if (Math.abs(dx) <= viewRangeX && Math.abs(dz) <= viewRangeZ) {
        ctx.fillStyle = '#00d2d3';
        ctx.save();
        ctx.translate(dx * scale, dz * scale);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-3.5, -3.5, 7, 7);
        ctx.restore();
      }
    }

    // Active Airstrike Target Zone on Minimap (pulsing red ring)
    if (this.player.airstrikeTarget) {
      const dx = this.player.airstrikeTarget.pos.x - px;
      const dz = this.player.airstrikeTarget.pos.z - pz;
      if (Math.abs(dx) <= viewRangeX + 12 && Math.abs(dz) <= viewRangeZ + 12) {
        ctx.strokeStyle = 'rgba(231, 76, 60, 0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(dx * scale, dz * scale, 10 * scale, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Ammo Crates on Minimap (green squares, pre-culled & single fillStyle)
    if (this.world.ammoCrates && this.world.ammoCrates.length > 0) {
      ctx.fillStyle = '#27ae60';
      const crates = this.world.ammoCrates;
      for (let i = 0; i < crates.length; i++) {
        const crate = crates[i];
        const dx = crate.pos.x - px;
        if (dx > viewRangeX || dx < -viewRangeX) continue;
        const dz = crate.pos.z - pz;
        if (dz > viewRangeZ || dz < -viewRangeZ) continue;
        ctx.fillRect(dx * scale - 2.5, dz * scale - 2.5, 5, 5);
      }
    }

    // Single pre-culled 250-bot pass bucketed by fillStyle (ally, squad, enemy, downed)
    const allyCoords = this._mmAllyCoords || (this._mmAllyCoords = []);
    const squadCoords = this._mmSquadCoords || (this._mmSquadCoords = []);
    const enemyCoords = this._mmEnemyCoords || (this._mmEnemyCoords = []);
    const downedCoords = this._mmDownedCoords || (this._mmDownedCoords = []);
    allyCoords.length = 0;
    squadCoords.length = 0;
    enemyCoords.length = 0;
    downedCoords.length = 0;

    const playerTeam = this.player.team;
    const bots = this.botManager.bots;
    for (let i = 0; i < bots.length; i++) {
      const bot = bots[i];
      if (bot.dead) continue;
      const dx = bot.pos.x - px;
      if (dx > viewRangeX || dx < -viewRangeX) continue;
      const dz = bot.pos.z - pz;
      if (dz > viewRangeZ || dz < -viewRangeZ) continue;

      if (bot.team === playerTeam) {
        const bx = dx * scale;
        const bz = dz * scale;
        if (bot.downed) {
          downedCoords.push(bx, bz);
        } else if (bot.inPlayerSquad) {
          squadCoords.push(bx, bz);
        } else {
          allyCoords.push(bx, bz);
        }
      } else if (bot.uavRevealed || (bot.spottedTimer && bot.spottedTimer > 0)) {
        enemyCoords.push(dx * scale, dz * scale);
      }
    }

    const TAU = Math.PI * 2;
    if (enemyCoords.length > 0) {
      ctx.fillStyle = '#ff3838';
      ctx.beginPath();
      for (let i = 0; i < enemyCoords.length; i += 2) {
        const ex = enemyCoords[i];
        const ez = enemyCoords[i + 1];
        ctx.moveTo(ex + 2.8, ez);
        ctx.arc(ex, ez, 2.8, 0, TAU);
      }
      ctx.fill();
    }

    if (allyCoords.length > 0) {
      ctx.fillStyle = '#5dade2';
      ctx.beginPath();
      for (let i = 0; i < allyCoords.length; i += 2) {
        const bx = allyCoords[i];
        const bz = allyCoords[i + 1];
        ctx.moveTo(bx + 2.2, bz);
        ctx.arc(bx, bz, 2.2, 0, TAU);
      }
      ctx.fill();
    }

    if (squadCoords.length > 0) {
      ctx.fillStyle = '#2ecc71';
      ctx.beginPath();
      for (let i = 0; i < squadCoords.length; i += 2) {
        const bx = squadCoords[i];
        const bz = squadCoords[i + 1];
        ctx.moveTo(bx + 2.2, bz);
        ctx.arc(bx, bz, 2.2, 0, TAU);
      }
      ctx.fill();
    }

    if (downedCoords.length > 0) {
      ctx.fillStyle = '#ff5252';
      for (let i = 0; i < downedCoords.length; i += 2) {
        const bx = downedCoords[i];
        const bz = downedCoords[i + 1];
        ctx.fillRect(bx - 3, bz - 1, 6, 2);
        ctx.fillRect(bx - 1, bz - 3, 2, 6);
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

    // Squad Leader (★ SL) & Squad Objective (🎯) Pointers on HUD Minimap (clamped to rim if off-screen so you never get lost!)
    if (typeof this.computeSquadNavigationGuide === 'function') {
      const nav = this.computeSquadNavigationGuide();
      const maxRim = w * 0.5 - 11;
      if (nav?.targetWaypoint) {
        const wdx = (nav.targetWaypoint.x - px) * scale;
        const wdz = (nav.targetWaypoint.z - pz) * scale;
        const wLen = Math.hypot(wdx, wdz);
        if (wLen > 8) {
          const clamped = wLen > maxRim;
          const rx = clamped ? (wdx / wLen) * maxRim : wdx;
          const rz = clamped ? (wdz / wLen) * maxRim : wdz;
          ctx.strokeStyle = 'rgba(241, 196, 15, 0.42)';
          ctx.lineWidth = 1.2;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(rx, rz);
          ctx.stroke();
          ctx.setLineDash([]);
          if (clamped) {
            ctx.fillStyle = '#f1c40f';
            ctx.font = 'bold 8px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(nav.targetWaypoint.shortLabel || 'OBJ', rx, rz + 3);
          }
        }
      }
      if (nav?.squadLeader && this.player.commandRank !== 'SQUAD_LEADER') {
        const sdx = (nav.squadLeader.x - px) * scale;
        const sdz = (nav.squadLeader.z - pz) * scale;
        const sLen = Math.hypot(sdx, sdz);
        const clamped = sLen > maxRim;
        const sx = clamped ? (sdx / Math.max(1, sLen)) * maxRim : sdx;
        const sz = clamped ? (sdz / Math.max(1, sLen)) * maxRim : sdz;
        ctx.fillStyle = '#00ff88';
        ctx.strokeStyle = '#041b10';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(sx, sz, 4.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 7.5px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('SL', sx, sz - 6);
      }
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
    if (!canvas || !canvas.isConnected || canvas.style.display === 'none' || canvas.offsetParent === null) {
      return;
    }
    const cmdModal = typeof this.el === 'function' ? this.el('command-modal') : document.getElementById('command-modal');
    if (
      !cmdModal ||
      !cmdModal.isConnected ||
      cmdModal.classList.contains('hidden') ||
      cmdModal.style.display === 'none'
    ) {
      return;
    }
    const ctx = this._getCachedContext2D(canvas, '_cmdMapCtx');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = '#162318';
    ctx.fillRect(0, 0, w, h);

    const zoom = Math.max(1.0, Math.min(6.5, this._cmdMapZoom || 1.0));
    const panX = zoom <= 1.02 ? 0 : this._cmdMapPanX || 0;
    const panZ = zoom <= 1.02 ? 0 : this._cmdMapPanZ || 0;
    const spanX = 3480 / zoom;
    const spanZ = 2120 / zoom;
    this._cmdMapTransform = { zoom, panX, panZ, spanX, spanZ };

    const toMapX = (wx) => ((wx - panX) / spanX + 0.5) * w;
    const toMapY = (wz) => ((wz - panZ) / spanZ + 0.5) * h;

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
    const rLeft = toMapX(-26);
    const rRight = toMapX(26);
    ctx.fillStyle = '#1f536e';
    ctx.fillRect(rLeft, 0, Math.max(8, rRight - rLeft), h);

    // 3 Grand Bridges & Main Road Network
    const roadH = Math.max(5, (16 / spanZ) * h);
    ctx.fillStyle = '#2f363d';
    ctx.fillRect(0, toMapY(0) - roadH * 0.5, w, roadH);
    const brSpanW = Math.max(16, toMapX(32) - toMapX(-32));
    ctx.fillRect(toMapX(-32), toMapY(-400) - roadH * 0.4, brSpanW, roadH * 0.8);
    ctx.fillRect(toMapX(-32), toMapY(400) - roadH * 0.4, brSpanW, roadH * 0.8);

    // Standing Building & Skyscraper Rooftop Footprints (clickable in RIDE mode!)
    if (Array.isArray(this.world?.buildings)) {
      const hovId = this._cmdHoveredBuildingId ?? null;
      for (let i = 0; i < this.world.buildings.length; i++) {
        const b = this.world.buildings[i];
        if (!b) continue;
        const bx0 = toMapX(b.minWx);
        const by0 = toMapY(b.minWz);
        const bw = Math.max(zoom >= 2.5 ? 6 : 3, toMapX(b.maxWx) - bx0);
        const bh = Math.max(zoom >= 2.5 ? 6 : 3, toMapY(b.maxWz) - by0);
        if (bx0 + bw < -4 || bx0 > w + 4 || by0 + bh < -4 || by0 > h + 4) continue;

        const isTallRoof = (b.floors || 1) >= 8;
        const isHov = hovId === b.id;
        if (b.collapsed) {
          ctx.fillStyle = 'rgba(60, 45, 40, 0.55)';
          ctx.fillRect(bx0, by0, bw, bh);
          continue;
        }
        ctx.fillStyle = isHov
          ? 'rgba(241, 196, 15, 0.85)'
          : isTallRoof
          ? 'rgba(0, 210, 211, 0.34)'
          : 'rgba(189, 195, 199, 0.28)';
        ctx.fillRect(bx0, by0, bw, bh);
        ctx.strokeStyle = isHov ? '#fff200' : isTallRoof ? '#00ecec' : 'rgba(236, 240, 241, 0.55)';
        ctx.lineWidth = isHov ? 2.2 : isTallRoof ? 1.4 : 0.9;
        ctx.strokeRect(bx0, by0, bw, bh);

        if (bw >= 16 && bh >= 14) {
          ctx.fillStyle = isHov ? '#08141c' : '#ffeaa7';
          ctx.font = 'bold 9px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(isTallRoof ? `H•${b.floors}F` : `${b.floors}F`, bx0 + bw * 0.5, by0 + bh * 0.5 + 3);
        }
      }
    }

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
    const nav = typeof this.computeSquadNavigationGuide === 'function' ? this.computeSquadNavigationGuide() : null;
    const flagDistrictTags = {
      A: 'WEST TOWN',
      B: 'CONTAINERS',
      C: 'DOWNTOWN',
      D: 'RADAR HILL',
      E: 'INDUSTRIAL'
    };

    // Bridge Landmark Labels
    ctx.fillStyle = 'rgba(189, 195, 199, 0.55)';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N. BRIDGE', toMapX(0), toMapY(-400) - 6);
    ctx.fillText('CENTRAL BRIDGE', toMapX(0), toMapY(0) - 7);
    ctx.fillText('S. BRIDGE', toMapX(0), toMapY(400) - 6);

    // 5 Capture Flags (Interactive click targets + District Names + Active Target Highlight)
    for (const f of this.world.flags) {
      const fx = toMapX(f.pos.x);
      const fy = toMapY(f.pos.z);
      const isOrdered =
        (cmdOrder && cmdOrder.timer > 0 && cmdOrder.action === 'OBJECTIVE' && cmdOrder.flagId === f.id) ||
        (nav?.targetWaypoint?.flagId === f.id);

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
        ctx.strokeStyle = 'rgba(241, 196, 15, 0.55)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(fx, fy, 22, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#f1c40f';
        ctx.font = 'bold 9.5px sans-serif';
        ctx.fillText('🎯 GO HERE', fx, fy - 24);
      }

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(f.id, fx, fy + 4);

      if (flagDistrictTags[f.id]) {
        ctx.fillStyle = 'rgba(236, 240, 241, 0.78)';
        ctx.font = 'bold 8px sans-serif';
        ctx.fillText(flagDistrictTags[f.id], fx, fy + 26);
      }
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

    // Friendly Bots, Squadmates & Spotted Enemies
    const slBotRef = nav?.squadLeader?.bot || null;
    for (const bot of this.botManager.bots) {
      if (bot.dead) continue;
      if (bot.team === team) {
        const bx = toMapX(bot.pos.x);
        const by = toMapY(bot.pos.z);
        if (bot.inPlayerSquad || bot.squad === (this.player.squad || 'ALPHA')) {
          ctx.fillStyle = '#2ecc71';
          ctx.strokeStyle = '#062012';
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.arc(bx, by, 3.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillStyle = '#5dade2';
          ctx.fillRect(bx - 2, by - 2, 4, 4);
        }
      } else if (bot.uavRevealed || (bot.spottedTimer && bot.spottedTimer > 0)) {
        ctx.fillStyle = '#ff3838';
        ctx.fillRect(toMapX(bot.pos.x) - 2.2, toMapY(bot.pos.z) - 2.2, 4.4, 4.4);
      }
    }

    // Squad Group Halo Ring around Player's Squad Centroid
    if (nav?.squadCentroid && nav.squadCentroid.aliveCount >= 2) {
      const scx = toMapX(nav.squadCentroid.x);
      const scy = toMapY(nav.squadCentroid.z);
      ctx.strokeStyle = 'rgba(46, 204, 113, 0.65)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(scx, scy, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#7bed9f';
      ctx.font = 'bold 8.5px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`👥 ${nav.squadId} (${nav.squadCentroid.aliveCount})`, scx, scy + 23);
    }

    // Dashed GPS Route Vectors: YOU ➔ ★ SQUAD LEADER ➔ 🎯 TARGET WAYPOINT
    const pMapX = toMapX(nav?.playerPos?.x ?? this.player.pos.x);
    const pMapY = toMapY(nav?.playerPos?.z ?? this.player.pos.z);
    let routeFromX = pMapX;
    let routeFromY = pMapY;

    if (nav?.squadLeader && slBotRef && this.player.commandRank !== 'SQUAD_LEADER') {
      const slX = toMapX(nav.squadLeader.x);
      const slY = toMapY(nav.squadLeader.z);
      if (!this.player.dead && Math.hypot(slX - pMapX, slY - pMapY) > 10) {
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 2.0;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(pMapX, pMapY);
        ctx.lineTo(slX, slY);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      routeFromX = slX;
      routeFromY = slY;

      // Prominent ★ SQUAD LEADER Star Badge
      ctx.fillStyle = '#00ff88';
      ctx.strokeStyle = '#f1c40f';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.arc(slX, slY, 6.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#04180c';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('★', slX, slY + 3);
      ctx.fillStyle = '#a3f7bf';
      ctx.font = 'bold 9.5px sans-serif';
      ctx.fillText(`★ SL (${nav.squadLeader.distM}m)`, slX, slY - 10);
    }

    if (nav?.targetWaypoint) {
      const wpX = toMapX(nav.targetWaypoint.x);
      const wpY = toMapY(nav.targetWaypoint.z);
      if (Math.hypot(wpX - routeFromX, wpY - routeFromY) > 14) {
        ctx.strokeStyle = '#f1c40f';
        ctx.lineWidth = 2.2;
        ctx.setLineDash([7, 4]);
        ctx.beginPath();
        ctx.moveTo(routeFromX, routeFromY);
        ctx.lineTo(wpX, wpY);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Local Player Directional Marker + View Cone ("📍 YOU")
    if (!this.player.dead) {
      const px = pMapX;
      const py = pMapY;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(-(this.player.yaw || 0));
      ctx.fillStyle = 'rgba(241, 196, 15, 0.24)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-12, -26);
      ctx.lineTo(12, -26);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#f1c40f';
      ctx.strokeStyle = '#111111';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, -7.5);
      ctx.lineTo(-5.5, 5.5);
      ctx.lineTo(0, 2.5);
      ctx.lineTo(5.5, 5.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      ctx.strokeStyle = 'rgba(241, 196, 15, 0.78)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(px, py, 10.5, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#ffeaa7';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('📍 YOU', px, py + 20);
    }
  }
};

export default MinimapRenderer;
