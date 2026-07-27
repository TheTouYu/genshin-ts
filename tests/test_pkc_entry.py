from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENTRY = ROOT / "tools" / "pkc.py"


def load_entry_module():
    spec = importlib.util.spec_from_file_location("pkc_entry", ENTRY)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load {ENTRY}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PkcEntryTests(unittest.TestCase):
    def run_entry(self, *args: str, cwd: Path | None = None, isolated: bool = False):
        command = ["/usr/sbin/python3" if isolated and Path("/usr/sbin/python3").exists() else sys.executable]
        if isolated:
            command.append("-I")
        command.extend((str(ENTRY), *args))
        return subprocess.run(command, cwd=cwd or ROOT, text=True, encoding="utf-8", stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)

    def test_symlinked_venv_launcher_is_recognized_by_its_prefix(self):
        module = load_entry_module()
        runtime = ROOT / ".local" / "pkc-runtime"
        with mock.patch.object(module.sys, "prefix", str(runtime)):
            self.assertTrue(module._inside_pinned_runtime(ROOT))

    def test_forwarded_process_refuses_to_forward_again(self):
        module = load_entry_module()
        environment = {module._FORWARD_MARKER: "1"}
        with (
            mock.patch.dict(module.os.environ, environment, clear=True),
            mock.patch.object(module, "_inside_pinned_runtime", return_value=False),
            mock.patch.object(module, "_forward") as forward,
        ):
            self.assertEqual(module.main(["--runtime-version"]), 2)
        forward.assert_not_called()

    def test_help_discovers_progressive_query_from_arbitrary_cwd(self):
        with tempfile.TemporaryDirectory() as directory:
            result = self.run_entry("--help", cwd=Path(directory))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("progressive-query", result.stdout)

    def test_project_entry_uses_pinned_local_runtime_without_pythonpath(self):
        environment = dict(os.environ)
        environment.pop('PYTHONPATH', None)
        result = subprocess.run(
            ['/usr/sbin/python', str(ENTRY), '--help'],
            cwd=ROOT,
            text=True,
            encoding='utf-8',
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            env=environment,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('progressive-query', result.stdout)

    def test_project_entry_reports_the_pinned_distribution_version(self):
        environment = dict(os.environ)
        environment.pop('PYTHONPATH', None)
        result = subprocess.run(
            ['/usr/sbin/python', str(ENTRY), '--runtime-version'],
            cwd=ROOT,
            text=True,
            encoding='utf-8',
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            env=environment,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), '0.2.0rc1')

    def test_progressive_query_is_read_only(self):
        before = (ROOT / 'project-intelligence.json').read_bytes()
        result = self.run_entry(
            'progressive-query',
            '--context',
            'static-gil-assembly-production',
            '--intent',
            'screenshot-validation',
            '--check-authority',
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertTrue(payload['read_only'])
        self.assertFalse(payload['operation_authorized'])
        self.assertEqual(before, (ROOT / 'project-intelligence.json').read_bytes())

    def test_screenshot_language_selects_only_transform_knowledge(self):
        result = self.run_entry(
            'progressive-query',
            '--context',
            'static-gil-assembly-production',
            '--intent',
            '只看图，不写回，核对三个模型的位置关系和缩放',
            '--max-level',
            '2',
            '--limit',
            '3',
            '--check-authority',
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload['intent'], 'screenshot-validation')
        self.assertEqual(
            [topic['id'] for topic in payload['topics']],
            ['assembly-configuration'],
        )
        self.assertEqual(
            payload['minimum_files'],
            ['knowledge/static-gil-assets/assembly-configuration.md'],
        )
        self.assertFalse(payload['escalate_to_l3'])
        self.assertFalse(payload['operation_authorized'])

    def test_progress_language_selects_only_production_evidence(self):
        result = self.run_entry(
            'progressive-query',
            '--context',
            'static-gil-assembly-production',
            '--intent',
            '现在模型-装饰物列表规则解析到哪一步了',
            '--max-level',
            '2',
            '--limit',
            '3',
            '--check-authority',
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload['intent'], 'production-progress')
        self.assertEqual(
            [topic['id'] for topic in payload['topics']],
            ['static-assembly-production-evidence'],
        )
        self.assertEqual(
            payload['minimum_files'],
            ['knowledge/validation-evidence/static-assembly-production-evidence.md'],
        )
        self.assertFalse(payload['escalate_to_l3'])
        self.assertFalse(payload['operation_authorized'])


if __name__ == "__main__":
    unittest.main()
