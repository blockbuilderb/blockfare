# 🌐 Blockfare Multiplayer Architecture & Capacity Guide

Blockfare defaults directly into **Online Room Mode (`FRUGIS-1`, `500P` scale)** so that:
- **1 player in a room** plays identically to Singleplayer (`1 Human + 499 AI = 500 combatants`).
- **Additional players opening the URL** drop seamlessly into the same live Conquest theater with zero server setup.
- **Clean Short URLs**:
  - Default room (`FRUGIS-1`): **`https://blockbuilderb.github.io/blockfare/`** *(no query string needed!)*
  - Custom room (e.g. `2` or `ALPHA`): **`https://blockbuilderb.github.io/blockfare/?r=2`** *(also accepts legacy `?room=...`)*
  - Offline Solo mode: **`https://blockbuilderb.github.io/blockfare/?solo`** *(or toggle **`🎮 Offline`** in the top bar)*

---

## 📊 Room Player Capacity: Option 1 vs. Option 2

Blockfare ships with **both** serverless browser-to-browser P2P networking (**Option 1**) and a live Cloudflare Edge Durable Object Relay (**Option 2**, enabled by default):

| Feature | Option 1: WebRTC P2P Swarm Mesh | Option 2: Cloudflare Edge Relay *(Default)* |
| :--- | :--- | :--- |
| **Human Players per Room** | **8–12 players per room** | **32–64 players per room** |
| **Total Combatants (Humans + AI)** | **Up to 500** (`250 US vs. 250 RU`) | **Up to 500** (`250 US vs. 250 RU`) |
| **Concurrent Rooms** | Unlimited room codes (`FRUGIS-1`, etc.) | Unlimited Durable Object room instances |
| **Network Topology** | Full P2P mesh ($N - 1$ `RTCDataChannel` pairs per browser) | Star relay (**1** edge WebSocket per browser to nearest Cloudflare PoP) |
| **Strict Firewall / Corporate NAT Support** | Works on home/mobile NATs via Google/Cloudflare STUN; symmetric NATs may block direct P2P | **Universal** — outbound port `443` `wss://` works across strict school, corporate, and symmetric NATs |
| **Hosting Cost** | **$0** (zero backend) | **$0** on Cloudflare Workers Free Plan (uses SQLite Durable Object + WebSocket Hibernation) |
| **Source Files** | `src/network/WebRtcTransport.js`, `src/network.js` | `cloudflare-relay/src/worker.js`, `cloudflare-relay/src/room-core.js`, `src/network.js` |

### Why Option 1 Caps Around 8–12 Players vs. Option 2 Scaling to 32–64 Players
- **Option 1 (WebRTC P2P Swarm Mesh — `8–12 players/room`)**: Every peer opens direct `RTCDataChannel`s (`fast` unordered/0-retransmit for 20 Hz movement + `reliable` ordered for hits, voxel craters, kills, and Conquest tickets) to every other peer in the room. At 10 players, each browser sends/receives 9 peer streams (`180 pkt/s` out), which is fast and crisp; past ~12 players, per-client upload fan-out grows quadratically ($N \times (N - 1)$).
- **Option 2 (Cloudflare Worker + `BattleRoom` Durable Object — `32–64 players/room`)**: Every browser maintains **only 1** WebSocket connection (`wss://blockfare-relay.blockbuilderb.workers.dev/ws`) to the room's dedicated `BattleRoom` Durable Object at the edge. Client upload stays constant regardless of room size, allowing **32–64 human players** to fight smoothly in a single room (with HTTP `/api/mp/sync` automatic fallback if WebSockets are blocked by a proxy).

---

## 🤖 Full-Scale AI Rooms & Graceful Dead-AI Slot Retirement

Every online room stays populated to its full battle scale (`500P` = `250 US vs. 250 RU` by default):

1. **Dynamic Faction Balance (`BotManager.syncHumanTeamCounts`)**:
   - With 1 US human in `FRUGIS-1`, the teams are `1 US Human + 249 US AI` vs. `250 RU AI` (`500` total).
   - With 4 US humans and 3 RU humans, the teams automatically balance to `4 US Humans + 246 US AI` vs. `3 RU Humans + 247 RU AI` (`500` total).
2. **Zero Mid-Fight Disappearances (Dead-AI Retirement Priority)**:
   - When a real player joins or switches teams, `BotManager` searches that faction for an **already-dead non-leader AI** waiting to respawn and retires its slot (`retiredForHuman = true`) immediately.
   - If every AI on that faction happens to be alive at the exact moment a player joins, **no live AI soldier is ever despawned or deleted mid-gunfight**. Instead, `pendingRetireQuota[team]` increments and holds the respawn of the very next AI on that team that dies naturally in combat.
3. **Automatic Slot Recovery**:
   - When a human player leaves the room, a retired AI slot on that team immediately reactivates and spawns back into the fight.

---

## 🔄 Switching or Self-Hosting Relays

1. **In-Game Multiplayer Panel (`[O]`)**:
   - Press **`[O]`** (or click the top-left online status pill) to view active rooms, switch room codes, copy a shareable invite URL, paste any custom `wss://` Cloud Relay URL, or click **`🌐 USE P2P WEBRTC`** to force Option 1 P2P mode.
2. **Deploy Your Own Option 2 Cloudflare Worker**:
   ```bash
   cd cloudflare-relay
   npx wrangler login
   npx wrangler deploy
   ```
