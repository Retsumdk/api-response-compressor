import { describe, test, expect } from "bun:test";
import { gunzipSync, brotliDecompressSync } from "node:zlib";
import { createCompressor, ResponseCompressor } from "../src/compressor";
import { compressWith } from "./helpers";

const BIG = "hello world ".repeat(500); // ~6000 bytes

describe("ResponseCompressor", () => {
  test("negotiates best encoding", () => {
    const c = new ResponseCompressor();
    expect(c.negotiate("br, gzip")).toBe("br");
    expect(c.negotiate("gzip")).toBe("gzip");
    expect(c.negotiate(undefined)).toBe("identity");
  });

  test("isCompressibleType", () => {
    const c = new ResponseCompressor();
    expect(c.isCompressibleType("application/json")).toBe(true);
    expect(c.isCompressibleType("text/html; charset=utf-8")).toBe(true);
    expect(c.isCompressibleType("application/ld+json")).toBe(true);
    expect(c.isCompressibleType("image/png")).toBe(false);
    expect(c.isCompressibleType("application/zip")).toBe(false);
  });

  test("compresses a large JSON body with brotli", () => {
    const c = new ResponseCompressor();
    const r = c.compress(BIG, { acceptEncoding: "br", contentType: "application/json" });
    expect(r.decision.compressed).toBe(true);
    expect(r.decision.encoding).toBe("br");
    expect(r.headers["Content-Encoding"]).toBe("br");
    expect(brotliDecompressSync(r.body).toString()).toBe(BIG);
  });

  test("compresses with gzip when requested", () => {
    const c = new ResponseCompressor();
    const r = c.compress(BIG, { acceptEncoding: "gzip", contentType: "application/json" });
    expect(r.decision.encoding).toBe("gzip");
    expect(gunzipSync(r.body).toString()).toBe(BIG);
  });

  test("skips bodies below threshold", () => {
    const c = new ResponseCompressor({ threshold: 1024 });
    const small = "tiny";
    const r = c.compress(small, { acceptEncoding: "gzip", contentType: "text/plain", contentLength: small.length });
    expect(r.decision.compressed).toBe(false);
    expect(r.headers["Content-Encoding"]).toBeUndefined();
    expect(r.body.toString()).toBe(small);
  });

  test("skips non-compressible content types", () => {
    const c = new ResponseCompressor();
    const r = c.compress(BIG, { acceptEncoding: "gzip", contentType: "image/png" });
    expect(r.decision.compressed).toBe(false);
    expect(r.decision.reason).toContain("not compressible");
  });

  test("skips when client accepts no encoding", () => {
    const c = new ResponseCompressor();
    const r = c.compress(BIG, { acceptEncoding: "identity", contentType: "application/json" });
    expect(r.decision.compressed).toBe(false);
  });

  test("always sets Vary: Accept-Encoding", () => {
    const c = new ResponseCompressor();
    const r = c.compress(BIG, { acceptEncoding: "gzip", contentType: "application/json" });
    expect(r.headers["Vary"]).toBe("Accept-Encoding");
  });

  test("custom compressible types override defaults", () => {
    const c = new ResponseCompressor({ compressibleTypes: ["application/custom"] });
    expect(c.isCompressibleType("application/custom")).toBe(true);
    expect(c.isCompressibleType("application/json")).toBe(false);
  });

  test("factory returns a working compressor", () => {
    const c = createCompressor();
    expect(c).toBeInstanceOf(ResponseCompressor);
    expect(compressWith(BIG, "gzip").length).toBeGreaterThan(0);
  });
});
