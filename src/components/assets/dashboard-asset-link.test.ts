import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { DashboardAssetLink } from "./dashboard-asset-link";

describe("dashboard asset navigation", () => {
  it("links active assets to their detail page", () => {
    const html = renderToStaticMarkup(createElement(DashboardAssetLink, { assetId: "asset-1", isActive: true }, "Asset"));
    expect(html).toContain('href="/dashboard/assets/asset-1"');
    expect(html).toContain("Asset");
  });

  it("renders a notification button instead of a broken link for deleted assets", () => {
    const html = renderToStaticMarkup(createElement(DashboardAssetLink, { assetId: "asset-1", isActive: false }, "Deleted asset"));
    expect(html).toContain('<button type="button"');
    expect(html).not.toContain("href=");
  });
});
