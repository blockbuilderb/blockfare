import * as THREE from '../vendor/three.module.js';
import { sound } from './audio.js?v=35';
import { VEHICLE_STATS, PROJECTILES } from './config.js?v=35';
import { VEHICLE_DEFS } from './vehicle-defs.js?v=35';

export class VehicleManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.vehicles = [];
    this.hitMeshes = [];

    this.initVehicles();
  }

  initVehicles() {
    for (const def of VEHICLE_DEFS) {
      const [sx, , sz] = def.spawnPos;
      const cfg = {
        ...def,
        spawnPos: new THREE.Vector3(sx, this.world.getGroundHeightAt(sx, sz), sz),
        patrolPoints: def.patrolPoints.map(p => new THREE.Vector3(p[0], p[1], p[2]))
      };
      this.spawnVehicle(cfg);
    }
  }

  spawnVehicle(cfg) {
    const group = new THREE.Group();
    const isUS = cfg.team === 'US';
    const hullColor = isUS
      ? cfg.type === 'tank'
        ? 0x8f8260
        : cfg.type === 'apc'
        ? 0x4b5d46
        : 0x9b8c6b
      : cfg.type === 'tank'
      ? 0x3b4938
      : cfg.type === 'apc'
      ? 0x3e4d3c
      : 0x555d47;

    const eraColor = isUS ? 0x6e6347 : 0x2c3629;

    const hullMat = new THREE.MeshStandardMaterial({
      color: hullColor,
      roughness: 0.76,
      metalness: 0.24,
      flatShading: true
    });
    const eraMat = new THREE.MeshStandardMaterial({
      color: eraColor,
      roughness: 0.82,
      metalness: 0.28,
      flatShading: true
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x202428,
      roughness: 0.85,
      flatShading: true
    });
    const barrelMat = new THREE.MeshStandardMaterial({
      color: 0x2b3035,
      roughness: 0.55,
      metalness: 0.45,
      flatShading: true
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x74b9ff,
      roughness: 0.2,
      metalness: 0.6,
      transparent: true,
      opacity: 0.65
    });

    const wheels = [];
    const turretPivot = new THREE.Group();
    let barrelGroup = null;

    if (cfg.type === 'tank') {
      // =======================================================================
      // MAIN BATTLE TANK (M1A2 ABRAMS / T-90M PRORYV) TRACKED COMPOSITE HULL
      // =======================================================================
      // 1. Left & Right Heavy Caterpillar Track Assemblies
      const trackHousingGeo = new THREE.BoxGeometry(0.72, 1.05, 6.7);
      for (const side of [-1, 1]) {
        const trackPod = new THREE.Mesh(trackHousingGeo, darkMat);
        trackPod.position.set(side * 1.42, 0.58, 0);
        trackPod.castShadow = true;
        group.add(trackPod);

        // Armored Side Skirts + ERA Reactive Armor Blocks along the hull sides
        const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.64, 6.5), hullMat);
        skirt.position.set(side * 1.76, 1.02, 0.05);
        skirt.castShadow = true;
        group.add(skirt);

        for (let b = -2; b <= 2; b++) {
          const eraBrick = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.44, 1.05), eraMat);
          eraBrick.position.set(side * 1.84, 1.04, b * 1.18);
          group.add(eraBrick);
        }
      }

      // 6 Tank Roadwheels + Front/Rear Sprockets per side
      const roadWheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.56, 10);
      roadWheelGeo.rotateZ(Math.PI / 2);
      for (const wz of [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5]) {
        for (const wx of [-1.42, 1.42]) {
          const w = new THREE.Mesh(roadWheelGeo, barrelMat);
          w.position.set(wx, 0.44, wz);
          group.add(w);
          wheels.push(w);
        }
      }

      // 2. Main Armored Lower & Upper Hull + Sloped Composite Glacis Plate
      const mainHull = new THREE.Mesh(new THREE.BoxGeometry(2.85, 0.96, 6.3), hullMat);
      mainHull.position.set(0, 1.12, -0.1);
      mainHull.castShadow = true;
      mainHull.receiveShadow = true;
      group.add(mainHull);

      const glacis = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.68, 1.85), hullMat);
      glacis.position.set(0, 1.18, 2.75);
      glacis.rotation.x = 0.36;
      glacis.castShadow = true;
      group.add(glacis);

      // Rear Engine Deck & Exhaust Louvers
      const engineDeck = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.16, 1.9), darkMat);
      engineDeck.position.set(0, 1.62, -2.1);
      group.add(engineDeck);

      // 3. Rotating Heavy Tank Turret + Composite Cheek Armor + 120mm/125mm Smoothbore Cannon
      turretPivot.position.set(0, 1.95, 0.15);

      const turretCore = new THREE.Mesh(new THREE.BoxGeometry(2.38, 0.84, 3.05), hullMat);
      turretCore.position.set(0, 0, -0.22);
      turretCore.castShadow = true;
      turretPivot.add(turretCore);

      // Angled Frontal Composite Turret Cheeks (Abrams / T-90M wedge profile)
      for (const side of [-1, 1]) {
        const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.78, 1.15), eraMat);
        cheek.position.set(side * 0.68, -0.02, 1.18);
        cheek.rotation.y = -side * 0.32;
        cheek.castShadow = true;
        turretPivot.add(cheek);
      }

      // Turret Bustle Rack & Commander Cupola + Roof Hatch
      const bustle = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.56, 0.95), eraMat);
      bustle.position.set(0, 0.08, -2.0);
      turretPivot.add(bustle);

      const cupola = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.34, 8), eraMat);
      cupola.position.set(0.55, 0.54, -0.35);
      turretPivot.add(cupola);

      const roofSight = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.32, 0.42), darkMat);
      roofSight.position.set(-0.55, 0.55, 0.35);
      turretPivot.add(roofSight);

      // Recoiling 120mm / 125mm Main Smoothbore Cannon Group
      barrelGroup = new THREE.Group();
      barrelGroup.position.set(0, 0.04, 1.35);

      const mantlet = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.54, 0.58), darkMat);
      barrelGroup.add(mantlet);

      const mainTube = new THREE.Mesh(
        new THREE.CylinderGeometry(0.13, 0.145, 4.1, 10),
        barrelMat
      );
      mainTube.rotation.x = Math.PI / 2;
      mainTube.position.set(0, 0, 2.15);
      mainTube.castShadow = true;
      barrelGroup.add(mainTube);

      // Bore Evacuator (Fume Extractor bulge mid-barrel) & Muzzle Collar
      const evacuator = new THREE.Mesh(
        new THREE.CylinderGeometry(0.19, 0.19, 0.68, 10),
        hullMat
      );
      evacuator.rotation.x = Math.PI / 2;
      evacuator.position.set(0, 0, 2.25);
      barrelGroup.add(evacuator);

      const muzzleCollar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.17, 0.17, 0.32, 10),
        darkMat
      );
      muzzleCollar.rotation.x = Math.PI / 2;
      muzzleCollar.position.set(0, 0, 4.15);
      barrelGroup.add(muzzleCollar);

      // Coaxial 7.62mm Machine Gun Barrel alongside the main gun
      const coaxBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.15), darkMat);
      coaxBarrel.position.set(0.28, 0.02, 0.65);
      barrelGroup.add(coaxBarrel);

      turretPivot.add(barrelGroup);
    } else if (cfg.type === 'humvee') {
      // Lower & Upper Armored Chassis
      const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.15, 4.8), hullMat);
      chassis.position.y = 1.05;
      chassis.castShadow = true;
      group.add(chassis);

      const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.9, 2.5), hullMat);
      cabin.position.set(0, 1.95, -0.2);
      cabin.castShadow = true;
      group.add(cabin);

      const windshield = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.62, 0.12), glassMat);
      windshield.position.set(0, 1.95, 1.05);
      windshield.rotation.x = -0.22;
      group.add(windshield);

      // 4 Blocky Offroad Wheels
      const wheelGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.42, 10);
      wheelGeo.rotateZ(Math.PI / 2);
      for (const [wx, wz] of [
        [-1.3, 1.55],
        [1.3, 1.55],
        [-1.3, -1.55],
        [1.3, -1.55]
      ]) {
        const w = new THREE.Mesh(wheelGeo, darkMat);
        w.position.set(wx, 0.55, wz);
        group.add(w);
        wheels.push(w);
      }

      turretPivot.position.set(0, 2.5, -0.2);
      const turretHead = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.58, 0.9), hullMat);
      turretHead.castShadow = true;
      turretPivot.add(turretHead);

      barrelGroup = new THREE.Group();
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.55), darkMat);
      barrel.position.set(0, 0.05, 0.95);
      barrelGroup.add(barrel);
      turretPivot.add(barrelGroup);
    } else {
      // 8x8 LAV-25 / BTR-82A Armored Hull
      const hull = new THREE.Mesh(new THREE.BoxGeometry(2.85, 1.45, 6.2), hullMat);
      hull.position.y = 1.25;
      hull.castShadow = true;
      group.add(hull);

      const nose = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.9, 1.4), hullMat);
      nose.position.set(0, 1.15, 3.1);
      nose.rotation.x = 0.35;
      group.add(nose);

      const wheelGeo = new THREE.CylinderGeometry(0.58, 0.58, 0.45, 10);
      wheelGeo.rotateZ(Math.PI / 2);
      for (const wz of [-2.1, -0.7, 0.7, 2.1]) {
        for (const wx of [-1.48, 1.48]) {
          const w = new THREE.Mesh(wheelGeo, darkMat);
          w.position.set(wx, 0.58, wz);
          group.add(w);
          wheels.push(w);
        }
      }

      turretPivot.position.set(0, 2.15, -0.2);
      const turretHead = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.58, 1.65), hullMat);
      turretHead.castShadow = true;
      turretPivot.add(turretHead);

      barrelGroup = new THREE.Group();
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 2.4), darkMat);
      barrel.position.set(0, 0.05, 1.5);
      barrelGroup.add(barrel);
      turretPivot.add(barrelGroup);
    }

    group.add(turretPivot);
    group.position.copy(cfg.spawnPos);
    group.rotation.y = cfg.spawnYaw;
    this.scene.add(group);

    const isInitialReinforcement =
      cfg.id === 'us_humvee_fwd' ||
      cfg.id === 'ru_tigr_fwd' ||
      cfg.id === 'us_abrams_fwd_c' ||
      cfg.id === 'ru_t90_fwd_c';
    const initialDelay =
      cfg.id === 'us_humvee_fwd' || cfg.id === 'ru_tigr_fwd'
        ? 3.8
        : cfg.id === 'us_abrams_fwd_c' || cfg.id === 'ru_t90_fwd_c'
        ? 7.2
        : 0;

    if (isInitialReinforcement) {
      group.visible = false;
    }

    // Squad-Aligned Vehicle Ticket Costs: MBT = -15 Tickets, IFV/APC = -10 Tickets, Light Armored Car = -5 Tickets
    const ticketCost = cfg.type === 'tank' ? 15 : cfg.type === 'apc' ? 10 : 5;
    const ticketCategory = cfg.type === 'humvee' ? 'CAR' : 'ARMOR';
    // Real-world agility & oriented bounding-box footprint for Tanks (65t), 8x8 APCs (15t), and Tactical Cars (5.5t)
    const turnRate = cfg.type === 'tank' ? 1.35 : cfg.type === 'apc' ? 1.9 : 2.55;
    const accelRate = cfg.type === 'tank' ? 2.8 : cfg.type === 'apc' ? 3.8 : 5.2;
    const hullHalfWidth = cfg.type === 'tank' ? 1.95 : cfg.type === 'apc' ? 1.65 : 1.45;
    const hullHalfLength = cfg.type === 'tank' ? 3.55 : cfg.type === 'apc' ? 3.35 : 2.65;
    const massTonnes = cfg.type === 'tank' ? 65 : cfg.type === 'apc' ? 15 : 5.5;

    const vehicle = {
      ...cfg,
      turnRate,
      accelRate,
      hullHalfWidth,
      hullHalfLength,
      massTonnes,
      ticketCost,
      ticketCategory,
      hp: cfg.maxHp,
      dead: isInitialReinforcement,
      respawnTimer: initialDelay,
      replacementTicketPaid: false,
      pos: group.position,
      yaw: cfg.spawnYaw,
      turretYaw: cfg.spawnYaw,
      turretPitch: 0,
      forwardSpeed: 0,
      driver: null,
      npcDriver: null,
      fireCooldown: 0,
      coaxCooldown: 0,
      barrelRecoil: 0,
      patrolIndex: 0,
      aiFireTimer: 1.5 + Math.random() * 2.5,
      mesh: group,
      turretPivot,
      barrelGroup,
      wheels
    };

    group.traverse((child) => {
      if (child.isMesh) {
        child.userData.vehicle = vehicle;
        this.hitMeshes.push(child);
      }
    });

    this.vehicles.push(vehicle);
  }

  findNearestEnterable(pos, maxDist = 6.2, playerTeam = null) {
    let best = null;
    let bestDist = maxDist;
    for (const v of this.vehicles) {
      if (v.dead || v.driver) continue;
      // Allow player to enter any unoccupied vehicle OR commandeer a friendly NPC-driven vehicle!
      if (v.npcDriver && playerTeam && v.team !== playerTeam) continue;
      const d = v.pos.distanceTo(pos);
      if (d < bestDist) {
        bestDist = d;
        best = v;
      }
    }
    return best;
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
    vehicle.hp = Math.max(0, vehicle.hp - amount);

    // Notify local player inside the vehicle with directional armor impact indicator!
    if (vehicle.driver && typeof vehicle.driver.notifyVehicleHit === 'function' && amount > 0) {
      vehicle.driver.notifyVehicleHit(amount, attackerName, weaponName || 'ANTI-ARMOR', attackerPos);
    }

    if (vehicle.hp <= 0) {
      vehicle.hp = 0;
      vehicle.dead = true;
      // Squad-inspired tiered vehicle replacement delay (MBT 28s, IFV/APC 22s, Car 15s)
      vehicle.respawnTimer = vehicle.type === 'tank' ? VEHICLE_STATS.RESPAWN_DELAY_TANK : vehicle.type === 'apc' ? VEHICLE_STATS.RESPAWN_DELAY_APC : VEHICLE_STATS.RESPAWN_DELAY_HUMVEE;
      vehicle.replacementTicketPaid = false;
      vehicle.mesh.visible = false;

      if (this.onVehicleRespawn) {
        this.onVehicleRespawn(
          vehicle,
          vehicle.ticketCost || (vehicle.type === 'tank' ? VEHICLE_STATS.TICKET_COST_TANK : vehicle.type === 'apc' ? VEHICLE_STATS.TICKET_COST_APC : VEHICLE_STATS.TICKET_COST_HUMVEE),
          vehicle.ticketCategory || (vehicle.type === 'humvee' ? 'CAR' : 'ARMOR'),
          'VEHICLE_DESTROYED'
        );
        vehicle.replacementTicketPaid = true;
      }

      const listenerPos =
        (vehicle.driver && vehicle.driver.pos) ||
        (this.lastPlayer && this.lastPlayer.pos) ||
        null;
      const distToListener = listenerPos ? listenerPos.distanceTo(vehicle.pos) : 0;
      sound.playExplosion(distToListener, 0, vehicle.type === 'tank' ? 1.2 : 1.0);
      this.world.spawnExplosionVisual(
        vehicle.pos.clone().add(new THREE.Vector3(0, 1.6, 0)),
        vehicle.type === 'tank' ? 8.5 : 6.5
      );

      if (vehicle.driver) {
        const driver = vehicle.driver;
        vehicle.driver = null;
        driver.activeVehicle = null;
        if (driver.viewModelGroup) driver.viewModelGroup.visible = true;
        // Emergency bail-out beside the destroyed hull: applies 42 blast concussion damage
        // instead of an instant 200-damage execution so a healthy crew member can survive!
        driver.pos.x += 2.6;
        driver.pos.y = this.world.getGroundHeightAt(driver.pos.x, driver.pos.z);
        driver.takeDamage(
          VEHICLE_STATS.BAILOUT_DAMAGE,
          attackerName,
          attackerTeam,
          `${weaponName || 'RPG-7 HEAT'} (BAIL OUT)`,
          onKillFn,
          attackerPos || vehicle.pos
        );
      }

      if (vehicle.npcDriver) {
        const npc = vehicle.npcDriver;
        vehicle.npcDriver = null;
        npc.drivingVehicle = null;
        npc.mesh.visible = true;
        npc.pos.copy(vehicle.pos);
        npc.hp = 0;
        npc.downed = false;
        npc.dead = true;
        npc.deaths = (npc.deaths || 0) + 1;
        npc.respawnTimer = 6.5;
        npc.mesh.visible = false;
      }

      if (onKillFn) {
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
        const xpPts = vehicle.type === 'tank' ? VEHICLE_STATS.DESTROY_XP_TANK : VEHICLE_STATS.DESTROY_XP_OTHER;
        onAwardXp(xpPts, `ARMOR DESTROYED (${vehicle.name})`);
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
        v.respawnTimer -= dt;
        if (v.respawnTimer <= 0) {
          // Check if faction can afford the vehicle respawn ticket cost
          const cost = v.ticketCost || (v.type === 'tank' ? 15 : v.type === 'apc' ? 10 : 5);
          const category = v.ticketCategory || (v.type === 'humvee' ? 'CAR' : 'ARMOR');
          if (!v.replacementTicketPaid && this.canTeamAffordRespawn && !this.canTeamAffordRespawn(v.team, cost)) {
            v.respawnTimer = 2.0;
            continue;
          }
          if (!v.replacementTicketPaid && this.onVehicleRespawn) {
            this.onVehicleRespawn(v, cost, category, 'VEHICLE_RESPAWN');
          }
          // Respawn UNOCCUPIED at its faction's Main Base Motor Pool!
          // NPCs at Base must physically walk to it and climb inside to drive it out.
          v.dead = false;
          v.replacementTicketPaid = false;
          v.hp = v.maxHp;
          v.driver = null;
          v.npcDriver = null;
          v.patrolIndex = 0;
          v.pos.copy(v.spawnPos);
          v.yaw = v.spawnYaw;
          v.turretYaw = v.spawnYaw;
          v.forwardSpeed = 0;
          v.barrelRecoil = 0;
          v.mesh.position.copy(v.spawnPos);
          v.mesh.rotation.y = v.spawnYaw;
          v.mesh.visible = true;
        }
        continue;
      }

      if (v.fireCooldown > 0) v.fireCooldown -= dt;
      if (v.coaxCooldown > 0) v.coaxCooldown -= dt;
      if (v.barrelRecoil > 0) {
        v.barrelRecoil = Math.max(0, v.barrelRecoil - dt * 1.8);
      }
      if (v.barrelGroup && v.type === 'tank') {
        v.barrelGroup.position.z = 1.35 - v.barrelRecoil * 0.55;
      }

      // Clear invalid NPC driver if that NPC died or was downed
      if (v.npcDriver && (v.npcDriver.dead || v.npcDriver.downed || v.driver)) {
        v.npcDriver.drivingVehicle = null;
        v.npcDriver = null;
      }

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
            wp = new THREE.Vector3(pushed.x, flagPos.y, pushed.z);
          } else if (drv.playerOrderMode === 'FOLLOW' && player && !player.dead) {
            const rawX = player.pos.x + Math.cos(vAngle) * standoffRadius;
            const rawZ = player.pos.z + Math.sin(vAngle) * standoffRadius;
            const pushed = this.world.pushOutOfBuildingFootprint
              ? this.world.pushOutOfBuildingFootprint(rawX, rawZ, 6.5)
              : { x: rawX, z: rawZ };
            wp = new THREE.Vector3(pushed.x, player.pos.y, pushed.z);
          } else if (drv.playerOrderMode === 'HOLD') {
            wp = v.pos;
          }
        }
        // Route across the nearest bridge if crossing the central river
        let targetX = wp.x;
        let targetZ = wp.z;
        if (Math.sign(v.pos.x) !== Math.sign(targetX) && Math.abs(v.pos.x) < 28) {
          targetX = Math.sign(targetX) * 4;
          targetZ = Math.abs(v.pos.z) < 55 ? 0 : v.pos.z > 0 ? 110 : -110;
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
            v.forwardSpeed = THREE.MathUtils.lerp(v.forwardSpeed, 0, dt * 4.5);
          } else {
            v.patrolIndex = (v.patrolIndex + 1) % v.patrolPoints.length;
          }
        } else {
          // Vehicle forward vector is (-sin(yaw), -cos(yaw))
          const desiredYaw = Math.atan2(-dx, -dz);
          let yawDiff = desiredYaw - v.yaw;
          while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
          while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
          v.yaw += THREE.MathUtils.clamp(yawDiff, -1.2 * dt, 1.2 * dt);
          const targetSpeed = Math.abs(yawDiff) < 0.7 ? v.speed * 0.52 : v.speed * 0.22;
          v.forwardSpeed = THREE.MathUtils.lerp(v.forwardSpeed, targetSpeed, dt * 2.8);
        }

        // Keep NPC driver's world coordinates synced with the vehicle they are piloting
        v.npcDriver.pos.copy(v.pos);

        // Scan for enemy occupied vehicles or enemy soldiers up to 155m to track & engage from ~100m overwatch!
        let bestTargetPos = null;
        let bestDistSq = VEHICLE_STATS.ENGAGE_RANGE_VEHICLE * VEHICLE_STATS.ENGAGE_RANGE_VEHICLE;

        for (const otherV of this.vehicles) {
          if (otherV.dead || otherV.team === v.team) continue;
          // Prioritize enemy vehicles that are actively crewed or near the frontline
          const dSq = v.pos.distanceToSquared(otherV.pos);
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            bestTargetPos = otherV.pos.clone().add(new THREE.Vector3(0, 1.4, 0));
          }
        }

        if (!bestTargetPos && botManager) {
          for (const b of botManager.bots) {
            if (b.dead || b.downed || b.drivingVehicle || b.team === v.team) continue;
            const dSq = v.pos.distanceToSquared(b.pos);
            if (dSq < VEHICLE_STATS.ENGAGE_RANGE_INFANTRY * VEHICLE_STATS.ENGAGE_RANGE_INFANTRY && dSq < bestDistSq) {
              bestDistSq = dSq;
              bestTargetPos = b.pos.clone().add(new THREE.Vector3(0, 1.1, 0));
            }
          }
        }

        if (
          !bestTargetPos &&
          player &&
          !player.dead &&
          !player.downed &&
          player.team !== v.team
        ) {
          const dSq = v.pos.distanceToSquared(player.pos);
          if (dSq < VEHICLE_STATS.ENGAGE_RANGE_INFANTRY * VEHICLE_STATS.ENGAGE_RANGE_INFANTRY) {
            bestTargetPos = player.pos.clone().add(new THREE.Vector3(0, 1.2, 0));
          }
        }

        if (bestTargetPos) {
          const tdx = bestTargetPos.x - v.pos.x;
          const tdz = bestTargetPos.z - v.pos.z;
          const desiredTurretYaw = Math.atan2(-tdx, -tdz);
          let tDiff = desiredTurretYaw - v.turretYaw;
          while (tDiff > Math.PI) tDiff -= Math.PI * 2;
          while (tDiff < -Math.PI) tDiff += Math.PI * 2;
          v.turretYaw += THREE.MathUtils.clamp(tDiff, -1.8 * dt, 1.8 * dt);

          v.aiFireTimer -= dt;
          if (v.aiFireTimer <= 0 && Math.abs(tDiff) < 0.25) {
            v.aiFireTimer =
              v.weaponType === 'tank_cannon'
                ? 3.8 + Math.random() * 2.2
                : v.weaponType === 'autocannon'
                ? 1.6 + Math.random() * 1.2
                : 1.1 + Math.random() * 0.9;
            this.fireAiVehicleWeapon(v, bestTargetPos, player);
          }
        } else {
          v.turretYaw = THREE.MathUtils.lerp(v.turretYaw, v.yaw, dt * 2.0);
        }
      } else if (!v.driver) {
        // Unoccupied vehicle sits stationary at the Motor Pool (or wherever parked)
        v.forwardSpeed *= Math.pow(0.05, dt);
      }

      if (Math.abs(v.forwardSpeed) > 0.05) {
        const nextX = v.pos.x - Math.sin(v.yaw) * v.forwardSpeed * dt;
        const nextZ = v.pos.z - Math.cos(v.yaw) * v.forwardSpeed * dt;

        // Tanks crush sandbags & props and climb terrain; lighter vehicles crush sandbags
        const checkX = nextX - Math.sin(v.yaw) * (v.type === 'tank' ? 3.2 : 2.4);
        const checkZ = nextZ - Math.cos(v.yaw) * (v.type === 'tank' ? 3.2 : 2.4);
        const groundY = this.world.getGroundHeightAt(nextX, nextZ);
        const g = this.world.worldToGrid(checkX, groundY + 0.8, checkZ);
        const hitVoxel = this.world.voxels.get(this.world.key(g.gx, g.gy, g.gz));

        if (hitVoxel && (hitVoxel.type === 'sandbag' || (v.type === 'tank' && hitVoxel.isProp))) {
          this.world.destroyVoxel(g.gx, g.gy, g.gz, true);
          v.pos.x = nextX;
          v.pos.z = nextZ;
          v.pos.y = groundY;
        } else if (!hitVoxel) {
          v.pos.x = Math.max(-420, Math.min(420, nextX));
          v.pos.z = Math.max(-295, Math.min(295, nextZ));
          v.pos.y = this.world.getGroundHeightAt(v.pos.x, v.pos.z);
        } else {
          v.forwardSpeed = 0;
          if (!v.driver && v.npcDriver && v.patrolPoints) {
            v.patrolIndex = (v.patrolIndex + 1) % v.patrolPoints.length;
          }
        }

        for (const w of v.wheels) {
          w.rotation.x += v.forwardSpeed * dt * 1.4;
        }

        // Vehicular Roadkill & Hull Crush Physics (Tanks, 8x8 APCs, and Tactical Cars running over soldiers)
        const minRoadkillSpeed = v.type === 'tank' ? 2.8 : v.type === 'apc' ? 3.8 : 4.2;
        if (Math.abs(v.forwardSpeed) >= minRoadkillSpeed && (botManager || player)) {
          this.checkVehicleRoadkills(v, player, botManager);
        }
      }

      v.mesh.rotation.y = v.yaw;
      v.turretPivot.rotation.y = v.turretYaw - v.yaw + Math.PI;
    }
  }

  /**
   * Checks if a moving Tank (`M1A2 Abrams` / `T-90M`), 8x8 APC (`LAV-25` / `BTR-82A`), or
   * Tactical Car (`M1151 Humvee` / `GAZ Tigr`) runs over enemy soldiers in its oriented hull footprint.
   */
  checkVehicleRoadkills(v, player, botManager) {
    if (v.dead) return;
    const fwdX = -Math.sin(v.yaw);
    const fwdZ = -Math.cos(v.yaw);
    const rightX = Math.cos(v.yaw);
    const rightZ = -Math.sin(v.yaw);
    const moveSign = Math.sign(v.forwardSpeed) || 1;
    const halfW = (v.hullHalfWidth || 1.65) + 0.42;
    const halfL = (v.hullHalfLength || 3.1) + 0.52;

    const attackerName =
      v.driver === player && player
        ? player.name
        : v.npcDriver
        ? `${v.npcDriver.name} [${v.type.toUpperCase()}]`
        : v.name;
    const attackerTeam = v.team;
    const roadkillWeapon =
      v.type === 'tank'
        ? 'ROADKILL (TANK TRACKS)'
        : v.type === 'apc'
        ? 'ROADKILL (8x8 ARMOR)'
        : 'ROADKILL (HUMVEE/TIGR)';
    const onKillCb =
      (player && (player.onKillEvent || player.onKill)) || this.onKill || null;

    // 1. Check enemy NPCs in the vehicle's path
    if (botManager && botManager.bots) {
      for (const bot of botManager.bots) {
        if (bot.dead || bot.drivingVehicle || bot.team === v.team) continue;
        const dy = Math.abs(bot.pos.y - v.pos.y);
        if (dy > 2.6) continue;

        const dx = bot.pos.x - v.pos.x;
        const dz = bot.pos.z - v.pos.z;
        const longitudinal = dx * fwdX + dz * fwdZ;
        const lateral = dx * rightX + dz * rightZ;

        if (Math.abs(lateral) <= halfW && Math.abs(longitudinal) <= halfL) {
          // Ensure soldier is in front of or underneath the moving hull
          if (longitudinal * moveSign < -halfL * 0.65) continue;

          // Knock body forward & aside from bumper/tracks
          const pushSide = lateral >= 0 ? 1 : -1;
          const knockX = bot.pos.x + fwdX * moveSign * 1.9 + rightX * pushSide * 1.45;
          const knockZ = bot.pos.z + fwdZ * moveSign * 1.9 + rightZ * pushSide * 1.45;
          if (!botManager.isPointBlocked(knockX, bot.pos.y, knockZ)) {
            bot.pos.x = knockX;
            bot.pos.z = knockZ;
            bot.pos.y = this.world.getGroundHeightAt(bot.pos.x, bot.pos.z);
          }

          if (bot.downed) {
            // Running over an already downed enemy finishes them immediately under the tracks/wheels
            bot.bleedOutTimer = Math.min(bot.bleedOutTimer || 0.1, 0.05);
            continue;
          }

          this.world.spawnDebris(
            bot.pos.clone().add(new THREE.Vector3(0, 0.9, 0)),
            new THREE.Color(0x8b1e1e),
            5
          );

          botManager.damageBot(
            bot,
            160,
            attackerName,
            attackerTeam,
            roadkillWeapon,
            false,
            onKillCb,
            v.driver === player && player ? player.onAwardXp : null
          );

          if (v.driver === player && player) {
            player.kills = (player.kills || 0) + 1;
            player.score = (player.score || 0) + 150;
            player.addShake(0.26);
            if (player.onHitMarker) player.onHitMarker('kill');
            if (player.onAwardXp) {
              player.onAwardXp(150, `🛞 ROADKILL! (${bot.name})`);
            }
          } else if (v.npcDriver) {
            v.npcDriver.kills = (v.npcDriver.kills || 0) + 1;
            v.npcDriver.score = (v.npcDriver.score || 0) + 150;
          }

          if (botManager.onTelemetryEvent) {
            botManager.onTelemetryEvent('VEHICLE_ROADKILL', {
              vehicleId: v.id,
              vehicleType: v.type,
              driver: attackerName,
              team: v.team,
              victim: bot.name,
              speedMs: Number(Math.abs(v.forwardSpeed).toFixed(1)),
              speedKmh: Math.round(Math.abs(v.forwardSpeed) * 3.6)
            });
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

  fireAiVehicleWeapon(v, targetPos, player) {
    const muzzleOrigin = v.pos.clone().add(new THREE.Vector3(0, v.type === 'tank' ? 2.25 : 2.5, 0));
    const dir = targetPos.clone().sub(muzzleOrigin).normalize();
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

    if (v.weaponType === 'tank_cannon') {
      v.barrelRecoil = 1.0;
      if (distToPlayer < 220) sound.playTankCannon(distToPlayer, pan);
      this.world.spawnDebris(
        muzzleOrigin.clone().addScaledVector(dir, 3.8),
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
        vel: dir.multiplyScalar(108),
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
        vel: dir.multiplyScalar(92),
        gravity: 2.5,
        life: 3.0,
        owner: ownerObj
      });
    }
  }
}
