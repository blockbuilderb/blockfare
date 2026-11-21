import * as THREE from '../../vendor/three.module.js';
import { TEXTURES } from '../textures.js?v=35';
import { TERRAIN } from '../config.js?v=35';

const VOXEL_SIZE = 1.25;

export const TerrainGenerator = {
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
  },

  /**
   * Returns walkable surface height including the 3 grand bridges over the river canyon.
   */
  getGroundHeightAt(x, z) {
    // Check if on one of the 3 fortified river bridges (z = -110, 0, +110)
    // Central Bridge C (z = 0) features an expanded 42m x 36m plaza deck for Objective C's garrison buildings!
    if (Math.abs(x) <= 21.0) {
      if (Math.abs(z) <= 18.0) {
        return TERRAIN.BRIDGE_DECK_HEIGHT;
      }
      for (const bz of [-110, 110]) {
        if (Math.abs(z - bz) <= 8.5) {
          return TERRAIN.BRIDGE_DECK_HEIGHT; // Bridge deck height above river
        }
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
    return Math.max(0, Math.floor((this.getGroundHeightAt(wx, wz) + 0.08) / VOXEL_SIZE));
  },

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
    //    Central Bridge C (z = 0) features an expanded 42m x 36m plaza deck with garrison buildings!
    const bridgeDeckGeo = new THREE.BoxGeometry(42, 0.8, 17.0);
    const centralPlazaDeckGeo = new THREE.BoxGeometry(42, 0.8, 36.0);
    const bridgeDeckMat = new THREE.MeshStandardMaterial({
      map: TEXTURES.darkConcrete,
      roughness: 0.85
    });
    const pierGeo = new THREE.BoxGeometry(2.6, 5.2, 15.5);

    for (const bz of [-110, 0, 110]) {
      const bridge = new THREE.Mesh(
        bz === 0 ? centralPlazaDeckGeo : bridgeDeckGeo,
        bridgeDeckMat
      );
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
      const halfSpanZ = bz === 0 ? 17.2 : 7.2;
      const gzMin = Math.round((bz - halfSpanZ) / VOXEL_SIZE);
      const gzMax = Math.round((bz + halfSpanZ) / VOXEL_SIZE);
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
    this.buildApartmentBlock(-142, -52, 7, 6, 2, 'darkConcrete'); // Obj A East Garrison House
    this.buildWatchtower(-138, -48);
    this.buildHescoBastion(-160, -56, 10, true);
    this.buildSandbagBunker(-155, -56);
    this.addAmmoCrate(-192, -66);

    // =========================================================================
    // SECTOR B: NORTH LOGISTICS & CONTAINER YARD (world x: -95, z: +85 -> grid gx ~ -76, gz ~ +68)
    // =========================================================================
    this.buildApartmentBlock(-90, 66, 10, 7, 3, 'darkConcrete');
    this.buildApartmentBlock(-68, 72, 9, 6, 2, 'concrete');
    this.buildApartmentBlock(-82, 78, 8, 6, 2, 'brick');        // Obj B North Command Building
    this.buildApartmentBlock(-74, 52, 8, 6, 2, 'darkConcrete'); // Obj B South Garrison Building
    this.buildShippingContainer(-82, 56, true, 'containerRed', 0);
    this.buildShippingContainer(-82, 56, true, 'containerBlue', 3);
    this.buildShippingContainer(-72, 58, false, 'containerOlive', 0);
    this.buildShippingContainer(-64, 62, true, 'containerRed', 0);
    this.buildShippingContainer(-64, 62, true, 'containerOlive', 3);
    this.buildWatchtower(-60, 56);
    this.buildHescoBastion(-78, 50, 12, true);
    this.buildSandbagBunker(-75, 68);
    this.addAmmoCrate(-92, 82);

    // =========================================================================
    // SECTOR C: CENTRAL RIVER CITY & GRAND BRIDGES (world x: 0, z: 0 -> grid gx ~ 0, gz ~ 0)
    // =========================================================================
    // Two 2-Story Bridgehead Garrison Guardhouses directly on the Central Plaza flanks at Obj C!
    this.buildApartmentBlock(-8, -13, 7, 6, 2, 'darkConcrete'); // Obj C North Plaza Guardhouse
    this.buildApartmentBlock(1, 7, 7, 6, 2, 'concrete');        // Obj C South Plaza Guardhouse
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
    this.buildApartmentBlock(82, -80, 8, 6, 2, 'brick');        // Obj D North Radar Ops Building
    this.buildApartmentBlock(88, -54, 8, 6, 2, 'concrete');     // Obj D South Garrison Barracks
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
    this.buildApartmentBlock(158, 42, 8, 6, 2, 'darkConcrete'); // Obj E North Industrial Control Post
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
  },

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
};
