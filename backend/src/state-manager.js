import { EventEmitter } from "node:events";

function stableWithoutMeters(state) {
  const { timestamp, ...withoutClock } = state;
  return JSON.stringify({ ...withoutClock, tracks: state.tracks?.map(({ meter, ...track }) => track) });
}

export class StateManager extends EventEmitter {
  #state = null;
  #seq = 0;
  #structural = "";

  get snapshot() { return this.#state && { seq: this.#seq, state: this.#state }; }

  ingest(next) {
    if (!next || !Array.isArray(next.tracks) || typeof next.project !== "object") return false;
    const structural = stableWithoutMeters(next);
    const previous = this.#state;
    this.#state = next;
    this.#seq += 1;
    if (!previous || structural !== this.#structural) {
      this.#structural = structural;
      this.emit("snapshot", this.snapshot);
    } else {
      const meters = next.tracks.map((track) => ({ id: track.id, meter: track.meter }));
      this.emit("update", { seq: this.#seq, changes: { meters } });
    }
    return true;
  }
}
