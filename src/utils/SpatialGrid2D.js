// ============================================================================
// ZERO-ALLOCATION 2D SPATIAL HASH GRID (src/utils/SpatialGrid2D.js)
// Flat Int32Array / Float32Array intrusive spatial hash for O(1) neighborhood,
// radius, ring-ordered, and nearest-entity queries across 4800m x 3200m maps.
// ============================================================================

export class SpatialGrid2D {
  constructor(
    minX = -2432,
    maxX = 2432,
    minZ = -1632,
    maxZ = 1632,
    cellSize = 32,
    initialCapacity = 384
  ) {
    this.minX = minX;
    this.maxX = maxX;
    this.minZ = minZ;
    this.maxZ = maxZ;
    this.cellSize = cellSize;
    this.invCellSize = 1 / cellSize;
    this.cols = Math.max(1, Math.ceil((maxX - minX) * this.invCellSize));
    this.rows = Math.max(1, Math.ceil((maxZ - minZ) * this.invCellSize));
    this.numCells = this.cols * this.rows;

    this.cellHeads = new Int32Array(this.numCells);
    this.cellHeads.fill(-1);

    this.dirtyCells = new Int32Array(this.numCells);
    this.dirtyCount = 0;

    this.capacity = Math.max(64, initialCapacity | 0);
    this.count = 0;
    this.nextItem = new Int32Array(this.capacity);
    this.itemX = new Float32Array(this.capacity);
    this.itemZ = new Float32Array(this.capacity);
    this.items = new Array(this.capacity);
    this._scratchResults = [];
  }

  _grow() {
    const newCap = this.capacity * 2;
    const next = new Int32Array(newCap);
    next.set(this.nextItem);
    this.nextItem = next;

    const xs = new Float32Array(newCap);
    xs.set(this.itemX);
    this.itemX = xs;

    const zs = new Float32Array(newCap);
    zs.set(this.itemZ);
    this.itemZ = zs;

    this.items.length = newCap;
    this.capacity = newCap;
  }

  clear() {
    const heads = this.cellHeads;
    const dirty = this.dirtyCells;
    const dCount = this.dirtyCount;
    for (let i = 0; i < dCount; i++) {
      heads[dirty[i]] = -1;
    }
    this.dirtyCount = 0;
    const prevCount = this.count;
    const items = this.items;
    for (let i = 0; i < prevCount; i++) {
      items[i] = null;
    }
    this.count = 0;
  }

  _cellCoordX(x) {
    let cx = ((x - this.minX) * this.invCellSize) | 0;
    if (cx < 0) cx = 0;
    else if (cx >= this.cols) cx = this.cols - 1;
    return cx;
  }

  _cellCoordZ(z) {
    let cz = ((z - this.minZ) * this.invCellSize) | 0;
    if (cz < 0) cz = 0;
    else if (cz >= this.rows) cz = this.rows - 1;
    return cz;
  }

  insert(x, z, item) {
    const id = this.count;
    if (id >= this.capacity) this._grow();
    this.count = id + 1;

    const cx = this._cellCoordX(x);
    const cz = this._cellCoordZ(z);
    const cellIdx = cz * this.cols + cx;

    const prevHead = this.cellHeads[cellIdx];
    if (prevHead === -1) {
      this.dirtyCells[this.dirtyCount++] = cellIdx;
    }
    this.nextItem[id] = prevHead;
    this.cellHeads[cellIdx] = id;
    this.itemX[id] = x;
    this.itemZ[id] = z;
    this.items[id] = item;
    return id;
  }

  /**
   * Zero-allocation iteration over all items within `radius` of `(x, z)` in XZ plane.
   * Returning `false` strictly from `callback(item, distSq, dx, dz)` aborts early.
   */
  forEachInRadius(x, z, radius, callback) {
    if (this.count === 0 || radius <= 0) return;
    const minCx = this._cellCoordX(x - radius);
    const maxCx = this._cellCoordX(x + radius);
    const minCz = this._cellCoordZ(z - radius);
    const maxCz = this._cellCoordZ(z + radius);
    const rSq = radius * radius;

    const cols = this.cols;
    const heads = this.cellHeads;
    const next = this.nextItem;
    const xs = this.itemX;
    const zs = this.itemZ;
    const items = this.items;

    for (let cz = minCz; cz <= maxCz; cz++) {
      const rowOffset = cz * cols;
      for (let cx = minCx; cx <= maxCx; cx++) {
        let id = heads[rowOffset + cx];
        while (id !== -1) {
          const dx = xs[id] - x;
          const dz = zs[id] - z;
          const dSq = dx * dx + dz * dz;
          if (dSq <= rSq) {
            if (callback(items[id], dSq, dx, dz) === false) return;
          }
          id = next[id];
        }
      }
    }
  }

  /**
   * Zero-allocation iteration over all items whose cell overlaps the AABB
   * `[minX..maxX] x [minZ..maxZ]` and whose XZ coordinates lie inside that box.
   */
  forEachInAABB(boxMinX, boxMaxX, boxMinZ, boxMaxZ, callback) {
    if (this.count === 0) return;
    const minCx = this._cellCoordX(boxMinX);
    const maxCx = this._cellCoordX(boxMaxX);
    const minCz = this._cellCoordZ(boxMinZ);
    const maxCz = this._cellCoordZ(boxMaxZ);

    const cols = this.cols;
    const heads = this.cellHeads;
    const next = this.nextItem;
    const xs = this.itemX;
    const zs = this.itemZ;
    const items = this.items;

    for (let cz = minCz; cz <= maxCz; cz++) {
      const rowOffset = cz * cols;
      for (let cx = minCx; cx <= maxCx; cx++) {
        let id = heads[rowOffset + cx];
        while (id !== -1) {
          const ix = xs[id];
          const iz = zs[id];
          if (ix >= boxMinX && ix <= boxMaxX && iz >= boxMinZ && iz <= boxMaxZ) {
            if (callback(items[id], ix, iz) === false) return;
          }
          id = next[id];
        }
      }
    }
  }

  /**
   * Iterates concentric Chebyshev rings outward from `(x, z)` up to `maxRadius`.
   * Visits close-range entities first so raycast-budgeted scans never starve close threats.
   * Returning `false` strictly from `callback(item, distSq, dx, dz)` aborts early.
   */
  forEachRingOrder(x, z, maxRadius, callback) {
    if (this.count === 0 || maxRadius <= 0) return;
    const cx0 = this._cellCoordX(x);
    const cz0 = this._cellCoordZ(z);
    const maxRing = Math.ceil(maxRadius * this.invCellSize) | 0;
    const rSq = maxRadius * maxRadius;

    const cols = this.cols;
    const rows = this.rows;
    const heads = this.cellHeads;
    const next = this.nextItem;
    const xs = this.itemX;
    const zs = this.itemZ;
    const items = this.items;

    const visitCell = (cx, cz) => {
      let id = heads[cz * cols + cx];
      while (id !== -1) {
        const dx = xs[id] - x;
        const dz = zs[id] - z;
        const dSq = dx * dx + dz * dz;
        if (dSq <= rSq) {
          if (callback(items[id], dSq, dx, dz) === false) return false;
        }
        id = next[id];
      }
      return true;
    };

    if (!visitCell(cx0, cz0)) return;

    for (let ring = 1; ring <= maxRing; ring++) {
      const minCx = cx0 - ring;
      const maxCx = cx0 + ring;
      const minCz = cz0 - ring;
      const maxCz = cz0 + ring;

      const clampedMinCx = minCx < 0 ? 0 : minCx;
      const clampedMaxCx = maxCx >= cols ? cols - 1 : maxCx;

      // Top & bottom horizontal edges of the ring
      if (minCz >= 0) {
        for (let cx = clampedMinCx; cx <= clampedMaxCx; cx++) {
          if (!visitCell(cx, minCz)) return;
        }
      }
      if (maxCz < rows) {
        for (let cx = clampedMinCx; cx <= clampedMaxCx; cx++) {
          if (!visitCell(cx, maxCz)) return;
        }
      }

      // Left & right vertical edges (excluding corners already visited above)
      const innerMinCz = minCz + 1 < 0 ? 0 : minCz + 1;
      const innerMaxCz = maxCz - 1 >= rows ? rows - 1 : maxCz - 1;
      if (minCx >= 0) {
        for (let cz = innerMinCz; cz <= innerMaxCz; cz++) {
          if (!visitCell(minCx, cz)) return;
        }
      }
      if (maxCx < cols) {
        for (let cz = innerMinCz; cz <= innerMaxCz; cz++) {
          if (!visitCell(maxCx, cz)) return;
        }
      }
    }
  }

  /**
   * Finds the single closest item within `maxRadius` matching optional `filterFn(item, distSq)`.
   * Terminates ring expansion as soon as outer rings cannot beat `bestDistSq`.
   */
  findNearest(x, z, maxRadius, filterFn = null) {
    if (this.count === 0 || maxRadius <= 0) return null;
    const cx0 = this._cellCoordX(x);
    const cz0 = this._cellCoordZ(z);
    const maxRing = Math.ceil(maxRadius * this.invCellSize) | 0;
    let bestDistSq = maxRadius * maxRadius;
    let bestItem = null;

    const cols = this.cols;
    const rows = this.rows;
    const heads = this.cellHeads;
    const next = this.nextItem;
    const xs = this.itemX;
    const zs = this.itemZ;
    const items = this.items;
    const cellSize = this.cellSize;

    const checkCell = (cx, cz) => {
      let id = heads[cz * cols + cx];
      while (id !== -1) {
        const dx = xs[id] - x;
        const dz = zs[id] - z;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestDistSq) {
          const item = items[id];
          if (!filterFn || filterFn(item, dSq)) {
            bestDistSq = dSq;
            bestItem = item;
          }
        }
        id = next[id];
      }
    };

    checkCell(cx0, cz0);

    for (let ring = 1; ring <= maxRing; ring++) {
      if (bestItem !== null && ring >= 2) {
        const minPossibleDist = (ring - 1) * cellSize;
        if (minPossibleDist * minPossibleDist >= bestDistSq) break;
      }

      const minCx = cx0 - ring;
      const maxCx = cx0 + ring;
      const minCz = cz0 - ring;
      const maxCz = cz0 + ring;

      const clampedMinCx = minCx < 0 ? 0 : minCx;
      const clampedMaxCx = maxCx >= cols ? cols - 1 : maxCx;

      if (minCz >= 0) {
        for (let cx = clampedMinCx; cx <= clampedMaxCx; cx++) checkCell(cx, minCz);
      }
      if (maxCz < rows) {
        for (let cx = clampedMinCx; cx <= clampedMaxCx; cx++) checkCell(cx, maxCz);
      }

      const innerMinCz = minCz + 1 < 0 ? 0 : minCz + 1;
      const innerMaxCz = maxCz - 1 >= rows ? rows - 1 : maxCz - 1;
      if (minCx >= 0) {
        for (let cz = innerMinCz; cz <= innerMaxCz; cz++) checkCell(minCx, cz);
      }
      if (maxCx < cols) {
        for (let cz = innerMinCz; cz <= innerMaxCz; cz++) checkCell(maxCx, cz);
      }
    }

    return bestItem;
  }

  queryRadius(x, z, radius, outArray = this._scratchResults) {
    outArray.length = 0;
    this.forEachInRadius(x, z, radius, (item) => {
      outArray.push(item);
    });
    return outArray;
  }
}
