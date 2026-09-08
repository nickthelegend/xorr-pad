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
HERE="$(cd "$(dirname "$0")" && pwd)"
# Both the block pin and the state cache are written, so they cannot live next
# to the script inside an installed .app — that directory is not writable. The
# desk app points these at its userData directory; a source checkout keeps them
# beside the script as before.
PINFILE="${FORK_PIN:-$HERE/.fork-block}"
mkdir -p "$(dirname "$PINFILE")"

# Reuse the block this fork was last started at.
#
# Forking at the live head every time made --state worthless: the cached
# account and storage slots belong to the OLD block, so every restart began
# cold against a rate-limited upstream and the first trades stalled. That is
# not a hypothetical — it failed seven checks in one run, all of them
# cascading from "the Base node stalled and /portfolio returned 503".
#
# So pin to the recorded block and keep the cache. Delete .fork-block (or set
# FORK_BLOCK) to deliberately move to a newer one.
if [ -n "${FORK_BLOCK:-}" ]; then
  BLOCK="$FORK_BLOCK"
elif [ -s "$PINFILE" ]; then
  BLOCK="$(cat "$PINFILE")"
  echo "reusing pinned block $BLOCK from $(basename "$PINFILE") — the --state cache matches it"
else
  BLOCK="$(curl -s -m 20 -X POST -H 'content-type: application/json' \
    --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' "$UPSTREAM" \
    | python3 -c 'import json,sys;print(int(json.load(sys.stdin)["result"],16))')"
fi
printf '%s' "$BLOCK" > "$PINFILE"
# Persist the fetched state. Without this every restart re-fetches every
# account and storage slot from the upstream, and a rate-limited upstream turns
# that into balance reads that time out mid-session. With it, the second run
# starts warm and barely touches the network.
STATE="${FORK_STATE:-$(cd "$(dirname "$0")" && pwd)/.fork-state.json}"
echo "forking $UPSTREAM at block $BLOCK  (state: $STATE)"
# --retries / --timeout / --fork-retry-backoff: be patient with the upstream
# rather than giving up on it. A free public RPC rate-limits under a burst — two
# concurrent swaps are enough — and anvil's default impatience turned that into
# a node that stopped answering for the rest of the session. Waiting is cheap;
# a wedged fork mid-demo is not.
exec anvil --fork-url "$UPSTREAM" --fork-block-number "$BLOCK" \
  --port 8545 --silent --compute-units-per-second 330 \
  --retries 10 --timeout 45000 --fork-retry-backoff 1000 \
  --state "$STATE" --state-interval 30
