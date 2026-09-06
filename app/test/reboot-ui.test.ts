import{describe,it,expect}from"vitest";
import{rebootPage}from"../src/reboot-ui";

describe("picker-first application home",()=>{
  it("emits browser JavaScript that compiles",()=>{const html=rebootPage({email:"owner@example.com",role:"admin"}),script=/<script>([\s\S]*?)<\/script>/.exec(html)?.[1]??"";expect(script.length).toBeGreaterThan(100);expect(()=>new Function(script)).not.toThrow()});
  it("escapes signed-in account text and keeps BGG attribution visible",()=>{const html=rebootPage({email:'<img src=x onerror=alert(1)>',role:"member"});expect(html).not.toContain('<strong>Signed in as <img');expect(html).toContain('Powered by BoardGameGeek');expect(html).toContain('https://boardgamegeek.com/')});
  it("makes Tonight primary while retaining the library tools",()=>{const html=rebootPage({email:"owner@example.com",role:"member"});expect(html).toContain('class="active" href="/app">Tonight');expect(html).toContain('href="/app/library">Library tools')});
});
