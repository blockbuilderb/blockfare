import * as THREE from '../../vendor/three.module.js';

export const ConquestSystem = {
  buildConquestFlags() {
    const poleGeo = new THREE.CylinderGeometry(0.14, 0.14, 10.5, 8);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xdcdde1, metalness: 0.5 });
    const bannerGeo = new THREE.BoxGeometry(2.6, 1.5, 0.14);

    for (const flag of this.flags) {
      const group = new THREE.Group();
      group.position.copy(flag.pos);

      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.y = 5.25;
      pole.castShadow = true;
      group.add(pole);

      const bannerMat = new THREE.MeshStandardMaterial({
        color: this.getTeamHex(flag.owner),
        roughness: 0.5
      });
      const banner = new THREE.Mesh(bannerGeo, bannerMat);
      banner.position.set(1.35, 9.0, 0);
      group.add(banner);

      const ringGeo = new THREE.RingGeometry(flag.radius - 0.4, flag.radius, 36);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: this.getTeamHex(flag.owner),
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.55
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 0.25;
      group.add(ring);

      this.scene.add(group);
      flag.bannerMesh = banner;
      flag.zoneMesh = ring;
      flag.defenseStage = flag.defenseStage || 0;
    }
  },

  getTeamHex(team) {
    if (team === 'US') return 0x3498db;
    if (team === 'RU') return 0xe74c3c;
    return 0x95a5a6;
  },

  updateFlags(dt, units, onFlagCaptured = null) {
    for (const flag of this.flags) {
      let usCount = 0;
      let ruCount = 0;

      for (const u of units) {
        if (u.dead) continue;
        const dx = u.pos.x - flag.pos.x;
        const dz = u.pos.z - flag.pos.z;
        if (dx * dx + dz * dz <= flag.radius * flag.radius) {
          if (u.team === 'US') usCount++;
          else if (u.team === 'RU') ruCount++;
        }
      }

      const prevOwner = flag.owner;
      flag.contested = usCount > 0 && ruCount > 0;
      const net = usCount - ruCount;
      if (net !== 0) {
        const speed = Math.min(Math.abs(net), 4) * 14 * dt * Math.sign(net);
        flag.captureProgress = Math.max(-100, Math.min(100, flag.captureProgress + speed));
      }

      if (flag.captureProgress >= 99) {
        flag.owner = 'US';
      } else if (flag.captureProgress <= -99) {
        flag.owner = 'RU';
      } else if (Math.abs(flag.captureProgress) < 15) {
        flag.owner = 'NEUTRAL';
      }

      if (prevOwner !== flag.owner && (flag.owner === 'US' || flag.owner === 'RU')) {
        const prevTeamOwner = flag.lastTeamOwner || 'NEUTRAL';
        if (prevTeamOwner !== flag.owner) {
          flag.lastTeamOwner = flag.owner;
          flag.defenseStage = 0;
          if (onFlagCaptured) onFlagCaptured(flag, flag.owner, prevTeamOwner);
        }
      }

      const absProg = Math.abs(flag.captureProgress) / 100;
      flag.bannerMesh.position.y = 2.6 + absProg * 6.4;
      const colorHex =
        flag.captureProgress > 15
          ? 0x3498db
          : flag.captureProgress < -15
          ? 0xe74c3c
          : 0x95a5a6;
      flag.bannerMesh.material.color.setHex(colorHex);
      flag.zoneMesh.material.color.setHex(colorHex);
    }
  }
};
