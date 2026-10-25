#!/usr/bin/env python3
"""Build/inspect the native setup package; never install, load jobs, or inject input."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
PACKAGING = ROOT / "native/packaging"
OUTPUT = ROOT / "native/installer/UltimateKeyboards-Native-Setup.pkg"
VERSION = json.loads((ROOT / "package.json").read_text())["version"]
BASE = Path("Library/Application Support/com.ultimatekeyboards.app/Native")
HELPER_APP = BASE / "Ultimate Keyboards Remapper.app"
HELPER_BIN = HELPER_APP / "Contents/MacOS/ultimate-keyboards-remapper"
HELPER_ICON_SOURCE = ROOT / "src-tauri/icons/icon.icns"
HELPER_ICON_NAME = "icon.icns"
DAEMON_APP = "/Library/Application Support/org.pqrs/Karabiner-DriverKit-VirtualHIDDevice/Applications/Karabiner-VirtualHIDDevice-Daemon.app"
DAEMON_INFO = DAEMON_APP + "/Contents/Info.plist"
MANAGER_APP = "/Applications/.Karabiner-VirtualHIDDevice-Manager.app"
DRIVER_RECEIPT = "/var/db/receipts/org.pqrs.Karabiner-DriverKit-VirtualHIDDevice.plist"
DRIVER_ID = "org.pqrs.Karabiner-DriverKit-VirtualHIDDevice"
DRIVER_NAME = "Karabiner-DriverKit-VirtualHIDDevice-8.6.0.pkg"
DRIVER_SHA = "ff8c7fdc5e25387c7805fc7509a0fa9cf98f69ba582704f717fddcae47424387"
DRIVER_COMMIT = "9036bc771259ff8d61341f4d1b7072b954fdb2fa"
DRIVER_URL = f"https://raw.githubusercontent.com/pqrs-org/Karabiner-DriverKit-VirtualHIDDevice/{DRIVER_COMMIT}/dist/{DRIVER_NAME}"
DRIVER_PROVENANCE = HELPER_APP / "Contents/Resources/Provenance" / DRIVER_NAME
APPLICATION_INTEGRITY = HELPER_APP / "Contents/Resources/ApplicationIntegrity.json"
HELPER_PACKAGE = "UltimateKeyboards-Helper.pkg"
HELPER_ID = "com.ultimatekeyboards.native-helper"
APP_ID = "com.ultimatekeyboards.app"
APP_PACKAGE_ID = "com.ultimatekeyboards.application"
APP_PACKAGE = "UltimateKeyboards-Application.pkg"
APP_INSTALL_PATH = Path("Applications/Ultimate Keyboards.app")
APP_REPAIR_PATH = Path("Contents/Resources/native/UltimateKeyboards-Native-Setup.pkg")
DAEMON_LABEL = "org.pqrs.service.daemon.Karabiner-VirtualHIDDevice-Daemon"
COMPATIBLE = ("8.5.0", "8.6.0")
MINIMUM_OS = "13.0"
SERVICE_VERSION = re.search(r'(?m)^version\s*=\s*"([^"]+)"', (ROOT / "native/service/Cargo.toml").read_text()).group(1)


def run(args, *, cwd=None, env=None, check=True, timeout=None):
    command_env = (env or os.environ).copy()
    command_env["LC_ALL"] = "C"
    result = subprocess.run([str(a) for a in args], cwd=cwd, env=command_env,
                            text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=timeout)
    if check and result.returncode:
        raise RuntimeError(f"Command failed ({result.returncode}): {' '.join(map(str, args))}\n{result.stdout}")
    return result


def sha256(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def repair_package_path(value):
    path = Path(value).absolute()
    if path.is_symlink() or not path.is_file():
        raise ValueError("Expected repair package must be an existing real file, not a symlink")
    return path


def require_production_signature(details, subject):
    if not re.search(r"(?m)^Authority=Developer ID Application:", details):
        raise ValueError(f"Production {subject} must have a Developer ID Application signature")
    if not re.search(r"flags=0x[0-9a-fA-F]+\([^)]*\bruntime\b[^)]*\)", details):
        raise ValueError(f"Production {subject} must enable hardened runtime")
    if not re.search(r"(?m)^Timestamp=", details):
        raise ValueError(f"Production {subject} requires a secure signing timestamp")


def require_minimum_os(info, subject):
    value = info.get("LSMinimumSystemVersion")
    if not isinstance(value, str) or not re.fullmatch(r"13\.0(?:\.0)?", value):
        raise ValueError(f"{subject} minimum macOS version must match distribution {MINIMUM_OS}")


def helper_build_info(helper, team_id):
    data = json.loads(run([helper, "--build-info"], timeout=5).stdout)
    if not isinstance(data, dict) or type(data.get("protocolVersion")) is not int or data["protocolVersion"] != 1:
        raise ValueError("Helper build-info has an unsupported protocol")
    if data.get("version") != SERVICE_VERSION or data.get("targetArchitecture") != "aarch64":
        raise ValueError("Helper build-info version/architecture does not match this release")
    if data.get("trustedTeamId") != team_id:
        raise ValueError("Helper compiled trusted Team ID does not match signing Team ID")
    return data


def notarize(path, profile):
    result = json.loads(run(["/usr/bin/xcrun", "notarytool", "submit", path,
                            "--keychain-profile", profile, "--wait", "--output-format", "json"]).stdout)
    if not isinstance(result, dict) or result.get("status") != "Accepted" or not isinstance(result.get("id"), str) or not result["id"]:
        raise RuntimeError("Notarization was not explicitly Accepted: " + json.dumps(result))
    run(["/usr/bin/xcrun", "stapler", "staple", path])
    run(["/usr/bin/xcrun", "stapler", "validate", path])
    return {"id": result["id"], "status": result["status"]}


def verify_lifecycle(expanded, payload):
    paths = {name: expanded / "Scripts" / name for name in ("preinstall", "postinstall")}
    paths.update({name: payload / BASE / name for name in ("ensure-virtual-hid.sh", "uninstall.sh")})
    hashes = {}
    for name, target in paths.items():
        if target.is_symlink() or not target.is_file() or sha256(target) != sha256(PACKAGING / name):
            raise RuntimeError(f"Packaged lifecycle script differs from current release source: {name}")
        hashes[name] = sha256(target)
    return hashes


def driver_signature(path):
    result = run(["/usr/sbin/pkgutil", "--check-signature", path]).stdout
    required = ("Developer ID Installer:", "(G43BCU2T37)",
                "Notarization: trusted by the Apple notary service")
    if not all(x in result for x in required):
        raise RuntimeError("Pinned driver package signature/notarization did not match pqrs identity:\n" + result)
    return result


def get_driver(destination, provided=None):
    candidates = [Path(provided)] if provided else [
        Path("/tmp/uk-native-driverkit-v8.6.0/dist") / DRIVER_NAME,
        ROOT / "native/installer" / DRIVER_NAME,
    ]
    for path in candidates:
        if path.is_file() and sha256(path) == DRIVER_SHA:
            shutil.copy2(path, destination)
            break
    else:
        if provided:
            raise RuntimeError("--driver-package is missing or has the wrong pinned SHA-256")
        with urllib.request.urlopen(DRIVER_URL, timeout=90) as response, Path(destination).open("wb") as out:
            shutil.copyfileobj(response, out)
    if sha256(destination) != DRIVER_SHA:
        raise RuntimeError("Downloaded driver package did not match pinned SHA-256")
    return driver_signature(destination)


def installation_state(info=DAEMON_INFO, manager=MANAGER_APP, receipt=DRIVER_RECEIPT):
    info_path = Path(info)
    if info_path.exists():
        try:
            data = plistlib.loads(info_path.read_bytes())
            return "compatible" if data.get("CFBundleShortVersionString") in COMPATIBLE else "unsupported"
        except (ValueError, OSError, plistlib.InvalidFileException):
            return "unsupported"
    if Path(info).parents[1].exists() or Path(manager).exists() or Path(receipt).exists():
        return "unsupported"
    return "missing"


def distribution_script():
    # Installer JS is ES3-compatible. No system.run/external script permissions.
    return f"""
function installedState() {{
  var infoPath = {json.dumps(DAEMON_INFO)};
  if (system.files.fileExistsAtPath(infoPath)) {{
    try {{
      var info = system.files.plistAtPath(infoPath);
      var v = info.CFBundleShortVersionString;
      return (v === '8.5.0' || v === '8.6.0') ? 'compatible' : 'unsupported';
    }} catch (e) {{ return 'unsupported'; }}
  }}
  if (system.files.fileExistsAtPath({json.dumps(DAEMON_APP)}) ||
      system.files.fileExistsAtPath({json.dumps(MANAGER_APP)}) ||
      system.files.fileExistsAtPath({json.dumps(DRIVER_RECEIPT)})) return 'unsupported';
  return 'missing';
}}
function needsDriver() {{ return installedState() === 'missing'; }}
function checkCompatibility() {{
  if (installedState() === 'unsupported') {{
    my.result.type = 'Fatal';
    my.result.title = 'Shared keyboard driver needs attention';
    my.result.message = 'An unknown or incomplete shared driver is installed. Ultimate Keyboards supports versions 8.5.0 and 8.6.0 and will not replace another product’s driver. Setup has stopped without upgrading or downgrading it.';
    return false;
  }}
  return true;
}}
"""


def write_distribution(path, development, application=False):
    root = ET.Element("installer-gui-script", {"minSpecVersion": "2"})
    title = f"Ultimate Keyboards {VERSION}" if application else "Ultimate Keyboards Native Setup"
    ET.SubElement(root, "title").text = title + (" — DEVELOPMENT" if development else "")
    ET.SubElement(root, "welcome", {"file": "welcome.html", "mime-type": "text/html"})
    ET.SubElement(root, "conclusion", {"file": "conclusion.html", "mime-type": "text/html"})
    ET.SubElement(root, "options", {"customize": "never", "require-scripts": "true", "allow-external-scripts": "false", "rootVolumeOnly": "true", "hostArchitectures": "arm64"})
    ET.SubElement(ET.SubElement(root, "allowed-os-versions"), "os-version", {"min": MINIMUM_OS})
    ET.SubElement(root, "domains", {"enable_anywhere": "false", "enable_currentUserHome": "false", "enable_localSystem": "true"})
    ET.SubElement(root, "installation-check", {"script": "checkCompatibility()"})
    ET.SubElement(root, "script").text = distribution_script()
    outline = ET.SubElement(root, "choices-outline")
    if application:
        ET.SubElement(outline, "line", {"choice": "application"})
    ET.SubElement(outline, "line", {"choice": "helper"})
    ET.SubElement(outline, "line", {"choice": "driver"})
    entries = ([ ("application", APP_PACKAGE_ID, "Ultimate Keyboards application", "true") ] if application else []) + [
        ("helper", HELPER_ID, "Ultimate Keyboards native helper", "true"),
        ("driver", DRIVER_ID, "Standalone virtual keyboard driver (only when absent)", "needsDriver()"),
    ]
    for choice_id, package_id, title, selected in entries:
        choice = ET.SubElement(root, "choice", {"id": choice_id, "title": title,
                                "visible": "true", "enabled": "false", "selected": selected})
        ET.SubElement(choice, "pkg-ref", {"id": package_id})
    ET.SubElement(root, "pkg-ref", {"id": HELPER_ID, "version": VERSION, "auth": "Root"}).text = HELPER_PACKAGE
    ET.SubElement(root, "pkg-ref", {"id": DRIVER_ID, "version": "8.6.0", "auth": "Root"}).text = DRIVER_NAME
    if application:
        ET.SubElement(root, "pkg-ref", {"id": APP_PACKAGE_ID, "version": VERSION, "auth": "Root"}).text = APP_PACKAGE
        must_close = ET.SubElement(ET.SubElement(root, "pkg-ref", {"id": APP_PACKAGE_ID}), "must-close")
        ET.SubElement(must_close, "app", {"id": APP_ID})
    ET.indent(root)
    ET.ElementTree(root).write(path, encoding="utf-8", xml_declaration=True)


def write_installer_resources(resources, development, application=False):
    dev = "<p><strong>DEVELOPMENT BUILD — not notarized. Not for public distribution.</strong></p>" if development else ""
    style = 'html{color-scheme:light;background:white;color:#222}body{font:14px -apple-system;padding:24px;line-height:1.5}'
    bodies = {
        "welcome": '<h1>Native keyboard remapping</h1>' + dev +
            ('<p>Installs Ultimate Keyboards in Applications and completes native setup in this installer. Quit Ultimate Keyboards when Installer requests it; setup does not force the app to quit.</p>' if application else '') +
            '<p>Installs the Ultimate Keyboards helper and, only when absent, the signed standalone virtual keyboard driver. A compatible shared driver is preserved.</p>' +
            '<p>Ultimate Keyboards will launch in the background when you log in. The helper starts idle and captures no keyboard until you explicitly enable remapping in the app.</p>' +
            '<p>Administrator approval, driver activation, and Input Monitoring approval remain user-visible steps. This does not install Karabiner-Elements.</p>',
        "conclusion": '<h1>Setup files installed</h1>' + dev +
            '<p>Open Ultimate Keyboards, choose MacBook Keys, then open the Remapping tab.</p>' +
            '<p>Choose Activate keyboard driver when needed and follow the macOS approval instructions. Allow Ultimate Keyboards Remapper in System Settings → Privacy &amp; Security → Input Monitoring, then return and choose Check status.</p>' +
            '<p>When ready, choose Apply and enable to start remapping. Local profile Save and binding edits do not activate it. Use Stop to end remapping.</p>' +
            '<p>Installing files alone does not prove hardware capture or output works. Shared drivers and user rules are preserved by the included native uninstaller.</p>',
    }
    for name, body in bodies.items():
        document = ('<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8" />'
                    '<title>Ultimate Keyboards Setup</title><style>' + style +
                    '</style></head><body>' + body + '</body></html>\n')
        (resources / (name + ".html")).write_text(document, encoding="utf-8")


def verify_installer_resources(archive):
    distribution = ET.parse(archive / "Distribution").getroot()
    hashes = {}
    for name in ("welcome", "conclusion"):
        entries = distribution.findall(name)
        if len(entries) != 1 or entries[0].attrib != {"file": name + ".html", "mime-type": "text/html"}:
            raise RuntimeError(f"Installer {name} resource must declare text/html")
        path = archive / "Resources" / (name + ".html")
        if path.is_symlink() or not path.is_file():
            raise RuntimeError(f"Installer {name} HTML resource is missing or unsafe")
        content = path.read_text(encoding="utf-8")
        if not content.startswith('<!DOCTYPE html>\n'):
            raise RuntimeError(f"Installer {name} must be a complete HTML document")
        try:
            root = ET.fromstring(content)
        except ET.ParseError as error:
            raise RuntimeError(f"Installer {name} HTML structure is invalid") from error
        allowed = {"html", "head", "meta", "title", "style", "body", "h1", "p", "strong"}
        if root.tag != "html" or [node.tag for node in root] != ["head", "body"]:
            raise RuntimeError(f"Installer {name} must contain head and body")
        if ([node.tag for node in root.find("head")] != ["meta", "title", "style"]
                or len(list(root.iter("style"))) != 1):
            raise RuntimeError(f"Installer {name} contains unexpected active document structure")
        for node in root.iter():
            permitted = {"lang"} if node.tag == "html" else {"charset"} if node.tag == "meta" else set()
            if node.tag not in allowed or set(node.attrib) - permitted:
                raise RuntimeError(f"Installer {name} contains active or externally referenced content")
        meta, style, title, heading = (root.find(p) for p in ('head/meta', 'head/style', 'head/title', 'body/h1'))
        if (meta is None or meta.get('charset') != 'utf-8' or title is None or not title.text
                or heading is None or not heading.text or not root.findall('body/p')):
            raise RuntimeError(f"Installer {name} lacks encoding, title, or visible body content")
        css = style.text if style is not None and style.text else ''
        if 'color-scheme:light' not in css or re.search(r'url\s*\(|@import|dark', css, re.I):
            raise RuntimeError(f"Installer {name} style must be local and light only")
        hashes[name] = sha256(path)
    return hashes


def write_plist(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(plistlib.dumps(value, sort_keys=True))
    path.chmod(0o644)


def stage(root, helper, development):
    binary = root / HELPER_BIN
    binary.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(helper, binary)
    binary.chmod(0o755)
    resources = root / HELPER_APP / "Contents/Resources"
    resources.mkdir(parents=True, exist_ok=True)
    shutil.copy2(HELPER_ICON_SOURCE, resources / HELPER_ICON_NAME)
    (resources / HELPER_ICON_NAME).chmod(0o644)
    write_plist(root / HELPER_APP / "Contents/Info.plist", {
        "CFBundleIdentifier": "com.ultimatekeyboards.remapper",
        "CFBundleName": "Ultimate Keyboards Remapper", "CFBundleExecutable": binary.name,
        "CFBundleIconFile": HELPER_ICON_NAME,
        "CFBundlePackageType": "APPL", "CFBundleVersion": VERSION,
        "CFBundleShortVersionString": VERSION, "LSMinimumSystemVersion": MINIMUM_OS,
        "LSUIElement": True, "UKDevelopmentBuild": development,
    })
    state = root / BASE / "state"
    state.mkdir()
    state.chmod(0o700)
    for name in ("ensure-virtual-hid.sh", "uninstall.sh", "THIRD-PARTY.txt"):
        destination = root / BASE / name
        shutil.copy2(PACKAGING / name, destination)
        destination.chmod(0o755 if name.endswith(".sh") else 0o644)
    notices = root / BASE / "Licenses"
    notices.mkdir()
    for name in ("UPSTREAM-LICENSE.md", "manifest.json"):
        source = ROOT / "native/vendor" / name
        if source.exists():
            shutil.copy2(source, notices / name)
    for name in ("THIRD-PARTY.md", "upstream-package-lock.cmake"):
        source = ROOT / "native/vendor" / name
        if source.is_file():
            shutil.copy2(source, notices / name)
    source_licenses = ROOT / "native/vendor/licenses"
    if source_licenses.is_dir():
        shutil.copytree(source_licenses, notices / "dependencies")
    common = {"RunAtLoad": True, "AssociatedBundleIdentifiers": ["com.ultimatekeyboards.app"]}
    write_plist(root / "Library/LaunchDaemons/com.ultimatekeyboards.remapper.plist", {
        **common, "Label": "com.ultimatekeyboards.remapper", "KeepAlive": True,
        "ProgramArguments": ["/" + str(HELPER_BIN)], "ProcessType": "Interactive",
        "UserName": "root", "GroupName": "wheel", "Umask": 0o077,
    })
    write_plist(root / "Library/LaunchDaemons/com.ultimatekeyboards.virtual-hid-launcher.plist", {
        **common, "Label": "com.ultimatekeyboards.virtual-hid-launcher",
        "ProgramArguments": ["/" + str(BASE / "ensure-virtual-hid.sh")],
        "StartInterval": 60, "UserName": "root", "GroupName": "wheel",
    })
    write_plist(root / BASE / "virtual-hid-daemon.plist", {
        "Label": DAEMON_LABEL, "KeepAlive": True, "ProcessType": "Interactive",
        "ProgramArguments": [DAEMON_APP + "/Contents/MacOS/Karabiner-VirtualHIDDevice-Daemon"],
    })
    write_plist(root / "Library/LaunchAgents/com.ultimatekeyboards.app.plist", {
        "Label": "com.ultimatekeyboards.app", "RunAtLoad": True,
        "LimitLoadToSessionType": "Aqua", "AssociatedBundleIdentifiers": ["com.ultimatekeyboards.app"],
        "ProgramArguments": ["/Applications/Ultimate Keyboards.app/Contents/MacOS/ultimate-keyboards", "--native-background"],
    })
    return root / HELPER_APP


def validate_options(args):
    if getattr(args, "helper", None) and not getattr(args, "no_build", False):
        raise ValueError("--helper selects a prebuilt binary and requires --no-build")
    if getattr(args, "application", None) and (not args.team_id or args.identity == "-"):
        raise ValueError("Combined application setup requires a certificate identity and --team-id")
    if args.team_id and not re.fullmatch(r"[A-Z0-9]{10}", args.team_id):
        raise ValueError("--team-id must be the 10-character certificate Team ID")
    if args.development:
        if args.identity != "-" and not args.team_id:
            raise ValueError("Certificate-signed development builds require --team-id")
    else:
        if not args.identity.startswith("Developer ID Application:") or not args.team_id:
            raise ValueError("Production requires explicit --identity 'Developer ID Application: …' and --team-id")
        if not args.installer_identity or not args.installer_identity.startswith("Developer ID Installer:"):
            raise ValueError("Production requires --installer-identity 'Developer ID Installer: …'")
        if not args.notary_profile:
            raise ValueError("Production requires --notary-profile (notarytool keychain profile)")
    if args.identity != "-":
        identities = run(["/usr/bin/security", "find-identity", "-v", "-p", "codesigning"]).stdout
        if f'"{args.identity}"' not in identities:
            raise ValueError("Requested application signing identity is unavailable in the keychain")
    if args.installer_identity:
        identities = run(["/usr/bin/security", "find-identity", "-v"]).stdout
        if f'"{args.installer_identity}"' not in identities:
            raise ValueError("Requested installer signing identity is unavailable in the keychain")


def signing_requirement(team_id, identifier="com.ultimatekeyboards.remapper"):
    return f'anchor apple generic and certificate leaf[subject.OU] = "{team_id}" and identifier "{identifier}"'


def application_snapshot(path, team_id, development=True):
    """Validate an existing app without changing or re-signing any of its files."""
    app = Path(path).absolute()
    if app.is_symlink() or not app.is_dir():
        raise ValueError("Application must be a real app directory, not a symlink")
    for entry in app.rglob("*"):
        if entry.is_symlink() or not (entry.is_file() or entry.is_dir()):
            raise ValueError(f"Application contains a symlink or special file: {entry}")
    info = plistlib.loads((app / "Contents/Info.plist").read_bytes())
    if info.get("CFBundleIdentifier") != APP_ID:
        raise ValueError("Application bundle identifier must be com.ultimatekeyboards.app")
    if info.get("CFBundleShortVersionString") != VERSION or info.get("CFBundleVersion") != VERSION:
        raise ValueError(f"Application version must match package version {VERSION}")
    if info.get("CFBundleExecutable") != "ultimate-keyboards":
        raise ValueError("Application has an unexpected executable")
    binary = app / "Contents/MacOS/ultimate-keyboards"
    if not binary.is_file() or "Mach-O" not in run(["/usr/bin/file", "-b", binary]).stdout:
        raise ValueError("Application executable must be an actual Mach-O binary")
    if not team_id or not re.fullmatch(r"[A-Z0-9]{10}", team_id):
        raise ValueError("Application verification requires an expected Team ID")
    run(["/usr/bin/codesign", "--verify", "--strict", "--deep", "-R=" + signing_requirement(team_id, APP_ID), app])
    if not development:
        details = run(["/usr/bin/codesign", "-d", "--verbose=2", app]).stdout
        require_production_signature(details, "application")
        require_minimum_os(info, "Application")
    repair = app / APP_REPAIR_PATH
    if not repair.is_file():
        raise ValueError("Application is missing its native repair installer resource")
    hashes = {str(p.relative_to(app)): sha256(p) for p in sorted(app.rglob("*")) if p.is_file()}
    return {"bundleIdentifier": APP_ID, "version": VERSION, "teamId": team_id,
            "binarySha256": hashes["Contents/MacOS/ultimate-keyboards"],
            "repairPackageSha256": hashes[str(APP_REPAIR_PATH)], "fileHashes": hashes}


def check_root_ownership(expanded):
    bom = run(["/usr/bin/lsbom", "-p", "fmug", expanded / "Bom"]).stdout
    if any(line.split("\t")[-2:] != ["0", "0"] for line in bom.splitlines() if len(line.split("\t")) >= 4):
        raise RuntimeError("Payload contains non-root:wheel ownership")
    return bom


def verify_component_topology(archive):
    """PackageKit needs expanded component directories, not nested flat archives."""
    distribution = ET.parse(archive / "Distribution").getroot()
    options = distribution.find("options")
    if options is None or options.get("hostArchitectures") != "arm64":
        raise RuntimeError("Distribution must declare arm64 host architecture")
    if any(options.get(key) != value for key, value in {
        "require-scripts": "true", "allow-external-scripts": "false", "rootVolumeOnly": "true",
    }.items()):
        raise RuntimeError("Distribution must enforce compatibility scripts without external execution on the root volume")
    names = []
    for ref in distribution.findall("pkg-ref"):
        name = (ref.text or "").strip().removeprefix("#")
        if not name: continue
        if name not in (HELPER_PACKAGE, DRIVER_NAME, APP_PACKAGE):
            raise RuntimeError(f"Unexpected component reference: {name}")
        component = archive / name
        if component.is_symlink() or not component.is_dir():
            raise RuntimeError(f"Invalid PackageKit topology: {name} must be an expanded component directory, not a nested flat package")
        for required in ("PackageInfo", "Bom", "Payload"):
            child = component / required
            if child.is_symlink() or not child.is_file():
                raise RuntimeError(f"Incomplete PackageKit component: {name}/{required}")
        names.append(name)
    if len(names) != len(set(names)) or HELPER_PACKAGE not in names or DRIVER_NAME not in names:
        raise RuntimeError("Missing or duplicate required component references")
    return names


def file_hashes(directory):
    if any(p.is_symlink() for p in directory.rglob("*")):
        raise RuntimeError("Unexpected symlink in component archive")
    return {str(p.relative_to(directory)): sha256(p) for p in sorted(directory.rglob("*")) if p.is_file()}


def packagekit_admission(package, components, temp):
    probe = temp / "packagekit-preflight"
    run(["/usr/bin/xcrun", "clang", "-fobjc-arc", "-framework", "Foundation",
         PACKAGING / "packagekit-preflight.m", "-o", probe])
    result = json.loads(run([probe, package.resolve(), *components]).stdout)
    if not result.get("requestInitialized") or result.get("installationStarted") or result.get("authorizationRequested"):
        raise RuntimeError("PackageKit parser admission did not complete safely")
    expected_ids = {HELPER_PACKAGE: HELPER_ID, DRIVER_NAME: DRIVER_ID, APP_PACKAGE: APP_PACKAGE_ID}
    expected = {name: (expected_ids[name], "8.6.0" if name == DRIVER_NAME else VERSION) for name in components}
    actual = {x["component"]: (x["identifier"], x["version"]) for x in result["components"]}
    if len(result["components"]) != len(components) or actual != expected:
        raise RuntimeError("PackageKit parsed unexpected component identities")
    return result


def check_choices(package, destination, application=False):
    result = run(["/usr/sbin/installer", "-showChoicesXML", "-pkg", package, "-target", "/"])
    start = result.stdout.find("<?xml")
    if start < 0:
        raise RuntimeError("Installer did not return choice XML:\n" + result.stdout)
    xml = result.stdout[start:]
    destination.write_text(xml)
    data = plistlib.loads(xml.encode())
    choices = {}
    def visit(value):
        if isinstance(value, dict):
            if "choiceIdentifier" in value:
                choices[value["choiceIdentifier"]] = value
            for item in value.values(): visit(item)
        elif isinstance(value, list):
            for item in value: visit(item)
    visit(data)
    expected = ("driver", "helper", "application") if application else ("driver", "helper")
    if any(name not in choices for name in expected):
        raise RuntimeError("Expected installer choices missing")
    if any(choices[name].get("choiceSizeInKilobytes", 0) <= 0 for name in expected):
        raise RuntimeError("Installer did not resolve all embedded component payloads")
    if not choices["helper"].get("choiceIsSelected") or (application and not choices["application"].get("choiceIsSelected")):
        raise RuntimeError("Required application/helper component was deselected")
    selected = choices["driver"].get("choiceIsSelected")
    state = installation_state()
    if state in ("missing", "compatible") and bool(selected) != (state == "missing"):
        raise RuntimeError(f"Installer selected driver={selected} for installed state {state}")
    report = {"installedState": state, "driverSelected": bool(selected), "helperSelected": bool(choices["helper"].get("choiceIsSelected"))}
    if application: report["applicationSelected"] = bool(choices["application"].get("choiceIsSelected"))
    return report


def verify(package, development=False, team_id=None, expected_application=None, *, repair_only=False, expected_repair=None):
    if not package.is_file():
        raise RuntimeError(f"Package does not exist: {package}")
    if not development and not team_id:
        raise RuntimeError("Production verification requires the expected --team-id")
    report = {"package": str(package), "sha256": sha256(package), "development": development}
    outer = run(["/usr/sbin/pkgutil", "--check-signature", package], check=False)
    report["outerSignature"] = outer.stdout.strip()
    if not development and (outer.returncode or "Developer ID Installer:" not in outer.stdout or f"({team_id})" not in outer.stdout):
        raise RuntimeError("Production outer installer signature is absent or invalid")
    with tempfile.TemporaryDirectory(prefix="uk-verify-") as tmp:
        temp = Path(tmp)
        run(["/usr/bin/xar", "-xf", package], cwd=temp)
        components = verify_component_topology(temp)
        application = APP_PACKAGE in components
        report["fullProduct"] = application
        if repair_only and application:
            raise RuntimeError("Embedded repair installer must be repair-only, not a recursive application product")
        distribution = ET.parse(temp / "Distribution").getroot()
        report["installerResources"] = verify_installer_resources(temp)
        minimums = distribution.findall("allowed-os-versions/os-version")
        if len(minimums) != 1 or minimums[0].attrib != {"min": MINIMUM_OS}:
            raise RuntimeError("Installer lacks the required macOS minimum version")
        if expected_application is not None and not application:
            raise RuntimeError("Combined installer is missing its application component")
        expanded_product = temp / "expanded-product"
        run(["/usr/sbin/pkgutil", "--expand-full", package, expanded_product])
        expanded = expanded_product / HELPER_PACKAGE
        inner = expanded / "Payload" / DRIVER_PROVENANCE
        if not inner.is_file() or sha256(inner) != DRIVER_SHA:
            raise RuntimeError("Original signed driver provenance archive is missing or differs from its pin")
        report["driverSignature"] = driver_signature(inner).strip()
        original_driver = temp / "original-driver-component"
        original_driver.mkdir()
        run(["/usr/bin/xar", "-xf", inner], cwd=original_driver)
        original_hashes = file_hashes(original_driver)
        if file_hashes(temp / DRIVER_NAME) != original_hashes:
            raise RuntimeError("Executed driver component differs from the verified signed provenance archive")
        report["driverComponentHashes"] = original_hashes
        driver_payload = expanded_product / DRIVER_NAME / "Payload"
        daemon = driver_payload / DAEMON_APP.lstrip("/")
        manager = driver_payload / MANAGER_APP.lstrip("/")
        for bundle, identifier in [(daemon, "org.pqrs.Karabiner-VirtualHIDDevice-Daemon"),
                                   (manager, "org.pqrs.Karabiner-VirtualHIDDevice-Manager")]:
            run(["/usr/bin/codesign", "--verify", "--strict", "--deep", "-R=" + signing_requirement("G43BCU2T37", identifier), bundle])
        dexts = list(manager.rglob("*.dext"))
        if len(dexts) != 1: raise RuntimeError("Expected exactly one signed driver extension")
        run(["/usr/bin/codesign", "--verify", "--strict", "-R=" + signing_requirement("G43BCU2T37", DRIVER_ID), dexts[0]])
        report["driverCodeSignaturesVerified"] = True
        payload = expanded / "Payload"
        app = payload / HELPER_APP
        run(["/usr/bin/codesign", "--verify", "--strict", "--deep", app])
        if team_id:
            run(["/usr/bin/codesign", "--verify", "--strict", "-R=" + signing_requirement(team_id), app])
        report["helperSignature"] = run(["/usr/bin/codesign", "-d", "--verbose=2", app]).stdout.strip()
        if not development:
            require_production_signature(report["helperSignature"], "helper")
        if team_id:
            report["helperBuildInfo"] = helper_build_info(payload / HELPER_BIN, team_id)
        info = plistlib.loads((app / "Contents/Info.plist").read_bytes())
        require_minimum_os(info, "Helper")
        report["lifecycleHashes"] = verify_lifecycle(expanded, payload)
        report["version"] = info.get("CFBundleShortVersionString")
        if info.get("CFBundleIdentifier") != "com.ultimatekeyboards.remapper":
            raise RuntimeError("Helper has an incorrect bundle identity")
        if bool(info.get("UKDevelopmentBuild")) != development:
            raise RuntimeError("Development/production package flag does not match verification mode")
        icon = app / "Contents/Resources" / HELPER_ICON_NAME
        if info.get("CFBundleIconFile") != HELPER_ICON_NAME or icon.is_symlink() or not icon.is_file():
            raise RuntimeError("Helper icon reference does not resolve to its bundled brand icon")
        icon_sha = sha256(icon)
        if icon_sha != sha256(HELPER_ICON_SOURCE):
            raise RuntimeError("Packaged helper icon differs from the existing application ICNS asset")
        report["helperIcon"] = {"file": HELPER_ICON_NAME, "sha256": icon_sha, "source": "src-tauri/icons/icon.icns"}
        inventory = sorted(str(p.relative_to(payload)) for p in payload.rglob("*") if p.is_file())
        expected = [str(HELPER_BIN), "Library/LaunchDaemons/com.ultimatekeyboards.remapper.plist",
                    "Library/LaunchDaemons/com.ultimatekeyboards.virtual-hid-launcher.plist",
                    "Library/LaunchAgents/com.ultimatekeyboards.app.plist", str(BASE / "virtual-hid-daemon.plist")]
        if any(p not in inventory for p in expected):
            raise RuntimeError("Installer inventory is incomplete")
        if (payload / BASE / "state").stat().st_mode & 0o777 != 0o700:
            raise RuntimeError("Native state directory must be mode 0700")
        report["payloadOwnership"] = check_root_ownership(expanded)
        # pkgbuild --ownership recommended produces root:wheel, regardless of build user.
        report["inventory"] = inventory
        if application:
            app_expanded = expanded_product / APP_PACKAGE
            packaged_app = app_expanded / "Payload" / APP_INSTALL_PATH
            report["application"] = application_snapshot(packaged_app, team_id, development)
            recorded = json.loads((payload / APPLICATION_INTEGRITY).read_text())
            if report["application"] != recorded or (expected_application is not None and report["application"] != expected_application):
                raise RuntimeError("Packaged application bytes differ from the validated signed source")
            if expected_repair is not None and report["application"]["repairPackageSha256"] != sha256(repair_package_path(expected_repair)):
                raise RuntimeError("Application embeds a stale repair installer; refresh and re-sign the app first")
            if not development:
                # Copy out: verification writes choice receipts, never inside the signed app.
                repair_copy = temp / "embedded-repair.pkg"
                shutil.copy2(packaged_app / APP_REPAIR_PATH, repair_copy)
                repair_report = verify(repair_copy, False, team_id, repair_only=True)
                report["embeddedRepair"] = {"sha256": repair_report["sha256"], "notarized": repair_report["notarized"],
                                            "helperBuildInfo": repair_report["helperBuildInfo"],
                                            "lifecycleHashes": repair_report["lifecycleHashes"]}
            report["applicationOwnership"] = check_root_ownership(app_expanded)
            report["applicationInventory"] = sorted(str(p.relative_to(app_expanded / "Payload")) for p in (app_expanded / "Payload").rglob("*") if p.is_file())
            distribution = ET.parse(temp / "Distribution").getroot()
            if distribution.find(f"pkg-ref[@id='{APP_PACKAGE_ID}']/must-close/app[@id='{APP_ID}']") is None:
                raise RuntimeError("Combined installer lacks the required app-close instruction")
            component = ET.parse(app_expanded / "PackageInfo").getroot()
            if component.find("relocate/bundle") is not None:
                raise RuntimeError("Application component must not relocate an existing app")
        report["choices"] = check_choices(package, package.with_suffix(".choices.xml"), application)
        report["packageKitAdmission"] = packagekit_admission(package, components, temp)
    if not development:
        run(["/usr/bin/xcrun", "stapler", "validate", package])
        run(["/usr/sbin/spctl", "--assess", "--type", "install", "--verbose=2", package])
        report["notarized"] = True
    else:
        report["notarized"] = False
    return report


def build(args):
    validate_options(args)
    application = Path(args.application).absolute() if args.application else None
    source_application = application_snapshot(application, args.team_id, args.development) if application else None
    expected_repair = getattr(args, "repair_package", None)
    if expected_repair is not None:
        expected_repair = repair_package_path(expected_repair)
    elif not getattr(args, "output", None) and OUTPUT.is_file():
        expected_repair = OUTPUT
    if source_application is not None and expected_repair is not None and source_application["repairPackageSha256"] != sha256(expected_repair):
        raise ValueError("Application embeds a stale repair installer; refresh and re-sign the app first")
    destination = Path(args.output or (OUTPUT.parent / f"UltimateKeyboards-{VERSION}.pkg" if application else OUTPUT)).resolve()
    if application and (destination == OUTPUT.resolve() or destination.is_relative_to(application.resolve())):
        raise ValueError("Combined output must not overwrite the repair installer or signed source app")
    helper = Path(args.helper).resolve() if args.helper else ROOT / "native/service/target/release/ultimate-keyboards-remapper"
    if not args.no_build:
        env = os.environ.copy()
        env.pop("CARGO_TARGET_DIR", None)
        if args.team_id: env["UK_TEAM_ID"] = args.team_id
        else: env.pop("UK_TEAM_ID", None)
        print("Building native helper (no service is started)…", flush=True)
        result = run(["cargo", "build", "--locked", "--release", "--manifest-path", ROOT / "native/service/Cargo.toml"], env=env)
        print(result.stdout, end="", flush=True)
    if not helper.is_file():
        raise RuntimeError(f"Helper binary does not exist: {helper}; no placeholders are packaged")
    if "Mach-O" not in run(["/usr/bin/file", "-b", helper]).stdout:
        raise RuntimeError("Helper must be an actual compiled Mach-O executable")
    run(["/usr/bin/lipo", helper, "-verify_arch", "arm64"])
    if application:
        run(["/usr/bin/lipo", application / "Contents/MacOS/ultimate-keyboards", "-verify_arch", "arm64"])
    build_info = helper_build_info(helper, args.team_id) if args.identity != "-" else None
    helper_sha = sha256(helper)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="uk-native-package-") as tmp:
        temp = Path(tmp)
        packages = temp / "packages"
        packages.mkdir()
        get_driver(packages / DRIVER_NAME, args.driver_package)
        payload = temp / "root"
        payload.mkdir()
        helper_app = stage(payload, helper, args.development)
        if sha256(payload / HELPER_BIN) != helper_sha:
            raise RuntimeError("Helper binary changed while staging; rebuild with a stable source")
        provenance = payload / DRIVER_PROVENANCE
        provenance.parent.mkdir(parents=True)
        shutil.copy2(packages / DRIVER_NAME, provenance)
        if application:
            (payload / APPLICATION_INTEGRITY).write_text(json.dumps(source_application, indent=2) + "\n")
        # Build-machine provenance/resource attributes do not belong in payloads.
        run(["/usr/bin/xattr", "-cr", payload])
        sign = ["/usr/bin/codesign", "--force", "--sign", args.identity]
        if not args.development: sign += ["--options", "runtime", "--timestamp"]
        else: sign += ["--timestamp=none"]
        run(sign + [helper_app])
        run(["/usr/bin/codesign", "--verify", "--strict", "--deep", helper_app])
        if args.team_id and args.identity != "-":
            run(["/usr/bin/codesign", "--verify", "--strict", "-R=" + signing_requirement(args.team_id), helper_app])
        scripts = temp / "scripts"
        scripts.mkdir()
        for name in ("preinstall", "postinstall"):
            shutil.copy2(PACKAGING / name, scripts / name)
            (scripts / name).chmod(0o755)
        component_info = temp / "component.plist"
        component_info.write_bytes(plistlib.dumps([{
            "RootRelativeBundlePath": str(HELPER_APP), "BundleIsRelocatable": False,
            "BundleHasStrictIdentifier": True, "BundleIsVersionChecked": False,
            "BundleOverwriteAction": "upgrade",
        }]))
        component = ["/usr/bin/pkgbuild", "--root", payload, "--identifier", HELPER_ID,
                     "--version", VERSION, "--install-location", "/", "--ownership", "recommended",
                     "--component-plist", component_info, "--scripts", scripts]
        if args.installer_identity: component += ["--sign", args.installer_identity]
        run(component + [packages / HELPER_PACKAGE])
        if application:
            app_root = temp / "application-root"
            staged_app = app_root / APP_INSTALL_PATH
            staged_app.parent.mkdir(parents=True)
            shutil.copytree(application, staged_app, copy_function=shutil.copy2)
            if application_snapshot(staged_app, args.team_id, args.development) != source_application:
                raise RuntimeError("Signed application changed while staging")
            app_component_info = temp / "application-component.plist"
            app_component_info.write_bytes(plistlib.dumps([{
                "RootRelativeBundlePath": str(APP_INSTALL_PATH), "BundleIsRelocatable": False,
                "BundleHasStrictIdentifier": True, "BundleIsVersionChecked": False,
                "BundleOverwriteAction": "upgrade",
            }]))
            app_component = ["/usr/bin/pkgbuild", "--root", app_root, "--identifier", APP_PACKAGE_ID,
                             "--version", VERSION, "--install-location", "/", "--ownership", "recommended",
                             "--component-plist", app_component_info]
            if args.installer_identity: app_component += ["--sign", args.installer_identity]
            run(app_component + [packages / APP_PACKAGE])
        resources = temp / "resources"
        resources.mkdir()
        write_installer_resources(resources, args.development, bool(application))
        distribution = temp / "Distribution.xml"
        write_distribution(distribution, args.development, bool(application))
        command = ["/usr/bin/productbuild", "--distribution", distribution, "--resources", resources,
                   "--package-path", packages]
        # Keep productbuild's canonical expanded component topology intact.
        # The signed vendor archive is retained only as a provenance resource;
        # executed component files are compared byte-for-byte against its contents.
        pending = temp / destination.name
        if args.installer_identity: command += ["--sign", args.installer_identity]
        run(command + [pending])
        notary = notarize(pending, args.notary_profile) if not args.development else None
        report = verify(pending, args.development, args.team_id if args.identity != "-" else None, source_application, expected_repair=expected_repair)
        if application:
            if application_snapshot(application, args.team_id, args.development) != source_application:
                raise RuntimeError("Signed source application changed during packaging")
            report["sourceApplication"] = str(application)
        report.update({"sourceHelper": str(helper), "sourceHelperSha256": helper_sha, "sourceHelperBuildInfo": build_info,
                       "notarySubmission": notary,
                       "driverCommit": DRIVER_COMMIT, "driverSha256": DRIVER_SHA,
                       "teamId": args.team_id, "applicationIdentity": args.identity,
                       "installerIdentity": args.installer_identity, "package": str(destination)})
        with tempfile.NamedTemporaryFile(prefix=".uk-package-", dir=destination.parent, delete=False) as handle:
            staged_output = Path(handle.name)
        try:
            shutil.copy2(pending, staged_output)
            os.replace(staged_output, destination)
        finally:
            staged_output.unlink(missing_ok=True)
        report["choices"] = check_choices(destination, destination.with_suffix(".choices.xml"), bool(application))
        destination.with_suffix(".manifest.json").write_text(json.dumps(report, indent=2) + "\n")
        print(f"Built and verified: {destination}")
        print(f"SHA-256: {report['sha256']}")
        if args.development:
            print("DEVELOPMENT ONLY: installer is not notarized; its outer package may be unsigned. Nothing was installed or started.")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--development", action="store_true")
    parser.add_argument("--identity", default="-")
    parser.add_argument("--team-id")
    parser.add_argument("--installer-identity")
    parser.add_argument("--notary-profile")
    parser.add_argument("--no-build", action="store_true")
    parser.add_argument("--helper", help="Existing helper binary; --no-build never creates a placeholder")
    parser.add_argument("--application", "--app", help="Validated signed app to include in a separate combined installer")
    parser.add_argument("--repair-package", help="Expected embedded repair installer (combined build/verify; supports isolated release outputs)")
    parser.add_argument("--driver-package", help="Optional pinned standalone package; checksum must match")
    parser.add_argument("--output", help="Output path; defaults to Native-Setup or versioned combined installer")
    parser.add_argument("--verify", nargs="?", const=str(OUTPUT), help="Inspect an existing package instead of building")
    args = parser.parse_args(argv)
    try:
        if args.verify:
            expected = application_snapshot(args.application, args.team_id, args.development) if args.application else None
            repair = repair_package_path(args.repair_package) if args.repair_package else None
            print(json.dumps(verify(Path(args.verify).resolve(), args.development, args.team_id, expected, expected_repair=repair), indent=2))
        else:
            build(args)
        return 0
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        print(f"Native packaging failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
