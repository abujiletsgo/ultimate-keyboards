import argparse
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1] / 'build-commercial-release.py'
spec = importlib.util.spec_from_file_location('commercial_release', SOURCE)
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


def options(**updates):
    values = dict(identity='Developer ID Application: Example (ABCDEFGHIJ)',
                  installer_identity='Developer ID Installer: Example (ABCDEFGHIJ)',
                  team_id='ABCDEFGHIJ', notary_profile='example-notary', output=None)
    return argparse.Namespace(**{**values, **updates})


class CommercialReleaseTests(unittest.TestCase):
    def test_production_plan_keeps_helper_app_and_repair_together_without_publishing(self):
        plan = release.build_plan(options(), Path('/Volumes/Work/candidate'))
        steps = [[str(arg) for arg in step] for step in plan['steps']]
        repairs = [step for step in steps if 'build-native-installer.py' in ' '.join(step)]
        self.assertEqual(len(repairs), 2)
        self.assertIn('--no-build', repairs[0])
        self.assertEqual(repairs[0][repairs[0].index('--helper') + 1],
                         repairs[1][repairs[1].index('--helper') + 1])
        self.assertEqual(repairs[0][repairs[0].index('--output') + 1],
                         repairs[1][repairs[1].index('--repair-package') + 1])
        app_stage = next(i for i, step in enumerate(steps) if step[:2] == ['bunx', 'tauri'])
        self.assertLess(steps.index(repairs[0]), app_stage)
        self.assertGreater(steps.index(repairs[1]), app_stage)
        self.assertTrue(steps[-1][1].endswith('build_delivery.py'))
        self.assertFalse(any('--development' in step or 'installer' == step[0] or 'gh' == step[0] for step in steps))

    def test_development_signing_does_not_satisfy_commercial_prerequisites(self):
        identities = subprocess.CompletedProcess([], 0, stdout='"Apple Development: Example"\n', stderr='')
        with patch.object(release.platform, 'system', return_value='Darwin'), \
             patch.object(release.platform, 'machine', return_value='arm64'), \
             patch.object(release.shutil, 'which', return_value='/test/tool'), \
             patch.object(release.subprocess, 'run', return_value=identities):
            report = release.prerequisites(options(identity='Apple Development: Example'))
        self.assertFalse(report['buildPrerequisitesReady'])
        self.assertTrue(any('Developer ID Application' in reason for reason in report['blockers']))
        self.assertFalse(report['customerAcceptanceVerified'])
        self.assertFalse(report['installationAttempted'])

    def test_missing_credentials_stop_build_before_any_write_or_build_command(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / 'must-not-be-created'
            with patch.object(release, 'prerequisites', return_value={'buildPrerequisitesReady': False}), \
                 patch.object(release, 'command') as execute:
                self.assertEqual(release.build(options(output=str(output))), 1)
            execute.assert_not_called()
            self.assertFalse(output.exists())

    def test_preview_and_source_output_cannot_be_overwritten(self):
        for path in (release.ROOT, release.ROOT / 'native/installer',
                     release.ROOT / 'native/installer/nested', release.ROOT / 'src-tauri/target'):
            with self.assertRaises(ValueError):
                release.output_directory(path)
        self.assertEqual(release.output_directory(release.ROOT / 'native/release/candidate'),
                         release.ROOT / 'native/release/candidate')


if __name__ == '__main__':
    unittest.main()
