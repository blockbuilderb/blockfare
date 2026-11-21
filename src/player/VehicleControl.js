import * as THREE from '../../vendor/three.module.js';
import { sound } from '../audio.js?v=90';
import { PLAYER, PROJECTILES, DISTANCES, VEHICLE_STATS } from '../config.js?v=90';
import { animateBowOrCrossbowMesh } from '../models/weapon-model.js?v=90';
import { events } from '../events.js?v=90';
import {
  AIRCRAFT_FLIGHT_EVENTS,
  PLAYER_PARACHUTE_EVENTS,
  TARGET_LOCK_EVENTS,
  syncAircraftFlightFSM,
  syncGroundVehicleFSM,
  syncVehicleSubsystemsFSM,
  updateTargetLockScanner
} from '../core/StateMachines.js?v=90';

export const VehicleControlMethods = {
  /**
   * [E] Key Handler:
   * 1. Exit current Vehicle (Tank, APC/IFV, Humvee/Tigr, or Eject with Parachute from Aircraft!)
   * 2. Toggle Dragging a downed friendly soldier to cover ([E] grab / [E] release)
   * 3. Enter / Commandeer a nearby Vehicle or Aircraft on the runway (within 7.5m–10.5m)
   */
  handleVehicleAndDragKey() {
    // 1. Exit vehicle or eject from aircraft if currently piloting
    if (this.activeVehicle) {
      const v = this.activeVehicle;
      const groundH = this.world ? this.world.getGroundHeightAt(v.pos.x, v.pos.z) : 0;
      const isAirbornePlane = Boolean(v.isAircraft && (v.pos.y > groundH + 2.5 || v.isShotDown));
      if (v.mesh?.userData?.riderGroup) {
        v.mesh.userData.riderGroup.visible = false;
      }
      v.driver = null;
      this.activeVehicle = null;
      this.targetLockFSM?.send(TARGET_LOCK_EVENTS.LOST_TARGET);
      this.aircraftLockTarget = null;
      this.aircraftLockProgress = 0;
      if (!v.isAircraft) {
        syncGroundVehicleFSM(v);
      }
      if (this.ccipMarkerMesh) this.ccipMarkerMesh.visible = false;
      this.viewModelGroup.visible = true;
      events.emit('player:exited-vehicle', { vehicle: v, reason: isAirbornePlane ? 'ejected' : 'manual' });

      if (isAirbornePlane) {
        v.aiPilotActive = !v.isShotDown;
        this.activateParachuteEject(v.pos);
      } else {
        const exitOffsetX = v.type === 'bike' || v.type === 'atv' ? 2.1 : 3.6;
        this.pos.copy(v.pos).add(new THREE.Vector3(exitOffsetX, 0.35, 0));
      }
      return;
    }

    // 2. Toggle Dragging a downed friendly soldier ([E] to grab, [E] again to drop in cover)
    if (this.draggedBot && this.draggedBot.downed && !this.draggedBot.dead) {
      const droppedName = this.draggedBot.name;
      this.draggedBot = null;
      this.isDraggingAlly = false;
      if (this.onAwardXp) {
        this.onAwardXp(0, `DROPPED ${droppedName} IN COVER — HOLD [F] TO REVIVE`);
      }
      return;
    }

    const nearDowned = this.botManager.findNearestDownedFriendly(this.pos, this.team, DISTANCES.INTERACT_RANGE);
    if (nearDowned) {
      this.draggedBot = nearDowned;
      this.reviveTargetBot = nearDowned;
      this.isDraggingAlly = true;
      this.dragDistAccum = 0;
      if (this.onAwardXp) {
        this.onAwardXp(0, `DRAGGING ${nearDowned.name} — MOVE TO COVER OR HOLD [F] TO REVIVE`);
      }
      return;
    }

    // 3. Enter / Commandeer a nearby Tank, APC, Armored Car, or Parked Aircraft
    const nearVehicle = this.vehicleManager.findNearestEnterable(this.pos, DISTANCES.VEHICLE_ENTER_RANGE, this.team);
    if (nearVehicle) {
      this.enterVehicle(nearVehicle);
      return;
    }
  },

  enterVehicle(nearVehicle, silent = false) {
    if (!nearVehicle || nearVehicle.dead) return false;
    const era = this.world?.era || 'modern';
    if (nearVehicle.isAircraft && !silent) {
      if (era === 'modern' && this.role !== 'pilot') {
        sound.playEmptyClick?.();
        if (this.onAwardXp) {
          this.onAwardXp(
            0,
            '⚠️ ONLY THE [PILOT] CLASS CAN FLY AIRCRAFT IN MODERN WAR! SWITCH TO PILOT AT AN AMMO STASH [L] OR DEPLOY SCREEN'
          );
        }
        return false;
      }
      if (nearVehicle.aircraftRole === 'b2_spirit' && nearVehicle.b2LockedUntilKills) {
        sound.playEmptyClick?.();
        const curKills = this.vehicleManager?.getTeamKills?.(this.team) || 0;
        if (this.onAwardXp) {
          this.onAwardXp(
            0,
            `🔒 B-2 SPIRIT STEALTH BOMBER LOCKED — REQUIRES 25 FACTION KILLS (CURRENT: ${curKills}/25 KILLS)!`
          );
        }
        return false;
      }
    }
    if (nearVehicle.isWarehouseBike || nearVehicle.type === 'bike' || nearVehicle.type === 'atv') {
      nearVehicle.team = this.team;
    }
    if (this.activeVehicle && this.activeVehicle !== nearVehicle) {
      this.activeVehicle.driver = null;
    }
    if (nearVehicle.npcDriver) {
      const npc = nearVehicle.npcDriver;
      nearVehicle.npcDriver = null;
      npc.drivingVehicle = null;
      npc.mesh.visible = true;
      npc.pos.copy(nearVehicle.pos).add(new THREE.Vector3(3.2, 0, 1.5));
      npc.pos.y = this.world.getGroundHeightAt(npc.pos.x, npc.pos.z);
    }
    this.parachuting = false;
    this.parachuteCut = false;
    this.parachuteFSM?.send(PLAYER_PARACHUTE_EVENTS.BOARD_VEHICLE);
    if (this.parachuteMesh) this.parachuteMesh.visible = false;
    this.activeVehicle = nearVehicle;
    nearVehicle.driver = this;
    nearVehicle.aiPilotActive = false;
    if (nearVehicle.isAircraft) {
      const gH = this.world ? this.world.getGroundHeightAt(nearVehicle.pos.x, nearVehicle.pos.z) : 0;
      syncAircraftFlightFSM(nearVehicle, { onRunway: nearVehicle.pos.y - gH < 3.6 });
    } else {
      syncGroundVehicleFSM(nearVehicle);
    }
    nearVehicle.activeWeaponSlot = 0;
    if (typeof this.applyPlayerRideCustomizations === 'function') {
      this.applyPlayerRideCustomizations(nearVehicle);
    }
    this.yaw = nearVehicle.yaw;
    this.pitch = nearVehicle.type === 'warhorse' ? -0.06 : nearVehicle.pitch || 0;
    if (nearVehicle.type === 'warhorse') {
      // Accurate Knight on Horse Perspective: Default to First-Person Raised Saddle View
      // looking over the Warhorse's armored head, ears, mane & reins from behind! (Toggle 3rd-person with [C])
      this.thirdPersonVehicle = false;
      const bowSlotIdx = Array.isArray(this.slots)
        ? this.slots.findIndex((s) => s && s.def && (s.def.isBow || s.def.isCrossbow))
        : -1;
      if (bowSlotIdx >= 0 && typeof this.switchSlot === 'function') {
        this.switchSlot(bowSlotIdx);
      }
    } else if (nearVehicle.isAircraft || nearVehicle.type === 'bike' || nearVehicle.type === 'atv') {
      this.thirdPersonVehicle = true; // Default 3rd-person chase cam for aircraft, motorcycles, e-motos, scooters & ATVs (toggle 1st-person with [C])
    }
    if (nearVehicle.mesh?.userData?.riderGroup) {
      nearVehicle.mesh.userData.riderGroup.visible = Boolean(this.thirdPersonVehicle);
    }
    this.bleeding = false;
    this.bleedTickTimer = 0;
    this.isAds = false;
    this.reloading = false;
    this.viewModelGroup.visible = Boolean(nearVehicle.type === 'warhorse' && !this.thirdPersonVehicle);
    this.pos.copy(nearVehicle.pos);
    events.emit('player:entered-vehicle', { vehicle: nearVehicle, silent });
    if (this.onAwardXp && !silent) {
      const customBadge = nearVehicle.customLoadoutLabel ? ` [${nearVehicle.customLoadoutLabel}]` : '';
      const isMotoOrAtv = nearVehicle.type === 'bike' || nearVehicle.type === 'atv';
      const boostName = nearVehicle.isElectric
        ? '80HP ELECTRIC OVERDRIVE'
        : nearVehicle.isTwoStroke
        ? '2-STROKE POWERBAND BOOST'
        : 'WHEELIE / NITRO BOOST';
      this.onAwardXp(
        0,
        nearVehicle.isAircraft
          ? `✈️ COCKPIT READY: ${nearVehicle.name}${customBadge} ([W/S] THROTTLE • MOUSE STEER • [X] ECM/FLARES • [C] CAM • [E] EJECT)`
          : isMotoOrAtv
          ? `🏍️ MOUNTED ${nearVehicle.name}${customBadge} ([W/S] PROGRESSIVE THROTTLE • [A/D] LEAN/CARVE • [SPACE/X] ${boostName} • [LMB] DRIVE-BY SMG • [C] CAM)`
          : `🛡️ MOUNTED ${nearVehicle.name}${customBadge} ([X] APS/SMOKE COUNTERMEASURE)`
      );
    }
    return true;
  },

  /**
   * Secret Konami Code (`Up Up Down Down Left Right Left Right B A`) handler:
   * Immediately spawns/boards the player into a Northrop B-2A Spirit Stealth Bomber
   * in ANY era with ZERO callouts (no HUD toast, no XP notification, no radio beep).
   */
  launchSilentSecretB2Bomber() {
    if (this.dead || this.downed || !this.vehicleManager) return null;
    this.preferredAircraftRole = 'b2_spirit';
    const plane = this.vehicleManager.findOrLaunchPlayerAircraft(this, 'b2_spirit', true);
    if (!plane) return null;
    this.enterVehicle(plane, true);
    return plane;
  },

  launchSilentSecretWrightFlyer() {
    if (this.dead || this.downed || !this.vehicleManager) return null;
    const plane = this.vehicleManager.findOrLaunchPlayerAircraft(this, 'wright_flyer', true);
    if (!plane) return null;
    plane.isSecretOmegaFlyer = true;
    plane.maxHp = 99999;
    plane.hp = 99999;
    this.enterVehicle(plane, true);
    return plane;
  },

  executeSilentOmegaFlyerWipe(v, impactPos = null) {
    if (!v || !v.isSecretOmegaFlyer) return;
    if (impactPos && this.world?.explodeAt) {
      this.world.explodeAt(
        impactPos,
        36.0,
        99999,
        () => {},
        this.onBroadcast
      );
    }
    if (this.botManager && Array.isArray(this.botManager.bots)) {
      for (const bot of this.botManager.bots) {
        if (!bot || bot.dead || bot.team === this.team) continue;
        bot.hp = 0;
        bot.armorHp = 0;
        bot.downed = false;
        bot.dead = true;
        bot.bleedOutTimer = 0;
        bot.respawnTimer = 6.5;
        bot.velX = 0;
        bot.velZ = 0;
        if (bot.drivingVehicle) {
          bot.drivingVehicle.npcDriver = null;
          bot.drivingVehicle = null;
        }
        if (bot.mesh) bot.mesh.visible = false;
        this.kills = (this.kills || 0) + 1;
        this.score = (this.score || 0) + 100;
      }
    }
    if (this.vehicleManager && Array.isArray(this.vehicleManager.vehicles)) {
      for (const otherV of this.vehicleManager.vehicles) {
        if (!otherV || otherV.dead || otherV === v || otherV.team === this.team) continue;
        otherV.hp = 0;
        otherV.dead = true;
        otherV.isShotDown = false;
        otherV.aiPilotActive = false;
        otherV.respawnTimer = 35.0;
        if (otherV.npcDriver) {
          otherV.npcDriver.drivingVehicle = null;
          otherV.npcDriver = null;
        }
        if (otherV.mesh) otherV.mesh.visible = false;
        this.vehiclesDestroyed = (this.vehiclesDestroyed || 0) + 1;
      }
    }
  },

  /**
   * When the camera is blocked by a wall between `pivotPos` (player/vehicle/mount pivot) and
   * `desiredCamPos`, or if a wall voxel overlaps the camera lens, moves the camera directly
   * IN FRONT OF the blocking wall so walls never obstruct the view or clip into the camera!
   */
  resolveCameraWallCollision(pivotPos, desiredCamPos, padFromWall = 0.38) {
    if (!this.world || !pivotPos || !desiredCamPos) return desiredCamPos;
    const outPos = desiredCamPos.clone();
    const toCam = outPos.clone().sub(pivotPos);
    const dist = toCam.length();

    if (dist > 0.04 && typeof this.world.raycastVoxel === 'function') {
      const dir = toCam.clone().divideScalar(dist);
      const hit = this.world.raycastVoxel(pivotPos, dir, dist + 0.28, 0.14);
      if (hit && hit.distance < dist + 0.22) {
        const clampedDist = Math.max(0.16, hit.distance - padFromWall);
        outPos.copy(pivotPos).addScaledVector(dir, clampedDist);
      }
    }

    // Also ensure the camera does not sit inside a solid voxel cell
    if (this.world.voxels && typeof this.world.worldToGrid === 'function') {
      const g = this.world.worldToGrid(outPos.x, outPos.y, outPos.z);
      const vox = this.world.voxels.get(this.world.key(g.gx, g.gy, g.gz));
      if (vox && !vox.isProp) {
        const voxelCenterX = (g.gx + 0.5) * 1.25;
        const voxelCenterZ = (g.gz + 0.5) * 1.25;
        const pushX = pivotPos.x - voxelCenterX;
        const pushZ = pivotPos.z - voxelCenterZ;
        const pushLen = Math.hypot(pushX, pushZ) || 1;
        outPos.x = voxelCenterX + (pushX / pushLen) * 0.98;
        outPos.z = voxelCenterZ + (pushZ / pushLen) * 0.98;
      }
    }

    // Clamp above terrain surface so camera never clips underground
    if (typeof this.world.getGroundHeightAt === 'function') {
      const groundY = this.world.getGroundHeightAt(outPos.x, outPos.z);
      if (outPos.y < groundY + 0.32) {
        outPos.y = groundY + 0.32;
      }
    }

    return outPos;
  },

  /**
   * [X] Key inside any Ground Vehicle or Aircraft:
   * - Ground Vehicle: Activates Trophy HV Active Protection System (APS) + 360° IR Thermal Smoke Screen + Hull Field Patch!
   * - Aircraft: Deploys AN/ALQ-184 ECM Radar Jammer + Angel Wing Flare Salvo + Airframe Trim Repair!
   */
  activateVehicleCountermeasure() {
    const v = this.activeVehicle;
    if (!v || v.dead) return false;

    if ((v.flareCooldown || 0) > 0) {
      if (this.onAwardXp) {
        this.onAwardXp(0, `⏳ COUNTERMEASURES RECHARGING (${v.flareCooldown.toFixed(1)}S)`);
      }
      return false;
    }

    if (v.isAircraft) {
      const isWright = v.aircraftRole === 'wright_flyer';
      const isB2 = v.aircraftRole === 'b2_spirit' || (v.isStealthAircraft && !isWright);
      const cdMult = v.customFlareCdMult || (this.role === 'pilot' ? 0.72 : 1.0);
      v.flareCooldown = Number(((isWright ? 6.0 : isB2 ? 7.5 : 9.0) * cdMult).toFixed(1));
      v.flareActiveTimer = isWright ? 6.0 : isB2 ? 7.0 : 4.8;
      syncVehicleSubsystemsFSM(v);
      const healAmt = isWright ? 480 : isB2 ? 420 : this.role === 'pilot' ? 320 : 220;
      v.hp = Math.min(v.maxHp || 1500, (v.hp || 1000) + healAmt);
      if (isWright) {
        v.forwardSpeed = Math.max(v.forwardSpeed || 13.5, 24.0);
      }

      if (this.world && Array.isArray(this.world.projectiles)) {
        for (const p of this.world.projectiles) {
          if (p.type === 'a2a_missile' && p.targetVehicle === v) {
            p.targetVehicle = null;
          }
        }
      }
      // Spawn immediate 3D Angel-Wing IR Flare & Chaff Salvo visible in both 1st-person cockpit & 3rd-person view!
      this.spawnAircraftCountermeasureBurst(v, true);
      v._cmSalvoBurstTimer = 0.16;
      this.addShake(0.14);
      sound.playRadioBeep?.(false);
      sound.playRocketLaunch?.(0);
      if (this.onAwardXp) {
        this.onAwardXp(
          25,
          isWright
            ? `🪁 [X] 1903 KITTY HAWK TAILWIND GUST (86 KM/H BOOST) & SPRUCE/MUSLIN REPAIR (+${healAmt} HP)!`
            : isB2
            ? `🦇 [X] B-2 ACTIVE RAM STEALTH CLOAK ENGAGED (7.0S ZERO RADAR/IR SIGNATURE + +${healAmt} HP PATCH)!`
            : `✨ [X] ECM JAMMER & ANGEL WING FLARES DEPLOYED — ALL MISSILES SPOOFED (+${healAmt} HP AIRFRAME PATCH)!`
        );
      }
      return true;
    }

    // Ground Vehicle Countermeasure: Trophy APS / Progressive Bike Overdrive Torque + 360° Thermal Smoke Screen + Field Hull Repair
    const isMotoOrAtv = v.type === 'bike' || v.type === 'atv';
    const isArmorCrew = this.role === 'armor';
    v.flareCooldown = isMotoOrAtv ? 6.5 : isArmorCrew ? 11.0 : 14.0;
    v.flareActiveTimer = isMotoOrAtv ? 4.5 : v.hasTrophyAps || isArmorCrew ? 4.5 : 3.0;
    syncVehicleSubsystemsFSM(v);
    const healAmt = isMotoOrAtv ? 220 : v.hasTrophyAps || isArmorCrew ? 280 : 180;
    v.hp = Math.min(v.maxHp || 1600, (v.hp || 1000) + healAmt);

    if (this.world && Array.isArray(this.world.projectiles)) {
      for (let i = this.world.projectiles.length - 1; i >= 0; i--) {
        const p = this.world.projectiles[i];
        if (p && p.mesh && p.owner !== this && p.mesh.position.distanceTo(v.pos) < 28) {
          this.scene.remove(p.mesh);
          this.world.projectiles.splice(i, 1);
        }
      }
    }
    if (this.world?.spawnDebris) {
      this.world.spawnDebris(
        v.pos.clone().add(new THREE.Vector3(0, 2.2, 0)),
        new THREE.Color(0xdfe6e9),
        14
      );
    }
    sound.playRadioBeep?.(false);
    if (this.onAwardXp) {
      this.onAwardXp(
        25,
        v.hasTrophyAps || isArmorCrew
          ? `🛡️ [X] TROPHY APS & THERMAL SMOKE ACTIVE (4.5S INTERCEPT + +${healAmt} HP HULL REPAIR)!`
          : `💨 [X] 360° IR SMOKE SCREEN DEPLOYED (+${healAmt} HP FIELD HULL PATCH)!`
      );
    }
    return true;
  },

  /**
   * Cycles preferred Combat Aircraft Role:
   * 1. 'b2_spirit': Northrop B-2A Spirit Flying-Wing Stealth Bomber (80x Mk-82 Carpet Bomb Bay + 2x GBU-57 MOP + 88% RAM Stealth + Mach-Subsonic Speed)
   * 2. 'cas': A-10C Warthog / Su-25SM Frogfoot (30mm GAU-8 "BRRRT!" + Hydra/AGM-65 Rockets)
   * 3. 'fighter': F-15EX / F-22A & Su-34 / Su-57 Combined Strike Fighter/Bomber (20mm Vulcan + AIM-9X A2A + JDAM/GBU-28 Bombs)
   * 4. 'gunship': AC-130J Ghostrider / Tu-95MS Heavy Gunship (25mm Gatling + 40mm Bofors + 105mm Howitzer)
   */
  cycleAircraftRole(forceRole = null) {
    if ((this.world?.era || 'modern') !== 'modern') {
      return null;
    }
    const roles = ['b2_spirit', 'wright_flyer', 'cas', 'fighter', 'gunship'];
    const normForce = forceRole === 'bomber' ? 'b2_spirit' : forceRole;
    if (normForce && roles.includes(normForce)) {
      this.preferredAircraftRole = normForce;
    } else {
      const curIdx = roles.indexOf(this.preferredAircraftRole || 'b2_spirit');
      this.preferredAircraftRole = roles[(curIdx + 1) % roles.length];
    }
    const roleLabels = {
      b2_spirit:
        '🦇 NORTHROP B-2A SPIRIT STEALTH BOMBER (CARPET BOMB BAY [1/LMB] + GBU-57 MOP [2/SPACE] + 88% RAM STEALTH)',
      wright_flyer:
        '🪁 1903 WRIGHT FLYER I — SECRET KITTY HAWK PIONEER (29–48 KM/H BARNSTORMER + BRASS GATLING [1] + DYNAMITE [2/SPACE])',
      cas: '✈️ CAS ATTACK JET: A-10C WARTHOG / SU-25 (30MM GAU-8 "BRRRT!" + ROCKETS)',
      fighter: '🎯💣 STRIKE FIGHTER/BOMBER: F-15EX / F-22A (20MM + AIM-9X A2A + JDAM/GBU-28 BOMBS)',
      gunship: '🛸 AC-130J GHOSTRIDER GUNSHIP (25MM GATLING [1] + 40MM BOFORS [2] + 105MM HOWITZER [3/SPACE])'
    };
    if (this.onAwardXp) {
      this.onAwardXp(0, `AIRCRAFT SORTIE ROLE [SHIFT+9]: ${roleLabels[this.preferredAircraftRole]}`);
    }
    if (this.activeVehicle && this.activeVehicle.isAircraft) {
      this.launchAircraftSortie(this.preferredAircraftRole);
    }
    return this.preferredAircraftRole;
  },

  /**
   * [9] Key / Commander Button: Launches the player directly into an airborne Combat Aircraft Sortie
   * (or cycles between Northrop B-2 Spirit, 1903 Wright Flyer I, CAS A-10C, Strike Fighter, and AC-130J Gunship if already airborne!).
   */
  launchAircraftSortie(forceRole = null) {
    if (this.dead || this.downed || !this.vehicleManager) return null;
    const era = this.world?.era || 'modern';
    if (era !== 'modern') {
      sound.playEmptyClick?.();
      if (this.onAwardXp) {
        this.onAwardXp(0, '⚠️ MODERN COMBAT AIRCRAFT ARE ONLY AVAILABLE IN THE MODERN ERA!');
      }
      return null;
    }
    if (this.role !== 'pilot') {
      sound.playEmptyClick?.();
      if (this.onAwardXp) {
        this.onAwardXp(
          0,
          '⚠️ ONLY THE [PILOT] CLASS CAN FLY AIRCRAFT IN MODERN WAR! SWITCH TO PILOT AT AN AMMO STASH [L] OR DEPLOY SCREEN'
        );
      }
      return null;
    }
    const b2Unlocked = this.vehicleManager.isB2UnlockedForTeam
      ? this.vehicleManager.isB2UnlockedForTeam(this.team)
      : true;
    const teamKills = this.vehicleManager.getTeamKills ? this.vehicleManager.getTeamKills(this.team) : 0;
    const normForce = forceRole === 'bomber' ? 'b2_spirit' : forceRole;
    if (normForce === 'b2_spirit' && !b2Unlocked) {
      sound.playEmptyClick?.();
      if (this.onAwardXp) {
        this.onAwardXp(
          0,
          `🔒 B-2A SPIRIT CARPET BOMBER LOCKED — REQUIRES 25 FACTION KILLS (${teamKills}/25 KILLS)!`
        );
      }
      return null;
    }
    if (normForce) {
      this.preferredAircraftRole = normForce;
    } else if (this.activeVehicle && this.activeVehicle.isAircraft) {
      const roles = b2Unlocked
        ? ['b2_spirit', 'wright_flyer', 'cas', 'fighter', 'gunship']
        : ['cas', 'fighter', 'gunship', 'wright_flyer'];
      const curRole =
        this.activeVehicle.aircraftRole === 'bomber'
          ? 'b2_spirit'
          : this.activeVehicle.aircraftRole || 'cas';
      const curIdx = roles.indexOf(curRole);
      const nextIdx = (curIdx + 1) % roles.length;
      this.preferredAircraftRole = roles[nextIdx];
    }
    let role = this.preferredAircraftRole || (b2Unlocked ? 'b2_spirit' : 'cas');
    if (role === 'b2_spirit' && !b2Unlocked) {
      role = 'cas';
      this.preferredAircraftRole = 'cas';
      if (this.onAwardXp) {
        this.onAwardXp(
          0,
          `🔒 B-2 SPIRIT UNLOCKS AT 25 FACTION KILLS (${teamKills}/25) — LAUNCHING CAS SORTIE INSTEAD!`
        );
      }
    }
    const plane = this.vehicleManager.findOrLaunchPlayerAircraft(this, role, false);
    if (!plane) {
      if (this.onAwardXp) {
        this.onAwardXp(
          0,
          role === 'b2_spirit'
            ? '⏳ B-2 SPIRIT IN 90S RESPAWN COOLDOWN OR INSUFFICIENT FACTION FUNDS ($2,000)!'
            : '⏳ AIRCRAFT IN 35S RESPAWN COOLDOWN OR INSUFFICIENT FACTION FUNDS ($800)!'
        );
      }
      return null;
    }
    this.enterVehicle(plane);
    sound.playRadioBeep?.(false);
    if (this.onAwardXp) {
      const missionDesc =
        role === 'wright_flyer'
          ? '1903 WRIGHT FLYER I SECRET PIONEER SORTIE (29–48 KM/H • [1/LMB] BRASS GATLING MG • [2/SPACE] DYNAMITE CRATES)'
          : role === 'b2_spirit'
          ? 'NORTHROP B-2A SPIRIT STEALTH CARPET BOMBER ([1/LMB] 80× MK-82 CARPET BARRAGE • [2/SPACE] GBU-57 MOP • [X] RAM STEALTH CLOAK)'
          : role === 'cas'
          ? 'A-10 CAS STRAFING MISSION (30MM GAU-8 [LMB] + ROCKETS [SPACE])'
          : role === 'gunship'
          ? 'AC-130J ORBITAL GUNSHIP ([1] 25MM GATLING • [2] 40MM BOFORS • [3/SPACE] 105MM HOWITZER)'
          : 'COMBINED STRIKE FIGHTER/BOMBER ([1] 20MM VULCAN • [2/SPACE] AIM-9X A2A • [3] JDAM/GBU-28 BOMBS)';
      this.onAwardXp(50, `✈️ AIRBORNE SORTIE LAUNCHED: ${plane.name} — ${missionDesc}!`);
    }
    events.emit('telemetry:event', {
      type: 'PLAYER_AIRCRAFT_SORTIE',
      payload: {
        aircraftId: plane.id,
        aircraftName: plane.name,
        aircraftRole: plane.aircraftRole,
        altitude: Math.round(plane.pos.y)
      }
    });
    return plane;
  },

  /**
   * Ejects the player upward out of an airborne aircraft (or pulls reserve chute in mid-air)
   * and deploys a 3D Tactical Parachute canopy. Press [C] or [X] while gliding to cut the parachute!
   */
  activateParachuteEject(fromPos, isManualPull = false) {
    const startPos = fromPos ? fromPos.clone() : this.pos.clone();
    if (!isManualPull) {
      this.pos.set(startPos.x, startPos.y + 8.0, startPos.z);
      this.vel.set(-Math.sin(this.yaw) * 10, 14.0, -Math.cos(this.yaw) * 10);
    } else {
      this.vel.y = Math.max(this.vel.y, -5.5);
    }
    this.onGround = false;
    this.isGrounded = false;
    this.parachuting = true;
    this.parachuteCut = false;
    if (this.parachuteFSM) {
      if (isManualPull) {
        if (!this.parachuteFSM.send(PLAYER_PARACHUTE_EVENTS.PULL_RESERVE)) {
          this.parachuteFSM.send(PLAYER_PARACHUTE_EVENTS.EJECT_DEPLOY);
        }
      } else {
        this.parachuteFSM.send(PLAYER_PARACHUTE_EVENTS.EJECT_DEPLOY);
      }
    }

    if (!this.parachuteMesh && this.scene) {
      const chuteGroup = new THREE.Group();
      const canopyMat = new THREE.MeshStandardMaterial({
        color: 0x556b2f,
        roughness: 0.8,
        side: THREE.DoubleSide
      });
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.45, 2.4), canopyMat);
      canopy.position.set(0, 3.6, 0);
      chuteGroup.add(canopy);
      const cordMat = new THREE.MeshBasicMaterial({ color: 0xbdc3c7 });
      for (const sx of [-1.4, 1.4]) {
        const cord = new THREE.Mesh(new THREE.BoxGeometry(0.05, 3.2, 0.05), cordMat);
        cord.position.set(sx * 0.6, 2.0, 0);
        cord.rotation.z = sx * 0.22;
        chuteGroup.add(cord);
      }
      this.scene.add(chuteGroup);
      this.parachuteMesh = chuteGroup;
    }
    if (this.parachuteMesh) {
      this.parachuteMesh.visible = true;
      this.parachuteMesh.position.copy(this.pos);
    }
    if (this.onAwardXp) {
      this.onAwardXp(
        0,
        isManualPull
          ? '🪂 RESERVE PARACHUTE DEPLOYED! ([C / X] CUT CHUTE FOR FAST DROP • [WASD] STEER)'
          : '🚀🪂 EJECTION SEAT FIRED — PARACHUTE DEPLOYED! ([C / X] CUT PARACHUTE FOR FAST FALL • [WASD] STEER)'
      );
    }
  },

  /**
   * [C] or [X] while Parachuting: Cuts the parachute canopy cords to enter high-speed freefall!
   * (Player must press [SPACE] before hitting the ground or suffer lethal high-velocity fall damage!)
   */
  cutParachute() {
    if (!this.parachuting) return false;
    this.parachuting = false;
    this.parachuteCut = true;
    this.parachuteFSM?.send(PLAYER_PARACHUTE_EVENTS.CUT_CANOPY);
    if (this.parachuteMesh) {
      this.parachuteMesh.visible = false;
    }
    this.vel.y = Math.min(this.vel.y, -15.5);
    sound.playWeaponSwitch?.();
    if (this.onAwardXp) {
      this.onAwardXp(
        0,
        '✂️🪂 PARACHUTE CUT — HIGH-SPEED FREEFALL! PRESS [SPACE] BEFORE GROUND IMPACT OR DIE FROM FALL DAMAGE!'
      );
    }
    return true;
  },

  /**
   * Switches between Weapon Slots ([1], [2], [3], [Q]) inside a Tank, APC, Mobile AA, Emplacement, or Aircraft.
   */
  switchVehicleWeaponSlot(slotIndex) {
    const v = this.activeVehicle;
    if (!v || v.dead) return;
    if (v.type === 'humvee' || v.type === 'emplace_hmg') {
      v.activeWeaponSlot = 0;
      return;
    }
    const maxSlots =
      v.isAircraft &&
      (v.aircraftRole === 'gunship' ||
        v.aircraftRole === 'fighter' ||
        v.aircraftRole === 'b2_spirit' ||
        v.aircraftRole === 'wright_flyer')
        ? 3
        : 2;
    const clamped = Math.max(0, Math.min(maxSlots - 1, slotIndex));
    if (v.activeWeaponSlot === clamped) return;
    v.activeWeaponSlot = clamped;
    sound.playWeaponSwitch?.();
    let label = '';
    if (v.isAircraft) {
      if (v.aircraftRole === 'wright_flyer') {
        label =
          clamped === 0
            ? '🔫 [1] 1903 HAND-CRANKED BRASS GATLING MG (840 RPM • LMB)'
            : clamped === 1
            ? '🧨 [2] 1903 KITTY HAWK DYNAMITE CRATE SALVO (LMB / SPACE)'
            : '🎯 [3] BARNSTORMER GATLING + AIM-9X ANACHRONISM [SPACE]';
      } else if (v.aircraftRole === 'b2_spirit') {
        label =
          clamped === 0
            ? '💣 [1] 80× MK-82 ROTARY CARPET BOMB BAY (5-BOMB ROLLING WAVE • HOLD LMB / SPACE)'
            : clamped === 1
            ? '💥 [2] 2× GBU-57A/B MOP 30,000LB MASSIVE BUNKER-BUSTER (LMB / SPACE)'
            : '🎯 [3] B-2 RECESSED 20MM DEFENSE CANNON [LMB] + AIM-9X SELF-DEFENSE [SPACE]';
      } else if (v.aircraftRole === 'cas') {
        label =
          clamped === 0
            ? '💥 [1] 30MM GAU-8 AVENGER ROTARY CANNON ("BRRRT!" • LMB)'
            : '🚀 [2] HYDRA-70 / AGM-65 AIR-TO-GROUND ROCKETS (LMB / SPACE)';
      } else if (v.aircraftRole === 'gunship') {
        label =
          clamped === 0
            ? '🔥 [1] 25MM GAU-12/U EQUALIZER GATLING (1,600 RPM AP-HEI • LMB)'
            : clamped === 1
            ? '💥 [2] 40MM L/60 BOFORS AUTOCANNON (120 RPM HE AIRBURST • LMB)'
            : '🎯 [3] 105MM M102 HEAVY HOWITZER (AERIAL ARTILLERY • LMB / SPACE)';
      } else {
        label =
          clamped === 0
            ? '🔥 [1] 20MM VULCAN A2A CANNON + AIM-9X/JDAM ON [SPACE]'
            : clamped === 1
            ? '🎯 [2] AIM-9X / R-73 HEAT-SEEKING A2A MISSILE (LMB / SPACE)'
            : '💣 [3] 500LB JDAM [LMB] + 2,000LB GBU-28 BUNKER BUSTER [SPACE] (CCIP RETICLE)';
      }
    } else if (v.type === 'aa' || v.type === 'emplace_aa') {
      label =
        clamped === 0
          ? '📡 [1] TWIN 25MM/30MM RADAR AA AUTOCANNON (1,050 RPM PROXIMITY AIRBURST)'
          : '🚀 [2] FIM-92 STINGER / 9M311 QUAD SAM LAUNCH POD (LMB / SPACE)';
    } else if (v.type === 'emplace_mortar') {
      label =
        clamped === 0
          ? '🎯 [1] 81MM M252 INDIRECT-FIRE HE SHELL (60M–550M • LMB)'
          : '💥 [2] 81MM 3-ROUND RAPID BARRAGE SALVO (LMB / SPACE)';
    } else if (v.type === 'warhorse') {
      label =
        clamped === 0
          ? '🏹 [1] MOUNTED YEW LONGBOW SELECTED (LMB SHOOT ARROWS • 360° MOUSE AIM)'
          : '🔱 [2] COUCHED CAVALRY LANCE & SWORD SELECTED (LMB GALLOP CHARGE • UP TO 280 DMG)';
      if (Array.isArray(this.slots) && typeof this.switchSlot === 'function') {
        const targetIdx =
          clamped === 0
            ? this.slots.findIndex((s) => s && s.def && (s.def.isBow || s.def.isCrossbow))
            : this.slots.findIndex((s) => s && s.def && s.def.type === 'melee_sword');
        if (targetIdx >= 0) {
          this.switchSlot(targetIdx);
        }
      }
    } else {
      label =
        clamped === 0
          ? v.type === 'tank'
            ? '💥 [1] MAIN CANNON SELECTED (LMB)'
            : '💥 [1] 30MM AUTOCANNON SELECTED (LMB)'
          : '🔥 [2] 7.62MM COAXIAL MG SELECTED (LMB / SPACE)';
    }
    if (this.onAwardXp && !v.isSecretOmegaFlyer && v.aircraftRole !== 'wright_flyer') {
      this.onAwardXp(0, label);
    }
  },

  notifyVehicleHit(hullDamage, attackerName, weaponName, attackerPos = null) {
    if (hullDamage >= 35) {
      this.addShake(Math.min(0.45, hullDamage / 420));
    }
    if (this.onDamageTaken) {
      this.onDamageTaken(hullDamage, attackerPos, true, weaponName, attackerName);
    } else {
      events.emit('player:damaged', {
        amount: hullDamage,
        sourcePos: attackerPos,
        inVehicle: true,
        weaponName,
        attackerName
      });
    }
  },

  updateVehicleControl(dt) {
    const v = this.activeVehicle;
    if (!v || v.dead) {
      this.activeVehicle = null;
      if (this.ccipMarkerMesh) this.ccipMarkerMesh.visible = false;
      this.viewModelGroup.visible = true;
      return;
    }

    if (v.isAircraft) {
      this.updateAircraftControl(dt, v);
      return;
    }

    // Passive Hull Self-Repair (Armor Crewman: +22 HP/s, Standard: +6 HP/s) & Active Trophy APS Interception
    const regenRate = v.passiveRegenPerSec || (this.role === 'armor' ? 22 : 6);
    if (v.hp < v.maxHp) {
      v.hp = Math.min(v.maxHp, v.hp + regenRate * dt);
    }
    v.hullIntegrityPct = Math.max(0, Math.min(100, Math.round((v.hp / Math.max(1, v.maxHp)) * 100)));
    if (v.armorZones) {
      const zoneRegen = (regenRate / Math.max(1, v.maxHp)) * 115 * dt;
      v.armorZones.front = Math.min(100, (v.armorZones.front ?? 100) + zoneRegen);
      v.armorZones.left = Math.min(100, (v.armorZones.left ?? 100) + zoneRegen);
      v.armorZones.right = Math.min(100, (v.armorZones.right ?? 100) + zoneRegen);
      v.armorZones.rear = Math.min(100, (v.armorZones.rear ?? 100) + zoneRegen);
    }
    if (v.subsystems && (v.hullIntegrityPct >= 68 || (v.flareActiveTimer || 0) > 0)) {
      v.subsystems.tracks = 'OK';
      v.subsystems.turret = 'OK';
      v.subsystems.engine = v.hullIntegrityPct < 35 ? 'CRITICAL' : v.hullIntegrityPct < 65 ? 'SMOKING' : 'OK';
    }
    if ((v.flareActiveTimer || 0) > 0 && (v.hasTrophyAps || this.role === 'armor') && this.world?.projectiles) {
      for (let i = this.world.projectiles.length - 1; i >= 0; i--) {
        const p = this.world.projectiles[i];
        if (p && p.mesh && p.owner !== this && p.mesh.position.distanceToSquared(v.pos) < 22 * 22) {
          if (this.world.spawnDebris) {
            this.world.spawnDebris(p.mesh.position.clone(), new THREE.Color(0x00d2d3), 6);
          }
          this.scene.remove(p.mesh);
          this.world.projectiles.splice(i, 1);
          if (this.onAwardXp) {
            this.onAwardXp(25, '🛡️ TROPHY APS INTERCEPTED INCOMING PROJECTILE!');
          }
        }
      }
    }

    const isAaVehicle = v.type === 'aa' || v.type === 'emplace_aa' || v.weaponType === 'aa_autocannon';
    const isMortar =
      v.type === 'emplace_mortar' ||
      v.weaponType === 'mortar_tube' ||
      v.type === 'trebuchet' ||
      v.weaponType === 'trebuchet_boulder';
    if (!isMortar && this.ccipMarkerMesh) this.ccipMarkerMesh.visible = false;

    const accel = v.isEmplacement ? 0 : (this.keys['KeyW'] ? 1 : 0) - (this.keys['KeyS'] ? 1 : 0);
    const steer = v.isEmplacement ? 0 : (this.keys['KeyA'] ? 1 : 0) - (this.keys['KeyD'] ? 1 : 0);

    const isMotoOrAtv =
      v.type === 'bike' ||
      v.type === 'atv' ||
      v.type === 'warhorse' ||
      v.type === 'trex_mount' ||
      v.type === 'raptor_mount' ||
      Boolean(v.isHorseMount);
    const isWheelieBoost = isMotoOrAtv && Boolean(this.keys['Space'] || (v.flareActiveTimer || 0) > 0);
    syncGroundVehicleFSM(v, { wheelieBoost: isWheelieBoost });

    const trackDamaged = v.subsystems && v.subsystems.tracks === 'DAMAGED';
    const engineCritical = v.subsystems && v.subsystems.engine === 'CRITICAL';
    const turretDamaged = v.subsystems && v.subsystems.turret === 'DAMAGED';
    const subsystemSpeedMult = (trackDamaged ? 0.72 : 1.0) * (engineCritical ? 0.82 : 1.0);
    const subsystemTurnMult = trackDamaged ? 0.75 : 1.0;

    const accelRate =
      (v.accelRate || (v.type === 'tank' ? 1.35 : v.type === 'apc' || v.type === 'aa' ? 1.85 : 2.45)) *
      (engineCritical ? 0.78 : 1.0);
    const brakeRate =
      v.brakeRate || (v.type === 'tank' ? 2.2 : v.type === 'apc' || v.type === 'aa' ? 2.6 : 3.2);
    const turnRate =
      (v.turnRate || (v.type === 'tank' ? 0.95 : v.type === 'apc' || v.type === 'aa' ? 1.22 : 1.45)) *
      subsystemTurnMult;

    if (v.isEmplacement) {
      v.forwardSpeed = 0;
    } else if (isMotoOrAtv) {
      // =======================================================================
      // REALISTIC PROGRESSIVE MOTORCYCLE / 2-STROKE / E-MOTO / ATV ACCELERATION
      // - Never jumps abruptly to max speed!
      // - Simulates 6-speed sequential gearing (1ST–6TH), 2-stroke expansion-chamber
      //   powerband surge, high-voltage EV motor torque curve, and quadratic air drag.
      // =======================================================================
      const isSecretHorseTurbo = Boolean(v.type === 'warhorse' && this._secretHorseTurbo);
      if (isSecretHorseTurbo) {
        v.speed = 78.0;
      }
      const baseMaxSpd = isSecretHorseTurbo ? 78.0 : v.speed || 30;
      const boostTopMult = isWheelieBoost ? 1.18 : 1.0;
      const effectiveMaxSpd = baseMaxSpd * boostTopMult;
      const curSpd = v.forwardSpeed || 0;
      const absSpd = Math.abs(curSpd);
      const spdRatio = THREE.MathUtils.clamp(absSpd / Math.max(1, effectiveMaxSpd), 0, 1.15);

      // Compute current 6-speed sequential gear (or 1-speed direct drive for EVs) & RPM
      const totalGears = v.isElectric ? 1 : v.bikeSubType === 'gas_50cc' ? 4 : 6;
      const gearIdx = v.isElectric
        ? 1
        : Math.min(totalGears, Math.max(1, Math.floor(spdRatio * totalGears * 0.98) + 1));
      v.currentGear = curSpd < -0.3 ? 'R' : absSpd < 0.4 && accel === 0 ? 'N' : gearIdx;

      const gearBandSpan = 1 / totalGears;
      const gearLocalFrac = v.isElectric
        ? spdRatio
        : THREE.MathUtils.clamp(
            (spdRatio - (gearIdx - 1) * gearBandSpan) / gearBandSpan,
            0.18,
            1.0
          );
      const maxRpm =
        v.bikeSubType === 'sport_600cc' || v.bikeSubType === 'sport_750cc' || v.bikeSubType === 'superbike_1000cc'
          ? 14500
          : v.isTwoStroke
          ? 11200
          : v.isElectric
          ? 9500
          : 8200;
      const idleRpm = v.isElectric ? 0 : 1400;
      v.engineRpm = Math.round(
        THREE.MathUtils.lerp(
          v.engineRpm || idleRpm,
          absSpd < 0.25 && accel === 0
            ? idleRpm
            : idleRpm + (maxRpm - idleRpm) * THREE.MathUtils.clamp(gearLocalFrac, 0.2, 1.0),
          Math.min(1, dt * 10)
        )
      );

      // Physical base acceleration in m/s²:
      // - Warhorse ('warhorse'): Biological 4-Gait Stride Physics (Walk -> Trot -> Canter -> Full Gallop over ~3.6s!)
      // - Dino Mounts ('trex_mount' / 'raptor_mount'): Heavy theropod stride momentum
      // - Motorcycles / E-Motos / ATVs: Clutch engagement ramp + 2-stroke/4-stroke/EV torque curves
      const sub = v.bikeSubType || '';
      const isBiologicalMount =
        v.type === 'warhorse' || v.type === 'trex_mount' || v.type === 'raptor_mount';
      const baseAccelMs2 = isSecretHorseTurbo
        ? 55.0
        : v.type === 'warhorse'
        ? 3.35
        : v.type === 'trex_mount'
        ? 4.2
        : v.type === 'raptor_mount'
        ? 5.8
        : sub === 'gas_50cc'
        ? 5.2
        : sub === 'emoto_tuttio'
        ? 6.4
        : sub === 'scooter_kukirin'
        ? 7.2
        : sub === 'emoto_yozma'
        ? 7.8
        : sub === 'twostroke_125cc' || sub === 'emoto_cemoto'
        ? 8.6
        : sub === 'emoto_surron' || v.type === 'atv'
        ? 9.4
        : sub === 'twostroke_250cc'
        ? 10.4
        : sub === 'emoto_stark_varg' || sub === 'twostroke_500cc'
        ? 12.2
        : sub === 'sport_600cc'
        ? 11.8
        : sub === 'sport_750cc'
        ? 12.6
        : 13.8; // 1000cc Superbike

      // Progressive Throttle / Stride Spool & Low-Speed Breakaway Inertia:
      // Prevents jumping off the line at full peak acceleration from 0 km/h!
      if (accel > 0) {
        v.throttleSpool = Math.min(1.0, (v.throttleSpool || 0) + dt * (isBiologicalMount ? 0.85 : 1.45));
      } else {
        v.throttleSpool = Math.max(0.0, (v.throttleSpool || 0) - dt * 2.2);
      }
      const launchInertiaFactor = isBiologicalMount
        ? 0.45 + 0.55 * Math.sin(THREE.MathUtils.clamp(spdRatio * 1.15, 0.12, 1.0) * Math.PI * 0.5)
        : 0.42 + 0.58 * THREE.MathUtils.clamp(absSpd / 6.5, 0, 1) * (v.throttleSpool || 0.35);

      // Torque curve multiplier:
      // - Warhorse / Biological Mounts: smooth stride rhythm across Walk -> Trot -> Canter -> Gallop
      // - 2-Stroke bikes: distinct expansion-chamber powerband hit between 50% and 94% of each gear!
      // - Electric bikes: smooth motor torque curve
      // - 4-Stroke Supersports: build power progressively with RPM
      let torqueCurveMult = 1.0;
      if (isBiologicalMount) {
        torqueCurveMult = 0.88 + 0.24 * (v.throttleSpool || 0);
      } else if (v.isTwoStroke) {
        const inPipeBand = gearLocalFrac >= 0.5 && gearLocalFrac <= 0.94;
        torqueCurveMult = inPipeBand ? 1.28 : 0.78;
      } else if (v.isElectric) {
        torqueCurveMult = 1.08 - 0.32 * spdRatio;
      } else {
        torqueCurveMult = 0.82 + 0.34 * gearLocalFrac;
      }

      // Quadratic aerodynamic & stride drag + uphill/downhill slope gravity coupling
      const aeroDragFactor = Math.max(0.08, 1.0 - 0.78 * spdRatio * spdRatio);
      const boostTorqueMult = isWheelieBoost ? (isBiologicalMount ? 1.24 : 1.32) : 1.0;
      const slopeGravityMs2 = -Math.sin(v.pitch || 0) * (isBiologicalMount ? 4.8 : 6.2);

      if (accel > 0) {
        if (curSpd < -0.2) {
          // Braking from reverse
          const revStopDecel = isBiologicalMount ? 7.5 : 16.5;
          v.forwardSpeed = Math.min(0, curSpd + revStopDecel * dt);
        } else {
          const stepAccel =
            baseAccelMs2 * launchInertiaFactor * torqueCurveMult * aeroDragFactor * boostTorqueMult +
            slopeGravityMs2;
          v.forwardSpeed = Math.min(effectiveMaxSpd, Math.max(0, curSpd + stepAccel * dt));
        }
      } else if (accel < 0) {
        if (curSpd > 0.2) {
          // Progressive braking (reining in a Warhorse at ~6.8 m/s² vs hydraulic disc brakes at ~16–19 m/s²)
          const brakeDecel = isBiologicalMount
            ? 6.8
            : (isMotoOrAtv ? 18.5 : 14.0) * (brakeRate / 4.2);
          v.forwardSpeed = Math.max(0, curSpd - brakeDecel * dt);
        } else {
          // Foot-walk / reverse backing up (Warhorse backs up slowly at max 3.4 m/s)
          const maxRev = isBiologicalMount ? -3.4 : -Math.min(8.0, baseMaxSpd * 0.28);
          const revAccel = isBiologicalMount ? 2.4 : 4.6;
          v.forwardSpeed = Math.max(maxRev, curSpd - revAccel * dt);
        }
      } else {
        // Natural stride coast-down / engine braking + wind resistance
        const coastDecel = isBiologicalMount ? 2.8 + absSpd * 0.18 : 3.2 + absSpd * 0.14;
        if (absSpd <= coastDecel * dt + 0.06) {
          v.forwardSpeed = 0;
        } else {
          v.forwardSpeed -= Math.sign(curSpd) * coastDecel * dt;
        }
      }
      // Cornering scrub: sharp turns at gallop/high speed naturally bleed a small amount of momentum
      if (steer !== 0 && absSpd > 2.5) {
        const turnScrub = (isBiologicalMount ? 1.15 : 0.85) * Math.abs(steer) * spdRatio * dt;
        v.forwardSpeed -= Math.sign(v.forwardSpeed) * Math.min(Math.abs(v.forwardSpeed), turnScrub);
      }
    } else if (accel !== 0) {
      // =======================================================================
      // HEAVY ARMORED VEHICLE & TACTICAL 4x4 MASS-INERTIA DRIVETRAIN PHYSICS:
      // - 65-Ton Main Battle Tank, 16-Ton 8x8 IFV/APC, and 5.5-Ton MRAP/Humvee
      // - Never uses exponential lerp (which jumps at t=0)!
      // - Simulates heavy turbine/diesel spool-up, 1st-gear breakaway mass inertia,
      //   quadratic rolling/air resistance, and uphill/downhill slope gravity!
      // =======================================================================
      const curSpd = v.forwardSpeed || 0;
      const absSpd = Math.abs(curSpd);
      const isBraking = curSpd !== 0 && Math.sign(accel) !== Math.sign(curSpd);
      const effTopSpd = (v.speed || 15) * subsystemSpeedMult;
      const targetMaxSpeed = accel > 0 ? effTopSpd : -effTopSpd * 0.48;
      const absMax = Math.max(1, Math.abs(targetMaxSpeed));
      const spdRatio = THREE.MathUtils.clamp(absSpd / absMax, 0, 1.15);

      if (isBraking) {
        // Heavy hydraulic / track braking against current momentum
        v.engineSpool = Math.max(0.1, (v.engineSpool || 0) - dt * 2.2);
        const heavyBrakeMs2 =
          (v.type === 'tank' ? 7.8 : v.type === 'apc' || v.type === 'aa' ? 9.2 : 11.5) *
          (brakeRate / 2.4);
        if (absSpd <= heavyBrakeMs2 * dt + 0.08) {
          v.forwardSpeed = 0;
        } else {
          v.forwardSpeed -= Math.sign(curSpd) * heavyBrakeMs2 * dt;
        }
      } else {
        // Progressive turbine / turbo-diesel spool-up (65t Tank spools over ~1.8s, 16t APC ~1.3s, 5.5t Humvee ~0.95s)
        const spoolRate =
          v.type === 'tank' ? 0.56 : v.type === 'apc' || v.type === 'aa' ? 0.78 : 1.05;
        v.engineSpool = Math.min(1.0, (v.engineSpool || 0) + dt * spoolRate);

        const peakAccelMs2 =
          (v.type === 'tank'
            ? 3.4
            : v.type === 'apc' || v.type === 'aa'
            ? 4.6
            : 6.2) *
          (accelRate / (v.type === 'tank' ? 1.35 : v.type === 'apc' || v.type === 'aa' ? 1.85 : 2.45)) *
          (accel < 0 ? 0.68 : 1.0);
        // Low-gear breakaway mass inertia (starts at 38% force off standstill and builds as turbo spools)
        const massBreakaway = 0.38 + 0.62 * v.engineSpool;
        const rollingDrag = Math.max(0.12, 1.0 - 0.72 * spdRatio * spdRatio);
        const slopeGravMs2 = -Math.sin(v.pitch || 0) * 5.8 * Math.sign(accel);
        const stepAccel = Math.max(0.4, peakAccelMs2 * massBreakaway * rollingDrag + slopeGravMs2);

        if (accel > 0) {
          v.forwardSpeed = Math.min(targetMaxSpeed, curSpd + stepAccel * dt);
        } else {
          v.forwardSpeed = Math.max(targetMaxSpeed, curSpd - stepAccel * dt);
        }
      }
      // Track / tire cornering resistance when pivoting under power
      if (steer !== 0 && absSpd > 2.0) {
        const pivotDrag = (v.type === 'tank' ? 1.35 : 0.95) * Math.abs(steer) * spdRatio * dt;
        v.forwardSpeed -= Math.sign(v.forwardSpeed) * Math.min(Math.abs(v.forwardSpeed), pivotDrag);
      }
    } else {
      // Natural heavy track / rolling resistance coast-down
      v.engineSpool = Math.max(0, (v.engineSpool || 0) - dt * 1.6);
      const coastMs2 =
        (v.type === 'tank' ? 3.8 : v.type === 'apc' || v.type === 'aa' ? 3.4 : 3.0) +
        Math.abs(v.forwardSpeed || 0) * 0.16;
      if (Math.abs(v.forwardSpeed) <= coastMs2 * dt + 0.08) {
        v.forwardSpeed = 0;
      } else {
        v.forwardSpeed -= Math.sign(v.forwardSpeed) * coastMs2 * dt;
      }
    }

    const isWarhorse = v.type === 'warhorse';
    const isDinoMount = v.type === 'trex_mount' || v.type === 'raptor_mount';

    if (!v.isEmplacement && (Math.abs(v.forwardSpeed) > 0.25 || ((isMotoOrAtv || isWarhorse) && steer !== 0))) {
      // Tracked MBTs, Warhorses & Bikes/ATVs can pivot at low speed and turn smoothly at high speed.
      // IMPORTANT: On a Warhorse (`isWarhorse`), WASD (`steer`) controls the horse's body heading (`v.yaw`)
      // like a Tank hull, while the mouse cursor (`this.yaw`) aims the bow/lance independently in 360°!
      const speedFactor =
        v.type === 'tank'
          ? THREE.MathUtils.clamp(Math.abs(v.forwardSpeed) / 4.5, 0.45, 1.0)
          : isWarhorse
          ? THREE.MathUtils.clamp(Math.abs(v.forwardSpeed) / 5.0, 0.72, 1.1)
          : isMotoOrAtv
          ? THREE.MathUtils.clamp(Math.abs(v.forwardSpeed) / 5.5, 0.55, 1.05)
          : THREE.MathUtils.clamp(Math.abs(v.forwardSpeed) / 6.5, 0.35, 1.0);
      const dirSign = v.forwardSpeed < -0.25 ? -1 : 1;
      v.yaw += steer * dt * turnRate * speedFactor * dirSign;
      if (isMotoOrAtv && !isWarhorse) {
        this.yaw += steer * dt * turnRate * speedFactor * dirSign * 0.55;
      }
    }

    // Dynamic Motorcycle / Scooter / E-Moto Cornering Lean (v.roll), Wheelie Pitch (v.pitch) & 3D Rider Visibility
    if (isMotoOrAtv) {
      const spdNorm = THREE.MathUtils.clamp(Math.abs(v.forwardSpeed) / Math.max(12, v.speed * 0.55), 0, 1);
      const targetBikeRoll = isWarhorse
        ? steer * spdNorm * 0.08
        : v.type === 'atv'
        ? -steer * spdNorm * 0.14
        : steer * spdNorm * 0.48;
      const targetBikePitch =
        isWheelieBoost && v.forwardSpeed > 3.5
          ? isWarhorse
            ? 0.14
            : v.type === 'atv'
            ? 0.18
            : v.isScooter
            ? 0.24
            : 0.36
          : 0;
      v.roll = THREE.MathUtils.lerp(v.roll || 0, targetBikeRoll, Math.min(1, dt * 8.5));
      v.pitch = THREE.MathUtils.lerp(v.pitch || 0, targetBikePitch, Math.min(1, dt * 7.5));

      const riderGroup = v.mesh?.userData?.riderGroup;
      if (riderGroup) {
        riderGroup.visible = Boolean(this.thirdPersonVehicle);
      }
    }

    if (isWarhorse) {
      // Tank-Style Horse Controls:
      // - WASD (`v.yaw`, `v.forwardSpeed`) steers and moves the Warhorse hull independently.
      // - Mouse Cursor (`this.yaw`, `this.pitch`) aims the Rider's Bow or Lance 360° around the saddle!
      const riderGroup = v.mesh?.userData?.riderGroup;
      if (riderGroup) {
        riderGroup.visible = Boolean(this.thirdPersonVehicle);
      }
      const headNeckGroup = v.mesh?.userData?.headNeckGroup;
      if (headNeckGroup) {
        v._gallopBobPhase = (v._gallopBobPhase || 0) + dt * (2.2 + Math.abs(v.forwardSpeed || 0) * 0.9);
        const speedNorm = THREE.MathUtils.clamp(Math.abs(v.forwardSpeed || 0) / 16, 0, 1);
        headNeckGroup.rotation.x = Math.sin(v._gallopBobPhase) * 0.08 * speedNorm;
        headNeckGroup.rotation.y = THREE.MathUtils.lerp(
          headNeckGroup.rotation.y || 0,
          THREE.MathUtils.clamp(steer * 0.28, -0.35, 0.35),
          Math.min(1, dt * 8)
        );
      }
    } else if (isDinoMount) {
      // On a Dino Mount, smoothly align the mount's body yaw toward the rider's look yaw
      let yawDiff = this.yaw - v.yaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      v.yaw += yawDiff * Math.min(1, dt * 6.5);

      const riderGroup = v.mesh?.userData?.riderGroup;
      if (riderGroup) {
        riderGroup.visible = Boolean(this.thirdPersonVehicle);
      }

      const headNeckGroup = v.mesh?.userData?.headNeckGroup;
      if (headNeckGroup) {
        v._gallopBobPhase = (v._gallopBobPhase || 0) + dt * (2.2 + Math.abs(v.forwardSpeed || 0) * 0.9);
        const speedNorm = THREE.MathUtils.clamp(Math.abs(v.forwardSpeed || 0) / 16, 0, 1);
        headNeckGroup.rotation.x = Math.sin(v._gallopBobPhase) * 0.08 * speedNorm;
        headNeckGroup.rotation.y = THREE.MathUtils.clamp(yawDiff * 0.55, -0.45, 0.45);
      }
    }

    // Enforce physical turret depression & elevation limits (e.g. M1A2/T-90M Tank: -10° to +20° max elevation)
    const pitchLimits =
      isWarhorse
        ? { min: -0.58, max: 0.65 }
        : this.vehicleManager && typeof this.vehicleManager.getVehiclePitchLimits === 'function'
        ? this.vehicleManager.getVehiclePitchLimits(v)
        : v.type === 'tank'
        ? { min: -0.18, max: 0.35 }
        : v.type === 'apc'
        ? { min: -0.18, max: 0.52 }
        : isAaVehicle
        ? { min: -0.14, max: 1.48 }
        : isMortar
        ? { min: -0.35, max: 0.85 }
        : { min: -0.21, max: 0.61 };
    this.pitch = THREE.MathUtils.clamp(this.pitch, pitchLimits.min, pitchLimits.max);

    if (turretDamaged && (v.type === 'tank' || v.type === 'apc')) {
      let tDiff = this.yaw - (v.turretYaw ?? this.yaw);
      while (tDiff > Math.PI) tDiff -= Math.PI * 2;
      while (tDiff < -Math.PI) tDiff += Math.PI * 2;
      const maxSlew = 1.45 * dt;
      v.turretYaw = (v.turretYaw ?? this.yaw) + THREE.MathUtils.clamp(tDiff, -maxSlew, maxSlew);
    } else {
      v.turretYaw = this.yaw;
    }
    v.turretPitch = this.pitch;
    this.pos.copy(v.pos);

    // Position camera in turret, Knight's raised saddle perspective, or 3rd-person chase view
    const lookDir = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    );

    if (this.thirdPersonVehicle) {
      if (isWarhorse && this.viewModelGroup) {
        this.viewModelGroup.visible = false;
      }
      const camH = isWarhorse ? 2.65 : isDinoMount ? 3.85 : isMotoOrAtv ? 2.15 : PLAYER.VEHICLE_3RD_PERSON_HEIGHT;
      const camD = isWarhorse ? -4.85 : isDinoMount ? -7.5 : isMotoOrAtv ? -5.35 : PLAYER.VEHICLE_3RD_PERSON_DIST;
      const pivotPos = v.pos.clone().add(new THREE.Vector3(0, isWarhorse ? 2.1 : 1.85, 0));
      const desiredCamPos = v.pos
        .clone()
        .add(new THREE.Vector3(0, camH, 0))
        .addScaledVector(lookDir, camD);
      const safeCamPos = this.resolveCameraWallCollision(pivotPos, desiredCamPos, 0.42);
      this.camera.position.copy(safeCamPos);
    } else if (isWarhorse) {
      // Accurate Knight on Horse First-Person Perspective:
      // Raised camera at the Knight's eye level in the saddle (y = +2.34m, z = +0.24m behind saddle center)
      // looking forward over the Warhorse's muscular neck, pointed ears, golden chamfron crest, and flowing mane!
      const gallopBob =
        Math.abs(v.forwardSpeed || 0) > 0.3
          ? Math.sin((v._gallopBobPhase || 0) * 2.0) * 0.045
          : 0;
      const saddleBackX = Math.sin(v.yaw) * 0.18;
      const saddleBackZ = Math.cos(v.yaw) * 0.18;
      const pivotPos = new THREE.Vector3(v.pos.x, v.pos.y + 2.38 + gallopBob, v.pos.z);
      const desiredCamPos = new THREE.Vector3(
        v.pos.x + saddleBackX,
        v.pos.y + 2.38 + gallopBob,
        v.pos.z + saddleBackZ
      );
      this.camera.position.copy(this.resolveCameraWallCollision(pivotPos, desiredCamPos, 0.36));
      this.recoilKickZ = THREE.MathUtils.lerp(this.recoilKickZ || 0, 0, Math.min(1, dt * 14));
      this.recoilOffsetPitch = THREE.MathUtils.lerp(this.recoilOffsetPitch || 0, 0, Math.min(1, dt * 12));
      if (this.viewModelGroup) {
        this.viewModelGroup.visible = true;
        const curWep = typeof this.currentWeapon === 'function' ? this.currentWeapon() : null;
        if (curWep && curWep.mesh) {
          curWep.mesh.visible = true;
          const isBowMountWep = Boolean(curWep.def && curWep.def.isBow && !curWep.def.isCrossbow);
          curWep.mesh.position.set(
            this.isAds ? (isBowMountWep ? 0.15 : 0.02) : 0.25,
            (this.isAds ? -0.11 : -0.19) + gallopBob * 0.4,
            (this.isAds ? -0.24 : -0.32) + (this.recoilKickZ || 0)
          );
          curWep.mesh.rotation.set(0, 0, 0);
          if (curWep.def && (curWep.def.isBow || curWep.def.isCrossbow)) {
            const maxCd = v.maxFireCooldown || 0.65;
            const cycleProg =
              v.fireCooldown > 0.01
                ? THREE.MathUtils.clamp(1 - v.fireCooldown / maxCd, 0.01, 0.99)
                : 0;
            animateBowOrCrossbowMesh(
              curWep.mesh,
              cycleProg,
              this.isAds ? 1 : 0,
              Boolean(curWep.def.isCrossbow),
              Boolean(this.fireArrowsActive)
            );
          }
        }
      }
    } else {
      const eyeH = isDinoMount ? 3.8 : v.isEmplacement ? 1.85 : isMotoOrAtv ? 1.62 : PLAYER.VEHICLE_1ST_PERSON_HEIGHT;
      this.camera.position.set(v.pos.x, v.pos.y + eyeH, v.pos.z);
    }

    const euler = new THREE.Euler(this.pitch + this.recoilOffsetPitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);
    this.camera.updateMatrixWorld();

    const targetFov = this.isAds ? PLAYER.VEHICLE_FOV_ADS : PLAYER.VEHICLE_FOV_NORMAL;
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, dt * 12);
    this.camera.updateProjectionMatrix();

    // Exact 3D Sight Ray passing directly through the center '+' crosshair (50vw, 50vh)
    const camOrigin = this.camera.getWorldPosition(new THREE.Vector3());
    const camDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();

    // Active Radar / IR Lock-On Scanner for Mobile AA (LAV-AD / Tunguska) & AA Emplacement (ZU-23-2)
    if (isAaVehicle) {
      let bestAirTarget = null;
      let bestAirDot = 0.82;
      if (this.vehicleManager && Array.isArray(this.vehicleManager.vehicles)) {
        for (const other of this.vehicleManager.vehicles) {
          if (!other.isAircraft || other.dead || other.isShotDown || other.team === this.team) continue;
          if (!other.driver && !other.aiPilotActive) continue;
          // Ground-Effect / Low-Altitude Radar Clutter Masking (< 28m AGL or < 4.0s post-takeoff) evades radar lock!
          const otherGroundY = this.world ? this.world.getGroundHeightAt(other.pos.x, other.pos.z) : 0;
          const otherAltAgl = Math.max(0, other.pos.y - otherGroundY);
          if (otherAltAgl < 28.0 || (other.airborneRadarTimer || 0) < 4.0 || other.isLowAltRadarMasked) continue;
          const toOther = other.pos.clone().sub(v.pos);
          const dist = toOther.length();
          if (dist < 15 || dist > 1250) continue;
          toOther.divideScalar(dist);
          const dot = toOther.dot(camDir);
          if (dot > bestAirDot) {
            bestAirDot = dot;
            bestAirTarget = other;
          }
        }
      }
      updateTargetLockScanner(this, bestAirTarget, dt, 1.6);
    }

    // Indirect-Fire Ballistic Range Calculator & 3D Impact Ring for 81mm Mortar Emplacement
    let mortarTargetPos = null;
    if (isMortar) {
      // Map pitch (-0.35..+0.85) or W/S range adjustment to 60m–550m indirect-fire range!
      const pitchNorm = THREE.MathUtils.clamp((this.pitch + 0.35) / 1.15, 0, 1);
      const mortarRange = 65 + pitchNorm * 485;
      const flatDir = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
      const tx = THREE.MathUtils.clamp(v.pos.x + flatDir.x * mortarRange, -1080, 1080);
      const tz = THREE.MathUtils.clamp(v.pos.z + flatDir.z * mortarRange, -640, 640);
      const ty = this.world ? this.world.getGroundHeightAt(tx, tz) : 0;
      mortarTargetPos = new THREE.Vector3(tx, ty + 0.35, tz);
      this.aircraftCcipPoint = mortarTargetPos;

      if (!this.ccipMarkerMesh && this.scene) {
        const ringGeo = new THREE.RingGeometry(4.5, 6.2, 28);
        ringGeo.rotateX(-Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0xff9f1a,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.78
        });
        this.ccipMarkerMesh = new THREE.Mesh(ringGeo, ringMat);
        this.scene.add(this.ccipMarkerMesh);
      }
      if (this.ccipMarkerMesh) {
        this.ccipMarkerMesh.visible = true;
        this.ccipMarkerMesh.position.copy(mortarTargetPos);
      }
    }

    // =========================================================================
    // SEPARATE TANK / ARMOR / AA / EMPLACEMENT WEAPON CONTROLS & FCS CONVERGENCE
    // =========================================================================
    const activeSlot = v.activeWeaponSlot || 0;
    const hasCoax = v.type === 'tank' || v.type === 'apc';
    const wantFirePrimary = this.isFiring && activeSlot === 0;
    const wantFireSecondaryOrCoax =
      Boolean(this.keys['Space']) ||
      Boolean(this.keys['KeyF']) ||
      (this.isFiring && activeSlot === 1);
    const wantFireCoax = hasCoax && !v.coaxOverheated && wantFireSecondaryOrCoax;

    const muzzleOrigin = v.pos
      .clone()
      .add(new THREE.Vector3(0, v.type === 'tank' ? 2.35 : v.isEmplacement ? 1.55 : 2.8, 0))
      .addScaledVector(lookDir, v.type === 'tank' ? 4.2 : 2.2);

    if ((wantFirePrimary || (isWarhorse && this.isFiring)) && v.fireCooldown <= 0) {
      const effectiveRpm =
        v.weaponType === 'aa_autocannon'
          ? Math.max(v.rpm || 1050, 1050)
          : v.weaponType === 'hmg'
          ? Math.max(v.rpm || 720, 720)
          : v.weaponType === 'autocannon'
          ? Math.max(v.rpm || 330, 330)
          : v.weaponType === 'mounted_warbow'
          ? Math.max(v.rpm || 95, 95)
          : v.weaponType === 'trex_roar_bite'
          ? Math.max(v.rpm || 65, 65)
          : v.weaponType === 'mortar_tube' || v.weaponType === 'trebuchet_boulder'
          ? Math.max(v.rpm || 24, 24)
          : v.rpm || 28;
      v.maxFireCooldown = 60 / effectiveRpm;
      v.fireCooldown = v.maxFireCooldown;
      events.emit('player:fired', {
        weapon: { shortName: v.weaponType },
        vehicle: v,
        type: v.weaponType
      });

      if ((v.weaponType === 'mortar_tube' || v.weaponType === 'trebuchet_boulder') && mortarTargetPos) {
        const isTreb = v.type === 'trebuchet' || v.weaponType === 'trebuchet_boulder';
        // 81mm Mortar Shell OR Medieval Siege Trebuchet Flaming Boulder
        v.barrelRecoil = isTreb ? 1.45 : 0.85;
        if (isTreb) {
          v.armSwingTimer = 1.15;
          v.bouldersLaunched = (v.bouldersLaunched || 0) + 1;
        }
        this.recoilOffsetPitch += 0.018;
        this.addShake(isTreb ? 0.38 : 0.28);
        sound.playRocketLaunch?.(0);
        this.world.spawnDebris(
          v.pos.clone().add(new THREE.Vector3(0, isTreb ? 4.2 : 1.8, 0)),
          new THREE.Color(isTreb ? 0xff7f11 : 0xdfe6e9),
          isTreb ? 7 : 4
        );

        const g = PROJECTILES.MORTAR_SHELL?.gravity || 18.0;
        const dx = mortarTargetPos.x - v.pos.x;
        const dz = mortarTargetPos.z - v.pos.z;
        const dy = mortarTargetPos.y - (v.pos.y + (isTreb ? 4.5 : 1.8));
        const horizDist = Math.max(20, Math.hypot(dx, dz));
        const flightTime = THREE.MathUtils.clamp(2.2 + horizDist / 115, 2.2, 6.2);
        const vx = dx / flightTime;
        const vz = dz / flightTime;
        const vy = (dy + 0.5 * g * flightTime * flightTime) / flightTime;

        const mMesh = new THREE.Mesh(
          isTreb
            ? new THREE.DodecahedronGeometry(0.68, 1)
            : new THREE.BoxGeometry(0.26, 0.26, 0.82),
          new THREE.MeshBasicMaterial({ color: isTreb ? 0xff6b00 : 0xff9f1a })
        );
        mMesh.position.set(v.pos.x, v.pos.y + (isTreb ? 4.5 : 1.8), v.pos.z);
        this.scene.add(mMesh);

        this.world.projectiles.push({
          type: 'mortar_shell',
          weaponName: isTreb
            ? 'SIEGE TREBUCHET BOULDER'
            : v.team === 'RU'
            ? '82MM 2B14 MORTAR'
            : '81MM M252 MORTAR',
          mesh: mMesh,
          vel: new THREE.Vector3(vx, vy, vz),
          gravity: g,
          life: flightTime + 2.5,
          blastRadius: isTreb ? 14.5 : 12.0,
          blastDamage: isTreb ? 380 : 340,
          owner: this
        });
        if (this.onAwardXp) {
          this.onAwardXp(
            0,
            isTreb
              ? `☄️ SIEGE TREBUCHET BOULDER HURLED (${Math.round(horizDist)}M • ETA ${flightTime.toFixed(1)}S)`
              : `🎯 81MM MORTAR SHELL FIRED (${Math.round(horizDist)}M • ETA ${flightTime.toFixed(1)}S)`
          );
        }
      } else if (v.weaponType === 'mounted_warbow') {
        const isRaptor = v.type === 'raptor_mount';
        // On a Warhorse:
        // - Slot 0 ([1], default): ALWAYS shoots 3D Feathered Bodkin Arrows from the Mounted Yew Longbow!
        // - Slot 1 ([2] or [Q]): Performs a Couched Cavalry Lance / Mounted Sword Strike!
        const useCouchedLance = !isRaptor && v.activeWeaponSlot === 1;

        if (useCouchedLance && typeof this.useMeleeSword === 'function') {
          // Mount & Blade Couched Cavalry Lance / Mounted Sword Strike!
          // Damage scales with Warhorse gallop velocity (up to 280 DMG one-shot couched lance impact!)
          const speedRatio = Math.min(1.6, Math.abs(v.forwardSpeed || 0) / 14.0);
          const lanceDmg = Math.round(145 + speedRatio * 95);
          this.recoilKickZ = -0.14;
          this.useMeleeSword({
            id: 'knight_lance',
            shortName: speedRatio >= 0.7 ? 'COUCHED CAVALRY LANCE' : 'MOUNTED POLEARM LANCE',
            type: 'melee_sword',
            isPolearm: true,
            damage: lanceDmg,
            headshotMult: 1.9,
            voxelDamage: 85,
            meleeRange: 6.8,
            maxCleaveTargets: 2
          });
        } else {
          // Mounted Archer on Warhorse (or Alpha Raptor): Loose 3D Feathered Bodkin Arrow along cursor aim!
          this.recoilKickZ = 0.095;
          this.recoilOffsetPitch += 0.005;
          this.addShake(0.03);
          if (isRaptor) {
            sound.playMeleeSwing?.(0, 0, false);
          } else {
            sound.playBowTwang?.(0, 0, false);
          }
          const arrowSpawnOrigin = camOrigin
            .clone()
            .addScaledVector(camDir, 0.65)
            .add(new THREE.Vector3(0, -0.08, 0));
          this.fireBallisticRay(
            camOrigin,
            camDir.clone(),
            isRaptor ? 75 : 98,
            2.5,
            35,
            isRaptor ? 'RAPTOR VENOM SPIT' : 'MOUNTED YEW LONGBOW',
            1.4,
            {
              isMountedMg: false,
              isBow: !isRaptor,
              isFireArrow: !isRaptor && Boolean(this.fireArrowsActive),
              isVenomSpit: isRaptor,
              muzzleVelocity: 68,
              bulletGravity: 4.2,
              maxEffectiveRange: 650,
              tracerEveryShots: 1
            },
            1,
            arrowSpawnOrigin
          );
        }
      } else if (v.weaponType === 'trex_roar_bite') {
        // Alpha Tyrannosaurus Rex: Crushing Jaw Bite + Concussive Roar Shockwave!
        this.addShake(0.42);
        sound.playExplosion(0);
        const bitePos = v.pos.clone().addScaledVector(lookDir, 6.2);
        bitePos.y = this.world.getGroundHeightAt(bitePos.x, bitePos.z) + 1.0;
        this.world.explodeAt(
          bitePos,
          8.5,
          260,
          (blastPos, rad, dmg, broken) => {
            if (this.onExplosionDamage) {
              this.onExplosionDamage(blastPos, rad, dmg, this, broken, 'T-REX APEX JAW CRUSH');
            }
          },
          this.onBroadcast
        );
      } else if (v.weaponType === 'aa_autocannon') {
        // Mobile AA (LAV-AD / 2K22 Tunguska) & AA Emplacement (ZU-23-2) Twin 25mm/30mm Proximity Autocannon
        this.recoilOffsetPitch += 0.0014;
        this.addShake(0.045);
        sound.playGunshot('autocannon', 0);

        const aaSpread = 0.0028;
        const aaDir = camDir
          .clone()
          .add(
            new THREE.Vector3(
              (Math.random() - 0.5) * aaSpread,
              (Math.random() - 0.5) * aaSpread,
              (Math.random() - 0.5) * aaSpread
            )
          )
          .normalize();
        const aaLabel = v.team === 'RU' ? '30MM 2A38M AA' : '25MM GAU-12 AA';
        const finalAaDir = this.applyDogfightLeadConvergence
          ? this.applyDogfightLeadConvergence(camOrigin, aaDir, 360, 4.5)
          : aaDir;

        // High-velocity AP-HEI ballistic rounds (360 m/s dogfight scale — aim at the HUD Lead Pipper!)
        this.fireBallisticRay(
          camOrigin,
          finalAaDir,
          62,
          2.0,
          95,
          aaLabel,
          2.1,
          {
            isMountedMg: true,
            muzzleVelocity: 360,
            bulletGravity: 4.5,
            maxEffectiveRange: 1250,
            tracerEveryShots: 1
          },
          1,
          muzzleOrigin
        );

        // Every 2nd shot also spawns a high-velocity proximity-fuzed AA airburst shell (`isAaProximity: true`)
        this._aaBurstToggle = ((this._aaBurstToggle || 0) + 1) % 2;
        if (this._aaBurstToggle === 0) {
          const shellMesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.18, 0.18, 0.65),
            new THREE.MeshBasicMaterial({ color: 0xff5252 })
          );
          shellMesh.position.copy(muzzleOrigin);
          shellMesh.lookAt(muzzleOrigin.clone().addScaledVector(aaDir, 10));
          this.scene.add(shellMesh);

          this.world.projectiles.push({
            type: 'autocannon',
            isAaProximity: true,
            weaponName: aaLabel,
            mesh: shellMesh,
            vel: aaDir.clone().multiplyScalar(175),
            gravity: 0.45,
            life: 4.5,
            blastRadius: 7.5,
            blastDamage: 120,
            owner: this
          });
        }
      } else if (v.weaponType === 'tank_cannon') {
        v.barrelRecoil = 1.0;
        this.recoilOffsetPitch += 0.022;
        this.addShake(0.42);
        if (typeof sound.playTankCannon === 'function') {
          sound.playTankCannon(0, 0);
        } else {
          sound.playExplosion(0);
        }
        this.world.spawnDebris(muzzleOrigin, new THREE.Color(0xffaa00), 5);

        const aimTarget = this.computeVehicleAimTarget(camOrigin, camDir, v, 140);
        const targetDist = muzzleOrigin.distanceTo(aimTarget.point);
        const shellSpeed = PROJECTILES.TANK_SHELL.speed;
        const shellGrav = PROJECTILES.TANK_SHELL.gravity;
        // Compensate for gravity up to ~135m zero range so medium-range shots hit dead-on '+'
        const compDist = Math.min(targetDist, 135);
        const flightTime = compDist / shellSpeed;
        const gravDropComp = 0.5 * shellGrav * flightTime * flightTime;
        const compensatedAimPoint = aimTarget.point
          .clone()
          .add(new THREE.Vector3(0, gravDropComp, 0));
        const launchDir = compensatedAimPoint.sub(muzzleOrigin).normalize();

        const shellMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.24, 0.24, 0.78),
          new THREE.MeshBasicMaterial({ color: 0xffaa00 })
        );
        shellMesh.position.copy(muzzleOrigin);
        shellMesh.lookAt(muzzleOrigin.clone().addScaledVector(launchDir, 10));
        this.scene.add(shellMesh);

        this.world.projectiles.push({
          type: 'tank_shell',
          mesh: shellMesh,
          vel: launchDir.multiplyScalar(shellSpeed),
          gravity: shellGrav,
          life: PROJECTILES.TANK_SHELL.life,
          owner: this
        });
      } else if (v.weaponType === 'autocannon') {
        this.recoilOffsetPitch += 0.0035;
        this.addShake(0.12);
        sound.playGunshot('autocannon', 0);

        const aimTarget = this.computeVehicleAimTarget(camOrigin, camDir, v, 150);
        const targetDist = muzzleOrigin.distanceTo(aimTarget.point);
        const acSpeed = PROJECTILES.AUTOCANNON.speed;
        const acGrav = PROJECTILES.AUTOCANNON.gravity;
        const compDist = Math.min(targetDist, 145);
        const flightTime = compDist / acSpeed;
        const gravDropComp = 0.5 * acGrav * flightTime * flightTime;
        const compensatedAimPoint = aimTarget.point
          .clone()
          .add(new THREE.Vector3(0, gravDropComp, 0));
        const launchDir = compensatedAimPoint.sub(muzzleOrigin).normalize();

        const shellMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.16, 0.16, 0.48),
          new THREE.MeshBasicMaterial({ color: 0xffcc00 })
        );
        shellMesh.position.copy(muzzleOrigin);
        shellMesh.lookAt(muzzleOrigin.clone().addScaledVector(launchDir, 10));
        this.scene.add(shellMesh);

        this.world.projectiles.push({
          type: 'autocannon',
          mesh: shellMesh,
          vel: launchDir.multiplyScalar(acSpeed),
          gravity: acGrav,
          life: PROJECTILES.AUTOCANNON.life,
          owner: this
        });
      } else {
        // Car-Mounted .50 Cal M2HB Heavy Machine Gun (720 RPM • High-Velocity AP-I • Dead-On '+' Crosshair)
        this.recoilOffsetPitch += 0.0018;
        this.addShake(0.035);
        sound.playGunshot('hmg', 0);
        const hmgSpread = 0.0016; // Stabilized pintle mount (~0.09° dispersion)
        const hmgDir = camDir
          .clone()
          .add(
            new THREE.Vector3(
              (Math.random() - 0.5) * hmgSpread,
              (Math.random() - 0.5) * hmgSpread,
              (Math.random() - 0.5) * hmgSpread
            )
          )
          .normalize();
        this.fireBallisticRay(
          camOrigin,
          hmgDir,
          68,
          2.0,
          110,
          '.50 CAL HMG',
          1.85,
          { isMountedMg: true, muzzleVelocity: 890, maxEffectiveRange: 650, tracerEveryShots: 2 },
          1,
          muzzleOrigin
        );
      }
    }

    // Separate Tank / APC Coaxial 7.62mm MG, Mobile AA Homing SAM Pod, or 81mm Mortar 3-Round Barrage ([SPACE] / [F] or Slot [2] + [LMB])
    if (isAaVehicle && wantFireSecondaryOrCoax && v.coaxCooldown <= 0) {
      v.coaxCooldown = 1.65;
      this.addShake(0.22);
      sound.playRocketLaunch?.(0);

      let samTarget = this.aircraftLockTarget;
      if (!samTarget && this.vehicleManager) {
        let bestDist = 1280;
        for (const other of this.vehicleManager.vehicles) {
          if (!other.isAircraft || other.dead || other.team === this.team) continue;
          const d = v.pos.distanceTo(other.pos);
          if (d < bestDist) {
            bestDist = d;
            samTarget = other;
          }
        }
      }

      const samDir = samTarget ? samTarget.pos.clone().sub(muzzleOrigin).normalize() : camDir.clone();
      const samMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.24, 1.45),
        new THREE.MeshBasicMaterial({ color: 0x00d2d3 })
      );
      samMesh.position.copy(muzzleOrigin);
      samMesh.lookAt(muzzleOrigin.clone().add(samDir));
      this.scene.add(samMesh);

      const samName = v.team === 'RU' ? '9M311 TUNGUSKA SAM' : 'FIM-92 STINGER SAM';
      this.world.projectiles.push({
        type: 'a2a_missile',
        weaponName: samName,
        weaponLabel: samName,
        mesh: samMesh,
        vel: samDir.multiplyScalar(PROJECTILES.STINGER_SAM?.speed || 265),
        gravity: 0,
        life: 6.5,
        turnRate: 5.2,
        targetVehicle: samTarget,
        blastRadius: 10.5,
        blastDamage: 560,
        owner: this
      });
      if (this.onAwardXp) {
        this.onAwardXp(
          0,
          samTarget
            ? `🚀 ${samName} LAUNCHED — HOMING LOCK ON ${samTarget.name}!`
            : `🚀 ${samName} LAUNCHED!`
        );
      }
    } else if (isMortar && wantFireSecondaryOrCoax && v.coaxCooldown <= 0 && mortarTargetPos) {
      // 3-Round Rapid Indirect-Fire Mortar Barrage Salvo
      v.coaxCooldown = 4.2;
      v.barrelRecoil = 1.0;
      this.addShake(0.36);
      sound.playRocketLaunch?.(0);
      const g = PROJECTILES.MORTAR_SHELL?.gravity || 18.0;
      for (let sIdx = 0; sIdx < 3; sIdx++) {
        const offX = (sIdx - 1) * 4.5 + (Math.random() - 0.5) * 3.0;
        const offZ = (Math.random() - 0.5) * 4.5;
        const dx = mortarTargetPos.x + offX - v.pos.x;
        const dz = mortarTargetPos.z + offZ - v.pos.z;
        const dy = mortarTargetPos.y - (v.pos.y + 1.8);
        const horizDist = Math.max(20, Math.hypot(dx, dz));
        const flightTime = THREE.MathUtils.clamp(2.2 + horizDist / 115 + sIdx * 0.22, 2.2, 6.6);
        const vx = dx / flightTime;
        const vz = dz / flightTime;
        const vy = (dy + 0.5 * g * flightTime * flightTime) / flightTime;

        const mMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.26, 0.26, 0.82),
          new THREE.MeshBasicMaterial({ color: 0xff5252 })
        );
        mMesh.position.set(v.pos.x, v.pos.y + 1.8 + sIdx * 0.35, v.pos.z);
        this.scene.add(mMesh);

        this.world.projectiles.push({
          type: 'mortar_shell',
          weaponName: v.team === 'RU' ? '82MM 2B14 MORTAR SALVO' : '81MM M252 MORTAR SALVO',
          mesh: mMesh,
          vel: new THREE.Vector3(vx, vy, vz),
          gravity: g,
          life: flightTime + 2.5,
          blastRadius: 12.0,
          blastDamage: 340,
          owner: this
        });
      }
      if (this.onAwardXp) {
        this.onAwardXp(0, '💥 3-ROUND 81MM MORTAR BARRAGE LAUNCHED!');
      }
    } else if (wantFireCoax && v.coaxCooldown <= 0) {
      const coaxRpm = Math.max(v.coaxRpm || 950, 950);
      const coaxInterval = 60 / coaxRpm;
      v.coaxCooldown = coaxInterval;
      v.coaxHeat = Math.min(1.0, (v.coaxHeat || 0) + coaxInterval * 0.24);
      if (v.coaxHeat >= 1.0) {
        v.coaxOverheated = true;
      }
      this.recoilOffsetPitch += 0.0012;
      this.addShake(0.02);
      sound.playGunshot('lmg', 0);
      const coaxOrigin = v.pos
        .clone()
        .add(new THREE.Vector3(0, v.type === 'tank' ? 2.35 : 2.65, 0))
        .addScaledVector(lookDir, 2.4);
      const coaxSpread = 0.002; // Stabilized turret coax (~0.11° dispersion)
      const coaxDir = camDir
        .clone()
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * coaxSpread,
            (Math.random() - 0.5) * coaxSpread,
            (Math.random() - 0.5) * coaxSpread
          )
        )
        .normalize();
      this.fireBallisticRay(
        camOrigin,
        coaxDir,
        52,
        1.9,
        65,
        '7.62MM COAX MG',
        1.45,
        { isMountedMg: true, muzzleVelocity: 840, maxEffectiveRange: 550, tracerEveryShots: 2 },
        1,
        coaxOrigin
      );
    }

    this.recoilOffsetPitch *= Math.pow(0.08, dt);
  },

  /**
   * Computes the exact 3D world point under the vehicle's center '+' crosshair (`camOrigin` + `camDir`)
   * so turret barrels converge accurately on targets in both 1st-person and 3rd-person camera views.
   */
  computeVehicleAimTarget(camOrigin, camDir, activeVeh, defaultDist = 140) {
    const isAir = Boolean(activeVeh && activeVeh.isAircraft);
    let bestDist = isAir ? 3600 : 420;
    let hitFound = false;

    if (this.world && typeof this.world.raycastVoxel === 'function') {
      const vHit = this.world.raycastVoxel(camOrigin, camDir, isAir ? 1600 : 420);
      if (vHit && vHit.distance > 4.5 && vHit.distance < bestDist) {
        bestDist = vHit.distance;
        hitFound = true;
      }
    }

    // For high-altitude aircraft / AC-130J aiming at terrain, intersect the terrain heightfield directly along camDir
    if (isAir && !hitFound && camDir.y < -0.02 && this.world) {
      const roughGroundY = 0;
      const tEst = (roughGroundY - camOrigin.y) / camDir.y;
      if (tEst > 8 && tEst < bestDist) {
        const hitX = camOrigin.x + camDir.x * tEst;
        const hitZ = camOrigin.z + camDir.z * tEst;
        const terrY = this.world.getGroundHeightAt(hitX, hitZ);
        const tRefined = Math.max(8, (terrY - camOrigin.y) / camDir.y);
        if (tRefined < bestDist) {
          bestDist = tRefined;
          hitFound = true;
        }
      }
    }

    if (this.botManager && Array.isArray(this.botManager.bots)) {
      for (let i = 0; i < this.botManager.bots.length; i++) {
        const b = this.botManager.bots[i];
        if (b.dead || b.downed || b.team === this.team || b.drivingVehicle) continue;
        const bx = b.pos.x - camOrigin.x;
        const by = b.pos.y + 0.95 - camOrigin.y;
        const bz = b.pos.z - camOrigin.z;
        const proj = bx * camDir.x + by * camDir.y + bz * camDir.z;
        if (proj < 3.5 || proj > bestDist) continue;
        const perpSq = bx * bx + by * by + bz * bz - proj * proj;
        if (perpSq <= 1.8) {
          bestDist = proj;
          hitFound = true;
        }
      }
    }

    if (this.vehicleManager && Array.isArray(this.vehicleManager.vehicles)) {
      for (let i = 0; i < this.vehicleManager.vehicles.length; i++) {
        const veh = this.vehicleManager.vehicles[i];
        if (!veh || veh === activeVeh || veh.dead || veh.team === this.team) continue;
        const vx = veh.pos.x - camOrigin.x;
        const vy = veh.pos.y + 1.35 - camOrigin.y;
        const vz = veh.pos.z - camOrigin.z;
        const proj = vx * camDir.x + vy * camDir.y + vz * camDir.z;
        if (proj < 5.0 || proj > bestDist) continue;
        const perpSq = vx * vx + vy * vy + vz * vz - proj * proj;
        if (perpSq <= 9.0) {
          bestDist = proj;
          hitFound = true;
        }
      }
    }

    const finalDist = hitFound ? Math.max(8, bestDist) : defaultDist;
    return {
      distance: finalDist,
      point: camOrigin.clone().addScaledVector(camDir, finalDist)
    };
  },

  /**
   * Spawns a visible 3D Angel-Wing Magnesium IR Flare & Chaff Decoy burst from both wings
   * so the pilot clearly sees bright glowing flares & smoke trails in both 1st-person cockpit
   * and 3rd-person chase views whenever countermeasures ([X] or Auto-DIRCM) are released!
   */
  spawnAircraftCountermeasureBurst(v, isInitialSalvo = false) {
    if (!v || !this.scene) return;
    if (!this._activeFlareDecoys) {
      this._activeFlareDecoys = [];
    }
    const isB2 = v.aircraftRole === 'b2_spirit' || v.isStealthAircraft;
    const isWright = v.aircraftRole === 'wright_flyer';
    const cosP = Math.cos(v.pitch || 0);
    const flightDir = new THREE.Vector3(
      -Math.sin(v.yaw || 0) * cosP,
      Math.sin(v.pitch || 0),
      -Math.cos(v.yaw || 0) * cosP
    ).normalize();
    const rightVec = new THREE.Vector3(Math.cos(v.yaw || 0), 0, -Math.sin(v.yaw || 0)).normalize();
    const pairsCount = isInitialSalvo ? 2 : 1;

    for (let pIdx = 0; pIdx < pairsCount; pIdx++) {
      for (const side of [-1, 1]) {
        const flareGroup = new THREE.Group();
        const coreColor = isB2 ? 0x00ffff : isWright ? 0xffeaa7 : 0xffffff;
        const haloColor = isB2 ? 0xa29bfe : isWright ? 0xf39c12 : 0xff7f11;

        const coreMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.45, 0.45, 0.45),
          new THREE.MeshBasicMaterial({ color: coreColor })
        );
        const haloMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.95, 0.95, 0.95),
          new THREE.MeshBasicMaterial({
            color: haloColor,
            transparent: true,
            opacity: 0.72
          })
        );
        flareGroup.add(coreMesh);
        flareGroup.add(haloMesh);

        // Spawn slightly ahead/outward of the wing roots so flares arc visibly across both 1st-person & 3rd-person views!
        const spawnPos = v.pos
          .clone()
          .addScaledVector(flightDir, 2.2 - pIdx * 2.4)
          .addScaledVector(rightVec, side * (2.6 + pIdx * 1.2))
          .add(new THREE.Vector3(0, 0.4 + pIdx * 0.35, 0));
        flareGroup.position.copy(spawnPos);
        this.scene.add(flareGroup);

        const lateralSpeed = (15.5 + pIdx * 5.5 + Math.random() * 4.0) * side;
        const upSpeed = 4.5 + pIdx * 2.8 + Math.random() * 2.5;
        const fwdCarry = Math.max(22, (v.forwardSpeed || 58) * 0.86);
        const vel = flightDir
          .clone()
          .multiplyScalar(fwdCarry)
          .addScaledVector(rightVec, lateralSpeed)
          .add(new THREE.Vector3(0, upSpeed, 0));

        this._activeFlareDecoys.push({
          mesh: flareGroup,
          haloMesh,
          vel,
          isB2,
          life: 2.1,
          maxLife: 2.1,
          smokeTimer: 0
        });
      }
    }

    if (this.world?.spawnDebris) {
      for (const side of [-1, 1]) {
        const puffPos = v.pos
          .clone()
          .addScaledVector(flightDir, 1.5)
          .addScaledVector(rightVec, side * 3.2);
        this.world.spawnDebris(puffPos, new THREE.Color(isB2 ? 0x00d2d3 : 0xffd32a), 5);
      }
    }
  },

  /**
   * Updates all airborne 3D IR Flare & Chaff Decoy projectiles and trails smoke behind them.
   */
  updateAircraftCountermeasureVisuals(dt, v) {
    // 1. Emit continuous Angel-Wing flare salvos while countermeasures are active (v.flareActiveTimer > 0)
    if (v && v.isAircraft && (v.flareActiveTimer || 0) > 0 && !v.dead) {
      v._cmSalvoBurstTimer = (v._cmSalvoBurstTimer || 0) - dt;
      if (v._cmSalvoBurstTimer <= 0) {
        v._cmSalvoBurstTimer = 0.22;
        this.spawnAircraftCountermeasureBurst(v, false);
      }
    }

    // 2. Step and fade active 3D flare decoy orbs
    if (!Array.isArray(this._activeFlareDecoys) || this._activeFlareDecoys.length === 0) return;
    for (let i = this._activeFlareDecoys.length - 1; i >= 0; i--) {
      const f = this._activeFlareDecoys[i];
      f.life -= dt;
      if (f.life <= 0 || !f.mesh) {
        if (f.mesh && this.scene) this.scene.remove(f.mesh);
        this._activeFlareDecoys.splice(i, 1);
        continue;
      }
      // Aerodynamic drag slows flare forward carry so it trails gracefully behind and outward from the wings
      f.vel.multiplyScalar(Math.pow(0.45, dt));
      f.vel.y -= 9.8 * dt;
      f.mesh.position.addScaledVector(f.vel, dt);
      f.mesh.rotation.x += dt * 7.5;
      f.mesh.rotation.y += dt * 9.2;
      const lifeRatio = THREE.MathUtils.clamp(f.life / f.maxLife, 0, 1);
      const pulse = 0.85 + 0.35 * Math.sin(performance.now() * 0.035 + i);
      f.mesh.scale.setScalar(lifeRatio * pulse);
      if (f.haloMesh && f.haloMesh.material) {
        f.haloMesh.material.opacity = 0.75 * lifeRatio;
      }
      f.smokeTimer -= dt;
      if (f.smokeTimer <= 0 && this.world?.spawnDebris) {
        f.smokeTimer = 0.065;
        this.world.spawnDebris(
          f.mesh.position.clone(),
          new THREE.Color(f.isB2 ? 0x74b9ff : lifeRatio > 0.5 ? 0xffeaa7 : 0xdfe6e9),
          1
        );
      }
    }
  },

  /**
   * Toggles Aircraft Collision Avoidance between:
   * - `true` (DEFAULT: AUTO ON — automatic pull-up & ground/building protection for easier flight control)
   * - `false` (OFF: REALISTIC CRASH MODE — planes crash and explode if flown into the ground, mountains, or buildings!)
   */
  toggleAircraftCollisionAvoidance(forceVal) {
    if (typeof forceVal === 'boolean') {
      this.aircraftCollisionAvoidance = forceVal;
    } else {
      this.aircraftCollisionAvoidance = this.aircraftCollisionAvoidance === false;
    }
    try {
      localStorage.setItem(
        'bb_aircraft_collision_avoidance_v1',
        this.aircraftCollisionAvoidance ? '1' : '0'
      );
    } catch (_) {}
    return this.aircraftCollisionAvoidance;
  },

  /**
   * Returns the highest obstacle Y (terrain + any standing building/tower/castle voxels) at (wx, wz).
   */
  getAircraftObstacleHeightAt(wx, wz) {
    const terrY = this.world ? this.world.getGroundHeightAt(wx, wz) : 0;
    if (!this.world || !this.world.voxels) return terrY;
    let maxY = terrY;
    const g = this.world.worldToGrid(wx, terrY + 0.5, wz);
    for (let dy = 0; dy <= 18; dy++) {
      const vox = this.world.voxels.get(this.world.key(g.gx, g.gy + dy, g.gz));
      if (vox && !vox.isProp) {
        maxY = Math.max(maxY, vox.maxY ?? terrY + (dy + 1) * 1.25);
      }
    }
    return maxY;
  },

  /**
   * Checks if any part of the 3D aircraft airframe (nose, fuselage, tail, left/right wingtips)
   * is intersecting a solid building, castle wall, tower, or container voxel at `pos`.
   */
  checkAircraftStructureCollision(v, pos, flightDir) {
    if (!this.world || !this.world.voxels) return null;
    const rightX = Math.cos(v.yaw || 0);
    const rightZ = -Math.sin(v.yaw || 0);
    const wingSpan = v.aircraftRole === 'b2_spirit' ? 6.5 : 4.2;
    const checkPoints = [
      [pos.x + flightDir.x * 4.5, pos.y + flightDir.y * 4.5, pos.z + flightDir.z * 4.5], // Nose cone
      [pos.x, pos.y, pos.z], // Center fuselage
      [pos.x - flightDir.x * 3.2, pos.y - flightDir.y * 3.2, pos.z - flightDir.z * 3.2], // Tail
      [pos.x + rightX * wingSpan, pos.y + Math.sin(v.roll || 0) * wingSpan, pos.z + rightZ * wingSpan], // Right wingtip
      [pos.x - rightX * wingSpan, pos.y - Math.sin(v.roll || 0) * wingSpan, pos.z - rightZ * wingSpan] // Left wingtip
    ];
    for (let i = 0; i < checkPoints.length; i++) {
      const [px, py, pz] = checkPoints[i];
      const g = this.world.worldToGrid(px, py, pz);
      const hitVox = this.world.voxels.get(this.world.key(g.gx, g.gy, g.gz));
      if (hitVox && !hitVox.isProp) {
        return { point: new THREE.Vector3(px, py, pz), voxel: hitVox, grid: g };
      }
    }
    return null;
  },

  /**
   * Accessible Mouse-Aim Flight, AC-130J Pylon-Turn Orbit Assist, CCIP Ground Bombing Reticle,
   * Air-to-Air Missile Lock-On, and A-10C / Strike Fighter / AC-130J Weapons Loop.
   */
  updateAircraftControl(dt, v) {
    const throttleInput = (this.keys['KeyW'] ? 1 : 0) - (this.keys['KeyS'] ? 1 : 0);
    const bankInput = (this.keys['KeyA'] ? 1 : 0) - (this.keys['KeyD'] ? 1 : 0);
    const isGunship = v.aircraftRole === 'gunship';

    // Passive Airframe Self-Repair (Combat Pilot: +25 HP/s, Standard: +8 HP/s) & Auto-DIRCM Missile Spoofing
    const airRegen = v.passiveRegenPerSec || (this.role === 'pilot' ? 25 : 8);
    if (v.hp < v.maxHp) {
      v.hp = Math.min(v.maxHp, v.hp + airRegen * dt);
    }
    if (
      (v.hasAutoDircm || this.role === 'pilot' || isGunship) &&
      (v.flareCooldown || 0) <= 0 &&
      this.world &&
      Array.isArray(this.world.projectiles)
    ) {
      for (const p of this.world.projectiles) {
        if (p.type === 'a2a_missile' && p.targetVehicle === v && p.mesh) {
          if (p.mesh.position.distanceToSquared(v.pos) < 250 * 250) {
            v.flareActiveTimer = 3.5;
            v.flareCooldown = 9.0 * (v.customFlareCdMult || (this.role === 'pilot' ? 0.72 : 1.0));
            p.targetVehicle = null;
            this.spawnAircraftCountermeasureBurst?.(v, true);
            v._cmSalvoBurstTimer = 0.18;
            if (this.onAwardXp) {
              this.onAwardXp(25, '✨ AUTO-DIRCM LASER JAMMER & FLARES SPOOFED INCOMING SAM!');
            }
            break;
          }
        }
      }
    }
    this.updateAircraftCountermeasureVisuals?.(dt, v);

    const isWright = v.aircraftRole === 'wright_flyer';
    const cruiseSpd = v.speed || 62;
    const minSpd = v.minSpeed || 32;
    const maxSpd = v.maxSpeed || 96;
    const groundH = this.world ? this.world.getGroundHeightAt(v.pos.x, v.pos.z) : 0;
    const altAgl = v.pos.y - groundH;
    const onRunway = altAgl < 2.2;
    const maxAirspaceAlt = VEHICLE_STATS.AIRSPACE_MAX_ALT || 3500;

    // =========================================================================
    // 0. SHOT-DOWN MAYDAY SPIRAL DIVE (Plane hit 0 HP in mid-air — does NOT explode mid-air!
    //    Pilot MUST press [E] to eject seat before the burning plane slams into the ground!)
    // =========================================================================
    if (v.isShotDown) {
      v.shotDownTimer = Math.max(0, (v.shotDownTimer ?? 14.0) - dt);
      v.forwardSpeed = Math.max(26, (v.forwardSpeed || 45) - 4.5 * dt);
      v.roll = (v.roll || 0) + (v.shotDownSpinDir || 1) * 2.15 * dt;
      v.yaw = (v.yaw || 0) + (v.shotDownSpinDir || 1) * 0.95 * dt;
      v.pitch = THREE.MathUtils.lerp(v.pitch || 0, -0.58, Math.min(1, dt * 1.9));
      const sinkSpeed = 21.0 + (14.0 - v.shotDownTimer) * 3.4;

      const cosSD = Math.cos(v.pitch);
      v.pos.x += -Math.sin(v.yaw) * cosSD * v.forwardSpeed * 0.65 * dt;
      v.pos.z += -Math.cos(v.yaw) * cosSD * v.forwardSpeed * 0.65 * dt;
      v.pos.y -= sinkSpeed * dt;
      if (!v.velVector) v.velVector = new THREE.Vector3();
      v.velVector.set(0, -sinkSpeed, 0);

      v._smokeAccum = (v._smokeAccum || 0) + dt;
      if (v._smokeAccum > 0.085 && this.world?.spawnDebris) {
        v._smokeAccum = 0;
        this.world.spawnDebris(
          v.pos.clone().add(new THREE.Vector3(0, 0.8, 0)),
          new THREE.Color(Math.random() < 0.55 ? 0xff5252 : 0x2f3640),
          5
        );
      }
      this.addShake(0.18 * dt * 60);

      const crashGroundH = this.world ? this.world.getGroundHeightAt(v.pos.x, v.pos.z) : 0;
      if (v.pos.y <= crashGroundH + 2.4 || v.shotDownTimer <= 0) {
        v.pos.y = crashGroundH + 0.5;
        this.vehicleManager?.finalizeShotDownCrash?.(v);
        return;
      }

      v.turretYaw = this.yaw;
      v.turretPitch = this.pitch;
      v.mesh.position.copy(v.pos);
      v.mesh.rotation.set(v.pitch, v.yaw, v.roll, 'YXZ');
      this.pos.copy(v.pos);
    } else {
      // =========================================================================
      // 1. REALISTIC NON-INSTANT THROTTLE & PROGRESSIVE ENGINE SPOOL ACCELERATION
      //    + WRIGHT FLYER SLOW INITIAL SPOOL -> INCREDIBLE 846 KM/H TOP SPEED
      // =========================================================================
      if (typeof v.throttle !== 'number') {
        v.throttle = onRunway ? 0.0 : isWright ? 0.14 : 0.56;
      }
      if (throttleInput > 0) {
        const spoolUpRate = isWright ? 0.14 : 0.34;
        v.throttle = Math.min(1.0, v.throttle + dt * spoolUpRate);
      } else if (throttleInput < 0) {
        const spoolDownRate = onRunway ? 0.75 : 0.48;
        v.throttle = Math.max(0.0, v.throttle - dt * spoolDownRate);
      }

      // Target airspeed from current throttle setting (0% throttle can drop below stall speed!)
      const minThrottleSpd = onRunway ? 0 : isWright ? 3.5 : minSpd * 0.52;
      const desiredThrottleSpd =
        onRunway && v.throttle < 0.03 ? 0 : THREE.MathUtils.lerp(minThrottleSpd, maxSpd, v.throttle);

      // Gravity pitch-speed coupling: climbing bleeds airspeed, diving builds airspeed
      const gravityAccel = onRunway ? 0 : -Math.sin(v.pitch || 0) * (isWright ? 11.5 : 16.5);
      const curSpd = v.forwardSpeed || 0;
      const spdDiff = desiredThrottleSpd - curSpd;

      let engineAccelRate;
      if (spdDiff >= 0) {
        if (isWright) {
          // Wright Flyer / Sikorsky Muromets: starts with a slow, vintage 5.8 m/s² acceleration
          // so it feels slow at first, then progressively spools up to its 235 m/s (846 km/h) top speed!
          engineAccelRate = curSpd < 18 ? 5.8 : curSpd < 45 ? 9.5 : 16.5 + (curSpd / maxSpd) * 14.0;
        } else {
          // Realistic gradual jet turbofan acceleration (not instant!)
          engineAccelRate = (v.accelRate || 2.8) * 4.4;
        }
      } else {
        // Airbrake / aerodynamic drag deceleration when throttling down
        engineAccelRate = throttleInput < 0 ? (v.brakeRate || 2.8) * 6.2 : 5.5;
      }

      const maxDeltaV = engineAccelRate * dt;
      const engineStep = THREE.MathUtils.clamp(spdDiff, -maxDeltaV, maxDeltaV);
      v.forwardSpeed = Math.max(0, Math.min(maxSpd * 1.08, curSpd + engineStep + gravityAccel * dt));

      // =========================================================================
      // 2. AERODYNAMIC STALL & FALLING TO THE GROUND (When Airspeed Drops Below Stall Threshold)
      // =========================================================================
      const stallSpd = isWright ? 7.8 : minSpd * 0.94;
      const isAirborneForStall =
        !onRunway && altAgl > 14.0 && !isGunship && !(throttleInput > 0 && altAgl < 24.0);
      if (isAirborneForStall && v.forwardSpeed < stallSpd) {
        if (!v.isStalling) {
          v.isStalling = true;
          v.flightFSM?.send(AIRCRAFT_FLIGHT_EVENTS.ENTER_STALL);
          v.stallSinkVel = Math.min(-3.5, (v.velVector?.y || 0) - 3.0);
          sound.playRadioBeep?.(false);
          if (this.onAwardXp) {
            this.onAwardXp(
              0,
              `⚠️ AERODYNAMIC STALL (${Math.round(v.forwardSpeed * 3.6)} KM/H < ${Math.round(
                stallSpd * 3.6
              )} KM/H STALL) — FALLING! HOLD [W] & PUSH NOSE DOWN TO RECOVER!`
            );
          }
        }
        const liftFrac = THREE.MathUtils.clamp(v.forwardSpeed / Math.max(1, stallSpd), 0, 1);
        v.stallSinkVel = Math.max(-36.0, (v.stallSinkVel || -4.0) - 21.0 * (1.18 - liftFrac) * dt);
      } else if (v.isStalling) {
        if (v.forwardSpeed >= stallSpd * 1.04 || onRunway) {
          v.isStalling = false;
          v.stallSinkVel = 0;
          v.flightFSM?.send(
            onRunway ? AIRCRAFT_FLIGHT_EVENTS.TOUCHDOWN : AIRCRAFT_FLIGHT_EVENTS.RECOVER_STALL
          );
          if (!onRunway && this.onAwardXp) {
            this.onAwardXp(0, '✅ AIRSPEED RESTORED — RECOVERED FROM STALL!');
          }
        } else {
          v.stallSinkVel = THREE.MathUtils.lerp(v.stallSinkVel || 0, 0, Math.min(1, dt * 4.0));
        }
      } else {
        v.stallSinkVel = 0;
      }
      syncAircraftFlightFSM(v, { onRunway });

      // 3. Coordinated Bank-to-Turn Mouse-Aim Flight OR AC-130J Pylon-Turn Orbit Assist
      this.pitch = THREE.MathUtils.clamp(this.pitch, -1.25, 1.22);
      if (isGunship && !onRunway) {
        if (typeof v.targetGunshipAlt !== 'number') {
          v.targetGunshipAlt = Math.max(165, v.pos.y || 165);
        }
        if (throttleInput !== 0) {
          v.targetGunshipAlt = THREE.MathUtils.clamp(
            v.targetGunshipAlt + throttleInput * 55 * dt,
            95,
            maxAirspaceAlt
          );
        }
        const yawRate = bankInput !== 0 ? bankInput * 0.65 : 0.14;
        v.yaw += yawRate * dt;
        const altErr = v.targetGunshipAlt - v.pos.y;
        const targetGunshipPitch = THREE.MathUtils.clamp(altErr * 0.014, -0.32, 0.32);
        const targetGunshipRoll = bankInput !== 0 ? bankInput * 0.45 : 0.32;
        v.pitch = THREE.MathUtils.lerp(v.pitch || 0, targetGunshipPitch, dt * 3.2);
        v.roll = THREE.MathUtils.lerp(v.roll || 0, targetGunshipRoll, dt * 3.0);
        this.vehicleManager?.updateAircraftControlSurfacesAndVortices?.(
          v,
          dt,
          targetGunshipRoll - (v.roll || 0),
          targetGunshipPitch - (v.pitch || 0),
          yawRate
        );
      } else {
        if (bankInput !== 0) {
          this.yaw += bankInput * (v.turnRate || 1.35) * 0.85 * dt;
        }

        let yawDiff = this.yaw - v.yaw;
        while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
        while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;

        // True Coordinated Bank-to-Turn Aerodynamics:
        // 1. Aircraft smoothly rolls its wings into the desired turn (+yawDiff = left turn = +roll left wing down)
        // 2. The aircraft's heading turn rate (d(v.yaw)/dt) is driven primarily by its physical wing bank angle
        //    sin(v.roll), eliminating flat-wing sideways skidding and producing natural, sweeping flight arcs!
        const maxBankRad = v.aircraftRole === 'fighter' ? 1.08 : v.aircraftRole === 'b2_spirit' ? 0.72 : 0.92;
        const stallBuffetRoll = v.isStalling ? Math.sin(performance.now() * 0.015) * 0.38 : 0;
        const targetRoll = onRunway
          ? 0
          : THREE.MathUtils.clamp(yawDiff * 1.95 + bankInput * 0.72 + stallBuffetRoll, -maxBankRad, maxBankRad);
        const rollResponse = v.aircraftRole === 'fighter' ? 5.8 : v.aircraftRole === 'b2_spirit' ? 3.8 : 4.8;
        v.roll = THREE.MathUtils.lerp(v.roll || 0, targetRoll, Math.min(1, dt * rollResponse));

        // Bank-driven coordinated turn rate + gentle rudder alignment for fine aiming (< 8 deg)
        const fineRudderTrim = THREE.MathUtils.clamp(yawDiff, -0.22, 0.22) * 1.25;
        const bankedTurnRate = onRunway
          ? yawDiff * 2.8
          : Math.sin(v.roll) * (v.turnRate || 1.35) * 1.32 + fineRudderTrim;
        v.yaw += bankedTurnRate * dt;

        const insideSecretCave = isWright && Math.abs(v.pos.x) > 1014;
        const liftoffSpeed = isWright ? 8.2 : Math.max(minSpd * 0.98, 30);
        const collisionAvoidAuto = this.aircraftCollisionAvoidance !== false;
        if (altAgl > 8.5) {
          v.hasLeftRunwayOnce = true;
        } else if (onRunway && v.forwardSpeed < 12) {
          v.hasLeftRunwayOnce = false;
        }

        // Lookahead obstacle height (mountains + buildings 35m ahead) for Auto Collision Avoidance
        let lookaheadObstacleH = groundH;
        if (collisionAvoidAuto && !insideSecretCave && !onRunway) {
          const lookX = v.pos.x - Math.sin(v.yaw) * 36;
          const lookZ = v.pos.z - Math.cos(v.yaw) * 36;
          const curObsH = this.getAircraftObstacleHeightAt(v.pos.x, v.pos.z);
          const fwdObsH = this.getAircraftObstacleHeightAt(lookX, lookZ);
          lookaheadObstacleH = Math.max(groundH, curObsH, fwdObsH);
        }
        const effectiveClearance = v.pos.y - lookaheadObstacleH;

        // Banking tilts the lift vector, requiring slight nose-up pitch support during turns
        let desiredPitch = this.pitch + (!onRunway ? Math.abs(Math.sin(v.roll)) * 0.055 : 0);
        if (v.isStalling) {
          // Aerodynamic stall forces the nose downward toward the ground until airspeed is recovered!
          desiredPitch = Math.min(desiredPitch, -0.45);
          this.pitch = THREE.MathUtils.lerp(this.pitch, -0.38, Math.min(1, dt * 1.8));
        } else if (insideSecretCave) {
          desiredPitch = THREE.MathUtils.clamp(desiredPitch, -0.04, 0.08);
        } else if (onRunway && v.forwardSpeed > liftoffSpeed && desiredPitch > -0.05) {
          desiredPitch = Math.max(desiredPitch, 0.22);
        } else if (
          collisionAvoidAuto &&
          !onRunway &&
          effectiveClearance < (isWright ? 14 : 28) &&
          desiredPitch < 0.24 &&
          throttleInput >= 0
        ) {
          // COLLISION AVOIDANCE (AUTO ON): Auto pull-up nose over ground, mountain slopes & tall buildings!
          const pullSpan = isWright ? 14 : 28;
          const pullFrac = THREE.MathUtils.clamp((pullSpan - effectiveClearance) / pullSpan, 0, 1);
          desiredPitch = THREE.MathUtils.lerp(desiredPitch, 0.26, pullFrac);
          this.pitch = THREE.MathUtils.lerp(this.pitch, Math.max(this.pitch, 0.12), pullFrac * dt * 4.5);
        }
        v.pitch = THREE.MathUtils.lerp(v.pitch || 0, desiredPitch, Math.min(1, dt * 4.6));

        this.vehicleManager?.updateAircraftControlSurfacesAndVortices?.(
          v,
          dt,
          targetRoll - (v.roll || 0),
          desiredPitch - (v.pitch || 0),
          yawDiff
        );
      }

      // 4. Advance 3D Aircraft Position with Aerodynamic Velocity Inertia & Angle-of-Attack Blending
      const cosP = Math.cos(v.pitch);
      const noseDir = new THREE.Vector3(
        -Math.sin(v.yaw) * cosP,
        Math.sin(v.pitch),
        -Math.cos(v.yaw) * cosP
      ).normalize();
      if (!v._aeroFlightDir) {
        v._aeroFlightDir = noseDir.clone();
      } else {
        // Smooth aerodynamic angle-of-attack / momentum alignment so the plane carves fluid 3D curves in the air
        v._aeroFlightDir.lerp(noseDir, Math.min(1, dt * (onRunway ? 14.0 : 6.8))).normalize();
      }
      const flightDir = v._aeroFlightDir;
      const stallSinkY = v.isStalling ? v.stallSinkVel || 0 : 0;
      if (!v.velVector) v.velVector = new THREE.Vector3();
      v.velVector.copy(flightDir).multiplyScalar(v.forwardSpeed);
      v.velVector.y += stallSinkY;

      const maxAirX = VEHICLE_STATS.AIRSPACE_MAX_X || 2400;
      const maxAirZ = VEHICLE_STATS.AIRSPACE_MAX_Z || 1650;
      v.pos.x = THREE.MathUtils.clamp(v.pos.x + flightDir.x * v.forwardSpeed * dt, -maxAirX, maxAirX);
      v.pos.z = THREE.MathUtils.clamp(v.pos.z + flightDir.z * v.forwardSpeed * dt, -maxAirZ, maxAirZ);
      const newGroundH = this.world ? this.world.getGroundHeightAt(v.pos.x, v.pos.z) : 0;
      const nextY = v.pos.y + (flightDir.y * v.forwardSpeed + stallSinkY) * dt;
      const collisionAvoidAuto = this.aircraftCollisionAvoidance !== false;
      const insideSecretCaveNow = isWright && Math.abs(v.pos.x) > 1014;

      // =========================================================================
      // AIRCRAFT COLLISION AVOIDANCE (AUTO ON BY DEFAULT) VS. REALISTIC CRASH MODE (OFF)
      // =========================================================================
      if (!collisionAvoidAuto && !insideSecretCaveNow) {
        // REALISTIC MODE (Collision Avoidance OFF):
        // 1) Check 3D collision against Buildings, Castles, Radar Towers & Voxel Structures!
        const candidatePos = new THREE.Vector3(v.pos.x, nextY, v.pos.z);
        const structHit =
          v.forwardSpeed > 10.0 ? this.checkAircraftStructureCollision(v, candidatePos, flightDir) : null;
        if (structHit) {
          v.pos.y = nextY;
          if (this.world && typeof this.world.explodeAt === 'function') {
            this.world.explodeAt(
              structHit.point,
              8.5,
              380,
              (blastPos, rad, dmg, broken) => {
                if (this.onExplosionDamage) {
                  this.onExplosionDamage(blastPos, rad, dmg, this, broken, 'AIRCRAFT BUILDING CRASH');
                }
              },
              this.onBroadcast
            );
          }
          v.shotDownAttacker = {
            attackerName: this.name || 'PILOT ERROR',
            attackerTeam: v.team === 'US' ? 'RU' : 'US',
            weaponName: 'CRASHED INTO BUILDING / STRUCTURE'
          };
          this.vehicleManager?.finalizeShotDownCrash?.(v);
          return;
        }

        // 2) Check Realistic Ground & Mountain Impact!
        //    In Realistic Mode, flying into the ground or a mountain slope (diving nose-down,
        //    striking a banked wingtip, slamming at high vertical sink rate, or impacting terrain after takeoff)
        //    causes an immediate catastrophic crash explosion!
        if (nextY <= newGroundH + 1.15) {
          const vertSinkMs = flightDir.y * v.forwardSpeed + stallSinkY;
          const aheadGroundH = this.world
            ? this.world.getGroundHeightAt(v.pos.x + flightDir.x * 5.0, v.pos.z + flightDir.z * 5.0)
            : newGroundH;
          const hittingSteepSlope = aheadGroundH - newGroundH > 1.05 && v.forwardSpeed > 22;
          const noseDiving = v.pitch < -0.14 || vertSinkMs < -7.5;
          const wingtipStrike = Math.abs(v.roll || 0) > 0.34 && v.forwardSpeed > 18;
          const highSpeedTouchdown = Boolean(v.hasLeftRunwayOnce && v.forwardSpeed > 32);

          if (v.isStalling || hittingSteepSlope || noseDiving || wingtipStrike || highSpeedTouchdown) {
            v.pos.y = newGroundH + 0.5;
            if (this.world && typeof this.world.explodeAt === 'function') {
              this.world.explodeAt(
                v.pos.clone(),
                9.0,
                360,
                (blastPos, rad, dmg, broken) => {
                  if (this.onExplosionDamage) {
                    this.onExplosionDamage(blastPos, rad, dmg, this, broken, 'AIRCRAFT GROUND CRASH');
                  }
                },
                this.onBroadcast
              );
            }
            v.shotDownAttacker = {
              attackerName: this.name || 'PILOT ERROR',
              attackerTeam: v.team === 'US' ? 'RU' : 'US',
              weaponName: hittingSteepSlope
                ? 'CRASHED INTO MOUNTAIN / TERRAIN'
                : 'CRASHED INTO GROUND'
            };
            this.vehicleManager?.finalizeShotDownCrash?.(v);
            return;
          }
        }
      } else {
        // COLLISION AVOIDANCE: AUTO ON (Default — Easier Flight Control)
        // Automatically cushions altitude over buildings, mountains & ground (unless in a deep unrecovered stall crash)
        if (v.isStalling && nextY <= newGroundH + 1.8 && stallSinkY < -12.0) {
          v.pos.y = newGroundH + 0.5;
          v.shotDownAttacker = {
            attackerName: 'AERODYNAMIC STALL CRASH',
            attackerTeam: v.team === 'US' ? 'RU' : 'US',
            weaponName: 'AERODYNAMIC STALL GROUND IMPACT'
          };
          this.vehicleManager?.finalizeShotDownCrash?.(v);
          return;
        }
        if (!insideSecretCaveNow && v.hasLeftRunwayOnce && !v.isStalling) {
          const obsTopY = this.getAircraftObstacleHeightAt(v.pos.x, v.pos.z);
          if (obsTopY > newGroundH + 1.0 && nextY < obsTopY + 3.2) {
            // Auto Collision Avoidance smoothly lifts the plane over the building/tower roof!
            v.pos.y = THREE.MathUtils.clamp(
              THREE.MathUtils.lerp(v.pos.y, obsTopY + 4.0, Math.min(1, dt * 8.0)),
              newGroundH,
              maxAirspaceAlt
            );
            v.pitch = Math.max(v.pitch, 0.14);
          } else {
            v.pos.y = THREE.MathUtils.clamp(nextY, newGroundH, maxAirspaceAlt);
          }
        } else {
          v.pos.y = THREE.MathUtils.clamp(nextY, newGroundH, maxAirspaceAlt);
        }
      }

      if (collisionAvoidAuto === false) {
        v.pos.y = THREE.MathUtils.clamp(nextY, newGroundH, maxAirspaceAlt);
      }
      if (v.isStalling && v.pos.y <= newGroundH + 0.5) {
        v.isStalling = false;
        v.stallSinkVel = 0;
      }

      // Gentle auto-turn-back if flying beyond 2,200m airspace perimeter
      if (Math.abs(v.pos.x) > maxAirX - 180 || Math.abs(v.pos.z) > maxAirZ - 180) {
        const toCenterYaw = Math.atan2(v.pos.x, v.pos.z);
        let bDiff = toCenterYaw - this.yaw;
        while (bDiff > Math.PI) bDiff -= Math.PI * 2;
        while (bDiff < -Math.PI) bDiff += Math.PI * 2;
        this.yaw += bDiff * dt * 1.8;
        if (isGunship) v.yaw += bDiff * dt * 1.8;
      }

      v.turretYaw = this.yaw;
      v.turretPitch = this.pitch;
      v.mesh.position.copy(v.pos);
      v.mesh.rotation.set(v.pitch, v.yaw, v.roll, 'YXZ');
      this.pos.copy(v.pos);

      // Update Radar Altimeter & Low-Altitude Ground-Clutter Radar Stealth (< 28m AGL) + Takeoff Grace Timer
      const curAltAgl = Math.max(0, v.pos.y - newGroundH);
      if (curAltAgl < 6.5) {
        v.airborneRadarTimer = 0;
      } else {
        v.airborneRadarTimer = (v.airborneRadarTimer || 0) + dt;
      }
      v.isLowAltRadarMasked = curAltAgl < 28.0 || v.airborneRadarTimer < 4.0;
    }

    // Continuous WebAudio Aircraft Engine & Afterburner / Turboprop Sound Synthesizer
    sound.updateAircraftEngineAudio?.(
      v,
      this.vehicleManager ? this.vehicleManager.vehicles : [],
      this.pos,
      this.yaw,
      Boolean(this.keys?.['KeyW'])
    );

    const cosFlightP = Math.cos(v.pitch || 0);
    const flightDir = new THREE.Vector3(
      -Math.sin(v.yaw || 0) * cosFlightP,
      Math.sin(v.pitch || 0),
      -Math.cos(v.yaw || 0) * cosFlightP
    ).normalize();

    // 4. Position Camera (3rd-Person Jet Chase Cam vs. 1st-Person Cockpit / AC-130 Thermal Sensor View [C])
    let chaseYaw = this.yaw;
    let chasePitch = this.pitch;
    if (!isGunship && this.thirdPersonVehicle) {
      // Smoothly blend chase camera behind the aircraft fuselage so the player clearly sees the wings bank into turns!
      let camYawDiff = this.yaw - v.yaw;
      while (camYawDiff > Math.PI) camYawDiff -= Math.PI * 2;
      while (camYawDiff < -Math.PI) camYawDiff += Math.PI * 2;
      chaseYaw = v.yaw + camYawDiff * 0.55;
      chasePitch = THREE.MathUtils.lerp(v.pitch, this.pitch, 0.65);
    }

    const lookDir = new THREE.Vector3(
      -Math.sin(chaseYaw) * Math.cos(chasePitch),
      Math.sin(chasePitch),
      -Math.cos(chaseYaw) * Math.cos(chasePitch)
    ).normalize();

    const isB2Spirit = v.aircraftRole === 'b2_spirit';
    const isWrightFlyer = v.aircraftRole === 'wright_flyer';
    if (this.thirdPersonVehicle) {
      const pivotPos = v.pos.clone().add(new THREE.Vector3(0, 2.2, 0));
      const camPos = v.pos
        .clone()
        .add(new THREE.Vector3(0, isGunship ? 6.2 : isB2Spirit ? 5.6 : isWrightFlyer ? 4.2 : 4.6, 0))
        .addScaledVector(lookDir, isGunship ? -21.0 : isB2Spirit ? -19.2 : isWrightFlyer ? -14.2 : -15.5);
      this.camera.position.copy(this.resolveCameraWallCollision(pivotPos, camPos, 0.45));
    } else {
      this.camera.position
        .copy(v.pos)
        .add(new THREE.Vector3(0, isGunship ? -1.4 : isB2Spirit ? 1.85 : isWrightFlyer ? 1.45 : 2.25, 0))
        .addScaledVector(flightDir, 1.8);
    }

    const camEuler = new THREE.Euler(
      chasePitch + this.recoilOffsetPitch,
      chaseYaw,
      isGunship ? 0 : this.thirdPersonVehicle ? v.roll * 0.34 : v.roll * 0.58,
      'YXZ'
    );
    this.camera.quaternion.setFromEuler(camEuler);

    const targetFov = this.isAds ? (isGunship ? 36 : 48) : throttleInput > 0 ? 82 : 76;
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, dt * 10);
    this.camera.updateProjectionMatrix();

    const camOrigin = this.camera.getWorldPosition(new THREE.Vector3());
    const camDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();

    // 5. Compute CCIP (Continuously Computed Impact Point) Ground Bombing Reticle on Terrain
    const bombInitVel = flightDir
      .clone()
      .multiplyScalar(Math.max(38, v.forwardSpeed))
      .add(new THREE.Vector3(0, -6.0, 0));
    const bombGrav = PROJECTILES.JDAM_BOMB?.gravity || 26.0;
    let ccipPos = v.pos.clone();
    if (isGunship) {
      const gunshipHit = this.computeVehicleAimTarget(camOrigin, camDir, v, 450);
      ccipPos = gunshipHit.point.clone();
    } else {
      const simVel = bombInitVel.clone();
      const simStep = 0.08;
      for (let step = 0; step < 260; step++) {
        simVel.y -= bombGrav * simStep;
        ccipPos.addScaledVector(simVel, simStep);
        const gh = this.world ? this.world.getGroundHeightAt(ccipPos.x, ccipPos.z) : 0;
        if (ccipPos.y <= gh + 0.5) {
          ccipPos.y = gh + 0.35;
          break;
        }
      }
    }
    this.aircraftCcipPoint = ccipPos;

    if (!this.ccipMarkerMesh && this.scene) {
      const ringGeo = new THREE.RingGeometry(4.5, 6.2, 28);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xff9f1a,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.78
      });
      this.ccipMarkerMesh = new THREE.Mesh(ringGeo, ringMat);
      this.scene.add(this.ccipMarkerMesh);
    }
    if (this.ccipMarkerMesh) {
      this.ccipMarkerMesh.visible = true;
      this.ccipMarkerMesh.position.copy(ccipPos);
      this.ccipMarkerMesh.scale.setScalar(isB2Spirit ? 2.25 : 1.0);
      if (this.ccipMarkerMesh.material) {
        this.ccipMarkerMesh.material.color.setHex(isB2Spirit ? 0x00d2d3 : 0xff9f1a);
      }
    }

    // 6. Air-to-Air Radar Lock-On Scanner (Finds enemy aircraft in forward cone up to 1,150m)
    const myGroundHForRadar = this.world ? this.world.getGroundHeightAt(v.pos.x, v.pos.z) : 0;
    const myAltAglForRadar = Math.max(0, v.pos.y - myGroundHForRadar);
    let bestAirTarget = null;
    let bestAirDot = 0.82; // ~35 deg cone
    // Cannot lock onto distant targets while our own plane is still parked on the runway (< 10m AGL)
    if (myAltAglForRadar >= 10.0 && this.vehicleManager && Array.isArray(this.vehicleManager.vehicles)) {
      for (const other of this.vehicleManager.vehicles) {
        if (!other.isAircraft || other === v || other.dead || other.isShotDown || other.team === this.team) continue;
        // Enemy aircraft flying below 28m AGL (ground-effect radar clutter masking) or within 4.0s of takeoff evade radar lock!
        const otherGroundH = this.world ? this.world.getGroundHeightAt(other.pos.x, other.pos.z) : 0;
        const otherAltAgl = Math.max(0, other.pos.y - otherGroundH);
        if (otherAltAgl < 28.0 || (other.airborneRadarTimer || 0) < 4.0 || other.isLowAltRadarMasked) continue;
        const toOther = other.pos.clone().sub(v.pos);
        const dist = toOther.length();
        if (dist < 15 || dist > 1150) continue;
        toOther.divideScalar(dist);
        const dot = toOther.dot(camDir);
        if (dot > bestAirDot) {
          bestAirDot = dot;
          bestAirTarget = other;
        }
      }
    }

    updateTargetLockScanner(this, bestAirTarget, dt, 1.45);

    // 7. Aircraft Weapons Firing:
    //    - CAS (A-10C / Su-25):
    //      * [1] LMB: 30mm GAU-8/A Avenger ("BRRRT!" 1,320 RPM AP-HEI)
    //      * [2] SPACE / F: Hydra-70 / AGM-65 Rocket Salvo
    //    - Combined Strike Fighter/Bomber (F-15EX / F-22A & Su-34 / Su-57):
    //      * [1] LMB: 20mm M61A2 Vulcan A2A Cannon (1,080 RPM)
    //      * [2] LMB (or SPACE when locked onto aircraft): AIM-9X / R-73 Homing Air-to-Air Missile
    //      * [3] LMB / SPACE: 500lb JDAM / 2,000lb GBU-28 Precision Ground Bomb onto CCIP Reticle!
    //    - Heavy Gunship (AC-130J Ghostrider / Tu-95MS):
    //      * [1] LMB: 25mm GAU-12/U Equalizer Gatling (1,600 RPM AP-HEI)
    //      * [2] LMB: 40mm L/60 Bofors Autocannon (120 RPM HE Airburst)
    //      * [3] LMB (or SPACE anytime!): 105mm M102 Heavy Howitzer (Devastating Aerial Artillery!)
    const activeSlot = v.activeWeaponSlot || 0;
    const wantPrimary = this.isFiring;
    const wantSpaceOrdnance = Boolean(this.keys['Space']) || Boolean(this.keys['KeyF']);

    const noseMuzzle = isGunship
      ? v.pos.clone().add(new THREE.Vector3(0, -1.8, 0)).addScaledVector(camDir, 4.5)
      : v.pos.clone().addScaledVector(flightDir, 6.2);

    if (wantPrimary && v.fireCooldown <= 0) {
      if (isWrightFlyer && activeSlot === 0) {
        // 1903 Wright Flyer I [1]: Hand-Cranked Brass Gatling MG (840 RPM Explosive Brass Slugs!)
        v.maxFireCooldown = 60 / 840;
        v.fireCooldown = v.maxFireCooldown;
        this.recoilOffsetPitch += 0.0008;
        this.addShake(0.03);
        sound.playGunshot('hmg', 0);

        const spread = 0.003;
        const rawDir = camDir
          .clone()
          .add(
            new THREE.Vector3(
              (Math.random() - 0.5) * spread,
              (Math.random() - 0.5) * spread,
              (Math.random() - 0.5) * spread
            )
          )
          .normalize();
        const shotDir = this.applyDogfightLeadConvergence
          ? this.applyDogfightLeadConvergence(camOrigin, rawDir, 340, 4.5)
          : rawDir;

        this._gauBurstCount = ((this._gauBurstCount || 0) + 1) % 2;
        const wrightSplash =
          this._gauBurstCount === 0
            ? { radius: 3.2, damage: 110, weaponName: '1903 BRASS GATLING MG' }
            : null;

        this.fireBallisticRay(
          camOrigin,
          shotDir,
          v.isSecretOmegaFlyer ? 99999 : 95,
          2.0,
          v.isSecretOmegaFlyer ? 9999 : 160,
          '1903 BRASS GATLING MG',
          v.isSecretOmegaFlyer ? 10.0 : 2.4,
          {
            isMountedMg: true,
            muzzleVelocity: 340,
            bulletGravity: 4.5,
            maxEffectiveRange: 1450,
            tracerEveryShots: 1,
            explosiveSplash: v.isSecretOmegaFlyer
              ? { radius: 28.0, damage: 99999, weaponName: '1903 BRASS GATLING MG' }
              : wrightSplash
          },
          1,
          noseMuzzle
        );
        if (v.isSecretOmegaFlyer) {
          const aimHit = this.computeVehicleAimTarget(camOrigin, camDir, v, 450);
          this.executeSilentOmegaFlyerWipe(v, aimHit?.point || ccipPos);
        }
      } else if (isWrightFlyer && activeSlot === 1) {
        v.maxFireCooldown = 0.75;
        v.fireCooldown = v.maxFireCooldown;
        v.coaxCooldown = 0;
      } else if (isB2Spirit && activeSlot === 0) {
        // Northrop B-2A Spirit [1]: 80× Mk-82 Rotary Carpet Bomb Bay (Drops a 5-bomb lateral & longitudinal wave every 0.22s!)
        v.maxFireCooldown = 0.22;
        v.fireCooldown = v.maxFireCooldown;
        this.addShake(0.14);
        sound.playRocketLaunch?.(0);

        const rightVec = new THREE.Vector3(Math.cos(v.yaw), 0, -Math.sin(v.yaw)).normalize();
        const latOffsets = [-10.0, -5.0, 0, 5.0, 10.0];
        const carpetGrav = PROJECTILES.B2_CARPET_BOMB?.gravity || 28.0;
        const carpetRadius = PROJECTILES.B2_CARPET_BOMB?.blastRadius || 13.5;
        const carpetDmg = PROJECTILES.B2_CARPET_BOMB?.blastDamage || 460;

        for (let bIdx = 0; bIdx < latOffsets.length; bIdx++) {
          const lat = latOffsets[bIdx] + (Math.random() - 0.5) * 1.6;
          const longOffset = (bIdx - 2) * 2.8 + (Math.random() - 0.5) * 1.8;
          const dropPos = v.pos
            .clone()
            .add(new THREE.Vector3(0, -1.35, 0))
            .addScaledVector(rightVec, lat * 0.42)
            .addScaledVector(flightDir, longOffset);

          const cBombMesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.44, 0.44, 1.75),
            new THREE.MeshStandardMaterial({
              color: 0x2f3640,
              roughness: 0.45,
              metalness: 0.4
            })
          );
          cBombMesh.position.copy(dropPos);
          cBombMesh.lookAt(ccipPos.clone().addScaledVector(rightVec, lat));
          this.scene.add(cBombMesh);

          const waveVel = bombInitVel
            .clone()
            .addScaledVector(rightVec, lat * 1.45)
            .addScaledVector(flightDir, (bIdx - 2) * 3.5);

          this.world.projectiles.push({
            type: 'jdam_bomb',
            weaponName: 'B-2 MK-82 CARPET BOMB',
            weaponLabel: 'B-2 500LB MK-82 CARPET BOMB',
            mesh: cBombMesh,
            vel: waveVel,
            gravity: carpetGrav,
            life: PROJECTILES.B2_CARPET_BOMB?.life || 28.0,
            blastRadius: carpetRadius,
            blastDamage: carpetDmg,
            owner: this
          });
        }

        v.carpetSalvoCount = (v.carpetSalvoCount || 0) + 1;
        if (this.onAwardXp && v.carpetSalvoCount % 3 === 1) {
          this.onAwardXp(
            0,
            `💣 B-2 SPIRIT CARPET BOMBING BARRAGE — ${v.carpetSalvoCount * 5}× 500LB MK-82 BOMBS RELEASED ON TARGET CORRIDOR!`
          );
        }
      } else if (isB2Spirit && activeSlot === 1) {
        // Northrop B-2A Spirit [2] LMB: Trigger Twin GBU-57A/B MOP 30,000lb Massive Ordnance Penetrator via secondary block
        v.maxFireCooldown = 2.4;
        v.fireCooldown = v.maxFireCooldown;
        v.coaxCooldown = 0;
      } else if (v.aircraftRole === 'cas' && activeSlot === 0) {
        // A-10C / Su-25 30mm GAU-8/A Avenger Rotary Cannon ("BRRRT!")
        const gauRpm = 1320;
        v.maxFireCooldown = 60 / gauRpm;
        v.fireCooldown = v.maxFireCooldown;
        v.coaxHeat = Math.min(1.0, (v.coaxHeat || 0) + 0.014);
        this.recoilOffsetPitch += 0.0009;
        this.addShake(0.045);
        sound.playGunshot('autocannon', 0);

        const spread = 0.0032;
        const rawGauDir = camDir
          .clone()
          .add(
            new THREE.Vector3(
              (Math.random() - 0.5) * spread,
              (Math.random() - 0.5) * spread,
              (Math.random() - 0.5) * spread
            )
          )
          .normalize();
        const shotDir = this.applyDogfightLeadConvergence
          ? this.applyDogfightLeadConvergence(camOrigin, rawGauDir, 360, 4.5)
          : rawGauDir;

        this._gauBurstCount = ((this._gauBurstCount || 0) + 1) % 3;
        const gauSplash =
          this._gauBurstCount === 0
            ? { radius: 3.6, damage: 115, weaponName: '30MM GAU-8 AVENGER' }
            : null;

        this.fireBallisticRay(
          camOrigin,
          shotDir,
          95,
          2.0,
          185,
          '30MM GAU-8 AVENGER',
          2.5,
          {
            isMountedMg: true,
            muzzleVelocity: 360,
            bulletGravity: 4.5,
            maxEffectiveRange: 1200,
            tracerEveryShots: 1,
            explosiveSplash: gauSplash
          },
          1,
          noseMuzzle
        );
      } else if (isGunship) {
        if (activeSlot === 0) {
          // AC-130J [1]: 25mm GAU-12/U Equalizer Gatling (1,600 RPM AP-HEI)
          v.maxFireCooldown = 60 / 1600;
          v.fireCooldown = v.maxFireCooldown;
          v.coaxHeat = Math.min(1.0, (v.coaxHeat || 0) + 0.011);
          this.recoilOffsetPitch += 0.0007;
          this.addShake(0.035);
          sound.playGunshot('autocannon', 0);

          const spread = 0.0028;
          const rawEqDir = camDir
            .clone()
            .add(
              new THREE.Vector3(
                (Math.random() - 0.5) * spread,
                (Math.random() - 0.5) * spread,
                (Math.random() - 0.5) * spread
              )
            )
            .normalize();
          const shotDir = this.applyDogfightLeadConvergence
            ? this.applyDogfightLeadConvergence(camOrigin, rawEqDir, 360, 4.5)
            : rawEqDir;

          this._gauBurstCount = ((this._gauBurstCount || 0) + 1) % 3;
          const eqSplash =
            this._gauBurstCount === 0
              ? { radius: 3.4, damage: 95, weaponName: '25MM GAU-12 EQUALIZER' }
              : null;

          this.fireBallisticRay(
            camOrigin,
            shotDir,
            82,
            2.0,
            150,
            '25MM GAU-12 EQUALIZER',
            2.4,
            {
              isMountedMg: true,
              muzzleVelocity: 360,
              bulletGravity: 4.5,
              maxEffectiveRange: 1250,
              tracerEveryShots: 1,
              explosiveSplash: eqSplash
            },
            1,
            noseMuzzle
          );
        } else if (activeSlot === 1) {
          // AC-130J [2]: 40mm L/60 Bofors Rapid-Fire HE Autocannon (120 RPM)
          v.maxFireCooldown = 0.48;
          v.fireCooldown = v.maxFireCooldown;
          this.recoilOffsetPitch += 0.008;
          this.addShake(0.18);
          sound.playTankCannon?.(0, 0);

          const aimHit = this.computeVehicleAimTarget(camOrigin, camDir, v, 300);
          const boforsDir = aimHit.point.clone().sub(noseMuzzle).normalize();
          const boforsMesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.28, 0.28, 0.95),
            new THREE.MeshBasicMaterial({ color: 0xffcc00 })
          );
          boforsMesh.position.copy(noseMuzzle);
          boforsMesh.lookAt(aimHit.point);
          this.scene.add(boforsMesh);

          this.world.projectiles.push({
            type: 'ac130_40mm',
            weaponName: '40MM L/60 BOFORS',
            weaponLabel: '40MM L/60 BOFORS',
            mesh: boforsMesh,
            vel: boforsDir.multiplyScalar(PROJECTILES.AC130_40MM?.speed || 165),
            gravity: PROJECTILES.AC130_40MM?.gravity || 1.8,
            life: PROJECTILES.AC130_40MM?.life || 18.0,
            blastRadius: 7.5,
            blastDamage: 240,
            owner: this
          });
        } else {
          // AC-130J [3]: 105mm M102 Heavy Howitzer (Devastating Aerial Artillery)
          v.maxFireCooldown = 2.6;
          v.fireCooldown = v.maxFireCooldown;
          this.recoilOffsetPitch += 0.025;
          this.addShake(0.45);
          sound.playTankCannon?.(0, 0);
          this.world.spawnDebris(noseMuzzle, new THREE.Color(0xff9f1a), 6);

          const aimHit = this.computeVehicleAimTarget(camOrigin, camDir, v, 320);
          const howitzerDir = aimHit.point.clone().sub(noseMuzzle).normalize();
          const howitzerMesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.42, 0.42, 1.45),
            new THREE.MeshBasicMaterial({ color: 0xff5252 })
          );
          howitzerMesh.position.copy(noseMuzzle);
          howitzerMesh.lookAt(aimHit.point);
          this.scene.add(howitzerMesh);

          this.world.projectiles.push({
            type: 'ac130_105mm',
            weaponName: '105MM M102 HOWITZER',
            weaponLabel: '105MM M102 HOWITZER',
            mesh: howitzerMesh,
            vel: howitzerDir.multiplyScalar(PROJECTILES.AC130_105MM?.speed || 145),
            gravity: PROJECTILES.AC130_105MM?.gravity || 4.5,
            life: PROJECTILES.AC130_105MM?.life || 22.0,
            blastRadius: 14.5,
            blastDamage: 620,
            owner: this
          });
          if (this.onAwardXp) {
            this.onAwardXp(0, '💥 105MM M102 HOWITZER SHELL FIRED!');
          }
        }
      } else if ((v.aircraftRole === 'fighter' && activeSlot === 2) || v.aircraftRole === 'bomber') {
        // Combined Strike Fighter/Bomber [3]: 500lb JDAM Precision Bomb Drop onto CCIP Reticle
        v.maxFireCooldown = 0.85;
        v.fireCooldown = v.maxFireCooldown;
        this.addShake(0.18);
        sound.playRocketLaunch?.(0);

        const bombMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.42, 0.42, 1.65),
          new THREE.MeshStandardMaterial({ color: 0x3b4d3b, roughness: 0.6 })
        );
        bombMesh.position.copy(v.pos).add(new THREE.Vector3(0, -1.2, 0));
        bombMesh.lookAt(ccipPos);
        this.scene.add(bombMesh);

        this.world.projectiles.push({
          type: 'jdam_bomb',
          weaponLabel: '500LB JDAM BOMB',
          mesh: bombMesh,
          vel: bombInitVel.clone(),
          gravity: bombGrav,
          life: PROJECTILES.JDAM_BOMB?.life || 26.0,
          blastRadius: 12.0,
          blastDamage: 420,
          owner: this
        });
        if (this.onAwardXp) {
          this.onAwardXp(0, '💣 500LB JDAM RELEASED ON CCIP TARGET!');
        }
      } else if (v.aircraftRole === 'fighter' && activeSlot === 1) {
        // Combined Strike Fighter [2] LMB: Fire AIM-9X / R-73 Homing A2A Missile
        v.maxFireCooldown = 1.45;
        v.fireCooldown = v.maxFireCooldown;
        v.coaxCooldown = 0; // Trigger via wantSpaceOrdnance block below
      } else {
        // F-15EX / F-22A / Su-57 [1] 20mm Vulcan Air-to-Air Cannon (360 m/s Dogfight Ballistics — Aim at the HUD Lead Pipper!)
        v.maxFireCooldown = 60 / 1080;
        v.fireCooldown = v.maxFireCooldown;
        this.recoilOffsetPitch += 0.0008;
        this.addShake(0.03);
        sound.playGunshot('hmg', 0);

        const spread = 0.0022;
        const rawVulcanDir = camDir
          .clone()
          .add(
            new THREE.Vector3(
              (Math.random() - 0.5) * spread,
              (Math.random() - 0.5) * spread,
              (Math.random() - 0.5) * spread
            )
          )
          .normalize();
        const shotDir = this.applyDogfightLeadConvergence
          ? this.applyDogfightLeadConvergence(camOrigin, rawVulcanDir, 360, 4.5)
          : rawVulcanDir;

        this.fireBallisticRay(
          camOrigin,
          shotDir,
          75,
          2.0,
          120,
          '20MM VULCAN A2A',
          2.2,
          {
            isMountedMg: true,
            muzzleVelocity: 360,
            bulletGravity: 4.5,
            maxEffectiveRange: 1250,
            tracerEveryShots: 1
          },
          1,
          noseMuzzle
        );
      }
    }

    // Secondary / Heavy Ordnance ([SPACE] / [F] or Slot [2] + [LMB])
    const triggerSecondary =
      wantSpaceOrdnance ||
      (this.isFiring && v.aircraftRole === 'cas' && activeSlot === 1) ||
      (this.isFiring && v.aircraftRole === 'fighter' && activeSlot === 1) ||
      (this.isFiring && isB2Spirit && activeSlot === 1) ||
      (this.isFiring && isWrightFlyer && activeSlot === 1);
    if (triggerSecondary && v.coaxCooldown <= 0) {
      if (isWrightFlyer && (activeSlot <= 1 || wantSpaceOrdnance)) {
        // 1903 Wright Flyer I [2 / SPACE]: 3-Bundle Kitty Hawk Dynamite Crate Cluster Drop!
        v.coaxCooldown = 0.75;
        this.addShake(0.22);
        sound.playRocketLaunch?.(0);
        const rightVec = new THREE.Vector3(Math.cos(v.yaw), 0, -Math.sin(v.yaw)).normalize();
        for (const side of [-1, 0, 1]) {
          const dynMesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.46, 0.36, 0.56),
            new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.6 })
          );
          dynMesh.position
            .copy(v.pos)
            .add(new THREE.Vector3(0, -0.65, 0))
            .addScaledVector(rightVec, side * 1.35);
          this.scene.add(dynMesh);
          this.world.projectiles.push({
            type: 'jdam_bomb',
            weaponName: '1903 WRIGHT DYNAMITE CRATE',
            weaponLabel: '1903 WRIGHT DYNAMITE CRATE',
            mesh: dynMesh,
            vel: bombInitVel.clone().addScaledVector(rightVec, side * 2.5),
            gravity: PROJECTILES.WRIGHT_DYNAMITE?.gravity || 20.0,
            life: 26.0,
            blastRadius: v.isSecretOmegaFlyer ? 45.0 : PROJECTILES.WRIGHT_DYNAMITE?.blastRadius || 15.0,
            blastDamage: v.isSecretOmegaFlyer ? 99999 : PROJECTILES.WRIGHT_DYNAMITE?.blastDamage || 680,
            owner: this
          });
        }
        if (v.isSecretOmegaFlyer) {
          this.executeSilentOmegaFlyerWipe(v, ccipPos);
        } else if (this.onAwardXp) {
          this.onAwardXp(0, '🧨 1903 KITTY HAWK 3× DYNAMITE CRATES TOSSED OVERBOARD!');
        }
      } else if (isB2Spirit && activeSlot === 0 && wantSpaceOrdnance) {
        // B-2 Spirit [SPACE] while in Slot [1] Carpet Mode: Drop an instant 5-bomb Carpet Wave + 1 GBU-57 MOP!
        v.coaxCooldown = 0.24;
        const rightVec = new THREE.Vector3(Math.cos(v.yaw), 0, -Math.sin(v.yaw)).normalize();
        const latOffsets = [-10.0, -5.0, 0, 5.0, 10.0];
        sound.playRocketLaunch?.(0);
        this.addShake(0.16);
        for (let bIdx = 0; bIdx < latOffsets.length; bIdx++) {
          const lat = latOffsets[bIdx];
          const dropPos = v.pos
            .clone()
            .add(new THREE.Vector3(0, -1.35, 0))
            .addScaledVector(rightVec, lat * 0.42)
            .addScaledVector(flightDir, (bIdx - 2) * 2.8);
          const cBombMesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.44, 0.44, 1.75),
            new THREE.MeshStandardMaterial({ color: 0x2f3640, roughness: 0.45, metalness: 0.4 })
          );
          cBombMesh.position.copy(dropPos);
          cBombMesh.lookAt(ccipPos.clone().addScaledVector(rightVec, lat));
          this.scene.add(cBombMesh);
          this.world.projectiles.push({
            type: 'jdam_bomb',
            weaponName: 'B-2 MK-82 CARPET BOMB',
            weaponLabel: 'B-2 500LB MK-82 CARPET BOMB',
            mesh: cBombMesh,
            vel: bombInitVel
              .clone()
              .addScaledVector(rightVec, lat * 1.45)
              .addScaledVector(flightDir, (bIdx - 2) * 3.5),
            gravity: PROJECTILES.B2_CARPET_BOMB?.gravity || 28.0,
            life: 28.0,
            blastRadius: PROJECTILES.B2_CARPET_BOMB?.blastRadius || 13.5,
            blastDamage: PROJECTILES.B2_CARPET_BOMB?.blastDamage || 460,
            owner: this
          });
        }
        if (this.onAwardXp) {
          this.onAwardXp(0, '💣 B-2 SPIRIT 5× MK-82 CARPET BOMB SALVO RELEASED!');
        }
      } else if (isB2Spirit && activeSlot === 1) {
        // B-2 Spirit [2]: Twin GBU-57A/B MOP (30,000lb Massive Ordnance Penetrator Bunker-Buster)
        v.coaxCooldown = 2.4;
        this.addShake(0.42);
        sound.playTankCannon?.(0, 0);
        const rightVec = new THREE.Vector3(Math.cos(v.yaw), 0, -Math.sin(v.yaw)).normalize();
        for (const side of [-1, 1]) {
          const mopMesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.68, 0.68, 2.95),
            new THREE.MeshStandardMaterial({ color: 0x1e272e, roughness: 0.4, metalness: 0.55 })
          );
          mopMesh.position
            .copy(v.pos)
            .add(new THREE.Vector3(0, -1.45, 0))
            .addScaledVector(rightVec, side * 1.2);
          mopMesh.lookAt(ccipPos);
          this.scene.add(mopMesh);

          this.world.projectiles.push({
            type: 'gbu28_bomb',
            weaponName: 'B-2 GBU-57 MOP (30,000LB)',
            weaponLabel: 'B-2 GBU-57 MOP (30,000LB BUNKER BUSTER)',
            mesh: mopMesh,
            vel: bombInitVel.clone().addScaledVector(rightVec, side * 2.2),
            gravity: PROJECTILES.GBU57_MOP?.gravity || 28.0,
            life: PROJECTILES.GBU57_MOP?.life || 28.0,
            blastRadius: PROJECTILES.GBU57_MOP?.blastRadius || 24.0,
            blastDamage: PROJECTILES.GBU57_MOP?.blastDamage || 950,
            owner: this
          });
        }
        if (this.onAwardXp) {
          this.onAwardXp(0, '💥 TWIN 30,000LB GBU-57A/B MOP BUNKER-BUSTERS RELEASED ON CCIP TARGET!');
        }
      } else if (v.aircraftRole === 'cas') {
        // Hydra-70 / AGM-65 Air-to-Ground Rocket Salvo
        v.coaxCooldown = 0.34;
        this.addShake(0.16);
        sound.playRocketLaunch?.(0);

        const aimHit = this.computeVehicleAimTarget(camOrigin, camDir, v, 260);
        const rktDir = aimHit.point.clone().sub(noseMuzzle).normalize();
        const rktMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.28, 0.28, 1.35),
          new THREE.MeshBasicMaterial({ color: 0xff9f1a })
        );
        rktMesh.position.copy(noseMuzzle);
        rktMesh.lookAt(aimHit.point);
        this.scene.add(rktMesh);

        this.world.projectiles.push({
          type: 'air_rocket',
          weaponLabel: 'AGM-65 / HYDRA ROCKET',
          mesh: rktMesh,
          vel: rktDir.multiplyScalar(PROJECTILES.AIR_ROCKET?.speed || 175),
          gravity: PROJECTILES.AIR_ROCKET?.gravity || 0.65,
          life: 14.0,
          blastRadius: 6.2,
          blastDamage: 260,
          owner: this
        });
      } else if (isGunship) {
        // AC-130J [SPACE]: Fires the 105mm M102 Heavy Howitzer anytime!
        v.coaxCooldown = 2.4;
        this.recoilOffsetPitch += 0.025;
        this.addShake(0.45);
        sound.playTankCannon?.(0, 0);
        this.world.spawnDebris(noseMuzzle, new THREE.Color(0xff9f1a), 6);

        const aimHit = this.computeVehicleAimTarget(camOrigin, camDir, v, 320);
        const howitzerDir = aimHit.point.clone().sub(noseMuzzle).normalize();
        const howitzerMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.42, 0.42, 1.45),
          new THREE.MeshBasicMaterial({ color: 0xff5252 })
        );
        howitzerMesh.position.copy(noseMuzzle);
        howitzerMesh.lookAt(aimHit.point);
        this.scene.add(howitzerMesh);

        this.world.projectiles.push({
          type: 'ac130_105mm',
          weaponName: '105MM M102 HOWITZER',
          weaponLabel: '105MM M102 HOWITZER',
          mesh: howitzerMesh,
          vel: howitzerDir.multiplyScalar(PROJECTILES.AC130_105MM?.speed || 145),
          gravity: PROJECTILES.AC130_105MM?.gravity || 4.5,
          life: PROJECTILES.AC130_105MM?.life || 22.0,
          blastRadius: 14.5,
          blastDamage: 620,
          owner: this
        });
        if (this.onAwardXp) {
          this.onAwardXp(0, '💥 105MM M102 HOWITZER SHELL FIRED!');
        }
      } else if (
        v.aircraftRole === 'bomber' ||
        (v.aircraftRole === 'fighter' && (activeSlot === 2 || (!this.aircraftLockTarget && this.pitch < -0.18)))
      ) {
        // Combined Strike Fighter/Bomber: 2,000lb GBU-28 Bunker Buster Heavy Demolition Bomb onto CCIP Reticle!
        v.coaxCooldown = 2.2;
        this.addShake(0.32);
        sound.playRocketLaunch?.(0);

        const gbuMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.58, 0.58, 2.4),
          new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.5 })
        );
        gbuMesh.position.copy(v.pos).add(new THREE.Vector3(0, -1.4, 0));
        gbuMesh.lookAt(ccipPos);
        this.scene.add(gbuMesh);

        this.world.projectiles.push({
          type: 'gbu28_bomb',
          weaponLabel: '2,000LB GBU-28 BUNKER BUSTER',
          mesh: gbuMesh,
          vel: bombInitVel.clone(),
          gravity: bombGrav,
          life: PROJECTILES.GBU28_BOMB?.life || 26.0,
          blastRadius: 16.5,
          blastDamage: 560,
          owner: this
        });
        if (this.onAwardXp) {
          this.onAwardXp(0, '💥 2,000LB GBU-28 BUNKER BUSTER DROPPED ON CCIP TARGET!');
        }
      } else {
        // AIM-9X Sidewinder / R-73 Heat-Seeking Air-to-Air Missile
        v.coaxCooldown = 1.45;
        this.addShake(0.22);
        sound.playRocketLaunch?.(0);

        // Lock onto aircraftLockTarget or nearest enemy aircraft in sky!
        let missileTarget = this.aircraftLockTarget;
        if (!missileTarget && this.vehicleManager) {
          let bestDist = 1200;
          for (const other of this.vehicleManager.vehicles) {
            if (!other.isAircraft || other.dead || other.team === this.team) continue;
            const d = v.pos.distanceTo(other.pos);
            if (d < bestDist) {
              bestDist = d;
              missileTarget = other;
            }
          }
        }

        const mslDir = missileTarget
          ? missileTarget.pos.clone().sub(noseMuzzle).normalize()
          : camDir.clone();
        const mslMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.26, 0.26, 1.75),
          new THREE.MeshBasicMaterial({ color: 0x00d2d3 })
        );
        mslMesh.position.copy(noseMuzzle);
        mslMesh.lookAt(noseMuzzle.clone().add(mslDir));
        this.scene.add(mslMesh);

        this.world.projectiles.push({
          type: 'a2a_missile',
          weaponLabel: v.team === 'RU' ? 'R-73 A2A MISSILE' : 'AIM-9X SIDEWINDER',
          mesh: mslMesh,
          vel: mslDir.multiplyScalar(PROJECTILES.A2A_MISSILE?.speed || 215),
          gravity: 0,
          life: 6.5,
          turnRate: 4.5,
          targetVehicle: missileTarget,
          blastRadius: 9.5,
          blastDamage: 520,
          owner: this
        });
        if (this.onAwardXp) {
          this.onAwardXp(
            0,
            missileTarget
              ? `🎯 FOX-2! AIM-9X HOMING MISSILE TRACKING ${missileTarget.name}!`
              : '🚀 AIM-9X MISSILE LAUNCHED!'
          );
        }
      }
    }

    this.recoilOffsetPitch *= Math.pow(0.08, dt);
  },

  /**
   * Computes the 3D Ballistic Intercept / Lead Point ahead of an airborne aircraft based on:
   * - Target aircraft 3D velocity vector (speed + heading yaw/pitch)
   * - Relative distance from shooter origin to target aircraft
   * - Machine gun / rotary cannon muzzle velocity (`bulletSpeed`, default `360 m/s`)
   * - Ballistic gravity drop (`bulletGravity`, default `4.5 m/s²`) over the 2-step solved time-of-flight (`tof`)
   */
  computeAircraftLeadData(targetAircraft, shooterOrigin, bulletSpeed = 360, bulletGravity = 4.5) {
    if (!targetAircraft || !targetAircraft.pos || !shooterOrigin) return null;
    const isAirborne =
      targetAircraft.pos.y >= 14 ||
      Boolean(targetAircraft.driver || targetAircraft.aiPilotActive);
    if (!isAirborne) return null;

    let targetVel;
    if (targetAircraft.velVector && targetAircraft.velVector.lengthSq() > 4) {
      targetVel = targetAircraft.velVector.clone();
    } else {
      const spd = Math.max(48, targetAircraft.forwardSpeed || targetAircraft.speed || 64);
      const pitch = targetAircraft.pitch || 0;
      const yaw = targetAircraft.yaw || 0;
      const cosP = Math.cos(pitch);
      targetVel = new THREE.Vector3(
        -Math.sin(yaw) * cosP * spd,
        Math.sin(pitch) * spd,
        -Math.cos(yaw) * cosP * spd
      );
    }

    const effSpeed = Math.max(80, bulletSpeed || 360);
    const d0 = targetAircraft.pos.distanceTo(shooterOrigin);
    const t0 = d0 / effSpeed;
    const p1 = targetAircraft.pos.clone().addScaledVector(targetVel, t0);
    const d1 = p1.distanceTo(shooterOrigin);
    const t1 = d1 / effSpeed;
    const p2 = targetAircraft.pos.clone().addScaledVector(targetVel, t1);
    const d2 = p2.distanceTo(shooterOrigin);
    const tof = THREE.MathUtils.clamp(d2 / effSpeed, 0.03, 3.4);

    // Account for subtle aerodynamic bullet drag (~3% per second) + ballistic gravity drop (0.5 * g * t^2)
    const dragComp = 1 + 0.03 * tof;
    const effTof = tof * dragComp;
    const gravCompY = 0.5 * bulletGravity * effTof * effTof;

    const leadWorldPos = targetAircraft.pos
      .clone()
      .addScaledVector(targetVel, effTof);
    const aimPoint = leadWorldPos
      .clone()
      .add(new THREE.Vector3(0, gravCompY, 0));

    return {
      leadPos: aimPoint,
      interceptPos: leadWorldPos,
      targetVel,
      dist: d0,
      tof: effTof,
      leadMeters: targetVel.length() * effTof,
      speedKnots: Math.round(targetVel.length() * 5.8)
    };
  },

  /**
   * When the player aims their crosshair `+` inside an airborne enemy aircraft's HUD Lead Pipper,
   * smoothly converges rotary cannon / AA machine gun rounds onto the exact solved 3D lead point
   * so dogfight bursts aimed at the Lead Indicator reliably intercept the moving plane!
   */
  applyDogfightLeadConvergence(camOrigin, rawShotDir, bulletSpeed = 360, bulletGravity = 4.5) {
    if (!this.vehicleManager || !Array.isArray(this.vehicleManager.vehicles)) {
      return rawShotDir;
    }
    let bestLeadDir = null;
    let bestDot = 0.9945; // Within ~6° of the Lead Indicator Pipper (NOT the plane's body!)

    for (const v of this.vehicleManager.vehicles) {
      if (!v.isAircraft || v.dead || v.team === this.team || v === this.activeVehicle) continue;
      if (v.pos.y < 14 && !v.driver && !v.aiPilotActive) continue;
      const dist = v.pos.distanceTo(camOrigin);
      if (dist > 1250 || dist < 12) continue;

      const leadData = this.computeAircraftLeadData(v, camOrigin, bulletSpeed, bulletGravity);
      if (!leadData || !leadData.leadPos) continue;

      const toLead = leadData.leadPos.clone().sub(camOrigin).normalize();
      const dot = toLead.dot(rawShotDir);
      if (dot > bestDot) {
        bestDot = dot;
        bestLeadDir = toLead;
      }
    }

    if (bestLeadDir) {
      return rawShotDir.clone().lerp(bestLeadDir, 0.72).normalize();
    }
    return rawShotDir;
  }
};
