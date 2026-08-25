import { Download, Square, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { CANVAS_PRESETS, QUALITY_MODELS, type OutputFormat, type QualityPreset } from "@/lib/types";
import { useStudio } from "@/lib/store";
import { cn } from "@/lib/utils";

export function SettingsPanel({ className }: { className?: string }) {
  const settings = useStudio((s) => s.settings);
  const setSettings = useStudio((s) => s.setSettings);
  const items = useStudio((s) => s.items);
  const processing = useStudio((s) => s.processing);
  const startProcessing = useStudio((s) => s.startProcessing);
  const stopProcessing = useStudio((s) => s.stopProcessing);
  const downloadAll = useStudio((s) => s.downloadAll);
  const modelProgress = useStudio((s) => s.modelProgress);
  const logs = useStudio((s) => s.logs);

  const done = items.filter((i) => i.status === "done").length;
  const total = items.length;
  const pending = items.filter((i) => i.status !== "done").length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const modelPct =
    modelProgress && modelProgress.total > 0
      ? Math.round((modelProgress.current / modelProgress.total) * 100)
      : processing
        ? Math.min(95, pct)
        : pct;

  return (
    <aside className={cn("flex min-h-0 flex-col rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]", className)}>
      <h2 className="text-sm font-medium text-fg">Output</h2>

      <div className="mt-4 flex flex-col gap-3">
        <Label htmlFor="project">Projektnavn</Label>
        <Input
          id="project"
          value={settings.project}
          placeholder="f.eks. Eliten"
          onChange={(e) => setSettings({ project: e.target.value })}
        />

        <Label>Lærred</Label>
        <div className="flex flex-wrap gap-1.5">
          {CANVAS_PRESETS.map((preset) => {
            const active = settings.width === preset.width && settings.height === preset.height;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => setSettings({ width: preset.width, height: preset.height })}
                className={cn(
                  "h-8 rounded-sm px-2.5 text-xs font-medium transition-colors duration-[var(--motion-quick)]",
                  active ? "bg-primary text-primary-fg" : "bg-surface-2 text-muted hover:text-fg",
                )}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <Input
            inputMode="numeric"
            aria-label="Bredde"
            className="text-center tabular-nums"
            value={settings.width || ""}
            placeholder="auto"
            onChange={(e) => setSettings({ width: Number(e.target.value.replace(/\D/g, "")) || 0 })}
          />
          <span className="text-muted">×</span>
          <Input
            inputMode="numeric"
            aria-label="Højde"
            className="text-center tabular-nums"
            value={settings.height || ""}
            placeholder="auto"
            onChange={(e) => setSettings({ height: Number(e.target.value.replace(/\D/g, "")) || 0 })}
          />
        </div>
        <p className="text-[11px] text-subtle">Motivet skaleres ind og centreres. Tom = original størrelse.</p>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="suffix">Suffiks</Label>
            <Input
              id="suffix"
              value={settings.suffix}
              onChange={(e) => setSettings({ suffix: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="format">Format</Label>
            <select
              id="format"
              className="h-10 rounded-sm bg-surface-2 px-2 text-sm text-fg shadow-[var(--shadow-border)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              value={settings.format}
              onChange={(e) => setSettings({ format: e.target.value as OutputFormat })}
            >
              <option value="PNG">PNG</option>
              <option value="WEBP">WEBP</option>
              <option value="JPEG">JPEG</option>
            </select>
          </div>
        </div>
        {settings.format === "JPEG" ? (
          <p className="text-[11px] text-warning">JPEG har ingen gennemsigtighed — baggrund bliver hvid.</p>
        ) : (
          <p className="text-[11px] text-subtle">PNG og WEBP bevarer gennemsigtighed.</p>
        )}
      </div>

      <Separator className="my-4" />

      <h2 className="text-sm font-medium text-fg">Behandling</h2>
      <div className="mt-3 flex flex-col gap-2">
        {(Object.keys(QUALITY_MODELS) as QualityPreset[]).map((key) => {
          const meta = QUALITY_MODELS[key];
          const active = settings.model === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSettings({ model: key })}
              className={cn(
                "rounded-md px-3 py-2 text-left transition-colors duration-[var(--motion-quick)]",
                active ? "bg-surface-2" : "hover:bg-surface-2/50",
              )}
            >
              <p className={cn("text-sm", active ? "text-fg" : "text-muted")}>{meta.label}</p>
              <p className="text-[11px] text-subtle">{meta.hint}</p>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm text-fg">Blødere kanter</span>
          <Switch
            checked={settings.alphaMatting}
            onCheckedChange={(v) => setSettings({ alphaMatting: v })}
          />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm text-fg">Udfyld huller i masken</span>
          <Switch
            checked={settings.postProcess}
            onCheckedChange={(v) => setSettings({ postProcess: v })}
          />
        </label>
      </div>

      <div className="mt-5 flex flex-col gap-2">
        {processing ? (
          <Button variant="danger" onClick={stopProcessing}>
            <Square className="size-3.5 fill-current" />
            Stop
          </Button>
        ) : (
          <Button onClick={() => void startProcessing()} disabled={!pending}>
            <Play className="ml-0.5 size-3.5 fill-current" />
            Fritlæg {pending ? pending : ""} {pending === 1 ? "billede" : "billeder"}
          </Button>
        )}
        <Button variant="secondary" onClick={() => void downloadAll()} disabled={!done}>
          <Download />
          {done > 1 ? `Download ZIP (${done})` : "Download"}
        </Button>
      </div>

      <div className="mt-4">
        <Progress value={modelPct} />
        <p className="mt-2 text-xs text-muted">
          {processing
            ? modelProgress
              ? `Henter model · ${modelPct}%`
              : `Behandler ${done}/${total}`
            : done
              ? `${done} færdig`
              : "Klar"}
        </p>
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-hidden rounded-md bg-bg p-3">
        <p className="mb-2 text-[11px] font-medium tracking-wide text-subtle uppercase">Log</p>
        <pre className="max-h-40 overflow-auto font-mono text-[11px] leading-relaxed text-muted lg:max-h-none">
          {logs.length ? logs.join("\n") : "Tilføj billeder for at starte."}
        </pre>
      </div>
    </aside>
  );
}
