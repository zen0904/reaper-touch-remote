import os from "node:os";
import path from "node:path";

const home = os.homedir();
export const config = Object.freeze({
  host: process.env.RTR_HOST || "0.0.0.0",
  port: Number(process.env.RTR_PORT || 47830),
  bridgeDir: process.env.RTR_BRIDGE_DIR || path.join(home, "Library/Application Support/REAPER/REAPER Touch Remote"),
  captureURL: process.env.RTR_CAPTURE_URL || "http://127.0.0.1:47831",
  meterIntervalMs: Number(process.env.RTR_METER_INTERVAL || 40),
  statePollMs: Number(process.env.RTR_STATE_POLL_INTERVAL || 30)
});
