import * as THREE from '../vendor/three.module.js';
import { sound } from './audio.js?v=11';

export class VehicleManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.vehicles = [];
    this.hitMeshes = [];

    this.initVehicles();
  }

  initVehicles() {
    // =========================================================================
    // US COMBINED-ARMS ARMOR FLEET (ALL SPAWN & RESPAWN UNOCCUPIED AT US BASE MOTOR POOL)
    // NPCs at US Base must physically walk to these vehicles and board them to drive!
    // =========================================================================
    this.spawnVehicle({
      id: 'us_abrams_hq',
      name: 'M1A2 ABRAMS MBT (120MM + COAX)',
      type: 'tank',
      team: 'US',
      spawnPos: new THREE.Vector3(-274, this.world.getGroundHeightAt(-274, -8), -8),
      spawnYaw: -Math.PI / 2,
      maxHp: 1600,
      speed: 17.5,
      weaponType: 'tank_cannon',
      rpm: 28,
      coaxRpm: 620,
      patrolPoints: [
        new THREE.Vector3(-215, 0, -24),
        new THREE.Vector3(-128, 0, -28),
        new THREE.Vector3(-42, 0, -8),
        new THREE.Vector3(36, 0, -8)
      ]
    });

    this.spawnVehicle({
      id: 'us_abrams_fwd_a',
      name: 'M1A2 ABRAMS SEP (120MM + COAX)',
      type: 'tank',
      team: 'US',
      spawnPos: new THREE.Vector3(-274, this.world.getGroundHeightAt(-274, 8), 8),
      spawnYaw: -Math.PI / 2,
      maxHp: 1600,
      speed: 17.5,
      weaponType: 'tank_cannon',
      rpm: 28,
      coaxRpm: 620,
      patrolPoints: [
        new THREE.Vector3(-210, 0, -38),
        new THREE.Vector3(-156, 0, -42),
        new THREE.Vector3(-68, 0, -18)
      ]
    });

    this.spawnVehicle({
      id: 'us_abrams_fwd_c',
      name: 'M1A2 ABRAMS TUSK (120MM + COAX)',
      type: 'tank',
      team: 'US',
      spawnPos: new THREE.Vector3(-288, this.world.getGroundHeightAt(-288, -18), -18),
      spawnYaw: -Math.PI / 2,
      maxHp: 1600,
      speed: 17.5,
      weaponType: 'tank_cannon',
      rpm: 28,
      coaxRpm: 620,
      patrolPoints: [
        new THREE.Vector3(-210, 0, 24),
        new THREE.Vector3(-105, 0, 52),
        new THREE.Vector3(-38, 0, 14)
      ]
    });

    this.spawnVehicle({
      id: 'us_lav25_hq',
      name: 'LAV-25 IFV (30MM HE)',
      type: 'apc',
      team: 'US',
      spawnPos: new THREE.Vector3(-274, this.world.getGroundHeightAt(-274, 22), 22),
      spawnYaw: -Math.PI / 2,
      maxHp: 1050,
      speed: 19.5,
      weaponType: 'autocannon',
      rpm: 210,
      patrolPoints: [
        new THREE.Vector3(-200, 0, 28),
        new THREE.Vector3(-98, 0, 62),
        new THREE.Vector3(-34, 0, 18)
      ]
    });

    this.spawnVehicle({
      id: 'us_humvee_hq',
      name: 'M1151 HUMVEE (.50 CAL)',
      type: 'humvee',
      team: 'US',
      spawnPos: new THREE.Vector3(-288, this.world.getGroundHeightAt(-288, 0), 0),
      spawnYaw: -Math.PI / 2,
      maxHp: 700,
      speed: 25,
      weaponType: 'hmg',
      rpm: 460,
      patrolPoints: [
        new THREE.Vector3(-215, 0, -14),
        new THREE.Vector3(-135, 0, -36),
        new THREE.Vector3(-48, 0, 6)
      ]
    });

    this.spawnVehicle({
      id: 'us_humvee_fwd',
      name: 'M1151 ASSAULT HUMVEE (.50 CAL)',
      type: 'humvee',
      team: 'US',
      spawnPos: new THREE.Vector3(-288, this.world.getGroundHeightAt(-288, 18), 18),
      spawnYaw: -Math.PI / 2,
      maxHp: 700,
      speed: 25,
      weaponType: 'hmg',
      rpm: 460,
      patrolPoints: [
        new THREE.Vector3(-205, 0, 22),
        new THREE.Vector3(-115, 0, 56),
        new THREE.Vector3(-52, 0, 28)
      ]
    });

    // =========================================================================
    // RU COMBINED-ARMS ARMOR FLEET (ALL SPAWN & RESPAWN UNOCCUPIED AT RU BASE MOTOR POOL)
    // NPCs at RU Base must physically walk to these vehicles and board them to drive!
    // =========================================================================
    this.spawnVehicle({
      id: 'ru_t90_hq',
      name: 'T-90M PRORYV MBT (125MM + COAX)',
      type: 'tank',
      team: 'RU',
      spawnPos: new THREE.Vector3(274, this.world.getGroundHeightAt(274, 8), 8),
      spawnYaw: Math.PI / 2,
      maxHp: 1600,
      speed: 17.5,
      weaponType: 'tank_cannon',
      rpm: 26,
      coaxRpm: 620,
      patrolPoints: [
        new THREE.Vector3(215, 0, 24),
        new THREE.Vector3(128, 0, 28),
        new THREE.Vector3(42, 0, 8),
        new THREE.Vector3(-36, 0, 8)
      ]
    });

    this.spawnVehicle({
      id: 'ru_t90_fwd_c',
      name: 'T-90M GUARD MBT (125MM + COAX)',
      type: 'tank',
      team: 'RU',
      spawnPos: new THREE.Vector3(274, this.world.getGroundHeightAt(274, -8), -8),
      spawnYaw: Math.PI / 2,
      maxHp: 1600,
      speed: 17.5,
      weaponType: 'tank_cannon',
      rpm: 26,
      coaxRpm: 620,
      patrolPoints: [
        new THREE.Vector3(210, 0, -24),
        new THREE.Vector3(115, 0, -48),
        new THREE.Vector3(44, 0, -14)
      ]
    });

    this.spawnVehicle({
      id: 'ru_t90_fwd_a',
      name: 'T-90M ASSAULT MBT (125MM + COAX)',
      type: 'tank',
      team: 'RU',
      spawnPos: new THREE.Vector3(288, this.world.getGroundHeightAt(288, 18), 18),
      spawnYaw: Math.PI / 2,
      maxHp: 1600,
      speed: 17.5,
      weaponType: 'tank_cannon',
      rpm: 26,
      coaxRpm: 620,
      patrolPoints: [
        new THREE.Vector3(210, 0, 38),
        new THREE.Vector3(156, 0, 44),
        new THREE.Vector3(58, 0, 16)
      ]
    });

    this.spawnVehicle({
      id: 'ru_btr82_hq',
      name: 'BTR-82A APC (30MM HE)',
      type: 'apc',
      team: 'RU',
      spawnPos: new THREE.Vector3(274, this.world.getGroundHeightAt(274, -22), -22),
      spawnYaw: Math.PI / 2,
      maxHp: 1050,
      speed: 19.5,
      weaponType: 'autocannon',
      rpm: 210,
      patrolPoints: [
        new THREE.Vector3(200, 0, -28),
        new THREE.Vector3(105, 0, -56),
        new THREE.Vector3(38, 0, -18)
      ]
    });

    this.spawnVehicle({
      id: 'ru_tigr_hq',
      name: 'GAZ TIGR (.50 CAL)',
      type: 'humvee',
      team: 'RU',
      spawnPos: new THREE.Vector3(288, this.world.getGroundHeightAt(288, 0), 0),
      spawnYaw: Math.PI / 2,
      maxHp: 700,
      speed: 25,
      weaponType: 'hmg',
      rpm: 460,
      patrolPoints: [
        new THREE.Vector3(215, 0, 14),
        new THREE.Vector3(135, 0, 36),
        new THREE.Vector3(48, 0, -6)
      ]
    });

    this.spawnVehicle({
      id: 'ru_tigr_fwd',
      name: 'GAZ TIGR ASSAULT (.50 CAL)',
      type: 'humvee',
      team: 'RU',
      spawnPos: new THREE.Vector3(288, this.world.getGroundHeightAt(288, -18), -18),
      spawnYaw: Math.PI / 2,
      maxHp: 700,
      speed: 25,
      weaponType: 'hmg',
      rpm: 460,
      patrolPoints: [
        new THREE.Vector3(205, 0, -22),
        new THREE.Vector3(115, 0, -56),
        new THREE.Vector3(46, 0, -24)
      ]
    });
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

    const vehicle = {
      ...cfg,
      hp: cfg.maxHp,
      dead: false,
      respawnTimer: 0,
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
      vehicle.respawnTimer = 18;
      vehicle.mesh.visible = false;

      sound.playExplosion(0);
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
          42,
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
        const xpPts = vehicle.type === 'tank' ? 400 : 250;
        onAwardXp(xpPts, `ARMOR DESTROYED (${vehicle.name})`);
      }
      return true;
    }
    return false;
  }

  update(dt, player = null, botManager = null) {
    for (const v of this.vehicles) {
      if (v.dead) {
        v.respawnTimer -= dt;
        if (v.respawnTimer <= 0) {
          // Respawn UNOCCUPIED at its faction's Main Base Motor Pool!
          // NPCs at Base must physically walk to it and climb inside to drive it out.
          v.dead = false;
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
        const wp = v.patrolPoints[v.patrolIndex % v.patrolPoints.length];
        const dx = wp.x - v.pos.x;
        const dz = wp.z - v.pos.z;
        const distToWp = Math.hypot(dx, dz);

        if (distToWp < 7.0) {
          v.patrolIndex = (v.patrolIndex + 1) % v.patrolPoints.length;
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

        // Scan for enemy occupied vehicles or enemy soldiers to track & engage with turret
        let bestTargetPos = null;
        let bestDistSq = 125 * 125;

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
            if (dSq < 85 * 85 && dSq < bestDistSq) {
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
          if (dSq < 85 * 85) {
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
      }

      v.mesh.rotation.y = v.yaw;
      v.turretPivot.rotation.y = v.turretYaw - v.yaw + Math.PI;
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
    const ownerObj = v.npcDriver || {
      name: v.name,
      team: v.team,
      isAiVehicle: true,
      pos: v.pos.clone()
    };

    if (v.weaponType === 'tank_cannon') {
      v.barrelRecoil = 1.0;
      if (distToPlayer < 160) sound.playExplosion(distToPlayer * 0.35);
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
      if (distToPlayer < 130) sound.playGunshot('autocannon', distToPlayer);
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
