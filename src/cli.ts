#!/usr/bin/env bun
/**
 * api-response-compressor CLI.
 *
 * Examples:
 *   bun run src/cli.ts --file big.json --encoding br
 *   bun run src/cli.ts --benchmark
 */

import { readFileSync } from "node:fs";
import { compressSync } from "./compress.js";
import { createCompressor } from "./compressor.js";
import type { Encoding } from "./negotiation.js";

function usage(): void {
  console.log(`api-response-compressor CLI

Usage:
  bun run src/cli.ts --file <path> [--encoding <br|gzip|deflate>]
  bun run src/cli.ts --benchmark

Options:
  --file <path>      File to compress and report on
  --encoding <enc>   Encoding to use (br, gzip, deflate; default gzip)
  --benchmark        Compress a sample body with every encoding and report ratios
  -h, --help         Show this help`);
}

function humanBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

function compressFile(file: string, encoding: Encoding): void {
  const input = readFileSync(file);
  const out = compressSync(input, encoding);
  const ratio = ((1 - out.length / input.length) * 100).toFixed(1);
  console.log(
    `${file}: ${humanBytes(input.length)} -> ${encoding}: ${humanBytes(out.length)} (${ratio}% smaller)`,
  );
}

function benchmark(): void {
  const sample = JSON.stringify(
    { hello: "world", items: Array.from({ length: 500 }, (_, i) => ({ id: i, name: `item-${i}`, tags: ["a", "b", "c"] })) },
  );
  const input = Buffer.from(sample, "utf8");
  const compressor = createCompressor();
  console.log(`Sample body: ${humanBytes(input.length)}`);
  for (const enc of ["br", "gzip", "deflate"] as Encoding[]) {
    const out = compressSync(input, enc);
    const ratio = ((1 - out.length / input.length) * 100).toFixed(1);
    console.log(`  ${enc.padEnd(8)} ${humanBytes(out.length).padEnd(10)} ${ratio}% smaller`);
  }
  const decision = compressor.decide("br", "application/json", input.length);
  console.log(`Decision for JSON body with br accepted: ${decision.compressed ? "compress" : "skip"} (${decision.encoding})`);
}

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes("-h") || argv.includes("--help")) {
    usage();
    return;
  }

  const fileIndex = argv.indexOf("--file");
  const file = fileIndex !== -1 ? argv[fileIndex + 1] : undefined;

  const encIndex = argv.indexOf("--encoding");
  const encoding = (encIndex !== -1 ? argv[encIndex + 1] : "gzip") as Encoding;

  if (argv.includes("--benchmark")) {
    benchmark();
    return;
  }

  if (!file) {
    usage();
    process.exit(1);
  }

  compressFile(file, encoding);
}

main();
