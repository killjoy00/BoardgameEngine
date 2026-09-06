import{describe,it,expect}from"vitest";
import{validatePicker}from"../src/picker-api";

describe("live picker input",()=>{
  it("accepts a normal table and defaults trade inventory off",()=>{const result=validatePicker({players:4,minutes:90,minWeight:2,maxWeight:3.25});expect(result.ok).toBe(true);if(result.ok)expect(result.value).toEqual({players:4,minutes:90,minWeight:2,maxWeight:3.25,includeForTrade:false})});
  it("rejects impossible player counts",()=>expect(validatePicker({players:0,minutes:90,minWeight:0,maxWeight:5}).ok).toBe(false));
  it("rejects inverted weight ranges",()=>expect(validatePicker({players:4,minutes:90,minWeight:4,maxWeight:2}).ok).toBe(false));
  it("allows an explicit include-for-trade choice",()=>{const result=validatePicker({players:6,minutes:180,minWeight:0,maxWeight:5,includeForTrade:true});expect(result.ok).toBe(true);if(result.ok)expect(result.value.includeForTrade).toBe(true)});
});
