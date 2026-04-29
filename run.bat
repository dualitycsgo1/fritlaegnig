@echo off
title Fritlægning — Background Remover

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found. Install from https://www.python.org
    pause
    exit /b 1
)

:: Install / upgrade dependencies silently if needed
echo Checking dependencies...
pip install -r "%~dp0requirements.txt" --quiet --upgrade

echo Starting Fritlægning...
python "%~dp0app.py"

if errorlevel 1 (
    echo.
    echo The application crashed. See error above.
    pause
)
