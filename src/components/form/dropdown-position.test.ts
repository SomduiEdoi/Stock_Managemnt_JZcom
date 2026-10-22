import { describe, expect, it } from "vitest";
import { dropdownPosition } from "./dropdown-position";
describe("portal dropdown placement", () => {
  const viewport = { width: 800, height: 600 };
  it("gives status menus enough width without leaving the viewport", () => {
    const result = dropdownPosition({ left: 750, top: 20, bottom: 50, width: 100 }, 150, viewport, 176);
    expect(result.width).toBe(176);
    expect(result.left).toBe(616);
  });
  it("caps the minimum width on narrow screens", () => {
    const result = dropdownPosition({ left: 0, top: 20, bottom: 50, width: 100 }, 150, { width: 150, height: 600 }, 176);
    expect(result.width).toBe(134);
    expect(result.left).toBe(8);
  });
  it("opens below when there is room", () => expect(dropdownPosition({ left: 100, top: 100, bottom: 144, width: 300 }, 400, viewport)).toEqual({ left: 100, top: 148, width: 300, maxHeight: 240 }));
  it("flips above at the bottom of a modal", () => expect(dropdownPosition({ left: 100, top: 500, bottom: 544, width: 300 }, 400, viewport).top).toBe(256));
  it("limits height to the available side on small viewports", () => {
    const result = dropdownPosition({ left: 10, top: 100, bottom: 144, width: 280 }, 500, { width: 320, height: 220 });
    expect(result.maxHeight).toBe(88); expect(result.top).toBe(8);
  });
  it("constrains horizontal width and position", () => {
    const result = dropdownPosition({ left: -20, top: 20, bottom: 64, width: 1000 }, 100, viewport);
    expect(result.width).toBe(784); expect(result.left).toBe(8);
  });
  it("respects a shifted visual viewport", () => {
    const result = dropdownPosition({ left: 0, top: 170, bottom: 214, width: 300 }, 100, { width: 320, height: 300, top: 100, left: 20 });
    expect(result.left).toBe(28); expect(result.top).toBe(218);
  });
});
