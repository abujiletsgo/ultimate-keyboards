import json
import pathlib
import re
import unittest
from parse_hid_descriptor import parse_descriptor

ROOT = pathlib.Path(__file__).parent


class StaticDescriptorTests(unittest.TestCase):
    def setUp(self):
        receipt = json.loads((ROOT / "fixtures/macos-26.5.2-passive-devices.json").read_text())
        self.device = next(d for d in receipt["devices"] if d["builtIn"])
        self.descriptor = bytes.fromhex(self.device["staticReportDescriptorHex"])

    def test_vendor_report_is_separate_data_and_not_claimed_buffered_or_constant(self):
        items = [i for i in parse_descriptor(self.descriptor) if i["kind"] == "input"]
        vendor = [i for i in items if i["reportId"] == 63]
        self.assertEqual(len(vendor), 1)
        item = vendor[0]
        self.assertEqual((item["usagePage"], item["usages"], item["reportSizeBits"], item["reportCount"], item["flags"]), (0xFF00, [6], 8, 64, 0x22))
        self.assertFalse(item["constant"])
        self.assertFalse(item["bufferedBytes"])
        self.assertEqual({i["reportId"] for i in items if i["usagePage"] in (7, 12, 255)}, {1, 82})

    def test_policy_pins_actual_passive_descriptor(self):
        header = (ROOT.parent / "bridge/device_policy.hpp").read_text()
        body = re.search(r"observed_descriptor = \{([^}]+)\}", header).group(1)
        pinned = bytes(int(n.strip(), 16) for n in body.split(","))
        self.assertEqual(pinned, self.descriptor)
        self.assertTrue(self.device["ordinaryKeyContractValid"])
        self.assertTrue(self.device["eligible"])
        self.assertEqual(self.device["excludedNonKeyReportCount"], 1)

    def test_truncated_descriptor_is_rejected(self):
        for malformed in (bytes([0x75]), bytes([0xFE]), bytes([0xFE, 4, 1, 0])):
            with self.assertRaises(ValueError):
                parse_descriptor(malformed)


if __name__ == "__main__":
    unittest.main()
