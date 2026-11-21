// ============================================================================
// 3D WORLD PROP & DEPLOYABLE MODELS (src/models/prop-models.js)
// Reusable 3D mesh builders for Radar Towers, Pine Trees, Street Lamps,
// and Squad Deployable Ammo & Kit Stashes.
// ============================================================================

import * as THREE from '../../vendor/three.module.js';

let propShared = null;

function markShared(item) {
  item.userData.shared = true;
  return item;
}

function getPropShared() {
  if (!propShared) {
    propShared = {
      // Radar Tower geometries & materials
      mastGeo: markShared(new THREE.BoxGeometry(1.4, 24, 1.4)),
      dishGeo: markShared(new THREE.CylinderGeometry(3.2, 0.8, 1.2, 8)),
      steelMat: markShared(
        new THREE.MeshStandardMaterial({ color: 0xbdc3c7, metalness: 0.6, roughness: 0.4 })
      ),
      redMat: markShared(new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.5 })),

      // Ammo & Kit Stash geometries & static materials
      boxGeo: markShared(new THREE.BoxGeometry(1.35, 0.82, 0.85)),
      stripeGeo: markShared(new THREE.BoxGeometry(1.39, 0.16, 0.89)),
      rackFrameGeo: markShared(new THREE.BoxGeometry(0.46, 1.05, 0.58)),
      rifleStockGeo: markShared(new THREE.BoxGeometry(0.1, 0.85, 0.12)),
      kitBadgeGeo: markShared(new THREE.BoxGeometry(0.5, 0.22, 0.62)),
      ringGeo: markShared(new THREE.RingGeometry(1.15, 1.48, 24)),

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
        new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.6, metalness: 0.35 })
      ),
      rifleStockMat: markShared(
        new THREE.MeshStandardMaterial({ color: 0x1e272e, metalness: 0.5 })
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

  const mast = new THREE.Mesh(s.mastGeo, s.steelMat);
  mast.position.y = 12;
  mast.castShadow = true;
  group.add(mast);

  const dish = new THREE.Mesh(s.dishGeo, s.redMat);
  dish.rotation.z = Math.PI / 3;
  dish.position.set(1.2, 21, 0);
  group.add(dish);

  freezeStaticMeshes(group);
  return group;
}

export function createAmmoStashMesh(permanent = true) {
  const s = getPropShared();
  const group = new THREE.Group();

  // 1. Main Olive-Drab Squad Ammo & Ordnance Chest
  const box = new THREE.Mesh(s.boxGeo, permanent ? s.permBoxMat : s.tempBoxMat);
  box.position.set(-0.18, 0.41, 0);
  box.castShadow = true;

  // 2. High-Visibility Tactical Stencil Band
  const stripe = new THREE.Mesh(s.stripeGeo, s.stripeMat);
  stripe.position.set(-0.18, 0.58, 0);

  // 3. Squad Role / Kit-Changing Weapon Rack & Field Locker beside the Ammo Chest
  const kitLocker = new THREE.Group();
  const rackFrame = new THREE.Mesh(s.rackFrameGeo, s.rackFrameMat);
  rackFrame.position.set(0.68, 0.52, 0);
  rackFrame.castShadow = true;
  const rifleStock1 = new THREE.Mesh(s.rifleStockGeo, s.rifleStockMat);
  rifleStock1.position.set(0.68, 0.78, -0.14);
  const rifleStock2 = new THREE.Mesh(s.rifleStockGeo, s.rifleStockMat);
  rifleStock2.position.set(0.68, 0.78, 0.14);
  const kitBadge = new THREE.Mesh(s.kitBadgeGeo, s.kitBadgeMat);
  kitBadge.position.set(0.68, 0.86, 0);
  kitLocker.add(rackFrame, rifleStock1, rifleStock2, kitBadge);

  // 4. Pulsing Ground Resupply & Kit-Swap Ring (index 3 in group.children — opacity mutated per-crate at runtime)
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
