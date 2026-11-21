import type { NextConfig } from "next";

const config: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@good-standing/core", "@good-standing/extract"],
  serverExternalPackages: ["unpdf"],
  poweredByHeader: false,
};

export default config;
