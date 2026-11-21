import * as THREE from '../vendor/three.module.js';
import { VoxelWorld } from './world.js?v=17';
import { VehicleManager } from './vehicles.js?v=17';
import { BotManager } from './bots.js?v=17';
import { PlayerController } from './player.js?v=17';
import { NetworkManager } from './network.js?v=17';
import { UIManager } from './ui.js?v=17';
import { TelemetryLogger } from './telemetry.js?v=17';

class BattleBitGame {
  constructor() {
    this.container = document.getElementById('game-container');

    // Scene, Atmospheric Fog & Sky
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87b8d8);
    this.scene.fog = new THREE.FogExp2(0x87b8d8, 0.0014);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.08,
      1100
    );
    this.scene.add(this.camera);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    this.setupLighting();

    // Conquest Match State (400 Tickets per side, 15:00 Match Clock)
    this.ticketsUS = 400;
    this.ticketsRU = 400;
    this.matchTimeRemaining = 15 * 60;
    this.matchEnded = false;
    this.orbitAngle = 0;

    // Core Subsystems + Live Telemetry Logger
    this.telemetry = new TelemetryLogger(this);
    this.world = new VoxelWorld(this.scene);
    this.vehicleManager = new VehicleManager(this.scene, this.world);
    this.botManager = new BotManager(this.scene, this.world);
    this.botManager.onTelemetryEvent = (type, payload) => this.telemetry.logEvent(type, payload);
    this.botManager.initBots(40); // 40 US + 40 RU = 80 active soldiers across the valley

    this.player = new PlayerController(
      this.camera,
      this.scene,
      this.world,
      this.botManager,
      this.vehicleManager
    );
    this.network = new NetworkManager(this.scene, this.world, this.player, this.botManager);
    this.ui = new UIManager(
      this.world,
      this.player,
      this.botManager,
      this.vehicleManager,
      this.network
    );
    this.ui.telemetry = this.telemetry;

    this.wireCallbacks();
    this.setupDemoScenarioIfRequested();

    if (window._pendingDeployClick) {
      window._pendingDeployClick = false;
      this.ui.triggerDeploy();
    }

    window.addEventListener('resize', () => this.onResize());
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  setupDemoScenarioIfRequested() {
    const params = new URLSearchParams(window.location.search);
    const demo = params.get('demo');
    if (!demo) return;

    this.ui.triggerDeploy();
    this.player.deploy('US', 'engineer', new THREE.Vector3(-175, 0, -38));

    const usTank = this.vehicleManager.vehicles.find((v) => v.id === 'us_abrams_fwd_a');
    const ruTank = this.vehicleManager.vehicles.find((v) => v.id === 'ru_t90_fwd_a');

    if (demo === 'tank' && usTank && ruTank) {
      usTank.pos.set(-165, this.world.getGroundHeightAt(-165, -38), -38);
      usTank.yaw = -Math.PI / 2;
      ruTank.pos.set(-134, this.world.getGroundHeightAt(-134, -38), -38);
      ruTank.yaw = Math.PI / 2;
      ruTank.aiPatrol = false;

      this.player.activeVehicle = usTank;
      usTank.driver = this.player;
      this.player.thirdPersonVehicle = true;
      this.player.viewModelGroup.visible = false;
      this.player.yaw = -Math.PI / 2;
      this.player.pitch = -0.04;
      setTimeout(() => {
        if (this.player.activeVehicle) {
          this.player.isFiring = true;
          setTimeout(() => {
            this.player.isFiring = false;
          }, 180);
        }
      }, 350);
    } else if (demo === 'engineers' && ruTank) {
      this.player.pos.set(-172, this.world.getGroundHeightAt(-172, -38), -38);
      this.player.yaw = -Math.PI / 2;
      this.player.pitch = -0.02;
      this.player.switchSlot(2); // Equip RPG-7 in player hands too!

      ruTank.pos.set(-136, this.world.getGroundHeightAt(-136, -38), -38);
      ruTank.yaw = Math.PI / 2;
      ruTank.aiPatrol = false;

      const usEngs = this.botManager.bots.filter((b) => b.team === 'US' && b.role === 'ENGINEER');
      if (usEngs[0]) {
        usEngs[0].pos.set(-162, this.world.getGroundHeightAt(-162, -36), -36);
        usEngs[0].rpgCooldown = 0.25;
      }
      if (usEngs[1]) {
        usEngs[1].pos.set(-161, this.world.getGroundHeightAt(-161, -40.5), -40.5);
        usEngs[1].rpgCooldown = 0.45;
      }
    } else if (demo === 'drag_revive') {
      this.player.pos.set(-170, this.world.getGroundHeightAt(-170, -38), -38);
      this.player.yaw = -Math.PI / 2;
      this.player.pitch = -0.14;

      const usBots = this.botManager.bots.filter((b) => b.team === 'US');
      const downed1 = usBots.find((b) => b.role === 'ASSAULT') || usBots[0];
      const downed2 = usBots.find((b) => b !== downed1 && b.role !== 'MEDIC') || usBots[1];
      const medic = usBots.find((b) => b.role === 'MEDIC') || usBots[2];

      if (downed1) {
        downed1.downed = true;
        downed1.bleedOutTimer = 21.0;
        downed1.pos.set(-168.5, this.world.getGroundHeightAt(-168.5, -38) + 0.22, -38);
        this.player.draggedBot = downed1;
        this.player.reviveTargetBot = downed1;
        this.player.isDraggingAlly = true;
      }
      if (downed2 && medic) {
        downed2.downed = true;
        downed2.bleedOutTimer = 19.5;
        downed2.pos.set(-161, this.world.getGroundHeightAt(-161, -36.5) + 0.22, -36.5);
        medic.pos.set(-162.1, this.world.getGroundHeightAt(-162.1, -36.5), -36.5);
        medic.rescueTarget = downed2;
        downed2.rescuer = medic;
        medic.rescueState = 'DRAG';
        medic.dragGoalPos.set(-166, 0, -35);
      }
    } else if (demo === 'stats' || demo === 'victory') {
      // Seed realistic mid-battle / end-of-battle stats across all 5 Squads (ALPHA-ECHO) and Soldiers
      this.ticketsUS = demo === 'victory' ? 148 : 342;
      this.ticketsRU = demo === 'victory' ? 0 : 286;
      this.matchTimeRemaining = demo === 'victory' ? 312 : 685;
      this.world.flags[0].owner = 'US';
      this.world.flags[0].captureProgress = 100;
      this.world.flags[1].owner = 'US';
      this.world.flags[1].captureProgress = 100;
      this.world.flags[2].owner = 'US';
      this.world.flags[2].captureProgress = 85;
      this.world.flags[3].owner = 'RU';
      this.world.flags[3].captureProgress = -100;
      this.world.flags[4].owner = 'RU';
      this.world.flags[4].captureProgress = -100;

      this.player.kills = 14;
      this.player.deaths = 2;
      this.player.revives = 6;
      this.player.medicKills = 3;
      this.player.vehiclesDestroyed = 3;
      this.player.captures = 4;
      this.player.score = 3850;

      this.botManager.bots.forEach((b, i) => {
        const isUS = b.team === 'US';
        b.kills = Math.max(1, ((i * 7 + (isUS ? 5 : 3)) % 13));
        b.deaths = Math.max(1, ((i * 5 + (isUS ? 2 : 4)) % 10));
        b.revives = b.role === 'MEDIC' ? 3 + (i % 7) : i % 3;
        b.medicKills = i % 4 === 0 ? 1 + (i % 3) : 0;
        b.vehiclesDestroyed = b.role === 'ENGINEER' ? 1 + (i % 3) : 0;
        b.captures = 1 + (i % 4);
        b.score =
          b.kills * 100 +
          b.revives * 200 +
          b.vehiclesDestroyed * 300 +
          b.captures * 200;
      });

      if (demo === 'stats') {
        this.ui.scoreboardEl.classList.remove('hidden');
        this.ui.renderScoreboard();
      } else if (demo === 'victory') {
        this.triggerMatchVictory('US');
      }
    } else if (demo === 'telemetry') {
      // Showcase US Base Motor Pool NPC vehicle boarding, Vehicle Hull Armor Protection,
      // 360° Directional Incoming Fire Indicators, and [F3] Live Telemetry Panel
      const hqTank = this.vehicleManager.vehicles.find((v) => v.id === 'us_abrams_hq');
      if (hqTank) {
        this.player.activeVehicle = hqTank;
        hqTank.driver = this.player;
        this.player.thirdPersonVehicle = true;
        this.player.viewModelGroup.visible = false;
        this.player.yaw = -Math.PI / 2;
        this.player.pitch = -0.06;
        this.vehicleManager.damageVehicle(
          hqTank,
          135,
          'Krechet',
          'RU',
          'RPG-7 HEAT',
          this.player.onKillEvent,
          null,
          new THREE.Vector3(-220, 2, -45)
        );
      }
      this.ui.registerDamageIndicator(
        18,
        new THREE.Vector3(-225, 2, 32),
        false,
        'AK-15 RIFLE FIRE',
        'Strelok'
      );
      if (this.ui.telemetryPanelEl) {
        this.ui.telemetryPanelEl.classList.remove('hidden');
        this.ui.updateTelemetryPanel();
      }
    } else if (demo === 'medic_contested') {
      // Showcase:
      // 1) RU Main Base CONTESTED (all RU defenders inside RU_BASE eliminated while Player is present -> RU Main Base Respawns LOCKED!)
      // 2) Smarter Tactical Medic Situation Assessment (US Medic VoxelMedic assesses threat, pops 3D smoke screen over casualty, crouches & shoots threat before rushing to drag/revive!)
      const bx = 286;
      const bz = -4;
      this.player.pos.set(bx, this.world.getGroundHeightAt(bx, bz), bz);
      this.player.yaw = Math.PI * 0.54; // Looking West-Northwest toward the Medic, casualty & distant threat
      this.player.pitch = -0.06;

      // Move all RU bots outside the 58m RU_BASE perimeter so RU_BASE has 0 defenders and is CONTESTED!
      const ruBots = this.botManager.bots.filter((b) => b.team === 'RU');
      ruBots.forEach((b, idx) => {
        const fx = 105 + (idx % 5) * 14;
        const fz = -75 + Math.floor(idx / 5) * 12;
        b.pos.set(fx, this.world.getGroundHeightAt(fx, fz), fz);
      });

      // Place one RU rifleman at x = 246 (64m from RU_BASE center 310, so outside the 58m base perimeter,
      // but 28m from our US Medic & downed soldier so the Medic detects & engages the threat first!)
      const threatBot = ruBots[0];
      if (threatBot) {
        threatBot.dead = false;
        threatBot.downed = false;
        threatBot.drivingVehicle = null;
        threatBot.mesh.visible = true;
        threatBot.hp = 100;
        threatBot.pos.set(248, this.world.getGroundHeightAt(248, -6), -6);
        threatBot.yaw = -Math.PI / 2;
      }

      // Place a downed US soldier at (272, -5.5) and a US Medic at (277, -2.5) assessing the situation!
      const usBots = this.botManager.bots.filter((b) => b.team === 'US');
      const casualty = usBots.find((b) => b.role === 'ASSAULT') || usBots[0];
      const medic = usBots.find((b) => b.role === 'MEDIC') || usBots[1];
      if (casualty && medic) {
        casualty.dead = false;
        casualty.downed = true;
        casualty.drivingVehicle = null;
        casualty.mesh.visible = true;
        casualty.bleedOutTimer = 21.5;
        casualty.pos.set(272, this.world.getGroundHeightAt(272, -5.5) + 0.22, -5.5);

        medic.dead = false;
        medic.downed = false;
        medic.drivingVehicle = null;
        medic.mesh.visible = true;
        medic.pos.set(276.5, this.world.getGroundHeightAt(276.5, -2.2), -2.2);
        medic.rescueTarget = casualty;
        casualty.rescuer = medic;
        medic.rescueState = 'ASSESS_THREAT';
        medic.assessTimer = 4.5;
        medic.smokePoppedForRescue = false;
        medic.assessedLogged = false;
        medic.shootCooldown = 0.05;
      }

      // Force an immediate contested base evaluation & open [F3] Telemetry panel
      this.botManager.updateContestedBases(this.player, this.player.onAwardXp);
      // Simulate a blocked RU main base respawn event for telemetry visibility
      this.botManager.pickSpawnPosition('RU', 'ALPHA', true);
      if (this.ui.telemetryPanelEl) {
        this.ui.telemetryPanelEl.classList.remove('hidden');
        this.ui.updateTelemetryPanel();
      }
    }
  }

  setupLighting() {
    this.hemiLight = new THREE.HemisphereLight(0xe2f3f5, 0x4b5d3b, 0.78);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff4e0, 1.25);
    this.sunLight.position.set(160, 220, 120);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 550;
    const d = 260;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.scene.add(this.sunLight);
  }

  wireCallbacks() {
    this.ui.onAtmosphereChange = (mode) => {
      this.world.setAtmosphereMode(mode, this.hemiLight, this.sunLight);
    };

    this.ui.onPlayNextRound = () => {
      this.resetMatch();
    };

    this.ui.onBeforeDeploy = () => {
      if (
        this.matchEnded ||
        this.ticketsUS <= 0 ||
        this.ticketsRU <= 0 ||
        this.matchTimeRemaining <= 0
      ) {
        this.ticketsUS = 400;
        this.ticketsRU = 400;
        this.matchTimeRemaining = 15 * 60;
        this.matchEnded = false;
      }
    };

    this.player.onHitmarker = (type, label) => this.ui.showHitmarker(type, label);
    this.player.onDamageTaken = (amount, attackerPos, isArmorHit, weaponName, attackerName) =>
      this.ui.registerDamageIndicator(amount, attackerPos, isArmorHit, weaponName, attackerName);
    this.player.onBroadcast = (payload) => this.network.send(payload);
    this.player.onGetRemoteMeshes = () => this.network.getRemoteMeshes();

    this.player.onAwardXp = (pts, reason) => {
      this.player.score += pts;
      this.ui.addXpNotification(pts, reason);
    };

    this.player.onKillEvent = (killer, kTeam, victim, vTeam, weapon, isHs) => {
      this.ui.addKillfeed(killer, kTeam, victim, vTeam, weapon, isHs);
    };

    this.player.onKillStreakAnnouncement = (text) => {
      this.ui.showKillStreakAnnouncement(text);
    };

    this.player.onFloatingDamage = (worldPos, damage, isHeadshot) => {
      this.ui.spawnFloatingDamage(worldPos, damage, isHeadshot);
    };

    this.player.onCommoRoseOpen = () => {
      this.ui.openCommoRose();
    };
    this.player.onCommoRoseClose = () => {
      this.ui.closeCommoRose();
    };

    // Single-Player NPC Teammate Proximity & Squad Radio Comms
    this.botManager.onBotComms = (bot, text, channel, distM, category) => {
      this.ui.addTacticalCommsMessage(bot.name, bot.role, channel, distM, text, false);
    };

    // Multiplayer Human Teammate Proximity & Squad Radio Comms
    this.network.onRemoteCommsMessage = (msg, rp) => {
      if (!msg || msg.team !== this.player.team) return;
      const rPos = rp ? rp.pos : msg.pos ? new THREE.Vector3().fromArray(msg.pos) : this.player.pos;
      const distM = Math.round(rPos.distanceTo(this.player.pos));
      const inSquad = msg.squad === this.player.squad;
      if (distM <= 48 || inSquad) {
        const channel = distM <= 45 ? 'LOCAL' : 'SQUAD';
        this.ui.addTacticalCommsMessage(
          msg.name || 'ALLY PLAYER',
          msg.role || 'SOLDIER',
          channel,
          distM,
          msg.text,
          false
        );
      }
    };

    this.network.onPlayerJoinedRoom = (msg) => {
      const joinName = msg.name || 'ALLY SOLDIER';
      const joinTeam = msg.team || 'US';
      this.ui.addXpNotification(0, `🌐 ${joinName} [${joinTeam}] JOINED ROOM ${this.network.roomCode}!`);
      this.ui.addTacticalCommsMessage(
        joinName,
        msg.role || 'SOLDIER',
        'SQUAD',
        0,
        `Joined room ${this.network.roomCode} — ready to deploy!`,
        false
      );
      this.ui.updateMultiplayerLobbyUI();
    };

    this.player.onCommoCommand = (cmdId, text, icon) => {
      this.ui.showCommoCallout(cmdId, text, icon);
      this.ui.addTacticalCommsMessage(
        this.network.callsign || 'YOU (LEAD)',
        this.player.role,
        'COMMAND',
        0,
        text,
        true
      );
      if (cmdId !== 'ping') {
        this.player.onAwardXp(15, `SQUAD COMMS: ${text}`);
      }
      // Broadcast over WebSocket / BroadcastChannel / HTTP Relay for Multiplayer teammates
      this.network.send({
        type: 'comms_message',
        name: this.network.callsign || `PLAYER_${this.network.clientId.slice(2, 5).toUpperCase()}`,
        team: this.player.team,
        squad: this.player.squad || 'ALPHA',
        role: this.player.role.toUpperCase(),
        pos: this.player.pos.toArray(),
        cmdId,
        text
      });
      // Friendly AI reaction + verbal reply + order execution
      setTimeout(() => {
        if (!this.player.dead) {
          this.botManager.handlePlayerCommsOrder(this.player, cmdId, text);
        }
      }, 380);
      if (cmdId === 'need_medic' && (this.player.hp < 100 || this.player.bleeding)) {
        const nearMedic = this.botManager.bots.find(
          (b) => !b.dead && !b.downed && b.team === this.player.team && b.role === 'MEDIC' && b.pos.distanceTo(this.player.pos) < 35
        );
        if (nearMedic) {
          this.player.hp = Math.min(this.player.maxHp, this.player.hp + 45);
          this.player.bleeding = false;
          this.player.bandages = Math.min(3, this.player.bandages + 1);
          this.ui.addXpNotification(0, `${nearMedic.name} [MEDIC]: PATCHING YOU UP!`);
        }
      } else if (cmdId === 'need_ammo') {
        const nearSup = this.botManager.bots.find(
          (b) => !b.dead && !b.downed && b.team === this.player.team && b.role === 'SUPPORT' && b.pos.distanceTo(this.player.pos) < 35
        );
        if (nearSup) {
          this.player.grenades = Math.min(2, this.player.grenades + 1);
          for (const slot of this.player.slots) {
            if (slot.mags && slot.mags.length < 6 && slot.def.clipSize > 1) {
              slot.mags.push(slot.def.clipSize);
            }
          }
          this.ui.addXpNotification(0, `${nearSup.name} [SUPPORT]: AMMO RESUPPLIED!`);
        }
      }
      if (this.telemetry) {
        this.telemetry.logEvent('COMMO_ROSE', { command: cmdId, text });
      }
    };

    this.world.onBuildingCollapsed = (centerPos, radius, collapsedCount) => {
      this.player.onAwardXp(250, `🏢 BUILDING DEMOLISHED (${collapsedCount} BLOCKS)!`);
      this.ui.showKillStreakAnnouncement('🏢 BUILDING COLLAPSED!');
      this.applyExplosionDamageToUnits(centerPos, radius, 260, this.player, collapsedCount);
      if (this.telemetry) {
        this.telemetry.logEvent('BUILDING_COLLAPSED', {
          x: Math.round(centerPos.x),
          z: Math.round(centerPos.z),
          blocks: collapsedCount
        });
      }
    };

    this.player.onPlayerDied = () => {
      if (this.player.team === 'US') this.ticketsUS = Math.max(0, this.ticketsUS - 1);
      else this.ticketsRU = Math.max(0, this.ticketsRU - 1);

      setTimeout(() => {
        if (this.player.dead) {
          this.ui.showDeployScreen();
        }
      }, 1600);
    };

    this.player.onExplosionDamage = (blastPos, radius, maxDamage, owner, brokenCount) => {
      this.applyExplosionDamageToUnits(blastPos, radius, maxDamage, owner, brokenCount);
    };

    this.player.onWarCrimeCommitted = (medicName, wasRescuing, totalWarCrimes) => {
      if (this.telemetry) {
        this.telemetry.logEvent('WAR_CRIME_MEDIC_KILL', {
          victim: medicName,
          wasRescuing,
          totalWarCrimes
        });
      }
    };
  }

  applyExplosionDamageToUnits(blastPos, radius, maxDamage, owner, brokenCount = 0) {
    const isPlayerOwner = owner === this.player;
    const ownerName = owner ? owner.name : 'EXPLOSIVE';
    const ownerTeam = owner ? owner.team : 'NEUTRAL';
    const shooterPos = owner && owner.pos ? owner.pos.clone() : blastPos;
    const weaponLabel = maxDamage >= 300 ? '120MM APHE' : maxDamage >= 220 ? 'RPG-7 HEAT' : 'EXPLOSIVE';

    // Camera shake for local player based on blast proximity
    const distToPlayer = this.player.pos.distanceTo(blastPos);
    if (distToPlayer < 48) {
      this.player.addShake(Math.max(0.12, (1 - distToPlayer / 48) * 0.78));
    }

    if (brokenCount >= 3 && isPlayerOwner) {
      this.player.onAwardXp(30, `WALL BREACHED (${brokenCount} BLOCKS)`);
    }

    // Damage local player if on foot and caught in an enemy blast
    if (
      !this.player.dead &&
      !this.player.downed &&
      !this.player.activeVehicle &&
      ownerTeam !== this.player.team &&
      distToPlayer <= radius * 1.4
    ) {
      const pDmg = Math.round(maxDamage * 0.35 * (1 - distToPlayer / (radius * 1.5)));
      if (pDmg > 0) {
        this.player.takeDamage(
          pDmg,
          ownerName,
          ownerTeam,
          weaponLabel,
          this.player.onKillEvent,
          shooterPos
        );
      }
    }

    // Damage enemy soldiers in blast radius
    for (const bot of this.botManager.bots) {
      if (bot.dead || bot.drivingVehicle) continue;
      const dist = bot.pos.distanceTo(blastPos);
      if (dist <= radius * 1.55) {
        const dmg = Math.round(maxDamage * (1 - dist / (radius * 1.65)));
        if (dmg > 0 && bot.team !== ownerTeam) {
          if (isPlayerOwner) {
            this.ui.showHitmarker('normal');
          }
          const res = this.botManager.damageBot(
            bot,
            dmg,
            ownerName,
            ownerTeam,
            weaponLabel,
            false,
            this.player.onKillEvent
          );
          if (res.killed) {
            if (isPlayerOwner) {
              this.player.kills++;
              this.player.onAwardXp(120, `EXPLOSIVE KILL (${bot.name})`);
              if (bot.role === 'MEDIC') {
                this.player.registerMedicWarCrime(bot.name, Boolean(res.wasRescuing));
              }
              const killInfo = this.player.registerKill(bot.name);
              if (killInfo.announcement) {
                this.ui.showKillStreakAnnouncement(killInfo.announcement);
              }
              if (killInfo.streakAnnouncement) {
                this.ui.showKillStreakAnnouncement(killInfo.streakAnnouncement);
              }
            } else if (owner && typeof owner.kills === 'number') {
              owner.kills++;
              if (bot.role === 'MEDIC') {
                owner.medicKills = (owner.medicKills || 0) + 1;
              }
              owner.score = (owner.score || 0) + 120;
            }
          }
        }
      }
    }

    // Damage enemy armored vehicles & tanks in blast radius (Composite armor reduces incoming blast!)
    for (const v of this.vehicleManager.vehicles) {
      if (v.dead) continue;
      const dist = v.pos.distanceTo(blastPos);
      const maxArmorBlast = radius * 1.75 + (v.type === 'tank' ? 1.5 : 0.8);
      if (dist <= maxArmorBlast) {
        const falloff = Math.max(0.35, 1 - dist / (maxArmorBlast + 1.5));
        const armorMult = v.type === 'tank' ? 0.55 : v.type === 'apc' ? 0.75 : 0.9;
        const dmg = Math.round(maxDamage * armorMult * falloff);
        if (dmg > 0 && v.team !== ownerTeam) {
          if (isPlayerOwner) {
            this.ui.showHitmarker('armor', `${v.type === 'tank' ? 'TANK' : 'VEHICLE'} HIT`);
          }
          const destroyed = this.vehicleManager.damageVehicle(
            v,
            dmg,
            ownerName,
            ownerTeam,
            weaponLabel,
            this.player.onKillEvent,
            isPlayerOwner ? this.player.onAwardXp : null,
            shooterPos
          );
          if (destroyed) {
            const ticketCost = v.type === 'tank' ? 8 : 5;
            if (v.team === 'US') this.ticketsUS = Math.max(0, this.ticketsUS - ticketCost);
            else this.ticketsRU = Math.max(0, this.ticketsRU - ticketCost);

            if (this.telemetry) {
              this.telemetry.logEvent('VEHICLE_DESTROYED', {
                vehicle: v.name,
                team: v.team,
                attacker: ownerName,
                weapon: weaponLabel
              });
            }

            if (isPlayerOwner) {
              this.player.vehiclesDestroyed = (this.player.vehiclesDestroyed || 0) + 1;
            } else if (owner && typeof owner.kills === 'number') {
              owner.kills++;
              owner.vehiclesDestroyed = (owner.vehiclesDestroyed || 0) + 1;
              owner.score = (owner.score || 0) + 300;
            }
          }
        }
      }
    }
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    const allUnits = [this.player, ...this.botManager.bots, ...this.network.remotePlayers.values()];

    this.world.update(
      dt,
      allUnits,
      (blastPos, rad, dmg, owner, broken) =>
        this.applyExplosionDamageToUnits(blastPos, rad, dmg, owner, broken),
      (payload) => this.network.send(payload),
      (flag, newOwner) => {
        if (!this.player.dead && newOwner === this.player.team) {
          const d = this.player.pos.distanceTo(flag.pos);
          if (d <= flag.radius * 1.5) {
            this.player.captures = (this.player.captures || 0) + 1;
            this.player.onAwardXp(200, `OBJECTIVE ${flag.id} CAPTURED`);
          }
        }
        for (const b of this.botManager.bots) {
          if (!b.dead && b.team === newOwner && b.pos.distanceTo(flag.pos) <= flag.radius * 1.5) {
            b.captures = (b.captures || 0) + 1;
            b.score = (b.score || 0) + 200;
          }
        }
      },
      this.vehicleManager.vehicles
    );

    this.vehicleManager.update(dt, this.player, this.botManager);

    const onDeployMenu =
      this.ui.deployScreenEl && !this.ui.deployScreenEl.classList.contains('hidden');

    this.botManager.update(
      dt,
      this.player,
      this.player.onKillEvent,
      (team, amount) => {
        if (onDeployMenu || this.matchEnded) return;
        if (team === 'US') this.ticketsUS = Math.max(0, this.ticketsUS - amount);
        else this.ticketsRU = Math.max(0, this.ticketsRU - amount);
      },
      this.vehicleManager,
      this.player.onAwardXp
    );

    // Conquest majority flag ticket bleed, Contested Main Base bleed & Match Timer Win Condition
    // (Paused while the player is sitting on the Deploy Screen so the round never ends before deploying!)
    if (!this.matchEnded && !onDeployMenu) {
      this.matchTimeRemaining = Math.max(0, this.matchTimeRemaining - dt);
      const usFlags = this.world.flags.filter((f) => f.owner === 'US').length;
      const ruFlags = this.world.flags.filter((f) => f.owner === 'RU').length;
      if (usFlags > ruFlags) {
        this.ticketsRU = Math.max(0, this.ticketsRU - (usFlags - ruFlags) * 0.45 * dt);
      } else if (ruFlags > usFlags) {
        this.ticketsUS = Math.max(0, this.ticketsUS - (ruFlags - usFlags) * 0.45 * dt);
      }

      // Contested / Overrun Main Base Ticket Bleed
      if (this.botManager.baseState && this.botManager.baseState.RU.contested) {
        const bleedRate = this.botManager.canTeamRespawn('RU') ? 1.2 : 4.5;
        this.ticketsRU = Math.max(0, this.ticketsRU - bleedRate * dt);
      }
      if (this.botManager.baseState && this.botManager.baseState.US.contested) {
        const bleedRate = this.botManager.canTeamRespawn('US') ? 1.2 : 4.5;
        this.ticketsUS = Math.max(0, this.ticketsUS - bleedRate * dt);
      }

      if (this.ticketsUS <= 0 || this.ticketsRU <= 0 || this.matchTimeRemaining <= 0) {
        const winner = this.ticketsUS >= this.ticketsRU ? 'US' : 'RU';
        this.triggerMatchVictory(winner);
      }
    }

    if (this.player.dead) {
      this.orbitAngle += dt * 0.12;
      this.camera.position.set(
        Math.cos(this.orbitAngle) * 85,
        46,
        Math.sin(this.orbitAngle) * 62
      );
      this.camera.lookAt(0, 4, 0);
    } else {
      this.player.update(dt);
    }

    this.network.update(dt);
    this.ui.update(dt, this.ticketsUS, this.ticketsRU, this.matchTimeRemaining);
    if (this.telemetry) this.telemetry.update(dt);

    this.renderer.render(this.scene, this.camera);
  }

  triggerMatchVictory(winnerTeam) {
    if (this.matchEnded) return;
    this.matchEnded = true;
    this.player.dead = true;
    this.player.downed = false;
    if (this.player.activeVehicle) {
      this.player.activeVehicle.driver = null;
      this.player.activeVehicle = null;
    }
    if (document.pointerLockElement === document.body) {
      document.exitPointerLock();
    }
    this.ui.showVictoryScreen(winnerTeam, this.ticketsUS, this.ticketsRU, this.matchTimeRemaining);
  }

  resetMatch() {
    this.ticketsUS = 400;
    this.ticketsRU = 400;
    this.matchTimeRemaining = 15 * 60;
    this.matchEnded = false;
    this.player.kills = 0;
    this.player.deaths = 0;
    this.player.revives = 0;
    this.player.medicKills = 0;
    this.player.vehiclesDestroyed = 0;
    this.player.captures = 0;
    this.player.score = 0;
    for (const b of this.botManager.bots) {
      b.kills = 0;
      b.deaths = 0;
      b.revives = 0;
      b.medicKills = 0;
      b.vehiclesDestroyed = 0;
      b.captures = 0;
      b.score = 0;
    }
    this.ui.hideVictoryScreen();
    this.ui.showDeployScreen();
  }
}

function bootBattleBitGame() {
  if (!window.game) {
    window.game = new BattleBitGame();
  }
  return window.game;
}

window.forceEnterGame = () => {
  const g = bootBattleBitGame();
  if (g && g.ui) {
    g.ui.triggerDeploy();
  }
};

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', bootBattleBitGame);
} else {
  bootBattleBitGame();
}
