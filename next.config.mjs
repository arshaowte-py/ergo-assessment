/** @type {import('next').NextConfig} */
const nextConfig = {
  // Chromium ships as a real binary + brotli payloads. Leaving these external keeps
  // the serverless bundle small enough for Vercel and stops Next from trying to
  // trace/bundle the .br archives.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
