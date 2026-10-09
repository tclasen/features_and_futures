"""Instrument the exact pinned Ollama source; preserve model outputs and parser failures."""
import argparse
import shutil
from pathlib import Path
import subprocess

PIN="cf2a313a298066d572c36812e5ad30a21c0db13b"

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("source",type=Path)
    args=parser.parse_args()
    source=args.source.resolve()
    actual=subprocess.check_output(["git","-C",str(source),"rev-parse","HEAD"],text=True).strip()
    if actual!=PIN:raise RuntimeError("Source differs from the frozen Ollama v0.40.1 commit")
    routes=source/"server/routes.go"
    text=routes.read_text()
    for handler in ("GenerateHandler","ChatHandler"):
        start=f"func (s *Server) {handler}(c *gin.Context) {{"
        assert text.count(start)==1
        text=text.replace(start,start+'\n\tc.Request = c.Request.WithContext(llm.FFMeterContext(c.Request.Context(), c.GetHeader("X-FF-Request-ID")))')
    original="\t\tif parserErr != nil {\n\t\t\tch <- gin.H"
    assert text.count(original)==2
    text=text.replace(original,"\t\tif parserErr != nil {\n\t\t\tllm.FFRecordParserError(ctx, parserErr.Error())\n\t\t\tch <- gin.H")
    routes.write_text(text)
    runner=source/"llm/llama_server.go"
    text=runner.read_text()
    needle="\t\tfn(finalResp)\n\t\treturn nil"
    # Completion: timing counters are available before the parser callback.
    index=text.index(needle)
    text=text[:index]+text[index:].replace(needle,
      "\t\tFFRecordNativeUsage(ctx, finalResp.PromptEvalCount, finalResp.PromptEvalCachedCount, finalResp.EvalCount)\n"+needle,1)
    # Native Chat: record before malformed arguments can be rejected.
    needle="\t\t\t\ttoolCalls, err := accumulatedToolCalls(toolCalls)"
    assert text.count(needle)==1
    text=text.replace(needle,"\t\t\t\tFFRecordNativeUsage(ctx, resp.PromptEvalCount, resp.PromptEvalCachedCount, resp.EvalCount)\n"+needle)
    runner.write_text(text)
    shutil.copy2(Path(__file__).with_name("ff_usage.go"),source/"llm/ff_usage.go")
    print("Instrumented native counters; original cancellation, parser and outputs unchanged.")

if __name__=="__main__":main()
