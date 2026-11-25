import * as THREE from '../../vendor/three.module.js';

const MARKER_POOL_TYPES = ['flag', 'ally', 'spot', 'revive', 'airBox', 'leadLine', 'misc'];

export const WorldMarkers = {
  _ensureMarkerSubPools() {
    if (!this._markerSubPools) {
      this._markerSubPools = {
        flag: { items: [], idx: 0 },
        ally: { items: [], idx: 0 },
        spot: { items: [], idx: 0 },
        revive: { items: [], idx: 0 },
        airBox: { items: [], idx: 0 },
        leadLine: { items: [], idx: 0 },
        misc: { items: [], idx: 0 }
      };
    }
    return this._markerSubPools;
  },

  _acquireWorldMarkerSlot(type = 'misc') {
    const pools = this._ensureMarkerSubPools();
    const bucket = pools[type] || pools.misc;
    const index = bucket.idx++;
    let slot = bucket.items[index];
    if (!slot) {
      const root = document.createElement('div');
      root.className = 'world-marker';
      root.style.left = '0px';
      root.style.top = '0px';
      root._visible = true;

      const iconEl = document.createElement('div');
      const iconSpan = document.createElement('span');
      const distEl = document.createElement('div');
      distEl.className = 'world-marker-dist';

      if (type === 'leadLine') {
        root.style.transformOrigin = '0 50%';
        iconEl.style.cssText =
          'width:1px;height:1.8px;background:#00d2d3;transform-origin:0 50%;pointer-events:none;';
        distEl.style.display = 'none';
      }

      root.appendChild(iconEl);
      root.appendChild(distEl);
      this.worldMarkersEl.appendChild(root);

      slot = {
        root,
        iconEl,
        iconSpan,
        distEl,
        visible: true,
        type,
        transform: '',
        opacity: '',
        iconClass: '',
        iconStyle: '',
        iconText: '',
        lineColor: type === 'leadLine' ? '#00d2d3' : '',
        hasSpan: false,
        distVisible: type !== 'leadLine',
        distText: '',
        distColor: '',
        distWeight: ''
      };
      bucket.items[index] = slot;
    } else if (slot.root._visible === false) {
      slot.root.style.display = '';
      slot.root._visible = true;
      slot.visible = true;
    }
    return slot;
  },

  _configureLeadLineSlot(slot, startX, startY, angleDeg, lenPx, color, opacity) {
    const transform = `translate3d(${startX.toFixed(1)}px, ${startY.toFixed(1)}px, 0) rotate(${angleDeg.toFixed(1)}deg) scaleX(${lenPx.toFixed(1)})`;
    if (slot.transform !== transform) {
      slot.root.style.transform = transform;
      slot.transform = transform;
    }
    const opStr = String(opacity);
    if (slot.opacity !== opStr) {
      slot.root.style.opacity = opStr;
      slot.opacity = opStr;
    }
    if (slot.lineColor !== color) {
      slot.iconEl.style.background = color;
      slot.lineColor = color;
    }
  },

  projectWorldToScreen(worldPos, yOffset = 0, cam = null, w = 0, h = 0) {
    const camera = cam || this.player.camera;
    const vw = w || window.innerWidth;
    const vh = h || window.innerHeight;
    const projVec = this._projVec || (this._projVec = new THREE.Vector3());
    const out =
      this._projOut ||
      (this._projOut = { x: 0, y: 0, behind: false, ndcZ: 0, centerDist: 0 });

    projVec.set(worldPos.x, worldPos.y + yOffset, worldPos.z).project(camera);
    out.ndcZ = projVec.z;
    if (projVec.z > 1) {
      out.behind = true;
      return out;
    }
    out.behind = false;
    const sx = Math.round((projVec.x * 0.5 + 0.5) * vw);
    const sy = Math.round((-projVec.y * 0.5 + 0.5) * vh);
    out.x = sx;
    out.y = sy;
    out.centerDist = Math.hypot(sx - vw * 0.5, sy - vh * 0.5);
    return out;
  },

  _configureMarkerSlot(slot, opts) {
    const transform = `translate3d(${opts.x}px, ${opts.y}px, 0) translate(-50%, -50%)`;
    if (slot.transform !== transform) {
      slot.root.style.transform = transform;
      slot.transform = transform;
    }

    const opStr = String(opts.opacity);
    if (slot.opacity !== opStr) {
      slot.root.style.opacity = opStr;
      slot.opacity = opStr;
    }

    const iconClass = opts.iconClass || '';
    if (slot.iconClass !== iconClass) {
      slot.iconEl.className = iconClass;
      slot.iconClass = iconClass;
    }

    const iconStyle = opts.iconStyle || '';
    if (slot.iconStyle !== iconStyle) {
      slot.iconEl.style.cssText = iconStyle;
      slot.iconStyle = iconStyle;
    }

    const useSpan = Boolean(opts.useSpan);
    if (useSpan) {
      if (!slot.hasSpan) {
        slot.iconEl.textContent = '';
        slot.iconEl.appendChild(slot.iconSpan);
        slot.hasSpan = true;
        slot.iconText = '';
      }
      const iconText = opts.iconText || '';
      if (slot.iconText !== iconText) {
        slot.iconSpan.textContent = iconText;
        slot.iconText = iconText;
      }
    } else {
      if (slot.hasSpan) {
        if (slot.iconSpan.parentNode === slot.iconEl) {
          slot.iconEl.removeChild(slot.iconSpan);
        }
        slot.hasSpan = false;
        slot.iconText = '';
      }
      const iconText = opts.iconText || '';
      if (slot.iconText !== iconText) {
        slot.iconEl.textContent = iconText;
        slot.iconText = iconText;
      }
    }

    const distText = opts.distText || '';
    const showDist = Boolean(distText);
    if (slot.distVisible !== showDist) {
      slot.distEl.style.display = showDist ? '' : 'none';
      slot.distVisible = showDist;
    }
    if (showDist) {
      if (slot.distText !== distText) {
        slot.distEl.textContent = distText;
        slot.distText = distText;
      }
      const distColor = opts.distColor || '';
      if (slot.distColor !== distColor) {
        slot.distEl.style.color = distColor;
        slot.distColor = distColor;
      }
      const distWeight = opts.distWeight || '';
      if (slot.distWeight !== distWeight) {
        slot.distEl.style.fontWeight = distWeight;
        slot.distWeight = distWeight;
      }
    }
  },

  updateWorldSpaceMarkers() {
    if (!this.worldMarkersEl) return;
    const cam = this.player.camera;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const inAds = this.player.adsAmount > 0.25;
    const isPlayerMedic = String(this.player.role || '').toUpperCase() === 'MEDIC';

    const pools = this._ensureMarkerSubPools();
    for (let i = 0; i < MARKER_POOL_TYPES.length; i++) {
      pools[MARKER_POOL_TYPES[i]].idx = 0;
    }

    const projectToScreen = (worldPos, yOffset = 0) => {
      const out = this.projectWorldToScreen(worldPos, yOffset, cam, w, h);
      return out.behind ? null : out;
    };

    // Sightline Auto-Fade: markers near the crosshair fade strongly in both Hipfire and ADS
    // so they never obstruct enemies standing behind or near friendly units/objectives!
    const getSightlineOpacity = (centerDist, baseOpacity = 0.78, minOpacity = 0.16) => {
      if (inAds) {
        return centerDist < 170 ? 0.12 : 0.26;
      }
      if (centerDist < 165) {
        const t = Math.max(0, centerDist / 165);
        return Number((minOpacity + (baseOpacity - minOpacity) * (t * t)).toFixed(2));
      }
      return baseOpacity;
    };

    // 1. 3D Floating Objective Diamonds (A-E) — compact & auto-faded near crosshair, highlighted when ordered!
    const team = this.player.team || 'US';
    const sqId = this.player.squad || 'ALPHA';
    const activeCmdOrder =
      this.player.commandScope === 'ALL'
        ? this.botManager.commanderOrders && this.botManager.commanderOrders[team]
        : this.botManager.squadOrders &&
          this.botManager.squadOrders[team] &&
          this.botManager.squadOrders[team][sqId];

    for (const flag of this.world.flags) {
      const scr = projectToScreen(flag.pos, 7.2);
      if (!scr) continue;
      const dist = Math.round(this.player.pos.distanceTo(flag.pos));
      const isOrderedFlag =
        activeCmdOrder &&
        activeCmdOrder.timer > 0 &&
        activeCmdOrder.action === 'OBJECTIVE' &&
        activeCmdOrder.flagId === flag.id;
      const bgCol =
        flag.owner === 'US'
          ? 'rgba(41, 128, 185, 0.78)'
          : flag.owner === 'RU'
          ? 'rgba(192, 57, 43, 0.78)'
          : 'rgba(127, 140, 141, 0.68)';
      const borderStyle = isOrderedFlag ? ';border:2px solid #f1c40f;box-shadow:0 0 12px #f1c40f;' : '';
      const op = getSightlineOpacity(scr.centerDist, isOrderedFlag ? 0.94 : 0.82, 0.18);
      const slot = this._acquireWorldMarkerSlot('flag');
      this._configureMarkerSlot(slot, {
        x: scr.x,
        y: scr.y,
        opacity: op,
        iconClass: 'world-flag-diamond',
        iconStyle: `background:${bgCol}${borderStyle}`,
        useSpan: true,
        iconText: flag.id,
        distText:
          isOrderedFlag && !inAds
            ? `⚔️ ORDER (${dist}m)`
            : scr.centerDist > 90 && !inAds
            ? `${dist}m`
            : '',
        distColor: isOrderedFlag && !inAds ? '#f1c40f' : '',
        distWeight: isOrderedFlag && !inAds ? '900' : ''
      });
    }

    // 1b. 3D Marker for "DEFEND HERE" (HOLD) Order Position
    if (
      activeCmdOrder &&
      activeCmdOrder.timer > 0 &&
      activeCmdOrder.action === 'HOLD' &&
      activeCmdOrder.pos
    ) {
      const holdScr = projectToScreen(activeCmdOrder.pos, 2.6);
      if (holdScr) {
        const holdDist = Math.round(this.player.pos.distanceTo(activeCmdOrder.pos));
        const op = getSightlineOpacity(holdScr.centerDist, 0.9, 0.2);
        const slot = this._acquireWorldMarkerSlot('misc');
        this._configureMarkerSlot(slot, {
          x: holdScr.x,
          y: holdScr.y,
          opacity: op,
          iconClass: '',
          iconStyle:
            'background:rgba(39,174,96,0.88);border:1.5px solid #f1c40f;color:#fff;font-size:10px;font-weight:900;padding:2px 6px;border-radius:3px;white-space:nowrap;',
          iconText: `🛡️ DEFEND HERE (${holdDist}m)`,
          distText: ''
        });
      }
    }

    // 2. Friendly Chevrons, Clustered Downed '+' Micro-Dots, and Spotted Enemy Diamonds
    //    (Zero bulky text banners on the horizon — clusters of downed allies merge into a single tiny '+N' dot!)
    const maxDownedIconDist = isPlayerMedic ? 42 : 28;
    const downedClusters = [];

    for (const bot of this.botManager.bots) {
      if (bot.dead) continue;
      const dist = this.player.pos.distanceTo(bot.pos);

      if (bot.team === this.player.team) {
        if (bot.downed && dist < maxDownedIconDist) {
          const scr = projectToScreen(bot.pos, 1.05);
          if (scr) {
            // Merge nearby downed markers within 52px on screen so clusters of casualties never stack!
            let merged = false;
            for (const cl of downedClusters) {
              if (Math.hypot(cl.x - scr.x, cl.y - scr.y) < 52) {
                cl.count++;
                if (dist < cl.minDist) {
                  cl.minDist = dist;
                  cl.x = scr.x;
                  cl.y = scr.y;
                  cl.centerDist = scr.centerDist;
                  cl.closestBot = bot;
                }
                if (bot.rescuer && !bot.rescuer.dead && !bot.rescuer.downed) {
                  cl.hasRescuer = true;
                  if (bot.rescuer.rescueState === 'REVIVE') cl.isReviving = true;
                }
                merged = true;
                break;
              }
            }
            if (!merged) {
              const hasRescuer = Boolean(bot.rescuer && !bot.rescuer.dead && !bot.rescuer.downed);
              const isReviving = Boolean(hasRescuer && bot.rescuer.rescueState === 'REVIVE');
              downedClusters.push({
                x: scr.x,
                y: scr.y,
                centerDist: scr.centerDist,
                minDist: dist,
                count: 1,
                closestBot: bot,
                hasRescuer,
                isReviving
              });
            }
          }
        } else if (!bot.downed && !bot.drivingVehicle && dist < 55) {
          const scr = projectToScreen(bot.pos, 2.2);
          if (scr) {
            const color = bot.inPlayerSquad
              ? '#2ecc71'
              : bot.role === 'MEDIC'
              ? '#7bed9f'
              : '#48dbfb';
            const op = getSightlineOpacity(scr.centerDist, 0.68, 0.14);
            // Only show a short name when very close (< 8m) and outside the central aiming reticle
            const showShortName = dist < 8 && scr.centerDist > 85 && !inAds;
            const slot = this._acquireWorldMarkerSlot('ally');
            this._configureMarkerSlot(slot, {
              x: scr.x,
              y: scr.y,
              opacity: op,
              iconClass: 'world-ally-chevron',
              iconStyle: `border-top-color:${color}`,
              iconText: '',
              distText: showShortName ? bot.name : '',
              distColor: showShortName ? color : ''
            });
          }
        }
      } else if (
        !bot.downed &&
        ((bot.spottedTimer > 0 && dist < 160) || (bot.uavRevealed && dist < 380))
      ) {
        const scr = projectToScreen(bot.pos, 2.25);
        if (scr) {
          const op = getSightlineOpacity(scr.centerDist, bot.uavRevealed ? 0.88 : 0.85, 0.25);
          const showDist = bot.uavRevealed && scr.centerDist > 95 && !inAds && dist < 180;
          const slot = this._acquireWorldMarkerSlot('spot');
          this._configureMarkerSlot(slot, {
            x: scr.x,
            y: scr.y,
            opacity: op,
            iconClass: 'world-spot-diamond',
            iconStyle: '',
            iconText: '',
            distText: showDist ? `${Math.round(dist)}m` : '',
            distColor: showDist ? '#ff5252' : ''
          });
        }
      }
    }

    // 2a. UAV / JTAC / Infantry CAS-Revealed Enemy Armor & Vehicles (3D Orange Target Boxes in World View!)
    if (this.vehicleManager && this.vehicleManager.vehicles) {
      for (const v of this.vehicleManager.vehicles) {
        if (v.dead || v.team === this.player.team) continue;
        const isPainted =
          (this.player.uavActive && v.uavRevealed) ||
          (v.jtacLaserTimer && v.jtacLaserTimer > 0) ||
          (v.spottedTimer && v.spottedTimer > 0);
        if (!isPainted) continue;
        const vDist = Math.round(this.player.pos.distanceTo(v.pos));
        if (vDist > 520) continue;
        const scr = projectToScreen(v.pos, 3.4);
        if (scr) {
          const op = getSightlineOpacity(scr.centerDist, 0.92, 0.28);
          const vTypeLabel = v.isAircraft
            ? 'AIRCRAFT'
            : v.type === 'tank'
            ? 'TANK'
            : v.type === 'apc'
            ? 'BTR/IFV'
            : v.type === 'aa'
            ? 'SPAAG AA'
            : 'ARMORED CAR';
          const slot = this._acquireWorldMarkerSlot('misc');
          this._configureMarkerSlot(slot, {
            x: scr.x,
            y: scr.y,
            opacity: op,
            iconClass: '',
            iconStyle:
              'background:rgba(211,84,0,0.88);border:1.5px solid #f1c40f;color:#fff;font-size:9.5px;font-weight:900;padding:1.5px 5px;border-radius:3px;white-space:nowrap;',
            iconText: `🎯 ${v.team} ${vTypeLabel} (${vDist}m)`,
            distText: ''
          });
        }
      }
    }

    // 2a-1b. Friendly Infantry Close Air Support (CAS) Request Beacon & Pilot Turn Arrow
    const activeCasReq =
      this.world &&
      this.world.activeCasRequest &&
      this.world.activeCasRequest.timer > 0 &&
      this.world.activeCasRequest.team === this.player.team
        ? this.world.activeCasRequest
        : null;
    if (activeCasReq && activeCasReq.pos) {
      const casRaw = this.projectWorldToScreen(activeCasReq.pos, 3.2, cam, w, h);
      const casDist = Math.round(this.player.pos.distanceTo(activeCasReq.pos));
      const casSecs = Math.max(0, activeCasReq.timer).toFixed(0);
      const onScreenCas =
        !casRaw.behind && casRaw.x >= 44 && casRaw.x <= w - 44 && casRaw.y >= 44 && casRaw.y <= h - 44;
      if (onScreenCas) {
        const slot = this._acquireWorldMarkerSlot('misc');
        this._configureMarkerSlot(slot, {
          x: casRaw.x,
          y: casRaw.y,
          opacity: 0.96,
          iconClass: '',
          iconStyle:
            'background:rgba(231,76,60,0.92);border:2px solid #ffd32a;color:#fff;font-size:10px;font-weight:900;padding:2px 7px;border-radius:3px;white-space:nowrap;box-shadow:0 0 14px rgba(255,71,87,0.9);',
          iconText: `🐗 ${activeCasReq.squad || 'INF'} CAS TARGET • RED SMOKE (${casDist}m • ${casSecs}s)`,
          distText: ''
        });
      } else if (this.player.activeVehicle && this.player.activeVehicle.isAircraft) {
        const invCamQ = (this._invCamQuat || (this._invCamQuat = new THREE.Quaternion()))
          .copy(cam.quaternion)
          .invert();
        const relV = (this._offScreenVec || (this._offScreenVec = new THREE.Vector3()))
          .copy(activeCasReq.pos)
          .sub(this.player.activeVehicle.pos)
          .applyQuaternion(invCamQ);
        let dx = relV.x;
        let dy = -relV.y;
        const len = Math.hypot(dx, dy) || 1;
        dx /= len;
        dy /= len;
        const ringR = Math.min(w, h) * 0.28;
        const ax = Math.round(w * 0.5 + dx * ringR);
        const ay = Math.round(h * 0.5 + dy * ringR);
        const angDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
        const slot = this._acquireWorldMarkerSlot('misc');
        this._configureMarkerSlot(slot, {
          x: ax,
          y: ay,
          opacity: 0.96,
          iconClass: '',
          iconStyle: `width:26px;height:26px;display:flex;align-items:center;justify-content:center;background:rgba(231,76,60,0.28);border:1.8px solid #ffd32a;border-radius:50%;color:#ffd32a;font-size:13px;font-weight:900;transform:rotate(${angDeg.toFixed(1)}deg);box-shadow:0 0 10px rgba(255,211,42,0.75);`,
          iconText: '➤',
          distText: `🐗 CAS SMOKE ${casDist}m`,
          distColor: '#ffd32a',
          distWeight: '900'
        });
      }
    }

    // 2a-2. 3D Inbound Airstrike Target Marker in World View
    if (this.player.airstrikeTarget && this.player.airstrikeTarget.pos) {
      const aPos = this.player.airstrikeTarget.pos;
      const aScr = projectToScreen(aPos, 2.5);
      if (aScr) {
        const aDist = Math.round(this.player.pos.distanceTo(aPos));
        const aSecs = Math.max(0, this.player.airstrikeTarget.timer).toFixed(1);
        const slot = this._acquireWorldMarkerSlot('misc');
        this._configureMarkerSlot(slot, {
          x: aScr.x,
          y: aScr.y,
          opacity: 0.95,
          iconClass: '',
          iconStyle:
            'background:rgba(192,57,43,0.92);border:1.5px solid #ff7675;color:#fff;font-size:10.5px;font-weight:900;padding:2px 7px;border-radius:3px;white-space:nowrap;box-shadow:0 0 12px rgba(231,76,60,0.85);',
          iconText: `💥 STRIKE TARGET ${aSecs}s (${aDist}m)`,
          distText: ''
        });
      }
    }

    // 2a-3. Aircraft & Anti-Air Avionics HUD:
    //       100% Transparent Hollow Target Designator (TD) Boxes & Diamonds (Ace Combat / Battlefield 4 style)
    //       so 3D enemy planes and ground vehicles inside the brackets are NEVER blocked by opaque text pills!
    const activeVeh = this.player.activeVehicle;
    const activeAircraft = activeVeh && activeVeh.isAircraft ? activeVeh : null;
    const isAaGround =
      activeVeh && !activeVeh.isAircraft && (activeVeh.type === 'aa' || activeVeh.type === 'emplace_aa');
    const isMortarEmplace = activeVeh && activeVeh.type === 'emplace_mortar';
    const curWep = !activeVeh && this.player.currentWeapon ? this.player.currentWeapon() : null;
    const holdingStinger = Boolean(curWep && curWep.def && curWep.def.type === 'stinger');

    if (activeAircraft || isAaGround || isMortarEmplace || holdingStinger) {
      // 1) True Hollow Circular CCIP / Gun Pipper Reticle Ring (Hidden in AC-130 Gunner Sight where CoD Reticle is exact bore-sight!)
      const hideCcipInGunshipSight = Boolean(
        activeAircraft &&
          ((activeAircraft.aircraftRole === 'gunship' &&
            (!activeAircraft.gunshipManualFlight || this.player.vehicleCameraMode === 'OPTIC_NOSE')) ||
            (activeAircraft.aircraftRole === 'fighter' && activeAircraft.activeWeaponSlot === 1))
      );
      if (this.player.aircraftCcipPoint && (activeAircraft || isMortarEmplace) && !hideCcipInGunshipSight) {
        const ccipScr = projectToScreen(this.player.aircraftCcipPoint, 0.8);
        if (ccipScr) {
          const refPos = activeVeh ? activeVeh.pos : this.player.pos;
          const ccipDist = Math.round(refPos.distanceTo(this.player.aircraftCcipPoint));
          const aRoleNow = activeAircraft ? activeAircraft.aircraftRole || activeAircraft.type : '';
          const actSlotNow = activeAircraft ? activeAircraft.activeWeaponSlot || 0 : 0;
          const isCasPipe = aRoleNow === 'cas';
          const isBombOrMortar =
            isMortarEmplace ||
            (activeAircraft &&
              (aRoleNow === 'gunship' ||
                aRoleNow === 'b2_spirit' ||
                (aRoleNow === 'fighter' && actSlotNow === 2) ||
                (aRoleNow === 'cas' && actSlotNow === 2)));
          // Always render Ground/Gravity-Drop Impact Pipper in crisp Emerald Green (#7bed9f / #2ecc71)
          // so it is visually 100% distinct from the fixed Cyan (#00d2d3) Nose / Radar Seeker Crosshair!
          const ringColor = isMortarEmplace ? '#f1c40f' : isBombOrMortar ? '#2ecc71' : '#7bed9f';
          const slot = this._acquireWorldMarkerSlot('airBox');
          this._configureMarkerSlot(slot, {
            x: ccipScr.x,
            y: ccipScr.y,
            opacity: 0.94,
            iconClass: '',
            iconStyle: `width:26px;height:26px;background:transparent;border:1.8px dashed ${ringColor};border-radius:50%;box-sizing:border-box;display:flex;align-items:center;justify-content:center;color:${ringColor};font-size:11px;font-weight:900;box-shadow:0 0 8px rgba(0,0,0,0.65);`,
            iconText: '⊕',
            distText: isMortarEmplace
              ? `81MM IMPACT (${ccipDist}m)`
              : isBombOrMortar
              ? `BOMB IMPACT (${ccipDist}m)`
              : isCasPipe
              ? actSlotNow === 1
                ? `ROCKET IMPACT (${ccipDist}m)`
                : `30MM IMPACT (${ccipDist}m)`
              : `GUN IMPACT (${ccipDist}m)`,
            distColor: ringColor,
            distWeight: '900'
          });
        }
      }

      // 1b) AC-130 Computerized Fire-Control System (FCS) Ground Moving-Target Auto-Lead Indicator
      if (
        activeAircraft &&
        activeAircraft.aircraftRole === 'gunship' &&
        activeAircraft.fcsTrackedGroundTarget &&
        activeAircraft.fcsLeadPos &&
        !activeAircraft.fcsTrackedGroundTarget.dead
      ) {
        const fcsScr = projectToScreen(activeAircraft.fcsLeadPos, 1.4);
        if (fcsScr) {
          const leadM = Math.round(activeAircraft.fcsLeadMeters || 0);
          const fcsSlot = this._acquireWorldMarkerSlot('airBox');
          this._configureMarkerSlot(fcsSlot, {
            x: fcsScr.x,
            y: fcsScr.y,
            opacity: 0.96,
            iconClass: '',
            iconStyle:
              'width:22px;height:22px;background:transparent;border:2px solid #00d2d3;border-radius:50%;box-sizing:border-box;display:flex;align-items:center;justify-content:center;color:#00d2d3;font-size:10px;font-weight:900;box-shadow:0 0 10px rgba(0,210,211,0.85);',
            iconText: '⊹',
            distText: leadM >= 2 ? `FCS AUTO-LEAD (+${leadM}m)` : 'FCS TRACK LOCKED',
            distColor: '#00d2d3',
            distWeight: '900'
          });
        }
      }

      // 2) Hollow Target Designator (TD) Boxes for Enemy/Friendly Aircraft & Hollow Diamonds for Ground Vehicles
      if (this.vehicleManager && Array.isArray(this.vehicleManager.vehicles)) {
        const refPos = activeVeh ? activeVeh.pos : this.player.pos;
        const lockTgt = holdingStinger
          ? this.player.stingerLockTarget
          : this.player.aircraftLockTarget;
        const lockProg = holdingStinger
          ? this.player.stingerLockProgress || 0
          : this.player.aircraftLockProgress || 0;

        for (const v of this.vehicleManager.vehicles) {
          if (v.dead || v === activeVeh) continue;
          const vDist = Math.round(refPos.distanceTo(v.pos));

          if (v.isAircraft) {
            const vGroundY = this.world ? this.world.getGroundHeightAt(v.pos.x, v.pos.z) : 0;
            const vAltAgl = Math.max(0, v.pos.y - vGroundY);
            if (vAltAgl < 6 && !v.driver && !v.npcDriver && !v.aiPilotActive) continue;
            if ((holdingStinger || isAaGround) && v.team === this.player.team) continue;
            const isEnemy = v.team !== this.player.team;
            if (isEnemy) {
              // 1) If the player's own aircraft is still parked/rolling on their airport runway (< 12m AGL),
              //    airborne target radar is in ground-standby so distant enemy planes aren't boxed across the map!
              if (activeVeh && activeVeh.isAircraft) {
                const myGroundY = this.world ? this.world.getGroundHeightAt(activeVeh.pos.x, activeVeh.pos.z) : 0;
                const myAltAgl = Math.max(0, activeVeh.pos.y - myGroundY);
                if (myAltAgl < 12.0 && (activeVeh.airborneRadarTimer || 0) < 2.0 && vDist > 220) {
                  continue;
                }
              }
              // 2) Ground-Effect / Low-Altitude Radar Clutter Masking (< 28m AGL) & Post-Takeoff Grace Period (4.0s):
              //    Enemy planes on the runway, climbing out during their first 4s after liftoff, or flying treetop-low
              //    (< 28m AGL) blend into terrain ground clutter and do not appear with radar TD square boxes!
              const inTakeoffGrace = (v.airborneRadarTimer || 0) < 4.0;
              const inLowAltGroundClutter = vAltAgl < 28.0 || Boolean(v.isLowAltRadarMasked);
              if ((inTakeoffGrace || inLowAltGroundClutter) && vDist > 165) {
                continue;
              }
            }
            const rawScr = this.projectWorldToScreen(v.pos, 0, cam, w, h);
            const isOffScreenOrBehind =
              rawScr.behind ||
              rawScr.x < 52 ||
              rawScr.x > w - 52 ||
              rawScr.y < 52 ||
              rawScr.y > h - 52;
            const shortModel = v.name ? v.name.split(' ')[0] : v.type.toUpperCase();
            const isLocked = lockTgt === v && lockProg >= 1;
            const isSeeking = lockTgt === v && lockProg > 0.05 && lockProg < 1;
            const dAltM = Math.round(v.pos.y - refPos.y);
            const relAltTag =
              Math.abs(dAltM) >= 12 ? ` ${dAltM > 0 ? `▲+${dAltM}m` : `▼${dAltM}m`}` : ' =ALT';

            // 360° Off-Boresight Dogfight Directional Turn Indicator Arrow (when enemy plane is behind/above/below/off-screen!)
            // Suppressed inside AC-130 Pylon Orbit Gunner Sight so air-to-air dogfight clutter never floats over ground targets!
            const inGunshipOrbitHud = Boolean(
              activeAircraft &&
                activeAircraft.aircraftRole === 'gunship' &&
                !activeAircraft.gunshipManualFlight
            );
            if (isOffScreenOrBehind) {
              if (
                isEnemy &&
                !inGunshipOrbitHud &&
                (activeAircraft || isAaGround || holdingStinger) &&
                vDist < 1950
              ) {
                const invCamQ = (this._invCamQuat || (this._invCamQuat = new THREE.Quaternion()))
                  .copy(cam.quaternion)
                  .invert();
                const camWorldPos = (this._camWorldPosTmp || (this._camWorldPosTmp = new THREE.Vector3()));
                cam.getWorldPosition(camWorldPos);
                const relV = (this._offScreenVec || (this._offScreenVec = new THREE.Vector3()))
                  .copy(v.pos)
                  .sub(camWorldPos)
                  .applyQuaternion(invCamQ);
                // Camera local space: +X right, +Y up, -Z forward (+Z behind!)
                let dirX = relV.x;
                let dirY = -relV.y;
                const planarLen = Math.hypot(dirX, dirY);
                if (planarLen < 0.001) {
                  dirX = 0;
                  dirY = -1;
                } else {
                  dirX /= planarLen;
                  dirY /= planarLen;
                }
                const ringRadius = Math.min(198, Math.min(w, h) * 0.25);
                let ax = Math.round(w * 0.5 + dirX * ringRadius);
                let ay = Math.round(h * 0.5 + dirY * ringRadius);
                // Keep horizontal arrows clear of the +/-175px SPD & ALT HUD tapes
                if (Math.abs(ay - h * 0.5) < 42 && Math.abs(ax - w * 0.5) > 115) {
                  ay = Math.round(h * 0.5 + (dirY < 0 ? -56 : 56));
                }
                const arrowAngleDeg = (Math.atan2(dirY, dirX) * 180) / Math.PI;
                const isSixOClock = relV.z > Math.abs(relV.x) * 0.55 && relV.z > 0;
                const arrowCol = isSixOClock ? '#ff3838' : '#ff9f43';
                const pulseGlow =
                  isSixOClock && Math.floor(performance.now() * 0.008) % 2 === 0
                    ? '0 0 14px rgba(255,56,56,0.95)'
                    : '0 0 7px rgba(0,0,0,0.85)';
                const aspectLbl = isSixOClock
                  ? '⚠️ 6 O\'CLOCK'
                  : relV.y > Math.abs(relV.x) * 0.85
                  ? '▲ ABOVE'
                  : relV.y < -Math.abs(relV.x) * 0.85
                  ? '▼ BELOW'
                  : 'TURN';
                const arrowSlot = this._acquireWorldMarkerSlot('airBox');
                this._configureMarkerSlot(arrowSlot, {
                  x: ax,
                  y: ay,
                  opacity: 0.96,
                  iconClass: '',
                  iconStyle: `width:26px;height:26px;display:flex;align-items:center;justify-content:center;background:rgba(20,8,10,0.72);border:1.8px solid ${arrowCol};border-radius:50%;color:${arrowCol};font-size:13px;font-weight:900;transform:rotate(${arrowAngleDeg.toFixed(1)}deg);box-shadow:${pulseGlow};box-sizing:border-box;`,
                  iconText: '➤',
                  distText: `${aspectLbl} ${shortModel} • ${vDist}m${relAltTag}`,
                  distColor: arrowCol,
                  distWeight: '900'
                });
              }
              continue;
            }

            const vx = rawScr.x;
            const vy = rawScr.y;
            const vCenterDist = rawScr.centerDist;

            // Hollow Wireframe TD Box (28x28px) with 100% transparent interior so the 3D plane is never covered!
            const boxCol = !isEnemy
              ? '#48dbfb'
              : isLocked
              ? '#ffeb3b'
              : isSeeking
              ? '#ff9f43'
              : '#ff4757';
            const boxBorder = isLocked
              ? `2px solid #ffeb3b;box-shadow:0 0 10px rgba(255,56,56,0.9), inset 0 0 6px rgba(255,235,59,0.45)`
              : isSeeking
              ? `1.8px dashed #ff9f43`
              : `1.5px solid ${boxCol}`;

            const telemetryTag = !isEnemy
              ? `ALLY ${shortModel} • ${vDist}m`
              : v.isShotDown
              ? `💥 ${shortModel} GOING DOWN`
              : isLocked
              ? `🔒 LOCK ${shortModel} • ${vDist}m${relAltTag} [${holdingStinger ? 'LMB' : 'SPACE'}]`
              : isSeeking
              ? `📡 SEEK ${shortModel} (${Math.round(lockProg * 100)}%) • ${vDist}m${relAltTag}`
              : `${shortModel} • ${vDist}m${activeAircraft ? relAltTag : ''}`;

            const slot = this._acquireWorldMarkerSlot('airBox');
            this._configureMarkerSlot(slot, {
              x: vx,
              y: vy,
              opacity: v.isShotDown ? 0.5 : isLocked || isSeeking ? 0.98 : 0.88,
              iconClass: '',
              iconStyle: `width:26px;height:26px;background:transparent;border:${v.isShotDown ? '1.4px dashed #95a5a6' : boxBorder};border-radius:2px;box-sizing:border-box;`,
              iconText: '',
              distText: telemetryTag,
              distColor: v.isShotDown ? '#bdc3c7' : boxCol,
              distWeight: '900'
            });

            // 2b) Authentic Air-to-Air Avionics Sighting Hierarchy:
            // - Fighter (F-15EX / Su-57), Ground SPAAG AA, B-2 Defense & Wright Flyer: Full Radar-Locked EEGS Lead Pipper (<1,450m)
            // - A-10C / Su-25 (`cas`): NO air-to-air radar! Passive Close-Range Wingspan Gun Funnel ONLY (<350m & inside forward HUD)!
            // - AC-130 (`gunship`): ZERO air-to-air lead indicator (downward ground-attack sensor suite only)!
            const myAirRole = activeAircraft ? activeAircraft.aircraftRole || activeAircraft.type : null;
            const isGunshipObserver = myAirRole === 'gunship';
            const isCasPassiveFunnel = myAirRole === 'cas';
            const showRadarEeegsLead =
              isEnemy &&
              !v.isShotDown &&
              !isGunshipObserver &&
              !isCasPassiveFunnel &&
              !holdingStinger &&
              !isMortarEmplace &&
              vDist < 1450 &&
              typeof this.player.computeAircraftLeadData === 'function';
            const showCasCloseFunnel =
              isEnemy &&
              !v.isShotDown &&
              isCasPassiveFunnel &&
              vDist <= 350 &&
              vCenterDist <= 220 &&
              typeof this.player.computeAircraftLeadData === 'function';

            if (showRadarEeegsLead || showCasCloseFunnel) {
              const leadData = this.player.computeAircraftLeadData(v, refPos, 360, 4.5);
              const leadScr = leadData && leadData.leadPos ? projectToScreen(leadData.leadPos, 0) : null;
              if (leadScr) {
                const lx = leadScr.x;
                const ly = leadScr.y;
                const lCenterDist = leadScr.centerDist;
                const dx = lx - vx;
                const dy = ly - vy;
                const lineLen = Math.hypot(dx, dy);
                const angleDeg = Math.atan2(dy, dx) * (180 / Math.PI);
                const isOnLead = lCenterDist <= 34;
                const isNearLead = lCenterDist <= 85;

                if (showCasCloseFunnel) {
                  // Passive A-10C Wingspan Gun Funnel (No radar lock vector line — amber wingspan brackets!)
                  const funnelCol = isOnLead ? '#2ecc71' : '#f1c40f';
                  const leadSlot = this._acquireWorldMarkerSlot('airBox');
                  this._configureMarkerSlot(leadSlot, {
                    x: lx,
                    y: ly,
                    opacity: 0.92,
                    iconClass: '',
                    iconStyle: `padding:1px 5px;background:transparent;border-left:2px solid ${funnelCol};border-right:2px solid ${funnelCol};border-radius:6px;color:${funnelCol};font-size:10px;font-weight:900;white-space:nowrap;`,
                    iconText: '⊹',
                    distText: `FUNNEL ${vDist}m`,
                    distColor: funnelCol,
                    distWeight: '900'
                  });
                } else {
                  const pipperCol = isOnLead
                    ? '#2ecc71'
                    : isNearLead
                    ? '#ffeb3b'
                    : '#00d2d3';

                  // Connecting Flight-Path Lead Vector Line (compositor-only translate3d + rotate + scaleX, zero width reflow)
                  if (lineLen > 14 && lineLen < 680) {
                    const invLen = 1 / lineLen;
                    const startX = vx + dx * invLen * 11;
                    const startY = vy + dy * invLen * 11;
                    const segLen = Math.max(8, lineLen - 22);
                    const lineSlot = this._acquireWorldMarkerSlot('leadLine');
                    this._configureLeadLineSlot(
                      lineSlot,
                      startX,
                      startY,
                      angleDeg,
                      segLen,
                      pipperCol,
                      isOnLead ? 0.95 : 0.78
                    );
                  }

                  // Hollow Circular MG Lead Pipper Reticle ahead of the enemy plane
                  const leadTag = isOnLead
                    ? `🎯 SHOOT LEAD (+${Math.round(leadData.leadMeters)}m • ${leadData.tof.toFixed(2)}s)`
                    : isNearLead
                    ? `LEAD +${Math.round(leadData.leadMeters)}m (${leadData.tof.toFixed(1)}s)`
                    : vCenterDist < 420
                    ? `LEAD +${Math.round(leadData.leadMeters)}m`
                    : '';
                  const pipperBorder = isOnLead
                    ? `2.2px solid #2ecc71;box-shadow:0 0 12px rgba(46,204,113,0.95), inset 0 0 6px rgba(46,204,113,0.45)`
                    : `1.8px solid ${pipperCol};box-shadow:0 0 6px rgba(0,0,0,0.75)`;
                  const leadSlot = this._acquireWorldMarkerSlot('airBox');
                  this._configureMarkerSlot(leadSlot, {
                    x: lx,
                    y: ly,
                    opacity: isOnLead ? 1.0 : 0.92,
                    iconClass: '',
                    iconStyle: `width:22px;height:22px;background:transparent;border:${pipperBorder};border-radius:50%;box-sizing:border-box;display:flex;align-items:center;justify-content:center;color:${pipperCol};font-size:10px;font-weight:900;`,
                    iconText: '⌖',
                    distText: leadTag,
                    distColor: pipperCol,
                    distWeight: '900'
                  });
                }
              }
            }
          } else if (activeAircraft && v.team !== this.player.team && vDist < 1350) {
            // Hollow Wireframe Target Diamond (18x18px rotated 45°) for Enemy Ground Vehicles so tanks/APCs/cars are 100% visible!
            const scr = projectToScreen(v.pos, 2.2);
            if (!scr) continue;
            const isNearAim = scr.centerDist < 155;
            const vLabel =
              v.type === 'tank'
                ? 'TANK'
                : v.type === 'apc'
                ? 'IFV'
                : v.type === 'aa' || v.type === 'emplace_aa'
                ? 'AA'
                : v.isEmplacement
                ? 'TURRET'
                : 'CAR';
            const diaCol =
              v.type === 'aa' || v.type === 'emplace_aa'
                ? '#ff4757'
                : isNearAim
                ? '#f1c40f'
                : '#ff9f43';
            // Progressive disclosure: only show type name when near the aiming reticle; peripheral targets show compact range only
            const groundTag = isNearAim ? `${vLabel} • ${vDist}m` : scr.centerDist < 380 ? `${vDist}m` : '';
            const slot = this._acquireWorldMarkerSlot('airBox');
            this._configureMarkerSlot(slot, {
              x: scr.x,
              y: scr.y,
              opacity: isNearAim ? 0.92 : 0.72,
              iconClass: '',
              iconStyle: `width:16px;height:16px;background:transparent;border:1.5px solid ${diaCol};transform:rotate(45deg);box-sizing:border-box;`,
              iconText: '',
              distText: groundTag,
              distColor: diaCol,
              distWeight: isNearAim ? '900' : '800'
            });
          }
        }
      }
    }

    // Render merged downed ally micro-dots (14px '+' circle; only shows '[F]' prompt within 5m reach)
    for (const cl of downedClusters) {
      const stateClass = cl.isReviving ? 'reviving' : cl.hasRescuer ? 'enroute' : '';
      const dotLabel = cl.count > 1 ? `+${cl.count}` : '+';
      const op = cl.minDist <= 4.8 ? 0.85 : getSightlineOpacity(cl.centerDist, 0.65, 0.15);
      const closePrompt =
        cl.minDist <= 4.8 && !inAds
          ? `[F] REVIVE • [E] DRAG (${cl.closestBot.name})`
          : '';
      const slot = this._acquireWorldMarkerSlot('revive');
      this._configureMarkerSlot(slot, {
        x: cl.x,
        y: cl.y,
        opacity: op,
        iconClass: stateClass ? `world-revive-dot ${stateClass}` : 'world-revive-dot',
        iconStyle: '',
        iconText: dotLabel,
        distText: closePrompt
      });
    }

    // 2b. Remote Multiplayer Human Teammates
    if (this.network && this.network.remotePlayers) {
      for (const rp of this.network.remotePlayers.values()) {
        if (rp.dead || rp.team !== this.player.team) continue;
        const dist = this.player.pos.distanceTo(rp.pos);
        if (dist < 100) {
          const scr = projectToScreen(rp.pos, 2.3);
          if (scr) {
            const inSq = rp.squad === this.player.squad;
            const color = inSq ? '#2ecc71' : '#f1c40f';
            const op = getSightlineOpacity(scr.centerDist, 0.82, 0.22);
            const showName = scr.centerDist > 75 && !inAds;
            const slot = this._acquireWorldMarkerSlot('ally');
            this._configureMarkerSlot(slot, {
              x: scr.x,
              y: scr.y,
              opacity: op,
              iconClass: 'world-ally-chevron',
              iconStyle: `border-top-color:${color}`,
              iconText: '',
              distText: showName ? rp.name : '',
              distColor: showName ? color : ''
            });
          }
        }
      }
    }

    // 3. 3D Squad Ping [MMB]
    if (this.player.activePing) {
      const ping = this.player.activePing;
      const scr = projectToScreen(ping.pos, 0.6);
      if (scr) {
        const dist = Math.round(this.player.pos.distanceTo(ping.pos));
        const col = ping.isEnemy ? '#ff2e2e' : '#f1c40f';
        const slot = this._acquireWorldMarkerSlot('misc');
        this._configureMarkerSlot(slot, {
          x: scr.x,
          y: scr.y,
          opacity: 0.85,
          iconClass: 'world-ping-diamond',
          iconStyle: `background:${col}`,
          iconText: '',
          distText: `${dist}m`,
          distColor: col
        });
      }
    }

    // 4. Nearby Squad Ammo & Kit Stashes (within 42m)
    if (this.world && this.world.ammoCrates && !inAds) {
      for (const crate of this.world.ammoCrates) {
        if (crate.team && crate.team !== this.player.team) continue;
        const dist = this.player.pos.distanceTo(crate.pos);
        if (dist <= 42) {
          const scr = projectToScreen(crate.pos, 1.35);
          if (scr) {
            const col = crate.permanent ? '#00d2d3' : '#2ecc71';
            const op = getSightlineOpacity(scr.centerDist, 0.85, 0.25);
            const label =
              dist <= 4.5
                ? `[F] RESUPPLY • [L] CYCLE ROLE (${Math.round(dist)}m)`
                : `📦 AMMO & KIT (${Math.round(dist)}m)`;
            const slot = this._acquireWorldMarkerSlot('misc');
            this._configureMarkerSlot(slot, {
              x: scr.x,
              y: scr.y,
              opacity: op,
              iconClass: 'world-ping-diamond',
              iconStyle: `background:${col}`,
              iconText: '',
              distText: label,
              distColor: col
            });
          }
        }
      }
    }

    // Hide unused tail elements of each archetype sub-pool without thrashing DOM classes/styles
    for (let pIdx = 0; pIdx < MARKER_POOL_TYPES.length; pIdx++) {
      const bucket = pools[MARKER_POOL_TYPES[pIdx]];
      for (let i = bucket.idx; i < bucket.items.length; i++) {
        const slot = bucket.items[i];
        if (slot && slot.root._visible !== false) {
          slot.root.style.display = 'none';
          slot.root._visible = false;
          slot.visible = false;
        }
      }
    }
  }
};

export default WorldMarkers;
