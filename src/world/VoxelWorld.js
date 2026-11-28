import * as THREE from '../../vendor/three.module.js';
import { TEXTURES } from '../assets/textures.js?v=149';
import { VOXEL_SIZE, MAT_DEFS } from '../assets/voxel-materials.js?v=149';
import { getMapDefinition } from '../maps/index.js?v=149';
import { WEATHER, TERRAIN, MAT_HP, DISTANCES } from '../config.js?v=149';
import { events, makeEventBridge } from '../events.js?v=149';
import { TerrainGenerator } from './TerrainGenerator.js?v=149';
import { BuildingFactory } from './BuildingFactory.js?v=149';
import { ConquestSystem } from './ConquestSystem.js?v=149';
import { ProjectileManager } from './ProjectileManager.js?v=149';
import { WeatherSystem } from './WeatherSystem.js?v=149';

export { VOXEL_SIZE, MAT_DEFS };

// Pre-allocated reusable instances & growable chunk-meshing scratch buffers (zero GC churn)
const _tempColor = new THREE.Color();
const _rayBoxHit = new THREE.Vector3();

const CHUNK_SHIFT = 7; // 128x128 voxels = 160m x 160m frustum-culled spatial sectors (~38 draw calls map-wide)
const CHUNK_MASK = (1 << CHUNK_SHIFT) - 1;
let _scratchQuadCap = 16384;
let _scratchPos = new Float32Array(_scratchQuadCap * 12);
let _scratchNorm = new Float32Array(_scratchQuadCap * 12);
let _scratchCol = new Float32Array(_scratchQuadCap * 12);
let _scratchUv = new Float32Array(_scratchQuadCap * 8);

function ensureScratchQuadCapacity(minQuads) {
  if (minQuads <= _scratchQuadCap) return;
  while (_scratchQuadCap < minQuads) {
    _scratchQuadCap *= 2;
  }
  _scratchPos = new Float32Array(_scratchQuadCap * 12);
  _scratchNorm = new Float32Array(_scratchQuadCap * 12);
  _scratchCol = new Float32Array(_scratchQuadCap * 12);
  _scratchUv = new Float32Array(_scratchQuadCap * 8);
}

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
    this._voxelChunks = new Map();
    this._dirtyVoxelChunkKeys = new Set();
    this._voxelMutationEpoch = 1;
    this.debrisParticles = [];
    this.projectiles = [];
    this.ammoCrates = [];
    this.lootPacks = [];
    this.buildings = [];
    this.containers = [];
    this.climbableLadders = [];
    this.elevatedPlatforms = [];
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

    for (const chunkKey of this._voxelChunks.keys()) {
      this._dirtyVoxelChunkKeys.add(chunkKey);
    }
    this.flushDirtyVoxelChunks();

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
    for (const [type, def] of Object.entries(MAT_DEFS)) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        vertexColors: true,
        map: TEXTURES[def.map] || null,
        roughness: def.roughness,
        metalness: typeof def.metalness === 'number' ? def.metalness : type.startsWith('container') ? 0.35 : 0.05
      });

      this.instancedBatches[type] = {
        mesh: null,
        material: mat,
        def,
        maxInstances: def.maxInstances,
        count: 0,
        freeIds: []
      };
    }
  }

  _chunkKey(cx, cz) {
    return ((cx + 2048) & 0xffff) | (((cz + 2048) & 0xffff) << 16);
  }

  _getOrCreateVoxelChunk(cx, cz) {
    const ck = this._chunkKey(cx, cz);
    let chunk = this._voxelChunks.get(ck);
    if (!chunk) {
      chunk = {
        cx,
        cz,
        key: ck,
        voxelsByType: Object.create(null),
        meshesByType: Object.create(null)
      };
      this._voxelChunks.set(ck, chunk);
    }
    return chunk;
  }

  _markVoxelChunkDirty(gx, gz, includeSeamNeighbors = false) {
    if (this._buildingWorld) return;
    const cx = gx >> CHUNK_SHIFT;
    const cz = gz >> CHUNK_SHIFT;
    const ck = this._chunkKey(cx, cz);
    if (this._voxelChunks.has(ck)) {
      this._dirtyVoxelChunkKeys.add(ck);
    }
    if (includeSeamNeighbors) {
      const lx = gx & CHUNK_MASK;
      const lz = gz & CHUNK_MASK;
      if (lx === 0) {
        const nk = this._chunkKey(cx - 1, cz);
        if (this._voxelChunks.has(nk)) this._dirtyVoxelChunkKeys.add(nk);
      } else if (lx === CHUNK_MASK) {
        const nk = this._chunkKey(cx + 1, cz);
        if (this._voxelChunks.has(nk)) this._dirtyVoxelChunkKeys.add(nk);
      }
      if (lz === 0) {
        const nk = this._chunkKey(cx, cz - 1);
        if (this._voxelChunks.has(nk)) this._dirtyVoxelChunkKeys.add(nk);
      } else if (lz === CHUNK_MASK) {
        const nk = this._chunkKey(cx, cz + 1);
        if (this._voxelChunks.has(nk)) this._dirtyVoxelChunkKeys.add(nk);
      }
    }
  }

  /**
   * Rebuilds ONLY spatial 40m×40m voxel chunks dirtied since the last flush, emitting strictly
   * exposed exterior faces (`!hasVoxel(neighbor)`) with baked BattleBit directional shading,
   * vertical lower-edge AO, damage darkening, and per-chunk GPU frustum culling (`frustumCulled = true`).
   */
  flushDirtyVoxelChunks(maxBudgetMs = Infinity) {
    if (!this._dirtyVoxelChunkKeys || this._dirtyVoxelChunkKeys.size === 0) return;
    const useBudget = Number.isFinite(maxBudgetMs) && maxBudgetMs > 0;
    const tStart = useBudget && typeof performance !== 'undefined' ? performance.now() : 0;
    let built = 0;
    for (const ck of this._dirtyVoxelChunkKeys) {
      const chunk = this._voxelChunks.get(ck);
      this._dirtyVoxelChunkKeys.delete(ck);
      if (chunk) {
        this._rebuildSingleVoxelChunk(chunk);
        built++;
      }
      if (useBudget && built >= 2 && performance.now() - tStart >= maxBudgetMs) {
        break;
      }
    }
  }

  _rebuildSingleVoxelChunk(chunk) {
    const types = Object.keys(chunk.voxelsByType);
    for (let tIdx = 0; tIdx < types.length; tIdx++) {
      const type = types[tIdx];
      const list = chunk.voxelsByType[type];
      const existingMesh = chunk.meshesByType[type] || null;
      if (!list || list.length === 0) {
        if (existingMesh) {
          if (this.scene) this.scene.remove(existingMesh);
          existingMesh.geometry?.dispose();
          chunk.meshesByType[type] = null;
        }
        continue;
      }

      ensureScratchQuadCapacity(list.length * 6);
      let quadCount = 0;

      const emitQuad = (
        x0, y0, z0, x1, y1, z1, x2, y2, z2, x3, y3, z3,
        nx, ny, nz,
        rTop, gTop, bTop, rBot, gBot, bBot,
        uSpan = 1, vSpan = 1
      ) => {
        const pOff = quadCount * 12;
        _scratchPos[pOff] = x0; _scratchPos[pOff + 1] = y0; _scratchPos[pOff + 2] = z0;
        _scratchPos[pOff + 3] = x1; _scratchPos[pOff + 4] = y1; _scratchPos[pOff + 5] = z1;
        _scratchPos[pOff + 6] = x2; _scratchPos[pOff + 7] = y2; _scratchPos[pOff + 8] = z2;
        _scratchPos[pOff + 9] = x3; _scratchPos[pOff + 10] = y3; _scratchPos[pOff + 11] = z3;

        _scratchNorm[pOff] = nx; _scratchNorm[pOff + 1] = ny; _scratchNorm[pOff + 2] = nz;
        _scratchNorm[pOff + 3] = nx; _scratchNorm[pOff + 4] = ny; _scratchNorm[pOff + 5] = nz;
        _scratchNorm[pOff + 6] = nx; _scratchNorm[pOff + 7] = ny; _scratchNorm[pOff + 8] = nz;
        _scratchNorm[pOff + 9] = nx; _scratchNorm[pOff + 10] = ny; _scratchNorm[pOff + 11] = nz;

        _scratchCol[pOff] = rBot; _scratchCol[pOff + 1] = gBot; _scratchCol[pOff + 2] = bBot;
        _scratchCol[pOff + 3] = rBot; _scratchCol[pOff + 4] = gBot; _scratchCol[pOff + 5] = bBot;
        _scratchCol[pOff + 6] = rTop; _scratchCol[pOff + 7] = gTop; _scratchCol[pOff + 8] = bTop;
        _scratchCol[pOff + 9] = rTop; _scratchCol[pOff + 10] = gTop; _scratchCol[pOff + 11] = bTop;

        const uOff = quadCount * 8;
        _scratchUv[uOff] = 0; _scratchUv[uOff + 1] = 0;
        _scratchUv[uOff + 2] = uSpan; _scratchUv[uOff + 3] = 0;
        _scratchUv[uOff + 4] = uSpan; _scratchUv[uOff + 5] = vSpan;
        _scratchUv[uOff + 6] = 0; _scratchUv[uOff + 7] = vSpan;
        quadCount++;
      };

      const chunkCx = chunk.cx;
      const chunkCz = chunk.cz;
      const canMergeNeighbor = (nv, dmg) =>
        Boolean(
          nv &&
            nv.type === type &&
            (nv.gx >> CHUNK_SHIFT) === chunkCx &&
            (nv.gz >> CHUNK_SHIFT) === chunkCz &&
            Math.abs((nv._dmgBrightness ?? 1.0) - dmg) < 0.04
        );

      // Coplanar Greedy Strip Merging: merges contiguous X-runs of `+Y/-Y/+Z/-Z` faces and Z-runs of `+X/-X` faces
      // into single tiled quads (`RepeatWrapping`), cutting voxel triangle count across buildings & roofs by ~75–85%!
      for (let i = 0; i < list.length; i++) {
        const v = list[i];
        const gx = v.gx;
        const gy = v.gy;
        const gz = v.gz;
        const x0 = v.minX;
        const y0 = v.minY;
        const y1 = v.maxY;
        const z0 = v.minZ;
        const z1 = v.maxZ;
        const dmg = v._dmgBrightness ?? 1.0;
        const br = v.baseColor.r * dmg;
        const bg = v.baseColor.g * dmg;
        const bb = v.baseColor.b * dmg;

        // +Y Top Face (merge contiguous +X run)
        if (!this.hasVoxel(gx, gy + 1, gz)) {
          const prevX = this.getVoxel(gx - 1, gy, gz);
          if (!(canMergeNeighbor(prevX, dmg) && !this.hasVoxel(gx - 1, gy + 1, gz))) {
            let run = 1;
            while (run < 32) {
              const nxt = this.getVoxel(gx + run, gy, gz);
              if (!canMergeNeighbor(nxt, dmg) || this.hasVoxel(gx + run, gy + 1, gz)) break;
              run++;
            }
            const xEnd = x0 + run * VOXEL_SIZE;
            const r = br * 1.05, g = bg * 1.05, b = bb * 1.05;
            emitQuad(x0, y1, z1, xEnd, y1, z1, xEnd, y1, z0, x0, y1, z0, 0, 1, 0, r, g, b, r, g, b, run, 1);
          }
        }
        // -Y Bottom Face (skip underground buried floor bottoms below gy <= 0 unless above river)
        if ((gy >= 1 || Math.abs(gx) < 32) && !this.hasVoxel(gx, gy - 1, gz)) {
          const prevX = this.getVoxel(gx - 1, gy, gz);
          if (
            !(
              canMergeNeighbor(prevX, dmg) &&
              (gy >= 1 || Math.abs(gx - 1) < 32) &&
              !this.hasVoxel(gx - 1, gy - 1, gz)
            )
          ) {
            let run = 1;
            while (run < 32) {
              const nxGx = gx + run;
              if (gy < 1 && Math.abs(nxGx) >= 32) break;
              const nxt = this.getVoxel(nxGx, gy, gz);
              if (!canMergeNeighbor(nxt, dmg) || this.hasVoxel(nxGx, gy - 1, gz)) break;
              run++;
            }
            const xEnd = x0 + run * VOXEL_SIZE;
            const r = br * 0.72, g = bg * 0.72, b = bb * 0.72;
            emitQuad(x0, y0, z0, xEnd, y0, z0, xEnd, y0, z1, x0, y0, z1, 0, -1, 0, r, g, b, r, g, b, run, 1);
          }
        }
        // +Z Front Face (merge contiguous +X run)
        if (!this.hasVoxel(gx, gy, gz + 1)) {
          const prevX = this.getVoxel(gx - 1, gy, gz);
          if (!(canMergeNeighbor(prevX, dmg) && !this.hasVoxel(gx - 1, gy, gz + 1))) {
            let run = 1;
            while (run < 32) {
              const nxt = this.getVoxel(gx + run, gy, gz);
              if (!canMergeNeighbor(nxt, dmg) || this.hasVoxel(gx + run, gy, gz + 1)) break;
              run++;
            }
            const xEnd = x0 + run * VOXEL_SIZE;
            emitQuad(
              x0, y0, z1, xEnd, y0, z1, xEnd, y1, z1, x0, y1, z1,
              0, 0, 1,
              br, bg, bb, br * 0.94, bg * 0.94, bb * 0.94,
              run, 1
            );
          }
        }
        // -Z Back Face (merge contiguous +X run)
        if (!this.hasVoxel(gx, gy, gz - 1)) {
          const prevX = this.getVoxel(gx - 1, gy, gz);
          if (!(canMergeNeighbor(prevX, dmg) && !this.hasVoxel(gx - 1, gy, gz - 1))) {
            let run = 1;
            while (run < 32) {
              const nxt = this.getVoxel(gx + run, gy, gz);
              if (!canMergeNeighbor(nxt, dmg) || this.hasVoxel(gx + run, gy, gz - 1)) break;
              run++;
            }
            const xEnd = x0 + run * VOXEL_SIZE;
            const rt = br * 0.89, gt = bg * 0.89, bt = bb * 0.89;
            emitQuad(
              xEnd, y0, z0, x0, y0, z0, x0, y1, z0, xEnd, y1, z0,
              0, 0, -1,
              rt, gt, bt, rt * 0.94, gt * 0.94, bt * 0.94,
              run, 1
            );
          }
        }
        // +X Right Face (merge contiguous +Z run)
        if (!this.hasVoxel(gx + 1, gy, gz)) {
          const prevZ = this.getVoxel(gx, gy, gz - 1);
          if (!(canMergeNeighbor(prevZ, dmg) && !this.hasVoxel(gx + 1, gy, gz - 1))) {
            let run = 1;
            while (run < 32) {
              const nxt = this.getVoxel(gx, gy, gz + run);
              if (!canMergeNeighbor(nxt, dmg) || this.hasVoxel(gx + 1, gy, gz + run)) break;
              run++;
            }
            const zEnd = z0 + run * VOXEL_SIZE;
            const x1 = v.maxX;
            emitQuad(
              x1, y0, zEnd, x1, y0, z0, x1, y1, z0, x1, y1, zEnd,
              1, 0, 0,
              br, bg, bb, br * 0.94, bg * 0.94, bb * 0.94,
              run, 1
            );
          }
        }
        // -X Left Face (merge contiguous +Z run)
        if (!this.hasVoxel(gx - 1, gy, gz)) {
          const prevZ = this.getVoxel(gx, gy, gz - 1);
          if (!(canMergeNeighbor(prevZ, dmg) && !this.hasVoxel(gx - 1, gy, gz - 1))) {
            let run = 1;
            while (run < 32) {
              const nxt = this.getVoxel(gx, gy, gz + run);
              if (!canMergeNeighbor(nxt, dmg) || this.hasVoxel(gx - 1, gy, gz + run)) break;
              run++;
            }
            const zEnd = z0 + run * VOXEL_SIZE;
            const rt = br * 0.89, gt = bg * 0.89, bt = bb * 0.89;
            emitQuad(
              x0, y0, z0, x0, y0, zEnd, x0, y1, zEnd, x0, y1, z0,
              -1, 0, 0,
              rt, gt, bt, rt * 0.94, gt * 0.94, bt * 0.94,
              run, 1
            );
          }
        }
      }

      if (quadCount === 0) {
        if (existingMesh) {
          if (this.scene) this.scene.remove(existingMesh);
          existingMesh.geometry?.dispose();
          chunk.meshesByType[type] = null;
        }
        continue;
      }

      const vertCount = quadCount * 4;
      const posArr = _scratchPos.slice(0, quadCount * 12);
      const normArr = _scratchNorm.slice(0, quadCount * 12);
      const colArr = _scratchCol.slice(0, quadCount * 12);
      const uvArr = _scratchUv.slice(0, quadCount * 8);
      const idxArr =
        vertCount <= 65535
          ? new Uint16Array(quadCount * 6)
          : new Uint32Array(quadCount * 6);
      for (let q = 0; q < quadCount; q++) {
        const b = q * 4;
        const io = q * 6;
        idxArr[io] = b;
        idxArr[io + 1] = b + 1;
        idxArr[io + 2] = b + 2;
        idxArr[io + 3] = b;
        idxArr[io + 4] = b + 2;
        idxArr[io + 5] = b + 3;
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(normArr, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
      geo.setIndex(new THREE.BufferAttribute(idxArr, 1));
      geo.computeBoundingSphere();

      const batch = this.instancedBatches[type] || this.instancedBatches.brick;
      // Skip shadow-map casting on distant peripheral chunks (>950m from valley center) & minor wood/sandbag props to save GPU shadow pass
      const chunkCenterX = (chunkCx + 0.5) * (1 << CHUNK_SHIFT) * VOXEL_SIZE;
      const shouldCastShadow =
        Math.abs(chunkCenterX) <= 950 && type !== 'wood' && type !== 'sandbag';
      if (existingMesh) {
        existingMesh.geometry?.dispose();
        existingMesh.geometry = geo;
        existingMesh.castShadow = shouldCastShadow;
      } else if (batch && batch.material) {
        const mesh = new THREE.Mesh(geo, batch.material);
        mesh.name = 'VoxelSectorChunk';
        mesh.frustumCulled = true;
        mesh.matrixAutoUpdate = false;
        mesh.castShadow = shouldCastShadow;
        mesh.receiveShadow = true;
        if (this.scene) this.scene.add(mesh);
        chunk.meshesByType[type] = mesh;
      } else {
        geo.dispose();
      }
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
    if (gy < -15) return null;
    const k = this.key(gx, gy, gz);
    if (typeof k === 'string') {
      this._hasOverflowVoxels = true;
    }
    const existing = this.voxels.get(k);
    if (existing) return existing;

    const resolvedType = this.instancedBatches[type] ? type : 'brick';
    const batch = this.instancedBatches[resolvedType];
    if (batch.count >= batch.def.maxInstances) return null;
    const instanceId = batch.count++;

    const wx = gx * VOXEL_SIZE;
    const wy = gy * VOXEL_SIZE + VOXEL_SIZE * 0.5;
    const wz = gz * VOXEL_SIZE;

    // Subtle cohesive BattleBit tonal variation + ground-contact ambient occlusion
    let shade = 0.98 + (((gx * 73 + gy * 31 + gz * 17) & 7) / 7) * 0.04;
    if (gy <= 1) {
      shade *= 0.94; // Ground foundation contact shadow
    }
    const baseColor = new THREE.Color(batch.def.color).multiplyScalar(shade);

    const half = VOXEL_SIZE * 0.5;
    const wPos = new THREE.Vector3(wx, wy, wz);
    const chunk = this._getOrCreateVoxelChunk(gx >> CHUNK_SHIFT, gz >> CHUNK_SHIFT);
    let chunkList = chunk.voxelsByType[resolvedType];
    if (!chunkList) {
      chunkList = [];
      chunk.voxelsByType[resolvedType] = chunkList;
    }
    const voxel = {
      key: k,
      gx,
      gy,
      gz,
      type: resolvedType,
      isProp: Boolean(isProp),
      isFortification: Boolean(isFortification),
      instanceId,
      hp: isProp ? MAT_HP.PROP : batch.def.hp,
      maxHp: isProp ? MAT_HP.PROP : batch.def.hp,
      baseColor,
      _dmgBrightness: 1.0,
      _chunkList: chunkList,
      _chunkIdx: chunkList.length,
      pos: wPos,
      minX: wx - half,
      maxX: wx + half,
      minY: wy - half,
      maxY: wy + half,
      minZ: wz - half,
      maxZ: wz + half
    };

    chunkList.push(voxel);
    this.voxels.set(k, voxel);
    if (!this._buildingWorld) {
      this._voxelMutationEpoch = (this._voxelMutationEpoch || 1) + 1;
      this._markVoxelChunkDirty(gx, gz, true);
    }
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

    // Structural Steel I-Beam Girders (`steelBeam`) are immune to small arms, AMR bullets, hand grenades,
    // and light <=30mm autocannons (`amount < 160`); only heavy demolition (C4, aerial bombs, 105mm/120mm tank/AC-130 shells, 155mm arty) severs them!
    if (voxel.type === 'steelBeam' && amount < 160) {
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
      const ratio = Math.max(0.25, voxel.hp / voxel.maxHp);
      voxel._dmgBrightness = 0.38 + 0.62 * ratio;
      this._markVoxelChunkDirty(gx, gz, false);
      return false;
    }
  }

  destroyVoxel(gx, gy, gz, spawnDebris = true, asCollapseBlock = false) {
    const voxel = this.getVoxel(gx, gy, gz);
    if (!voxel) return false;

    const batch = this.instancedBatches[voxel.type];
    if (batch && batch.count > 0) {
      batch.count--;
    }

    const list = voxel._chunkList;
    if (Array.isArray(list) && voxel._chunkIdx >= 0 && voxel._chunkIdx < list.length) {
      const last = list.pop();
      if (last && last !== voxel) {
        list[voxel._chunkIdx] = last;
        last._chunkIdx = voxel._chunkIdx;
      }
      voxel._chunkIdx = -1;
    }

    const pos = voxel.pos;
    const color = voxel.baseColor;
    this.voxels.delete(voxel.key);
    if (!this._buildingWorld) {
      this._voxelMutationEpoch = (this._voxelMutationEpoch || 1) + 1;
      this._markVoxelChunkDirty(gx, gz, true);
    }

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
    // Fast O(1) sky-ceiling skip: highest skyscraper/tower in the world is below y = 125m.
    // When airborne above y = 125m, either exit immediately if aiming level/up, or jump straight down to y = 125m!
    const stepSize = VOXEL_SIZE * 0.36;
    const invVoxelSize = 1 / VOXEL_SIZE;
    const steps = Math.ceil(maxDist / stepSize);
    let startStep = 1;
    if (origin.y > 125.0) {
      if (dir.y >= -0.0005) {
        return null;
      }
      const distToVoxelCeiling = (origin.y - 125.0) / -dir.y;
      if (distToVoxelCeiling >= maxDist) {
        return null;
      }
      startStep = Math.max(1, Math.floor(distToVoxelCeiling / stepSize));
    }

    const groundBias = rayRadius > 0 ? 0.08 : 0;
    const radSq = rayRadius * rayRadius;
    const platforms = this.elevatedPlatforms;
    const hasPlatforms = Array.isArray(platforms) && platforms.length > 0;

    let prevGx = null;
    let prevGy = null;
    let prevGz = null;

    for (let i = startStep; i <= steps; i++) {
      const dist = i * stepSize < maxDist ? i * stepSize : maxDist;
      const px = origin.x + dir.x * dist;
      const py = origin.y + dir.y * dist;
      const pz = origin.z + dir.z * dist;

      if (py > 122.0 && dir.y >= 0 && Math.abs(px) < 2000 && Math.abs(pz) < 1300) {
        return null;
      }

      if (hasPlatforms && py > 5.0 && py < 118.0) {
        for (let pIdx = 0; pIdx < platforms.length; pIdx++) {
          const plat = platforms[pIdx];
          if (
            px >= plat.minX &&
            px <= plat.maxX &&
            pz >= plat.minZ &&
            pz <= plat.maxZ &&
            py <= plat.topY &&
            py >= plat.topY - (plat.thickness || 0.32)
          ) {
            return {
              voxel: null,
              isGround: false,
              isElevatedPlatform: true,
              distance: dist,
              point: new THREE.Vector3(px, py, pz),
              normal: new THREE.Vector3(0, dir.y < 0 ? 1 : -1, 0)
            };
          }
        }
      }

      // Fast O(1) 3D Modular Tall Building / Skyscraper Solid Core hit check across all urban & FOB sectors!
      if (
        py > 5.0 &&
        py < 125.0 &&
        Math.abs(px) < 1150.0 &&
        Math.abs(pz) < 620.0 &&
        Array.isArray(this.skyscraperHullBoxes)
      ) {
        const hulls = this.skyscraperHullBoxes;
        for (let hIdx = 0; hIdx < hulls.length; hIdx++) {
          const hb = hulls[hIdx];
          if (!hb || !hb.active) continue;
          if (
            px >= hb.minX &&
            px <= hb.maxX &&
            py >= hb.minY &&
            py <= hb.maxY &&
            pz >= hb.minZ &&
            pz <= hb.maxZ
          ) {
            if (
              px >= hb.stairMinX &&
              px <= hb.stairMaxX &&
              pz >= hb.stairMinZ &&
              pz <= hb.stairMaxZ
            ) {
              continue;
            }
            const dMinX = Math.abs(px - hb.minX);
            const dMaxX = Math.abs(hb.maxX - px);
            const dMinZ = Math.abs(pz - hb.minZ);
            const dMaxZ = Math.abs(hb.maxZ - pz);
            const dMinY = Math.abs(py - hb.minY);
            const dMaxY = Math.abs(hb.maxY - py);
            const m = Math.min(dMinX, dMaxX, dMinZ, dMaxZ, dMinY, dMaxY);
            const hitNorm =
              m === dMinX
                ? new THREE.Vector3(-1, 0, 0)
                : m === dMaxX
                ? new THREE.Vector3(1, 0, 0)
                : m === dMinZ
                ? new THREE.Vector3(0, 0, -1)
                : m === dMaxZ
                ? new THREE.Vector3(0, 0, 1)
                : m === dMinY
                ? new THREE.Vector3(0, -1, 0)
                : new THREE.Vector3(0, 1, 0);
            return {
              voxel: null,
              isGround: false,
              isSkyscraperCore: true,
              buildingId: hb.buildingId,
              distance: dist,
              point: new THREE.Vector3(px, py, pz),
              normal: hitNorm
            };
          }
        }
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
      const isIgnoredSet = ignoreVoxelKey instanceof Set;

      const cellChanged = gx !== prevGx || gy !== prevGy || gz !== prevGz;
      if (cellChanged) {
        // 1. Diagonal corner-seam check: prevent slipping diagonally between two adjacent blocks
        if (prevGx !== null && gx !== prevGx && gz !== prevGz) {
          const seamA = this.getVoxel(prevGx, gy, gz);
          const seamB = this.getVoxel(gx, gy, prevGz);
          const validA = seamA && (isIgnoredSet ? !ignoreVoxelKey.has(seamA.key) : seamA.key !== ignoreVoxelKey);
          const validB = seamB && (isIgnoredSet ? !ignoreVoxelKey.has(seamB.key) : seamB.key !== ignoreVoxelKey);
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
        if (v && (isIgnoredSet ? !ignoreVoxelKey.has(v.key) : v.key !== ignoreVoxelKey)) {
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
            if (!nv || (isIgnoredSet ? ignoreVoxelKey.has(nv.key) : nv.key === ignoreVoxelKey)) continue;
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

    if (this._voxelChunks) {
      for (const chunk of this._voxelChunks.values()) {
        for (const m of Object.values(chunk.meshesByType)) {
          if (m) {
            if (this.scene) this.scene.remove(m);
            m.geometry?.dispose();
          }
        }
      }
      this._voxelChunks.clear();
    }
    if (this._dirtyVoxelChunkKeys) {
      this._dirtyVoxelChunkKeys.clear();
    }

    if (this.instancedBatches) {
      for (const batch of Object.values(this.instancedBatches)) {
        if (batch) {
          if (batch.mesh) {
            if (this.scene) this.scene.remove(batch.mesh);
            disposeMaterialSafe(batch.mesh.material);
            batch.mesh.dispose?.();
          } else if (batch.material) {
            disposeMaterialSafe(batch.material);
          }
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
    this.skyscraperHullBoxes = [];
    this.voxels.clear();
  }

  /**
   * 100% Complete Round Reset for VoxelWorld:
   * Clears all destroyed/player-built voxels, collapsed skyscraper states, dropped loot packs,
   * active projectiles, debris, Armory Keys, and laser designations, then cleanly rebuilds every
   * building, staircase, steel girder, container, bunker, bridge parapet, and crate fresh for Round N+1!
   */
  resetWorldForNewRound() {
    // 1. Clear live projectiles, debris, particle pools, laser designations & CAS markers
    if (Array.isArray(this.projectiles)) {
      for (let i = 0; i < this.projectiles.length; i++) {
        const pr = this.projectiles[i];
        if (pr?.mesh && this.scene) {
          this.scene.remove(pr.mesh);
        }
      }
      this.projectiles.length = 0;
    }
    if (Array.isArray(this.debrisParticles)) {
      for (let i = 0; i < this.debrisParticles.length; i++) {
        const p = this.debrisParticles[i];
        if (p?.mesh && this.scene) {
          this.scene.remove(p.mesh);
        }
      }
      this.debrisParticles.length = 0;
    }
    for (const pool of [this._debrisPool, this._fxPool, this._glowPool]) {
      if (pool) {
        pool.count = 0;
        if (pool.mesh) {
          pool.mesh.count = 0;
          pool.mesh.instanceMatrix.needsUpdate = true;
        }
      }
    }
    if (Array.isArray(this._blastLights)) {
      for (const slot of this._blastLights) {
        if (slot?.light) {
          slot.life = 0;
          slot.light.visible = false;
        }
      }
    }
    if (Array.isArray(this._shockwaveActive)) {
      while (this._shockwaveActive.length > 0) {
        const sw = this._shockwaveActive.pop();
        if (sw?.mesh) sw.mesh.visible = false;
        if (Array.isArray(this._shockwaveFree)) this._shockwaveFree.push(sw);
      }
    }
    this.activeLaserDesignations = { US: null, RU: null };
    this.activeCasRequest = null;

    // 2. Remove dropped enemy loot packs, Armory Keys, ammo crates & 3D skyscraper shells
    if (Array.isArray(this.lootPacks)) {
      for (let i = 0; i < this.lootPacks.length; i++) {
        const lp = this.lootPacks[i];
        if (lp?.mesh && this.scene) this.scene.remove(lp.mesh);
      }
      this.lootPacks.length = 0;
    }
    if (Array.isArray(this.buildingKeys)) {
      for (let i = 0; i < this.buildingKeys.length; i++) {
        const bk = this.buildingKeys[i];
        if (bk?.mesh && this.scene) this.scene.remove(bk.mesh);
      }
      this.buildingKeys.length = 0;
    }
    if (Array.isArray(this.ammoCrates)) {
      for (let i = 0; i < this.ammoCrates.length; i++) {
        const ac = this.ammoCrates[i];
        if (ac?.mesh && this.scene) this.scene.remove(ac.mesh);
      }
      this.ammoCrates.length = 0;
    }
    if (Array.isArray(this.buildings)) {
      for (let i = 0; i < this.buildings.length; i++) {
        const b = this.buildings[i];
        if (b?.archMesh) {
          if (this.scene) this.scene.remove(b.archMesh);
          b.archMesh.traverse?.((ch) => {
            if (ch.isMesh && ch.geometry && !ch.geometry.userData?.shared) {
              ch.geometry.dispose();
            }
          });
        }
      }
    }

    // 3. Wipe all voxel records & chunk meshes and reset batch counters
    if (this._voxelChunks) {
      for (const chunk of this._voxelChunks.values()) {
        for (const m of Object.values(chunk.meshesByType)) {
          if (m) {
            if (this.scene) this.scene.remove(m);
            m.geometry?.dispose();
          }
        }
      }
      this._voxelChunks.clear();
    }
    if (this._dirtyVoxelChunkKeys) {
      this._dirtyVoxelChunkKeys.clear();
    }
    if (this.instancedBatches) {
      for (const batch of Object.values(this.instancedBatches)) {
        if (batch) {
          batch.count = 0;
          if (Array.isArray(batch.freeIds)) batch.freeIds.length = 0;
        }
      }
    }
    this.voxels.clear();
    this._hasOverflowVoxels = false;
    this._voxelMutationEpoch = (this._voxelMutationEpoch || 1) + 1;
    this.buildings = [];
    this.containers = [];
    this.skyscraperHullBoxes = [];
    this._spatialFootprintGrid = null;
    if (Array.isArray(this.climbableLadders)) {
      this.climbableLadders = this.climbableLadders.filter(
        (lad) => lad && (lad.buildingId === null || lad.buildingId === undefined)
      );
    }

    // 4. Rebuild clean pristine map structures for the active era
    this._buildingWorld = true;
    const isMedieval = this.era === 'medieval';
    const isJurassic = this.era === 'jurassic';
    if (!isJurassic) {
      const bridgeZs = isMedieval ? [-400, 0, 400] : [-400, 0, 400];
      for (const bz of bridgeZs) {
        const halfSpanZ = bz === 0 ? 17.4 : 7.4;
        const gzMin = Math.round((bz - halfSpanZ) / VOXEL_SIZE);
        const gzMax = Math.round((bz + halfSpanZ) / VOXEL_SIZE);
        for (let gx = -34; gx <= 34; gx++) {
          this.addVoxel(gx, 1, gzMin, 'darkConcrete');
          this.addVoxel(gx, 1, gzMax, 'darkConcrete');
          if (Math.abs(gx) % 2 === 0) {
            this.addVoxel(gx, 2, gzMin, isMedieval ? 'concrete' : 'sandbag');
            this.addVoxel(gx, 2, gzMax, isMedieval ? 'concrete' : 'sandbag');
          }
        }
      }
    }
    if (isMedieval && typeof this.buildMedievalCastlesAndFortifications === 'function') {
      // Rebuild castle walls/keeps without duplicating static 3D terrain props
      const prevScene = this.scene;
      this.buildMedievalCastlesAndFortifications();
      this.scene = prevScene;
    } else if (!isJurassic && this.mapDef) {
      const mapDef = this.mapDef;
      if (mapDef.buildings) {
        for (const [gx, gz, w, d, floors, mat] of mapDef.buildings) {
          this.buildApartmentBlock(gx, gz, w, d, floors, mat);
        }
      }
      if (mapDef.watchtowers) {
        for (const [gx, gz] of mapDef.watchtowers) {
          this.buildWatchtower(gx, gz);
        }
      }
      if (mapDef.hescoBastions) {
        for (const [gx, gz, len, alongX] of mapDef.hescoBastions) {
          this.buildHescoBastion(gx, gz, len, alongX);
        }
      }
      if (mapDef.sandbagBunkers) {
        for (const [gx, gz] of mapDef.sandbagBunkers) {
          this.buildSandbagBunker(gx, gz);
        }
      }
      if (mapDef.shippingContainers) {
        for (const [gx, gz, alongX, mat, offsetGy] of mapDef.shippingContainers) {
          this.buildShippingContainer(gx, gz, alongX, mat, offsetGy);
        }
      }
      if (mapDef.ammoCrates) {
        for (const [wx, wz] of mapDef.ammoCrates) {
          this.addAmmoCrate(wx, wz);
        }
      }
    }
    this._buildingWorld = false;

    for (const chunkKey of this._voxelChunks.keys()) {
      this._dirtyVoxelChunkKeys.add(chunkKey);
    }
    this.flushDirtyVoxelChunks();
    this.resetFlagsForNewRound?.();
  }

  update(dt, units, onExplosionDamage, broadcastFn, onFlagCaptured = null, vehicles = []) {
    this.updateDebris(dt);
    this.updateProjectiles(dt, units, onExplosionDamage, broadcastFn, vehicles);
    this.updateFlags(dt, units, onFlagCaptured);
    this.updateWeather(dt);
    this.updateAmmoCrates(dt, units);
    if (typeof this.updateBuildingKeys === 'function') {
      this.updateBuildingKeys(dt);
    }
    if (typeof this.updateLootPacks === 'function') {
      this.updateLootPacks(dt);
    }
    this.flushDirtyVoxelChunks(8.5);
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
