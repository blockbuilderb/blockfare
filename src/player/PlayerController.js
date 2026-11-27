import * as THREE from '../../vendor/three.module.js';
import { VOXEL_SIZE } from '../world.js?v=143';
import { sound } from '../audio.js?v=143';
import { PLAYER, DISTANCES, CLASS_TRAITS, ERA_ROLES, getEraRoles, getRoleByHotkey, resolveRoleForEra } from '../config.js?v=143';
import {
  isMacPlatform,
  hasAnyModifier,
  shouldClearStuckKeysOnKeyup,
  shouldControlLeftCrouch,
  resolveFieldRoleShortcutIndex
} from '../utils/KeyboardShortcuts.js?v=143';
import { animateBowOrCrossbowMesh } from '../models/weapon-model.js?v=143';
import { events, makeEventBridge } from '../events.js?v=143';
import { GunsmithMethods } from './GunsmithState.js?v=143';
import { FortificationMethods } from './FortificationBuilder.js?v=143';
import { CommanderMethods } from './CommanderAbilities.js?v=143';
import { VehicleControlMethods } from './VehicleControl.js?v=143';
import { CombatMethods } from './PlayerCombat.js?v=143';
import { loadMarksmanProfile } from './MarksmanSystem.js?v=143';
import {
  PLAYER_PARACHUTE_EVENTS,
  createPlayerParachuteFSM,
  createCommanderUavFSM,
  createCommanderAirstrikeFSM,
  createTargetLockScannerFSM,
  createSquadDeployablesFSM
} from '../core/StateMachines.js?v=143';

export class PlayerController {
  constructor(camera, scene, world, botManager, vehicleManager) {
    this.camera = camera;
    this.scene = scene;
    this.world = world;
    this.botManager = botManager;
    this.vehicleManager = vehicleManager;

    this.name = 'YOU (SQUAD LEADER)';
    this.team = 'US';
    this.role = 'engineer';

    this.pos = new THREE.Vector3(-90, 0, 0);
    this.vel = new THREE.Vector3();
    this.yaw = -Math.PI / 2;
    this.pitch = 0;

    this.hp = PLAYER.HP;
    this.maxHp = PLAYER.MAX_HP;
    this.armor = PLAYER.ARMOR;
    this.maxArmor = PLAYER.MAX_ARMOR;
    this.armorAbsorbRatio = PLAYER.ARMOR_ABSORB_RATIO;
    this.bleeding = false;
    this.bleedTickTimer = 0;
    this.bandages = PLAYER.STARTING_BANDAGES;
    this.bandageProgress = 0;
    this.grenades = PLAYER.STARTING_GRENADES;

    // Two-Tier Economy: Persistent Warehouse Bank ($) & In-Match Tactical Cash ($)
    this.warehouseCash = 350;
    this.matchCash = PLAYER.STARTING_CASH;
    this.cash = this.matchCash + this.warehouseCash;
    this.ownedWeapons = new Set(['m4a1', 'ak15', 'vector', 'm249', 'sv98', 'mp443']);
    this.classLoadoutSelections = {
      engineer: { primary: 'm4a1', secondary: 'mp443' },
      assault: { primary: 'ak15', secondary: 'mp443' },
      medic: { primary: 'vector', secondary: 'mp443' },
      support: { primary: 'm249', secondary: 'mp443' },
      recon: { primary: 'sv98', secondary: 'mp443' }
    };
    this.weaponAttachments = {};
    this.warehouseStock = { armorPlates: 2, medStims: 2, ammoPacks: 2 };
    this.careerStats = { matchesPlayed: 0, matchesWon: 0, totalExtractedCash: 0 };
    this.lastMatchExtraction = null;
    this.ownedUpgrades = new Set([
      'stock',
      'std_mag',
      'factory',
      'std_grip',
      'fmj',
      'std_vest',
      'no_pack'
    ]);
    this.equippedUpgrades = {
      muzzle: 'stock',
      magazine: 'std_mag',
      optic: 'factory',
      grip: 'std_grip',
      ammoType: 'fmj',
      vest: 'std_vest',
      backpack: 'no_pack'
    };
    this.loadGunsmithState();

    // Downed / Revive / Drag state
    this.dead = true;
    this.downed = false;
    this.downedTimer = 0;
    this.downedKiller = '';
    this.downedWeapon = '';
    this.giveUpProgress = 0;
    this.reviveProgress = 0;
    this.reviveTargetBot = null;
    this.draggedBot = null;
    this.isDraggingAlly = false;
    this.keyFHoldTime = 0;
    this.dragStartedOnCurrentPress = false;
    this.dragDistAccum = 0;

    this.kills = 0;
    this.deaths = 0;
    this.revives = 0;
    this.planesDestroyed = 0;
    this.tanksDestroyed = 0;
    this.carsDestroyed = 0;
    this.vehiclesDestroyed = 0;
    this.captures = 0;
    this.medicKills = 0; // War Crimes (Geneva Convention: Killing Field Medics)
    this.score = 0;
    this.squad = 'ALPHA';
    this.squadShort = 'ALP';
    this.commandRank = 'MEMBER';    // 'MEMBER' (default) | 'SQUAD_LEADER' | 'COMMANDER'
    this.commandScope = 'SQUAD';    // 'ALL' (Force Commander: all 6 squads) | 'SQUAD' (Squad Leader / Member)
    this.squadDoctrineEnabled = true;
    try {
      const savedDoctrine = localStorage.getItem('bb_squad_doctrine');
      if (savedDoctrine !== null) {
        this.squadDoctrineEnabled = savedDoctrine !== 'false' && savedDoctrine !== '0';
      }
    } catch (_) {}
    this.inSquadCohesion = false;
    this.cohesionAnchorLabel = '';
    this.isUavStealthMasked = false;
    this.outOfCombatTimer = 0;
    if (typeof this.passiveRegenBonus !== 'number') this.passiveRegenBonus = 0;
    if (typeof this.headshotTakenMult !== 'number') this.headshotTakenMult = 1.0;
    this.hasThermalGoggles = Boolean(this.hasThermalGoggles);

    // Vehicle & Combat Aviation state
    this.activeVehicle = null;
    this.thirdPersonVehicle = false;
    this.preferredAircraftRole = 'cas'; // 'cas' (A-10C / Su-25) | 'bomber' (F-15E / Su-34) | 'fighter' (F-22A / Su-57)
    this.preferredArmorOrderType = 'tank'; // 'tank' ($1,100) | 'apc' ($650) | 'aa' ($750)
    this.preferredRideMode = 'heli'; // 'heli' | 'apc' | 'truck' | 'humvee'
    this.activeRideVehicle = null;
    this.parachuting = false;
    this.parachuteCut = false;
    this.parachuteMesh = null;
    createPlayerParachuteFSM(this);
    this.aircraftLockTarget = null;
    this.aircraftLockProgress = 0;
    createTargetLockScannerFSM(this);
    this.aircraftCcipPoint = null;

    // Movement & Stance (Standing / Crouched / Prone + Vaulting + Optional Quake Bhop & Air-Strafing)
    this.keys = {};
    this.touchMoveX = 0;
    this.touchMoveZ = 0;
    this.touchMoveMag = 0;
    this.touchSprintLocked = false;
    this.touchHoldBreath = false;
    this._lastTouchEventAt = 0;
    this.isGrounded = false;
    this.crouching = false;
    this.prone = false;
    this.vaultTimer = 0;
    this.leanTarget = 0;
    this.leanAmount = 0;
    this.bhopEnabled = false;
    this._spaceJumpConsumed = false;
    try {
      const savedBhop = localStorage.getItem('bb_bhop_enabled_v1');
      if (savedBhop !== null) {
        this.bhopEnabled = savedBhop === 'true' || savedBhop === '1';
      }
    } catch (_) {}

    // Aircraft Collision Avoidance (Default: AUTO ON = true so planes auto-pull-up and don't crash into ground/mountains/buildings;
    // when turned OFF = false, planes use Realistic Crash Mode and explode on impact with ground, mountains, or buildings!)
    this.aircraftCollisionAvoidance = true;
    try {
      const savedAirAvoid = localStorage.getItem('bb_aircraft_collision_avoidance_v2');
      if (savedAirAvoid !== null) {
        this.aircraftCollisionAvoidance = savedAirAvoid !== 'false' && savedAirAvoid !== '0';
      }
    } catch (_) {}
    this.walkBobPhase = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.shakeTrauma = 0;

    // Suppression System (Squad-style: incoming fire causes screen blur + sway)
    this.suppressionLevel = 0;       // 0–1 intensity
    this.suppressionDecayRate = PLAYER.SUPPRESSION_DECAY_RATE; // per second
    this.lastSuppressionHitTime = 0;

    // Anatomical 6-Zone Human Limb Health & Fracture State (Tarkov / Arma ACE3 Trauma)
    this.limbHealth = {
      head: 100,
      thorax: 100,
      leftArm: 100,
      rightArm: 100,
      leftLeg: 100,
      rightLeg: 100
    };
    this.armFractured = false;
    this.legFractured = false;

    // Kill Streak / Multi-Kill & Sniper Marksman Profile Tracking
    this.killStreak = 0;
    this.multiKillTimer = 0;
    this.multiKillCount = 0;
    this.deadeyeStreak = 0;
    this.marksmanProfile = loadMarksmanProfile();
    this.lastMarksmanShot = null;
    this.liveLrfReadout = null;
    this.isExactLrfZero = false;

    // Respawn Timer
    this.respawnTimer = 0;
    this.respawnDelay = PLAYER.RESPAWN_DELAY; // seconds

    // Optional Tactical Death Cam (Default: OFF = false so hardcore mil-sim realism is preserved!)
    this.deathCamEnabled = false;
    try {
      const savedDeathCam = localStorage.getItem('bb_death_cam_enabled');
      if (savedDeathCam !== null) {
        this.deathCamEnabled = savedDeathCam === 'true' || savedDeathCam === '1';
      }
    } catch (_) {}
    this.lastDeathReport = null;
    this.deathCamPostTimer = 0;
    this.deathCamPostMax = 4.2;
    this.deathCamMode = 'ZOOM'; // 'ZOOM' (Battlefield Silhouette Zoom) | 'KILLER_POV' (CoD Killer's Eyes / Scope)
    this._deathCamBlend = 0;
    this._deathCamAge = 0;
    this._lastRightMouseDownAt = 0;
    this._adsWasOpenOnRightDown = false;
    this._rightMouseHeld = false;
    this._deathCamFocusVec = new THREE.Vector3();
    this._deathCamLookVec = new THREE.Vector3();
    this._deathCamShotDir = new THREE.Vector3();
    this._deathCamRightVec = new THREE.Vector3();
    this._deathCamTargetQuat = new THREE.Quaternion();
    this._deathCamBaseQuat = new THREE.Quaternion();
    this._deathCamLookMat = new THREE.Matrix4();

    // Rally Point
    this.rallyPoint = null;       // { pos: Vector3, mesh: Group, timer: 90 }
    this.rallyCooldown = 0;

    // Commander UAV Scan & Airstrike
    this.uavActive = false;
    this.uavTimer = 0;           // seconds remaining on UAV scan
    this.uavCooldown = 0;        // cooldown until next UAV
    this.uavRevealedBots = [];   // bots revealed by UAV
    this.uavRevealedVehicles = []; // enemy vehicles revealed by UAV
    this.uavHotspotText = '';    // highest-threat objective sector
    this.uavAssists = 0;         // recon assists earned during UAV
    this.uavDroneMesh = null;
    this.uavSweepRingMesh = null;
    this.uavOrbitAngle = 0;

    this.airstrikePattern = 'CARPET'; // 'CARPET' | 'BUNKER_BUSTER' | 'ARTILLERY'
    this.airstrikeCooldown = 0;  // cooldown until next airstrike
    this.airstrikeTarget = null; // { pos: Vector3, timer: Number, maxTimer: Number, pattern: String, strikeDir: Vector3, markers: Group }
    this.pendingAirstrikeBombs = []; // staggered physical falling bombs
    this.activeAirstrikeJets = [];   // 3D strike fighter jets flying overhead
    createCommanderUavFSM(this);
    createCommanderAirstrikeFSM(this);

    // Insertion Beacon (Recon Class only)
    this.insertionBeacon = null;  // { pos: Vector3, mesh: Group, spawnsLeft: 2, timer: 180 }
    this.beaconCooldown = 0;
    createSquadDeployablesFSM(this);

    // Commo Rose / Quick Chat Wheel State
    this.commoRoseActive = false;
    this.lastCommoCommand = null;
    this.commoRoseCooldown = 0;

    // Combat, Optics, Zeroing, Mag Packing & Fortification Blueprints
    this.isFiring = false;
    this.isAds = false;
    this.adsAmount = 0;
    this.useCantedSight = false;
    this.opticZoomIndex = 0;
    this.fireArrowsActive = false; // [V] toggles Regular Bodkin Arrows vs. Fire Arrows on Bows & Crossbows!
    this.zeroDistance = PLAYER.ZERO_DISTANCE_DEFAULT;
    this.fireTimer = 0;
    this.reloading = false;
    this.fastReload = false;
    this.slowReloading = false;
    this.reloadTimer = 0;
    this.reloadTotalTime = 1.8;
    this.magPackProgress = 0;
    this.magPackBulletTimer = 0;
    this.magPackBulletDuration = 0.22;
    this.slowReloadRoundsPacked = 0;
    this.keyRHoldTime = 0;
    this.recoilOffsetPitch = 0;
    this.recoilKickZ = 0;
    this.muzzleFlashTimer = 0;
    this.shotsFired = 0;

    this.buildBlueprints = [
      'CHEST WALL',
      'COVERED BUNKER ($350)',
      'HMG NEST ($450)',
      'MORTAR PIT ($600)',
      'AA EMPLACEMENT ($650)',
      'COMMAND BUNKER ($1000)',
      'TACTICAL HOUSE ($1000)'
    ];
    this.buildBlueprintIndex = 0;
    this.activePing = null;
    this.nvgActive = false;
    this.sensorMode = 'OFF'; // 'OFF' | 'NVG' | 'WHOT' | 'BHOT'

    this.slots = [];
    this.currentSlotIndex = 0;
    this.viewModelGroup = new THREE.Group();
    this.viewModelGroup.visible = false;
    this.camera.add(this.viewModelGroup);

    this.raycaster = new THREE.Raycaster();
    this.plantedC4 = [];
    this.activeBullets = [];

    // Default event bridges for backwards compatibility with legacy callback properties
    this.onHitmarker = makeEventBridge('hitmarker:show', (type, label) => ({ type, label }));
    this.onHitMarker = this.onHitmarker;
    this.onDamageTaken = makeEventBridge(
      'player:damaged',
      (amount, sourcePos, inVehicle, weaponName, attackerName) => ({
        amount,
        sourcePos,
        inVehicle,
        weaponName,
        attackerName
      })
    );
    this.onAwardXp = makeEventBridge('xp:awarded', (amount, reason) => ({ amount, reason }));
    this.onCashChanged = makeEventBridge('cash:changed', (balance, delta, reason) => ({
      balance,
      delta,
      reason
    }));
    this.onKillEvent = makeEventBridge(
      'kill:event',
      (killer, kTeam, victim, vTeam, weapon, isHs) => ({
        killer,
        kTeam,
        victim,
        vTeam,
        weapon,
        isHs
      })
    );
    this.onKillStreakAnnouncement = makeEventBridge('killstreak:announced', (text) => ({ text }));
    this.onFloatingDamage = makeEventBridge(
      'damage:floating',
      (worldPos, damage, isHeadshot) => ({ worldPos, damage, isHeadshot })
    );
    this.onCommoRoseOpen = makeEventBridge('commo:open', () => ({}));
    this.onCommoRoseClose = makeEventBridge('commo:close', () => ({}));
    this.onCommoCommand = makeEventBridge('commo:command', (cmdId, text, icon) => ({
      cmdId,
      text,
      icon
    }));
    this.onPlayerDied = makeEventBridge('player:died', (killerName, weaponName) => ({
      killerName,
      weaponName
    }));
    this.onExplosionDamage = makeEventBridge(
      'explosion:damage',
      (pos, radius, maxDamage, owner, brokenCount) => ({
        pos,
        radius,
        maxDamage,
        owner,
        brokenCount
      })
    );
    this.onWarCrimeCommitted = makeEventBridge(
      'warcrime:committed',
      (medicName, wasRescuing, totalCount) => ({
        medicName,
        wasRescuing,
        totalCount
      })
    );

    this.setupInputs();
    this.equipLoadout('engineer');
  }

  setBhopEnabled(enabled) {
    this.bhopEnabled = Boolean(enabled);
    if (!this.bhopEnabled) {
      this.bhopCount = 0;
    }
    try {
      localStorage.setItem('bb_bhop_enabled_v1', this.bhopEnabled ? 'true' : 'false');
    } catch (_) {}
    return this.bhopEnabled;
  }

  toggleBhopEnabled() {
    return this.setBhopEnabled(!this.bhopEnabled);
  }

  setSquadDoctrineEnabled(val) {
    this.squadDoctrineEnabled = Boolean(val);
    try {
      localStorage.setItem('bb_squad_doctrine', this.squadDoctrineEnabled ? 'true' : 'false');
    } catch (_) {}
    if (this.squadDoctrineEnabled && this.commandRank !== 'COMMANDER' && this.commandScope === 'ALL') {
      this.commandScope = 'SQUAD';
    }
    if (window.game?.ui) {
      window.game.ui.updateSquadDoctrineUI?.();
      window.game.ui.updateCommandOrderHud?.();
      window.game.ui.renderDeployB2CustomizerBar?.();
      window.game.ui.drawDeployMap?.(true);
    }
    return this.squadDoctrineEnabled;
  }

  toggleSquadDoctrineEnabled() {
    return this.setSquadDoctrineEnabled(!this.squadDoctrineEnabled);
  }

  /**
   * Samples where the player's camera/scope is aiming up to 1,500m away so `[Alt+R]` Drop-Off
   * can also target any building roof or ridge you were looking at!
   */
  sampleRideCrosshairPoint() {
    if (!this.world || !this.camera) return null;
    const origin = this.camera.position.clone();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    if (typeof this.world.raycastVoxel === 'function') {
      const voxHit = this.world.raycastVoxel(origin, dir, 1500);
      if (voxHit && voxHit.point && voxHit.point.distanceTo(this.pos) > 14) {
        return { x: voxHit.point.x, y: voxHit.point.y, z: voxHit.point.z, isStructure: true };
      }
    }
    for (let dist = 18; dist <= 1500; dist += dist < 250 ? 6 : 16) {
      const px = origin.x + dir.x * dist;
      const py = origin.y + dir.y * dist;
      const pz = origin.z + dir.z * dist;
      if (Math.abs(px) > 2350 || Math.abs(pz) > 1550) break;
      const terrY = this.world.getGroundHeightAt(px, pz);
      if (py <= terrY + 0.6) {
        return { x: px, y: terrY, z: pz, isStructure: false };
      }
    }
    return null;
  }

  /**
   * Two-Step `[Alt+R]` (`[⌥+R]` on Mac) Tactical Ride Workflow:
   * - 1st `[Alt+R]` (no active ride yet, on foot): Immediately dispatches pickup to YOUR CURRENT POSITION
   *   (`pickupOnly: true` — no need to pick a destination yet!).
   * - 2nd+ `[Alt+R]` (while ride is inbound, holding, onboard awaiting drop-off, or mid-trip):
   *   * If you placed a fresh `[Q]` 3D Tactical Ping, locks that pinged rooftop/spot as your drop-off immediately!
   *   * Otherwise opens the Tactical Drop-Off Selector (`openRideMapModal`) so you can click any rooftop, objective, or map spot!
   */
  handleAltRRideAction(ui = null) {
    if (this.dead || this.downed || !this.vehicleManager?.requestPlayerRide) return null;
    const curRide =
      this.activeRideVehicle &&
      !this.activeRideVehicle.dead &&
      this.activeRideVehicle.rideTask?.active &&
      this.activeRideVehicle.rideTask.phase !== 'RTB_DEPART'
        ? this.activeRideVehicle
        : null;
    const inRideableVehicle = Boolean(
      this.activeVehicle &&
        !this.activeVehicle.dead &&
        (this.activeVehicle.isHelicopter ||
          this.activeVehicle.type === 'apc' ||
          this.activeVehicle.type === 'truck_transport' ||
          this.activeVehicle.type === 'humvee' ||
          this.activeVehicle.type === 'car')
    );

    // STEP 1: On foot with no active ride -> "Pick me up right where I am!"
    if (!curRide && !inRideableVehicle) {
      return this.requestQuickTacticalRide({ pickupOnly: true });
    }

    // STEP 2: Ride is already inbound / waiting / onboard -> Designate Drop-Off!
    const curTask = curRide?.rideTask || this.activeVehicle?.rideTask || null;
    const hasFreshPing = Boolean(
      this.activePing &&
        this.activePing.timer > 0 &&
        this.activePing.pos &&
        this.activePing !== curTask?._consumedPingRef
    );
    if (hasFreshPing) {
      const mode =
        curTask?.transportMode ||
        (this.activeVehicle?.isHelicopter
          ? 'heli'
          : this.activeVehicle?.type === 'apc'
          ? 'apc'
          : this.activeVehicle?.type === 'truck_transport'
          ? 'truck'
          : this.activeVehicle?.type === 'humvee' || this.activeVehicle?.type === 'car'
          ? 'humvee'
          : this.preferredRideMode || 'heli');
      return this.vehicleManager.requestPlayerRide(this, {
        transportMode: mode,
        destX: this.activePing.pos.x,
        destZ: this.activePing.pos.z,
        preferRoof: mode === 'heli',
        _consumedPingRef: this.activePing,
        customLabel: `📍 PINGED LZ (${Math.round(this.activePing.pos.x)}, ${Math.round(this.activePing.pos.z)})`
      });
    }

    this._lastRideCrosshairPoint = this.sampleRideCrosshairPoint();
    const targetUi = ui || (typeof window !== 'undefined' ? window.game?.ui : null);
    if (targetUi && typeof targetUi.openRideMapModal === 'function') {
      targetUi.openRideMapModal();
      return { ok: true, openedDropoffSelector: true };
    }
    return this.requestQuickTacticalRide();
  }

  /**
   * Direct / Wheel / Context-Smart Ride Request (`[Y]` Wheel or programmatic calls):
   */
  requestQuickTacticalRide(opts = {}) {
    if (this.dead || this.downed || !this.vehicleManager?.requestPlayerRide) return null;
    const gndY = this.world ? this.world.getGroundHeightAt(this.pos.x, this.pos.z) : 0;
    const onHighRoof = this.pos.y - gndY > 6.5;
    const mode = opts.transportMode || (onHighRoof ? 'heli' : this.preferredRideMode || 'heli');
    if (opts.pickupOnly) {
      return this.vehicleManager.requestPlayerRide(this, {
        ...opts,
        pickupOnly: true,
        transportMode: mode
      });
    }
    if (
      !opts.destKey &&
      !Number.isFinite(opts.destX) &&
      this.activePing &&
      this.activePing.timer > 0 &&
      this.activePing.pos
    ) {
      return this.vehicleManager.requestPlayerRide(this, {
        transportMode: mode,
        destX: this.activePing.pos.x,
        destZ: this.activePing.pos.z,
        preferRoof: mode === 'heli',
        _consumedPingRef: this.activePing,
        customLabel: `📍 PINGED LZ (${Math.round(this.activePing.pos.x)}, ${Math.round(this.activePing.pos.z)})`
      });
    }
    return this.vehicleManager.requestPlayerRide(this, {
      ...opts,
      transportMode: mode
    });
  }

  setDeathCamEnabled(val) {
    this.deathCamEnabled = Boolean(val);
    try {
      localStorage.setItem('bb_death_cam_enabled', this.deathCamEnabled ? 'true' : 'false');
    } catch (_) {}
    if (!this.deathCamEnabled) {
      this._deathCamBlend = 0;
      this.clearDeathCamVisuals?.();
      this.resetDeathCamFov();
      if (this.dead && this.deathCamPostTimer > 0) {
        this.finishPostDeathCam();
      }
    } else if (
      (this.downed || (this.dead && this.deathCamPostTimer > 0)) &&
      this.lastDeathReport?.hasKillerOrigin
    ) {
      this.syncDeathCamVisuals?.(true);
    }
    if (typeof window !== 'undefined' && window.game?.ui) {
      window.game.ui.updateDeathCamUI?.();
    }
    return this.deathCamEnabled;
  }

  toggleDeathCamEnabled() {
    const nextVal = this.setDeathCamEnabled(!this.deathCamEnabled);
    sound.playRadioBeep?.(true);
    if (this.onAwardXp) {
      this.onAwardXp(
        0,
        nextVal
          ? '🎥 OPTIONAL DEATH CAM: ON (KILLER SILHOUETTE ZOOM, BULLET FLIGHT & [C] KILLER POV)'
          : '🪖 OPTIONAL DEATH CAM: OFF (REALISTIC MODE — NO KILLER POSITION OR SHOT TRACE)'
      );
    }
    return nextVal;
  }

  toggleDeathCamMode() {
    this.deathCamMode = this.deathCamMode === 'KILLER_POV' ? 'ZOOM' : 'KILLER_POV';
    sound.playEmptyClick?.();
    if (this.deathCamEnabled && (this.downed || (this.dead && this.deathCamPostTimer > 0))) {
      this.syncDeathCamVisuals?.(true);
    }
    if (typeof window !== 'undefined' && window.game?.ui) {
      window.game.ui._lastDeathCamSig = '';
      window.game.ui.updateDeathCamHud?.(0);
    }
    return this.deathCamMode;
  }

  toggleAdsScope() {
    if (this.dead || this.downed) return false;
    if (this.activeVehicle) {
      this.isAds = !this.isAds;
      sound.playEmptyClick?.();
      return this.isAds;
    }
    if (this.reloading || this.slowReloading) return false;
    const cur = this.currentWeapon?.();
    if (cur && cur.def?.type === 'c4') {
      this.detonateC4?.();
      return false;
    }
    if (cur && cur.def?.type === 'hammer') {
      this.useHammer?.(true);
      return false;
    }
    this.isAds = !this.isAds;
    sound.playEmptyClick?.();
    return this.isAds;
  }

  handleSecondaryAimDown() {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this._lastRightMouseDownAt = now;
    this._rightMouseHeld = true;
    this._adsWasOpenOnRightDown = Boolean(this.isAds);

    if (this.activeVehicle) {
      if (!this.isAds) this.isAds = true;
      return;
    }
    const cur = this.currentWeapon?.();
    if (cur && cur.def?.type === 'c4') {
      this.detonateC4();
      this._rightMouseHeld = false;
      return;
    }
    if (cur && cur.def?.type === 'hammer') {
      this.useHammer(true);
      this._rightMouseHeld = false;
      return;
    }
    if (!this.isAds) {
      this.isAds = true;
    }
  }

  handleSecondaryAimUp() {
    if (!this._rightMouseHeld) return;
    this._rightMouseHeld = false;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const heldMs = Math.max(0, now - (this._lastRightMouseDownAt || 0));

    // Hybrid ADS (Desktop Mouse Hold + MacBook Two-Finger Trackpad Tap Toggle!):
    // - Held >= 240ms: Classic Hold-to-ADS — releasing Right-Click closes scope immediately.
    // - Quick Tap < 240ms: Two-Finger Trackpad Tap / Click-to-Toggle —
    //   1st tap keeps scope OPEN so you can aim with 1 finger & click to shoot; 2nd tap closes scope!
    if (heldMs >= 240) {
      this.isAds = false;
    } else if (this._adsWasOpenOnRightDown) {
      this.isAds = false;
    }
  }

  resetDeathCamFov() {
    if (this.camera && Math.abs((this.camera.fov || 75) - 75) > 0.05) {
      this.camera.fov = 75;
      if (typeof this.camera.updateProjectionMatrix === 'function') {
        this.camera.updateProjectionMatrix();
      }
    }
  }

  getLiveKillerFocusPos(outVec = null) {
    const target = outVec || this._deathCamFocusVec || new THREE.Vector3();
    const report = this.lastDeathReport;
    if (!report) return target.set(this.pos.x, this.pos.y + 1.5, this.pos.z);

    const veh =
      report.killerVehicle && !report.killerVehicle.dead
        ? report.killerVehicle
        : report.killerUnit?.activeVehicle && !report.killerUnit.activeVehicle.dead
        ? report.killerUnit.activeVehicle
        : null;
    if (veh && veh.pos) {
      report.killerLiveHp = Math.max(0, Math.round(veh.hp ?? report.killerHp));
      report.killerLiveMaxHp = Math.max(1, Math.round(veh.maxHp || report.killerMaxHp || 1000));
      return target.set(veh.pos.x, veh.pos.y + (veh.isAircraft ? 0 : 2.15), veh.pos.z);
    }

    const unit = report.killerUnit;
    if (unit && !unit.dead && unit.pos) {
      if (typeof unit.hp === 'number') {
        report.killerLiveHp = Math.max(0, Math.round(unit.hp));
        report.killerLiveMaxHp = Math.max(1, Math.round(unit.maxHp || 100));
      }
      return target.set(unit.pos.x, unit.pos.y + 1.48, unit.pos.z);
    }

    if (report.killerOriginPos) {
      return target.copy(report.killerOriginPos);
    }
    return target.set(this.pos.x, this.pos.y + 1.5, this.pos.z);
  }

  ensureDeathCamTargetVisible() {
    if (!this.deathCamEnabled) return;
    if (!this.downed && !(this.dead && this.deathCamPostTimer > 0)) return;
    const report = this.lastDeathReport;
    if (!report) return;
    if (report.killerUnit?.mesh && !report.killerUnit.dead) {
      report.killerUnit.mesh.visible = true;
    }
    const veh = report.killerVehicle || report.killerUnit?.activeVehicle;
    if (veh?.mesh && !veh.dead) {
      veh.mesh.visible = true;
    }
  }

  updateDeathCamCamera(dt, isPostDeath = false) {
    const report = this.lastDeathReport;
    if (!this.deathCamEnabled || !report || !report.hasKillerOrigin || !this.camera) {
      if (!isPostDeath) {
        this.resetDeathCamFov();
        this.syncCameraTransform();
      }
      return false;
    }

    this.syncDeathCamVisuals?.(true);
    if (this._deathCamTraceGroup?.userData?.originBeacon) {
      this._deathCamTraceGroup.userData.originBeacon.rotation.y += dt * 1.9;
    }

    const focusPos = this.getLiveKillerFocusPos(this._deathCamFocusVec);
    this.ensureDeathCamTargetVisible();
    this._deathCamAge = (this._deathCamAge || 0) + dt;

    const victimPos = report.victimSnapshotPos || this.pos;

    // Mode B (`[C]` Killer's 1st-Person Scope / Eyes POV — Call of Duty style sightline check!)
    if (this.deathCamMode === 'KILLER_POV') {
      const povOrig = report.killerOriginPos || focusPos;
      this.camera.position.copy(povOrig);
      this.camera.lookAt(victimPos);
      const distToVic = Math.max(1, povOrig.distanceTo(victimPos));
      const povZoom = Math.min(3.4, Math.max(1.15, distToVic / 26));
      const targetPovFov = Math.min(62, Math.max(22, 75 / povZoom));
      const curFov = this.camera.fov || 75;
      const nextFov = curFov + (targetPovFov - curFov) * Math.min(1, dt * 9.0);
      if (Math.abs(nextFov - curFov) > 0.02) {
        this.camera.fov = nextFov;
        this.camera.updateProjectionMatrix?.();
      }
      this.camera.updateMatrixWorld();
      return true;
    }

    // Mode A (Default `'ZOOM'` — Battlefield + War Thunder Continuous Pull-Back & Killer Silhouette Zoom):
    // 1. Pulls camera slightly behind & above YOUR 3D cyan hit-silhouette (`📍 YOU`) so low walls/grass
    //    NEVER block your view and you immediately see your own body + incoming bullet direction!
    // 2. Smoothly zooms onto the glowing orange-red Killer (`🎯 KILLER`) with ZERO jarring 180° teleport!
    this._deathCamShotDir.subVectors(focusPos, victimPos);
    const totalShotDist = Math.max(1, this._deathCamShotDir.length());
    this._deathCamShotDir.divideScalar(totalShotDist);

    const pullBackT = Math.min(1, (this._deathCamAge || 0) / 0.75);
    const easePull = 1 - Math.pow(1 - pullBackT, 3);
    const backFromVictim = 3.2 * easePull;
    const upAboveVictim = 1.15 + 1.35 * easePull;

    const anchorOrigin = new THREE.Vector3(victimPos.x, victimPos.y + 0.35, victimPos.z);
    const desiredPullCam = new THREE.Vector3(
      victimPos.x - this._deathCamShotDir.x * backFromVictim,
      (report.victimFeetPos ? report.victimFeetPos.y : this.pos.y) + upAboveVictim,
      victimPos.z - this._deathCamShotDir.z * backFromVictim
    );
    // During post-death (`isPostDeath`), gently glide slightly closer along the sightline without ever flipping 180°!
    if (isPostDeath && totalShotDist > 16) {
      const postFrac = Math.min(
        0.35,
        Math.max(0, 1 - (this.deathCamPostTimer || 0) / (this.deathCamPostMax || 4.2)) * 0.35
      );
      desiredPullCam.lerp(focusPos, postFrac);
    }
    if (this.world && typeof this.world.getGroundHeightAt === 'function') {
      const gy = this.world.getGroundHeightAt(desiredPullCam.x, desiredPullCam.z);
      if (Number.isFinite(gy)) {
        desiredPullCam.y = Math.max(desiredPullCam.y, gy + 1.35);
      }
    }
    if (typeof this.resolveCameraWallCollision === 'function') {
      const safeCam = this.resolveCameraWallCollision(anchorOrigin, desiredPullCam, 0.38);
      this.camera.position.copy(safeCam);
    } else {
      this.camera.position.copy(desiredPullCam);
    }

    // Frame both YOUR hit-silhouette (first 0.7s) and then smoothly center onto the Killer!
    const focusBlend = Math.min(1, Math.max(0.28, (this._deathCamAge || 0) / 0.95));
    this._deathCamLookVec.lerpVectors(victimPos, focusPos, focusBlend);

    const baseEuler = new THREE.Euler(
      Math.min(Math.PI / 2 - 0.05, this.pitch),
      this.yaw,
      0,
      'YXZ'
    );
    this._deathCamBaseQuat.setFromEuler(baseEuler);
    this._deathCamLookMat.lookAt(this.camera.position, this._deathCamLookVec, new THREE.Vector3(0, 1, 0));
    this._deathCamTargetQuat.setFromRotationMatrix(this._deathCamLookMat);

    this._deathCamBlend = Math.min(1, (this._deathCamBlend || 0) + dt * 3.8);
    const smoothT = 1 - Math.pow(1 - this._deathCamBlend, 3);
    this.camera.quaternion.copy(this._deathCamBaseQuat).slerp(this._deathCamTargetQuat, smoothT);

    // Hold wider FOV for the first 0.55s so you see YOUR body + bullet impact, then optically zoom onto Killer!
    const distToKiller = Math.max(1, this.camera.position.distanceTo(focusPos));
    const zoomRamp = Math.min(1, Math.max(0, ((this._deathCamAge || 0) - 0.45) / 1.1));
    const maxZoomFactor = Math.min(3.25, Math.max(1.0, distToKiller / 26));
    const curZoomFactor = 1.0 + (maxZoomFactor - 1.0) * zoomRamp;
    const targetFov = Math.min(68, Math.max(23, 75 / curZoomFactor));
    const curFov = this.camera.fov || 75;
    const nextFov = curFov + (targetFov - curFov) * Math.min(1, dt * 5.5);
    if (Math.abs(nextFov - curFov) > 0.02) {
      this.camera.fov = nextFov;
      if (typeof this.camera.updateProjectionMatrix === 'function') {
        this.camera.updateProjectionMatrix();
      }
    }
    this.camera.updateMatrixWorld();
    return true;
  }

  finishPostDeathCam() {
    this.deathCamPostTimer = 0;
    this._deathCamBlend = 0;
    this._deathCamAge = 0;
    this.deathCamMode = 'ZOOM';
    this.clearDeathCamVisuals?.();
    this.resetDeathCamFov();
    if (typeof window !== 'undefined' && window.game && this.dead && !window.game.matchEnded) {
      window.game.ui?.showDeployScreen?.();
    }
  }

  startWeaponInspect() {
    if (this.dead || this.downed || this.activeVehicle || this.reloading || this.slowReloading) {
      return false;
    }
    this.isAds = false;
    this.inspectTotalTime = 3.2;
    this.inspectTimer = 3.2;
    sound.playWeaponSwitch?.();
    return true;
  }

  _getModalEl(id) {
    if (!this._persistentModalEls) {
      this._persistentModalEls = new Map();
    }
    if (id === 'deploy-screen' || id === 'victory-screen') {
      let cached = this._persistentModalEls.get(id);
      if (!cached || !cached.isConnected) {
        cached = document.getElementById(id);
        if (cached) this._persistentModalEls.set(id, cached);
      }
      return cached;
    }
    const uiCache = window.game?.ui?._domCache;
    if (uiCache) {
      const cached = uiCache.get(id);
      if (cached && cached.isConnected) return cached;
    }
    return document.getElementById(id);
  }

  _closePopoutModals() {
    this._modalCacheTime = 0;
    const uiCache = window.game?.ui?._domCache;
    for (const id of ['command-modal', 'mp-invite-modal', 'controls-overlay']) {
      const el = document.getElementById(id);
      if (el) el.remove();
      if (uiCache) uiCache.delete(id);
    }
    if (uiCache) uiCache.delete('cmd-tactical-map-canvas');
    for (const id of ['multiplayer-modal', 'settings-modal']) {
      const el = document.getElementById(id);
      if (el && !el.classList.contains('hidden')) el.classList.add('hidden');
    }
  }

  isModalOpen(useFastCache = false) {
    const locked = document.pointerLockElement === document.body;
    const now = performance.now();
    if (useFastCache && this._modalCacheTime > 0 && this._modalCacheLocked === locked) {
      const ttl = locked ? 100 : 20;
      if (now - this._modalCacheTime < ttl) {
        return this._modalCacheVal;
      }
    }
    const ids = [
      'gunsmith-modal',
      'command-modal',
      'mp-invite-modal',
      'multiplayer-modal',
      'settings-modal',
      'controls-overlay',
      'deploy-screen',
      'victory-screen'
    ];
    let open = false;
    for (let i = 0; i < ids.length; i++) {
      const el = this._getModalEl(ids[i]);
      if (el && !el.classList.contains('hidden') && el.style.display !== 'none') {
        open = true;
        break;
      }
    }
    this._modalCacheVal = open;
    this._modalCacheLocked = locked;
    this._modalCacheTime = now;
    return open;
  }

  isPopoutModalOpen() {
    const ids = [
      'gunsmith-modal',
      'command-modal',
      'mp-invite-modal',
      'multiplayer-modal',
      'settings-modal',
      'controls-overlay'
    ];
    for (let i = 0; i < ids.length; i++) {
      const el = this._getModalEl(ids[i]);
      if (el && !el.classList.contains('hidden') && el.style.display !== 'none') {
        return true;
      }
    }
    return false;
  }

  _getWeaponAnimRefs(mesh) {
    if (!mesh) return null;
    let refs = mesh.userData._animRefs;
    if (
      refs &&
      ((refs.mag && !refs.mag.parent) || (refs.opticSight && !refs.opticSight.parent))
    ) {
      refs = null;
    }
    if (!refs) {
      const mag = mesh.getObjectByName('magazineMesh') || null;
      const knifePivot = mesh.getObjectByName('knifePivotGroup') || null;
      const swordPivot = mesh.getObjectByName('swordPivot') || null;
      refs = {
        mag,
        magTopBrass: mag ? mag.getObjectByName('magTopBrass') || null : null,
        leftArm: mesh.getObjectByName('leftArmGroup') || null,
        rightArm: mesh.getObjectByName('rightArmGroup') || null,
        triggerFinger: mesh.getObjectByName('triggerFingerGroup') || null,
        triggerBlade: mesh.getObjectByName('triggerBladeMesh') || null,
        bolt: mesh.getObjectByName('boltCarrierMesh') || null,
        packBullet: mesh.getObjectByName('packingBulletMesh') || null,
        rpgWarhead: mesh.getObjectByName('rpgWarhead') || null,
        knifePivot,
        baliSafeHandle: knifePivot ? knifePivot.getObjectByName('baliSafeHandle') || null : null,
        baliBiteHandle: knifePivot ? knifePivot.getObjectByName('baliBiteHandle') || null : null,
        swordPivot,
        shieldPivot: mesh.getObjectByName('shieldPivot') || null,
        scabbardPivot: mesh.getObjectByName('scabbardPivot') || null,
        swordSwingTrail: swordPivot ? swordPivot.getObjectByName('swordSwingTrail') || null : null,
        opticSight: mesh.getObjectByName('opticSightGroup') || null,
        muzzleFlash: mesh.getObjectByName('muzzleFlash') || null,
        bowString: mesh.getObjectByName('bowStringGroup') || null,
        arrow: mesh.getObjectByName('nockedProjectile') || null,
        fireTip: mesh.getObjectByName('fireTipMesh') || null
      };
      mesh.userData._animRefs = refs;
    }
    return refs;
  }

  callMenToSetupTrebuchet(preferredTreb = null) {
    if (!this.vehicleManager || typeof this.vehicleManager.callMenToSetupTrebuchet !== 'function') {
      return null;
    }
    return this.vehicleManager.callMenToSetupTrebuchet(this, this.botManager, preferredTreb);
  }

  setupInputs() {
    document.addEventListener('pointerlockchange', () => {
      this._modalCacheTime = 0;
    });

    window.addEventListener('keydown', (e) => {
      this._modalCacheTime = 0;
      const activeTag = document.activeElement ? document.activeElement.tagName : '';
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
        return;
      }
      if (e.code === 'Escape') {
        const ctrlOverlay = document.getElementById('controls-overlay');
        if (ctrlOverlay) {
          ctrlOverlay.remove();
          if (window.game?.ui?._domCache) window.game.ui._domCache.delete('controls-overlay');
          return;
        }
      }
      if (e.code === 'AltLeft' || e.code === 'AltRight') {
        this.keys[e.code] = true;
        if (
          document.pointerLockElement === document.body ||
          !this.isModalOpen() ||
          (this.activeVehicle && this.activeVehicle.isAircraft)
        ) {
          e.preventDefault();
        }
      }
      if (!hasAnyModifier(e) || shouldControlLeftCrouch(e)) {
        this.keys[e.code] = true;
      }
      if (!e.repeat && !hasAnyModifier(e)) {
        if (this._konamiReadyForA && e.code === 'KeyA') {
          this._konamiReadyForB = false;
          this._konamiReadyForA = false;
          this.launchSilentSecretB2Bomber?.();
          return;
        }
        if (this._konamiReadyForB && e.code === 'KeyB') {
          this._konamiReadyForA = true;
          this._konamiReadyForB = false;
          return;
        }
        if (e.code !== 'KeyB') {
          this._konamiReadyForA = false;
        }

        const arrowDir = {
          ArrowUp: 'U',
          ArrowDown: 'D',
          ArrowLeft: 'L',
          ArrowRight: 'R'
        }[e.code];
        if (arrowDir) {
          if (!this._secretArrowSeq) this._secretArrowSeq = [];
          this._secretArrowSeq.push(arrowDir);
          if (this._secretArrowSeq.length > 8) this._secretArrowSeq.shift();
          if (this._secretArrowSeq.slice(-4).join('') === 'DDUU') {
            this._secretArrowSeq = [];
            this._konamiReadyForB = false;
            this._konamiReadyForA = false;
            this.launchSilentSecretWrightFlyer?.();
            return;
          }
          if (this._secretArrowSeq.join('') === 'UUDDLRLR') {
            this._secretHorseTurbo = true;
            this._konamiReadyForB = true;
            if (this.activeVehicle && this.activeVehicle.type === 'warhorse') {
              this.activeVehicle.speed = 78.0;
            }
          } else {
            this._konamiReadyForB = false;
          }
        }
        const wasdDir = {
          KeyW: 'U',
          KeyS: 'D',
          KeyA: 'L',
          KeyD: 'R'
        }[e.code];
        if (wasdDir) {
          if (!this._secretWasdSeq) this._secretWasdSeq = [];
          this._secretWasdSeq.push(wasdDir);
          if (this._secretWasdSeq.length > 8) this._secretWasdSeq.shift();
          if (this._secretWasdSeq.join('') === 'UUDDLRLR') {
            this._secretHorseTurbo = true;
            this._konamiReadyForB = true;
            if (this.activeVehicle && this.activeVehicle.type === 'warhorse') {
              this.activeVehicle.speed = 78.0;
            }
          }
        }
      }
      if (this.dead && this.deathCamPostTimer > 0) {
        if (!e.repeat && !hasAnyModifier(e) && e.code === 'KeyV') {
          e.preventDefault();
          this.toggleDeathCamEnabled();
          return;
        }
        if (!e.repeat && !hasAnyModifier(e) && e.code === 'KeyC' && this.deathCamEnabled) {
          e.preventDefault();
          this.toggleDeathCamMode();
          return;
        }
        if (
          !e.repeat &&
          (e.code === 'Space' ||
            e.code === 'Enter' ||
            e.code === 'NumpadEnter' ||
            e.code === 'Escape')
        ) {
          e.preventDefault();
          if (typeof e.stopImmediatePropagation === 'function') {
            e.stopImmediatePropagation();
          }
          this.finishPostDeathCam();
          return;
        }
      }
      if (this.dead) return;

      // Handle Escape / [F] / [Space] while a pop-out modal (Loot / Backpack / Gunsmith / Map / Settings) is open
      if (this.isPopoutModalOpen()) {
        if (e.code === 'Escape' && !e.repeat) {
          e.preventDefault();
          if (window.game?.ui) {
            const gsEl = document.getElementById('gunsmith-modal');
            if (gsEl && !gsEl.classList.contains('hidden')) {
              window.game.ui.toggleGunsmithModal(false);
              this._modalCacheTime = 0;
              return;
            }
            this._closePopoutModals();
            try {
              const p = document.body.requestPointerLock();
              if (p && typeof p.catch === 'function') p.catch(() => {});
            } catch (_) {}
          }
          return;
        }
        const gsEl = document.getElementById('gunsmith-modal');
        const gsOpen = Boolean(gsEl && !gsEl.classList.contains('hidden'));
        if (gsOpen) {
          // Pressing [F] again while the Manual Loot / Backpack modal is open closes it cleanly
          if (!hasAnyModifier(e) && e.code === 'KeyF' && !e.repeat && !this._justOpenedLootByHold) {
            e.preventDefault();
            window.game?.ui?.toggleGunsmithModal?.(false);
            return;
          }
          // Pressing [Space] in the Manual Loot view triggers Quick-Loot All Gear & 50% Cash (Tarkov / ABI style)
          if (!hasAnyModifier(e) && e.code === 'Space' && !e.repeat && window.game?.ui?._gunsmithActiveTab === 'backpack') {
            e.preventDefault();
            const packId = window.game.ui._activeLootPackId;
            const pack = (this.world?.lootPacks || []).find((p) => p.id === packId);
            if (pack && typeof this.lootAllFromPack === 'function') {
              this.lootAllFromPack(pack, false, true);
              window.game.ui._lastMagSignature = '';
              window.game.ui.updateCashAndGunsmithHud?.();
            }
            return;
          }
          if (!hasAnyModifier(e) && e.code === 'KeyL' && !e.shiftKey && !e.repeat) {
            e.preventDefault();
            window.game?.ui?.toggleGunsmithModal?.(false);
            return;
          }
          if (!e._backpackHandled && !hasAnyModifier(e) && e.code === 'KeyI' && !e.repeat) {
            e.preventDefault();
            e._backpackHandled = true;
            if (window.game?.ui?._gunsmithActiveTab === 'backpack') {
              window.game.ui.toggleGunsmithModal?.(false);
            } else if (window.game?.ui) {
              window.game.ui._gunsmithActiveTab = 'backpack';
              window.game.ui.toggleGunsmithModal?.(true);
            }
            return;
          }
        }
        return;
      }

      if (this.isModalOpen()) return;

      if (!e._backpackHandled && !hasAnyModifier(e) && e.code === 'KeyI' && !e.repeat && window.game?.ui) {
        e.preventDefault();
        e._backpackHandled = true;
        window.game.ui._gunsmithActiveTab = this.activeVehicle ? 'vehicles' : 'backpack';
        window.game.ui.toggleGunsmithModal(true);
        return;
      }

      if (!hasAnyModifier(e) && e.code === 'KeyN' && !e.repeat) {
        const av = this.activeVehicle;
        const curWepForN = !av && typeof this.currentWeapon === 'function' ? this.currentWeapon() : null;
        const activeOpticForN =
          !av && typeof this.getActiveOpticType === 'function'
            ? this.getActiveOpticType()
            : curWepForN?.def?.opticType;
        const inThermalWeaponScope = Boolean(
          !av &&
            this.isAds &&
            !this.useCantedSight &&
            (activeOpticForN === 'flir' || activeOpticForN === 'sniperFlir' || curWepForN?.def?.isThermal)
        );
        if (inThermalWeaponScope) {
          this.scopeThermalPolarity = this.scopeThermalPolarity === 'BHOT' ? 'WHOT' : 'BHOT';
          sound.playEmptyClick?.();
          if (this.onAwardXp) {
            this.onAwardXp(
              0,
              this.scopeThermalPolarity === 'BHOT'
                ? '🌡️ SCOPE THERMAL [N]: BLACK-HOT INFRARED (BHOT IR) POLARITY'
                : '🌡️ SCOPE THERMAL [N]: WHITE-HOT INFRARED (WHOT IR) POLARITY'
            );
          }
        } else {
          let allowedModes = ['OFF', 'NVG'];
          if (av) {
            const hasFlir = Boolean(av.hasThermalFlir || av.aircraftRole === 'b2_spirit');
            const hasNvg = Boolean(hasFlir || av.hasNightVision || this.hasThermalGoggles);
            if (hasFlir) {
              allowedModes =
                av.isAircraft && av.aircraftRole === 'gunship'
                  ? ['OFF', 'WHOT', 'BHOT', 'NVG']
                  : ['OFF', 'NVG', 'WHOT', 'BHOT'];
            } else if (hasNvg) {
              allowedModes = ['OFF', 'NVG'];
            } else {
              allowedModes = ['OFF'];
            }
          } else if (this.hasThermalGoggles) {
            allowedModes = ['OFF', 'NVG', 'WHOT'];
          }
          if (allowedModes.length <= 1) {
            this.sensorMode = 'OFF';
            this.nvgActive = false;
            sound.playEmptyClick?.();
            if (this.onAwardXp) {
              this.onAwardXp(
                0,
                av?.isAircraft
                  ? '🔭 NO NIGHT-VISION / FLIR POD INSTALLED — EQUIP AVS-9 NVG OR SNIPER FLIR POD IN [L] AIRCRAFT HANGAR!'
                  : '🔭 NO THERMAL / NVG SIGHT INSTALLED — EQUIP CREW NVG OR CITV FLIR IN [L] VEHICLE BAY!'
              );
            }
          } else {
            const curMode = allowedModes.includes(this.sensorMode)
              ? this.sensorMode
              : this.nvgActive
              ? 'NVG'
              : 'OFF';
            const nextMode = allowedModes[(allowedModes.indexOf(curMode) + 1) % allowedModes.length];
            this.sensorMode = nextMode;
            this.nvgActive = nextMode !== 'OFF';
            if (av) av._userToggledSensorManually = true;
            sound.playEmptyClick?.();
            if (this.onAwardXp) {
              const modeLabel =
                nextMode === 'WHOT'
                  ? '🌡️ SENSOR [N]: WHITE-HOT FLIR INFRARED (WHOT IR) ACTIVE'
                  : nextMode === 'BHOT'
                  ? '🌡️ SENSOR [N]: BLACK-HOT FLIR INFRARED (BHOT IR) ACTIVE'
                  : nextMode === 'NVG'
                  ? '🥽 SENSOR [N]: GEN-3 GREEN PHOSPHOR NIGHT VISION (NVG) ACTIVE'
                  : '☀️ SENSOR [N]: DAYLIGHT OPTICAL TV MODE';
              this.onAwardXp(0, modeLabel);
            }
          }
        }
      }
      if (this.downed && !hasAnyModifier(e) && !e.repeat) {
        if (e.code === 'KeyV') {
          e.preventDefault();
          this.toggleDeathCamEnabled();
          return;
        }
        if (e.code === 'KeyC' && this.deathCamEnabled) {
          e.preventDefault();
          this.toggleDeathCamMode();
          return;
        }
      }
      if (this.downed) return;

      // [E] Enter / Exit Car or Armor, or Drag Downed Friendly Soldier to cover
      if (!hasAnyModifier(e) && e.code === 'KeyE' && !e.repeat) {
        this.handleVehicleAndDragKey();
      }
      // [F] Revive / Heal Ally, Pick Up Ammo from Crate, Quick-Loot (Tap) or Manual Side-by-Side Loot (Hold)
      //     OR in AC-130J Gunship: Lock Pylon Orbit Anchor directly onto FOB / Crosshair!
      if (!hasAnyModifier(e) && e.code === 'KeyF' && !e.repeat) {
        if (this.activeVehicle && this.activeVehicle.aircraftRole === 'gunship') {
          this.lockGunshipOrbitAtCrosshair?.();
        } else if (this.activeVehicle && this.activeVehicle.isAircraft) {
          this.toggleAircraftSpiLock?.();
        } else if (!this.activeVehicle) {
          this.keyFHoldTime = 0;
          this._justOpenedLootByHold = false;
          this.handleInteractKey();
        }
      }
      if (!hasAnyModifier(e) && e.code === 'KeyG' && !e.repeat) {
        if (this.activeVehicle && this.activeVehicle.isAircraft) {
          const avoidOn = this.toggleAircraftCollisionAvoidance();
          const isHeliNow = Boolean(
            this.activeVehicle.isHelicopter ||
              this.activeVehicle.aircraftRole === 'heli_transport' ||
              this.activeVehicle.aircraftRole === 'heli_attack'
          );
          if (isHeliNow && avoidOn) {
            this.activeVehicle.heliHoverAlt = this.activeVehicle.pos.y;
          }
          sound.playRadioBeep?.(true);
          if (this.onAwardXp) {
            this.onAwardXp(
              0,
              isHeliNow
                ? avoidOn
                  ? '🚁 HELI ASSIST [G]: EASY MODE ON ([WASD] HORIZONTAL FLY • [SPACE/Q] CLIMB • [CTRL/Z] LAND • DECOUPLED MOUSE GUN AIM!)'
                  : '🔥 HELI SIM [G]: HARD CYCLIC MODE ([W/S] ROTOR COLLECTIVE • MOUSE CYCLIC TILT • [A/D] TAIL PEDALS • REAL CRASH!)'
                : avoidOn
                ? '🛡️ FLIGHT ASSIST [G]: AUTO ON (UPRIGHT BANK LIMITER + TERRAIN PULL-UP — EASY FLIGHT)'
                : '🔥 FLIGHT ASSIST [G]: OFF (ADVANCED AEROBATICS — 360° BARREL ROLLS, LOOPS, UPSIDE-DOWN FLIGHT & REALISTIC CRASH!)'
            );
          }
        } else if (!this.activeVehicle) {
          if (this.world?.era === 'medieval') {
            this.callMenToSetupTrebuchet();
          } else {
            this.throwFragGrenade();
          }
        }
      }
      if (!hasAnyModifier(e) && !e.shiftKey && e.code === 'Digit1') {
        if (this.activeVehicle && typeof this.switchVehicleWeaponSlot === 'function') {
          this.switchVehicleWeaponSlot(0);
        } else if (!this.activeVehicle) {
          this.switchSlot(0);
        }
      }
      if (!hasAnyModifier(e) && !e.shiftKey && e.code === 'Digit2') {
        if (this.activeVehicle && typeof this.switchVehicleWeaponSlot === 'function') {
          this.switchVehicleWeaponSlot(1);
        } else if (!this.activeVehicle) {
          this.switchSlot(1);
        }
      }
      if (!hasAnyModifier(e) && e.code === 'KeyQ' && !e.repeat) {
        if (
          this.activeVehicle &&
          this.activeVehicle.isAircraft &&
          (this.activeVehicle.aircraftRole === 'gunship' ||
            this.activeVehicle.isHelicopter ||
            this.activeVehicle.aircraftRole === 'heli_transport' ||
            this.activeVehicle.aircraftRole === 'heli_attack')
        ) {
          // In AC-130 Gunship & Helicopters, [Q] = Collective Climb UP & [Z] = Descend DOWN (Weapons use [1], [2], [3])!
        } else if (this.activeVehicle && typeof this.switchVehicleWeaponSlot === 'function') {
          const maxSlots =
            this.activeVehicle.isAircraft ||
            this.activeVehicle.type === 'tank' ||
            this.activeVehicle.type === 'apc'
              ? 3
              : 2;
          const nextSlot = ((this.activeVehicle.activeWeaponSlot || 0) + 1) % maxSlots;
          this.switchVehicleWeaponSlot(nextSlot);
        } else {
          this._keyQDownAt = performance.now();
        }
      }
      if (!hasAnyModifier(e) && !e.shiftKey && e.code === 'Digit3' && !e.repeat) {
        if (this.activeVehicle && typeof this.switchVehicleWeaponSlot === 'function') {
          this.switchVehicleWeaponSlot(2);
        } else if (!this.activeVehicle) {
          if (
            this.currentSlotIndex === 2 &&
            this.slots &&
            this.slots[2] &&
            (this.slots[2].def?.id === 'rpg7' || this.slots[2].def?.id === 'stinger') &&
            typeof this.toggleEngineerLauncherMode === 'function'
          ) {
            this.toggleEngineerLauncherMode();
          } else if (
            this.currentSlotIndex === 2 &&
            this.slots &&
            this.slots[2] &&
            (this.slots[2].def?.id === 'rangefinder_binos' ||
              (this.slots[2].def?.id === 'c4' && this.role === 'recon')) &&
            typeof this.toggleReconGadgetMode === 'function'
          ) {
            this.toggleReconGadgetMode();
          } else {
            this.switchSlot(2);
          }
        }
      }
      if (!hasAnyModifier(e) && !e.shiftKey && e.code === 'Digit4' && !this.activeVehicle) this.switchSlot(3);
      if (!hasAnyModifier(e) && e.code === 'KeyR' && !e.repeat) {
        if (this.activeVehicle && this.activeVehicle.isAircraft) {
          if (typeof this.handleAircraftRKey === 'function') {
            this.handleAircraftRKey();
          } else if (this.activeVehicle.aircraftRole === 'gunship') {
            this.toggleGunshipFlightMode?.();
          } else {
            this.toggleAircraftLevelAutopilot?.();
          }
        } else if (this.activeVehicle) {
          this.vehicleManager?.triggerManualVehicleRearm?.(this.activeVehicle);
        } else {
          this.keyRHoldTime = 0;
          this.startReload(false);
        }
      }
      // [O] Toggle Weapon Scope / Vehicle Gunner Optic (MacBook & Laptop Trackpad-Friendly 1-Key ADS!)
      if (!hasAnyModifier(e) && e.code === 'KeyO' && !e.repeat) {
        e.preventDefault();
        this.toggleAdsScope();
      }
      if (!hasAnyModifier(e) && e.code === 'KeyP' && !e.repeat && !this.activeVehicle) {
        if (this.slowReloading) {
          this.slowReloading = false;
          this.magPackProgress = 0;
        } else {
          this.startSlowReload(true);
        }
      }
      if (!hasAnyModifier(e) && e.code === 'KeyV' && !e.repeat) {
        const cur = this.currentWeapon();
        const isMountedBow = Boolean(this.activeVehicle && this.activeVehicle.type === 'warhorse');
        if (isMountedBow || (cur && cur.def && (cur.def.isBow || cur.def.isCrossbow))) {
          this.fireArrowsActive = !this.fireArrowsActive;
          sound.playRadioBeep?.(true);
          if (this.onAwardXp) {
            this.onAwardXp(
              0,
              this.fireArrowsActive
                ? '🔥 FIRE ARROWS LIT (+22 INCENDIARY BURN & EMBER SPLASH) — PRESS [V] FOR REGULAR ARROWS'
                : '🏹 REGULAR BODKIN ARROWS EQUIPPED (CLEAN FLIGHT • NO FIRE FLASH) — PRESS [V] FOR FIRE ARROWS'
            );
          }
        } else if (!this.activeVehicle) {
          if (cur && cur.def && cur.def.type === 'melee_sword') {
            this.toggleSwordSlung?.();
          } else if (this.isAds && cur && cur.def) {
            const zLevels = Array.isArray(cur.def.zoomLevels) ? cur.def.zoomLevels : null;
            const hasVarZoom = Boolean(zLevels && zLevels.length > 1);
            const hasCanted = Boolean(cur.def.hasCantedSight);
            if (hasVarZoom || hasCanted) {
              if (this.useCantedSight) {
                this.useCantedSight = false;
                this.opticZoomIndex = 0;
              } else if (hasVarZoom && (this.opticZoomIndex || 0) < zLevels.length - 1) {
                this.opticZoomIndex = (this.opticZoomIndex || 0) + 1;
              } else if (hasCanted) {
                this.useCantedSight = true;
              } else {
                this.opticZoomIndex = 0;
              }
              sound.playEmptyClick?.();
            } else {
              this.startWeaponInspect();
            }
          } else {
            this.startWeaponInspect();
          }
        }
      }
      if (!hasAnyModifier(e) && e.code === 'KeyX' && !e.repeat) {
        const cur = !this.activeVehicle ? this.currentWeapon() : null;
        if (this.parachuting && typeof this.cutParachute === 'function') {
          this.cutParachute();
        } else if (this.activeVehicle && typeof this.activateVehicleCountermeasure === 'function') {
          this.activateVehicleCountermeasure();
        } else if (!this.activeVehicle && cur && cur.def && cur.def.type === 'melee_sword') {
          this.toggleSwordSlung?.();
        } else if (!this.activeVehicle) {
          const zeros = PLAYER.ZEROING_OPTIONS;
          const curIdx = zeros.indexOf(this.zeroDistance);
          const idx = curIdx >= 0 ? (curIdx + 1) % zeros.length : 0;
          this.zeroDistance = zeros[idx];
          this.isExactLrfZero = false;
        }
      }
      if (!hasAnyModifier(e) && !e.shiftKey && e.code === 'Backslash' && !e.repeat && !this.activeVehicle) {
        this.toggleQuickBinoculars?.();
      }
      if (!hasAnyModifier(e) && !e.shiftKey && e.code === 'KeyB' && !this.activeVehicle) {
        this.buildBlueprintIndex = (this.buildBlueprintIndex + 1) % this.buildBlueprints.length;
      }
      // [5] Place Squad Leader Rally Point (mobile squad spawn)
      if (!hasAnyModifier(e) && !e.shiftKey && e.code === 'Digit5' && !this.activeVehicle) {
        this.placeRallyPoint();
      }
      // [6] Place Insertion Beacon (Recon class only)
      if (!hasAnyModifier(e) && !e.shiftKey && e.code === 'Digit6' && !this.activeVehicle) {
        this.placeInsertionBeacon();
      }
      // [7] Deploy Squad Field Ammo & Kit Stash (resupplies squad + allows field role changing!)
      if (!hasAnyModifier(e) && !e.shiftKey && e.code === 'Digit7' && !e.repeat && !this.activeVehicle) {
        this.deployFieldAmmoStash();
      }
      // [8] Construct Fortified Command Bunker / 2-Story Tactical House ($1,000)
      if (!hasAnyModifier(e) && !e.shiftKey && e.code === 'Digit8' && !e.repeat && !this.activeVehicle) {
        this.buildPaidHouseOrBunker('AUTO');
      }
      // [0] Request Light Recon Motorcycle ($150) • [Shift+0] Request 4x4 Tactical Quad ATV ($150) — Any Class!
      if (!hasAnyModifier(e) && e.code === 'Digit0' && !e.repeat && !this.activeVehicle) {
        this.requestReconBikeDelivery?.(e.shiftKey ? 'atv' : 'bike');
      }
      // [9] Armor Crew Requisition (Tank/IFV/AA 10m ahead) OR Pilot Aircraft Sortie ([Shift+9] cycles vehicle/role)
      if (!hasAnyModifier(e) && e.code === 'Digit9' && !e.repeat) {
        if (this.role === 'armor' && !(this.activeVehicle && this.activeVehicle.isAircraft)) {
          if (e.shiftKey) {
            this.cycleArmorOrderType?.();
          } else {
            this.requestArmorDelivery?.();
          }
        } else if (e.shiftKey) {
          if (typeof this.cycleAircraftRole === 'function') {
            this.cycleAircraftRole();
          }
        } else if (typeof this.launchAircraftSortie === 'function') {
          this.launchAircraftSortie();
        }
      }
      // [L] Open Unified Role Selection, Weapon Selection, Gunsmith Workbench & Aircraft/Armor Customization Bay!
      if (!hasAnyModifier(e) && e.code === 'KeyL' && !e.shiftKey && !e.repeat) {
        if (window.game && window.game.ui && typeof window.game.ui.openLoadoutAndGunsmithModal === 'function') {
          if (this.activeVehicle || this.role === 'pilot' || this.role === 'armor') {
            window.game.ui._gunsmithActiveTab = 'vehicles';
          }
          window.game.ui.openLoadoutAndGunsmithModal();
        } else if (!this.activeVehicle) {
          this.cycleFieldRole();
        }
      }
      // [F5]–[F11] OR [Shift+1..7] Direct Squad Role / Kit Swap when near an Ammo & Kit Stash / Base
      if (!this.activeVehicle && !e.repeat) {
        const roleIdx = resolveFieldRoleShortcutIndex(e);
        if (roleIdx >= 0) {
          e.preventDefault();
          const eraKey = this.world?.era || 'modern';
          const roleList =
            ERA_ROLES[eraKey] || getEraRoles(eraKey, this.team) || ERA_ROLES.modern;
          const roleId = roleList[roleIdx]?.id || getRoleByHotkey(e.code, eraKey, this.team);
          if (roleId) {
            this.changeRoleInField(roleId, true);
          }
        }
      }
      // [U] Commander UAV Scan (reveals all enemies & armor in 3D + minimap + AI datalink)
      if (!hasAnyModifier(e) && e.code === 'KeyU') {
        this.activateUAV();
      }
      // [J] Commander Airstrike (Shift+J cycles pattern; J calls strike at crosshair anywhere on map)
      if (!hasAnyModifier(e) && e.code === 'KeyJ') {
        if (e.shiftKey) {
          this.cycleAirstrikePattern();
        } else {
          this.callAirstrike();
        }
      }
      // [Y] Commo Rose / Quick Chat Wheel (BattleBit-style)
      if (!hasAnyModifier(e) && e.code === 'KeyY' && !e.repeat && !this.activeVehicle) {
        this.commoRoseActive = true;
        this.commoCursorX = 0;
        this.commoCursorY = 0;
        this.commoSelectedId = null;
        events.emit('commo:open', {});
        if (this.onCommoRoseOpen && !this.onCommoRoseOpen._isEventsBridge) {
          this.onCommoRoseOpen();
        }
      }
      if (!hasAnyModifier(e) && e.code === 'KeyT' && !e.repeat && !this.activeVehicle) {
        const nearTreb = this.vehicleManager?.findNearestTrebuchet?.(this.pos, 75.0, this.team);
        if (this.world?.era === 'medieval' || nearTreb) {
          this.callMenToSetupTrebuchet(nearTreb);
        } else {
          this.useHammer(false);
        }
      }
      if (!hasAnyModifier(e) && e.code === 'KeyZ' && !this.activeVehicle) {
        this.prone = !this.prone;
        if (this.prone) this.crouching = false;
      }
      if ((!hasAnyModifier(e) && e.code === 'KeyC') || shouldControlLeftCrouch(e)) {
        if (this.parachuting && e.code === 'KeyC' && typeof this.cutParachute === 'function') {
          this.cutParachute();
        } else if (this.activeVehicle && e.code === 'KeyC' && !e.repeat) {
          if (typeof this.cycleVehicleCameraMode === 'function') {
            this.cycleVehicleCameraMode();
          } else {
            this.thirdPersonVehicle = !this.thirdPersonVehicle;
          }
        } else if (!this.activeVehicle) {
          this.crouching = !this.crouching;
          if (this.crouching) this.prone = false;
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (shouldClearStuckKeysOnKeyup(e.code, isMacPlatform())) {
        for (const k of Object.keys(this.keys)) {
          this.keys[k] = false;
        }
      }
      // Close Commo Rose when [Y] released and dispatch selected radial command
      if (e.code === 'KeyY' && this.commoRoseActive) {
        this.commoRoseActive = false;
        if (this.commoSelectedId) {
          this.sendCommoCommand(this.commoSelectedId);
          this.commoSelectedId = null;
        }
        events.emit('commo:close', {});
        if (this.onCommoRoseClose && !this.onCommoRoseClose._isEventsBridge) {
          this.onCommoRoseClose();
        }
      }
      if (e.code === 'KeyF') {
        // Quick-Tap [F] (< 0.28s): Auto-Loot 50% Pocket Cash, Magazines, Loose Bullets, Dressings, Grenades & Armor Plates without opening modal!
        if (
          !this._fUsedForFriendlyAction &&
          !this._enemyLootHoldTriggered &&
          this._pendingEnemyLootPack &&
          !this.isPopoutModalOpen() &&
          typeof this.lootAllFromPack === 'function'
        ) {
          this.lootAllFromPack(this._pendingEnemyLootPack, false, true);
        }
        this.keyFHoldTime = 0;
        this._pendingEnemyLootPack = null;
        this._enemyLootHoldTriggered = false;
        this._justOpenedLootByHold = false;
        this._fUsedForFriendlyAction = false;
      }
      if (e.code === 'KeyR') {
        this.keyRHoldTime = 0;
      }
      if (e.code === 'Space') {
        this._spaceJumpConsumed = false;
      }
      if (
        e.code === 'KeyQ' &&
        !this.activeVehicle &&
        !this.isAds &&
        !this.dead &&
        !this.downed &&
        this._keyQDownAt &&
        performance.now() - this._keyQDownAt < 210
      ) {
        this._keyQDownAt = 0;
        this.triggerTacticalPing?.();
      }
    });

    window.addEventListener('blur', () => {
      for (const k of Object.keys(this.keys)) {
        this.keys[k] = false;
      }
      this.isFiring = false;
    });

    window.addEventListener('wheel', (e) => {
      if (this.dead || this.downed || this.isModalOpen(true)) return;
      if (this.activeVehicle && typeof this.switchVehicleWeaponSlot === 'function') {
        if (this.activeVehicle.isAircraft && this.activeVehicle.aircraftRole === 'gunship') {
          // Mouse Scroll Wheel in AC-130 = Continuous Optical Camera Zoom (1.1x Wide <-> 8.0x Telephoto FLIR!)
          // (Aircraft Altitude & Orbit Circle Size are controlled via [Shift / Z], [↑ / ↓], or [+ / -]!)
          this.adjustGunshipSensorZoom?.(e.deltaY < 0 ? 1 : -1);
          return;
        }
        if (this.activeVehicle.type === 'tank' || this.activeVehicle.type === 'apc') {
          const curSlot = this.activeVehicle.activeWeaponSlot || 0;
          const nextSlot = e.deltaY > 0 ? (curSlot + 1) % 3 : (curSlot + 2) % 3;
          this.switchVehicleWeaponSlot(nextSlot);
        }
        return;
      }
      const cur = this.currentWeapon();
      if (this.isAds && cur && cur.def) {
        const zLevels = Array.isArray(cur.def.zoomLevels) ? cur.def.zoomLevels : null;
        if (zLevels && zLevels.length > 1 && !this.useCantedSight) {
          const maxIdx = zLevels.length - 1;
          const curIdx = Math.min(this.opticZoomIndex || 0, maxIdx);
          const nextIdx = e.deltaY < 0 ? Math.min(maxIdx, curIdx + 1) : Math.max(0, curIdx - 1);
          if (nextIdx !== curIdx) {
            this.opticZoomIndex = nextIdx;
            sound.playEmptyClick?.();
          }
        } else if (cur.def.hasCantedSight) {
          const nextCanted = e.deltaY > 0;
          if (this.useCantedSight !== nextCanted) {
            this.useCantedSight = nextCanted;
            sound.playEmptyClick?.();
          }
        }
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (performance.now() - (this._lastTouchEventAt || 0) < 650) return;
      if (this.dead) return;
      if (this.isModalOpen(true)) {
        this._lastMouseClientX = e.clientX;
        this._lastMouseClientY = e.clientY;
        return;
      }
      if (this.commoRoseActive) {
        this.commoCursorX = THREE.MathUtils.clamp((this.commoCursorX || 0) + e.movementX, -140, 140);
        this.commoCursorY = THREE.MathUtils.clamp((this.commoCursorY || 0) + e.movementY, -140, 140);
        if (Math.hypot(this.commoCursorX, this.commoCursorY) > 20) {
          const deg = ((Math.atan2(this.commoCursorY, this.commoCursorX) * 180) / Math.PI + 90 + 360) % 360;
          const idx = Math.round(deg / 45) % 8;
          const ids = [
            'go_go_go',
            'contact_east',
            'need_ammo',
            'negative',
            'hold_position',
            'enemy_vehicle',
            'need_medic',
            'affirmative'
          ];
          const nextSelected = ids[idx];
          if (this.commoSelectedId !== nextSelected) {
            this.commoSelectedId = nextSelected;
            const btns = document.querySelectorAll('.commo-rose-btn');
            btns.forEach((b) => {
              const active = b.dataset.cmd === this.commoSelectedId;
              b.style.background = active ? 'rgba(46, 204, 113, 0.85)' : 'rgba(44, 62, 80, 0.85)';
              b.style.borderColor = active ? '#2ecc71' : 'rgba(255,255,255,0.18)';
            });
          }
        }
        return;
      }

      let rawDx = e.movementX || 0;
      let rawDy = e.movementY || 0;
      if (document.pointerLockElement !== document.body) {
        if (rawDx === 0 && rawDy === 0 && typeof this._lastMouseClientX === 'number') {
          rawDx = e.clientX - this._lastMouseClientX;
          rawDy = e.clientY - this._lastMouseClientY;
        }
        this._lastMouseClientX = e.clientX;
        this._lastMouseClientY = e.clientY;
        if (Math.abs(rawDx) > 85 || Math.abs(rawDy) > 85) {
          return;
        }
      } else {
        this._lastMouseClientX = e.clientX;
        this._lastMouseClientY = e.clientY;
      }

      this.applyLookDelta(rawDx, rawDy, false, Boolean(e.altKey));
    });

    window.addEventListener('mousedown', (e) => {
      if (performance.now() - (this._lastTouchEventAt || 0) < 650) return;
      this._modalCacheTime = 0;
      if (this.dead) return;
      const clickedModalOrUi =
        e.target &&
        typeof e.target.closest === 'function' &&
        e.target.closest(
          '#gunsmith-modal, #command-modal, #mp-invite-modal, #multiplayer-modal, #settings-modal, #controls-overlay, #deploy-screen, #victory-screen, button, input, select, label, .hud-clickable'
        );

      // Never steal pointer lock or fire weapon when clicking inside any UI modal or button!
      if (clickedModalOrUi) {
        this.isFiring = false;
        return;
      }

      // If a pop-out modal (Loot / Backpack / Gunsmith / Map / Settings) is open and the player clicks
      // outside the modal onto the 3D viewport, close the modal and restore Pointer Lock cleanly without firing!
      if (this.isPopoutModalOpen()) {
        this.isFiring = false;
        this._suppressFireUntil = performance.now() + 200;
        if (window.game?.ui) {
          const gsEl = document.getElementById('gunsmith-modal');
          if (gsEl && !gsEl.classList.contains('hidden')) {
            window.game.ui.toggleGunsmithModal(false);
            this._modalCacheTime = 0;
          } else {
            this._closePopoutModals();
          }
        }
        try {
          window.focus();
          const p = document.body.requestPointerLock();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch (_) {}
        return;
      }

      if (this.isModalOpen()) {
        this.isFiring = false;
        return;
      }

      if (document.pointerLockElement !== document.body) {
        try {
          window.focus();
          const p = document.body.requestPointerLock();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch (_) {}
      }
      if (this.downed) return;
      if (performance.now() < (this._suppressFireUntil || 0)) {
        this.isFiring = false;
        return;
      }

      const isMacCtrlClick =
        isMacPlatform() && e.button === 0 && e.ctrlKey && !e.metaKey && !e.altKey;
      if (e.button === 1) {
        e.preventDefault();
        this.triggerTacticalPing();
        return;
      }
      if (e.button === 2 || isMacCtrlClick) {
        e.preventDefault();
        this.handleSecondaryAimDown();
      } else if (e.button === 0) {
        this.isFiring = true;
        if (!this.activeVehicle) {
          this.tryFireSingle();
        }
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0 && !this._rightMouseHeld) {
        this.isFiring = false;
      }
      if (e.button === 2 || (this._rightMouseHeld && e.button === 0)) {
        this.handleSecondaryAimUp();
      }
    });

    window.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      // macOS Trackpad Two-Finger Tap Fallback:
      // In Safari/Chrome on MacBooks with "Tap to click", a two-finger tap can synthesize `contextmenu`
      // without holding `mousedown(button: 2)` (or before Pointer Lock is engaged). Toggle ADS Scope cleanly!
      if (this.dead || this.downed || this.isModalOpen()) return;
      const clickedUi =
        e.target &&
        typeof e.target.closest === 'function' &&
        e.target.closest(
          '#gunsmith-modal, #command-modal, #mp-invite-modal, #multiplayer-modal, #settings-modal, #controls-overlay, #deploy-screen, #victory-screen, button, input, select, label, .hud-clickable'
        );
      if (clickedUi) return;
      if (document.pointerLockElement !== document.body) {
        try {
          window.focus?.();
          const p = document.body.requestPointerLock?.();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch (_) {}
      }
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - (this._lastRightMouseDownAt || 0) > 220) {
        this.toggleAdsScope();
      }
    });
  }

  /**
   * Unified optical-FOV-scaled camera look delta used by BOTH desktop Pointer Lock mouse
   * and PUBG/CoD Mobile Dual-Thumb Free-Look & Fire+Drag-Aim touch gestures!
   */
  applyLookDelta(rawDx = 0, rawDy = 0, isTouch = false, altKey = false) {
    if (this.dead) return;
    if (!Number.isFinite(rawDx) || !Number.isFinite(rawDy)) return;

    const baseSens = this.isAds ? PLAYER.SENSITIVITY_ADS : PLAYER.SENSITIVITY_HIP;
    const curFov = this.camera?.fov || 75;
    const opticZoomScale =
      curFov < 65
        ? THREE.MathUtils.clamp(
            Math.tan((curFov * Math.PI) / 360) / Math.tan((55 * Math.PI) / 360),
            0.02,
            1.0
          )
        : 1.0;
    const sens = baseSens * opticZoomScale;
    const dx = rawDx * sens;
    const dy = rawDy * sens;
    const av = this.activeVehicle;
    const inDecoupledAirLook = Boolean(
      av &&
        av.isAircraft &&
        av.aircraftRole !== 'gunship' &&
        (this.keys['AltLeft'] || this.keys['AltRight'] || altKey || av.levelAutopilot)
    );
    const inAerobaticPlane = Boolean(
      av &&
        av.isAircraft &&
        this.aircraftCollisionAvoidance === false &&
        av.aircraftRole !== 'gunship' &&
        av.aircraftRole !== 'b2_spirit'
    );

    if (inDecoupledAirLook) {
      av.freeLookYaw = THREE.MathUtils.clamp((av.freeLookYaw || 0) - dx, -2.35, 2.35);
      av.freeLookPitch = THREE.MathUtils.clamp((av.freeLookPitch || 0) - dy, -1.48, 1.35);
    } else if (inAerobaticPlane) {
      const loopInverted = Math.cos(av.pitch || 0) < -0.05;
      const rollInverted = Math.cos(av.roll || 0) < -0.2;
      const yawSign = (loopInverted ? -1 : 1) * (rollInverted ? -1 : 1);
      const pitchSign = rollInverted ? -1 : 1;
      this.yaw -= dx * yawSign;
      this.pitch -= dy * pitchSign;
      while (this.pitch > Math.PI) this.pitch -= Math.PI * 2;
      while (this.pitch <= -Math.PI) this.pitch += Math.PI * 2;
    } else {
      const maxPitch =
        av && av.isAircraft && av.aircraftRole !== 'gunship'
          ? 1.08
          : Math.PI / 2 - PLAYER.MAX_PITCH_OFFSET;
      const inertiaShare = isTouch
        ? curFov < 20
          ? 0.45
          : 0.18
        : !av && curFov < 16
        ? 0.78
        : !av && curFov < 42
        ? 0.58
        : !av
        ? 0.32
        : 0.0;
      const immDx = dx * (1 - inertiaShare);
      const immDy = dy * (1 - inertiaShare);
      this._pendingLookYaw = (this._pendingLookYaw || 0) - dx * inertiaShare;
      this._pendingLookPitch = (this._pendingLookPitch || 0) - dy * inertiaShare;
      this.yaw -= immDx;
      this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch - immDy));
    }

    const swayCur = !av && typeof this.currentWeapon === 'function' ? this.currentWeapon() : null;
    const swayLedge = !av && typeof this.isRestingOnCoverLedge === 'function' ? this.isRestingOnCoverLedge() : false;
    const swayBipod = Boolean(swayCur?.def?.hasBipod && (this.prone || this.crouching || swayLedge));
    const curCamFov = this.camera?.fov || 75;
    const highMagStandingPenalty =
      this.isAds && !this.isHoldingBreath && !swayBipod && !this.prone
        ? curCamFov <= 3.2
          ? 2.45
          : curCamFov <= 4.8
          ? 1.85
          : curCamFov <= 7.8
          ? 1.35
          : 1.0
        : 1.0;
    const stanceSwayMult =
      (swayBipod
        ? PLAYER.SWAY_SCALE_BIPOD || 0.12
        : this.prone
        ? PLAYER.SWAY_SCALE_PRONE || 0.28
        : this.crouching
        ? PLAYER.SWAY_SCALE_CROUCH || 0.58
        : swayLedge
        ? 0.68
        : 1.0) * highMagStandingPenalty;
    const swayLim = PLAYER.SWAY_LIMIT * stanceSwayMult;
    this.swayX = THREE.MathUtils.clamp(this.swayX - dx * PLAYER.SWAY_MULT * stanceSwayMult, -swayLim, swayLim);
    this.swayY = THREE.MathUtils.clamp(this.swayY + dy * PLAYER.SWAY_MULT * stanceSwayMult, -swayLim, swayLim);
    if (Math.hypot(rawDx, rawDy) >= 4) {
      if (Math.abs(rawDy) >= Math.abs(rawDx) * 1.15) {
        this.meleeGuardDir = rawDy < 0 ? 'UP' : 'DOWN';
      } else {
        this.meleeGuardDir = rawDx < 0 ? 'LEFT' : 'RIGHT';
      }
      this._meleeDirInputTime = performance.now();
    }
  }

  getActiveOpticType() {
    const cur = this.currentWeapon();
    if (!cur || !cur.def.opticType) return null;
    if (this.useCantedSight && cur.def.hasCantedSight) {
      return 'reddot';
    }
    return cur.def.opticType;
  }

  addShake(amount) {
    this.shakeTrauma = Math.min(1.0, this.shakeTrauma + amount);
  }

  resetVisionSensors() {
    this.sensorMode = 'OFF';
    this.nvgActive = false;
    if (this.ccipMarkerMesh) this.ccipMarkerMesh.visible = false;
    if (this._gunshipOrbitVisGroup) this._gunshipOrbitVisGroup.visible = false;
  }

  clearActiveVehicleOnReset(reason = null) {
    if (this.activeVehicle) {
      const v = this.activeVehicle;
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
      v.driver = null;
      this.activeVehicle = null;
      this.aircraftLockTarget = null;
      this.aircraftLockProgress = 0;
      if (reason) {
        events.emit('player:exited-vehicle', { vehicle: v, reason });
      }
    }
    this.resetVisionSensors();
    this.deathCamPostTimer = 0;
    this._deathCamBlend = 0;
    this.clearDeathCamVisuals?.();
    this.resetDeathCamFov();
  }

  deploy(team, role, spawnPointVec) {
    this.clearActiveVehicleOnReset('redeploy');
    this.team = team;
    const era = this.world?.era || 'modern';
    role = resolveRoleForEra(role, era, this.team);
    this.equipLoadout(role);
    const vestDef = this.getEquippedItem('vest');
    const backpackDef = this.getEquippedItem('backpack');
    const classTrait = CLASS_TRAITS[this.role] || {};
    const baseVestArmor = vestDef ? vestDef.maxArmor : PLAYER.MAX_ARMOR;
    const vestDelta = baseVestArmor - PLAYER.MAX_ARMOR;
    this.maxArmor = Math.max(15, (classTrait.maxArmor ?? PLAYER.MAX_ARMOR) + vestDelta);
    this.armorAbsorbRatio = classTrait.armorAbsorbRatio ?? (vestDef ? vestDef.absorbRatio : PLAYER.ARMOR_ABSORB_RATIO);
    this.classMoveSpeedMult = classTrait.moveSpeedMult || 1.0;
    this.canFlyAircraft = Boolean(classTrait.canFlyAircraft);
    const safeSpawn = this.world.findSafeSpawnPoint(spawnPointVec.x, spawnPointVec.z);
    this.pos.copy(safeSpawn);
    this._smoothFootY = safeSpawn.y;
    this.vel.set(0, 0, 0);
    const isEastSpawn =
      team === 'RU' || (era === 'jurassic' && team === 'US' && this.subFaction === 'RU' && safeSpawn.x > 400);
    this.yaw = isEastSpawn ? Math.PI / 2 : -Math.PI / 2;
    this.pitch = 0;
    this.hp = PLAYER.HP;
    this.armor = this.maxArmor;
    this.bleeding = false;
    this.beyondRescue = false;
    this.armFractured = false;
    this.legFractured = false;
    this.limbHealth = {
      head: 100,
      thorax: 100,
      leftArm: 100,
      rightArm: 100,
      leftLeg: 100,
      rightLeg: 100
    };
    this.bandages =
      (this.role === 'medic' ? 9 : 2) +
      (vestDef ? vestDef.bonusBandages : 0) +
      (backpackDef ? backpackDef.bonusBandages : 0);
    this.grenades = Math.max(
      1,
      2 +
        (classTrait.bonusGrenades || 0) +
        (vestDef ? vestDef.bonusGrenades : 0) +
        (backpackDef ? backpackDef.bonusGrenades : 0)
    );
    this.bandageProgress = 0;
    this.reviveProgress = 0;
    this.slowReloading = false;
    this.magPackProgress = 0;
    this.crouching = false;
    this.prone = false;
    this.downed = false;
    this.downedTimer = 0;
    this.giveUpProgress = 0;
    this.dead = false;
    this.isGrounded = true;
    this.parachuting = false;
    this.parachuteCut = false;
    this.parachuteFSM?.send(PLAYER_PARACHUTE_EVENTS.RESET_DEPLOY);
    if (this.parachuteMesh) {
      this.parachuteMesh.visible = false;
    }
    this.viewModelGroup.visible = true;
    this.syncCameraTransform();

    // In Medieval Era, ensure a friendly Counterweight Siege Trebuchet is positioned right in front
    // of the player's deployment point (~11.5m ahead) so they can immediately see & operate it!
    if (era === 'medieval' && this.vehicleManager && Array.isArray(this.vehicleManager.vehicles)) {
      const fwdX = -Math.sin(this.yaw);
      const fwdZ = -Math.cos(this.yaw);
      const rightX = Math.cos(this.yaw);
      const rightZ = -Math.sin(this.yaw);
      const trebX = this.pos.x + fwdX * 11.5 + rightX * 3.2;
      const trebZ = this.pos.z + fwdZ * 11.5 + rightZ * 3.2;
      const safeTreb = this.world?.pushOutOfBuildingFootprint
        ? this.world.pushOutOfBuildingFootprint(trebX, trebZ, 4.2)
        : { x: trebX, z: trebZ };
      const trebY = this.world ? this.world.getGroundHeightAt(safeTreb.x, safeTreb.z) : this.pos.y;
      const nearTreb = this.vehicleManager.findNearestTrebuchet(this.pos, 32.0, this.team);
      if (!nearTreb) {
        const teamTreb = this.vehicleManager.vehicles.find(
          (v) => v && !v.dead && v.type === 'trebuchet' && v.team === this.team && !v.driver
        );
        if (teamTreb) {
          teamTreb.pos.set(safeTreb.x, trebY, safeTreb.z);
          teamTreb.yaw = this.yaw;
          teamTreb.turretYaw = this.yaw;
          if (teamTreb.mesh) {
            teamTreb.mesh.position.copy(teamTreb.pos);
            teamTreb.mesh.rotation.y = this.yaw;
          }
        }
      }
    }

    // In Medieval Era, deploying as 'mounted_knight' ("Knight on Horse with Bow") automatically
    // mounts the player atop a fresh Armored Warhorse with a Royal Yew Longbow!
    if (
      role === 'mounted_knight' &&
      this.vehicleManager &&
      typeof this.vehicleManager.spawnOrGetPersonalMount === 'function'
    ) {
      const horse = this.vehicleManager.spawnOrGetPersonalMount(
        this.team,
        this.pos,
        this.yaw,
        'warhorse'
      );
      if (horse && typeof this.enterVehicle === 'function') {
        this.enterVehicle(horse);
      }
    }

    try {
      const p = document.body.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (_) {
      // Ignore pointer lock rejection in automated webviews
    }
  }

  isRestingOnCoverLedge() {
    if (this.activeVehicle || !this.isGrounded || !this.world || !this.world.voxels) {
      return false;
    }
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (this._ledgeCacheAt && now - this._ledgeCacheAt < 120) {
      return Boolean(this._ledgeCacheVal);
    }
    this._ledgeCacheAt = now;
    const fwdX = -Math.sin(this.yaw || 0);
    const fwdZ = -Math.cos(this.yaw || 0);
    const probeX = this.pos.x + fwdX * 0.82;
    const probeZ = this.pos.z + fwdZ * 0.82;
    const braceY = this.pos.y + (this.prone ? 0.25 : this.crouching ? 0.68 : 1.02);
    const clearY = this.pos.y + (this.prone ? 0.62 : this.crouching ? 1.18 : 1.66);
    const gBrace = this.world.worldToGrid(probeX, braceY, probeZ);
    const gClear = this.world.worldToGrid(probeX, clearY, probeZ);
    const hasLowCover = this.world.hasVoxel
      ? this.world.hasVoxel(gBrace.gx, gBrace.gy, gBrace.gz)
      : this.world.voxels.has(this.world.key(gBrace.gx, gBrace.gy, gBrace.gz));
    const headBlocked = this.world.hasVoxel
      ? this.world.hasVoxel(gClear.gx, gClear.gy, gClear.gz)
      : this.world.voxels.has(this.world.key(gClear.gx, gClear.gy, gClear.gz));
    this._ledgeCacheVal = Boolean(hasLowCover && !headBlocked);
    return this._ledgeCacheVal;
  }

  syncCameraTransform() {
    const targetEyeHeight = this.downed
      ? PLAYER.EYE_HEIGHT_DOWNED
      : this.prone
      ? PLAYER.EYE_HEIGHT_PRONE
      : this.crouching
      ? PLAYER.EYE_HEIGHT_CROUCH
      : PLAYER.EYE_HEIGHT_STAND;
    if (typeof this._smoothEyeHeight !== 'number' || !Number.isFinite(this._smoothEyeHeight)) {
      this._smoothEyeHeight = targetEyeHeight;
    } else {
      const dtCam = this._lastFrameDt || 0.016;
      const alphaEye = 1 - Math.exp(-dtCam * 16);
      this._smoothEyeHeight += (targetEyeHeight - this._smoothEyeHeight) * alphaEye;
      if (Math.abs(targetEyeHeight - this._smoothEyeHeight) < 0.0001) {
        this._smoothEyeHeight = targetEyeHeight;
      }
    }
    const eyeHeight = this._smoothEyeHeight;
    // Smooth vertical foot-step inertia so climbing 1.25m stairs/curbs glides cleanly instead of 1-frame snapping!
    if (
      typeof this._smoothFootY !== 'number' ||
      !Number.isFinite(this._smoothFootY) ||
      !this.isGrounded ||
      this.onLadder ||
      Math.abs(this.pos.y - this._smoothFootY) > 2.4
    ) {
      this._smoothFootY = this.pos.y;
    } else {
      const dtCam = this._lastFrameDt || 0.016;
      const alphaFoot = 1 - Math.exp(-dtCam * 15);
      this._smoothFootY += (this.pos.y - this._smoothFootY) * alphaFoot;
      if (Math.abs(this.pos.y - this._smoothFootY) < 0.0001) {
        this._smoothFootY = this.pos.y;
      }
    }
    const camFootY = this._smoothFootY;
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const leanOffset = right.multiplyScalar(this.leanAmount * PLAYER.LEAN_OFFSET);

    const headPivot = new THREE.Vector3(
      this.pos.x,
      camFootY + eyeHeight + (this.lastBobY || 0),
      this.pos.z
    );
    const desiredCamPos = new THREE.Vector3(
      this.pos.x + leanOffset.x,
      camFootY + eyeHeight + (this.lastBobY || 0),
      this.pos.z + leanOffset.z
    );
    if (typeof this.resolveCameraWallCollision === 'function') {
      const safeCam = this.resolveCameraWallCollision(headPivot, desiredCamPos, 0.34);
      this.camera.position.copy(safeCam);
    } else {
      this.camera.position.copy(desiredCamPos);
    }

    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    euler.y = this.yaw + (this.lastShakeYaw || 0);
    euler.x = Math.min(
      Math.PI / 2 - 0.05,
      this.pitch + this.recoilOffsetPitch + (this.lastShakePitch || 0)
    );
    euler.z = this.downed ? PLAYER.EYE_HEIGHT_DOWNED : -this.leanAmount * PLAYER.LEAN_TILT;
    this.camera.quaternion.setFromEuler(euler);
    this.camera.updateMatrixWorld();
  }

  update(dt) {
    if (typeof this.updateBallisticBullets === 'function') {
      this.updateBallisticBullets(dt);
    }
    if (this.dead) return;

    if (this.activePing) {
      this.activePing.timer -= dt;
      if (this.activePing.timer <= 0) {
        this.activePing = null;
      }
    }

    // Handle Downed / Incapacitated State (awaiting friendly Medic/Human revive or Hold [Space] to Give Up)
    if (this.downed) {
      if ((this.beingDraggedByAllyTimer || 0) > 0) {
        this.beingDraggedByAllyTimer = Math.max(0, this.beingDraggedByAllyTimer - dt);
      } else {
        this.downedTimer -= dt;
      }
      if (this.keys['Space']) {
        this.giveUpProgress += dt / PLAYER.GIVE_UP_RATE;
      } else {
        this.giveUpProgress = Math.max(0, this.giveUpProgress - dt * 2);
      }
      if (this.deathCamEnabled && this.lastDeathReport?.hasKillerOrigin) {
        this.updateDeathCamCamera(dt, false);
      } else {
        this._deathCamBlend = 0;
        this.clearDeathCamVisuals?.();
        this.resetDeathCamFov();
        this.syncCameraTransform();
      }
      if (this.downedTimer <= 0 || this.giveUpProgress >= 1) {
        this.finalizeDeath();
      }
      return;
    }

    if (this.ammoStashCooldown > 0) {
      this.ammoStashCooldown = Math.max(0, this.ammoStashCooldown - dt);
    }

    if (this.activeVehicle) {
      this._pendingLookYaw = 0;
      this._pendingLookPitch = 0;
      this.updateVehicleControl(dt);
      this.updateRallyPoint(dt);
      this.updateUAV(dt);
      return;
    }

    this._lastFrameDt = dt;
    // Smoothly integrate sub-pixel angular look inertia every render frame so high-zoom 9x–40x scopes glide continuously!
    if (this._pendingLookYaw || this._pendingLookPitch) {
      const curLookFov = this.camera?.fov || 75;
      const lookSharpness = curLookFov < 6 ? 28 : curLookFov < 16 ? 34 : curLookFov < 40 ? 44 : 56;
      const stepFrac = 1 - Math.exp(-Math.min(0.1, Math.max(0.0005, dt)) * lookSharpness);
      const dYaw = (this._pendingLookYaw || 0) * stepFrac;
      const dPitch = (this._pendingLookPitch || 0) * stepFrac;
      this._pendingLookYaw -= dYaw;
      this._pendingLookPitch -= dPitch;
      if (Math.abs(this._pendingLookYaw) < 1e-8) this._pendingLookYaw = 0;
      if (Math.abs(this._pendingLookPitch) < 1e-8) this._pendingLookPitch = 0;
      const maxPitch = Math.PI / 2 - PLAYER.MAX_PITCH_OFFSET;
      this.yaw += dYaw;
      this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch + dPitch));
    }

    // Bleeding & Bandaging [Hold H]
    if (this.bleeding) {
      this.bleedTickTimer += dt;
      if (this.bleedTickTimer >= PLAYER.BLEED_TICK_INTERVAL) {
        this.bleedTickTimer = 0;
        this.takeDamage(PLAYER.BLEED_DAMAGE, 'BLEEDING', 'RU', 'BLEED', this.onKillEvent);
        if (this.dead || this.downed) return;
      }
    }

    if (this.medicHealTimer > 0) {
      this.medicHealTimer = Math.max(0, this.medicHealTimer - dt);
      if (this.medicHealTimer <= 0) {
        this.beingHealedByMedic = null;
      }
    }

    // Squad Cohesion Buff (Member within 38m of SL or Squad Objective), Recon UAV Stealth Mask & Passive Rig/Medic Regen
    let cohesionActive = false;
    let cohesionAnchor = '';
    if (this.commandRank === 'MEMBER' && this.botManager) {
      const slBot = this.botManager.squadLeaders?.[this.team]?.[this.squad];
      if (slBot && !slBot.dead && !slBot.downed && slBot.pos.distanceToSquared(this.pos) <= 38 * 38) {
        cohesionActive = true;
        cohesionAnchor = `SL ${slBot.name}`;
      } else {
        const sqOrd =
          this.botManager.squadOrders?.[this.team]?.[this.squad] ||
          this.botManager.commanderOrders?.[this.team];
        const fIdx =
          sqOrd && sqOrd.flagIndex >= 0
            ? sqOrd.flagIndex
            : slBot && typeof slBot.targetFlagIndex === 'number'
            ? slBot.targetFlagIndex
            : -1;
        const objFlag = fIdx >= 0 && this.world?.flags ? this.world.flags[fIdx] : null;
        if (objFlag && Math.hypot(this.pos.x - objFlag.pos.x, this.pos.z - objFlag.pos.z) <= 38) {
          cohesionActive = true;
          cohesionAnchor = `OBJ ${objFlag.id}`;
        }
      }
    }
    this.inSquadCohesion = cohesionActive;
    this.cohesionAnchorLabel = cohesionAnchor;
    this.isUavStealthMasked = Boolean(
      this.role === 'recon' && (this.crouching || this.prone) && !this.activeVehicle
    );

    this.outOfCombatTimer = (this.outOfCombatTimer || 0) + dt;
    const rigPassiveRegen =
      typeof this.passiveRegenBonus === 'number' && this.passiveRegenBonus > 0
        ? this.passiveRegenBonus
        : 0;
    const medicSelfTriage =
      this.role === 'medic' && this.outOfCombatTimer >= 4.5 ? 4.0 : 0;
    const totalPassiveRegen = rigPassiveRegen + medicSelfTriage;
    if (totalPassiveRegen > 0 && !this.bleeding && this.hp < PLAYER.MAX_HP) {
      this.hp = Math.min(PLAYER.MAX_HP, this.hp + totalPassiveRegen * dt);
    }

    // Real-life & Tactical Shooter Forward Base Defender Advantage (Entrenchment, Triage & Logistics Aura):
    // When the Player is defending inside a Friendly Captured Forward Base (`flag.owner === this.team`),
    // they gain:
    //   1) -25% to -40% incoming damage reduction (based on built Defense Stage 0-4) & +50% suppression resistance
    //   2) -30% weapon recoil & sway (resting rifle on prepared sandbags/parapets)
    //   3) 1.35x to 1.65x objective hold weight (enforcing the 3:1 attacker-to-defender rule)
    //   4) Passive FOB Medical Triage (+4 HP/s, +3 Armor/s) & Munitions Stockpile top-up (+15 loose rounds every 10s)
    let activeFriendlyFlag = null;
    let elevatedOverwatchSupplyFlag = null;
    if (this.world && Array.isArray(this.world.flags)) {
      for (const fl of this.world.flags) {
        if (fl.owner === this.team) {
          const dFl = Math.hypot(this.pos.x - fl.pos.x, this.pos.z - fl.pos.z);
          if (dFl <= (fl.radius || 28)) {
            activeFriendlyFlag = fl;
            break;
          }
          // Rooftop Sniper Overwatch Logistics: snipers perched on towers/rooftops within 95m of a friendly FOB
          // receive drone/rope munitions supply (+12 loose rounds every 10s) so rooftop slow-reloading stays supplied!
          if (!elevatedOverwatchSupplyFlag && dFl <= 95 && this.pos.y - fl.pos.y >= 4.0) {
            elevatedOverwatchSupplyFlag = fl;
          }
        }
      }
    }
    this.inFriendlyForwardBase = Boolean(activeFriendlyFlag);
    this.inRooftopOverwatchSupply = Boolean(!activeFriendlyFlag && elevatedOverwatchSupplyFlag);
    this.defendedFlagId = activeFriendlyFlag ? activeFriendlyFlag.id : null;
    this.defendedFlagStage = activeFriendlyFlag ? activeFriendlyFlag.defenseStage || 0 : 0;
    this.defendedFlagGarrisonSquad =
      activeFriendlyFlag && activeFriendlyFlag.garrisonSquad
        ? activeFriendlyFlag.garrisonSquad[this.team]
        : null;

    if ((activeFriendlyFlag || elevatedOverwatchSupplyFlag) && !this.downed && !this.dead) {
      if (activeFriendlyFlag) {
        if (!this.bleeding && this.hp < PLAYER.MAX_HP) {
          this.hp = Math.min(PLAYER.MAX_HP, this.hp + 4.0 * dt);
        }
        if (this.armor < (this.maxArmor || 50)) {
          this.armor = Math.min(this.maxArmor || 50, this.armor + 3.0 * dt);
        }
      }
      this._fobAmmoTimer = (this._fobAmmoTimer || 0) + dt;
      if (this._fobAmmoTimer >= 10.0) {
        this._fobAmmoTimer = 0;
        const prim = this.slots[0];
        if (prim && prim.def && prim.def.clipSize > 1) {
          const maxLoose = prim.maxLooseAmmo || 120;
          const grantRds = activeFriendlyFlag ? 15 : 12;
          if ((prim.looseAmmo || 0) < maxLoose) {
            prim.looseAmmo = Math.min(maxLoose, (prim.looseAmmo || 0) + grantRds);
          }
        }
      }
    } else {
      this._fobAmmoTimer = 0;
    }

    const hasFracture = Boolean(this.armFractured || this.legFractured);
    if (
      this.keys['KeyH'] &&
      (this.bleeding || hasFracture || this.hp < PLAYER.MAX_HP) &&
      this.bandages > 0
    ) {
      this.bandageProgress += dt / (this.role === 'medic' ? PLAYER.BANDAGE_DURATION_MEDIC : PLAYER.BANDAGE_DURATION_OTHER);
      if (this.bandageProgress >= 1) {
        this.bandageProgress = 0;
        this.bleeding = false;
        const splintedFracture = hasFracture;
        this.armFractured = false;
        this.legFractured = false;
        if (this.limbHealth) {
          for (const lk of Object.keys(this.limbHealth)) {
            this.limbHealth[lk] = Math.min(100, Math.max(55, (this.limbHealth[lk] ?? 100) + 45));
          }
        }
        this.bandages--;
        this.hp = Math.min(PLAYER.MAX_HP, this.hp + (this.role === 'medic' ? PLAYER.BANDAGE_HEAL_MEDIC : PLAYER.BANDAGE_HEAL_OTHER));
        if (this.onAwardXp) {
          this.onAwardXp(
            15,
            splintedFracture
              ? `🦴🏥 FRACTURE SPLINTED & BANDAGED (${Math.ceil(this.hp)}/100 HP)`
              : this.hp >= PLAYER.MAX_HP
              ? '🏥 INJURIES FULLY BANDAGED (100/100 MAX HP)'
              : `BLEEDING STOPPED & HEALED (${Math.ceil(this.hp)}/100 HP)`
          );
        }
      }
    } else {
      this.bandageProgress = 0;
    }

    // Separate [E] Drag & [F] Revive Downed Friendly Teammates (Both AI Squadmates AND Human MP Peers!):
    // - Press [E] to toggle DRAGGING a fallen soldier to cover
    // - Hold [F] to wrap a bandage and REVIVE them!
    if (this.draggedBot && (this.draggedBot.dead || !this.draggedBot.downed)) {
      this.draggedBot = null;
      this.isDraggingAlly = false;
    }
    if (this.draggedRemoteAlly && (this.draggedRemoteAlly.dead || !this.draggedRemoteAlly.downed)) {
      this.draggedRemoteAlly = null;
      this.isDraggingAlly = Boolean(this.draggedBot);
    }

    const netRef = (typeof window !== 'undefined' && window.game?.network) || this.network || null;
    let nearDownedRemoteAlly = null;
    if (this.draggedRemoteAlly) {
      nearDownedRemoteAlly = this.draggedRemoteAlly;
    } else if (netRef && typeof netRef.findNearestDownedRemoteAlly === 'function') {
      nearDownedRemoteAlly = netRef.findNearestDownedRemoteAlly(
        this.pos,
        this.team,
        DISTANCES.INTERACT_RANGE
      );
    }

    let nearDownedBot = null;
    if (this.draggedBot) {
      nearDownedBot = this.draggedBot;
    } else if (
      this.keys['KeyF'] &&
      this.reviveTargetBot &&
      this.reviveTargetBot.downed &&
      !this.reviveTargetBot.dead
    ) {
      nearDownedBot = this.reviveTargetBot;
    } else {
      nearDownedBot = this.botManager.findNearestDownedFriendly(this.pos, this.team, DISTANCES.INTERACT_RANGE);
    }
    this.reviveTargetBot = nearDownedBot;
    this.reviveTargetRemoteAlly = nearDownedRemoteAlly;
    this.isDraggingAlly = Boolean(this.draggedBot || this.draggedRemoteAlly);

    const wantMove = Boolean(
      this.keys['KeyW'] || this.keys['KeyS'] || this.keys['KeyA'] || this.keys['KeyD']
    );
    if ((this.draggedBot || this.draggedRemoteAlly) && wantMove) {
      this.dragDistAccum = (this.dragDistAccum || 0) + 4.8 * dt;
    }
    if (this.draggedRemoteAlly && netRef) {
      const behindX = this.pos.x + Math.sin(this.yaw || 0) * 1.15;
      const behindZ = this.pos.z + Math.cos(this.yaw || 0) * 1.15;
      const behindY = this.world ? this.world.getGroundHeightAt(behindX, behindZ) : this.pos.y;
      this.draggedRemoteAlly.pos.set(behindX, behindY, behindZ);
      if (this.draggedRemoteAlly.targetPos) {
        this.draggedRemoteAlly.targetPos.set(behindX, behindY, behindZ);
      }
      if (this.draggedRemoteAlly.mesh) {
        this.draggedRemoteAlly.mesh.position.set(behindX, behindY, behindZ);
      }
      this._allyDragSyncTick = (this._allyDragSyncTick || 0) + dt;
      if (this._allyDragSyncTick >= 0.08) {
        this._allyDragSyncTick = 0;
        netRef.send?.({
          type: 'ally_drag',
          targetId: this.draggedRemoteAlly.id,
          pos: [Number(behindX.toFixed(2)), Number(behindY.toFixed(2)), Number(behindZ.toFixed(2))]
        });
      }
    }

    const activeReviveUnit = nearDownedRemoteAlly || nearDownedBot;
    const riverSurfForRev = this.world?.mapDef?.dimensions?.riverWaterY ?? -0.85;
    const targetSubmerged = Boolean(
      activeReviveUnit &&
        this.world?.era !== 'jurassic' &&
        (this.inDeepWater || activeReviveUnit.isSwimming || (activeReviveUnit.pos?.y ?? 0) < riverSurfForRev - 0.9)
    );
    if (activeReviveUnit && this.keys['KeyF'] && targetSubmerged) {
      this.reviveProgress = 0;
      const nowRevWarn = performance.now();
      if (nowRevWarn - (this._lastWaterReviveWarnMs || 0) > 1800 && this.onAwardXp) {
        this._lastWaterReviveWarnMs = nowRevWarn;
        this.onAwardXp(0, '🌊 CANNOT REVIVE SUBMERGED CASUALTIES IN DEEP WATER — DRAG [E] TO DRY BANK FIRST!');
      }
    } else if (activeReviveUnit && this.keys['KeyF'] && (this.bandages || 0) > 0) {
      this._fUsedForFriendlyAction = true;
      this._pendingEnemyLootPack = null;
      this.keyFHoldTime = 0;
      const isMedicRole = this.role === 'medic';
      const revDuration = isMedicRole
        ? PLAYER.REVIVE_DURATION_MEDIC
        : this.squadDoctrineEnabled !== false
        ? PLAYER.REVIVE_DURATION_OTHER_DOCTRINE || 3.8
        : PLAYER.REVIVE_DURATION_OTHER;
      const rateMult = wantMove ? 0.35 : 1.0;
      this.reviveProgress += (dt / revDuration) * rateMult;
      if (this.reviveProgress >= 1) {
        const draggedFar = (this.dragDistAccum || 0) >= 1.5;
        this.reviveProgress = 0;
        this.dragDistAccum = 0;
        this.draggedBot = null;
        this.draggedRemoteAlly = null;
        this.isDraggingAlly = false;
        // Squad rule: Every revive consumes 1 Field Dressing!
        this.bandages = Math.max(0, (this.bandages || 1) - 1);
        const restoredHp = isMedicRole
          ? 100
          : this.squadDoctrineEnabled !== false
          ? PLAYER.REVIVE_HP_DOCTRINE || 30
          : 50;

        if (nearDownedRemoteAlly) {
          nearDownedRemoteAlly.downed = false;
          nearDownedRemoteAlly.hp = restoredHp;
          if (nearDownedRemoteAlly.mesh) nearDownedRemoteAlly.mesh.rotation.x = 0;
          netRef?.send?.({
            type: 'player_revive',
            targetId: nearDownedRemoteAlly.id,
            hp: restoredHp,
            reviverName: this.name || 'ALLY MEDIC'
          });
          this.reviveTargetRemoteAlly = null;
        } else {
          this.botManager.reviveBot(nearDownedBot, isMedicRole);
          if (isMedicRole) {
            if ((this.medicBagSupply ?? 600) > 0) {
              const needed = Math.max(0, 100 - nearDownedBot.hp);
              const healAmt = Math.min(needed, this.medicBagSupply ?? 600);
              this.medicBagSupply = Math.max(0, (this.medicBagSupply ?? 600) - healAmt);
            }
            nearDownedBot.hp = 100;
          } else if (this.squadDoctrineEnabled !== false) {
            nearDownedBot.hp = PLAYER.REVIVE_HP_DOCTRINE || 30;
          }
          netRef?.send?.({
            type: 'bot_event',
            action: 'revive',
            botId: nearDownedBot.id,
            isMedic: isMedicRole,
            hp: nearDownedBot.hp
          });
          this.reviveTargetBot = null;
        }
        this.revives = (this.revives || 0) + 1;
        const baseRevXp = draggedFar ? PLAYER.REVIVE_DRAG_XP : PLAYER.REVIVE_XP;
        const xpPts = this.inSquadCohesion ? Math.round(baseRevXp * 1.25) : baseRevXp;
        this.score += xpPts;
        if (this.onAwardXp) {
          const maxD = this.maxBandages || (isMedicRole ? 9 : 2);
          const hpRestored = Math.round(nearDownedRemoteAlly ? restoredHp : nearDownedBot.hp);
          this.onAwardXp(
            xpPts,
            draggedFar
              ? `🩹 DRAGGED & REVIVED ${activeReviveUnit.name} TO ${hpRestored} HP (-1 DRESSING • ${this.bandages}/${maxD} LEFT)`
              : `🩹 REVIVED ${activeReviveUnit.name} TO ${hpRestored} HP (-1 FIELD DRESSING • ${this.bandages}/${maxD} LEFT)`
          );
        }
        if (this.onKillEvent) {
          this.onKillEvent(
            this.name,
            this.team,
            activeReviveUnit.name,
            activeReviveUnit.team,
            'REVIVED',
            false
          );
        }
      }
    } else {
      this.reviveProgress = 0;
      // Long-Press [F] (0.30s) near a Fallen Enemy opens the Side-by-Side Tarkov / ABI Enemy Gear & Manual Loot UI!
      // Never trigger if [F] was used to revive or heal a friendly teammate during this key hold!
      if (this.keys['KeyF'] && !nearDownedBot && !this._fUsedForFriendlyAction && !this.isPopoutModalOpen()) {
        this.keyFHoldTime = (this.keyFHoldTime || 0) + dt;
        if (this.keyFHoldTime >= 0.30 && !this._enemyLootHoldTriggered) {
          const targetLootPack =
            this._pendingEnemyLootPack ||
            (typeof this.findNearestEnemyLoot === 'function'
              ? this.findNearestEnemyLoot(5.2)
              : null);
          if (targetLootPack) {
            this._enemyLootHoldTriggered = true;
            this._justOpenedLootByHold = true;
            if (
              window.game &&
              window.game.ui &&
              typeof window.game.ui.openBackpackLootView === 'function'
            ) {
              window.game.ui.openBackpackLootView(targetLootPack);
            }
          }
        }
      }
    }

    // Tarkov Slow Reload (Pressing Bullets One-by-One into Existing Mags via [P] or Hold [R])
    const cur = this.currentWeapon();
    if (this.keys['KeyR'] && cur && !this.activeVehicle) {
      this.keyRHoldTime = (this.keyRHoldTime || 0) + dt;
      if (this.keyRHoldTime >= 0.36 && !this.slowReloading) {
        if (this.reloading) {
          this.reloading = false;
          this.fastReload = false;
        }
        this.startSlowReload(true);
      }
    }

    if (this.slowReloading && cur && cur.mags && cur.def.clipSize > 1) {
      if (this.isFiring && cur.clip > 0) {
        this.slowReloading = false;
        this.magPackProgress = 0;
      } else {
        const bulletDur = this.magPackBulletDuration || PLAYER.MAG_PACK_BULLET_TIME || 0.22;
        this.magPackBulletTimer -= dt;
        this.magPackProgress = Math.max(
          0.02,
          Math.min(1, 1 - this.magPackBulletTimer / bulletDur)
        );

        if (this.magPackBulletTimer <= 0) {
          let gotBullet = false;
          if ((cur.looseAmmo || 0) > 0) {
            cur.looseAmmo--;
            gotBullet = true;
          } else {
            // Consolidate from the lowest non-empty mag into active rifle clip (or into a fuller rig mag)
            let donorIdx = -1;
            let donorMin = Infinity;
            for (let i = 0; i < cur.mags.length; i++) {
              const canDonateToActiveClip = cur.clip < cur.def.clipSize && cur.mags[i] > 0;
              const canDonateToRigMag = cur.mags[i] > 0 && cur.mags[i] < cur.def.clipSize;
              if ((canDonateToActiveClip || canDonateToRigMag) && cur.mags[i] < donorMin) {
                donorMin = cur.mags[i];
                donorIdx = i;
              }
            }
            const canPullDonor =
              donorIdx !== -1 &&
              (cur.clip < cur.def.clipSize ||
                cur.mags.filter((m) => m > 0 && m < cur.def.clipSize).length >= 2);
            if (canPullDonor) {
              cur.mags[donorIdx]--;
              gotBullet = true;
            }
          }

          let pressedIntoMag = false;
          if (gotBullet) {
            if (cur.clip < cur.def.clipSize) {
              cur.clip++;
              pressedIntoMag = true;
            } else {
              // Find the fullest non-full magazine in Chest Rig to press the bullet into
              let bestIdx = -1;
              let bestCount = -1;
              for (let i = 0; i < cur.mags.length; i++) {
                if (cur.mags[i] < cur.def.clipSize && cur.mags[i] > bestCount) {
                  bestCount = cur.mags[i];
                  bestIdx = i;
                }
              }
              if (bestIdx !== -1) {
                cur.mags[bestIdx]++;
                pressedIntoMag = true;
              }
            }
          }

          if (pressedIntoMag) {
            this.slowReloadRoundsPacked = (this.slowReloadRoundsPacked || 0) + 1;
            cur.mags.sort((a, b) => b - a);
            this.syncReserveFromMags(cur);
            sound.playHitmarker('normal');
          }

          const stillNeedsBullets =
            cur.clip < cur.def.clipSize || cur.mags.some((m) => m < cur.def.clipSize);
          const hasMoreSource =
            (cur.looseAmmo || 0) > 0 ||
            (cur.clip < cur.def.clipSize && cur.mags.some((m) => m > 0)) ||
            cur.mags.filter((m) => m > 0 && m < cur.def.clipSize).length >= 2;

          if (pressedIntoMag && stillNeedsBullets && hasMoreSource) {
            this.magPackBulletTimer = bulletDur;
          } else {
            this.slowReloading = false;
            this.magPackProgress = 0;
            sound.playReload();
            if (this.onAwardXp && this.slowReloadRoundsPacked > 0) {
              this.onAwardXp(
                15,
                `🎒 MAGAZINES PACKED (+${this.slowReloadRoundsPacked} RDS • ${cur.looseAmmo || 0} LOOSE LEFT)`
              );
            }
          }
        }
      }
    } else {
      this.magPackProgress = 0;
    }

    // Fast Reloading timer (Change Mags from Chest Rig vs. Speed Drop Reload) & RPG warhead restore
    if (this.reloading && cur) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        if (cur.mags && cur.def.clipSize > 1) {
          // Tarkov Fast Mag-Swap: pull fresh magazine FIRST, then tuck old magazine (even 0-round empty!)
          // into the freed Chest Rig slot so empty sniper mags are NEVER deleted and can be slow-reloaded!
          const maxRigMagSlots = cur.def.spareMagSlots || Math.max(4, cur.mags.length + 1);
          const oldClip = cur.clip || 0;
          cur.mags.sort((a, b) => b - a);
          cur.clip = cur.mags.length > 0 ? cur.mags.shift() : oldClip;
          if (!this.fastReload && (oldClip > 0 || cur.mags.length < maxRigMagSlots)) {
            cur.mags.push(oldClip);
            cur.mags.sort((a, b) => b - a);
          }
          this.syncReserveFromMags(cur);
        } else {
          const needed = cur.def.clipSize - cur.clip;
          const take = Math.min(needed, cur.reserve);
          cur.clip += take;
          cur.reserve -= take;
        }
        this.reloading = false;
        this.fastReload = false;
        const warhead = this._getWeaponAnimRefs(cur.mesh)?.rpgWarhead;
        if (warhead) warhead.visible = true;
        events.emit('player:reloaded', {
          weapon: cur.def,
          clip: cur.clip,
          reserve: cur.reserve,
          stage: 'complete'
        });
      }
    }

    if (this.fireTimer > 0) {
      this.fireTimer -= dt;
    }

    // Tactical Leaning (Q / ADS+E so [E] Enter Vehicle / Drag never conflicts)
    const leanRightActive = this.keys['KeyE'] && this.isAds && !this.draggedBot && !nearDownedBot;
    this.leanTarget = (leanRightActive ? 1 : 0) - (this.keys['KeyQ'] ? 1 : 0);
    this.leanAmount += (this.leanTarget - this.leanAmount) * Math.min(1, dt * 12);

    // Movement vector (paused while any UI modal / Loot window is open)
    const modalOpenNow = this.isModalOpen();
    if (modalOpenNow) {
      this.isFiring = false;
      this.isAds = false;
    }
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const moveDir = new THREE.Vector3();
    let analogSpeedMult = 1.0;
    if (!modalOpenNow) {
      if (this.keys['KeyW']) moveDir.add(forward);
      if (this.keys['KeyS']) moveDir.sub(forward);
      if (this.keys['KeyD']) moveDir.add(right);
      if (this.keys['KeyA']) moveDir.sub(right);

      const tx = this.touchMoveX || 0;
      const tz = this.touchMoveZ || 0;
      if (moveDir.lengthSq() < 0.001 && (Math.abs(tx) > 0.05 || Math.abs(tz) > 0.05)) {
        moveDir.addScaledVector(forward, -tz);
        moveDir.addScaledVector(right, tx);
        analogSpeedMult = Math.max(0.38, Math.min(1.0, this.touchMoveMag || Math.hypot(tx, tz)));
      }
    }

    const isMoving = moveDir.lengthSq() > 0.001;
    if (isMoving) moveDir.normalize();

    const wantSprint = Boolean(this.keys['ShiftLeft'] || this.touchSprintLocked);
    if (!modalOpenNow && wantSprint && (this.keys['KeyW'] || isMoving) && (this.prone || this.crouching)) {
      this.prone = false;
      this.crouching = false;
    }

    if (this.camera && this.camera.near !== 0.08) {
      this.camera.near = 0.08;
      this.camera.updateProjectionMatrix();
    }

    const isDraggingBody = Boolean(this.draggedBot || (nearDownedBot && this.keys['KeyF']));
    const activeOpticForBreath =
      typeof this.getActiveOpticType === 'function' ? this.getActiveOpticType() : cur?.def?.opticType;
    const isHighZoomScope = Boolean(
      !this.useCantedSight &&
        (cur?.def?.isScoped ||
          activeOpticForBreath === 'sniper8x' ||
          activeOpticForBreath === 'sniper12x' ||
          activeOpticForBreath === 'sniperFlir' ||
          activeOpticForBreath === 'valday6x' ||
          activeOpticForBreath === 'lpvo36' ||
          activeOpticForBreath === 'flir' ||
          activeOpticForBreath === 'acog' ||
          activeOpticForBreath === 'elcan4x')
    );
    if (typeof this.breathStamina !== 'number') this.breathStamina = 4.5;
    const canHoldBreath = Boolean(
      !modalOpenNow && this.isAds && this.adsAmount > 0.4 && isHighZoomScope && !this.reloading
    );
    const holdBreathHeld = Boolean(this.keys['ShiftLeft'] || this.touchHoldBreath);
    if (canHoldBreath && holdBreathHeld && !this._breathExhausted) {
      this.breathStamina = Math.max(0, this.breathStamina - dt * 1.0);
      if (this.breathStamina <= 0.02) {
        this._breathExhausted = true;
        this.isHoldingBreath = false;
      } else {
        this.isHoldingBreath = true;
      }
    } else {
      this.isHoldingBreath = false;
      this.breathStamina = Math.min(4.5, this.breathStamina + dt * 1.45);
      if (this._breathExhausted && (!holdBreathHeld || this.breathStamina >= 1.25)) {
        if (this.breathStamina >= 1.25) this._breathExhausted = false;
      }
    }

    const sprinting =
      !modalOpenNow &&
      wantSprint &&
      !this.legFractured &&
      !this.isAds &&
      !this.crouching &&
      !this.prone &&
      !isDraggingBody &&
      (this.keys['KeyW'] || isMoving) &&
      !this.isFiring;
    const classSpdMult = this.classMoveSpeedMult || (CLASS_TRAITS[this.role]?.moveSpeedMult ?? 1.0);
    const fractureMoveMult = this.legFractured ? 0.65 : 1.0;
    const rawBaseSpeed = this.parachuting
      ? 12.5
      : isDraggingBody
      ? 4.6
      : this.prone
      ? 2.4
      : this.crouching
      ? 4.3
      : sprinting
      ? 9.8
      : this.isAds
      ? 4.6
      : 7.0;
    const baseSpeed = this.parachuting
      ? rawBaseSpeed
      : rawBaseSpeed * classSpdMult * fractureMoveMult * (sprinting ? 1.0 : analogSpeedMult);

    // [Space]: Stand up from Prone/Crouch, Vault over low wall/window, or Auto-Bunnyhop (when bhopEnabled is ON)!
    const bodyHeightNow = this.prone ? 0.65 : this.crouching ? 1.15 : 1.7;
    const overlappingNow = this.checkBodyOverlap(this.pos.x, this.pos.y, this.pos.z, 0.4, bodyHeightNow);
    let jumpedThisFrame = false;
    const canJumpPress = this.bhopEnabled ? Boolean(this.keys['Space']) : Boolean(this.keys['Space'] && !this._spaceJumpConsumed);

    if (!modalOpenNow && canJumpPress && (this.isGrounded || overlappingNow)) {
      if (this.prone || this.crouching) {
        this.prone = false;
        this.crouching = false;
        this.keys['Space'] = false;
        this._spaceJumpConsumed = true;
      } else {
        if (!this.bhopEnabled) {
          this._spaceJumpConsumed = true;
        }
        // If overlapping a chest wall / low voxel when pressing Space, immediately pop above or out of it!
        if (overlappingNow) {
          const lowTopY = this.getHighestOverlappingVoxelTop(this.pos.x, this.pos.y, this.pos.z, 0.4, 1.45);
          if (
            lowTopY !== null &&
            !this.checkBodyOverlap(this.pos.x, lowTopY + 0.03, this.pos.z, 0.38, bodyHeightNow)
          ) {
            this.pos.y = lowTopY + 0.03;
          } else {
            this.resolveHorizontalOverlap(0.4, bodyHeightNow);
          }
        }

        // Check if facing a vaultable 1-1.5 block ledge/window
        const vaultCheckX = this.pos.x + forward.x * 1.05;
        const vaultCheckZ = this.pos.z + forward.z * 1.05;
        const hasLowWall = this.checkBodyOverlap(vaultCheckX, this.pos.y, vaultCheckZ, 0.35, 1.3);
        const clearAbove = !this.checkBodyOverlap(
          vaultCheckX,
          this.pos.y + VOXEL_SIZE * 1.45,
          vaultCheckZ,
          0.35,
          1.5
        );
        this.vel.y = hasLowWall && clearAbove ? 9.8 : 9.4;
        this.isGrounded = false;
        this.parachuteFSM?.send(PLAYER_PARACHUTE_EVENTS.JUMP_OR_FALL);
        jumpedThisFrame = true;
        this.bhopCount = this.bhopEnabled ? (this.bhopCount || 0) + 1 : 0;
      }
    } else if (this.isGrounded && !this.keys['Space']) {
      this.bhopCount = 0;
    }

    // Movement Physics: Progressive Human Stride Inertia (never snaps instantaneously to top speed!)
    // + Optional Quake Bunnyhop + Air-Strafe (Uncapped Speed when airborne)
    if (this.parachuting) {
      this.vel.x = THREE.MathUtils.lerp(this.vel.x, moveDir.x * baseSpeed, Math.min(1, dt * 3.5));
      this.vel.z = THREE.MathUtils.lerp(this.vel.z, moveDir.z * baseSpeed, Math.min(1, dt * 3.5));
    } else if (!this.bhopEnabled) {
      // Tactical Ground & Air Movement with Physical Human Mass & Stride Ramp-Up:
      // Starting from a standstill builds momentum smoothly through walk -> jog -> sprint (~0.6s ramp),
      // while releasing WASD applies natural boot-ground friction deceleration.
      if (this.isGrounded) {
        const curH = Math.hypot(this.vel.x, this.vel.z);
        if (!isMoving) {
          const decelMs2 = 18.5 + curH * 1.4;
          if (curH <= decelMs2 * dt) {
            this.vel.x = 0;
            this.vel.z = 0;
          } else {
            const scale = (curH - decelMs2 * dt) / curH;
            this.vel.x *= scale;
            this.vel.z *= scale;
          }
          this._strideSpool = Math.max(0, (this._strideSpool || 0) - dt * 3.5);
        } else {
          this._strideSpool = Math.min(1.0, (this._strideSpool || 0) + dt * 2.1);
          const spdFrac = THREE.MathUtils.clamp(curH / Math.max(1, baseSpeed), 0, 1.1);
          // Progressive leg-drive curve: controlled initial push-off -> strong mid-stride -> smooth top-end taper
          const strideAccelMs2 =
            (sprinting ? 14.5 : 16.0) *
            (0.45 + 0.55 * this._strideSpool) *
            Math.max(0.18, 1.0 - 0.65 * spdFrac * spdFrac);
          const targetVx = moveDir.x * baseSpeed;
          const targetVz = moveDir.z * baseSpeed;
          const dvx = targetVx - this.vel.x;
          const dvz = targetVz - this.vel.z;
          const dvLen = Math.hypot(dvx, dvz);
          // pivoting against current momentum uses stronger braking traction
          const dotAlign = curH > 0.2 ? (this.vel.x * moveDir.x + this.vel.z * moveDir.z) / curH : 1;
          const maxStep = (dotAlign < 0.2 ? 24.0 : strideAccelMs2) * dt;
          if (dvLen <= maxStep) {
            this.vel.x = targetVx;
            this.vel.z = targetVz;
          } else {
            this.vel.x += (dvx / dvLen) * maxStep;
            this.vel.z += (dvz / dvLen) * maxStep;
          }
        }
      } else {
        this.vel.x = THREE.MathUtils.lerp(this.vel.x, moveDir.x * baseSpeed, Math.min(1, dt * 3.2));
        this.vel.z = THREE.MathUtils.lerp(this.vel.z, moveDir.z * baseSpeed, Math.min(1, dt * 3.2));
      }
    } else if (this.isGrounded && !jumpedThisFrame) {
      // 1) Ground Friction (`PM_Friction`)
      const speedHoriz = Math.hypot(this.vel.x, this.vel.z);
      if (speedHoriz > 0.001) {
        const control = Math.max(speedHoriz, PLAYER.GROUND_STOP_SPEED || 2.8);
        const drop = control * (PLAYER.GROUND_FRICTION || 5.2) * dt;
        const newSpeed = Math.max(0, speedHoriz - drop);
        const scale = newSpeed / speedHoriz;
        this.vel.x *= scale;
        this.vel.z *= scale;
      } else {
        this.vel.x = 0;
        this.vel.z = 0;
      }
      // 2) Ground Acceleration (`PM_Accelerate`) with Progressive Human Stride Ramp (never reaches max speed in 1 frame!)
      if (isMoving) {
        this._strideSpool = Math.min(1.0, (this._strideSpool || 0) + dt * 2.2);
        const currentProj = this.vel.x * moveDir.x + this.vel.z * moveDir.z;
        const addSpeed = baseSpeed - currentProj;
        if (addSpeed > 0) {
          const humanGroundAccel = 3.2 + 2.4 * this._strideSpool;
          const accelSpeed = Math.min(addSpeed, humanGroundAccel * baseSpeed * dt);
          this.vel.x += accelSpeed * moveDir.x;
          this.vel.z += accelSpeed * moveDir.z;
        }
      } else {
        this._strideSpool = Math.max(0, (this._strideSpool || 0) - dt * 3.2);
      }
    } else {
      // 3) Airborne Quake Air-Strafe Acceleration (`PM_AirAccelerate` + CPMA Air Control)
      if (isMoving) {
        const airWishCap = Math.min(baseSpeed, PLAYER.AIR_WISH_SPEED_CAP || 4.2);
        const currentProj = this.vel.x * moveDir.x + this.vel.z * moveDir.z;
        const addSpeed = airWishCap - currentProj;
        if (addSpeed > 0) {
          const accelSpeed = Math.min(
            addSpeed,
            (PLAYER.AIR_ACCEL || 14.0) * baseSpeed * dt
          );
          this.vel.x += accelSpeed * moveDir.x;
          this.vel.z += accelSpeed * moveDir.z;
        }

        // CPMA Air Control: smoothly rotate horizontal velocity toward `moveDir` without losing momentum
        const horizSpeed = Math.hypot(this.vel.x, this.vel.z);
        if (horizSpeed > 0.1) {
          const dirX = this.vel.x / horizSpeed;
          const dirZ = this.vel.z / horizSpeed;
          const dot = dirX * moveDir.x + dirZ * moveDir.z;
          if (dot > 0) {
            const k = 32.0 * (PLAYER.CPM_AIR_CONTROL || 155.0) * dot * dot * dt * 0.0012;
            const steerX = dirX * horizSpeed + moveDir.x * k;
            const steerZ = dirZ * horizSpeed + moveDir.z * k;
            const steerLen = Math.hypot(steerX, steerZ);
            if (steerLen > 0.001) {
              this.vel.x = (steerX / steerLen) * horizSpeed;
              this.vel.z = (steerZ / steerLen) * horizSpeed;
            }
          }
        }
      }
      // Uncapped Quake / Source bunnyhop speed when bhopEnabled is ON!
    }
    this.horizSpeed = Math.hypot(this.vel.x, this.vel.z);

    // Climbable Steel Tower / Watchtower / Skyscraper Express-Shaft Ladder Physics (`world.climbableLadders`)
    if ((this._ladderDetachTimer || 0) > 0) {
      this._ladderDetachTimer = Math.max(0, this._ladderDetachTimer - dt);
    }
    const activeLadder =
      !modalOpenNow && !this.activeVehicle && !this.dead && !this.downed && !(this._ladderDetachTimer > 0)
        ? this.findActiveClimbableLadder()
        : null;

    if (activeLadder) {
      const toLadX = activeLadder.x - this.pos.x;
      const toLadZ = activeLadder.z - this.pos.z;
      const lookAwayJump =
        Boolean(this.keys['Space']) &&
        this.pos.y > activeLadder.minY + 1.5 &&
        forward.x * toLadX + forward.z * toLadZ < -0.18;

      if (lookAwayJump) {
        this.onLadder = false;
        this._ladderDetachTimer = 0.35;
        this.vel.set(forward.x * 5.2, 6.2, forward.z * 5.2);
        this.isGrounded = false;
      } else {
        this.onLadder = true;
        this.parachuting = false;
        this.parachuteCut = false;
        this.prone = false;
        const wantUp =
          (Boolean(this.keys['KeyW']) && (this.pitch || 0) >= -0.55) ||
          Boolean(this.keys['Space']);
        const wantDown =
          Boolean(this.keys['KeyS']) ||
          Boolean(this.keys['ControlLeft']) ||
          Boolean(this.keys['ControlRight']) ||
          (Boolean(this.keys['KeyW']) && (this.pitch || 0) < -0.55);
        const climbVelY = wantUp ? 6.8 : wantDown ? -7.2 : 0;

        this.pos.x = THREE.MathUtils.lerp(this.pos.x, activeLadder.x, Math.min(1, dt * 10.0));
        this.pos.z = THREE.MathUtils.lerp(this.pos.z, activeLadder.z, Math.min(1, dt * 10.0));
        this.pos.y = THREE.MathUtils.clamp(
          this.pos.y + climbVelY * dt,
          activeLadder.minY,
          activeLadder.maxY + 0.12
        );
        this.vel.set(0, 0, 0);
        this.isGrounded = true;

        if (wantUp && this.pos.y >= activeLadder.topExitY - 0.06) {
          // Smooth inertia step-off at ladder top instead of 1-frame horizontal position snap!
          const exX = activeLadder.exitDirX || 0;
          const exZ = activeLadder.exitDirZ || -1;
          this.pos.y = activeLadder.topExitY + 0.06;
          this.vel.set(exX * 4.6, 2.4, exZ * 4.6);
          this.onLadder = false;
          this.isGrounded = false;
          this._ladderDetachTimer = 0.28;
        } else if (wantDown && this.pos.y <= activeLadder.minY + 0.04) {
          this.pos.y = activeLadder.minY;
          this.onLadder = false;
        }
      }
    } else {
      this.onLadder = false;
    }

    if (!this.onLadder) {
      if (this.parachuting) {
        // Parachute canopy drag caps descent speed to a smooth 5.5 m/s glide
        this.vel.y = Math.max(this.vel.y - 8.5 * dt, -5.5);
      } else {
        // High-speed freefall when parachute is cut or not yet deployed
        const freefallAccel = this.parachuteCut ? 32.0 : 24.0;
        const maxTerminalVel = this.parachuteCut ? -58.0 : -46.0;
        this.vel.y = Math.max(maxTerminalVel, this.vel.y - freefallAccel * dt);
        // Manual [SPACE] parachute deploy when falling > 6.5m AGL (never auto-deploys so cutting your
        // parachute or failing to deploy causes high-speed freefall and lethal fall damage!)
        const gHCheck = this.world ? this.world.getGroundHeightAt(this.pos.x, this.pos.z) : 0;
        const agl = this.pos.y - gHCheck;
        if (
          !this.isGrounded &&
          this.keys['Space'] &&
          agl > 6.5 &&
          this.vel.y < -5.5 &&
          typeof this.activateParachuteEject === 'function'
        ) {
          this.parachuteCut = false;
          this.activateParachuteEject(this.pos, true);
        }
      }
      this.moveWithVoxelCollision(dt);
    }

    // Buoyant River Surface Swimming (`riverWaterY = -0.85m`):
    // Prevents infantry from walking along the `-3.75m` riverbed underwater (`eyeHeight +1.65m` stays `+0.47m` above water!).
    const riverWaterY = this.world?.mapDef?.dimensions?.riverWaterY ?? -0.85;
    if (!this.activeVehicle && !this.parachuting && this.world?.era !== 'jurassic' && this.pos.y < riverWaterY - 0.95) {
      this.inDeepWater = true;
      const swimFloorY = riverWaterY - 1.18;
      if (this.pos.y < swimFloorY) {
        this.pos.y = THREE.MathUtils.lerp(this.pos.y, swimFloorY, Math.min(1, dt * 14.0));
        if (swimFloorY - this.pos.y < 0.08) this.pos.y = swimFloorY;
      }
      if (this.vel.y < 0) this.vel.y = 0;
      this.isGrounded = true;
      this.prone = false;
      this.crouching = false;
      this.vel.x *= Math.pow(0.45, dt);
      this.vel.z *= Math.pow(0.45, dt);
    } else {
      this.inDeepWater = false;
    }

    if (typeof this.updateStingerLockOn === 'function') {
      this.updateStingerLockOn(dt);
    }

    if (this.parachuting) {
      if (this.parachuteMesh) {
        this.parachuteMesh.visible = true;
        this.parachuteMesh.position.copy(this.pos);
        this.parachuteMesh.rotation.y = this.yaw;
      }
      const gH = this.world ? this.world.getGroundHeightAt(this.pos.x, this.pos.z) : 0;
      if (this.isGrounded || this.pos.y <= gH + 0.35) {
        this.parachuting = false;
        this.parachuteCut = false;
        this.isGrounded = true;
        this.vel.y = 0;
        this.parachuteFSM?.send(PLAYER_PARACHUTE_EVENTS.LAND_GROUND);
        if (this.parachuteMesh) {
          this.parachuteMesh.visible = false;
        }
        if (this.onAwardXp) {
          this.onAwardXp(25, '🪂 SAFE PARACHUTE TOUCHDOWN!');
        }
      }
    }

    // If dragging a downed friendly soldier while holding [F], pull their body right in front of us
    // so we can see them being dragged into safe cover!
    if (isDraggingBody && nearDownedBot) {
      const dragTarget = this.pos.clone().addScaledVector(forward, 1.15);
      nearDownedBot.pos.x = THREE.MathUtils.lerp(nearDownedBot.pos.x, dragTarget.x, Math.min(1, dt * 14));
      nearDownedBot.pos.z = THREE.MathUtils.lerp(nearDownedBot.pos.z, dragTarget.z, Math.min(1, dt * 14));
      nearDownedBot.pos.y = this.world.getGroundHeightAt(nearDownedBot.pos.x, nearDownedBot.pos.z) + 0.22;
      nearDownedBot.mesh.rotation.y = this.yaw;
    }

    // Decay recoil, visual roll/bolt/trigger kinematics, weapon sway, suppression & explosion trauma
    this.recoilOffsetPitch *= Math.pow(0.08, dt);
    this.recoilKickZ *= Math.pow(0.02, dt);
    this.recoilVisualPitch = (this.recoilVisualPitch || 0) * Math.pow(0.015, dt);
    this.recoilVisualRoll = (this.recoilVisualRoll || 0) * Math.pow(0.018, dt);
    this.boltCycleTimer = Math.max(0, (this.boltCycleTimer || 0) - dt);
    this.triggerPullTimer = Math.max(0, (this.triggerPullTimer || 0) - dt);
    this.weaponDrawTimer = Math.max(0, (this.weaponDrawTimer || 0) - dt);
    const swayDecayBase = this.isHoldingBreath ? 0.0002 : 0.04;
    this.swayX *= Math.pow(swayDecayBase, dt);
    this.swayY *= Math.pow(swayDecayBase, dt);
    this.shakeTrauma = Math.max(0, this.shakeTrauma - dt * 1.8);

    // Smooth airborne lift & boot-landing knee/arm compression spring
    if (this._wasGroundedPrevFrame === false && this.isGrounded) {
      const impactSpd = Math.min(18, Math.max(2.5, Math.abs(this._prevAirborneVelY || 6)));
      this.landingDipVel = (this.landingDipVel || 0) - impactSpd * 0.032;
    }
    this._wasGroundedPrevFrame = this.isGrounded;
    if (!this.isGrounded) {
      this._prevAirborneVelY = this.vel.y;
    }
    const dipSpringK = 140;
    const dipDamp = 16;
    this.landingDipVel =
      ((this.landingDipVel || 0) - (this.landingDip || 0) * dipSpringK * dt) *
      Math.max(0, 1 - dipDamp * dt);
    this.landingDip = THREE.MathUtils.clamp(
      (this.landingDip || 0) + (this.landingDipVel || 0) * dt,
      -0.055,
      0.03
    );
    const targetAirLift = !this.isGrounded && !this.parachuting ? THREE.MathUtils.clamp(-this.vel.y * 0.0022, -0.02, 0.026) : 0;
    this.airborneArmLift = THREE.MathUtils.lerp(this.airborneArmLift || 0, targetAirLift, Math.min(1, dt * 9));
    this.idleBreathPhase = (this.idleBreathPhase || 0) + dt * (sprinting ? 3.2 : 1.75);
    const wantSprintPose = Boolean(
      sprinting && !this.reloading && !this.slowReloading && this.adsAmount < 0.2 && !(this.inspectTimer > 0)
    );
    this.sprintAnimBlend = THREE.MathUtils.lerp(
      this.sprintAnimBlend || 0,
      wantSprintPose ? 1 : 0,
      Math.min(1, dt * 11.5)
    );

    // Suppression decay + micro-flinch when suppressed or suffering an Arm Fracture!
    this.suppressionLevel = Math.max(0, this.suppressionLevel - this.suppressionDecayRate * dt);
    if (this.suppressionLevel > 0.05 || this.armFractured) {
      const flinchMag = (this.suppressionLevel * 0.015) + (this.armFractured ? 0.0042 : 0);
      this.swayX += (Math.random() - 0.5) * flinchMag;
      this.swayY += (Math.random() - 0.5) * flinchMag;
    }

    // Multi-kill timer decay
    if (this.multiKillTimer > 0) {
      this.multiKillTimer -= dt;
      if (this.multiKillTimer <= 0) {
        this.multiKillCount = 0;
      }
    }

    const shakeMag = this.shakeTrauma * this.shakeTrauma * 0.06;
    const shakeYaw = (Math.random() - 0.5) * shakeMag;
    const shakePitch = (Math.random() - 0.5) * shakeMag;

    // Camera height, lean & headbob (heavily stabilized while in ADS; rock-steady 0-bob when holding breath!)
    if (isMoving && this.isGrounded) {
      this.walkBobPhase += dt * (sprinting ? 14 : 9.5);
    }
    const bobAmpY = this.isHoldingBreath ? 0.0005 : this.isAds ? 0.0042 : 0.036;
    const bobAmpX = this.isHoldingBreath ? 0.0004 : this.isAds ? 0.0034 : 0.026;
    const bobY = isMoving && this.isGrounded ? Math.sin(this.walkBobPhase) * bobAmpY : 0;
    const bobX = isMoving && this.isGrounded ? Math.cos(this.walkBobPhase * 0.5) * bobAmpX : 0;

    this.lastBobY = bobY;
    this.lastShakeYaw = shakeYaw;
    this.lastShakePitch = shakePitch;
    this.syncCameraTransform();

    // Execute full-auto fire AFTER camera position & rotation are updated for this frame
    // (Sub-frame accumulator catch-up ensures identical RPM at 20 FPS, 60 FPS, and 240 FPS!)
    let autoCatchUp = 0;
    while (
      this.isFiring &&
      cur &&
      cur.def.auto &&
      !this.reloading &&
      this.fireTimer <= 0 &&
      (cur.clip > 0 || autoCatchUp === 0) &&
      autoCatchUp < 4
    ) {
      this.executeFire(cur);
      autoCatchUp++;
      if (this.reloading || (cur.clip || 0) <= 0) break;
    }

    // Update rally point beacon
    this.updateRallyPoint(dt);

    // Update commander abilities, insertion beacon, commo rose cooldowns
    this.updateUAV(dt);

    // Check for walk-over pickup of In-Building Armory Case Keys (or press [F] within 4.8m)
    if (
      !this.dead &&
      !this.downed &&
      !this.activeVehicle &&
      typeof this.findNearestBuildingKey === 'function'
    ) {
      const walkOverKey = this.findNearestBuildingKey(2.1);
      if (walkOverKey && typeof this.collectBuildingKeyObject === 'function') {
        this.collectBuildingKeyObject(walkOverKey);
      }
    }

    // ADS FOV & First-Person ViewModel Animation (Call of Duty snappy ADS + 45° Canted Sight + Hold-Breath!)
    const targetAds = this.isAds && !this.reloading && !this.slowReloading ? 1 : 0;
    const adsSpeed = cur?.def?.adsSpeed || 18.5;
    this.adsAmount += (targetAds - this.adsAmount) * Math.min(1, dt * adsSpeed);

    let activeAdsFov = 75;
    if (cur && cur.def) {
      if (this.useCantedSight && cur.def.hasCantedSight) {
        activeAdsFov = 50;
      } else if (Array.isArray(cur.def.zoomFovs) && cur.def.zoomFovs.length > 0) {
        const zIdx = Math.max(0, Math.min(this.opticZoomIndex || 0, cur.def.zoomFovs.length - 1));
        activeAdsFov = cur.def.zoomFovs[zIdx] || cur.def.adsFov || 55;
      } else {
        activeAdsFov = cur.def.adsFov || 55;
      }
    }
    const targetFov = cur ? THREE.MathUtils.lerp(75, activeAdsFov, this.adsAmount) : 75;
    if (Math.abs(this.camera.fov - targetFov) > 0.0002) {
      this.camera.fov = targetFov;
      this.camera.updateProjectionMatrix();
    } else if (this.camera.fov !== targetFov) {
      this.camera.fov = targetFov;
      this.camera.updateProjectionMatrix();
    }

    if (cur && cur.mesh) {
      const ledgeRestNow = typeof this.isRestingOnCoverLedge === 'function' ? this.isRestingOnCoverLedge() : false;
      const bipodDeployedNow = Boolean(cur.def.hasBipod && (this.prone || this.crouching || ledgeRestNow));
      const highMagIdleMult =
        this.isAds && !this.isHoldingBreath && !bipodDeployedNow && !this.prone
          ? activeAdsFov <= 3.2
            ? 2.5
            : activeAdsFov <= 4.8
            ? 1.85
            : activeAdsFov <= 7.8
            ? 1.35
            : 1.0
          : 1.0;
      const stanceBreathMult =
        (bipodDeployedNow ? 0.14 : this.prone ? 0.30 : this.crouching ? 0.58 : ledgeRestNow ? 0.65 : 1.0) *
        highMagIdleMult;
      const breathScale = this.isHoldingBreath
        ? 0
        : Math.max(highMagIdleMult > 1.0 ? 0.28 * highMagIdleMult : 0, 1 - this.adsAmount * 0.92) * stanceBreathMult;
      const idleBreathY = Math.sin(this.idleBreathPhase || 0) * 0.0032 * breathScale;
      const idleBreathX = Math.cos((this.idleBreathPhase || 0) * 0.5) * 0.0018 * breathScale;
      const vertInertiaY = ((this.landingDip || 0) + (this.airborneArmLift || 0)) * (1 - this.adsAmount * 0.72);
      const drawDur = Math.max(0.12, this.weaponDrawDuration || 0.26);
      const drawFrac =
        (this.weaponDrawTimer || 0) > 0 && !this.reloading
          ? Math.pow(THREE.MathUtils.clamp(this.weaponDrawTimer / drawDur, 0, 1), 1.65)
          : 0;
      const sprBlend = this.sprintAnimBlend || 0;
      const sprSweepX = sprBlend * (-0.045 + Math.cos(this.walkBobPhase * 0.5) * 0.018);
      const sprSweepY = sprBlend * (-0.032 + Math.abs(Math.sin(this.walkBobPhase * 0.5)) * 0.016);
      const sprSweepZ = sprBlend * 0.035;
      const bandageBlend =
        (this.bandageProgress || 0) > 0
          ? Math.sin(Math.min(1, this.bandageProgress * 4) * Math.PI * 0.5)
          : 0;

      const hipPos = new THREE.Vector3(
        0.22 + bobX + idleBreathX + this.swayX + sprSweepX - bandageBlend * 0.06,
        -0.2 + bobY * 0.65 + idleBreathY + vertInertiaY + this.swayY + sprSweepY - drawFrac * 0.16 - bandageBlend * 0.09,
        -0.31 + this.recoilKickZ + sprSweepZ + drawFrac * 0.05
      );
      const isPistol =
        cur.def.slot === 'secondary' ||
        cur.def.id === 'mp443' ||
        cur.def.id === 'm9_beretta' ||
        cur.def.id === 'five_seven' ||
        cur.def.id === 'usp45' ||
        cur.def.id === 'g18' ||
        cur.def.id === 'deagle';
      const isLauncher = Boolean(cur.def.type === 'rpg' || cur.def.type === 'stinger');
      const activeOptic =
        typeof this.getActiveOpticType === 'function'
          ? this.getActiveOpticType()
          : cur.def.opticType;
      const isBareIronSights = !activeOptic;
      const isCantedActive = Boolean(this.useCantedSight && cur.def.hasCantedSight);
      const isSniper8x =
        !isCantedActive &&
        (activeOptic === 'sniper8x' ||
          activeOptic === 'sniper12x' ||
          activeOptic === 'raptor13x' ||
          activeOptic === 'sniper16x' ||
          activeOptic === 'sniper27x' ||
          activeOptic === 'sniper40x' ||
          activeOptic === 'sniperFlir' ||
          activeOptic === 'valday6x' ||
          activeOptic === 'lpvo36' ||
          activeOptic === 'flir');
      const isAcog =
        !isCantedActive &&
        (activeOptic === 'acog' ||
          activeOptic === 'elcan4x' ||
          activeOptic === 'prism2x' ||
          activeOptic === 'holo3x');
      // Exact mathematical bore-sight alignment with `weapon-model.js`:
      // - Iron sights (`!activeOptic`): `frontSightPin` & `rearDot` sit at `y = +0.058` (`isPistol: +0.050`).
      // - All 3D Reflex / Holo / Prism / ACOG optics (`opticSightGroup`): reticle sits at `y = +0.082` (`isPistol: +0.064`).
      // - Full-screen 2D Scopes (`isSniper8x`): lower receiver (`-0.118`) clears the 2D scope reticle.
      const sightCenterY = isLauncher && (isBareIronSights || activeOptic === 'rpgSight')
        ? -0.108
        : isBareIronSights
        ? isPistol
          ? -0.050
          : -0.058
        : isCantedActive
        ? -0.068
        : isSniper8x
        ? -0.118
        : isPistol
        ? -0.064
        : -0.082;
      const baseAdsZ = isLauncher
        ? -0.22
        : isBareIronSights
        ? isPistol
          ? -0.22
          : -0.18
        : isCantedActive
        ? -0.17
        : isSniper8x
        ? -0.14
        : isAcog
        ? isPistol
          ? -0.21
          : -0.17
        : isPistol
        ? -0.25
        : -0.21;
      const isBowWep = Boolean(cur.def && cur.def.isBow && !cur.def.isCrossbow);
      const isXbowWep = Boolean(cur.def && cur.def.isCrossbow);
      const isMeleeWep = Boolean(cur.def && cur.def.type === 'melee_sword');
      const adsOffsetX = isMeleeWep ? 0.2 : isBowWep ? 0.14 : 0;
      const adsOffsetY = isMeleeWep ? -0.19 : isBowWep ? -0.105 : isXbowWep ? -0.095 : sightCenterY;
      const adsZ =
        (isMeleeWep ? -0.3 : isBowWep ? -0.25 : isXbowWep ? -0.23 : baseAdsZ) +
        this.recoilKickZ * 0.4;
      const swayMultAds = this.isHoldingBreath ? 0.0 : 0.12;
      const adsPos = new THREE.Vector3(
        adsOffsetX + this.swayX * swayMultAds,
        adsOffsetY + this.swayY * swayMultAds,
        adsZ
      );
      cur.mesh.position.lerpVectors(hipPos, adsPos, this.adsAmount);

      const animRefs = this._getWeaponAnimRefs(cur.mesh);
      if (animRefs.opticSight) {
        animRefs.opticSight.visible = !(activeOptic && this.adsAmount > 0.45 && !isCantedActive);
      }
      const magMesh = animRefs.mag;
      const magTopBrass = animRefs.magTopBrass;
      if (magTopBrass) {
        magTopBrass.visible = Boolean(this.reloading || this.slowReloading);
      }
      const leftArm = animRefs.leftArm;
      const rightArm = animRefs.rightArm;
      const triggerFinger = animRefs.triggerFinger;
      const triggerBlade = animRefs.triggerBlade;
      const boltMesh = animRefs.bolt;
      const packBulletMesh = animRefs.packBullet;
      const cantedRoll = isCantedActive ? -0.68 * this.adsAmount : 0;

      const baseMagY = magMesh && magMesh.userData.baseY !== undefined ? magMesh.userData.baseY : isPistol ? -0.082 : -0.105;
      const baseMagZ = magMesh && magMesh.userData.baseZ !== undefined ? magMesh.userData.baseZ : isPistol ? -0.195 : -0.29;
      const baseMagRotX = magMesh && magMesh.userData.baseRotX !== undefined ? magMesh.userData.baseRotX : isPistol ? 0.10 : -0.18;
      const baseBoltZ = boltMesh && boltMesh.userData.baseZ !== undefined ? boltMesh.userData.baseZ : isPistol ? -0.22 : -0.09;
      const isTopMagP90 = cur.def.id === 'p90';
      const isAkRockMag = cur.def.id === 'ak15';

      // Trigger finger & trigger blade physical squeeze on every shot
      const trigSqueeze =
        (this.triggerPullTimer || 0) > 0
          ? Math.sin(THREE.MathUtils.clamp((this.triggerPullTimer || 0) / 0.085, 0, 1) * Math.PI)
          : this.isFiring && cur.clip > 0 && !this.reloading
          ? 0.65
          : 0;
      if (triggerFinger) {
        const bTrigX = triggerFinger.userData.baseRotX ?? 0.24;
        triggerFinger.rotation.x = bTrigX + trigSqueeze * 0.42;
      }
      if (triggerBlade) {
        const bBladeX = triggerBlade.userData.baseRotX ?? -0.35;
        triggerBlade.rotation.x = bBladeX + trigSqueeze * 0.34;
      }

      if (this.reloading) {
        const totalDur = Math.max(
          0.25,
          (this.reloadTotalTime || cur.def.reloadTime) *
            (this.fastReload ? PLAYER.SPEED_RELOAD_MULT : 1.0)
        );
        const p = THREE.MathUtils.clamp(1 - Math.max(0, this.reloadTimer) / totalDur, 0, 1);
        const emptyChamber = Boolean(this.reloadWasEmpty);
        const lBasePos = leftArm?.userData?.basePos;
        const lBaseRot = leftArm?.userData?.baseRot;
        const rBasePos = rightArm?.userData?.basePos;
        const rBaseRot = rightArm?.userData?.baseRot;
        if (packBulletMesh) packBulletMesh.visible = false;

        if (cur.def.isBow || cur.def.isCrossbow) {
          // Bow / Crossbow Launch, Quiver Nock & String Draw Animation (keeps bow/crossbow aimed forward!)
          const releaseKick = p < 0.18 ? Math.sin((p / 0.18) * Math.PI) : 0;
          const nockTilt = p >= 0.18 ? Math.sin(((p - 0.18) / 0.82) * Math.PI) : 0;
          cur.mesh.rotation.set(
            -releaseKick * 0.06 + nockTilt * (cur.def.isCrossbow ? 0.14 : 0.05),
            nockTilt * 0.06,
            cantedRoll
          );
          animateBowOrCrossbowMesh(
            cur.mesh,
            p,
            this.adsAmount,
            Boolean(cur.def.isCrossbow),
            Boolean(this.fireArrowsActive)
          );
        } else if (p < 0.28) {
          // PHASE 1 (0.00 -> 0.28): Tilt magwell into workspace & extract/drop magazine with articulated Left Hand!
          const u = p / 0.28;
          const reachMag = Math.min(1, u / 0.42);
          const pullOut = u > 0.34 ? (u - 0.34) / 0.66 : 0;
          const pullEase = pullOut * pullOut * (3 - 2 * pullOut);
          const speedFlick = this.fastReload ? Math.sin(u * Math.PI) : 0;

          cur.mesh.rotation.set(
            0.22 * reachMag - speedFlick * 0.05,
            0.32 * reachMag + speedFlick * 0.14,
            -0.38 * reachMag - speedFlick * 0.16
          );
          cur.mesh.position.x -= 0.025 * reachMag;
          cur.mesh.position.y += 0.015 * reachMag;

          if (magMesh) {
            if (isTopMagP90) {
              magMesh.position.set(
                -0.04 * pullEase,
                baseMagY + pullEase * 0.14,
                baseMagZ + pullEase * 0.06
              );
              magMesh.rotation.set(baseMagRotX + pullEase * 0.28, 0, -pullEase * 0.2);
            } else {
              const dropDist = this.fastReload ? 0.38 : 0.29;
              const rockPitch = isAkRockMag ? -Math.sin(Math.min(1, pullOut * 1.6) * Math.PI) * 0.28 : 0.28 * pullEase;
              magMesh.position.set(
                -0.045 * pullEase,
                baseMagY - pullEase * dropDist,
                baseMagZ + pullEase * (isAkRockMag ? -0.03 : 0.045)
              );
              magMesh.rotation.set(baseMagRotX + rockPitch, 0.08 * pullEase, -0.14 * pullEase);
            }
          }
          if (leftArm && lBasePos && lBaseRot) {
            const grabY = isTopMagP90 ? baseMagY + 0.02 : baseMagY - 0.015;
            const handFollowY = this.fastReload
              ? grabY - pullEase * 0.22
              : grabY - pullEase * (isTopMagP90 ? -0.11 : 0.26);
            leftArm.position.set(
              THREE.MathUtils.lerp(lBasePos.x, -0.035 - pullEase * 0.045, reachMag),
              THREE.MathUtils.lerp(lBasePos.y, handFollowY, reachMag),
              THREE.MathUtils.lerp(lBasePos.z, baseMagZ + 0.055, reachMag)
            );
            leftArm.rotation.set(
              THREE.MathUtils.lerp(lBaseRot.x, (isTopMagP90 ? 0.52 : -0.28) - pullEase * 0.22, reachMag),
              THREE.MathUtils.lerp(lBaseRot.y, 0.56, reachMag),
              THREE.MathUtils.lerp(lBaseRot.z, -0.42, reachMag)
            );
          }
          if (rightArm && rBasePos && rBaseRot) {
            rightArm.position.copy(rBasePos);
            rightArm.rotation.set(rBaseRot.x + 0.04 * reachMag, rBaseRot.y, rBaseRot.z - 0.08 * reachMag);
          }
          if (boltMesh) {
            boltMesh.position.z = emptyChamber && isPistol ? baseBoltZ + 0.045 : baseBoltZ;
          }
        } else if (p < 0.44) {
          // PHASE 2 (0.28 -> 0.44): Left Hand indexes fresh magazine from Chest Rig Pouch up toward magwell
          const u = (p - 0.28) / 0.16;
          const pouchDip = Math.sin(u * Math.PI);
          cur.mesh.rotation.set(
            0.22 + pouchDip * 0.04,
            0.32 - pouchDip * 0.04,
            -0.38 + pouchDip * 0.05
          );
          cur.mesh.position.x -= 0.025;
          cur.mesh.position.y += 0.015 - pouchDip * 0.014;

          if (magMesh) {
            const startY = isTopMagP90 ? baseMagY + 0.15 : baseMagY - 0.31;
            const approachY = isTopMagP90 ? baseMagY + 0.11 : baseMagY - 0.19;
            magMesh.position.set(
              THREE.MathUtils.lerp(-0.08, -0.03, u),
              THREE.MathUtils.lerp(startY, approachY, u),
              THREE.MathUtils.lerp(baseMagZ + 0.08, baseMagZ + 0.03, u)
            );
            magMesh.rotation.set(
              baseMagRotX + (isAkRockMag ? -0.24 : 0.25) * (1 - u * 0.35),
              0.12 * (1 - u),
              -0.18 * (1 - u)
            );
          }
          if (leftArm && lBasePos && lBaseRot) {
            leftArm.position.set(
              THREE.MathUtils.lerp(-0.085, -0.04, u),
              THREE.MathUtils.lerp(baseMagY - 0.26, isTopMagP90 ? baseMagY + 0.09 : baseMagY - 0.16, u),
              THREE.MathUtils.lerp(baseMagZ + 0.09, baseMagZ + 0.05, u)
            );
            leftArm.rotation.set(-0.46 + u * 0.22, 0.58 - u * 0.08, -0.45 + u * 0.12);
          }
          if (boltMesh) {
            boltMesh.position.z = emptyChamber && isPistol ? baseBoltZ + 0.045 : baseBoltZ;
          }
        } else if (p < 0.75) {
          // PHASE 3 (0.44 -> 0.75): Guide fresh magazine into magwell + Crisp Positive Baseplate Slap!
          const s = (p - 0.44) / 0.31;
          const insertFrac = Math.min(1, s / 0.68);
          const easeInsert = 1 - Math.pow(1 - insertFrac, 2.4);
          // Positive baseplate palm-tap at s = 0.68..1.00
          const slapWindow = s > 0.68 ? (s - 0.68) / 0.32 : 0;
          const slapPulse = slapWindow > 0 ? Math.sin(slapWindow * Math.PI) : 0;

          cur.mesh.rotation.set(
            0.22 * (1 - s * 0.22) - slapPulse * 0.11,
            0.30 * (1 - s * 0.25),
            -0.36 * (1 - s * 0.22) + slapPulse * 0.1
          );
          cur.mesh.position.x -= 0.025 * (1 - s * 0.4);
          cur.mesh.position.y += 0.012 + slapPulse * (isTopMagP90 ? -0.022 : 0.028);

          if (magMesh) {
            const rem = 1 - easeInsert;
            const entryOffsetY = isTopMagP90 ? rem * 0.11 : -rem * 0.19;
            const akRockRot = isAkRockMag ? -rem * 0.28 : rem * 0.2;
            magMesh.position.set(-0.03 * rem, baseMagY + entryOffsetY, baseMagZ + rem * 0.03);
            magMesh.rotation.set(baseMagRotX + akRockRot, 0, -0.08 * rem);
          }
          if (leftArm && lBasePos && lBaseRot) {
            const seatY = isTopMagP90 ? baseMagY + 0.04 : baseMagY - 0.035;
            const slapDip = slapWindow > 0 && slapWindow < 0.45 ? -0.035 * Math.sin((slapWindow / 0.45) * Math.PI) : 0;
            leftArm.position.set(
              -0.035 * (1 - slapPulse * 0.3),
              THREE.MathUtils.lerp(isTopMagP90 ? baseMagY + 0.09 : baseMagY - 0.16, seatY, easeInsert) +
                slapDip +
                slapPulse * (isTopMagP90 ? -0.015 : 0.022),
              baseMagZ + 0.052
            );
            leftArm.rotation.set(
              -0.24 + easeInsert * 0.18 + slapPulse * 0.16,
              0.5 - easeInsert * 0.12,
              -0.34 + easeInsert * 0.12
            );
          }
          if (boltMesh) {
            boltMesh.position.z = emptyChamber && isPistol ? baseBoltZ + 0.045 : baseBoltZ;
          }
        } else {
          // PHASE 4 (0.75 -> 1.00):
          // - Empty Chamber: Rack Charging Handle / Pistol Slide & release into battery!
          // - Tactical Reload (Round Chambered): Crisp Bolt-Catch Check & smooth C-Clamp re-grip!
          const s = (p - 0.75) / 0.25;
          if (magMesh) {
            magMesh.position.set(0, baseMagY, baseMagZ);
            magMesh.rotation.set(baseMagRotX, 0, 0);
          }
          if (emptyChamber || cur.def.clipSize <= 2) {
            const pullBack = s < 0.52 ? Math.sin((s / 0.52) * Math.PI * 0.5) : Math.max(0, 1 - (s - 0.52) / 0.18);
            const boltSnapFwd = s > 0.56 && s < 0.86 ? Math.sin(((s - 0.56) / 0.3) * Math.PI) : 0;
            cur.mesh.rotation.set(
              0.17 * (1 - s) + pullBack * 0.06 - boltSnapFwd * 0.07,
              0.22 * (1 - s) - pullBack * 0.06,
              -0.28 * (1 - s) + boltSnapFwd * 0.11
            );
            cur.mesh.position.z += pullBack * 0.022 - boltSnapFwd * 0.018;
            if (boltMesh) {
              boltMesh.position.z = baseBoltZ + pullBack * (isPistol ? 0.055 : 0.074);
            }
            if (leftArm && lBasePos && lBaseRot) {
              const reachBolt = s < 0.68 ? Math.sin(Math.min(1, s / 0.45) * Math.PI * 0.5) : 1 - (s - 0.68) / 0.32;
              leftArm.position.set(
                THREE.MathUtils.lerp(lBasePos.x, isAkRockMag ? 0.025 : -0.022, reachBolt),
                THREE.MathUtils.lerp(lBasePos.y, 0.032, reachBolt),
                THREE.MathUtils.lerp(lBasePos.z, baseBoltZ + 0.05 + pullBack * 0.065, reachBolt)
              );
              leftArm.rotation.set(
                THREE.MathUtils.lerp(lBaseRot.x, 0.58, reachBolt),
                THREE.MathUtils.lerp(lBaseRot.y, isAkRockMag ? 0.68 : 0.42, reachBolt),
                THREE.MathUtils.lerp(lBaseRot.z, -0.35, reachBolt)
              );
            }
          } else {
            // Tactical reload (chamber already hot): smooth return from magwell to C-clamp foregrip
            const easeHome = s * s * (3 - 2 * s);
            const settleBump = Math.sin(s * Math.PI) * 0.04;
            cur.mesh.rotation.set(
              0.17 * (1 - easeHome) - settleBump * 0.4,
              0.22 * (1 - easeHome),
              -0.28 * (1 - easeHome) + settleBump
            );
            if (boltMesh) boltMesh.position.z = baseBoltZ;
            if (leftArm && lBasePos && lBaseRot) {
              const seatY = isTopMagP90 ? baseMagY + 0.04 : baseMagY - 0.035;
              leftArm.position.set(
                THREE.MathUtils.lerp(-0.035, lBasePos.x, easeHome),
                THREE.MathUtils.lerp(seatY, lBasePos.y, easeHome),
                THREE.MathUtils.lerp(baseMagZ + 0.052, lBasePos.z, easeHome)
              );
              leftArm.rotation.set(
                THREE.MathUtils.lerp(-0.06, lBaseRot.x, easeHome),
                THREE.MathUtils.lerp(0.38, lBaseRot.y, easeHome),
                THREE.MathUtils.lerp(-0.22, lBaseRot.z, easeHome)
              );
            }
          }
          if (rightArm && rBasePos && rBaseRot) {
            rightArm.position.copy(rBasePos);
            rightArm.rotation.copy(rBaseRot);
          }
        }
      } else if (this.slowReloading && cur.mags && cur.def.clipSize > 1) {
        // Tarkov Slow Reload Animation: Gun lowers & cants while Left Hand presses individual
        // gleaming 3D brass cartridges down into the detached Magazine's top feed lips!
        const bp = THREE.MathUtils.clamp(this.magPackProgress || 0, 0, 1);
        const pressWave = Math.sin(bp * Math.PI);
        cur.mesh.rotation.set(0.22 + pressWave * 0.04, -0.22, 0.36);
        cur.mesh.position.x += 0.05;
        cur.mesh.position.y -= 0.04 + pressWave * 0.01;

        if (magMesh) {
          magMesh.position.set(-0.075, -0.015 - pressWave * 0.016, -0.17);
          magMesh.rotation.set(0.42, 0.28, -0.18);
        }
        if (packBulletMesh) {
          packBulletMesh.visible = true;
          packBulletMesh.position.set(
            -0.075 + (1 - bp) * 0.028,
            0.095 - bp * 0.038,
            -0.165
          );
          packBulletMesh.rotation.set(0.35 - bp * 0.25, 0.22, 0);
        }
        if (leftArm) {
          leftArm.position.set(-0.085, 0.055 - pressWave * 0.032, -0.15);
          leftArm.rotation.set(0.55 + pressWave * 0.18, 0.35, -0.2);
        }
        if (boltMesh) boltMesh.position.z = baseBoltZ;
      } else if (this.inspectTimer > 0 && !this.isFiring && this.adsAmount < 0.15) {
        // ─── CS2 WEAPON & KNIFE INSPECT ANIMATION ([F] / [V]) ──────────────────
        this.inspectTimer = Math.max(0, this.inspectTimer - dt);
        if (packBulletMesh) packBulletMesh.visible = false;
        const totalInsp = this.inspectTotalTime || 3.2;
        const p = THREE.MathUtils.clamp(1 - this.inspectTimer / totalInsp, 0, 1);
        const knifePivot = animRefs.knifePivot;

        if (cur.def.type === 'hammer' && cur.def.skinFinish === 'karambit' && knifePivot) {
          // CS2 Karambit Finger-Ring Spin Inspect (720° double spin around index finger ring!)
          const env = Math.sin(p * Math.PI);
          const spinAngle = Math.sin(p * Math.PI * 0.5) * Math.PI * 4.0;
          cur.mesh.position.x -= 0.08 * env;
          cur.mesh.position.y += 0.045 * env;
          cur.mesh.rotation.set(0.15 * env, 0.28 * env, -0.18 * env);
          const bRot = knifePivot.userData.baseRot || new THREE.Euler(-0.18, -0.24, 0.1);
          knifePivot.rotation.set(bRot.x + spinAngle, bRot.y + 0.25 * env, bRot.z);
        } else if (cur.def.type === 'hammer' && cur.def.skinFinish === 'butterfly' && knifePivot) {
          // CS2 Butterfly Knife Balisong Fan-Flip Inspect (articulated Safe & Bite handles!)
          const env = Math.sin(p * Math.PI);
          const flipWave = Math.sin(p * Math.PI * 3.0);
          cur.mesh.position.x -= 0.08 * env;
          cur.mesh.position.y += 0.04 * env;
          cur.mesh.rotation.set(0.18 * env, 0.35 * Math.sin(p * Math.PI * 2), -0.22 * env);
          const bRot = knifePivot.userData.baseRot || new THREE.Euler(-0.28, -0.18, 0.06);
          knifePivot.rotation.set(
            bRot.x + Math.sin(p * Math.PI * 2) * 0.65,
            bRot.y + p * Math.PI * 2,
            bRot.z
          );
          const safeH = animRefs.baliSafeHandle;
          const biteH = animRefs.baliBiteHandle;
          if (safeH) safeH.rotation.x = Math.max(0, flipWave) * 2.2 * env;
          if (biteH) biteH.rotation.x = -Math.max(0, -flipWave) * 2.4 * env;
        } else {
          // CS2 Firearm Inspect: Lift to center, tilt left side (0.0-0.48), roll to right side (0.48-0.86), settle (0.86-1.0)
          let pitch = 0;
          let yaw = 0;
          let roll = 0;
          let shiftX = 0;
          let shiftY = 0;
          if (p < 0.46) {
            const s = Math.sin((p / 0.46) * Math.PI * 0.5);
            pitch = 0.16 * s;
            yaw = 0.62 * s;
            roll = -0.48 * s;
            shiftX = -0.095 * s;
            shiftY = 0.045 * s;
          } else if (p < 0.86) {
            const u = (p - 0.46) / 0.4;
            const s = 0.5 - 0.5 * Math.cos(u * Math.PI);
            pitch = THREE.MathUtils.lerp(0.16, 0.22, s);
            yaw = THREE.MathUtils.lerp(0.62, -0.52, s);
            roll = THREE.MathUtils.lerp(-0.48, 0.54, s);
            shiftX = THREE.MathUtils.lerp(-0.095, -0.055, s);
            shiftY = THREE.MathUtils.lerp(0.045, 0.035, s);
          } else {
            const u = (p - 0.86) / 0.14;
            const s = 1 - u * u;
            pitch = 0.22 * s;
            yaw = -0.52 * s;
            roll = 0.54 * s;
            shiftX = -0.055 * s;
            shiftY = 0.035 * s;
          }
          cur.mesh.position.x += shiftX;
          cur.mesh.position.y += shiftY;
          cur.mesh.rotation.set(pitch + this.swayY, yaw + this.swayX, roll);
        }
      } else {
        this.inspectTimer = 0;
        const knifePivot = animRefs.knifePivot;
        if (knifePivot && knifePivot.userData.baseRot) {
          knifePivot.rotation.copy(knifePivot.userData.baseRot);
          const safeH = animRefs.baliSafeHandle;
          const biteH = animRefs.baliBiteHandle;
          if (safeH) safeH.rotation.x = 0;
          if (biteH) biteH.rotation.x = 0;
        }
        if (packBulletMesh) packBulletMesh.visible = false;
        // Zero pitch tilt in ADS so front sight post, rail & optic reticle stay 100% collinear with camera bore (0, 0)!
        const adsPitchTilt = 0;
        const sprRotX = sprBlend * (-0.22 + Math.sin(this.walkBobPhase) * 0.045);
        const sprRotY = sprBlend * (0.48 + Math.cos(this.walkBobPhase * 0.5) * 0.045);
        const sprRotZ = sprBlend * (0.18 + Math.sin(this.walkBobPhase * 0.5) * 0.035);
        const drawPitch = -drawFrac * 0.38;
        const drawYaw = drawFrac * 0.16;
        const drawRoll = drawFrac * 0.24;
        const bandPitch = bandageBlend * 0.28;
        const bandRoll = bandageBlend * 0.34;
        const recVisPitch = (this.recoilVisualPitch || 0) * (1 - this.adsAmount * 0.42);
        const recVisRoll = (this.recoilVisualRoll || 0) * (1 - this.adsAmount * 0.5);
        const dipPitch = (this.landingDip || 0) * 1.15 * (1 - this.adsAmount * 0.75);

        cur.mesh.rotation.set(
          this.swayY * 1.5 + adsPitchTilt + sprRotX + drawPitch + bandPitch + recVisPitch + dipPitch,
          this.swayX * 1.5 + sprRotY + drawYaw,
          cantedRoll + sprRotZ + drawRoll + bandRoll + recVisRoll
        );
        if (magMesh) {
          magMesh.position.set(0, baseMagY, baseMagZ);
          magMesh.rotation.set(baseMagRotX, 0, 0);
        }
        if (boltMesh) {
          // Live reciprocating bolt-carrier / pistol-slide blowback + last-round pistol slide lock-back!
          const liveCycle =
            (this.boltCycleTimer || 0) > 0
              ? Math.sin(THREE.MathUtils.clamp((this.boltCycleTimer || 0) / 0.09, 0, 1) * Math.PI) *
                (isPistol ? 0.052 : 0.062)
              : 0;
          const emptyLockBack =
            isPistol && cur.def.type === 'gun' && cur.clip === 0 ? 0.045 : 0;
          boltMesh.position.z = baseBoltZ + Math.max(liveCycle, emptyLockBack);
        }
        const armAdsDropY = (isPistol ? 0.058 : 0.036) * this.adsAmount;
        const armAdsPushZ = (isPistol ? 0.035 : 0.02) * this.adsAmount;
        if (leftArm && leftArm.userData.basePos) {
          const bandWrapWave =
            bandageBlend > 0 ? Math.sin((this.bandageProgress || 0) * Math.PI * 6) * 0.035 * bandageBlend : 0;
          leftArm.position.set(
            leftArm.userData.basePos.x + bandageBlend * 0.08 + bandWrapWave,
            leftArm.userData.basePos.y - armAdsDropY + bandageBlend * 0.04,
            leftArm.userData.basePos.z - armAdsPushZ + bandageBlend * 0.08
          );
          leftArm.rotation.set(
            leftArm.userData.baseRot.x + bandageBlend * 0.45,
            leftArm.userData.baseRot.y - bandageBlend * 0.2,
            leftArm.userData.baseRot.z
          );
        }
        if (rightArm && rightArm.userData.basePos) {
          rightArm.position.set(
            rightArm.userData.basePos.x,
            rightArm.userData.basePos.y - armAdsDropY,
            rightArm.userData.basePos.z - armAdsPushZ - (this.recoilKickZ || 0) * 0.18
          );
          rightArm.rotation.copy(rightArm.userData.baseRot);
        }
        if (cur.def.isBow || cur.def.isCrossbow) {
          animateBowOrCrossbowMesh(
            cur.mesh,
            0,
            this.adsAmount,
            Boolean(cur.def.isCrossbow),
            Boolean(this.fireArrowsActive)
          );
        }
      }

      // ─── MOUNT & BLADE ZWEIHÄNDER, LONGSWORD, POLEARM & SHIELD WALL KINEMATICS ───
      if (cur.def && cur.def.type === 'melee_sword') {
        const swordPivot = animRefs.swordPivot;
        const shieldPivot = animRefs.shieldPivot;
        const scabbardPivot = animRefs.scabbardPivot;
        const swingTrail = animRefs.swordSwingTrail;
        const is2HSword = Boolean(cur.def.isTwoHandedSword);
        const isPolearm = Boolean(cur.def.isPolearm);
        const is2HShield = Boolean(cur.def.isTwoHandedShield);

        // Update directional guard from WASD strafe if mouse hasn't overridden it in the last 450ms
        if (performance.now() - (this._meleeDirInputTime || 0) > 450) {
          if (this.keys['KeyA'] && !this.keys['KeyD']) this.meleeGuardDir = 'LEFT';
          else if (this.keys['KeyD'] && !this.keys['KeyA']) this.meleeGuardDir = 'RIGHT';
          else if ((this.pitch || 0) > 0.22) this.meleeGuardDir = 'UP';
          else if ((this.pitch || 0) < -0.22) this.meleeGuardDir = 'DOWN';
        }
        const guardDir = this.meleeGuardDir || 'RIGHT';

        if ((this.swordSwingTimer || 0) > 0) {
          this.swordSwingTimer = Math.max(0, this.swordSwingTimer - dt);
        }
        if ((this.shieldBlockKick || 0) > 0) {
          this.shieldBlockKick = Math.max(0, this.shieldBlockKick - dt * 3.8);
        }
        const blockKick = this.shieldBlockKick || 0;
        const isSwinging = (this.swordSwingTimer || 0) > 0;
        const targetSlung =
          !isSwinging && !this.isAds && (this.swordSlung || (sprinting && !this.isFiring))
            ? 1.0
            : 0.0;
        this.swordSlungBlend = THREE.MathUtils.lerp(
          this.swordSlungBlend ?? 0,
          targetSlung,
          Math.min(1, dt * 10.5)
        );

        if (swordPivot && swordPivot.userData.basePos && swordPivot.userData.baseRot) {
          const bPos = swordPivot.userData.basePos;
          const bRot = swordPivot.userData.baseRot;

          if (isSwinging) {
            const dur = this.swordSwingDuration || (is2HSword ? 0.56 : 0.44);
            const p = THREE.MathUtils.clamp(1.0 - this.swordSwingTimer / dur, 0, 1);
            const swingType = this.swordSwingType || 'RIGHT_SLASH';
            // Show metallic swing-arc trail ribbon during the power release phase (0.22..0.74)
            if (swingTrail && swingTrail.material) {
              const inRelease = p >= 0.22 && p <= 0.74;
              swingTrail.material.opacity = inRelease
                ? Math.sin(((p - 0.22) / 0.52) * Math.PI) * 0.46
                : 0.0;
            }

            if (swingType === 'SHIELD_BASH_RIPOSTE') {
              // Mount & Blade Shield Bash + Quick Under-Rim Sword Riposte Thrust (when attacking while holding RMB shield block!)
              const lunge = Math.sin(p * Math.PI);
              swordPivot.position.set(
                THREE.MathUtils.lerp(bPos.x, 0.1, lunge),
                THREE.MathUtils.lerp(bPos.y, -0.08, lunge),
                THREE.MathUtils.lerp(bPos.z, -0.68, lunge)
              );
              swordPivot.rotation.set(
                THREE.MathUtils.lerp(bRot.x, -1.52, lunge),
                THREE.MathUtils.lerp(bRot.y, 0.08, lunge),
                THREE.MathUtils.lerp(bRot.z, -0.15, lunge)
              );
            } else if (swingType === 'OVERHEAD_CLEAVE') {
              // Mount & Blade High 'Vom Tag' Roof Chamber -> Explosive Two-Handed Vertical Oberhau Downward Cleave!
              if (p < 0.26) {
                const s = Math.sin(((p / 0.26) * Math.PI) * 0.5);
                swordPivot.position.set(
                  THREE.MathUtils.lerp(bPos.x, is2HSword ? -0.02 : 0.04, s),
                  THREE.MathUtils.lerp(bPos.y, is2HSword ? 0.28 : 0.24, s),
                  THREE.MathUtils.lerp(bPos.z, -0.18, s)
                );
                swordPivot.rotation.set(
                  THREE.MathUtils.lerp(bRot.x, is2HSword ? 1.08 : 0.92, s),
                  THREE.MathUtils.lerp(bRot.y, is2HSword ? -0.12 : 0.0, s),
                  THREE.MathUtils.lerp(bRot.z, is2HSword ? -0.14 : 0.04, s)
                );
              } else if (p < 0.68) {
                const s = (p - 0.26) / 0.42;
                const fast = 1 - Math.pow(1 - s, 3.2);
                const forwardArc = Math.sin(s * Math.PI);
                swordPivot.position.set(
                  THREE.MathUtils.lerp(is2HSword ? -0.02 : 0.04, -0.04, fast),
                  THREE.MathUtils.lerp(is2HSword ? 0.28 : 0.24, -0.42, fast),
                  THREE.MathUtils.lerp(-0.18, is2HSword ? -0.62 : -0.52, forwardArc)
                );
                swordPivot.rotation.set(
                  THREE.MathUtils.lerp(is2HSword ? 1.08 : 0.92, -1.78, fast),
                  THREE.MathUtils.lerp(is2HSword ? -0.12 : 0.0, 0.08, fast),
                  THREE.MathUtils.lerp(is2HSword ? -0.14 : 0.04, 0.1, fast)
                );
              } else {
                const s = (p - 0.68) / 0.32;
                const easeOut = s * s * (3 - 2 * s);
                swordPivot.position.set(
                  THREE.MathUtils.lerp(-0.04, bPos.x, easeOut),
                  THREE.MathUtils.lerp(-0.42, bPos.y, easeOut),
                  THREE.MathUtils.lerp(-0.36, bPos.z, easeOut)
                );
                swordPivot.rotation.set(
                  THREE.MathUtils.lerp(-1.78, bRot.x, easeOut),
                  THREE.MathUtils.lerp(0.08, bRot.y, easeOut),
                  THREE.MathUtils.lerp(0.1, bRot.z, easeOut)
                );
              }
            } else if (swingType === 'THRUST_LUNGE') {
              // Mount & Blade Half-Sword / Ochs Point Chamber -> Deep Linear Estoc Piercing Thrust!
              if (p < 0.24) {
                const s = Math.sin(((p / 0.24) * Math.PI) * 0.5);
                swordPivot.position.set(
                  THREE.MathUtils.lerp(bPos.x, is2HSword ? 0.14 : 0.19, s),
                  THREE.MathUtils.lerp(bPos.y, -0.12, s),
                  THREE.MathUtils.lerp(bPos.z, -0.1, s)
                );
                swordPivot.rotation.set(
                  THREE.MathUtils.lerp(bRot.x, -1.5, s),
                  THREE.MathUtils.lerp(bRot.y, -0.05, s),
                  THREE.MathUtils.lerp(bRot.z, is2HSword ? -0.35 : 0.0, s)
                );
              } else if (p < 0.68) {
                const s = (p - 0.24) / 0.44;
                const lunge = Math.sin(s * Math.PI * 0.68);
                swordPivot.position.set(
                  THREE.MathUtils.lerp(is2HSword ? 0.14 : 0.19, 0.0, lunge),
                  THREE.MathUtils.lerp(-0.12, -0.05, lunge),
                  THREE.MathUtils.lerp(-0.1, isPolearm ? -0.86 : is2HSword ? -0.78 : -0.7, lunge)
                );
                swordPivot.rotation.set(-1.57, 0.0, is2HSword ? -0.18 * (1 - lunge) : 0.0);
              } else {
                const s = (p - 0.68) / 0.32;
                const easeOut = s * s * (3 - 2 * s);
                swordPivot.position.set(
                  THREE.MathUtils.lerp(0.0, bPos.x, easeOut),
                  THREE.MathUtils.lerp(-0.05, bPos.y, easeOut),
                  THREE.MathUtils.lerp(is2HSword ? -0.78 : -0.7, bPos.z, easeOut)
                );
                swordPivot.rotation.set(
                  THREE.MathUtils.lerp(-1.57, bRot.x, easeOut),
                  THREE.MathUtils.lerp(0.0, bRot.y, easeOut),
                  THREE.MathUtils.lerp(0.0, bRot.z, easeOut)
                );
              }
            } else if (swingType === 'LEFT_SWEEP') {
              // Mount & Blade Left Shoulder Chamber -> Wide Two-Handed Left-to-Right Horizontal Zornhau Cleave!
              if (p < 0.25) {
                const s = Math.sin(((p / 0.25) * Math.PI) * 0.5);
                swordPivot.position.set(
                  THREE.MathUtils.lerp(bPos.x, is2HSword ? -0.34 : -0.26, s),
                  THREE.MathUtils.lerp(bPos.y, 0.04, s),
                  THREE.MathUtils.lerp(bPos.z, -0.2, s)
                );
                swordPivot.rotation.set(
                  THREE.MathUtils.lerp(bRot.x, 0.18, s),
                  THREE.MathUtils.lerp(bRot.y, is2HSword ? 0.96 : 0.75, s),
                  THREE.MathUtils.lerp(bRot.z, is2HSword ? 1.42 : 1.24, s)
                );
              } else if (p < 0.68) {
                const s = (p - 0.25) / 0.43;
                const fast = 1 - Math.pow(1 - s, 3.2);
                const reachOut = Math.sin(s * Math.PI);
                swordPivot.position.set(
                  THREE.MathUtils.lerp(is2HSword ? -0.34 : -0.26, is2HSword ? 0.44 : 0.36, fast),
                  THREE.MathUtils.lerp(0.04, -0.18, fast),
                  THREE.MathUtils.lerp(-0.2, is2HSword ? -0.58 : -0.46, reachOut)
                );
                swordPivot.rotation.set(
                  THREE.MathUtils.lerp(0.18, -0.85, fast),
                  THREE.MathUtils.lerp(is2HSword ? 0.96 : 0.75, is2HSword ? -1.12 : -0.88, fast),
                  THREE.MathUtils.lerp(is2HSword ? 1.42 : 1.24, is2HSword ? -1.48 : -1.32, fast)
                );
              } else {
                const s = (p - 0.68) / 0.32;
                const easeOut = s * s * (3 - 2 * s);
                swordPivot.position.set(
                  THREE.MathUtils.lerp(is2HSword ? 0.44 : 0.36, bPos.x, easeOut),
                  THREE.MathUtils.lerp(-0.18, bPos.y, easeOut),
                  THREE.MathUtils.lerp(-0.34, bPos.z, easeOut)
                );
                swordPivot.rotation.set(
                  THREE.MathUtils.lerp(-0.85, bRot.x, easeOut),
                  THREE.MathUtils.lerp(is2HSword ? -1.12 : -0.88, bRot.y, easeOut),
                  THREE.MathUtils.lerp(is2HSword ? -1.48 : -1.32, bRot.z, easeOut)
                );
              }
            } else {
              // Mount & Blade Right Shoulder Chamber -> Wide Two-Handed Right-to-Left Forehand Zornhau Cleave!
              if (p < 0.25) {
                const s = Math.sin(((p / 0.25) * Math.PI) * 0.5);
                swordPivot.position.set(
                  THREE.MathUtils.lerp(bPos.x, is2HSword ? 0.38 : 0.32, s),
                  THREE.MathUtils.lerp(bPos.y, 0.14, s),
                  THREE.MathUtils.lerp(bPos.z, -0.2, s)
                );
                swordPivot.rotation.set(
                  THREE.MathUtils.lerp(bRot.x, 0.42, s),
                  THREE.MathUtils.lerp(bRot.y, is2HSword ? -0.92 : -0.68, s),
                  THREE.MathUtils.lerp(bRot.z, is2HSword ? -1.24 : -0.98, s)
                );
              } else if (p < 0.68) {
                const s = (p - 0.25) / 0.43;
                const fast = 1 - Math.pow(1 - s, 3.2);
                const reachOut = Math.sin(s * Math.PI);
                swordPivot.position.set(
                  THREE.MathUtils.lerp(is2HSword ? 0.38 : 0.32, is2HSword ? -0.38 : -0.3, fast),
                  THREE.MathUtils.lerp(0.14, -0.26, fast),
                  THREE.MathUtils.lerp(-0.2, is2HSword ? -0.58 : -0.46, reachOut)
                );
                swordPivot.rotation.set(
                  THREE.MathUtils.lerp(0.42, -1.02, fast),
                  THREE.MathUtils.lerp(is2HSword ? -0.92 : -0.68, is2HSword ? 1.08 : 0.82, fast),
                  THREE.MathUtils.lerp(is2HSword ? -1.24 : -0.98, is2HSword ? 1.42 : 1.22, fast)
                );
              } else {
                const s = (p - 0.68) / 0.32;
                const easeOut = s * s * (3 - 2 * s);
                swordPivot.position.set(
                  THREE.MathUtils.lerp(is2HSword ? -0.38 : -0.3, bPos.x, easeOut),
                  THREE.MathUtils.lerp(-0.26, bPos.y, easeOut),
                  THREE.MathUtils.lerp(-0.34, bPos.z, easeOut)
                );
                swordPivot.rotation.set(
                  THREE.MathUtils.lerp(-1.02, bRot.x, easeOut),
                  THREE.MathUtils.lerp(is2HSword ? 1.08 : 0.82, bRot.y, easeOut),
                  THREE.MathUtils.lerp(is2HSword ? 1.42 : 1.22, bRot.z, easeOut)
                );
              }
            }
          } else {
            if (swingTrail && swingTrail.material) {
              swingTrail.material.opacity = 0.0;
            }
            // Non-Swinging Pose: Slung Scabbard vs. Active Mount & Blade Directional Parry / Guard (Hold RMB)!
            const sb = this.swordSlungBlend || 0;
            const guardAmt = this.adsAmount || 0;

            if (guardAmt > 0.02 && is2HSword) {
              // ─── ZWEIHÄNDER 4-DIRECTIONAL MOUNT & BLADE PARRY / GUARD STANCES (HOLD RMB) ───
              // Left hand slides up onto the leather Ricasso above the crossguard to brace the blade!
              let gx = -0.02;
              let gy = -0.06;
              let gz = -0.25 + blockKick * 0.25;
              let grx = 0.22 - blockKick * 0.6;
              let gry = 0.16;
              let grz = -0.72;
              if (guardDir === 'UP') {
                // High Roof Guard ('Dach' / 'Kron' Overhead Parry): Crossguard raised horizontally across upper view!
                gx = -0.08;
                gy = 0.06;
                gz = -0.25 + blockKick * 0.25;
                grx = 0.32 - blockKick * 0.5;
                gry = 0.22;
                grz = -1.28;
              } else if (guardDir === 'LEFT') {
                // Left Hanging Guard ('Ochs Left' Flank Parry): Hilt shifted left, blade vertical/angled on left!
                gx = -0.15;
                gy = -0.07;
                gz = -0.25 + blockKick * 0.25;
                grx = 0.18 - blockKick * 0.5;
                gry = 0.48;
                grz = -0.34;
              } else if (guardDir === 'RIGHT') {
                // Right Hanging Guard ('Ochs Right' Flank Parry): Hilt braced right, crossguard & parry hooks vertical!
                gx = 0.12;
                gy = -0.07;
                gz = -0.25 + blockKick * 0.25;
                grx = 0.18 - blockKick * 0.5;
                gry = -0.45;
                grz = 0.38;
              }
              swordPivot.position.set(
                THREE.MathUtils.lerp(bPos.x, gx, guardAmt),
                THREE.MathUtils.lerp(bPos.y, gy, guardAmt),
                THREE.MathUtils.lerp(bPos.z, gz, guardAmt)
              );
              swordPivot.rotation.set(
                THREE.MathUtils.lerp(bRot.x, grx, guardAmt),
                THREE.MathUtils.lerp(bRot.y, gry, guardAmt),
                THREE.MathUtils.lerp(bRot.z, grz, guardAmt)
              );
            } else if (guardAmt > 0.02 && isPolearm) {
              // ─── POLEARM / LANCE TWO-HANDED ANTI-CAVALRY COUCHED SPEAR BRACE (HOLD RMB) ───
              swordPivot.position.set(
                THREE.MathUtils.lerp(bPos.x, 0.05, guardAmt),
                THREE.MathUtils.lerp(bPos.y, -0.09, guardAmt),
                THREE.MathUtils.lerp(bPos.z, -0.28 + blockKick * 0.22, guardAmt)
              );
              swordPivot.rotation.set(
                THREE.MathUtils.lerp(bRot.x, -1.42 - blockKick * 0.35, guardAmt),
                THREE.MathUtils.lerp(bRot.y, 0.14, guardAmt),
                THREE.MathUtils.lerp(bRot.z, -0.28, guardAmt)
              );
            } else if (guardAmt > 0.02 && shieldPivot) {
              // ─── 1H SWORD & HEATER SHIELD: SIDE-RIM RIPOSTE GUARD WHILE SHIELD IS RAISED ───
              // Sword cocks back along the right rim of the raised Heater Shield, poised to thrust around the shield!
              swordPivot.position.set(
                THREE.MathUtils.lerp(bPos.x, 0.19, guardAmt),
                THREE.MathUtils.lerp(bPos.y, -0.09, guardAmt),
                THREE.MathUtils.lerp(bPos.z, -0.22, guardAmt)
              );
              swordPivot.rotation.set(
                THREE.MathUtils.lerp(bRot.x, -0.68, guardAmt),
                THREE.MathUtils.lerp(bRot.y, -0.24, guardAmt),
                THREE.MathUtils.lerp(bRot.z, -0.22, guardAmt)
              );
            } else {
              // Default Idle / Slung Scabbard Pose
              swordPivot.position.set(
                THREE.MathUtils.lerp(bPos.x, -0.18, sb),
                THREE.MathUtils.lerp(bPos.y, -0.22, sb),
                THREE.MathUtils.lerp(bPos.z, -0.27, sb)
              );
              swordPivot.rotation.set(
                THREE.MathUtils.lerp(bRot.x, 2.28, sb),
                THREE.MathUtils.lerp(bRot.y, 0.32, sb),
                THREE.MathUtils.lerp(bRot.z, -0.68, sb)
              );
            }
          }

          if (rightArm && rightArm.userData.basePos) {
            rightArm.position.set(
              swordPivot.position.x + (is2HSword ? 0.02 : 0),
              swordPivot.position.y - 0.03,
              swordPivot.position.z + 0.06
            );
            rightArm.rotation.set(
              swordPivot.rotation.x * 0.35,
              swordPivot.rotation.y * 0.35,
              swordPivot.rotation.z * 0.35
            );
          }
          // On 2H Zweihänder & Polearm, animate Left Hand along the lower Pommel OR up on the leather Ricasso when Parrying/Thrusting!
          if ((is2HSword || isPolearm) && leftArm && leftArm.userData.basePos) {
            const halfSwordGrip =
              (this.adsAmount || 0) > 0.25 || (isSwinging && this.swordSwingType === 'THRUST_LUNGE');
            const gripOffsetLocal = halfSwordGrip
              ? new THREE.Vector3(0, 0.16, 0.02) // Left hand gripping the leather Ricasso above crossguard!
              : new THREE.Vector3(0, -0.15, 0.03); // Left hand gripping the lower two-handed pommel!
            gripOffsetLocal.applyEuler(swordPivot.rotation);
            leftArm.position.set(
              swordPivot.position.x + gripOffsetLocal.x - 0.03,
              swordPivot.position.y + gripOffsetLocal.y - 0.02,
              swordPivot.position.z + gripOffsetLocal.z + 0.05
            );
            leftArm.rotation.set(
              swordPivot.rotation.x * 0.4,
              swordPivot.rotation.y * 0.4,
              swordPivot.rotation.z * 0.4
            );
          }
        }

        if (scabbardPivot && scabbardPivot.userData.basePos) {
          const sb = this.swordSlungBlend || 0;
          scabbardPivot.position.set(
            THREE.MathUtils.lerp(-0.22, -0.16, sb),
            THREE.MathUtils.lerp(-0.26, -0.18, sb),
            -0.27
          );
        }

        if (shieldPivot && shieldPivot.userData.basePos && shieldPivot.userData.baseRot) {
          const sbPos = shieldPivot.userData.basePos;
          const sbRot = shieldPivot.userData.baseRot;
          const guardAmt = this.adsAmount || 0;
          // When bashing with 2H Pavise Shield or 1H Shield Bash Riposte, thrust the shield boss forward!
          const bashPulse =
            isSwinging &&
            (is2HShield || this.swordSwingType === 'SHIELD_BASH_RIPOSTE')
              ? Math.sin(
                  THREE.MathUtils.clamp(
                    1.0 - (this.swordSwingTimer || 0) / (this.swordSwingDuration || 0.42),
                    0,
                    1
                  ) * Math.PI
                )
              : 0;
          // 1H Heater Shield tilts slightly down (-0.075 Y) when raised so you see clearly over the top brass rim;
          // 2H Large Pavise Shield centers at (-0.085 Y) so your eye looks directly through the armored viewing slit!
          const targetShieldX = is2HShield ? 0.0 : -0.075;
          const targetShieldY = is2HShield ? -0.085 : -0.072;
          const targetShieldZ = (is2HShield ? -0.26 : -0.25) - bashPulse * 0.24 + blockKick * 0.18;
          shieldPivot.position.set(
            THREE.MathUtils.lerp(sbPos.x, targetShieldX, guardAmt),
            THREE.MathUtils.lerp(sbPos.y, targetShieldY, guardAmt),
            THREE.MathUtils.lerp(sbPos.z, targetShieldZ, Math.max(guardAmt, bashPulse))
          );
          shieldPivot.rotation.set(
            THREE.MathUtils.lerp(sbRot.x, 0.04 - blockKick * 0.35 + bashPulse * 0.18, guardAmt),
            THREE.MathUtils.lerp(sbRot.y, is2HShield ? 0.0 : 0.08, guardAmt),
            THREE.MathUtils.lerp(sbRot.z, 0.0, guardAmt)
          );
          if (leftArm && leftArm.userData.basePos && !is2HSword && !isPolearm) {
            leftArm.position.set(
              shieldPivot.position.x - 0.02,
              shieldPivot.position.y - 0.03,
              shieldPivot.position.z + 0.07
            );
          }
        }
      }

      // Keep the 3D weapon body (receiver, Picatinny rail, handguard, barrel, iron sights & hands) visible
      // in ADS view while hiding only the 3D sight box once a mounted 2D optic overlay takes over!
      cur.mesh.visible = true;
      const opticSight = animRefs.opticSight;
      if (opticSight) {
        opticSight.visible = !(cur.def.opticType && this.adsAmount > 0.55);
      }

      const flash = animRefs.muzzleFlash;
      if (flash) {
        const fMult = cur.def.flashMult !== undefined ? cur.def.flashMult : 1.0;
        if (this.muzzleFlashTimer > 0 && fMult > 0) {
          this.muzzleFlashTimer -= dt;
          const baseOp = this.isAds ? 0.24 : 0.65;
          flash.material.opacity = baseOp * fMult;
          const fScale = (this.isAds ? 0.52 : 0.92) * (0.4 + 0.6 * fMult);
          flash.scale.setScalar(fScale);
          flash.rotation.z = Math.random() * Math.PI;
        } else {
          flash.material.opacity = 0;
        }
      }
    }
  }

  moveWithVoxelCollision(dt) {
    const horizStepDist = Math.hypot(this.vel.x, this.vel.z) * dt;
    if (horizStepDist > 0.35 && dt > 0.0005) {
      const steps = Math.min(20, Math.ceil(horizStepDist / 0.35));
      const subDt = dt / steps;
      for (let i = 0; i < steps; i++) {
        this._moveWithVoxelCollisionStep(subDt);
      }
      return;
    }
    this._moveWithVoxelCollisionStep(dt);
  }

  _moveWithVoxelCollisionStep(dt) {
    const radius = 0.4;
    const height = this.prone ? 0.65 : this.crouching ? 1.15 : 1.7;

    // Self-unstuck guard if ever overlapping a voxel at current position:
    // only lift vertically if inside a building staircase; otherwise push horizontally out of chest walls!
    if (this.checkBodyOverlap(this.pos.x, this.pos.y, this.pos.z, radius, height)) {
      if (this.isInteriorStairStep(this.pos.x, this.pos.y, this.pos.z, radius)) {
        this.pos.y += VOXEL_SIZE * 0.55;
      } else {
        this.resolveHorizontalOverlap(radius, height);
      }
    }

    // X Movement (never auto-jump/step onto Chest Walls or fortifications — only interior building stairs!)
    const nextX = this.pos.x + this.vel.x * dt;
    const terrainAtNextX = this.world.getGroundHeightAt(nextX, this.pos.z);
    const supportAtNextX = this.getSupportSurfaceY(nextX, this.pos.y, this.pos.z, radius);
    const stepTestY_X = Math.max(this.pos.y, terrainAtNextX);
    if (!this.checkBodyOverlap(nextX, stepTestY_X, this.pos.z, radius, height)) {
      this.pos.x = nextX;
      if (this.isGrounded && Math.abs(supportAtNextX - this.pos.y) < 0.55) {
        this.pos.y = supportAtNextX;
      }
    } else if (
      this.isGrounded &&
      this.isInteriorStairStep(nextX, this.pos.y, this.pos.z, radius) &&
      !this.checkBodyOverlap(nextX, this.pos.y + VOXEL_SIZE + 0.1, this.pos.z, radius, height)
    ) {
      this.pos.x = nextX;
      this.pos.y += VOXEL_SIZE + 0.1;
    }

    // Z Movement (never auto-jump/step onto Chest Walls or fortifications — only interior building stairs!)
    const nextZ = this.pos.z + this.vel.z * dt;
    const terrainAtNextZ = this.world.getGroundHeightAt(this.pos.x, nextZ);
    const supportAtNextZ = this.getSupportSurfaceY(this.pos.x, this.pos.y, nextZ, radius);
    const stepTestY_Z = Math.max(this.pos.y, terrainAtNextZ);
    if (!this.checkBodyOverlap(this.pos.x, stepTestY_Z, nextZ, radius, height)) {
      this.pos.z = nextZ;
      if (this.isGrounded && Math.abs(supportAtNextZ - this.pos.y) < 0.55) {
        this.pos.y = supportAtNextZ;
      }
    } else if (
      this.isGrounded &&
      this.isInteriorStairStep(this.pos.x, this.pos.y, nextZ, radius) &&
      !this.checkBodyOverlap(this.pos.x, this.pos.y + VOXEL_SIZE + 0.1, nextZ, radius, height)
    ) {
      this.pos.z = nextZ;
      this.pos.y += VOXEL_SIZE + 0.1;
    }

    // Y Movement (3D Terrain + Voxel Floors/Roofs/Chest-Wall Tops)
    const supportY = this.getSupportSurfaceY(this.pos.x, this.pos.y, this.pos.z, radius);
    const nextY = this.pos.y + this.vel.y * dt;

    if (this.vel.y > 0) {
      // Jumping UPWARD: only stop if hitting an overhead ceiling/roof above the player's waist/head!
      // Never let a ground-level chest wall around the feet/legs cancel upward jump velocity!
      if (!this.checkOverheadCeilingOverlap(this.pos.x, nextY, this.pos.z, radius, height)) {
        this.pos.y = nextY;
        this.isGrounded = false;
      } else {
        this.vel.y = 0;
      }
    } else if (nextY <= supportY) {
      // Check high-velocity freefall impact for lethal/heavy Fall Damage if parachute was not deployed or was cut!
      const impactVelY = -this.vel.y;
      this.pos.y = supportY;
      this.vel.y = 0;
      this.isGrounded = true;
      this.parachuteCut = false;
      if (!this.parachuting) {
        this.parachuteFSM?.send(PLAYER_PARACHUTE_EVENTS.LAND_GROUND);
      }
      if (!this.parachuting && impactVelY > 15.5 && !this.dead && !this.downed) {
        const fallDmg = Math.round((impactVelY - 14.2) * 8.5);
        this.addShake(Math.min(1.0, fallDmg / 90));
        if (typeof this.takeDamage === 'function') {
          this.takeDamage(fallDmg, 'FALL DAMAGE', this.team === 'US' ? 'RU' : 'US', false, null, 'GROUND IMPACT (NO PARACHUTE)');
        }
      }
    } else if (!this.checkBodyOverlap(this.pos.x, nextY, this.pos.z, radius, height)) {
      this.pos.y = nextY;
      this.isGrounded = false;
    } else {
      const impactVelY = -this.vel.y;
      const topY = this.getHighestOverlappingVoxelTop(this.pos.x, nextY, this.pos.z, radius, 1.35);
      if (topY !== null && topY <= this.pos.y + 0.35) {
        this.pos.y = topY;
      }
      this.isGrounded = true;
      this.vel.y = 0;
      this.parachuteCut = false;
      if (!this.parachuting) {
        this.parachuteFSM?.send(PLAYER_PARACHUTE_EVENTS.LAND_GROUND);
      }
      if (!this.parachuting && impactVelY > 15.5 && !this.dead && !this.downed) {
        const fallDmg = Math.round((impactVelY - 14.2) * 8.5);
        this.addShake(Math.min(1.0, fallDmg / 90));
        if (typeof this.takeDamage === 'function') {
          this.takeDamage(fallDmg, 'FALL DAMAGE', this.team === 'US' ? 'RU' : 'US', false, null, 'GROUND IMPACT (NO PARACHUTE)');
        }
      }
    }

    this.pos.x = Math.max(-2850, Math.min(2850, this.pos.x));
    this.pos.z = Math.max(-1850, Math.min(1850, this.pos.z));
  }

  /**
   * Returns the highest walkable surface height (terrain or top of a voxel below the player's knees)
   * at (x, z) so standing on top of a Chest Wall keeps `pos.y` at `v.maxY` (1.25m) instead of sinking!
   */
  _getVoxel(gx, gy, gz) {
    return this.world.getVoxel
      ? this.world.getVoxel(gx, gy, gz)
      : this.world.voxels.get(this.world.key(gx, gy, gz));
  }

  _hasVoxel(gx, gy, gz) {
    return this.world.hasVoxel
      ? this.world.hasVoxel(gx, gy, gz)
      : this.world.voxels.has(this.world.key(gx, gy, gz));
  }

  findActiveClimbableLadder() {
    const ladders = this.world?.climbableLadders;
    if (!Array.isArray(ladders) || ladders.length === 0) return null;
    const px = this.pos.x;
    const py = this.pos.y;
    const pz = this.pos.z;
    const wantDescendFromTop = Boolean(
      this.keys['KeyS'] || this.keys['ControlLeft'] || this.keys['ControlRight']
    );
    const wantClimb =
      Boolean(this.keys['KeyW']) ||
      Boolean(this.keys['Space']) ||
      wantDescendFromTop ||
      Boolean(this.onLadder);

    if (!wantClimb) return null;

    for (let i = 0; i < ladders.length; i++) {
      const lad = ladders[i];
      if (lad.buildingId !== null && lad.buildingId !== undefined) {
        const bld = this.world.buildings?.[lad.buildingId];
        if (bld?.collapsed) continue;
      }
      const dx = px - lad.x;
      const dz = pz - lad.z;
      const dist = Math.hypot(dx, dz);
      const rad = this.onLadder ? (lad.radius || 1.0) + 0.35 : lad.radius || 1.0;
      if (dist <= rad && py >= lad.minY - 0.5 && py <= lad.maxY - 0.02) {
        return lad;
      }
      if (wantDescendFromTop && dist <= rad + 0.4 && Math.abs(py - lad.topExitY) <= 0.45) {
        return lad;
      }
    }
    return null;
  }

  getSupportSurfaceY(x, y, z, r) {
    const world = this.world;
    const hasGetVoxel = typeof world.getVoxel === 'function';
    let bestY = world.getGroundHeightAt(x, z);

    const platforms = world.elevatedPlatforms;
    if (Array.isArray(platforms) && platforms.length > 0) {
      const climbingDown = Boolean(
        this.onLadder && (this.keys['KeyS'] || this.keys['ControlLeft'] || this.keys['ControlRight'])
      );
      for (let i = 0; i < platforms.length; i++) {
        const p = platforms[i];
        if (x + r > p.minX && x - r < p.maxX && z + r > p.minZ && z - r < p.maxZ) {
          if (
            climbingDown &&
            typeof p.holeMinX === 'number' &&
            x >= p.holeMinX - 0.3 &&
            x <= p.holeMaxX + 0.3 &&
            z >= p.holeMinZ - 0.3 &&
            z <= p.holeMaxZ + 0.3
          ) {
            continue;
          }
          if (p.topY <= y + 0.42 && p.topY > bestY) {
            bestY = p.topY;
          }
        }
      }
    }

    const minCoord = world.worldToGrid(x - r, bestY - 0.5, z - r);
    const maxCoord = world.worldToGrid(x + r, y + 0.35, z + r);
    for (let gx = minCoord.gx; gx <= maxCoord.gx; gx++) {
      for (let gy = minCoord.gy; gy <= maxCoord.gy; gy++) {
        for (let gz = minCoord.gz; gz <= maxCoord.gz; gz++) {
          const v = hasGetVoxel ? world.getVoxel(gx, gy, gz) : world.voxels.get(world.key(gx, gy, gz));
          if (!v) continue;
          if (x + r > v.minX && x - r < v.maxX && z + r > v.minZ && z - r < v.maxZ) {
            if (v.maxY <= y + 0.32 && v.maxY > bestY) {
              bestY = v.maxY;
            }
          }
        }
      }
    }
    return bestY;
  }

  /**
   * Checks ONLY for overhead ceiling blocks (`v.minY >= this.pos.y + 0.85`) when jumping upward (`vel.y > 0`),
   * so low chest walls at foot/waist level never block a player from jumping up and out!
   */
  checkOverheadCeilingOverlap(x, nextY, z, r, h) {
    const world = this.world;
    const hasGetVoxel = typeof world.getVoxel === 'function';
    const minCeilingY = this.pos.y + 0.85;
    const minCoord = world.worldToGrid(x - r, minCeilingY, z - r);
    const maxCoord = world.worldToGrid(x + r, nextY + h, z + r);
    for (let gx = minCoord.gx; gx <= maxCoord.gx; gx++) {
      for (let gy = minCoord.gy; gy <= maxCoord.gy; gy++) {
        for (let gz = minCoord.gz; gz <= maxCoord.gz; gz++) {
          const v = hasGetVoxel ? world.getVoxel(gx, gy, gz) : world.voxels.get(world.key(gx, gy, gz));
          if (!v) continue;
          if (
            v.minY >= minCeilingY &&
            x + r > v.minX &&
            x - r < v.maxX &&
            nextY + h > v.minY &&
            nextY + 0.2 < v.maxY &&
            z + r > v.minZ &&
            z - r < v.maxZ
          ) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * Returns the highest `v.maxY` among any low voxels overlapping the player's lower body (up to `maxCheckH`),
   * or `null` if none.
   */
  getHighestOverlappingVoxelTop(x, y, z, r, maxCheckH = 1.45) {
    const world = this.world;
    const hasGetVoxel = typeof world.getVoxel === 'function';
    const minCoord = world.worldToGrid(x - r, y + 0.05, z - r);
    const maxCoord = world.worldToGrid(x + r, y + maxCheckH, z + r);
    let highestTop = null;
    for (let gx = minCoord.gx; gx <= maxCoord.gx; gx++) {
      for (let gy = minCoord.gy; gy <= maxCoord.gy; gy++) {
        for (let gz = minCoord.gz; gz <= maxCoord.gz; gz++) {
          const v = hasGetVoxel ? world.getVoxel(gx, gy, gz) : world.voxels.get(world.key(gx, gy, gz));
          if (!v) continue;
          if (
            x + r > v.minX &&
            x - r < v.maxX &&
            y + maxCheckH > v.minY &&
            y + 0.05 < v.maxY &&
            z + r > v.minZ &&
            z - r < v.maxZ
          ) {
            if (highestTop === null || v.maxY > highestTop) {
              highestTop = v.maxY;
            }
          }
        }
      }
    }
    return highestTop;
  }

  /**
   * Returns true ONLY if the blocking voxel at (x, y, z) is an interior building staircase block
   * (`type === 'wood'`, `!isProp`, `!isFortification`, and inside a building footprint).
   * Prevents players from ever automatically jumping/stepping up onto Chest Walls, sandbags, or HESCO barriers!
   */
  isInteriorStairStep(x, y, z, r) {
    const world = this.world;
    if (
      !world.isInsideBuildingOrContainer ||
      !world.isInsideBuildingOrContainer(x, z, 0.25)
    ) {
      return false;
    }
    const hasGetVoxel = typeof world.getVoxel === 'function';
    const minCoord = world.worldToGrid(x - r, y + 0.2, z - r);
    const maxCoord = world.worldToGrid(x + r, y + VOXEL_SIZE + 0.05, z + r);
    let foundWoodStair = false;
    for (let gx = minCoord.gx; gx <= maxCoord.gx; gx++) {
      for (let gy = minCoord.gy; gy <= maxCoord.gy; gy++) {
        for (let gz = minCoord.gz; gz <= maxCoord.gz; gz++) {
          const v = hasGetVoxel ? world.getVoxel(gx, gy, gz) : world.voxels.get(world.key(gx, gy, gz));
          if (!v) continue;
          if (
            x + r > v.minX &&
            x - r < v.maxX &&
            y + VOXEL_SIZE + 0.05 > v.minY &&
            y + 0.2 < v.maxY &&
            z + r > v.minZ &&
            z - r < v.maxZ
          ) {
            if (v.type !== 'wood' || v.isProp || v.isFortification) {
              return false;
            }
            foundWoodStair = true;
          }
        }
      }
    }
    return foundWoodStair;
  }

  resolveHorizontalOverlap(r, h) {
    // 1. If the player's feet are already near the top of a low chest wall (within 0.35m of v.maxY),
    // snap cleanly onto the top of that wall instead of letting them sink into it!
    const lowTopY = this.getHighestOverlappingVoxelTop(this.pos.x, this.pos.y, this.pos.z, r, 1.45);
    if (
      lowTopY !== null &&
      this.pos.y >= lowTopY - 0.35 &&
      !this.checkBodyOverlap(this.pos.x, lowTopY + 0.02, this.pos.z, r, h)
    ) {
      this.pos.y = lowTopY + 0.02;
      return;
    }

    // 2. Search radially from 0.18m out to 1.85m across 8 directions (prioritizing backward away from camera look)
    const backX = Math.sin(this.yaw);
    const backZ = Math.cos(this.yaw);
    const unitDirs = [
      [backX, backZ],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [0.707, 0.707],
      [-0.707, 0.707],
      [0.707, -0.707],
      [-0.707, -0.707]
    ];
    const dists = [0.2, 0.4, 0.65, 0.9, 1.15, 1.4, 1.65, 1.9];
    for (const dist of dists) {
      for (const [ux, uz] of unitDirs) {
        const tx = this.pos.x + ux * dist;
        const tz = this.pos.z + uz * dist;
        const ty = this.world.getGroundHeightAt(tx, tz);
        const testY = Math.max(this.pos.y, ty);
        if (!this.checkBodyOverlap(tx, testY, tz, r, h)) {
          this.pos.x = tx;
          this.pos.z = tz;
          this.pos.y = testY;
          return;
        }
      }
    }

    // 3. Fallback: if completely surrounded horizontally, lift onto the top of the overlapping low voxel!
    if (lowTopY !== null && !this.checkBodyOverlap(this.pos.x, lowTopY + 0.03, this.pos.z, r, h)) {
      this.pos.y = lowTopY + 0.03;
    }
  }

  checkBodyOverlap(x, y, z, r, h) {
    const world = this.world;
    if (world.hasSolidSkyscraperHullAt && world.hasSolidSkyscraperHullAt(x, y, z, r, h)) {
      return true;
    }
    const hasGetVoxel = typeof world.getVoxel === 'function';
    const hasHasVoxel = typeof world.hasVoxel === 'function';
    const minCoord = world.worldToGrid(x - r, y + 0.25, z - r);
    const maxCoord = world.worldToGrid(x + r, y + h, z + r);

    for (let gx = minCoord.gx; gx <= maxCoord.gx; gx++) {
      for (let gy = minCoord.gy; gy <= maxCoord.gy; gy++) {
        for (let gz = minCoord.gz; gz <= maxCoord.gz; gz++) {
          if (hasHasVoxel && !world.hasVoxel(gx, gy, gz)) continue;
          const v = hasGetVoxel ? world.getVoxel(gx, gy, gz) : world.voxels.get(world.key(gx, gy, gz));
          if (!v) continue;
          if (
            x + r > v.minX &&
            x - r < v.maxX &&
            y + h > v.minY &&
            y + 0.2 < v.maxY &&
            z + r > v.minZ &&
            z - r < v.maxZ
          ) {
            return true;
          }
        }
      }
    }
    return false;
  }
}

Object.assign(
  PlayerController.prototype,
  GunsmithMethods,
  FortificationMethods,
  CommanderMethods,
  VehicleControlMethods,
  CombatMethods
);
