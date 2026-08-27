import { describe, expect, it } from "vitest";
import { mapCollectionCsv, parseCsv } from "../src/csv";

describe("CSV", () => {
  it("parses quoted commas", () => expect(parseCsv('a,b\n"x,y",z\n')[1]).toEqual(["x,y", "z"]));

  it("keeps blank cost unknown and flags quantity", () => {
    const row = mapCollectionCsv("objectid,objectname,quantity,pricepaid,privatecomment\n1,Test,2,,secret\n")[0];
    expect(row.priceMinor).toBeNull();
    expect(row.privateComment).toBe("secret");
    expect(row.warnings).toContain("Quantity above one requires selection");
  });

  it("treats an owned BGG row with blank quantity as one physical copy", () => {
    const row = mapCollectionCsv("objectid,objectname,quantity,pricepaid,own\n1,Owned game,,,1\n")[0];
    expect(row.own).toBe(true);
    expect(row.quantity).toBe(1);
    expect(row.priceMinor).toBeNull();
  });

  it("does not create a quantity for a non-owned row with blank quantity", () => {
    const row = mapCollectionCsv("objectid,objectname,quantity,pricepaid,own\n1,Wished game,,,0\n")[0];
    expect(row.own).toBe(false);
    expect(row.quantity).toBeNull();
  });
});
