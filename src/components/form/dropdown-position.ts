export function dropdownPosition(trigger: { left: number; top: number; bottom: number; width: number }, contentHeight: number, viewport: { width: number; height: number; left?: number; top?: number }) {
  const padding = 8;
  const gap = 4;
  const viewportLeft = viewport.left ?? 0;
  const viewportTop = viewport.top ?? 0;
  const width = Math.min(trigger.width, Math.max(0, viewport.width - padding * 2));
  const below = Math.max(0, viewportTop + viewport.height - padding - trigger.bottom - gap);
  const above = Math.max(0, trigger.top - viewportTop - padding - gap);
  const naturalHeight = Math.min(240, contentHeight);
  const openBelow = below >= naturalHeight || below >= above;
  const maxHeight = Math.min(240, openBelow ? below : above);
  const height = Math.min(naturalHeight, maxHeight);
  return {
    left: Math.max(viewportLeft + padding, Math.min(trigger.left, viewportLeft + viewport.width - padding - width)),
    top: Math.max(viewportTop + padding, openBelow ? trigger.bottom + gap : trigger.top - gap - height),
    width,
    maxHeight,
  };
}
