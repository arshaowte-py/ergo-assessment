# Nemotron 3, running locally on Apple Silicon

NVIDIA's Nemotron 3 family is open-weight, so it runs entirely on your Mac — no
API key, no per-token cost, nothing leaving the machine, and it works offline
once the weights are downloaded.

This directory is standalone tooling. It does not touch the assessment portal.

## Quick start

```bash
cd tools/nemotron-local
./setup.sh
```

That checks your hardware, installs Ollama if it's missing, picks the largest
variant your unified memory can hold, pulls it, and registers two presets. Then:

```bash
ollama run nemotron-fast          # chat, direct answers
ollama run nemotron-think         # chat, full reasoning trace
./ask.sh "why do wrists hurt at a low desk?"
```

Re-running `setup.sh` is safe — every step checks before it acts. Use
`--dry-run` to see the plan without changing anything.

## Which variant you get

Nemotron 3 Nano is a hybrid **Mamba-2 + MoE** design rather than a plain
transformer. The 30B has ~3B active parameters per token, so it generates far
faster than its size implies — provided the whole model fits in memory. If it
doesn't fit, macOS swaps to disk and throughput collapses, which is why the
sizing below leaves real headroom.

| Your unified RAM | Variant | Weights | Notes |
|---|---|---|---|
| < 16 GB | `nemotron-3-nano:4b` | ~2.8 GB | Runs comfortably in ~5 GB |
| 16–31 GB | `nemotron-3-nano:4b` | ~2.8 GB | Plenty of room for a large context |
| 32–47 GB | `nemotron-3-nano:30b-a3b-q4_K_M` | ~24 GB | Tight — script asks before proceeding |
| 48–63 GB | `nemotron-3-nano:30b-a3b-q4_K_M` | ~24 GB | The sweet spot |
| 64 GB+ | `nemotron-3-nano:30b-a3b-q8_0` | ~34 GB | Higher-fidelity quantisation |

Override the choice at any time:

```bash
./setup.sh --model nemotron-3-nano:4b --ctx 65536
```

Larger models exist — **Nemotron 3 Super** (120B-A12B, ~64 GB) and **Ultra**
(550B-A55B). Super is borderline feasible on a 128 GB Mac; Ultra is datacentre
hardware. Check current tags at
[ollama.com/library](https://ollama.com/library/nemotron-3-nano/tags) before
asking for either.

Rough throughput on Apple Silicon: the 4B lands in the high tens of tokens/sec,
the 30B-A3B somewhere around 15–25 tokens/sec depending on chip and context
length. `setup.sh` measures yours and prints the number.

## Thinking mode

Nemotron 3 is one model with two behaviours, selected by a directive in the
system prompt:

- `/think` — emits a `<think>…</think>` trace before answering. Better at maths,
  code, and multi-step problems; slower and uses many more tokens.
- `/no_think` — answers directly.

The two presets bake this in, along with NVIDIA's recommended sampling for each
mode (reasoning: `temperature 0.6`, `top_p 0.95`; instruct: `temperature 0.2`,
`top_k 1`). See `Modelfile.think` and `Modelfile.instruct` — edit those and
re-run `setup.sh` to change the personality or defaults.

**The system-prompt directive is not enough on its own.** Ollama has its own
thinking switch that overrides it, and no Modelfile equivalent — `PARAMETER
think false` is rejected as an unknown parameter. So if you want reasoning
genuinely off, set it at the Ollama level too:

```bash
ollama run nemotron-fast --think=false      # per command
/set nothink                                # inside a running chat
```

```jsonc
{ "model": "nemotron-fast", "think": false, "messages": [ ... ] }   // API
```

`ask.sh` applies the right flag for you, so `./ask.sh` never shows a reasoning
trace and `./ask.sh --think` always does.

## Context length

The model supports up to a 1M-token context, but the KV cache is charged against
the same unified memory as the weights, so `setup.sh` defaults to something
sensible (16k–64k) rather than the maximum. Raise it with `--ctx` if you have
room; if you hit out-of-memory errors, lower it first — it's cheaper than
switching to a smaller model.

## Calling it from code

Ollama exposes an OpenAI-compatible endpoint on `localhost:11434`, so most
existing SDKs work by changing the base URL:

```bash
curl http://127.0.0.1:11434/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "nemotron-fast",
    "messages": [{"role": "user", "content": "Name three desk-setup red flags."}]
  }'
```

```js
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://127.0.0.1:11434/v1",
  apiKey: "ollama",           // required by the SDK, ignored by the server
});

const res = await client.chat.completions.create({
  model: "nemotron-fast",
  messages: [{ role: "user", content: "Name three desk-setup red flags." }],
});
console.log(res.choices[0].message.content);
```

The native `/api/generate` and `/api/chat` endpoints are also available and give
you timing fields (`eval_count`, `eval_duration`) useful for benchmarking.

Two gotchas when calling a reasoning model over HTTP:

- Add `"think": false` to the body unless you want reasoning tokens. You pay for
  them in latency either way.
- On the OpenAI-compatible route, reasoning models can put the trace in a
  separate `reasoning` field and leave `content` empty. If your integration
  shows blank replies, that's why — read both fields, or turn thinking off.

## Troubleshooting

**Out of memory, or the whole Mac crawls.** The model doesn't fit. Lower `--ctx`
first, then drop to a smaller variant. macOS caps GPU-wired memory at about 75%
of RAM; you can raise it until the next reboot with:

```bash
sudo sysctl iogpu.wired_limit_mb=<about 85% of your RAM in MB>
```

**`pull` fails with a not-found error.** The tag was renamed or doesn't exist for
that quantisation. Check
[the tags page](https://ollama.com/library/nemotron-3-nano/tags) and pass the
right one with `--model`.

**`ollama` not on PATH after install.** The Homebrew cask installs a menu-bar
app; launch it once from Applications, which sets up the CLI symlink.

**Server won't start.** `setup.sh` logs to `/tmp/ollama-serve.log`. A stale
process is the usual cause — `pkill ollama` and re-run.

**The model answers questions you never asked.** `ollama run` opens an
interactive chat session, so if you paste several lines at once, the first line
runs and every line after it is sent to the model as a message. Run one command
at a time; `/bye` exits the chat and gets you back to a shell prompt.

**You still get a reasoning trace on `nemotron-fast`.** The system-prompt
directive alone doesn't bind — see [Thinking mode](#thinking-mode). Use
`ollama run nemotron-fast --think=false`, or `/set nothink` inside the chat.
Check what the preset actually holds with `ollama show nemotron-fast --system`.

## Removing it

```bash
ollama rm nemotron-think nemotron-fast nemotron-3-nano:30b-a3b-q4_K_M
brew uninstall --cask ollama-app     # or: brew uninstall ollama
```

Weights live in `~/.ollama/models` and are the bulk of the disk usage.

## Files

```
setup.sh             hardware check → install → pull → presets → smoke test
Modelfile.think      reasoning preset  (templated: __BASE__, __CTX__)
Modelfile.instruct   instruct preset
ask.sh               one-shot question; reads piped stdin as context
generated/           Modelfiles with values substituted (git-ignored)
```
