import { describe, expect, it } from "vitest";
import { appPage } from "../src/ui";

describe("application UI", () => {
  it("emits syntactically valid client JavaScript", () => {
    for (const section of ["library", "import", "trades", "missing-prices", "invitations", "account"]) {
      const html = appPage({ email: "admin@example.com", role: "admin" }, section);
      const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
      expect(script).toBeTruthy();
      expect(() => new Function(script!)).not.toThrow();
    }
  });

  it("escapes server-rendered account data", () => {
    const html = appPage({ email: "<script>alert(1)</script>@example.com", role: "member" });
    expect(html).not.toContain("<script>alert(1)</script>@example.com");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;@example.com");
  });

  it("provides named library controls and status regions", () => {
    const html = appPage({ email: "owner@example.com", role: "admin" }, "library");
    expect(html).toContain('aria-label="Search library"');
    expect(html).toContain('aria-label="Filter library"');
    expect(html).toContain('aria-label="Sort library"');
    expect(html).toContain('role="status"');
  });

  it("provides a reviewable trade ledger", () => {
    const html = appPage({ email: "owner@example.com", role: "admin" }, "trades");
    expect(html).toContain("Trade history");
    expect(html).toContain("Counterparty");
    expect(html).toContain("Relative weight");
  });
});
