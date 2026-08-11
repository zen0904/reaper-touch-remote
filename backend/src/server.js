import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import { Bonjour } from "bonjour-service";
import { config } from "./config.js";
import { StateManager } from "./state-manager.js";
import { ReaperAdapter } from "./reaper-adapter.js";
import { recoverReaperBridge } from "./reaper-bridge-recovery.js";
import { ALLOWED_COMMANDS, PROTOCOL_VERSION, ServerType } from "../../shared/protocol.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const frontend = path.join(root, "frontend");
const installedFxFile = path.join(config.bridgeDir, "installed-fx.json");
const captureExecutable = path.join(root, "plugin-stream/.build/release/reaper-plugin-stream");
const state = new StateManager();
const reaper = new ReaperAdapter(config.bridgeDir, config.statePollMs, {
  staleMs: config.bridgeStaleMs,
  recoveryMs: config.bridgeRecoveryMs,
  recover: config.autoRecoverBridge ? () => recoverReaperBridge(config.bridgeActionName) : null
});

const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((req, res) => {
  if (req.url === "/health") return json(res, 200, { ok: true, reaper: reaper.connected, protocol: PROTOCOL_VERSION });
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
let reaperMonitorTimer;
let monitorBusy = false;
let reaperSeen = false;
let reaperMisses = 0;
let shuttingDown = false;
let captureProcess = null;
const closeRemoteFx = () => {
  try { reaper.command({ id: `server-close-${Date.now()}`, action: "close_fx" }); } catch { /* Bridge may already be unavailable during shutdown. */ }
};

wss.on("connection", (ws) => {
  clearTimeout(remoteFxCleanupTimer);
  send(ws, { type: ServerType.HELLO, protocol: PROTOCOL_VERSION, server: "REAPER Touch Remote", hostname: os.hostname() });
  if (reaper.connected && state.snapshot) send(ws, { type: ServerType.SNAPSHOT, ...state.snapshot });
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
reaper.on("status", ({ connected }) => {
  if (!connected) state.clear();
  broadcast({ type: ServerType.STATUS, reaper: connected ? "online" : "waiting" });
});
reaper.on("error", (error) => console.error("REAPER bridge:", error.message));
reaper.start();

const bonjour = new Bonjour();
server.listen(config.port, config.host, () => {
  bonjour.publish({ name: `REAPER Touch Remote (${os.hostname()})`, type: "reaper-touch", protocol: "tcp", port: config.port, txt: { path: "/", version: String(PROTOCOL_VERSION) } });
  console.log(`REAPER Touch Remote: http://localhost:${config.port}`);
  console.log(`Bridge directory: ${config.bridgeDir}`);
  if (config.shutdownWithReaper) {
    reaperMonitorTimer = setInterval(checkReaperLifecycle, 1000);
    checkReaperLifecycle();
  }
});

function json(res, status, value) { res.writeHead(status, { "content-type": "application/json", "cache-control": "no-cache, no-store, must-revalidate" }); res.end(JSON.stringify(value)); }
async function proxyCapture(req, res) {
  const started = ensureCaptureService();
  if (started) await new Promise((resolve) => setTimeout(resolve, 320));
  const upstream = new URL(req.url.replace(/^\/capture/, ""), config.captureURL);
  const proxy = http.request(upstream, { method: req.method, headers: { ...req.headers, host: upstream.host } }, (response) => {
    res.writeHead(response.statusCode || 502, response.headers); response.pipe(res);
  });
  proxy.on("error", () => json(res, 503, { error: "capture_unavailable" }));
  req.pipe(proxy);
}

function ensureCaptureService() {
  if (!config.enableNativeStream || captureProcess?.exitCode === null) return false;
  if (!fs.existsSync(captureExecutable)) return false;
  captureProcess = spawn(captureExecutable, [], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });
  captureProcess.once("exit", () => { captureProcess = null; });
  captureProcess.once("error", (error) => { console.error("Native plug-in stream:", error.message); captureProcess = null; });
  return true;
}

function checkReaperLifecycle() {
  if (monitorBusy || shuttingDown) return;
  monitorBusy = true;
  execFile("/usr/bin/pgrep", ["-x", "REAPER"], (error) => {
    monitorBusy = false;
    if (!error) { reaperSeen = true; reaperMisses = 0; return; }
    reaperMisses += 1;
    if ((reaperSeen && reaperMisses >= 3) || reaperMisses >= 10) shutdown(0);
  });
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearTimeout(remoteFxCleanupTimer); clearInterval(reaperMonitorTimer); closeRemoteFx();
  try { bonjour.unpublishAll(() => bonjour.destroy()); } catch { /* Already closed. */ }
  reaper.stop();
  if (captureProcess?.exitCode === null) captureProcess.kill("SIGTERM");
  for (const client of wss.clients) client.terminate();
  wss.close();
  const forceExit = setTimeout(() => process.exit(exitCode), 1500); forceExit.unref();
  server.close(() => process.exit(exitCode));
}
process.on("SIGINT", () => shutdown(0)); process.on("SIGTERM", () => shutdown(0));
