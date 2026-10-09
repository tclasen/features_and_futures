#!/usr/bin/env python3
"""Fail-closed secret scan for PM publication; never prints matched secret values."""
import argparse
import hashlib
import base64
import io
import gzip
import os
import json
import re
import subprocess
import tarfile
import tempfile
import zipfile
import zlib
from pathlib import Path

LEASE = re.compile(rb'e30\.([A-Za-z0-9_-]+)\.([0-9a-f]{48})(?![0-9a-f])')
TOKEN_FIELDS = {'access', 'refresh', 'access_token', 'refresh_token', 'api_key', 'apikey', 'token', 'accountid', 'account_id', 'id_token', 'idtoken', 'openai_api_key'}


def credential_values(value):
    result = set()
    if isinstance(value, dict):
        for key, item in value.items():
            if key.lower() in TOKEN_FIELDS and isinstance(item, str) and len(item) >= 16:
                result.add(item.encode())
            result.update(credential_values(item))
    elif isinstance(value, list):
        for item in value:
            result.update(credential_values(item))
    return result


class Scanner:
    def __init__(self, secrets):
        self.secrets = set(secrets)
        self.findings = set()
        self.units = 0
        self.decoded_members = 0
        self.bundles = 0

    def scan(self, data, label, depth=0):
        self.units += 1
        if any(secret in data for secret in self.secrets):
            self.findings.add((label, 'known credential'))
        for match in LEASE.finditer(data):
            try:
                segment = match.group(1)
                claims = json.loads(base64.urlsafe_b64decode(segment + b'=' * (-len(segment) % 4)))
                if 'pilot-local-lease' in json.dumps(claims):
                    self.findings.add((label, 'gateway lease credential'))
            except (ValueError, UnicodeError):
                pass
        if depth > 8:
            raise ValueError('archive nesting exceeds inspection limit: ' + label)
        if re.search(r'objects/[0-9a-f]{2}/[0-9a-f]{38}$', label) and data:
            decoded = zlib.decompress(data)
            header, payload = decoded.split(b'\x00', 1)
            kind, size = header.split(b' ', 1)
            if kind not in (b'blob', b'tree', b'commit', b'tag') or int(size) != len(payload):
                raise ValueError('Corrupt nonempty loose Git object: ' + label)
            self.decoded_members += 1
            self.scan(payload, label + '::loose-object', depth + 1)
        elif data.startswith(b'PACK'):
            self.scan_pack(data, label)
        elif data.startswith((b'# v2 git bundle\n', b'# v3 git bundle\n')):
            self.scan_bundle(data, label)
        elif data.startswith(b'PK\x03\x04'):
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                for info in archive.infolist():
                    if not info.is_dir():
                        self.decoded_members += 1
                        self.scan(archive.read(info), label + '::' + info.filename, depth + 1)
        elif data.startswith(b'\x1f\x8b'):
            self.decoded_members += 1
            self.scan(gzip.decompress(data), label + '::gzip', depth + 1)
        elif len(data) > 262 and data[257:262] == b'ustar':
            with tarfile.open(fileobj=io.BytesIO(data), mode='r:*') as archive:
                for member in archive:
                    if member.isfile():
                        self.decoded_members += 1
                        self.scan(archive.extractfile(member).read(), label + '::' + member.name, depth + 1)

    def scan_pack(self, data, label):
        # Raw interrupted Git archives may contain packed or unreachable objects.
        with tempfile.TemporaryDirectory(prefix="ff-pack-scan-") as folder:
            repo = Path(folder) / "repo.git"
            subprocess.run(["git", "init", "--bare", "-q", str(repo)], check=True, capture_output=True)
            subprocess.run(["git", "-C", str(repo), "index-pack", "--stdin", "--strict"], input=data, check=True, capture_output=True)
            self.scan_git(repo, label, all_objects=True)

    def scan_bundle(self, data, label):
        # Inspect every packed object, including objects not retained by a public ref.
        self.bundles += 1
        with tempfile.TemporaryDirectory(prefix='ff-secret-scan-') as folder:
            repo = Path(folder) / 'repo.git'
            bundle = Path(folder) / 'history.bundle'
            bundle.write_bytes(data)
            subprocess.run(['git', 'init', '--bare', '-q', str(repo)], check=True, capture_output=True)
            subprocess.run(['git', '-C', str(repo), 'bundle', 'unbundle', str(bundle)], check=True, capture_output=True)
            self.scan_git(repo, label, all_objects=True)

    def scan_git(self, repo, label, all_objects=False):
        if all_objects:
            listing = subprocess.run(['git', '-C', str(repo), 'cat-file', '--batch-all-objects', '--batch-check=%(objectname) %(objecttype)'], check=True, capture_output=True).stdout.splitlines()
            ids = [line.split()[0] for line in listing]
        else:
            listing = subprocess.run(['git', '-C', str(repo), 'rev-list', '--objects', '--all'], check=True, capture_output=True).stdout.splitlines()
            ids = list(dict.fromkeys(line.split(b' ', 1)[0] for line in listing))
        process = subprocess.Popen(['git', '-C', str(repo), 'cat-file', '--batch'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            for oid in ids:
                process.stdin.write(oid + b'\n')
                process.stdin.flush()
                header = process.stdout.readline().split()
                if len(header) != 3:
                    raise ValueError('unreadable Git object: ' + oid.decode())
                size = int(header[2])
                data = process.stdout.read(size)
                if len(data) != size or process.stdout.read(1) != b'\n':
                    raise ValueError('truncated Git object')
                # Also inspect commit/tag text, which can contain credentials.
                self.scan(data, label + '::' + oid.decode())
            process.stdin.close()
            if process.wait() != 0:
                raise ValueError('Git object scan failed')
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()
            for stream in (process.stdin, process.stdout, process.stderr):
                stream.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=Path.cwd())
    parser.add_argument('--credential-file', type=Path, action='append', default=[])
    args = parser.parse_args()
    secrets = set()
    sources = args.credential_file or [Path.home()/'.pi/agent/auth.json', Path.home()/'.codex/auth.json']
    loaded = 0
    for key, value in os.environ.items():
        if any(marker in key.upper() for marker in ("API_KEY", "ACCESS_TOKEN", "REFRESH_TOKEN", "AUTH_TOKEN")) and len(value) >= 16:
            secrets.add(value.encode())
            loaded += 1
    for path in sources:
        if path.exists():
            secrets.update(credential_values(json.loads(path.read_text())))
            loaded += 1
    gh = subprocess.run(['gh', 'auth', 'token'], capture_output=True)
    if gh.returncode == 0 and len(gh.stdout.strip()) >= 16:
        secrets.add(gh.stdout.strip())
        loaded += 1
    if not secrets:
        raise ValueError('No known credential sources loaded; refuse an incomplete publication scan')
    scanner = Scanner(secrets)
    repo = args.repo.resolve()
    target_commit = subprocess.run(['git', '-C', str(repo), 'rev-parse', 'HEAD'], check=True, capture_output=True).stdout.decode().strip()
    paths = subprocess.run(['git', '-C', str(repo), 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], check=True, capture_output=True).stdout.split(b'\0')
    for raw_path in paths:
        if raw_path:
            path = repo / raw_path.decode()
            if path.is_file():
                scanner.scan(path.read_bytes(), raw_path.decode())
    scanner.scan_git(repo, 'reachable-git')
    current_commit = subprocess.run(['git', '-C', str(repo), 'rev-parse', 'HEAD'], check=True, capture_output=True).stdout.decode().strip()
    if current_commit != target_commit:
        raise ValueError('Publication target changed during scanning; rescan the new commit')
    print(json.dumps({'status': 'blocked' if scanner.findings else 'passed', 'target_git_commit': target_commit, 'scanner_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), 'credential_sources_loaded': loaded, 'inspection_units': scanner.units, 'decoded_archive_members': scanner.decoded_members, 'git_bundles_inspected': scanner.bundles, 'findings': [{'location': label, 'kind': kind} for label, kind in sorted(scanner.findings)]}, sort_keys=True))
    return int(bool(scanner.findings))


if __name__ == '__main__':
    raise SystemExit(main())
