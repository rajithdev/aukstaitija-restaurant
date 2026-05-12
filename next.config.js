// Stable build id — derived from env if available, else from build time.
// Exposed to the client via NEXT_PUBLIC_APP_VERSION so it can be read in the
// browser without an extra API hit. The /api/version endpoint reads the same
// env so server and client agree on what "current build" means.
const BUILD_ID =
  process.env.NEXT_PUBLIC_APP_VERSION ||
  process.env.APP_VERSION ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.RENDER_GIT_COMMIT ||
  `build-${Date.now()}`;

const nextConfig = {
  output: 'standalone',
  images: {
    unoptimized: true,
  },
  // Stable build id baked into Next.js. Same value is exposed through
  // NEXT_PUBLIC_APP_VERSION below so the browser-side VersionGuard can
  // detect deployments without an extra round-trip.
  generateBuildId: async () => BUILD_ID,
  env: {
    NEXT_PUBLIC_APP_VERSION: BUILD_ID,
  },
  experimental: {
    serverComponentsExternalPackages: ['mongodb'],
  },
  webpack(config, { dev }) {
    if (dev) {
      config.watchOptions = {
        poll: 2000,
        aggregateTimeout: 300,
        ignored: ['**/node_modules'],
      };
    }
    return config;
  },
  onDemandEntries: {
    maxInactiveAge: 10000,
    pagesBufferLength: 2,
  },
  async headers() {
    // Aggressive no-store for customer-facing HTML so a stale phone never
    // serves a previous deployment's shell after the QR is scanned.
    const noStore = [
      { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0' },
      { key: 'Pragma', value: 'no-cache' },
      { key: 'Expires', value: '0' },
      { key: 'Surrogate-Control', value: 'no-store' },
      { key: 'X-App-Version', value: BUILD_ID },
    ];

    return [
      // Default CORS / framing headers for everything
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'ALLOWALL' },
          { key: 'Content-Security-Policy', value: 'frame-ancestors *;' },
          { key: 'Access-Control-Allow-Origin', value: process.env.CORS_ORIGINS || '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: '*' },
          { key: 'X-App-Version', value: BUILD_ID },
        ],
      },
      // Customer-facing dynamic HTML — never cache the shell. These are the
      // routes a QR-scanning phone lands on. Static asset chunks under
      // /_next/static still keep their hashed, immutable cache so we don't
      // sacrifice performance.
      { source: '/',                 headers: noStore },
      { source: '/menu',             headers: noStore },
      { source: '/menu/:path*',      headers: noStore },
      { source: '/table/:path*',     headers: noStore },
      { source: '/order/:path*',     headers: noStore },
      { source: '/track',            headers: noStore },
      { source: '/track/:path*',     headers: noStore },
      { source: '/reservation/:path*', headers: noStore },
      { source: '/cart',             headers: noStore },
      { source: '/checkout',         headers: noStore },
      // All API responses must never be cached either
      { source: '/api/:path*',       headers: noStore },
    ];
  },
};

module.exports = nextConfig;
