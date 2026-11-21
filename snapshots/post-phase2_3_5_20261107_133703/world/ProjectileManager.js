import * as THREE from '../../vendor/three.module.js';
import { sound } from '../audio.js?v=35';
import { TERRAIN } from '../config.js?v=35';

const VOXEL_SIZE = 1.25;

// Pre-allocated reusable THREE.Color instances (Phase 3F)
const _debrisDarkColor = new THREE.Color(0x2d3436);
const _debrisOrangeColor = new THREE.Color(0xe67e22);
const _airstrikeTrailColor = new THREE.Color(0xff7675);
const _rocketTrailColor = new THREE.Color(0x95a5a6);

export const ProjectileManager = {
  /**
   * Structural Integrity & Gravity Collapse Solver:
   * Propagates load-bearing support from ground-anchored voxels upward (cost 0)
   * and across limited horizontal cantilevers/lintels (max span 3).
   * Any upper blocks or building sections that lose their vertical support
   * collapse under gravity instead of floating in mid-air!
   */
  checkStructuralIntegrity(centerGx, centerGy, centerGz, radius = 8, broadcastFn = null) {
    const MAX_SPAN = TERRAIN.MAX_SPAN;
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
  },

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
      if (ratio <= TERRAIN.BUILDING_COLLAPSE_THRESHOLD) {
        bld.collapsed = true;
        totalCollapsed += this.triggerBuildingCollapse(bld, broadcastFn);
      }
    }
    return totalCollapsed;
  },

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
  },

  spawnFallingBlock(origin, color) {
    if (this.debrisParticles.length > 65) {
      return;
    }
    if (!this._fallingBlockGeo) {
      this._fallingBlockGeo = new THREE.BoxGeometry(
        VOXEL_SIZE * 0.88,
        VOXEL_SIZE * 0.88,
        VOXEL_SIZE * 0.88
      );
    }
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.9,
      flatShading: true
    });
    const mesh = new THREE.Mesh(this._fallingBlockGeo, mat);
    mesh.position.copy(origin);
    mesh.castShadow = false;
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
      life: 1.4 + Math.random() * 0.5
    });
  },

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
  },

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
  },

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
  },

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
  },

  spawnExplosionVisual(pos, radius) {
    // 1. White-hot inner detonation core
    const coreGeo = new THREE.BoxGeometry(radius * 0.55, radius * 0.55, radius * 0.55);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xfff3b0,
      transparent: true,
      opacity: 0.98
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.position.copy(pos);
    this.scene.add(coreMesh);
    this.debrisParticles.push({
      mesh: coreMesh,
      vel: new THREE.Vector3(0, 1.0, 0),
      rotVel: new THREE.Vector3(5, 5, 5),
      life: 0.18,
      isFlash: true
    });

    // 2. Expanding fiery orange-red fireball
    const flashGeo = new THREE.BoxGeometry(radius * 0.95, radius * 0.95, radius * 0.95);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xff6b00,
      transparent: true,
      opacity: 0.92
    });
    const flashMesh = new THREE.Mesh(flashGeo, flashMat);
    flashMesh.position.copy(pos);
    this.scene.add(flashMesh);
    this.debrisParticles.push({
      mesh: flashMesh,
      vel: new THREE.Vector3(0, 2.2, 0),
      rotVel: new THREE.Vector3(3, 3, 3),
      life: 0.34,
      isFlash: true
    });

    // 3. Expanding horizontal ground shockwave ring
    const ringGeo = new THREE.RingGeometry(Math.max(0.8, radius * 0.25), Math.max(1.4, radius * 0.45), 24);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffb142,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.88
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    const groundY = this.getGroundHeightAt(pos.x, pos.z);
    ringMesh.position.set(pos.x, Math.max(pos.y, groundY) + 0.25, pos.z);
    this.scene.add(ringMesh);
    this.debrisParticles.push({
      mesh: ringMesh,
      vel: new THREE.Vector3(0, 0, 0),
      rotVel: new THREE.Vector3(0, 0, 0),
      life: 0.42,
      maxLife: 0.42,
      shockSpeed: Math.max(12, radius * 2.6),
      isShockwave: true
    });

    // 4. Rising dark mushroom smoke plume blocks
    const smokeCount = radius >= 8 ? 5 : 2;
    const smokeGeo = new THREE.BoxGeometry(radius * 0.48, radius * 0.48, radius * 0.48);
    for (let s = 0; s < smokeCount; s++) {
      const smokeMat = new THREE.MeshBasicMaterial({
        color: s % 2 === 0 ? 0x2f3640 : 0x4b4b4b,
        transparent: true,
        opacity: 0.72
      });
      const smokeMesh = new THREE.Mesh(smokeGeo, smokeMat);
      smokeMesh.position.copy(pos).add(
        new THREE.Vector3(
          (Math.random() - 0.5) * radius * 0.5,
          0.6 + s * 0.4,
          (Math.random() - 0.5) * radius * 0.5
        )
      );
      this.scene.add(smokeMesh);
      this.debrisParticles.push({
        mesh: smokeMesh,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 3.5,
          4.5 + Math.random() * 4.5,
          (Math.random() - 0.5) * 3.5
        ),
        rotVel: new THREE.Vector3(1.2, 1.5, 1.0),
        life: 1.35 + Math.random() * 0.5,
        maxLife: 1.85,
        isSmoke: true
      });
    }

    const chunkMult = radius >= 8 ? 2 : 1;
    this.spawnDebris(pos, _debrisDarkColor, 7 * chunkMult);
    this.spawnDebris(pos, _debrisOrangeColor, 5 * chunkMult);
  },

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
  },

  spawnAmmoCrate(wx, wz) {
    return this.addAmmoCrate(wx, wz);
  },

  updateDebris(dt) {
    for (let i = this.debrisParticles.length - 1; i >= 0; i--) {
      const p = this.debrisParticles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        if (p.mesh.material) p.mesh.material.dispose();
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
  },

  updateProjectiles(dt, units, onExplosionDamage, broadcastFn, vehicles = []) {
    const listener = units && units[0] && units[0].pos ? units[0] : null;
    const getListenerAudio = (pos) => {
      if (!listener || !listener.pos) return { dist: 0, pan: 0 };
      const dist = listener.pos.distanceTo(pos);
      const dx = pos.x - listener.pos.x;
      const dz = pos.z - listener.pos.z;
      const len = Math.hypot(dx, dz) || 1;
      const rightX = Math.cos(listener.yaw || 0);
      const rightZ = -Math.sin(listener.yaw || 0);
      const pan = (dx * rightX + dz * rightZ) / len;
      return { dist, pan };
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

      if (
        proj.type === 'rpg' ||
        proj.type === 'autocannon' ||
        proj.type === 'tank_shell' ||
        proj.type === 'airstrike_bomb'
      ) {
        this.spawnDebris(
          prevPos,
          proj.type === 'airstrike_bomb' ? _airstrikeTrailColor : _rocketTrailColor,
          proj.type === 'airstrike_bomb' ? 2 : 1
        );
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
        (proj.type === 'rpg' ||
          proj.type === 'tank_shell' ||
          proj.type === 'autocannon' ||
          proj.type === 'airstrike_bomb') &&
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
        if (
          proj.type === 'rpg' ||
          proj.type === 'autocannon' ||
          proj.type === 'tank_shell' ||
          proj.type === 'airstrike_bomb'
        ) {
          const hitPos = proj.mesh.position.clone();
          const rad =
            proj.type === 'airstrike_bomb'
              ? proj.blastRadius || 12.5
              : proj.type === 'tank_shell'
              ? 6.2
              : proj.type === 'rpg'
              ? 5.0
              : 2.8;
          const dmg =
            proj.type === 'airstrike_bomb'
              ? proj.blastDamage || 460
              : proj.type === 'tank_shell'
              ? 320
              : proj.type === 'rpg'
              ? 235
              : 95;
          const aud = getListenerAudio(hitPos);
          const soundScale =
            proj.type === 'autocannon'
              ? 0.42
              : proj.type === 'airstrike_bomb'
              ? 1.25
              : proj.type === 'tank_shell'
              ? 1.05
              : 0.95;
          sound.playExplosion(aud.dist, aud.pan, soundScale);
          this.explodeAt(
            hitPos,
            rad,
            dmg,
            (pos, r, d, broken) => {
              if (onExplosionDamage) {
                onExplosionDamage(pos, r, d, proj.owner, broken, proj.weaponLabel || null);
              }
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
  },

  updateAmmoCrates(dt, units) {
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
};
