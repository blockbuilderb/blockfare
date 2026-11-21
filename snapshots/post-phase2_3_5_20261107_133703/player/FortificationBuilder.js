import * as THREE from '../../vendor/three.module.js';
import { VOXEL_SIZE } from '../world.js?v=35';
import { sound } from '../audio.js?v=35';
import { DISTANCES } from '../config.js?v=35';

export const FortificationMethods = {
  getBlueprintName() {
    return this.buildBlueprints[this.buildBlueprintIndex] || 'CHEST WALL';
  },

  /**
   * Returns the nearest Objective Flag (A–E) if the player is within `flag.radius + extraPad` meters.
   */
  findNearbyFlag(extraPad = DISTANCES.FLAG_EXTRA_PAD) {
    if (!this.world || !this.world.flags) return null;
    let best = null;
    let bestDist = Infinity;
    for (const f of this.world.flags) {
      const d = Math.hypot(this.pos.x - f.pos.x, this.pos.z - f.pos.z);
      if (d <= f.radius + extraPad && d < bestDist) {
        bestDist = d;
        best = f;
      }
    }
    return best;
  },

  tryBuildPointDefenses() {
    const nearFlag = this.findNearbyFlag(DISTANCES.FLAG_EXTRA_PAD);
    const bpName = this.getBlueprintName();
    const builtFront = this.useHammer(false, true);

    if (nearFlag && nearFlag.owner === this.team) {
      if ((nearFlag.defenseStage || 0) < 4 && typeof this.world.buildPointDefenseStage === 'function') {
        const res = this.world.buildPointDefenseStage(nearFlag, this.onBroadcast);
        this.score += 50;
        sound.playReload();
        if (this.onAwardXp) {
          this.onAwardXp(
            50,
            `BUILT ${bpName} & FORTIFIED OBJ ${nearFlag.id} DEFENSES (${res.stage}/${res.maxStage})`
          );
        }
        return true;
      }
      if (builtFront > 0) {
        sound.playReload();
        if (this.onAwardXp) {
          this.onAwardXp(25, `BUILT ${bpName} AT OBJ ${nearFlag.id}`);
        }
      }
      return builtFront > 0;
    }

    if (builtFront > 0) {
      sound.playReload();
      if (this.onAwardXp) {
        this.onAwardXp(20, `BUILT ${bpName}`);
      }
    }
    return builtFront > 0;
  },

  useHammer(isBreak = false, fromInteractKey = false) {
    this.recoilKickZ = 0.13;
    sound.playBuildHammer();

    this.syncCameraTransform();
    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(
      this.camera.getWorldQuaternion(new THREE.Quaternion())
    );

    const hit = this.world.raycastVoxel(origin, dir, DISTANCES.HAMMER_RANGE);

    if (isBreak) {
      if (hit && hit.voxel) {
        this.world.damageVoxel(hit.voxel.gx, hit.voxel.gy, hit.voxel.gz, 100, this.onBroadcast);
      }
      return 0;
    }

    let placePos;
    if (fromInteractKey) {
      // Pressing [F] always anchors the Chest Wall / Defense Structure on the ground 2.8m ahead of where you face!
      const flatFwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
      placePos = this.pos.clone().addScaledVector(flatFwd, 2.85);
      placePos.y = this.world.getGroundHeightAt(placePos.x, placePos.z) + 0.15;
    } else {
      placePos = origin.clone().addScaledVector(dir, 3.0);
      if (hit) {
        placePos = hit.point.clone().addScaledVector(hit.normal, VOXEL_SIZE * 0.55);
      }
    }

    const g = this.world.worldToGrid(placePos.x, Math.max(0.1, placePos.y), placePos.z);
    const pGrid = this.world.worldToGrid(this.pos.x, this.pos.y + 0.5, this.pos.z);
    if (g.gx === pGrid.gx && g.gz === pGrid.gz && Math.abs(g.gy - pGrid.gy) <= 1) {
      return 0;
    }

    // Build according to selected BattleBit Squad Fortification Blueprint ([B])
    const bp = this.buildBlueprints[this.buildBlueprintIndex] || 'CHEST WALL';
    const baseGy = fromInteractKey ? this.world.getBaseGy(g.gx, g.gz) : Math.max(0, g.gy);
    const alongX = Math.abs(Math.cos(this.yaw)) >= Math.abs(Math.sin(this.yaw));
    const dx = alongX ? 1 : 0;
    const dz = alongX ? 0 : 1;
    // Forward normal direction for U-shaped bunker wings
    const fwdGx = Math.round(-Math.sin(this.yaw));
    const fwdGz = Math.round(-Math.cos(this.yaw));

    let builtCount = 0;
    const placeBlock = (bx, by, bz, mat = 'sandbag') => {
      if (bx === pGrid.gx && bz === pGrid.gz && Math.abs(by - pGrid.gy) <= 1) return;
      if (this.world.addVoxel(bx, by, bz, mat, false, true)) {
        builtCount++;
        if (this.onBroadcast) {
          this.onBroadcast({ type: 'voxel_add', gx: bx, gy: by, gz: bz, mat });
        }
      }
    };

    if (bp === 'FIRING PORT') {
      // 3-wide, 2-tall sandbag emplacement with a center firing slit!
      for (const s of [-1, 0, 1]) {
        placeBlock(g.gx + dx * s, baseGy, g.gz + dz * s, 'sandbag');
        if (s !== 0) {
          placeBlock(g.gx + dx * s, baseGy + 1, g.gz + dz * s, 'sandbag');
        }
      }
    } else if (bp === 'SANDBAG BUNKER') {
      // U-shaped 3-wide chest-high sandbag bunker with flanking side wings
      for (const s of [-1, 0, 1]) {
        placeBlock(g.gx + dx * s, baseGy, g.gz + dz * s, 'sandbag');
        if (Math.abs(s) === 1) {
          placeBlock(g.gx + dx * s - fwdGx, baseGy, g.gz + dz * s - fwdGz, 'sandbag');
          placeBlock(g.gx + dx * s, baseGy + 1, g.gz + dz * s, 'sandbag');
        }
      }
    } else if (bp === 'HESCO BASTION') {
      // 3x2 reinforced HESCO barrier
      for (const s of [-1, 0, 1]) {
        placeBlock(g.gx + dx * s, baseGy, g.gz + dz * s, 'darkConcrete');
        placeBlock(g.gx + dx * s, baseGy + 1, g.gz + dz * s, 'sandbag');
      }
    } else {
      // CHEST WALL (4-wide, 1.25m chest-high sandbag breastwork with concrete end-caps:
      // shoot right over it while standing [1.65m eye height], or crouch [1.00m] for 100% cover!)
      for (const s of [-1, 0, 1, 2]) {
        const mat = s === -1 || s === 2 ? 'darkConcrete' : 'sandbag';
        placeBlock(g.gx + dx * s, baseGy, g.gz + dz * s, mat);
      }
    }

    if (builtCount > 0 && !fromInteractKey && this.onAwardXp) {
      this.onAwardXp(15, `BUILT ${bp}`);
    }
    return builtCount;
  }
};
