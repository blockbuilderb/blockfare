import * as THREE from '../../vendor/three.module.js';
import { createRadarTowerMesh } from '../models/prop-models.js?v=120';

const VOXEL_SIZE = 1.25;
const SPATIAL_MIN_X = -2048;
const SPATIAL_MIN_Z = -1280;
const SPATIAL_CELL_SHIFT = 5; // 32m cells (1 << 5)
const SPATIAL_COLS = 128; // 4096m / 32m
const SPATIAL_ROWS = 80; // 2560m / 32m
const SPATIAL_MAX_PAD = 6.0; // Max padMeters supported by spatial index

function markShared(asset) {
  if (asset) {
    if (!asset.userData) asset.userData = {};
    asset.userData.shared = true;
  }
  return asset;
}

// Shared cached Building Armory Key geometries & materials (userData.shared = true)
const _keyGoldMat = markShared(
  new THREE.MeshStandardMaterial({
    color: 0xffd700,
    roughness: 0.14,
    metalness: 0.94,
    emissive: 0x3b2800
  })
);
const _keyCasePadMat = markShared(
  new THREE.MeshStandardMaterial({
    color: 0x162230,
    roughness: 0.45,
    metalness: 0.6,
    emissive: 0x061528
  })
);
const _keyPadGeo = markShared(new THREE.BoxGeometry(0.55, 0.08, 0.42));
const _keyBowRingGeo = markShared(new THREE.TorusGeometry(0.11, 0.028, 8, 16));
const _keyShaftGeo = markShared(new THREE.CylinderGeometry(0.022, 0.022, 0.32, 8));
const _keyTooth1Geo = markShared(new THREE.BoxGeometry(0.036, 0.075, 0.024));
const _keyTooth2Geo = markShared(new THREE.BoxGeometry(0.036, 0.055, 0.024));

const _repairFxColor = new THREE.Color(0x2ecc71);
const _buildHouseFxColor = new THREE.Color(0xf1c40f);
const _fxOrigin = new THREE.Vector3();
const _tmpGrid = { gx: 0, gy: 0, gz: 0 };
const _SAMPLE_OFFSETS_9 = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1]
];
let _repairSearchStamp = 1;

export const BuildingFactory = {
  /**
   * Registers a building or container AABB into the fast 2D spatial lookup grid
   * so `isInsideBuildingOrContainer` runs in O(1) instead of scanning all 130 structures.
   */
  _registerSpatialFootprint(item) {
    if (!this._spatialFootprintGrid) {
      this._spatialFootprintGrid = new Array(SPATIAL_COLS * SPATIAL_ROWS).fill(null);
    }
    const minCx = Math.max(
      0,
      Math.min(SPATIAL_COLS - 1, (item.minWx - SPATIAL_MAX_PAD - SPATIAL_MIN_X) >> SPATIAL_CELL_SHIFT)
    );
    const maxCx = Math.max(
      0,
      Math.min(SPATIAL_COLS - 1, (item.maxWx + SPATIAL_MAX_PAD - SPATIAL_MIN_X) >> SPATIAL_CELL_SHIFT)
    );
    const minCz = Math.max(
      0,
      Math.min(SPATIAL_ROWS - 1, (item.minWz - SPATIAL_MAX_PAD - SPATIAL_MIN_Z) >> SPATIAL_CELL_SHIFT)
    );
    const maxCz = Math.max(
      0,
      Math.min(SPATIAL_ROWS - 1, (item.maxWz + SPATIAL_MAX_PAD - SPATIAL_MIN_Z) >> SPATIAL_CELL_SHIFT)
    );

    for (let cz = minCz; cz <= maxCz; cz++) {
      const rowOff = cz * SPATIAL_COLS;
      for (let cx = minCx; cx <= maxCx; cx++) {
        const idx = rowOff + cx;
        let bucket = this._spatialFootprintGrid[idx];
        if (!bucket) {
          bucket = [];
          this._spatialFootprintGrid[idx] = bucket;
        }
        bucket.push(item);
      }
    }
  },

  /**
   * Returns true if world coordinate (wx, wz) lies inside or within `padMeters` of any
   * standing multi-story building footprint or shipping container.
   * Uses O(1) 2D spatial hash cell lookup when available.
   */
  isInsideBuildingOrContainer(wx, wz, padMeters = 1.2) {
    if (this._spatialFootprintGrid && padMeters <= SPATIAL_MAX_PAD) {
      const cx = (wx - SPATIAL_MIN_X) >> SPATIAL_CELL_SHIFT;
      const cz = (wz - SPATIAL_MIN_Z) >> SPATIAL_CELL_SHIFT;
      if (cx < 0 || cx >= SPATIAL_COLS || cz < 0 || cz >= SPATIAL_ROWS) {
        return false;
      }
      const bucket = this._spatialFootprintGrid[cz * SPATIAL_COLS + cx];
      if (!bucket) return false;
      for (let i = 0; i < bucket.length; i++) {
        const item = bucket[i];
        if (item.collapsed) continue;
        if (
          wx >= item.minWx - padMeters &&
          wx <= item.maxWx + padMeters &&
          wz >= item.minWz - padMeters &&
          wz <= item.maxWz + padMeters
        ) {
          return true;
        }
      }
      return false;
    }

    for (let i = 0; i < this.buildings.length; i++) {
      const b = this.buildings[i];
      if (b.collapsed) continue;
      if (
        wx >= b.minWx - padMeters &&
        wx <= b.maxWx + padMeters &&
        wz >= b.minWz - padMeters &&
        wz <= b.maxWz + padMeters
      ) {
        return true;
      }
    }
    if (this.containers) {
      for (let i = 0; i < this.containers.length; i++) {
        const c = this.containers[i];
        if (
          wx >= c.minWx - padMeters &&
          wx <= c.maxWx + padMeters &&
          wz >= c.minWz - padMeters &&
          wz <= c.maxWz + padMeters
        ) {
          return true;
        }
      }
    }
    return false;
  },

  /**
   * If (wx, wz) falls inside a building or shipping container footprint, pushes it out
   * to the nearest exterior street edge (+padMeters clearance) so waypoints and bots
   * never get trapped inside building interiors or behind walls.
   */
  pushOutOfBuildingFootprint(wx, wz, padMeters = 2.0) {
    let x = wx;
    let z = wz;
    if (this._spatialFootprintGrid && padMeters <= SPATIAL_MAX_PAD) {
      for (let pass = 0; pass < 2; pass++) {
        const cx = (x - SPATIAL_MIN_X) >> SPATIAL_CELL_SHIFT;
        const cz = (z - SPATIAL_MIN_Z) >> SPATIAL_CELL_SHIFT;
        if (cx < 0 || cx >= SPATIAL_COLS || cz < 0 || cz >= SPATIAL_ROWS) break;
        const bucket = this._spatialFootprintGrid[cz * SPATIAL_COLS + cx];
        if (!bucket) break;
        for (let i = 0; i < bucket.length; i++) {
          const item = bucket[i];
          if (item.collapsed) continue;
          const minX = item.minWx - padMeters;
          const maxX = item.maxWx + padMeters;
          const minZ = item.minWz - padMeters;
          const maxZ = item.maxWz + padMeters;
          if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) {
            const dLeft = x - minX;
            const dRight = maxX - x;
            const dFront = z - minZ;
            const dBack = maxZ - z;
            const minDist = Math.min(dLeft, dRight, dFront, dBack);
            if (minDist === dLeft) x = minX - 0.25;
            else if (minDist === dRight) x = maxX + 0.25;
            else if (minDist === dFront) z = minZ - 0.25;
            else z = maxZ + 0.25;
          }
        }
      }
      return { x, z };
    }

    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < this.buildings.length; i++) {
        const b = this.buildings[i];
        if (b.collapsed) continue;
        const minX = (b.startGx - 0.5) * VOXEL_SIZE - padMeters;
        const maxX = (b.startGx + b.width - 0.5) * VOXEL_SIZE + padMeters;
        const minZ = (b.startGz - 0.5) * VOXEL_SIZE - padMeters;
        const maxZ = (b.startGz + b.depth - 0.5) * VOXEL_SIZE + padMeters;
        if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) {
          const dLeft = x - minX;
          const dRight = maxX - x;
          const dFront = z - minZ;
          const dBack = maxZ - z;
          const minDist = Math.min(dLeft, dRight, dFront, dBack);
          if (minDist === dLeft) x = minX - 0.25;
          else if (minDist === dRight) x = maxX + 0.25;
          else if (minDist === dFront) z = minZ - 0.25;
          else z = maxZ + 0.25;
        }
      }
      if (this.containers) {
        for (let i = 0; i < this.containers.length; i++) {
          const c = this.containers[i];
          const minX = (c.startGx - 0.5) * VOXEL_SIZE - padMeters;
          const maxX = (c.startGx + c.maxX - 0.5) * VOXEL_SIZE + padMeters;
          const minZ = (c.startGz - 0.5) * VOXEL_SIZE - padMeters;
          const maxZ = (c.startGz + c.maxZ - 0.5) * VOXEL_SIZE + padMeters;
          if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) {
            const dLeft = x - minX;
            const dRight = maxX - x;
            const dFront = z - minZ;
            const dBack = maxZ - z;
            const minDist = Math.min(dLeft, dRight, dFront, dBack);
            if (minDist === dLeft) x = minX - 0.25;
            else if (minDist === dRight) x = maxX + 0.25;
            else if (minDist === dFront) z = minZ - 0.25;
            else z = maxZ + 0.25;
          }
        }
      }
      if (Array.isArray(this.staticStructureBoxes)) {
        for (let sIdx = 0; sIdx < this.staticStructureBoxes.length; sIdx++) {
          const sb = this.staticStructureBoxes[sIdx];
          const minX = sb.minX - padMeters;
          const maxX = sb.maxX + padMeters;
          const minZ = sb.minZ - padMeters;
          const maxZ = sb.maxZ + padMeters;
          if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) {
            const dLeft = x - minX;
            const dRight = maxX - x;
            const dFront = z - minZ;
            const dBack = maxZ - z;
            const minDist = Math.min(dLeft, dRight, dFront, dBack);
            if (minDist === dLeft) x = minX - 0.25;
            else if (minDist === dRight) x = maxX + 0.25;
            else if (minDist === dFront) z = minZ - 0.25;
            else z = maxZ + 0.25;
          }
        }
      }
    }
    return { x, z };
  },

  /**
   * Finds a nearby world position guaranteed to be outside building/container footprints
   * AND free of voxel walls in a 3x3 neighborhood so players and bots never spawn stuck inside geometry.
   */
  findSafeSpawnPoint(targetX, targetZ) {
    const pushed = this.pushOutOfBuildingFootprint(targetX, targetZ, 2.2);
    const baseX = pushed.x;
    const baseZ = pushed.z;

    for (let ring = 0; ring <= 10; ring++) {
      const samples = ring === 0 ? 1 : Math.min(16, ring * 6);
      for (let i = 0; i < samples; i++) {
        const angle = (i / samples) * Math.PI * 2;
        const dist = ring * 1.8;
        const tx = baseX + Math.cos(angle) * dist;
        const tz = baseZ + Math.sin(angle) * dist;
        const rCx = typeof this.getRiverCenterX === 'function' ? this.getRiverCenterX(tz) : 0;
        if (
          Math.abs(tx - rCx) < 25 &&
          Math.abs(tz) > 18 &&
          Math.abs(tz - 400) > 8.5 &&
          Math.abs(tz + 400) > 8.5
        ) {
          continue; // Never spawn inside the sunken river water
        }
        if (
          this.isInsideBuildingOrContainer(tx, tz, 1.8) ||
          this.isInsideStaticStructure(tx, tz, 1.5)
        ) {
          continue; // Never spawn inside a building room, container, tower, or fence
        }

        const ty = this.getGroundHeightAt(tx, tz);
        const g = this.worldToGrid(tx, ty + 0.25, tz, _tmpGrid);

        if (
          !this.hasVoxel(g.gx, g.gy, g.gz) &&
          !this.hasVoxel(g.gx, g.gy + 1, g.gz) &&
          !this.hasVoxel(g.gx, g.gy + 2, g.gz)
        ) {
          return new THREE.Vector3(tx, ty, tz);
        }
      }
    }
    const fy = this.getGroundHeightAt(baseX, baseZ);
    return new THREE.Vector3(baseX, fy, baseZ);
  },

  /**
   * Returns true if any part of an oriented vehicle hull footprint (halfW x halfL)
   * overlaps a building, shipping container, river gorge, or solid structural voxel.
   */
  registerStaticStructureBox(minX, maxX, minZ, maxZ, label = 'structure') {
    if (!this.staticStructureBoxes) this.staticStructureBoxes = [];
    this.staticStructureBoxes.push({
      minX: Math.min(minX, maxX),
      maxX: Math.max(minX, maxX),
      minZ: Math.min(minZ, maxZ),
      maxZ: Math.max(minZ, maxZ),
      label
    });
  },

  isInsideStaticStructure(wx, wz, pad = 1.0) {
    const list = this.staticStructureBoxes;
    if (!Array.isArray(list) || list.length === 0) return false;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (
        wx >= b.minX - pad &&
        wx <= b.maxX + pad &&
        wz >= b.minZ - pad &&
        wz <= b.maxZ + pad
      ) {
        return true;
      }
    }
    return false;
  },

  isVehicleBoxBlocked(wx, wz, yaw = 0, halfW = 1.95, halfL = 3.55, padMeters = 1.2) {
    const rCenter = typeof this.getRiverCenterX === 'function' ? this.getRiverCenterX(wz) : 0;
    if (
      Math.abs(wx - rCenter) < 26 &&
      Math.abs(wz) > 16 &&
      Math.abs(wz - 220) > 7.5 &&
      Math.abs(wz + 220) > 7.5
    ) {
      return true; // River gorge outside bridge decks
    }
    const fwdX = -Math.sin(yaw);
    const fwdZ = -Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    const centerY = this.getGroundHeightAt(wx, wz);

    // Check 9 points across the oriented vehicle hull/wingspan (center + 4 corners + 4 mid-edges)
    for (let i = 0; i < 9; i++) {
      const pair = _SAMPLE_OFFSETS_9[i];
      const longOff = pair[0] * halfL;
      const latOff = pair[1] * halfW;
      const px = wx + fwdX * longOff + rightX * latOff;
      const pz = wz + fwdZ * longOff + rightZ * latOff;
      if (
        this.isInsideBuildingOrContainer(px, pz, padMeters) ||
        this.isInsideStaticStructure(px, pz, padMeters)
      ) {
        return true;
      }
      const py = this.getGroundHeightAt(px, pz);
      if (Math.abs(py - centerY) > 2.2) {
        return true; // Avoid spawning across steep cliffs/ditches
      }
      const g = this.worldToGrid(px, py + 0.5, pz, _tmpGrid);
      const v0 = this.getVoxel(g.gx, g.gy, g.gz);
      const v1 = this.getVoxel(g.gx, g.gy + 1, g.gz);
      const v2 = this.getVoxel(g.gx, g.gy + 2, g.gz);
      if (
        (v0 && !v0.isProp && v0.type !== 'grass' && v0.type !== 'dirt' && py + 0.8 < (g.gy + 1) * 1.25) ||
        (v1 && !v1.isProp) ||
        (v2 && !v2.isProp)
      ) {
        return true;
      }
    }
    return false;
  },

  /**
   * Finds a guaranteed clear, drivable/flyable world spawn pose `{ x, y, z, yaw }` (returned as Vector3 with `.safeYaw`):
   * - Clears all destructible buildings, shipping containers, HESCO walls, sandbag bunkers, voxel structures,
   *   non-voxel static 3D structures (ATC tower, fences, canopy pillars, guard booths), AND already-spawned vehicles!
   * - Verifies a clear 10m+ forward drive-out / taxi egress corridor (automatically rotating `safeYaw` toward open street if needed)
   *   so NO vehicle ever spawns boxed in next to a building!
   */
  findSafeVehicleSpawnPoint(
    targetX,
    targetZ,
    yaw = 0,
    halfW = 1.95,
    halfL = 3.55,
    existingVehicles = null,
    lockYaw = false
  ) {
    const clearRadius = Math.max(halfW, halfL) + 2.6;
    const pushed = this.pushOutOfBuildingFootprint(targetX, targetZ, clearRadius);
    const baseX = pushed.x;
    const baseZ = pushed.z;
    const minSep = Math.max(4.2, (halfW + halfL) * 0.92);
    const minSepSq = minSep * minSep;

    const overlapsOtherVehicle = (cx, cz) => {
      if (!Array.isArray(existingVehicles)) return false;
      for (let i = 0; i < existingVehicles.length; i++) {
        const ev = existingVehicles[i];
        if (!ev || ev.dead || !ev.pos) continue;
        const dx = cx - ev.pos.x;
        const dz = cz - ev.pos.z;
        const reqD = Math.max(minSep, (ev.hullHalfWidth || 1.6) + halfW + 2.2);
        if (dx * dx + dz * dz < Math.max(minSepSq, reqD * reqD)) return true;
      }
      return false;
    };

    const hasDriveOutEgress = (cx, cz, testYaw) => {
      const fx = -Math.sin(testYaw);
      const fz = -Math.cos(testYaw);
      const step1 = halfL + 3.8;
      const step2 = halfL + 8.2;
      return (
        !this.isVehicleBoxBlocked(cx + fx * step1, cz + fz * step1, testYaw, halfW * 0.9, halfL * 0.75, 0.9) &&
        !this.isVehicleBoxBlocked(cx + fx * step2, cz + fz * step2, testYaw, halfW * 0.9, halfL * 0.75, 0.7)
      );
    };

    const yawOffsets = lockYaw
      ? [0]
      : [0, 0.55, -0.55, Math.PI * 0.5, -Math.PI * 0.5, Math.PI * 0.78, -Math.PI * 0.78, Math.PI];

    // Pass 1: Strict clearance + guaranteed forward drive-out egress + no vehicle overlap
    for (let ring = 0; ring <= 32; ring++) {
      const samples = ring === 0 ? 1 : ring * 12;
      for (let i = 0; i < samples; i++) {
        const angle = (i / samples) * Math.PI * 2;
        const dist = ring * 2.8;
        const tx = baseX + Math.cos(angle) * dist;
        const tz = baseZ + Math.sin(angle) * dist;
        if (overlapsOtherVehicle(tx, tz)) continue;
        for (let yIdx = 0; yIdx < yawOffsets.length; yIdx++) {
          const candYaw = yaw + yawOffsets[yIdx];
          if (!this.isVehicleBoxBlocked(tx, tz, candYaw, halfW, halfL, 1.85) && hasDriveOutEgress(tx, tz, candYaw)) {
            const ty = this.getGroundHeightAt(tx, tz);
            const out = new THREE.Vector3(tx, ty, tz);
            out.safeYaw = candYaw;
            return out;
          }
        }
      }
    }

    // Pass 2: Hull clearance + no vehicle overlap (relaxed egress)
    for (let ring = 0; ring <= 32; ring++) {
      const samples = ring === 0 ? 1 : ring * 12;
      for (let i = 0; i < samples; i++) {
        const angle = (i / samples) * Math.PI * 2;
        const dist = ring * 3.0;
        const tx = baseX + Math.cos(angle) * dist;
        const tz = baseZ + Math.sin(angle) * dist;
        if (overlapsOtherVehicle(tx, tz)) continue;
        if (!this.isVehicleBoxBlocked(tx, tz, yaw, halfW, halfL, 1.4)) {
          const ty = this.getGroundHeightAt(tx, tz);
          const out = new THREE.Vector3(tx, ty, tz);
          out.safeYaw = yaw;
          return out;
        }
      }
    }

    const fy = this.getGroundHeightAt(baseX, baseZ);
    const fallback = new THREE.Vector3(baseX, fy, baseZ);
    fallback.safeYaw = yaw;
    return fallback;
  },

  createBuildingKeyMesh() {
    const group = new THREE.Group();

    // Velvet-lined tactical key display pad on top of room table
    const pad = new THREE.Mesh(_keyPadGeo, _keyCasePadMat);
    pad.position.set(0, 0.04, 0);
    group.add(pad);

    // Floating, angled 3D Golden CS2 Armory Key above the pad
    const keyPivot = new THREE.Group();
    keyPivot.position.set(0, 0.34, 0);
    keyPivot.rotation.set(0.35, 0.4, 0.25);

    const bowRing = new THREE.Mesh(_keyBowRingGeo, _keyGoldMat);
    bowRing.position.set(-0.14, 0, 0);
    const shaft = new THREE.Mesh(_keyShaftGeo, _keyGoldMat);
    shaft.rotation.z = Math.PI / 2;
    shaft.position.set(0.06, 0, 0);
    const tooth1 = new THREE.Mesh(_keyTooth1Geo, _keyGoldMat);
    tooth1.position.set(0.14, -0.045, 0);
    const tooth2 = new THREE.Mesh(_keyTooth2Geo, _keyGoldMat);
    tooth2.position.set(0.19, -0.035, 0);

    keyPivot.add(bowRing, shaft, tooth1, tooth2);
    group.add(keyPivot);
    return group;
  },

  buildApartmentBlock(startGx, startGz, width, depth, floors = 3, wallMat = 'brick') {
    // 1. Sample terrain across the building footprint so the foundation & entrances adapt to hillsides
    let maxFootprintGy = this.getBaseGy(
      startGx + Math.floor(width / 2),
      startGz + Math.floor(depth / 2)
    );
    for (let sx = 0; sx < width; sx += Math.max(1, Math.floor(width / 3))) {
      for (let sz = 0; sz < depth; sz += Math.max(1, Math.floor(depth / 3))) {
        const sGy = this.getBaseGy(startGx + sx, startGz + sz);
        if (sGy > maxFootprintGy) maxFootprintGy = sGy;
      }
    }
    const groundGy = maxFootprintGy;
    const floorHeight = 4;
    const blueprintBlocks = [];
    const addBuildingVoxel = (gx, gy, gz, mat, isProp = false) => {
      const v = this.addVoxel(gx, gy, gz, mat, isProp);
      if (v) {
        blueprintBlocks.push({ gx, gy, gz, mat, isProp: Boolean(isProp) });
      }
      return v;
    };

    // 2. Deep Terrain-Adaptive Foundation Plinth & Level Ground Floor Slab
    for (let x = 0; x < width; x++) {
      for (let z = 0; z < depth; z++) {
        const gx = startGx + x;
        const gz = startGz + z;
        const localGy = this.getBaseGy(gx, gz);
        const isPerimeter = x === 0 || x === width - 1 || z === 0 || z === depth - 1;
        const startFillGy = isPerimeter ? Math.min(localGy - 3, groundGy - 2) : groundGy - 1;
        for (let fy = startFillGy; fy < groundGy; fy++) {
          addBuildingVoxel(gx, fy, gz, 'darkConcrete');
        }
        // Clear any natural terrain blocks that rose into the ground-floor room space
        for (let cy = groundGy; cy < groundGy + floorHeight - 1; cy++) {
          if (this.hasVoxel(gx, cy, gz)) {
            this.destroyVoxel(gx, cy, gz, false);
          }
        }
      }
    }

    const stairEndZ = Math.min(depth - 2, 5);
    const hasEastWing = width >= 8;
    const partX = hasEastWing ? Math.max(4, Math.floor(width * 0.52)) : -1;
    const hasSuiteSplit = depth >= 9 && width >= 8;
    const partZ = hasSuiteSplit ? Math.floor(depth * 0.5) : -1;
    const midX = Math.floor(width / 2);
    const midZ = Math.floor(depth / 2);

    // 3. Terrain-Adaptive Exterior Entry Porches & Steps at all 4 Cardinal Entrances
    const buildTerrainEntryRamp = (doorGx, doorGz, dirX, dirZ) => {
      const extGy = this.getBaseGy(doorGx + dirX * 2, doorGz + dirZ * 2);
      const drop = Math.max(0, Math.min(4, groundGy - extGy));
      const steps = Math.max(1, drop + 1);
      for (let s = 1; s <= steps; s++) {
        const rx = doorGx + dirX * s;
        const rz = doorGz + dirZ * s;
        const stepTopGy = Math.max(extGy - 1, groundGy - s);
        const baseStepGy = Math.min(this.getBaseGy(rx, rz), stepTopGy);
        for (let fy = baseStepGy; fy <= stepTopGy; fy++) {
          addBuildingVoxel(rx, fy, rz, 'darkConcrete');
        }
        // Ensure 3-voxel vertical headroom above every exterior step so slopes never block doorways
        for (let ch = 1; ch <= 3; ch++) {
          if (this.hasVoxel(rx, stepTopGy + ch, rz)) {
            this.destroyVoxel(rx, stepTopGy + ch, rz, false);
          }
        }
      }
    };

    for (let d = -1; d <= 1; d++) {
      const dx = midX + d;
      if (dx > 0 && dx < width - 1 && dx !== partX) {
        buildTerrainEntryRamp(startGx + dx, startGz, 0, -1);
        buildTerrainEntryRamp(startGx + dx, startGz + depth - 1, 0, 1);
      }
      const dz = midZ + d;
      if (dz > 0 && dz < depth - 1 && dz !== partZ) {
        buildTerrainEntryRamp(startGx, startGz + dz, -1, 0);
        buildTerrainEntryRamp(startGx + width - 1, startGz + dz, 1, 0);
      }
    }

    for (let f = 0; f < floors; f++) {
      const baseGy = groundGy + f * floorHeight;

      for (let x = 0; x < width; x++) {
        for (let z = 0; z < depth; z++) {
          const gx = startGx + x;
          const gz = startGz + z;
          const isEdgeX = x === 0 || x === width - 1;
          const isEdgeZ = z === 0 || z === depth - 1;
          const isExteriorWall = isEdgeX || isEdgeZ;

          // Wide 2x5 stairwell shaft cutout above the double-wide staircase so heads NEVER bump ceilings!
          const isStairCutout = x >= 1 && x <= 2 && z >= 1 && z <= stairEndZ;
          if (!isStairCutout) {
            addBuildingVoxel(gx, baseGy + floorHeight - 1, gz, 'concrete');
          }

          if (isExteriorWall) {
            for (let y = 0; y < floorHeight - 1; y++) {
              const gy = baseGy + y;

              const isGroundDoor =
                f === 0 &&
                y < 3 &&
                (((z === 0 || z === depth - 1) && Math.abs(x - midX) <= 1 && x !== partX) ||
                  ((x === 0 || x === width - 1) && Math.abs(z - midZ) <= 1 && z !== partZ));

              const isBalconyDoor =
                f > 0 &&
                width >= 7 &&
                z === 0 &&
                y < 2 &&
                Math.abs(x - midX) <= 1 &&
                x !== partX;

              const isWindow =
                (y === 1 || (y === 2 && (x + z) % 4 === 0)) &&
                !isGroundDoor &&
                !isBalconyDoor &&
                ((isEdgeZ && x > 1 && x < width - 2 && x !== partX && x % 2 === 0) ||
                  (isEdgeX && z > 1 && z < depth - 2 && z !== partZ && z % 2 === 0));

              if (!isGroundDoor && !isBalconyDoor && !isWindow) {
                const mat =
                  y === 0 && f === 0
                    ? 'darkConcrete'
                    : (x === 0 || x === width - 1) && (z === 0 || z === depth - 1)
                    ? 'darkConcrete'
                    : wallMat;
                addBuildingVoxel(gx, gy, gz, mat);
              }
            }
            continue;
          }

          if (f > 0 && x === 3 && z >= 1 && z <= 2 && partX !== 3) {
            addBuildingVoxel(gx, baseGy, gz, 'wood');
          }

          const isVerticalPartition = hasEastWing && x === partX && z > 0 && z < depth - 1;
          const isHorizontalSuiteWall =
            hasSuiteSplit && z === partZ && x > partX && x < width - 1;

          if (isVerticalPartition || isHorizontalSuiteWall) {
            const isInteriorDoor = isVerticalPartition
              ? Math.abs(z - midZ) <= 1 || z === 2 || z === depth - 3
              : Math.abs(x - Math.floor((partX + width - 1) * 0.5)) <= 1;
            const isInteriorPeekWindow =
              !isInteriorDoor &&
              ((isVerticalPartition && z === Math.max(2, midZ - 2)) ||
                (isHorizontalSuiteWall && x === width - 2));

            for (let y = 0; y < floorHeight - 1; y++) {
              if (isInteriorDoor && y < 3) continue;
              if (isInteriorPeekWindow && y === 1) continue;
              addBuildingVoxel(gx, baseGy + y, gz, y === 0 ? 'darkConcrete' : 'concrete');
            }
          }
        }
      }

      if (width >= 6 && depth >= 6) {
        for (let step = 0; step < floorHeight - 1; step++) {
          const sz = startGz + 1 + Math.min(step, depth - 3);
          addBuildingVoxel(startGx + 1, baseGy + step, sz, 'wood');
          if (width >= 7) {
            addBuildingVoxel(startGx + 2, baseGy + step, sz, 'wood');
          }
        }
        const deskX = startGx + width - 2;
        const deskZ = startGz + depth - 2;
        addBuildingVoxel(deskX, baseGy, deskZ, 'wood', true);
      }

      if (f > 0 && width >= 7) {
        for (let bx = 2; bx < width - 2; bx++) {
          addBuildingVoxel(startGx + bx, baseGy - 1, startGz - 1, 'concrete');
          if (bx === 2 || bx === width - 3 || bx % 2 === 0) {
            addBuildingVoxel(startGx + bx, baseGy, startGz - 1, 'sandbag');
          }
        }
        if (f === 1 && width >= 8) {
          for (let s = 0; s < floorHeight; s++) {
            addBuildingVoxel(startGx + 1 + s, groundGy + s - 1, startGz - 2, 'darkConcrete');
          }
          addBuildingVoxel(startGx + 2, baseGy - 1, startGz - 2, 'darkConcrete');
        }
      }
    }

    const topGy = groundGy + floors * floorHeight;
    for (let x = 0; x < width; x++) {
      for (let z = 0; z < depth; z++) {
        if (x === 0 || x === width - 1 || z === 0 || z === depth - 1) {
          if ((x + z) % 2 === 0) {
            addBuildingVoxel(startGx + x, topGy, startGz + z, 'darkConcrete');
          }
        }
      }
    }
    if (width >= 7 && depth >= 6) {
      addBuildingVoxel(startGx + midX, topGy, startGz + midZ, 'darkConcrete');
      addBuildingVoxel(startGx + midX + 1, topGy, startGz + midZ, 'wood', true);
    }

    // Pre-sort blueprintBlocks bottom-up once at creation so repairBuilding never clones/sorts at runtime
    blueprintBlocks.sort((a, b) => a.gy - b.gy);

    // Register building foundation keys for structural collapse tracking
    const foundationKeys = [];
    for (let x = 0; x < width; x++) {
      for (let z = 0; z < depth; z++) {
        for (let y = 0; y <= 1; y++) {
          if (this.hasVoxel(startGx + x, groundGy + y, startGz + z)) {
            foundationKeys.push(this.key(startGx + x, groundGy + y, startGz + z));
          }
        }
      }
    }
    const minWx = (startGx - 0.5) * VOXEL_SIZE;
    const maxWx = (startGx + width - 0.5) * VOXEL_SIZE;
    const minWz = (startGz - 0.5) * VOXEL_SIZE;
    const maxWz = (startGz + depth - 0.5) * VOXEL_SIZE;
    const bldId = this.buildings.length;
    const bldRecord = {
      id: bldId,
      startGx,
      startGz,
      width,
      depth,
      floors,
      wallMat,
      groundGy,
      minWx,
      maxWx,
      minWz,
      maxWz,
      centerWx: (minWx + maxWx) * 0.5,
      centerWz: (minWz + maxWz) * 0.5,
      foundationKeys,
      blueprintBlocks,
      collapsed: false
    };
    this.buildings.push(bldRecord);
    this._registerSpatialFootprint(bldRecord);

    // ─── SCATTER COLLECTIBLE CS2 ARMORY CASE KEYS INSIDE BUILDING ROOMS ──────
    if (!Array.isArray(this.buildingKeys)) {
      this.buildingKeys = [];
    }
    if (width >= 6 && depth >= 6 && bldId % 2 === 0) {
      const keyFloor = bldId % 4 === 0 && floors >= 2 ? 1 : 0;
      const keyGx = startGx + Math.max(3, width - 3);
      const keyGz = startGz + Math.max(2, depth - 3);
      const keyFloorGy = groundGy + keyFloor * floorHeight;
      const keyWx = keyGx * VOXEL_SIZE;
      const keyWy = (keyFloorGy - 0.48) * VOXEL_SIZE;
      const keyWz = keyGz * VOXEL_SIZE;
      const keyMesh = this.createBuildingKeyMesh();
      keyMesh.position.set(keyWx, keyWy, keyWz);
      if (this.scene) {
        this.scene.add(keyMesh);
      }
      if (this._ownedWorldObjects) this._ownedWorldObjects.push(keyMesh);
      this.buildingKeys.push({
        id: `bkey_${bldId}_f${keyFloor}`,
        buildingId: bldId,
        floor: keyFloor + 1,
        roomLabel: `BLDG #${bldId + 1} (${keyFloor === 0 ? '1F FOYER ROOM' : '2F OVERWATCH SUITE'})`,
        pos: new THREE.Vector3(keyWx, keyWy + 0.35, keyWz),
        mesh: keyMesh,
        collected: false
      });
    }
  },

  /**
   * Computes current structural health and intact block percentage for a building.
   */
  getBuildingHealthInfo(bld) {
    if (!bld || !bld.blueprintBlocks || bld.blueprintBlocks.length === 0) {
      return {
        intactCount: 0,
        damagedCount: 0,
        missingCount: 0,
        totalCount: 0,
        integrityPct: 100,
        needsRepair: false
      };
    }
    let intactCount = 0;
    let damagedCount = 0;
    let missingCount = 0;
    const blocks = bld.blueprintBlocks;
    for (let i = 0; i < blocks.length; i++) {
      const bp = blocks[i];
      if (bp.isProp) continue;
      const v = this.getVoxel(bp.gx, bp.gy, bp.gz);
      if (!v) {
        missingCount++;
      } else if (v.hp < v.maxHp) {
        damagedCount++;
        intactCount++;
      } else {
        intactCount++;
      }
    }
    const totalCount = Math.max(1, intactCount + missingCount);
    const integrityPct = Math.round((intactCount / totalCount) * 100);
    return {
      intactCount,
      damagedCount,
      missingCount,
      totalCount,
      integrityPct,
      needsRepair: Boolean(missingCount > 0 || damagedCount > 0 || bld.collapsed)
    };
  },

  /**
   * Finds the nearest building within `maxDist` meters of `worldPos` (measured to the building's
   * exterior walls) that has missing/damaged blocks or has collapsed and can be repaired for cover!
   */
  findNearestDamagedBuilding(worldPos, maxDist = 14.0) {
    if (!this.buildings || !worldPos) return null;
    let best = null;
    let bestDistSq = maxDist * maxDist;
    let bestInfo = null;
    const px = worldPos.x;
    const pz = worldPos.z;

    if (this._spatialFootprintGrid) {
      const minCx = Math.max(0, Math.min(SPATIAL_COLS - 1, (px - maxDist - SPATIAL_MIN_X) >> SPATIAL_CELL_SHIFT));
      const maxCx = Math.max(0, Math.min(SPATIAL_COLS - 1, (px + maxDist - SPATIAL_MIN_X) >> SPATIAL_CELL_SHIFT));
      const minCz = Math.max(0, Math.min(SPATIAL_ROWS - 1, (pz - maxDist - SPATIAL_MIN_Z) >> SPATIAL_CELL_SHIFT));
      const maxCz = Math.max(0, Math.min(SPATIAL_ROWS - 1, (pz + maxDist - SPATIAL_MIN_Z) >> SPATIAL_CELL_SHIFT));
      const stamp = ++_repairSearchStamp;

      for (let cz = minCz; cz <= maxCz; cz++) {
        const rowOff = cz * SPATIAL_COLS;
        for (let cx = minCx; cx <= maxCx; cx++) {
          const bucket = this._spatialFootprintGrid[rowOff + cx];
          if (!bucket) continue;
          for (let i = 0; i < bucket.length; i++) {
            const b = bucket[i];
            if (!b.blueprintBlocks || b._repairStamp === stamp) continue;
            b._repairStamp = stamp;
            const clampedX = px < b.minWx ? b.minWx : px > b.maxWx ? b.maxWx : px;
            const clampedZ = pz < b.minWz ? b.minWz : pz > b.maxWz ? b.maxWz : pz;
            const dx = px - clampedX;
            const dz = pz - clampedZ;
            const dSq = dx * dx + dz * dz;
            if (dSq > bestDistSq) continue;

            const info = this.getBuildingHealthInfo(b);
            if (info.needsRepair) {
              bestDistSq = dSq;
              best = b;
              bestInfo = info;
            }
          }
        }
      }
      return best ? { building: best, info: bestInfo, distance: Math.sqrt(bestDistSq) } : null;
    }

    for (let i = 0; i < this.buildings.length; i++) {
      const b = this.buildings[i];
      if (!b.blueprintBlocks) continue;
      const clampedX = px < b.minWx ? b.minWx : px > b.maxWx ? b.maxWx : px;
      const clampedZ = pz < b.minWz ? b.minWz : pz > b.maxWz ? b.maxWz : pz;
      const dx = px - clampedX;
      const dz = pz - clampedZ;
      const dSq = dx * dx + dz * dz;
      if (dSq > bestDistSq) continue;

      const info = this.getBuildingHealthInfo(b);
      if (info.needsRepair) {
        bestDistSq = dSq;
        best = b;
        bestInfo = info;
      }
    }
    return best ? { building: best, info: bestInfo, distance: Math.sqrt(bestDistSq) } : null;
  },

  /**
   * Repairs a damaged or collapsed building around a forward base or objective, restoring
   * damaged voxel HP and rebuilding missing walls/floors from the ground floor upward!
   */
  repairBuilding(bld, maxBlocksToRestore = 90, playerPos = null, broadcastFn = null) {
    if (!bld || !bld.blueprintBlocks) {
      return { restoredCount: 0, integrityPct: 100, fullyRepaired: true };
    }

    let restoredCount = 0;
    // blueprintBlocks is pre-sorted ascending by gy at creation time
    const sorted = bld.blueprintBlocks;

    for (let i = 0; i < sorted.length; i++) {
      const bp = sorted[i];
      const existing = this.getVoxel(bp.gx, bp.gy, bp.gz);

      if (existing) {
        if (existing.hp < existing.maxHp) {
          existing.hp = existing.maxHp;
          const batch = this.instancedBatches[existing.type];
          if (batch) {
            batch.mesh.setColorAt(existing.instanceId, existing.baseColor);
            this._markColorDirty(batch, existing.instanceId);
          }
          restoredCount++;
        }
      } else if (restoredCount < maxBlocksToRestore) {
        // Avoid placing a wall voxel directly on top of the repairing player
        if (playerPos) {
          const wx = bp.gx * VOXEL_SIZE;
          const wz = bp.gz * VOXEL_SIZE;
          if (Math.abs(wx - playerPos.x) < 1.32 && Math.abs(wz - playerPos.z) < 1.32) {
            continue;
          }
        }
        const added = this.addVoxel(bp.gx, bp.gy, bp.gz, bp.mat, bp.isProp, false);
        if (added) {
          restoredCount++;
          if (broadcastFn) {
            broadcastFn({ type: 'voxel_add', gx: bp.gx, gy: bp.gy, gz: bp.gz, mat: bp.mat });
          }
        }
      }
    }

    // Re-evaluate foundation integrity so collapsed buildings become active standing cover again
    if (Array.isArray(bld.foundationKeys) && bld.foundationKeys.length > 0) {
      let intactFoundations = 0;
      for (let i = 0; i < bld.foundationKeys.length; i++) {
        if (this.voxels.has(bld.foundationKeys[i])) intactFoundations++;
      }
      if (intactFoundations >= Math.max(1, bld.foundationKeys.length * 0.45)) {
        bld.collapsed = false;
      }
    } else {
      bld.collapsed = false;
    }

    const afterInfo = this.getBuildingHealthInfo(bld);
    if (restoredCount > 0) {
      _fxOrigin.set(bld.centerWx, ((bld.groundGy ?? 0) + 1.5) * VOXEL_SIZE, bld.centerWz);
      this.spawnDebris(_fxOrigin, _repairFxColor, 6);
    }

    return {
      restoredCount,
      integrityPct: afterInfo.integrityPct,
      fullyRepaired: !afterInfo.needsRepair
    };
  },

  buildMultiStoryBuilding(startGx, startGz, width, depth, floors = 3, wallMat = 'brick') {
    return this.buildApartmentBlock(startGx, startGz, width, depth, floors, wallMat);
  },

  buildShippingContainer(startGx, startGz, alongX = true, matType = 'containerRed', offsetGy = 0) {
    const baseGy = this.getBaseGy(startGx + 2, startGz + 1) + offsetGy;
    const len = 6;
    const wid = 3;
    const h = 3;
    const maxX = alongX ? len : wid;
    const maxZ = alongX ? wid : len;

    for (let x = 0; x < maxX; x++) {
      for (let z = 0; z < maxZ; z++) {
        if (offsetGy === 0 && (x === 0 || x === maxX - 1 || z === 0 || z === maxZ - 1)) {
          const localGy = this.getBaseGy(startGx + x, startGz + z);
          for (let fy = Math.min(localGy - 2, baseGy - 1); fy < baseGy; fy++) {
            this.addVoxel(startGx + x, fy, startGz + z, 'darkConcrete');
          }
        }
        for (let y = 0; y < h; y++) {
          const isShell =
            x === 0 || x === maxX - 1 || z === 0 || z === maxZ - 1 || y === h - 1;
          const isOpenDoor = alongX
            ? (x === 0 || x === maxX - 1) && z === 1 && y < 2
            : (z === 0 || z === maxZ - 1) && x === 1 && y < 2;
          if (isShell && !isOpenDoor) {
            this.addVoxel(startGx + x, baseGy + y, startGz + z, matType);
          }
        }
      }
    }
    if (offsetGy === 0 && this.containers) {
      const cRecord = {
        startGx,
        startGz,
        maxX,
        maxZ,
        baseGy,
        minWx: (startGx - 0.5) * VOXEL_SIZE,
        maxWx: (startGx + maxX - 0.5) * VOXEL_SIZE,
        minWz: (startGz - 0.5) * VOXEL_SIZE,
        maxWz: (startGz + maxZ - 0.5) * VOXEL_SIZE,
        collapsed: false
      };
      this.containers.push(cRecord);
      this._registerSpatialFootprint(cRecord);
    }
  },

  buildWatchtower(startGx, startGz) {
    const baseGy = this.getBaseGy(startGx + 1, startGz + 1);
    for (let y = -3; y < 5; y++) {
      this.addVoxel(startGx, baseGy + y, startGz, 'wood');
      this.addVoxel(startGx + 3, baseGy + y, startGz, 'wood');
      this.addVoxel(startGx, baseGy + y, startGz + 3, 'wood');
      this.addVoxel(startGx + 3, baseGy + y, startGz + 3, 'wood');
    }
    for (let x = 0; x <= 3; x++) {
      for (let z = 0; z <= 3; z++) {
        this.addVoxel(startGx + x, baseGy + 4, startGz + z, 'wood');
        if (x === 0 || x === 3 || z === 0 || z === 3) {
          this.addVoxel(startGx + x, baseGy + 5, startGz + z, 'sandbag');
        }
      }
    }
  },

  buildHescoBastion(startGx, startGz, length, alongX = true) {
    for (let i = 0; i < length; i++) {
      const gx = alongX ? startGx + i : startGx;
      const gz = alongX ? startGz : startGz + i;
      const baseGy = this.getBaseGy(gx, gz);
      this.addVoxel(gx, baseGy, gz, 'sandbag');
      if (i % 2 === 0) {
        this.addVoxel(gx, baseGy + 1, gz, 'sandbag');
      }
    }
  },

  buildSandbagBunker(centerGx, centerGz) {
    const baseGy = this.getBaseGy(centerGx, centerGz);
    for (let dx = -2; dx <= 2; dx++) {
      this.addVoxel(centerGx + dx, baseGy, centerGz - 2, 'sandbag');
      this.addVoxel(centerGx + dx, baseGy, centerGz + 2, 'sandbag');
      if (Math.abs(dx) === 2) {
        this.addVoxel(centerGx + dx, baseGy + 1, centerGz - 2, 'sandbag');
        this.addVoxel(centerGx + dx, baseGy + 1, centerGz + 2, 'sandbag');
      }
    }
    this.addVoxel(centerGx - 2, baseGy, centerGz - 1, 'sandbag');
    this.addVoxel(centerGx + 2, baseGy, centerGz + 1, 'sandbag');
  },

  buildRadarTower(wx, wz) {
    const wy = this.getTerrainHeight(wx, wz);
    const group = createRadarTowerMesh();
    group.position.set(wx, wy, wz);
    this.scene.add(group);
    if (this._ownedWorldObjects) this._ownedWorldObjects.push(group);
  },

  /**
   * Builds progressive Chest-Wall & Firing-Port Defense Emplacements around a captured Objective (A–E)
   */
  buildPointDefenseStage(flag, broadcastFn = null, playerPos = null) {
    if (!flag) return { stage: 0, maxStage: 4, blocksBuilt: 0 };
    const nextStage = Math.min(4, (flag.defenseStage || 0) + 1);
    flag.defenseStage = nextStage;

    const cg = this.worldToGrid(flag.pos.x, flag.pos.y, flag.pos.z, _tmpGrid);
    const cx = cg.gx;
    const cz = cg.gz;
    let blocksBuilt = 0;

    const placeDefenseBlock = (gx, gyOffset, gz, mat = 'sandbag') => {
      if (
        playerPos &&
        Math.abs(gx * VOXEL_SIZE - playerPos.x) < 1.32 &&
        Math.abs(gz * VOXEL_SIZE - playerPos.z) < 1.32
      ) {
        return;
      }
      const baseGy = this.getBaseGy(gx, gz);
      const gy = baseGy + gyOffset;
      const v = this.addVoxel(gx, gy, gz, mat, false, true);
      if (v) {
        blocksBuilt++;
        if (broadcastFn) {
          broadcastFn({ type: 'voxel_add', gx, gy, gz, mat });
        }
      }
    };

    const r = 6; // 6 voxels = 7.5m from flagpole center (inside the capture perimeter)
    if (nextStage === 1) {
      for (let dz = -2; dz <= 2; dz++) {
        const mat = Math.abs(dz) === 2 ? 'darkConcrete' : 'sandbag';
        placeDefenseBlock(cx - r, 0, cz + dz, mat);
        placeDefenseBlock(cx + r, 0, cz + dz, mat);
      }
      placeDefenseBlock(cx - r, 1, cz - 2, 'sandbag');
      placeDefenseBlock(cx - r, 1, cz + 2, 'sandbag');
      placeDefenseBlock(cx + r, 1, cz - 2, 'sandbag');
      placeDefenseBlock(cx + r, 1, cz + 2, 'sandbag');
    } else if (nextStage === 2) {
      for (let dx = -2; dx <= 2; dx++) {
        const mat = Math.abs(dx) === 2 ? 'darkConcrete' : 'sandbag';
        placeDefenseBlock(cx + dx, 0, cz - r, mat);
        placeDefenseBlock(cx + dx, 0, cz + r, mat);
      }
      placeDefenseBlock(cx - 2, 1, cz - r, 'sandbag');
      placeDefenseBlock(cx + 2, 1, cz - r, 'sandbag');
      placeDefenseBlock(cx - 2, 1, cz + r, 'sandbag');
      placeDefenseBlock(cx + 2, 1, cz + r, 'sandbag');
    } else if (nextStage === 3) {
      for (const [sx, sz] of [
        [1, -1],
        [-1, 1]
      ]) {
        const bx = cx + sx * (r - 1);
        const bz = cz + sz * (r - 1);
        placeDefenseBlock(bx, 0, bz, 'darkConcrete');
        placeDefenseBlock(bx - sx, 0, bz, 'sandbag');
        placeDefenseBlock(bx, 0, bz - sz, 'sandbag');
        placeDefenseBlock(bx - sx, 1, bz, 'sandbag');
      }
    } else if (nextStage === 4) {
      for (const [sx, sz] of [
        [-1, -1],
        [1, 1]
      ]) {
        const bx = cx + sx * (r - 1);
        const bz = cz + sz * (r - 1);
        placeDefenseBlock(bx, 0, bz, 'darkConcrete');
        placeDefenseBlock(bx - sx, 0, bz, 'sandbag');
        placeDefenseBlock(bx, 0, bz - sz, 'sandbag');
        placeDefenseBlock(bx, 1, bz - sz, 'sandbag');
      }
      for (const [ox, oz] of [
        [-2, 0],
        [2, 0],
        [0, -2],
        [0, 2]
      ]) {
        placeDefenseBlock(cx + ox, 0, cz + oz, 'sandbag');
      }
    }

    return { stage: nextStage, maxStage: 4, blocksBuilt };
  },

  buildObjectivePointDefenses(flag, broadcastFn = null) {
    return this.buildPointDefenseStage(flag, broadcastFn);
  },

  /**
   * Constructs a full walk-in 3D Player-Built Tactical House or Reinforced Command Bunker.
   */
  buildPlayerHouseOrBunker(
    centerWx,
    centerWz,
    yaw = 0,
    variant = 'BUNKER',
    playerPos = null,
    broadcastFn = null
  ) {
    const isHouse = String(variant || '').toUpperCase().includes('HOUSE');
    const width = isHouse ? 6 : 5;
    const depth = isHouse ? 6 : 5;
    const floors = isHouse ? 2 : 1;
    const floorHeight = 4;
    const wallMat = isHouse ? 'brick' : 'concrete';

    const centerGrid = this.worldToGrid(centerWx, this.getGroundHeightAt(centerWx, centerWz), centerWz, _tmpGrid);
    const startGx = centerGrid.gx - Math.floor(width / 2);
    const startGz = centerGrid.gz - Math.floor(depth / 2);
    const groundGy = this.getBaseGy(startGx + Math.floor(width / 2), startGz + Math.floor(depth / 2));

    const blueprintBlocks = [];
    let blocksBuilt = 0;

    const addStructureVoxel = (gx, gy, gz, mat, isProp = false) => {
      if (
        playerPos &&
        Math.abs(gx * VOXEL_SIZE - playerPos.x) < 1.25 &&
        Math.abs(gz * VOXEL_SIZE - playerPos.z) < 1.25 &&
        Math.abs(gy * VOXEL_SIZE - playerPos.y) <= 2.5
      ) {
        return null;
      }
      const existing = this.getVoxel(gx, gy, gz);
      if (existing) {
        blueprintBlocks.push({ gx, gy, gz, mat: existing.type || mat, isProp: Boolean(isProp) });
        return existing;
      }
      const v = this.addVoxel(gx, gy, gz, mat, isProp, true);
      if (v) {
        blocksBuilt++;
        blueprintBlocks.push({ gx, gy, gz, mat, isProp: Boolean(isProp) });
        if (broadcastFn) {
          broadcastFn({ type: 'voxel_add', gx, gy, gz, mat });
        }
      }
      return v;
    };

    for (let x = 0; x < width; x++) {
      for (let z = 0; z < depth; z++) {
        const isEdge = x === 0 || x === width - 1 || z === 0 || z === depth - 1;
        if (isEdge) {
          const localGy = this.getBaseGy(startGx + x, startGz + z);
          for (let fy = Math.min(localGy - 3, groundGy - 2); fy < groundGy; fy++) {
            addStructureVoxel(startGx + x, fy, startGz + z, 'darkConcrete');
          }
        }
      }
    }

    if (isHouse) {
      for (let f = 0; f < floors; f++) {
        const baseGy = groundGy + f * floorHeight;
        for (let x = 0; x < width; x++) {
          for (let z = 0; z < depth; z++) {
            const gx = startGx + x;
            const gz = startGz + z;
            const isEdgeX = x === 0 || x === width - 1;
            const isEdgeZ = z === 0 || z === depth - 1;
            const isWall = isEdgeX || isEdgeZ;

            const isStairCutout = x === 1 && z >= 1 && z <= 3;
            if (!isStairCutout) {
              addStructureVoxel(gx, baseGy + floorHeight - 1, gz, 'concrete');
            }

            if (!isWall) continue;

            for (let y = 0; y < floorHeight - 1; y++) {
              const gy = baseGy + y;
              const isDoor =
                f === 0 &&
                y < 2 &&
                (((z === 0 || z === depth - 1) && (x === 2 || x === 3)) ||
                  ((x === 0 || x === width - 1) && (z === 2 || z === 3)));
              const isWindow =
                y === 1 &&
                isWall &&
                !isDoor &&
                ((isEdgeZ && (x === 1 || x === width - 2)) ||
                  (isEdgeX && (z === 1 || z === depth - 2)));

              if (!isDoor && !isWindow) {
                const mat = y === 0 ? 'darkConcrete' : wallMat;
                addStructureVoxel(gx, gy, gz, mat);
              }
            }
          }
        }

        for (let step = 0; step < floorHeight - 1; step++) {
          addStructureVoxel(startGx + 1, baseGy + step, startGz + 1 + step, 'wood');
        }
      }

      const topGy = groundGy + floors * floorHeight;
      for (let x = 0; x < width; x++) {
        for (let z = 0; z < depth; z++) {
          if (x === 0 || x === width - 1 || z === 0 || z === depth - 1) {
            const mat = (x + z) % 2 === 0 ? 'darkConcrete' : 'sandbag';
            addStructureVoxel(startGx + x, topGy, startGz + z, mat);
          }
        }
      }
    } else {
      const baseGy = groundGy;
      for (let x = 0; x < width; x++) {
        for (let z = 0; z < depth; z++) {
          const gx = startGx + x;
          const gz = startGz + z;
          const isEdgeX = x === 0 || x === width - 1;
          const isEdgeZ = z === 0 || z === depth - 1;
          const isCorner = isEdgeX && isEdgeZ;
          const isWall = isEdgeX || isEdgeZ;

          const isRoofHatch = x === 1 && (z === 1 || z === 2);
          if (!isRoofHatch) {
            addStructureVoxel(gx, baseGy + 3, gz, 'darkConcrete');
          }

          if (!isWall) continue;

          for (let y = 0; y < 3; y++) {
            const gy = baseGy + y;
            const isDoor = y < 2 && ((z === depth - 1 && x === 2) || (x === 0 && z === 2));
            const isFiringSlit =
              y === 1 &&
              !isCorner &&
              !isDoor &&
              ((isEdgeZ && (x === 1 || x === 2 || x === 3)) ||
                (isEdgeX && (z === 1 || z === 2 || z === 3)));

            if (!isDoor && !isFiringSlit) {
              const mat = isCorner || y === 2 ? 'darkConcrete' : y === 0 ? 'sandbag' : 'concrete';
              addStructureVoxel(gx, gy, gz, mat);
            }
          }
        }
      }

      addStructureVoxel(startGx + 1, baseGy, startGz + 1, 'wood');
      addStructureVoxel(startGx + 1, baseGy + 1, startGz + 2, 'wood');

      const topGy = baseGy + 4;
      for (let x = 0; x < width; x++) {
        for (let z = 0; z < depth; z++) {
          if (x === 0 || x === width - 1 || z === 0 || z === depth - 1) {
            const mat = (x === 0 || x === width - 1) && (z === 0 || z === depth - 1) ? 'darkConcrete' : 'sandbag';
            addStructureVoxel(startGx + x, topGy, startGz + z, mat);
          }
        }
      }
    }

    // Pre-sort blueprintBlocks bottom-up once at creation
    blueprintBlocks.sort((a, b) => a.gy - b.gy);

    const foundationKeys = [];
    for (let x = 0; x < width; x++) {
      for (let z = 0; z < depth; z++) {
        for (let y = 0; y <= 1; y++) {
          if (this.hasVoxel(startGx + x, groundGy + y, startGz + z)) {
            foundationKeys.push(this.key(startGx + x, groundGy + y, startGz + z));
          }
        }
      }
    }

    const minWx = (startGx - 0.5) * VOXEL_SIZE;
    const maxWx = (startGx + width - 0.5) * VOXEL_SIZE;
    const minWz = (startGz - 0.5) * VOXEL_SIZE;
    const maxWz = (startGz + depth - 0.5) * VOXEL_SIZE;
    const bldRecord = {
      id: this.buildings.length,
      startGx,
      startGz,
      width,
      depth,
      floors,
      wallMat,
      groundGy,
      minWx,
      maxWx,
      minWz,
      maxWz,
      centerWx: (minWx + maxWx) * 0.5,
      centerWz: (minWz + maxWz) * 0.5,
      foundationKeys,
      blueprintBlocks,
      collapsed: false,
      playerBuilt: true,
      variant: isHouse ? 'HOUSE' : 'BUNKER'
    };
    this.buildings.push(bldRecord);
    this._registerSpatialFootprint(bldRecord);

    if (typeof this.spawnDebris === 'function') {
      _fxOrigin.set(bldRecord.centerWx, (groundGy + 1.5) * VOXEL_SIZE, bldRecord.centerWz);
      this.spawnDebris(_fxOrigin, _buildHouseFxColor, 10);
    }

    return {
      ok: true,
      variant: isHouse ? 'HOUSE' : 'BUNKER',
      label: isHouse ? '2-STORY TACTICAL HOUSE' : 'FORTIFIED COMMAND BUNKER',
      blocksBuilt,
      building: bldRecord
    };
  },

  /**
   * Builds a Squad-style Tactical Base Emplacement
   */
  buildSquadEmplacement(
    centerWx,
    centerWz,
    yaw = 0,
    kind = 'HMG_NEST',
    team = 'US',
    vehicleManager = null,
    playerPos = null,
    broadcastFn = null
  ) {
    const normKind = String(kind || 'HMG_NEST').toUpperCase();
    const gCenter = this.worldToGrid(centerWx, this.getGroundHeightAt(centerWx, centerWz), centerWz, _tmpGrid);
    const centerGx = gCenter.gx;
    const centerGz = gCenter.gz;
    const groundGy = this.getBaseGy(centerGx, centerGz);
    const fwdGx = Math.round(-Math.sin(yaw));
    const fwdGz = Math.round(-Math.cos(yaw));
    const alongX = Math.abs(Math.cos(yaw)) >= Math.abs(Math.sin(yaw));
    const dx = alongX ? 1 : 0;
    const dz = alongX ? 0 : 1;

    let blocksBuilt = 0;
    const addEmpVoxel = (gx, gy, gz, mat = 'sandbag') => {
      if (playerPos) {
        const wx = gx * VOXEL_SIZE;
        const wz = gz * VOXEL_SIZE;
        if (Math.abs(wx - playerPos.x) < 1.35 && Math.abs(wz - playerPos.z) < 1.35) {
          return false;
        }
      }
      if (this.addVoxel(gx, gy, gz, mat, false, true)) {
        blocksBuilt++;
        if (broadcastFn) {
          broadcastFn({ type: 'voxel_add', gx, gy, gz, mat });
        }
        return true;
      }
      return false;
    };

    if (normKind.includes('COVERED')) {
      for (const s of [-1, 0, 1]) {
        const fx = centerGx + dx * s + fwdGx;
        const fz = centerGz + dz * s + fwdGz;
        addEmpVoxel(fx, groundGy, fz, 'sandbag');
        if (Math.abs(s) === 1) {
          addEmpVoxel(fx, groundGy + 1, fz, 'darkConcrete');
          addEmpVoxel(centerGx + dx * s, groundGy, centerGz + dz * s, 'sandbag');
          addEmpVoxel(centerGx + dx * s, groundGy + 1, centerGz + dz * s, 'sandbag');
        }
        addEmpVoxel(fx, groundGy + 2, fz, 'darkConcrete');
        addEmpVoxel(centerGx + dx * s, groundGy + 2, centerGz + dz * s, 'wood');
      }
    } else {
      for (let ox = -2; ox <= 2; ox++) {
        for (let oz = -2; oz <= 2; oz++) {
          const isRing = Math.abs(ox) === 2 || Math.abs(oz) === 2;
          if (!isRing) continue;
          if (ox * fwdGx + oz * fwdGz < -1) continue;
          const gx = centerGx + ox;
          const gz = centerGz + oz;
          const mat = Math.abs(ox) === 2 && Math.abs(oz) === 2 ? 'darkConcrete' : 'sandbag';
          addEmpVoxel(gx, groundGy, gz, mat);
        }
      }
    }

    let spawnedVehicle = null;
    const vm = vehicleManager || window.game?.vehicleManager || null;
    if (vm && typeof vm.spawnEmplacement === 'function' && !normKind.includes('COVERED')) {
      const emplaceType = normKind.includes('AA')
        ? 'emplace_aa'
        : normKind.includes('MORTAR')
        ? 'emplace_mortar'
        : 'emplace_hmg';
      const worldCenter = new THREE.Vector3(
        centerGx * VOXEL_SIZE,
        this.getGroundHeightAt(centerGx * VOXEL_SIZE, centerGz * VOXEL_SIZE),
        centerGz * VOXEL_SIZE
      );
      spawnedVehicle = vm.spawnEmplacement(emplaceType, team, worldCenter, yaw);
    }

    if (typeof this.spawnDebris === 'function') {
      _fxOrigin.set(centerGx * VOXEL_SIZE, (groundGy + 1.2) * VOXEL_SIZE, centerGz * VOXEL_SIZE);
      this.spawnDebris(_fxOrigin, _repairFxColor, 8);
    }

    return {
      ok: true,
      kind: normKind,
      blocksBuilt,
      vehicle: spawnedVehicle
    };
  }
};
