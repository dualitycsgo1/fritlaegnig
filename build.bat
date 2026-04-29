@echo off
setlocal EnableDelayedExpansion
title Fritlaegning — Build

echo ============================================================
echo  Fritlaegning — PyInstaller Build Script
echo ============================================================
echo.

:: Verify Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: python not found on PATH.
    echo Make sure Python 3.x is installed and on your PATH.
    pause & exit /b 1
)

echo [1/4] Installing / upgrading dependencies...
python -m pip install -r requirements.txt --quiet --upgrade
if errorlevel 1 ( echo WARN: pip install returned errors — continuing... )

echo [2/4] Installing PyInstaller...
python -m pip install pyinstaller>=6.0 --quiet --upgrade
if errorlevel 1 ( echo ERROR: Could not install PyInstaller. & pause & exit /b 1 )

echo [3/4] Cleaning previous build...
if exist "dist\Fritlaegning"  rmdir /s /q "dist\Fritlaegning"
if exist "build\Fritlaegning" rmdir /s /q "build\Fritlaegning"

echo [4/4] Running PyInstaller...
python -m PyInstaller fritlaegning.spec --noconfirm
if errorlevel 1 (
    echo.
    echo BUILD FAILED — see errors above.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo  Build complete!
echo  Output folder: dist\Fritlaegning\
echo.
echo  To create a Windows installer (.exe):
echo    1. Download and install Inno Setup from:
echo       https://jrsoftware.org/isdl.php
echo    2. Open installer.iss in Inno Setup
echo    3. Press Ctrl+F9 (Build) to compile the installer
echo ============================================================
echo.
pause
