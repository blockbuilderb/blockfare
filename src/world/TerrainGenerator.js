import * as THREE from '../../vendor/three.module.js';
import { TEXTURES } from '../textures.js?v=124';
import { TERRAIN } from '../config.js?v=124';
import { WAREHOUSE_BAY_CATALOG, OBJECTIVE_MOTORPOOL_BASES } from '../assets/vehicle-defs.js?v=124';

const VOXEL_SIZE = 1.25;

// Static baked terrain heightmap grid covering 100% of playable ground & airfields at exact 1.25m voxel step
const HM_MIN_X = -2000;
const HM_MAX_X = 2000;
const HM_MIN_Z = -1150;
const HM_MAX_Z = 1150;
const HM_STEP = 1.25;
const HM_INV_STEP = 1 / HM_STEP;
const HM_COLS = 3201; // (2000 - -2000) / 1.25 + 1
const HM_ROWS = 1841; // (1150 - -1150) / 1.25 + 1

const _HQ_BUNKERS = [
  { cx: -1605, cz: -38, dirX: 1 },
  { cx: 1605, cz: 38, dirX: -1 }
];

function markShared(asset) {
  if (asset) {
    if (!asset.userData) asset.userData = {};
    asset.userData.shared = true;
  }
  return asset;
}

// Shared static geometries for instanced airfield markings & HQ barbed-wire fences (userData.shared = true)
const _rwyPianoKeyGeo = markShared(new THREE.BoxGeometry(6.8, 0.26, 1.05));
const _rwyThreshLightGeo = markShared(new THREE.BoxGeometry(0.42, 0.42, 0.42));
const _rwyDashGeo = markShared(new THREE.BoxGeometry(7.5, 0.26, 0.65));
const _rwyEdgeStalkGeo = markShared(new THREE.CylinderGeometry(0.08, 0.12, 0.45, 6));
const _rwyEdgeBulbGeo = markShared(new THREE.BoxGeometry(0.42, 0.32, 0.42));
const _b2PianoKeyGeo = markShared(new THREE.BoxGeometry(6.4, 0.27, 1.0));
const _b2DashGeo = markShared(new THREE.BoxGeometry(8.0, 0.27, 0.7));
const _b2BeaconGeo = markShared(new THREE.BoxGeometry(0.52, 0.52, 0.52));

const _secPierGeo = markShared(new THREE.BoxGeometry(1.55, 3.4, 0.65));
const _secYPostGeo = markShared(new THREE.BoxGeometry(0.14, 0.85, 0.14));
const _secYArmGeo = markShared(new THREE.BoxGeometry(0.1, 0.55, 0.1));
const _secStrandUnitGeo = markShared(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 6));
const _secTopCoilGeo = markShared(new THREE.TorusGeometry(0.42, 0.045, 6, 12));
const _secGroundCoilGeo = markShared(new THREE.TorusGeometry(0.55, 0.055, 6, 12));
const _boomSegGeo = markShared(new THREE.BoxGeometry(0.18, 0.18, 1.35));

const _instParentMat = new THREE.Matrix4();
const _instLocalMat = new THREE.Matrix4();
const _instWorldMat = new THREE.Matrix4();
const _instPos = new THREE.Vector3();
const _instScale = new THREE.Vector3(1, 1, 1);
const _instEuler = new THREE.Euler();
const _instQuat = new THREE.Quaternion();
const _instColor = new THREE.Color();

function buildStaticInstancedBatch(geo, mat, flatMatrices, flatColors = null, castShadow = false, receiveShadow = false) {
  const count = (flatMatrices.length / 16) | 0;
  if (count <= 0) return null;
  const inst = new THREE.InstancedMesh(geo, mat, count);
  inst.instanceMatrix.array.set(flatMatrices);
  inst.instanceMatrix.needsUpdate = true;
  if (flatColors && flatColors.length === count * 3) {
    _instColor.setRGB(1, 1, 1);
    inst.setColorAt(0, _instColor);
    inst.instanceColor.array.set(flatColors);
    inst.instanceColor.needsUpdate = true;
  }
  inst.castShadow = castShadow;
  inst.receiveShadow = receiveShadow;
  inst.matrixAutoUpdate = false;
  inst.updateMatrix();
  inst.computeBoundingSphere();
  return inst;
}

export const TerrainGenerator = {
  /**
   * Natural meandering river centerline X(z), smoothly pinned to x = 0 at all 3 bridges (z = -400, 0, +400)
   * so every bridge spans squarely across the deep water channel while the river winds organically across the valley!
   */
  getRiverCenterX(z) {
    const d0 = Math.min(1, Math.abs(z) / 56);
    const dN = Math.min(1, Math.abs(z - 400) / 48);
    const dS = Math.min(1, Math.abs(z + 400) / 48);
    const pin = d0 * d0 * dN * dN * dS * dS;
    return (Math.sin(z * 0.0042) * 34.0 + Math.sin(z * 0.0115) * 9.0) * pin;
  },

  /**
   * Returns true if (x, z) lies on the paved Frugis Valley road & bridge highway network.
   */
  _isOnValleyRoad(x, z) {
    // 1. Main East-West Highway (z = 0 across full 3,040m HQ-to-HQ corridor)
    if (Math.abs(z) < 7.8 && Math.abs(x) <= 1600 && Math.abs(x) > 18) return true;
    // 2. North Bridge Highway (z = +400, linking Obj B <-> North Bridge <-> Obj E)
    if (Math.abs(z - 400) < 6.4 && x >= -330 && x <= 668 && Math.abs(x) > 18) return true;
    // 3. South Bridge Highway (z = -400, linking Obj A <-> South Bridge <-> Obj D)
    if (Math.abs(z + 400) < 6.4 && x >= -668 && x <= 338 && Math.abs(x) > 18) return true;
    // 4. North-South Sector Arterials to Objectives A, B, D, E & Airbase Gates
    if (Math.abs(x + 660) < 6.4 && z >= -404 && z <= 4) return true;    // Obj A <-> Main Hwy & South Bridge
    if (Math.abs(x + 320) < 6.4 && z >= -4 && z <= 404) return true;    // Obj B <-> Main Hwy & North Bridge
    if (Math.abs(x - 330) < 6.4 && z >= -404 && z <= 4) return true;    // Obj D <-> Main Hwy & South Bridge
    if (Math.abs(x - 660) < 6.4 && z >= -4 && z <= 404) return true;    // Obj E <-> Main Hwy & North Bridge
    if (Math.abs(x + 1495) < 7.0 && z >= -54 && z <= 4) return true;    // US HQ <-> US Airbase Gate
    if (Math.abs(x - 1495) < 7.0 && z >= -4 && z <= 54) return true;    // RU HQ <-> RU Airbase Gate
    if (Math.abs(x + 640) < 5.5 && z >= 0 && z <= 272) return true;     // NW Outpost Spur
    if (Math.abs(x - 640) < 5.5 && z >= -272 && z <= 0) return true;    // SE Outpost Spur
    return false;
  },

  /**
   * Analytic terrain evaluation used to bake the 1.25m static heightmap and as fallback outside [-2000..2000] x [-1150..1150].
   */
  _computeRawTerrainHeight(x, z) {
    // Broad rolling valley hills + secondary tactical ridges
    let h =
      Math.sin(x * 0.011) * Math.cos(z * 0.013) * 5.6 +
      Math.sin(x * 0.028 + z * 0.024) * 2.2 +
      Math.cos(x * 0.006 - z * 0.009) * 3.8;

    // Natural Alpine Mountain Ranges framing the 7,600m x 5,200m Grand Theater (smooth broad ridges, no thin needle spikes!)
    const rimWaveX = Math.sin(z * 0.0024) * 185 + Math.cos(z * 0.0058) * 85;
    const rimWaveZ = Math.sin(x * 0.0021) * 165 + Math.cos(x * 0.0052) * 75;
    const edgeX = Math.max(0, (Math.abs(x) - (3020 + rimWaveX)) / 210);
    const edgeZ = Math.max(0, (Math.abs(z) - (1960 + rimWaveZ)) / 175);
    const rimEnv = edgeX * edgeX + edgeZ * edgeZ;
    if (rimEnv > 0) {
      const smoothRidges =
        0.78 +
        0.26 * Math.sin(x * 0.0038 + z * 0.0031) +
        0.18 * Math.cos(x * 0.0065 - z * 0.0054);
      const mountainRise = Math.min(245, Math.pow(rimEnv, 0.78) * 42.0 * smoothRidges);
      h += mountainRise;
    }

    // Smooth blend toward graded urban plateaus
    const pads = this.gradedPads;
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      if (pad.invRx === undefined) {
        pad.invRx = 1 / pad.rx;
        pad.invRz = 1 / pad.rz;
        pad.maxDx = pad.rx * 1.45;
        pad.maxDz = pad.rz * 1.45;
      }
      const rawDx = x - pad.x;
      if (rawDx > pad.maxDx || rawDx < -pad.maxDx) continue;
      const rawDz = z - pad.z;
      if (rawDz > pad.maxDz || rawDz < -pad.maxDz) continue;
      const dx = rawDx * pad.invRx;
      const dz = rawDz * pad.invRz;
      const distSq = dx * dx + dz * dz;
      if (distSq < 1.8) {
        const weight = 1 - distSq / 1.8;
        const smoothW = weight * weight * (3 - 2 * weight);
        h += (pad.h - h) * smoothW;
      }
    }

    // Main East-West Highway corridor grading (z around 0, smoothly tapering out past |x| = 1,640m so it NEVER cracks the outer mountains!)
    const absRoadX = Math.abs(x);
    const roadDist = Math.abs(z) / 13.5;
    if (roadDist < 1.4 && absRoadX > 26 && absRoadX < 1940) {
      const endFade = absRoadX <= 1640 ? 1.0 : 1.0 - (absRoadX - 1640) / 300;
      const rw = (1 - roadDist / 1.4) * 0.88 * endFade * endFade;
      const roadTargetH = 1.25 + Math.sin(x * 0.008) * 1.1;
      h += (roadTargetH - h) * rw;
    }

    // Deep, Unbroken North-South River Gorge across the valley, tapering smoothly past |z| = 2,050m so it doesn't slice outer mountains!
    const absRiverZ = Math.abs(z);
    const riverCenterX = this.getRiverCenterX(z);
    const distFromRiver = Math.abs(x - riverCenterX);
    if (distFromRiver < 42 && absRiverZ < 2450) {
      const zRiverFade = absRiverZ <= 2050 ? 1.0 : 1.0 - (absRiverZ - 2050) / 400;
      let targetRiverH = h;
      if (distFromRiver <= 24) {
        targetRiverH = -3.75 + (distFromRiver / 24) * 0.95;
      } else {
        const bankT = (distFromRiver - 24) / 18;
        const smoothBank = bankT * bankT * (3 - 2 * bankT);
        targetRiverH = -2.8 + (h + 2.8) * smoothBank;
      }
      h += (targetRiverH - h) * zRiverFade;
    }

    // Subterranean Sunken Bunker-Cave Excavation & Exact Flat Rectangular Airbase Grading (MODERN ERA ONLY)
    if ((this.era || (this.mapDef && this.mapDef.era) || 'modern') === 'modern') {
      // Lock 100% of both 372m Parallel Runways, Outer Flight-Line Aprons & Thresholds flat at y = 1.25m (ZERO floating runway ends!)
      const absX = Math.abs(x);
      const teamZ = x < 0 ? -z : z;
      if (absX >= 1194 && absX <= 1674 && teamZ >= 34 && teamZ <= 204) {
        const dxOut = absX < 1238 ? (1238 - absX) / 44 : absX > 1630 ? (absX - 1630) / 44 : 0;
        const dzOut = teamZ < 46 ? (46 - teamZ) / 12 : teamZ > 172 ? (teamZ - 172) / 32 : 0;
        const dEdge = Math.min(1, Math.hypot(dxOut, dzOut));
        if (dEdge < 1) {
          const tFlat = 1 - dEdge;
          const wFlat = tFlat * tFlat * (3 - 2 * tFlat);
          h += (1.25 - h) * wFlat;
        }
      }

      for (let bIdx = 0; bIdx < 2; bIdx++) {
        const bunker = _HQ_BUNKERS[bIdx];
        const localX = (x - bunker.cx) * bunker.dirX;
        const localZ = Math.abs(z - bunker.cz);
        if (localX >= -25 && localX <= 54 && localZ <= 16.5) {
          const zBlend = localZ <= 11.5 ? 1.0 : Math.max(0, 1 - (localZ - 11.5) * 0.2);
          let targetBunkerY = 1.25;
          if (localX < -21) {
            const backT = Math.max(0, (localX + 25) * 0.25);
            targetBunkerY = 1.25 + (-3.75 - 1.25) * backT;
          } else if (localX <= 14) {
            targetBunkerY = -3.75;
          } else {
            const rampT = Math.min(1, (localX - 14) / 38.0);
            const smoothRamp = rampT * rampT * (3 - 2 * rampT);
            targetBunkerY = -3.75 + 5.0 * smoothRamp;
          }
          h += (targetBunkerY - h) * zBlend;
        }
      }
    }

    return h;
  },

  /**
   * Bakes a 1.25m resolution Float32Array heightmap across [-1500..1500] x [-900..900] (13.8 MB).
   * Uses separable 1D trig tables & per-row pad culling to bake 3.46M vertices in ~6ms.
   */
  _bakeTerrainHeightmap() {
    const pads = this.gradedPads || [];
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (p.invRx === undefined) {
        p.invRx = 1 / p.rx;
        p.invRz = 1 / p.rz;
        p.maxDx = p.rx * 1.45;
        p.maxDz = p.rz * 1.45;
      }
    }

    const era = this.era || (this.mapDef && this.mapDef.era) || 'modern';
    const isModern = era === 'modern';
    const hm = this._heightmap && this._heightmap.length === HM_COLS * HM_ROWS
      ? this._heightmap
      : new Float32Array(HM_COLS * HM_ROWS);

    const xs = new Float64Array(HM_COLS);
    const sinX011 = new Float64Array(HM_COLS);
    const sinX028 = new Float64Array(HM_COLS);
    const cosX028 = new Float64Array(HM_COLS);
    const cosX006 = new Float64Array(HM_COLS);
    const sinX006 = new Float64Array(HM_COLS);
    const roadTargetX = new Float64Array(HM_COLS);

    for (let ix = 0; ix < HM_COLS; ix++) {
      const x = HM_MIN_X + ix * HM_STEP;
      xs[ix] = x;
      sinX011[ix] = Math.sin(x * 0.011) * 5.6;
      sinX028[ix] = Math.sin(x * 0.028);
      cosX028[ix] = Math.cos(x * 0.028);
      cosX006[ix] = Math.cos(x * 0.006);
      sinX006[ix] = Math.sin(x * 0.006);
      roadTargetX[ix] = 1.25 + Math.sin(x * 0.008) * 1.1;
    }

    const rowPads = [];
    const inv18 = 1 / 1.8;

    for (let iz = 0; iz < HM_ROWS; iz++) {
      const z = HM_MIN_Z + iz * HM_STEP;
      const cosZ013 = Math.cos(z * 0.013);
      const cosZ024 = Math.cos(z * 0.024) * 2.2;
      const sinZ024 = Math.sin(z * 0.024) * 2.2;
      const cosZ009 = Math.cos(z * 0.009) * 3.8;
      const sinZ009 = Math.sin(z * 0.009) * 3.8;

      rowPads.length = 0;
      for (let pIdx = 0; pIdx < pads.length; pIdx++) {
        const pad = pads[pIdx];
        const rdz = z - pad.z;
        if (rdz <= pad.maxDz && rdz >= -pad.maxDz) {
          rowPads.push(pad);
        }
      }
      const rowPadCount = rowPads.length;

      const roadDist = Math.abs(z) / 13.5;
      const hasRoad = roadDist < 1.4;
      const roadWeight = hasRoad ? (1 - roadDist / 1.4) * 0.88 : 0;

      const riverCenterX = this.getRiverCenterX(z);

      let activeBunker = null;
      let bunkerZBlend = 0;
      if (isModern) {
        for (let bIdx = 0; bIdx < 2; bIdx++) {
          const bk = _HQ_BUNKERS[bIdx];
          const lz = Math.abs(z - bk.cz);
          if (lz <= 16.5) {
            activeBunker = bk;
            bunkerZBlend = lz <= 11.5 ? 1.0 : Math.max(0, 1 - (lz - 11.5) * 0.2);
            break;
          }
        }
      }

      const rowOff = iz * HM_COLS;
      for (let ix = 0; ix < HM_COLS; ix++) {
        const x = xs[ix];
        let h =
          sinX011[ix] * cosZ013 +
          (sinX028[ix] * cosZ024 + cosX028[ix] * sinZ024) +
          (cosX006[ix] * cosZ009 + sinX006[ix] * sinZ009);

        for (let pIdx = 0; pIdx < rowPadCount; pIdx++) {
          const pad = rowPads[pIdx];
          const rawDx = x - pad.x;
          if (rawDx > pad.maxDx || rawDx < -pad.maxDx) continue;
          const dx = rawDx * pad.invRx;
          const dz = (z - pad.z) * pad.invRz;
          const distSq = dx * dx + dz * dz;
          if (distSq < 1.8) {
            const weight = 1 - distSq * inv18;
            const smoothW = weight * weight * (3 - 2 * weight);
            h += (pad.h - h) * smoothW;
          }
        }

        if (hasRoad && (x > 26 || x < -26)) {
          const ax = x < 0 ? -x : x;
          if (ax < 1940) {
            const endFade = ax <= 1640 ? 1.0 : 1.0 - (ax - 1640) / 300;
            h += (roadTargetX[ix] - h) * roadWeight * endFade * endFade;
          }
        }

        const distFromRiver = Math.abs(x - riverCenterX);
        if (distFromRiver < 42) {
          if (distFromRiver <= 24) {
            h = -3.75 + (distFromRiver / 24) * 0.95;
          } else {
            const bankT = (distFromRiver - 24) / 18;
            const smoothBank = bankT * bankT * (3 - 2 * bankT);
            h = -2.8 + (h + 2.8) * smoothBank;
          }
        }

        // Exact Flat Rectangular Airbase Grading across full 372m Runway + Outer Side Apron footprint (prevents floating runway ends!)
        if (isModern) {
          const absX = x < 0 ? -x : x;
          const teamZ = x < 0 ? -z : z;
          if (absX >= 1194 && absX <= 1674 && teamZ >= 34 && teamZ <= 204) {
            const dxOut = absX < 1238 ? (1238 - absX) / 44 : absX > 1630 ? (absX - 1630) / 44 : 0;
            const dzOut = teamZ < 46 ? (46 - teamZ) / 12 : teamZ > 172 ? (teamZ - 172) / 32 : 0;
            const dEdge = dxOut === 0 && dzOut === 0 ? 0 : Math.min(1, Math.hypot(dxOut, dzOut));
            if (dEdge < 1) {
              const tFlat = 1 - dEdge;
              const wFlat = tFlat * tFlat * (3 - 2 * tFlat);
              h += (1.25 - h) * wFlat;
            }
          }
        }

        if (activeBunker) {
          const localX = (x - activeBunker.cx) * activeBunker.dirX;
          if (localX >= -25 && localX <= 54) {
            let targetBunkerY = 1.25;
            if (localX < -21) {
              const backT = Math.max(0, (localX + 25) * 0.25);
              targetBunkerY = 1.25 - 5.0 * backT;
            } else if (localX <= 14) {
              targetBunkerY = -3.75;
            } else {
              const rampT = Math.min(1, (localX - 14) / 38.0);
              const smoothRamp = rampT * rampT * (3 - 2 * rampT);
              targetBunkerY = -3.75 + 5.0 * smoothRamp;
            }
            h += (targetBunkerY - h) * bunkerZBlend;
          }
        }

        hm[rowOff + ix] = h;
      }
    }

    this._heightmap = hm;
    this._bakedPadsLen = pads.length;
    this._bakedEra = era;
  },

  /**
   * Expansive Squad-Scale 2,400m x 1,500m 3D Terrain Heightmap with O(1) bilinear Float32Array lookup.
   */
  getTerrainHeight(x, z) {
    const era = this.era || (this.mapDef && this.mapDef.era) || 'modern';
    if (
      !this._heightmap ||
      this._bakedPadsLen !== this.gradedPads.length ||
      this._bakedEra !== era
    ) {
      this._bakeTerrainHeightmap();
    }

    if (!(x >= HM_MIN_X && x < HM_MAX_X && z >= HM_MIN_Z && z < HM_MAX_Z)) {
      return this._computeRawTerrainHeight(x, z);
    }

    const fx = (x - HM_MIN_X) * HM_INV_STEP;
    const fz = (z - HM_MIN_Z) * HM_INV_STEP;
    const ix = fx | 0;
    const iz = fz | 0;
    const tx = fx - ix;
    const tz = fz - iz;
    const idx = iz * HM_COLS + ix;
    const hm = this._heightmap;
    const h00 = hm[idx];
    const h10 = hm[idx + 1];
    const h01 = hm[idx + HM_COLS];
    const h11 = hm[idx + HM_COLS + 1];
    const h0 = h00 + (h10 - h00) * tx;
    const h1 = h01 + (h11 - h01) * tx;
    return h0 + (h1 - h0) * tz;
  },

  /**
   * Returns walkable surface height including the 3 grand bridges over the river canyon.
   */
  getGroundHeightAt(x, z) {
    if (x >= -46.0 && x <= 46.0) {
      if (
        (z >= -18.0 && z <= 18.0) ||
        (z >= -408.5 && z <= -391.5) ||
        (z >= 391.5 && z <= 408.5)
      ) {
        return TERRAIN.BRIDGE_DECK_HEIGHT;
      }
    }
    return this.getTerrainHeight(x, z);
  },

  /**
   * Helper to get integer voxel Y floor corresponding to terrain at grid (gx, gz)
   */
  getBaseGy(gx, gz) {
    const wx = gx * VOXEL_SIZE;
    const wz = gz * VOXEL_SIZE;
    return Math.max(-4, Math.floor((this.getGroundHeightAt(wx, wz) + 0.08) / VOXEL_SIZE));
  },

  buildEnvironment() {
    this.staticStructureBoxes = [];
    const era = this.era || (this.mapDef && this.mapDef.era) || 'modern';
    const isModern = era === 'modern';
    const isMedieval = era === 'medieval';
    const isJurassic = era === 'jurassic';

    // 1. Expansive Battlefield-Scale 7,600m x 5,200m (39.52 km^2) 3D Terrain & Air Theater with Vertex Colors
    const groundGeo = new THREE.PlaneGeometry(7600, 5200, 560, 380);
    groundGeo.rotateX(-Math.PI / 2);

    const posAttr = groundGeo.attributes.position;
    const colors = [];
    const cGrass = new THREE.Color(isJurassic ? 0x4f8a46 : isMedieval ? 0x7ca05e : 0x86a870);
    const cFieldMeadow = new THREE.Color(isJurassic ? 0x58944d : isMedieval ? 0x86ab64 : 0x93b26f);
    const cFieldWheat = new THREE.Color(isJurassic ? 0x67944a : isMedieval ? 0x99a663 : 0x9fa96a);
    const cAirbaseTurf = new THREE.Color(0x6d9160);
    const cHighGrass = new THREE.Color(isJurassic ? 0x3b6e35 : isMedieval ? 0x678a4c : 0x6f915c);
    const cRock = new THREE.Color(isJurassic ? 0x4a4542 : isMedieval ? 0x757b80 : 0x76828a);
    const cSnow = new THREE.Color(0xeef5fc);
    const cSand = new THREE.Color(isJurassic ? 0xb59b5c : 0xc6b482);
    const cRoad = new THREE.Color(isJurassic ? 0x69543e : isMedieval ? 0x7c7265 : 0x434950);

    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i);
      const vz = posAttr.getZ(i);
      const vy = this.getTerrainHeight(vx, vz);
      posAttr.setY(i, vy);

      // Determine biome vertex tint from height, meandering riverbanks, road network & countryside plots
      let col = cGrass;
      const rCx = this.getRiverCenterX(vz);
      const distRiver = Math.abs(vx - rCx);
      const onValleyRoad = distRiver > 25 && this._isOnValleyRoad(vx, vz);
      const absVx = Math.abs(vx);
      const teamVz = vx < 0 ? -vz : vz;
      const inAirbaseLawn = isModern && absVx >= 1238 && absVx <= 1630 && teamVz >= 46 && teamVz <= 170;

      if (vy < -0.15 || distRiver < 31) {
        col = cSand;
      } else if (onValleyRoad) {
        col = cRoad;
      } else if (vy > 48.0 && !isJurassic) {
        col = cSnow;
      } else if (vy > 13.5) {
        col = cRock;
      } else if (inAirbaseLawn) {
        col = cAirbaseTurf;
      } else if (vy > 4.6) {
        col = cHighGrass;
      } else {
        const patchVal = Math.sin(vx * 0.0155 + 0.7) * Math.cos(vz * 0.0185 - 0.4);
        if (patchVal > 0.36) col = cFieldWheat;
        else if (patchVal < -0.28) col = cFieldMeadow;
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
    ground.matrixAutoUpdate = false;
    ground.updateMatrix();
    this.scene.add(ground);
    if (this._ownedWorldObjects) this._ownedWorldObjects.push(ground);

    // 1B. Stitched Seamless Continental Horizon Apron (±58,000m = 116 km × 116 km Surround):
    // Shares the exact outer perimeter coordinates & vertex heights of `groundGeo` (±3,800m × ±2,600m)
    // and smoothly transitions through alpine foothills, patchwork valleys, distant ridges, and sky-horizon haze
    // so the playable terrain NEVER looks like a rectangular island floating in empty air from high altitude!
    const skirtSegsPerEdge = 28;
    const perimCount = skirtSegsPerEdge * 4;
    const ringScales = [1.0, 1.08, 1.2, 1.38, 1.65, 2.05, 2.65, 3.55, 4.9, 6.8, 9.6, 13.2, 15.5];
    const numRings = ringScales.length;
    const skirtPos = new Float32Array(perimCount * numRings * 3);
    const skirtCol = new Float32Array(perimCount * numRings * 3);
    const skirtIdx = [];
    const cHorizonSky = new THREE.Color(0x87b8d8);
    const cDistantForest = new THREE.Color(isJurassic ? 0x3f753a : isMedieval ? 0x6c8f54 : 0x729463);
    const cTempSkirt = new THREE.Color();

    const basePerimX = new Float64Array(perimCount);
    const basePerimZ = new Float64Array(perimCount);
    let pCursor = 0;
    // Top edge: (-3800..+3800, -2600)
    for (let s = 0; s < skirtSegsPerEdge; s++) {
      basePerimX[pCursor] = -3800 + (s / skirtSegsPerEdge) * 7600;
      basePerimZ[pCursor] = -2600;
      pCursor++;
    }
    // Right edge: (+3800, -2600..+2600)
    for (let s = 0; s < skirtSegsPerEdge; s++) {
      basePerimX[pCursor] = 3800;
      basePerimZ[pCursor] = -2600 + (s / skirtSegsPerEdge) * 5200;
      pCursor++;
    }
    // Bottom edge: (+3800..-3800, +2600)
    for (let s = 0; s < skirtSegsPerEdge; s++) {
      basePerimX[pCursor] = 3800 - (s / skirtSegsPerEdge) * 7600;
      basePerimZ[pCursor] = 2600;
      pCursor++;
    }
    // Left edge: (-3800, +2600..-2600)
    for (let s = 0; s < skirtSegsPerEdge; s++) {
      basePerimX[pCursor] = -3800;
      basePerimZ[pCursor] = 2600 - (s / skirtSegsPerEdge) * 5200;
      pCursor++;
    }

    for (let r = 0; r < numRings; r++) {
      const scale = ringScales[r];
      const outwardFrac = r === 0 ? 0 : Math.min(1, (scale - 1.0) / 14.5);
      const foothillsDecay = Math.exp(-outwardFrac * 4.2);
      const horizonHaze = Math.pow(Math.max(0, (scale - 2.4) / 13.1), 1.15);

      for (let p = 0; p < perimCount; p++) {
        const bx = basePerimX[p];
        const bz = basePerimZ[p];
        // Smoothly round rectangular corners into a natural circular 60km horizon disc at outer rings
        const ang = Math.atan2(bz, bx);
        const rectDist = Math.hypot(bx, bz);
        const discRadius = 3800 * scale;
        const roundMix = Math.min(1, outwardFrac * 1.6);
        const vx = r === 0 ? bx : THREE.MathUtils.lerp(bx * scale, Math.cos(ang) * discRadius, roundMix);
        const vz = r === 0 ? bz : THREE.MathUtils.lerp(bz * scale, Math.sin(ang) * discRadius, roundMix);

        const seamY = this.getTerrainHeight(bx, bz);
        let vy;
        if (r === 0) {
          vy = seamY;
        } else {
          const outerRolling =
            Math.sin(vx * 0.00085 + 0.4) * Math.cos(vz * 0.00095 - 0.3) * 38.0 +
            Math.sin(vx * 0.0021 - vz * 0.0017) * 16.0 +
            Math.max(0, Math.sin(vx * 0.00042 + vz * 0.00038)) * 95.0 * (1 - horizonHaze * 0.65);
          vy = seamY * foothillsDecay + outerRolling * (1 - foothillsDecay) - horizonHaze * 18.0;
        }

        const vIdx = (r * perimCount + p) * 3;
        skirtPos[vIdx] = vx;
        skirtPos[vIdx + 1] = vy;
        skirtPos[vIdx + 2] = vz;

        let baseCol = cGrass;
        if (vy > 52.0 && !isJurassic) {
          baseCol = cSnow;
        } else if (vy > 18.0) {
          baseCol = cRock;
        } else {
          const macroPatch = Math.sin(vx * 0.0019 + 0.5) * Math.cos(vz * 0.0022 - 0.3);
          baseCol = macroPatch > 0.32 ? cFieldWheat : macroPatch < -0.25 ? cDistantForest : cFieldMeadow;
        }
        cTempSkirt.copy(baseCol).lerp(cHorizonSky, Math.min(0.92, horizonHaze * 0.92));
        skirtCol[vIdx] = cTempSkirt.r;
        skirtCol[vIdx + 1] = cTempSkirt.g;
        skirtCol[vIdx + 2] = cTempSkirt.b;
      }
    }

    for (let r = 0; r < numRings - 1; r++) {
      for (let p = 0; p < perimCount; p++) {
        const pNext = (p + 1) % perimCount;
        const a = r * perimCount + p;
        const b = r * perimCount + pNext;
        const c = (r + 1) * perimCount + p;
        const d = (r + 1) * perimCount + pNext;
        skirtIdx.push(a, c, b, b, c, d);
      }
    }

    const skirtGeo = new THREE.BufferGeometry();
    skirtGeo.setAttribute('position', new THREE.BufferAttribute(skirtPos, 3));
    skirtGeo.setAttribute('color', new THREE.BufferAttribute(skirtCol, 3));
    skirtGeo.setIndex(skirtIdx);
    skirtGeo.computeVertexNormals();

    const skirtMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.96,
      metalness: 0.0,
      flatShading: true
    });
    const horizonSkirt = new THREE.Mesh(skirtGeo, skirtMat);
    horizonSkirt.name = 'ContinentalHorizonSkirt';
    horizonSkirt.receiveShadow = false;
    horizonSkirt.castShadow = false;
    horizonSkirt.frustumCulled = false;
    horizonSkirt.matrixAutoUpdate = false;
    horizonSkirt.updateMatrix();
    this.continentalSkirtMesh = horizonSkirt;
    this.scene.add(horizonSkirt);
    if (this._ownedWorldObjects) this._ownedWorldObjects.push(horizonSkirt);

    // 2. Unbroken Meandering Water Ribbon inside the Sunken River Gorge (follows getRiverCenterX(z) cleanly!)
    let riverTex = null;
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      const waterCanvas = document.createElement('canvas');
      waterCanvas.width = 128;
      waterCanvas.height = 128;
      const wCtx = waterCanvas.getContext('2d');
      if (wCtx) {
        wCtx.fillStyle = '#1d6f99';
        wCtx.fillRect(0, 0, 128, 128);
        for (let y = 0; y < 128; y += 8) {
          wCtx.fillStyle = (y / 8) % 2 === 0 ? 'rgba(135, 215, 245, 0.18)' : 'rgba(12, 48, 72, 0.15)';
          wCtx.fillRect((y * 7) % 32, y, 76, 3);
          wCtx.fillRect(((y * 13) + 64) % 96, y + 4, 48, 2);
        }
      }
      riverTex = new THREE.CanvasTexture(waterCanvas);
      riverTex.wrapS = THREE.RepeatWrapping;
      riverTex.wrapT = THREE.RepeatWrapping;
      riverTex.repeat.set(4, 145);
    }
    this.riverTex = riverTex;

    const riverGeo = new THREE.PlaneGeometry(48, 5200, 6, 420);
    riverGeo.rotateX(-Math.PI / 2);
    const rPosAttr = riverGeo.attributes.position;
    for (let ri = 0; ri < rPosAttr.count; ri++) {
      const rz = rPosAttr.getZ(ri);
      rPosAttr.setX(ri, rPosAttr.getX(ri) + this.getRiverCenterX(rz));
    }
    riverGeo.computeVertexNormals();

    const riverMat = new THREE.MeshStandardMaterial({
      color: 0x2684bf,
      map: riverTex,
      roughness: 0.16,
      metalness: 0.48,
      transparent: true,
      opacity: 0.92,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4
    });
    const river = new THREE.Mesh(riverGeo, riverMat);
    river.position.set(0, -0.85, 0);
    river.receiveShadow = true;
    river.matrixAutoUpdate = false;
    river.updateMatrix();
    this.riverMesh = river;
    this.scene.add(river);
    if (this._ownedWorldObjects) this._ownedWorldObjects.push(river);

    if (isModern) {
      const pushWorldMatrix = (arr, px, py, pz, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
        _instPos.set(px, py, pz);
        _instEuler.set(rx, ry, rz);
        _instQuat.setFromEuler(_instEuler);
        _instScale.set(sx, sy, sz);
        _instWorldMat.compose(_instPos, _instQuat, _instScale);
        const e = _instWorldMat.elements;
        for (let k = 0; k < 16; k++) arr.push(e[k]);
      };

      const pushChildMatrix = (arr, parentMat, lx, ly, lz, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
        _instPos.set(lx, ly, lz);
        _instEuler.set(rx, ry, rz);
        _instQuat.setFromEuler(_instEuler);
        _instScale.set(sx, sy, sz);
        _instLocalMat.compose(_instPos, _instQuat, _instScale);
        _instWorldMat.multiplyMatrices(parentMat, _instLocalMat);
        const e = _instWorldMat.elements;
        for (let k = 0; k < 16; k++) arr.push(e[k]);
      };

      const pushHexColor = (arr, hex) => {
        _instColor.setHex(hex);
        arr.push(_instColor.r, _instColor.g, _instColor.b);
      };

      const registerBatch = (inst) => {
        if (!inst) return;
        this.scene.add(inst);
        if (this._ownedWorldObjects) this._ownedWorldObjects.push(inst);
      };

      // 2B. Upgraded Military Airbase Runways, Taxiways, PAPI Approach Lights, Jet Blast Deflectors & ATC Tower
      const runwayShoulderMat = new THREE.MeshStandardMaterial({
        map: TEXTURES.concrete,
        color: 0x4b5258,
        roughness: 0.9,
        flatShading: true
      });
      const runwayAsphaltMat = new THREE.MeshStandardMaterial({
        map: TEXTURES.darkConcrete,
        color: 0x22272c,
        roughness: 0.82,
        flatShading: true
      });
      const stripeMat = new THREE.MeshBasicMaterial({ color: 0xf5f6fa });
      const taxiYellowMat = new THREE.MeshBasicMaterial({ color: 0xf1c40f });
      const papiRedMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
      const papiWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const threshGreenMat = new THREE.MeshBasicMaterial({ color: 0x2ecc71 });
      const instBulbTintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const deflectorSteelMat = new THREE.MeshStandardMaterial({
        color: 0x3a4148,
        roughness: 0.6,
        metalness: 0.55,
        flatShading: true
      });
      const atcGlassMat = new THREE.MeshBasicMaterial({
        color: 0x74b9ff,
        transparent: true,
        opacity: 0.68
      });
      const windsockOrangeMat = new THREE.MeshBasicMaterial({ color: 0xff6b00 });

      const rwyPianoMatrices = [];
      const rwyThreshLightMatrices = [];
      const rwyThreshLightColors = [];
      const rwyDashMatrices = [];
      const rwyEdgeStalkMatrices = [];
      const rwyEdgeBulbMatrices = [];
      const rwyEdgeBulbColors = [];

      for (const rwy of [
        { cx: -1435, cz: -68, apronZ: -138, team: 'US', takeOffSign: 1 },
        { cx: 1435, cz: 68, apronZ: 138, team: 'RU', takeOffSign: -1 }
      ]) {
        const rwyGroup = new THREE.Group();
        const baseH = 1.25;

        // Deep 2.2m solid concrete foundation embankment sunk into terrain so runway ends NEVER hang in mid-air!
        const shoulderSlab = new THREE.Mesh(
          new THREE.BoxGeometry(374, 2.2, 33),
          runwayShoulderMat
        );
        shoulderSlab.position.set(rwy.cx, baseH - 0.98, rwy.cz);
        shoulderSlab.receiveShadow = true;
        rwyGroup.add(shoulderSlab);

        const slab = new THREE.Mesh(new THREE.BoxGeometry(360, 0.22, 26), runwayAsphaltMat);
        slab.position.set(rwy.cx, baseH + 0.09, rwy.cz);
        slab.receiveShadow = true;
        rwyGroup.add(slab);

        // Continuous 4-Bay Outer Side Flight-Line Parking Apron (z = ∓138):
        // Ordered strictly from BACK (Heaviest / Longest Takeoff Roll) -> FRONT (Fastest Jet):
        //   Bay 1 (∓1576): AC-130 Gunship  •  Bay 2 (∓1528): B-2 Spirit  •  Bay 3 (∓1480): A-10 CAS  •  Bay 4 (∓1436): F-15 Fighter
        const apronCenterX = rwy.team === 'US' ? -1490 : 1490;
        const sideApronShoulder = new THREE.Mesh(
          new THREE.BoxGeometry(236, 2.1, 32),
          runwayShoulderMat
        );
        sideApronShoulder.position.set(apronCenterX, baseH - 0.95, rwy.apronZ);
        rwyGroup.add(sideApronShoulder);

        const sideApronSlab = new THREE.Mesh(
          new THREE.BoxGeometry(228, 0.21, 26),
          runwayAsphaltMat
        );
        sideApronSlab.position.set(apronCenterX, baseH + 0.08, rwy.apronZ);
        sideApronSlab.receiveShadow = true;
        rwyGroup.add(sideApronSlab);

        const bayXs = rwy.team === 'US' ? [-1576, -1528, -1480, -1436] : [1576, 1528, 1480, 1436];
        for (const bayX of bayXs) {
          // Paved connector taxiway & yellow taxi lead from Outer Side Apron across to Runways 2 & 1
          const connTaxiSlab = new THREE.Mesh(
            new THREE.BoxGeometry(14.5, 0.19, 72),
            runwayAsphaltMat
          );
          connTaxiSlab.position.set(
            bayX + rwy.takeOffSign * 8,
            baseH + 0.06,
            (rwy.cz + rwy.apronZ) * 0.5
          );
          connTaxiSlab.receiveShadow = true;
          rwyGroup.add(connTaxiSlab);

          const taxiLead = new THREE.Mesh(
            new THREE.BoxGeometry(0.65, 0.24, 70),
            taxiYellowMat
          );
          taxiLead.position.set(
            bayX + rwy.takeOffSign * 8,
            baseH + 0.11,
            (rwy.cz + rwy.apronZ) * 0.5
          );
          rwyGroup.add(taxiLead);

          const bayStopBar = new THREE.Mesh(
            new THREE.BoxGeometry(12.0, 0.24, 0.55),
            taxiYellowMat
          );
          bayStopBar.position.set(bayX, baseH + 0.11, rwy.apronZ);
          rwyGroup.add(bayStopBar);
        }

        for (const zSide of [-12.1, 12.1]) {
          const sideStripe = new THREE.Mesh(new THREE.BoxGeometry(348, 0.25, 0.45), stripeMat);
          sideStripe.position.set(rwy.cx, baseH + 0.11, rwy.cz + zSide);
          rwyGroup.add(sideStripe);
        }

        // Instanced Piano-Key Threshold Bars & Threshold Lights
        for (const endSign of [-1, 1]) {
          const threshX = rwy.cx + endSign * 168;
          for (let k = -3.5; k <= 3.5; k += 1) {
            pushWorldMatrix(rwyPianoMatrices, threshX, baseH + 0.12, rwy.cz + k * 2.8);
          }
          const tLightHex = endSign === -rwy.takeOffSign ? 0x2ecc71 : 0xff3b30;
          for (let gl = -11; gl <= 11; gl += 4.4) {
            pushWorldMatrix(rwyThreshLightMatrices, rwy.cx + endSign * 175.5, baseH + 0.34, rwy.cz + gl);
            pushHexColor(rwyThreshLightColors, tLightHex);
          }
          for (const zSide of [-6.2, 6.2]) {
            const aimBlock = new THREE.Mesh(new THREE.BoxGeometry(14.5, 0.26, 2.8), stripeMat);
            aimBlock.position.set(rwy.cx + endSign * 124, baseH + 0.12, rwy.cz + zSide);
            rwyGroup.add(aimBlock);

            const tdBar = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.26, 1.4), stripeMat);
            tdBar.position.set(rwy.cx + endSign * 146, baseH + 0.12, rwy.cz + zSide * 0.85);
            rwyGroup.add(tdBar);
          }
        }

        // Instanced Centerline Dashes & Runway Edge Light Stalks/Bulbs
        const edgeBulbHex = rwy.team === 'US' ? 0x00d2d3 : 0xff7675;
        for (let sx = -154; sx <= 154; sx += 14) {
          pushWorldMatrix(rwyDashMatrices, rwy.cx + sx, baseH + 0.12, rwy.cz);
          for (const side of [-1, 1]) {
            pushWorldMatrix(rwyEdgeStalkMatrices, rwy.cx + sx, baseH + 0.25, rwy.cz + side * 13.4);
            pushWorldMatrix(rwyEdgeBulbMatrices, rwy.cx + sx, baseH + 0.5, rwy.cz + side * 13.4);
            pushHexColor(rwyEdgeBulbColors, edgeBulbHex);
          }
        }

        // PAPI 4-Light Precision Approach Path Indicator Array beside touchdown zone
        const papiX = rwy.cx - rwy.takeOffSign * 134;
        const papiZ = rwy.cz + (rwy.team === 'US' ? 16.8 : -16.8);
        for (let pIdx = 0; pIdx < 4; pIdx++) {
          const pBox = new THREE.Mesh(
            new THREE.BoxGeometry(0.85, 0.55, 0.95),
            deflectorSteelMat
          );
          pBox.position.set(papiX, baseH + 0.45, papiZ + (pIdx - 1.5) * 1.65);
          const pLens = new THREE.Mesh(
            new THREE.BoxGeometry(0.18, 0.36, 0.68),
            pIdx < 2 ? papiWhiteMat : papiRedMat
          );
          pLens.position.set(
            papiX + rwy.takeOffSign * 0.44,
            baseH + 0.46,
            papiZ + (pIdx - 1.5) * 1.65
          );
          rwyGroup.add(pBox, pLens);
        }

        // Angled Steel Jet Blast Deflector Wall behind departure end
        const jbdX = rwy.cx - rwy.takeOffSign * 182.5;
        this.registerStaticStructureBox?.(
          jbdX - 2.6,
          jbdX + 2.6,
          rwy.cz - 12.0,
          rwy.cz + 12.0,
          'jet_blast_deflector'
        );
        const jbdPanel = new THREE.Mesh(
          new THREE.BoxGeometry(1.2, 4.2, 22.0),
          deflectorSteelMat
        );
        jbdPanel.position.set(jbdX, baseH + 1.9, rwy.cz);
        jbdPanel.rotation.z = rwy.takeOffSign * 0.48;
        rwyGroup.add(jbdPanel);
        for (let sz = -9; sz <= 9; sz += 4.5) {
          const strut = new THREE.Mesh(
            new THREE.BoxGeometry(2.6, 0.28, 0.28),
            deflectorSteelMat
          );
          strut.position.set(jbdX - rwy.takeOffSign * 1.1, baseH + 1.1, rwy.cz + sz);
          strut.rotation.z = -rwy.takeOffSign * 0.55;
          rwyGroup.add(strut);
        }

        // Air Traffic Control (ATC) Tower & Windsock positioned cleanly on ONE OUTER SIDE (z = ∓146, x = ∓1390), NEVER between runways!
        const atcX = rwy.team === 'US' ? -1390 : 1390;
        const atcZ = rwy.team === 'US' ? -146 : 146;
        this.registerStaticStructureBox?.(
          atcX - 4.8,
          atcX + 8.6,
          atcZ - 4.8,
          atcZ + 4.8,
          'atc_tower'
        );
        const atcShaft = new THREE.Mesh(
          new THREE.BoxGeometry(4.8, 12.5, 4.8),
          runwayShoulderMat
        );
        atcShaft.position.set(atcX, baseH + 6.25, atcZ);
        atcShaft.castShadow = true;
        const atcCabGlass = new THREE.Mesh(
          new THREE.CylinderGeometry(3.8, 3.3, 3.2, 8),
          atcGlassMat
        );
        atcCabGlass.position.set(atcX, baseH + 14.1, atcZ);
        const atcRoof = new THREE.Mesh(
          new THREE.CylinderGeometry(4.2, 4.0, 0.55, 8),
          deflectorSteelMat
        );
        atcRoof.position.set(atcX, baseH + 15.9, atcZ);
        const atcBeacon = new THREE.Mesh(
          new THREE.SphereGeometry(0.48, 8, 8),
          threshGreenMat
        );
        atcBeacon.position.set(atcX, baseH + 17.1, atcZ);
        rwyGroup.add(atcShaft, atcCabGlass, atcRoof, atcBeacon);

        // Windsock Mast beside ATC Tower
        const wsPole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.12, 6.2, 6),
          deflectorSteelMat
        );
        wsPole.position.set(atcX + 6.5, baseH + 3.1, atcZ);
        const wsCone = new THREE.Mesh(
          new THREE.ConeGeometry(0.45, 2.2, 8),
          windsockOrangeMat
        );
        wsCone.rotation.z = -Math.PI / 2 + 0.18;
        wsCone.position.set(atcX + 7.6, baseH + 5.8, atcZ);
        rwyGroup.add(wsPole, wsCone);

        this.scene.add(rwyGroup);
        if (this._ownedWorldObjects) this._ownedWorldObjects.push(rwyGroup);
      }

      registerBatch(buildStaticInstancedBatch(_rwyPianoKeyGeo, stripeMat, rwyPianoMatrices));
      registerBatch(buildStaticInstancedBatch(_rwyThreshLightGeo, instBulbTintMat, rwyThreshLightMatrices, rwyThreshLightColors));
      registerBatch(buildStaticInstancedBatch(_rwyDashGeo, stripeMat, rwyDashMatrices));
      registerBatch(buildStaticInstancedBatch(_rwyEdgeStalkGeo, deflectorSteelMat, rwyEdgeStalkMatrices));
      registerBatch(buildStaticInstancedBatch(_rwyEdgeBulbGeo, instBulbTintMat, rwyEdgeBulbMatrices, rwyEdgeBulbColors));

      // 2C. Dedicated Northrop B-2 Spirit Stealth Bomber HQ Runway Lane
      const b2StealthAsphaltMat = new THREE.MeshStandardMaterial({
        color: 0x161b22,
        roughness: 0.72,
        metalness: 0.25,
        flatShading: true
      });
      const b2GoldStripeMat = new THREE.MeshBasicMaterial({ color: 0xffd32a });
      const b2BeaconTintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

      const b2PianoMatrices = [];
      const b2DashMatrices = [];
      const b2BeaconMatrices = [];
      const b2BeaconColors = [];

      for (const b2Lane of [
        { cx: -1435, cz: -104, hangarX: -1528, hangarZ: -138, taxiX: -1495, taxiZ: -54, team: 'US' },
        { cx: 1435, cz: 104, hangarX: 1528, hangarZ: 138, taxiX: 1495, taxiZ: 54, team: 'RU' }
      ]) {
        const laneGroup = new THREE.Group();
        const baseH = 1.25;

        // Deep 2.2m concrete foundation embankment so Stealth Runway 2 never hangs in mid-air at either end!
        const stealthShoulder = new THREE.Mesh(
          new THREE.BoxGeometry(374, 2.2, 34),
          runwayShoulderMat
        );
        stealthShoulder.position.set(b2Lane.cx, baseH - 0.98, b2Lane.cz);
        laneGroup.add(stealthShoulder);

        const stealthSlab = new THREE.Mesh(
          new THREE.BoxGeometry(360, 0.24, 28),
          b2StealthAsphaltMat
        );
        stealthSlab.position.set(b2Lane.cx, baseH + 0.09, b2Lane.cz);
        stealthSlab.receiveShadow = true;
        laneGroup.add(stealthSlab);

        const taxiwaySlab = new THREE.Mesh(
          new THREE.BoxGeometry(38, 0.2, 42),
          runwayAsphaltMat
        );
        taxiwaySlab.position.set(b2Lane.taxiX, baseH + 0.06, b2Lane.taxiZ);
        taxiwaySlab.receiveShadow = true;
        laneGroup.add(taxiwaySlab);

        const taxiCenterline = new THREE.Mesh(
          new THREE.BoxGeometry(0.55, 0.23, 40),
          taxiYellowMat
        );
        taxiCenterline.position.set(b2Lane.taxiX, baseH + 0.08, b2Lane.taxiZ);
        laneGroup.add(taxiCenterline);

        for (const hsZ of [b2Lane.team === 'US' ? -48 : 48, b2Lane.team === 'US' ? -84 : 84]) {
          const holdBar = new THREE.Mesh(
            new THREE.BoxGeometry(14.0, 0.24, 0.75),
            taxiYellowMat
          );
          holdBar.position.set(b2Lane.taxiX, baseH + 0.09, hsZ);
          laneGroup.add(holdBar);
        }

        // Instanced Piano-Key Thresholds on Stealth Runway Ends
        for (const endSign of [-1, 1]) {
          for (let k = -3.5; k <= 3.5; k += 1) {
            pushWorldMatrix(b2PianoMatrices, b2Lane.cx + endSign * 168, baseH + 0.12, b2Lane.cz + k * 3.0);
          }
        }

        // Instanced Gold Stealth Centerline Dashes & Violet/Gold Edge Guidance Beacons
        for (let sx = -154; sx <= 154; sx += 14) {
          pushWorldMatrix(b2DashMatrices, b2Lane.cx + sx, baseH + 0.12, b2Lane.cz);
          const beaconHex = sx % 28 === 0 ? 0xffd32a : 0xa29bfe;
          for (const side of [-1, 1]) {
            pushWorldMatrix(b2BeaconMatrices, b2Lane.cx + sx, baseH + 0.38, b2Lane.cz + side * 13.6);
            pushHexColor(b2BeaconColors, beaconHex);
          }
        }

        this.scene.add(laneGroup);
        if (this._ownedWorldObjects) this._ownedWorldObjects.push(laneGroup);
      }

      registerBatch(buildStaticInstancedBatch(_b2PianoKeyGeo, b2GoldStripeMat, b2PianoMatrices));
      registerBatch(buildStaticInstancedBatch(_b2DashGeo, b2GoldStripeMat, b2DashMatrices));
      registerBatch(buildStaticInstancedBatch(_b2BeaconGeo, b2BeaconTintMat, b2BeaconMatrices, b2BeaconColors));

      // 2D. High-Security Main Base Perimeter Fortifications (Instanced Piers, Y-Arms, Coils, Wire Strands & Boom Gates)
      const secWallMat = new THREE.MeshStandardMaterial({
        map: TEXTURES.concrete,
        color: 0x576066,
        roughness: 0.85,
        flatShading: true
      });
      const secCopingMat = new THREE.MeshStandardMaterial({
        map: TEXTURES.darkConcrete,
        color: 0x343b40,
        roughness: 0.8,
        flatShading: true
      });
      const wireSteelMat = new THREE.MeshStandardMaterial({
        color: 0x9aa4ad,
        roughness: 0.42,
        metalness: 0.78,
        flatShading: true
      });
      const fencePostMat = new THREE.MeshStandardMaterial({
        color: 0x2c3338,
        roughness: 0.6,
        metalness: 0.55,
        flatShading: true
      });
      const boomSegTintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

      const secPierMatrices = [];
      const secYPostMatrices = [];
      const secYArmMatrices = [];
      const secStrandMatrices = [];
      const secTopCoilMatrices = [];
      const secGroundCoilMatrices = [];
      const boomSegMatrices = [];
      const boomSegColors = [];

      const addWallWithBarbedWire = (grp, x1, z1, x2, z2, wallH = 3.2) => {
        const dx = x2 - x1;
        const dz = z2 - z1;
        const len = Math.hypot(dx, dz);
        if (len < 1) return;
        this.registerStaticStructureBox?.(
          Math.min(x1, x2) - 0.95,
          Math.max(x1, x2) + 0.95,
          Math.min(z1, z2) - 0.95,
          Math.max(z1, z2) + 0.95,
          'perimeter_wall'
        );
        const mx = (x1 + x2) * 0.5;
        const mz = (z1 + z2) * 0.5;
        const groundY = this.getGroundHeightAt(mx, mz);
        const yaw = Math.atan2(dx, dz);

        const segGroup = new THREE.Group();
        segGroup.position.set(mx, groundY, mz);
        segGroup.rotation.y = yaw;

        // Reinforced Concrete Security Wall + Deep 2.4m Buried Foundation Plinth + Dark Concrete Top Coping
        const buriedDepth = 2.4;
        const wallMesh = new THREE.Mesh(
          new THREE.BoxGeometry(1.15, wallH + buriedDepth, len),
          secWallMat
        );
        wallMesh.position.set(0, (wallH - buriedDepth) * 0.5, 0);
        wallMesh.castShadow = true;
        wallMesh.receiveShadow = true;
        segGroup.add(wallMesh);

        const copingMesh = new THREE.Mesh(
          new THREE.BoxGeometry(1.35, 0.28, len + 0.2),
          secCopingMat
        );
        copingMesh.position.set(0, wallH + 0.14, 0);
        segGroup.add(copingMesh);
        grp.add(segGroup);

        // Compute parent segment world matrix once for all instanced fence details along this wall
        _instParentMat.makeRotationY(yaw).setPosition(mx, groundY, mz);

        const step = 6.0;
        const halfLen = len * 0.5;
        const pierScaleY = (wallH + 0.2) / 3.4;
        for (let s = -halfLen + 1.5; s <= halfLen - 1.5; s += step) {
          pushChildMatrix(secPierMatrices, _instParentMat, 0, wallH * 0.5, s, 0, 0, 0, 1, pierScaleY, 1);
          pushChildMatrix(secYPostMatrices, _instParentMat, 0, wallH + 0.65, s);
          pushChildMatrix(secYArmMatrices, _instParentMat, -0.22, wallH + 1.05, s, 0, 0, 0.55);
          pushChildMatrix(secYArmMatrices, _instParentMat, 0.22, wallH + 1.05, s, 0, 0, -0.55);
        }

        // 3 horizontal taut barbed-wire tension strands along the top Y-brackets
        for (const wxOff of [-0.32, 0, 0.32]) {
          pushChildMatrix(secStrandMatrices, _instParentMat, wxOff, wallH + 1.12, 0, Math.PI / 2, 0, 0, 1, len, 1);
        }

        // Concertina Razor-Wire Coils along the top of the wall + ground-level outer razor wire
        for (let c = -halfLen + 1.2; c <= halfLen - 1.2; c += 1.45) {
          pushChildMatrix(secTopCoilMatrices, _instParentMat, 0, wallH + 0.92, c, 0, 0.35, 0);
          if (Math.abs(c % 2.9) < 1.5) {
            pushChildMatrix(secGroundCoilMatrices, _instParentMat, 1.35, 0.52, c, 0, 0.25, 0);
          }
        }
      };

      for (const hq of [
        { team: 'US', sign: -1, frontX: -1436, backX: -1626, rwyZ: -48, outerRwyZ: -168, oppZ: 52, rwyGateCenter: -1495 },
        { team: 'RU', sign: 1, frontX: 1436, backX: 1626, rwyZ: 48, outerRwyZ: 168, oppZ: -52, rwyGateCenter: 1495 }
      ]) {
        const secGroup = new THREE.Group();

        if (hq.team === 'US') {
          addWallWithBarbedWire(secGroup, hq.frontX, hq.rwyZ, hq.frontX, -16, 3.2);
          addWallWithBarbedWire(secGroup, hq.frontX, 16, hq.frontX, hq.oppZ, 3.2);
          addWallWithBarbedWire(secGroup, hq.backX, hq.oppZ, hq.frontX, hq.oppZ, 3.2);
          addWallWithBarbedWire(secGroup, hq.backX, hq.outerRwyZ, hq.backX, hq.oppZ, 3.2);
          addWallWithBarbedWire(secGroup, hq.backX, hq.rwyZ, -1512, hq.rwyZ, 3.2);
          addWallWithBarbedWire(secGroup, -1478, hq.rwyZ, -1250, hq.rwyZ, 3.2);
          addWallWithBarbedWire(secGroup, hq.backX, hq.outerRwyZ, -1250, hq.outerRwyZ, 3.2);
        } else {
          addWallWithBarbedWire(secGroup, hq.frontX, hq.oppZ, hq.frontX, -16, 3.2);
          addWallWithBarbedWire(secGroup, hq.frontX, 16, hq.frontX, hq.rwyZ, 3.2);
          addWallWithBarbedWire(secGroup, hq.frontX, hq.oppZ, hq.backX, hq.oppZ, 3.2);
          addWallWithBarbedWire(secGroup, hq.backX, hq.oppZ, hq.backX, hq.outerRwyZ, 3.2);
          addWallWithBarbedWire(secGroup, 1250, hq.rwyZ, 1478, hq.rwyZ, 3.2);
          addWallWithBarbedWire(secGroup, 1512, hq.rwyZ, hq.backX, hq.rwyZ, 3.2);
          addWallWithBarbedWire(secGroup, 1250, hq.outerRwyZ, hq.backX, hq.outerRwyZ, 3.2);
        }

        // 2. Armored Checkpoint Guardhouses & Instanced Red/White Striped Boom Barriers at Main Road Gate
        for (const gateSide of [-1, 1]) {
          const gz = gateSide * 17.5;
          const gx = hq.frontX;
          const gy = this.getGroundHeightAt(gx, gz);
          this.registerStaticStructureBox?.(
            gx - 2.4,
            gx + 2.4,
            gz - 2.4,
            gz + 2.4,
            'guard_booth'
          );

          const booth = new THREE.Mesh(
            new THREE.BoxGeometry(3.6, 5.2, 3.6),
            secWallMat
          );
          booth.position.set(gx, gy + 0.6, gz);
          booth.castShadow = true;
          const boothRoof = new THREE.Mesh(
            new THREE.BoxGeometry(4.2, 0.38, 4.2),
            secCopingMat
          );
          boothRoof.position.set(gx, gy + 3.35, gz);
          const boothVisor = new THREE.Mesh(
            new THREE.BoxGeometry(3.75, 0.95, 3.75),
            atcGlassMat
          );
          boothVisor.position.set(gx, gy + 2.15, gz);
          secGroup.add(booth, boothRoof, boothVisor);

          _instParentMat
            .makeRotationX(gateSide * 0.72)
            .setPosition(gx - hq.sign * 1.6, gy + 1.25, gz - gateSide * 2.1);
          for (let b = 0; b < 6; b++) {
            pushChildMatrix(boomSegMatrices, _instParentMat, 0, 0, -gateSide * (b * 1.35 + 0.68));
            pushHexColor(boomSegColors, b % 2 === 0 ? 0xd63031 : 0xf5f6fa);
          }

          const towerPole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.18, 0.26, 11.5, 8),
            fencePostMat
          );
          towerPole.position.set(gx + hq.sign * 2.4, gy + 5.75, gz + gateSide * 2.8);
          const lightHead = new THREE.Mesh(
            new THREE.BoxGeometry(0.85, 0.55, 2.2),
            papiWhiteMat
          );
          lightHead.position.set(gx + hq.sign * 2.1, gy + 11.5, gz + gateSide * 2.8);
          secGroup.add(towerPole, lightHead);
        }

        // 3. Second Checkpoint Gate in the Runway Perimeter Wall
        for (const rwyGateSide of [-1, 1]) {
          const rgx = hq.rwyGateCenter + rwyGateSide * 18.5;
          const rgz = hq.rwyZ;
          const rgy = this.getGroundHeightAt(rgx, rgz);
          this.registerStaticStructureBox?.(
            rgx - 2.4,
            rgx + 2.4,
            rgz - 2.4,
            rgz + 2.4,
            'runway_gate_booth'
          );

          const rBooth = new THREE.Mesh(
            new THREE.BoxGeometry(3.6, 3.2, 3.6),
            secWallMat
          );
          rBooth.position.set(rgx, rgy + 1.6, rgz);
          rBooth.castShadow = true;
          const rBoothRoof = new THREE.Mesh(
            new THREE.BoxGeometry(4.2, 0.38, 4.2),
            secCopingMat
          );
          rBoothRoof.position.set(rgx, rgy + 3.35, rgz);
          const rBoothVisor = new THREE.Mesh(
            new THREE.BoxGeometry(3.75, 0.95, 3.75),
            atcGlassMat
          );
          rBoothVisor.position.set(rgx, rgy + 2.15, rgz);
          secGroup.add(rBooth, rBoothRoof, rBoothVisor);

          _instParentMat
            .makeRotationZ(-rwyGateSide * 0.72)
            .setPosition(rgx - rwyGateSide * 2.1, rgy + 1.25, rgz);
          for (let b = 0; b < 6; b++) {
            pushChildMatrix(boomSegMatrices, _instParentMat, -rwyGateSide * (b * 1.35 + 0.68), 0, 0, 0, Math.PI / 2, 0);
            pushHexColor(boomSegColors, b % 2 === 0 ? 0xd63031 : 0xf5f6fa);
          }

          const rTowerPole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.18, 0.26, 11.5, 8),
            fencePostMat
          );
          rTowerPole.position.set(rgx + rwyGateSide * 2.6, rgy + 5.75, rgz - hq.sign * 2.2);
          const rLightHead = new THREE.Mesh(
            new THREE.BoxGeometry(2.2, 0.55, 0.85),
            papiWhiteMat
          );
          rLightHead.position.set(rgx + rwyGateSide * 2.6, rgy + 11.5, rgz - hq.sign * 1.9);
          secGroup.add(rTowerPole, rLightHead);
        }

        this.scene.add(secGroup);
        if (this._ownedWorldObjects) this._ownedWorldObjects.push(secGroup);
      }

      registerBatch(buildStaticInstancedBatch(_secPierGeo, secCopingMat, secPierMatrices));
      registerBatch(buildStaticInstancedBatch(_secYPostGeo, fencePostMat, secYPostMatrices));
      registerBatch(buildStaticInstancedBatch(_secYArmGeo, fencePostMat, secYArmMatrices));
      registerBatch(buildStaticInstancedBatch(_secStrandUnitGeo, wireSteelMat, secStrandMatrices));
      registerBatch(buildStaticInstancedBatch(_secTopCoilGeo, wireSteelMat, secTopCoilMatrices));
      registerBatch(buildStaticInstancedBatch(_secGroundCoilGeo, wireSteelMat, secGroundCoilMatrices));
      registerBatch(buildStaticInstancedBatch(_boomSegGeo, boomSegTintMat, boomSegMatrices, boomSegColors));
    } // end if (isModern)

    if (isMedieval) {
      this.buildMedievalCastlesAndFortifications();
    } else if (isJurassic) {
      this.buildJurassicJungleStructures();
    }

    // 3. Three Grand 92m-Wide Stone/Concrete Bridges spanning the full 84m River Gorge (z = -400, 0, +400)
    //    Anchors 4m deep into both dry riverbanks (x = -46m..+46m at y = 1.25m) so Objective C & all 3 bridges
    //    have 100% flush, continuous walk/drive access from BOTH West & East banks!
    const bridgeDeckGeo = new THREE.BoxGeometry(92, 0.9, 17.5);
    const centralPlazaDeckGeo = new THREE.BoxGeometry(92, 0.9, 36.5);
    const bridgeDeckMat = new THREE.MeshStandardMaterial({
      map: TEXTURES.darkConcrete,
      color: isMedieval ? 0x6c727a : 0xffffff,
      roughness: 0.88
    });
    const pierGeo = new THREE.BoxGeometry(3.4, 5.6, 15.5);
    const plazaPierGeo = new THREE.BoxGeometry(3.6, 5.6, 33.5);

    for (const bz of [-400, 0, 400]) {
      const bridge = new THREE.Mesh(
        bz === 0 ? centralPlazaDeckGeo : bridgeDeckGeo,
        bridgeDeckMat
      );
      bridge.position.set(0, 0.8, bz); // Top deck surface = 0.8 + 0.45 = exact 1.25m (flush with banks & roads!)
      bridge.castShadow = true;
      bridge.receiveShadow = true;
      this.scene.add(bridge);
      if (this._ownedWorldObjects) this._ownedWorldObjects.push(bridge);

      for (const px of [-26, -13, 0, 13, 26]) {
        const pier = new THREE.Mesh(bz === 0 ? plazaPierGeo : pierGeo, bridgeDeckMat);
        pier.position.set(px, -1.65, bz);
        this.scene.add(pier);
        if (this._ownedWorldObjects) this._ownedWorldObjects.push(pier);
      }

      // Destructible side bridge parapets along North & South edges (West & East ends stay 100% open for vehicles & troops!)
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

    // =========================================================================
    // 4. DATA-DRIVEN SECTOR STRUCTURES FROM MAP DEFINITION (src/maps/frugis-river.js)
    // =========================================================================
    const mapDef = this.mapDef;
    if (mapDef) {
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
      if (mapDef.radarTowers) {
        for (const [wx, wz] of mapDef.radarTowers) {
          this.buildRadarTower(wx, wz);
        }
      }
      if (mapDef.ammoCrates) {
        for (const [wx, wz] of mapDef.ammoCrates) {
          this.addAmmoCrate(wx, wz);
        }
      }
    }

    this.scatterStreetPropsAndTrees();
  },

  scatterStreetPropsAndTrees() {
    this.lampBulbs = [];
    this.atmosphereMode = 'DAY';
    const era = this.era || (this.mapDef && this.mapDef.era) || 'modern';

    const dummy = new THREE.Object3D();

    // =========================================================================
    // 1. INSTANCED STREETLAMPS (Modern Era Only)
    // =========================================================================
    if (era === 'modern') {
      const lampPositions = [];
      for (let x = -1420; x <= 1420; x += 65) {
        if (Math.abs(x) < 22) continue;
        for (const zSide of [-8.2, 8.2]) {
          lampPositions.push({ x, z: zSide, wy: this.getTerrainHeight(x, zSide) });
        }
      }

      const lampCount = lampPositions.length;
      const poleGeo = new THREE.BoxGeometry(0.22, 6.8, 0.22);
      const armGeo = new THREE.BoxGeometry(1.6, 0.16, 0.16);
      const bulbGeo = new THREE.BoxGeometry(0.42, 0.14, 0.28);
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x4a525a, metalness: 0.5, roughness: 0.55 });
      const bulbMat = new THREE.MeshBasicMaterial({ color: 0x95a5a6 });
      this.lampBulbMat = bulbMat;
      // Keep compatible entry in this.lampBulbs so WeatherSystem.setAtmosphereMode updates all bulbs in O(1)
      this.lampBulbs.push({ material: bulbMat });

      const poleInst = new THREE.InstancedMesh(poleGeo, poleMat, lampCount);
      const armInst = new THREE.InstancedMesh(armGeo, poleMat, lampCount);
      const bulbInst = new THREE.InstancedMesh(bulbGeo, bulbMat, lampCount);

      for (let i = 0; i < lampCount; i++) {
        const lp = lampPositions[i];
        const armZ = lp.z > 0 ? -0.6 : 0.6;

        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);

        dummy.position.set(lp.x, lp.wy + 3.4, lp.z);
        dummy.updateMatrix();
        poleInst.setMatrixAt(i, dummy.matrix);

        dummy.position.set(lp.x, lp.wy + 6.7, lp.z + armZ);
        dummy.updateMatrix();
        armInst.setMatrixAt(i, dummy.matrix);

        dummy.position.set(lp.x, lp.wy + 6.58, lp.z + armZ * 1.4);
        dummy.updateMatrix();
        bulbInst.setMatrixAt(i, dummy.matrix);
      }
      poleInst.instanceMatrix.needsUpdate = true;
      armInst.instanceMatrix.needsUpdate = true;
      bulbInst.instanceMatrix.needsUpdate = true;
      poleInst.matrixAutoUpdate = false;
      armInst.matrixAutoUpdate = false;
      bulbInst.matrixAutoUpdate = false;
      poleInst.computeBoundingSphere();
      armInst.computeBoundingSphere();
      bulbInst.computeBoundingSphere();
      this.scene.add(poleInst, armInst, bulbInst);
      if (this._ownedWorldObjects) {
        this._ownedWorldObjects.push(poleInst, armInst, bulbInst);
      }
    } else {
      const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffb142 });
      this.lampBulbMat = bulbMat;
      this.lampBulbs.push({ material: bulbMat });
    }

    // =========================================================================
    // 2. INSTANCED PINE TREES & ALPINE BOULDERS (~405 meshes -> 5 GPU calls!)
    // =========================================================================
    const trunkGeo = new THREE.BoxGeometry(0.65, 2.8, 0.65);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.92 });
    const leavesLowGeo = new THREE.ConeGeometry(2.7, 3.8, 6);
    const leavesMidGeo = new THREE.ConeGeometry(2.1, 3.4, 6);
    const leavesTopGeo = new THREE.ConeGeometry(1.4, 2.8, 6);
    const leavesMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.88,
      flatShading: true
    });
    const rockGeo = new THREE.DodecahedronGeometry(2.4, 0);
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x6c757d,
      roughness: 0.9,
      flatShading: true
    });

    const treeCoords = (this.mapDef && this.mapDef.treeCoords) || [];
    const treeCount = treeCoords.length;
    const rockCount = Math.ceil(treeCount / 2);

    if (treeCount > 0) {
      const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
      const l1Inst = new THREE.InstancedMesh(leavesLowGeo, leavesMat, treeCount);
      const l2Inst = new THREE.InstancedMesh(leavesMidGeo, leavesMat, treeCount);
      const l3Inst = new THREE.InstancedMesh(leavesTopGeo, leavesMat, treeCount);
      const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);

      trunkInst.castShadow = true;
      l1Inst.castShadow = true;
      l1Inst.receiveShadow = true;
      l2Inst.castShadow = true;
      l2Inst.receiveShadow = true;
      l3Inst.castShadow = true;
      rockInst.castShadow = true;
      rockInst.receiveShadow = true;

      const foliagePalette = [
        new THREE.Color(0x2e5430),
        new THREE.Color(0x284b2a),
        new THREE.Color(0x345e36),
        new THREE.Color(0x2b502d)
      ];
      const topTint = new THREE.Color();

      let rIdx = 0;
      for (let i = 0; i < treeCount; i++) {
        const [tx, tz] = treeCoords[i];
        const ty = this.getTerrainHeight(tx, tz);
        const scale = 0.92 + (i % 5) * 0.12;
        const yaw = (i * 1.17) % (Math.PI * 2);

        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(scale, scale, scale);

        dummy.position.set(tx, ty + 1.4 * scale, tz);
        dummy.updateMatrix();
        trunkInst.setMatrixAt(i, dummy.matrix);

        dummy.position.set(tx, ty + 3.5 * scale, tz);
        dummy.updateMatrix();
        l1Inst.setMatrixAt(i, dummy.matrix);

        dummy.position.set(tx, ty + 5.3 * scale, tz);
        dummy.updateMatrix();
        l2Inst.setMatrixAt(i, dummy.matrix);

        dummy.position.set(tx, ty + 6.9 * scale, tz);
        dummy.updateMatrix();
        l3Inst.setMatrixAt(i, dummy.matrix);

        // Subtle tier-by-tier vertical lighting & natural pine tint variation
        const baseCol = foliagePalette[i % foliagePalette.length];
        topTint.copy(baseCol).multiplyScalar(0.92);
        l1Inst.setColorAt(i, topTint);
        l2Inst.setColorAt(i, baseCol);
        topTint.copy(baseCol).multiplyScalar(1.08);
        l3Inst.setColorAt(i, topTint);

        if (i % 2 === 0 && rIdx < rockCount) {
          const rx = tx + 4.5;
          const rz = tz - 3.5;
          dummy.position.set(rx, this.getTerrainHeight(rx, rz) + 0.85, rz);
          dummy.rotation.set(i, i * 0.7, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          rockInst.setMatrixAt(rIdx++, dummy.matrix);
        }
      }

      trunkInst.instanceMatrix.needsUpdate = true;
      l1Inst.instanceMatrix.needsUpdate = true;
      l2Inst.instanceMatrix.needsUpdate = true;
      l3Inst.instanceMatrix.needsUpdate = true;
      if (l1Inst.instanceColor) l1Inst.instanceColor.needsUpdate = true;
      if (l2Inst.instanceColor) l2Inst.instanceColor.needsUpdate = true;
      if (l3Inst.instanceColor) l3Inst.instanceColor.needsUpdate = true;
      rockInst.count = rIdx;
      rockInst.instanceMatrix.needsUpdate = true;

      trunkInst.matrixAutoUpdate = false;
      l1Inst.matrixAutoUpdate = false;
      l2Inst.matrixAutoUpdate = false;
      l3Inst.matrixAutoUpdate = false;
      rockInst.matrixAutoUpdate = false;
      trunkInst.computeBoundingSphere();
      l1Inst.computeBoundingSphere();
      l2Inst.computeBoundingSphere();
      l3Inst.computeBoundingSphere();
      if (rIdx > 0) rockInst.computeBoundingSphere();

      this.scene.add(trunkInst, l1Inst, l2Inst, l3Inst, rockInst);
      if (this._ownedWorldObjects) {
        this._ownedWorldObjects.push(trunkInst, l1Inst, l2Inst, l3Inst, rockInst);
      }
    }
  },

  /**
   * MEDIEVAL ERA: Builds Real Destructible Voxel Stone Castles, Crenellated Curtain Walls,
   * Walk-Up Stone Rampart Stairs, Corner Battlement Towers, Gatehouse Archways, Central Stone Keeps,
   * Half-Timbered Tudor Village Guildhalls & Taverns, Medieval Windmills, and Timber Palisades!
   * Because the castles are built from real voxels in `this.voxels`, they have 100% physical
   * collision AND can be blasted apart block-by-block by Trebuchet Boulders!
   */
  buildMedievalCastlesAndFortifications() {
    const castleTrimMat = new THREE.MeshStandardMaterial({
      map: TEXTURES.concrete,
      color: 0x7d838b,
      roughness: 0.88,
      flatShading: true
    });
    const slateRoofBlueMat = new THREE.MeshStandardMaterial({
      color: 0x1e3a5f,
      roughness: 0.78,
      flatShading: true
    });
    const slateRoofRedMat = new THREE.MeshStandardMaterial({
      color: 0x6e1e1e,
      roughness: 0.78,
      flatShading: true
    });
    const timberMat = new THREE.MeshStandardMaterial({
      color: 0x5c3a21,
      roughness: 0.88,
      flatShading: true
    });
    const portcullisIronMat = new THREE.MeshStandardMaterial({
      color: 0x22272e,
      metalness: 0.65,
      roughness: 0.45,
      flatShading: true
    });
    const bannerBlueMat = new THREE.MeshStandardMaterial({
      color: 0x1d4ed8,
      roughness: 0.65,
      side: THREE.DoubleSide
    });
    const bannerRedMat = new THREE.MeshStandardMaterial({
      color: 0xb91c1c,
      roughness: 0.65,
      side: THREE.DoubleSide
    });
    const sailCanvasMat = new THREE.MeshStandardMaterial({
      color: 0xd8ceb8,
      roughness: 0.85,
      side: THREE.DoubleSide
    });
    const fireGlowMat = new THREE.MeshBasicMaterial({ color: 0xff8c1a });

    const castleSites = [
      { cx: -1520, cz: 0, halfGx: 26, halfGz: 22, wallH: 6, keepH: 12, faction: 'US', isHQ: true },
      { cx: 1520, cz: 0, halfGx: 26, halfGz: 22, wallH: 6, keepH: 12, faction: 'RU', isHQ: true },
      { cx: -1060, cz: 0, halfGx: 18, halfGz: 15, wallH: 5, keepH: 9, faction: 'US', isHQ: false },
      { cx: 1060, cz: 0, halfGx: 18, halfGz: 15, wallH: 5, keepH: 9, faction: 'RU', isHQ: false },
      { cx: -660, cz: -280, halfGx: 20, halfGz: 17, wallH: 6, keepH: 11, faction: 'US', isHQ: false },
      { cx: -320, cz: 320, halfGx: 19, halfGz: 16, wallH: 5, keepH: 10, faction: 'US', isHQ: false },
      { cx: 0, cz: 0, halfGx: 19, halfGz: 16, wallH: 6, keepH: 10, faction: 'NEUTRAL', isHQ: false },
      { cx: 330, cz: -320, halfGx: 20, halfGz: 17, wallH: 6, keepH: 11, faction: 'RU', isHQ: false },
      { cx: 660, cz: 280, halfGx: 20, halfGz: 17, wallH: 6, keepH: 11, faction: 'RU', isHQ: false }
    ];
    this.castleSites = castleSites;

    const registerMedievalFootprint = (startGx, startGz, width, depth, baseGy, topGy, voxels = []) => {
      const minWx = (startGx - 0.5) * VOXEL_SIZE;
      const maxWx = (startGx + width - 0.5) * VOXEL_SIZE;
      const minWz = (startGz - 0.5) * VOXEL_SIZE;
      const maxWz = (startGz + depth - 0.5) * VOXEL_SIZE;
      const foundationKeys = [];
      for (let gx = startGx; gx < startGx + width; gx++) {
        for (let gz = startGz; gz < startGz + depth; gz++) {
          for (let gy = baseGy; gy <= baseGy + 1; gy++) {
            if (this.hasVoxel(gx, gy, gz)) {
              foundationKeys.push(this.key(gx, gy, gz));
            }
          }
        }
      }
      const rec = {
        startGx,
        startGz,
        width,
        depth,
        minWx,
        maxWx,
        minWz,
        maxWz,
        minX: minWx,
        maxX: maxWx,
        minZ: minWz,
        maxZ: maxWz,
        baseGy,
        groundGy: baseGy,
        topGy,
        floors: Math.max(1, Math.ceil((topGy - baseGy) / 4)),
        centerWx: (minWx + maxWx) * 0.5,
        centerWz: (minWz + maxWz) * 0.5,
        centerPos: new THREE.Vector3((minWx + maxWx) * 0.5, ((baseGy + topGy) * 0.5) * VOXEL_SIZE, (minWz + maxWz) * 0.5),
        radius: Math.hypot(width * 0.5, depth * 0.5) * VOXEL_SIZE,
        voxels,
        foundationKeys,
        initialGroundSupport: Math.max(1, foundationKeys.length),
        collapsed: false
      };
      this.buildings.push(rec);
      if (typeof this._registerSpatialFootprint === 'function') {
        this._registerSpatialFootprint(rec);
      }
      return rec;
    };

    for (const site of castleSites) {
      const cGroup = new THREE.Group();
      const baseH = this.getGroundHeightAt(site.cx, site.cz);
      const baseGy = Math.max(0, Math.floor(baseH / VOXEL_SIZE));
      const cgx = Math.round(site.cx / VOXEL_SIZE);
      const cgz = Math.round(site.cz / VOXEL_SIZE);
      const roofMat = site.faction === 'RU' ? slateRoofRedMat : slateRoofBlueMat;
      const bannerMat = site.faction === 'RU' ? bannerRedMat : bannerBlueMat;

      // 1. Stone Bailey Courtyard Cobblestone Paving Slab (deep 3.5m foundation plinth so courtyard never floats on slopes!)
      const courtyard = new THREE.Mesh(
        new THREE.BoxGeometry(site.halfGx * 2 * VOXEL_SIZE, 3.6, site.halfGz * 2 * VOXEL_SIZE),
        castleTrimMat
      );
      courtyard.position.set(site.cx, baseH - 1.65, site.cz);
      courtyard.receiveShadow = true;
      cGroup.add(courtyard);

      // 2. Real Voxel Curtain Walls (2-Voxel-Thick Fortified Stone Ramparts with Walkways & Crenellated Merlons)
      //    Wide 8-voxel (10m) Gatehouse Archways in the center of all 4 walls for Cavalry & Infantry!
      const gateHalfG = 4; // -4..+4 = 9 voxels (~11.25m clear gate opening)
      const wallVoxels = [];
      const placeCastleVoxel = (gx, gy, gz, mat = 'darkConcrete') => {
        const v = this.addVoxel(gx, gy, gz, mat, false, true);
        if (v) wallVoxels.push(v);
        return v;
      };
      const sinkCastleFoundation = (gx, gz) => {
        const localGy = this.getBaseGy(gx, gz);
        for (let fy = Math.min(localGy - 3, baseGy - 2); fy < baseGy; fy++) {
          placeCastleVoxel(gx, fy, gz, 'darkConcrete');
        }
      };

      // North & South Curtain Walls (along X at cgz ± halfGz)
      for (const zSign of [-1, 1]) {
        const wzOuter = cgz + zSign * site.halfGz;
        const wzInner = wzOuter - zSign;
        for (let dx = -site.halfGx + 3; dx <= site.halfGx - 3; dx++) {
          const gx = cgx + dx;
          const inGate = Math.abs(dx) <= gateHalfG;
          sinkCastleFoundation(gx, wzOuter);
          sinkCastleFoundation(gx, wzInner);
          for (let h = 0; h < site.wallH; h++) {
            // Leave bottom 4 voxels open inside the Gatehouse Archway; build solid stone bridge lintel above!
            if (inGate && h < 4) continue;
            placeCastleVoxel(gx, baseGy + h, wzOuter, 'darkConcrete');
            if (h === site.wallH - 1 || !inGate) {
              placeCastleVoxel(gx, baseGy + h, wzInner, h === site.wallH - 1 ? 'concrete' : 'darkConcrete');
            }
          }
          // Crenellated Stone Merlons along the top outer edge of the Curtain Wall
          if (Math.abs(dx) % 2 === 0) {
            placeCastleVoxel(gx, baseGy + site.wallH, wzOuter, 'concrete');
          }
          // Gatehouse Flanking Stone Buttresses
          if (Math.abs(dx) === gateHalfG + 1) {
            sinkCastleFoundation(gx, wzOuter + zSign);
            for (let h = 0; h <= site.wallH + 1; h++) {
              placeCastleVoxel(gx, baseGy + h, wzOuter + zSign, 'concrete');
            }
          }
        }

        // Raised Iron Portcullis Grate & Timber Gatehouse Frame inside North/South Gate Archway
        const wzWorld = wzOuter * VOXEL_SIZE;
        const portcullis = new THREE.Mesh(
          new THREE.BoxGeometry((gateHalfG * 2 + 1) * VOXEL_SIZE, 1.35, 0.35),
          portcullisIronMat
        );
        portcullis.position.set(site.cx, baseH + 4.35, wzWorld);
        cGroup.add(portcullis);
      }

      // East & West Curtain Walls (along Z at cgx ± halfGx)
      for (const xSign of [-1, 1]) {
        const wxOuter = cgx + xSign * site.halfGx;
        const wxInner = wxOuter - xSign;
        for (let dz = -site.halfGz + 3; dz <= site.halfGz - 3; dz++) {
          const gz = cgz + dz;
          const inGate = Math.abs(dz) <= gateHalfG;
          sinkCastleFoundation(wxOuter, gz);
          sinkCastleFoundation(wxInner, gz);
          for (let h = 0; h < site.wallH; h++) {
            if (inGate && h < 4) continue;
            placeCastleVoxel(wxOuter, baseGy + h, gz, 'darkConcrete');
            if (h === site.wallH - 1 || !inGate) {
              placeCastleVoxel(wxInner, baseGy + h, gz, h === site.wallH - 1 ? 'concrete' : 'darkConcrete');
            }
          }
          // Crenellated Stone Merlons along the top outer edge
          if (Math.abs(dz) % 2 === 0) {
            placeCastleVoxel(wxOuter, baseGy + site.wallH, gz, 'concrete');
          }
          // Gatehouse Flanking Stone Buttresses
          if (Math.abs(dz) === gateHalfG + 1) {
            sinkCastleFoundation(wxOuter + xSign, gz);
            for (let h = 0; h <= site.wallH + 1; h++) {
              placeCastleVoxel(wxOuter + xSign, baseGy + h, gz, 'concrete');
            }
          }
        }

        // Interior Walk-Up Stone Rampart Stairs along the inside of the West/East Walls so soldiers can climb onto the battlements!
        const stairZStart = cgz + gateHalfG + 2;
        for (let step = 0; step < site.wallH; step++) {
          const sgx = wxInner - xSign;
          const sgz = stairZStart + step;
          if (sgz < cgz + site.halfGz - 3) {
            for (let sh = 0; sh <= step; sh++) {
              placeCastleVoxel(sgx, baseGy + sh, sgz, 'concrete');
            }
          }
        }

        // Raised Iron Portcullis Grate inside East/West Main Gatehouse Archway
        const wxWorld = wxOuter * VOXEL_SIZE;
        const portcullis = new THREE.Mesh(
          new THREE.BoxGeometry(0.35, 1.35, (gateHalfG * 2 + 1) * VOXEL_SIZE),
          portcullisIronMat
        );
        portcullis.position.set(wxWorld, baseH + 4.35, site.cz);
        cGroup.add(portcullis);
      }

      // 3. Four Corner Voxel Stone Battlement Towers (7x7 Voxel Footprint, Hollow Ground Chamber + Crenellated Roof + Slate Spire)
      const towerH = site.wallH + 3;
      const turretRoofGeo = new THREE.ConeGeometry(4.8, 5.6, 8);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const tgx = cgx + sx * site.halfGx;
          const tgz = cgz + sz * site.halfGz;
          const towerVoxels = [];

          for (let tx = -3; tx <= 3; tx++) {
            for (let tz = -3; tz <= 3; tz++) {
              if (Math.abs(tx) === 3 && Math.abs(tz) === 3) continue; // Octagonal chamfered stone corners
              const isPerimeter =
                Math.abs(tx) === 3 ||
                Math.abs(tz) === 3 ||
                (Math.abs(tx) === 2 && Math.abs(tz) === 2);
              if (isPerimeter) {
                sinkCastleFoundation(tgx + tx, tgz + tz);
              }
              for (let h = 0; h < towerH; h++) {
                // Leave courtyard-facing doorway open at ground level (h < 3)
                const isDoor = h < 3 && tx === -sx * 2 && tz === 0;
                if (isDoor) continue;
                if (isPerimeter || h === towerH - 1 || h === site.wallH - 1) {
                  const v = this.addVoxel(
                    tgx + tx,
                    baseGy + h,
                    tgz + tz,
                    h === towerH - 1 ? 'concrete' : 'darkConcrete',
                    false,
                    true
                  );
                  if (v) towerVoxels.push(v);
                }
              }
              // Tower Crenellations (Merlons)
              if (isPerimeter && (tx + tz) % 2 === 0) {
                const mv = this.addVoxel(tgx + tx, baseGy + towerH, tgz + tz, 'concrete', false, true);
                if (mv) towerVoxels.push(mv);
              }
            }
          }

          const txWorld = tgx * VOXEL_SIZE;
          const tzWorld = tgz * VOXEL_SIZE;
          const towerTopY = (baseGy + towerH + 1) * VOXEL_SIZE;

          const coneRoof = new THREE.Mesh(turretRoofGeo, roofMat);
          coneRoof.position.set(txWorld, towerTopY + 2.6, tzWorld);
          coneRoof.castShadow = true;
          cGroup.add(coneRoof);

          const brazier = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.75, 0.75), fireGlowMat);
          brazier.position.set(txWorld, towerTopY + 5.6, tzWorld);
          cGroup.add(brazier);

          const banner = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 4.6), bannerMat);
          banner.position.set(txWorld + sx * 4.2, baseH + towerH * VOXEL_SIZE * 0.6, tzWorld);
          banner.rotation.y = Math.PI / 2;
          cGroup.add(banner);

          // Register Corner Battlement Tower in spatial building grid so bots never walk into or get stuck in towers!
          registerMedievalFootprint(tgx - 3, tgz - 3, 7, 7, baseGy, baseGy + towerH, towerVoxels);
        }
      }

      // 4. Grand Central Stone Keep Donjon — Built out of Real Destructible Voxels with Walkable Great Hall,
      //    Arrow Slit Windows, Internal Timber Floor, and Crenellated Roof Battlements!
      const keepGx = cgx + (site.isHQ ? (site.faction === 'US' ? -11 : 11) : 0);
      const keepGz = cgz + (site.isHQ ? 0 : -8);
      const keepHalfW = 5; // 11 voxels wide (13.75m)
      const keepHalfD = 4; // 9 voxels deep (11.25m)
      const keepVoxels = [];

      for (let kx = -keepHalfW; kx <= keepHalfW; kx++) {
        for (let kz = -keepHalfD; kz <= keepHalfD; kz++) {
          const isEdge = Math.abs(kx) === keepHalfW || Math.abs(kz) === keepHalfD;
          const isCornerButtress = Math.abs(kx) === keepHalfW && Math.abs(kz) === keepHalfD;
          if (isEdge) {
            sinkCastleFoundation(keepGx + kx, keepGz + kz);
          }
          for (let h = 0; h < site.keepH; h++) {
            // Grand arched doorway facing the castle courtyard center
            const isKeepDoor =
              h < 3 &&
              ((!site.isHQ && kz === keepHalfD && Math.abs(kx) <= 1) ||
                (site.isHQ && kx === (site.faction === 'US' ? keepHalfW : -keepHalfW) && Math.abs(kz) <= 1));
            if (isKeepDoor) continue;

            // Arrow-slit embrasures on upper stories
            const isArrowSlit =
              isEdge &&
              !isCornerButtress &&
              (h === 3 || h === 7) &&
              ((Math.abs(kx) === 2 && Math.abs(kz) === keepHalfD) ||
                (Math.abs(kz) === 2 && Math.abs(kx) === keepHalfW));
            if (isArrowSlit) continue;

            if (isEdge) {
              const kv = this.addVoxel(
                keepGx + kx,
                baseGy + h,
                keepGz + kz,
                isCornerButtress ? 'concrete' : 'darkConcrete',
                false,
                true
              );
              if (kv) keepVoxels.push(kv);
            } else if (h === 5 || h === site.keepH - 1) {
              // Second-story timber floor & stone roof deck (leave stairwell opening at kx = -3..-2, kz = -2)
              if (!(kx >= -3 && kx <= -1 && kz === -2)) {
                const fv = this.addVoxel(
                  keepGx + kx,
                  baseGy + h,
                  keepGz + kz,
                  h === site.keepH - 1 ? 'concrete' : 'wood',
                  false,
                  true
                );
                if (fv) keepVoxels.push(fv);
              }
            }
          }
          // Keep Roof Crenellations (Merlons)
          if (isEdge && (kx + kz) % 2 === 0) {
            const mv = this.addVoxel(
              keepGx + kx,
              baseGy + site.keepH,
              keepGz + kz,
              'concrete',
              false,
              true
            );
            if (mv) keepVoxels.push(mv);
          }
        }
      }

      // Register the Keep Donjon in `this.buildings` & spatial footprint grid so bots pathfind around the keep exterior!
      const keepWorldX = keepGx * VOXEL_SIZE;
      const keepWorldZ = keepGz * VOXEL_SIZE;
      registerMedievalFootprint(
        keepGx - keepHalfW,
        keepGz - keepHalfD,
        keepHalfW * 2 + 1,
        keepHalfD * 2 + 1,
        baseGy,
        baseGy + site.keepH,
        keepVoxels
      );

      const keepSpire = new THREE.Mesh(new THREE.ConeGeometry(6.8, 6.5, 4), roofMat);
      keepSpire.position.set(
        keepWorldX,
        (baseGy + site.keepH + 1) * VOXEL_SIZE + 3.1,
        keepWorldZ
      );
      keepSpire.rotation.y = Math.PI / 4;
      cGroup.add(keepSpire);

      // Timber Warhorse Stables inside HQ Castles (with deep buried foundation)
      if (site.isHQ) {
        const stableVoxels = [];
        for (let sx = -6; sx <= 6; sx++) {
          for (let sz = 11; sz <= 16; sz++) {
            if (sz === 16 || Math.abs(sx) === 6) {
              sinkCastleFoundation(cgx + sx, cgz + sz);
              for (let h = 0; h < 3; h++) {
                const sv = this.addVoxel(cgx + sx, baseGy + h, cgz + sz, 'wood', false, true);
                if (sv) stableVoxels.push(sv);
              }
            }
            const rv = this.addVoxel(cgx + sx, baseGy + 3, cgz + sz, 'wood', false, true);
            if (rv) stableVoxels.push(rv);
          }
        }
        registerMedievalFootprint(cgx - 6, cgz + 11, 13, 6, baseGy, baseGy + 3, stableVoxels);
      }

      this.scene.add(cGroup);
      if (this._ownedWorldObjects) this._ownedWorldObjects.push(cGroup);
    }

    // =========================================================================
    // 5. AUTHENTIC MEDIEVAL HALF-TIMBERED TUDOR VILLAGE GUILDHALLS, TAVERNS & BLACKSMITHS
    //    Built out of real destructible voxels (stone ground floor + timber/brick upper floor + pitched gable roof)
    // =========================================================================
    const tudorHouses = [
      { gx: -405, gz: -115, w: 9, d: 7, faction: 'US' },
      { gx: -375, gz: -92, w: 8, d: 7, faction: 'US' },
      { gx: -215, gz: 132, w: 9, d: 8, faction: 'US' },
      { gx: -165, gz: 130, w: 8, d: 7, faction: 'US' },
      { gx: -95, gz: -55, w: 9, d: 7, faction: 'US' },
      { gx: -95, gz: 52, w: 8, d: 7, faction: 'US' },
      { gx: -36, gz: -22, w: 8, d: 7, faction: 'US' },
      { gx: 28, gz: 18, w: 8, d: 7, faction: 'RU' },
      { gx: 90, gz: -52, w: 9, d: 7, faction: 'RU' },
      { gx: 90, gz: 55, w: 8, d: 7, faction: 'RU' },
      { gx: 165, gz: -132, w: 9, d: 8, faction: 'RU' },
      { gx: 215, gz: -130, w: 8, d: 7, faction: 'RU' },
      { gx: 375, gz: 92, w: 9, d: 7, faction: 'RU' },
      { gx: 405, gz: 115, w: 8, d: 7, faction: 'RU' }
    ];

    for (const th of tudorHouses) {
      // Sample terrain across the Tudor House footprint & sink a deep 4-voxel fieldstone foundation
      // so houses on hills NEVER have a floating bottom edge in mid-air!
      let maxHouseGy = this.getBaseGy(th.gx + Math.floor(th.w / 2), th.gz + Math.floor(th.d / 2));
      for (let sx = 0; sx < th.w; sx += Math.max(1, Math.floor(th.w / 2))) {
        for (let sz = 0; sz < th.d; sz += Math.max(1, Math.floor(th.d / 2))) {
          const sGy = this.getBaseGy(th.gx + sx, th.gz + sz);
          if (sGy > maxHouseGy) maxHouseGy = sGy;
        }
      }
      const baseGy = maxHouseGy;
      const houseVoxels = [];

      for (let x = 0; x < th.w; x++) {
        for (let z = 0; z < th.d; z++) {
          const isPerim = x === 0 || x === th.w - 1 || z === 0 || z === th.d - 1;
          const isCorner = (x === 0 || x === th.w - 1) && (z === 0 || z === th.d - 1);
          const localGy = this.getBaseGy(th.gx + x, th.gz + z);
          const startFoundationGy = isPerim ? Math.min(localGy - 3, baseGy - 2) : baseGy - 1;
          for (let fy = startFoundationGy; fy < baseGy; fy++) {
            const fv = this.addVoxel(
              th.gx + x,
              fy,
              th.gz + z,
              isCorner ? 'wood' : 'darkConcrete'
            );
            if (fv) houseVoxels.push(fv);
          }
          // Ground floor (h = 0..3): Medieval fieldstone masonry ('darkConcrete') with timber corner posts ('wood')
          for (let h = 0; h < 4; h++) {
            const isDoor = h < 2 && z === 0 && Math.abs(x - Math.floor(th.w / 2)) <= 1;
            const isWin = h === 2 && isPerim && !isCorner && (x === 2 || x === th.w - 3 || z === 3);
            if (isDoor || isWin) continue;
            if (isPerim) {
              const v = this.addVoxel(
                th.gx + x,
                baseGy + h,
                th.gz + z,
                isCorner ? 'wood' : 'darkConcrete'
              );
              if (v) houseVoxels.push(v);
            }
          }
          // Upper Tudor Jetty Floor (h = 4..7): Half-timbered oak beams ('wood') & warm brick/plaster nogging ('brick'/'concrete')
          for (let h = 4; h < 8; h++) {
            if (h === 4 && !(x >= 1 && x <= 2 && z >= 1 && z <= 2)) {
              const fv = this.addVoxel(th.gx + x, baseGy + h, th.gz + z, 'wood');
              if (fv) houseVoxels.push(fv);
            }
            if (isPerim) {
              const isWin = h === 6 && !isCorner && (x === Math.floor(th.w / 2) || z === Math.floor(th.d / 2));
              if (isWin) continue;
              const isTimberBeam = isCorner || h === 4 || h === 7 || (x + z) % 2 === 0;
              const uv = this.addVoxel(
                th.gx + x,
                baseGy + h,
                th.gz + z,
                isTimberBeam ? 'wood' : 'brick'
              );
              if (uv) houseVoxels.push(uv);
            }
          }
          // Steep-Gabled Medieval Timber Roof (stepped voxel gable peak along X)
          const roofStep = Math.min(x, th.w - 1 - x);
          const roofGy = baseGy + 8 + Math.min(3, roofStep);
          const rv = this.addVoxel(th.gx + x, roofGy, th.gz + z, 'wood');
          if (rv) houseVoxels.push(rv);
        }
      }

      registerMedievalFootprint(th.gx, th.gz, th.w, th.d, baseGy, baseGy + 11, houseVoxels);
    }

    // =========================================================================
    // 6. MEDIEVAL STONE & TIMBER WINDMILLS WITH 4-BLADED WOODEN SAILS + TIMBER PALISADES
    // =========================================================================
    const windmillSites = [
      { wx: -510, wz: -95, yaw: 0.4 },
      { wx: -255, wz: -65, yaw: -0.3 },
      { wx: 255, wz: 65, yaw: 2.7 },
      { wx: 510, wz: 95, yaw: -2.5 }
    ];

    for (const wm of windmillSites) {
      const wgx = Math.round(wm.wx / VOXEL_SIZE);
      const wgz = Math.round(wm.wz / VOXEL_SIZE);
      const baseH = this.getGroundHeightAt(wm.wx, wm.wz);
      const baseGy = Math.max(0, Math.floor(baseH / VOXEL_SIZE));

      // Voxel Stone & Timber Mill Tower (5x5 footprint, 10 voxels tall + deep 3-voxel buried stone foundation)
      const millVoxels = [];
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
          const isEdge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
          if (isEdge) {
            const localGy = this.getBaseGy(wgx + dx, wgz + dz);
            for (let fy = Math.min(localGy - 3, baseGy - 2); fy < baseGy; fy++) {
              const fv = this.addVoxel(wgx + dx, fy, wgz + dz, 'darkConcrete', false, true);
              if (fv) millVoxels.push(fv);
            }
          }
          for (let h = 0; h < 10; h++) {
            if (h < 2 && dx === 0 && dz === 2) continue; // Mill doorway
            if (isEdge || h === 9) {
              const mv = this.addVoxel(
                wgx + dx,
                baseGy + h,
                wgz + dz,
                h < 5 ? 'darkConcrete' : 'wood',
                false,
                true
              );
              if (mv) millVoxels.push(mv);
            }
          }
        }
      }
      registerMedievalFootprint(wgx - 2, wgz - 2, 5, 5, baseGy, baseGy + 10, millVoxels);

      // Conical Wooden Mill Cap + 4-Bladed Timber & Canvas Windmill Sails
      const millGroup = new THREE.Group();
      const topY = (baseGy + 10) * VOXEL_SIZE;
      const cap = new THREE.Mesh(new THREE.ConeGeometry(3.6, 3.8, 8), timberMat);
      cap.position.set(wm.wx, topY + 1.8, wm.wz);
      millGroup.add(cap);

      const sailHub = new THREE.Group();
      sailHub.position.set(wm.wx + Math.sin(wm.yaw) * 3.1, topY - 1.2, wm.wz + Math.cos(wm.yaw) * 3.1);
      sailHub.rotation.y = wm.yaw;
      sailHub.rotation.z = 0.38;
      for (let b = 0; b < 4; b++) {
        const armGroup = new THREE.Group();
        armGroup.rotation.z = (b * Math.PI) / 2;
        const spar = new THREE.Mesh(new THREE.BoxGeometry(0.24, 7.2, 0.24), timberMat);
        spar.position.set(0, 3.6, 0);
        armGroup.add(spar);
        const sail = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 5.8), sailCanvasMat);
        sail.position.set(0.78, 4.1, 0.05);
        armGroup.add(sail);
        sailHub.add(armGroup);
      }
      millGroup.add(sailHub);
      this.scene.add(millGroup);
      if (this._ownedWorldObjects) this._ownedWorldObjects.push(millGroup);
    }

    // 7. Medieval Timber Palisade Breastworks & Sharpened Stakes along Siege Approaches
    const palisadeLines = [
      { gx: -545, gz: -18, len: 12, alongX: false },
      { gx: -445, gz: 24, len: 12, alongX: false },
      { gx: -275, gz: -88, len: 14, alongX: true },
      { gx: -120, gz: -18, len: 12, alongX: false },
      { gx: -120, gz: 18, len: 12, alongX: false },
      { gx: 120, gz: -18, len: 12, alongX: false },
      { gx: 120, gz: 18, len: 12, alongX: false },
      { gx: 275, gz: 88, len: 14, alongX: true },
      { gx: 445, gz: -24, len: 12, alongX: false },
      { gx: 545, gz: 18, len: 12, alongX: false }
    ];
    for (const pal of palisadeLines) {
      for (let i = 0; i < pal.len; i++) {
        const px = pal.alongX ? pal.gx + i : pal.gx;
        const pz = pal.alongX ? pal.gz : pal.gz + i;
        const bGy = this.getBaseGy(px, pz);
        const maxH = i % 2 === 0 ? 3 : 2;
        for (let h = -2; h < maxH; h++) {
          this.addVoxel(px, bGy + h, pz, 'wood', false, true);
        }
      }
    }
  },

  /**
   * JURASSIC ERA: Builds Towering Prehistoric Paddock Gates, Electric Containment Fence Pylons,
   * Giant Bleached Dinosaur Ribcage/Skull Skeletons, and Glowing Volcanic Steam/Magma Vents.
   */
  buildJurassicJungleStructures() {
    const stoneMat = new THREE.MeshStandardMaterial({
      map: TEXTURES.darkConcrete,
      color: 0x4b463e,
      roughness: 0.92,
      flatShading: true
    });
    const timberMat = new THREE.MeshStandardMaterial({
      color: 0x4a2f18,
      roughness: 0.9,
      flatShading: true
    });
    const boneMat = new THREE.MeshStandardMaterial({
      color: 0xe6dec8,
      roughness: 0.78,
      flatShading: true
    });
    const torchFlameMat = new THREE.MeshBasicMaterial({ color: 0xff7f11 });
    const lavaGlowMat = new THREE.MeshBasicMaterial({ color: 0xff3838 });

    const jGroup = new THREE.Group();

    // 1. Iconic Towering Jurassic Paddock Gate Arches along Main Jungle Corridor
    for (const gx of [-620, -260, 260, 620]) {
      const baseH = this.getGroundHeightAt(gx, 0);
      for (const zSide of [-1, 1]) {
        const pylon = new THREE.Mesh(new THREE.BoxGeometry(4.2, 15.5, 4.8), stoneMat);
        pylon.position.set(gx, baseH + 7.75, zSide * 10.5);
        pylon.castShadow = true;
        jGroup.add(pylon);

        const torch = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.3, 0.95), torchFlameMat);
        torch.position.set(gx, baseH + 11.5, zSide * 7.8);
        jGroup.add(torch);
      }
      const archCrossbeam = new THREE.Mesh(new THREE.BoxGeometry(4.6, 3.2, 26.5), timberMat);
      archCrossbeam.position.set(gx, baseH + 14.5, 0);
      archCrossbeam.castShadow = true;
      jGroup.add(archCrossbeam);
    }

    // 2. Giant Prehistoric Sauropod/T-Rex Ribcage Skeletons in Dinosaur Territory
    for (const [bx, bz] of [
      [195, -142],
      [380, 118],
      [660, -18],
      [920, 22],
      [-15, 32]
    ]) {
      const baseH = this.getGroundHeightAt(bx, bz);
      const spine = new THREE.Mesh(new THREE.BoxGeometry(16, 0.9, 1.1), boneMat);
      spine.position.set(bx, baseH + 4.2, bz);
      jGroup.add(spine);

      for (let rx = -6; rx <= 6; rx += 2.4) {
        for (const side of [-1, 1]) {
          const rib = new THREE.Mesh(new THREE.BoxGeometry(0.55, 4.8, 0.55), boneMat);
          rib.position.set(bx + rx, baseH + 2.4, bz + side * 2.1);
          rib.rotation.x = side * 0.42;
          jGroup.add(rib);
        }
      }
    }

    // 3. Glowing Volcanic Magma Fissures on the Eastern Dinosaur Ridge
    for (const [vx, vz] of [
      [215, -185],
      [405, 162],
      [885, -35]
    ]) {
      const baseH = this.getTerrainHeight(vx, vz);
      const mound = new THREE.Mesh(new THREE.ConeGeometry(8.5, 5.5, 7), stoneMat);
      mound.position.set(vx, baseH + 2.2, vz);
      jGroup.add(mound);

      const lavaPool = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.4, 7), lavaGlowMat);
      lavaPool.position.set(vx, baseH + 4.85, vz);
      jGroup.add(lavaPool);
    }

    this.scene.add(jGroup);
    if (this._ownedWorldObjects) this._ownedWorldObjects.push(jGroup);
  }
};
