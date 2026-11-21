import * as THREE from '../../vendor/three.module.js';
import { sound } from '../audio.js?v=35';
import { PLAYER, PROJECTILES, DISTANCES } from '../config.js?v=35';

export const VehicleControlMethods = {
  /**
   * [E] Key Handler:
   * 1. Exit current Vehicle (Tank, APC/IFV, Humvee/Tigr)
   * 2. Toggle Dragging a downed friendly soldier to cover ([E] grab / [E] release)
   * 3. Enter / Commandeeer a nearby Vehicle (within 6.5m)
   */
  handleVehicleAndDragKey() {
    // 1. Exit vehicle if currently driving
    if (this.activeVehicle) {
      const v = this.activeVehicle;
      v.driver = null;
      this.activeVehicle = null;
      this.pos.copy(v.pos).add(new THREE.Vector3(3.2, 0.35, 0));
      this.viewModelGroup.visible = true;
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

    // 3. Enter / Commandeer a nearby Tank, APC, or Armored Car
    const nearVehicle = this.vehicleManager.findNearestEnterable(this.pos, DISTANCES.VEHICLE_ENTER_RANGE, this.team);
    if (nearVehicle) {
      if (nearVehicle.npcDriver) {
        // Friendly NPC driver hands over the controls and dismounts beside the vehicle
        const npc = nearVehicle.npcDriver;
        nearVehicle.npcDriver = null;
        npc.drivingVehicle = null;
        npc.mesh.visible = true;
        npc.pos.copy(nearVehicle.pos).add(new THREE.Vector3(3.2, 0, 1.5));
        npc.pos.y = this.world.getGroundHeightAt(npc.pos.x, npc.pos.z);
      }
      this.activeVehicle = nearVehicle;
      nearVehicle.driver = this;
      this.bleeding = false;
      this.bleedTickTimer = 0;
      this.isAds = false;
      this.reloading = false;
      this.viewModelGroup.visible = false;
      if (this.onAwardXp) this.onAwardXp(0, `MOUNTED ${nearVehicle.name}`);
      return;
    }
  },

  notifyVehicleHit(hullDamage, attackerName, weaponName, attackerPos = null) {
    if (hullDamage >= 35) {
      this.addShake(Math.min(0.45, hullDamage / 420));
    }
    if (this.onDamageTaken) {
      this.onDamageTaken(hullDamage, attackerPos, true, weaponName, attackerName);
    }
  },

  updateVehicleControl(dt) {
    const v = this.activeVehicle;
    if (!v || v.dead) {
      this.activeVehicle = null;
      this.viewModelGroup.visible = true;
      return;
    }

    const accel = (this.keys['KeyW'] ? 1 : 0) - (this.keys['KeyS'] ? 1 : 0);
    const steer = (this.keys['KeyA'] ? 1 : 0) - (this.keys['KeyD'] ? 1 : 0);

    const accelRate = v.accelRate || 3.5;
    const turnRate = v.turnRate || 1.65;

    if (accel !== 0) {
      v.forwardSpeed = THREE.MathUtils.lerp(v.forwardSpeed, accel * v.speed, dt * accelRate);
    } else {
      v.forwardSpeed *= Math.pow(0.12, dt);
    }

    if (Math.abs(v.forwardSpeed) > 0.5) {
      v.yaw += steer * dt * turnRate * Math.sign(v.forwardSpeed);
    }

    v.turretYaw = this.yaw;
    v.turretPitch = this.pitch;
    this.pos.copy(v.pos);

    // Position camera in turret or 3rd-person chase view
    const lookDir = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    );

    if (this.thirdPersonVehicle) {
      const camPos = v.pos
        .clone()
        .add(new THREE.Vector3(0, PLAYER.VEHICLE_3RD_PERSON_HEIGHT, 0))
        .addScaledVector(lookDir, PLAYER.VEHICLE_3RD_PERSON_DIST);
      this.camera.position.copy(camPos);
    } else {
      this.camera.position.set(v.pos.x, v.pos.y + PLAYER.VEHICLE_1ST_PERSON_HEIGHT, v.pos.z);
    }

    const euler = new THREE.Euler(this.pitch + this.recoilOffsetPitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);

    const targetFov = this.isAds ? PLAYER.VEHICLE_FOV_ADS : PLAYER.VEHICLE_FOV_NORMAL;
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, dt * 12);
    this.camera.updateProjectionMatrix();

    // Vehicle Mounted Turret Firing (120mm/125mm Tank Cannon + Coaxial MG, 30mm HE Autocannon, or .50 Cal HMG)
    const muzzleOrigin = v.pos
      .clone()
      .add(new THREE.Vector3(0, v.type === 'tank' ? 2.35 : 2.8, 0))
      .addScaledVector(lookDir, v.type === 'tank' ? 4.2 : 2.2);

    if (this.isFiring && v.fireCooldown <= 0) {
      v.fireCooldown = 60 / v.rpm;

      if (v.weaponType === 'tank_cannon') {
        v.barrelRecoil = 1.0;
        this.recoilOffsetPitch += 0.026;
        this.addShake(0.45);
        if (typeof sound.playTankCannon === 'function') {
          sound.playTankCannon(0, 0);
        } else {
          sound.playExplosion(0);
        }
        this.world.spawnDebris(muzzleOrigin, new THREE.Color(0xffaa00), 5);

        const shellMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.24, 0.24, 0.78),
          new THREE.MeshBasicMaterial({ color: 0xffaa00 })
        );
        shellMesh.position.copy(muzzleOrigin);
        shellMesh.lookAt(muzzleOrigin.clone().addScaledVector(lookDir, 10));
        this.scene.add(shellMesh);

        this.world.projectiles.push({
          type: 'tank_shell',
          mesh: shellMesh,
          vel: lookDir.clone().multiplyScalar(PROJECTILES.TANK_SHELL.speed),
          gravity: PROJECTILES.TANK_SHELL.gravity,
          life: PROJECTILES.TANK_SHELL.life,
          owner: this
        });
      } else if (v.weaponType === 'autocannon') {
        this.recoilOffsetPitch += 0.009;
        this.addShake(0.16);
        sound.playGunshot('autocannon', 0);
        const shellMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.16, 0.16, 0.48),
          new THREE.MeshBasicMaterial({ color: 0xffcc00 })
        );
        shellMesh.position.copy(muzzleOrigin);
        this.scene.add(shellMesh);

        this.world.projectiles.push({
          type: 'autocannon',
          mesh: shellMesh,
          vel: lookDir.clone().multiplyScalar(PROJECTILES.AUTOCANNON.speed),
          gravity: PROJECTILES.AUTOCANNON.gravity,
          life: PROJECTILES.AUTOCANNON.life,
          owner: this
        });
      } else {
        this.recoilOffsetPitch += 0.009;
        this.addShake(0.06);
        sound.playGunshot('hmg', 0);
        this.fireBallisticRay(muzzleOrigin, lookDir, 42, 1.8, 45, '.50 CAL HMG');
      }
    }

    // Tank Coaxial 7.62mm Machine Gun [Hold Space] (or while main cannon is reloading and holding LMB!)
    if (
      v.weaponType === 'tank_cannon' &&
      (this.keys['Space'] || (this.isFiring && v.fireCooldown > 0.25)) &&
      v.coaxCooldown <= 0
    ) {
      v.coaxCooldown = 60 / (v.coaxRpm || 620);
      this.recoilOffsetPitch += 0.004;
      this.addShake(0.035);
      sound.playGunshot('lmg', 0);
      const coaxOrigin = v.pos
        .clone()
        .add(new THREE.Vector3(0, 2.35, 0))
        .addScaledVector(lookDir, 2.4);
      this.fireBallisticRay(coaxOrigin, lookDir, 36, 1.8, 25, '7.62MM COAX MG');
    }

    this.recoilOffsetPitch *= Math.pow(0.08, dt);
  }
};
