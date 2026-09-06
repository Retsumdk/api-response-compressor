/**
 * api-response-compressor — automatic gzip / brotli / deflate compression for
 * HTTP API responses with correct content negotiation. Zero dependencies.
 *
 * @module
 */

export {
  ResponseCompressor,
  createCompressor,
  type CompressorOptions,
  type CompressionDecision,
  type CompressResult,
} from "./compressor";

export {
  compress,
  compressSync,
  CONTENT_ENCODING,
  isCompressedEncoding,
  type CompressionOptions,
} from "./compress";

export {
  negotiate,
  parseAcceptEncoding,
  type Encoding,
  type NegotiationOptions,
} from "./negotiation";

export {
  compressResponse,
  compressionMiddleware,
  handleNode,
} from "./middleware";
