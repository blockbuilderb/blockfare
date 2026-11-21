import * as THREE from '../../vendor/three.module.js';
import { BOT } from '../config.js?v=35';
import { tmpVec3 } from '../utils/VectorPool.js?v=35';

const REVIVE_PARTICLE_COLOR = new THREE.Color(0x2ecc71);

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
  bot.rescueTimer = 0;
  bot.assessTimer = 0;
  bot.smokePoppedForRescue = false;
  bot.assessedLogged = false;
  bot.assessThreatEnemy = null;
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
    bot.rescuer.assessThreatEnemy = null;
    bot.rescuer = null;
  }
}

/**
 * Scans for immediate enemy threats near either the rescuing Medic (`medicRange`)
 * or the downed casualty (`casualtyRange`). Medics use this to assess the situation
 * and neutralize/suppress nearby threats before rushing out to drag/revive.
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
        bestThreat = {
          isVehicle: true,
          pos: player.activeVehicle.pos,
          unit: player.activeVehicle,
          distSq: dMedicSq
        };
      } else {
        bestThreat = { isPlayer: true, pos: player.pos, unit: player, distSq: dMedicSq };
      }
    }
  }

  for (let i = 0; i < this.bots.length; i++) {
    const other = this.bots[i];
    if (other.dead || other.downed || other.drivingVehicle || other.team === bot.team) continue;
    const dMedicSq = bot.pos.distanceToSquared(other.pos);
    const dCasSq = targetPos.distanceToSquared(other.pos);
    if (dMedicSq <= medicRangeSq || dCasSq <= casualtyRangeSq) {
      const minSq = Math.min(dMedicSq, dCasSq);
      if (minSq < bestScoreSq && this.canBotSeeTarget(bot, other.id, other.pos, false)) {
        bestScoreSq = minSq;
        bestThreat = { isPlayer: false, pos: other.pos, unit: other, distSq: dMedicSq };
      }
    }
  }

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
  const puffGeo = new THREE.BoxGeometry(1.5, 1.3, 1.5);
  const puffMat = new THREE.MeshLambertMaterial({
    color: 0xdce3e8,
    transparent: true,
    opacity: 0.68
  });

  const puffs = [];
  for (let i = 0; i < 7; i++) {
    const mesh = new THREE.Mesh(puffGeo, puffMat.clone());
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

export function reviveBot(bot) {
  if (!bot || (!bot.downed && !bot.dead)) return false;
  this.clearBotRescueLinks(bot);
  bot.downed = false;
  bot.dead = false;
  bot.hp = BOT.REVIVE_HP;
  bot.bleedOutTimer = 0;
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
 * Computes a safer cover position 5m-8m away from the killzone (behind nearby voxel walls/sandbags
 * or toward friendly territory) so rescuers physically drag fallen comrades to safety before reviving.
 */
export function computeSafeDragSpot(downedPos, team) {
  const retreatDirX = team === 'US' ? -1 : 1;
  const bestPos = new THREE.Vector3(
    downedPos.x + retreatDirX * 5.5,
    downedPos.y,
    downedPos.z + (Math.random() - 0.5) * 3.0
  );
  let bestScore = -999;

  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2;
    const dist = 4.8 + (i % 2) * 2.2;
    const cx = downedPos.x + Math.cos(angle) * dist;
    const cz = downedPos.z + Math.sin(angle) * dist;
    const cy = this.world.getGroundHeightAt(cx, cz);

    if (this.isPointBlocked(cx, cy, cz)) continue;

    // Score higher if retreating toward friendly side AND if adjacent to a protective wall/sandbag voxel
    let score = Math.cos(angle) * retreatDirX * 2.5;
    const g = this.world.worldToGrid(cx, cy + 0.8, cz);
    const adjDirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ];
    for (const [dx, dz] of adjDirs) {
      if (this.world.voxels.has(this.world.key(g.gx + dx, g.gy, g.gz + dz))) {
        score += 4.0; // Next to solid cover!
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

export function findNearestDownedFriendly(pos, team, maxDist = 3.8) {
  let best = null;
  let bestDistSq = maxDist * maxDist;
  for (const b of this.bots) {
    if (b.team !== team || !b.downed || b.dead) continue;
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
  const parts = bot.mesh.userData.parts;
  bot.assessThreatEnemy = null;

  // Validate existing rescue target
  if (bot.rescueTarget) {
    if (bot.rescueTarget === 'PLAYER') {
      if (!player.downed || player.dead) {
        bot.rescueTarget = null;
        bot.rescueState = null;
      }
    } else if (
      bot.rescueTarget.dead ||
      !bot.rescueTarget.downed ||
      (bot.rescueTarget.rescuer && bot.rescueTarget.rescuer !== bot) ||
      player.reviveTargetBot === bot.rescueTarget
    ) {
      this.clearBotRescueLinks(bot);
    }
  }

  // Look for a nearby downed friendly comrade (Player or AI Soldier) to rescue
  if (!bot.rescueTarget && (bot.postReviveTimer || 0) <= 0) {
    const isMedic = bot.role === 'MEDIC';
    const maxRescueRange = isMedic ? BOT.RESCUE_RANGE_MEDIC : BOT.RESCUE_RANGE_OTHER;
    let bestTarget = null;
    let bestDistSq = maxRescueRange * maxRescueRange;

    if (
      player.downed &&
      !player.dead &&
      bot.team === player.team &&
      (isMedic || bot.inPlayerSquad)
    ) {
      const dpSq = bot.pos.distanceToSquared(player.pos);
      if (dpSq < bestDistSq) {
        bestDistSq = dpSq;
        bestTarget = 'PLAYER';
      }
    }

    for (let i = 0; i < this.bots.length; i++) {
      const ally = this.bots[i];
      if (ally === bot || ally.team !== bot.team || !ally.downed || ally.dead) continue;
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
      if (bestTarget !== 'PLAYER' && bestTarget.rescuer && bestTarget.rescuer !== bot) {
        bestTarget.rescuer.rescueTarget = null;
        bestTarget.rescuer.rescueState = null;
      }
      bot.rescueTarget = bestTarget;
      // Always start by ASSESSING the combat situation around the casualty first!
      bot.rescueState = 'ASSESS_THREAT';
      bot.assessTimer = isMedic ? 1.45 : 1.1;
      bot.smokePoppedForRescue = false;
      bot.assessedLogged = false;
      bot.rescueTimer = 0;
      if (bestTarget !== 'PLAYER') {
        bestTarget.rescuer = bot;
      }
    }
  }

  // Execute Active Rescue State Machine (ASSESS_THREAT -> APPROACH -> DRAG -> REVIVE)
  if (!bot.rescueTarget) {
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
      bot.rescueState = 'ASSESS_THREAT';
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
      bot.rescueState = 'APPROACH';
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
        bot.rescueState = 'APPROACH';
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
      // Reached the fallen comrade! Compute a safe cover spot and begin dragging them!
      bot.rescueState = 'DRAG';
      bot.rescueTimer = BOT.DRAG_TIMER; // Drag for up to 1.75s toward cover
      bot.dragGoalPos.copy(this.computeSafeDragSpot(targetPos, bot.team));
      this.emitBotComms(
        bot,
        player,
        `Got your vest ${targetName}, dragging you behind cover!`,
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
      const spd = distantThreat ? BOT.SPEED_APPROACH_SLOW : BOT.SPEED_APPROACH_FAST;
      const nx = bot.pos.x + toDowned.x * spd * dt;
      const nz = bot.pos.z + toDowned.z * spd * dt;
      if (!this.isPointBlocked(nx, bot.pos.y, nz)) {
        bot.pos.x = nx;
        bot.pos.z = nz;
      } else {
        bot.pos.x += -toDowned.z * spd * dt;
        bot.pos.z += toDowned.x * spd * dt;
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
      bot.rescueState = 'REVIVE';
      bot.rescueTimer = bot.role === 'MEDIC' ? BOT.MEDIC_REVIVE_TIME : BOT.NON_MEDIC_REVIVE_TIME;
    } else {
      toSafe.normalize();
      const dragSpeed = BOT.DRAG_SPEED;
      const nx = bot.pos.x + toSafe.x * dragSpeed * dt;
      const nz = bot.pos.z + toSafe.z * dragSpeed * dt;
      if (!this.isPointBlocked(nx, bot.pos.y, nz)) {
        bot.pos.x = nx;
        bot.pos.z = nz;
        bot.pos.y = this.world.getGroundHeightAt(bot.pos.x, bot.pos.z);

        // Pull the wounded soldier along the ground right in front of the rescuer!
        const dragTrailX = bot.pos.x - toSafe.x * 1.05;
        const dragTrailZ = bot.pos.z - toSafe.z * 1.05;
        const dragTrailY = this.world.getGroundHeightAt(dragTrailX, dragTrailZ);
        if (bot.rescueTarget === 'PLAYER') {
          player.pos.set(dragTrailX, dragTrailY, dragTrailZ);
          player.downedTimer = Math.max(player.downedTimer, 8.0);
        } else {
          bot.rescueTarget.pos.set(dragTrailX, dragTrailY + 0.22, dragTrailZ);
          bot.rescueTarget.mesh.rotation.y = Math.atan2(toSafe.x, toSafe.z);
        }
      } else {
        // Reached a wall/cover block — immediately start reviving right behind it!
        bot.rescueState = 'REVIVE';
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
    bot.rescueTimer -= dt;
    bot.animPhase += dt * 12;
    if (bot.rescueTarget !== 'PLAYER' && bot.rescueTarget.bleedOutTimer !== undefined) {
      bot.rescueTarget.bleedOutTimer = Math.max(bot.rescueTarget.bleedOutTimer, 4.0);
    }

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
      bot.revives = (bot.revives || 0) + 1;
      bot.score += 200;
      if (this.onTelemetryEvent) {
        this.onTelemetryEvent('REVIVE_COMPLETE', {
          medic: bot.name,
          role: bot.role,
          team: bot.team,
          casualty: targetName
        });
      }
      if (bot.rescueTarget === 'PLAYER') {
        player.reviveFromDowned(bot.name);
      } else {
        const savedBot = bot.rescueTarget;
        this.reviveBot(savedBot);
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

export const MedicAIMethods = {
  clearBotRescueLinks,
  findImmediateRescueThreat,
  spawnRescueSmoke,
  reviveBot,
  computeSafeDragSpot,
  findNearestDownedFriendly,
  updateMedicRescue
};
