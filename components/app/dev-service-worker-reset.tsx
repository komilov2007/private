"use client";

import { useEffect } from "react";

/**
 * Development only: this app ships no service worker, but a worker left on the same
 * localhost origin (e.g. by another project) can serve stale JS and make realtime testing
 * misleading. Unregister it and clear its caches. Production is untouched.
 */
export default function DevServiceWorkerReset() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development" || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.getRegistrations().then(async (registrations) => {
      if (!registrations.length) return;
      await Promise.all(registrations.map((registration) => registration.unregister()));
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
      console.info(`[dev] unregistered ${registrations.length} stale service worker(s); reload once for fresh JS`);
    });
  }, []);
  return null;
}
