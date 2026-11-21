import * as THREE from '../vendor/three.module.js';
import { TEXTURES } from './textures.js?v=15';
import { sound } from './audio.js?v=15';

export const VOXEL_SIZE = 1.25;

const MAT_DEFS = {
  brick: { hp: 90, color: 0xd97f6c, map: 'brick', roughness: 0.9, maxInstances: 14000 },
  concrete: { hp: 130, color: 0xcfd6dd, map: 'concrete', roughness: 0.85, maxInstances: 14000 },
  darkConcrete: { hp: 165, color: 0x828c96, map: 'darkConcrete', roughness: 0.85, maxInstances: 10000 },
  sandbag: { hp: 85, color: 0xdfd0a8, map: 'sandbag', roughness: 0.95, maxInstances: 8000 },
  wood: { hp: 55, color: 0xc89666, map: 'wood', roughness: 0.9, maxInstances: 6000 },
  containerRed: { hp: 150, color: 0xc0392b, map: 'container', roughness: 0.65, maxInstances: 3000 },
  containerBlue: { hp: 150, color: 0x2980b9, map: 'container', roughness: 0.65, maxInstances: 3000 },
  containerOlive: { hp: 150, color: 0x556b2f, map: 'container', roughness: 0.65, maxInstances: 3000 }
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
    this.onBuildingCollapsed = null;

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
        captureProgress: 100,
        radius: 22,
        bannerMesh: null,
        zoneMesh: null
      },
      {
        id: 'B',
        name: 'OBJ BRAVO — LOGISTICS CONTAINER YARD',
        pos: new THREE.Vector3(-95, this.getTerrainHeight(-95, 85), 85),
        owner: 'US',
        captureProgress: 80,
        radius: 22,
        bannerMesh: null,
        zoneMesh: null
      },
      {
        id: 'C',
        name: 'OBJ CHARLIE — RIVER CITY BRIDGE PLAZA',
        pos: new THREE.Vector3(0, this.getGroundHeightAt(0, 0), 0),
        owner: 'NEUTRAL',
        captureProgress: 0,
        radius: 24,
        bannerMesh: null,
        zoneMesh: null
      },
      {
        id: 'D',
        name: 'OBJ DELTA — RADAR HILL GARRISON',
        pos: new THREE.Vector3(105, this.getTerrainHeight(105, -85), -85),
        owner: 'RU',
        captureProgress: -80,
        radius: 22,
        bannerMesh: null,
        zoneMesh: null
      },
      {
        id: 'E',
        name: 'OBJ ECHO — EAST INDUSTRIAL SECTOR',
        pos: new THREE.Vector3(195, this.getTerrainHeight(195, 70), 70),
        owner: 'RU',
        captureProgress: -100,
        radius: 22,
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
    this.weatherTimer = 120 + Math.random() * 180; // First weather event in 2-5 minutes
    this.weatherDuration = 0;
    this.fogDensityBase = 0.0014;
    this.weatherParticles = [];
  }

  /**
   * Expansive 920m x 660m 3D Terrain Heightmap with rolling hills, flanking ridges,
   * perimeter mountain ranges, sunken river canyon, and graded urban plateaus.
   */
  getTerrainHeight(x, z) {
    // Broad rolling valley hills + secondary tactical ridges
    let h =
      Math.sin(x * 0.013) * Math.cos(z * 0.015) * 5.2 +
      Math.sin(x * 0.032 + z * 0.028) * 2.1 +
      Math.cos(x * 0.008 - z * 0.011) * 3.4;

    // Perimeter Alpine mountain ranges framing the 920m x 660m valley
    const edgeX = Math.max(0, (Math.abs(x) - 340) / 65);
    const edgeZ = Math.max(0, (Math.abs(z) - 210) / 55);
    h += (edgeX * edgeX + edgeZ * edgeZ) * 28.0;

    // Smooth blend toward graded urban plateaus
    for (const pad of this.gradedPads) {
      const dx = (x - pad.x) / pad.rx;
      const dz = (z - pad.z) / pad.rz;
      const distSq = dx * dx + dz * dz;
      if (distSq < 1.8) {
        const weight = Math.max(0, 1 - distSq / 1.8);
        const smoothW = weight * weight * (3 - 2 * weight);
        h = THREE.MathUtils.lerp(h, pad.h, smoothW);
      }
    }

    // Main East-West Highway corridor grading (z around 0) & North/South avenues
    const roadDist = Math.abs(z) / 11.5;
    if (roadDist < 1.4 && Math.abs(x) > 16) {
      const rw = Math.max(0, 1 - roadDist / 1.4);
      const roadTargetH = 1.25 + Math.sin(x * 0.012) * 1.1;
      h = THREE.MathUtils.lerp(h, roadTargetH, rw * 0.85);
    }

    // North-South River Gorge carving through x = 0 (with natural S-bend)
    const riverCenterX = Math.sin(z * 0.016) * 6.5;
    const distFromRiver = Math.abs(x - riverCenterX);
    if (distFromRiver < 20) {
      const rw = 1 - distFromRiver / 20;
      const gorgeDepth = -2.8 * (rw * rw);
      h = THREE.MathUtils.lerp(h, gorgeDepth, rw);
    }

    return h;
  }

  /**
   * Returns walkable surface height including the 3 grand bridges over the river canyon.
   */
  getGroundHeightAt(x, z) {
    // Check if on one of the 3 fortified river bridges (z = -110, 0, +110)
    if (Math.abs(x) <= 21.0) {
      for (const bz of [-110, 0, 110]) {
        if (Math.abs(z - bz) <= 8.5) {
          return 1.15; // Bridge deck height above river
        }
      }
    }
    return this.getTerrainHeight(x, z);
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

  addVoxel(gx, gy, gz, type = 'brick', isProp = false) {
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
      instanceId,
      hp: isProp ? 35 : batch.def.hp,
      maxHp: isProp ? 35 : batch.def.hp,
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
        const c = voxel.baseColor.clone().multiplyScalar(0.38 + 0.62 * ratio);
        batch.mesh.setColorAt(voxel.instanceId, c);
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
   * Structural Integrity & Gravity Collapse Solver:
   * Propagates load-bearing support from ground-anchored voxels upward (cost 0)
   * and across limited horizontal cantilevers/lintels (max span 3).
   * Any upper blocks or building sections that lose their vertical support
   * collapse under gravity instead of floating in mid-air!
   */
  checkStructuralIntegrity(centerGx, centerGy, centerGz, radius = 8, broadcastFn = null) {
    const MAX_SPAN = 3;
    const minGx = centerGx - radius;
    const maxGx = centerGx + radius;
    const minGz = centerGz - radius;
    const maxGz = centerGz + radius;

    const localVoxels = [];
    const spanMap = new Map(); // key -> min cantilever span distance from ground pillar
    const queue = [];

    for (let gx = minGx; gx <= maxGx; gx++) {
      for (let gz = minGz; gz <= maxGz; gz++) {
        const groundGy = this.getBaseGy(gx, gz);
        for (let gy = -1; gy <= 18; gy++) {
          const k = this.key(gx, gy, gz);
          const v = this.voxels.get(k);
          if (!v) continue;
          localVoxels.push(v);

          // Ground-contact voxels or boundary anchor voxels start with span = 0
          const isBoundary =
            gx === minGx || gx === maxGx || gz === minGz || gz === maxGz;
          if (gy <= groundGy || (isBoundary && this.voxels.has(this.key(gx, gy - 1, gz)))) {
            spanMap.set(k, 0);
            queue.push(v);
          }
        }
      }
    }

    if (localVoxels.length === 0) return 0;

    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++];
      const curSpan = spanMap.get(cur.key);

      // 6-neighbors: Up, Left/Right/Front/Back, Down
      const neighbors = [
        // Straight up: vertical pillar carries load with 0 extra span if curSpan === 0, else +1
        { gx: cur.gx, gy: cur.gy + 1, gz: cur.gz, cost: curSpan === 0 ? 0 : 1 },
        // Horizontal cantilevers (floors, lintels, arches) add +1 span
        { gx: cur.gx + 1, gy: cur.gy, gz: cur.gz, cost: 1 },
        { gx: cur.gx - 1, gy: cur.gy, gz: cur.gz, cost: 1 },
        { gx: cur.gx, gy: cur.gy, gz: cur.gz + 1, cost: 1 },
        { gx: cur.gx, gy: cur.gy, gz: cur.gz - 1, cost: 1 },
        // Downward hanging costs +2 so walls cannot hang upside-down from roofs!
        { gx: cur.gx, gy: cur.gy - 1, gz: cur.gz, cost: 2 }
      ];

      for (const n of neighbors) {
        const nextSpan = curSpan + n.cost;
        if (nextSpan > MAX_SPAN) continue;

        const nk = this.key(n.gx, n.gy, n.gz);
        const nv = this.voxels.get(nk);
        if (!nv) continue;

        const prevBest = spanMap.get(nk);
        if (prevBest === undefined || nextSpan < prevBest) {
          spanMap.set(nk, nextSpan);
          queue.push(nv);
        }
      }
    }

    // Any local voxel not reached within MAX_SPAN has lost structural support -> COLLAPSE!
    let collapsed = 0;
    for (const v of localVoxels) {
      if (!spanMap.has(v.key)) {
        this.destroyVoxel(v.gx, v.gy, v.gz, false, true);
        if (broadcastFn) {
          broadcastFn({ type: 'voxel_destroy', gx: v.gx, gy: v.gy, gz: v.gz });
        }
        collapsed++;
      }
    }

    // Check if any multi-story building near the breach lost >55% of its foundation walls
    collapsed += this.checkBuildingClusterCollapse(centerGx, centerGz, broadcastFn);

    return collapsed;
  }

  /**
   * BattleBit-style Building Cluster Collapse:
   * When >55% of a building's ground-floor load-bearing walls are destroyed,
   * the entire upper structure cascades down into rubble!
   */
  checkBuildingClusterCollapse(centerGx, centerGz, broadcastFn = null) {
    let totalCollapsed = 0;
    for (const bld of this.buildings) {
      if (bld.collapsed) continue;
      if (
        centerGx < bld.startGx - 6 ||
        centerGx > bld.startGx + bld.width + 6 ||
        centerGz < bld.startGz - 6 ||
        centerGz > bld.startGz + bld.depth + 6
      ) {
        continue;
      }

      let remainingFoundation = 0;
      for (const k of bld.foundationKeys) {
        if (this.voxels.has(k)) remainingFoundation++;
      }

      const ratio = bld.foundationKeys.length > 0 ? remainingFoundation / bld.foundationKeys.length : 1;
      if (ratio <= 0.45) {
        bld.collapsed = true;
        totalCollapsed += this.triggerBuildingCollapse(bld, broadcastFn);
      }
    }
    return totalCollapsed;
  }

  triggerBuildingCollapse(bld, broadcastFn = null) {
    let collapsedCount = 0;
    const topGy = bld.groundGy + bld.floors * 4 + 1;

    for (let gx = bld.startGx - 1; gx <= bld.startGx + bld.width; gx++) {
      for (let gz = bld.startGz - 1; gz <= bld.startGz + bld.depth; gz++) {
        for (let gy = bld.groundGy + 1; gy <= topGy; gy++) {
          if (this.voxels.has(this.key(gx, gy, gz))) {
            // Spawn falling block for every ~3rd voxel to keep FPS high during massive collapse
            const spawnFall = (gx + gy + gz) % 3 === 0;
            this.destroyVoxel(gx, gy, gz, false, spawnFall);
            if (broadcastFn) {
              broadcastFn({ type: 'voxel_destroy', gx, gy, gz });
            }
            collapsedCount++;
          }
        }
        // Leave intermittent low rubble piles on ground floor
        if (
          gx >= bld.startGx &&
          gx < bld.startGx + bld.width &&
          gz >= bld.startGz &&
          gz < bld.startGz + bld.depth &&
          (gx * 7 + gz * 13) % 5 === 0 &&
          !this.voxels.has(this.key(gx, bld.groundGy, gz))
        ) {
          this.addVoxel(gx, bld.groundGy, gz, 'darkConcrete');
        }
      }
    }

    const centerWorld = new THREE.Vector3(
      (bld.startGx + bld.width * 0.5) * VOXEL_SIZE,
      (bld.groundGy + 2) * VOXEL_SIZE,
      (bld.startGz + bld.depth * 0.5) * VOXEL_SIZE
    );
    this.spawnExplosionVisual(centerWorld, Math.max(bld.width, bld.depth) * VOXEL_SIZE * 0.55);
    sound.playExplosion(0);

    if (this.onBuildingCollapsed) {
      const collapseRadius = Math.max(bld.width, bld.depth) * VOXEL_SIZE * 0.65;
      this.onBuildingCollapsed(centerWorld, collapseRadius, collapsedCount);
    }

    return collapsedCount;
  }

  spawnFallingBlock(origin, color) {
    if (this.debrisParticles.length > 180) {
      this.spawnDebris(origin, color, 1);
      return;
    }
    const geo = new THREE.BoxGeometry(VOXEL_SIZE * 0.88, VOXEL_SIZE * 0.88, VOXEL_SIZE * 0.88);
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.9,
      flatShading: true
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(origin);
    mesh.castShadow = true;
    this.scene.add(mesh);

    this.debrisParticles.push({
      mesh,
      vel: new THREE.Vector3(
        (Math.random() - 0.5) * 3.5,
        -1.5 - Math.random() * 2,
        (Math.random() - 0.5) * 3.5
      ),
      rotVel: new THREE.Vector3(
        (Math.random() - 0.5) * 3,
        (Math.random() - 0.5) * 3,
        (Math.random() - 0.5) * 3
      ),
      life: 1.6 + Math.random() * 0.6
    });
  }

  /**
   * Fast 3D Voxel + Sculpted Terrain Raycast (up to 420m across the valley)
   */
  raycastVoxel(origin, dir, maxDist = 420) {
    const stepSize = VOXEL_SIZE * 0.35;
    const steps = Math.ceil(maxDist / stepSize);
    let prevGx = null;
    let prevGy = null;
    let prevGz = null;

    for (let i = 1; i <= steps; i++) {
      const dist = i * stepSize;
      const px = origin.x + dir.x * dist;
      const py = origin.y + dir.y * dist;
      const pz = origin.z + dir.z * dist;

      const groundH = this.getGroundHeightAt(px, pz);
      if (py <= groundH) {
        return {
          voxel: null,
          isGround: true,
          distance: dist,
          point: new THREE.Vector3(px, groundH, pz),
          normal: new THREE.Vector3(0, 1, 0)
        };
      }

      const gx = Math.round(px / VOXEL_SIZE);
      const gy = Math.floor(py / VOXEL_SIZE);
      const gz = Math.round(pz / VOXEL_SIZE);

      if (gx === prevGx && gy === prevGy && gz === prevGz) continue;

      const v = this.voxels.get(this.key(gx, gy, gz));
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

      prevGx = gx;
      prevGy = gy;
      prevGz = gz;
    }
    return null;
  }

  explodeAt(worldPos, radius = 4.6, maxDamage = 210, onEntityDamage = null, broadcastFn = null) {
    const gCenter = this.worldToGrid(worldPos.x, worldPos.y, worldPos.z);
    const gRad = Math.ceil(radius / VOXEL_SIZE) + 1;
    let destroyedCount = 0;

    for (let dx = -gRad; dx <= gRad; dx++) {
      for (let dy = -gRad; dy <= gRad; dy++) {
        for (let dz = -gRad; dz <= gRad; dz++) {
          const gx = gCenter.gx + dx;
          const gy = gCenter.gy + dy;
          const gz = gCenter.gz + dz;
          const v = this.voxels.get(this.key(gx, gy, gz));
          if (!v) continue;

          const dist = v.pos.distanceTo(worldPos);
          if (dist <= radius) {
            const falloff = 1 - dist / (radius + 0.6);
            if (this.damageVoxel(gx, gy, gz, maxDamage * falloff * 1.45, broadcastFn, true)) {
              destroyedCount++;
            }
          }
        }
      }
    }

    if (destroyedCount > 0) {
      const collapsed = this.checkStructuralIntegrity(
        gCenter.gx,
        gCenter.gy,
        gCenter.gz,
        9,
        broadcastFn
      );
      destroyedCount += collapsed;
    }

    this.spawnExplosionVisual(worldPos, radius);

    if (onEntityDamage) {
      onEntityDamage(worldPos, radius, maxDamage, destroyedCount);
    }
  }

  /** Airstrike area damage — damages voxels in radius without visual explosion per-hit */
  damageAreaVoxels(worldPos, radius = 7, maxDamage = 140) {
    const gCenter = this.worldToGrid(worldPos.x, worldPos.y, worldPos.z);
    const gRad = Math.ceil(radius / VOXEL_SIZE) + 1;
    let destroyed = 0;

    for (let dx = -gRad; dx <= gRad; dx++) {
      for (let dy = -gRad; dy <= gRad; dy++) {
        for (let dz = -gRad; dz <= gRad; dz++) {
          const gx = gCenter.gx + dx;
          const gy = gCenter.gy + dy;
          const gz = gCenter.gz + dz;
          const v = this.voxels.get(this.key(gx, gy, gz));
          if (!v) continue;
          const dist = v.pos.distanceTo(worldPos);
          if (dist <= radius) {
            const falloff = 1 - dist / (radius + 0.5);
            if (this.damageVoxel(gx, gy, gz, maxDamage * falloff, null, true)) {
              destroyed++;
            }
          }
        }
      }
    }

    if (destroyed > 0) {
      this.checkStructuralIntegrity(gCenter.gx, gCenter.gy, gCenter.gz, 10, null);
    }
    this.spawnExplosionVisual(worldPos, radius * 0.8);
  }

  spawnDebris(origin, color, count = 4) {
    if (this.debrisParticles.length > 140) return;
    const geo = new THREE.BoxGeometry(0.32, 0.32, 0.32);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.85,
        flatShading: true
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(origin).add(
        new THREE.Vector3(
          (Math.random() - 0.5) * 0.8,
          (Math.random() - 0.5) * 0.8,
          (Math.random() - 0.5) * 0.8
        )
      );
      this.scene.add(mesh);
      this.debrisParticles.push({
        mesh,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 13,
          3.5 + Math.random() * 8,
          (Math.random() - 0.5) * 13
        ),
        rotVel: new THREE.Vector3(
          Math.random() * 9,
          Math.random() * 9,
          Math.random() * 9
        ),
        life: 1.2 + Math.random() * 0.7
      });
    }
  }

  /**
   * Pinpoint bullet impact flash + tiny surface chip at the exact raycast hit point
   * (zero random position offset so impacts match the ADS aiming dot pixel-for-pixel).
   */
  spawnBulletImpact(hitPoint, normal, color) {
    if (this.debrisParticles.length > 160) return;

    // 1. Stationary pinpoint spark at exact hit coordinate
    const sparkGeo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
    const sparkMat = new THREE.MeshBasicMaterial({
      color: 0xffeaa7,
      transparent: true,
      opacity: 0.95
    });
    const sparkMesh = new THREE.Mesh(sparkGeo, sparkMat);
    sparkMesh.position.copy(hitPoint);
    if (normal) {
      sparkMesh.position.addScaledVector(normal, 0.04);
    }
    this.scene.add(sparkMesh);
    this.debrisParticles.push({
      mesh: sparkMesh,
      vel: new THREE.Vector3(0, 0, 0),
      rotVel: new THREE.Vector3(8, 8, 8),
      life: 0.11,
      isFlash: true
    });

    // 2. Tiny surface chip bouncing out from exact hit point
    const chipGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    const chipMat = new THREE.MeshStandardMaterial({
      color: color || 0x95a5a6,
      roughness: 0.85,
      flatShading: true
    });
    const chipMesh = new THREE.Mesh(chipGeo, chipMat);
    chipMesh.position.copy(sparkMesh.position);
    this.scene.add(chipMesh);
    const n = normal || new THREE.Vector3(0, 1, 0);
    this.debrisParticles.push({
      mesh: chipMesh,
      vel: new THREE.Vector3(
        n.x * 3.2 + (Math.random() - 0.5) * 2.2,
        Math.max(1.5, n.y * 3.2) + Math.random() * 2.5,
        n.z * 3.2 + (Math.random() - 0.5) * 2.2
      ),
      rotVel: new THREE.Vector3(9, 9, 9),
      life: 0.55
    });
  }

  spawnExplosionVisual(pos, radius) {
    const flashGeo = new THREE.BoxGeometry(radius * 0.95, radius * 0.95, radius * 0.95);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xff9f1a,
      transparent: true,
      opacity: 0.92
    });
    const flashMesh = new THREE.Mesh(flashGeo, flashMat);
    flashMesh.position.copy(pos);
    this.scene.add(flashMesh);

    this.debrisParticles.push({
      mesh: flashMesh,
      vel: new THREE.Vector3(0, 1.8, 0),
      rotVel: new THREE.Vector3(3, 3, 3),
      life: 0.26,
      isFlash: true
    });

    this.spawnDebris(pos, new THREE.Color(0x2d3436), 7);
    this.spawnDebris(pos, new THREE.Color(0xe67e22), 5);
  }

  /**
   * Helper to get integer voxel Y floor corresponding to terrain at grid (gx, gz)
   */
  getBaseGy(gx, gz) {
    const wx = gx * VOXEL_SIZE;
    const wz = gz * VOXEL_SIZE;
    return Math.max(0, Math.floor((this.getGroundHeightAt(wx, wz) + 0.08) / VOXEL_SIZE));
  }

  /**
   * Finds a nearby world position guaranteed to be free of voxel walls/containers
   * so players and bots never spawn stuck inside geometry.
   */
  findSafeSpawnPoint(targetX, targetZ) {
    for (let ring = 0; ring <= 14; ring++) {
      const samples = ring === 0 ? 1 : ring * 8;
      for (let i = 0; i < samples; i++) {
        const angle = (i / samples) * Math.PI * 2;
        const dist = ring * 1.4;
        const tx = targetX + Math.cos(angle) * dist;
        const tz = targetZ + Math.sin(angle) * dist;
        const ty = this.getGroundHeightAt(tx, tz);
        const g = this.worldToGrid(tx, ty + 0.25, tz);

        let clear = true;
        for (let dy = 0; dy <= 2; dy++) {
          if (this.voxels.has(this.key(g.gx, g.gy + dy, g.gz))) {
            clear = false;
            break;
          }
        }
        if (clear) {
          return new THREE.Vector3(tx, ty, tz);
        }
      }
    }
    const fy = this.getGroundHeightAt(targetX, targetZ);
    return new THREE.Vector3(targetX, fy, targetZ);
  }

  buildEnvironment() {
    // 1. Expansive 920m x 660m 3D Sculpted Low-Poly Terrain with Vertex Colors
    const groundGeo = new THREE.PlaneGeometry(920, 660, 240, 170);
    groundGeo.rotateX(-Math.PI / 2);

    const posAttr = groundGeo.attributes.position;
    const colors = [];
    const cGrass = new THREE.Color(0x88aa72);
    const cHighGrass = new THREE.Color(0x749660);
    const cRock = new THREE.Color(0x7f8c8d);
    const cSand = new THREE.Color(0xc2b280);
    const cRoad = new THREE.Color(0x484e54);

    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i);
      const vz = posAttr.getZ(i);
      const vy = this.getTerrainHeight(vx, vz);
      posAttr.setY(i, vy);

      // Determine biome vertex tint from height & proximity to river/highways
      let col = cGrass;
      const onMainHighway = Math.abs(vz) < 6.5 && Math.abs(vx) > 18;
      const onNorthSouthRoad =
        (Math.abs(vx + 195) < 5.5 || Math.abs(vx - 195) < 5.5 || Math.abs(vx + 95) < 5.5 || Math.abs(vx - 105) < 5.5) &&
        Math.abs(vz) < 95;
      if (vy < -0.2) {
        col = cSand;
      } else if (onMainHighway || onNorthSouthRoad) {
        col = cRoad;
      } else if (vy > 11.0) {
        col = cRock;
      } else if (vy > 4.5) {
        col = cHighGrass;
      }
      colors.push(col.r, col.g, col.b);
    }

    groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    groundGeo.computeVertexNormals();

    const groundMat = new THREE.MeshStandardMaterial({
      map: TEXTURES.grass,
      vertexColors: true,
      roughness: 0.94,
      flatShading: true
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.receiveShadow = true;
    this.scene.add(ground);

    // 2. Water Plane inside the sunken 660m River Gorge
    const riverGeo = new THREE.PlaneGeometry(52, 660);
    riverGeo.rotateX(-Math.PI / 2);
    const riverMat = new THREE.MeshStandardMaterial({
      color: 0x24759e,
      roughness: 0.2,
      metalness: 0.4,
      transparent: true,
      opacity: 0.88
    });
    const river = new THREE.Mesh(riverGeo, riverMat);
    river.position.set(0, -0.85, 0);
    this.scene.add(river);

    // 3. Three Grand Stone/Concrete Bridges spanning the River Gorge (z = -110, 0, +110)
    const bridgeDeckGeo = new THREE.BoxGeometry(42, 0.8, 17.0);
    const bridgeDeckMat = new THREE.MeshStandardMaterial({
      map: TEXTURES.darkConcrete,
      roughness: 0.85
    });
    const pierGeo = new THREE.BoxGeometry(2.6, 5.2, 15.5);

    for (const bz of [-110, 0, 110]) {
      const bridge = new THREE.Mesh(bridgeDeckGeo, bridgeDeckMat);
      bridge.position.set(0, 0.75, bz);
      bridge.castShadow = true;
      bridge.receiveShadow = true;
      this.scene.add(bridge);

      for (const px of [-11, 0, 11]) {
        const pier = new THREE.Mesh(pierGeo, bridgeDeckMat);
        pier.position.set(px, -1.6, bz);
        this.scene.add(pier);
      }

      // Destructible bridge sandbag/concrete parapets
      const gzMin = Math.round((bz - 7.2) / VOXEL_SIZE);
      const gzMax = Math.round((bz + 7.2) / VOXEL_SIZE);
      for (let gx = -14; gx <= 14; gx++) {
        this.addVoxel(gx, 1, gzMin, 'darkConcrete');
        this.addVoxel(gx, 1, gzMax, 'darkConcrete');
        if (Math.abs(gx) % 2 === 0) {
          this.addVoxel(gx, 2, gzMin, 'sandbag');
          this.addVoxel(gx, 2, gzMax, 'sandbag');
        }
      }
    }

    // =========================================================================
    // US & RU MAIN BASES & MOTOR POOLS (x: -310 and x: +310)
    // =========================================================================
    this.buildApartmentBlock(-258, -14, 9, 7, 2, 'darkConcrete');
    this.buildWatchtower(-244, 12);
    this.buildHescoBastion(-236, -12, 16, false);
    this.buildShippingContainer(-250, 8, true, 'containerBlue', 0);
    this.addAmmoCrate(-302, -4);

    this.buildApartmentBlock(248, 6, 9, 7, 2, 'darkConcrete');
    this.buildWatchtower(240, -16);
    this.buildHescoBastion(236, -6, 16, false);
    this.buildShippingContainer(244, -12, true, 'containerRed', 0);
    this.addAmmoCrate(302, 4);

    // =========================================================================
    // SECTOR A: WEST FRUGIS TOWN DISTRICT (world x: -195, z: -70 -> grid gx ~ -156, gz ~ -56)
    // =========================================================================
    this.buildApartmentBlock(-172, -68, 10, 7, 3, 'brick');
    this.buildApartmentBlock(-156, -70, 9, 7, 4, 'concrete');
    this.buildApartmentBlock(-142, -64, 8, 7, 3, 'brick');
    this.buildApartmentBlock(-168, -50, 9, 6, 3, 'concrete');
    this.buildApartmentBlock(-152, -48, 8, 6, 2, 'brick');
    this.buildWatchtower(-138, -48);
    this.buildHescoBastion(-160, -56, 10, true);
    this.buildSandbagBunker(-155, -56);
    this.addAmmoCrate(-192, -66);

    // =========================================================================
    // SECTOR B: NORTH LOGISTICS & CONTAINER YARD (world x: -95, z: +85 -> grid gx ~ -76, gz ~ +68)
    // =========================================================================
    this.buildApartmentBlock(-90, 66, 10, 7, 3, 'darkConcrete');
    this.buildApartmentBlock(-68, 72, 9, 6, 2, 'concrete');
    this.buildShippingContainer(-82, 56, true, 'containerRed', 0);
    this.buildShippingContainer(-82, 56, true, 'containerBlue', 3);
    this.buildShippingContainer(-72, 58, false, 'containerOlive', 0);
    this.buildShippingContainer(-80, 76, true, 'containerBlue', 0);
    this.buildShippingContainer(-64, 62, true, 'containerRed', 0);
    this.buildShippingContainer(-64, 62, true, 'containerOlive', 3);
    this.buildWatchtower(-60, 56);
    this.buildHescoBastion(-78, 50, 12, true);
    this.buildSandbagBunker(-75, 68);
    this.addAmmoCrate(-92, 82);

    // =========================================================================
    // SECTOR C: CENTRAL RIVER CITY & GRAND BRIDGES (world x: 0, z: 0 -> grid gx ~ 0, gz ~ 0)
    // =========================================================================
    this.buildApartmentBlock(-28, -22, 10, 7, 4, 'darkConcrete');
    this.buildApartmentBlock(18, -22, 10, 7, 4, 'concrete');
    this.buildApartmentBlock(-26, 12, 9, 7, 3, 'brick');
    this.buildApartmentBlock(17, 12, 9, 7, 3, 'brick');
    this.buildApartmentBlock(-32, -5, 8, 6, 2, 'concrete');
    this.buildApartmentBlock(24, -5, 8, 6, 2, 'darkConcrete');
    this.buildSandbagBunker(-15, 0);
    this.buildSandbagBunker(15, 0);
    this.buildWatchtower(-18, 26);
    this.buildWatchtower(16, -30);
    this.addAmmoCrate(-4, 3);
    this.addAmmoCrate(6, -3);

    // =========================================================================
    // SECTOR D: RADAR HILL & TRENCH GARRISON (world x: +105, z: -85 -> grid gx ~ +84, gz ~ -68)
    // =========================================================================
    this.buildApartmentBlock(72, -74, 10, 7, 3, 'darkConcrete');
    this.buildApartmentBlock(88, -66, 9, 7, 3, 'concrete');
    this.buildApartmentBlock(76, -56, 8, 6, 2, 'darkConcrete');
    this.buildRadarTower(112, -92);
    this.buildRadarTower(92, -98);
    this.buildSandbagBunker(84, -68);
    this.buildHescoBastion(66, -64, 12, false);
    this.buildHescoBastion(78, -50, 14, true);
    this.buildShippingContainer(94, -78, true, 'containerOlive', 0);
    this.addAmmoCrate(102, -82);

    // =========================================================================
    // SECTOR E: EAST INDUSTRIAL DISTRICT (world x: +195, z: +70 -> grid gx ~ +156, gz ~ +56)
    // =========================================================================
    this.buildApartmentBlock(144, 48, 10, 7, 4, 'brick');
    this.buildApartmentBlock(160, 52, 9, 7, 3, 'concrete');
    this.buildApartmentBlock(148, 64, 9, 6, 3, 'brick');
    this.buildApartmentBlock(164, 66, 8, 6, 3, 'darkConcrete');
    this.buildApartmentBlock(136, 58, 8, 6, 2, 'concrete');
    this.buildWatchtower(136, 46);
    this.buildHescoBastion(152, 44, 12, true);
    this.buildSandbagBunker(156, 58);
    this.addAmmoCrate(192, 66);

    // =========================================================================
    // INTER-SECTOR VILLAGES, FLANKING BRIDGES & HIGHWAY CHECKPOINTS
    // =========================================================================
    // North-West Hamlet Outpost (world x: -185, z: +65 -> grid gx ~ -148, gz ~ +52)
    this.buildApartmentBlock(-154, 48, 9, 7, 3, 'brick');
    this.buildApartmentBlock(-140, 54, 8, 6, 2, 'concrete');
    this.buildSandbagBunker(-146, 44);
    this.addAmmoCrate(-182, 62);

    // South-East Hamlet Outpost (world x: +185, z: -65 -> grid gx ~ +148, gz ~ -52)
    this.buildApartmentBlock(142, -56, 9, 7, 3, 'brick');
    this.buildApartmentBlock(154, -50, 8, 6, 2, 'concrete');
    this.buildSandbagBunker(146, -44);
    this.addAmmoCrate(182, -62);

    // North & South Bridge Checkpoints (world z = +110 and z = -110)
    this.buildApartmentBlock(-24, 84, 8, 6, 2, 'brick');
    this.buildApartmentBlock(16, 84, 8, 6, 2, 'concrete');
    this.buildSandbagBunker(-14, 88);
    this.buildSandbagBunker(14, 88);

    this.buildApartmentBlock(-24, -92, 8, 6, 2, 'concrete');
    this.buildApartmentBlock(16, -92, 8, 6, 2, 'brick');
    this.buildSandbagBunker(-14, -88);
    this.buildSandbagBunker(14, -88);

    // Highway Checkpoints along z = 0
    this.buildHescoBastion(-115, -8, 12, false);
    this.buildHescoBastion(115, -8, 12, false);
    this.buildShippingContainer(-110, 6, true, 'containerOlive', 0);
    this.buildShippingContainer(106, -8, true, 'containerRed', 0);
    this.buildSandbagBunker(-72, 0);
    this.buildSandbagBunker(72, 0);

    this.scatterStreetPropsAndTrees();
  }

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

          const isPartition =
            !isWall &&
            width >= 8 &&
            x === Math.floor(width / 2) &&
            z > 1 &&
            z < depth - 2 &&
            z !== Math.floor(depth / 2);

          if (!isWall && !isPartition) continue;

          for (let y = 0; y < floorHeight - 1; y++) {
            const gy = baseGy + y;

            const isDoor =
              f === 0 &&
              y < 2 &&
              ((z === 0 && x === Math.floor(width / 2)) ||
                (z === depth - 1 && x === Math.floor(width / 2)) ||
                (x === 0 && z === Math.floor(depth / 2)));

            const isWindow =
              y === 1 &&
              isWall &&
              ((isEdgeZ && x > 1 && x < width - 2 && x % 2 === 0 && x !== Math.floor(width / 2)) ||
                (isEdgeX && z > 1 && z < depth - 2 && z % 2 === 0));

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
  }

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
            ? x === 0 && z === 1 && y < 2
            : z === 0 && x === 1 && y < 2;
          if (isShell && !isOpenDoor) {
            this.addVoxel(startGx + x, baseGy + y, startGz + z, matType);
          }
        }
      }
    }
  }

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
  }

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
  }

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
  }

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
  }

  addAmmoCrate(wx, wz) {
    const wy = this.getGroundHeightAt(wx, wz);
    const pos = new THREE.Vector3(wx, wy, wz);
    const group = new THREE.Group();
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.9, 0.9),
      new THREE.MeshStandardMaterial({ color: 0x4b5320, roughness: 0.8 })
    );
    box.position.y = 0.45;
    box.castShadow = true;

    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(1.44, 0.18, 0.94),
      new THREE.MeshBasicMaterial({ color: 0xf1c40f })
    );
    stripe.position.y = 0.65;
    group.add(box, stripe);
    group.position.copy(pos);
    this.scene.add(group);

    this.ammoCrates.push({ pos, mesh: group });
  }

  scatterStreetPropsAndTrees() {
    this.lampBulbs = [];
    this.atmosphereMode = 'DAY';

    const poleGeo = new THREE.BoxGeometry(0.22, 6.8, 0.22);
    const armGeo = new THREE.BoxGeometry(1.6, 0.16, 0.16);
    const bulbGeo = new THREE.BoxGeometry(0.42, 0.14, 0.28);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x4a525a, metalness: 0.5 });

    for (let x = -245; x <= 245; x += 35) {
      if (Math.abs(x) < 22) continue;
      for (const zSide of [-8.2, 8.2]) {
        const wy = this.getTerrainHeight(x, zSide);
        const lamp = new THREE.Group();
        const p = new THREE.Mesh(poleGeo, poleMat);
        p.position.y = 3.4;
        const arm = new THREE.Mesh(armGeo, poleMat);
        const armZ = zSide > 0 ? -0.6 : 0.6;
        arm.position.set(0, 6.7, armZ);
        const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff3b0 });
        const bulb = new THREE.Mesh(bulbGeo, bulbMat);
        bulb.position.set(0, 6.58, armZ * 1.4);
        this.lampBulbs.push(bulb);
        lamp.add(p, arm, bulb);
        lamp.position.set(x, wy, zSide);
        this.scene.add(lamp);
      }
    }

    const trunkGeo = new THREE.BoxGeometry(0.65, 2.8, 0.65);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 });
    const leavesLowGeo = new THREE.ConeGeometry(2.7, 3.8, 6);
    const leavesMidGeo = new THREE.ConeGeometry(2.1, 3.4, 6);
    const leavesTopGeo = new THREE.ConeGeometry(1.4, 2.8, 6);
    const leavesMat = new THREE.MeshStandardMaterial({
      color: 0x2e5430,
      roughness: 0.9,
      flatShading: true
    });
    const rockGeo = new THREE.DodecahedronGeometry(2.4, 0);
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x6c757d,
      roughness: 0.9,
      flatShading: true
    });

    const treeCoords = [
      [-285, -95], [-265, 88], [-250, -135], [-235, 130], [-220, -25],
      [-215, 115], [-195, -140], [-170, 135], [-160, -120], [-145, -18],
      [-140, 28], [-130, 130], [-125, -110], [-110, 42], [-95, -135],
      [-85, -45], [-70, 145], [-55, -125], [-48, 52], [-42, -55],
      [-32, 135], [-28, -140], [28, 140], [32, -135], [42, 55],
      [48, -52], [55, 125], [70, -145], [85, 45], [95, 135],
      [110, -42], [125, 110], [130, -130], [140, -28], [145, 18],
      [160, 120], [170, -135], [195, 140], [215, -115], [220, 25],
      [235, -130], [250, 135], [265, -88], [285, 95],
      [-320, -70], [-320, 70], [320, -70], [320, 70],
      [-165, 15], [165, -15], [-60, -25], [60, 25],
      [-135, -75], [135, 75], [-55, 85], [55, -85],
      [-245, -55], [245, 55], [-245, 45], [245, -45]
    ];

    for (let i = 0; i < treeCoords.length; i++) {
      const [tx, tz] = treeCoords[i];
      const ty = this.getTerrainHeight(tx, tz);
      const group = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 1.4;
      trunk.castShadow = true;

      // Multi-tiered BattleBit low-poly pine foliage
      const l1 = new THREE.Mesh(leavesLowGeo, leavesMat);
      l1.position.y = 3.5;
      l1.castShadow = true;
      const l2 = new THREE.Mesh(leavesMidGeo, leavesMat);
      l2.position.y = 5.3;
      l2.castShadow = true;
      const l3 = new THREE.Mesh(leavesTopGeo, leavesMat);
      l3.position.y = 6.9;
      l3.castShadow = true;

      group.add(trunk, l1, l2, l3);
      const scale = 0.92 + (i % 5) * 0.12;
      group.scale.set(scale, scale, scale);
      group.position.set(tx, ty, tz);
      this.scene.add(group);

      if (i % 2 === 0) {
        const rock = new THREE.Mesh(rockGeo, rockMat);
        const rx = tx + 4.5;
        const rz = tz - 3.5;
        rock.position.set(rx, this.getTerrainHeight(rx, rz) + 0.85, rz);
        rock.rotation.set(i, i * 0.7, 0);
        rock.castShadow = true;
        this.scene.add(rock);
      }
    }
  }

  /**
   * Switches BattleBit time-of-day atmosphere ('DAY', 'SUNSET', 'NIGHT')
   */
  setAtmosphereMode(mode, hemiLight, dirLight) {
    this.atmosphereMode = mode;
    if (mode === 'SUNSET') {
      this.scene.background = new THREE.Color(0xd97d54);
      this.scene.fog = new THREE.FogExp2(0xc86d51, 0.0018);
      if (hemiLight) {
        hemiLight.color.setHex(0xffb07c);
        hemiLight.groundColor.setHex(0x3a2e39);
        hemiLight.intensity = 0.72;
      }
      if (dirLight) {
        dirLight.color.setHex(0xff8c42);
        dirLight.intensity = 1.35;
        dirLight.position.set(-220, 110, 120);
      }
    } else if (mode === 'NIGHT') {
      this.scene.background = new THREE.Color(0x070b12);
      this.scene.fog = new THREE.FogExp2(0x070b12, 0.0028);
      if (hemiLight) {
        hemiLight.color.setHex(0x1f3044);
        hemiLight.groundColor.setHex(0x090d12);
        hemiLight.intensity = 0.32;
      }
      if (dirLight) {
        dirLight.color.setHex(0x527196);
        dirLight.intensity = 0.38;
        dirLight.position.set(120, 180, -90);
      }
    } else {
      // DAY
      this.scene.background = new THREE.Color(0x87b8d8);
      this.scene.fog = new THREE.FogExp2(0x87b8d8, 0.0014);
      if (hemiLight) {
        hemiLight.color.setHex(0xdff9fb);
        hemiLight.groundColor.setHex(0x4a5540);
        hemiLight.intensity = 0.78;
      }
      if (dirLight) {
        dirLight.color.setHex(0xfff4d6);
        dirLight.intensity = 1.25;
        dirLight.position.set(160, 220, 120);
      }
    }

    if (this.lampBulbs) {
      const lampHex = mode === 'DAY' ? 0x95a5a6 : 0xffdd59;
      for (const b of this.lampBulbs) {
        b.material.color.setHex(lampHex);
      }
    }
  }

  buildConquestFlags() {
    const poleGeo = new THREE.CylinderGeometry(0.14, 0.14, 10.5, 8);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xdcdde1, metalness: 0.5 });
    const bannerGeo = new THREE.BoxGeometry(2.6, 1.5, 0.14);

    for (const flag of this.flags) {
      const group = new THREE.Group();
      group.position.copy(flag.pos);

      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.y = 5.25;
      pole.castShadow = true;
      group.add(pole);

      const bannerMat = new THREE.MeshStandardMaterial({
        color: this.getTeamHex(flag.owner),
        roughness: 0.5
      });
      const banner = new THREE.Mesh(bannerGeo, bannerMat);
      banner.position.set(1.35, 9.0, 0);
      group.add(banner);

      const ringGeo = new THREE.RingGeometry(flag.radius - 0.4, flag.radius, 36);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: this.getTeamHex(flag.owner),
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.55
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 0.25;
      group.add(ring);

      this.scene.add(group);
      flag.bannerMesh = banner;
      flag.zoneMesh = ring;
    }
  }

  getTeamHex(team) {
    if (team === 'US') return 0x3498db;
    if (team === 'RU') return 0xe74c3c;
    return 0x95a5a6;
  }

  // Dynamic Weather System (Battlefield 2042 inspired)
  updateWeather(dt) {
    this.weatherTimer -= dt;

    if (this.weatherState === 'CLEAR') {
      if (this.weatherTimer <= 0) {
        // Trigger random weather event
        const events = ['FOG', 'HEAVY_FOG', 'SANDSTORM'];
        this.weatherState = events[Math.floor(Math.random() * events.length)];
        this.weatherDuration = 30 + Math.random() * 45; // 30-75 seconds
        this.weatherTimer = this.weatherDuration;
        this._weatherTransition = 0;
      }
    } else {
      this._weatherTransition = Math.min(1, (this._weatherTransition || 0) + dt * 0.25);

      if (this.weatherTimer <= 0) {
        // Weather clearing
        this.weatherState = 'CLEAR';
        this.weatherTimer = 90 + Math.random() * 120; // Next event in 1.5-3.5 minutes
        this._weatherTransition = 0;
      }
    }

    // Apply weather effects to fog density
    const mode = this.atmosphereMode || 'DAY';
    const baseDensity = mode === 'NIGHT' ? 0.0028 : mode === 'SUNSET' ? 0.0018 : 0.0014;
    let targetDensity = baseDensity;

    if (this.weatherState === 'FOG') {
      targetDensity = baseDensity * 2.8;
    } else if (this.weatherState === 'HEAVY_FOG') {
      targetDensity = baseDensity * 5.5;
    } else if (this.weatherState === 'SANDSTORM') {
      targetDensity = baseDensity * 4.0;
      // Tint the fog amber during sandstorm
      if (this.scene.fog && this._weatherTransition > 0.3) {
        this.scene.fog.color.lerp(new THREE.Color(0xb89058), dt * 0.5);
      }
    }

    if (this.scene.fog) {
      const currentDensity = this.scene.fog.density || baseDensity;
      this.scene.fog.density = THREE.MathUtils.lerp(currentDensity, targetDensity, dt * 0.8);

      // Restore fog color when clearing
      if (this.weatherState === 'CLEAR' && this.scene.background) {
        this.scene.fog.color.lerp(this.scene.background, dt * 0.3);
      }
    }
  }

  // Get current weather for HUD display
  getWeatherStatus() {
    if (this.weatherState === 'FOG') return '🌫️ FOG ROLLING IN';
    if (this.weatherState === 'HEAVY_FOG') return '🌫️ HEAVY FOG — VISIBILITY LIMITED';
    if (this.weatherState === 'SANDSTORM') return '🌪️ SANDSTORM — SEEK COVER';
    return null;
  }

  update(dt, units, onExplosionDamage, broadcastFn, onFlagCaptured = null, vehicles = []) {
    for (let i = this.debrisParticles.length - 1; i >= 0; i--) {
      const p = this.debrisParticles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        if (p.mesh.material) p.mesh.material.dispose();
        this.debrisParticles.splice(i, 1);
        continue;
      }

      if (p.isFlash) {
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

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      proj.life -= dt;

      if (proj.type === 'grenade' && proj.life <= 0) {
        const hitPos = proj.mesh.position.clone();
        sound.playExplosion(0);
        this.explodeAt(
          hitPos,
          5.0,
          190,
          (pos, rad, dmg, broken) => {
            if (onExplosionDamage) onExplosionDamage(pos, rad, dmg, proj.owner, broken);
          },
          broadcastFn
        );
        this.scene.remove(proj.mesh);
        this.projectiles.splice(i, 1);
        continue;
      }

      if (proj.life <= 0) {
        this.scene.remove(proj.mesh);
        this.projectiles.splice(i, 1);
        continue;
      }

      const prevPos = proj.mesh.position.clone();
      proj.vel.y -= proj.gravity * dt;
      proj.mesh.position.addScaledVector(proj.vel, dt);

      if (proj.type === 'rpg' || proj.type === 'autocannon' || proj.type === 'tank_shell') {
        this.spawnDebris(prevPos, new THREE.Color(0x95a5a6), 1);
      }

      const g = this.worldToGrid(
        proj.mesh.position.x,
        proj.mesh.position.y,
        proj.mesh.position.z
      );
      const hitVoxel = this.voxels.get(this.key(g.gx, g.gy, g.gz));
      const groundY = this.getGroundHeightAt(proj.mesh.position.x, proj.mesh.position.z);
      const hitGround = proj.mesh.position.y <= groundY + 0.15;

      // Direct anti-armor projectile collision against Tank / APC / Humvee hulls
      let hitVehicle = false;
      if (
        (proj.type === 'rpg' || proj.type === 'tank_shell' || proj.type === 'autocannon') &&
        vehicles.length > 0
      ) {
        const ownerTeam = proj.owner ? proj.owner.team : null;
        for (const v of vehicles) {
          if (v.dead || (ownerTeam && v.team === ownerTeam)) continue;
          const vCenter = v.pos.clone().add(new THREE.Vector3(0, 1.35, 0));
          const hullRad = v.type === 'tank' ? 3.5 : v.type === 'apc' ? 3.1 : 2.5;
          if (proj.mesh.position.distanceTo(vCenter) <= hullRad) {
            hitVehicle = true;
            break;
          }
        }
      }

      if (hitVoxel || hitGround || hitVehicle) {
        if (proj.type === 'rpg' || proj.type === 'autocannon' || proj.type === 'tank_shell') {
          const hitPos = proj.mesh.position.clone();
          const rad =
            proj.type === 'tank_shell' ? 6.2 : proj.type === 'rpg' ? 5.0 : 2.8;
          const dmg =
            proj.type === 'tank_shell' ? 320 : proj.type === 'rpg' ? 235 : 95;
          sound.playExplosion(0);
          this.explodeAt(
            hitPos,
            rad,
            dmg,
            (pos, r, d, broken) => {
              if (onExplosionDamage) onExplosionDamage(pos, r, d, proj.owner, broken);
            },
            broadcastFn
          );
          this.scene.remove(proj.mesh);
          this.projectiles.splice(i, 1);
        } else if (proj.type === 'grenade') {
          if (hitGround) {
            proj.mesh.position.y = groundY + 0.16;
            proj.vel.y *= -0.45;
            proj.vel.x *= 0.68;
            proj.vel.z *= 0.68;
          } else {
            proj.vel.x *= -0.5;
            proj.vel.z *= -0.5;
          }
        } else if (proj.type === 'c4') {
          proj.vel.set(0, 0, 0);
          proj.gravity = 0;
          if (hitGround) proj.mesh.position.y = groundY + 0.15;
        }
      }
    }

    for (const flag of this.flags) {
      let usCount = 0;
      let ruCount = 0;

      for (const u of units) {
        if (u.dead) continue;
        const dx = u.pos.x - flag.pos.x;
        const dz = u.pos.z - flag.pos.z;
        if (dx * dx + dz * dz <= flag.radius * flag.radius) {
          if (u.team === 'US') usCount++;
          else if (u.team === 'RU') ruCount++;
        }
      }

      const prevOwner = flag.owner;
      const net = usCount - ruCount;
      if (net !== 0) {
        const speed = Math.min(Math.abs(net), 4) * 14 * dt * Math.sign(net);
        flag.captureProgress = Math.max(-100, Math.min(100, flag.captureProgress + speed));
      }

      if (flag.captureProgress >= 99) {
        flag.owner = 'US';
      } else if (flag.captureProgress <= -99) {
        flag.owner = 'RU';
      } else if (Math.abs(flag.captureProgress) < 15) {
        flag.owner = 'NEUTRAL';
      }

      if (prevOwner !== flag.owner && (flag.owner === 'US' || flag.owner === 'RU')) {
        if (onFlagCaptured) onFlagCaptured(flag, flag.owner);
      }

      const absProg = Math.abs(flag.captureProgress) / 100;
      flag.bannerMesh.position.y = 2.6 + absProg * 6.4;
      const colorHex =
        flag.captureProgress > 15
          ? 0x3498db
          : flag.captureProgress < -15
          ? 0xe74c3c
          : 0x95a5a6;
      flag.bannerMesh.material.color.setHex(colorHex);
      flag.zoneMesh.material.color.setHex(colorHex);
    }

    // Dynamic Weather System (Battlefield 2042 inspired — fog rolls, sandstorm)
    this.updateWeather(dt);

    // Ammo Crate Resupply Tick (Support class ammo supply — BattleBit/Battlefield inspired)
    for (let i = this.ammoCrates.length - 1; i >= 0; i--) {
      const crate = this.ammoCrates[i];
      crate.timer -= dt;
      if (crate.timer <= 0) {
        this.scene.remove(crate.mesh);
        this.ammoCrates.splice(i, 1);
        continue;
      }
      // Resupply nearby friendly units every 2 seconds
      crate._resupplyTick = (crate._resupplyTick || 0) + dt;
      if (crate._resupplyTick >= 2.0) {
        crate._resupplyTick = 0;
        for (const u of units) {
          if (u.dead || u.downed || u.team !== crate.team) continue;
          const dist = u.pos.distanceTo(crate.pos);
          if (dist <= crate.resupplyRadius) {
            // Resupply ammo for all weapon slots
            if (u.slots) {
              for (const slot of u.slots) {
                if (slot.reserve < slot.def.reserveAmmo) {
                  const amount = Math.ceil(slot.def.clipSize * 0.5);
                  slot.reserve = Math.min(slot.def.reserveAmmo, slot.reserve + amount);
                  if (slot.mags) {
                    slot.mags.push(Math.min(slot.def.clipSize, amount));
                  }
                }
              }
            }
            // Resupply grenades and bandages
            if (typeof u.grenades === 'number' && u.grenades < 2) {
              u.grenades = Math.min(2, u.grenades + 1);
            }
            if (typeof u.bandages === 'number' && u.bandages < 3) {
              u.bandages = Math.min(3, u.bandages + 1);
            }
            // XP for the crate owner (player only)
            if (u.name !== crate.owner && u.onAwardXp) {
              // Don't have direct ref to owner — handled via crate owner name matching
            }
          }
        }
      }
      // Pulse the glow ring
      if (crate.mesh.children[3]) {
        crate.mesh.children[3].material.opacity = 0.15 + Math.sin(performance.now() * 0.003) * 0.1;
      }
    }
  }
}
