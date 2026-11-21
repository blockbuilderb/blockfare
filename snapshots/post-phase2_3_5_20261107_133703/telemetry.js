/**
 * Advanced Battle Telemetry & Diagnostic Logger
 * Captures real-time combat events, spawn rule audits, physical NPC vehicle boarding,
 * directional damage indicators, armor absorption metrics, and periodic 4s battlefield
 * state snapshots. Streams structured JSON logs to `/api/telemetry` -> `logs/battle_telemetry.jsonl`
 * and `logs/latest_snapshot.json` for automated inspection and gameplay tuning.
 */
import { TELEMETRY, MATCH } from './config.js?v=35';

export class TelemetryLogger {
  constructor(game) {
    this.game = game;
    this.events = [];
    this.pendingBatch = [];
    this.snapshotTimer = 1.5;
    this.flushTimer = 1.2;
    this.panelVisible = false;

    this.counters = {
      usBaseSpawns: 0,
      usFlagSpawns: 0,
      ruBaseSpawns: 0,
      ruFlagSpawns: 0,
      illegalSpawns: 0,
      npcVehicleBoardings: 0,
      playerArmorProtectedHits: 0,
      playerFootHits: 0,
      directionalIndicatorsTriggered: 0,
      medicThreatAssessments: 0,
      medicClearAssessments: 0,
      medicSmokeScreens: 0,
      contestedBasesLocked: 0,
      blockedContestedSpawns: 0,
      rpgsFired: 0,
      revivesCompleted: 0,
      vehiclesDestroyed: 0
    };

    this.logEvent('TELEMETRY_INIT', {
      message: 'Advanced BattleBit Telemetry & Diagnostic Logger Initialized',
      rulesActive: [
        'Vehicles spawn/respawn empty at Main Base Motor Pool (US_BASE / RU_BASE)',
        'NPCs physically run to unoccupied Base vehicles and board them to drive',
        'NPCs & Player spawn strictly at Uncontested Main Base or Uncontested Occupied Forward Bases',
        'Contested Base Rule: Base spawn is locked once all defenders at that base are eliminated & player/attackers are present',
        'Smarter Tactical Medics: Assess situation for nearby threats (<36m), pop 3D smoke screen, crouch & suppress/clear enemy before dragging & reviving',
        'Vehicle armor protects crew personal HP + 360° Directional Incoming Fire Indicators'
      ]
    });
  }

  logEvent(type, payload = {}) {
    const entry = {
      ts: new Date().toISOString(),
      matchTime: this.game ? Math.round(MATCH.DURATION - (this.game.matchTimeRemaining || MATCH.DURATION)) : 0,
      type,
      ...payload
    };

    if (type === 'NPC_SPAWN' || type === 'PLAYER_SPAWN') {
      const isBase = payload.source === 'MAIN_BASE';
      const isFlag = String(payload.source || '').startsWith('FORWARD_FLAG_');
      if (!isBase && !isFlag) {
        this.counters.illegalSpawns++;
      } else if (payload.team === 'US') {
        if (isBase) this.counters.usBaseSpawns++;
        else this.counters.usFlagSpawns++;
      } else if (payload.team === 'RU') {
        if (isBase) this.counters.ruBaseSpawns++;
        else this.counters.ruFlagSpawns++;
      }
    } else if (type === 'NPC_BOARDED_VEHICLE') {
      this.counters.npcVehicleBoardings++;
    } else if (type === 'DIRECTIONAL_DAMAGE') {
      this.counters.directionalIndicatorsTriggered++;
      if (payload.isArmorHit) this.counters.playerArmorProtectedHits++;
      else this.counters.playerFootHits++;
    } else if (type === 'MEDIC_ASSESS_THREAT') {
      this.counters.medicThreatAssessments++;
      if (payload.smokeDeployed) this.counters.medicSmokeScreens++;
    } else if (type === 'MEDIC_ASSESS_CLEAR') {
      this.counters.medicClearAssessments++;
    } else if (type === 'BASE_CONTESTED_LOCKOUT') {
      this.counters.contestedBasesLocked++;
    } else if (type === 'CONTESTED_SPAWN_BLOCKED') {
      this.counters.blockedContestedSpawns++;
    } else if (type === 'VEHICLE_DESTROYED') {
      this.counters.vehiclesDestroyed++;
    }

    this.events.unshift(entry);
    if (this.events.length > TELEMETRY.MAX_EVENTS) {
      this.events.length = TELEMETRY.MAX_EVENTS;
    }

    this.pendingBatch.push(entry);
    if (type !== 'NPC_SPAWN') {
      console.log(`[TELEMETRY:${type}]`, JSON.stringify(payload));
    }
  }

  buildSnapshot() {
    const g = this.game;
    if (!g || !g.world || !g.botManager || !g.vehicleManager || !g.player) return null;

    const p = g.player;
    const vehSummary = g.vehicleManager.vehicles.map((v) => {
      const basePos = v.team === 'US' ? g.world.spawns.US_BASE : g.world.spawns.RU_BASE;
      const distFromBase = Math.round(v.pos.distanceTo(basePos));
      let status = 'PARKED_AT_BASE';
      if (v.dead) status = `DESTROYED (RESPAWN AT BASE IN ${Math.ceil(v.respawnTimer)}s)`;
      else if (v.driver) status = `PLAYER_DRIVEN (${v.driver.name})`;
      else if (v.npcDriver) status = `NPC_DRIVEN (${v.npcDriver.name} [${v.npcDriver.squad}])`;
      else if (v.claimedByBot) status = `NPC_APPROACHING (${v.claimedByBot.name})`;

      return {
        id: v.id,
        name: v.name,
        team: v.team,
        type: v.type,
        hp: Math.round(v.hp),
        maxHp: v.maxHp,
        pos: { x: Math.round(v.pos.x), z: Math.round(v.pos.z) },
        distFromBaseM: distFromBase,
        status
      };
    });

    const ghostCrewedCount = g.vehicleManager.vehicles.filter(
      (v) => !v.dead && Math.abs(v.forwardSpeed) > 0.5 && !v.driver && !v.npcDriver
    ).length;

    const usBots = g.botManager.bots.filter((b) => b.team === 'US');
    const ruBots = g.botManager.bots.filter((b) => b.team === 'RU');

    return {
      ts: new Date().toISOString(),
      matchTimeRemainingSec: Math.round(g.matchTimeRemaining || 0),
      tickets: { US: Math.floor(g.ticketsUS), RU: Math.floor(g.ticketsRU) },
      mainBases: g.botManager.baseState || {},
      flags: g.world.flags.map((f) => ({
        id: f.id,
        owner: f.owner,
        contested: Boolean(f.contested),
        defenders: f.defendersCount || 0,
        attackers: f.attackersCount || 0,
        progress: Math.round(f.captureProgress)
      })),
      diagnostics: {
        ...this.counters,
        ghostCrewedVehicles: ghostCrewedCount,
        spawnRuleCompliant: this.counters.illegalSpawns === 0,
        vehicleCrewRuleCompliant: ghostCrewedCount === 0
      },
      player: {
        name: p.name,
        team: p.team,
        squad: p.squad,
        role: p.role,
        hp: Math.round(p.hp),
        armor: Math.round(p.armor),
        bleeding: p.bleeding,
        downed: p.downed,
        pos: { x: Math.round(p.pos.x), y: Number(p.pos.y.toFixed(1)), z: Math.round(p.pos.z) },
        inVehicle: p.activeVehicle ? p.activeVehicle.name : null,
        vehicleHp: p.activeVehicle ? Math.round(p.activeVehicle.hp) : null,
        vehicleMaxHp: p.activeVehicle ? p.activeVehicle.maxHp : null,
        activeDirectionalIndicators: g.ui && g.ui.damageIndicators ? g.ui.damageIndicators.length : 0
      },
      factions: {
        US: {
          alive: usBots.filter((b) => !b.dead && !b.downed).length,
          downed: usBots.filter((b) => b.downed).length,
          drivingVehicles: usBots.filter((b) => Boolean(b.drivingVehicle)).length,
          medicsRescuing: usBots.filter((b) => Boolean(b.rescueTarget)).length,
          medicsAssessingThreat: usBots.filter((b) => b.rescueState === 'ASSESS_THREAT').length
        },
        RU: {
          alive: ruBots.filter((b) => !b.dead && !b.downed).length,
          downed: ruBots.filter((b) => b.downed).length,
          drivingVehicles: ruBots.filter((b) => Boolean(b.drivingVehicle)).length,
          medicsRescuing: ruBots.filter((b) => Boolean(b.rescueTarget)).length,
          medicsAssessingThreat: ruBots.filter((b) => b.rescueState === 'ASSESS_THREAT').length
        }
      },
      vehicles: vehSummary,
      recentEvents: this.events.slice(0, 14)
    };
  }

  update(dt) {
    this.snapshotTimer -= dt;
    this.flushTimer -= dt;

    let snapshot = null;
    if (this.snapshotTimer <= 0) {
      this.snapshotTimer = TELEMETRY.SNAPSHOT_INTERVAL;
      snapshot = this.buildSnapshot();
    }

    if (this.flushTimer <= 0 && (this.pendingBatch.length > 0 || snapshot)) {
      this.flushTimer = TELEMETRY.FLUSH_INTERVAL;
      const batch = this.pendingBatch.splice(0, this.pendingBatch.length);
      const body = JSON.stringify({ events: batch, snapshot });
      fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      }).catch(() => {});
    }
  }
}
