#!/usr/bin/env python3
"""Parse immutable HID descriptor items; never read input report values."""
import copy
import json
import pathlib
import sys


def parse_descriptor(data):
    result = []
    global_state = {"usagePage": 0, "reportId": 0, "reportSizeBits": 0, "reportCount": 0}
    globals_stack = []
    local = {}
    collections = []
    offsets = {}
    index = 0
    while index < len(data):
        offset = index
        prefix = data[index]
        index += 1
        if prefix == 0xFE:
            if index + 2 > len(data):
                raise ValueError("Truncated long item")
            size, tag = data[index:index + 2]
            index += 2
            if index + size > len(data):
                raise ValueError("Truncated long item data")
            result.append({"descriptorOffset": offset, "kind": "longItem", "tag": tag, "size": size})
            index += size
            continue
        size = (0, 1, 2, 4)[prefix & 3]
        kind, tag = (prefix >> 2) & 3, prefix >> 4
        raw = data[index:index + size]
        if len(raw) != size:
            raise ValueError("Truncated short item")
        index += size
        value = int.from_bytes(raw, "little")
        signed = int.from_bytes(raw, "little", signed=True)
        if kind == 1:  # Global
            if tag == 0:
                global_state["usagePage"] = value
            elif tag == 1:
                global_state["logicalMinimum"] = signed
            elif tag == 2:
                global_state["logicalMaximum"] = signed if global_state.get("logicalMinimum", 0) < 0 else value
            elif tag == 7:
                global_state["reportSizeBits"] = value
            elif tag == 8:
                global_state["reportId"] = value
            elif tag == 9:
                global_state["reportCount"] = value
            elif tag == 10:
                globals_stack.append(copy.deepcopy(global_state))
            elif tag == 11:
                if not globals_stack:
                    raise ValueError("Unmatched global pop")
                global_state = globals_stack.pop()
        elif kind == 2:  # Local
            if tag == 0:
                local.setdefault("usages", []).append(value)
            elif tag == 1:
                local["usageMinimum"] = value
            elif tag == 2:
                local["usageMaximum"] = value
        elif kind == 0:  # Main
            if tag == 10:
                collections.append({"usagePage": global_state["usagePage"], "usages": local.get("usages", []), "collectionType": value})
            elif tag == 12:
                if not collections:
                    raise ValueError("Unmatched end collection")
                collections.pop()
            elif tag in (8, 9, 11):
                name = {8: "input", 9: "output", 11: "feature"}[tag]
                key = (name, global_state["reportId"])
                bits = global_state["reportSizeBits"] * global_state["reportCount"]
                item = {"descriptorOffset": offset, "kind": name, **copy.deepcopy(global_state), **copy.deepcopy(local),
                        "bitOffset": offsets.get(key, 0), "totalBits": bits, "flags": value,
                        "constant": bool(value & 1), "variable": bool(value & 2), "relative": bool(value & 4),
                        "bufferedBytes": bool(value & 0x100), "collections": copy.deepcopy(collections)}
                offsets[key] = item["bitOffset"] + bits
                result.append(item)
            local = {}
    if collections or globals_stack:
        raise ValueError("Unbalanced descriptor state")
    return result


def main():
    receipt = json.loads(pathlib.Path(sys.argv[1]).read_text())
    result = {"source": pathlib.Path(sys.argv[1]).name, "staticDescriptorOnly": True, "inputReportsRead": False, "devices": []}
    for device in receipt["devices"]:
        if not device["builtIn"]:
            continue
        descriptor = bytes.fromhex(device.get("staticReportDescriptorHex", ""))
        result["devices"].append({"product": device["product"], "registryId": device["registryId"], "descriptorBytes": len(descriptor),
                                   "items": parse_descriptor(descriptor) if descriptor else [], "descriptorAvailable": bool(descriptor)})
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
