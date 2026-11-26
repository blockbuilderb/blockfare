import { BOT } from '../config.js?v=134';
import { tmpVec3 } from '../utils/VectorPool.js?v=134';

/**
 * Multi-Ray "Vision Tube" Sightline Check:
 * Prevents NPCs from seeing or tracking targets through solid buildings, diagonal block seams,
 * active smoke screens, or tiny thin gaps (< 0.55m wide) between structures.
 */
export function hasClearSightline(bot, targetPos, checkFov = true) {
  const eyeY = bot.pos.y + (bot.isCrouching ? 1.12 : 1.52);
  const eyePos = tmpVec3(bot.pos.x, eyeY, bot.pos.z);
  const chestPos = tmpVec3(targetPos.x, targetPos.y + 1.15, targetPos.z);

  const dx = chestPos.x - eyePos.x;
  const dy = chestPos.y - eyePos.y;
  const dz = chestPos.z - eyePos.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 1.4) return true;

  // 1. Field-of-View (150° cone) check beyond 14m unless alerted by damage/suppression
  if (
    checkFov &&
    dist > BOT.FOV_CHECK_BEYOND &&
    (bot.flinchTimer || 0) <= 0 &&
    (bot.suppressionLevel || 0) < 0.25
  ) {
    const horizDist = Math.hypot(dx, dz);
    if (horizDist > 0.1) {
      const fwdX = Math.sin(bot.yaw);
      const fwdZ = Math.cos(bot.yaw);
      const dot = (dx * fwdX + dz * fwdZ) / horizDist;
      if (dot < BOT.FOV_BEHIND_DOT) return false;
    }
  }

  // 2. Tactical Smoke Screen occlusion check
  if (this.smokeClouds && this.smokeClouds.length > 0) {
    for (let i = 0; i < this.smokeClouds.length; i++) {
      const sc = this.smokeClouds[i];
      if (!sc.group) continue;
      const sp = sc.group.position;
      const sx = sp.x - eyePos.x;
      const sy = sp.y + 0.8 - eyePos.y;
      const sz = sp.z - eyePos.z;
      const proj = (sx * dx + sy * dy + sz * dz) / (dist * dist);
      if (proj > 0.05 && proj < 0.95) {
        const cx = eyePos.x + dx * proj - sp.x;
        const cy = eyePos.y + dy * proj - (sp.y + 0.8);
        const cz = eyePos.z + dz * proj - sp.z;
        if (cx * cx + cy * cy + cz * cz < 3.8 * 3.8) {
          return false;
        }
      }
    }
  }

  // 2B. Persistent 3D Burning Vehicle Wreck physical cover occlusion check (20s post-destruction hull cover!)
  const vmRef =
    this.vehicleManager ||
    this.world?.vehicleManager ||
    (typeof window !== 'undefined' ? window.game?.vehicleManager : null);
  if (vmRef && typeof vmRef.raycastWreckCover === 'function') {
    const dirNormX = dx / dist;
    const dirNormY = dy / dist;
    const dirNormZ = dz / dist;
    if (vmRef.raycastWreckCover(eyePos, tmpVec3(dirNormX, dirNormY, dirNormZ), Math.max(0.5, dist - 0.55))) {
      return false;
    }
  }

  const dir = tmpVec3(dx / dist, dy / dist, dz / dist);
  const rayLen = Math.max(0.5, dist - 0.55);

  // 3. Center thick ray (0.22m radius padding blocks hairline cracks & diagonal wall seams)
  const centerHit = this.world.raycastVoxel(eyePos, dir, rayLen, 0.22);
  if (centerHit) return false;

  // 4. Lateral "Vision Tube" shoulder offset rays (±0.35m) when firing at close/mid range
  if (!checkFov && dist > 5.0 && dist < 38.0) {
    const horizLen = Math.hypot(dx, dz);
    if (horizLen > 0.1) {
      const perpX = (-dz / horizLen) * 0.35;
      const perpZ = (dx / horizLen) * 0.35;
      const leftOrigin = tmpVec3(eyePos.x + perpX, eyePos.y, eyePos.z + perpZ);
      const rightOrigin = tmpVec3(eyePos.x - perpX, eyePos.y, eyePos.z - perpZ);
      const leftBlocked = Boolean(this.world.raycastVoxel(leftOrigin, dir, rayLen, 0));
      const rightBlocked = Boolean(this.world.raycastVoxel(rightOrigin, dir, rayLen, 0));
      if (leftBlocked && rightBlocked) {
        return false;
      }
    }
  }

  return true;
}

export function canBotSeeTarget(bot, targetKey, targetPos, checkFov = true) {
  if (!bot._losCache) bot._losCache = new Map();
  const now = performance.now();
  const cached = bot._losCache.get(targetKey);
  if (cached && now < cached.exp) {
    return !cached.blocked;
  }
  // Cap uncached raycasts per bot (2) and globally per frame (38) to prevent frame-time spikes across 499 AI bots
  if ((bot._raycastsThisFrame || 0) >= 2 || (this._frameRaycasts || 0) >= 38) {
    return cached ? !cached.blocked : false;
  }
  bot._raycastsThisFrame = (bot._raycastsThisFrame || 0) + 1;
  this._frameRaycasts = (this._frameRaycasts || 0) + 1;
  const vis = this.hasClearSightline(bot, targetPos, checkFov);
  const ttl = 320 + Math.random() * 200;
  if (cached) {
    cached.blocked = !vis;
    cached.vis = vis;
    cached.time = now;
    cached.exp = now + ttl;
  } else {
    bot._losCache.set(targetKey, { blocked: !vis, vis, time: now, exp: now + ttl });
  }
  return vis;
}

function isColumnBlocked(world, ox, wy, oz) {
  const gWaist = world.worldToGrid(ox, wy + 0.75, oz);
  if (
    world.hasVoxel
      ? world.hasVoxel(gWaist.gx, gWaist.gy, gWaist.gz)
      : world.voxels.has(world.key(gWaist.gx, gWaist.gy, gWaist.gz))
  ) {
    return true;
  }
  const gHead = world.worldToGrid(ox, wy + 1.75, oz);
  return world.hasVoxel
    ? world.hasVoxel(gHead.gx, gHead.gy, gHead.gz)
    : world.voxels.has(world.key(gHead.gx, gHead.gy, gHead.gz));
}

/**
 * Checks if a world position is blocked by waist/head-level voxels (including a soldier
 * shoulder-clearance radius) OR lies inside a building/container footprint so bots steer
 * cleanly around structures, castle curtain walls, towers, and corners.
 * Unrolled with zero per-call array or string allocations.
 */
export function isPointBlocked(wx, wy, wz, padRadius = 0.52) {
  const world = this.world;
  if (
    world.isInsideBuildingOrContainer &&
    world.isInsideBuildingOrContainer(wx, wz, padRadius + 0.55 > 1.05 ? padRadius + 0.55 : 1.05)
  ) {
    return true;
  }
  if (isColumnBlocked(world, wx, wy, wz)) return true;
  if (padRadius > 0.05) {
    if (isColumnBlocked(world, wx + padRadius, wy, wz)) return true;
    if (isColumnBlocked(world, wx - padRadius, wy, wz)) return true;
    if (isColumnBlocked(world, wx, wy, wz + padRadius)) return true;
    if (isColumnBlocked(world, wx, wy, wz - padRadius)) return true;
  }
  return false;
}

export const SightlineMethods = {
  hasClearSightline,
  canBotSeeTarget,
  isPointBlocked
};
