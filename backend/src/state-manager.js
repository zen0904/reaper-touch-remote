import { EventEmitter } from "node:events";

function topologySignature(state) {
  return JSON.stringify({
    project: { name: state.project?.name, path: state.project?.path },
    tracks: state.tracks?.map((track) => ({
      id: track.id, number: track.number, name: track.name,
      fx: track.fx?.map(({ id, index, name }) => ({ id, index, name }))
    })),
    selectedFx: state.selectedFx && {
      trackId: state.selectedFx.trackId, fxIndex: state.selectedFx.fxIndex,
      id: state.selectedFx.id, name: state.selectedFx.name,
      parameters: state.selectedFx.parameters?.map(({ value, formatted, ...schema }) => schema)
    }
  });
}

function realtimeChanges(previous, next) {
  const meters = next.tracks.map((track) => ({ id: track.id, meter: track.meter, signal: track.signal }));
  const tracks = [];
  for (const track of next.tracks) {
    const before = previous.tracks.find((candidate) => candidate.id === track.id);
    if (!before) continue;
    const changed = { id: track.id };
    for (const key of ["volume", "pan", "mute", "solo", "fxEnabled", "selected"]) {
      if (track[key] !== before[key]) changed[key] = track[key];
    }
    const fx = track.fx.flatMap((item) => {
      const old = before.fx.find((candidate) => item.id ? candidate.id === item.id : candidate.index === item.index);
      return old && old.enabled !== item.enabled ? [{ id: item.id, index: item.index, enabled: item.enabled }] : [];
    });
    if (fx.length) changed.fx = fx;
    if (Object.keys(changed).length > 1) tracks.push(changed);
  }

  let selectedFx;
  const beforeFx = previous.selectedFx;
  const nextFx = next.selectedFx;
  if (beforeFx && nextFx && beforeFx.id === nextFx.id) {
    const parameters = nextFx.parameters.flatMap((param) => {
      const old = beforeFx.parameters.find((candidate) => candidate.index === param.index);
      return old && old.value === param.value && old.formatted === param.formatted
        ? [] : [{ index: param.index, value: param.value, formatted: param.formatted }];
    });
    const presetChanged = JSON.stringify(beforeFx.preset || null) !== JSON.stringify(nextFx.preset || null);
    if (parameters.length || presetChanged) selectedFx = { id: nextFx.id, trackId: nextFx.trackId, fxIndex: nextFx.fxIndex, ...(presetChanged ? { preset: nextFx.preset } : {}), parameters };
  }
  return { meters, tracks, ...(selectedFx ? { selectedFx } : {}) };
}

export class StateManager extends EventEmitter {
  #state = null;
  #seq = 0;
  #structural = "";

  get snapshot() { return this.#state && { seq: this.#seq, state: this.#state }; }

  clear() {
    this.#state = null;
    this.#structural = "";
  }

  ingest(next) {
    if (!next || !Array.isArray(next.tracks) || typeof next.project !== "object") return false;
    const structural = topologySignature(next);
    const previous = this.#state;
    this.#state = next;
    this.#seq += 1;
    if (!previous || structural !== this.#structural) {
      this.#structural = structural;
      this.emit("snapshot", this.snapshot);
    } else {
      this.emit("update", { seq: this.#seq, changes: realtimeChanges(previous, next) });
    }
    return true;
  }
}
