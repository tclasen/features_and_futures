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


def browser_diagnostics(diagnostics, pm_root):
    """Return public assertion facts and only the failing page's YAML snapshot."""
    from .proposals.browser_feedback_v1 import browser_diagnostics as sanitize
    return sanitize(diagnostics, pm_root)


def page_snapshot(text):
    import re
    match=re.search(r'^# Page snapshot\s*\n+```yaml\n(.*?)\n```',text,re.M|re.S)
    return match.group(1) if match else None


def notification_fingerprint(diagnostics):
    from .evidence import digest_json
    normalized=[]
    for item in diagnostics:
        copy={k:v for k,v in item.items() if k not in ('evidence_request_id','supplied_tool_schemas','page_snapshot')}
        if copy.get('contract')=='Generated tool arguments must be valid for the assigned harness':
            original=copy.get('observed','')
            if ', err=' in original: copy['observed']=original.rsplit(', err=',1)[-1]
        normalized.append(copy)
    return digest_json(normalized)
