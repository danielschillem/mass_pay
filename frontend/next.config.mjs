import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import("next").NextConfig} */
const nextConfig = {
  output: "standalone",
  typedRoutes: true,
  devIndicators: false,
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
