import {
  blobToCanvas,
  canvasToBlob,
  cropTopFraction,
  downscaleMax,
  extForFormat,
  featherAlpha,
  fileToCanvas,
  fillInteriorHoles,
  flattenOnWhite,
  mimeForFormat,
  rotateCanvas,
  smartFit,
} from "./image-ops";
import { removeBackgroundBlob, type ModelProgress } from "./bg-remove";
import type { QueueItem, StudioSettings } from "./types";
import { slugifyName } from "./utils";

export async function processItem(
  item: QueueItem,
  settings: StudioSettings,
  onProgress?: (p: ModelProgress) => void,
): Promise<{ blob: Blob; filename: string; note: string }> {
  let canvas = await fileToCanvas(item.file);
  if (item.rotation) canvas = rotateCanvas(canvas, item.rotation);
  canvas = cropTopFraction(canvas, item.cropY);

  const maxSide = settings.model === "fast" ? 1280 : settings.model === "standard" ? 1600 : 2048;
  canvas = downscaleMax(canvas, maxSide);

  const inputBlob = await canvasToBlob(canvas, "image/png");
  const cutoutBlob = await removeBackgroundBlob(inputBlob, settings.model, onProgress);
  let cutout = await blobToCanvas(cutoutBlob);
  const afterRemove = `${cutout.width}×${cutout.height}`;

  if (settings.postProcess) {
    cutout = fillInteriorHoles(cutout);
  }
  if (settings.alphaMatting) {
    cutout = featherAlpha(cutout, 2);
  }

  if (settings.width > 0 && settings.height > 0) {
    cutout = smartFit(cutout, settings.width, settings.height);
  }

  const format = settings.format;
  const mime = mimeForFormat(format);
  const encoded = format === "JPEG" ? flattenOnWhite(cutout) : cutout;
  const blob = await canvasToBlob(encoded, mime, 0.95);

  const stem = item.label.trim() || slugifyName(item.name) || "fritlagt";
  const filename = `${stem}${settings.suffix}${extForFormat(format)}`;
  return { blob, filename, note: `${afterRemove} → ${encoded.width}×${encoded.height}` };
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
