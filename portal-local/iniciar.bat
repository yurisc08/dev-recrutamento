@echo off
chcp 65001 >nul
title Portal de Decisoes - nao feche esta janela
cd /d "%~dp0"

rem Procura o Node: primeiro o portatil que voce colocou na pasta "node",
rem depois um Node ja instalado na maquina.
set "NODE_EXE=%~dp0node\node.exe"
if not exist "%NODE_EXE%" (
  for %%i in (node.exe) do set "NODE_EXE=%%~$PATH:i"
)

if not defined NODE_EXE goto sem_node
if "%NODE_EXE%"=="" goto sem_node
if not exist "%NODE_EXE%" goto sem_node

"%NODE_EXE%" --no-warnings servidor\index.mjs
echo.
echo O portal foi encerrado.
pause
exit /b

:sem_node
echo.
echo ============================================================
echo   Nao encontrei o Node.js nesta pasta nem no computador.
echo ============================================================
echo.
echo   1) Baixe em https://nodejs.org/en/download
echo      Escolha: Windows / x64 / formato ZIP  (nao precisa instalar)
echo   2) Abra o ZIP e copie o arquivo node.exe
echo   3) Cole dentro da pasta "node" que esta aqui do lado
echo   4) De dois cliques neste arquivo de novo
echo.
pause
