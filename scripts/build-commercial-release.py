#!/usr/bin/env python3
"""Build a complete macOS release candidate; never install or publish it.

Default mode is a read-only prerequisite report. --build signs and submits the
candidate to Apple's notary service using the selected keychain profile.
"""
import argparse
import json
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ('bun', 'cargo', 'xcrun', 'codesign', 'security', 'pkgbuild',
         'productbuild', 'pkgutil', 'hdiutil', 'spctl')


def command(args, **kwargs):
    print('+ ' + ' '.join(map(str, args)), flush=True)
    subprocess.run(list(map(str, args)), cwd=ROOT, check=True, **kwargs)


def version():
    return json.loads((ROOT / 'package.json').read_text())['version']


def prerequisites(args):
    """Report local build prerequisites without writing, requesting access or downloading."""
    failures = []
    app_config = json.loads((ROOT / 'src-tauri/tauri.conf.json').read_text())
    if app_config['version'] != version():
        failures.append('package.json and tauri.conf.json versions differ.')
    if platform.system() != 'Darwin' or platform.machine() != 'arm64':
        failures.append('The current product requires an Apple silicon macOS build host.')
    missing = [tool for tool in TOOLS if shutil.which(tool) is None]
    if missing:
        failures.append('Missing build tools: ' + ', '.join(missing))
    if not args.identity or not args.identity.startswith('Developer ID Application:'):
        failures.append('Supply --identity with a Developer ID Application certificate.')
    if not args.installer_identity or not args.installer_identity.startswith('Developer ID Installer:'):
        failures.append('Supply --installer-identity with a Developer ID Installer certificate.')
    if not args.team_id or not re.fullmatch(r'[A-Z0-9]{10}', args.team_id):
        failures.append('Supply the certificates\' actual ten-character --team-id.')
    if not args.notary_profile:
        failures.append('Supply --notary-profile for an existing notarytool keychain profile.')
    if shutil.which('security'):
        for identity, policy in ((args.identity, ['-p', 'codesigning']), (args.installer_identity, [])):
            if not identity:
                continue
            try:
                result = subprocess.run(['security', 'find-identity', '-v', *policy],
                                        capture_output=True, text=True, timeout=15)
                if result.returncode or f'"{identity}"' not in result.stdout:
                    failures.append('Requested signing certificate is not available: ' + identity)
            except (OSError, subprocess.TimeoutExpired):
                failures.append('Could not inspect the signing keychain.')
    return {'version': version(), 'buildPrerequisitesReady': not failures,
            'blockers': failures, 'notaryCredentialsVerified': False,
            'customerAcceptanceVerified': False, 'installationAttempted': False,
            'publicationAttempted': False}


def output_directory(value):
    path = Path(value).expanduser().absolute()
    if path.is_symlink():
        raise ValueError('Release output must not be a symlink.')
    path = path.resolve()
    # Keep the last delivered preview and its build products intact.
    for protected in (ROOT / 'native/installer', ROOT / 'src-tauri/target',
                      ROOT / 'native/service/target', ROOT / 'native/engine/target'):
        if path == protected or protected in path.parents or path in protected.parents:
            raise ValueError('Release output overlaps protected preview artifacts: ' + str(protected))
    if path == ROOT or path in ROOT.parents:
        raise ValueError('Use a dedicated release output directory.')
    return path


def build_plan(args, output):
    """A deterministic plan: repair -> signed app -> complete product -> signed DMG."""
    py = sys.executable
    builder = ROOT / 'scripts/build-native-installer.py'
    repair = output / 'UltimateKeyboards-Native-Setup.pkg'
    target = output / 'target'
    app = target / 'aarch64-apple-darwin/release/bundle/macos/Ultimate Keyboards.app'
    product = output / f'UltimateKeyboards-{version()}.pkg'
    dmg = output / f'UltimateKeyboards-{version()}.dmg'
    signing = ['--identity', args.identity, '--installer-identity', args.installer_identity,
               '--team-id', args.team_id, '--notary-profile', args.notary_profile]
    tests = [
        ['bun', 'install', '--frozen-lockfile'],
        ['bun', 'run', 'typecheck'], ['bun', 'test'],
        ['cargo', 'test', '--locked', '--manifest-path', 'native/engine/Cargo.toml'],
        ['cargo', 'test', '--locked', '--manifest-path', 'native/service/Cargo.toml'],
        ['cargo', 'test', '--locked', '--manifest-path', 'src-tauri/Cargo.toml', 'native_remapping', '--lib'],
        [py, '-m', 'unittest', 'discover', '-s', 'native/service/tests'],
        [py, '-m', 'unittest', 'discover', '-s', 'native/packaging/tests'],
        [py, '-m', 'unittest', 'discover', '-s', 'scripts/tests'],
    ]
    helper = target / 'release/ultimate-keyboards-remapper'
    steps = tests + [
        ['cargo', 'build', '--locked', '--release', '--manifest-path', 'native/service/Cargo.toml'],
        [helper, '--self-test'],
        [py, ROOT / 'native/service/tests/ipc_smoke.py', helper],
        [py, builder, *signing, '--no-build', '--helper', helper, '--output', repair],
        ['bunx', 'tauri', 'build', '--target', 'aarch64-apple-darwin',
         '--config', output / 'tauri.release.json', '--bundles', 'app'],
        [py, builder, *signing, '--application', app, '--repair-package', repair,
         '--no-build', '--helper', helper, '--output', product],
        [py, ROOT / 'native/packaging/build_delivery.py', '--package', product,
         '--repair-package', repair, '--readme', output / 'READ ME.txt', '--output', dmg,
         '--identity', args.identity, '--team-id', args.team_id, '--notary-profile', args.notary_profile],
    ]
    return {'steps': steps, 'repair': repair, 'app': app, 'product': product, 'dmg': dmg, 'target': target}


def build(args):
    report = prerequisites(args)
    print(json.dumps(report, indent=2), flush=True)
    if not report['buildPrerequisitesReady']:
        return 1
    output = output_directory(args.output or ROOT / 'native/release' / version())
    # A new candidate never overwrites a previous candidate or the shipped preview.
    if output.exists() and any(output.iterdir()):
        raise ValueError('Release output is not empty; choose a new candidate directory.')
    output.mkdir(parents=True, exist_ok=True)
    plan = build_plan(args, output)
    overlay = json.loads((ROOT / 'src-tauri/tauri.native.conf.json').read_text())
    overlay['bundle']['resources'] = {
        str(plan['repair']): 'native/UltimateKeyboards-Native-Setup.pkg',
        str(ROOT / 'native/vendor/UPSTREAM-LICENSE.md'): 'native/licenses/UPSTREAM-LICENSE.md',
        str(ROOT / 'native/vendor/manifest.json'): 'native/licenses/vendor-manifest.json',
    }
    overlay['bundle']['createUpdaterArtifacts'] = False
    overlay['bundle']['macOS'] = {'minimumSystemVersion': '13.0'}
    (output / 'tauri.release.json').write_text(json.dumps(overlay, indent=2) + '\n')
    (output / 'READ ME.txt').write_text(
        'Ultimate Keyboards\n\nOpen Install Ultimate Keyboards.pkg. This installs the app, '
        'keyboard service, and bundled virtual keyboard driver. Karabiner-Elements is not required.\n\n'
        'Open Ultimate Keyboards > MacBook Keys > Remapping. Approve Ultimate Keyboards Remapper '
        'in Input Monitoring and approve the bundled driver when macOS asks. The driver retains '
        'its upstream pqrs identity. Choose Check status, configure and save your keys, then '
        'choose Apply and enable. Stop remapping releases your built-in keyboard.\n\n'
        'Requires Apple silicon and macOS 13 or later. Update using the complete installer '
        'so the app and its service are updated together.\n')
    env = {**os.environ, 'CARGO_TARGET_DIR': str(plan['target']),
           'UK_TEAM_ID': args.team_id, 'APPLE_SIGNING_IDENTITY': args.identity,
           'APPLE_TEAM_ID': args.team_id}
    # Notarization belongs to the package/DMG stages using the chosen profile.
    # Do not let unrelated inherited Tauri credentials select another workflow.
    for key in ('APPLE_ID', 'APPLE_PASSWORD', 'APPLE_API_KEY', 'APPLE_API_ISSUER', 'APPLE_API_KEY_PATH'):
        env.pop(key, None)
    for step in plan['steps']:
        command(step, env=env)
    result = {key: str(plan[key]) for key in ('repair', 'app', 'product', 'dmg')}
    result.update(version=version(), signedAndNotarizedCandidate=True,
                  customerAcceptanceVerified=False, published=False,
                  requiredNextStep='Test the downloaded candidate on a clean Mac without Karabiner-Elements.')
    (output / 'release-candidate.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--build', action='store_true', help='Build and notarize a candidate; never install or publish.')
    parser.add_argument('--preflight', action='store_true', help='Read-only prerequisite report (the default).')
    parser.add_argument('--identity')
    parser.add_argument('--installer-identity')
    parser.add_argument('--team-id')
    parser.add_argument('--notary-profile')
    parser.add_argument('--output', help='Dedicated empty candidate directory; defaults to native/release/<version>.')
    args = parser.parse_args(argv)
    if args.build and args.preflight:
        parser.error('Choose --build or --preflight.')
    try:
        if args.build:
            return build(args)
        report = prerequisites(args)
        print(json.dumps(report, indent=2))
        return 0 if report['buildPrerequisitesReady'] else 1
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        print('Commercial candidate stopped: ' + str(error), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
