@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Run Setup.cmd first.
  pause
  exit /b 1
)
if not exist "dist\index.html" (
  call npm.cmd run build
  if errorlevel 1 exit /b 1
)
".venv\Scripts\python.exe" headset\server.py --open %*
pause
