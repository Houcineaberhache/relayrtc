import type { JsonValue } from "@relayrtc/types";
import { RoomError } from "./room-errors.js";

export const signalingFrameLimit = 65_536;

export function snapshotRoomJson<Value extends JsonValue>(value: Value): Value {
  const ancestors = new Set<object>();
  let nodes = 0;
  const invalid = (): never => {
    throw new RoomError(
      "INVALID_PAYLOAD",
      "Use finite JSON values without cycles, unsupported objects, or more than 64 levels of nesting",
    );
  };
  const visit = (input: unknown, depth: number): void => {
    if (++nodes > signalingFrameLimit || depth > 64) invalid();
    if (input === null || typeof input === "string" || typeof input === "boolean") return;
    if (typeof input === "number") {
      if (!Number.isFinite(input)) invalid();
      return;
    }
    if (typeof input !== "object") return invalid();
    if (ancestors.has(input)) invalid();
    const array = Array.isArray(input);
    const prototype: unknown = Object.getPrototypeOf(input);
    if (!array && prototype !== Object.prototype && prototype !== null) invalid();
    if (Object.getOwnPropertySymbols(input).length > 0) invalid();
    ancestors.add(input);
    const descriptors = Object.getOwnPropertyDescriptors(input);
    if (array) {
      for (let index = 0; index < input.length; index++) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !("value" in descriptor)) return invalid();
        visit(descriptor.value, depth + 1);
      }
    } else {
      for (const descriptor of Object.values(descriptors)) {
        if (!("value" in descriptor) || !descriptor.enumerable) invalid();
        visit(descriptor.value, depth + 1);
      }
    }
    ancestors.delete(input);
  };
  try {
    visit(value, 0);
    const encoded = JSON.stringify(value);
    if (new TextEncoder().encode(encoded).byteLength > signalingFrameLimit)
      throw new RoomError(
        "PAYLOAD_TOO_LARGE",
        "Signaling messages must fit within 65536 UTF-8 bytes including their envelope",
      );
    return JSON.parse(encoded) as Value;
  } catch (error) {
    if (error instanceof RoomError) throw error;
    return invalid();
  }
}
