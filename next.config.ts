import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/*': ['./data/history/**/*'],
  },
};

export default nextConfig;
