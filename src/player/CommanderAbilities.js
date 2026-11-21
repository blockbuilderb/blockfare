import * as THREE from '../../vendor/three.module.js';
import { sound } from '../audio.js?v=90';
import { COMBAT, DEPLOYABLES } from '../config.js?v=90';
import { events } from '../events.js?v=90';
import {
  COMMANDER_UAV_EVENTS,
  COMMANDER_AIRSTRIKE_EVENTS,
  COMMANDER_AIRSTRIKE_STATES,
  DEPLOYABLE_EVENTS,
  syncSquadDeployablesFSM
} from '../core/StateMachines.js?v=90';

export const CommanderMethods = {
  triggerTacticalPing() {
    this.syncCameraTransform();
    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(
      this.camera.getWorldQuaternion(new THREE.Quaternion())
    );

    // Check if aiming near an enemy soldier to Spot them
    let bestEnemy = null;
    let bestDist = COMBAT.SPOT_DISTANCE;
    for (const bot of this.botManager.bots) {
      if (bot.dead || bot.downed || bot.team === this.team) continue;
      const toBot = bot.pos.clone().add(new THREE.Vector3(0, 1.1, 0)).sub(origin);
      const proj = toBot.dot(dir);
      if (proj > 1 && proj < bestDist) {
        const perpSq = toBot.lengthSq() - proj * proj;
        if (perpSq < COMBAT.SPOT_PERP_RADIUS * COMBAT.SPOT_PERP_RADIUS) {
          bestDist = proj;
          bestEnemy = bot;
        }
      }
    }

    if (bestEnemy) {
      bestEnemy.spottedTimer = COMBAT.SPOTTED_TIMER;
      const distM = Math.round(bestEnemy.pos.distanceTo(this.pos));
      this.activePing = {
        pos: bestEnemy.pos.clone().add(new THREE.Vector3(0, 2.1, 0)),
        timer: COMBAT.PING_TIMER_ENEMY,
        isEnemy: true,
        label: `ENEMY ${bestEnemy.role}`
      };
      if (this.onAwardXp) this.onAwardXp(COMBAT.SPOT_XP, `SPOTTED ENEMY (${bestEnemy.name})`);
      if (this.onCommoCommand) {
        this.onCommoCommand('ping', `HOSTILE ${bestEnemy.role} SPOTTED (${distM}m)!`, '🎯');
      }
      sound.playRadioBeep(false);
      return;
    }

    const voxelHit = this.world.raycastVoxel(origin, dir, COMBAT.SPOT_DISTANCE);
    const pingPos = voxelHit ? voxelHit.point.clone() : origin.clone().addScaledVector(dir, 90);
    this.activePing = {
      pos: pingPos,
      timer: COMBAT.PING_TIMER_SQUAD,
      isEnemy: false,
      label: 'SQUAD PING'
    };
    if (this.onCommoCommand) {
      this.onCommoCommand('ping', `CHECK MARKED COORDINATES (${Math.round(pingPos.distanceTo(this.pos))}m)!`, '📍');
    }
    sound.playRadioBeep(false);
  },

  // =========================================================================
  // SQUAD LEADER RALLY POINT (Mobile Squad Spawn — BattleBit/Squad inspired)
  // =========================================================================
  placeRallyPoint() {
    if (this.dead || this.downed || this.activeVehicle) return;
    if (this.rallyCooldown > 0) {
      if (this.onAwardXp) this.onAwardXp(0, `RALLY COOLDOWN: ${Math.ceil(this.rallyCooldown)}s`);
      return;
    }

    // Check no enemies within clear radius
    for (const b of this.botManager.bots) {
      if (b.dead || b.team === this.team) continue;
      if (b.pos.distanceTo(this.pos) < DEPLOYABLES.RALLY_ENEMY_CLEAR_RADIUS) {
        if (this.onAwardXp) this.onAwardXp(0, 'CANNOT PLACE RALLY — ENEMY TOO CLOSE');
        return;
      }
    }

    // Remove old rally mesh
    if (this.rallyPoint && this.rallyPoint.mesh) {
      this.scene.remove(this.rallyPoint.mesh);
    }

    // Create rally point beacon (green glowing pole)
    const rallyGroup = new THREE.Group();
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x27ae60, emissive: 0x27ae60, emissiveIntensity: 0.6 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.0, 6), poleMat);
    pole.position.y = 1.0;
    rallyGroup.add(pole);

    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x2ecc71, emissive: 0x2ecc71, emissiveIntensity: 1.2, transparent: true, opacity: 0.85 })
    );
    beacon.position.y = 2.15;
    rallyGroup.add(beacon);

    // Green glow ring on ground
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1.2, 16),
      new THREE.MeshBasicMaterial({ color: 0x2ecc71, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    rallyGroup.add(ring);

    const rallyPos = this.pos.clone();
    rallyPos.y = this.world.getGroundHeightAt(rallyPos.x, rallyPos.z);
    rallyGroup.position.copy(rallyPos);
    this.scene.add(rallyGroup);

    this.rallyPoint = {
      pos: rallyPos.clone(),
      mesh: rallyGroup,
      timer: DEPLOYABLES.RALLY_TIMER, // lasts 2 minutes
      team: this.team,
      squad: this.squad
    };
    this.rallyCooldown = DEPLOYABLES.RALLY_COOLDOWN; // 90s cooldown
    this.rallyDeployableFSM?.send(DEPLOYABLE_EVENTS.PLACE);

    if (this.onAwardXp) this.onAwardXp(50, 'RALLY POINT DEPLOYED — SQUAD CAN SPAWN HERE');
    sound.playReload();
  },

  // Update rally point state (called from update loop)
  updateRallyPoint(dt) {
    if (this.rallyCooldown > 0) {
      this.rallyCooldown = Math.max(0, this.rallyCooldown - dt);
      if (this.rallyCooldown <= 0 && !this.rallyPoint) {
        this.rallyDeployableFSM?.send(DEPLOYABLE_EVENTS.COOLDOWN_DONE);
      }
    }

    if (!this.rallyPoint) return;

    this.rallyPoint.timer -= dt;

    // Check if enemy destroyed it (within destroy radius)
    for (const b of this.botManager.bots) {
      if (b.dead || b.team === this.team) continue;
      if (b.pos.distanceTo(this.rallyPoint.pos) < DEPLOYABLES.RALLY_ENEMY_DESTROY_RADIUS) {
        if (this.onAwardXp) this.onAwardXp(0, 'RALLY POINT DESTROYED BY ENEMY');
        this.scene.remove(this.rallyPoint.mesh);
        this.rallyPoint = null;
        this.rallyDeployableFSM?.send(DEPLOYABLE_EVENTS.EXPIRE_OR_DESTROY);
        if (this.rallyCooldown <= 0) {
          this.rallyDeployableFSM?.send(DEPLOYABLE_EVENTS.COOLDOWN_DONE);
        }
        return;
      }
    }

    if (this.rallyPoint.timer <= 0) {
      if (this.onAwardXp) this.onAwardXp(0, 'RALLY POINT EXPIRED');
      this.scene.remove(this.rallyPoint.mesh);
      this.rallyPoint = null;
      this.rallyDeployableFSM?.send(DEPLOYABLE_EVENTS.EXPIRE_OR_DESTROY);
      if (this.rallyCooldown <= 0) {
        this.rallyDeployableFSM?.send(DEPLOYABLE_EVENTS.COOLDOWN_DONE);
      }
      return;
    }

    // Pulse the beacon
    const beacon = this.rallyPoint.mesh.children[1];
    if (beacon) {
      beacon.material.emissiveIntensity = 0.8 + Math.sin(performance.now() * 0.004) * 0.4;
    }
  },

  // ─── COMMANDER UAV SCAN & DATALINK [U] ────────────────────────────
  triggerCommanderUAV() {
    return this.activateUAV();
  },

  buildUAVDroneMesh() {
    const group = new THREE.Group();
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x2f3640, roughness: 0.45 });
    const wingMat = new THREE.MeshStandardMaterial({ color: 0x353b48, roughness: 0.5 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x00d2d3 });
    const redBeaconMat = new THREE.MeshBasicMaterial({ color: 0xff3838 });

    // Fuselage + V-tail + High-aspect Reaper wings + FLIR sensor turret
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.75, 5.2), hullMat);
    group.add(body);
    const wings = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.18, 1.15), wingMat);
    wings.position.set(0, 0.15, -0.2);
    group.add(wings);
    const tailL = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.14, 0.65), wingMat);
    tailL.position.set(-0.95, 0.65, 2.2);
    tailL.rotation.z = -0.52;
    group.add(tailL);
    const tailR = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.14, 0.65), wingMat);
    tailR.position.set(0.95, 0.65, 2.2);
    tailR.rotation.z = 0.52;
    group.add(tailR);

    const sensorPod = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 8), glowMat);
    sensorPod.position.set(0, -0.5, -1.7);
    group.add(sensorPod);

    const strobeL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), glowMat);
    strobeL.position.set(-5.7, 0.2, -0.2);
    group.add(strobeL);
    const strobeR = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), redBeaconMat);
    strobeR.position.set(5.7, 0.2, -0.2);
    group.add(strobeR);

    return group;
  },

  refreshUAVScanTargets() {
    this.uavRevealedBots = [];
    this.uavRevealedVehicles = [];

    for (const bot of this.botManager.bots) {
      if (bot.dead || bot.team === this.team) {
        bot.uavRevealed = false;
        bot.uavRevealTimer = 0;
        continue;
      }
      bot.uavRevealed = true;
      bot.uavRevealTimer = Math.max(1.5, this.uavTimer);
      bot.spottedTimer = Math.max(bot.spottedTimer || 0, 1.5);
      this.uavRevealedBots.push(bot);
    }

    if (this.vehicleManager && this.vehicleManager.vehicles) {
      for (const v of this.vehicleManager.vehicles) {
        if (v.dead || v.team === this.team) {
          v.uavRevealed = false;
          continue;
        }
        v.uavRevealed = true;
        this.uavRevealedVehicles.push(v);
      }
    }

    // Compute sector threat hotspot across Objectives A-E
    let bestFlagId = 'C';
    let bestCount = 0;
    if (this.world && this.world.flags) {
      for (const f of this.world.flags) {
        let count = 0;
        for (const b of this.uavRevealedBots) {
          if (Math.hypot(b.pos.x - f.pos.x, b.pos.z - f.pos.z) <= 68) count++;
        }
        if (count > bestCount) {
          bestCount = count;
          bestFlagId = f.id;
        }
      }
    }
    this.uavHotspotText =
      bestCount > 0 ? `HOTSPOT: OBJ ${bestFlagId} (${bestCount} HOSTILES)` : 'ALL SECTORS SWEPT';
  },

  activateUAV() {
    if ((this.world?.era || 'modern') !== 'modern') {
      return false;
    }
    if (this.uavCooldown > 0 && !this.uavActive) {
      if (this.onAwardXp) this.onAwardXp(0, `📡 UAV ON COOLDOWN (${Math.ceil(this.uavCooldown)}s)`);
      return false;
    }
    if (this.uavActive) {
      // Refreshing while active re-centers the radar pulse & extends scan
      this.uavTimer = Math.max(this.uavTimer, 25);
      this.refreshUAVScanTargets();
      if (this.onAwardXp) {
        this.onAwardXp(
          0,
          `📡 UAV DATALINK REFRESHED — ${this.uavRevealedBots.length} INFANTRY & ${this.uavRevealedVehicles.length} ARMOR PAINTED (${this.uavHotspotText})`
        );
      }
      return true;
    }

    this.uavActive = true;
    this.uavTimer = 25; // 25-second full-battlefield continuous datalink scan
    this.uavCooldown = 20; // 20-second fast tactical cooldown
    this.uavAssists = 0;
    this.uavOrbitAngle = 0;
    this.uavFSM?.send(COMMANDER_UAV_EVENTS.CALL_UAV);

    this.refreshUAVScanTargets();

    // Spawn 3D MQ-9 Reaper Drone circling overhead + Expanding Ground Radar Sweep Ring
    if (this.uavDroneMesh) this.scene.remove(this.uavDroneMesh);
    this.uavDroneMesh = this.buildUAVDroneMesh();
    this.uavDroneMesh.position.set(this.pos.x + 45, 76, this.pos.z);
    this.scene.add(this.uavDroneMesh);

    if (this.uavSweepRingMesh) this.scene.remove(this.uavSweepRingMesh);
    const sweepGeo = new THREE.RingGeometry(2.5, 4.2, 36);
    sweepGeo.rotateX(-Math.PI / 2);
    const sweepMat = new THREE.MeshBasicMaterial({
      color: 0x00d2d3,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.65
    });
    this.uavSweepRingMesh = new THREE.Mesh(sweepGeo, sweepMat);
    this.uavSweepRingMesh.position.set(this.pos.x, this.pos.y + 0.4, this.pos.z);
    this.scene.add(this.uavSweepRingMesh);

    const summary = `📡 MQ-9 UAV DATALINK ACTIVE — ${this.uavRevealedBots.length} INFANTRY & ${this.uavRevealedVehicles.length} ARMOR PAINTED IN 3D (${this.uavHotspotText})!`;
    if (this.onAwardXp) this.onAwardXp(60, summary);
    if (this.onKillStreakAnnouncement) {
      this.onKillStreakAnnouncement(
        `📡 UAV DATALINK ONLINE: ${this.uavRevealedBots.length} HOSTILES + ${this.uavRevealedVehicles.length} ARMOR PAINTED!`
      );
    }

    // Friendly Squad Leader acknowledges UAV Datalink over radio
    if (this.botManager && typeof this.botManager.emitBotComms === 'function') {
      const sl =
        this.botManager.bots.find((b) => !b.dead && b.team === this.team && b.isSquadLeader) ||
        this.botManager.bots.find((b) => !b.dead && b.team === this.team);
      if (sl) {
        this.botManager.emitBotComms(
          sl,
          this,
          `Copy Command! MQ-9 UAV Datalink received — ${this.uavRevealedBots.length} hostiles & ${this.uavRevealedVehicles.length} enemy vehicles painted on HUD (${this.uavHotspotText})!`,
          'COMMAND',
          true,
          'CMD NET'
        );
      }
    }

    sound.playRadioBeep(false);
    return true;
  },

  updateAirstrike(dt) {
    // Airstrike cooldown
    if (this.airstrikeCooldown > 0) {
      this.airstrikeCooldown = Math.max(0, this.airstrikeCooldown - dt);
      if (
        this.airstrikeCooldown <= 0 &&
        this.airstrikeFSM?.is(COMMANDER_AIRSTRIKE_STATES.STRIKE_COOLDOWN)
      ) {
        this.airstrikeFSM.send(COMMANDER_AIRSTRIKE_EVENTS.COOLDOWN_DONE);
      }
    }

    // Active airstrike target countdown & pulsing target ring
    if (this.airstrikeTarget) {
      this.airstrikeTarget.timer -= dt;
      if (this.airstrikeTarget.markers) {
        const pulse = 1 + Math.sin(performance.now() * 0.014) * 0.12;
        const outerRing = this.airstrikeTarget.markers.getObjectByName('strikeOuterRing');
        if (outerRing) outerRing.scale.set(pulse, pulse, 1);
      }
      if (this.airstrikeTarget.timer <= 0) {
        this.executeAirstrikeBarrage();
        this.airstrikeTarget = null;
        this.airstrikeFSM?.send(COMMANDER_AIRSTRIKE_EVENTS.RELEASE_BARRAGE);
      }
    }

    // Process staggered falling bombs in the active barrage queue
    if (this.pendingAirstrikeBombs && this.pendingAirstrikeBombs.length > 0) {
      for (let i = this.pendingAirstrikeBombs.length - 1; i >= 0; i--) {
        const bItem = this.pendingAirstrikeBombs[i];
        bItem.delay -= dt;
        if (bItem.delay <= 0) {
          this.spawnPhysicalAirstrikeBomb(bItem);
          this.pendingAirstrikeBombs.splice(i, 1);
        }
      }
      if (
        this.pendingAirstrikeBombs.length === 0 &&
        this.airstrikeFSM?.is(COMMANDER_AIRSTRIKE_STATES.BARRAGE_DROPPING)
      ) {
        this.airstrikeFSM.send(COMMANDER_AIRSTRIKE_EVENTS.BARRAGE_COMPLETE);
        if (this.airstrikeCooldown <= 0) {
          this.airstrikeFSM.send(COMMANDER_AIRSTRIKE_EVENTS.COOLDOWN_DONE);
        }
      }
    } else if (this.airstrikeFSM?.is(COMMANDER_AIRSTRIKE_STATES.BARRAGE_DROPPING)) {
      this.airstrikeFSM.send(COMMANDER_AIRSTRIKE_EVENTS.BARRAGE_COMPLETE);
      if (this.airstrikeCooldown <= 0) {
        this.airstrikeFSM.send(COMMANDER_AIRSTRIKE_EVENTS.COOLDOWN_DONE);
      }
    }

    // Animate 3D Strike Fighter Jets roaring across the sky
    if (this.activeAirstrikeJets && this.activeAirstrikeJets.length > 0) {
      for (let i = this.activeAirstrikeJets.length - 1; i >= 0; i--) {
        const jet = this.activeAirstrikeJets[i];
        jet.life -= dt;
        jet.mesh.position.addScaledVector(jet.vel, dt);
        if (jet.life <= 0) {
          this.scene.remove(jet.mesh);
          this.activeAirstrikeJets.splice(i, 1);
        }
      }
    }
  },

  updateUAV(dt) {
    // UAV cooldown
    if (this.uavCooldown > 0 && !this.uavActive) {
      this.uavCooldown = Math.max(0, this.uavCooldown - dt);
      if (this.uavCooldown <= 0) {
        this.uavFSM?.send(COMMANDER_UAV_EVENTS.COOLDOWN_DONE);
      }
    }

    // UAV continuous full-battlefield scan + 3D drone & radar pulse animation
    if (this.uavActive) {
      this.uavTimer -= dt;
      if (this.uavTimer <= 0) {
        this.uavActive = false;
        this.uavTimer = 0;
        for (const bot of this.botManager.bots) {
          if (bot.team !== this.team) {
            bot.uavRevealed = false;
            bot.uavRevealTimer = 0;
          }
        }
        if (this.vehicleManager && this.vehicleManager.vehicles) {
          for (const v of this.vehicleManager.vehicles) {
            v.uavRevealed = false;
          }
        }
        this.uavRevealedBots = [];
        this.uavRevealedVehicles = [];
        if (this.uavDroneMesh) {
          this.scene.remove(this.uavDroneMesh);
          this.uavDroneMesh = null;
        }
        if (this.uavSweepRingMesh) {
          this.scene.remove(this.uavSweepRingMesh);
          this.uavSweepRingMesh = null;
        }
        this.uavFSM?.send(COMMANDER_UAV_EVENTS.SCAN_EXPIRED);
        if (this.uavCooldown <= 0) {
          this.uavFSM?.send(COMMANDER_UAV_EVENTS.COOLDOWN_DONE);
        }
      } else {
        this.refreshUAVScanTargets();
        this.uavOrbitAngle = (this.uavOrbitAngle || 0) + dt * 0.55;
        if (this.uavDroneMesh) {
          const orbitR = 52;
          const dx = Math.cos(this.uavOrbitAngle) * orbitR;
          const dz = Math.sin(this.uavOrbitAngle) * orbitR;
          this.uavDroneMesh.position.set(this.pos.x + dx, 76, this.pos.z + dz);
          this.uavDroneMesh.rotation.y = -this.uavOrbitAngle;
          this.uavDroneMesh.rotation.z = 0.22; // banked turn
        }
        if (this.uavSweepRingMesh) {
          const pulsePhase = ((25 - this.uavTimer) * 0.85) % 1.0;
          const ringScale = 1 + pulsePhase * 28;
          const groundY = this.world.getGroundHeightAt(this.pos.x, this.pos.z);
          this.uavSweepRingMesh.position.set(this.pos.x, groundY + 0.45, this.pos.z);
          this.uavSweepRingMesh.scale.set(ringScale, ringScale, 1);
          this.uavSweepRingMesh.material.opacity = Math.max(0.05, (1 - pulsePhase) * 0.55);
        }
      }
    }

    this.updateAirstrike(dt);

    // Beacon cooldown
    if (this.beaconCooldown > 0) {
      this.beaconCooldown = Math.max(0, this.beaconCooldown - dt);
      if (this.beaconCooldown <= 0 && !this.insertionBeacon) {
        this.beaconDeployableFSM?.send(DEPLOYABLE_EVENTS.COOLDOWN_DONE);
      }
    }

    // Update insertion beacon
    if (this.insertionBeacon) {
      this.insertionBeacon.timer -= dt;
      if (this.insertionBeacon.timer <= 0 || this.insertionBeacon.spawnsLeft <= 0) {
        const wasDepleted = this.insertionBeacon.spawnsLeft <= 0;
        if (this.insertionBeacon.mesh) {
          this.scene.remove(this.insertionBeacon.mesh);
        }
        this.insertionBeacon = null;
        this.beaconDeployableFSM?.send(
          wasDepleted ? DEPLOYABLE_EVENTS.DEPLETE_SPAWNS : DEPLOYABLE_EVENTS.EXPIRE_OR_DESTROY
        );
        if (this.beaconCooldown <= 0) {
          this.beaconDeployableFSM?.send(DEPLOYABLE_EVENTS.COOLDOWN_DONE);
        }
      } else {
        for (const bot of this.botManager.bots) {
          if (bot.dead || bot.team === this.team) continue;
          if (bot.pos.distanceTo(this.insertionBeacon.pos) < 6) {
            if (this.onAwardXp) this.onAwardXp(0, 'INSERTION BEACON DESTROYED BY ENEMY');
            if (this.insertionBeacon.mesh) this.scene.remove(this.insertionBeacon.mesh);
            this.insertionBeacon = null;
            this.beaconDeployableFSM?.send(DEPLOYABLE_EVENTS.EXPIRE_OR_DESTROY);
            if (this.beaconCooldown <= 0) {
              this.beaconDeployableFSM?.send(DEPLOYABLE_EVENTS.COOLDOWN_DONE);
            }
            break;
          }
        }
        if (this.insertionBeacon && this.insertionBeacon.mesh) {
          const beacon = this.insertionBeacon.mesh.getObjectByName('beaconLight');
          if (beacon) {
            beacon.material.opacity = 0.4 + Math.sin(performance.now() * 0.004) * 0.3;
          }
        }
      }
    }
    syncSquadDeployablesFSM(this);

    // Commo rose cooldown
    if (this.commoRoseCooldown > 0) {
      this.commoRoseCooldown = Math.max(0, this.commoRoseCooldown - dt);
    }
  },

  // ─── FLEXIBLE COMMANDER AIRSTRIKE & ARTILLERY BARRAGE [J] ─────────
  cycleAirstrikePattern(forcePattern = null) {
    if ((this.world?.era || 'modern') !== 'modern') {
      return null;
    }
    const patterns = ['CARPET', 'BUNKER_BUSTER', 'ARTILLERY'];
    if (forcePattern && patterns.includes(forcePattern)) {
      this.airstrikePattern = forcePattern;
    } else {
      const idx = (patterns.indexOf(this.airstrikePattern) + 1) % patterns.length;
      this.airstrikePattern = patterns[idx];
    }
    const labels = {
      CARPET: '✈️ F-15E CARPET BOMBING RUN (8x 500LB JDAM ROLLING LINE)',
      BUNKER_BUSTER: '🎯 2,000LB GBU-28 BUNKER BUSTER (HEAVY ANTI-ARMOR & BUILDING DEMOLITION)',
      ARTILLERY: '🌧️ 155MM HE ARTILLERY BARRAGE (12-SHELL WIDE SATURATION)'
    };
    if (this.onAwardXp) {
      this.onAwardXp(0, `💥 STRIKE ORDNANCE SELECTED: ${labels[this.airstrikePattern]}`);
    }
    return this.airstrikePattern;
  },

  callCommanderAirstrike(customWorldPos = null, customPattern = null) {
    return this.callAirstrike(customWorldPos, customPattern);
  },

  resolveAirstrikeTargetPos(customWorldPos = null) {
    if (customWorldPos && typeof customWorldPos.x === 'number' && typeof customWorldPos.z === 'number') {
      const tx = THREE.MathUtils.clamp(customWorldPos.x, -1020, 1020);
      const tz = THREE.MathUtils.clamp(customWorldPos.z, -580, 580);
      const ty = this.world.getGroundHeightAt(tx, tz);
      return new THREE.Vector3(tx, ty, tz);
    }

    this.syncCameraTransform();
    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(
      this.camera.getWorldQuaternion(new THREE.Quaternion())
    );

    // 1. Check if aiming directly at an enemy vehicle up to 650m
    if (this.vehicleManager && this.vehicleManager.vehicles) {
      let bestVeh = null;
      let bestVehDist = 650;
      for (const v of this.vehicleManager.vehicles) {
        if (v.dead || v.team === this.team) continue;
        const toV = v.pos.clone().add(new THREE.Vector3(0, 1.4, 0)).sub(origin);
        const proj = toV.dot(dir);
        if (proj > 4 && proj < bestVehDist) {
          const perpSq = toV.lengthSq() - proj * proj;
          if (perpSq < 5.5 * 5.5) {
            bestVehDist = proj;
            bestVeh = v;
          }
        }
      }
      if (bestVeh) {
        const p = bestVeh.pos.clone();
        p.y = this.world.getGroundHeightAt(p.x, p.z);
        return p;
      }
    }

    // 2. Raycast against any 3D voxel building, wall, roof, bridge, or terrain up to 850m!
    const voxelHit = this.world.raycastVoxel(origin, dir, 850);
    if (voxelHit && voxelHit.point) {
      const tx = THREE.MathUtils.clamp(voxelHit.point.x, -1020, 1020);
      const tz = THREE.MathUtils.clamp(voxelHit.point.z, -580, 580);
      const ty = this.world.getGroundHeightAt(tx, tz);
      return new THREE.Vector3(tx, ty, tz);
    }

    // 3. If aiming downward at open ground beyond voxel raycast
    if (dir.y < -0.03) {
      const groundBaseY = this.pos.y;
      const t = THREE.MathUtils.clamp((groundBaseY - origin.y) / dir.y, 12, 750);
      const hitPt = origin.clone().addScaledVector(dir, t);
      const tx = THREE.MathUtils.clamp(hitPt.x, -1020, 1020);
      const tz = THREE.MathUtils.clamp(hitPt.z, -580, 580);
      const ty = this.world.getGroundHeightAt(tx, tz);
      return new THREE.Vector3(tx, ty, tz);
    }

    // 4. If aiming horizontally or upward into the sky: check if looking toward an Objective A-E,
    //    or project 95m forward along the horizontal look direction (never fails!)
    const horizDir = new THREE.Vector3(dir.x, 0, dir.z);
    if (horizDir.lengthSq() < 0.001) {
      horizDir.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    }
    horizDir.normalize();

    if (this.world && this.world.flags) {
      let bestFlag = null;
      let bestDot = 0.94; // within ~19 degrees of crosshair azimuth
      for (const f of this.world.flags) {
        const toF = new THREE.Vector3(f.pos.x - this.pos.x, 0, f.pos.z - this.pos.z);
        const dist = toF.length();
        if (dist > 15 && dist < 850) {
          toF.normalize();
          const d = toF.dot(horizDir);
          if (d > bestDot) {
            bestDot = d;
            bestFlag = f;
          }
        }
      }
      if (bestFlag) {
        return new THREE.Vector3(
          bestFlag.pos.x,
          this.world.getGroundHeightAt(bestFlag.pos.x, bestFlag.pos.z),
          bestFlag.pos.z
        );
      }
    }

    const fallbackPos = this.pos.clone().addScaledVector(horizDir, 85);
    const tx = THREE.MathUtils.clamp(fallbackPos.x, -1020, 1020);
    const tz = THREE.MathUtils.clamp(fallbackPos.z, -580, 580);
    const ty = this.world.getGroundHeightAt(tx, tz);
    return new THREE.Vector3(tx, ty, tz);
  },

  buildStrikeJetMesh() {
    const group = new THREE.Group();
    const fuselageMat = new THREE.MeshStandardMaterial({ color: 0x3d4852, roughness: 0.4 });
    const wingMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.45 });
    const burnerMat = new THREE.MeshBasicMaterial({ color: 0xff9f1a });

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 9.5), fuselageMat);
    group.add(body);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 3.2), fuselageMat);
    nose.position.set(0, -0.1, -5.8);
    group.add(nose);
    const wings = new THREE.Mesh(new THREE.BoxGeometry(11.2, 0.22, 3.4), wingMat);
    wings.position.set(0, 0, 0.6);
    group.add(wings);
    const tailL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.9, 2.0), wingMat);
    tailL.position.set(-0.7, 1.1, 3.6);
    group.add(tailL);
    const tailR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.9, 2.0), wingMat);
    tailR.position.set(0.7, 1.1, 3.6);
    group.add(tailR);
    const burnerL = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 1.4), burnerMat);
    burnerL.position.set(-0.42, 0, 5.1);
    group.add(burnerL);
    const burnerR = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 1.4), burnerMat);
    burnerR.position.set(0.42, 0, 5.1);
    group.add(burnerR);

    return group;
  },

  callAirstrike(customWorldPos = null, customPattern = null) {
    if ((this.world?.era || 'modern') !== 'modern') {
      return false;
    }
    if (customPattern) {
      this.airstrikePattern = customPattern;
    }
    if (this.airstrikeCooldown > 0 && !customWorldPos) {
      if (this.onAwardXp) {
        this.onAwardXp(0, `💥 AIRSTRIKE REARMING (${Math.ceil(this.airstrikeCooldown)}s)`);
      }
      return false;
    }
    if (this.airstrikeTarget) {
      if (this.airstrikeTarget.markers) {
        this.scene.remove(this.airstrikeTarget.markers);
      }
      this.airstrikeTarget = null;
    }

    const targetPos = this.resolveAirstrikeTargetPos(customWorldPos);
    const pattern = this.airstrikePattern || 'CARPET';

    // Compute strike run vector (along player's look azimuth or from HQ toward target)
    const strikeDir = new THREE.Vector3(targetPos.x - this.pos.x, 0, targetPos.z - this.pos.z);
    if (strikeDir.lengthSq() < 4) {
      strikeDir.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    }
    strikeDir.normalize();

    // Create high-visibility 3D target zone rings + red smoke flare beacon
    const markerGroup = new THREE.Group();
    const outerRadius = pattern === 'ARTILLERY' ? 22 : pattern === 'BUNKER_BUSTER' ? 16 : 18;
    const ringGeo = new THREE.RingGeometry(outerRadius - 1.5, outerRadius, 36);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff3838,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.82
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.name = 'strikeOuterRing';
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(targetPos.x, targetPos.y + 0.45, targetPos.z);
    markerGroup.add(ring);

    const innerGeo = new THREE.RingGeometry(2.2, 3.4, 24);
    const innerRing = new THREE.Mesh(innerGeo, ringMat);
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.set(targetPos.x, targetPos.y + 0.48, targetPos.z);
    markerGroup.add(innerRing);

    const beamGeo = new THREE.CylinderGeometry(0.22, 0.22, 55, 8);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xff3838,
      transparent: true,
      opacity: 0.58
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(targetPos.x, targetPos.y + 27.5, targetPos.z);
    markerGroup.add(beam);

    this.scene.add(markerGroup);
    this.world.spawnDebris(targetPos.clone().add(new THREE.Vector3(0, 1.2, 0)), new THREE.Color(0xff3838), 6);

    const leadTime = 2.4; // Fast 2.4s strike lead-in!
    this.airstrikeTarget = {
      pos: targetPos.clone(),
      timer: leadTime,
      maxTimer: leadTime,
      pattern,
      strikeDir: strikeDir.clone(),
      markers: markerGroup
    };
    this.airstrikeCooldown = 16; // Fast 16s tactical rearm cooldown
    if (this.airstrikeFSM) {
      if (!this.airstrikeFSM.send(COMMANDER_AIRSTRIKE_EVENTS.DESIGNATE_TARGET)) {
        this.airstrikeFSM.send(COMMANDER_AIRSTRIKE_EVENTS.FORCE_REDESIGNATE);
      }
    }

    // Spawn 3D Strike Fighter Jet screaming in across the sky toward the target!
    if (pattern !== 'ARTILLERY') {
      const jetMesh = this.buildStrikeJetMesh();
      const jetStart = targetPos
        .clone()
        .addScaledVector(strikeDir, -195)
        .add(new THREE.Vector3(0, 62, 0));
      jetMesh.position.copy(jetStart);
      jetMesh.lookAt(targetPos.clone().addScaledVector(strikeDir, 195).add(new THREE.Vector3(0, 62, 0)));
      this.scene.add(jetMesh);
      this.activeAirstrikeJets.push({
        mesh: jetMesh,
        vel: strikeDir.clone().multiplyScalar(115),
        life: 4.4
      });
    }

    const distM = Math.round(this.pos.distanceTo(targetPos));
    const patLabel =
      pattern === 'BUNKER_BUSTER'
        ? '2,000LB GBU BUNKER-BUSTER'
        : pattern === 'ARTILLERY'
        ? '155MM ARTILLERY BARRAGE'
        : 'F-15E CARPET BOMBING RUN';
    events.emit('airstrike:called', {
      pos: targetPos.clone(),
      pattern,
      label: patLabel,
      leadTime,
      distance: distM
    });
    if (this.onAwardXp) {
      this.onAwardXp(
        25,
        `💥 ${patLabel} DESIGNATED AT (${Math.round(targetPos.x)}, ${Math.round(targetPos.z)}) • ${distM}m — IMPACT IN ${leadTime}s!`
      );
    }
    if (this.onKillStreakAnnouncement) {
      this.onKillStreakAnnouncement(`💥 ${patLabel} INBOUND (${distM}m)!`);
    }
    sound.playRadioBeep(false);
    return true;
  },

  spawnPhysicalAirstrikeBomb(bItem) {
    const isHeavyGbu = bItem.isHeavyGbu;
    const bombGroup = new THREE.Group();
    const bodyGeo = new THREE.BoxGeometry(
      isHeavyGbu ? 0.65 : 0.42,
      isHeavyGbu ? 1.85 : 1.25,
      isHeavyGbu ? 0.65 : 0.42
    );
    const bodyMat = new THREE.MeshStandardMaterial({
      color: isHeavyGbu ? 0xc0392b : 0x2f3640,
      roughness: 0.5
    });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bombGroup.add(bodyMesh);

    const glowGeo = new THREE.BoxGeometry(
      isHeavyGbu ? 0.5 : 0.34,
      0.45,
      isHeavyGbu ? 0.5 : 0.34
    );
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xff9f1a });
    const glowMesh = new THREE.Mesh(glowGeo, glowMat);
    glowMesh.position.y = isHeavyGbu ? 0.85 : 0.58;
    bombGroup.add(glowMesh);

    bombGroup.position.copy(bItem.spawnPos);
    this.scene.add(bombGroup);

    this.world.projectiles.push({
      type: 'airstrike_bomb',
      mesh: bombGroup,
      vel: bItem.vel.clone(),
      gravity: 32.0,
      life: 3.5,
      owner: this,
      blastRadius: bItem.blastRadius,
      blastDamage: bItem.blastDamage,
      weaponLabel: bItem.weaponLabel
    });
  },

  executeAirstrikeBarrage() {
    const target = this.airstrikeTarget;
    if (!target) return;

    if (target.markers) {
      this.scene.remove(target.markers);
    }

    const pattern = target.pattern || this.airstrikePattern || 'CARPET';
    const dir = target.strikeDir || new THREE.Vector3(1, 0, 0);
    const right = new THREE.Vector3(-dir.z, 0, dir.x);

    if (pattern === 'BUNKER_BUSTER') {
      // 1 Massive 2,000lb GBU-28 Bunker-Buster dead-center + 4 secondary cluster submunitions
      this.pendingAirstrikeBombs.push({
        delay: 0.01,
        spawnPos: new THREE.Vector3(target.pos.x - dir.x * 12, target.pos.y + 58, target.pos.z - dir.z * 12),
        vel: new THREE.Vector3(dir.x * 16, -78, dir.z * 16),
        blastRadius: 19.5,
        blastDamage: 720,
        weaponLabel: '2000LB GBU BUNKER-BUSTER',
        isHeavyGbu: true
      });
      const clusterOffsets = [
        [8, 6],
        [-8, 6],
        [8, -6],
        [-8, -6]
      ];
      clusterOffsets.forEach(([ox, oz], idx) => {
        const ix = target.pos.x + dir.x * ox + right.x * oz;
        const iz = target.pos.z + dir.z * ox + right.z * oz;
        const iy = this.world.getGroundHeightAt(ix, iz);
        this.pendingAirstrikeBombs.push({
          delay: 0.22 + idx * 0.09,
          spawnPos: new THREE.Vector3(ix, iy + 54, iz),
          vel: new THREE.Vector3(0, -74, 0),
          blastRadius: 12.5,
          blastDamage: 460,
          weaponLabel: 'GBU CLUSTER WARHEAD',
          isHeavyGbu: false
        });
      });
    } else if (pattern === 'ARTILLERY') {
      // 12 Whistling 155mm HE Shells saturating a 30m radius zone over 2.2 seconds
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
        const dist = i === 0 ? 0 : 5 + (i % 3) * 8.5 + Math.random() * 4;
        const ix = target.pos.x + Math.cos(angle) * dist;
        const iz = target.pos.z + Math.sin(angle) * dist;
        const iy = this.world.getGroundHeightAt(ix, iz);
        this.pendingAirstrikeBombs.push({
          delay: i * 0.16,
          spawnPos: new THREE.Vector3(ix - dir.x * 10, iy + 64, iz - dir.z * 10),
          vel: new THREE.Vector3(dir.x * 12, -76, dir.z * 12),
          blastRadius: 12.0,
          blastDamage: 440,
          weaponLabel: '155MM HE ARTILLERY',
          isHeavyGbu: false
        });
      }
    } else {
      // CARPET BOMBING RUN: 9x 500lb JDAM Bombs walking in a rolling 56m line across the target!
      const totalBombs = 9;
      for (let i = 0; i < totalBombs; i++) {
        const along = (i - (totalBombs - 1) * 0.5) * 6.8; // -27.2m to +27.2m rolling carpet
        const lateral = (i % 2 === 0 ? 1 : -1) * (i === 4 ? 0 : 3.2);
        const ix = target.pos.x + dir.x * along + right.x * lateral;
        const iz = target.pos.z + dir.z * along + right.z * lateral;
        const iy = this.world.getGroundHeightAt(ix, iz);
        this.pendingAirstrikeBombs.push({
          delay: i * 0.12,
          spawnPos: new THREE.Vector3(ix - dir.x * 14, iy + 56, iz - dir.z * 14),
          vel: new THREE.Vector3(dir.x * 18, -75, dir.z * 18),
          blastRadius: 13.5,
          blastDamage: 500,
          weaponLabel: '500LB JDAM AIRSTRIKE',
          isHeavyGbu: i === 4
        });
      }
    }

    const distToPlayer = this.pos.distanceTo(target.pos);
    if (distToPlayer < 110) {
      this.addShake(Math.max(0.25, (1 - distToPlayer / 110) * 0.95));
    }

    if (this.onAwardXp) {
      this.onAwardXp(85, `💥 ${pattern} PAYLOAD RELEASED — BOMBS ON TARGET!`);
    }
  },

  // ─── INSERTION BEACON [6] (Recon Only) ────────────────────────────
  placeInsertionBeacon() {
    if (this.role !== 'recon') {
      if (this.onAwardXp) this.onAwardXp(0, 'RECON CLASS ONLY — INSERTION BEACON');
      return;
    }
    if (this.beaconCooldown > 0) {
      if (this.onAwardXp) this.onAwardXp(0, `BEACON COOLDOWN (${Math.ceil(this.beaconCooldown)}s)`);
      return;
    }
    if (this.insertionBeacon) {
      // Remove existing beacon
      if (this.insertionBeacon.mesh) {
        this.scene.remove(this.insertionBeacon.mesh);
      }
      this.insertionBeacon = null;
    }

    // Place beacon at current position
    const beaconPos = this.pos.clone();
    beaconPos.y = this.world.getGroundHeightAt(beaconPos.x, beaconPos.z);

    // Create visual beacon mesh
    const group = new THREE.Group();

    // Base cylinder (small black device)
    const baseGeo = new THREE.CylinderGeometry(0.25, 0.35, 0.4, 8);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.5 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.2;
    group.add(base);

    // Antenna
    const antGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.8, 4);
    const antMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
    const ant = new THREE.Mesh(antGeo, antMat);
    ant.position.y = 0.8;
    group.add(ant);

    // Pulsing blue light
    const lightGeo = new THREE.SphereGeometry(0.12, 8, 8);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0x3498db, transparent: true, opacity: 0.6 });
    const light = new THREE.Mesh(lightGeo, lightMat);
    light.name = 'beaconLight';
    light.position.y = 1.2;
    group.add(light);

    group.position.copy(beaconPos);
    this.scene.add(group);

    this.insertionBeacon = {
      pos: beaconPos.clone(),
      mesh: group,
      spawnsLeft: DEPLOYABLES.BEACON_SPAWNS,
      timer: DEPLOYABLES.BEACON_TIMER // 3 minute lifetime
    };
    this.beaconCooldown = 45; // 45 second cooldown
    this.beaconDeployableFSM?.send(DEPLOYABLE_EVENTS.PLACE);

    if (this.onAwardXp) this.onAwardXp(25, 'INSERTION BEACON DEPLOYED (2 SPAWNS)');
    sound.playBuildHammer();
  },

  // ─── COMMO ROSE COMMAND ───────────────────────────────────────────
  sendCommoCommand(commandId) {
    if (this.commoRoseCooldown > 0) return;
    this.commoRoseCooldown = 1.5; // prevent spam
    sound.playRadioBeep(false);

    const COMMO_COMMANDS = {
      'contact_north': { text: 'CONTACT NORTH!', icon: '⚠️' },
      'contact_east': { text: 'CONTACT EAST!', icon: '⚠️' },
      'contact_south': { text: 'CONTACT SOUTH!', icon: '⚠️' },
      'contact_west': { text: 'CONTACT WEST!', icon: '⚠️' },
      'need_medic': { text: 'MEDIC! I NEED HELP!', icon: '🏥' },
      'need_ammo': { text: 'I NEED AMMO!', icon: '📦' },
      'affirmative': { text: 'AFFIRMATIVE!', icon: '✅' },
      'negative': { text: 'NEGATIVE!', icon: '❌' },
      'follow_me': { text: 'FOLLOW ME!', icon: '👆' },
      'go_go_go': { text: 'GO GO GO!', icon: '🏃' },
      'hold_position': { text: 'HOLD THIS POSITION!', icon: '🛡️' },
      'enemy_vehicle': { text: 'ENEMY VEHICLE SPOTTED!', icon: '🚗' },
      'order_all_attack': { text: 'COMMAND NET: ALL SQUADS ADVANCE ON OBJECTIVE!', icon: '⭐' },
      'order_squad_attack': { text: 'SQUAD NET: SQUAD ADVANCE ON OBJECTIVE!', icon: '🎯' },
      'order_flag_A': { text: 'STRATEGIC ORDER: CAPTURE OBJECTIVE ALPHA [A]!', icon: '🚩' },
      'order_flag_B': { text: 'STRATEGIC ORDER: CAPTURE OBJECTIVE BRAVO [B]!', icon: '🚩' },
      'order_flag_C': { text: 'STRATEGIC ORDER: CAPTURE OBJECTIVE CHARLIE [C]!', icon: '🚩' },
      'order_flag_D': { text: 'STRATEGIC ORDER: CAPTURE OBJECTIVE DELTA [D]!', icon: '🚩' },
      'order_flag_E': { text: 'STRATEGIC ORDER: CAPTURE OBJECTIVE ECHO [E]!', icon: '🚩' }
    };

    const cmd = COMMO_COMMANDS[commandId];
    if (!cmd) return;

    this.lastCommoCommand = cmd;

    // Trigger UI callout
    if (this.onCommoCommand) {
      this.onCommoCommand(commandId, cmd.text, cmd.icon);
    } else {
      events.emit('commo:command', { cmdId: commandId, text: cmd.text, icon: cmd.icon });
    }
  }
};
