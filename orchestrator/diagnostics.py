"""Render native tool errors as factual feedback, without duplicating generated source."""
import json
from pathlib import Path

def tool_diagnostics(usage, output):
    diagnostics=[]
    for request in usage:
        if request.get("outcome")!="builder-invalid-tool-call":
            continue
        original=request["tool_parser_error"]
        message=original.rsplit(", err=",1)[-1] if ", err=" in original else original
        payload=json.loads((Path(output)/"requests"/(request["request_id"]+".request.json")).read_text())
        tools=[]
        def collect(items):
            for item in items:
                if item.get("type")=="namespace":
                    collect(item.get("tools",[]))
                else:
                    function=item.get("function",item)
                    if function.get("name") and function.get("parameters"):
                        tools.append({"name":function["name"],"parameters":function["parameters"]})
        collect(payload.get("tools",[]))
        diagnostics.append({
            "contract":"Generated tool arguments must be valid for the assigned harness",
            "observed_parser_error":message,
            "evidence_request_id":request["request_id"],
            "supplied_tool_schemas":tools,
        })
    return diagnostics
