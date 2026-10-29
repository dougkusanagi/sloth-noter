@echo off
setlocal
cd /d "%~dp0"
if errorlevel 1 goto :erro

set "REVISAO_ANTES="
for /f "delims=" %%R in ('git rev-parse --verify HEAD') do set "REVISAO_ANTES=%%R"
if not defined REVISAO_ANTES goto :erro

echo Atualizando o projeto...
git pull
if errorlevel 1 goto :erro

set "REVISAO_DEPOIS="
for /f "delims=" %%R in ('git rev-parse --verify HEAD') do set "REVISAO_DEPOIS=%%R"
if not defined REVISAO_DEPOIS goto :erro
if "%REVISAO_ANTES%"=="%REVISAO_DEPOIS%" goto :sem_atualizacao

echo Atualizando o aplicativo desktop...
call bun run desktop:update
if errorlevel 1 goto :erro

echo Atualizacao concluida.
pause
exit /b 0

:sem_atualizacao
echo.
echo Nenhuma atualizacao disponivel. Fechando em 5 segundos...
timeout /t 5 /nobreak >nul
exit /b 0

:erro
echo.
echo A atualizacao falhou. Confira a mensagem acima.
pause
exit /b 1
