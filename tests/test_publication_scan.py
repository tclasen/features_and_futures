import base64
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
import zipfile
import zlib

spec = importlib.util.spec_from_file_location('publication_scan', Path(__file__).parents[1]/'scripts/scan-publication.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PublicationScanTests(unittest.TestCase):
    def test_decoded_archives_and_lease_detection(self):
        secret = b'test-only-secret-not-a-real-credential'
        scanner = module.Scanner({secret})
        buffer = io.BytesIO()
        with tarfile.open(fileobj=buffer, mode='w:gz') as archive:
            info = tarfile.TarInfo('private.txt')
            info.size = len(secret)
            archive.addfile(info, io.BytesIO(secret))
        zipped = io.BytesIO()
        with zipfile.ZipFile(zipped, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr('nested.tar.gz', buffer.getvalue())
        scanner.scan(zipped.getvalue(), 'test.zip')
        self.assertIn(('test.zip::nested.tar.gz::gzip::private.txt', 'known credential'), scanner.findings)
        claims = base64.urlsafe_b64encode(json.dumps({'sub': 'pilot-local-lease'}).encode()).rstrip(b'=')
        scanner.scan(b'e30.' + claims + b'.' + b'1'*48, 'lease')
        self.assertIn(('lease', 'gateway lease credential'), scanner.findings)

    def test_secret_in_deleted_file_remains_detectable_in_history_and_bundle(self):
        secret = b'test-only-deleted-history-secret-value'
        with tempfile.TemporaryDirectory() as folder:
            repo = Path(folder)/'repo'
            subprocess.run(['git', 'init', '-q', str(repo)], check=True)
            subprocess.run(['git', '-C', str(repo), 'config', 'user.name', 'Test'], check=True)
            subprocess.run(['git', '-C', str(repo), 'config', 'user.email', 'test@example.invalid'], check=True)
            (repo/'old.txt').write_bytes(secret)
            subprocess.run(['git', '-C', str(repo), 'add', '.'], check=True)
            subprocess.run(['git', '-C', str(repo), 'commit', '-qm', 'original'], check=True)
            subprocess.run(['git', '-C', str(repo), 'rm', '-q', 'old.txt'], check=True)
            subprocess.run(['git', '-C', str(repo), 'commit', '-qm', 'delete'], check=True)
            scanner = module.Scanner({secret})
            scanner.scan_git(repo, 'history')
            self.assertTrue(scanner.findings)
            bundle = Path(folder)/'history.bundle'
            subprocess.run(['git', '-C', str(repo), 'bundle', 'create', str(bundle), '--all'], check=True, capture_output=True)
            scanner = module.Scanner({secret})
            scanner.scan(bundle.read_bytes(), 'bundle')
            self.assertTrue(scanner.findings)
            self.assertEqual(scanner.bundles, 1)

    def test_raw_git_loose_object_decoded_and_empty_corruption_retained(self):
        secret=b'test-only-compressed-git-secret'
        scanner=module.Scanner({secret})
        label='workspace.tar::work/.git/objects/ab/'+'c'*38
        scanner.scan(zlib.compress(b'blob '+str(len(secret)).encode()+b'\x00'+secret),label)
        self.assertIn((label+'::loose-object','known credential'),scanner.findings)
        scanner.scan(b'',label)
        with self.assertRaises(zlib.error):scanner.scan(b'corrupt compressed bytes',label)

    def test_raw_git_pack_includes_deleted_secret(self):
        secret=b'test-only-packed-deleted-secret'
        with tempfile.TemporaryDirectory() as folder:
            repo=Path(folder)/'repo'
            subprocess.run(['git','init','-q',str(repo)],check=True)
            subprocess.run(['git','-C',str(repo),'config','user.name','Test'],check=True)
            subprocess.run(['git','-C',str(repo),'config','user.email','test@example.invalid'],check=True)
            (repo/'secret.txt').write_bytes(secret)
            subprocess.run(['git','-C',str(repo),'add','.'],check=True)
            subprocess.run(['git','-C',str(repo),'commit','-qm','fixture'],check=True)
            subprocess.run(['git','-C',str(repo),'gc'],check=True,capture_output=True)
            scanner=module.Scanner({secret})
            pack=next((repo/'.git/objects/pack').glob('*.pack'))
            scanner.scan(pack.read_bytes(),'raw-git-pack')
            self.assertTrue(scanner.findings)

    def test_credential_fields_and_public_ids(self):
        result = module.credential_values({'provider': {'access': 'test-only-access-credential', 'refresh_token': 'test-only-refresh-credential', 'accountId': 'test-only-host-account-routing-id', 'public_id': 'public-identification'}})
        self.assertEqual(result, {b'test-only-access-credential', b'test-only-refresh-credential', b'test-only-host-account-routing-id'})


if __name__ == '__main__':
    unittest.main()
