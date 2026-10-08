import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config.mjs";

/** The map counts days in Washington, whatever the reader's own zone: its tests run again a day ahead and a day behind. */
const zone = (name: string, tz: string) => ({ extends: true as const, test: { name, env: { IVP_TEST_ZONE: tz }, setupFiles: ["./tests/far-zone.setup.ts"] } });

export default mergeConfig(base, defineConfig({ test: { projects: [zone("tokyo", "Asia/Tokyo"), zone("honolulu", "Pacific/Honolulu")] } }));
