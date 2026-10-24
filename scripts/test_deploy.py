"""Isolated deployment simulations: no SSH, network, sudo, or real systemd changes."""
from pathlib import Path
import os
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('deploy-tencent.sh').read_text()

class DeploymentTests(unittest.TestCase):
    def run_case(self, scenario):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        home = root / 'home'
        repo = home / 'apps/wensi'
        (repo / '.git').mkdir(parents=True)
        (repo / '.env.local').write_text('AI_API_KEY=not-a-real-key\n')
        fixtures = root / 'code'
        fixtures.mkdir()
        (fixtures / 'README.md').write_text('WriteWise')
        fakebin = root / 'bin'
        fakebin.mkdir()
        service_dir = root / 'systemd'
        service_dir.mkdir()
        node_dir = home / '.local/opt/node-v22.23.4-linux-x64/bin'
        node_dir.mkdir(parents=True)
        commands = {
            'id': '#!/bin/sh\nif [ "$1" = -un ]; then echo ubuntu; else /usr/bin/id "$@"; fi\n',
            'sudo': '#!/bin/sh\nif [ "$1" = -v ]; then exit 0; fi\nexec "$@"\n',
            'git': '''#!/bin/sh
case "$*" in
 *status*) if [ "$CASE" = dirty ]; then echo ' M README.md'; fi ;;
 *fetch*) exit 0 ;;
 *rev-parse*) echo aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ;;
 *archive*) /usr/bin/tar -cf - -C "$FIXTURE_CODE" . ;;
 *) exit 1 ;;
esac
''',
            'systemctl': '''#!/bin/sh
case "$1" in
 show)
   case "$*" in
    *property=User*) echo ubuntu ;;
    *property=WorkingDirectory*)
     file="$FAKE_SYSTEMD/wensi.service.d/50-writewise-release.conf"
     if [ -f "$file" ]; then sed -n 's/^WorkingDirectory=//p' "$file"; else echo "$HOME/apps/wensi"; fi ;;
   esac ;;
 is-active|daemon-reload|restart|status) exit 0 ;;
 *) exit 1 ;;
esac
''',
            'npm': '#!/bin/sh\nif [ "$CASE" = build-failure ] && [ "$1" = run ]; then exit 1; fi\nexit 0\n',
            'curl': '''#!/bin/sh
out=''
while [ "$#" -gt 0 ]; do
 case "$1" in
  -o) shift; out=$1 ;;
  http*) url=$1 ;;
 esac
 shift
done
if [ "$CASE" = post-failure ]; then
 case "$url" in *:3001/*) exit 22 ;; esac
fi
if [ "$out" != /dev/null ]; then
 printf '%s' '{"product":"writewise","schemaVersion":"writewise.review.v2","configured":true,"external":true,"model":"deepseek-chat"}' > "$out"
fi
''',
            'sleep': '#!/bin/sh\nexec /usr/bin/sleep 0.01\n',
        }
        for name, text in commands.items():
            p = fakebin / name
            p.write_text(text)
            p.chmod(0o700)
        node = node_dir / 'node'
        node.write_text('#!/bin/sh\nexec /usr/bin/sleep 60\n')
        node.chmod(0o700)
        script = root / 'deploy.sh'
        script.write_text(SCRIPT.replace('/etc/systemd/system/', str(service_dir) + '/'))
        env = dict(os.environ, HOME=str(home), PATH=str(fakebin) + ':/usr/bin:/bin',
                   CASE=scenario, FIXTURE_CODE=str(fixtures), FAKE_SYSTEMD=str(service_dir))
        # Do not inherit real model credentials into simulated processes.
        env = {k: v for k, v in env.items() if not k.startswith(('AI_', 'OPENAI_', 'OCR_'))}
        result = subprocess.run(['/bin/bash', str(script)], env=env, capture_output=True, text=True, timeout=15)
        dropin = service_dir / 'wensi.service.d/50-writewise-release.conf'
        return result, home, repo, dropin

    def test_success_keeps_old_checkout_and_copies_private_config(self):
        result, home, repo, dropin = self.run_case('success')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(dropin.exists())
        self.assertEqual((repo / '.env.local').read_text(), 'AI_API_KEY=not-a-real-key\n')
        releases = list((home / 'apps/writewise-releases').iterdir())
        self.assertEqual((releases[0] / '.env.local').stat().st_mode & 0o777, 0o600)
        self.assertTrue(list((home / 'apps/writewise-backups').glob('*/rollback.sh')))

    def test_build_failure_never_switches_service(self):
        result, _, repo, dropin = self.run_case('build-failure')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(dropin.exists())
        self.assertTrue((repo / '.env.local').exists())

    def test_failed_production_check_restores_old_service(self):
        result, _, _, dropin = self.run_case('post-failure')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(dropin.exists())
        self.assertIn('旧服务已恢复运行', result.stderr)

    def test_local_edits_abort_before_release(self):
        result, home, _, dropin = self.run_case('dirty')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(dropin.exists())
        self.assertFalse((home / 'apps/writewise-releases').exists())

if __name__ == '__main__':
    unittest.main()
