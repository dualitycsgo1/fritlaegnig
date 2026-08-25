import { Download, ImagePlus, RotateCcw, RotateCw, Scissors, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useStudio } from "@/lib/store";
import { cn } from "@/lib/utils";

export function PreviewStage() {
  const items = useStudio((s) => s.items);
  const selectedId = useStudio((s) => s.selectedId);
  const processing = useStudio((s) => s.processing);
  const patchItem = useStudio((s) => s.patchItem);
  const downloadOne = useStudio((s) => s.downloadOne);
  const item = items.find((i) => i.id === selectedId) ?? null;
  const [compare, setCompare] = useState(1);
  const [showResult, setShowResult] = useState(true);

  useEffect(() => {
    setShowResult(true);
    setCompare(1);
  }, [item?.id, item?.resultUrl]);

  if (!item) {
    return (
      <section className="flex min-h-0 flex-1 flex-col rounded-xl bg-surface p-3 shadow-[var(--shadow-border)] lg:p-4">
        <DropZone />
      </section>
    );
  }

  const canCompare = Boolean(item.resultUrl) && showResult;

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-xl bg-surface p-3 shadow-[var(--shadow-border)] lg:p-4">
      <div className="mb-2 flex shrink-0 flex-wrap items-center gap-1.5">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{item.label}</p>
        <Button
          size="sm"
          variant="secondary"
          className="min-h-9"
          disabled={processing}
          onClick={() => patchItem(item.id, { rotation: (item.rotation + 270) % 360 })}
        >
          <RotateCcw />
          <span className="sr-only sm:not-sr-only">Venstre</span>
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="min-h-9"
          disabled={processing}
          onClick={() => patchItem(item.id, { rotation: (item.rotation + 90) % 360 })}
        >
          <RotateCw />
          <span className="sr-only sm:not-sr-only">Højre</span>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="min-h-9"
          disabled={processing || item.cropY == null}
          onClick={() => patchItem(item.id, { cropY: null })}
        >
          <X />
          <span className="sr-only sm:not-sr-only">Beskær</span>
        </Button>
        {item.resultUrl ? (
          <>
            <Button size="sm" variant="secondary" className="min-h-9" onClick={() => setShowResult((v) => !v)}>
              {showResult ? "Original" : "Resultat"}
            </Button>
            <Button size="sm" className="min-h-9" onClick={() => downloadOne(item.id)}>
              <Download />
              <span className="sr-only sm:not-sr-only">Download</span>
            </Button>
          </>
        ) : null}
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-md bg-bg">
        {canCompare ? (
          <CompareView original={item.previewUrl} result={item.resultUrl!} rotation={item.rotation} compare={compare} />
        ) : (
          <CropCanvas
            src={item.previewUrl}
            rotation={item.rotation}
            cropY={item.cropY}
            disabled={processing}
            onCrop={(y) => patchItem(item.id, { cropY: y })}
          />
        )}
        {item.status === "processing" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-bg/55">
            <p className="text-sm text-fg">Fritlægger…</p>
          </div>
        ) : null}
      </div>

      <div className="mt-2 flex shrink-0 items-center gap-3">
        {canCompare ? (
          <label className="flex min-w-0 flex-1 items-center gap-3 text-xs text-muted">
            Før / efter
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={compare}
              onChange={(e) => setCompare(Number(e.target.value))}
              className="h-10 flex-1 accent-primary"
            />
          </label>
        ) : (
          <p className="flex items-center gap-2 text-xs text-muted">
            <Scissors className="size-3.5" />
            Træk en linje — alt under den skæres væk inden fritlægning
          </p>
        )}
      </div>
    </section>
  );
}

function DropZone() {
  const addSample = useStudio((s) => s.addSample);
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-md bg-bg px-6 text-center">
      <button
        type="button"
        onClick={() => {
          const input = document.getElementById("file-input") as HTMLInputElement | null;
          input?.click();
        }}
        className="flex flex-col items-center gap-3"
      >
        <span className="grid size-14 place-items-center rounded-md bg-surface-2 text-primary">
          <ImagePlus className="size-6" />
        </span>
        <p className="text-base font-medium text-fg">Slip billeder her</p>
        <p className="max-w-sm text-sm text-subtle">
          PNG, JPEG eller WEBP. Intet forlader din browser. Du kan også paste med Ctrl+V.
        </p>
      </button>
      <Button variant="secondary" onClick={() => void addSample()}>
        Åbn prøvebillede
      </Button>
    </div>
  );
}

function CropCanvas({
  src,
  rotation,
  cropY,
  disabled,
  onCrop,
}: {
  src: string;
  rotation: number;
  cropY: number | null;
  disabled: boolean;
  onCrop: (y: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const layoutRef = useRef({ x: 0, y: 0, w: 0, h: 0 });

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = src;
    img.onload = () => {
      imgRef.current = img;
      draw();
    };
    const onResize = () => draw();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, rotation]);

  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cropY, rotation]);

  function draw() {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = parent.clientWidth;
    const cssH = parent.clientHeight;
    canvas.width = Math.max(1, Math.floor(cssW * dpr));
    canvas.height = Math.max(1, Math.floor(cssH * dpr));
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const rot = ((rotation % 360) + 360) % 360;
    const swap = rot === 90 || rot === 270;
    const iw = swap ? img.naturalHeight : img.naturalWidth;
    const ih = swap ? img.naturalWidth : img.naturalHeight;
    const scale = Math.min(cssW / iw, cssH / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const x = (cssW - dw) / 2;
    const y = (cssH - dh) / 2;
    layoutRef.current = { x, y, w: dw, h: dh };

    ctx.save();
    ctx.translate(x + dw / 2, y + dh / 2);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.drawImage(img, -img.naturalWidth * scale / 2, -img.naturalHeight * scale / 2, img.naturalWidth * scale, img.naturalHeight * scale);
    ctx.restore();

    if (cropY != null) {
      const cy = y + cropY * dh;
      const primary =
        getComputedStyle(document.documentElement).getPropertyValue("--color-primary").trim() ||
        "oklab(0.63 0.19 0.03)";
      const primaryFg =
        getComputedStyle(document.documentElement).getPropertyValue("--color-primary-fg").trim() ||
        "white";
      ctx.fillStyle = "color-mix(in oklab, var(--color-bg) 55%, transparent)";
      try {
        ctx.fillRect(x, cy, dw, y + dh - cy);
      } catch {
        ctx.fillStyle = "rgba(11, 11, 18, 0.55)";
        ctx.fillRect(x, cy, dw, y + dh - cy);
      }
      ctx.strokeStyle = primary;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, cy);
      ctx.lineTo(x + dw, cy);
      ctx.stroke();
      const pillW = 72;
      const pillH = 22;
      const px = x + dw / 2 - pillW / 2;
      const py = cy - pillH / 2;
      ctx.fillStyle = primary;
      roundRect(ctx, px, py, pillW, pillH, 11);
      ctx.fill();
      ctx.fillStyle = primaryFg;
      ctx.font = "600 11px Outfit, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${Math.round(cropY * 100)}%`, x + dw / 2, cy + 0.5);
    }
  }

  function pointerToCrop(clientY: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const { y, h } = layoutRef.current;
    if (h <= 0) return;
    const local = clientY - rect.top;
    const frac = Math.max(0.05, Math.min(0.98, (local - y) / h));
    onCrop(frac);
  }

  return (
    <canvas
      ref={canvasRef}
      className={cn("size-full touch-none", disabled ? "cursor-wait" : "cursor-crosshair")}
      onPointerDown={(e) => {
        if (disabled) return;
        (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
        pointerToCrop(e.clientY);
      }}
      onPointerMove={(e) => {
        if (disabled || !e.buttons) return;
        pointerToCrop(e.clientY);
      }}
    />
  );
}

function CompareView({
  original,
  result,
  rotation,
  compare,
}: {
  original: string;
  result: string;
  rotation: number;
  compare: number;
}) {
  return (
    <div className="relative size-full overflow-hidden">
      <img
        src={original}
        alt="Original"
        className="absolute inset-0 size-full object-contain"
        style={{ transform: `rotate(${rotation}deg)` }}
      />
      <div
        className="checker absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${Math.round((1 - compare) * 100)}% 0 0)` }}
      >
        <img src={result} alt="Fritlagt" className="size-full object-contain object-bottom" />
      </div>
      <div
        className="pointer-events-none absolute inset-y-0 w-px bg-primary"
        style={{ left: `${compare * 100}%` }}
      />
    </div>
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
