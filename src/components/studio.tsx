import { LogOut, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { ActionBar } from "@/components/action-bar";
import { QueueFilmstrip, QueueList } from "@/components/queue-list";
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

  const empty = items.length === 0;
  const done = items.filter((i) => i.status === "done").length;

  return (
    <div
      className={cn(
        "flex h-dvh flex-col overflow-hidden bg-bg text-fg",
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

      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3 lg:px-4">
        <Mark />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-base font-semibold tracking-tight text-fg">Fritlægning</h1>
          <p className="hidden truncate text-xs text-muted sm:block">
            {processing
              ? (logs.at(-1) ?? "Behandler…")
              : done
                ? `${done} fritlagt`
                : "CS2 HUD & broadcast · kører lokalt"}
          </p>
        </div>
        <span className="hidden rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-muted sm:inline">
          {gpuLabel}
        </span>
        <span className="hidden text-xs text-subtle lg:inline">
          {modelReady ? "Model cached" : "Model hentes ved første kørsel"}
        </span>
        <a
          href="/logout"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium text-muted hover:bg-surface-2 hover:text-fg"
        >
          <LogOut className="size-3.5" />
          <span className="sr-only sm:not-sr-only">Log ud</span>
        </a>
        <Button
          size="sm"
          variant="secondary"
          className="lg:hidden"
          onClick={() => setSettingsOpen(true)}
        >
          <SlidersHorizontal />
          <span className="sr-only sm:not-sr-only">Indstillinger</span>
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:grid lg:grid-cols-[minmax(220px,260px)_minmax(0,1fr)_minmax(260px,300px)] lg:grid-rows-[minmax(0,1fr)] lg:gap-3 lg:p-3">
        <div className="hidden min-h-0 min-w-0 overflow-hidden lg:flex">
          <QueueList />
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-3 lg:p-0">
          <PreviewStage />
        </div>

        <div className="hidden min-h-0 min-w-0 overflow-hidden lg:flex">
          <SettingsPanel />
        </div>

        <div className="shrink-0 border-t border-border lg:hidden">
          {!empty ? <QueueFilmstrip /> : null}
          <div className="px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <ActionBar />
          </div>
        </div>
      </div>

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
            <SettingsPanel embedded />
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
      className="grid size-8 place-items-center rounded-md bg-primary text-primary-fg"
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 20 14 4" />
        <circle cx="7" cy="8" r="2.2" />
        <circle cx="17" cy="16" r="2.2" />
      </svg>
    </span>
  );
}
