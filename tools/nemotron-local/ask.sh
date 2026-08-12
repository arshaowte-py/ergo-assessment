#!/usr/bin/env bash
#
# One-shot question to the local Nemotron 3, no chat session.
#
#   ./ask.sh "summarise RSI risk factors for desk work"
#   ./ask.sh --think "a physio sees 14 clients/week, 3 no-shows. Utilisation?"
#   cat notes.txt | ./ask.sh "pull out the action items"
#
# Reads piped stdin as extra context when there is any.

set -euo pipefail

MODEL="nemotron-fast"
if [ "${1:-}" = "--think" ]; then
  MODEL="nemotron-think"
  shift
fi

if [ $# -eq 0 ] && [ -t 0 ]; then
  echo "usage: ./ask.sh [--think] \"your question\"   (or pipe text in)" >&2
  exit 64
fi

command -v ollama >/dev/null 2>&1 || {
  echo "ollama not found — run ./setup.sh first." >&2
  exit 127
}

PROMPT="$*"

# Anything piped in becomes context ahead of the question. Only read stdin when
# it is genuinely a pipe or a redirected file — reading an inherited terminal-less
# stdin (cron, editor task runners) would block forever waiting on EOF.
if [ ! -t 0 ] && { [ -p /dev/stdin ] || [ -f /dev/stdin ]; }; then
  STDIN_TEXT="$(cat)"
  if [ -n "$STDIN_TEXT" ]; then
    PROMPT="$(printf '%s\n\n---\n\n%s' "$STDIN_TEXT" "${PROMPT:-Summarise the text above.}")"
  fi
fi

if [ -z "${PROMPT//[[:space:]]/}" ]; then
  echo "nothing to ask — pass a question or pipe in some text." >&2
  exit 64
fi

# The /no_think directive in the system prompt is a model-level hint and Ollama
# does not always honour it — the runner has its own thinking switch that wins.
# Set it explicitly, when this version of Ollama supports the flag.
THINK_ARG=""
if ollama run --help 2>&1 | grep -q -- '--think'; then
  if [ "$MODEL" = "nemotron-think" ]; then THINK_ARG="--think=true"; else THINK_ARG="--think=false"; fi
fi

# Unquoted on purpose: empty means "pass nothing", and the value never contains
# whitespace. Written this way to stay safe under macOS's stock bash 3.2.
exec ollama run ${THINK_ARG:+$THINK_ARG} "$MODEL" "$PROMPT"
