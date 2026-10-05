import withPWAInit from "next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  // Registered from the page instead (see layout.tsx): only on the web, never
  // inside the Android app, where the cached old version would keep running.
  register: false,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "google-fonts",
        expiration: { maxEntries: 4, maxAgeSeconds: 365 * 24 * 60 * 60 }
      }
    },
    {
      urlPattern: /^https:\/\/api\.open-meteo\.com\/.*/i,
      handler: "NetworkFirst",
      options: {
        cacheName: "weather-api",
        expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 }
      }
    },
    {
      urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
      handler: "CacheFirst",
      options: {
        cacheName: "static-images",
        expiration: { maxEntries: 64, maxAgeSeconds: 30 * 24 * 60 * 60 }
      }
    },
    {
      urlPattern: /\.(?:js|css)$/i,
      handler: "StaleWhileRevalidate",
      options: { cacheName: "static-assets" }
    },
    {
      urlPattern: /\/_next\/.*/i,
      handler: "NetworkFirst",
      options: {
        cacheName: "next-data",
        expiration: { maxEntries: 64, maxAgeSeconds: 24 * 60 * 60 }
      }
    }
  ]
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  env: {
    // Shown in the app so it's clear which version is running.
    NEXT_PUBLIC_BUILD_ID: (process.env.GITHUB_SHA || "dev").slice(0, 7)
  },
  images: {
    unoptimized: true
  }
};

export default withPWA(nextConfig);
