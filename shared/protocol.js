export const PROTOCOL_VERSION = 1;

export const ClientType = Object.freeze({
  HELLO: "hello",
  COMMAND: "command",
  RESYNC_REQUEST: "resync_request",
  HEARTBEAT: "heartbeat"
});

export const ServerType = Object.freeze({
  HELLO: "hello",
  SNAPSHOT: "snapshot",
  UPDATE: "state_update",
  ACK: "command_ack",
  ERROR: "command_error",
  HEARTBEAT: "heartbeat",
  STATUS: "server_status"
});

export const ALLOWED_COMMANDS = new Set([
  "set_track_volume", "set_track_pan", "set_track_mute", "set_track_solo",
  "select_track", "rename_track", "add_fx", "set_fx_bypass", "set_fx_param", "open_fx", "close_fx"
]);
