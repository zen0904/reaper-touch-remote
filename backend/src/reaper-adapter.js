import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";

export class ReaperAdapter extends EventEmitter {
  constructor(directory, pollMs = 30) {
    super();
    this.directory = directory;
    this.pollMs = pollMs;
    this.stateFile = path.join(directory, "state.json");
    this.commandFile = path.join(directory, "commands.tsv");
    this.lastMtime = 0;
  }

  start() {
    fs.mkdirSync(this.directory, { recursive: true });
    this.timer = setInterval(() => this.poll(), this.pollMs);
    this.timer.unref();
  }

  stop() { clearInterval(this.timer); }

  poll() {
    try {
      const stat = fs.statSync(this.stateFile);
      if (stat.mtimeMs <= this.lastMtime) return;
      const state = JSON.parse(fs.readFileSync(this.stateFile, "utf8"));
      this.lastMtime = stat.mtimeMs;
      this.emit("state", state);
    } catch (error) {
      if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) this.emit("error", error);
    }
  }

  command({ id, action, target = "", value = "" }) {
    const safe = [id, action, target, value].map((part) => String(part).replace(/[\t\r\n]/g, " "));
    fs.appendFileSync(this.commandFile, `${safe.join("\t")}\n`, { encoding: "utf8" });
  }
}
