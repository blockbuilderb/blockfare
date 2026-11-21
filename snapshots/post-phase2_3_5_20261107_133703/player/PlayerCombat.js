import * as THREE from '../../vendor/three.module.js';
import { sound } from '../audio.js?v=35';
import { PLAYER, COMBAT, PROJECTILES, DISTANCES, DEPLOYABLES } from '../config.js?v=35';

export const CombatMethods = {
  getActiveOpticType() {
    const cur = this.currentWeapon();
    if (!cur || !cur.def.opticType) return null;
    if (this.useCantedSight && cur.def.hasCantedSight) {
      return 'reddot';
    }
    return cur.def.opticType;
  },

  /**
   * Finds the nearest injured standing friendly soldier (hp < 100) within `maxDist` meters.
   */
  findNearestInjuredFriendly(maxDist = DISTANCES.INTERACT_RANGE) {
    if (!this.botManager || !this.botManager.bots) return null;
    let best = null;
    let bestDist = maxDist;
    for (const b of this.botManager.bots) {
      if (b.dead || b.downed || b.team !== this.team || b.hp >= PLAYER.MAX_HP) continue;
      const d = b.pos.distanceTo(this.pos);
      if (d <= bestDist) {
        bestDist = d;
        best = b;
      }
    }
    return best;
  },

  /**
   * [F] Key Handler:
   * 1. Revive downed friendly soldier (Hold [F]) or Heal injured standing friendly soldier (Press [F])
   * 2. Pick up Ammo, Magazines, Rockets & Armor from Ammo Crate (Press [F])
   * 3. Build Defense Fortifications ([F]):
   *    - Builds a Chest-High Defensive Wall ('CHEST WALL' / active [B] blueprint) right in front of you!
   *    - AND if inside/near a captured friendly Objective (A–E), also erects Point Defense Chest-Wall Breastworks around the point!
   */
  handleInteractKey() {
    if (this.activeVehicle) return;

    // 1a. Downed Friendly within interact range -> Holding [F] revives them (handled in update loop)
    const nearDowned =
      this.draggedBot || this.botManager.findNearestDownedFriendly(this.pos, this.team, DISTANCES.INTERACT_RANGE);
    if (nearDowned && nearDowned.downed && !nearDowned.dead) {
      this.reviveTargetBot = nearDowned;
      return;
    }

    // 1b. Injured standing Friendly Soldier within interact range -> Press [F] to Field Heal them!
    const injuredAlly = this.findNearestInjuredFriendly(DISTANCES.INTERACT_RANGE);
    if (injuredAlly) {
      const healAmt = this.role === 'medic' ? PLAYER.FIELD_HEAL_MEDIC : PLAYER.FIELD_HEAL_OTHER;
      injuredAlly.hp = Math.min(PLAYER.MAX_HP, injuredAlly.hp + healAmt);
      sound.playReload();
      this.score += PLAYER.FIELD_HEAL_XP;
      if (this.onAwardXp) {
        this.onAwardXp(PLAYER.FIELD_HEAL_XP, `FIELD HEALED ${injuredAlly.name} (+${healAmt} HP)`);
      }
      return;
    }

    // 2. Ammo Resupply Crate within interact range -> Press [F] to Pick Up Ammo, Rockets & Armor!
    for (const crate of this.world.ammoCrates) {
      if (crate.pos.distanceTo(this.pos) <= DISTANCES.INTERACT_RANGE) {
        this.resupplyAll();
        return;
      }
    }

    // 3. Build Chest Wall / Point Defense Fortifications ([F])!
    this.tryBuildPointDefenses();
  },

  resupplyAll() {
    const vestDef = this.getEquippedItem('vest');
    this.maxArmor = vestDef ? vestDef.maxArmor : PLAYER.MAX_ARMOR;
    this.armorAbsorbRatio = vestDef ? vestDef.absorbRatio : PLAYER.ARMOR_ABSORB_RATIO;
    for (const s of this.slots) {
      s.clip = s.def.clipSize;
      s.reserve = s.def.reserveAmmo;
      s.mags = this.buildMagArray(s.def.clipSize, s.def.reserveAmmo);
    }
    this.bandages = (this.role === 'medic' ? 8 : 4) + (vestDef ? vestDef.bonusBandages : 0);
    this.grenades = 2 + (vestDef ? vestDef.bonusGrenades : 0);
    this.armor = this.maxArmor;
    sound.playReload();
    if (this.onAwardXp) this.onAwardXp(20, 'AMMO, MAGS & ARMOR RESUPPLIED');
  },

  buildMagArray(clipSize, reserveAmmo) {
    if (!clipSize || clipSize <= 1) return [];
    const count = Math.max(1, Math.round(reserveAmmo / clipSize));
    return Array.from({ length: count }, () => clipSize);
  },

  syncReserveFromMags(slot) {
    if (!slot || !slot.mags || slot.def.clipSize <= 1) return;
    slot.reserve = slot.mags.reduce((sum, n) => sum + n, 0);
  },

  equipLoadout(roleName) {
    this.role = roleName;
    this.applyCustomizationsToActiveLoadout(false);
  },

  switchSlot(index) {
    if (index < 0 || index >= this.slots.length) return;
    this.currentSlotIndex = index;
    this.reloading = false;
    this.fastReload = false;
    this.isAds = false;
    this.useCantedSight = false;

    while (this.viewModelGroup.children.length > 0) {
      this.viewModelGroup.remove(this.viewModelGroup.children[0]);
    }
    const cur = this.currentWeapon();
    if (cur && cur.mesh) {
      cur.mesh.position.set(0.22, -0.2, -0.31);
      this.viewModelGroup.add(cur.mesh);
    }
  },

  currentWeapon() {
    return this.slots[this.currentSlotIndex];
  },

  // =========================================================================
  // SUPPORT CLASS: AMMO SUPPLY CRATE (Battlefield/BattleBit inspired)
  // =========================================================================
  dropAmmoCrate() {
    if (this.dead || this.downed) return;

    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const cratePos = this.pos.clone().addScaledVector(forward, 2.5);
    cratePos.y = this.world.getGroundHeightAt(cratePos.x, cratePos.z);

    // Create visible ammo crate mesh
    const crateGroup = new THREE.Group();
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.6, 0.65),
      new THREE.MeshStandardMaterial({ color: 0x27ae60, roughness: 0.7 })
    );
    box.position.y = 0.3;
    crateGroup.add(box);

    // White cross mark on top
    const crossH = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.02, 0.12),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    crossH.position.y = 0.62;
    crateGroup.add(crossH);
    const crossV = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.02, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    crossV.position.y = 0.62;
    crateGroup.add(crossV);

    // Green glow ring
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 1.0, 16),
      new THREE.MeshBasicMaterial({ color: 0x2ecc71, transparent: true, opacity: 0.25, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    crateGroup.add(ring);

    crateGroup.position.copy(cratePos);
    this.scene.add(crateGroup);

    // Register crate in world's ammoCrates array for resupply tick
    this.world.ammoCrates.push({
      pos: cratePos.clone(),
      mesh: crateGroup,
      team: this.team,
      owner: this.name,
      timer: DEPLOYABLES.AMMO_CRATE_TIMER, // lasts 60 seconds
      resupplyRadius: DEPLOYABLES.AMMO_CRATE_RADIUS
    });

    if (this.onAwardXp) this.onAwardXp(25, 'AMMO CRATE DEPLOYED');
    sound.playReload();
  },

  startReload() {
    const cur = this.currentWeapon();
    if (!cur) return;
    if (cur.def.type === 'hammer' || cur.def.type === 'c4' || cur.def.type === 'medkit') return;

    // Double-Tap [R] while already reloading triggers BattleBit Speed Drop Reload!
    if (this.reloading) {
      if (!this.fastReload) {
        this.fastReload = true;
        this.reloadTimer *= PLAYER.SPEED_RELOAD_MULT;
        if (this.onAwardXp) this.onAwardXp(0, 'SPEED RELOAD (MAG DROPPED)');
      }
      return;
    }

    if (cur.clip >= cur.def.clipSize || cur.reserve <= 0) return;

    this.reloading = true;
    this.fastReload = false;
    this.reloadTimer = cur.def.reloadTime;
    this.isAds = false;
    sound.playReload();
  },

  tryFireSingle() {
    const cur = this.currentWeapon();
    if (!cur || this.reloading || this.fireTimer > 0) return;
    this.executeFire(cur);
  },

  fireWeapon(cur) {
    return this.executeFire(cur || this.currentWeapon());
  },

  executeFire(cur) {
    const def = cur.def;
    const interval = 60 / def.rpm;
    this.fireTimer = interval;

    // Ensure camera world matrix matches the exact current aim before firing raycast
    this.syncCameraTransform();

    if (def.type === 'hammer') {
      this.useHammer(false);
      return;
    }

    if (def.type === 'medkit') {
      if (this.hp < PLAYER.MAX_HP || this.bleeding) {
        this.bleeding = false;
        this.hp = Math.min(PLAYER.MAX_HP, this.hp + PLAYER.MEDKIT_HEAL);
      }
      return;
    }

    if (def.type === 'ammocrate') {
      this.dropAmmoCrate();
      return;
    }

    if (cur.clip <= 0) {
      this.startReload();
      return;
    }

    cur.clip--;

    if (def.type === 'rpg') {
      sound.playRocketLaunch(0);
      this.launchRocket();
      this.recoilKickZ = PLAYER.RECOIL_KICK_Z;
      this.recoilOffsetPitch += def.recoilPitch || 0.014;
      this.yaw += (Math.random() - 0.5) * (def.recoilYaw || 0.006);
      this.addShake(0.32);
      const warhead = cur.mesh.getObjectByName('rpgWarhead');
      if (warhead) warhead.visible = false;
      if (cur.clip === 0 && cur.reserve > 0) {
        setTimeout(() => this.startReload(), 280);
      }
      return;
    }

    if (def.type === 'c4') {
      this.throwC4();
      return;
    }

    sound.playGunshot(def.soundType, 0, 0, Boolean(def.silenced));
    this.muzzleFlashTimer = def.flashMult === 0 ? 0 : 0.032;
    this.ejectBrassCasing();

    const suppressionSpreadMult = 1 + this.suppressionLevel * PLAYER.SUPPRESSION_SPREAD_MULT; // Suppression degrades accuracy
    const spread = (this.isAds ? def.spreadAds : def.spreadHip) * suppressionSpreadMult;
    const zeroElevation = this.isAds ? (this.zeroDistance - PLAYER.ZERO_DISTANCE_DEFAULT) * PLAYER.ZERO_ELEVATION_FACTOR : 0;
    const dir = new THREE.Vector3(
      (Math.random() - 0.5) * spread,
      (Math.random() - 0.5) * spread + zeroElevation,
      -1
    ).normalize();
    dir.applyQuaternion(this.camera.getWorldQuaternion(new THREE.Quaternion()));

    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    this.fireBallisticRay(origin, dir, def.damage, def.headshotMult, def.voxelDamage, def.shortName);

    // Apply recoil kick after the round leaves the barrel (Prone reduces recoil by 45%, Crouch by 22%)
    const recoilScale = this.prone ? PLAYER.RECOIL_SCALE_PRONE : this.crouching ? PLAYER.RECOIL_SCALE_CROUCH : 1.0;
    this.recoilKickZ = PLAYER.RECOIL_KICK_Z * recoilScale;
    this.recoilOffsetPitch += (def.recoilPitch || 0.014) * recoilScale;
    this.yaw += (Math.random() - 0.5) * (def.recoilYaw || 0.006) * recoilScale;

    if (cur.clip === 0 && cur.reserve > 0) {
      this.startReload();
    }
  },

  fireBallisticRay(origin, dir, damage, headshotMult, voxelDamage, weaponLabel) {
    // 1. Check high-precision 3D Voxel Grid Raycast (up to 420m across the valley)
    const voxelHit = this.world.raycastVoxel(origin, dir, DISTANCES.RAYCAST_MAX);
    let maxEntityDist = voxelHit ? voxelHit.distance : DISTANCES.RAYCAST_MAX;
    let endPoint = voxelHit
      ? voxelHit.point.clone()
      : origin.clone().addScaledVector(dir, 380);
    let penetratedWoodProp = false;

    // Thin wooden crates / interior props (`isProp` or `type === 'wood'`) can be penetrated (wallbanged)
    // by rifle/LMG/sniper rounds at 55% damage, while solid building walls (`brick`, `concrete`, `darkConcrete`,
    // `container`) and intact Sandbag/HESCO fortifications completely block bullets!
    if (
      voxelHit &&
      voxelHit.voxel &&
      (voxelHit.voxel.isProp || voxelHit.voxel.type === 'wood') &&
      damage >= 25
    ) {
      const nextHit = this.world.raycastVoxel(origin, dir, DISTANCES.RAYCAST_MAX, 0, voxelHit.voxel.key);
      maxEntityDist = nextHit ? nextHit.distance : DISTANCES.RAYCAST_MAX;
      penetratedWoodProp = true;
    }

    // 2. Raycast against Soldiers & Vehicles within maxEntityDist
    this.raycaster.set(origin, dir);
    this.raycaster.far = maxEntityDist;

    const targets = [...this.botManager.hitMeshes, ...this.vehicleManager.hitMeshes];
    if (this.onGetRemoteMeshes) {
      targets.push(...this.onGetRemoteMeshes());
    }

    const hits = this.raycaster.intersectObjects(targets, false);
    if (hits.length > 0) {
      const hit = hits[0];
      endPoint = hit.point.clone();
      const hitThroughWood = Boolean(
        penetratedWoodProp && voxelHit && hit.distance > voxelHit.distance
      );
      if (hitThroughWood && voxelHit && voxelHit.voxel) {
        this.world.damageVoxel(
          voxelHit.voxel.gx,
          voxelHit.voxel.gy,
          voxelHit.voxel.gz,
          voxelDamage,
          this.onBroadcast
        );
        this.world.spawnBulletImpact(voxelHit.point, voxelHit.normal, voxelHit.voxel.baseColor);
      }

      if (hit.object.userData.bot) {
        const bot = hit.object.userData.bot;
        if (bot.team !== this.team && !bot.dead) {
          const isHeadshot = Boolean(hit.object.userData.isHead);
          const penMult = hitThroughWood ? 0.55 : 1.0;
          const dmg = Math.max(1, Math.round(damage * penMult * (isHeadshot ? headshotMult : 1)));
          if (hitThroughWood && this.onAwardXp) {
            this.onAwardXp(25, 'WOOD CRATE WALLBANG!');
          }

          // Direct hit suppression on the NPC
          bot.suppressionLevel = Math.min(1.0, (bot.suppressionLevel || 0) + 0.35);

          const res = this.botManager.damageBot(
            bot,
            dmg,
            this.name,
            this.team,
            weaponLabel,
            isHeadshot,
            this.onKillEvent,
            this.onAwardXp
          );

          // Spawn 3D impact burst (bright red blood voxels or blue/gold armor sparks)
          // and flinch the enemy's upper body so hits are clearly visible through ADS!
          const impactColor =
            res.hitType === 'armor'
              ? new THREE.Color(0x48dbfb)
              : isHeadshot
              ? new THREE.Color(0xff2222)
              : new THREE.Color(0xd63031);
          this.world.spawnDebris(hit.point, impactColor, res.killed ? 6 : 3);
          if (bot.mesh.userData.parts && bot.mesh.userData.parts.upperBody) {
            bot.mesh.userData.parts.upperBody.rotation.x = -0.42;
          }

          const hmStyle = res.killed ? 'kill' : res.hitType;
          sound.playHitmarker(hmStyle);
          const hmLabel = res.killed
            ? isHeadshot
              ? 'HEADSHOT KILL!'
              : 'ELIMINATED!'
            : isHeadshot
            ? `HEADSHOT -${dmg}`
            : res.hitType === 'armor'
            ? `ARMOR HIT -${dmg}`
            : `HIT -${dmg}`;
          if (this.onHitmarker) this.onHitmarker(hmStyle, hmLabel);

          // Spawn floating damage number above the enemy
          if (this.onFloatingDamage) {
            this.onFloatingDamage(hit.point.clone().add(new THREE.Vector3(0, 0.5, 0)), dmg, isHeadshot);
          }

          if (res.killed) {
            this.kills++;
            const pts = isHeadshot ? COMBAT.KILL_XP_HEADSHOT : COMBAT.KILL_XP_NORMAL;
            this.score += pts;
            if (this.onAwardXp) {
              this.onAwardXp(
                pts,
                isHeadshot ? `ENEMY KILLED [HEADSHOT] (${bot.name})` : `ENEMY KILLED (${bot.name})`
              );
            }
            if (bot.role === 'MEDIC') {
              this.registerMedicWarCrime(bot.name, Boolean(res.wasRescuing));
            }
            // Kill streak / multi-kill tracking
            const killInfo = this.registerKill(bot.name);
            if (killInfo.announcement && this.onKillStreakAnnouncement) {
              this.onKillStreakAnnouncement(killInfo.announcement);
            }
            if (killInfo.streakAnnouncement && this.onKillStreakAnnouncement) {
              this.onKillStreakAnnouncement(killInfo.streakAnnouncement);
            }
          }
        }
      } else if (hit.object.userData.vehicle) {
        const veh = hit.object.userData.vehicle;
        if (veh.team !== this.team && !veh.dead) {
          this.world.spawnDebris(hit.point, new THREE.Color(0xf1c40f), 3);
          sound.playHitmarker('armor');
          if (this.onHitmarker) this.onHitmarker('armor', 'VEHICLE ARMOR');
          const destroyed = this.vehicleManager.damageVehicle(
            veh,
            Math.round(voxelDamage * 0.45),
            this.name,
            this.team,
            weaponLabel,
            this.onKillEvent,
            this.onAwardXp
          );
          if (destroyed) {
            this.vehiclesDestroyed = (this.vehiclesDestroyed || 0) + 1;
          }
        }
      } else if (hit.object.userData.remotePlayer) {
        const rp = hit.object.userData.remotePlayer;
        if (rp.team !== this.team) {
          const isHeadshot = Boolean(hit.object.userData.isHead);
          const dmg = Math.round(damage * (isHeadshot ? headshotMult : 1));
          sound.playHitmarker(isHeadshot ? 'headshot' : 'normal');
          if (this.onHitmarker) this.onHitmarker(isHeadshot ? 'headshot' : 'normal');
          if (this.onBroadcast) {
            this.onBroadcast({
              type: 'player_hit',
              targetId: rp.id,
              damage: dmg,
              attackerName: this.name,
              attackerTeam: this.team,
              weapon: weaponLabel
            });
          }
        }
      }
    } else if (voxelHit) {
      // 1) Interior wooden furniture/crates (`isProp` / `wood`) shatter quickly from gunfire.
      // 2) Sandbag fortifications (`sandbag`, including Hammer-built Sandbag Walls & Firing Ports)
      //    STOP bullets completely to protect the soldier behind cover, but sustained gunfire
      //    gradually chips away their HP (~8-14 rounds to chew through a sandbag block).
      // 3) Solid structural building blocks (`brick`, `concrete`, `darkConcrete`, `container`)
      //    and HESCO concrete bases are 100% bulletproof against small arms and only break
      //    from Explosives (RPG-7, C4, Frag, Tank 120mm, Airstrike) or the Sledgehammer!
      if (voxelHit.voxel) {
        if (voxelHit.voxel.isProp || voxelHit.voxel.type === 'wood') {
          this.world.damageVoxel(
            voxelHit.voxel.gx,
            voxelHit.voxel.gy,
            voxelHit.voxel.gz,
            voxelDamage,
            this.onBroadcast
          );
        } else if (voxelHit.voxel.type === 'sandbag') {
          const sandbagChip = Math.max(6, Math.round(voxelDamage * 0.45));
          this.world.damageVoxel(
            voxelHit.voxel.gx,
            voxelHit.voxel.gy,
            voxelHit.voxel.gz,
            sandbagChip,
            this.onBroadcast
          );
        }
      }
      const impactCol = voxelHit.voxel
        ? voxelHit.voxel.baseColor
        : new THREE.Color(0x6b7c59);
      this.world.spawnBulletImpact(voxelHit.point, voxelHit.normal, impactCol);
    }

    this.shotsFired = (this.shotsFired || 0) + 1;
    const curWep = this.currentWeapon();
    const hideTracers = Boolean(curWep && curWep.def && curWep.def.hideTracers);
    // NATO 5:1 Ball-to-Tracer belt setup: 1 Tracer round followed by 5 Regular rounds (1 in 6 shots);
    // SOCOM Tactical Silencer suppresses tracer reveal completely!
    const isTracerRound = !hideTracers && this.shotsFired % 6 === 1;
    const tracerStart = this.getWeaponMuzzleWorldPosition(origin, dir);

    if (isTracerRound) {
      this.botManager.spawnTracer(tracerStart, endPoint, 0xffeaa7);
    }

    // Near-miss suppression: suppress enemy NPCs whose position is within 4m of the bullet trajectory
    for (const bot of this.botManager.bots) {
      if (bot.dead || bot.team === this.team) continue;
      // Simplified: check distance from bot to the impact point
      const distToImpact = bot.pos.distanceTo(endPoint);
      if (distToImpact < 4 && distToImpact > 0.5) {
        bot.suppressionLevel = Math.min(1.0, (bot.suppressionLevel || 0) + 0.12);
      }
    }

    if (this.onBroadcast) {
      this.onBroadcast({
        type: 'shoot',
        origin: tracerStart.toArray(),
        end: endPoint.toArray(),
        weapon: weaponLabel,
        isTracer: isTracerRound
      });
    }
  },

  /**
   * Computes the exact world-space position of the active weapon's 3D barrel muzzle (`muzzleFlash` mesh),
   * or right-hand weapon barrel offset in hipfire/ADS, so bullet trails originate from the gun barrel
   * instead of the center of the player's body.
   */
  getWeaponMuzzleWorldPosition(origin, dir) {
    if (this.activeVehicle) {
      return origin.clone();
    }
    const cur = this.currentWeapon;
    if (cur && cur.mesh) {
      const flashObj = cur.mesh.getObjectByName('muzzleFlash');
      if (flashObj) {
        this.camera.updateMatrixWorld(true);
        const worldMuzzle = new THREE.Vector3();
        flashObj.getWorldPosition(worldMuzzle);
        if (Number.isFinite(worldMuzzle.x)) {
          return worldMuzzle;
        }
      }
    }
    const camQuat = this.camera.getWorldQuaternion(new THREE.Quaternion());
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camQuat);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camQuat);
    const lateralOffset = this.isAds ? 0.01 : 0.24;
    const verticalOffset = this.isAds ? -0.05 : -0.13;
    return origin
      .clone()
      .addScaledVector(right, lateralOffset)
      .addScaledVector(up, verticalOffset)
      .addScaledVector(dir, 0.85);
  },

  ejectBrassCasing() {
    if (this.world.debrisParticles.length > 120) return;
    const camPos = this.camera.getWorldPosition(new THREE.Vector3());
    const camQuat = this.camera.getWorldQuaternion(new THREE.Quaternion());
    const offset = new THREE.Vector3(0.18, -0.1, -0.25).applyQuaternion(camQuat);
    const vel = new THREE.Vector3(2.2 + Math.random(), 2.4 + Math.random(), 0.5).applyQuaternion(
      camQuat
    );

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.018, 0.018, 0.045),
      new THREE.MeshBasicMaterial({ color: 0xf1c40f })
    );
    mesh.position.copy(camPos).add(offset);
    this.scene.add(mesh);

    this.world.debrisParticles.push({
      mesh,
      vel,
      rotVel: new THREE.Vector3(14, 18, 12),
      life: 0.75
    });
  },

  launchRocket() {
    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(
      this.camera.getWorldQuaternion(new THREE.Quaternion())
    );

    const rocketMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.18, 0.68),
      new THREE.MeshBasicMaterial({ color: 0xe67e22 })
    );
    rocketMesh.position.copy(origin).addScaledVector(dir, 1.1);
    rocketMesh.lookAt(origin.clone().addScaledVector(dir, 10));
    this.scene.add(rocketMesh);

    this.world.projectiles.push({
      type: 'rpg',
      mesh: rocketMesh,
      vel: dir.multiplyScalar(PROJECTILES.RPG.speed),
      gravity: PROJECTILES.RPG.gravity,
      life: PROJECTILES.RPG.life,
      owner: this
    });
  },

  throwFragGrenade() {
    if (this.grenades <= 0) return;
    this.grenades--;

    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0.22, -1)
      .normalize()
      .applyQuaternion(this.camera.getWorldQuaternion(new THREE.Quaternion()));

    const grenMesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.14, 0),
      new THREE.MeshStandardMaterial({ color: 0x3b5323, roughness: 0.7 })
    );
    grenMesh.position.copy(origin).addScaledVector(dir, 0.9);
    this.scene.add(grenMesh);

    this.world.projectiles.push({
      type: 'grenade',
      mesh: grenMesh,
      vel: dir.multiplyScalar(PROJECTILES.GRENADE.speed),
      gravity: PROJECTILES.GRENADE.gravity,
      life: PROJECTILES.GRENADE.life, // 2.6-second fuse
      owner: this
    });
  },

  throwC4() {
    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0.16, -1)
      .normalize()
      .applyQuaternion(this.camera.getWorldQuaternion(new THREE.Quaternion()));

    const c4Mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.15, 0.34),
      new THREE.MeshStandardMaterial({ color: 0x5c6650 })
    );
    c4Mesh.position.copy(origin).addScaledVector(dir, 0.9);
    this.scene.add(c4Mesh);

    const proj = {
      type: 'c4',
      mesh: c4Mesh,
      vel: dir.multiplyScalar(PROJECTILES.C4.speed),
      gravity: PROJECTILES.C4.gravity,
      life: PROJECTILES.C4.life,
      owner: this
    };
    this.world.projectiles.push(proj);
    this.plantedC4.push(proj);
  },

  detonateC4() {
    if (this.plantedC4.length === 0) return;
    sound.playExplosion(0);
    this.addShake(0.6);
    for (const c4 of this.plantedC4) {
      const idx = this.world.projectiles.indexOf(c4);
      if (idx !== -1) {
        const pos = c4.mesh.position.clone();
        this.world.explodeAt(
          pos,
          PROJECTILES.C4_BLAST_RADIUS,
          PROJECTILES.C4_BLAST_DAMAGE,
          (blastPos, rad, dmg, broken) => {
            if (this.onExplosionDamage) this.onExplosionDamage(blastPos, rad, dmg, this, broken);
          },
          this.onBroadcast
        );
        this.scene.remove(c4.mesh);
        this.world.projectiles.splice(idx, 1);
      }
    }
    this.plantedC4 = [];
  },

  // Squad-style suppression: call this when bullets land near the player (within ~4m)
  applySuppression(intensity = 0.25) {
    this.suppressionLevel = Math.min(1.0, this.suppressionLevel + intensity);
    this.lastSuppressionHitTime = performance.now();
  },

  // Register a kill for streak/multi-kill tracking
  registerKill(victimName) {
    this.killStreak++;
    this.multiKillCount++;
    this.multiKillTimer = PLAYER.MULTI_KILL_TIMER; // 3.5s window for multi-kills

    // Announce multi-kills
    let announcement = null;
    if (this.multiKillCount === 2) announcement = 'DOUBLE KILL';
    else if (this.multiKillCount === 3) announcement = 'TRIPLE KILL';
    else if (this.multiKillCount === 4) announcement = 'QUAD KILL';
    else if (this.multiKillCount >= 5) announcement = 'RAMPAGE';

    // Announce kill streaks
    let streakAnnouncement = null;
    if (this.killStreak === 5) streakAnnouncement = 'KILLING SPREE (5)';
    else if (this.killStreak === 10) streakAnnouncement = 'UNSTOPPABLE (10)';
    else if (this.killStreak === 15) streakAnnouncement = 'GODLIKE (15)';
    else if (this.killStreak === 20) streakAnnouncement = 'LEGENDARY (20)';

    if (this.botManager && this.botManager.notifyPlayerKill) {
      this.botManager.notifyPlayerKill(this, victimName);
    }

    return { announcement, streakAnnouncement, streak: this.killStreak, multiKill: this.multiKillCount };
  },

  // Register a War Crime when eliminating a Field Medic (especially while rescuing!)
  registerMedicWarCrime(medicName, wasRescuing = false) {
    this.medicKills = (this.medicKills || 0) + 1;
    if (this.onAwardXp) {
      this.onAwardXp(
        0,
        wasRescuing
          ? `⚠️ WAR CRIME! KILLED MEDIC DURING RESCUE (${medicName} • #${this.medicKills})`
          : `⚠️ WAR CRIME: FIELD MEDIC ELIMINATED (${medicName} • #${this.medicKills})`
      );
    }
    if (this.onKillStreakAnnouncement && (wasRescuing || this.medicKills === 1 || this.medicKills % 3 === 0)) {
      this.onKillStreakAnnouncement(
        wasRescuing
          ? '⚠️ GENEVA VIOLATION: KILLED MEDIC ON RESCUE!'
          : `⚠️ WAR CRIME #${this.medicKills}: MEDIC ELIMINATED`
      );
    }
    if (this.botManager && this.botManager.notifyWarCrime) {
      this.botManager.notifyWarCrime(this, medicName, wasRescuing, this.medicKills);
    }
    if (this.onWarCrimeCommitted) {
      this.onWarCrimeCommitted(medicName, wasRescuing, this.medicKills);
    }
  },

  takeDamage(amount, attackerName, attackerTeam, weaponName, onKillFn, attackerPos = null) {
    if (this.dead || this.downed) return;

    // While inside an active Tank, APC, or Armored Car, the armored hull protects the crew's personal HP!
    if (this.activeVehicle && !this.activeVehicle.dead) {
      this.notifyVehicleHit(0, attackerName, weaponName || 'SMALL ARMS DEFLECTED', attackerPos);
      return;
    }

    // Taking direct hits always triggers suppression
    this.applySuppression(Math.min(COMBAT.SUPPRESSION_MAX_INTENSITY, amount * COMBAT.SUPPRESSION_INTENSITY_PER_DMG));

    // Body armor absorbs 35%–55% of incoming gunfire (based on equipped Tactical Vest) until depleted
    if (this.armor > 0 && weaponName !== 'BLEED') {
      const ratio = this.armorAbsorbRatio || PLAYER.ARMOR_ABSORB_RATIO;
      const absorbed = Math.min(this.armor, Math.round(amount * ratio));
      this.armor -= absorbed;
      amount -= absorbed;
    }

    this.hp -= amount;
    if (amount >= PLAYER.BLEED_CHANCE_THRESHOLD && Math.random() < PLAYER.BLEED_CHANCE) {
      this.bleeding = true;
    }

    if (this.onDamageTaken) {
      this.onDamageTaken(amount, attackerPos, false, weaponName, attackerName);
    }

    if (this.hp <= 0) {
      this.hp = 0;
      this.isFiring = false;
      this.isAds = false;
      this.reloading = false;
      if (this.activeVehicle) {
        this.activeVehicle.driver = null;
        this.activeVehicle = null;
      }

      if (onKillFn) {
        onKillFn(attackerName, attackerTeam, this.name, this.team, weaponName, false);
      }

      // Enter BattleBit Downed State (waiting for Medic revive or Hold [Space] to Give Up)
      this.downed = true;
      this.downedTimer = PLAYER.DOWNED_TIMER;
      this.giveUpProgress = 0;
      this.downedKiller = attackerName;
      this.downedWeapon = weaponName;
      this.viewModelGroup.visible = false;
    }
  },

  reviveFromDowned(medicName = 'SQUAD MEDIC') {
    if (!this.downed || this.dead) return;
    this.downed = false;
    this.downedTimer = 0;
    this.giveUpProgress = 0;
    this.hp = PLAYER.REVIVE_HP;
    this.bleeding = false;
    this.viewModelGroup.visible = true;
    sound.playReload();
    if (this.onAwardXp) {
      this.onAwardXp(COMBAT.REVIVE_XP, `REVIVED BY ${medicName}!`);
    }
  },

  finalizeDeath() {
    this.downed = false;
    this.dead = true;
    this.deaths++;
    this.killStreak = 0;
    this.multiKillCount = 0;
    this.multiKillTimer = 0;
    this.suppressionLevel = 0;
    this.respawnTimer = this.respawnDelay; // Start respawn countdown
    if (document.pointerLockElement === document.body) {
      document.exitPointerLock();
    }
    if (this.onPlayerDied) {
      this.onPlayerDied(this.downedKiller, this.downedWeapon);
    }
  }
};
