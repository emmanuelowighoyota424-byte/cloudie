/** @type {import('next').NextConfig} */
const staticExport = process.env.STATIC_EXPORT === "1";

const nextConfig = {
  ...(staticExport ? { output: "export", trailingSlash: true } : {}),
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  // Static hosting (InfinityFree) cannot configure Next.js response headers.
  // Keep security headers enabled for normal Node/Vercel deployments.
  ...(!staticExport ? {
    async headers() {
      return [{
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      }];
    },
  } : {}),
};

export default nextConfig;
