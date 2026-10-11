#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
# Una sesión de cliente WSL activa evita que systemd/Docker se apaguen por inactividad.
while [[ -f .local/affiliates-wsl.running ]]; do sleep 5; done
