// ============================================================================
// 3D WORLD PROP & DEPLOYABLE MODELS (src/models/prop-models.js)
// Reusable high-fidelity, low-draw-call 3D mesh builders for:
//  - 24m Tapered Steel Lattice Air-Defense Radar Towers (<= 5 static draw calls)
//  - Squad Deployable Ammo & Kit Stashes (preserving children[3] RingGeometry)
// ============================================================================

import * as THREE from '../../vendor/three.module.js';
import { TEXTURES } from '../assets/textures.js?v=139';

let propShared = null;

const _tmpMat = new THREE.Matrix4();
const _tmpQuat = new THREE.Quaternion();
const _tmpEuler = new THREE.Euler();
const _tmpPos = new THREE.Vector3();
const _tmpScale = new THREE.Vector3(1, 1, 1);
const _upAxis = new THREE.Vector3(0, 1, 0);

function markShared(item) {
  item.userData.shared = true;
  return item;
}

function mergeStaticParts(parts) {
  let totalVerts = 0;
  const nonIndexed = [];
  for (let i = 0; i < parts.length; i++) {
    const { geo, pos, rot } = parts[i];
    const ni = geo.index ? geo.toNonIndexed() : geo.clone();
    _tmpPos.set(pos[0], pos[1], pos[2]);
    _tmpEuler.set(rot[0], rot[1], rot[2]);
    _tmpQuat.setFromEuler(_tmpEuler);
    _tmpMat.compose(_tmpPos, _tmpQuat, _tmpScale);
    ni.applyMatrix4(_tmpMat);
    totalVerts += ni.attributes.position.count;
    nonIndexed.push(ni);
  }
  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  let offset = 0;
  for (let i = 0; i < nonIndexed.length; i++) {
    const ni = nonIndexed[i];
    positions.set(ni.attributes.position.array, offset);
    normals.set(ni.attributes.normal.array, offset);
    offset += ni.attributes.position.array.length;
    ni.dispose();
  }
  const disposed = new Set();
  for (let i = 0; i < parts.length; i++) {
    const g = parts[i].geo;
    if (g && !g.userData?.shared && !disposed.has(g)) {
      disposed.add(g);
      g.dispose();
    }
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.computeBoundingSphere();
  return markShared(merged);
}

function beamBetween(p1, p2, w, d) {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const dz = p2[2] - p1[2];
  const len = Math.hypot(dx, dy, dz);
  const dir = new THREE.Vector3(dx / len, dy / len, dz / len);
  const q = new THREE.Quaternion().setFromUnitVectors(_upAxis, dir);
  const e = new THREE.Euler().setFromQuaternion(q);
  return {
    geo: new THREE.BoxGeometry(w, len, d),
    pos: [(p1[0] + p2[0]) * 0.5, (p1[1] + p2[1]) * 0.5, (p1[2] + p2[2]) * 0.5],
    rot: [e.x, e.y, e.z]
  };
}

export const RADAR_TOWER_SPEC = {
  baseHalfSpan: 5.2,
  pierSize: 1.5,
  deckY: 28.0,
  deckWidth: 6.8,
  totalHeight: 38.5,
  ladderLocalX: 0,
  ladderLocalZ: 2.35,
  hatchHalfW: 0.68
};

export const POWER_TOWER_SPEC = {
  baseHalfSpan: 6.2,
  pierSize: 1.7,
  lowerDeckY: 20.0,
  lowerDeckWidth: 7.6,
  upperDeckY: 32.5,
  upperDeckWidth: 6.8,
  lowerArmY: 24.5,
  lowerArmHalfSpan: 11.0,
  upperArmY: 35.5,
  upperArmHalfSpan: 9.2,
  totalHeight: 44.5,
  ladderLocalX: 0,
  ladderLocalZ: 2.55,
  hatchHalfW: 0.72
};

let _skyscraperSharedMats = null;

function getSkyscraperSharedMaterials() {
  if (_skyscraperSharedMats) return _skyscraperSharedMats;
  const makeBlockyFacadeTex = (wallHex, accentHex, mortarHex) => {
    if (typeof document === 'undefined') {
      const dt = markShared(new THREE.DataTexture(new Uint8Array([120, 128, 136, 255]), 1, 1));
      dt.wrapS = THREE.RepeatWrapping;
      dt.wrapT = THREE.RepeatWrapping;
      dt.needsUpdate = true;
      return dt;
    }
    // 1 tile = 1 story tall (4 voxels = 5.0m) x 3 voxels wide (3.75m):
    // Crispy BattleBit voxel-grid spandrel row + 1-voxel pillar column + 2x2 dark blocky window recess!
    const canvas = document.createElement('canvas');
    canvas.width = 192;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = wallHex;
      ctx.fillRect(0, 0, 192, 256);

      // Subtle 1.25m voxel block mortar grid lines (3 cols x 4 rows) so the 3D core looks 100% blocky!
      ctx.strokeStyle = mortarHex;
      ctx.lineWidth = 3;
      for (let gx = 0; gx <= 3; gx++) {
        const px = Math.round((gx / 3) * 192);
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, 256);
        ctx.stroke();
      }
      for (let gy = 0; gy <= 4; gy++) {
        const py = Math.round((gy / 4) * 256);
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(192, py);
        ctx.stroke();
      }

      // Bottom floor-slab spandrel band (row 3: y = 192..256)
      ctx.fillStyle = accentHex;
      ctx.fillRect(2, 194, 188, 60);

      // Recessed blocky 2x2 voxel dark armored glass window bay (cols 1..2, rows 1..2: x = 66..188, y = 66..190)
      ctx.fillStyle = '#142230';
      ctx.fillRect(66, 66, 122, 124);
      // Top window lintel shadow & crisp sill highlight (gives deep 3D block recess illusion!)
      ctx.fillStyle = 'rgba(8, 14, 20, 0.65)';
      ctx.fillRect(66, 66, 122, 14);
      ctx.fillRect(66, 66, 12, 124);
      ctx.fillStyle = 'rgba(155, 205, 240, 0.18)';
      ctx.fillRect(80, 82, 44, 96);
      ctx.fillRect(132, 82, 48, 96);
      // Center window mullion bar
      ctx.fillStyle = '#22313f';
      ctx.fillRect(125, 66, 6, 124);
      ctx.fillRect(66, 126, 122, 5);
      // Bright blocky concrete windowsill ledge
      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.fillRect(64, 190, 126, 5);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return markShared(tex);
  };

  _skyscraperSharedMats = {
    facadeByWall: {
      concrete: markShared(
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          map: makeBlockyFacadeTex('#c4ccd4', '#8e99a4', 'rgba(55,64,74,0.28)'),
          roughness: 0.78,
          metalness: 0.14
        })
      ),
      darkConcrete: markShared(
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          map: makeBlockyFacadeTex('#7d8791', '#5a636c', 'rgba(28,34,40,0.34)'),
          roughness: 0.78,
          metalness: 0.18
        })
      ),
      brick: markShared(
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          map: makeBlockyFacadeTex('#b86b5b', '#75483f', 'rgba(48,26,20,0.34)'),
          roughness: 0.86,
          metalness: 0.08
        })
      )
    },
    mullionSteel: markShared(
      new THREE.MeshStandardMaterial({
        color: 0x2c3540,
        map: TEXTURES?.darkConcrete || null,
        roughness: 0.42,
        metalness: 0.74
      })
    ),
    trimConcrete: markShared(
      new THREE.MeshStandardMaterial({
        color: 0x828c96,
        map: TEXTURES?.concrete || null,
        roughness: 0.85,
        metalness: 0.08
      })
    ),
    beaconRed: markShared(
      new THREE.MeshBasicMaterial({
        color: 0xff3b30
      })
    )
  };
  return _skyscraperSharedMats;
}

/**
 * Builds an ultra-fast, BattleBit-blocky 3D Skyscraper Middle Structural Core (`<= 4` draw calls, `< 180` triangles!)
 * for the indestructible intermediate shaft (`curtainMinY .. curtainMaxY`), while 1F/2F Lobby, Top Sniper Floor,
 * Walkable Stairs, and Rooftop Helipad Bastions remain real destructible voxel blocks!
 */
export function createSkyscraper3DMesh(spec = {}) {
  const mats = getSkyscraperSharedMaterials();
  const wallMatKey = mats.facadeByWall[spec.wallMat] ? spec.wallMat : 'concrete';
  const facadeMat = mats.facadeByWall[wallMatKey];
  const spanX = Math.max(10, spec.spanX || 26);
  const spanZ = Math.max(10, spec.spanZ || 22);
  const lobbyBaseY = spec.lobbyBaseY ?? 0;
  const curtainMinY = spec.curtainMinY ?? lobbyBaseY + 10;
  const curtainMaxY = spec.curtainMaxY ?? lobbyBaseY + 60;
  const roofTopY = spec.roofTopY ?? curtainMaxY + 5;
  const variant = Math.abs(spec.variant || 0);

  const group = new THREE.Group();
  group.name = 'Skyscraper3DShell';

  const curtainH = Math.max(4.0, curtainMaxY - curtainMinY);
  const midCurtainY = (curtainMinY + curtainMaxY) * 0.5;

  // 1. Blocky Voxel-Grid-Aligned Middle Core Box (aligned flush with 1.25m voxel walls, inset 0.03m to prevent Z-fighting with stair wall)
  const coreGeo = new THREE.BoxGeometry(spanX - 0.06, curtainH, spanZ - 0.06);
  const uvAttr = coreGeo.attributes.uv;
  const repX = Math.max(2, Math.round(spanX / 3.75));
  const repZ = Math.max(2, Math.round(spanZ / 3.75));
  const repY = Math.max(1, Math.round(curtainH / 5.0));
  for (let face = 0; face < 6; face++) {
    const rx = face < 2 ? repZ : repX;
    const ry = face === 2 || face === 3 ? repZ : repY;
    for (let v = 0; v < 4; v++) {
      const idx = face * 4 + v;
      uvAttr.setXY(idx, uvAttr.getX(idx) * rx, uvAttr.getY(idx) * ry);
    }
  }
  const glassMesh = new THREE.Mesh(coreGeo, facadeMat);
  glassMesh.position.set(0, midCurtainY, 0);
  glassMesh.castShadow = true;
  glassMesh.receiveShadow = true;
  group.add(glassMesh);

  // 2. Merged Blocky Steel Corner Girders, Voxel-Stepped Spandrel Ledges, Canopy & Rooftop Antenna Mast
  const steelParts = [];
  const concreteParts = [];
  const hx = spanX * 0.5 - 0.625;
  const hz = spanZ * 0.5 - 0.625;

  // 4 Blocky 1.25m Corner Steel Box-Girders along the 3D shaft so corners match 1F/Top-Floor `steelBeam` voxels!
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      steelParts.push({
        geo: new THREE.BoxGeometry(1.26, curtainH + 0.08, 1.26),
        pos: [sx * hx, midCurtainY, sz * hz],
        rot: [0, 0, 0]
      });
    }
  }

  // Blocky Exterior Structural Ribs every 6 voxels (7.5m) matching 1F/2F `steelBeam` perimeter piers
  const xRibCount = Math.max(2, Math.floor(spanX / 7.5));
  for (let i = 1; i < xRibCount; i++) {
    const px = -spanX * 0.5 + i * 7.5;
    if (Math.abs(px) < hx - 1.2) {
      for (const sz of [-1, 1]) {
        steelParts.push({
          geo: new THREE.BoxGeometry(1.05, curtainH, 0.22),
          pos: [px, midCurtainY, sz * (spanZ * 0.5 + 0.04)],
          rot: [0, 0, 0]
        });
      }
    }
  }
  const zRibCount = Math.max(2, Math.floor(spanZ / 7.5));
  for (let i = 1; i < zRibCount; i++) {
    const pz = -spanZ * 0.5 + i * 7.5;
    if (Math.abs(pz) < hz - 1.2) {
      for (const sx of [-1, 1]) {
        steelParts.push({
          geo: new THREE.BoxGeometry(0.22, curtainH, 1.05),
          pos: [sx * (spanX * 0.5 + 0.04), midCurtainY, pz],
          rot: [0, 0, 0]
        });
      }
    }
  }

  // Blocky Precast Concrete Belt Ledges every 2 stories (10m) for chunky silhouette relief
  for (let by = curtainMinY; by <= curtainMaxY + 0.1; by += 10.0) {
    concreteParts.push({
      geo: new THREE.BoxGeometry(spanX + 0.28, 0.62, spanZ + 0.28),
      pos: [0, by, 0],
      rot: [0, 0, 0]
    });
  }

  // Blocky Rooftop Communications Mast + HVAC Box on NE corner (clear of Helipad & Stairwell!)
  const spireX = hx - 1.8;
  const spireZ = -hz + 1.8;
  const spireH = 7.5 + (variant % 3) * 2.5;
  steelParts.push({
    geo: new THREE.BoxGeometry(0.42, spireH, 0.42),
    pos: [spireX, roofTopY + spireH * 0.5, spireZ],
    rot: [0, 0, 0]
  });
  steelParts.push({
    geo: new THREE.BoxGeometry(2.2, 1.25, 1.6),
    pos: [spireX - 1.6, roofTopY + 0.625, spireZ + 0.3],
    rot: [0, 0, 0]
  });

  if (steelParts.length > 0) {
    const steelGeo = mergeStaticParts(steelParts);
    steelGeo.userData.shared = false;
    const steelMesh = new THREE.Mesh(steelGeo, mats.mullionSteel);
    steelMesh.castShadow = true;
    steelMesh.receiveShadow = true;
    group.add(steelMesh);
  }

  if (concreteParts.length > 0) {
    const concGeo = mergeStaticParts(concreteParts);
    concGeo.userData.shared = false;
    const concMesh = new THREE.Mesh(concGeo, mats.trimConcrete);
    concMesh.receiveShadow = true;
    group.add(concMesh);
  }

  const beaconGeo = new THREE.BoxGeometry(0.42, 0.42, 0.42);
  const beaconMesh = new THREE.Mesh(beaconGeo, mats.beaconRed);
  beaconMesh.position.set(spireX, roofTopY + spireH + 0.21, spireZ);
  group.add(beaconMesh);

  group.userData.curtainShell = { glassMesh, spireTopY: roofTopY + spireH };
  return group;
}

function buildRadarTowerGeometries() {
  const steelParts = [];
  const darkEquipParts = [];
  const redWarnParts = [];
  const whiteWarnParts = [];
  const beaconGlowParts = [];

  // 1. Combined-Arms Scale 4-Legged Tapered Steel Lattice Air-Defense Radar Tower (10.4m x 10.4m base, 38.5m pinnacle)
  const tierYs = [0.5, 6.2, 11.9, 17.6, 23.3, 29.2];
  const halfSpanAt = (y) => 5.2 - (y / 29.2) * 3.1; // tapers from ±5.20m (10.4m base) to ±2.10m at y=29.2m

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const baseH = halfSpanAt(0.5);
      steelParts.push({
        geo: new THREE.BoxGeometry(1.55, 0.9, 1.55),
        pos: [sx * baseH, 0.45, sz * baseH],
        rot: [0, 0, 0]
      });
      steelParts.push({
        geo: new THREE.BoxGeometry(1.02, 0.18, 1.02),
        pos: [sx * baseH, 0.95, sz * baseH],
        rot: [0, 0, 0]
      });
      const topH = halfSpanAt(29.2);
      steelParts.push(beamBetween([sx * baseH, 0.5, sz * baseH], [sx * topH, 29.2, sz * topH], 0.32, 0.32));
    }
  }

  // 5 bays of horizontal perimeter girts + diagonal X-cross-bracing (open drive-under lower bay up to y=6.2m!)
  for (let b = 0; b < tierYs.length - 1; b++) {
    const y0 = tierYs[b];
    const y1 = tierYs[b + 1];
    const h0 = halfSpanAt(y0);
    const h1 = halfSpanAt(y1);

    const corners0 = [
      [-h0, y0, -h0],
      [h0, y0, -h0],
      [h0, y0, h0],
      [-h0, y0, h0]
    ];
    const corners1 = [
      [-h1, y1, -h1],
      [h1, y1, -h1],
      [h1, y1, h1],
      [-h1, y1, h1]
    ];

    for (let f = 0; f < 4; f++) {
      const nf = (f + 1) % 4;
      steelParts.push(beamBetween(corners1[f], corners1[nf], 0.2, 0.2));
      if (b > 0) {
        steelParts.push(beamBetween(corners0[f], corners1[nf], 0.14, 0.14));
        steelParts.push(beamBetween(corners0[nf], corners1[f], 0.14, 0.14));
      } else {
        // Knee-braces in lower bay leave a tall 5.2m clear ground arch underneath!
        const midTop = [(corners1[f][0] + corners1[nf][0]) * 0.5, y1, (corners1[f][2] + corners1[nf][2]) * 0.5];
        steelParts.push(beamBetween(corners0[f], midTop, 0.15, 0.15));
        steelParts.push(beamBetween(corners0[nf], midTop, 0.15, 0.15));
      }
    }
    if (b >= 1) {
      steelParts.push(beamBetween(corners1[0], corners1[2], 0.12, 0.12));
      steelParts.push(beamBetween(corners1[1], corners1[3], 0.12, 0.12));
    }
  }

  // 2. Spacious 6.8m × 6.8m Walkable Sniper & Spotter Catwalk Deck at y = 28.0m (with open ladder hatch at z = +2.35m)
  const deckW = RADAR_TOWER_SPEC.deckWidth; // 6.8m
  const deckHalf = deckW * 0.5; // 3.4m
  const ladZ = RADAR_TOWER_SPEC.ladderLocalZ; // +2.35m
  // Build deck around the (x in [-0.68..+0.68], z in [1.67..3.03]) ladder hatch opening!
  darkEquipParts.push({
    geo: new THREE.BoxGeometry(deckW, 0.24, 5.05),
    pos: [0, 27.88, -0.875],
    rot: [0, 0, 0]
  });
  darkEquipParts.push({
    geo: new THREE.BoxGeometry(2.72, 0.24, 1.75),
    pos: [-2.04, 27.88, 2.525],
    rot: [0, 0, 0]
  });
  darkEquipParts.push({
    geo: new THREE.BoxGeometry(2.72, 0.24, 1.75),
    pos: [2.04, 27.88, 2.525],
    rot: [0, 0, 0]
  });

  // 4-Corner Sniper Ballistic Waist Shields & Full Perimeter Safety Guardrails (y = 28.0..29.18m)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      darkEquipParts.push({
        geo: new THREE.BoxGeometry(0.12, 1.22, 0.12),
        pos: [sx * (deckHalf - 0.08), 28.6, sz * (deckHalf - 0.08)],
        rot: [0, 0, 0]
      });
      // Corner sniper cover plates (waist-high steel ballistic apron at all 4 corners!)
      steelParts.push({
        geo: new THREE.BoxGeometry(1.45, 0.92, 0.08),
        pos: [sx * (deckHalf - 0.78), 28.46, sz * (deckHalf - 0.08)],
        rot: [0, 0, 0]
      });
      steelParts.push({
        geo: new THREE.BoxGeometry(0.08, 0.92, 1.45),
        pos: [sx * (deckHalf - 0.08), 28.46, sz * (deckHalf - 0.78)],
        rot: [0, 0, 0]
      });
    }
    for (const ry of [28.58, 29.15]) {
      darkEquipParts.push({
        geo: new THREE.BoxGeometry(deckW, 0.08, 0.08),
        pos: [0, ry, sx * (deckHalf - 0.08)],
        rot: [0, 0, 0]
      });
      darkEquipParts.push({
        geo: new THREE.BoxGeometry(0.08, 0.08, deckW),
        pos: [sx * (deckHalf - 0.08), ry, 0],
        rot: [0, 0, 0]
      });
    }
  }

  // Electronics cabinets tucked near center pedestal so all 4 corners stay 100% open for snipers!
  darkEquipParts.push({
    geo: new THREE.BoxGeometry(1.15, 1.5, 0.95),
    pos: [-0.95, 28.75, -0.75],
    rot: [0, 0, 0]
  });
  darkEquipParts.push({
    geo: new THREE.BoxGeometry(1.85, 2.2, 1.45),
    pos: [-1.85, 1.1, -1.85],
    rot: [0, 0, 0]
  });

  // Full-Height Climbable Caged Steel Ladder (y = 0.2..28.6m at x = 0, z = +2.35m) + High-Vis Entry Stile!
  darkEquipParts.push({ geo: new THREE.BoxGeometry(0.08, 28.5, 0.08), pos: [-0.34, 14.35, ladZ], rot: [0, 0, 0] });
  darkEquipParts.push({ geo: new THREE.BoxGeometry(0.08, 28.5, 0.08), pos: [0.34, 14.35, ladZ], rot: [0, 0, 0] });
  redWarnParts.push({ geo: new THREE.BoxGeometry(0.12, 2.6, 0.12), pos: [-0.34, 1.35, ladZ], rot: [0, 0, 0] });
  redWarnParts.push({ geo: new THREE.BoxGeometry(0.12, 2.6, 0.12), pos: [0.34, 1.35, ladZ], rot: [0, 0, 0] });
  for (let ly = 0.5; ly <= 28.2; ly += 0.55) {
    darkEquipParts.push({
      geo: new THREE.BoxGeometry(0.68, 0.05, 0.05),
      pos: [0, ly, ladZ],
      rot: [0, 0, 0]
    });
  }
  // Safety cage hoops along climbable shaft (z = ladZ + 0.42m)
  for (let cy = 3.2; cy <= 26.8; cy += 2.6) {
    steelParts.push({ geo: new THREE.BoxGeometry(0.92, 0.06, 0.06), pos: [0, cy, ladZ + 0.68], rot: [0, 0, 0] });
    steelParts.push({ geo: new THREE.BoxGeometry(0.06, 0.06, 0.68), pos: [-0.44, cy, ladZ + 0.34], rot: [0, 0, 0] });
    steelParts.push({ geo: new THREE.BoxGeometry(0.06, 0.06, 0.68), pos: [0.44, cy, ladZ + 0.34], rot: [0, 0, 0] });
  }

  // 3. Elevated Rotary Azimuth Pedestal (clear above head height at y = 31.2..34.5m!) + Large Air-Search Radar Dish
  steelParts.push({
    geo: new THREE.CylinderGeometry(0.75, 0.95, 3.8, 10),
    pos: [0, 30.1, 0],
    rot: [0, 0, 0]
  });
  darkEquipParts.push({
    geo: new THREE.BoxGeometry(1.65, 1.15, 1.85),
    pos: [-0.2, 32.5, 0],
    rot: [0, 0, 0]
  });

  const dishCenter = new THREE.Vector3(1.35, 33.2, 0);
  const dishTilt = new THREE.Euler(0, 0, 0.3);
  const dishQuat = new THREE.Quaternion().setFromEuler(dishTilt);
  const toWorldDish = (lx, ly, lz) => {
    const v = new THREE.Vector3(lx, ly, lz).applyQuaternion(dishQuat).add(dishCenter);
    return [v.x, v.y, v.z];
  };

  const hubPt = toWorldDish(0, 0, 0);
  const focalPt = toWorldDish(2.75, 0, 0);
  const dishRadY = 3.1;
  const dishRadZ = 4.6;
  const rimPts = [];
  const ribCount = 12;
  for (let r = 0; r < ribCount; r++) {
    const ang = (r / ribCount) * Math.PI * 2;
    const midPt = toWorldDish(0.38, Math.sin(ang) * dishRadY * 0.55, Math.cos(ang) * dishRadZ * 0.55);
    const rimPt = toWorldDish(1.05, Math.sin(ang) * dishRadY, Math.cos(ang) * dishRadZ);
    rimPts.push(rimPt);
    steelParts.push(beamBetween(hubPt, midPt, 0.1, 0.1));
    steelParts.push(beamBetween(midPt, rimPt, 0.085, 0.085));
  }
  for (let r = 0; r < ribCount; r++) {
    steelParts.push(beamBetween(rimPts[r], rimPts[(r + 1) % ribCount], 0.11, 0.11));
  }
  for (const idx of [1, 5, 9]) {
    steelParts.push(beamBetween(rimPts[idx], focalPt, 0.085, 0.085));
  }
  darkEquipParts.push(beamBetween(toWorldDish(2.4, 0, 0), toWorldDish(3.0, 0, 0), 0.42, 0.42));
  steelParts.push(beamBetween(toWorldDish(-1.85, 0, 0), hubPt, 0.22, 0.22));

  // Lightning & FAA Obstruction Mast rising to y = 38.5m
  steelParts.push({
    geo: new THREE.CylinderGeometry(0.08, 0.15, 5.2, 8),
    pos: [-0.45, 35.6, 0],
    rot: [0, 0, 0]
  });

  for (let band = 0; band < 6; band++) {
    const by = 33.4 + band * 0.78;
    const targetArr = band % 2 === 0 ? redWarnParts : whiteWarnParts;
    targetArr.push({
      geo: new THREE.CylinderGeometry(0.16, 0.17, 0.72, 8),
      pos: [-0.45, by, 0],
      rot: [0, 0, 0]
    });
  }
  redWarnParts.push({ geo: new THREE.BoxGeometry(0.28, 0.48, 0.42), pos: rimPts[0], rot: [0, 0, 0.3] });
  redWarnParts.push({ geo: new THREE.BoxGeometry(0.28, 0.48, 0.42), pos: rimPts[6], rot: [0, 0, 0.3] });
  whiteWarnParts.push({
    geo: new THREE.CylinderGeometry(0.95, 0.95, 0.42, 12),
    pos: [0, 20.5, 3.15],
    rot: [Math.PI / 2, 0, 0]
  });

  beaconGlowParts.push({
    geo: new THREE.CylinderGeometry(0.24, 0.26, 0.48, 10),
    pos: [-0.45, 38.45, 0],
    rot: [0, 0, 0]
  });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      beaconGlowParts.push({
        geo: new THREE.BoxGeometry(0.16, 0.16, 0.16),
        pos: [sx * (deckHalf - 0.08), 29.28, sz * (deckHalf - 0.08)],
        rot: [0, 0, 0]
      });
    }
  }

  return {
    towerSteelGeo: mergeStaticParts(steelParts),
    towerEquipGeo: mergeStaticParts(darkEquipParts),
    towerRedGeo: mergeStaticParts(redWarnParts),
    towerWhiteGeo: mergeStaticParts(whiteWarnParts),
    towerBeaconGeo: mergeStaticParts(beaconGlowParts)
  };
}

function buildPowerTowerGeometries() {
  const steelParts = [];
  const darkEquipParts = [];
  const redWarnParts = [];
  const whiteWarnParts = [];
  const beaconGlowParts = [];

  // 1. Monumental 44.5m High-Voltage 400kV Steel Lattice Power Transmission Tower (12.4m × 12.4m straddle base!)
  //    Open 7.8m lower portal allows Tanks, Trucks & Humvees to drive cleanly underneath!
  const tierYs = [0.5, 7.8, 14.2, 20.0, 26.2, 32.5, 38.8, 44.0];
  const halfSpanAt = (y) => {
    if (y <= 20.0) return 6.2 - (y / 20.0) * 2.55; // 6.20m base -> 3.65m waist at y=20m
    if (y <= 32.5) return 3.65 - ((y - 20.0) / 12.5) * 0.55; // 3.65m -> 3.10m crown at y=32.5m
    return Math.max(0.32, 3.1 - ((y - 32.5) / 11.5) * 2.78); // pyramidal earth-wire spire to y=44.0m
  };

  // 4 Massive Concrete Corner Footings + Tapered Main Lattice Legs
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const baseH = halfSpanAt(0.5);
      steelParts.push({
        geo: new THREE.BoxGeometry(1.75, 1.1, 1.75),
        pos: [sx * baseH, 0.55, sz * baseH],
        rot: [0, 0, 0]
      });
      for (let b = 0; b < tierYs.length - 1; b++) {
        const y0 = tierYs[b];
        const y1 = tierYs[b + 1];
        const h0 = halfSpanAt(y0);
        const h1 = halfSpanAt(y1);
        const legW = b < 5 ? 0.34 : 0.24;
        steelParts.push(beamBetween([sx * h0, y0, sz * h0], [sx * h1, y1, sz * h1], legW, legW));
      }
    }
  }

  // Horizontal Truss Girts & Diagonal X-Cross-Bracing across all bays (open drive-under portal in Bay 0!)
  for (let b = 0; b < tierYs.length - 1; b++) {
    const y0 = tierYs[b];
    const y1 = tierYs[b + 1];
    const h0 = halfSpanAt(y0);
    const h1 = halfSpanAt(y1);
    const c0 = [
      [-h0, y0, -h0],
      [h0, y0, -h0],
      [h0, y0, h0],
      [-h0, y0, h0]
    ];
    const c1 = [
      [-h1, y1, -h1],
      [h1, y1, -h1],
      [h1, y1, h1],
      [-h1, y1, h1]
    ];
    for (let f = 0; f < 4; f++) {
      const nf = (f + 1) % 4;
      steelParts.push(beamBetween(c1[f], c1[nf], 0.2, 0.2));
      if (b === 0) {
        const archMid = [(c1[f][0] + c1[nf][0]) * 0.5, y1, (c1[f][2] + c1[nf][2]) * 0.5];
        steelParts.push(beamBetween(c0[f], archMid, 0.18, 0.18));
        steelParts.push(beamBetween(c0[nf], archMid, 0.18, 0.18));
      } else {
        const targetArr = b >= 5 ? (b % 2 === 1 ? redWarnParts : whiteWarnParts) : steelParts;
        targetArr.push(beamBetween(c0[f], c1[nf], 0.14, 0.14));
        targetArr.push(beamBetween(c0[nf], c1[f], 0.14, 0.14));
      }
    }
  }

  // 2. Twin Wide High-Voltage Steel Cross-Arms (spanning along Z so West-East cables attach at ±Z tips!)
  //    Lower Cross-Arm: 22.0m total span (±11.0m) at y = 24.5m; Upper Cross-Arm: 18.4m span (±9.2m) at y = 35.5m
  for (const arm of [
    { y: POWER_TOWER_SPEC.lowerArmY, halfSpan: POWER_TOWER_SPEC.lowerArmHalfSpan, bodyH: halfSpanAt(24.5) },
    { y: POWER_TOWER_SPEC.upperArmY, halfSpan: POWER_TOWER_SPEC.upperArmHalfSpan, bodyH: halfSpanAt(35.5) }
  ]) {
    for (const sz of [-1, 1]) {
      const tipZ = sz * arm.halfSpan;
      const rootZ = sz * arm.bodyH;
      for (const sx of [-1, 1]) {
        const rootX = sx * arm.bodyH * 0.75;
        steelParts.push(beamBetween([rootX, arm.y - 0.5, rootZ], [0, arm.y - 0.35, tipZ], 0.2, 0.2));
        steelParts.push(beamBetween([rootX, arm.y + 1.55, rootZ], [0, arm.y - 0.25, tipZ], 0.16, 0.16));
      }
      // Hanging Ceramic High-Voltage Suspension Insulator String (2.6m long) + Conductor Clamp Yoke
      whiteWarnParts.push({
        geo: new THREE.CylinderGeometry(0.24, 0.24, 2.4, 8),
        pos: [0, arm.y - 1.55, tipZ],
        rot: [0, 0, 0]
      });
      darkEquipParts.push({
        geo: new THREE.BoxGeometry(0.95, 0.22, 0.32),
        pos: [0, arm.y - 2.8, tipZ],
        rot: [0, 0, 0]
      });
      redWarnParts.push({
        geo: new THREE.BoxGeometry(0.32, 0.42, 0.32),
        pos: [0, arm.y - 0.15, tipZ],
        rot: [0, 0, 0]
      });
    }
  }

  // 3. TWO Spacious Walkable Sniper Overwatch Decks (Lower 7.6m × 7.6m @ y=20.0m, Upper 6.8m × 6.8m @ y=32.5m)
  const ladZ = POWER_TOWER_SPEC.ladderLocalZ; // +2.55m
  for (const deck of [
    { y: POWER_TOWER_SPEC.lowerDeckY, w: POWER_TOWER_SPEC.lowerDeckWidth },
    { y: POWER_TOWER_SPEC.upperDeckY, w: POWER_TOWER_SPEC.upperDeckWidth }
  ]) {
    const half = deck.w * 0.5;
    const backSpan = ladZ - 0.72 - -half;
    const frontSpan = half - (ladZ + 0.72);
    // Solid steel grating platform surrounding the climb-through ladder hatch at (x in [-0.72..+0.72], z in [ladZ-0.72..ladZ+0.72])
    darkEquipParts.push({
      geo: new THREE.BoxGeometry(deck.w, 0.24, backSpan),
      pos: [0, deck.y - 0.12, -half + backSpan * 0.5],
      rot: [0, 0, 0]
    });
    if (frontSpan > 0.12) {
      darkEquipParts.push({
        geo: new THREE.BoxGeometry(deck.w, 0.24, frontSpan),
        pos: [0, deck.y - 0.12, half - frontSpan * 0.5],
        rot: [0, 0, 0]
      });
    }
    const sideW = half - 0.72;
    darkEquipParts.push({
      geo: new THREE.BoxGeometry(sideW, 0.24, 1.44),
      pos: [-half + sideW * 0.5, deck.y - 0.12, ladZ],
      rot: [0, 0, 0]
    });
    darkEquipParts.push({
      geo: new THREE.BoxGeometry(sideW, 0.24, 1.44),
      pos: [half - sideW * 0.5, deck.y - 0.12, ladZ],
      rot: [0, 0, 0]
    });

    // 4-Corner Sniper Ballistic Shields & Waist/Knee Safety Guardrails
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        darkEquipParts.push({
          geo: new THREE.BoxGeometry(0.12, 1.2, 0.12),
          pos: [sx * (half - 0.08), deck.y + 0.6, sz * (half - 0.08)],
          rot: [0, 0, 0]
        });
        steelParts.push({
          geo: new THREE.BoxGeometry(1.55, 0.92, 0.08),
          pos: [sx * (half - 0.82), deck.y + 0.46, sz * (half - 0.08)],
          rot: [0, 0, 0]
        });
        steelParts.push({
          geo: new THREE.BoxGeometry(0.08, 0.92, 1.55),
          pos: [sx * (half - 0.08), deck.y + 0.46, sz * (half - 0.82)],
          rot: [0, 0, 0]
        });
      }
      for (const ry of [deck.y + 0.58, deck.y + 1.15]) {
        darkEquipParts.push({
          geo: new THREE.BoxGeometry(deck.w, 0.08, 0.08),
          pos: [0, ry, sx * (half - 0.08)],
          rot: [0, 0, 0]
        });
        darkEquipParts.push({
          geo: new THREE.BoxGeometry(0.08, 0.08, deck.w),
          pos: [sx * (half - 0.08), ry, 0],
          rot: [0, 0, 0]
        });
      }
    }
  }

  // 4. Full-Height Climbable Caged Steel Ladder (y = 0.2..33.2m at x = 0, z = +2.55m) + High-Vis Base Entry Frame!
  darkEquipParts.push({ geo: new THREE.BoxGeometry(0.09, 33.1, 0.09), pos: [-0.36, 16.65, ladZ], rot: [0, 0, 0] });
  darkEquipParts.push({ geo: new THREE.BoxGeometry(0.09, 33.1, 0.09), pos: [0.36, 16.65, ladZ], rot: [0, 0, 0] });
  redWarnParts.push({ geo: new THREE.BoxGeometry(0.14, 3.0, 0.14), pos: [-0.36, 1.5, ladZ], rot: [0, 0, 0] });
  redWarnParts.push({ geo: new THREE.BoxGeometry(0.14, 3.0, 0.14), pos: [0.36, 1.5, ladZ], rot: [0, 0, 0] });
  whiteWarnParts.push({ geo: new THREE.BoxGeometry(0.95, 0.28, 0.1), pos: [0, 2.85, ladZ - 0.05], rot: [0, 0, 0] });
  for (let ly = 0.45; ly <= 32.9; ly += 0.55) {
    darkEquipParts.push({
      geo: new THREE.BoxGeometry(0.72, 0.05, 0.05),
      pos: [0, ly, ladZ],
      rot: [0, 0, 0]
    });
  }
  for (let cy = 3.2; cy <= 31.6; cy += 2.6) {
    if (Math.abs(cy - 20.5) < 1.1) continue;
    steelParts.push({ geo: new THREE.BoxGeometry(0.96, 0.06, 0.06), pos: [0, cy, ladZ + 0.7], rot: [0, 0, 0] });
    steelParts.push({ geo: new THREE.BoxGeometry(0.06, 0.06, 0.7), pos: [-0.46, cy, ladZ + 0.35], rot: [0, 0, 0] });
    steelParts.push({ geo: new THREE.BoxGeometry(0.06, 0.06, 0.7), pos: [0.46, cy, ladZ + 0.35], rot: [0, 0, 0] });
  }

  // 5. Pinnacle FAA Red Obstruction Beacon at y = 44.5m + Upper Deck Corner Lights
  beaconGlowParts.push({
    geo: new THREE.CylinderGeometry(0.28, 0.3, 0.56, 10),
    pos: [0, 44.45, 0],
    rot: [0, 0, 0]
  });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      beaconGlowParts.push({
        geo: new THREE.BoxGeometry(0.16, 0.16, 0.16),
        pos: [sx * 3.32, 33.75, sz * 3.32],
        rot: [0, 0, 0]
      });
    }
  }

  return {
    pylonSteelGeo: mergeStaticParts(steelParts),
    pylonEquipGeo: mergeStaticParts(darkEquipParts),
    pylonRedGeo: mergeStaticParts(redWarnParts),
    pylonWhiteGeo: mergeStaticParts(whiteWarnParts),
    pylonBeaconGeo: mergeStaticParts(beaconGlowParts)
  };
}

function buildAmmoStashGeometries() {
  // 1. Main Ordnance Chest + Overhanging Ribbed Lid + Pallet Skids + Stacked .50 Cal / 5.56mm Ammo Cans
  const boxGeo = mergeStaticParts([
    // Pallet skids under chest
    { geo: new THREE.BoxGeometry(1.42, 0.08, 0.16), pos: [0, -0.37, -0.3], rot: [0, 0, 0] },
    { geo: new THREE.BoxGeometry(1.42, 0.08, 0.16), pos: [0, -0.37, 0.3], rot: [0, 0, 0] },
    // Main beveled chest hull + top overhanging hinged lid + 3 lid ribs
    { geo: new THREE.BoxGeometry(1.34, 0.68, 0.84), pos: [0, -0.02, 0], rot: [0, 0, 0] },
    { geo: new THREE.BoxGeometry(1.4, 0.14, 0.9), pos: [0, 0.36, 0], rot: [0, 0, 0] },
    { geo: new THREE.BoxGeometry(0.12, 0.17, 0.92), pos: [-0.46, 0.37, 0], rot: [0, 0, 0] },
    { geo: new THREE.BoxGeometry(0.12, 0.17, 0.92), pos: [0, 0.37, 0], rot: [0, 0, 0] },
    { geo: new THREE.BoxGeometry(0.12, 0.17, 0.92), pos: [0.46, 0.37, 0], rot: [0, 0, 0] },
    // Secondary M2A1 .50 cal & M19A1 5.56mm steel ammo cans stacked beside front-left corner
    { geo: new THREE.BoxGeometry(0.32, 0.24, 0.18), pos: [-0.52, -0.29, 0.54], rot: [0, 0.18, 0] },
    { geo: new THREE.BoxGeometry(0.28, 0.2, 0.16), pos: [-0.16, -0.31, 0.53], rot: [0, -0.12, 0] },
    { geo: new THREE.BoxGeometry(0.28, 0.2, 0.16), pos: [-0.48, -0.07, 0.53], rot: [0, -0.08, 0] }
  ]);

  // 2. High-Visibility Yellow Ordnance Stencil Band + Ammo Can Stencil Bars
  const stripeGeo = mergeStaticParts([
    { geo: new THREE.BoxGeometry(1.38, 0.14, 0.88), pos: [0, 0, 0], rot: [0, 0, 0] },
    { geo: new THREE.BoxGeometry(0.33, 0.045, 0.19), pos: [-0.52, -0.44, 0.54], rot: [0, 0.18, 0] },
    { geo: new THREE.BoxGeometry(0.29, 0.04, 0.17), pos: [-0.16, -0.47, 0.53], rot: [0, -0.12, 0] }
  ]);

  // 3. Kit-Locker Steel Weapon Rack Frame + Crate Lid Latches & Carry Handles (`rackFrameMat`)
  const rackAndHardwareGeo = mergeStaticParts([
    // Open-front tactical weapon rack base tray, side uprights, slotted barrel bar & header
    { geo: new THREE.BoxGeometry(0.5, 0.1, 0.64), pos: [0.68, 0.05, 0], rot: [0, 0, 0] },
    { geo: new THREE.BoxGeometry(0.46, 0.96, 0.07), pos: [0.68, 0.54, -0.29], rot: [0, 0, 0] },
    { geo: new THREE.BoxGeometry(0.46, 0.96, 0.07), pos: [0.68, 0.54, 0.29], rot: [0, 0, 0] },
    { geo: new THREE.BoxGeometry(0.08, 0.88, 0.58), pos: [0.87, 0.52, 0], rot: [0, 0, 0] },
    { geo: new THREE.BoxGeometry(0.46, 0.08, 0.58), pos: [0.68, 0.68, 0], rot: [0, 0, 0] },
    // Crate front/rear hinged lid latches (4x) & side folding drop carry handles (2x)
    { geo: new THREE.BoxGeometry(0.08, 0.18, 0.05), pos: [-0.52, 0.69, 0.44], rot: [0, 0, 0] },
    { geo: new THREE.BoxGeometry(0.08, 0.18, 0.05), pos: [0.16, 0.69, 0.44], rot: [0, 0, 0] },
    { geo: new THREE.BoxGeometry(0.08, 0.18, 0.05), pos: [-0.52, 0.69, -0.44], rot: [0, 0, 0] },
    { geo: new THREE.BoxGeometry(0.08, 0.18, 0.05), pos: [0.16, 0.69, -0.44], rot: [0, 0, 0] },
    { geo: new THREE.BoxGeometry(0.05, 0.12, 0.28), pos: [-0.87, 0.54, 0], rot: [0, 0, 0] }
  ]);

  // 4. Racked Assault Carbines / DMRs (stocks, receivers, curved mags, optics & barrels)
  const weaponParts = [];
  for (const rz of [-0.16, 0.0, 0.16]) {
    // Buttstock + Receiver + Handguard + Protruding Barrel & Flash Hider
    weaponParts.push({ geo: new THREE.BoxGeometry(0.12, 0.26, 0.06), pos: [0.64, 0.23, rz], rot: [0, 0, 0.08] });
    weaponParts.push({ geo: new THREE.BoxGeometry(0.11, 0.36, 0.065), pos: [0.66, 0.52, rz], rot: [0, 0, 0.08] });
    weaponParts.push({ geo: new THREE.BoxGeometry(0.075, 0.28, 0.06), pos: [0.68, 0.82, rz], rot: [0, 0, 0.08] });
    weaponParts.push({
      geo: new THREE.CylinderGeometry(0.018, 0.022, 0.34, 6),
      pos: [0.7, 1.08, rz],
      rot: [0, 0, -0.08]
    });
    // Curved 30-round magazine + Top Holo/ACOG Optic housing
    weaponParts.push({
      geo: new THREE.BoxGeometry(0.18, 0.065, 0.048),
      pos: [0.55, 0.54, rz],
      rot: [0, 0, 0.28]
    });
    weaponParts.push({
      geo: new THREE.BoxGeometry(0.07, 0.12, 0.052),
      pos: [0.73, 0.54, rz],
      rot: [0, 0, 0.08]
    });
  }
  const rackedWeaponsGeo = mergeStaticParts(weaponParts);

  // 5. Gleaming Brass Cartridge Belt Drape & Crate Clasps
  const brassStashGeo = mergeStaticParts([
    { geo: new THREE.BoxGeometry(0.24, 0.035, 0.14), pos: [-0.42, 0.86, 0.18], rot: [0, 0.25, 0] },
    { geo: new THREE.BoxGeometry(0.05, 0.18, 0.14), pos: [-0.31, 0.78, 0.44], rot: [0, 0, 0] },
    { geo: new THREE.BoxGeometry(0.06, 0.07, 0.04), pos: [-0.18, 0.66, 0.45], rot: [0, 0, 0] }
  ]);

  // 6. Red Trauma IFAK Medkit Pouch + Raised White Cross Emblem
  const medkitPouchGeo = mergeStaticParts([
    { geo: new THREE.BoxGeometry(0.28, 0.24, 0.2), pos: [0.22, 0.94, -0.18], rot: [0, -0.16, 0] }
  ]);
  const medkitCrossGeo = mergeStaticParts([
    { geo: new THREE.BoxGeometry(0.14, 0.045, 0.22), pos: [0.22, 0.94, -0.18], rot: [0, -0.16, 0] },
    { geo: new THREE.BoxGeometry(0.045, 0.14, 0.22), pos: [0.22, 0.94, -0.18], rot: [0, -0.16, 0] },
    { geo: new THREE.BoxGeometry(0.3, 0.045, 0.045), pos: [0.22, 0.94, -0.18], rot: [0, -0.16, 0] },
    { geo: new THREE.BoxGeometry(0.045, 0.14, 0.3), pos: [0.22, 0.94, -0.18], rot: [0, -0.16, 0] }
  ]);

  // 7. Glowing Cyan Kit-Swap Header Badge
  const kitBadgeGeo = mergeStaticParts([
    { geo: new THREE.BoxGeometry(0.5, 0.16, 0.62), pos: [0.68, 0.98, 0], rot: [0, 0, 0] }
  ]);

  return {
    boxGeo,
    stripeGeo,
    rackAndHardwareGeo,
    rackedWeaponsGeo,
    brassStashGeo,
    medkitPouchGeo,
    medkitCrossGeo,
    kitBadgeGeo
  };
}

function getPropShared() {
  if (!propShared) {
    const towerGeos = buildRadarTowerGeometries();
    const pylonGeos = buildPowerTowerGeometries();
    const stashGeos = buildAmmoStashGeometries();

    propShared = {
      ...towerGeos,
      ...pylonGeos,
      ...stashGeos,
      ringGeo: markShared(new THREE.RingGeometry(1.15, 1.48, 24)),

      // Shared Materials
      steelMat: markShared(
        new THREE.MeshStandardMaterial({
          color: 0xbdc3c7,
          metalness: 0.62,
          roughness: 0.38,
          flatShading: true
        })
      ),
      redMat: markShared(
        new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.5, flatShading: true })
      ),
      whiteWarnMat: markShared(
        new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.42, flatShading: true })
      ),
      beaconGlowMat: markShared(new THREE.MeshBasicMaterial({ color: 0xff3838 })),

      permBoxMat: markShared(
        new THREE.MeshStandardMaterial({
          color: 0x4b5320,
          roughness: 0.78,
          flatShading: true
        })
      ),
      tempBoxMat: markShared(
        new THREE.MeshStandardMaterial({
          color: 0x2f6b3c,
          roughness: 0.78,
          flatShading: true
        })
      ),
      stripeMat: markShared(new THREE.MeshBasicMaterial({ color: 0xf1c40f })),
      rackFrameMat: markShared(
        new THREE.MeshStandardMaterial({
          color: 0x2c3e50,
          roughness: 0.58,
          metalness: 0.38,
          flatShading: true
        })
      ),
      rifleStockMat: markShared(
        new THREE.MeshStandardMaterial({
          color: 0x1e272e,
          metalness: 0.52,
          roughness: 0.46,
          flatShading: true
        })
      ),
      brassMat: markShared(
        new THREE.MeshStandardMaterial({
          color: 0xd4af37,
          metalness: 0.82,
          roughness: 0.28,
          flatShading: true
        })
      ),
      kitBadgeMat: markShared(new THREE.MeshBasicMaterial({ color: 0x00d2d3 }))
    };
  }
  return propShared;
}

function freezeStaticMeshes(root) {
  root.traverse((child) => {
    if (child.isMesh) {
      child.updateMatrix();
      child.matrixAutoUpdate = false;
    }
  });
}

export function createRadarTowerMesh() {
  const s = getPropShared();
  const group = new THREE.Group();

  // 1. Concrete foundation pads + 4-legged tapered steel lattice + open-ribbed parabolic dish frame
  const latticeStructure = new THREE.Mesh(s.towerSteelGeo, s.steelMat);
  latticeStructure.castShadow = true;
  latticeStructure.receiveShadow = true;

  // 2. Upper observation catwalk (y=19.8m), safety guardrails, equipment cabinets, ladder & feed-horn
  const catwalkAndShelter = new THREE.Mesh(s.towerEquipGeo, s.rackFrameMat);
  catwalkAndShelter.castShadow = true;

  // 3 & 4. Red & White aviation warning bands (y=22.4..24.8m) & microwave drum relay
  const redBands = new THREE.Mesh(s.towerRedGeo, s.redMat);
  const whiteBands = new THREE.Mesh(s.towerWhiteGeo, s.whiteWarnMat);

  // 5. Glowing Red Obstruction Beacon at y = 25.2m
  const beacon = new THREE.Mesh(s.towerBeaconGeo, s.beaconGlowMat);

  group.add(latticeStructure, catwalkAndShelter, redBands, whiteBands, beacon);
  freezeStaticMeshes(group);
  return group;
}

export function createPowerTowerMesh() {
  const s = getPropShared();
  const group = new THREE.Group();

  // 1. 12.4m × 12.4m Straddle Lattice Legs + Twin 22m High-Voltage Cross-Arms
  const lattice = new THREE.Mesh(s.pylonSteelGeo, s.steelMat);
  lattice.castShadow = true;
  lattice.receiveShadow = true;

  // 2. Dual Sniper Overwatch Catwalk Decks (20.0m & 32.5m), Guardrails & Full-Height Climbable Ladder
  const decksAndLadder = new THREE.Mesh(s.pylonEquipGeo, s.rackFrameMat);
  decksAndLadder.castShadow = true;
  decksAndLadder.receiveShadow = true;

  // 3 & 4. Red/White Aviation Warning Upper Bracing & Ceramic Suspension Insulator Strings
  const redTrim = new THREE.Mesh(s.pylonRedGeo, s.redMat);
  const insulators = new THREE.Mesh(s.pylonWhiteGeo, s.whiteWarnMat);

  // 5. Pinnacle 44.5m FAA Red Obstruction Beacon & Deck Lights
  const beacon = new THREE.Mesh(s.pylonBeaconGeo, s.beaconGlowMat);

  group.add(lattice, decksAndLadder, redTrim, insulators, beacon);
  freezeStaticMeshes(group);
  return group;
}

export function createAmmoStashMesh(permanent = true) {
  const s = getPropShared();
  const group = new THREE.Group();

  // 1. Main Olive-Drab Squad Ammo & Ordnance Chest + Side .50 Cal / 5.56mm Cans (index 0)
  const box = new THREE.Mesh(s.boxGeo, permanent ? s.permBoxMat : s.tempBoxMat);
  box.position.set(-0.18, 0.41, 0);
  box.castShadow = true;
  box.receiveShadow = true;

  // 2. High-Visibility Tactical Stencil Band (index 1)
  const stripe = new THREE.Mesh(s.stripeGeo, s.stripeMat);
  stripe.position.set(-0.18, 0.58, 0);

  // 3. Squad Role / Kit-Changing Weapon Rack, Crate Hardware, Trauma Medkit & Racked Rifles (index 2)
  const kitLocker = new THREE.Group();
  const rackFrame = new THREE.Mesh(s.rackAndHardwareGeo, s.rackFrameMat);
  rackFrame.castShadow = true;
  const rackedWeapons = new THREE.Mesh(s.rackedWeaponsGeo, s.rifleStockMat);
  rackedWeapons.castShadow = true;
  const brassBelt = new THREE.Mesh(s.brassStashGeo, s.brassMat);
  const medPouch = new THREE.Mesh(s.medkitPouchGeo, s.redMat);
  const medCross = new THREE.Mesh(s.medkitCrossGeo, s.whiteWarnMat);
  const kitBadge = new THREE.Mesh(s.kitBadgeGeo, s.kitBadgeMat);
  kitLocker.add(rackFrame, rackedWeapons, brassBelt, medPouch, medCross, kitBadge);

  // 4. Pulsing Ground Resupply & Kit-Swap Ring (CRITICAL INVARIANT: MUST stay at index 3 in group.children!)
  const ring = new THREE.Mesh(
    s.ringGeo,
    new THREE.MeshBasicMaterial({
      color: permanent ? 0x00d2d3 : 0x2ecc71,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;

  group.add(box, stripe, kitLocker, ring);
  freezeStaticMeshes(group);
  return group;
}
