import * as THREE from '../../vendor/three.module.js';
import { sound } from '../audio.js?v=110';
import { BOT } from '../config.js?v=110';
import { tmpVec3, tmpVec3Copy } from '../utils/VectorPool.js?v=110';
import { SpatialGrid2D } from '../utils/SpatialGrid2D.js?v=110';
import { events } from '../events.js?v=110';

const BACKBLAST_COLOR = new THREE.Color(0x95a5a6);

function markShared(item) {
  item.userData.shared = true;
  return item;
}

const SHARED_BOT_SAM_GEO = markShared(new THREE.BoxGeometry(0.2, 0.2, 1.15));
const SHARED_BOT_SAM_MAT = markShared(new THREE.MeshBasicMaterial({ color: 0x00d2d3 }));
const SHARED_BOT_RPG_GEO = markShared(new THREE.BoxGeometry(0.2, 0.2, 0.72));
const SHARED_BOT_RPG_MAT = markShared(new THREE.MeshBasicMaterial({ color: 0xe67e22 }));
const SHARED_CHUTE_CANOPY_GEO = markShared(new THREE.BoxGeometry(3.8, 0.52, 2.2));
const SHARED_CHUTE_CORD_GEO = markShared(new THREE.BoxGeometry(0.03, 2.5, 0.03));
const SHARED_CHUTE_US_MAT = markShared(
  new THREE.MeshStandardMaterial({ color: 0x4b6584, roughness: 0.75 })
);
const SHARED_CHUTE_RU_MAT = markShared(
  new THREE.MeshStandardMaterial({ color: 0x4b5320, roughness: 0.75 })
);
const SHARED_CHUTE_LINE_MAT = markShared(new THREE.MeshBasicMaterial({ color: 0xdfe6e9 }));

function acquireTracerLine(botMgr, x0, y0, z0, x1, y1, z1, colorHex, opacity = 0.88) {
  if (!botMgr._tracerPool) botMgr._tracerPool = [];
  let line = botMgr._tracerPool.pop();
  if (!line) {
    const positions = new Float32Array(6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.userData.shared = true;
    const mat = new THREE.LineBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity
    });
    mat.userData.shared = true;
    line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    botMgr.scene.add(line);
  } else {
    line.material.color.setHex(colorHex);
    line.material.opacity = opacity;
    line.visible = true;
  }
  const posAttr = line.geometry.attributes.position;
  posAttr.setXYZ(0, x0, y0, z0);
  posAttr.setXYZ(1, x1, y1, z1);
  posAttr.needsUpdate = true;
  return line;
}

function releaseTracerLine(botMgr, line) {
  if (!line) return;
  line.visible = false;
  if (!botMgr._tracerPool) botMgr._tracerPool = [];
  botMgr._tracerPool.push(line);
}

function setBotEnemyRef(bot, pos, isPlayer, isVehicle, unit) {
  let ref = bot._enemyRef;
  if (!ref) {
    ref = { isPlayer: false, isVehicle: false, pos: null, unit: null, bot: null, vehicle: null };
    bot._enemyRef = ref;
  }
  ref.pos = pos;
  ref.isPlayer = Boolean(isPlayer);
  ref.isVehicle = Boolean(isVehicle);
  ref.unit = unit;
  ref.bot = !isPlayer && !isVehicle ? unit : null;
  ref.vehicle = isVehicle ? unit : null;
  return ref;
}

export function spawnTracer(start, end, color = 0xffeaa7) {
  if (this.tracers.length > 90) return;
  const line = acquireTracerLine(
    this,
    start.x,
    start.y,
    start.z,
    end.x,
    end.y,
    end.z,
    color,
    0.85
  );
  this.tracers.push({ line, life: 0.075 });
}

export function update(dt, player, onKillFn, onTicketBleedFn, vehicleManager = null, onAwardXp = null) {
  // 0. Rebuild 2D spatial grids & team lists once at the start of frame for O(1) queries
  this._frameRaycasts = 0;
  if (!this.spatialGrid) {
    this.spatialGrid = new SpatialGrid2D(-2912, 2912, -1920, 1920, 32, 640);
  }
  if (!this.teamGrid) {
    this.teamGrid = {
      US: new SpatialGrid2D(-2912, 2912, -1920, 1920, 32, 320),
      RU: new SpatialGrid2D(-2912, 2912, -1920, 1920, 32, 320)
    };
  }
  this.spatialGrid.clear();
  this.teamGrid.US.clear();
  this.teamGrid.RU.clear();

  if (!this.downedByTeam) {
    this.downedByTeam = { US: [], RU: [] };
  } else {
    this.downedByTeam.US.length = 0;
    this.downedByTeam.RU.length = 0;
  }
  if (!this.aliveByTeam) {
    this.aliveByTeam = { US: [], RU: [] };
  } else {
    this.aliveByTeam.US.length = 0;
    this.aliveByTeam.RU.length = 0;
  }
  for (let i = 0; i < this.bots.length; i++) {
    const b = this.bots[i];
    if (b.dead) continue;
    this.spatialGrid.insert(b.pos.x, b.pos.z, b);
    if (this.teamGrid[b.team]) {
      this.teamGrid[b.team].insert(b.pos.x, b.pos.z, b);
    }
    if (b.downed) {
      if (this.downedByTeam[b.team]) this.downedByTeam[b.team].push(b);
    } else if (!b.drivingVehicle && this.aliveByTeam[b.team]) {
      this.aliveByTeam[b.team].push(b);
    }
  }

  // 1. Update Contested / Overrun Base states (Main Bases + Forward Flags A-E) at 4 Hz
  this._contestedTimer = (this._contestedTimer || 0) - dt;
  if (this._contestedTimer <= 0) {
    this._contestedTimer = 0.25;
    this.updateContestedBases(player, onAwardXp);
  }

  // 2. Update In-Flight Ballistic Bot Bullets, Bullet Tracers & 3D Medic Smoke Screens
  if (!Array.isArray(this.botBullets)) {
    this.botBullets = [];
  }
  for (let i = this.botBullets.length - 1; i >= 0; i--) {
    const bb = this.botBullets[i];
    const step = bb.speed * dt;
    bb.traveled += step;
    bb.pos.addScaledVector(bb.dir, step);
    bb.pos.y -= 0.5 * 9.81 * dt * (bb.traveled / Math.max(1, bb.speed));

    if (bb.tracerLine) {
      const tailDist = Math.min(bb.traveled, 12.0);
      const tailPos = tmpVec3Copy(bb.pos).addScaledVector(bb.dir, -Math.max(0.4, tailDist));
      const posAttr = bb.tracerLine.geometry.attributes.position;
      if (posAttr) {
        posAttr.setXYZ(0, tailPos.x, tailPos.y, tailPos.z);
        posAttr.setXYZ(1, bb.pos.x, bb.pos.y, bb.pos.z);
        posAttr.needsUpdate = true;
      }
    }

    if (bb.traveled >= bb.maxDist) {
      if (bb.tracerLine) {
        releaseTracerLine(this, bb.tracerLine);
        bb.tracerLine = null;
      }
      if (bb.voxelHit) {
        const vh = bb.voxelHit;
        if (vh.voxel) {
          if (vh.voxel.isProp || vh.voxel.type === 'wood') {
            this.world.damageVoxel(vh.voxel.gx, vh.voxel.gy, vh.voxel.gz, 18);
          } else if (vh.voxel.type === 'sandbag') {
            this.world.damageVoxel(vh.voxel.gx, vh.voxel.gy, vh.voxel.gz, 6);
          }
        }
      } else if (bb.willHit && bb.target) {
        const target = bb.target;
        const bot = bb.bot;
        if (target.isVehicle && target.unit && !target.unit.dead) {
          const veh = target.unit;
          if (veh.type === 'warhorse' && vehicleManager) {
            // Separate Horse & Rider Health/Armor:
            // 55% of enemy hits strike the Warhorse (barding armor + horse HP),
            // 45% strike the mounted Rider directly (rider armor + rider HP)!
            if (veh.driver === player && player && !player.dead && !player.downed && Math.random() < 0.45) {
              player.takeDamage(9, bot.name, bot.team, bb.weaponName, onKillFn, bot.pos);
            } else {
              vehicleManager.damageVehicle(
                veh,
                16,
                bot.name,
                bot.team,
                bb.weaponName,
                onKillFn,
                null,
                bot.pos
              );
            }
          } else if (veh.type === 'humvee' && vehicleManager) {
            vehicleManager.damageVehicle(
              veh,
              1,
              bot.name,
              bot.team,
              `${bb.weaponName} (ARMOR GRAZE)`,
              onKillFn,
              null,
              bot.pos
            );
          } else if (veh.driver === player && typeof player.notifyVehicleHit === 'function') {
            player.notifyVehicleHit(0, bot.name, 'SMALL ARMS DEFLECTED', bot.pos);
          }
        } else if (target.isPlayer && player && !player.dead && !player.downed) {
          // Physical dodge check: if the player bunnyhopped/moved >2.35m away from the bullet's arrival point during flight time, the shot misses!
          const distFromArrival = Math.hypot(
            player.pos.x - bb.endPoint.x,
            player.pos.z - bb.endPoint.z
          );
          if (distFromArrival <= 2.35 && Math.abs(player.pos.y + 1.0 - bb.endPoint.y) <= 2.2) {
            const wasAlive = !player.dead && !player.downed;
            // If player is riding a Warhorse, 55% of hits strike the Warhorse and 45% strike the Rider!
            if (
              player.activeVehicle &&
              !player.activeVehicle.dead &&
              player.activeVehicle.type === 'warhorse' &&
              vehicleManager &&
              Math.random() < 0.55
            ) {
              vehicleManager.damageVehicle(
                player.activeVehicle,
                16,
                bot.name,
                bot.team,
                bb.weaponName,
                onKillFn,
                null,
                bot.pos
              );
            } else {
              const isBotHeadshot = Math.random() < 0.14;
              player.takeDamage(
                isBotHeadshot ? 13 : 8,
                bot.name,
                bot.team,
                bb.weaponName,
                onKillFn,
                bot.pos,
                isBotHeadshot
              );
            }
            if (
              wasAlive &&
              (player.downed || player.dead) &&
              String(player.role).toUpperCase() === 'MEDIC'
            ) {
              bot.medicKills = (bot.medicKills || 0) + 1;
            }
          } else if (typeof player.applySuppression === 'function') {
            player.applySuppression(0.14);
          }
        } else if (!target.isPlayer && target.unit && !target.unit.dead && !target.unit.downed) {
          const res = this.damageBot(
            target.unit,
            24,
            bot.name,
            bot.team,
            bb.weaponName,
            Math.random() < 0.16,
            onKillFn
          );
          if (res.killed) {
            bot.kills++;
            if (target.unit && target.unit.role === 'MEDIC') {
              bot.medicKills = (bot.medicKills || 0) + 1;
            }
            bot.score += 100;
          }
        }
      } else if (
        bb.target &&
        bb.target.isPlayer &&
        bb.maxDist < 35 &&
        player &&
        typeof player.applySuppression === 'function'
      ) {
        const intensity = Math.max(0.05, 0.2 * (1 - bb.maxDist / 35));
        player.applySuppression(intensity);
      }
      this.botBullets.splice(i, 1);
      if (!this._bulletPool) this._bulletPool = [];
      bb.bot = null;
      bb.voxelHit = null;
      bb.target.unit = null;
      this._bulletPool.push(bb);
    }
  }

  for (let i = this.tracers.length - 1; i >= 0; i--) {
    const t = this.tracers[i];
    t.life -= dt;
    if (t.life <= 0) {
      releaseTracerLine(this, t.line);
      this.tracers.splice(i, 1);
    }
  }

  for (let i = this.smokeClouds.length - 1; i >= 0; i--) {
    const sc = this.smokeClouds[i];
    sc.life -= dt;
    if (sc.life <= 0) {
      this.scene.remove(sc.group);
      for (const p of sc.puffs) {
        if (p.geometry && !p.geometry.userData?.shared) p.geometry.dispose();
        if (p.material && !p.material.userData?.shared) p.material.dispose();
      }
      this.smokeClouds.splice(i, 1);
    } else {
      const progress = 1 - sc.life / sc.maxLife;
      const scale = 1.0 + progress * 1.15;
      sc.group.scale.set(scale, 1.0 + progress * 0.7, scale);
      const fade = sc.life < 2.0 ? (sc.life / 2.0) * 0.65 : 0.65;
      for (const p of sc.puffs) {
        p.material.opacity = fade;
      }
    }
  }

  if (this.globalCommsCooldown > 0) {
    this.globalCommsCooldown = Math.max(0, this.globalCommsCooldown - dt);
  }
  if (this._garrisonAlertCooldown) {
    if (this._garrisonAlertCooldown.US > 0) {
      this._garrisonAlertCooldown.US = Math.max(0, this._garrisonAlertCooldown.US - dt);
    }
    if (this._garrisonAlertCooldown.RU > 0) {
      this._garrisonAlertCooldown.RU = Math.max(0, this._garrisonAlertCooldown.RU - dt);
    }
  }

  // Precompute true 3D camera origin, forward vector & optical zoom once per frame
  // so AC-130 / Aircraft / Sniper-zoomed views NEVER prematurely cull infantry or rescuing medics!
  let camX = player ? player.pos.x : 0;
  let camY = player ? player.pos.y + 1.6 : 0;
  let camZ = player ? player.pos.z : 0;
  let camFwdX = player ? -Math.sin(player.yaw || 0) : 0;
  let camFwdY = 0;
  let camFwdZ = player ? -Math.cos(player.yaw || 0) : -1;
  let hasCam3D = Boolean(player);
  if (player?.camera?.matrixWorld?.elements) {
    const me = player.camera.matrixWorld.elements;
    camX = me[12];
    camY = me[13];
    camZ = me[14];
    const rfx = -me[8];
    const rfy = -me[9];
    const rfz = -me[10];
    const len3 = Math.hypot(rfx, rfy, rfz);
    if (len3 >= 0.001) {
      camFwdX = rfx / len3;
      camFwdY = rfy / len3;
      camFwdZ = rfz / len3;
    } else {
      hasCam3D = false;
    }
  }
  const activeCamFov = player?.camera?.fov || 75;
  const opticZoomMag = THREE.MathUtils.clamp(75 / Math.max(8, activeCamFov), 1.0, 9.5);
  const playerInAircraft = Boolean(player?.activeVehicle && player.activeVehicle.isAircraft);
  const maxRenderDist = playerInAircraft
    ? Math.min(3400, Math.round(Math.max(950, camY * 1.9 + 480) * Math.sqrt(opticZoomMag)))
    : Math.min(3000, Math.round(440 * opticZoomMag));
  const maxRenderDistSq = maxRenderDist * maxRenderDist;
  const ultraScale = this.bots.length >= 360;
  const fullGaitDist = Math.min(
    2600,
    (playerInAircraft ? (ultraScale ? 175 : 220) : ultraScale ? 105 : 125) * opticZoomMag
  );
  const fullGaitDistSq = fullGaitDist * fullGaitDist;
  const halfRateGaitDistSq = Math.min(900, (ultraScale ? 38 : 48) * opticZoomMag) ** 2;
  // Sub-pixel 3D weapon assembly LOD (~26 child meshes per gun) & micro-gear LOD: hide beyond ~75m * zoomMag!
  const gunLodDistSq = Math.min(1400, 75 * opticZoomMag) ** 2;
  // Far limb/boot LOD (6 child meshes: upper/forearms + boots): hide beyond ~135m * zoomMag (~2,400 fewer draw calls at 500P)!
  const farLimbLodDistSq = Math.min(1800, 135 * opticZoomMag) ** 2;

  for (let bIdx = 0; bIdx < this.bots.length; bIdx++) {
    const bot = this.bots[bIdx];
    bot._raycastsThisFrame = 0;
    const parts = bot.parts || bot.mesh.userData.parts;
    bot.inPlayerSquad = bot.team === player.team && bot.squad === (player.squad || 'ALPHA');

    if (bot.spottedTimer > 0) {
      bot.spottedTimer = Math.max(0, bot.spottedTimer - dt);
    }
    if (bot.speechBubbleTimer > 0) {
      bot.speechBubbleTimer = Math.max(0, bot.speechBubbleTimer - dt);
    }
    if (bot.chatCooldown > 0) {
      bot.chatCooldown = Math.max(0, bot.chatCooldown - dt);
    }
    if (bot.playerOrderTimer > 0) {
      bot.playerOrderTimer = Math.max(0, bot.playerOrderTimer - dt);
      if (bot.playerOrderTimer <= 0) {
        bot.playerOrderMode = null;
      }
    }

    // Suppression decay (Squad-style) & Under-Fire timer decay
    if (bot.suppressionLevel > 0) {
      bot.suppressionLevel = Math.max(0, bot.suppressionLevel - 0.5 * dt);
    }
    if (bot.underFireTimer > 0) {
      bot.underFireTimer = Math.max(0, bot.underFireTimer - dt);
    }

    if (bot.dead) {
      if (bot.drivingVehicle) {
        if (bot.drivingVehicle.npcDriver === bot) bot.drivingVehicle.npcDriver = null;
        bot.drivingVehicle = null;
      }
      bot.respawnTimer -= dt;
      if (bot.respawnTimer <= 0) {
        // Contested Base Respawn Lockout Check:
        // If ALL of this faction's bases (Main Base + Forward Flags) are currently contested/overrun,
        // hold dead soldiers in respawn lockout so they NEVER spawn on top of attacking players!
        if (!this.canTeamRespawn(bot.team)) {
          bot.respawnTimer = 1.5;
          if (this.onTelemetryEvent && Math.random() < 0.15) {
            this.onTelemetryEvent('CONTESTED_SPAWN_BLOCKED', {
              team: bot.team,
              squad: bot.squad,
              blockedBase: 'ALL_BASES_CONTESTED',
              redirectedTo: 'LOCKED_OUT'
            });
          }
          continue;
        }

        if (this.canTeamAffordRespawn && !this.canTeamAffordRespawn(bot.team, 1)) {
          bot.respawnTimer = 1.5;
          continue;
        }

        bot.dead = false;
        bot.downed = false;
        bot._losCache?.clear();
        bot.hp = bot.maxHp || BOT.HP;
        bot.hasHelmet = true;
        bot.armorHp = BOT.ARMOR_HP;
        bot.matchCash =
          bot.commandRank === 'COMMANDER'
            ? 700
            : bot.commandRank === 'SQUAD_LEADER'
            ? 450
            : 250 + Math.min(400, (bot.kills || 0) * 100 + (bot.captures || 0) * 150);
        bot.cashLooted = false;
        bot.lootPack = null;
        bot.fieldDressings = bot.maxFieldDressings || (bot.role === 'MEDIC' ? 9 : 2);
        bot.medicBagSupply = bot.maxMedicBagSupply || (bot.role === 'MEDIC' ? 600 : 0);
        bot.postReviveTimer = 0;
        bot.standUpProgress = 1.0;
        bot.weaponReadyTimer = 0;
        bot.aimRaiseProgress = 0.25;
        bot.transitionState = 'ACTIVE';
        parts.helmet.visible = true;
        bot.mesh.rotation.set(0, bot.yaw, 0);
        const spawnInfo = this.pickSpawnPosition(bot.team, bot.squad, true, bot.subFaction);
        bot.pos.copy(spawnInfo.pos);
        bot.lastSpawnSource = spawnInfo.source;
        bot.velX = 0;
        bot.velZ = 0;
        bot.velY = 0;
        bot.stuckTimer = 0;
        bot.stuckCount = 0;
        if (bot.lastProgressPos) bot.lastProgressPos.copy(bot.pos);
        // Inherit active Squad Leader / Force Commander order on respawn
        const activeOrder =
          (this.squadOrders[bot.team] && this.squadOrders[bot.team][bot.squad]) ||
          this.commanderOrders[bot.team];
        if (activeOrder && activeOrder.action === 'OBJECTIVE' && activeOrder.flagIndex >= 0) {
          bot.playerOrderMode = 'OBJECTIVE';
          bot.playerOrderFlagIndex = activeOrder.flagIndex;
          bot.targetFlagIndex = activeOrder.flagIndex;
          bot.playerOrderTimer = Math.max(bot.playerOrderTimer || 0, 90);
        }
        bot.mesh._culledOffFrustum = false;
        bot.mesh.visible = true;
        if (onTicketBleedFn) onTicketBleedFn(bot.team, 1, 'SOLDIER', bot.name);
      }
      continue;
    }

    // If this NPC is currently inside & driving a Tank, APC, or Humvee, keep their
    // soldier mesh hidden inside the hull until they exit or the vehicle is destroyed.
    if (bot.drivingVehicle) {
      if (bot.drivingVehicle.dead || bot.drivingVehicle.npcDriver !== bot) {
        bot.drivingVehicle = null;
        bot.mesh._culledOffFrustum = false;
        bot.mesh.visible = true;
      } else {
        bot.pos.copy(bot.drivingVehicle.pos);
        bot.mesh.visible = false;
        continue;
      }
    }

    const dxCam = bot.pos.x - camX;
    const dyCam = bot.pos.y + 0.9 - camY;
    const dzCam = bot.pos.z - camZ;
    const distSqCam = dxCam * dxCam + dyCam * dyCam + dzCam * dzCam;
    const dot3DUnnorm = dxCam * camFwdX + dyCam * camFwdY + dzCam * camFwdZ;
    // True 3D behind-camera check (dot3D < -0.35 and >22m away) — safe at steep -85° AC-130 downward angles!
    const offFrustum =
      hasCam3D &&
      distSqCam > 22 * 22 &&
      dot3DUnnorm < 0 &&
      dot3DUnnorm * dot3DUnnorm > 0.1225 * distSqCam;
    const within3DRender = distSqCam <= maxRenderDistSq;

    // Apply 3D visibility & frustum matrix flag BEFORE early-return states (`downed`, `updateMedicRescue`, `trebuchet`)
    // so downed casualties & rescuing/healing Medics NEVER stay invisible after entering range or zooming in!
    const shouldDraw3D = within3DRender && !offFrustum;
    if (bot.mesh.visible !== shouldDraw3D) {
      bot.mesh.visible = shouldDraw3D;
    }
    bot.mesh._culledOffFrustum = !shouldDraw3D;
    if (shouldDraw3D && !bot.isDinosaur) {
      const showCloseDetail = distSqCam <= gunLodDistSq;
      if (parts.gunGroup && parts.gunGroup.visible !== showCloseDetail) {
        parts.gunGroup.visible = showCloseDetail;
      }
      const lodMeshes = bot.mesh.userData.lodDetailMeshes;
      if (lodMeshes && bot._lodCloseDetail !== showCloseDetail) {
        bot._lodCloseDetail = showCloseDetail;
        for (let li = 0; li < lodMeshes.length; li++) {
          lodMeshes[li].visible = showCloseDetail;
        }
      }
      const farLimbMeshes = bot.mesh.userData.farLimbLodMeshes;
      if (farLimbMeshes) {
        const showLimbs = distSqCam <= farLimbLodDistSq;
        if (bot._lodFarLimbs !== showLimbs) {
          bot._lodFarLimbs = showLimbs;
          for (let li = 0; li < farLimbMeshes.length; li++) {
            farLimbMeshes[li].visible = showLimbs;
          }
        }
      }
    }

    // Mid-Air Ejected Pilot Parachute Descent
    if (bot.parachuting) {
      if (!bot.parachuteMesh) {
        const pGroup = new THREE.Group();
        const canopy = new THREE.Mesh(
          SHARED_CHUTE_CANOPY_GEO,
          bot.team === 'US' ? SHARED_CHUTE_US_MAT : SHARED_CHUTE_RU_MAT
        );
        canopy.position.set(0, 3.6, 0);
        canopy.updateMatrix();
        canopy.matrixAutoUpdate = false;
        pGroup.add(canopy);
        for (const [lx, lz] of [
          [-1.35, -0.75],
          [1.35, -0.75],
          [-1.35, 0.75],
          [1.35, 0.75]
        ]) {
          const cord = new THREE.Mesh(SHARED_CHUTE_CORD_GEO, SHARED_CHUTE_LINE_MAT);
          cord.position.set(lx * 0.55, 2.25, lz * 0.55);
          cord.rotation.z = -lx * 0.24;
          cord.rotation.x = lz * 0.22;
          cord.updateMatrix();
          cord.matrixAutoUpdate = false;
          pGroup.add(cord);
        }
        bot.parachuteMesh = pGroup;
        this.scene.add(pGroup);
      }
      bot.mesh._culledOffFrustum = offFrustum;
      bot.mesh.visible = true;
      bot.parachuteMesh.visible = true;
      const gY = this.world.getGroundHeightAt(bot.pos.x, bot.pos.z);
      bot.pos.y = Math.max(gY, bot.pos.y - 6.5 * dt);
      bot.pos.x += Math.sin(bot.yaw || 0) * 3.8 * dt;
      bot.pos.z += Math.cos(bot.yaw || 0) * 3.8 * dt;
      bot.mesh.position.copy(bot.pos);
      bot.parachuteMesh.position.copy(bot.pos);
      bot.parachuteMesh.rotation.y = bot.yaw || 0;
      if (bot.pos.y <= gY + 0.35) {
        bot.pos.y = gY;
        bot.parachuting = false;
        bot.parachuteMesh.visible = false;
      } else {
        continue;
      }
    } else if (bot.parachuteMesh && bot.parachuteMesh.visible) {
      bot.parachuteMesh.visible = false;
    }

    // Downed / Wounded Crawling Animation on Ground (Squad-calibrated 95s bleedout; paused when Medic is en route or rescuing!)
    if (bot.downed) {
      const beingSavedByBot =
        bot.rescuer &&
        !bot.rescuer.dead &&
        !bot.rescuer.downed &&
        (bot.rescuer.rescueState === 'ASSESS_THREAT' ||
          bot.rescuer.rescueState === 'APPROACH' ||
          bot.rescuer.rescueState === 'DRAG' ||
          bot.rescuer.rescueState === 'REVIVE');
      const beingSavedByPlayer =
        player.draggedBot === bot ||
        (player.reviveTargetBot === bot && player.keys && player.keys['KeyF']);
      if (!beingSavedByBot && !beingSavedByPlayer) {
        bot.bleedOutTimer -= dt;
      }

      const gY = this.world.getGroundHeightAt(bot.pos.x, bot.pos.z);
      bot.pos.y = gY + 0.22;
      bot.mesh.rotation.x = -Math.PI / 2;
      if (parts.muzzleFlash && parts.muzzleFlash.visible) {
        parts.muzzleFlash.visible = false;
      }
      if (!bot.mesh._culledOffFrustum && distSqCam <= fullGaitDistSq) {
        bot.animPhase += dt * 2.5;
        parts.pelvisGroup.rotation.y = 0;
        parts.upperBody.position.y = 0.78;
        parts.upperBody.rotation.set(0.15, Math.sin(bot.animPhase) * 0.12, 0);
        parts.headGroup.rotation.set(0.35, Math.sin(bot.animPhase * 0.8) * 0.35, 0);
        parts.leftLeg.rotation.x = Math.sin(bot.animPhase) * 0.25;
        parts.rightLeg.rotation.x = -Math.sin(bot.animPhase) * 0.25;
        parts.leftShin.rotation.x = 0.45;
        parts.rightShin.rotation.x = 0.35;
      }

      if (bot.bleedOutTimer <= 0) {
        this.clearBotRescueLinks(bot);
        bot._losCache?.clear();
        bot.downed = false;
        bot.dead = true;
        bot.respawnTimer = BOT.RESPAWN_TIMER;
        bot.mesh.visible = false;
        bot.mesh.rotation.x = 0;
        events.emit('bot:killed', { bot, stage: 'bleedout' });
      }
      continue;
    }

    // =======================================================================
    // SMARTER TACTICAL MEDIC RESCUE (delegated to MedicAI.js):
    // 1. ASSESS_THREAT (Scan for enemies -> Pop Smoke -> Crouch & Suppress/Clear Threat!)
    // 2. APPROACH (Advance in low crouch under smoke cover)
    // 3. DRAG (Pull wounded soldier behind solid voxel cover)
    // 4. REVIVE (Kneel & bandage to 80 HP)
    // =======================================================================
    if (this.updateMedicRescue(bot, dt, player, onKillFn)) {
      continue;
    }

    // ─── SIEGE TREBUCHET CREW DUTY (Men called over to set up & launch boulders!) ───
    if (bot.assignedTrebuchet) {
      if (bot.assignedTrebuchet.dead) {
        bot.assignedTrebuchet = null;
      } else {
        const treb = bot.assignedTrebuchet;
        const slotIdx = bot.trebuchetCrewSlot || 0;
        const stationOffsets = [
          [-2.35, 1.9],
          [2.35, 1.9],
          [0, 3.1]
        ];
        const [ox, oz] = stationOffsets[slotIdx % stationOffsets.length];
        const stationX = treb.pos.x + ox;
        const stationZ = treb.pos.z + oz;
        const dxT = stationX - bot.pos.x;
        const dzT = stationZ - bot.pos.z;
        const distToStation = Math.hypot(dxT, dzT);

        if (distToStation > 1.65) {
          const step = Math.min(distToStation, 8.2 * dt);
          bot.pos.x += (dxT / distToStation) * step;
          bot.pos.z += (dzT / distToStation) * step;
          bot.pos.y = this.world.getGroundHeightAt(bot.pos.x, bot.pos.z);
          bot.yaw = Math.atan2(dxT, dzT);
          bot.animPhase = (bot.animPhase || 0) + dt * 13.5;
        } else {
          // Crewman is at the Trebuchet winch / boulder sling: face the frame & crank the winch!
          bot.yaw = Math.atan2(treb.pos.x - bot.pos.x, treb.pos.z - bot.pos.z);
          bot.animPhase = (bot.animPhase || 0) + dt * 6.5;
          if (parts.upperBody && parts.weaponRig) {
            const crankWave = Math.sin(bot.animPhase);
            parts.upperBody.rotation.x = 0.32 + crankWave * 0.18;
            parts.weaponRig.position.set(0, 0.36 + crankWave * 0.08, 0.08);
            parts.weaponRig.rotation.set(0.65 + crankWave * 0.35, 0.25, 0.12);
          }
        }
        if (bot.mesh.userData?.slungSwordHiltGroup) {
          bot.mesh.userData.slungSwordHiltGroup.visible = true;
        }
        bot.mesh.position.copy(bot.pos);
        bot.mesh.rotation.y = bot.yaw;
        bot.mesh.visible = true;
        continue;
      }
    }

    // Enforce active Garrison Defense Assignment (1 dedicated Squad per captured Forward Base)
    // OR active Player / Squad Leader / Commander Objective Order if set
    const garrisonFlagIdx =
      this.squadGarrisonFlagIndex &&
      this.squadGarrisonFlagIndex[bot.team] &&
      typeof this.squadGarrisonFlagIndex[bot.team][bot.squad] === 'number'
        ? this.squadGarrisonFlagIndex[bot.team][bot.squad]
        : -1;
    const hasSingleSquadOverride =
      bot.playerOrderTimer > 0 &&
      this.squadOrders &&
      this.squadOrders[bot.team] &&
      this.squadOrders[bot.team][bot.squad] &&
      this.squadOrders[bot.team][bot.squad].scope === 'SQUAD' &&
      bot.playerOrderFlagIndex !== garrisonFlagIdx;

    if (garrisonFlagIdx >= 0 && !hasSingleSquadOverride) {
      bot.targetFlagIndex = garrisonFlagIdx;
      bot.isGarrisonDefender = true;
      bot.garrisonFlagId = this.world.flags[garrisonFlagIdx] ? this.world.flags[garrisonFlagIdx].id : null;
    } else if (bot.playerOrderTimer > 0 && bot.playerOrderMode === 'OBJECTIVE' && bot.playerOrderFlagIndex >= 0) {
      bot.targetFlagIndex = bot.playerOrderFlagIndex;
      bot.isGarrisonDefender = false;
      bot.garrisonFlagId = null;
    } else {
      bot.isGarrisonDefender = false;
      bot.garrisonFlagId = null;
    }

    // Check if this bot is currently inside a Friendly Captured Forward Base (`bot.inFriendlyForwardBase`)
    // and apply Real-Life & Tactical Shooter Entrenched Defender Advantages! (Throttled scan at 4 Hz for 500-player scale)
    bot._fobCheckTimer = (bot._fobCheckTimer || 0) - dt;
    let defendedFlag =
      bot._defendedFlagRef && bot._defendedFlagRef.owner === bot.team
        ? bot._defendedFlagRef
        : null;
    if (bot._fobCheckTimer <= 0) {
      bot._fobCheckTimer = 0.22 + (bIdx % 5) * 0.02;
      defendedFlag = null;
      for (let fIdx = 0; fIdx < this.world.flags.length; fIdx++) {
        const fl = this.world.flags[fIdx];
        if (fl.owner === bot.team) {
          const dxFl = bot.pos.x - fl.pos.x;
          const dzFl = bot.pos.z - fl.pos.z;
          if (dxFl * dxFl + dzFl * dzFl <= (fl.radius + 4) * (fl.radius + 4)) {
            defendedFlag = fl;
            break;
          }
        }
      }
      bot._defendedFlagRef = defendedFlag;
    }
    bot.inFriendlyForwardBase = Boolean(defendedFlag);
    bot.defendedFlagStage = defendedFlag ? defendedFlag.defenseStage || 0 : 0;

    if (defendedFlag) {
      // 1. Forward Base Logistics & Medical Triage: Defenders inside their own Forward Base regenerate HP & Armor
      //    and recover from suppression 2x faster!
      if (bot.hp < 100) {
        bot.hp = Math.min(100, bot.hp + 3.5 * dt);
      }
      if ((bot.armorHp || 0) < 40) {
        bot.armorHp = Math.min(40, (bot.armorHp || 0) + 2.5 * dt);
      }
      bot.suppressionLevel = Math.max(0, (bot.suppressionLevel || 0) - 0.35 * dt);

      // 2. Defending NPC Engineers automatically construct Forward Base Point Defenses (Stages 1->4: Sandbag Berms & HESCO Bunkers)
      //    and repair damaged cover buildings around the Forward Base!
      if (bot.role === 'ENGINEER') {
        defendedFlag._npcFortifyTimer = (defendedFlag._npcFortifyTimer || 0) + dt;
        if (defendedFlag._npcFortifyTimer >= 9.0) {
          defendedFlag._npcFortifyTimer = 0;
          if ((defendedFlag.defenseStage || 0) < 4 && typeof this.world.buildPointDefenseStage === 'function') {
            const res = this.world.buildPointDefenseStage(defendedFlag, null, bot.pos);
            if (res && bot.team === player.team && !player.dead) {
              this.emitBotComms(
                bot,
                player,
                `Fortified Objective ${defendedFlag.id} Point Defenses (Stage ${res.stage}/${res.maxStage} — HESCO & Sandbag Bunkers)!`,
                'OBJECTIVE',
                false,
                'CMD NET'
              );
            }
          } else if (typeof this.world.findNearestDamagedBuilding === 'function') {
            const foundBld = this.world.findNearestDamagedBuilding(defendedFlag.pos, 26.0);
            if (foundBld && foundBld.building) {
              this.world.repairBuilding(foundBld.building, 60, bot.pos, null);
            }
          }
        }
      }
    }

    bot.rethinkTimer -= dt;
    if (bot.rethinkTimer <= 0) {
      bot.rethinkTimer = BOT.RETHINK_TIMER_BASE + Math.random() * BOT.RETHINK_TIMER_RAND;
      const activeSpacing =
        bot.spacingMode ||
        (this.squadSpacingMode?.[bot.team]?.[bot.squad]) ||
        this.teamSpacingMode?.[bot.team] ||
        'FAN_OUT';
      const sp = this.computeBotSpacingOffsets(bot, activeSpacing);
      if (bot.memberClusterOffset) {
        bot.memberClusterOffset.set(sp.clusterOffX, 0, sp.clusterOffZ);
      }

      if (bot.isGarrisonDefender && garrisonFlagIdx >= 0) {
        bot.targetFlagIndex = garrisonFlagIdx;
        const gFlag = this.world.flags[garrisonFlagIdx];
        if (gFlag) {
          // Garrison Defenders form a disciplined Battle Line / Perimeter Array outside internal keeps!
          const rawX = gFlag.pos.x + sp.clusterOffX;
          const rawZ = gFlag.pos.z + sp.clusterOffZ;
          const safeGoal = this.world.pushOutOfBuildingFootprint(rawX, rawZ, 2.4);
          bot.waypointOffset.set(safeGoal.x - gFlag.pos.x, 0, safeGoal.z - gFlag.pos.z);
        }
      } else if (
        bot.playerOrderTimer > 0 &&
        (bot.playerOrderMode === 'OBJECTIVE' || bot.playerOrderMode === 'CHARGE') &&
        bot.playerOrderFlagIndex >= 0
      ) {
        bot.targetFlagIndex = bot.playerOrderFlagIndex;
        const fPos = this.world.flags[bot.targetFlagIndex].pos;
        const rawX = fPos.x + sp.totalOffX;
        const rawZ = fPos.z + sp.totalOffZ;
        const safeGoal = this.world.pushOutOfBuildingFootprint(rawX, rawZ, 2.4);
        bot.waypointOffset.set(safeGoal.x - fPos.x, 0, safeGoal.z - fPos.z);
      } else if (!bot.isSquadLeader) {
        // Squad Members follow their Squad Leader's assigned objective in cohesive Rank-and-File Battle Line Array!
        const squadLeaderBot =
          this.squadLeaders && this.squadLeaders[bot.team]
            ? this.squadLeaders[bot.team][bot.squad]
            : null;
        if (squadLeaderBot && typeof squadLeaderBot.targetFlagIndex === 'number') {
          bot.targetFlagIndex = squadLeaderBot.targetFlagIndex;
        }
        const fPos = this.world.flags[bot.targetFlagIndex].pos;
        const rawX = fPos.x + sp.totalOffX;
        const rawZ = fPos.z + sp.totalOffZ;
        const safeGoal = this.world.pushOutOfBuildingFootprint(rawX, rawZ, 2.4);
        bot.waypointOffset.set(safeGoal.x - fPos.x, 0, safeGoal.z - fPos.z);
      } else {
        // Autonomous AI Assault Squad Leader selects the best unowned/contested objective for their squad
        // (Only re-picks a new flag if the current target flag is already owned & uncontested!)
        const curFlag = this.world.flags[bot.targetFlagIndex];
        if (!curFlag || (curFlag.owner === bot.team && !curFlag.contested)) {
          const candidateFlags = this.world.flags
            .map((f, idx) => ({ f, idx }))
            .filter((item) => item.f.owner !== bot.team || item.f.contested);
          if (candidateFlags.length > 0) {
            // Pick the closest frontline unowned/contested flag so the squad marches naturally as a line!
            candidateFlags.sort(
              (a, b) =>
                Math.hypot(a.f.pos.x - bot.pos.x, a.f.pos.z - bot.pos.z) -
                Math.hypot(b.f.pos.x - bot.pos.x, b.f.pos.z - bot.pos.z)
            );
            bot.targetFlagIndex = candidateFlags[0].idx;
          }
        }
        const fPos = this.world.flags[bot.targetFlagIndex].pos;
        const rawX = fPos.x + sp.totalOffX;
        const rawZ = fPos.z + sp.totalOffZ;
        const safeGoal = this.world.pushOutOfBuildingFootprint(rawX, rawZ, 2.4);
        bot.waypointOffset.set(safeGoal.x - fPos.x, 0, safeGoal.z - fPos.z);
      }
    }

    // =======================================================================
    // PHYSICAL BASE VEHICLE SEEKING & BOARDING (BRAVO Armor Squad prioritizes crewing Tanks/IFVs/Cars!)
    // Staggered 4 Hz candidate scan across 499 bots while checking boarding distance every frame!
    // =======================================================================
    let seekingVehicle = null;
    if (vehicleManager && !bot.rescueTarget) {
      const cachedSeek = bot._seekingVehicleRef;
      const cachedStillValid = Boolean(
        cachedSeek &&
          !cachedSeek.dead &&
          !cachedSeek.isAircraft &&
          !cachedSeek.isEmplacement &&
          !cachedSeek.isWarehouseBike &&
          !cachedSeek.driver &&
          !cachedSeek.npcDriver &&
          cachedSeek.team === bot.team &&
          !(cachedSeek.claimedByPlayer && (cachedSeek.claimedByPlayerTimer || 0) > 0) &&
          (!cachedSeek.claimedByBot || cachedSeek.claimedByBot === bot)
      );
      bot._vehSeekTimer = (bot._vehSeekTimer || 0) - dt;
      if (cachedStillValid && bot._vehSeekTimer > 0) {
        seekingVehicle = cachedSeek;
      } else if (bot._vehSeekTimer <= 0) {
        bot._vehSeekTimer = 0.24 + (bIdx % 7) * 0.015;
        const boardableList = vehicleManager.boardableGroundByTeam
          ? vehicleManager.boardableGroundByTeam[bot.team]
          : vehicleManager.vehicles;
        if (boardableList && boardableList.length > 0) {
          const isBravoArmorCrew = bot.squad === 'BRAVO';
          const strictDoctrine =
            (!player || player.squadDoctrineEnabled !== false) &&
            (this.world?.era || 'modern') === 'modern';
          const seekRangeSq = isBravoArmorCrew
            ? BOT.VEHICLE_SEEK_RANGE_BRAVO * BOT.VEHICLE_SEEK_RANGE_BRAVO
            : BOT.VEHICLE_SEEK_RANGE_OTHER * BOT.VEHICLE_SEEK_RANGE_OTHER;
          let bestVehDistSq = seekRangeSq;
          for (let vi = 0; vi < boardableList.length; vi++) {
            const veh = boardableList[vi];
            if (
              veh.dead ||
              veh.isAircraft ||
              veh.isEmplacement ||
              veh.isWarehouseBike ||
              veh.driver ||
              veh.npcDriver ||
              veh.team !== bot.team ||
              (veh.claimedByPlayer && (veh.claimedByPlayerTimer || 0) > 0)
            ) {
              continue;
            }
            const isHeavyArmorVeh =
              veh.type === 'tank' || veh.type === 'apc' || veh.type === 'aa';
            if (strictDoctrine && isHeavyArmorVeh && !isBravoArmorCrew) {
              continue;
            }
            const dSq = bot.pos.distanceToSquared(veh.pos);
            if (dSq >= bestVehDistSq) continue;
            if (
              veh.claimedByBot &&
              veh.claimedByBot !== bot &&
              !veh.claimedByBot.dead &&
              !veh.claimedByBot.downed &&
              !veh.claimedByBot.drivingVehicle &&
              ((veh.claimedByBot.squad === 'BRAVO' && !isBravoArmorCrew) ||
                veh.claimedByBot.pos.distanceToSquared(veh.pos) < dSq)
            ) {
              continue;
            }
            bestVehDistSq = dSq;
            seekingVehicle = veh;
          }
        }
        bot._seekingVehicleRef = seekingVehicle;
      }

      if (seekingVehicle) {
        seekingVehicle.claimedByBot = bot;
        const curVehDistSq = bot.pos.distanceToSquared(seekingVehicle.pos);
        if (curVehDistSq <= BOT.VEHICLE_BOARD_DISTANCE * BOT.VEHICLE_BOARD_DISTANCE) {
          seekingVehicle.npcDriver = bot;
          seekingVehicle.claimedByBot = null;
          bot._seekingVehicleRef = null;
          bot.drivingVehicle = seekingVehicle;
          bot.mesh.visible = false;
          if (this.onTelemetryEvent) {
            this.onTelemetryEvent('NPC_BOARDED_VEHICLE', {
              npc: bot.name,
              team: bot.team,
              squad: bot.squad,
              role: bot.role,
              vehicleId: seekingVehicle.id,
              vehicleName: seekingVehicle.name,
              x: Math.round(seekingVehicle.pos.x),
              z: Math.round(seekingVehicle.pos.z)
            });
          }
          continue;
        }
      }
    } else if (bot._seekingVehicleRef) {
      bot._seekingVehicleRef = null;
    }

    // =======================================================================
    // ANTI-ARMOR TARGETING (ENGINEER RPG-7 SQUADS HUNTING TANKS & ARMORED CARS)
    // =======================================================================
    if (bot.rpgCooldown > 0) {
      bot.rpgCooldown -= dt;
    }

    bot._raycastsThisFrame = 0;
    bot._armorScanTimer = (bot._armorScanTimer || 0) - dt;
    let nearestArmor = null;
    let nearestArmorDistSq = BOT.ENGAGE_RANGE_RPG_CHECK * BOT.ENGAGE_RANGE_RPG_CHECK;
    const isPrimitiveEra = this.world?.era === 'medieval' || this.world?.era === 'jurassic';
    if (!isPrimitiveEra && bot.role === 'ENGINEER' && vehicleManager && vehicleManager.vehicles) {
      if (
        bot._armorScanTimer > 0 &&
        bot._cachedArmorTarget &&
        !bot._cachedArmorTarget.dead &&
        (bot._cachedArmorTarget.driver ||
          bot._cachedArmorTarget.npcDriver ||
          bot._cachedArmorTarget.aiPilotActive ||
          (!bot._cachedArmorTarget.isWarehouseBike &&
            bot._cachedArmorTarget.type !== 'bike' &&
            bot._cachedArmorTarget.type !== 'atv'))
      ) {
        nearestArmor = bot._cachedArmorTarget;
        nearestArmorDistSq = bot.pos.distanceToSquared(nearestArmor.pos);
      } else {
        bot._armorScanTimer = 0.35 + Math.random() * 0.25;
        const enemyTeam = bot.team === 'US' ? 'RU' : 'US';
        const enemyAirList = vehicleManager.activeAircraftByTeam
          ? vehicleManager.activeAircraftByTeam[enemyTeam]
          : null;
        const enemyGroundList = vehicleManager.activeGroundTargetsByTeam
          ? vehicleManager.activeGroundTargetsByTeam[bot.team]
          : null;

        if (enemyAirList && enemyGroundList) {
          for (let ai = 0; ai < enemyAirList.length; ai++) {
            const veh = enemyAirList[ai];
            if (veh.dead || (!veh.driver && !veh.aiPilotActive)) continue;
            if (veh.isLowAltRadarMasked || (veh.airborneRadarTimer || 0) < 4.0) continue;
            const isStealthPlane = veh.isStealthAircraft || veh.aircraftRole === 'b2_spirit';
            if (isStealthPlane && (veh.flareActiveTimer || 0) > 0) continue;
            const maxManpadsRange = isStealthPlane ? 380 * (veh.stealthFactor || 0.12) : 380;
            const airDistSq = bot.pos.distanceToSquared(veh.pos);
            if (
              airDistSq < maxManpadsRange * maxManpadsRange &&
              (!nearestArmor || !nearestArmor.isAircraft || airDistSq < nearestArmorDistSq)
            ) {
              nearestArmorDistSq = airDistSq;
              nearestArmor = veh;
            }
          }
          if (!nearestArmor) {
            for (let gi = 0; gi < enemyGroundList.length; gi++) {
              const veh = enemyGroundList[gi];
              if (veh.dead || veh.team === bot.team) continue;
              const isOccupied = Boolean(veh.driver || veh.npcDriver);
              const dSq = bot.pos.distanceToSquared(veh.pos);
              const effectiveDistSq = isOccupied ? dSq * 0.7 : dSq;
              if (
                effectiveDistSq < nearestArmorDistSq &&
                this.canBotSeeTarget(bot, `veh_${veh.id}`, veh.pos, true)
              ) {
                nearestArmorDistSq = dSq;
                nearestArmor = veh;
              }
            }
          }
        } else {
          for (const veh of vehicleManager.vehicles) {
            if (veh.dead || veh.team === bot.team) continue;
            const isOccupied = Boolean(veh.driver || veh.npcDriver);
            if (!isOccupied && (veh.isWarehouseBike || veh.type === 'bike' || veh.type === 'atv')) {
              continue;
            }
            if (veh.isAircraft) {
              if (!veh.driver && !veh.aiPilotActive) continue;
              if (veh.isLowAltRadarMasked || (veh.airborneRadarTimer || 0) < 4.0) continue;
              const isStealthPlane = veh.isStealthAircraft || veh.aircraftRole === 'b2_spirit';
              if (isStealthPlane && (veh.flareActiveTimer || 0) > 0) continue;
              const maxManpadsRange = isStealthPlane ? 380 * (veh.stealthFactor || 0.12) : 380;
              const airDistSq = bot.pos.distanceToSquared(veh.pos);
              if (
                airDistSq < maxManpadsRange * maxManpadsRange &&
                (!nearestArmor || !nearestArmor.isAircraft || airDistSq < nearestArmorDistSq)
              ) {
                nearestArmorDistSq = airDistSq;
                nearestArmor = veh;
              }
              continue;
            }
            const dSq = bot.pos.distanceToSquared(veh.pos);
            const effectiveDistSq = isOccupied ? dSq * 0.7 : dSq;
            if (
              effectiveDistSq < nearestArmorDistSq &&
              this.canBotSeeTarget(bot, `veh_${veh.id}`, veh.pos, true)
            ) {
              nearestArmorDistSq = dSq;
              nearestArmor = veh;
            }
          }
        }
        bot._cachedArmorTarget = nearestArmor;
      }
    }

    // Toggle shoulder-mounted RPG-7 / Stinger launcher mesh when hunting enemy armor or aircraft
    const shouldUseRpg = Boolean(
      nearestArmor &&
        (nearestArmor.isAircraft ||
          nearestArmorDistSq < BOT.ENGAGE_RANGE_RPG_TOGGLE * BOT.ENGAGE_RANGE_RPG_TOGGLE)
    );
    if (bot.usingRpg !== shouldUseRpg) {
      bot.usingRpg = shouldUseRpg;
      // Swapping between primary rifle and back-slung RPG-7 requires a physical weapon-ready transition!
      bot.weaponReadyTimer = Math.max(bot.weaponReadyTimer || 0, 0.95);
      bot.aimRaiseProgress = 0.0;
      bot.transitionState = 'EQUIPPING_WEAPON';
      if (parts.gunGroup) parts.gunGroup.visible = !shouldUseRpg;
      if (parts.rpgShoulderGroup) parts.rpgShoulderGroup.visible = shouldUseRpg;
      if (parts.rpgBackTube) parts.rpgBackTube.visible = !shouldUseRpg;
    }

    // Find nearest VISIBLE enemy (ring-ordered so close-range threats are tested FIRST within the 2-raycast budget!)
    bot._targetScanTimer = (bot._targetScanTimer || 0) - dt;
    let nearestEnemy = null;
    let nearestDistSq = BOT.ENGAGE_RANGE_INFANTRY * BOT.ENGAGE_RANGE_INFANTRY;

    if (bot.assessThreatEnemy) {
      // Rescuing Medic is assessing & neutralizing the immediate threat around a casualty first!
      nearestEnemy = bot.assessThreatEnemy;
      nearestDistSq = bot.assessThreatEnemy.distSq || bot.pos.distanceToSquared(bot.assessThreatEnemy.pos);
    } else if (nearestArmor) {
      // Engineers prioritize enemy Main Battle Tanks, APCs & Armored Cars!
      nearestDistSq = nearestArmorDistSq;
      nearestEnemy = setBotEnemyRef(bot, nearestArmor.pos, false, true, nearestArmor);
    } else if (
      bot._targetScanTimer > 0 &&
      bot._cachedEnemy &&
      bot._cachedEnemy.unit &&
      !bot._cachedEnemy.unit.dead &&
      !bot._cachedEnemy.unit.downed &&
      !bot._cachedEnemy.unit.drivingVehicle
    ) {
      nearestEnemy = bot._cachedEnemy;
      nearestEnemy.pos = nearestEnemy.unit.pos;
      nearestDistSq = bot.pos.distanceToSquared(nearestEnemy.pos);
    } else {
      bot._targetScanTimer = 0.28 + Math.random() * 0.22;
      if (!player.dead && !player.downed && player.team !== bot.team) {
        const dSq = bot.pos.distanceToSquared(player.pos);
        if (player.activeVehicle && !player.activeVehicle.dead) {
          const pVeh = player.activeVehicle;
          const isStealthPVeh = pVeh.isStealthAircraft || pVeh.aircraftRole === 'b2_spirit';
          const pVehMaxRange = isStealthPVeh
            ? (pVeh.flareActiveTimer || 0) > 0
              ? 0
              : BOT.COMBAT_RANGE_VEHICLE * (pVeh.stealthFactor || 0.12)
            : BOT.COMBAT_RANGE_VEHICLE;
          if (
            dSq < pVehMaxRange * pVehMaxRange &&
            dSq < nearestDistSq &&
            this.canBotSeeTarget(bot, 'PLAYER_VEH', pVeh.pos, true)
          ) {
            nearestDistSq = dSq;
            nearestEnemy = setBotEnemyRef(bot, pVeh.pos, false, true, pVeh);
          }
        } else if (
          dSq < nearestDistSq * (player.isUavStealthMasked ? 0.36 : 1.0) &&
          this.canBotSeeTarget(bot, 'PLAYER', player.pos, true)
        ) {
          nearestDistSq = dSq;
          nearestEnemy = setBotEnemyRef(bot, player.pos, true, false, player);
        }
      }

      const maxEngage = BOT.ENGAGE_RANGE_INFANTRY;
      const enemyTeam = bot.team === 'US' ? 'RU' : 'US';
      const enemyGrid = this.teamGrid && this.teamGrid[enemyTeam];
      if (enemyGrid) {
        enemyGrid.forEachRingOrder(bot.pos.x, bot.pos.z, maxEngage, (other, dSq2D) => {
          if (dSq2D >= nearestDistSq) return;
          if (other.dead || other.downed || other.drivingVehicle || other.team === bot.team) return;
          const dy = other.pos.y - bot.pos.y;
          const dSq = dSq2D + dy * dy;
          if (dSq < nearestDistSq && this.canBotSeeTarget(bot, other.id, other.pos, true)) {
            nearestDistSq = dSq;
            nearestEnemy = setBotEnemyRef(bot, other.pos, false, false, other);
          }
        });
      } else {
        const enemyList =
          this.aliveByTeam && this.aliveByTeam[enemyTeam] ? this.aliveByTeam[enemyTeam] : this.bots;
        for (let i = 0; i < enemyList.length; i++) {
          const other = enemyList[i];
          if (other.dead || other.downed || other.drivingVehicle || other.team === bot.team) continue;
          const dx = other.pos.x - bot.pos.x;
          if (dx > maxEngage || dx < -maxEngage) continue;
          const dz = other.pos.z - bot.pos.z;
          if (dz > maxEngage || dz < -maxEngage) continue;
          const dy = other.pos.y - bot.pos.y;
          const dSq = dx * dx + dy * dy + dz * dz;
          if (dSq < nearestDistSq && this.canBotSeeTarget(bot, other.id, other.pos, true)) {
            nearestDistSq = dSq;
            nearestEnemy = setBotEnemyRef(bot, other.pos, false, false, other);
          }
        }
      }
      bot._cachedEnemy = nearestEnemy;
    }

    const targetFlag = this.world.flags[bot.targetFlagIndex];
    const goal = seekingVehicle
      ? tmpVec3Copy(seekingVehicle.pos)
      : tmpVec3Copy(targetFlag.pos).add(bot.waypointOffset);

    let hasDynamicGoal = false;
    if (!seekingVehicle && bot.playerOrderTimer > 0 && !player.dead) {
      if (bot.playerOrderMode === 'FOLLOW') {
        goal.copy(player.pos).add(bot.waypointOffset);
        hasDynamicGoal = true;
      } else if (bot.playerOrderMode === 'HOLD' || bot.playerOrderMode === 'RETREAT') {
        goal.copy(bot.playerOrderPos).add(bot.waypointOffset);
        hasDynamicGoal = true;
      }
    }

    // Squad Cohesion: Non-leader squadmates stay grouped around their own Squad Leader via O(1) lookup!
    let squadLeaderBot = null;
    if (!seekingVehicle && !bot.isSquadLeader) {
      const cand =
        this.squadLeaders && this.squadLeaders[bot.team]
          ? this.squadLeaders[bot.team][bot.squad]
          : null;
      if (cand && !cand.dead && !cand.downed && !cand.drivingVehicle) {
        squadLeaderBot = cand;
      }
      if (squadLeaderBot && bot.memberClusterOffset && squadLeaderBot.pos.distanceTo(goal) < 55) {
        goal.copy(squadLeaderBot.pos).add(bot.memberClusterOffset);
        hasDynamicGoal = true;
      }
    }

    // Ensure dynamic goal coordinate never lies inside a building or container footprint (static flag waypoints are pre-pushed!)
    if (!seekingVehicle && hasDynamicGoal && this.world.pushOutOfBuildingFootprint) {
      const gdx = goal.x - (bot._lastRawGoalX ?? 1e9);
      const gdz = goal.z - (bot._lastRawGoalZ ?? 1e9);
      if (gdx * gdx + gdz * gdz > 0.64) {
        bot._lastRawGoalX = goal.x;
        bot._lastRawGoalZ = goal.z;
        const safeGoal = this.world.pushOutOfBuildingFootprint(goal.x, goal.z, 2.2);
        bot._safeGoalX = safeGoal.x;
        bot._safeGoalZ = safeGoal.z;
      }
      if (bot._safeGoalX !== undefined) {
        goal.x = bot._safeGoalX;
        goal.z = bot._safeGoalZ;
      }
    }

    // Autonomous Contextual Proximity & Squad Teammate Callouts + Mount & Blade Battle Cries
    const isMedievalEra = (this.world?.era || 'modern') === 'medieval';
    if (bot.battleCryCooldown > 0) {
      bot.battleCryCooldown = Math.max(0, bot.battleCryCooldown - dt);
    }
    if (bot.autoRetreatTimer > 0) {
      bot.autoRetreatTimer = Math.max(0, bot.autoRetreatTimer - dt);
    }

    // Autonomous Mount & Blade Morale / Tactical Retreat Check:
    // If an un-ordered soldier drops below 32 HP while under heavy fire, they execute a 4.5s fighting withdrawal!
    if (
      !bot.playerOrderMode &&
      !bot.isGarrisonDefender &&
      bot.hp < 32 &&
      (bot.suppressionLevel > 0.35 || bot.underFireTimer > 0.5) &&
      (bot.autoRetreatTimer || 0) <= 0
    ) {
      bot.autoRetreatTimer = 4.5;
      if (isMedievalEra && player && !player.dead) {
        const dP = bot.pos.distanceTo(player.pos);
        if (dP < 55) {
          const dx = bot.pos.x - player.pos.x;
          const dz = bot.pos.z - player.pos.z;
          const len = Math.hypot(dx, dz) || 1;
          const pan = (dx * Math.cos(player.yaw || 0) + dz * -Math.sin(player.yaw || 0)) / len;
          sound.playMedievalSoldierVoice?.('retreat', dP, pan);
        }
        if (bot.team === player.team && dP <= 45) {
          this.emitBotComms(bot, player, '🏳️ Wounded! Falling back behind the shield line!', 'URGENT');
        }
      }
    }

    // Spatial 3D Mount & Blade Battle Cries & Shield Clatter for nearby Medieval Soldiers (Both Allied & Enemy!)
    if (isMedievalEra && !bot.isDinosaur && nearestEnemy && (bot.battleCryCooldown || 0) <= 0 && player && !player.dead) {
      const distToPlayer = bot.pos.distanceTo(player.pos);
      if (distToPlayer < 65 && nearestDistSq < 42 * 42) {
        bot.battleCryCooldown = 4.5 + Math.random() * 5.5;
        const dx = bot.pos.x - player.pos.x;
        const dz = bot.pos.z - player.pos.z;
        const len = Math.hypot(dx, dz) || 1;
        const pan = (dx * Math.cos(player.yaw || 0) + dz * -Math.sin(player.yaw || 0)) / len;
        const cryKind =
          bot.playerOrderMode === 'HOLD' || bot.inShieldWall || bot.isGarrisonDefender
            ? 'shield_wall'
            : bot.playerOrderMode === 'RETREAT' || (bot.autoRetreatTimer || 0) > 0
            ? 'retreat'
            : 'battle_cry';
        sound.playMedievalSoldierVoice?.(cryKind, distToPlayer, pan);
      }
    }

    if (bot.team === player.team && !player.dead && bot.chatCooldown <= 0 && this.globalCommsCooldown <= 0) {
      const distToPlayer = bot.pos.distanceTo(player.pos);
      if (distToPlayer <= 45 || bot.inPlayerSquad) {
        if (bot.playerOrderMode === 'RETREAT' || (bot.autoRetreatTimer || 0) > 0) {
          this.emitBotComms(
            bot,
            player,
            isMedievalEra
              ? '🏳️ Falling back in formation! Shields up, cover the retreat!'
              : 'Falling back to rear cover! Laying down suppressive fire!',
            'URGENT'
          );
        } else if (bot.suppressionLevel > 0.45) {
          this.emitBotComms(
            bot,
            player,
            isMedievalEra
              ? '🛡️ Heavy arrow volley! Raise shields — lock the shield wall!'
              : 'Taking heavy suppressive fire! Pinned down here!',
            'URGENT'
          );
        } else if (nearestEnemy && nearestEnemy.isVehicle && nearestDistSq < BOT.ENGAGE_RANGE_INFANTRY * BOT.ENGAGE_RANGE_INFANTRY) {
          const cDir = this.getCompassDirection(
            nearestEnemy.pos.x - bot.pos.x,
            nearestEnemy.pos.z - bot.pos.z
          );
          const vType = nearestEnemy.unit && nearestEnemy.unit.type ? nearestEnemy.unit.type.toUpperCase() : 'ARMOR';
          this.emitBotComms(
            bot,
            player,
            isMedievalEra
              ? `⚔️ Enemy ${vType === 'WARHORSE' ? 'Cavalry' : 'Siege Engine'} spotted ${cDir} (${Math.round(Math.sqrt(nearestDistSq))}m)! Brace spears & shields!`
              : `Enemy ${vType} spotted ${cDir} (${Math.round(Math.sqrt(nearestDistSq))}m)! Watch for armor!`,
            'COMBAT'
          );
        } else if (nearestEnemy && nearestDistSq < BOT.COMBAT_RANGE_INFANTRY * BOT.COMBAT_RANGE_INFANTRY) {
          const cDir = this.getCompassDirection(
            nearestEnemy.pos.x - bot.pos.x,
            nearestEnemy.pos.z - bot.pos.z
          );
          const eRole = nearestEnemy.unit && nearestEnemy.unit.role ? nearestEnemy.unit.role : 'INFANTRY';
          const medievalCallouts = [
            `⚔️ "FOR THE KING! CHARGE!" — Engaging enemy ${eRole} ${cDir} (${Math.round(Math.sqrt(nearestDistSq))}m)!`,
            `🛡️ "SHIELD WALL! HOLD THE LINE!" — Enemy ${eRole} advancing ${cDir} (${Math.round(Math.sqrt(nearestDistSq))}m)!`,
            `🏹 "ARCHERS, LOOSE!" — Target ${cDir} at ${Math.round(Math.sqrt(nearestDistSq))}m!`,
            `⚔️ "STEEL AND BLOOD! BREAK THEIR RANKS!" — Clashing ${cDir} (${Math.round(Math.sqrt(nearestDistSq))}m)!`
          ];
          this.emitBotComms(
            bot,
            player,
            isMedievalEra
              ? medievalCallouts[Math.floor(Math.random() * medievalCallouts.length)]
              : `Contact ${cDir}, ${Math.round(Math.sqrt(nearestDistSq))}m! Engaging enemy ${eRole}!`,
            'COMBAT'
          );
        } else if (bot.playerOrderTimer > 0 && bot.playerOrderMode === 'FOLLOW' && distToPlayer < 16) {
          this.emitBotComms(
            bot,
            player,
            isMedievalEra
              ? '🛡️ Right behind you My Lord, shields at the ready!'
              : 'Right on your six Lead, watching your flank!',
            'ORDER'
          );
        } else if (bot.pos.distanceTo(targetFlag.pos) < 24 && targetFlag.owner !== bot.team) {
          this.emitBotComms(
            bot,
            player,
            isMedievalEra
              ? `⚔️ Storming Objective ${targetFlag.id} — forward men, take the banner!`
              : `Pushing Objective ${targetFlag.id}, cover me!`,
            'OBJECTIVE'
          );
        }
      }
    }

    // Route across the nearest of the 3 grand 92m-wide river bridges (-400, 0, +400) when crossing the river
    if (!seekingVehicle && Math.sign(bot.pos.x) !== Math.sign(goal.x) && Math.abs(bot.pos.x) < 34) {
      const nearestBridgeZ = Math.abs(bot.pos.z) < 200 ? 0 : bot.pos.z > 0 ? 400 : -400;
      goal.x = Math.sign(goal.x) * 4;
      goal.z = nearestBridgeZ;
    }

    // ─── MEDIEVAL CASTLE GATEHOUSE ARCHWAY PATHFINDING ────────────────────────────
    // Each Medieval Castle has 2-voxel-thick stone curtain walls at (cx ± halfGx*1.25, cz ± halfGz*1.25)
    // and 4 wide 11m Gatehouse Archways centered on the North, South, West, and East walls!
    // When a soldier is entering a castle courtyard from outside (or exiting a castle courtyard to outside),
    // route their waypoint through the nearest open Gatehouse Archway so they never walk into solid curtain walls!
    if (!seekingVehicle && isMedievalEra && Array.isArray(this.world.castleSites)) {
      for (let cIdx = 0; cIdx < this.world.castleSites.length; cIdx++) {
        const site = this.world.castleSites[cIdx];
        const wallHalfX = site.halfGx * 1.25;
        const wallHalfZ = site.halfGz * 1.25;
        const bDx = bot.pos.x - site.cx;
        const bDz = bot.pos.z - site.cz;
        if (Math.abs(bDx) > wallHalfX + 42 || Math.abs(bDz) > wallHalfZ + 42) continue;

        const botInside = Math.abs(bDx) < wallHalfX - 1.8 && Math.abs(bDz) < wallHalfZ - 1.8;
        const gDx = goal.x - site.cx;
        const gDz = goal.z - site.cz;
        const goalInside = Math.abs(gDx) < wallHalfX - 1.8 && Math.abs(gDz) < wallHalfZ - 1.8;

        // Also rescue bots whose goal accidentally landed right on top of the 2-voxel curtain wall thickness!
        const goalOnCurtainWall =
          (Math.abs(Math.abs(gDx) - wallHalfX) < 3.2 && Math.abs(gDz) <= wallHalfZ + 3.2) ||
          (Math.abs(Math.abs(gDz) - wallHalfZ) < 3.2 && Math.abs(gDx) <= wallHalfX + 3.2);
        if (goalOnCurtainWall) {
          const pushIn = goalInside ? -3.4 : 3.4;
          if (Math.abs(Math.abs(gDx) - wallHalfX) < 3.2) {
            goal.x = site.cx + Math.sign(gDx || 1) * (wallHalfX + pushIn);
          }
          if (Math.abs(Math.abs(gDz) - wallHalfZ) < 3.2) {
            goal.z = site.cz + Math.sign(gDz || 1) * (wallHalfZ + pushIn);
          }
        }

        if (botInside !== goalInside) {
          // Check if the bot is already aligned within one of the 4 wide 11m gate corridors (±4.2m of gate centerline)
          const alignedEastWestGate = Math.abs(bDz) <= 4.2 && Math.abs(bDx) >= wallHalfX - 6.0;
          const alignedNorthSouthGate = Math.abs(bDx) <= 4.2 && Math.abs(bDz) >= wallHalfZ - 6.0;
          if (!alignedEastWestGate && !alignedNorthSouthGate) {
            // Pick the closest of the 4 Gatehouse Archways (West, East, North, South)
            const gateOffset = botInside ? -3.8 : 4.2;
            const gates = [
              { x: site.cx - (wallHalfX + gateOffset), z: site.cz }, // West Gate
              { x: site.cx + (wallHalfX + gateOffset), z: site.cz }, // East Gate
              { x: site.cx, z: site.cz - (wallHalfZ + gateOffset) }, // North Gate
              { x: site.cx, z: site.cz + (wallHalfZ + gateOffset) }  // South Gate
            ];
            let bestGate = gates[0];
            let bestScore = Infinity;
            for (let g = 0; g < gates.length; g++) {
              const gt = gates[g];
              const dBot = Math.hypot(gt.x - bot.pos.x, gt.z - bot.pos.z);
              const dGoal = Math.hypot(goal.x - gt.x, goal.z - gt.z);
              const score = dBot + dGoal * 0.65;
              if (score < bestScore) {
                bestScore = score;
                bestGate = gt;
              }
            }
            goal.x = bestGate.x;
            goal.z = bestGate.z;
          }
          break;
        }
      }
    }

    const toGoal = goal.sub(bot.pos);
    toGoal.y = 0;
    const distToGoal = toGoal.length();
    if (distToGoal > 0.01) toGoal.normalize();

    // Determine Desired Velocity Vector based on Combat Archetype
    const desiredDir = tmpVec3(0, 0, 0);
    let desiredSpeed = 0;
    const inCombat = Boolean(
      !seekingVehicle &&
        nearestEnemy &&
        (nearestEnemy.isVehicle
          ? nearestDistSq < 120 * 120
          : nearestDistSq < BOT.COMBAT_RANGE_INFANTRY * BOT.COMBAT_RANGE_INFANTRY)
    );

    if (seekingVehicle) {
      // Sprinting across the Motor Pool to board an unoccupied Tank, APC, or Humvee!
      bot.isCrouching = false;
      bot.leanDir = 0;
      desiredDir.copy(toGoal);
      desiredSpeed = BOT.SPEED_SPRINT;
    } else if (inCombat && nearestEnemy && nearestEnemy.isVehicle) {
      // Anti-Armor Engineer stance: advance if > 78m, otherwise drop to a stable firing knee!
      const toVeh = tmpVec3Copy(nearestEnemy.pos).sub(bot.pos);
      toVeh.y = 0;
      toVeh.normalize();
      if (nearestDistSq > 78 * 78) {
        bot.isCrouching = false;
        bot.leanDir = 0;
        desiredDir.copy(toVeh);
        desiredSpeed = BOT.SPEED_COMBAT_FAST;
      } else if (nearestDistSq < 14 * 14) {
        // Back up slightly to stay outside own RPG blast radius
        bot.isCrouching = false;
        bot.leanDir = 0;
        desiredDir.copy(toVeh).negate();
        desiredSpeed = 5.2;
      } else {
        bot.isCrouching = true;
        bot.leanDir = 0;
        desiredSpeed = 0;
      }
    } else if (inCombat) {
      bot.tacticTimer -= dt;
      if (bot.tacticTimer <= 0) {
        bot.tacticTimer = 1.8 + Math.random() * 2.4;
        bot.tacticPhase = (bot.tacticPhase + 1) % 3;
        if (bot.inFriendlyForwardBase || bot.isGarrisonDefender) {
          // Real-life & Tactical Shooter Entrenched Defender Stance:
          // Garrison & Forward Base defenders stay behind cover/sandbags (`ANCHOR_CROUCH` / `COVER_PEEK`)
          // instead of rushing out of the base perimeter!
          const defStyles = ['ANCHOR_CROUCH', 'COVER_PEEK', 'ANCHOR_CROUCH'];
          bot.tactic = defStyles[Math.floor(Math.random() * defStyles.length)];
        } else if (Math.random() < 0.25) {
          const styles = ['ANCHOR_CROUCH', 'COVER_PEEK', 'ADVANCE_PAUSE', 'FLANK_RUSH', 'HOLD_STAND'];
          bot.tactic = styles[Math.floor(Math.random() * styles.length)];
        }
      }

      // Perimeter Early-Warning Spotter Advantage:
      // When an enemy attacker approaches within 55m of a friendly Forward Base, the defending Garrison
      // automatically paints them on the 3D HUD & Minimap (`spottedTimer`) and alerts Command Net!
      if (bot.inFriendlyForwardBase && nearestEnemy && nearestDistSq <= 55 * 55) {
        if (!nearestEnemy.isPlayer && nearestEnemy.unit) {
          nearestEnemy.unit.spottedTimer = Math.max(nearestEnemy.unit.spottedTimer || 0, 6.0);
        }
        if (
          bot.team === player.team &&
          !player.dead &&
          this.globalCommsCooldown <= 0 &&
          (!this._garrisonAlertCooldown || (this._garrisonAlertCooldown[bot.team] || 0) <= 0)
        ) {
          if (this._garrisonAlertCooldown) this._garrisonAlertCooldown[bot.team] = 18.0;
          const cDir = this.getCompassDirection(
            nearestEnemy.pos.x - bot.pos.x,
            nearestEnemy.pos.z - bot.pos.z
          );
          const flagLabel = bot.garrisonFlagId || (targetFlag ? targetFlag.id : 'BASE');
          this.emitBotComms(
            bot,
            player,
            `🛡️ [GARRISON ALERT] ${bot.squad} Squad at OBJ ${flagLabel}: Enemy assault spotted ${cDir} (${Math.round(Math.sqrt(nearestDistSq))}m) — holding entrenched cover!`,
            'COMMAND',
            true,
            'CMD NET'
          );
        }
      }

      const toEnemy = tmpVec3Copy(nearestEnemy.pos).sub(bot.pos);
      toEnemy.y = 0;
      toEnemy.normalize();
      const perp = tmpVec3(-toEnemy.z * bot.strafeDir, 0, toEnemy.x * bot.strafeDir);
      const isMeleeKnight =
        bot.role === 'SWORDSMAN' ||
        bot.role === 'GREATSWORD_KNIGHT' ||
        bot.role === 'POLEARM_KNIGHT';
      const isRetreatingNow =
        (bot.playerOrderTimer > 0 && bot.playerOrderMode === 'RETREAT') ||
        (bot.autoRetreatTimer || 0) > 0;
      const isChargingNow =
        (bot.playerOrderTimer > 0 && bot.playerOrderMode === 'CHARGE') ||
        (isMeleeKnight && !bot.inFriendlyForwardBase && !bot.isGarrisonDefender && bot.playerOrderMode !== 'HOLD');
      const isShieldWallDefending =
        (bot.playerOrderTimer > 0 && bot.playerOrderMode === 'HOLD') ||
        bot.inShieldWall ||
        bot.isGarrisonDefender ||
        bot.inFriendlyForwardBase;

      if (isRetreatingNow) {
        // Mount & Blade Tactical Retreat / Fighting Withdrawal:
        // Pull back toward rear objective/keep (or directly away from enemy) while keeping weapon aimed at pursuers!
        bot.isCrouching = false;
        bot.leanDir = 0;
        bot.inShieldWall = false;
        if (distToGoal > 4.5 && bot.playerOrderMode === 'RETREAT') {
          desiredDir.copy(toGoal);
        } else {
          desiredDir.copy(toEnemy).negate().addScaledVector(perp, 0.25).normalize();
        }
        desiredSpeed = BOT.SPEED_COMBAT_FAST;
      } else if (isChargingNow) {
        // Mount & Blade All-Out Charge / Melee Shock Assault:
        // Infantry & Knights charge aggressively toward the enemy line to close into sword/polearm/point-blank range!
        bot.isCrouching = false;
        bot.leanDir = 0;
        bot.inShieldWall = false;
        const stopDist = isMeleeKnight ? 2.4 : 8.5;
        if (nearestDistSq > stopDist * stopDist) {
          desiredDir.copy(toEnemy).addScaledVector(perp, 0.18).normalize();
          desiredSpeed = isMeleeKnight ? BOT.SPEED_SPRINT * 1.08 : BOT.SPEED_COMBAT_FAST;
        } else {
          // Circle-strafe in close melee clash
          desiredDir.copy(perp);
          desiredSpeed = 2.8;
        }
      } else if (isShieldWallDefending) {
        // Mount & Blade Shield Wall / Entrenched Line Defense:
        // Soldiers hold their line, lock shields (crouching/bracing against arrows), and counter-strike enemies that breach within 6m!
        bot.inShieldWall = isMedievalEra;
        if (distToGoal > 5.5) {
          bot.isCrouching = false;
          bot.leanDir = 0;
          desiredDir.copy(toGoal);
          desiredSpeed = BOT.SPEED_COMBAT_MED;
        } else if (isMeleeKnight && nearestDistSq <= 6.2 * 6.2) {
          // Enemy reached the shield wall — step forward one pace to strike with sword/polearm!
          bot.isCrouching = false;
          bot.leanDir = 0;
          desiredDir.copy(toEnemy);
          desiredSpeed = 3.2;
        } else {
          bot.isCrouching = true;
          bot.leanDir = 0;
          desiredSpeed = 0;
        }
      } else if (bot.tactic === 'ANCHOR_CROUCH') {
        bot.isCrouching = true;
        bot.leanDir = 0;
        desiredSpeed = 0;
      } else if (bot.tactic === 'COVER_PEEK') {
        if (bot.tacticPhase === 0) {
          bot.isCrouching = true;
          bot.leanDir = 0;
          desiredSpeed = 0;
        } else {
          bot.isCrouching = false;
          bot.leanDir = bot.strafeDir;
          desiredSpeed = 0;
        }
      } else if (bot.tactic === 'ADVANCE_PAUSE') {
        if (bot.tacticPhase === 0 && nearestDistSq > 16 * 16) {
          bot.isCrouching = false;
          bot.leanDir = 0;
          desiredDir.copy(toEnemy);
          desiredSpeed = BOT.SPEED_COMBAT_SLOW;
        } else {
          bot.isCrouching = bot.tacticPhase === 1;
          bot.leanDir = 0;
          desiredSpeed = 0;
        }
      } else if (bot.tactic === 'FLANK_RUSH') {
        bot.isCrouching = false;
        bot.leanDir = 0;
        if (nearestDistSq > 10 * 10) {
          desiredDir.copy(toEnemy).addScaledVector(perp, 0.55).normalize();
          desiredSpeed = BOT.SPEED_COMBAT_MED;
        } else {
          desiredSpeed = 0;
        }
      } else {
        bot.isCrouching = false;
        bot.leanDir = 0;
        if (bot.tacticPhase === 0 && distToGoal > 6) {
          desiredDir.copy(toGoal);
          desiredSpeed = 4.2;
        } else {
          desiredSpeed = 0;
        }
      }
    } else {
      const isFollowOrHold =
        bot.playerOrderTimer > 0 && (bot.playerOrderMode === 'FOLLOW' || bot.playerOrderMode === 'HOLD');
      const isCloseMode = bot.spacingMode === 'STAY_CLOSE';
      const anchorCenter =
        bot.playerOrderMode === 'HOLD' ? bot.playerOrderPos : player.pos;
      const distToAnchor =
        isFollowOrHold && anchorCenter ? Math.hypot(bot.pos.x - anchorCenter.x, bot.pos.z - anchorCenter.z) : 999;
      const distToSL =
        squadLeaderBot ? Math.hypot(bot.pos.x - squadLeaderBot.pos.x, bot.pos.z - squadLeaderBot.pos.z) : 0;

      const minSqDist = isCloseMode ? 8 : 20;
      const maxSqDist = isCloseMode ? 22 : 42;
      const maxClusterDist = isCloseMode ? 4.8 : 13.0;
      const goalTol = isCloseMode ? 4.2 : 7.5;

      const squadInPosition =
        isFollowOrHold &&
        ((bot.isSquadLeader && distToAnchor >= minSqDist && distToAnchor <= maxSqDist && distToGoal <= 10.0) ||
          (!bot.isSquadLeader && squadLeaderBot && distToSL <= maxClusterDist && distToAnchor <= maxSqDist + 6) ||
          distToGoal <= goalTol);

      if (!squadInPosition && distToGoal > 2.6) {
        bot.isCrouching = false;
        bot.leanDir = 0;
        desiredDir.copy(toGoal);
        // Double-time march sprint when >135m out of combat from objective across the 7,600m valley!
        desiredSpeed = distToGoal > 135 ? BOT.SPEED_SPRINT * 1.18 : BOT.SPEED_PATROL;
      } else {
        // Hold cohesive Squad overwatch formation using active spacing mode (STAY_CLOSE vs FAN_OUT)!
        // Garrison defenders crouch behind prepared forward-base cover while scanning the enemy approach!
        bot.isCrouching =
          (isFollowOrHold || bot.isGarrisonDefender || bot.inFriendlyForwardBase) &&
          bot.role !== 'MEDIC';
        bot.leanDir = 0;
        desiredSpeed = 0;
      }
    }

    // =======================================================================
    // REALISTIC POST-REVIVE STAND-UP & WEAPON-EQUIP STATE TRANSITIONS
    // =======================================================================
    if (bot.postReviveTimer > 0) {
      bot.postReviveTimer = Math.max(0, bot.postReviveTimer - dt);
      bot.standUpProgress = Math.min(1.0, (bot.standUpProgress || 0) + dt / 1.15);
      // Smooth ease-out from lying flat on back (-PI/2) -> pushing up onto one knee (0)
      const easeStand = 1 - Math.pow(1 - bot.standUpProgress, 2);
      bot.mesh.rotation.x = -Math.PI * 0.5 * (1 - easeStand);
      bot.isCrouching = true;
      if (bot.postReviveTimer > 1.05) {
        // Still pushing up off the ground onto one knee: cannot walk yet
        desiredSpeed = 0;
      } else {
        // Recovering on one knee: slow crouch step only
        desiredSpeed = Math.min(desiredSpeed, 2.5);
      }
    } else {
      bot.standUpProgress = 1.0;
      bot.mesh.rotation.x = 0;
    }

    if (bot.weaponReadyTimer > 0) {
      bot.weaponReadyTimer = Math.max(0, bot.weaponReadyTimer - dt);
      // While stowing medkit / bandages or unslinging rifle, keep pace slow and weapon lowered
      desiredSpeed = Math.min(desiredSpeed, 3.6);
    }

    // =======================================================================
    // BUILDING EXTERIOR REPULSION, VOXEL WALL UNSTUCK, 8-ANGLE FAN WHISKERS & ANTI-STUCK WATCHDOG
    // =======================================================================
    bot._wallRepulseTimer = (bot._wallRepulseTimer || 0) - dt;
    if (bot._wallRepulseTimer <= 0) {
      bot._wallRepulseTimer = 0.45 + Math.random() * 0.25;
      if (this.world.isInsideBuildingOrContainer && this.world.isInsideBuildingOrContainer(bot.pos.x, bot.pos.z, 1.15)) {
        const pushedOut = this.world.pushOutOfBuildingFootprint(bot.pos.x, bot.pos.z, 1.85);
        bot.pos.x = pushedOut.x;
        bot.pos.z = pushedOut.z;
      }

      // Check only if the soldier's center head/chest column is inside a full-height wall voxel
      const gCenterHead = this.world.worldToGrid(bot.pos.x, bot.pos.y + 1.75, bot.pos.z);
      if (this.world.voxels.has(this.world.key(gCenterHead.gx, gCenterHead.gy, gCenterHead.gz))) {
        const escapeAngles = [0, Math.PI * 0.5, -Math.PI * 0.5, Math.PI, Math.PI * 0.25, -Math.PI * 0.25];
        for (let aIdx = 0; aIdx < escapeAngles.length; aIdx++) {
          const ang = (bot.yaw || 0) + Math.PI + escapeAngles[aIdx];
          const tx = bot.pos.x + Math.sin(ang) * 1.65;
          const tz = bot.pos.z + Math.cos(ang) * 1.65;
          const ty = this.world.getGroundHeightAt(tx, tz);
          if (!this.isPointBlocked(tx, ty, tz, 0.15)) {
            bot.pos.set(tx, ty, tz);
            break;
          }
        }
      }
    }

    if (bot.avoidanceTimer > 0) {
      bot.avoidanceTimer = Math.max(0, bot.avoidanceTimer - dt);
    }

    // 8-Angle Fan Whisker Obstacle Avoidance (throttled per bot so 250 bots at FOB C never spike frame time)
    if (desiredSpeed > 0.1) {
      bot._whiskerTimer = (bot._whiskerTimer || 0) - dt;
      if (bot._whiskerTimer <= 0) {
        bot._whiskerTimer = 0.14 + Math.random() * 0.08;
        const baseAngle = Math.atan2(desiredDir.x, desiredDir.z);
        const centerBlockedNear = this.isPointBlocked(
          bot.pos.x + Math.sin(baseAngle) * 1.7,
          bot.pos.y,
          bot.pos.z + Math.cos(baseAngle) * 1.7,
          0.15
        );
        const centerBlockedFar =
          centerBlockedNear ||
          this.isPointBlocked(
            bot.pos.x + Math.sin(baseAngle) * 3.0,
            bot.pos.y,
            bot.pos.z + Math.cos(baseAngle) * 3.0,
            0.15
          );

        if (centerBlockedNear || centerBlockedFar) {
          const sign = bot.avoidanceSign || 1;
          const fanOffsets = [
            0.52 * sign,
            -0.52 * sign,
            1.05 * sign,
            -1.05 * sign,
            1.58 * sign,
            -1.58 * sign
          ];
          let chosenAngle = baseAngle + 1.55 * sign;
          for (let fIdx = 0; fIdx < fanOffsets.length; fIdx++) {
            const testAngle = baseAngle + fanOffsets[fIdx];
            const nearClear = !this.isPointBlocked(
              bot.pos.x + Math.sin(testAngle) * 1.85,
              bot.pos.y,
              bot.pos.z + Math.cos(testAngle) * 1.85,
              0.15
            );
            if (nearClear) {
              chosenAngle = testAngle;
              if (bot.avoidanceTimer <= 0) {
                bot.avoidanceSign = Math.sign(fanOffsets[fIdx]) || 1;
                bot.avoidanceTimer = 1.4;
              }
              break;
            }
          }
          bot._cachedSteerAngle = chosenAngle;
        } else {
          bot._cachedSteerAngle = null;
        }
      }
      if (typeof bot._cachedSteerAngle === 'number') {
        desiredDir.set(Math.sin(bot._cachedSteerAngle), 0, Math.cos(bot._cachedSteerAngle));
      }
    }

    // Progressive Physical Mass-Inertia Acceleration & Deceleration (never snaps instantaneously to top speed!)
    // - Mounted Knights on Warhorses build up stride momentum across walk -> trot -> canter -> gallop
    //   and trample enemy foot soldiers when galloping through their ranks!
    const speedMult = bot.isMountedKnight ? 1.48 : bot.isDinosaur ? 1.38 : 1.0;
    const targetSpeedTotal = desiredSpeed * speedMult;
    const targetVelX = desiredDir.x * targetSpeedTotal;
    const targetVelZ = desiredDir.z * targetSpeedTotal;
    const curBotSpeed = Math.hypot(bot.velX || 0, bot.velZ || 0);
    const isAccelerating = targetSpeedTotal > curBotSpeed + 0.15;
    const maxAccelMs2 = bot.isMountedKnight
      ? isAccelerating
        ? 4.2
        : 7.5
      : bot.isDinosaur
      ? isAccelerating
        ? 5.2
        : 8.5
      : isAccelerating
      ? 9.5
      : 14.5;
    const dvx = targetVelX - (bot.velX || 0);
    const dvz = targetVelZ - (bot.velZ || 0);
    const dvMag = Math.hypot(dvx, dvz);
    const maxDeltaV = maxAccelMs2 * dt;
    if (dvMag <= maxDeltaV) {
      bot.velX = targetVelX;
      bot.velZ = targetVelZ;
    } else {
      bot.velX = (bot.velX || 0) + (dvx / dvMag) * maxDeltaV;
      bot.velZ = (bot.velZ || 0) + (dvz / dvMag) * maxDeltaV;
    }

    const actualSpeed = Math.hypot(bot.velX, bot.velZ);

    // AI Mounted Knight Cavalry Trample: Warhorses charging at canter/gallop (>= 4.8 m/s) run over enemy foot soldiers!
    if (bot.isMountedKnight && actualSpeed >= 4.8) {
      const nowMs = performance.now();
      const moveDirX = bot.velX / actualSpeed;
      const moveDirZ = bot.velZ / actualSpeed;
      const trampleDmg = Math.round(THREE.MathUtils.clamp(45 + actualSpeed * 10.5, 65, 145));
      const enemyTeam = bot.team === 'US' ? 'RU' : 'US';
      const checkVictim = (victim) => {
        if (!victim || victim.dead || victim.team === bot.team || victim.drivingVehicle || victim.isMountedKnight) {
          return;
        }
        if (victim._lastTrampleHitMs && nowMs - victim._lastTrampleHitMs < 550) return;
        const edx = victim.pos.x - bot.pos.x;
        const edz = victim.pos.z - bot.pos.z;
        const edy = Math.abs(victim.pos.y - bot.pos.y);
        if (edy > 2.2) return;
        const fwdProj = edx * moveDirX + edz * moveDirZ;
        const latProj = Math.abs(-edx * moveDirZ + edz * moveDirX);
        if (fwdProj >= -0.4 && fwdProj <= 1.55 && latProj <= 0.95) {
          victim._lastTrampleHitMs = nowMs;
          const sideSign = -edx * moveDirZ + edz * moveDirX >= 0 ? 1 : -1;
          victim.velX = moveDirX * 6.5 - moveDirZ * sideSign * 4.0;
          victim.velZ = moveDirZ * 6.5 + moveDirX * sideSign * 4.0;
          if (victim.downed) {
            victim.bleedOutTimer = Math.min(victim.bleedOutTimer || 0.1, 0.05);
          } else {
            this.damageBot(
              victim,
              trampleDmg,
              bot.name,
              bot.team,
              'CAVALRY WARHORSE TRAMPLE',
              false,
              onKillFn,
              null
            );
          }
        }
      };
      const enemyGrid = this.teamGrid && this.teamGrid[enemyTeam];
      if (enemyGrid) {
        enemyGrid.forEachInRadius(bot.pos.x, bot.pos.z, 3.5, checkVictim);
      } else {
        const enemyList = this.aliveByTeam && this.aliveByTeam[enemyTeam] ? this.aliveByTeam[enemyTeam] : this.bots;
        for (let eIdx = 0; eIdx < enemyList.length; eIdx++) {
          checkVictim(enemyList[eIdx]);
        }
      }
      if (
        player &&
        !player.dead &&
        !player.downed &&
        !player.activeVehicle &&
        player.team !== bot.team &&
        (!player._lastTrampleHitMs || nowMs - player._lastTrampleHitMs >= 650)
      ) {
        const pdx = player.pos.x - bot.pos.x;
        const pdz = player.pos.z - bot.pos.z;
        const pdy = Math.abs(player.pos.y - bot.pos.y);
        const fwdProj = pdx * moveDirX + pdz * moveDirZ;
        const latProj = Math.abs(-pdx * moveDirZ + pdz * moveDirX);
        if (pdy <= 2.2 && fwdProj >= -0.4 && fwdProj <= 1.55 && latProj <= 0.98) {
          player._lastTrampleHitMs = nowMs;
          const sideSign = -pdx * moveDirZ + pdz * moveDirX >= 0 ? 1 : -1;
          player.vel.x += moveDirX * 7.5 - moveDirZ * sideSign * 4.5;
          player.vel.z += moveDirZ * 7.5 + moveDirX * sideSign * 4.5;
          player.takeDamage(
            Math.min(95, trampleDmg),
            bot.name,
            bot.team,
            'CAVALRY WARHORSE TRAMPLE',
            onKillFn,
            bot.pos
          );
        }
      }
    }

    // Apply horizontal movement & safe low-cover vault (never vault through building windows!)
    if (actualSpeed > 0.15) {
      const nextX = bot.pos.x + bot.velX * dt;
      const nextZ = bot.pos.z + bot.velZ * dt;

      const entersBuilding =
        this.world.isInsideBuildingOrContainer &&
        this.world.isInsideBuildingOrContainer(nextX, nextZ, 1.35);
      const gWaist = this.world.worldToGrid(nextX, bot.pos.y + 0.8, nextZ);
      const gHead = this.world.worldToGrid(nextX, bot.pos.y + 1.9, nextZ);
      const gAbove = this.world.worldToGrid(nextX, bot.pos.y + 2.9, nextZ);
      const blockedLow = this.world.voxels.get(this.world.key(gWaist.gx, gWaist.gy, gWaist.gz));
      const blockedHigh = this.world.voxels.get(this.world.key(gHead.gx, gHead.gy, gHead.gz));
      const blockedAbove = this.world.voxels.get(this.world.key(gAbove.gx, gAbove.gy, gAbove.gz));

      if (!blockedLow && !blockedHigh && !entersBuilding) {
        bot.pos.x = nextX;
        bot.pos.z = nextZ;
      } else if (
        !entersBuilding &&
        blockedLow &&
        !blockedLow.isFortification &&
        blockedLow.type !== 'sandbag' &&
        blockedLow.type !== 'darkConcrete' &&
        !blockedHigh &&
        !blockedAbove &&
        bot.isGrounded &&
        (bot.stuckCount || 0) >= 1
      ) {
        // Never auto-jump onto Chest Walls or sandbag/HESCO breastworks; only vault non-fortification blocks if stuck
        bot.velY = BOT.VAULT_JUMP_SPEED;
        bot.isGrounded = false;
        bot.pos.x = nextX;
        bot.pos.z = nextZ;
      } else {
        // Slide tangentially along the wall instead of getting wedged
        const slideX = bot.pos.x + bot.velX * dt;
        const slideZ = bot.pos.z + bot.velZ * dt;
        if (!this.isPointBlocked(slideX, bot.pos.y, bot.pos.z)) {
          bot.pos.x = slideX;
        } else if (!this.isPointBlocked(bot.pos.x, bot.pos.y, slideZ)) {
          bot.pos.z = slideZ;
        } else {
          bot.velX *= -0.25;
          bot.velZ *= -0.25;
          bot.strafeDir = -bot.strafeDir;
          bot.avoidanceSign = -(bot.avoidanceSign || 1);
          bot.avoidanceTimer = 1.2;
        }
      }
    }

    // Anti-Stuck Progress Watchdog: ensures ZERO bots remain trapped behind walls or inside geometry
    if (!bot.lastProgressPos) {
      bot.lastProgressPos = bot.pos.clone();
    }
    if (desiredSpeed > 1.8 && !bot.rescueTarget && (bot.postReviveTimer || 0) <= 0) {
      bot.stuckTimer = (bot.stuckTimer || 0) + dt;
      if (bot.stuckTimer >= 0.7) {
        const movedDist = Math.hypot(
          bot.pos.x - bot.lastProgressPos.x,
          bot.pos.z - bot.lastProgressPos.z
        );
        bot.lastProgressPos.copy(bot.pos);
        bot.stuckTimer = 0;

        if (movedDist < 0.85) {
          bot.stuckCount = (bot.stuckCount || 0) + 1;
          bot.avoidanceSign = -(bot.avoidanceSign || 1);
          bot.avoidanceTimer = 1.6;
          if (bot.stuckCount >= 2) {
            // Relocate cleanly to the nearest open coordinate in the desired direction
            const stepOutX = bot.pos.x + desiredDir.x * 5.0 + (Math.random() - 0.5) * 3.0;
            const stepOutZ = bot.pos.z + desiredDir.z * 5.0 + (Math.random() - 0.5) * 3.0;
            const safePos = this.world.findSafeSpawnPoint(stepOutX, stepOutZ);
            bot.pos.copy(safePos);
            bot.velX = 0;
            bot.velZ = 0;
            bot.stuckCount = 0;
          }
        } else {
          bot.stuckCount = 0;
        }
      }
    } else {
      bot.stuckTimer = 0;
      bot.stuckCount = 0;
      bot.lastProgressPos.copy(bot.pos);
    }

    // Vertical Gravity & 3D Terrain Following
    bot.velY -= BOT.GRAVITY * dt;
    bot.pos.y += bot.velY * dt;
    const groundY = this.world.getGroundHeightAt(bot.pos.x, bot.pos.z);
    if (bot.pos.y <= groundY) {
      bot.pos.y = groundY;
      bot.velY = 0;
      bot.isGrounded = true;
    }

    // =======================================================================
    // AIM TRACKING, REALISTIC TURN-RATE CAP, WEAPON RAISE & GAIT ANIMATION
    // =======================================================================
    const isSprintingOut = !inCombat && actualSpeed > 5.8;
    const isGettingUp = (bot.postReviveTimer || 0) > 0;
    const isEquippingWeapon = (bot.weaponReadyTimer || 0) > 0;

    // Update Weapon Raise Progress (0.0 = slung/stowed, 0.25 = patrol low-ready, 0.72 = entrenched overwatch, 1.0 = shouldered ADS)
    if (isGettingUp || isEquippingWeapon || isSprintingOut) {
      bot.aimRaiseProgress = Math.max(0, (bot.aimRaiseProgress || 0) - dt * 2.8);
    } else if (!seekingVehicle && nearestEnemy) {
      // Entrenched Forward Base defenders raise their sights 35% faster from rested cover!
      const raiseRate = bot.inFriendlyForwardBase ? BOT.AIM_RAISE_RATE * 1.35 : BOT.AIM_RAISE_RATE;
      bot.aimRaiseProgress = Math.min(1.0, (bot.aimRaiseProgress || 0) + dt * raiseRate);
    } else {
      // Settle at pre-shouldered overwatch (0.72) when defending a Forward Base, or low-ready (0.25) on patrol
      const targetLowReady = bot.inFriendlyForwardBase || bot.isGarrisonDefender ? 0.72 : 0.25;
      bot.aimRaiseProgress +=
        (targetLowReady - (bot.aimRaiseProgress || 0)) * Math.min(1, dt * 3.5);
    }

    // Update diagnostic transition state
    if (isGettingUp) {
      bot.transitionState = 'GETTING_UP';
    } else if (isEquippingWeapon) {
      bot.transitionState = 'EQUIPPING_WEAPON';
    } else if (!seekingVehicle && nearestEnemy && bot.aimRaiseProgress < BOT.AIM_FIRE_GATE) {
      bot.transitionState = 'RAISING_AIM';
    } else {
      bot.transitionState = 'ACTIVE';
    }

    if (!seekingVehicle && nearestEnemy) {
      const dx = nearestEnemy.pos.x - bot.pos.x;
      const dy = nearestEnemy.pos.y - bot.pos.y;
      const dz = nearestEnemy.pos.z - bot.pos.z;
      const horizDist = Math.max(1, Math.hypot(dx, dz));
      const desiredYaw = Math.atan2(dx, dz);
      let diff = desiredYaw - bot.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;

      // Realistic Angular Turn Velocity Cap (rad/s) — prevents instant 180-degree snap turns!
      // Entrenched Forward Base defenders have +30% faster sector tracking from prepared positions!
      const baseTurnRate =
        (bot.postReviveTimer || 0) > 1.0
          ? BOT.TURN_RATE_POST_REVIVE
          : isGettingUp || isEquippingWeapon
            ? BOT.TURN_RATE_GETTING_UP
            : BOT.TURN_RATE_NORMAL;
      const maxTurnRate = bot.inFriendlyForwardBase ? baseTurnRate * 1.3 : baseTurnRate;
      const maxTurnStep = maxTurnRate * dt;
      bot.yaw += THREE.MathUtils.clamp(diff, -maxTurnStep, maxTurnStep);

      const remainingDiff = Math.abs(diff) - Math.min(Math.abs(diff), maxTurnStep);
      const targetPitch = THREE.MathUtils.clamp(-Math.atan2(dy, horizDist), -0.55, 0.55);
      bot.aimPitch += (targetPitch - bot.aimPitch) * Math.min(1, dt * 6.5);

      // Strict Firing Gate: Soldier CANNOT open fire until they have finished getting up,
      // finished stowing medkit/unslinging weapon, raised their sights to shoulder (>= 0.85),
      // and physically rotated their body/barrel within ~15 degrees (0.26 rad) of the target!
      const canFireWeapon =
        !isGettingUp &&
        !isEquippingWeapon &&
        bot.aimRaiseProgress >= BOT.AIM_FIRE_GATE &&
        remainingDiff < BOT.AIM_OFF_TARGET_THRESHOLD;

      const isModernEra = (this.world?.era || 'modern') === 'modern';
      if (nearestEnemy.isVehicle && bot.role === 'ENGINEER' && isModernEra) {
        if (canFireWeapon && bot.rpgCooldown <= 0 && horizDist > 10) {
          bot.rpgCooldown = BOT.RPG_COOLDOWN_BASE + Math.random() * BOT.RPG_COOLDOWN_RAND;
          this.botFireRpgAt(bot, nearestEnemy.unit, player);
        }
      } else {
        bot.shootCooldown -= dt;
        if (canFireWeapon && bot.shootCooldown <= 0) {
          bot.burstCount++;
          if (!isModernEra) {
            // Medieval & Jurassic Era: Single-shot bow draw, crossbow windlass, or melee swing cadence (NEVER 4-round automatic bursts!)
            bot.shootCooldown =
              bot.role === 'CROSSBOWMAN'
                ? 2.2 + Math.random() * 0.8
                : bot.role === 'ARCHER' || bot.role === 'MOUNTED_KNIGHT'
                ? 1.45 + Math.random() * 0.65
                : 1.15 + Math.random() * 0.55;
          } else {
            bot.shootCooldown =
              bot.burstCount % 4 === 0
                ? BOT.BURST_PAUSE_BASE + Math.random() * BOT.BURST_PAUSE_RAND
                : BOT.BURST_SHOT_INTERVAL;
          }
          this.botFireAt(bot, nearestEnemy, player, onKillFn, vehicleManager);
        }
      }
    } else {
      bot.aimPitch *= 0.9;
      if (actualSpeed > 0.25) {
        const desiredYaw = Math.atan2(bot.velX, bot.velZ);
        let diff = desiredYaw - bot.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const maxMoveTurn = (isGettingUp || isEquippingWeapon ? 2.0 : 2.8) * dt;
        bot.yaw += THREE.MathUtils.clamp(diff, -maxMoveTurn, maxMoveTurn);
      }
    }

    bot.mesh.rotation.y = bot.yaw;

    // Compute lower-body orientation relative to upper-body aim so legs walk naturally
    // in the direction of velocity (no sideways moonwalking!)
    let legTwist = 0;
    let walkDirSign = 1;
    if (actualSpeed > 0.25) {
      const velAngle = Math.atan2(bot.velX, bot.velZ);
      let relAngle = velAngle - bot.yaw;
      while (relAngle > Math.PI) relAngle -= Math.PI * 2;
      while (relAngle < -Math.PI) relAngle += Math.PI * 2;
      if (Math.abs(relAngle) > Math.PI * 0.62) {
        walkDirSign = -1;
        relAngle += relAngle > 0 ? -Math.PI : Math.PI;
      }
      legTwist = THREE.MathUtils.clamp(relAngle, -0.85, 0.85);
    }
    parts.pelvisGroup.rotation.y = THREE.MathUtils.lerp(
      parts.pelvisGroup.rotation.y,
      legTwist,
      Math.min(1, dt * 12)
    );

    // Smooth Crouch & Lean interpolation
    const targetCrouch = bot.isCrouching ? 1 : 0;
    bot.crouchAmount += (targetCrouch - bot.crouchAmount) * Math.min(1, dt * 11);

    const targetLean = bot.leanDir;
    bot.leanAmount += (targetLean - bot.leanAmount) * Math.min(1, dt * 10);

    // Decay firing recoil & hit flinch; toggle muzzleFlash visibility instead of mutating shared material opacity
    bot.recoilKick *= Math.pow(0.01, dt);
    if (bot.flinchTimer > 0) bot.flinchTimer = Math.max(0, bot.flinchTimer - dt);
    if (bot.muzzleFlashTimer > 0) {
      bot.muzzleFlashTimer -= dt;
      if (parts.muzzleFlash) {
        parts.muzzleFlash.visible = true;
        if (parts.muzzleFlash.material && parts.muzzleFlash.material.opacity < 0.85) {
          parts.muzzleFlash.material.opacity = 0.9;
        }
        parts.muzzleFlash.rotation.z = Math.random() * Math.PI;
      }
    } else if (parts.muzzleFlash && parts.muzzleFlash.visible) {
      parts.muzzleFlash.visible = false;
    }

    // Distance-based Animation LOD (3D visibility & frustum flag already synced at top of loop for all states):
    // Scales smoothly with optical zoom (`opticZoomMag`) and aircraft altitude so zoomed AC-130 / Sniper views
    // render full running, kneeling, and dragging limb animations up to 2,600m!
    if (!within3DRender || offFrustum) {
      continue;
    }
    if (distSqCam > fullGaitDistSq) {
      continue;
    }
    if (distSqCam > halfRateGaitDistSq && ((bIdx + (this._frameRaycasts || 0)) & 1) === 1) {
      continue;
    }

    // Multi-Joint Gait Cycle (Hips + Knees + Pelvis Bounce + Torso Counter-Twist)
    let bounceY = 0;
    if (actualSpeed > 0.2 && bot.isGrounded) {
      bot.animPhase += dt * actualSpeed * 1.85 * walkDirSign;
      const isSprinting = !inCombat && actualSpeed > 5.8;
      const hipAmp = isSprinting ? 0.82 : 0.56;
      const kneeAmp = isSprinting ? 1.05 : 0.72;

      const leftHip = Math.sin(bot.animPhase) * hipAmp;
      const rightHip = Math.sin(bot.animPhase + Math.PI) * hipAmp;

      // Knees flex backward naturally during the leg's recovery lift phase
      const leftKnee = Math.max(0, -Math.cos(bot.animPhase) * kneeAmp) + 0.08;
      const rightKnee = Math.max(0, -Math.cos(bot.animPhase + Math.PI) * kneeAmp) + 0.08;

      parts.leftLeg.rotation.x = leftHip - bot.crouchAmount * 0.45;
      parts.rightLeg.rotation.x = rightHip - bot.crouchAmount * 0.45;
      parts.leftShin.rotation.x = leftKnee + bot.crouchAmount * 0.85;
      parts.rightShin.rotation.x = rightKnee + bot.crouchAmount * 0.85;

      // Vertical pelvis bounce (2x per full stride) + subtle lateral hip sway
      bounceY = Math.abs(Math.sin(bot.animPhase)) * (isSprinting ? 0.068 : 0.042);
      parts.pelvisGroup.rotation.z = Math.cos(bot.animPhase) * 0.045;
    } else if (!bot.isGrounded) {
      // Mid-air vault / jump tuck pose
      parts.leftLeg.rotation.x = -0.55;
      parts.rightLeg.rotation.x = -0.25;
      parts.leftShin.rotation.x = 0.95;
      parts.rightShin.rotation.x = 0.65;
      parts.pelvisGroup.rotation.z = 0;
    } else {
      // Standing or Crouched Kneeling Stance + subtle breathing idle
      const idleBreath = Math.sin(performance.now() * 0.003 + bIdx) * 0.015;
      parts.leftLeg.rotation.x = THREE.MathUtils.lerp(
        parts.leftLeg.rotation.x,
        -bot.crouchAmount * 0.75,
        Math.min(1, dt * 10)
      );
      parts.rightLeg.rotation.x = THREE.MathUtils.lerp(
        parts.rightLeg.rotation.x,
        -bot.crouchAmount * 0.35,
        Math.min(1, dt * 10)
      );
      parts.leftShin.rotation.x = THREE.MathUtils.lerp(
        parts.leftShin.rotation.x,
        bot.crouchAmount * 1.25,
        Math.min(1, dt * 10)
      );
      parts.rightShin.rotation.x = THREE.MathUtils.lerp(
        parts.rightShin.rotation.x,
        bot.crouchAmount * 0.85,
        Math.min(1, dt * 10)
      );
      parts.pelvisGroup.rotation.z = 0;
      bounceY = idleBreath;
    }

    const hipY = 0.78 - bot.crouchAmount * 0.26 + bounceY;
    parts.pelvisGroup.position.y = hipY;
    parts.upperBody.position.y = hipY;

    // Upper body forward sprint lean, post-revive / weapon-equip torso lean, combat crouch pitch, hit flinch, and Q/E peek tilt
    const flinchPitch = bot.flinchTimer > 0 ? -0.32 : 0;
    const transitionLean = isGettingUp
      ? 0.44 * (1 - (bot.standUpProgress || 0) * 0.5)
      : isEquippingWeapon
        ? 0.32 * Math.min(1, bot.weaponReadyTimer)
        : 0;
    parts.upperBody.rotation.x =
      (isSprintingOut
        ? 0.26
        : bot.crouchAmount * 0.16 + transitionLean + bot.aimPitch * 0.35 * (bot.aimRaiseProgress || 0)) +
      flinchPitch;
    parts.upperBody.rotation.y = isSprintingOut ? Math.sin(bot.animPhase) * 0.1 : 0;
    parts.upperBody.rotation.z = -bot.leanAmount * 0.24;

    // Head tracks target pitch & tilts into rifle stock when weapon is raised in combat
    parts.headGroup.rotation.x = isSprintingOut
      ? -0.18
      : isGettingUp || isEquippingWeapon
        ? 0.22
        : bot.aimPitch * 0.65;
    parts.headGroup.rotation.y = isSprintingOut ? -Math.sin(bot.animPhase) * 0.08 : 0;
    parts.headGroup.rotation.z = inCombat && (bot.aimRaiseProgress || 0) > 0.7 ? 0.08 : 0;

    // Weapon Rig Pose:
    // 1) Sprinting: Diagonal tactical chest carry
    // 2) Getting Up / Stowing Medkit / Unslinging Weapon: Lowered across chest, gradually rotating into hands
    // 3) Low-Ready -> Shouldered Sight Alignment: Smoothly interpolated by `bot.aimRaiseProgress` (0.0 -> 1.0)
    if (bot.mesh.userData?.slungSwordHiltGroup) {
      const isSwordSlung3p = Boolean(
        bot.role === 'MOUNTED_KNIGHT' || (bot.role === 'SWORDSMAN' && isSprintingOut)
      );
      bot.mesh.userData.slungSwordHiltGroup.visible = isSwordSlung3p;
      const blade3p = parts.gunGroup?.getObjectByName?.('thirdPersonSwordBlade');
      const guard3p = parts.gunGroup?.getObjectByName?.('thirdPersonCrossGuard');
      if (blade3p) blade3p.visible = !isSwordSlung3p;
      if (guard3p) guard3p.visible = !isSwordSlung3p;
    }

    if (isSprintingOut) {
      parts.weaponRig.position.set(
        0,
        0.46 + Math.abs(Math.cos(bot.animPhase)) * 0.03,
        0
      );
      parts.weaponRig.rotation.set(
        -0.28 + Math.sin(bot.animPhase) * 0.08,
        0.52 + Math.cos(bot.animPhase) * 0.1,
        0.18
      );
    } else if (isGettingUp || isEquippingWeapon) {
      const equipRatio = isGettingUp
        ? 1.0
        : THREE.MathUtils.clamp((bot.weaponReadyTimer || 0) / 1.45, 0, 1);
      parts.weaponRig.position.set(
        0,
        THREE.MathUtils.lerp(0.44, 0.36, equipRatio),
        0
      );
      parts.weaponRig.rotation.set(
        THREE.MathUtils.lerp(0.36, 0.72, equipRatio),
        THREE.MathUtils.lerp(0.28, 0.52, equipRatio),
        THREE.MathUtils.lerp(0.1, 0.24, equipRatio)
      );
    } else {
      const raise = THREE.MathUtils.clamp(bot.aimRaiseProgress || 0, 0, 1);
      parts.weaponRig.position.set(
        0,
        THREE.MathUtils.lerp(0.43, 0.48, raise),
        -bot.recoilKick
      );
      parts.weaponRig.rotation.set(
        THREE.MathUtils.lerp(0.34, bot.aimPitch * 0.65 - bot.recoilKick * 1.4, raise),
        THREE.MathUtils.lerp(0.26, 0, raise),
        THREE.MathUtils.lerp(0.08, 0, raise)
      );
    }
  }
}

/**
 * Computes the exact world-space 3D coordinate of the bot's weapon barrel tip (`parts.muzzleFlash`
 * or `parts.rpgShoulderGroup`), so bullet trails and rockets leave from the gun muzzle rather than
 * the center of the soldier's body.
 */
export function getBotMuzzleWorldPosition(bot) {
  // Fast analytic muzzle offset for bots >35m away or not currently rendered (avoids 25-node updateMatrixWorld traversal!)
  if (
    bot &&
    bot.mesh &&
    bot.mesh.visible &&
    !bot.mesh._culledOffFrustum &&
    bot.mesh.userData &&
    bot.mesh.userData.parts &&
    (!this.player || bot.pos.distanceToSquared(this.player.pos) <= 35 * 35)
  ) {
    const parts = bot.mesh.userData.parts;
    if (parts.rpgShoulderGroup && bot.usingRpg) {
      bot.mesh.updateMatrixWorld(true);
      const worldRpg = new THREE.Vector3(0, 0.04, 0.72);
      parts.rpgShoulderGroup.localToWorld(worldRpg);
      if (Number.isFinite(worldRpg.x) && worldRpg.distanceToSquared(bot.pos) < 9.0) {
        return worldRpg;
      }
    }
    if (parts.muzzleFlash) {
      bot.mesh.updateMatrixWorld(true);
      const worldMuzzle = new THREE.Vector3();
      parts.muzzleFlash.getWorldPosition(worldMuzzle);
      if (Number.isFinite(worldMuzzle.x) && worldMuzzle.distanceToSquared(bot.pos) < 9.0) {
        return worldMuzzle;
      }
    }
  }
  // Right-hand shoulder/barrel offset fallback (never center of chest!)
  const yaw = bot ? bot.yaw || 0 : 0;
  const fwdX = Math.sin(yaw);
  const fwdZ = Math.cos(yaw);
  const rightX = -Math.cos(yaw);
  const rightZ = Math.sin(yaw);
  const height = bot && bot.isCrouching ? 1.08 : 1.38;
  return new THREE.Vector3(
    bot.pos.x + rightX * 0.22 + fwdX * 0.78,
    bot.pos.y + height,
    bot.pos.z + rightZ * 0.22 + fwdZ * 0.78
  );
}

export function botFireRpgAt(bot, targetVehicle, player) {
  if (!targetVehicle.isAircraft) {
    const now = performance.now();
    const losKey = `veh_${targetVehicle.id}`;
    const cached = bot._losCache ? bot._losCache.get(losKey) : null;
    if (!(cached && !cached.blocked && now - cached.time <= 180)) {
      const vis = this.hasClearSightline(bot, targetVehicle.pos, false);
      if (!bot._losCache) bot._losCache = new Map();
      if (cached) {
        cached.blocked = !vis;
        cached.vis = vis;
        cached.time = now;
        cached.exp = now + 260;
      } else {
        bot._losCache.set(losKey, { blocked: !vis, vis, time: now, exp: now + 260 });
      }
      if (!vis) return;
    }
  }
  bot.recoilKick = 0.18;
  bot.muzzleFlashTimer = 0.08;

  const start = this.getBotMuzzleWorldPosition(bot);
  const targetCenter = tmpVec3(
    targetVehicle.pos.x,
    targetVehicle.pos.y + 1.35,
    targetVehicle.pos.z
  );

  // If targeting an enemy aircraft, fire a FIM-92 Stinger / 9K38 Igla Homing Surface-to-Air Missile!
  if (targetVehicle.isAircraft) {
    bot.rpgCooldown = 18.0 + Math.random() * 6.0;
    const dir = new THREE.Vector3().subVectors(targetCenter, start).normalize();
    const samMesh = new THREE.Mesh(SHARED_BOT_SAM_GEO, SHARED_BOT_SAM_MAT);
    samMesh.position.copy(start).addScaledVector(dir, 0.75);
    samMesh.lookAt(targetCenter);
    this.scene.add(samMesh);
    this.world.projectiles.push({
      type: 'a2a_missile',
      mesh: samMesh,
      vel: dir.multiplyScalar(235),
      gravity: 0,
      life: 6.0,
      turnRate: 3.8,
      targetVehicle,
      blastRadius: 9.5,
      blastDamage: targetVehicle.driver ? (targetVehicle.aircraftRole === 'gunship' ? 95 : 115) : 280,
      weaponName: bot.team === 'RU' ? '9K38 IGLA AA SAM' : 'FIM-92 STINGER AA SAM',
      owner: bot
    });
    return;
  }

  const dist = start.distanceTo(targetCenter);
  const rocketSpeed = 66;
  const flightTime = dist / rocketSpeed;

  // Lead moving vehicle & compensate for rocket gravity (3.8 m/s^2)
  const vFwd = tmpVec3(
    -Math.sin(targetVehicle.yaw) * (targetVehicle.forwardSpeed || 0),
    0,
    -Math.cos(targetVehicle.yaw) * (targetVehicle.forwardSpeed || 0)
  );
  const aimPoint = tmpVec3Copy(targetCenter)
    .addScaledVector(vFwd, flightTime * 0.75)
    .add(tmpVec3(0, 0.5 * 3.8 * flightTime * flightTime, 0));

  const dir = new THREE.Vector3().subVectors(aimPoint, start).normalize();
  dir.x += (Math.random() - 0.5) * 0.035;
  dir.y += (Math.random() - 0.5) * 0.025;
  dir.z += (Math.random() - 0.5) * 0.035;
  dir.normalize();

  const distFromPlayer = bot.pos.distanceTo(player.pos);
  if (distFromPlayer < 180) {
    const dx = bot.pos.x - player.pos.x;
    const dz = bot.pos.z - player.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    const pan = (dx * Math.cos(player.yaw || 0) + dz * -Math.sin(player.yaw || 0)) / len;
    sound.playRocketLaunch(distFromPlayer, pan);
  }

  // Backblast smoke behind the Engineer
  this.world.spawnDebris(
    tmpVec3Copy(start).addScaledVector(dir, -0.8),
    BACKBLAST_COLOR,
    3
  );

  const rocketMesh = new THREE.Mesh(SHARED_BOT_RPG_GEO, SHARED_BOT_RPG_MAT);
  rocketMesh.position.copy(start).addScaledVector(dir, 0.65);
  rocketMesh.lookAt(tmpVec3Copy(start).addScaledVector(dir, 10));
  this.scene.add(rocketMesh);

  this.world.projectiles.push({
    type: 'rpg',
    mesh: rocketMesh,
    vel: dir.multiplyScalar(rocketSpeed),
    gravity: 3.8,
    life: 4.5,
    owner: bot
  });
}

export function botFireAt(bot, target, player, onKillFn, vehicleManager = null) {
  // Reuse cached LOS if verified clear within the last 0.18s (`180ms`) to avoid duplicate firing raycasts!
  const now = performance.now();
  const losKey = target.isVehicle
    ? target.unit === player?.activeVehicle
      ? 'PLAYER_VEH'
      : `veh_${target.unit?.id || ''}`
    : target.isPlayer
    ? 'PLAYER'
    : target.unit?.id || null;
  const cachedLos = losKey && bot._losCache ? bot._losCache.get(losKey) : null;
  if (!(cachedLos && !cachedLos.blocked && now - cachedLos.time <= 180)) {
    const vis = this.hasClearSightline(bot, target.pos, false);
    if (losKey) {
      if (!bot._losCache) bot._losCache = new Map();
      if (cachedLos) {
        cachedLos.blocked = !vis;
        cachedLos.vis = vis;
        cachedLos.time = now;
        cachedLos.exp = now + 260;
      } else {
        bot._losCache.set(losKey, { blocked: !vis, vis, time: now, exp: now + 260 });
      }
    }
    if (!vis) return;
  }

  bot.recoilKick = 0.085;
  bot.muzzleFlashTimer = 0.045;
  bot.shotsFired = (bot.shotsFired || 0) + 1;
  // Mark target (and any nearby rescuer within 5.5m) as actively under enemy fire so bots cannot revive while being shot at!
  if (!target.isPlayer && target.unit) {
    target.unit.underFireTimer = 2.2;
    if (!target.unit.lastShooterPos) target.unit.lastShooterPos = new THREE.Vector3();
    target.unit.lastShooterPos.copy(bot.pos);
    if (target.unit.rescuer) {
      target.unit.rescuer.underFireTimer = 2.2;
      if (!target.unit.rescuer.lastShooterPos) {
        target.unit.rescuer.lastShooterPos = new THREE.Vector3();
      }
      target.unit.rescuer.lastShooterPos.copy(bot.pos);
    }
  }
  // NATO 5:1 Ball-to-Tracer belt ratio: 1 Tracer round followed by 5 Regular Ball rounds (1 in 6 shots)
  const isTracerRound = bot.shotsFired % 6 === 1;

  // Origin is the actual 3D gun barrel muzzle tip (not center of body!)
  const start = this.getBotMuzzleWorldPosition(bot);
  const targetEye = tmpVec3(target.pos.x, target.pos.y + 1.2, target.pos.z);
  const dir = tmpVec3Copy(targetEye).sub(start).normalize();

  // Suppression degrades NPC accuracy (wider aim cone when suppressed);
  // Entrenched Forward Base defenders resting their rifle on sandbags/parapets get -35% tighter spread!
  const defenderSpreadMult = bot.inFriendlyForwardBase ? 0.65 : 1.0;
  const suppressionMult = (1 + (bot.suppressionLevel || 0) * 3.0) * defenderSpreadMult;
  dir.x += (Math.random() - 0.5) * 0.075 * suppressionMult;
  dir.y += (Math.random() - 0.5) * 0.055 * suppressionMult;
  dir.z += (Math.random() - 0.5) * 0.075 * suppressionMult;
  dir.normalize();

  const distToTarget = start.distanceTo(targetEye);
  const isPrimitiveBot =
    this.world?.era === 'medieval' ||
    this.world?.era === 'jurassic' ||
    bot.role === 'MOUNTED_KNIGHT' ||
    bot.role === 'SWORDSMAN' ||
    bot.role === 'GREATSWORD_KNIGHT' ||
    bot.role === 'POLEARM_KNIGHT' ||
    bot.role === 'ARCHER' ||
    bot.role === 'CROSSBOWMAN' ||
    Boolean(bot.isDinosaur);

  if (isPrimitiveBot) {
    bot.muzzleFlashTimer = 0;
  }

  // Non-spitting Dinosaurs (Velociraptor, Triceratops, T-Rex) and 2H/Polearm Knights are pure melee fighters!
  if (
    (bot.role === 'RAPTOR' || bot.role === 'TRICERATOPS' || bot.role === 'TREX') &&
    distToTarget > 6.8
  ) {
    return;
  }
  if (bot.role === 'DILOPHOSAURUS' && distToTarget > 28) {
    return;
  }
  if ((bot.role === 'GREATSWORD_KNIGHT' || bot.role === 'POLEARM_KNIGHT') && distToTarget > 7.5) {
    return;
  }
  if (bot.role === 'SWORDSMAN' && distToTarget > 38) {
    return;
  }

  const distFromPlayer = bot.pos.distanceTo(player.pos);
  let pan = 0;
  if (distFromPlayer < 190) {
    const dx = bot.pos.x - player.pos.x;
    const dz = bot.pos.z - player.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    pan = (dx * Math.cos(player.yaw || 0) + dz * -Math.sin(player.yaw || 0)) / len;
    if (isPrimitiveBot) {
      // Authentic Medieval / Jurassic acoustic profile: Bow twang, Crossbow snap, or Blade/Claw air-whoosh (ZERO gunshots!)
      if (bot.role === 'CROSSBOWMAN') {
        sound.playBowTwang?.(distFromPlayer, pan, true);
      } else if (bot.role === 'ARCHER' || bot.role === 'MOUNTED_KNIGHT') {
        sound.playBowTwang?.(distFromPlayer, pan, false);
      } else {
        sound.playMeleeSwing?.(distFromPlayer, pan, bot.role === 'GREATSWORD_KNIGHT' || bot.role === 'TREX');
      }
    } else {
      const botSoundType =
        bot.role === 'SUPPORT'
          ? 'lmg'
          : bot.role === 'RECON'
          ? 'sniper'
          : bot.role === 'MEDIC'
          ? 'smg'
          : 'rifle';
      sound.playGunshot(botSoundType, distFromPlayer, pan);
    }
  }

  // Supersonic Bullet Snap & Doppler Whiz when enemy rounds pass near the player (modern era only!)
  if (
    !isPrimitiveBot &&
    bot.team !== player.team &&
    !player.dead &&
    (target.isPlayer || distFromPlayer < 26) &&
    typeof sound.playBulletWhiz === 'function'
  ) {
    sound.playBulletWhiz(Math.min(distFromPlayer, 22), pan);
  }

  const bulletSpeed =
    bot.role === 'MOUNTED_KNIGHT' || (isPrimitiveBot && !bot.isDinosaur && bot.role !== 'SWORDSMAN')
      ? 165
      : bot.role === 'SWORDSMAN'
      ? 105
      : bot.isDinosaur
      ? 135
      : bot.role === 'RECON'
      ? 860
      : bot.role === 'SUPPORT'
      ? 850
      : bot.role === 'MEDIC'
      ? 350
      : 760;
  const weaponName =
    bot.role === 'MOUNTED_KNIGHT'
      ? this.world?.era === 'jurassic'
        ? 'HUNTING YEW LONGBOW'
        : 'MOUNTED YEW LONGBOW'
      : bot.role === 'CROSSBOWMAN'
      ? 'HEAVY SIEGE CROSSBOW'
      : bot.role === 'ARCHER'
      ? 'ROYAL YEW LONGBOW'
      : bot.role === 'POLEARM_KNIGHT'
      ? 'KNIGHT POLEARM SPEAR'
      : bot.role === 'GREATSWORD_KNIGHT'
      ? '2H GREATSWORD'
      : bot.role === 'SWORDSMAN'
      ? distToTarget <= 5.5
        ? this.world?.era === 'jurassic'
          ? 'HUNTING SPEAR & BLADE'
          : 'TEMPLAR BROADSWORD'
        : this.world?.era === 'jurassic'
        ? 'THROWING SPEAR'
        : 'THROWING DAGGER'
      : bot.role === 'TREX'
      ? 'T-REX APEX JAW CRUSH'
      : bot.role === 'TRICERATOPS'
      ? 'TRICERATOPS HORN GORE'
      : bot.role === 'DILOPHOSAURUS'
      ? 'DILOPHOSAURUS VENOM SPIT'
      : bot.role === 'RAPTOR'
      ? 'VELOCIRAPTOR TALONS'
      : isPrimitiveBot
      ? 'HUNTING YEW LONGBOW'
      : bot.team === 'US'
      ? bot.role === 'RECON'
        ? 'MK14 EBR'
        : bot.role === 'SUPPORT'
        ? 'M249 SAW'
        : bot.role === 'MEDIC'
        ? 'VECTOR .45'
        : 'M4A1'
      : bot.role === 'RECON'
      ? 'SV-98M'
      : bot.role === 'SUPPORT'
      ? 'PKP LMG'
      : 'AK-15';

  if (!Array.isArray(this.botBullets)) {
    this.botBullets = [];
  }

  const voxelHit = this.world.raycastVoxel(start, dir, distToTarget, 0.1);
  const hitWall = Boolean(voxelHit && (voxelHit.voxel || voxelHit.isGround));
  const maxDist = hitWall ? Math.max(0.5, voxelHit.distance) : Math.max(0.5, distToTarget);
  const endPoint = hitWall
    ? voxelHit.point.clone()
    : tmpVec3Copy(start).addScaledVector(dir, distToTarget);

  const baseHitChance = Math.max(0.1, 0.42 - distToTarget / 170);
  const defenderAccBonus = bot.inFriendlyForwardBase ? 1.28 : 1.0;
  const hitChance = Math.min(
    0.68,
    baseHitChance * defenderAccBonus * (1 - (bot.suppressionLevel || 0) * 0.5)
  );
  const willHit = !hitWall && Math.random() < hitChance;

  const isMeleeStrikeOnly =
    bot.role === 'RAPTOR' ||
    bot.role === 'TRICERATOPS' ||
    bot.role === 'TREX' ||
    bot.role === 'GREATSWORD_KNIGHT' ||
    bot.role === 'POLEARM_KNIGHT' ||
    (bot.role === 'SWORDSMAN' && distToTarget <= 5.5);
  const showBotProjTrail =
    !isMeleeStrikeOnly &&
    (isTracerRound ||
      bot.role === 'ARCHER' ||
      bot.role === 'CROSSBOWMAN' ||
      bot.role === 'MOUNTED_KNIGHT' ||
      bot.role === 'DILOPHOSAURUS');

  let tracerLine = null;
  if (showBotProjTrail && this.botBullets.length < 90) {
    const tColor =
      bot.role === 'DILOPHOSAURUS'
        ? 0x2ecc71
        : isPrimitiveBot
        ? 0xf5d76e
        : bot.team === 'US'
        ? 0x74b9ff
        : 0xff7675;
    tracerLine = acquireTracerLine(
      this,
      start.x,
      start.y,
      start.z,
      start.x + dir.x * 0.4,
      start.y + dir.y * 0.4,
      start.z + dir.z * 0.4,
      tColor,
      0.88
    );
  }

  let bullet = this._bulletPool && this._bulletPool.length > 0 ? this._bulletPool.pop() : null;
  if (bullet) {
    bullet.bot = bot;
    bullet.target.isPlayer = Boolean(target.isPlayer);
    bullet.target.isVehicle = Boolean(target.isVehicle);
    bullet.target.unit = target.unit;
    bullet.pos.copy(start);
    bullet.dir.copy(dir);
    bullet.endPoint.copy(endPoint);
    bullet.speed = bulletSpeed;
    bullet.traveled = 0;
    bullet.maxDist = maxDist;
    bullet.voxelHit = hitWall ? voxelHit : null;
    bullet.willHit = willHit;
    bullet.weaponName = weaponName;
    bullet.tracerLine = tracerLine;
    this.botBullets.push(bullet);
  } else {
    this.botBullets.push({
      bot,
      target: {
        isPlayer: Boolean(target.isPlayer),
        isVehicle: Boolean(target.isVehicle),
        unit: target.unit
      },
      pos: start.clone(),
      dir: dir.clone(),
      endPoint: endPoint.clone(),
      speed: bulletSpeed,
      traveled: 0,
      maxDist,
      voxelHit: hitWall ? voxelHit : null,
      willHit,
      weaponName,
      tracerLine
    });
  }
}

export const BotAIMethods = {
  spawnTracer,
  update,
  getBotMuzzleWorldPosition,
  botFireRpgAt,
  botFireAt
};
