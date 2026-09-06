/** @type {import('next').NextConfig} */

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@casino/shared'],

  // Do not replace resolve.alias — Next 15 keeps it as an array of
  // objects. Spreading that into a plain map breaks css-loader / PostCSS
  // and crashes the production build on globals.css.
  webpack: (config) => {
    config.cache = false;
    return config;
  },

  // Build-time memory savings: skip type-check + lint inside Next's
  // bundler. Both are already enforced by `tsc --noEmit` in CI / locally,
  // so re-running them here only costs RAM on the (low-memory) deploy
  // box and offers no extra safety.
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Production performance flags.
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  compress: false, // Cloudflare edge proxies handle compression; disabling here saves VPS CPU
  reactProductionProfiling: false,

  // Modular imports — drops Lucide / framer-motion bundle weight by
  // resolving each named import to its own module path so unused icons
  // never reach the client. Lucide ships ~1k icons; we use ~50.
  modularizeImports: {
    'lucide-react': {
      transform: 'lucide-react/dist/esm/icons/{{kebabCase member}}',
      preventFullImport: true,
    },
  },

  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'framer-motion',
      '@telegram-apps/sdk-react',
    ],
    // Low memory VPS optimizations
    cpus: 1,
    workerThreads: false,
    memoryBasedWorkersCount: false,
  },

  // Image optimization - unoptimized serves images directly without heavy CPU encoding on VPS
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },

  // Environment variables exposed to browser
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL,
    NEXT_PUBLIC_BOT_USERNAME: process.env.NEXT_PUBLIC_BOT_USERNAME,
  },

  // Headers for security + cache.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      // Hashed Next.js static assets are immutable — let the WebView
      // keep them forever so cold starts after backgrounding don't
      // re-download chunks.
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      // Cache static media and assets (images, audio, fonts) for 7 days
      {
        source: '/:path*\\.(png|jpg|jpeg|gif|webp|svg|ico|mp3|wav|ogg|woff2)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=604800, stale-while-revalidate=86400',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
