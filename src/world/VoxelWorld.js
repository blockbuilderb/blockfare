import * as THREE from '../../vendor/three.module.js';
import { TEXTURES } from '../assets/textures.js?v=90';
import { VOXEL_SIZE, MAT_DEFS } from '../assets/voxel-materials.js?v=90';
import { getMapDefinition } from '../maps/index.js?v=90';
import { WEATHER, TERRAIN, MAT_HP, DISTANCES } from '../config.js?v=90';
import { events, makeEventBridge } from '../events.js?v=90';
import { TerrainGenerator } from './TerrainGenerator.js?v=90';
import { BuildingFactory } from './BuildingFactory.js?v=90';
import { ConquestSystem } from './ConquestSystem.js?v=90';
import { ProjectileManager } from './ProjectileManager.js?v=90';
import { WeatherSystem } from './WeatherSystem.js?v=90';

export { VOXEL_SIZE, MAT_DEFS };

// Pre-allocated reusable THREE.Color instance for setColorAt operations (Phase 3F)
const _tempColor = new THREE.Color();

export class VoxelWorld {
  constructor(mapScene, mapId = 'frugis_river') {
    this.scene = mapScene;
    this.mapDef = getMapDefinition(mapId);
    this.mapId = this.mapDef.id || mapId;
    this.era = this.mapDef.era || 'modern';
    this.voxels = new Map(); // "gx,gy,gz" -> voxel record
    this.instancedBatches = {};
    this.debrisParticles = [];
    this.projectiles = [];
    this.ammoCrates = [];
    this.lootPacks = [];
    this.buildings = [];
    this.containers = [];
    // Configurable option: Allow buildings to be damaged/collapsed (Default: YES / true)
    let savedDestruction = true;
    try {
      const raw = localStorage.getItem('bb_building_destruction');
      if (raw !== null) savedDestruction = raw !== 'false';
    } catch (_) {}
    this.buildingDestructionEnabled = savedDestruction;
    this.onBuildingCollapsed = makeEventBridge(
      'building:collapsed',
      (centerPos, radius, collapsedVoxels) => ({ centerPos, radius, collapsedVoxels })
    );
    this._tempColor = _tempColor;

    // Load graded terrain pads from active map definition (src/maps/frugis-river.js)
    this.gradedPads = this.mapDef.gradedPads.map((p) => ({ ...p }));

    this.sharedBoxGeo = new THREE.BoxGeometry(VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE);
    this.bakeVoxelFaceShading(this.sharedBoxGeo);
    this.dummy = new THREE.Object3D();

    this.initInstancedBatches();

    // Load Conquest Objectives (A-E) from active map definition
    this.flags = this.mapDef.flags.map((f) => ({
      id: f.id,
      name: f.name,
      pos: new THREE.Vector3(
        f.x,
        f.useGroundHeight ? this.getGroundHeightAt(f.x, f.z) : this.getTerrainHeight(f.x, f.z),
        f.z
      ),
      owner: f.owner,
      lastTeamOwner: f.owner,
      captureProgress: f.captureProgress,
      radius: f.radius || TERRAIN.FLAG_RADIUS_DEFAULT,
      defenseStage: 0,
      bannerMesh: null,
      zoneMesh: null
    }));

    const usHq = this.mapDef.spawns.US_BASE;
    const ruHq = this.mapDef.spawns.RU_BASE;
    this.spawns = {
      US_BASE: new THREE.Vector3(usHq.x, this.getTerrainHeight(usHq.x, usHq.z), usHq.z),
      RU_BASE: new THREE.Vector3(ruHq.x, this.getTerrainHeight(ruHq.x, ruHq.z), ruHq.z)
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

  /**
   * Bakes BattleBit-style directional face shading + vertical vertex Ambient Occlusion (AO)
   * directly into the shared voxel BoxGeometry at zero runtime GPU cost.
   */
  bakeVoxelFaceShading(boxGeo) {
    const posAttr = boxGeo.attributes.position;
    const normAttr = boxGeo.attributes.normal;
    const colors = new Float32Array(posAttr.count * 3);

    for (let i = 0; i < posAttr.count; i++) {
      const nx = normAttr.getX(i);
      const ny = normAttr.getY(i);
      const nz = normAttr.getZ(i);
      const vy = posAttr.getY(i);

      let light = 1.0;
      if (ny > 0.5) {
        light = 1.05; // Sunlit top face
      } else if (ny < -0.5) {
        light = 0.72; // Deep underside shadow (window lintels, overhangs, ceilings)
      } else if (nx > 0.5 || nz > 0.5) {
        light = 1.0; // Primary sunlit walls (+X / +Z)
      } else {
        light = 0.89; // Shaded walls (-X / -Z)
      }

      // Subtle vertical vertex AO on side faces so lower edges of each block have micro-depth
      if (Math.abs(ny) < 0.5 && vy < 0) {
        light *= 0.94;
      }

      colors[i * 3] = light;
      colors[i * 3 + 1] = light;
      colors[i * 3 + 2] = light;
    }

    boxGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }

  initInstancedBatches() {
    for (const [type, def] of Object.entries(MAT_DEFS)) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        vertexColors: true,
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
    if (gy < -8) return null;
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

    // Subtle cohesive BattleBit tonal variation + ground-contact ambient occlusion
    let shade = 0.98 + (((gx * 73 + gy * 31 + gz * 17) & 7) / 7) * 0.04;
    if (gy <= 1) {
      shade *= 0.94; // Ground foundation contact shadow
    }
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

  setBuildingDestruction(enabled) {
    this.buildingDestructionEnabled = Boolean(enabled);
    try {
      localStorage.setItem('bb_building_destruction', this.buildingDestructionEnabled ? 'true' : 'false');
    } catch (_) {}
    events.emit('world:destruction-toggled', { enabled: this.buildingDestructionEnabled });
    return this.buildingDestructionEnabled;
  }

  damageVoxel(gx, gy, gz, amount, broadcastFn = null, skipIntegrity = false) {
    const k = this.key(gx, gy, gz);
    const voxel = this.voxels.get(k);
    if (!voxel) return false;

    // If Building Destruction is turned OFF, structural building walls/floors/containers are indestructible!
    // (In Medieval Era, castles and siege fortifications are always destructible by boulders!)
    if (!this.buildingDestructionEnabled && this.era !== 'medieval' && !voxel.isFortification && !voxel.isProp) {
      return false;
    }

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
    if (typeof this.updateLootPacks === 'function') {
      this.updateLootPacks(dt);
    }
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
