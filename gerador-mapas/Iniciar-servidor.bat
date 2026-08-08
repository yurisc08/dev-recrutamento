@echo off
rem Sobe o Gerador de Mapas de Carreira nesta maquina.
rem Para liberar na rede local, use Iniciar-servidor-rede.bat
setlocal
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (
    py servidor.py %*
    goto fim
)

where python >nul 2>nul
if %errorlevel%==0 (
    python servidor.py %*
    goto fim
)

echo.
echo Python nao foi encontrado nesta maquina.
echo.
echo Para uso individual nao e preciso servidor: abra o arquivo
echo Gerador_Mapas_Carreira.html com duplo clique.
echo.
echo Para instalar o Python: https://www.python.org/downloads/
echo Marque a opcao "Add Python to PATH" durante a instalacao.
echo.

:fim
pause
