export function containedImagePoint(clientX, clientY, rect, naturalWidth, naturalHeight) {
  if (!rect || rect.width <= 0 || rect.height <= 0 || naturalWidth <= 0 || naturalHeight <= 0) return null;
  const scale = Math.min(rect.width / naturalWidth, rect.height / naturalHeight);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;
  const left = rect.left + (rect.width - width) / 2;
  const top = rect.top + (rect.height - height) / 2;
  if (clientX < left || clientX > left + width || clientY < top || clientY > top + height) return null;
  return {
    x: Math.max(0, Math.min(1, (clientX - left) / width)),
    y: Math.max(0, Math.min(1, (clientY - top) / height))
  };
}
