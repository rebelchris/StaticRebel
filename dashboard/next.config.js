const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  runtimeCaching: [
    {
      urlPattern: /^https?.*/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'offlineCache',
        expiration: {
          maxEntries: 200,
        },
      },
    },
  ],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow importing from parent directory (lib folder)
  transpilePackages: [],

  // Set environment variable for Next.js detection
  env: {
    RUNNING_IN_NEXTJS: 'true',
  },

  // Experimental features for better performance
  experimental: {
    // Enable server actions for form handling
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },

  // Add empty turbopack config to suppress the error for now
  turbopack: {},
  
  // Custom webpack config to handle external modules
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Handle native modules for server-side
      config.externals.push({
        'better-sqlite3': 'commonjs better-sqlite3',
      });
    }
    return config;
  },
};

module.exports = withPWA(nextConfig);
