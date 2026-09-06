import { describe, test, expect } from "bun:test";
import { gunzipSync, inflateSync, brotliDecompressSync } from "node:zlib";
import { compressSync } from "../src/compress";

const DATA = "The quick brown fox jumps over the lazy dog. ".repeat(200);

describe("compressSync", () => {
  test("gzip round-trips", () => {
    const out = compressSync(DATA, "gzip");
    expect(gunzipSync(out).toString()).toBe(DATA);
    expect(out.length).toBeLessThan(Buffer.byteLength(DATA));
  });

  test("deflate round-trips", () => {
    const out = compressSync(DATA, "deflate");
    expect(inflateSync(out).toString()).toBe(DATA);
  });

  test("brotli round-trips", () => {
    const out = compressSync(DATA, "br");
    expect(brotliDecompressSync(out).toString()).toBe(DATA);
  });

  test("identity returns input unchanged", () => {
    expect(compressSync(DATA, "identity").toString()).toBe(DATA);
  });

  test("accepts Buffer input", () => {
    const buf = Buffer.from(DATA, "utf8");
    const out = compressSync(buf, "gzip");
    expect(gunzipSync(out).toString()).toBe(DATA);
  });

  test("respects level option", () => {
    const high = compressSync(DATA, "gzip", { level: 9 });
    const low = compressSync(DATA, "gzip", { level: 1 });
    expect(high.length).toBeLessThanOrEqual(low.length);
  });

  test("respects brotli quality option", () => {
    const high = compressSync(DATA, "br", { brotliQuality: 11 });
    const low = compressSync(DATA, "br", { brotliQuality: 1 });
    expect(high.length).toBeLessThanOrEqual(low.length);
  });
});
