import * as THREE from '../vendor/three.module.js';
import { createSoldierMesh, updateSoldierEquippedWeapon } from './bots.js?v=105';
import { sound } from './audio.js?v=105';
import { NETWORK } from './config.js?v=105';
import { events, makeEventBridge } from './events.js?v=105';
import {
  NETWORK_TRANSPORT_EVENTS,
  createNetworkTransportFSM
} from './core/StateMachines.js?v=105';

export class NetworkManager {
  constructor(scene, world, player, botManager) {
    this.scene = scene;
    this.world = world;
    this.player = player;
    this.botManager = botManager;
    this.gameRef = null; // Wired by BattleBitGame for shared Conquest ticket/flag sync

    this.onPlayerJoinedRoom = makeEventBridge('network:player-joined', (msg) => ({ msg }));
    this.onRemoteCommsMessage = makeEventBridge('network:remote-comms', (msg, rp) => ({ msg, rp }));

    this.clientId = 'p_' + Math.random().toString(36).slice(2, 9);
    this.playerId = this.clientId;
    this._txSeq = 0;
    this._peerSeqState = new Map();
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

    // Bot population preset: 'FULL_AI' / 'MASSIVE_AI' (125v125 = 250 bots), 'LARGE_AI' (80v80 = 160 bots),
    // 'TACTICAL_AI' (40v40 = 80 bots), 'SQUAD_AI' (16v16 = 32 bots), 'NO_AI' (0 bots Pure PvP)
    if (urlBots === 'NO_AI' || urlBots === 'PVP' || urlBots === '0') {
      this.botPopulateMode = 'NO_AI';
    } else if (urlBots === 'SQUAD_AI' || urlBots === '32') {
      this.botPopulateMode = 'SQUAD_AI';
    } else if (urlBots === 'TACTICAL_AI' || urlBots === '80') {
      this.botPopulateMode = 'TACTICAL_AI';
    } else if (urlBots === 'LARGE_AI' || urlBots === '160') {
      this.botPopulateMode = 'LARGE_AI';
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
    this.isStaticHost =
      this.lanIp.endsWith('.github.io') ||
      this.lanIp.endsWith('.pages.dev') ||
      this.lanIp.endsWith('.netlify.app') ||
      this.lanIp.endsWith('.vercel.app');

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
    this._syncEpoch = 1;
    createNetworkTransportFSM(this);

    this.initTransports();
    this.applyBotPopulationMode();
    if (this.gameMode === 'MULTIPLAYER') {
      this.pollRoomsInfo();
      this.syncHttpNow();
    } else {
      // Still fetch LAN IP once so if the user clicks Multiplayer tab, the LAN URL is ready
      this.pollRoomsInfo();
    }

    // Immediately broadcast weapon & attachment changes in Multiplayer so every remote player sees the exact 3D gun model
    events.on('weapon:switched', () => {
      if (this.gameMode === 'MULTIPLAYER') {
        this.send(this.buildLocalStatePacket());
      }
    });
  }

  isMultiplayer() {
    return this.gameMode === 'MULTIPLAYER';
  }

  getTargetBotsPerTeam() {
    if (this.botPopulateMode === 'NO_AI') return 0;
    if (this.botPopulateMode === 'SQUAD_AI') return NETWORK.BOTS_SQUAD_AI;
    if (this.botPopulateMode === 'TACTICAL_AI') return NETWORK.BOTS_TACTICAL_AI || 40;
    if (this.botPopulateMode === 'LARGE_AI') return NETWORK.BOTS_LARGE_AI || 80;
    return NETWORK.BOTS_FULL_AI || 125;
  }

  applyBotPopulationMode() {
    if (!this.botManager || typeof this.botManager.setBotCountPerSide !== 'function') return;
    const countPerSide = this.getTargetBotsPerTeam();
    this.botManager.setBotCountPerSide(countPerSide);
  }

  setBotPopulateMode(botMode) {
    const validModes = ['FULL_AI', 'MASSIVE_AI', 'LARGE_AI', 'TACTICAL_AI', 'SQUAD_AI', 'NO_AI'];
    const clean = validModes.includes(botMode) ? botMode : 'FULL_AI';
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
    if (this._peerSeqState) this._peerSeqState.clear();
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
      this.transportFSM?.send(NETWORK_TRANSPORT_EVENTS.DISABLE_MP);
      this.clearRemotePlayers();
      this.pendingHttpEvents = [];
    } else if (modeChanged || this.gameMode === 'MULTIPLAYER') {
      if (this.wsConnected && this.ws && this.ws.readyState === 1) {
        this.transportFSM?.send(NETWORK_TRANSPORT_EVENTS.ENABLE_MP_WS_READY);
      } else {
        this.transportFSM?.send(NETWORK_TRANSPORT_EVENTS.ENABLE_MP_HTTP_FALLBACK);
      }
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
      this._syncEpoch = (this._syncEpoch || 1) + 1;
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

    // 2. WebSocket connection for LAN / multi-client server.py (skipped on static CDN hosts like GitHub Pages / Cloudflare Pages)
    if (this.isStaticHost) {
      this.wsConnected = false;
      return;
    }
    try {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        this.wsConnected = true;
        this.ws = ws;
        this.transportFSM?.send(NETWORK_TRANSPORT_EVENTS.WS_OPEN);
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
        this.transportFSM?.send(NETWORK_TRANSPORT_EVENTS.WS_CLOSE_OR_ERROR);
      };

      ws.onerror = () => {
        this.wsConnected = false;
        this.transportFSM?.send(NETWORK_TRANSPORT_EVENTS.WS_CLOSE_OR_ERROR);
      };
    } catch (_e) {
      this.wsConnected = false;
      this.transportFSM?.send(NETWORK_TRANSPORT_EVENTS.WS_CLOSE_OR_ERROR);
    }
  }

  _isDuplicatePacket(msg) {
    if (!msg) return true;
    const seq = msg._seq;
    const peerId = msg._sender || msg.senderId;
    if (typeof seq !== 'number' || !peerId) return false;

    let state = this._peerSeqState.get(peerId);
    if (!state) {
      state = {
        maxSeq: 0,
        lastStateSeq: 0,
        ring: new Float64Array(128),
        cursor: 0
      };
      this._peerSeqState.set(peerId, state);
    }

    const ring = state.ring;
    for (let i = 0; i < 128; i++) {
      if (ring[i] === seq) return true;
    }
    if (state.maxSeq - seq > 128 && seq > 4) {
      return true;
    }
    if (msg.type === 'state') {
      if (seq < state.lastStateSeq && state.lastStateSeq - seq < 512) {
        return true;
      }
      state.lastStateSeq = seq;
    }
    if (seq > state.maxSeq || state.maxSeq - seq > 1000) {
      state.maxSeq = seq;
    }
    ring[state.cursor] = seq;
    state.cursor = (state.cursor + 1) & 127;
    return false;
  }

  send(payload) {
    if (this.gameMode !== 'MULTIPLAYER' || !payload) return;
    const packet = {
      ...payload,
      _seq: ++this._txSeq,
      _sender: this.playerId,
      senderId: this.clientId,
      room: this.roomCode,
      ts: performance.now()
    };
    const wsOpen = Boolean(
      this.wsConnected && this.ws && this.ws.readyState === WebSocket.OPEN
    );
    if (wsOpen) {
      this.ws.send(JSON.stringify(packet));
      return;
    }
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage(packet);
    }
    if (!this.isStaticHost && payload.type !== 'state') {
      this.pendingHttpEvents.push(packet);
      if (this.pendingHttpEvents.length > 40) {
        this.pendingHttpEvents.shift();
      }
    }
  }

  handleMessage(msg) {
    if (this.gameMode !== 'MULTIPLAYER') return;
    if (this._isDuplicatePacket(msg)) return;
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
        events.emit('network:remote-comms', { msg, rp });
        if (this.onRemoteCommsMessage && !this.onRemoteCommsMessage._isEventsBridge) {
          this.onRemoteCommsMessage(msg, rp);
        }
        break;
      }
      case 'join_announce': {
        if (msg.senderId !== this.clientId) {
          events.emit('network:player-joined', { msg });
          if (this.onPlayerJoinedRoom && !this.onPlayerJoinedRoom._isEventsBridge) {
            this.onPlayerJoinedRoom(msg);
          }
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
        pitch: 0,
        hp: 100,
        dead: false,
        downed: false,
        crouching: false,
        prone: false,
        vehicleId: null,
        weaponId: msg.weaponId || null,
        weaponName: msg.weaponName || null,
        weaponType: msg.weaponType || 'gun',
        weaponSlot: typeof msg.weaponSlot === 'number' ? msg.weaponSlot : 0,
        skinFinish: msg.skinFinish || null,
        attachments: msg.attachments || null,
        muzzleFlashTimer: 0,
        kills: msg.kills || 0,
        deaths: msg.deaths || 0,
        score: msg.score || 0,
        speechBubbleText: '',
        speechBubbleTimer: 0,
        lastSeen: performance.now(),
        mesh
      };

      mesh.traverse((child) => {
        if (child.isMesh && child.name !== 'teamMarker' && !child.userData.skipHitbox) {
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
    if (msg.role) rp.role = String(msg.role).toUpperCase();
    if (msg.commandRank) rp.commandRank = msg.commandRank;
    rp.hp = typeof msg.hp === 'number' ? msg.hp : 100;
    rp.dead = Boolean(msg.dead);
    rp.downed = Boolean(msg.downed);
    rp.crouching = Boolean(msg.crouching);
    rp.prone = Boolean(msg.prone);
    rp.vehicleId = msg.vehicleId || null;
    if (msg.weaponId !== undefined) rp.weaponId = msg.weaponId;
    if (msg.weaponName !== undefined) rp.weaponName = msg.weaponName;
    if (msg.weaponType !== undefined) rp.weaponType = msg.weaponType;
    if (typeof msg.weaponSlot === 'number') rp.weaponSlot = msg.weaponSlot;
    if (msg.skinFinish !== undefined) rp.skinFinish = msg.skinFinish;
    if (msg.attachments !== undefined) rp.attachments = msg.attachments;
    rp.kills = msg.kills || 0;
    rp.deaths = msg.deaths || 0;
    rp.revives = msg.revives || 0;
    rp.medicKills = msg.medicKills || 0;
    rp.planesDestroyed = msg.planesDestroyed || 0;
    rp.tanksDestroyed = msg.tanksDestroyed || 0;
    rp.carsDestroyed = msg.carsDestroyed || 0;
    rp.vehiclesDestroyed = msg.vehiclesDestroyed || 0;
    rp.score = msg.score || 0;

    // Update 3D weapon model in remote player's hands whenever their equipped weapon, skin, or attachments change
    updateSoldierEquippedWeapon(rp.mesh, rp.weaponId, rp.team, {
      skinFinish: rp.skinFinish,
      attachments: rp.attachments,
      role: rp.role
    });

    rp.mesh.visible = !rp.dead && !rp.vehicleId;

    if (msg.pos) {
      rp.pos.fromArray(msg.pos);
      rp.mesh.position.copy(rp.pos);
    }
    if (typeof msg.yaw === 'number') {
      rp.yaw = msg.yaw;
      rp.mesh.rotation.y = rp.yaw + Math.PI;
    }
    if (typeof msg.pitch === 'number') {
      rp.pitch = msg.pitch;
      const parts = rp.mesh.userData?.parts;
      if (parts && parts.weaponRig && parts.headGroup) {
        const clampedPitch = THREE.MathUtils.clamp(-rp.pitch, -0.55, 0.55);
        parts.weaponRig.rotation.x = clampedPitch * 0.65;
        parts.headGroup.rotation.x = clampedPitch * 0.65;
      }
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
    if (msg.senderId) {
      const rp = this.remotePlayers.get(msg.senderId);
      if (rp) {
        rp.muzzleFlashTimer = 0.045;
        if (msg.weaponId && msg.weaponId !== rp.weaponId) {
          rp.weaponId = msg.weaponId;
          updateSoldierEquippedWeapon(rp.mesh, rp.weaponId, rp.team, {
            skinFinish: rp.skinFinish,
            attachments: rp.attachments,
            role: rp.role
          });
        }
      }
    }
    const dist = start.distanceTo(this.player.pos);
    if (dist < 130) {
      sound.playGunshot(msg.soundType || 'rifle', dist, 0, Boolean(msg.silenced));
    }
  }

  getRemoteMeshes() {
    if (this.gameMode !== 'MULTIPLAYER') return [];
    return this.remoteHitMeshes;
  }

  buildLocalStatePacket() {
    const curSlot =
      typeof this.player.currentWeapon === 'function'
        ? this.player.currentWeapon()
        : this.player.slots?.[this.player.currentSlotIndex || 0];
    const curDef = curSlot?.def || null;
    const curWeaponId = curSlot?.weaponId || curDef?.id || 'm4a1';
    const curAttachments =
      curDef?.type === 'gun' && typeof this.player.getWeaponAttachmentMap === 'function'
        ? this.player.getWeaponAttachmentMap(curWeaponId)
        : null;

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
      pitch: this.player.pitch || 0,
      hp: Math.ceil(this.player.hp || 100),
      dead: this.player.dead,
      downed: Boolean(this.player.downed),
      crouching: Boolean(this.player.crouching),
      prone: Boolean(this.player.prone),
      vehicleId: this.player.activeVehicle ? this.player.activeVehicle.id : null,
      weaponId: curWeaponId,
      weaponName: curDef?.shortName || curDef?.name || curWeaponId.toUpperCase(),
      weaponType: curDef?.type || 'gun',
      weaponSlot: this.player.currentSlotIndex || 0,
      skinFinish: curDef?.skinFinish || null,
      attachments: curAttachments ? { ...curAttachments } : null,
      kills: this.player.kills || 0,
      deaths: this.player.deaths || 0,
      revives: this.player.revives || 0,
      medicKills: this.player.medicKills || 0,
      planesDestroyed: this.player.planesDestroyed || 0,
      tanksDestroyed: this.player.tanksDestroyed || 0,
      carsDestroyed: this.player.carsDestroyed || 0,
      vehiclesDestroyed: this.player.vehiclesDestroyed || 0,
      score: this.player.score || 0
    };
  }

  async pollRoomsInfo() {
    if (this.isStaticHost) return;
    try {
      const res = await fetch('/api/mp/rooms', { cache: 'no-store' });
      if (!res.ok) {
        if (res.status === 404 || res.status === 405) this.isStaticHost = true;
        return;
      }
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
    if (this.isStaticHost || this.gameMode !== 'MULTIPLAYER' || this.httpSyncInFlight) return;
    if (this.wsConnected && this.ws && this.ws.readyState === WebSocket.OPEN) return;
    const reqEpoch = this._syncEpoch || 1;
    const reqRoom = this.roomCode;
    this.httpSyncInFlight = true;
    this.transportFSM?.send(NETWORK_TRANSPORT_EVENTS.HTTP_SYNC_START);
    const eventsBatch = this.pendingHttpEvents.splice(0, this.pendingHttpEvents.length);
    try {
      const res = await fetch('/api/mp/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room: reqRoom,
          clientId: this.clientId,
          state: this.buildLocalStatePacket(),
          events: eventsBatch,
          lastSeq: this.lastEventSeq
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (
          data &&
          data.ok &&
          this.gameMode === 'MULTIPLAYER' &&
          this._syncEpoch === reqEpoch &&
          this.roomCode === reqRoom
        ) {
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
      if (this._syncEpoch === reqEpoch) {
        this.httpSyncInFlight = false;
        this.transportFSM?.send(
          this.wsConnected && this.ws && this.ws.readyState === 1
            ? NETWORK_TRANSPORT_EVENTS.HTTP_SYNC_DONE_WS
            : NETWORK_TRANSPORT_EVENTS.HTTP_SYNC_DONE_FALLBACK
        );
      }
    }
  }

  update(dt) {
    if (this.gameMode !== 'MULTIPLAYER') {
      return;
    }

    this.syncTimer += dt;
    if (this.syncTimer >= NETWORK.WS_SYNC_INTERVAL) {
      this.syncTimer = 0;
      this.send(this.buildLocalStatePacket());
    }

    // Reliable HTTP Room Sync every 0.16s ONLY in HTTP fallback mode (when WebSocket is not open)
    if (!(this.wsConnected && this.ws && this.ws.readyState === WebSocket.OPEN)) {
      this.httpSyncTimer += dt;
      if (this.httpSyncTimer >= NETWORK.HTTP_SYNC_INTERVAL) {
        this.httpSyncTimer = 0;
        this.syncHttpNow();
      }
    }

    this.roomPollTimer += dt;
    if (this.roomPollTimer >= NETWORK.ROOM_POLL_INTERVAL) {
      this.roomPollTimer = 0;
      this.pollRoomsInfo();
    }

    // Prune timed-out remote players, decay speech bubbles & animate 3D muzzle flashes
    const now = performance.now();
    for (const [id, rp] of this.remotePlayers.entries()) {
      if (rp.speechBubbleTimer > 0) {
        rp.speechBubbleTimer = Math.max(0, rp.speechBubbleTimer - dt);
      }
      const mFlash = rp.mesh?.userData?.parts?.muzzleFlash;
      if (rp.muzzleFlashTimer > 0) {
        rp.muzzleFlashTimer = Math.max(0, rp.muzzleFlashTimer - dt);
        if (mFlash && mFlash.material) {
          mFlash.material.opacity = 0.92;
          mFlash.rotation.z = Math.random() * Math.PI;
        }
      } else if (mFlash && mFlash.material && mFlash.material.opacity > 0) {
        mFlash.material.opacity = 0;
      }
      if (now - rp.lastSeen > NETWORK.REMOTE_TIMEOUT_MS) {
        this.scene.remove(rp.mesh);
        this.remoteHitMeshes = this.remoteHitMeshes.filter(
          (m) => m.userData?.remotePlayer !== rp
        );
        this.remotePlayers.delete(id);
        if (this._peerSeqState) this._peerSeqState.delete(id);
        if (this.onLobbyUpdated) {
          this.onLobbyUpdated();
        }
      }
    }
  }
}
