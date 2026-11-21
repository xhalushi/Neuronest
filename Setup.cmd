@echo off
setlocal
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe (
  py -3.12 -m venv .venv
  if errorlevel 1 exit /b 1
)
call npm.cmd install
if errorlevel 1 exit /b 1
".venv\Scripts\python.exe" -m pip install -r headset\requirements.txt
if errorlevel 1 exit /b 1
call npm.cmd run build
if errorlevel 1 exit /b 1
echo Setup complete. Open Start Neuronest.cmd for the headset or Start Demo.cmd for manual control.
pause
