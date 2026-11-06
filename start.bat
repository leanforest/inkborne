@echo off
setlocal
cd /d "%~dp0"

python -c "import sys; sys.exit(sys.version_info.major != 3)" >nul 2>&1
if not errorlevel 1 (
    python tools\serve.py spike 5173 --open
    goto :done
)

py -3 -c "import sys" >nul 2>&1
if not errorlevel 1 (
    py -3 tools\serve.py spike 5173 --open
    goto :done
)

echo Python 3 is required. Install Python 3 and run this script again.
pause
exit /b 1

:done
if errorlevel 1 (
    echo Server failed to start or stopped with an error.
    pause
    exit /b 1
)
endlocal
