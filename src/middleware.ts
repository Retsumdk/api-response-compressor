/**
 * Framework-agnostic middleware adapters.
 *
 * The core `ResponseCompressor` is transport-agnostic. These adapters wire it
 * into the most common server shapes:
 *   - `fetch` / `Hono`  -> `compressResponse(response, request, compressor)`
 *   - `Express`         -> `compressionMiddleware(compressor)`
 *   - raw `node:http`   -> `handleNode(req, res, compressor)`
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { createGzip, createBrotliCompress, createDeflate } from "node:zlib";
import { compressSync, isCompressedEncoding } from "./compress.js";
import { ResponseCompressor } from "./compressor.js";
import type { Encoding } from "./negotiation.js";

/** Compress a WHATWG `Response` (works with `fetch`, Hono, Bun.serve, etc.). */
export async function compressResponse(
  response: Response,
  request: { headers?: Headers | Record<string, string> | null } | null,
  compressor: ResponseCompressor,
): Promise<Response> {
  const acceptEncoding = request?.headers
    ? new Headers(request.headers as Record<string, string>).get("accept-encoding")
    : null;
  const contentType = response.headers.get("content-type");
  const contentLengthHeader = response.headers.get("content-length");
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : undefined;

  const encoding = compressor.negotiate(acceptEncoding);
  const decision = compressor.decide(encoding, contentType, contentLength);

  const headers = new Headers(response.headers);
  if (compressor.options.vary) headers.set("Vary", "Accept-Encoding");

  if (!decision.compressed) {
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  const body = Buffer.from(await response.arrayBuffer());
  const compressed = compressSync(body, decision.encoding, {
    level: compressor.options.level,
    brotliQuality: compressor.options.brotliQuality,
  });
  headers.set("Content-Encoding", decision.encoding);
  headers.set("Content-Length", String(compressed.length));
  headers.delete("Content-Range");

  return new Response(compressed, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** Express-style middleware. Pass the `Request`/`Response`/`NextFunction` types from Express if used. */
export function compressionMiddleware(
  compressor: ResponseCompressor,
): (req: any, res: any, next: () => void) => void {
  return (req, res, next) => {
    const acceptEncoding: string | undefined = req.headers["accept-encoding"];
    const encoding = compressor.negotiate(acceptEncoding);

    // Only intercept if the client actually wants a compression we can serve.
    if (!isCompressedEncoding(encoding)) {
      if (compressor.options.vary) res.setHeader("Vary", "Accept-Encoding");
      return next();
    }

    const originalWriteHead = res.writeHead.bind(res);
    const originalEnd = res.end.bind(res);

    res.writeHead = function (
      this: any,
      statusCode: number,
      ...rest: any[]
    ) {
      const headers = rest[0] && typeof rest[0] === "object" ? rest[0] : {};
      const contentType = headers["Content-Type"] ?? headers["content-type"] ?? this.getHeader("Content-Type");
      const contentLength = Number(headers["Content-Length"] ?? headers["content-length"] ?? this.getHeader("Content-Length"));
      const decision = compressor.decide(encoding, contentType, Number.isFinite(contentLength) ? contentLength : undefined);

      if (compressor.options.vary) this.setHeader("Vary", "Accept-Encoding");

      if (!decision.compressed) {
        return originalWriteHead.call(this, statusCode, ...rest);
      }

      this.setHeader("Content-Encoding", decision.encoding);
      this.removeHeader("Content-Length");

      // Stream the body through the appropriate transform.
      const stream =
        decision.encoding === "br"
          ? createBrotliCompress({ params: compressor.options.brotliQuality !== undefined ? { [1]: compressor.options.brotliQuality } : {} })
          : decision.encoding === "gzip"
            ? createGzip({ level: compressor.options.level })
            : createDeflate({ level: compressor.options.level });

      this._compressorStream = stream;
      stream.on("error", () => this.destroy());
      stream.pipe(this);
      this.write = (chunk: any) => {
        stream.write(chunk);
        return true;
      };
      this.end = (chunk: any) => {
        if (chunk) stream.write(chunk);
        stream.end();
        return this;
      };
      return this;
    } as any;

    res.on("finish", () => {
      res.writeHead = originalWriteHead;
      res.end = originalEnd;
    });

    next();
  };
}

/** Raw `node:http` handler. */
export async function handleNode(
  req: IncomingMessage,
  res: ServerResponse,
  compressor: ResponseCompressor,
  sendBody: () => Promise<Buffer | string>,
): Promise<void> {
  const acceptEncoding = req.headers["accept-encoding"];
  const encoding = compressor.negotiate(acceptEncoding);
  const contentType = res.getHeader("content-type") as string | undefined;
  const contentLengthHeader = res.getHeader("content-length");
  const contentLength = typeof contentLengthHeader === "number" ? contentLengthHeader : undefined;

  const decision = compressor.decide(encoding, contentType, contentLength);
  if (compressor.options.vary) res.setHeader("Vary", "Accept-Encoding");

  const body = Buffer.from(await sendBody());

  if (!decision.compressed) {
    res.setHeader("Content-Length", String(body.length));
    res.end(body);
    return;
  }

  const compressed = compressSync(body, decision.encoding, {
    level: compressor.options.level,
    brotliQuality: compressor.options.brotliQuality,
  });
  res.setHeader("Content-Encoding", decision.encoding);
  res.setHeader("Content-Length", String(compressed.length));
  res.end(compressed);
}

/** Re-exported for convenience. */
export type { Encoding };
