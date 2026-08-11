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
