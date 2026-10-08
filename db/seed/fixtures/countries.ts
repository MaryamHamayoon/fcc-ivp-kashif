import type { RegionId } from "../../../lib/domain/regions";
import { COUNTRY_DATA } from "./countries.generated";

export type CountryFixture = {
  cca2: string;
  cca3: string;
  ccn3: string;
  name: string;
  regionId: RegionId;
  lat: number;
  lng: number;
};

/** Every country/territory a delegation could come from, already mapped to an OIA region. */
export const COUNTRIES: readonly CountryFixture[] = COUNTRY_DATA.map(([cca2, cca3, ccn3, name, regionId, lat, lng]) => ({
  cca2,
  cca3,
  ccn3,
  name,
  regionId,
  lat,
  lng,
}));

export const COUNTRY_BY_CODE: ReadonlyMap<string, CountryFixture> = new Map(COUNTRIES.map((c) => [c.cca2, c]));
