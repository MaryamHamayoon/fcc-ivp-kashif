// @vitest-environment node
import { config } from "@/proxy";

/** Next tests the whole pathname against each matcher pattern. */
const gated = (pathname: string) => config.matcher.some((pattern) => new RegExp(`^${pattern}$`).test(pathname));

describe("the request gate", () => {
  it("guards every page and API route", () => {
    for (const path of ["/", "/reach", "/meetings/IVP-26-0142", "/api/meetings", "/mapping"]) expect([path, gated(path)]).toEqual([path, true]);
  });

  it("lets through static files that carry nothing private: the brand marks and the basemap", () => {
    for (const path of ["/map/world.pmtiles", "/brand/fcc-seal.png", "/_next/static/chunks/main.js", "/favicon.ico"]) expect([path, gated(path)]).toEqual([path, false]);
  });
});
