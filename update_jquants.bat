@echo off
setlocal EnableExtensions
chcp 65001 >nul
set "PYTHONUTF8=1"

cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -Command "[Console]::OutputEncoding=[Text.Encoding]::UTF8; $text=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('Si1RdWFudHPjg4fjg7zjgr/mm7TmlrDjgpLplovlp4vjgZfjgb7jgZk=')); Write-Host $text"
if errorlevel 1 echo J-Quants data update start
echo Project: %CD%
echo.

set "PYTHON_CMD="

where py >nul 2>nul
if not errorlevel 1 set "PYTHON_CMD=py"

if not defined PYTHON_CMD (
    where python >nul 2>nul
    if not errorlevel 1 set "PYTHON_CMD=python"
)

if not defined PYTHON_CMD (
    echo [ERROR] py or python command was not found.
    echo Install Python, or check your PATH.
    echo First setup example:
    echo   py -m pip install -r requirements.txt
    set "SCRIPT_EXIT=1"
    goto after_run
)

echo Python command: %PYTHON_CMD%
echo.

"%PYTHON_CMD%" scripts\fetch_jquants_daily_input.py
set "SCRIPT_EXIT=%ERRORLEVEL%"

echo.
if "%SCRIPT_EXIT%"=="0" (
    echo [SUCCESS] J-Quants data update completed.
) else (
    echo [ERROR] J-Quants data update failed. Exit code: %SCRIPT_EXIT%
    echo Check the error message above.
)

:after_run
echo.
if exist "data\daily_input_jquants.csv" (
    for %%F in ("data\daily_input_jquants.csv") do (
        echo [CHECK] data\daily_input_jquants.csv exists.
        echo         Updated: %%~tF
        echo         Size: %%~zF bytes
    )
) else (
    echo [WARN] data\daily_input_jquants.csv was not found.
)

echo.
choice /c YN /n /m "Open data folder in Explorer? [Y/N]: "
if errorlevel 2 goto end
if errorlevel 1 explorer "%CD%\data"

:end
echo.
pause
exit /b %SCRIPT_EXIT%
