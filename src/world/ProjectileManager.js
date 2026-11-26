import * as THREE from '../../vendor/three.module.js';
import { sound } from '../audio.js?v=135';
import { TERRAIN } from '../config.js?v=135';
import { events } from '../events.js?v=135';
import { createAmmoStashMesh } from '../models/prop-models.js?v=135';

const VOXEL_SIZE = 1.25;
const DEBRIS_POOL_CAPACITY = 384;
const FX_POOL_CAPACITY = 384;
const GLOW_POOL_CAPACITY = 384;
const SHOCKWAVE_POOL_CAPACITY = 32;
const BLAST_LIGHT_CAPACITY = 4;

function markShared(asset) {
  if (asset) {
    if (!asset.userData) asset.userData = {};
    asset.userData.shared = true;
  }
  return asset;
}

function disposeNonSharedMeshResources(root) {
  if (!root) return;
  if (root.isMesh || root.isLine) {
    if (root.geometry && !root.geometry.userData?.shared) {
      root.geometry.dispose();
    }
    if (root.material) {
      if (Array.isArray(root.material)) {
        for (let i = 0; i < root.material.length; i++) {
          const m = root.material[i];
          if (m && !m.userData?.shared) m.dispose();
        }
      } else if (!root.material.userData?.shared) {
        root.material.dispose();
      }
    }
  }
  if (root.children && root.children.length > 0) {
    for (let i = 0; i < root.children.length; i++) {
      disposeNonSharedMeshResources(root.children[i]);
    }
  }
}

// Pre-allocated reusable THREE.Color & BufferGeometry instances (userData.shared = true)
const _debrisWarmEarthColor = new THREE.Color(0xa89f94);
const _debrisEmberColor = new THREE.Color(0xffbe44);
const _debrisFlirHotColor = new THREE.Color(0xffffff);
const _airstrikeTrailColor = new THREE.Color(0xfff2b8);
const _rocketTrailColor = new THREE.Color(0xd5dde5);
const _sparkFlashColor = new THREE.Color(0xffffff);
const _corePureWhiteColor = new THREE.Color(0xffffff);
const _coreFlashColor = new THREE.Color(0xfff7cc);
const _fireballBrightColor = new THREE.Color(0xffdd59);
const _fireballColor = new THREE.Color(0xff8c1a);
const _smokeDustLightColor = new THREE.Color(0x9a9288);
const _smokeDustMidColor = new THREE.Color(0x78736d);
const _smokeFlirHotVaporColor = new THREE.Color(0xdce4ee);
const _smokeFlirWarmVaporColor = new THREE.Color(0xaeb8c4);
const _fallbackChipColor = new THREE.Color(0xcbd5e1);
const _poolColor = new THREE.Color();

const _sharedUnitBoxGeo = markShared(new THREE.BoxGeometry(1, 1, 1));
const _sharedRingGeo = markShared(new THREE.RingGeometry(0.32, 0.5, 28));
_sharedRingGeo.rotateX(-Math.PI / 2);
const _sharedDiscGeo = markShared(new THREE.CircleGeometry(0.5, 24));
_sharedDiscGeo.rotateX(-Math.PI / 2);

const _debrisPoolMat = markShared(
  new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.72,
    emissive: 0x3a2610,
    emissiveIntensity: 0.35,
    flatShading: true
  })
);
const _fxPoolMat = markShared(
  new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.52,
    depthWrite: false
  })
);
const _glowPoolMat = markShared(
  new THREE.MeshBasicMaterial({
    color: 0xffffff,
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 0.96,
    depthWrite: false,
    toneMapped: false
  })
);

// Shared Enemy Loot Pack geometries & materials (userData.shared = true)
const _lootPackGeo = markShared(new THREE.BoxGeometry(0.62, 0.36, 0.48));
const _lootPouchGeo = markShared(new THREE.BoxGeometry(0.46, 0.22, 0.56));
const _lootRingGeo = markShared(new THREE.RingGeometry(0.55, 0.72, 16));
_lootRingGeo.rotateX(-Math.PI / 2);
const _lootPackMatRU = markShared(new THREE.MeshStandardMaterial({ color: 0x3b4d3b, roughness: 0.78 }));
const _lootPackMatUS = markShared(new THREE.MeshStandardMaterial({ color: 0x5c5346, roughness: 0.78 }));
const _lootPouchMat = markShared(new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.7 }));
const _lootRingMat = markShared(
  new THREE.MeshBasicMaterial({
    color: 0xf1c40f,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.55
  })
);

// Reusable scratch structures for zero-allocation structural integrity & projectile stepping
const _NDX = [0, 1, -1, 0, 0, 0];
const _NDY = [1, 0, 0, 0, 0, -1];
const _NDZ = [0, 0, 0, 1, -1, 0];
const _integrityVoxels = [];
const _integrityQueue = [];
const _integritySpanMap = new Map();

const _tmpGrid = { gx: 0, gy: 0, gz: 0 };
const _projPrevPos = new THREE.Vector3();
const _projSegVec = new THREE.Vector3();
const _projSegDir = new THREE.Vector3();
const _projToTarget = new THREE.Vector3();
const _projCurDir = new THREE.Vector3();
const _projLookAt = new THREE.Vector3();
const _poolDummy = new THREE.Object3D();
const _audioResult = { dist: 0, pan: 0 };

function extractRGB(col, fallbackR = 0.6, fallbackG = 0.6, fallbackB = 0.6) {
  if (!col) {
    _poolColor.setRGB(fallbackR, fallbackG, fallbackB);
  } else if (col.isColor) {
    _poolColor.copy(col);
  } else if (typeof col === 'number') {
    _poolColor.setHex(col);
  } else {
    _poolColor.setRGB(fallbackR, fallbackG, fallbackB);
  }
  return _poolColor;
}

export const ProjectileManager = {
  _ensureParticlePools() {
    if (this._debrisPool && this._fxPool && this._glowPool) return;
    if (!this.scene) return;

    const dCap = DEBRIS_POOL_CAPACITY;
    const dMesh = new THREE.InstancedMesh(_sharedUnitBoxGeo, _debrisPoolMat, dCap);
    dMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    _poolColor.setRGB(1, 1, 1);
    dMesh.setColorAt(0, _poolColor);
    if (dMesh.instanceColor) dMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    dMesh.frustumCulled = false;
    dMesh.matrixAutoUpdate = false;
    dMesh.castShadow = false;
    dMesh.receiveShadow = false;
    dMesh.count = 0;
    this.scene.add(dMesh);

    this._debrisPool = {
      mesh: dMesh,
      count: 0,
      capacity: dCap,
      px: new Float32Array(dCap),
      py: new Float32Array(dCap),
      pz: new Float32Array(dCap),
      vx: new Float32Array(dCap),
      vy: new Float32Array(dCap),
      vz: new Float32Array(dCap),
      rx: new Float32Array(dCap),
      ry: new Float32Array(dCap),
      rz: new Float32Array(dCap),
      rvx: new Float32Array(dCap),
      rvy: new Float32Array(dCap),
      rvz: new Float32Array(dCap),
      sx: new Float32Array(dCap),
      sy: new Float32Array(dCap),
      sz: new Float32Array(dCap),
      cr: new Float32Array(dCap),
      cg: new Float32Array(dCap),
      cb: new Float32Array(dCap),
      life: new Float32Array(dCap)
    };

    const fCap = FX_POOL_CAPACITY;
    const fMesh = new THREE.InstancedMesh(_sharedUnitBoxGeo, _fxPoolMat, fCap);
    fMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    fMesh.setColorAt(0, _poolColor);
    if (fMesh.instanceColor) fMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    fMesh.frustumCulled = false;
    fMesh.matrixAutoUpdate = false;
    fMesh.castShadow = false;
    fMesh.receiveShadow = false;
    fMesh.renderOrder = 1;
    fMesh.count = 0;
    this.scene.add(fMesh);

    this._fxPool = {
      mesh: fMesh,
      count: 0,
      capacity: fCap,
      px: new Float32Array(fCap),
      py: new Float32Array(fCap),
      pz: new Float32Array(fCap),
      vx: new Float32Array(fCap),
      vy: new Float32Array(fCap),
      vz: new Float32Array(fCap),
      rx: new Float32Array(fCap),
      ry: new Float32Array(fCap),
      rz: new Float32Array(fCap),
      rvx: new Float32Array(fCap),
      rvy: new Float32Array(fCap),
      rvz: new Float32Array(fCap),
      scale: new Float32Array(fCap),
      growRate: new Float32Array(fCap),
      cr: new Float32Array(fCap),
      cg: new Float32Array(fCap),
      cb: new Float32Array(fCap),
      life: new Float32Array(fCap),
      maxLife: new Float32Array(fCap)
    };

    const gCap = GLOW_POOL_CAPACITY;
    const gMesh = new THREE.InstancedMesh(_sharedUnitBoxGeo, _glowPoolMat, gCap);
    gMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    gMesh.setColorAt(0, _poolColor);
    if (gMesh.instanceColor) gMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    gMesh.frustumCulled = false;
    gMesh.matrixAutoUpdate = false;
    gMesh.castShadow = false;
    gMesh.receiveShadow = false;
    gMesh.renderOrder = 3;
    gMesh.count = 0;
    this.scene.add(gMesh);

    this._glowPool = {
      mesh: gMesh,
      count: 0,
      capacity: gCap,
      px: new Float32Array(gCap),
      py: new Float32Array(gCap),
      pz: new Float32Array(gCap),
      vx: new Float32Array(gCap),
      vy: new Float32Array(gCap),
      vz: new Float32Array(gCap),
      rx: new Float32Array(gCap),
      ry: new Float32Array(gCap),
      rz: new Float32Array(gCap),
      rvx: new Float32Array(gCap),
      rvy: new Float32Array(gCap),
      rvz: new Float32Array(gCap),
      scale: new Float32Array(gCap),
      growRate: new Float32Array(gCap),
      cr: new Float32Array(gCap),
      cg: new Float32Array(gCap),
      cb: new Float32Array(gCap),
      life: new Float32Array(gCap),
      maxLife: new Float32Array(gCap)
    };

    this._blastLights = [];
    for (let li = 0; li < BLAST_LIGHT_CAPACITY; li++) {
      const pt = new THREE.PointLight(0xffd88a, 0, 36, 1.5);
      pt.visible = false;
      this.scene.add(pt);
      this._blastLights.push({ light: pt, life: 0, maxLife: 0.35, peakIntensity: 6 });
    }

    this._shockwaveFree = [];
    this._shockwaveActive = [];
  },

  _disposeParticlePools() {
    if (this._debrisPool && this._debrisPool.mesh) {
      if (this.scene) this.scene.remove(this._debrisPool.mesh);
      this._debrisPool.mesh.dispose?.();
      this._debrisPool = null;
    }
    if (this._fxPool && this._fxPool.mesh) {
      if (this.scene) this.scene.remove(this._fxPool.mesh);
      this._fxPool.mesh.dispose?.();
      this._fxPool = null;
    }
    if (this._glowPool && this._glowPool.mesh) {
      if (this.scene) this.scene.remove(this._glowPool.mesh);
      this._glowPool.mesh.dispose?.();
      this._glowPool = null;
    }
    if (this._blastLights) {
      for (let i = 0; i < this._blastLights.length; i++) {
        const bl = this._blastLights[i];
        if (bl.light && this.scene) this.scene.remove(bl.light);
        bl.light?.dispose?.();
      }
      this._blastLights = null;
    }
    if (this._shockwaveActive) {
      for (let i = 0; i < this._shockwaveActive.length; i++) {
        const sw = this._shockwaveActive[i];
        if (sw.mesh) {
          if (this.scene) this.scene.remove(sw.mesh);
          if (sw.mesh.material && !sw.mesh.material.userData?.shared) sw.mesh.material.dispose();
        }
      }
      this._shockwaveActive.length = 0;
    }
    if (this._shockwaveFree) {
      for (let i = 0; i < this._shockwaveFree.length; i++) {
        const sw = this._shockwaveFree[i];
        if (sw.mesh) {
          if (this.scene) this.scene.remove(sw.mesh);
          if (sw.mesh.material && !sw.mesh.material.userData?.shared) sw.mesh.material.dispose();
        }
      }
      this._shockwaveFree.length = 0;
    }
  },

  spawnCustomDebris(px, py, pz, vx, vy, vz, rvx, rvy, rvz, sx, sy, sz, color, life) {
    this._ensureParticlePools();
    const pool = this._debrisPool;
    if (!pool || pool.count >= pool.capacity) return;
    const id = pool.count++;
    const c = extractRGB(color);
    pool.px[id] = px;
    pool.py[id] = py;
    pool.pz[id] = pz;
    pool.vx[id] = vx;
    pool.vy[id] = vy;
    pool.vz[id] = vz;
    pool.rx[id] = Math.random() * 3.14;
    pool.ry[id] = Math.random() * 3.14;
    pool.rz[id] = Math.random() * 3.14;
    pool.rvx[id] = rvx;
    pool.rvy[id] = rvy;
    pool.rvz[id] = rvz;
    pool.sx[id] = sx;
    pool.sy[id] = sy;
    pool.sz[id] = sz;
    pool.cr[id] = c.r;
    pool.cg[id] = c.g;
    pool.cb[id] = c.b;
    pool.life[id] = life;
  },

  _spawnFxSlot(px, py, pz, vx, vy, vz, rvx, rvy, rvz, initScale, growRate, color, life) {
    this._ensureParticlePools();
    const pool = this._fxPool;
    if (!pool || pool.count >= pool.capacity) return;
    const id = pool.count++;
    const c = extractRGB(color, 1, 0.8, 0.4);
    pool.px[id] = px;
    pool.py[id] = py;
    pool.pz[id] = pz;
    pool.vx[id] = vx;
    pool.vy[id] = vy;
    pool.vz[id] = vz;
    pool.rx[id] = Math.random() * 3.14;
    pool.ry[id] = Math.random() * 3.14;
    pool.rz[id] = 0;
    pool.rvx[id] = rvx;
    pool.rvy[id] = rvy;
    pool.rvz[id] = rvz;
    pool.scale[id] = initScale;
    pool.growRate[id] = growRate;
    pool.cr[id] = c.r;
    pool.cg[id] = c.g;
    pool.cb[id] = c.b;
    pool.life[id] = life;
    pool.maxLife[id] = life;
  },

  _spawnGlowSlot(px, py, pz, vx, vy, vz, rvx, rvy, rvz, initScale, growRate, color, life) {
    this._ensureParticlePools();
    const pool = this._glowPool;
    if (!pool || pool.count >= pool.capacity) return;
    const id = pool.count++;
    const c = extractRGB(color, 1, 0.95, 0.78);
    pool.px[id] = px;
    pool.py[id] = py;
    pool.pz[id] = pz;
    pool.vx[id] = vx;
    pool.vy[id] = vy;
    pool.vz[id] = vz;
    pool.rx[id] = Math.random() * 3.14;
    pool.ry[id] = Math.random() * 3.14;
    pool.rz[id] = Math.random() * 3.14;
    pool.rvx[id] = rvx;
    pool.rvy[id] = rvy;
    pool.rvz[id] = rvz;
    pool.scale[id] = initScale;
    pool.growRate[id] = growRate;
    pool.cr[id] = c.r;
    pool.cg[id] = c.g;
    pool.cb[id] = c.b;
    pool.life[id] = life;
    pool.maxLife[id] = life;
  },

  _spawnBlastLight(x, y, z, radius, isFlir) {
    if (!this._blastLights || this._blastLights.length === 0) return;
    let slot = null;
    for (let i = 0; i < this._blastLights.length; i++) {
      if (this._blastLights[i].life <= 0) {
        slot = this._blastLights[i];
        break;
      }
    }
    if (!slot) {
      slot = this._blastLights[0];
      for (let i = 1; i < this._blastLights.length; i++) {
        if (this._blastLights[i].life < slot.life) slot = this._blastLights[i];
      }
    }
    const isHeavy = radius >= 10;
    slot.maxLife = isHeavy ? 0.52 : radius >= 6 ? 0.38 : 0.26;
    slot.life = slot.maxLife;
    slot.peakIntensity = isHeavy ? 11.0 : radius >= 6 ? 7.2 : 4.5;
    slot.light.color.setHex(isFlir ? 0xffffff : 0xffe099);
    slot.light.distance = Math.max(24, radius * 4.5);
    slot.light.intensity = slot.peakIntensity;
    slot.light.position.set(x, y + 1.8, z);
    slot.light.visible = true;
  },

  _spawnShockwaveRing(x, y, z, initScale, shockSpeed, maxLife, isFilledDisc = false, colorHex = 0xffeaa7) {
    this._ensureParticlePools();
    if (!this.scene || !this._shockwaveActive) return;
    if (this._shockwaveActive.length >= SHOCKWAVE_POOL_CAPACITY) return;

    let entry = null;
    for (let i = this._shockwaveFree.length - 1; i >= 0; i--) {
      if (Boolean(this._shockwaveFree[i].isFilledDisc) === Boolean(isFilledDisc)) {
        entry = this._shockwaveFree.splice(i, 1)[0];
        break;
      }
    }
    if (!entry) {
      const ringMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        toneMapped: false
      });
      const ringMesh = new THREE.Mesh(isFilledDisc ? _sharedDiscGeo : _sharedRingGeo, ringMat);
      ringMesh.renderOrder = 4;
      entry = { mesh: ringMesh, life: 0, maxLife: 0.42, shockSpeed: 16, isFilledDisc: Boolean(isFilledDisc) };
    }
    entry.life = maxLife;
    entry.maxLife = maxLife;
    entry.shockSpeed = shockSpeed;
    entry.mesh.position.set(x, y, z);
    entry.mesh.scale.setScalar(initScale);
    entry.mesh.material.color.setHex(colorHex);
    entry.mesh.material.opacity = isFilledDisc ? 0.85 : 0.94;
    entry.mesh.visible = true;
    if (entry.mesh.parent !== this.scene) {
      this.scene.add(entry.mesh);
    }
    this._shockwaveActive.push(entry);
  },

  /**
   * Structural Integrity & Gravity Collapse Solver:
   * Zero-allocation BFS index-pointer queue using direct voxel object references.
   */
  checkStructuralIntegrity(centerGx, centerGy, centerGz, radius = 8, broadcastFn = null) {
    const MAX_SPAN = TERRAIN.MAX_SPAN;
    const minGx = (centerGx - radius) | 0;
    const maxGx = (centerGx + radius) | 0;
    const minGz = (centerGz - radius) | 0;
    const maxGz = (centerGz + radius) | 0;

    _integrityVoxels.length = 0;
    _integrityQueue.length = 0;
    _integritySpanMap.clear();

    for (let gx = minGx; gx <= maxGx; gx++) {
      for (let gz = minGz; gz <= maxGz; gz++) {
        const groundGy = this.getBaseGy(gx, gz);
        const isBoundary = gx === minGx || gx === maxGx || gz === minGz || gz === maxGz;
        for (let gy = -1; gy <= 18; gy++) {
          const v = this.getVoxel(gx, gy, gz);
          if (!v) continue;
          _integrityVoxels.push(v);

          // Ground-contact voxels or boundary anchor voxels start with span = 0
          if (gy <= groundGy || (isBoundary && this.hasVoxel(gx, gy - 1, gz))) {
            _integritySpanMap.set(v.key, 0);
            _integrityQueue.push(v);
          }
        }
      }
    }

    if (_integrityVoxels.length === 0) return 0;

    let head = 0;
    while (head < _integrityQueue.length) {
      const cur = _integrityQueue[head++];
      const curSpan = _integritySpanMap.get(cur.key);
      const cgx = cur.gx;
      const cgy = cur.gy;
      const cgz = cur.gz;

      for (let dir = 0; dir < 6; dir++) {
        const cost = dir === 0 ? (curSpan === 0 ? 0 : 1) : dir === 5 ? 2 : 1;
        const nextSpan = curSpan + cost;
        if (nextSpan > MAX_SPAN) continue;

        const nv = this.getVoxel(cgx + _NDX[dir], cgy + _NDY[dir], cgz + _NDZ[dir]);
        if (!nv) continue;

        const prevBest = _integritySpanMap.get(nv.key);
        if (prevBest === undefined || nextSpan < prevBest) {
          _integritySpanMap.set(nv.key, nextSpan);
          _integrityQueue.push(nv);
        }
      }
    }

    // Any local voxel not reached within MAX_SPAN has lost structural support -> COLLAPSE!
    let collapsed = 0;
    for (let i = 0; i < _integrityVoxels.length; i++) {
      const v = _integrityVoxels[i];
      if (!_integritySpanMap.has(v.key)) {
        this.destroyVoxel(v.gx, v.gy, v.gz, false, true);
        if (broadcastFn) {
          broadcastFn({ type: 'voxel_destroy', gx: v.gx, gy: v.gy, gz: v.gz });
        }
        collapsed++;
      }
    }

    _integrityVoxels.length = 0;
    _integrityQueue.length = 0;
    _integritySpanMap.clear();

    // Check if any multi-story building near the breach lost >55% of its foundation walls
    collapsed += this.checkBuildingClusterCollapse(centerGx, centerGz, broadcastFn);

    return collapsed;
  },

  /**
   * BattleBit-style Building Cluster Collapse:
   * When >55% of a building's ground-floor load-bearing walls are destroyed,
   * the entire upper structure cascades down into rubble!
   */
  checkBuildingClusterCollapse(centerGx, centerGz, broadcastFn = null) {
    let totalCollapsed = 0;
    for (let bIdx = 0; bIdx < this.buildings.length; bIdx++) {
      const bld = this.buildings[bIdx];
      if (bld.collapsed) continue;
      if (!Array.isArray(bld.foundationKeys) || bld.foundationKeys.length === 0) continue;
      if (
        centerGx < bld.startGx - 6 ||
        centerGx > bld.startGx + bld.width + 6 ||
        centerGz < bld.startGz - 6 ||
        centerGz > bld.startGz + bld.depth + 6
      ) {
        continue;
      }

      let remainingFoundation = 0;
      const fKeys = bld.foundationKeys;
      for (let i = 0; i < fKeys.length; i++) {
        if (this.voxels.has(fKeys[i])) remainingFoundation++;
      }

      const ratio = remainingFoundation / fKeys.length;
      if (ratio <= TERRAIN.BUILDING_COLLAPSE_THRESHOLD) {
        bld.collapsed = true;
        totalCollapsed += this.triggerBuildingCollapse(bld, broadcastFn);
      }
    }
    return totalCollapsed;
  },

  triggerBuildingCollapse(bld, broadcastFn = null) {
    let collapsedCount = 0;
    const baseGy = bld.groundGy ?? bld.baseGy ?? 0;
    const topGy = bld.topGy ?? baseGy + (bld.floors || 2) * 4 + 1;

    for (let gx = bld.startGx - 1; gx <= bld.startGx + bld.width; gx++) {
      for (let gz = bld.startGz - 1; gz <= bld.startGz + bld.depth; gz++) {
        const inFootprint =
          gx >= bld.startGx &&
          gx < bld.startGx + bld.width &&
          gz >= bld.startGz &&
          gz < bld.startGz + bld.depth;
        const relX = gx - bld.startGx;
        const relZ = gz - bld.startGz;
        const isCornerPillar =
          inFootprint &&
          (relX <= 1 || relX >= bld.width - 2) &&
          (relZ <= 1 || relZ >= bld.depth - 2);
        const isPerimeterWall =
          inFootprint &&
          (relX === 0 || relX === bld.width - 1 || relZ === 0 || relZ === bld.depth - 1);
        // Leave realistic jagged ground-floor ruins (2-voxel corner pillars & broken 1–2 voxel perimeter wall stubs)
        // instead of wiping collapsed buildings completely flat!
        const ruinKeepMaxGy = isCornerPillar
          ? baseGy + 2
          : isPerimeterWall && (gx * 5 + gz * 11) % 3 !== 0
          ? baseGy + ((gx + gz) % 2 === 0 ? 1 : 2)
          : baseGy;

        for (let gy = ruinKeepMaxGy + 1; gy <= topGy + 1; gy++) {
          if (this.hasVoxel(gx, gy, gz)) {
            const spawnFall = (gx + gy + gz) % 3 === 0;
            this.destroyVoxel(gx, gy, gz, false, spawnFall);
            if (broadcastFn) {
              broadcastFn({ type: 'voxel_destroy', gx, gy, gz });
            }
            collapsedCount++;
          }
        }
        // Leave broken concrete & rubble mounds across the collapsed ground floor for infantry cover
        if (inFootprint && (gx * 7 + gz * 13) % 4 === 0 && !this.hasVoxel(gx, baseGy, gz)) {
          this.addVoxel(gx, baseGy, gz, 'darkConcrete');
          if ((gx + gz) % 5 === 0 && !this.hasVoxel(gx, baseGy + 1, gz)) {
            this.addVoxel(gx, baseGy + 1, gz, 'concrete');
          }
        }
      }
    }

    const centerWorld = new THREE.Vector3(
      (bld.startGx + bld.width * 0.5) * VOXEL_SIZE,
      (baseGy + 2) * VOXEL_SIZE,
      (bld.startGz + bld.depth * 0.5) * VOXEL_SIZE
    );
    this.spawnExplosionVisual(centerWorld, Math.max(bld.width, bld.depth) * VOXEL_SIZE * 0.55);
    sound.playExplosion(0);

    const collapseRadius = Math.max(bld.width, bld.depth) * VOXEL_SIZE * 0.65;
    events.emit('building:collapsed', {
      centerPos: centerWorld,
      radius: collapseRadius,
      collapsedVoxels: collapsedCount
    });
    if (this.onBuildingCollapsed && !this.onBuildingCollapsed._isEventsBridge) {
      this.onBuildingCollapsed(centerWorld, collapseRadius, collapsedCount);
    }

    return collapsedCount;
  },

  spawnFallingBlock(origin, color) {
    this._ensureParticlePools();
    if (!this._debrisPool || this._debrisPool.count > DEBRIS_POOL_CAPACITY - 32) return;
    const isFlir = Boolean(typeof window !== 'undefined' && window.game?._flirSceneActive);
    const s = VOXEL_SIZE * 0.88;
    this.spawnCustomDebris(
      origin.x,
      origin.y,
      origin.z,
      (Math.random() - 0.5) * 3.5,
      -1.5 - Math.random() * 2,
      (Math.random() - 0.5) * 3.5,
      (Math.random() - 0.5) * 3,
      (Math.random() - 0.5) * 3,
      (Math.random() - 0.5) * 3,
      s,
      s,
      s,
      isFlir ? _smokeFlirHotVaporColor : color,
      1.4 + Math.random() * 0.5
    );
  },

  explodeAt(worldPos, radius = 4.6, maxDamage = 210, onEntityDamage = null, broadcastFn = null) {
    const gCenter = this.worldToGrid(worldPos.x, worldPos.y, worldPos.z, _tmpGrid);
    const cgx = gCenter.gx;
    const cgy = gCenter.gy;
    const cgz = gCenter.gz;
    const gRad = Math.ceil(radius / VOXEL_SIZE) + 1;
    const rGrid = radius / VOXEL_SIZE + 0.9;
    const rGridSq = rGrid * rGrid;
    const radiusSq = radius * radius;
    const invFalloffDenom = 1 / (radius + 0.6);
    const wx = worldPos.x;
    const wy = worldPos.y;
    const wz = worldPos.z;
    let destroyedCount = 0;

    for (let dx = -gRad; dx <= gRad; dx++) {
      const dxSq = dx * dx;
      for (let dy = -gRad; dy <= gRad; dy++) {
        const dxySq = dxSq + dy * dy;
        if (dxySq > rGridSq) continue;
        for (let dz = -gRad; dz <= gRad; dz++) {
          if (dxySq + dz * dz > rGridSq) continue;
          const gx = cgx + dx;
          const gy = cgy + dy;
          const gz = cgz + dz;
          const v = this.getVoxel(gx, gy, gz);
          if (!v) continue;

          const vdx = v.pos.x - wx;
          const vdy = v.pos.y - wy;
          const vdz = v.pos.z - wz;
          const distSq = vdx * vdx + vdy * vdy + vdz * vdz;
          if (distSq <= radiusSq) {
            const dist = Math.sqrt(distSq);
            const falloff = 1 - dist * invFalloffDenom;
            if (this.damageVoxel(gx, gy, gz, maxDamage * falloff * 1.45, broadcastFn, true)) {
              destroyedCount++;
            }
          }
        }
      }
    }

    if (destroyedCount > 0) {
      const collapsed = this.checkStructuralIntegrity(cgx, cgy, cgz, 9, broadcastFn);
      destroyedCount += collapsed;
    }

    this.spawnExplosionVisual(worldPos, radius);

    if (onEntityDamage) {
      onEntityDamage(worldPos, radius, maxDamage, destroyedCount);
    }
  },

  /** Airstrike area damage — damages voxels in radius without visual explosion per-hit */
  damageAreaVoxels(worldPos, radius = 7, maxDamage = 140) {
    const gCenter = this.worldToGrid(worldPos.x, worldPos.y, worldPos.z, _tmpGrid);
    const cgx = gCenter.gx;
    const cgy = gCenter.gy;
    const cgz = gCenter.gz;
    const gRad = Math.ceil(radius / VOXEL_SIZE) + 1;
    const rGrid = radius / VOXEL_SIZE + 0.9;
    const rGridSq = rGrid * rGrid;
    const radiusSq = radius * radius;
    const invFalloffDenom = 1 / (radius + 0.5);
    const wx = worldPos.x;
    const wy = worldPos.y;
    const wz = worldPos.z;
    let destroyed = 0;

    for (let dx = -gRad; dx <= gRad; dx++) {
      const dxSq = dx * dx;
      for (let dy = -gRad; dy <= gRad; dy++) {
        const dxySq = dxSq + dy * dy;
        if (dxySq > rGridSq) continue;
        for (let dz = -gRad; dz <= gRad; dz++) {
          if (dxySq + dz * dz > rGridSq) continue;
          const gx = cgx + dx;
          const gy = cgy + dy;
          const gz = cgz + dz;
          const v = this.getVoxel(gx, gy, gz);
          if (!v) continue;
          const vdx = v.pos.x - wx;
          const vdy = v.pos.y - wy;
          const vdz = v.pos.z - wz;
          const distSq = vdx * vdx + vdy * vdy + vdz * vdz;
          if (distSq <= radiusSq) {
            const dist = Math.sqrt(distSq);
            const falloff = 1 - dist * invFalloffDenom;
            if (this.damageVoxel(gx, gy, gz, maxDamage * falloff, null, true)) {
              destroyed++;
            }
          }
        }
      }
    }

    if (destroyed > 0) {
      this.checkStructuralIntegrity(cgx, cgy, cgz, 10, null);
    }
    this.spawnExplosionVisual(worldPos, radius * 0.8);
  },

  spawnDebris(origin, color, count = 4) {
    this._ensureParticlePools();
    const pool = this._debrisPool;
    if (!pool) return;
    for (let i = 0; i < count; i++) {
      if (pool.count >= pool.capacity) break;
      this.spawnCustomDebris(
        origin.x + (Math.random() - 0.5) * 0.8,
        origin.y + (Math.random() - 0.5) * 0.8,
        origin.z + (Math.random() - 0.5) * 0.8,
        (Math.random() - 0.5) * 13,
        3.5 + Math.random() * 8,
        (Math.random() - 0.5) * 13,
        Math.random() * 9,
        Math.random() * 9,
        Math.random() * 9,
        0.32,
        0.32,
        0.32,
        color,
        1.2 + Math.random() * 0.7
      );
    }
  },

  /**
   * Pinpoint bullet impact flash + tiny surface chip at the exact raycast hit point
   * (zero allocations via pre-allocated InstancedMesh particle pools).
   */
  spawnBulletImpact(hitPoint, normal, color) {
    const nx = normal ? normal.x : 0;
    const ny = normal ? normal.y : 1;
    const nz = normal ? normal.z : 0;
    const sx = hitPoint.x + nx * 0.04;
    const sy = hitPoint.y + ny * 0.04;
    const sz = hitPoint.z + nz * 0.04;

    // 1. Stationary additive white-hot spark flash at exact hit coordinate
    this._spawnGlowSlot(sx, sy, sz, 0, 0, 0, 9, 9, 9, 0.28, 8.5, _sparkFlashColor, 0.14);

    // 2. Tiny surface chip bouncing out from exact hit point
    const isFlirChip = Boolean(typeof window !== 'undefined' && window.game?._flirSceneActive);
    this.spawnCustomDebris(
      sx,
      sy,
      sz,
      nx * 3.2 + (Math.random() - 0.5) * 2.2,
      Math.max(1.5, ny * 3.2) + Math.random() * 2.5,
      nz * 3.2 + (Math.random() - 0.5) * 2.2,
      9,
      9,
      9,
      0.12,
      0.12,
      0.12,
      isFlirChip ? _debrisFlirHotColor : color || _fallbackChipColor,
      0.55
    );
  },

  spawnExplosionVisual(pos, radius) {
    this._ensureParticlePools();
    const isFlir = Boolean(typeof window !== 'undefined' && window.game?._flirSceneActive);
    const isHeavy = radius >= 10;
    const isMed = radius >= 6;
    const groundY = this.getGroundHeightAt(pos.x, pos.z);
    const baseY = Math.max(pos.y, groundY + 0.25);

    // 1. Blinding white-hot plasma core + rising incandescent flash dome (Additive _glowPool -> never occluded by smoke!)
    this._spawnGlowSlot(
      pos.x,
      baseY + 0.35,
      pos.z,
      0,
      1.6,
      0,
      6,
      6,
      6,
      radius * 0.85,
      radius * 1.65,
      _corePureWhiteColor,
      isHeavy ? 0.46 : isMed ? 0.34 : 0.24
    );
    this._spawnGlowSlot(
      pos.x,
      baseY + 0.75,
      pos.z,
      0,
      3.2,
      0,
      4,
      5,
      4,
      radius * 0.72,
      radius * 1.25,
      isFlir ? _corePureWhiteColor : _coreFlashColor,
      isHeavy ? 0.62 : isMed ? 0.45 : 0.32
    );

    // 2. Multi-lobed searing fireball bloom (pure white/ivory in FLIR so WHOT contrast filter blooms 100% white!)
    const lobeCount = isHeavy ? 4 : isMed ? 3 : 2;
    for (let f = 0; f < lobeCount; f++) {
      const ang = (f / lobeCount) * Math.PI * 2 + Math.random() * 0.6;
      const offR = f === 0 ? 0 : radius * 0.22;
      this._spawnGlowSlot(
        pos.x + Math.cos(ang) * offR,
        baseY + 0.6 + f * 0.45,
        pos.z + Math.sin(ang) * offR,
        Math.cos(ang) * 2.4,
        2.8 + f * 1.35,
        Math.sin(ang) * 2.4,
        3.2,
        3.6,
        2.8,
        radius * (f === 0 ? 1.05 : 0.68),
        radius * 0.92,
        isFlir ? _corePureWhiteColor : f % 2 === 0 ? _fireballBrightColor : _fireballColor,
        (isHeavy ? 0.68 : 0.46) + Math.random() * 0.14
      );
    }

    // 3. Radial white-hot shrapnel / incandescent spark burst (CoD AC-130 FLIR signature!)
    const sparkCount = isHeavy ? 14 : isMed ? 9 : 5;
    for (let sp = 0; sp < sparkCount; sp++) {
      const a = Math.random() * Math.PI * 2;
      const spd = (isHeavy ? 15 : 10) + Math.random() * (isHeavy ? 18 : 11);
      const vy = (isHeavy ? 7 : 4.5) + Math.random() * (isHeavy ? 14 : 8);
      this._spawnGlowSlot(
        pos.x + Math.cos(a) * 0.5,
        baseY + 0.5,
        pos.z + Math.sin(a) * 0.5,
        Math.cos(a) * spd,
        vy,
        Math.sin(a) * spd,
        10,
        10,
        10,
        isHeavy ? 0.52 : 0.34,
        -0.35,
        isFlir || sp % 2 === 0 ? _corePureWhiteColor : _fireballBrightColor,
        (isHeavy ? 0.58 : 0.4) + Math.random() * 0.22
      );
    }

    // 4. Additive ground flash disc + supersonic shockwave ring + dynamic blast PointLight
    this._spawnShockwaveRing(
      pos.x,
      groundY + 0.2,
      pos.z,
      Math.max(2.0, radius * 1.15),
      Math.max(10, radius * 1.9),
      isHeavy ? 0.68 : 0.44,
      true,
      isFlir ? 0xffffff : 0xfff3c4
    );
    this._spawnShockwaveRing(
      pos.x,
      groundY + 0.28,
      pos.z,
      Math.max(1.8, radius * 0.9),
      Math.max(16, radius * 3.1),
      isHeavy ? 0.62 : 0.44,
      false,
      isFlir ? 0xffffff : 0xffdf85
    );
    this._spawnBlastLight(pos.x, baseY, pos.z, radius, isFlir);

    // 5. Rising blast dust / superheated vapor plume (soft warm dust in Day TV; hot white-grey vapor in FLIR, never pitch black!)
    const smokeCount = isHeavy ? 4 : 2;
    for (let s = 0; s < smokeCount; s++) {
      this._spawnFxSlot(
        pos.x + (Math.random() - 0.5) * radius * 0.45,
        baseY + 1.4 + s * 0.65,
        pos.z + (Math.random() - 0.5) * radius * 0.45,
        (Math.random() - 0.5) * 3.8,
        5.5 + Math.random() * 4.5,
        (Math.random() - 0.5) * 3.8,
        1.1,
        1.4,
        0.9,
        radius * 0.34,
        1.85,
        isFlir
          ? s % 2 === 0
            ? _smokeFlirHotVaporColor
            : _smokeFlirWarmVaporColor
          : s % 2 === 0
          ? _smokeDustLightColor
          : _smokeDustMidColor,
        1.15 + Math.random() * 0.45
      );
    }

    const chunkMult = isHeavy ? 2 : 1;
    this.spawnDebris(pos, isFlir ? _debrisFlirHotColor : _debrisEmberColor, 7 * chunkMult);
    this.spawnDebris(pos, isFlir ? _smokeFlirHotVaporColor : _debrisWarmEarthColor, 5 * chunkMult);
  },

  addAmmoCrate(wx, wz, team = null, owner = 'FOB SUPPLY', permanent = true, duration = 120) {
    const wy = this.getGroundHeightAt(wx, wz);
    const pos = new THREE.Vector3(wx, wy, wz);
    const group = createAmmoStashMesh(permanent);
    group.position.copy(pos);
    this.scene.add(group);
    if (permanent && this._ownedWorldObjects) {
      this._ownedWorldObjects.push(group);
    }

    const crateEntry = {
      pos,
      mesh: group,
      team,
      owner,
      permanent: Boolean(permanent),
      isKitCrate: true,
      timer: permanent ? Infinity : duration,
      resupplyRadius: 5.5
    };
    this.ammoCrates.push(crateEntry);
    return crateEntry;
  },

  spawnAmmoCrate(wx, wz) {
    return this.addAmmoCrate(wx, wz);
  },

  updateDebris(dt) {
    // 1. Update Instanced Shaded Box Debris Pool
    const dPool = this._debrisPool;
    if (dPool && dPool.count > 0) {
      let i = 0;
      while (i < dPool.count) {
        const nextLife = dPool.life[i] - dt;
        if (nextLife <= 0) {
          const last = --dPool.count;
          if (i < last) {
            dPool.px[i] = dPool.px[last];
            dPool.py[i] = dPool.py[last];
            dPool.pz[i] = dPool.pz[last];
            dPool.vx[i] = dPool.vx[last];
            dPool.vy[i] = dPool.vy[last];
            dPool.vz[i] = dPool.vz[last];
            dPool.rx[i] = dPool.rx[last];
            dPool.ry[i] = dPool.ry[last];
            dPool.rz[i] = dPool.rz[last];
            dPool.rvx[i] = dPool.rvx[last];
            dPool.rvy[i] = dPool.rvy[last];
            dPool.rvz[i] = dPool.rvz[last];
            dPool.sx[i] = dPool.sx[last];
            dPool.sy[i] = dPool.sy[last];
            dPool.sz[i] = dPool.sz[last];
            dPool.cr[i] = dPool.cr[last];
            dPool.cg[i] = dPool.cg[last];
            dPool.cb[i] = dPool.cb[last];
            dPool.life[i] = dPool.life[last];
          }
          continue;
        }
        dPool.life[i] = nextLife;
        dPool.vy[i] -= 24 * dt;
        const nx = dPool.px[i] + dPool.vx[i] * dt;
        let ny = dPool.py[i] + dPool.vy[i] * dt;
        const nz = dPool.pz[i] + dPool.vz[i] * dt;
        dPool.rx[i] += dPool.rvx[i] * dt;
        dPool.ry[i] += dPool.rvy[i] * dt;
        dPool.rz[i] += dPool.rvz[i] * dt;

        const groundY = this.getGroundHeightAt(nx, nz) + 0.15;
        if (ny < groundY) {
          ny = groundY;
          dPool.vy[i] *= -0.35;
          dPool.vx[i] *= 0.7;
          dPool.vz[i] *= 0.7;
        }
        dPool.px[i] = nx;
        dPool.py[i] = ny;
        dPool.pz[i] = nz;

        _poolDummy.position.set(nx, ny, nz);
        _poolDummy.rotation.set(dPool.rx[i], dPool.ry[i], dPool.rz[i]);
        _poolDummy.scale.set(dPool.sx[i], dPool.sy[i], dPool.sz[i]);
        _poolDummy.updateMatrix();
        dPool.mesh.setMatrixAt(i, _poolDummy.matrix);
        _poolColor.setRGB(dPool.cr[i], dPool.cg[i], dPool.cb[i]);
        dPool.mesh.setColorAt(i, _poolColor);
        i++;
      }
      dPool.mesh.count = dPool.count;
      if (dPool.count > 0) {
        dPool.mesh.instanceMatrix.clearUpdateRanges();
        dPool.mesh.instanceMatrix.addUpdateRange(0, dPool.count * 16);
        dPool.mesh.instanceMatrix.needsUpdate = true;
        if (dPool.mesh.instanceColor) {
          dPool.mesh.instanceColor.clearUpdateRanges();
          dPool.mesh.instanceColor.addUpdateRange(0, dPool.count * 3);
          dPool.mesh.instanceColor.needsUpdate = true;
        }
      }
    }

    // 2. Update Instanced Flash / Spark / Smoke Pool
    const fPool = this._fxPool;
    if (fPool && fPool.count > 0) {
      let i = 0;
      while (i < fPool.count) {
        const nextLife = fPool.life[i] - dt;
        if (nextLife <= 0) {
          const last = --fPool.count;
          if (i < last) {
            fPool.px[i] = fPool.px[last];
            fPool.py[i] = fPool.py[last];
            fPool.pz[i] = fPool.pz[last];
            fPool.vx[i] = fPool.vx[last];
            fPool.vy[i] = fPool.vy[last];
            fPool.vz[i] = fPool.vz[last];
            fPool.rx[i] = fPool.rx[last];
            fPool.ry[i] = fPool.ry[last];
            fPool.rz[i] = fPool.rz[last];
            fPool.rvx[i] = fPool.rvx[last];
            fPool.rvy[i] = fPool.rvy[last];
            fPool.rvz[i] = fPool.rvz[last];
            fPool.scale[i] = fPool.scale[last];
            fPool.growRate[i] = fPool.growRate[last];
            fPool.cr[i] = fPool.cr[last];
            fPool.cg[i] = fPool.cg[last];
            fPool.cb[i] = fPool.cb[last];
            fPool.life[i] = fPool.life[last];
            fPool.maxLife[i] = fPool.maxLife[last];
          }
          continue;
        }
        fPool.life[i] = nextLife;
        const nx = fPool.px[i] + fPool.vx[i] * dt;
        const ny = fPool.py[i] + fPool.vy[i] * dt;
        const nz = fPool.pz[i] + fPool.vz[i] * dt;
        fPool.px[i] = nx;
        fPool.py[i] = ny;
        fPool.pz[i] = nz;
        fPool.rx[i] += fPool.rvx[i] * dt;
        fPool.ry[i] += fPool.rvy[i] * dt;
        fPool.scale[i] += fPool.growRate[i] * dt;

        const lifeFrac = nextLife / Math.max(0.05, fPool.maxLife[i]);
        const fadeScale = lifeFrac < 0.28 ? fPool.scale[i] * (lifeFrac / 0.28) : fPool.scale[i];

        _poolDummy.position.set(nx, ny, nz);
        _poolDummy.rotation.set(fPool.rx[i], fPool.ry[i], 0);
        _poolDummy.scale.setScalar(Math.max(0.01, fadeScale));
        _poolDummy.updateMatrix();
        fPool.mesh.setMatrixAt(i, _poolDummy.matrix);
        _poolColor.setRGB(fPool.cr[i], fPool.cg[i], fPool.cb[i]);
        fPool.mesh.setColorAt(i, _poolColor);
        i++;
      }
      fPool.mesh.count = fPool.count;
      if (fPool.count > 0) {
        fPool.mesh.instanceMatrix.clearUpdateRanges();
        fPool.mesh.instanceMatrix.addUpdateRange(0, fPool.count * 16);
        fPool.mesh.instanceMatrix.needsUpdate = true;
        if (fPool.mesh.instanceColor) {
          fPool.mesh.instanceColor.clearUpdateRanges();
          fPool.mesh.instanceColor.addUpdateRange(0, fPool.count * 3);
          fPool.mesh.instanceColor.needsUpdate = true;
        }
      }
    }

    // 2B. Update Additive Incandescent Blast / Fireball / Shrapnel Glow Pool
    const gPool = this._glowPool;
    if (gPool && gPool.count > 0) {
      let i = 0;
      while (i < gPool.count) {
        const nextLife = gPool.life[i] - dt;
        if (nextLife <= 0) {
          const last = --gPool.count;
          if (i < last) {
            gPool.px[i] = gPool.px[last];
            gPool.py[i] = gPool.py[last];
            gPool.pz[i] = gPool.pz[last];
            gPool.vx[i] = gPool.vx[last];
            gPool.vy[i] = gPool.vy[last];
            gPool.vz[i] = gPool.vz[last];
            gPool.rx[i] = gPool.rx[last];
            gPool.ry[i] = gPool.ry[last];
            gPool.rz[i] = gPool.rz[last];
            gPool.rvx[i] = gPool.rvx[last];
            gPool.rvy[i] = gPool.rvy[last];
            gPool.rvz[i] = gPool.rvz[last];
            gPool.scale[i] = gPool.scale[last];
            gPool.growRate[i] = gPool.growRate[last];
            gPool.cr[i] = gPool.cr[last];
            gPool.cg[i] = gPool.cg[last];
            gPool.cb[i] = gPool.cb[last];
            gPool.life[i] = gPool.life[last];
            gPool.maxLife[i] = gPool.maxLife[last];
          }
          continue;
        }
        gPool.life[i] = nextLife;
        if (gPool.growRate[i] < 0) {
          // Ballistic spark gravity
          gPool.vy[i] -= 18 * dt;
        }
        const nx = gPool.px[i] + gPool.vx[i] * dt;
        const ny = gPool.py[i] + gPool.vy[i] * dt;
        const nz = gPool.pz[i] + gPool.vz[i] * dt;
        gPool.px[i] = nx;
        gPool.py[i] = ny;
        gPool.pz[i] = nz;
        gPool.rx[i] += gPool.rvx[i] * dt;
        gPool.ry[i] += gPool.rvy[i] * dt;
        gPool.rz[i] += gPool.rvz[i] * dt;
        gPool.scale[i] = Math.max(0.05, gPool.scale[i] + gPool.growRate[i] * dt);

        const lifeFrac = Math.max(0, Math.min(1, nextLife / Math.max(0.04, gPool.maxLife[i])));
        const fadeScale = lifeFrac < 0.35 ? gPool.scale[i] * (0.35 + 0.65 * (lifeFrac / 0.35)) : gPool.scale[i];
        const lumFade = Math.pow(lifeFrac, 0.55);

        _poolDummy.position.set(nx, ny, nz);
        _poolDummy.rotation.set(gPool.rx[i], gPool.ry[i], gPool.rz[i]);
        _poolDummy.scale.setScalar(Math.max(0.02, fadeScale));
        _poolDummy.updateMatrix();
        gPool.mesh.setMatrixAt(i, _poolDummy.matrix);
        _poolColor.setRGB(gPool.cr[i] * lumFade, gPool.cg[i] * lumFade, gPool.cb[i] * lumFade);
        gPool.mesh.setColorAt(i, _poolColor);
        i++;
      }
      gPool.mesh.count = gPool.count;
      if (gPool.count > 0) {
        gPool.mesh.instanceMatrix.clearUpdateRanges();
        gPool.mesh.instanceMatrix.addUpdateRange(0, gPool.count * 16);
        gPool.mesh.instanceMatrix.needsUpdate = true;
        if (gPool.mesh.instanceColor) {
          gPool.mesh.instanceColor.clearUpdateRanges();
          gPool.mesh.instanceColor.addUpdateRange(0, gPool.count * 3);
          gPool.mesh.instanceColor.needsUpdate = true;
        }
      }
    }

    // 2C. Update Pooled Dynamic Blast PointLights
    if (this._blastLights) {
      for (let i = 0; i < this._blastLights.length; i++) {
        const bl = this._blastLights[i];
        if (bl.life > 0) {
          bl.life -= dt;
          if (bl.life <= 0) {
            bl.life = 0;
            bl.light.intensity = 0;
            bl.light.visible = false;
          } else {
            const f = bl.life / Math.max(0.05, bl.maxLife);
            bl.light.intensity = bl.peakIntensity * f * f;
          }
        }
      }
    }

    // 3. Update Pooled Ground Shockwave Rings
    if (this._shockwaveActive && this._shockwaveActive.length > 0) {
      for (let i = this._shockwaveActive.length - 1; i >= 0; i--) {
        const sw = this._shockwaveActive[i];
        sw.life -= dt;
        if (sw.life <= 0) {
          sw.mesh.visible = false;
          this._shockwaveFree.push(sw);
          this._shockwaveActive.splice(i, 1);
          continue;
        }
        const sDelta = sw.shockSpeed * dt;
        sw.mesh.scale.x += sDelta;
        sw.mesh.scale.z += sDelta;
        sw.mesh.material.opacity = Math.max(0, (sw.life / sw.maxLife) * 0.88);
      }
    }

    // 4. Backwards-compatible fallback for any external meshes pushed directly to `this.debrisParticles`
    if (this.debrisParticles.length > 0) {
      for (let i = this.debrisParticles.length - 1; i >= 0; i--) {
        const p = this.debrisParticles[i];
        p.life -= dt;
        if (p.life <= 0) {
          this.scene.remove(p.mesh);
          disposeNonSharedMeshResources(p.mesh);
          this.debrisParticles.splice(i, 1);
          continue;
        }

        if (p.isShockwave) {
          const sDelta = (p.shockSpeed || 16) * dt;
          p.mesh.scale.x += sDelta;
          p.mesh.scale.z += sDelta;
          p.mesh.material.opacity = Math.max(0, (p.life / (p.maxLife || 0.42)) * 0.88);
        } else if (p.isSmoke) {
          p.mesh.position.addScaledVector(p.vel, dt);
          p.mesh.scale.addScalar(dt * 1.65);
          p.mesh.rotation.x += p.rotVel.x * dt;
          p.mesh.rotation.y += p.rotVel.y * dt;
          p.mesh.material.opacity = Math.max(0, (p.life / (p.maxLife || 1.8)) * 0.68);
        } else if (p.isFlash) {
          p.mesh.scale.addScalar(dt * 7);
          p.mesh.material.opacity = Math.max(0, p.life * 3.2);
        } else {
          p.vel.y -= 24 * dt;
          p.mesh.position.addScaledVector(p.vel, dt);
          p.mesh.rotation.x += p.rotVel.x * dt;
          p.mesh.rotation.y += p.rotVel.y * dt;
          const groundY = this.getGroundHeightAt(p.mesh.position.x, p.mesh.position.z) + 0.15;
          if (p.mesh.position.y < groundY) {
            p.mesh.position.y = groundY;
            p.vel.y *= -0.35;
            p.vel.x *= 0.7;
            p.vel.z *= 0.7;
          }
        }
      }
    }
  },

  updateProjectiles(dt, units, onExplosionDamage, broadcastFn, vehicles = []) {
    const listener = units && units[0] && units[0].pos ? units[0] : null;
    const bm =
      this.botManager ||
      (typeof window !== 'undefined' && window.game ? window.game.botManager : null);
    const botGrid = bm && bm.spatialGrid && bm.spatialGrid.count > 0 ? bm.spatialGrid : null;

    const getListenerAudio = (pos) => {
      if (!listener || !listener.pos) {
        _audioResult.dist = 0;
        _audioResult.pan = 0;
        return _audioResult;
      }
      const dx = pos.x - listener.pos.x;
      const dy = pos.y - listener.pos.y;
      const dz = pos.z - listener.pos.z;
      _audioResult.dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const lenXZ = Math.sqrt(dx * dx + dz * dz) || 1;
      const rightX = Math.cos(listener.yaw || 0);
      const rightZ = -Math.sin(listener.yaw || 0);
      _audioResult.pan = (dx * rightX + dz * rightZ) / lenXZ;
      return _audioResult;
    };

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      proj.life -= dt;

      if (proj.type === 'grenade' && proj.life <= 0) {
        const hitPos = proj.mesh.position.clone();
        const aud = getListenerAudio(hitPos);
        sound.playExplosion(aud.dist, aud.pan, 1.0);
        this.explodeAt(
          hitPos,
          5.0,
          190,
          (pos, rad, dmg, broken) => {
            if (onExplosionDamage) {
              onExplosionDamage(pos, rad, dmg, proj.owner, broken, 'M67 FRAG GRENADE');
            } else {
              events.emit('explosion:damage', {
                pos,
                radius: rad,
                maxDamage: dmg,
                owner: proj.owner,
                brokenCount: broken,
                weaponOverride: 'M67 FRAG GRENADE'
              });
            }
          },
          broadcastFn
        );
        this.scene.remove(proj.mesh);
        disposeNonSharedMeshResources(proj.mesh);
        this.projectiles.splice(i, 1);
        continue;
      }

      if (proj.life <= 0) {
        this.scene.remove(proj.mesh);
        disposeNonSharedMeshResources(proj.mesh);
        this.projectiles.splice(i, 1);
        continue;
      }

      _projPrevPos.copy(proj.mesh.position);

      // Active Radar "Pitbull" Autonomous Seeker + Proportional Navigation Homing for AIM-120D / AIM-9X / R-77M Fire-and-Forget Missiles
      if (
        proj.type === 'a2a_missile' &&
        proj.isPitbullActiveSeeker &&
        (!proj.targetVehicle || proj.targetVehicle.dead || proj.targetVehicle.isShotDown) &&
        this.vehicleManager?.vehicles
      ) {
        _projCurDir.copy(proj.vel).normalize();
        let bestCand = null;
        let bestScore = Infinity;
        const ownerTeam = proj.owner?.team;
        for (let vIdx = 0; vIdx < this.vehicleManager.vehicles.length; vIdx++) {
          const cand = this.vehicleManager.vehicles[vIdx];
          if (!cand || !cand.isAircraft || cand.dead || cand.isShotDown || cand.team === ownerTeam) continue;
          const cGh = this.getGroundHeightAt(cand.pos.x, cand.pos.z);
          if (cand.pos.y - cGh < 22.0) continue;
          _projToTarget.copy(cand.pos).sub(proj.mesh.position);
          const dist = _projToTarget.length();
          if (dist < 8 || dist > 2300) continue;
          const dot = _projToTarget.dot(_projCurDir) / dist;
          if (dot > 0.52) {
            const score = dist * (1.35 - dot * 0.5);
            if (score < bestScore) {
              bestScore = score;
              bestCand = cand;
            }
          }
        }
        if (bestCand) {
          proj.targetVehicle = bestCand;
        }
      }
      if (proj.type === 'a2a_missile' && proj.targetVehicle && !proj.targetVehicle.dead) {
        const tgt = proj.targetVehicle;
        const tgtGroundY = this.getGroundHeightAt(tgt.pos.x, tgt.pos.z);
        const tgtAltAgl = Math.max(0, tgt.pos.y - tgtGroundY);
        if (tgt.isAircraft && tgtAltAgl < 24.0 && (tgt.airborneRadarTimer || 0) >= 2.0) {
          proj.targetVehicle = null;
          if (tgt.driver && typeof tgt.driver.onActionPopup === 'function') {
            tgt.driver.onActionPopup(
              '🏔️ LOW-ALTITUDE RADAR MASKING (<24M AGL) — INCOMING MISSILE LOCK BROKEN!'
            );
          }
        }
      }
      if (
        (proj.type === 'a2a_missile' || (proj.type === 'air_rocket' && (proj.turnRate || 0) > 0)) &&
        proj.targetVehicle &&
        !proj.targetVehicle.dead &&
        !(proj.type === 'a2a_missile' && proj.targetVehicle.flareActiveTimer > 0)
      ) {
        const minHomingSpd = proj.type === 'air_rocket' ? 165 : 220;
        const curSpeed = Math.max(minHomingSpd, proj.vel.length());
        const tgt = proj.targetVehicle;
        const rawDist = proj.mesh.position.distanceTo(tgt.pos);
        const leadTime = Math.min(1.6, rawDist / Math.max(minHomingSpd, curSpeed * 1.15));
        const leadVx = tgt.velVector ? tgt.velVector.x : -Math.sin(tgt.yaw || 0) * (tgt.forwardSpeed || 0);
        const leadVy = tgt.velVector ? tgt.velVector.y : 0;
        const leadVz = tgt.velVector ? tgt.velVector.z : -Math.cos(tgt.yaw || 0) * (tgt.forwardSpeed || 0);
        _projToTarget.set(
          tgt.pos.x + leadVx * leadTime - proj.mesh.position.x,
          tgt.pos.y + 1.4 + leadVy * leadTime - proj.mesh.position.y,
          tgt.pos.z + leadVz * leadTime - proj.mesh.position.z
        );
        if (_projToTarget.lengthSq() > 1) {
          _projToTarget.normalize();
          _projCurDir.copy(proj.vel).normalize();
          const steerRate = Math.min(1, (proj.turnRate || 5.8) * dt);
          _projCurDir.lerp(_projToTarget, steerRate).normalize();
          proj.vel.copy(_projCurDir).multiplyScalar(curSpeed);
          _projLookAt.copy(proj.mesh.position).add(_projCurDir);
          proj.mesh.lookAt(_projLookAt);
        }
      }

      // SACLOS Wire / Laser-Guided ATGM (`atgm_missile` — TOW-2B / 9M133 Kornet / 9M119M Refleks):
      // Accelerates via rocket motor (~118 -> 235 m/s) with zero gravity drop and smoothly steers toward the gunner's live crosshair!
      if (proj.type === 'atgm_missile' && proj.isSaclosGuided) {
        const curSpd = proj.vel.length();
        const nextSpd = Math.min(proj.maxSpeed || 235, curSpd + (proj.accel || 115) * dt);
        let guidePoint = proj.saclosTargetPos || null;
        const owner = proj.owner;
        if (!guidePoint && owner && !owner.dead && owner.activeVehicle === proj.sourceVehicle && owner.camera) {
          const camPos = owner.camera.getWorldPosition(_projCurDir);
          const camQuat = owner.camera.getWorldQuaternion(new THREE.Quaternion());
          const camDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camQuat).normalize();
          if (typeof owner.computeVehicleAimTarget === 'function') {
            guidePoint = owner.computeVehicleAimTarget(camPos, camDir, proj.sourceVehicle, 950).point;
          } else {
            guidePoint = camPos.clone().addScaledVector(camDir, 450);
          }
        }
        if (guidePoint) {
          _projToTarget.copy(guidePoint).sub(proj.mesh.position);
          if (_projToTarget.lengthSq() > 4) {
            _projToTarget.normalize();
            _projCurDir.copy(proj.vel).normalize();
            const steerRate = Math.min(1, (proj.turnRate || 4.4) * dt);
            _projCurDir.lerp(_projToTarget, steerRate).normalize();
            proj.vel.copy(_projCurDir).multiplyScalar(nextSpd);
            _projLookAt.copy(proj.mesh.position).add(_projCurDir);
            proj.mesh.lookAt(_projLookAt);
          } else {
            proj.vel.normalize().multiplyScalar(nextSpd);
          }
        } else {
          proj.vel.normalize().multiplyScalar(nextSpd);
        }
      }

      proj.vel.y -= proj.gravity * dt;
      proj.mesh.position.addScaledVector(proj.vel, dt);
      if (
        (proj.type === 'jdam_bomb' ||
          proj.type === 'gbu28_bomb' ||
          proj.type === 'airstrike_bomb' ||
          proj.type === 'tank_shell') &&
        proj.vel.lengthSq() > 1
      ) {
        _projLookAt.copy(proj.mesh.position).add(proj.vel);
        proj.mesh.lookAt(_projLookAt);
      }

      const curPos = proj.mesh.position;
      const pType = proj.type;
      const isExplosiveDirect =
        pType === 'rpg' ||
        pType === 'atgm_missile' ||
        pType === 'tank_shell' ||
        pType === 'autocannon' ||
        pType === 'airstrike_bomb' ||
        pType === 'air_rocket' ||
        pType === 'a2a_missile' ||
        pType === 'jdam_bomb' ||
        pType === 'gbu28_bomb' ||
        pType === 'mortar_shell' ||
        pType === 'ac130_40mm' ||
        pType === 'ac130_105mm';

      // Distance-gated rocket/missile exhaust smoke trail emission (Tank APFSDS & 30mm kinetic shells fly clean with ZERO rocket smoke!)
      const emitsRocketSmoke =
        isExplosiveDirect && pType !== 'tank_shell' && pType !== 'autocannon';
      if (emitsRocketSmoke) {
        if (proj._lastTrailX === undefined) {
          proj._lastTrailX = _projPrevPos.x;
          proj._lastTrailY = _projPrevPos.y;
          proj._lastTrailZ = _projPrevPos.z;
        } else {
          const tdx = curPos.x - proj._lastTrailX;
          const tdy = curPos.y - proj._lastTrailY;
          const tdz = curPos.z - proj._lastTrailZ;
          if (tdx * tdx + tdy * tdy + tdz * tdz >= 4.84) {
            proj._lastTrailX = curPos.x;
            proj._lastTrailY = curPos.y;
            proj._lastTrailZ = curPos.z;
            const isBrightTracer =
              pType === 'ac130_105mm' ||
              pType === 'ac130_40mm' ||
              pType === 'atgm_missile' ||
              pType === 'a2a_missile';
            if (isBrightTracer && typeof this._spawnGlowSlot === 'function') {
              this._spawnGlowSlot(
                _projPrevPos.x,
                _projPrevPos.y,
                _projPrevPos.z,
                (Math.random() - 0.5) * 0.8,
                0.4 + Math.random() * 0.6,
                (Math.random() - 0.5) * 0.8,
                2.0,
                2.0,
                2.0,
                pType === 'ac130_105mm' ? 0.68 : 0.42,
                0.65,
                _airstrikeTrailColor,
                0.34
              );
            } else {
              const trailCol =
                pType === 'airstrike_bomb' ||
                pType === 'jdam_bomb' ||
                pType === 'gbu28_bomb'
                  ? _airstrikeTrailColor
                  : _rocketTrailColor;
              this._spawnFxSlot(
                _projPrevPos.x,
                _projPrevPos.y,
                _projPrevPos.z,
                (Math.random() - 0.5) * 1.4,
                0.8 + Math.random() * 1.2,
                (Math.random() - 0.5) * 1.4,
                1.5,
                1.5,
                0,
                pType === 'gbu28_bomb' ? 0.55 : 0.34,
                0.9,
                trailCol,
                0.42
              );
            }
          }
        }
      }

      _projSegVec.subVectors(curPos, _projPrevPos);
      const segLen = _projSegVec.length();
      if (segLen > 0.0001) {
        _projSegDir.copy(_projSegVec).multiplyScalar(1 / segLen);
      } else {
        _projSegDir.set(0, 0, -1);
      }

      const g = this.worldToGrid(curPos.x, curPos.y, curPos.z, _tmpGrid);
      let hitVoxel = this.getVoxel(g.gx, g.gy, g.gz);
      if (!hitVoxel && segLen > 0.4 && typeof this.raycastVoxel === 'function') {
        const segVoxelHit = this.raycastVoxel(_projPrevPos, _projSegDir, segLen);
        if (segVoxelHit && segVoxelHit.voxel) {
          hitVoxel = segVoxelHit.voxel;
          curPos.copy(segVoxelHit.point);
        }
      }
      const groundY = this.getGroundHeightAt(curPos.x, curPos.z);
      const hitGround = curPos.y <= groundY + 0.15;

      // Direct anti-armor, anti-aircraft & anti-personnel projectile collision
      let hitVehicle = false;
      let hitSoldier = false;

      if (isExplosiveDirect) {
        const ownerTeam = proj.owner ? proj.owner.team : null;
        if (vehicles.length > 0) {
          for (let vIdx = 0; vIdx < vehicles.length; vIdx++) {
            const v = vehicles[vIdx];
            if (v.dead || (ownerTeam && v.team === ownerTeam)) continue;
            if (proj.owner && proj.owner.activeVehicle === v) continue;
            const vcx = v.pos.x;
            const vcy = v.pos.y + 1.35;
            const vcz = v.pos.z;
            const hullRad = v.isAircraft
              ? pType === 'a2a_missile'
                ? 11.5
                : proj.isAaProximity
                ? 10.5
                : 6.5
              : v.type === 'tank'
              ? 3.5
              : v.type === 'apc' || v.type === 'aa'
              ? 3.1
              : 2.5;
            // Swept-segment closest-point check along [_projPrevPos, curPos] so 780 m/s hyper-velocity APFSDS tank shells NEVER tunnel past hulls!
            const vx = vcx - _projPrevPos.x;
            const vy = vcy - _projPrevPos.y;
            const vz = vcz - _projPrevPos.z;
            const tProj =
              segLen > 0.001
                ? Math.max(0, Math.min(segLen, vx * _projSegDir.x + vy * _projSegDir.y + vz * _projSegDir.z))
                : 0;
            const cx = _projPrevPos.x + _projSegDir.x * tProj;
            const cy = _projPrevPos.y + _projSegDir.y * tProj;
            const cz = _projPrevPos.z + _projSegDir.z * tProj;
            const dx = cx - vcx;
            const dy = cy - vcy;
            const dz = cz - vcz;
            if (dx * dx + dy * dy + dz * dz <= hullRad * hullRad) {
              hitVehicle = true;
              curPos.set(vcx, vcy, vcz);
              break;
            }
          }
        }
        if (
          !hitVehicle &&
          Array.isArray(units) &&
          units.length > 0 &&
          pType !== 'airstrike_bomb' &&
          pType !== 'a2a_missile'
        ) {
          const hitRadius =
            pType === 'tank_shell' || pType === 'air_rocket'
              ? 1.55
              : pType === 'autocannon'
              ? 1.25
              : 1.15;
          const hitRadSq = hitRadius * hitRadius;
          const allowFF = Boolean(proj.owner && proj.owner.friendlyFireEnabled);

          const checkSoldierHit = (u) => {
            if (
              !u ||
              u.dead ||
              u.downed ||
              u === proj.owner ||
              (ownerTeam && u.team === ownerTeam && !allowFF)
            ) {
              return false;
            }
            const ux = u.pos.x - _projPrevPos.x;
            const uy = u.pos.y + 0.95 - _projPrevPos.y;
            const uz = u.pos.z - _projPrevPos.z;
            let projDist = ux * _projSegDir.x + uy * _projSegDir.y + uz * _projSegDir.z;
            if (projDist < 0) projDist = 0;
            else if (projDist > segLen) projDist = segLen;
            const cx = _projPrevPos.x + _projSegDir.x * projDist;
            const cy = _projPrevPos.y + _projSegDir.y * projDist;
            const cz = _projPrevPos.z + _projSegDir.z * projDist;
            const dSq =
              (u.pos.x - cx) * (u.pos.x - cx) +
              (u.pos.y + 0.95 - cy) * (u.pos.y + 0.95 - cy) +
              (u.pos.z - cz) * (u.pos.z - cz);
            if (dSq <= hitRadSq) {
              hitSoldier = true;
              curPos.set(cx, cy, cz);
              return true;
            }
            return false;
          };

          if (botGrid) {
            if (units[0] && checkSoldierHit(units[0])) {
              // Hit player
            } else {
              const minX = (_projPrevPos.x < curPos.x ? _projPrevPos.x : curPos.x) - hitRadius;
              const maxX = (_projPrevPos.x > curPos.x ? _projPrevPos.x : curPos.x) + hitRadius;
              const minZ = (_projPrevPos.z < curPos.z ? _projPrevPos.z : curPos.z) - hitRadius;
              const maxZ = (_projPrevPos.z > curPos.z ? _projPrevPos.z : curPos.z) + hitRadius;
              botGrid.forEachInAABB(minX, maxX, minZ, maxZ, (b) => {
                if (checkSoldierHit(b)) return false;
              });
            }
          } else {
            for (let uIdx = 0; uIdx < units.length; uIdx++) {
              if (checkSoldierHit(units[uIdx])) break;
            }
          }
        }
      }

      if (hitVoxel || hitGround || hitVehicle || hitSoldier) {
        if (isExplosiveDirect) {
          const hitPos = curPos.clone();
          const rad =
            proj.blastRadius ||
            (pType === 'gbu28_bomb'
              ? 16.5
              : pType === 'ac130_105mm'
              ? 14.5
              : pType === 'airstrike_bomb' || pType === 'jdam_bomb' || pType === 'mortar_shell'
              ? 12.0
              : pType === 'a2a_missile'
              ? 10.5
              : pType === 'ac130_40mm'
              ? 7.5
              : pType === 'tank_shell'
              ? 6.2
              : pType === 'air_rocket'
              ? 5.6
              : pType === 'rpg'
              ? 2.7
              : 2.8);
          const dmg =
            proj.blastDamage ||
            (pType === 'ac130_105mm'
              ? 620
              : pType === 'gbu28_bomb'
              ? 560
              : pType === 'a2a_missile'
              ? 540
              : pType === 'airstrike_bomb' || pType === 'jdam_bomb'
              ? 420
              : pType === 'mortar_shell'
              ? 340
              : pType === 'tank_shell'
              ? 320
              : pType === 'ac130_40mm' || pType === 'air_rocket'
              ? 240
              : pType === 'rpg'
              ? 185
              : 95);
          const aud = getListenerAudio(hitPos);
          const soundScale =
            pType === 'autocannon'
              ? 0.42
              : pType === 'ac130_105mm' || pType === 'gbu28_bomb' || pType === 'airstrike_bomb' || pType === 'jdam_bomb'
              ? 1.35
              : pType === 'mortar_shell' || pType === 'tank_shell' || pType === 'a2a_missile'
              ? 1.15
              : 0.95;
          const wepLabel =
            proj.weaponName ||
            proj.weaponLabel ||
            (pType === 'autocannon' ? '30MM AUTOCANNON' : null);
          sound.playExplosion(aud.dist, aud.pan, soundScale);
          this.explodeAt(
            hitPos,
            rad,
            dmg,
            (pos, r, d, broken) => {
              if (onExplosionDamage) {
                onExplosionDamage(pos, r, d, proj.owner, broken, wepLabel);
              } else {
                events.emit('explosion:damage', {
                  pos,
                  radius: r,
                  maxDamage: d,
                  owner: proj.owner,
                  brokenCount: broken,
                  weaponOverride: wepLabel
                });
              }
            },
            broadcastFn
          );
          this.scene.remove(proj.mesh);
          disposeNonSharedMeshResources(proj.mesh);
          this.projectiles.splice(i, 1);
        } else if (pType === 'grenade') {
          if (hitGround) {
            curPos.y = groundY + 0.16;
            proj.vel.y *= -0.45;
            proj.vel.x *= 0.68;
            proj.vel.z *= 0.68;
          } else {
            proj.vel.x *= -0.5;
            proj.vel.z *= -0.5;
          }
        } else if (pType === 'c4') {
          proj.vel.set(0, 0, 0);
          proj.gravity = 0;
          if (hitGround) curPos.y = groundY + 0.15;
        }
      }
    }
  },

  updateAmmoCrates(dt, units) {
    // Ammo & Kit Stash Resupply Tick (Squad / BattleBit inspired)
    const playerUnit = units && units[0] ? units[0] : null;
    const bm =
      this.botManager ||
      (typeof window !== 'undefined' && window.game ? window.game.botManager : null);
    const botGrid = bm && bm.spatialGrid && bm.spatialGrid.count > 0 ? bm.spatialGrid : null;

    for (let i = this.ammoCrates.length - 1; i >= 0; i--) {
      const crate = this.ammoCrates[i];
      if (!crate.permanent && typeof crate.timer === 'number') {
        crate.timer -= dt;
        if (crate.timer <= 0) {
          this.scene.remove(crate.mesh);
          disposeNonSharedMeshResources(crate.mesh);
          this.ammoCrates.splice(i, 1);
          continue;
        }
      }
      // Resupply nearby friendly units every 2 seconds
      crate._resupplyTick = (crate._resupplyTick || 0) + dt;
      if (crate._resupplyTick >= 2.0) {
        crate._resupplyTick = 0;
        const radius = crate.resupplyRadius || 5.5;
        const radiusSq = radius * radius;
        let resuppliedTeammate = false;

        const resupplyUnit = (u) => {
          if (!u || u.dead || u.downed) return;
          if (crate.team && u.team !== crate.team) return;
          if (u.pos.distanceToSquared(crate.pos) > radiusSq) return;

          let gaveAmmo = false;
          if (u.slots) {
            for (let sIdx = 0; sIdx < u.slots.length; sIdx++) {
              const slot = u.slots[sIdx];
              if (slot.reserve < slot.def.reserveAmmo) {
                const amount = Math.ceil(slot.def.clipSize * 0.5);
                slot.reserve = Math.min(slot.def.reserveAmmo, slot.reserve + amount);
                if (slot.mags) {
                  slot.mags.push(Math.min(slot.def.clipSize, amount));
                }
                gaveAmmo = true;
              }
              if (slot.maxLooseAmmo > 0 && (slot.looseAmmo || 0) < slot.maxLooseAmmo) {
                const looseAmt = Math.ceil(slot.def.clipSize * 0.75);
                slot.looseAmmo = Math.min(slot.maxLooseAmmo, (slot.looseAmmo || 0) + looseAmt);
                gaveAmmo = true;
              }
            }
          }
          if (typeof u.grenades === 'number' && u.grenades < 2) {
            u.grenades = Math.min(2, u.grenades + 1);
            gaveAmmo = true;
          }
          if (u.role === 'ENGINEER' && typeof u.rpgRocketsLeft === 'number' && u.rpgRocketsLeft < 2) {
            u.rpgRocketsLeft = 2;
            gaveAmmo = true;
          }
          const maxDressings = u.maxBandages || (u.role === 'medic' ? 9 : 3);
          if (typeof u.bandages === 'number' && u.bandages < maxDressings) {
            u.bandages = Math.min(maxDressings, u.bandages + 2);
            gaveAmmo = true;
          }
          if (typeof u.medicBagSupply === 'number' && u.maxMedicBagSupply > 0 && u.medicBagSupply < u.maxMedicBagSupply) {
            u.medicBagSupply = Math.min(u.maxMedicBagSupply, u.medicBagSupply + 200);
            gaveAmmo = true;
          }
          if (typeof u.fieldDressings === 'number') {
            const botMaxDressings = u.maxFieldDressings || (u.role === 'MEDIC' ? 9 : 2);
            if (u.fieldDressings < botMaxDressings) {
              u.fieldDressings = Math.min(botMaxDressings, u.fieldDressings + 3);
              gaveAmmo = true;
            }
          }
          if (gaveAmmo && u !== playerUnit) {
            resuppliedTeammate = true;
          }
        };

        if (botGrid && units) {
          if (playerUnit) resupplyUnit(playerUnit);
          botGrid.forEachInRadius(crate.pos.x, crate.pos.z, radius, (b) => {
            if (b !== playerUnit) resupplyUnit(b);
          });
        } else if (units) {
          for (let uIdx = 0; uIdx < units.length; uIdx++) {
            resupplyUnit(units[uIdx]);
          }
        }

        if (
          resuppliedTeammate &&
          playerUnit &&
          crate.owner === playerUnit.name &&
          typeof playerUnit.onAwardXp === 'function'
        ) {
          playerUnit.score = (playerUnit.score || 0) + 15;
          playerUnit.onAwardXp(15, 'SQUAD RESUPPLIED AT YOUR AMMO STASH');
          if (typeof playerUnit.awardCash === 'function') {
            playerUnit.awardCash(10, 'AMMO STASH RESUPPLY');
          }
        }
      }
      // Pulse the glow ring
      if (crate.mesh && crate.mesh.children[3] && crate.mesh.children[3].material) {
        crate.mesh.children[3].material.opacity = 0.16 + Math.sin(performance.now() * 0.003) * 0.1;
      }
    }
  },

  /**
   * Spawns a 3D Tarkov-style Enemy Backpack & Rig Loot Pack at the fallen enemy's position
   */
  spawnEnemyLootPack(bot) {
    if (!bot) return null;
    const playerTeam = window.game?.player?.team || 'US';
    if (bot.team === playerTeam) return null;
    if (!this.lootPacks) this.lootPacks = [];

    if (bot.lootPack && this.lootPacks.includes(bot.lootPack) && bot.lootPack.items.length > 0) {
      return bot.lootPack;
    }

    while (this.lootPacks.length >= 28) {
      const oldest = this.lootPacks.shift();
      if (oldest && oldest.mesh) {
        this.scene.remove(oldest.mesh);
        disposeNonSharedMeshResources(oldest.mesh);
      }
    }

    const role = (bot.role || 'ASSAULT').toUpperCase();
    const isMedic = role === 'MEDIC';
    const isEng = role === 'ENGINEER';
    const isSupport = role === 'SUPPORT';

    const roleWeapons = {
      ASSAULT: bot.team === 'RU' ? { id: 'ak15', name: 'AK-15 7.62MM RIFLE', cal: '7.62x39mm' } : { id: 'm4a1', name: 'M4A1 TACTICAL CARBINE', cal: '5.56x45mm' },
      MEDIC: bot.team === 'RU' ? { id: 'pp19', name: 'PP-19 VITYAZ SMG', cal: '9x19mm' } : { id: 'mp5', name: 'HK MP5A5 TACTICAL', cal: '9x19mm' },
      ENGINEER: bot.team === 'RU' ? { id: 'ak74', name: 'AK-74M CARBINE', cal: '5.45x39mm' } : { id: 'm4a1', name: 'M4A1 CARBINE', cal: '5.56x45mm' },
      SUPPORT: bot.team === 'RU' ? { id: 'pkp', name: 'PKP PECHENEG LMG', cal: '7.62x54mmR' } : { id: 'm249', name: 'M249 SAW LMG', cal: '5.56x45mm' },
      RECON: bot.team === 'RU' ? { id: 'sv98', name: 'SV-98M SNIPER RIFLE', cal: '7.62x54mmR' } : { id: 'l96', name: 'L96A1 AWP SNIPER', cal: '.338 Lapua' }
    };
    const wepInfo = roleWeapons[role] || roleWeapons.ASSAULT;
    const rankLabel =
      bot.commandRank === 'COMMANDER'
        ? 'COMMANDER'
        : bot.commandRank === 'SQUAD_LEADER'
        ? 'SQUAD LEADER'
        : 'OPERATOR';
    const rawOnHandCash = Math.max(
      120,
      typeof bot.matchCash === 'number' && bot.matchCash > 0
        ? bot.matchCash
        : (bot.commandRank === 'COMMANDER'
            ? 700
            : bot.commandRank === 'SQUAD_LEADER'
            ? 450
            : 250) +
          (bot.kills || 0) * 100 +
          (bot.captures || 0) * 150 +
          (bot.revives || 0) * 80
    );
    const halfLootCash = Math.max(50, Math.round(rawOnHandCash * 0.5));
    const bountyVal = halfLootCash;

    const items = [
      {
        id: `wep_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'weapon',
        weaponId: wepInfo.id,
        name: wepInfo.name,
        desc: `Primary Firearm (${wepInfo.cal}) • Click to Swap into Hands or Strip for +$220`,
        cells: 4,
        gridW: 2,
        gridH: 2,
        icon: '🔫',
        color: '#3498db',
        scrapValue: 220
      },
      {
        id: `mags_${Math.random().toString(36).slice(2, 6)}`,
        type: 'mags',
        count: isSupport ? 2 : 3,
        name: `${isSupport ? '2x BELT BOX' : '3x LOADED'} MAGAZINES (${wepInfo.cal})`,
        desc: 'Adds full spare magazines directly into your Tactical Chest Rig pouches',
        cells: 2,
        gridW: 1,
        gridH: 2,
        icon: '🟨',
        color: '#f1c40f'
      },
      {
        id: `loose_${Math.random().toString(36).slice(2, 6)}`,
        type: 'loose_ammo',
        rounds: isSupport ? 150 : 90,
        name: `${isSupport ? '+150' : '+90'} RDS LOOSE AMMO PACK (${wepInfo.cal})`,
        desc: 'Loose cartridges for Backpack storage & Tarkov Slow Reload [P]',
        cells: 2,
        gridW: 2,
        gridH: 1,
        icon: '🔸',
        color: '#e67e22'
      },
      {
        id: `med_${Math.random().toString(36).slice(2, 6)}`,
        type: 'dressings',
        count: isMedic ? 4 : 2,
        healHp: isMedic ? 65 : 35,
        bagRefill: isMedic ? 250 : 100,
        name: isMedic
          ? '4x FIELD DRESSINGS + IFAK TRAUMA KIT (+65 HP / +250 BAG)'
          : '2x SQUAD FIELD DRESSINGS (+35 HP / REVIVE SUPPLY)',
        desc: 'Replenishes Field Dressings [H/F], heals injuries & refills Medic Bag supply',
        cells: 1,
        gridW: 1,
        gridH: 1,
        icon: '🩹',
        color: '#2ecc71'
      },
      {
        id: `ord_${Math.random().toString(36).slice(2, 6)}`,
        type: 'ordnance',
        grenades: 1,
        rockets: isEng || isSupport ? 1 : 0,
        name:
          isEng
            ? '1x M67 FRAG + 1x PG-7VL HEAT ROCKET'
            : isSupport
            ? '2x M67 FRAG GRENADES + C4 CHARGE'
            : '1x M67 FRAG GRENADE',
        desc: 'Tactical throwable & anti-armor ordnance resupply',
        cells: 1,
        gridW: 1,
        gridH: 1,
        icon: '💣',
        color: '#e74c3c'
      },
      {
        id: `plate_${Math.random().toString(36).slice(2, 6)}`,
        type: 'armor_plate',
        armorAmount: 55,
        backpackUpgradeId:
          bot.commandRank === 'COMMANDER'
            ? 'raid_pack'
            : bot.commandRank === 'SQUAD_LEADER' || isSupport
            ? 'beta2_pack'
            : 'berkut_pack',
        backpackUpgradeName:
          bot.commandRank === 'COMMANDER'
            ? '6Sh118 Raid XL Pack (36 Cells)'
            : bot.commandRank === 'SQUAD_LEADER' || isSupport
            ? 'Beta-2 Battle L Pack (25 Cells)'
            : 'Scav Berkut M Pack (16 Cells)',
        name: `BALLISTIC ARMOR PLATE (+55 AP) & ${
          bot.commandRank === 'COMMANDER'
            ? 'RAID XL PACK'
            : bot.commandRank === 'SQUAD_LEADER' || isSupport
            ? 'BETA-2 L PACK'
            : 'BERKUT M PACK'
        }`,
        desc: 'Repairs your Chest Rig Armor Plate (+55 HP) & lets you equip their larger Backpack for $0!',
        cells: 2,
        gridW: 2,
        gridH: 1,
        icon: '🎒',
        color: '#9b59b6'
      },
      {
        id: `tag_${Math.random().toString(36).slice(2, 6)}`,
        type: 'bounty',
        cashValue: bountyVal,
        ownerMatchCash: rawOnHandCash,
        name: `${bot.team} ${rankLabel} POCKET CASH & DOGTAG (${bot.name})`,
        desc: `50% of enemy's on-hand Match Cash ($${bountyVal} of $${rawOnHandCash} carried — Warehouse Vault excluded)`,
        cells: 1,
        gridW: 1,
        gridH: 1,
        icon: '💵',
        color: '#00d2d3'
      }
    ];

    // Build 3D Dropped Tactical Backpack & Rig Mesh on ground using shared geometries/materials
    const group = new THREE.Group();
    const gy = this.getGroundHeightAt(bot.pos.x, bot.pos.z);
    group.position.set(bot.pos.x, gy, bot.pos.z);

    const packMesh = new THREE.Mesh(_lootPackGeo, bot.team === 'RU' ? _lootPackMatRU : _lootPackMatUS);
    packMesh.position.y = 0.18;
    group.add(packMesh);

    const pouchMesh = new THREE.Mesh(_lootPouchGeo, _lootPouchMat);
    pouchMesh.position.set(0, 0.26, 0);
    group.add(pouchMesh);

    const ringMesh = new THREE.Mesh(_lootRingGeo, _lootRingMat);
    ringMesh.position.y = 0.05;
    group.add(ringMesh);

    this.scene.add(group);

    const entry = {
      id: `loot_${bot.id}_${Date.now()}`,
      ownerName: bot.name,
      ownerTeam: bot.team,
      ownerRole: role,
      ownerRank: rankLabel,
      ownerMatchCash: rawOnHandCash,
      halfLootCash,
      cashAutoLooted: false,
      botRef: bot,
      pos: group.position,
      mesh: group,
      ringMesh,
      timer: 95.0,
      items
    };

    bot.lootPack = entry;
    this.lootPacks.push(entry);
    return entry;
  },

  updateLootPacks(dt) {
    if (!this.lootPacks || this.lootPacks.length === 0) return;
    _lootRingMat.opacity = 0.35 + Math.sin(performance.now() * 0.005) * 0.2;
    for (let i = this.lootPacks.length - 1; i >= 0; i--) {
      const pack = this.lootPacks[i];
      pack.timer -= dt;
      if (pack.botRef && pack.botRef.downed && !pack.botRef.dead) {
        pack.pos.x = pack.botRef.pos.x;
        pack.pos.z = pack.botRef.pos.z;
        pack.pos.y = this.getGroundHeightAt(pack.pos.x, pack.pos.z);
      }
      if (pack.timer <= 0 || !pack.items || pack.items.length === 0) {
        if (pack.mesh) {
          this.scene.remove(pack.mesh);
          disposeNonSharedMeshResources(pack.mesh);
        }
        if (pack.botRef && pack.botRef.lootPack === pack) {
          pack.botRef.lootPack = null;
        }
        this.lootPacks.splice(i, 1);
      }
    }
  }
};
