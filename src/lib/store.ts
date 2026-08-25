import { create } from "zustand";
import {
  ACCEPTED_EXT,
  ACCEPTED_TYPES,
  DEFAULT_SETTINGS,
  RAW_EXT,
  SETTINGS_KEY,
  type QueueItem,
  type StudioSettings,
} from "./types";
import { formatBytes } from "./utils";
import { readImageSize } from "./image-ops";
import { preloadModel, type ModelProgress } from "./bg-remove";
import { downloadBlob, processItem, refitItem, resultFilename, zipResults } from "./pipeline";

function loadSettings(): StudioSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function persistSettings(settings: StudioSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* ignore quota */
  }
}

function isAccepted(file: File): boolean {
  const name = file.name.toLowerCase();
  if (RAW_EXT.some((ext) => name.endsWith(ext))) return false;
  if (file.type && ACCEPTED_TYPES.includes(file.type)) return true;
  return ACCEPTED_EXT.some((ext) => name.endsWith(ext));
}

function isRaw(file: File): boolean {
  const name = file.name.toLowerCase();
  return RAW_EXT.some((ext) => name.endsWith(ext));
}

type StudioState = {
  items: QueueItem[];
  selectedId: string | null;
  settings: StudioSettings;
  processing: boolean;
  stopRequested: boolean;
  modelReady: boolean;
  modelProgress: ModelProgress | null;
  logs: string[];
  toastError: string | null;
  addFiles: (files: File[] | FileList) => Promise<void>;
  addSample: () => Promise<void>;
  removeSelected: () => void;
  clearAll: () => void;
  select: (id: string | null) => void;
  patchItem: (id: string, patch: Partial<QueueItem>) => void;
  setSettings: (patch: Partial<StudioSettings>) => void;
  startProcessing: () => Promise<void>;
  stopProcessing: () => void;
  downloadOne: (id: string) => void;
  downloadAll: () => Promise<void>;
  log: (msg: string) => void;
  refitDone: () => Promise<void>;
};

export const useStudio = create<StudioState>((set, get) => ({
  items: [],
  selectedId: null,
  settings: loadSettings(),
  processing: false,
  stopRequested: false,
  modelReady: false,
  modelProgress: null,
  logs: [],
  toastError: null,

  log: (msg) =>
    set((s) => ({
      logs: [...s.logs.slice(-180), `${new Date().toLocaleTimeString("da-DK")}  ${msg}`],
    })),

  refitDone: async () => {
    const { items, settings, processing } = get();
    if (processing) return;
    const done = items.filter((i) => i.status === "done" && i.resultBlob);
    if (!done.length) return;
    for (const item of done) {
      try {
        const result = await refitItem(item, settings);
        if (!result) continue;
        const resultUrl = URL.createObjectURL(result.blob);
        const prev = get().items.find((i) => i.id === item.id);
        if (prev?.resultUrl) URL.revokeObjectURL(prev.resultUrl);
        set((s) => ({
          items: s.items.map((i) =>
            i.id === item.id ? { ...i, resultBlob: result.blob, resultUrl } : i,
          ),
        }));
      } catch {
        /* keep the previous result */
      }
    }
  },

  addFiles: async (files) => {
    const list = Array.from(files);
    const raw = list.filter(isRaw);
    const accepted = list.filter(isAccepted);
    if (raw.length) {
      get().log(`${raw.length} RAW-fil(er) sprunget over — konvertér til JPEG/PNG først.`);
    }
    const existing = new Set(get().items.map((i) => `${i.name}:${i.file.size}`));
    let added = 0;
    const next: QueueItem[] = [];
    for (const file of accepted) {
      const key = `${file.name}:${file.size}`;
      if (existing.has(key)) continue;
      try {
        const size = await readImageSize(file);
        const previewUrl = URL.createObjectURL(file);
        next.push({
          id: crypto.randomUUID(),
          file,
          name: file.name,
          label: file.name.replace(/\.[^.]+$/, ""),
          width: size.width,
          height: size.height,
          rotation: 0,
          cropY: null,
          status: "pending",
          error: null,
          previewUrl,
          resultUrl: null,
          resultBlob: null,
        });
        added += 1;
      } catch (err) {
        get().log(`Kunne ikke læse ${file.name}: ${err instanceof Error ? err.message : "ukendt fejl"}`);
      }
    }
    if (!next.length && !raw.length) {
      if (!accepted.length) get().log("Ingen understøttede billeder i det du droppede.");
      return;
    }
    set((s) => ({
      items: [...s.items, ...next],
      selectedId: s.selectedId ?? next[0]?.id ?? s.selectedId,
    }));
    get().log(`Tilføjede ${added} billede${added === 1 ? "" : "r"} (${formatBytes(next.reduce((n, i) => n + i.file.size, 0))}).`);
  },

  addSample: async () => {
    try {
      const res = await fetch("/sample-player.jpg");
      if (!res.ok) throw new Error("prøvebillede mangler");
      const blob = await res.blob();
      const file = new File([blob], "sample-player.jpg", { type: "image/jpeg" });
      await get().addFiles([file]);
    } catch (err) {
      get().log(`Prøvebillede kunne ikke hentes: ${err instanceof Error ? err.message : "fejl"}`);
    }
  },

  removeSelected: () => {
    const { selectedId, items, processing } = get();
    if (!selectedId || processing) return;
    const item = items.find((i) => i.id === selectedId);
    if (item) {
      URL.revokeObjectURL(item.previewUrl);
      if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
    }
    const remaining = items.filter((i) => i.id !== selectedId);
    set({ items: remaining, selectedId: remaining[0]?.id ?? null });
  },

  clearAll: () => {
    if (get().processing) return;
    for (const item of get().items) {
      URL.revokeObjectURL(item.previewUrl);
      if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
    }
    set({ items: [], selectedId: null });
    get().log("Køen er ryddet.");
  },

  select: (id) => set({ selectedId: id }),

  patchItem: (id, patch) =>
    set((s) => ({
      items: s.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    })),

  setSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    persistSettings(settings);
    set({ settings });
  },

  stopProcessing: () => {
    if (!get().processing) return;
    set({ stopRequested: true });
    get().log("Stop anmodet — afslutter nuværende billede.");
  },

  startProcessing: async () => {
    const { items, processing, settings } = get();
    if (processing) return;
    const pending = items.filter((i) => i.status !== "done");
    if (!pending.length) {
      get().log("Ingen billeder at behandle.");
      return;
    }
    set({ processing: true, stopRequested: false });
    get().log(`Henter AI-model (${settings.model}) — kun første gang.`);
    try {
      await preloadModel(settings.model, (p) => set({ modelProgress: p }));
      set({ modelReady: true, modelProgress: null });
      get().log("Model klar. Behandler i browseren — intet uploades.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Model kunne ikke indlæses";
      get().log(`Model-fejl: ${msg}`);
      set({ processing: false, modelProgress: null, toastError: msg });
      return;
    }

    for (const item of pending) {
      if (get().stopRequested) {
        get().log("Stoppet.");
        break;
      }
      set((s) => ({
        selectedId: item.id,
        items: s.items.map((i) =>
          i.id === item.id ? { ...i, status: "processing" as const, error: null } : i,
        ),
      }));
      get().log(`${item.label} …`);
      try {
        const live = get().items.find((i) => i.id === item.id) ?? item;
        const { blob, filename, note } = await processItem(live, get().settings, (p) =>
          set({ modelProgress: p }),
        );
        const resultUrl = URL.createObjectURL(blob);
        const prev = get().items.find((i) => i.id === item.id);
        if (prev?.resultUrl) URL.revokeObjectURL(prev.resultUrl);
        set((s) => ({
          modelProgress: null,
          items: s.items.map((i) =>
            i.id === item.id
              ? { ...i, status: "done" as const, resultBlob: blob, resultUrl, error: null }
              : i,
          ),
        }));
        get().log(`  → ${filename} (${note})`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Ukendt fejl";
        set((s) => ({
          modelProgress: null,
          items: s.items.map((i) =>
            i.id === item.id ? { ...i, status: "error" as const, error: msg } : i,
          ),
        }));
        get().log(`  Fejl: ${msg}`);
      }
    }

    set({ processing: false, stopRequested: false, modelProgress: null });
    const done = get().items.filter((i) => i.status === "done").length;
    get().log(`Færdig. ${done} / ${get().items.length} fritlagt.`);
  },

  downloadOne: (id) => {
    const { items, settings } = get();
    const item = items.find((i) => i.id === id);
    if (!item?.resultBlob) return;
    downloadBlob(item.resultBlob, resultFilename(item, settings));
  },

  downloadAll: async () => {
    const { items, settings } = get();
    const ready = items.filter((i) => i.resultBlob);
    if (!ready.length) return;
    if (ready.length === 1 && ready[0].resultBlob) {
      get().downloadOne(ready[0].id);
      return;
    }
    const project = settings.project.trim() || "fritlagt";
    await zipResults(
      ready.map((i) => ({
        filename: resultFilename(i, settings),
        blob: i.resultBlob as Blob,
      })),
      `${project}.zip`,
    );
    get().log(`ZIP med ${ready.length} billeder downloadet.`);
  },
}));

export function selectedItem(): QueueItem | undefined {
  const { items, selectedId } = useStudio.getState();
  return items.find((i) => i.id === selectedId);
}
