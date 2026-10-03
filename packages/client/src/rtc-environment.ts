import { RtcConnectionError } from "./rtc-errors.js";

export type PeerConnectionFactory = (configuration?: RTCConfiguration) => RTCPeerConnection;

export const browserPeerConnectionFactory: PeerConnectionFactory = (configuration) => {
  const constructor = Reflect.get(globalThis, "RTCPeerConnection") as
    typeof RTCPeerConnection | undefined;
  if (!constructor) {
    throw new RtcConnectionError("RTC_UNAVAILABLE", "WebRTC is unavailable in this environment");
  }
  return new constructor(configuration);
};
