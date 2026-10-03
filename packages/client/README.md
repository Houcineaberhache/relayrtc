# @relayrtc/client


## Usage

```ts
import { MediaManager } from "@relayrtc/client";

const media = new MediaManager();

await media.permissions.request({ microphone: true, camera: true });

const devices = await media.devices.enumerate();
const microphoneTrack = await media.microphone.enable();
const cameraTrack = await media.camera.enable({ width: 1280, height: 720 });

await media.microphone.switchDevice(devices.microphones[0].deviceId);
await media.camera.switchDevice(devices.cameras[0].deviceId);

media.microphone.disable();
media.camera.disable();
```
