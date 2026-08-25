import { Download, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useStudio } from "@/lib/store";
import { cn } from "@/lib/utils";

export function ActionBar({ className }: { className?: string }) {
  const items = useStudio((s) => s.items);
  const processing = useStudio((s) => s.processing);
  const startProcessing = useStudio((s) => s.startProcessing);
  const stopProcessing = useStudio((s) => s.stopProcessing);
  const downloadAll = useStudio((s) => s.downloadAll);
  const modelProgress = useStudio((s) => s.modelProgress);
  const logs = useStudio((s) => s.logs);
  const toastError = useStudio((s) => s.toastError);

  const done = items.filter((i) => i.status === "done").length;
  const total = items.length;
  const pending = items.filter((i) => i.status !== "done").length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const modelPct =
    modelProgress && modelProgress.total > 0
      ? Math.round((modelProgress.current / modelProgress.total) * 100)
      : processing
        ? Math.min(95, Math.max(pct, 8))
        : pct;

  const label = processing
    ? "Stop"
    : pending
      ? `Fritlæg ${pending}`
      : done
        ? "Fritlæg igen"
        : "Fritlæg";

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex gap-2">
        {processing ? (
          <Button variant="danger" className="min-h-11 flex-1" onClick={stopProcessing}>
            <Square className="size-3.5 fill-current" />
            Stop
          </Button>
        ) : (
          <Button
            className="min-h-11 flex-1"
            onClick={() => void startProcessing()}
            disabled={!total}
          >
            <Play className="size-3.5 fill-current" />
            {label}
          </Button>
        )}
        <Button
          variant="secondary"
          className="min-h-11"
          onClick={() => void downloadAll()}
          disabled={!done}
        >
          <Download />
          {done > 1 ? `ZIP ${done}` : "Hent"}
        </Button>
      </div>
      <Progress value={processing ? modelPct : done ? 100 : 0} />
      {toastError ? (
        <p className="text-xs text-danger">{toastError}</p>
      ) : (
        <p className="truncate text-xs text-muted">
          {processing
            ? modelProgress
              ? `Henter ${modelProgress.key.split("/").pop() ?? "model"} · ${modelPct}%`
              : logs.at(-1)?.replace(/^\S+\s+\S+\s+/, "") ?? `Behandler ${done}/${total}`
            : done
              ? `${done} færdig — tryk Fritlæg igen for at køre om`
              : total
                ? "Klar til fritlægning"
                : "Tilføj billeder for at starte"}
        </p>
      )}
    </div>
  );
}
