import { describe, expect, it } from "vitest";
import { appPage } from "../src/ui";

describe("application UI", () => {
  it("emits syntactically valid client JavaScript", () => {
    const html = appPage({ email: "admin@example.com", role: "admin" }, "import");
    const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
    expect(script).toBeTruthy();
    expect(() => new Function(script!)).not.toThrow();
  });

  it("escapes server-rendered account data", () => {
    const html = appPage({ email: "<script>alert(1)</script>@example.com", role: "member" });
    expect(html).not.toContain("<script>alert(1)</script>@example.com");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;@example.com");
  });
});
