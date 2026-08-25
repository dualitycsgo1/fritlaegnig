import type { QualityPreset } from "./types";
import { QUALITY_MODELS } from "./types";

export type ModelProgress = {
  key: string;
  current: number;
  total: number;
};

type RemoveFn = (
  image: Blob,
  configuration?: Record<string, unknown>,
) => Promise<Blob>;

type PreloadFn = (configuration?: Record<string, unknown>) => Promise<void>;

let removeFn: RemoveFn | null = null;
let preloadFn: PreloadFn | null = null;

async function loadLib() {
  if (removeFn && preloadFn) return;
  const mod = await import("@imgly/background-removal");
  removeFn = (mod.removeBackground ?? mod.default) as RemoveFn;
  preloadFn = mod.preload as PreloadFn;
  if (!removeFn) throw new Error("Background-removal biblioteket kunne ikke indlæses.");
}

function baseConfig(
  preset: QualityPreset,
  onProgress?: (p: ModelProgress) => void,
): Record<string, unknown> {
  return {
    model: QUALITY_MODELS[preset].id,
    // CPU is reliable across Chrome/Vercel. WebGPU often reports "no adapters"
    // and then yields an opaque image with no error.
    device: "cpu",
    proxyToWorker: true,
    output: { format: "image/png", quality: 1 },
    progress: (key: string, current: number, total: number) => {
      onProgress?.({ key, current, total });
    },
  };
}

export async function preloadModel(
  preset: QualityPreset,
  onProgress?: (p: ModelProgress) => void,
): Promise<void> {
  await loadLib();
  if (!preloadFn) return;
  await preloadFn(baseConfig(preset, onProgress));
}

async function blobHasTransparency(blob: Blob): Promise<boolean> {
  const bitmap = await createImageBitmap(blob);
  const w = Math.min(bitmap.width, 96);
  const h = Math.min(bitmap.height, 96);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    bitmap.close();
    return true;
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const px = ctx.getImageData(0, 0, w, h).data;
  let transparent = 0;
  for (let i = 3; i < px.length; i += 4) {
    if (px[i] < 240) transparent += 1;
  }
  return transparent > w * h * 0.02;
}

export async function removeBackgroundBlob(
  source: Blob,
  preset: QualityPreset,
  onProgress?: (p: ModelProgress) => void,
): Promise<Blob> {
  await loadLib();
  if (!removeFn) throw new Error("Fritlægning er ikke klar endnu.");

  const attempts: Array<Record<string, unknown>> = [
    { ...baseConfig(preset, onProgress), proxyToWorker: true, device: "cpu" },
    { ...baseConfig(preset, onProgress), proxyToWorker: false, device: "cpu" },
  ];

  let lastError: unknown;
  for (const config of attempts) {
    try {
      const blob = await removeFn(source, config);
      if (!(blob instanceof Blob) || blob.size < 32) {
        throw new Error("Modellen returnerede et tomt resultat.");
      }
      const hasAlpha = await blobHasTransparency(blob);
      if (!hasAlpha) {
        throw new Error("Baggrunden blev ikke fjernet — prøv Høj kvalitet.");
      }
      return blob;
    } catch (err) {
      lastError = err;
    }
  }

  const msg = lastError instanceof Error ? lastError.message : "Ukendt model-fejl";
  throw new Error(msg);
}
