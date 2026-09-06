import{describe,it,expect}from"vitest";
import{collectionItemId,normalizeUsername}from"../src/bgg-api";

describe("BGG sync API helpers",()=>{
  it("keeps the BGG collection id stable so API sync reconciles CSV imports",()=>expect(collectionItemId("user-1",{id:432,collId:"8139458"})).toBe("user-1:8139458"));
  it("falls back to the BGG id when a collection id is unavailable",()=>expect(collectionItemId("user-1",{id:432,collId:""})).toBe("user-1:432"));
  it("accepts normal BGG usernames and rejects control or markup characters",()=>{expect(normalizeUsername(" killjoy00 ")).toBe("killjoy00");expect(normalizeUsername("bad<name")).toBeNull();expect(normalizeUsername("bad\nname")).toBeNull()});
});
