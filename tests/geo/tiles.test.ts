// @vitest-environment node
import { closeSync, openSync, readFileSync, readSync } from "node:fs";
import { createRequire } from "node:module";
import { join, posix } from "node:path";
import { BASEMAP_MAX_ZOOM, BASEMAP_PATH, basemapTiles, basemapUrl, MAP_WORKER_PATH, prepareMapLibre } from "@/lib/geo/tiles";
import { supportsWebGL2 } from "@/lib/geo/webgl";

describe("the basemap file", () => {
  it("is served from our own origin unless the host names another", () => {
    expect(basemapUrl("https://ivp.example.gov", undefined)).toBe("https://ivp.example.gov/map/world.pmtiles");
    expect(basemapUrl("https://ivp.example.gov", "")).toBe("https://ivp.example.gov/map/world.pmtiles");
    expect(basemapUrl("https://ivp.example.gov", "https://tiles.fcc.gov/world.pmtiles")).toBe("https://tiles.fcc.gov/world.pmtiles");
    expect(basemapUrl("https://ivp.example.gov", "/tiles/world.pmtiles")).toBe("https://ivp.example.gov/tiles/world.pmtiles");
  });

  it("is read tile by tile through the pmtiles protocol", () => {
    expect(basemapTiles("https://ivp.example.gov/map/world.pmtiles")).toBe("pmtiles://https://ivp.example.gov/map/world.pmtiles/{z}/{x}/{y}");
  });

  it("is a PMTiles v3 archive holding zooms 0 to 5", () => {
    const header = Buffer.alloc(127);
    const fd = openSync(join(process.cwd(), "public", BASEMAP_PATH), "r");
    readSync(fd, header, 0, 127, 0);
    closeSync(fd);
    expect(header.subarray(0, 7).toString("latin1")).toBe("PMTiles");
    expect(header[7]).toBe(3);
    expect([header[100], header[101]]).toEqual([0, BASEMAP_MAX_ZOOM]);
  });

  it("readies MapLibre once, however many maps ask: its worker from our own origin, and the pmtiles protocol", () => {
    const maplibre = { setWorkerUrl: vi.fn(), addProtocol: vi.fn() };
    prepareMapLibre(maplibre);
    prepareMapLibre(maplibre);
    expect(maplibre.setWorkerUrl).toHaveBeenCalledExactlyOnceWith("/map/maplibre/maplibre-gl-worker.mjs");
    expect(maplibre.addProtocol).toHaveBeenCalledExactlyOnceWith("pmtiles", expect.any(Function));
  });
});

describe("MapLibre's worker", () => {
  it("is served from our own origin with the chunk it imports, byte for byte as the installed package ships them", () => {
    const installed = (file: string) => readFileSync(createRequire(import.meta.url).resolve(`maplibre-gl/dist/${file}`));
    const served = (file: string) => readFileSync(join(process.cwd(), "public", posix.dirname(MAP_WORKER_PATH), file));
    for (const file of [posix.basename(MAP_WORKER_PATH), "maplibre-gl-shared.mjs"]) {
      expect(served(file).equals(installed(file)), `public/map/maplibre/${file} is not the installed maplibre-gl's: copy it again (see the README, Map data)`).toBe(true);
    }
  });
});

describe("WebGL 2", () => {
  const docWith = (getContext: (kind: string) => unknown) => ({ createElement: () => ({ getContext }) }) as unknown as Pick<Document, "createElement">;

  it("is what the map needs: a WebGL 1 context is not enough", () => {
    expect(supportsWebGL2(docWith((kind) => (kind === "webgl2" ? {} : null)))).toBe(true);
    expect(supportsWebGL2(docWith((kind) => (kind === "webgl" ? {} : null)))).toBe(false);
  });

  it("releases the probe's context at once, since browsers cap how many may live", () => {
    const loseContext = vi.fn();
    const gl = { getExtension: (name: string) => (name === "WEBGL_lose_context" ? { loseContext } : null) };
    expect(supportsWebGL2(docWith((kind) => (kind === "webgl2" ? gl : null)))).toBe(true);
    expect(loseContext).toHaveBeenCalledOnce();
  });

  it("is reported missing when the browser refuses outright", () => {
    expect(
      supportsWebGL2(
        docWith(() => {
          throw new Error("blocked by policy");
        }),
      ),
    ).toBe(false);
  });
});
