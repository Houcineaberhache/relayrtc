import { describe, expect, it, vi } from "vitest";

import { RtcConnection } from "./rtc-connection.js";
import { TestPeerConnection } from "./rtc-test-fixtures.js";
import { mediaStream, mediaTrack } from "./test-fixtures.js";

describe("RtcConnection", () => {
  it("creates a gathered offer", async () => {
    const peer = new TestPeerConnection();
    const connection = new RtcConnection({}, () => peer.asPeerConnection());

    await expect(connection.createOffer()).resolves.toEqual({
      type: "offer",
      sdp: "offer-sdp",
    });
    expect(peer.createOffer).toHaveBeenCalledOnce();
    expect(peer.setLocalDescription).toHaveBeenCalledWith({
      type: "offer",
      sdp: "offer-sdp",
    });
  });

  it("accepts an offer and produces an answer", async () => {
    const peer = new TestPeerConnection();
    const connection = new RtcConnection({}, () => peer.asPeerConnection());

    await expect(connection.acceptOffer({ type: "offer", sdp: "remote-offer" })).resolves.toEqual({
      type: "answer",
      sdp: "answer-sdp",
    });
    expect(peer.setRemoteDescription).toHaveBeenCalledWith({
      type: "offer",
      sdp: "remote-offer",
    });
    expect(peer.createAnswer).toHaveBeenCalledOnce();
  });

  it("accepts the remote answer", async () => {
    const peer = new TestPeerConnection();
    const connection = new RtcConnection({}, () => peer.asPeerConnection());

    await connection.acceptAnswer({ type: "answer", sdp: "remote-answer" });

    expect(peer.setRemoteDescription).toHaveBeenCalledWith({
      type: "answer",
      sdp: "remote-answer",
    });
  });

  it("publishes remote tracks and connection state", () => {
    const peer = new TestPeerConnection();
    const connection = new RtcConnection({}, () => peer.asPeerConnection());
    const stateListener = vi.fn();
    const trackListener = vi.fn();
    connection.subscribe(stateListener);
    connection.onRemoteTrack(trackListener);
    peer.connectionState = "connected";
    peer.emit("connectionstatechange");
    const track = mediaTrack("video", "remote-camera");
    const stream = mediaStream(track);
    peer.emit("track", {
      track,
      streams: [stream],
      transceiver: {} as RTCRtpTransceiver,
    } as unknown as RTCTrackEvent);

    expect(stateListener).toHaveBeenCalledWith(
      expect.objectContaining({ connectionState: "connected", state: "connected" }),
    );
    expect(trackListener).toHaveBeenCalledWith({
      track,
      streams: [stream],
      transceiver: {},
    });
  });

  it("manages local senders and closes idempotently", async () => {
    const peer = new TestPeerConnection();
    const connection = new RtcConnection({}, () => peer.asPeerConnection());
    const track = mediaTrack("audio", "mic-1");
    const sender = connection.addTrack(track);

    await connection.replaceTrack(sender, null);
    connection.removeTrack(sender);
    connection.close();
    connection.close();

    expect(peer.addTrack).toHaveBeenCalledWith(track);
    expect(peer.sender.replaceTrack).toHaveBeenCalledWith(null);
    expect(peer.removeTrack).toHaveBeenCalledWith(sender);
    expect(peer.close).toHaveBeenCalledOnce();
    expect(() => connection.addTrack(track)).toThrow(
      expect.objectContaining({ code: "RTC_CONNECTION_CLOSED" }),
    );
  });

  it("rejects malformed session descriptions", async () => {
    const peer = new TestPeerConnection();
    const connection = new RtcConnection({}, () => peer.asPeerConnection());

    await expect(connection.acceptOffer({ type: "offer", sdp: "" })).rejects.toEqual(
      expect.objectContaining({ code: "RTC_INVALID_DESCRIPTION" }),
    );
  });

  it("emits serializable local candidates and end-of-candidates", () => {
    const peer = new TestPeerConnection();
    const connection = new RtcConnection({}, () => peer.asPeerConnection());
    const listener = vi.fn();
    connection.onIceCandidate(listener);
    const candidate = {
      candidate: "candidate:1 1 UDP 1 192.0.2.1 5000 typ host",
      sdpMid: "0",
      sdpMLineIndex: 0,
      usernameFragment: "local",
    };

    peer.emit("icecandidate", {
      candidate: { toJSON: () => candidate },
    } as unknown as RTCPeerConnectionIceEvent);
    peer.emit("icecandidate", {
      candidate: null,
    } as unknown as RTCPeerConnectionIceEvent);

    expect(listener).toHaveBeenNthCalledWith(1, candidate);
    expect(listener).toHaveBeenNthCalledWith(2, null);
  });

  it("queues remote candidates until a remote description exists", async () => {
    const peer = new TestPeerConnection();
    const connection = new RtcConnection({}, () => peer.asPeerConnection());
    const candidate = {
      candidate: "candidate:2 1 UDP 1 192.0.2.2 5001 typ host",
      sdpMid: "0",
      sdpMLineIndex: 0,
    };

    await connection.addIceCandidate(candidate);
    await connection.addIceCandidate(null);
    expect(peer.addIceCandidate).not.toHaveBeenCalled();

    await connection.acceptAnswer({ type: "answer", sdp: "remote-answer" });
    expect(peer.addIceCandidate).toHaveBeenNthCalledWith(1, candidate);
    expect(peer.addIceCandidate).toHaveBeenNthCalledWith(2, null);
  });

  it("applies remote candidates immediately after negotiation", async () => {
    const peer = new TestPeerConnection();
    const connection = new RtcConnection({}, () => peer.asPeerConnection());
    await connection.acceptAnswer({ type: "answer", sdp: "remote-answer" });
    const candidate = { candidate: "candidate:3" };

    await connection.addIceCandidate(candidate);

    expect(peer.addIceCandidate).toHaveBeenCalledWith(candidate);
  });

  it("creates an ICE restart offer", async () => {
    const peer = new TestPeerConnection();
    const connection = new RtcConnection({}, () => peer.asPeerConnection());

    await expect(connection.restartIce()).resolves.toEqual({
      type: "offer",
      sdp: "offer-sdp",
    });
    expect(peer.restartIce).toHaveBeenCalledOnce();
    expect(peer.createOffer).toHaveBeenCalledWith({ iceRestart: true });
  });

  it.each([
    ["checking", "connecting"],
    ["connected", "connected"],
    ["disconnected", "disconnected"],
    ["failed", "failed"],
  ] as const)("maps ICE state %s to %s", (iceState, expected) => {
    const peer = new TestPeerConnection();
    peer.iceConnectionState = iceState;
    const connection = new RtcConnection({}, () => peer.asPeerConnection());

    expect(connection.current.state).toBe(expected);
  });
});
