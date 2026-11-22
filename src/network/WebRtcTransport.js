/**
 * Zero-Server WebRTC P2P Swarm Mesh Transport (`WebRtcTransport`)
 *
 * Uses live-verified WebTorrent Swarm WebSocket Signaling (`wss://tracker.openwebtorrent.com`)
 * + Vanilla ICE (`stun:stun.l.google.com:19302`, `stun:stun.cloudflare.com:3478`) so players
 * anywhere on the internet (or Normal + Incognito browsers on the same PC!) opening
 * `https://blockbuilderb.github.io/blockfare/?mode=multiplayer&room=FRUGIS-1` discover each
 * other automatically with $0 backend setup:
 *
 * - Deterministic 20-byte ASCII `info_hash` derived from `roomCode`.
 * - Dual `RTCDataChannel`s per peer:
 *   * `fast`: `{ ordered: false, maxRetransmits: 0 }` (UDP-style 20 Hz state & vehicle sync)
 *   * `reliable`: `{ ordered: true }` (shots, PvP hits, vehicle hits, voxel destruction, kills)
 * - Glare-safe deterministic tie-breaking when two peers announce simultaneously.
 */

const DEFAULT_SIGNALING_ENDPOINTS = ['wss://tracker.openwebtorrent.com'];

const DEFAULT_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' }
];

const ICE_GATHER_TIMEOUT_MS = 850;
const REANNOUNCE_INTERVAL_MS = 12000;
const OFFER_BATCH_SIZE = 3;

/**
 * Generates a deterministic 20-character printable-ASCII `info_hash` (exact 20 bytes)
 * for any room code so WebTorrent trackers group all players in `roomCode` together.
 */
export function buildDeterministicRoomInfoHash(roomCode) {
  const clean =
    String(roomCode || 'FRUGIS-1')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '')
      .slice(0, 24) || 'FRUGIS-1';
  const seedStr = `blockfare-mp-v1:${clean}`;
  const alphabet = '0123456789abcdef';
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  const out = [];
  for (let i = 0; i < 20; i++) {
    for (let j = 0; j < seedStr.length; j++) {
      h1 ^= seedStr.charCodeAt(j) + i * 31;
      h1 = Math.imul(h1, 0x01000193) >>> 0;
      h2 ^= h1 + j * 17;
      h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
    }
    out.push(alphabet[(h1 ^ (h2 >>> 4)) & 15]);
  }
  return out.join('');
}

export const buildDeterministicHostPeerId = buildDeterministicRoomInfoHash;

function generateTwentyBytePeerId(clientId) {
  const slug = String(clientId || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .padEnd(6, '0')
    .slice(0, 6);
  let rand = '';
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 6; i++) {
    rand += chars[Math.floor(Math.random() * chars.length)];
  }
  // Exact 20 ASCII chars: '-BF0113-' (8) + slug (6) + rand (6) = 20
  return `-BF0113-${slug}${rand}`;
}

export class WebRtcTransport {
  constructor(options = {}) {
    this.clientId = options.clientId || 'p_' + Math.random().toString(36).slice(2, 9);
    this.roomCode = options.roomCode || 'FRUGIS-1';
    this.onMessage = options.onMessage || null;
    this.onStatusChange = options.onStatusChange || null;
    this.signalingEndpoints = options.signalingEndpoints || DEFAULT_SIGNALING_ENDPOINTS;
    this.iceServers = options.iceServers || DEFAULT_ICE_SERVERS;
    this.iceGatherTimeoutMs = options.iceGatherTimeoutMs ?? ICE_GATHER_TIMEOUT_MS;

    this.WebSocketImpl =
      options.WebSocketImpl || (typeof WebSocket !== 'undefined' ? WebSocket : null);
    this.RTCPeerConnectionImpl =
      options.RTCPeerConnectionImpl ||
      (typeof RTCPeerConnection !== 'undefined' ? RTCPeerConnection : null);

    this.active = false;
    this.role = 'OFFLINE'; // 'OFFLINE' | 'HOST' | 'GUEST'
    this.status = 'OFFLINE'; // 'OFFLINE' | 'SIGNALING' | 'HOST_READY' | 'CONNECTED'
    this.myPeerId = generateTwentyBytePeerId(this.clientId);
    this.infoHash = buildDeterministicRoomInfoHash(this.roomCode);

    this._sigWs = null;
    this._sigEndpointIdx = 0;
    this._announceInterval = null;
    this._reconnectTimer = null;
    this._epoch = 0;

    // Connected / connecting remote peers: remotePeerId -> { peerId, pc, fastDc, reliableDc, isInitiator }
    this.peers = new Map();
    // Unclaimed outgoing offer pool: offerId -> { offerId, pc, fastDc, reliableDc, createdAt }
    this.pendingOffers = new Map();
  }

  isSupported() {
    return Boolean(this.WebSocketImpl && this.RTCPeerConnectionImpl);
  }

  getConnectedPeerCount() {
    let n = 0;
    for (const peer of this.peers.values()) {
      if (this._isPeerOpen(peer)) n++;
    }
    return n;
  }

  isHost() {
    if (!this.active) return false;
    for (const [remotePeerId, peer] of this.peers.entries()) {
      if (this._isPeerOpen(peer) && remotePeerId < this.myPeerId) {
        return false;
      }
    }
    return true;
  }

  isConnected() {
    if (!this.active) return false;
    return this.status === 'HOST_READY' || this.status === 'CONNECTED';
  }

  start(roomCode = this.roomCode) {
    this.roomCode = roomCode || 'FRUGIS-1';
    this.infoHash = buildDeterministicRoomInfoHash(this.roomCode);
    this.stop(false);
    if (!this.isSupported()) {
      this._setStatus('UNSUPPORTED', 'OFFLINE');
      return false;
    }
    this.active = true;
    const epoch = ++this._epoch;
    this._setStatus('SIGNALING', 'HOST');
    this._openTrackerSocket(epoch);
    return true;
  }

  stop(notify = true) {
    this.active = false;
    this._epoch++;
    if (this._announceInterval) {
      clearInterval(this._announceInterval);
      this._announceInterval = null;
    }
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this._closeAllPendingOffers();
    this._closeAllPeers();
    this._closeSignaling();
    if (notify) {
      this._setStatus('OFFLINE', 'OFFLINE');
    } else {
      this.status = 'OFFLINE';
      this.role = 'OFFLINE';
    }
  }

  setRoom(newRoomCode) {
    const nextHash = buildDeterministicRoomInfoHash(newRoomCode);
    this.roomCode = newRoomCode || 'FRUGIS-1';
    if (!this.active) {
      this.infoHash = nextHash;
      return;
    }
    if (nextHash !== this.infoHash) {
      this.start(this.roomCode);
    }
  }

  send(packet, reliable = true) {
    if (!this.active || !packet) return 0;
    const raw = typeof packet === 'string' ? packet : JSON.stringify(packet);
    let sent = 0;
    for (const peer of this.peers.values()) {
      if (this._sendRawToPeer(peer, raw, reliable)) {
        sent++;
      }
    }
    return sent;
  }

  _isPeerOpen(peer) {
    if (!peer) return false;
    const rOpen = peer.reliableDc && peer.reliableDc.readyState === 'open';
    const fOpen = peer.fastDc && peer.fastDc.readyState === 'open';
    return Boolean(rOpen || fOpen);
  }

  _sendRawToPeer(peer, raw, reliable = true) {
    if (!peer) return false;
    const primary = reliable ? peer.reliableDc : peer.fastDc;
    const fallback = reliable ? peer.fastDc : peer.reliableDc;
    const dc =
      primary && primary.readyState === 'open'
        ? primary
        : fallback && fallback.readyState === 'open'
        ? fallback
        : null;
    if (!dc) return false;
    try {
      if (!reliable && typeof dc.bufferedAmount === 'number' && dc.bufferedAmount > 65536) {
        return false;
      }
      dc.send(raw);
      return true;
    } catch (_e) {
      return false;
    }
  }

  _refreshRoleAndStatus() {
    if (!this.active) return;
    const openPeers = this.getConnectedPeerCount();
    const nextRole = this.isHost() ? 'HOST' : 'GUEST';
    const nextStatus =
      openPeers > 0
        ? 'CONNECTED'
        : this._sigWs && this._sigWs.readyState === 1
        ? 'HOST_READY'
        : 'SIGNALING';
    this._setStatus(nextStatus, nextRole);
  }

  _setStatus(status, role = this.role) {
    const changed = this.status !== status || this.role !== role;
    this.status = status;
    this.role = role;
    if (changed && typeof this.onStatusChange === 'function') {
      this.onStatusChange({
        status: this.status,
        role: this.role,
        roomCode: this.roomCode,
        peerCount: this.getConnectedPeerCount()
      });
    }
  }

  _waitForIceGatheringComplete(pc) {
    if (!pc || pc.iceGatheringState === 'complete' || this.iceGatherTimeoutMs <= 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        pc.onicegatheringstatechange = null;
        pc.onicecandidate = null;
        resolve();
      };
      const timer = setTimeout(finish, this.iceGatherTimeoutMs);
      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete') finish();
      };
      pc.onicecandidate = (ev) => {
        if (!ev || !ev.candidate) finish();
      };
    });
  }

  async _buildOfferBatch(count, epoch) {
    this._pruneExpiredPendingOffers();
    const offersOut = [];
    for (let i = 0; i < count; i++) {
      if (!this.active || epoch !== this._epoch) break;
      const offerId = `of_${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36).slice(-4)}`;
      const pc = new this.RTCPeerConnectionImpl({ iceServers: this.iceServers });
      const slot = {
        offerId,
        peerId: null,
        pc,
        fastDc: null,
        reliableDc: null,
        isInitiator: true,
        createdAt: Date.now()
      };
      const reliableDc = pc.createDataChannel('reliable', { ordered: true });
      const fastDc = pc.createDataChannel('fast', { ordered: false, maxRetransmits: 0 });
      this._bindDataChannel(slot, reliableDc, true, epoch);
      this._bindDataChannel(slot, fastDc, false, epoch);
      this._bindPeerConnectionState(slot, epoch);

      try {
        const offerDesc = await pc.createOffer();
        if (!this.active || epoch !== this._epoch) {
          this._closePeerEntry(slot);
          break;
        }
        await pc.setLocalDescription(offerDesc);
        await this._waitForIceGatheringComplete(pc);
        if (!this.active || epoch !== this._epoch) {
          this._closePeerEntry(slot);
          break;
        }
        const finalDesc = pc.localDescription || offerDesc;
        this.pendingOffers.set(offerId, slot);
        offersOut.push({
          offer_id: offerId,
          offer: { type: finalDesc.type || 'offer', sdp: finalDesc.sdp }
        });
      } catch (_e) {
        this._closePeerEntry(slot);
      }
    }
    return offersOut;
  }

  async _announceToSwarm(epoch) {
    if (!this.active || epoch !== this._epoch) return;
    if (!this._sigWs || this._sigWs.readyState !== 1) return;
    if (this.getConnectedPeerCount() >= 10) return;

    const offers = await this._buildOfferBatch(OFFER_BATCH_SIZE, epoch);
    if (!this.active || epoch !== this._epoch) return;
    this._sendSignaling({
      action: 'announce',
      info_hash: this.infoHash,
      peer_id: this.myPeerId,
      numwant: 10,
      uploaded: 0,
      downloaded: 0,
      left: 1,
      offers
    });
  }

  _openTrackerSocket(epoch) {
    if (!this.WebSocketImpl) return;
    const url =
      this.signalingEndpoints[this._sigEndpointIdx % this.signalingEndpoints.length] ||
      DEFAULT_SIGNALING_ENDPOINTS[0];
    let ws;
    try {
      ws = new this.WebSocketImpl(url);
    } catch (_e) {
      this._scheduleReconnect(epoch, 1500);
      return;
    }
    this._sigWs = ws;

    ws.onopen = () => {
      if (!this.active || epoch !== this._epoch || this._sigWs !== ws) return;
      this._refreshRoleAndStatus();
      this._announceToSwarm(epoch);
      if (this._announceInterval) clearInterval(this._announceInterval);
      this._announceInterval = setInterval(() => {
        if (this.active && epoch === this._epoch) {
          this._announceToSwarm(epoch);
        }
      }, REANNOUNCE_INTERVAL_MS);
    };

    ws.onmessage = (ev) => {
      if (!this.active || epoch !== this._epoch || this._sigWs !== ws) return;
      let msg;
      try {
        msg = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data;
      } catch (_e) {
        return;
      }
      if (!msg || msg.info_hash !== this.infoHash) return;
      this._handleTrackerMessage(msg, epoch);
    };

    ws.onerror = () => {};

    ws.onclose = () => {
      if (!this.active || epoch !== this._epoch || this._sigWs !== ws) return;
      this._sigWs = null;
      this._sigEndpointIdx = (this._sigEndpointIdx + 1) % this.signalingEndpoints.length;
      this._scheduleReconnect(epoch, 1800);
    };
  }

  async _handleTrackerMessage(msg, epoch) {
    const remotePeerId = msg.peer_id;
    if (!remotePeerId || remotePeerId === this.myPeerId) return;

    // 1. Incoming WebRTC Offer from another player in the room
    if (msg.offer && msg.offer_id) {
      const existing = this.peers.get(remotePeerId);
      if (existing) {
        if (this._isPeerOpen(existing)) return;
        // Glare resolution: if both peers offered simultaneously, higher peer_id accepts incoming offer
        if (existing.isInitiator && this.myPeerId < remotePeerId) {
          return;
        }
        this._closePeerEntry(existing);
        this.peers.delete(remotePeerId);
      }

      const pc = new this.RTCPeerConnectionImpl({ iceServers: this.iceServers });
      const entry = {
        peerId: remotePeerId,
        pc,
        fastDc: null,
        reliableDc: null,
        isInitiator: false
      };
      this.peers.set(remotePeerId, entry);
      this._bindPeerConnectionState(entry, epoch);

      pc.ondatachannel = (ev) => {
        if (!ev || !ev.channel) return;
        const isRel = ev.channel.label !== 'fast';
        this._bindDataChannel(entry, ev.channel, isRel, epoch);
      };

      try {
        await pc.setRemoteDescription(msg.offer);
        const answerDesc = await pc.createAnswer();
        if (!this.active || epoch !== this._epoch) return;
        await pc.setLocalDescription(answerDesc);
        await this._waitForIceGatheringComplete(pc);
        if (!this.active || epoch !== this._epoch) return;
        const finalAns = pc.localDescription || answerDesc;
        this._sendSignaling({
          action: 'announce',
          info_hash: this.infoHash,
          peer_id: this.myPeerId,
          to_peer_id: remotePeerId,
          offer_id: msg.offer_id,
          answer: { type: finalAns.type || 'answer', sdp: finalAns.sdp }
        });
      } catch (_e) {
        this._handlePeerDisconnected(remotePeerId, epoch);
      }
      return;
    }

    // 2. Incoming WebRTC Answer to one of our announced offers
    if (msg.answer && msg.offer_id) {
      const slot = this.pendingOffers.get(msg.offer_id);
      if (!slot) return;
      this.pendingOffers.delete(msg.offer_id);

      const existing = this.peers.get(remotePeerId);
      if (existing && this._isPeerOpen(existing)) {
        this._closePeerEntry(slot);
        return;
      }
      if (existing) {
        this._closePeerEntry(existing);
      }

      slot.peerId = remotePeerId;
      this.peers.set(remotePeerId, slot);
      try {
        await slot.pc.setRemoteDescription(msg.answer);
      } catch (_e) {
        this._handlePeerDisconnected(remotePeerId, epoch);
      }
    }
  }

  _bindPeerConnectionState(entry, epoch) {
    const check = () => {
      if (!this.active || epoch !== this._epoch) return;
      const st = entry.pc.connectionState || entry.pc.iceConnectionState;
      if (st === 'failed' || st === 'closed' || st === 'disconnected') {
        if (entry.peerId) {
          this._handlePeerDisconnected(entry.peerId, epoch);
        }
      }
    };
    entry.pc.onconnectionstatechange = check;
    entry.pc.oniceconnectionstatechange = check;
  }

  _bindDataChannel(entry, dc, isReliable, epoch) {
    if (isReliable) entry.reliableDc = dc;
    else entry.fastDc = dc;

    dc.onopen = () => {
      if (!this.active || epoch !== this._epoch) return;
      this._refreshRoleAndStatus();
    };

    dc.onmessage = (ev) => {
      if (!this.active || epoch !== this._epoch || !ev?.data) return;
      const raw = typeof ev.data === 'string' ? ev.data : String(ev.data);
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (_e) {
        return;
      }
      if (!parsed) return;

      // Mesh Relay Assist: if we are Host and have >1 peer, relay to any peer that may not have meshed directly yet
      if (this.isHost() && this.peers.size > 1) {
        for (const [otherId, otherPeer] of this.peers.entries()) {
          if (otherId !== entry.peerId) {
            this._sendRawToPeer(otherPeer, raw, isReliable);
          }
        }
      }

      if (typeof this.onMessage === 'function') {
        this.onMessage(parsed);
      }
    };

    dc.onclose = () => {
      if (!this.active || epoch !== this._epoch) return;
      if (entry.peerId && !this._isPeerOpen(entry)) {
        this._handlePeerDisconnected(entry.peerId, epoch);
      }
    };
  }

  _handlePeerDisconnected(peerId, epoch) {
    const entry = this.peers.get(peerId);
    if (entry) {
      this._closePeerEntry(entry);
      this.peers.delete(peerId);
    }
    if (!this.active || epoch !== this._epoch) return;
    this._refreshRoleAndStatus();
  }

  _sendSignaling(msg) {
    if (!this._sigWs || this._sigWs.readyState !== 1) return false;
    try {
      this._sigWs.send(JSON.stringify(msg));
      return true;
    } catch (_e) {
      return false;
    }
  }

  _scheduleReconnect(epoch, delayMs = 1500) {
    if (!this.active || epoch !== this._epoch) return;
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      if (!this.active || epoch !== this._epoch) return;
      this._openTrackerSocket(epoch);
    }, delayMs);
  }

  _pruneExpiredPendingOffers() {
    const now = Date.now();
    for (const [offerId, slot] of this.pendingOffers.entries()) {
      if (now - slot.createdAt > 45000) {
        this._closePeerEntry(slot);
        this.pendingOffers.delete(offerId);
      }
    }
  }

  _closeAllPendingOffers() {
    for (const slot of this.pendingOffers.values()) {
      this._closePeerEntry(slot);
    }
    this.pendingOffers.clear();
  }

  _closePeerEntry(entry) {
    if (!entry) return;
    try {
      if (entry.fastDc) {
        entry.fastDc.onopen = null;
        entry.fastDc.onmessage = null;
        entry.fastDc.onclose = null;
        entry.fastDc.close?.();
      }
    } catch (_e) {}
    try {
      if (entry.reliableDc) {
        entry.reliableDc.onopen = null;
        entry.reliableDc.onmessage = null;
        entry.reliableDc.onclose = null;
        entry.reliableDc.close?.();
      }
    } catch (_e) {}
    try {
      if (entry.pc) {
        entry.pc.onicecandidate = null;
        entry.pc.onicegatheringstatechange = null;
        entry.pc.onconnectionstatechange = null;
        entry.pc.oniceconnectionstatechange = null;
        entry.pc.ondatachannel = null;
        entry.pc.close?.();
      }
    } catch (_e) {}
  }

  _closeAllPeers() {
    for (const entry of this.peers.values()) {
      this._closePeerEntry(entry);
    }
    this.peers.clear();
  }

  _closeSignaling() {
    if (this._announceInterval) {
      clearInterval(this._announceInterval);
      this._announceInterval = null;
    }
    if (this._sigWs) {
      const ws = this._sigWs;
      this._sigWs = null;
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      try {
        ws.close?.();
      } catch (_e) {}
    }
  }
}
