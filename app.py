#!/usr/bin/env python3
"""
Fritlægning — Automatic Background Remover
For CS2 HUD & Broadcast player images

Requirements: pip install -r requirements.txt
"""

import tkinter as tk
from tkinter import ttk, filedialog, messagebox, simpledialog
import threading
import os
import sys
import io
import queue
import json
import types
from pathlib import Path

# ---------------------------------------------------------------------------
# numba / llvmlite compatibility shim
# numba does not yet support Python 3.14+. pymatting (used by rembg for alpha
# matting) decorates its functions with @njit at import time, which crashes.
# We stub out numba so pymatting loads fine; it falls back to pure-Python
# implementations automatically. Alpha matting still works — just no LLVM JIT.
# ---------------------------------------------------------------------------
def _make_numba_stub() -> types.ModuleType:
    def _passthrough(*args, **kwargs):
        """Return the function unchanged, or a passthrough decorator."""
        if args and callable(args[0]) and not isinstance(args[0], str):
            return args[0]
        return lambda f: f

    stub = types.ModuleType("numba")
    stub.njit   = _passthrough
    stub.jit    = _passthrough
    stub.prange = range
    stub.float64 = float
    stub.int64   = int
    stub.boolean = bool

    for sub in ("core", "core.decorators", "core.types",
                "typed", "np", "cuda"):
        m = types.ModuleType(f"numba.{sub}")
        m.njit  = _passthrough
        m.jit   = _passthrough
        sys.modules[f"numba.{sub}"] = m

    sys.modules["numba"] = stub
    return stub


def _needs_numba_stub() -> bool:
    try:
        import numba  # noqa: F401
        return False
    except ImportError:
        return True
    except Exception:
        # Installed but crashes on import (e.g. llvmlite on Python 3.14)
        return True


if _needs_numba_stub():
    _make_numba_stub()

# ---------------------------------------------------------------------------
# Dependency check — give a clear message before crashing
# (skipped when running as a PyInstaller bundle: everything is already bundled)
# ---------------------------------------------------------------------------
_missing = []
if not getattr(sys, "frozen", False):
    try:
        from PIL import Image, ImageTk
    except ImportError:
        _missing.append("Pillow")
    try:
        import rembg  # noqa: F401
    except ImportError:
        _missing.append("rembg")

# rawpy is optional: only needed for camera RAW files
try:
    import rawpy as _rawpy_test  # noqa: F401
    HAS_RAWPY = True
except ImportError:
    HAS_RAWPY = False

# ---------------------------------------------------------------------------
# GPU / CUDA detection
# Probe quietly so the messy CUDA DLL error never reaches stderr.
# ---------------------------------------------------------------------------
import contextlib as _cl


@_cl.contextmanager
def _silence_fd2():
    """
    Silence C-level stderr (file descriptor 2).
    contextlib.redirect_stderr only patches sys.stderr in Python-space;
    C extensions (onnxruntime, llvmlite) write directly to fd 2 and bypass it.
    This redirects the real OS fd so nothing leaks to the console.
    """
    import os as _os
    devnull_fd = _os.open(_os.devnull, _os.O_WRONLY)
    saved_fd2  = _os.dup(2)
    try:
        _os.dup2(devnull_fd, 2)
        yield
    finally:
        _os.dup2(saved_fd2, 2)
        _os.close(saved_fd2)
        _os.close(devnull_fd)


def _detect_gpu() -> tuple[bool, str]:
    """
    Returns (gpu_available: bool, provider_name: str).
    Suppresses the onnxruntime CUDA stderr noise.
    """
    try:
        with _silence_fd2():
            import onnxruntime as _ort
            providers = _ort.get_available_providers()
        if "CUDAExecutionProvider" in providers:
            return True, "CUDAExecutionProvider"
        if "DmlExecutionProvider" in providers:     # Windows DirectML
            return True, "DmlExecutionProvider"
        if "CoreMLExecutionProvider" in providers:  # Apple Silicon
            return True, "CoreMLExecutionProvider"
        return False, "CPUExecutionProvider"
    except Exception:
        return False, "CPUExecutionProvider"


GPU_AVAILABLE, GPU_PROVIDER = _detect_gpu()

if _missing:
    root = tk.Tk()
    root.withdraw()
    messagebox.showerror(
        "Missing Dependencies",
        "The following packages are not installed:\n\n"
        + "\n".join(f"  • {m}" for m in _missing)
        + "\n\nRun in a terminal:\n\n  pip install -r requirements.txt",
    )
    sys.exit(1)

from PIL import Image, ImageTk  # noqa: E402  (already imported above; safe)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
# Config stored outside the install dir so it survives upgrades and works
# on read-only locations (Program Files / macOS .app bundle).
import platform as _platform
if getattr(sys, "frozen", False):
    if _platform.system() == "Darwin":
        _config_dir = Path.home() / "Library" / "Application Support" / "Fritlaegning"
    else:
        _config_dir = Path(os.environ.get("APPDATA", Path.home())) / "Fritlaegning"
    _config_dir.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE = _config_dir / "config.json"
else:
    CONFIG_FILE = Path(__file__).parent / "config.json"

# Camera RAW extensions supported via rawpy
RAW_EXTS = {
    ".cr2", ".cr3",          # Canon
    ".nef", ".nrw",          # Nikon
    ".arw", ".srf", ".sr2",  # Sony
    ".raf",                   # Fujifilm
    ".orf",                   # Olympus
    ".rw2", ".raw",          # Panasonic / generic
    ".pef", ".ptx",          # Pentax
    ".srw",                   # Samsung
    ".dng",                   # Adobe DNG (universal)
    ".3fr",                   # Hasselblad
    ".iiq",                   # Phase One
    ".rwl",                   # Leica
    ".x3f",                   # Sigma
}

MODELS: dict[str, str] = {
    "BiRefNet Portrait  (best for people ★)": "birefnet-portrait",
    "BiRefNet General  (high precision)": "birefnet-general",
    "ISNet General  (good all-rounder)": "isnet-general-use",
    "U2Net Human Seg  (lightweight)": "u2net_human_seg",
    "U2Net  (fastest)": "u2net",
}

# Palette
C_BG        = "#0f0f1a"
C_PANEL     = "#1a1a2e"
C_ACCENT    = "#e63e6d"
C_ACCENT2   = "#4a90d9"
C_TEXT      = "#e8e8f0"
C_DIM       = "#888899"
C_SUCCESS   = "#44cc77"
C_WARNING   = "#ffaa33"
C_ERROR     = "#ff5555"
C_ENTRY     = "#252545"
C_BORDER    = "#333355"


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
class FritlaegningApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("Fritlægning — Background Remover")
        self.root.geometry("1300x800")
        self.root.minsize(1020, 640)
        self.root.configure(bg=C_BG)

        self.images: list[dict] = []
        self.processing = False
        self.stop_requested = False
        self.log_queue: queue.Queue = queue.Queue()
        self.progress_queue: queue.Queue = queue.Queue()

        # preview state — initialised before _build_ui so _clear_preview is safe
        self._preview_img_data: dict | None = None

        self._load_config()
        self._setup_style()
        self._build_ui()
        self._poll_queues()

    # ------------------------------------------------------------------
    # Config
    # ------------------------------------------------------------------
    def _load_config(self) -> None:
        self.config: dict = {
            "output_dir": str(Path.home() / "Desktop"),
            "width": "1000",
            "height": "1000",
            "model": "birefnet-portrait",
            "alpha_matting": False,
            "post_process": True,
            "suffix": "_removed",
            "output_format": "PNG",
            "project": "",
        }
        if CONFIG_FILE.exists():
            try:
                with CONFIG_FILE.open() as fh:
                    self.config.update(json.load(fh))
            except Exception:
                pass

    def _save_config(self) -> None:
        try:
            with CONFIG_FILE.open("w") as fh:
                json.dump(self.config, fh, indent=2)
        except Exception:
            pass

    # ------------------------------------------------------------------
    # Style
    # ------------------------------------------------------------------
    def _setup_style(self) -> None:
        style = ttk.Style()
        style.theme_use("clam")

        style.configure(".", background=C_BG, foreground=C_TEXT,
                        font=("Segoe UI", 10))
        style.configure("TFrame", background=C_BG)
        style.configure("Panel.TFrame", background=C_PANEL)
        style.configure("TLabel", background=C_BG, foreground=C_TEXT)
        style.configure("Panel.TLabel", background=C_PANEL, foreground=C_TEXT)

        style.configure("TProgressbar", troughcolor=C_ENTRY, background=C_ACCENT,
                        bordercolor=C_BORDER, lightcolor=C_ACCENT, darkcolor=C_ACCENT)
        style.configure("TScrollbar", background=C_BORDER, troughcolor=C_ENTRY,
                        arrowcolor=C_DIM, bordercolor=C_BG)

        style.configure("Treeview", background=C_ENTRY, foreground=C_TEXT,
                        fieldbackground=C_ENTRY, bordercolor=C_BORDER,
                        rowheight=26, relief="flat")
        style.configure("Treeview.Heading", background=C_PANEL, foreground=C_DIM,
                        font=("Segoe UI", 9, "bold"), relief="flat")
        style.map("Treeview",
                  background=[("selected", "#2a2a50")],
                  foreground=[("selected", C_TEXT)])

        for name, bg, fg, abg in [
            ("Primary.TButton",   C_ACCENT,   "white",  "#c0304f"),
            ("Secondary.TButton", C_ENTRY,    C_TEXT,   C_BORDER),
            ("Danger.TButton",    "#772233",  C_TEXT,   "#993344"),
        ]:
            style.configure(name, background=bg, foreground=fg,
                            padding=(10, 6), relief="flat", borderwidth=0)
            style.map(name,
                      background=[("active", abg), ("disabled", "#2a2a3a")],
                      foreground=[("disabled", C_DIM)])

        style.configure("TCombobox", fieldbackground=C_ENTRY, foreground=C_TEXT,
                        background=C_PANEL, arrowcolor=C_TEXT,
                        selectbackground=C_ENTRY, selectforeground=C_TEXT)
        style.map("TCombobox",
                  fieldbackground=[("readonly", C_ENTRY)],
                  selectbackground=[("readonly", C_ENTRY)],
                  selectforeground=[("readonly", C_TEXT)])

        style.configure("TCheckbutton", background=C_PANEL, foreground=C_TEXT)
        style.map("TCheckbutton", background=[("active", C_PANEL)])

    # ------------------------------------------------------------------
    # UI Construction
    # ------------------------------------------------------------------
    def _build_ui(self) -> None:
        self.root.rowconfigure(1, weight=1)
        self.root.columnconfigure(0, weight=1)
        self._build_header()
        self._build_main()
        self._build_statusbar()

    def _build_header(self) -> None:
        hdr = tk.Frame(self.root, bg=C_PANEL, pady=10)
        hdr.grid(row=0, column=0, sticky="ew")
        hdr.columnconfigure(1, weight=1)
        tk.Label(hdr, text="✂  Fritlægning", bg=C_PANEL, fg=C_ACCENT,
                 font=("Segoe UI", 18, "bold")).grid(row=0, column=0,
                 padx=18, sticky="w")
        tk.Label(hdr,
                 text="Automatic Background Remover  •  CS2 HUD & Broadcast",
                 bg=C_PANEL, fg=C_DIM,
                 font=("Segoe UI", 10)).grid(row=0, column=1, padx=8, sticky="w")

        if GPU_AVAILABLE:
            if GPU_PROVIDER == "CUDAExecutionProvider":
                gpu_text, gpu_tip = "⚡ CUDA GPU", "NVIDIA CUDA GPU"
            elif GPU_PROVIDER == "DmlExecutionProvider":
                gpu_text, gpu_tip = "⚡ DirectML", "Windows DirectML GPU"
            elif GPU_PROVIDER == "CoreMLExecutionProvider":
                gpu_text, gpu_tip = "⚡ Apple Silicon", "CoreML / Apple Neural Engine"
            else:
                gpu_text, gpu_tip = "⚡ GPU", GPU_PROVIDER
            gpu_color = C_SUCCESS
        else:
            gpu_text  = "○ CPU only"
            gpu_color = C_WARNING
            gpu_tip   = "No GPU acceleration detected"

        gpu_lbl = tk.Label(
            hdr, text=gpu_text,
            bg=C_PANEL, fg=gpu_color,
            font=("Segoe UI", 9, "bold"),
            cursor="question_arrow",
        )
        gpu_lbl.grid(row=0, column=2, padx=(0, 16), sticky="e")

        # Tooltip on hover
        tip_win: list = [None]
        def _show_tip(event):
            tw = tk.Toplevel()
            tw.wm_overrideredirect(True)
            tw.configure(bg=C_BG)
            tk.Label(tw, text=gpu_tip, bg=C_BG, fg=C_TEXT,
                     font=("Segoe UI", 8), padx=8, pady=4).pack()
            tw.wm_geometry(f"+{event.x_root+12}+{event.y_root+18}")
            tip_win[0] = tw
        def _hide_tip(_event):
            if tip_win[0]:
                tip_win[0].destroy()
                tip_win[0] = None
        gpu_lbl.bind("<Enter>", _show_tip)
        gpu_lbl.bind("<Leave>", _hide_tip)

    def _build_main(self) -> None:
        main = tk.Frame(self.root, bg=C_BG)
        main.grid(row=1, column=0, sticky="nsew", padx=10, pady=6)
        main.rowconfigure(0, weight=1)
        main.columnconfigure(0, minsize=370)           # image list
        main.columnconfigure(1, weight=1, minsize=340) # preview
        main.columnconfigure(2, minsize=295)           # settings
        self._build_left(main)
        self._build_center(main)
        self._build_right(main)

    # --- Left: image list + log -------------------------------------------
    def _build_left(self, parent: tk.Frame) -> None:
        left = tk.Frame(parent, bg=C_BG)
        left.grid(row=0, column=0, sticky="nsew", padx=(0, 6))
        left.rowconfigure(1, weight=3)
        left.rowconfigure(3, weight=1)
        left.columnconfigure(0, weight=1)

        # Toolbar — two rows to fit the narrower panel
        tb = tk.Frame(left, bg=C_BG, pady=2)
        tb.grid(row=0, column=0, sticky="ew")
        tb.columnconfigure(0, weight=1)
        row0 = tk.Frame(tb, bg=C_BG)
        row0.grid(row=0, column=0, sticky="ew")
        ttk.Button(row0, text="＋  Add Images", style="Primary.TButton",
                   command=self.add_images).pack(side="left", padx=(0, 4))
        ttk.Button(row0, text="Add Folder", style="Secondary.TButton",
                   command=self.add_folder).pack(side="left")
        row1 = tk.Frame(tb, bg=C_BG)
        row1.grid(row=1, column=0, sticky="ew", pady=(3, 0))
        ttk.Button(row1, text="Remove Selected", style="Secondary.TButton",
                   command=self.remove_selected).pack(side="left", padx=(0, 4))
        ttk.Button(row1, text="Clear All", style="Danger.TButton",
                   command=self.clear_all).pack(side="left")

        # Treeview
        tf = tk.Frame(left, bg=C_BORDER, bd=1)
        tf.grid(row=1, column=0, sticky="nsew", pady=(5, 0))
        tf.rowconfigure(0, weight=1)
        tf.columnconfigure(0, weight=1)

        self.tree = ttk.Treeview(
            tf,
            columns=("file", "size", "crop", "status"),
            show="headings",
            selectmode="extended",
        )
        self.tree.heading("file",   text="File")
        self.tree.heading("size",   text="Size")
        self.tree.heading("crop",   text="Crop")
        self.tree.heading("status", text="Status")
        self.tree.column("file",   width=155, stretch=True)
        self.tree.column("size",   width=85,  stretch=False, anchor="center")
        self.tree.column("crop",   width=58,  stretch=False, anchor="center")
        self.tree.column("status", width=68,  stretch=False, anchor="center")

        vsb = ttk.Scrollbar(tf, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=vsb.set)
        self.tree.grid(row=0, column=0, sticky="nsew")
        vsb.grid(row=0, column=1, sticky="ns")

        self.tree.tag_configure("pending",    foreground=C_DIM)
        self.tree.tag_configure("processing", foreground=C_WARNING)
        self.tree.tag_configure("done",       foreground=C_SUCCESS)
        self.tree.tag_configure("error",      foreground=C_ERROR)
        self.tree.bind("<<TreeviewSelect>>", self._on_tree_select)
        self.tree.bind("<Double-1>", self._rename_selected)

        # Log
        tk.Label(left, text="Processing Log", bg=C_BG, fg=C_DIM,
                 font=("Segoe UI", 9, "bold")).grid(
                 row=2, column=0, sticky="w", pady=(8, 2))

        lf = tk.Frame(left, bg=C_BORDER, bd=1)
        lf.grid(row=3, column=0, sticky="nsew")
        lf.rowconfigure(0, weight=1)
        lf.columnconfigure(0, weight=1)

        self.log_text = tk.Text(
            lf, bg="#0a0a14", fg=C_DIM,
            font=("Consolas", 9), wrap="word",
            state="disabled", height=7,
            insertbackground=C_TEXT, relief="flat", bd=0,
        )
        log_vsb = ttk.Scrollbar(lf, orient="vertical", command=self.log_text.yview)
        self.log_text.configure(yscrollcommand=log_vsb.set)
        self.log_text.grid(row=0, column=0, sticky="nsew", padx=5, pady=4)
        log_vsb.grid(row=0, column=1, sticky="ns")

    # --- Center: preview + crop tool -------------------------------------
    def _build_center(self, parent: tk.Frame) -> None:
        center = tk.Frame(parent, bg=C_BG)
        center.grid(row=0, column=1, sticky="nsew", padx=6)
        center.rowconfigure(1, weight=1)
        center.columnconfigure(0, weight=1)

        # Header row: filename + rotation buttons + clear-crop button
        hdr = tk.Frame(center, bg=C_BG)
        hdr.grid(row=0, column=0, sticky="ew", pady=(0, 4))
        hdr.columnconfigure(0, weight=1)
        self._preview_name_var = tk.StringVar(value="← Select an image to preview")
        tk.Label(hdr, textvariable=self._preview_name_var,
                 bg=C_BG, fg=C_TEXT, font=("Segoe UI", 9, "bold"),
                 anchor="w").grid(row=0, column=0, sticky="w")
        ttk.Button(hdr, text="↺ CCW", style="Secondary.TButton",
                   command=lambda: self._rotate(-90)).grid(
                   row=0, column=1, padx=(6, 2))
        ttk.Button(hdr, text="CW ↻", style="Secondary.TButton",
                   command=lambda: self._rotate(90)).grid(
                   row=0, column=2, padx=(0, 6))
        ttk.Button(hdr, text="✂  Clear Crop", style="Secondary.TButton",
                   command=self._clear_crop).grid(row=0, column=3, padx=(0, 0))

        # Preview canvas
        self._canvas = tk.Canvas(
            center, bg="#0a0a14",
            highlightthickness=1, highlightbackground=C_BORDER,
            cursor="crosshair",
        )
        self._canvas.grid(row=1, column=0, sticky="nsew")

        # Footer: instruction / crop status
        self._crop_info_var = tk.StringVar(
            value="Click on the image to set a crop line  —  everything below is removed")
        tk.Label(center, textvariable=self._crop_info_var,
                 bg=C_BG, fg=C_DIM, font=("Segoe UI", 8),
                 anchor="w").grid(row=2, column=0, sticky="w", pady=(3, 0))

        # Canvas bindings
        self._canvas.bind("<ButtonPress-1>", self._on_canvas_click)
        self._canvas.bind("<B1-Motion>",     self._on_canvas_drag)
        self._canvas.bind("<Configure>",     self._on_canvas_resize)

        # Per-canvas state
        self._preview_source_img: "Image.Image | None" = None
        self._preview_base_photo = None
        self._canvas_img_offset  = (0, 0)  # (x_off, y_off) on canvas
        self._canvas_img_size    = (0, 0)  # (display_w, display_h)
        self._resize_after_id: str | None = None

    # --- Right: settings panel --------------------------------------------
    def _build_right(self, parent: tk.Frame) -> None:
        right = tk.Frame(parent, bg=C_PANEL)
        right.grid(row=0, column=2, sticky="nsew")
        right.columnconfigure(0, weight=1)

        row = 0

        def section(text: str) -> None:
            nonlocal row
            tk.Label(right, text=text, bg=C_PANEL, fg=C_ACCENT,
                     font=("Segoe UI", 9, "bold")).grid(
                     row=row, column=0, sticky="w", padx=14, pady=(14, 3))
            row += 1

        def sep() -> None:
            nonlocal row
            tk.Frame(right, bg=C_BORDER, height=1).grid(
                row=row, column=0, sticky="ew", padx=14, pady=6)
            row += 1

        def label(text: str) -> None:
            nonlocal row
            tk.Label(right, text=text, bg=C_PANEL, fg=C_DIM,
                     font=("Segoe UI", 9)).grid(
                     row=row, column=0, sticky="w", padx=14, pady=(0, 2))
            row += 1

        def entry_row() -> tk.Frame:
            nonlocal row
            f = tk.Frame(right, bg=C_PANEL)
            f.grid(row=row, column=0, sticky="ew", padx=14)
            f.columnconfigure(0, weight=1)
            row += 1
            return f

        # ---- Output Folder ----
        section("OUTPUT SETTINGS")
        label("Base Output Folder")
        df = entry_row()
        self.output_dir_var = tk.StringVar(value=self.config["output_dir"])
        tk.Entry(df, textvariable=self.output_dir_var,
                 bg=C_ENTRY, fg=C_TEXT, insertbackground=C_TEXT,
                 relief="flat", bd=4, font=("Segoe UI", 9)).grid(
                 row=0, column=0, sticky="ew", ipady=5)
        ttk.Button(df, text="…", style="Secondary.TButton",
                   command=self.browse_output, width=3).grid(
                   row=0, column=1, padx=(4, 0))

        label("Project / Subfolder  (leave blank to use base folder)")
        pf = entry_row()
        self.project_var = tk.StringVar(value=self.config.get("project", ""))
        tk.Entry(pf, textvariable=self.project_var,
                 bg=C_ENTRY, fg=C_TEXT, insertbackground=C_TEXT,
                 relief="flat", bd=4, font=("Segoe UI", 10)).grid(
                 row=0, column=0, sticky="ew", ipady=5)

        # Live path preview
        self._path_preview = tk.Label(
            right, text="", bg=C_PANEL, fg=C_ACCENT2,
            font=("Segoe UI", 8), anchor="w", wraplength=258,
        )
        self._path_preview.grid(row=row, column=0, sticky="w", padx=14, pady=(2, 0))
        row += 1

        def _update_preview(*_):
            base = self.output_dir_var.get().strip()
            proj = self.project_var.get().strip()
            if proj:
                preview = str(Path(base) / proj) if base else proj
            else:
                preview = base or "—"
            self._path_preview.config(text=f"→ {preview}")

        self.output_dir_var.trace_add("write", _update_preview)
        self.project_var.trace_add("write", _update_preview)
        _update_preview()

        # ---- Dimensions ----
        sep()
        label("Canvas Size  (subject fits inside, centered)")
        df2 = entry_row()
        self.width_var  = tk.StringVar(value=self.config["width"])
        self.height_var = tk.StringVar(value=self.config["height"])
        vcmd = (self.root.register(lambda v: v.isdigit() or v == ""), "%P")

        tk.Entry(df2, textvariable=self.width_var, width=7,
                 bg=C_ENTRY, fg=C_TEXT, insertbackground=C_TEXT,
                 relief="flat", bd=4, font=("Segoe UI", 11),
                 justify="center", validate="key",
                 validatecommand=vcmd).pack(side="left", ipady=6)
        tk.Label(df2, text="×", bg=C_PANEL, fg=C_DIM,
                 font=("Segoe UI", 14)).pack(side="left", padx=8)
        tk.Entry(df2, textvariable=self.height_var, width=7,
                 bg=C_ENTRY, fg=C_TEXT, insertbackground=C_TEXT,
                 relief="flat", bd=4, font=("Segoe UI", 11),
                 justify="center", validate="key",
                 validatecommand=vcmd).pack(side="left", ipady=6)
        tk.Label(df2, text="px", bg=C_PANEL, fg=C_DIM,
                 font=("Segoe UI", 9)).pack(side="left", padx=(8, 0))

        nonlocal_row_ref = [row]
        tk.Label(right,
                 text="Aspect ratio is preserved — transparent padding fills gaps.",
                 bg=C_PANEL, fg=C_DIM, font=("Segoe UI", 8)).grid(
                 row=nonlocal_row_ref[0], column=0,
                 sticky="w", padx=14, pady=(3, 0))
        row += 1

        # ---- Output Suffix + Format ----
        sep()
        label("Output Filename Suffix  &  Format")
        se = entry_row()
        self.suffix_var = tk.StringVar(value=self.config.get("suffix", "_removed"))
        tk.Entry(se, textvariable=self.suffix_var, width=14,
                 bg=C_ENTRY, fg=C_TEXT, insertbackground=C_TEXT,
                 relief="flat", bd=4, font=("Segoe UI", 10)).pack(
                 side="left", ipady=5)
        tk.Label(se, text=".", bg=C_PANEL, fg=C_DIM,
                 font=("Segoe UI", 11, "bold")).pack(side="left", padx=(6, 0))
        self.format_var = tk.StringVar(
            value=self.config.get("output_format", "PNG"))
        ttk.Combobox(
            se, textvariable=self.format_var,
            values=["PNG", "JPEG", "WEBP", "TIFF", "BMP"],
            state="readonly", width=7,
        ).pack(side="left", padx=(2, 0), ipady=3)

        # Note: JPEG does not support transparency — alpha will be composited
        # onto white. PNG/WEBP/TIFF preserve transparency.
        self._fmt_note = tk.Label(
            right,
            text="PNG · WebP · TIFF preserve transparency",
            bg=C_PANEL, fg=C_DIM, font=("Segoe UI", 8),
        )
        self._fmt_note.grid(row=row, column=0, sticky="w", padx=14, pady=(2, 0))
        row += 1

        def _on_format_change(*_):
            fmt = self.format_var.get()
            if fmt in ("JPEG", "BMP"):
                self._fmt_note.config(
                    text=f"⚠ {fmt} has no transparency — background becomes white",
                    fg=C_WARNING)
            else:
                self._fmt_note.config(
                    text="PNG · WebP · TIFF preserve transparency",
                    fg=C_DIM)
        self.format_var.trace_add("write", _on_format_change)
        _on_format_change()

        # ---- AI Model ----
        sep()
        section("PROCESSING")
        label("AI Model")
        model_names = list(MODELS.keys())
        default_model = next(
            (k for k, v in MODELS.items() if v == self.config.get("model")),
            model_names[0],
        )
        self.model_var = tk.StringVar(value=default_model)
        cb = ttk.Combobox(right, textvariable=self.model_var,
                          values=model_names, state="readonly")
        cb.grid(row=row, column=0, sticky="ew", padx=14, ipady=4)
        row += 1

        # ---- Options ----
        self.alpha_matting_var = tk.BooleanVar(
            value=self.config.get("alpha_matting", False))
        self.post_process_var = tk.BooleanVar(
            value=self.config.get("post_process", True))

        ttk.Checkbutton(right, text="Alpha matting  (better hair & fine edges)",
                        variable=self.alpha_matting_var).grid(
                        row=row, column=0, sticky="w", padx=14, pady=(8, 2))
        row += 1
        ttk.Checkbutton(right, text="Post-process mask  (fill holes)",
                        variable=self.post_process_var).grid(
                        row=row, column=0, sticky="w", padx=14, pady=(0, 4))
        row += 1

        # ---- Buttons ----
        sep()
        self.process_btn = ttk.Button(
            right, text="▶   Process All Images",
            style="Primary.TButton", command=self.start_processing)
        self.process_btn.grid(row=row, column=0, sticky="ew",
                              padx=14, pady=(0, 5))
        row += 1

        self.stop_btn = ttk.Button(
            right, text="■   Stop",
            style="Danger.TButton", command=self.stop_processing,
            state="disabled")
        self.stop_btn.grid(row=row, column=0, sticky="ew", padx=14)
        row += 1

        # Progress
        self.progress_var = tk.DoubleVar(value=0)
        ttk.Progressbar(right, variable=self.progress_var,
                        maximum=100).grid(row=row, column=0, sticky="ew",
                                          padx=14, pady=(10, 3))
        row += 1
        self.progress_label = tk.Label(right, text="Ready",
                                       bg=C_PANEL, fg=C_DIM,
                                       font=("Segoe UI", 9))
        self.progress_label.grid(row=row, column=0, sticky="w", padx=14)
        row += 1

        sep()
        ttk.Button(right, text="Open Output Folder",
                   style="Secondary.TButton",
                   command=self.open_output_folder).grid(
                   row=row, column=0, sticky="ew", padx=14)
        row += 1

    def _build_statusbar(self) -> None:
        self.statusbar = tk.Label(
            self.root,
            text="Ready — add images to begin",
            bg=C_PANEL, fg=C_DIM,
            font=("Segoe UI", 9), anchor="w", pady=4, padx=12,
        )
        self.statusbar.grid(row=2, column=0, sticky="ew")

    # ------------------------------------------------------------------
    # Image List Actions
    # ------------------------------------------------------------------
    def add_images(self) -> None:
        raw_glob = " ".join(
            f"*{e}" for e in sorted(RAW_EXTS)
        ) if HAS_RAWPY else ""
        image_glob = "*.png *.jpg *.jpeg *.bmp *.tiff *.tif *.webp *.gif"
        combined = (image_glob + " " + raw_glob).strip()
        filetypes = [
            ("Image files", combined),
        ]
        if HAS_RAWPY:
            filetypes.append(("Camera RAW", raw_glob))
        filetypes.append(("All files", "*.*"))
        files = filedialog.askopenfilenames(
            title="Select Images",
            filetypes=filetypes,
        )
        self._add_paths(files)

    def add_folder(self) -> None:
        folder = filedialog.askdirectory(title="Select Folder with Images")
        if not folder:
            return
        exts = {".png", ".jpg", ".jpeg", ".bmp",
                ".tiff", ".tif", ".webp", ".gif"}
        if HAS_RAWPY:
            exts |= RAW_EXTS
        files = sorted(
            str(p) for p in Path(folder).iterdir()
            if p.suffix.lower() in exts
        )
        self._add_paths(files)

    def _add_paths(self, files) -> None:
        existing = {img["path"] for img in self.images}
        added = 0
        for f in files:
            if f in existing:
                continue
            try:
                dims = _read_dims(f)
            except Exception:
                dims = "unknown"
            entry = {"path": f, "status": "Pending", "dims": dims,
                     "crop_y": None, "rotation": 0, "label": ""}
            self.images.append(entry)
            self.tree.insert(
                "", "end", iid=f,
                values=(Path(f).name, dims, "—", "Pending"),
                tags=("pending",),
            )
            added += 1
        pending = sum(1 for i in self.images if i["status"] == "Pending")
        self._set_status(
            f"Added {added} image(s).  {len(self.images)} total "
            f"({pending} pending)."
        )

    def remove_selected(self) -> None:
        removed = set(self.tree.selection())
        for iid in removed:
            self.tree.delete(iid)
            self.images = [i for i in self.images if i["path"] != iid]
        if self._preview_img_data and self._preview_img_data["path"] in removed:
            self._clear_preview()
        self._set_status(f"{len(self.images)} image(s) in list.")

    def clear_all(self) -> None:
        if self.processing:
            messagebox.showwarning("Busy", "Stop processing before clearing.")
            return
        self.tree.delete(*self.tree.get_children())
        self.images.clear()
        self._clear_preview()
        self._set_status("Cleared.")

    def _rename_selected(self, event=None) -> None:
        """Double-click handler — lets the user set a player name / output stem."""
        # Identify the row under the cursor (may differ from keyboard selection)
        if event:
            row = self.tree.identify_row(event.y)
            if row:
                self.tree.selection_set(row)
        sel = self.tree.selection()
        if not sel:
            return
        iid = sel[0]
        img_data = next((i for i in self.images if i["path"] == iid), None)
        if not img_data:
            return
        current = img_data.get("label") or ""
        new_label = simpledialog.askstring(
            "Omdøb / Spillernavn",
            f"Outputnavn for:\n{Path(iid).name}\n"
            "(lad feltet stå tomt for at bruge det originale filnavn)",
            initialvalue=current,
            parent=self.root,
        )
        if new_label is None:  # user pressed Cancel
            return
        new_label = new_label.strip()
        img_data["label"] = new_label
        # Refresh the file-name column
        vals = list(self.tree.item(iid, "values"))
        vals[0] = new_label if new_label else Path(iid).name
        self.tree.item(iid, values=vals)
        # Refresh the preview header if this image is currently shown
        if self._preview_img_data is img_data:
            self._preview_name_var.set(new_label if new_label else Path(iid).name)

    # ------------------------------------------------------------------
    # Preview & per-image crop
    # ------------------------------------------------------------------
    def _on_tree_select(self, _event=None) -> None:
        sel = self.tree.selection()
        if not sel:
            return
        iid = sel[0]
        img_data = next((i for i in self.images if i["path"] == iid), None)
        if not img_data or img_data is self._preview_img_data:
            return
        self._preview_img_data = img_data
        display = img_data.get("label") or Path(iid).name
        self._preview_name_var.set(display)
        self._crop_info_var.set("Loading preview…")
        self._canvas.delete("all")
        threading.Thread(
            target=self._load_preview_bg, args=(img_data,), daemon=True
        ).start()

    def _load_preview_bg(self, img_data: dict) -> None:
        path = img_data["path"]
        try:
            img = _load_preview_image(path)
            self.root.after(0, lambda: self._show_preview(img_data, img))
        except Exception as exc:
            self.root.after(0, lambda: self._crop_info_var.set(f"Preview failed: {exc}"))

    def _show_preview(self, img_data: dict, img: "Image.Image") -> None:
        if self._preview_img_data is not img_data:
            return  # selection changed while loading
        self._preview_source_img = img
        self._redraw_preview()

    def _redraw_preview(self) -> None:
        if not self._preview_source_img:
            return
        canvas = self._canvas
        cw = canvas.winfo_width()
        ch = canvas.winfo_height()
        if cw < 10 or ch < 10:
            return

        # Apply rotation for display
        rotation = (self._preview_img_data or {}).get("rotation", 0)
        img = self._preview_source_img
        if rotation:
            img = img.rotate(-rotation, expand=True)  # PIL: +ve = CCW, so negate

        iw, ih = img.size
        scale = min(cw / iw, ch / ih)
        dw = max(1, round(iw * scale))
        dh = max(1, round(ih * scale))
        x_off = (cw - dw) // 2
        y_off = (ch - dh) // 2
        self._canvas_img_offset = (x_off, y_off)
        self._canvas_img_size   = (dw, dh)

        # Composite scaled image onto dark background
        bg = Image.new("RGB", (cw, ch), (10, 10, 20))
        display = img.resize((dw, dh), Image.LANCZOS)
        if display.mode == "RGBA":
            bg.paste(display, (x_off, y_off), display.split()[3])
        else:
            bg.paste(display.convert("RGB"), (x_off, y_off))

        self._preview_base_photo = ImageTk.PhotoImage(bg)
        canvas.delete("all")
        canvas.create_image(0, 0, anchor="nw", image=self._preview_base_photo)
        self._draw_crop_overlay()

    def _draw_crop_overlay(self) -> None:
        """Redraw only the crop line + shade using fast canvas primitives."""
        canvas = self._canvas
        canvas.delete("crop")
        if not self._preview_img_data:
            return
        crop_y = self._preview_img_data.get("crop_y")
        if crop_y is None:
            self._crop_info_var.set(
                "Click on the image to set a crop line  —  everything below is removed")
            return
        x_off, y_off = self._canvas_img_offset
        dw, dh       = self._canvas_img_size
        cy = y_off + round(crop_y * dh)

        # Stipple shade over the discarded (below-crop) area
        canvas.create_rectangle(
            x_off, cy, x_off + dw, y_off + dh,
            fill="black", stipple="gray50", outline="", tags="crop")
        # Crop line
        canvas.create_line(
            x_off, cy, x_off + dw, cy,
            fill=C_ACCENT, width=2, tags="crop")
        # Pill handle in the centre of the line
        mx = x_off + dw // 2
        canvas.create_rectangle(
            mx - 32, cy - 10, mx + 32, cy + 10,
            fill=C_ACCENT, outline="", tags="crop")
        canvas.create_text(
            mx, cy, text=f"✂  {int(crop_y * 100)}%",
            fill="white", font=("Segoe UI", 8, "bold"), tags="crop")

        self._crop_info_var.set(
            f"✂  Top {int(crop_y * 100)}% of image will be processed  "
            f"—  drag line to adjust")

    def _canvas_to_crop_frac(self, canvas_y: int) -> "float | None":
        """Canvas y-coordinate → image fraction [0.05, 0.98]."""
        _x, y_off = self._canvas_img_offset
        _dw, dh   = self._canvas_img_size
        if dh == 0:
            return None
        return max(0.05, min(0.98, (canvas_y - y_off) / dh))

    def _on_canvas_click(self, event) -> None:
        if not self._preview_img_data or not self._preview_source_img:
            return
        frac = self._canvas_to_crop_frac(event.y)
        if frac is None:
            return
        self._preview_img_data["crop_y"] = frac
        self._draw_crop_overlay()
        self._update_crop_column(self._preview_img_data["path"])

    def _on_canvas_drag(self, event) -> None:
        if not self._preview_img_data or not self._preview_source_img:
            return
        frac = self._canvas_to_crop_frac(event.y)
        if frac is None:
            return
        self._preview_img_data["crop_y"] = frac
        self._draw_crop_overlay()
        self._update_crop_column(self._preview_img_data["path"])

    def _on_canvas_resize(self, _event=None) -> None:
        if self._resize_after_id:
            self.root.after_cancel(self._resize_after_id)
        self._resize_after_id = self.root.after(40, self._redraw_preview)

    def _rotate(self, degrees: int) -> None:
        """Rotate the current image by +90 (CW) or -90 (CCW) degrees."""
        if not self._preview_img_data:
            return
        current = self._preview_img_data.get("rotation", 0)
        self._preview_img_data["rotation"] = (current + degrees) % 360
        self._redraw_preview()
        self._update_crop_column(self._preview_img_data["path"])

    def _clear_crop(self) -> None:
        if not self._preview_img_data:
            return
        self._preview_img_data["crop_y"] = None
        self._draw_crop_overlay()
        self._update_crop_column(self._preview_img_data["path"])

    def _clear_preview(self) -> None:
        self._preview_img_data = None
        if hasattr(self, "_preview_source_img"):
            self._preview_source_img = None
        if hasattr(self, "_canvas"):
            self._canvas.delete("all")
        if hasattr(self, "_preview_name_var"):
            self._preview_name_var.set("← Select an image to preview")
        if hasattr(self, "_crop_info_var"):
            self._crop_info_var.set(
                "Click on the image to set a crop line  —  everything below is removed")

    def _update_crop_column(self, iid: str) -> None:
        """Refresh the Crop column cell for one treeview row."""
        try:
            img_data = next(i for i in self.images if i["path"] == iid)
            vals = list(self.tree.item(iid, "values"))
            crop_y  = img_data.get("crop_y")
            rot     = img_data.get("rotation", 0)
            parts = []
            if rot:
                parts.append(f"↻{rot}°")
            if crop_y is not None:
                parts.append(f"✂{int(crop_y * 100)}%")
            if len(vals) >= 4:
                vals[2] = " ".join(parts) if parts else "—"
                self.tree.item(iid, values=vals)
        except (StopIteration, tk.TclError):
            pass

    def _effective_out_dir(self) -> str:
        """Returns base_dir/project if project is set, else base_dir."""
        base = self.output_dir_var.get().strip()
        proj = self.project_var.get().strip()
        if proj:
            return str(Path(base) / proj)
        return base

    def browse_output(self) -> None:
        folder = filedialog.askdirectory(title="Select Base Output Folder")
        if folder:
            self.output_dir_var.set(folder)

    def open_output_folder(self) -> None:
        folder = self._effective_out_dir()
        try:
            if not os.path.isdir(folder):
                os.makedirs(folder, exist_ok=True)
            import subprocess, platform as _plat
            if _plat.system() == "Darwin":
                subprocess.run(["open", folder], check=False)
            elif _plat.system() == "Windows":
                os.startfile(folder)
            else:
                subprocess.run(["xdg-open", folder], check=False)
        except Exception:
            messagebox.showerror("Not Found", f"Could not open folder:\n{folder}")

    # ------------------------------------------------------------------
    # Processing
    # ------------------------------------------------------------------
    def start_processing(self) -> None:
        if self.processing:
            return
        if not self.images:
            messagebox.showinfo("No Images", "Add images to the list first.")
            return

        # Validate dimensions
        try:
            w = int(self.width_var.get())
            h = int(self.height_var.get())
            if w <= 0 or h <= 0:
                raise ValueError
        except (ValueError, TypeError):
            messagebox.showerror(
                "Invalid Dimensions",
                "Width and height must be positive integers.",
            )
            return

        out_dir = self._effective_out_dir()
        if not out_dir:
            messagebox.showerror("No Output Folder",
                                 "Select an output folder first.")
            return

        os.makedirs(out_dir, exist_ok=True)

        # Persist config
        self.config.update({
            "output_dir": self.output_dir_var.get().strip(),
            "project": self.project_var.get().strip(),
            "width": str(w),
            "height": str(h),
            "model": MODELS[self.model_var.get()],
            "alpha_matting": self.alpha_matting_var.get(),
            "post_process": self.post_process_var.get(),
            "suffix": self.suffix_var.get(),
            "output_format": self.format_var.get(),
        })
        self._save_config()

        self.processing = True
        self.stop_requested = False
        self.process_btn.config(state="disabled")
        self.stop_btn.config(state="normal")
        self.progress_var.set(0)

        threading.Thread(target=self._worker, daemon=True).start()

    def stop_processing(self) -> None:
        self.stop_requested = True
        self._log("⚠ Stop requested — finishing current image…")

    # --- Worker (background thread) --------------------------------------
    def _worker(self) -> None:
        try:
            self._run_batch()
        except Exception as exc:
            self.log_queue.put(f"FATAL ERROR: {exc}")
        finally:
            self.progress_queue.put(("done", None))

    def _run_batch(self) -> None:
        from rembg import remove, new_session

        model_key  = MODELS[self.model_var.get()]
        alpha      = self.alpha_matting_var.get()
        post       = self.post_process_var.get()
        out_w      = int(self.width_var.get())
        out_h      = int(self.height_var.get())
        out_dir    = self._effective_out_dir()
        suffix     = self.suffix_var.get()
        fmt        = self.format_var.get().upper()   # PNG / JPEG / WEBP / TIFF / BMP
        ext        = ".jpg" if fmt == "JPEG" else f".{fmt.lower()}"

        self.log_queue.put(f"Loading model: {model_key} …")
        with _silence_fd2():
            session = new_session(model_key)
        provider = GPU_PROVIDER if GPU_AVAILABLE else "CPUExecutionProvider"
        provider_short = (
            "CUDA GPU"    if "CUDA"    in provider
            else "DirectML GPU" if "Dml"     in provider
            else "Apple CoreML" if "CoreML" in provider
            else "CPU"
        )
        self.log_queue.put(f"Model ready. Running on: {provider_short}")
        self.log_queue.put(f"Processing {len(self.images)} image(s)…")

        pending = [img for img in self.images if img["status"] != "Done"]
        total = len(pending)

        for idx, img_data in enumerate(pending):
            if self.stop_requested:
                self.log_queue.put("Stopped by user.")
                break

            path = img_data["path"]
            name = Path(path).name
            self.progress_queue.put(
                ("progress", (idx, total, f"[{idx+1}/{total}] {name}"))
            )
            self._tree_status(path, "Processing…", "processing")
            self.log_queue.put(f"[{idx+1}/{total}] {name}")

            try:
                # Load image — use rawpy for camera RAW, PIL for everything else
                input_img = _load_image(path)

                # Apply rotation
                rotation = img_data.get("rotation", 0)
                if rotation:
                    input_img = input_img.rotate(-rotation, expand=True)
                    self.log_queue.put(f"    ↻ Rotation: {rotation}°")

                # Apply per-image bottom crop if the user set one in the preview
                crop_y = img_data.get("crop_y")
                if crop_y is not None:
                    iw, ih = input_img.size
                    crop_h = max(1, int(ih * crop_y))
                    input_img = input_img.crop((0, 0, iw, crop_h))
                    self.log_queue.put(f"    ✂ Crop: top {int(crop_y * 100)}% kept")

                # rembg.remove() expects bytes, so serialise to in-memory PNG.
                buf = io.BytesIO()
                input_img.save(buf, format="PNG")
                input_bytes = buf.getvalue()

                kwargs: dict = {
                    "session": session,
                    "alpha_matting": alpha,
                    "post_process_mask": post,
                }
                if alpha:
                    kwargs["alpha_matting_foreground_threshold"] = 240
                    kwargs["alpha_matting_background_threshold"] = 10
                    kwargs["alpha_matting_erode_size"] = 10

                out_bytes = remove(input_bytes, **kwargs)
                result = Image.open(io.BytesIO(out_bytes)).convert("RGBA")
                final = _smart_fit(result, out_w, out_h)

                # Flatten alpha to white for formats that don't support it
                if fmt in ("JPEG", "BMP"):
                    bg_img = Image.new("RGB", final.size, (255, 255, 255))
                    bg_img.paste(final, mask=final.split()[3])
                    save_img = bg_img
                else:
                    save_img = final

                stem = img_data.get("label") or Path(path).stem
                out_name = stem + suffix + ext
                out_path = os.path.join(out_dir, out_name)
                save_kwargs: dict = {}
                if fmt == "JPEG":
                    save_kwargs["quality"] = 95
                    save_kwargs["subsampling"] = 0
                elif fmt == "WEBP":
                    save_kwargs["quality"] = 95
                    save_kwargs["lossless"] = False
                save_img.save(out_path, fmt, **save_kwargs)

                img_data["status"] = "Done"
                img_data["output"] = out_path
                self._tree_status(path, "✓ Done", "done")
                self.log_queue.put(f"    → {out_name}")

            except Exception as exc:
                img_data["status"] = "Error"
                self._tree_status(path, "✗ Error", "error")
                self.log_queue.put(f"    ERROR: {exc}")

        done_n = sum(1 for i in self.images if i["status"] == "Done")
        self.log_queue.put(
            f"\nFinished. {done_n} / {len(self.images)} saved to:\n{out_dir}"
        )
        self.progress_queue.put(("progress", (total, total, "Complete")))

    # ------------------------------------------------------------------
    # Thread-safe tree update
    # ------------------------------------------------------------------
    def _tree_status(self, iid: str, text: str, tag: str) -> None:
        def _update():
            try:
                vals = list(self.tree.item(iid, "values"))
                if len(vals) >= 4:
                    vals[3] = text
                    self.tree.item(iid, values=vals, tags=(tag,))
            except tk.TclError:
                pass
        self.root.after(0, _update)

    # ------------------------------------------------------------------
    # Queue polling (runs in main thread via after())
    # ------------------------------------------------------------------
    def _poll_queues(self) -> None:
        # Drain log queue
        try:
            while True:
                msg = self.log_queue.get_nowait()
                self._append_log(msg)
        except queue.Empty:
            pass

        # Drain progress queue
        try:
            while True:
                kind, data = self.progress_queue.get_nowait()
                if kind == "progress":
                    done, total, msg = data
                    pct = (done / total * 100) if total > 0 else 0
                    self.progress_var.set(pct)
                    self.progress_label.config(text=msg)
                    self._set_status(msg)
                elif kind == "done":
                    self.processing = False
                    self.process_btn.config(state="normal")
                    self.stop_btn.config(state="disabled")
                    self._set_status("Finished — check the output folder.")
        except queue.Empty:
            pass

        self.root.after(80, self._poll_queues)

    def _append_log(self, text: str) -> None:
        self.log_text.config(state="normal")
        self.log_text.insert("end", text + "\n")
        self.log_text.see("end")
        self.log_text.config(state="disabled")

    def _set_status(self, text: str) -> None:
        self.statusbar.config(text=text)


# ---------------------------------------------------------------------------
# Utility: fast preview loader (thumbnail, uses embedded RAW thumbnails)
# ---------------------------------------------------------------------------
def _load_preview_image(path: str) -> "Image.Image":
    """Load a fast preview (max 2048 px). Uses embedded JPEG thumbnail for RAW."""
    from PIL import ImageOps
    MAX = 2048
    if Path(path).suffix.lower() in RAW_EXTS and HAS_RAWPY:
        import rawpy
        try:
            with rawpy.imread(path) as raw:
                thumb = raw.extract_thumb()
                if thumb.format == rawpy.ThumbFormat.JPEG:
                    img = Image.open(io.BytesIO(thumb.data))
                    img = ImageOps.exif_transpose(img)  # honour EXIF rotation
                    img = img.convert("RGBA")
                else:
                    img = Image.fromarray(thumb.data).convert("RGBA")
            img.thumbnail((MAX, MAX), Image.LANCZOS)
            return img
        except Exception:
            pass  # fall through to full decode
    img = _load_image(path)
    img.thumbnail((MAX, MAX), Image.LANCZOS)
    return img


# ---------------------------------------------------------------------------
# Utility: load an image from any supported format (incl. camera RAW)
# ---------------------------------------------------------------------------
def _load_image(path: str) -> "Image.Image":
    """Return a PIL RGBA Image from either a standard image or a camera RAW file."""
    from PIL import ImageOps
    if Path(path).suffix.lower() in RAW_EXTS:
        if not HAS_RAWPY:
            raise RuntimeError(
                f"rawpy is not installed — cannot read RAW file: {path}\n"
                "Run: pip install rawpy"
            )
        import rawpy
        with rawpy.imread(path) as raw_file:
            rgb_array = raw_file.postprocess(
                use_camera_wb=True,
                output_bps=8,
            )
        return Image.fromarray(rgb_array).convert("RGBA")
    # For standard images: honour EXIF orientation tag
    img = Image.open(path)
    img = ImageOps.exif_transpose(img)
    return img.convert("RGBA")


def _read_dims(path: str) -> str:
    """Return a 'W × H' string for the image at *path* (supports RAW)."""
    if Path(path).suffix.lower() in RAW_EXTS and HAS_RAWPY:
        import rawpy
        with rawpy.imread(path) as raw_file:
            h, w = raw_file.raw_image.shape[:2]
        return f"{w} × {h}"
    with Image.open(path) as im:
        return f"{im.width} × {im.height}"


# ---------------------------------------------------------------------------
# Utility: scale-to-fit + center on transparent canvas
# ---------------------------------------------------------------------------
def _smart_fit(img: "Image.Image", target_w: int, target_h: int) -> "Image.Image":
    """
    Scale `img` so it fits entirely within (target_w × target_h).
    Aspect ratio is preserved.  Transparent padding fills the remaining area.
    The subject is cropped of its transparent border first, then centered.

    Example:
        Input   4359 × 1239  →  fits inside 1000 × 1000
        Scale   min(1000/4359, 1000/1239) = 0.806  →  1000 × 807? No:
                actually min(0.2294, 0.8071) = 0.2294
                →  new size 1000 × 284, centred in 1000 × 1000 canvas.
    """
    # 1. Crop transparent border so the algorithm works on the actual subject
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)

    orig_w, orig_h = img.size
    if orig_w == 0 or orig_h == 0:
        return Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))

    # 2. Compute uniform scale to fit inside canvas
    scale = min(target_w / orig_w, target_h / orig_h)
    new_w = max(1, round(orig_w * scale))
    new_h = max(1, round(orig_h * scale))

    # 3. High-quality down/up-scale
    resized = img.resize((new_w, new_h), Image.LANCZOS)

    # 4. Center on transparent canvas
    canvas = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
    x_off = (target_w - new_w) // 2
    y_off = (target_h - new_h) // 2
    canvas.paste(resized, (x_off, y_off), resized)

    return canvas


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def main() -> None:
    root = tk.Tk()
    FritlaegningApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
