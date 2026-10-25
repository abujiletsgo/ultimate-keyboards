import importlib.util
from pathlib import Path
import plistlib
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[3]
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("packaging_builder", ROOT / "scripts/build-native-installer.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class PackagingTests(unittest.TestCase):
    def installer_resource_fixture(self, root, development=True, application=False):
        builder.write_distribution(root / "Distribution", development, application)
        (root / "Resources").mkdir(exist_ok=True)
        builder.write_installer_resources(root / "Resources", development, application)

    def test_installer_documents_have_typed_complete_local_html_and_current_setup_steps(self):
        for development in (False, True):
            for application in (False, True):
                with self.subTest(development=development, application=application), tempfile.TemporaryDirectory() as directory:
                    root = Path(directory)
                    self.installer_resource_fixture(root, development, application)
                    self.assertEqual(set(builder.verify_installer_resources(root)), {"welcome", "conclusion"})
                    conclusion = ET.fromstring((root / "Resources/conclusion.html").read_text())
                    text = " ".join(conclusion.find("body").itertext())
                    for step in ("MacBook Keys", "Remapping", "Activate keyboard driver", "Ultimate Keyboards Remapper", "Input Monitoring", "Check status", "Apply and enable", "Stop"):
                        self.assertIn(step, text)
                    self.assertNotIn("select a keyboard", text)
                    self.assertEqual("DEVELOPMENT BUILD" in text, development)

    def test_installer_rejects_untyped_resources_that_were_rendered_as_literal_markup(self):
        for name in ("welcome", "conclusion"):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                self.installer_resource_fixture(root)
                tree = ET.parse(root / "Distribution")
                del tree.getroot().find(name).attrib["mime-type"]
                tree.write(root / "Distribution")
                with self.assertRaisesRegex(RuntimeError, "declare text/html"):
                    builder.verify_installer_resources(root)

    def test_installer_rejects_fragments_missing_bodies_and_invalid_utf8(self):
        for content in (b'<style>body{color:red}</style><h1>Setup</h1>', b'<!DOCTYPE html>\n<html><head /></html>', b'\xff'):
            with self.subTest(content=content), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                self.installer_resource_fixture(root)
                (root / "Resources/welcome.html").write_bytes(content)
                with self.assertRaises((RuntimeError, UnicodeDecodeError)):
                    builder.verify_installer_resources(root)

    def test_installer_rejects_active_or_remote_resource_content(self):
        for extra in ('<script>alert(1)</script>', '<img src="https://example.com/image" />', '<p onclick="alert(1)">text</p>', '<style>@import "https://example.com/style";</style>'):
            with self.subTest(extra=extra), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                self.installer_resource_fixture(root)
                path = root / "Resources/conclusion.html"
                content = path.read_text()
                if extra.startswith('<style>'):
                    content = content.replace('color-scheme:light', '@import "https://example.com/style";color-scheme:light')
                else:
                    content = content.replace('</body>', extra + '</body>')
                path.write_text(content)
                with self.assertRaisesRegex(RuntimeError, "active|local and light"):
                    builder.verify_installer_resources(root)

    def test_existing_version_policy(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            info = root / "Daemon.app/Contents/Info.plist"
            manager, receipt = root / "Manager.app", root / "receipt.plist"
            state = lambda: builder.installation_state(info, manager, receipt)
            self.assertEqual(state(), "missing")
            info.parent.mkdir(parents=True)
            self.assertEqual(state(), "unsupported")
            for version, expected in [("8.5.0", "compatible"), ("8.6.0", "compatible"), ("8.7.0", "unsupported"), ("7.0.0", "unsupported")]:
                info.write_bytes(plistlib.dumps({"CFBundleShortVersionString": version}))
                self.assertEqual(state(), expected)
            info.write_bytes(b"corrupt")
            self.assertEqual(state(), "unsupported")
            shutil.rmtree(info.parents[1])
            receipt.touch()
            self.assertEqual(state(), "unsupported")

    def test_distribution_has_only_local_components_and_no_external_script_execution(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "Distribution.xml"
            builder.write_distribution(output, True)
            root = ET.parse(output).getroot()
            self.assertEqual(root.find("options").get("rootVolumeOnly"), "true")
            self.assertEqual(root.find("options").get("require-scripts"), "true")
            self.assertEqual(root.find("options").get("allow-external-scripts"), "false")
            self.assertEqual(root.find("options").get("hostArchitectures"), "arm64")
            self.assertEqual(root.find("choice[@id='driver']").get("selected"), "needsDriver()")
            self.assertEqual(root.find("choice[@id='driver']").get("enabled"), "false")
            self.assertEqual({p.text for p in root.findall("pkg-ref")}, {builder.DRIVER_NAME, builder.HELPER_PACKAGE})
            self.assertNotIn("system.run", root.find("script").text)

    @unittest.skipUnless(shutil.which("node"), "Node is optional; macOS Installer choice verification is also run on builds")
    def test_actual_installer_javascript_allowlist_and_partial_install_block(self):
        script = builder.distribution_script()
        harness = r"""
const assert = require('assert');
let files = {}, info = {};
global.system = {files:{fileExistsAtPath:p=>!!files[p], plistAtPath:p=>info}};
global.my = {result:{}};
function test(v, state, selected) {
  files = {}; info = {};
  if(v !== null) { files[INFO] = true; info.CFBundleShortVersionString=v; }
  assert.strictEqual(installedState(),state);
  assert.strictEqual(needsDriver(),selected);
  assert.strictEqual(checkCompatibility(),state !== 'unsupported');
}
test(null,'missing',true);
test('8.5.0','compatible',false);
test('8.6.0','compatible',false);
test('8.7.0','unsupported',false);
test('7.0.0','unsupported',false);
test(undefined,'unsupported',false);
files = {[MANAGER]:true}; assert.strictEqual(checkCompatibility(),false);
files = {[RECEIPT]:true}; assert.strictEqual(checkCompatibility(),false);
"""
        import json
        constants = "const INFO=" + json.dumps(builder.DAEMON_INFO) + ",MANAGER=" + json.dumps(builder.MANAGER_APP) + ",RECEIPT=" + json.dumps(builder.DRIVER_RECEIPT) + ";\n"
        subprocess.run([shutil.which("node"), "-e", constants + script + harness], check=True)

    def test_stage_paths_permissions_and_idle_program(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "root"
            root.mkdir()
            helper = Path(directory) / "test-fixture"
            helper.write_bytes(b"unit-test fixture, never packaged as an artifact")
            builder.stage(root, helper, True)
            daemon = plistlib.loads((root / "Library/LaunchDaemons/com.ultimatekeyboards.remapper.plist").read_bytes())
            self.assertEqual(daemon["ProgramArguments"], ["/" + str(builder.HELPER_BIN)])
            self.assertTrue(daemon["RunAtLoad"])
            self.assertTrue(daemon["KeepAlive"])
            self.assertEqual(daemon["UserName"], "root")
            self.assertEqual((root / builder.BASE / "state").stat().st_mode & 0o777, 0o700)
            agent = plistlib.loads((root / "Library/LaunchAgents/com.ultimatekeyboards.app.plist").read_bytes())
            self.assertEqual(agent["ProgramArguments"][-1], "--native-background")
            self.assertNotIn("KeepAlive", agent)
            shared = plistlib.loads((root / builder.BASE / "virtual-hid-daemon.plist").read_bytes())
            self.assertEqual(shared["Label"], builder.DAEMON_LABEL)

    def test_scripts_have_no_shared_daemon_restart_or_driver_removal(self):
        for name in ("preinstall", "postinstall", "ensure-virtual-hid.sh", "uninstall.sh"):
            script = builder.PACKAGING / name
            subprocess.run(["/bin/bash", "-n", script], check=True)
            text = script.read_text()
            self.assertNotIn("killall", text)
            self.assertNotIn("kickstart", text)
            self.assertNotIn("bootout system/org.pqrs", text)
            self.assertNotIn("rm -rf '/Library/Application Support/org.pqrs", text)

    def test_production_requires_distribution_identities(self):
        args = SimpleNamespace(team_id=None, development=False, identity="-", installer_identity=None, notary_profile=None)
        with self.assertRaisesRegex(ValueError, "Production requires"):
            builder.validate_options(args)
        args.team_id = "bad"
        with self.assertRaisesRegex(ValueError, "10-character"):
            builder.validate_options(args)

    def test_driver_override_rejects_any_unpinned_bytes_before_packaging(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "wrong.pkg"
            source.write_bytes(b"not the pinned signed package")
            with self.assertRaisesRegex(RuntimeError, "wrong pinned SHA-256"):
                builder.get_driver(Path(directory) / "staged.pkg", source)

    def test_prebuilt_override_requires_explicit_no_build(self):
        args = SimpleNamespace(helper="existing-binary", no_build=False)
        with self.assertRaisesRegex(ValueError, "requires --no-build"):
            builder.validate_options(args)

    def test_combined_distribution_requires_app_close_and_keeps_driver_choice_policy(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "Distribution.xml"
            builder.write_distribution(output, True, application=True)
            root = ET.parse(output).getroot()
            self.assertEqual([x.get("choice") for x in root.findall("choices-outline/line")], ["application", "helper", "driver"])
            self.assertEqual(root.find("choice[@id='application']").get("selected"), "true")
            self.assertEqual(root.find("choice[@id='driver']").get("selected"), "needsDriver()")
            self.assertIsNotNone(root.find(f"pkg-ref[@id='{builder.APP_PACKAGE_ID}']/must-close/app[@id='{builder.APP_ID}']"))
            self.assertEqual({x.text.strip() for x in root.findall("pkg-ref") if x.text and x.text.strip()}, {builder.APP_PACKAGE, builder.HELPER_PACKAGE, builder.DRIVER_NAME})

    def make_app_fixture(self, root):
        app = root / "Fixture.app"
        binary = app / "Contents/MacOS/ultimate-keyboards"
        binary.parent.mkdir(parents=True)
        binary.write_bytes(b"fixture, never used in an installer artifact")
        (app / "Contents/Info.plist").write_bytes(plistlib.dumps({
            "CFBundleIdentifier": builder.APP_ID, "CFBundleExecutable": "ultimate-keyboards",
            "CFBundleShortVersionString": builder.VERSION, "CFBundleVersion": builder.VERSION,
        }))
        repair = app / builder.APP_REPAIR_PATH
        repair.parent.mkdir(parents=True)
        repair.write_bytes(b"fixture repair package")
        return app

    def test_application_rejects_symlink_root_and_symlink_members_before_tools(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(builder, "run") as run:
            root = Path(directory)
            app = self.make_app_fixture(root)
            link = root / "Link.app"
            link.symlink_to(app, target_is_directory=True)
            with self.assertRaisesRegex(ValueError, "not a symlink"):
                builder.application_snapshot(link, "9878YL387T")
            (app / "Contents/bad-link").symlink_to(app / "Contents/Info.plist")
            with self.assertRaisesRegex(ValueError, "contains a symlink"):
                builder.application_snapshot(app, "9878YL387T")
            run.assert_not_called()

    def test_application_rejects_wrong_identity_or_version_before_packaging(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(builder, "run") as run:
            app = self.make_app_fixture(Path(directory))
            info_path = app / "Contents/Info.plist"
            info = plistlib.loads(info_path.read_bytes())
            info["CFBundleIdentifier"] = "com.foreign.app"
            info_path.write_bytes(plistlib.dumps(info))
            with self.assertRaisesRegex(ValueError, "bundle identifier"):
                builder.application_snapshot(app, "9878YL387T")
            info["CFBundleIdentifier"] = builder.APP_ID
            info["CFBundleShortVersionString"] = "0.2.0"
            info_path.write_bytes(plistlib.dumps(info))
            with self.assertRaisesRegex(ValueError, "version must match"):
                builder.application_snapshot(app, "9878YL387T")
            run.assert_not_called()

    def test_application_requires_macho_and_exact_team_signature(self):
        with tempfile.TemporaryDirectory() as directory:
            app = self.make_app_fixture(Path(directory))
            with patch.object(builder, "run", return_value=SimpleNamespace(stdout="ASCII text")):
                with self.assertRaisesRegex(ValueError, "actual Mach-O"):
                    builder.application_snapshot(app, "9878YL387T")
            calls = []
            def untrusted(args, **kwargs):
                calls.append(args)
                if args[0] == "/usr/bin/file": return SimpleNamespace(stdout="Mach-O 64-bit executable arm64")
                self.assertIn('-R=anchor apple generic and certificate leaf[subject.OU] = "9878YL387T" and identifier "com.ultimatekeyboards.app"', args)
                raise RuntimeError("unsigned or foreign-team signature rejected")
            with patch.object(builder, "run", side_effect=untrusted):
                with self.assertRaisesRegex(RuntimeError, "signature rejected"):
                    builder.application_snapshot(app, "9878YL387T")
            self.assertEqual(len(calls), 2)

    def test_application_snapshot_tracks_binary_resources_and_signature_files(self):
        with tempfile.TemporaryDirectory() as directory:
            app = self.make_app_fixture(Path(directory))
            signature = app / "Contents/_CodeSignature/CodeResources"
            signature.parent.mkdir()
            signature.write_bytes(b"fixture seal")
            with patch.object(builder, "run", return_value=SimpleNamespace(stdout="Mach-O")):
                before = builder.application_snapshot(app, "9878YL387T")
                (app / builder.APP_REPAIR_PATH).write_bytes(b"changed resource")
                after = builder.application_snapshot(app, "9878YL387T")
            self.assertEqual(before["binarySha256"], after["binarySha256"])
            self.assertNotEqual(before["repairPackageSha256"], after["repairPackageSha256"])
            self.assertIn("Contents/_CodeSignature/CodeResources", before["fileHashes"])

    def test_combined_build_rejects_adhoc_helper_even_in_development(self):
        args = SimpleNamespace(application="Fixture.app", helper=None, identity="-", team_id="9878YL387T")
        with self.assertRaisesRegex(ValueError, "requires a certificate identity"):
            builder.validate_options(args)

    def test_combined_build_blocks_stale_embedded_repair_before_packaging(self):
        with tempfile.TemporaryDirectory() as directory:
            repair = Path(directory) / "NativeSetup.pkg"
            repair.write_bytes(b"current repair")
            args = SimpleNamespace(application="Fixture.app", team_id="9878YL387T", development=True)
            with patch.object(builder, "OUTPUT", repair), patch.object(builder, "validate_options"), \
                    patch.object(builder, "application_snapshot", return_value={"repairPackageSha256": "stale"}), \
                    patch.object(builder, "run") as run:
                with self.assertRaisesRegex(ValueError, "stale repair installer"):
                    builder.build(args)
                run.assert_not_called()

    def test_production_main_app_requires_developer_id_even_with_expected_team(self):
        with tempfile.TemporaryDirectory() as directory:
            app = self.make_app_fixture(Path(directory))
            with patch.object(builder, "run", return_value=SimpleNamespace(stdout="Mach-O; Authority=Apple Development: Fixture")):
                with self.assertRaisesRegex(ValueError, "Developer ID Application signature"):
                    builder.application_snapshot(app, "9878YL387T", development=False)

    def test_component_topology_rejects_nested_flat_archives(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            builder.write_distribution(root / "Distribution", True)
            for name in (builder.HELPER_PACKAGE, builder.DRIVER_NAME):
                component = root / name
                component.mkdir()
                for member in ("Bom", "Payload", "PackageInfo"):
                    (component / member).write_bytes(b"topology fixture")
            self.assertEqual(builder.verify_component_topology(root), [builder.HELPER_PACKAGE, builder.DRIVER_NAME])
            shutil.rmtree(root / builder.HELPER_PACKAGE)
            (root / builder.HELPER_PACKAGE).write_bytes(b"xar! nested flat archive")
            with self.assertRaisesRegex(RuntimeError, "must be an expanded component directory"):
                builder.verify_component_topology(root)

    def test_packagekit_admission_requires_exact_versions_and_complete_count(self):
        import json
        with tempfile.TemporaryDirectory() as directory:
            temp = Path(directory)
            valid = {"components": [{"component": builder.HELPER_PACKAGE, "identifier": builder.HELPER_ID, "version": builder.VERSION}],
                     "requestInitialized": True, "installationStarted": False, "authorizationRequested": False}
            for invalid in [dict(valid, components=[dict(valid["components"][0], version="0.2.0")]),
                            dict(valid, components=valid["components"] * 2),
                            dict(valid, components=[]), dict(valid, requestInitialized=False)]:
                with patch.object(builder, "run", return_value=SimpleNamespace(stdout=json.dumps(invalid))):
                    with self.assertRaises(RuntimeError):
                        builder.packagekit_admission(temp / "product.pkg", [builder.HELPER_PACKAGE], temp)

    @unittest.skipUnless(sys.platform == "darwin" and shutil.which("xcrun"), "Requires local macOS PackageKit")
    def test_real_packagekit_accepts_canonical_and_rejects_metadata_readable_flat_nesting(self):
        with tempfile.TemporaryDirectory() as directory:
            temp = Path(directory)
            root = temp / "payload"
            root.mkdir()
            (root / "uk-read-only-test-fixture.txt").write_text("Test payload; never installed.")
            component = temp / builder.HELPER_PACKAGE
            builder.run(["/usr/bin/pkgbuild", "--root", root, "--identifier", builder.HELPER_ID,
                         "--version", builder.VERSION, "--install-location", "/", component])
            canonical = temp / "canonical.pkg"
            builder.run(["/usr/bin/productbuild", "--package", component, canonical])
            self.assertTrue(builder.packagekit_admission(canonical, [builder.HELPER_PACKAGE], temp)["requestInitialized"])
            expanded = temp / "expanded"
            expanded.mkdir()
            builder.run(["/usr/bin/xar", "-xf", canonical], cwd=expanded)
            shutil.rmtree(expanded / builder.HELPER_PACKAGE)
            shutil.copy2(component, expanded / builder.HELPER_PACKAGE)
            malformed = temp / "malformed.pkg"
            # Intentional regression fixture; production builder never flattens a product.
            builder.run(["/usr/sbin/pkgutil", "--flatten", expanded, malformed])
            builder.run(["/usr/sbin/installer", "-pkginfo", "-pkg", malformed])
            with self.assertRaisesRegex(RuntimeError, "PackageKit rejected component URL"):
                builder.packagekit_admission(malformed, [builder.HELPER_PACKAGE], temp)


if __name__ == "__main__":
    unittest.main()
