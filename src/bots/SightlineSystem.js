import { BOT } from '../config.js?v=90';
import { tmpVec3 } from '../utils/VectorPool.js?v=90';

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
  if (checkFov && dist > BOT.FOV_CHECK_BEYOND && (bot.flinchTimer || 0) <= 0 && (bot.suppressionLevel || 0) < 0.25) {
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
    return cached.vis;
  }
  // Cap uncached raycasts per bot (2) and globally per frame (28) to prevent frame-time spikes across 250 bots
  if ((bot._raycastsThisFrame || 0) >= 2 || (this._frameRaycasts || 0) >= 28) {
    return cached ? cached.vis : false;
  }
  bot._raycastsThisFrame = (bot._raycastsThisFrame || 0) + 1;
  this._frameRaycasts = (this._frameRaycasts || 0) + 1;
  const vis = this.hasClearSightline(bot, targetPos, checkFov);
  bot._losCache.set(targetKey, { vis, exp: now + 260 + Math.random() * 160 });
  return vis;
}

/**
 * Checks if a world position is blocked by waist/head-level voxels (including a soldier
 * shoulder-clearance radius) OR lies inside a building/container footprint so bots steer
 * cleanly around structures, castle curtain walls, towers, and corners.
 */
export function isPointBlocked(wx, wy, wz, padRadius = 0.52) {
  if (
    this.world.isInsideBuildingOrContainer &&
    this.world.isInsideBuildingOrContainer(wx, wz, Math.max(1.05, padRadius + 0.55))
  ) {
    return true;
  }
  const checkOffsets =
    padRadius > 0.05
      ? [
          [0, 0],
          [padRadius, 0],
          [-padRadius, 0],
          [0, padRadius],
          [0, -padRadius]
        ]
      : [[0, 0]];
  for (let i = 0; i < checkOffsets.length; i++) {
    const ox = wx + checkOffsets[i][0];
    const oz = wz + checkOffsets[i][1];
    const gWaist = this.world.worldToGrid(ox, wy + 0.75, oz);
    if (this.world.voxels.has(this.world.key(gWaist.gx, gWaist.gy, gWaist.gz))) return true;
    const gHead = this.world.worldToGrid(ox, wy + 1.75, oz);
    if (this.world.voxels.has(this.world.key(gHead.gx, gHead.gy, gHead.gz))) return true;
  }
  return false;
}

export const SightlineMethods = {
  hasClearSightline,
  canBotSeeTarget,
  isPointBlocked
};
