@echo off
cd /d "%~dp0"
dotnet build -c Release -o bin > build.log 2>&1
if errorlevel 1 (
  echo BUILD_FAILED
  type build.log
  pause
  exit /b 1
)
bin\BeyondDecoder.exe DecoderArgs.txt DecoderOutput.txt
echo.
echo DONE: see DecoderOutput.txt
pause
