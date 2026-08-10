import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import { Bonjour } from "bonjour-service";
import { config } from "./config.js";
import { StateManager } from "./state-manager.js";
import { ReaperAdapter } from "./reaper-adapter.js";
import { ALLOWED_COMMANDS, PROTOCOL_VERSION, ServerType } from "../../shared/protocol.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const frontend = path.join(root, "frontend");
const installedFxFile = path.join(config.bridgeDir, "installed-fx.json");
const state = new StateManager();
const reaper = new ReaperAdapter(config.bridgeDir, config.statePollMs);

const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((req, res) => {
  if (req.url === "/health") return json(res, 200, { ok: true, reaper: Boolean(state.snapshot), protocol: PROTOCOL_VERSION });
  if (req.url?.startsWith("/capture/")) return proxyCapture(req, res);
  const pathname = new URL(req.url, "http://local").pathname;
  if (pathname === "/api/fx") return fs.readFile(installedFxFile, "utf8", (error, body) => {
    if (error) return json(res, 503, { error: "fx_inventory_unavailable" });
    try { return json(res, 200, JSON.parse(body)); } catch { return json(res, 503, { error: "fx_inventory_invalid" }); }
  });
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  const file = path.resolve(frontend, requested);
  if (!file.startsWith(frontend)) return json(res, 403, { error: "forbidden" });
  fs.readFile(file, (error, body) => {
    if (error) return json(res, 404, { error: "not_found" });
    res.writeHead(200, { "content-type": mime[path.extname(file)] || "application/octet-stream", "cache-control": "no-cache, no-store, must-revalidate" });
    res.end(body);
  });
});

const wss = new WebSocketServer({ server, path: "/ws", perMessageDeflate: false });
const send = (ws, payload) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(payload));
const broadcast = (payload) => wss.clients.forEach((client) => send(client, payload));
let remoteFxCleanupTimer;
const closeRemoteFx = () => {
  try { reaper.command({ id: `server-close-${Date.now()}`, action: "close_fx" }); } catch { /* Bridge may already be unavailable during shutdown. */ }
};

wss.on("connection", (ws) => {
  clearTimeout(remoteFxCleanupTimer);
  send(ws, { type: ServerType.HELLO, protocol: PROTOCOL_VERSION, server: "REAPER Touch Remote", hostname: os.hostname() });
  if (state.snapshot) send(ws, { type: ServerType.SNAPSHOT, ...state.snapshot });
  else send(ws, { type: ServerType.STATUS, reaper: "waiting" });
  ws.on("message", (raw) => {
    let message;
    try { message = JSON.parse(raw); } catch { return send(ws, { type: ServerType.ERROR, error: "invalid_json" }); }
    if (message.type === "heartbeat") return send(ws, { type: ServerType.HEARTBEAT, at: Date.now(), echo: message.at });
    if (message.type === "resync_request") return state.snapshot && send(ws, { type: ServerType.SNAPSHOT, ...state.snapshot });
    if (message.type !== "command" || !ALLOWED_COMMANDS.has(message.action) || !message.id) return send(ws, { type: ServerType.ERROR, id: message.id, error: "invalid_command" });
    try {
      reaper.command(message);
      send(ws, { type: ServerType.ACK, id: message.id, status: "queued" });
    } catch (error) { send(ws, { type: ServerType.ERROR, id: message.id, error: error.message }); }
  });
  ws.on("close", () => { remoteFxCleanupTimer = setTimeout(() => { if (wss.clients.size === 0) closeRemoteFx(); }, 1000); });
});

state.on("snapshot", (snapshot) => broadcast({ type: ServerType.SNAPSHOT, ...snapshot }));
state.on("update", (update) => broadcast({ type: ServerType.UPDATE, ...update }));
reaper.on("state", (next) => state.ingest(next));
reaper.on("error", (error) => console.error("REAPER bridge:", error.message));
reaper.start();

const bonjour = new Bonjour();
server.listen(config.port, config.host, () => {
  bonjour.publish({ name: `REAPER Touch Remote (${os.hostname()})`, type: "reaper-touch", protocol: "tcp", port: config.port, txt: { path: "/", version: String(PROTOCOL_VERSION) } });
  console.log(`REAPER Touch Remote: http://localhost:${config.port}`);
  console.log(`Bridge directory: ${config.bridgeDir}`);
});

function json(res, status, value) { res.writeHead(status, { "content-type": "application/json", "cache-control": "no-cache, no-store, must-revalidate" }); res.end(JSON.stringify(value)); }
function proxyCapture(req, res) {
  const upstream = new URL(req.url.replace(/^\/capture/, ""), config.captureURL);
  const proxy = http.request(upstream, { method: req.method, headers: { ...req.headers, host: upstream.host } }, (response) => {
    res.writeHead(response.statusCode || 502, response.headers); response.pipe(res);
  });
  proxy.on("error", () => json(res, 503, { error: "capture_unavailable" }));
  req.pipe(proxy);
}

function shutdown() { clearTimeout(remoteFxCleanupTimer); closeRemoteFx(); bonjour.unpublishAll(() => bonjour.destroy()); reaper.stop(); wss.close(); server.close(); }
process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);
