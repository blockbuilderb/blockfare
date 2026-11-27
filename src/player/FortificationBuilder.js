import * as THREE from '../../vendor/three.module.js';
import { VOXEL_SIZE } from '../world.js?v=142';
import { sound } from '../audio.js?v=142';
import { DISTANCES } from '../config.js?v=142';
import { events } from '../events.js?v=142';

export const FortificationMethods = {
  getBlueprintName() {
    return this.buildBlueprints[this.buildBlueprintIndex] || 'CHEST WALL';
  },

  /**
   * Builds a Squad-style Emplacement ('COVERED_BUNKER' $350, 'HMG_NEST' $450, 'MORTAR_PIT' $600, 'AA_EMPLACEMENT' $650)
   * OR a full walk-in 3D Fortified Command Bunker / 2-Story Tactical House ($1,000) ahead of the player!
   * Can be triggered via [8] hotkey, HUD buttons, [K] Command Map, [L]/[I] Field Requisitions, or [F]/[T]/Hammer when selected via [B].
   */
  buildPaidHouseOrBunker(variant = 'AUTO') {
    if (this.dead || this.downed || this.activeVehicle) {
      return { ok: false, reason: 'INCAPACITATED_OR_IN_VEHICLE' };
    }
    if (typeof this.syncTotalCash === 'function') {
      this.syncTotalCash();
    }
    const curBlueprint = this.getBlueprintName();
    let resolvedVariant = variant;
    if (!resolvedVariant || resolvedVariant === 'AUTO') {
      if (curBlueprint.includes('COVERED BUNKER')) {
        resolvedVariant = 'COVERED_BUNKER';
      } else if (curBlueprint.includes('HMG')) {
        resolvedVariant = 'HMG_NEST';
      } else if (curBlueprint.includes('MORTAR')) {
        resolvedVariant = 'MORTAR_PIT';
      } else if (curBlueprint.includes('AA EMPLACEMENT')) {
        resolvedVariant = 'AA_EMPLACEMENT';
      } else if (curBlueprint.includes('HOUSE')) {
        resolvedVariant = 'HOUSE';
      } else if (curBlueprint.includes('COMMAND BUNKER') || curBlueprint.includes('BUNKER ($1000)')) {
        resolvedVariant = 'BUNKER';
      } else {
        this._nextPaidBuildVariant = this._nextPaidBuildVariant === 'HOUSE' ? 'BUNKER' : 'HOUSE';
        resolvedVariant = this._nextPaidBuildVariant;
      }
    }

    let upperVar = String(resolvedVariant).toUpperCase();
    if (upperVar === 'AA_EMPLACE') upperVar = 'AA_EMPLACEMENT';
    const isSquadEmplace =
      upperVar === 'COVERED_BUNKER' ||
      upperVar === 'HMG_NEST' ||
      upperVar === 'MORTAR_PIT' ||
      upperVar === 'AA_EMPLACEMENT';
    if (
      isSquadEmplace &&
      this.squadDoctrineEnabled !== false &&
      (this.world?.era || 'modern') === 'modern' &&
      this.role !== 'engineer'
    ) {
      sound.playEmptyClick?.();
      if (this.onAwardXp) {
        this.onAwardXp(
          0,
          '🛠️ SQUAD EMPLACEMENTS & FORTIFICATIONS REQUIRE [COMBAT ENGINEER] KIT! (OR TOGGLE DOCTRINE OFF IN ⚙️)'
        );
      }
      return { ok: false, reason: 'REQUIRES_ENGINEER_KIT' };
    }
    if (
      !isSquadEmplace &&
      this.squadDoctrineEnabled !== false &&
      (this.world?.era || 'modern') === 'modern' &&
      this.commandRank !== 'COMMANDER' &&
      this.commandRank !== 'SQUAD_LEADER' &&
      this.role !== 'engineer'
    ) {
      sound.playEmptyClick?.();
      if (this.onAwardXp) {
        this.onAwardXp(
          0,
          '🔒 COMMAND BUNKERS & TACTICAL HOUSES [8] REQUIRE [SQUAD LEADER], [COMMANDER], OR [ENGINEER]! (OR TOGGLE DOCTRINE OFF IN ⚙️)'
        );
      }
      return { ok: false, reason: 'REQUIRES_SL_RANK' };
    }
    const baseCost =
      upperVar === 'COVERED_BUNKER'
        ? 350
        : upperVar === 'HMG_NEST'
        ? 450
        : upperVar === 'MORTAR_PIT'
        ? 600
        : upperVar === 'AA_EMPLACEMENT'
        ? 650
        : 1000;
    // Combat Engineer Specialty: -25% cost discount on all Squad Gun Emplacements!
    const cost =
      isSquadEmplace && this.role === 'engineer' ? Math.round(baseCost * 0.75) : baseCost;
    const isHouse = upperVar.includes('HOUSE');
    const structLabel =
      upperVar === 'COVERED_BUNKER'
        ? '🛡️ COVERED SHOOTING POSITION'
        : upperVar === 'HMG_NEST'
        ? '🔫 .50 CAL HMG EMPLACEMENT'
        : upperVar === 'MORTAR_PIT'
        ? '🎯 81MM INDIRECT-FIRE MORTAR PIT'
        : upperVar === 'AA_EMPLACEMENT'
        ? '📡 ZU-23-2 / C-RAM ANTI-AIR EMPLACEMENT'
        : isHouse
        ? '🏠 2-STORY TACTICAL HOUSE'
        : '🏰 FORTIFIED COMMAND BUNKER';

    const availMatchCash = typeof this.matchCash === 'number' ? this.matchCash : this.cash || 0;
    const payRes =
      typeof this.spendFunds === 'function'
        ? this.spendFunds(cost, 'match')
        : availMatchCash >= cost
        ? { ok: true }
        : { ok: false, shortBy: cost - availMatchCash };

    if (!payRes.ok) {
      const shortBy = Math.ceil(payRes.shortBy || Math.max(1, cost - availMatchCash));
      if (this.onAwardXp) {
        this.onAwardXp(
          0,
          `⚠️ NEED ⚡$${cost.toLocaleString()} MATCH CASH TO BUILD ${structLabel} (HAVE ⚡$${Math.floor(availMatchCash).toLocaleString()} • SHORT BY ⚡$${shortBy.toLocaleString()})`
        );
      }
      return { ok: false, reason: 'INSUFFICIENT_FUNDS', shortBy, cost };
    }

    const flatFwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
    const distAhead = isSquadEmplace ? 4.2 : isHouse ? 6.8 : 6.0;
    const centerWx = this.pos.x + flatFwd.x * distAhead;
    const centerWz = this.pos.z + flatFwd.z * distAhead;

    const buildRes = isSquadEmplace
      ? this.world && typeof this.world.buildSquadEmplacement === 'function'
        ? this.world.buildSquadEmplacement(
            centerWx,
            centerWz,
            this.yaw,
            upperVar,
            this.team,
            this.vehicleManager,
            this.pos,
            this.onBroadcast
          )
        : null
      : this.world && typeof this.world.buildPlayerHouseOrBunker === 'function'
      ? this.world.buildPlayerHouseOrBunker(
          centerWx,
          centerWz,
          this.yaw,
          isHouse ? 'HOUSE' : 'BUNKER',
          this.pos,
          this.onBroadcast
        )
      : null;

    // Also upgrade nearby friendly Forward Base defense stage if built inside/near a friendly objective!
    const nearFlag = this.findNearbyFlag(DISTANCES.FLAG_EXTRA_PAD + 8);
    if (
      nearFlag &&
      nearFlag.owner === this.team &&
      (nearFlag.defenseStage || 0) < 4 &&
      typeof this.world.buildPointDefenseStage === 'function'
    ) {
      this.world.buildPointDefenseStage(nearFlag, this.onBroadcast, this.pos);
    }

    if (
      typeof this.checkBodyOverlap === 'function' &&
      this.checkBodyOverlap(this.pos.x, this.pos.y, this.pos.z, 0.4, 1.7)
    ) {
      this.resolveHorizontalOverlap(0.4, 1.7);
    }

    this.recoilKickZ = 0.16;
    sound.playBuildHammer();
    sound.playReload();
    this.score = (this.score || 0) + 150;

    if (typeof this.saveGunsmithState === 'function') {
      this.saveGunsmithState();
    }
    if (typeof this.emitCashUpdate === 'function') {
      this.emitCashUpdate(-cost, `BUILT ${structLabel} (-$${cost.toLocaleString()})`);
    }
    if (window.game?.ui?.updateCashAndGunsmithHud) {
      window.game.ui.updateCashAndGunsmithHud();
    }
    if (this.onAwardXp) {
      const blocksCnt = buildRes ? buildRes.blocksBuilt : 30;
      this.onAwardXp(
        150,
        `${structLabel} CONSTRUCTED (-$${cost.toLocaleString()} • ${blocksCnt} VOXEL BLOCKS)!`
      );
    }
    events.emit('telemetry:event', {
      type: 'PLAYER_BUILT_HOUSE_BUNKER',
      payload: {
        variant: upperVar,
        cost,
        blocksBuilt: buildRes ? buildRes.blocksBuilt : 0,
        pos: { x: Math.round(centerWx), z: Math.round(centerWz) }
      }
    });

    return {
      ok: true,
      variant: upperVar,
      cost,
      blocksBuilt: buildRes ? buildRes.blocksBuilt : 0,
      building: buildRes ? buildRes.building : null,
      vehicle: buildRes ? buildRes.vehicle : null
    };
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

  /**
   * Repairs the nearest damaged/collapsed building within `maxDist` meters so defenders
   * around a forward base can rebuild blasted walls, roofs, and interior cover!
   */
  tryRepairNearbyBuilding(maxDist = 14.0) {
    if (!this.world || typeof this.world.findNearestDamagedBuilding !== 'function') return false;
    const found = this.world.findNearestDamagedBuilding(this.pos, maxDist);
    if (!found || !found.building) return false;

    const repairAmt = this.role === 'engineer' ? 225 : 90;
    const res = this.world.repairBuilding(found.building, repairAmt, this.pos, this.onBroadcast);
    if (res && (res.restoredCount > 0 || res.healedCount > 0)) {
      this.recoilKickZ = 0.13;
      sound.playBuildHammer();
      sound.playReload();
      this.score = (this.score || 0) + 75;
      if (this.onAwardXp) {
        const statusStr =
          res.integrityPct >= 100
            ? '100% FULLY RESTORED!'
            : `${res.integrityPct}% INTACT (+${res.restoredCount} BLOCKS)`;
        this.onAwardXp(75, `🔨 REPAIRED BUILDING COVER (${statusStr})`);
      }
      return true;
    }
    return false;
  },

  tryBuildPointDefenses() {
    const isModern = (this.world?.era || 'modern') === 'modern';
    if (isModern && this.squadDoctrineEnabled !== false && this.role !== 'engineer') {
      sound.playEmptyClick?.();
      if (this.onAwardXp) {
        this.onAwardXp(
          0,
          '🛠️ ONLY [COMBAT ENGINEER] CARRIES FORTIFICATION TOOLS TO BUILD CHEST WALLS & DEFENSES!'
        );
      }
      return false;
    }
    // Priority 1: If standing near a damaged/collapsed building (such as around a Forward Base),
    // pressing [F] repairs its walls, upper floors, and roof cover!
    const repairedBuilding = this.tryRepairNearbyBuilding(14.0);

    const nearFlag = this.findNearbyFlag(DISTANCES.FLAG_EXTRA_PAD);
    const bpName = this.getBlueprintName();
    const builtFront = this.useHammer(false, true);

    if (nearFlag && nearFlag.owner === this.team) {
      if ((nearFlag.defenseStage || 0) < 4 && typeof this.world.buildPointDefenseStage === 'function') {
        const res = this.world.buildPointDefenseStage(nearFlag, this.onBroadcast, this.pos);
        if (typeof this.checkBodyOverlap === 'function' && this.checkBodyOverlap(this.pos.x, this.pos.y, this.pos.z, 0.4, 1.7)) {
          this.resolveHorizontalOverlap(0.4, 1.7);
        }
        this.score += 50;
        sound.playReload();
        if (this.onAwardXp && !repairedBuilding) {
          this.onAwardXp(
            50,
            `BUILT ${bpName} & FORTIFIED OBJ ${nearFlag.id} DEFENSES (${res.stage}/${res.maxStage})`
          );
        }
        return true;
      }
      if (builtFront > 0 && !repairedBuilding) {
        sound.playReload();
        if (this.onAwardXp) {
          this.onAwardXp(25, `BUILT ${bpName} AT OBJ ${nearFlag.id}`);
        }
      }
      return builtFront > 0 || repairedBuilding;
    }

    if (builtFront > 0 && !repairedBuilding) {
      sound.playReload();
      if (this.onAwardXp) {
        this.onAwardXp(20, `BUILT ${bpName}`);
      }
    }
    return builtFront > 0 || repairedBuilding;
  },

  useHammer(isBreak = false, fromInteractKey = false) {
    this.recoilKickZ = 0.13;
    sound.playBuildHammer();

    // Priority: If swinging Hammer / Repair Torch near a damaged friendly Vehicle or Aircraft, repair its hull!
    if (!isBreak && this.vehicleManager && Array.isArray(this.vehicleManager.vehicles)) {
      let bestVeh = null;
      let bestDist = 8.5;
      for (const veh of this.vehicleManager.vehicles) {
        if (!veh || veh.dead || veh.team !== this.team) continue;
        const hasDamagedSub =
          veh.subsystems &&
          (veh.subsystems.optics !== 'OK' ||
            veh.subsystems.tracks !== 'OK' ||
            veh.subsystems.turret !== 'OK' ||
            veh.subsystems.engine !== 'OK');
        const hasSensorGlitch = (veh.sensorGlitchTimer || 0) > 0 || (veh.opticsGlitchTimer || 0) > 0;
        if (veh.hp >= veh.maxHp && !hasDamagedSub && !hasSensorGlitch) continue;
        const d = veh.pos.distanceTo(this.pos);
        if (d < bestDist) {
          bestDist = d;
          bestVeh = veh;
        }
      }
      if (bestVeh) {
        const repairAmt =
          this.role === 'engineer'
            ? 450
            : this.role === 'armor' || this.role === 'pilot'
            ? 360
            : 180;
        bestVeh.hp = Math.min(bestVeh.maxHp, bestVeh.hp + repairAmt);
        let subRepaired = false;
        if (bestVeh.subsystems) {
          for (const k of ['optics', 'tracks', 'turret', 'engine']) {
            if (bestVeh.subsystems[k] && bestVeh.subsystems[k] !== 'OK') {
              bestVeh.subsystems[k] = 'OK';
              subRepaired = true;
            }
          }
        }
        if ((bestVeh.sensorGlitchTimer || 0) > 0 || (bestVeh.opticsGlitchTimer || 0) > 0) {
          bestVeh.sensorGlitchTimer = 0;
          bestVeh.opticsGlitchTimer = 0;
          subRepaired = true;
        }
        sound.playReload?.();
        this.score = (this.score || 0) + 50;
        if (this.onAwardXp) {
          this.onAwardXp(
            50,
            `🔧 REPAIRED ${bestVeh.name}${subRepaired ? ' + OPTICS/SENSORS RESTORED' : ''} (${Math.round(bestVeh.hp)}/${bestVeh.maxHp} HP)`
          );
        }
        if (!fromInteractKey) return 1;
      }
    }

    if (!isBreak && !fromInteractKey) {
      this.tryRepairNearbyBuilding(11.0);
    }

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

    const isModern = (this.world?.era || 'modern') === 'modern';
    if (isModern && this.squadDoctrineEnabled !== false && this.role !== 'engineer') {
      sound.playEmptyClick?.();
      if (this.onAwardXp) {
        this.onAwardXp(
          0,
          '🛠️ ONLY [COMBAT ENGINEER] CAN BUILD CHEST WALLS & SANDBAG FORTIFICATIONS! (RMB BREACHES COVER)'
        );
      }
      return 0;
    }

    const flatFwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
    let placePos;
    if (fromInteractKey) {
      // Pressing [F] always anchors the Chest Wall / Defense Structure on the ground 2.9m ahead of where you face!
      placePos = this.pos.clone().addScaledVector(flatFwd, 2.9);
      placePos.y = this.world.getGroundHeightAt(placePos.x, placePos.z) + 0.15;
    } else {
      placePos = origin.clone().addScaledVector(dir, 3.0);
      if (hit) {
        placePos = hit.point.clone().addScaledVector(hit.normal, VOXEL_SIZE * 0.55);
      }
      // Ensure Hammer / [T] fortifications are always placed at least 2.45m ahead horizontally
      // so wide Chest Walls or Sandbag Bunker side-wings never spawn around the player's own legs!
      const horizDist = Math.hypot(placePos.x - this.pos.x, placePos.z - this.pos.z);
      if (horizDist < 2.45) {
        placePos.x = this.pos.x + flatFwd.x * 2.55;
        placePos.z = this.pos.z + flatFwd.z * 2.55;
        placePos.y = Math.max(placePos.y, this.world.getGroundHeightAt(placePos.x, placePos.z) + 0.15);
      }
    }

    const g = this.world.worldToGrid(placePos.x, Math.max(0.1, placePos.y), placePos.z);
    const pGrid = this.world.worldToGrid(this.pos.x, this.pos.y + 0.5, this.pos.z);
    if (g.gx === pGrid.gx && g.gz === pGrid.gz && Math.abs(g.gy - pGrid.gy) <= 2) {
      return 0;
    }

    // Build according to selected BattleBit Squad Fortification Blueprint ([B])
    const bp = this.buildBlueprints[this.buildBlueprintIndex] || 'CHEST WALL';
    if (bp.includes('$')) {
      const res = this.buildPaidHouseOrBunker('AUTO');
      return res && res.ok ? res.blocksBuilt || 1 : 0;
    }
    const baseGy = fromInteractKey ? this.world.getBaseGy(g.gx, g.gz) : Math.max(0, g.gy);
    const alongX = Math.abs(Math.cos(this.yaw)) >= Math.abs(Math.sin(this.yaw));
    const dx = alongX ? 1 : 0;
    const dz = alongX ? 0 : 1;
    // Forward normal direction for U-shaped bunker wings
    const fwdGx = Math.round(-Math.sin(this.yaw));
    const fwdGz = Math.round(-Math.cos(this.yaw));

    let builtCount = 0;
    const placeBlock = (bx, by, bz, mat = 'sandbag') => {
      if (bx === pGrid.gx && bz === pGrid.gz && Math.abs(by - pGrid.gy) <= 2) return;
      // Never place a fortification voxel overlapping or pinching the player's 0.4m body cylinder
      if (
        Math.abs(bx * VOXEL_SIZE - this.pos.x) < 1.32 &&
        Math.abs(bz * VOXEL_SIZE - this.pos.z) < 1.32 &&
        Math.abs(by - pGrid.gy) <= 2
      ) {
        return;
      }
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

    if (typeof this.checkBodyOverlap === 'function' && this.checkBodyOverlap(this.pos.x, this.pos.y, this.pos.z, 0.4, 1.7)) {
      this.resolveHorizontalOverlap(0.4, 1.7);
    }

    if (builtCount > 0 && !fromInteractKey && this.onAwardXp) {
      this.onAwardXp(15, `BUILT ${bp}`);
    }
    return builtCount;
  }
};
