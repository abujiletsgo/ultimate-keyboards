import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
WIN = ROOT / "native" / "packaging" / "windows"
TRANSPORT = (ROOT / "src-tauri" / "src" / "native_remapping" / "transport.rs").read_text()


def const(name):
    return re.search(rf'pub const {name}: &str = r?"([^"]+)"', TRANSPORT).group(1)


class WindowsInstallerConfig(unittest.TestCase):
    def test_windows_config_is_per_user_nsis_with_hooks_and_bootstrapper(self):
        conf = json.loads((ROOT / "src-tauri" / "tauri.windows.conf.json").read_text())
        win = conf["bundle"]["windows"]
        self.assertEqual(conf["bundle"]["targets"], ["nsis"])
        self.assertEqual(win["nsis"]["installMode"], "currentUser")
        self.assertEqual(win["webviewInstallMode"]["type"], "downloadBootstrapper")
        hooks = (ROOT / "src-tauri" / win["nsis"]["installerHooks"]).resolve()
        self.assertEqual(hooks, WIN / "installer-hooks.nsh")
        self.assertIn("../native/packaging/windows/stop-service.ps1", conf["bundle"]["resources"])
        for rel in conf["bundle"]["resources"]:
            self.assertTrue((ROOT / "src-tauri" / rel).is_file(), rel)

    def test_sidecar_name_matches_what_the_app_looks_for(self):
        conf = json.loads((WIN / "tauri.installer.conf.json").read_text())
        (sidecar,) = conf["bundle"]["externalBin"]
        self.assertEqual(Path(sidecar).name + ".exe", const("WINDOWS_SERVICE_EXE"))

    def test_hooks_use_the_apps_run_value_and_stop_before_replace(self):
        hooks = (WIN / "installer-hooks.nsh").read_text()
        self.assertIn(f'!define UK_RUN_VALUE "{const("WINDOWS_RUN_VALUE")}"', hooks)
        self.assertIn(f'!define UK_RUN_KEY "{const("WINDOWS_RUN_SUBKEY")}"', hooks)
        self.assertIn(f'!define UK_SERVICE_EXE "{const("WINDOWS_SERVICE_EXE")}"', hooks)
        for macro in ("PREINSTALL", "POSTINSTALL", "PREUNINSTALL", "POSTUNINSTALL"):
            self.assertIn(f"!macro NSIS_HOOK_{macro}", hooks)
        self.assertIn("WriteRegStr HKCU", hooks)
        self.assertIn("DeleteRegValue HKCU", hooks)
        self.assertNotIn("HKLM", hooks)

    def test_stop_script_speaks_the_service_contract(self):
        script = (WIN / "stop-service.ps1").read_text()
        self.assertIn("ultimatekeyboards-remapper", script)
        self.assertIn("command", script)
        self.assertIn("restart", script)

    def test_ci_uploads_both_installer_artifacts(self):
        ci = (ROOT / ".github" / "workflows" / "ci.yml").read_text()
        self.assertIn("uk-windows-${{ matrix.arch }}", ci)
        self.assertIn("arch: x64", ci)
        self.assertIn("arch: arm64", ci)


if __name__ == "__main__":
    unittest.main()
