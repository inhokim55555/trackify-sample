import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // This checkout is standalone; parent-folder lockfiles are unrelated projects.
  turbopack: { root: projectRoot },
  outputFileTracingRoot: projectRoot,
  // Sample thumbnails are local; remote image hosts are disabled.
  images: {
    remotePatterns: [],
  },
};

export default nextConfig;
