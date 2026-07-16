import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    // Every path a Route Handler reads via fs.readFileSync at request time
    // must be listed here, or Vercel's serverless bundle excludes it (only
    // files Next's build-time tracing can prove are needed get bundled) -
    // the file exists fine in the git repo and deploys, fs just can't see
    // it at runtime, silently falling back to an empty response with no
    // error surfaced anywhere. This is what happened to /earnings:
    // public/data/earnings/ was never added here when that route was built.
    '/*': [
      './data/history/**/*',
      './public/data/history/**/*',
      './public/data/earnings/**/*',
    ],
  },
};

export default nextConfig;
