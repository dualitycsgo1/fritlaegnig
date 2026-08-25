import { ImagePlus, Trash2, UserRound } from "lucide-react";
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
    <section className="flex min-h-0 flex-1 flex-col rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-fg">Kø</h2>
        <span className="tabular-nums text-xs text-muted">{items.length}</span>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => {
            const input = document.getElementById("file-input") as HTMLInputElement | null;
            input?.click();
          }}
        >
          <ImagePlus />
          Tilføj
        </Button>
        <Button size="sm" variant="secondary" onClick={() => void addSample()} disabled={processing}>
          Prøve
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={removeSelected}
          disabled={!selectedId || processing}
        >
          <Trash2 />
        </Button>
        <Button size="sm" variant="danger" onClick={clearAll} disabled={!items.length || processing}>
          Ryd
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyQueue />
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <ul className="flex flex-col gap-1 pr-2">
            {items.map((item) => {
              const active = item.id === selectedId;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => select(item.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors duration-[var(--motion-quick)]",
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
                      <p className="tabular-nums text-[11px] text-subtle">
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
                        className="h-8 text-xs"
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

function EmptyQueue() {
  return (
    <button
      type="button"
      onClick={() => {
        const input = document.getElementById("file-input") as HTMLInputElement | null;
        input?.click();
      }}
      className="flex flex-1 flex-col items-center justify-center gap-3 rounded-md bg-bg px-4 py-8 text-center shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-fg)_12%,transparent)]"
    >
      <span className="grid size-12 place-items-center rounded-md bg-surface-2 text-primary">
        <ImagePlus className="size-5" />
      </span>
      <p className="text-sm font-medium text-fg">Slip billeder her</p>
      <p className="max-w-[18rem] text-xs text-subtle">
        PNG, JPEG eller WEBP. RAW skal konverteres først. Intet forlader din browser.
      </p>
    </button>
  );
}
