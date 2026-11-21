/**
 * Advanced Battle Telemetry & Diagnostic Logger
 * Captures real-time combat events, spawn rule audits, physical NPC vehicle boarding,
 * directional damage indicators, armor absorption metrics, and periodic 4s battlefield
 * state snapshots. Streams structured JSON logs to `/api/telemetry` -> `logs/battle_telemetry.jsonl`
 * and `logs/latest_snapshot.json` for automated inspection and gameplay tuning.
 */
import { TELEMETRY, MATCH } from './config.js?v=91';
import { events } from './events.js?v=91';

export class TelemetryLogger {
  constructor(game) {
    this.game = game;
    this.events = [];
    this.pendingBatch = [];
    this.snapshotTimer = 1.5;
    this.flushTimer = 1.2;
    const host = (typeof window !== 'undefined' && window.location && window.location.hostname) || '';
    const search = (typeof window !== 'undefined' && window.location && window.location.search) || '';
    this.debugConsole = new URLSearchParams(search).get('debug') === '1';
    this.remoteApiDisabled =
      host.endsWith('.github.io') ||
      host.endsWith('.pages.dev') ||
      host.endsWith('.netlify.app') ||
      host.endsWith('.vercel.app');

    this._unsubscribeTelemetryEvent = events.on('telemetry:event', (data, legacyPayload) => {
      if (data && typeof data === 'object' && typeof data.type === 'string') {
        this.logEvent(data.type, data.payload || {});
      } else if (typeof data === 'string') {
        this.logEvent(data, legacyPayload || {});
      }
    });

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

    if (!this.remoteApiDisabled) {
      this.pendingBatch.push(entry);
      if (this.pendingBatch.length > TELEMETRY.MAX_EVENTS) {
        this.pendingBatch.shift();
      }
    }
    if (this.debugConsole && type !== 'NPC_SPAWN') {
      console.log(`[TELEMETRY:${type}]`, JSON.stringify(payload));
    }
  }

  buildSnapshot() {
    const g = this.game;
    if (!g || !g.world || !g.botManager || !g.vehicleManager || !g.player) return null;

    const p = g.player;
    const vehicles = g.vehicleManager.vehicles;
    const vehSummary = new Array(vehicles.length);
    let ghostCrewedCount = 0;

    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      const basePos = v.team === 'US' ? g.world.spawns.US_BASE : g.world.spawns.RU_BASE;
      const distFromBase = Math.round(v.pos.distanceTo(basePos));
      let status = 'PARKED_AT_BASE';
      if (v.dead) status = `DESTROYED (RESPAWN AT BASE IN ${Math.ceil(v.respawnTimer)}s)`;
      else if (v.driver) status = `PLAYER_DRIVEN (${v.driver.name})`;
      else if (v.npcDriver) status = `NPC_DRIVEN (${v.npcDriver.name} [${v.npcDriver.squad}])`;
      else if (v.claimedByBot) status = `NPC_APPROACHING (${v.claimedByBot.name})`;

      if (!v.dead && Math.abs(v.forwardSpeed) > 0.5 && !v.driver && !v.npcDriver) {
        ghostCrewedCount++;
      }

      vehSummary[i] = {
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
    }

    let usAlive = 0;
    let usDowned = 0;
    let usDriving = 0;
    let usRescuing = 0;
    let usAssessing = 0;
    let ruAlive = 0;
    let ruDowned = 0;
    let ruDriving = 0;
    let ruRescuing = 0;
    let ruAssessing = 0;

    const bots = g.botManager.bots;
    for (let i = 0; i < bots.length; i++) {
      const b = bots[i];
      if (b.team === 'US') {
        if (!b.dead && !b.downed) usAlive++;
        if (b.downed) usDowned++;
        if (b.drivingVehicle) usDriving++;
        if (b.rescueTarget) usRescuing++;
        if (b.rescueState === 'ASSESS_THREAT') usAssessing++;
      } else if (b.team === 'RU') {
        if (!b.dead && !b.downed) ruAlive++;
        if (b.downed) ruDowned++;
        if (b.drivingVehicle) ruDriving++;
        if (b.rescueTarget) ruRescuing++;
        if (b.rescueState === 'ASSESS_THREAT') ruAssessing++;
      }
    }

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
      stateMachines: g.stateMachines ? g.stateMachines.getSnapshot() : null,
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
          alive: usAlive,
          downed: usDowned,
          drivingVehicles: usDriving,
          medicsRescuing: usRescuing,
          medicsAssessingThreat: usAssessing
        },
        RU: {
          alive: ruAlive,
          downed: ruDowned,
          drivingVehicles: ruDriving,
          medicsRescuing: ruRescuing,
          medicsAssessingThreat: ruAssessing
        }
      },
      vehicles: vehSummary,
      recentEvents: this.events.slice(0, 14)
    };
  }

  update(dt) {
    const panelEl =
      typeof document !== 'undefined' ? document.getElementById('telemetry-panel') : null;
    const panelVisible =
      panelEl && panelEl.style.display !== 'none' && !panelEl.classList.contains('hidden');
    if (this.remoteApiDisabled && !panelVisible) {
      this.snapshotTimer = 0;
      if (this.pendingBatch.length > 0) {
        this.pendingBatch.length = 0;
      }
      return;
    }

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
      if (this.remoteApiDisabled) return;
      const body = JSON.stringify({ events: batch, snapshot });
      fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      })
        .then((res) => {
          if (res && (res.status === 404 || res.status === 405 || res.status === 501)) {
            this.remoteApiDisabled = true;
          }
        })
        .catch(() => {
          this.remoteApiDisabled = true;
        });
    }
  }
}
