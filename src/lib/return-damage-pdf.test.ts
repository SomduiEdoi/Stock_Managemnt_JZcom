import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildDamageDocumentHtml,
  buildDamagePdf,
  type DamagePdfInput,
  type DamagePdfItem,
} from "./return-damage-pdf";
import { renderDocumentPdf } from "./transaction-pdf";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

vi.mock("./transaction-pdf", () => ({ renderDocumentPdf: vi.fn() }));

const item = (
  outcome: DamagePdfItem["outcome"],
  model: string = outcome,
): DamagePdfItem => ({
  model,
  description: "Product description",
  stockCode: "ST-001",
  serialNo: "SN-001",
  quantity: 2,
  outcome,
  note: "Inspection note",
});
const input = (): DamagePdfInput => ({
  requestNo: "REQ-20261005-02",
  sourceRequestNo: "REQ-20261001-01",
  projectName: "Project Alpha",
  requesterName: "Original requester",
  items: [item("FAIL"), item("LOST"), item("USED")],
  signatures: { requester: [], lead: [], storeman: [] },
});

describe("return damage PDF", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each(["internalRequest", "serviceRequest", "projectRequest"] as const)(
    "preserves the source request category %s",
    (category) => {
      const html = buildDamageDocumentHtml({ ...input(), [category]: true });
      const flags = [...html.matchAll(/<span class="checkbox">([^<]*)<\/span>\s*<span>(Internal|Service|Project)<\/span>/g)];
      expect(flags.map((flag) => flag[1])).toEqual(
        ["internalRequest", "serviceRequest", "projectRequest"].map((value) => value === category ? "✓" : ""),
      );
    },
  );

  it("includes only FAIL, LOST and USED even with mixed runtime input", () => {
    const data = input();
    data.items.push(
      {
        ...item("FAIL"),
        model: "Excluded return",
        outcome: "RETURN",
      } as unknown as DamagePdfItem,
      {
        ...item("FAIL"),
        model: "Excluded sale",
        outcome: "SOLD",
      } as unknown as DamagePdfItem,
    );
    const html = buildDamageDocumentHtml(data);
    for (const outcome of ["FAIL", "LOST", "USED"])
      expect(html).toContain(`<td>${outcome}</td>`);
    expect(html).not.toContain("Excluded return");
    expect(html).not.toContain("Excluded sale");
    expect(html.match(/<main /g)).toHaveLength(1);
    expect(html).toContain("<th>Description</th>");
    expect(html).toContain("<th>Outcome</th>");
    expect(html).toContain("<th>Note</th>");
    expect(html).toContain("<td>Product description</td>");
    expect(html).toContain("<td>Inspection note</td>");
    expect(html).toContain("<td>2</td>");
  });

  it("reuses the bilingual JZ template, references, document code and fonts", () => {
    const html = buildDamageDocumentHtml(input(), {
      regular: "file:///regular.ttf",
      bold: "file:///bold.ttf",
    });
    for (const value of [
      "JZ Computer and Consultant",
      "หจก. เจซี",
      "Condition Report",
      "REQ-20261005-02",
      "REQ-20261001-01",
      "Project Alpha",
      "Original requester",
      "FM-5300(2)-R.5",
      "file:///regular.ttf",
      "file:///bold.ttf",
      "22fr 28fr 50fr",
    ])
      expect(html).toContain(value);
    expect(html).not.toContain("from REQ-20261005-02");
  });

  it("renders independent cards and keeps Executive authorization unsigned", () => {
    const data = input();
    const snapshot = "data:image/png;base64,aGVsbG8=";
    data.signatures = {
      requester: [
        {
          name: "Requester A",
          signatureDataUrl: snapshot,
          date: "2026-10-04T18:00:00Z",
        },
        { name: "Requester B" },
      ],
      lead: [{ name: "Lead A" }, { name: "Lead B" }],
      storeman: [{ name: "Store A" }, { name: "Store B" }],
    };
    const html = buildDamageDocumentHtml(data);
    for (const name of [
      "Requester A",
      "Requester B",
      "Lead A",
      "Lead B",
      "Store A",
      "Store B",
    ])
      expect(html.match(new RegExp(`\\( ${name} \\)`, "g"))).toHaveLength(1);
    expect(html).toContain("Date : 05/10/26");
    expect(html).toContain(snapshot);
    const executive = html.slice(
      html.indexOf('<div class="signature-label">Executive Authorized'),
    );
    expect(executive.split("</section>")[0]).not.toContain("<img");
    expect(executive).toContain('<div class="signature-user signature-user-blank"><span>(</span><span>)</span></div>');
    expect(html).toContain(".signature-user-blank { display: flex; justify-content: space-between;");
  });

  it("escapes all supplied text and rejects remote signature image sources", () => {
    const data = input();
    data.projectName = '<script>alert("x")</script>';
    data.items[0].note = '<img src="file:///secret">&';
    data.signatures.lead = [
      { name: "<Lead>", signatureDataUrl: "https://example.com/signature.png" },
    ];
    const html = buildDamageDocumentHtml(data);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).toContain("&lt;img src=&quot;file:///secret&quot;&gt;&amp;");
    expect(html).toContain("&lt;Lead&gt;");
    expect(html).not.toContain("https://example.com");
  });

  it("paginates filtered items with continuous row numbers", () => {
    const data = input();
    data.items = Array.from({ length: 11 }, (_, index) =>
      item("USED", `Model ${index}`),
    );
    const html = buildDamageDocumentHtml(data);
    expect(html.match(/<main /g)).toHaveLength(2);
    expect(html).toContain("(1/2)");
    expect(html).toContain("(2/2)");
    expect(html).toContain("<td>11</td><td>Model 10</td>");
  });

  it("adds signature continuation pages without duplicating items or signer cards", () => {
    const data = input();
    data.signatures.storeman = Array.from({ length: 7 }, (_, index) => ({
      name: `Store ${index}`,
    }));
    const html = buildDamageDocumentHtml(data);
    expect(html.match(/<main /g)).toHaveLength(2);
    expect(html.match(/<td>Product description<\/td>/g)).toHaveLength(3);
    for (let index = 0; index < 7; index++)
      expect(
        html.match(new RegExp(`\\( Store ${index} \\)`, "g")),
      ).toHaveLength(1);
    expect(html.match(/Executive Authorized by/g)).toHaveLength(2);
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid quantity %s",
    (quantity) => {
      const data = input();
      data.items[0].quantity = quantity;
      expect(() => buildDamageDocumentHtml(data)).toThrow(
        "positive safe integers",
      );
    },
  );

  it("does not invoke the renderer for batches with no reportable items", async () => {
    const data = input();
    data.items = [
      { ...item("FAIL"), outcome: "RETURN" } as unknown as DamagePdfItem,
    ];
    await expect(buildDamagePdf(data)).rejects.toThrow(
      "at least one FAIL, LOST or USED",
    );
    expect(renderDocumentPdf).not.toHaveBeenCalled();
    expect(() => buildDamageDocumentHtml({ ...data, items: [] })).toThrow(
      "at least one",
    );
  });

  it("returns the shared renderer Buffer and passes through configured fonts", async () => {
    const pdf = Buffer.from("%PDF-1.4");
    vi.mocked(renderDocumentPdf).mockImplementation(async (builder) => {
      expect(builder({ regular: "file:///configured.ttf" })).toContain(
        "file:///configured.ttf",
      );
      return pdf;
    });
    await expect(buildDamagePdf(input())).resolves.toBe(pdf);
    expect(renderDocumentPdf).toHaveBeenCalledOnce();
  });

  it("propagates renderer failures", async () => {
    vi.mocked(renderDocumentPdf).mockRejectedValue(new Error("Chrome failed"));
    await expect(buildDamagePdf(input())).rejects.toThrow("Chrome failed");
  });

  it.skipIf(!process.env.DAMAGE_PDF_LAYOUT_SAMPLE)(
    "renders a real bilingual, two-page layout sample",
    async () => {
      const actual =
        await vi.importActual<typeof import("./transaction-pdf")>(
          "./transaction-pdf",
        );
      vi.mocked(renderDocumentPdf).mockImplementation(actual.renderDocumentPdf);
      const data = input();
      data.projectName = "Project Alpha / โครงการทดสอบ";
      data.requesterName = "ผู้ขอทดสอบ";
      data.items = Array.from({ length: 11 }, (_, index) => ({
        ...item(
          (["FAIL", "LOST", "USED"] as const)[index % 3],
          `Switch Model ${index + 1}`,
        ),
        description: "อุปกรณ์เครือข่าย Network switch",
        stockCode: `NW-SW-${String(index + 1).padStart(4, "0")}`,
        serialNo: `SN-20261005-${String(index + 1).padStart(4, "0")}`,
        note: "ตรวจสภาพแล้ว / Inspected",
      }));
      data.signatures = {
        requester: [{ name: "ผู้ขอทดสอบ", date: "2026-10-05T03:00:00Z" }],
        lead: [
          { name: "Lead Alpha", date: "2026-10-05T04:00:00Z" },
          { name: "Supervisor Beta", date: "2026-10-05T05:00:00Z" },
        ],
        storeman: Array.from({ length: 4 }, (_, index) => ({
          name: `Storeman ${index + 1}`,
          date: "2026-10-05T06:00:00Z",
        })),
      };
      const pdf = await buildDamagePdf(data);
      expect(Buffer.isBuffer(pdf)).toBe(true);
      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
      expect(pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)).toHaveLength(
        2,
      );
      const samplePath = process.env.DAMAGE_PDF_LAYOUT_SAMPLE!;
      await mkdir(dirname(samplePath), { recursive: true });
      await writeFile(samplePath, pdf);
    },
    90000,
  );
});
