import { describe, test, expect } from "bun:test";
import {
  parseAcceptEncoding,
  negotiate,
  type Encoding,
} from "../src/negotiation";

describe("parseAcceptEncoding", () => {
  test("parses simple list", () => {
    const m = parseAcceptEncoding("gzip, deflate, br");
    expect(m.get("gzip")).toBe(1);
    expect(m.get("deflate")).toBe(1);
    expect(m.get("br")).toBe(1);
  });

  test("parses q-values", () => {
    const m = parseAcceptEncoding("gzip;q=0.8, br;q=1.0, *;q=0");
    expect(m.get("gzip")).toBe(0.8);
    expect(m.get("br")).toBe(1);
    expect(m.get("*")).toBe(0);
  });

  test("clamps q-values to [0,1]", () => {
    const m = parseAcceptEncoding("gzip;q=2.0, deflate;q=-1");
    expect(m.get("gzip")).toBe(1);
    expect(m.get("deflate")).toBe(0);
  });

  test("handles null/empty", () => {
    expect(parseAcceptEncoding(null).size).toBe(0);
    expect(parseAcceptEncoding("").size).toBe(0);
  });
});

describe("negotiate", () => {
  test("picks best supported encoding", () => {
    expect(negotiate("gzip, br")).toBe("br");
    expect(negotiate("gzip")).toBe("gzip");
  });

  test("returns identity when no header", () => {
    expect(negotiate(undefined)).toBe("identity");
    expect(negotiate(null)).toBe("identity");
  });

  test("honours q=0 exclusions", () => {
    expect(negotiate("gzip;q=0, br;q=0")).toBe("identity");
  });

  test("wildcard * applies to unlisted encodings", () => {
    expect(negotiate("*", { supported: ["br", "gzip"] })).toBe("br");
  });

  test("respects supported preference order", () => {
    expect(negotiate("gzip, br", { supported: ["gzip", "br"] })).toBe("gzip");
  });

  test("identity always acceptable unless excluded", () => {
    expect(negotiate("br;q=0.5")).toBe("br");
    expect(negotiate("identity;q=0, br;q=0")).toBeNull();
  });
});
