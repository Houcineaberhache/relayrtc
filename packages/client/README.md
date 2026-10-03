# @relayrtc/client

## Usage Media

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

## Audio and video connectivity

```ts
import { MediaConnection } from "@relayrtc/client";

const connection = new MediaConnection({
  configuration: {
    iceServers: [{ urls: "stun:stun.example.com:3478" }],
  },
});

await connection.enableMicrophone();
await connection.enableCamera({ width: 1280, height: 720 });

connection.rtc.onRemoteTrack(({ track, streams }) => {
  const stream = streams[0] ?? new MediaStream([track]);
  remoteVideo.srcObject = stream;
});

const offer = await connection.rtc.createOffer();
sendOfferThroughSignaling(offer);
```



## ICE lifecycle

```ts
connection.rtc.onIceCandidate((candidate) => {
  sendCandidateThroughSignaling(candidate);
});

await connection.rtc.addIceCandidate(remoteCandidate);

connection.rtc.subscribe(({ state, iceConnectionState }) => {
  renderConnectionState(state, iceConnectionState);
});

const restartOffer = await connection.rtc.restartIce();
sendOfferThroughSignaling(restartOffer);
```
