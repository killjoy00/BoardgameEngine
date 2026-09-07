import { describe, it, expect } from "vitest";
import { rebootPage } from "../src/reboot-ui";
import { PICKER_MAX_MINUTES, PICKER_MIN_MINUTES } from "../src/domain";

describe("picker-first application home", () => {
  it("emits browser JavaScript that compiles", () => {
    const html = rebootPage({ email: "owner@example.com", role: "admin" }),
      script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";
    expect(script.length).toBeGreaterThan(100);
    expect(() => new Function(script)).not.toThrow();
  });
  it("escapes signed-in account text and keeps BGG attribution visible", () => {
    const html = rebootPage({ email: "<img src=x onerror=alert(1)>", role: "member" });
    expect(html).not.toContain("<strong><img");
    expect(html).toContain("Powered by BoardGameGeek");
    expect(html).toContain("https://boardgamegeek.com/");
  });
  it("makes Tonight primary while retaining the library tools", () => {
    const html = rebootPage({ email: "owner@example.com", role: "member" });
    expect(html).toContain('class="active" href="/app">Tonight');
    expect(html).toContain('href="/app/library">Library');
  });
  it("offers seven-player and 8+ tables", () => {
    const html = rebootPage({ email: "owner@example.com", role: "member" });
    expect(html).toContain('data-players="7">7</button>');
    expect(html).toContain('data-players="8" data-band="8+">8+</button>');
  });
  it("offers an explicit competitive/cooperative table style filter", () => {
    const html = rebootPage({ email: "owner@example.com", role: "member" });
    expect(html).toContain('data-mode="competitive">Competitive</button>');
    expect(html).toContain('data-mode="cooperative">Cooperative</button>');
  });
  it("builds the time slider from the shared picker range", () => {
    const html = rebootPage({ email: "owner@example.com", role: "member" });
    expect(html).toContain(`min="${PICKER_MIN_MINUTES}" max="${PICKER_MAX_MINUTES}"`);
  });
  it("links the recommendation lab for admins only", () => {
    expect(rebootPage({ email: "owner@example.com", role: "admin" })).toContain('href="/app/lab"');
    expect(rebootPage({ email: "owner@example.com", role: "member" })).not.toContain(
      'href="/app/lab"'
    );
  });
  it("only promises background syncing now that the server actually continues it", () => {
    const html = rebootPage({ email: "owner@example.com", role: "member" });
    expect(html).toContain("syncing continues on the server");
    // The page must poll, or server-side progress would stay invisible to a tab
    // that is not itself driving the sync.
    expect(html).toContain("function watchRun()");
  });
});
