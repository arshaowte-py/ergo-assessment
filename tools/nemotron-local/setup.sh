#!/usr/bin/env bash
#
# Set up NVIDIA Nemotron 3 for local inference on an Apple Silicon Mac.
#
# Installs Ollama (if missing), picks a Nemotron 3 variant that fits this
# machine's unified memory, pulls it, and registers two tuned presets:
#
#   nemotron-think    reasoning mode  (/think,    temp 0.6, top_p 0.95)
#   nemotron-fast     instruct mode   (/no_think, temp 0.2, top_k 1)
#
# Safe to re-run: every step checks before it acts.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OLLAMA_HOST="${OLLAMA_HOST:-127.0.0.1:11434}"
API="http://${OLLAMA_HOST}"

MODEL=""
CTX=""
ASSUME_YES=0
DRY_RUN=0

# ── output helpers ───────────────────────────────────────────────────────────
if [ -t 1 ]; then
  B=$'\033[1m'; DIM=$'\033[2m'; R=$'\033[31m'; G=$'\033[32m'; Y=$'\033[33m'; N=$'\033[0m'
else
  B=""; DIM=""; R=""; G=""; Y=""; N=""
fi
say()  { printf '%s\n' "${B}==>${N} $*"; }
info() { printf '%s\n' "    ${DIM}$*${N}"; }
warn() { printf '%s\n' "${Y}warning:${N} $*" >&2; }
die()  { printf '%s\n' "${R}error:${N} $*" >&2; exit 1; }
run()  { if [ "$DRY_RUN" = 1 ]; then info "would run: $*"; else "$@"; fi; }

usage() {
  cat <<'EOF'
Usage: ./setup.sh [options]

Options:
  --model TAG   Force an Ollama tag instead of auto-sizing, e.g.
                nemotron-3-nano:4b | nemotron-3-nano:30b-a3b-q4_K_M
                nemotron-3-nano:30b-a3b-q8_0
  --ctx N       Context window in tokens (default: sized to your RAM).
                The model supports up to 1M, but KV cache costs memory —
                raise this only as far as your RAM allows.
  --yes         Don't prompt for confirmation on tight-fit choices.
  --dry-run     Print what would happen, change nothing.
  --help        Show this message.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --model) MODEL="${2:-}"; [ -n "$MODEL" ] || die "--model needs a value"; shift 2 ;;
    --ctx)   CTX="${2:-}";   [ -n "$CTX" ]   || die "--ctx needs a value";   shift 2 ;;
    --yes|-y)   ASSUME_YES=1; shift ;;
    --dry-run)  DRY_RUN=1;    shift ;;
    --help|-h)  usage; exit 0 ;;
    *) die "unknown option: $1 (try --help)" ;;
  esac
done

# ── 1. preflight ─────────────────────────────────────────────────────────────
say "Checking this machine"

[ "$(uname -s)" = "Darwin" ] || die "this script targets macOS; you're on $(uname -s)."

if [ "$(uname -m)" != "arm64" ]; then
  warn "this is an Intel Mac — no Metal GPU offload, so expect single-digit tokens/sec."
  warn "Only the 4B variant is realistic here."
fi

RAM_BYTES="$(sysctl -n hw.memsize)"
RAM_GB=$(( RAM_BYTES / 1073741824 ))
CHIP="$(sysctl -n machdep.cpu.brand_string 2>/dev/null || echo "Apple Silicon")"
DISK_FREE_GB="$(df -g / | awk 'NR==2 {print $4}')"

info "chip:        ${CHIP}"
info "unified RAM: ${RAM_GB} GB"
info "free disk:   ${DISK_FREE_GB} GB"

# ── 2. pick a variant that fits ──────────────────────────────────────────────
# Weights must leave room for macOS, the KV cache, and everything else you have
# open. The rule of thumb below keeps weights at roughly 60-75% of unified RAM.
#
# Nemotron 3 Nano 30B-A3B is a Mamba-2/MoE hybrid: 30B total parameters but only
# ~3B active per token, so it runs far faster than its size suggests — as long as
# the whole thing fits in memory. If it doesn't fit, macOS swaps and throughput
# collapses, which is why the sizing below is conservative.
TIGHT_FIT=0
if [ -z "$MODEL" ]; then
  if   [ "$RAM_GB" -ge 64 ]; then MODEL="nemotron-3-nano:30b-a3b-q8_0";    NEED_GB=34; DEF_CTX=65536
  elif [ "$RAM_GB" -ge 48 ]; then MODEL="nemotron-3-nano:30b-a3b-q4_K_M";  NEED_GB=24; DEF_CTX=32768
  elif [ "$RAM_GB" -ge 32 ]; then MODEL="nemotron-3-nano:30b-a3b-q4_K_M";  NEED_GB=24; DEF_CTX=16384; TIGHT_FIT=1
  elif [ "$RAM_GB" -ge 16 ]; then MODEL="nemotron-3-nano:4b";              NEED_GB=3;  DEF_CTX=32768
  else                            MODEL="nemotron-3-nano:4b";              NEED_GB=3;  DEF_CTX=16384
  fi
else
  case "$MODEL" in
    *q8_0*)   NEED_GB=34; DEF_CTX=65536 ;;
    *fp16*)   NEED_GB=63; DEF_CTX=32768 ;;
    *30b*)    NEED_GB=24; DEF_CTX=32768 ;;
    *)        NEED_GB=3;  DEF_CTX=32768 ;;
  esac
  info "using the tag you passed: ${MODEL}"
fi
CTX="${CTX:-$DEF_CTX}"

say "Selected ${B}${MODEL}${N}  (~${NEED_GB} GB weights, ${CTX} token context)"

if [ "$DISK_FREE_GB" -lt "$((NEED_GB + 5))" ]; then
  die "not enough free disk: need ~$((NEED_GB + 5)) GB, have ${DISK_FREE_GB} GB."
fi

if [ "$TIGHT_FIT" = 1 ]; then
  warn "${NEED_GB} GB of weights on a ${RAM_GB} GB machine is a tight fit."
  warn "It works, but close memory-hungry apps first. macOS caps GPU-wired memory"
  warn "at ~75% of RAM; if you hit out-of-memory errors, raise it for this boot:"
  warn "    sudo sysctl iogpu.wired_limit_mb=$(( RAM_GB * 1024 * 85 / 100 ))"
  warn "Or run ./setup.sh --model nemotron-3-nano:4b for the small, comfortable one."
  if [ "$ASSUME_YES" = 0 ] && [ "$DRY_RUN" = 0 ]; then
    printf '    Continue with the 30B? [y/N] '
    read -r reply < /dev/tty || reply=""
    case "$reply" in [yY]*) ;; *) die "stopped. Re-run with --model nemotron-3-nano:4b." ;; esac
  fi
fi

# ── 3. install Ollama ────────────────────────────────────────────────────────
if command -v ollama >/dev/null 2>&1; then
  say "Ollama already installed ($(ollama --version 2>/dev/null | head -1))"
else
  say "Installing Ollama"
  if command -v brew >/dev/null 2>&1; then
    # The Homebrew cask has been renamed over time; try the known names in turn,
    # then the CLI-only formula.
    if   run brew install --cask ollama-app 2>/dev/null; then :
    elif run brew install --cask ollama     2>/dev/null; then :
    elif run brew install ollama            2>/dev/null; then :
    else die "brew install failed. Download the app from https://ollama.com/download/mac and re-run."
    fi
  else
    warn "Homebrew not found."
    die "Install Ollama from https://ollama.com/download/mac (drag to Applications), then re-run this script."
  fi
fi

# ── 4. make sure the server is up ────────────────────────────────────────────
if curl -fsS --max-time 3 "${API}/api/version" >/dev/null 2>&1; then
  say "Ollama server is running on ${OLLAMA_HOST}"
elif [ "$DRY_RUN" = 1 ]; then
  info "would start: ollama serve"
else
  say "Starting the Ollama server"
  nohup ollama serve >/tmp/ollama-serve.log 2>&1 &
  for _ in $(seq 1 30); do
    curl -fsS --max-time 2 "${API}/api/version" >/dev/null 2>&1 && break
    sleep 1
  done
  curl -fsS --max-time 2 "${API}/api/version" >/dev/null 2>&1 \
    || die "server didn't come up. Check /tmp/ollama-serve.log, or launch the Ollama app once by hand."
fi

# ── 5. pull the weights ──────────────────────────────────────────────────────
if [ "$DRY_RUN" = 0 ] && ollama list 2>/dev/null | awk '{print $1}' | grep -qx "$MODEL"; then
  say "${MODEL} already pulled — skipping the download"
else
  say "Pulling ${MODEL} (~${NEED_GB} GB — this is the slow part)"
  run ollama pull "$MODEL" \
    || die "pull failed. Check the tag exists: https://ollama.com/library/nemotron-3-nano/tags"
fi

# ── 6. register the tuned presets ────────────────────────────────────────────
# NVIDIA publishes different sampling settings per mode: reasoning wants a warmer,
# more exploratory distribution; instruct mode wants a near-greedy one.
say "Registering presets"
GEN="${HERE}/generated"
run mkdir -p "$GEN"

for preset in think fast; do
  case "$preset" in
    think) tmpl="${HERE}/Modelfile.think" ;;
    fast)  tmpl="${HERE}/Modelfile.instruct" ;;
  esac
  [ -f "$tmpl" ] || die "missing template: $tmpl"
  if [ "$DRY_RUN" = 1 ]; then
    info "would create preset nemotron-${preset} from $(basename "$tmpl")"
    continue
  fi
  sed -e "s|__BASE__|${MODEL}|g" -e "s|__CTX__|${CTX}|g" "$tmpl" > "${GEN}/Modelfile.${preset}"
  ollama create "nemotron-${preset}" -f "${GEN}/Modelfile.${preset}" >/dev/null \
    || die "failed to create preset nemotron-${preset}"
  info "nemotron-${preset}  ←  ${MODEL}"
done

# ── 7. smoke test ────────────────────────────────────────────────────────────
if [ "$DRY_RUN" = 1 ]; then
  say "Dry run complete — nothing was changed."
  exit 0
fi

say "Smoke test (first run also loads the model into memory, so allow a minute)"
RESP="$(curl -fsS --max-time 600 "${API}/api/generate" -d "{
  \"model\": \"nemotron-fast\",
  \"prompt\": \"Reply with exactly: ready\",
  \"think\": false,
  \"stream\": false
}")" || die "the model failed to respond. See /tmp/ollama-serve.log."

# eval_count / eval_duration(ns) gives generation throughput.
count="$(printf '%s' "$RESP"  | sed -n 's/.*"eval_count":\([0-9]*\).*/\1/p')"
nanos="$(printf '%s' "$RESP"  | sed -n 's/.*"eval_duration":\([0-9]*\).*/\1/p')"
if [ -n "${count:-}" ] && [ -n "${nanos:-}" ] && [ "${nanos:-0}" -gt 0 ]; then
  info "generation speed: ~$(( count * 1000000000 / nanos )) tokens/sec"
fi

printf '\n%s\n' "${G}Nemotron 3 is running locally.${N}"
cat <<EOF

Run ONE of these at a time. 'ollama run' opens an interactive chat, so anything
you paste after it becomes a message to the model rather than a shell command.

  Chat, fast answers      ollama run nemotron-fast --think=false
  Chat, full reasoning    ollama run nemotron-think
  One-shot question       ${HERE}/ask.sh "why do wrists hurt at a low desk?"

  Inside a chat: /set nothink turns reasoning off, /bye exits.

  OpenAI-compatible API   ${API}/v1/chat/completions   (model: nemotron-fast)
                          send "think": false to suppress reasoning

Everything runs on your Mac. No data leaves the machine, and it works offline
once the weights are pulled.
EOF
