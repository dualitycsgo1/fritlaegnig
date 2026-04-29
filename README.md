# Fritlaegning

Automatic background remover for CS2 HUD and broadcast player images.

Built with Python, [rembg](https://github.com/danielgatis/rembg), and Tkinter. Supports GPU-accelerated inference via ONNX Runtime (CUDA 12) with automatic CPU fallback.

---

## Features

- Remove backgrounds from player images with a single click
- GPU acceleration via CUDA 12 (falls back to CPU if no NVIDIA GPU is detected)
- Supports standard image formats and camera RAW files
- Standalone installer — no Python or dependencies required for end users

---

## Download

Pre-built installers are available in [`installer_output/`](installer_output/):

| Platform | File |
|----------|------|
| Windows  | `Fritlaegning-1.0-Setup.exe` |
| Windows  | `Fritlaegning-1.0-Setup.zip` |

---

## Building from Source

### Windows

**Prerequisites:** Python 3.x on PATH, [Inno Setup](https://jrsoftware.org/isinfo.php) for the installer.

```bat
build.bat
```

This installs dependencies, runs PyInstaller, and produces `dist\Fritlaegning\`.

To build the installer, compile `installer.iss` with Inno Setup.

### macOS

**Prerequisites:** Python 3.11 or 3.12 (arm64), Xcode Command Line Tools.

```bash
bash build_mac.sh
```

Produces a self-contained `Fritlaegning-1.0.pkg` installer.

---

## Running from Source

```bash
pip install -r requirements.txt
python app.py
```

---

## Requirements

See [`requirements.txt`](requirements.txt) for the full list. Key dependencies:

- `rembg` — background removal
- `Pillow` — image processing
- `onnxruntime-gpu` — GPU inference (CUDA 12)
- `rawpy` — camera RAW support (optional)
