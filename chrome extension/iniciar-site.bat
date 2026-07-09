@echo off
REM ---------------------------------------------------------
REM iniciar-site.bat
REM Sobe o site (shopee-saas-site) em http://localhost:5500
REM usando o servidor HTTP embutido do Python.
REM
REM Por que isso é necessário: a integração com a extensão usa
REM chrome.runtime.sendMessage, que só funciona com o site
REM servido por http:// ou https:// — abrir o index.html direto
REM (duplo clique, endereço file://) NÃO funciona.
REM ---------------------------------------------------------

echo.
echo Iniciando o site em http://localhost:5500
echo Deixe esta janela aberta enquanto estiver testando.
echo Para parar, feche esta janela ou pressione Ctrl+C.
echo.

cd /d "%~dp0"

python -m http.server 5500

if errorlevel 1 (
    echo.
    echo ERRO: nao foi possivel iniciar com "python".
    echo Tente com "python3":
    echo.
    python3 -m http.server 5500
)

pause
