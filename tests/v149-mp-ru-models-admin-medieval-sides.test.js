import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { NetworkManager } from '../src/network.js?v=150';
import { BattleRoomCore } from '../cloudflare-relay/src/room-core.js';
import { getFactionLabel } from '../src/config.js?v=150';
import { Scoreboard } from '../src/ui/Scoreboard.js?v=150';
import { VictoryScreen } from '../src/ui/VictoryScreen.js?v=150';
import { DeployScreen } from '../src/ui/DeployScreen.js?v=150';
import { HudRenderer } from '../src/ui/HudRenderer.js?v=150';
import { CommandPanel } from '../src/ui/CommandPanel.js?v=150';
import { MinimapRenderer } from '../src/ui/MinimapRenderer.js?v=150';

function createFakeEl() {
  const classes = new Set();
  return {
    textContent: '',
    innerHTML: '',
    style: {},
    dataset: {},
    classList: {
      add: (...c) => c.forEach((x) => classes.add(x)),
      remove: (...c) => c.forEach((x) => classes.delete(x)),
      toggle: (c, force) => {
        const next = force === undefined ? !classes.has(c) : Boolean(force);
        if (next) classes.add(c);
        else classes.delete(c);
        return next;
      },
      contains: (c) => classes.has(c)
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {}
  };
}

function createMockMultiplayerContext({ clientId, callsign, team = 'US', era = 'modern' }) {
  const scene = new THREE.Scene();
  const world = {
    era,
    spawns: {
      US_BASE: new THREE.Vector3(-1520, 0, 0),
      RU_BASE: new THREE.Vector3(1520, 0, 0)
    },
    flags: [
      { id: 'A', name: 'Obj A', owner: 'US', captureProgress: 100, radius: 34, pos: new THREE.Vector3(-600, 0, 0) },
      { id: 'C', name: 'Obj C', owner: 'NEUTRAL', captureProgress: 0, radius: 34, pos: new THREE.Vector3(0, 0, 0) },
      { id: 'E', name: 'Obj E', owner: 'RU', captureProgress: -100, radius: 34, pos: new THREE.Vector3(600, 0, 0) }
    ],
    destroyVoxel: () => {},
    addVoxel: () => {}
  };
  const player = {
    name: callsign,
    team,
    subFaction: team,
    role: 'engineer',
    squad: 'ALPHA',
    squadShort: 'ALP',
    commandRank: 'COMMANDER',
    pos: new THREE.Vector3(0, 0, 0),
    yaw: 0,
    pitch: 0,
    hp: 100,
    dead: false,
    downed: false,
    activeVehicle: null,
    currentWeapon: () => ({
      weaponId: team === 'RU' ? 'ak15' : 'm4a1',
      def: { id: team === 'RU' ? 'ak15' : 'm4a1', type: 'gun', shortName: team === 'RU' ? 'AK-15' : 'M4A1' }
    })
  };
  const botManager = {
    bots: [],
    setBotCountPerSide: () => {},
    syncHumanTeamCounts: () => {},
    spawnTracer: () => {}
  };
  const vehicleManager = { vehicles: [] };
  const net = new NetworkManager(scene, world, player, botManager, {
    clientId,
    vehicleManager,
    isStaticHost: true,
    autoInitTransports: false
  });
  net.callsign = callsign;
  net.gameMode = 'MULTIPLAYER';
  return { scene, world, player, botManager, vehicleManager, net };
}

describe('v149 — RU Online Player 3D Models, Server Host Default Admin & Medieval West vs East', () => {
  test('1. Online player joining as default US on deploy screen then switching to RU rebuilds into red-helmet RU soldier model', () => {
    const host = createMockMultiplayerContext({
      clientId: 'p_host_01',
      callsign: 'HOST_ONE',
      team: 'US',
      era: 'modern'
    });

    // Step A: Remote player initially connects while sitting on Deploy Screen (default team 'US')
    host.net.handleMessage({
      type: 'state',
      _seq: 1,
      _sender: 'p_ru_joiner',
      senderId: 'p_ru_joiner',
      room: 'FRUGIS-1',
      name: 'IVAN_RU',
      team: 'US',
      role: 'ASSAULT',
      commandRank: 'MEMBER',
      pos: [10, 0, 5],
      dead: true
    });

    const rp = host.net.remotePlayers.get('p_ru_joiner');
    assert.ok(rp, 'remote player entry created');
    const initialMesh = rp.mesh;
    const initialHelmetHex = initialMesh.userData.parts.helmet.material.color.getHex();
    assert.equal(initialHelmetHex, 0x2980b9, 'initial default US mesh has blue helmet (0x2980b9)');

    // Step B: Remote player clicks RU on Deploy Screen and deploys as RU Recon with SV-98
    host.net.handleMessage({
      type: 'state',
      _seq: 2,
      _sender: 'p_ru_joiner',
      senderId: 'p_ru_joiner',
      room: 'FRUGIS-1',
      name: 'IVAN_RU',
      team: 'RU',
      subFaction: 'RU',
      role: 'RECON',
      commandRank: 'SQUAD_LEADER',
      weaponId: 'sv98',
      pos: [1500, 0, -20],
      dead: false
    });

    assert.notEqual(rp.mesh, initialMesh, 'remote player 3D mesh was rebuilt on US -> RU switch');
    assert.equal(initialMesh.parent, null, 'old blue US mesh removed from Three.js scene');
    assert.equal(rp.mesh.parent, host.scene, 'new RU mesh added to Three.js scene');
    const ruHelmetHex = rp.mesh.userData.parts.helmet.material.color.getHex();
    assert.equal(ruHelmetHex, 0xc0392b, 'RU online player wears red RU helmet (0xc0392b), never blue');

    // Verify zero stale hitboxes point to the discarded US mesh
    for (const hitMesh of host.net.remoteHitMeshes) {
      let anc = hitMesh;
      while (anc.parent) anc = anc.parent;
      assert.equal(anc, host.scene, 'all remoteHitMeshes belong to active scene mesh');
    }

    // Step C: Era switch to Medieval rebuilds remote player meshes into West (blue) & East (red) knights in scene
    host.world.era = 'medieval';
    host.net.rebuildAllRemotePlayerMeshes();
    assert.equal(rp.mesh.parent, host.scene, 'remote RU/East player remains in scene after era switch');
    assert.ok(rp.mesh.userData.swordScabbardGroup, 'remote player rebuilt with Medieval knight armor & scabbard');
  });

  test('2. Server creator / host is default admin; non-admins cannot start a new round or switch era (both UI/local & network enforced)', async () => {
    // Host has alphabetically HIGHER clientId ('p_zzz_host') than late joiner ('p_aaa_guest')
    // to prove host tenure beats random clientId alphabetical order!
    const host = createMockMultiplayerContext({
      clientId: 'p_zzz_host',
      callsign: 'SERVER_CREATOR',
      team: 'US'
    });
    const guest = createMockMultiplayerContext({
      clientId: 'p_aaa_guest',
      callsign: 'LATE_GUEST',
      team: 'RU'
    });

    // Host created the room 20 seconds before Guest joined
    host.net._enteredRoomPerfAt = performance.now() - 20000;
    guest.net._enteredRoomPerfAt = performance.now() - 40;

    // Wire mock BattleBitGame-compatible switchEra & resetMatch guards onto both sides
    const wireGameMocks = (ctx) => {
      const notifications = [];
      const uiMock = {
        world: ctx.world,
        player: ctx.player,
        network: ctx.net,
        addXpNotification: (_xp, txt) => notifications.push(txt),
        syncEraUI: () => {},
        closeMainMenu: () => {}
      };
      const gameMock = {
        roundEpoch: 1,
        activeEra: ctx.world.era,
        ticketsUS: 800,
        ticketsRU: 800,
        matchTimeRemaining: 900,
        matchEnded: false,
        world: ctx.world,
        network: ctx.net,
        ui: uiMock,
        resetCount: 0,
        switchEra(eraId, _closeMenu = true, opts = {}) {
          if (!opts.fromAdminSync && this.network.isMultiplayer() && !this.network.isLocalAdmin()) {
            this.ui.addXpNotification(0, `🔒 ONLY SERVER ADMIN (${this.network.getRoomAdminName()}) CAN CHANGE COMBAT ERA!`);
            return this.world;
          }
          this.world.era = eraId;
          this.activeEra = eraId;
          this.network.rebuildAllRemotePlayerMeshes();
          if (!opts.fromAdminSync && this.network.isMultiplayer() && this.network.isLocalAdmin()) {
            this.roundEpoch++;
            this.network.send({
              type: 'admin_era_change',
              era: eraId,
              roundEpoch: this.roundEpoch,
              ticketsUS: 800,
              ticketsRU: 800,
              matchTimeRemaining: 900
            });
          }
          return this.world;
        },
        resetMatch(fromRemote = false) {
          if (!fromRemote && this.network.isMultiplayer() && !this.network.isLocalAdmin()) {
            this.ui.addXpNotification(0, `🔒 ONLY SERVER ADMIN (${this.network.getRoomAdminName()}) CAN START A NEW ROUND!`);
            return false;
          }
          if (!fromRemote) this.roundEpoch++;
          this.resetCount++;
          if (!fromRemote && this.network.isMultiplayer() && this.network.isLocalAdmin()) {
            this.network.send({
              type: 'match_reset',
              roundEpoch: this.roundEpoch,
              era: this.world.era,
              ticketsUS: 800,
              ticketsRU: 800,
              matchTimeRemaining: 900
            });
          }
          return true;
        }
      };
      ctx.net.gameRef = gameMock;
      ctx.gameMock = gameMock;
      ctx.notifications = notifications;
    };
    wireGameMocks(host);
    wireGameMocks(guest);

    // Connect bidirectional mock packet pipe between Host and Guest
    host.net.send = (payload) => {
      const pkt = {
        ...payload,
        _seq: ++host.net._txSeq,
        _sender: host.net.clientId,
        senderId: host.net.clientId,
        room: 'FRUGIS-1'
      };
      guest.net.handleMessage(pkt);
    };
    guest.net.send = (payload) => {
      const pkt = {
        ...payload,
        _seq: ++guest.net._txSeq,
        _sender: guest.net.clientId,
        senderId: guest.net.clientId,
        room: 'FRUGIS-1'
      };
      host.net.handleMessage(pkt);
    };

    // Exchange state packets on join
    host.net.broadcastImmediateState();
    guest.net.broadcastImmediateState();

    assert.equal(host.net.isLocalAdmin(), true, 'Server creator is default admin');
    assert.equal(guest.net.isLocalAdmin(), false, 'Joining player is NOT admin');
    assert.equal(guest.net.getRoomAdminId(), 'p_zzz_host');
    assert.equal(guest.net.getRoomAdminName(), 'SERVER_CREATOR');

    // Non-admin attempts to switch era & start new round -> BLOCKED locally!
    guest.gameMock.switchEra('medieval');
    assert.equal(guest.world.era, 'modern', 'Non-admin cannot change era');
    assert.equal(host.world.era, 'modern', 'Host era unaffected by non-admin');
    assert.equal(guest.gameMock.resetMatch(false), false, 'Non-admin cannot start new round');
    assert.equal(host.gameMock.resetCount, 0);
    assert.ok(guest.notifications.some((n) => n.includes('ONLY SERVER ADMIN')));

    // Non-admin sends spoofed raw network packets -> REJECTED by Host NetworkManager!
    guest.net.send({ type: 'admin_era_change', era: 'jurassic', roundEpoch: 99 });
    guest.net.send({ type: 'match_reset', roundEpoch: 100 });
    assert.equal(host.world.era, 'modern', 'Spoofed non-admin era packet ignored');
    assert.equal(host.gameMock.resetCount, 0, 'Spoofed non-admin match_reset packet ignored');

    // Host Admin switches era to 'medieval' -> BOTH Host and Guest switch to 'medieval'!
    host.gameMock.switchEra('medieval');
    assert.equal(host.world.era, 'medieval');
    assert.equal(guest.world.era, 'medieval', 'Guest automatically syncs to Host Admin era switch');

    // Host Admin starts a new round -> BOTH Host and Guest reset cleanly!
    assert.equal(host.gameMock.resetMatch(false), true);
    assert.equal(host.gameMock.resetCount, 1);
    assert.equal(guest.gameMock.resetCount, 1, 'Guest resets match when Host Admin starts new round');

    // Edge Relay (`BattleRoomCore`) also tracks first joiner as serverAdminId & blocks non-admin resets
    const edgeRoom = new BattleRoomCore({}, {});
    const resHost = await (
      await edgeRoom.fetch(
        new Request('https://relay.test/api/mp/sync?room=MED-1', {
          method: 'POST',
          body: JSON.stringify({
            clientId: 'p_edge_host',
            state: { type: 'state', name: 'EDGE_HOST', team: 'US', era: 'medieval' },
            events: [],
            lastSeq: 0
          })
        })
      )
    ).json();
    assert.equal(resHost.serverAdminId, 'p_edge_host');

    const resGuest = await (
      await edgeRoom.fetch(
        new Request('https://relay.test/api/mp/sync?room=MED-1', {
          method: 'POST',
          body: JSON.stringify({
            clientId: 'p_edge_guest',
            state: { type: 'state', name: 'EDGE_GUEST', team: 'RU' },
            events: [
              { type: 'match_reset', roundEpoch: 50 },
              { type: 'admin_era_change', era: 'modern', roundEpoch: 51 }
            ],
            lastSeq: 0
          })
        })
      )
    ).json();
    assert.equal(resGuest.serverAdminId, 'p_edge_host', 'Host remains serverAdminId');
    assert.equal(resGuest.era, 'medieval', 'Non-admin era change blocked by Edge Relay');
    assert.equal(edgeRoom.events.length, 0, 'Non-admin match_reset/era events dropped by Edge Relay');
  });

  test('3. Medieval Era displays WEST vs EAST (never US vs RU) across Deploy, HUD, Scoreboard, Map & Victory Screen', () => {
    assert.equal(getFactionLabel('US', 'medieval', 'short'), 'WEST');
    assert.equal(getFactionLabel('RU', 'medieval', 'short'), 'EAST');
    assert.equal(getFactionLabel('US', 'medieval', 'forces'), 'WEST KINGDOM');
    assert.equal(getFactionLabel('RU', 'medieval', 'forces'), 'EAST EMPIRE');
    assert.equal(getFactionLabel('US', 'medieval', 'hq'), 'WEST KEEP');
    assert.equal(getFactionLabel('RU', 'medieval', 'hq'), 'EAST CITADEL');

    const ctx = createMockMultiplayerContext({
      clientId: 'p_med_1',
      callsign: 'SIR_ARTHUR',
      team: 'US',
      era: 'medieval'
    });
    ctx.player.role = 'swordsman';

    // Scoreboard & Victory Screen HTML / Text verification
    const uiObj = Object.assign(
      {},
      HudRenderer,
      Scoreboard,
      VictoryScreen,
      DeployScreen,
      CommandPanel,
      MinimapRenderer,
      {
        world: ctx.world,
        player: ctx.player,
        botManager: ctx.botManager,
        vehicleManager: ctx.vehicleManager,
        network: ctx.net,
        lastMatchTime: 600,
        lastTicketsUS: 720,
        lastTicketsRU: 640,
        ticketStats: { US: { gainedCapture: 20 }, RU: { gainedCapture: 0 } },
        victoryScreenEl: createFakeEl(),
        scoreboardEl: createFakeEl(),
        victoryReasonTagEl: createFakeEl(),
        victoryTitleEl: createFakeEl(),
        victoryScorelineEl: createFakeEl(),
        victorySideSummaryEl: createFakeEl(),
        victorySquadSummaryEl: createFakeEl(),
        victoryMvpCardsEl: createFakeEl(),
        sbSideCompEl: createFakeEl(),
        sbSquadGridEl: createFakeEl(),
        sbUsHeaderEl: createFakeEl(),
        sbRuHeaderEl: createFakeEl(),
        sbUsBody: createFakeEl(),
        sbRuBody: createFakeEl(),
        el: () => null
      }
    );

    uiObj.renderScoreboard(true);
    assert.ok(uiObj.sbUsHeaderEl.innerHTML.includes('WEST KINGDOM'));
    assert.ok(uiObj.sbRuHeaderEl.innerHTML.includes('EAST EMPIRE'));
    assert.ok(!uiObj.sbUsHeaderEl.innerHTML.includes('US FORCES'));
    assert.ok(!uiObj.sbRuHeaderEl.innerHTML.includes('RU FORCES'));
    assert.ok(uiObj.sbSideCompEl.innerHTML.includes('WEST MOMENTUM'));
    assert.ok(uiObj.sbSideCompEl.innerHTML.includes('EAST MOMENTUM'));
    assert.ok(!uiObj.sbSideCompEl.innerHTML.includes('US FORCES'));
    assert.ok(!uiObj.sbSideCompEl.innerHTML.includes('RU FORCES'));

    uiObj.showVictoryScreen('RU', 0, 215, 420, null);
    assert.equal(uiObj.victoryTitleEl.textContent, 'EAST EMPIRE VICTORY');
    assert.ok(uiObj.victoryScorelineEl.textContent.includes('WEST 0 — EAST 215'));
    assert.ok(!uiObj.victoryScorelineEl.textContent.includes('US 0'));

    // Sector navigation check at West Keep & East Citadel
    ctx.player.pos.set(-1520, 0, 0);
    assert.equal(uiObj.computeSquadNavigationGuide().playerSectorLabel, 'WEST KEEP HQ');
    ctx.player.pos.set(1520, 0, 0);
    assert.equal(uiObj.computeSquadNavigationGuide().playerSectorLabel, 'EAST CITADEL HQ');
  });
});
