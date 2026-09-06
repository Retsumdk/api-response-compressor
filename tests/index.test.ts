import { describe, test, expect } from "bun:test";
import {
  ResponseCompressor,
  createCompressor,
  compress,
  compressSync,
  negotiate,
  parseAcceptEncoding,
  compressResponse,
  compressionMiddleware,
  handleNode,
} from "../src/index";

describe("public API surface", () => {
  test("exports the core classes and factories", () => {
    expect(typeof ResponseCompressor).toBe("function");
    expect(typeof createCompressor).toBe("function");
  });

  test("exports compression primitives", () => {
    expect(typeof compress).toBe("function");
    expect(typeof compressSync).toBe("function");
  });

  test("exports negotiation helpers", () => {
    expect(typeof negotiate).toBe("function");
    expect(typeof parseAcceptEncoding).toBe("function");
  });

  test("exports middleware adapters", () => {
    expect(typeof compressResponse).toBe("function");
    expect(typeof compressionMiddleware).toBe("function");
    expect(typeof handleNode).toBe("function");
  });

  test("factory produces a working compressor end-to-end", () => {
    const compressor = createCompressor({ threshold: 0 });
    const big = JSON.stringify({ data: "x".repeat(2000) });
    const result = compressor.compress(big, {
      acceptEncoding: "gzip",
      contentType: "application/json",
    });
    expect(result.decision.compressed).toBe(true);
    expect(result.headers["Content-Encoding"]).toBe("gzip");
    expect(result.body.length).toBeLessThan(Buffer.byteLength(big));
  });
});
