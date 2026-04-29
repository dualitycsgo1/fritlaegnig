# -*- mode: python ; coding: utf-8 -*-
#
# PyInstaller spec for Fritlægning — macOS Apple Silicon (arm64)
# Run from Terminal:
#   python -m PyInstaller fritlaegning_mac.spec
#
from PyInstaller.utils.hooks import collect_all, collect_data_files

block_cipher = None

rembg_d, rembg_b, rembg_h = collect_all("rembg")
ort_d,   ort_b,   ort_h   = collect_all("onnxruntime")
pil_d,   pil_b,   pil_h   = collect_all("PIL")
pooch_d, pooch_b, pooch_h = collect_all("pooch")
file_d,  file_b,  file_h  = collect_all("filetype")
scipy_d, scipy_b, scipy_h = collect_all("scipy")
pymat_d, pymat_b, pymat_h = collect_all("pymatting")
a = Analysis(
    ["app.py"],
    pathex=[],
    binaries=rembg_b + ort_b + pil_b + pooch_b + file_b + scipy_b + pymat_b,
    datas=rembg_d + ort_d + pil_d + pooch_d + file_d + scipy_d + pymat_d,
    hiddenimports=[
        "tkinter",
        "tkinter.ttk",
        "tkinter.filedialog",
        "tkinter.messagebox",
        "tkinter.simpledialog",
        "_tkinter",
        "rawpy",
        "numpy",
        "PIL._tkinter_finder",
        "filetype",
        "scipy",
        "scipy.ndimage",
        "scipy.special",
        "scipy.special._cdflib",
        "requests",
        "urllib3",
        "certifi",
        "tqdm",
        "onnxruntime.capi._pybind_state",
    ] + rembg_h + ort_h + pil_h + pooch_h + file_h + scipy_h + pymat_h,
    hookspath=[],
    runtime_hooks=[],
    excludes=[
        "matplotlib", "pandas", "IPython", "jupyter",
        "sphinx", "setuptools",
    ],
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="Fritlaegning",
    debug=False,
    strip=False,
    upx=False,        # UPX is not reliable on macOS arm64
    console=False,
    target_arch="arm64",  # Apple Silicon; change to "x86_64" for Intel Mac
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    name="Fritlaegning",
)

# Wrap in a proper macOS .app bundle
app = BUNDLE(
    coll,
    name="Fritlaegning.app",
    # icon="icon.icns",   # uncomment and add icon.icns for a custom Dock icon
    bundle_identifier="com.duality.fritlaegning",
    info_plist={
        "CFBundleDisplayName": "Fritlægning",
        "CFBundleShortVersionString": "1.0",
        "NSHighResolutionCapable": True,
        "LSMinimumSystemVersion": "12.0",
        # Allow CoreML to use the Neural Engine
        "com.apple.security.cs.allow-jit": True,
    },
)
