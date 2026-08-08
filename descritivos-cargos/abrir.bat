@echo off
chcp 65001 >nul
title Descritivos de Cargos
cd /d "%~dp0"

echo.
echo   Descritivos de Cargos
echo   =====================
echo.

where node >nul 2>nul
if errorlevel 1 goto sem_node

echo   Iniciando o servidor...
echo   Deixe esta janela aberta enquanto estiver usando.
echo.
echo   Nesta maquina:   http://localhost:3000
echo   Na rede local:   use o IP desta maquina na porta 3000 (ipconfig)
echo.
echo   Para parar: feche esta janela ou pressione Ctrl+C.
echo.

start "" http://localhost:3000
node build.js
node server.js
goto fim

:sem_node
echo   O Node.js nao foi encontrado neste computador.
echo.
echo   Sem ele da para testar assim mesmo: vou abrir o index.html direto.
echo   Nesse modo o preenchido pode se perder ao recarregar a pagina.
echo.
echo   Para guardar os dados e usar entre varias pessoas, instale o Node.js
echo   em https://nodejs.org (versao LTS) e rode este atalho de novo.
echo.
pause
start "" "%~dp0index.html"

:fim
