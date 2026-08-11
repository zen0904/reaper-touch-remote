export function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

// Small movements stay precise while long throws accelerate enough to cross a
// full parameter range without repeatedly lifting a finger.
export function rotaryDragValue(originValue, distancePixels, pointerType = "touch") {
  const distance = Math.abs(distancePixels);
  const base = pointerType === "mouse" ? 0.0019 : 0.00145;
  const acceleration = 1 + Math.min(1, distance / 180);
  return clamp01(originValue + distancePixels * base * acceleration);
}

export function eqPointerValue(clientX, clientY, rect, geometry) {
  const rawX = ((clientX - rect.left) / Math.max(1, rect.width)) * geometry.width;
  const rawY = ((clientY - rect.top) / Math.max(1, rect.height)) * geometry.height;
  const x = Math.max(geometry.insetX, Math.min(geometry.width - geometry.insetX, rawX));
  const y = Math.max(geometry.insetY, Math.min(geometry.height - geometry.insetY, rawY));
  return {
    x,
    y,
    frequency: (x - geometry.insetX) / (geometry.width - geometry.insetX * 2),
    gain: 1 - (y - geometry.insetY) / (geometry.height - geometry.insetY * 2)
  };
}

// Pinching outward widens the band (lower Q); pinching inward narrows it
// (higher Q). A logarithmic ratio feels consistent at different hand sizes.
export function eqPinchQValue(originValue, originDistance, currentDistance) {
  const start = Math.max(12, Number(originDistance) || 12);
  const current = Math.max(12, Number(currentDistance) || 12);
  return clamp01(originValue - Math.log2(current / start) * 0.42);
}

// Fast attack keeps transients visible while a slower release prevents the RTA
// from jumping between analyzer frames on a touch display.
export function smoothSpectrumFrame(previous = [], next = [], attack = 0.58, release = 0.2) {
  return next.map((raw, index) => {
    const value = clamp01(raw);
    const before = clamp01(previous[index]);
    const amount = value >= before ? attack : release;
    return before + (value - before) * amount;
  });
}

export function spectrumTransferDb(input = [], output = [], index = 0, radius = 1) {
  if (!input.length || !output.length) return 0;
  const center = Math.max(0, Math.min(Math.min(input.length, output.length) - 1, Math.round(index)));
  let inputSum = 0; let outputSum = 0; let count = 0;
  for (let offset = -radius; offset <= radius; offset++) {
    const bin = center + offset;
    if (bin < 0 || bin >= input.length || bin >= output.length) continue;
    inputSum += clamp01(input[bin]); outputSum += clamp01(output[bin]); count++;
  }
  return count ? ((outputSum - inputSum) / count) * 100 : 0;
}

// The probes report normalized -100..0 dB FFT bins before and after the FX.
// Removing the static curve leaves the actual live dynamics contribution.
export function dynamicBandGainDb(input = [], output = [], index = 0, staticDb = 0, rangeDb = 0, minimumInput = 0.18) {
  if (!input.length || !output.length || Math.abs(rangeDb) < 0.05) return 0;
  const center = Math.max(0, Math.min(input.length - 1, Math.round(index)));
  let level = 0; let count = 0;
  for (let offset = -1; offset <= 1; offset++) {
    const bin = center + offset;
    if (bin < 0 || bin >= input.length) continue;
    level += clamp01(input[bin]); count++;
  }
  if (!count || level / count < minimumInput) return 0;
  const residual = spectrumTransferDb(input, output, center) - Number(staticDb || 0);
  return rangeDb > 0
    ? Math.max(0, Math.min(rangeDb, residual))
    : Math.min(0, Math.max(rangeDb, residual));
}
