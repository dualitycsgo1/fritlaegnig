/** Canvas helpers for crop, rotate, mask refine and HUD-fit. */

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
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

function opaqueBBox(
  data: ImageData,
  threshold = 32,
): { x: number; y: number; w: number; h: number } | null {
  const { width, height, data: px } = data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (px[row + x * 4 + 3] > threshold) {
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

/** Browser high-quality resample. Falls back to stepped canvas draws. */
export async function resizeHighQuality(
  source: HTMLCanvasElement,
  width: number,
  height: number,
): Promise<HTMLCanvasElement> {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (source.width === w && source.height === h) return source;
  try {
    const bitmap = await createImageBitmap(source, {
      resizeWidth: w,
      resizeHeight: h,
      resizeQuality: "high",
    });
    const canvas = createCanvas(w, h);
    getContext(canvas).drawImage(bitmap, 0, 0);
    bitmap.close();
    return canvas;
  } catch {
    let current = source;
    let cw = source.width;
    let ch = source.height;
    // Halve until one step remains — large single drawImage blurs.
    while (cw * 0.5 > w && ch * 0.5 > h) {
      cw = Math.round(cw * 0.5);
      ch = Math.round(ch * 0.5);
      const step = createCanvas(cw, ch);
      const ctx = getContext(step);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(current, 0, 0, cw, ch);
      current = step;
    }
    const canvas = createCanvas(w, h);
    const ctx = getContext(canvas);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(current, 0, 0, w, h);
    return canvas;
  }
}

export async function downscaleMax(
  source: HTMLCanvasElement,
  maxSide: number,
): Promise<HTMLCanvasElement> {
  const longest = Math.max(source.width, source.height);
  if (longest <= maxSide) return source;
  const scale = maxSide / longest;
  return resizeHighQuality(source, source.width * scale, source.height * scale);
}

function averageCornerColor(source: HTMLCanvasElement): string {
  const ctx = getContext(source);
  const sample = 12;
  const pts = [
    [0, 0],
    [Math.max(0, source.width - sample), 0],
    [0, Math.max(0, source.height - sample)],
    [Math.max(0, source.width - sample), Math.max(0, source.height - sample)],
  ];
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (const [x, y] of pts) {
    const sw = Math.min(sample, source.width - x);
    const sh = Math.min(sample, source.height - y);
    const data = ctx.getImageData(x, y, sw, sh).data;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n += 1;
    }
  }
  const rr = Math.round(r / Math.max(1, n));
  const gg = Math.round(g / Math.max(1, n));
  const bb = Math.round(b / Math.max(1, n));
  return `rgb(${rr} ${gg} ${bb})`;
}

/**
 * ISNet stretches every input to a square before inference. Pad to a square
 * with the photo's own background color so the stretch does not distort
 * the person, then crop back to this rectangle.
 */
export function padToSquare(source: HTMLCanvasElement): {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (source.width === source.height) {
    return { canvas: source, x: 0, y: 0, width: source.width, height: source.height };
  }
  const side = Math.max(source.width, source.height);
  const canvas = createCanvas(side, side);
  const ctx = getContext(canvas);
  ctx.fillStyle = averageCornerColor(source);
  ctx.fillRect(0, 0, side, side);
  const x = Math.floor((side - source.width) / 2);
  const y = Math.floor((side - source.height) / 2);
  ctx.drawImage(source, x, y);
  return { canvas, x, y, width: source.width, height: source.height };
}

export function cropRect(
  source: HTMLCanvasElement,
  x: number,
  y: number,
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = createCanvas(width, height);
  getContext(canvas).drawImage(source, x, y, width, height, 0, 0, width, height);
  return canvas;
}

/**
 * Scale subject to fit inside the target, keep aspect, center horizontally
 * and pin the opaque pixels to the bottom. Faint halo is ignored so the
 * body is not scaled down or left floating.
 */
export async function smartFit(
  source: HTMLCanvasElement,
  targetW: number,
  targetH: number,
): Promise<HTMLCanvasElement> {
  if (targetW <= 0 || targetH <= 0) return source;
  const imageData = getContext(source).getImageData(0, 0, source.width, source.height);
  const bbox = opaqueBBox(imageData, 28) ?? {
    x: 0,
    y: 0,
    w: source.width,
    h: source.height,
  };
  if (bbox.w <= 0 || bbox.h <= 0) return createCanvas(targetW, targetH);

  const scale = Math.min(targetW / bbox.w, targetH / bbox.h);
  const nw = Math.min(targetW, Math.max(1, Math.round(bbox.w * scale)));
  const nh = Math.min(targetH, Math.max(1, Math.round(bbox.h * scale)));
  const trimmed = cropRect(source, bbox.x, bbox.y, bbox.w, bbox.h);
  const resized = await resizeHighQuality(trimmed, nw, nh);
  const canvas = createCanvas(targetW, targetH);
  const x = Math.floor((targetW - nw) / 2);
  const y = Math.max(0, targetH - nh);
  getContext(canvas).drawImage(resized, x, y);
  return canvas;
}

/** Crop away fully transparent padding so the subject sits on the image edges. */
export async function trimToOpaque(source: HTMLCanvasElement): Promise<HTMLCanvasElement> {
  const bbox = opaqueBBox(getContext(source).getImageData(0, 0, source.width, source.height), 28);
  if (!bbox) return source;
  if (bbox.x === 0 && bbox.y === 0 && bbox.w === source.width && bbox.h === source.height) {
    return source;
  }
  return cropRect(source, bbox.x, bbox.y, bbox.w, bbox.h);
}

const HOLE_ALPHA = 6;

/** Fill nearly-transparent holes that are fully enclosed by the subject. */
export function fillInteriorHoles(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = cloneCanvas(source);
  const ctx = getContext(canvas);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { width: w, height: h, data } = img;
  const visited = new Uint8Array(w * h);
  const stack: number[] = [];

  const isHole = (i: number) => data[i * 4 + 3] < HOLE_ALPHA;

  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
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
    if (!visited[i] && isHole(i)) data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function readAlpha(data: Uint8ClampedArray, n: number): Uint8ClampedArray {
  const alpha = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) alpha[i] = data[i * 4 + 3];
  return alpha;
}

function erodeAlpha(alpha: Uint8ClampedArray, w: number, h: number, radius: number): Uint8ClampedArray {
  const r = Math.max(1, radius);
  const pass = new Uint8ClampedArray(alpha.length);
  const out = new Uint8ClampedArray(alpha.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 255;
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);
      const row = y * w;
      for (let xx = x0; xx <= x1; xx++) m = Math.min(m, alpha[row + xx]);
      pass[row + x] = m;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let m = 255;
      const y0 = Math.max(0, y - r);
      const y1 = Math.min(h - 1, y + r);
      for (let yy = y0; yy <= y1; yy++) m = Math.min(m, pass[yy * w + x]);
      out[y * w + x] = m;
    }
  }
  return out;
}

function blurAlpha(alpha: Uint8ClampedArray, w: number, h: number, radius: number): Uint8ClampedArray {
  const r = Math.max(1, radius);
  const span = r * 2 + 1;
  const pass = new Float32Array(alpha.length);
  const out = new Uint8ClampedArray(alpha.length);
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += alpha[y * w + Math.min(w - 1, Math.max(0, k))];
    for (let x = 0; x < w; x++) {
      pass[y * w + x] = sum / span;
      const leave = Math.min(w - 1, Math.max(0, x - r));
      const add = Math.min(w - 1, Math.max(0, x + r + 1));
      sum += alpha[y * w + add] - alpha[y * w + leave];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += pass[Math.min(h - 1, Math.max(0, k)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = Math.round(sum / span);
      const leave = Math.min(h - 1, Math.max(0, y - r));
      const add = Math.min(h - 1, Math.max(0, y + r + 1));
      sum += pass[add * w + x] - pass[leave * w + x];
    }
  }
  return out;
}

/**
 * Desktop-style edge cleanup: drop the background tint on semi-transparent
 * pixels, then pull the mask in a couple of pixels so the halo disappears
 * without the blur that softens the whole subject.
 */
export function refineEdges(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = cloneCanvas(source);
  const ctx = getContext(canvas);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { width: w, height: h, data } = img;
  const n = w * h;

  let br = 0;
  let bgc = 0;
  let bb = 0;
  let bn = 0;
  for (let i = 0; i < n; i++) {
    if (data[i * 4 + 3] < 12) {
      br += data[i * 4];
      bgc += data[i * 4 + 1];
      bb += data[i * 4 + 2];
      bn += 1;
    }
  }
  const bR = bn ? br / bn : 0;
  const bG = bn ? bgc / bn : 0;
  const bB = bn ? bb / bn : 0;

  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const a = data[o + 3] / 255;
    if (a <= 0.03) {
      data[o + 3] = 0;
      continue;
    }
    if (a >= 0.985) {
      data[o + 3] = 255;
      continue;
    }
    data[o] = Math.max(0, Math.min(255, Math.round((data[o] - bR * (1 - a)) / a)));
    data[o + 1] = Math.max(0, Math.min(255, Math.round((data[o + 1] - bG * (1 - a)) / a)));
    data[o + 2] = Math.max(0, Math.min(255, Math.round((data[o + 2] - bB * (1 - a)) / a)));
  }

  const radius = Math.max(1, Math.round(Math.min(w, h) / 900));
  const alpha = readAlpha(data, n);
  const choked = blurAlpha(erodeAlpha(alpha, w, h, radius), w, h, radius);
  for (let i = 0; i < n; i++) {
    const next = Math.min(alpha[i], choked[i]);
    data[i * 4 + 3] = next < 8 ? 0 : next;
  }

  ctx.putImageData(img, 0, 0);
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