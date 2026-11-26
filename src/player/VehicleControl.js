import * as THREE from '../../vendor/three.module.js';
import { sound } from '../audio.js?v=136';
import { PLAYER, PROJECTILES, DISTANCES, VEHICLE_STATS } from '../config.js?v=136';
import { animateBowOrCrossbowMesh } from '../models/weapon-model.js?v=136';
import { getRideShortcutLabel } from '../utils/KeyboardShortcuts.js?v=136';
import { events } from '../events.js?v=136';
import {
  AIRCRAFT_FLIGHT_EVENTS,
  PLAYER_PARACHUTE_EVENTS,
  TARGET_LOCK_EVENTS,
  syncAircraftFlightFSM,
  syncGroundVehicleFSM,
  syncVehicleSubsystemsFSM,
  updateTargetLockScanner
} from '../core/StateMachines.js?v=136';

function markShared(asset) {
  if (asset) {
    if (!asset.userData) asset.userData = {};
    asset.userData.shared = true;
  }
  return asset;
}

// ─── Shared Cached Vehicle / Aircraft / Flare / Ordnance Geometries & Materials (userData.shared = true) ───
const _chuteCanopyGeo = markShared(new THREE.BoxGeometry(3.8, 0.45, 2.4));
const _chuteCanopyMat = markShared(
  new THREE.MeshStandardMaterial({ color: 0x556b2f, roughness: 0.8, side: THREE.DoubleSide })
);
const _chuteCordGeo = markShared(new THREE.BoxGeometry(0.05, 3.2, 0.05));
const _chuteCordMat = markShared(new THREE.MeshBasicMaterial({ color: 0xbdc3c7 }));

const _ccipRingGeo = markShared(new THREE.RingGeometry(4.5, 6.2, 28));
_ccipRingGeo.rotateX(-Math.PI / 2);
const _ccipRingMat = markShared(
  new THREE.MeshBasicMaterial({
    color: 0xff9f1a,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.78
  })
);

const _trebBoulderGeo = markShared(new THREE.DodecahedronGeometry(0.68, 1));
const _trebBoulderMat = markShared(new THREE.MeshBasicMaterial({ color: 0xff6b00 }));
const _mortarShellGeo = markShared(new THREE.BoxGeometry(0.26, 0.26, 0.82));
const _mortarShellMat = markShared(new THREE.MeshBasicMaterial({ color: 0xff9f1a }));
const _mortarSalvoMat = markShared(new THREE.MeshBasicMaterial({ color: 0xff5252 }));
const _aaShellGeo = markShared(new THREE.BoxGeometry(0.18, 0.18, 0.65));
const _aaShellMat = markShared(new THREE.MeshBasicMaterial({ color: 0xff5252 }));
const _tankShellGeo = markShared(new THREE.BoxGeometry(0.11, 0.11, 2.35));
const _tankShellMat = markShared(new THREE.MeshBasicMaterial({ color: 0xfff3b0, toneMapped: false }));
const _autocannonShellGeo = markShared(new THREE.BoxGeometry(0.11, 0.11, 0.95));
const _autocannonShellMat = markShared(new THREE.MeshBasicMaterial({ color: 0xffeaa7, toneMapped: false }));
const _atgmMissileGeo = markShared(new THREE.BoxGeometry(0.24, 0.24, 1.45));
const _atgmMissileMat = markShared(new THREE.MeshBasicMaterial({ color: 0xff7f11, toneMapped: false }));
const _vehSamGeo = markShared(new THREE.BoxGeometry(0.24, 0.24, 1.45));
const _vehSamMat = markShared(new THREE.MeshBasicMaterial({ color: 0x00d2d3 }));

const _flareCoreGeo = markShared(new THREE.BoxGeometry(0.45, 0.45, 0.45));
const _flareHaloGeo = markShared(new THREE.BoxGeometry(0.95, 0.95, 0.95));
const _flareCoreMatB2 = markShared(new THREE.MeshBasicMaterial({ color: 0x00ffff }));
const _flareCoreMatWright = markShared(new THREE.MeshBasicMaterial({ color: 0xffeaa7 }));
const _flareCoreMatStd = markShared(new THREE.MeshBasicMaterial({ color: 0xffffff }));

const _b2CarpetBombGeo = markShared(new THREE.BoxGeometry(0.44, 0.44, 1.75));
const _b2CarpetBombMat = markShared(
  new THREE.MeshStandardMaterial({ color: 0x2f3640, roughness: 0.45, metalness: 0.4 })
);
const _bofors40mmGeo = markShared(new THREE.BoxGeometry(0.32, 0.32, 1.1));
const _bofors40mmMat = markShared(
  new THREE.MeshBasicMaterial({ color: 0xfff7d6, toneMapped: false })
);
const _howitzer105mmGeo = markShared(new THREE.BoxGeometry(0.48, 0.48, 1.6));
const _howitzer105mmMat = markShared(
  new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
);
const _jdam500Geo = markShared(new THREE.BoxGeometry(0.42, 0.42, 1.65));
const _jdam500Mat = markShared(new THREE.MeshStandardMaterial({ color: 0x3b4d3b, roughness: 0.6 }));
const _wrightDynGeo = markShared(new THREE.BoxGeometry(0.46, 0.36, 0.56));
const _wrightDynMat = markShared(new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.6 }));
const _gbu57MopGeo = markShared(new THREE.BoxGeometry(0.68, 0.68, 2.95));
const _gbu57MopMat = markShared(
  new THREE.MeshStandardMaterial({ color: 0x1e272e, roughness: 0.4, metalness: 0.55 })
);
const _airRocketGeo = markShared(new THREE.BoxGeometry(0.28, 0.28, 1.35));
const _airRocketMat = markShared(new THREE.MeshBasicMaterial({ color: 0xff9f1a }));
const _gbu28Geo = markShared(new THREE.BoxGeometry(0.58, 0.58, 2.4));
const _gbu28Mat = markShared(new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.5 }));
const _a2aMissileGeo = markShared(new THREE.BoxGeometry(0.26, 0.26, 1.75));
const _a2aMissileMat = markShared(new THREE.MeshBasicMaterial({ color: 0x00d2d3 }));

const _colSmokeWhite = new THREE.Color(0xdfe6e9);
const _colCyan = new THREE.Color(0x00d2d3);
const _colTrebOrange = new THREE.Color(0xff7f11);
const _colTankFlash = new THREE.Color(0xffeaa7);
const _colHowitzerFlash = new THREE.Color(0xffffff);
const _colFlareGold = new THREE.Color(0xffd32a);
const _colFlareBlue = new THREE.Color(0x74b9ff);
const _colFlarePale = new THREE.Color(0xffeaa7);
const _colSmokeRed = new THREE.Color(0xff5252);
const _colSmokeDark = new THREE.Color(0x2f3640);

const _tmpGrid = { gx: 0, gy: 0, gz: 0 };
const _ccipSimVel = new THREE.Vector3();
const _bombInitVelScratch = new THREE.Vector3();
const _bombLookAtScratch = new THREE.Vector3();
const _vehScratchA = new THREE.Vector3();
const _vehScratchB = new THREE.Vector3();
const _airQuatYaw = new THREE.Quaternion();
const _airQuatPitch = new THREE.Quaternion();
const _airQuatRoll = new THREE.Quaternion();
const _airQuatCombined = new THREE.Quaternion();
const _camQuatCombined = new THREE.Quaternion();
const _axisY = new THREE.Vector3(0, 1, 0);
const _axisX = new THREE.Vector3(1, 0, 0);
const _axisZ = new THREE.Vector3(0, 0, 1);

export const VehicleControlMethods = {
  /**
   * Consumes finite vehicle ordnance from `v.ordnancePools[slotKey]`.
   * Gracefully returns `true` when `v.ordnancePools` is null/undefined (e.g. bikes, mounts, omega, or test stubs).
   */
  consumeVehicleOrdnance(v, slotKey = 'slot0', cost = 1, weaponLabel = 'ORDNANCE') {
    if (!v || !v.ordnancePools || typeof v.ordnancePools[slotKey] !== 'number') {
      return true;
    }
    if (v.ordnancePools[slotKey] < cost) {
      sound.playEmptyClick?.();
      v.fireCooldown = Math.max(v.fireCooldown || 0, 0.32);
      v.coaxCooldown = Math.max(v.coaxCooldown || 0, 0.32);
      const nowMs = performance.now();
      if (nowMs - (v._lastEmptyOrdnanceHintMs || 0) > 2200 && this.onAwardXp) {
        v._lastEmptyOrdnanceHintMs = nowMs;
        const rearmHint = v.isAircraft
          ? 'FLY LOW (<45M) OVER FRIENDLY HQ RUNWAY TO REARM!'
          : 'DRIVE TO HQ MOTOR POOL OR FRIENDLY FOB SUPPLY STATION TO REARM!';
        this.onAwardXp(0, `⚠️ ${weaponLabel} WINCHESTER (0 LEFT) — ${rearmHint}`);
      }
      return false;
    }
    v.ordnancePools[slotKey] = Math.max(0, v.ordnancePools[slotKey] - cost);
    return true;
  },

  /**
   * `[F1–F4]` Multi-Crew Seat Switching inside Tanks, IFVs/APCs, AC-130, Humvees & ATVs/Bikes:
   * - Solo players in `[F1]` retain 100% driving + weapons control!
   * - Switching to `[F2]` (`GUNNER` / `TV_GUNNER`) engages Orbit Autopilot on AC-130 or Stabilized Turret Optic on Armor.
   * - Co-op Human MP Peers & AI Squadmates can simultaneously occupy `[F1]` Driver + `[F2]` Gunner + `[F3–F4]` Passengers!
   */
  switchVehicleSeat(seatIndex = 0) {
    const v = this.activeVehicle;
    if (!v || v.dead) return false;
    const seatNames =
      Array.isArray(v.seatNames) && v.seatNames.length > 0
        ? v.seatNames
        : v.isAircraft
        ? v.aircraftRole === 'gunship'
          ? ['PILOT', 'TV_GUNNER', 'HOWITZER_FCO', 'LOADMASTER']
          : ['PILOT']
        : v.type === 'bike' || v.type === 'atv' || v.type === 'warhorse'
        ? ['DRIVER', 'PILLION']
        : v.type === 'tank' || v.type === 'aa'
        ? ['DRIVER', 'GUNNER', 'COMMANDER']
        : ['DRIVER', 'GUNNER', 'PASSENGER_1', 'PASSENGER_2'];
    v.seatNames = seatNames;
    if (!Array.isArray(v.crewSeats) || v.crewSeats.length !== seatNames.length) {
      v.crewSeats = new Array(seatNames.length).fill(null);
    }
    if (seatIndex < 0 || seatIndex >= seatNames.length) {
      sound.playEmptyClick?.();
      if (this.onAwardXp) {
        this.onAwardXp(
          0,
          `⚠️ ${v.name.split(' (')[0]} HAS ${seatNames.length} SEAT${seatNames.length === 1 ? '' : 'S'} ([F1${
            seatNames.length > 1 ? `–F${seatNames.length}` : ''
          }])!`
        );
      }
      return false;
    }

    if (seatIndex === 0 && v.remoteDriverId) {
      sound.playEmptyClick?.();
      if (this.onAwardXp) {
        this.onAwardXp(0, '🔒 SEAT [F1] DRIVER/PILOT IS OCCUPIED BY ALLY TEAMMATE!');
      }
      return false;
    }
    if (seatIndex === 1 && v.remoteGunnerId) {
      sound.playEmptyClick?.();
      if (this.onAwardXp) {
        this.onAwardXp(0, '🔒 SEAT [F2] GUNNER IS OCCUPIED BY ALLY TEAMMATE!');
      }
      return false;
    }

    const prevSeat = this.vehicleSeatIndex || 0;
    if (v.crewSeats[prevSeat] === this) {
      v.crewSeats[prevSeat] = null;
    }
    this.vehicleSeatIndex = seatIndex;
    v.crewSeats[seatIndex] = this;
    if (seatIndex === 0 && !v.remoteDriverId) {
      v.driver = this;
      // Taking Seat [F1] Pilot/Driver cancels AI Chauffeur Ride control and hands 100% manual stick/wheel to the player!
      if (v.rideTask && v.rideTask.active) {
        v.rideTask.active = false;
        if (this.activeRideVehicle === v) this.activeRideVehicle = null;
      }
    }

    const seatRole = seatNames[seatIndex];
    if (v.isAircraft && v.isHelicopter) {
      const gH = this.world ? this.world.getGroundHeightAt(v.pos.x, v.pos.z) : 0;
      if (seatIndex >= 1 && !v.remoteDriverId && v.pos.y - gH > 3.5) {
        // Solo Helicopter Gunner / Cabin Sniper Assist: automatically engage Auto-Hover Hold when switching out of [F1] Pilot!
        v.heliHoverHold = true;
        v.heliHoverAlt = v.pos.y;
      }
      if (v.aircraftRole === 'heli_attack' && seatIndex === 1) {
        this.vehicleCameraMode = 'OPTIC_NOSE';
        this.thirdPersonVehicle = false;
      } else if (seatIndex >= 1) {
        this.vehicleCameraMode = 'COCKPIT_1P';
        this.thirdPersonVehicle = false;
      }
    } else if (v.isAircraft && v.aircraftRole === 'gunship') {
      const gH = this.world ? this.world.getGroundHeightAt(v.pos.x, v.pos.z) : 0;
      if ((seatIndex === 1 || seatIndex === 2) && v.pos.y - gH > 18.0) {
        v.gunshipManualFlight = false;
        this.vehicleCameraMode = v.ac130AllowBellyCam ? 'OPTIC_NOSE' : 'COCKPIT_1P';
        this.thirdPersonVehicle = false;
        if (seatIndex === 2) {
          v.activeWeaponSlot = 2; // Howitzer Fire-Control Officer station!
        }
      } else if (seatIndex === 0 && v.gunshipManualFlight) {
        this.vehicleCameraMode = 'CHASE_3P';
        this.thirdPersonVehicle = true;
      }
    } else if (!v.isAircraft) {
      if (seatIndex === 1 && (v.type === 'tank' || v.type === 'apc' || v.type === 'aa' || v.type === 'humvee')) {
        this.vehicleCameraMode = 'OPTIC_NOSE';
        this.thirdPersonVehicle = false;
      } else if (seatIndex >= 2 || seatRole === 'PILLION') {
        this.vehicleCameraMode = 'CHASE_3P';
        this.thirdPersonVehicle = true;
      }
    }

    sound.playWeaponSwitch?.();
    if (this.onAwardXp) {
      this.onAwardXp(
        0,
        `💺 SWITCHED TO SEAT [F${seatIndex + 1}]: ${seatRole.replace('_', ' ')} (${v.name.split(' (')[0]})`
      );
    }
    return true;
  },

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
      const wasActiveRide = Boolean(v.rideTask && v.rideTask.active);
      const groundH = this.world ? this.world.getGroundHeightAt(v.pos.x, v.pos.z) : 0;
      const supportY = v.isHelicopter
        ? this.getHeliSupportHeightAt(v.pos.x, v.pos.z, v.pos.y + 3.5)
        : groundH;
      const heliClearanceAboveSupport = v.pos.y - supportY;
      const isHeliRooftopOrFastRope = Boolean(
        v.isHelicopter && !v.isShotDown && heliClearanceAboveSupport <= 24.0
      );
      const isAirbornePlane = Boolean(
        v.isAircraft &&
          !isHeliRooftopOrFastRope &&
          (v.pos.y > supportY + 2.5 || v.isShotDown)
      );
      if (v.mesh && !v.dead) {
        v.mesh.visible = true;
      }
      if (v.mesh?.userData?.riderGroup) {
        v.mesh.userData.riderGroup.visible = false;
      }
      if (Array.isArray(v.mesh?.userData?.cockpitCanopyParts)) {
        for (const p of v.mesh.userData.cockpitCanopyParts) {
          if (p) p.visible = true;
        }
      }
      if (Array.isArray(v.crewSeats)) {
        for (let si = 0; si < v.crewSeats.length; si++) {
          if (v.crewSeats[si] === this) v.crewSeats[si] = null;
        }
      }
      if (v.driver === this) {
        v.driver = null;
      }
      if (!v.driver && !v.remoteDriverId && Array.isArray(v.aiPassengers) && v.aiPassengers.length > 0) {
        for (let pi = 0; pi < v.aiPassengers.length; pi++) {
          const pax = v.aiPassengers[pi];
          if (pax) {
            pax.ridingVehicle = null;
            const ang = (pi / Math.max(1, v.aiPassengers.length)) * Math.PI * 2;
            const dropX = v.pos.x + Math.cos(ang) * (v.isHelicopter ? 1.8 : 3.8);
            const dropZ = v.pos.z + Math.sin(ang) * (v.isHelicopter ? 1.8 : 3.8);
            const paxSupY = v.isHelicopter
              ? Math.max(
                  this.world ? this.world.getGroundHeightAt(dropX, dropZ) : groundH,
                  this.vehicleManager?.getAircraftSupportHeightAt
                    ? this.vehicleManager.getAircraftSupportHeightAt(dropX, dropZ, v.pos.y + 3.0, false)
                    : this.getAircraftObstacleHeightAt(dropX, dropZ, v.pos.y + 3.0)
                )
              : groundH;
            const useCenterRoof = v.isHelicopter && Math.abs(paxSupY - supportY) > 1.8;
            pax.pos.set(
              useCenterRoof ? v.pos.x : dropX,
              (useCenterRoof ? supportY : paxSupY) + 0.12,
              useCenterRoof ? v.pos.z : dropZ
            );
            if (pax.mesh) {
              pax.mesh.position.copy(pax.pos);
              pax.mesh.visible = !pax.dead;
            }
          }
        }
        v.aiPassengers.length = 0;
      }
      this.vehicleSeatIndex = 0;
      this.activeVehicle = null;
      this.sensorMode = 'OFF';
      this.nvgActive = false;
      this.targetLockFSM?.send(TARGET_LOCK_EVENTS.LOST_TARGET);
      this.aircraftLockTarget = null;
      this.aircraftLockProgress = 0;
      if (!v.isAircraft) {
        syncGroundVehicleFSM(v);
      }
      if (this.ccipMarkerMesh) this.ccipMarkerMesh.visible = false;
      if (this._gunshipOrbitVisGroup) this._gunshipOrbitVisGroup.visible = false;
      if (this._runwayAssistVisGroup) this._runwayAssistVisGroup.visible = false;
      v.autoFlightMode = null;
      if (this.viewModelGroup) this.viewModelGroup.visible = true;
      events.emit('player:exited-vehicle', {
        vehicle: v,
        reason: isAirbornePlane ? 'ejected' : isHeliRooftopOrFastRope ? 'rooftop_insert' : 'manual'
      });

      if (isAirbornePlane) {
        v.aiPilotActive = !v.isShotDown;
        if (wasActiveRide && v.rideTask) {
          v.rideTask.phase = 'RTB_DEPART';
          v.rideTask.departDelay = 1.5;
        }
        this.activateParachuteEject(v.pos);
      } else if (isHeliRooftopOrFastRope) {
        // Rooftop Step-Out or Low-Hover Fast-Rope Insertion (< 24m above roof/ground — zero fall damage & never steps off roof edge!)
        v.parkedByPlayer = !wasActiveRide;
        if (wasActiveRide && v.rideTask) {
          // AI Airlift Pilot holds steady for 6.5s while you step clear on the rooftop, then departs cleanly!
          v.rideTask.phase = 'RTB_DEPART';
          v.rideTask.departDelay = 6.5;
        } else if (heliClearanceAboveSupport > 2.2) {
          v.heliHoverHold = true;
          v.heliHoverAlt = v.pos.y;
          v.aiPilotActive = false;
        } else {
          // Landed on rooftop or pad: rest solidly on `supportY` so it NEVER falls through the skyscraper!
          v.pos.y = supportY;
          v._heliVelX = 0;
          v._heliVelY = 0;
          v._heliVelZ = 0;
          v.forwardSpeed = 0;
          v.heliHoverHold = false;
          v.aiPilotActive = false;
          if (v.mesh) v.mesh.position.copy(v.pos);
        }
        const rightX = Math.cos(v.yaw || 0);
        const rightZ = -Math.sin(v.yaw || 0);
        let safeOutX = v.pos.x;
        let safeOutZ = v.pos.z;
        let safeOutY = supportY;
        for (const sideDist of [2.4, -2.4, 0]) {
          const cx = v.pos.x + rightX * sideDist;
          const cz = v.pos.z + rightZ * sideDist;
          const cy = Math.max(
            this.world ? this.world.getGroundHeightAt(cx, cz) : groundH,
            this.vehicleManager?.getAircraftSupportHeightAt
              ? this.vehicleManager.getAircraftSupportHeightAt(cx, cz, v.pos.y + 4.0, false)
              : this.getAircraftObstacleHeightAt(cx, cz, v.pos.y + 4.0)
          );
          if (Math.abs(cy - supportY) <= 1.8) {
            safeOutX = cx;
            safeOutZ = cz;
            safeOutY = cy;
            break;
          }
        }
        this.pos.set(safeOutX, safeOutY + 0.15, safeOutZ);
        this.vel.set(0, 0, 0);
        this.isGrounded = true;
        this.parachuting = false;
        this.parachuteCut = false;
        if (this.onAwardXp && (supportY > groundH + 3.5 || heliClearanceAboveSupport > 3.0)) {
          this.onAwardXp(
            20,
            supportY > groundH + 3.5
              ? `🚁🎯 ROOFTOP SNIPER INSERTION COMPLETE (${Math.round(supportY - groundH)}M HIGH-RISE ROOF)!`
              : '🪢🚁 FAST-ROPE HOVER INSERTION COMPLETE!'
          );
        }
      } else {
        if (wasActiveRide && v.rideTask) {
          v.rideTask.phase = 'RTB_DEPART';
          v.rideTask.departDelay = 5.5;
        }
        const exitOffsetX = v.type === 'bike' || v.type === 'atv' ? 2.1 : 3.6;
        const outX = v.pos.x + exitOffsetX;
        const outZ = v.pos.z;
        const outGroundY = this.world ? this.world.getGroundHeightAt(outX, outZ) : v.pos.y;
        this.pos.set(outX, Math.max(outGroundY, v.pos.y) + 0.35, outZ);
      }
      return;
    }

    // 2. Toggle Dragging a downed friendly soldier or Human MP Ally ([E] to grab, [E] again to drop in cover)
    if (this.draggedRemoteAlly && this.draggedRemoteAlly.downed && !this.draggedRemoteAlly.dead) {
      const droppedAllyName = this.draggedRemoteAlly.name;
      this.draggedRemoteAlly = null;
      this.isDraggingAlly = false;
      if (this.onAwardXp) {
        this.onAwardXp(0, `DROPPED ${droppedAllyName} IN COVER — HOLD [F] TO REVIVE`);
      }
      return;
    }
    if (this.draggedBot && this.draggedBot.downed && !this.draggedBot.dead) {
      const droppedName = this.draggedBot.name;
      this.draggedBot = null;
      this.isDraggingAlly = false;
      if (this.onAwardXp) {
        this.onAwardXp(0, `DROPPED ${droppedName} IN COVER — HOLD [F] TO REVIVE`);
      }
      return;
    }

    const netRef = (typeof window !== 'undefined' && window.game?.network) || this.network || null;
    const nearDownedAlly = netRef?.findNearestDownedRemoteAlly
      ? netRef.findNearestDownedRemoteAlly(this.pos, this.team, DISTANCES.INTERACT_RANGE)
      : null;
    if (nearDownedAlly) {
      this.draggedRemoteAlly = nearDownedAlly;
      this.reviveTargetRemoteAlly = nearDownedAlly;
      this.isDraggingAlly = true;
      this.dragDistAccum = 0;
      if (this.onAwardXp) {
        this.onAwardXp(0, `DRAGGING TEAMMATE ${nearDownedAlly.name} — MOVE TO COVER OR HOLD [F] TO REVIVE`);
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
    const strictDoctrine = this.squadDoctrineEnabled !== false;
    if (!silent && era === 'modern') {
      if (nearVehicle.isAircraft) {
        if (
          strictDoctrine &&
          this.role !== 'pilot' &&
          nearVehicle.aircraftRole !== 'heli_transport'
        ) {
          sound.playEmptyClick?.();
          if (this.onAwardXp) {
            this.onAwardXp(
              0,
              '🔒 REQUIRES [COMBAT PILOT] LICENSE TO FLY JETS & ATTACK HELIS! (TRANSPORT HELICOPTERS ARE OPEN TO ALL CLASSES!)'
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
      } else if (
        strictDoctrine &&
        !(nearVehicle.rideTask && nearVehicle.rideTask.active) &&
        (nearVehicle.type === 'tank' || nearVehicle.type === 'apc' || nearVehicle.type === 'aa') &&
        this.role !== 'armor'
      ) {
        sound.playEmptyClick?.();
        if (this.onAwardXp) {
          this.onAwardXp(
            0,
            '🔒 REQUIRES [ARMOR CREWMAN] LICENSE TO OPERATE TANKS, IFVs & AA! (SWITCH TO ARMOR CREW [L] OR TOGGLE DOCTRINE OFF IN ⚙️ SETTINGS)'
          );
        }
        return false;
      }
      // Squad-Aligned Base Motorpool & Runway Rule:
      // All vehicles physically parked at Main Base HQ Runway / Motor Pool or FOBs are $0 FREE to board!
      // (⚡ Match Cash is ONLY charged for extra on-demand personal field drops [0]/[9] or frontline Deploy Requisitions!)
    }
    const hadExistingOccupant = Boolean(
      (nearVehicle.driver && nearVehicle.driver !== this) ||
        nearVehicle.npcDriver ||
        nearVehicle.aiPilotActive
    );
    nearVehicle.claimedByPlayer = false;
    nearVehicle.claimedByPlayerTimer = 0;
    if (nearVehicle.isWarehouseBike || nearVehicle.type === 'bike' || nearVehicle.type === 'atv') {
      nearVehicle.team = this.team;
    }
    if (this.activeVehicle && this.activeVehicle !== nearVehicle) {
      if (this.activeVehicle.mesh && !this.activeVehicle.dead) {
        this.activeVehicle.mesh.visible = true;
      }
      if (Array.isArray(this.activeVehicle.mesh?.userData?.cockpitCanopyParts)) {
        for (const p of this.activeVehicle.mesh.userData.cockpitCanopyParts) {
          if (p) p.visible = true;
        }
      }
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
    const boardingRemoteDriven = Boolean(nearVehicle.remoteDriverId);
    const seatNames = Array.isArray(nearVehicle.seatNames) && nearVehicle.seatNames.length > 0
      ? nearVehicle.seatNames
      : ['DRIVER'];
    if (!Array.isArray(nearVehicle.crewSeats) || nearVehicle.crewSeats.length !== seatNames.length) {
      nearVehicle.crewSeats = new Array(seatNames.length).fill(null);
    }
    const boardingAiRide = Boolean(
      nearVehicle.rideTask &&
        nearVehicle.rideTask.active &&
        nearVehicle.rideTask.phase !== 'RTB_DEPART' &&
        seatNames.length > 1
    );
    if (boardingRemoteDriven) {
      const assignedSeat = !nearVehicle.remoteGunnerId && seatNames.length > 1 ? 1 : Math.min(seatNames.length - 1, 2);
      this.vehicleSeatIndex = assignedSeat;
      nearVehicle.crewSeats[assignedSeat] = this;
      if (!silent && this.onAwardXp) {
        this.onAwardXp(
          0,
          `💺 BOARDED ALLY ${nearVehicle.name.split(' (')[0]} AS [F${assignedSeat + 1}] ${seatNames[assignedSeat]}!`
        );
      }
    } else if (boardingAiRide) {
      // Board as Passenger / Door-Gunner (`[F2]`) so your AI Pilot / AI Driver flies/drives you to your requested destination!
      const paxSeat = Math.min(seatNames.length - 1, 1);
      this.vehicleSeatIndex = paxSeat;
      nearVehicle.crewSeats[paxSeat] = this;
      nearVehicle.driver = this;
      nearVehicle.aiPilotActive = false;
      const awaitingDropoff = Boolean(nearVehicle.rideTask.destPending || !nearVehicle.rideTask.destPos);
      nearVehicle.rideTask.phase = awaitingDropoff ? 'AWAITING_DEST' : 'EN_ROUTE_TO_DEST';
      nearVehicle.rideTask.arrivedAnnounced = false;
      this.activeRideVehicle = nearVehicle;
    } else {
      this.vehicleSeatIndex = 0;
      nearVehicle.crewSeats[0] = this;
      nearVehicle.driver = this;
      nearVehicle.aiPilotActive = false;
      nearVehicle.parkedByPlayer = false;
    }
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
      this.vehicleCameraMode = 'COCKPIT_1P';
      this.thirdPersonVehicle = false;
      const bowSlotIdx = Array.isArray(this.slots)
        ? this.slots.findIndex((s) => s && s.def && (s.def.isBow || s.def.isCrossbow))
        : -1;
      if (bowSlotIdx >= 0 && typeof this.switchSlot === 'function') {
        this.switchSlot(bowSlotIdx);
      }
    } else if (nearVehicle.isAircraft && nearVehicle.aircraftRole === 'gunship') {
      const gH = this.world ? this.world.getGroundHeightAt(nearVehicle.pos.x, nearVehicle.pos.z) : 0;
      if (typeof nearVehicle.targetGunshipAlt !== 'number') {
        nearVehicle.targetGunshipAlt = Math.min(1200, Math.max(220, (nearVehicle.pos.y || 240) - gH));
      }
      if (typeof nearVehicle.pylonSlopeRatio !== 'number') {
        nearVehicle.pylonSlopeRatio = 1.1; // Real-life ~42° gunship pylon depression triangle (R = 1.1 * Alt)
      }
      this.syncGunshipPylonGeometry?.(nearVehicle);
      nearVehicle.manualPylonBank = nearVehicle.idealBankRad || 0.54;
      if (!nearVehicle.orbitCenter) {
        let bestFlag = null;
        let bestDist = Infinity;
        if (this.world?.flags) {
          for (const f of this.world.flags) {
            const d = Math.hypot(f.pos.x - nearVehicle.pos.x, f.pos.z - nearVehicle.pos.z);
            if (d < bestDist) {
              bestDist = d;
              bestFlag = f;
            }
          }
        }
        nearVehicle.orbitCenter = bestFlag
          ? new THREE.Vector3(bestFlag.pos.x, 0, bestFlag.pos.z)
          : new THREE.Vector3(0, 0, 0);
        nearVehicle.orbitAnchorLabel = bestFlag ? `OBJ ${bestFlag.id}` : 'SECTOR GRID';
      }
      if (hadExistingOccupant && nearVehicle.pos.y - gH > 8.0) {
        // Someone else was already flying this AC-130 -> enter directly into Orbit Gunner View!
        nearVehicle.gunshipManualFlight = false;
        this.vehicleCameraMode = nearVehicle.ac130AllowBellyCam ? 'OPTIC_NOSE' : 'COCKPIT_1P';
        this.thirdPersonVehicle = false;
        this.yaw = (nearVehicle.yaw || 0) + Math.PI * 0.5;
        this.pitch = -0.54;
      } else {
        // No one else in the AC-130 -> default to Forward Pilot TRANSIT Mode so you can take off & fly straight; press [R] for Pylon Orbit!
        nearVehicle.gunshipManualFlight = true;
        this.vehicleCameraMode = 'CHASE_3P';
        this.thirdPersonVehicle = true;
        this.yaw = nearVehicle.yaw || 0;
        this.pitch = -0.05;
      }
    } else if (boardingAiRide) {
      // Default to 3rd-Person Chase View when riding an AI Transport so you can watch the helicopter/APC carry you across the map!
      this.vehicleCameraMode = 'CHASE_3P';
      this.thirdPersonVehicle = true;
    } else if (nearVehicle.isAircraft || nearVehicle.type === 'bike' || nearVehicle.type === 'atv') {
      this.vehicleCameraMode = 'CHASE_3P';
      this.thirdPersonVehicle = true;
    } else {
      this.vehicleCameraMode = 'COCKPIT_1P';
      this.thirdPersonVehicle = false;
    }
    if (nearVehicle.mesh?.userData?.riderGroup) {
      nearVehicle.mesh.userData.riderGroup.visible = Boolean(this.thirdPersonVehicle);
    }
    this.bleeding = false;
    this.bleedTickTimer = 0;
    this.isAds = false;
    this.isFiring = false;
    if (this.keys) {
      this.keys['Space'] = false;
      this.keys['KeyF'] = false;
    }
    this._suppressFireUntil = performance.now() + 380;
    this.reloading = false;
    this.viewModelGroup.visible = Boolean(nearVehicle.type === 'warhorse' && !this.thirdPersonVehicle);
    this.pos.copy(nearVehicle.pos);
    events.emit('player:entered-vehicle', { vehicle: nearVehicle, silent });
    events.emit('telemetry:event', {
      type: 'PLAYER_ENTERED_VEHICLE',
      payload: {
        vehicle: nearVehicle.name,
        aircraftRole: nearVehicle.aircraftRole || nearVehicle.type,
        x: Math.round(nearVehicle.pos.x),
        y: Number(nearVehicle.pos.y.toFixed(2)),
        z: Math.round(nearVehicle.pos.z),
        cameraMode: this.vehicleCameraMode,
        gunshipManualFlight: Boolean(nearVehicle.gunshipManualFlight),
        collisionAvoidAuto: this.aircraftCollisionAvoidance !== false
      }
    });
    if (this.onAwardXp && !silent) {
      if (boardingAiRide && nearVehicle.rideTask) {
        const rideHk = getRideShortcutLabel();
        if (nearVehicle.rideTask.phase === 'AWAITING_DEST') {
          this.onAwardXp(
            0,
            nearVehicle.isHelicopter
              ? `🚁 ONBOARD AIRLIFT-1! PRESS [${rideHk}] TO DESIGNATE YOUR DROP-OFF DESTINATION (SKYSCRAPER ROOF, OBJECTIVE, OR MAP SPOT)!`
              : `🛡️ ONBOARD TRANSPORT! PRESS [${rideHk}] TO DESIGNATE YOUR DROP-OFF DESTINATION!`
          );
          return true;
        }
        const destLbl = nearVehicle.rideTask.destLabel || 'DESIGNATED LZ';
        this.onAwardXp(
          0,
          nearVehicle.isHelicopter
            ? `🚁 AIRLIFT BOARDED! AI PILOT FLYING TO ${destLbl} — AIM/FIRE DOOR GUNS, [${rideHk}] CHANGE LZ, [F1] TAKE STICK, [E] DISEMBARK`
            : `🛡️ TRANSPORT BOARDED! AI DRIVER EN ROUTE TO ${destLbl} — MAN TURRET, [${rideHk}] CHANGE LZ, [F1] DRIVE MANUAL, [E] DISEMBARK`
        );
        return true;
      }
      const customBadge = nearVehicle.customLoadoutLabel ? ` [${nearVehicle.customLoadoutLabel}]` : '';
      const isMotoOrAtv = nearVehicle.type === 'bike' || nearVehicle.type === 'atv';
      const boostName = nearVehicle.isElectric
        ? '80HP ELECTRIC OVERDRIVE'
        : nearVehicle.isTwoStroke
        ? '2-STROKE POWERBAND BOOST'
        : 'WHEELIE / NITRO BOOST';
      this.onAwardXp(
        0,
        nearVehicle.isAircraft && nearVehicle.aircraftRole === 'gunship'
          ? nearVehicle.gunshipManualFlight
            ? `✈️ ${nearVehicle.ac130EraLabel || 'AC-130'} TRANSIT MODE — [W/S] THROTTLE & TAKEOFF • FLY TO OBJECTIVE & PRESS [R] FOR PYLON ORBIT • [C] COCKPIT/3P • [L] TECH`
            : nearVehicle.ac130HasCoupledAutopilot
            ? `🛸 ${nearVehicle.ac130EraLabel || 'AC-130'} COUPLED PYLON AUTOPILOT (${nearVehicle.orbitAnchorLabel || 'FOB'}) — [R] TRANSIT/ORBIT • [F] LOCK ORBIT • [C] LEFT-WINDOW/BELLY CAM • [F1] MANUAL`
            : `🛸 ${nearVehicle.ac130EraLabel || '1968 AC-130A'} ORBIT MODE — [A/D] BANK LEFT PYLON • [R] TRANSIT ⇄ ORBIT • [L] UNLOCK EOTECH & COUPLED AUTOPILOT • [F1] MANUAL`
          : nearVehicle.isAircraft && nearVehicle.isHelicopter
          ? this.aircraftCollisionAvoidance !== false
            ? `🚁 ${nearVehicle.name}${customBadge} — EASY MODE [G]: [SPACE/Q] CLIMB • [CTRL/Z] LAND • [WASD] HORIZONTAL FLY • MOUSE FREE-AIMS GUN • [R] HOVER LOCK`
            : `🚁 ${nearVehicle.name}${customBadge} — HARD CYCLIC SIM [G]: [W/S] COLLECTIVE • MOUSE CYCLIC TILT • [A/D] PEDALS • [R] HOVER LOCK`
          : nearVehicle.isAircraft
          ? `✈️ COCKPIT READY: ${nearVehicle.name}${customBadge} ([W/S] THROTTLE • MOUSE/ARROWS LOOP • [C] COCKPIT/3P/NOSE CAM • [X] FLARES • [E] EJECT)`
          : nearVehicle.type === 'truck_transport'
          ? `🚚 ${nearVehicle.name}${customBadge} — 10-SEAT SQUAD CONVoy & MOBILE RESUPPLY AURA ([F1] DRIVER • [F2] ROOF MG • [F3–F8] TROOP BENCH)`
          : isMotoOrAtv
          ? `🏍️ MOUNTED ${nearVehicle.name}${customBadge} ([W/S] PROGRESSIVE THROTTLE • [A/D] LEAN/CARVE • [SPACE/X] ${boostName} • [C] HELMET/3P CAM)`
          : `🛡️ MOUNTED ${nearVehicle.name}${customBadge} ([C] COMMANDER HATCH / GUNNER OPTIC / 3P CAM • [X] APS/SMOKE)`
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
        if (otherV.isAircraft) this.planesDestroyed = (this.planesDestroyed || 0) + 1;
        else if (otherV.type === 'tank' || otherV.type === 'apc' || otherV.type === 'aa') {
          this.tanksDestroyed = (this.tanksDestroyed || 0) + 1;
        } else {
          this.carsDestroyed = (this.carsDestroyed || 0) + 1;
        }
        this.vehiclesDestroyed =
          (this.planesDestroyed || 0) + (this.tanksDestroyed || 0) + (this.carsDestroyed || 0);
      }
    }
  },

  /**
   * [C] Key Vehicle Camera Mode Selector:
   * Cycles cleanly across 3 distinct viewpoints for Planes, Tanks/IFVs/AA, and Cars/Bikes/ATVs:
   * 1. 'CHASE_3P'   — External 3rd-Person Chase / Overwatch Camera
   * 2. 'COCKPIT_1P' — Immersive 1st-Person Interior Cockpit / Commander Vision Block / Driver Cabin / Rider Helmet POV
   * 3. 'OPTIC_NOSE' — Unobstructed Nose HUD / Gunner Bore-Sight / Belly FLIR Sensor Pod Camera
   */
  cycleVehicleCameraMode(forceMode = null) {
    const v = this.activeVehicle;
    if (!v) return 'CHASE_3P';
    const isEarlyGunship =
      v.isAircraft && v.aircraftRole === 'gunship' && !v.ac130AllowBellyCam;
    const order = isEarlyGunship
      ? ['COCKPIT_1P', 'CHASE_3P']
      : ['CHASE_3P', 'COCKPIT_1P', 'OPTIC_NOSE'];
    const cur = order.includes(this.vehicleCameraMode)
      ? this.vehicleCameraMode
      : this.thirdPersonVehicle
      ? 'CHASE_3P'
      : 'COCKPIT_1P';
    const next =
      forceMode && order.includes(forceMode)
        ? forceMode
        : order[(order.indexOf(cur) + 1) % order.length];
    this.vehicleCameraMode = next;
    this.thirdPersonVehicle = next === 'CHASE_3P';
    if (v.mesh?.userData?.riderGroup) {
      v.mesh.userData.riderGroup.visible = Boolean(this.thirdPersonVehicle);
    }
    if (this.viewModelGroup) {
      this.viewModelGroup.visible = Boolean(v.type === 'warhorse' && !this.thirdPersonVehicle);
    }
    if (v.isAircraft && v.aircraftRole === 'gunship' && v.hasThermalFlir && !v._userToggledSensorManually) {
      if (next === 'OPTIC_NOSE') {
        this.sensorMode = 'WHOT';
        this.nvgActive = true;
      } else if (next === 'CHASE_3P' && v.gunshipManualFlight) {
        this.sensorMode = 'OFF';
        this.nvgActive = false;
      }
    }
    sound.playEmptyClick?.();
    if (this.onAwardXp) {
      const modeDesc =
        next === 'COCKPIT_1P'
          ? v.isAircraft && v.aircraftRole === 'gunship' && !v.gunshipManualFlight
            ? v.ac130HasEotechSight
              ? '🎯 CAMERA [C]: PILOT LEFT-WINDOW AFSOC EOTECH HOLOGRAPHIC SIGHT'
              : '🪟 CAMERA [C]: PILOT SIDEWAYS LEFT-WINDOW ANALOG PYLON HUD'
            : v.isAircraft
            ? '🛩️ CAMERA [C]: 1ST-PERSON PILOT COCKPIT CANOPY & HUD'
            : v.type === 'tank' || v.type === 'apc' || v.type === 'aa'
            ? '🛡️ CAMERA [C]: 1ST-PERSON COMMANDER HATCH & VISION PERISCOPE'
            : v.type === 'bike' || v.type === 'atv'
            ? '🏍️ CAMERA [C]: 1ST-PERSON RIDER HELMET HANDLEBAR POV'
            : '🚙 CAMERA [C]: 1ST-PERSON DRIVER CABIN WINDSHIELD POV'
          : next === 'OPTIC_NOSE'
          ? v.isAircraft && v.aircraftRole === 'gunship'
            ? '🎯 CAMERA [C]: BELLY EO/FLIR FIRE-CONTROL SENSOR TURRET'
            : v.isAircraft
            ? '🎯 CAMERA [C]: NOSE HUD / GUNNER BORE-SIGHT CAM'
            : '🎯 CAMERA [C]: STABILIZED TURRET GUNNER OPTIC'
          : isEarlyGunship
          ? '🎥 CAMERA [C]: 3P GUNSHIP OVERWATCH (UNLOCK 1995 AC-130U IN [L] FOR BELLY SENSOR POD!)'
          : '🎥 CAMERA [C]: 3RD-PERSON EXTERNAL CHASE CAM';
      this.onAwardXp(0, modeDesc);
    }
    return next;
  },

  /**
   * Synchronizes Real-Life AC-130 Ballistic Pylon Geometry (`180m` Low Danger-Close <-> `1,800m` High AFSOC Standoff):
   * Uses a progressive high-altitude depression curve (`~42°` standard -> `~56°` steep standoff) so up to `1,800m` AGL
   * the orbit circle stays compact (`~1,220m` radius / `~2,175m` slant range) without clipping airspace borders!
   */
  syncGunshipPylonGeometry(v) {
    if (!v || !v.isAircraft || v.aircraftRole !== 'gunship') return;
    const minAlt = v.gunshipManualFlight ? 0 : 180;
    v.targetGunshipAlt = THREE.MathUtils.clamp(v.targetGunshipAlt ?? 320, minAlt, 1800);
    v.pylonSlopeRatio = THREE.MathUtils.clamp(v.pylonSlopeRatio || 1.08, 0.68, 1.38);
    const effOrbitAlt = Math.max(95, v.targetGunshipAlt);
    const highAltT = THREE.MathUtils.clamp((effOrbitAlt - 280) / 1520, 0, 1);
    const effSlope = v.pylonSlopeRatio * THREE.MathUtils.lerp(1.0, 0.64, highAltT);
    v.orbitRadius = Math.round(effOrbitAlt * effSlope);
    v.slantRangeM = Math.round(Math.hypot(Math.max(10, v.targetGunshipAlt), v.orbitRadius));
    const airSpd = Math.max(26, v.forwardSpeed || 34);
    v.idealBankRad = THREE.MathUtils.clamp(
      Math.atan2(airSpd * airSpd, 9.81 * Math.max(90, v.orbitRadius)) * 1.2,
      0.14,
      0.74
    );
  },

  /**
   * Mouse Scroll Wheel in AC-130: Continuous Optical Sensor Zoom (`9.5°` = `7.9x` Telephoto <-> `68°` = `1.1x` Wide)!
   * Decoupled from aircraft altitude (`[Q / Z]`, `[↑ / ↓]`, `[+ / -]`) so pilots can freely zoom the camera
   * onto targets at any altitude!
   */
  adjustGunshipSensorZoom(stepDir = 1) {
    const v = this.activeVehicle;
    if (!v || !v.isAircraft || v.aircraftRole !== 'gunship') return 34;
    const camMode = this.vehicleCameraMode || (this.thirdPersonVehicle ? 'CHASE_3P' : 'COCKPIT_1P');
    if (camMode === 'CHASE_3P' && !v.gunshipManualFlight && v.ac130AllowBellyCam) {
      this.vehicleCameraMode = 'OPTIC_NOSE';
      this.thirdPersonVehicle = false;
    }
    const curFov = v.customOpticFov || this.camera?.fov || 34;
    const factor = stepDir > 0 ? 0.82 : 1.22;
    const nextFov = THREE.MathUtils.clamp(curFov * factor, 9.5, 68);
    v.customOpticFov = nextFov;
    sound.playEmptyClick?.();
    if (this.onAwardXp) {
      const mag = (75 / nextFov).toFixed(1);
      this.onAwardXp(
        0,
        `🔭 AC-130 OPTIC ZOOM: ${mag}× (FOV ${nextFov.toFixed(1)}°) • [SCROLL] ZOOM • [Q / Z] OR [↑ / ↓] HEIGHT & RING`
      );
    }
    return nextFov;
  },

  /**
   * Adjusts AC-130 Altitude Setpoint (`180m` Low Danger-Close <-> `1,800m` High AFSOC Standoff Overwatch)
   * via `[Q / Z]`, `[↑ / ↓]`, `[+ / -]`, or `[PgUp / PgDn]` in BOTH Transit and Orbit modes!
   */
  adjustGunshipAltitude(deltaAltMeters = 0, silent = false) {
    const v = this.activeVehicle;
    if (!v || !v.isAircraft || v.aircraftRole !== 'gunship') return 320;
    const prevAlt = Math.round(v.targetGunshipAlt ?? 320);
    const curAlt = v.targetGunshipAlt ?? 320;
    const minAlt = v.gunshipManualFlight ? 0 : 180;
    // Progressive step above 500m so climbing/descending up to 1,800m feels snappy!
    const stepMult = !silent && curAlt > 500 ? 1.65 : 1.0;
    v.targetGunshipAlt = THREE.MathUtils.clamp(curAlt + deltaAltMeters * stepMult, minAlt, 1800);
    this.syncGunshipPylonGeometry(v);
    const nextAlt = Math.round(v.targetGunshipAlt);
    if (!silent && nextAlt !== prevAlt && this.onAwardXp) {
      const bankDeg = Math.round((v.idealBankRad * 180) / Math.PI);
      const tof105 = (v.slantRangeM / 175).toFixed(1);
      const bandTag =
        nextAlt >= 900
          ? '🛰️ HIGH AFSOC STANDOFF (IMMUNE TO GROUND AA • JETS ONLY!)'
          : nextAlt >= 420
          ? '☁️ MID-HIGH PYLON (SAFE ABOVE STINGERS)'
          : nextAlt <= 230
          ? '🔥 LOW DANGER-CLOSE (MAX PRECISION / HEAVY AA RISK)'
          : '🛸 STANDARD COMBAT PYLON';
      this.onAwardXp(
        0,
        `${bandTag} • ALT: ${nextAlt}M • CIRCLE: ${v.orbitRadius}M • SLANT: ${v.slantRangeM}M • BANK: ${bankDeg}°L • 105MM TOF: ${tof105}S`
      );
    }
    return nextAlt;
  },

  /**
   * Computes the smart predicted Orbit Target (snapping to nearby Conquest Flags A-E or crosshair ground point)
   * while flying in Transit Mode so the pilot sees the exact 3D circle on the ground BEFORE pressing [R]!
   */
  computePredictedGunshipOrbit(v) {
    if (!v) return null;
    this.syncGunshipPylonGeometry(v);
    const camOrigin = this.camera.getWorldPosition(_vehScratchA);
    const camDir = _vehScratchB.set(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    let candX = v.pos.x;
    let candZ = v.pos.z;

    if (camDir.y < -0.04) {
      const groundEst = this.world ? this.world.getGroundHeightAt(v.pos.x, v.pos.z) : 1.25;
      const t = THREE.MathUtils.clamp((camOrigin.y - groundEst) / -camDir.y, 75, 2200);
      candX = camOrigin.x + camDir.x * t;
      candZ = camOrigin.z + camDir.z * t;
    } else {
      const fwdDist = Math.max(220, Math.round((v.orbitRadius || 240) * 1.15));
      const fwdX = -Math.sin(this.yaw ?? v.yaw ?? 0);
      const fwdZ = -Math.cos(this.yaw ?? v.yaw ?? 0);
      candX = v.pos.x + fwdX * fwdDist;
      candZ = v.pos.z + fwdZ * fwdDist;
    }
    candX = THREE.MathUtils.clamp(candX, -6500, 6500);
    candZ = THREE.MathUtils.clamp(candZ, -6500, 6500);

    let snappedFlag = null;
    if (this.world?.flags) {
      let bestD = 165;
      for (const f of this.world.flags) {
        const d = Math.hypot(f.pos.x - candX, f.pos.z - candZ);
        if (d < bestD) {
          bestD = d;
          snappedFlag = f;
        }
      }
    }
    if (!v.previewOrbitCenter) v.previewOrbitCenter = new THREE.Vector3();
    if (snappedFlag) {
      v.previewOrbitCenter.set(snappedFlag.pos.x, 0, snappedFlag.pos.z);
      v.previewOrbitLabel = `OBJ ${snappedFlag.id}`;
    } else {
      v.previewOrbitCenter.set(candX, 0, candZ);
      v.previewOrbitLabel = `GRID (${Math.round(candX)}, ${Math.round(candZ)})`;
    }
    return v.previewOrbitCenter;
  },

  /**
   * Fine-tunes AC-130 lateral Pylon Bank/Depression Trim (`[` / `]` keys) at the current altitude
   * (`pylonSlopeRatio` `0.78..1.42`, adjusting gun depression between ~35° shallow and ~52° steep).
   */
  adjustGunshipOrbitRadius(deltaMeters = 0, silent = false) {
    const v = this.activeVehicle;
    if (!v || !v.isAircraft || v.aircraftRole !== 'gunship') return 220;
    const alt = Math.max(95, v.targetGunshipAlt || 200);
    const prevR = v.orbitRadius || Math.round(alt * (v.pylonSlopeRatio || 1.1));
    v.pylonSlopeRatio = THREE.MathUtils.clamp((prevR + deltaMeters) / alt, 0.78, 1.42);
    this.syncGunshipPylonGeometry(v);
    if (!silent && v.orbitRadius !== prevR && this.onAwardXp) {
      const depressDeg = Math.round((Math.atan2(alt, v.orbitRadius) * 180) / Math.PI);
      const bankDeg = Math.round((v.idealBankRad * 180) / Math.PI);
      this.onAwardXp(
        0,
        `📐 PYLON BANK/SLOPE TRIM: CIRCLE ${v.orbitRadius}M @ ${Math.round(alt)}M ALT • GUN ${depressDeg}° DOWN • BANK ${bankDeg}°L ([WHEEL/↑↓] HEIGHT ZOOM)`
      );
    }
    return v.orbitRadius;
  },

  /**
   * Builds & updates the 3D Ground Orbit Ring, Center Bullseye Cross + Beacon, and Entry Path Line
   * so the pilot always sees their exact orbit circle & firing center in both Transit and Orbit modes!
   */
  updateGunshipOrbitVisualizer(v) {
    if (!this.scene) return;
    if (!v || !v.isAircraft || v.aircraftRole !== 'gunship' || v.dead) {
      if (this._gunshipOrbitVisGroup) this._gunshipOrbitVisGroup.visible = false;
      return;
    }
    const gndHere = this.world ? this.world.getGroundHeightAt(v.pos.x, v.pos.z) : 0;
    const altAglHere = (v.pos?.y || 0) - gndHere;
    const airSpdHere = Math.abs(v.forwardSpeed || 0);
    // Hide the 3D Pylon Orbit marker & circle ONLY during takeoff/landing (<32m AGL or <24 m/s slow roll, or Auto-Flight);
    // once airborne at cruise speed, the AC-130 can preview & orbit ANYWHERE on the map with zero geo-fencing!
    if (
      altAglHere < 32.0 ||
      (v.gunshipManualFlight && airSpdHere < 24.0) ||
      v.autoFlightMode === 'TAKEOFF' ||
      v.autoFlightMode === 'LANDING'
    ) {
      if (this._gunshipOrbitVisGroup) this._gunshipOrbitVisGroup.visible = false;
      return;
    }
    this.syncGunshipPylonGeometry(v);

    if (!this._gunshipOrbitVisGroup) {
      const grp = new THREE.Group();
      const segs = 64;
      const ringPts = new Float32Array((segs + 1) * 3);
      const ringGeo = new THREE.BufferGeometry();
      ringGeo.setAttribute('position', new THREE.BufferAttribute(ringPts, 3));
      const ringMat = new THREE.LineBasicMaterial({
        color: 0x00d2d3,
        transparent: true,
        opacity: 0.88
      });
      const ringLine = new THREE.Line(ringGeo, ringMat);
      ringLine.frustumCulled = false;
      grp.add(ringLine);

      // Center Bullseye Ring + Crosshair + Vertical Light Beacon
      const bullGeo = new THREE.RingGeometry(7.5, 10.5, 28);
      bullGeo.rotateX(-Math.PI / 2);
      const bullMat = new THREE.MeshBasicMaterial({
        color: 0x00d2d3,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85
      });
      const bullMesh = new THREE.Mesh(bullGeo, bullMat);
      grp.add(bullMesh);

      const crossMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.8
      });
      const crossX = new THREE.Mesh(new THREE.BoxGeometry(28, 0.35, 1.1), crossMat);
      const crossZ = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.35, 28), crossMat);
      grp.add(crossX, crossZ);

      const beaconGeo = new THREE.CylinderGeometry(0.65, 1.8, 42, 8);
      const beaconMat = new THREE.MeshBasicMaterial({
        color: 0x00d2d3,
        transparent: true,
        opacity: 0.24,
        depthWrite: false
      });
      const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
      grp.add(beaconMesh);

      // Curved Tangent Entry Flight Path (28 segments smoothly curving from AC-130 nose into the exact Counter-Clockwise Tangent Point!)
      const entrySegs = 28;
      const entryPts = new Float32Array((entrySegs + 1) * 3);
      const entryGeo = new THREE.BufferGeometry();
      entryGeo.setAttribute('position', new THREE.BufferAttribute(entryPts, 3));
      const entryMat = new THREE.LineBasicMaterial({
        color: 0xffd32a,
        transparent: true,
        opacity: 0.9
      });
      const entryLine = new THREE.Line(entryGeo, entryMat);
      entryLine.frustumCulled = false;
      grp.add(entryLine);

      grp.userData = {
        ringLine,
        ringMat,
        bullMesh,
        bullMat,
        crossX,
        crossZ,
        beaconMesh,
        beaconMat,
        entryLine,
        entrySegs
      };
      this.scene.add(grp);
      this._gunshipOrbitVisGroup = grp;
    }

    const grp = this._gunshipOrbitVisGroup;
    grp.visible = true;
    const isTransit = Boolean(v.gunshipManualFlight);
    const center = isTransit
      ? this.computePredictedGunshipOrbit(v)
      : v.orbitCenter || this.computePredictedGunshipOrbit(v);
    if (!center) return;

    const radius = v.orbitRadius || 220;
    const bullScale = THREE.MathUtils.clamp(radius / 200, 0.85, 2.35);
    const cx = center.x;
    const cz = center.z;
    const centerGroundY = (this.world ? this.world.getGroundHeightAt(cx, cz) : 1.25) + 1.8;
    const colHex = isTransit ? 0x00d2d3 : 0x2ecc71;

    const { ringLine, ringMat, bullMesh, bullMat, crossX, crossZ, beaconMesh, beaconMat, entryLine, entrySegs = 28 } =
      grp.userData;
    ringMat.color.setHex(colHex);
    ringMat.opacity = isTransit ? 0.88 : 0.34;
    bullMat.color.setHex(colHex);
    beaconMat.color.setHex(colHex);
    // Keep the giant 28m Bullseye Cross & Beacon visible in Transit Mode for aiming orbit entry,
    // and hide them during Active Orbit Mode so they NEVER cover up ground targets/bridges under fire!
    bullMesh.visible = isTransit;
    crossX.visible = isTransit;
    crossZ.visible = isTransit;
    beaconMesh.visible = isTransit;

    // Only rebuild & re-upload the 65-vertex 3D ground ring VBO when center/radius actually moves > 0.65m!
    const movedRing =
      grp.userData._lastCx === undefined ||
      Math.abs(cx - grp.userData._lastCx) > 0.65 ||
      Math.abs(cz - grp.userData._lastCz) > 0.65 ||
      Math.abs(radius - grp.userData._lastRadius) > 0.65;

    if (movedRing) {
      grp.userData._lastCx = cx;
      grp.userData._lastCz = cz;
      grp.userData._lastRadius = radius;
      bullMesh.position.set(cx, centerGroundY, cz);
      bullMesh.scale.set(bullScale, 1, bullScale);
      crossX.position.set(cx, centerGroundY + 0.1, cz);
      crossX.scale.set(bullScale, 1, bullScale);
      crossZ.position.set(cx, centerGroundY + 0.1, cz);
      crossZ.scale.set(bullScale, 1, bullScale);
      beaconMesh.position.set(cx, centerGroundY + 21 * bullScale, cz);
      beaconMesh.scale.set(bullScale, bullScale, bullScale);

      const posArr = ringLine.geometry.attributes.position.array;
      const segs = 64;
      for (let i = 0; i <= segs; i++) {
        const ang = (i / segs) * Math.PI * 2;
        const rx = cx + Math.cos(ang) * radius;
        const rz = cz + Math.sin(ang) * radius;
        const ry = (this.world ? this.world.getGroundHeightAt(rx, rz) : 1.25) + 3.2;
        const idx = i * 3;
        posArr[idx] = rx;
        posArr[idx + 1] = ry;
        posArr[idx + 2] = rz;
      }
      ringLine.geometry.attributes.position.needsUpdate = true;
    }

    // Show Curved Tangent Entry Flight Path when in Transit Mode (or >25m off the orbit perimeter)
    const dx = v.pos.x - cx;
    const dz = v.pos.z - cz;
    const dist = Math.hypot(dx, dz) || 1;
    const showEntry = isTransit || Math.abs(dist - radius) > 26;
    entryLine.visible = showEntry;
    if (showEntry) {
      // Exact Geometric Right-Hand Tangent Point `T` for a Counter-Clockwise (Left-Pylon, Port-Side Guns) Orbit:
      // For `dist > radius`, `alpha = phi - arccos(radius / dist)` satisfies `(T - P) · (T - C) = 0` (exact 90° tangent!)
      // AND `(T - P)` points in the exact orbit flow direction `v_orb = (+sin(alpha), -cos(alpha))`!
      const phi = Math.atan2(dz, dx);
      const alpha =
        dist > radius * 1.01
          ? phi - Math.acos(THREE.MathUtils.clamp(radius / dist, -1, 1))
          : phi - 0.92;
      const tx = cx + Math.cos(alpha) * radius;
      const tz = cz + Math.sin(alpha) * radius;
      const tanDirX = Math.sin(alpha);
      const tanDirZ = -Math.cos(alpha);
      const chordLen = Math.hypot(tx - v.pos.x, tz - v.pos.z);
      const handleLen = Math.min(chordLen * 0.45, Math.max(45, radius * 0.65));
      const noseDirX = -Math.sin(v.yaw || 0);
      const noseDirZ = -Math.cos(v.yaw || 0);

      // Blend start tangent between current nose heading and direct tangent chord so even straight-in approaches
      // curve gracefully out to the right-side tangent point and merge seamlessly into the circle!
      const dirToTx = chordLen > 1 ? (tx - v.pos.x) / chordLen : noseDirX;
      const dirToTz = chordLen > 1 ? (tz - v.pos.z) / chordLen : noseDirZ;
      const startTanX = noseDirX * 0.55 + dirToTx * 0.45;
      const startTanZ = noseDirZ * 0.55 + dirToTz * 0.45;
      const sNorm = Math.hypot(startTanX, startTanZ) || 1;
      const m0x = (startTanX / sNorm) * handleLen;
      const m0z = (startTanZ / sNorm) * handleLen;
      const m1x = tanDirX * handleLen;
      const m1z = tanDirZ * handleLen;

      const eArr = entryLine.geometry.attributes.position.array;
      for (let s = 0; s <= entrySegs; s++) {
        const u = s / entrySegs;
        const u2 = u * u;
        const u3 = u2 * u;
        const h00 = 2 * u3 - 3 * u2 + 1;
        const h10 = u3 - 2 * u2 + u;
        const h01 = -2 * u3 + 3 * u2;
        const h11 = u3 - u2;
        const px = h00 * v.pos.x + h10 * m0x + h01 * tx + h11 * m1x;
        const pz = h00 * v.pos.z + h10 * m0z + h01 * tz + h11 * m1z;
        const py = (this.world ? this.world.getGroundHeightAt(px, pz) : 1.25) + THREE.MathUtils.lerp(4.5, 3.4, u);
        const idx = s * 3;
        eArr[idx] = px;
        eArr[idx + 1] = py;
        eArr[idx + 2] = pz;
      }
      entryLine.geometry.attributes.position.needsUpdate = true;
    }
  },

  /**
   * [F] Key in AC-130J Ghostrider Gunship:
   * Locks the AC-130J's counter-clockwise Pylon Orbit Anchor directly onto the Objective Flag (A–E)
   * or exact ground terrain point under the player's crosshair (and engages Orbit Mode if in Transit)!
   */
  lockGunshipOrbitAtCrosshair() {
    const v = this.activeVehicle;
    if (!v || !v.isAircraft || v.aircraftRole !== 'gunship') return false;
    const camOrigin = this.camera.getWorldPosition(new THREE.Vector3());
    const camDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    let hitPt = null;
    if (Math.abs(camDir.y) > 0.04 && camDir.y < 0) {
      const t = Math.min(2200, Math.max(20, (camOrigin.y - 2) / -camDir.y));
      hitPt = camOrigin.clone().addScaledVector(camDir, t);
    } else {
      hitPt = new THREE.Vector3(v.pos.x, 0, v.pos.z);
    }
    hitPt.x = THREE.MathUtils.clamp(hitPt.x, -6500, 6500);
    hitPt.z = THREE.MathUtils.clamp(hitPt.z, -6500, 6500);

    let snappedFlag = null;
    if (this.world?.flags) {
      let bestD = 125;
      for (const f of this.world.flags) {
        const d = Math.hypot(f.pos.x - hitPt.x, f.pos.z - hitPt.z);
        if (d < bestD) {
          bestD = d;
          snappedFlag = f;
        }
      }
    }
    if (!v.orbitCenter) v.orbitCenter = new THREE.Vector3();
    if (snappedFlag) {
      v.orbitCenter.set(snappedFlag.pos.x, 0, snappedFlag.pos.z);
      v.orbitAnchorLabel = `OBJ ${snappedFlag.id}`;
    } else {
      v.orbitCenter.set(hitPt.x, 0, hitPt.z);
      v.orbitAnchorLabel = `GRID (${Math.round(hitPt.x)}, ${Math.round(hitPt.z)})`;
    }
    const wasManual = Boolean(v.gunshipManualFlight);
    v.gunshipManualFlight = false;
    if (wasManual && this.vehicleCameraMode === 'CHASE_3P') {
      this.vehicleCameraMode = v.ac130AllowBellyCam ? 'OPTIC_NOSE' : 'COCKPIT_1P';
      this.thirdPersonVehicle = false;
      if (v.ac130AllowBellyCam && v.hasThermalFlir && !v._userToggledSensorManually) {
        this.sensorMode = 'WHOT';
        this.nvgActive = true;
      }
    }
    const gCenterY = this.world ? this.world.getGroundHeightAt(v.orbitCenter.x, v.orbitCenter.z) : 1.25;
    const horizDist = Math.max(60, Math.hypot(v.orbitCenter.x - v.pos.x, v.orbitCenter.z - v.pos.z));
    this.yaw = Math.atan2(-(v.orbitCenter.x - v.pos.x), -(v.orbitCenter.z - v.pos.z));
    this.pitch = THREE.MathUtils.clamp(-Math.atan2(Math.max(30, v.pos.y - gCenterY), horizDist), -1.15, -0.18);
    sound.playRadioBeep?.(true);
    if (this.onAwardXp) {
      this.onAwardXp(
        0,
        `🔄 AC-130 ORBIT LOCKED ON ${v.orbitAnchorLabel} (RADIUS ${v.orbitRadius || 185}M) — [WASD] MOVE CIRCLE • [WHEEL] DISTANCE • [R] TRANSIT`
      );
    }
    return true;
  },

  /**
   * [R] Key in AC-130J Ghostrider Gunship:
   * Toggles between TRANSIT FLIGHT (fly straight with live 3D Cyan Orbit Preview Ring on the ground)
   * and PYLON ORBIT MODE (automatically intercepts the previewed circle & aims side guns at the Bullseye!).
   */
  toggleGunshipFlightMode() {
    const v = this.activeVehicle;
    if (!v || !v.isAircraft || v.aircraftRole !== 'gunship') return false;
    const gH = this.world ? this.world.getGroundHeightAt(v.pos.x, v.pos.z) : 0;
    if (v.gunshipManualFlight && v.pos.y - gH < 18.0) {
      sound.playEmptyClick?.();
      if (this.onAwardXp) {
        this.onAwardXp(0, '⚠️ CLIMB ABOVE 20M AGL FIRST, THEN PRESS [R] TO ENTER PYLON ORBIT AROUND THE CYAN RING!');
      }
      return true;
    }
    v.gunshipManualFlight = !v.gunshipManualFlight;
    if (!v.gunshipManualFlight) {
      // Lock onto the exact Cyan Preview Target the pilot saw on the ground in Transit Mode!
      const preview = this.computePredictedGunshipOrbit(v);
      if (!v.orbitCenter) v.orbitCenter = new THREE.Vector3();
      if (preview) {
        v.orbitCenter.copy(preview);
        v.orbitAnchorLabel = v.previewOrbitLabel || 'TARGET ZONE';
      } else {
        const fwdX = -Math.sin(v.yaw || 0);
        const fwdZ = -Math.cos(v.yaw || 0);
        const radius = v.orbitRadius || 185;
        v.orbitCenter.set(
          THREE.MathUtils.clamp(v.pos.x - fwdZ * radius, -6500, 6500),
          0,
          THREE.MathUtils.clamp(v.pos.z + fwdX * radius, -6500, 6500)
        );
        v.orbitAnchorLabel = 'PORT PYLON';
      }
      if (typeof v.targetGunshipAlt !== 'number') {
        v.targetGunshipAlt = THREE.MathUtils.clamp(v.pos.y - gH, 220, 1800);
      }
      this.syncGunshipPylonGeometry(v);
      v.manualPylonBank = v.idealBankRad || 0.54;
      if (this.vehicleCameraMode === 'CHASE_3P') {
        this.vehicleCameraMode = v.ac130AllowBellyCam ? 'OPTIC_NOSE' : 'COCKPIT_1P';
        this.thirdPersonVehicle = false;
        if (v.ac130AllowBellyCam && v.hasThermalFlir && !v._userToggledSensorManually) {
          this.sensorMode = 'WHOT';
          this.nvgActive = true;
        }
      }
      // Pre-aim Gunner/Left-Window Sight directly toward the Orbit Bullseye!
      const tgtGroundY = this.world ? this.world.getGroundHeightAt(v.orbitCenter.x, v.orbitCenter.z) : 1.25;
      const distToTgt = Math.max(60, Math.hypot(v.orbitCenter.x - v.pos.x, v.orbitCenter.z - v.pos.z));
      this.yaw = (v.yaw || 0) + Math.PI * 0.5;
      this.pitch = THREE.MathUtils.clamp(
        -Math.atan2(Math.max(40, v.pos.y - tgtGroundY), distToTgt),
        -1.15,
        -0.2
      );
    } else {
      if (this.vehicleCameraMode === 'OPTIC_NOSE') {
        this.vehicleCameraMode = 'CHASE_3P';
        this.thirdPersonVehicle = true;
      }
      if (v.hasThermalFlir && !v._userToggledSensorManually) {
        this.sensorMode = 'OFF';
        this.nvgActive = false;
      }
      this.yaw = v.yaw;
      this.pitch = THREE.MathUtils.clamp(v.pitch || 0, -0.25, 0.25);
    }
    sound.playRadioBeep?.(true);
    if (this.onAwardXp) {
      this.onAwardXp(
        0,
        v.gunshipManualFlight
          ? '✈️ AC-130 TRANSIT MODE [R]: AIM CYAN GROUND RING AT TARGET & PRESS [R] TO AUTO-ENTER ORBIT!'
          : `🔄 AC-130 INTERCEPTING ${v.orbitAnchorLabel} (${v.orbitRadius || 185}M RING) — [WASD] MOVE CIRCLE • [WHEEL] DISTANCE • [↑/↓] ALT • [F] SNAP!`
      );
    }
    return v.gunshipManualFlight;
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
      const g = this.world.worldToGrid(outPos.x, outPos.y, outPos.z, _tmpGrid);
      const vox = this.world.getVoxel ? this.world.getVoxel(g.gx, g.gy, g.gz) : this.world.voxels.get(this.world.key(g.gx, g.gy, g.gz));
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
    const roles = ['heli_transport', 'heli_attack', 'cas', 'fighter', 'gunship', 'b2_spirit', 'wright_flyer'];
    const normForce = forceRole === 'bomber' ? 'b2_spirit' : forceRole;
    if (normForce && roles.includes(normForce)) {
      this.preferredAircraftRole = normForce;
    } else {
      const curIdx = roles.indexOf(this.preferredAircraftRole || 'heli_transport');
      this.preferredAircraftRole = roles[(curIdx + 1) % roles.length];
    }
    const roleLabels = {
      heli_transport:
        '🚁 TRANSPORT HELICOPTER: UH-60M BLACK HAWK / MI-8AMTSH (8 SEATS • TWIN MINIGUNS • ROOFTOP SNIPER INSERTION)',
      heli_attack:
        '🚁 ATTACK HELICOPTER: AH-64E APACHE LONGBOW / KA-52 ALLIGATOR (30MM CHAIN GUN + HYDRA + 8× HELLFIRE/VIKHR ATGM)',
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
   * Cycles preferred Heavy Armor Requisition Type (`[Shift+9]` for Armor Crewman):
   * 'tank' ($1,100 MBT) -> 'apc' ($650 8x8 IFV) -> 'aa' ($750 Mobile SPAAG AA)
   */
  cycleArmorOrderType(forceType = null) {
    if ((this.world?.era || 'modern') !== 'modern') return null;
    const types = ['tank', 'apc', 'aa'];
    if (forceType && types.includes(forceType)) {
      this.preferredArmorOrderType = forceType;
    } else {
      const curIdx = types.indexOf(this.preferredArmorOrderType || 'tank');
      this.preferredArmorOrderType = types[(curIdx + 1) % types.length];
    }
    const isRU = this.team === 'RU';
    const labels = {
      tank: isRU
        ? '🛡️ T-90M PRORYV MAIN BATTLE TANK ($1,100 FACTION FUNDS • [9] TO DELIVER AHEAD)'
        : '🛡️ M1A2 SEP v3 ABRAMS MAIN BATTLE TANK ($1,100 FACTION FUNDS • [9] TO DELIVER AHEAD)',
      apc: isRU
        ? '🛡️ BTR-82A 8×8 AMPHIBIOUS IFV ($650 FACTION FUNDS • [9] TO DELIVER AHEAD)'
        : '🛡️ LAV-25A2 8×8 AMPHIBIOUS IFV ($650 FACTION FUNDS • [9] TO DELIVER AHEAD)',
      aa: isRU
        ? '📡 2K22 TUNGUSKA-M1 SPAAG AA ($750 FACTION FUNDS • [9] TO DELIVER AHEAD)'
        : '📡 M163 PIVADS / LAV-AD SPAAG AA ($750 FACTION FUNDS • [9] TO DELIVER AHEAD)'
    };
    sound.playRadioBeep?.(true);
    if (this.onAwardXp) {
      this.onAwardXp(0, `ARMOR REQUISITION SELECTED [SHIFT+9]: ${labels[this.preferredArmorOrderType]}`);
    }
    return this.preferredArmorOrderType;
  },

  /**
   * [9] Key / Tactical Map Requisition Button for Armor Crewman:
   * Requests immediate field drop of a Tank ($1,100), 8x8 IFV ($650), or SPAAG AA ($750) 10.5m ahead!
   */
  requestArmorDelivery(forceType = null) {
    if (this.dead || this.downed || !this.vehicleManager) return null;
    const era = this.world?.era || 'modern';
    if (era !== 'modern') {
      sound.playEmptyClick?.();
      if (this.onAwardXp) {
        this.onAwardXp(0, '⚠️ MODERN HEAVY ARMOR REQUISITION IS ONLY AVAILABLE IN THE MODERN ERA!');
      }
      return null;
    }
    if (this.squadDoctrineEnabled !== false && this.role !== 'armor') {
      sound.playEmptyClick?.();
      if (this.onAwardXp) {
        this.onAwardXp(
          0,
          '🔒 REQUIRES [ARMOR CREWMAN] LICENSE TO REQUISITION TANKS, IFVs & AA! (SWITCH TO ARMOR CREW [L] OR TOGGLE DOCTRINE OFF IN ⚙️ SETTINGS)'
        );
      }
      return null;
    }
    if (forceType) {
      this.preferredArmorOrderType = forceType;
    }
    const targetType = this.preferredArmorOrderType || 'tank';
    const res = this.vehicleManager.requestPlayerArmorVehicle
      ? this.vehicleManager.requestPlayerArmorVehicle(this, targetType)
      : null;
    if (!res || !res.ok) {
      sound.playEmptyClick?.();
      if (res && res.reason === 'COOLDOWN' && this.onAwardXp) {
        this.onAwardXp(0, `⏳ ${targetType.toUpperCase()} REQUISITION COOLDOWN (${res.cooldownRem}s REMAINING)!`);
      } else if (res && (res.reason === 'INSUFFICIENT_FUNDS' || res.reason === 'INSUFFICIENT_MATCH_CASH') && this.onAwardXp) {
        this.onAwardXp(
          0,
          `⚠️ NEED ⚡$${(res.cost || 0).toLocaleString()} MATCH CASH FOR ${targetType.toUpperCase()} (HAVE ⚡$${Math.floor(this.matchCash || 0).toLocaleString()})!`
        );
      }
      return null;
    }
    sound.playRadioBeep?.(true);
    if (this.onAwardXp) {
      this.onAwardXp(
        0,
        `🛡️ ${res.vehicle.name} DELIVERED 10M AHEAD (-⚡$${res.cost} MATCH CASH) — PRESS [E] TO BOARD!`
      );
    }
    return res.vehicle;
  },

  /**
   * [0] Key / Vehicle Bay Button (Works for ALL Classes!):
   * Delivers a fresh M1030M1 Recon Motorcycle ('bike', ⚡$250) or Polaris MV850 4x4 Quad ATV ('atv', ⚡$350) 5.8m ahead!
   */
  requestReconBikeDelivery(forceSubKind = null) {
    if (this.dead || this.downed || !this.vehicleManager) return null;
    const era = this.world?.era || 'modern';
    if (era !== 'modern') {
      sound.playEmptyClick?.();
      if (this.onAwardXp) {
        this.onAwardXp(0, '⚠️ MILITARY RECON BIKES & 4×4 ATVS ARE ONLY AVAILABLE IN THE MODERN ERA!');
      }
      return null;
    }
    const kind = forceSubKind === 'atv' ? 'atv' : 'bike';
    const res = this.vehicleManager.requestPlayerLightBike
      ? this.vehicleManager.requestPlayerLightBike(this, kind)
      : null;
    if (!res || !res.ok) {
      sound.playEmptyClick?.();
      if (res && res.reason === 'COOLDOWN' && this.onAwardXp) {
        this.onAwardXp(0, `⏳ ${kind.toUpperCase()} COOLDOWN (${res.cooldownRem}s REMAINING)!`);
      } else if (res && (res.reason === 'INSUFFICIENT_FUNDS' || res.reason === 'INSUFFICIENT_MATCH_CASH') && this.onAwardXp) {
        this.onAwardXp(
          0,
          `⚠️ NEED ⚡$${res.cost || (kind === 'atv' ? 350 : 250)} MATCH CASH FOR ${kind === 'atv' ? '4×4 QUAD ATV' : 'DIRT BIKE'} (HAVE ⚡$${Math.floor(this.matchCash || 0)})!`
        );
      }
      return null;
    }
    sound.playRadioBeep?.(true);
    if (this.onAwardXp) {
      this.onAwardXp(
        0,
        `🏍️ ${res.vehicle.name} DELIVERED 5M AHEAD (-⚡$${res.cost} MATCH CASH) — PRESS [E] TO RIDE!`
      );
    }
    return res.vehicle;
  },

  /**
   * [9] Key / Tactical Map Requisition Button: Orders & launches a Combat Aircraft Sortie
   * (or parks it fresh on the HQ Side Flight-Line Apron when `launchAirborne === false`).
   */
  launchAircraftSortie(forceRole = null, launchAirborne = true) {
    if (this.dead || this.downed || !this.vehicleManager) return null;
    const era = this.world?.era || 'modern';
    if (era !== 'modern') {
      sound.playEmptyClick?.();
      if (this.onAwardXp) {
        this.onAwardXp(0, '⚠️ MODERN COMBAT AIRCRAFT ARE ONLY AVAILABLE IN THE MODERN ERA!');
      }
      return null;
    }
    if (
      this.squadDoctrineEnabled !== false &&
      this.role !== 'pilot' &&
      forceRole !== 'heli_transport' &&
      this.preferredAircraftRole !== 'heli_transport'
    ) {
      sound.playEmptyClick?.();
      if (this.onAwardXp) {
        this.onAwardXp(
          0,
          '🔒 REQUIRES [COMBAT PILOT] LICENSE FOR JETS & ATTACK HELIS! (USE [SHIFT+9] TO SELECT 🚁 TRANSPORT HELICOPTER FOR ANY CLASS!)'
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
    } else if (launchAirborne && this.activeVehicle && this.activeVehicle.isAircraft) {
      const roles = b2Unlocked
        ? ['heli_transport', 'heli_attack', 'cas', 'fighter', 'gunship', 'b2_spirit', 'wright_flyer']
        : ['heli_transport', 'heli_attack', 'cas', 'fighter', 'gunship', 'wright_flyer'];
      const curRole =
        this.activeVehicle.aircraftRole === 'bomber'
          ? 'b2_spirit'
          : this.activeVehicle.aircraftRole || 'cas';
      const curIdx = roles.indexOf(curRole);
      const nextIdx = (curIdx + 1) % roles.length;
      this.preferredAircraftRole = roles[nextIdx];
    }
    let role = this.preferredAircraftRole || (b2Unlocked ? 'cas' : 'cas');
    if (role === 'b2_spirit' && !b2Unlocked) {
      role = 'cas';
      this.preferredAircraftRole = 'cas';
      if (this.onAwardXp) {
        this.onAwardXp(
          0,
          `🔒 B-2 SPIRIT UNLOCKS AT 25 FACTION KILLS (${teamKills}/25) — ORDERING CAS SORTIE INSTEAD!`
        );
      }
    }

    const orderRes = this.vehicleManager.orderPlayerAircraft
      ? this.vehicleManager.orderPlayerAircraft(this, role, launchAirborne)
      : { ok: true, vehicle: this.vehicleManager.findOrLaunchPlayerAircraft(this, role, false), cost: 800, launchAirborne };

    if (!orderRes || !orderRes.ok || !orderRes.vehicle) {
      sound.playEmptyClick?.();
      if (orderRes && orderRes.reason === 'COOLDOWN' && this.onAwardXp) {
        this.onAwardXp(0, `⏳ AIRFRAME REQUISITION COOLDOWN (${orderRes.cooldownRem}s REMAINING)!`);
      } else if (orderRes && (orderRes.reason === 'INSUFFICIENT_FUNDS' || orderRes.reason === 'INSUFFICIENT_MATCH_CASH') && this.onAwardXp) {
        this.onAwardXp(
          0,
          `⚠️ NEED ⚡$${(orderRes.cost || 0).toLocaleString()} MATCH CASH FOR ${role.toUpperCase()} (HAVE ⚡$${Math.floor(this.matchCash || 0).toLocaleString()})!`
        );
      } else if (this.onAwardXp) {
        this.onAwardXp(0, '⏳ AIRCRAFT UNAVAILABLE OR INSUFFICIENT MATCH CASH!');
      }
      return null;
    }

    const plane = orderRes.vehicle;
    const paidCost = orderRes.cost || 0;
    sound.playRadioBeep?.(false);

    if (!launchAirborne) {
      if (this.onAwardXp) {
        this.onAwardXp(
          35,
          `✈️ AIRCRAFT DELIVERED TO HQ APRON (-⚡$${paidCost.toLocaleString()} MATCH CASH): ${plane.name} READY FOR TAKEOFF [E]!`
        );
      }
      return plane;
    }

    this.enterVehicle(plane, true);
    if (this.onAwardXp) {
      const costTag = paidCost > 0 ? ` (-$${paidCost.toLocaleString()} FACTION FUNDS)` : '';
      const missionDesc =
        role === 'wright_flyer'
          ? '1903 WRIGHT FLYER I SECRET PIONEER SORTIE'
          : role === 'b2_spirit'
          ? 'NORTHROP B-2A SPIRIT STEALTH BOMBER ([1] 80× MK-82 CARPET • [2] GBU-57 MOP • [3] 4× GBU-31 JDAM)'
          : role === 'cas'
          ? 'A-10 CAS STRAFING MISSION (30MM GAU-8 [LMB] + ROCKETS [SPACE])'
          : role === 'gunship'
          ? 'AC-130J ORBITAL GUNSHIP ([1] 25MM • [2] 40MM BOFORS • [3/SPACE] 105MM HOWITZER)'
          : 'COMBINED STRIKE FIGHTER/BOMBER ([1] 20MM VULCAN • [2/SPACE] AIM-9X • [3] JDAM/GBU-28)';
      this.onAwardXp(50, `✈️ AIRBORNE SORTIE LAUNCHED${costTag}: ${plane.name} — ${missionDesc}!`);
    }
    events.emit('telemetry:event', {
      type: 'PLAYER_AIRCRAFT_SORTIE',
      payload: {
        aircraftId: plane.id,
        aircraftName: plane.name,
        aircraftRole: plane.aircraftRole,
        cost: paidCost,
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
      const canopy = new THREE.Mesh(_chuteCanopyGeo, _chuteCanopyMat);
      canopy.position.set(0, 3.6, 0);
      chuteGroup.add(canopy);
      for (const sx of [-1.4, 1.4]) {
        const cord = new THREE.Mesh(_chuteCordGeo, _chuteCordMat);
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
    const maxSlots = v.isAircraft || v.type === 'tank' || v.type === 'apc' ? 3 : 2;
    const clamped = Math.max(0, Math.min(maxSlots - 1, slotIndex));
    if (v.activeWeaponSlot === clamped) return;
    v.activeWeaponSlot = clamped;
    if (v.isAircraft && v.aircraftRole === 'gunship') {
      // Reset manual scroll-zoom override so switching 25mm / 40mm / 105mm snaps to that gun's CoD optic magnification!
      v.customOpticFov = null;
    }
    sound.playWeaponSwitch?.();
    let label = '';
    if (v.isAircraft) {
      if (v.aircraftRole === 'heli_transport') {
        label =
          clamped === 0
            ? '🔥 [1] TWIN 7.62MM M134 DOOR MINIGUNS (1,500 RPM • LMB)'
            : clamped === 1
            ? '🚀 [2] 70MM HYDRA / S-8 UTILITY ROCKET POD (LMB / SPACE)'
            : '🎯 [3] FIM-92 STINGER / IGLA SELF-DEFENSE A2A MISSILE (LMB / SPACE)';
      } else if (v.aircraftRole === 'heli_attack') {
        label =
          clamped === 0
            ? '💥 [1] 30MM M230 / 2A42 CHIN AUTOCANNON (650 RPM HEDP • LMB)'
            : clamped === 1
            ? '🚀 [2] 19-TUBE HYDRA-70 / S-8 ROCKET SALVO (LMB / SPACE)'
            : '🎯 [3] AGM-114L HELLFIRE / 9K121 VIKHR TANK-BUSTER ATGM (8× • LMB / SPACE)';
      } else if (v.aircraftRole === 'wright_flyer') {
        label =
          clamped === 0
            ? '🔫 [1] 1903 HAND-CRANKED BRASS GATLING MG (840 RPM • LMB)'
            : clamped === 1
            ? '🧨 [2] 1903 KITTY HAWK DYNAMITE CRATE SALVO (LMB / SPACE)'
            : '🎯 [3] BARNSTORMER GATLING [LMB] + AIM-9X ANACHRONISM [SPACE]';
      } else if (v.aircraftRole === 'b2_spirit') {
        label =
          clamped === 0
            ? '💣 [1] 80× MK-82 ROTARY CARPET BOMB BAY (5-BOMB ROLLING WAVE • HOLD LMB / SPACE)'
            : clamped === 1
            ? '💥 [2] 2× GBU-57A/B MOP 30,000LB MASSIVE BUNKER-BUSTER (LMB / SPACE)'
            : '🎯 [3] 4× GBU-31(V)3 2,000LB PRECISION JDAM PENETRATOR (LMB / SPACE)';
      } else if (v.aircraftRole === 'cas') {
        label =
          clamped === 0
            ? '💥 [1] 30MM GAU-8 AVENGER ROTARY CANNON ("BRRRT!" • LMB)'
            : clamped === 1
            ? '🚀 [2] HYDRA-70 UNGUIDED ROCKET POD SALVO (LMB / SPACE)'
            : '🎯 [3] AGM-65G MAVERICK ATGM [LMB] + 500LB MK-82 CCIP BOMB [SPACE]';
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
            ? '⚡ [1] 120MM/125MM APFSDS HYPER-VELOCITY SABOT SELECTED (780 M/S FLAT • LMB)'
            : '⚡ [1] 30MM HIGH-VELOCITY AUTOCANNON SELECTED (460 M/S • LMB)'
          : clamped === 1
          ? '🔥 [2] 7.62MM COAXIAL MG SELECTED (LMB / SPACE)'
          : v.type === 'tank'
          ? '🚀 [3] 9M119M REFLEKS / LAHAT LASER-GUIDED ATGM SELECTED (STEERS TO CROSSHAIR • LMB)'
          : '🚀 [3] BGM-71 TOW-2B / 9M133 KORNET WIRE-GUIDED ATGM SELECTED (STEERS TO CROSSHAIR • LMB)';
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
      if (this._gunshipOrbitVisGroup) this._gunshipOrbitVisGroup.visible = false;
      if (this._runwayAssistVisGroup) this._runwayAssistVisGroup.visible = false;
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

    const seatIdx = this.vehicleSeatIndex || 0;
    const isAiChauffeuredRide = Boolean(
      v.rideTask && v.rideTask.active && seatIdx >= 1 && !v.remoteDriverId
    );
    const isHullDriver = seatIdx === 0 && !v.remoteDriverId && !isAiChauffeuredRide;
    const canControlTurret = (seatIdx === 0 && !v.remoteGunnerId) || seatIdx === 1;

    if (isAiChauffeuredRide && this.vehicleManager?.stepAiGroundRide) {
      this.vehicleManager.stepAiGroundRide(v, dt, this);
    }

    const accel =
      v.isEmplacement || !isHullDriver
        ? 0
        : (this.keys['KeyW'] ? 1 : 0) - (this.keys['KeyS'] ? 1 : 0);
    const steer =
      v.isEmplacement || !isHullDriver
        ? 0
        : (this.keys['KeyA'] ? 1 : 0) - (this.keys['KeyD'] ? 1 : 0);

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
    } else if (isAiChauffeuredRide) {
      // Hull velocity & steering already stepped by `stepAiGroundRide(v, dt, this)`!
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
    const absGroundSpd = Math.abs(v.forwardSpeed || 0);
    const canStandstillPivot =
      v.type === 'tank' ||
      v.type === 'aa' ||
      Boolean(v.canNeutralPivot) ||
      isMotoOrAtv ||
      isWarhorse;

    if (!v.isEmplacement && (absGroundSpd > 0.18 || (canStandstillPivot && steer !== 0))) {
      // Realistic Ackermann / Tracked Skid-Steer + High-Speed Tire/Track Lateral Grip Envelope:
      // - Tanks & SPAAGs can neutral-pivot on the spot (R = 0m at 0 km/h) via cross-drive tracks!
      // - Wheeled APCs (R_min = 8.8m) & Humvees/Tigrs (R_min = 7.5m) require rolling motion and obey lateral G-limits at top speed!
      const maxYawRate = this.computeGroundVehicleMaxYawRate(v, absGroundSpd, subsystemTurnMult);
      const dirSign = v.forwardSpeed < -0.18 ? -1 : 1;
      v.yaw += steer * dt * maxYawRate * dirSign;
      if (isMotoOrAtv && !isWarhorse && !isDinoMount) {
        this.yaw += steer * dt * maxYawRate * dirSign * 0.55;
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
      // On a Dino Mount, align body yaw toward rider look yaw bounded by theropod stride momentum & lateral traction!
      let yawDiff = this.yaw - v.yaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      const maxDinoYawStep = this.computeGroundVehicleMaxYawRate(v, absGroundSpd, subsystemTurnMult) * dt;
      v.yaw += THREE.MathUtils.clamp(yawDiff * Math.min(1, dt * 5.0), -maxDinoYawStep, maxDinoYawStep);

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

    // Enforce physical turret depression & elevation limits:
    // - Tank Main Gun & Mantlet Coax MG (`[F1]/[F2]`): -10° to +20° (real M1A2/T-90M armored mantlet roof limit)
    // - Tank Seat `[F3] COMMANDER` Roof .50 Cal CROWS / Kord RWS: -18° to +60° (+1.05 rad) for rooftops & helicopters!
    // - Humvee / Tigr / HMG Nest Roof .50 Cal: -15° to +60° (+1.05 rad)
    const isTankCommanderRws = v.type === 'tank' && seatIdx === 2;
    const pitchLimits =
      isWarhorse
        ? { min: -0.58, max: 0.65 }
        : isTankCommanderRws
        ? { min: -0.31, max: 1.05 }
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
        : { min: -0.26, max: 1.05 };
    this.pitch = THREE.MathUtils.clamp(this.pitch, pitchLimits.min, pitchLimits.max);

    if (canControlTurret) {
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
    }
    this.pos.copy(v.pos);

    // Position camera in 3-Mode Vehicle Camera ('CHASE_3P' | 'COCKPIT_1P' | 'OPTIC_NOSE')
    const camMode =
      this.vehicleCameraMode || (this.thirdPersonVehicle ? 'CHASE_3P' : 'COCKPIT_1P');
    this.thirdPersonVehicle = camMode === 'CHASE_3P';
    const lookDir = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    );
    let camRollCoupling = 0;

    if (camMode === 'CHASE_3P') {
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
    } else if (camMode === 'COCKPIT_1P') {
      // Authentic Interior / Hatch Cockpit Camera per Ground Vehicle Class:
      // - Tank / IFV / SPAAG: Commander cupola periscope offset slightly behind turret ring so the 3D cannon barrel & glacis are visible!
      // - Humvee / Armored Car: Left-seat driver/commander cabin behind armored windshield looking over the 3D hood!
      // - Bike / ATV: Rider helmet visor leaning naturally with v.roll over the 3D handlebars!
      const hullFwdX = -Math.sin(v.yaw || 0);
      const hullFwdZ = -Math.cos(v.yaw || 0);
      const hullRightX = Math.cos(v.yaw || 0);
      const hullRightZ = -Math.sin(v.yaw || 0);
      const turFwdX = -Math.sin(this.yaw || 0);
      const turFwdZ = -Math.cos(this.yaw || 0);
      if (v.type === 'tank' || v.type === 'apc' || isAaVehicle) {
        const cupolaH = v.type === 'tank' ? 2.68 : 2.75;
        this.camera.position.set(
          v.pos.x - turFwdX * 0.35,
          v.pos.y + cupolaH,
          v.pos.z - turFwdZ * 0.35
        );
        camRollCoupling = (v.roll || 0) * 0.35;
      } else if (isMotoOrAtv) {
        const leanShift = Math.sin(v.roll || 0) * 0.38;
        this.camera.position.set(
          v.pos.x - hullFwdX * 0.12 - hullRightX * leanShift,
          v.pos.y + (v.type === 'atv' ? 1.66 : 1.56),
          v.pos.z - hullFwdZ * 0.12 - hullRightZ * leanShift
        );
        camRollCoupling = (v.roll || 0) * 0.65;
      } else if (v.type === 'humvee') {
        // Roof .50 Cal M2HB RWS / Gunner Cupola Sight (aligned with turretPivot z = +0.2 = -hullFwd * 0.2)
        this.camera.position.set(
          v.pos.x - hullFwdX * 0.2 - turFwdX * 0.22,
          v.pos.y + 2.96,
          v.pos.z - hullFwdZ * 0.2 - turFwdZ * 0.22
        );
        camRollCoupling = (v.roll || 0) * 0.35;
      } else {
        const eyeH = isDinoMount ? 3.8 : v.isEmplacement ? 1.85 : PLAYER.VEHICLE_1ST_PERSON_HEIGHT;
        this.camera.position.set(v.pos.x, v.pos.y + eyeH, v.pos.z);
      }
    } else {
      // 'OPTIC_NOSE': Clean Stabilized Gunner Bore-Sight / Roof RWS Optic
      const hullFwdX = -Math.sin(v.yaw || 0);
      const hullFwdZ = -Math.cos(v.yaw || 0);
      const turFwdX = -Math.sin(this.yaw || 0);
      const turFwdZ = -Math.cos(this.yaw || 0);
      if (v.type === 'humvee') {
        this.camera.position.set(
          v.pos.x - hullFwdX * 0.2 + turFwdX * 0.65,
          v.pos.y + 2.88,
          v.pos.z - hullFwdZ * 0.2 + turFwdZ * 0.65
        );
      } else {
        const opticH = isDinoMount ? 3.8 : v.isEmplacement ? 1.9 : isMotoOrAtv ? 1.48 : v.type === 'tank' || v.type === 'apc' || isAaVehicle ? 2.68 : PLAYER.VEHICLE_1ST_PERSON_HEIGHT;
        this.camera.position.set(
          v.pos.x + turFwdX * 0.75,
          v.pos.y + opticH,
          v.pos.z + turFwdZ * 0.75
        );
      }
    }

    const euler = new THREE.Euler(this.pitch + this.recoilOffsetPitch, this.yaw, camRollCoupling, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);
    this.camera.updateMatrixWorld();

    const targetFov = this.isAds ? (v.sensorZoomFov || PLAYER.VEHICLE_FOV_ADS) : PLAYER.VEHICLE_FOV_NORMAL;
    const nextFov = THREE.MathUtils.lerp(this.camera.fov, targetFov, Math.min(1, dt * 12));
    if (Math.abs(this.camera.fov - nextFov) > 0.02) {
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
    } else if (this.camera.fov !== targetFov) {
      this.camera.fov = targetFov;
      this.camera.updateProjectionMatrix();
    }

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
      const tx = THREE.MathUtils.clamp(v.pos.x + flatDir.x * mortarRange, -2450, 2450);
      const tz = THREE.MathUtils.clamp(v.pos.z + flatDir.z * mortarRange, -1650, 1650);
      const ty = this.world ? this.world.getGroundHeightAt(tx, tz) : 0;
      mortarTargetPos = new THREE.Vector3(tx, ty + 0.35, tz);
      this.aircraftCcipPoint = mortarTargetPos;

      if (!this.ccipMarkerMesh && this.scene) {
        this.ccipMarkerMesh = new THREE.Mesh(_ccipRingGeo, _ccipRingMat);
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
    const wantFireCommanderRws =
      isTankCommanderRws &&
      !v.coaxOverheated &&
      (this.isFiring || Boolean(this.keys['Space']) || Boolean(this.keys['KeyF']));
    const wantFirePrimary = canControlTurret && this.isFiring && activeSlot === 0;
    const wantFireAtgm =
      canControlTurret &&
      (v.type === 'tank' || v.type === 'apc') &&
      this.isFiring &&
      activeSlot === 2;
    const wantFireSecondaryOrCoax =
      canControlTurret &&
      (Boolean(this.keys['Space']) ||
        Boolean(this.keys['KeyF']) ||
        (this.isFiring && activeSlot === 1));
    const wantFireCoax = hasCoax && !v.coaxOverheated && wantFireSecondaryOrCoax;

    const muzzleOrigin = v.pos
      .clone()
      .add(new THREE.Vector3(0, v.type === 'tank' ? 2.35 : v.isEmplacement ? 1.55 : 2.8, 0))
      .addScaledVector(lookDir, v.type === 'tank' ? 4.2 : 2.2);

    if ((wantFirePrimary || (isWarhorse && this.isFiring)) && v.fireCooldown <= 0) {
      const effectiveRpm =
        v.weaponType === 'aa_autocannon'
          ? Math.max(v.rpm || 1050, 1050)
          : v.weaponType === 'moto_pdw' || v.type === 'bike' || v.type === 'atv'
          ? v.rpm || 750
          : v.weaponType === 'hmg'
          ? v.rpm || 550
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
          isTreb ? _trebBoulderGeo : _mortarShellGeo,
          isTreb ? _trebBoulderMat : _mortarShellMat
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
          const shellMesh = new THREE.Mesh(_aaShellGeo, _aaShellMat);
          shellMesh.position.copy(muzzleOrigin);
          _vehScratchA.copy(muzzleOrigin).addScaledVector(aaDir, 10);
          shellMesh.lookAt(_vehScratchA);
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
        if (!this.consumeVehicleOrdnance(v, 'slot0', 1, '120MM MAIN CANNON')) {
          return;
        }
        v.barrelRecoil = 1.0;
        this.recoilOffsetPitch += 0.022;
        this.addShake(0.42);
        if (typeof sound.playTankCannon === 'function') {
          sound.playTankCannon(0, 0);
        } else {
          sound.playExplosion(0);
        }
        this.world.spawnDebris(muzzleOrigin, _colTankFlash, 5);

        const aimTarget = this.computeVehicleAimTarget(camOrigin, camDir, v, 420);
        const targetDist = muzzleOrigin.distanceTo(aimTarget.point);
        const shellSpeed = PROJECTILES.TANK_SHELL.speed;
        const shellGrav = PROJECTILES.TANK_SHELL.gravity;
        const compDist = Math.min(targetDist, 420);
        const flightTime = compDist / shellSpeed;
        const gravDropComp = 0.5 * shellGrav * flightTime * flightTime;
        const compensatedAimPoint = aimTarget.point
          .clone()
          .add(new THREE.Vector3(0, gravDropComp, 0));
        const launchDir = compensatedAimPoint.sub(muzzleOrigin).normalize();

        const shellMesh = new THREE.Mesh(_tankShellGeo, _tankShellMat);
        shellMesh.position.copy(muzzleOrigin);
        _vehScratchA.copy(muzzleOrigin).addScaledVector(launchDir, 10);
        shellMesh.lookAt(_vehScratchA);
        this.scene.add(shellMesh);

        this.world.projectiles.push({
          type: 'tank_shell',
          weaponName: v.team === 'RU' ? '125MM 3BM60 APFSDS-T' : '120MM M829A4 APFSDS-T',
          mesh: shellMesh,
          vel: launchDir.multiplyScalar(shellSpeed),
          gravity: shellGrav,
          life: PROJECTILES.TANK_SHELL.life,
          owner: this
        });
      } else if (v.weaponType === 'autocannon') {
        const acLabel =
          v.team === 'RU' ? '30MM 2A72 APDS-T AUTOCANNON' : '25MM M242 BUSHMASTER APDS-T';
        if (!this.consumeVehicleOrdnance(v, 'slot0', 1, acLabel)) {
          return;
        }
        this.recoilOffsetPitch += 0.0035;
        this.addShake(0.12);
        sound.playGunshot('autocannon', 0);

        const aimTarget = this.computeVehicleAimTarget(camOrigin, camDir, v, 185);
        const targetDist = muzzleOrigin.distanceTo(aimTarget.point);
        const acSpeed = PROJECTILES.AUTOCANNON.speed;
        const acGrav = PROJECTILES.AUTOCANNON.gravity;
        const compDist = Math.min(targetDist, 180);
        const flightTime = compDist / acSpeed;
        const gravDropComp = 0.5 * acGrav * flightTime * flightTime;
        const compensatedAimPoint = aimTarget.point
          .clone()
          .add(new THREE.Vector3(0, gravDropComp, 0));
        const launchDir = compensatedAimPoint.sub(muzzleOrigin).normalize();

        const shellMesh = new THREE.Mesh(_autocannonShellGeo, _autocannonShellMat);
        shellMesh.position.copy(muzzleOrigin);
        _vehScratchA.copy(muzzleOrigin).addScaledVector(launchDir, 10);
        shellMesh.lookAt(_vehScratchA);
        this.scene.add(shellMesh);

        this.world.projectiles.push({
          type: 'autocannon',
          weaponName: acLabel,
          weaponLabel: acLabel,
          mesh: shellMesh,
          vel: launchDir.multiplyScalar(acSpeed),
          gravity: acGrav,
          life: PROJECTILES.AUTOCANNON.life,
          owner: this
        });
      } else if (v.weaponType === 'moto_pdw' || v.type === 'bike' || v.type === 'atv') {
        // Motorcycle / 4×4 Quad ATV Rider One-Handed 9×19mm Personal Defense SMG (Finite Mag Pouch • Small-Arms Ballistics):
        // ~520 J pistol-caliber submachine gun (`26` DMG, `390 m/s`, `115m` range, ZERO damage to armored Humvees/APCs/Tanks!)
        if (!this.consumeVehicleOrdnance(v, 'slot0', 1, '9MM RIDER PDW')) {
          return;
        }
        this.recoilOffsetPitch += 0.0024;
        this.addShake(0.018);
        sound.playGunshot('smg', 0);
        const pdwSpread = 0.014; // One-handed handlebar firing dispersion (~0.8°)
        const pdwDir = camDir
          .clone()
          .add(
            new THREE.Vector3(
              (Math.random() - 0.5) * pdwSpread,
              (Math.random() - 0.5) * pdwSpread,
              (Math.random() - 0.5) * pdwSpread
            )
          )
          .normalize();
        this.fireBallisticRay(
          camOrigin,
          pdwDir,
          26,
          1.65,
          10,
          '9MM RIDER PDW',
          0.75,
          {
            isMountedMg: false,
            soundType: 'smg',
            muzzleVelocity: 390,
            maxEffectiveRange: 115,
            tracerEveryShots: 3
          },
          1,
          muzzleOrigin
        );
      } else {
        // Humvee / GAZ Tigr / Emplacement .50 Cal M2HB / Kord Heavy Machine Gun (12.7×99mm NATO • ~18,000 J Anti-Materiel):
        // Controlled 550 RPM heavy cyclic cadence, 1,200-round ammo chest (131s sustained fire!), 86 DMG & anti-light-armor punch!
        if (!this.consumeVehicleOrdnance(v, 'slot0', 1, '.50 CAL HMG')) {
          return;
        }
        this.recoilOffsetPitch += 0.002;
        this.addShake(0.04);
        sound.playGunshot('hmg', 0);
        const hmgSpread = 0.0015; // Heavy pintle / CROWS mount (~0.085° dispersion)
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
          86,
          2.0,
          135,
          '.50 CAL HMG',
          2.15,
          { isMountedMg: true, muzzleVelocity: 890, maxEffectiveRange: 800, tracerEveryShots: 2 },
          1,
          muzzleOrigin
        );
      }
    }

    // Slot [3] Wire / Laser-Guided SACLOS ATGM (BGM-71 TOW-2B on LAV-25, 9M133 Kornet on BTR-82A, 9M119M Refleks / LAHAT on MBTs!)
    if (wantFireAtgm && v.fireCooldown <= 0) {
      const atgmLabel =
        v.type === 'tank'
          ? v.team === 'RU'
            ? '9M119M REFLEKS GUN-ATGM'
            : '120MM LAHAT LASER ATGM'
          : v.team === 'RU'
          ? '9M133 KORNET ATGM'
          : 'BGM-71 TOW-2B ATGM';
      if (!this.consumeVehicleOrdnance(v, 'slot2', 1, atgmLabel)) {
        return;
      }
      v.maxFireCooldown = 3.4;
      v.fireCooldown = v.maxFireCooldown;
      v.barrelRecoil = v.type === 'tank' ? 0.65 : 0.25;
      this.recoilOffsetPitch += 0.012;
      this.addShake(0.26);
      sound.playRocketLaunch?.(0);
      this.world.spawnDebris(muzzleOrigin, _colTrebOrange, 6);

      const atgmCfg = PROJECTILES.ATGM_TOW || {
        speed: 118,
        maxSpeed: 235,
        accel: 115,
        life: 9.5,
        turnRate: 4.4,
        blastRadius: 7.2,
        blastDamage: 430
      };
      const aimTarget = this.computeVehicleAimTarget(camOrigin, camDir, v, 850);
      const launchDir = aimTarget.point.clone().sub(muzzleOrigin).normalize();
      const atgmMesh = new THREE.Mesh(_atgmMissileGeo, _atgmMissileMat);
      atgmMesh.position.copy(muzzleOrigin);
      _vehScratchA.copy(muzzleOrigin).addScaledVector(launchDir, 10);
      atgmMesh.lookAt(_vehScratchA);
      this.scene.add(atgmMesh);

      this.world.projectiles.push({
        type: 'atgm_missile',
        isSaclosGuided: true,
        weaponName: atgmLabel,
        weaponLabel: atgmLabel,
        mesh: atgmMesh,
        vel: launchDir.multiplyScalar(atgmCfg.speed),
        maxSpeed: atgmCfg.maxSpeed,
        accel: atgmCfg.accel,
        gravity: 0,
        life: atgmCfg.life,
        turnRate: atgmCfg.turnRate,
        blastRadius: atgmCfg.blastRadius,
        blastDamage: atgmCfg.blastDamage,
        sourceVehicle: v,
        owner: this
      });
      if (this.onAwardXp) {
        this.onAwardXp(0, `🚀 ${atgmLabel} LAUNCHED — KEEP CROSSHAIR ON TARGET TO GUIDE!`);
      }
    }

    // Tank Seat [F3] COMMANDER Roof .50 Cal CROWS M153 / 12.7mm Kord RWS (-18° to +60° High-Angle Anti-Rooftop/Heli!)
    if (wantFireCommanderRws && v.coaxCooldown <= 0) {
      if (!this.consumeVehicleOrdnance(v, 'slot1', 1, 'COMMANDER .50 CAL RWS')) {
        return;
      }
      const rwsInterval = 60 / 750;
      v.coaxCooldown = rwsInterval;
      v.coaxHeat = Math.min(1.0, (v.coaxHeat || 0) + rwsInterval * 0.18 * (v.customCoaxHeatMult || 1.0));
      if (v.coaxHeat >= 1.0) v.coaxOverheated = true;
      this.recoilOffsetPitch += 0.0015;
      this.addShake(0.028);
      sound.playGunshot('hmg', 0);
      const rwsOrigin = v.pos.clone().add(new THREE.Vector3(0, 2.95, 0)).addScaledVector(lookDir, 1.4);
      const rwsSpread = 0.0015;
      const rwsDir = camDir
        .clone()
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * rwsSpread,
            (Math.random() - 0.5) * rwsSpread,
            (Math.random() - 0.5) * rwsSpread
          )
        )
        .normalize();
      this.fireBallisticRay(
        camOrigin,
        rwsDir,
        72,
        2.0,
        115,
        v.team === 'RU' ? '12.7MM KORD ROOF RWS' : '.50 CAL CROWS RWS',
        1.9,
        { isMountedMg: true, muzzleVelocity: 900, maxEffectiveRange: 700, tracerEveryShots: 2 },
        1,
        rwsOrigin
      );
    }

    // Separate Tank / APC Coaxial 7.62mm MG, Mobile AA Homing SAM Pod, or 81mm Mortar 3-Round Barrage ([SPACE] / [F] or Slot [2] + [LMB])
    if (isAaVehicle && wantFireSecondaryOrCoax && v.coaxCooldown <= 0) {
      if (!this.consumeVehicleOrdnance(v, 'slot1', 1, 'ANTI-AIR SAM')) {
        return;
      }
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
      const samMesh = new THREE.Mesh(_vehSamGeo, _vehSamMat);
      samMesh.position.copy(muzzleOrigin);
      _vehScratchA.copy(muzzleOrigin).add(samDir);
      samMesh.lookAt(_vehScratchA);
      this.scene.add(samMesh);

      const samName = v.team === 'RU' ? '9M311 TUNGUSKA SAM' : 'FIM-92 STINGER SAM';
      this.world.projectiles.push({
        type: 'a2a_missile',
        isPitbullActiveSeeker: true,
        weaponName: samName,
        weaponLabel: samName,
        mesh: samMesh,
        vel: samDir.multiplyScalar(PROJECTILES.STINGER_SAM?.speed || 265),
        gravity: 0,
        life: 6.5,
        turnRate: 6.8,
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
      if (!this.consumeVehicleOrdnance(v, 'slot1', 1, '81MM MORTAR BARRAGE')) {
        return;
      }
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

        const mMesh = new THREE.Mesh(_mortarShellGeo, _mortarSalvoMat);
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
      if (!this.consumeVehicleOrdnance(v, 'slot1', 1, '7.62MM COAX MG')) {
        return;
      }
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
    let bestDist = isAir ? 4800 : 420;
    let hitFound = false;

    if (this.world && typeof this.world.raycastVoxel === 'function') {
      const vHit = this.world.raycastVoxel(camOrigin, camDir, isAir ? 2400 : 420);
      if (vHit && vHit.distance > 4.5 && vHit.distance < bestDist) {
        bestDist = vHit.distance;
        hitFound = true;
      }
    }

    // For high-altitude aircraft / AC-130J aiming at sloped terrain, ray-march + binary-refine the heightfield along camDir!
    if (isAir && camDir.y < -0.015 && this.world && typeof this.world.getGroundHeightAt === 'function') {
      const maxRay = Math.min(bestDist, 4800);
      const minYEstimate = -12;
      const maxPossibleT = Math.min(maxRay, Math.max(20, (minYEstimate - camOrigin.y) / camDir.y));
      const steps = 32;
      let prevT = 8.0;
      for (let s = 1; s <= steps; s++) {
        const t = 8.0 + ((maxPossibleT - 8.0) * s) / steps;
        if (t >= bestDist) break;
        const hx = camOrigin.x + camDir.x * t;
        const hy = camOrigin.y + camDir.y * t;
        const hz = camOrigin.z + camDir.z * t;
        const terrY = this.world.getGroundHeightAt(hx, hz);
        if (hy <= terrY) {
          let lo = prevT;
          let hi = t;
          for (let b = 0; b < 5; b++) {
            const mid = (lo + hi) * 0.5;
            const mx = camOrigin.x + camDir.x * mid;
            const my = camOrigin.y + camDir.y * mid;
            const mz = camOrigin.z + camDir.z * mid;
            if (my <= this.world.getGroundHeightAt(mx, mz)) {
              hi = mid;
            } else {
              lo = mid;
            }
          }
          if (hi < bestDist) {
            bestDist = hi;
            hitFound = true;
          }
          break;
        }
        prevT = t;
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
    if (!this._flareDecoyPool) {
      this._flareDecoyPool = [];
    }
    const isB2 = v.aircraftRole === 'b2_spirit' || v.isStealthAircraft;
    const isWright = v.aircraftRole === 'wright_flyer';
    const cosP = Math.cos(v.pitch || 0);
    const flightDir = _vehScratchA.set(
      -Math.sin(v.yaw || 0) * cosP,
      Math.sin(v.pitch || 0),
      -Math.cos(v.yaw || 0) * cosP
    ).normalize();
    const rightVec = _vehScratchB.set(Math.cos(v.yaw || 0), 0, -Math.sin(v.yaw || 0)).normalize();
    const pairsCount = isInitialSalvo ? 2 : 1;
    const coreMat = isB2 ? _flareCoreMatB2 : isWright ? _flareCoreMatWright : _flareCoreMatStd;
    const haloHex = isB2 ? 0xa29bfe : isWright ? 0xf39c12 : 0xff7f11;

    for (let pIdx = 0; pIdx < pairsCount; pIdx++) {
      for (const side of [-1, 1]) {
        let decoy = this._flareDecoyPool.pop();
        if (!decoy) {
          const flareGroup = new THREE.Group();
          const coreMesh = new THREE.Mesh(_flareCoreGeo, coreMat);
          const haloMat = new THREE.MeshBasicMaterial({
            color: haloHex,
            transparent: true,
            opacity: 0.72
          });
          const haloMesh = new THREE.Mesh(_flareHaloGeo, haloMat);
          flareGroup.add(coreMesh, haloMesh);
          decoy = {
            mesh: flareGroup,
            coreMesh,
            haloMesh,
            vel: new THREE.Vector3(),
            isB2: false,
            life: 0,
            maxLife: 2.1,
            smokeTimer: 0
          };
        } else {
          decoy.coreMesh.material = coreMat;
          decoy.haloMesh.material.color.setHex(haloHex);
          decoy.haloMesh.material.opacity = 0.72;
        }

        const fwdOff = 2.2 - pIdx * 2.4;
        const isGunshipFlare = v.aircraftRole === 'gunship';
        const aftBias = isGunshipFlare ? -9.5 : 0;
        const rightOff = side * ((isGunshipFlare ? 6.2 : 2.6) + pIdx * 1.2);
        const upOff = (isGunshipFlare ? 1.8 : 0.4) + pIdx * 0.35;
        decoy.mesh.position.set(
          v.pos.x + flightDir.x * (fwdOff + aftBias) + rightVec.x * rightOff,
          v.pos.y + flightDir.y * (fwdOff + aftBias) + upOff,
          v.pos.z + flightDir.z * (fwdOff + aftBias) + rightVec.z * rightOff
        );
        decoy.mesh.scale.setScalar(1);
        decoy.mesh.visible = true;
        if (decoy.mesh.parent !== this.scene) {
          this.scene.add(decoy.mesh);
        }

        const lateralSpeed = (15.5 + pIdx * 5.5 + Math.random() * 4.0) * side;
        const upSpeed = 4.5 + pIdx * 2.8 + Math.random() * 2.5;
        const fwdCarry = Math.max(22, (v.forwardSpeed || 58) * 0.86);
        decoy.vel.set(
          flightDir.x * fwdCarry + rightVec.x * lateralSpeed,
          flightDir.y * fwdCarry + upSpeed,
          flightDir.z * fwdCarry + rightVec.z * lateralSpeed
        );
        decoy.isB2 = Boolean(isB2);
        decoy.life = 2.1;
        decoy.maxLife = 2.1;
        decoy.smokeTimer = 0;

        this._activeFlareDecoys.push(decoy);
      }
    }

    if (this.world?.spawnDebris) {
      const puffFwd = v.aircraftRole === 'gunship' ? -9.0 : 1.5;
      const puffOut = v.aircraftRole === 'gunship' ? 6.4 : 3.2;
      for (const side of [-1, 1]) {
        const puffX = v.pos.x + flightDir.x * puffFwd + rightVec.x * side * puffOut;
        const puffY = v.pos.y + flightDir.y * puffFwd;
        const puffZ = v.pos.z + flightDir.z * puffFwd + rightVec.z * side * puffOut;
        this.world.spawnDebris(
          { x: puffX, y: puffY, z: puffZ },
          isB2 ? _colCyan : _colFlareGold,
          5
        );
      }
    }
  },

  /**
   * Updates all airborne 3D IR Flare & Chaff Decoy projectiles and trails smoke behind them.
   */
  updateAircraftCountermeasureVisuals(dt, v) {
    if (v && v.isAircraft && (v.flareActiveTimer || 0) > 0 && !v.dead) {
      v._cmSalvoBurstTimer = (v._cmSalvoBurstTimer || 0) - dt;
      if (v._cmSalvoBurstTimer <= 0) {
        v._cmSalvoBurstTimer = 0.22;
        this.spawnAircraftCountermeasureBurst(v, false);
      }
    }

    if (!Array.isArray(this._activeFlareDecoys) || this._activeFlareDecoys.length === 0) return;
    const dragMult = Math.pow(0.45, dt);
    for (let i = this._activeFlareDecoys.length - 1; i >= 0; i--) {
      const f = this._activeFlareDecoys[i];
      f.life -= dt;
      if (f.life <= 0 || !f.mesh) {
        if (f.mesh) {
          if (this.scene) this.scene.remove(f.mesh);
          f.mesh.visible = false;
          if (!this._flareDecoyPool) this._flareDecoyPool = [];
          if (this._flareDecoyPool.length < 32) {
            this._flareDecoyPool.push(f);
          } else if (f.haloMesh?.material && !f.haloMesh.material.userData?.shared) {
            f.haloMesh.material.dispose();
          }
        }
        this._activeFlareDecoys.splice(i, 1);
        continue;
      }
      f.vel.multiplyScalar(dragMult);
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
          f.mesh.position,
          f.isB2 ? _colFlareBlue : lifeRatio > 0.5 ? _colFlarePale : _colSmokeWhite,
          1
        );
      }
    }
  },

  /**
   * Evaluates whether an aircraft `v` is currently eligible for:
   * - `'TAKEOFF'`: On or taxiing at its friendly HQ Strategic Airbase (`altAgl < 6.5m`)
   * - `'LANDING'`: Airborne inside the friendly HQ Airbase ILS Approach Corridor (`altAgl <= 340m`, `dist <= 1950m`, low/med speed)
   */
  getRunwayAssistEligibility(v) {
    if (!v || !v.isAircraft || v.isHelicopter || v.dead || v.isShotDown) return null;
    const isUs = (v.team || this.team) !== 'RU';
    // Exact paved 3D asphalt runway coordinates matching `TerrainGenerator.js`:
    //   US West Runway: cx = -2735, cz = -68 (thresholds at x = -2903 & -2567, apron at z = -138)
    //   RU East Runway: cx = +2735, cz = +68 (thresholds at x = +2567 & +2903, apron at z = +138)
    const airbaseX = isUs ? -2735 : 2735;
    const runwayCz = isUs ? -68 : 68;
    const runwayY = this.world ? this.world.getGroundHeightAt(airbaseX, runwayCz) : 1.25;
    const gH = this.world ? this.world.getGroundHeightAt(v.pos.x, v.pos.z) : runwayY;
    const altAgl = v.pos.y - gH;
    const distToAirbase = Math.hypot(v.pos.x - airbaseX, v.pos.z - runwayCz);
    const maxSpd = v.maxSpeed || 96;
    const spd = Math.abs(v.forwardSpeed || 0);

    const onFriendlyGround =
      altAgl < 6.5 &&
      (isUs ? v.pos.x <= -2450 && v.pos.x >= -3020 : v.pos.x >= 2450 && v.pos.x <= 3020) &&
      Math.abs(v.pos.z - runwayCz) <= 135;

    // Track clean departure after takeoff so the Orange ILS Landing trail NEVER pops up right after lifting off!
    if (onFriendlyGround || v.autoFlightMode === 'TAKEOFF') {
      v._suppressLandingGuideUntilClear = true;
    } else if (v._suppressLandingGuideUntilClear && (distToAirbase > 950 || altAgl > 360)) {
      v._suppressLandingGuideUntilClear = false;
    }

    if (v.autoFlightMode === 'TAKEOFF') {
      // Immediately hide all takeoff guide lines as soon as wheels lift off the runway (`altAgl >= 11.5m`)!
      if (altAgl >= 11.5) return null;
      return { mode: 'TAKEOFF', active: true, isUs, airbaseX, runwayCz, runwayY, altAgl, distToAirbase };
    }
    if (v.autoFlightMode === 'LANDING') {
      return { mode: 'LANDING', active: true, isUs, airbaseX, runwayCz, runwayY, altAgl, distToAirbase };
    }
    if (onFriendlyGround) {
      return { mode: 'TAKEOFF', active: false, isUs, airbaseX, runwayCz, runwayY, altAgl, distToAirbase };
    }
    // ILS Approach Corridor: only shown when returning to the airport (NEVER during initial climb-out after takeoff!)
    const inApproachCorridor =
      !v._suppressLandingGuideUntilClear &&
      altAgl >= 6.5 &&
      altAgl <= 340 &&
      distToAirbase <= 1950 &&
      spd <= maxSpd * 0.9;
    if (inApproachCorridor) {
      return { mode: 'LANDING', active: false, isUs, airbaseX, runwayCz, runwayY, altAgl, distToAirbase };
    }
    return null;
  },

  /**
   * Universal `[R]` Aircraft Autopilot & Flight-Director Key:
   * 1. If Auto-Takeoff or ILS Auto-Land is currently active -> cancels back to Manual Control!
   * 2. If on the friendly HQ Runway / Apron -> engages hands-free 3D Auto-Takeoff & Climb-Out!
   * 3. If approaching friendly HQ Airport at low height & speed -> engages hands-free 3D ILS Auto-Land & Pit-Stop!
   * 4. Otherwise in open airspace -> toggles AC-130 Pylon Orbit (`gunship`) or LAAP Level-Hold Autopilot (`jets`).
   */
  handleAircraftRKey() {
    const v = this.activeVehicle;
    if (!v || !v.isAircraft || v.dead) return false;

    if (v.isHelicopter) {
      v.heliHoverHold = !v.heliHoverHold;
      if (v.heliHoverHold) {
        v.heliHoverAlt = v.pos.y;
      } else {
        this.yaw = v.yaw || this.yaw;
      }
      sound.playRadioBeep?.(true);
      if (this.onAwardXp) {
        const gH = this.world ? this.world.getGroundHeightAt(v.pos.x, v.pos.z) : 0;
        this.onAwardXp(
          0,
          v.heliHoverHold
            ? `🚁 [R] AUTO-HOVER HOLD ON (${Math.round(v.pos.y - gH)}M AGL) — POSITION LOCKED FOR SNIPING / FLIR GUNNER / [E] ROOFTOP INSERT!`
            : '🕹️ [R] AUTO-HOVER HOLD OFF — CYCLIC FLIGHT CONTROL ACTIVE!'
        );
      }
      return v.heliHoverHold ? 'HOVER_HOLD' : false;
    }

    if (v.autoFlightMode === 'TAKEOFF' || v.autoFlightMode === 'LANDING') {
      const prev = v.autoFlightMode;
      v.autoFlightMode = null;
      sound.playRadioBeep?.(false);
      if (this.onAwardXp) {
        this.onAwardXp(
          0,
          `🕹️ AUTO-${prev} DISENGAGED — MANUAL FLIGHT CONTROL RESTORED!`
        );
      }
      return false;
    }

    const elig = this.getRunwayAssistEligibility(v);
    if (elig && elig.mode === 'TAKEOFF') {
      v.autoFlightMode = 'TAKEOFF';
      v.levelAutopilot = false;
      if (v.aircraftRole === 'gunship') {
        v.gunshipManualFlight = true;
      }
      v.throttle = Math.max(v.throttle || 0, 0.55);
      sound.playRadioBeep?.(true);
      if (this.onAwardXp) {
        this.onAwardXp(
          0,
          '🛫 [R] AUTO-TAKEOFF ENGAGED — ALIGNING RUNWAY CENTERLINE, SPOOLING AFTERBURNER & CLIMBING SKY-GATES! ([R] CANCEL)'
        );
      }
      return 'TAKEOFF';
    }

    if (elig && elig.mode === 'LANDING') {
      v.autoFlightMode = 'LANDING';
      v.levelAutopilot = false;
      v.spiTargetPos = null;
      if (v.aircraftRole === 'gunship') {
        v.gunshipManualFlight = true;
        if (this.vehicleCameraMode === 'OPTIC_NOSE') {
          this.vehicleCameraMode = 'CHASE_3P';
          this.thirdPersonVehicle = true;
        }
      }
      sound.playRadioBeep?.(true);
      if (this.onAwardXp) {
        this.onAwardXp(
          0,
          '🛬 [R] ILS AUTO-LANDING ENGAGED — INTERCEPTING GLIDESLOPE CORRIDOR TO HQ RUNWAY PIT-STOP! ([R] CANCEL)'
        );
      }
      return 'LANDING';
    }

    if (v.aircraftRole === 'gunship') {
      return this.toggleGunshipFlightMode?.();
    }
    return this.toggleAircraftLevelAutopilot?.();
  },

  /**
   * Builds & updates the 3D Holographic Takeoff Climb Trail & ILS Landing Glideslope Corridor + Sky-Gates
   * so pilots see a crystal-clear 3D flight path and can press `[R]` to auto-takeoff or auto-land!
   */
  updateRunwayFlightDirector(v) {
    if (!this.scene) return;
    const elig = this.getRunwayAssistEligibility(v);
    if (!elig) {
      if (this._runwayAssistVisGroup) this._runwayAssistVisGroup.visible = false;
      return;
    }

    if (!this._runwayAssistVisGroup) {
      const grp = new THREE.Group();
      const pathSegs = 40;
      const pathGeo = new THREE.BufferGeometry();
      pathGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((pathSegs + 1) * 3), 3));
      const pathMat = new THREE.LineBasicMaterial({
        color: 0x00ffaa,
        transparent: true,
        opacity: 0.92
      });
      const pathLine = new THREE.Line(pathGeo, pathMat);
      pathLine.frustumCulled = false;
      grp.add(pathLine);

      // 5 Glowing 3D Flight-Director Sky-Gate Rings along the Takeoff / ILS Glideslope Trail
      const gates = [];
      const gateGeo = new THREE.RingGeometry(8.5, 10.2, 4);
      const gateMat = new THREE.MeshBasicMaterial({
        color: 0x00d2d3,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.78,
        depthWrite: false
      });
      for (let gi = 0; gi < 5; gi++) {
        const gm = new THREE.Mesh(gateGeo, gateMat);
        gm.frustumCulled = false;
        grp.add(gm);
        gates.push(gm);
      }

      // Touchdown / Liftoff Target Ring + Crosshair on the Runway Centerline
      const tdRingGeo = new THREE.RingGeometry(6.5, 9.2, 24);
      tdRingGeo.rotateX(-Math.PI / 2);
      const tdMat = new THREE.MeshBasicMaterial({
        color: 0xffd32a,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.86,
        depthWrite: false
      });
      const tdRing = new THREE.Mesh(tdRingGeo, tdMat);
      tdRing.frustumCulled = false;
      grp.add(tdRing);

      grp.userData = { pathLine, pathMat, gates, gateMat, tdRing, tdMat, pathSegs };
      this.scene.add(grp);
      this._runwayAssistVisGroup = grp;
    }

    const grp = this._runwayAssistVisGroup;
    grp.visible = true;
    const { pathLine, pathMat, gates, gateMat, tdRing, tdMat, pathSegs } = grp.userData;
    const { mode, active, isUs, airbaseX, runwayCz, runwayY } = elig;
    const colHex = active ? 0x2ecc71 : mode === 'TAKEOFF' ? 0x00d2d3 : 0xffbe0b;
    pathMat.color.setHex(colHex);
    gateMat.color.setHex(colHex);
    gateMat.opacity = active ? 0.88 : 0.65;
    tdMat.color.setHex(active ? 0x2ecc71 : 0xffd32a);

    const posArr = pathLine.geometry.attributes.position.array;
    const outDirX = isUs ? 1 : -1; // Direction from Rear Airbase out toward Battlefield

    if (mode === 'TAKEOFF') {
      const rotX = airbaseX + outDirX * 165; // Exact liftoff end of the 360m paved runway (`cz = ∓68`)
      const climbEndX = airbaseX + outDirX * 860;
      const climbTopY = runwayY + (v.aircraftRole === 'gunship' ? 210 : 155);
      tdRing.position.set(rotX, runwayY + 0.55, runwayCz);

      for (let i = 0; i <= pathSegs; i++) {
        const t = i / pathSegs;
        let px, py, pz;
        if (t <= 0.45) {
          const u = t / 0.45;
          px = THREE.MathUtils.lerp(v.pos.x, rotX, u);
          // Smooth S-curve merge from side apron (`z = ±138`) directly onto the paved `z = ±68` runway centerline!
          const merge = 1 - Math.pow(1 - u, 2.2);
          pz = THREE.MathUtils.lerp(v.pos.z, runwayCz, merge);
          py = runwayY + 1.1 + (u > 0.82 ? (u - 0.82) * 18 : 0);
        } else {
          const u = (t - 0.45) / 0.55;
          px = THREE.MathUtils.lerp(rotX, climbEndX, u);
          pz = runwayCz;
          py = THREE.MathUtils.lerp(runwayY + 4.3, climbTopY, Math.pow(u, 1.12));
        }
        const idx = i * 3;
        posArr[idx] = px;
        posArr[idx + 1] = py;
        posArr[idx + 2] = pz;
      }

      const gateTs = [0.35, 0.52, 0.68, 0.84, 0.98];
      for (let gi = 0; gi < gates.length; gi++) {
        const sIdx = Math.min(pathSegs, Math.round(gateTs[gi] * pathSegs)) * 3;
        const gm = gates[gi];
        gm.visible = true;
        gm.position.set(posArr[sIdx], posArr[sIdx + 1] + 2.2, posArr[sIdx + 2]);
        gm.rotation.set(0, Math.PI / 2, Math.PI / 4);
      }
    } else {
      // BI-DIRECTIONAL ILS LANDING GLIDESLOPE ONTO THE PAVED ASPHALT RUNWAY (`cx = ∓2735, cz = ∓68`):
      // Picks whichever runway piano-key threshold (`airbaseX - 156` West or `airbaseX + 156` East) is in front of the approach
      // so approaching from EITHER side curves smoothly onto the paved centerline with ZERO backward V-turn!
      if (!active || typeof v._lockedLandDirX !== 'number') {
        v._lockedLandDirX = v.pos.x < airbaseX ? 1 : -1;
      }
      const landDirX = v._lockedLandDirX; // +1 = landing Eastbound, -1 = landing Westbound
      const threshX = airbaseX - landDirX * 156;
      const stopX = airbaseX + landDirX * 135;
      tdRing.position.set(threshX + landDirX * 32, runwayY + 0.55, runwayCz);

      if (!active && this.onAwardXp) {
        const nowMs = performance.now();
        if (nowMs - (v._lastIlsHintMs || 0) > 16000) {
          v._lastIlsHintMs = nowMs;
          this.onAwardXp(
            0,
            '🛬 ILS RUNWAY GLIDESLOPE READY — PRESS [R] FOR AUTOMATIC RUNWAY LANDING & PART REPAIR!'
          );
        }
      }

      // Cubic Hermite S-Curve from aircraft `(v.pos)` arriving dead-aligned (`(landDirX, 0, 0)`) at `(threshX, runwayY + 1.8, runwayCz)`!
      const beforeThreshDist = (threshX - v.pos.x) * landDirX;
      const alreadyOverRunway = beforeThreshDist <= 20 && Math.abs(v.pos.z - runwayCz) <= 35;
      const chordDist = Math.hypot(threshX - v.pos.x, runwayCz - v.pos.z);
      const handleLen = Math.min(chordDist * 0.48, 280);
      const noseX = -Math.sin(v.yaw || 0);
      const noseZ = -Math.cos(v.yaw || 0);
      const m0x = (noseX * 0.45 + landDirX * 0.55) * handleLen;
      const m0z = noseZ * 0.45 * handleLen;
      const m1x = landDirX * handleLen;
      const m1z = 0;

      for (let i = 0; i <= pathSegs; i++) {
        const t = i / pathSegs;
        let px, py, pz;
        if (alreadyOverRunway) {
          px = THREE.MathUtils.lerp(v.pos.x, stopX, t);
          pz = THREE.MathUtils.lerp(v.pos.z, runwayCz, Math.min(1, t * 2.2));
          py = THREE.MathUtils.lerp(v.pos.y, runwayY + 0.95, Math.min(1, t * 1.8));
        } else if (t <= 0.72) {
          const u = t / 0.72;
          const u2 = u * u;
          const u3 = u2 * u;
          const h00 = 2 * u3 - 3 * u2 + 1;
          const h10 = u3 - 2 * u2 + u;
          const h01 = -2 * u3 + 3 * u2;
          const h11 = u3 - u2;
          px = h00 * v.pos.x + h10 * m0x + h01 * threshX + h11 * m1x;
          pz = h00 * v.pos.z + h10 * m0z + h01 * runwayCz + h11 * m1z;
          py = THREE.MathUtils.lerp(v.pos.y, runwayY + 1.8, u);
        } else {
          const u = (t - 0.72) / 0.28;
          px = THREE.MathUtils.lerp(threshX, stopX, u);
          pz = runwayCz;
          py = runwayY + 1.0;
        }
        const idx = i * 3;
        posArr[idx] = px;
        posArr[idx + 1] = py;
        posArr[idx + 2] = pz;
      }

      const gateTs = [0.22, 0.42, 0.62, 0.74, 0.88];
      for (let gi = 0; gi < gates.length; gi++) {
        const sIdx = Math.min(pathSegs, Math.round(gateTs[gi] * pathSegs)) * 3;
        const gm = gates[gi];
        gm.visible = !alreadyOverRunway && gi < 4;
        gm.position.set(posArr[sIdx], posArr[sIdx + 1] + 2.0, posArr[sIdx + 2]);
        // Orient each 3D gate perpendicular to the local path tangent!
        const nextIdx = Math.min(pathSegs * 3, sIdx + 3);
        const segYaw = Math.atan2(-(posArr[nextIdx] - posArr[sIdx]), -(posArr[nextIdx + 2] - posArr[sIdx + 2]));
        gm.rotation.set(0, segYaw, Math.PI / 4);
      }
    }
    pathLine.geometry.attributes.position.needsUpdate = true;
  },

  /**
   * [R] Key on Fixed-Wing Jets / CAS (A-10C, Su-25, F-15EX, Su-57, B-2):
   * Toggles DCS-style LAAP Level-Hold Autopilot so the plane holds altitude & wings-level
   * while the mouse freely looks/slews down (-85°..+77°) to spot & align ground runs!
   * ([A/D] gently steers heading; [Q/Z] or [↑/↓] trims altitude; [R] returns to manual flight).
   */
  toggleAircraftLevelAutopilot(forceState) {
    const v = this.activeVehicle;
    if (!v || !v.isAircraft || v.aircraftRole === 'gunship' || v.dead) return false;
    const gH = this.world ? this.world.getGroundHeightAt(v.pos.x, v.pos.z) : 0;
    const next = typeof forceState === 'boolean' ? forceState : !v.levelAutopilot;
    v.levelAutopilot = next;
    sound.playRadioBeep?.(true);
    if (next) {
      v.autopilotHoldAlt = Math.max(v.pos.y, gH + 38);
      v.freeLookYaw = 0;
      v.freeLookPitch = THREE.MathUtils.clamp((this.pitch || 0) - (v.pitch || 0), -1.2, 0.4);
      if (this.onAwardXp) {
        this.onAwardXp(
          0,
          `🛫 LAAP LEVEL-HOLD AUTOPILOT ON (${Math.round(v.autopilotHoldAlt - gH)}M AGL) — MOUSE LOOKS FREELY DOWN! ([A/D] TURN • [Q/Z] ALT • [R] OFF)`
        );
      }
    } else {
      this.yaw = v.yaw || this.yaw;
      this.pitch = THREE.MathUtils.clamp(v.pitch || 0, -1.1, 1.1);
      v.freeLookYaw = 0;
      v.freeLookPitch = 0;
      if (this.onAwardXp) {
        this.onAwardXp(0, '🕹️ MANUAL FLIGHT CONTROL RESTORED ([ALT] FREE-LOOK • [R] LEVEL AUTOPILOT)');
      }
    }
    return next;
  },

  /**
   * [F] Key on Fixed-Wing Jets / CAS:
   * Toggles War Thunder / DCS Sight Stabilization (`◆ TGP SPI`) locking camera/weapons onto the ground point under crosshair!
   */
  toggleAircraftSpiLock() {
    const v = this.activeVehicle;
    if (!v || !v.isAircraft || v.aircraftRole === 'gunship' || v.dead) return false;
    if (v.spiTargetPos) {
      v.spiTargetPos = null;
      sound.playEmptyClick?.();
      if (this.onAwardXp) {
        this.onAwardXp(0, '🔓 TGP SIGHT STABILIZATION CLEARED');
      }
      return false;
    }
    const camOrigin = this.camera
      ? this.camera.getWorldPosition(new THREE.Vector3())
      : v.pos.clone();
    const camDir = this.camera
      ? new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize()
      : new THREE.Vector3(-Math.sin(this.yaw || 0), Math.sin(this.pitch || 0), -Math.cos(this.yaw || 0)).normalize();
    const hit = this.computeVehicleAimTarget(camOrigin, camDir, v, 2400);
    v.spiTargetPos = hit.point.clone();
    sound.playRadioBeep?.(true);
    if (this.onAwardXp) {
      this.onAwardXp(
        0,
        `◆ TGP SPI GROUND POINT LOCKED (${Math.round(hit.distance)}M) — SIGHT STABILIZED ([F] UNLOCK • [R] LEVEL AP)!`
      );
    }
    return true;
  },

  /**
   * Toggles Aircraft Flight Assist & Collision Avoidance (`[G]`):
   * - `true` (DEFAULT: AUTO ON — Easy Flight: terrain/building auto pull-up + upright bank/pitch limiter, cannot flip upside-down!)
   * - `false` (OFF: ADVANCED AEROBATICS & REALISTIC CRASH — unlocks full 360° barrel rolls, loops & sustained upside-down flight, plus realistic ground/building crash!)
   */
  toggleAircraftCollisionAvoidance(forceVal) {
    if (typeof forceVal === 'boolean') {
      this.aircraftCollisionAvoidance = forceVal;
    } else {
      this.aircraftCollisionAvoidance = this.aircraftCollisionAvoidance === false;
    }
    if (this.aircraftCollisionAvoidance) {
      this.pitch = THREE.MathUtils.clamp(this.pitch || 0, -1.08, 1.08);
    }
    try {
      localStorage.setItem(
        'bb_aircraft_collision_avoidance_v2',
        this.aircraftCollisionAvoidance ? '1' : '0'
      );
    } catch (_) {}
    return this.aircraftCollisionAvoidance;
  },

  /**
   * Returns the highest obstacle Y (terrain + any standing building/tower/castle voxels up to 155m!) at (wx, wz).
   */
  getAircraftObstacleHeightAt(wx, wz, aircraftY = 0) {
    const terrY = this.world ? this.world.getGroundHeightAt(wx, wz) : 0;
    if (!this.world || !this.world.voxels) return terrY;
    if (aircraftY > 175.0 && Math.abs(wx) < 2000 && Math.abs(wz) < 1300) {
      return terrY;
    }
    if (this.vehicleManager && typeof this.vehicleManager.getAircraftSupportHeightAt === 'function') {
      return this.vehicleManager.getAircraftSupportHeightAt(wx, wz, 175.0, false);
    }
    let maxY = terrY;
    const platforms = this.world.elevatedPlatforms;
    if (Array.isArray(platforms) && platforms.length > 0) {
      for (let i = 0; i < platforms.length; i++) {
        const p = platforms[i];
        if (wx >= p.minX && wx <= p.maxX && wz >= p.minZ && wz <= p.maxZ && p.topY > maxY) {
          maxY = p.topY;
        }
      }
    }
    const g = this.world.worldToGrid(wx, terrY + 0.5, wz, _tmpGrid);
    const gx = g.gx;
    const baseGy = g.gy;
    const gz = g.gz;
    for (let dy = 0; dy <= 122; dy++) {
      const vox = this.world.getVoxel(gx, baseGy + dy, gz);
      if (vox && !vox.isProp) {
        const top = vox.maxY ?? terrY + (dy + 1) * 1.25;
        if (top > maxY) maxY = top;
      }
    }
    return maxY;
  },

  /**
   * Samples 5-point helicopter skid/gear support height (center + 4 landing skids) so helicopters
   * land and stay solidly parked on tall Downtown FOB C skyscraper roofs without ever falling through
   * roof stairwell cutouts or edges!
   */
  getHeliSupportHeightAt(wx, wz, refMaxY = 160) {
    if (this.vehicleManager && typeof this.vehicleManager.getAircraftSupportHeightAt === 'function') {
      return this.vehicleManager.getAircraftSupportHeightAt(wx, wz, refMaxY, true);
    }
    const groundH = this.world ? this.world.getGroundHeightAt(wx, wz) : 0;
    let bestY = Math.max(groundH, this.getAircraftObstacleHeightAt(wx, wz, refMaxY));
    for (const [sxOff, szOff] of [
      [1.5, 1.7],
      [-1.5, 1.7],
      [1.5, -1.7],
      [-1.5, -1.7]
    ]) {
      const sampleY = this.getAircraftObstacleHeightAt(wx + sxOff, wz + szOff, refMaxY);
      if (sampleY > bestY && sampleY <= refMaxY) {
        bestY = sampleY;
      }
    }
    return bestY;
  },

  /**
   * Checks if any part of the 3D aircraft airframe (nose, fuselage, tail, left/right wingtips)
   * is intersecting a solid building, castle wall, tower, or container voxel at `pos`.
   */
  checkAircraftStructureCollision(v, pos, flightDir) {
    if (!this.world || !this.world.voxels) return null;
    if (pos.y > 130.0 && Math.abs(pos.x) < 2000 && Math.abs(pos.z) < 1300) {
      return null;
    }
    const rightX = Math.cos(v.yaw || 0);
    const rightZ = -Math.sin(v.yaw || 0);
    const wingSpan = v.isHelicopter ? 3.5 : v.aircraftRole === 'b2_spirit' ? 6.5 : 4.2;
    const wingSin = Math.sin(v.roll || 0) * wingSpan;

    for (let i = 0; i < 5; i++) {
      let px, py, pz;
      if (i === 0) {
        px = pos.x + flightDir.x * 4.5;
        py = pos.y + flightDir.y * 4.5;
        pz = pos.z + flightDir.z * 4.5;
      } else if (i === 1) {
        px = pos.x;
        py = pos.y;
        pz = pos.z;
      } else if (i === 2) {
        px = pos.x - flightDir.x * 3.2;
        py = pos.y - flightDir.y * 3.2;
        pz = pos.z - flightDir.z * 3.2;
      } else if (i === 3) {
        px = pos.x + rightX * wingSpan;
        py = pos.y + wingSin;
        pz = pos.z + rightZ * wingSpan;
      } else {
        px = pos.x - rightX * wingSpan;
        py = pos.y - wingSin;
        pz = pos.z - rightZ * wingSpan;
      }
      const g = this.world.worldToGrid(px, py, pz, _tmpGrid);
      const hitVox = this.world.getVoxel(g.gx, g.gy, g.gz);
      if (hitVox && !hitVox.isProp) {
        return {
          point: new THREE.Vector3(px, py, pz),
          voxel: hitVox,
          grid: { gx: g.gx, gy: g.gy, gz: g.gz }
        };
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

    // Passive Airframe Self-Sealing: capped in mid-air by structural subsystem integrity (`v.airframeParts`)
    // so `v.hp` never falsely climbs to 100% while wings/engines/tail are damaged (full 100% requires HQ Runway Pit-Stop or [X] ECM)!
    const airRegen = v.passiveRegenPerSec || (this.role === 'pilot' ? 25 : 8);
    let maxFieldRegenHp = v.maxHp;
    if (v.airframeParts && !v.inRearmZone) {
      const ap = v.airframeParts;
      const partsVals = [
        ap.avionics ?? 100,
        ap.cockpit ?? 100,
        ap.leftWing ?? 100,
        ap.rightWing ?? 100,
        ap.engines ?? 100,
        ap.tail ?? 100
      ];
      const avgP = partsVals.reduce((s, x) => s + x, 0) / partsVals.length;
      const minP = Math.min(...partsVals);
      const structFrac = THREE.MathUtils.clamp((avgP * 0.62 + minP * 0.38) / 100, 0.25, 1.0);
      maxFieldRegenHp = Math.round(v.maxHp * structFrac);
    }
    if (v.hp < maxFieldRegenHp) {
      v.hp = Math.min(maxFieldRegenHp, v.hp + airRegen * dt);
    }
    if (
      Boolean(v.hasExplicitAutoDircmPod) &&
      (v.flareCooldown || 0) <= 0 &&
      this.world &&
      Array.isArray(this.world.projectiles)
    ) {
      for (const p of this.world.projectiles) {
        if (p.type === 'a2a_missile' && p.targetVehicle === v && p.mesh) {
          if (p.mesh.position.distanceToSquared(v.pos) < 185 * 185) {
            v.flareActiveTimer = 3.2;
            v.flareCooldown = 15.0 * (v.customFlareCdMult || 1.0);
            p.targetVehicle = null;
            this.spawnAircraftCountermeasureBurst?.(v, true);
            v._cmSalvoBurstTimer = 0.18;
            if (this.onAwardXp) {
              this.onAwardXp(25, '✨ AN/ALQ-184 AUTO-DIRCM POD SPOOFED INCOMING MISSILE!');
            }
            break;
          }
        }
      }
    }
    if ((v.flareActiveTimer || 0) > 2.6 && !v._patchedAirframeThisCm && v.airframeParts) {
      v._patchedAirframeThisCm = true;
      for (const pk of ['leftWing', 'rightWing', 'engines', 'tail', 'avionics', 'cockpit']) {
        v.airframeParts[pk] = Math.min(100, (v.airframeParts[pk] ?? 100) + 22);
      }
    } else if ((v.flareActiveTimer || 0) <= 0.1) {
      v._patchedAirframeThisCm = false;
    }
    this.updateAircraftCountermeasureVisuals?.(dt, v);

    const isWright = v.aircraftRole === 'wright_flyer';
    const roleKey = v.aircraftRole || 'fighter';
    if (roleKey === 'heli_transport' || roleKey === 'heli_attack') {
      v.isHelicopter = true;
    }
    const cruiseSpd = v.speed || 62;
    const minSpd = v.minSpeed || 32;
    const maxSpd = v.maxSpeed || 96;
    const groundH = this.world ? this.world.getGroundHeightAt(v.pos.x, v.pos.z) : 0;
    const altAgl = v.pos.y - groundH;
    const onRunway = altAgl < 2.2;
    const maxAirspaceAlt =
      VEHICLE_STATS.SERVICE_CEILINGS?.[roleKey] ||
      v.serviceCeilingM ||
      VEHICLE_STATS.AIRSPACE_MAX_ALT ||
      19800;
    const thinAirCeilFactor =
      altAgl > maxAirspaceAlt * 0.88
        ? THREE.MathUtils.clamp(1.0 - (altAgl - maxAirspaceAlt * 0.88) / (maxAirspaceAlt * 0.14), 0.18, 1.0)
        : 1.0;

    // Dynamically adjust camera.near at extreme altitudes so the 24-bit depth buffer stays crisp up to 68km!
    const desiredAirNear = altAgl > 1800 ? 1.25 : 0.42;
    if (this.camera && Math.abs(this.camera.near - desiredAirNear) > 0.05) {
      this.camera.near = desiredAirNear;
      this.camera.updateProjectionMatrix();
    }

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
      if ((v.sensorGlitchTimer || 0) > 0) {
        v.sensorGlitchTimer = Math.max(0, v.sensorGlitchTimer - dt);
      }
      if ((v.opticsGlitchTimer || 0) > 0) {
        v.opticsGlitchTimer = Math.max(0, v.opticsGlitchTimer - dt);
      }
      v.mesh.position.copy(v.pos);
      _airQuatYaw.setFromAxisAngle(_axisY, v.yaw || 0);
      _airQuatPitch.setFromAxisAngle(_axisX, v.pitch || 0);
      _airQuatRoll.setFromAxisAngle(_axisZ, v.roll || 0);
      _airQuatCombined.copy(_airQuatYaw).multiply(_airQuatPitch).multiply(_airQuatRoll);
      v.mesh.quaternion.copy(_airQuatCombined);
      this.pos.copy(v.pos);
    } else if (v.isHelicopter) {
      // =========================================================================
      // DUAL-MODE 3D ROTORCRAFT FLIGHT ARCHITECTURE (TOGGLED LIVE VIA [G]):
      // 1. EASY / TACTICAL STABILIZED MODE (`[G]` ON — Default, Warzone / War Thunder Pointer-Aim style):
      //    - Separate Engine Lift vs. Horizontal Direction:
      //        * `[Space / Q / ↑ / PgUp]` = Collective Lift UP (Takeoff & Climb)
      //        * `[Left Ctrl / Z / ↓ / PgDn]` = Collective Lift DOWN (Cushioned Descent & Land)
      //        * `[W / S / A / D]` = Horizontal Forward / Backward / Strafe Left / Strafe Right (`[Shift]` Speed Boost)
      //    - 100% Decoupled Gun Aiming: Moving the mouse (`this.yaw`, `this.pitch`) aims the M134 / 30mm / Rockets
      //      freely up or down WITHOUT tilting the helicopter or altering flight speed/altitude!
      // 2. HARD / REALISTIC CYCLIC SIMULATOR MODE (`[G]` OFF — Arma 3 / Squad / BF4 style):
      //    - `[W / S]` (or `[Space / Ctrl]`) = Main-Rotor Collective Pitch & Power
      //    - Mouse Pitch & Roll = Direct Cyclic Rotor-Disk Tilt (tilting nose down trades vertical lift for speed!)
      //    - `[A / D]` = Anti-Torque Tail-Rotor Pedals + realistic hard-impact & wall crash physics!
      // =========================================================================
      v.isStalling = false;
      v.stallSinkVel = 0;
      const isHeliEasyMode = this.aircraftCollisionAvoidance !== false;
      const apH = v.airframeParts || null;
      const engFracH = apH ? THREE.MathUtils.clamp((apH.engines ?? 100) / 100, 0.25, 1) : 1.0;
      const tailFracH = apH ? THREE.MathUtils.clamp((apH.tail ?? 100) / 100, 0.35, 1) : 1.0;

      // If riding as a Passenger / Door-Gunner (`[F2+]`) in an AI Airlift Helicopter, let `stepAiHeliRide` fly!
      if (
        v.rideTask &&
        v.rideTask.active &&
        (this.vehicleSeatIndex || 0) >= 1 &&
        !v.remoteDriverId &&
        this.vehicleManager?.stepAiHeliRide
      ) {
        this.vehicleManager.stepAiHeliRide(v, dt, this);
        v.turretYaw = this.yaw;
        v.turretPitch = this.pitch;
        if ((v.sensorGlitchTimer || 0) > 0) v.sensorGlitchTimer = Math.max(0, v.sensorGlitchTimer - dt);
        if ((v.opticsGlitchTimer || 0) > 0) v.opticsGlitchTimer = Math.max(0, v.opticsGlitchTimer - dt);
        _airQuatYaw.setFromAxisAngle(_axisY, v.yaw || 0);
        _airQuatPitch.setFromAxisAngle(_axisX, v.pitch || 0);
        _airQuatRoll.setFromAxisAngle(_axisZ, v.roll || 0);
        _airQuatCombined.copy(_airQuatYaw).multiply(_airQuatPitch).multiply(_airQuatRoll);
        v.mesh.position.copy(v.pos);
        v.mesh.quaternion.copy(_airQuatCombined);
        this.pos.copy(v.pos);
      } else {
      // Sample support height across center + landing skids/wheels so rooftop touchdowns are rock-solid
      const heliSupportY = this.getHeliSupportHeightAt(v.pos.x, v.pos.z, v.pos.y + 3.5);
      const onPadOrRoof = v.pos.y <= heliSupportY + 0.55;
      const isHeliPilot = (this.vehicleSeatIndex || 0) === 0 && !v.remoteDriverId;
      if (!isHeliPilot && !v.remoteDriverId && !onPadOrRoof) {
        v.heliHoverHold = true;
        if (typeof v.heliHoverAlt !== 'number') v.heliHoverAlt = v.pos.y;
      }

      const dedicatedClimbInput =
        (this.keys['Space'] || this.keys['KeyQ'] || this.keys['ArrowUp'] || this.keys['Equal'] || this.keys['PageUp'] ? 1 : 0) -
        (this.keys['ControlLeft'] || this.keys['ControlRight'] || this.keys['KeyZ'] || this.keys['ArrowDown'] || this.keys['Minus'] || this.keys['PageDown'] ? 1 : 0);
      const forwardCruiseBoost = Boolean(isHeliPilot && (this.keys['ShiftLeft'] || this.keys['ShiftRight']));

      if (typeof v._heliVelX !== 'number') v._heliVelX = 0;
      if (typeof v._heliVelY !== 'number') v._heliVelY = 0;
      if (typeof v._heliVelZ !== 'number') v._heliVelZ = 0;
      if (typeof v._heliPitchRate !== 'number') v._heliPitchRate = 0;
      if (typeof v._heliRollRate !== 'number') v._heliRollRate = 0;
      if (typeof v._heliYawRate !== 'number') v._heliYawRate = 0;
      if (typeof v._heliRotorThrust !== 'number') v._heliRotorThrust = onPadOrRoof ? 8.2 : 9.81;
      if (typeof v.heliHoverAlt !== 'number') v.heliHoverAlt = v.pos.y;

      const GRAVITY_G = 9.81;
      const isRuHeli = v.team === 'RU';
      const isAttackHeli = v.aircraftRole === 'heli_attack';
      const airframeClimbSpec =
        v.climbRateMs ||
        (isAttackHeli ? (isRuHeli ? 14.2 : 12.7) : isRuHeli ? 9.4 : 11.2);
      const dashFwdTiltMag =
        v.maxFwdTiltRad ||
        (isAttackHeli ? (isRuHeli ? 0.53 : 0.51) : isRuHeli ? 0.40 : 0.46);
      const yawAuthMult =
        v.yawAuthorityMult ||
        (isAttackHeli ? (isRuHeli ? 1.24 : 1.08) : isRuHeli ? 0.88 : 1.0);
      const rollAgilityMult =
        v.rollAgilityMult ||
        (isAttackHeli ? (isRuHeli ? 1.18 : 1.15) : isRuHeli ? 0.88 : 1.0);
      const engPowerScale = 0.55 + 0.45 * engFracH;
      const ratedCruiseSpd = (v.speed || (isAttackHeli ? 74.0 : 68.0)) * engPowerScale;
      const ratedMaxLevelSpd =
        (v.maxSpeed || (v.speed || 68.0) * 1.2) * engPowerScale;
      const effHeliTargetSpd = forwardCruiseBoost ? ratedMaxLevelSpd : ratedCruiseSpd;

      // Exact Analytic Parasitic Drag Equilibrium with 12% Turbine Power Margin at V_max:
      // Guarantees every helicopter reaches its real-world cruise speed (`[W]`) AND rated max level speed (`[Shift+W]`)!
      const peakDashPropAccel = GRAVITY_G * Math.tan(dashFwdTiltMag);
      const vMaxSafe = Math.max(35.0, ratedMaxLevelSpd);
      const heliLinDragCoeff = (0.09 * peakDashPropAccel) / vMaxSafe;
      const heliQuadDragCoeff = (0.69 * peakDashPropAccel) / (vMaxSafe * vMaxSafe);

      const maxClimbMs = airframeClimbSpec * engFracH * thinAirCeilFactor;
      const maxRotorThrust =
        GRAVITY_G + (4.8 + airframeClimbSpec * 0.22) * engFracH * thinAirCeilFactor;
      const heightAbovePad = Math.max(0, v.pos.y - heliSupportY);
      const effHeliMaxSpd = effHeliTargetSpd;
      let collectiveInput = 0;
      let cmdPitch = 0;
      let cmdRoll = 0;
      let reqRotorThrust = GRAVITY_G;
      let hasHorizInput = false;

      // Current body-frame horizontal velocity components (momentum in world airmass)
      const preFwdX = -Math.sin(v.yaw || 0);
      const preFwdZ = -Math.cos(v.yaw || 0);
      const preRightX = Math.cos(v.yaw || 0);
      const preRightZ = -Math.sin(v.yaw || 0);
      const preFwdSpd = v._heliVelX * preFwdX + v._heliVelZ * preFwdZ;
      const preRightSpd = v._heliVelX * preRightX + v._heliVelZ * preRightZ;
      const preHorizSpd = Math.hypot(v._heliVelX, v._heliVelZ);

      // Aerodynamic translational flare inflow: pitching nose-up at forward speed temporarily balloons rotor lift
      const flareLiftAccel =
        preFwdSpd > 9.0 && (v.pitch || 0) > 0.05
          ? Math.min(2.2, (preFwdSpd - 9.0) * Math.sin(Math.max(0, v.pitch || 0)) * 0.16)
          : 0;

      if (isHeliEasyMode) {
        // ─── MODE 1: EASY / AFCS FLY-BY-WIRE MODE ([G] ON) ────────────────────
        // True Sikorsky DAFCS-style Fly-By-Wire:
        // - Separate Collective (`[Space/Q]` Climb, `[Ctrl/Z]` Land) & Horizontal (`WASD`),
        //   with 100% decoupled Mouse Gun Aiming (`this.yaw`, `this.pitch` NEVER tilt cyclic!).
        // - OBEYS 100% REAL NEWTONIAN ROTOR PHYSICS: `WASD` commands bounded AFCS cyclic tilt
        //   (`cmdPitch`, `cmdRoll`), NOT direct velocity! Acceleration, turns, coasting, and
        //   nose-up flare braking are strictly limited by 9-ton mass, rotational hub inertia,
        //   tilted rotor thrust `-T/m * sin(tilt)`, and quadratic air drag!
        collectiveInput = isHeliPilot ? dedicatedClimbInput : 0;
        const moveFwd = isHeliPilot && !v.heliHoverHold ? throttleInput : 0; // KeyW (+1) / KeyS (-1)
        const moveRight = isHeliPilot && !v.heliHoverHold ? -bankInput : 0;  // KeyD (+1) / KeyA (-1)
        hasHorizInput = moveFwd !== 0 || moveRight !== 0;

        // Convenience liftoff clearance: pressing [W] while parked gently lifts skids ~4m clear of ground clutter
        if (onPadOrRoof && moveFwd > 0 && collectiveInput === 0) {
          v.heliHoverAlt = Math.max(v.heliHoverAlt, heliSupportY + 4.0);
        }

        // 1. Tail-Rotor Yaw with Rotational Inertia & High-Speed Weathercock Stability
        const freeLookHeld = Boolean(this.keys['AltLeft'] || this.keys['AltRight']);
        let desYawRate = 0;
        if (isHeliPilot && !v.heliHoverHold && !freeLookHeld && !(onPadOrRoof && !hasHorizInput && collectiveInput <= 0)) {
          let yawErr = (this.yaw || 0) - (v.yaw || 0);
          while (yawErr > Math.PI) yawErr -= Math.PI * 2;
          while (yawErr < -Math.PI) yawErr += Math.PI * 2;
          const weathercockScale = v.isCoaxialHeli ? 0.88 : 1.0 / (1.0 + preHorizSpd / 62.0);
          desYawRate =
            THREE.MathUtils.clamp(yawErr * 1.85, -1.32, 1.32) *
            yawAuthMult *
            tailFracH *
            (0.46 + 0.54 * weathercockScale);
        }
        const maxYawAccel = (onPadOrRoof && collectiveInput <= 0 ? 4.8 : 2.55) * yawAuthMult * tailFracH;
        v._heliYawRate += THREE.MathUtils.clamp(
          desYawRate - v._heliYawRate,
          -maxYawAccel * dt,
          maxYawAccel * dt
        );
        v.yaw = (v.yaw || 0) + v._heliYawRate * dt;

        // 2. AFCS Cyclic Pitch & Roll Command (Bounded Envelope Protection + Nose-Up Flare Braking)
        if (moveFwd >= 0) {
          v._heliFlareBraking = false;
          v._heliRevPause = 0;
        } else if (preFwdSpd > 2.4) {
          // Pulling [S] while moving forward engages Nose-Up Quick-Stop Flare first rather than instant reverse
          v._heliFlareBraking = true;
          v._heliRevPause = 0.32;
        } else if (v._heliFlareBraking) {
          v._heliRevPause = Math.max(0, (v._heliRevPause || 0) - dt);
          if (v._heliRevPause <= 0) v._heliFlareBraking = false;
        }

        const isLandingFlare = collectiveInput < 0 && heightAbovePad < 14.0 && preHorizSpd > 1.8;
        if (onPadOrRoof && !hasHorizInput && collectiveInput <= 0) {
          cmdPitch = 0;
          cmdRoll = 0;
        } else if (!isHeliPilot || v.heliHoverHold || isLandingFlare) {
          // Active Auto-Hover [R] or Landing Auto-Flare: pitch nose UP (`+24°` max) against momentum vector
          cmdPitch = THREE.MathUtils.clamp(preFwdSpd * 0.046, -0.34, 0.42);
          cmdRoll = THREE.MathUtils.clamp(preRightSpd * 0.048, -0.42, 0.42);
        } else {
          // Longitudinal AFCS Cyclic (`cmdPitch`)
          if (moveFwd > 0) {
            const reqEqDrag =
              heliLinDragCoeff * effHeliTargetSpd +
              heliQuadDragCoeff * effHeliTargetSpd * effHeliTargetSpd;
            const eqCruisePitch = -Math.atan(reqEqDrag / GRAVITY_G);
            const maxFwdTilt = forwardCruiseBoost
              ? -dashFwdTiltMag
              : -Math.min(dashFwdTiltMag, Math.abs(eqCruisePitch) + 0.1);
            cmdPitch = THREE.MathUtils.clamp(
              eqCruisePitch - (effHeliTargetSpd - preFwdSpd) * 0.085,
              maxFwdTilt,
              0.38
            );
          } else if (moveFwd < 0) {
            if (v._heliFlareBraking || preFwdSpd > 1.2) {
              // Active pilot [S] Combat Flare: nose rears up to +26° (+0.46 rad) to bleed forward momentum!
              cmdPitch = THREE.MathUtils.clamp(0.18 + preFwdSpd * 0.048, 0.14, 0.46);
            } else {
              // Smooth reverse flight once forward speed has bled off (max ~58 km/h tail-down)
              const revCap = effHeliMaxSpd * 0.28;
              cmdPitch = THREE.MathUtils.clamp((revCap + preFwdSpd) * 0.028 + 0.07, -0.18, 0.22);
            }
          } else {
            // Hands-off coasting: gentle passenger-safe attitude stabilization (max ~9° soft flare — glides smoothly!)
            cmdPitch = THREE.MathUtils.clamp(preFwdSpd * 0.015, -0.15, 0.16);
          }

          // Lateral AFCS Cyclic (`cmdRoll`) + Coordinated Banking in Forward Turns
          const coordTurnBank =
            v._heliYawRate * THREE.MathUtils.clamp(preFwdSpd / 28.0, 0.12, 1.15) * 0.34;
          if (moveRight !== 0) {
            const targetRight = moveRight * effHeliMaxSpd * 0.62;
            cmdRoll = THREE.MathUtils.clamp(
              -(targetRight - preRightSpd) * 0.034 + coordTurnBank,
              -0.46,
              0.46
            );
          } else {
            const softLatFlare = THREE.MathUtils.clamp(preRightSpd * 0.02, -0.22, 0.22);
            cmdRoll = THREE.MathUtils.clamp(softLatFlare + coordTurnBank, -0.44, 0.44);
          }
        }

        // 3. AFCS Collective Governor (Computes Required Specific Rotor Thrust `T/m` Bounded by Engine Power)
        const softLandSinkCap = heightAbovePad < 6.0 ? -Math.max(1.4, heightAbovePad * 1.45) : -9.8;
        let desVelY = 0;
        if (collectiveInput > 0) {
          desVelY = maxClimbMs;
          v._heliClimbSettling = true;
          v.heliHoverAlt = v.pos.y;
        } else if (collectiveInput < 0) {
          desVelY = v.pos.y <= heliSupportY + 0.01 ? 0 : softLandSinkCap;
          v._heliClimbSettling = true;
          v.heliHoverAlt = Math.max(heliSupportY, v.pos.y);
        } else if (onPadOrRoof && !hasHorizInput) {
          desVelY = 0;
          v._heliClimbSettling = false;
          v.heliHoverAlt = heliSupportY;
        } else if (v._heliClimbSettling) {
          desVelY = 0;
          v.heliHoverAlt = Math.max(heliSupportY, v.pos.y);
          if (Math.abs(v._heliVelY) < 0.35) {
            v._heliClimbSettling = false;
          }
        } else {
          if (hasHorizInput && v.heliHoverAlt < heliSupportY + 3.2) {
            v.heliHoverAlt = heliSupportY + 3.5;
          }
          desVelY = THREE.MathUtils.clamp((v.heliHoverAlt - v.pos.y) * 2.1, -6.5, 7.2);
        }

        const desVertAccel = THREE.MathUtils.clamp((desVelY - v._heliVelY) * 2.5, -5.6, 6.4);
        const curVertCos = Math.max(0.42, Math.cos(v.pitch || 0) * Math.cos(v.roll || 0));
        const minRotorThrust = onPadOrRoof && collectiveInput <= 0 && !hasHorizInput ? 0 : 3.8;
        reqRotorThrust = THREE.MathUtils.clamp(
          (GRAVITY_G + desVertAccel - flareLiftAccel * 0.55) / curVertCos,
          minRotorThrust,
          maxRotorThrust
        );

        const isFlaringHard = (v.pitch || 0) > 0.2 && preFwdSpd > 8.0;
        v.throttle = THREE.MathUtils.lerp(
          v.throttle ?? 0.48,
          collectiveInput > 0
            ? 0.92
            : collectiveInput < 0 && !isFlaringHard
            ? 0.18
            : onPadOrRoof && !hasHorizInput
            ? 0.08
            : isFlaringHard
            ? 0.78
            : hasHorizInput
            ? 0.68
            : 0.48,
          Math.min(1, dt * 4.2)
        );
      } else {
        // ─── MODE 2: HARD / REALISTIC CYCLIC SIMULATOR MODE ([G] OFF) ────────
        // Unassisted Manual Collective (`[W/S]` or `[Space/Ctrl]`) + Direct Mouse Cyclic Swashplate
        // + `[A/D]` Anti-Torque Tail-Rotor Pedals running on the EXACT SAME Newtonian physics!
        collectiveInput = isHeliPilot
          ? throttleInput !== 0
            ? throttleInput
            : dedicatedClimbInput
          : 0;
        hasHorizInput = isHeliPilot && !v.heliHoverHold && !onPadOrRoof;

        let yawErr = (this.yaw || 0) - (v.yaw || 0);
        while (yawErr > Math.PI) yawErr -= Math.PI * 2;
        while (yawErr < -Math.PI) yawErr += Math.PI * 2;
        yawErr = THREE.MathUtils.clamp(yawErr, -1.35, 1.35);

        let desSimYawRate = 0;
        if (isHeliPilot && !(onPadOrRoof && collectiveInput <= 0)) {
          this.yaw = (v.yaw || 0) + yawErr;
          const pedalYawRate = bankInput * 1.55 * yawAuthMult * tailFracH;
          const coordTurnYaw = v.heliHoverHold
            ? 0
            : THREE.MathUtils.clamp(yawErr * 1.1, -1.12, 1.12) * yawAuthMult * tailFracH;
          desSimYawRate = pedalYawRate + coordTurnYaw;
        }
        const maxSimYawAccel = (onPadOrRoof && collectiveInput <= 0 ? 5.0 : 2.95) * yawAuthMult * tailFracH;
        v._heliYawRate += THREE.MathUtils.clamp(
          desSimYawRate - v._heliYawRate,
          -maxSimYawAccel * dt,
          maxSimYawAccel * dt
        );
        v.yaw = (v.yaw || 0) + v._heliYawRate * dt;
        if (isHeliPilot && bankInput !== 0 && !(onPadOrRoof && collectiveInput <= 0)) {
          this.yaw = (this.yaw || 0) + bankInput * 1.3 * yawAuthMult * tailFracH * dt;
        }

        if (onPadOrRoof && collectiveInput <= 0) {
          cmdPitch = 0;
          cmdRoll = 0;
          reqRotorThrust = 0;
        } else if (v.heliHoverHold || !isHeliPilot) {
          cmdPitch = THREE.MathUtils.clamp(preFwdSpd * 0.046, -0.34, 0.42);
          cmdRoll = THREE.MathUtils.clamp(preRightSpd * 0.048, -0.42, 0.42);
          const holdVelY = THREE.MathUtils.clamp((v.heliHoverAlt - v.pos.y) * 2.1, -6.5, 7.2);
          const holdAccY = THREE.MathUtils.clamp((holdVelY - v._heliVelY) * 2.5, -5.6, 6.4);
          const holdCos = Math.max(0.42, Math.cos(v.pitch || 0) * Math.cos(v.roll || 0));
          reqRotorThrust = THREE.MathUtils.clamp((GRAVITY_G + holdAccY) / holdCos, 3.8, maxRotorThrust);
        } else {
          cmdPitch = THREE.MathUtils.clamp(this.pitch || 0, -0.56, 0.48);
          cmdRoll = THREE.MathUtils.clamp(yawErr * 0.85 + bankInput * 0.18, -0.64, 0.64);
          if (collectiveInput > 0) {
            reqRotorThrust = maxRotorThrust;
            v.heliHoverAlt = v.pos.y;
          } else if (collectiveInput < 0) {
            reqRotorThrust = 3.6;
            v.heliHoverAlt = Math.max(heliSupportY, v.pos.y);
          } else {
            reqRotorThrust = GRAVITY_G * 1.01;
          }
        }

        v.throttle = THREE.MathUtils.lerp(
          v.throttle ?? 0.48,
          collectiveInput > 0 ? 0.94 : collectiveInput < 0 ? 0.15 : onPadOrRoof ? 0.06 : 0.54,
          Math.min(1, dt * 4.5)
        );
      }

      // ─── SHARED NEWTONIAN ROTORCRAFT DYNAMICS (BOTH EASY & HARD MODES) ──────
      // 1. Airframe Rotational Inertia (`I_xx`, `I_zz` hub torque slew — cannot snap pitch/roll in 1 frame!)
      const maxPitchRate = (isHeliEasyMode ? 1.08 : 1.48) * rollAgilityMult;
      const maxRollRate = (isHeliEasyMode ? 1.42 : 1.92) * rollAgilityMult;
      const maxPitchAccel = (onPadOrRoof && collectiveInput <= 0 ? 6.5 : 3.45) * rollAgilityMult;
      const maxRollAccel = (onPadOrRoof && collectiveInput <= 0 ? 7.0 : 4.5) * rollAgilityMult;

      const desPitchRate = THREE.MathUtils.clamp((cmdPitch - (v.pitch || 0)) * 3.6, -maxPitchRate, maxPitchRate);
      v._heliPitchRate += THREE.MathUtils.clamp(
        desPitchRate - v._heliPitchRate,
        -maxPitchAccel * dt,
        maxPitchAccel * dt
      );
      v.pitch = THREE.MathUtils.clamp((v.pitch || 0) + v._heliPitchRate * dt, -0.62, 0.52);

      const desRollRate = THREE.MathUtils.clamp((cmdRoll - (v.roll || 0)) * 4.0, -maxRollRate, maxRollRate);
      v._heliRollRate += THREE.MathUtils.clamp(
        desRollRate - v._heliRollRate,
        -maxRollAccel * dt,
        maxRollAccel * dt
      );
      v.roll = THREE.MathUtils.clamp((v.roll || 0) + v._heliRollRate * dt, -0.68, 0.68);

      // 2. Main-Rotor Collective Spool & 3D Thrust Vector Integration (`F = m*a`)
      v._heliRotorThrust = THREE.MathUtils.lerp(
        v._heliRotorThrust,
        reqRotorThrust,
        Math.min(1, dt * 4.4)
      );

      const noseFwdX = -Math.sin(v.yaw || 0);
      const noseFwdZ = -Math.cos(v.yaw || 0);
      const rightLatX = Math.cos(v.yaw || 0);
      const rightLatZ = -Math.sin(v.yaw || 0);

      const vertLiftCos = Math.max(0.35, Math.cos(v.pitch) * Math.cos(v.roll));
      const vertInflowDrag = -0.13 * v._heliVelY - 0.012 * v._heliVelY * Math.abs(v._heliVelY);
      if (v.pos.y <= heliSupportY + 0.005 && v._heliRotorThrust <= GRAVITY_G && collectiveInput <= 0) {
        v._heliVelY = 0;
      } else {
        const accelY = v._heliRotorThrust * vertLiftCos - GRAVITY_G + flareLiftAccel + vertInflowDrag;
        v._heliVelY += accelY * dt;
      }

      // Horizontal acceleration comes STRICTLY from tilted rotor disk thrust + aft-flare rotor H-force drag + calibrated parasitic air drag!
      const flareRotorHForceDrag =
        (v.pitch || 0) > 0.14 && preFwdSpd > 3.0
          ? Math.sin(v.pitch) * preFwdSpd * 0.135
          : 0;
      const rotorFwdAccel =
        -v._heliRotorThrust * Math.sin(v.pitch) * Math.cos(v.roll) - flareRotorHForceDrag;
      const rotorRightAccel = -v._heliRotorThrust * Math.sin(v.roll);
      const horizSpdNow = Math.hypot(v._heliVelX, v._heliVelZ);
      const airDragRate = heliLinDragCoeff + heliQuadDragCoeff * horizSpdNow;

      const accelX = noseFwdX * rotorFwdAccel + rightLatX * rotorRightAccel - airDragRate * v._heliVelX;
      const accelZ = noseFwdZ * rotorFwdAccel + rightLatZ * rotorRightAccel - airDragRate * v._heliVelZ;
      v._heliVelX += accelX * dt;
      v._heliVelZ += accelZ * dt;

      // Sub-walking micro-drift settle ONLY when already < 0.45 m/s (< 1.6 km/h) with zero pilot translation input
      if (!hasHorizInput && horizSpdNow < 0.45) {
        v._heliVelX = THREE.MathUtils.lerp(v._heliVelX, 0, Math.min(1, dt * 1.8));
        v._heliVelZ = THREE.MathUtils.lerp(v._heliVelZ, 0, Math.min(1, dt * 1.8));
      }

      const maxAirX = VEHICLE_STATS.AIRSPACE_MAX_X || 2400;
      const maxAirZ = VEHICLE_STATS.AIRSPACE_MAX_Z || 1650;
      let candX = THREE.MathUtils.clamp(v.pos.x + v._heliVelX * dt, -maxAirX, maxAirX);
      let candZ = THREE.MathUtils.clamp(v.pos.z + v._heliVelZ * dt, -maxAirZ, maxAirZ);
      let candY = v.pos.y + v._heliVelY * dt;

      // Side-wall building check when flying between Downtown FOB C skyscrapers (up to 105m tall!)
      if (this.world?.voxels && candY < 105.0) {
        const gSide = this.world.worldToGrid(candX, candY + 1.1, candZ, _tmpGrid);
        const sideVox = this.world.getVoxel(gSide.gx, gSide.gy, gSide.gz);
        if (sideVox && !sideVox.isProp && candY + 0.6 < (sideVox.maxY ?? candY + 2.0)) {
          if (this.aircraftCollisionAvoidance === false && Math.hypot(v._heliVelX, v._heliVelZ) > 22.0) {
            v.shotDownAttacker = {
              attackerName: this.name || 'PILOT ERROR',
              attackerTeam: v.team === 'US' ? 'RU' : 'US',
              weaponName: 'HELICOPTER CRASHED INTO HIGH-RISE TOWER'
            };
            this.vehicleManager?.finalizeShotDownCrash?.(v);
            return;
          }
          candX = v.pos.x;
          candZ = v.pos.z;
          v._heliVelX *= -0.15;
          v._heliVelZ *= -0.15;
        }
      }

      v.pos.x = candX;
      v.pos.z = candZ;
      const newGndH = this.world ? this.world.getGroundHeightAt(v.pos.x, v.pos.z) : 0;
      let nextSupportY = this.getHeliSupportHeightAt(
        v.pos.x,
        v.pos.z,
        Math.max(v.pos.y, candY) + 3.5
      );
      if (nextSupportY > v.pos.y + 2.6) {
        nextSupportY = newGndH;
      }

      if (candY <= nextSupportY + (collectiveInput <= 0 ? 0.02 : 0)) {
        if (
          this.aircraftCollisionAvoidance === false &&
          v.hasLeftRunwayOnce &&
          v._heliVelY < -14.5
        ) {
          v.pos.y = nextSupportY + 0.4;
          v.shotDownAttacker = {
            attackerName: this.name || 'PILOT ERROR',
            attackerTeam: v.team === 'US' ? 'RU' : 'US',
            weaponName: 'HELICOPTER HARD LANDING CRASH'
          };
          this.vehicleManager?.finalizeShotDownCrash?.(v);
          return;
        }
        v.pos.y = nextSupportY;
        v._heliVelY = 0;
        if (collectiveInput <= 0) {
          // Physical oleo-wheel / landing-skid braking friction (~9.5 m/s²) on solid ground/rooftop
          const gndSpd = Math.hypot(v._heliVelX, v._heliVelZ);
          if (gndSpd > 0.001) {
            const brakedSpd = Math.max(0, gndSpd - 9.5 * dt);
            const gndScale = brakedSpd / gndSpd;
            v._heliVelX *= gndScale;
            v._heliVelZ *= gndScale;
          }
          v.pitch = THREE.MathUtils.lerp(v.pitch || 0, 0, Math.min(1, dt * 6.5));
          v.roll = THREE.MathUtils.lerp(v.roll || 0, 0, Math.min(1, dt * 6.5));
          v._heliPitchRate *= 0.85;
          v._heliRollRate *= 0.85;
          v.hasLeftRunwayOnce = false;
        }
      } else {
        v.pos.y = Math.min(maxAirspaceAlt, candY);
        if (v.pos.y - nextSupportY > 3.0) {
          v.hasLeftRunwayOnce = true;
        }
      }

      const noseFwdNowX = -Math.sin(v.yaw || 0);
      const noseFwdNowZ = -Math.cos(v.yaw || 0);
      v.forwardSpeed = v._heliVelX * noseFwdNowX + v._heliVelZ * noseFwdNowZ;
      if (!v.velVector) v.velVector = new THREE.Vector3();
      v.velVector.set(v._heliVelX, v._heliVelY, v._heliVelZ);
      syncAircraftFlightFSM(v, { onRunway: v.pos.y <= nextSupportY + 0.6 });

      // Spin 3D Main Rotor, Counter-Rotating Coaxial Rotor (Ka-52) & Tail Rotor
      if (v.mesh?.userData) {
        v._rotorSpinSpeed = THREE.MathUtils.lerp(v._rotorSpinSpeed || 18, 30.0, Math.min(1, dt * 4.0));
        const dRot = v._rotorSpinSpeed * dt;
        if (v.mesh.userData.mainRotorHub) v.mesh.userData.mainRotorHub.rotation.y += dRot;
        if (v.mesh.userData.coaxUpperRotorHub) v.mesh.userData.coaxUpperRotorHub.rotation.y -= dRot;
        if (v.mesh.userData.tailRotorHub) v.mesh.userData.tailRotorHub.rotation.x += dRot * 1.85;
      }

      v.turretYaw = this.yaw;
      v.turretPitch = this.pitch;
      if ((v.sensorGlitchTimer || 0) > 0) v.sensorGlitchTimer = Math.max(0, v.sensorGlitchTimer - dt);
      if ((v.opticsGlitchTimer || 0) > 0) v.opticsGlitchTimer = Math.max(0, v.opticsGlitchTimer - dt);

      _airQuatYaw.setFromAxisAngle(_axisY, v.yaw || 0);
      _airQuatPitch.setFromAxisAngle(_axisX, v.pitch || 0);
      _airQuatRoll.setFromAxisAngle(_axisZ, v.roll || 0);
      _airQuatCombined.copy(_airQuatYaw).multiply(_airQuatPitch).multiply(_airQuatRoll);
      v.mesh.position.copy(v.pos);
      v.mesh.quaternion.copy(_airQuatCombined);
      this.pos.copy(v.pos);

      const curHeliAgl = Math.max(0, v.pos.y - newGndH);
      if (curHeliAgl < 5.5) {
        v.airborneRadarTimer = 0;
      } else {
        v.airborneRadarTimer = (v.airborneRadarTimer || 0) + dt;
      }
      // Low-flying Nap-of-the-Earth (NOE < 28m AGL) masks helicopters from enemy radar SAMs!
      v.isLowAltRadarMasked = curHeliAgl < 28.0 || v.airborneRadarTimer < 3.5;
      }
    } else {
      // =========================================================================
      // 1. REALISTIC NON-INSTANT THROTTLE & PROGRESSIVE ENGINE SPOOL ACCELERATION
      //    + WRIGHT FLYER SLOW INITIAL SPOOL -> INCREDIBLE 846 KM/H TOP SPEED
      // =========================================================================
      if (typeof v.throttle !== 'number') {
        v.throttle = onRunway ? 0.0 : isWright ? 0.14 : 0.56;
      }
      const ap = v.airframeParts || null;
      const engHealthFrac = ap ? THREE.MathUtils.clamp((ap.engines ?? 100) / 100, 0, 1) : 1.0;
      const wingLeftFrac = ap ? THREE.MathUtils.clamp((ap.leftWing ?? 100) / 100, 0, 1) : 1.0;
      const wingRightFrac = ap ? THREE.MathUtils.clamp((ap.rightWing ?? 100) / 100, 0, 1) : 1.0;
      const wingAvgFrac = (wingLeftFrac + wingRightFrac) * 0.5;
      const wingAsymDamage = Math.abs(wingLeftFrac - wingRightFrac);
      const wingAsymRollBias =
        Math.min(wingLeftFrac, wingRightFrac) < 0.45 && wingAsymDamage > 0.25
          ? (wingLeftFrac - wingRightFrac) * 0.16
          : 0;
      const tailHealthFrac = ap ? THREE.MathUtils.clamp((ap.tail ?? 100) / 100, 0, 1) : 1.0;
      const avionicsFrac = ap ? THREE.MathUtils.clamp((ap.avionics ?? 100) / 100, 0, 1) : 1.0;
      const maxThrottleCap = engHealthFrac <= 0.05 ? 0.15 : 0.35 + 0.65 * engHealthFrac;

      if (engHealthFrac < 0.55 && !onRunway && this.world?.spawnDebris) {
        v._engDmgSmokeTimer = (v._engDmgSmokeTimer || 0) + dt;
        if (v._engDmgSmokeTimer >= (engHealthFrac < 0.25 ? 0.09 : 0.18)) {
          v._engDmgSmokeTimer = 0;
          this.world.spawnDebris(
            v.pos.clone().add(new THREE.Vector3(0, 0.9, 0)),
            new THREE.Color(engHealthFrac < 0.25 ? 0xff6b1a : 0x2f3640),
            engHealthFrac < 0.25 ? 3 : 2
          );
        }
      }

      const TAXI_THROTTLE_GATE = 0.35;
      if (throttleInput > 0) {
        if (onRunway && (v.forwardSpeed || 0) < -0.1) {
          // Cancel reverse pushback / beta-reverse before spooling forward taxi thrust
          v.throttle = 0;
          v._runwayReverseHold = 0;
        } else {
          // Finer throttle modulation inside the 0%–35% Ground Taxi Detent on the runway!
          const inTaxiDetent = onRunway && v.throttle < TAXI_THROTTLE_GATE;
          const spoolUpRate =
            (isWright ? 0.14 : inTaxiDetent ? 0.22 : 0.38) * (0.45 + 0.55 * engHealthFrac);
          v.throttle = Math.min(maxThrottleCap, v.throttle + dt * spoolUpRate);
        }
      } else if (throttleInput < 0) {
        // Holding [S] aloft deploys dorsal airbrake / split decelerons so pilots can rapidly dump speed to tighten dogfight turn radius!
        const spoolDownRate = onRunway ? 0.95 : 0.92;
        v.throttle = Math.max(0.0, v.throttle - dt * spoolDownRate);
      } else if (v.throttle > maxThrottleCap) {
        v.throttle = Math.max(maxThrottleCap, v.throttle - dt * 0.35);
      }

      // Runway Two-Stage Power Curve + Realistic Reverse Behavior:
      // - 0%..35% Throttle on Runway = TAXI MODE (0..19 m/s ground taxi — stays on wheels, never auto-launches!)
      // - >35%..100% Throttle on Runway = TAKEOFF / AFTERBURNER (accelerates cleanly past rotation speed Vr!)
      // - Hold [S] at 0 km/h on Runway:
      //     * AC-130 / Tu-95 Turboprops: Beta Reverse-Pitch Propellers (-7.5 m/s)
      //     * Tactical Jets / B-2 (no engine thrust reversers in real life): Anti-skid wheel stop first,
      //       then after 0.38s hold engages a slow Ground Crew Pushback Tug (-4.2 m/s) so you never get wedged!
      const effMaxSpd = maxSpd * (0.52 + 0.48 * engHealthFrac);
      const minThrottleSpd = onRunway ? 0 : isWright ? 3.5 : minSpd * 0.52;
      const maxTaxiSpd = isWright ? 6.5 : Math.min(20.0, (minSpd || 32) * 0.62);
      let desiredThrottleSpd;
      if (onRunway) {
        if (v.throttle < 0.025) {
          desiredThrottleSpd = 0;
        } else if (v.throttle <= TAXI_THROTTLE_GATE) {
          desiredThrottleSpd = (v.throttle / TAXI_THROTTLE_GATE) * maxTaxiSpd;
        } else {
          const takeoffFrac = (v.throttle - TAXI_THROTTLE_GATE) / (1.0 - TAXI_THROTTLE_GATE);
          desiredThrottleSpd = THREE.MathUtils.lerp(maxTaxiSpd, effMaxSpd, takeoffFrac);
        }
      } else {
        desiredThrottleSpd = THREE.MathUtils.lerp(minThrottleSpd, effMaxSpd, v.throttle);
      }

      // Gravity pitch-speed coupling: climbing bleeds airspeed on tactical jets, while turboprop AC-130
      // coupled pylon/altitude-hold uses constant-speed prop governor so it climbs smoothly all the way to 1,800m!
      const gravityAccel =
        onRunway || (isGunship && !v.gunshipManualFlight)
          ? 0
          : -Math.sin(v.pitch || 0) * (isWright ? 11.5 : isGunship ? 6.0 : 16.5);
      const curSpd = v.forwardSpeed || 0;

      if (onRunway && throttleInput < 0 && v.throttle <= 0.01 && curSpd <= 0.25) {
        v._runwayReverseHold = (v._runwayReverseHold || 0) + dt;
        if (isGunship) {
          // Real C-130 / AC-130 Turboprop Beta Reverse-Pitch Propellers!
          v.forwardSpeed = Math.max(-7.5, curSpd - 6.8 * dt);
        } else if (v._runwayReverseHold >= 0.38) {
          // Real F-15 / A-10 / B-2 have no reverse gear -> slow Ground Crew Pushback Tug when held at 0 km/h!
          v.forwardSpeed = Math.max(-4.2, curSpd - 4.5 * dt);
          const nowMs = performance.now();
          if (this.onAwardXp && nowMs - (v._lastTugBannerMs || 0) > 9000) {
            v._lastTugBannerMs = nowMs;
            this.onAwardXp(
              0,
              '🚜 GROUND CREW PUSHBACK TUG ENGAGED (JETS HAVE NO REVERSE THRUST — KEEP ≤35% THROTTLE TO TAXI FORWARD!)'
            );
          }
        } else {
          v.forwardSpeed = Math.max(0, curSpd - 16.0 * dt);
        }
      } else {
        v._runwayReverseHold = 0;
        if (onRunway && curSpd < 0 && throttleInput >= 0) {
          const tugStopStep = 9.5 * dt;
          v.forwardSpeed = Math.min(0, curSpd + tugStopStep);
        } else if (!v.autoFlightMode) {
          const spdDiff = desiredThrottleSpd - curSpd;
          let engineAccelRate;
          if (spdDiff >= 0) {
            if (isWright) {
              engineAccelRate = v.isSecretOmegaFlyer
                ? curSpd < 18
                  ? 5.8
                  : curSpd < 45
                  ? 9.5
                  : 16.5 + (curSpd / maxSpd) * 14.0
                : 4.8;
            } else if (onRunway && v.throttle <= TAXI_THROTTLE_GATE) {
              engineAccelRate = 8.5;
            } else {
              engineAccelRate = (v.accelRate || 2.8) * 4.4;
            }
          } else {
            // Wheel anti-skid braking on runway (~18.5 m/s²) vs dorsal airbrake aloft (~28 m/s² when holding [S] to enter tight dogfight corner!)
            engineAccelRate =
              onRunway && throttleInput < 0
                ? 18.5
                : throttleInput < 0
                ? (v.brakeRate || 3.4) * 8.2
                : 6.5;
          }
          const maxDeltaV = engineAccelRate * dt;
          const engineStep = THREE.MathUtils.clamp(spdDiff, -maxDeltaV, maxDeltaV);
          v.forwardSpeed = Math.max(0, Math.min(maxSpd * 1.08, curSpd + engineStep + gravityAccel * dt));
        }
      }

      // =========================================================================
      // 2. AERODYNAMIC STALL & FALLING TO THE GROUND (When Airspeed Drops Below Stall Threshold)
      // =========================================================================
      const baseStallSpd = isWright ? 7.8 : minSpd * 0.94;
      const stallSpd = baseStallSpd * (1 + (1 - wingAvgFrac) * 0.32);
      const isAirborneForStall =
        !onRunway && altAgl > 14.0 && !isGunship && !(throttleInput > 0 && altAgl < 24.0);
      if (isAirborneForStall && v.forwardSpeed < stallSpd) {
        if (!v.isStalling) {
          v.isStalling = true;
          v.flightFSM?.send(AIRCRAFT_FLIGHT_EVENTS.ENTER_STALL);
          v.stallSinkVel = Math.min(-3.5, (v.velVector?.y || 0) - 3.0);
          const nowStallMs = performance.now();
          if (nowStallMs - (v._lastStallWarnMs || 0) > 6000) {
            v._lastStallWarnMs = nowStallMs;
            sound.playRadioBeep?.(false);
            if (this.onAwardXp) {
              const curKmh = Math.floor(v.forwardSpeed * 3.6);
              const reqKmh = Math.max(curKmh + 1, Math.ceil(stallSpd * 3.6));
              this.onAwardXp(
                0,
                engHealthFrac < 0.45
                  ? `⚠️ ENGINE THRUST LOSS STALL (${curKmh} < ${reqKmh} KM/H) — LAND & PARK ON HQ RUNWAY TO REPLACE ENGINES!`
                  : `⚠️ AERODYNAMIC STALL (${curKmh} KM/H < ${reqKmh} KM/H STALL) — HOLD [W] & PUSH NOSE DOWN TO RECOVER!`
              );
            }
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

      // 3. Two-Tier Flight Envelope (`[G]` Collision Avoidance ON = Easy Upright Banked Turns;
      //    `[G]` OFF = Advanced 360° Aerobatic Barrel Rolls, Vertical Loops & Sustained Upside-Down Flight!)
      //    OR AC-130J Pylon-Turn Orbit Autopilot
      const collisionAvoidEnabled = this.aircraftCollisionAvoidance !== false;
      const canAerobaticLoop =
        !collisionAvoidEnabled && !isGunship && v.aircraftRole !== 'b2_spirit' && !onRunway;
      const arrowPitchInput = (this.keys['ArrowUp'] ? 1 : 0) - (this.keys['ArrowDown'] ? 1 : 0);
      const gunshipClimbKey =
        (this.keys['KeyQ'] || this.keys['ArrowUp'] || this.keys['Equal'] || this.keys['PageUp'] ? 1 : 0) -
        (this.keys['KeyZ'] || this.keys['ArrowDown'] || this.keys['Minus'] || this.keys['PageDown'] ? 1 : 0);
      const radiusKeyInput = (this.keys['BracketRight'] ? 1 : 0) - (this.keys['BracketLeft'] ? 1 : 0);
      if (isGunship) {
        if (gunshipClimbKey !== 0) {
          if (!v.gunshipManualFlight && gunshipClimbKey < 0 && (v.targetGunshipAlt || 240) <= 185) {
            const nowMs = performance.now();
            if (nowMs - (v._lastOrbitLandHintMs || 0) > 4000 && this.onAwardXp) {
              v._lastOrbitLandHintMs = nowMs;
              this.onAwardXp(
                0,
                '🛬 MIN PYLON ORBIT ALTITUDE (180M) — PRESS [R] FOR TRANSIT MODE TO DESCEND & LAND ON RUNWAY!'
              );
            }
          }
          const climbRate = (v.targetGunshipAlt || 240) > 420 ? 115 : 78;
          const prevBand = Math.floor((v.targetGunshipAlt || 240) / 100);
          this.adjustGunshipAltitude(gunshipClimbKey * climbRate * dt, true);
          const newBand = Math.floor((v.targetGunshipAlt || 240) / 100);
          if (newBand !== prevBand && this.onAwardXp) {
            const curAlt = Math.round(v.targetGunshipAlt);
            const bankDeg = Math.round(((v.idealBankRad || 0.5) * 180) / Math.PI);
            this.onAwardXp(
              0,
              `🛸 AC-130 ALTITUDE: ${curAlt}M AGL • CIRCLE: ${v.orbitRadius}M • SLANT: ${v.slantRangeM}M • BANK: ${bankDeg}°L`
            );
          }
        }
        if (radiusKeyInput !== 0) {
          this.adjustGunshipOrbitRadius(radiusKeyInput * 48 * dt, true);
        }
        this.syncGunshipPylonGeometry(v);
      }

      if (v.autoFlightMode === 'TAKEOFF' || v.autoFlightMode === 'LANDING') {
        // =========================================================================
        // [R] HANDS-FREE 3D AUTO-TAKEOFF & ILS AUTO-LANDING CONTROLLER
        // =========================================================================
        const isUsAp = (v.team || this.team) !== 'RU';
        const outDirX = isUsAp ? 1 : -1;
        const rwyCx = isUsAp ? -2735 : 2735;
        const rwyCz = isUsAp ? -68 : 68;
        const runwayY = this.world ? this.world.getGroundHeightAt(rwyCx, rwyCz) : groundH;

        // Allow pilot to override/abort Auto-Land if holding full [W] climb for >0.55s
        if (v.autoFlightMode === 'LANDING' && throttleInput > 0 && gunshipClimbKey > 0) {
          v.autoFlightMode = null;
          v._lockedLandDirX = undefined;
        } else if (v.autoFlightMode === 'TAKEOFF') {
          const rotX = rwyCx + outDirX * 165;
          const targetClimbAlt = isGunship ? 210 : isWright ? 65 : 155;
          const liftoffSpd = isWright ? 8.2 : Math.max(minSpd * 0.98, 30);
          v._takeoffSpool = Math.min(1.0, (v._takeoffSpool || 0.22) + dt * 0.85);
          v.throttle = Math.min(maxThrottleCap, (v.throttle || 0.25) + dt * 0.55);
          const targetSpd = THREE.MathUtils.lerp(liftoffSpd * 1.15, effMaxSpd * 0.88, 0.72);
          // Physics-bounded jet/prop thrust acceleration (`<= 11.8 m/s^2`, ~1.2G max) — zero sudden lerp velocity jolts!
          const maxTakeoffAccel =
            (isWright ? 4.5 : isGunship ? 7.8 : v.aircraftRole === 'b2_spirit' ? 9.4 : 11.8) *
            (0.35 + 0.65 * v._takeoffSpool);
          const curTakeoffSpd = v.forwardSpeed || 0;
          const spdDelta = targetSpd - curTakeoffSpd;
          v.forwardSpeed =
            curTakeoffSpd + THREE.MathUtils.clamp(spdDelta, -6.5 * dt, maxTakeoffAccel * dt);

          // Lookahead point along paved `z = rwyCz` (`-68` US / `+68` RU) runway centerline toward battlefield!
          const lookAheadX = v.pos.x + outDirX * (onRunway ? 135 : 240);
          const lookAheadZ = rwyCz;
          const desiredYaw = Math.atan2(-(lookAheadX - v.pos.x), -(lookAheadZ - v.pos.z));
          let yErr = desiredYaw - (v.yaw || 0);
          while (yErr > Math.PI) yErr -= Math.PI * 2;
          while (yErr < -Math.PI) yErr += Math.PI * 2;

          v.yaw = (v.yaw || 0) + THREE.MathUtils.clamp(yErr * 2.0, -1.15, 1.15) * dt;
          const targetApRoll = onRunway ? 0 : THREE.MathUtils.clamp(yErr * 1.05, -0.4, 0.4);
          v.roll = THREE.MathUtils.lerp(v.roll || 0, targetApRoll, Math.min(1, dt * 4.2));

          const pastVr = (v.forwardSpeed || 0) >= liftoffSpd || (v.pos.x - rotX) * outDirX > -25;
          const altRem = runwayY + targetClimbAlt - v.pos.y;
          const targetApPitch = !pastVr
            ? 0
            : altRem > 22
            ? isWright
              ? 0.18
              : 0.24
            : THREE.MathUtils.clamp(altRem * 0.012, 0, 0.22);
          const maxPitchStep = 0.52 * dt;
          v.pitch =
            (v.pitch || 0) +
            THREE.MathUtils.clamp(targetApPitch - (v.pitch || 0), -maxPitchStep, maxPitchStep);
          this.yaw = THREE.MathUtils.lerp(this.yaw, v.yaw, Math.min(1, dt * 4.2));
          this.pitch = THREE.MathUtils.lerp(this.pitch, v.pitch, Math.min(1, dt * 4.2));

          // Complete Auto-Takeoff & immediately remove BOTH green and orange guide lines upon lifting off (`altAgl >= 11.5m`)!
          if (altAgl >= 11.5 && pastVr) {
            v.autoFlightMode = null;
            v._takeoffSpool = 0;
            v._suppressLandingGuideUntilClear = true;
            if (this._runwayAssistVisGroup) {
              this._runwayAssistVisGroup.visible = false;
            }
            v.throttle = 0.68;
            v.pitch = isWright ? 0.1 : 0.14;
            v.roll = 0;
            this.yaw = v.yaw;
            this.pitch = v.pitch;
            sound.playRadioBeep?.(true);
            if (this.onAwardXp) {
              this.onAwardXp(
                0,
                `✅ AIRBORNE — TAKEOFF COMPLETE! MANUAL FLIGHT ACTIVE ([R] ${
                  isGunship ? 'PYLON ORBIT' : 'LEVEL AUTOPILOT'
                })`
              );
            }
          }
        } else if (v.autoFlightMode === 'LANDING') {
          if (typeof v._lockedLandDirX !== 'number') {
            v._lockedLandDirX = v.pos.x < rwyCx ? 1 : -1;
            v._landBrakeRamp = 0.18;
          }
          const landDirX = v._lockedLandDirX;
          const threshX = rwyCx - landDirX * 156;
          const stopX = rwyCx + landDirX * 135;
          const approachSpd = isWright ? 11.5 : Math.max((minSpd || 32) * 1.12, stallSpd * 1.15);
          // Smooth localizer capture onto exact paved asphalt centerline `z = rwyCz` (`-68` US / `+68` RU)!
          const distBeforeThresh = (threshX - v.pos.x) * landDirX;
          const aimX =
            distBeforeThresh > 60
              ? threshX - landDirX * Math.min(240, distBeforeThresh * 0.32)
              : stopX + landDirX * 70;
          const desiredYaw = Math.atan2(-(aimX - v.pos.x), -(rwyCz - v.pos.z));
          let yErr = desiredYaw - (v.yaw || 0);
          while (yErr > Math.PI) yErr -= Math.PI * 2;
          while (yErr < -Math.PI) yErr += Math.PI * 2;

          const turnLimit = onRunway ? 1.15 : 1.05;
          v.yaw = (v.yaw || 0) + THREE.MathUtils.clamp(yErr * 1.95, -turnLimit, turnLimit) * dt;
          const targetApRoll =
            onRunway || altAgl < 9.0 ? 0 : THREE.MathUtils.clamp(yErr * 1.15, -0.48, 0.48);
          v.roll = THREE.MathUtils.lerp(v.roll || 0, targetApRoll, Math.min(1, dt * 4.2));

          if (onRunway || (altAgl < 3.2 && Math.abs(v.pos.z - rwyCz) < 22 && distBeforeThresh < 85)) {
            // Progressive Anti-Skid Wheel Braking & Drag Chute Rollout (`<= 9.6 m/s^2`, < 1.0G) — zero sudden stops!
            v.throttle = THREE.MathUtils.lerp(v.throttle ?? 0.25, 0, Math.min(1, dt * 4.5));
            v.isStalling = false;
            v.stallSinkVel = 0;
            v._landBrakeRamp = Math.min(1.0, (v._landBrakeRamp || 0.2) + dt * 1.25);
            const curRollSpd = v.forwardSpeed || 0;
            const smoothWheelDecel =
              Math.min(9.6, 2.4 + curRollSpd * 0.38) * v._landBrakeRamp;
            v.pitch = THREE.MathUtils.lerp(v.pitch || 0, 0, Math.min(1, dt * 4.5));
            v.forwardSpeed = Math.max(0, curRollSpd - smoothWheelDecel * dt);
            this.yaw = THREE.MathUtils.lerp(this.yaw, v.yaw, Math.min(1, dt * 4.5));
            this.pitch = THREE.MathUtils.lerp(this.pitch, 0, Math.min(1, dt * 4.5));
            if ((v.forwardSpeed || 0) <= 0.4) {
              v.forwardSpeed = 0;
              v.autoFlightMode = null;
              v._lockedLandDirX = undefined;
              v._landBrakeRamp = 0;
              v.pitch = 0;
              v.roll = 0;
              sound.playRadioBeep?.(true);
              if (this.onAwardXp) {
                this.onAwardXp(
                  0,
                  '🛬 AUTO-LANDING COMPLETE ON RUNWAY — GROUND CREW REPLACING DAMAGED PARTS & REARMING! ([R] AUTO-TAKEOFF)'
                );
              }
            }
          } else {
            // Airborne ILS Glideslope Descent & Flare with physics-bounded airbrake drag (`<= 8.2 m/s^2`, ~0.84G)
            v.isStalling = false;
            v.stallSinkVel = 0;
            v._landBrakeRamp = 0.2;
            v.throttle = THREE.MathUtils.lerp(v.throttle ?? 0.5, 0.34, Math.min(1, dt * 2.8));
            const curAirSpd = v.forwardSpeed || approachSpd;
            const airSpdErr = approachSpd - curAirSpd;
            v.forwardSpeed =
              curAirSpd + THREE.MathUtils.clamp(airSpdErr, -8.2 * dt, 6.8 * dt);
            const horizToTouchdown = Math.max(25, Math.hypot(v.pos.x - (threshX + landDirX * 30), v.pos.z - rwyCz));
            const glideAngle = -Math.atan2(Math.max(0, v.pos.y - (runwayY + 1.1)), horizToTouchdown);
            const flarePitch =
              altAgl < 9.5
                ? THREE.MathUtils.lerp(0.03, glideAngle, altAgl / 9.5)
                : THREE.MathUtils.clamp(glideAngle, -0.22, 0.08);
            const maxFlareStep = 0.55 * dt;
            v.pitch =
              (v.pitch || 0) +
              THREE.MathUtils.clamp(flarePitch - (v.pitch || 0), -maxFlareStep, maxFlareStep);
            this.yaw = THREE.MathUtils.lerp(this.yaw, v.yaw, Math.min(1, dt * 3.8));
            this.pitch = THREE.MathUtils.lerp(this.pitch, v.pitch, Math.min(1, dt * 3.8));
          }
        }
      } else if (isGunship && !onRunway && !v.gunshipManualFlight) {
        // AC-130 REAL-LIFE COUPLED PYLON ORBIT CONTROLLER (1968 -> 2024):
        // - Altitude (`v.targetGunshipAlt`, 95m..560m) directly zooms `v.orbitRadius` (`105m..620m`) and Slant Range!
        // - Coordinated turn bank `tan(bank) = V^2 / (g * R)` scales naturally from ~44° steep bank at low altitude
        //   to ~31° standard pylon bank at 200m, down to ~15°..22° gentle standoff bank at 400m..560m!
        if (!v.orbitCenter) {
          v.orbitCenter = new THREE.Vector3(v.pos.x, 0, v.pos.z);
        }

        if (throttleInput !== 0 || bankInput !== 0) {
          const lookFwdX = -Math.sin(this.yaw);
          const lookFwdZ = -Math.cos(this.yaw);
          const lookRightX = Math.cos(this.yaw);
          const lookRightZ = -Math.sin(this.yaw);
          const slideRate = v.ac130HasCoupledAutopilot ? 82 : 52;
          const slideSpd = slideRate * dt;
          v.orbitCenter.x = THREE.MathUtils.clamp(
            v.orbitCenter.x + (lookFwdX * throttleInput - lookRightX * bankInput) * slideSpd,
            -6500,
            6500
          );
          v.orbitCenter.z = THREE.MathUtils.clamp(
            v.orbitCenter.z + (lookFwdZ * throttleInput - lookRightZ * bankInput) * slideSpd,
            -6500,
            6500
          );
          v.orbitAnchorLabel = `ORBIT (${Math.round(v.orbitCenter.x)}, ${Math.round(v.orbitCenter.z)})`;
        }

        const climbBoost = (v.targetGunshipAlt || 320) - (v.pos.y - groundH) > 18 ? 0.92 : 0.62;
        v.throttle = climbBoost;
        const tgtCruise = climbBoost > 0.8 ? (v.maxSpeed || 62) * 0.92 : v.speed || 50;
        v.forwardSpeed = THREE.MathUtils.lerp(v.forwardSpeed || 48, tgtCruise, Math.min(1, dt * 3.2));

        const orbitRadius = v.orbitRadius || 220;
        const rx = v.pos.x - v.orbitCenter.x;
        const rz = v.pos.z - v.orbitCenter.z;
        const distFromCenter = Math.hypot(rx, rz) || 1;
        let desDirX;
        let desDirZ;
        if (distFromCenter > orbitRadius * 1.06) {
          // Intercept the exact geometric Right-Hand Tangent Point on the Counter-Clockwise Orbit Ring!
          const phiOrb = Math.atan2(rz, rx);
          const alphaOrb = phiOrb - Math.acos(THREE.MathUtils.clamp(orbitRadius / distFromCenter, -1, 1));
          const tanX = v.orbitCenter.x + Math.cos(alphaOrb) * orbitRadius;
          const tanZ = v.orbitCenter.z + Math.sin(alphaOrb) * orbitRadius;
          const toTanX = tanX - v.pos.x;
          const toTanZ = tanZ - v.pos.z;
          const toTanLen = Math.hypot(toTanX, toTanZ) || 1;
          desDirX = toTanX / toTanLen;
          desDirZ = toTanZ / toTanLen;
        } else {
          const nx = rx / distFromCenter;
          const nz = rz / distFromCenter;
          const radialErr = THREE.MathUtils.clamp(
            (distFromCenter - orbitRadius) / Math.max(82, orbitRadius * 0.42),
            -0.92,
            0.92
          );
          desDirX = nz - nx * radialErr;
          desDirZ = -nx - nz * radialErr;
        }
        const desiredOrbitYaw = Math.atan2(-desDirX, -desDirZ);
        let orbitYawDiff = desiredOrbitYaw - (v.yaw || 0);
        while (orbitYawDiff > Math.PI) orbitYawDiff -= Math.PI * 2;
        while (orbitYawDiff < -Math.PI) orbitYawDiff += Math.PI * 2;

        const maxTurnGain = v.ac130HasCoupledAutopilot ? 0.65 : 0.52;
        const yawStep = THREE.MathUtils.clamp(orbitYawDiff * 1.75, -maxTurnGain, maxTurnGain);
        const steadyLeftBank = v.idealBankRad || 0.5;
        const isOnPerimeter = Math.abs(orbitYawDiff) < 0.38 && Math.abs(distFromCenter - orbitRadius) < Math.max(38, orbitRadius * 0.18);
        const targetGunshipRoll = isOnPerimeter
          ? steadyLeftBank
          : yawStep >= 0
          ? THREE.MathUtils.clamp(0.2 + yawStep * 0.68, 0.18, 0.72)
          : THREE.MathUtils.clamp(yawStep * 0.75, -0.45, -0.05);
        v.manualPylonBank = targetGunshipRoll;

        v.yaw = (v.yaw || 0) + yawStep * dt;
        // Advance Pilot/Gunner Yaw in lockstep with the AC-130's pylon turn so the crosshair stays glued to ground targets!
        this.yaw += yawStep * dt;

        // Authentic AC-130 Decoupled Sensor Field-of-Regard vs. Physical Port Gun Mount Traverse:
        // - Belly EO/IR Sensor Pod (`OPTIC_NOSE`) & Left Window (`COCKPIT_1P`) allow wide situational gimbal (`±38°..±55°`, `-3.5°..-84°` pitch)
        // - Physical port gun embrasures (`25mm/40mm/105mm`) traverse `±22°..±38°` (`v._activeGunMountArc`), while aiming near the gimbal edge
        //   gently slews the coupled pylon `orbitCenter` toward the crosshair!
        const portCenterYaw = (v.yaw || 0) + Math.PI * 0.5;
        let portYawOff = this.yaw - portCenterYaw;
        while (portYawOff > Math.PI) portYawOff -= Math.PI * 2;
        while (portYawOff < -Math.PI) portYawOff += Math.PI * 2;
        const gunMountArc = Math.max(0.72, (v.ac130MaxMountArc || 0.35) + 0.38);
        v._activeGunMountArc = gunMountArc;
        const camModeLook =
          this.vehicleCameraMode || (this.thirdPersonVehicle ? 'CHASE_3P' : 'COCKPIT_1P');
        // Keep optical reticle strictly inside physical port gun traverse so rounds ALWAYS hit dead-center on cursor!
        const maxPortArc =
          camModeLook === 'CHASE_3P' ? Math.max(gunMountArc, 0.98) : gunMountArc;
        const clampedPortYawOff = THREE.MathUtils.clamp(portYawOff, -maxPortArc, maxPortArc);
        this.yaw = portCenterYaw + clampedPortYawOff;

        const tgtGroundH = this.world ? this.world.getGroundHeightAt(v.orbitCenter.x, v.orbitCenter.z) : groundH;
        const idealDepress = -Math.atan2(Math.max(35, v.pos.y - tgtGroundH), Math.max(60, distFromCenter));
        this.pitch = THREE.MathUtils.clamp(this.pitch, -1.46, -0.06);

        // Coupled FCS Orbit Slew: when aiming near/past the physical gun mount traverse limit, smoothly walk orbitCenter toward aim!
        if (Math.abs(clampedPortYawOff) > gunMountArc * 0.85 && throttleInput === 0 && bankInput === 0) {
          const slewDirX = -Math.sin(this.yaw);
          const slewDirZ = -Math.cos(this.yaw);
          const excessFrac = THREE.MathUtils.clamp(
            (Math.abs(clampedPortYawOff) - gunMountArc * 0.85) / 0.45,
            0,
            1
          );
          const slewStep = (v.ac130HasCoupledAutopilot ? 30 : 18) * excessFrac * dt;
          v.orbitCenter.x = THREE.MathUtils.clamp(v.orbitCenter.x + slewDirX * slewStep, -6500, 6500);
          v.orbitCenter.z = THREE.MathUtils.clamp(v.orbitCenter.z + slewDirZ * slewStep, -6500, 6500);
        }

        // Visually swivel the 3D Hydraulic Port Gun Barrels within their physical embrasure cone!
        const bGrp = v.mesh?.userData?.gunshipBarrelGroup;
        if (bGrp) {
          const mountClampedYaw = THREE.MathUtils.clamp(clampedPortYawOff, -gunMountArc, gunMountArc);
          bGrp.rotation.y = THREE.MathUtils.clamp(mountClampedYaw * 0.72, -0.48, 0.48);
          bGrp.rotation.z = THREE.MathUtils.clamp((this.pitch - idealDepress) * 0.5, -0.32, 0.32);
        }

        let gunshipSafeFloorY = groundH + v.targetGunshipAlt;
        if (this.aircraftCollisionAvoidance !== false) {
          const gLookX = v.pos.x - Math.sin(v.yaw || 0) * 38;
          const gLookZ = v.pos.z - Math.cos(v.yaw || 0) * 38;
          const curObsY = this.getAircraftObstacleHeightAt(v.pos.x, v.pos.z, v.pos.y);
          const fwdObsY = this.getAircraftObstacleHeightAt(gLookX, gLookZ, v.pos.y);
          gunshipSafeFloorY = Math.max(gunshipSafeFloorY, curObsY + 24, fwdObsY + 24);
        }
        const targetAltY = gunshipSafeFloorY;
        const altErr = targetAltY - v.pos.y;
        const targetGunshipPitch = THREE.MathUtils.clamp(altErr * 0.016, -0.28, 0.28);
        v.pitch = THREE.MathUtils.lerp(v.pitch || 0, targetGunshipPitch, Math.min(1, dt * 3.4));
        v.roll = THREE.MathUtils.lerp(v.roll || 0, targetGunshipRoll, Math.min(1, dt * 3.2));
        this.vehicleManager?.updateAircraftControlSurfacesAndVortices?.(
          v,
          dt,
          targetGunshipRoll - (v.roll || 0),
          targetGunshipPitch - (v.pitch || 0),
          yawStep
        );
      } else {
        const tailAuthority = 0.42 + 0.58 * tailHealthFrac;
        const altFreeLookHeld = !isGunship && Boolean(this.keys['AltLeft'] || this.keys['AltRight']);
        if (altFreeLookHeld && !v._wasAltFreeLook) {
          v._wasAltFreeLook = true;
          v._freeLookHoldAlt = Math.max(v.pos.y, groundH + 22);
          if (typeof v.freeLookYaw !== 'number') v.freeLookYaw = 0;
          if (typeof v.freeLookPitch !== 'number') v.freeLookPitch = 0;
        } else if (!altFreeLookHeld && v._wasAltFreeLook) {
          v._wasAltFreeLook = false;
        }
        const decoupledFlightActive = !isGunship && !onRunway && Boolean(altFreeLookHeld || v.levelAutopilot);
        if (!decoupledFlightActive && !v.spiTargetPos) {
          v.freeLookYaw = THREE.MathUtils.lerp(v.freeLookYaw || 0, 0, Math.min(1, dt * 9.5));
          v.freeLookPitch = THREE.MathUtils.lerp(v.freeLookPitch || 0, 0, Math.min(1, dt * 9.5));
          if (Math.abs(v.freeLookYaw) < 0.001) v.freeLookYaw = 0;
          if (Math.abs(v.freeLookPitch) < 0.001) v.freeLookPitch = 0;
        }

        if (decoupledFlightActive) {
          // LAAP Level-Hold Autopilot ([R]) or Free-Look + Auto-Level (Hold [ALT]):
          // Plane flies level at constant altitude (steerable via [A/D] & [Q/Z / ↑↓]) while mouse looks down freely!
          const holdProp = v.levelAutopilot ? 'autopilotHoldAlt' : '_freeLookHoldAlt';
          if (typeof v[holdProp] !== 'number') {
            v[holdProp] = Math.max(v.pos.y, groundH + 35);
          }
          if (gunshipClimbKey !== 0) {
            v[holdProp] = THREE.MathUtils.clamp(
              v[holdProp] + gunshipClimbKey * 42 * dt,
              groundH + 28,
              maxAirspaceAlt
            );
          }
          if (bankInput !== 0) {
            v.yaw +=
              this.computeAircraftBankedTurnRate(
                v,
                v.forwardSpeed || v.speed || 85,
                bankInput * 0.48,
                0,
                tailAuthority,
                false
              ) * dt;
          }
          this.yaw = v.yaw;
          const targetApRoll = bankInput * 0.42 + wingAsymRollBias * 0.5;
          v.roll = THREE.MathUtils.lerp(v.roll || 0, targetApRoll, Math.min(1, dt * 4.5));
          const altErr = v[holdProp] - v.pos.y;
          const targetApPitch = THREE.MathUtils.clamp(altErr * 0.025, -0.25, 0.28);
          this.pitch = targetApPitch;
          v.pitch = THREE.MathUtils.lerp(v.pitch || 0, targetApPitch, Math.min(1, dt * 4.2 * tailAuthority));
          this.vehicleManager?.updateAircraftControlSurfacesAndVortices?.(
            v,
            dt,
            targetApRoll - (v.roll || 0),
            targetApPitch - (v.pitch || 0),
            bankInput * 0.3
          );
        } else {
          if (canAerobaticLoop) {
            if (arrowPitchInput !== 0) {
              this.pitch += arrowPitchInput * (v.turnRate || 1.65) * 1.05 * tailAuthority * dt;
            }
            while (this.pitch > Math.PI) this.pitch -= Math.PI * 2;
            while (this.pitch <= -Math.PI) this.pitch += Math.PI * 2;
          } else {
            if (arrowPitchInput !== 0 && !isGunship) {
              this.pitch += arrowPitchInput * (v.turnRate || 1.35) * 0.85 * tailAuthority * dt;
            }
            while (this.pitch > Math.PI) this.pitch -= Math.PI * 2;
            while (this.pitch <= -Math.PI) this.pitch += Math.PI * 2;
            this.pitch = THREE.MathUtils.clamp(this.pitch, -1.08, 1.08);
          }

          const isInvertedLoop = canAerobaticLoop && Math.cos(v.pitch || 0) < -0.05;
          const maxBankRad =
            v.aircraftRole === 'fighter'
              ? 1.05
              : v.aircraftRole === 'cas'
              ? 0.94
              : v.aircraftRole === 'b2_spirit'
              ? 0.62
              : isGunship
              ? 0.52
              : 0.88;
          if (!canAerobaticLoop && bankInput !== 0) {
            // Easy Upright Flight (`[G]` ON, or B-2 / Manual Gunship): `[A/D]` steers heading at aerodynamic G-limited turn rate!
            this.yaw +=
              this.computeAircraftBankedTurnRate(
                v,
                v.forwardSpeed || v.speed || 85,
                bankInput * maxBankRad,
                0,
                tailAuthority,
                false
              ) * dt;
          }

          let yawDiff = this.yaw - v.yaw;
          while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
          while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
          // Prevent continuous mouse-turn wrap-around (`> ±180°` suddenly flipping bank to the opposite direction!):
          // Clamp coupled flight-director yaw lead to ±1.42 rad (±81.4°) so sweeping the mouse continuously holds max bank!
          if (!decoupledFlightActive && !v.spiTargetPos) {
            yawDiff = THREE.MathUtils.clamp(yawDiff, -1.42, 1.42);
            this.yaw = v.yaw + yawDiff;
          }

          // Role-specific coordinated bank limit:
          // - In `[G]` ON (Easy Flight), `canAerobaticLoop` is false so bank never exceeds a natural 53°–60° turn!
          // - In `[G]` OFF (Advanced Flight), `[A/D]` unlocks full 360° barrel rolls & sustained ±180° upside-down flight!
          const stallBuffetRoll = v.isStalling ? Math.sin(performance.now() * 0.015) * 0.34 : 0;
          const loopLevelFactor = canAerobaticLoop
            ? THREE.MathUtils.clamp((Math.abs(Math.cos(v.pitch || 0)) - 0.12) / 0.35, 0.15, 1.0)
            : 1.0;

          let targetRoll = 0;
          if (onRunway) {
            v.roll = THREE.MathUtils.lerp(v.roll || 0, 0, Math.min(1, dt * 8.0));
          } else if (canAerobaticLoop && bankInput !== 0) {
            // Advanced Mode (`[G]` OFF): Holding `[A]` or `[D]` drives smooth 360° aileron rolls (allowing ±180° inverted flight!)
            const aileronRate =
              (v.aircraftRole === 'fighter' ? 2.45 : v.aircraftRole === 'cas' ? 2.0 : 1.75) *
              (0.68 + 0.32 * wingAvgFrac);
            v.roll = (v.roll || 0) + (bankInput * aileronRate + wingAsymRollBias) * dt;
            while (v.roll > Math.PI) v.roll -= Math.PI * 2;
            while (v.roll <= -Math.PI) v.roll += Math.PI * 2;
            targetRoll = v.roll;
            // Smooth lift-coupled heading turn (`sin(roll)*cos(roll)` = 0 at 90° knife-edge, never fighting `v.yaw`!)
            this.yaw +=
              this.computeAircraftBankedTurnRate(
                v,
                v.forwardSpeed || v.speed || 85,
                v.roll,
                0,
                tailAuthority,
                true
              ) *
              (isInvertedLoop ? -1 : 1) *
              dt;
          } else if (canAerobaticLoop && Math.abs(v.roll || 0) > 2.05) {
            // Advanced Mode (`[G]` OFF): Pilot rolled >117° into inverted flight and released `[A/D]` -> hold UPSIDE-DOWN (±180°)!
            const invCenter = (v.roll || 0) >= 0 ? Math.PI : -Math.PI;
            const invBankOffset = THREE.MathUtils.clamp(
              (-yawDiff * 1.35) * loopLevelFactor + wingAsymRollBias + stallBuffetRoll,
              -0.8,
              0.8
            );
            targetRoll = invCenter + invBankOffset;
            let rErr = targetRoll - (v.roll || 0);
            while (rErr > Math.PI) rErr -= Math.PI * 2;
            while (rErr < -Math.PI) rErr += Math.PI * 2;
            const rollResponse = v.aircraftRole === 'fighter' ? 5.6 : 4.5;
            v.roll = (v.roll || 0) + rErr * Math.min(1, dt * rollResponse);
            while (v.roll > Math.PI) v.roll -= Math.PI * 2;
            while (v.roll <= -Math.PI) v.roll += Math.PI * 2;
          } else {
            // Coordinated Bank-to-Turn (Crisp aileron roll-in so a ~20° mouse pull reaches full combat bank without sluggish lag!):
            targetRoll = THREE.MathUtils.clamp(
              (yawDiff * 2.55 + bankInput * 0.85) * loopLevelFactor + wingAsymRollBias + stallBuffetRoll,
              -maxBankRad,
              maxBankRad
            );
            let rErr = targetRoll - (v.roll || 0);
            while (rErr > Math.PI) rErr -= Math.PI * 2;
            while (rErr < -Math.PI) rErr += Math.PI * 2;
            const rollResponse =
              v.aircraftRole === 'fighter' ? 7.4 : v.aircraftRole === 'b2_spirit' ? 3.8 : 6.2;
            v.roll = (v.roll || 0) + rErr * Math.min(1, dt * rollResponse);
            while (v.roll > Math.PI) v.roll -= Math.PI * 2;
            while (v.roll <= -Math.PI) v.roll += Math.PI * 2;
          }

          // Recompute yawDiff after any turn update
          yawDiff = this.yaw - v.yaw;
          while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
          while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;

          // Aerodynamic Load-Factor Bank-to-Turn (omega = a_lat / V) + Runway Nosewheel Steering (`R_min ≈ 8–11m` on tarmac!)
          const isRollInverted = canAerobaticLoop && Math.cos(v.roll || 0) < -0.2;
          const taxiDirSign = onRunway && (v.forwardSpeed || 0) < -0.15 ? -1 : 1;
          const taxiSpdAbs = Math.abs(v.forwardSpeed || 0);
          const minTaxiR = isGunship || v.aircraftRole === 'b2_spirit' ? 11.5 : isWright ? 5.0 : 8.2;
          const maxNwsRate = Math.min(1.15, Math.max(0.22, taxiSpdAbs / minTaxiR));
          const runwayNwsRate = THREE.MathUtils.clamp(
            yawDiff * 2.1 + bankInput * maxNwsRate * taxiDirSign,
            -maxNwsRate,
            maxNwsRate
          );
          const bankedTurnRate = onRunway
            ? runwayNwsRate
            : this.computeAircraftBankedTurnRate(
                v,
                v.forwardSpeed || v.speed || 85,
                v.roll || 0,
                yawDiff,
                tailAuthority,
                canAerobaticLoop && bankInput !== 0
              ) * (isInvertedLoop ? -0.65 : 1.0);
          v.yaw += bankedTurnRate * dt;
          if (onRunway && bankInput !== 0) {
            this.yaw = v.yaw;
          }

          const insideSecretCave = isWright && Math.abs(v.pos.x) > 1584;
          const liftoffSpeed = isWright ? 8.2 : Math.max(minSpd * 0.98, 30);
          const collisionAvoidAuto = this.aircraftCollisionAvoidance !== false;
          if (altAgl > 8.5) {
            v.hasLeftRunwayOnce = true;
          } else if (onRunway && v.forwardSpeed < 12) {
            v.hasLeftRunwayOnce = false;
          }

          // Lookahead obstacle height (mountains + buildings 35m ahead) for Auto Collision Avoidance
          let lookaheadObstacleH = groundH;
          let curObsH = groundH;
          let fwdObsH = groundH;
          const lookX = v.pos.x - Math.sin(v.yaw) * 36;
          const lookZ = v.pos.z - Math.cos(v.yaw) * 36;
          const fwdGroundH = this.world ? this.world.getGroundHeightAt(lookX, lookZ) : groundH;
          if (collisionAvoidAuto && !insideSecretCave && !onRunway) {
            curObsH = this.getAircraftObstacleHeightAt(v.pos.x, v.pos.z, v.pos.y);
            fwdObsH = this.getAircraftObstacleHeightAt(lookX, lookZ, v.pos.y);
            lookaheadObstacleH = Math.max(groundH, curObsH, fwdObsH);
          }
          const effectiveClearance = v.pos.y - lookaheadObstacleH;
          const hasHardStructureAhead = Math.max(curObsH, fwdObsH) > Math.max(groundH, fwdGroundH) + 1.5;
          const risingCliffAhead = fwdGroundH - groundH > 2.4;
          const pilotWantsLanding =
            !v.isStalling &&
            !hasHardStructureAhead &&
            !risingCliffAhead &&
            (!isGunship || Boolean(v.gunshipManualFlight)) &&
            (throttleInput < 0 ||
              gunshipClimbKey < 0 ||
              arrowPitchInput < 0 ||
              (v.throttle ?? 0.5) <= 0.38 ||
              (isGunship &&
                Boolean(v.gunshipManualFlight) &&
                (this.pitch < -0.08 || (v.targetGunshipAlt ?? 200) <= 45)));

          let desiredPitch;
          if (isGunship && !onRunway) {
            const pilotDescending =
              this.pitch < -0.05 || throttleInput < 0 || gunshipClimbKey < 0 || (v.targetGunshipAlt ?? 200) < 45;
            if (pilotDescending) {
              const keySinkBias = gunshipClimbKey < 0 ? -0.22 : throttleInput < 0 ? -0.14 : 0;
              desiredPitch = THREE.MathUtils.clamp(this.pitch + keySinkBias, -0.46, 0.32);
              v.targetGunshipAlt = Math.max(0, Math.min(v.targetGunshipAlt ?? altAgl, altAgl));
            } else if (this.pitch > 0.06) {
              desiredPitch = THREE.MathUtils.clamp(this.pitch * thinAirCeilFactor, 0.02, 0.32);
              v.targetGunshipAlt = Math.min(maxAirspaceAlt, Math.max(v.targetGunshipAlt ?? altAgl, altAgl));
            } else {
              const holdPitch = THREE.MathUtils.clamp(
                (groundH + (v.targetGunshipAlt ?? 200) - v.pos.y) * 0.016,
                -0.28,
                0.32
              );
              desiredPitch = Math.max(holdPitch, THREE.MathUtils.clamp(this.pitch, -0.05, 0.32));
            }
          } else {
            desiredPitch =
              this.pitch +
              (!onRunway && !isRollInverted && Math.cos(v.pitch || 0) > 0.2 ? Math.abs(Math.sin(v.roll)) * 0.05 : 0);
          }
          if (onRunway && !v.hasLeftRunwayOnce) {
            // Stay flat on tricycle gear in the ≤35% Taxi Detent; allow nose-up rotation above the Takeoff Gate!
            desiredPitch = v.throttle <= 0.36 ? 0 : THREE.MathUtils.clamp(desiredPitch, 0, 0.28);
          }
          if (v.isStalling) {
            desiredPitch = -0.45;
            this.pitch = THREE.MathUtils.lerp(this.pitch, -0.38, Math.min(1, dt * 1.8));
          } else if (insideSecretCave) {
            desiredPitch = THREE.MathUtils.clamp(desiredPitch, -0.04, 0.08);
          } else if (
            onRunway &&
            v.throttle > 0.38 &&
            v.forwardSpeed > liftoffSpeed &&
            throttleInput >= 0 &&
            desiredPitch > -0.05
          ) {
            desiredPitch = Math.max(desiredPitch, 0.22);
            if (isGunship && (v.targetGunshipAlt ?? 0) < 120) {
              v.targetGunshipAlt = 180;
            }
          } else if (pilotWantsLanding && !onRunway && altAgl < 7.5) {
            desiredPitch = Math.max(desiredPitch, -0.14);
          } else if (
            collisionAvoidAuto &&
            !pilotWantsLanding &&
            !onRunway &&
            effectiveClearance < (isWright ? 16 : 34) &&
            Math.sin(desiredPitch) < 0.24
          ) {
            const pullSpan = isWright ? 16 : 34;
            const pullFrac = THREE.MathUtils.clamp((pullSpan - effectiveClearance) / pullSpan, 0, 1);
            desiredPitch = THREE.MathUtils.lerp(desiredPitch, 0.28, pullFrac);
            this.pitch = THREE.MathUtils.lerp(this.pitch, 0.16, pullFrac * dt * 4.8);
          }

          let pitchDelta = desiredPitch - (v.pitch || 0);
          while (pitchDelta > Math.PI) pitchDelta -= Math.PI * 2;
          while (pitchDelta < -Math.PI) pitchDelta += Math.PI * 2;
          const pitchRateScale = (canAerobaticLoop ? 5.2 : 4.4) * tailAuthority;
          v.pitch = (v.pitch || 0) + pitchDelta * Math.min(1, dt * pitchRateScale);
          while (v.pitch > Math.PI) v.pitch -= Math.PI * 2;
          while (v.pitch <= -Math.PI) v.pitch += Math.PI * 2;

          this.vehicleManager?.updateAircraftControlSurfacesAndVortices?.(
            v,
            dt,
            targetRoll - (v.roll || 0),
            pitchDelta,
            yawDiff
          );
        }
      }

      // 4. Gimbal-Lock-Free Quaternion Airframe Orientation (`Q = Q_yaw * Q_pitch * Q_roll`) & 3D Flight Vector
      _airQuatYaw.setFromAxisAngle(_axisY, v.yaw || 0);
      _airQuatPitch.setFromAxisAngle(_axisX, v.pitch || 0);
      _airQuatRoll.setFromAxisAngle(_axisZ, v.roll || 0);
      _airQuatCombined.copy(_airQuatYaw).multiply(_airQuatPitch).multiply(_airQuatRoll);

      const noseDir = _vehScratchA.set(0, 0, -1).applyQuaternion(_airQuatCombined).normalize();
      if (!v._aeroFlightDir) {
        v._aeroFlightDir = noseDir.clone();
      } else {
        v._aeroFlightDir.lerp(noseDir, Math.min(1, dt * (onRunway ? 14.0 : 7.2))).normalize();
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
        //    ONLY triggers once the aircraft has actually left the runway (`v.hasLeftRunwayOnce`) or is moving at flight speed,
        //    so sitting parked on the apron, boarding, or closing Inventory can NEVER false-trigger a ground crash!
        if (nextY <= newGroundH + 1.15 && (v.hasLeftRunwayOnce || v.isStalling)) {
          const vertSinkMs = flightDir.y * v.forwardSpeed + stallSinkY;
          const aheadGroundH = this.world
            ? this.world.getGroundHeightAt(v.pos.x + flightDir.x * 5.0, v.pos.z + flightDir.z * 5.0)
            : newGroundH;
          const hittingSteepSlope = Boolean(v.hasLeftRunwayOnce && aheadGroundH - newGroundH > 1.05 && v.forwardSpeed > 22);
          const noseDiving = Boolean(v.hasLeftRunwayOnce && ((v.pitch < -0.18 && v.forwardSpeed > 18) || vertSinkMs < -8.5));
          const wingtipStrike = Boolean(v.hasLeftRunwayOnce && Math.abs(v.roll || 0) > 0.36 && v.forwardSpeed > 20);
          const highSpeedTouchdown = Boolean(v.hasLeftRunwayOnce && v.forwardSpeed > 34 && vertSinkMs < -4.5);

          if (v.isStalling || hittingSteepSlope || noseDiving || wingtipStrike || highSpeedTouchdown) {
            events.emit('telemetry:event', {
              type: 'AIRCRAFT_CRASH_IMPACT',
              payload: {
                vehicle: v.name,
                speedKmh: Math.round((v.forwardSpeed || 0) * 3.6),
                pitchDeg: Math.round(((v.pitch || 0) * 180) / Math.PI),
                rollDeg: Math.round(((v.roll || 0) * 180) / Math.PI),
                vertSinkMs: Number(vertSinkMs.toFixed(2)),
                hasLeftRunwayOnce: Boolean(v.hasLeftRunwayOnce),
                reasons: {
                  stalling: Boolean(v.isStalling),
                  steepSlope: hittingSteepSlope,
                  noseDiving,
                  wingtipStrike,
                  highSpeedTouchdown
                }
              }
            });
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
        // COLLISION AVOIDANCE: AUTO ON (Default — Full Auto-GCAS Terrain, Building, Stall & Airspace Cushion)
        const recoveredStallThisFrame = Boolean(
          v.isStalling && v.hasLeftRunwayOnce && nextY <= newGroundH + 26.0
        );
        if (recoveredStallThisFrame) {
          // Auto-GCAS emergency throttle & angle-of-attack recovery prevents fatal stall crashes when protection is ON
          v.isStalling = false;
          v.stallSinkVel = 0;
          v.throttle = Math.max(v.throttle || 0, 0.52 * maxThrottleCap);
          v.forwardSpeed = Math.max(v.forwardSpeed || 0, (stallSpd || 28) * 1.18);
          v.pitch = Math.max(v.pitch || 0, 0.12);
          v.flightFSM?.send(AIRCRAFT_FLIGHT_EVENTS.RECOVER_STALL);
        }
        if (!insideSecretCaveNow && v.hasLeftRunwayOnce) {
          const obsTopY = this.getAircraftObstacleHeightAt(v.pos.x, v.pos.z, nextY);
          const hasHardObstacleBelow = obsTopY > newGroundH + 1.5;
          const nearHqAirfield = Math.abs(v.pos.x) > 2460 && Math.abs(v.pos.z) < 280;
          const intentionalLanding =
            !recoveredStallThisFrame &&
            !v.isStalling &&
            !hasHardObstacleBelow &&
            (!isGunship || Boolean(v.gunshipManualFlight)) &&
            (throttleInput < 0 ||
              gunshipClimbKey < 0 ||
              arrowPitchInput < 0 ||
              (v.throttle ?? 0.5) <= 0.38 ||
              (isGunship &&
                Boolean(v.gunshipManualFlight) &&
                (this.pitch < -0.08 || (v.targetGunshipAlt ?? 200) <= 45)) ||
              (nearHqAirfield &&
                (v.forwardSpeed || 0) < 62 &&
                (this.pitch < -0.04 || (v.throttle ?? 0.5) <= 0.45))) &&
            (v.pitch || 0) > -0.52;
          const minAirborneFloor =
            (onRunway && (v.forwardSpeed || 0) < 45) || intentionalLanding
              ? newGroundH
              : newGroundH + (isWright ? 6.0 : 12.0);
          const requiredSafeY = Math.max(
            minAirborneFloor,
            hasHardObstacleBelow ? obsTopY + 5.0 : minAirborneFloor
          );
          if (nextY < requiredSafeY) {
            v.pos.y = THREE.MathUtils.clamp(
              THREE.MathUtils.lerp(Math.max(v.pos.y, newGroundH), requiredSafeY + 1.5, Math.min(1, dt * 8.5)),
              newGroundH,
              maxAirspaceAlt
            );
            v.pitch = Math.max(v.pitch || 0, 0.14);
          } else {
            v.pos.y = THREE.MathUtils.clamp(nextY, newGroundH, maxAirspaceAlt);
            if (intentionalLanding && v.pos.y <= newGroundH + 2.2) {
              // Smooth main-gear touchdown flare, landing-gear settle onto tarmac & wheel/reverse-prop rollout braking!
              v.pitch = THREE.MathUtils.lerp(v.pitch || 0, 0, Math.min(1, dt * 8.5));
              v.roll = THREE.MathUtils.lerp(v.roll || 0, 0, Math.min(1, dt * 8.5));
              if (throttleInput < 0 || gunshipClimbKey < 0 || (v.throttle ?? 0) < 0.15) {
                v.forwardSpeed = Math.max(0, (v.forwardSpeed || 0) - 28.0 * dt);
              }
              if (
                throttleInput < 0 ||
                gunshipClimbKey < 0 ||
                (v.throttle ?? 0) < 0.15 ||
                (v.forwardSpeed || 0) < 18
              ) {
                v.pos.y = THREE.MathUtils.lerp(v.pos.y, newGroundH, Math.min(1, dt * 12.0));
                if (v.pos.y <= newGroundH + 0.08) v.pos.y = newGroundH;
              }
              if ((v.forwardSpeed || 0) < 16 && v.pos.y <= newGroundH + 0.5) {
                v.hasLeftRunwayOnce = false;
              }
            }
          }
          // Mid-air Traffic Collision Avoidance (TCAS): gently separate from nearby airborne aircraft within 24m
          if (this.vehicleManager?.vehicles) {
            const allVehs = this.vehicleManager.vehicles;
            for (let oi = 0; oi < allVehs.length; oi++) {
              const ov = allVehs[oi];
              if (!ov || ov === v || ov.dead || !ov.isAircraft) continue;
              const dxA = v.pos.x - ov.pos.x;
              const dyA = v.pos.y - ov.pos.y;
              const dzA = v.pos.z - ov.pos.z;
              const distSqA = dxA * dxA + dyA * dyA + dzA * dzA;
              if (distSqA < 24 * 24 && ov.pos.y > newGroundH + 8.0) {
                const liftDir = dyA >= -2.0 ? 1 : -1;
                v.pos.y = THREE.MathUtils.clamp(
                  v.pos.y + liftDir * 18.0 * dt,
                  requiredSafeY,
                  maxAirspaceAlt
                );
              }
            }
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
      if ((v.sensorGlitchTimer || 0) > 0) {
        v.sensorGlitchTimer = Math.max(0, v.sensorGlitchTimer - dt);
      }
      if ((v.opticsGlitchTimer || 0) > 0) {
        v.opticsGlitchTimer = Math.max(0, v.opticsGlitchTimer - dt);
      }
      v.mesh.position.copy(v.pos);
      v.mesh.quaternion.copy(_airQuatCombined);
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

    _airQuatYaw.setFromAxisAngle(_axisY, v.yaw || 0);
    _airQuatPitch.setFromAxisAngle(_axisX, v.pitch || 0);
    _airQuatRoll.setFromAxisAngle(_axisZ, v.roll || 0);
    _airQuatCombined.copy(_airQuatYaw).multiply(_airQuatPitch).multiply(_airQuatRoll);

    const flightDir = new THREE.Vector3(0, 0, -1).applyQuaternion(_airQuatCombined).normalize();
    const airUpVec = _vehScratchB.set(0, 1, 0).applyQuaternion(_airQuatCombined).normalize();

    // 4. Position Camera across 3 Modes ('CHASE_3P' | 'COCKPIT_1P' | 'OPTIC_NOSE') with Loop-Safe Quaternions!
    const camMode =
      this.vehicleCameraMode || (this.thirdPersonVehicle ? 'CHASE_3P' : 'COCKPIT_1P');
    this.thirdPersonVehicle = camMode === 'CHASE_3P';
    const isB2Spirit = v.aircraftRole === 'b2_spirit';
    const isWrightFlyer = v.aircraftRole === 'wright_flyer';

    // Hide own AC-130 airframe in BOTH 1P Left-Window Pylon HUD (`COCKPIT_1P`) AND Belly EO/IR Sensor Pod (`OPTIC_NOSE`)
    // so the 17.8m high C-130 left wing, turboprop nacelles & sponsons NEVER block the view when banked 20°–45°!
    // (Full 3D AC-130 airframe + spinning propellers + port cannon barrels remain 100% visible in `CHASE_3P` Overwatch!)
    if (isGunship && v.mesh) {
      v.mesh.visible = camMode === 'CHASE_3P';
    } else if (v.mesh && !v.dead) {
      v.mesh.visible = true;
    }
    if (Array.isArray(v.mesh?.userData?.cockpitCanopyParts)) {
      const showExtCanopy = camMode !== 'COCKPIT_1P';
      for (const p of v.mesh.userData.cockpitCanopyParts) {
        if (p) p.visible = showExtCanopy;
      }
    }

    let chaseYaw = this.yaw;
    let chasePitch = this.pitch;
    // In Easy Stabilized Helicopter Mode (`[G]` ON), Hover-Hold `[R]`, or Crew Seats (`F2+`),
    // camera & weapon crosshair track 1:1 with mouse (`this.yaw`, `this.pitch`) with level horizon (`camRoll = 0`)
    // so aiming the gun NEVER lags behind or fights helicopter movement!
    const isHeliFreeAim = Boolean(
      v.isHelicopter &&
        (this.aircraftCollisionAvoidance !== false ||
          v.heliHoverHold ||
          (this.vehicleSeatIndex || 0) >= 1)
    );
    const hasFreeLookOffset =
      !isGunship &&
      !isHeliFreeAim &&
      Boolean(
        this.keys['AltLeft'] ||
          this.keys['AltRight'] ||
          v.levelAutopilot ||
          Math.abs(v.freeLookYaw || 0) > 0.002 ||
          Math.abs(v.freeLookPitch || 0) > 0.002
      );
    const hasSpiLock = !isGunship && Boolean(v.spiTargetPos);

    const isForwardBubbleCockpit =
      camMode === 'COCKPIT_1P' && !(isGunship && !v.gunshipManualFlight) && !isHeliFreeAim;
    if (isForwardBubbleCockpit && !hasFreeLookOffset && !hasSpiLock) {
      // Keep mouse-aim command bounded to the forward canopy field-of-view so you never wrap 180° behind your own seat
      let cmdYawDiff = this.yaw - (v.yaw || 0);
      while (cmdYawDiff > Math.PI) cmdYawDiff -= Math.PI * 2;
      while (cmdYawDiff < -Math.PI) cmdYawDiff += Math.PI * 2;
      this.yaw = (v.yaw || 0) + THREE.MathUtils.clamp(cmdYawDiff, -0.92, 0.92);
    }

    if (hasSpiLock) {
      const sdx = v.spiTargetPos.x - v.pos.x;
      const sdy = v.spiTargetPos.y - v.pos.y;
      const sdz = v.spiTargetPos.z - v.pos.z;
      const sHoriz = Math.max(0.5, Math.hypot(sdx, sdz));
      chaseYaw = Math.atan2(-sdx, -sdz) + (v.freeLookYaw || 0);
      chasePitch = THREE.MathUtils.clamp(Math.atan2(sdy, sHoriz) + (v.freeLookPitch || 0), -1.5, 1.25);
    } else if (hasFreeLookOffset) {
      chaseYaw = (v.yaw || 0) + (v.freeLookYaw || 0);
      chasePitch = THREE.MathUtils.clamp((v.pitch || 0) + (v.freeLookPitch || 0), -1.48, 1.35);
    } else if (isHeliFreeAim) {
      chaseYaw = this.yaw || 0;
      chasePitch = THREE.MathUtils.clamp(this.pitch || 0, -1.42, 1.25);
    } else if (isForwardBubbleCockpit) {
      // 1P Cockpit Camera MUST stay bolted 1:1 to the physical airframe (`v.yaw`, `v.pitch`, `v.roll`) —
      // NEVER turning ahead of the lagging airplane body! Mouse input steers the Flight-Director Ring (`this.yaw`, `this.pitch`).
      chaseYaw = v.yaw || 0;
      chasePitch = v.pitch || 0;
    } else if (!isGunship && camMode === 'CHASE_3P') {
      let camYawDiff = this.yaw - v.yaw;
      while (camYawDiff > Math.PI) camYawDiff -= Math.PI * 2;
      while (camYawDiff < -Math.PI) camYawDiff += Math.PI * 2;
      chaseYaw = v.yaw + camYawDiff * 0.52;
      let camPitchDiff = this.pitch - v.pitch;
      while (camPitchDiff > Math.PI) camPitchDiff -= Math.PI * 2;
      while (camPitchDiff < -Math.PI) camPitchDiff += Math.PI * 2;
      chasePitch = v.pitch + camPitchDiff * 0.65;
    }

    const aerobaticRollBlend =
      !isGunship && this.aircraftCollisionAvoidance === false
        ? THREE.MathUtils.smoothstep(Math.abs(v.roll || 0), 1.18, 2.15)
        : 0;
    const camRoll =
      hasSpiLock || hasFreeLookOffset || isHeliFreeAim
        ? 0
        : isForwardBubbleCockpit
        ? v.roll || 0
        : isGunship
        ? camMode === 'COCKPIT_1P'
          ? (v.roll || 0) * 0.45
          : 0
        : camMode === 'CHASE_3P'
        ? (v.roll || 0) * THREE.MathUtils.lerp(0.3, 1.0, aerobaticRollBlend)
        : (v.roll || 0) * THREE.MathUtils.lerp(0.82, 1.0, aerobaticRollBlend);

    _airQuatYaw.setFromAxisAngle(_axisY, chaseYaw);
    _airQuatPitch.setFromAxisAngle(_axisX, chasePitch + (this.recoilOffsetPitch || 0));
    _airQuatRoll.setFromAxisAngle(_axisZ, camRoll);
    _camQuatCombined.copy(_airQuatYaw).multiply(_airQuatPitch).multiply(_airQuatRoll);

    const lookDir = new THREE.Vector3(0, 0, -1).applyQuaternion(_camQuatCombined).normalize();
    const chaseUpVec = _vehScratchB.set(0, 1, 0).applyQuaternion(_camQuatCombined).normalize();

    if (camMode === 'CHASE_3P') {
      const pivotPos = v.pos.clone().addScaledVector(chaseUpVec, 2.2);
      const airGroundY = this.world ? this.world.getGroundHeightAt(v.pos.x, v.pos.z) : 0;
      const airAltAgl = v.pos.y - airGroundY;
      if (isGunship && !v.gunshipManualFlight) {
        // AC-130J Overwatch 3P: Placed behind & above lookDir on the outer ring so you look right OVER the banking AC-130J onto the FOB!
        const camPos = v.pos
          .clone()
          .add(new THREE.Vector3(0, 8.2, 0))
          .addScaledVector(lookDir, -24.5);
        if (airAltAgl < 42.0) {
          this.camera.position.copy(this.resolveCameraWallCollision(pivotPos, camPos, 0.45));
        } else {
          this.camera.position.copy(camPos);
        }
      } else {
        // Keep 3P Chase centered directly behind & above the jet/helicopter in camera space (`chaseUpVec`)
        const upDist = v.isHelicopter ? 5.4 : isGunship ? 6.2 : isB2Spirit ? 5.0 : isWrightFlyer ? 3.9 : 4.35;
        const backDist = v.isHelicopter ? -18.5 : isGunship ? -21.0 : isB2Spirit ? -19.5 : isWrightFlyer ? -14.2 : -16.8;
        const camPos = v.pos
          .clone()
          .addScaledVector(chaseUpVec, upDist)
          .addScaledVector(lookDir, backDist);
        if (airAltAgl < 42.0) {
          const resolved = this.resolveCameraWallCollision(pivotPos, camPos, 0.45);
          // Even near buildings/runways, never pull airborne 3P Chase camera inside the aircraft's own tailcone
          if (airAltAgl > 8.0 && resolved.distanceTo(pivotPos) < 9.5) {
            const safeDir = camPos.clone().sub(pivotPos).normalize();
            resolved.copy(pivotPos).addScaledVector(safeDir, 9.5);
            const rGround = this.world ? this.world.getGroundHeightAt(resolved.x, resolved.z) : 0;
            resolved.y = Math.max(resolved.y, rGround + 0.85);
          }
          this.camera.position.copy(resolved);
        } else {
          const rGround = this.world ? this.world.getGroundHeightAt(camPos.x, camPos.z) : 0;
          camPos.y = Math.max(camPos.y, rGround + 1.0);
          this.camera.position.copy(camPos);
        }
      }
    } else if (camMode === 'COCKPIT_1P') {
      // 1st-Person Interior Seat:
      // - AC-130J Pylon Orbit: Port Gunship Observation Window (-1.52, 1.78, 0.05) directly above the 3D 25mm/40mm/105mm barrels!
      // - Fighter / CAS / B-2: Raised cleanly above the y=1.875 fuselage spine so ZERO dark block sits in the middle of the screen!
      const seatLocal = _vehScratchA.set(
        isGunship && !v.gunshipManualFlight ? -1.78 : 0,
        isGunship
          ? v.gunshipManualFlight
            ? 2.48
            : 1.92
          : isB2Spirit
          ? 2.38
          : isWrightFlyer
          ? 1.82
          : 2.24,
        isGunship
          ? v.gunshipManualFlight
            ? -5.15
            : 0.05
          : isB2Spirit
          ? -3.35
          : isWrightFlyer
          ? -0.95
          : -2.65
      );
      seatLocal.applyQuaternion(_airQuatCombined);
      this.camera.position.copy(v.pos).add(seatLocal);
    } else {
      // 'OPTIC_NOSE': Unobstructed Chin/Belly EO/IR Sensor Turret (AC-130J) or Forward Nose HUD Cam
      if (isGunship) {
        const sensorLocal = _vehScratchA.set(-1.35, -0.45, -3.85).applyQuaternion(_airQuatCombined);
        this.camera.position.copy(v.pos).add(sensorLocal);
      } else {
        const noseLocal = _vehScratchA
          .set(0, isB2Spirit ? 1.42 : 1.72, isB2Spirit ? -5.85 : -6.95)
          .applyQuaternion(_airQuatCombined);
        this.camera.position.copy(v.pos).add(noseLocal);
      }
    }

    this.camera.quaternion.copy(_camQuatCombined);

    // Call of Duty AC-130 Weapon-Linked Optical FOV Hierarchy:
    // - [3] 105mm M102 Howitzer (Slot 2): 52° Wide Overwatch Lens (34° RMB Fine Zoom) — 1.4x / 2.2x
    // - [2] 40mm L/60 Bofors   (Slot 1): 34° Medium Tactical Lens (21° RMB Fine Zoom) — 2.2x / 3.6x
    // - [1] 25mm GAU-12 Gatling(Slot 0): 22° Narrow Tracking Lens (13.5° RMB Fine Zoom) — 3.4x / 5.5x
    const inGunshipOptic = Boolean(
      isGunship && (!v.gunshipManualFlight || camMode === 'OPTIC_NOSE') && camMode !== 'CHASE_3P'
    );
    let targetFov;
    if (isGunship && typeof v.customOpticFov === 'number' && camMode !== 'CHASE_3P') {
      targetFov = this.isAds ? Math.max(8.5, v.customOpticFov * 0.65) : v.customOpticFov;
    } else if (inGunshipOptic) {
      const slot = v.activeWeaponSlot || 0;
      const baseGunshipFov = slot === 2 ? 52 : slot === 1 ? 34 : 22;
      const zoomGunshipFov = slot === 2 ? 34 : slot === 1 ? 21 : 13.5;
      targetFov = this.isAds ? zoomGunshipFov : camMode === 'OPTIC_NOSE' ? baseGunshipFov : Math.min(64, baseGunshipFov + 14);
    } else if (isGunship && typeof v.customOpticFov === 'number') {
      targetFov = v.customOpticFov;
    } else {
      const rawAdsFov = v.sensorZoomFov || (isGunship ? 34 : 46);
      // In 3P External Chase, keep RMB zoom at a clean >= 46° tactical over-the-airframe FOV
      // (1P Cockpit & Nose Pod `[C]` get the full 22° Sniper XR telephoto zoom without your own tailfins blocking the view!)
      const adsFov = camMode === 'CHASE_3P' ? Math.max(46, rawAdsFov) : rawAdsFov;
      targetFov = this.isAds ? adsFov : throttleInput > 0 ? 82 : 76;
    }
    const nextFov = THREE.MathUtils.lerp(this.camera.fov, targetFov, Math.min(1, dt * 10));
    if (Math.abs(this.camera.fov - nextFov) > 0.02) {
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
    } else if (this.camera.fov !== targetFov) {
      this.camera.fov = targetFov;
      this.camera.updateProjectionMatrix();
    }

    const camOrigin = this.camera.getWorldPosition(new THREE.Vector3());
    const camDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();

    // 5. Real-Life Fire-Control Computer CCIP / Ballistic Gun Pipper on Terrain:
    // - Solves the ACTIVE weapon's actual trajectory:
    //   * AC-130 Gunship: Full 4,800m stabilized fire-control ray (never truncating in mid-air at 450m!)
    //   * B-2 Bomber / Fighter Bomb Mode ([3]): Free-fall ballistic bomb trajectory (flightDir * speed - 0.5*g*t^2)
    //   * Fighter / CAS Cannon & Rocket Modes ([1]/[2]): High-velocity cannon/rocket ballistic trajectory (360 m/s / 175 m/s)
    //     so diving nose-down shows the true gun impact point instead of a misleading slow bomb drop point behind you!
    const activeWpnSlot = v.activeWeaponSlot || 0;
    const isA2aMissileSelected = Boolean(v.aircraftRole === 'fighter' && activeWpnSlot === 1);
    const isBombOrdnanceSelected = Boolean(
      isB2Spirit ||
        (v.aircraftRole === 'wright_flyer' && activeWpnSlot === 1) ||
        (v.aircraftRole === 'fighter' && activeWpnSlot === 2) ||
        (v.aircraftRole === 'cas' && activeWpnSlot === 2) ||
        v.aircraftRole === 'bomber'
    );
    const bombInitSpd = Math.max(38, v.forwardSpeed || 48);
    const bombInitVel = _bombInitVelScratch.set(
      flightDir.x * bombInitSpd,
      flightDir.y * bombInitSpd - 6.0,
      flightDir.z * bombInitSpd
    );
    const bombGrav = PROJECTILES.JDAM_BOMB?.gravity || 26.0;

    if (!this._ccipPoint) this._ccipPoint = new THREE.Vector3();
    const ccipPos = this._ccipPoint;
    let ccipGrounded = false;
    if (isGunship) {
      const gunshipHit = this.computeVehicleAimTarget(camOrigin, camDir, v, 4800);
      ccipPos.copy(gunshipHit.point);
      ccipGrounded = true;
      if (typeof this.computeGunshipFcsSolution === 'function') {
        const fcsSpd =
          activeWpnSlot === 2
            ? Math.max(175, PROJECTILES.AC130_105MM?.speed || 175)
            : activeWpnSlot === 1
            ? Math.max(210, PROJECTILES.AC130_40MM?.speed || 210)
            : 460;
        const fcsGrav =
          activeWpnSlot === 2
            ? PROJECTILES.AC130_105MM?.gravity || 4.8
            : activeWpnSlot === 1
            ? PROJECTILES.AC130_40MM?.gravity || 2.2
            : 4.2;
        this.computeGunshipFcsSolution(ccipPos, camOrigin, v, fcsSpd, fcsGrav);
      }
    } else if (!isBombOrdnanceSelected) {
      // Cannon / Rocket True Curved Ballistic Ray-March Pipper:
      // Steps along the exact gravity-curved parabola (`noseMuzzle + camDir * v * t - 0.5 * g * t²`)
      // and stops at the FIRST terrain/target intersection — NEVER floating a mid-air ring in front of the plane!
      const isRocketMode = v.aircraftRole === 'cas' && activeWpnSlot === 1;
      const projSpd = isRocketMode ? (PROJECTILES.AIR_ROCKET?.speed || 175) : 360;
      const projGrav = isRocketMode ? (PROJECTILES.AIR_ROCKET?.gravity || 0.65) : 4.5;
      const ccipMuzzleOrigin = _vehScratchB.copy(v.pos).addScaledVector(flightDir, 4.2);
      const directHit = this.computeVehicleAimTarget(ccipMuzzleOrigin, camDir, v, 2100);
      const maxRayDist = Math.min(1850, Math.max(45, directHit.distance));
      const maxT = maxRayDist / projSpd;
      let hitFound = false;
      let prevX = ccipMuzzleOrigin.x;
      let prevY = ccipMuzzleOrigin.y;
      let prevZ = ccipMuzzleOrigin.z;
      const steps = 20;
      for (let si = 1; si <= steps; si++) {
        const t = (maxT * si) / steps;
        const sx = ccipMuzzleOrigin.x + camDir.x * projSpd * t;
        const sy = ccipMuzzleOrigin.y + camDir.y * projSpd * t - 0.5 * projGrav * t * t;
        const sz = ccipMuzzleOrigin.z + camDir.z * projSpd * t;
        const gh = this.world ? this.world.getGroundHeightAt(sx, sz) : 0;
        if (sy <= gh + 0.25) {
          const prevGh = this.world ? this.world.getGroundHeightAt(prevX, prevZ) : gh;
          const prevClear = Math.max(0, prevY - (prevGh + 0.25));
          const curDepth = Math.max(0.01, gh + 0.25 - sy);
          const frac = prevClear / (prevClear + curDepth);
          ccipPos.set(
            prevX + (sx - prevX) * frac,
            prevY + (sy - prevY) * frac,
            prevZ + (sz - prevZ) * frac
          );
          hitFound = true;
          ccipGrounded = true;
          break;
        }
        prevX = sx;
        prevY = sy;
        prevZ = sz;
      }
      if (!hitFound) {
        if (directHit.object && directHit.distance >= 20) {
          const tofEnt = directHit.distance / projSpd;
          ccipPos.set(
            directHit.point.x,
            directHit.point.y - 0.5 * projGrav * tofEnt * tofEnt,
            directHit.point.z
          );
          ccipGrounded = true;
        } else {
          ccipPos.set(prevX, prevY, prevZ);
          ccipGrounded = false;
        }
      }
    } else {
      ccipPos.copy(v.pos);
      _ccipSimVel.copy(bombInitVel);
      const simStep = 0.25;
      for (let step = 0; step < 96; step++) {
        const prevX = ccipPos.x;
        const prevY = ccipPos.y;
        const prevZ = ccipPos.z;
        _ccipSimVel.y -= bombGrav * simStep;
        ccipPos.x += _ccipSimVel.x * simStep;
        ccipPos.y += _ccipSimVel.y * simStep;
        ccipPos.z += _ccipSimVel.z * simStep;
        const gh = this.world ? this.world.getGroundHeightAt(ccipPos.x, ccipPos.z) : 0;
        if (ccipPos.y <= gh + 0.5) {
          let loX = prevX;
          let loY = prevY;
          let loZ = prevZ;
          let hiX = ccipPos.x;
          let hiY = ccipPos.y;
          let hiZ = ccipPos.z;
          for (let b = 0; b < 2; b++) {
            const midX = (loX + hiX) * 0.5;
            const midY = (loY + hiY) * 0.5;
            const midZ = (loZ + hiZ) * 0.5;
            const midGh = this.world ? this.world.getGroundHeightAt(midX, midZ) : 0;
            if (midY <= midGh + 0.5) {
              hiX = midX;
              hiY = midY;
              hiZ = midZ;
            } else {
              loX = midX;
              loY = midY;
              loZ = midZ;
            }
          }
          const finalGh = this.world ? this.world.getGroundHeightAt(hiX, hiZ) : 0;
          ccipPos.set(hiX, finalGh + 0.35, hiZ);
          ccipGrounded = true;
          break;
        }
      }
    }
    this.aircraftCcipPoint =
      !isA2aMissileSelected &&
      !(isGunship && v.gunshipManualFlight) &&
      altAgl >= 12.0 &&
      !v.autoFlightMode &&
      (ccipGrounded || isGunship)
        ? ccipPos
        : null;

    if (!this.ccipMarkerMesh && this.scene) {
      this.ccipMarkerMesh = new THREE.Mesh(_ccipRingGeo, _ccipRingMat);
      this.scene.add(this.ccipMarkerMesh);
    }
    if (this.ccipMarkerMesh) {
      // ONLY show the 3D ground blast-radius ring when Bomb Ordnance is selected AND the simulated bomb actually hits terrain >= 42m away!
      // NEVER place a 12.4m 3D orange ring in mid-air in front of the plane during cannon/rocket flight!
      const show3dCcip = Boolean(
        !isGunship &&
          altAgl >= 12.0 &&
          !v.autoFlightMode &&
          isBombOrdnanceSelected &&
          ccipGrounded &&
          ccipPos.distanceToSquared(camOrigin) >= 42 * 42
      );
      this.ccipMarkerMesh.visible = show3dCcip;
      if (show3dCcip) {
        this.ccipMarkerMesh.position.copy(ccipPos);
        this.ccipMarkerMesh.scale.setScalar(isB2Spirit ? 2.25 : 1.0);
        if (this.ccipMarkerMesh.material) {
          this.ccipMarkerMesh.material.color.setHex(isB2Spirit ? 0x00d2d3 : 0xff9f1a);
        }
      }
    }
    this.updateGunshipOrbitVisualizer(v);
    this.updateRunwayFlightDirector(v);

    // 6. Air-to-Air Active Radar Lock-On Scanner (AN/APG-82 ±58° Physical Nose Gimbal Cone + HUD Seeker Cone up to 2,100m!)
    // Real F-15C/E/EX AN/APG-63/82 AESA radar is mounted in the aircraft nose (`±60°` azimuth/elevation mechanical/electronic gimbal limit):
    // Turning the pilot viewport sideways (`Alt` Free-Look or 3P camera > 58° off the nose) CANNOT lock AIM-120D AMRAAM off the wing!
    const myGroundHForRadar = this.world ? this.world.getGroundHeightAt(v.pos.x, v.pos.z) : 0;
    const myAltAglForRadar = Math.max(0, v.pos.y - myGroundHForRadar);
    const maxRadarRange = 2100 * (v.lockRangeMult || 1.0);
    const canUseA2aRadar = !isB2Spirit && !isGunship && v.aircraftRole !== 'cas';
    const minNoseGimbalDot = v.isHelicopter ? -0.15 : 0.53; // ±58° physical nose radar gimbal cone (`cos(58°) ≈ 0.53`)
    let bestAirTarget = null;
    let bestAirDot = 0.78; // ~38° pilot sight / HUD acquisition cone within radar gimbal
    let gimbalBlockedBandit = false;
    // Cannot lock onto distant targets while our own plane is still parked on the runway (< 10m AGL)
    if (canUseA2aRadar && myAltAglForRadar >= 10.0 && this.vehicleManager && Array.isArray(this.vehicleManager.vehicles)) {
      for (const other of this.vehicleManager.vehicles) {
        if (!other.isAircraft || other === v || other.dead || other.isShotDown || other.team === this.team) continue;
        // Enemy aircraft flying below 24m AGL (ground-effect radar clutter masking) or within 3.5s of takeoff evade radar lock!
        const otherGroundH = this.world ? this.world.getGroundHeightAt(other.pos.x, other.pos.z) : 0;
        const otherAltAgl = Math.max(0, other.pos.y - otherGroundH);
        if (otherAltAgl < 24.0 || (other.airborneRadarTimer || 0) < 3.5 || other.isLowAltRadarMasked) continue;
        const toOther = other.pos.clone().sub(v.pos);
        const dist = toOther.length();
        if (dist < 12 || dist > maxRadarRange) continue;
        toOther.divideScalar(dist);
        const camDot = toOther.dot(camDir);
        const noseDot = toOther.dot(flightDir);
        if (camDot > 0.78 && noseDot < minNoseGimbalDot) {
          gimbalBlockedBandit = true;
          continue;
        }
        if (noseDot >= minNoseGimbalDot && camDot > bestAirDot) {
          bestAirDot = camDot;
          bestAirTarget = other;
        }
      }
    }
    this.aircraftRadarGimbalExceeded = Boolean(gimbalBlockedBandit && !bestAirTarget);

    // ~1.15s Radar/IR Seeker Lock-On required before launching Shoot-and-Forget A2A Missiles (slower when Avionics < 40%)!
    const avionicsLockMult =
      v.airframeParts && (v.airframeParts.avionics ?? 100) < 40 ? 0.55 : 1.0;
    updateTargetLockScanner(this, bestAirTarget, dt, 0.88 * avionicsLockMult);

    // Cockpit RWR (Radar Warning Receiver) Tracking vs. Missile-Inbound Audio!
    let rwrMissileInbound = false;
    let rwrRadarTracked = false;
    if (this.world && Array.isArray(this.world.projectiles)) {
      for (let pi = 0; pi < this.world.projectiles.length; pi++) {
        const pr = this.world.projectiles[pi];
        if (pr && pr.type === 'a2a_missile' && pr.targetVehicle === v) {
          rwrMissileInbound = true;
          break;
        }
      }
    }
    if (!rwrMissileInbound && myAltAglForRadar >= 24.0 && !(v.flareActiveTimer > 0) && this.vehicleManager?.vehicles) {
      for (let oi = 0; oi < this.vehicleManager.vehicles.length; oi++) {
        const ov = this.vehicleManager.vehicles[oi];
        if (!ov || ov.dead || ov.team === v.team) continue;
        if (!(ov.isAircraft || ov.type === 'aa' || ov.type === 'emplace_aa')) continue;
        if (!ov.driver && !ov.npcDriver && !ov.aiPilotActive && !ov.remoteDriverId) continue;
        const dSq = ov.pos.distanceToSquared(v.pos);
        if (dSq > 1350 * 1350) continue;
        const lookYaw = ov.isAircraft ? ov.yaw || 0 : ov.turretYaw ?? ov.yaw ?? 0;
        const fwdX = -Math.sin(lookYaw);
        const fwdZ = -Math.cos(lookYaw);
        const dx = v.pos.x - ov.pos.x;
        const dz = v.pos.z - ov.pos.z;
        const hLen = Math.hypot(dx, dz) || 1;
        if ((dx * fwdX + dz * fwdZ) / hLen >= 0.82) {
          rwrRadarTracked = true;
          break;
        }
      }
    }
    v.rwrMissileInbound = rwrMissileInbound;
    v.rwrRadarTracked = rwrRadarTracked;
    if (rwrMissileInbound) {
      sound.playRwrTone?.('missile_inbound');
      const nowMs = performance.now();
      if (nowMs - (v._lastRwrWarnBannerMs || 0) > 3800 && this.onAwardXp) {
        v._lastRwrWarnBannerMs = nowMs;
        this.onAwardXp(0, '🚨 RWR MISSILE LAUNCH INBOUND — DEPLOY [X] ECM FLARES OR DIVE <24M!');
      }
    } else if (rwrRadarTracked) {
      sound.playRwrTone?.('track');
    }

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
    const fireSuppressed = performance.now() < (this._suppressFireUntil || 0) || this.isModalOpen(true);
    const activeSlot = v.activeWeaponSlot || 0;
    const wantPrimary = !fireSuppressed && Boolean(this.isFiring);
    // In Helicopters, `[Space]` is dedicated to Collective Climb UP — weapons fire cleanly via `[LMB]` across Slots [1]/[2]/[3]!
    const wantSpaceOrdnance = !fireSuppressed && !v.isHelicopter && Boolean(this.keys['Space']);

    // Compute true 3D world-space muzzle tip:
    // - On AC-130 Gunship: exact Port-Side (-X) Embrasure Barrel Outer Tip matching `vehicle-model.js`:
    //     Slot [1] 25mm GAU-12  -> forward-port (basePortX - 1.43, 1.56, -2.05)
    //     Slot [2] 40mm Bofors  -> mid-port     (basePortX - 1.88, 1.48, +0.15)
    //     Slot [3] 105mm M102   -> aft-port     (basePortX - 2.33, 1.38, +2.35)
    //   so tracers & shells streak straight out of the physical left-side gun port with ZERO mid-air camera kink!
    const getGunshipPortMuzzle = (slotIdx) => {
      const isUsHull = v.team !== 'RU';
      const basePortX = isUsHull ? -1.35 : -1.12;
      const localTip =
        slotIdx === 2
          ? new THREE.Vector3(basePortX - 2.33, 1.38, 2.35)
          : slotIdx === 1
          ? new THREE.Vector3(basePortX - 1.88, 1.48, 0.15)
          : new THREE.Vector3(basePortX - 1.43, 1.56, -2.05);
      localTip.applyQuaternion(_airQuatCombined);
      const worldTip = v.pos.clone().add(localTip);
      if (worldTip.y < myGroundHForRadar + 1.4) {
        worldTip.y = myGroundHForRadar + 1.4;
      }
      return worldTip;
    };

    const noseMuzzle = isGunship
      ? getGunshipPortMuzzle(activeSlot)
      : v.pos.clone().addScaledVector(flightDir, 6.2);
    if (noseMuzzle.y < myGroundHForRadar + 1.4) {
      noseMuzzle.y = myGroundHForRadar + 1.4;
    }

    if (wantPrimary && v.fireCooldown <= 0) {
      if (v.aircraftRole === 'heli_transport') {
        if (activeSlot === 1 || activeSlot === 2) {
          v.maxFireCooldown = activeSlot === 1 ? 0.34 : 1.35;
          v.fireCooldown = 0.22;
          v.coaxCooldown = 0;
        } else {
          // UH-60M Black Hawk / Mi-8AMTSh [1]: Twin 7.62×51mm NATO M134 Door Miniguns (1,500 RPM Solid/API Tracer Stream!)
          // Real 7.62mm NATO fires high-velocity solid/API bullets (ZERO explosive splash, 0 hull pen vs Tanks/APCs,
          // while tearing up soft trucks, infantry, and enemy helicopter tailbooms/turboshafts/rotors!).
          if (!this.consumeVehicleOrdnance(v, 'slot0', 1, 'TWIN M134 MINIGUN')) {
            return;
          }
          v.maxFireCooldown = 60 / 1500;
          v.fireCooldown = v.maxFireCooldown;
          v.coaxHeat = Math.min(1.0, (v.coaxHeat || 0) + 0.008);
          this.recoilOffsetPitch += 0.0004;
          this.addShake(0.018);
          sound.playGunshot('lmg', 0);

          const spread = 0.0028;
          const rawMiniDir = camDir
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
            ? this.applyDogfightLeadConvergence(camOrigin, rawMiniDir, 680, 2.2)
            : rawMiniDir;
          this.fireBallisticRay(
            camOrigin,
            shotDir,
            46,
            2.0,
            48,
            v.team === 'RU' ? '7.62MM PKT DOOR MG' : '7.62MM M134 MINIGUN',
            1.45,
            {
              isMountedMg: true,
              muzzleVelocity: 680,
              bulletGravity: 2.2,
              maxEffectiveRange: 650,
              tracerEveryShots: 1
            },
            1,
            noseMuzzle
          );
        }
      } else if (v.aircraftRole === 'heli_attack') {
        if (activeSlot === 0) {
          // AH-64E Apache Longbow / Ka-52 Alligator [1]: 30mm M230 / 2A42 Chin HEDP Chain Gun (650 RPM Aimed to Crosshair!)
          if (!this.consumeVehicleOrdnance(v, 'slot0', 1, '30MM M230 CHAIN GUN')) {
            return;
          }
          v.maxFireCooldown = 60 / 650;
          v.fireCooldown = v.maxFireCooldown;
          v.coaxHeat = Math.min(1.0, (v.coaxHeat || 0) + 0.014);
          this.recoilOffsetPitch += 0.0012;
          this.addShake(0.04);
          sound.playGunshot('autocannon', 0);

          const spread = 0.0024;
          const shotDir = camDir
            .clone()
            .add(
              new THREE.Vector3(
                (Math.random() - 0.5) * spread,
                (Math.random() - 0.5) * spread,
                (Math.random() - 0.5) * spread
              )
            )
            .normalize();
          const chainLbl = v.team === 'RU' ? '30MM 2A42 AUTOCANNON' : '30MM M230 HEDP CHAIN GUN';
          this._gauBurstCount = ((this._gauBurstCount || 0) + 1) % 2;
          const hedpSplash =
            this._gauBurstCount === 0
              ? { radius: 3.8, damage: 115, weaponName: chainLbl }
              : null;
          this.fireBallisticRay(
            camOrigin,
            shotDir,
            92,
            2.0,
            165,
            chainLbl,
            2.3,
            {
              isMountedMg: true,
              muzzleVelocity: 420,
              bulletGravity: 3.6,
              maxEffectiveRange: 1250,
              tracerEveryShots: 1,
              explosiveSplash: hedpSplash
            },
            1,
            noseMuzzle
          );
        } else if (activeSlot === 1) {
          v.maxFireCooldown = 0.32;
          v.fireCooldown = v.maxFireCooldown;
          v.coaxCooldown = 0;
        } else {
          // AH-64E Apache / Ka-52 Alligator [3]: AGM-114L Longbow Hellfire / 9K121 Vikhr Top-Attack Tank-Buster ATGM!
          const hfLabel = v.team === 'RU' ? '9K121 VIKHR LASER ATGM' : 'AGM-114L HELLFIRE ATGM';
          if (!this.consumeVehicleOrdnance(v, 'slot2', 1, hfLabel)) {
            return;
          }
          v.maxFireCooldown = 1.35;
          v.fireCooldown = v.maxFireCooldown;
          this.addShake(0.24);
          sound.playRocketLaunch?.(0);

          const aimHit = this.computeVehicleAimTarget(camOrigin, camDir, v, 1600);
          let hellfireTarget = null;
          let bestScore = Infinity;
          const allVehs = this.vehicleManager?.vehicles;
          if (Array.isArray(allVehs)) {
            for (let vi = 0; vi < allVehs.length; vi++) {
              const cand = allVehs[vi];
              if (!cand || cand.dead || cand === v || (v.team && cand.team === v.team)) continue;
              const toCand = cand.pos.clone().sub(camOrigin);
              const distC = toCand.length();
              if (distC < 14 || distC > 1600) continue;
              const dotC = toCand.divideScalar(distC).dot(camDir);
              if (dotC < 0.92) continue;
              const anglePenalty = (1 - dotC) * 1600;
              const score = distC * 0.3 + anglePenalty;
              if (score < bestScore) {
                bestScore = score;
                hellfireTarget = cand;
              }
            }
          }

          const tgtPt = hellfireTarget
            ? new THREE.Vector3(hellfireTarget.pos.x, hellfireTarget.pos.y + 1.4, hellfireTarget.pos.z)
            : aimHit.point;
          const hfDir = tgtPt.clone().sub(noseMuzzle).normalize();
          const hfMesh = new THREE.Mesh(_a2aMissileGeo, _a2aMissileMat);
          hfMesh.position.copy(noseMuzzle);
          hfMesh.lookAt(tgtPt);
          this.scene.add(hfMesh);

          this.world.projectiles.push({
            type: 'air_rocket',
            weaponName: hfLabel,
            weaponLabel: hfLabel,
            mesh: hfMesh,
            vel: hfDir.multiplyScalar(235),
            gravity: hellfireTarget ? 0 : 0.25,
            life: 14.0,
            turnRate: hellfireTarget ? 4.6 : 0,
            targetVehicle: hellfireTarget,
            blastRadius: 8.8,
            blastDamage: 820,
            owner: this
          });
          if (this.onAwardXp) {
            const lockTxt = hellfireTarget
              ? `LONGBOW LOCK ON ${hellfireTarget.name.split(' (')[0]}`
              : 'LASER BORESIGHT TRACK';
            this.onAwardXp(0, `🎯🚀 ${hfLabel} AWAY (${lockTxt})!`);
          }
        }
      } else if (isWrightFlyer && (activeSlot === 0 || activeSlot === 2)) {
        // 1903 Wright Flyer I [1 / 3]: Hand-Cranked Brass Gatling MG (840 RPM Explosive Brass Slugs!)
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
        // Northrop B-2A Spirit [1]: 80× Mk-82 Rotary Carpet Bomb Bay (2 full carpet passes = 16× 5-bomb waves!)
        if (!this.consumeVehicleOrdnance(v, 'slot0', 1, 'B-2 MK-82 CARPET BAY')) {
          return;
        }
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

          const waveVel = bombInitVel
            .clone()
            .addScaledVector(rightVec, lat * 1.45)
            .addScaledVector(flightDir, (bIdx - 2) * 3.5);
          const cBombMesh = new THREE.Mesh(_b2CarpetBombGeo, _b2CarpetBombMat);
          cBombMesh.position.copy(dropPos);
          _bombLookAtScratch.copy(dropPos).add(waveVel);
          cBombMesh.lookAt(_bombLookAtScratch);
          this.scene.add(cBombMesh);

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
      } else if (isB2Spirit && (activeSlot === 1 || activeSlot === 2)) {
        // Northrop B-2A Spirit [2] GBU-57 MOP & [3] GBU-31 2,000lb JDAM: Pure Stealth Bomber (ZERO forward guns — route LMB to bomb bay!)
        v.maxFireCooldown = activeSlot === 2 ? 1.15 : 2.4;
        v.fireCooldown = v.maxFireCooldown;
        v.coaxCooldown = 0;
      } else if (v.aircraftRole === 'cas' && activeSlot === 0) {
        // A-10C / Su-25 30mm GAU-8/A Avenger Rotary Cannon ("BRRRT!" + Speed-of-Sound Delayed Roar!)
        if (!this.consumeVehicleOrdnance(v, 'slot0', 1, '30MM GAU-8 AVENGER')) {
          return;
        }
        const gauRpm = 1320;
        v.maxFireCooldown = 60 / gauRpm;
        v.fireCooldown = v.maxFireCooldown;
        v.coaxHeat = Math.min(1.0, (v.coaxHeat || 0) + 0.014);
        this.recoilOffsetPitch += 0.0009;
        this.addShake(0.045);
        sound.playGunshot('autocannon', 0);
        sound.playDelayedA10Brrrt?.(Math.max(85, myAltAglForRadar * 1.15), 0);

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
        // Subsonic A-10 / Su-25 30mm GAU-8 is a pure ground-attack cannon (NO magnetic dogfight auto-lead onto fast jets/B-2s!)
        const shotDir = rawGauDir;

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
      } else if (v.aircraftRole === 'cas' && activeSlot === 1) {
        // A-10C / Su-25 [2] LMB: Fire Hydra-70 Unguided Rocket Pod via secondary block (never fall through to 20mm Vulcan!)
        v.maxFireCooldown = 0.34;
        v.fireCooldown = v.maxFireCooldown;
        v.coaxCooldown = 0;
      } else if (v.aircraftRole === 'cas' && activeSlot === 2) {
        // A-10C / Su-25 [3] LMB: AGM-65G Maverick (RU: Kh-29T) Electro-Optical TV-Guided Anti-Tank Missile!
        if (!this.consumeVehicleOrdnance(v, 'slot2', 1, 'AGM-65G MAVERICK')) {
          return;
        }
        v.maxFireCooldown = 1.55;
        v.fireCooldown = v.maxFireCooldown;
        this.addShake(0.24);
        sound.playRocketLaunch?.(0);

        const aimHit = this.computeVehicleAimTarget(camOrigin, camDir, v, 1450);
        let maverickTarget = null;
        let bestScore = Infinity;
        const allVehs = this.vehicleManager?.vehicles;
        if (Array.isArray(allVehs)) {
          for (let vi = 0; vi < allVehs.length; vi++) {
            const cand = allVehs[vi];
            if (!cand || cand.dead || cand === v || (v.team && cand.team === v.team)) continue;
            const toCand = cand.pos.clone().sub(camOrigin);
            const distC = toCand.length();
            if (distC < 18 || distC > 1450) continue;
            const dotC = toCand.divideScalar(distC).dot(camDir);
            if (dotC < 0.94) continue; // ~20° electro-optical TV seeker cone
            const anglePenalty = (1 - dotC) * 1800;
            const airPenalty = cand.isAircraft ? 600 : 0;
            const score = distC * 0.35 + anglePenalty + airPenalty;
            if (score < bestScore) {
              bestScore = score;
              maverickTarget = cand;
            }
          }
        }

        const tgtPoint = maverickTarget
          ? new THREE.Vector3(maverickTarget.pos.x, maverickTarget.pos.y + 1.35, maverickTarget.pos.z)
          : aimHit.point;
        const mavDir = tgtPoint.clone().sub(noseMuzzle).normalize();
        const mavMesh = new THREE.Mesh(_a2aMissileGeo, _a2aMissileMat);
        mavMesh.position.copy(noseMuzzle);
        mavMesh.lookAt(tgtPoint);
        this.scene.add(mavMesh);

        const mavLabel = v.team === 'RU' ? 'KH-29T TV-GUIDED ATGM' : 'AGM-65G MAVERICK ATGM';
        this.world.projectiles.push({
          type: 'air_rocket',
          weaponName: mavLabel,
          weaponLabel: mavLabel,
          mesh: mavMesh,
          vel: mavDir.multiplyScalar(215),
          gravity: maverickTarget ? 0 : 0.35,
          life: 14.0,
          turnRate: maverickTarget ? 3.8 : 0,
          targetVehicle: maverickTarget,
          blastRadius: 8.8,
          blastDamage: 580,
          owner: this
        });
        if (this.onAwardXp) {
          const lockNote = maverickTarget
            ? `LOCKED ON ${maverickTarget.name.split(' (')[0]}`
            : 'OPTICAL BORESIGHT TRACK';
          this.onAwardXp(0, `🎯 RIFLE! ${mavLabel} LAUNCHED (${lockNote})!`);
        }
      } else if (isGunship) {
        const aimHit = this.computeVehicleAimTarget(camOrigin, camDir, v, Math.max(420, v.slantRangeM || 420));
        // Real-Life AC-130 Port-Side Gunship Geometry:
        // ALL cannons (25mm GAU-12, 40mm Bofors, 105mm M102) fire strictly out the LEFT (PORT) fuselage side!
        // In Forward Transit Mode (`v.gunshipManualFlight`) or 3P Chase looking forward/starboard, block unrealistic nose/starboard firing!
        const portBeamYaw = (v.yaw || 0) + Math.PI * 0.5;
        const checkPortFiringSector = (dirVec) => {
          const horizLen = Math.hypot(dirVec.x, dirVec.z);
          if (horizLen <= 1e-4) return true;
          const shotYaw = Math.atan2(-dirVec.x, -dirVec.z);
          let yawOff = shotYaw - portBeamYaw;
          while (yawOff > Math.PI) yawOff -= Math.PI * 2;
          while (yawOff < -Math.PI) yawOff += Math.PI * 2;
          const maxSector = v.gunshipManualFlight
            ? 1.05
            : Math.max(0.78, v._activeGunMountArc || 0.78) + 0.18;
          return Math.abs(yawOff) <= maxSector;
        };
        if (!checkPortFiringSector(camDir)) {
          v.fireCooldown = 0.35;
          sound.playEmptyClick?.();
          const nowMs = performance.now();
          if (nowMs - (v._lastPortSectorWarnMs || 0) > 2200 && this.onAwardXp) {
            v._lastPortSectorWarnMs = nowMs;
            this.onAwardXp(
              0,
              '⚠️ AC-130 GUNS FIRE OUT THE LEFT (PORT) SIDE ONLY — PRESS [R] FOR PYLON ORBIT (CANNOT SHOOT FORWARD IN TRANSIT)!'
            );
          }
          return;
        }
        const clampToPortGunMount = (dirVec) => {
          const mountArc = v.gunshipManualFlight
            ? 1.05
            : Math.max(0.78, v._activeGunMountArc || Math.max(0.72, (v.ac130MaxMountArc || 0.35) + 0.38)) + 0.18;
          const horizLen = Math.hypot(dirVec.x, dirVec.z);
          if (horizLen > 1e-4) {
            const shotYaw = Math.atan2(-dirVec.x, -dirVec.z);
            let yawOff = shotYaw - portBeamYaw;
            while (yawOff > Math.PI) yawOff -= Math.PI * 2;
            while (yawOff < -Math.PI) yawOff += Math.PI * 2;
            if (Math.abs(yawOff) > mountArc) {
              const clampedYaw = portBeamYaw + Math.sign(yawOff) * mountArc;
              dirVec.x = -Math.sin(clampedYaw) * horizLen;
              dirVec.z = -Math.cos(clampedYaw) * horizLen;
              dirVec.normalize();
            }
          }
          return dirVec;
        };
        if (activeSlot === 0) {
          // AC-130J [1]: 25mm GAU-12/U Equalizer Gatling (1,600 RPM AP-HEI — high-velocity 860 m/s straight tracer stream!)
          if (!this.consumeVehicleOrdnance(v, 'slot0', 1, '25MM GAU-12')) {
            return;
          }
          v.maxFireCooldown = 60 / 1600;
          v.fireCooldown = v.maxFireCooldown;
          v.coaxHeat = Math.min(1.0, (v.coaxHeat || 0) + 0.011);
          this.recoilOffsetPitch += 0.0007;
          this.addShake(0.035);
          sound.playGunshot('autocannon', 0);

          const altSpreadScale = THREE.MathUtils.clamp((myAltAglForRadar - 100) / 450, 0, 1);
          const spread = 0.0018 + altSpreadScale * 0.0028;
          const eqMuzzleVel = 860;
          const eqGrav = 3.8;
          const portMuzzle25 = getGunshipPortMuzzle(0);
          const fcs25 = this.computeGunshipFcsSolution
            ? this.computeGunshipFcsSolution(aimHit.point, portMuzzle25, v, eqMuzzleVel, eqGrav)
            : null;
          const compTarget = fcs25 ? fcs25.aimPoint.clone() : aimHit.point.clone();
          if (!fcs25) {
            const tof25 = Math.min(3.5, aimHit.point.distanceTo(portMuzzle25) / eqMuzzleVel);
            compTarget.y += 0.5 * eqGrav * tof25 * tof25;
          }
          const rawEqDir = compTarget
            .sub(portMuzzle25)
            .normalize()
            .add(
              new THREE.Vector3(
                (Math.random() - 0.5) * spread,
                (Math.random() - 0.5) * spread,
                (Math.random() - 0.5) * spread
              )
            )
            .normalize();
          // Realistic AC-130 Port Gun Mount: strictly angled downward & clamped within physical port embrasure traverse!
          if (rawEqDir.y > -0.05) {
            rawEqDir.y = -0.05;
            rawEqDir.normalize();
          }
          const shotDir = clampToPortGunMount(rawEqDir);

          this._gauBurstCount = ((this._gauBurstCount || 0) + 1) % 3;
          if (this._gauBurstCount === 0 && this.world?.spawnDebris) {
            this.world.spawnDebris(portMuzzle25, _colHowitzerFlash, 2);
          }
          const eqSplash =
            this._gauBurstCount === 0
              ? { radius: 3.6, damage: 95, weaponName: '25MM GAU-12 EQUALIZER' }
              : null;

          // Launch BOTH ballistic ray & 3D tracer directly from `portMuzzle25` so tracers fly in a 100% straight line
          // out of the AC-130's forward-left port gatling barrel with ZERO mid-air camera-offset bend!
          this.fireBallisticRay(
            portMuzzle25,
            shotDir,
            82,
            2.0,
            150,
            '25MM GAU-12 EQUALIZER',
            2.4,
            {
              isMountedMg: true,
              muzzleVelocity: eqMuzzleVel,
              bulletGravity: eqGrav,
              maxEffectiveRange: 2850,
              tracerEveryShots: 1,
              explosiveSplash: eqSplash
            },
            1,
            portMuzzle25
          );
        } else if (activeSlot === 1) {
          // AC-130J [2]: 40mm L/60 Bofors Rapid-Fire HE Autocannon (120 RPM + Fire-Control Gravity Drop Solver up to 1.5km!)
          if (!this.consumeVehicleOrdnance(v, 'slot1', 1, '40MM BOFORS')) {
            return;
          }
          v.maxFireCooldown = 0.48;
          v.fireCooldown = v.maxFireCooldown;
          this.recoilOffsetPitch += 0.008;
          this.addShake(0.18);
          sound.playTankCannon?.(0, 0);

          const bofSpd = Math.max(210, PROJECTILES.AC130_40MM?.speed || 210);
          const bofGrav = PROJECTILES.AC130_40MM?.gravity || 2.2;
          const fcs40 = this.computeGunshipFcsSolution
            ? this.computeGunshipFcsSolution(aimHit.point, noseMuzzle, v, bofSpd, bofGrav)
            : null;
          const bofCompPt = fcs40 ? fcs40.aimPoint.clone() : aimHit.point.clone();
          if (!fcs40) {
            const dBof = aimHit.point.distanceTo(noseMuzzle);
            const tofBof = dBof / bofSpd;
            bofCompPt.y += 0.5 * bofGrav * tofBof * tofBof;
          }
          const boforsDir = clampToPortGunMount(bofCompPt.sub(noseMuzzle).normalize());
          if (boforsDir.y > -0.04) {
            boforsDir.y = -0.04;
            boforsDir.normalize();
          }
          const boforsMesh = new THREE.Mesh(_bofors40mmGeo, _bofors40mmMat);
          boforsMesh.position.copy(noseMuzzle);
          boforsMesh.lookAt(aimHit.point);
          this.scene.add(boforsMesh);
          if (this.world?.spawnDebris) {
            this.world.spawnDebris(noseMuzzle, _colHowitzerFlash, 4);
          }

          this.world.projectiles.push({
            type: 'ac130_40mm',
            weaponName: '40MM L/60 BOFORS',
            weaponLabel: '40MM L/60 BOFORS',
            mesh: boforsMesh,
            vel: boforsDir.multiplyScalar(bofSpd),
            gravity: bofGrav,
            life: 22.0,
            blastRadius: 7.8,
            blastDamage: 245,
            sourceVehicle: v,
            owner: this
          });
        } else if (myAltAglForRadar < 8.0) {
          v.fireCooldown = 0.45;
          sound.playEmptyClick?.();
          if (this.onAwardXp) {
            this.onAwardXp(0, '⚠️ 105MM HOWITZER SAFE ON RUNWAY (<8M AGL) — TAKE OFF BEFORE FIRING HEAVY ARTILLERY!');
          }
        } else {
          // AC-130J [3]: 105mm M102 Heavy Howitzer (Fire-Control Ballistic Drop Solver hits reticle up to 1.6km Slant Range!)
          if (!this.consumeVehicleOrdnance(v, 'slot2', 1, '105MM M102 HOWITZER')) {
            return;
          }
          v.maxFireCooldown = 2.4;
          v.fireCooldown = v.maxFireCooldown;
          this.recoilOffsetPitch += 0.025;
          this.addShake(0.45);
          sound.playTankCannon?.(0, 0);
          this.world.spawnDebris(noseMuzzle, _colHowitzerFlash, 6);

          const howSpd = Math.max(175, PROJECTILES.AC130_105MM?.speed || 175);
          const howGrav = PROJECTILES.AC130_105MM?.gravity || 4.8;
          const dHow = aimHit.point.distanceTo(noseMuzzle);
          const tofHow = dHow / howSpd;
          const fcs105 = this.computeGunshipFcsSolution
            ? this.computeGunshipFcsSolution(aimHit.point, noseMuzzle, v, howSpd, howGrav)
            : null;
          const howCompPt = fcs105 ? fcs105.aimPoint.clone() : aimHit.point.clone();
          if (!fcs105) {
            howCompPt.y += 0.5 * howGrav * tofHow * tofHow;
          }
          const howitzerDir = clampToPortGunMount(howCompPt.sub(noseMuzzle).normalize());
          if (howitzerDir.y > -0.04) {
            howitzerDir.y = -0.04;
            howitzerDir.normalize();
          }
          const howitzerMesh = new THREE.Mesh(_howitzer105mmGeo, _howitzer105mmMat);
          howitzerMesh.position.copy(noseMuzzle);
          howitzerMesh.lookAt(aimHit.point);
          this.scene.add(howitzerMesh);

          this.world.projectiles.push({
            type: 'ac130_105mm',
            weaponName: '105MM M102 HOWITZER',
            weaponLabel: '105MM M102 HOWITZER',
            mesh: howitzerMesh,
            vel: howitzerDir.multiplyScalar(howSpd),
            gravity: howGrav,
            life: 26.0,
            blastRadius: 14.5,
            blastDamage: 620,
            sourceVehicle: v,
            owner: this
          });
          if (this.onAwardXp) {
            this.onAwardXp(
              0,
              `💥 105MM M102 HOWITZER FIRED — SLANT RANGE ${Math.round(dHow)}M (IMPACT IN ${tofHow.toFixed(1)}S)!`
            );
          }
        }
      } else if ((v.aircraftRole === 'fighter' && activeSlot === 2) || v.aircraftRole === 'bomber') {
        // Combined Strike Fighter/Bomber [3]: 500lb JDAM Precision Bomb Drop onto CCIP Reticle
        if (!this.consumeVehicleOrdnance(v, 'slot2', 1, '500LB JDAM')) {
          return;
        }
        v.maxFireCooldown = 0.85;
        v.fireCooldown = v.maxFireCooldown;
        this.addShake(0.18);
        sound.playRocketLaunch?.(0);

        const bombMesh = new THREE.Mesh(_jdam500Geo, _jdam500Mat);
        bombMesh.position.set(v.pos.x, v.pos.y - 1.2, v.pos.z);
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
        // Combined Strike Fighter [2] LMB: Fire AIM-120D FOX-3 / R-77M Homing A2A Missile (actual reload gated by coaxCooldown below)
        v.maxFireCooldown = 1.35;
        v.fireCooldown = 0.22;
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
      (this.isFiring && v.isHelicopter && activeSlot === 1) ||
      (this.isFiring && v.aircraftRole === 'heli_transport' && activeSlot === 2) ||
      (this.isFiring && v.aircraftRole === 'cas' && activeSlot === 1) ||
      (this.isFiring && v.aircraftRole === 'fighter' && activeSlot === 1) ||
      (this.isFiring && isB2Spirit && (activeSlot === 1 || activeSlot === 2)) ||
      (this.isFiring && isWrightFlyer && activeSlot === 1);
    if (triggerSecondary && v.coaxCooldown <= 0) {
      if (v.isHelicopter && activeSlot <= 1) {
        // Helicopter Hydra-70 / S-8 Rocket Pod Salvo ([SPACE] or Slot [2] + [LMB])
        if (!this.consumeVehicleOrdnance(v, 'slot1', 1, 'HYDRA-70 / S-8 ROCKET')) {
          return;
        }
        v.coaxCooldown = 0.32;
        this.addShake(0.15);
        sound.playRocketLaunch?.(0);

        const aimHit = this.computeVehicleAimTarget(camOrigin, camDir, v, 520);
        const rktDir = aimHit.point.clone().sub(noseMuzzle).normalize();
        const rktMesh = new THREE.Mesh(_airRocketGeo, _airRocketMat);
        rktMesh.position.copy(noseMuzzle);
        rktMesh.lookAt(aimHit.point);
        this.scene.add(rktMesh);

        const rktLbl = v.team === 'RU' ? '80MM S-8 ROCKET POD' : '70MM HYDRA-70 ROCKET POD';
        this.world.projectiles.push({
          type: 'air_rocket',
          weaponName: rktLbl,
          weaponLabel: rktLbl,
          mesh: rktMesh,
          vel: rktDir.multiplyScalar(PROJECTILES.AIR_ROCKET?.speed || 175),
          gravity: PROJECTILES.AIR_ROCKET?.gravity || 0.65,
          life: 14.0,
          blastRadius: 6.4,
          blastDamage: 265,
          owner: this
        });
      } else if (v.aircraftRole === 'heli_attack' && activeSlot === 2) {
        // AH-64E / Ka-52 [SPACE] in Slot [3]: Fire Hellfire / Vikhr Tank-Buster ATGM!
        const hfLabel = v.team === 'RU' ? '9K121 VIKHR LASER ATGM' : 'AGM-114L HELLFIRE ATGM';
        if (!this.consumeVehicleOrdnance(v, 'slot2', 1, hfLabel)) {
          return;
        }
        v.coaxCooldown = 1.35;
        this.addShake(0.24);
        sound.playRocketLaunch?.(0);
        const aimHit = this.computeVehicleAimTarget(camOrigin, camDir, v, 1600);
        const hfDir = aimHit.point.clone().sub(noseMuzzle).normalize();
        const hfMesh = new THREE.Mesh(_a2aMissileGeo, _a2aMissileMat);
        hfMesh.position.copy(noseMuzzle);
        hfMesh.lookAt(aimHit.point);
        this.scene.add(hfMesh);
        this.world.projectiles.push({
          type: 'air_rocket',
          weaponName: hfLabel,
          weaponLabel: hfLabel,
          mesh: hfMesh,
          vel: hfDir.multiplyScalar(235),
          gravity: 0.2,
          life: 14.0,
          blastRadius: 8.8,
          blastDamage: 820,
          owner: this
        });
      } else if (isWrightFlyer && activeSlot <= 1) {
        // 1903 Wright Flyer I [2 / SPACE]: 3-Bundle Kitty Hawk Dynamite Crate Cluster Drop!
        v.coaxCooldown = 0.75;
        this.addShake(0.22);
        sound.playRocketLaunch?.(0);
        const rightVec = new THREE.Vector3(Math.cos(v.yaw), 0, -Math.sin(v.yaw)).normalize();
        for (const side of [-1, 0, 1]) {
          const dynMesh = new THREE.Mesh(_wrightDynGeo, _wrightDynMat);
          dynMesh.position.set(
            v.pos.x + rightVec.x * side * 1.35,
            v.pos.y - 0.65,
            v.pos.z + rightVec.z * side * 1.35
          );
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
        // B-2 Spirit [SPACE] while in Slot [1] Carpet Mode: Drop an instant 5-bomb Carpet Wave!
        if (!this.consumeVehicleOrdnance(v, 'slot0', 1, 'B-2 MK-82 CARPET BAY')) {
          return;
        }
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
          const waveVel = bombInitVel
            .clone()
            .addScaledVector(rightVec, lat * 1.45)
            .addScaledVector(flightDir, (bIdx - 2) * 3.5);
          const cBombMesh = new THREE.Mesh(_b2CarpetBombGeo, _b2CarpetBombMat);
          cBombMesh.position.copy(dropPos);
          _bombLookAtScratch.copy(dropPos).add(waveVel);
          cBombMesh.lookAt(_bombLookAtScratch);
          this.scene.add(cBombMesh);
          this.world.projectiles.push({
            type: 'jdam_bomb',
            weaponName: 'B-2 MK-82 CARPET BOMB',
            weaponLabel: 'B-2 500LB MK-82 CARPET BOMB',
            mesh: cBombMesh,
            vel: waveVel,
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
        if (!this.consumeVehicleOrdnance(v, 'slot1', 1, 'GBU-57 MOP')) {
          return;
        }
        v.coaxCooldown = 2.4;
        this.addShake(0.42);
        sound.playTankCannon?.(0, 0);
        const rightVec = new THREE.Vector3(Math.cos(v.yaw), 0, -Math.sin(v.yaw)).normalize();
        for (const side of [-1, 1]) {
          const mopMesh = new THREE.Mesh(_gbu57MopGeo, _gbu57MopMat);
          mopMesh.position.set(
            v.pos.x + rightVec.x * side * 1.2,
            v.pos.y - 1.45,
            v.pos.z + rightVec.z * side * 1.2
          );
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
      } else if (isB2Spirit && activeSlot === 2) {
        // B-2 Spirit [3]: 2,000lb GBU-31(V)3 JDAM Precision Penetrator Bomb (4× rotary bay — real B-2 carries ZERO guns or A2A missiles!)
        if (!this.consumeVehicleOrdnance(v, 'slot2', 1, 'B-2 GBU-31 2,000LB JDAM')) {
          return;
        }
        v.coaxCooldown = 1.15;
        this.addShake(0.28);
        sound.playRocketLaunch?.(0);

        const gbu31Mesh = new THREE.Mesh(_gbu28Geo, _gbu28Mat);
        gbu31Mesh.position.set(v.pos.x, v.pos.y - 1.35, v.pos.z);
        gbu31Mesh.lookAt(ccipPos);
        this.scene.add(gbu31Mesh);

        this.world.projectiles.push({
          type: 'gbu28_bomb',
          weaponName: 'B-2 GBU-31 2,000LB JDAM',
          weaponLabel: 'B-2 GBU-31(V)3 2,000LB JDAM',
          mesh: gbu31Mesh,
          vel: bombInitVel.clone(),
          gravity: bombGrav,
          life: PROJECTILES.GBU28_BOMB?.life || 26.0,
          blastRadius: 17.5,
          blastDamage: 650,
          owner: this
        });
        if (this.onAwardXp) {
          this.onAwardXp(0, '🎯 B-2 SPIRIT 2,000LB GBU-31(V)3 PRECISION JDAM RELEASED ON CCIP TARGET!');
        }
      } else if (v.aircraftRole === 'cas' && activeSlot === 2 && wantSpaceOrdnance) {
        // A-10C / Su-25 [3] + [SPACE]: 500lb Mk-82 / FAB-250 CCIP Precision Bomb Drop!
        if (!this.consumeVehicleOrdnance(v, 'slot2', 1, '500LB MK-82 BOMB')) {
          return;
        }
        v.coaxCooldown = 0.85;
        this.addShake(0.22);
        sound.playRocketLaunch?.(0);

        const mk82Mesh = new THREE.Mesh(_jdam500Geo, _jdam500Mat);
        mk82Mesh.position.set(v.pos.x, v.pos.y - 1.2, v.pos.z);
        mk82Mesh.lookAt(ccipPos);
        this.scene.add(mk82Mesh);

        const bombLbl = v.team === 'RU' ? 'FAB-250 CCIP BOMB' : '500LB MK-82 CCIP BOMB';
        this.world.projectiles.push({
          type: 'jdam_bomb',
          weaponName: bombLbl,
          weaponLabel: bombLbl,
          mesh: mk82Mesh,
          vel: bombInitVel.clone(),
          gravity: bombGrav,
          life: PROJECTILES.JDAM_BOMB?.life || 26.0,
          blastRadius: 12.0,
          blastDamage: 420,
          owner: this
        });
        if (this.onAwardXp) {
          this.onAwardXp(0, `💣 ${bombLbl} RELEASED ON CCIP TARGET!`);
        }
      } else if (v.aircraftRole === 'cas') {
        // Hydra-70 / S-8 Unguided Rocket Pod Salvo
        if (!this.consumeVehicleOrdnance(v, 'slot1', 1, 'HYDRA-70 ROCKET')) {
          return;
        }
        v.coaxCooldown = 0.34;
        this.addShake(0.16);
        sound.playRocketLaunch?.(0);

        const aimHit = this.computeVehicleAimTarget(camOrigin, camDir, v, 420);
        const rktDir = aimHit.point.clone().sub(noseMuzzle).normalize();
        const rktMesh = new THREE.Mesh(_airRocketGeo, _airRocketMat);
        rktMesh.position.copy(noseMuzzle);
        rktMesh.lookAt(aimHit.point);
        this.scene.add(rktMesh);

        this.world.projectiles.push({
          type: 'air_rocket',
          weaponName: 'HYDRA-70 ROCKET POD',
          weaponLabel: 'HYDRA-70 ROCKET POD',
          mesh: rktMesh,
          vel: rktDir.multiplyScalar(PROJECTILES.AIR_ROCKET?.speed || 175),
          gravity: PROJECTILES.AIR_ROCKET?.gravity || 0.65,
          life: 14.0,
          blastRadius: 6.2,
          blastDamage: 260,
          owner: this
        });
      } else if (isGunship) {
        const portBeamYawSpc = (v.yaw || 0) + Math.PI * 0.5;
        const spcHoriz = Math.hypot(camDir.x, camDir.z);
        let spcYawOff = spcHoriz > 1e-4 ? Math.atan2(-camDir.x, -camDir.z) - portBeamYawSpc : 0;
        while (spcYawOff > Math.PI) spcYawOff -= Math.PI * 2;
        while (spcYawOff < -Math.PI) spcYawOff += Math.PI * 2;
        const spcMaxArc = v.gunshipManualFlight
          ? 1.05
          : Math.max(0.78, v._activeGunMountArc || 0.78) + 0.18;
        if (Math.abs(spcYawOff) > spcMaxArc) {
          v.coaxCooldown = 0.35;
          sound.playEmptyClick?.();
          const nowMs = performance.now();
          if (nowMs - (v._lastPortSectorWarnMs || 0) > 2200 && this.onAwardXp) {
            v._lastPortSectorWarnMs = nowMs;
            this.onAwardXp(
              0,
              '⚠️ 105MM M102 HOWITZER FIRES OUT THE LEFT (PORT) SIDE ONLY — PRESS [R] FOR PYLON ORBIT!'
            );
          }
          return;
        }
        if (myAltAglForRadar < 8.0) {
          v.coaxCooldown = 0.45;
          sound.playEmptyClick?.();
          if (this.onAwardXp) {
            this.onAwardXp(0, '⚠️ 105MM HOWITZER SAFE ON RUNWAY (<8M AGL) — TAKE OFF BEFORE FIRING HEAVY ARTILLERY!');
          }
        } else {
          // AC-130J [SPACE]: Fires the 105mm M102 Heavy Howitzer anytime from the aft-port (-X, z=+2.35) embrasure!
          if (!this.consumeVehicleOrdnance(v, 'slot2', 1, '105MM M102 HOWITZER')) {
            return;
          }
          const portMuzzle105 = getGunshipPortMuzzle(2);
          v.coaxCooldown = 2.4;
          this.recoilOffsetPitch += 0.025;
          this.addShake(0.45);
          sound.playTankCannon?.(0, 0);
          this.world.spawnDebris(portMuzzle105, _colHowitzerFlash, 7);

          const aimHit = this.computeVehicleAimTarget(camOrigin, camDir, v, Math.max(420, v.slantRangeM || 420));
          const howSpd = Math.max(175, PROJECTILES.AC130_105MM?.speed || 175);
          const howGrav = PROJECTILES.AC130_105MM?.gravity || 4.8;
          const dHow = aimHit.point.distanceTo(portMuzzle105);
          const tofHow = dHow / howSpd;
          const fcs105 = this.computeGunshipFcsSolution
            ? this.computeGunshipFcsSolution(aimHit.point, portMuzzle105, v, howSpd, howGrav)
            : null;
          const howCompPt = fcs105 ? fcs105.aimPoint.clone() : aimHit.point.clone();
          if (!fcs105) {
            howCompPt.y += 0.5 * howGrav * tofHow * tofHow;
          }
          const howitzerDir = howCompPt.sub(portMuzzle105).normalize();
          if (howitzerDir.y > -0.04) {
            howitzerDir.y = -0.04;
            howitzerDir.normalize();
          }
          const howitzerMesh = new THREE.Mesh(_howitzer105mmGeo, _howitzer105mmMat);
          howitzerMesh.position.copy(portMuzzle105);
          howitzerMesh.lookAt(aimHit.point);
          this.scene.add(howitzerMesh);

          this.world.projectiles.push({
            type: 'ac130_105mm',
            weaponName: '105MM M102 HOWITZER',
            weaponLabel: '105MM M102 HOWITZER',
            mesh: howitzerMesh,
            vel: howitzerDir.multiplyScalar(howSpd),
            gravity: howGrav,
            life: 26.0,
            blastRadius: 14.5,
            blastDamage: 620,
            sourceVehicle: v,
            owner: this
          });
          events.emit('telemetry:event', {
            type: 'AIRCRAFT_ORDNANCE_FIRED',
            payload: {
              vehicle: v.name,
              weapon: '105MM M102 HOWITZER',
              altAgl: Math.round(myAltAglForRadar),
              slantRangeM: Math.round(dHow)
            }
          });
          if (this.onAwardXp) {
            this.onAwardXp(
              0,
              `💥 105MM M102 HOWITZER FIRED — SLANT RANGE ${Math.round(dHow)}M (IMPACT IN ${tofHow.toFixed(1)}S)!`
            );
          }
        }
      } else if (v.aircraftRole === 'bomber' || (v.aircraftRole === 'fighter' && activeSlot === 2)) {
        // Combined Strike Fighter Slot [3] (or Bomber): 2,000lb GBU-28 Bunker Buster Heavy Demolition Bomb onto CCIP Reticle!
        if (!this.consumeVehicleOrdnance(v, 'slot2', 1, '2,000LB GBU-28')) {
          return;
        }
        v.coaxCooldown = 2.2 * (v.customCooldownMult || 1.0);
        this.addShake(0.32);
        sound.playRocketLaunch?.(0);

        const gbuMesh = new THREE.Mesh(_gbu28Geo, _gbu28Mat);
        gbuMesh.position.set(v.pos.x, v.pos.y - 1.4, v.pos.z);
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
          blastDamage: Math.round(560 * (v.customDamageMult || 1.0)),
          owner: this
        });
        if (this.onAwardXp) {
          this.onAwardXp(0, '💣 2,000LB GBU-28 BUNKER BUSTER DROPPED ON CCIP TARGET!');
        }
      } else {
        // AIM-120D AMRAAM / AIM-9X (RU: R-77M / R-73) Active-Radar "FOX-3" Shoot-and-Forget Air-to-Air Missile!
        // Supports full 45° HMD Cone Lock (~1.15s) OR instant Pitbull Boresight Lock when Slot [2] is aimed directly on an enemy plane!
        // AIM-120D AMRAAM / R-77M Active-Radar "FOX-3" Shoot-and-Forget Air-to-Air Missile!
        // Enforces real AN/APG-82 ±58° nose radar gimbal limit (`toCandNose.dot(flightDir) >= 0.53`) — no sideways viewport locks!
        let boresightAirTarget = null;
        const isHeliStingerSlot = v.aircraftRole === 'heli_transport' && activeSlot === 2;
        if (
          canUseA2aRadar &&
          (activeSlot === 1 || isHeliStingerSlot) &&
          this.vehicleManager &&
          Array.isArray(this.vehicleManager.vehicles)
        ) {
          let bestBsDot = 0.984; // ~10° tight Pitbull radar boresight cone
          for (const cand of this.vehicleManager.vehicles) {
            if (!cand || !cand.isAircraft || cand.dead || cand.isShotDown || cand.team === this.team || cand === v) {
              continue;
            }
            const candGnd = this.world ? this.world.getGroundHeightAt(cand.pos.x, cand.pos.z) : 0;
            if (cand.pos.y - candGnd < 18 && !cand.driver && !cand.aiPilotActive) continue;
            const dCand = cand.pos.distanceTo(camOrigin);
            if (dCand > 1650 || dCand < 15) continue;
            const toCandNose = _vehScratchB.copy(cand.pos).sub(v.pos).normalize();
            if (toCandNose.dot(flightDir) < minNoseGimbalDot) continue;
            const toCand = _vehScratchA.copy(cand.pos).sub(camOrigin).normalize();
            const dot = toCand.dot(camDir);
            if (dot > bestBsDot) {
              bestBsDot = dot;
              boresightAirTarget = cand;
            }
          }
        }
        const resolvedMslTarget =
          this.aircraftLockTarget && (this.aircraftLockProgress || 0) >= 0.99
            ? this.aircraftLockTarget
            : boresightAirTarget;
        const hasFullLock = Boolean(resolvedMslTarget);
        if (!hasFullLock) {
          v.coaxCooldown = 0.28;
          sound.playEmptyClick?.();
          if (this.onAwardXp) {
            const lockPct = Math.round((this.aircraftLockProgress || 0) * 100);
            this.onAwardXp(
              0,
              this.aircraftRadarGimbalExceeded
                ? '📡 RADAR GIMBAL LIMIT (±60° NOSE) — TURN AIRCRAFT NOSE TOWARD BANDIT TO LOCK AIM-120!'
                : this.aircraftLockTarget && lockPct > 0
                ? `📡 ACQUIRING RADAR LOCK (${lockPct}%) — HOLD BANDIT IN NOSE RADAR CONE (~1.1S) TO FIRE!`
                : '📡 NO AIRCRAFT LOCKED — POINT NOSE WITHIN ±60° RADAR CONE (~1.1S) FOR FOX-3 LOCK!'
            );
          }
        } else {
          const mslPoolKey = isHeliStingerSlot ? 'slot2' : 'slot1';
          const mslConsumeLbl = isHeliStingerSlot ? 'FIM-92 STINGER A2A' : 'AIM-120D AMRAAM';
          if (!this.consumeVehicleOrdnance(v, mslPoolKey, 1, mslConsumeLbl)) {
            return;
          }
          const missileTarget = resolvedMslTarget;
          v.coaxCooldown = 1.35 * (v.customCooldownMult || 1.0);
          if (v.aircraftRole === 'fighter' && activeSlot === 1) {
            v.maxFireCooldown = v.coaxCooldown;
            v.fireCooldown = v.coaxCooldown;
          }
          this.addShake(0.22);
          sound.playRocketLaunch?.(0);

          const mslSpeed = 365;
          const dTgt = missileTarget.pos.distanceTo(noseMuzzle);
          const leadSec = Math.min(1.4, dTgt / mslSpeed);
          const tvx = missileTarget.velVector
            ? missileTarget.velVector.x
            : -Math.sin(missileTarget.yaw || 0) * (missileTarget.forwardSpeed || 64);
          const tvy = missileTarget.velVector ? missileTarget.velVector.y : 0;
          const tvz = missileTarget.velVector
            ? missileTarget.velVector.z
            : -Math.cos(missileTarget.yaw || 0) * (missileTarget.forwardSpeed || 64);
          const mslDir = new THREE.Vector3(
            missileTarget.pos.x + tvx * leadSec - noseMuzzle.x,
            missileTarget.pos.y + 1.2 + tvy * leadSec - noseMuzzle.y,
            missileTarget.pos.z + tvz * leadSec - noseMuzzle.z
          ).normalize();

          const mslMesh = new THREE.Mesh(_a2aMissileGeo, _a2aMissileMat);
          mslMesh.position.copy(noseMuzzle);
          _vehScratchA.copy(noseMuzzle).add(mslDir);
          mslMesh.lookAt(_vehScratchA);
          this.scene.add(mslMesh);

          const mslLabel = v.team === 'RU' ? 'R-77M FOX-3 A2A MISSILE' : 'AIM-120D AMRAAM A2A';
          this.world.projectiles.push({
            type: 'a2a_missile',
            weaponName: mslLabel,
            weaponLabel: mslLabel,
            mesh: mslMesh,
            vel: mslDir.multiplyScalar(mslSpeed),
            gravity: 0,
            life: 11.0,
            turnRate: 6.2,
            isPitbullActiveSeeker: true,
            targetVehicle: missileTarget,
            blastRadius: 12.5,
            blastDamage: Math.round(680 * (v.customDamageMult || 1.0)),
            owner: this
          });
          if (this.onAwardXp) {
            this.onAwardXp(
              0,
              `🚀 FOX-3! ${mslLabel} LOCKED & LAUNCHED ON ${missileTarget.name.split(' (')[0]} — SHOOT & FORGET!`
            );
          }
        }
      }
    }

    this.recoilOffsetPitch *= Math.pow(0.08, dt);
  },

  /**
   * Computes the 3D Curvilinear Ballistic Intercept / Lead Point (EEGS Level V / CTRA Kalman Solver)
   * ahead of an airborne aircraft based on:
   * - Target 3D Doppler velocity vector (`targetVel`)
   * - Target angular turn-rate (`trackedYawRate`, centripetal acceleration v*ω along circular orbits!)
   * - Target tangential & vertical acceleration (`trackedTangentialAccel`, `trackedVertAccel`)
   * - Iterative 3-step curved-arc Time-of-Flight (`tof`), aerodynamic drag, and bullet gravity drop (`0.5 * g * t²`)
   */
  computeAircraftLeadData(targetAircraft, shooterOrigin, bulletSpeed = 360, bulletGravity = 4.5) {
    if (!targetAircraft || !targetAircraft.pos || targetAircraft.isShotDown || !shooterOrigin) return null;
    const isAirborne =
      targetAircraft.pos.y >= 14 ||
      Boolean(targetAircraft.driver || targetAircraft.aiPilotActive);
    if (!isAirborne) return null;

    let targetVel;
    if (targetAircraft.trackedWorldVel && targetAircraft.trackedWorldVel.lengthSq() > 9) {
      targetVel = targetAircraft.trackedWorldVel.clone();
    } else if (targetAircraft.velVector && targetAircraft.velVector.lengthSq() > 4) {
      targetVel = targetAircraft.velVector.clone();
    } else {
      const spd = Math.max(48, targetAircraft.forwardSpeed || targetAircraft.speed || 64);
      const pitch = targetAircraft.pitch || 0;
      const yaw = targetAircraft.yaw || 0;
      const cosP = Math.cos(pitch);
      targetVel = new THREE.Vector3(
        -Math.sin(yaw) * cosP * spd,
        Math.sin(pitch) * spd + (targetAircraft.stallSinkVel || 0),
        -Math.cos(yaw) * cosP * spd
      );
    }

    const omega = targetAircraft.trackedYawRate || 0;
    const rawTangAccel = targetAircraft.trackedTangentialAccel || 0;
    const rawVertAccel = targetAircraft.trackedVertAccel || 0;
    const spdH = Math.hypot(targetVel.x, targetVel.z);
    const p0 = targetAircraft.pos;

    // Exact Constant-Turn-Rate & Acceleration (CTRA) curvilinear trajectory predictor
    const predictPosAt = (t, out) => {
      const tangAccel = rawTangAccel * Math.exp(-0.55 * t);
      const spdScale = spdH > 4 ? Math.max(0.5, 1 + (0.5 * tangAccel * t) / spdH) : 1;
      const effVx = targetVel.x * spdScale;
      const effVz = targetVel.z * spdScale;
      let dx;
      let dz;
      if (Math.abs(omega) > 0.015 && t > 0.01) {
        const wt = THREE.MathUtils.clamp(omega * t, -2.35, 2.35);
        const effOmega = wt / t;
        const sinTerm = Math.sin(wt) / effOmega;
        const cosTerm = (1 - Math.cos(wt)) / effOmega;
        dx = effVx * sinTerm + effVz * cosTerm;
        dz = effVz * sinTerm - effVx * cosTerm;
      } else {
        dx = effVx * t;
        dz = effVz * t;
      }
      const vertAccel = rawVertAccel * Math.exp(-0.65 * t);
      const dy = targetVel.y * t + 0.5 * vertAccel * t * t;
      return out.set(p0.x + dx, p0.y + dy, p0.z + dz);
    };

    const effSpeed = Math.max(80, bulletSpeed || 360);
    const d0 = p0.distanceTo(shooterOrigin);
    const stepPos = new THREE.Vector3();
    const t0 = d0 / effSpeed;
    const d1 = predictPosAt(t0, stepPos).distanceTo(shooterOrigin);
    const t1 = d1 / effSpeed;
    const d2 = predictPosAt(t1, stepPos).distanceTo(shooterOrigin);
    const tof = THREE.MathUtils.clamp(d2 / effSpeed, 0.03, 3.4);

    // Account for subtle aerodynamic bullet drag (~3% per second) + ballistic gravity drop (0.5 * g * t^2)
    const dragComp = 1 + 0.03 * tof;
    const effTof = tof * dragComp;
    const gravCompY = 0.5 * bulletGravity * effTof * effTof;

    const leadWorldPos = predictPosAt(effTof, new THREE.Vector3());
    const aimPoint = leadWorldPos
      .clone()
      .add(new THREE.Vector3(0, gravCompY, 0));

    return {
      leadPos: aimPoint,
      interceptPos: leadWorldPos,
      targetVel,
      yawRate: omega,
      dist: d0,
      tof: effTof,
      leadMeters: p0.distanceTo(leadWorldPos),
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
      if (!v.isAircraft || v.dead || v.isShotDown || v.team === this.team || v === this.activeVehicle) continue;
      if (v.pos.y < 14 && !v.driver && !v.aiPilotActive) continue;
      const dist = v.pos.distanceTo(camOrigin);
      if (dist > 1450 || dist < 12) continue;

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
  },

  /**
   * AC-130J Computerized Ground Fire-Control System (FCS):
   * - Automatically compensates for projectile gravity drop over slant range (`0.5 * g * tof²`), AND
   * - Automatically tracks & leads moving enemy ground vehicles within 18m of the sensor reticle!
   * - ZERO air-to-air tracking (`!cand.isAircraft`).
   */
  computeGunshipFcsSolution(groundPoint, launchOrigin, gunshipVeh, projSpeed = 210, projGrav = 2.2) {
    const basePt = groundPoint.clone();
    let trackedVeh = null;
    // Only lead a moving ground vehicle if the crosshair is aimed onto its hull (<= 5.5m) AND it is moving (>2.5 m/s) —
    // NEVER yank shots sideways toward stationary/nearby vehicles off-reticle!
    let bestDist = 5.5;

    if (this.vehicleManager && Array.isArray(this.vehicleManager.vehicles)) {
      for (const cand of this.vehicleManager.vehicles) {
        if (!cand || cand.dead || cand.isAircraft || cand.team === this.team || cand === gunshipVeh) {
          continue;
        }
        const spd = Math.abs(cand.forwardSpeed || 0);
        if (spd < 2.5) continue;
        const d = Math.hypot(cand.pos.x - basePt.x, cand.pos.z - basePt.z);
        if (d < bestDist) {
          bestDist = d;
          trackedVeh = cand;
        }
      }
    }

    const effSpd = Math.max(60, projSpeed);
    const slantDist0 = Math.max(10, basePt.distanceTo(launchOrigin));
    const tof0 = slantDist0 / effSpd;
    const dropEst = 0.5 * projGrav * tof0 * tof0;
    const slantDist1 = Math.hypot(
      basePt.x - launchOrigin.x,
      basePt.y + dropEst - launchOrigin.y,
      basePt.z - launchOrigin.z
    );
    const tof = Math.min(4.8, slantDist1 / effSpd);
    const interceptWorldPos = basePt.clone();
    let leadMeters = 0;

    if (trackedVeh) {
      const spd = trackedVeh.forwardSpeed || 0;
      const vx = trackedVeh.velVector ? trackedVeh.velVector.x : -Math.sin(trackedVeh.yaw || 0) * spd;
      const vz = trackedVeh.velVector ? trackedVeh.velVector.z : -Math.cos(trackedVeh.yaw || 0) * spd;
      interceptWorldPos.x = trackedVeh.pos.x + vx * tof;
      interceptWorldPos.z = trackedVeh.pos.z + vz * tof;
      interceptWorldPos.y = this.world
        ? this.world.getGroundHeightAt(interceptWorldPos.x, interceptWorldPos.z) + 1.1
        : trackedVeh.pos.y + 1.1;
      leadMeters = Math.hypot(
        interceptWorldPos.x - trackedVeh.pos.x,
        interceptWorldPos.z - trackedVeh.pos.z
      );
    }

    if (gunshipVeh) {
      gunshipVeh.fcsTrackedGroundTarget = trackedVeh;
      if (trackedVeh) {
        if (!gunshipVeh.fcsLeadPos) gunshipVeh.fcsLeadPos = new THREE.Vector3();
        gunshipVeh.fcsLeadPos.copy(interceptWorldPos);
        gunshipVeh.fcsLeadMeters = leadMeters;
      } else {
        gunshipVeh.fcsLeadPos = null;
        gunshipVeh.fcsLeadMeters = 0;
      }
    }

    const aimPoint = interceptWorldPos.clone();
    aimPoint.y += 0.5 * projGrav * tof * tof;
    return {
      aimPoint,
      interceptPos: interceptWorldPos,
      trackedVehicle: trackedVeh,
      tof,
      leadMeters
    };
  },

  /**
   * Computes realistic maximum ground vehicle yaw rate `omega_max` (rad/s) at speed `absSpeed` (m/s),
   * combining low-speed Ackermann / Cross-Drive Skid-Steer geometry (`R_min`) with high-speed lateral tire/track grip (`a_lat_max`):
   * - Tracked MBTs (`tank`) & SPAAGs (`aa`) can neutral-pivot on the spot (`R = 0m` at `0 km/h`, `~0.72–0.80 rad/s`).
   * - Wheeled APCs (`R_min = 8.8m`) & Humvees/Tigrs (`R_min = 7.5m`) require rolling velocity (`omega = 0` at `0 km/h`)
   *   and widen naturally to `~60–70m` radius at `86–99 km/h` (`~0.98–1.10 G`) without 4G rollover snaps!
   * - Motorcycles (`R_min = 2.4–3.5m`), ATVs (`3.8m`), Warhorses (`3.2m`), T-Rex (`5.5m`), and Raptors (`3.0m`)
   *   turn tightly at low speed and carve realistic leaning/stride arcs at top speed.
   */
  computeGroundVehicleMaxYawRate(v, absSpeed = 0, subsystemTurnMult = 1.0) {
    if (!v || v.isEmplacement) return 0;
    const spd = Math.max(0, Math.abs(absSpeed));
    const type = v.type || 'humvee';
    const minR =
      v.minTurnRadiusM ||
      (type === 'apc'
        ? 8.8
        : type === 'humvee'
        ? 7.5
        : type === 'aa'
        ? 6.2
        : type === 'tank' || type === 'trex_mount'
        ? 5.5
        : type === 'atv'
        ? 3.8
        : type === 'warhorse'
        ? 3.2
        : type === 'raptor_mount'
        ? 3.0
        : 2.9);
    const maxLatAcc =
      v.maxLatAccelMs2 ||
      (type === 'tank'
        ? 8.6
        : type === 'aa'
        ? 9.4
        : type === 'apc'
        ? 9.6
        : type === 'humvee' || type === 'trex_mount'
        ? 10.8
        : type === 'atv'
        ? 11.8
        : type === 'warhorse'
        ? 13.5
        : type === 'raptor_mount'
        ? 15.8
        : 12.8);

    let lowSpeedRate;
    if (type === 'tank' || type === 'aa' || v.canNeutralPivot) {
      const neutralPivotRate = type === 'tank' ? 0.72 : 0.8;
      lowSpeedRate = Math.max(neutralPivotRate, spd / minR);
    } else if (type === 'warhorse') {
      lowSpeedRate = Math.max(0.95, spd / minR);
    } else if (type === 'trex_mount') {
      lowSpeedRate = Math.max(0.52, spd / minR);
    } else if (type === 'raptor_mount') {
      lowSpeedRate = Math.max(0.85, spd / minR);
    } else if (type === 'atv') {
      lowSpeedRate = Math.max(0.22, spd / minR);
    } else if (type === 'bike' || v.isHorseMount) {
      lowSpeedRate = Math.max(0.38, spd / minR);
    } else {
      // Wheeled 4x4 / 8x8 Ackermann vehicles must roll to turn (`omega = V / R_min`)
      lowSpeedRate = spd < 0.12 ? 0 : spd / minR;
    }

    const gripLimitedRate = spd > 1.5 ? maxLatAcc / spd : lowSpeedRate;
    return Math.min(lowSpeedRate, gripLimitedRate) * subsystemTurnMult;
  },

  /**
   * Computes realistic fixed-wing aircraft coordinated bank-to-turn yaw rate `omega` (rad/s) at `airSpeed` (m/s),
   * governed by aerodynamic load-factor (`omega = a_lat(roll) / V`, `R = V^2 / a_lat`) + High-AoA low-speed agility:
   * - Turn radius `R` scales strongly with speed squared (`R ∝ V^2`):
   *   * F-15EX / Su-57 @ 215 m/s (774 km/h Afterburner): ~565m wide high-speed radius (~22°/s)
   *   * F-15EX / Su-57 @ 125 m/s (450 km/h Corner Speed): ~185m combat radius (~39°/s)
   *   * F-15EX / Su-57 @ 52 m/s (187 km/h [S] Airbrake Merge): ~42m tight High-Alpha dogfight radius (~72°/s)!
   * - Straight-wing A-10C CAS (`R ≈ 30m` slow / `~98m` cruise) turns much tighter than fast jets at equal throttle,
   *   while heavy B-2A flying-wing stealth bombers (`R ≈ 580–1,280m`) & AC-130 gunships carve wide 2G arcs.
   */
  computeAircraftBankedTurnRate(
    v,
    airSpeed = 85,
    rollRad = 0,
    yawDiff = 0,
    tailAuthority = 1.0,
    isActiveBarrelRoll = false
  ) {
    if (!v) return 0;
    const role = v.aircraftRole || 'fighter';
    const minSpd = v.minSpeed || (role === 'wright_flyer' ? 8.5 : 33);
    const maxSpd = v.maxSpeed || (role === 'fighter' ? 215 : 128);
    const effSpd = Math.max(minSpd, Math.abs(airSpeed));
    const spdFrac = THREE.MathUtils.clamp((effSpd - minSpd) / Math.max(10, maxSpd - minSpd), 0, 1);
    const maxBank =
      role === 'fighter'
        ? 1.05
        : role === 'cas'
        ? 0.94
        : role === 'b2_spirit'
        ? 0.62
        : role === 'gunship'
        ? 0.52
        : 0.88;
    let maxTurnAcc =
      v.maxTurnAccelMs2 ||
      (role === 'fighter'
        ? 82.0
        : role === 'cas'
        ? 62.0
        : role === 'b2_spirit'
        ? 21.0
        : role === 'gunship'
        ? 16.5
        : role === 'wright_flyer'
        ? 18.0
        : 56.0);
    // Speed-dependent aerodynamic G & High-AoA LEX / Thrust-Vectoring envelope:
    // Chopping throttle with [S] into low/corner dogfight speed unlocks crisp High-Alpha turn rates (~1.25–1.38 rad/s, R ≈ 32–45m!),
    // whereas staying at full afterburner (215 m/s = 774 km/h) enforces realistic wide ~560m G-limited arcs!
    if (role === 'fighter') {
      maxTurnAcc =
        effSpd <= 95
          ? THREE.MathUtils.lerp(68.0, 84.0, THREE.MathUtils.clamp((effSpd - minSpd) / 50, 0, 1))
          : THREE.MathUtils.lerp(84.0, 80.0, THREE.MathUtils.clamp((effSpd - 95) / 120, 0, 1));
    } else if (role === 'cas') {
      maxTurnAcc =
        effSpd <= 78
          ? THREE.MathUtils.lerp(56.0, 64.0, THREE.MathUtils.clamp((effSpd - minSpd) / 45, 0, 1))
          : THREE.MathUtils.lerp(64.0, 56.0, THREE.MathUtils.clamp((effSpd - 78) / 50, 0, 1));
    }

    let bankFrac;
    if (isActiveBarrelRoll) {
      bankFrac = Math.sin(rollRad) * Math.cos(rollRad) * 1.6;
    } else {
      const isRollInverted = Math.cos(rollRad) < -0.2;
      const refSin = Math.max(0.3, Math.sin(maxBank));
      bankFrac = THREE.MathUtils.clamp(Math.sin(rollRad) / refSin, -1.15, 1.15) * (isRollInverted ? -0.85 : 1.0);
    }

    const coordRate = ((bankFrac * maxTurnAcc) / effSpd) * tailAuthority;
    // Responsive rudder + High-AoA nose-pointing authority at low/medium dogfight speeds (tapers down at supersonic dash & on heavy bombers)
    const isAgileJet = role === 'fighter' || role === 'cas' || role === 'wright_flyer' || role === 'bomber';
    const rudderGain = isAgileJet ? THREE.MathUtils.lerp(1.05, 0.38, spdFrac) : 0.22;
    const maxRudderAngle = isAgileJet ? 0.24 : 0.1;
    const fineRudderTrim =
      THREE.MathUtils.clamp(yawDiff, -maxRudderAngle, maxRudderAngle) * rudderGain * tailAuthority;
    return coordRate + fineRudderTrim;
  }
};
