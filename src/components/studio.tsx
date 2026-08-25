import { SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { QueueList } from "@/components/queue-list";
import { PreviewStage } from "@/components/preview-stage";
import { SettingsPanel } from "@/components/settings-panel";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ACCEPTED_EXT } from "@/lib/types";
import { useStudio } from "@/lib/store";
import { cn } from "@/lib/utils";

export function Studio() {
  const addFiles = useStudio((s) => s.addFiles);
  const processing = useStudio((s) => s.processing);
  const items = useStudio((s) => s.items);
  const logs = useStudio((s) => s.logs);
  const modelReady = useStudio((s) => s.modelReady);
  const [dragging, setDragging] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [gpuLabel, setGpuLabel] = useState("CPU");

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) void addFiles(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  useEffect(() => {
    if ("gpu" in navigator) setGpuLabel("WebGPU");
  }, []);

  const done = items.filter((i) => i.status === "done").length;

  return (
    <div
      className={cn(
        "flex h-dvh flex-col bg-bg text-fg",
        dragging && "ring-2 ring-primary ring-inset",
      )}
      onDragEnter={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
      }}
    >
      <input
        id="file-input"
        type="file"
        accept={[...ACCEPTED_EXT, "image/*"].join(",")}
        multiple
        className="sr-only"
        onChange={(e) => {
          if (e.target.files?.length) void addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <header className="flex items-center gap-3 border-b border-border px-4 py-3 lg:px-5">
        <Mark />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-lg font-semibold tracking-tight text-fg">
            Fritlægning
          </h1>
          <p className="truncate text-xs text-muted">
            CS2 HUD & Broadcast · kører i browseren
          </p>
        </div>
        <span className="hidden rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-muted sm:inline">
          {gpuLabel}
        </span>
        <div className="lg:hidden">
          <Button size="sm" variant="secondary" onClick={() => setSettingsOpen(true)}>
            <SlidersHorizontal />
            Indstillinger
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 lg:grid lg:grid-cols-[minmax(240px,280px)_minmax(0,1fr)_minmax(260px,300px)]">
        <div
          className={cn(
            "flex min-h-[160px] flex-col",
            items.length === 0 ? "flex-1 lg:max-h-none lg:flex-1" : "max-h-[34vh] lg:max-h-none",
          )}
        >
          <QueueList />
        </div>
        <div
          className={cn(
            "min-h-[280px] flex-1 flex-col",
            items.length === 0 ? "hidden lg:flex" : "flex",
          )}
        >
          <PreviewStage />
        </div>
        <SettingsPanel className="hidden lg:flex" />
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-border px-4 py-2 text-xs text-muted">
        <p className="truncate">
          {processing
            ? logs.at(-1) ?? "Behandler…"
            : dragging
              ? "Slip billederne for at tilføje dem"
              : done
                ? `${done} fritlagt · download enkeltvis eller som ZIP`
                : "Billeder forlader aldrig din maskine"}
        </p>
        <p className="hidden shrink-0 tabular-nums sm:block">
          {modelReady ? "Model cached" : "Model hentes ved første kørsel"}
        </p>
      </footer>

      {dragging ? (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-bg/70">
          <p className="rounded-xl bg-surface px-6 py-4 text-sm font-medium text-fg shadow-[var(--shadow-border)]">
            Slip for at tilføje billeder
          </p>
        </div>
      ) : null}

      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle className="text-base font-medium text-fg">Indstillinger</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <SettingsPanel className="rounded-none bg-transparent p-0 shadow-none" />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Mark() {
  return (
    <span
      aria-hidden
      className="grid size-9 place-items-center rounded-md bg-primary text-primary-fg"
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 20 14 4" />
        <circle cx="7" cy="8" r="2.2" />
        <circle cx="17" cy="16" r="2.2" />
      </svg>
    </span>
  );
}
