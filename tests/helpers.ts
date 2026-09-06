import { compressSync } from "../src/compress";
import type { Encoding } from "../src/negotiation";

/** Compress `data` with `encoding` using the sync primitive (test helper). */
export function compressWith(data: string, encoding: Encoding): Buffer {
  return compressSync(data, encoding);
}
