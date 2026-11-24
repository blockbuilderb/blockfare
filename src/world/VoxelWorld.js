import * as THREE from '../../vendor/three.module.js';
import { TEXTURES } from '../assets/textures.js?v=120';
import { VOXEL_SIZE, MAT_DEFS } from '../assets/voxel-materials.js?v=120';
import { getMapDefinition } from '../maps/index.js?v=120';
import { WEATHER, TERRAIN, MAT_HP, DISTANCES } from '../config.js?v=120';
import { events, makeEventBridge } from '../events.js?v=120';
import { TerrainGenerator } from './TerrainGenerator.js?v=120';
import { BuildingFactory } from './BuildingFactory.js?v=120';
import { ConquestSystem } from './ConquestSystem.js?v=120';
import { ProjectileManager } from './ProjectileManager.js?v=120';
import { WeatherSystem } from './WeatherSystem.js?v=120';

export { VOXEL_SIZE, MAT_DEFS };

// Pre-allocated reusable instances for zero-allocation hot paths
const _tempColor = new THREE.Color();
const _rayBoxHit = new THREE.Vector3();

function disposeMaterialSafe(mat) {
  if (!mat) return;
  if (Array.isArray(mat)) {
    for (let i = 0; i < mat.length; i++) {
      if (mat[i] && !mat[i].userData?.shared) {
        mat[i].dispose();
      }
    }
  } else if (!mat.userData?.shared) {
    mat.dispose();
  }
}

export class VoxelWorld {
  constructor(mapScene, mapId = 'frugis_river') {
    this.scene = mapScene;
    this.mapDef = getMapDefinition(mapId);
    this.mapId = this.mapDef.id || mapId;
    this.era = this.mapDef.era || 'modern';
    this.voxels = new Map(); // 31-bit Smi integer key -> voxel record
    this._hasOverflowVoxels = false;
    this.instancedBatches = {};
    this.debrisParticles = [];
    this.projectiles = [];
    this.ammoCrates = [];
    this.lootPacks = [];
    this.buildings = [];
    this.containers = [];
    this._ownedWorldObjects = [];
    this._buildingWorld = false;

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
    this._rayBoxHit = _rayBoxHit;

    // Load graded terrain pads from active map definition with precomputed inverse radii & AABB bounds
    this.gradedPads = this.mapDef.gradedPads.map((p) => ({
      ...p,
      invRx: 1 / p.rx,
      invRz: 1 / p.rz,
      maxDx: p.rx * 1.45,
      maxDz: p.rz * 1.45
    }));

    if (typeof this._bakeTerrainHeightmap === 'function') {
      this._bakeTerrainHeightmap();
    }

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

    this._buildingWorld = true;
    this.buildEnvironment();
    this._buildingWorld = false;

    for (const batch of Object.values(this.instancedBatches)) {
      if (batch.count > 0) {
        batch.mesh.instanceMatrix.clearUpdateRanges();
        batch.mesh.instanceMatrix.needsUpdate = true;
        if (batch.mesh.instanceColor) {
          batch.mesh.instanceColor.clearUpdateRanges();
          batch.mesh.instanceColor.needsUpdate = true;
        }
      }
    }

    this.buildConquestFlags();
    if (typeof this.buildSkyClouds === 'function') {
      this.buildSkyClouds();
    }

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
    _tempColor.setRGB(1, 1, 1);
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
      mesh.setColorAt(0, _tempColor);
      if (mesh.instanceColor) {
        mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      }
      mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false;
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

  _markMatrixDirty(batch, instanceId) {
    if (!this._buildingWorld && batch && batch.mesh) {
      batch.mesh.instanceMatrix.addUpdateRange(instanceId * 16, 16);
      batch.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  _markColorDirty(batch, instanceId) {
    if (!this._buildingWorld && batch && batch.mesh && batch.mesh.instanceColor) {
      batch.mesh.instanceColor.addUpdateRange(instanceId * 3, 3);
      batch.mesh.instanceColor.needsUpdate = true;
    }
  }

  key(gx, gy, gz) {
    gx |= 0;
    gy |= 0;
    gz |= 0;
    if (gy < -16 || gy > 111 || gx < -2048 || gx > 2047 || gz < -2048 || gz > 2047) {
      return `${gx},${gy},${gz}`;
    }
    return (((gx + 2048) | ((gz + 2048) << 12) | ((gy + 16) << 24)) - 0x40000000) | 0;
  }

  getVoxel(gx, gy, gz) {
    gx |= 0;
    gy |= 0;
    gz |= 0;
    if (gy < -16 || gy > 111 || gx < -2048 || gx > 2047 || gz < -2048 || gz > 2047) {
      return this._hasOverflowVoxels ? this.voxels.get(`${gx},${gy},${gz}`) || null : null;
    }
    const k = (((gx + 2048) | ((gz + 2048) << 12) | ((gy + 16) << 24)) - 0x40000000) | 0;
    return this.voxels.get(k) || null;
  }

  hasVoxel(gx, gy, gz) {
    gx |= 0;
    gy |= 0;
    gz |= 0;
    if (gy < -16 || gy > 111 || gx < -2048 || gx > 2047 || gz < -2048 || gz > 2047) {
      return this._hasOverflowVoxels ? this.voxels.has(`${gx},${gy},${gz}`) : false;
    }
    const k = (((gx + 2048) | ((gz + 2048) << 12) | ((gy + 16) << 24)) - 0x40000000) | 0;
    return this.voxels.has(k);
  }

  hasVoxelAtWorld(wx, wy, wz) {
    return this.hasVoxel(
      Math.round(wx / VOXEL_SIZE),
      Math.floor(wy / VOXEL_SIZE),
      Math.round(wz / VOXEL_SIZE)
    );
  }

  worldToGrid(x, y, z, out = null) {
    const gx = Math.round(x / VOXEL_SIZE);
    const gy = Math.floor(y / VOXEL_SIZE);
    const gz = Math.round(z / VOXEL_SIZE);
    if (out) {
      out.gx = gx;
      out.gy = gy;
      out.gz = gz;
      return out;
    }
    return { gx, gy, gz };
  }

  gridToWorld(gx, gy, gz, out = null) {
    const wx = gx * VOXEL_SIZE;
    const wy = gy * VOXEL_SIZE + VOXEL_SIZE * 0.5;
    const wz = gz * VOXEL_SIZE;
    if (out) {
      return out.set(wx, wy, wz);
    }
    return new THREE.Vector3(wx, wy, wz);
  }

  addVoxel(gx, gy, gz, type = 'brick', isProp = false, isFortification = false) {
    gx |= 0;
    gy |= 0;
    gz |= 0;
    if (gy < -8) return null;
    const k = this.key(gx, gy, gz);
    if (typeof k === 'string') {
      this._hasOverflowVoxels = true;
    }
    const existing = this.voxels.get(k);
    if (existing) return existing;

    const batch = this.instancedBatches[type] || this.instancedBatches.brick;
    let instanceId;
    if (batch.freeIds.length > 0) {
      instanceId = batch.freeIds.pop();
    } else {
      if (batch.count >= batch.def.maxInstances) return null;
      instanceId = batch.count++;
      batch.mesh.count = batch.count;
    }

    const wx = gx * VOXEL_SIZE;
    const wy = gy * VOXEL_SIZE + VOXEL_SIZE * 0.5;
    const wz = gz * VOXEL_SIZE;

    this.dummy.position.set(wx, wy, wz);
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

    this._markMatrixDirty(batch, instanceId);
    this._markColorDirty(batch, instanceId);

    const half = VOXEL_SIZE * 0.5;
    const wPos = new THREE.Vector3(wx, wy, wz);
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
      minX: wx - half,
      maxX: wx + half,
      minY: wy - half,
      maxY: wy + half,
      minZ: wz - half,
      maxZ: wz + half
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
    const voxel = this.getVoxel(gx, gy, gz);
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
        _tempColor.copy(voxel.baseColor).multiplyScalar(0.38 + 0.62 * ratio);
        batch.mesh.setColorAt(voxel.instanceId, _tempColor);
        this._markColorDirty(batch, voxel.instanceId);
      }
      return false;
    }
  }

  destroyVoxel(gx, gy, gz, spawnDebris = true, asCollapseBlock = false) {
    const voxel = this.getVoxel(gx, gy, gz);
    if (!voxel) return false;

    const batch = this.instancedBatches[voxel.type];
    if (batch) {
      this.dummy.position.set(0, -999, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      batch.mesh.setMatrixAt(voxel.instanceId, this.dummy.matrix);
      this._markMatrixDirty(batch, voxel.instanceId);
      batch.freeIds.push(voxel.instanceId);
    }

    const pos = voxel.pos;
    const color = voxel.baseColor;
    this.voxels.delete(voxel.key);

    if (asCollapseBlock) {
      this.spawnFallingBlock(pos, color);
    } else if (spawnDebris) {
      this.spawnDebris(pos, color, 3);
    }
    return true;
  }

  /**
   * High-Precision 3D Voxel + Sculpted Terrain Raycast (up to 420m across the valley)
   * Includes skyward early-exit, cell-deduplicated integer Smi lookups, diagonal corner-seam blocking,
   * and optional ray thickness (`rayRadius`).
   */
  raycastVoxel(origin, dir, maxDist = DISTANCES.RAYCAST_MAX, rayRadius = 0, ignoreVoxelKey = null) {
    // Fast O(1) sky-ceiling skip: highest voxel in the world is below y = 54m.
    // When airborne above y = 54m, either exit immediately if aiming level/up, or jump straight down to y = 54m!
    const stepSize = VOXEL_SIZE * 0.36;
    const invVoxelSize = 1 / VOXEL_SIZE;
    const steps = Math.ceil(maxDist / stepSize);
    let startStep = 1;
    if (origin.y > 54.0) {
      if (dir.y >= -0.0005) {
        return null;
      }
      const distToVoxelCeiling = (origin.y - 54.0) / -dir.y;
      if (distToVoxelCeiling >= maxDist) {
        return null;
      }
      startStep = Math.max(1, Math.floor(distToVoxelCeiling / stepSize));
    }

    const groundBias = rayRadius > 0 ? 0.08 : 0;
    const radSq = rayRadius * rayRadius;

    let prevGx = null;
    let prevGy = null;
    let prevGz = null;

    for (let i = startStep; i <= steps; i++) {
      const dist = i * stepSize < maxDist ? i * stepSize : maxDist;
      const px = origin.x + dir.x * dist;
      const py = origin.y + dir.y * dist;
      const pz = origin.z + dir.z * dist;

      if (py > 52.0 && dir.y >= 0 && Math.abs(px) < 2000 && Math.abs(pz) < 1300) {
        return null;
      }

      if (py < 18.0) {
        const groundH = this.getGroundHeightAt(px, pz);
        if (py <= groundH + groundBias) {
          return {
            voxel: null,
            isGround: true,
            distance: dist,
            point: new THREE.Vector3(px, groundH, pz),
            normal: new THREE.Vector3(0, 1, 0)
          };
        }
      }

      const gx = Math.round(px * invVoxelSize);
      const gy = Math.floor(py * invVoxelSize);
      const gz = Math.round(pz * invVoxelSize);

      const cellChanged = gx !== prevGx || gy !== prevGy || gz !== prevGz;
      if (cellChanged) {
        // 1. Diagonal corner-seam check: prevent slipping diagonally between two adjacent blocks
        if (prevGx !== null && gx !== prevGx && gz !== prevGz) {
          const seamA = this.getVoxel(prevGx, gy, gz);
          const seamB = this.getVoxel(gx, gy, prevGz);
          const validA = seamA && seamA.key !== ignoreVoxelKey;
          const validB = seamB && seamB.key !== ignoreVoxelKey;
          if (validA && validB) {
            return {
              voxel: seamA,
              isGround: false,
              distance: dist,
              point: new THREE.Vector3(px, py, pz),
              normal: new THREE.Vector3(Math.sign(prevGx - gx), 0, Math.sign(prevGz - gz)).normalize()
            };
          }
          if (rayRadius > 0 && (validA || validB)) {
            return {
              voxel: validA ? seamA : seamB,
              isGround: false,
              distance: dist,
              point: new THREE.Vector3(px, py, pz),
              normal: new THREE.Vector3(0, 1, 0)
            };
          }
        }

        // 2. Direct voxel hit check
        const v = this.getVoxel(gx, gy, gz);
        if (v && v.key !== ignoreVoxelKey) {
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

        prevGx = gx;
        prevGy = gy;
        prevGz = gz;
      } else if (rayRadius <= 0) {
        continue;
      }

      // 3. Thick ray radius check (blocks NPC vision & shots through tiny hairline gaps near block edges)
      if (rayRadius > 0) {
        for (let dx = -1; dx <= 1; dx++) {
          for (let dz = -1; dz <= 1; dz++) {
            if (dx === 0 && dz === 0) continue;
            const nv = this.getVoxel(gx + dx, gy, gz + dz);
            if (!nv || nv.key === ignoreVoxelKey) continue;
            const clampedX = px < nv.minX ? nv.minX : px > nv.maxX ? nv.maxX : px;
            const clampedY = py < nv.minY ? nv.minY : py > nv.maxY ? nv.maxY : py;
            const clampedZ = pz < nv.minZ ? nv.minZ : pz > nv.maxZ ? nv.maxZ : pz;
            const dSq =
              (px - clampedX) * (px - clampedX) +
              (py - clampedY) * (py - clampedY) +
              (pz - clampedZ) * (pz - clampedZ);
            if (dSq <= radSq) {
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
    }
    return null;
  }

  dispose() {
    if (this.sharedBoxGeo && !this.sharedBoxGeo.userData?.shared) {
      this.sharedBoxGeo.dispose();
    }
    this.sharedBoxGeo = null;

    if (this.instancedBatches) {
      for (const batch of Object.values(this.instancedBatches)) {
        if (batch && batch.mesh) {
          if (this.scene) this.scene.remove(batch.mesh);
          disposeMaterialSafe(batch.mesh.material);
          batch.mesh.dispose?.();
        }
      }
      this.instancedBatches = {};
    }

    if (typeof this._disposeParticlePools === 'function') {
      this._disposeParticlePools();
    }

    if (this.debrisParticles) {
      for (let i = 0; i < this.debrisParticles.length; i++) {
        const p = this.debrisParticles[i];
        if (p && p.mesh) {
          if (this.scene) this.scene.remove(p.mesh);
          if (p.mesh.geometry && !p.mesh.geometry.userData?.shared) p.mesh.geometry.dispose();
          disposeMaterialSafe(p.mesh.material);
        }
      }
      this.debrisParticles.length = 0;
    }

    if (this.projectiles) {
      for (let i = 0; i < this.projectiles.length; i++) {
        const pr = this.projectiles[i];
        if (pr && pr.mesh) {
          if (this.scene) this.scene.remove(pr.mesh);
          pr.mesh.traverse?.((ch) => {
            if (ch.isMesh || ch.isLine) {
              if (ch.geometry && !ch.geometry.userData?.shared) ch.geometry.dispose();
              disposeMaterialSafe(ch.material);
            }
          });
        }
      }
      this.projectiles.length = 0;
    }

    if (this.flags) {
      for (let i = 0; i < this.flags.length; i++) {
        const f = this.flags[i];
        if (f.groupMesh && this.scene) this.scene.remove(f.groupMesh);
        if (f.bannerMesh) disposeMaterialSafe(f.bannerMesh.material);
        if (f.zoneMesh) disposeMaterialSafe(f.zoneMesh.material);
      }
    }

    if (this._ownedWorldObjects) {
      for (let i = 0; i < this._ownedWorldObjects.length; i++) {
        const obj = this._ownedWorldObjects[i];
        if (!obj) continue;
        if (this.scene && obj.parent === this.scene) this.scene.remove(obj);
        obj.traverse?.((ch) => {
          if (ch.isMesh || ch.isInstancedMesh || ch.isLine) {
            if (ch.geometry && !ch.geometry.userData?.shared) ch.geometry.dispose();
            disposeMaterialSafe(ch.material);
            if (ch.isInstancedMesh) ch.dispose?.();
          }
        });
      }
      this._ownedWorldObjects.length = 0;
    }

    if (this.skyCloudGroup) {
      if (this.scene) this.scene.remove(this.skyCloudGroup);
      this.skyCloudGroup.traverse?.((ch) => {
        if (ch.isInstancedMesh || ch.isMesh) {
          if (ch.geometry && !ch.geometry.userData?.shared) ch.geometry.dispose();
          disposeMaterialSafe(ch.material);
          if (ch.isInstancedMesh) ch.dispose?.();
        }
      });
      this.skyCloudGroup = null;
      this.skyCumulusMat = null;
      this.skyCirrusMat = null;
    }

    if (this.riverTex) {
      this.riverTex.dispose();
      this.riverTex = null;
    }

    this._heightmap = null;
    this.voxels.clear();
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
