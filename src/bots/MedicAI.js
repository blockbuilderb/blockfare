import * as THREE from '../../vendor/three.module.js';
import { BOT } from '../config.js?v=118';
import { tmpVec3 } from '../utils/VectorPool.js?v=118';
import { events } from '../events.js?v=118';
import {
  MEDIC_RESCUE_EVENTS,
  createMedicRescueFSM
} from '../core/StateMachines.js?v=118';

const REVIVE_PARTICLE_COLOR = new THREE.Color(0x2ecc71);
const SHARED_SMOKE_PUFF_GEO = new THREE.BoxGeometry(1.5, 1.3, 1.5);
SHARED_SMOKE_PUFF_GEO.userData.shared = true;

function setRescueThreatObj(bot, isPlayer, isVehicle, pos, unit, distSq) {
  let obj = bot._rescueThreatObj;
  if (!obj) {
    obj = { isPlayer: false, isVehicle: false, pos: null, unit: null, distSq: 0 };
    bot._rescueThreatObj = obj;
  }
  obj.isPlayer = Boolean(isPlayer);
  obj.isVehicle = Boolean(isVehicle);
  obj.pos = pos;
  obj.unit = unit;
  obj.distSq = distSq;
  return obj;
}

export function clearBotRescueLinks(bot) {
  // If this bot was actively dragging or bandaging a casualty when the rescue ended/aborted,
  // require a physical weapon-re-equip transition to stow medical gear and unsling their rifle!
  if (bot.rescueState === 'DRAG' || bot.rescueState === 'REVIVE') {
    bot.weaponReadyTimer = Math.max(bot.weaponReadyTimer || 0, 1.45);
    bot.aimRaiseProgress = 0;
    bot.isCrouching = true;
    bot.crouchAmount = Math.max(bot.crouchAmount || 0, 0.9);
    bot.shootCooldown = Math.max(bot.shootCooldown || 0, 1.55);
    bot.transitionState = 'EQUIPPING_WEAPON';
  }
  if (bot.rescueTarget && bot.rescueTarget !== 'PLAYER') {
    if (bot.rescueTarget.rescuer === bot) {
      bot.rescueTarget.rescuer = null;
    }
  }
  bot.rescueTarget = null;
  bot.rescueState = null;
  if (bot.medicRescueFSM && bot.medicRescueFSM.state !== 'IDLE') {
    bot.medicRescueFSM.send(MEDIC_RESCUE_EVENTS.ABORT_RESCUE);
  }
  bot.rescueTimer = 0;
  bot.assessTimer = 0;
  bot.smokePoppedForRescue = false;
  bot.assessedLogged = false;
  bot.assessThreatEnemy = null;
  bot.builtRescueWall = false;
  if (bot.rescuer) {
    if (bot.rescuer.rescueState === 'DRAG' || bot.rescuer.rescueState === 'REVIVE') {
      bot.rescuer.weaponReadyTimer = Math.max(bot.rescuer.weaponReadyTimer || 0, 1.45);
      bot.rescuer.aimRaiseProgress = 0;
      bot.rescuer.isCrouching = true;
      bot.rescuer.crouchAmount = Math.max(bot.rescuer.crouchAmount || 0, 0.9);
      bot.rescuer.shootCooldown = Math.max(bot.rescuer.shootCooldown || 0, 1.55);
      bot.rescuer.transitionState = 'EQUIPPING_WEAPON';
    }
    bot.rescuer.rescueTarget = null;
    bot.rescuer.rescueState = null;
    if (bot.rescuer.medicRescueFSM && bot.rescuer.medicRescueFSM.state !== 'IDLE') {
      bot.rescuer.medicRescueFSM.send(MEDIC_RESCUE_EVENTS.ABORT_RESCUE);
    }
    bot.rescuer.assessThreatEnemy = null;
    bot.rescuer.builtRescueWall = false;
    bot.rescuer = null;
  }
}

/**
 * Scans for immediate enemy threats near either the rescuing Medic (`medicRange`)
 * or the downed casualty (`casualtyRange`). Medics use this to assess the situation
 * and neutralize/suppress nearby threats before rushing out to drag/revive.
 * Throttled with a 0.15s cache on `bot` and ring-ordered spatial grid queries.
 */
export function findImmediateRescueThreat(
  bot,
  targetPos,
  player,
  medicRange = BOT.RESCUE_THREAT_MEDIC_ASSESS,
  casualtyRange = BOT.RESCUE_THREAT_CASUALTY_ASSESS
) {
  const medicRangeSq = medicRange * medicRange;
  const casualtyRangeSq = casualtyRange * casualtyRange;
  const now = performance.now();

  if (now - (bot._rescueThreatAt || -999) < 150) {
    const cached = bot._rescueThreatResult;
    if (
      cached === null &&
      medicRange <= (bot._rescueThreatMRange || 0) &&
      casualtyRange <= (bot._rescueThreatCRange || 0)
    ) {
      return null;
    }
    if (cached && cached.unit && !cached.unit.dead && !cached.unit.downed) {
      const uPos = cached.unit.pos;
      const dMedicSq = bot.pos.distanceToSquared(uPos);
      const dCasSq = targetPos.distanceToSquared(uPos);
      if (dMedicSq <= medicRangeSq || dCasSq <= casualtyRangeSq) {
        cached.pos = uPos;
        cached.distSq = dMedicSq;
        return cached;
      }
      if (
        medicRange <= (bot._rescueThreatMRange || 0) &&
        casualtyRange <= (bot._rescueThreatCRange || 0)
      ) {
        return null;
      }
    }
  }

  let bestThreat = null;
  let bestScoreSq = Infinity;

  if (!player.dead && !player.downed && player.team !== bot.team) {
    const dMedicSq = bot.pos.distanceToSquared(player.pos);
    const dCasSq = targetPos.distanceToSquared(player.pos);
    if (
      (dMedicSq <= medicRangeSq || dCasSq <= casualtyRangeSq) &&
      this.canBotSeeTarget(bot, 'PLAYER', player.pos, false)
    ) {
      bestScoreSq = Math.min(dMedicSq, dCasSq);
      if (player.activeVehicle && !player.activeVehicle.dead) {
        bestThreat = setRescueThreatObj(
          bot,
          false,
          true,
          player.activeVehicle.pos,
          player.activeVehicle,
          dMedicSq
        );
      } else {
        bestThreat = setRescueThreatObj(bot, true, false, player.pos, player, dMedicSq);
      }
    }
  }

  const enemyTeam = bot.team === 'US' ? 'RU' : 'US';
  const enemyGrid = this.teamGrid && this.teamGrid[enemyTeam];
  if (enemyGrid) {
    const evalCandidate = (other) => {
      if (other.dead || other.downed || other.drivingVehicle || other.team === bot.team) return;
      if (bestThreat && bestThreat.unit === other) return;
      const dMedicSq = bot.pos.distanceToSquared(other.pos);
      const dCasSq = targetPos.distanceToSquared(other.pos);
      if (dMedicSq <= medicRangeSq || dCasSq <= casualtyRangeSq) {
        const minSq = Math.min(dMedicSq, dCasSq);
        if (minSq < bestScoreSq && this.canBotSeeTarget(bot, other.id, other.pos, false)) {
          bestScoreSq = minSq;
          bestThreat = setRescueThreatObj(bot, false, false, other.pos, other, dMedicSq);
        }
      }
    };
    enemyGrid.forEachRingOrder(bot.pos.x, bot.pos.z, medicRange, evalCandidate);
    if (casualtyRange > 0 && targetPos.distanceToSquared(bot.pos) > 4.0) {
      enemyGrid.forEachRingOrder(targetPos.x, targetPos.z, casualtyRange, evalCandidate);
    }
  } else {
    for (let i = 0; i < this.bots.length; i++) {
      const other = this.bots[i];
      if (other.dead || other.downed || other.drivingVehicle || other.team === bot.team) continue;
      const dMedicSq = bot.pos.distanceToSquared(other.pos);
      const dCasSq = targetPos.distanceToSquared(other.pos);
      if (dMedicSq <= medicRangeSq || dCasSq <= casualtyRangeSq) {
        const minSq = Math.min(dMedicSq, dCasSq);
        if (minSq < bestScoreSq && this.canBotSeeTarget(bot, other.id, other.pos, false)) {
          bestScoreSq = minSq;
          bestThreat = setRescueThreatObj(bot, false, false, other.pos, other, dMedicSq);
        }
      }
    }
  }

  bot._rescueThreatAt = now;
  bot._rescueThreatMRange = medicRange;
  bot._rescueThreatCRange = casualtyRange;
  bot._rescueThreatResult = bestThreat;
  return bestThreat;
}

/**
 * Spawns a 3D tactical M18 smoke screen over a downed casualty when a Medic assesses
 * an active enemy threat, providing visual concealment during threat suppression & drag!
 */
export function spawnRescueSmoke(pos) {
  if (this.smokeClouds.length > BOT.SMOKE_MAX_CLOUDS) return;
  const group = new THREE.Group();
  group.position.set(pos.x, this.world.getGroundHeightAt(pos.x, pos.z) + 0.4, pos.z);
  const puffMat = new THREE.MeshLambertMaterial({
    color: 0xdce3e8,
    transparent: true,
    opacity: 0.68
  });

  const puffs = [];
  for (let i = 0; i < 7; i++) {
    const mesh = new THREE.Mesh(SHARED_SMOKE_PUFF_GEO, i === 0 ? puffMat : puffMat.clone());
    const angle = (i / 7) * Math.PI * 2;
    const r = i === 0 ? 0 : 0.9 + (i % 2) * 0.55;
    mesh.position.set(Math.cos(angle) * r, 0.4 + (i % 3) * 0.45, Math.sin(angle) * r);
    mesh.rotation.set(Math.random() * 0.5, Math.random() * Math.PI, Math.random() * 0.5);
    group.add(mesh);
    puffs.push(mesh);
  }

  this.scene.add(group);
  this.smokeClouds.push({ group, puffs, life: BOT.SMOKE_LIFE, maxLife: BOT.SMOKE_LIFE });
}

export function reviveBot(bot, isMedicRescuer = false) {
  if (!bot || bot.isDinosaur || (!bot.downed && !bot.dead)) return false;
  this.clearBotRescueLinks(bot);
  bot.downed = false;
  bot.dead = false;
  bot.hp = isMedicRescuer ? BOT.HP : BOT.REVIVE_HP;
  bot.bleedOutTimer = 0;
  // Ensure a revived soldier is NEVER stuck inside a wall, corner, or building footprint!
  if (
    this.world &&
    typeof this.world.findSafeSpawnPoint === 'function' &&
    typeof this.isPointBlocked === 'function' &&
    this.isPointBlocked(bot.pos.x, bot.pos.y, bot.pos.z, 0.55)
  ) {
    const safeRevivePos = this.world.findSafeSpawnPoint(bot.pos.x, bot.pos.z);
    bot.pos.copy(safeRevivePos);
  }
  bot.mesh.position.copy(bot.pos);
  bot.mesh.visible = true;
  // Do NOT snap upright or fire immediately! Start from lying flat (-PI/2) and transition
  // through pushing up onto one knee (postReviveTimer: 2.2s) -> grabbing rifle (weaponReadyTimer: 1.85s) -> raising aim!
  bot.postReviveTimer = BOT.POST_REVIVE_TIMER;
  bot.standUpProgress = 0.0;
  bot.weaponReadyTimer = BOT.POST_REVIVE_WEAPON_READY;
  bot.aimRaiseProgress = 0.0;
  bot.transitionState = 'GETTING_UP';
  bot.isCrouching = true;
  bot.crouchAmount = 1.0;
  bot.velX = 0;
  bot.velZ = 0;
  bot.shootCooldown = Math.max(bot.shootCooldown || 0, 1.95);
  bot.rpgCooldown = Math.max(bot.rpgCooldown || 0, 2.2);
  bot.mesh.rotation.x = -Math.PI / 2;
  bot.mesh.rotation.z = 0;
  if (this.onTelemetryEvent) {
    this.onTelemetryEvent('NPC_POST_REVIVE_TRANSITION_START', {
      npc: bot.name,
      role: bot.role,
      team: bot.team,
      postReviveTimer: bot.postReviveTimer,
      weaponReadyTimer: bot.weaponReadyTimer
    });
  }
  return true;
}

/**
 * Computes a randomized safer cover position (varying both direction & distance 3.4m–9.6m)
 * away from enemy fire or behind nearby cover so rescuers never drag in the same direction/distance.
 */
export function computeSafeDragSpot(downedPos, team, bot = null, threatPos = null) {
  let retreatDirX = bot && bot.subFaction === 'RU' ? 1 : team === 'US' ? -1 : 1;
  let retreatDirZ = (Math.random() - 0.5) * 1.4;
  if (threatPos) {
    const awayX = downedPos.x - threatPos.x;
    const awayZ = downedPos.z - threatPos.z;
    const awayLen = Math.hypot(awayX, awayZ) || 1;
    retreatDirX = awayX / awayLen;
    retreatDirZ = awayZ / awayLen;
  }

  const fallbackDist = 3.6 + Math.random() * 5.8;
  const fallbackAngle = Math.atan2(retreatDirZ, retreatDirX) + (Math.random() - 0.5) * 1.35;
  const bestPos = new THREE.Vector3(
    downedPos.x + Math.cos(fallbackAngle) * fallbackDist,
    downedPos.y,
    downedPos.z + Math.sin(fallbackAngle) * fallbackDist
  );
  let bestScore = -999;
  const startAngle = Math.random() * Math.PI * 2;

  for (let i = 0; i < 14; i++) {
    // Varied direction (random start angle + angular jitter) and varied distance (3.4m to 9.6m)
    const angle = startAngle + (i / 14) * Math.PI * 2 + (Math.random() - 0.5) * 0.48;
    const dist = 3.4 + Math.random() * 6.2;
    const cx = downedPos.x + Math.cos(angle) * dist;
    const cz = downedPos.z + Math.sin(angle) * dist;
    const cy = this.world.getGroundHeightAt(cx, cz);

    if (this.isPointBlocked(cx, cy, cz)) continue;

    // Score higher if retreating away from threat AND if adjacent to existing cover, plus random jitter
    const dirDot = Math.cos(angle) * retreatDirX + Math.sin(angle) * retreatDirZ;
    let score = dirDot * 2.1 + (Math.random() - 0.5) * 2.4;
    const g = this.world.worldToGrid(cx, cy + 0.8, cz);
    const adjDirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ];
    for (const [dx, dz] of adjDirs) {
      if (this.world.voxels.has(this.world.key(g.gx + dx, g.gy, g.gz + dz))) {
        score += 3.5; // Next to solid cover!
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestPos.set(cx, cy, cz);
    }
  }

  bestPos.y = this.world.getGroundHeightAt(bestPos.x, bestPos.z);
  return bestPos;
}

/**
 * Checks if any solid cover wall voxel already exists within `radius` meters (default 10.0m)
 * of `originPos`. If an existing wall is found within 10m, returns a cover position directly
 * behind that wall (away from `threatPos` / enemy direction) so medics reuse existing cover
 * instead of cluttering the battlefield with extra walls!
 */
export function findExistingWallCoverWithinRadius(
  originPos,
  radius = 10.0,
  threatPos = null,
  bot = null
) {
  if (!this.world || !this.world.voxels || !originPos) return null;

  let threatDirX = bot && bot.subFaction === 'RU' ? -1 : bot && bot.team === 'US' ? 1 : -1;
  let threatDirZ = 0;
  if (threatPos) {
    const dx = threatPos.x - originPos.x;
    const dz = threatPos.z - originPos.z;
    const len = Math.hypot(dx, dz) || 1;
    threatDirX = dx / len;
    threatDirZ = dz / len;
  }

  const voxelSize = 1.25;
  const centerGrid = this.world.worldToGrid(originPos.x, originPos.y + 0.3, originPos.z);
  const gridRadius = Math.ceil(radius / voxelSize);
  const radiusSq = radius * radius;

  let bestCoverPos = null;
  let bestWallGrid = null;
  let bestDistSq = Infinity;

  for (let dgx = -gridRadius; dgx <= gridRadius; dgx++) {
    for (let dgz = -gridRadius; dgz <= gridRadius; dgz++) {
      const gx = centerGrid.gx + dgx;
      const gz = centerGrid.gz + dgz;
      const wx = gx * voxelSize;
      const wz = gz * voxelSize;
      const dx = wx - originPos.x;
      const dz = wz - originPos.z;
      const dSq = dx * dx + dz * dz;
      if (dSq > radiusSq || dSq >= bestDistSq) continue;

      const groundY = this.world.getGroundHeightAt(wx, wz);
      const baseGy = Math.floor(groundY / voxelSize);
      // Check if there is a standing wall or fortification voxel at or just above ground level
      let hasWallVoxel = false;
      let wallGy = baseGy;
      for (let h = 0; h <= 2; h++) {
        const vox = this.world.voxels.get(this.world.key(gx, baseGy + h, gz));
        if (vox && !vox.isProp) {
          hasWallVoxel = true;
          wallGy = baseGy + h;
          break;
        }
      }
      if (!hasWallVoxel) continue;

      // Compute the safe side directly behind this existing wall (away from threat)
      const behindX = wx - threatDirX * 1.45;
      const behindZ = wz - threatDirZ * 1.45;
      const behindY = this.world.getGroundHeightAt(behindX, behindZ);
      if (this.isPointBlocked(behindX, behindY, behindZ)) continue;

      bestDistSq = dSq;
      bestCoverPos = new THREE.Vector3(behindX, behindY, behindZ);
      bestWallGrid = new THREE.Vector3(gx, wallGy, gz);
    }
  }

  if (!bestCoverPos) return null;
  return { coverPos: bestCoverPos, wallGrid: bestWallGrid };
}

/**
 * Builds a physical 3-block-wide x 2-block-high protective sandbag cover wall between `safeSpot`
 * and the enemy threat direction, and positions `safeSpot` right behind the newly built wall
 * so the rescuer drags the wounded soldier toward that cover wall before reviving!
 * If there is already a wall within a 10-meter radius, skips building a new wall and instead
 * directs `safeSpot` behind the existing wall to prevent battlefield clutter!
 */
export function buildRescueCoverWall(bot, safeSpot, threatPos = null, searchOrigin = null) {
  if (!this.world || !safeSpot) return false;

  // Medics & infantry NEVER spawn permanent sandbag chest walls in open fields (prevents map clutter!).
  // Instead, search up to 14m for existing building walls/rocks/fortifications to drag the casualty behind,
  // and deploy tactical concealment smoke (`spawnRescueSmoke`) when under fire!
  const checkOrigin = searchOrigin || (bot ? bot.pos : safeSpot);
  const existingWall =
    this.findExistingWallCoverWithinRadius(checkOrigin, 14.0, threatPos, bot) ||
    (checkOrigin !== safeSpot
      ? this.findExistingWallCoverWithinRadius(safeSpot, 14.0, threatPos, bot)
      : null);

  if (existingWall && existingWall.coverPos) {
    safeSpot.copy(existingWall.coverPos);
    if (bot) {
      bot.builtRescueWall = true;
      bot.reusedExistingWall = true;
      if (!bot.rescueWallPos) bot.rescueWallPos = new THREE.Vector3();
      if (existingWall.wallGrid) bot.rescueWallPos.copy(existingWall.wallGrid);
    }
    return false;
  }

  if (bot) {
    bot.builtRescueWall = true;
    bot.reusedExistingWall = false;
    if (threatPos && typeof this.spawnRescueSmoke === 'function') {
      this.spawnRescueSmoke(safeSpot);
    }
  }
  return false;
}

function by_fallback(_y, z) {
  return z;
}

/**
 * Returns true if enemies are currently shooting at (or have just shot at) the rescuing bot
 * or the casualty being revived. Bots can ONLY revive when enemies aren't shooting at them!
 */
export function isRescuerUnderEnemyFire(bot, targetPos, player) {
  if (!bot) return false;
  if ((bot.underFireTimer || 0) > 0) return true;
  if (
    bot.rescueTarget &&
    bot.rescueTarget !== 'PLAYER' &&
    (bot.rescueTarget.underFireTimer || 0) > 0
  ) {
    return true;
  }

  // Check if enemy player is actively firing toward the rescuer within 48m with line of sight
  if (
    player &&
    !player.dead &&
    !player.downed &&
    player.team !== bot.team &&
    player.isFiring &&
    bot.pos.distanceToSquared(player.pos) <= 48 * 48 &&
    this.canBotSeeTarget(bot, 'PLAYER', player.pos, false)
  ) {
    bot.underFireTimer = 1.6;
    if (!bot.lastShooterPos) bot.lastShooterPos = new THREE.Vector3();
    bot.lastShooterPos.copy(player.pos);
    return true;
  }

  // Check if any enemy bot within 42m has clear line of sight and is actively firing at this bot
  const enemyTeam = bot.team === 'US' ? 'RU' : 'US';
  const enemyGrid = this.teamGrid && this.teamGrid[enemyTeam];
  let underBotFire = false;
  if (enemyGrid) {
    enemyGrid.forEachInRadius(bot.pos.x, bot.pos.z, 42, (other, dSq2D) => {
      if (other.dead || other.downed || other.team === bot.team) return;
      const dy = other.pos.y - bot.pos.y;
      if (dSq2D + dy * dy > 42 * 42) return;
      if (other.muzzleFlashTimer > 0 || (other.shootCooldown || 1) < 0.28) {
        const targetingRescuer =
          other._cachedEnemy &&
          (other._cachedEnemy.unit === bot || other._cachedEnemy.unit === bot.rescueTarget);
        if (targetingRescuer && this.canBotSeeTarget(other, bot.id, bot.pos, false)) {
          bot.underFireTimer = 1.6;
          if (!bot.lastShooterPos) bot.lastShooterPos = new THREE.Vector3();
          bot.lastShooterPos.copy(other.pos);
          underBotFire = true;
          return false;
        }
      }
    });
    if (underBotFire) return true;
  } else {
    for (let i = 0; i < this.bots.length; i++) {
      const other = this.bots[i];
      if (other.dead || other.downed || other.team === bot.team) continue;
      const dSq = bot.pos.distanceToSquared(other.pos);
      if (dSq <= 42 * 42 && (other.muzzleFlashTimer > 0 || (other.shootCooldown || 1) < 0.28)) {
        const targetingRescuer =
          other._cachedEnemy &&
          (other._cachedEnemy.unit === bot || other._cachedEnemy.unit === bot.rescueTarget);
        if (targetingRescuer && this.canBotSeeTarget(other, bot.id, bot.pos, false)) {
          bot.underFireTimer = 1.6;
          if (!bot.lastShooterPos) bot.lastShooterPos = new THREE.Vector3();
          bot.lastShooterPos.copy(other.pos);
          return true;
        }
      }
    }
  }

  return false;
}

export function findNearestDownedFriendly(pos, team, maxDist = 3.8) {
  let best = null;
  let bestDistSq = maxDist * maxDist;
  const downedList =
    this.downedByTeam && this.downedByTeam[team] ? this.downedByTeam[team] : this.bots;
  for (let i = 0; i < downedList.length; i++) {
    const b = downedList[i];
    if (b.team !== team || b.isDinosaur || !b.downed || b.dead) continue;
    const dSq = b.pos.distanceToSquared(pos);
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      best = b;
    }
  }
  return best;
}

/**
 * Evaluates and advances the Tactical Medic Rescue state machine:
 * 1. ASSESS_THREAT (Scan for enemies within 36m/32m -> Pop Smoke -> Crouch & Suppress/Clear Threat!)
 * 2. APPROACH (Advance in low crouch under smoke cover)
 * 3. DRAG (Pull wounded soldier behind solid voxel cover)
 * 4. REVIVE (Kneel & bandage to 80 HP)
 *
 * Returns `true` if the bot's frame movement/animation was completely handled by the rescue state
 * (`APPROACH`, `DRAG`, or `REVIVE`), or `false` if the bot should proceed to combat/movement AI.
 */
export function updateMedicRescue(bot, dt, player, onKillFn) {
  if (bot.isDinosaur) return false;
  const parts = bot.mesh.userData.parts;
  bot.assessThreatEnemy = null;

  if (!bot.medicRescueFSM) {
    createMedicRescueFSM(bot);
  }

  // Validate existing rescue target (Squad rule: reviving requires at least 1 Field Dressing!)
  if (bot.rescueTarget) {
    if ((bot.fieldDressings ?? 1) <= 0) {
      this.clearBotRescueLinks(bot);
    } else if (bot.rescueTarget === 'PLAYER') {
      if (!player.downed || player.dead || player.role === 'dino_raptor') {
        this.clearBotRescueLinks(bot);
      }
    } else if (
      bot.rescueTarget.dead ||
      bot.rescueTarget.isDinosaur ||
      !bot.rescueTarget.downed ||
      (bot.rescueTarget.rescuer && bot.rescueTarget.rescuer !== bot) ||
      player.reviveTargetBot === bot.rescueTarget
    ) {
      this.clearBotRescueLinks(bot);
    }
  }

  // Look for a nearby downed friendly comrade (Player or AI Soldier) to rescue (throttled for 250-bot scale)
  // Squad rule: Medics carry 9 Field Dressings, Non-Medics carry 2; 0 Field Dressings = cannot revive without resupplying!
  bot._rescueScanTimer = (bot._rescueScanTimer || 0) - dt;
  if (
    !bot.rescueTarget &&
    (bot.fieldDressings ?? 1) > 0 &&
    (bot.postReviveTimer || 0) <= 0 &&
    bot._rescueScanTimer <= 0
  ) {
    bot._rescueScanTimer = 0.35 + Math.random() * 0.25;
    const isMedic = bot.role === 'MEDIC';
    const maxRescueRange = isMedic ? BOT.RESCUE_RANGE_MEDIC : BOT.RESCUE_RANGE_OTHER;
    let bestTarget = null;
    let bestDistSq = maxRescueRange * maxRescueRange;

    if (
      player.downed &&
      !player.dead &&
      player.role !== 'dino_raptor' &&
      bot.team === player.team &&
      (isMedic || bot.inPlayerSquad)
    ) {
      const dpSq = bot.pos.distanceToSquared(player.pos);
      if (dpSq < bestDistSq) {
        bestDistSq = dpSq;
        bestTarget = 'PLAYER';
      }
    }

    const downedList =
      this.downedByTeam && this.downedByTeam[bot.team]
        ? this.downedByTeam[bot.team]
        : this.bots;
    for (let i = 0; i < downedList.length; i++) {
      const ally = downedList[i];
      if (ally === bot || ally.isDinosaur || ally.team !== bot.team || !ally.downed || ally.dead) continue;
      // Dedicated Medics can take over a casualty claim from a non-medic who hasn't started dragging/reviving yet
      if (
        ally.rescuer &&
        ally.rescuer !== bot &&
        !(isMedic && ally.rescuer.role !== 'MEDIC' && ally.rescuer.rescueState === 'ASSESS_THREAT')
      ) {
        continue;
      }
      if (player.reviveTargetBot === ally) continue;
      const dSq = bot.pos.distanceToSquared(ally.pos);
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestTarget = ally;
      }
    }

    if (bestTarget) {
      bot.medicRescueFSM.send(MEDIC_RESCUE_EVENTS.CLAIM_CASUALTY, { target: bestTarget });
      bot.assessTimer = isMedic ? 1.45 : 1.1;
      bot.smokePoppedForRescue = false;
      bot.assessedLogged = false;
      bot.rescueTimer = 0;
    }
  }

  // Execute Active Rescue State Machine (ASSESS_THREAT -> APPROACH -> DRAG -> REVIVE)
  if (!bot.rescueTarget) {
    if (bot.role === 'MEDIC') {
      return this.updateMedicInjuryHeal(bot, dt, player);
    }
    return false;
  }

  const targetPos = bot.rescueTarget === 'PLAYER' ? player.pos : bot.rescueTarget.pos;
  const targetName = bot.rescueTarget === 'PLAYER' ? player.name : bot.rescueTarget.name;
  const distToDowned = Math.hypot(targetPos.x - bot.pos.x, targetPos.z - bot.pos.z);

  // If an enemy rushes within point-blank 10m while approaching (and no smoke screen is up),
  // pause the approach and switch back to ASSESS_THREAT to defend themselves & the casualty!
  if (bot.rescueState === 'APPROACH' && !bot.smokePoppedForRescue) {
    const closeAmbush = this.findImmediateRescueThreat(
      bot,
      targetPos,
      player,
      BOT.RESCUE_THREAT_AMBUSH_MEDIC,
      BOT.RESCUE_THREAT_AMBUSH_CASUALTY
    );
    if (closeAmbush) {
      bot.medicRescueFSM.send(MEDIC_RESCUE_EVENTS.AMBUSH_REASSESS);
      bot.assessTimer = 1.15;
      bot.smokePoppedForRescue = true; // Prevent infinite re-assess loop
      if (bot.role === 'MEDIC') {
        this.spawnRescueSmoke(targetPos);
      }
    }
  }

  if (bot.rescueState === 'ASSESS_THREAT') {
    bot.assessTimer -= dt;
    const immediateThreat = this.findImmediateRescueThreat(
      bot,
      targetPos,
      player,
      BOT.RESCUE_THREAT_MEDIC_REASSESS,
      BOT.RESCUE_THREAT_CASUALTY_REASSESS
    );

    if (!immediateThreat) {
      // Sector is clear! Transition to APPROACH immediately!
      if (!bot.assessedLogged) {
        bot.assessedLogged = true;
        this.emitBotComms(
          bot,
          player,
          `Hold on ${targetName}! Sector clear, moving in to get you!`,
          'MEDIC',
          false
        );
        if (this.onTelemetryEvent && bot.role === 'MEDIC') {
          this.onTelemetryEvent('MEDIC_ASSESS_CLEAR', {
            medic: bot.name,
            team: bot.team,
            casualty: targetName,
            action: 'SECTOR_CLEAR_ADVANCING'
          });
        }
      }
      bot.medicRescueFSM.send(MEDIC_RESCUE_EVENTS.SECTOR_CLEAR_APPROACH);
    } else {
      // Active enemy threat detected guarding the casualty or near the Medic!
      // 1) Pop tactical smoke screen over the casualty to blind the enemy
      if (bot.role === 'MEDIC' && !bot.smokePoppedForRescue) {
        bot.smokePoppedForRescue = true;
        this.spawnRescueSmoke(targetPos);
      }
      if (!bot.assessedLogged) {
        bot.assessedLogged = true;
        const threatName = immediateThreat.unit ? immediateThreat.unit.name : 'ENEMY';
        this.emitBotComms(
          bot,
          player,
          `Hang tight ${targetName}! Popping smoke & suppressing shooter first!`,
          'MEDIC',
          true
        );
        if (this.onTelemetryEvent && bot.role === 'MEDIC') {
          this.onTelemetryEvent('MEDIC_ASSESS_THREAT', {
            medic: bot.name,
            team: bot.team,
            casualty: targetName,
            threat: threatName,
            threatDistM: Math.round(Math.sqrt(immediateThreat.distSq || 100)),
            smokeDeployed: bot.smokePoppedForRescue,
            action: 'ENGAGING_THREAT_BEFORE_RESCUE'
          });
        }
      }

      // Once we have assessed/suppressed the threat for the assessment window and no enemy
      // is within point-blank 12m range, advance in a low tactical crouch to grab the ally!
      const pointBlankThreat = this.findImmediateRescueThreat(
        bot,
        targetPos,
        player,
        BOT.RESCUE_THREAT_POINTBLANK_MEDIC,
        BOT.RESCUE_THREAT_POINTBLANK_CASUALTY
      );
      if (bot.assessTimer <= 0 && (!pointBlankThreat || bot.smokePoppedForRescue)) {
        bot.medicRescueFSM.send(MEDIC_RESCUE_EVENTS.SECTOR_CLEAR_APPROACH);
      } else {
        // Hold cover crouch and engage/suppress the threat first!
        bot.isCrouching = true;
        bot.tactic = 'ANCHOR_CROUCH';
        bot.assessThreatEnemy = immediateThreat;
      }
    }
  }

  if (bot.rescueState === 'APPROACH') {
    if (distToDowned <= 2.2) {
      // Reached the fallen comrade! Compute a randomized safe cover spot, build a protective
      // sandbag cover wall facing the enemy threat, and drag the casualty toward that cover wall!
      bot.medicRescueFSM.send(MEDIC_RESCUE_EVENTS.REACHED_CASUALTY_DRAG);
      bot.rescueTimer = 1.15 + Math.random() * 1.55; // Varied drag duration (1.15s - 2.70s) so drag distances vary
      const threat = this.findImmediateRescueThreat(bot, targetPos, player, 64, 64);
      const threatRefPos = threat ? threat.pos : bot.lastShooterPos || null;
      const safeSpot = this.computeSafeDragSpot(targetPos, bot.team, bot, threatRefPos);
      const builtNewWall = this.buildRescueCoverWall(bot, safeSpot, threatRefPos, targetPos);
      bot.dragGoalPos.copy(safeSpot);
      this.emitBotComms(
        bot,
        player,
        builtNewWall
          ? `Got your vest ${targetName}! Built cover wall — dragging you behind cover before reviving!`
          : `Got your vest ${targetName}! Moving behind existing cover wall within 10m before reviving!`,
        'MEDIC',
        false
      );
    } else {
      // Move toward fallen comrade (in a low tactical crouch if enemies are within 48m!)
      const distantThreat = this.findImmediateRescueThreat(
        bot,
        targetPos,
        player,
        BOT.RESCUE_THREAT_APPROACH_MEDIC,
        BOT.RESCUE_THREAT_APPROACH_CASUALTY
      );
      bot.isCrouching = Boolean(distantThreat);
      const toDowned = tmpVec3(
        targetPos.x - bot.pos.x,
        0,
        targetPos.z - bot.pos.z
      ).normalize();
      const targetSpd = distantThreat ? BOT.SPEED_APPROACH_SLOW : BOT.SPEED_APPROACH_FAST;
      const curSpd = Math.hypot(bot.velX || 0, bot.velZ || 0);
      const spd = Math.min(targetSpd, curSpd + 10.5 * dt);
      bot.velX = toDowned.x * spd;
      bot.velZ = toDowned.z * spd;
      const nx = bot.pos.x + toDowned.x * spd * dt;
      const nz = bot.pos.z + toDowned.z * spd * dt;
      if (!this.isPointBlocked(nx, bot.pos.y, nz, 0.48)) {
        bot.pos.x = nx;
        bot.pos.z = nz;
      } else if (!this.isPointBlocked(nx, bot.pos.y, bot.pos.z, 0.48)) {
        bot.pos.x = nx;
      } else if (!this.isPointBlocked(bot.pos.x, bot.pos.y, nz, 0.48)) {
        bot.pos.z = nz;
      } else {
        const perpX = bot.pos.x - toDowned.z * spd * dt;
        const perpZ = bot.pos.z + toDowned.x * spd * dt;
        if (!this.isPointBlocked(perpX, bot.pos.y, perpZ, 0.48)) {
          bot.pos.x = perpX;
          bot.pos.z = perpZ;
        }
      }
      bot.pos.y = this.world.getGroundHeightAt(bot.pos.x, bot.pos.z);
      bot.yaw = Math.atan2(toDowned.x, toDowned.z);
      bot.mesh.rotation.y = bot.yaw;

      // Low tactical approach animation
      const crouchOffset = distantThreat ? 0.16 : 0;
      bot.animPhase += dt * 15;
      parts.pelvisGroup.position.y =
        0.78 - crouchOffset + Math.abs(Math.sin(bot.animPhase)) * 0.055;
      parts.upperBody.position.y = parts.pelvisGroup.position.y;
      parts.upperBody.rotation.set(
        (distantThreat ? 0.42 : 0.28),
        Math.sin(bot.animPhase) * 0.1,
        0
      );
      parts.leftLeg.rotation.x = Math.sin(bot.animPhase) * 0.82 - crouchOffset * 1.4;
      parts.rightLeg.rotation.x = -Math.sin(bot.animPhase) * 0.82 - crouchOffset * 1.4;
      parts.leftShin.rotation.x = Math.max(0, -Math.cos(bot.animPhase) * 1.0) + crouchOffset * 2.2;
      parts.rightShin.rotation.x = Math.max(0, Math.cos(bot.animPhase) * 1.0) + crouchOffset * 2.2;
      return true;
    }
  }

  if (bot.rescueState === 'DRAG') {
    bot.rescueTimer -= dt;
    const toSafe = tmpVec3(
      bot.dragGoalPos.x - bot.pos.x,
      0,
      bot.dragGoalPos.z - bot.pos.z
    );
    const distToSafe = toSafe.length();

    if (bot.rescueTimer <= 0 || distToSafe < 0.9) {
      // Arrived behind cover! Transition to kneeling revive!
      bot.medicRescueFSM.send(MEDIC_RESCUE_EVENTS.REACHED_COVER_REVIVE);
      bot.rescueTimer = bot.role === 'MEDIC' ? BOT.MEDIC_REVIVE_TIME : BOT.NON_MEDIC_REVIVE_TIME;
    } else {
      toSafe.normalize();
      const dragSpeed = BOT.DRAG_SPEED;
      const nx = bot.pos.x + toSafe.x * dragSpeed * dt;
      const nz = bot.pos.z + toSafe.z * dragSpeed * dt;
      const dragTrailX = nx - toSafe.x * 1.05;
      const dragTrailZ = nz - toSafe.z * 1.05;
      const dragTrailY = this.world.getGroundHeightAt(dragTrailX, dragTrailZ);
      if (
        !this.isPointBlocked(nx, bot.pos.y, nz, 0.52) &&
        !this.isPointBlocked(dragTrailX, dragTrailY, dragTrailZ, 0.52)
      ) {
        bot.pos.x = nx;
        bot.pos.z = nz;
        bot.pos.y = this.world.getGroundHeightAt(bot.pos.x, bot.pos.z);

        // Pull the wounded soldier along the ground right in front of the rescuer!
        if (bot.rescueTarget === 'PLAYER') {
          player.pos.set(dragTrailX, dragTrailY, dragTrailZ);
          player.downedTimer = Math.max(player.downedTimer, 8.0);
        } else {
          bot.rescueTarget.pos.set(dragTrailX, dragTrailY + 0.22, dragTrailZ);
          bot.rescueTarget.mesh.rotation.x = -Math.PI / 2;
          bot.rescueTarget.mesh.rotation.y = Math.atan2(toSafe.x, toSafe.z);
          if (bot.mesh.visible) {
            bot.rescueTarget.mesh.visible = true;
            bot.rescueTarget.mesh._culledOffFrustum = bot.mesh._culledOffFrustum;
          }
        }
      } else {
        // Reached a wall/cover block — immediately start reviving right in front of it without pushing casualty into the wall!
        bot.medicRescueFSM.send(MEDIC_RESCUE_EVENTS.REACHED_COVER_REVIVE);
        bot.rescueTimer = bot.role === 'MEDIC' ? BOT.MEDIC_REVIVE_TIME : BOT.NON_MEDIC_REVIVE_TIME;
      }

      // Rescuer faces the wounded soldier while stepping backward pulling their vest!
      bot.yaw = Math.atan2(-toSafe.x, -toSafe.z);
      bot.mesh.rotation.y = bot.yaw;
      bot.animPhase -= dt * 9.0; // Backward stride cycle
      parts.pelvisGroup.position.y = 0.62 + Math.abs(Math.sin(bot.animPhase)) * 0.035;
      parts.upperBody.position.y = parts.pelvisGroup.position.y;
      parts.upperBody.rotation.set(0.46, 0, 0);
      parts.headGroup.rotation.set(0.25, 0, 0);
      parts.weaponRig.rotation.set(0.68, 0, 0);
      parts.leftLeg.rotation.x = Math.sin(bot.animPhase) * 0.55 - 0.3;
      parts.rightLeg.rotation.x = -Math.sin(bot.animPhase) * 0.55 - 0.3;
      parts.leftShin.rotation.x = 0.65;
      parts.rightShin.rotation.x = 0.65;
      return true;
    }
  }

  if (bot.rescueState === 'REVIVE') {
    if (bot.rescueTarget !== 'PLAYER' && bot.rescueTarget.bleedOutTimer !== undefined) {
      bot.rescueTarget.bleedOutTimer = Math.max(bot.rescueTarget.bleedOutTimer, 4.0);
    }

    // Bots can ONLY revive when enemies aren't shooting at them!
    // If the rescuer or casualty is currently under enemy fire, build cover (if not yet built),
    // crouch behind the cover wall, and pause the revive countdown until enemy fire stops!
    const underEnemyFire = this.isRescuerUnderEnemyFire(bot, targetPos, player);
    if (underEnemyFire) {
      bot.rescueTimer = Math.max(bot.rescueTimer, 1.15);
      bot.isCrouching = true;
      if (!bot.builtRescueWall) {
        this.buildRescueCoverWall(bot, bot.pos, bot.lastShooterPos || null);
      }
      bot.animPhase += dt * 6;
      bot.yaw = Math.atan2(targetPos.x - bot.pos.x, targetPos.z - bot.pos.z);
      bot.mesh.rotation.y = bot.yaw;
      parts.pelvisGroup.position.y = 0.46;
      parts.upperBody.position.y = 0.46;
      parts.upperBody.rotation.set(0.62, 0, 0);
      parts.headGroup.rotation.set(0.38, 0, 0);
      parts.leftLeg.rotation.x = -0.88;
      parts.rightLeg.rotation.x = -0.45;
      parts.leftShin.rotation.x = 1.42;
      parts.rightShin.rotation.x = 1.0;
      return true;
    }

    bot.rescueTimer -= dt;
    bot.animPhase += dt * 12;

    // Kneel down beside the fallen comrade and wrap bandage
    bot.yaw = Math.atan2(targetPos.x - bot.pos.x, targetPos.z - bot.pos.z);
    bot.mesh.rotation.y = bot.yaw;
    parts.pelvisGroup.position.y = 0.52;
    parts.upperBody.position.y = 0.52;
    parts.upperBody.rotation.set(0.54 + Math.sin(bot.animPhase) * 0.08, 0, 0);
    parts.headGroup.rotation.set(0.32, 0, 0);
    parts.weaponRig.rotation.set(0.75 + Math.cos(bot.animPhase) * 0.12, 0, 0);
    parts.leftLeg.rotation.x = -0.8;
    parts.rightLeg.rotation.x = -0.35;
    parts.leftShin.rotation.x = 1.35;
    parts.rightShin.rotation.x = 0.9;

    // Spawn periodic white/green bandage particles while reviving
    if (Math.random() < 0.25) {
      this.world.spawnDebris(
        tmpVec3(targetPos.x, targetPos.y + 0.55, targetPos.z),
        REVIVE_PARTICLE_COLOR,
        1
      );
    }

    if (bot.rescueTimer <= 0) {
      // Squad rule: Every revive consumes 1 Field Dressing! (Medics carry 9, Non-Medics carry 2)
      bot.fieldDressings = Math.max(0, (bot.fieldDressings ?? 1) - 1);
      bot.revives = (bot.revives || 0) + 1;
      bot.score += 200;
      if (this.onTelemetryEvent) {
        this.onTelemetryEvent('REVIVE_COMPLETE', {
          medic: bot.name,
          role: bot.role,
          team: bot.team,
          casualty: targetName,
          fieldDressingsLeft: bot.fieldDressings
        });
      }
      if (bot.rescueTarget === 'PLAYER') {
        player.reviveFromDowned(bot.name, bot.role === 'MEDIC', bot.fieldDressings, bot.maxFieldDressings || 9);
        if (bot.role === 'MEDIC' && (bot.medicBagSupply ?? 600) > 0) {
          bot.healTarget = 'PLAYER';
        }
      } else {
        const savedBot = bot.rescueTarget;
        this.reviveBot(savedBot, false); // Field Dressing stabilizes at 40 HP; Medic Bag then heals to 100 HP!
        if (bot.role === 'MEDIC' && (bot.medicBagSupply ?? 600) > 0) {
          bot.healTarget = savedBot;
        }
        if (onKillFn && bot.pos.distanceTo(player.pos) < 110) {
          onKillFn(bot.name, bot.team, savedBot.name, savedBot.team, 'REVIVED', false);
        }
      }
      // Medic / Rescuer must stow bandages & unsling rifle from kneeling posture before aiming or firing!
      bot.weaponReadyTimer = 1.45;
      bot.aimRaiseProgress = 0.0;
      bot.isCrouching = true;
      bot.crouchAmount = 1.0;
      bot.shootCooldown = Math.max(bot.shootCooldown || 0, 1.55);
      bot.rpgCooldown = Math.max(bot.rpgCooldown || 0, 1.8);
      bot.transitionState = 'EQUIPPING_WEAPON';
      bot.rescueTarget = null;
      bot.rescueState = null;
    }
    return true;
  }

  return false;
}

/**
 * Autonomous Field Medic Injury Treatment (`updateMedicInjuryHeal`):
 * - Friendly Medics continuously project a 7.5m Field Medkit Aura that cures bleeding and heals
 *   injured standing teammates & the Player all the way to 100/100 Max HP (+34 HP/sec).
 * - When not rescuing a downed casualty, Medics actively seek out an injured Player (within 60m)
 *   or injured friendly soldiers (within 38m), run to their side, and channel medical treatment
 *   until their health is maxed out at 100/100 HP!
 */
export function updateMedicInjuryHeal(bot, dt, player) {
  if (bot.isDinosaur || bot.role !== 'MEDIC' || bot.dead || bot.downed || bot.drivingVehicle) return false;
  const parts = bot.mesh.userData.parts;
  const auraRadius = BOT.MEDIC_HEAL_AURA_RADIUS || 7.5;
  const auraRadiusSq = auraRadius * auraRadius;
  const healRate = BOT.MEDIC_HEAL_RATE || 34;

  // If this Medic has exhausted all 9 Field Dressings (or their Medic Bag supply is depleted),
  // seek out the nearest friendly Ammo & Kit Stash to resupply medical items!
  if ((bot.fieldDressings ?? 9) <= 0 || (bot.medicBagSupply ?? 600) <= 15) {
    if (this.world && this.world.ammoCrates && this.world.ammoCrates.length > 0) {
      let bestCrate = null;
      let bestCrateDistSq = 95 * 95;
      for (const crate of this.world.ammoCrates) {
        if (crate.team && crate.team !== bot.team) continue;
        const dSq = bot.pos.distanceToSquared(crate.pos);
        if (dSq < bestCrateDistSq) {
          bestCrateDistSq = dSq;
          bestCrate = crate;
        }
      }
      if (bestCrate && bestCrateDistSq > 4.0 * 4.0) {
        const toCrate = tmpVec3(
          bestCrate.pos.x - bot.pos.x,
          0,
          bestCrate.pos.z - bot.pos.z
        ).normalize();
        const spd = BOT.SPEED_APPROACH_FAST || 6.4;
        const nx = bot.pos.x + toCrate.x * spd * dt;
        const nz = bot.pos.z + toCrate.z * spd * dt;
        if (!this.isPointBlocked(nx, bot.pos.y, nz)) {
          bot.pos.x = nx;
          bot.pos.z = nz;
        }
        bot.pos.y = this.world.getGroundHeightAt(bot.pos.x, bot.pos.z);
        bot.yaw = Math.atan2(toCrate.x, toCrate.z);
        bot.mesh.rotation.y = bot.yaw;
        return true;
      }
    }
  }

  if ((bot.medicBagSupply ?? 600) <= 0) {
    return false;
  }

  // 1. Throttled 5 Hz (0.2s) 7.5m Medic Bag Aura — scales heal by elapsed `auraDt` so exact 34 HP/sec rate is 100% preserved
  bot._medicAuraAccum = (bot._medicAuraAccum || 0) + dt;
  if (bot._medicAuraTimer === undefined) {
    bot._medicAuraTimer = Math.random() * 0.2;
  }
  bot._medicAuraTimer -= dt;

  if (bot._medicAuraTimer <= 0) {
    const auraDt = Math.min(0.5, bot._medicAuraAccum || dt);
    bot._medicAuraAccum = 0;
    bot._medicAuraTimer = 0.2;
    bot._activelyTreatingClose = false;

    if (
      player &&
      !player.dead &&
      !player.downed &&
      player.team === bot.team &&
      (player.hp < 100 || player.bleeding)
    ) {
      const dpSq = bot.pos.distanceToSquared(player.pos);
      if (dpSq <= auraRadiusSq) {
        const prevHp = player.hp;
        if (player.bleeding && (bot.fieldDressings ?? 9) > 0) {
          player.bleeding = false;
          bot.fieldDressings = Math.max(0, (bot.fieldDressings ?? 9) - 1);
        } else {
          player.bleeding = false;
        }
        const healDelta = Math.min(100 - player.hp, healRate * auraDt, bot.medicBagSupply ?? 600);
        player.hp = Math.min(100, player.hp + healDelta);
        bot.medicBagSupply = Math.max(0, (bot.medicBagSupply ?? 600) - healDelta);
        player.beingHealedByMedic = `${bot.name} [${bot.fieldDressings ?? 9}/9 DRESSINGS]`;
        player.medicHealTimer = 0.65;
        bot.score = (bot.score || 0) + 12 * auraDt;
        bot._activelyTreatingClose = dpSq <= 4.6 * 4.6;

        if (Math.random() < 0.75) {
          this.world.spawnDebris(
            tmpVec3(player.pos.x, player.pos.y + 0.95, player.pos.z),
            REVIVE_PARTICLE_COLOR,
            1
          );
        }

        if (prevHp < 100 && player.hp >= 100) {
          player.hp = 100;
          if (player.onAwardXp) {
            player.onAwardXp(
              25,
              `🏥 MEDIC BAG (${bot.name}): INJURIES HEALED TO 100/100 MAX HP! (${bot.fieldDressings ?? 9}/9 DRESSINGS LEFT)`
            );
          }
          this.emitBotComms(
            bot,
            player,
            `Medic Bag treatment complete ${player.name}! Health maxed at 100/100 HP (${bot.fieldDressings ?? 9}/9 Field Dressings left)!`,
            'MEDIC',
            false
          );
        }
      }
    }

    // Heal nearby injured friendly bots within 7.5m Medic Bag aura via teamGrid spatial query
    const friendlyGrid = this.teamGrid && this.teamGrid[bot.team];
    if (friendlyGrid && (bot.medicBagSupply ?? 600) > 0) {
      friendlyGrid.forEachInRadius(bot.pos.x, bot.pos.z, auraRadius, (ally, dSq2D) => {
        if ((bot.medicBagSupply ?? 600) <= 0) return false;
        if (
          ally === bot ||
          ally.dead ||
          ally.downed ||
          ally.drivingVehicle ||
          ally.team !== bot.team ||
          ally.hp >= BOT.HP
        ) {
          return;
        }
        const dy = ally.pos.y - bot.pos.y;
        if (dSq2D + dy * dy <= auraRadiusSq) {
          const healDelta = Math.min(BOT.HP - ally.hp, healRate * auraDt, bot.medicBagSupply ?? 600);
          ally.hp = Math.min(BOT.HP, ally.hp + healDelta);
          bot.medicBagSupply = Math.max(0, (bot.medicBagSupply ?? 600) - healDelta);
          bot.score = (bot.score || 0) + 6 * auraDt;
          if (Math.random() < 0.45) {
            this.world.spawnDebris(
              tmpVec3(ally.pos.x, ally.pos.y + 0.95, ally.pos.z),
              REVIVE_PARTICLE_COLOR,
              1
            );
          }
        }
      });
    } else if ((bot.medicBagSupply ?? 600) > 0) {
      const friendlyList =
        this.aliveByTeam && this.aliveByTeam[bot.team] ? this.aliveByTeam[bot.team] : this.bots;
      for (let i = 0; i < friendlyList.length; i++) {
        if ((bot.medicBagSupply ?? 600) <= 0) break;
        const ally = friendlyList[i];
        if (ally === bot || ally.dead || ally.downed || ally.team !== bot.team || ally.hp >= BOT.HP) {
          continue;
        }
        const dSq = bot.pos.distanceToSquared(ally.pos);
        if (dSq <= auraRadiusSq) {
          const healDelta = Math.min(BOT.HP - ally.hp, healRate * auraDt, bot.medicBagSupply ?? 600);
          ally.hp = Math.min(BOT.HP, ally.hp + healDelta);
          bot.medicBagSupply = Math.max(0, (bot.medicBagSupply ?? 600) - healDelta);
          bot.score = (bot.score || 0) + 6 * auraDt;
        }
      }
    }
  }
  const activelyTreatingClose = Boolean(bot._activelyTreatingClose);

  // 2. Validate existing active injury heal target (`bot.healTarget`)
  if (bot.healTarget) {
    if (bot.healTarget === 'PLAYER') {
      if (player.dead || player.downed || (player.hp >= 100 && !player.bleeding)) {
        bot.healTarget = null;
      }
    } else if (
      bot.healTarget.dead ||
      bot.healTarget.downed ||
      bot.healTarget.hp >= BOT.HP
    ) {
      bot.healTarget = null;
    }
  }

  // 3. Scan for an injured Player (up to 60m) or injured friendly soldier (up to 38m) to run & heal
  bot._healScanTimer = (bot._healScanTimer || 0) - dt;
  if (!bot.healTarget && (bot.postReviveTimer || 0) <= 0 && bot._healScanTimer <= 0) {
    bot._healScanTimer = 0.45 + Math.random() * 0.25;
    const maxPlayerHealRangeSq = (BOT.MEDIC_HEAL_RANGE || 60) * (BOT.MEDIC_HEAL_RANGE || 60);

    if (
      player &&
      !player.dead &&
      !player.downed &&
      player.team === bot.team &&
      (player.hp < 100 || player.bleeding)
    ) {
      const dpSq = bot.pos.distanceToSquared(player.pos);
      if (dpSq <= maxPlayerHealRangeSq) {
        bot.healTarget = 'PLAYER';
        this.emitBotComms(
          bot,
          player,
          `Hang tight ${player.name}! Medic moving in to heal your injuries to 100 HP!`,
          'MEDIC',
          false
        );
      }
    }

    if (!bot.healTarget) {
      let bestAlly = null;
      let bestDistSq = 38 * 38;
      const friendlyGrid = this.teamGrid && this.teamGrid[bot.team];
      if (friendlyGrid) {
        friendlyGrid.forEachRingOrder(bot.pos.x, bot.pos.z, 38, (ally, dSq2D) => {
          if (
            ally === bot ||
            ally.dead ||
            ally.downed ||
            ally.drivingVehicle ||
            ally.team !== bot.team ||
            ally.hp >= 88
          ) {
            return;
          }
          const dy = ally.pos.y - bot.pos.y;
          const dSq = dSq2D + dy * dy;
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            bestAlly = ally;
          }
        });
      } else {
        const friendlyList =
          this.aliveByTeam && this.aliveByTeam[bot.team] ? this.aliveByTeam[bot.team] : this.bots;
        for (let i = 0; i < friendlyList.length; i++) {
          const ally = friendlyList[i];
          if (ally === bot || ally.dead || ally.downed || ally.team !== bot.team || ally.hp >= 88) {
            continue;
          }
          const dSq = bot.pos.distanceToSquared(ally.pos);
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            bestAlly = ally;
          }
        }
      }
      if (bestAlly) {
        bot.healTarget = bestAlly;
      }
    }
  }

  if (!bot.healTarget) {
    return false;
  }

  // 4. Move toward the injured patient and kneel beside them until their HP reaches 100/100!
  const targetPos = bot.healTarget === 'PLAYER' ? player.pos : bot.healTarget.pos;
  const distToPatient = Math.hypot(targetPos.x - bot.pos.x, targetPos.z - bot.pos.z);

  if (distToPatient <= 3.6 || activelyTreatingClose) {
    // Kneel beside the wounded soldier and channel Field Medkit until 100% healed
    bot.animPhase += dt * 10;
    bot.yaw = Math.atan2(targetPos.x - bot.pos.x, targetPos.z - bot.pos.z);
    bot.mesh.rotation.y = bot.yaw;
    parts.pelvisGroup.position.y = 0.56;
    parts.upperBody.position.y = 0.56;
    parts.upperBody.rotation.set(0.42 + Math.sin(bot.animPhase) * 0.06, 0, 0);
    parts.headGroup.rotation.set(0.22, 0, 0);
    parts.weaponRig.rotation.set(0.58 + Math.cos(bot.animPhase) * 0.1, 0, 0);
    parts.leftLeg.rotation.x = -0.72;
    parts.rightLeg.rotation.x = -0.32;
    parts.leftShin.rotation.x = 1.25;
    parts.rightShin.rotation.x = 0.85;
    return true;
  }

  // Sprint toward the injured teammate / player to treat their wounds
  const toPatient = tmpVec3(targetPos.x - bot.pos.x, 0, targetPos.z - bot.pos.z).normalize();
  const spd = BOT.SPEED_APPROACH_FAST || 6.4;
  const nx = bot.pos.x + toPatient.x * spd * dt;
  const nz = bot.pos.z + toPatient.z * spd * dt;
  if (!this.isPointBlocked(nx, bot.pos.y, nz, 0.48)) {
    bot.pos.x = nx;
    bot.pos.z = nz;
  } else if (!this.isPointBlocked(nx, bot.pos.y, bot.pos.z, 0.48)) {
    bot.pos.x = nx;
  } else if (!this.isPointBlocked(bot.pos.x, bot.pos.y, nz, 0.48)) {
    bot.pos.z = nz;
  }
  bot.pos.y = this.world.getGroundHeightAt(bot.pos.x, bot.pos.z);
  bot.yaw = Math.atan2(toPatient.x, toPatient.z);
  bot.mesh.rotation.y = bot.yaw;
  bot.animPhase += dt * 14;
  parts.pelvisGroup.position.y = 0.76 + Math.abs(Math.sin(bot.animPhase)) * 0.05;
  parts.upperBody.position.y = parts.pelvisGroup.position.y;
  parts.upperBody.rotation.set(0.25, Math.sin(bot.animPhase) * 0.1, 0);
  parts.leftLeg.rotation.x = Math.sin(bot.animPhase) * 0.8;
  parts.rightLeg.rotation.x = -Math.sin(bot.animPhase) * 0.8;
  parts.leftShin.rotation.x = Math.max(0, -Math.cos(bot.animPhase) * 0.95);
  parts.rightShin.rotation.x = Math.max(0, Math.cos(bot.animPhase) * 0.95);
  return true;
}

export const MedicAIMethods = {
  clearBotRescueLinks,
  findImmediateRescueThreat,
  spawnRescueSmoke,
  reviveBot,
  computeSafeDragSpot,
  findExistingWallCoverWithinRadius,
  buildRescueCoverWall,
  isRescuerUnderEnemyFire,
  findNearestDownedFriendly,
  updateMedicRescue,
  updateMedicInjuryHeal
};
