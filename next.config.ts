import type { NextConfig } from "next";
import { fileURLToPath } from "url";
import { dirname } from "path";

// Pin the workspace root: a stray lockfile in the user's home dir made Next
// infer the wrong root (affects output file tracing). Force this project dir.
const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: projectRoot,
};

export default nextConfig;
