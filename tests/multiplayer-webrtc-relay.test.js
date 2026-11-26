import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {
  WebRtcTransport,
  buildDeterministicRoomInfoHash
} from '../src/network/WebRtcTransport.js?v=134';
import {
  NetworkManager,
  normalizeRelayWsUrl,
  deriveRelayHttpOrigin
} from '../src/network.js?v=134';
import {
  BattleRoomCore as BattleRoom,
  createWorkerHandler
} from '../cloudflare-relay/src/room-core.js';

const workerDefault = createWorkerHandler();

/**
 * In-memory WebTorrent Swarm Tracker + coupled WebRTC DataChannel harness
 * verifying deterministic 20-byte `info_hash` room discovery, Vanilla-ICE
 * offer/answer exchange, dual `fast` (unreliable) & `reliable` DataChannels,
 * glare-safe 3-peer mesh formation, and deterministic Host authority.
 */
function createInMemorySwarmTrackerWorld() {
  const swarms = new Map(); // info_hash -> Map<peer_id, FakeTrackerSocket>
  const rtcEndpoints = new Map(); // sdpId -> FakeRTCPeerConnection
  let descCounter = 0;

  class FakeTrackerSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.peerId = null;
      this.infoHash = null;
      queueMicrotask(() => {
        if (this._closed) return;
        this.readyState = 1;
        this.onopen?.();
      });
    }

    send(raw) {
      const msg = JSON.parse(raw);
      if (msg.action !== 'announce' || !msg.info_hash || !msg.peer_id) return;
      this.peerId = msg.peer_id;
      this.infoHash = msg.info_hash;
      if (!swarms.has(msg.info_hash)) {
        swarms.set(msg.info_hash, new Map());
      }
      const roomPeers = swarms.get(msg.info_hash);
      roomPeers.set(msg.peer_id, this);

      if (msg.answer && msg.to_peer_id && msg.offer_id) {
        const target = roomPeers.get(msg.to_peer_id);
        if (target && target.readyState === 1) {
          queueMicrotask(() => {
            target.onmessage?.({
              data: JSON.stringify({
                action: 'announce',
                info_hash: msg.info_hash,
                peer_id: msg.peer_id,
                offer_id: msg.offer_id,
                answer: msg.answer
              })
            });
          });
        }
        return;
      }

      if (Array.isArray(msg.offers) && msg.offers.length > 0) {
        const others = Array.from(roomPeers.entries()).filter(([pid]) => pid !== msg.peer_id);
        for (let i = 0; i < others.length && i < msg.offers.length; i++) {
          const [, peerSock] = others[i];
          const offItem = msg.offers[i];
          if (peerSock && peerSock.readyState === 1) {
            queueMicrotask(() => {
              peerSock.onmessage?.({
                data: JSON.stringify({
                  action: 'announce',
                  info_hash: msg.info_hash,
                  peer_id: msg.peer_id,
                  offer_id: offItem.offer_id,
                  offer: offItem.offer
                })
              });
            });
          }
        }
      }
    }

    close() {
      this._closed = true;
      this.readyState = 3;
      if (this.infoHash && this.peerId) {
        swarms.get(this.infoHash)?.delete(this.peerId);
      }
      this.onclose?.();
    }
  }

  class FakeDataChannel {
    constructor(label, opts = {}) {
      this.label = label;
      this.ordered = opts.ordered !== false;
      this.maxRetransmits = opts.maxRetransmits ?? null;
      this.readyState = 'connecting';
      this.bufferedAmount = 0;
      this._remoteChannel = null;
    }

    send(data) {
      if (this.readyState !== 'open' || !this._remoteChannel) {
        throw new Error('DataChannel not open');
      }
      const rem = this._remoteChannel;
      queueMicrotask(() => {
        if (rem.readyState === 'open') {
          rem.onmessage?.({ data });
        }
      });
    }

    close() {
      if (this.readyState === 'closed') return;
      this.readyState = 'closed';
      this.onclose?.();
      if (this._remoteChannel && this._remoteChannel.readyState !== 'closed') {
        const rem = this._remoteChannel;
        rem.readyState = 'closed';
        queueMicrotask(() => rem.onclose?.());
      }
    }
  }

  class FakeRTCPeerConnection {
    constructor() {
      this.id = `sdp_${++descCounter}`;
      this.localDescription = null;
      this.remoteDescription = null;
      this.iceGatheringState = 'complete';
      this.connectionState = 'new';
      this.iceConnectionState = 'new';
      this._createdChannels = [];
      this._pairedPc = null;
      rtcEndpoints.set(this.id, this);
    }

    createDataChannel(label, opts) {
      const dc = new FakeDataChannel(label, opts);
      this._createdChannels.push(dc);
      return dc;
    }

    async createOffer() {
      return { type: 'offer', sdp: this.id };
    }

    async createAnswer() {
      return { type: 'answer', sdp: this.id };
    }

    async setLocalDescription(desc) {
      this.localDescription = desc;
    }

    async setRemoteDescription(desc) {
      this.remoteDescription = desc;
      const remotePc = rtcEndpoints.get(desc?.sdp);
      if (remotePc && !this._pairedPc) {
        this._pairedPc = remotePc;
        remotePc._pairedPc = this;
      }
      if (this._pairedPc && this.localDescription && this._pairedPc.localDescription) {
        const initiator = this._createdChannels.length > 0 ? this : this._pairedPc;
        const responder = initiator === this ? this._pairedPc : this;
        this._openDataChannelPairs(initiator, responder);
      }
    }

    _openDataChannelPairs(initiator, responder) {
      if (initiator._channelsLinked) return;
      initiator._channelsLinked = true;
      initiator.connectionState = 'connected';
      responder.connectionState = 'connected';
      for (const initDc of initiator._createdChannels) {
        const respDc = new FakeDataChannel(initDc.label, {
          ordered: initDc.ordered,
          maxRetransmits: initDc.maxRetransmits
        });
        initDc._remoteChannel = respDc;
        respDc._remoteChannel = initDc;
        responder.ondatachannel?.({ channel: respDc });
        queueMicrotask(() => {
          initDc.readyState = 'open';
          respDc.readyState = 'open';
          initDc.onopen?.();
          respDc.onopen?.();
        });
      }
    }

    close() {
      this.connectionState = 'closed';
      for (const dc of this._createdChannels) dc.close();
      if (this._pairedPc && this._pairedPc.connectionState !== 'closed') {
        this._pairedPc.connectionState = 'closed';
        this._pairedPc.onconnectionstatechange?.();
      }
    }
  }

  return { FakeTrackerSocket, FakeRTCPeerConnection };
}

const flushAsync = (ms = 30) => new Promise((r) => setTimeout(r, ms));

describe('Option 1: Zero-Server WebRTC P2P Swarm Mesh Transport (WebRtcTransport)', () => {
  test('forms full P2P mesh across 3 peers via 20-byte room info_hash with dual fast/reliable DataChannels', async () => {
    const env = createInMemorySwarmTrackerWorld();
    const receivedByA = [];
    const receivedByB = [];
    const receivedByC = [];

    const hash1 = buildDeterministicRoomInfoHash('FRUGIS-1');
    assert.equal(hash1.length, 20);
    assert.equal(hash1, buildDeterministicRoomInfoHash('frugis-1'));

    const peerA = new WebRtcTransport({
      clientId: 'p_alpha',
      roomCode: 'FRUGIS-1',
      iceGatherTimeoutMs: 0,
      WebSocketImpl: env.FakeTrackerSocket,
      RTCPeerConnectionImpl: env.FakeRTCPeerConnection,
      onMessage: (m) => receivedByA.push(m)
    });
    const peerB = new WebRtcTransport({
      clientId: 'p_bravo',
      roomCode: 'FRUGIS-1',
      iceGatherTimeoutMs: 0,
      WebSocketImpl: env.FakeTrackerSocket,
      RTCPeerConnectionImpl: env.FakeRTCPeerConnection,
      onMessage: (m) => receivedByB.push(m)
    });
    const peerC = new WebRtcTransport({
      clientId: 'p_charlie',
      roomCode: 'FRUGIS-1',
      iceGatherTimeoutMs: 0,
      WebSocketImpl: env.FakeTrackerSocket,
      RTCPeerConnectionImpl: env.FakeRTCPeerConnection,
      onMessage: (m) => receivedByC.push(m)
    });

    peerA.start('FRUGIS-1');
    await flushAsync(20);
    peerB.start('FRUGIS-1');
    await flushAsync(25);
    peerC.start('FRUGIS-1');
    await flushAsync(35);

    assert.equal(peerA.getConnectedPeerCount(), 2);
    assert.equal(peerB.getConnectedPeerCount(), 2);
    assert.equal(peerC.getConnectedPeerCount(), 2);

    // Exactly one peer holds deterministic Room Host authority
    const hosts = [peerA, peerB, peerC].filter((p) => p.isHost());
    assert.equal(hosts.length, 1);

    peerB.send({ type: 'state', senderId: 'p_bravo', pos: [10, 2, -5] }, false);
    peerB.send({ type: 'player_hit', senderId: 'p_bravo', targetId: 'p_charlie', damage: 42 }, true);
    await flushAsync(25);

    assert.equal(receivedByA.some((m) => m.type === 'state'), true);
    assert.equal(receivedByC.some((m) => m.damage === 42), true);

    peerA.stop();
    peerB.stop();
    peerC.stop();
  });
});

describe('Option 2: Cloudflare Worker + BattleRoom Durable Object Relay', () => {
  test('relays WebSocket state/events across room peers and serves /api/mp/rooms + /api/mp/sync with CORS', async () => {
    const roomsMap = new Map();
    const mockEnv = {
      BATTLE_ROOMS: {
        idFromName: (name) => name,
        get: (id) => {
          if (!roomsMap.has(id)) {
            roomsMap.set(id, new BattleRoom({}, mockEnv));
          }
          const roomObj = roomsMap.get(id);
          return {
            fetch: (reqOrUrl) => {
              const req = typeof reqOrUrl === 'string' ? new Request(reqOrUrl) : reqOrUrl;
              return roomObj.fetch(req);
            }
          };
        }
      }
    };

    const syncReq1 = new Request('https://blockfare-relay.blockbuilderb.workers.dev/api/mp/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room: 'FRUGIS-1',
        clientId: 'p_host',
        state: { type: 'state', name: 'VIPER_1', team: 'US', pos: [12, 0, 34] },
        events: [{ type: 'voxel_destroy', gx: 3, gy: 1, gz: 4 }],
        lastSeq: 0
      })
    });
    const syncRes1 = await workerDefault.fetch(syncReq1, mockEnv);
    assert.equal(syncRes1.status, 200);
    assert.equal(syncRes1.headers.get('Access-Control-Allow-Origin'), '*');
    const data1 = await syncRes1.json();
    assert.equal(data1.ok, true);
    assert.equal(data1.latestSeq, 1);

    const syncReq2 = new Request('https://blockfare-relay.blockbuilderb.workers.dev/api/mp/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room: 'FRUGIS-1',
        clientId: 'p_guest',
        state: { type: 'state', name: 'GHOST_2', team: 'RU', pos: [-20, 0, 10] },
        events: [],
        lastSeq: 0
      })
    });
    const data2 = await (await workerDefault.fetch(syncReq2, mockEnv)).json();
    assert.equal(data2.players.length, 1);
    assert.equal(data2.players[0].name, 'VIPER_1');

    const roomsRes = await workerDefault.fetch(
      new Request('https://blockfare-relay.blockbuilderb.workers.dev/api/mp/rooms'),
      mockEnv
    );
    const roomsJson = await roomsRes.json();
    assert.equal(roomsJson.ok, true);
    const frugis = roomsJson.rooms.find((r) => r.code === 'FRUGIS-1');
    assert.equal(frugis.playerCount, 2);

    const room = roomsMap.get('FRUGIS-1');
    const sentToWs2 = [];
    const ws1 = { send: () => {}, close: () => {} };
    const ws2 = { send: (txt) => sentToWs2.push(JSON.parse(txt)), close: () => {} };
    room._fallbackSockets = new Set([ws1, ws2]);
    await room.webSocketMessage(
      ws1,
      JSON.stringify({ type: 'shoot', senderId: 'p_host', origin: [0, 1, 0], end: [0, 1, -20] })
    );
    assert.equal(sentToWs2.length, 1);
    assert.equal(sentToWs2[0].type, 'shoot');
  });
});

describe('NetworkManager Unified Relay + Vehicle/Aircraft + Conquest Sync', () => {
  test('normalizes Cloud Relay URLs, embeds &relay= in share URLs, and syncs remote aircraft/vehicles & Conquest state', () => {
    assert.equal(
      normalizeRelayWsUrl('https://blockfare-relay.blockbuilderb.workers.dev'),
      'wss://blockfare-relay.blockbuilderb.workers.dev/ws'
    );
    assert.equal(
      deriveRelayHttpOrigin('wss://blockfare-relay.blockbuilderb.workers.dev/ws'),
      'https://blockfare-relay.blockbuilderb.workers.dev'
    );

    const scene = new THREE.Scene();
    const ac130 = {
      id: 'us_gunship_1',
      type: 'plane',
      isAircraft: true,
      aircraftRole: 'gunship',
      team: 'US',
      dead: false,
      pos: new THREE.Vector3(0, 4, 0),
      yaw: 0,
      pitch: 0,
      roll: 0,
      hp: 5000,
      maxHp: 5000,
      mesh: new THREE.Group()
    };
    const world = {
      flags: [{ id: 'A', owner: 'NEUTRAL', captureProgress: 0 }],
      destroyVoxel: () => {},
      addVoxel: () => {}
    };
    const player = {
      name: 'LOCAL_1',
      team: 'RU',
      role: 'engineer',
      squad: 'ALPHA',
      commandRank: 'COMMANDER',
      pos: new THREE.Vector3(0, 0, 0),
      yaw: 0,
      pitch: 0,
      hp: 100,
      dead: false,
      activeVehicle: null,
      currentWeapon: () => ({ weaponId: 'ak15', def: { id: 'ak15', type: 'gun', shortName: 'AK-15' } })
    };
    const botManager = {
      bots: [],
      setBotCountPerSide: () => {},
      spawnTracer: () => {}
    };
    const vehicleManager = {
      vehicles: [ac130],
      damageVehicle(v, dmg) {
        v.hp = Math.max(0, v.hp - dmg);
      }
    };

    const net = new NetworkManager(scene, world, player, botManager, {
      clientId: 'p_zzz_guest',
      vehicleManager,
      isStaticHost: true,
      relayWsUrl: 'https://custom-relay.example.workers.dev',
      autoInitTransports: false
    });
    net.gameMode = 'MULTIPLAYER';
    net.gameRef = { ticketsUS: 1200, ticketsRU: 1200, matchTimeRemaining: 900 };

    const share = net.getShareUrl(true);
    assert.equal(share.includes('mode=multiplayer'), false, 'default multiplayer omits ?mode=multiplayer');
    assert.equal(share.includes('room='), false, 'default FRUGIS-1 room omits ?room=FRUGIS-1');
    assert.equal(share.includes('relay=wss%3A%2F%2Fcustom-relay.example.workers.dev%2Fws'), true);

    // Default Cloud Relay + Default Room produces a clean zero-query base URL
    net.relayWsUrl = 'wss://blockfare-relay.blockbuilderb.workers.dev/ws';
    assert.equal(net.getShareUrl(true), 'http://localhost:8080/');

    // Non-default room uses compact ?r=CODE query param
    net.roomCode = '2';
    assert.equal(net.getShareUrl(true), 'http://localhost:8080/?r=2');
    net.roomCode = 'FRUGIS-1';

    net.handleMessage({
      type: 'state',
      _seq: 1,
      _sender: 'p_aaa_host',
      senderId: 'p_aaa_host',
      room: 'FRUGIS-1',
      name: 'ACE_HOST',
      team: 'US',
      role: 'PILOT',
      pos: [120, 320, -200],
      yaw: 1.2,
      pitch: -0.1,
      vehicleId: 'us_gunship_1',
      vehState: {
        id: 'us_gunship_1',
        type: 'plane',
        aircraftRole: 'gunship',
        pos: [120, 320, -200],
        yaw: 1.2,
        pitch: -0.05,
        roll: 0.42,
        forwardSpeed: 64,
        hp: 4850,
        flareActiveTimer: 2.5,
        isShotDown: false
      }
    });

    assert.equal(ac130.remoteDriverId, 'p_aaa_host');
    assert.equal(ac130.hp, 4850);
    net._interpolateRemoteEntities(0.1);
    assert.equal(Math.round(ac130.pos.y), 320);

    assert.equal(net.isRoomAuthority(), false);
    net.handleMessage({
      type: 'conquest_sync',
      _seq: 2,
      _sender: 'p_aaa_host',
      senderId: 'p_aaa_host',
      ticketsUS: 1140,
      ticketsRU: 980,
      matchTimeRemaining: 742.5,
      flags: [{ id: 'A', owner: 'US', prog: 100 }]
    });
    assert.equal(net.gameRef.ticketsUS, 1140);
    assert.equal(net.gameRef.ticketsRU, 980);
    assert.equal(world.flags[0].owner, 'US');
    assert.equal(world.flags[0].captureProgress, 100);
  });

  test('BotManager.syncHumanTeamCounts retires dead AI immediately and defers live AI retirement until natural death', async () => {
    const { BotManager } = await import('../src/bots/BotManager.js?v=134');
    const scene = new THREE.Scene();
    const voxels = new Map();
    const world = {
      era: 'modern',
      spawns: { US_BASE: new THREE.Vector3(-100, 0, 0), RU_BASE: new THREE.Vector3(100, 0, 0) },
      flags: [
        { id: 'A', owner: 'US', contested: false, captureProgress: 100, radius: 34, defenseStage: 0, pos: new THREE.Vector3(-50, 0, 0) },
        { id: 'B', owner: 'NEUTRAL', contested: false, captureProgress: 0, radius: 34, defenseStage: 0, pos: new THREE.Vector3(0, 0, 0) },
        { id: 'C', owner: 'RU', contested: false, captureProgress: 100, radius: 34, defenseStage: 0, pos: new THREE.Vector3(50, 0, 0) }
      ],
      voxels,
      ammoCrates: [],
      key: (gx, gy, gz) => `${gx},${gy},${gz}`,
      pushOutOfBuildingFootprint: (x, z) => ({ x, z }),
      findSafeSpawnPoint: (x, z) => new THREE.Vector3(x, 0, z),
      getGroundHeightAt: () => 0,
      raycastVoxel: () => null,
      isInsideBuildingOrContainer: () => false,
      hasVoxel: (gx, gy, gz) => voxels.has(`${gx},${gy},${gz}`),
      getVoxel: () => null,
      worldToGrid: (_x, _y, _z, out = {}) => {
        out.gx = 0;
        out.gy = 0;
        out.gz = 0;
        return out;
      },
      spawnBulletImpact: () => {},
      spawnDebris: () => {},
      damageVoxel: () => {},
      spawnEnemyLootPack: () => {}
    };
    const bm = new BotManager(scene, world);
    bm.setBotCountPerSide(30, { playerTeam: 'US' });
    // 1 US human -> 29 US AI + 30 RU AI = 59 AI (60 total)
    assert.equal(bm.getActiveBotCount(), 59);

    // Mark 1 non-leader US AI dead; a 2nd US human joins -> dead US AI retires immediately!
    const deadUsCandidate = bm.bots.find((b) => b.team === 'US' && !b.isCommander && !b.isSquadLeader);
    deadUsCandidate.dead = true;
    deadUsCandidate.mesh.visible = false;

    // Meanwhile all 30 RU AI are currently ALIVE when 1 RU human joins -> zero live RU AI disappear!
    bm.syncHumanTeamCounts(2, 1);
    assert.equal(deadUsCandidate.retiredForHuman, true);
    assert.equal(bm.pendingRetireQuota.RU, 1);
    assert.equal(
      bm.bots.filter((b) => b.team === 'RU' && !b.dead).length,
      30,
      'no live RU AI should vanish mid-fight'
    );

    // Next RU AI dies naturally -> claims pendingRetireQuota and stays retired instead of respawning
    const ruBot = bm.bots.find((b) => b.team === 'RU' && !b.isCommander && !b.isSquadLeader);
    ruBot.dead = true;
    ruBot.respawnTimer = 0.01;
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 18000);
    const dummyPlayer = {
      name: 'TestPlayer',
      team: 'US',
      squad: 'ALPHA',
      role: 'engineer',
      hp: 100,
      dead: false,
      downed: false,
      bleeding: false,
      isFiring: false,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      yaw: 0,
      pitch: 0,
      camera,
      keys: {},
      activeVehicle: null,
      draggedBot: null,
      reviveTargetBot: null,
      takeDamage() {},
      applySuppression() {},
      reviveFromDowned() {}
    };
    bm.update(0.05, dummyPlayer, null, null, null, null);
    assert.equal(ruBot.retiredForHuman, true);
    assert.equal(bm.pendingRetireQuota.RU, 0);
    assert.equal(bm.getActiveBotCount(), 57); // 28 US AI + 29 RU AI + 3 Humans = 60!

    // Both extra humans disconnect -> retired AI slots reactivate back to 59 AI + 1 Human = 60!
    bm.syncHumanTeamCounts(1, 0);
    assert.equal(bm.getActiveBotCount(), 59);
  });
});
