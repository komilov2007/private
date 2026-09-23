export function getIceServers(): RTCIceServer[] {
  const raw = process.env.NEXT_PUBLIC_WEBRTC_STUN_URLS?.trim();
  const urls = raw ? raw.split(",").map((value) => value.trim()).filter(Boolean) : ["stun:stun.l.google.com:19302"];
  return [{ urls }];
}
