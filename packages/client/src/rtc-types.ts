export type RtcDescription = Readonly<{
  type: "offer" | "answer";
  sdp: string;
}>;

export type RtcIceCandidate = Readonly<RTCIceCandidateInit>;

export type RtcConnectivityState =
  "new" | "connecting" | "connected" | "disconnected" | "failed" | "closed";

export interface RtcConnectionSnapshot {
  readonly state: RtcConnectivityState;
  readonly connectionState: RTCPeerConnectionState;
  readonly iceConnectionState: RTCIceConnectionState;
  readonly iceGatheringState: RTCIceGatheringState;
  readonly signalingState: RTCSignalingState;
}

export interface RemoteMediaTrack {
  readonly track: MediaStreamTrack;
  readonly streams: readonly MediaStream[];
  readonly transceiver: RTCRtpTransceiver;
}

export type RtcConnectionListener = (snapshot: RtcConnectionSnapshot) => void;

export type RtcIceCandidateListener = (candidate: RtcIceCandidate | null) => void;

export type RemoteMediaTrackListener = (track: RemoteMediaTrack) => void;

export interface RtcConnectionOptions {
  readonly configuration?: RTCConfiguration;
  readonly iceGatheringTimeoutMs?: number;
}
