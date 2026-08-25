/** Canvas helpers for crop, rotate, mask refine and HUD-fit. */

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function getContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D er ikke tilgængelig i denne browser.");
  return ctx;
}

export async function fileToCanvas(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const canvas = createCanvas(bitmap.width, bitmap.height);
  getContext(canvas).drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
}

export async function blobToCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(blob);
  const canvas = createCanvas(bitmap.width, bitmap.height);
  getContext(canvas).drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
}

export async function urlToCanvas(url: string): Promise<HTMLCanvasElement> {
  const img = await loadHtmlImage(url);
  const canvas = createCanvas(img.naturalWidth, img.naturalHeight);
  getContext(canvas).drawImage(img, 0, 0);
  return canvas;
}

export function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Kunne ikke indlæse billedet."));
    img.src = url;
  });
}

export function rotateCanvas(source: HTMLCanvasElement, degrees: number): HTMLCanvasElement {
  const rot = ((degrees % 360) + 360) % 360;
  if (rot === 0) return cloneCanvas(source);
  const swap = rot === 90 || rot === 270;
  const canvas = createCanvas(swap ? source.height : source.width, swap ? source.width : source.height);
  const ctx = getContext(canvas);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return canvas;
}

export function cloneCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = createCanvas(source.width, source.height);
  getContext(canvas).drawImage(source, 0, 0);
  return canvas;
}

/** Keep the top `fraction` of the image (crop everything below). */
export function cropTopFraction(source: HTMLCanvasElement, fraction: number | null): HTMLCanvasElement {
  if (fraction == null) return source;
  const keep = Math.max(0.05, Math.min(0.98, fraction));
  const height = Math.max(1, Math.round(source.height * keep));
  const canvas = createCanvas(source.width, height);
  getContext(canvas).drawImage(source, 0, 0);
  return canvas;
}

export function downscaleMax(source: HTMLCanvasElement, maxSide: number): HTMLCanvasElement {
  const longest = Math.max(source.width, source.height);
  if (longest <= maxSide) return source;
  const scale = maxSide / longest;
  const w = Math.max(1, Math.round(source.width * scale));
  const h = Math.max(1, Math.round(source.height * scale));
  const canvas = createCanvas(w, h);
  const ctx = getContext(canvas);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, w, h);
  return canvas;
}

function opaqueBBox(data: ImageData): { x: number; y: number; w: number; h: number } | null {
  const { width, height, data: px } = data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = px[(y * width + x) * 4 + 3];
      if (a > 8) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Scale subject to fit inside target, preserve aspect, center on transparent canvas.
 * Matches the desktop app's `_smart_fit`.
 */
export function smartFit(
  source: HTMLCanvasElement,
  targetW: number,
  targetH: number,
): HTMLCanvasElement {
  if (targetW <= 0 || targetH <= 0) return source;
  const ctx = getContext(source);
  const imageData = ctx.getImageData(0, 0, source.width, source.height);
  const bbox = opaqueBBox(imageData);
  const subject = createCanvas(source.width, source.height);
  getContext(subject).drawImage(source, 0, 0);

  let sx = 0;
  let sy = 0;
  let sw = source.width;
  let sh = source.height;
  if (bbox) {
    sx = bbox.x;
    sy = bbox.y;
    sw = bbox.w;
    sh = bbox.h;
  }
  if (sw <= 0 || sh <= 0) {
    return createCanvas(targetW, targetH);
  }

  const scale = Math.min(targetW / sw, targetH / sh);
  const nw = Math.max(1, Math.round(sw * scale));
  const nh = Math.max(1, Math.round(sh * scale));
  const canvas = createCanvas(targetW, targetH);
  const out = getContext(canvas);
  out.imageSmoothingEnabled = true;
  out.imageSmoothingQuality = "high";
  const x = Math.floor((targetW - nw) / 2);
  const y = Math.floor((targetH - nh) / 2);
  out.drawImage(subject, sx, sy, sw, sh, x, y, nw, nh);
  return canvas;
}

const HOLE_ALPHA = 32;

/** Fill transparent holes that are fully enclosed by the subject. */
export function fillInteriorHoles(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = cloneCanvas(source);
  const ctx = getContext(canvas);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { width: w, height: h, data } = img;
  const visited = new Uint8Array(w * h);
  const stack: number[] = [];

  const idx = (x: number, y: number) => y * w + x;
  const isHole = (i: number) => data[i * 4 + 3] < HOLE_ALPHA;

  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = idx(x, y);
    if (visited[i] || !isHole(i)) return;
    visited[i] = 1;
    stack.push(i);
  };

  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }

  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i - x) / w;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }

  for (let i = 0; i < w * h; i++) {
    if (!visited[i] && isHole(i)) {
      data[i * 4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Soften the alpha edge — a lightweight stand-in for alpha matting. */
export function featherAlpha(source: HTMLCanvasElement, radius = 2): HTMLCanvasElement {
  const r = Math.max(1, Math.min(6, Math.round(radius)));
  const canvas = cloneCanvas(source);
  const ctx = getContext(canvas);
  const src = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { width: w, height: h, data } = src;
  const alpha = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) alpha[i] = data[i * 4 + 3];

  const blur1d = (input: Float32Array, horizontal: boolean) => {
    const out = new Float32Array(input.length);
    const span = r * 2 + 1;
    if (horizontal) {
      for (let y = 0; y < h; y++) {
        let sum = 0;
        for (let k = -r; k <= r; k++) {
          const x = Math.min(w - 1, Math.max(0, k));
          sum += input[y * w + x];
        }
        for (let x = 0; x < w; x++) {
          out[y * w + x] = sum / span;
          const leave = Math.min(w - 1, Math.max(0, x - r));
          const add = Math.min(w - 1, Math.max(0, x + r + 1));
          sum += input[y * w + add] - input[y * w + leave];
        }
      }
    } else {
      for (let x = 0; x < w; x++) {
        let sum = 0;
        for (let k = -r; k <= r; k++) {
          const y = Math.min(h - 1, Math.max(0, k));
          sum += input[y * w + x];
        }
        for (let y = 0; y < h; y++) {
          out[y * w + x] = sum / span;
          const leave = Math.min(h - 1, Math.max(0, y - r));
          const add = Math.min(h - 1, Math.max(0, y + r + 1));
          sum += input[add * w + x] - input[leave * w + x];
        }
      }
    }
    return out;
  };

  const blurred = blur1d(blur1d(alpha, true), false);
  for (let i = 0; i < w * h; i++) {
    const orig = alpha[i];
    if (orig === 0 || orig === 255) {
      data[i * 4 + 3] = orig;
    } else {
      data[i * 4 + 3] = Math.round(blurred[i]);
    }
    // Mix original with blur only near edges
    const edge = orig > 4 && orig < 250;
    if (edge) data[i * 4 + 3] = Math.round(blurred[i]);
  }
  ctx.putImageData(src, 0, 0);
  return canvas;
}

export function flattenOnWhite(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = createCanvas(source.width, source.height);
  const ctx = getContext(canvas);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0);
  return canvas;
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality = 0.95,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error("Kunne ikke kode billedet."));
        else resolve(blob);
      },
      type,
      quality,
    );
  });
}

export function mimeForFormat(format: "PNG" | "JPEG" | "WEBP"): string {
  if (format === "JPEG") return "image/jpeg";
  if (format === "WEBP") return "image/webp";
  return "image/png";
}

export function extForFormat(format: "PNG" | "JPEG" | "WEBP"): string {
  if (format === "JPEG") return ".jpg";
  if (format === "WEBP") return ".webp";
  return ".png";
}

export async function readImageSize(file: File): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}
