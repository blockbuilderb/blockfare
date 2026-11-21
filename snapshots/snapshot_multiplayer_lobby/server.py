#!/usr/bin/env python3
"""
Zero-dependency Multi-Threaded HTTP + WebSocket + Telemetry Server for BattleBit Clone.
Uses Python's standard http.server.ThreadingHTTPServer across both IPv4 (0.0.0.0:8080)
and IPv6 (::1:8080) so Windows browsers never experience socket resets on parallel ES module loads.
"""

import base64
import hashlib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import socket
import struct
import threading
import time

ROOT_DIR = Path(__file__).resolve().parent
LOGS_DIR = ROOT_DIR / "logs"
LOGS_DIR.mkdir(exist_ok=True)
TELEMETRY_JSONL = LOGS_DIR / "battle_telemetry.jsonl"
SNAPSHOT_JSON = LOGS_DIR / "latest_snapshot.json"
HTTP_ACCESS_LOG = LOGS_DIR / "http_access.log"
WS_MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

CONNECTED_WS_SOCKETS = set()
WS_LOCK = threading.Lock()
LOG_LOCK = threading.Lock()
MP_LOCK = threading.Lock()

# Room state registry for HTTP & LAN Multiplayer Relay:
# room_code -> {"players": {client_id: dict}, "events": list[{"seq": int, "ts": float, "packet": dict}], "seq": int}
MP_ROOMS = {
    "FRUGIS-1": {"players": {}, "events": [], "seq": 0},
    "ALPHA-SQUAD": {"players": {}, "events": [], "seq": 0},
    "ARMOR-WAR": {"players": {}, "events": [], "seq": 0},
}


def get_lan_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.2)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        try:
            return socket.gethostbyname(socket.gethostname())
        except Exception:
            return "127.0.0.1"


LAN_IP = get_lan_ip()


def prune_stale_mp_state(now: float):
    for room in MP_ROOMS.values():
        stale_ids = [cid for cid, p in room["players"].items() if now - p.get("_updated", 0) > 6.5]
        for cid in stale_ids:
            room["players"].pop(cid, None)
        if len(room["events"]) > 160:
            room["events"] = room["events"][-100:]


def log_http_access(line: str):
    try:
        with LOG_LOCK:
            with HTTP_ACCESS_LOG.open("a", encoding="utf-8") as fh:
                fh.write(f"{time.strftime('%H:%M:%S')} {line}\n")
    except Exception:
        pass


def encode_ws_frame(text: str) -> bytes:
    payload = text.encode("utf-8")
    length = len(payload)
    header = bytearray([0x81])  # FIN + Text frame
    if length < 126:
        header.append(length)
    elif length < 65536:
        header.append(126)
        header.extend(struct.pack("!H", length))
    else:
        header.append(127)
        header.extend(struct.pack("!Q", length))
    return bytes(header) + payload


def recv_exact(sock: socket.socket, n: int) -> bytes:
    buf = bytearray()
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            raise ConnectionError("Socket closed")
        buf.extend(chunk)
    return bytes(buf)


def read_ws_frame(sock: socket.socket):
    first_two = recv_exact(sock, 2)
    b1, b2 = first_two[0], first_two[1]
    opcode = b1 & 0x0F
    masked = bool(b2 & 0x80)
    length = b2 & 0x7F

    if opcode == 0x8:
        return None

    if length == 126:
        length = struct.unpack("!H", recv_exact(sock, 2))[0]
    elif length == 127:
        length = struct.unpack("!Q", recv_exact(sock, 8))[0]

    mask_key = recv_exact(sock, 4) if masked else b"\x00\x00\x00\x00"
    data = bytearray(recv_exact(sock, length))
    if masked:
        for i in range(length):
            data[i] ^= mask_key[i % 4]

    if opcode == 0x1:
        return data.decode("utf-8", errors="ignore")
    return ""


class BattleBitRequestHandler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT_DIR), **kwargs)

    def log_message(self, format_str, *args):
        if "/api/telemetry" not in self.path and "/api/mp/" not in self.path:
            log_http_access(f"{self.client_address[0]}:{self.client_address[1]} - {format_str % args}")

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def guess_type(self, path):
        p = str(path).lower()
        if p.endswith(".js") or p.endswith(".mjs"):
            return "application/javascript; charset=utf-8"
        if p.endswith(".css"):
            return "text/css; charset=utf-8"
        if p.endswith(".html"):
            return "text/html; charset=utf-8"
        if p.endswith(".json"):
            return "application/json; charset=utf-8"
        return super().guess_type(path)

    def do_GET(self):
        raw_path = self.path.split("?")[0]

        if raw_path == "/ws" and self.headers.get("Upgrade", "").lower() == "websocket":
            self.handle_websocket_upgrade()
            return

        if raw_path == "/api/mp/rooms":
            now = time.time()
            with MP_LOCK:
                prune_stale_mp_state(now)
                rooms_list = []
                for code, rdata in MP_ROOMS.items():
                    players = [
                        {k: v for k, v in p.items() if not k.startswith("_")}
                        for p in rdata["players"].values()
                    ]
                    rooms_list.append({
                        "code": code,
                        "playerCount": len(players),
                        "players": players,
                    })
            body = json.dumps({
                "ok": True,
                "lanIp": LAN_IP,
                "port": 8080,
                "rooms": rooms_list,
            }).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(body)
            self.close_connection = True
            return

        if raw_path == "/api/telemetry":
            snap_text = SNAPSHOT_JSON.read_text(encoding="utf-8") if SNAPSHOT_JSON.is_file() else "{}"
            body = snap_text.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(body)
            self.close_connection = True
            return

        if raw_path == "/favicon.ico" and not (ROOT_DIR / "favicon.ico").is_file():
            self.send_response(204)
            self.send_header("Content-Length", "0")
            self.send_header("Connection", "close")
            self.end_headers()
            self.close_connection = True
            return

        super().do_GET()

    def do_POST(self):
        raw_path = self.path.split("?")[0]
        if raw_path == "/api/mp/sync":
            content_len = int(self.headers.get("Content-Length", "0"))
            raw_body = self.rfile.read(content_len) if content_len > 0 else b"{}"
            now = time.time()
            peers = []
            out_events = []
            latest_seq = 0
            room_code = "FRUGIS-1"
            try:
                payload = json.loads(raw_body.decode("utf-8", errors="ignore"))
                room_code = str(payload.get("room") or "FRUGIS-1").strip().upper()[:24] or "FRUGIS-1"
                client_id = str(payload.get("clientId") or "")
                state = payload.get("state")
                in_events = payload.get("events") or []
                last_seq = int(payload.get("lastSeq") or 0)

                with MP_LOCK:
                    prune_stale_mp_state(now)
                    if room_code not in MP_ROOMS:
                        MP_ROOMS[room_code] = {"players": {}, "events": [], "seq": 0}
                    room = MP_ROOMS[room_code]

                    if client_id and isinstance(state, dict):
                        state["senderId"] = client_id
                        state["room"] = room_code
                        state["_updated"] = now
                        room["players"][client_id] = state

                    for ev in in_events:
                        if isinstance(ev, dict):
                            room["seq"] += 1
                            ev["senderId"] = client_id
                            ev["room"] = room_code
                            room["events"].append({
                                "seq": room["seq"],
                                "ts": now,
                                "packet": ev,
                            })

                    latest_seq = room["seq"]
                    peers = [
                        {k: v for k, v in p.items() if not k.startswith("_")}
                        for cid, p in room["players"].items()
                        if cid != client_id
                    ]
                    if last_seq > 0:
                        out_events = [
                            item["packet"]
                            for item in room["events"]
                            if item["seq"] > last_seq and item["packet"].get("senderId") != client_id
                        ]
            except Exception:
                pass

            resp_body = json.dumps({
                "ok": True,
                "lanIp": LAN_IP,
                "port": 8080,
                "room": room_code,
                "players": peers,
                "events": out_events,
                "latestSeq": latest_seq,
            }).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(resp_body)))
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(resp_body)
            self.close_connection = True
            return

        if raw_path == "/api/telemetry":
            content_len = int(self.headers.get("Content-Length", "0"))
            raw_body = self.rfile.read(content_len) if content_len > 0 else b"{}"
            try:
                payload = json.loads(raw_body.decode("utf-8", errors="ignore"))
                events = payload.get("events", [])
                snapshot = payload.get("snapshot")
                if events:
                    with LOG_LOCK:
                        with TELEMETRY_JSONL.open("a", encoding="utf-8") as fh:
                            for ev in events:
                                fh.write(json.dumps(ev) + "\n")
                if snapshot:
                    with LOG_LOCK:
                        SNAPSHOT_JSON.write_text(json.dumps(snapshot, indent=2), encoding="utf-8")
            except Exception:
                pass

            resp_body = b'{"ok":true}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(resp_body)))
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(resp_body)
            self.close_connection = True
            return

        self.send_error(404, "Not Found")

    def handle_websocket_upgrade(self):
        key = self.headers.get("Sec-WebSocket-Key", "")
        accept = base64.b64encode(hashlib.sha1((key + WS_MAGIC).encode("utf-8")).digest()).decode("utf-8")
        log_http_access(f"{self.client_address[0]}:{self.client_address[1]} - WebSocket /ws connected")

        self.send_response(101, "Switching Protocols")
        self.send_header("Upgrade", "websocket")
        self.send_header("Connection", "Upgrade")
        self.send_header("Sec-WebSocket-Accept", accept)
        super().end_headers()
        self.wfile.flush()

        conn = self.connection
        with WS_LOCK:
            CONNECTED_WS_SOCKETS.add(conn)
        try:
            while True:
                msg = read_ws_frame(conn)
                if msg is None:
                    break
                if not msg:
                    continue
                frame = encode_ws_frame(msg)
                stale = []
                with WS_LOCK:
                    peers = list(CONNECTED_WS_SOCKETS)
                for peer in peers:
                    if peer is not conn:
                        try:
                            peer.sendall(frame)
                        except Exception:
                            stale.append(peer)
                if stale:
                    with WS_LOCK:
                        for s in stale:
                            CONNECTED_WS_SOCKETS.discard(s)
        except Exception:
            pass
        finally:
            with WS_LOCK:
                CONNECTED_WS_SOCKETS.discard(conn)
            self.close_connection = True


class IPv4Server(ThreadingHTTPServer):
    address_family = socket.AF_INET
    allow_reuse_address = True
    daemon_threads = True


class IPv6Server(ThreadingHTTPServer):
    address_family = socket.AF_INET6
    allow_reuse_address = True
    daemon_threads = True

    def server_bind(self):
        try:
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
        except Exception:
            pass
        super().server_bind()


def main(port=8080):
    log_http_access("=== SERVER RESTART (ThreadingHTTPServer IPv4 + IPv6) ===")
    servers = []
    try:
        s4 = IPv4Server(("0.0.0.0", port), BattleBitRequestHandler)
        servers.append(s4)
        t4 = threading.Thread(target=s4.serve_forever, daemon=True)
        t4.start()
    except Exception as e:
        print(f"IPv4 bind warning: {e}", flush=True)

    try:
        s6 = IPv6Server(("::1", port), BattleBitRequestHandler)
        servers.append(s6)
        t6 = threading.Thread(target=s6.serve_forever, daemon=True)
        t6.start()
    except Exception as e:
        print(f"IPv6 bind warning: {e}", flush=True)

    bound = [str(s.server_address) for s in servers]
    print(
        f"BattleBit Clone Multi-Threaded Server running on http://127.0.0.1:{port} and http://localhost:{port} (bound: {bound})",
        flush=True,
    )
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        for s in servers:
            s.shutdown()


if __name__ == "__main__":
    main(8080)
