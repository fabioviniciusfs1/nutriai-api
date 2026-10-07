#!/usr/bin/env bash
# Gera e envia ao Docker Hub as imagens de produção e o compose (docker-compose.prod.yml).
# Uso: npm run release -- [api] [front] [caddy]   (sem argumentos: api)
# Depois, na VPS: ./update.sh
set -euo pipefail
cd "$(dirname "$0")/.."

services=("$@")
[ ${#services[@]} -eq 0 ] && services=(api)
for s in "${services[@]}"; do
  case "$s" in
    api | front | caddy) ;;
    *) echo "Serviço desconhecido: $s (use api, front ou caddy)" >&2; exit 1 ;;
  esac
done

# O API_DOMAIN vai para o JavaScript do front; as outras duas só precisam existir para o compose aceitar o arquivo
# (os valores reais ficam no .env da VPS).
export API_DOMAIN="${API_DOMAIN:-nutriai.duckdns.org}"
export POSTGRES_PASSWORD=build JWT_SECRET=build

if [[ " ${services[*]} " == *" api "* ]]; then
  echo "==> Lint e testes da API"
  npm run lint
  npm test
fi
if [[ " ${services[*]} " == *" front "* ]]; then
  echo "==> Lint do front"
  (cd ../nutriai-front && npm run lint)
fi

compose=(docker compose -f docker-compose.prod.yml)
echo "==> Build: ${services[*]} (API_DOMAIN=$API_DOMAIN)"
"${compose[@]}" build "${services[@]}"
echo "==> Push: ${services[*]}"
"${compose[@]}" push "${services[@]}"
echo "==> Publicando o compose"
"${compose[@]}" publish -y fabioviniciusfsiqueira/nutriai-stack:latest

echo "Pronto. Na VPS: cd ~/nutriai && ./update.sh"
