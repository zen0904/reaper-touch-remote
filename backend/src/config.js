import os from "node:os";
import path from "node:path";

const home = os.homedir();
export const config = Object.freeze({
  host: process.env.RTR_HOST || "0.0.0.0",
  port: Number(process.env.RTR_PORT || 47830),
  bridgeDir: process.env.RTR_BRIDGE_DIR || path.join(home, "Library/Application Support/REAPER/REAPER Touch Remote"),
  captureURL: process.env.RTR_CAPTURE_URL || "http://127.0.0.1:47831",
  enableNativeStream: process.env.RTR_ENABLE_NATIVE_STREAM !== "0",
  meterIntervalMs: Number(process.env.RTR_METER_INTERVAL || 40),
  statePollMs: Number(process.env.RTR_STATE_POLL_INTERVAL || 30),
  bridgeStaleMs: Number(process.env.RTR_BRIDGE_STALE_MS || 750),
  bridgeRecoveryMs: Number(process.env.RTR_BRIDGE_RECOVERY_MS || 4000),
  autoRecoverBridge: process.env.RTR_AUTO_RECOVER_BRIDGE !== "0",
  bridgeActionName: process.env.RTR_BRIDGE_ACTION || "REAPER_Touch_Remote_Bridge",
  shutdownWithReaper: process.env.RTR_SHUTDOWN_WITH_REAPER === "1"
});
