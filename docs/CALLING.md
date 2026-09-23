# WebRTC calling operations

Calls use Supabase only for authenticated call state and ephemeral signaling. Audio and video travel directly over WebRTC.

## ICE configuration

Set `NEXT_PUBLIC_WEBRTC_STUN_URLS` to a comma-separated list of STUN URLs. When it is absent, the app uses `stun:stun.l.google.com:19302`.

TURN is not configured. Reliable production calls across restrictive mobile and corporate NATs require a TURN provider. Do not put long-lived TURN credentials in a `NEXT_PUBLIC_` variable. Add a server endpoint that obtains short-lived credentials from the provider, then pass those credentials to the client ICE configuration.

## Browser and PWA limits

The global incoming overlay works while an authenticated app page is open. A closed browser or suspended PWA cannot receive a native-style incoming call without Web Push, a service worker, stored push subscriptions, and server-side push delivery. This project intentionally does not claim that capability and does not request notification permission on page load.

Camera switching depends on browser/device support. Speaker output selection is intentionally hidden because `setSinkId` is not consistently available on mobile browsers.
