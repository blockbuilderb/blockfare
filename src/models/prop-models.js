// ============================================================================
// 3D WORLD PROP & DEPLOYABLE MODELS (src/models/prop-models.js)
// Reusable 3D mesh builders for Radar Towers, Pine Trees, Street Lamps,
// and Squad Deployable Ammo & Kit Stashes.
// ============================================================================

import * as THREE from '../../vendor/three.module.js';

export function createRadarTowerMesh() {
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

  return group;
}

export function createAmmoStashMesh(permanent = true) {
  const group = new THREE.Group();

  // 1. Main Olive-Drab Squad Ammo & Ordnance Chest
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(1.35, 0.82, 0.85),
    new THREE.MeshStandardMaterial({
      color: permanent ? 0x4b5320 : 0x2f6b3c,
      roughness: 0.78,
      flatShading: true
    })
  );
  box.position.set(-0.18, 0.41, 0);
  box.castShadow = true;

  // 2. High-Visibility Tactical Stencil Band
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(1.39, 0.16, 0.89),
    new THREE.MeshBasicMaterial({ color: 0xf1c40f })
  );
  stripe.position.set(-0.18, 0.58, 0);

  // 3. Squad Role / Kit-Changing Weapon Rack & Field Locker beside the Ammo Chest
  const kitLocker = new THREE.Group();
  const rackFrame = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 1.05, 0.58),
    new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.6, metalness: 0.35 })
  );
  rackFrame.position.set(0.68, 0.52, 0);
  rackFrame.castShadow = true;
  const rifleStock1 = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.85, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x1e272e, metalness: 0.5 })
  );
  rifleStock1.position.set(0.68, 0.78, -0.14);
  const rifleStock2 = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.85, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x1e272e, metalness: 0.5 })
  );
  rifleStock2.position.set(0.68, 0.78, 0.14);
  const kitBadge = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.22, 0.62),
    new THREE.MeshBasicMaterial({ color: 0x00d2d3 })
  );
  kitBadge.position.set(0.68, 0.86, 0);
  kitLocker.add(rackFrame, rifleStock1, rifleStock2, kitBadge);

  // 4. Pulsing Ground Resupply & Kit-Swap Ring (index 3 in group.children)
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.15, 1.48, 24),
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
  return group;
}
