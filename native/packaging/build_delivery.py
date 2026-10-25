#!/usr/bin/env python3
"""Build/verify a signed installer DMG. Never install, publish, or activate remapping."""
from __future__ import annotations
import argparse
import datetime
import importlib.util
import json
import os
from pathlib import Path
import plistlib
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("native_installer", ROOT / "scripts/build-native-installer.py")
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)
run = installer.run
sha256 = installer.sha256
IDENTIFIER = "com.ultimatekeyboards.installer"
VOLUME = "Ultimate Keyboards Setup"
PACKAGE_NAME = "Install Ultimate Keyboards.pkg"
README_NAME = "READ ME.txt"
PREVIEW_DIRECTORY = ROOT / "native/installer"


def real_file(value, label):
    path = Path(value).absolute()
    if path.is_symlink() or not path.is_file():
        raise ValueError(f"{label} must be an existing real file, not a symlink")
    return path


def validate_output(value):
    output = Path(value).absolute()
    if output.is_symlink() or output.resolve().is_relative_to(PREVIEW_DIRECTORY.resolve()):
        raise ValueError("Delivery output must be separate from the frozen native/installer previews")
    if output.suffix.lower() != ".dmg":
        raise ValueError("Delivery output must end in .dmg")
    return output


def validate_options(args):
    if not args.team_id or not re.fullmatch(r"[A-Z0-9]{10}", args.team_id):
        raise ValueError("An exact 10-character --team-id is required for the packaged application/helper")
    if args.verify:
        return
    if not args.package or not args.readme or not args.output:
        raise ValueError("Building requires --package, --readme, and an explicit --output")
    validate_output(args.output)
    if not args.identity:
        raise ValueError("An explicit --identity is required (use - only with --development)")
    if not args.development and (not args.identity.startswith("Developer ID Application:") or not args.notary_profile):
        raise ValueError("Production delivery requires Developer ID Application identity and --notary-profile")
    if args.identity != "-":
        identities = run(["/usr/bin/security", "find-identity", "-v", "-p", "codesigning"]).stdout
        if f'"{args.identity}"' not in identities:
            raise ValueError("Requested delivery signing identity is unavailable")


def verify_container_signature(dmg, development, team_id):
    run(["/usr/bin/codesign", "--verify", "--strict", dmg])
    details = run(["/usr/bin/codesign", "-d", "--verbose=2", dmg]).stdout
    if f"Identifier={IDENTIFIER}\n" not in details:
        raise ValueError("Unexpected delivery disk-image identifier")
    if not development or "Signature=adhoc" not in details:
        run(["/usr/bin/codesign", "--verify", "--strict", "-R=" + installer.signing_requirement(team_id, IDENTIFIER), dmg])
    if not development:
        if not re.search(r"(?m)^Authority=Developer ID Application:", details) or not re.search(r"(?m)^Timestamp=", details):
            raise ValueError("Production DMG requires a Developer ID Application signature and secure timestamp")
        run(["/usr/bin/xcrun", "stapler", "validate", dmg])
        run(["/usr/sbin/spctl", "--assess", "--type", "open", "--context", "context:primary-signature", "--verbose=2", dmg])
    return details.strip()


def verify(dmg, development, team_id, *, expected_package_sha=None, expected_readme_sha=None, expected_repair=None):
    dmg = real_file(dmg, "Disk image")
    report = {"version": installer.VERSION, "diskImage": str(dmg), "sha256": sha256(dmg),
              "bytes": dmg.stat().st_size, "development": development, "notarized": not development,
              "teamId": team_id, "installed": False, "captureStarted": False}
    report["signatureDetails"] = verify_container_signature(dmg, development, team_id)
    report["hdiutilVerify"] = run(["/usr/bin/hdiutil", "verify", dmg]).stdout.strip()
    with tempfile.TemporaryDirectory(prefix="uk-delivery-verify-") as directory:
        temp = Path(directory)
        mount = temp / "mounted"
        mount.mkdir()
        attached = False
        try:
            response = run(["/usr/bin/hdiutil", "attach", "-readonly", "-nobrowse", "-mountpoint", mount, "-plist", dmg])
            attached = True  # Set before parsing, so malformed output still detaches.
            entities = plistlib.loads(response.stdout.encode())["system-entities"]
            info = plistlib.loads(run(["/usr/sbin/diskutil", "info", "-plist", mount]).stdout.encode())
            if info.get("WritableVolume") is not False or info.get("WritableMedia") is not False:
                raise RuntimeError("Delivery verification mount is not read-only")
            inventory = sorted(path.name for path in mount.iterdir())
            if inventory != sorted([PACKAGE_NAME, README_NAME]):
                raise RuntimeError(f"Unexpected disk-image inventory: {inventory}")
            package = real_file(mount / PACKAGE_NAME, "Mounted installer")
            readme = real_file(mount / README_NAME, "Mounted guide")
            package_sha, readme_sha = sha256(package), sha256(readme)
            if expected_package_sha is not None and package_sha != expected_package_sha:
                raise RuntimeError("Mounted installer digest differs from the verified source package")
            if expected_readme_sha is not None and readme_sha != expected_readme_sha:
                raise RuntimeError("Mounted guide digest differs from the staged source")
            # Product verification writes a choice receipt: work on a private copy,
            # never the read-only mount or an application resource directory.
            copied = temp / "product.pkg"
            shutil.copy2(package, copied)
            package_report = installer.verify(copied, development, team_id, expected_repair=expected_repair)
            if not package_report["fullProduct"]:
                raise RuntimeError("Customer delivery requires the combined app/helper product")
            report.update({"mountedReadOnly": True, "mountedInventory": inventory,
                           "mountedPackageSha256": package_sha, "readmeSha256": readme_sha,
                           "diskutilReadOnlyEvidence": {key: info[key] for key in ("WritableVolume", "WritableMedia")},
                           "mountEntities": entities, "packageVerification": package_report})
        finally:
            if attached or os.path.ismount(mount):
                run(["/usr/bin/hdiutil", "detach", mount])
                report["detachedAfterVerification"] = True
    return report


def build(args):
    validate_options(args)
    package = real_file(args.package, "Installer")
    readme = real_file(args.readme, "Guide")
    output = validate_output(args.output)
    if not readme.read_text(encoding="utf-8").strip():
        raise ValueError("Delivery guide must not be empty")
    if output == package or output == readme:
        raise ValueError("Output must not overwrite an input")
    expected_repair = installer.repair_package_path(args.repair_package) if args.repair_package else None
    package_sha, readme_sha = sha256(package), sha256(readme)
    output.parent.mkdir(parents=True, exist_ok=True)
    # Same filesystem as output: replacement remains atomic after all checks.
    with tempfile.TemporaryDirectory(prefix=".uk-delivery-", dir=output.parent) as directory:
        temp = Path(directory)
        stage = temp / "stage"
        stage.mkdir()
        staged_package = stage / PACKAGE_NAME
        shutil.copy2(package, staged_package)
        shutil.copy2(readme, stage / README_NAME)
        package_report = installer.verify(staged_package, args.development, args.team_id, expected_repair=expected_repair)
        if not package_report["fullProduct"]:
            raise ValueError("Delivery input must be a combined application product")
        # Keep verifier-generated receipts out of the customer volume.
        staged_package.with_suffix(".choices.xml").unlink(missing_ok=True)
        if sha256(staged_package) != package_sha or sha256(stage / README_NAME) != readme_sha:
            raise RuntimeError("Delivery inputs changed while staging")
        pending = temp / output.name
        run(["/usr/bin/hdiutil", "create", "-volname", VOLUME, "-srcfolder", stage, "-fs", "HFS+", "-format", "UDZO", pending])
        command = ["/usr/bin/codesign", "--force", "--sign", args.identity, "--identifier", IDENTIFIER]
        command += ["--timestamp=none"] if args.development else ["--timestamp"]
        run(command + [pending])
        notary = installer.notarize(pending, args.notary_profile) if not args.development else None
        report = verify(pending, args.development, args.team_id, expected_package_sha=package_sha,
                        expected_readme_sha=readme_sha, expected_repair=expected_repair)
        if sha256(package) != package_sha or sha256(readme) != readme_sha:
            raise RuntimeError("Source package/guide changed during delivery build")
        report.update({"diskImage": str(output), "sourcePackage": str(package), "sourcePackageSha256": package_sha,
                       "signingIdentity": args.identity, "notarySubmission": notary,
                       "filesystem": "HFS+", "format": "UDZO", "volumeName": VOLUME,
                       "createdAt": datetime.datetime.now(datetime.timezone.utc).isoformat()})
        receipt = temp / "delivery.json"
        receipt.write_text(json.dumps(report, indent=2) + "\n")
        os.replace(pending, output)
        os.replace(receipt, output.with_suffix(".delivery.json"))
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--package")
    parser.add_argument("--readme")
    parser.add_argument("--output")
    parser.add_argument("--identity")
    parser.add_argument("--team-id", required=True)
    parser.add_argument("--notary-profile")
    parser.add_argument("--repair-package", help="Optional expected embedded repair package")
    parser.add_argument("--development", action="store_true")
    parser.add_argument("--verify", metavar="DMG")
    args = parser.parse_args(argv)
    try:
        validate_options(args)
        report = verify(args.verify, args.development, args.team_id, expected_repair=args.repair_package) if args.verify else build(args)
        print(json.dumps(report, indent=2))
        return 0
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        print(f"Delivery failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
