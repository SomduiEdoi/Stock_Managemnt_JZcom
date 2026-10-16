import { describe, expect, it, vi } from "vitest";
import { readLimitedBody } from "./upload-limits";

describe("bounded request bodies", () => {
  it("rejects an oversized declared body before reading it", async () => {
    const request = new Request("http://localhost", { method: "POST", headers: { "content-length": "1000" }, body: "small" });
    const read = vi.spyOn(request.body!, "getReader");
    await expect(readLimitedBody(request, 10)).rejects.toMatchObject({ statusCode: 413 });
    expect(read).not.toHaveBeenCalled();
  });
  it("limits chunked bodies without trusting content-length", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(11)); }, cancel });
    const request = new Request("http://localhost", { method: "POST", body: stream, duplex: "half" } as RequestInit);
    await expect(readLimitedBody(request, 10)).rejects.toMatchObject({ statusCode: 413 });
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("accepts a body at the exact limit", async () => {
    const request = new Request("http://localhost", { method: "POST", body: "12345" });
    expect(await readLimitedBody(request, 5)).toEqual(new TextEncoder().encode("12345"));
  });
});
