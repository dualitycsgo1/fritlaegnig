export type ItemStatus = "pending" | "processing" | "done" | "error";

export type OutputFormat = "PNG" | "JPEG" | "WEBP";

export type QualityPreset = "fast" | "standard" | "high";

export type QueueItem = {
  id: string;
  file: File;
  name: string;
  label: string;
  width: number;
  height: number;
  rotation: number;
  cropY: number | null;
  status: ItemStatus;
  error: string | null;
  previewUrl: string;
  resultUrl: string | null;
  resultBlob: Blob | null;
};

export type StudioSettings = {
  width: number;
  height: number;
  model: QualityPreset;
  alphaMatting: boolean;
  postProcess: boolean;
  suffix: string;
  format: OutputFormat;
  project: string;
};

export const DEFAULT_SETTINGS: StudioSettings = {
  width: 1000,
  height: 1000,
  model: "standard",
  alphaMatting: true,
  postProcess: true,
  suffix: "_fri",
  format: "PNG",
  project: "",
};

export const QUALITY_MODELS: Record<
  QualityPreset,
  { id: "isnet" | "isnet_fp16" | "isnet_quint8"; label: string; hint: string }
> = {
  fast: {
    id: "isnet_quint8",
    label: "Hurtig",
    hint: "Mindre model — godt til mange billeder",
  },
  standard: {
    id: "isnet_fp16",
    label: "Standard",
    hint: "ISNet — balanceret kvalitet og hastighed",
  },
  high: {
    id: "isnet",
    label: "Høj kvalitet",
    hint: "Bedst til spillerportrætter og hår",
  },
};

export const CANVAS_PRESETS = [
  { label: "HUD 1000²", width: 1000, height: 1000 },
  { label: "HUD 800²", width: 800, height: 800 },
  { label: "Broadcast 16:9", width: 1920, height: 1080 },
  { label: "Original", width: 0, height: 0 },
] as const;

export const SETTINGS_KEY = "fritlaegning.settings.v1";

export const ACCEPTED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/tiff",
  "image/avif",
];

export const ACCEPTED_EXT = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".bmp",
  ".tif",
  ".tiff",
  ".avif",
];

export const RAW_EXT = [
  ".cr2",
  ".cr3",
  ".nef",
  ".arw",
  ".raf",
  ".dng",
  ".orf",
  ".rw2",
];
