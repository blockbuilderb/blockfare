import * as THREE from '../../vendor/three.module.js';
import { TEXTURES } from '../textures.js?v=35';
import { WEATHER, TERRAIN, MAT_HP, DISTANCES } from '../config.js?v=35';
import { TerrainGenerator } from './TerrainGenerator.js?v=35';
import { BuildingFactory } from './BuildingFactory.js?v=35';
import { ConquestSystem } from './ConquestSystem.js?v=35';
import { ProjectileManager } from './ProjectileManager.js?v=35';
import { WeatherSystem } from './WeatherSystem.js?v=35';

export const VOXEL_SIZE = 1.25;

// Pre-allocated reusable THREE.Color instance for setColorAt operations (Phase 3F)
const _tempColor = new THREE.Color();

export const MAT_DEFS = {
  brick: { hp: MAT_HP.BRICK, color: 0xd97f6c, map: 'brick', roughness: 0.9, maxInstances: 14000 },
  concrete: { hp: MAT_HP.CONCRETE, color: 0xcfd6dd, map: 'concrete', roughness: 0.85, maxInstances: 14000 },
  darkConcrete: { hp: MAT_HP.DARK_CONCRETE, color: 0x828c96, map: 'darkConcrete', roughness: 0.85, maxInstances: 10000 },
  sandbag: { hp: MAT_HP.SANDBAG, color: 0xdfd0a8, map: 'sandbag', roughness: 0.95, maxInstances: 8000 },
  wood: { hp: MAT_HP.WOOD, color: 0xc89666, map: 'wood', roughness: 0.9, maxInstances: 6000 },
  containerRed: { hp: MAT_HP.CONTAINER, color: 0xc0392b, map: 'container', roughness: 0.65, maxInstances: 3000 },
  containerBlue: { hp: MAT_HP.CONTAINER, color: 0x2980b9, map: 'container', roughness: 0.65, maxInstances: 3000 },
  containerOlive: { hp: MAT_HP.CONTAINER, color: 0x556b2f, map: 'container', roughness: 0.65, maxInstances: 3000 }
};

export class VoxelWorld {
  constructor(scene) {
    this.scene = scene;
    this.voxels = new Map(); // "gx,gy,gz" -> voxel record
    this.instancedBatches = {};
    this.debrisParticles = [];
    this.projectiles = [];
    this.ammoCrates = [];
    this.buildings = [];
    this.containers = [];
    this.onBuildingCollapsed = null;
    this._tempColor = _tempColor;

    // Large-Scale BattleBit Sectors: Flattened/graded pads aligned to VOXEL_SIZE (1.25m) multiples
    this.gradedPads = [
      { x: -195, z: -70, rx: 54, rz: 46, h: 2.5 },   // Obj A: West Frugis Town District
      { x: -95, z: 85, rx: 50, rz: 44, h: 1.25 },    // Obj B: North Container & Logistics Yard
      { x: 0, z: 0, rx: 56, rz: 48, h: 1.25 },       // Obj C: Central River City & Bridges
      { x: 105, z: -85, rx: 54, rz: 46, h: 6.25 },   // Obj D: Radar Hill & Trench Complex (High Ground)
      { x: 195, z: 70, rx: 54, rz: 46, h: 2.5 },     // Obj E: East Industrial District
      { x: -185, z: 65, rx: 38, rz: 32, h: 2.5 },    // North-West Hamlet Outpost
      { x: 185, z: -65, rx: 38, rz: 32, h: 2.5 },    // South-East Hamlet Outpost
      { x: -310, z: 0, rx: 44, rz: 38, h: 1.25 },    // US Main Base & Motor Pool
      { x: 310, z: 0, rx: 44, rz: 38, h: 1.25 }      // RU Main Base & Motor Pool
    ];

    this.sharedBoxGeo = new THREE.BoxGeometry(VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE);
    this.dummy = new THREE.Object3D();

    this.initInstancedBatches();

    this.flags = [
      {
        id: 'A',
        name: 'OBJ ALPHA — WEST FRUGIS TOWN',
        pos: new THREE.Vector3(-195, this.getTerrainHeight(-195, -70), -70),
        owner: 'US',
        lastTeamOwner: 'US',
        captureProgress: 100,
        radius: TERRAIN.FLAG_RADIUS_DEFAULT,
        defenseStage: 0,
        bannerMesh: null,
        zoneMesh: null
      },
      {
        id: 'B',
        name: 'OBJ BRAVO — LOGISTICS CONTAINER YARD',
        pos: new THREE.Vector3(-95, this.getTerrainHeight(-95, 85), 85),
        owner: 'US',
        lastTeamOwner: 'US',
        captureProgress: 80,
        radius: TERRAIN.FLAG_RADIUS_DEFAULT,
        defenseStage: 0,
        bannerMesh: null,
        zoneMesh: null
      },
      {
        id: 'C',
        name: 'OBJ CHARLIE — RIVER CITY BRIDGE PLAZA',
        pos: new THREE.Vector3(0, this.getGroundHeightAt(0, 0), 0),
        owner: 'NEUTRAL',
        lastTeamOwner: 'NEUTRAL',
        captureProgress: 0,
        radius: TERRAIN.FLAG_RADIUS_CHARLIE,
        defenseStage: 0,
        bannerMesh: null,
        zoneMesh: null
      },
      {
        id: 'D',
        name: 'OBJ DELTA — RADAR HILL GARRISON',
        pos: new THREE.Vector3(105, this.getTerrainHeight(105, -85), -85),
        owner: 'RU',
        lastTeamOwner: 'RU',
        captureProgress: -80,
        radius: TERRAIN.FLAG_RADIUS_DEFAULT,
        defenseStage: 0,
        bannerMesh: null,
        zoneMesh: null
      },
      {
        id: 'E',
        name: 'OBJ ECHO — EAST INDUSTRIAL SECTOR',
        pos: new THREE.Vector3(195, this.getTerrainHeight(195, 70), 70),
        owner: 'RU',
        lastTeamOwner: 'RU',
        captureProgress: -100,
        radius: TERRAIN.FLAG_RADIUS_DEFAULT,
        defenseStage: 0,
        bannerMesh: null,
        zoneMesh: null
      }
    ];

    this.spawns = {
      US_BASE: new THREE.Vector3(-310, this.getTerrainHeight(-310, 0), 0),
      RU_BASE: new THREE.Vector3(310, this.getTerrainHeight(310, 0), 0)
    };

    this.buildEnvironment();
    this.buildConquestFlags();

    // Dynamic Weather System (Battlefield 2042 inspired)
    this.weatherState = 'CLEAR';
    this.weatherTimer = WEATHER.TIMER_MIN + Math.random() * WEATHER.TIMER_RAND; // First weather event in 2-5 minutes
    this.weatherDuration = 0;
    this.fogDensityBase = WEATHER.FOG_DENSITY_BASE;
    this.weatherParticles = [];
  }

  initInstancedBatches() {
    for (const [type, def] of Object.entries(MAT_DEFS)) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: TEXTURES[def.map] || null,
        roughness: def.roughness,
        metalness: type.startsWith('container') ? 0.35 : 0.05
      });

      const mesh = new THREE.InstancedMesh(this.sharedBoxGeo, mat, def.maxInstances);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.count = 0;
      this.scene.add(mesh);

      this.instancedBatches[type] = {
        mesh,
        def,
        count: 0,
        freeIds: []
      };
    }
  }

  key(gx, gy, gz) {
    return `${gx},${gy},${gz}`;
  }

  worldToGrid(x, y, z) {
    return {
      gx: Math.round(x / VOXEL_SIZE),
      gy: Math.floor(y / VOXEL_SIZE),
      gz: Math.round(z / VOXEL_SIZE)
    };
  }

  gridToWorld(gx, gy, gz) {
    return new THREE.Vector3(
      gx * VOXEL_SIZE,
      gy * VOXEL_SIZE + VOXEL_SIZE * 0.5,
      gz * VOXEL_SIZE
    );
  }

  addVoxel(gx, gy, gz, type = 'brick', isProp = false, isFortification = false) {
    if (gy < -3) return null;
    const k = this.key(gx, gy, gz);
    if (this.voxels.has(k)) return this.voxels.get(k);

    const batch = this.instancedBatches[type] || this.instancedBatches.brick;
    let instanceId;
    if (batch.freeIds.length > 0) {
      instanceId = batch.freeIds.pop();
    } else {
      if (batch.count >= batch.def.maxInstances) return null;
      instanceId = batch.count++;
      batch.mesh.count = batch.count;
    }

    const wPos = this.gridToWorld(gx, gy, gz);
    this.dummy.position.copy(wPos);
    this.dummy.scale.set(1, 1, 1);
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.updateMatrix();
    batch.mesh.setMatrixAt(instanceId, this.dummy.matrix);

    // Subtle cohesive BattleBit tonal variation so wall panels look architectural rather than checkerboarded
    const shade = 0.98 + (((gx * 73 + gy * 31 + gz * 17) & 7) / 7) * 0.04;
    const baseColor = new THREE.Color(batch.def.color).multiplyScalar(shade);
    batch.mesh.setColorAt(instanceId, baseColor);

    batch.mesh.instanceMatrix.needsUpdate = true;
    if (batch.mesh.instanceColor) batch.mesh.instanceColor.needsUpdate = true;

    const half = VOXEL_SIZE * 0.5;
    const voxel = {
      key: k,
      gx,
      gy,
      gz,
      type,
      isProp: Boolean(isProp),
      isFortification: Boolean(isFortification),
      instanceId,
      hp: isProp ? MAT_HP.PROP : batch.def.hp,
      maxHp: isProp ? MAT_HP.PROP : batch.def.hp,
      baseColor,
      pos: wPos,
      minX: wPos.x - half,
      maxX: wPos.x + half,
      minY: wPos.y - half,
      maxY: wPos.y + half,
      minZ: wPos.z - half,
      maxZ: wPos.z + half
    };

    this.voxels.set(k, voxel);
    return voxel;
  }

  damageVoxel(gx, gy, gz, amount, broadcastFn = null, skipIntegrity = false) {
    const k = this.key(gx, gy, gz);
    const voxel = this.voxels.get(k);
    if (!voxel) return false;

    voxel.hp -= amount;
    if (voxel.hp <= 0) {
      this.destroyVoxel(gx, gy, gz, true);
      if (broadcastFn) {
        broadcastFn({ type: 'voxel_destroy', gx, gy, gz });
      }
      if (!skipIntegrity) {
        this.checkStructuralIntegrity(gx, gy, gz, 6, broadcastFn);
      }
      return true;
    } else {
      const batch = this.instancedBatches[voxel.type];
      if (batch) {
        const ratio = Math.max(0.25, voxel.hp / voxel.maxHp);
        // Phase 3F: Reuse pre-allocated THREE.Color instead of allocating a new clone per hit
        _tempColor.copy(voxel.baseColor).multiplyScalar(0.38 + 0.62 * ratio);
        batch.mesh.setColorAt(voxel.instanceId, _tempColor);
        if (batch.mesh.instanceColor) batch.mesh.instanceColor.needsUpdate = true;
      }
      return false;
    }
  }

  destroyVoxel(gx, gy, gz, spawnDebris = true, asCollapseBlock = false) {
    const k = this.key(gx, gy, gz);
    const voxel = this.voxels.get(k);
    if (!voxel) return false;

    const batch = this.instancedBatches[voxel.type];
    if (batch) {
      this.dummy.position.set(0, -999, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      batch.mesh.setMatrixAt(voxel.instanceId, this.dummy.matrix);
      batch.mesh.instanceMatrix.needsUpdate = true;
      batch.freeIds.push(voxel.instanceId);
    }

    const pos = voxel.pos.clone();
    const color = voxel.baseColor.clone();
    this.voxels.delete(k);

    if (asCollapseBlock) {
      this.spawnFallingBlock(pos, color);
    } else if (spawnDebris) {
      this.spawnDebris(pos, color, 3);
    }
    return true;
  }

  /**
   * High-Precision 3D Voxel + Sculpted Terrain Raycast (up to 420m across the valley)
   * Includes diagonal corner-seam blocking and optional ray thickness (`rayRadius`)
   * so neither bullets nor NPC sightlines can slip through thin cracks or diagonal block seams.
   */
  raycastVoxel(origin, dir, maxDist = DISTANCES.RAYCAST_MAX, rayRadius = 0, ignoreVoxelKey = null) {
    const stepSize = VOXEL_SIZE * 0.36;
    const steps = Math.ceil(maxDist / stepSize);
    let prevGx = null;
    let prevGy = null;
    let prevGz = null;

    for (let i = 1; i <= steps; i++) {
      const dist = Math.min(maxDist, i * stepSize);
      const px = origin.x + dir.x * dist;
      const py = origin.y + dir.y * dist;
      const pz = origin.z + dir.z * dist;

      if (py < 18.0) {
        const groundH = this.getGroundHeightAt(px, pz);
        if (py <= groundH + (rayRadius > 0 ? 0.08 : 0)) {
          return {
            voxel: null,
            isGround: true,
            distance: dist,
            point: new THREE.Vector3(px, groundH, pz),
            normal: new THREE.Vector3(0, 1, 0)
          };
        }
      }

      const gx = Math.round(px / VOXEL_SIZE);
      const gy = Math.floor(py / VOXEL_SIZE);
      const gz = Math.round(pz / VOXEL_SIZE);

      // 1. Diagonal corner-seam check: prevent slipping diagonally between two adjacent blocks
      if (prevGx !== null && prevGz !== null && (gx !== prevGx || gz !== prevGz || gy !== prevGy)) {
        if (gx !== prevGx && gz !== prevGz) {
          const seamA = this.voxels.get(this.key(prevGx, gy, gz));
          const seamB = this.voxels.get(this.key(gx, gy, prevGz));
          if (seamA && seamB && seamA.key !== ignoreVoxelKey && seamB.key !== ignoreVoxelKey) {
            return {
              voxel: seamA,
              isGround: false,
              distance: dist,
              point: new THREE.Vector3(px, py, pz),
              normal: new THREE.Vector3(Math.sign(prevGx - gx), 0, Math.sign(prevGz - gz)).normalize()
            };
          }
          if (rayRadius > 0 && ((seamA && seamA.key !== ignoreVoxelKey) || (seamB && seamB.key !== ignoreVoxelKey))) {
            const hitSeam = seamA && seamA.key !== ignoreVoxelKey ? seamA : seamB;
            return {
              voxel: hitSeam,
              isGround: false,
              distance: dist,
              point: new THREE.Vector3(px, py, pz),
              normal: new THREE.Vector3(0, 1, 0)
            };
          }
        }
      }

      // 2. Direct voxel hit check
      const k = this.key(gx, gy, gz);
      const v = k !== ignoreVoxelKey ? this.voxels.get(k) : null;
      if (v) {
        const normal = new THREE.Vector3(
          prevGx !== null ? Math.sign(prevGx - gx) : 0,
          prevGy !== null ? Math.sign(prevGy - gy) : 0,
          prevGz !== null ? Math.sign(prevGz - gz) : 0
        );
        if (normal.lengthSq() === 0) normal.set(0, 1, 0);
        else normal.normalize();

        return {
          voxel: v,
          isGround: false,
          distance: dist,
          point: new THREE.Vector3(px, py, pz),
          normal
        };
      }

      // 3. Thick ray radius check (blocks NPC vision & shots through tiny hairline gaps near block edges)
      if (rayRadius > 0) {
        for (let dx = -1; dx <= 1; dx++) {
          for (let dz = -1; dz <= 1; dz++) {
            if (dx === 0 && dz === 0) continue;
            const nk = this.key(gx + dx, gy, gz + dz);
            if (nk === ignoreVoxelKey) continue;
            const nv = this.voxels.get(nk);
            if (!nv) continue;
            const clampedX = Math.max(nv.minX, Math.min(px, nv.maxX));
            const clampedY = Math.max(nv.minY, Math.min(py, nv.maxY));
            const clampedZ = Math.max(nv.minZ, Math.min(pz, nv.maxZ));
            const dSq =
              (px - clampedX) * (px - clampedX) +
              (py - clampedY) * (py - clampedY) +
              (pz - clampedZ) * (pz - clampedZ);
            if (dSq <= rayRadius * rayRadius) {
              return {
                voxel: nv,
                isGround: false,
                distance: dist,
                point: new THREE.Vector3(px, py, pz),
                normal: new THREE.Vector3(-dx, 0, -dz).normalize()
              };
            }
          }
        }
      }

      prevGx = gx;
      prevGy = gy;
      prevGz = gz;
    }
    return null;
  }

  update(dt, units, onExplosionDamage, broadcastFn, onFlagCaptured = null, vehicles = []) {
    this.updateDebris(dt);
    this.updateProjectiles(dt, units, onExplosionDamage, broadcastFn, vehicles);
    this.updateFlags(dt, units, onFlagCaptured);
    this.updateWeather(dt);
    this.updateAmmoCrates(dt, units);
  }
}

// Mix in modular world subsystems onto VoxelWorld.prototype so all methods remain directly callable on world instances
Object.assign(
  VoxelWorld.prototype,
  TerrainGenerator,
  BuildingFactory,
  ConquestSystem,
  ProjectileManager,
  WeatherSystem
);
