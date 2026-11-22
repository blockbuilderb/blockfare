# Blockfare Cloud Multiplayer Relay (Option 2 — Cloudflare Workers + Durable Objects)

Zero-dependency WebSocket + HTTP Room Relay for **Blockfare** (`https://blockbuilderb.github.io/blockfare/`).
Uses Cloudflare's **Durable Object WebSocket Hibernation API** + `new_sqlite_classes` so it runs on Cloudflare's **$0 Free Plan** and supports **32–64 players per room** (compared to **8–12 players per room** on Option 1 WebRTC P2P Mesh), even across strict corporate/university NATs.

## 1-Command Deploy
```bash
cd cloudflare-relay
npx wrangler login
npx wrangler deploy
```

Wrangler will print your live Worker URL, e.g.:
`https://blockfare-relay.<your-subdomain>.workers.dev`

## Connect Blockfare to Your Cloud Relay
1. Open Blockfare and press **`[O]`** (or click the top-left **Multiplayer** status pill).
2. Paste `wss://blockfare-relay.<your-subdomain>.workers.dev/ws` into **CLOUD RELAY (`WSS://`)** and click **CONNECT RELAY**!
3. Click **📋 COPY INVITE LINK** — the copied URL automatically embeds `&relay=wss://...` so anyone clicking your link connects straight to your Cloud Relay!
