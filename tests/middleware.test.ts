import { describe, test, expect } from "bun:test";
import { gunzipSync, brotliDecompressSync } from "node:zlib";
import {
  createCompressor,
} from "../src/compressor";
import { compressResponse } from "../src/middleware";
import { compressWith } from "./helpers";

const BIG = { hello: "world", items: Array(100).fill("some repeating payload string") };

describe("compressResponse (fetch/Hono adapter)", () => {
  test("compresses a JSON Response with brotli", async () => {
    const c = createCompressor();
    const original = new Response(JSON.stringify(BIG), {
      headers: { "Content-Type": "application/json" },
    });
    const out = await compressResponse(
      original,
      { headers: { "accept-encoding": "br" } },
      c,
    );
    expect(out.headers.get("Content-Encoding")).toBe("br");
    const text = brotliDecompressSync(Buffer.from(await out.arrayBuffer())).toString();
    expect(JSON.parse(text)).toEqual(BIG);
  });

  test("compresses with gzip and preserves status/statusText", async () => {
    const c = createCompressor();
    const original = new Response(JSON.stringify(BIG), {
      status: 201,
      statusText: "Created",
      headers: { "Content-Type": "application/json" },
    });
    const out = await compressResponse(
      original,
      { headers: { accept: "*/*", "accept-encoding": "gzip" } },
      c,
    );
    expect(out.status).toBe(201);
    expect(out.headers.get("Content-Encoding")).toBe("gzip");
    const text = gunzipSync(Buffer.from(await out.arrayBuffer())).toString();
    expect(JSON.parse(text)).toEqual(BIG);
  });

  test("passes through when client sends no Accept-Encoding", async () => {
    const c = createCompressor();
    const original = new Response(JSON.stringify(BIG), {
      headers: { "Content-Type": "application/json" },
    });
    const out = await compressResponse(original, null, c);
    expect(out.headers.get("Content-Encoding")).toBeNull();
    expect(await out.text()).toBe(JSON.stringify(BIG));
  });

  test("passes through when request is null (no headers to read)", async () => {
    const c = createCompressor();
    const original = new Response("body", { headers: { "Content-Type": "text/plain" } });
    const out = await compressResponse(original, {}, c);
    expect(out.headers.get("Content-Encoding")).toBeNull();
    expect(await out.text()).toBe("body");
  });

  test("sets Vary: Accept-Encoding on compressed responses", async () => {
    const c = createCompressor();
    const original = new Response(JSON.stringify(BIG), {
      headers: { "Content-Type": "application/json" },
    });
    const out = await compressResponse(original, { headers: { "accept-encoding": "br" } }, c);
    expect(out.headers.get("Vary")).toBe("Accept-Encoding");
  });
});
