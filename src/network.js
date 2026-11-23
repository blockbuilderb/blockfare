import * as THREE from '../vendor/three.module.js';
import { createSoldierMesh, updateSoldierEquippedWeapon } from './bots.js?v=117';
import { sound } from './audio.js?v=117';
import { NETWORK } from './config.js?v=117';
import { events, makeEventBridge } from './events.js?v=117';
import {
  NETWORK_TRANSPORT_EVENTS,
  createNetworkTransportFSM
} from './core/StateMachines.js?v=117';
import { WebRtcTransport } from './network/WebRtcTransport.js?v=117';

function safeStorageGet(key) {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key) || '';
    }
  } catch (_e) {
    // Ignore storage access errors
  }
  return '';
}

function safeStorageSet(key, val) {
  try {
    if (typeof localStorage !== 'undefined') {
      if (val) localStorage.setItem(key, val);
      else localStorage.removeItem(key);
    }
  } catch (_e) {
    // Ignore storage access errors
  }
}

export const DEFAULT_CLOUD_RELAY_WS_URL = 'wss://blockfare-relay.blockbuilderb.workers.dev/ws';

export function normalizeRelayWsUrl(rawUrl) {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return '';
  let normalized = trimmed;
  if (normalized.startsWith('https://')) {
    normalized = 'wss://' + normalized.slice('https://'.length);
  } else if (normalized.startsWith('http://')) {
    normalized = 'ws://' + normalized.slice('http://'.length);
  } else if (!normalized.startsWith('wss://') && !normalized.startsWith('ws://')) {
    normalized = 'wss://' + normalized;
  }
  try {
    const u = new URL(normalized);
    if (!u.pathname || u.pathname === '/') {
      u.pathname = '/ws';
    }
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch (_e) {
    return '';
  }
}

export function deriveRelayHttpOrigin(wsUrl) {
  const clean = normalizeRelayWsUrl(wsUrl);
  if (!clean) return '';
  try {
    const u = new URL(clean);
    const proto = u.protocol === 'wss:' ? 'https:' : 'http:';
    return `${proto}//${u.host}`;
  } catch (_e) {
    return '';
  }
}

export class NetworkManager {
  constructor(scene, world, player, botManager, options = {}) {
    this.scene = scene;
    this.world = world;
    this.player = player;
    this.botManager = botManager;
    this.vehicleManager = options.vehicleManager || null;
    this.gameRef = null; // Wired by BattleBitGame for shared Conquest ticket/flag sync

    this.onPlayerJoinedRoom = makeEventBridge('network:player-joined', (msg) => ({ msg }));
    this.onRemoteCommsMessage = makeEventBridge('network:remote-comms', (msg, rp) => ({ msg, rp }));

    const winLoc =
      typeof window !== 'undefined' && window.location
        ? window.location
        : {
            search: '',
            hostname: '127.0.0.1',
            port: '8080',
            host: 'localhost:8080',
            protocol: 'http:',
            origin: 'http://localhost:8080',
            pathname: '/',
            href: 'http://localhost:8080/'
          };

    this.clientId = options.clientId || 'p_' + Math.random().toString(36).slice(2, 9);
    this.playerId = this.clientId;
    this._txSeq = 0;
    this._peerSeqState = new Map();
    const params = new URLSearchParams(winLoc.search || '');
    const urlMode = (params.get('mode') || '').trim().toUpperCase();
    const urlRoom = (params.get('r') || params.get('room') || '').trim().toUpperCase();
    const urlBots = (params.get('b') || params.get('bots') || '').trim().toUpperCase();
    const urlRelay = params.get('relay') || '';
    this.roomCode = urlRoom || 'FRUGIS-1';

    // Option 2 Live Cloud WebSocket Relay URL (`wss://blockfare-relay.blockbuilderb.workers.dev/ws` by default!)
    const savedRelayMode = safeStorageGet('bb_relay_mode');
    const savedRelay = safeStorageGet('bb_ws_relay');
    if (options.relayWsUrl !== undefined) {
      this.relayWsUrl = normalizeRelayWsUrl(options.relayWsUrl);
    } else if (urlRelay) {
      this.relayWsUrl = normalizeRelayWsUrl(urlRelay);
      if (this.relayWsUrl) {
        safeStorageSet('bb_ws_relay', this.relayWsUrl);
        safeStorageSet('bb_relay_mode', 'CLOUD');
      }
    } else if (savedRelayMode === 'P2P_ONLY') {
      this.relayWsUrl = '';
    } else {
      this.relayWsUrl = normalizeRelayWsUrl(savedRelay || DEFAULT_CLOUD_RELAY_WS_URL);
    }

    // Default to Online Room Mode ('MULTIPLAYER' in room FRUGIS-1):
    // A 1-player room runs 1 You + 499 AI = 500 soldiers identically to Solo, while letting friends drop right in!
    if (
      params.has('solo') ||
      params.has('offline') ||
      urlMode === 'SINGLEPLAYER' ||
      urlMode === 'SOLO' ||
      urlMode === 'OFFLINE'
    ) {
      this.gameMode = 'SINGLEPLAYER';
    } else {
      this.gameMode = 'MULTIPLAYER';
    }

    // Bot population preset: defaults to 'ULTRA_AI' (500P: Humans + AI = 500 total, 250v250)
    if (urlBots === 'NO_AI' || urlBots === 'PVP' || urlBots === '0') {
      this.botPopulateMode = 'NO_AI';
    } else if (urlBots === 'SQUAD_AI' || urlBots === '32') {
      this.botPopulateMode = 'SQUAD_AI';
    } else if (urlBots === 'TACTICAL_AI' || urlBots === '80') {
      this.botPopulateMode = 'TACTICAL_AI';
    } else if (urlBots === 'LARGE_AI' || urlBots === '160') {
      this.botPopulateMode = 'LARGE_AI';
    } else if (urlBots === 'FULL_AI' || urlBots === 'MASSIVE_AI' || urlBots === '250') {
      this.botPopulateMode = 'FULL_AI';
    } else {
      this.botPopulateMode = 'ULTRA_AI';
    }

    const urlName = (params.get('name') || '').trim();
    const savedName = safeStorageGet('bb_callsign').trim();
    this.callsign =
      urlName || savedName || `VIPER_${this.clientId.slice(2, 5).toUpperCase()}`;
    if (this.player) {
      this.player.name = this.callsign;
    }

    this.lanIp = winLoc.hostname || '127.0.0.1';
    this.serverPort = winLoc.port || '8080';
    this.availableRooms = [];
    this.isStaticHost =
      Boolean(options.isStaticHost) ||
      this.lanIp.endsWith('.github.io') ||
      this.lanIp.endsWith('.pages.dev') ||
      this.lanIp.endsWith('.netlify.app') ||
      this.lanIp.endsWith('.vercel.app');

    this.remotePlayers = new Map(); // id -> remotePlayer state
    this.remoteHitMeshes = [];
    this.ws = null;
    this.wsConnected = false;
    this.broadcastChannel = null;
    this.webrtc = new WebRtcTransport({
      clientId: this.clientId,
      roomCode: this.roomCode,
      WebSocketImpl: options.WebSocketImpl,
      RTCPeerConnectionImpl: options.RTCPeerConnectionImpl,
      signalingEndpoints: options.signalingEndpoints,
      onMessage: (msg) => {
        if (
          this.gameMode === 'MULTIPLAYER' &&
          msg &&
          msg.senderId !== this.clientId &&
          (!msg.room || msg.room === this.roomCode)
        ) {
          this.handleMessage(msg);
        }
      },
      onStatusChange: (info) => {
        if (info?.status === 'CONNECTED' && this.gameMode === 'MULTIPLAYER') {
          this._sendJoinAnnounce();
          this.send(this.buildLocalStatePacket());
        }
        if (this.onLobbyUpdated) {
          this.onLobbyUpdated();
        }
      }
    });

    this.syncTimer = 0;
    this.conquestSyncTimer = 0;
    this.httpSyncTimer = 0;
    this.roomPollTimer = 0;
    this._wsHeartbeatTimer = 0;
    this.httpSyncInFlight = false;
    this.pendingHttpEvents = [];
    this.lastEventSeq = 0;
    this._syncEpoch = 1;
    createNetworkTransportFSM(this);

    if (options.autoInitTransports !== false) {
      this._syncBrowserUrlParams();
      this.initTransports();
      this.applyBotPopulationMode();
      if (this.gameMode === 'MULTIPLAYER') {
        this.pollRoomsInfo();
        this.syncHttpNow();
      } else {
        this.pollRoomsInfo();
      }
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

  isRoomAuthority() {
    if (this.webrtc && this.webrtc.active && this.webrtc.isHost()) {
      return true;
    }
    if (this.remotePlayers.size === 0) {
      return true;
    }
    // Deterministic lowest-clientId tie-breaker when on symmetric Cloud/LAN WebSocket relay
    for (const peerId of this.remotePlayers.keys()) {
      if (peerId < this.clientId) return false;
    }
    return true;
  }

  getTransportSummary() {
    if (this.gameMode !== 'MULTIPLAYER') {
      return { mode: 'OFFLINE', label: 'OFFLINE SOLO', isCloudRelay: false, isWebRtc: false };
    }
    const wsOpen = Boolean(this.wsConnected && this.ws && this.ws.readyState === 1);
    if (wsOpen && this.relayWsUrl) {
      return {
        mode: 'CLOUD_RELAY',
        label: '☁️ CLOUD RELAY WSS LIVE',
        isCloudRelay: true,
        isWebRtc: false
      };
    }
    if (wsOpen) {
      return {
        mode: 'LAN_WS',
        label: '📡 LAN WEBSOCKET LIVE',
        isCloudRelay: false,
        isWebRtc: false
      };
    }
    if (this.webrtc && this.webrtc.active) {
      const rtcPeers = this.webrtc.getConnectedPeerCount();
      if (this.webrtc.role === 'HOST') {
        return {
          mode: 'WEBRTC_HOST',
          label:
            rtcPeers > 0
              ? `🌐 P2P WEBRTC HOST (${rtcPeers} PEER${rtcPeers === 1 ? '' : 'S'})`
              : '🌐 P2P WEBRTC HOST READY',
          isCloudRelay: false,
          isWebRtc: true
        };
      }
      if (rtcPeers > 0) {
        return {
          mode: 'WEBRTC_GUEST',
          label: '🌐 P2P WEBRTC CONNECTED',
          isCloudRelay: false,
          isWebRtc: true
        };
      }
      return {
        mode: 'WEBRTC_SIGNALING',
        label: '🌐 P2P WEBRTC SIGNALING...',
        isCloudRelay: false,
        isWebRtc: true
      };
    }
    return {
      mode: 'FALLBACK',
      label: this.isStaticHost ? '🌐 P2P STANDBY' : '📡 HTTP SYNC',
      isCloudRelay: false,
      isWebRtc: false
    };
  }

  setRelayUrl(rawUrl) {
    const clean = normalizeRelayWsUrl(rawUrl);
    const changed = clean !== this.relayWsUrl;
    this.relayWsUrl = clean;
    safeStorageSet('bb_ws_relay', clean);
    safeStorageSet('bb_relay_mode', clean ? 'CLOUD' : 'P2P_ONLY');
    this._syncBrowserUrlParams();

    if (changed) {
      this._closeActiveWebSocket();
      if (this.gameMode === 'MULTIPLAYER') {
        this._connectWebSocketTransport();
        this._syncWebRtcLifecycle();
        this.pollRoomsInfo();
      }
      if (this.onLobbyUpdated) {
        this.onLobbyUpdated();
      }
    }
    return this.relayWsUrl;
  }

  syncDynamicHumanSlots(overrideLocalTeam = null) {
    if (!this.botManager || typeof this.botManager.syncHumanTeamCounts !== 'function') return;
    const myTeam = overrideLocalTeam || this.player?.team || 'US';
    let usHumans = myTeam === 'US' ? 1 : 0;
    let ruHumans = myTeam === 'RU' ? 1 : 0;
    if (this.gameMode === 'MULTIPLAYER') {
      for (const rp of this.remotePlayers.values()) {
        if (rp.team === 'RU') ruHumans++;
        else usHumans++;
      }
    }
    this.botManager.syncHumanTeamCounts(usHumans, ruHumans);
  }

  getTargetBotsPerTeam() {
    if (this.botPopulateMode === 'NO_AI') return 0;
    if (this.botPopulateMode === 'SQUAD_AI') return NETWORK.BOTS_SQUAD_AI;
    if (this.botPopulateMode === 'TACTICAL_AI') return NETWORK.BOTS_TACTICAL_AI || 40;
    if (this.botPopulateMode === 'LARGE_AI') return NETWORK.BOTS_LARGE_AI || 80;
    if (this.botPopulateMode === 'ULTRA_AI') return NETWORK.BOTS_ULTRA_AI || 250;
    return NETWORK.BOTS_FULL_AI || 125;
  }

  applyBotPopulationMode() {
    if (!this.botManager || typeof this.botManager.setBotCountPerSide !== 'function') return;
    const countPerSide = this.getTargetBotsPerTeam();
    if (countPerSide <= 0) {
      this.botManager.setBotCountPerSide(0, { playerTeam: null });
      return;
    }
    const playerTeam = this.player?.team || 'US';
    this.botManager.setBotCountPerSide(countPerSide, { playerTeam });
    this.syncDynamicHumanSlots(playerTeam);
    if (this.gameRef && typeof this.gameRef.syncMatchTicketsForArmyScale === 'function') {
      this.gameRef.syncMatchTicketsForArmyScale(countPerSide);
    }
  }

  setBotPopulateMode(botMode) {
    const validModes = [
      'ULTRA_AI',
      'FULL_AI',
      'MASSIVE_AI',
      'LARGE_AI',
      'TACTICAL_AI',
      'SQUAD_AI',
      'NO_AI'
    ];
    const clean = validModes.includes(botMode) ? botMode : 'ULTRA_AI';
    this.botPopulateMode =
      this.gameMode === 'SINGLEPLAYER' && clean === 'NO_AI' ? 'ULTRA_AI' : clean;
    this.applyBotPopulationMode();
    if (this.onLobbyUpdated) {
      this.onLobbyUpdated();
    }
    return this.botPopulateMode;
  }

  _releaseRemoteVehicleForPlayer(rpId) {
    const vm = this.vehicleManager || this.world?.vehicleManager;
    if (!vm || !Array.isArray(vm.vehicles)) return;
    for (let i = 0; i < vm.vehicles.length; i++) {
      const v = vm.vehicles[i];
      if (v && v.remoteDriverId === rpId) {
        v.remoteDriverId = null;
      }
    }
  }

  clearRemotePlayers() {
    for (const [id, rp] of this.remotePlayers.entries()) {
      this._releaseRemoteVehicleForPlayer(id);
      if (rp.mesh && this.scene) {
        this.scene.remove(rp.mesh);
      }
    }
    this.remotePlayers.clear();
    this.remoteHitMeshes = [];
    if (this._peerSeqState) this._peerSeqState.clear();
    this.syncDynamicHumanSlots();
  }

  _syncBrowserUrlParams() {
    if (typeof window === 'undefined' || !window.history || !window.location) return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('room');
      url.searchParams.delete('bots');
      if (this.gameMode === 'MULTIPLAYER') {
        url.searchParams.delete('mode');
        url.searchParams.delete('solo');
        url.searchParams.delete('offline');
        if (this.roomCode && this.roomCode !== 'FRUGIS-1') {
          url.searchParams.set('r', this.roomCode);
        } else {
          url.searchParams.delete('r');
        }
        if (this.relayWsUrl && this.relayWsUrl !== DEFAULT_CLOUD_RELAY_WS_URL) {
          url.searchParams.set('relay', this.relayWsUrl);
        } else {
          url.searchParams.delete('relay');
        }
      } else {
        url.searchParams.delete('r');
        url.searchParams.set('mode', 'solo');
      }
      window.history.replaceState({}, '', url.toString());
    } catch (_e) {
      // Ignore URL update errors
    }
  }

  _sendJoinAnnounce() {
    if (!this.player) return;
    this.send({
      type: 'join_announce',
      name: this.callsign,
      team: this.player.team,
      squad: this.player.squad || 'ALPHA',
      role: String(this.player.role || 'engineer').toUpperCase(),
      commandRank: this.player.commandRank || 'COMMANDER'
    });
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
    this._syncBrowserUrlParams();

    if (this.gameMode === 'SINGLEPLAYER') {
      this.transportFSM?.send(NETWORK_TRANSPORT_EVENTS.DISABLE_MP);
      if (this.webrtc) this.webrtc.stop(false);
      this.clearRemotePlayers();
      this.pendingHttpEvents = [];
    } else if (modeChanged || this.gameMode === 'MULTIPLAYER') {
      if (this.wsConnected && this.ws && this.ws.readyState === 1) {
        this.transportFSM?.send(NETWORK_TRANSPORT_EVENTS.ENABLE_MP_WS_READY);
      } else {
        this.transportFSM?.send(NETWORK_TRANSPORT_EVENTS.ENABLE_MP_HTTP_FALLBACK);
        this._connectWebSocketTransport();
      }
      this._syncWebRtcLifecycle();
      this._sendJoinAnnounce();
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
    if (this.player) this.player.name = clean;
    safeStorageSet('bb_callsign', clean);
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
    safeStorageSet('bb_room', clean);
    this._syncBrowserUrlParams();

    if (changed) {
      this._syncEpoch = (this._syncEpoch || 1) + 1;
      this.clearRemotePlayers();
      this.lastEventSeq = 0;
      if (this.relayWsUrl) {
        // Reconnect Cloud Relay socket to the newly selected Durable Object room
        this._closeActiveWebSocket();
        if (this.gameMode === 'MULTIPLAYER') {
          this._connectWebSocketTransport();
        }
      }
      if (this.webrtc) {
        this.webrtc.setRoom(clean);
      }
    }

    if (this.gameMode === 'MULTIPLAYER') {
      this._syncWebRtcLifecycle();
      this._sendJoinAnnounce();
      this.syncHttpNow();
      this.pollRoomsInfo();
    }
    return this.roomCode;
  }

  getShareUrl(useLan = true) {
    const winLoc =
      typeof window !== 'undefined' && window.location
        ? window.location
        : {
            protocol: 'http:',
            host: `localhost:${this.serverPort}`,
            origin: `http://localhost:${this.serverPort}`,
            pathname: '/'
          };

    const queryParts = [];
    if (this.roomCode && this.roomCode !== 'FRUGIS-1') {
      queryParts.push(`r=${encodeURIComponent(this.roomCode)}`);
    }
    if (this.botPopulateMode !== 'ULTRA_AI') {
      queryParts.push(`b=${encodeURIComponent(this.botPopulateMode)}`);
    }
    if (this.relayWsUrl && this.relayWsUrl !== DEFAULT_CLOUD_RELAY_WS_URL) {
      queryParts.push(`relay=${encodeURIComponent(this.relayWsUrl)}`);
    }
    const qs = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

    // On static hosts (GitHub Pages / Cloudflare Pages / Vercel), preserve exact origin + repo subpath!
    if (this.isStaticHost) {
      const basePath = (winLoc.pathname || '/').endsWith('/')
        ? winLoc.pathname || '/'
        : `${winLoc.pathname}/`;
      return `${winLoc.origin}${basePath}${qs}`;
    }

    const host =
      useLan && this.lanIp && this.lanIp !== '0.0.0.0'
        ? `${this.lanIp}:${this.serverPort}`
        : winLoc.host || `localhost:${this.serverPort}`;
    return `${winLoc.protocol}//${host}/${qs}`;
  }

  openCoopTestWindow() {
    this.setGameMode('MULTIPLAYER');
    const baseShare = this.getShareUrl(false);
    const randSuffix = Math.floor(10 + Math.random() * 89);
    const sep = baseShare.includes('?') ? '&' : '?';
    const url = `${baseShare}${sep}name=ALLY_${randSuffix}`;
    if (typeof window !== 'undefined' && typeof window.open === 'function') {
      window.open(url, '_blank');
    }
    return url;
  }

  _closeActiveWebSocket() {
    if (this.ws) {
      const sock = this.ws;
      this.ws = null;
      this.wsConnected = false;
      sock.onopen = null;
      sock.onmessage = null;
      sock.onclose = null;
      sock.onerror = null;
      try {
        sock.close();
      } catch (_e) {
        // Ignore
      }
      this.transportFSM?.send(NETWORK_TRANSPORT_EVENTS.WS_CLOSE_OR_ERROR);
    }
  }

  _buildTargetWebSocketUrl() {
    if (this.relayWsUrl) {
      const sep = this.relayWsUrl.includes('?') ? '&' : '?';
      return `${this.relayWsUrl}${sep}room=${encodeURIComponent(this.roomCode)}`;
    }
    if (this.isStaticHost) {
      return '';
    }
    if (typeof window === 'undefined' || !window.location) return '';
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws`;
  }

  _connectWebSocketTransport() {
    if (typeof WebSocket === 'undefined') return;
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;
    const wsUrl = this._buildTargetWebSocketUrl();
    if (!wsUrl) {
      this.wsConnected = false;
      return;
    }

    try {
      const ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        this.wsConnected = true;
        this.ws = ws;
        this.transportFSM?.send(NETWORK_TRANSPORT_EVENTS.WS_OPEN);
        this._syncWebRtcLifecycle();
        if (this.gameMode === 'MULTIPLAYER') {
          this._sendJoinAnnounce();
          this.send(this.buildLocalStatePacket());
        }
        if (this.onLobbyUpdated) {
          this.onLobbyUpdated();
        }
      };

      ws.onmessage = (ev) => {
        if (this.gameMode !== 'MULTIPLAYER') return;
        try {
          const msg = JSON.parse(ev.data);
          if (!msg || msg.type === 'pong') return;
          if (
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
        if (this.ws === ws) {
          this.ws = null;
        }
        this.wsConnected = false;
        this.transportFSM?.send(NETWORK_TRANSPORT_EVENTS.WS_CLOSE_OR_ERROR);
        this._syncWebRtcLifecycle();
        if (this.onLobbyUpdated) {
          this.onLobbyUpdated();
        }
      };

      ws.onerror = () => {
        this.wsConnected = false;
        this.transportFSM?.send(NETWORK_TRANSPORT_EVENTS.WS_CLOSE_OR_ERROR);
        this._syncWebRtcLifecycle();
      };
    } catch (_e) {
      this.wsConnected = false;
      this.transportFSM?.send(NETWORK_TRANSPORT_EVENTS.WS_CLOSE_OR_ERROR);
      this._syncWebRtcLifecycle();
    }
  }

  _syncWebRtcLifecycle() {
    if (!this.webrtc) return;
    if (this.gameMode !== 'MULTIPLAYER') {
      if (this.webrtc.active) this.webrtc.stop(false);
      return;
    }
    // Option 1 (Zero-Server WebRTC P2P) runs whenever no dedicated Cloud Relay WSS is open,
    // enabling instant Internet Multiplayer on GitHub Pages (and automatic P2P fallback if Cloud Relay drops)!
    const cloudRelayOpen = Boolean(
      this.relayWsUrl && this.wsConnected && this.ws && this.ws.readyState === 1
    );
    if (cloudRelayOpen) {
      if (this.webrtc.active) this.webrtc.stop(false);
    } else if (!this.webrtc.active) {
      this.webrtc.start(this.roomCode);
    }
  }

  initTransports() {
    // 1. Browser BroadcastChannel for instant 0ms multi-tab local testing
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

    // 2. Option 2 Cloud Relay WebSocket (`wss://...`) or Local `server.py` LAN WebSocket (`/ws`)
    this._connectWebSocketTransport();

    // 3. Option 1 Zero-Server WebRTC P2P Internet Rooms (active automatically in Multiplayer!)
    this._syncWebRtcLifecycle();
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

    const isUnreliableState = payload.type === 'state';

    // Always echo to same-browser BroadcastChannel for 0ms local +2P tab testing
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage(packet);
    }

    // Option 1: Send over WebRTC DataChannels (`fast` UDP-style for state, `reliable` for combat events)
    if (this.webrtc && this.webrtc.active) {
      this.webrtc.send(packet, !isUnreliableState);
    }

    // Option 2 / LAN: Send over open WebSocket (Cloud Relay WSS or local server.py /ws)
    const wsOpen = Boolean(
      this.wsConnected && this.ws && this.ws.readyState === 1
    );
    if (wsOpen) {
      try {
        this.ws.send(JSON.stringify(packet));
      } catch (_e) {
        // Ignore transient WS send error
      }
      return;
    }

    // HTTP Fallback Event Queue (when using server.py or Cloud Relay HTTP without open WS)
    if ((!this.isStaticHost || this.relayWsUrl) && !isUnreliableState) {
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
        this.world?.destroyVoxel?.(msg.gx, msg.gy, msg.gz, true);
        break;
      case 'voxel_add':
        this.world?.addVoxel?.(msg.gx, msg.gy, msg.gz, msg.mat || 'sandbag');
        break;
      case 'player_hit':
        if (msg.targetId === this.clientId && this.player) {
          this.player.takeDamage(
            msg.damage,
            msg.attackerName,
            msg.attackerTeam,
            msg.weapon,
            this.player.onKillEvent
          );
        }
        break;
      case 'veh_hit':
        this.handleRemoteVehicleHit(msg);
        break;
      case 'kill_sync':
        if (msg.killer && msg.victim) {
          events.emit('kill:event', {
            killer: msg.killer,
            kTeam: msg.kTeam,
            victim: msg.victim,
            vTeam: msg.vTeam,
            weapon: msg.weapon || 'FIREARM',
            isHs: Boolean(msg.isHs),
            _fromNetwork: true
          });
        }
        break;
      case 'conquest_sync':
        this.applyRemoteConquestSync(msg);
        break;
      case 'order_sync': {
        if (msg.team === this.player?.team && this.botManager) {
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

  handleRemoteVehicleHit(msg) {
    const vm = this.vehicleManager || this.world?.vehicleManager;
    if (!vm || !Array.isArray(vm.vehicles) || !msg.vehicleId) return;
    const veh = vm.vehicles.find((v) => v.id === msg.vehicleId);
    if (!veh || veh.dead) return;

    // Apply authoritative damage if we are driving this vehicle or we are Room Authority
    const isMyVehicle = Boolean(this.player && this.player.activeVehicle === veh);
    if (!isMyVehicle && veh.remoteDriverId && veh.remoteDriverId !== this.clientId) {
      return;
    }
    const srcPos = Array.isArray(msg.attackerPos)
      ? new THREE.Vector3().fromArray(msg.attackerPos)
      : null;
    veh._receivingRemoteDamage = true;
    try {
      vm.damageVehicle(
        veh,
        msg.damage || 25,
        msg.attackerName || 'ENEMY PLAYER',
        msg.attackerTeam || (veh.team === 'US' ? 'RU' : 'US'),
        msg.weapon || 'ANTI-ARMOR',
        this.player?.onKillEvent || null,
        null,
        srcPos
      );
    } finally {
      veh._receivingRemoteDamage = false;
    }
  }

  buildConquestSyncPacket() {
    const g = this.gameRef;
    if (!g || !this.world?.flags) return null;
    return {
      type: 'conquest_sync',
      ticketsUS: Math.round(g.ticketsUS ?? 400),
      ticketsRU: Math.round(g.ticketsRU ?? 400),
      matchTimeRemaining: Number((g.matchTimeRemaining ?? 900).toFixed(1)),
      flags: this.world.flags.map((f) => ({
        id: f.id,
        owner: f.owner,
        prog: Math.round(f.captureProgress || 0)
      }))
    };
  }

  applyRemoteConquestSync(msg) {
    if (this.isRoomAuthority()) return;
    const g = this.gameRef;
    if (g) {
      if (typeof msg.ticketsUS === 'number') g.ticketsUS = msg.ticketsUS;
      if (typeof msg.ticketsRU === 'number') g.ticketsRU = msg.ticketsRU;
      if (typeof msg.matchTimeRemaining === 'number') {
        g.matchTimeRemaining = msg.matchTimeRemaining;
      }
    }
    if (Array.isArray(msg.flags) && Array.isArray(this.world?.flags)) {
      for (let i = 0; i < msg.flags.length; i++) {
        const sf = msg.flags[i];
        const localFlag = this.world.flags.find((fl) => fl.id === sf.id);
        if (localFlag) {
          localFlag.owner = sf.owner || localFlag.owner;
          if (typeof sf.prog === 'number') {
            localFlag.captureProgress = sf.prog;
          }
        }
      }
    }
  }

  _applyRemoteVehicleState(rp, vehState) {
    const vm = this.vehicleManager || this.world?.vehicleManager;
    if (!vm || !Array.isArray(vm.vehicles)) return;

    if (!vehState || !vehState.id) {
      if (rp._lastVehicleId) {
        this._releaseRemoteVehicleForPlayer(rp.id);
        rp._lastVehicleId = null;
      }
      return;
    }

    if (rp._lastVehicleId && rp._lastVehicleId !== vehState.id) {
      this._releaseRemoteVehicleForPlayer(rp.id);
    }
    rp._lastVehicleId = vehState.id;

    const v = vm.vehicles.find((cand) => cand.id === vehState.id);
    if (!v || (this.player && this.player.activeVehicle === v)) return;

    if (v.npcDriver) {
      v.npcDriver.drivingVehicle = null;
      v.npcDriver = null;
    }
    v.aiPilotActive = false;
    v.remoteDriverId = rp.id;
    v.team = rp.team || v.team;

    if (Array.isArray(vehState.pos)) {
      if (!v._remoteTargetPos) v._remoteTargetPos = new THREE.Vector3();
      v._remoteTargetPos.fromArray(vehState.pos);
      if (v.pos.distanceToSquared(v._remoteTargetPos) > 45 * 45) {
        v.pos.copy(v._remoteTargetPos);
      }
    }
    if (typeof vehState.yaw === 'number') v._remoteTargetYaw = vehState.yaw;
    if (typeof vehState.pitch === 'number') v._remoteTargetPitch = vehState.pitch;
    if (typeof vehState.roll === 'number') v._remoteTargetRoll = vehState.roll;
    if (typeof vehState.turretYaw === 'number') v.turretYaw = vehState.turretYaw;
    if (typeof vehState.turretPitch === 'number') v.turretPitch = vehState.turretPitch;
    if (typeof vehState.forwardSpeed === 'number') v.forwardSpeed = vehState.forwardSpeed;
    if (typeof vehState.hp === 'number') v.hp = vehState.hp;
    if (typeof vehState.flareActiveTimer === 'number') v.flareActiveTimer = vehState.flareActiveTimer;
    if (typeof vehState.isShotDown === 'boolean') v.isShotDown = vehState.isShotDown;
    if (!v.dead && v.mesh) v.mesh.visible = true;
  }

  updateRemotePlayer(msg) {
    let rp = this.remotePlayers.get(msg.senderId);
    const rank = msg.commandRank || 'COMMANDER';
    const role = (msg.role || 'ENGINEER').toUpperCase();

    if (!rp) {
      const mesh = createSoldierMesh(msg.team || 'US', role, rank);
      if (this.scene) this.scene.add(mesh);
      rp = {
        id: msg.senderId,
        name: msg.name || `PLAYER_${msg.senderId.slice(2, 5)}`,
        team: msg.team || 'US',
        squad: msg.squad || 'ALPHA',
        role,
        commandRank: rank,
        pos: new THREE.Vector3(),
        targetPos: new THREE.Vector3(),
        yaw: 0,
        targetYaw: 0,
        pitch: 0,
        walkPhase: 0,
        hp: 100,
        dead: false,
        downed: false,
        crouching: false,
        prone: false,
        vehicleId: null,
        _lastVehicleId: null,
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
    const prevTeam = rp.team;
    if (msg.name) rp.name = msg.name;
    rp.team = msg.team || rp.team;
    if (rp.team !== prevTeam || !rp._slotSynced) {
      rp._slotSynced = true;
      this.syncDynamicHumanSlots();
    }
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

    // Update 3D weapon model in remote player's hands ONLY when weapon/skin/attachments signature changes
    const wepSig = `${rp.weaponId || ''}|${rp.skinFinish || ''}|${
      rp.attachments ? JSON.stringify(rp.attachments) : ''
    }|${rp.team}|${rp.role}`;
    if (rp._lastWepSig !== wepSig) {
      rp._lastWepSig = wepSig;
      updateSoldierEquippedWeapon(rp.mesh, rp.weaponId, rp.team, {
        skinFinish: rp.skinFinish,
        attachments: rp.attachments,
        role: rp.role
      });
    }

    rp.mesh.visible = !rp.dead && !rp.vehicleId;

    if (msg.pos) {
      rp.targetPos.fromArray(msg.pos);
      if (!rp._hasInitialPos || rp.pos.distanceToSquared(rp.targetPos) > 25 * 25) {
        rp._hasInitialPos = true;
        rp.pos.copy(rp.targetPos);
        rp.mesh.position.copy(rp.pos);
      }
    }
    if (typeof msg.yaw === 'number') {
      rp.targetYaw = msg.yaw;
      if (!rp._hasInitialYaw) {
        rp._hasInitialYaw = true;
        rp.yaw = msg.yaw;
        rp.mesh.rotation.y = rp.yaw + Math.PI;
      }
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

    this._applyRemoteVehicleState(rp, msg.vehState || null);
  }

  handleRemoteShoot(msg) {
    if (!msg.origin || !msg.end) return;
    const start = new THREE.Vector3().fromArray(msg.origin);
    const end = new THREE.Vector3().fromArray(msg.end);
    if (msg.isTracer !== false && this.botManager?.spawnTracer) {
      this.botManager.spawnTracer(start, end, 0xffeaa7);
    }
    if (msg.senderId) {
      const rp = this.remotePlayers.get(msg.senderId);
      if (rp) {
        rp.muzzleFlashTimer = 0.045;
      }
    }
    if (this.player?.pos) {
      const dist = start.distanceTo(this.player.pos);
      if (dist < 130) {
        sound.playGunshot(msg.soundType || 'rifle', dist, 0, Boolean(msg.silenced));
      }
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

    const av = this.player.activeVehicle;
    const vehState =
      av && !av.dead
        ? {
            id: av.id,
            type: av.type,
            aircraftRole: av.aircraftRole || null,
            pos: [
              Number(av.pos.x.toFixed(2)),
              Number(av.pos.y.toFixed(2)),
              Number(av.pos.z.toFixed(2))
            ],
            yaw: Number((av.yaw || 0).toFixed(4)),
            pitch: Number((av.pitch || 0).toFixed(4)),
            roll: Number((av.roll || 0).toFixed(4)),
            turretYaw: Number(((av.turretYaw ?? av.yaw) || 0).toFixed(4)),
            turretPitch: Number(((av.turretPitch ?? av.pitch) || 0).toFixed(4)),
            forwardSpeed: Number((av.forwardSpeed || 0).toFixed(2)),
            hp: Math.ceil(av.hp || 0),
            flareActiveTimer: Number((av.flareActiveTimer || 0).toFixed(2)),
            isShotDown: Boolean(av.isShotDown)
          }
        : null;

    return {
      type: 'state',
      room: this.roomCode,
      name: this.callsign,
      team: this.player.team,
      squad: this.player.squad || 'ALPHA',
      role: String(this.player.role || 'engineer').toUpperCase(),
      commandRank: this.player.commandRank || 'COMMANDER',
      pos: [
        Number(this.player.pos.x.toFixed(2)),
        Number(this.player.pos.y.toFixed(2)),
        Number(this.player.pos.z.toFixed(2))
      ],
      yaw: Number((this.player.yaw || 0).toFixed(4)),
      pitch: Number((this.player.pitch || 0).toFixed(4)),
      hp: Math.ceil(this.player.hp || 100),
      dead: this.player.dead,
      downed: Boolean(this.player.downed),
      crouching: Boolean(this.player.crouching),
      prone: Boolean(this.player.prone),
      vehicleId: av ? av.id : null,
      vehState,
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

  _getHttpApiBase() {
    if (this.relayWsUrl) {
      return deriveRelayHttpOrigin(this.relayWsUrl);
    }
    if (this.isStaticHost) return '';
    return '';
  }

  async pollRoomsInfo() {
    if (this.isStaticHost && !this.relayWsUrl) return;
    if (typeof fetch !== 'function') return;
    const apiBase = this._getHttpApiBase();
    const roomsUrl = this.relayWsUrl
      ? `${apiBase}/api/mp/rooms?room=${encodeURIComponent(this.roomCode)}`
      : '/api/mp/rooms';
    try {
      const res = await fetch(roomsUrl, { cache: 'no-store' });
      if (!res.ok) {
        if (!this.relayWsUrl && (res.status === 404 || res.status === 405)) {
          this.isStaticHost = true;
        }
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
    if ((this.isStaticHost && !this.relayWsUrl) || this.gameMode !== 'MULTIPLAYER' || this.httpSyncInFlight) {
      return;
    }
    if (typeof fetch !== 'function') return;
    if (this.wsConnected && this.ws && this.ws.readyState === 1) return;
    if (this.webrtc && this.webrtc.getConnectedPeerCount() > 0) return;

    const reqEpoch = this._syncEpoch || 1;
    const reqRoom = this.roomCode;
    const apiBase = this._getHttpApiBase();
    const syncUrl = this.relayWsUrl ? `${apiBase}/api/mp/sync` : '/api/mp/sync';

    this.httpSyncInFlight = true;
    this.transportFSM?.send(NETWORK_TRANSPORT_EVENTS.HTTP_SYNC_START);
    const eventsBatch = this.pendingHttpEvents.splice(0, this.pendingHttpEvents.length);
    try {
      const res = await fetch(syncUrl, {
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

  _interpolateRemoteEntities(dt) {
    const blend = Math.min(1, dt * 15);
    for (const rp of this.remotePlayers.values()) {
      if (rp.targetPos) {
        const dx = rp.targetPos.x - rp.pos.x;
        const dz = rp.targetPos.z - rp.pos.z;
        const horizDist = Math.hypot(dx, dz);
        rp.pos.lerp(rp.targetPos, blend);
        rp.mesh.position.copy(rp.pos);

        // Animate 3D leg & arm stride when remote human player runs!
        const parts = rp.mesh.userData?.parts;
        if (parts && parts.leftLeg && parts.rightLeg && !rp.downed && !rp.prone) {
          if (horizDist > 0.025) {
            rp.walkPhase = (rp.walkPhase || 0) + dt * 11;
            const swing = Math.sin(rp.walkPhase) * 0.55;
            parts.leftLeg.rotation.x = swing;
            parts.rightLeg.rotation.x = -swing;
          } else {
            parts.leftLeg.rotation.x *= 0.82;
            parts.rightLeg.rotation.x *= 0.82;
          }
        }
      }
      if (typeof rp.targetYaw === 'number') {
        let dy = rp.targetYaw - rp.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        rp.yaw += dy * blend;
        rp.mesh.rotation.y = rp.yaw + Math.PI;
      }
    }

    // Smoothly interpolate any vehicle currently driven/piloted by a remote human player
    const vm = this.vehicleManager || this.world?.vehicleManager;
    if (vm && Array.isArray(vm.vehicles)) {
      for (let i = 0; i < vm.vehicles.length; i++) {
        const v = vm.vehicles[i];
        if (!v || !v.remoteDriverId || v.dead) continue;
        if (v._remoteTargetPos) {
          v.pos.lerp(v._remoteTargetPos, blend);
        }
        if (typeof v._remoteTargetYaw === 'number') {
          let dy = v._remoteTargetYaw - (v.yaw || 0);
          while (dy > Math.PI) dy -= Math.PI * 2;
          while (dy < -Math.PI) dy += Math.PI * 2;
          v.yaw = (v.yaw || 0) + dy * blend;
        }
        if (typeof v._remoteTargetPitch === 'number') {
          v.pitch = THREE.MathUtils.lerp(v.pitch || 0, v._remoteTargetPitch, blend);
        }
        if (typeof v._remoteTargetRoll === 'number') {
          v.roll = THREE.MathUtils.lerp(v.roll || 0, v._remoteTargetRoll, blend);
        }
        if (v.mesh) {
          v.mesh.position.copy(v.pos);
          v.mesh.rotation.set(v.pitch || 0, v.yaw || 0, v.roll || 0, 'YXZ');
          if (v.turretGroup && !v.isAircraft && typeof v.turretYaw === 'number') {
            v.turretGroup.rotation.y = v.turretYaw - (v.yaw || 0);
          }
        }
      }
    }
  }

  update(dt) {
    if (this.gameMode !== 'MULTIPLAYER') {
      return;
    }

    this._interpolateRemoteEntities(dt);

    this.syncTimer += dt;
    if (this.syncTimer >= NETWORK.WS_SYNC_INTERVAL) {
      this.syncTimer = 0;
      this.send(this.buildLocalStatePacket());
    }

    // Room Host broadcasts 2 Hz Conquest ticket/clock/flag sync when human peers are connected
    if (this.remotePlayers.size > 0 && this.isRoomAuthority()) {
      this.conquestSyncTimer += dt;
      if (this.conquestSyncTimer >= 0.5) {
        this.conquestSyncTimer = 0;
        const cqPkt = this.buildConquestSyncPacket();
        if (cqPkt) this.send(cqPkt);
      }
    }

    // Keep Cloud Relay Durable Object WebSocket warm across idle periods
    if (this.wsConnected && this.ws && this.ws.readyState === 1 && this.relayWsUrl) {
      this._wsHeartbeatTimer += dt;
      if (this._wsHeartbeatTimer >= 15) {
        this._wsHeartbeatTimer = 0;
        try {
          this.ws.send(JSON.stringify({ type: 'ping' }));
        } catch (_e) {
          // Ignore
        }
      }
    }

    // Reliable HTTP Room Sync every 0.16s ONLY in HTTP fallback mode (when neither WS nor WebRTC is connected)
    const wsOpen = Boolean(this.wsConnected && this.ws && this.ws.readyState === 1);
    const rtcOpen = Boolean(this.webrtc && this.webrtc.getConnectedPeerCount() > 0);
    if (!wsOpen && !rtcOpen) {
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
        this._releaseRemoteVehicleForPlayer(id);
        if (this.scene && rp.mesh) this.scene.remove(rp.mesh);
        this.remoteHitMeshes = this.remoteHitMeshes.filter(
          (m) => m.userData?.remotePlayer !== rp
        );
        this.remotePlayers.delete(id);
        if (this._peerSeqState) this._peerSeqState.delete(id);
        this.syncDynamicHumanSlots();
        if (this.onLobbyUpdated) {
          this.onLobbyUpdated();
        }
      }
    }
  }
}
