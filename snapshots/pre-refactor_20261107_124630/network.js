import * as THREE from '../vendor/three.module.js';
import { createSoldierMesh } from './bots.js?v=23';
import { sound } from './audio.js?v=23';

export class NetworkManager {
  constructor(scene, world, player, botManager) {
    this.scene = scene;
    this.world = world;
    this.player = player;
    this.botManager = botManager;
    this.gameRef = null; // Wired by BattleBitGame for shared Conquest ticket/flag sync

    this.clientId = 'p_' + Math.random().toString(36).slice(2, 9);
    const params = new URLSearchParams(window.location.search);
    const urlMode = (params.get('mode') || '').trim().toUpperCase();
    const urlRoom = (params.get('room') || '').trim().toUpperCase();
    const urlBots = (params.get('bots') || '').trim().toUpperCase();
    const savedRoom = (localStorage.getItem('bb_room') || '').trim().toUpperCase();
    this.roomCode = urlRoom || savedRoom || 'FRUGIS-1';

    // Determine initial Game Mode:
    // If URL has ?mode=multiplayer or ?room=..., start in MULTIPLAYER mode; otherwise SINGLEPLAYER mode
    if (urlMode === 'MULTIPLAYER' || urlMode === 'MP' || Boolean(urlRoom)) {
      this.gameMode = 'MULTIPLAYER';
    } else {
      this.gameMode = 'SINGLEPLAYER';
    }

    // Bot population preset: 'FULL_AI' (40v40 = 80 bots), 'SQUAD_AI' (16v16 = 32 bots), 'NO_AI' (0 bots Pure PvP)
    if (urlBots === 'NO_AI' || urlBots === 'PVP' || urlBots === '0') {
      this.botPopulateMode = 'NO_AI';
    } else if (urlBots === 'SQUAD_AI' || urlBots === '32') {
      this.botPopulateMode = 'SQUAD_AI';
    } else {
      this.botPopulateMode = 'FULL_AI';
    }

    const urlName = (params.get('name') || '').trim();
    const savedName = (localStorage.getItem('bb_callsign') || '').trim();
    this.callsign =
      urlName || savedName || `VIPER_${this.clientId.slice(2, 5).toUpperCase()}`;
    this.player.name = this.callsign;

    this.lanIp = window.location.hostname || '127.0.0.1';
    this.serverPort = window.location.port || '8080';
    this.availableRooms = [];

    this.remotePlayers = new Map(); // id -> remotePlayer state
    this.remoteHitMeshes = [];
    this.ws = null;
    this.wsConnected = false;
    this.broadcastChannel = null;
    this.syncTimer = 0;
    this.httpSyncTimer = 0;
    this.roomPollTimer = 0;
    this.httpSyncInFlight = false;
    this.pendingHttpEvents = [];
    this.lastEventSeq = 0;

    this.initTransports();
    this.applyBotPopulationMode();
    if (this.gameMode === 'MULTIPLAYER') {
      this.pollRoomsInfo();
      this.syncHttpNow();
    } else {
      // Still fetch LAN IP once so if the user clicks Multiplayer tab, the LAN URL is ready
      this.pollRoomsInfo();
    }
  }

  isMultiplayer() {
    return this.gameMode === 'MULTIPLAYER';
  }

  getTargetBotsPerTeam() {
    if (this.botPopulateMode === 'NO_AI') return 0;
    if (this.botPopulateMode === 'SQUAD_AI') return 16;
    return 40;
  }

  applyBotPopulationMode() {
    if (!this.botManager || typeof this.botManager.setBotCountPerSide !== 'function') return;
    const countPerSide = this.getTargetBotsPerTeam();
    this.botManager.setBotCountPerSide(countPerSide);
  }

  setBotPopulateMode(botMode) {
    const clean = ['FULL_AI', 'SQUAD_AI', 'NO_AI'].includes(botMode) ? botMode : 'FULL_AI';
    // In Singleplayer, prevent 0-bot empty world unless in Multiplayer PvP
    this.botPopulateMode = this.gameMode === 'SINGLEPLAYER' && clean === 'NO_AI' ? 'FULL_AI' : clean;
    this.applyBotPopulationMode();
    if (this.onLobbyUpdated) {
      this.onLobbyUpdated();
    }
    return this.botPopulateMode;
  }

  clearRemotePlayers() {
    for (const rp of this.remotePlayers.values()) {
      if (rp.mesh) {
        this.scene.remove(rp.mesh);
      }
    }
    this.remotePlayers.clear();
    this.remoteHitMeshes = [];
  }

  setGameMode(newMode, optionalBotMode = null) {
    const cleanMode = String(newMode || '').toUpperCase() === 'MULTIPLAYER' ? 'MULTIPLAYER' : 'SINGLEPLAYER';
    const modeChanged = cleanMode !== this.gameMode;
    this.gameMode = cleanMode;

    if (optionalBotMode) {
      this.botPopulateMode = optionalBotMode;
    } else if (this.gameMode === 'SINGLEPLAYER' && this.botPopulateMode === 'NO_AI') {
      this.botPopulateMode = 'FULL_AI';
    }

    this.applyBotPopulationMode();

    try {
      const url = new URL(window.location.href);
      if (this.gameMode === 'MULTIPLAYER') {
        url.searchParams.set('mode', 'multiplayer');
        url.searchParams.set('room', this.roomCode);
      } else {
        url.searchParams.delete('mode');
        url.searchParams.delete('room');
      }
      window.history.replaceState({}, '', url.toString());
    } catch (_e) {
      // Ignore URL update errors
    }

    if (this.gameMode === 'SINGLEPLAYER') {
      this.clearRemotePlayers();
      this.pendingHttpEvents = [];
    } else if (modeChanged || this.gameMode === 'MULTIPLAYER') {
      this.send({
        type: 'join_announce',
        name: this.callsign,
        team: this.player.team,
        squad: this.player.squad || 'ALPHA',
        role: this.player.role.toUpperCase(),
        commandRank: this.player.commandRank || 'COMMANDER'
      });
      this.syncHttpNow();
      this.pollRoomsInfo();
    }

    if (this.onLobbyUpdated) {
      this.onLobbyUpdated();
    }
    return this.gameMode;
  }

  setCallsign(newName) {
    const clean = String(newName || '')
      .trim()
      .slice(0, 18)
      .toUpperCase();
    if (!clean) return this.callsign;
    this.callsign = clean;
    this.player.name = clean;
    try {
      localStorage.setItem('bb_callsign', clean);
    } catch (_e) {
      // Ignore storage errors
    }
    return this.callsign;
  }

  setRoom(newRoomCode) {
    const clean =
      String(newRoomCode || 'FRUGIS-1')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/g, '')
        .slice(0, 20) || 'FRUGIS-1';
    const changed = clean !== this.roomCode;
    this.roomCode = clean;
    try {
      localStorage.setItem('bb_room', clean);
      if (this.gameMode === 'MULTIPLAYER') {
        const url = new URL(window.location.href);
        url.searchParams.set('mode', 'multiplayer');
        url.searchParams.set('room', clean);
        window.history.replaceState({}, '', url.toString());
      }
    } catch (_e) {
      // Ignore URL state errors
    }

    if (changed) {
      this.clearRemotePlayers();
      this.lastEventSeq = 0;
    }

    if (this.gameMode === 'MULTIPLAYER') {
      this.send({
        type: 'join_announce',
        name: this.callsign,
        team: this.player.team,
        squad: this.player.squad || 'ALPHA',
        role: this.player.role.toUpperCase(),
        commandRank: this.player.commandRank || 'COMMANDER'
      });
      this.syncHttpNow();
      this.pollRoomsInfo();
    }
    return this.roomCode;
  }

  getShareUrl(useLan = true) {
    const host =
      useLan && this.lanIp && this.lanIp !== '0.0.0.0'
        ? `${this.lanIp}:${this.serverPort}`
        : window.location.host || `localhost:${this.serverPort}`;
    const botsParam =
      this.botPopulateMode !== 'FULL_AI' ? `&bots=${encodeURIComponent(this.botPopulateMode)}` : '';
    return `${window.location.protocol}//${host}/?mode=multiplayer&room=${encodeURIComponent(
      this.roomCode
    )}${botsParam}`;
  }

  openCoopTestWindow() {
    this.setGameMode('MULTIPLAYER');
    const randSuffix = Math.floor(10 + Math.random() * 89);
    const url = `${window.location.protocol}//${window.location.host}/?mode=multiplayer&room=${encodeURIComponent(
      this.roomCode
    )}&name=ALLY_${randSuffix}&bots=${encodeURIComponent(this.botPopulateMode)}`;
    window.open(url, '_blank');
    return url;
  }

  initTransports() {
    // 1. Browser BroadcastChannel for instant multi-tab multiplayer
    if (typeof BroadcastChannel !== 'undefined') {
      this.broadcastChannel = new BroadcastChannel('battlebit_clone_net_v1');
      this.broadcastChannel.onmessage = (ev) => {
        if (
          this.gameMode === 'MULTIPLAYER' &&
          ev.data &&
          ev.data.senderId !== this.clientId &&
          (!ev.data.room || ev.data.room === this.roomCode)
        ) {
          this.handleMessage(ev.data);
        }
      };
    }

    // 2. WebSocket connection for LAN / multi-client server.py
    try {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        this.wsConnected = true;
        this.ws = ws;
        if (this.gameMode === 'MULTIPLAYER') {
          this.send({
            type: 'join_announce',
            name: this.callsign,
            team: this.player.team,
            squad: this.player.squad || 'ALPHA',
            role: this.player.role.toUpperCase(),
            commandRank: this.player.commandRank || 'COMMANDER'
          });
        }
      };

      ws.onmessage = (ev) => {
        if (this.gameMode !== 'MULTIPLAYER') return;
        try {
          const msg = JSON.parse(ev.data);
          if (
            msg &&
            msg.senderId !== this.clientId &&
            (!msg.room || msg.room === this.roomCode)
          ) {
            this.handleMessage(msg);
          }
        } catch (_err) {
          // Ignore malformed packet
        }
      };

      ws.onclose = () => {
        this.wsConnected = false;
        this.ws = null;
      };

      ws.onerror = () => {
        this.wsConnected = false;
      };
    } catch (_e) {
      this.wsConnected = false;
    }
  }

  send(payload) {
    if (this.gameMode !== 'MULTIPLAYER') return;
    const packet = {
      ...payload,
      senderId: this.clientId,
      room: this.roomCode,
      ts: performance.now()
    };
    if (this.wsConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(packet));
    }
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage(packet);
    }
    if (payload.type !== 'state') {
      this.pendingHttpEvents.push(packet);
      if (this.pendingHttpEvents.length > 40) {
        this.pendingHttpEvents.shift();
      }
    }
  }

  handleMessage(msg) {
    if (this.gameMode !== 'MULTIPLAYER') return;
    switch (msg.type) {
      case 'state':
        this.updateRemotePlayer(msg);
        break;
      case 'shoot':
        this.handleRemoteShoot(msg);
        break;
      case 'voxel_destroy':
        this.world.destroyVoxel(msg.gx, msg.gy, msg.gz, true);
        break;
      case 'voxel_add':
        this.world.addVoxel(msg.gx, msg.gy, msg.gz, msg.mat || 'sandbag');
        break;
      case 'player_hit':
        if (msg.targetId === this.clientId) {
          this.player.takeDamage(
            msg.damage,
            msg.attackerName,
            msg.attackerTeam,
            msg.weapon,
            this.player.onKillEvent
          );
        }
        break;
      case 'order_sync': {
        if (msg.team === this.player.team && this.botManager) {
          this.botManager.issueStrategicOrder(this.player, {
            team: msg.team,
            scope: msg.scope || 'ALL',
            targetSquad: msg.targetSquad || 'ALPHA',
            action: msg.action || 'OBJECTIVE',
            flagId: msg.flagId || 'C'
          });
          if (this.onRemoteOrderReceived) {
            this.onRemoteOrderReceived(msg);
          }
        }
        break;
      }
      case 'comms_message': {
        const rp = this.remotePlayers.get(msg.senderId);
        if (rp) {
          rp.speechBubbleText = msg.text;
          rp.speechBubbleTimer = 4.5;
        }
        if (this.onRemoteCommsMessage) {
          this.onRemoteCommsMessage(msg, rp);
        }
        break;
      }
      case 'join_announce': {
        if (this.onPlayerJoinedRoom && msg.senderId !== this.clientId) {
          this.onPlayerJoinedRoom(msg);
        }
        break;
      }
    }
  }

  updateRemotePlayer(msg) {
    let rp = this.remotePlayers.get(msg.senderId);
    const rank = msg.commandRank || 'COMMANDER';
    const role = (msg.role || 'ENGINEER').toUpperCase();

    if (!rp) {
      const mesh = createSoldierMesh(msg.team || 'US', role, rank);
      this.scene.add(mesh);
      rp = {
        id: msg.senderId,
        name: msg.name || `PLAYER_${msg.senderId.slice(2, 5)}`,
        team: msg.team || 'US',
        squad: msg.squad || 'ALPHA',
        role,
        commandRank: rank,
        pos: new THREE.Vector3(),
        yaw: 0,
        hp: 100,
        dead: false,
        downed: false,
        crouching: false,
        prone: false,
        vehicleId: null,
        kills: msg.kills || 0,
        deaths: msg.deaths || 0,
        score: msg.score || 0,
        speechBubbleText: '',
        speechBubbleTimer: 0,
        lastSeen: performance.now(),
        mesh
      };

      mesh.traverse((child) => {
        if (child.isMesh && child.name !== 'teamMarker') {
          child.userData.remotePlayer = rp;
          this.remoteHitMeshes.push(child);
        }
      });

      this.remotePlayers.set(msg.senderId, rp);
      if (this.onLobbyUpdated) {
        this.onLobbyUpdated();
      }
    }

    rp.lastSeen = performance.now();
    if (msg.name) rp.name = msg.name;
    rp.team = msg.team || rp.team;
    if (msg.squad) rp.squad = msg.squad;
    if (msg.role) rp.role = msg.role;
    if (msg.commandRank) rp.commandRank = msg.commandRank;
    rp.hp = typeof msg.hp === 'number' ? msg.hp : 100;
    rp.dead = Boolean(msg.dead);
    rp.downed = Boolean(msg.downed);
    rp.crouching = Boolean(msg.crouching);
    rp.prone = Boolean(msg.prone);
    rp.vehicleId = msg.vehicleId || null;
    rp.kills = msg.kills || 0;
    rp.deaths = msg.deaths || 0;
    rp.revives = msg.revives || 0;
    rp.medicKills = msg.medicKills || 0;
    rp.vehiclesDestroyed = msg.vehiclesDestroyed || 0;
    rp.score = msg.score || 0;

    rp.mesh.visible = !rp.dead && !rp.vehicleId;

    if (msg.pos) {
      rp.pos.fromArray(msg.pos);
      rp.mesh.position.copy(rp.pos);
    }
    if (typeof msg.yaw === 'number') {
      rp.yaw = msg.yaw;
      rp.mesh.rotation.y = rp.yaw + Math.PI;
    }

    // Visual stance sync (Downed / Prone / Crouched / Standing)
    if (rp.downed) {
      rp.mesh.rotation.x = -Math.PI / 2;
      rp.mesh.scale.set(1, 1, 1);
    } else if (rp.prone) {
      rp.mesh.rotation.x = -Math.PI / 2.2;
      rp.mesh.scale.set(1, 0.85, 1);
    } else if (rp.crouching) {
      rp.mesh.rotation.x = 0;
      rp.mesh.scale.set(1, 0.72, 1);
    } else {
      rp.mesh.rotation.x = 0;
      rp.mesh.scale.set(1, 1, 1);
    }
  }

  handleRemoteShoot(msg) {
    if (!msg.origin || !msg.end) return;
    const start = new THREE.Vector3().fromArray(msg.origin);
    const end = new THREE.Vector3().fromArray(msg.end);
    if (msg.isTracer !== false) {
      this.botManager.spawnTracer(start, end, 0xffeaa7);
    }
    const dist = start.distanceTo(this.player.pos);
    if (dist < 130) {
      sound.playGunshot('rifle', dist);
    }
  }

  getRemoteMeshes() {
    if (this.gameMode !== 'MULTIPLAYER') return [];
    return this.remoteHitMeshes;
  }

  buildLocalStatePacket() {
    return {
      type: 'state',
      room: this.roomCode,
      name: this.callsign,
      team: this.player.team,
      squad: this.player.squad || 'ALPHA',
      role: this.player.role.toUpperCase(),
      commandRank: this.player.commandRank || 'COMMANDER',
      pos: this.player.pos.toArray(),
      yaw: this.player.yaw,
      hp: Math.ceil(this.player.hp || 100),
      dead: this.player.dead,
      downed: Boolean(this.player.downed),
      crouching: Boolean(this.player.crouching),
      prone: Boolean(this.player.prone),
      vehicleId: this.player.activeVehicle ? this.player.activeVehicle.id : null,
      kills: this.player.kills || 0,
      deaths: this.player.deaths || 0,
      revives: this.player.revives || 0,
      medicKills: this.player.medicKills || 0,
      vehiclesDestroyed: this.player.vehiclesDestroyed || 0,
      score: this.player.score || 0
    };
  }

  async pollRoomsInfo() {
    try {
      const res = await fetch('/api/mp/rooms', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.ok) {
        if (data.lanIp) this.lanIp = data.lanIp;
        if (data.port) this.serverPort = String(data.port);
        if (Array.isArray(data.rooms)) {
          this.availableRooms = data.rooms;
        }
        if (this.onLobbyUpdated) {
          this.onLobbyUpdated(data);
        }
      }
    } catch (_e) {
      // Ignore offline fetch
    }
  }

  async syncHttpNow() {
    if (this.gameMode !== 'MULTIPLAYER' || this.httpSyncInFlight) return;
    this.httpSyncInFlight = true;
    const eventsBatch = this.pendingHttpEvents.splice(0, this.pendingHttpEvents.length);
    try {
      const res = await fetch('/api/mp/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room: this.roomCode,
          clientId: this.clientId,
          state: this.buildLocalStatePacket(),
          events: eventsBatch,
          lastSeq: this.lastEventSeq
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.ok && this.gameMode === 'MULTIPLAYER') {
          if (data.lanIp) this.lanIp = data.lanIp;
          if (typeof data.latestSeq === 'number') {
            this.lastEventSeq = data.latestSeq;
          }
          if (Array.isArray(data.players)) {
            for (const pState of data.players) {
              if (pState && pState.senderId && pState.senderId !== this.clientId) {
                this.updateRemotePlayer(pState);
              }
            }
          }
          if (Array.isArray(data.events)) {
            for (const ev of data.events) {
              if (ev && ev.senderId !== this.clientId) {
                this.handleMessage(ev);
              }
            }
          }
        }
      }
    } catch (_e) {
      // Ignore transient HTTP sync error
    } finally {
      this.httpSyncInFlight = false;
    }
  }

  update(dt) {
    if (this.gameMode !== 'MULTIPLAYER') {
      return;
    }

    this.syncTimer += dt;
    if (this.syncTimer >= 0.06) {
      this.syncTimer = 0;
      this.send(this.buildLocalStatePacket());
    }

    // Reliable HTTP Room Sync every 0.16s (works across all browsers, tabs & LAN devices!)
    this.httpSyncTimer += dt;
    if (this.httpSyncTimer >= 0.16) {
      this.httpSyncTimer = 0;
      this.syncHttpNow();
    }

    this.roomPollTimer += dt;
    if (this.roomPollTimer >= 2.2) {
      this.roomPollTimer = 0;
      this.pollRoomsInfo();
    }

    // Prune timed-out remote players & decay speech bubbles
    const now = performance.now();
    for (const [id, rp] of this.remotePlayers.entries()) {
      if (rp.speechBubbleTimer > 0) {
        rp.speechBubbleTimer = Math.max(0, rp.speechBubbleTimer - dt);
      }
      if (now - rp.lastSeen > 5500) {
        this.scene.remove(rp.mesh);
        this.remotePlayers.delete(id);
        if (this.onLobbyUpdated) {
          this.onLobbyUpdated();
        }
      }
    }
  }
}
