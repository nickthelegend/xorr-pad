#!/usr/bin/env bash
# Start the Base mainnet fork the pad trades against.
#
# The upstream is not interchangeable, and picking the wrong one looks like an
# app bug rather than an infrastructure one:
#
# Twelve keyless endpoints were measured against THIS pinned block on
# 2026-09-09 — archive reads, then bursts of 50/150/300 concurrent ones,
# because burst archive traffic is exactly what anvil produces and exactly what
# wedges it. Latency on eth_blockNumber discriminates nothing and was ignored.
#
#   mainnet.base.org         archive OK. 429s under a synthetic 300-deep burst,
#                            but that burst is not a load this app produces —
#                            anvil is throttled to 330 CU/s. On the real
#                            workload (test/stress.mjs, 30 swaps, warm, same
#                            state cache) it was the FASTEST and had the best
#                            tail: 41.1s total, slowest swap 4,693ms.
#   base-mainnet.public.blastapi.io  archive OK, and the only endpoint with
#                            zero 429s at any burst depth — but on the real
#                            workload it was slower with a far worse tail:
#                            44.1s, slowest swap 11,740ms. Kept as the first
#                            fallback precisely because its failure mode under
#                            pathological load is the gentle one.
#   gateway.tenderly.co      archive OK, 143x 429 at depth 300. Third choice.
#
# The burst ranking and the workload ranking DISAGREE, and the workload wins:
# ordering these by burst survival made the demo slower. That is why the list
# below is not sorted by the burst numbers.
#   base.drpc.org            archive OK but 429s at depth 40 already.
#   base-rpc.publicnode.com  403 "Archive requests require a personal token" —
#                            and anvil PANICS on that, so the node dies
#                            mid-session and every balance read starts failing.
#   base.meowrpc.com / base.api.onfinality.io   429 on the first archive read.
#   llamarpc 525 · blockpi 521 · omniatech 521 · subquery unreachable.
#
# The real change here is not the order — it is that there IS a list. A single
# hardcoded upstream meant an endpoint having a bad day produced a fork that
# came up sick and looked like an app bug, with the first symptom arriving at
# the first trade. Now each candidate must prove it will serve state at the
# pinned block before anvil is handed to it.
#
# Pinning the block keeps anvil from chasing the head and lets it cache what it
# has already fetched.
set -euo pipefail
# FORK_RPC is tried first but is NOT exempt from the probe. An endpoint named
# explicitly and silently unable to serve the pinned block is the worst case of
# all: it looks deliberate and fails at the first trade.
CANDIDATES=(
  "https://mainnet.base.org"
  "https://base-mainnet.public.blastapi.io"
  "https://gateway.tenderly.co/public/base"
)
# One JSON-RPC call. Prints the raw `result` on success, nothing on failure.
rpc() { # rpc <url> <method> <params-json>
  curl -s -m 12 -X POST -H 'content-type: application/json' \
    --data "{\"jsonrpc\":\"2.0\",\"method\":\"$2\",\"params\":$3,\"id\":1}" "$1" \
    | python3 -c 'import json,sys
try:
  j=json.load(sys.stdin)
except Exception:
  sys.exit(1)
if "result" not in j: sys.exit(1)
print(j["result"])' 2>/dev/null
}

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
  # No pin yet, so ask for the head — from whichever candidate answers first.
  BLOCK=""
  for c in "${FORK_RPC:-}" "${CANDIDATES[@]}"; do
    [ -z "$c" ] && continue
    hex="$(rpc "$c" eth_blockNumber '[]')" || true
    if [ -n "${hex:-}" ]; then BLOCK="$((hex))"; break; fi
  done
  [ -n "$BLOCK" ] || { echo "fork: no upstream answered eth_blockNumber" >&2; exit 1; }
fi
printf '%s' "$BLOCK" > "$PINFILE"
# Persist the fetched state. Without this every restart re-fetches every
# account and storage slot from the upstream, and a rate-limited upstream turns
# that into balance reads that time out mid-session. With it, the second run
# starts warm and barely touches the network.
# Pick the upstream by asking each candidate for historical state AT the block
# we are about to fork. An endpoint that answers eth_blockNumber but refuses
# archive reads is worse than useless here: anvil panics on the 403 and the
# node dies mid-session. That failure is invisible until the first trade, so
# it is worth one round trip at boot to rule out.
BLOCKHEX="$(printf '0x%x' "$BLOCK")"
USDC="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
# Not slot 0. A pruning node can still have the first slot of a popular token
# hot while refusing the rest of that block's state, and probing the one slot
# most likely to be cached is how you certify an endpoint that cannot do the
# job. This is an arbitrary mapping slot nothing keeps warm.
#
# It is a STORAGE SLOT KEY, not a private key. It is meant to be meaningless:
# nothing has ever written to it, so every healthy archive node returns 32
# zero bytes and an unhealthy one errors, which is exactly the signal wanted.
SLOT="0x5c1e2d3a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f6"
UPSTREAM=""
# Built with single-quoted segments, not backslash-escaped quotes. Inside a
# command substitution the braces of an escaped-quote JSON object are not
# actually quoted, so bash BRACE-EXPANDS {"to":..,"data":..} into two separate
# arguments and the probe silently calls a malformed eth_call — which every
# endpoint then rejects, making a healthy upstream look broken.
STOR_PARAMS='["'"$USDC"'","'"$SLOT"'","'"$BLOCKHEX"'"]'
CALL_PARAMS='[{"to":"'"$USDC"'","data":"0x313ce567"},"'"$BLOCKHEX"'"]'
for c in "${FORK_RPC:-}" "${CANDIDATES[@]}"; do
  [ -z "$c" ] && continue
  # Both, because anvil does both: raw historical storage AND historical calls.
  if [ -n "$(rpc "$c" eth_getStorageAt "$STOR_PARAMS")" ] \
  && [ -n "$(rpc "$c" eth_call "$CALL_PARAMS")" ]; then
    UPSTREAM="$c"; break
  fi
  echo "fork: ${c##*://} will not serve state at block $BLOCK — trying the next"
done
[ -n "$UPSTREAM" ] || { echo "fork: no upstream serves archive state at block $BLOCK" >&2; exit 1; }

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
