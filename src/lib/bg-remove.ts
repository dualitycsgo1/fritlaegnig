import type { QualityPreset } from "./types";
import { QUALITY_MODELS } from "./types";

export type ModelProgress = {
  key: string;
  current: number;
  total: number;
};

type RemoveFn = (
  image: Blob,
  configuration?: {
    model?: "isnet" | "isnet_fp16" | "isnet_quint8";
    device?: "cpu" | "gpu";
    proxyToWorker?: boolean;
    progress?: (key: string, current: number, total: number) => void;
    output?: { format?: "image/png"; quality?: number };
  },
) => Promise<Blob>;

type PreloadFn = (configuration?: object) => Promise<void>;

let removeFn: RemoveFn | null = null;
let preloadFn: PreloadFn | null = null;
let loadedModel: string | null = null;

function preferDevice(): "cpu" | "gpu" {
  try {
    if (typeof navigator !== "undefined" && "gpu" in navigator) return "gpu";
  } catch {
    /* ignore */
  }
  return "cpu";
}

async function loadLib() {
  if (removeFn && preloadFn) return;
  const mod = await import("@imgly/background-removal");
  removeFn = mod.removeBackground as RemoveFn;
  preloadFn = mod.preload as PreloadFn;
}

export async function preloadModel(
  preset: QualityPreset,
  onProgress?: (p: ModelProgress) => void,
): Promise<void> {
  await loadLib();
  const model = QUALITY_MODELS[preset].id;
  if (loadedModel === model) return;
  await preloadFn!({
    model,
    device: preferDevice(),
    proxyToWorker: true,
    progress: (key: string, current: number, total: number) => {
      onProgress?.({ key, current, total });
    },
  });
  loadedModel = model;
}

export async function removeBackgroundBlob(
  source: Blob,
  preset: QualityPreset,
  onProgress?: (p: ModelProgress) => void,
): Promise<Blob> {
  await loadLib();
  const model = QUALITY_MODELS[preset].id;
  const blob = await removeFn!(source, {
    model,
    device: preferDevice(),
    proxyToWorker: true,
    output: { format: "image/png", quality: 1 },
    progress: (key, current, total) => {
      onProgress?.({ key, current, total });
    },
  });
  loadedModel = model;
  return blob;
}
