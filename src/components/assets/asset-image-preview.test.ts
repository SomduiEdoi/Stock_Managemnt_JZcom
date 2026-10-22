import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";
vi.stubGlobal("React", React);
afterAll(() => vi.unstubAllGlobals());
import { AssetImagePreview } from "./asset-image-preview";
describe("asset image previews", () => {
  it("shows a fixed-size accessible placeholder when no image exists", () => {
    const html = renderToStaticMarkup(React.createElement(AssetImagePreview, { alt: "Cable" }));
    expect(html).toContain("No image for Cable");
    expect(html).toContain("h-12 w-12");
    expect(html).not.toContain("<button");
  });
  it("uses the original image URL with an accessible enlargement button", () => {
    const html = renderToStaticMarkup(React.createElement(AssetImagePreview, { src: "/uploads/cable.png", alt: "Cable" }));
    expect(html).toContain("Enlarge image of Cable");
    expect(html).toContain('src="/uploads/cable.png"');
    expect(html).toContain('type="button"');
    expect(html).not.toContain("/_next/image");
  });
});
