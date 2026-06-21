@echo off
chcp 65001 >nul
setlocal

echo ================================================
echo   Blue Video Web - Instalacao para Windows
echo ================================================

where node >nul 2>nul
if errorlevel 1 (
  echo ERRO: Node.js nao foi encontrado.
  echo Instale uma versao LTS do Node.js e execute novamente.
  pause
  exit /b 1
)

echo.
echo [1/3] Instalando ou atualizando yt-dlp...
winget install --exact --id yt-dlp.yt-dlp --accept-source-agreements --accept-package-agreements

echo.
echo [2/3] Instalando ou atualizando FFmpeg...
winget install --exact --id yt-dlp.FFmpeg --accept-source-agreements --accept-package-agreements

echo.
echo [3/3] Instalando pacotes Node.js...
call npm install
if errorlevel 1 (
  echo ERRO: npm install falhou.
  pause
  exit /b 1
)

echo.
echo Instalacao concluida.
echo Feche e abra novamente o terminal antes de iniciar, caso as ferramentas nao sejam encontradas.
pause
