# Native local-model accounting

Pinned source: Ollama v0.40.1, commit cf2a313a298066d572c36812e5ad30a21c0db13b. The selected model is gpt-oss:120b, MXFP4, manifest ad84bf7720de3aac13b8f07008047c85ff5c277721a648dbf51517453a0331f6 and GGUF blob a5b03e4c678e1671191c0115861445b61529f518e751ce38a2bb6030cca9b1d0. The private catalog contains only this alias, avoiding the shared server's ambiguous duplicate alias.

Stock Ollama can reject malformed generated tool arguments after receiving native terminal timings, then omit usage from the compatible API error. patch.py adds request-ID context and observes those timings before parsing. ff_usage.go appends and fsyncs native input/cache/output counters and parser errors to a PM-owned sidecar. Original model input, output, sampler, parser, cancellation and error status remain unchanged. No malformed arguments are repaired.

Build a private source checkout under ignored .local, apply patch.py once, format the added Go source and build with Go 1.27.1:
- git clone --depth 1 --branch v0.40.1 https://github.com/ollama/ollama.git .local/ollama-metered-source
- python3 -B orchestrator/providers/ollama/patch.py .local/ollama-metered-source
- Run gofmt on the touched files.
- From that source module, go build -o ../ollama-metered -ldflags '-X github.com/ollama/ollama/version.Version=0.40.1-ff-accounting-v1' .

The private runtime uses .local/ollama-provider/bin/ollama and models/. Copy the selected manifest into manifests/registry.ollama.ai/library/gpt-oss/120b; provide its content-addressed blobs as read-only source symlinks. Keep only llama-server and llama-quantize links under bin/lib/ollama. An incompatible optional system MLX library must not be auto-loaded; the selected model uses the original bundled llama.cpp b11351 runner. The shared Ollama installation/service is never patched or stopped.

orchestrator/local_provider.py starts the private loopback service on port 11435 with cloud access disabled, one request slot and a fixed 131072 context. The gateway adds X-FF-Request-ID, correlates native records by that UUID, verifies ordinary API counters against the native observer and recovers missing error counters from the sidecar. Preserve per-request native observations and hashes with the ordinary raw request/response.

A malformed generated call remains a failed builder attempt. Its consumed time and native-token reference cost remain attributable to the original task. Genuine transport/resource failures without terminal counters remain missing and require diagnosis; never invent counts. Freeze binary, patch, runner, model, settings and pricing provenance before starting a run. Real subscription credentials remain outside this provider.

The failed-call integration probe preserved the HTTP 500 invalid-JSON error while observing 2690 native input and 128 native output tokens. These are measurements of that diagnostic, not estimates for older unobserved requests.
