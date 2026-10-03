import { describe, expect, it } from "vitest";
import { isEmailAllowed, parseAllowedEmails } from "./allowlist";

describe("parseAllowedEmails", () => {
  it("splits on commas and whitespace, lowercases and dedupes", () => {
    expect(parseAllowedEmails(" Me@X.com, you@y.com\nme@x.com ")).toEqual(["me@x.com", "you@y.com"]);
  });

  it("treats missing or blank as an empty list", () => {
    expect(parseAllowedEmails(undefined)).toEqual([]);
    expect(parseAllowedEmails("  ,  ")).toEqual([]);
  });
});

describe("isEmailAllowed", () => {
  it("allows everyone when the list is empty", () => {
    expect(isEmailAllowed("anyone@z.com", [])).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(isEmailAllowed(" ME@x.com", ["me@x.com"])).toBe(true);
    expect(isEmailAllowed("other@x.com", ["me@x.com"])).toBe(false);
  });
});
