import { ImagePlus, Trash2, UserRound, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useStudio } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { ItemStatus } from "@/lib/types";

const STATUS_LABEL: Record<ItemStatus, string> = {
  pending: "Klar",
  processing: "Kører",
  done: "Færdig",
  error: "Fejl",
};

function openFilePicker() {
  const input = document.getElementById("file-input") as HTMLInputElement | null;
  input?.click();
}

export function QueueList() {
  const items = useStudio((s) => s.items);
  const selectedId = useStudio((s) => s.selectedId);
  const processing = useStudio((s) => s.processing);
  const select = useStudio((s) => s.select);
  const patchItem = useStudio((s) => s.patchItem);
  const removeSelected = useStudio((s) => s.removeSelected);
  const clearAll = useStudio((s) => s.clearAll);
  const addSample = useStudio((s) => s.addSample);

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl bg-surface shadow-[var(--shadow-border)]">
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 pt-3">
        <h2 className="text-sm font-medium text-fg">Kø</h2>
        <span className="tabular-nums text-xs text-muted">{items.length}</span>
      </div>

      <div className="flex shrink-0 flex-wrap gap-1.5 p-3">
        <Button size="sm" onClick={openFilePicker}>
          <ImagePlus />
          Tilføj
        </Button>
        <Button size="sm" variant="secondary" onClick={() => void addSample()} disabled={processing}>
          Prøve
        </Button>
        <Button size="sm" variant="ghost" onClick={removeSelected} disabled={!selectedId || processing}>
          <Trash2 />
        </Button>
        <Button size="sm" variant="danger" onClick={clearAll} disabled={!items.length || processing}>
          Ryd
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="px-3 pb-3 text-xs text-subtle">Slip filer på siden, eller brug Tilføj.</p>
      ) : (
        <ScrollArea className="min-h-0 flex-1 px-2 pb-3">
          <ul className="flex flex-col gap-1 pr-2">
            {items.map((item) => {
              const active = item.id === selectedId;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => select(item.id)}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors duration-[var(--motion-quick)]",
                      active ? "bg-surface-2" : "hover:bg-surface-2/60",
                    )}
                  >
                    <img
                      src={item.resultUrl ?? item.previewUrl}
                      alt=""
                      className="size-10 rounded-xs object-cover shadow-[var(--shadow-border)]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-fg">{item.label || item.name}</p>
                      <p className="tabular-nums text-xs text-subtle">
                        {item.width} × {item.height}
                        {item.cropY != null ? ` · ${Math.round(item.cropY * 100)}%` : ""}
                        {item.rotation ? ` · ${item.rotation}°` : ""}
                      </p>
                    </div>
                    <Badge variant={item.status}>{STATUS_LABEL[item.status]}</Badge>
                  </button>
                  {active ? (
                    <div className="mt-1 mb-2 flex items-center gap-2 px-2">
                      <UserRound className="size-3.5 text-subtle" />
                      <Input
                        value={item.label}
                        aria-label="Spillernavn / outputnavn"
                        className="h-9 text-xs"
                        disabled={processing}
                        onChange={(e) => patchItem(item.id, { label: e.target.value })}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      )}
    </section>
  );
}

export function QueueFilmstrip() {
  const items = useStudio((s) => s.items);
  const selectedId = useStudio((s) => s.selectedId);
  const processing = useStudio((s) => s.processing);
  const select = useStudio((s) => s.select);
  const removeSelected = useStudio((s) => s.removeSelected);

  return (
    <div className="flex items-center gap-2 overflow-x-auto px-3 py-2">
      <button
        type="button"
        onClick={openFilePicker}
        className="grid size-14 shrink-0 place-items-center rounded-md bg-surface-2 text-primary"
        aria-label="Tilføj billeder"
      >
        <ImagePlus className="size-5" />
      </button>
      {items.map((item) => {
        const active = item.id === selectedId;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => select(item.id)}
            className={cn(
              "relative size-14 shrink-0 overflow-hidden rounded-md",
              active ? "ring-2 ring-primary" : "ring-1 ring-border",
            )}
          >
            <img src={item.resultUrl ?? item.previewUrl} alt="" className="size-full object-cover" />
            {item.status === "done" ? (
              <span className="absolute right-1 bottom-1 size-1.5 rounded-full bg-success" />
            ) : null}
          </button>
        );
      })}
      <Button
        size="icon"
        variant="ghost"
        className="size-11 shrink-0"
        disabled={!selectedId || processing}
        onClick={removeSelected}
        aria-label="Fjern valgt"
      >
        <X />
      </Button>
    </div>
  );
}
