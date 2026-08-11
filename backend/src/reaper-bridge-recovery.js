import { execFile } from "node:child_process";

function run(file, args, timeout = 5000) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout }, (error, stdout) => error ? reject(error) : resolve(stdout));
  });
}

export async function recoverReaperBridge(actionName = "REAPER_Touch_Remote_Bridge") {
  if (process.platform !== "darwin") return false;
  try { await run("/usr/bin/pgrep", ["-x", "REAPER"], 1000); }
  catch { return false; }

  const safeAction = String(actionName).replace(/["\\]/g, "");
  const lines = [
    'tell application "REAPER" to activate',
    "delay 0.2",
    'tell application "System Events" to tell process "REAPER"',
    'if not (exists window "Actions") then click menu item "Show action list..." of menu "Actions" of menu bar item "Actions" of menu bar 1',
    "delay 0.25",
    `set value of text field 1 of window "Actions" to "${safeAction}"`,
    "delay 0.25",
    'click button "Run/close" of window "Actions"',
    "end tell"
  ];
  await run("/usr/bin/osascript", lines.flatMap((line) => ["-e", line]));
  return true;
}
