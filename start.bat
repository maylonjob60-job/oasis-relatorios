@echo off
title Oasis Relatorios
chcp 65001 >nul 2>&1
echo.
echo  ============================================================
echo   OASIS RELATORIOS - Centro de Treinamento e Saude
echo  ============================================================
echo.

cd /d "%~dp0"

:: ── Verificar Node.js ────────────────────────────────────────────────
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  [ERRO] Node.js nao foi encontrado neste computador.
    echo.
    echo  Para instalar o Node.js:
    echo    1. Abra o navegador e acesse: https://nodejs.org
    echo    2. Clique em "LTS" (versao recomendada)
    echo    3. Baixe e instale o arquivo .msi
    echo    4. Reinicie o computador apos a instalacao
    echo    5. Execute este arquivo novamente
    echo.
    echo  Versao minima necessaria: Node.js 16
    echo.
    pause
    exit /b 1
)

:: ── Verificar versao minima (16) ─────────────────────────────────────
for /f "tokens=1 delims=v." %%i in ('node --version 2^>nul') do set NODE_MAJOR=%%i
for /f "tokens=2 delims=v." %%i in ('node --version 2^>nul') do set NODE_MAJOR=%%i
node -e "var v=parseInt(process.version.slice(1));if(v<16){process.exit(1)}" >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  [AVISO] Versao do Node.js desatualizada.
    echo  Versao instalada:
    node --version
    echo  Versao minima necessaria: 16
    echo  Acesse https://nodejs.org para atualizar.
    echo.
    pause
    exit /b 1
)

:: ── Instalar dependencias se necessario ──────────────────────────────
if not exist "node_modules" (
    echo  Primeira execucao: instalando dependencias...
    echo  (Aguarde, pode levar alguns minutos)
    echo.
    npm install
    if %errorlevel% neq 0 (
        echo.
        echo  [ERRO] Falha ao instalar dependencias.
        echo  Verifique sua conexao com a internet e tente novamente.
        echo.
        pause
        exit /b 1
    )
    echo.
    echo  Dependencias instaladas com sucesso!
    echo.
)

:: ── Iniciar servidor ─────────────────────────────────────────────────
echo  Sistema iniciando...
echo  Abrindo navegador em http://localhost:3000
echo.
echo  Para parar o servidor: pressione Ctrl+C nesta janela
echo  ============================================================
echo.

:: Aguarda 2 segundos antes de abrir o navegador (para o servidor inicializar)
start "" /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"

node server.js

echo.
echo  Servidor encerrado.
pause
