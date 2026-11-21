import * as THREE from '../../vendor/three.module.js';

const POOL_SIZE = 64;
const pool = Array.from({ length: POOL_SIZE }, () => new THREE.Vector3());
let poolIdx = 0;

/**
 * Returns a pooled temporary THREE.Vector3 initialized to (x, y, z).
 * Use only for short-lived per-frame calculations that do not escape the current function/frame.
 */
export function tmpVec3(x = 0, y = 0, z = 0) {
  const v = pool[poolIdx];
  poolIdx = (poolIdx + 1) & (POOL_SIZE - 1);
  return v.set(x, y, z);
}

/**
 * Returns a pooled temporary THREE.Vector3 copied from `other`.
 * Use only for short-lived per-frame calculations that do not escape the current function/frame.
 */
export function tmpVec3Copy(other) {
  const v = pool[poolIdx];
  poolIdx = (poolIdx + 1) & (POOL_SIZE - 1);
  return v.copy(other);
}
