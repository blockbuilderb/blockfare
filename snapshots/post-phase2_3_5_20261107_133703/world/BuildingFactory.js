import * as THREE from '../../vendor/three.module.js';

const VOXEL_SIZE = 1.25;

export const BuildingFactory = {
  /**
   * Returns true if world coordinate (wx, wz) lies inside or within `padMeters` of any
   * standing multi-story building footprint or shipping container.
   */
  isInsideBuildingOrContainer(wx, wz, padMeters = 1.2) {
    for (let i = 0; i < this.buildings.length; i++) {
      const b = this.buildings[i];
      if (b.collapsed) continue;
      const minX = (b.startGx - 0.5) * VOXEL_SIZE - padMeters;
      const maxX = (b.startGx + b.width - 0.5) * VOXEL_SIZE + padMeters;
      const minZ = (b.startGz - 0.5) * VOXEL_SIZE - padMeters;
      const maxZ = (b.startGz + b.depth - 0.5) * VOXEL_SIZE + padMeters;
      if (wx >= minX && wx <= maxX && wz >= minZ && wz <= maxZ) {
        return true;
      }
    }
    if (this.containers) {
      for (let i = 0; i < this.containers.length; i++) {
        const c = this.containers[i];
        const minX = (c.startGx - 0.5) * VOXEL_SIZE - padMeters;
        const maxX = (c.startGx + c.maxX - 0.5) * VOXEL_SIZE + padMeters;
        const minZ = (c.startGz - 0.5) * VOXEL_SIZE - padMeters;
        const maxZ = (c.startGz + c.maxZ - 0.5) * VOXEL_SIZE + padMeters;
        if (wx >= minX && wx <= maxX && wz >= minZ && wz <= maxZ) {
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

    for (let ring = 0; ring <= 22; ring++) {
      const samples = ring === 0 ? 1 : ring * 10;
      for (let i = 0; i < samples; i++) {
        const angle = (i / samples) * Math.PI * 2;
        const dist = ring * 1.6;
        const tx = baseX + Math.cos(angle) * dist;
        const tz = baseZ + Math.sin(angle) * dist;
        if (Math.abs(tx) < 19 && Math.abs(tz) > 8 && Math.abs(tz - 110) > 8 && Math.abs(tz + 110) > 8) {
          continue; // Never spawn inside the sunken river water
        }
        if (this.isInsideBuildingOrContainer(tx, tz, 1.8)) {
          continue; // Never spawn inside a building room or container
        }

        const ty = this.getGroundHeightAt(tx, tz);
        const g = this.worldToGrid(tx, ty + 0.25, tz);

        let clear = true;
        for (let dx = -1; dx <= 1 && clear; dx++) {
          for (let dz = -1; dz <= 1 && clear; dz++) {
            for (let dy = 0; dy <= 3; dy++) {
              if (this.voxels.has(this.key(g.gx + dx, g.gy + dy, g.gz + dz))) {
                clear = false;
                break;
              }
            }
          }
        }
        if (clear) {
          return new THREE.Vector3(tx, ty, tz);
        }
      }
    }
    const fy = this.getGroundHeightAt(baseX, baseZ);
    return new THREE.Vector3(baseX, fy, baseZ);
  },

  buildApartmentBlock(startGx, startGz, width, depth, floors = 3, wallMat = 'brick') {
    const groundGy = this.getBaseGy(startGx + Math.floor(width / 2), startGz + Math.floor(depth / 2));
    const floorHeight = 4;

    for (let f = 0; f < floors; f++) {
      const baseGy = groundGy + f * floorHeight;

      for (let x = 0; x < width; x++) {
        for (let z = 0; z < depth; z++) {
          const gx = startGx + x;
          const gz = startGz + z;
          const isEdgeX = x === 0 || x === width - 1;
          const isEdgeZ = z === 0 || z === depth - 1;
          const isWall = isEdgeX || isEdgeZ;

          const isStairCutout = x >= 1 && x <= 2 && z >= 1 && z <= 4;
          if (!isStairCutout) {
            this.addVoxel(gx, baseGy + floorHeight - 1, gz, 'concrete');
          }

          if (!isWall) continue;

          for (let y = 0; y < floorHeight - 1; y++) {
            const gy = baseGy + y;

            // Wide 2-block open doorways on all 4 ground-floor sides so nobody gets trapped inside!
            const isDoor =
              f === 0 &&
              y < 2 &&
              (((z === 0 || z === depth - 1) && Math.abs(x - Math.floor(width / 2)) <= 1) ||
                ((x === 0 || x === width - 1) && Math.abs(z - Math.floor(depth / 2)) <= 1));

            const isWindow =
              y === 1 &&
              isWall &&
              ((isEdgeZ && x > 1 && x < width - 2 && x % 2 === 0 && Math.abs(x - Math.floor(width / 2)) > 1) ||
                (isEdgeX && z > 1 && z < depth - 2 && z % 2 === 0 && Math.abs(z - Math.floor(depth / 2)) > 1));

            if (!isDoor && !isWindow) {
              const mat = y === 0 && f === 0 ? 'darkConcrete' : wallMat;
              this.addVoxel(gx, gy, gz, mat);
            }
          }
        }
      }

      if (width >= 6 && depth >= 6) {
        for (let step = 0; step < floorHeight - 1; step++) {
          const sx = startGx + 1;
          const sz = startGz + 1 + Math.min(step, depth - 3);
          this.addVoxel(sx, baseGy + step, sz, 'wood');
        }
        // Interior bullet-destructible furniture / crates (isProp: true)
        const propX = startGx + width - 2;
        const propZ = startGz + 2;
        this.addVoxel(propX, baseGy, propZ, 'wood', true);
        if (depth >= 7) {
          this.addVoxel(propX, baseGy, propZ + 2, 'wood', true);
        }
      }

      if (f > 0 && width >= 7) {
        for (let bx = 2; bx < width - 2; bx++) {
          this.addVoxel(startGx + bx, baseGy - 1, startGz - 1, 'concrete');
          if (bx === 2 || bx === width - 3 || bx % 2 === 0) {
            this.addVoxel(startGx + bx, baseGy, startGz - 1, 'sandbag');
          }
        }
      }
    }

    const topGy = groundGy + floors * floorHeight;
    for (let x = 0; x < width; x++) {
      for (let z = 0; z < depth; z++) {
        if (x === 0 || x === width - 1 || z === 0 || z === depth - 1) {
          if ((x + z) % 2 === 0) {
            this.addVoxel(startGx + x, topGy, startGz + z, 'darkConcrete');
          }
        }
      }
    }
    // Rooftop HVAC / utility cover + destructible crate
    if (width >= 7 && depth >= 6) {
      this.addVoxel(startGx + Math.floor(width / 2), topGy, startGz + Math.floor(depth / 2), 'darkConcrete');
      this.addVoxel(startGx + Math.floor(width / 2) + 1, topGy, startGz + Math.floor(depth / 2), 'wood', true);
    }

    // Register building foundation keys for BattleBit-style structural collapse tracking
    const foundationKeys = [];
    for (let x = 0; x < width; x++) {
      for (let z = 0; z < depth; z++) {
        for (let y = 0; y <= 1; y++) {
          const fk = this.key(startGx + x, groundGy + y, startGz + z);
          if (this.voxels.has(fk)) {
            foundationKeys.push(fk);
          }
        }
      }
    }
    this.buildings.push({
      startGx,
      startGz,
      width,
      depth,
      floors,
      groundGy,
      foundationKeys,
      collapsed: false
    });
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
      this.containers.push({ startGx, startGz, maxX, maxZ, baseGy });
    }
  },

  buildWatchtower(startGx, startGz) {
    const baseGy = this.getBaseGy(startGx + 1, startGz + 1);
    for (let y = 0; y < 5; y++) {
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
    const group = new THREE.Group();
    const steelMat = new THREE.MeshStandardMaterial({ color: 0xbdc3c7, metalness: 0.6, roughness: 0.4 });
    const redMat = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.5 });

    const mast = new THREE.Mesh(new THREE.BoxGeometry(1.4, 24, 1.4), steelMat);
    mast.position.y = 12;
    mast.castShadow = true;
    group.add(mast);

    const dish = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 0.8, 1.2, 8), redMat);
    dish.rotation.z = Math.PI / 3;
    dish.position.set(1.2, 21, 0);
    group.add(dish);

    group.position.set(wx, wy, wz);
    this.scene.add(group);
  },

  /**
   * Builds progressive Chest-Wall & Firing-Port Defense Emplacements around a captured Objective (A–E)
   * when a player presses [F] inside/near a friendly-held flag!
   * Stage 1: East & West Chest-High Sandbag Breastworks (1.25m chest wall + concrete end pillars)
   * Stage 2: North & South Chest-High Sandbag Breastworks
   * Stage 3: NE & SW Corner Firing-Port Bunkers
   * Stage 4: NW & SE Corner HESCO Bastions & Inner Command Breastwork
   */
  buildPointDefenseStage(flag, broadcastFn = null) {
    if (!flag) return { stage: 0, maxStage: 4, blocksBuilt: 0 };
    const nextStage = Math.min(4, (flag.defenseStage || 0) + 1);
    flag.defenseStage = nextStage;

    const cg = this.worldToGrid(flag.pos.x, flag.pos.y, flag.pos.z);
    const cx = cg.gx;
    const cz = cg.gz;
    let blocksBuilt = 0;

    const placeDefenseBlock = (gx, gyOffset, gz, mat = 'sandbag') => {
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
      // East & West 5-wide Chest-High Sandbag Breastworks (1.25m high so standing soldiers shoot over!)
      for (let dz = -2; dz <= 2; dz++) {
        const mat = Math.abs(dz) === 2 ? 'darkConcrete' : 'sandbag';
        placeDefenseBlock(cx - r, 0, cz + dz, mat);
        placeDefenseBlock(cx + r, 0, cz + dz, mat);
      }
      // Corner end-cap crenels (2 blocks high at the very ends for side cover)
      placeDefenseBlock(cx - r, 1, cz - 2, 'sandbag');
      placeDefenseBlock(cx - r, 1, cz + 2, 'sandbag');
      placeDefenseBlock(cx + r, 1, cz - 2, 'sandbag');
      placeDefenseBlock(cx + r, 1, cz + 2, 'sandbag');
    } else if (nextStage === 2) {
      // North & South 5-wide Chest-High Sandbag Breastworks
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
      // NE & SW Corner L-Shaped Chest-Wall Firing Positions
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
      // NW & SE Corner HESCO Bastions + Flagpole Chest-Wall Guard
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
      // Inner flagpole chest-high sandbag guard
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
  }
};
