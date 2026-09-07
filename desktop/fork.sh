#!/usr/bin/env bash
# Start the Base mainnet fork the pad trades against.
#
# The upstream is not interchangeable, and picking the wrong one looks like an
# app bug rather than an infrastructure one:
#
#   base-rpc.publicnode.com  fast on recent state, but answers archive reads
#                            with HTTP 403 "Archive requests require a personal
#                            token" — and anvil PANICS on that, so the node dies
#                            mid-session and every balance read starts failing.
#   base.llamarpc.com        525.
#   mainnet.base.org         serves archive, rate-limits hard. Workable when
#                            anvil's own request rate is throttled below the
#                            limit, which is what --compute-units-per-second
#                            does here.
#
# Pinning the block keeps anvil from chasing the head and lets it cache what it
# has already fetched.
set -euo pipefail
UPSTREAM="${FORK_RPC:-https://mainnet.base.org}"
BLOCK="${FORK_BLOCK:-$(curl -s -m 20 -X POST -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' "$UPSTREAM" \
  | python3 -c 'import json,sys;print(int(json.load(sys.stdin)["result"],16))')}"
echo "forking $UPSTREAM at block $BLOCK"
exec anvil --fork-url "$UPSTREAM" --fork-block-number "$BLOCK" \
  --port 8545 --silent --compute-units-per-second 330
