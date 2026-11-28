/**
 * Pure runtime-agnostic Durable Object room coordinator & Worker router (`room-core.js`).
 * Kept free of `cloudflare:workers` top-level imports so `node:test` can verify the exact
 * room state, WebSocket broadcast, and HTTP fallback logic directly in Node, while
 * `worker.js` wraps `BattleRoomCore` in `class BattleRoom extends DurableObject`.
 */

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Upgrade, Connection',
  'Cache-Control': 'no-store'
};

export const DEFAULT_LOBBY_ROOMS = ['FRUGIS-1', 'ALPHA-SQUAD', 'AIR-COMBAT'];

export function sanitizeRoomCode(raw) {
  const clean = String(raw || 'FRUGIS-1')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 24);
  return clean || 'FRUGIS-1';
}

export function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS
    }
  });
}

export class BattleRoomCore {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.players = new Map(); // clientId -> player state + _updated + _joinedAt
    this.events = []; // [{ seq, ts, packet }]
    this.seq = 0;
    this.adminId = null;
    this.activeEra = 'modern';
  }

  _refreshAdmin() {
    if (this.adminId && this.players.has(this.adminId)) {
      return this.adminId;
    }
    let bestId = null;
    let bestJoined = Infinity;
    for (const [cid, p] of this.players.entries()) {
      const joinedAt = typeof p._joinedAt === 'number' ? p._joinedAt : Infinity;
      if (
        bestId === null ||
        joinedAt < bestJoined ||
        (joinedAt === bestJoined && cid < bestId)
      ) {
        bestId = cid;
        bestJoined = joinedAt;
      }
    }
    this.adminId = bestId;
    return this.adminId;
  }

  _pruneStale(nowMs) {
    for (const [cid, p] of this.players.entries()) {
      if (nowMs - (p._updated || 0) > 8000) {
        this.players.delete(cid);
      }
    }
    this._refreshAdmin();
    if (this.events.length > 160) {
      this.events = this.events.slice(-100);
    }
  }

  _getSockets() {
    if (this.ctx && typeof this.ctx.getWebSockets === 'function') {
      return this.ctx.getWebSockets();
    }
    return Array.from(this._fallbackSockets || []);
  }

  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const roomCode = sanitizeRoomCode(url.searchParams.get('room'));
    const nowMs = Date.now();
    this._pruneStale(nowMs);

    // 1. WebSocket Upgrade (`/ws?room=FRUGIS-1`)
    if (
      url.pathname === '/ws' ||
      (request.headers.get('Upgrade') || '').toLowerCase() === 'websocket'
    ) {
      if (typeof WebSocketPair === 'undefined') {
        return jsonResponse({ ok: false, error: 'WebSocketPair unavailable in runtime' }, 426);
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      if (this.ctx && typeof this.ctx.acceptWebSocket === 'function') {
        this.ctx.acceptWebSocket(server);
      } else {
        server.accept();
        if (!this._fallbackSockets) this._fallbackSockets = new Set();
        this._fallbackSockets.add(server);
        server.addEventListener('message', (ev) => this.webSocketMessage(server, ev.data));
        server.addEventListener('close', () => this.webSocketClose(server));
        server.addEventListener('error', () => this.webSocketError(server));
      }

      return new Response(null, {
        status: 101,
        webSocket: client,
        headers: CORS_HEADERS
      });
    }

    // 2. Room Summary (`GET /summary`)
    if (url.pathname === '/summary' && request.method === 'GET') {
      const wsCount = this._getSockets().length;
      const playersList = [];
      for (const p of this.players.values()) {
        const clean = {};
        for (const [k, v] of Object.entries(p)) {
          if (!k.startsWith('_')) clean[k] = v;
        }
        playersList.push(clean);
      }
      return jsonResponse({
        ok: true,
        code: roomCode,
        adminId: this._refreshAdmin(),
        era: this.activeEra,
        playerCount: Math.max(wsCount, playersList.length),
        players: playersList
      });
    }

    // 3. HTTP Sync Fallback (`POST /api/mp/sync`)
    if (url.pathname === '/api/mp/sync' && request.method === 'POST') {
      let payload = {};
      try {
        payload = await request.json();
      } catch (_e) {
        // Ignore malformed JSON
      }
      const clientId = String(payload.clientId || '');
      const state = payload.state;
      const inEvents = Array.isArray(payload.events) ? payload.events : [];
      const lastSeq = Number(payload.lastSeq || 0);

      if (clientId && state && typeof state === 'object') {
        const existing = this.players.get(clientId);
        const joinedAt = existing && typeof existing._joinedAt === 'number' ? existing._joinedAt : nowMs;
        this.players.set(clientId, {
          ...state,
          senderId: clientId,
          room: roomCode,
          _joinedAt: joinedAt,
          _updated: nowMs
        });
        this._refreshAdmin();
        if (this.adminId === clientId && state.era) {
          this.activeEra = String(state.era);
        }
      }

      const activeAdminId = this._refreshAdmin();
      for (const ev of inEvents) {
        if (ev && typeof ev === 'object') {
          if (
            (ev.type === 'match_reset' || ev.type === 'admin_era_change') &&
            activeAdminId &&
            clientId !== activeAdminId
          ) {
            continue;
          }
          if (ev.type === 'admin_era_change' && ev.era) {
            this.activeEra = String(ev.era);
          }
          this.seq++;
          const pkt = { ...ev, senderId: clientId, room: roomCode, serverAdminId: activeAdminId };
          this.events.push({ seq: this.seq, ts: nowMs, packet: pkt });
          this._broadcastPacket(JSON.stringify(pkt), null);
        }
      }

      const peers = [];
      for (const [cid, p] of this.players.entries()) {
        if (cid === clientId) continue;
        const clean = {};
        for (const [k, v] of Object.entries(p)) {
          if (!k.startsWith('_')) clean[k] = v;
        }
        peers.push(clean);
      }

      const outEvents =
        lastSeq > 0
          ? this.events
              .filter((item) => item.seq > lastSeq && item.packet.senderId !== clientId)
              .map((item) => item.packet)
          : [];

      return jsonResponse({
        ok: true,
        room: roomCode,
        serverAdminId: activeAdminId,
        era: this.activeEra,
        players: peers,
        events: outEvents,
        latestSeq: this.seq
      });
    }

    return jsonResponse({ ok: true, service: 'blockfare-cloudflare-relay', room: roomCode });
  }

  _broadcastPacket(rawText, senderWs = null) {
    const sockets = this._getSockets();
    for (let i = 0; i < sockets.length; i++) {
      const peer = sockets[i];
      if (peer === senderWs) continue;
      try {
        peer.send(rawText);
      } catch (_e) {
        try {
          peer.close(1011, 'Send failed');
        } catch (_err) {
          // Ignore
        }
        this._fallbackSockets?.delete(peer);
      }
    }
  }

  async webSocketMessage(ws, message) {
    const rawText = typeof message === 'string' ? message : new TextDecoder().decode(message);
    if (!rawText) return;

    let parsed = null;
    try {
      parsed = JSON.parse(rawText);
    } catch (_e) {
      return;
    }
    if (!parsed) return;

    if (parsed.type === 'HEARTBEAT' || parsed.type === 'ping') {
      try {
        ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
      } catch (_e) {
        // Ignore
      }
      return;
    }

    const nowMs = Date.now();
    this._pruneStale(nowMs);
    const senderId = parsed.senderId || parsed._sender;
    const prevAdminId = this.adminId;
    if (senderId && (parsed.type === 'state' || parsed.type === 'join_announce')) {
      const existing = this.players.get(senderId);
      const joinedAt = existing && typeof existing._joinedAt === 'number' ? existing._joinedAt : nowMs;
      if (parsed.type === 'state') {
        this.players.set(senderId, { ...parsed, _joinedAt: joinedAt, _updated: nowMs });
      } else if (!existing) {
        this.players.set(senderId, {
          senderId,
          name: parsed.name || senderId,
          team: parsed.team || 'US',
          _joinedAt: joinedAt,
          _updated: nowMs
        });
      } else {
        existing._updated = nowMs;
      }
      ws._clientId = senderId;
    } else if (senderId && this.players.has(senderId)) {
      this.players.get(senderId)._updated = nowMs;
      ws._clientId = senderId;
    }

    const activeAdminId = this._refreshAdmin();
    if (activeAdminId === senderId && parsed.era) {
      this.activeEra = String(parsed.era);
    }

    // Server-side guard: only the Room Host Admin can reset the round or switch eras!
    if (
      (parsed.type === 'match_reset' || parsed.type === 'admin_era_change') &&
      activeAdminId &&
      senderId !== activeAdminId
    ) {
      try {
        ws.send(
          JSON.stringify({
            type: 'room_admin',
            serverAdminId: activeAdminId,
            era: this.activeEra
          })
        );
      } catch (_e) {
        // Ignore
      }
      return;
    }
    if (parsed.type === 'admin_era_change' && parsed.era) {
      this.activeEra = String(parsed.era);
    }

    if (parsed.type === 'join_announce' || prevAdminId !== activeAdminId) {
      const adminNotice = JSON.stringify({
        type: 'room_admin',
        serverAdminId: activeAdminId,
        era: this.activeEra
      });
      try {
        ws.send(adminNotice);
      } catch (_e) {
        // Ignore
      }
      if (prevAdminId !== activeAdminId) {
        this._broadcastPacket(adminNotice, ws);
      }
    }

    this._broadcastPacket(rawText, ws);
  }

  async webSocketClose(ws) {
    this._fallbackSockets?.delete(ws);
    if (ws && ws._clientId && this.players.has(ws._clientId)) {
      this.players.delete(ws._clientId);
      const prevAdmin = this.adminId;
      const nextAdmin = this._refreshAdmin();
      if (prevAdmin !== nextAdmin && nextAdmin) {
        this._broadcastPacket(
          JSON.stringify({
            type: 'room_admin',
            serverAdminId: nextAdmin,
            era: this.activeEra
          }),
          ws
        );
      }
    }
    try {
      ws.close();
    } catch (_e) {
      // Ignore
    }
  }

  async webSocketError(ws) {
    this._fallbackSockets?.delete(ws);
    try {
      ws.close(1011, 'WebSocket error');
    } catch (_e) {
      // Ignore
    }
  }
}

export function createWorkerHandler() {
  return {
    async fetch(request, env) {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }

      const url = new URL(request.url);

      if (url.pathname === '/' && (request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
        return jsonResponse({
          ok: true,
          service: 'blockfare-cloudflare-relay',
          wsEndpoint: `${url.protocol === 'https:' ? 'wss:' : 'ws:'}//${url.host}/ws`,
          roomsEndpoint: `${url.origin}/api/mp/rooms`
        });
      }

      if (url.pathname === '/api/mp/rooms' && request.method === 'GET') {
        const extraRoom = url.searchParams.get('room');
        const codes = Array.from(
          new Set([
            ...DEFAULT_LOBBY_ROOMS,
            ...(extraRoom ? [sanitizeRoomCode(extraRoom)] : [])
          ])
        );
        const rooms = await Promise.all(
          codes.map(async (code) => {
            const stub =
              typeof env.BATTLE_ROOMS.getByName === 'function'
                ? env.BATTLE_ROOMS.getByName(code)
                : env.BATTLE_ROOMS.get(env.BATTLE_ROOMS.idFromName(code));
            const res = await stub.fetch(`https://relay.internal/summary?room=${encodeURIComponent(code)}`);
            const data = await res.json();
            return {
              code,
              playerCount: data.playerCount || 0,
              players: data.players || []
            };
          })
        );
        return jsonResponse({
          ok: true,
          relayHost: url.host,
          rooms
        });
      }

      let roomCode = url.searchParams.get('room');
      if (!roomCode && url.pathname === '/api/mp/sync' && request.method === 'POST') {
        try {
          const clone = request.clone();
          const body = await clone.json();
          roomCode = body?.room;
        } catch (_e) {
          // Ignore
        }
      }
      const cleanRoom = sanitizeRoomCode(roomCode);
      const stub =
        typeof env.BATTLE_ROOMS.getByName === 'function'
          ? env.BATTLE_ROOMS.getByName(cleanRoom)
          : env.BATTLE_ROOMS.get(env.BATTLE_ROOMS.idFromName(cleanRoom));

      const forwardUrl = new URL(request.url);
      forwardUrl.searchParams.set('room', cleanRoom);
      return stub.fetch(new Request(forwardUrl.toString(), request));
    }
  };
}
