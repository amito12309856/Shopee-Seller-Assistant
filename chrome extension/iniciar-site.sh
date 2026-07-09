#!/bin/bash
# ---------------------------------------------------------
# iniciar-site.sh
# Sobe o site (shopee-saas-site) em http://localhost:5500
# usando o servidor HTTP embutido do Python.
#
# Por que isso é necessário: a integração com a extensão usa
# chrome.runtime.sendMessage, que só funciona com o site
# servido por http:// ou https:// — abrir o index.html direto
# (endereço file://) NÃO funciona.
# ---------------------------------------------------------

cd "$(dirname "$0")"

echo ""
echo "Iniciando o site em http://localhost:5500"
echo "Deixe este terminal aberto enquanto estiver testando."
echo "Para parar, pressione Ctrl+C."
echo ""

if command -v python3 &> /dev/null; then
  python3 -m http.server 5500
elif command -v python &> /dev/null; then
  python -m http.server 5500
else
  echo "ERRO: Python não encontrado. Instale o Python ou use outro servidor estático."
  exit 1
fi
