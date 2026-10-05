import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Meet Asuka",
  description: "Your sweet travel & life planner",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Asuka"
  }
};

export const viewport: Viewport = {
  themeColor: "#f472b6",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false
};

// Inside the Android app the files are on the phone already, and a service
// worker only risks serving the previous version's cached code after an
// update. There it is removed (once, with a reload); on the web it is
// registered for offline use.
const SERVICE_WORKER_SCRIPT = `(function () {
  if (!("serviceWorker" in navigator)) return;
  var isApp = !!window.Capacitor || (location.hostname === "localhost" && !location.port);
  if (!isApp) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("/sw.js"); });
    return;
  }
  navigator.serviceWorker.getRegistrations().then(function (registrations) {
    if (!registrations.length) return;
    Promise.all(registrations.map(function (r) { return r.unregister(); }))
      .then(function () {
        return window.caches
          ? caches.keys().then(function (keys) { return Promise.all(keys.map(function (k) { return caches.delete(k); })); })
          : null;
      })
      .then(function () {
        try {
          if (sessionStorage.getItem("sw-removed")) return;
          sessionStorage.setItem("sw-removed", "1");
        } catch (e) {}
        location.reload();
      });
  });
})();`;

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="icon" type="image/svg+xml" href="/icons/icon.svg" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Asuka" />
        <script dangerouslySetInnerHTML={{ __html: SERVICE_WORKER_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-blush">{children}</body>
    </html>
  );
}
