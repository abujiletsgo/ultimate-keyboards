import importlib.util
import json
from pathlib import Path
import plistlib
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[3]
def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module
builder = load('release_builder', ROOT / 'scripts/build-native-installer.py')
delivery = load('delivery_builder', ROOT / 'native/packaging/build_delivery.py')
GOOD_SIGNATURE = 'Authority=Developer ID Application: Test (9878YL387T)\nCodeDirectory v=20400 flags=0x10000(runtime) hashes=1\nTimestamp=Oct 26 2026\n'

class ProductionPackagingTests(unittest.TestCase):
    def test_same_team_development_signature_runtime_or_timestamp_omission_is_rejected(self):
        builder.require_production_signature(GOOD_SIGNATURE, 'helper')
        for details in [GOOD_SIGNATURE.replace('Developer ID Application:', 'Apple Development:'),
                        GOOD_SIGNATURE.replace('0x10000(runtime)', '0x0(none)'),
                        GOOD_SIGNATURE.replace('Timestamp=', 'Signed Time=')]:
            with self.subTest(details=details), self.assertRaises(ValueError):
                builder.require_production_signature(details, 'helper')

    def test_distribution_cannot_disable_shared_driver_compatibility_scripts(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);path=root/'Distribution'
            for attribute,value in [('require-scripts','false'),('allow-external-scripts','true'),('rootVolumeOnly','false')]:
                builder.write_distribution(path,False,True)
                xml=ET.parse(path);xml.getroot().find('options').set(attribute,value);xml.write(path)
                with self.subTest(attribute=attribute), self.assertRaisesRegex(RuntimeError,'compatibility scripts'):
                    builder.verify_component_topology(root)

    def test_helper_metadata_fails_closed_on_wrong_compiled_team_version_arch_or_protocol(self):
        good = {'protocolVersion':1, 'version':builder.SERVICE_VERSION, 'trustedTeamId':'9878YL387T', 'targetArchitecture':'aarch64'}
        for change in [{'trustedTeamId':None},{'trustedTeamId':'OTHERTEAM1X'},{'version':'0.0.0'},{'targetArchitecture':'x86_64'},{'protocolVersion':True}]:
            with self.subTest(change=change), patch.object(builder,'run',return_value=SimpleNamespace(stdout=json.dumps({**good,**change}))), self.assertRaises(ValueError):
                builder.helper_build_info(Path('/fixture/helper'),'9878YL387T')
        with patch.object(builder,'run',return_value=SimpleNamespace(stdout=json.dumps(good))) as run:
            self.assertEqual(builder.helper_build_info(Path('/fixture/helper'),'9878YL387T'),good)
            self.assertEqual(run.call_args.kwargs['timeout'],5)
            self.assertEqual(run.call_args.args[0][-1],'--build-info')

    def test_minimum_os_is_consistent_and_installer_enforces_it(self):
        for minimum in [None,'12.0','14.0','13.1','unknown']:
            with self.subTest(minimum=minimum), self.assertRaises(ValueError):
                builder.require_minimum_os({'LSMinimumSystemVersion':minimum},'Application')
        builder.require_minimum_os({'LSMinimumSystemVersion':'13.0.0'},'Application')
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'Distribution';builder.write_distribution(path,False,True)
            self.assertEqual(ET.parse(path).getroot().find('allowed-os-versions/os-version').get('min'),'13.0')

    def test_notary_rejection_never_staples_even_with_zero_command_exit(self):
        for response in [{'id':'job','status':'Invalid'},{'id':'job','status':'In Progress'},{'status':'Accepted'},[]]:
            with self.subTest(response=response), patch.object(builder,'run',return_value=SimpleNamespace(stdout=json.dumps(response))) as run:
                with self.assertRaises(RuntimeError):builder.notarize(Path('/fixture.pkg'),'profile')
                self.assertEqual(run.call_count,1)
        with patch.object(builder,'run',return_value=SimpleNamespace(stdout='{"id":"accepted-job","status":"Accepted"}')) as run:
            self.assertEqual(builder.notarize(Path('/fixture.pkg'),'profile')['status'],'Accepted')
            self.assertEqual([call.args[0][2] for call in run.call_args_list],['submit','staple','validate'])

    def test_exact_lifecycle_verification_rejects_modified_postinstall(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);payload=root/'Payload';(root/'Scripts').mkdir()
            for name in ('preinstall','postinstall'):(root/'Scripts'/name).write_bytes((builder.PACKAGING/name).read_bytes())
            (payload/builder.BASE).mkdir(parents=True)
            for name in ('uninstall.sh','ensure-virtual-hid.sh'):(payload/builder.BASE/name).write_bytes((builder.PACKAGING/name).read_bytes())
            self.assertEqual(len(builder.verify_lifecycle(root,payload)),4)
            (root/'Scripts/postinstall').write_text('exit 0\n')
            with self.assertRaisesRegex(RuntimeError,'postinstall'):builder.verify_lifecycle(root,payload)

    def test_recursive_application_disguised_as_repair_is_rejected_before_payload_expansion(self):
        with tempfile.TemporaryDirectory() as directory:
            package=Path(directory)/'loop.pkg';package.touch()
            calls=[]
            def run(args,**kwargs):
                calls.append(args);return SimpleNamespace(stdout='Developer ID Installer: Test (9878YL387T)',returncode=0)
            with patch.object(builder,'run',side_effect=run), patch.object(builder,'verify_component_topology',return_value=[builder.APP_PACKAGE,builder.HELPER_PACKAGE,builder.DRIVER_NAME]):
                with self.assertRaisesRegex(RuntimeError,'repair-only'):
                    builder.verify(package,False,'9878YL387T',repair_only=True)
            self.assertFalse(any('--expand-full' in call for call in calls))

    def test_isolated_repair_argument_rejects_missing_and_symlink_inputs(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'repair.pkg'
            with self.assertRaises(ValueError):builder.repair_package_path(path)
            path.write_bytes(b'fixture');self.assertEqual(builder.repair_package_path(path),path)
            alias=path.with_name('alias.pkg');alias.symlink_to(path)
            with self.assertRaises(ValueError):builder.repair_package_path(alias)

class DeliveryTests(unittest.TestCase):
    def options(self,**changes):
        return SimpleNamespace(**dict(dict(package='/fixture.pkg',readme='/guide.txt',output='/tmp/test.dmg',identity='-',team_id='9878YL387T',notary_profile=None,development=False,verify=None,repair_package=None),**changes))

    def test_production_never_accepts_development_identity_or_missing_notary(self):
        for changes in [{},{'identity':'Apple Development: Test'},{'identity':'Developer ID Application: Test'}]:
            with self.subTest(changes=changes), self.assertRaisesRegex(ValueError,'Production delivery'):
                delivery.validate_options(self.options(**changes))
        delivery.validate_options(self.options(development=True))
        with self.assertRaisesRegex(ValueError,'frozen'):
            delivery.validate_output(ROOT/'native/installer/UltimateKeyboards-0.3.0-Native-Installer.dmg')

    def simulate_mount(self, directory, *, extra=False, malformed=False, product_error=False, wrong_digest=False):
        root=Path(directory);dmg=root/'test.dmg';dmg.write_bytes(b'disk image fixture');calls=[]
        def run(args,**kwargs):
            calls.append([str(x) for x in args])
            if 'attach' in args:
                mount=Path(args[args.index('-mountpoint')+1]);(mount/delivery.PACKAGE_NAME).write_bytes(b'package fixture');(mount/delivery.README_NAME).write_text('Install instructions')
                if extra:(mount/'unexpected.txt').touch()
                text='not plist' if malformed else plistlib.dumps({'system-entities':[]}).decode()
                return SimpleNamespace(stdout=text)
            if 'info' in args:return SimpleNamespace(stdout=plistlib.dumps({'WritableVolume':False,'WritableMedia':False}).decode())
            return SimpleNamespace(stdout='verified')
        def product_verify(path,*args,**kwargs):
            self.assertNotIn('mounted',str(path));self.assertEqual(path.read_bytes(),b'package fixture')
            if product_error:raise RuntimeError('invalid product')
            return {'fullProduct':True}
        with patch.object(delivery,'run',side_effect=run), patch.object(delivery,'verify_container_signature',return_value='fixture signature'), patch.object(delivery.installer,'verify',side_effect=product_verify):
            if extra or malformed or product_error or wrong_digest:
                with self.assertRaises((RuntimeError,plistlib.InvalidFileException)):
                    delivery.verify(dmg,True,'9878YL387T',expected_package_sha='wrong' if wrong_digest else None)
            else:
                report=delivery.verify(dmg,True,'9878YL387T')
                self.assertTrue(report['mountedReadOnly']);self.assertTrue(report['detachedAfterVerification'])
                self.assertEqual(report['mountedInventory'],[delivery.PACKAGE_NAME,delivery.README_NAME])
        self.assertEqual(sum('detach' in call for call in calls),1)
        attach=next(call for call in calls if 'attach' in call);self.assertIn('-readonly',attach);self.assertIn('-nobrowse',attach)

    def test_mount_uses_readonly_copy_and_detaches_on_success(self):
        with tempfile.TemporaryDirectory() as directory:self.simulate_mount(directory)

    def test_mount_detaches_on_inventory_plist_product_and_digest_failures(self):
        for failure in ('extra','malformed','product_error','wrong_digest'):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as directory:self.simulate_mount(directory,**{failure:True})

    def test_failed_product_admission_preserves_existing_delivery_without_notary_or_image_creation(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);pkg=root/'source.pkg';pkg.write_bytes(b'fixture');readme=root/'guide.txt';readme.write_text('Guide');output=root/'keep.dmg';output.write_bytes(b'existing delivery')
            args=self.options(package=str(pkg),readme=str(readme),output=str(output),development=True)
            with patch.object(delivery.installer,'verify',side_effect=RuntimeError('invalid product')), patch.object(delivery,'run') as run:
                with self.assertRaisesRegex(RuntimeError,'invalid product'):delivery.build(args)
                run.assert_not_called()
            self.assertEqual(output.read_bytes(),b'existing delivery')
