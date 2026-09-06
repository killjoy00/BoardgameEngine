import{describe,it,expect}from"vitest";
import{validatePicker}from"../src/picker-api";

describe("live picker input",()=>{
  it("accepts a normal table and defaults optional filters",()=>{
    const result=validatePicker({players:4,minutes:90,minWeight:2,maxWeight:3.25});
    expect(result.ok).toBe(true);
    if(result.ok)expect(result.value).toEqual({players:4,playerBand:"4",pollKey:"4",minutes:90,minWeight:2,maxWeight:3.25,includeForTrade:false,mode:"any"});
  });
  it("accepts the 8+ player band",()=>{
    const result=validatePicker({players:8,playerBand:"8+",minutes:120,minWeight:0,maxWeight:5});
    expect(result.ok).toBe(true);
    if(result.ok)expect(result.value.pollKey).toBe("8+");
  });
  it("rejects unsupported player bands",()=>expect(validatePicker({players:7,playerBand:"7+",minutes:90,minWeight:0,maxWeight:5}).ok).toBe(false));
  it("rejects impossible player counts",()=>expect(validatePicker({players:0,minutes:90,minWeight:0,maxWeight:5}).ok).toBe(false));
  it("rejects inverted weight ranges",()=>expect(validatePicker({players:4,minutes:90,minWeight:4,maxWeight:2}).ok).toBe(false));
  it("accepts cooperative mode and an explicit include-for-trade choice",()=>{
    const result=validatePicker({players:6,minutes:180,minWeight:0,maxWeight:5,includeForTrade:true,mode:"cooperative"});
    expect(result.ok).toBe(true);
    if(result.ok){expect(result.value.includeForTrade).toBe(true);expect(result.value.mode).toBe("cooperative")}
  });
  it("rejects unknown table styles",()=>expect(validatePicker({players:4,minutes:90,minWeight:0,maxWeight:5,mode:"chaotic"}).ok).toBe(false));
});
