"""Fresh-context CLI invocations inside individually isolated Docker sbx sandboxes."""
import json
import os
import subprocess
import uuid
from pathlib import Path


def invoke(command, *, stdin=None, timeout=None):
    return subprocess.run(command, input=stdin, text=True, capture_output=True, timeout=timeout)


def configure_attempt(sandbox, harness, model, key, gateway_port, attempt_key,
                      treatment=""):
    config_root = "/home/agent/.ff-context-" + attempt_key
    base_url = f"http://host.docker.internal:{gateway_port}/attempts/" + __import__("hashlib").sha256(key.encode()).hexdigest()[:24]
    if harness == "pi":
        provider_api = "openai-completions" if model == "gpt-oss:120b" else (
            "openai-codex-responses")
        models = {"providers": {"pilot": {
            "api": provider_api, "baseUrl": base_url + ("/v1" if model == "gpt-oss:120b" else ""),
            "apiKey": "$FF_GATEWAY_KEY",
            "models": [{
                "id": model, "name": model, "reasoning": True,
                "input": ["text"], "contextWindow": 131072 if model == "gpt-oss:120b" else 272000,
                "maxTokens": 16384,
                "cost": {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0},
                "compat": {"supportsReasoningEffort": True, "supportsUsageInStreaming": True},
            }],
        }}}
        contents = {
            "models.json": json.dumps(models),
            "settings.json": json.dumps({
                "transport": "sse", "packages": [], "skills": [],
                "quietStartup": True, "defaultThinkingLevel": "medium",
                "retry": {"enabled": False},
            }),
            "treatment.txt": treatment,
        }
    else:
        contents = {"treatment.txt": treatment}
    # This setup contains only harness configuration and assigned treatment.
    script = (
        "import json,pathlib,sys; d=json.load(sys.stdin); "
        "p=pathlib.Path(d['root']); p.mkdir(parents=True,exist_ok=True); "
        "[(p/name).write_text(text) for name,text in d['files'].items()]"
    )
    result = invoke(["sbx", "exec", "-i", sandbox, "python3", "-c", script],
                    stdin=json.dumps({"root": config_root, "files": contents}))
    if result.returncode:
        raise RuntimeError("Could not prepare fresh harness context: " + result.stderr)
    if harness == "pi":
        command = [
            "sbx", "exec", "-i", "-e", "PI_CODING_AGENT_DIR=" + config_root,
            "-e", "FF_GATEWAY_KEY=" + key, "-e", "PI_OFFLINE=1",
            "-e", "PI_TELEMETRY=0", sandbox,
            "pi", "--provider", "pilot", "--model", model, "--thinking", "medium",
            "--print", "--mode", "json", "--offline", "--no-extensions",
            "--no-mcp", "--no-skills", "--no-prompt-templates", "--no-session",
        ]
        if treatment:
            command += ["--append-system-prompt", config_root + "/treatment.txt"]
    else:
        command = [
            "sbx", "exec", "-i", "-e", "CODEX_HOME=" + config_root,
            "-e", "FF_GATEWAY_KEY=" + key, sandbox,
            "codex", "exec", "--json", "--ephemeral", "--ignore-user-config",
            "--ignore-rules", "--color", "never", "--skip-git-repo-check",
            "--dangerously-bypass-approvals-and-sandbox", "-m", model,
            "-c", 'model_provider="pilot"',
            "-c", 'model_reasoning_effort="medium"',
            "-c", 'web_search="disabled"',
            "-c", "features.multi_agent=false",
            "-c", 'model_providers.pilot.name="PM-metered pilot"',
            "-c", 'model_providers.pilot.wire_api="responses"',
            "-c", f'model_providers.pilot.base_url="{base_url}/v1"',
            "-c", 'model_providers.pilot.env_key="FF_GATEWAY_KEY"',
            "-c", "model_providers.pilot.supports_websockets=false",
            "-c", "model_providers.pilot.request_max_retries=0",
            "-c", "model_providers.pilot.stream_max_retries=0",
            "-c", "model_providers.pilot.requires_openai_auth=false",
        ]
        if treatment:
            command += ["-c", "developer_instructions=" + json.dumps(treatment)]
        command += ["-"]
    return command


def execute_attempt(sandbox, harness, model, key, gateway_port, prompt, output,
                    treatment="", *, timeout=None, smoke=False, on_start=None, workdir=None):
    output.mkdir(parents=True, exist_ok=True)
    command = configure_attempt(sandbox, harness, model, key, gateway_port,
                                uuid.uuid4().hex, treatment)
    if workdir:
        pos=command.index(sandbox)
        command[pos:pos]=["-w",workdir]
    if harness == "pi":
        if smoke:
            command += ["--no-tools"]
        command += [prompt]
        stdin = None
    else:
        stdin = prompt
    if on_start:
        on_start()
    result = invoke(command, stdin=stdin, timeout=timeout)
    # Lease credentials never survive publication even if a harness echoes them.
    (output / "harness.stdout.jsonl").write_text(result.stdout.replace(key, "[REDACTED-LEASE]"))
    (output / "harness.stderr.log").write_text(result.stderr.replace(key, "[REDACTED-LEASE]"))
    return result


def sandbox_policy(sandbox, gateway_port):
    result = invoke(["sbx", "policy", "allow", "network", "--sandbox", sandbox,
                     f"host.docker.internal:{gateway_port},localhost:{gateway_port}"])
    if result.returncode:
        raise RuntimeError(result.stderr)
    result = invoke(["sbx", "policy", "ls", sandbox, "--json"])
    if result.returncode:
        raise RuntimeError(result.stderr)
    return json.loads(result.stdout)


def isolation_probe(sandbox, workspace, sibling, gateway_port):
    script = """
import json,pathlib,urllib.request,urllib.error,socket,os
result={}
for label,path in [
    ("own_workspace",WORKSPACE),("master_repo","/Users/Shared/projects/competition/README.md"),
    ("sibling_repo",SIBLING),("host_auth","/Users/agent/.codex/auth.json"),
    ("docker_socket_readable","/var/run/docker.sock")]:
    result[label]=(os.access(path,os.R_OK|os.W_OK) if label=="docker_socket_readable" else pathlib.Path(path).exists())
for label,url in [
    ("github","https://github.com/tclasen/features_and_futures"),
    ("github_api","https://api.github.com/repos/tclasen/features_and_futures"),
    ("raw_source","https://raw.githubusercontent.com/tclasen/features_and_futures/main/README.md"),
    ("mirror","https://r.jina.ai/https://github.com/tclasen/features_and_futures"),
    ("generic_internet","https://example.com"),
    ("direct_ollama","http://host.docker.internal:11434/api/tags"),
    ("gateway","http://host.docker.internal:PORT/v1/responses")]:
    try:
        response=urllib.request.urlopen(url,timeout=5)
        result[label]={"status":response.status,"readable":True}
    except urllib.error.HTTPError as error:
        result[label]={"status":error.code,"readable":False}
    except Exception as error:
        result[label]={"error":type(error).__name__,"readable":False}
for label,url in [
    ("no_proxy_github","https://github.com/tclasen/features_and_futures"),
    ("no_proxy_local_provider","http://host.docker.internal:11435/api/tags"),
    ("no_proxy_direct_ip","https://1.1.1.1")]:
    try:
        response=urllib.request.build_opener(urllib.request.ProxyHandler({})).open(url,timeout=5)
        result[label]={"status":response.status,"readable":True}
    except urllib.error.HTTPError as error:
        result[label]={"status":error.code,"readable":False}
    except Exception as error:
        result[label]={"error":type(error).__name__,"readable":False}
print(json.dumps(result))
""".replace("WORKSPACE", repr(str(workspace))).replace(
        "SIBLING", repr(str(sibling))).replace("PORT", str(gateway_port))
    result = invoke(["sbx", "exec", sandbox, "python3", "-c", script], timeout=60)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return json.loads(result.stdout)


def price_snapshot(root):
    import urllib.request
    from .evidence import digest_bytes, timestamp
    root.mkdir(parents=True, exist_ok=True)
    path = root / "openrouter-models.json"
    if not path.exists():
        raw = urllib.request.urlopen(
            "https://openrouter.ai/api/v1/models", timeout=30).read()
        path.write_bytes(raw)
        (root / "snapshot-metadata.json").write_text(json.dumps({
            "retrieved_at": timestamp(), "source": "https://openrouter.ai/api/v1/models",
            "sha256": digest_bytes(raw), "units": "USD/token",
        }, indent=2) + "\n")
    raw = path.read_bytes()
    all_models = {m["id"]: m for m in json.loads(raw)["data"]}
    mapping = {
        "gpt-6-luna": "openai/gpt-6-luna",
        "gpt-6.1-sol": "openai/gpt-6.1-sol",
        "gpt-oss:120b": "openai/gpt-oss-120b",
    }
    return {
        model: {"reference_id": reference, "pricing": all_models[reference]["pricing"],
                "snapshot_sha256": digest_bytes(raw)}
        for model, reference in mapping.items()
    }
