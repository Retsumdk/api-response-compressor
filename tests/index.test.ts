import { describe, test, expect } from "bun:test";
describe("api-response-compressor", () => {
  test("module loads", async () => { const m = await import("./index"); expect(m).toBeDefined(); });
});
