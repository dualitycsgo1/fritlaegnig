import { ActionBar } from "@/components/action-bar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CANVAS_PRESETS, QUALITY_MODELS, type OutputFormat, type QualityPreset } from "@/lib/types";
import { useStudio } from "@/lib/store";
import { cn } from "@/lib/utils";

export function SettingsPanel({
  className,
  embedded = false,
}: {
  className?: string;
  embedded?: boolean;
}) {
  const settings = useStudio((s) => s.settings);
  const setSettings = useStudio((s) => s.setSettings);
  const logs = useStudio((s) => s.logs);

  return (
    <aside
      className={cn(
        "flex min-h-0 w-full flex-1 flex-col",
        !embedded && "rounded-xl bg-surface shadow-[var(--shadow-border)]",
        className,
      )}
    >
      {!embedded ? (
        <div className="shrink-0 border-b border-border p-3">
          <ActionBar />
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 p-3">
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-fg">Lærred</h2>
            <div className="grid grid-cols-2 gap-1.5">
              {CANVAS_PRESETS.map((preset) => {
                const active = settings.width === preset.width && settings.height === preset.height;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setSettings({ width: preset.width, height: preset.height })}
                    className={cn(
                      "h-9 rounded-sm px-2 text-xs font-medium transition-colors duration-[var(--motion-quick)]",
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
                className="h-9 text-center tabular-nums"
                value={settings.width || ""}
                placeholder="auto"
                onChange={(e) => setSettings({ width: Number(e.target.value.replace(/\D/g, "")) || 0 })}
              />
              <span className="text-muted">×</span>
              <Input
                inputMode="numeric"
                aria-label="Højde"
                className="h-9 text-center tabular-nums"
                value={settings.height || ""}
                placeholder="auto"
                onChange={(e) => setSettings({ height: Number(e.target.value.replace(/\D/g, "")) || 0 })}
              />
            </div>
            <p className="text-xs text-subtle">Motivet centreres vandret og sættes i bund.</p>
          </section>

          <section className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="project">Projekt</Label>
              <Input
                id="project"
                value={settings.project}
                placeholder="Eliten"
                onChange={(e) => setSettings({ project: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="suffix">Suffiks</Label>
              <Input
                id="suffix"
                value={settings.suffix}
                onChange={(e) => setSettings({ suffix: e.target.value })}
              />
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="format">Format</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {(["PNG", "WEBP", "JPEG"] as OutputFormat[]).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setSettings({ format: fmt })}
                    className={cn(
                      "h-9 rounded-sm text-xs font-medium transition-colors duration-[var(--motion-quick)]",
                      settings.format === fmt
                        ? "bg-primary text-primary-fg"
                        : "bg-surface-2 text-muted hover:text-fg",
                    )}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
              {settings.format === "JPEG" ? (
                <p className="text-xs text-warning">JPEG får hvid baggrund.</p>
              ) : (
                <p className="text-xs text-subtle">PNG og WEBP bevarer gennemsigtighed.</p>
              )}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-fg">Kvalitet</h2>
            <div className="grid grid-cols-3 gap-1.5">
              {(Object.keys(QUALITY_MODELS) as QualityPreset[]).map((key) => {
                const meta = QUALITY_MODELS[key];
                const active = settings.model === key;
                return (
                  <button
                    key={key}
                    type="button"
                    title={meta.hint}
                    onClick={() => setSettings({ model: key })}
                    className={cn(
                      "h-9 rounded-sm text-xs font-medium transition-colors duration-[var(--motion-quick)]",
                      active ? "bg-primary text-primary-fg" : "bg-surface-2 text-muted hover:text-fg",
                    )}
                  >
                    {meta.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-subtle">{QUALITY_MODELS[settings.model].hint}</p>
          </section>

          <section className="flex flex-col gap-3">
            <label className="flex min-h-11 items-center justify-between gap-3">
              <span className="text-sm text-fg">Blødere kanter</span>
              <Switch
                checked={settings.alphaMatting}
                onCheckedChange={(v) => setSettings({ alphaMatting: v })}
              />
            </label>
            <label className="flex min-h-11 items-center justify-between gap-3">
              <span className="text-sm text-fg">Udfyld huller</span>
              <Switch
                checked={settings.postProcess}
                onCheckedChange={(v) => setSettings({ postProcess: v })}
              />
            </label>
          </section>

          <details className="rounded-md bg-bg p-3">
            <summary className="cursor-pointer text-xs font-medium tracking-wide text-subtle uppercase">
              Log
            </summary>
            <pre className="mt-2 max-h-32 overflow-auto font-mono text-xs leading-relaxed text-muted">
              {logs.length ? logs.join("\n") : "Tilføj billeder for at starte."}
            </pre>
          </details>
        </div>
      </div>
    </aside>
  );
}
