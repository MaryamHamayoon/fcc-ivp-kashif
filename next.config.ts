import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: { position: "bottom-right" },
  // `next dev` writes no agent instruction files into the project root.
  agentRules: false,
  // PGlite, the PDF builders and the workbook builder are Node-only and ship their own
  // binaries or fonts; they stay out of the bundler and load from node_modules at runtime.
  serverExternalPackages: ["@electric-sql/pglite", "@react-pdf/renderer", "exceljs", "pdf-lib"],
  // The executive brief's PDF sets Public Sans and the seal from disk; trace them into the server output.
  outputFileTracingIncludes: { "/api/reports/brief": ["./lib/reports/fonts/**", "./public/brand/fcc-seal.png"] },
  experimental: {
    // Uploads are capped at 4 MB by the document rules; multipart framing needs a little headroom.
    serverActions: { bodySizeLimit: "5mb" },
  },
};

export default nextConfig;
