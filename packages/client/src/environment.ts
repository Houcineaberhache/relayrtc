import { MediaCaptureError } from "./errors.js";

export interface BrowserMediaEnvironment {
  readonly mediaDevices: MediaDevices;
  readonly permissions?: Permissions;
}

export const browserMediaEnvironment = (): BrowserMediaEnvironment => {
  const browserNavigator = Reflect.get(globalThis, "navigator") as Navigator | undefined;
  if (!browserNavigator?.mediaDevices) {
    throw new MediaCaptureError(
      "MEDIA_DEVICES_UNAVAILABLE",
      "Browser media devices are unavailable in this environment",
    );
  }
  const permissions = Reflect.get(browserNavigator, "permissions") as Permissions | undefined;
  return {
    mediaDevices: browserNavigator.mediaDevices,
    ...(permissions ? { permissions } : {}),
  };
};
