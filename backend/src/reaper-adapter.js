import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";

export class ReaperAdapter extends EventEmitter {
  constructor(directory, pollMs = 30, options = {}) {
    super();
    this.directory = directory;
    this.pollMs = pollMs;
    this.staleMs = options.staleMs ?? Math.max(500, pollMs * 10);
    this.recover = options.recover;
    this.recoveryMs = options.recoveryMs ?? 4000;
    this.stateFile = path.join(directory, "state.json");
    this.commandFile = path.join(directory, "commands.tsv");
    this.lastMtime = 0;
    this.lastSeenAt = 0;
    this.lastRecoveryAt = 0;
    this.connectedState = false;
    this.startedAt = 0;
  }

  get connected() { return this.connectedState; }

  start() {
    fs.mkdirSync(this.directory, { recursive: true });
    this.startedAt = Date.now();
    this.poll();
    this.timer = setInterval(() => this.poll(), this.pollMs);
    this.timer.unref();
  }

  stop() { clearInterval(this.timer); }

  poll() {
    const now = Date.now();
    try {
      const stat = fs.statSync(this.stateFile);
      if (stat.mtimeMs > this.lastMtime) {
        const state = JSON.parse(fs.readFileSync(this.stateFile, "utf8"));
        this.lastMtime = stat.mtimeMs;
        this.lastSeenAt = now;
        this.#setConnected(true);
        this.emit("state", state);
      }
    } catch (error) {
      if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) this.emit("error", error);
    }
    if (this.lastSeenAt === 0 || now - this.lastSeenAt > this.staleMs) {
      this.#setConnected(false);
      this.#tryRecovery(now);
    }
  }

  command({ id, action, target = "", value = "" }) {
    if (!this.connected) throw new Error("reaper_bridge_offline");
    const safe = [id, action, target, value].map((part) => String(part).replace(/[\t\r\n]/g, " "));
    fs.appendFileSync(this.commandFile, `${safe.join("\t")}\n`, { encoding: "utf8" });
  }

  #setConnected(connected) {
    if (connected === this.connectedState) return;
    this.connectedState = connected;
    this.emit("status", { connected });
  }

  #tryRecovery(now) {
    if (!this.recover || now - this.startedAt < this.staleMs || now - this.lastRecoveryAt < this.recoveryMs) return;
    this.lastRecoveryAt = now;
    Promise.resolve(this.recover()).catch((error) => this.emit("error", error));
  }
}
