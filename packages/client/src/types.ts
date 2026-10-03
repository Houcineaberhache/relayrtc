export type MediaSourceKind = "microphone" | "camera";

export type MediaInputKind = "audioinput" | "videoinput";

export type MediaPermissionState = PermissionState | "unsupported";

export interface MediaPermissionsSnapshot {
  readonly microphone: MediaPermissionState;
  readonly camera: MediaPermissionState;
}

export interface MediaPermissionRequest {
  readonly microphone?: boolean;
  readonly camera?: boolean;
}

export interface MediaInputDevice {
  readonly deviceId: string;
  readonly groupId: string;
  readonly kind: MediaInputKind;
  readonly label: string;
}

export interface MediaDeviceSnapshot {
  readonly microphones: readonly MediaInputDevice[];
  readonly cameras: readonly MediaInputDevice[];
}

export interface LocalMediaTrackSnapshot {
  readonly source: MediaSourceKind;
  readonly deviceId: string | null;
  readonly enabled: boolean;
  readonly track: MediaStreamTrack | null;
}

export type LocalMediaTrackListener = (snapshot: LocalMediaTrackSnapshot) => void;

export type MediaDeviceListener = (snapshot: MediaDeviceSnapshot) => void;
