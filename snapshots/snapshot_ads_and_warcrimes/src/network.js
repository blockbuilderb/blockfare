import * as THREE from '../vendor/three.module.js';
import { createSoldierMesh } from './bots.js?v=15';
import { sound } from './audio.js?v=15';

export class NetworkManager {
  constructor(scene, world, player, botManager) {
    this.scene = scene;
    this.world = world;
    this.player = player;
    this.botManager = botManager;

    this.clientId = 'p_' + Math.random().toString(36).slice(2, 9);
    this.remotePlayers = new Map(); // id -> remotePlayer state
    this.remoteHitMeshes = [];
    this.ws = null;
    this.wsConnected = false;
    this.broadcastChannel = null;
    this.syncTimer = 0;

    this.initTransports();
  }

  initTransports() {
    // 1. Browser BroadcastChannel for instant multi-tab multiplayer
    if (typeof BroadcastChannel !== 'undefined') {
      this.broadcastChannel = new BroadcastChannel('battlebit_clone_net_v1');
      this.broadcastChannel.onmessage = (ev) => {
        if (ev.data && ev.data.senderId !== this.clientId) {
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
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg && msg.senderId !== this.clientId) {
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
    const packet = { ...payload, senderId: this.clientId, ts: performance.now() };
    if (this.wsConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(packet));
    }
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage(packet);
    }
  }

  handleMessage(msg) {
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
    }
  }

  updateRemotePlayer(msg) {
    let rp = this.remotePlayers.get(msg.senderId);
    if (!rp) {
      const mesh = createSoldierMesh(msg.team, true);
      this.scene.add(mesh);
      rp = {
        id: msg.senderId,
        name: msg.name || `PLAYER_${msg.senderId.slice(2, 5)}`,
        team: msg.team,
        squad: msg.squad || 'ALPHA',
        role: msg.role || 'ENGINEER',
        pos: new THREE.Vector3(),
        yaw: 0,
        dead: false,
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
    }

    rp.lastSeen = performance.now();
    rp.team = msg.team;
    if (msg.squad) rp.squad = msg.squad;
    rp.dead = Boolean(msg.dead);
    rp.kills = msg.kills || 0;
    rp.deaths = msg.deaths || 0;
    rp.score = msg.score || 0;
    rp.mesh.visible = !rp.dead;

    if (msg.pos) {
      rp.pos.fromArray(msg.pos);
      rp.mesh.position.copy(rp.pos);
    }
    if (typeof msg.yaw === 'number') {
      rp.yaw = msg.yaw;
      rp.mesh.rotation.y = rp.yaw + Math.PI;
    }
  }

  handleRemoteShoot(msg) {
    if (!msg.origin || !msg.end) return;
    const start = new THREE.Vector3().fromArray(msg.origin);
    const end = new THREE.Vector3().fromArray(msg.end);
    this.botManager.spawnTracer(start, end, 0xffeaa7);
    const dist = start.distanceTo(this.player.pos);
    if (dist < 130) {
      sound.playGunshot('rifle', dist);
    }
  }

  getRemoteMeshes() {
    return this.remoteHitMeshes;
  }

  update(dt) {
    this.syncTimer += dt;
    if (this.syncTimer >= 0.06) {
      this.syncTimer = 0;
      this.send({
        type: 'state',
        name: `PLAYER_${this.clientId.slice(2, 5).toUpperCase()}`,
        team: this.player.team,
        squad: this.player.squad || 'ALPHA',
        role: this.player.role.toUpperCase(),
        pos: this.player.pos.toArray(),
        yaw: this.player.yaw,
        dead: this.player.dead,
        kills: this.player.kills,
        deaths: this.player.deaths,
        score: this.player.score
      });
    }

    // Prune timed-out remote players & decay speech bubbles
    const now = performance.now();
    for (const [id, rp] of this.remotePlayers.entries()) {
      if (rp.speechBubbleTimer > 0) {
        rp.speechBubbleTimer = Math.max(0, rp.speechBubbleTimer - dt);
      }
      if (now - rp.lastSeen > 5000) {
        this.scene.remove(rp.mesh);
        this.remotePlayers.delete(id);
      }
    }
  }
}
