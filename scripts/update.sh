#!/usr/bin/env bash
# Atualiza o NutriAI na VPS com as imagens do Docker Hub. Fica na pasta do .env (~/nutriai).
# Uso: ./update.sh           baixa as imagens novas e recria os containers que mudaram
#      ./update.sh --seed    também reaplica a semente (plano base, sugestões, nutrientes)
set -euo pipefail
cd "$(dirname "$0")"

compose=(docker compose -p nutriai -f oci://docker.io/fabioviniciusfsiqueira/nutriai-stack:latest)

"${compose[@]}" pull
"${compose[@]}" up -d
if [ "${1:-}" = "--seed" ]; then
  "${compose[@]}" exec api node dist/database/cli.js seed
  "${compose[@]}" restart api
fi
docker image prune -f
"${compose[@]}" ps
