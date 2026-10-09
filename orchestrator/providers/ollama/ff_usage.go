package llm

import (
    "context"
    "encoding/json"
    "os"
    "sync"
    "time"
)

type ffRequestKey struct{}
var ffUsageMutex sync.Mutex

func FFMeterContext(ctx context.Context, requestID string) context.Context {
    return context.WithValue(ctx, ffRequestKey{}, requestID)
}

func ffWriteUsage(ctx context.Context, event map[string]any) {
    requestID, _ := ctx.Value(ffRequestKey{}).(string)
    path := os.Getenv("FF_OLLAMA_USAGE_LOG")
    if requestID == "" || path == "" { return }
    event["request_id"] = requestID
    event["utc"] = time.Now().UTC().Format(time.RFC3339Nano)
    ffUsageMutex.Lock()
    defer ffUsageMutex.Unlock()
    stream, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
    if err != nil { panic(err) }
    defer stream.Close()
    if err := json.NewEncoder(stream).Encode(event); err != nil { panic(err) }
    if err := stream.Sync(); err != nil { panic(err) }
}

func FFRecordNativeUsage(ctx context.Context, prompt int, cache *int, output int) {
    cached := 0
    if cache != nil { cached = *cache }
    ffWriteUsage(ctx, map[string]any{
        "kind": "native_generation_completed",
        "counter_source": "llama-server terminal timings before Ollama tool parsing",
        "cache_counter_available": cache != nil,
        "usage": map[string]any{
            "input_tokens": prompt,
            "input_tokens_details": map[string]any{"cached_tokens": cached},
            "output_tokens": output,
        },
    })
}

func FFRecordParserError(ctx context.Context, message string) {
    ffWriteUsage(ctx, map[string]any{"kind": "tool_parser_error", "error": message})
}
