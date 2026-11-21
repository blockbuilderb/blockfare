import * as THREE from '../vendor/three.module.js';
import { WEAPON_DEFS, CLASS_LOADOUTS, createWeaponViewModel } from './weapons.js?v=14';
import { VOXEL_SIZE } from './world.js?v=14';
import { sound } from './audio.js?v=14';

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

    this.hp = 100;
    this.maxHp = 100;
    this.armor = 50;
    this.bleeding = false;
    this.bleedTickTimer = 0;
    this.bandages = 3;
    this.bandageProgress = 0;
    this.grenades = 2;

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
    this.score = 0;
    this.squad = 'ALPHA';
    this.squadShort = 'ALP';

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
    this.suppressionDecayRate = 0.6; // per second
    this.lastSuppressionHitTime = 0;

    // Kill Streak / Multi-Kill Tracking
    this.killStreak = 0;
    this.multiKillTimer = 0;
    this.multiKillCount = 0;

    // Respawn Timer
    this.respawnTimer = 0;
    this.respawnDelay = 10; // seconds

    // Rally Point
    this.rallyPoint = null;       // { pos: Vector3, mesh: Group, timer: 90 }
    this.rallyCooldown = 0;

    // Commander UAV Scan & Airstrike
    this.uavActive = false;
    this.uavTimer = 0;           // seconds remaining on UAV scan
    this.uavCooldown = 0;        // cooldown until next UAV
    this.uavRevealedBots = [];   // bots revealed on minimap by UAV
    this.airstrikeCooldown = 0;  // cooldown until next airstrike
    this.airstrikeTarget = null;  // { pos: Vector3, timer: Number, markers: [] }

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
    this.zeroDistance = 100;
    this.fireTimer = 0;
    this.reloading = false;
    this.fastReload = false;
    this.reloadTimer = 0;
    this.magPackProgress = 0;
    this.recoilOffsetPitch = 0;
    this.recoilKickZ = 0;
    this.muzzleFlashTimer = 0;

    this.buildBlueprints = ['SANDBAG WALL', 'FIRING PORT', 'HESCO BASTION'];
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
        const zeros = [100, 200, 300, 400];
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
      // [U] Commander UAV Scan (reveals enemies on minimap for 20s)
      if (e.code === 'KeyU' && !this.activeVehicle) {
        this.activateUAV();
      }
      // [J] Commander Airstrike (designate target area → 8s delay → barrage)
      if (e.code === 'KeyJ' && !this.activeVehicle) {
        this.callAirstrike();
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
        if (
          this.draggedBot &&
          !this.dragStartedOnCurrentPress &&
          this.keyFHoldTime < 0.24 &&
          this.reviveProgress < 1
        ) {
          this.draggedBot = null;
          this.isDraggingAlly = false;
        }
        this.keyFHoldTime = 0;
        this.dragStartedOnCurrentPress = false;
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
      const sens = this.isAds ? 0.0011 : 0.0021;
      const dx = e.movementX * sens;
      const dy = e.movementY * sens;
      this.yaw -= dx;
      this.pitch -= dy;
      const maxPitch = Math.PI / 2 - 0.06;
      this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));

      // Weapon procedural sway
      this.swayX = THREE.MathUtils.clamp(this.swayX - dx * 0.45, -0.04, 0.04);
      this.swayY = THREE.MathUtils.clamp(this.swayY + dy * 0.45, -0.04, 0.04);
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
    return this.buildBlueprints[this.buildBlueprintIndex] || 'SANDBAG WALL';
  }

  triggerTacticalPing() {
    this.syncCameraTransform();
    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(
      this.camera.getWorldQuaternion(new THREE.Quaternion())
    );

    // Check if aiming near an enemy soldier to Spot them
    let bestEnemy = null;
    let bestDist = 220;
    for (const bot of this.botManager.bots) {
      if (bot.dead || bot.downed || bot.team === this.team) continue;
      const toBot = bot.pos.clone().add(new THREE.Vector3(0, 1.1, 0)).sub(origin);
      const proj = toBot.dot(dir);
      if (proj > 1 && proj < bestDist) {
        const perpSq = toBot.lengthSq() - proj * proj;
        if (perpSq < 3.2 * 3.2) {
          bestDist = proj;
          bestEnemy = bot;
        }
      }
    }

    if (bestEnemy) {
      bestEnemy.spottedTimer = 7.5;
      const distM = Math.round(bestEnemy.pos.distanceTo(this.pos));
      this.activePing = {
        pos: bestEnemy.pos.clone().add(new THREE.Vector3(0, 2.1, 0)),
        timer: 5.0,
        isEnemy: true,
        label: `ENEMY ${bestEnemy.role}`
      };
      if (this.onAwardXp) this.onAwardXp(25, `SPOTTED ENEMY (${bestEnemy.name})`);
      if (this.onCommoCommand) {
        this.onCommoCommand('ping', `HOSTILE ${bestEnemy.role} SPOTTED (${distM}m)!`, '🎯');
      }
      sound.playRadioBeep(false);
      return;
    }

    const voxelHit = this.world.raycastVoxel(origin, dir, 220);
    const pingPos = voxelHit ? voxelHit.point.clone() : origin.clone().addScaledVector(dir, 90);
    this.activePing = {
      pos: pingPos,
      timer: 6.5,
      isEnemy: false,
      label: 'SQUAD PING'
    };
    if (this.onCommoCommand) {
      this.onCommoCommand('ping', `CHECK MARKED COORDINATES (${Math.round(pingPos.distanceTo(this.pos))}m)!`, '📍');
    }
    sound.playRadioBeep(false);
  }

  handleInteractKey() {
    // Exit vehicle if currently driving
    if (this.activeVehicle) {
      const v = this.activeVehicle;
      v.driver = null;
      this.activeVehicle = null;
      this.pos.copy(v.pos).add(new THREE.Vector3(3.2, 0.35, 0));
      this.viewModelGroup.visible = true;
      return;
    }

    // Same-Key [F] Drag & Revive:
    // Pressing [F] once grabs a downed friendly soldier to DRAG them to cover;
    // Keeping [F] pressed (holding [F]) wraps a bandage and REVIVES them!
    if (this.draggedBot && this.draggedBot.downed && !this.draggedBot.dead) {
      this.dragStartedOnCurrentPress = false;
      return;
    }

    const nearDowned = this.botManager.findNearestDownedFriendly(this.pos, this.team, 4.2);
    if (nearDowned) {
      this.draggedBot = nearDowned;
      this.reviveTargetBot = nearDowned;
      this.isDraggingAlly = true;
      this.dragStartedOnCurrentPress = true;
      this.dragDistAccum = 0;
      return;
    }

    // Check if near an enterable Tank, APC, or Armored Car
    const nearVehicle = this.vehicleManager.findNearestEnterable(this.pos, 6.2, this.team);
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

    // Check if near an Ammo Resupply Crate
    for (const crate of this.world.ammoCrates) {
      if (crate.pos.distanceTo(this.pos) <= 4.5) {
        this.resupplyAll();
        return;
      }
    }
  }

  resupplyAll() {
    for (const s of this.slots) {
      s.clip = s.def.clipSize;
      s.reserve = s.def.reserveAmmo;
      s.mags = this.buildMagArray(s.def.clipSize, s.def.reserveAmmo);
    }
    this.bandages = this.role === 'medic' ? 8 : 4;
    this.grenades = 2;
    this.armor = 50;
    sound.playReload();
    if (this.onAwardXp) this.onAwardXp(20, 'AMMO & MAGAZINES RESUPPLIED');
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
    const weaponIds = CLASS_LOADOUTS[roleName] || CLASS_LOADOUTS.engineer;
    this.slots = weaponIds.map((id) => {
      const def = WEAPON_DEFS[id];
      return {
        def,
        clip: def.clipSize,
        reserve: def.reserveAmmo,
        mags: this.buildMagArray(def.clipSize, def.reserveAmmo),
        mesh: createWeaponViewModel(def, this.team)
      };
    });
    this.switchSlot(0);
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
      timer: 60, // lasts 60 seconds
      resupplyRadius: 6
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

    // Check no enemies within 20m
    for (const b of this.botManager.bots) {
      if (b.dead || b.team === this.team) continue;
      if (b.pos.distanceTo(this.pos) < 20) {
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
      timer: 120, // lasts 2 minutes
      team: this.team,
      squad: this.squad
    };
    this.rallyCooldown = 90; // 90s cooldown

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

    // Check if enemy destroyed it (within 8m)
    for (const b of this.botManager.bots) {
      if (b.dead || b.team === this.team) continue;
      if (b.pos.distanceTo(this.rallyPoint.pos) < 8) {
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
    const safeSpawn = this.world.findSafeSpawnPoint(spawnPointVec.x, spawnPointVec.z);
    this.pos.copy(safeSpawn);
    this.vel.set(0, 0, 0);
    this.yaw = team === 'US' ? -Math.PI / 2 : Math.PI / 2;
    this.pitch = 0;
    this.hp = 100;
    this.armor = 50;
    this.bleeding = false;
    this.bandages = role === 'medic' ? 6 : 3;
    this.grenades = 2;
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
        this.reloadTimer *= 0.62;
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
      ? 0.32
      : this.prone
      ? 0.48
      : this.crouching
      ? 1.05
      : 1.65;
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const leanOffset = right.multiplyScalar(this.leanAmount * 0.52);

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
    euler.z = this.downed ? 0.32 : -this.leanAmount * 0.16;
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
      if (this.hp < 100 || this.bleeding) {
        this.bleeding = false;
        this.hp = Math.min(100, this.hp + 12);
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
      this.recoilKickZ = 0.085;
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

    sound.playGunshot(def.soundType, 0);
    this.muzzleFlashTimer = 0.042;
    this.ejectBrassCasing();

    const suppressionSpreadMult = 1 + this.suppressionLevel * 3.5; // Suppression degrades accuracy
    const spread = (this.isAds ? def.spreadAds : def.spreadHip) * suppressionSpreadMult;
    const zeroElevation = this.isAds ? (this.zeroDistance - 100) * 0.00007 : 0;
    const dir = new THREE.Vector3(
      (Math.random() - 0.5) * spread,
      (Math.random() - 0.5) * spread + zeroElevation,
      -1
    ).normalize();
    dir.applyQuaternion(this.camera.getWorldQuaternion(new THREE.Quaternion()));

    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    this.fireBallisticRay(origin, dir, def.damage, def.headshotMult, def.voxelDamage, def.shortName);

    // Apply recoil kick after the round leaves the barrel (Prone reduces recoil by 45%, Crouch by 22%)
    const recoilScale = this.prone ? 0.55 : this.crouching ? 0.78 : 1.0;
    this.recoilKickZ = 0.085 * recoilScale;
    this.recoilOffsetPitch += (def.recoilPitch || 0.014) * recoilScale;
    this.yaw += (Math.random() - 0.5) * (def.recoilYaw || 0.006) * recoilScale;

    if (cur.clip === 0 && cur.reserve > 0) {
      this.startReload();
    }
  }

  fireBallisticRay(origin, dir, damage, headshotMult, voxelDamage, weaponLabel) {
    // 1. Check fast 3D Voxel Grid Raycast (up to 420m across the valley)
    const voxelHit = this.world.raycastVoxel(origin, dir, 420);
    let maxEntityDist = voxelHit ? voxelHit.distance : 420;
    let endPoint = voxelHit
      ? voxelHit.point.clone()
      : origin.clone().addScaledVector(dir, 380);

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

      if (hit.object.userData.bot) {
        const bot = hit.object.userData.bot;
        if (bot.team !== this.team && !bot.dead) {
          const isHeadshot = Boolean(hit.object.userData.isHead);
          const dmg = Math.round(damage * (isHeadshot ? headshotMult : 1));

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

          sound.playHitmarker(res.hitType);
          const hmStyle = res.killed ? 'kill' : res.hitType;
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
            const pts = isHeadshot ? 140 : 100;
            this.score += pts;
            if (this.onAwardXp) {
              this.onAwardXp(
                pts,
                isHeadshot ? `ENEMY KILLED [HEADSHOT] (${bot.name})` : `ENEMY KILLED (${bot.name})`
              );
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
      // Interior wooden furniture/crates (isProp) can be shredded by bullets;
      // structural walls/cover only break from Explosives or Sledgehammer!
      if (voxelHit.voxel && voxelHit.voxel.isProp) {
        this.world.damageVoxel(
          voxelHit.voxel.gx,
          voxelHit.voxel.gy,
          voxelHit.voxel.gz,
          voxelDamage,
          this.onBroadcast
        );
      }
      const impactCol = voxelHit.voxel
        ? voxelHit.voxel.baseColor
        : new THREE.Color(0x6b7c59);
      this.world.spawnBulletImpact(voxelHit.point, voxelHit.normal, impactCol);
    }

    const tracerStart = this.isAds
      ? origin.clone().addScaledVector(dir, 1.35)
      : origin.clone().addScaledVector(dir, 0.45).add(new THREE.Vector3(0, -0.05, 0));

    this.botManager.spawnTracer(tracerStart, endPoint, 0xffeaa7);

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
        origin: origin.toArray(),
        end: endPoint.toArray(),
        weapon: weaponLabel
      });
    }
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
      vel: dir.multiplyScalar(62),
      gravity: 4.2,
      life: 4.5,
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
      vel: dir.multiplyScalar(22),
      gravity: 22,
      life: 2.6, // 2.6-second fuse
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
      vel: dir.multiplyScalar(17),
      gravity: 24,
      life: 60,
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
          5.6,
          250,
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

  useHammer(isBreak = false) {
    this.recoilKickZ = 0.13;
    sound.playBuildHammer();

    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(
      this.camera.getWorldQuaternion(new THREE.Quaternion())
    );

    const hit = this.world.raycastVoxel(origin, dir, 5.2);

    if (isBreak) {
      if (hit && hit.voxel) {
        this.world.damageVoxel(hit.voxel.gx, hit.voxel.gy, hit.voxel.gz, 100, this.onBroadcast);
      }
      return;
    }

    let placePos = origin.clone().addScaledVector(dir, 3.0);
    if (hit) {
      placePos = hit.point.clone().addScaledVector(hit.normal, VOXEL_SIZE * 0.55);
    }

    const g = this.world.worldToGrid(placePos.x, Math.max(0.1, placePos.y), placePos.z);
    const pGrid = this.world.worldToGrid(this.pos.x, this.pos.y + 0.5, this.pos.z);
    if (g.gx === pGrid.gx && g.gz === pGrid.gz && Math.abs(g.gy - pGrid.gy) <= 1) {
      return;
    }

    // Build according to selected BattleBit Squad Fortification Blueprint ([B])
    const bp = this.buildBlueprints[this.buildBlueprintIndex];
    const baseGy = Math.max(0, g.gy);
    const alongX = Math.abs(Math.cos(this.yaw)) >= Math.abs(Math.sin(this.yaw));
    const dx = alongX ? 1 : 0;
    const dz = alongX ? 0 : 1;

    let builtCount = 0;
    const placeBlock = (bx, by, bz, mat = 'sandbag') => {
      if (bx === pGrid.gx && bz === pGrid.gz && Math.abs(by - pGrid.gy) <= 1) return;
      if (this.world.addVoxel(bx, by, bz, mat)) {
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
    } else if (bp === 'HESCO BASTION') {
      // 2x2 reinforced HESCO barrier
      for (const s of [0, 1]) {
        placeBlock(g.gx + dx * s, baseGy, g.gz + dz * s, 'darkConcrete');
        placeBlock(g.gx + dx * s, baseGy + 1, g.gz + dz * s, 'sandbag');
      }
    } else {
      // SANDBAG WALL (2-wide cover)
      placeBlock(g.gx, baseGy, g.gz, 'sandbag');
      placeBlock(g.gx + dx, baseGy, g.gz + dz, 'sandbag');
    }

    if (builtCount > 0 && this.onAwardXp) {
      this.onAwardXp(15, `BUILT ${bp}`);
    }
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
    this.multiKillTimer = 3.5; // 3.5s window for multi-kills

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

  takeDamage(amount, attackerName, attackerTeam, weaponName, onKillFn, attackerPos = null) {
    if (this.dead || this.downed) return;

    // While inside an active Tank, APC, or Armored Car, the armored hull protects the crew's personal HP!
    if (this.activeVehicle && !this.activeVehicle.dead) {
      this.notifyVehicleHit(0, attackerName, weaponName || 'SMALL ARMS DEFLECTED', attackerPos);
      return;
    }

    // Taking direct hits always triggers suppression
    this.applySuppression(Math.min(0.5, amount * 0.015));

    // Body armor absorbs 35% of incoming gunfire until depleted
    if (this.armor > 0 && weaponName !== 'BLEED') {
      const absorbed = Math.min(this.armor, Math.round(amount * 0.35));
      this.armor -= absorbed;
      amount -= absorbed;
    }

    this.hp -= amount;
    if (amount >= 12 && Math.random() < 0.28) {
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
      this.downedTimer = 15.0;
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
    this.hp = 65;
    this.bleeding = false;
    this.viewModelGroup.visible = true;
    sound.playReload();
    if (this.onAwardXp) {
      this.onAwardXp(50, `REVIVED BY ${medicName}!`);
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

    if (accel !== 0) {
      v.forwardSpeed = THREE.MathUtils.lerp(v.forwardSpeed, accel * v.speed, dt * 3.5);
    } else {
      v.forwardSpeed *= Math.pow(0.12, dt);
    }

    if (Math.abs(v.forwardSpeed) > 0.5) {
      v.yaw += steer * dt * 1.65 * Math.sign(v.forwardSpeed);
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
        .add(new THREE.Vector3(0, 4.2, 0))
        .addScaledVector(lookDir, -8.5);
      this.camera.position.copy(camPos);
    } else {
      this.camera.position.set(v.pos.x, v.pos.y + 3.05, v.pos.z);
    }

    const euler = new THREE.Euler(this.pitch + this.recoilOffsetPitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);

    const targetFov = this.isAds ? 42 : 75;
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
        sound.playExplosion(0);
        sound.playRocketLaunch(0);
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
          vel: lookDir.clone().multiplyScalar(115),
          gravity: 2.1,
          life: 3.5,
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
          vel: lookDir.clone().multiplyScalar(92),
          gravity: 2.5,
          life: 3.0,
          owner: this
        });
      } else {
        this.recoilOffsetPitch += 0.009;
        this.addShake(0.06);
        sound.playGunshot('lmg', 0);
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
        this.giveUpProgress += dt / 0.85;
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
      return;
    }

    // Bleeding & Bandaging [Hold H]
    if (this.bleeding) {
      this.bleedTickTimer += dt;
      if (this.bleedTickTimer >= 1.2) {
        this.bleedTickTimer = 0;
        this.takeDamage(3, 'BLEEDING', 'RU', 'BLEED', this.onKillEvent);
        if (this.dead || this.downed) return;
      }
    }

    if (this.keys['KeyH'] && (this.bleeding || this.hp < 100) && this.bandages > 0) {
      this.bandageProgress += dt / (this.role === 'medic' ? 1.25 : 1.9);
      if (this.bandageProgress >= 1) {
        this.bandageProgress = 0;
        this.bleeding = false;
        this.bandages--;
        this.hp = Math.min(100, this.hp + (this.role === 'medic' ? 70 : 50));
        if (this.onAwardXp) this.onAwardXp(15, 'BLEEDING STOPPED');
      }
    } else {
      this.bandageProgress = 0;
    }

    // Same-Key [F] Drag & Revive Downed Friendly Teammates:
    // - Press [F] once to toggle DRAGGING the fallen soldier (move freely with WASD to safe cover)
    // - Keep pressing (hold) [F] continuously to wrap a bandage and REVIVE them!
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
      nearDownedBot = this.botManager.findNearestDownedFriendly(this.pos, this.team, 4.2);
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
      // Holding [F] past 0.16s ("keep pressing") wraps the field bandage to REVIVE!
      if (this.keyFHoldTime >= 0.16) {
        const revDuration = this.role === 'medic' ? 1.15 : 1.75;
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
          const xpPts = draggedFar ? 250 : 200;
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
      this.magPackProgress += dt / 1.3;
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

    // Tactical Leaning (Q / E)
    this.leanTarget = (this.keys['KeyE'] ? 1 : 0) - (this.keys['KeyQ'] ? 1 : 0);
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
      const sightCenterY = cur.def.id === 'mp443' ? -0.056 : -0.082;
      const adsPos = new THREE.Vector3(
        this.swayX * 0.12,
        sightCenterY + this.swayY * 0.12,
        -0.15 + this.recoilKickZ * 0.4
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
        cur.mesh.rotation.set(this.swayY * 1.5, this.swayX * 1.5, cantedRoll);
        if (magMesh) magMesh.position.y = -0.105;
      }

      // Hide 3D weapon mesh once the full ADS optic overlay takes over so there is
      // never a second 3D sight post or frame obstructing the optic lens
      cur.mesh.visible = !(cur.def.opticType && this.adsAmount > 0.55);

      const flash = cur.mesh.getObjectByName('muzzleFlash');
      if (flash) {
        if (this.muzzleFlashTimer > 0) {
          this.muzzleFlashTimer -= dt;
          flash.material.opacity = 0.92;
          flash.rotation.z = Math.random() * Math.PI;
        } else {
          flash.material.opacity = 0;
        }
      }
    }
  }

  // ─── COMMANDER UAV SCAN [U] ───────────────────────────────────────
  activateUAV() {
    if (this.uavCooldown > 0) {
      if (this.onAwardXp) this.onAwardXp(0, `UAV ON COOLDOWN (${Math.ceil(this.uavCooldown)}s)`);
      return;
    }
    if (this.uavActive) return;

    this.uavActive = true;
    this.uavTimer = 20; // 20-second scan
    this.uavCooldown = 60; // 60-second cooldown

    // Reveal all enemy bots within 120m radius of player
    this.uavRevealedBots = [];
    for (const bot of this.botManager.bots) {
      if (bot.dead || bot.team === this.team) continue;
      const dist = bot.pos.distanceTo(this.pos);
      if (dist < 120) {
        bot.uavRevealed = true;
        bot.uavRevealTimer = 20;
        this.uavRevealedBots.push(bot);
      }
    }

    if (this.onAwardXp) this.onAwardXp(50, `UAV SCAN ACTIVE — ${this.uavRevealedBots.length} HOSTILES DETECTED`);
    sound.playRadioBeep(false);
  }

  updateUAV(dt) {
    // UAV cooldown
    if (this.uavCooldown > 0) {
      this.uavCooldown = Math.max(0, this.uavCooldown - dt);
    }

    // UAV scan timer
    if (this.uavActive) {
      this.uavTimer -= dt;
      if (this.uavTimer <= 0) {
        this.uavActive = false;
        this.uavTimer = 0;
        // Clear UAV reveal flags
        for (const bot of this.uavRevealedBots) {
          bot.uavRevealed = false;
          bot.uavRevealTimer = 0;
        }
        this.uavRevealedBots = [];
      } else {
        // Continuously update revealed positions for moving enemies
        for (const bot of this.uavRevealedBots) {
          if (bot.dead) {
            bot.uavRevealed = false;
            bot.uavRevealTimer = 0;
          }
        }
      }
    }

    // Airstrike cooldown
    if (this.airstrikeCooldown > 0) {
      this.airstrikeCooldown = Math.max(0, this.airstrikeCooldown - dt);
    }

    // Active airstrike processing
    if (this.airstrikeTarget) {
      this.airstrikeTarget.timer -= dt;
      if (this.airstrikeTarget.timer <= 0) {
        // Execute the airstrike barrage
        this.executeAirstrikeBarrage();
        this.airstrikeTarget = null;
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
        // Beacon expired or used up
        if (this.insertionBeacon.mesh) {
          this.scene.remove(this.insertionBeacon.mesh);
        }
        this.insertionBeacon = null;
      } else {
        // Check if enemy is within 6m — destroy beacon
        for (const bot of this.botManager.bots) {
          if (bot.dead || bot.team === this.team) continue;
          if (bot.pos.distanceTo(this.insertionBeacon.pos) < 6) {
            if (this.onAwardXp) this.onAwardXp(0, 'INSERTION BEACON DESTROYED BY ENEMY');
            if (this.insertionBeacon.mesh) this.scene.remove(this.insertionBeacon.mesh);
            this.insertionBeacon = null;
            break;
          }
        }
        // Pulse beacon light
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

  // ─── COMMANDER AIRSTRIKE [J] ──────────────────────────────────────
  callAirstrike() {
    if (this.airstrikeCooldown > 0) {
      if (this.onAwardXp) this.onAwardXp(0, `AIRSTRIKE COOLDOWN (${Math.ceil(this.airstrikeCooldown)}s)`);
      return;
    }
    if (this.airstrikeTarget) {
      if (this.onAwardXp) this.onAwardXp(0, 'AIRSTRIKE ALREADY INBOUND');
      return;
    }

    // Aim forward to designate target
    this.syncCameraTransform();
    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(
      this.camera.getWorldQuaternion(new THREE.Quaternion())
    );

    // Project to ground plane
    if (dir.y >= 0) {
      if (this.onAwardXp) this.onAwardXp(0, 'AIM DOWNWARD TO DESIGNATE AIRSTRIKE TARGET');
      return;
    }
    const t = (this.pos.y - origin.y) / dir.y;
    const targetPos = origin.clone().addScaledVector(dir, Math.min(t, 200));
    targetPos.y = this.world.getGroundHeightAt(targetPos.x, targetPos.z);

    // Create visual warning markers
    const markerGroup = new THREE.Group();
    const ringGeo = new THREE.RingGeometry(8, 10, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff3300, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(targetPos.x, targetPos.y + 0.5, targetPos.z);
    markerGroup.add(ring);

    // Vertical beam
    const beamGeo = new THREE.CylinderGeometry(0.15, 0.15, 40, 8);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xff3300, transparent: true, opacity: 0.5 });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(targetPos.x, targetPos.y + 20, targetPos.z);
    markerGroup.add(beam);

    this.scene.add(markerGroup);

    this.airstrikeTarget = {
      pos: targetPos.clone(),
      timer: 8, // 8 second delay
      markers: markerGroup
    };
    this.airstrikeCooldown = 90; // 90 second cooldown

    if (this.onAwardXp) this.onAwardXp(0, 'AIRSTRIKE INBOUND — 8 SECONDS');
    sound.playRadioBeep(false);
  }

  executeAirstrikeBarrage() {
    const target = this.airstrikeTarget;
    if (!target) return;

    // Remove visual markers
    if (target.markers) {
      this.scene.remove(target.markers);
    }

    // Fire 6 explosive projectiles in a spread pattern around the target
    const blastRadius = 12;
    const maxDamage = 280;
    for (let i = 0; i < 6; i++) {
      const offsetX = (Math.random() - 0.5) * 16;
      const offsetZ = (Math.random() - 0.5) * 16;
      const blastPos = new THREE.Vector3(
        target.pos.x + offsetX,
        target.pos.y,
        target.pos.z + offsetZ
      );

      // Destroy voxels in blast zone
      this.world.damageAreaVoxels(blastPos, blastRadius * 0.6, maxDamage * 0.5);

      // Apply explosion damage through callback
      if (this.onExplosionDamage) {
        this.onExplosionDamage(blastPos, blastRadius, maxDamage, this, 0);
      }
    }

    // Massive camera shake for nearby player
    const distToPlayer = this.pos.distanceTo(target.pos);
    if (distToPlayer < 80) {
      this.addShake(Math.max(0.2, (1 - distToPlayer / 80) * 0.95));
    }

    if (this.onAwardXp) this.onAwardXp(75, 'AIRSTRIKE DELIVERED');
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
      spawnsLeft: 2,
      timer: 180 // 3 minute lifetime
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
