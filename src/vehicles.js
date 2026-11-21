import * as THREE from '../vendor/three.module.js';
import { sound } from './audio.js?v=90';
import { VEHICLE_STATS, PROJECTILES } from './config.js?v=90';
import {
  VEHICLE_DEFS,
  MEDIEVAL_VEHICLE_DEFS,
  JURASSIC_VEHICLE_DEFS
} from './assets/vehicle-defs.js?v=90';
import { createVehicleMesh } from './models/vehicle-model.js?v=90';
import { tmpVec3, tmpVec3Copy } from './utils/VectorPool.js?v=90';
import { events, makeEventBridge } from './events.js?v=90';
import {
  AIRCRAFT_FLIGHT_EVENTS,
  AIRCRAFT_FLIGHT_STATES,
  GROUND_VEHICLE_EVENTS,
  VEHICLE_CM_EVENTS,
  VEHICLE_THERMAL_EVENTS,
  createAircraftFlightFSM,
  createGroundVehicleFSM,
  createVehicleSubsystemsFSM,
  syncAircraftFlightFSM,
  syncGroundVehicleFSM,
  syncVehicleSubsystemsFSM
} from './core/StateMachines.js?v=90';

export class VehicleManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.vehicles = [];
    this.hitMeshes = [];
    this.teamKills = { US: 0, RU: 0 };
    this.teamFunds = {
      US: VEHICLE_STATS.INITIAL_FACTION_FUNDS || 5000,
      RU: VEHICLE_STATS.INITIAL_FACTION_FUNDS || 5000
    };
    this.b2UnlockedByTeam = { US: false, RU: false };
    this.onVehicleRespawn = makeEventBridge(
      'vehicle:respawn',
      (vehicle, cost, category, stage, moneyCost = 0) => ({
        vehicle,
        cost,
        category,
        stage,
        moneyCost
      })
    );

    this.initVehicles();
  }

  getTeamKills(team = 'US') {
    return this.teamKills?.[team] || 0;
  }

  getTeamFunds(team = 'US') {
    return this.teamFunds?.[team] ?? (VEHICLE_STATS.INITIAL_FACTION_FUNDS || 5000);
  }

  addTeamFunds(team = 'US', amount = 0) {
    if (!this.teamFunds) {
      this.teamFunds = { US: 5000, RU: 5000 };
    }
    this.teamFunds[team] = Math.max(0, Math.round((this.teamFunds[team] || 0) + amount));
    return this.teamFunds[team];
  }

  isB2UnlockedForTeam(team = 'US') {
    const reqKills = VEHICLE_STATS.B2_UNLOCK_KILLS || 25;
    return Boolean(this.b2UnlockedByTeam?.[team] || this.getTeamKills(team) >= reqKills);
  }

  recordTeamKillAndCheckB2(team = 'US') {
    if (team !== 'US' && team !== 'RU') return false;
    if (!this.teamKills) this.teamKills = { US: 0, RU: 0 };
    if (!this.b2UnlockedByTeam) this.b2UnlockedByTeam = { US: false, RU: false };
    this.teamKills[team] = (this.teamKills[team] || 0) + 1;
    this.addTeamFunds(team, VEHICLE_STATS.FACTION_KILL_REWARD || 120);

    const reqKills = VEHICLE_STATS.B2_UNLOCK_KILLS || 25;
    if (!this.b2UnlockedByTeam[team] && this.teamKills[team] >= reqKills) {
      this.b2UnlockedByTeam[team] = true;
      for (const v of this.vehicles) {
        if (v && v.team === team && v.aircraftRole === 'b2_spirit' && v.b2LockedUntilKills) {
          v.b2LockedUntilKills = false;
          v.respawnTimer = 0.05;
        }
      }
      events.emit('xp:awarded', {
        amount: 0,
        reason: `🦇 ${team} FORCES REACHED ${reqKills} KILLS — NORTHROP B-2A SPIRIT CARPET BOMBER UNLOCKED AT HQ RUNWAY!`
      });
      return true;
    }
    return false;
  }

  initVehicles() {
    const era = this.world?.era || this.world?.mapDef?.era || 'modern';
    const defsToSpawn =
      era === 'medieval'
        ? MEDIEVAL_VEHICLE_DEFS
        : era === 'jurassic'
        ? JURASSIC_VEHICLE_DEFS
        : VEHICLE_DEFS;
    for (const def of defsToSpawn) {
      const [sx, sy, sz] = def.spawnPos;
      const isPlane = Boolean(def.type === 'plane' || def.isAircraft);
      const isBikeOrAtv = Boolean(
        def.type === 'bike' ||
          def.type === 'atv' ||
          def.type === 'warhorse' ||
          def.type === 'trex_mount' ||
          def.type === 'raptor_mount' ||
          def.type === 'trebuchet' ||
          def.isWarehouseBike ||
          def.isHorseMount
      );
      const halfW = isPlane
        ? 4.5
        : def.type === 'bike'
        ? 0.48
        : def.type === 'atv'
        ? 0.85
        : def.type === 'tank'
        ? 1.95
        : def.type === 'apc'
        ? 1.65
        : 1.45;
      const halfL = isPlane
        ? 4.8
        : def.type === 'bike'
        ? 1.02
        : def.type === 'atv'
        ? 1.22
        : def.type === 'tank'
        ? 3.55
        : def.type === 'apc'
        ? 3.35
        : 2.65;
      const safeSpawn = isPlane
        ? new THREE.Vector3(sx, this.world.getGroundHeightAt(sx, sz) + (sy || 0), sz)
        : isBikeOrAtv
        ? (() => {
            const pushedBike =
              this.world.pushOutOfBuildingFootprint && (def.type === 'bike' || def.type === 'atv')
                ? this.world.pushOutOfBuildingFootprint(sx, sz, 2.4)
                : { x: sx, z: sz };
            return new THREE.Vector3(
              pushedBike.x,
              this.world.getGroundHeightAt(pushedBike.x, pushedBike.z) + (sy || 0),
              pushedBike.z
            );
          })()
        : this.world.findSafeVehicleSpawnPoint
        ? this.world.findSafeVehicleSpawnPoint(sx, sz, def.spawnYaw || 0, halfW, halfL)
        : new THREE.Vector3(sx, this.world.getGroundHeightAt(sx, sz), sz);
      const safePatrolPoints = def.patrolPoints.map((p) => {
        if (isPlane) {
          return new THREE.Vector3(p[0], p[1] || 135, p[2]);
        }
        const pushed = this.world.pushOutOfBuildingFootprint
          ? this.world.pushOutOfBuildingFootprint(p[0], p[2], halfL + 4.5)
          : { x: p[0], z: p[2] };
        return new THREE.Vector3(pushed.x, this.world.getGroundHeightAt(pushed.x, pushed.z), pushed.z);
      });
      const cfg = {
        ...def,
        isAircraft: isPlane,
        spawnPos: safeSpawn,
        patrolPoints: safePatrolPoints
      };
      this.spawnVehicle(cfg);
    }
  }

  spawnVehicle(cfg) {
    const { group, wheels, turretPivot, barrelGroup } = createVehicleMesh(cfg);
    group.position.copy(cfg.spawnPos);
    group.rotation.y = cfg.spawnYaw;
    this.scene.add(group);

    const isInitialReinforcement = false;
    const initialDelay = 0;

    const isPlane = Boolean(cfg.type === 'plane' || cfg.isAircraft);
    const isRegularB2 = Boolean(
      isPlane && cfg.aircraftRole === 'b2_spirit' && !String(cfg.id || '').startsWith('secret_')
    );
    const b2Locked = isRegularB2 && !this.isB2UnlockedForTeam(cfg.team);
    if (isInitialReinforcement || b2Locked) {
      group.visible = false;
    }

    const ticketCost = isPlane
      ? cfg.aircraftRole === 'b2_spirit'
        ? VEHICLE_STATS.TICKET_COST_B2_SPIRIT || 25
        : VEHICLE_STATS.TICKET_COST_PLANE || 12
      : cfg.type === 'tank'
      ? 15
      : cfg.type === 'apc'
      ? 10
      : 5;
    const factionMoneyCost = isPlane
      ? cfg.aircraftRole === 'b2_spirit'
        ? VEHICLE_STATS.FACTION_COST_B2_SPIRIT || 2000
        : VEHICLE_STATS.FACTION_COST_PLANE || 800
      : 0;
    const ticketCategory = isPlane ? 'ARMOR' : cfg.type === 'humvee' ? 'CAR' : 'ARMOR';
    const statBlock = isPlane
      ? cfg.aircraftRole === 'wright_flyer'
        ? VEHICLE_STATS.PLANE_WRIGHT_FLYER
        : cfg.aircraftRole === 'b2_spirit'
        ? VEHICLE_STATS.PLANE_B2_SPIRIT
        : cfg.aircraftRole === 'fighter'
        ? VEHICLE_STATS.PLANE_FIGHTER
        : cfg.aircraftRole === 'gunship'
        ? VEHICLE_STATS.PLANE_GUNSHIP
        : cfg.aircraftRole === 'bomber'
        ? VEHICLE_STATS.PLANE_BOMBER
        : VEHICLE_STATS.PLANE_CAS
      : cfg.isEmplacement
      ? VEHICLE_STATS.EMPLACEMENT
      : cfg.type === 'tank'
      ? VEHICLE_STATS.TANK
      : cfg.type === 'aa'
      ? VEHICLE_STATS.AA_VEHICLE
      : cfg.type === 'apc'
      ? VEHICLE_STATS.APC
      : VEHICLE_STATS.HUMVEE;
    const turnRate =
      cfg.turnRate ?? statBlock.turnRate ?? (cfg.type === 'tank' ? 0.95 : cfg.type === 'apc' ? 1.22 : 1.45);
    const accelRate =
      cfg.accelRate ?? statBlock.accelRate ?? (cfg.type === 'tank' ? 1.35 : cfg.type === 'apc' ? 1.85 : 2.45);
    const brakeRate =
      cfg.brakeRate ?? statBlock.brakeRate ?? (cfg.type === 'tank' ? 2.2 : cfg.type === 'apc' ? 2.6 : 3.2);
    const hullHalfWidth = isPlane
      ? cfg.aircraftRole === 'b2_spirit'
        ? 7.5
        : cfg.aircraftRole === 'wright_flyer'
        ? 6.2
        : 4.8
      : cfg.type === 'warhorse'
      ? 0.28
      : cfg.type === 'raptor_mount'
      ? 0.55
      : cfg.type === 'bike'
      ? 0.48
      : cfg.type === 'atv'
      ? 0.85
      : cfg.isEmplacement
      ? 1.15
      : cfg.type === 'tank'
      ? 1.95
      : cfg.type === 'apc' || cfg.type === 'aa'
      ? 1.65
      : 1.45;
    const hullHalfLength = isPlane
      ? 4.8
      : cfg.type === 'warhorse'
      ? 0.65
      : cfg.type === 'raptor_mount'
      ? 1.1
      : cfg.type === 'bike'
      ? 1.02
      : cfg.type === 'atv'
      ? 1.22
      : cfg.isEmplacement
      ? 1.15
      : cfg.type === 'tank'
      ? 3.55
      : cfg.type === 'apc' || cfg.type === 'aa'
      ? 3.35
      : 2.65;
    const massTonnes = isPlane
      ? 18
      : cfg.type === 'bike'
      ? 0.18
      : cfg.type === 'atv'
      ? 0.42
      : cfg.isEmplacement
      ? 2.5
      : cfg.type === 'tank'
      ? 65
      : cfg.type === 'apc' || cfg.type === 'aa'
      ? 16
      : 5.5;

    const vehicle = {
      ...cfg,
      isAircraft: isPlane,
      turnRate,
      accelRate,
      brakeRate,
      hullHalfWidth,
      hullHalfLength,
      massTonnes,
      ticketCost,
      factionMoneyCost,
      ticketCategory,
      b2LockedUntilKills: b2Locked,
      hp: cfg.maxHp,
      hullIntegrityPct: 100,
      armorZones: { front: 100, left: 100, right: 100, rear: 100 },
      maxEraBlocks: cfg.type === 'tank' ? 6 : cfg.type === 'apc' ? 2 : 0,
      eraBlocksIntact: cfg.type === 'tank' ? 6 : cfg.type === 'apc' ? 2 : 0,
      subsystems: { tracks: 'OK', turret: 'OK', engine: 'OK', optics: 'OK' },
      lastHitZone: 'FRONT',
      lastHitDesc: '',
      climbOffsetY: 0,
      armor: cfg.type === 'warhorse' ? cfg.maxArmor || 120 : 0,
      maxArmor: cfg.type === 'warhorse' ? cfg.maxArmor || 120 : 0,
      dead: isInitialReinforcement || b2Locked,
      respawnTimer: b2Locked ? 999999 : initialDelay,
      replacementTicketPaid: false,
      pos: group.position,
      yaw: cfg.spawnYaw,
      pitch: 0,
      roll: 0,
      turretYaw: cfg.spawnYaw,
      turretPitch: 0,
      forwardSpeed: 0,
      flareCooldown: 0,
      flareActiveTimer: 0,
      aiPilotActive: false,
      aiSortieLaunchDelay: isPlane ? 2.5 + Math.random() * 2.5 : 0,
      driver: null,
      npcDriver: null,
      activeWeaponSlot: 0, // 0 = Main Cannon / Primary, 1 = Secondary / Rockets / A2A Missiles
      maxFireCooldown: 60 / (cfg.rpm || 18),
      fireCooldown: 0,
      coaxCooldown: 0,
      coaxHeat: 0,
      coaxOverheated: false,
      barrelRecoil: 0,
      patrolIndex: 0,
      aiFireTimer: 1.5 + Math.random() * 2.5,
      setupState: cfg.type === 'trebuchet' ? 'UNSET' : 'READY_FIRING',
      setupProgress: cfg.type === 'trebuchet' ? 0 : 1.0,
      crewCalled: false,
      assignedCrewBots: [],
      armSwingTimer: 0,
      bouldersLaunched: 0,
      commandedTargetPos: null,
      mesh: group,
      turretPivot,
      barrelGroup,
      wheels,
      controlSurfaces: group.userData?.controlSurfaces || null,
      vortexTimer: 0
    };

    if (cfg.type === 'trebuchet') {
      if (group.userData?.boulderMesh) group.userData.boulderMesh.visible = false;
      if (group.userData?.fireAuraMesh) group.userData.fireAuraMesh.visible = false;
      if (barrelGroup) barrelGroup.rotation.x = 0.52;
    }

    if (isPlane) {
      createAircraftFlightFSM(vehicle);
    } else {
      createGroundVehicleFSM(vehicle);
    }
    createVehicleSubsystemsFSM(vehicle);

    group.traverse((child) => {
      if (child.isMesh) {
        child.userData.vehicle = vehicle;
        child.frustumCulled = false;
        if (!child.userData.skipHitbox) {
          this.hitMeshes.push(child);
        }
      }
    });

    this.vehicles.push(vehicle);
    return vehicle;
  }

  /**
   * Spawns or repositions the player's personal Armored Warhorse (`warhorse`) when deploying
   * as `mounted_knight` ("Knight on Horse with Bow") in the Medieval Era!
   */
  spawnOrGetPersonalMount(team = 'US', worldPos, yaw = 0, mountType = 'warhorse') {
    const mountId = `player_personal_${mountType}_${team.toLowerCase()}`;
    let existing = this.vehicles.find((v) => v && v.id === mountId);
    const spawnPos = new THREE.Vector3(
      worldPos.x,
      this.world.getGroundHeightAt(worldPos.x, worldPos.z),
      worldPos.z
    );
    if (existing) {
      existing.dead = false;
      existing.hp = existing.maxHp || 340;
      existing.armor = existing.maxArmor || 120;
      existing.respawnTimer = 0;
      existing.driver = null;
      existing.npcDriver = null;
      existing.pos.copy(spawnPos);
      existing.yaw = yaw;
      existing.turretYaw = yaw;
      existing.forwardSpeed = 0;
      existing.mesh.visible = true;
      existing.mesh.position.copy(spawnPos);
      existing.mesh.rotation.set(0, yaw, 0);
      return existing;
    }

    const cfg = {
      id: mountId,
      name:
        team === 'RU'
          ? 'IMPERIAL ROYAL WARHORSE (KNIGHT LONGBOW)'
          : 'ROYAL BARDED DESTRIER WARHORSE (KNIGHT LONGBOW)',
      type: mountType,
      isHorseMount: true,
      team,
      spawnPos,
      spawnYaw: yaw,
      maxHp: 340,
      speed: 12.5,
      accelRate: 1.85,
      brakeRate: 4.5,
      turnRate: 2.8,
      weaponType: 'mounted_warbow',
      rpm: 95,
      patrolPoints: [spawnPos.clone()]
    };
    return this.spawnVehicle(cfg);
  }

  /**
   * Spawns a Squad-style Mountable Base-Building Emplacement (`emplace_hmg`, `emplace_aa`, `emplace_mortar`)
   * inside a constructed gun pit so the player or AI can mount it with [E] and operate it!
   */
  spawnEmplacement(emplaceType, team = 'US', worldPos, yaw = 0) {
    const isUS = team === 'US';
    const nameMap = {
      emplace_hmg: isUS ? '.50 CAL M2HB HMG EMPLACEMENT' : 'NSV 12.7MM HMG EMPLACEMENT',
      emplace_aa: isUS ? 'C-RAM / ZU-23-2 AA + STINGER EMPLACEMENT' : 'ZU-23-2 TWIN 23MM + IGLA AA EMPLACEMENT',
      emplace_mortar: isUS ? '81MM M252 INDIRECT-FIRE MORTAR PIT' : '82MM 2B14 PODNOS MORTAR PIT',
      trebuchet: isUS ? 'ROYAL COUNTERWEIGHT SIEGE TREBUCHET' : 'IMPERIAL COUNTERWEIGHT SIEGE TREBUCHET'
    };
    const rpmMap = {
      emplace_hmg: VEHICLE_STATS.RPM_EMPLACE_HMG || 750,
      emplace_aa: VEHICLE_STATS.RPM_EMPLACE_AA || 1100,
      emplace_mortar: VEHICLE_STATS.RPM_MORTAR || 24,
      trebuchet: 28
    };
    const weaponMap = {
      emplace_hmg: 'hmg',
      emplace_aa: 'aa_autocannon',
      emplace_mortar: 'mortar_tube',
      trebuchet: 'trebuchet_boulder'
    };
    const cfg = {
      id: `${team.toLowerCase()}_${emplaceType}_${Date.now()}_${Math.floor(Math.random() * 999)}`,
      name: nameMap[emplaceType] || '.50 CAL HMG EMPLACEMENT',
      type: emplaceType,
      isEmplacement: true,
      team,
      spawnPos: worldPos.clone(),
      spawnYaw: yaw,
      maxHp: VEHICLE_STATS.EMPLACEMENT.maxHp || 650,
      speed: 0,
      weaponType: weaponMap[emplaceType] || 'hmg',
      rpm: rpmMap[emplaceType] || 750,
      coaxRpm: 35,
      patrolPoints: []
    };
    return this.spawnVehicle(cfg);
  }

  /**
   * Finds the nearest friendly (or uncrewed) Siege Trebuchet within `maxDist` meters of `pos`.
   */
  findNearestTrebuchet(pos, maxDist = 85.0, team = null) {
    let best = null;
    let bestDist = maxDist;
    for (const v of this.vehicles) {
      if (!v || v.dead || v.type !== 'trebuchet') continue;
      if (team && v.team !== team) continue;
      const d = v.pos.distanceTo(pos);
      if (d <= bestDist) {
        bestDist = d;
        best = v;
      }
    }
    return best;
  }

  /**
   * Summons 3 nearby friendly soldiers to run over to a Siege Trebuchet (`treb`), wind the
   * counterweight winch wheels to set it up (`setupProgress: 0 -> 1.0`), load flaming boulders,
   * and continuously hurl boulders toward enemy concentrations & castles!
   * If no friendly trebuchet is within 55m, constructs a new Field Siege Trebuchet frame 9m ahead of the player!
   */
  callMenToSetupTrebuchet(player, botManager, preferredTrebuchet = null) {
    if (!player) return null;
    const team = player.team || 'US';
    let treb = preferredTrebuchet || this.findNearestTrebuchet(player.pos, 65.0, team);

    if (!treb) {
      const fwd = new THREE.Vector3(-Math.sin(player.yaw || 0), 0, -Math.cos(player.yaw || 0));
      const rawX = player.pos.x + fwd.x * 9.5;
      const rawZ = player.pos.z + fwd.z * 9.5;
      const safe = this.world?.pushOutOfBuildingFootprint
        ? this.world.pushOutOfBuildingFootprint(rawX, rawZ, 4.5)
        : { x: rawX, z: rawZ };
      const spawnPos = new THREE.Vector3(
        safe.x,
        this.world ? this.world.getGroundHeightAt(safe.x, safe.z) : player.pos.y,
        safe.z
      );
      treb = this.spawnEmplacement('trebuchet', team, spawnPos, player.yaw || 0);
    }

    // Designate target point along player's sightline (or towards enemy territory)
    const lookFwd = new THREE.Vector3(-Math.sin(player.yaw || 0), 0, -Math.cos(player.yaw || 0));
    const aimDist = 185;
    const tx = THREE.MathUtils.clamp(treb.pos.x + lookFwd.x * aimDist, -980, 980);
    const tz = THREE.MathUtils.clamp(treb.pos.z + lookFwd.z * aimDist, -580, 580);
    const ty = this.world ? this.world.getGroundHeightAt(tx, tz) : 0;
    treb.commandedTargetPos = new THREE.Vector3(tx, ty + 0.5, tz);

    // Summon up to 3 friendly infantry bots to crew & winch this trebuchet
    const crewBots = [];
    if (botManager && Array.isArray(botManager.bots)) {
      const candidates = botManager.bots
        .filter(
          (b) =>
            b &&
            !b.dead &&
            !b.downed &&
            !b.drivingVehicle &&
            b.team === team &&
            (!b.assignedTrebuchet || b.assignedTrebuchet === treb)
        )
        .sort((a, b) => a.pos.distanceToSquared(treb.pos) - b.pos.distanceToSquared(treb.pos));

      for (let i = 0; i < Math.min(3, candidates.length); i++) {
        const b = candidates[i];
        b.assignedTrebuchet = treb;
        b.trebuchetCrewSlot = i;
        // If the summoned soldier is far away (>22m), rally them close to the trebuchet so the player sees them run up!
        if (b.pos.distanceTo(treb.pos) > 22) {
          const angle = (player.yaw || 0) + Math.PI + (i - 1) * 0.65;
          const rx = treb.pos.x + Math.cos(angle) * 11.5;
          const rz = treb.pos.z + Math.sin(angle) * 11.5;
          b.pos.set(rx, this.world ? this.world.getGroundHeightAt(rx, rz) : treb.pos.y, rz);
          if (b.mesh) b.mesh.position.copy(b.pos);
        }
        crewBots.push(b);
      }
    }

    treb.assignedCrewBots = crewBots;
    treb.crewCalled = true;
    if ((treb.setupProgress || 0) < 1.0) {
      treb.setupState = 'SETTING_UP';
      treb.setupProgress = Math.max(treb.setupProgress || 0, 0.25);
    } else {
      treb.setupState = 'READY_FIRING';
      this.fireTrebuchetBoulder(treb, treb.commandedTargetPos, player, botManager);
    }

    sound.playRadioBeep?.(false);
    if (player.onAwardXp) {
      player.onAwardXp(
        35,
        treb.setupState === 'READY_FIRING'
          ? `☄️ SIEGE CREW (${crewBots.length} MEN) LAUNCHING BOULDER BARRAGE FROM ${treb.name}!`
          : `🏰 CALLED ${crewBots.length} MEN TO SET UP ${treb.name} & HURL BOULDERS AT THE ENEMY!`
      );
    }
    return treb;
  }

  /**
   * Launches a flaming counterweight stone boulder from a Siege Trebuchet (`v`) toward `targetPos`
   * with full throwing-arm whip animation!
   */
  fireTrebuchetBoulder(v, targetPos, player = null, botManager = null) {
    if (!v || v.dead || !targetPos) return false;
    v.armSwingTimer = 1.15;
    v.barrelRecoil = 1.45;
    v.bouldersLaunched = (v.bouldersLaunched || 0) + 1;
    v.aiFireTimer = 4.2 + Math.random() * 1.6;

    const distToPlayer = player ? v.pos.distanceTo(player.pos) : 999;
    if (distToPlayer < 220) {
      sound.playRocketLaunch?.(distToPlayer);
      if (player && distToPlayer < 35) {
        player.addShake?.(0.28);
      }
    }
    if (this.world?.spawnDebris) {
      this.world.spawnDebris(
        tmpVec3(v.pos.x, v.pos.y + 4.4, v.pos.z),
        new THREE.Color(0xff7f11),
        7
      );
    }

    const g = PROJECTILES.MORTAR_SHELL?.gravity || 18.0;
    const dx = targetPos.x - v.pos.x;
    const dz = targetPos.z - v.pos.z;
    const dy = (targetPos.y || 0) - (v.pos.y + 4.8);
    const horizDist = Math.max(24, Math.hypot(dx, dz));
    const flightTime = THREE.MathUtils.clamp(2.1 + horizDist / 110, 2.1, 5.8);
    const vx = dx / flightTime;
    const vz = dz / flightTime;
    const vy = (dy + 0.5 * g * flightTime * flightTime) / flightTime;

    const mMesh = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.68, 1),
      new THREE.MeshBasicMaterial({ color: 0xff6b00 })
    );
    mMesh.position.set(v.pos.x, v.pos.y + 4.8, v.pos.z);
    this.scene.add(mMesh);

    const crewLead =
      (Array.isArray(v.assignedCrewBots) && v.assignedCrewBots.find((b) => b && !b.dead)) ||
      v.npcDriver ||
      (v.team === player?.team ? player : null) || {
        name: v.name,
        team: v.team,
        isAiVehicle: true,
        pos: v.pos.clone()
      };

    this.world.projectiles.push({
      type: 'mortar_shell',
      isTrebBoulder: true,
      weaponName: 'SIEGE TREBUCHET BOULDER',
      mesh: mMesh,
      vel: new THREE.Vector3(vx, vy, vz),
      gravity: g,
      life: flightTime + 2.5,
      blastRadius: 14.5,
      blastDamage: 380,
      owner: crewLead
    });
    return true;
  }

  findNearestEnterable(pos, maxDist = 7.5, playerTeam = null) {
    let best = null;
    let bestDist = maxDist;
    for (const v of this.vehicles) {
      if (v.dead || v.driver) continue;
      // Allow player to enter any unoccupied vehicle OR commandeer a friendly NPC-driven vehicle!
      if (v.npcDriver && playerTeam && v.team !== playerTeam) continue;
      if (v.isAircraft && v.aiPilotActive && playerTeam && v.team !== playerTeam) continue;
      const effMax = v.isAircraft ? Math.max(maxDist, 10.5) : maxDist;
      const d = v.pos.distanceTo(pos);
      if (d < effMax && d < bestDist + (v.isAircraft ? 3.5 : 0)) {
        bestDist = d;
        best = v;
      }
    }
    return best;
  }

  /**
   * Finds or launches a friendly Combat Aircraft ('cas' A-10C/Su-25, 'bomber' F-15E/Su-34, or 'fighter' F-22A/Su-57)
   * directly into an airborne sortie over the battlefield for the player!
   */
  findOrLaunchPlayerAircraft(player, preferredRole = 'cas', allowSecretBypass = false) {
    if (!player) return null;
    const team = player.team || 'US';
    if (preferredRole === 'b2_spirit' && !allowSecretBypass && !this.isB2UnlockedForTeam(team)) {
      return null;
    }

    let plane =
      this.vehicles.find(
        (v) =>
          v.isAircraft &&
          v.team === team &&
          v.aircraftRole === preferredRole &&
          !v.driver &&
          (allowSecretBypass || (!v.b2LockedUntilKills && (!v.dead || v.respawnTimer <= 0.5)))
      ) ||
      (preferredRole !== 'b2_spirit'
        ? this.vehicles.find(
            (v) =>
              v.isAircraft &&
              v.team === team &&
              !v.driver &&
              !v.b2LockedUntilKills &&
              (!v.dead || v.respawnTimer <= 0.5)
          )
        : null);

    // Dynamically spawn a B-2A Spirit or 1903 Wright Flyer I ONLY when `allowSecretBypass` is true
    if (!plane && preferredRole === 'b2_spirit' && allowSecretBypass) {
      plane = this.spawnVehicle({
        id: `secret_b2_spirit_${team.toLowerCase()}_${Date.now()}`,
        name:
          team === 'RU'
            ? 'PAK DA / B-2A SPIRIT STEALTH BOMBER'
            : 'NORTHROP B-2A SPIRIT STEALTH BOMBER',
        type: 'plane',
        aircraftRole: 'b2_spirit',
        isAircraft: true,
        isStealthAircraft: true,
        stealthFactor: 0.12,
        team,
        spawnPos: new THREE.Vector3(player.pos.x, 185, player.pos.z),
        spawnYaw: team === 'US' ? -Math.PI / 2 : Math.PI / 2,
        maxHp: 850,
        speed: 125.0,
        weaponType: 'b2_carpet_bomb',
        secondaryWeaponType: 'b2_precision_jdam',
        rpm: 380,
        coaxRpm: 95,
        patrolPoints: []
      });
    } else if (!plane && preferredRole === 'wright_flyer' && allowSecretBypass) {
      plane = this.spawnVehicle({
        id: `secret_wright_flyer_${team.toLowerCase()}_${Date.now()}`,
        name: '1903 WRIGHT FLYER I',
        type: 'plane',
        aircraftRole: 'wright_flyer',
        isAircraft: true,
        isSecretOmegaFlyer: true,
        isStealthAircraft: true,
        stealthFactor: 0.05,
        team,
        spawnPos: new THREE.Vector3(player.pos.x, 75, player.pos.z),
        spawnYaw: team === 'US' ? -Math.PI / 2 : Math.PI / 2,
        maxHp: 99999,
        speed: 235.0,
        weaponType: 'wright_gatling',
        secondaryWeaponType: 'wright_dynamite',
        rpm: 1200,
        coaxRpm: 180,
        patrolPoints: []
      });
    }
    if (plane && preferredRole === 'wright_flyer' && allowSecretBypass) {
      plane.isSecretOmegaFlyer = true;
      plane.maxHp = 99999;
      plane.hp = 99999;
    }

    if (!plane) return null;

    if (plane.npcDriver) {
      plane.npcDriver.drivingVehicle = null;
      plane.npcDriver = null;
    }

    plane.dead = false;
    plane.hp = plane.maxHp;
    plane.mesh.visible = true;
    plane.aiPilotActive = false;
    plane.coaxHeat = 0;
    plane.coaxOverheated = false;
    plane.fireCooldown = 0;
    plane.coaxCooldown = 0;

    // Position the aircraft airborne at 135m altitude entering over the player's sector heading toward enemy lines
    const entryBackDist = 140;
    const headingYaw = team === 'US' ? -Math.PI / 2 : Math.PI / 2;
    const startX = THREE.MathUtils.clamp(
      player.pos.x + (team === 'US' ? -entryBackDist : entryBackDist),
      -1350,
      1350
    );
    const startZ = THREE.MathUtils.clamp(player.pos.z, -650, 650);
    const alt =
      plane.aircraftRole === 'wright_flyer'
        ? 62
        : plane.aircraftRole === 'b2_spirit'
        ? 185
        : plane.aircraftRole === 'gunship'
        ? 165
        : plane.aircraftRole === 'fighter'
        ? 155
        : plane.aircraftRole === 'bomber'
        ? 145
        : 120;

    plane.pos.set(startX, alt, startZ);
    plane.yaw = headingYaw;
    plane.pitch =
      plane.aircraftRole === 'wright_flyer'
        ? 0.0
        : plane.aircraftRole === 'gunship'
        ? -0.02
        : -0.04;
    plane.roll = plane.aircraftRole === 'gunship' ? 0.34 : 0;
    plane.orbitAssist = plane.aircraftRole === 'gunship';
    plane.turretYaw = headingYaw;
    plane.isShotDown = false;
    plane.isStalling = false;
    plane.stallSinkVel = 0;
    plane.throttle = plane.aircraftRole === 'wright_flyer' ? 0.14 : 0.58;
    plane.forwardSpeed =
      plane.aircraftRole === 'wright_flyer'
        ? 13.5
        : plane.speed ||
          (plane.aircraftRole === 'b2_spirit'
            ? 125
            : 62);
    plane.mesh.position.copy(plane.pos);
    plane.mesh.rotation.set(plane.pitch, plane.yaw, plane.roll, 'YXZ');

    return plane;
  }

  /**
   * Returns realistic physical turret gun depression/elevation limits (in radians):
   * - Main Battle Tank (M1A2 / T-90M): -10° depression (-0.18 rad) to +20° max elevation (+0.35 rad)
   * - Wheeled IFV / APC (LAV-25 / BTR-82A): -10° (-0.18 rad) to +30° (+0.52 rad)
   * - Tactical Armored Car / HMG (Humvee / Tigr): -12° (-0.21 rad) to +35° (+0.61 rad)
   * - Dedicated Anti-Air (LAV-AD / Tunguska / ZU-23-2): -8° (-0.14 rad) to +85° (+1.48 rad)
   */
  getVehiclePitchLimits(v) {
    if (!v) return { min: -0.18, max: 0.35 };
    if (v.type === 'aa' || v.type === 'emplace_aa' || v.weaponType === 'aa_autocannon') {
      return { min: -0.14, max: 1.48 };
    }
    if (v.type === 'emplace_mortar' || v.weaponType === 'mortar_tube') {
      return { min: -0.35, max: 0.85 };
    }
    if (v.type === 'tank' || v.weaponType === 'tank_cannon') {
      return { min: -0.18, max: 0.35 };
    }
    if (v.type === 'apc' || v.weaponType === 'autocannon') {
      return { min: -0.18, max: 0.52 };
    }
    return { min: -0.21, max: 0.61 };
  }

  /**
   * Finalizes ground impact explosion for an aircraft that was shot down (`isShotDown = true`)
   * and spiraled into the terrain. If the pilot did NOT press [E] to eject before ground impact,
   * the crash is fatal!
   */
  finalizeShotDownCrash(vehicle) {
    if (!vehicle || vehicle.dead) return;
    const att = vehicle.shotDownAttacker || {};
    const attackerName = att.attackerName || 'GROUND IMPACT';
    const attackerTeam = att.attackerTeam || (vehicle.team === 'US' ? 'RU' : 'US');
    const weaponName = att.weaponName || 'AIRCRAFT CRASH';
    const onKillFn = att.onKillFn || this.onKill || null;
    const onAwardXp = att.onAwardXp || null;

    vehicle.isShotDown = false;
    vehicle.isStalling = false;
    vehicle.stallSinkVel = 0;
    vehicle.hp = 0;
    vehicle.dead = true;
    vehicle.respawnTimer =
      vehicle.aircraftRole === 'b2_spirit'
        ? VEHICLE_STATS.RESPAWN_DELAY_B2_SPIRIT || 90.0
        : VEHICLE_STATS.RESPAWN_DELAY_PLANE || 35.0;
    vehicle.replacementTicketPaid = false;
    vehicle.replacementFundsPaid = false;
    vehicle.mesh.visible = false;
    vehicle.aiPilotActive = false;
    if (vehicle.flightFSM) {
      if (!vehicle.flightFSM.send(AIRCRAFT_FLIGHT_EVENTS.CRASH_IMPACT)) {
        vehicle.flightFSM.send(AIRCRAFT_FLIGHT_EVENTS.DESTROY_GROUND);
      }
    }

    const respawnCost = vehicle.ticketCost || VEHICLE_STATS.TICKET_COST_PLANE || 12;
    const respawnCategory = vehicle.ticketCategory || 'ARMOR';
    events.emit('vehicle:destroyed', {
      vehicle,
      attackerName,
      attackerTeam,
      weaponName,
      cost: respawnCost,
      category: respawnCategory
    });
    events.emit('vehicle:respawn', {
      vehicle,
      cost: respawnCost,
      category: respawnCategory,
      stage: 'VEHICLE_DESTROYED'
    });
    if (this.onVehicleRespawn && !this.onVehicleRespawn._isEventsBridge) {
      this.onVehicleRespawn(vehicle, respawnCost, respawnCategory, 'VEHICLE_DESTROYED');
    }
    vehicle.replacementTicketPaid = true;

    const listenerPos =
      (vehicle.driver && vehicle.driver.pos) ||
      (this.lastPlayer && this.lastPlayer.pos) ||
      null;
    const distToListener = listenerPos ? listenerPos.distanceTo(vehicle.pos) : 0;
    sound.playExplosion(distToListener, 0, 1.35);
    this.world.spawnExplosionVisual(
      tmpVec3(vehicle.pos.x, vehicle.pos.y + 1.8, vehicle.pos.z),
      10.5
    );

    // If the pilot stayed inside the burning plane and failed to press [E] to eject before hitting the ground, they die on impact!
    if (vehicle.driver) {
      const driver = vehicle.driver;
      vehicle.driver = null;
      driver.activeVehicle = null;
      if (driver.viewModelGroup) driver.viewModelGroup.visible = true;
      events.emit('player:exited-vehicle', { vehicle, reason: 'crashed' });
      driver.pos.copy(vehicle.pos);
      driver.pos.y = this.world.getGroundHeightAt(driver.pos.x, driver.pos.z);
      driver.takeDamage(
        9999,
        attackerName,
        attackerTeam,
        `${weaponName} (CRASHED — FAILED TO EJECT [E])`,
        onKillFn,
        vehicle.pos
      );
    }

    events.emit('kill:event', {
      killer: attackerName,
      kTeam: attackerTeam,
      victim: vehicle.name,
      vTeam: vehicle.team,
      weapon: weaponName,
      isHs: false
    });
    if (onKillFn && !onKillFn._isEventsBridge) {
      onKillFn(attackerName, attackerTeam, vehicle.name, vehicle.team, weaponName, false);
    }

    if (onAwardXp) {
      const xpPts = VEHICLE_STATS.DESTROY_XP_PLANE || 350;
      const xpReason = `✈️ AIR-TO-AIR SPLASH KILL! (${vehicle.name})`;
      events.emit('xp:awarded', { amount: xpPts, reason: xpReason });
      if (!onAwardXp._isEventsBridge) {
        onAwardXp(xpPts, xpReason);
      }
    }
  }

  damageVehicle(
    vehicle,
    amount,
    attackerName,
    attackerTeam,
    weaponName,
    onKillFn,
    onAwardXp,
    attackerPos = null
  ) {
    if (vehicle.dead) return false;
    if (vehicle.isShotDown) {
      vehicle.hp = 1;
      return false;
    }
    if (vehicle.type === 'warhorse' && (vehicle.armor || 0) > 0) {
      const absorbed = Math.min(vehicle.armor, Math.round(amount * 0.45));
      vehicle.armor -= absorbed;
      amount = Math.max(1, amount - absorbed);
    }

    // =========================================================================
    // DIRECTIONAL TANK / IFV ARMOR ZONES, COMPOSITE GLACIS, ERA & HULL INTEGRITY
    // =========================================================================
    let hitZone = 'FRONT';
    let armorNote = '';
    const isArmoredGround =
      vehicle.type === 'tank' || vehicle.type === 'apc' || vehicle.type === 'aa';
    if (isArmoredGround) {
      if (!vehicle.armorZones) {
        vehicle.armorZones = { front: 100, left: 100, right: 100, rear: 100 };
      }
      if (!vehicle.subsystems) {
        vehicle.subsystems = { tracks: 'OK', turret: 'OK', engine: 'OK', optics: 'OK' };
      }
      if (attackerPos) {
        const dx = attackerPos.x - vehicle.pos.x;
        const dz = attackerPos.z - vehicle.pos.z;
        const horiz = Math.hypot(dx, dz);
        if (horiz > 0.25) {
          const fwdX = -Math.sin(vehicle.yaw || 0);
          const fwdZ = -Math.cos(vehicle.yaw || 0);
          const rightX = Math.cos(vehicle.yaw || 0);
          const rightZ = -Math.sin(vehicle.yaw || 0);
          const frontDot = (dx * fwdX + dz * fwdZ) / horiz;
          const rightDot = (dx * rightX + dz * rightZ) / horiz;

          if (frontDot >= 0.55) {
            hitZone = 'FRONT';
            if (vehicle.type === 'tank') {
              // Heavy sloped Chobham / Composite Front Glacis deflects 35% of incoming fire
              let mult = 0.65;
              if ((vehicle.eraBlocksIntact || 0) > 0 && amount >= 65) {
                vehicle.eraBlocksIntact--;
                mult = 0.48;
                armorNote = `FRONT ERA REACTIVE BLOCK DETONATED (-52% DMG • ${vehicle.eraBlocksIntact} ERA LEFT)`;
                this.world?.spawnDebris?.(
                  tmpVec3(vehicle.pos.x + fwdX * 2.6, vehicle.pos.y + 1.5, vehicle.pos.z + fwdZ * 2.6),
                  new THREE.Color(0xff9f1a),
                  5
                );
              } else {
                armorNote = 'FRONT COMPOSITE GLACIS DEFLECTION (-35% DMG)';
              }
              amount = Math.max(1, Math.round(amount * mult));
            } else {
              amount = Math.max(1, Math.round(amount * 0.82));
              armorNote = 'FRONTAL ARMOR PLATE (-18% DMG)';
            }
            vehicle.armorZones.front = Math.max(
              0,
              Math.round((vehicle.armorZones.front ?? 100) - (amount / Math.max(1, vehicle.maxHp)) * 135)
            );
          } else if (frontDot <= -0.55) {
            hitZone = 'REAR';
            // Vulnerable Rear Engine Louver Deck takes 1.45x Critical Armor Penetration!
            amount = Math.max(1, Math.round(amount * (vehicle.type === 'tank' ? 1.45 : 1.3)));
            armorNote = 'CRITICAL REAR ENGINE DECK PENETRATION (1.45× DMG!)';
            vehicle.armorZones.rear = Math.max(
              0,
              Math.round((vehicle.armorZones.rear ?? 100) - (amount / Math.max(1, vehicle.maxHp)) * 165)
            );
            if (amount >= 75 || vehicle.armorZones.rear < 55) {
              vehicle.subsystems.engine =
                vehicle.hp - amount < vehicle.maxHp * 0.35 ? 'CRITICAL' : 'SMOKING';
            }
          } else {
            hitZone = rightDot >= 0 ? 'RIGHT' : 'LEFT';
            const sideKey = rightDot >= 0 ? 'right' : 'left';
            if ((vehicle.eraBlocksIntact || 0) > 0 && amount >= 95) {
              vehicle.eraBlocksIntact--;
              amount = Math.max(1, Math.round(amount * 0.72));
              armorNote = `${hitZone} SKIRT ERA BLOCK DETONATED (-28% DMG • ${vehicle.eraBlocksIntact} ERA LEFT)`;
            } else {
              armorNote = `${hitZone} HULL / TRACK SKIRT HIT`;
            }
            vehicle.armorZones[sideKey] = Math.max(
              0,
              Math.round((vehicle.armorZones[sideKey] ?? 100) - (amount / Math.max(1, vehicle.maxHp)) * 145)
            );
            if (amount >= 105 || vehicle.armorZones[sideKey] < 45) {
              vehicle.subsystems.tracks = 'DAMAGED';
              armorNote += ' • TRACK MOBILITY DEGRADED';
            }
            if (amount >= 145 || vehicle.hp - amount < vehicle.maxHp * 0.42) {
              vehicle.subsystems.turret = 'DAMAGED';
            }
          }
        }
      }
      vehicle.lastHitZone = hitZone;
      vehicle.lastHitDesc = armorNote;
    }

    vehicle.hp = Math.max(0, vehicle.hp - amount);
    vehicle.hullIntegrityPct = Math.max(
      0,
      Math.min(100, Math.round((vehicle.hp / Math.max(1, vehicle.maxHp)) * 100))
    );
    if (isArmoredGround && vehicle.subsystems) {
      if (vehicle.hullIntegrityPct < 35) {
        vehicle.subsystems.engine = 'CRITICAL';
      } else if (vehicle.hullIntegrityPct < 65 && vehicle.subsystems.engine === 'OK') {
        vehicle.subsystems.engine = 'SMOKING';
      }
      if (vehicle.hullIntegrityPct < 45 && amount >= 85) {
        vehicle.subsystems.tracks = 'DAMAGED';
      }
    }

    // Notify local player inside the vehicle with directional armor impact indicator!
    if (vehicle.driver && typeof vehicle.driver.notifyVehicleHit === 'function' && amount > 0) {
      const hitLabel = armorNote ? `${weaponName || 'ANTI-ARMOR'} • ${armorNote}` : weaponName || 'ANTI-ARMOR';
      vehicle.driver.notifyVehicleHit(amount, attackerName, hitLabel, attackerPos);
    }

    if (vehicle.hp <= 0) {
      // Airborne planes do NOT immediately explode mid-air! Instead they enter a burning Mayday spiral
      // so the pilot must press [E] to eject their seat before crashing into the ground!
      const groundH = this.world ? this.world.getGroundHeightAt(vehicle.pos.x, vehicle.pos.z) : 0;
      if (vehicle.isAircraft && vehicle.pos.y > groundH + 4.0) {
        vehicle.hp = 1;
        if (!vehicle.flightFSM) createAircraftFlightFSM(vehicle);
        vehicle.flightFSM.send(AIRCRAFT_FLIGHT_EVENTS.SHOT_DOWN_AIRBORNE);
        vehicle.isShotDown = true;
        vehicle.isStalling = false;
        vehicle.stallSinkVel = 0;
        vehicle.aiPilotActive = false;
        vehicle.shotDownTimer = 14.0;
        vehicle.shotDownSpinDir = Math.random() < 0.5 ? -1 : 1;
        vehicle.shotDownAttacker = {
          attackerName: attackerName || 'ANTI-AIR SAM',
          attackerTeam: attackerTeam || (vehicle.team === 'US' ? 'RU' : 'US'),
          weaponName: weaponName || 'ANTI-AIR SAM',
          onKillFn,
          onAwardXp,
          attackerPos
        };

        const listenerPos =
          (vehicle.driver && vehicle.driver.pos) ||
          (this.lastPlayer && this.lastPlayer.pos) ||
          null;
        const distToListener = listenerPos ? listenerPos.distanceTo(vehicle.pos) : 0;
        sound.playExplosion(distToListener, 0, 1.15);
        this.world.spawnExplosionVisual(
          tmpVec3(vehicle.pos.x, vehicle.pos.y + 1.2, vehicle.pos.z),
          5.2
        );

        if (vehicle.driver) {
          if (typeof vehicle.driver.addShake === 'function') {
            vehicle.driver.addShake(0.65);
          }
          if (vehicle.driver.onAwardXp) {
            vehicle.driver.onAwardXp(
              0,
              '🚨 MAYDAY! AIRFRAME SHOT DOWN — PRESS [E] TO EJECT SEAT BEFORE GROUND CRASH!'
            );
          }
        } else if (window.game?.botManager?.bots && vehicle.pos.y > groundH + 16) {
          // Eject an AI pilot with parachute while the burning plane spirals down!
          const pilotBot = window.game.botManager.bots.find(
            (b) => b.team === vehicle.team && !b.drivingVehicle && (b.dead || !b.downed)
          );
          if (pilotBot) {
            pilotBot.dead = false;
            pilotBot.downed = false;
            pilotBot.hp = 85;
            pilotBot.parachuting = true;
            pilotBot.pos.copy(vehicle.pos).add(new THREE.Vector3(0, 4.8, 0));
            pilotBot.mesh.position.copy(pilotBot.pos);
            pilotBot.mesh.visible = true;
          }
        }
        return true;
      }

      vehicle.hp = 0;
      vehicle.dead = true;
      vehicle.isShotDown = false;
      vehicle.isStalling = false;
      vehicle.stallSinkVel = 0;
      // Tiered vehicle replacement delay (B-2 Spirit 90s, Standard Plane 35s, MBT 28s, IFV/APC 22s, Car 15s)
      vehicle.respawnTimer = vehicle.isAircraft
        ? vehicle.aircraftRole === 'b2_spirit'
          ? VEHICLE_STATS.RESPAWN_DELAY_B2_SPIRIT || 90.0
          : VEHICLE_STATS.RESPAWN_DELAY_PLANE || 35.0
        : vehicle.type === 'tank'
        ? VEHICLE_STATS.RESPAWN_DELAY_TANK
        : vehicle.type === 'apc'
        ? VEHICLE_STATS.RESPAWN_DELAY_APC
        : VEHICLE_STATS.RESPAWN_DELAY_HUMVEE;
      vehicle.replacementTicketPaid = false;
      vehicle.replacementFundsPaid = false;
      vehicle.mesh.visible = false;
      vehicle.aiPilotActive = false;
      if (vehicle.flightFSM) {
        vehicle.flightFSM.send(AIRCRAFT_FLIGHT_EVENTS.DESTROY_GROUND);
      }
      if (vehicle.occupancyFSM) {
        vehicle.occupancyFSM.send(GROUND_VEHICLE_EVENTS.DESTROY);
      }

      const respawnCost =
        vehicle.ticketCost ||
        (vehicle.isAircraft
          ? VEHICLE_STATS.TICKET_COST_PLANE || 12
          : vehicle.type === 'tank'
          ? VEHICLE_STATS.TICKET_COST_TANK
          : vehicle.type === 'apc'
          ? VEHICLE_STATS.TICKET_COST_APC
          : VEHICLE_STATS.TICKET_COST_HUMVEE);
      const respawnCategory = vehicle.ticketCategory || (vehicle.type === 'humvee' ? 'CAR' : 'ARMOR');
      events.emit('vehicle:destroyed', {
        vehicle,
        attackerName,
        attackerTeam,
        weaponName: weaponName || 'RPG-7 HEAT',
        cost: respawnCost,
        category: respawnCategory
      });
      events.emit('vehicle:respawn', {
        vehicle,
        cost: respawnCost,
        category: respawnCategory,
        stage: 'VEHICLE_DESTROYED'
      });
      if (this.onVehicleRespawn && !this.onVehicleRespawn._isEventsBridge) {
        this.onVehicleRespawn(vehicle, respawnCost, respawnCategory, 'VEHICLE_DESTROYED');
      }
      vehicle.replacementTicketPaid = true;

      const listenerPos =
        (vehicle.driver && vehicle.driver.pos) ||
        (this.lastPlayer && this.lastPlayer.pos) ||
        null;
      const distToListener = listenerPos ? listenerPos.distanceTo(vehicle.pos) : 0;
      if (vehicle.type === 'warhorse' || vehicle.type === 'raptor_mount' || vehicle.type === 'trex_mount') {
        sound.playMeleeSwing?.(distToListener, 0, true);
        this.world.spawnDebris(
          tmpVec3(vehicle.pos.x, vehicle.pos.y + 1.2, vehicle.pos.z),
          new THREE.Color(0x8b4513),
          6
        );
      } else {
        sound.playExplosion(distToListener, 0, vehicle.isAircraft ? 1.3 : vehicle.type === 'tank' ? 1.2 : 1.0);
        this.world.spawnExplosionVisual(
          tmpVec3(vehicle.pos.x, vehicle.pos.y + 1.6, vehicle.pos.z),
          vehicle.isAircraft ? 9.5 : vehicle.type === 'tank' ? 8.5 : 6.5
        );
      }

      if (vehicle.driver) {
        const driver = vehicle.driver;
        vehicle.driver = null;
        driver.activeVehicle = null;
        if (driver.viewModelGroup) driver.viewModelGroup.visible = true;
        events.emit('player:exited-vehicle', { vehicle, reason: 'destroyed' });
        if (vehicle.isAircraft && typeof driver.activateParachuteEject === 'function') {
          driver.activateParachuteEject(vehicle.pos);
        } else if (vehicle.type === 'warhorse') {
          driver.pos.copy(vehicle.pos);
          driver.pos.y = this.world.getGroundHeightAt(driver.pos.x, driver.pos.z);
        } else {
          driver.pos.x += 2.6;
          driver.pos.y = this.world.getGroundHeightAt(driver.pos.x, driver.pos.z);
        }
        const hasBailoutProtection =
          driver.role === 'armor' ||
          driver.role === 'pilot' ||
          vehicle.type === 'warhorse' ||
          vehicle.type === 'raptor_mount' ||
          vehicle.type === 'trex_mount';
        if (!hasBailoutProtection) {
          driver.takeDamage(
            VEHICLE_STATS.BAILOUT_DAMAGE,
            attackerName,
            attackerTeam,
            `${weaponName || 'RPG-7 HEAT'} (BAIL OUT)`,
            onKillFn,
            attackerPos || vehicle.pos
          );
        } else if (driver.onAwardXp) {
          driver.onAwardXp(
            25,
            vehicle.type === 'warhorse'
              ? `🐴 YOUR WARHORSE WAS SLAIN (${weaponName || 'ENEMY HIT'}) — YOU SURVIVED ON FOOT (${Math.ceil(driver.hp)} HP)!`
              : vehicle.isAircraft
              ? '🪂 ZERO-ZERO PILOT EJECTION SEAT — 0 BAILOUT DAMAGE!'
              : '🛡️ BLOWOUT AMMO RACK SURVIVAL — 0 BAILOUT DAMAGE!'
          );
        }
      }

      if (vehicle.npcDriver) {
        const npc = vehicle.npcDriver;
        vehicle.npcDriver = null;
        npc.drivingVehicle = null;
        const gY = this.world.getGroundHeightAt(vehicle.pos.x, vehicle.pos.z);
        if (vehicle.isAircraft && vehicle.pos.y > gY + 12) {
          // Eject AI Pilot with 3D Parachute Canopy in mid-air!
          npc.dead = false;
          npc.downed = false;
          npc.hp = 75;
          npc.parachuting = true;
          npc.pos.copy(vehicle.pos).add(new THREE.Vector3(0, 4.5, 0));
          npc.mesh.position.copy(npc.pos);
          npc.mesh.visible = true;
        } else if (vehicle.type === 'warhorse') {
          // Separate Horse & Rider Health: When an AI Knight's Warhorse is slain, the Knight survives on foot!
          npc.dead = false;
          npc.downed = false;
          npc.hp = Math.max(45, npc.hp || 100);
          npc.pos.set(vehicle.pos.x, gY, vehicle.pos.z);
          npc.mesh.position.copy(npc.pos);
          npc.mesh.visible = true;
        } else {
          npc.mesh.visible = true;
          npc.pos.copy(vehicle.pos);
          npc.hp = 0;
          npc.downed = false;
          npc.dead = true;
          npc.deaths = (npc.deaths || 0) + 1;
          npc.respawnTimer = 6.5;
          npc.mesh.visible = false;
        }
      } else if (vehicle.isAircraft && !vehicle.driver && window.game?.botManager?.bots) {
        // If an autonomous AI aircraft was shot down in mid-air, eject a surviving AI Pilot with Parachute!
        const gY = this.world.getGroundHeightAt(vehicle.pos.x, vehicle.pos.z);
        if (vehicle.pos.y > gY + 12) {
          const pilotBot = window.game.botManager.bots.find(
            (b) => b.team === vehicle.team && !b.drivingVehicle && (b.dead || !b.downed)
          );
          if (pilotBot) {
            pilotBot.dead = false;
            pilotBot.downed = false;
            pilotBot.hp = 85;
            pilotBot.parachuting = true;
            pilotBot.pos.copy(vehicle.pos).add(new THREE.Vector3(0, 4.8, 0));
            pilotBot.mesh.position.copy(pilotBot.pos);
            pilotBot.mesh.visible = true;
          }
        }
      }

      events.emit('kill:event', {
        killer: attackerName,
        kTeam: attackerTeam,
        victim: vehicle.name,
        vTeam: vehicle.team,
        weapon: weaponName || 'RPG-7 HEAT',
        isHs: false
      });
      if (onKillFn && !onKillFn._isEventsBridge) {
        onKillFn(
          attackerName,
          attackerTeam,
          vehicle.name,
          vehicle.team,
          weaponName || 'RPG-7 HEAT',
          false
        );
      }

      if (onAwardXp) {
        const xpPts = vehicle.isAircraft
          ? VEHICLE_STATS.DESTROY_XP_PLANE || 350
          : vehicle.type === 'tank'
          ? VEHICLE_STATS.DESTROY_XP_TANK
          : VEHICLE_STATS.DESTROY_XP_OTHER;
        const xpReason = vehicle.isAircraft
          ? `✈️ AIR-TO-AIR SPLASH KILL! (${vehicle.name})`
          : `ARMOR DESTROYED (${vehicle.name})`;
        events.emit('xp:awarded', { amount: xpPts, reason: xpReason });
        if (!onAwardXp._isEventsBridge) {
          onAwardXp(xpPts, xpReason);
        }
      }
      return true;
    }
    return false;
  }

  update(dt, player = null, botManager = null, onDeployMenu = false) {
    if (player) this.lastPlayer = player;
    for (const v of this.vehicles) {
      if (v.dead) {
        if (onDeployMenu) continue;
        // B-2 Spirit Stealth Bomber stays locked in hangar until its faction reaches 25 kills!
        if (v.b2LockedUntilKills) {
          if (this.isB2UnlockedForTeam(v.team)) {
            v.b2LockedUntilKills = false;
            v.respawnTimer = 0;
          } else {
            continue;
          }
        }
        v.respawnTimer -= dt;
        if (v.respawnTimer <= 0) {
          // Check if faction can afford the vehicle respawn ticket cost & aircraft money cost
          const cost = v.ticketCost || (v.isAircraft ? 12 : v.type === 'tank' ? 15 : v.type === 'apc' ? 10 : 5);
          const moneyCost = v.isAircraft
            ? v.factionMoneyCost ??
              (v.aircraftRole === 'b2_spirit'
                ? VEHICLE_STATS.FACTION_COST_B2_SPIRIT || 2000
                : VEHICLE_STATS.FACTION_COST_PLANE || 800)
            : 0;
          const category = v.ticketCategory || (v.type === 'humvee' ? 'CAR' : 'ARMOR');
          if (!v.replacementTicketPaid && this.canTeamAffordRespawn && !this.canTeamAffordRespawn(v.team, cost)) {
            v.respawnTimer = 2.0;
            continue;
          }
          if (v.isAircraft && moneyCost > 0 && !v.replacementFundsPaid) {
            if (this.getTeamFunds(v.team) < moneyCost) {
              v.respawnTimer = 4.0;
              continue;
            }
            this.addTeamFunds(v.team, -moneyCost);
            v.replacementFundsPaid = true;
          }
          if (!v.replacementTicketPaid) {
            events.emit('vehicle:respawn', {
              vehicle: v,
              cost,
              moneyCost,
              category,
              stage: 'VEHICLE_RESPAWN'
            });
            if (this.onVehicleRespawn && !this.onVehicleRespawn._isEventsBridge) {
              this.onVehicleRespawn(v, cost, category, 'VEHICLE_RESPAWN', moneyCost);
            }
          }
          // Respawn UNOCCUPIED at its faction's Main Base Motor Pool, Motorcycle Warehouse, or Airfield Runway!
          const safeRespawn =
            v.isAircraft || v.isWarehouseBike || v.type === 'bike' || v.type === 'atv'
              ? v.spawnPos.clone()
              : this.world.findSafeVehicleSpawnPoint
              ? this.world.findSafeVehicleSpawnPoint(
                  v.spawnPos.x,
                  v.spawnPos.z,
                  v.spawnYaw,
                  v.hullHalfWidth || 1.95,
                  v.hullHalfLength || 3.55
                )
              : v.spawnPos;
          v.dead = false;
          v.isShotDown = false;
          v.isStalling = false;
          v.stallSinkVel = 0;
          v.throttle = 0;
          v.replacementTicketPaid = false;
          v.replacementFundsPaid = false;
          v.hp = v.maxHp;
          v.hullIntegrityPct = 100;
          v.armorZones = { front: 100, left: 100, right: 100, rear: 100 };
          v.eraBlocksIntact = v.maxEraBlocks || 0;
          v.subsystems = { tracks: 'OK', turret: 'OK', engine: 'OK', optics: 'OK' };
          v.lastHitZone = 'FRONT';
          v.lastHitDesc = '';
          v.climbOffsetY = 0;
          v.armor = v.maxArmor || 0;
          v.driver = null;
          v.npcDriver = null;
          v.aiPilotActive = false;
          v.aiSortieLaunchDelay = v.isAircraft ? 3.0 : 0;
          v.activeWeaponSlot = 0;
          v.coaxHeat = 0;
          v.coaxOverheated = false;
          v.patrolIndex = 0;
          v.pos.copy(safeRespawn);
          v.yaw = v.spawnYaw;
          v.pitch = 0;
          v.roll = 0;
          v.turretYaw = v.spawnYaw;
          v.forwardSpeed = 0;
          v.barrelRecoil = 0;
          v.mesh.position.copy(safeRespawn);
          v.mesh.rotation.set(0, v.spawnYaw, 0, 'YXZ');
          v.mesh.visible = true;
          if (v.flightFSM) {
            v.flightFSM.send(AIRCRAFT_FLIGHT_EVENTS.RESPAWN_RUNWAY);
          }
          if (v.occupancyFSM) {
            v.occupancyFSM.send(GROUND_VEHICLE_EVENTS.RESPAWN_READY);
          }
          v.cmFSM?.send(VEHICLE_CM_EVENTS.RESET);
          v.thermalFSM?.send(VEHICLE_THERMAL_EVENTS.RESET);
        }
        continue;
      }

      if (v.fireCooldown > 0) v.fireCooldown = Math.max(0, v.fireCooldown - dt);
      if (v.coaxCooldown > 0) v.coaxCooldown = Math.max(0, v.coaxCooldown - dt);
      if (v.flareCooldown > 0) v.flareCooldown = Math.max(0, v.flareCooldown - dt);
      if (v.flareActiveTimer > 0) v.flareActiveTimer = Math.max(0, v.flareActiveTimer - dt);
      if (v.coaxHeat > 0) {
        v.coaxHeat = Math.max(0, v.coaxHeat - dt * (v.coaxOverheated ? 0.34 : 0.42));
        if (v.coaxOverheated && v.coaxHeat <= 0.15) {
          v.coaxOverheated = false;
        }
      }
      syncVehicleSubsystemsFSM(v);
      if (v.barrelRecoil > 0) {
        v.barrelRecoil = Math.max(0, v.barrelRecoil - dt * 1.8);
      }
      if (v.barrelGroup && v.type === 'tank') {
        v.barrelGroup.position.z = 1.35 - v.barrelRecoil * 0.55;
      }

      // Dedicated 3D Flight & AI Dogfight / CAS Loop for Combat Aircraft
      if (v.isAircraft) {
        this.updateAircraftAiAndPhysics(v, dt, player, botManager, onDeployMenu);
        continue;
      }

      // Distance-based 3D Render Culling for unoccupied Motorcycle Warehouse bikes (>220m away)
      if (v.isWarehouseBike && !v.driver && !v.npcDriver && Math.abs(v.forwardSpeed || 0) < 0.05) {
        if (player) {
          const withinWarehouseRender = player.pos.distanceToSquared(v.pos) <= 220 * 220;
          if (v.mesh.visible !== withinWarehouseRender) {
            v.mesh.visible = withinWarehouseRender;
          }
          if (!withinWarehouseRender) {
            continue;
          }
        }
      } else if (!v.dead && !v.mesh.visible) {
        v.mesh.visible = true;
      }

      // Self-healing building footprint guard: ONLY eject if trapped inside a multi-block tall solid wall (>1 block high)
      if (
        (v.driver || v.npcDriver || Math.abs(v.forwardSpeed || 0) > 0.05) &&
        !v.isWarehouseBike &&
        this.world.isInsideBuildingOrContainer &&
        this.world.isInsideBuildingOrContainer(v.pos.x, v.pos.z, 0.25)
      ) {
        const gCenter = this.world.worldToGrid(
          v.pos.x,
          this.world.getGroundHeightAt(v.pos.x, v.pos.z) + 0.5,
          v.pos.z
        );
        const vUp1 = this.world.voxels.get(this.world.key(gCenter.gx, gCenter.gy + 1, gCenter.gz));
        const vUp2 = this.world.voxels.get(this.world.key(gCenter.gx, gCenter.gy + 2, gCenter.gz));
        if ((vUp1 && !vUp1.isProp) || (vUp2 && !vUp2.isProp)) {
          const ejected = this.world.pushOutOfBuildingFootprint(
            v.pos.x,
            v.pos.z,
            (v.hullHalfWidth || 1.95) + 0.85
          );
          v.pos.x = ejected.x;
          v.pos.z = ejected.z;
          v.pos.y = this.world.getGroundHeightAt(v.pos.x, v.pos.z);
          v.mesh.position.copy(v.pos);
        }
      }

      // Sync Hull Integrity Percentage & Progressive Engine Smoke / Fire Embers at Low Hull Integrity
      v.hullIntegrityPct = Math.max(
        0,
        Math.min(100, Math.round((v.hp / Math.max(1, v.maxHp)) * 100))
      );
      if (
        (v.type === 'tank' || v.type === 'apc' || v.type === 'aa') &&
        v.hullIntegrityPct < 65 &&
        this.world?.spawnDebris
      ) {
        v._hullDamageSmokeTimer = (v._hullDamageSmokeTimer || 0) - dt;
        const isCriticalHull = v.hullIntegrityPct < 35;
        if (v._hullDamageSmokeTimer <= 0) {
          v._hullDamageSmokeTimer = isCriticalHull ? 0.14 : 0.28;
          const deckX = v.pos.x + Math.sin(v.yaw) * 2.1 + (Math.random() - 0.5) * 0.6;
          const deckZ = v.pos.z + Math.cos(v.yaw) * 2.1 + (Math.random() - 0.5) * 0.6;
          const smokeCol = isCriticalHull
            ? Math.random() < 0.45
              ? new THREE.Color(0xff5252)
              : new THREE.Color(0x2f3640)
            : new THREE.Color(0x636e72);
          this.world.spawnDebris(
            tmpVec3(deckX, v.pos.y + 1.45, deckZ),
            smokeCol,
            isCriticalHull ? 3 : 1
          );
        }
      }

      // Clear invalid NPC driver if that NPC died or was downed
      if (v.npcDriver && (v.npcDriver.dead || v.npcDriver.downed || v.driver)) {
        v.npcDriver.drivingVehicle = null;
        v.npcDriver = null;
      }
      syncGroundVehicleFSM(v);

      // =====================================================================
      // PHYSICAL NPC DRIVER CONTROL (ONLY when an NPC has walked to the vehicle and boarded it!)
      // =====================================================================
      if (!v.driver && v.npcDriver && v.patrolPoints && v.patrolPoints.length > 0) {
        let wp = v.patrolPoints[v.patrolIndex % v.patrolPoints.length];
        const drv = v.npcDriver;
        const vIdx = Math.max(0, this.vehicles.indexOf(v));
        const vAngle = vIdx * 1.38 + (v.team === 'US' ? 0.35 : -0.35);
        const spacingMode =
          drv.spacingMode ||
          (botManager && botManager.teamSpacingMode && botManager.teamSpacingMode[v.team]) ||
          'FAN_OUT';
        const isStayClose = spacingMode === 'STAY_CLOSE';
        // Dynamic Vehicle Standoff: ~32m–42m in STAY_CLOSE [Num -] vs ~95m–105m (~100m) in FAN_OUT [Num +]!
        const standoffRadius = isStayClose
          ? v.type === 'tank'
            ? VEHICLE_STATS.STANDOFF_CLOSE_TANK
            : v.type === 'apc'
            ? VEHICLE_STATS.STANDOFF_CLOSE_APC
            : VEHICLE_STATS.STANDOFF_CLOSE_HUMVEE
          : v.type === 'tank'
          ? VEHICLE_STATS.STANDOFF_FAN_TANK
          : v.type === 'apc'
          ? VEHICLE_STATS.STANDOFF_FAN_APC
          : VEHICLE_STATS.STANDOFF_FAN_HUMVEE;

        if (drv.playerOrderTimer > 0) {
          if (drv.playerOrderMode === 'OBJECTIVE' && drv.playerOrderFlagIndex >= 0 && this.world.flags[drv.playerOrderFlagIndex]) {
            const flagPos = this.world.flags[drv.playerOrderFlagIndex].pos;
            const rawX = flagPos.x + Math.cos(vAngle) * (standoffRadius * 0.75);
            const rawZ = flagPos.z + Math.sin(vAngle) * (standoffRadius * 0.75);
            const pushed = this.world.pushOutOfBuildingFootprint
              ? this.world.pushOutOfBuildingFootprint(rawX, rawZ, 6.5)
              : { x: rawX, z: rawZ };
            wp = tmpVec3(pushed.x, flagPos.y, pushed.z);
          } else if (drv.playerOrderMode === 'FOLLOW' && player && !player.dead) {
            const rawX = player.pos.x + Math.cos(vAngle) * standoffRadius;
            const rawZ = player.pos.z + Math.sin(vAngle) * standoffRadius;
            const pushed = this.world.pushOutOfBuildingFootprint
              ? this.world.pushOutOfBuildingFootprint(rawX, rawZ, 6.5)
              : { x: rawX, z: rawZ };
            wp = tmpVec3(pushed.x, player.pos.y, pushed.z);
          } else if (drv.playerOrderMode === 'HOLD') {
            wp = v.pos;
          }
        }
        // Route across the nearest bridge if crossing the central river
        let targetX = wp.x;
        let targetZ = wp.z;
        if (Math.sign(v.pos.x) !== Math.sign(targetX) && Math.abs(v.pos.x) < 28) {
          targetX = Math.sign(targetX) * 4;
          targetZ = Math.abs(v.pos.z) < 95 ? 0 : v.pos.z > 0 ? 220 : -220;
        }
        const dx = targetX - v.pos.x;
        const dz = targetZ - v.pos.z;
        const distToWp = Math.hypot(dx, dz);

        // Check distance to Commander/Player so friendly armor & cars stay ~100m away in overwatch!
        const distToCommander =
          player && !player.dead && v.team === player.team
            ? Math.hypot(player.pos.x - v.pos.x, player.pos.z - v.pos.z)
            : 999;
        const inFollowOverwatchRange =
          drv.playerOrderTimer > 0 &&
          drv.playerOrderMode === 'FOLLOW' &&
          distToCommander <= standoffRadius + 6;
        const tooCloseToFriendlyPlayer =
          !player?.activeVehicle && distToCommander < 25;

        if (distToWp < 14.0 || inFollowOverwatchRange || tooCloseToFriendlyPlayer) {
          if (drv.playerOrderTimer > 0 || tooCloseToFriendlyPlayer) {
            const decelStep = (v.brakeRate || 2.8) * 1.45 * dt;
            if (Math.abs(v.forwardSpeed) <= decelStep) {
              v.forwardSpeed = 0;
            } else {
              v.forwardSpeed -= Math.sign(v.forwardSpeed) * decelStep;
            }
            v.engineSpool = Math.max(0, (v.engineSpool || 0) - dt * 1.5);
          } else {
            v.patrolIndex = (v.patrolIndex + 1) % v.patrolPoints.length;
          }
        } else {
          // Vehicle forward vector is (-sin(yaw), -cos(yaw))
          const desiredYaw = Math.atan2(-dx, -dz);
          let yawDiff = desiredYaw - v.yaw;
          while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
          while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
          const aiTurnStep = (v.turnRate || 1.15) * 0.85 * dt;
          v.yaw += THREE.MathUtils.clamp(yawDiff, -aiTurnStep, aiTurnStep);
          const targetSpeed = Math.abs(yawDiff) < 0.65 ? v.speed * 0.72 : v.speed * 0.34;
          // Progressive mass-inertia drivetrain acceleration for AI vehicles (never jumps to top speed)
          v.engineSpool = Math.min(1.0, (v.engineSpool || 0) + dt * (v.type === 'tank' ? 0.48 : 0.68));
          const spdRatio = Math.min(1.1, Math.abs(v.forwardSpeed || 0) / Math.max(1, v.speed || 15));
          const baseMs2 =
            v.type === 'tank'
              ? 3.2
              : v.type === 'apc' || v.type === 'aa'
              ? 4.4
              : v.type === 'warhorse'
              ? 3.1
              : 5.8;
          const stepAccel = baseMs2 * (0.38 + 0.62 * v.engineSpool) * Math.max(0.15, 1 - 0.65 * spdRatio * spdRatio);
          if ((v.forwardSpeed || 0) < targetSpeed) {
            v.forwardSpeed = Math.min(targetSpeed, (v.forwardSpeed || 0) + stepAccel * dt);
          } else {
            v.forwardSpeed = Math.max(targetSpeed, (v.forwardSpeed || 0) - (v.brakeRate || 2.6) * 1.3 * dt);
          }
        }

        // Keep NPC driver's world coordinates synced with the vehicle they are piloting
        v.npcDriver.pos.copy(v.pos);

        // Scan for enemy aircraft (if AA vehicle), enemy occupied vehicles, or enemy soldiers!
        let bestTargetPos = null;
        let bestAirTarget = null;
        const isAaUnit = v.type === 'aa' || v.type === 'emplace_aa' || v.weaponType === 'aa_autocannon';
        const pitchLimits = this.getVehiclePitchLimits(v);
        const turretOriginY = v.pos.y + (v.type === 'tank' ? 2.25 : v.isEmplacement ? 1.45 : 2.5);
        let bestDistSq = isAaUnit
          ? VEHICLE_STATS.ENGAGE_RANGE_AIRCRAFT * VEHICLE_STATS.ENGAGE_RANGE_AIRCRAFT
          : VEHICLE_STATS.ENGAGE_RANGE_VEHICLE * VEHICLE_STATS.ENGAGE_RANGE_VEHICLE;

        const isWithinElevationLimits = (tx, ty, tz) => {
          const horiz = Math.max(0.5, Math.hypot(tx - v.pos.x, tz - v.pos.z));
          const elevRad = Math.atan2(ty - turretOriginY, horiz);
          return elevRad >= pitchLimits.min && elevRad <= pitchLimits.max;
        };

        if (isAaUnit) {
          for (const airV of this.vehicles) {
            if (!airV.isAircraft || airV.dead || airV.team === v.team) continue;
            if (!airV.driver && !airV.aiPilotActive) continue;
            // Low-altitude ground-effect radar masking (< 28m AGL) & 4.0s post-takeoff grace period
            const airGroundY = this.world.getGroundHeightAt(airV.pos.x, airV.pos.z);
            const airAltAgl = Math.max(0, airV.pos.y - airGroundY);
            if (airAltAgl < 28.0 || (airV.airborneRadarTimer || 0) < 4.0 || airV.isLowAltRadarMasked) continue;
            // Northrop B-2A Spirit Stealth Bomber: 88% radar/IR signature reduction (and 100% invisible during [X] RAM Stealth Cloak!)
            const isStealthB2 = airV.aircraftRole === 'b2_spirit' || airV.isStealthAircraft;
            if (isStealthB2 && (airV.flareActiveTimer || 0) > 0) continue;
            const stealthMult = isStealthB2 ? airV.stealthFactor || 0.12 : 1.0;
            const maxAirDist = VEHICLE_STATS.ENGAGE_RANGE_AIRCRAFT * stealthMult;
            const dSq = v.pos.distanceToSquared(airV.pos);
            if (
              dSq < maxAirDist * maxAirDist &&
              dSq < bestDistSq &&
              isWithinElevationLimits(airV.pos.x, airV.pos.y, airV.pos.z)
            ) {
              bestDistSq = dSq;
              bestAirTarget = airV;
              bestTargetPos = tmpVec3(airV.pos.x, airV.pos.y, airV.pos.z);
            }
          }
        }

        if (!bestTargetPos) {
          bestDistSq = VEHICLE_STATS.ENGAGE_RANGE_VEHICLE * VEHICLE_STATS.ENGAGE_RANGE_VEHICLE;
          for (const otherV of this.vehicles) {
            if (otherV.dead || otherV.team === v.team || otherV.isAircraft) continue;
            // Never shell unoccupied parked FOB motorcycles/ATVs
            if (
              !otherV.driver &&
              !otherV.npcDriver &&
              (otherV.isWarehouseBike || otherV.type === 'bike' || otherV.type === 'atv')
            ) {
              continue;
            }
            const dSq = v.pos.distanceToSquared(otherV.pos);
            if (dSq < bestDistSq && isWithinElevationLimits(otherV.pos.x, otherV.pos.y + 1.4, otherV.pos.z)) {
              bestDistSq = dSq;
              bestTargetPos = tmpVec3(otherV.pos.x, otherV.pos.y + 1.4, otherV.pos.z);
            }
          }
        }

        if (!bestTargetPos && botManager) {
          for (const b of botManager.bots) {
            if (b.dead || b.downed || b.drivingVehicle || b.team === v.team) continue;
            if (v.type === 'tank' && b.parachuting) continue;
            const dSq = v.pos.distanceToSquared(b.pos);
            if (
              dSq < VEHICLE_STATS.ENGAGE_RANGE_INFANTRY * VEHICLE_STATS.ENGAGE_RANGE_INFANTRY &&
              dSq < bestDistSq &&
              isWithinElevationLimits(b.pos.x, b.pos.y + 1.1, b.pos.z)
            ) {
              bestDistSq = dSq;
              bestTargetPos = tmpVec3(b.pos.x, b.pos.y + 1.1, b.pos.z);
            }
          }
        }

        if (
          !bestTargetPos &&
          player &&
          !player.dead &&
          !player.downed &&
          player.team !== v.team &&
          !(v.type === 'tank' && player.parachuting)
        ) {
          const dSq = v.pos.distanceToSquared(player.pos);
          if (
            dSq < VEHICLE_STATS.ENGAGE_RANGE_INFANTRY * VEHICLE_STATS.ENGAGE_RANGE_INFANTRY &&
            isWithinElevationLimits(player.pos.x, player.pos.y + 1.2, player.pos.z)
          ) {
            bestTargetPos = tmpVec3(player.pos.x, player.pos.y + 1.2, player.pos.z);
          }
        }

        if (bestTargetPos) {
          const tdx = bestTargetPos.x - v.pos.x;
          const tdz = bestTargetPos.z - v.pos.z;
          const horiz = Math.max(0.5, Math.hypot(tdx, tdz));
          const desiredTurretPitch = THREE.MathUtils.clamp(
            Math.atan2(bestTargetPos.y - turretOriginY, horiz),
            pitchLimits.min,
            pitchLimits.max
          );
          v.turretPitch = THREE.MathUtils.lerp(v.turretPitch || 0, desiredTurretPitch, dt * 4.0);
          const desiredTurretYaw = Math.atan2(-tdx, -tdz);
          let tDiff = desiredTurretYaw - v.turretYaw;
          while (tDiff > Math.PI) tDiff -= Math.PI * 2;
          while (tDiff < -Math.PI) tDiff += Math.PI * 2;
          v.turretYaw += THREE.MathUtils.clamp(tDiff, -1.8 * dt, 1.8 * dt);

          v.aiFireTimer -= dt;
          if (v.aiFireTimer <= 0 && Math.abs(tDiff) < 0.35) {
            v.aiFireTimer =
              v.weaponType === 'tank_cannon'
                ? 3.8 + Math.random() * 2.2
                : v.weaponType === 'aa_autocannon'
                ? 1.35 + Math.random() * 0.75
                : v.weaponType === 'autocannon'
                ? 1.6 + Math.random() * 1.2
                : 1.1 + Math.random() * 0.9;
            this.fireAiVehicleWeapon(v, bestTargetPos, player, bestAirTarget);
          }
        } else {
          v.turretYaw = THREE.MathUtils.lerp(v.turretYaw, v.yaw, dt * 2.0);
          v.turretPitch = THREE.MathUtils.lerp(v.turretPitch || 0, 0, dt * 3.0);
        }
      } else if (!v.driver) {
        // Unoccupied vehicle sits stationary at the Motor Pool (or wherever parked)
        v.forwardSpeed *= Math.pow(0.05, dt);

        // Autonomous Base Air-Defense Sentry for constructed ZU-23-2 / C-RAM AA Emplacements
        if (v.type === 'emplace_aa') {
          let airTarget = null;
          let bestAirSq = VEHICLE_STATS.ENGAGE_RANGE_AIRCRAFT * VEHICLE_STATS.ENGAGE_RANGE_AIRCRAFT;
          for (const airV of this.vehicles) {
            if (!airV.isAircraft || airV.dead || airV.team === v.team) continue;
            if (!airV.driver && !airV.aiPilotActive) continue;
            const isStealthB2 = airV.aircraftRole === 'b2_spirit' || airV.isStealthAircraft;
            if (isStealthB2 && (airV.flareActiveTimer || 0) > 0) continue;
            const stealthMult = isStealthB2 ? airV.stealthFactor || 0.12 : 1.0;
            const maxSq =
              VEHICLE_STATS.ENGAGE_RANGE_AIRCRAFT *
              stealthMult *
              (VEHICLE_STATS.ENGAGE_RANGE_AIRCRAFT * stealthMult);
            const dSq = v.pos.distanceToSquared(airV.pos);
            if (dSq < maxSq && dSq < bestAirSq) {
              bestAirSq = dSq;
              airTarget = airV;
            }
          }
          if (airTarget) {
            const tdx = airTarget.pos.x - v.pos.x;
            const tdz = airTarget.pos.z - v.pos.z;
            const desiredYaw = Math.atan2(-tdx, -tdz);
            let tDiff = desiredYaw - v.turretYaw;
            while (tDiff > Math.PI) tDiff -= Math.PI * 2;
            while (tDiff < -Math.PI) tDiff += Math.PI * 2;
            v.turretYaw += THREE.MathUtils.clamp(tDiff, -2.5 * dt, 2.5 * dt);
            v.aiFireTimer -= dt;
            if (v.aiFireTimer <= 0 && Math.abs(tDiff) < 0.4) {
              v.aiFireTimer = 0.65 + Math.random() * 0.55;
              this.fireAiVehicleWeapon(v, airTarget.pos, player, airTarget);
            }
          }
        }
      }

      // ─── CREW-SERVED MEDIEVAL SIEGE TREBUCHET SETUP & BOULDER BARRAGE LOOP ─────────
      if (v.type === 'trebuchet') {
        if (Array.isArray(v.assignedCrewBots)) {
          v.assignedCrewBots = v.assignedCrewBots.filter(
            (b) => b && !b.dead && !b.downed && b.assignedTrebuchet === v
          );
        } else {
          v.assignedCrewBots = [];
        }

        const crewNearCount = v.assignedCrewBots.filter(
          (b) => b.pos.distanceToSquared(v.pos) <= 13.5 * 13.5
        ).length;

        if (v.driver) {
          v.setupState = 'READY_FIRING';
          v.setupProgress = 1.0;
        } else if (v.crewCalled || crewNearCount > 0) {
          if ((v.setupProgress || 0) < 1.0) {
            v.setupState = 'SETTING_UP';
            const rate = 0.35 + crewNearCount * 0.22;
            v.setupProgress = Math.min(1.0, (v.setupProgress || 0) + dt * rate);
            if (v.setupProgress >= 1.0) {
              v.setupState = 'READY_FIRING';
              v.aiFireTimer = 0.35;
              if (player && v.team === player.team && player.onAwardXp) {
                player.onAwardXp(
                  50,
                  `🏰 ${v.name} SET UP BY SIEGE CREW (${Math.max(1, v.assignedCrewBots.length)} MEN) — HURLING BOULDERS AT ENEMY!`
                );
              }
            }
          } else {
            v.setupState = 'READY_FIRING';
          }
        }

        // Spin rear capstan winch wheels while crew is winching the arm down
        const winchWheels = v.mesh?.userData?.winchWheels;
        if (
          Array.isArray(winchWheels) &&
          (v.setupState === 'SETTING_UP' || (v.setupState === 'READY_FIRING' && (v.armSwingTimer || 0) <= 0 && (v.aiFireTimer || 0) > 1.2))
        ) {
          for (const ww of winchWheels) {
            ww.rotation.x += dt * 2.8;
          }
        }

        // Update throwing arm (`barrelGroup.rotation.x`) & loaded boulder visibility
        const bMesh = v.mesh?.userData?.boulderMesh;
        const fMesh = v.mesh?.userData?.fireAuraMesh;
        if ((v.armSwingTimer || 0) > 0) {
          v.armSwingTimer = Math.max(0, v.armSwingTimer - dt);
          const p = 1.0 - v.armSwingTimer / 1.15;
          if (v.barrelGroup) {
            if (p < 0.32) {
              // Counterweight drops & throwing arm whips rapidly upward (-0.42 -> +0.85)
              const whip = Math.sin(((p / 0.32) * Math.PI) * 0.5);
              v.barrelGroup.rotation.x = THREE.MathUtils.lerp(-0.42, 0.85, whip);
            } else {
              // Arm settles and begins winching back down (+0.85 -> -0.42)
              const rewind = (p - 0.32) / 0.68;
              v.barrelGroup.rotation.x = THREE.MathUtils.lerp(0.85, -0.42, rewind);
            }
          }
          if (bMesh) bMesh.visible = false;
          if (fMesh) fMesh.visible = false;
        } else {
          const prog = THREE.MathUtils.clamp(v.setupProgress || 0, 0, 1);
          if (v.barrelGroup) {
            v.barrelGroup.rotation.x = THREE.MathUtils.lerp(0.52, -0.42, prog);
          }
          const showBoulder = prog >= 0.78;
          if (bMesh) bMesh.visible = showBoulder;
          if (fMesh) fMesh.visible = showBoulder;
        }

        // Autonomous Siege Crew Target Acquisition & Boulder Launching towards the Enemy!
        if (!v.driver && v.setupState === 'READY_FIRING' && !onDeployMenu) {
          let boulderTarget = null;
          let bestScore = Infinity;
          if (botManager && Array.isArray(botManager.bots)) {
            for (const eb of botManager.bots) {
              if (!eb || eb.dead || eb.downed || eb.team === v.team) continue;
              const d = v.pos.distanceTo(eb.pos);
              if (d >= 35 && d <= 520 && d < bestScore) {
                bestScore = d;
                boulderTarget = eb.pos.clone();
              }
            }
          }
          if (!boulderTarget && v.commandedTargetPos) {
            boulderTarget = v.commandedTargetPos.clone();
          }
          if (!boulderTarget && this.world && Array.isArray(this.world.flags)) {
            const enemyFlag =
              this.world.flags.find((fl) => fl.owner !== v.team) || this.world.flags[2];
            if (enemyFlag) {
              boulderTarget = enemyFlag.pos.clone();
            }
          }

          if (boulderTarget) {
            const tdx = boulderTarget.x - v.pos.x;
            const tdz = boulderTarget.z - v.pos.z;
            const desiredYaw = Math.atan2(-tdx, -tdz);
            let tDiff = desiredYaw - v.turretYaw;
            while (tDiff > Math.PI) tDiff -= Math.PI * 2;
            while (tDiff < -Math.PI) tDiff += Math.PI * 2;
            v.turretYaw += THREE.MathUtils.clamp(tDiff, -1.6 * dt, 1.6 * dt);

            v.aiFireTimer = (v.aiFireTimer || 0) - dt;
            if (v.aiFireTimer <= 0 && Math.abs(tDiff) < 0.45) {
              this.fireTrebuchetBoulder(v, boulderTarget, player, botManager);
            }
          }
        }
      }

      if (Math.abs(v.forwardSpeed) > 0.05) {
        const stepDx = -Math.sin(v.yaw) * v.forwardSpeed * dt;
        const stepDz = -Math.cos(v.yaw) * v.forwardSpeed * dt;
        const nextX = v.pos.x + stepDx;
        const nextZ = v.pos.z + stepDz;
        const moveSign = Math.sign(v.forwardSpeed) || 1;
        const fwdX = -Math.sin(v.yaw) * moveSign;
        const fwdZ = -Math.cos(v.yaw) * moveSign;
        const rightX = Math.cos(v.yaw);
        const rightZ = -Math.sin(v.yaw);
        const halfW = v.hullHalfWidth || (v.type === 'tank' ? 1.95 : 1.55);
        const halfL = v.hullHalfLength || (v.type === 'tank' ? 3.55 : 2.95);

        // =====================================================================
        // TANK & VEHICLE 1-BLOCK HIGH OBSTACLE CLIMB / RUN-OVER & WALL SLIDING
        // - Any 1-block high obstacle (v0 at ground level with NO solid wall voxel stacked
        //   above it at gy+1 or gy+2) NEVER blocks a tank or armored vehicle!
        // - Destructible 1-block obstacles (sandbags, props, fortifications) are crushed.
        // - Indestructible 1-block obstacles (or when building destruction is OFF) are
        //   physically climbed and run right over by raising v.climbOffsetY & pitching hull!
        // - Multi-block walls (>= 2 blocks high) deflect/slide the vehicle smoothly along
        //   the wall axis when grazed at an angle instead of stopping dead.
        // =====================================================================
        const evaluateHullCandidate = (candX, candZ, allowCrush = true) => {
          const candGroundY = this.world.getGroundHeightAt(candX, candZ);
          if (v.type === 'warhorse') {
            const horseCheckPts = [
              [candX, candZ],
              [candX + fwdX * 0.55, candZ + fwdZ * 0.55]
            ];
            let maxClimb = 0;
            for (const [hx, hz] of horseCheckPts) {
              const hGroundY = this.world.getGroundHeightAt(hx, hz);
              const g = this.world.worldToGrid(hx, hGroundY + 0.65, hz);
              const v0 = this.world.voxels.get(this.world.key(g.gx, g.gy, g.gz));
              const v1 = this.world.voxels.get(this.world.key(g.gx, g.gy + 1, g.gz));
              const v2 = this.world.voxels.get(this.world.key(g.gx, g.gy + 2, g.gz));
              if ((v1 && !v1.isProp) || (v2 && !v2.isProp)) {
                return { blocked: true, climbY: 0 };
              }
              if (v0 && !v0.isProp) {
                const topH = Math.max(0, (v0.maxY ?? hGroundY + 1.25) - hGroundY);
                if (topH <= 1.45) {
                  maxClimb = Math.max(maxClimb, topH);
                } else {
                  return { blocked: true, climbY: 0 };
                }
              }
            }
            return { blocked: false, climbY: maxClimb };
          }

          const bumperOffsets = [
            [0, 0],
            [halfL + 0.25, 0],
            [halfL + 0.18, halfW * 0.88],
            [halfL + 0.18, -halfW * 0.88],
            [0, halfW * 0.92],
            [0, -halfW * 0.92],
            [-halfL * 0.65, 0]
          ];

          let maxClimb = 0;
          const canClimbOneBlock =
            v.type === 'tank' ||
            v.type === 'apc' ||
            v.type === 'aa' ||
            v.type === 'humvee' ||
            v.type === 'atv' ||
            v.type === 'bike' ||
            v.type === 'trex_mount' ||
            v.type === 'raptor_mount';

          for (let i = 0; i < bumperOffsets.length; i++) {
            const [longOff, latOff] = bumperOffsets[i];
            const checkX = candX + fwdX * longOff + rightX * latOff;
            const checkZ = candZ + fwdZ * longOff + rightZ * latOff;
            const ptGroundY = this.world.getGroundHeightAt(checkX, checkZ);
            const g = this.world.worldToGrid(checkX, ptGroundY + 0.65, checkZ);
            const v0 = this.world.voxels.get(this.world.key(g.gx, g.gy, g.gz));
            const v1 = this.world.voxels.get(this.world.key(g.gx, g.gy + 1, g.gz));
            const v2 = this.world.voxels.get(this.world.key(g.gx, g.gy + 2, g.gz));

            // Check if there is a 2nd or 3rd block stacked above ground level (multi-block wall >= 2.5m)
            const upper1Solid = Boolean(
              v1 && !v1.isProp && v1.type !== 'sandbag' && !(v.type === 'tank' && v1.isFortification)
            );
            const upper2Solid = Boolean(
              v2 && !v2.isProp && v2.type !== 'sandbag' && !(v.type === 'tank' && v2.isFortification)
            );

            if (upper1Solid || upper2Solid) {
              return { blocked: true, climbY: 0 };
            }

            // Crush any destructible upper fortification / sandbag blocks in front of a tank
            if (allowCrush) {
              if (v1 && (v1.type === 'sandbag' || v1.isProp || (v.type === 'tank' && v1.isFortification))) {
                this.world.destroyVoxel(g.gx, g.gy + 1, g.gz, true);
              }
              if (v2 && (v2.type === 'sandbag' || v2.isProp || (v.type === 'tank' && v2.isFortification))) {
                this.world.destroyVoxel(g.gx, g.gy + 2, g.gz, true);
              }
            }

            // 1-Block High Obstacle at ground level (v0 exists, with NO solid upper wall at gy+1 or gy+2)
            if (v0) {
              const canDestroyV0 =
                v0.type === 'sandbag' ||
                v0.isProp ||
                (v.type === 'tank' &&
                  (v0.isFortification || this.world.buildingDestructionEnabled === true));
              if (allowCrush && canDestroyV0) {
                const destroyed = this.world.destroyVoxel(g.gx, g.gy, g.gz, true);
                if (!destroyed && canClimbOneBlock) {
                  // Could not be destroyed (e.g. indestructible 1-block obstacle): Tank climbs right over it!
                  const blockH = Math.min(1.35, Math.max(0.4, (v0.maxY ?? ptGroundY + 1.25) - ptGroundY));
                  maxClimb = Math.max(maxClimb, blockH);
                }
              } else if (canClimbOneBlock) {
                // Indestructible 1-block high obstacle: Tank / APC / Vehicle runs right over it!
                const blockH = Math.min(1.35, Math.max(0.4, (v0.maxY ?? ptGroundY + 1.25) - ptGroundY));
                maxClimb = Math.max(maxClimb, blockH);
              } else {
                return { blocked: true, climbY: 0 };
              }
            }
          }
          return { blocked: false, climbY: maxClimb, groundY: candGroundY };
        };

        let stepRes = evaluateHullCandidate(nextX, nextZ, true);
        let finalX = nextX;
        let finalZ = nextZ;

        // Smooth wall-sliding deflection when grazing a multi-block wall at an oblique angle
        if (stepRes.blocked) {
          const slideX = evaluateHullCandidate(nextX, v.pos.z, false);
          const slideZ = evaluateHullCandidate(v.pos.x, nextZ, false);
          if (!slideX.blocked && Math.abs(stepDx) > 0.001) {
            finalX = nextX;
            finalZ = v.pos.z;
            stepRes = slideX;
            v.forwardSpeed *= 0.92;
          } else if (!slideZ.blocked && Math.abs(stepDz) > 0.001) {
            finalX = v.pos.x;
            finalZ = nextZ;
            stepRes = slideZ;
            v.forwardSpeed *= 0.92;
          }
        }

        if (!stepRes.blocked) {
          v.pos.x = Math.max(-2150, Math.min(2150, finalX));
          v.pos.z = Math.max(-1450, Math.min(1450, finalZ));
          const baseGroundY = this.world.getGroundHeightAt(v.pos.x, v.pos.z);
          const targetClimbY = stepRes.climbY || 0;
          const climbLerpRate = targetClimbY > (v.climbOffsetY || 0) ? 10.5 : 7.5;
          v.climbOffsetY = THREE.MathUtils.lerp(
            v.climbOffsetY || 0,
            targetClimbY,
            Math.min(1, dt * climbLerpRate)
          );
          if (v.climbOffsetY < 0.01) v.climbOffsetY = 0;
          v.pos.y = baseGroundY + v.climbOffsetY;
        } else {
          v.forwardSpeed = 0;
          if (!v.driver && v.npcDriver && v.patrolPoints) {
            v.patrolIndex = (v.patrolIndex + 1) % v.patrolPoints.length;
          }
        }

        if (v.type === 'warhorse' || v.type === 'trex_mount' || v.type === 'raptor_mount') {
          v._legPhase = (v._legPhase || 0) + v.forwardSpeed * dt * 1.45;
          const swingAmp = Math.min(0.68, Math.abs(v.forwardSpeed) * 0.065);
          for (let wi = 0; wi < v.wheels.length; wi++) {
            const phaseOffset = wi % 2 === 0 ? 0 : Math.PI;
            v.wheels[wi].rotation.x = Math.sin(v._legPhase + phaseOffset) * swingAmp;
          }
          if (v.mesh?.userData?.riderGroup) {
            v.mesh.userData.riderGroup.visible =
              v.driver === player ? Boolean(player.thirdPersonVehicle) : Boolean(v.driver || v.npcDriver);
          }
        } else {
          for (const w of v.wheels) {
            w.rotation.x += v.forwardSpeed * dt * (v.type === 'bike' || v.type === 'atv' ? 2.6 : 1.4);
          }
        }

        // Authentic 2-Stroke Blue-Grey Expansion Chamber Exhaust Smoke Puffs (125cc YZ125, 250cc KTM SX, 500cc CR500R)
        if (v.isTwoStroke && Math.abs(v.forwardSpeed) > 2.2 && this.world?.spawnDebris) {
          v._twoStrokeSmokeTimer = (v._twoStrokeSmokeTimer || 0) - dt;
          if (v._twoStrokeSmokeTimer <= 0) {
            v._twoStrokeSmokeTimer = 0.09;
            const exhaustX = v.pos.x + Math.sin(v.yaw) * 0.85;
            const exhaustZ = v.pos.z + Math.cos(v.yaw) * 0.85;
            this.world.spawnDebris(
              tmpVec3(exhaustX, v.pos.y + 0.78, exhaustZ),
              new THREE.Color(0x95afc0),
              1
            );
          }
        }

        // Vehicular Roadkill & Cavalry Warhorse Trample Physics (Tanks, 8x8 APCs, Tactical Cars, Warhorses, Dino Mounts, Motorcycles & ATVs)
        const minRoadkillSpeed =
          v.type === 'tank'
            ? 2.6
            : v.type === 'warhorse' || v.type === 'trex_mount' || v.type === 'raptor_mount'
            ? 3.0
            : v.type === 'apc'
            ? 3.6
            : 4.0;
        if (Math.abs(v.forwardSpeed) >= minRoadkillSpeed && (botManager || player)) {
          this.checkVehicleRoadkills(v, player, botManager);
        }
      }

      if (v.type === 'bike' || v.type === 'atv') {
        if (!v.driver) {
          v.pitch = THREE.MathUtils.lerp(v.pitch || 0, 0, dt * 6.0);
          v.roll = THREE.MathUtils.lerp(v.roll || 0, 0, dt * 6.0);
        }
        v.mesh.rotation.set(v.pitch || 0, v.yaw || 0, v.roll || 0, 'YXZ');

        // Show 3D Articulated Rider Model in 3rd-Person Chase View (or when driven by an AI bot)
        const riderGroup = v.mesh?.userData?.riderGroup;
        if (riderGroup) {
          const showRider = Boolean(
            (v.driver && (v.driver !== player || player.thirdPersonVehicle !== false)) ||
              v.npcDriver
          );
          riderGroup.visible = showRider;
          if (showRider) {
            const rollVal = v.roll || 0;
            riderGroup.rotation.z = rollVal * 0.28;
            riderGroup.position.x = -rollVal * (v.type === 'atv' ? 0.08 : 0.15);
            if (riderGroup.userData?.headPivot) {
              riderGroup.userData.headPivot.rotation.y = rollVal * 0.48;
            }
          }
        }
      } else if (!v.isEmplacement && v.type !== 'trebuchet') {
        // 3D Terrain & 1-Block Obstacle Pitch / Roll Alignment for Moving Tanks, APCs, AA & Tactical Cars
        if (Math.abs(v.forwardSpeed || 0) > 0.05 || (v.climbOffsetY || 0) > 0.01) {
          const fwdX = -Math.sin(v.yaw || 0);
          const fwdZ = -Math.cos(v.yaw || 0);
          const rightX = Math.cos(v.yaw || 0);
          const rightZ = -Math.sin(v.yaw || 0);
          const sampleSupportY = (sx, sz) => {
            const gy = this.world.getGroundHeightAt(sx, sz);
            const g = this.world.worldToGrid(sx, gy + 0.65, sz);
            const v0 = this.world.voxels.get(this.world.key(g.gx, g.gy, g.gz));
            const v1 = this.world.voxels.get(this.world.key(g.gx, g.gy + 1, g.gz));
            if (v0 && !v1 && !v0.isProp) {
              return Math.min(gy + 1.35, v0.maxY ?? gy + 1.25);
            }
            return gy;
          };
          const pSpanL = Math.max(1.2, (v.hullHalfLength || 2.8) * 0.75);
          const pSpanW = Math.max(0.8, (v.hullHalfWidth || 1.6) * 0.75);
          const frontY = sampleSupportY(v.pos.x + fwdX * pSpanL, v.pos.z + fwdZ * pSpanL);
          const rearY = sampleSupportY(v.pos.x - fwdX * pSpanL, v.pos.z - fwdZ * pSpanL);
          const rightY = sampleSupportY(v.pos.x + rightX * pSpanW, v.pos.z + rightZ * pSpanW);
          const leftY = sampleSupportY(v.pos.x - rightX * pSpanW, v.pos.z - rightZ * pSpanW);
          const targetPitch = THREE.MathUtils.clamp(
            Math.atan2(frontY - rearY, pSpanL * 2),
            -0.34,
            0.34
          );
          const targetRoll = THREE.MathUtils.clamp(
            Math.atan2(leftY - rightY, pSpanW * 2),
            -0.28,
            0.28
          );
          v.pitch = THREE.MathUtils.lerp(v.pitch || 0, targetPitch, Math.min(1, dt * 8.5));
          v.roll = THREE.MathUtils.lerp(v.roll || 0, targetRoll, Math.min(1, dt * 8.5));
        }
        v.mesh.position.copy(v.pos);
        v.mesh.rotation.set(v.pitch || 0, v.yaw || 0, v.roll || 0, 'YXZ');
      } else {
        v.mesh.position.copy(v.pos);
        v.mesh.rotation.y = v.yaw;
      }
      v.turretPivot.rotation.y = v.turretYaw - v.yaw + Math.PI;
      if (v.barrelGroup && !v.isAircraft && v.type !== 'emplace_mortar' && v.type !== 'trebuchet') {
        const pLim = this.getVehiclePitchLimits(v);
        const clampedP = THREE.MathUtils.clamp(v.turretPitch || 0, pLim.min, pLim.max);
        v.barrelGroup.rotation.x = -clampedP;
      }
    }

    // Update 3D spatial aircraft flyby engine audio & fade out cockpit engine audio when on foot or in a ground vehicle
    if (player && (!player.activeVehicle || !player.activeVehicle.isAircraft)) {
      sound.updateAircraftEngineAudio?.(
        null,
        this.vehicles,
        player.pos,
        player.yaw || 0,
        false
      );
    }
  }

  /**
   * Checks if a moving Tank (`M1A2 Abrams` / `T-90M`), 8x8 APC (`LAV-25` / `BTR-82A`),
   * Tactical Car (`M1151 Humvee` / `GAZ Tigr`), Motorcycle/ATV, or Cavalry Warhorse (`warhorse`)
   * runs over / tramples enemy soldiers in its oriented footprint.
   */
  checkVehicleRoadkills(v, player, botManager) {
    if (v.dead) return;
    const nowMs = performance.now();
    const fwdX = -Math.sin(v.yaw);
    const fwdZ = -Math.cos(v.yaw);
    const rightX = Math.cos(v.yaw);
    const rightZ = -Math.sin(v.yaw);
    const moveSign = Math.sign(v.forwardSpeed) || 1;
    const absSpd = Math.abs(v.forwardSpeed || 0);
    const isHorse = v.type === 'warhorse';
    const isDino = v.type === 'trex_mount' || v.type === 'raptor_mount';
    // Warhorse Cavalry Trample Hitbox covers the full barded war-steed chest, shoulders & front hooves (1.05m half-width x 1.65m half-length)
    const halfW = isHorse
      ? 1.05
      : isDino
      ? 1.35
      : (v.hullHalfWidth || 1.65) + 0.42;
    const halfL = isHorse
      ? 1.65
      : isDino
      ? 2.15
      : (v.hullHalfLength || 3.1) + 0.52;

    const attackerName =
      v.driver === player && player
        ? player.name
        : v.npcDriver
        ? `${v.npcDriver.name} [${v.type.toUpperCase()}]`
        : v.name;
    const attackerTeam = v.team;
    const roadkillWeapon = isHorse
      ? 'CAVALRY WARHORSE TRAMPLE'
      : isDino
      ? 'THEROPOD STAMPEDE TRAMPLE'
      : v.type === 'tank'
      ? 'ROADKILL (TANK TRACKS)'
      : v.type === 'apc'
      ? 'ROADKILL (8x8 ARMOR)'
      : v.type === 'bike' || v.type === 'atv'
      ? 'ROADKILL (MOTO/ATV)'
      : 'ROADKILL (HUMVEE/TIGR)';
    // Mount & Blade Cavalry Charge Trample Damage scales with Warhorse gait speed:
    // - Trot/Canter (3.0..7.2 m/s): 75..125 DMG + Heavy Hoof Knockback
    // - Full Gallop Charge (>= 7.2 m/s / 26+ km/h): 165 DMG lethal warhorse trample crush!
    const trampleDamage = isHorse
      ? Math.round(THREE.MathUtils.clamp(55 + absSpd * 14.5, 75, 175))
      : 160;
    const onKillCb =
      (player && (player.onKillEvent || player.onKill)) || this.onKill || null;

    // 1. Check enemy NPCs in the vehicle's path (or friendly NPCs if human driver has Friendly Fire ON)
    if (botManager && botManager.bots) {
      const allowFriendlyRoadkill = Boolean(
        v.driver === player && player && player.friendlyFireEnabled
      );
      for (const bot of botManager.bots) {
        if (bot.dead || bot.drivingVehicle || (bot.team === v.team && !allowFriendlyRoadkill)) {
          continue;
        }
        if (bot._lastTrampleHitMs && nowMs - bot._lastTrampleHitMs < 480) {
          continue;
        }
        const dy = Math.abs(bot.pos.y - v.pos.y);
        if (dy > 2.6) continue;

        const dx = bot.pos.x - v.pos.x;
        const dz = bot.pos.z - v.pos.z;
        const longitudinal = dx * fwdX + dz * fwdZ;
        const lateral = dx * rightX + dz * rightZ;

        if (Math.abs(lateral) <= halfW && Math.abs(longitudinal) <= halfL) {
          // Ensure soldier is in front of or underneath the moving hull / hooves
          if (longitudinal * moveSign < -halfL * 0.65) continue;
          bot._lastTrampleHitMs = nowMs;

          // Knock body forward & aside from bumper/tracks/hooves
          const pushSide = lateral >= 0 ? 1 : -1;
          const knockX = bot.pos.x + fwdX * moveSign * (isHorse ? 2.2 : 1.9) + rightX * pushSide * 1.45;
          const knockZ = bot.pos.z + fwdZ * moveSign * (isHorse ? 2.2 : 1.9) + rightZ * pushSide * 1.45;
          if (!botManager.isPointBlocked(knockX, bot.pos.y, knockZ)) {
            bot.pos.x = knockX;
            bot.pos.z = knockZ;
            bot.pos.y = this.world.getGroundHeightAt(bot.pos.x, bot.pos.z);
          }
          if (typeof bot.velX === 'number') {
            bot.velX = fwdX * moveSign * 7.5 + rightX * pushSide * 4.5;
            bot.velZ = fwdZ * moveSign * 7.5 + rightZ * pushSide * 4.5;
          }

          if (bot.downed) {
            // Running over / trampling an already downed enemy finishes them immediately under tracks/hooves
            bot.bleedOutTimer = Math.min(bot.bleedOutTimer || 0.1, 0.05);
            continue;
          }

          this.world.spawnDebris(
            tmpVec3(bot.pos.x, bot.pos.y + 0.9, bot.pos.z),
            new THREE.Color(0x8b1e1e),
            5
          );
          if (isHorse) {
            const distToListener = player ? player.pos.distanceTo(v.pos) : 0;
            sound.playShieldBlock?.(distToListener, 0);
          }

          const isFriendlyVictim = bot.team === v.team;
          const prevDead = bot.dead || bot.downed;
          botManager.damageBot(
            bot,
            trampleDamage,
            attackerName,
            attackerTeam,
            roadkillWeapon,
            false,
            onKillCb,
            v.driver === player && player ? player.onAwardXp : null
          );
          const didEliminate = !prevDead && (bot.dead || bot.downed);

          if (v.driver === player && player) {
            player.addShake(isHorse ? 0.18 : 0.26);
            events.emit('hitmarker:show', {
              type: didEliminate ? 'kill' : 'hit',
              label: isFriendlyVictim
                ? '⚠️ TEAMKILL! (-$0.10 / -10¢)'
                : isHorse
                ? didEliminate
                  ? `🐎 CAVALRY TRAMPLE! (${trampleDamage} DMG)`
                  : `🐎 HOOF TRAMPLE! (+${trampleDamage} DMG)`
                : 'ROADKILL!'
            });
            if (player.onHitMarker && !player.onHitMarker._isEventsBridge) {
              player.onHitMarker(didEliminate ? 'kill' : 'hit');
            }
            if (!isFriendlyVictim && didEliminate) {
              player.kills = (player.kills || 0) + 1;
              player.score = (player.score || 0) + 150;
              const rkReason = isHorse
                ? `🐎 CAVALRY WARHORSE TRAMPLE! (${bot.name})`
                : `🛞 ROADKILL! (${bot.name})`;
              events.emit('xp:awarded', { amount: 150, reason: rkReason });
              if (player.onAwardXp && !player.onAwardXp._isEventsBridge) {
                player.onAwardXp(150, rkReason);
              }
            }
          } else if (v.npcDriver && !isFriendlyVictim && didEliminate) {
            v.npcDriver.kills = (v.npcDriver.kills || 0) + 1;
            v.npcDriver.score = (v.npcDriver.score || 0) + 150;
          }

          const roadkillPayload = {
            vehicleId: v.id,
            vehicleType: v.type,
            driver: attackerName,
            team: v.team,
            victim: bot.name,
            speedMs: Number(Math.abs(v.forwardSpeed).toFixed(1)),
            speedKmh: Math.round(Math.abs(v.forwardSpeed) * 3.6)
          };
          events.emit('telemetry:event', {
            type: 'VEHICLE_ROADKILL',
            payload: roadkillPayload
          });
          if (botManager.onTelemetryEvent && !botManager.onTelemetryEvent._isEventsBridge) {
            botManager.onTelemetryEvent('VEHICLE_ROADKILL', roadkillPayload);
          }
        }
      }
    }

    // 2. Check opposing human player on foot
    if (
      player &&
      !player.dead &&
      !player.downed &&
      !player.activeVehicle &&
      player.team !== v.team
    ) {
      const dy = Math.abs(player.pos.y - v.pos.y);
      const dx = player.pos.x - v.pos.x;
      const dz = player.pos.z - v.pos.z;
      const longitudinal = dx * fwdX + dz * fwdZ;
      const lateral = dx * rightX + dz * rightZ;
      if (dy <= 2.6 && Math.abs(lateral) <= halfW && Math.abs(longitudinal) <= halfL) {
        if (longitudinal * moveSign >= -halfL * 0.65) {
          const pushSide = lateral >= 0 ? 1 : -1;
          player.pos.x += fwdX * moveSign * 2.2 + rightX * pushSide * 1.6;
          player.pos.z += fwdZ * moveSign * 2.2 + rightZ * pushSide * 1.6;
          player.pos.y = this.world.getGroundHeightAt(player.pos.x, player.pos.z);
          player.takeDamage(150, attackerName, attackerTeam, roadkillWeapon, onKillCb, v.pos);
        }
      }
    }
  }

  /**
   * Animates 3D aircraft control surfaces (ailerons, elevator, rudders) and spawns wingtip vortex
   * contrail puffs during high-G banked turns.
   */
  updateAircraftControlSurfacesAndVortices(v, dt, rollInput = 0, pitchInput = 0, yawRateInput = 0) {
    const cs = v.controlSurfaces || v.mesh?.userData?.controlSurfaces;
    if (cs) {
      const aileronDeflect = THREE.MathUtils.clamp(rollInput * 0.55, -0.45, 0.45);
      if (cs.leftAileron) cs.leftAileron.rotation.x = aileronDeflect;
      if (cs.rightAileron) cs.rightAileron.rotation.x = -aileronDeflect;
      if (cs.elevator) {
        cs.elevator.rotation.x = THREE.MathUtils.clamp(-pitchInput * 0.65, -0.48, 0.48);
      }
      if (Array.isArray(cs.rudders)) {
        const rudderDeflect = THREE.MathUtils.clamp(-yawRateInput * 0.5, -0.42, 0.42);
        for (const r of cs.rudders) {
          r.rotation.y = rudderDeflect;
        }
      }
    }

    // Spawn subtle white wingtip vapor vortex puffs when banking hard (> 26 deg) in flight
    const bankMag = Math.abs(v.roll || 0);
    if ((v.driver || v.aiPilotActive) && bankMag > 0.45 && (v.forwardSpeed || 0) > 38 && this.world?.spawnDebris) {
      v.vortexTimer = (v.vortexTimer || 0) - dt;
      if (v.vortexTimer <= 0) {
        v.vortexTimer = 0.065;
        const span = cs?.wingSpan || 5.5;
        const q = v.mesh.quaternion;
        for (const side of [-1, 1]) {
          const tipOffset = new THREE.Vector3(side * span, 1.35, 0.85).applyQuaternion(q);
          this.world.spawnDebris(
            tmpVec3(v.pos.x + tipOffset.x, v.pos.y + tipOffset.y, v.pos.z + tipOffset.z),
            new THREE.Color(0xecf0f1),
            1
          );
        }
      }
    }
  }

  /**
   * 3D Flight & AI Dogfight / CAS Loop for Combat Aircraft:
   * - Human-piloted aircraft are steered by `VehicleControl.js` and synced here.
   * - Enemy aircraft launch into 3D air combat patrols over the valley with a smooth runway takeoff roll & climb.
   * - ALL Friendly aircraft (A-10C CAS, F-15EX/F-22A Strike Fighter, AC-130J Gunship) remain parked on the
   *   friendly Airfield Runway for walk-up [E] takeoff (or instant [9] Mid-Air Sortie Call-In) so they never
   *   disappear while a player is running toward them!
   */
  updateAircraftAiAndPhysics(v, dt, player, botManager, onDeployMenu = false) {
    if (v.aircraftRole === 'gunship' && v.wheels && (v.driver || v.aiPilotActive)) {
      for (const prop of v.wheels) {
        prop.rotation.z += dt * 22;
      }
    }
    if (
      v.aircraftRole === 'wright_flyer' &&
      v.mesh?.userData?.wrightProps &&
      (v.driver || v.aiPilotActive)
    ) {
      for (const prop of v.mesh.userData.wrightProps) {
        prop.rotation.z += dt * 20 * (prop.userData.spinDir || 1);
      }
    }

    // Automatic AN/AAQ-24 DIRCM / Stealth RAM Jammer for Heavy Gunship (AC-130J) & Northrop B-2A Spirit Stealth Bomber
    if (
      (v.aircraftRole === 'gunship' || v.aircraftRole === 'b2_spirit' || v.isStealthAircraft) &&
      (v.driver || v.aiPilotActive) &&
      (v.flareCooldown || 0) <= 0 &&
      this.world &&
      Array.isArray(this.world.projectiles)
    ) {
      for (const p of this.world.projectiles) {
        if (p.type === 'a2a_missile' && p.targetVehicle === v && p.mesh) {
          const dSq = p.mesh.position.distanceToSquared(v.pos);
          if (dSq < 320 * 320) {
            v.flareActiveTimer = 4.2;
            v.flareCooldown = v.aircraftRole === 'b2_spirit' ? 6.0 : 10.0;
            p.targetVehicle = null;
            this.world.spawnDebris(
              tmpVec3(v.pos.x, v.pos.y - 1.5, v.pos.z),
              new THREE.Color(v.aircraftRole === 'b2_spirit' ? 0x00d2d3 : 0xffd32a),
              8
            );
            if (v.driver === player && player?.onAwardXp) {
              player.onAwardXp(
                0,
                v.aircraftRole === 'b2_spirit'
                  ? '🦇 B-2 SPIRIT PASSIVE RAM STEALTH SPOOFED INCOMING SAM LOCK!'
                  : '✨ AC-130J AUTO-DIRCM FLARES DEPLOYED — INCOMING SAM SPOOFED!'
              );
            }
            break;
          }
        }
      }
    }

    if (v.driver) {
      v.mesh.position.copy(v.pos);
      v.mesh.rotation.set(v.pitch || 0, v.yaw || 0, v.roll || 0, 'YXZ');
      return;
    }

    // If an unmanned aircraft was shot down (or the pilot ejected via [E]), continue its burning Mayday spiral until it crashes into the ground!
    if (v.isShotDown) {
      v.shotDownTimer = (v.shotDownTimer || 14.0) - dt;
      const spinDir = v.shotDownSpinDir || 1;
      v.pitch = THREE.MathUtils.lerp(v.pitch || 0, -0.78, dt * 2.4);
      v.roll = (v.roll || 0) + spinDir * 3.5 * dt;
      v.yaw = (v.yaw || 0) + spinDir * 1.45 * dt;
      v.forwardSpeed = THREE.MathUtils.lerp(v.forwardSpeed || 45, 52, dt * 1.2);

      v.shotDownSmokeTimer = (v.shotDownSmokeTimer || 0) - dt;
      if (v.shotDownSmokeTimer <= 0 && this.world?.spawnDebris) {
        v.shotDownSmokeTimer = 0.06;
        this.world.spawnDebris(
          tmpVec3(v.pos.x, v.pos.y, v.pos.z),
          new THREE.Color(Math.random() < 0.45 ? 0xff5252 : 0x2f3640),
          3
        );
      }

      const cosP = Math.cos(v.pitch);
      const vx = -Math.sin(v.yaw) * cosP * v.forwardSpeed;
      const vy = Math.sin(v.pitch) * v.forwardSpeed - 18.0;
      const vz = -Math.cos(v.yaw) * cosP * v.forwardSpeed;
      v.pos.x = THREE.MathUtils.clamp(v.pos.x + vx * dt, -2350, 2350);
      v.pos.z = THREE.MathUtils.clamp(v.pos.z + vz * dt, -1600, 1600);
      v.pos.y += vy * dt;

      const groundH = this.world.getGroundHeightAt(v.pos.x, v.pos.z);
      if (v.pos.y <= groundH + 2.4 || v.shotDownTimer <= 0) {
        v.pos.y = groundH;
        this.finalizeShotDownCrash(v);
        return;
      }
      v.mesh.position.copy(v.pos);
      v.mesh.rotation.set(v.pitch || 0, v.yaw || 0, v.roll || 0, 'YXZ');
      return;
    }

    const playerTeam = (player && player.team) || 'US';
    // Friendly aircraft & Secret Cave 1903 Wright Flyers NEVER auto-sortie or disappear from their hangar/cave!
    const shouldAutoSortie = v.team !== playerTeam && !v.isSecretAircraft;

    if (!shouldAutoSortie && v.aiPilotActive) {
      // If player switched teams, ensure all friendly planes are parked on the friendly runway ready for walk-up boarding
      v.aiPilotActive = false;
      if (v.flightFSM) {
        v.flightFSM.send(AIRCRAFT_FLIGHT_EVENTS.CANCEL_AI_SORTIE);
      }
      v.forwardSpeed = 0;
      v.pitch = 0;
      v.roll = 0;
      v.yaw = v.spawnYaw;
      v.pos.copy(v.spawnPos);
      v.pos.y = this.world.getGroundHeightAt(v.pos.x, v.pos.z);
    } else if (!v.aiPilotActive && shouldAutoSortie && !onDeployMenu) {
      if (v.flightFSM && v.flightFSM.is(AIRCRAFT_FLIGHT_STATES.PARKED_RUNWAY)) {
        v.flightFSM.send(AIRCRAFT_FLIGHT_EVENTS.START_AI_PREFLIGHT);
      }
      v.aiSortieLaunchDelay = Math.max(0, (v.aiSortieLaunchDelay || 0) - dt);
      if (v.aiSortieLaunchDelay <= 0) {
        v.aiPilotActive = true;
        if (v.flightFSM) {
          v.flightFSM.send(AIRCRAFT_FLIGHT_EVENTS.AI_LAUNCH_SORTIE);
        }
        v.aiTakeoffComplete = false;
        v.forwardSpeed = Math.max(v.forwardSpeed || 0, 8.0);
      }
    }

    if (v.aiPilotActive && v.patrolPoints && v.patrolPoints.length > 0) {
      const groundHNow = this.world.getGroundHeightAt(v.pos.x, v.pos.z);
      const altAgl = v.pos.y - groundHNow;
      if (altAgl < 6.5) {
        v.airborneRadarTimer = 0;
      } else {
        v.airborneRadarTimer = (v.airborneRadarTimer || 0) + dt;
      }
      v.isLowAltRadarMasked = altAgl < 28.0 || (v.airborneRadarTimer || 0) < 4.0;
      const inTakeoffRoll = altAgl < 20.0 && (v.aiTakeoffComplete !== true);
      if (altAgl >= 22.0) {
        v.aiTakeoffComplete = true;
      }

      const wpCount = v.patrolPoints.length;
      const curWp = v.patrolPoints[v.patrolIndex % wpCount];
      const nextWp = v.patrolPoints[(v.patrolIndex + 1) % wpCount];

      // Air-to-Air Dogfight Priority: Fighter / CAS AI tracks nearby enemy aircraft in the sky
      // (Northrop B-2A Spirit has 88% radar/IR stealth reduction, and planes < 28m AGL or < 4.0s post-takeoff are masked by radar ground clutter!)
      let dogfightTarget = null;
      let bestAirDist = 680;
      for (const other of this.vehicles) {
        if (!other.isAircraft || other.dead || other.team === v.team) continue;
        if (!other.driver && !other.aiPilotActive) continue;
        const otherGroundH = this.world.getGroundHeightAt(other.pos.x, other.pos.z);
        const otherAltAgl = Math.max(0, other.pos.y - otherGroundH);
        if (otherAltAgl < 28.0 || (other.airborneRadarTimer || 0) < 4.0 || other.isLowAltRadarMasked) continue;
        const isStealthB2 = other.aircraftRole === 'b2_spirit' || other.isStealthAircraft;
        if (isStealthB2 && (other.flareActiveTimer || 0) > 0) continue;
        const maxSpotDist = isStealthB2 ? 680 * (other.stealthFactor || 0.12) : 680;
        const d = v.pos.distanceTo(other.pos);
        if (d < maxSpotDist && d < bestAirDist) {
          bestAirDist = d;
          dogfightTarget = other;
        }
      }

      // Smooth Lookahead Orbit Guidance & Extend-and-Reattack Dogfight Passes
      v.dogfightExtendTimer = Math.max(0, (v.dogfightExtendTimer || 0) - dt);
      let targetX = curWp.x;
      let targetY = curWp.y || 145;
      let targetZ = curWp.z;

      const rawWpDist = Math.hypot(curWp.x - v.pos.x, curWp.z - v.pos.z);
      if (rawWpDist < 165 && !dogfightTarget) {
        // Blend smoothly toward the next waypoint before switching so the aircraft flies wide, sweeping curves
        const blend = THREE.MathUtils.clamp(1.0 - (rawWpDist - 85) / 80, 0, 1);
        targetX = THREE.MathUtils.lerp(curWp.x, nextWp.x, blend);
        targetY = THREE.MathUtils.lerp(curWp.y || 145, nextWp.y || 145, blend);
        targetZ = THREE.MathUtils.lerp(curWp.z, nextWp.z, blend);
        if (rawWpDist < 90) {
          v.patrolIndex = (v.patrolIndex + 1) % wpCount;
        }
      }

      if (dogfightTarget && v.aircraftRole === 'fighter' && !inTakeoffRoll) {
        if (bestAirDist < 135 && v.dogfightExtendTimer <= 0) {
          // Perform a realistic high-speed zoom-and-extend pass instead of jittering in tight circles
          v.dogfightExtendTimer = 3.6;
          v.dogfightExtendYaw = v.yaw + (Math.random() < 0.5 ? 0.45 : -0.45);
        }
        if (v.dogfightExtendTimer > 0) {
          const extYaw = v.dogfightExtendYaw ?? v.yaw;
          targetX = v.pos.x - Math.sin(extYaw) * 280;
          targetZ = v.pos.z - Math.cos(extYaw) * 280;
          targetY = Math.max(125, dogfightTarget.pos.y + 24);
        } else {
          // Lead the enemy aircraft slightly along its velocity vector
          const leadT = THREE.MathUtils.clamp(bestAirDist / 260, 0.2, 1.5);
          const tvx = dogfightTarget.velVector ? dogfightTarget.velVector.x : 0;
          const tvz = dogfightTarget.velVector ? dogfightTarget.velVector.z : 0;
          targetX = dogfightTarget.pos.x + tvx * leadT;
          targetZ = dogfightTarget.pos.z + tvz * leadT;
          targetY = Math.max(105, dogfightTarget.pos.y + 8);
        }
      }

      const dx = targetX - v.pos.x;
      const dy = targetY - v.pos.y;
      const dz = targetZ - v.pos.z;
      const horizDist = Math.max(1, Math.hypot(dx, dz));

      const cruiseSpeed = v.speed || 64;
      const targetAirSpd = inTakeoffRoll ? cruiseSpeed * 0.88 : cruiseSpeed;
      const curAirSpd = v.forwardSpeed || 8.0;
      // Progressive turbofan thrust spool & aerodynamic drag so AI planes accelerate gradually down the runway and in climbs/dives
      v.engineSpool = Math.min(1.0, (v.engineSpool || 0.25) + dt * 0.42);
      const gravPitchAccel = inTakeoffRoll ? 0 : -Math.sin(v.pitch || 0) * 14.0;
      const maxThrustAccel = (v.accelRate || 2.8) * 3.6 * v.engineSpool;
      const airSpdDiff = targetAirSpd - curAirSpd;
      const thrustStep = THREE.MathUtils.clamp(airSpdDiff, -6.5 * dt, maxThrustAccel * dt);
      v.forwardSpeed = THREE.MathUtils.clamp(
        curAirSpd + thrustStep + gravPitchAccel * dt,
        8.0,
        (v.maxSpeed || cruiseSpeed * 1.35)
      );

      let desiredYaw = inTakeoffRoll ? v.spawnYaw : Math.atan2(-dx, -dz);
      let yawDiff = desiredYaw - v.yaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;

      // =====================================================================
      // TRUE COORDINATED BANK-TO-TURN AERODYNAMICS FOR AI AIRCRAFT:
      // 1. Aircraft rolls its wings smoothly into the turn (+yawDiff -> +roll left wing down).
      // 2. The aircraft's yaw turn rate d(v.yaw)/dt is physically driven by sin(v.roll),
      //    so the plane banks first and carves a smooth, natural circular arc through the sky!
      // =====================================================================
      const maxBank = v.aircraftRole === 'gunship' ? 0.42 : v.aircraftRole === 'b2_spirit' ? 0.55 : 0.78;
      const targetRoll = inTakeoffRoll
        ? 0
        : THREE.MathUtils.clamp(yawDiff * 1.25, -maxBank, maxBank);
      v.roll = THREE.MathUtils.lerp(v.roll || 0, targetRoll, Math.min(1, dt * 3.2));

      const fineRudder = THREE.MathUtils.clamp(yawDiff, -0.18, 0.18) * 0.45;
      const bankedYawRate = inTakeoffRoll
        ? THREE.MathUtils.clamp(yawDiff * 1.5, -0.4, 0.4)
        : Math.sin(v.roll) * (v.turnRate || 1.25) * 0.92 + fineRudder;
      v.yaw += bankedYawRate * dt;

      // Smooth pitch control with Runway Rotation & Terrain Avoidance Pull-Up (never slides flat with nose down!)
      let desiredPitch;
      if (inTakeoffRoll) {
        desiredPitch = v.forwardSpeed >= 34 ? 0.22 : 0.02;
      } else {
        desiredPitch = THREE.MathUtils.clamp(
          Math.atan2(dy, Math.max(65, horizDist)) + Math.abs(Math.sin(v.roll)) * 0.055,
          -0.30,
          0.32
        );
        // Smooth Auto-Terrain Pull-Up when below 72m AGL
        if (altAgl < 72.0) {
          const pullUpFrac = THREE.MathUtils.clamp((72.0 - altAgl) / 38.0, 0, 1);
          desiredPitch = Math.max(desiredPitch, pullUpFrac * 0.26);
        }
      }
      v.pitch = THREE.MathUtils.lerp(v.pitch || 0, desiredPitch, Math.min(1, dt * 2.6));
      this.updateAircraftControlSurfacesAndVortices(v, dt, targetRoll - v.roll, desiredPitch - v.pitch, yawDiff);

      const cosP = Math.cos(v.pitch);
      const noseDir = tmpVec3(
        -Math.sin(v.yaw) * cosP,
        Math.sin(v.pitch),
        -Math.cos(v.yaw) * cosP
      ).normalize();
      if (!v._aiAeroDir) {
        v._aiAeroDir = noseDir.clone();
      } else {
        v._aiAeroDir.lerp(noseDir, Math.min(1, dt * 5.5)).normalize();
      }
      const vx = v._aiAeroDir.x * v.forwardSpeed;
      const vy = v._aiAeroDir.y * v.forwardSpeed;
      const vz = v._aiAeroDir.z * v.forwardSpeed;
      if (!v.velVector) v.velVector = new THREE.Vector3();
      v.velVector.set(vx, vy, vz);

      v.pos.x = THREE.MathUtils.clamp(v.pos.x + vx * dt, -2350, 2350);
      v.pos.z = THREE.MathUtils.clamp(v.pos.z + vz * dt, -1600, 1600);
      const groundH = this.world.getGroundHeightAt(v.pos.x, v.pos.z);
      const nextY = v.pos.y + vy * dt;
      const minSafeAlt = inTakeoffRoll ? groundH : groundH + 22;
      const clampedY = THREE.MathUtils.clamp(nextY, minSafeAlt, VEHICLE_STATS.AIRSPACE_MAX_ALT || 3500);
      if (clampedY > nextY + 0.01) {
        v.pitch = Math.max(v.pitch, 0.08);
        v.velVector.y = Math.max(0, v.velVector.y);
      }
      v.pos.y = clampedY;

      // AI Air-to-Air Dogfight & CAS Tracer Bursts
      v.aiFireTimer -= dt;
      if (v.aiFireTimer <= 0 && dogfightTarget && bestAirDist < 460 && Math.abs(yawDiff) < 0.35) {
        v.aiFireTimer = 0.95 + Math.random() * 0.95;
        if (botManager && typeof botManager.spawnTracer === 'function') {
          botManager.spawnTracer(v.pos.clone(), dogfightTarget.pos.clone(), 0xff5252);
        }
        // Apply light AI dogfight chip damage to AI planes (or light warning chip to player plane)
        const dmg = dogfightTarget.driver ? 10 : 38;
        this.damageVehicle(
          dogfightTarget,
          dmg,
          `${v.name} [AI PILOT]`,
          v.team,
          '20MM AIR-TO-AIR CANNON',
          player ? player.onKillEvent : null,
          null,
          v.pos
        );
      }
    } else {
      // Parked on the Airfield Runway
      v.forwardSpeed *= Math.pow(0.05, dt);
      v.pitch = THREE.MathUtils.lerp(v.pitch || 0, 0, dt * 5);
      v.roll = THREE.MathUtils.lerp(v.roll || 0, 0, dt * 5);
      v.pos.y = this.world.getGroundHeightAt(v.pos.x, v.pos.z);
      this.updateAircraftControlSurfacesAndVortices(v, dt, 0, 0, 0);
    }

    v.turretYaw = v.yaw;
    v.mesh.position.copy(v.pos);
    v.mesh.rotation.set(v.pitch || 0, v.yaw || 0, v.roll || 0, 'YXZ');
  }

  fireAiVehicleWeapon(v, targetPos, player, airTarget = null) {
    const muzzleOrigin = tmpVec3(v.pos.x, v.pos.y + (v.type === 'tank' ? 2.25 : v.isEmplacement ? 1.45 : 2.5), v.pos.z);
    const rawVec = tmpVec3Copy(targetPos).sub(muzzleOrigin);
    const pitchLimits = this.getVehiclePitchLimits(v);
    const horizDist = Math.max(0.5, Math.hypot(rawVec.x, rawVec.z));
    const clampedElev = THREE.MathUtils.clamp(Math.atan2(rawVec.y, horizDist), pitchLimits.min, pitchLimits.max);
    rawVec.y = horizDist * Math.tan(clampedElev);
    const dir = rawVec.normalize();
    dir.x += (Math.random() - 0.5) * 0.04;
    dir.y += (Math.random() - 0.5) * 0.025;
    dir.z += (Math.random() - 0.5) * 0.04;
    dir.normalize();

    const distToPlayer = player ? v.pos.distanceTo(player.pos) : 999;
    let pan = 0;
    if (player && distToPlayer < 220) {
      const dx = v.pos.x - player.pos.x;
      const dz = v.pos.z - player.pos.z;
      const len = Math.hypot(dx, dz) || 1;
      const rightX = Math.cos(player.yaw || 0);
      const rightZ = -Math.sin(player.yaw || 0);
      pan = (dx * rightX + dz * rightZ) / len;
    }
    const ownerObj = v.npcDriver || {
      name: v.name,
      team: v.team,
      isAiVehicle: true,
      pos: v.pos.clone()
    };

    if (v.weaponType === 'aa_autocannon') {
      if (distToPlayer < 240) sound.playGunshot('autocannon', distToPlayer, pan);
      // Launch Homing SAM periodically when tracking an enemy aircraft
      if (airTarget && v.coaxCooldown <= 0) {
        v.coaxCooldown = 15.5;
        const samMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.24, 0.24, 1.35),
          new THREE.MeshBasicMaterial({ color: 0x00d2d3 })
        );
        samMesh.position.copy(muzzleOrigin).addScaledVector(dir, 2.8);
        samMesh.lookAt(targetPos);
        this.scene.add(samMesh);
        this.world.projectiles.push({
          type: 'a2a_missile',
          mesh: samMesh,
          vel: dir.clone().multiplyScalar(PROJECTILES.STINGER_SAM?.speed || 255),
          gravity: 0,
          life: 6.5,
          turnRate: 4.2,
          targetVehicle: airTarget,
          blastRadius: 9.5,
          blastDamage: airTarget.driver ? 145 : 280,
          weaponName: v.team === 'US' ? 'FIM-92 STINGER SAM' : '9M311 / IGLA SAM',
          owner: ownerObj
        });
        return;
      }
      const shellMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.18, 0.65),
        new THREE.MeshBasicMaterial({ color: 0xff5252 })
      );
      shellMesh.position.copy(muzzleOrigin).addScaledVector(dir, 2.5);
      this.scene.add(shellMesh);
      this.world.projectiles.push({
        type: 'autocannon',
        mesh: shellMesh,
        vel: dir.clone().multiplyScalar(155),
        gravity: 0.65,
        life: 3.5,
        blastRadius: 6.5,
        blastDamage: airTarget?.driver ? 28 : 65,
        weaponName: v.team === 'US' ? '25MM GAU-12 AA' : '30MM 2A38M AA',
        owner: ownerObj
      });
    } else if (v.weaponType === 'tank_cannon') {
      v.barrelRecoil = 1.0;
      if (distToPlayer < 220) sound.playTankCannon(distToPlayer, pan);
      this.world.spawnDebris(
        tmpVec3Copy(muzzleOrigin).addScaledVector(dir, 3.8),
        new THREE.Color(0xffaa00),
        4
      );
      const shellMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.24, 0.78),
        new THREE.MeshBasicMaterial({ color: 0xffaa00 })
      );
      shellMesh.position.copy(muzzleOrigin).addScaledVector(dir, 4.0);
      shellMesh.lookAt(targetPos);
      this.scene.add(shellMesh);

      this.world.projectiles.push({
        type: 'tank_shell',
        mesh: shellMesh,
        vel: dir.clone().multiplyScalar(108),
        gravity: 2.2,
        life: 3.5,
        owner: ownerObj
      });
    } else if (v.weaponType === 'autocannon' || v.weaponType === 'hmg') {
      if (distToPlayer < 170) sound.playGunshot(v.weaponType, distToPlayer, pan);
      const shellMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.16, 0.48),
        new THREE.MeshBasicMaterial({ color: 0xffcc00 })
      );
      shellMesh.position.copy(muzzleOrigin).addScaledVector(dir, 2.4);
      this.scene.add(shellMesh);

      this.world.projectiles.push({
        type: 'autocannon',
        mesh: shellMesh,
        vel: dir.clone().multiplyScalar(92),
        gravity: 2.5,
        life: 3.0,
        owner: ownerObj
      });
    }
  }
}
