import * as THREE from '../../vendor/three.module.js';
import { sound } from '../audio.js?v=90';
import { TERRAIN } from '../config.js?v=90';
import { events } from '../events.js?v=90';
import { createAmmoStashMesh } from '../models/prop-models.js?v=90';

const VOXEL_SIZE = 1.25;

// Pre-allocated reusable THREE.Color & BufferGeometry instances (Zero GPU geometry leak)
const _debrisDarkColor = new THREE.Color(0x2d3436);
const _debrisOrangeColor = new THREE.Color(0xe67e22);
const _airstrikeTrailColor = new THREE.Color(0xff7675);
const _rocketTrailColor = new THREE.Color(0x95a5a6);
const _sharedDebrisGeo = new THREE.BoxGeometry(0.32, 0.32, 0.32);
const _sharedSparkGeo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
const _sharedChipGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
const _sharedUnitBoxGeo = new THREE.BoxGeometry(1, 1, 1);
const _sharedRingGeo = new THREE.RingGeometry(0.3, 0.5, 24);
_sharedRingGeo.rotateX(-Math.PI / 2);

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
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.85,
        flatShading: true
      });
      const mesh = new THREE.Mesh(_sharedDebrisGeo, mat);
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
    const sparkMat = new THREE.MeshBasicMaterial({
      color: 0xffeaa7,
      transparent: true,
      opacity: 0.95
    });
    const sparkMesh = new THREE.Mesh(_sharedSparkGeo, sparkMat);
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
    const chipMat = new THREE.MeshStandardMaterial({
      color: color || 0x95a5a6,
      roughness: 0.85,
      flatShading: true
    });
    const chipMesh = new THREE.Mesh(_sharedChipGeo, chipMat);
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
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xfff3b0,
      transparent: true,
      opacity: 0.98
    });
    const coreMesh = new THREE.Mesh(_sharedUnitBoxGeo, coreMat);
    coreMesh.scale.setScalar(radius * 0.55);
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
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xff6b00,
      transparent: true,
      opacity: 0.92
    });
    const flashMesh = new THREE.Mesh(_sharedUnitBoxGeo, flashMat);
    flashMesh.scale.setScalar(radius * 0.95);
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
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffb142,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.88
    });
    const ringMesh = new THREE.Mesh(_sharedRingGeo, ringMat);
    ringMesh.scale.setScalar(Math.max(1.5, radius * 0.85));
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
    for (let s = 0; s < smokeCount; s++) {
      const smokeMat = new THREE.MeshBasicMaterial({
        color: s % 2 === 0 ? 0x2f3640 : 0x4b4b4b,
        transparent: true,
        opacity: 0.72
      });
      const smokeMesh = new THREE.Mesh(_sharedUnitBoxGeo, smokeMat);
      smokeMesh.scale.setScalar(radius * 0.48);
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

  addAmmoCrate(wx, wz, team = null, owner = 'FOB SUPPLY', permanent = true, duration = 120) {
    const wy = this.getGroundHeightAt(wx, wz);
    const pos = new THREE.Vector3(wx, wy, wz);
    const group = createAmmoStashMesh(permanent);
    group.position.copy(pos);
    this.scene.add(group);

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
            if (onExplosionDamage) {
              onExplosionDamage(pos, rad, dmg, proj.owner, broken);
            } else {
              events.emit('explosion:damage', {
                pos,
                radius: rad,
                maxDamage: dmg,
                owner: proj.owner,
                brokenCount: broken
              });
            }
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

      // Proportional Navigation Homing for AIM-9X / R-73 Air-to-Air & Stinger SAM Missiles
      if (proj.type === 'a2a_missile' && proj.targetVehicle && !proj.targetVehicle.dead) {
        const tgt = proj.targetVehicle;
        const tgtGroundY = this.getGroundHeightAt(tgt.pos.x, tgt.pos.z);
        const tgtAltAgl = Math.max(0, tgt.pos.y - tgtGroundY);
        // Low-Altitude Ground-Effect / Terrain Clutter Evasion (< 28m AGL):
        // Diving below 28m AGL masks the aircraft in radar ground clutter and breaks active missile lock!
        if (tgt.isAircraft && tgtAltAgl < 28.0 && (tgt.airborneRadarTimer || 0) >= 2.0) {
          proj.targetVehicle = null;
          if (tgt.driver && typeof tgt.driver.onActionPopup === 'function') {
            tgt.driver.onActionPopup(
              '🏔️ LOW-ALTITUDE RADAR MASKING (<28M AGL) — INCOMING MISSILE LOCK BROKEN!'
            );
          }
        }
      }
      if (
        proj.type === 'a2a_missile' &&
        proj.targetVehicle &&
        !proj.targetVehicle.dead &&
        !(proj.targetVehicle.flareActiveTimer > 0)
      ) {
        const curSpeed = Math.max(160, proj.vel.length());
        const toTarget = proj.targetVehicle.pos
          .clone()
          .add(new THREE.Vector3(0, 1.4, 0))
          .sub(proj.mesh.position);
        if (toTarget.lengthSq() > 1) {
          toTarget.normalize();
          const curDir = proj.vel.clone().normalize();
          const steerRate = Math.min(1, (proj.turnRate || 4.2) * dt);
          curDir.lerp(toTarget, steerRate).normalize();
          proj.vel.copy(curDir.multiplyScalar(curSpeed));
          proj.mesh.lookAt(proj.mesh.position.clone().add(curDir));
        }
      }

      proj.vel.y -= proj.gravity * dt;
      proj.mesh.position.addScaledVector(proj.vel, dt);

      if (
        proj.type === 'rpg' ||
        proj.type === 'autocannon' ||
        proj.type === 'tank_shell' ||
        proj.type === 'airstrike_bomb' ||
        proj.type === 'air_rocket' ||
        proj.type === 'a2a_missile' ||
        proj.type === 'jdam_bomb' ||
        proj.type === 'gbu28_bomb' ||
        proj.type === 'mortar_shell' ||
        proj.type === 'ac130_40mm' ||
        proj.type === 'ac130_105mm'
      ) {
        this.spawnDebris(
          prevPos,
          proj.type === 'airstrike_bomb' ||
            proj.type === 'jdam_bomb' ||
            proj.type === 'gbu28_bomb' ||
            proj.type === 'a2a_missile' ||
            proj.type === 'ac130_105mm'
            ? _airstrikeTrailColor
            : _rocketTrailColor,
          proj.type === 'gbu28_bomb' || proj.type === 'ac130_105mm' ? 2 : 1
        );
      }

      const segVec = proj.mesh.position.clone().sub(prevPos);
      const segLen = segVec.length();
      const segDir = segLen > 0.0001 ? segVec.clone().divideScalar(segLen) : new THREE.Vector3(0, 0, -1);

      const g = this.worldToGrid(
        proj.mesh.position.x,
        proj.mesh.position.y,
        proj.mesh.position.z
      );
      let hitVoxel = this.voxels.get(this.key(g.gx, g.gy, g.gz));
      if (!hitVoxel && segLen > 0.4 && typeof this.raycastVoxel === 'function') {
        const segVoxelHit = this.raycastVoxel(prevPos, segDir, segLen);
        if (segVoxelHit && segVoxelHit.voxel) {
          hitVoxel = segVoxelHit.voxel;
          proj.mesh.position.copy(segVoxelHit.point);
        }
      }
      const groundY = this.getGroundHeightAt(proj.mesh.position.x, proj.mesh.position.z);
      const hitGround = proj.mesh.position.y <= groundY + 0.15;

      // Direct anti-armor, anti-aircraft & anti-personnel projectile collision
      let hitVehicle = false;
      let hitSoldier = false;
      const isExplosiveDirect =
        proj.type === 'rpg' ||
        proj.type === 'tank_shell' ||
        proj.type === 'autocannon' ||
        proj.type === 'airstrike_bomb' ||
        proj.type === 'air_rocket' ||
        proj.type === 'a2a_missile' ||
        proj.type === 'jdam_bomb' ||
        proj.type === 'gbu28_bomb' ||
        proj.type === 'mortar_shell' ||
        proj.type === 'ac130_40mm' ||
        proj.type === 'ac130_105mm';

      if (isExplosiveDirect) {
        const ownerTeam = proj.owner ? proj.owner.team : null;
        if (vehicles.length > 0) {
          for (const v of vehicles) {
            if (v.dead || (ownerTeam && v.team === ownerTeam)) continue;
            if (proj.owner && proj.owner.activeVehicle === v) continue;
            const vCenter = v.pos.clone().add(new THREE.Vector3(0, 1.35, 0));
            const hullRad = v.isAircraft
              ? proj.type === 'a2a_missile'
                ? 11.5
                : proj.isAaProximity
                ? 10.5
                : 6.5
              : v.type === 'tank'
              ? 3.5
              : v.type === 'apc' || v.type === 'aa'
              ? 3.1
              : 2.5;
            if (proj.mesh.position.distanceTo(vCenter) <= hullRad) {
              hitVehicle = true;
              proj.mesh.position.copy(vCenter);
              break;
            }
          }
        }
        if (
          !hitVehicle &&
          Array.isArray(units) &&
          units.length > 0 &&
          proj.type !== 'airstrike_bomb' &&
          proj.type !== 'a2a_missile'
        ) {
          const hitRadius =
            proj.type === 'tank_shell' || proj.type === 'air_rocket'
              ? 1.55
              : proj.type === 'autocannon'
              ? 1.25
              : 1.15;
          for (let uIdx = 0; uIdx < units.length; uIdx++) {
            const u = units[uIdx];
            if (
              !u ||
              u.dead ||
              u.downed ||
              u === proj.owner ||
              (ownerTeam && u.team === ownerTeam && !(proj.owner && proj.owner.friendlyFireEnabled))
            ) {
              continue;
            }
            const ux = u.pos.x - prevPos.x;
            const uy = u.pos.y + 0.95 - prevPos.y;
            const uz = u.pos.z - prevPos.z;
            const projDist = Math.max(0, Math.min(segLen, ux * segDir.x + uy * segDir.y + uz * segDir.z));
            const cx = prevPos.x + segDir.x * projDist;
            const cy = prevPos.y + segDir.y * projDist;
            const cz = prevPos.z + segDir.z * projDist;
            const dSq =
              (u.pos.x - cx) * (u.pos.x - cx) +
              (u.pos.y + 0.95 - cy) * (u.pos.y + 0.95 - cy) +
              (u.pos.z - cz) * (u.pos.z - cz);
            if (dSq <= hitRadius * hitRadius) {
              hitSoldier = true;
              proj.mesh.position.set(cx, cy, cz);
              break;
            }
          }
        }
      }

      if (hitVoxel || hitGround || hitVehicle || hitSoldier) {
        if (isExplosiveDirect) {
          const hitPos = proj.mesh.position.clone();
          const rad =
            proj.blastRadius ||
            (proj.type === 'gbu28_bomb'
              ? 16.5
              : proj.type === 'ac130_105mm'
              ? 14.5
              : proj.type === 'airstrike_bomb' || proj.type === 'jdam_bomb' || proj.type === 'mortar_shell'
              ? 12.0
              : proj.type === 'a2a_missile'
              ? 10.5
              : proj.type === 'ac130_40mm'
              ? 7.5
              : proj.type === 'tank_shell'
              ? 6.2
              : proj.type === 'air_rocket'
              ? 5.6
              : proj.type === 'rpg'
              ? 5.0
              : 2.8);
          const dmg =
            proj.blastDamage ||
            (proj.type === 'ac130_105mm'
              ? 620
              : proj.type === 'gbu28_bomb'
              ? 560
              : proj.type === 'a2a_missile'
              ? 540
              : proj.type === 'airstrike_bomb' || proj.type === 'jdam_bomb'
              ? 420
              : proj.type === 'mortar_shell'
              ? 340
              : proj.type === 'tank_shell'
              ? 320
              : proj.type === 'ac130_40mm' || proj.type === 'air_rocket'
              ? 240
              : proj.type === 'rpg'
              ? 235
              : 95);
          const aud = getListenerAudio(hitPos);
          const soundScale =
            proj.type === 'autocannon'
              ? 0.42
              : proj.type === 'ac130_105mm' || proj.type === 'gbu28_bomb' || proj.type === 'airstrike_bomb' || proj.type === 'jdam_bomb'
              ? 1.35
              : proj.type === 'mortar_shell' || proj.type === 'tank_shell' || proj.type === 'a2a_missile'
              ? 1.15
              : 0.95;
          const wepLabel = proj.weaponName || proj.weaponLabel || null;
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
    // Ammo & Kit Stash Resupply Tick (Squad / BattleBit inspired)
    const playerUnit = units && units[0] ? units[0] : null;
    for (let i = this.ammoCrates.length - 1; i >= 0; i--) {
      const crate = this.ammoCrates[i];
      if (!crate.permanent && typeof crate.timer === 'number') {
        crate.timer -= dt;
        if (crate.timer <= 0) {
          this.scene.remove(crate.mesh);
          this.ammoCrates.splice(i, 1);
          continue;
        }
      }
      // Resupply nearby friendly units every 2 seconds
      crate._resupplyTick = (crate._resupplyTick || 0) + dt;
      if (crate._resupplyTick >= 2.0) {
        crate._resupplyTick = 0;
        const radius = crate.resupplyRadius || 5.5;
        let resuppliedTeammate = false;
        for (const u of units) {
          if (!u || u.dead || u.downed) continue;
          if (crate.team && u.team !== crate.team) continue;
          const dist = u.pos.distanceTo(crate.pos);
          if (dist <= radius) {
            let gaveAmmo = false;
            // Resupply ammo & backpack loose rounds for all weapon slots
            if (u.slots) {
              for (const slot of u.slots) {
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
            // Resupply grenades, Squad Field Dressings (9 for Medics, 2+bonus for others), and Medic Bag trauma supply!
            if (typeof u.grenades === 'number' && u.grenades < 2) {
              u.grenades = Math.min(2, u.grenades + 1);
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
            // Resupply AI Bot Field Dressings (9 for Medics, 2 for others) & Medic Bag supply
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
          }
        }
        // Award XP + Match Cash to the player when their field-deployed Ammo & Kit Stash resupplies allies
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
   * Spawns a 3D Tarkov-style Enemy Backpack & Rig Loot Pack at the fallen enemy's position,
   * populated with role-specific firearms, spare magazines, loose bullet boxes, field dressings,
   * grenades/rockets, armor/backpack upgrades, and dogtags!
   */
  spawnEnemyLootPack(bot) {
    if (!bot) return null;
    const playerTeam = window.game?.player?.team || 'US';
    // Never spawn a loot pack for friendly teammates!
    if (bot.team === playerTeam) return null;
    if (!this.lootPacks) this.lootPacks = [];

    // Reuse existing pack if already attached to this downed bot
    if (bot.lootPack && this.lootPacks.includes(bot.lootPack) && bot.lootPack.items.length > 0) {
      return bot.lootPack;
    }

    // Cap active battlefield loot packs to 28 to keep rendering fast
    while (this.lootPacks.length >= 28) {
      const oldest = this.lootPacks.shift();
      if (oldest && oldest.mesh) {
        this.scene.remove(oldest.mesh);
      }
    }

    const role = (bot.role || 'ASSAULT').toUpperCase();
    const isMedic = role === 'MEDIC';
    const isEng = role === 'ENGINEER';
    const isSupport = role === 'SUPPORT';
    const isRecon = role === 'RECON';

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

    // Build 3D Dropped Tactical Backpack & Rig Mesh on ground
    const group = new THREE.Group();
    const gy = this.getGroundHeightAt(bot.pos.x, bot.pos.z);
    group.position.set(bot.pos.x, gy, bot.pos.z);

    const packMat = new THREE.MeshStandardMaterial({
      color: bot.team === 'RU' ? 0x3b4d3b : 0x5c5346,
      roughness: 0.78
    });
    const pouchMat = new THREE.MeshStandardMaterial({
      color: 0x2c3e50,
      roughness: 0.7
    });
    const packMesh = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.36, 0.48), packMat);
    packMesh.position.y = 0.18;
    group.add(packMesh);

    const pouchMesh = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.22, 0.56), pouchMat);
    pouchMesh.position.set(0, 0.26, 0);
    group.add(pouchMesh);

    const ringGeo = new THREE.RingGeometry(0.55, 0.72, 16);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xf1c40f,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.55
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
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
    for (let i = this.lootPacks.length - 1; i >= 0; i--) {
      const pack = this.lootPacks[i];
      pack.timer -= dt;
      if (pack.botRef && pack.botRef.downed && !pack.botRef.dead) {
        pack.pos.x = pack.botRef.pos.x;
        pack.pos.z = pack.botRef.pos.z;
        pack.pos.y = this.getGroundHeightAt(pack.pos.x, pack.pos.z);
      }
      if (pack.timer <= 0 || !pack.items || pack.items.length === 0) {
        if (pack.mesh) this.scene.remove(pack.mesh);
        if (pack.botRef && pack.botRef.lootPack === pack) {
          pack.botRef.lootPack = null;
        }
        this.lootPacks.splice(i, 1);
      } else if (pack.ringMesh && pack.ringMesh.material) {
        pack.ringMesh.material.opacity = 0.35 + Math.sin(performance.now() * 0.005) * 0.2;
      }
    }
  }
};
