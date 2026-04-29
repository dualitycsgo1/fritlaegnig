# -*- mode: python ; coding: utf-8 -*-
#
# PyInstaller spec file for Fritlægning
# Run:  python -m PyInstaller fritlaegning.spec
#
from PyInstaller.utils.hooks import collect_all, collect_data_files

block_cipher = None

# Collect everything from packages that use dynamic/plugin imports
rembg_d,  rembg_b,  rembg_h  = collect_all("rembg")
ort_d,    ort_b,    ort_h    = collect_all("onnxruntime")
pil_d,    pil_b,    pil_h    = collect_all("PIL")
pooch_d,  pooch_b,  pooch_h  = collect_all("pooch")
file_d,   file_b,   file_h   = collect_all("filetype")
scipy_d,  scipy_b,  scipy_h  = collect_all("scipy")
pymat_d,  pymat_b,  pymat_h  = collect_all("pymatting")

a = Analysis(
    ["app.py"],
    pathex=[],
    binaries=rembg_b + ort_b + pil_b + pooch_b + file_b + scipy_b + pymat_b,
    datas=rembg_d + ort_d + pil_d + pooch_d + file_d + scipy_d + pymat_d,
    hiddenimports=[
        # tkinter
        "tkinter",
        "tkinter.ttk",
        "tkinter.filedialog",
        "tkinter.messagebox",
        "tkinter.simpledialog",
        "_tkinter",
        # image libraries
        "rawpy",
        "numpy",
        "PIL._tkinter_finder",
        # rembg dependencies
        "filetype",
        "watchdog",
        "scipy",
        "scipy.ndimage",
        "scipy.special",
        "scipy.special._cdflib",
        # networking (rembg model download)
        "requests",
        "urllib3",
        "certifi",
        "tqdm",
        # onnxruntime providers
        "onnxruntime.capi._pybind_state",
    ] + rembg_h + ort_h + pil_h + pooch_h + file_h + scipy_h + pymat_h,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Keep the bundle lean — nothing in the app uses these
        "matplotlib", "pandas", "IPython", "jupyter",
        "sphinx", "setuptools", "pkg_resources._vendor",
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
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,           # no terminal window — GUI only
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    # icon="icon.ico",       # uncomment and add icon.ico to use a custom icon
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="Fritlaegning",
)
