import { createWorker } from "mediasoup";
import type { Worker, WorkerSettings } from "mediasoup/types";

export type MediasoupWorkerFactory = (settings: WorkerSettings) => Promise<Worker>;

export const createMediasoupWorker: MediasoupWorkerFactory = (settings) => createWorker(settings);
