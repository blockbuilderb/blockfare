import * as THREE from '../../vendor/three.module.js';
import { sound } from '../audio.js?v=35';
import { BOT } from '../config.js?v=35';
import { tmpVec3, tmpVec3Copy } from '../utils/VectorPool.js?v=35';

const BACKBLAST_COLOR = new THREE.Color(0x95a5a6);

export function spawnTracer(start, end, color = 0xffeaa7) {
  if (this.tracers.length > 90) return;
  const points = [start.clone(), end.clone()];
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.85
  });
  const line = new THREE.Line(geo, mat);
  this.scene.add(line);
  this.tracers.push({ line, life: 0.075 });
}

export function update(dt, player, onKillFn, onTicketBleedFn, vehicleManager = null, onAwardXp = null) {
  // 1. Update Contested / Overrun Base states (Main Bases + Forward Flags A-E)
  this.updateContestedBases(player, onAwardXp);

  // 2. Update Bullet Tracers & 3D Medic Smoke Screens
  for (let i = this.tracers.length - 1; i >= 0; i--) {
    const t = this.tracers[i];
    t.life -= dt;
    if (t.life <= 0) {
      this.scene.remove(t.line);
      t.line.geometry.dispose();
      t.line.material.dispose();
      this.tracers.splice(i, 1);
    }
  }

  for (let i = this.smokeClouds.length - 1; i >= 0; i--) {
    const sc = this.smokeClouds[i];
    sc.life -= dt;
    if (sc.life <= 0) {
      this.scene.remove(sc.group);
      for (const p of sc.puffs) {
        p.geometry.dispose();
        p.material.dispose();
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

  for (let bIdx = 0; bIdx < this.bots.length; bIdx++) {
    const bot = this.bots[bIdx];
    bot._raycastsThisFrame = 0;
    const parts = bot.mesh.userData.parts;
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

    // Suppression decay (Squad-style)
    if (bot.suppressionLevel > 0) {
      bot.suppressionLevel = Math.max(0, bot.suppressionLevel - 0.5 * dt);
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
        bot.hp = BOT.HP;
        bot.hasHelmet = true;
        bot.armorHp = BOT.ARMOR_HP;
        bot.postReviveTimer = 0;
        bot.standUpProgress = 1.0;
        bot.weaponReadyTimer = 0;
        bot.aimRaiseProgress = 0.25;
        bot.transitionState = 'ACTIVE';
        parts.helmet.visible = true;
        bot.mesh.rotation.set(0, bot.yaw, 0);
        const spawnInfo = this.pickSpawnPosition(bot.team, bot.squad, true);
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
        bot.mesh.visible = true;
      } else {
        bot.pos.copy(bot.drivingVehicle.pos);
        bot.mesh.visible = false;
        continue;
      }
    }

    // Downed / Wounded Crawling Animation on Ground
    if (bot.downed) {
      // Pause bleed-out while a Medic, Teammate, or Player is actively dragging/reviving this soldier!
      const beingSavedByBot =
        bot.rescuer &&
        !bot.rescuer.dead &&
        !bot.rescuer.downed &&
        (bot.rescuer.rescueState === 'DRAG' || bot.rescuer.rescueState === 'REVIVE');
      const beingSavedByPlayer =
        player.draggedBot === bot ||
        (player.reviveTargetBot === bot && player.keys && player.keys['KeyF']);
      if (!beingSavedByBot && !beingSavedByPlayer) {
        bot.bleedOutTimer -= dt;
      }

      bot.animPhase += dt * 2.5;
      const gY = this.world.getGroundHeightAt(bot.pos.x, bot.pos.z);
      bot.pos.y = gY + 0.22;
      bot.mesh.rotation.x = -Math.PI / 2;
      parts.pelvisGroup.rotation.y = 0;
      parts.upperBody.position.y = 0.78;
      parts.upperBody.rotation.set(0.15, Math.sin(bot.animPhase) * 0.12, 0);
      parts.headGroup.rotation.set(0.35, Math.sin(bot.animPhase * 0.8) * 0.35, 0);
      parts.leftLeg.rotation.x = Math.sin(bot.animPhase) * 0.25;
      parts.rightLeg.rotation.x = -Math.sin(bot.animPhase) * 0.25;
      parts.leftShin.rotation.x = 0.45;
      parts.rightShin.rotation.x = 0.35;
      if (parts.muzzleFlash) parts.muzzleFlash.material.opacity = 0;

      if (bot.bleedOutTimer <= 0) {
        this.clearBotRescueLinks(bot);
        bot.downed = false;
        bot.dead = true;
        bot.respawnTimer = BOT.RESPAWN_TIMER;
        bot.mesh.visible = false;
        bot.mesh.rotation.x = 0;
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

    // Enforce active Player / Squad Leader / Commander Objective Order if set
    if (bot.playerOrderTimer > 0 && bot.playerOrderMode === 'OBJECTIVE' && bot.playerOrderFlagIndex >= 0) {
      bot.targetFlagIndex = bot.playerOrderFlagIndex;
    }

    bot.rethinkTimer -= dt;
    if (bot.rethinkTimer <= 0) {
      bot.rethinkTimer = BOT.RETHINK_TIMER_BASE + Math.random() * BOT.RETHINK_TIMER_RAND;
      if (bot.playerOrderTimer > 0 && bot.playerOrderMode === 'OBJECTIVE' && bot.playerOrderFlagIndex >= 0) {
        bot.targetFlagIndex = bot.playerOrderFlagIndex;
      } else if (!bot.isSquadLeader) {
        // Squad Members follow their Squad Leader's assigned objective so the 8-man Squad fights together!
        const squadLeaderBot = this.bots.find(
          (b) => b.team === bot.team && b.squad === bot.squad && b.isSquadLeader
        );
        if (squadLeaderBot && typeof squadLeaderBot.targetFlagIndex === 'number') {
          bot.targetFlagIndex = squadLeaderBot.targetFlagIndex;
        }
      } else {
        // Autonomous AI Squad Leader selects the best unowned/contested objective for their squad
        const candidateFlags = this.world.flags
          .map((f, idx) => ({ f, idx }))
          .filter((item) => item.f.owner !== bot.team);
        if (candidateFlags.length > 0) {
          const pick = candidateFlags[Math.floor(Math.random() * candidateFlags.length)];
          bot.targetFlagIndex = pick.idx;
        } else {
          bot.targetFlagIndex = Math.floor(Math.random() * this.world.flags.length);
        }
      }
      const fPos = this.world.flags[bot.targetFlagIndex].pos;
      const rawX = fPos.x + (Math.random() - 0.5) * 22;
      const rawZ = fPos.z + (Math.random() - 0.5) * 22;
      const safeGoal = this.world.pushOutOfBuildingFootprint(rawX, rawZ, 2.2);
      bot.waypointOffset.set(safeGoal.x - fPos.x, 0, safeGoal.z - fPos.z);
    }

    // =======================================================================
    // PHYSICAL BASE VEHICLE SEEKING & BOARDING (BRAVO Armor Squad prioritizes crewing Tanks/IFVs/Cars!)
    // =======================================================================
    let seekingVehicle = null;
    if (vehicleManager && vehicleManager.vehicles && !bot.rescueTarget) {
      const isBravoArmorCrew = bot.squad === 'BRAVO';
      const seekRangeSq = isBravoArmorCrew
        ? BOT.VEHICLE_SEEK_RANGE_BRAVO * BOT.VEHICLE_SEEK_RANGE_BRAVO
        : BOT.VEHICLE_SEEK_RANGE_OTHER * BOT.VEHICLE_SEEK_RANGE_OTHER;
      let bestVehDistSq = seekRangeSq;
      for (const veh of vehicleManager.vehicles) {
        if (veh.dead || veh.driver || veh.npcDriver || veh.team !== bot.team) continue;
        const dSq = bot.pos.distanceToSquared(veh.pos);
        if (dSq >= bestVehDistSq) continue;
        // Check if another closer friendly bot (or a BRAVO Armor Squad crewman) is already sprinting to claim this vehicle
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

      if (seekingVehicle) {
        seekingVehicle.claimedByBot = bot;
        if (bestVehDistSq <= BOT.VEHICLE_BOARD_DISTANCE * BOT.VEHICLE_BOARD_DISTANCE) {
          // NPC has reached the vehicle at the Base Motor Pool -> Climb Inside & Drive!
          seekingVehicle.npcDriver = bot;
          seekingVehicle.claimedByBot = null;
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
    }

    // =======================================================================
    // ANTI-ARMOR TARGETING (ENGINEER RPG-7 SQUADS HUNTING TANKS & ARMORED CARS)
    // =======================================================================
    if (bot.rpgCooldown > 0) {
      bot.rpgCooldown -= dt;
    }

    let nearestArmor = null;
    let nearestArmorDistSq = BOT.ENGAGE_RANGE_RPG_CHECK * BOT.ENGAGE_RANGE_RPG_CHECK;
    if (bot.role === 'ENGINEER' && vehicleManager && vehicleManager.vehicles) {
      for (const veh of vehicleManager.vehicles) {
        if (veh.dead || veh.team === bot.team) continue;
        // Engineers prioritize enemy armor that is actively driven by the Player or an NPC
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

    // Toggle shoulder-mounted RPG-7 launcher mesh when hunting enemy armor
    const shouldUseRpg = Boolean(nearestArmor && nearestArmorDistSq < BOT.ENGAGE_RANGE_RPG_TOGGLE * BOT.ENGAGE_RANGE_RPG_TOGGLE);
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

    // Find nearest VISIBLE enemy (up to 115m engagement range, strictly respecting building walls & thin gaps!)
    bot._raycastsThisFrame = 0;
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
      nearestEnemy = { isVehicle: true, pos: nearestArmor.pos, unit: nearestArmor };
    } else if (
      bot._targetScanTimer > 0 &&
      bot._cachedEnemy &&
      bot._cachedEnemy.unit &&
      !bot._cachedEnemy.unit.dead &&
      !bot._cachedEnemy.unit.downed &&
      !bot._cachedEnemy.unit.drivingVehicle
    ) {
      nearestEnemy = bot._cachedEnemy;
      nearestDistSq = bot.pos.distanceToSquared(nearestEnemy.pos);
    } else {
      bot._targetScanTimer = 0.16 + Math.random() * 0.14;
      if (!player.dead && !player.downed && player.team !== bot.team) {
        const dSq = bot.pos.distanceToSquared(player.pos);
        if (player.activeVehicle && !player.activeVehicle.dead) {
          if (
            dSq < BOT.COMBAT_RANGE_VEHICLE * BOT.COMBAT_RANGE_VEHICLE &&
            dSq < nearestDistSq &&
            this.canBotSeeTarget(bot, 'PLAYER_VEH', player.activeVehicle.pos, true)
          ) {
            nearestDistSq = dSq;
            nearestEnemy = {
              isVehicle: true,
              pos: player.activeVehicle.pos,
              unit: player.activeVehicle
            };
          }
        } else if (
          dSq < nearestDistSq &&
          this.canBotSeeTarget(bot, 'PLAYER', player.pos, true)
        ) {
          nearestDistSq = dSq;
          nearestEnemy = { isPlayer: true, pos: player.pos, unit: player };
        }
      }

      for (let i = 0; i < this.bots.length; i++) {
        const other = this.bots[i];
        if (other.dead || other.downed || other.drivingVehicle || other.team === bot.team) continue;
        const dSq = bot.pos.distanceToSquared(other.pos);
        if (dSq < nearestDistSq && this.canBotSeeTarget(bot, other.id, other.pos, true)) {
          nearestDistSq = dSq;
          nearestEnemy = { isPlayer: false, pos: other.pos, unit: other };
        }
      }
      bot._cachedEnemy = nearestEnemy;
    }

    const targetFlag = this.world.flags[bot.targetFlagIndex];
    const goal = seekingVehicle
      ? tmpVec3Copy(seekingVehicle.pos)
      : tmpVec3Copy(targetFlag.pos).add(bot.waypointOffset);

    if (!seekingVehicle && bot.playerOrderTimer > 0 && !player.dead) {
      if (bot.playerOrderMode === 'FOLLOW') {
        goal.copy(player.pos).add(bot.waypointOffset);
      } else if (bot.playerOrderMode === 'HOLD') {
        goal.copy(bot.playerOrderPos).add(bot.waypointOffset);
      }
    }

    // Squad Cohesion: Non-leader squadmates stay grouped around their own Squad Leader (within 3m–6m)
    // so each 8-man Squad (ALPHA, BRAVO, CHARLIE, DELTA, ECHO) stands by itself as a distinct unit!
    let squadLeaderBot = null;
    if (!seekingVehicle && !bot.isSquadLeader) {
      for (let sIdx = 0; sIdx < this.bots.length; sIdx++) {
        const cand = this.bots[sIdx];
        if (
          cand.team === bot.team &&
          cand.squad === bot.squad &&
          cand.isSquadLeader &&
          !cand.dead &&
          !cand.downed &&
          !cand.drivingVehicle
        ) {
          squadLeaderBot = cand;
          break;
        }
      }
      if (squadLeaderBot && bot.memberClusterOffset && squadLeaderBot.pos.distanceTo(goal) < 55) {
        goal.copy(squadLeaderBot.pos).add(bot.memberClusterOffset);
      }
    }

    // Ensure goal coordinate never lies inside a building or container footprint!
    if (!seekingVehicle && this.world.pushOutOfBuildingFootprint) {
      const safeGoal = this.world.pushOutOfBuildingFootprint(goal.x, goal.z, 2.2);
      goal.x = safeGoal.x;
      goal.z = safeGoal.z;
    }

    // Autonomous Contextual Proximity & Squad Teammate Callouts
    if (bot.team === player.team && !player.dead && bot.chatCooldown <= 0 && this.globalCommsCooldown <= 0) {
      const distToPlayer = bot.pos.distanceTo(player.pos);
      if (distToPlayer <= 45 || bot.inPlayerSquad) {
        if (bot.suppressionLevel > 0.45) {
          this.emitBotComms(bot, player, 'Taking heavy suppressive fire! Pinned down here!', 'URGENT');
        } else if (nearestEnemy && nearestEnemy.isVehicle && nearestDistSq < BOT.ENGAGE_RANGE_INFANTRY * BOT.ENGAGE_RANGE_INFANTRY) {
          const cDir = this.getCompassDirection(
            nearestEnemy.pos.x - bot.pos.x,
            nearestEnemy.pos.z - bot.pos.z
          );
          const vType = nearestEnemy.unit && nearestEnemy.unit.type ? nearestEnemy.unit.type.toUpperCase() : 'ARMOR';
          this.emitBotComms(
            bot,
            player,
            `Enemy ${vType} spotted ${cDir} (${Math.round(Math.sqrt(nearestDistSq))}m)! Watch for armor!`,
            'COMBAT'
          );
        } else if (nearestEnemy && nearestDistSq < BOT.COMBAT_RANGE_INFANTRY * BOT.COMBAT_RANGE_INFANTRY) {
          const cDir = this.getCompassDirection(
            nearestEnemy.pos.x - bot.pos.x,
            nearestEnemy.pos.z - bot.pos.z
          );
          const eRole = nearestEnemy.unit && nearestEnemy.unit.role ? nearestEnemy.unit.role : 'INFANTRY';
          this.emitBotComms(
            bot,
            player,
            `Contact ${cDir}, ${Math.round(Math.sqrt(nearestDistSq))}m! Engaging enemy ${eRole}!`,
            'COMBAT'
          );
        } else if (bot.playerOrderTimer > 0 && bot.playerOrderMode === 'FOLLOW' && distToPlayer < 16) {
          this.emitBotComms(bot, player, 'Right on your six Lead, watching your flank!', 'ORDER');
        } else if (bot.pos.distanceTo(targetFlag.pos) < 24 && targetFlag.owner !== bot.team) {
          this.emitBotComms(bot, player, `Pushing Objective ${targetFlag.id}, cover me!`, 'OBJECTIVE');
        }
      }
    }

    // Route across the nearest of the 3 grand river bridges (-110, 0, +110) when crossing the river
    if (!seekingVehicle && Math.sign(bot.pos.x) !== Math.sign(goal.x) && Math.abs(bot.pos.x) < 28) {
      const nearestBridgeZ = Math.abs(bot.pos.z) < 55 ? 0 : bot.pos.z > 0 ? 110 : -110;
      goal.x = Math.sign(goal.x) * 4;
      goal.z = nearestBridgeZ;
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
        if (Math.random() < 0.25) {
          const styles = ['ANCHOR_CROUCH', 'COVER_PEEK', 'ADVANCE_PAUSE', 'FLANK_RUSH', 'HOLD_STAND'];
          bot.tactic = styles[Math.floor(Math.random() * styles.length)];
        }
      }

      const toEnemy = tmpVec3Copy(nearestEnemy.pos).sub(bot.pos);
      toEnemy.y = 0;
      toEnemy.normalize();
      const perp = tmpVec3(-toEnemy.z * bot.strafeDir, 0, toEnemy.x * bot.strafeDir);

      if (bot.tactic === 'ANCHOR_CROUCH') {
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
        desiredSpeed = BOT.SPEED_PATROL;
      } else {
        // Hold cohesive Squad overwatch formation using active spacing mode (STAY_CLOSE vs FAN_OUT)!
        bot.isCrouching = isFollowOrHold && bot.role !== 'MEDIC';
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
    // BUILDING EXTERIOR REPULSION, 8-ANGLE FAN WHISKERS & ANTI-STUCK WATCHDOG
    // =======================================================================
    if (this.world.isInsideBuildingOrContainer && this.world.isInsideBuildingOrContainer(bot.pos.x, bot.pos.z, 1.35)) {
      const pushedOut = this.world.pushOutOfBuildingFootprint(bot.pos.x, bot.pos.z, 1.9);
      bot.pos.x = pushedOut.x;
      bot.pos.z = pushedOut.z;
    }

    if (bot.avoidanceTimer > 0) {
      bot.avoidanceTimer = Math.max(0, bot.avoidanceTimer - dt);
    }

    // 8-Angle Fan Whisker Obstacle Avoidance so bots smoothly navigate around wide buildings & HESCO walls
    if (desiredSpeed > 0.1) {
      const baseAngle = Math.atan2(desiredDir.x, desiredDir.z);
      const centerBlockedNear = this.isPointBlocked(
        bot.pos.x + Math.sin(baseAngle) * 1.7,
        bot.pos.y,
        bot.pos.z + Math.cos(baseAngle) * 1.7
      );
      const centerBlockedFar = this.isPointBlocked(
        bot.pos.x + Math.sin(baseAngle) * 3.1,
        bot.pos.y,
        bot.pos.z + Math.cos(baseAngle) * 3.1
      );

      if (centerBlockedNear || centerBlockedFar) {
        const sign = bot.avoidanceSign || 1;
        const fanOffsets = [
          0.48 * sign,
          -0.48 * sign,
          0.92 * sign,
          -0.92 * sign,
          1.38 * sign,
          -1.38 * sign,
          1.85 * sign,
          -1.85 * sign
        ];
        let chosenAngle = baseAngle + 1.55 * sign;
        for (let fIdx = 0; fIdx < fanOffsets.length; fIdx++) {
          const testAngle = baseAngle + fanOffsets[fIdx];
          const nearClear = !this.isPointBlocked(
            bot.pos.x + Math.sin(testAngle) * 1.75,
            bot.pos.y,
            bot.pos.z + Math.cos(testAngle) * 1.75
          );
          const farClear = !this.isPointBlocked(
            bot.pos.x + Math.sin(testAngle) * 3.1,
            bot.pos.y,
            bot.pos.z + Math.cos(testAngle) * 3.1
          );
          if (nearClear && farClear) {
            chosenAngle = testAngle;
            if (bot.avoidanceTimer <= 0) {
              bot.avoidanceSign = Math.sign(fanOffsets[fIdx]) || 1;
              bot.avoidanceTimer = 1.4;
            }
            break;
          }
        }
        desiredDir.set(Math.sin(chosenAngle), 0, Math.cos(chosenAngle));
      }
    }

    // Smooth Acceleration & Deceleration (natural momentum, zero robotic snapping)
    const targetVelX = desiredDir.x * desiredSpeed;
    const targetVelZ = desiredDir.z * desiredSpeed;
    const accelRate = Math.min(1, dt * 8.5);
    bot.velX += (targetVelX - bot.velX) * accelRate;
    bot.velZ += (targetVelZ - bot.velZ) * accelRate;

    const actualSpeed = Math.hypot(bot.velX, bot.velZ);

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
      } else if (!entersBuilding && blockedLow && !blockedHigh && !blockedAbove && bot.isGrounded) {
        // Only vault over genuine 1-block low sandbag walls in open terrain (never into windows!)
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
    if (desiredSpeed > 2.2 && !inCombat && !bot.rescueTarget && (bot.postReviveTimer || 0) <= 0) {
      bot.stuckTimer = (bot.stuckTimer || 0) + dt;
      if (bot.stuckTimer >= 0.85) {
        const movedDist = Math.hypot(
          bot.pos.x - bot.lastProgressPos.x,
          bot.pos.z - bot.lastProgressPos.z
        );
        bot.lastProgressPos.copy(bot.pos);
        bot.stuckTimer = 0;

        if (movedDist < 0.95) {
          bot.stuckCount = (bot.stuckCount || 0) + 1;
          bot.avoidanceSign = -(bot.avoidanceSign || 1);
          bot.avoidanceTimer = 1.6;
          if (bot.stuckCount >= 2) {
            // Relocate cleanly to the nearest open street coordinate in the desired direction
            const stepOutX = bot.pos.x + desiredDir.x * 4.5 + (Math.random() - 0.5) * 3.0;
            const stepOutZ = bot.pos.z + desiredDir.z * 4.5 + (Math.random() - 0.5) * 3.0;
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

    // Update Weapon Raise Progress (0.0 = slung/stowed, 0.25 = patrol low-ready, 1.0 = shouldered ADS)
    if (isGettingUp || isEquippingWeapon || isSprintingOut) {
      bot.aimRaiseProgress = Math.max(0, (bot.aimRaiseProgress || 0) - dt * 2.8);
    } else if (!seekingVehicle && nearestEnemy) {
      // Takes ~0.55s to physically raise rifle from low-ready to shoulder sights
      bot.aimRaiseProgress = Math.min(1.0, (bot.aimRaiseProgress || 0) + dt * BOT.AIM_RAISE_RATE);
    } else {
      // Settle at low-ready patrol carry (0.25) when out of combat
      const targetLowReady = 0.25;
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
      const maxTurnRate =
        (bot.postReviveTimer || 0) > 1.0
          ? BOT.TURN_RATE_POST_REVIVE
          : isGettingUp || isEquippingWeapon
            ? BOT.TURN_RATE_GETTING_UP
            : BOT.TURN_RATE_NORMAL;
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

      if (nearestEnemy.isVehicle && bot.role === 'ENGINEER') {
        if (canFireWeapon && bot.rpgCooldown <= 0 && horizDist > 10) {
          bot.rpgCooldown = BOT.RPG_COOLDOWN_BASE + Math.random() * BOT.RPG_COOLDOWN_RAND;
          this.botFireRpgAt(bot, nearestEnemy.unit, player);
        }
      } else {
        bot.shootCooldown -= dt;
        if (canFireWeapon && bot.shootCooldown <= 0) {
          bot.burstCount++;
          bot.shootCooldown =
            bot.burstCount % 4 === 0
              ? BOT.BURST_PAUSE_BASE + Math.random() * BOT.BURST_PAUSE_RAND
              : BOT.BURST_SHOT_INTERVAL;
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

    // Decay firing recoil & hit flinch
    bot.recoilKick *= Math.pow(0.01, dt);
    if (bot.flinchTimer > 0) bot.flinchTimer = Math.max(0, bot.flinchTimer - dt);
    if (bot.muzzleFlashTimer > 0) {
      bot.muzzleFlashTimer -= dt;
      parts.muzzleFlash.material.opacity = 0.92;
      parts.muzzleFlash.rotation.z = Math.random() * Math.PI;
    } else {
      parts.muzzleFlash.material.opacity = 0;
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
  if (bot && bot.mesh && bot.mesh.userData && bot.mesh.userData.parts) {
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
  if (!this.hasClearSightline(bot, targetVehicle.pos, false)) return;
  bot.recoilKick = 0.18;
  bot.muzzleFlashTimer = 0.08;

  const start = this.getBotMuzzleWorldPosition(bot);
  const targetCenter = tmpVec3(
    targetVehicle.pos.x,
    targetVehicle.pos.y + 1.35,
    targetVehicle.pos.z
  );
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

  const rocketMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.2, 0.72),
    new THREE.MeshBasicMaterial({ color: 0xe67e22 })
  );
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
  // Final real-time sightline gate: never fire if target moved behind a building wall or thin gap!
  if (!this.hasClearSightline(bot, target.pos, false)) {
    return;
  }

  bot.recoilKick = 0.085;
  bot.muzzleFlashTimer = 0.045;
  bot.shotsFired = (bot.shotsFired || 0) + 1;
  // NATO 5:1 Ball-to-Tracer belt ratio: 1 Tracer round followed by 5 Regular Ball rounds (1 in 6 shots)
  const isTracerRound = bot.shotsFired % 6 === 1;

  // Origin is the actual 3D gun barrel muzzle tip (not center of body!)
  const start = this.getBotMuzzleWorldPosition(bot);
  const targetEye = tmpVec3(target.pos.x, target.pos.y + 1.2, target.pos.z);
  const dir = tmpVec3Copy(targetEye).sub(start).normalize();

  // Suppression degrades NPC accuracy (wider aim cone when suppressed)
  const suppressionMult = 1 + (bot.suppressionLevel || 0) * 3.0;
  dir.x += (Math.random() - 0.5) * 0.075 * suppressionMult;
  dir.y += (Math.random() - 0.5) * 0.055 * suppressionMult;
  dir.z += (Math.random() - 0.5) * 0.075 * suppressionMult;
  dir.normalize();

  const distFromPlayer = bot.pos.distanceTo(player.pos);
  let pan = 0;
  if (distFromPlayer < 190) {
    const dx = bot.pos.x - player.pos.x;
    const dz = bot.pos.z - player.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    pan = (dx * Math.cos(player.yaw || 0) + dz * -Math.sin(player.yaw || 0)) / len;
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

  // Supersonic Bullet Snap & Doppler Whiz when enemy rounds pass near the player!
  if (
    bot.team !== player.team &&
    !player.dead &&
    (target.isPlayer || distFromPlayer < 26) &&
    typeof sound.playBulletWhiz === 'function'
  ) {
    sound.playBulletWhiz(Math.min(distFromPlayer, 22), pan);
  }

  const distToTarget = start.distanceTo(targetEye);
  const voxelHit = this.world.raycastVoxel(start, dir, distToTarget, 0.1);
  if (voxelHit && (voxelHit.voxel || voxelHit.isGround)) {
    if (voxelHit.voxel) {
      if (voxelHit.voxel.isProp || voxelHit.voxel.type === 'wood') {
        this.world.damageVoxel(voxelHit.voxel.gx, voxelHit.voxel.gy, voxelHit.voxel.gz, 18);
      } else if (voxelHit.voxel.type === 'sandbag') {
        this.world.damageVoxel(voxelHit.voxel.gx, voxelHit.voxel.gy, voxelHit.voxel.gz, 6);
      }
    }
    if (isTracerRound) {
      this.spawnTracer(start, voxelHit.point, bot.team === 'US' ? 0x74b9ff : 0xff7675);
    }
    return;
  }

  const endPoint = tmpVec3Copy(start).addScaledVector(dir, distToTarget);
  if (isTracerRound) {
    this.spawnTracer(start, endPoint, bot.team === 'US' ? 0x74b9ff : 0xff7675);
  }

  const baseHitChance = Math.max(0.1, 0.42 - distToTarget / 170);
  const hitChance = baseHitChance * (1 - (bot.suppressionLevel || 0) * 0.5); // Suppression halves hit rate
  if (Math.random() < hitChance) {
    if (target.isVehicle) {
      const veh = target.unit;
      // Small-arms rifle rounds deflect harmlessly off Tank & APC composite armor (0 hull damage)
      // and only chip 1 HP off Light Armored Cars (Humvee / GAZ Tigr) while protecting the crew inside!
      if (veh.type === 'humvee' && vehicleManager) {
        vehicleManager.damageVehicle(
          veh,
          1,
          bot.name,
          bot.team,
          'AK-15 (ARMOR GRAZE)',
          onKillFn,
          null,
          bot.pos
        );
      } else if (veh.driver === player && typeof player.notifyVehicleHit === 'function') {
        player.notifyVehicleHit(0, bot.name, 'SMALL ARMS DEFLECTED', bot.pos);
      }
    } else if (target.isPlayer) {
      const wasAlive = !player.dead && !player.downed;
      player.takeDamage(8, bot.name, bot.team, 'AK-15', onKillFn, bot.pos);
      if (wasAlive && (player.downed || player.dead) && String(player.role).toUpperCase() === 'MEDIC') {
        bot.medicKills = (bot.medicKills || 0) + 1;
      }
    } else {
      const res = this.damageBot(
        target.unit,
        24,
        bot.name,
        bot.team,
        'AK-15',
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
  } else {
    // Near-miss suppression: bullets landing close to player cause suppression (Squad-style)
    if (target.isPlayer && distToTarget < 35 && typeof player.applySuppression === 'function') {
      const intensity = Math.max(0.05, 0.2 * (1 - distToTarget / 35));
      player.applySuppression(intensity);
    }
  }
}

export const BotAIMethods = {
  spawnTracer,
  update,
  getBotMuzzleWorldPosition,
  botFireRpgAt,
  botFireAt
};
