import {
  blobToCanvas,
  canvasToBlob,
  cropRect,
  cropTopFraction,
  downscaleMax,
  extForFormat,
  fileToCanvas,
  fillInteriorHoles,
  flattenOnWhite,
  mimeForFormat,
  padToSquare,
  refineEdges,
  resizeHighQuality,
  rotateCanvas,
  smartFit,
  trimToOpaque,
} from "./image-ops";
import { removeBackgroundBlob, type ModelProgress } from "./bg-remove";
import type { QueueItem, StudioSettings } from "./types";
import { slugifyName } from "./utils";

async function fitToCanvas(cutout: HTMLCanvasElement, settings: StudioSettings): Promise<HTMLCanvasElement> {
  if (settings.width > 0 && settings.height > 0) {
    return smartFit(cutout, settings.width, settings.height);
  }
  return trimToOpaque(cutout);
}

async function encodeCutout(
  cutout: HTMLCanvasElement,
  item: QueueItem,
  settings: StudioSettings,
  note: string,
): Promise<{ blob: Blob; filename: string; note: string }> {
  const format = settings.format;
  const mime = mimeForFormat(format);
  const encoded = format === "JPEG" ? flattenOnWhite(cutout) : cutout;
  const blob = await canvasToBlob(encoded, mime, 0.95);
  const stem = item.label.trim() || slugifyName(item.name) || "fritlagt";
  const filename = `${stem}${settings.suffix}${extForFormat(format)}`;
  return { blob, filename, note };
}

export async function processItem(
  item: QueueItem,
  settings: StudioSettings,
  onProgress?: (p: ModelProgress) => void,
): Promise<{ blob: Blob; filename: string; note: string }> {
  let canvas = await fileToCanvas(item.file);
  if (item.rotation) canvas = rotateCanvas(canvas, item.rotation);
  canvas = cropTopFraction(canvas, item.cropY);

  const maxSide = settings.model === "fast" ? 1280 : settings.model === "high" ? 3072 : 2048;
  canvas = await downscaleMax(canvas, maxSide);

  // Square pad so ISNet's internal stretch does not warp the person.
  const padded = padToSquare(canvas);
  const inputBlob = await canvasToBlob(padded.canvas, "image/png");
  const cutoutBlob = await removeBackgroundBlob(inputBlob, settings.model, onProgress);
  let cutout = await blobToCanvas(cutoutBlob);
  if (cutout.width !== padded.canvas.width || cutout.height !== padded.canvas.height) {
    cutout = await resizeHighQuality(cutout, padded.canvas.width, padded.canvas.height);
  }
  cutout = cropRect(cutout, padded.x, padded.y, padded.width, padded.height);
  const afterRemove = `${cutout.width}×${cutout.height}`;

  if (settings.postProcess) {
    cutout = fillInteriorHoles(cutout);
  }
  if (settings.alphaMatting) {
    cutout = refineEdges(cutout);
  }

  cutout = await fitToCanvas(cutout, settings);

  return encodeCutout(cutout, item, settings, `${afterRemove} → ${cutout.width}×${cutout.height}`);
}

/** Re-apply canvas fit on an existing cutout — no model, so it's instant. */
export async function refitItem(
  item: QueueItem,
  settings: StudioSettings,
): Promise<{ blob: Blob; filename: string; note: string } | null> {
  if (!item.resultBlob) return null;
  let cutout = await blobToCanvas(item.resultBlob);
  cutout = await fitToCanvas(cutout, settings);
  return encodeCutout(cutout, item, settings, `tilpasset ${cutout.width}×${cutout.height}`);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function zipResults(
  items: { filename: string; blob: Blob }[],
  zipName: string,
): Promise<void> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const folder = zip.folder("fritlagt") ?? zip;
  for (const item of items) {
    folder.file(item.filename, item.blob);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, zipName);
}

export function resultFilename(item: QueueItem, settings: StudioSettings): string {
  const stem = item.label.trim() || slugifyName(item.name) || "fritlagt";
  return `${stem}${settings.suffix}${extForFormat(settings.format)}`;
}
