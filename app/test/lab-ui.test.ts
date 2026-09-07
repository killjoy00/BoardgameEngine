import{describe,it,expect}from"vitest";
import{recommendationLabPage}from"../src/lab-ui";

describe("recommendation lab UI",()=>{
  it("emits browser JavaScript that compiles",()=>{const html=recommendationLabPage({email:"admin@example.com",role:"admin"}),script=/<script>([\s\S]*?)<\/script>/.exec(html)?.[1]??"";expect(script.length).toBeGreaterThan(100);expect(()=>new Function(script)).not.toThrow()});
  it("contains the scenario matrix, policy comparison, feedback, and telemetry surfaces",()=>{const html=recommendationLabPage({email:"admin@example.com",role:"admin"});expect(html).toContain("63 standard tables");expect(html).toContain("Compare policies");expect(html).toContain("Recent BGG sync telemetry");expect(html).toContain("/api/picker/feedback");expect(html).toContain("/api/bgg/telemetry")});
  it("escapes the signed-in email",()=>{const html=recommendationLabPage({email:"<script>x</script>@example.com",role:"admin"});expect(html).not.toContain("<strong><script>x</script>");expect(html).toContain("&lt;script&gt;x&lt;/script&gt;@example.com")});
});