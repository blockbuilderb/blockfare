import * as THREE from '../../vendor/three.module.js';
import { sound } from '../audio.js?v=136';
import { COMBAT, DEPLOYABLES } from '../config.js?v=136';
import { events } from '../events.js?v=136';
import {
  COMMANDER_UAV_EVENTS,
  COMMANDER_AIRSTRIKE_EVENTS,
  COMMANDER_AIRSTRIKE_STATES,
  DEPLOYABLE_EVENTS,
  syncSquadDeployablesFSM
} from '../core/StateMachines.js?v=136';

function markShared(asset) {
  if (asset) {
    if (!asset.userData) asset.userData = {};
    asset.userData.shared = true;
  }
  return asset;
}

// ─── Shared Cached Geometries & Materials (userData.shared = true) ─────────
const _rallyPoleGeo = markShared(new THREE.CylinderGeometry(0.08, 0.08, 2.0, 6));
const _rallyPoleMat = markShared(
  new THREE.MeshStandardMaterial({ color: 0x27ae60, emissive: 0x27ae60, emissiveIntensity: 0.6 })
);
const _rallyBeaconGeo = markShared(new THREE.SphereGeometry(0.22, 8, 8));
const _rallyBeaconMat = markShared(
  new THREE.MeshStandardMaterial({
    color: 0x2ecc71,
    emissive: 0x2ecc71,
    emissiveIntensity: 1.2,
    transparent: true,
    opacity: 0.85
  })
);
const _rallyRingGeo = markShared(new THREE.RingGeometry(0.8, 1.2, 16));
const _rallyRingMat = markShared(
  new THREE.MeshBasicMaterial({
    color: 0x2ecc71,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide
  })
);

const _uavHullMat = markShared(new THREE.MeshStandardMaterial({ color: 0x2f3640, roughness: 0.45 }));
const _uavWingMat = markShared(new THREE.MeshStandardMaterial({ color: 0x353b48, roughness: 0.5 }));
const _uavGlowMat = markShared(new THREE.MeshBasicMaterial({ color: 0x00d2d3 }));
const _uavRedBeaconMat = markShared(new THREE.MeshBasicMaterial({ color: 0xff3838 }));
const _uavBodyGeo = markShared(new THREE.BoxGeometry(1.1, 0.75, 5.2));
const _uavWingsGeo = markShared(new THREE.BoxGeometry(11.5, 0.18, 1.15));
const _uavTailGeo = markShared(new THREE.BoxGeometry(2.4, 0.14, 0.65));
const _uavPodGeo = markShared(new THREE.SphereGeometry(0.45, 8, 8));
const _uavStrobeGeo = markShared(new THREE.BoxGeometry(0.28, 0.28, 0.28));

const _uavSweepRingGeo = markShared(new THREE.RingGeometry(2.5, 4.2, 36));
_uavSweepRingGeo.rotateX(-Math.PI / 2);
const _uavSweepRingMat = markShared(
  new THREE.MeshBasicMaterial({
    color: 0x00d2d3,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.65
  })
);

const _jetFuselageMat = markShared(new THREE.MeshStandardMaterial({ color: 0x3d4852, roughness: 0.4 }));
const _jetWingMat = markShared(new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.45 }));
const _jetBurnerMat = markShared(new THREE.MeshBasicMaterial({ color: 0xff9f1a }));
const _jetBodyGeo = markShared(new THREE.BoxGeometry(1.6, 1.0, 9.5));
const _jetNoseGeo = markShared(new THREE.BoxGeometry(1.0, 0.7, 3.2));
const _jetWingsGeo = markShared(new THREE.BoxGeometry(11.2, 0.22, 3.4));
const _jetTailGeo = markShared(new THREE.BoxGeometry(0.22, 1.9, 2.0));
const _jetBurnerGeo = markShared(new THREE.BoxGeometry(0.55, 0.55, 1.4));

const _strikeOuterRingGeos = new Map();
function getStrikeOuterRingGeo(outerRadius) {
  let geo = _strikeOuterRingGeos.get(outerRadius);
  if (!geo) {
    geo = markShared(new THREE.RingGeometry(outerRadius - 1.5, outerRadius, 36));
    _strikeOuterRingGeos.set(outerRadius, geo);
  }
  return geo;
}
const _strikeInnerRingGeo = markShared(new THREE.RingGeometry(2.2, 3.4, 24));
const _strikeBeamGeo = markShared(new THREE.CylinderGeometry(0.22, 0.22, 55, 8));
const _strikeRingMat = markShared(
  new THREE.MeshBasicMaterial({
    color: 0xff3838,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.82
  })
);
const _strikeBeamMat = markShared(
  new THREE.MeshBasicMaterial({
    color: 0xff3838,
    transparent: true,
    opacity: 0.58
  })
);

const _heavyGbuBodyGeo = markShared(new THREE.BoxGeometry(0.65, 1.85, 0.65));
const _stdBombBodyGeo = markShared(new THREE.BoxGeometry(0.42, 1.25, 0.42));
const _heavyGbuBodyMat = markShared(new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.5 }));
const _stdBombBodyMat = markShared(new THREE.MeshStandardMaterial({ color: 0x2f3640, roughness: 0.5 }));
const _heavyGbuGlowGeo = markShared(new THREE.BoxGeometry(0.5, 0.45, 0.5));
const _stdBombGlowGeo = markShared(new THREE.BoxGeometry(0.34, 0.45, 0.34));
const _bombGlowMat = markShared(new THREE.MeshBasicMaterial({ color: 0xff9f1a }));

const _beaconBaseGeo = markShared(new THREE.CylinderGeometry(0.25, 0.35, 0.4, 8));
const _beaconBaseMat = markShared(new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.5 }));
const _beaconAntGeo = markShared(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 4));
const _beaconAntMat = markShared(new THREE.MeshBasicMaterial({ color: 0x333333 }));
const _beaconLightGeo = markShared(new THREE.SphereGeometry(0.12, 8, 8));
const _beaconLightMat = markShared(
  new THREE.MeshBasicMaterial({ color: 0x3498db, transparent: true, opacity: 0.6 })
);

const _strikeFlareColor = new THREE.Color(0xff3838);
const _cmdOrigin = new THREE.Vector3();
const _cmdDir = new THREE.Vector3();
const _cmdQuat = new THREE.Quaternion();
const _cmdScratch = new THREE.Vector3();
const _COMMO_COMMANDS = {
  contact_north: { text: 'CONTACT NORTH!', icon: '⚠️' },
  contact_east: { text: 'CONTACT EAST!', icon: '⚠️' },
  contact_south: { text: 'CONTACT SOUTH!', icon: '⚠️' },
  contact_west: { text: 'CONTACT WEST!', icon: '⚠️' },
  need_medic: { text: 'MEDIC! I NEED HELP!', icon: '🏥' },
  need_ammo: { text: 'I NEED AMMO!', icon: '📦' },
  affirmative: { text: 'AFFIRMATIVE!', icon: '✅' },
  negative: { text: 'NEGATIVE!', icon: '❌' },
  follow_me: { text: 'FOLLOW ME!', icon: '👆' },
  go_go_go: { text: 'GO GO GO!', icon: '🏃' },
  hold_position: { text: 'HOLD THIS POSITION!', icon: '🛡️' },
  enemy_vehicle: { text: 'ENEMY VEHICLE SPOTTED!', icon: '🚗' },
  order_all_attack: { text: 'COMMAND NET: ALL SQUADS ADVANCE ON OBJECTIVE!', icon: '⭐' },
  order_squad_attack: { text: 'SQUAD NET: SQUAD ADVANCE ON OBJECTIVE!', icon: '🎯' },
  order_flag_A: { text: 'STRATEGIC ORDER: CAPTURE OBJECTIVE ALPHA [A]!', icon: '🚩' },
  order_flag_B: { text: 'STRATEGIC ORDER: CAPTURE OBJECTIVE BRAVO [B]!', icon: '🚩' },
  order_flag_C: { text: 'STRATEGIC ORDER: CAPTURE OBJECTIVE CHARLIE [C]!', icon: '🚩' },
  order_flag_D: { text: 'STRATEGIC ORDER: CAPTURE OBJECTIVE DELTA [D]!', icon: '🚩' },
  order_flag_E: { text: 'STRATEGIC ORDER: CAPTURE OBJECTIVE ECHO [E]!', icon: '🚩' }
};

export const CommanderMethods = {
  triggerTacticalPing() {
    this.syncCameraTransform();
    this.camera.getWorldPosition(_cmdOrigin);
    this.camera.getWorldQuaternion(_cmdQuat);
    _cmdDir.set(0, 0, -1).applyQuaternion(_cmdQuat);

    // Check if aiming near an enemy soldier or enemy vehicle to Spot / JTAC Laser-Paint them
    const isReconJtac = this.role === 'recon';
    const maxSpotDist = isReconJtac ? 420 : COMBAT.SPOT_DISTANCE;
    let bestEnemy = null;
    let bestDist = maxSpotDist;
    const spotPerpRadius = isReconJtac ? COMBAT.SPOT_PERP_RADIUS * 1.45 : COMBAT.SPOT_PERP_RADIUS;
    const spotPerpSq = spotPerpRadius * spotPerpRadius;
    for (let i = 0; i < this.botManager.bots.length; i++) {
      const bot = this.botManager.bots[i];
      if (bot.dead || bot.downed || bot.team === this.team) continue;
      const tx = bot.pos.x - _cmdOrigin.x;
      const ty = bot.pos.y + 1.1 - _cmdOrigin.y;
      const tz = bot.pos.z - _cmdOrigin.z;
      const proj = tx * _cmdDir.x + ty * _cmdDir.y + tz * _cmdDir.z;
      if (proj > 1 && proj < bestDist) {
        const perpSq = tx * tx + ty * ty + tz * tz - proj * proj;
        if (perpSq < spotPerpSq) {
          bestDist = proj;
          bestEnemy = bot;
        }
      }
    }

    if (bestEnemy) {
      const paintDur = isReconJtac ? 20.0 : COMBAT.SPOTTED_TIMER;
      bestEnemy.spottedTimer = paintDur;
      bestEnemy.jtacLaserPainted = isReconJtac;
      const distM = Math.round(bestEnemy.pos.distanceTo(this.pos));
      this.activePing = {
        pos: new THREE.Vector3(bestEnemy.pos.x, bestEnemy.pos.y + 2.1, bestEnemy.pos.z),
        timer: isReconJtac ? 20.0 : COMBAT.PING_TIMER_ENEMY,
        isEnemy: true,
        isJtac: isReconJtac,
        label: isReconJtac ? `🎯 JTAC LASER: ${bestEnemy.role}` : `ENEMY ${bestEnemy.role}`
      };
      const spotPts = isReconJtac ? 40 : COMBAT.SPOT_XP;
      if (this.onAwardXp) {
        this.onAwardXp(
          spotPts,
          isReconJtac
            ? `🎯 JTAC LASER TARGET PAINTED FOR 20S (${bestEnemy.name} • ${distM}M)`
            : `SPOTTED ENEMY (${bestEnemy.name})`
        );
      }
      if (this.onCommoCommand) {
        this.onCommoCommand(
          'ping',
          isReconJtac
            ? `JTAC LASER DESIGNATION ON ${bestEnemy.role} (${distM}m • 20S PAINT)!`
            : `HOSTILE ${bestEnemy.role} SPOTTED (${distM}m)!`,
          '🎯'
        );
      }
      sound.playRadioBeep(false);
      return;
    }

    // Recon JTAC can also laser-designate enemy armor & aircraft for 20s!
    if (isReconJtac && this.vehicleManager && Array.isArray(this.vehicleManager.vehicles)) {
      let bestVeh = null;
      let bestVehDist = 550;
      for (let i = 0; i < this.vehicleManager.vehicles.length; i++) {
        const v = this.vehicleManager.vehicles[i];
        if (!v || v.dead || v.team === this.team) continue;
        const vx = v.pos.x - _cmdOrigin.x;
        const vy = v.pos.y + 1.5 - _cmdOrigin.y;
        const vz = v.pos.z - _cmdOrigin.z;
        const proj = vx * _cmdDir.x + vy * _cmdDir.y + vz * _cmdDir.z;
        if (proj > 4 && proj < bestVehDist) {
          const perpSq = vx * vx + vy * vy + vz * vz - proj * proj;
          if (perpSq < 7.5 * 7.5) {
            bestVehDist = proj;
            bestVeh = v;
          }
        }
      }
      if (bestVeh) {
        bestVeh.uavRevealed = true;
        bestVeh.jtacLaserTimer = 20.0;
        const distM = Math.round(bestVeh.pos.distanceTo(this.pos));
        this.activePing = {
          pos: new THREE.Vector3(bestVeh.pos.x, bestVeh.pos.y + 3.2, bestVeh.pos.z),
          timer: 20.0,
          isEnemy: true,
          isJtac: true,
          label: `🎯 JTAC LASER: ${bestVeh.name.split(' (')[0]}`
        };
        if (this.onAwardXp) {
          this.onAwardXp(45, `🎯 JTAC LASER PAINTED ARMOR FOR 20S (${bestVeh.name.split(' (')[0]} • ${distM}M)!`);
        }
        sound.playRadioBeep(false);
        return;
      }
    }

    const voxelHit = this.world.raycastVoxel(_cmdOrigin, _cmdDir, COMBAT.SPOT_DISTANCE);
    const pingPos = voxelHit
      ? voxelHit.point.clone()
      : _cmdOrigin.clone().addScaledVector(_cmdDir, 90);
    this.activePing = {
      pos: pingPos,
      timer: COMBAT.PING_TIMER_SQUAD,
      isEnemy: false,
      label: 'SQUAD PING'
    };
    if (this.onCommoCommand) {
      this.onCommoCommand(
        'ping',
        `CHECK MARKED COORDINATES (${Math.round(pingPos.distanceTo(this.pos))}m)!`,
        '📍'
      );
    }
    sound.playRadioBeep(false);
  },

  // =========================================================================
  // SQUAD LEADER RALLY POINT (Mobile Squad Spawn — BattleBit/Squad inspired)
  // =========================================================================
  placeRallyPoint() {
    if (this.dead || this.downed || this.activeVehicle) return;
    if (
      this.squadDoctrineEnabled !== false &&
      this.commandRank !== 'COMMANDER' &&
      this.commandRank !== 'SQUAD_LEADER'
    ) {
      sound.playEmptyClick?.();
      if (this.onAwardXp) {
        this.onAwardXp(
          0,
          '🔒 SQUAD RALLY POINT [5] REQUIRES [▲ SQUAD LEADER] OR [★ COMMANDER] RANK! (OR TOGGLE DOCTRINE OFF IN ⚙️ SETTINGS)'
        );
      }
      return;
    }
    if (this.rallyCooldown > 0) {
      if (this.onAwardXp) this.onAwardXp(0, `RALLY COOLDOWN: ${Math.ceil(this.rallyCooldown)}s`);
      return;
    }

    // Check no enemies within clear radius
    const clearR = DEPLOYABLES.RALLY_ENEMY_CLEAR_RADIUS;
    const clearRSq = clearR * clearR;
    let enemyNear = false;
    if (this.botManager?.spatialGrid?.count > 0) {
      this.botManager.spatialGrid.forEachInRadius(this.pos.x, this.pos.z, clearR, (b) => {
        if (!b.dead && b.team !== this.team && b.pos.distanceToSquared(this.pos) < clearRSq) {
          enemyNear = true;
          return false;
        }
      });
    } else {
      for (let i = 0; i < this.botManager.bots.length; i++) {
        const b = this.botManager.bots[i];
        if (b.dead || b.team === this.team) continue;
        if (b.pos.distanceToSquared(this.pos) < clearRSq) {
          enemyNear = true;
          break;
        }
      }
    }
    if (enemyNear) {
      if (this.onAwardXp) this.onAwardXp(0, 'CANNOT PLACE RALLY — ENEMY TOO CLOSE');
      return;
    }

    // Remove old rally mesh
    if (this.rallyPoint && this.rallyPoint.mesh) {
      this.scene.remove(this.rallyPoint.mesh);
    }

    // Create rally point beacon (green glowing pole) using shared geometries/materials
    const rallyGroup = new THREE.Group();
    const pole = new THREE.Mesh(_rallyPoleGeo, _rallyPoleMat);
    pole.position.y = 1.0;
    rallyGroup.add(pole);

    const beacon = new THREE.Mesh(_rallyBeaconGeo, _rallyBeaconMat);
    beacon.position.y = 2.15;
    rallyGroup.add(beacon);

    const ring = new THREE.Mesh(_rallyRingGeo, _rallyRingMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    rallyGroup.add(ring);

    const rallyPos = this.pos.clone();
    rallyPos.y = this.world.getGroundHeightAt(rallyPos.x, rallyPos.z);
    rallyGroup.position.copy(rallyPos);
    this.scene.add(rallyGroup);

    this.rallyPoint = {
      pos: rallyPos,
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
    const destroyR = DEPLOYABLES.RALLY_ENEMY_DESTROY_RADIUS;
    const destroyRSq = destroyR * destroyR;
    let destroyedByEnemy = false;
    const rPos = this.rallyPoint.pos;
    if (this.botManager?.spatialGrid?.count > 0) {
      this.botManager.spatialGrid.forEachInRadius(rPos.x, rPos.z, destroyR, (b) => {
        if (!b.dead && b.team !== this.team && b.pos.distanceToSquared(rPos) < destroyRSq) {
          destroyedByEnemy = true;
          return false;
        }
      });
    } else {
      for (let i = 0; i < this.botManager.bots.length; i++) {
        const b = this.botManager.bots[i];
        if (b.dead || b.team === this.team) continue;
        if (b.pos.distanceToSquared(rPos) < destroyRSq) {
          destroyedByEnemy = true;
          break;
        }
      }
    }
    if (destroyedByEnemy) {
      if (this.onAwardXp) this.onAwardXp(0, 'RALLY POINT DESTROYED BY ENEMY');
      this.scene.remove(this.rallyPoint.mesh);
      this.rallyPoint = null;
      this.rallyDeployableFSM?.send(DEPLOYABLE_EVENTS.EXPIRE_OR_DESTROY);
      if (this.rallyCooldown <= 0) {
        this.rallyDeployableFSM?.send(DEPLOYABLE_EVENTS.COOLDOWN_DONE);
      }
      return;
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

    // Fuselage + V-tail + High-aspect Reaper wings + FLIR sensor turret
    const body = new THREE.Mesh(_uavBodyGeo, _uavHullMat);
    group.add(body);
    const wings = new THREE.Mesh(_uavWingsGeo, _uavWingMat);
    wings.position.set(0, 0.15, -0.2);
    group.add(wings);
    const tailL = new THREE.Mesh(_uavTailGeo, _uavWingMat);
    tailL.position.set(-0.95, 0.65, 2.2);
    tailL.rotation.z = -0.52;
    group.add(tailL);
    const tailR = new THREE.Mesh(_uavTailGeo, _uavWingMat);
    tailR.position.set(0.95, 0.65, 2.2);
    tailR.rotation.z = 0.52;
    group.add(tailR);

    const sensorPod = new THREE.Mesh(_uavPodGeo, _uavGlowMat);
    sensorPod.position.set(0, -0.5, -1.7);
    group.add(sensorPod);

    const strobeL = new THREE.Mesh(_uavStrobeGeo, _uavGlowMat);
    strobeL.position.set(-5.7, 0.2, -0.2);
    group.add(strobeL);
    const strobeR = new THREE.Mesh(_uavStrobeGeo, _uavRedBeaconMat);
    strobeR.position.set(5.7, 0.2, -0.2);
    group.add(strobeR);

    return group;
  },

  refreshUAVScanTargets() {
    if (!this.uavRevealedBots) this.uavRevealedBots = [];
    else this.uavRevealedBots.length = 0;
    if (!this.uavRevealedVehicles) this.uavRevealedVehicles = [];
    else this.uavRevealedVehicles.length = 0;

    const bots = this.botManager.bots;
    for (let i = 0; i < bots.length; i++) {
      const bot = bots[i];
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
      const vehs = this.vehicleManager.vehicles;
      for (let i = 0; i < vehs.length; i++) {
        const v = vehs[i];
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
      const revLen = this.uavRevealedBots.length;
      for (let fIdx = 0; fIdx < this.world.flags.length; fIdx++) {
        const f = this.world.flags[fIdx];
        let count = 0;
        const fx = f.pos.x;
        const fz = f.pos.z;
        for (let bIdx = 0; bIdx < revLen; bIdx++) {
          const b = this.uavRevealedBots[bIdx];
          const dx = b.pos.x - fx;
          const dz = b.pos.z - fz;
          if (dx * dx + dz * dz <= 4624) count++;
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

  activateUAV(bypassRankCheck = false) {
    if ((this.world?.era || 'modern') !== 'modern') {
      return false;
    }
    if (!bypassRankCheck && this.squadDoctrineEnabled !== false && this.commandRank !== 'COMMANDER') {
      if (this.commandRank === 'SQUAD_LEADER') {
        sound.playRadioBeep?.(false);
        const sqName = this.squad || 'ALPHA';
        if (this.onCommoCommand) {
          this.onCommoCommand(
            'uav_req',
            `Command, ${sqName} SL requesting MQ-9 UAV Recon Sweep at my grid!`,
            '📻'
          );
        }
        const aiCmd =
          this.botManager?.bots?.find((b) => !b.dead && b.team === this.team && b.isCommander) ||
          this.botManager?.bots?.find((b) => !b.dead && b.team === this.team && b.isSquadLeader);
        if (aiCmd && this.uavCooldown <= 0 && !this.uavActive) {
          this.botManager?.emitBotComms?.(
            aiCmd,
            this,
            `Solid copy ${sqName} SL! Command approving MQ-9 UAV Recon Datalink over your grid now!`,
            'COMMAND',
            true,
            'CMD NET'
          );
          return this.activateUAV(true);
        }
        if (this.onAwardXp) {
          this.onAwardXp(
            0,
            `📻 CMD NET UAV REQUEST SENT BY ${sqName} SL — UAV REARMING (${Math.ceil(this.uavCooldown || 0)}s) • DEPLOY AS ★ COMMANDER FOR DIRECT [U]`
          );
        }
        return false;
      }
      sound.playEmptyClick?.();
      if (this.onAwardXp) {
        this.onAwardXp(
          0,
          '🔒 [U] MQ-9 UAV DATALINK REQUIRES [★ COMMANDER] RANK! (SQUAD LEADERS CAN REQUEST ON CMD NET • OR TOGGLE DOCTRINE OFF IN ⚙️)'
        );
      }
      return false;
    }
    if (this.uavCooldown > 0 && !this.uavActive) {
      if (this.onAwardXp) this.onAwardXp(0, `📡 UAV ON COOLDOWN (${Math.ceil(this.uavCooldown)}s)`);
      return false;
    }
    if (this.uavActive) {
      // Refreshing while active re-centers the radar pulse & extends scan
      this.uavTimer = Math.max(this.uavTimer, 25);
      this._uavScanAccum = 0;
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
    this._uavScanAccum = 0;
    this.uavFSM?.send(COMMANDER_UAV_EVENTS.CALL_UAV);

    this.refreshUAVScanTargets();

    // Spawn 3D MQ-9 Reaper Drone circling overhead + Expanding Ground Radar Sweep Ring
    if (!this.uavDroneMesh) {
      this.uavDroneMesh = this.buildUAVDroneMesh();
    }
    this.uavDroneMesh.position.set(this.pos.x + 45, 76, this.pos.z);
    if (this.uavDroneMesh.parent !== this.scene) {
      this.scene.add(this.uavDroneMesh);
    }

    if (!this.uavSweepRingMesh) {
      this.uavSweepRingMesh = new THREE.Mesh(_uavSweepRingGeo, _uavSweepRingMat);
    }
    this.uavSweepRingMesh.position.set(this.pos.x, this.pos.y + 0.4, this.pos.z);
    if (this.uavSweepRingMesh.parent !== this.scene) {
      this.scene.add(this.uavSweepRingMesh);
    }

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
        const outerRing = this.airstrikeTarget.outerRing;
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

    // UAV continuous full-battlefield scan (throttled to 2 Hz) + 3D drone & radar pulse animation
    if (this.uavActive) {
      this.uavTimer -= dt;
      if (this.uavTimer <= 0) {
        this.uavActive = false;
        this.uavTimer = 0;
        this._uavScanAccum = 0;
        for (let i = 0; i < this.botManager.bots.length; i++) {
          const bot = this.botManager.bots[i];
          if (bot.team !== this.team) {
            bot.uavRevealed = false;
            bot.uavRevealTimer = 0;
          }
        }
        if (this.vehicleManager && this.vehicleManager.vehicles) {
          for (let i = 0; i < this.vehicleManager.vehicles.length; i++) {
            this.vehicleManager.vehicles[i].uavRevealed = false;
          }
        }
        if (this.uavRevealedBots) this.uavRevealedBots.length = 0;
        if (this.uavRevealedVehicles) this.uavRevealedVehicles.length = 0;
        if (this.uavDroneMesh) {
          this.scene.remove(this.uavDroneMesh);
        }
        if (this.uavSweepRingMesh) {
          this.scene.remove(this.uavSweepRingMesh);
        }
        this.uavFSM?.send(COMMANDER_UAV_EVENTS.SCAN_EXPIRED);
        if (this.uavCooldown <= 0) {
          this.uavFSM?.send(COMMANDER_UAV_EVENTS.COOLDOWN_DONE);
        }
      } else {
        this._uavScanAccum = (this._uavScanAccum || 0) + dt;
        if (this._uavScanAccum >= 0.5) {
          this._uavScanAccum = 0;
          this.refreshUAVScanTargets();
        }
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
        const bPos = this.insertionBeacon.pos;
        let beaconDestroyed = false;
        if (this.botManager?.spatialGrid?.count > 0) {
          this.botManager.spatialGrid.forEachInRadius(bPos.x, bPos.z, 6, (bot) => {
            if (!bot.dead && bot.team !== this.team && bot.pos.distanceToSquared(bPos) < 36) {
              beaconDestroyed = true;
              return false;
            }
          });
        } else {
          for (let i = 0; i < this.botManager.bots.length; i++) {
            const bot = this.botManager.bots[i];
            if (bot.dead || bot.team === this.team) continue;
            if (bot.pos.distanceToSquared(bPos) < 36) {
              beaconDestroyed = true;
              break;
            }
          }
        }
        if (beaconDestroyed) {
          if (this.onAwardXp) this.onAwardXp(0, 'INSERTION BEACON DESTROYED BY ENEMY');
          if (this.insertionBeacon.mesh) this.scene.remove(this.insertionBeacon.mesh);
          this.insertionBeacon = null;
          this.beaconDeployableFSM?.send(DEPLOYABLE_EVENTS.EXPIRE_OR_DESTROY);
          if (this.beaconCooldown <= 0) {
            this.beaconDeployableFSM?.send(DEPLOYABLE_EVENTS.COOLDOWN_DONE);
          }
        } else if (this.insertionBeacon && this.insertionBeacon.lightMesh) {
          this.insertionBeacon.lightMesh.material.opacity =
            0.4 + Math.sin(performance.now() * 0.004) * 0.3;
        }
      }
    }
    syncSquadDeployablesFSM(this);

    // Commo rose cooldown
    if (this.commoRoseCooldown > 0) {
      this.commoRoseCooldown = Math.max(0, this.commoRoseCooldown - dt);
    }
  },

  // ─── INFANTRY JTAC CLOSE AIR SUPPORT (A-10 BRRRT), BOMBING & COMMANDER BARRAGE [J] ─────────
  cycleAirstrikePattern(forcePattern = null) {
    if ((this.world?.era || 'modern') !== 'modern') {
      return null;
    }
    const patterns = ['A10_CAS', 'CARPET', 'BUNKER_BUSTER', 'ARTILLERY'];
    const curPat = patterns.includes(this.airstrikePattern) ? this.airstrikePattern : 'A10_CAS';
    if (forcePattern && patterns.includes(forcePattern)) {
      this.airstrikePattern = forcePattern;
    } else {
      const idx = (patterns.indexOf(curPat) + 1) % patterns.length;
      this.airstrikePattern = patterns[idx];
    }
    const labels = {
      A10_CAS: '✈️ A-10C / SU-25 CLOSE AIR SUPPORT (30MM GAU-8 BRRRT STRAFE + HYDRA ROCKETS)',
      CARPET: '💣 F-15E CARPET BOMBING RUN (9x 500LB JDAM ROLLING LINE)',
      BUNKER_BUSTER: '🎯 2,000LB GBU-28 BUNKER BUSTER (HEAVY ANTI-ARMOR & BUILDING DEMOLITION)',
      ARTILLERY: '🌧️ 155MM HE ARTILLERY BARRAGE (12-SHELL WIDE SATURATION)'
    };
    if (this.onAwardXp) {
      this.onAwardXp(0, `📻 CAS / STRIKE ORDNANCE SELECTED: ${labels[this.airstrikePattern]}`);
    }
    return this.airstrikePattern;
  },

  callCommanderAirstrike(customWorldPos = null, customPattern = null) {
    return this.callAirstrike(customWorldPos, customPattern);
  },

  resolveAirstrikeTargetPos(customWorldPos = null) {
    if (customWorldPos && typeof customWorldPos.x === 'number' && typeof customWorldPos.z === 'number') {
      const tx = THREE.MathUtils.clamp(customWorldPos.x, -2450, 2450);
      const tz = THREE.MathUtils.clamp(customWorldPos.z, -1650, 1650);
      const ty = this.world.getGroundHeightAt(tx, tz);
      return new THREE.Vector3(tx, ty, tz);
    }

    this.syncCameraTransform();
    this.camera.getWorldPosition(_cmdOrigin);
    this.camera.getWorldQuaternion(_cmdQuat);
    _cmdDir.set(0, 0, -1).applyQuaternion(_cmdQuat);

    // 1. Check if aiming directly at an enemy vehicle up to 650m
    if (this.vehicleManager && this.vehicleManager.vehicles) {
      let bestVeh = null;
      let bestVehDist = 650;
      for (let i = 0; i < this.vehicleManager.vehicles.length; i++) {
        const v = this.vehicleManager.vehicles[i];
        if (v.dead || v.team === this.team) continue;
        const vx = v.pos.x - _cmdOrigin.x;
        const vy = v.pos.y + 1.4 - _cmdOrigin.y;
        const vz = v.pos.z - _cmdOrigin.z;
        const proj = vx * _cmdDir.x + vy * _cmdDir.y + vz * _cmdDir.z;
        if (proj > 4 && proj < bestVehDist) {
          const perpSq = vx * vx + vy * vy + vz * vz - proj * proj;
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

    // 2. Raycast against any 3D voxel building, wall, roof, bridge, or terrain up to 1,250m!
    const voxelHit = this.world.raycastVoxel(_cmdOrigin, _cmdDir, 1250);
    if (voxelHit && voxelHit.point) {
      const tx = THREE.MathUtils.clamp(voxelHit.point.x, -2450, 2450);
      const tz = THREE.MathUtils.clamp(voxelHit.point.z, -1650, 1650);
      const ty = this.world.getGroundHeightAt(tx, tz);
      return new THREE.Vector3(tx, ty, tz);
    }

    // 3. If aiming downward at open ground beyond voxel raycast
    if (_cmdDir.y < -0.03) {
      const groundBaseY = this.pos.y;
      const t = THREE.MathUtils.clamp((groundBaseY - _cmdOrigin.y) / _cmdDir.y, 12, 1150);
      const tx = THREE.MathUtils.clamp(_cmdOrigin.x + _cmdDir.x * t, -2450, 2450);
      const tz = THREE.MathUtils.clamp(_cmdOrigin.z + _cmdDir.z * t, -1650, 1650);
      const ty = this.world.getGroundHeightAt(tx, tz);
      return new THREE.Vector3(tx, ty, tz);
    }

    // 4. If aiming horizontally or upward into the sky: check if looking toward an Objective A-E,
    //    or project 95m forward along the horizontal look direction (never fails!)
    _cmdScratch.set(_cmdDir.x, 0, _cmdDir.z);
    if (_cmdScratch.lengthSq() < 0.001) {
      _cmdScratch.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    }
    _cmdScratch.normalize();

    if (this.world && this.world.flags) {
      let bestFlag = null;
      let bestDot = 0.94; // within ~19 degrees of crosshair azimuth
      for (let i = 0; i < this.world.flags.length; i++) {
        const f = this.world.flags[i];
        const fx = f.pos.x - this.pos.x;
        const fz = f.pos.z - this.pos.z;
        const distSq = fx * fx + fz * fz;
        if (distSq > 225 && distSq < 722500) {
          const invDist = 1 / Math.sqrt(distSq);
          const d = (fx * _cmdScratch.x + fz * _cmdScratch.z) * invDist;
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

    const tx = THREE.MathUtils.clamp(this.pos.x + _cmdScratch.x * 85, -2450, 2450);
    const tz = THREE.MathUtils.clamp(this.pos.z + _cmdScratch.z * 85, -1650, 1650);
    const ty = this.world.getGroundHeightAt(tx, tz);
    return new THREE.Vector3(tx, ty, tz);
  },

  buildStrikeJetMesh() {
    const group = new THREE.Group();

    const body = new THREE.Mesh(_jetBodyGeo, _jetFuselageMat);
    group.add(body);
    const nose = new THREE.Mesh(_jetNoseGeo, _jetFuselageMat);
    nose.position.set(0, -0.1, -5.8);
    group.add(nose);
    const wings = new THREE.Mesh(_jetWingsGeo, _jetWingMat);
    wings.position.set(0, 0, 0.6);
    group.add(wings);
    const tailL = new THREE.Mesh(_jetTailGeo, _jetWingMat);
    tailL.position.set(-0.7, 1.1, 3.6);
    group.add(tailL);
    const tailR = new THREE.Mesh(_jetTailGeo, _jetWingMat);
    tailR.position.set(0.7, 1.1, 3.6);
    group.add(tailR);
    const burnerL = new THREE.Mesh(_jetBurnerGeo, _jetBurnerMat);
    burnerL.position.set(-0.42, 0, 5.1);
    group.add(burnerL);
    const burnerR = new THREE.Mesh(_jetBurnerGeo, _jetBurnerMat);
    burnerR.position.set(0.42, 0, 5.1);
    group.add(burnerR);

    return group;
  },

  callAirstrike(customWorldPos = null, customPattern = null, bypassRankCheck = false) {
    if ((this.world?.era || 'modern') !== 'modern') {
      return false;
    }
    // Infantry Squads (ALPHA, CHARLIE, DELTA, ECHO) & Squad Leaders / Recon JTACs can request Close Air Support (A-10 Strafe / Bombing) directly!
    const isInfantryGroundCaller =
      !this.activeVehicle &&
      this.role !== 'pilot' &&
      this.role !== 'armor';
    if (!bypassRankCheck && this.squadDoctrineEnabled !== false && this.commandRank !== 'COMMANDER') {
      if (!isInfantryGroundCaller) {
        sound.playEmptyClick?.();
        if (this.onAwardXp) {
          this.onAwardXp(
            0,
            '🔒 [J] FIRE SUPPORT REQUIRES [★ COMMANDER] OR DISMOUNTED INFANTRY SQUAD JTAC RADIO!'
          );
        }
        return false;
      }
      // Dismounted Infantry Squad members/leaders default to Close Air Support (A-10 Strafe / Bombing); 155mm Artillery stays Commander/SL-level
      if ((customPattern || this.airstrikePattern) === 'ARTILLERY' && this.commandRank === 'MEMBER') {
        this.airstrikePattern = 'A10_CAS';
      }
    }
    if (customPattern) {
      this.airstrikePattern = customPattern;
    } else if (!this.airstrikePattern) {
      this.airstrikePattern = isInfantryGroundCaller && this.commandRank !== 'COMMANDER' ? 'A10_CAS' : 'A10_CAS';
    }
    if (this.airstrikeCooldown > 0 && !customWorldPos) {
      if (this.onAwardXp) {
        this.onAwardXp(0, `📻 FALCON AIR WING REARMING (${Math.ceil(this.airstrikeCooldown)}s)`);
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
    const pattern = this.airstrikePattern || 'A10_CAS';

    // Paint & highlight all enemy infantry and enemy armor within 46m of the marked CAS zone (Video/3D Target Designation!)
    let paintedHostiles = 0;
    let paintedArmor = 0;
    const paintRadiusSq = 46 * 46;
    if (this.botManager && Array.isArray(this.botManager.bots)) {
      for (let i = 0; i < this.botManager.bots.length; i++) {
        const b = this.botManager.bots[i];
        if (!b || b.dead || b.team === this.team) continue;
        const dx = b.pos.x - targetPos.x;
        const dz = b.pos.z - targetPos.z;
        if (dx * dx + dz * dz <= paintRadiusSq) {
          b.spottedTimer = Math.max(b.spottedTimer || 0, 14.0);
          b.uavRevealed = true;
          b.uavRevealTimer = Math.max(b.uavRevealTimer || 0, 12.0);
          paintedHostiles++;
        }
      }
    }
    if (this.vehicleManager && Array.isArray(this.vehicleManager.vehicles)) {
      for (let i = 0; i < this.vehicleManager.vehicles.length; i++) {
        const v = this.vehicleManager.vehicles[i];
        if (!v || v.dead || v.team === this.team) continue;
        const dx = v.pos.x - targetPos.x;
        const dz = v.pos.z - targetPos.z;
        if (dx * dx + dz * dz <= paintRadiusSq * 1.35) {
          v.uavRevealed = true;
          paintedArmor++;
        }
      }
    }

    // Broadcast active Infantry JTAC CAS Smoke Marker to friendly human & AI Falcon Pilots!
    const sqName = this.squad || 'ALPHA';
    if (this.world) {
      this.world.activeCasRequest = {
        pos: targetPos.clone(),
        team: this.team,
        squad: sqName,
        callerName: this.name || 'INFANTRY JTAC',
        pattern,
        hostiles: paintedHostiles,
        armor: paintedArmor,
        timer: 14.0
      };
    }
    this.activePing = {
      pos: new THREE.Vector3(targetPos.x, targetPos.y + 2.4, targetPos.z),
      timer: 10.0,
      isEnemy: true,
      label:
        paintedHostiles + paintedArmor > 0
          ? `🎯 CAS PAINTED (${paintedHostiles} INF${paintedArmor > 0 ? ` + ${paintedArmor} ARMOR` : ''})`
          : `🎯 ${sqName} CAS TARGET SMOKE`
    };

    // Compute strike run vector (along player's look azimuth or from HQ toward target)
    const strikeDir = new THREE.Vector3(targetPos.x - this.pos.x, 0, targetPos.z - this.pos.z);
    if (strikeDir.lengthSq() < 4) {
      strikeDir.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    }
    strikeDir.normalize();

    // Create high-visibility 3D target zone rings + red smoke flare beacon (shared geometries & materials)
    const markerGroup = new THREE.Group();
    const outerRadius = pattern === 'ARTILLERY' ? 22 : pattern === 'BUNKER_BUSTER' ? 16 : 18;
    const ringGeo = getStrikeOuterRingGeo(outerRadius);
    const ring = new THREE.Mesh(ringGeo, _strikeRingMat);
    ring.name = 'strikeOuterRing';
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(targetPos.x, targetPos.y + 0.45, targetPos.z);
    markerGroup.add(ring);

    const innerRing = new THREE.Mesh(_strikeInnerRingGeo, _strikeRingMat);
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.set(targetPos.x, targetPos.y + 0.48, targetPos.z);
    markerGroup.add(innerRing);

    const beam = new THREE.Mesh(_strikeBeamGeo, _strikeBeamMat);
    beam.position.set(targetPos.x, targetPos.y + 27.5, targetPos.z);
    markerGroup.add(beam);

    this.scene.add(markerGroup);
    _cmdScratch.set(targetPos.x, targetPos.y + 1.2, targetPos.z);
    this.world.spawnDebris(_cmdScratch, _strikeFlareColor, 10);

    const leadTime = pattern === 'A10_CAS' ? 2.1 : 2.4;
    this.airstrikeTarget = {
      pos: targetPos,
      timer: leadTime,
      maxTimer: leadTime,
      pattern,
      strikeDir,
      paintedHostiles,
      paintedArmor,
      markers: markerGroup,
      outerRing: ring
    };
    this.airstrikeCooldown =
      this.commandRank === 'COMMANDER'
        ? 16
        : this.role === 'recon' || this.commandRank === 'SQUAD_LEADER'
        ? 18
        : 22;
    if (this.airstrikeFSM) {
      if (!this.airstrikeFSM.send(COMMANDER_AIRSTRIKE_EVENTS.DESIGNATE_TARGET)) {
        this.airstrikeFSM.send(COMMANDER_AIRSTRIKE_EVENTS.FORCE_REDESIGNATE);
      }
    }

    // Spawn 3D A-10C Warthog (low-altitude screaming gun run) or Strike Fighter Jet across the sky!
    if (pattern !== 'ARTILLERY') {
      const isLowCas = pattern === 'A10_CAS';
      const flyAlt = isLowCas ? 34 : 62;
      const flySpd = isLowCas ? 98 : 115;
      const jetMesh = this.buildStrikeJetMesh();
      jetMesh.position.set(
        targetPos.x - strikeDir.x * 195,
        targetPos.y + flyAlt,
        targetPos.z - strikeDir.z * 195
      );
      _cmdScratch.set(
        targetPos.x + strikeDir.x * 195,
        targetPos.y + (isLowCas ? flyAlt - 6 : flyAlt),
        targetPos.z + strikeDir.z * 195
      );
      jetMesh.lookAt(_cmdScratch);
      this.scene.add(jetMesh);
      this.activeAirstrikeJets.push({
        mesh: jetMesh,
        vel: strikeDir.clone().multiplyScalar(flySpd),
        life: 4.4
      });
    }

    const distM = Math.round(this.pos.distanceTo(targetPos));
    const patLabel =
      pattern === 'A10_CAS'
        ? this.team === 'RU'
          ? 'SU-25 30MM CAS GUN RUN'
          : 'A-10C 30MM BRRRT CAS RUN'
        : pattern === 'BUNKER_BUSTER'
        ? '2,000LB GBU BUNKER-BUSTER'
        : pattern === 'ARTILLERY'
        ? '155MM ARTILLERY BARRAGE'
        : 'F-15E CARPET BOMBING RUN';

    // Authentic Ground-to-Air JTAC Radio Callout + Falcon Air Wing Readback Audio!
    sound.playRadioBeep(false);
    const contactSummary =
      paintedHostiles + paintedArmor > 0
        ? `${paintedHostiles} hostiles${paintedArmor > 0 ? ` & ${paintedArmor} armor` : ''} painted in red smoke`
        : `target marked with red smoke (${distM}m)`;
    if (this.onCommoCommand) {
      this.onCommoCommand(
        'cas_req',
        `FALCON 1-1, ${sqName} GROUND: REQUESTING ${patLabel} — ${contactSummary.toUpperCase()}!`,
        '📻'
      );
    }
    if (this.botManager && typeof this.botManager.emitBotComms === 'function') {
      const pilotSpeaker =
        this.botManager.bots.find((b) => !b.dead && b.team === this.team && b.squad === 'FALCON') ||
        this.botManager.bots.find((b) => !b.dead && b.team === this.team && b.isSquadLeader);
      if (pilotSpeaker) {
        setTimeout(() => {
          sound.playRadioBeep?.(false);
          this.botManager?.emitBotComms?.(
            pilotSpeaker,
            this,
            `Copy ${sqName}! Falcon 1-1 tally red smoke — TGP video locked on ${contactSummary}. Rolling in hot, guns guns guns!`,
            'COMMAND',
            true,
            'AIR NET'
          );
        }, 550);
      }
    }

    events.emit('airstrike:called', {
      pos: targetPos.clone(),
      pattern,
      label: patLabel,
      leadTime,
      distance: distM,
      paintedHostiles,
      paintedArmor
    });
    if (this.onAwardXp) {
      this.onAwardXp(
        25,
        `🎯 ${patLabel} INBOUND (${distM}m) • TGP VIDEO PAINTED ${paintedHostiles} INFANTRY & ${paintedArmor} ARMOR — IMPACT IN ${leadTime}s!`
      );
    }
    if (this.onKillStreakAnnouncement) {
      this.onKillStreakAnnouncement(
        `✈️ ${patLabel} INBOUND (${distM}m • ${paintedHostiles} INF / ${paintedArmor} ARMOR PAINTED)!`
      );
    }
    return true;
  },

  spawnPhysicalAirstrikeBomb(bItem) {
    const isHeavyGbu = Boolean(bItem.isHeavyGbu);
    const bombGroup = new THREE.Group();
    const bodyMesh = new THREE.Mesh(
      isHeavyGbu ? _heavyGbuBodyGeo : _stdBombBodyGeo,
      isHeavyGbu ? _heavyGbuBodyMat : _stdBombBodyMat
    );
    bombGroup.add(bodyMesh);

    const glowMesh = new THREE.Mesh(
      isHeavyGbu ? _heavyGbuGlowGeo : _stdBombGlowGeo,
      _bombGlowMat
    );
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
    const dir = target.strikeDir || _cmdScratch.set(1, 0, 0);
    const rx = -dir.z;
    const rz = dir.x;

    if (pattern === 'A10_CAS') {
      // A-10C / Su-25 Close Air Support Run: Roaring 30mm GAU-8 "BRRRRRRT!" 14-round AP-HEI strafing line + 4 Hydra-70 Rockets!
      const distForAudio = Math.min(180, this.pos.distanceTo(target.pos) * 0.45);
      for (let b = 0; b < 8; b++) {
        setTimeout(() => {
          sound.playGunshot?.('lmg', distForAudio);
        }, b * 48);
      }
      sound.playRocketLaunch?.(distForAudio);
      const strafeRounds = 14;
      for (let i = 0; i < strafeRounds; i++) {
        const along = (i - (strafeRounds - 1) * 0.5) * 3.4; // Tight 44m 30mm GAU-8 beaten zone
        const lateral = (Math.random() - 0.5) * 3.6;
        const ix = target.pos.x + dir.x * along + rx * lateral;
        const iz = target.pos.z + dir.z * along + rz * lateral;
        const iy = this.world.getGroundHeightAt(ix, iz);
        this.pendingAirstrikeBombs.push({
          delay: i * 0.045,
          spawnPos: new THREE.Vector3(ix - dir.x * 22, iy + 28, iz - dir.z * 22),
          vel: new THREE.Vector3(dir.x * 46, -68, dir.z * 46),
          blastRadius: i % 4 === 0 ? 11.5 : 7.8,
          blastDamage: i % 4 === 0 ? 480 : 290,
          weaponLabel: this.team === 'RU' ? 'SU-25 30MM GSh-30 + S-8 CAS' : 'A-10C 30MM GAU-8 BRRRT CAS',
          isHeavyGbu: false
        });
      }
    } else if (pattern === 'BUNKER_BUSTER') {
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
      for (let idx = 0; idx < clusterOffsets.length; idx++) {
        const [ox, oz] = clusterOffsets[idx];
        const ix = target.pos.x + dir.x * ox + rx * oz;
        const iz = target.pos.z + dir.z * ox + rz * oz;
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
      }
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
        const ix = target.pos.x + dir.x * along + rx * lateral;
        const iz = target.pos.z + dir.z * along + rz * lateral;
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
      if (this.insertionBeacon.mesh) {
        this.scene.remove(this.insertionBeacon.mesh);
      }
      this.insertionBeacon = null;
    }

    // Place beacon at current position
    const beaconPos = this.pos.clone();
    beaconPos.y = this.world.getGroundHeightAt(beaconPos.x, beaconPos.z);

    // Create visual beacon mesh using shared geometries/materials
    const group = new THREE.Group();
    const base = new THREE.Mesh(_beaconBaseGeo, _beaconBaseMat);
    base.position.y = 0.2;
    group.add(base);

    const ant = new THREE.Mesh(_beaconAntGeo, _beaconAntMat);
    ant.position.y = 0.8;
    group.add(ant);

    const light = new THREE.Mesh(_beaconLightGeo, _beaconLightMat);
    light.name = 'beaconLight';
    light.position.y = 1.2;
    group.add(light);

    group.position.copy(beaconPos);
    this.scene.add(group);

    this.insertionBeacon = {
      pos: beaconPos,
      mesh: group,
      lightMesh: light,
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

    const cmd = _COMMO_COMMANDS[commandId];
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
