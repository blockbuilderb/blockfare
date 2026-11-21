import * as THREE from '../vendor/three.module.js';
import {
  WEAPON_DEFS,
  CLASS_LOADOUTS,
  ATTACHMENT_CATALOG,
  createWeaponViewModel
} from './weapons.js?v=35';
import { VOXEL_SIZE } from './world.js?v=35';
import { sound } from './audio.js?v=35';
import { PLAYER, COMBAT, PROJECTILES, DISTANCES, DEPLOYABLES } from './config.js?v=35';

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

    // Combat Cash ($) & Gunsmith / Tactical Armory Customization State
    this.cash = PLAYER.STARTING_CASH; // Starting Combat Funds ($)
    this.ownedUpgrades = new Set(['stock', 'std_mag', 'factory', 'std_grip', 'std_vest']);
    this.equippedUpgrades = {
      muzzle: 'stock',
      magazine: 'std_mag',
      optic: 'factory',
      grip: 'std_grip',
      vest: 'std_vest'
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
    this.vehiclesDestroyed = 0;
    this.captures = 0;
    this.medicKills = 0; // War Crimes (Geneva Convention: Killing Field Medics)
    this.score = 0;
    this.squad = 'ALPHA';
    this.squadShort = 'ALP';
    this.commandRank = 'COMMANDER'; // 'COMMANDER' | 'SQUAD_LEADER' | 'MEMBER'
    this.commandScope = 'ALL';      // 'ALL' (Force Commander: all 5 squads / 40 NPCs) | 'SQUAD' (Squad Leader: 8 NPCs)

    // Vehicle state
    this.activeVehicle = null;
    this.thirdPersonVehicle = false;

    // Movement & Stance (Standing / Crouched / Prone + Vaulting)
    this.keys = {};
    this.isGrounded = false;
    this.crouching = false;
    this.prone = false;
    this.vaultTimer = 0;
    this.leanTarget = 0;
    this.leanAmount = 0;
    this.walkBobPhase = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.shakeTrauma = 0;

    // Suppression System (Squad-style: incoming fire causes screen blur + sway)
    this.suppressionLevel = 0;       // 0–1 intensity
    this.suppressionDecayRate = PLAYER.SUPPRESSION_DECAY_RATE; // per second
    this.lastSuppressionHitTime = 0;

    // Kill Streak / Multi-Kill Tracking
    this.killStreak = 0;
    this.multiKillTimer = 0;
    this.multiKillCount = 0;

    // Respawn Timer
    this.respawnTimer = 0;
    this.respawnDelay = PLAYER.RESPAWN_DELAY; // seconds

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

    // Insertion Beacon (Recon Class only)
    this.insertionBeacon = null;  // { pos: Vector3, mesh: Group, spawnsLeft: 2, timer: 180 }
    this.beaconCooldown = 0;

    // Commo Rose / Quick Chat Wheel State
    this.commoRoseActive = false;
    this.lastCommoCommand = null;
    this.commoRoseCooldown = 0;

    // Combat, Optics, Zeroing, Mag Packing & Fortification Blueprints
    this.isFiring = false;
    this.isAds = false;
    this.adsAmount = 0;
    this.useCantedSight = false;
    this.zeroDistance = PLAYER.ZERO_DISTANCE_DEFAULT;
    this.fireTimer = 0;
    this.reloading = false;
    this.fastReload = false;
    this.reloadTimer = 0;
    this.magPackProgress = 0;
    this.recoilOffsetPitch = 0;
    this.recoilKickZ = 0;
    this.muzzleFlashTimer = 0;
    this.shotsFired = 0;

    this.buildBlueprints = ['CHEST WALL', 'FIRING PORT', 'SANDBAG BUNKER', 'HESCO BASTION'];
    this.buildBlueprintIndex = 0;
    this.activePing = null;
    this.nvgActive = false;

    this.slots = [];
    this.currentSlotIndex = 0;
    this.viewModelGroup = new THREE.Group();
    this.viewModelGroup.visible = false;
    this.camera.add(this.viewModelGroup);

    this.raycaster = new THREE.Raycaster();
    this.plantedC4 = [];

    this.setupInputs();
    this.equipLoadout('engineer');
  }

  setupInputs() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (this.dead) return;

      if (e.code === 'KeyN') {
        this.nvgActive = !this.nvgActive;
      }
      if (this.downed) return;

      // [E] Enter / Exit Car or Armor, or Drag Downed Friendly Soldier to cover
      if (e.code === 'KeyE' && !e.repeat) {
        this.handleVehicleAndDragKey();
      }
      // [F] Revive / Heal Ally, Pick Up Ammo from Crate, or Build Chest Wall / Point Defenses
      if (e.code === 'KeyF' && !e.repeat) {
        this.keyFHoldTime = 0;
        this.handleInteractKey();
      }
      if (e.code === 'KeyG' && !this.activeVehicle) {
        this.throwFragGrenade();
      }
      if (e.code === 'Digit1' && !this.activeVehicle) this.switchSlot(0);
      if (e.code === 'Digit2' && !this.activeVehicle) this.switchSlot(1);
      if (e.code === 'Digit3' && !this.activeVehicle) this.switchSlot(2);
      if (e.code === 'Digit4' && !this.activeVehicle) this.switchSlot(3);
      if (e.code === 'KeyR' && !this.activeVehicle) this.startReload();
      if (e.code === 'KeyV' && !this.activeVehicle) {
        const cur = this.currentWeapon();
        if (cur && cur.def.hasCantedSight) {
          this.useCantedSight = !this.useCantedSight;
        }
      }
      if (e.code === 'KeyX' && !this.activeVehicle) {
        const zeros = PLAYER.ZEROING_OPTIONS;
        const idx = (zeros.indexOf(this.zeroDistance) + 1) % zeros.length;
        this.zeroDistance = zeros[idx];
      }
      if (e.code === 'KeyB' && !this.activeVehicle) {
        this.buildBlueprintIndex = (this.buildBlueprintIndex + 1) % this.buildBlueprints.length;
      }
      // [5] Place Squad Leader Rally Point (mobile squad spawn)
      if (e.code === 'Digit5' && !this.activeVehicle) {
        this.placeRallyPoint();
      }
      // [6] Place Insertion Beacon (Recon class only)
      if (e.code === 'Digit6' && !this.activeVehicle) {
        this.placeInsertionBeacon();
      }
      // [U] Commander UAV Scan (reveals all enemies & armor in 3D + minimap + AI datalink)
      if (e.code === 'KeyU') {
        this.activateUAV();
      }
      // [J] Commander Airstrike (Shift+J cycles pattern; J calls strike at crosshair anywhere on map)
      if (e.code === 'KeyJ') {
        if (e.shiftKey) {
          this.cycleAirstrikePattern();
        } else {
          this.callAirstrike();
        }
      }
      // [Y] Commo Rose / Quick Chat Wheel (BattleBit-style)
      if (e.code === 'KeyY' && !e.repeat && !this.activeVehicle) {
        this.commoRoseActive = true;
        this.commoCursorX = 0;
        this.commoCursorY = 0;
        this.commoSelectedId = null;
        if (this.onCommoRoseOpen) this.onCommoRoseOpen();
      }
      if (e.code === 'KeyT' && !this.activeVehicle) {
        this.useHammer(false);
      }
      if (e.code === 'KeyZ' && !this.activeVehicle) {
        this.prone = !this.prone;
        if (this.prone) this.crouching = false;
      }
      if (e.code === 'KeyC' || e.code === 'ControlLeft') {
        if (this.activeVehicle && e.code === 'KeyC') {
          this.thirdPersonVehicle = !this.thirdPersonVehicle;
        } else if (!this.activeVehicle) {
          this.crouching = !this.crouching;
          if (this.crouching) this.prone = false;
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      // Close Commo Rose when [Y] released and dispatch selected radial command
      if (e.code === 'KeyY' && this.commoRoseActive) {
        this.commoRoseActive = false;
        if (this.commoSelectedId) {
          this.sendCommoCommand(this.commoSelectedId);
          this.commoSelectedId = null;
        }
        if (this.onCommoRoseClose) this.onCommoRoseClose();
      }
      if (e.code === 'KeyF') {
        this.keyFHoldTime = 0;
      }
    });

    window.addEventListener('wheel', (e) => {
      if (this.dead || this.downed || this.activeVehicle) return;
      const cur = this.currentWeapon();
      if (this.isAds && cur && cur.def.hasCantedSight) {
        this.useCantedSight = e.deltaY < 0;
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (this.dead) return;
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
          this.commoSelectedId = ids[idx];
          const btns = document.querySelectorAll('.commo-rose-btn');
          btns.forEach((b) => {
            const active = b.dataset.cmd === this.commoSelectedId;
            b.style.background = active ? 'rgba(46, 204, 113, 0.85)' : 'rgba(44, 62, 80, 0.85)';
            b.style.borderColor = active ? '#2ecc71' : 'rgba(255,255,255,0.18)';
          });
        }
        return;
      }
      if (document.pointerLockElement !== document.body) return;
      const sens = this.isAds ? PLAYER.SENSITIVITY_ADS : PLAYER.SENSITIVITY_HIP;
      const dx = e.movementX * sens;
      const dy = e.movementY * sens;
      this.yaw -= dx;
      this.pitch -= dy;
      const maxPitch = Math.PI / 2 - PLAYER.MAX_PITCH_OFFSET;
      this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));

      // Weapon procedural sway
      this.swayX = THREE.MathUtils.clamp(this.swayX - dx * PLAYER.SWAY_MULT, -PLAYER.SWAY_LIMIT, PLAYER.SWAY_LIMIT);
      this.swayY = THREE.MathUtils.clamp(this.swayY + dy * PLAYER.SWAY_MULT, -PLAYER.SWAY_LIMIT, PLAYER.SWAY_LIMIT);
    });

    window.addEventListener('mousedown', (e) => {
      if (this.dead) return;
      if (document.pointerLockElement !== document.body) {
        try {
          const p = document.body.requestPointerLock();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch (_) {}
      }
      if (this.downed) return;

      if (e.button === 1) {
        e.preventDefault();
        this.triggerTacticalPing();
        return;
      }
      if (e.button === 0) {
        this.isFiring = true;
        if (!this.activeVehicle) {
          this.tryFireSingle();
        }
      } else if (e.button === 2) {
        if (this.activeVehicle) {
          this.isAds = true;
          return;
        }
        const cur = this.currentWeapon();
        if (cur && cur.def.type === 'c4') {
          this.detonateC4();
        } else if (cur && cur.def.type === 'hammer') {
          this.useHammer(true);
        } else {
          this.isAds = true;
        }
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.isFiring = false;
      if (e.button === 2) this.isAds = false;
    });

    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  addShake(amount) {
    this.shakeTrauma = Math.min(1.0, this.shakeTrauma + amount);
  }

  getActiveOpticType() {
    const cur = this.currentWeapon();
    if (!cur || !cur.def.opticType) return null;
    if (this.useCantedSight && cur.def.hasCantedSight) {
      return 'reddot';
    }
    return cur.def.opticType;
  }

  getBlueprintName() {
    return this.buildBlueprints[this.buildBlueprintIndex] || 'CHEST WALL';
  }

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
  }

  /**
   * Returns the nearest Objective Flag (A–E) if the player is within `flag.radius + extraPad` meters.
   */
  findNearbyFlag(extraPad = DISTANCES.FLAG_EXTRA_PAD) {
    if (!this.world || !this.world.flags) return null;
    let best = null;
    let bestDist = Infinity;
    for (const f of this.world.flags) {
      const d = Math.hypot(this.pos.x - f.pos.x, this.pos.z - f.pos.z);
      if (d <= f.radius + extraPad && d < bestDist) {
        bestDist = d;
        best = f;
      }
    }
    return best;
  }

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
  }

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
  }

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
    const nearFlag = this.findNearbyFlag(DISTANCES.FLAG_EXTRA_PAD);
    const bpName = this.getBlueprintName();
    const builtFront = this.useHammer(false, true);

    if (nearFlag && nearFlag.owner === this.team) {
      if ((nearFlag.defenseStage || 0) < 4 && typeof this.world.buildPointDefenseStage === 'function') {
        const res = this.world.buildPointDefenseStage(nearFlag, this.onBroadcast);
        this.score += 50;
        sound.playReload();
        if (this.onAwardXp) {
          this.onAwardXp(
            50,
            `BUILT ${bpName} & FORTIFIED OBJ ${nearFlag.id} DEFENSES (${res.stage}/${res.maxStage})`
          );
        }
        return;
      }
      if (builtFront > 0) {
        sound.playReload();
        if (this.onAwardXp) {
          this.onAwardXp(25, `BUILT ${bpName} AT OBJ ${nearFlag.id}`);
        }
      }
      return;
    }

    if (builtFront > 0) {
      sound.playReload();
      if (this.onAwardXp) {
        this.onAwardXp(20, `BUILT ${bpName}`);
      }
    }
  }

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
  }

  loadGunsmithState() {
    try {
      const raw = localStorage.getItem('bb_gunsmith_state_v1');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (typeof parsed.cash === 'number' && Number.isFinite(parsed.cash)) {
        this.cash = Math.max(0, Math.floor(parsed.cash));
      }
      if (Array.isArray(parsed.owned)) {
        parsed.owned.forEach((id) => this.ownedUpgrades.add(id));
      }
      if (parsed.equipped && typeof parsed.equipped === 'object') {
        for (const k of ['muzzle', 'magazine', 'optic', 'grip', 'vest']) {
          if (parsed.equipped[k]) {
            this.equippedUpgrades[k] = parsed.equipped[k];
          }
        }
      }
    } catch (_) {}
  }

  saveGunsmithState() {
    try {
      localStorage.setItem(
        'bb_gunsmith_state_v1',
        JSON.stringify({
          cash: this.cash,
          owned: Array.from(this.ownedUpgrades),
          equipped: this.equippedUpgrades
        })
      );
    } catch (_) {}
  }

  getEquippedItem(category) {
    const list = ATTACHMENT_CATALOG[category] || [];
    const targetId = this.equippedUpgrades[category];
    return list.find((it) => it.id === targetId) || list[0] || null;
  }

  addCash(amount, reason = '') {
    const clean = Math.round(amount || 0);
    if (clean === 0) return;
    this.cash = Math.max(0, (this.cash || 0) + clean);
    this.saveGunsmithState();
    if (this.onCashChanged) {
      this.onCashChanged(this.cash, clean, reason);
    }
  }

  buyOrEquipUpgrade(category, itemId) {
    const list = ATTACHMENT_CATALOG[category];
    if (!list) return { ok: false, reason: 'INVALID CATEGORY' };
    const item = list.find((it) => it.id === itemId);
    if (!item) return { ok: false, reason: 'ITEM NOT FOUND' };

    let boughtNow = false;
    if (!this.ownedUpgrades.has(item.id)) {
      if (this.cash < item.price) {
        return { ok: false, reason: `NEED $${item.price - this.cash} MORE CASH!` };
      }
      this.cash -= item.price;
      this.ownedUpgrades.add(item.id);
      boughtNow = true;
    }

    this.equippedUpgrades[category] = item.id;
    this.saveGunsmithState();
    this.applyCustomizationsToActiveLoadout(true);
    sound.playReload();
    if (this.onCashChanged) {
      this.onCashChanged(
        this.cash,
        boughtNow ? -item.price : 0,
        boughtNow ? `PURCHASED & EQUIPPED: ${item.name}` : `EQUIPPED: ${item.name}`
      );
    }
    return { ok: true, boughtNow, item };
  }

  buildCustomizedWeaponDef(baseDef, isPrimaryGun = false) {
    if (!baseDef || baseDef.type !== 'gun') return baseDef;
    const muzzle = this.getEquippedItem('muzzle');
    const mag = this.getEquippedItem('magazine');
    const optic = this.getEquippedItem('optic');
    const grip = this.getEquippedItem('grip');

    const capMult = mag ? mag.capMult : 1.0;
    const newClip = Math.max(1, Math.round(baseDef.clipSize * capMult));
    const newReserve = Math.max(newClip, Math.round(baseDef.reserveAmmo * capMult));
    const recoilMult = (muzzle ? muzzle.recoilMult : 1.0) * (grip ? grip.recoilMult : 1.0);
    const spreadMult = grip ? grip.spreadMult : 1.0;
    const rpmMult = grip ? grip.rpmMult : 1.0;

    // Primary weapons use custom optic if selected; sidearm keeps iron/reddot
    const useCustomOptic = isPrimaryGun && optic && optic.id !== 'factory' && optic.opticType;
    const finalOpticType = useCustomOptic ? optic.opticType : baseDef.opticType;
    const finalAdsFov = useCustomOptic && optic.adsFov ? optic.adsFov : baseDef.adsFov;
    const finalHasCanted = Boolean(baseDef.hasCantedSight || (useCustomOptic && optic.grantCanted));

    const tags = [];
    if (muzzle && muzzle.id !== 'stock') tags.push(muzzle.shortName);
    if (mag && mag.id !== 'std_mag') tags.push(mag.shortName);
    if (useCustomOptic) tags.push(optic.shortName);
    if (grip && grip.id !== 'std_grip') tags.push(grip.shortName);

    return {
      ...baseDef,
      clipSize: newClip,
      reserveAmmo: newReserve,
      reloadTime: Number((baseDef.reloadTime * (mag ? mag.reloadMult : 1.0)).toFixed(2)),
      recoilPitch: baseDef.recoilPitch * recoilMult,
      recoilYaw: baseDef.recoilYaw * recoilMult,
      spreadHip: baseDef.spreadHip * spreadMult,
      rpm: Math.round(baseDef.rpm * rpmMult),
      opticType: finalOpticType,
      adsFov: finalAdsFov,
      hasCantedSight: finalHasCanted,
      isScoped: finalOpticType === 'sniper8x' || Boolean(baseDef.isScoped && finalOpticType === 'sniper8x'),
      flashMult: muzzle ? muzzle.flashMult : 1.0,
      silenced: Boolean(muzzle && muzzle.silenced),
      hideTracers: Boolean(muzzle && muzzle.hideTracers),
      customTags: tags,
      caliber: tags.length > 0 ? `${baseDef.caliber.split('•')[0].trim()} • ${tags.join(' + ')}` : baseDef.caliber
    };
  }

  applyCustomizationsToActiveLoadout(refillAmmoAndArmor = false) {
    const vestDef = this.getEquippedItem('vest');
    this.maxArmor = vestDef ? vestDef.maxArmor : PLAYER.MAX_ARMOR;
    this.armorAbsorbRatio = vestDef ? vestDef.absorbRatio : PLAYER.ARMOR_ABSORB_RATIO;
    if (refillAmmoAndArmor) {
      this.armor = this.maxArmor;
      this.bandages = Math.max(
        this.bandages,
        (this.role === 'medic' ? 6 : 3) + (vestDef ? vestDef.bonusBandages : 0)
      );
      this.grenades = Math.max(this.grenades, 2 + (vestDef ? vestDef.bonusGrenades : 0));
    }

    const weaponIds = CLASS_LOADOUTS[this.role] || CLASS_LOADOUTS.engineer;
    const prevSlotIdx = this.currentSlotIndex;
    this.slots = weaponIds.map((id, idx) => {
      const baseDef = WEAPON_DEFS[id];
      const def = this.buildCustomizedWeaponDef(baseDef, idx === 0);
      return {
        def,
        clip: def.clipSize,
        reserve: def.reserveAmmo,
        mags: this.buildMagArray(def.clipSize, def.reserveAmmo),
        mesh: createWeaponViewModel(def, this.team, this.equippedUpgrades)
      };
    });
    this.switchSlot(Math.min(prevSlotIdx, this.slots.length - 1));
  }

  buildMagArray(clipSize, reserveAmmo) {
    if (!clipSize || clipSize <= 1) return [];
    const count = Math.max(1, Math.round(reserveAmmo / clipSize));
    return Array.from({ length: count }, () => clipSize);
  }

  syncReserveFromMags(slot) {
    if (!slot || !slot.mags || slot.def.clipSize <= 1) return;
    slot.reserve = slot.mags.reduce((sum, n) => sum + n, 0);
  }

  equipLoadout(roleName) {
    this.role = roleName;
    this.applyCustomizationsToActiveLoadout(false);
  }

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
  }

  currentWeapon() {
    return this.slots[this.currentSlotIndex];
  }

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
  }

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

    if (this.onAwardXp) this.onAwardXp(50, 'RALLY POINT DEPLOYED — SQUAD CAN SPAWN HERE');
    sound.playReload();
  }

  // Update rally point state (called from update loop)
  updateRallyPoint(dt) {
    if (this.rallyCooldown > 0) {
      this.rallyCooldown -= dt;
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
        return;
      }
    }

    if (this.rallyPoint.timer <= 0) {
      if (this.onAwardXp) this.onAwardXp(0, 'RALLY POINT EXPIRED');
      this.scene.remove(this.rallyPoint.mesh);
      this.rallyPoint = null;
      return;
    }

    // Pulse the beacon
    const beacon = this.rallyPoint.mesh.children[1];
    if (beacon) {
      beacon.material.emissiveIntensity = 0.8 + Math.sin(performance.now() * 0.004) * 0.4;
    }
  }

  deploy(team, role, spawnPointVec) {
    if (this.activeVehicle) {
      this.activeVehicle.driver = null;
      this.activeVehicle = null;
    }
    this.team = team;
    this.equipLoadout(role);
    const vestDef = this.getEquippedItem('vest');
    this.maxArmor = vestDef ? vestDef.maxArmor : PLAYER.MAX_ARMOR;
    this.armorAbsorbRatio = vestDef ? vestDef.absorbRatio : PLAYER.ARMOR_ABSORB_RATIO;
    const safeSpawn = this.world.findSafeSpawnPoint(spawnPointVec.x, spawnPointVec.z);
    this.pos.copy(safeSpawn);
    this.vel.set(0, 0, 0);
    this.yaw = team === 'US' ? -Math.PI / 2 : Math.PI / 2;
    this.pitch = 0;
    this.hp = PLAYER.HP;
    this.armor = this.maxArmor;
    this.bleeding = false;
    this.bandages = (role === 'medic' ? 6 : 3) + (vestDef ? vestDef.bonusBandages : 0);
    this.grenades = 2 + (vestDef ? vestDef.bonusGrenades : 0);
    this.bandageProgress = 0;
    this.reviveProgress = 0;
    this.magPackProgress = 0;
    this.crouching = false;
    this.prone = false;
    this.downed = false;
    this.downedTimer = 0;
    this.giveUpProgress = 0;
    this.dead = false;
    this.isGrounded = true;
    this.viewModelGroup.visible = true;
    this.syncCameraTransform();
    try {
      const p = document.body.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (_) {
      // Ignore pointer lock rejection in automated webviews
    }
  }

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
  }

  syncCameraTransform() {
    const eyeHeight = this.downed
      ? PLAYER.EYE_HEIGHT_DOWNED
      : this.prone
      ? PLAYER.EYE_HEIGHT_PRONE
      : this.crouching
      ? PLAYER.EYE_HEIGHT_CROUCH
      : PLAYER.EYE_HEIGHT_STAND;
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const leanOffset = right.multiplyScalar(this.leanAmount * PLAYER.LEAN_OFFSET);

    this.camera.position.set(
      this.pos.x + leanOffset.x,
      this.pos.y + eyeHeight + (this.lastBobY || 0),
      this.pos.z + leanOffset.z
    );

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

  tryFireSingle() {
    const cur = this.currentWeapon();
    if (!cur || this.reloading || this.fireTimer > 0) return;
    this.executeFire(cur);
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

  useHammer(isBreak = false, fromInteractKey = false) {
    this.recoilKickZ = 0.13;
    sound.playBuildHammer();

    this.syncCameraTransform();
    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(
      this.camera.getWorldQuaternion(new THREE.Quaternion())
    );

    const hit = this.world.raycastVoxel(origin, dir, DISTANCES.HAMMER_RANGE);

    if (isBreak) {
      if (hit && hit.voxel) {
        this.world.damageVoxel(hit.voxel.gx, hit.voxel.gy, hit.voxel.gz, 100, this.onBroadcast);
      }
      return 0;
    }

    let placePos;
    if (fromInteractKey) {
      // Pressing [F] always anchors the Chest Wall / Defense Structure on the ground 2.8m ahead of where you face!
      const flatFwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
      placePos = this.pos.clone().addScaledVector(flatFwd, 2.85);
      placePos.y = this.world.getGroundHeightAt(placePos.x, placePos.z) + 0.15;
    } else {
      placePos = origin.clone().addScaledVector(dir, 3.0);
      if (hit) {
        placePos = hit.point.clone().addScaledVector(hit.normal, VOXEL_SIZE * 0.55);
      }
    }

    const g = this.world.worldToGrid(placePos.x, Math.max(0.1, placePos.y), placePos.z);
    const pGrid = this.world.worldToGrid(this.pos.x, this.pos.y + 0.5, this.pos.z);
    if (g.gx === pGrid.gx && g.gz === pGrid.gz && Math.abs(g.gy - pGrid.gy) <= 1) {
      return 0;
    }

    // Build according to selected BattleBit Squad Fortification Blueprint ([B])
    const bp = this.buildBlueprints[this.buildBlueprintIndex] || 'CHEST WALL';
    const baseGy = fromInteractKey ? this.world.getBaseGy(g.gx, g.gz) : Math.max(0, g.gy);
    const alongX = Math.abs(Math.cos(this.yaw)) >= Math.abs(Math.sin(this.yaw));
    const dx = alongX ? 1 : 0;
    const dz = alongX ? 0 : 1;
    // Forward normal direction for U-shaped bunker wings
    const fwdGx = Math.round(-Math.sin(this.yaw));
    const fwdGz = Math.round(-Math.cos(this.yaw));

    let builtCount = 0;
    const placeBlock = (bx, by, bz, mat = 'sandbag') => {
      if (bx === pGrid.gx && bz === pGrid.gz && Math.abs(by - pGrid.gy) <= 1) return;
      if (this.world.addVoxel(bx, by, bz, mat, false, true)) {
        builtCount++;
        if (this.onBroadcast) {
          this.onBroadcast({ type: 'voxel_add', gx: bx, gy: by, gz: bz, mat });
        }
      }
    };

    if (bp === 'FIRING PORT') {
      // 3-wide, 2-tall sandbag emplacement with a center firing slit!
      for (const s of [-1, 0, 1]) {
        placeBlock(g.gx + dx * s, baseGy, g.gz + dz * s, 'sandbag');
        if (s !== 0) {
          placeBlock(g.gx + dx * s, baseGy + 1, g.gz + dz * s, 'sandbag');
        }
      }
    } else if (bp === 'SANDBAG BUNKER') {
      // U-shaped 3-wide chest-high sandbag bunker with flanking side wings
      for (const s of [-1, 0, 1]) {
        placeBlock(g.gx + dx * s, baseGy, g.gz + dz * s, 'sandbag');
        if (Math.abs(s) === 1) {
          placeBlock(g.gx + dx * s - fwdGx, baseGy, g.gz + dz * s - fwdGz, 'sandbag');
          placeBlock(g.gx + dx * s, baseGy + 1, g.gz + dz * s, 'sandbag');
        }
      }
    } else if (bp === 'HESCO BASTION') {
      // 3x2 reinforced HESCO barrier
      for (const s of [-1, 0, 1]) {
        placeBlock(g.gx + dx * s, baseGy, g.gz + dz * s, 'darkConcrete');
        placeBlock(g.gx + dx * s, baseGy + 1, g.gz + dz * s, 'sandbag');
      }
    } else {
      // CHEST WALL (4-wide, 1.25m chest-high sandbag breastwork with concrete end-caps:
      // shoot right over it while standing [1.65m eye height], or crouch [1.00m] for 100% cover!)
      for (const s of [-1, 0, 1, 2]) {
        const mat = s === -1 || s === 2 ? 'darkConcrete' : 'sandbag';
        placeBlock(g.gx + dx * s, baseGy, g.gz + dz * s, mat);
      }
    }

    if (builtCount > 0 && !fromInteractKey && this.onAwardXp) {
      this.onAwardXp(15, `BUILT ${bp}`);
    }
    return builtCount;
  }

  notifyVehicleHit(hullDamage, attackerName, weaponName, attackerPos = null) {
    if (hullDamage >= 35) {
      this.addShake(Math.min(0.45, hullDamage / 420));
    }
    if (this.onDamageTaken) {
      this.onDamageTaken(hullDamage, attackerPos, true, weaponName, attackerName);
    }
  }

  // Squad-style suppression: call this when bullets land near the player (within ~4m)
  applySuppression(intensity = 0.25) {
    this.suppressionLevel = Math.min(1.0, this.suppressionLevel + intensity);
    this.lastSuppressionHitTime = performance.now();
  }

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
  }

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
  }

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
  }

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
  }

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

  update(dt) {
    if (this.dead) return;

    if (this.activePing) {
      this.activePing.timer -= dt;
      if (this.activePing.timer <= 0) {
        this.activePing = null;
      }
    }

    // Handle Downed / Incapacitated State (awaiting friendly Medic revive or Hold [Space] to Give Up)
    if (this.downed) {
      this.downedTimer -= dt;
      if (this.keys['Space']) {
        this.giveUpProgress += dt / PLAYER.GIVE_UP_RATE;
      } else {
        this.giveUpProgress = Math.max(0, this.giveUpProgress - dt * 2);
      }
      this.syncCameraTransform();
      if (this.downedTimer <= 0 || this.giveUpProgress >= 1) {
        this.finalizeDeath();
      }
      return;
    }

    if (this.activeVehicle) {
      this.updateVehicleControl(dt);
      this.updateRallyPoint(dt);
      this.updateUAV(dt);
      return;
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

    if (this.keys['KeyH'] && (this.bleeding || this.hp < PLAYER.MAX_HP) && this.bandages > 0) {
      this.bandageProgress += dt / (this.role === 'medic' ? PLAYER.BANDAGE_DURATION_MEDIC : PLAYER.BANDAGE_DURATION_OTHER);
      if (this.bandageProgress >= 1) {
        this.bandageProgress = 0;
        this.bleeding = false;
        this.bandages--;
        this.hp = Math.min(PLAYER.MAX_HP, this.hp + (this.role === 'medic' ? PLAYER.BANDAGE_HEAL_MEDIC : PLAYER.BANDAGE_HEAL_OTHER));
        if (this.onAwardXp) this.onAwardXp(15, 'BLEEDING STOPPED');
      }
    } else {
      this.bandageProgress = 0;
    }

    // Separate [E] Drag & [F] Revive Downed Friendly Teammates:
    // - Press [E] to toggle DRAGGING a fallen soldier to cover
    // - Hold [F] to wrap a bandage and REVIVE them!
    if (this.draggedBot && (this.draggedBot.dead || !this.draggedBot.downed)) {
      this.draggedBot = null;
      this.isDraggingAlly = false;
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
    this.isDraggingAlly = Boolean(this.draggedBot);

    const wantMove = Boolean(
      this.keys['KeyW'] || this.keys['KeyS'] || this.keys['KeyA'] || this.keys['KeyD']
    );
    if (this.draggedBot && wantMove) {
      this.dragDistAccum = (this.dragDistAccum || 0) + 4.8 * dt;
    }

    if (nearDownedBot && this.keys['KeyF']) {
      this.keyFHoldTime += dt;
      const revDuration = this.role === 'medic' ? PLAYER.REVIVE_DURATION_MEDIC : PLAYER.REVIVE_DURATION_OTHER;
      const rateMult = wantMove ? 0.35 : 1.0;
      this.reviveProgress += (dt / revDuration) * rateMult;
      if (this.reviveProgress >= 1) {
        const draggedFar = (this.dragDistAccum || 0) >= 1.5;
        this.reviveProgress = 0;
        this.dragDistAccum = 0;
        this.draggedBot = null;
        this.isDraggingAlly = false;
        this.botManager.reviveBot(nearDownedBot);
        this.revives = (this.revives || 0) + 1;
        const xpPts = draggedFar ? PLAYER.REVIVE_DRAG_XP : PLAYER.REVIVE_XP;
        this.score += xpPts;
        if (this.onAwardXp) {
          this.onAwardXp(
            xpPts,
            draggedFar
              ? `DRAGGED TO COVER & REVIVED (${nearDownedBot.name})`
              : `TEAMMATE REVIVED (${nearDownedBot.name})`
          );
        }
        if (this.onKillEvent) {
          this.onKillEvent(
            this.name,
            this.team,
            nearDownedBot.name,
            nearDownedBot.team,
            'REVIVED',
            false
          );
        }
        this.reviveTargetBot = null;
      }
    } else {
      this.reviveProgress = 0;
    }

    // Consolidate / Pack Partial Magazines [Hold P]
    const cur = this.currentWeapon();
    if (
      this.keys['KeyP'] &&
      cur &&
      cur.mags &&
      cur.mags.length > 1 &&
      !this.reloading &&
      !this.isFiring
    ) {
      this.magPackProgress += dt / PLAYER.MAG_PACK_DURATION;
      if (this.magPackProgress >= 1) {
        this.magPackProgress = 0;
        const totalRounds = cur.mags.reduce((a, b) => a + b, 0);
        const fullCount = Math.floor(totalRounds / cur.def.clipSize);
        const rem = totalRounds % cur.def.clipSize;
        const newMags = [];
        for (let i = 0; i < fullCount; i++) newMags.push(cur.def.clipSize);
        if (rem > 0) newMags.push(rem);
        cur.mags = newMags;
        this.syncReserveFromMags(cur);
        sound.playReload();
        if (this.onAwardXp) this.onAwardXp(15, 'MAGAZINES CONSOLIDATED');
      }
    } else {
      this.magPackProgress = 0;
    }

    // Reloading timer (Tactical Mag Rotation vs. Speed Drop Reload) & RPG warhead restore
    if (this.reloading && cur) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        if (cur.mags && cur.def.clipSize > 1) {
          // Tactical reload keeps partial mag in rotation; Speed Drop Reload discards it!
          if (cur.clip > 0 && !this.fastReload) {
            cur.mags.push(cur.clip);
          }
          cur.mags.sort((a, b) => b - a);
          cur.clip = cur.mags.length > 0 ? cur.mags.shift() : 0;
          this.syncReserveFromMags(cur);
        } else {
          const needed = cur.def.clipSize - cur.clip;
          const take = Math.min(needed, cur.reserve);
          cur.clip += take;
          cur.reserve -= take;
        }
        this.reloading = false;
        this.fastReload = false;
        const warhead = cur.mesh.getObjectByName('rpgWarhead');
        if (warhead) warhead.visible = true;
      }
    }

    if (this.fireTimer > 0) {
      this.fireTimer -= dt;
    }

    // Tactical Leaning (Q / ADS+E so [E] Enter Vehicle / Drag never conflicts)
    const leanRightActive = this.keys['KeyE'] && this.isAds && !this.draggedBot && !nearDownedBot;
    this.leanTarget = (leanRightActive ? 1 : 0) - (this.keys['KeyQ'] ? 1 : 0);
    this.leanAmount += (this.leanTarget - this.leanAmount) * Math.min(1, dt * 12);

    // Movement vector
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const moveDir = new THREE.Vector3();
    if (this.keys['KeyW']) moveDir.add(forward);
    if (this.keys['KeyS']) moveDir.sub(forward);
    if (this.keys['KeyD']) moveDir.add(right);
    if (this.keys['KeyA']) moveDir.sub(right);

    const isMoving = moveDir.lengthSq() > 0.001;
    if (isMoving) moveDir.normalize();

    if (this.keys['ShiftLeft'] && this.keys['KeyW'] && (this.prone || this.crouching)) {
      this.prone = false;
      this.crouching = false;
    }

    const isDraggingBody = Boolean(this.draggedBot || (nearDownedBot && this.keys['KeyF']));
    const sprinting =
      this.keys['ShiftLeft'] &&
      !this.isAds &&
      !this.crouching &&
      !this.prone &&
      !isDraggingBody &&
      this.keys['KeyW'] &&
      !this.isFiring;
    const baseSpeed = isDraggingBody
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

    this.vel.x = moveDir.x * baseSpeed;
    this.vel.z = moveDir.z * baseSpeed;

    // [Space]: Stand up from Prone/Crouch, Vault over low wall/window, or Jump!
    if (this.keys['Space'] && this.isGrounded) {
      if (this.prone || this.crouching) {
        this.prone = false;
        this.crouching = false;
        this.keys['Space'] = false;
      } else {
        // Check if facing a vaultable 1-1.5 block ledge/window
        const vaultCheckX = this.pos.x + forward.x * 1.1;
        const vaultCheckZ = this.pos.z + forward.z * 1.1;
        const hasLowWall = this.checkBodyOverlap(vaultCheckX, this.pos.y, vaultCheckZ, 0.35, 1.3);
        const clearAbove = !this.checkBodyOverlap(
          vaultCheckX,
          this.pos.y + VOXEL_SIZE * 1.45,
          vaultCheckZ,
          0.35,
          1.5
        );
        if (hasLowWall && clearAbove) {
          this.vel.y = 8.2;
          this.pos.x += forward.x * 0.45;
          this.pos.z += forward.z * 0.45;
          this.isGrounded = false;
        } else {
          this.vel.y = 9.4;
          this.isGrounded = false;
        }
      }
    }

    this.vel.y -= 24.0 * dt;
    this.moveWithVoxelCollision(dt);

    // If dragging a downed friendly soldier while holding [F], pull their body right in front of us
    // so we can see them being dragged into safe cover!
    if (isDraggingBody && nearDownedBot) {
      const dragTarget = this.pos.clone().addScaledVector(forward, 1.15);
      nearDownedBot.pos.x = THREE.MathUtils.lerp(nearDownedBot.pos.x, dragTarget.x, Math.min(1, dt * 14));
      nearDownedBot.pos.z = THREE.MathUtils.lerp(nearDownedBot.pos.z, dragTarget.z, Math.min(1, dt * 14));
      nearDownedBot.pos.y = this.world.getGroundHeightAt(nearDownedBot.pos.x, nearDownedBot.pos.z) + 0.22;
      nearDownedBot.mesh.rotation.y = this.yaw;
    }

    // Decay recoil, weapon sway, suppression & explosion trauma
    this.recoilOffsetPitch *= Math.pow(0.08, dt);
    this.recoilKickZ *= Math.pow(0.02, dt);
    this.swayX *= Math.pow(0.04, dt);
    this.swayY *= Math.pow(0.04, dt);
    this.shakeTrauma = Math.max(0, this.shakeTrauma - dt * 1.8);

    // Suppression decay + micro-flinch when suppressed (Squad-style)
    this.suppressionLevel = Math.max(0, this.suppressionLevel - this.suppressionDecayRate * dt);
    if (this.suppressionLevel > 0.05) {
      const flinchMag = this.suppressionLevel * 0.015;
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

    // Camera height, lean & headbob (heavily stabilized while in ADS)
    if (isMoving && this.isGrounded) {
      this.walkBobPhase += dt * (sprinting ? 14 : 9.5);
    }
    const bobAmpY = this.isAds ? 0.005 : 0.036;
    const bobAmpX = this.isAds ? 0.004 : 0.026;
    const bobY = isMoving && this.isGrounded ? Math.sin(this.walkBobPhase) * bobAmpY : 0;
    const bobX = isMoving && this.isGrounded ? Math.cos(this.walkBobPhase * 0.5) * bobAmpX : 0;

    this.lastBobY = bobY;
    this.lastShakeYaw = shakeYaw;
    this.lastShakePitch = shakePitch;
    this.syncCameraTransform();

    // Execute full-auto fire AFTER camera position & rotation are updated for this frame
    if (this.isFiring && cur && cur.def.auto && !this.reloading && this.fireTimer <= 0) {
      this.executeFire(cur);
    }

    // Update rally point beacon
    this.updateRallyPoint(dt);

    // Update commander abilities, insertion beacon, commo rose cooldowns
    this.updateUAV(dt);

    // ADS FOV & First-Person ViewModel Animation (supports 45° Canted Red-Dot Sight!)
    const targetAds = this.isAds && !this.reloading ? 1 : 0;
    this.adsAmount += (targetAds - this.adsAmount) * Math.min(1, dt * 15);

    const activeAdsFov =
      cur && this.useCantedSight && cur.def.hasCantedSight ? 50 : cur ? cur.def.adsFov || 55 : 75;
    const targetFov = cur ? THREE.MathUtils.lerp(75, activeAdsFov, this.adsAmount) : 75;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = targetFov;
      this.camera.updateProjectionMatrix();
    }

    if (cur && cur.mesh) {
      const hipPos = new THREE.Vector3(
        0.22 + bobX + this.swayX,
        -0.2 + bobY * 0.6 + this.swayY,
        -0.31 + this.recoilKickZ
      );
      const sightCenterY = cur.def.id === 'mp443' ? -0.052 : -0.068;
      const adsPos = new THREE.Vector3(
        this.swayX * 0.12,
        sightCenterY + this.swayY * 0.12,
        -0.16 + this.recoilKickZ * 0.4
      );
      cur.mesh.position.lerpVectors(hipPos, adsPos, this.adsAmount);

      const magMesh = cur.mesh.getObjectByName('magazineMesh');
      const leftArm = cur.mesh.getObjectByName('leftArmGroup');
      const cantedRoll = this.useCantedSight && cur.def.hasCantedSight ? -0.68 * this.adsAmount : 0;

      if (this.reloading) {
        // Physical BattleBit Magazine Reload Animation!
        const p = 1 - Math.max(0, this.reloadTimer) / cur.def.reloadTime;
        const pullWave = Math.sin(p * Math.PI);
        cur.mesh.rotation.set(0.28 * pullWave, 0.32 * pullWave, -0.25 * pullWave);
        if (magMesh) {
          magMesh.position.y = -0.105 - pullWave * 0.24;
        }
        if (leftArm) {
          leftArm.position.y = -0.065 - pullWave * 0.18;
          leftArm.position.z = -0.28 + pullWave * 0.12;
        }
      } else if (sprinting && this.adsAmount < 0.2) {
        // Tactical Sprint High-Ready Pose
        cur.mesh.rotation.set(-0.22 + bobY * 1.5, 0.48, 0.18);
        if (magMesh) magMesh.position.y = -0.105;
      } else {
        cur.mesh.rotation.set(
          this.swayY * 1.5 - 0.02 * this.adsAmount,
          this.swayX * 1.5,
          cantedRoll
        );
        if (magMesh) magMesh.position.y = -0.105;
      }

      // Keep the 3D weapon body (receiver, Picatinny rail, handguard, barrel & hands) visible
      // in ADS view while hiding only the 3D sight box once the crisp 2D optic overlay takes over!
      cur.mesh.visible = true;
      const opticSight = cur.mesh.getObjectByName('opticSightGroup');
      if (opticSight) {
        opticSight.visible = !(cur.def.opticType && this.adsAmount > 0.55);
      }

      const flash = cur.mesh.getObjectByName('muzzleFlash');
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

  // ─── COMMANDER UAV SCAN & DATALINK [U] ────────────────────────────
  triggerCommanderUAV() {
    return this.activateUAV();
  }

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
  }

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
  }

  activateUAV() {
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
  }

  updateUAV(dt) {
    // UAV cooldown
    if (this.uavCooldown > 0 && !this.uavActive) {
      this.uavCooldown = Math.max(0, this.uavCooldown - dt);
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

    // Airstrike cooldown
    if (this.airstrikeCooldown > 0) {
      this.airstrikeCooldown = Math.max(0, this.airstrikeCooldown - dt);
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

    // Beacon cooldown
    if (this.beaconCooldown > 0) {
      this.beaconCooldown = Math.max(0, this.beaconCooldown - dt);
    }

    // Update insertion beacon
    if (this.insertionBeacon) {
      this.insertionBeacon.timer -= dt;
      if (this.insertionBeacon.timer <= 0 || this.insertionBeacon.spawnsLeft <= 0) {
        if (this.insertionBeacon.mesh) {
          this.scene.remove(this.insertionBeacon.mesh);
        }
        this.insertionBeacon = null;
      } else {
        for (const bot of this.botManager.bots) {
          if (bot.dead || bot.team === this.team) continue;
          if (bot.pos.distanceTo(this.insertionBeacon.pos) < 6) {
            if (this.onAwardXp) this.onAwardXp(0, 'INSERTION BEACON DESTROYED BY ENEMY');
            if (this.insertionBeacon.mesh) this.scene.remove(this.insertionBeacon.mesh);
            this.insertionBeacon = null;
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

    // Commo rose cooldown
    if (this.commoRoseCooldown > 0) {
      this.commoRoseCooldown = Math.max(0, this.commoRoseCooldown - dt);
    }
  }

  // ─── FLEXIBLE COMMANDER AIRSTRIKE & ARTILLERY BARRAGE [J] ─────────
  cycleAirstrikePattern(forcePattern = null) {
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
  }

  callCommanderAirstrike(customWorldPos = null, customPattern = null) {
    return this.callAirstrike(customWorldPos, customPattern);
  }

  resolveAirstrikeTargetPos(customWorldPos = null) {
    if (customWorldPos && typeof customWorldPos.x === 'number' && typeof customWorldPos.z === 'number') {
      const tx = THREE.MathUtils.clamp(customWorldPos.x, -335, 335);
      const tz = THREE.MathUtils.clamp(customWorldPos.z, -200, 200);
      const ty = this.world.getGroundHeightAt(tx, tz);
      return new THREE.Vector3(tx, ty, tz);
    }

    this.syncCameraTransform();
    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(
      this.camera.getWorldQuaternion(new THREE.Quaternion())
    );

    // 1. Check if aiming directly at an enemy vehicle up to 360m
    if (this.vehicleManager && this.vehicleManager.vehicles) {
      let bestVeh = null;
      let bestVehDist = 360;
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

    // 2. Raycast against any 3D voxel building, wall, roof, bridge, or terrain up to 380m!
    const voxelHit = this.world.raycastVoxel(origin, dir, 380);
    if (voxelHit && voxelHit.point) {
      const tx = THREE.MathUtils.clamp(voxelHit.point.x, -335, 335);
      const tz = THREE.MathUtils.clamp(voxelHit.point.z, -200, 200);
      const ty = this.world.getGroundHeightAt(tx, tz);
      return new THREE.Vector3(tx, ty, tz);
    }

    // 3. If aiming downward at open ground beyond voxel raycast
    if (dir.y < -0.03) {
      const groundBaseY = this.pos.y;
      const t = THREE.MathUtils.clamp((groundBaseY - origin.y) / dir.y, 12, 340);
      const hitPt = origin.clone().addScaledVector(dir, t);
      const tx = THREE.MathUtils.clamp(hitPt.x, -335, 335);
      const tz = THREE.MathUtils.clamp(hitPt.z, -200, 200);
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
        if (dist > 15 && dist < 380) {
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
    const tx = THREE.MathUtils.clamp(fallbackPos.x, -335, 335);
    const tz = THREE.MathUtils.clamp(fallbackPos.z, -200, 200);
    const ty = this.world.getGroundHeightAt(tx, tz);
    return new THREE.Vector3(tx, ty, tz);
  }

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
  }

  callAirstrike(customWorldPos = null, customPattern = null) {
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
  }

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
  }

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
  }

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

    if (this.onAwardXp) this.onAwardXp(25, 'INSERTION BEACON DEPLOYED (2 SPAWNS)');
    sound.playBuildHammer();
  }

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
      'order_flag_E': { text: 'STRATEGIC ORDER: CAPTURE OBJECTIVE ECHO [E]!', icon: '🚩' },
    };

    const cmd = COMMO_COMMANDS[commandId];
    if (!cmd) return;

    this.lastCommoCommand = cmd;

    // Trigger UI callout
    if (this.onCommoCommand) {
      this.onCommoCommand(commandId, cmd.text, cmd.icon);
    }
  }

  moveWithVoxelCollision(dt) {
    const radius = 0.4;
    const height = this.prone ? 0.65 : this.crouching ? 1.15 : 1.7;

    // Self-unstuck guard if ever overlapping a voxel at current position
    if (this.checkBodyOverlap(this.pos.x, this.pos.y, this.pos.z, radius, height)) {
      this.pos.y += VOXEL_SIZE * 0.55;
    }

    // X Movement
    const nextX = this.pos.x + this.vel.x * dt;
    const terrainAtNextX = this.world.getGroundHeightAt(nextX, this.pos.z);
    const stepTestY_X = Math.max(this.pos.y, terrainAtNextX);
    if (!this.checkBodyOverlap(nextX, stepTestY_X, this.pos.z, radius, height)) {
      this.pos.x = nextX;
      if (this.isGrounded && Math.abs(terrainAtNextX - this.pos.y) < 1.1) {
        this.pos.y = terrainAtNextX;
      }
    } else if (
      this.isGrounded &&
      !this.checkBodyOverlap(nextX, this.pos.y + VOXEL_SIZE + 0.1, this.pos.z, radius, height)
    ) {
      this.pos.x = nextX;
      this.pos.y += VOXEL_SIZE + 0.1;
    }

    // Z Movement
    const nextZ = this.pos.z + this.vel.z * dt;
    const terrainAtNextZ = this.world.getGroundHeightAt(this.pos.x, nextZ);
    const stepTestY_Z = Math.max(this.pos.y, terrainAtNextZ);
    if (!this.checkBodyOverlap(this.pos.x, stepTestY_Z, nextZ, radius, height)) {
      this.pos.z = nextZ;
      if (this.isGrounded && Math.abs(terrainAtNextZ - this.pos.y) < 1.1) {
        this.pos.y = terrainAtNextZ;
      }
    } else if (
      this.isGrounded &&
      !this.checkBodyOverlap(this.pos.x, this.pos.y + VOXEL_SIZE + 0.1, nextZ, radius, height)
    ) {
      this.pos.z = nextZ;
      this.pos.y += VOXEL_SIZE + 0.1;
    }

    // Y Movement (3D Terrain + Voxel Floors/Roofs)
    const groundY = this.world.getGroundHeightAt(this.pos.x, this.pos.z);
    const nextY = this.pos.y + this.vel.y * dt;
    if (nextY <= groundY) {
      this.pos.y = groundY;
      this.vel.y = 0;
      this.isGrounded = true;
    } else if (!this.checkBodyOverlap(this.pos.x, nextY, this.pos.z, radius, height)) {
      this.pos.y = nextY;
      this.isGrounded = false;
    } else {
      if (this.vel.y < 0) {
        this.isGrounded = true;
      }
      this.vel.y = 0;
    }

    this.pos.x = Math.max(-385, Math.min(385, this.pos.x));
    this.pos.z = Math.max(-265, Math.min(265, this.pos.z));
  }

  checkBodyOverlap(x, y, z, r, h) {
    const minCoord = this.world.worldToGrid(x - r, y + 0.25, z - r);
    const maxCoord = this.world.worldToGrid(x + r, y + h, z + r);

    for (let gx = minCoord.gx; gx <= maxCoord.gx; gx++) {
      for (let gy = minCoord.gy; gy <= maxCoord.gy; gy++) {
        for (let gz = minCoord.gz; gz <= maxCoord.gz; gz++) {
          const v = this.world.voxels.get(this.world.key(gx, gy, gz));
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
