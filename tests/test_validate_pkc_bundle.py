from __future__ import annotations

import base64
import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / 'tools' / 'validate_pkc_bundle.py'


def load_module():
    spec = importlib.util.spec_from_file_location('validate_pkc_bundle', MODULE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f'Could not load {MODULE_PATH}')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def encoded(data: bytes) -> str:
    return base64.b64encode(data).decode('ascii')


class ValidatePkcBundleTests(unittest.TestCase):
    def test_apply_actions_replaces_content_after_all_hash_checks(self):
        module = load_module()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / 'knowledge/example.md'
            target.parent.mkdir(parents=True)
            before = b'before\n'
            after = b'after\n'
            target.write_bytes(before)
            bundle = {
                'actions': [
                    {
                        'path': 'knowledge/example.md',
                        'operation': 'replace',
                        'before': encoded(before),
                        'content': encoded(after),
                        'expected_hash': hashlib.sha256(before).hexdigest(),
                        'new_hash': hashlib.sha256(after).hexdigest(),
                    }
                ]
            }
            self.assertEqual(
                module.apply_actions(root, bundle),
                ['knowledge/example.md'],
            )
            self.assertEqual(target.read_bytes(), after)

    def test_apply_actions_accepts_empty_before_for_new_file(self):
        module = load_module()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            module.apply_actions(
                root,
                {
                    'actions': [
                        {
                            'path': 'knowledge/new.md',
                            'operation': 'replace',
                            'before': encoded(b''),
                            'content': encoded(b'new\n'),
                            'expected_hash': hashlib.sha256(b'').hexdigest(),
                            'new_hash': hashlib.sha256(b'new\n').hexdigest(),
                        }
                    ]
                },
            )
            self.assertEqual((root / 'knowledge/new.md').read_bytes(), b'new\n')

    def test_link_locked_runtime_uses_project_lock(self):
        module = load_module()
        with tempfile.TemporaryDirectory() as source_directory, tempfile.TemporaryDirectory() as staged_directory:
            source = Path(source_directory)
            staged = Path(staged_directory)
            runtime_relative = Path('.local/pkc/runtimes/exact-commit')
            runtime = source / runtime_relative
            runtime.mkdir(parents=True)
            lock = source / 'tools/pkc-lock.json'
            lock.parent.mkdir(parents=True)
            lock.write_text(json.dumps({'runtime': str(runtime_relative)}))
            module.link_locked_runtime(source, staged)
            self.assertEqual(
                json.loads((staged / 'tools/pkc-lock.json').read_text())['runtime'],
                str(runtime_relative),
            )
            self.assertTrue((staged / runtime_relative).is_symlink())
            self.assertEqual((staged / runtime_relative).resolve(), runtime.resolve())

    def test_link_locked_runtime_rejects_path_escape(self):
        module = load_module()
        with tempfile.TemporaryDirectory() as source_directory, tempfile.TemporaryDirectory() as staged_directory:
            source = Path(source_directory)
            lock = source / 'tools/pkc-lock.json'
            lock.parent.mkdir(parents=True)
            lock.write_text(json.dumps({'runtime': '../outside'}))
            with self.assertRaisesRegex(RuntimeError, 'escapes the project'):
                module.link_locked_runtime(source, Path(staged_directory))

    def test_copy_applied_bundle_outputs_restores_only_audited_content(self):
        module = load_module()
        with tempfile.TemporaryDirectory() as source_directory, tempfile.TemporaryDirectory() as staged_directory:
            source = Path(source_directory)
            staged = Path(staged_directory)
            bundle_dir = source / 'data/knowledge/bundles'
            output = source / 'knowledge/applied.md'
            unrelated = source / 'build/cache.bin'
            bundle_dir.mkdir(parents=True)
            output.parent.mkdir(parents=True)
            unrelated.parent.mkdir(parents=True)
            output.write_bytes(b'applied\n')
            unrelated.write_bytes(b'cache')
            bundle = {
                'bundle_id': 'bnd_test',
                'content_hash': 'hash_test',
                'actions': [
                    {
                        'path': 'knowledge/applied.md',
                        'operation': 'replace',
                        'content': encoded(b'applied\n'),
                    }
                ],
            }
            (bundle_dir / 'bnd_test.json').write_text(json.dumps(bundle))
            (bundle_dir / 'bnd_test.applied.json').write_text(
                json.dumps({'bundle_id': 'bnd_test', 'content_hash': 'hash_test'})
            )
            module.copy_applied_bundle_outputs(source, staged)
            self.assertEqual(
                (staged / 'knowledge/applied.md').read_bytes(),
                b'applied\n',
            )
            self.assertFalse((staged / 'build/cache.bin').exists())

    def test_copy_applied_bundle_outputs_rejects_changed_output(self):
        module = load_module()
        with tempfile.TemporaryDirectory() as source_directory, tempfile.TemporaryDirectory() as staged_directory:
            source = Path(source_directory)
            bundle_dir = source / 'data/knowledge/bundles'
            output = source / 'knowledge/applied.md'
            bundle_dir.mkdir(parents=True)
            output.parent.mkdir(parents=True)
            output.write_bytes(b'changed\n')
            (bundle_dir / 'bnd_test.json').write_text(
                json.dumps(
                    {
                        'bundle_id': 'bnd_test',
                        'content_hash': 'hash_test',
                        'actions': [
                            {
                                'path': 'knowledge/applied.md',
                                'operation': 'replace',
                                'content': encoded(b'applied\n'),
                            }
                        ],
                    }
                )
            )
            (bundle_dir / 'bnd_test.applied.json').write_text(
                json.dumps({'bundle_id': 'bnd_test', 'content_hash': 'hash_test'})
            )
            with self.assertRaisesRegex(ValueError, 'differs from current file'):
                module.copy_applied_bundle_outputs(source, Path(staged_directory))

    def test_copy_action_baselines_copies_only_explicit_matching_before(self):
        module = load_module()
        with tempfile.TemporaryDirectory() as source_directory, tempfile.TemporaryDirectory() as staged_directory:
            source = Path(source_directory)
            staged = Path(staged_directory)
            baseline = source / 'knowledge/approved-structure.md'
            unrelated = source / 'build/cache.bin'
            baseline.parent.mkdir(parents=True)
            unrelated.parent.mkdir(parents=True)
            baseline.write_bytes(b'approved structure\n')
            unrelated.write_bytes(b'cache')
            module.copy_action_baselines(
                source,
                staged,
                {
                    'actions': [
                        {
                            'path': 'knowledge/approved-structure.md',
                            'before': encoded(b'approved structure\n'),
                        }
                    ]
                },
            )
            self.assertEqual(
                (staged / 'knowledge/approved-structure.md').read_bytes(),
                b'approved structure\n',
            )
            self.assertFalse((staged / 'build/cache.bin').exists())

    def test_copy_action_baselines_rejects_mismatched_working_content(self):
        module = load_module()
        with tempfile.TemporaryDirectory() as source_directory, tempfile.TemporaryDirectory() as staged_directory:
            source = Path(source_directory)
            target = source / 'knowledge/example.md'
            target.parent.mkdir(parents=True)
            target.write_bytes(b'changed\n')
            with self.assertRaisesRegex(ValueError, 'differs from before content'):
                module.copy_action_baselines(
                    source,
                    Path(staged_directory),
                    {
                        'actions': [
                            {
                                'path': 'knowledge/example.md',
                                'before': encoded(b'approved\n'),
                            }
                        ]
                    },
                )

    def test_apply_actions_rejects_path_escape(self):
        module = load_module()
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, 'unsafe bundle action path'):
                module.apply_actions(
                    Path(directory),
                    {
                        'actions': [
                            {
                                'path': '../outside',
                                'operation': 'create',
                                'content': encoded(b'bad'),
                            }
                        ]
                    },
                )

    def test_explicit_baseline_precedes_older_applied_output(self):
        source = MODULE_PATH.read_text()
        self.assertLess(
            source.index('copy_action_baselines(ROOT, staged_root, bundle)'),
            source.index('copy_applied_bundle_outputs(ROOT, staged_root)'),
        )

    def test_staged_check_sequence_rebuilds_before_queries(self):
        source = MODULE_PATH.read_text()
        self.assertLess(
            source.index("'rebuild'"),
            source.index("'validate'"),
        )

    def test_authority_path_check_reports_missing_paths(self):
        module = load_module()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            registry = root / 'data/knowledge/authority-refs.json'
            registry.parent.mkdir(parents=True)
            registry.write_text(
                json.dumps(
                    {
                        'schema_version': 1,
                        'refs': [{'path': 'missing-authority.md'}],
                    }
                )
            )
            result = module.check_authority_paths(root)
            self.assertEqual(result['returncode'], 1)
            self.assertIn('missing-authority.md', result['stdout'])


if __name__ == '__main__':
    unittest.main()
