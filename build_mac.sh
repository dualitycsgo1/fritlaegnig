#!/usr/bin/env bash
# =============================================================
#  Fritlægning — macOS .pkg builder
#
#  *** RUN THIS ONCE ON YOUR OWN MAC (developer machine) ***
#
#  What this script does:
#    1. Installs Python dependencies on YOUR machine
#    2. Runs PyInstaller — bundles Python + all libs into a
#       self-contained Fritlaegning.app (no Python needed by users)
#    3. Wraps the .app in a standard macOS .pkg installer
#
#  What the end user receives:
#    Fritlaegning-1.0.pkg  — they double-click it, click Install,
#    done. No Python, no pip, no dependencies needed whatsoever.
#
#  Prerequisites (developer machine only):
#    • Python 3.11 or 3.12 arm64  →  https://www.python.org/downloads/macos/
#    • Xcode Command Line Tools   →  xcode-select --install
# =============================================================
set -euo pipefail

APP_NAME="Fritlaegning"
APP_DISPLAY="Fritlægning"
VERSION="1.0"
BUNDLE_ID="com.duality.fritlaegning"
PKG_NAME="${APP_NAME}-${VERSION}.pkg"

echo "============================================================"
echo " ${APP_DISPLAY} — Developer Build Script"
echo " Output: ${PKG_NAME}  (distribute this to end users)"
echo "============================================================"
echo ""

# ------------------------------------------------------------------
# Phase 1 — Build the self-contained .app on the developer's machine
# ------------------------------------------------------------------

if ! command -v python3 &>/dev/null; then
    echo "ERROR: python3 not found on this machine."
    echo "Install the arm64 build from https://www.python.org/downloads/macos/"
    exit 1
fi

echo "Python: $(python3 --version)"
echo ""
echo "[1/5] Installing dependencies (developer machine only)..."
arch -arm64 python3 -m pip install -r requirements_mac.txt --quiet --upgrade

# Verify scipy's C extensions are loadable — if not, the bundle will be broken at runtime
echo "       Verifying scipy..."
if ! python3 -c "import scipy; import scipy.ndimage; import scipy.special" 2>/dev/null; then
    echo "       scipy C extensions cannot be imported. Attempting auto-fix..."
    # libomp (OpenMP) is commonly missing and required by scipy on Apple Silicon
    if command -v brew &>/dev/null; then
        echo "       Installing libomp via Homebrew..."
        brew install libomp 2>/dev/null || true
    fi
    arch -arm64 python3 -m pip install scipy --force-reinstall --quiet
    if ! python3 -c "import scipy; import scipy.ndimage; import scipy.special" 2>/dev/null; then
        echo ""
        echo "ERROR: scipy is still broken after reinstall."
        echo ""
        echo "Fix manually:"
        echo "  brew install libomp"
        echo "  arch -arm64 python3 -m pip install scipy --force-reinstall"
        echo "Then re-run this script."
        exit 1
    fi
    echo "       scipy fixed OK"
else
    echo "       scipy OK"
fi

echo "[2/5] Installing PyInstaller (developer machine only)..."
arch -arm64 python3 -m pip install "pyinstaller>=6.0" --quiet --upgrade

echo "[3/5] Cleaning previous build artefacts..."
rm -rf "dist/${APP_NAME}" "dist/${APP_NAME}.app" "build/${APP_NAME}" \
       pkg_root pkg_scripts "${PKG_NAME}"

echo "[4/5] Running PyInstaller — bundling Python + all libs into .app..."
python3 -m PyInstaller fritlaegning_mac.spec --noconfirm

echo ""
echo "  ✓  dist/${APP_NAME}.app is fully self-contained."
echo "     End users need nothing installed to run it."
echo ""

# ------------------------------------------------------------------
# Phase 2 — Wrap the .app in a macOS .pkg installer
# ------------------------------------------------------------------
echo "[5/5] Building .pkg installer..."

# Payload root — mirrors the install destination
mkdir -p pkg_root/Applications
cp -R "dist/${APP_NAME}.app" pkg_root/Applications/

# Postinstall script: fix permissions + remove quarantine flag
# (without this, Gatekeeper may block the app on first launch)
mkdir -p pkg_scripts
cat > pkg_scripts/postinstall << 'POSTINSTALL'
#!/usr/bin/env bash
chmod -R 755 "/Applications/Fritlaegning.app"
xattr -rd com.apple.quarantine "/Applications/Fritlaegning.app" 2>/dev/null || true
exit 0
POSTINSTALL
chmod +x pkg_scripts/postinstall

# Build component package
pkgbuild \
    --root pkg_root \
    --install-location "/" \
    --scripts pkg_scripts \
    --identifier "${BUNDLE_ID}" \
    --version "${VERSION}" \
    "${APP_NAME}-component.pkg"

# Wrap in a product archive with welcome/licence/conclusion pages
DIST_XML="$(mktemp /tmp/fritlaegning_dist_XXXXXX.xml)"
cat > "${DIST_XML}" << DISTXML
<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="2">
    <title>${APP_DISPLAY}</title>
    <welcome    file="welcome.html"    mime-type="text/html" />
    <license    file="license.txt"     mime-type="text/plain" />
    <conclusion file="conclusion.html" mime-type="text/html" />
    <options customize="never" require-scripts="false" rootVolumeOnly="false" />
    <domains enable_anywhere="false" enable_currentUserHome="true" enable_localSystem="true"/>
    <pkg-ref id="${BUNDLE_ID}"><bundle-version /></pkg-ref>
    <choices-outline>
        <line choice="default"><line choice="${BUNDLE_ID}" /></line>
    </choices-outline>
    <choice id="default" />
    <choice id="${BUNDLE_ID}" visible="false">
        <pkg-ref id="${BUNDLE_ID}" />
    </choice>
    <pkg-ref id="${BUNDLE_ID}" version="${VERSION}" onConclusion="none">${APP_NAME}-component.pkg</pkg-ref>
</installer-gui-script>
DISTXML

productbuild \
    --distribution "${DIST_XML}" \
    --package-path . \
    --resources pkg_resources \
    "${PKG_NAME}"

rm -f "${DIST_XML}"

# Tidy up intermediates
rm -rf pkg_root pkg_scripts "${APP_NAME}-component.pkg"

echo ""
echo "============================================================"
echo " SUCCESS"
echo ""
echo " Distribute this file to end users:"
echo "   ${PKG_NAME}"
echo ""
echo " End users just double-click it — no Python, no pip,"
echo " no dependencies needed. Works on any Apple Silicon Mac"
echo " running macOS 12 (Monterey) or later."
echo ""
echo " NOTE: AI models (~150 MB) download automatically on the"
echo " user's first run. Internet required for that step only."
echo "============================================================"

