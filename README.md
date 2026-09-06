# api-response-compressor

[![CI](https://github.com/Retsumdk/api-response-compressor/workflows/CI/badge.svg)](https://github.com/Retsumdk/api-response-compressor/actions)
[![TypeScript](https://img.shields.io/badge/typescript-3178C6-blue.svg)](https://www.typescriptlang.org/)
[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](package.json)

**Zero-dependency gzip / brotli / deflate compression for HTTP API responses with correct RFC 9110 content negotiation.**

Most "compression middleware" blindly gzip everything. This library does it right: it negotiates with the client's `Accept-Encoding`, picks the best encoding (brotli > gzip > deflate), skips tiny payloads where compression hurts, and never touches already-compressed content types.

## Problem

Serving uncompressed JSON wastes bandwidth and latency on every API call. But naive compression is worse than none:

- **Wrong encoding.** A client that advertises `br` gets gzip, or vice-versa — a missed ~10% improvement.
- **Compressing the incompressible.** Gzipping PNGs, videos, or already-gzipped responses wastes CPU for zero gain.
- **Compressing tiny payloads.** A 200-byte JSON body compresses to ~150 bytes — the overhead isn't worth the round-trip.
- **Broken caching.** Responses served without `Vary: Accept-Encoding` get cached wrong when the same URL is requested with different encodings.

## Solution

`api-response-compressor` centralizes the compression decision in a small, testable core and ships adapters for the server shapes you already use:

- **Correct negotiation** — honours `q` weights and `*` wildcards per RFC 9110 §12.5.3.
- **Best-encoding selection** — brotli when accepted, then gzip, then deflate.
- **Size threshold** — configurable minimum (default 1024 bytes) before compression is applied.
- **Content-type filtering** — only text/JSON/XML-family types are compressed; media and already-compressed types pass through untouched.
- **`Vary: Accept-Encoding`** — always set, so caches stay correct.
- **Zero dependencies** — built on Node's built-in `zlib`. No install bloat.

## How it works

The pipeline is three stages:

```
                 ┌─────────────┐   ┌──────────────┐   ┌──────────────┐
Accept-Encoding │  negotiate() │ → │   decide()   │ → │  compress()  │
───────────────►│  best match  │   │ threshold +  │   │ zlib (br/gz) │
                 └─────────────┘   │ content-type │   └──────────────┘
                                   └──────────────┘
```

1. **`negotiate(acceptEncoding)`** — parse the header, expand `*`, and pick the highest-`q` encoding the server supports.
2. **`decide(encoding, contentType, contentLength)`** — reject the compression if the client wants none, the body is below the threshold, or the content type is not compressible.
3. **`compress(body, encoding)`** — run the body through `zlib` (sync or async) and return the compressed bytes plus the headers to set.

## Getting started

```bash
bun add api-response-compressor
# or
npm install api-response-compressor
```

### Hono / fetch / Bun.serve

```ts
import { Hono } from "hono";
import { createCompressor, compressResponse } from "api-response-compressor";

const compressor = createCompressor();
const app = new Hono();

app.get("/data", async (c) => {
  const response = c.json({ items: [1, 2, 3] });
  return compressResponse(response, c.req, compressor);
});
```

### Express

```ts
import express from "express";
import { createCompressor, compressionMiddleware } from "api-response-compressor";

const app = express();
app.use(compressionMiddleware(createCompressor()));
app.get("/data", (_req, res) => res.json({ hello: "world" }));
```

### Raw node:http

```ts
import http from "node:http";
import { createCompressor, handleNode } from "api-response-compressor";

const compressor = createCompressor();
http
  .createServer((req, res) => {
    handleNode(req, res, compressor, () => JSON.stringify({ hello: "world" }));
  })
  .listen(3000);
```

### CLI

```bash
# Compress a file and report the ratio
bun run src/cli.ts --file ./payload.json --encoding br

# Benchmark every encoding against a sample body
bun run src/cli.ts --benchmark
```

## Configuration

```ts
createCompressor({
  threshold: 2048,          // don't compress bodies under 2 KB
  encodings: ["br", "gzip"], // only offer these, in this order
  level: 9,               // zlib level for gzip/deflate (0-9)
  brotliQuality: 5,       // brotli quality (0-11)
  compressibleTypes: ["application/json", /^text\/.+$/], // override default set
  vary: true,             // set Vary: Accept-Encoding (default true)
});
```

## API reference

- `createCompressor(options?)` → `ResponseCompressor` — factory.
- `compressor.negotiate(acceptEncoding)` → `Encoding | "identity"` — pick the best encoding.
- `compressor.isCompressibleType(contentType)` → `boolean` — content-type filter.
- `compressor.decide(encoding, contentType, contentLength)` → `CompressionDecision` — threshold + type decision.
- `compressor.compress(body, { acceptEncoding, contentType, contentLength })` → `CompressResult` — one-shot compress with headers.
- `compressResponse(response, request, compressor)` → `Promise<Response>` — fetch/Hono adapter.
- `compressionMiddleware(compressor)` — Express-style middleware.
- `handleNode(req, res, compressor, sendBody)` — raw `node:http` helper.
- `compressSync(data, encoding, options?)` / `compress(data, encoding, options?)` — low-level primitives.

## License

MIT © [Retsumdk](https://github.com/Retsumdk)
