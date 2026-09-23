import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Android shell for the deployed Next.js app.
 *
 * The app is server-rendered (cookie-based Supabase SSR auth, proxy route guard), so it cannot
 * be statically exported. The native shell loads the production HTTPS origin instead; Capacitor
 * injects its bridge into that exact origin only, so plugins, permissions and cookies all work.
 * Override with CAP_SERVER_URL (e.g. a preview deployment) when running `npx cap sync`.
 */
const serverUrl = process.env.CAP_SERVER_URL ?? "https://private-tmi7.vercel.app";

const config: CapacitorConfig = {
  appId: "uz.komilov.privatechat",
  appName: "Private",
  webDir: "mobile/www",
  backgroundColor: "#fffaf8",
  server: {
    url: serverUrl,
    androidScheme: "https",
    cleartext: false,
    // Shown by the native shell when the origin cannot be reached (no network at launch).
    errorPath: "offline.html",
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      // Fallback only: the page hides the splash as soon as it mounts.
      launchAutoHide: true,
      launchShowDuration: 2500,
      backgroundColor: "#fffaf8",
      showSpinner: false,
    },
    SystemBars: {
      insetsHandling: "css",
      initialViewportFitValueHint: "cover",
    },
  },
};

export default config;
