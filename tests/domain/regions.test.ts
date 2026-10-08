// @vitest-environment node
import { COUNTRY_NAME_OVERRIDES, OIA_REGIONS, REGION_NAMES, regionForCountry, shortRegionName } from "@/lib/domain/regions";

const c = (cca2: string, region: string, subregion: string) => ({ cca2, region, subregion });

describe("regions", () => {
  it("maps UN regions and subregions onto OIA's seven regions", () => {
    expect(regionForCountry(c("CI", "Africa", "Western Africa"))).toBe("af");
    expect(regionForCountry(c("ZA", "Africa", "Southern Africa"))).toBe("af");
    expect(regionForCountry(c("EG", "Africa", "Northern Africa"))).toBe("nea");
    expect(regionForCountry(c("SA", "Asia", "Western Asia"))).toBe("nea");
    expect(regionForCountry(c("TR", "Asia", "Western Asia"))).toBe("eur");
    expect(regionForCountry(c("GE", "Asia", "Western Asia"))).toBe("eur");
    expect(regionForCountry(c("IN", "Asia", "Southern Asia"))).toBe("sca");
    expect(regionForCountry(c("KZ", "Asia", "Central Asia"))).toBe("sca");
    expect(regionForCountry(c("JP", "Asia", "Eastern Asia"))).toBe("eap");
    expect(regionForCountry(c("ID", "Asia", "South-Eastern Asia"))).toBe("eap");
    expect(regionForCountry(c("AU", "Oceania", "Australia and New Zealand"))).toBe("eap");
    expect(regionForCountry(c("FJ", "Oceania", "Melanesia"))).toBe("eap");
    expect(regionForCountry(c("BR", "Americas", "South America"))).toBe("wha");
    expect(regionForCountry(c("CA", "Americas", "North America"))).toBe("wha");
    expect(regionForCountry(c("DE", "Europe", "Western Europe"))).toBe("eur");
    expect(regionForCountry(c("AQ", "Antarctic", ""))).toBe("io");
  });

  it("defines seven distinct regions with names", () => {
    expect(OIA_REGIONS).toHaveLength(7);
    expect(new Set(OIA_REGIONS.map((r) => r.id)).size).toBe(7);
    expect(REGION_NAMES.nea).toBe("Middle East & North Africa");
  });

  it("overrides names OIA writes differently", () => {
    expect(COUNTRY_NAME_OVERRIDES.CI).toBe("Côte d'Ivoire");
    expect(COUNTRY_NAME_OVERRIDES.TR).toBe("Türkiye");
  });
});

describe("shortRegionName", () => {
  it("shortens the long region names for tight spaces, by the name the data carries", () => {
    expect(shortRegionName("Middle East & North Africa")).toBe("MENA");
    expect(shortRegionName("Multilateral & International Organizations")).toBe("Multilateral");
    expect(shortRegionName("Africa")).toBe("Africa");
  });

  it("leaves a name it does not know exactly as it came", () => {
    expect(shortRegionName("Unassigned")).toBe("Unassigned");
  });
});
