import * as THREE from '../../vendor/three.module.js';
import { events } from '../events.js?v=90';

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
    const playerUnit = units && units.length > 0 ? units[0] : null;

    for (const flag of this.flags) {
      let usSoldiers = 0;
      let ruSoldiers = 0;
      let usWeight = 0;
      let ruWeight = 0;
      let usDownedExcluded = 0;
      let ruDownedExcluded = 0;

      // Real-life & Tactical Shooter Entrenched Defender Advantage (3:1 attacker-to-defender rule):
      // Standing defenders inside their own Friendly Forward Base (plus built Point Defenses) contribute
      // 1.35x to 1.65x hold weight so attackers must bring numerical superiority or clear the garrison!
      const defStageBonus = Math.min(4, flag.defenseStage || 0) * 0.075;
      const defenderWeightMult = 1.35 + defStageBonus;

      for (const u of units) {
        if (!u || u.dead) continue;
        const dx = u.pos.x - flag.pos.x;
        const dz = u.pos.z - flag.pos.z;
        const distSq = dx * dx + dz * dz;
        if (distSq > flag.radius * flag.radius) continue;

        // CRITICAL: Downed / incapacitated / bleeding-out bodies MUST be 100% excluded
        // from forward base taking points & capture progress calculations!
        const isDownedBody =
          Boolean(u.downed) ||
          (typeof u.hp === 'number' && u.hp <= 0) ||
          (typeof u.bleedOutTimer === 'number' && u.bleedOutTimer > 0) ||
          (typeof u.downedTimer === 'number' && u.downedTimer > 0) ||
          (typeof u.postReviveTimer === 'number' && u.postReviveTimer > 1.05);

        if (isDownedBody) {
          if (u.team === 'US') usDownedExcluded++;
          else if (u.team === 'RU') ruDownedExcluded++;
          continue;
        }

        // Active standing/fighting units only:
        // Give the human player 5x capture weight (6x when right on the flagpole <=16m)
        const isInnerCore = distSq <= 16 * 16;
        const baseWeight = u === playerUnit ? (isInnerCore ? 6 : 5) : 1;
        const isDefenderOfBase = flag.owner !== 'NEUTRAL' && u.team === flag.owner;
        const weight = isDefenderOfBase ? baseWeight * defenderWeightMult : baseWeight;
        if (u.team === 'US') {
          usSoldiers++;
          usWeight += weight;
        } else if (u.team === 'RU') {
          ruSoldiers++;
          ruWeight += weight;
        }
      }

      flag.usPresent = usSoldiers;
      flag.ruPresent = ruSoldiers;
      flag.usWeight = Number(usWeight.toFixed(2));
      flag.ruWeight = Number(ruWeight.toFixed(2));
      flag.defenderWeightMult = Number(defenderWeightMult.toFixed(2));
      flag.usDownedPresent = usDownedExcluded;
      flag.ruDownedPresent = ruDownedExcluded;
      flag.zoneClashing = usSoldiers > 0 && ruSoldiers > 0;

      const prevOwner = flag.owner;
      const prevContested = Boolean(flag.contested);

      // A forward base is contested / spawn-locked whenever attackers are present in the zone
      // OR the flag's capture progress has been pulled below 85%
      const attackersInZone =
        flag.owner === 'US' ? ruSoldiers : flag.owner === 'RU' ? usSoldiers : 0;
      flag.contested =
        flag.owner !== 'NEUTRAL' &&
        (attackersInZone > 0 || Math.abs(flag.captureProgress) < 85);

      if (!prevContested && flag.contested) {
        events.emit('flag:contested', { flag, usCount: usSoldiers, ruCount: ruSoldiers });
      }

      const netWeight = usWeight - ruWeight;
      if (netWeight !== 0) {
        const speed = Math.min(Math.abs(netWeight), 5) * 16 * dt * Math.sign(netWeight);
        const prevProg = flag.captureProgress;
        flag.captureProgress = Math.max(-100, Math.min(100, flag.captureProgress + speed));

        // If the flag crosses 0 (pulled all the way down from US + or RU -), it immediately becomes NEUTRAL!
        if ((prevProg > 0 && flag.captureProgress <= 0) || (prevProg < 0 && flag.captureProgress >= 0)) {
          flag.owner = 'NEUTRAL';
        }
      }

      if (flag.captureProgress >= 99) {
        flag.captureProgress = 100;
        flag.owner = 'US';
      } else if (flag.captureProgress <= -99) {
        flag.captureProgress = -100;
        flag.owner = 'RU';
      } else if (Math.abs(flag.captureProgress) <= 10) {
        flag.owner = 'NEUTRAL';
      }

      if (prevOwner !== flag.owner && (flag.owner === 'US' || flag.owner === 'RU')) {
        const prevTeamOwner = flag.lastTeamOwner || 'NEUTRAL';
        if (prevTeamOwner !== flag.owner) {
          flag.lastTeamOwner = flag.owner;
          flag.defenseStage = 0;
          events.emit('flag:captured', {
            flag,
            newOwner: flag.owner,
            prevOwner: prevTeamOwner
          });
          if (onFlagCaptured && !onFlagCaptured._isEventsBridge) {
            onFlagCaptured(flag, flag.owner, prevTeamOwner);
          }
        }
      }

      const absProg = Math.abs(flag.captureProgress) / 100;
      flag.bannerMesh.position.y = 2.4 + absProg * 6.6;
      const colorHex =
        flag.captureProgress > 10
          ? 0x3498db
          : flag.captureProgress < -10
          ? 0xe74c3c
          : 0x95a5a6;
      flag.bannerMesh.material.color.setHex(colorHex);
      flag.zoneMesh.material.color.setHex(colorHex);
    }
  }
};
