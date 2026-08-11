export function adjacentRackTarget(tracks, currentTrackId, delta, preferredSlot = 0) {
  if (!Array.isArray(tracks) || tracks.length < 2 || !delta) return null;
  const current = tracks.findIndex((track) => track.id === currentTrackId);
  if (current < 0) return null;
  const direction = delta < 0 ? -1 : 1;
  for (let offset = 1; offset < tracks.length; offset += 1) {
    const index = (current + direction * offset + tracks.length) % tracks.length;
    const track = tracks[index];
    if (!track.fx?.length) continue;
    const slot = Math.max(0, Math.min(track.fx.length - 1, preferredSlot));
    return { track, fx: track.fx[slot], index, slot };
  }
  return null;
}
