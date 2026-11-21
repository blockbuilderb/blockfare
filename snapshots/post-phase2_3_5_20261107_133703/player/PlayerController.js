import * as THREE from '../../vendor/three.module.js';
import { VOXEL_SIZE } from '../world.js?v=35';
import { sound } from '../audio.js?v=35';
import { PLAYER, DISTANCES } from '../config.js?v=35';
import { GunsmithMethods } from './GunsmithState.js?v=35';
import { FortificationMethods } from './FortificationBuilder.js?v=35';
import { CommanderMethods } from './CommanderAbilities.js?v=35';
import { VehicleControlMethods } from './VehicleControl.js?v=35';
import { CombatMethods } from './PlayerCombat.js?v=35';

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

Object.assign(
  PlayerController.prototype,
  GunsmithMethods,
  FortificationMethods,
  CommanderMethods,
  VehicleControlMethods,
  CombatMethods
);
