#!/usr/bin/env bash
# Boot the desk backend against the Base fork with real credentials.
set -a; [ -f ../backend/.env ] && . ../backend/.env; set +a
export CHAIN_MODE=${CHAIN_MODE:-fork}
export SIBYL_DB=${SIBYL_DB:-/tmp/xorrpad-server.db}
export PAD_TOKEN=${PAD_TOKEN:-xorrpad-dev}
exec node main/server.mjs
