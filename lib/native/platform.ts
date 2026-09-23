import { Capacitor } from "@capacitor/core";

/** True only inside the Capacitor Android shell. Browsers and the PWA return false. */
export function isNativeApp() {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
}

/**
 * Lifecycle events re-dispatched on `window` by NativeShell. Browser builds never fire them,
 * so listeners are inert on the web.
 */
export const NATIVE_PAUSE_EVENT = "native:pause";
export const NATIVE_RESUME_EVENT = "native:resume";

export function permissionDeniedMessage(kind: "microphone" | "camera") {
  const subject = kind === "microphone" ? "Mikrofonga" : "Kamera yoki mikrofonga";
  if (!isNativeApp()) return `${subject} ruxsat berilmadi.`;
  return `${subject} ruxsat berilmadi. Sozlamalar → Ilovalar → Private → Ruxsatlar orqali yoqing.`;
}
