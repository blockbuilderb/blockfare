import * as THREE from '../../vendor/three.module.js';
import { SQUAD_DEFS } from '../bots.js?v=136';
import { isMacPlatform, getShortOrderModifierLabel } from '../utils/KeyboardShortcuts.js?v=136';

export const CommandPanel = {
  setCommandScope(scope, opts = {}) {
    if (opts.promoteIfMember && scope === 'ALL' && this.player.commandRank === 'MEMBER') {
      this.player.commandRank = 'COMMANDER';
    }
    const cleanScope =
      scope === 'ALL' && this.player.commandRank === 'COMMANDER' ? 'ALL' : 'SQUAD';
    this.player.commandScope = cleanScope;
    const allBtn = this.el('cmd-scope-all');
    const sqBtn = this.el('cmd-scope-squad');
    if (allBtn) allBtn.classList.toggle('active', cleanScope === 'ALL');
    if (sqBtn) sqBtn.classList.toggle('active', cleanScope === 'SQUAD');
    this.updateCommandOrderHud();
  },

  _computeBearingAndDist(fromPos, tx, tz) {
    const px = fromPos?.x || 0;
    const pz = fromPos?.z || 0;
    const dx = tx - px;
    const dz = tz - pz;
    const distM = Math.round(Math.hypot(dx, dz));
    let brgDeg = Math.round((Math.atan2(dx, -dz) * 180) / Math.PI);
    if (brgDeg < 0) brgDeg += 360;
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const dirStr = dirs[Math.round(brgDeg / 45) % 8];
    return { distM, brgDeg, dirStr };
  },

  computeRoleMissions(eraOverride) {
    const player = this.player;
    if (!player) return { title: '🎯 FIELD MISSIONS', color: '#00d2d3', missions: [] };

    const team = player.team || 'US';
    const sqId = player.squad || 'ALPHA';
    const pPos = player.activeVehicle?.pos || player.pos || { x: 0, y: 0, z: 0 };
    const era = eraOverride || this.world?.era || 'modern';

    const effRole = player.activeVehicle?.isAircraft
      ? 'pilot'
      : player.activeVehicle && ['tank', 'apc', 'aa'].includes(player.activeVehicle.type)
      ? 'armor'
      : String(player.role || 'assault').toLowerCase();

    const missions = [];
    const pushMission = (m) => {
      if (missions.length >= 3) return;
      const bd = this._computeBearingAndDist(pPos, m.targetX, m.targetZ);
      missions.push({
        ...m,
        distM: bd.distM,
        brgDeg: bd.brgDeg,
        dirStr: bd.dirStr
      });
    };

    const flags = Array.isArray(this.world?.flags) ? this.world.flags : [];
    const vehicles = Array.isArray(this.vehicleManager?.vehicles) ? this.vehicleManager.vehicles : [];
    const bots = Array.isArray(this.botManager?.bots) ? this.botManager.bots : [];

    const cmdOrd = this.botManager?.commanderOrders?.[team];
    const sqOrd = this.botManager?.squadOrders?.[team]?.[sqId];
    const priorityFlagId =
      (sqOrd && sqOrd.timer > 0 && sqOrd.flagId) ||
      (cmdOrd && cmdOrd.timer > 0 && cmdOrd.flagId) ||
      null;

    // Sort candidate non-secure flags (priority order -> contested -> enemy-owned -> neutral -> closest)
    const actionableFlags = flags
      .filter((f) => f && f.pos && (f.contested || f.owner !== team))
      .slice()
      .sort((a, b) => {
        const aPri = a.id === priorityFlagId ? 0 : a.contested ? 1 : a.owner !== 'NEUTRAL' ? 2 : 3;
        const bPri = b.id === priorityFlagId ? 0 : b.contested ? 1 : b.owner !== 'NEUTRAL' ? 2 : 3;
        if (aPri !== bPri) return aPri - bPri;
        const da = Math.hypot(a.pos.x - pPos.x, a.pos.z - pPos.z);
        const db = Math.hypot(b.pos.x - pPos.x, b.pos.z - pPos.z);
        return da - db;
      });

    if (effRole === 'pilot') {
      const cas = this.world?.activeCasRequest;
      if (cas && cas.timer > 0 && cas.team === team && cas.pos) {
        pushMission({
          id: `cas_${cas.squad || 'jtac'}`,
          text: `🔥 CAS: STRIKE ${cas.squad || 'INF'} SMOKE`,
          targetX: cas.pos.x,
          targetZ: cas.pos.z,
          urgency: 'urgent'
        });
      }

      // Live airborne enemy aircraft
      let nearestAir = null;
      let nearestAirDist = Infinity;
      for (let i = 0; i < vehicles.length; i++) {
        const v = vehicles[i];
        if (!v || v.dead || !v.isAircraft || !v.team || v.team === 'NEUTRAL' || v.team === team) continue;
        const gy = this.world?.getGroundHeightAt ? this.world.getGroundHeightAt(v.pos.x, v.pos.z) : 0;
        const airborne = v.pos.y - gy > 6 || (v.forwardSpeed || 0) > 12 || v.driver || v.npcDriver || v.remoteDriverId;
        if (!airborne) continue;
        const d = Math.hypot(v.pos.x - pPos.x, v.pos.z - pPos.z);
        if (d < nearestAirDist) {
          nearestAirDist = d;
          nearestAir = v;
        }
      }
      if (nearestAir) {
        const airLbl =
          nearestAir.aircraftRole === 'gunship'
            ? 'GUNSHIP'
            : nearestAir.aircraftRole === 'b2_spirit'
            ? 'STEALTH BOMBER'
            : nearestAir.aircraftRole === 'cas'
            ? 'CAS JET'
            : 'FIGHTER';
        pushMission({
          id: `air_${nearestAir.id || 'enemy'}`,
          text: `🎯 INTERCEPT ENEMY ${airLbl}`,
          targetX: nearestAir.pos.x,
          targetZ: nearestAir.pos.z,
          urgency: 'urgent'
        });
      }

      // Enemy SPAAG AA / Heavy Armor
      let bestGroundVeh = null;
      let bestGroundScore = Infinity;
      for (let i = 0; i < vehicles.length; i++) {
        const v = vehicles[i];
        if (!v || v.dead || v.isAircraft || !v.team || v.team === 'NEUTRAL' || v.team === team) continue;
        if (v.type !== 'aa' && v.type !== 'tank' && v.type !== 'apc') continue;
        const occupied = Boolean(v.driver || v.npcDriver || v.remoteDriverId);
        if (!occupied && v.type !== 'aa') continue;
        const d = Math.hypot(v.pos.x - pPos.x, v.pos.z - pPos.z);
        const priWeight = v.type === 'aa' ? d * 0.55 : d;
        if (priWeight < bestGroundScore) {
          bestGroundScore = priWeight;
          bestGroundVeh = v;
        }
      }
      if (bestGroundVeh && missions.length < 2) {
        const gLbl =
          bestGroundVeh.type === 'aa' ? 'SPAAG AA' : bestGroundVeh.type === 'tank' ? 'MBT TANK' : 'IFV ARMOR';
        pushMission({
          id: `sead_${bestGroundVeh.id || 'veh'}`,
          text: `💥 STRIKE ENEMY ${gLbl}`,
          targetX: bestGroundVeh.pos.x,
          targetZ: bestGroundVeh.pos.z,
          urgency: bestGroundVeh.type === 'aa' ? 'urgent' : 'warn'
        });
      }

      for (let i = 0; i < actionableFlags.length && missions.length < 3; i++) {
        const f = actionableFlags[i];
        const verb = f.contested
          ? `CLOSE AIR ON OBJ ${f.id}`
          : f.owner === 'NEUTRAL'
          ? `COVER CAPTURE AT OBJ ${f.id}`
          : `BOMB ENEMY OBJ ${f.id}`;
        pushMission({
          id: `bomb_${f.id}`,
          text: `💣 ${verb}`,
          targetX: f.pos.x,
          targetZ: f.pos.z,
          targetFlagId: f.id,
          urgency: f.contested ? 'urgent' : 'warn'
        });
      }

      return { title: '✈️ PILOT SORTIE MISSIONS', color: '#00d2d3', missions };
    }

    if (effRole === 'armor') {
      let nearestEnemyArmor = null;
      let nearestArmorDist = Infinity;
      for (let i = 0; i < vehicles.length; i++) {
        const v = vehicles[i];
        if (!v || v.dead || v.isAircraft || !v.team || v.team === 'NEUTRAL' || v.team === team) continue;
        if (v.type !== 'tank' && v.type !== 'apc' && v.type !== 'aa') continue;
        if (!(v.driver || v.npcDriver || v.remoteDriverId)) continue;
        const d = Math.hypot(v.pos.x - pPos.x, v.pos.z - pPos.z);
        if (d < nearestArmorDist) {
          nearestArmorDist = d;
          nearestEnemyArmor = v;
        }
      }
      if (nearestEnemyArmor) {
        pushMission({
          id: `duel_${nearestEnemyArmor.id || 'armor'}`,
          text: `💥 ENGAGE ENEMY ${nearestEnemyArmor.type.toUpperCase()}`,
          targetX: nearestEnemyArmor.pos.x,
          targetZ: nearestEnemyArmor.pos.z,
          urgency: 'urgent'
        });
      }

      if (player.activeVehicle?.type === 'aa') {
        for (let i = 0; i < vehicles.length; i++) {
          const v = vehicles[i];
          if (!v || v.dead || !v.isAircraft || !v.team || v.team === 'NEUTRAL' || v.team === team) continue;
          const gy = this.world?.getGroundHeightAt ? this.world.getGroundHeightAt(v.pos.x, v.pos.z) : 0;
          if (v.pos.y - gy > 6 || (v.forwardSpeed || 0) > 12) {
            pushMission({
              id: `aa_${v.id || 'air'}`,
              text: `🎯 SHOOT DOWN ENEMY AIRCRAFT`,
              targetX: v.pos.x,
              targetZ: v.pos.z,
              urgency: 'urgent'
            });
            break;
          }
        }
      }

      for (let i = 0; i < actionableFlags.length && missions.length < 3; i++) {
        const f = actionableFlags[i];
        pushMission({
          id: `spear_${f.id}`,
          text: `🛡️ ${f.contested ? `RELIEVE CONTESTED OBJ ${f.id}` : `SPEARHEAD OBJ ${f.id}`}`,
          targetX: f.pos.x,
          targetZ: f.pos.z,
          targetFlagId: f.id,
          urgency: f.contested ? 'urgent' : 'warn'
        });
      }
      return { title: '🛡️ ARMOR CREW MISSIONS', color: '#f1c40f', missions };
    }

    if (effRole === 'medic') {
      let downedCount = 0;
      let nearestDowned = null;
      let nearestDownedDist = Infinity;
      let woundedCount = 0;
      let nearestWounded = null;
      let nearestWoundedDist = Infinity;

      for (let i = 0; i < bots.length; i++) {
        const b = bots[i];
        if (!b || b.dead || b.team !== team) continue;
        const d = Math.hypot(b.pos.x - pPos.x, b.pos.z - pPos.z);
        if (b.downed && d <= 260) {
          downedCount++;
          if (d < nearestDownedDist) {
            nearestDownedDist = d;
            nearestDowned = b;
          }
        } else if (!b.downed && b.hp < (b.maxHp || 100) * 0.72 && d <= 140) {
          woundedCount++;
          if (d < nearestWoundedDist) {
            nearestWoundedDist = d;
            nearestWounded = b;
          }
        }
      }

      if (nearestDowned) {
        pushMission({
          id: 'revive_ally',
          text: `🚑 REVIVE ${downedCount > 1 ? `${downedCount} DOWNED ALLIES` : 'DOWNED ALLY'}`,
          targetX: nearestDowned.pos.x,
          targetZ: nearestDowned.pos.z,
          urgency: 'urgent'
        });
      }
      if (nearestWounded) {
        pushMission({
          id: 'heal_ally',
          text: `➕ HEAL ${woundedCount > 1 ? `${woundedCount} WOUNDED ALLIES` : 'WOUNDED ALLY'}`,
          targetX: nearestWounded.pos.x,
          targetZ: nearestWounded.pos.z,
          urgency: 'warn'
        });
      }
      const contestedOrPriority = actionableFlags.find((f) => f.contested || f.id === priorityFlagId);
      if (contestedOrPriority) {
        pushMission({
          id: `escort_${contestedOrPriority.id}`,
          text: `🏃 SUPPORT ${sqId} AT OBJ ${contestedOrPriority.id}`,
          targetX: contestedOrPriority.pos.x,
          targetZ: contestedOrPriority.pos.z,
          targetFlagId: contestedOrPriority.id
        });
      }
      return { title: '➕ MEDIC TRIAGE MISSIONS', color: '#2ecc71', missions };
    }

    if (effRole === 'engineer') {
      let nearestDamagedFriendly = null;
      let nearestDamagedDist = Infinity;
      let nearestEnemyVeh = null;
      let nearestEnemyVehDist = Infinity;

      for (let i = 0; i < vehicles.length; i++) {
        const v = vehicles[i];
        if (!v || v.dead || !v.pos) continue;
        const d = Math.hypot(v.pos.x - pPos.x, v.pos.z - pPos.z);
        if (!v.isAircraft && v.team === team && v.hp < (v.maxHp || 1000) * 0.85 && d <= 320) {
          if (d < nearestDamagedDist) {
            nearestDamagedDist = d;
            nearestDamagedFriendly = v;
          }
        } else if (
          v.team &&
          v.team !== 'NEUTRAL' &&
          v.team !== team &&
          d <= 520 &&
          (v.driver || v.npcDriver || v.remoteDriverId)
        ) {
          if (d < nearestEnemyVehDist) {
            nearestEnemyVehDist = d;
            nearestEnemyVeh = v;
          }
        }
      }

      if (nearestDamagedFriendly) {
        const pct = Math.max(1, Math.round((nearestDamagedFriendly.hp / (nearestDamagedFriendly.maxHp || 1000)) * 100));
        pushMission({
          id: `rep_${nearestDamagedFriendly.id || 'veh'}`,
          text: `🔧 REPAIR ${nearestDamagedFriendly.type.toUpperCase()} (${pct}% HP)`,
          targetX: nearestDamagedFriendly.pos.x,
          targetZ: nearestDamagedFriendly.pos.z,
          urgency: 'urgent'
        });
      }
      if (nearestEnemyVeh) {
        const lbl = nearestEnemyVeh.isAircraft ? 'AIRCRAFT [STINGER]' : `${nearestEnemyVeh.type.toUpperCase()} [RPG]`;
        pushMission({
          id: `at_${nearestEnemyVeh.id || 'enemy'}`,
          text: `🚀 DESTROY ENEMY ${lbl}`,
          targetX: nearestEnemyVeh.pos.x,
          targetZ: nearestEnemyVeh.pos.z,
          urgency: 'urgent'
        });
      }
      const fobToFortify =
        flags.find((f) => f && f.pos && f.owner === team && f.contested) ||
        actionableFlags[0] ||
        null;
      if (fobToFortify) {
        pushMission({
          id: `fort_${fobToFortify.id}`,
          text: `🧱 ${
            fobToFortify.owner === team
              ? `DEFEND & FORTIFY OBJ ${fobToFortify.id}`
              : `SAPPER PUSH OBJ ${fobToFortify.id}`
          }`,
          targetX: fobToFortify.pos.x,
          targetZ: fobToFortify.pos.z,
          targetFlagId: fobToFortify.id,
          urgency: fobToFortify.contested ? 'urgent' : 'warn'
        });
      }
      return { title: '🛠️ ENGINEER FIELD TASKS', color: '#ff9f43', missions };
    }

    if (effRole === 'support') {
      let nearbyAllies = 0;
      for (let i = 0; i < bots.length; i++) {
        const b = bots[i];
        if (!b || b.dead || b.team !== team) continue;
        if (Math.hypot(b.pos.x - pPos.x, b.pos.z - pPos.z) <= 90) nearbyAllies++;
      }
      if (nearbyAllies >= 3 && !player.ammoStash && (player.stashCooldown || 0) <= 0 && era === 'modern') {
        pushMission({
          id: 'drop_stash',
          text: `📦 DROP AMMO STASH [7] (${nearbyAllies} ALLIES)`,
          targetX: pPos.x,
          targetZ: pPos.z,
          urgency: 'warn'
        });
      }
      for (let i = 0; i < actionableFlags.length && missions.length < 3; i++) {
        const f = actionableFlags[i];
        pushMission({
          id: `supp_${f.id}`,
          text: `🔥 ${f.contested ? `SUPPRESS CONTESTED OBJ ${f.id}` : `ADVANCE ON OBJ ${f.id}`}`,
          targetX: f.pos.x,
          targetZ: f.pos.z,
          targetFlagId: f.id,
          urgency: f.contested ? 'urgent' : 'warn'
        });
      }
      return { title: '📦 SUPPORT LOGISTICS TASKS', color: '#a29bfe', missions };
    }

    if (effRole === 'recon') {
      const flankFlag = actionableFlags[0] || null;
      if (flankFlag && !player.insertionBeacon && (player.beaconCooldown || 0) <= 0 && era === 'modern') {
        pushMission({
          id: `bcn_${flankFlag.id}`,
          text: `📡 PLACE BEACON [6] NEAR OBJ ${flankFlag.id}`,
          targetX: flankFlag.pos.x,
          targetZ: flankFlag.pos.z,
          targetFlagId: flankFlag.id,
          urgency: 'warn'
        });
      }
      if (flankFlag && (player.airstrikeCooldown || 0) <= 0 && era === 'modern') {
        pushMission({
          id: `jtac_${flankFlag.id}`,
          text: `🎯 PAINT JTAC CAS [J] ON OBJ ${flankFlag.id}`,
          targetX: flankFlag.pos.x,
          targetZ: flankFlag.pos.z,
          targetFlagId: flankFlag.id,
          urgency: flankFlag.contested ? 'urgent' : 'warn'
        });
      }
      return { title: '🎯 RECON & JTAC MISSIONS', color: '#74b9ff', missions };
    }

    // Assault & Medieval / Jurassic Frontline Combat Roles
    const activeManual = (sqOrd && sqOrd.timer > 0 && sqOrd) || (cmdOrd && cmdOrd.timer > 0 && cmdOrd) || null;
    if (activeManual && activeManual.flagId) {
      const ordFlag = flags.find((f) => f.id === activeManual.flagId);
      if (ordFlag && ordFlag.pos) {
        pushMission({
          id: `ord_${ordFlag.id}`,
          text: `⚔️ ORDER: ${activeManual.action} OBJ ${ordFlag.id}`,
          targetX: ordFlag.pos.x,
          targetZ: ordFlag.pos.z,
          targetFlagId: ordFlag.id,
          urgency: 'urgent'
        });
      }
    }

    for (let i = 0; i < actionableFlags.length && missions.length < 2; i++) {
      const f = actionableFlags[i];
      if (missions.some((m) => m.targetFlagId === f.id)) continue;
      pushMission({
        id: `atk_${f.id}`,
        text: `💥 ${f.contested ? `CLEAR CONTESTED OBJ ${f.id}` : `CAPTURE OBJ ${f.id}`}`,
        targetX: f.pos.x,
        targetZ: f.pos.z,
        targetFlagId: f.id,
        urgency: f.contested ? 'urgent' : 'warn'
      });
    }

    return { title: '⚔️ COMBAT MISSIONS', color: '#7bed9f', missions };
  },

  issueHudStrategicOrder(opts = {}) {
    if (!this.botManager || typeof this.botManager.issueStrategicOrder !== 'function') return null;
    if (this.player && this.player.commandRank === 'MEMBER' && !opts.forceAllowMember) {
      return null;
    }
    const scope = opts.scope || this.player.commandScope || 'ALL';
    const targetSquad = opts.targetSquad || this.player.squad || 'ALPHA';
    const team = this.player.team || 'US';
    let action = (opts.action || 'OBJECTIVE').toUpperCase();
    const flagId = opts.flagId || null;

    // Check current active manual order for the selected scope so clicking [🤖 AI / Alt+A]
    // (or re-clicking an already-active manual order button) toggles cleanly between AI: ON and AI: OFF (Hold/Manual)!
    const curActiveOrder =
      scope === 'ALL'
        ? this.botManager.commanderOrders && this.botManager.commanderOrders[team]
        : this.botManager.squadOrders &&
          this.botManager.squadOrders[team] &&
          this.botManager.squadOrders[team][targetSquad];
    const hasManualOrderNow = Boolean(curActiveOrder && curActiveOrder.timer > 0);

    let toggledAiOff = false;
    if (action === 'AUTO') {
      if (!hasManualOrderNow) {
        // Autonomous AI was ON -> toggle Autonomous AI OFF (Squads hold current position awaiting manual orders)
        action = 'HOLD';
        toggledAiOff = true;
      }
    } else if (
      action !== 'GARRISON' &&
      action !== 'GARRISON_TOGGLE' &&
      hasManualOrderNow &&
      curActiveOrder.action === action &&
      (!flagId || curActiveOrder.flagId === flagId)
    ) {
      // Re-clicking an already-active manual order button toggles it off and returns squads to Autonomous AI: ON
      action = 'AUTO';
    }

    const res = this.botManager.issueStrategicOrder(this.player, {
      scope,
      targetSquad,
      action,
      flagId
    });
    if (!res) return null;
    if (toggledAiOff && curActiveOrder !== undefined) {
      const ordObj =
        scope === 'ALL'
          ? this.botManager.commanderOrders?.[team]
          : this.botManager.squadOrders?.[team]?.[targetSquad];
      if (ordObj) ordObj.isAiPausedHold = true;
    }

    const sqTotal = SQUAD_DEFS.length || 6;
    const scopeLabel =
      res.scope === 'ALL'
        ? `ALL ${sqTotal} SQUADS (${res.unitsOrdered} NPCs)`
        : `${targetSquad} SQUAD (${res.unitsOrdered} NPCs)`;
    const orderSummary = toggledAiOff
      ? `🤖 ${scopeLabel} -> AUTONOMOUS AI: OFF (HOLDING POSITION FOR MANUAL COMMANDER ORDERS)!`
      : res.action === 'CHARGE' || res.action === 'ATTACK'
      ? `⚔️ ${scopeLabel} -> ALL-OUT CHARGE INTO OBJECTIVE ${res.flagId || 'FRONTLINE'} (BATTLE CRY & SHOCK ASSAULT)!`
      : res.action === 'RETREAT'
      ? `🏳️ ${scopeLabel} -> TACTICAL RETREAT / FALL BACK TO ${res.flagId || 'REAR KEEP'} (FIGHTING WITHDRAWAL)!`
      : res.action === 'OBJECTIVE'
      ? `⚔️ ${scopeLabel} -> ATTACK / CAPTURE OBJECTIVE ${res.flagId}!`
      : res.action === 'FOLLOW'
      ? `🏃 ${scopeLabel} -> FOLLOW ME (RALLY ON COMMANDER)!`
      : res.action === 'HOLD'
      ? `🛡️ ${scopeLabel} -> DEFEND / SHIELD WALL (HOLD POSITION • -35% DMG IN SHIELD WALL)!`
      : res.action === 'GARRISON'
      ? res.garrisonEnabled
        ? `🏰 GARRISON DOCTRINE: ON — 1 SQUAD PER CAPTURED FORWARD BASE (${res.garrisonSummary || 'ACTIVE'})!`
        : `⚔️ GARRISON DOCTRINE: OFF — ALL ${sqTotal} SQUADS RELEASED FOR FRONTLINE ASSAULT!`
      : `🤖 ${scopeLabel} -> AUTONOMOUS AI: ON (AI SQUAD LEADERS ACTIVE)`;

    this.addXpNotification(res.action === 'AUTO' || toggledAiOff ? 0 : 25, orderSummary);
    const allTag = `ALL ${sqTotal} SQUADS`;
    const bannerText = toggledAiOff
      ? `★ AUTONOMOUS AI [${res.scope === 'ALL' ? allTag : targetSquad}]: 🤖 AI OFF — HOLDING FOR MANUAL ORDERS!`
      : res.action === 'AUTO'
      ? `★ AUTONOMOUS AI [${res.scope === 'ALL' ? allTag : targetSquad}]: 🤖 AI ON — SQUAD LEADERS AUTONOMOUS!`
      : res.action === 'CHARGE' || res.action === 'ATTACK'
      ? `★ ORDER [${res.scope === 'ALL' ? allTag : targetSquad}]: ⚔️ ALL-OUT CHARGE (${res.flagId || 'ENEMY LINE'})!`
      : res.action === 'RETREAT'
      ? `★ ORDER [${res.scope === 'ALL' ? allTag : targetSquad}]: 🏳️ RETREAT TO ${res.flagId || 'KEEP'}!`
      : res.action === 'OBJECTIVE'
      ? `★ ORDER [${res.scope === 'ALL' ? allTag : targetSquad}]: ⚔️ ATTACK OBJ ${res.flagId}!`
      : res.action === 'FOLLOW'
      ? `★ ORDER [${res.scope === 'ALL' ? allTag : targetSquad}]: 🏃 FOLLOW ME!`
      : res.action === 'GARRISON'
      ? res.garrisonEnabled
        ? `★ GARRISON DOCTRINE: ON (1 SQUAD DEFENDS EACH CAPTURED BASE)!`
        : `★ GARRISON DOCTRINE: OFF (ALL SQUADS PUSH FRONTLINE)!`
      : `★ ORDER [${res.scope === 'ALL' ? allTag : targetSquad}]: 🛡️ DEFEND / SHIELD WALL!`;
    this.showKillStreakAnnouncement(bannerText);
    this.addTacticalCommsMessage(
      this.network && this.network.callsign ? this.network.callsign : 'YOU',
      res.scope === 'ALL' ? 'CMD' : 'SL',
      res.scope === 'ALL' ? 'COMMAND' : 'SQUAD',
      0,
      orderSummary,
      true
    );
    if (this.network && this.network.isMultiplayer()) {
      this.network.send({
        type: 'order_sync',
        team: this.player.team,
        scope: res.scope,
        targetSquad,
        action: res.action,
        flagId: res.flagId,
        commanderName: this.network.callsign
      });
    }
    this.updateCommandOrderHud();
    const cmdModal = this.el('command-modal');
    if (cmdModal) {
      this.renderCommandModalContent(cmdModal);
    }
    return res;
  },

  issueHudFormationSpacing(spacingMode = 'FAN_OUT', opts = {}) {
    if (!this.botManager || typeof this.botManager.issueFormationSpacing !== 'function') return null;
    if (this.player && this.player.commandRank === 'MEMBER' && !opts.forceAllowMember) {
      return null;
    }
    const scope = opts.scope || this.player.commandScope || 'ALL';
    const targetSquad = opts.targetSquad || this.player.squad || 'ALPHA';
    const mode =
      String(spacingMode || 'FAN_OUT').toUpperCase() === 'STAY_CLOSE' ? 'STAY_CLOSE' : 'FAN_OUT';

    const res = this.botManager.issueFormationSpacing(this.player, {
      scope,
      targetSquad,
      spacingMode: mode
    });
    if (!res) return null;

    const scopeLabel =
      res.scope === 'ALL'
        ? `ALL 5 SQUADS (${res.unitsOrdered} NPCs + ARMOR)`
        : `${targetSquad} SQUAD (${res.unitsOrdered} NPCs)`;

    const isMac = isMacPlatform();
    const closeKeyHint = isMac ? '[-]' : '[Num -]';
    const fanKeyHint = isMac ? '[+]' : '[Num +]';
    const spacingSummary =
      res.spacingMode === 'STAY_CLOSE'
        ? `🤝 ${scopeLabel} -> STAY CLOSE ${closeKeyHint} (TIGHT 2–4m SQUADS • 15m STANDOFF • ARMOR 35–42m)!`
        : `↔️ ${scopeLabel} -> FAN OUT ${fanKeyHint} (SPREAD 7–12m SQUADS • 25m+ STANDOFF • ARMOR ~100m)!`;

    this.addXpNotification(15, spacingSummary);
    this.showKillStreakAnnouncement(
      res.spacingMode === 'STAY_CLOSE'
        ? `★ FORMATION [${res.scope === 'ALL' ? 'ALL 5 SQUADS' : targetSquad}]: 🤝 STAY CLOSE [-]!`
        : `★ FORMATION [${res.scope === 'ALL' ? 'ALL 5 SQUADS' : targetSquad}]: ↔️ FAN OUT [+]`
    );
    this.addTacticalCommsMessage(
      this.network && this.network.callsign ? this.network.callsign : 'YOU',
      res.scope === 'ALL' ? 'CMD' : 'SL',
      res.scope === 'ALL' ? 'COMMAND' : 'SQUAD',
      0,
      spacingSummary,
      true
    );

    this.updateCommandOrderHud();
    const cmdModal = this.el('command-modal');
    if (cmdModal) {
      this.renderCommandModalContent(cmdModal);
    }
    return res;
  },

  updateCommandOrderHud(eraOverride) {
    const cmdPanelEl = this.el('command-order-panel');
    const rankBadgeEl = this.el('cmd-rank-badge');
    const panelTitleEl = this.el('cmd-panel-title');
    const orderTextEl = this.el('cmd-active-order-text');
    const hudStatusLineEl = this.el('cmd-hud-status-line');
    const deployOrderStatusEl = this.el('deploy-order-status');
    const roleMissionListEl = this.el('role-mission-list');
    const allBtn = this.el('cmd-scope-all');
    const sqBtn = this.el('cmd-scope-squad');
    const team = this.player.team || 'US';
    const sqId = this.player.squad || 'ALPHA';
    const rank = this.player.commandRank || 'MEMBER';

    if (rank !== 'COMMANDER' && this.player.commandScope === 'ALL') {
      this.player.commandScope = 'SQUAD';
    }

    let aliveTeamBots = 0;
    let aliveSquadBots = 0;
    const bots = this.botManager.bots;
    for (let i = 0; i < bots.length; i++) {
      const b = bots[i];
      if (!b.dead && b.team === team) {
        aliveTeamBots++;
        if (b.squad === sqId) aliveSquadBots++;
      }
    }

    if (allBtn) {
      allBtn.textContent = `★ ALL 6 SQUADS (${aliveTeamBots})`;
      allBtn.classList.toggle('active', this.player.commandScope === 'ALL');
    }
    if (sqBtn) {
      sqBtn.textContent = `▲ ${sqId} SQUAD (${aliveSquadBots})`;
      sqBtn.classList.toggle('active', this.player.commandScope === 'SQUAD');
    }

    if (cmdPanelEl) {
      cmdPanelEl.dataset.hudTier = rank;
    }

    if (rank === 'MEMBER') {
      const { title, color, missions } = this.computeRoleMissions(eraOverride);
      if (cmdPanelEl) {
        const hasMissions = missions.length > 0;
        cmdPanelEl.classList.toggle('hidden', !hasMissions);
        cmdPanelEl.style.display = hasMissions ? '' : 'none';
      }
      if (panelTitleEl && missions.length > 0) {
        panelTitleEl.textContent = title;
        panelTitleEl.style.color = color;
      }
      if (roleMissionListEl) {
        roleMissionListEl.classList.toggle('hidden', missions.length === 0);
        if (!this._roleMissionClickBound) {
          this._roleMissionClickBound = true;
          roleMissionListEl.addEventListener('click', (ev) => {
            const btn = ev.target && ev.target.closest ? ev.target.closest('.role-mission-item') : null;
            if (!btn || !this.player) return;
            ev.stopPropagation();
            const tx = Number(btn.dataset.tx) || 0;
            const tz = Number(btn.dataset.tz) || 0;
            const lbl = btn.dataset.label || 'MISSION WAYPOINT';
            const gy = this.world?.getGroundHeightAt ? this.world.getGroundHeightAt(tx, tz) : 0;
            this.player.activePing = {
              pos: new THREE.Vector3(tx, gy + 2.5, tz),
              timer: 15.0,
              isEnemy: true,
              label: `📍 ${lbl}`
            };
            this.addXpNotification?.(0, `📍 MISSION WAYPOINT PINNED: ${lbl}`);
          });
        }
        this._latestRoleMissions = missions;
        const sig = missions.map((m) => `${m.id}:${m.text}:${m.distM}:${m.dirStr}:${m.urgency || ''}`).join('|');
        if (this._lastRoleMissionSig !== sig) {
          this._lastRoleMissionSig = sig;
          roleMissionListEl.innerHTML = missions
            .map(
              (m) =>
                `<button type="button" class="role-mission-item ${m.urgency || ''}" data-tx="${Math.round(
                  m.targetX
                )}" data-tz="${Math.round(m.targetZ)}" data-label="${m.text.replace(/"/g, '&quot;')}" title="Click to pin 3D HUD Waypoint">` +
                `<span>${m.text}</span>` +
                `<span class="role-mission-dist">${m.distM}m ${m.dirStr}</span>` +
                `</button>`
            )
            .join('');
        }
      }
    } else {
      if (cmdPanelEl) {
        cmdPanelEl.classList.remove('hidden');
        cmdPanelEl.style.display = '';
      }
      if (roleMissionListEl) {
        roleMissionListEl.classList.add('hidden');
      }
      if (panelTitleEl) {
        if (rank === 'SQUAD_LEADER') {
          panelTitleEl.textContent = `▲ ${sqId} SQUAD LEAD (${aliveSquadBots})`;
          panelTitleEl.style.color = '#2ecc71';
        } else {
          panelTitleEl.textContent =
            this.player.commandScope === 'ALL'
              ? '★ FORCE COMMANDER ORDERS'
              : `▲ ${sqId} SQUAD ORDERS`;
          panelTitleEl.style.color = '#f1c40f';
        }
      }
    }

    if (rankBadgeEl) {
      if (this.player.commandRank === 'COMMANDER') {
        rankBadgeEl.textContent = '★ CMD';
        rankBadgeEl.style.color = '#f1c40f';
      } else if (this.player.commandRank === 'SQUAD_LEADER') {
        rankBadgeEl.textContent = `▲ ${sqId.slice(0, 3)} SL`;
        rankBadgeEl.style.color = '#2ecc71';
      } else {
        rankBadgeEl.textContent = `● ${sqId.slice(0, 3)}`;
        rankBadgeEl.style.color = '#74b9ff';
      }
    }

    const activeOrder =
      this.player.commandScope === 'ALL'
        ? this.botManager.commanderOrders && this.botManager.commanderOrders[team]
        : this.botManager.squadOrders &&
          this.botManager.squadOrders[team] &&
          this.botManager.squadOrders[team][sqId];

    const activeSpacing =
      this.botManager && typeof this.botManager.getEffectiveSpacingMode === 'function'
        ? this.botManager.getEffectiveSpacingMode(
            team,
            this.player.commandScope === 'SQUAD' ? sqId : null
          )
        : this.player.commandScope === 'SQUAD' && this.botManager?.squadSpacingMode?.[team]?.[sqId]
        ? this.botManager.squadSpacingMode[team][sqId]
        : this.botManager?.teamSpacingMode?.[team] || 'FAN_OUT';
    const spacingShort = activeSpacing === 'STAY_CLOSE' ? 'CLOSE [-]' : 'FAN OUT [+]';

    const garrisonOn = Boolean(
      this.botManager &&
        this.botManager.garrisonDoctrineEnabled &&
        this.botManager.garrisonDoctrineEnabled[team]
    );
    const garrisonMap =
      (this.botManager && this.botManager.flagGarrisonSquad && this.botManager.flagGarrisonSquad[team]) ||
      {};
    const garrisonTags = Object.entries(garrisonMap)
      .map(([fid, sq]) => `${fid}:${sq.slice(0, 3)}`)
      .join(' ');

    const isMac = isMacPlatform();
    const modShort = getShortOrderModifierLabel(isMac);
    if (isMac && !this._macLabelsSynced) {
      const cmdPanel = this.el('command-order-panel');
      if (cmdPanel) {
        cmdPanel.querySelectorAll('.cmd-hk').forEach((hk) => {
          hk.textContent = hk.textContent
            .replace(/Alt\+/g, `${modShort}+`)
            .replace('[Num -]', '[-]')
            .replace('[Num +]', '[+]');
        });
        cmdPanel.querySelectorAll('[title]').forEach((node) => {
          const t = node.getAttribute('title');
          if (t) {
            node.setAttribute(
              'title',
              t
                .replace(/Alt\+/g, `${modShort}+`)
                .replace(/\[Num -\]/g, '[-]')
                .replace(/\[Num \+\]/g, '[+]')
                .replace(/Numpad - or Minus/g, '- or ⌥+-')
                .replace(/Numpad \+ or Plus/g, '+ or ⌥++')
            );
          }
        });
        document.querySelectorAll('#flags-hud .flag-badge[title]').forEach((badge) => {
          const t = badge.getAttribute('title');
          if (t) badge.setAttribute('title', t.replace(/Alt\+/g, `${modShort}+`));
        });
        const topRideBtn = document.getElementById('hud-ride-btn');
        if (topRideBtn) {
          topRideBtn.innerHTML = `🚁 <b>[${modShort}+R]</b> Ride`;
          topRideBtn.setAttribute(
            'title',
            `1st [${modShort}+R] (Option+R / ⌃+R / ⌘+R in-game): Request Pickup at Your Position • 2nd [${modShort}+R]: Designate Drop-Off!`
          );
        }
        this._macLabelsSynced = true;
      }
    }

    const isAutoAiOn = !(activeOrder && activeOrder.timer > 0);
    document.querySelectorAll('.cmd-order-btn').forEach((btn) => {
      const act = btn.dataset.action;
      const flg = btn.dataset.flag;
      if (act === 'GARRISON') {
        btn.innerHTML = garrisonOn
          ? `🏰 GARRISON: ON <span class="cmd-hk">[${modShort}+G]</span>`
          : `🏰 GARRISON: OFF <span class="cmd-hk">[${modShort}+G]</span>`;
      } else if (act === 'AUTO') {
        btn.innerHTML = isAutoAiOn
          ? `🤖 AI: ON <span class="cmd-hk">[${modShort}+A]</span>`
          : `🤖 AI: OFF <span class="cmd-hk">[${modShort}+A]</span>`;
      }
      const isMatch =
        act === 'GARRISON'
          ? garrisonOn
          : activeOrder && activeOrder.timer > 0
          ? activeOrder.action === act && (!flg || activeOrder.flagId === flg) && !activeOrder.isAiPausedHold
          : act === 'AUTO';
      btn.classList.toggle('active', Boolean(isMatch));
    });

    document.querySelectorAll('.cmd-spacing-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.spacing === activeSpacing);
    });

    if (orderTextEl) {
      if (activeOrder && activeOrder.timer > 0) {
        const scopeTag = activeOrder.scope === 'ALL' ? 'ALL' : sqId.slice(0, 3);
        const desc =
          activeOrder.action === 'CHARGE'
            ? `CHARGE ${activeOrder.flagId || ''}`
            : activeOrder.action === 'RETREAT'
            ? `RETREAT ${activeOrder.flagId || ''}`
            : activeOrder.action === 'OBJECTIVE'
            ? `ATK ${activeOrder.flagId}`
            : activeOrder.action === 'FOLLOW'
            ? 'FOLLOW ME'
            : 'DEFEND / SHIELD WALL';
        orderTextEl.textContent = `${scopeTag}→${desc} (${spacingShort})`;
        orderTextEl.style.color = '#f1c40f';
      } else if (garrisonOn) {
        orderTextEl.textContent = garrisonTags
          ? `🏰 GARRISON ON [${garrisonTags}] • ${spacingShort}`
          : `🏰 GARRISON ON (1 SQD/BASE) • ${spacingShort}`;
        orderTextEl.style.color = '#7bed9f';
      } else {
        orderTextEl.textContent = `⚔️ ALL SQUADS ASSAULT (GARRISON OFF) • ${spacingShort}`;
        orderTextEl.style.color = '#74b9ff';
      }
    }

    if (hudStatusLineEl) {
      if (activeOrder && activeOrder.timer > 0) {
        const scopeFull =
          activeOrder.scope === 'ALL'
            ? `ALL 5 SQUADS (${aliveTeamBots})`
            : `${sqId} SQUAD (${aliveSquadBots})`;
        const actLabel =
          activeOrder.action === 'CHARGE'
            ? `⚔️ CHARGE OBJ ${activeOrder.flagId || 'LINE'}`
            : activeOrder.action === 'RETREAT'
            ? `🏳️ RETREAT TO ${activeOrder.flagId || 'KEEP'}`
            : activeOrder.action === 'OBJECTIVE'
            ? `⚔️ ATTACK OBJ ${activeOrder.flagId}`
            : activeOrder.action === 'FOLLOW'
            ? '🏃 FOLLOW ME'
            : '🛡️ DEFEND / SHIELD WALL';
        const garSuffix = garrisonOn && garrisonTags ? ` • 🏰 GARRISON: ${garrisonTags}` : '';
        hudStatusLineEl.textContent = `ACTIVE: ${scopeFull} → ${actLabel}${garSuffix} (${Math.ceil(
          activeOrder.timer
        )}s)`;
        hudStatusLineEl.style.color = '#f1c40f';
      } else if (garrisonOn) {
        hudStatusLineEl.textContent = garrisonTags
          ? `🏰 GARRISON ON (1 SQD/BASE): ${garrisonTags} • ${spacingShort}`
          : `🏰 GARRISON ON: 1 SQUAD DEFENDS EACH CAPTURED BASE • ${spacingShort}`;
        hudStatusLineEl.style.color = '#7bed9f';
      } else {
        hudStatusLineEl.textContent = `⚔️ GARRISON OFF: ALL 5 SQUADS PUSHING FRONTLINE • ${spacingShort}`;
        hudStatusLineEl.style.color = '#74b9ff';
      }
    }

    if (deployOrderStatusEl) {
      if (activeOrder && activeOrder.timer > 0) {
        const actLabel =
          activeOrder.action === 'OBJECTIVE'
            ? `⚔️ ATTACK OBJ ${activeOrder.flagId}`
            : activeOrder.action === 'FOLLOW'
            ? '🏃 FOLLOW ME'
            : '🛡️ DEFEND HERE';
        deployOrderStatusEl.textContent = `ACTIVE: ${actLabel} (${spacingShort})`;
        deployOrderStatusEl.style.color = '#f1c40f';
      } else {
        deployOrderStatusEl.textContent = garrisonTags
          ? `🏰 GARRISON (${garrisonTags}) • ${spacingShort}`
          : `🏰 1 SQD/BASE DEFENSE (${spacingShort})`;
        deployOrderStatusEl.style.color = '#7bed9f';
      }
    }

    // Update the sleek 1-line summary bar above the Minimap (#hud-cmd-summary-text)
    if (this.hudCmdSummaryTextEl) {
      const rankShort =
        this.player.commandRank === 'COMMANDER'
          ? '★ CMD'
          : this.player.commandRank === 'SQUAD_LEADER'
          ? `▲ ${sqId} SL`
          : `● ${sqId}`;
      if (activeOrder && activeOrder.timer > 0) {
        const shortAct =
          activeOrder.action === 'OBJECTIVE'
            ? `OBJ ${activeOrder.flagId}`
            : activeOrder.action;
        this.hudCmdSummaryTextEl.textContent = `${rankShort} • ${
          activeOrder.scope === 'ALL' ? 'ALL' : sqId.slice(0, 3)
        }→${shortAct} (${activeSpacing === 'STAY_CLOSE' ? 'CLOSE' : 'FAN'})`;
      } else {
        this.hudCmdSummaryTextEl.textContent = `${rankShort} • ${sqId.slice(0, 3)} (${
          aliveSquadBots + 1
        }) • ${activeSpacing === 'STAY_CLOSE' ? 'CLOSE' : 'FAN'}`;
      }
    }

    // Update Commander Support Row Buttons (UAV [U], Airstrike [J], Strike Pattern [Shift+J], Aircraft [9] — Modern Era Only!)
    const isModernEra = (eraOverride || this.world?.era || 'modern') === 'modern';
    const hudUavBtn = this.el('hud-uav-btn');
    if (hudUavBtn) {
      hudUavBtn.style.display = isModernEra ? '' : 'none';
      if (isModernEra) {
        if (this.player.uavActive) {
          hudUavBtn.textContent = `📡 UAV ACTIVE (${Math.ceil(this.player.uavTimer)}s)`;
          hudUavBtn.classList.add('active');
        } else if (this.player.uavCooldown > 0) {
          hudUavBtn.textContent = `📡 UAV (${Math.ceil(this.player.uavCooldown)}s)`;
          hudUavBtn.classList.remove('active');
        } else {
          hudUavBtn.textContent = '📡 UAV [U]';
          hudUavBtn.classList.remove('active');
        }
      }
    }
    const hudAirstrikeBtn = this.el('hud-airstrike-btn');
    if (hudAirstrikeBtn) {
      hudAirstrikeBtn.style.display = isModernEra ? '' : 'none';
      if (isModernEra) {
        const pat = this.player.airstrikePattern || 'A10_CAS';
        if (this.player.airstrikeTarget) {
          hudAirstrikeBtn.textContent = `💥 INBOUND (${this.player.airstrikeTarget.timer.toFixed(1)}s)`;
          hudAirstrikeBtn.classList.add('active');
        } else if (this.player.airstrikeCooldown > 0) {
          hudAirstrikeBtn.textContent = `💥 CAS (${Math.ceil(this.player.airstrikeCooldown)}s)`;
          hudAirstrikeBtn.classList.remove('active');
        } else {
          hudAirstrikeBtn.textContent = pat === 'A10_CAS' ? '🐗 CAS [J]' : '💥 STRIKE [J]';
          hudAirstrikeBtn.classList.remove('active');
        }
      }
    }
    const hudStrikePatternBtn = this.el('hud-strike-pattern-btn');
    if (hudStrikePatternBtn) {
      hudStrikePatternBtn.style.display = isModernEra ? '' : 'none';
      if (isModernEra) {
        const pat = this.player.airstrikePattern || 'A10_CAS';
        hudStrikePatternBtn.textContent =
          pat === 'A10_CAS'
            ? '🐗 A-10 CAS'
            : pat === 'BUNKER_BUSTER'
            ? '🎯 GBU'
            : pat === 'ARTILLERY'
            ? '🌧️ ARTY'
            : '✈️ CARPET';
      }
    }
    const isInAircraft = Boolean(
      this.player?.activeVehicle &&
        this.player.activeVehicle.isAircraft &&
        !this.player.activeVehicle.isSecretOmegaFlyer
    );
    const cmdSupportRowEl = this.el('cmd-support-row');
    if (cmdSupportRowEl) {
      cmdSupportRowEl.style.display =
        rank === 'SQUAD_LEADER' && isInAircraft ? 'none' : '';
    }
    const hudRallyBtn = this.el('hud-rally-btn');
    if (hudRallyBtn) {
      if (this.player.rallyPoint && this.player.rallyPoint.timer > 0) {
        hudRallyBtn.textContent = `🟢 RALLY (${Math.ceil(this.player.rallyPoint.timer)}s)`;
        hudRallyBtn.classList.add('active');
      } else if ((this.player.rallyCooldown || 0) > 0) {
        hudRallyBtn.textContent = `🟢 RALLY (${Math.ceil(this.player.rallyCooldown)}s)`;
        hudRallyBtn.classList.remove('active');
      } else {
        hudRallyBtn.innerHTML = '🟢 RALLY <span class="cmd-hk">[5]</span>';
        hudRallyBtn.classList.remove('active');
      }
    }
    const hudBuildBtn = this.el('hud-build-bunker-btn');
    if (hudBuildBtn) {
      hudBuildBtn.style.display = isInAircraft ? 'none' : '';
    }
    const hudBikeBtn = this.el('hud-request-bike-btn');
    if (hudBikeBtn) {
      hudBikeBtn.style.display = isModernEra && !isInAircraft ? '' : 'none';
    }
    const hudLaunchPlaneBtn = this.el('hud-launch-plane-btn');
    if (hudLaunchPlaneBtn) {
      hudLaunchPlaneBtn.style.display = isModernEra ? '' : 'none';
      if (isModernEra) {
        if (this.player.role === 'armor' && !(this.player.activeVehicle && this.player.activeVehicle.isAircraft)) {
          const aType = this.player.preferredArmorOrderType || 'tank';
          const armorTag = aType === 'apc' ? 'IFV $650' : aType === 'aa' ? 'AA $750' : 'TANK $1.1K';
          hudLaunchPlaneBtn.textContent = `🛡️ ${armorTag} [9]`;
          hudLaunchPlaneBtn.classList.remove('active');
        } else {
          const activeAirRole =
            this.player.activeVehicle && this.player.activeVehicle.isAircraft
              ? this.player.activeVehicle.aircraftRole
              : null;
          const role = activeAirRole || this.player.preferredAircraftRole || 'cas';
          const roleTag =
            role === 'wright_flyer'
              ? 'WRIGHT FLYER'
              : role === 'b2_spirit'
              ? 'B-2 SPIRIT'
              : role === 'gunship'
              ? 'AC-130'
              : role === 'fighter'
              ? 'FIGHTER'
              : 'A-10 CAS';
          if (this.player.activeVehicle && this.player.activeVehicle.isAircraft) {
            hudLaunchPlaneBtn.textContent = `✈️ FLYING (${roleTag})`;
            hudLaunchPlaneBtn.classList.add('active');
          } else {
            hudLaunchPlaneBtn.textContent = `✈️ ${roleTag} [9]`;
            hudLaunchPlaneBtn.classList.remove('active');
          }
        }
      }
    }
  },

  isCommandModalVisible() {
    const modal = this.el('command-modal');
    if (
      !modal ||
      !modal.isConnected ||
      modal.classList.contains('hidden') ||
      modal.style.display === 'none'
    ) {
      return false;
    }
    const canvas = this.el('cmd-tactical-map-canvas');
    if (canvas && (canvas.style.display === 'none' || canvas.offsetParent === null)) {
      return false;
    }
    return true;
  },

  _destroyCommandModal(modal, relockPointer = false) {
    if (modal) modal.remove();
    if (this._domCache) {
      this._domCache.delete('command-modal');
      this._domCache.delete('cmd-tactical-map-canvas');
    }
    if (
      relockPointer &&
      typeof document !== 'undefined' &&
      !this.player?.dead &&
      document.body?.requestPointerLock
    ) {
      try {
        const p = document.body.requestPointerLock();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (_) {}
    }
  },

  handleRideShortcut() {
    const deployOpen = this.deployScreenEl && !this.deployScreenEl.classList.contains('hidden');
    const victoryOpen = this.victoryScreenEl && !this.victoryScreenEl.classList.contains('hidden');
    if (deployOpen || victoryOpen || !this.player || this.player.dead) return;

    if (this.isCommandModalVisible()) {
      const modal = this.el('command-modal');
      if (this.mapClickMode !== 'RIDE') {
        this.mapClickMode = 'RIDE';
        if (modal) this.renderCommandModalContent(modal);
      } else {
        this._destroyCommandModal(modal, true);
      }
      return;
    }

    const res = this.player.handleAltRRideAction?.(this);
    this.updateRideStatusHud?.();
    return res;
  },

  openRideMapModal() {
    this.mapClickMode = 'RIDE';
    const existing = this.el('command-modal');
    if (existing && !existing.classList.contains('hidden')) {
      this.renderCommandModalContent(existing);
      return;
    }
    this.toggleCommandModal();
  },

  toggleCommandModal() {
    let modal = this.el('command-modal');
    if (modal) {
      if (modal.classList.contains('hidden') || modal.style.display === 'none') {
        this._destroyCommandModal(modal);
      } else {
        this._destroyCommandModal(modal);
        return;
      }
    }
    if (document.pointerLockElement === document.body) {
      document.exitPointerLock();
    }

    modal = document.createElement('div');
    modal.id = 'command-modal';
    modal.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: 820px; max-width: 96vw; max-height: 92vh; overflow-y: auto;
      background: rgba(10, 16, 24, 0.96);
      border: 2px solid #f1c40f; border-radius: 8px; padding: 14px 18px;
      z-index: 10002; color: #ecf0f1; font-family: 'Rajdhani', 'Segoe UI', sans-serif;
      box-shadow: 0 14px 44px rgba(0,0,0,0.88); pointer-events: auto;
    `;
    document.body.appendChild(modal);
    if (this._domCache) this._domCache.set('command-modal', modal);
    this.renderCommandModalContent(modal);
  },

  renderCommandModalContent(modal) {
    const team = this.player.team || 'US';
    const playerSquadId = this.player.squad || 'ALPHA';
    const aliveAll = this.botManager.bots.filter((b) => !b.dead && b.team === team).length;
    const cmdOrder = this.botManager.commanderOrders && this.botManager.commanderOrders[team];
    const cmdStatus =
      cmdOrder && cmdOrder.timer > 0
        ? `<span style="color:#f1c40f;font-weight:900;">${cmdOrder.action}${
            cmdOrder.flagId ? ' OBJ ' + cmdOrder.flagId : ''
          } (${Math.ceil(cmdOrder.timer)}s)</span>`
        : '<span style="color:#95a5a6;">AUTONOMOUS AI SQUAD LEADERS</span>';

    const squadRowsHtml = SQUAD_DEFS.map((sq) => {
      const sqBots = this.botManager.bots.filter((b) => b.team === team && b.squad === sq.id);
      const aliveCount = sqBots.filter((b) => !b.dead).length;
      const slBot = sqBots.find((b) => b.isSquadLeader) || sqBots[0];
      const sqOrd =
        this.botManager.squadOrders &&
        this.botManager.squadOrders[team] &&
        this.botManager.squadOrders[team][sq.id];
      const garrisonIdx =
        this.botManager.squadGarrisonFlagIndex &&
        this.botManager.squadGarrisonFlagIndex[team] &&
        typeof this.botManager.squadGarrisonFlagIndex[team][sq.id] === 'number'
          ? this.botManager.squadGarrisonFlagIndex[team][sq.id]
          : -1;
      const garrisonFlag = garrisonIdx >= 0 ? this.world.flags[garrisonIdx] : null;
      const ordLabel =
        garrisonFlag
          ? `🏰 GARRISON DEFENSE -> OBJ ${garrisonFlag.id} (STAGE ${garrisonFlag.defenseStage || 0}/4)`
          : sqOrd && sqOrd.timer > 0
          ? `${sqOrd.action}${sqOrd.flagId ? ' OBJ ' + sqOrd.flagId : ''}`
          : slBot && this.world.flags[slBot.targetFlagIndex]
          ? `⚔️ ASSAULT -> OBJ ${this.world.flags[slBot.targetFlagIndex].id}`
          : 'PATROL';
      const isPlayerSq = playerSquadId === sq.id;

      return `
        <div style="display:flex;justify-content:space-between;align-items:center;background:${
          isPlayerSq ? 'rgba(46,204,113,0.12)' : 'rgba(255,255,255,0.04)'
        };border:1px solid ${
          isPlayerSq ? 'rgba(46,204,113,0.45)' : 'rgba(255,255,255,0.1)'
        };border-radius:4px;padding:4px 8px;margin-bottom:4px;font-size:11.5px;">
          <div>
            <strong style="color:${isPlayerSq ? '#2ecc71' : '#74b9ff'}">${sq.id}</strong>
            <span style="color:#95a5a6;font-size:10.5px;margin-left:4px;">(${sq.specialty} • ${aliveCount}/${sqBots.length || 25})</span>
            <span style="margin-left:5px;padding:1px 5px;border-radius:3px;background:rgba(241,196,15,0.15);color:#f1c40f;font-weight:800;font-size:10px;">${ordLabel}</span>
          </div>
          <div style="display:flex;gap:2px;">
            ${['A', 'B', 'C', 'D', 'E']
              .map(
                (fid) =>
                  `<button class="modal-sq-order-btn" data-scope="SQUAD" data-squad="${sq.id}" data-action="OBJECTIVE" data-flag="${fid}" style="background:#2980b9;color:#fff;border:none;border-radius:3px;padding:2px 6px;font-size:10px;font-weight:900;cursor:pointer;">${fid}</button>`
              )
              .join('')}
            <button class="modal-sq-order-btn" data-scope="SQUAD" data-squad="${sq.id}" data-action="FOLLOW" style="background:#27ae60;color:#fff;border:none;border-radius:3px;padding:2px 5px;font-size:10px;font-weight:900;cursor:pointer;">FLW</button>
            <button class="modal-sq-order-btn" data-scope="SQUAD" data-squad="${sq.id}" data-action="HOLD" style="background:#8e44ad;color:#fff;border:none;border-radius:3px;padding:2px 5px;font-size:10px;font-weight:900;cursor:pointer;">HLD</button>
          </div>
        </div>
      `;
    }).join('');

    // Build active player Squad Roster for the right side of the [K] Map & Command View
    const mySqBots = this.botManager.bots.filter(
      (b) => b.team === team && b.squad === playerSquadId
    );
    const selfRankLabel =
      this.player.commandRank === 'COMMANDER'
        ? 'CMD'
        : this.player.commandRank === 'SQUAD_LEADER'
        ? 'SL'
        : 'MBR';
    const rosterEntries = [
      {
        name: `YOU (${selfRankLabel})`,
        role: (this.player.role || 'ENG').toUpperCase().slice(0, 3),
        hp: Math.ceil(this.player.hp),
        downed: this.player.downed,
        dead: this.player.dead
      },
      ...mySqBots.map((b) => ({
        name: `${b.isCommander ? '★' : b.isSquadLeader ? '▲' : ''}${b.name}`,
        role: b.isSquadLeader ? 'SL' : b.role.slice(0, 3),
        hp: Math.ceil(b.hp),
        downed: b.downed,
        dead: b.dead
      }))
    ];
    const rosterHtml = rosterEntries
      .map((r) => {
        const isDown = r.dead || r.downed;
        const stText = r.dead ? 'KIA' : r.downed ? 'BLEEDING' : `${r.hp} HP`;
        const stCol = isDown ? '#ff5252' : '#2ecc71';
        return `<div style="display:flex;justify-content:space-between;padding:2.5px 6px;border-bottom:1px solid rgba(255,255,255,0.06);font-size:11px;">
          <span><strong style="color:#95a5a6">[${r.role}]</strong> <strong style="color:#ecf0f1">${r.name}</strong></span>
          <strong style="color:${stCol}">${stText}</strong>
        </div>`;
      })
      .join('');

    const isModernEra = (this.world?.era || 'modern') === 'modern';
    if (!isModernEra && (this.mapClickMode === 'AIRSTRIKE' || this.mapClickMode === 'RIDE')) {
      this.mapClickMode = 'ORDER';
    }
    const curPattern = this.player.airstrikePattern || 'A10_CAS';
    const isStrikeClickMode = isModernEra && this.mapClickMode === 'AIRSTRIKE';
    const isRideClickMode = isModernEra && this.mapClickMode === 'RIDE';
    const curRideMode = this.player.preferredRideMode || 'heli';
    const hasActiveRide = Boolean(this.player.activeRideVehicle?.rideTask?.active);
    const activeRideDesc = hasActiveRide
      ? `${this.player.activeRideVehicle.rideTask.phase.replace(/_/g, ' ')} → ${
          this.player.activeRideVehicle.rideTask.destLabel
        }`
      : 'NONE ACTIVE';
    const teamFunds = this.vehicleManager?.getTeamFunds ? this.vehicleManager.getTeamFunds(team) : 5000;
    const uavStatusLabel = this.player.uavActive
      ? `📡 UAV ACTIVE (${Math.ceil(this.player.uavTimer)}s • ${
          this.player.uavRevealedBots.filter((b) => !b.dead).length
        } INF / ${
          (this.player.uavRevealedVehicles || []).filter((v) => !v.dead).length
        } ARMOR)`
      : this.player.uavCooldown > 0
      ? `📡 UAV COOLDOWN (${Math.ceil(this.player.uavCooldown)}s)`
      : '📡 LAUNCH MQ-9 UAV DATALINK [U]';
    const strikeStatusLabel = this.player.airstrikeTarget
      ? `💥 STRIKE INBOUND (${this.player.airstrikeTarget.timer.toFixed(1)}s)`
      : this.player.airstrikeCooldown > 0
      ? `💥 STRIKE COOLDOWN (${Math.ceil(this.player.airstrikeCooldown)}s)`
      : '💥 CALL AIRSTRIKE AT CROSSHAIR [J]';

    modal.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.15);padding-bottom:8px;margin-bottom:10px;">
        <div>
          <div style="font-size:17px;font-weight:900;color:#f1c40f;letter-spacing:1.2px;">🗺️ TACTICAL MAP &amp; FORCE COMMANDER / SQUAD VIEW [K]</div>
          <div style="font-size:11px;color:#bdc3c7;">Left-click map to ${
            isStrikeClickMode
              ? '<strong style="color:#ff6b6b">CALL AIRSTRIKE AT EXACT MAP COORDS</strong>'
              : 'issue Squad Orders'
          }, or <strong>Right-Click anywhere on the map</strong> to drop an Airstrike immediately!</div>
        </div>
        <button id="cmd-modal-close" style="background:#c0392b;color:#fff;border:none;border-radius:4px;padding:5px 12px;font-weight:900;cursor:pointer;">CLOSE [K]</button>
      </div>

      <div style="position:relative;background:#121c14;border:1.5px solid ${
        isRideClickMode
          ? '#00d2d3'
          : isStrikeClickMode
          ? '#e74c3c'
          : 'rgba(241,196,15,0.45)'
      };border-radius:6px;padding:6px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;font-size:11px;flex-wrap:wrap;gap:4px;">
          <span style="color:${
            isRideClickMode ? '#7ef9ff' : isStrikeClickMode ? '#ff7675' : '#f1c40f'
          };font-weight:900;">${
            isRideClickMode
              ? `🚁 RIDE LZ MODE (${curRideMode.toUpperCase()}) — CLICK ANY SKYSCRAPER ROOF OR POINT ON MAP TO REQUEST PICKUP & DROP-OFF!`
              : isStrikeClickMode
              ? '💥 AIRSTRIKE TARGETING MODE — CLICK ANYWHERE ON MAP TO CALL STRIKE AT THOSE EXACT COORDINATES!'
              : `📍 FRUGIS RIVER VALLEY — CLICK OBJECTIVE A–E TO ORDER (${
                  this.player.commandScope === 'ALL' ? 'ALL 5 SQUADS' : playerSquadId + ' SQUAD'
                }) OR USE [🚁 CLICK: RIDE LZ]`
          }</span>
          <div style="display:flex;gap:4px;flex-wrap:wrap;">
            <button id="cmd-map-mode-order" style="background:${
              !isStrikeClickMode && !isRideClickMode ? '#27ae60' : 'rgba(255,255,255,0.12)'
            };color:#fff;border:1px solid ${
              !isStrikeClickMode && !isRideClickMode ? '#2ecc71' : 'rgba(255,255,255,0.2)'
            };border-radius:3px;padding:2px 8px;font-size:10.5px;font-weight:900;cursor:pointer;">📍 CLICK: ORDER SQUADS</button>
            <button id="cmd-map-mode-ride" style="display:${isModernEra ? '' : 'none'};background:${
              isRideClickMode ? '#0097a7' : 'rgba(0,210,211,0.2)'
            };color:#fff;border:1px solid #00d2d3;border-radius:3px;padding:2px 8px;font-size:10.5px;font-weight:900;cursor:pointer;">🚁 CLICK: RIDE LZ</button>
            <button id="cmd-map-mode-strike" style="display:${isModernEra ? '' : 'none'};background:${
              isStrikeClickMode ? '#c0392b' : 'rgba(231,76,60,0.22)'
            };color:#fff;border:1px solid #e74c3c;border-radius:3px;padding:2px 8px;font-size:10.5px;font-weight:900;cursor:pointer;">💥 CLICK: CALL AIRSTRIKE</button>
            <button id="cmd-map-scope-all" style="background:${
              this.player.commandScope === 'ALL' ? '#f39c12' : 'rgba(255,255,255,0.12)'
            };color:${
              this.player.commandScope === 'ALL' ? '#000' : '#fff'
            };border:none;border-radius:3px;padding:2px 8px;font-size:10.5px;font-weight:900;cursor:pointer;">SCOPE: ALL 5 SQUADS</button>
            <button id="cmd-map-scope-sq" style="background:${
              this.player.commandScope === 'SQUAD' ? '#2ecc71' : 'rgba(255,255,255,0.12)'
            };color:${
              this.player.commandScope === 'SQUAD' ? '#000' : '#fff'
            };border:none;border-radius:3px;padding:2px 8px;font-size:10.5px;font-weight:900;cursor:pointer;">SCOPE: ${playerSquadId}</button>
          </div>
        </div>
        <canvas id="cmd-tactical-map-canvas" width="760" height="205" style="width:100%;height:205px;display:block;border-radius:4px;cursor:crosshair;"></canvas>
      </div>

      <!-- PERSONAL RIDE, SNIPER ROOFTOP AIRLIFT & ARMORED TAXI DISPATCH (ALL RANKS & CLASSES!) -->
      <div style="display:${
        isModernEra ? '' : 'none'
      };background:rgba(8,30,38,0.92);border:1.5px solid rgba(0,210,211,0.6);border-left:4px solid #00d2d3;border-radius:5px;padding:8px 10px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:6px;">
          <div>
            <span style="font-size:12.5px;font-weight:900;color:#7ef9ff;">🚁 TACTICAL RIDE &amp; SNIPER ROOFTOP AIRLIFT [${getShortOrderModifierLabel()}+R] (1ST [${getShortOrderModifierLabel()}+R] = PICK UP HERE • 2ND [${getShortOrderModifierLabel()}+R] = DROP-OFF):</span>
            <span style="font-size:10.5px;color:#ffeaa7;margin-left:6px;font-weight:800;">STATUS: ${activeRideDesc}</span>
          </div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;">
            ${[
              { id: 'heli', lbl: '🚁 Heli Airlift (Rooftops!)' },
              { id: 'apc', lbl: '🛡️ Armored APC (8×8)' },
              { id: 'truck', lbl: '🚚 6×6 Ammo Truck' },
              { id: 'humvee', lbl: '🚙 Fast Humvee' }
            ]
              .map(
                (m) =>
                  `<button type="button" class="modal-ride-mode-btn" data-ride-mode="${
                    m.id
                  }" style="background:${
                    curRideMode === m.id ? '#00cec9' : 'rgba(255,255,255,0.1)'
                  };color:${curRideMode === m.id ? '#08141c' : '#ecf0f1'};border:1px solid ${
                    curRideMode === m.id ? '#81ecec' : 'rgba(255,255,255,0.25)'
                  };border-radius:3px;padding:3px 8px;font-size:10.5px;font-weight:900;cursor:pointer;">${
                    m.lbl
                  }</button>`
              )
              .join('')}
          </div>
        </div>
        <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;">
          <span style="font-size:10.5px;color:#bdc3c7;font-weight:900;">DESIGNATE DROP-OFF (OR CLICK ANYWHERE ON MAP ABOVE):</span>
          ${
            !hasActiveRide
              ? `<button type="button" id="modal-ride-pickup-only-btn" style="background:rgba(46,204,113,0.28);color:#7bed9f;border:1px solid #2ecc71;border-radius:4px;padding:4px 8px;font-size:10.5px;font-weight:900;cursor:pointer;" title="Call pickup to your exact current position first — choose drop-off later with [${getShortOrderModifierLabel()}+R]!">📍 PICK UP HERE FIRST</button>`
              : ''
          }
          ${
            this.player._lastRideCrosshairPoint
              ? `<button type="button" id="modal-ride-aim-btn" style="background:rgba(241,196,15,0.26);color:#ffeaa7;border:1px solid #f1c40f;border-radius:4px;padding:4px 8px;font-size:10.5px;font-weight:900;cursor:pointer;" title="Drop off at the building roof or terrain spot your crosshair/scope was aiming at!">🎯 WHERE I WAS AIMING</button>`
              : ''
          }
          <button type="button" class="modal-ride-dest-btn" data-dest="OBJ_C_ROOF" style="background:linear-gradient(135deg,#0097a7,#00cec9);color:#061218;border:1px solid #81ecec;border-radius:4px;padding:4px 9px;font-size:11px;font-weight:900;cursor:pointer;" title="Airlift directly onto the tallest Downtown Objective C Skyscraper Helipad Roof!">🏢 TOP OF OBJ C SKYSCRAPER</button>
          ${['A', 'B', 'C', 'D', 'E']
            .map(
              (fid) =>
                `<button type="button" class="modal-ride-dest-btn" data-dest="${fid}" style="background:rgba(0,210,211,0.16);color:#7ef9ff;border:1px solid rgba(0,210,211,0.5);border-radius:4px;padding:4px 8px;font-size:10.5px;font-weight:900;cursor:pointer;">🚩 OBJ ${fid}</button>`
            )
            .join('')}
          <button type="button" class="modal-ride-dest-btn" data-dest="BASE" style="background:rgba(52,152,219,0.22);color:#74b9ff;border:1px solid #3498db;border-radius:4px;padding:4px 8px;font-size:10.5px;font-weight:900;cursor:pointer;">🏠 MAIN BASE</button>
          ${
            hasActiveRide
              ? `<button type="button" id="modal-ride-cancel-btn" style="background:rgba(231,76,60,0.25);color:#ff7675;border:1px solid #e74c3c;border-radius:4px;padding:4px 8px;font-size:10.5px;font-weight:900;cursor:pointer;">❌ CANCEL RIDE</button>`
              : ''
          }
        </div>
      </div>

      <div style="background:rgba(241,196,15,0.1);border:1px solid rgba(241,196,15,0.45);border-radius:5px;padding:8px 10px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <span style="font-size:12.5px;font-weight:900;color:#f1c40f;">⭐ FORCE COMMANDER ORDER — ALL 5 SQUADS (${aliveAll} FRIENDLY NPCs + ARMOR)</span>
          <span style="font-size:11px;">STATUS: ${cmdStatus}</span>
        </div>
        <div style="display:flex;gap:5px;flex-wrap:wrap;">
          ${['A', 'B', 'C', 'D', 'E']
            .map((fid) => {
              const flg = this.world.flags.find((f) => f.id === fid);
              const ownerTag = flg ? flg.owner : 'NEUTRAL';
              return `<button class="modal-sq-order-btn" data-scope="ALL" data-action="OBJECTIVE" data-flag="${fid}" style="flex:1;background:#d35400;color:#fff;border:1px solid #f1c40f;border-radius:4px;padding:5px 6px;font-size:11px;font-weight:900;cursor:pointer;">ALL -> OBJ ${fid} (${ownerTag})</button>`;
            })
            .join('')}
          <button class="modal-sq-order-btn" data-scope="ALL" data-action="CHARGE" style="background:#c0392b;color:#fff;border:1px solid #ff7675;border-radius:4px;padding:5px 9px;font-size:10.5px;font-weight:900;cursor:pointer;" title="Mount &amp; Blade All-Out Charge [${getShortOrderModifierLabel()}+C]">⚔️ ALL CHARGE</button>
          <button class="modal-sq-order-btn" data-scope="ALL" data-action="HOLD" style="background:#8e44ad;color:#fff;border:none;border-radius:4px;padding:5px 9px;font-size:10.5px;font-weight:900;cursor:pointer;" title="Defend / Shield Wall [${getShortOrderModifierLabel()}+H]">🛡️ ALL DEFEND</button>
          <button class="modal-sq-order-btn" data-scope="ALL" data-action="RETREAT" style="background:#2980b9;color:#fff;border:none;border-radius:4px;padding:5px 9px;font-size:10.5px;font-weight:900;cursor:pointer;" title="Tactical Retreat / Fall Back [${getShortOrderModifierLabel()}+B]">🏳️ ALL RETREAT</button>
          <button class="modal-sq-order-btn" data-scope="ALL" data-action="FOLLOW" style="background:#27ae60;color:#fff;border:none;border-radius:4px;padding:5px 9px;font-size:10.5px;font-weight:900;cursor:pointer;">🏃 ALL FOLLOW</button>
          <button class="modal-sq-order-btn" data-scope="ALL" data-action="GARRISON" style="background:${
            this.botManager?.garrisonDoctrineEnabled?.[team] ? '#16a085' : 'rgba(255,255,255,0.12)'
          };color:#fff;border:1px solid ${
            this.botManager?.garrisonDoctrineEnabled?.[team] ? '#1abc9c' : 'rgba(255,255,255,0.28)'
          };border-radius:4px;padding:5px 9px;font-size:10.5px;font-weight:900;cursor:pointer;" title="Click or press [${getShortOrderModifierLabel()}+G] to toggle Garrison Defense Doctrine ON/OFF (leaves 1 dedicated Squad at each captured Forward Base when ON)">🏰 GARRISON BASES: ${
            this.botManager?.garrisonDoctrineEnabled?.[team] ? 'ON' : 'OFF'
          } [${getShortOrderModifierLabel()}+G]</button>
          <button class="modal-sq-order-btn" data-scope="ALL" data-action="AUTO" style="background:rgba(255,255,255,0.14);color:#fff;border:none;border-radius:4px;padding:5px 9px;font-size:10.5px;font-weight:900;cursor:pointer;">RESET TO AI</button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1.45fr 1fr;gap:10px;margin-bottom:10px;">
        <div>
          <div style="font-size:11px;font-weight:900;color:#2ecc71;margin-bottom:4px;letter-spacing:0.6px;">▲ INDIVIDUAL SQUAD ORDERS (ALPHA – FALCON):</div>
          ${squadRowsHtml}
        </div>
        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(46,204,113,0.35);border-radius:5px;padding:7px 9px;">
          <div style="font-size:11px;font-weight:900;color:#2ecc71;margin-bottom:5px;letter-spacing:0.6px;">👥 YOUR SQUAD ROSTER (${playerSquadId} SQUAD):</div>
          ${rosterHtml}
        </div>
      </div>

      <div style="display:${isModernEra ? '' : 'none'};background:rgba(192,57,43,0.12);border:1px solid rgba(231,76,60,0.45);border-radius:5px;padding:8px 10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:6px;">
          <span style="font-size:12px;font-weight:900;color:#ff7675;">✈️ INFANTRY SQUAD CAS REQUEST &amp; COMMANDER FIRE SUPPORT:</span>
          <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;">
            <span style="font-size:10.5px;color:#bdc3c7;font-weight:800;">CAS / STRIKE [Shift+J]:</span>
            <button class="modal-strike-pat-btn" data-pattern="A10_CAS" style="background:${
              curPattern === 'A10_CAS' ? '#e67e22' : 'rgba(255,255,255,0.12)'
            };color:#fff;border:1px solid #f39c12;border-radius:3px;padding:2px 7px;font-size:10px;font-weight:900;cursor:pointer;">🐗 A-10 30MM BRRRT CAS</button>
            <button class="modal-strike-pat-btn" data-pattern="CARPET" style="background:${
              curPattern === 'CARPET' ? '#e67e22' : 'rgba(255,255,255,0.12)'
            };color:#fff;border:1px solid #f39c12;border-radius:3px;padding:2px 7px;font-size:10px;font-weight:900;cursor:pointer;">✈️ CARPET RUN (9x JDAM)</button>
            <button class="modal-strike-pat-btn" data-pattern="BUNKER_BUSTER" style="background:${
              curPattern === 'BUNKER_BUSTER' ? '#e67e22' : 'rgba(255,255,255,0.12)'
            };color:#fff;border:1px solid #f39c12;border-radius:3px;padding:2px 7px;font-size:10px;font-weight:900;cursor:pointer;">🎯 GBU-28 BUNKER BUSTER</button>
            <button class="modal-strike-pat-btn" data-pattern="ARTILLERY" style="background:${
              curPattern === 'ARTILLERY' ? '#e67e22' : 'rgba(255,255,255,0.12)'
            };color:#fff;border:1px solid #f39c12;border-radius:3px;padding:2px 7px;font-size:10px;font-weight:900;cursor:pointer;">🌧️ 155MM ARTILLERY</button>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;">
          <div style="display:flex;gap:5px;flex-wrap:wrap;">
            <button id="cmd-asset-uav" style="background:#2980b9;color:#fff;border:1px solid #74b9ff;border-radius:4px;padding:5px 10px;font-size:11px;font-weight:900;cursor:pointer;">${uavStatusLabel}</button>
            <button id="cmd-asset-airstrike" style="background:#c0392b;color:#fff;border:1px solid #ff7675;border-radius:4px;padding:5px 10px;font-size:11px;font-weight:900;cursor:pointer;">${strikeStatusLabel}</button>
            <button id="cmd-asset-rally" style="background:#27ae60;color:#fff;border:none;border-radius:4px;padding:5px 10px;font-size:11px;font-weight:900;cursor:pointer;">🟢 RALLY [5]</button>
          </div>
          <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;">
            <span style="font-size:10px;color:#fab1a0;font-weight:900;">1-CLICK CAS OBJ:</span>
            ${['A', 'B', 'C', 'D', 'E']
              .map(
                (fid) =>
                  `<button class="modal-strike-flag-btn" data-flag="${fid}" style="background:#922b21;color:#fff;border:1px solid #ff7675;border-radius:3px;padding:4px 7px;font-size:10.5px;font-weight:900;cursor:pointer;">💥 ${fid}</button>`
              )
              .join('')}
          </div>
        </div>
      </div>

      <!-- PILOT AIRCRAFT ORDERING, ARMOR CREW TANK REQUISITION & ENGINEER EMPLACEMENTS -->
      <div style="background:rgba(22,38,52,0.92);border:1.5px solid rgba(72,219,251,0.5);border-radius:5px;padding:8px 10px;margin-top:8px;">
        <div style="display:${isModernEra ? 'flex' : 'none'};justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:6px;">
          <span style="font-size:11.5px;font-weight:900;color:#48dbfb;">✈️ PILOT PLANE ORDER &amp; 🛡️ ARMOR CREW REQUISITION (💰 ${team} FUNDS: $${teamFunds.toLocaleString()}):</span>
          <div style="display:flex;gap:4px;flex-wrap:wrap;">
            <button type="button" class="modal-air-sortie-btn" data-role="cas" style="background:#2980b9;color:#fff;border:1px solid #48dbfb;border-radius:3px;padding:3px 7px;font-size:10px;font-weight:900;cursor:pointer;" title="Combat Pilot: Order A-10C / Su-25 CAS ($800)">✈️ ORDER A-10 CAS ($800)</button>
            <button type="button" class="modal-air-sortie-btn" data-role="fighter" style="background:#8e44ad;color:#fff;border:1px solid #d6a2e8;border-radius:3px;padding:3px 7px;font-size:10px;font-weight:900;cursor:pointer;" title="Combat Pilot: Order F-15EX / Su-57 Fighter ($900)">🎯 ORDER FIGHTER ($900)</button>
            <button type="button" class="modal-air-sortie-btn" data-role="gunship" style="background:#d35400;color:#fff;border:1px solid #f1c40f;border-radius:3px;padding:3px 7px;font-size:10px;font-weight:900;cursor:pointer;" title="Combat Pilot: Order AC-130J Gunship ($1,200)">🛸 ORDER AC-130J ($1.2K)</button>
            <button type="button" class="modal-air-sortie-btn" data-role="b2_spirit" style="background:#0a3d62;color:#00d2d3;border:1px solid #00d2d3;border-radius:3px;padding:3px 7px;font-size:10px;font-weight:900;cursor:pointer;" title="Combat Pilot: Order B-2A Spirit Bomber ($2,000 • 25 Kills)">🦇 B-2 ($2K)</button>
            <button type="button" class="modal-armor-req-btn" data-armor="tank" style="background:#b7791f;color:#fff;border:1px solid #f1c40f;border-radius:3px;padding:3px 7px;font-size:10px;font-weight:900;cursor:pointer;" title="Armor Crewman: Deliver MBT 10m Ahead ($1,100)">🛡️ REQ TANK ($1.1K)</button>
            <button type="button" class="modal-armor-req-btn" data-armor="apc" style="background:#16a085;color:#fff;border:1px solid #1abc9c;border-radius:3px;padding:3px 7px;font-size:10px;font-weight:900;cursor:pointer;" title="Armor Crewman: Deliver 8x8 IFV 10m Ahead ($650)">🛡️ REQ IFV ($650)</button>
            <button type="button" class="modal-armor-req-btn" data-armor="aa" style="background:#c0392b;color:#fff;border:1px solid #ff7675;border-radius:3px;padding:3px 7px;font-size:10px;font-weight:900;cursor:pointer;" title="Armor Crewman: Deliver SPAAG AA 10m Ahead ($750)">📡 REQ AA ($750)</button>
          </div>
        </div>
        <div style="font-size:10.5px;font-weight:900;color:#7bed9f;margin-bottom:4px;">🛠️ ENGINEER FORTIFICATIONS &amp; EMPLACEMENTS [B / T / 8] (-25% COST FOR ENGINEERS):</div>
        <div style="display:flex;gap:5px;flex-wrap:wrap;">
          <button type="button" class="modal-build-emplace-btn" data-kind="COVERED_BUNKER" style="flex:1;background:rgba(39,174,96,0.28);color:#7bed9f;border:1px solid #2ecc71;border-radius:4px;padding:5px 6px;font-size:10px;font-weight:900;cursor:pointer;">🛡️ COVERED BUNKER ($350)</button>
          <button type="button" class="modal-build-emplace-btn" data-kind="HMG_NEST" style="flex:1;background:rgba(243,156,18,0.25);color:#f1c40f;border:1px solid #f39c12;border-radius:4px;padding:5px 6px;font-size:10px;font-weight:900;cursor:pointer;">🔫 .50 CAL HMG ($450)</button>
          <button type="button" class="modal-build-emplace-btn" data-kind="MORTAR_PIT" style="flex:1;background:rgba(230,126,34,0.28);color:#ff9f43;border:1px solid #e67e22;border-radius:4px;padding:5px 6px;font-size:10px;font-weight:900;cursor:pointer;">🎯 81MM MORTAR ($600)</button>
          <button type="button" class="modal-build-emplace-btn" data-kind="AA_EMPLACE" style="flex:1;background:rgba(231,76,60,0.28);color:#ff7675;border:1px solid #e74c3c;border-radius:4px;padding:5px 6px;font-size:10px;font-weight:900;cursor:pointer;">📡 ZU-23-2 AA ($650)</button>
          <button type="button" class="modal-build-emplace-btn" data-kind="BUNKER" style="flex:1;background:rgba(52,152,219,0.25);color:#74b9ff;border:1px solid #3498db;border-radius:4px;padding:5px 6px;font-size:10px;font-weight:900;cursor:pointer;">🏰 CMD BUNKER ($1K)</button>
          <button type="button" class="modal-build-emplace-btn" data-kind="HOUSE" style="flex:1;background:rgba(155,89,182,0.25);color:#d6a2e8;border:1px solid #9b59b6;border-radius:4px;padding:5px 6px;font-size:10px;font-weight:900;cursor:pointer;">🏠 2F HOUSE ($1K)</button>
        </div>
      </div>
    `;

    const closeBtn = modal.querySelector('#cmd-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', () => this._destroyCommandModal(modal));

    const mapModeOrderBtn = modal.querySelector('#cmd-map-mode-order');
    if (mapModeOrderBtn) {
      mapModeOrderBtn.addEventListener('click', () => {
        this.mapClickMode = 'ORDER';
        this.renderCommandModalContent(modal);
      });
    }
    const mapModeStrikeBtn = modal.querySelector('#cmd-map-mode-strike');
    if (mapModeStrikeBtn) {
      mapModeStrikeBtn.addEventListener('click', () => {
        this.mapClickMode = 'AIRSTRIKE';
        this.renderCommandModalContent(modal);
      });
    }
    const mapModeRideBtn = modal.querySelector('#cmd-map-mode-ride');
    if (mapModeRideBtn) {
      mapModeRideBtn.addEventListener('click', () => {
        this.mapClickMode = 'RIDE';
        this.renderCommandModalContent(modal);
      });
    }

    modal.querySelectorAll('.modal-ride-mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextMode = btn.dataset.rideMode || 'heli';
        this.player.preferredRideMode = nextMode;
        this.mapClickMode = 'RIDE';
        // If an unboarded pickup is already inbound with destPending, swap vehicle mode live!
        const curRide = this.player.activeRideVehicle;
        if (
          curRide &&
          curRide !== this.player.activeVehicle &&
          curRide.rideTask?.active &&
          curRide.rideTask.transportMode !== nextMode
        ) {
          this.vehicleManager?.requestPlayerRide?.(
            this.player,
            curRide.rideTask.destPending || !curRide.rideTask.destPos
              ? { transportMode: nextMode, pickupOnly: true }
              : {
                  transportMode: nextMode,
                  destX: curRide.rideTask.destPos.x,
                  destZ: curRide.rideTask.destPos.z,
                  preferRoof: nextMode === 'heli',
                  customLabel: curRide.rideTask.destLabel
                }
          );
          this.updateRideStatusHud?.();
        }
        this.renderCommandModalContent(modal);
      });
    });

    const pickupOnlyBtn = modal.querySelector('#modal-ride-pickup-only-btn');
    if (pickupOnlyBtn) {
      pickupOnlyBtn.addEventListener('click', () => {
        this.player.requestQuickTacticalRide?.({ pickupOnly: true });
        this.updateRideStatusHud?.();
        this._destroyCommandModal(modal, true);
      });
    }

    const rideAimBtn = modal.querySelector('#modal-ride-aim-btn');
    if (rideAimBtn) {
      rideAimBtn.addEventListener('click', () => {
        const aimPt = this.player._lastRideCrosshairPoint;
        if (aimPt) {
          const mode = this.player.preferredRideMode || 'heli';
          this.vehicleManager?.requestPlayerRide?.(this.player, {
            transportMode: mode,
            destX: aimPt.x,
            destZ: aimPt.z,
            preferRoof: mode === 'heli'
          });
          this.updateRideStatusHud?.();
        }
        this._destroyCommandModal(modal, true);
      });
    }

    modal.querySelectorAll('.modal-ride-dest-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const destKey = btn.dataset.dest || 'OBJ_C_ROOF';
        const chosenMode =
          destKey === 'OBJ_C_ROOF' ? 'heli' : this.player.preferredRideMode || 'heli';
        this.vehicleManager?.requestPlayerRide?.(this.player, {
          transportMode: chosenMode,
          destKey,
          preferRoof: chosenMode === 'heli'
        });
        this.updateRideStatusHud?.();
        this._destroyCommandModal(modal, true);
      });
    });

    const cancelRideBtn = modal.querySelector('#modal-ride-cancel-btn');
    if (cancelRideBtn) {
      cancelRideBtn.addEventListener('click', () => {
        this.vehicleManager?.cancelPlayerRide?.(this.player);
        this.addXpNotification?.(0, '❌ TACTICAL RIDE CANCELLED.');
        this.renderCommandModalContent(modal);
      });
    }

    const mapScopeAllBtn = modal.querySelector('#cmd-map-scope-all');
    if (mapScopeAllBtn) {
      mapScopeAllBtn.addEventListener('click', () => {
        this.setCommandScope('ALL', { promoteIfMember: true });
        this.renderCommandModalContent(modal);
      });
    }
    const mapScopeSqBtn = modal.querySelector('#cmd-map-scope-sq');
    if (mapScopeSqBtn) {
      mapScopeSqBtn.addEventListener('click', () => {
        this.setCommandScope('SQUAD');
        this.renderCommandModalContent(modal);
      });
    }

    modal.querySelectorAll('.modal-strike-pat-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pat = btn.dataset.pattern || 'CARPET';
        this.player.airstrikePattern = pat;
        this.updateCommandOrderHud();
        this.renderCommandModalContent(modal);
      });
    });

    modal.querySelectorAll('.modal-strike-flag-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const fid = btn.dataset.flag;
        const flg = this.world.flags.find((f) => f.id === fid);
        if (flg) {
          this.player.callAirstrike(new THREE.Vector3(flg.pos.x, 0, flg.pos.z));
          this.updateCommandOrderHud();
          this.renderCommandModalContent(modal);
        }
      });
    });

    const mapCanvas = modal.querySelector('#cmd-tactical-map-canvas');
    if (mapCanvas) {
      if (this._domCache) this._domCache.set('cmd-tactical-map-canvas', mapCanvas);
      if (
        modal.isConnected &&
        !modal.classList.contains('hidden') &&
        modal.style.display !== 'none' &&
        mapCanvas.offsetParent !== null
      ) {
        this.drawCommandTacticalMap(mapCanvas);
      }
      const triggerMapAirstrikeAt = (e) => {
        const rect = mapCanvas.getBoundingClientRect();
        const cx = ((e.clientX - rect.left) / rect.width) * mapCanvas.width;
        const cy = ((e.clientY - rect.top) / rect.height) * mapCanvas.height;
        const wx = (cx / mapCanvas.width - 0.5) * 3480;
        const wz = (cy / mapCanvas.height - 0.5) * 2120;
        this.player.callAirstrike(new THREE.Vector3(wx, 0, wz));
        this.updateCommandOrderHud();
        this.renderCommandModalContent(modal);
      };
      mapCanvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        triggerMapAirstrikeAt(e);
      });
      mapCanvas.addEventListener('click', (e) => {
        if (this.mapClickMode === 'AIRSTRIKE') {
          triggerMapAirstrikeAt(e);
          return;
        }
        const rect = mapCanvas.getBoundingClientRect();
        const cx = ((e.clientX - rect.left) / rect.width) * mapCanvas.width;
        const cy = ((e.clientY - rect.top) / rect.height) * mapCanvas.height;
        const wx = (cx / mapCanvas.width - 0.5) * 3480;
        const wz = (cy / mapCanvas.height - 0.5) * 2120;

        if (this.mapClickMode === 'RIDE') {
          const mode = this.player.preferredRideMode || 'heli';
          this.vehicleManager?.requestPlayerRide?.(this.player, {
            transportMode: mode,
            destX: wx,
            destZ: wz,
            preferRoof: mode === 'heli'
          });
          this.updateRideStatusHud?.();
          this._destroyCommandModal(modal, true);
          return;
        }

        let nearestFlag = null;
        let bestDist = Infinity;
        for (const f of this.world.flags) {
          const d = Math.hypot(wx - f.pos.x, wz - f.pos.z);
          if (d < bestDist) {
            bestDist = d;
            nearestFlag = f;
          }
        }
        if (nearestFlag) {
          this.issueHudStrategicOrder({
            scope: this.player.commandScope || 'ALL',
            targetSquad: this.player.squad || 'ALPHA',
            action: 'OBJECTIVE',
            flagId: nearestFlag.id
          });
        }
      });
    }

    modal.querySelectorAll('.modal-sq-order-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const scope = btn.dataset.scope || 'ALL';
        const targetSquad = btn.dataset.squad || this.player.squad || 'ALPHA';
        const action = btn.dataset.action || 'OBJECTIVE';
        const flagId = btn.dataset.flag || null;
        this.setCommandScope(scope);
        this.issueHudStrategicOrder({ scope, targetSquad, action, flagId });
      });
    });

    const uavBtn = modal.querySelector('#cmd-asset-uav');
    if (uavBtn) {
      uavBtn.addEventListener('click', () => {
        this.player.triggerCommanderUAV();
        this._destroyCommandModal(modal);
      });
    }
    const airBtn = modal.querySelector('#cmd-asset-airstrike');
    if (airBtn) {
      airBtn.addEventListener('click', () => {
        this.player.callCommanderAirstrike();
        this._destroyCommandModal(modal);
      });
    }
    const rallyBtn = modal.querySelector('#cmd-asset-rally');
    if (rallyBtn) {
      rallyBtn.addEventListener('click', () => {
        this.player.placeRallyPoint();
        this._destroyCommandModal(modal);
      });
    }
    modal.querySelectorAll('.modal-build-emplace-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const kind = btn.dataset.kind || 'COVERED_BUNKER';
        if (this.player && typeof this.player.buildPaidHouseOrBunker === 'function') {
          this.player.buildPaidHouseOrBunker(kind);
          this.updateCashAndGunsmithHud?.();
          this._destroyCommandModal(modal);
        }
      });
    });
    modal.querySelectorAll('.modal-air-sortie-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const role = btn.dataset.role || 'cas';
        if (this.player && typeof this.player.launchAircraftSortie === 'function') {
          this.player.launchAircraftSortie(role);
          this.updateCommandOrderHud?.();
          this._destroyCommandModal(modal);
        }
      });
    });
    modal.querySelectorAll('.modal-armor-req-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const armorType = btn.dataset.armor || 'tank';
        if (this.player && typeof this.player.requestArmorDelivery === 'function') {
          this.player.requestArmorDelivery(armorType);
          this.updateCommandOrderHud?.();
          this._destroyCommandModal(modal);
        }
      });
    });
  },

  // ─── COMMANDER & SQUAD TACTICAL ORDER WHEEL / COMMO ROSE [Y] ─────────────
  openCommoRose() {
    let el = this.el('commo-rose');
    if (el) el.remove();

    el = document.createElement('div');
    el.id = 'commo-rose';
    el.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: 360px; height: 360px; border-radius: 50%;
      background: radial-gradient(circle, rgba(10,16,24,0.92) 32%, rgba(10,16,24,0.68) 72%, transparent 100%);
      border: 2px solid rgba(241,196,15,0.45);
      z-index: 9999; pointer-events: auto;
      font-family: 'Rajdhani', 'Segoe UI', sans-serif;
    `;

    const perTeam = (this.botManager && this.botManager.currentBotsPerTeam) || 125;
    const perSquad = Math.round(perTeam / 5);
    const scopeStr =
      this.player.commandScope === 'ALL'
        ? `★ ALL 5 SQUADS (${perTeam})`
        : `▲ ${this.player.squad || 'ALPHA'} SQUAD (${perSquad})`;

    const commands = [
      { id: 'atk_a', label: '[1] ⚔️ ATTACK OBJ A', angle: 0, order: { action: 'OBJECTIVE', flagId: 'A' } },
      { id: 'atk_b', label: '[2] ⚔️ ATTACK OBJ B', angle: 45, order: { action: 'OBJECTIVE', flagId: 'B' } },
      { id: 'atk_c', label: '[3] ⚔️ ATTACK OBJ C', angle: 90, order: { action: 'OBJECTIVE', flagId: 'C' } },
      { id: 'atk_d', label: '[4] ⚔️ ATTACK OBJ D', angle: 135, order: { action: 'OBJECTIVE', flagId: 'D' } },
      { id: 'atk_e', label: '[5] ⚔️ ATTACK OBJ E', angle: 180, order: { action: 'OBJECTIVE', flagId: 'E' } },
      { id: 'follow_me', label: '[6] 🏃 FOLLOW ME', angle: 225, order: { action: 'FOLLOW' } },
      { id: 'hold_position', label: '[7] 🛡️ DEFEND HERE', angle: 270, order: { action: 'HOLD' } },
      { id: 'toggle_scope', label: '[8] 🔄 SCOPE: ALL / SQUAD', angle: 315, order: { action: 'TOGGLE_SCOPE' } }
    ];

    commands.forEach((cmd) => {
      const btn = document.createElement('div');
      const rad = ((cmd.angle - 90) * Math.PI) / 180;
      const dist = 128;
      const bx = Math.cos(rad) * dist;
      const by = Math.sin(rad) * dist;
      btn.className = 'commo-rose-btn';
      btn.dataset.cmd = cmd.id;
      btn.textContent = cmd.label;
      btn.style.cssText = `
        position: absolute; top: 50%; left: 50%;
        transform: translate(calc(-50% + ${bx}px), calc(-50% + ${by}px));
        padding: 6px 11px; font-size: 11.5px; font-weight: 900;
        color: #ecf0f1; background: rgba(24, 38, 52, 0.94);
        border: 1.5px solid rgba(241,196,15,0.45); border-radius: 4px;
        cursor: pointer; letter-spacing: 0.8px; text-align: center;
        white-space: nowrap; user-select: none;
        box-shadow: 0 3px 10px rgba(0,0,0,0.65);
        transition: background 0.1s, transform 0.1s;
      `;
      btn.addEventListener('mouseenter', () => {
        btn.style.background = '#f39c12';
        btn.style.borderColor = '#f1c40f';
        btn.style.color = '#111';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'rgba(24, 38, 52, 0.94)';
        btn.style.borderColor = 'rgba(241,196,15,0.45)';
        btn.style.color = '#ecf0f1';
      });
      btn.addEventListener('click', () => {
        if (cmd.order.action === 'TOGGLE_SCOPE') {
          this.setCommandScope(this.player.commandScope === 'ALL' ? 'SQUAD' : 'ALL');
          this.openCommoRose();
          return;
        }
        this.issueHudStrategicOrder(cmd.order);
        this.closeCommoRose();
      });
      el.appendChild(btn);
    });

    // Center label showing active scope & key instructions + Formation Spacing buttons [- / +]
    const center = document.createElement('div');
    center.style.cssText = `
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      font-size: 10.5px; color: #f1c40f; letter-spacing: 1px; font-weight: 900;
      text-align: center; line-height: 1.35; pointer-events: auto;
    `;
    center.innerHTML = `
      <div style="color:#fff;font-size:11.5px;pointer-events:none;">COMMAND WHEEL [Y]</div>
      <div style="color:#2ecc71;pointer-events:none;">${scopeStr}</div>
      <div style="color:#95a5a6;font-size:9px;margin-bottom:4px;pointer-events:none;">PRESS [1-8] OR [- / +]</div>
      <div style="display:flex;gap:4px;justify-content:center;margin-bottom:4px;">
        <button id="wheel-spacing-close" type="button" style="background:rgba(41,128,185,0.85);color:#fff;border:1px solid #3498db;border-radius:3px;padding:3px 6px;font-size:9.5px;font-weight:900;cursor:pointer;">[-] CLOSE</button>
        <button id="wheel-spacing-fan" type="button" style="background:rgba(39,174,96,0.85);color:#fff;border:1px solid #2ecc71;border-radius:3px;padding:3px 6px;font-size:9.5px;font-weight:900;cursor:pointer;">[+] FAN OUT</button>
      </div>
      <button id="wheel-request-ride" type="button" style="background:rgba(0,206,201,0.88);color:#06131a;border:1px solid #81ecec;border-radius:3px;padding:3px 8px;font-size:9.5px;font-weight:900;cursor:pointer;">🚁 REQUEST RIDE</button>
    `;
    el.appendChild(center);

    document.body.appendChild(el);
    if (this._domCache) this._domCache.set('commo-rose', el);

    const rideWheelBtn = el.querySelector('#wheel-request-ride');
    if (rideWheelBtn) {
      rideWheelBtn.addEventListener('click', () => {
        this.closeCommoRose();
        this.player?.handleAltRRideAction?.(this);
        this.updateRideStatusHud?.();
      });
    }

    const closeSpBtn = el.querySelector('#wheel-spacing-close');
    if (closeSpBtn) {
      closeSpBtn.addEventListener('click', () => {
        this.issueHudFormationSpacing('STAY_CLOSE');
        this.closeCommoRose();
      });
    }
    const fanSpBtn = el.querySelector('#wheel-spacing-fan');
    if (fanSpBtn) {
      fanSpBtn.addEventListener('click', () => {
        this.issueHudFormationSpacing('FAN_OUT');
        this.closeCommoRose();
      });
    }
  },

  closeCommoRose() {
    const el = this.el('commo-rose');
    if (el) el.remove();
  },

  // Show callout above player's head when a commo command is sent
  showCommoCallout(commandId, text, icon) {
    let el = this.el('commo-callout');
    if (!el) {
      el = document.createElement('div');
      el.id = 'commo-callout';
      el.style.cssText = `
        position: fixed; top: 62%; left: 50%; transform: translateX(-50%);
        font-size: 20px; font-weight: 800; color: #2ecc71;
        text-shadow: 0 0 12px rgba(46,204,113,0.6), 0 2px 6px rgba(0,0,0,0.9);
        letter-spacing: 3px; font-family: 'Rajdhani', sans-serif;
        pointer-events: none; z-index: 9998; opacity: 0;
        transition: opacity 0.15s ease-out;
      `;
      document.body.appendChild(el);
      if (this._domCache) this._domCache.set('commo-callout', el);
    }
    el.textContent = `${icon} ${text}`;
    el.style.opacity = '1';
    this._commoCalloutTimer = 2.5;
  },

  updateCommoCallout(dt) {
    if (this._commoCalloutTimer && this._commoCalloutTimer > 0) {
      this._commoCalloutTimer -= dt;
      if (this._commoCalloutTimer <= 0) {
        const el = this.el('commo-callout');
        if (el) el.style.opacity = '0';
      }
    }
  }
};

export default CommandPanel;
