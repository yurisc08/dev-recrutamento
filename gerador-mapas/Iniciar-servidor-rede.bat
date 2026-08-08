@echo off
rem Sobe o servidor liberado para a rede local.
rem Outras maquinas acessam pelo IP mostrado na tela.
setlocal
cd /d "%~dp0"
call "%~dp0Iniciar-servidor.bat" --rede
