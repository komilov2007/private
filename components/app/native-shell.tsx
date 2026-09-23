"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SystemBars, SystemBarsStyle } from "@capacitor/core";
import { App } from "@capacitor/app";
import { SplashScreen } from "@capacitor/splash-screen";
import { runTopBackHandler } from "@/lib/native/back-handler";
import { isNativeApp, NATIVE_PAUSE_EVENT, NATIVE_RESUME_EVENT } from "@/lib/native/platform";

/**
 * Android shell integration. Renders nothing and does nothing in browsers.
 *  - hides the splash once the page is interactive
 *  - keeps status/navigation bar icons readable for the current theme
 *  - Back: close top overlay → leave sub-route for Home → background the app on Home/Login
 *  - re-dispatches pause/resume as window events for recorders, calls and realtime
 */
export default function NativeShell() {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  useEffect(() => { pathnameRef.current = pathname; }, [pathname]);

  useEffect(() => {
    if (!isNativeApp()) return;
    const root = document.documentElement;
    root.classList.add("native-app");
    void SplashScreen.hide();

    const syncBars = () => {
      const style = root.dataset.theme === "dark" ? SystemBarsStyle.Dark : SystemBarsStyle.Light;
      void SystemBars.setStyle({ style }).catch(() => {});
    };
    syncBars();
    const observer = new MutationObserver(syncBars);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });

    const handles = [
      App.addListener("backButton", () => {
        if (runTopBackHandler()) return;
        const current = pathnameRef.current;
        if (current !== "/" && current !== "/login") router.replace("/");
        else void App.minimizeApp();
      }),
      App.addListener("pause", () => window.dispatchEvent(new Event(NATIVE_PAUSE_EVENT))),
      App.addListener("resume", () => window.dispatchEvent(new Event(NATIVE_RESUME_EVENT))),
    ];

    return () => {
      observer.disconnect();
      handles.forEach((handle) => void handle.then((listener) => listener.remove()));
    };
  }, [router]);

  return null;
}
