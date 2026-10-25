// Thin C ABI over the official, pinned pqrs daemon client. No DriverKit user client entitlement.
#include <pqrs/karabiner/driverkit/virtual_hid_device_service.hpp>
#include "device_policy.hpp"
#include <IOKit/hid/IOHIDManager.h>
#include <IOKit/hid/IOHIDLib.h>
#include <IOKit/hidsystem/IOHIDLib.h>
#include <Security/Security.h>
#include <ApplicationServices/ApplicationServices.h>
#include <SystemConfiguration/SystemConfiguration.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <mach/message.h>
#include <mach/mach_time.h>
#include <IOKit/pwr_mgt/IOPMLib.h>
#include <IOKit/IOMessage.h>
#include <sys/stat.h>
#include <unistd.h>
#include <atomic>
#include <deque>
#include <map>
#include <set>
#include <string>
#include <vector>
#include <sstream>
#include <tuple>
#include <thread>
#include <chrono>

namespace svc = pqrs::karabiner::driverkit::virtual_hid_device_service;
namespace report = pqrs::karabiner::driverkit::virtual_hid_device_driver::hid_report;
struct UKEvent { uint64_t device; uint16_t page; uint16_t usage; bool down; uint64_t at_ms; };
static std::atomic<bool> connected{false}, activated{false}, driver{false}, ready{false}, mismatch{true}, fault{false};
static std::unique_ptr<svc::client> client;
static IOHIDManagerRef manager = nullptr;
static std::set<IOHIDDeviceRef> captured;
static std::map<IOHIDDeviceRef, uk_policy::Context> device_contexts;
static std::deque<UKEvent> events;
static std::map<uint16_t, std::set<uint16_t>> pressed;
static CFRunLoopRef loop = nullptr;
static io_connect_t power_root = IO_OBJECT_NULL;
static IONotificationPortRef power_port = nullptr;
static io_object_t power_notifier = IO_OBJECT_NULL;
static uint64_t monotonic_ms(uint64_t ticks) {
  static const auto timebase = [] { mach_timebase_info_data_t info{}; mach_timebase_info(&info); return info; }();
  return static_cast<uint64_t>((static_cast<__uint128_t>(ticks) * timebase.numer) / (static_cast<uint64_t>(timebase.denom) * 1000000));
}
static bool permission() { return IOHIDCheckAccess(kIOHIDRequestTypeListenEvent) == kIOHIDAccessTypeGranted; }
static bool handshake_ready(bool c, bool a, bool d, bool r, bool m, bool f) { return c && a && d && r && !m && !f; }
static bool healthy() { return handshake_ready(connected, activated, driver, ready, mismatch, fault); }
static bool device_identity_allowed(bool built_in, std::string name) {
  for (auto& c : name) c = std::tolower(c);
  return built_in && name.find("virtual") == std::string::npos && name.find("karabiner") == std::string::npos && name.find("ultimate") == std::string::npos;
}
static bool supported_page(uint32_t page) { return page == 7 || page == 0x0c || page == 0xff01 || page == 0x00ff; }
static bool supported_usage(uint32_t page, uint32_t usage) {
  return supported_page(page) && usage > 0 && usage <= (page == 0x0c ? 0x300 : 0xff);
}
static bool array_backing_values(bool array, uint32_t usage) { return array && usage == UINT32_MAX; }
static bool array_backing(IOHIDElementRef e) { return array_backing_values(IOHIDElementIsArray(e), IOHIDElementGetUsage(e)); }
static bool boolean_property(IOHIDDeviceRef d, CFStringRef key) {
  auto v = IOHIDDeviceGetProperty(d, key);
  if (!v) return false;
  if (CFGetTypeID(v) == CFBooleanGetTypeID()) return CFBooleanGetValue((CFBooleanRef)v);
  int n = 0;
  return CFGetTypeID(v) == CFNumberGetTypeID() && CFNumberGetValue((CFNumberRef)v, kCFNumberIntType, &n) && n != 0;
}
static bool ordinary_key_contract(CFTypeRef property) {
  if (!property || CFGetTypeID(property) != CFArrayGetTypeID()) return false;
  auto list = (CFArrayRef)property; auto count = CFArrayGetCount(list);
  if (count <= 0 || count > 4096) return false;
  bool has_keyboard = false;
  for (CFIndex i = 0; i < count; ++i) {
    auto item = CFArrayGetValueAtIndex(list, i);
    if (!item || CFGetTypeID(item) != CFNumberGetTypeID() || CFNumberIsFloatType((CFNumberRef)item)) return false;
    int64_t pair = 0;
    if (!CFNumberGetValue((CFNumberRef)item, kCFNumberSInt64Type, &pair) || pair < 0) return false;
    uint32_t page = static_cast<uint64_t>(pair) >> 32, usage = static_cast<uint32_t>(pair);
    if (!supported_usage(page, usage)) return false; // Includes rejection of ff00/6 if advertised.
    has_keyboard |= page == 7;
  }
  return has_keyboard;
}
static bool published_key_contract(IOHIDDeviceRef device) {
  auto service = IOHIDDeviceGetService(device); io_iterator_t iterator = IO_OBJECT_NULL;
  if (!service || IORegistryEntryCreateIterator(service, kIOServicePlane, kIORegistryIterateRecursively, &iterator) != kIOReturnSuccess) return false;
  bool valid = false; unsigned matches = 0;
  while (auto entry = IOIteratorNext(iterator)) {
    io_name_t name{};
    if (IOObjectGetClass(entry, name) == kIOReturnSuccess && std::strcmp(name, "AppleHIDKeyboardEventDriverV2") == 0) {
      ++matches;
      auto property = IORegistryEntrySearchCFProperty(entry, kIOServicePlane, CFSTR("SupportedKeyboardUsagePairs"), kCFAllocatorDefault, 0);
      valid = ordinary_key_contract(property);
      if (property) CFRelease(property);
    }
    IOObjectRelease(entry);
  }
  IOObjectRelease(iterator);
  return matches == 1 && valid;
}
static uk_policy::Context device_context(IOHIDDeviceRef device) {
  uk_policy::Context context;
  context.built_in = boolean_property(device, CFSTR("Built-In"));
  auto product = IOHIDDeviceGetProperty(device, CFSTR(kIOHIDProductKey));
  context.exact_product = product && CFGetTypeID(product) == CFStringGetTypeID() && CFEqual(product, CFSTR("Apple Internal Keyboard / Trackpad"));
  if (!context.built_in || !context.exact_product) return context;
  auto descriptor = IOHIDDeviceGetProperty(device, CFSTR(kIOHIDReportDescriptorKey));
  context.descriptor_matches = descriptor && CFGetTypeID(descriptor) == CFDataGetTypeID() && uk_policy::descriptor_matches(CFDataGetBytePtr((CFDataRef)descriptor), CFDataGetLength((CFDataRef)descriptor));
  if (context.descriptor_matches) context.key_contract_valid = published_key_contract(device);
  return context;
}
static bool known_non_key_element(IOHIDElementRef element, const uk_policy::Context& context) {
  if (!context.built_in || !context.exact_product || !context.descriptor_matches || !context.key_contract_valid ||
      IOHIDElementGetUsagePage(element) != 0xff00 || IOHIDElementGetUsage(element) != 6) return false;
  auto parent = IOHIDElementGetParent(element);
  if (!parent) return false;
  uk_policy::Element metadata;
  metadata.page = IOHIDElementGetUsagePage(element); metadata.usage = IOHIDElementGetUsage(element);
  metadata.type = IOHIDElementGetType(element); metadata.report_id = IOHIDElementGetReportID(element);
  metadata.array = IOHIDElementIsArray(element); metadata.relative = IOHIDElementIsRelative(element);
  metadata.minimum = IOHIDElementGetLogicalMin(element); metadata.maximum = IOHIDElementGetLogicalMax(element);
  metadata.size_bits = IOHIDElementGetReportSize(element); metadata.count = IOHIDElementGetReportCount(element);
  metadata.parent_page = IOHIDElementGetUsagePage(parent); metadata.parent_usage = IOHIDElementGetUsage(parent);
  metadata.parent_type = IOHIDElementGetType(parent); metadata.parent_collection_type = IOHIDElementGetCollectionType(parent);
  metadata.parent_is_top_level = IOHIDElementGetParent(parent) == nullptr;
  return uk_policy::known_non_key_report(context, metadata);
}
static bool eligible(IOHIDDeviceRef d) {
  if (!boolean_property(d, CFSTR("Built-In"))) return false;
  auto product = IOHIDDeviceGetProperty(d, CFSTR(kIOHIDProductKey));
  if (product && CFGetTypeID(product) == CFStringGetTypeID()) {
    char s[512]{}; CFStringGetCString((CFStringRef)product, s, sizeof(s), kCFStringEncodingUTF8);
    if (!device_identity_allowed(true, s)) return false;
  }
  auto elements = IOHIDDeviceCopyMatchingElements(d, nullptr, 0);
  if (!elements) return false;
  auto context = device_context(d);
  bool keyboard = false, safe = true;
  for (CFIndex i = 0; i < CFArrayGetCount(elements); ++i) {
    auto e = (IOHIDElementRef)CFArrayGetValueAtIndex(elements, i);
    auto type = IOHIDElementGetType(e);
    if (type < kIOHIDElementTypeInput_Misc || type > kIOHIDElementTypeInput_ScanCodes) continue;
    auto page = IOHIDElementGetUsagePage(e), usage = IOHIDElementGetUsage(e);
    // Constant/padding fields do not represent pressed keys.
    if (!usage || array_backing(e) || known_non_key_element(e, context)) continue;
    if (!supported_usage(page, usage) || IOHIDElementIsRelative(e) || IOHIDElementGetLogicalMin(e) != 0 || IOHIDElementGetLogicalMax(e) != 1) safe = false;
    if (page == 7) keyboard = true;
  }
  CFRelease(elements);
  return safe && keyboard;
}
static bool keys_released(IOHIDDeviceRef d) {
  auto elements = IOHIDDeviceCopyMatchingElements(d, nullptr, 0);
  if (!elements) return false;
  bool released = true;
  const auto& context = device_contexts.at(d);
  for (CFIndex i = 0; i < CFArrayGetCount(elements); ++i) {
    auto e = (IOHIDElementRef)CFArrayGetValueAtIndex(elements, i);
    auto type = IOHIDElementGetType(e);
    if (type < kIOHIDElementTypeInput_Misc || type > kIOHIDElementTypeInput_ScanCodes || !IOHIDElementGetUsage(e) || array_backing(e) || known_non_key_element(e, context)) continue;
    IOHIDValueRef value = nullptr;
    if (IOHIDDeviceGetValue(d, e, &value) != kIOReturnSuccess || !value || IOHIDValueGetIntegerValue(value) != 0) { released = false; break; }
  }
  CFRelease(elements);
  return released;
}
static void value_callback(void*, IOReturn result, void* sender, IOHIDValueRef value) {
  if (result != kIOReturnSuccess) { fault = true; return; }
  auto device = (IOHIDDeviceRef)sender;
  if (!captured.count(device)) return;
  auto e = IOHIDValueGetElement(value);
  auto page = IOHIDElementGetUsagePage(e), usage = IOHIDElementGetUsage(e);
  auto context = device_contexts.find(device);
  if (!usage || array_backing(e) || (context != device_contexts.end() && known_non_key_element(e, context->second))) return;
  if (!supported_usage(page, usage) || events.size() >= 4096) { fault = true; return; }
  events.push_back({reinterpret_cast<uint64_t>(device), (uint16_t)page, (uint16_t)usage, IOHIDValueGetIntegerValue(value) != 0, monotonic_ms(IOHIDValueGetTimeStamp(value) ? IOHIDValueGetTimeStamp(value) : mach_absolute_time())});
}
static void removed(void*, IOReturn, void*, IOHIDDeviceRef device) {
  if (captured.count(device)) fault = true; // Coordinator releases every engine before recapturing.
}
static bool post_page(uint16_t page) {
  if (!healthy() || !client) return false;
  const auto& keys = pressed[page];
  if (keys.size() > (page == 7 ? 40 : 32)) return false;
  if (page == 7) {
    report::keyboard_input r;
    size_t ordinary = 0;
    for (auto k : keys) {
      if (k >= 0xe0 && k <= 0xe7) r.modifiers.insert(static_cast<report::modifier>(1 << (k - 0xe0)));
      else { if (++ordinary > 32) return false; r.keys.insert(k); }
    }
    client->async_post_report(r);
  } else if (page == 0x0c) { report::consumer_input r; for (auto k : keys) r.keys.insert(k); client->async_post_report(r); }
  else if (page == 0xff01) { report::apple_vendor_keyboard_input r; for (auto k : keys) r.keys.insert(k); client->async_post_report(r); }
  else if (page == 0x00ff) { report::apple_vendor_top_case_input r; for (auto k : keys) r.keys.insert(k); client->async_post_report(r); }
  else return false;
  return true;
}
static void release_inputs() {
  if (client) {
    if (healthy()) { for (auto p : {7, 0x0c, 0xff01, 0x00ff}) { pressed[p].clear(); post_page(p); } }
    client->async_virtual_hid_keyboard_reset();
  }
  for (auto d : captured) { IOHIDDeviceRegisterInputValueCallback(d, nullptr, nullptr); IOHIDDeviceUnscheduleFromRunLoop(d, loop, kCFRunLoopDefaultMode); IOHIDDeviceClose(d, kIOHIDOptionsTypeNone); CFRelease(d); }
  captured.clear(); device_contexts.clear(); events.clear(); pressed.clear();
  if (manager) { IOHIDManagerUnscheduleFromRunLoop(manager, loop, kCFRunLoopDefaultMode); CFRelease(manager); manager = nullptr; }
}
static void power_callback(void*, io_service_t, natural_t message, void* argument) {
  if (message == kIOMessageSystemWillSleep) {
    release_inputs(); // Release physical keyboards before acknowledging sleep.
    fault = true;
    IOAllowPowerChange(power_root, reinterpret_cast<intptr_t>(argument));
  } else if (message == kIOMessageCanSystemSleep) {
    IOAllowPowerChange(power_root, reinterpret_cast<intptr_t>(argument));
  }
}
static std::string property_text(IOHIDDeviceRef device, CFStringRef key) {
  auto value = IOHIDDeviceGetProperty(device, key);
  if (!value || CFGetTypeID(value) != CFStringGetTypeID()) return {};
  std::vector<char> buffer(CFStringGetMaximumSizeForEncoding(CFStringGetLength((CFStringRef)value), kCFStringEncodingUTF8) + 1);
  return CFStringGetCString((CFStringRef)value, buffer.data(), buffer.size(), kCFStringEncodingUTF8) ? std::string(buffer.data()) : std::string();
}
static std::string json_string(const std::string& text) {
  std::string out = "\"";
  for (unsigned char c : text) {
    if (c == '\\' || c == '"') { out += '\\'; out += c; }
    else if (c < 0x20) { char hex[7]; snprintf(hex, sizeof(hex), "\\u%04x", c); out += hex; }
    else out += c;
  }
  return out + "\"";
}
static std::string describe_element(IOHIDElementRef element) {
  std::ostringstream out;
  out << "{\"cookie\":" << IOHIDElementGetCookie(element) << ",\"reportId\":" << IOHIDElementGetReportID(element) << ",\"usagePage\":" << IOHIDElementGetUsagePage(element) << ",\"usage\":" << IOHIDElementGetUsage(element) << ",\"elementType\":" << IOHIDElementGetType(element) << ",\"array\":" << (IOHIDElementIsArray(element) ? "true" : "false") << ",\"relative\":" << (IOHIDElementIsRelative(element) ? "true" : "false") << ",\"arrayBackingOnly\":" << (array_backing(element) ? "true" : "false") << ",\"logicalMinimum\":" << IOHIDElementGetLogicalMin(element) << ",\"logicalMaximum\":" << IOHIDElementGetLogicalMax(element) << ",\"reportSizeBits\":" << IOHIDElementGetReportSize(element) << ",\"reportCount\":" << IOHIDElementGetReportCount(element) << ",\"parents\":[";
  bool comma = false;
  for (auto parent = IOHIDElementGetParent(element); parent; parent = IOHIDElementGetParent(parent)) {
    if (comma) out << ','; comma = true;
    out << "{\"cookie\":" << IOHIDElementGetCookie(parent) << ",\"usagePage\":" << IOHIDElementGetUsagePage(parent) << ",\"usage\":" << IOHIDElementGetUsage(parent) << ",\"elementType\":" << IOHIDElementGetType(parent) << '}';
  }
  out << "]}"; return out.str();
}
static int64_t property_number(IOHIDDeviceRef device, CFStringRef key) {
  auto value = IOHIDDeviceGetProperty(device, key); int64_t number = 0;
  if (value && CFGetTypeID(value) == CFNumberGetTypeID()) CFNumberGetValue((CFNumberRef)value, kCFNumberSInt64Type, &number);
  return number;
}
static std::string static_report_descriptor_hex(IOHIDDeviceRef device) {
  // Descriptor bytes define the immutable report schema; these are not input reports or keystrokes.
  auto value = IOHIDDeviceGetProperty(device, CFSTR(kIOHIDReportDescriptorKey));
  if (!value || CFGetTypeID(value) != CFDataGetTypeID()) return {};
  auto data = (CFDataRef)value; auto size = CFDataGetLength(data);
  if (size <= 0 || size > 65536) return {};
  auto bytes = CFDataGetBytePtr(data); const char* hex = "0123456789abcdef";
  std::string result; result.reserve(size * 2);
  for (CFIndex i = 0; i < size; ++i) { result += hex[bytes[i] >> 4]; result += hex[bytes[i] & 15]; }
  return result;
}
static std::string describe_device(IOHIDDeviceRef device, bool& allowed) {
  std::ostringstream out;
  auto product = property_text(device, CFSTR(kIOHIDProductKey));
  auto transport = property_text(device, CFSTR(kIOHIDTransportKey));
  bool built_in = boolean_property(device, CFSTR("Built-In"));
  const auto context = device_context(device);
  unsigned excluded_non_key_reports = 0;
  uint64_t registry_id = 0; IORegistryEntryGetRegistryEntryID(IOHIDDeviceGetService(device), &registry_id);
  std::vector<std::string> details;
  std::set<std::string> reasons;
  if (!built_in) reasons.insert("Built-In is false or absent; external/split keyboards are excluded");
  if (!device_identity_allowed(true, product)) reasons.insert("Product identifies virtual/remapped output");
  using Group = std::tuple<uint32_t, CFIndex, CFIndex, uint32_t, bool, bool, uint32_t, uint32_t>;
  struct Range { uint32_t count = 0, minimum = UINT32_MAX, maximum = 0; };
  std::map<Group, Range> groups;
  bool keyboard = false;
  auto elements = IOHIDDeviceCopyMatchingElements(device, nullptr, 0);
  if (!elements) reasons.insert("Input elements cannot be enumerated");
  else {
    for (CFIndex i = 0; i < CFArrayGetCount(elements); ++i) {
      auto e = (IOHIDElementRef)CFArrayGetValueAtIndex(elements, i);
      auto type = IOHIDElementGetType(e);
      if (type < kIOHIDElementTypeInput_Misc || type > kIOHIDElementTypeInput_ScanCodes) continue;
      auto page = IOHIDElementGetUsagePage(e), usage = IOHIDElementGetUsage(e);
      auto minimum = IOHIDElementGetLogicalMin(e), maximum = IOHIDElementGetLogicalMax(e);
      bool relative = IOHIDElementIsRelative(e), array = IOHIDElementIsArray(e);
      auto& group = groups[{page, minimum, maximum, (uint32_t)type, relative, array, IOHIDElementGetReportSize(e), IOHIDElementGetReportCount(e)}];
      ++group.count; group.minimum = std::min(group.minimum, usage); group.maximum = std::max(group.maximum, usage);
      if (built_in && details.size() < 32 && (array_backing(e) || !supported_usage(page, usage) || minimum != 0 || maximum != 1 || relative)) details.push_back(describe_element(e));
      if (known_non_key_element(e, context)) { ++excluded_non_key_reports; continue; }
      if (!usage || array_backing(e)) continue;
      if (!supported_page(page)) reasons.insert("Unsupported input page " + std::to_string(page));
      else if (!supported_usage(page, usage)) reasons.insert("Input usages exceed virtual report descriptor at page " + std::to_string(page));
      if (relative) reasons.insert("Relative input at page " + std::to_string(page));
      if (minimum != 0 || maximum != 1) reasons.insert("Non-digital logical limits " + std::to_string(minimum) + ".." + std::to_string(maximum) + " at page " + std::to_string(page));
      if (page == 7) keyboard = true;
    }
    CFRelease(elements);
  }
  if (!keyboard) reasons.insert("No non-padding keyboard-page input elements");
  allowed = eligible(device);
  out << "{\"product\":" << json_string(product) << ",\"transport\":" << json_string(transport) << ",\"builtIn\":" << (built_in ? "true" : "false") << ",\"eligible\":" << (allowed ? "true" : "false") << ",\"exclusionReasons\":[";
  bool comma = false;
  for (auto& reason : reasons) { if (comma) out << ','; comma = true; out << json_string(reason); }
  out << "],\"ordinaryKeyContractValid\":" << (context.key_contract_valid ? "true" : "false") << ",\"observedStaticDescriptorMatches\":" << (context.descriptor_matches ? "true" : "false") << ",\"excludedNonKeyReportCount\":" << excluded_non_key_reports << ",\"registryId\":" << registry_id << ",\"primaryUsagePage\":" << property_number(device, CFSTR(kIOHIDPrimaryUsagePageKey)) << ",\"primaryUsage\":" << property_number(device, CFSTR(kIOHIDPrimaryUsageKey)) << ",\"exceptionalInputElements\":["; comma = false;
  for (auto& detail : details) { if (comma) out << ','; comma = true; out << detail; }
  out << "],\"staticReportDescriptorHex\":" << json_string(built_in ? static_report_descriptor_hex(device) : "") << ",\"inputElementGroups\":["; comma = false;
  for (const auto& [group, range] : groups) {
    const auto& [page, min, max, type, relative, array, size, count] = group;
    if (comma) out << ','; comma = true;
    out << "{\"usagePage\":" << page << ",\"usageMinimum\":" << range.minimum << ",\"usageMaximum\":" << range.maximum << ",\"logicalMinimum\":" << min << ",\"logicalMaximum\":" << max << ",\"elementType\":" << type << ",\"relative\":" << (relative ? "true" : "false") << ",\"array\":" << (array ? "true" : "false") << ",\"reportSizeBits\":" << size << ",\"reportCount\":" << count << ",\"elementCount\":" << range.count << '}';
  }
  out << "]}"; return out.str();
}
static bool policy_self_test() {
  const uk_policy::Context context{true, true, true, true}; const uk_policy::Element expected;
  if (!uk_policy::known_non_key_report(context, expected)) return false;
  for (int missing = 0; missing < 4; ++missing) {
    auto c = context;
    if (missing == 0) c.built_in = false; if (missing == 1) c.exact_product = false;
    if (missing == 2) c.descriptor_matches = false; if (missing == 3) c.key_contract_valid = false;
    if (uk_policy::known_non_key_report(c, expected)) return false;
  }
  for (int changed = 0; changed < 17; ++changed) {
    auto e = expected;
    switch (changed) {
      case 0: ++e.page; break; case 1: ++e.usage; break; case 2: ++e.type; break;
      case 3: ++e.report_id; break; case 4: e.array = true; break; case 5: e.relative = true; break;
      case 6: ++e.minimum; break; case 7: ++e.maximum; break; case 8: ++e.size_bits; break;
      case 9: ++e.count; break; case 10: ++e.parent_page; break; case 11: ++e.parent_usage; break;
      case 12: ++e.parent_type; break; case 13: ++e.parent_collection_type; break;
      case 14: e.parent_is_top_level = false; break; case 15: e.page = 7; break; case 16: e.size_bits = 8; break;
    }
    if (uk_policy::known_non_key_report(context, e)) return false;
  }
  auto descriptor = uk_policy::observed_descriptor;
  if (!uk_policy::descriptor_matches(descriptor.data(), descriptor.size()) || uk_policy::descriptor_matches(nullptr, 0)) return false;
  descriptor[0] ^= 1;
  if (uk_policy::descriptor_matches(descriptor.data(), descriptor.size())) return false;
  if (ordinary_key_contract(nullptr) || ordinary_key_contract(CFSTR("malformed"))) return false;
  auto list = CFArrayCreateMutable(nullptr, 0, &kCFTypeArrayCallBacks);
  if (ordinary_key_contract(list)) { CFRelease(list); return false; }
  int64_t pair = (int64_t{7} << 32) | 4; auto number = CFNumberCreate(nullptr, kCFNumberSInt64Type, &pair);
  CFArrayAppendValue(list, number); CFRelease(number);
  if (!ordinary_key_contract(list)) { CFRelease(list); return false; }
  CFArrayAppendValue(list, CFSTR("malformed"));
  if (ordinary_key_contract(list)) { CFRelease(list); return false; }
  CFArrayRemoveValueAtIndex(list, 1);
  pair = (int64_t{0xff00} << 32) | 6; number = CFNumberCreate(nullptr, kCFNumberSInt64Type, &pair);
  CFArrayAppendValue(list, number); CFRelease(number);
  if (ordinary_key_contract(list)) { CFRelease(list); return false; }
  CFArrayRemoveValueAtIndex(list, 1);
  pair = (int64_t{1} << 32) | 6; number = CFNumberCreate(nullptr, kCFNumberSInt64Type, &pair);
  CFArrayAppendValue(list, number); CFRelease(number);
  bool invalid_unknown_page = !ordinary_key_contract(list); CFRelease(list);
  return invalid_unknown_page;
}
extern "C" {
const char* uk_devices_json() {
  // Passive descriptor enumeration only: no manager/device Open, scheduling, driver connection, or output.
  static std::string result;
  auto probe = IOHIDManagerCreate(nullptr, 0);
  if (!probe) { result = "{\"error\":\"IOHIDManagerCreate failed\",\"eligibleBuiltInCount\":0,\"devices\":[]}"; return result.c_str(); }
  int page = 1, usage = 6;
  auto pn = CFNumberCreate(nullptr, kCFNumberIntType, &page), un = CFNumberCreate(nullptr, kCFNumberIntType, &usage);
  const void* keys[] = {CFSTR(kIOHIDDeviceUsagePageKey), CFSTR(kIOHIDDeviceUsageKey)};
  const void* vals[] = {pn, un};
  auto match = CFDictionaryCreate(nullptr, keys, vals, 2, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
  IOHIDManagerSetDeviceMatching(probe, match); CFRelease(match); CFRelease(pn); CFRelease(un);
  auto devices = IOHIDManagerCopyDevices(probe);
  std::ostringstream body; size_t eligible_count = 0, count = 0;
  if (devices) {
    std::vector<const void*> list(CFSetGetCount(devices)); CFSetGetValues(devices, list.data());
    for (auto device : list) {
      bool allowed = false; auto description = describe_device((IOHIDDeviceRef)device, allowed);
      if (count++) body << ','; body << description; eligible_count += allowed;
    }
    CFRelease(devices);
  }
  CFRelease(probe);
  result = "{\"readOnly\":true,\"captureAttempted\":false,\"matchedKeyboardCount\":" + std::to_string(count) + ",\"eligibleBuiltInCount\":" + std::to_string(eligible_count) + ",\"devices\":[" + body.str() + "]}";
  return result.c_str();
}
uint64_t uk_now_ms() { return monotonic_ms(mach_absolute_time()); }
bool uk_permission() { return permission(); }
bool uk_request_permission() { return geteuid() != 0 && IOHIDRequestAccess(kIOHIDRequestTypeListenEvent); }
uint32_t uk_console_uid() {
  uid_t uid = UINT32_MAX; gid_t gid;
  auto user = SCDynamicStoreCopyConsoleUser(nullptr, &uid, &gid);
  if (user) CFRelease(user);
  return uid;
}
bool uk_verify_signature(int fd, const char* identifier, const char* team, uid_t expected_uid) {
  uid_t uid; gid_t gid;
  audit_token_t token{}; socklen_t n = sizeof(token);
  if (getpeereid(fd, &uid, &gid) || uid != expected_uid || getsockopt(fd, SOL_LOCAL, LOCAL_PEERTOKEN, &token, &n) || n != sizeof(token)) return false;
  // Audit-token identity includes PID version, preventing a recycled PID from authorizing an old socket.
  auto audit = CFDataCreate(nullptr, reinterpret_cast<const UInt8*>(&token), sizeof(token));
  const void* keys[] = { kSecGuestAttributeAudit }; const void* vals[] = { audit };
  auto attrs = CFDictionaryCreate(nullptr, keys, vals, 1, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
  SecCodeRef code = nullptr; auto result = SecCodeCopyGuestWithAttributes(nullptr, attrs, kSecCSDefaultFlags, &code);
  CFRelease(attrs); CFRelease(audit);
  if (result != errSecSuccess) return false;
  std::string requirement = "anchor apple generic and identifier \"" + std::string(identifier) + "\" and certificate leaf[subject.OU] = \"" + std::string(team) + "\"";
  auto text = CFStringCreateWithCString(nullptr, requirement.c_str(), kCFStringEncodingUTF8);
  SecRequirementRef req = nullptr;
  result = SecRequirementCreateWithString(text, kSecCSDefaultFlags, &req); CFRelease(text);
  if (result == errSecSuccess) result = SecCodeCheckValidity(code, kSecCSStrictValidate, req);
  if (req) CFRelease(req); CFRelease(code);
  return result == errSecSuccess;
}
bool uk_authorize(int fd, const char* team) {
  if (!team || !*team) return false;
  for (auto p = team; *p; ++p) if (!std::isalnum(*p)) return false;
  auto uid = uk_console_uid();
  return uid != 0 && uid != UINT32_MAX && uk_verify_signature(fd, "com.ultimatekeyboards.app", team, uid);
}
bool uk_trusted_daemon() {
  auto path = svc::constants::get_server_socket_file_path().string();
  int fd = socket(AF_UNIX, SOCK_STREAM, 0);
  if (fd < 0) return false;
  timeval timeout{1,0}; setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout)); setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout));
  sockaddr_un addr{}; addr.sun_family = AF_UNIX; strlcpy(addr.sun_path, path.c_str(), sizeof(addr.sun_path));
  auto ok = connect(fd, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) == 0 &&
      uk_verify_signature(fd, "org.pqrs.Karabiner-VirtualHIDDevice-Daemon", "G43BCU2T37", 0);
  close(fd); return ok;
}
bool uk_driver_present() {
  struct stat st{};
  for (auto p : {"/Library/Application Support/org.pqrs/tmp/rootonly", "/Library/Application Support/org.pqrs/tmp/rootonly/karabiner_virtual_hid_device_service.sock"}) {
    if (lstat(p, &st) || st.st_uid != 0 || (st.st_mode & 0022) || S_ISLNK(st.st_mode)) return false;
  }
  return S_ISSOCK(st.st_mode);
}
bool uk_begin() {
  if (geteuid() || !permission() || !uk_driver_present() || !uk_trusted_daemon() || client) return false;
  connected = activated = driver = ready = fault = false; mismatch = true;
  pqrs::dispatcher::extra::initialize_shared_dispatcher();
  client = std::make_unique<svc::client>();
  client->connected.connect([c = client.get()] { connected = true; svc::virtual_hid_keyboard_parameters p; c->async_virtual_hid_keyboard_initialize(p); });
  client->closed.connect([] { connected = false; ready = false; fault = true; });
  client->connect_failed.connect([](auto&&) { fault = true; });
  client->error_occurred.connect([](auto&&) { fault = true; });
  client->warning_reported.connect([](auto&&) { fault = true; });
  client->driver_activated.connect([](bool v) { activated = v; });
  client->driver_connected.connect([](bool v) { driver = v; });
  client->driver_version_mismatched.connect([](bool v) { mismatch = v; });
  client->virtual_hid_keyboard_ready.connect([](bool v) { ready = v; });
  client->async_start();
  return true;
}
bool uk_ready() { return healthy(); }
bool uk_fault() { return fault; }
static CFRunLoopRunResult pump_mode(CFStringRef mode, uint64_t wait_ms) {
  return CFRunLoopRunInMode(mode, static_cast<double>(wait_ms) / 1000.0, true);
}
void uk_pump(uint64_t wait_ms) {
  auto result = pump_mode(kCFRunLoopDefaultMode, std::min<uint64_t>(wait_ms, 3));
  // An active capture must retain its HID/power sources. Never spin if that invariant fails.
  if (result == kCFRunLoopRunFinished || result == kCFRunLoopRunStopped) fault = true;
}
static bool pump_self_test() {
  // An isolated source proves wake-on-event and bounded idle waiting, without HID/driver access.
  const auto mode = CFSTR("com.ultimatekeyboards.remapper.scheduling-test");
  auto test_loop = CFRunLoopGetCurrent();
  bool handled = false;
  CFRunLoopSourceContext context{};
  context.info = &handled;
  context.perform = [](void* info) { *static_cast<bool*>(info) = true; };
  auto source = CFRunLoopSourceCreate(nullptr, 0, &context);
  if (!source) return false;
  CFRunLoopAddSource(test_loop, source, mode);
  auto idle = pump_mode(mode, 3);
  std::thread signal([source, test_loop] {
    std::this_thread::sleep_for(std::chrono::milliseconds(10));
    CFRunLoopSourceSignal(source);
    CFRunLoopWakeUp(test_loop);
  });
  auto wake = pump_mode(mode, 500);
  signal.join();
  CFRunLoopRemoveSource(test_loop, source, mode);
  CFRelease(source);
  return idle == kCFRunLoopRunTimedOut && wake == kCFRunLoopRunHandledSource && handled;
}
int uk_capture() {
  if (!healthy() || !permission() || geteuid()) return -1;
  loop = CFRunLoopGetCurrent();
  power_root = IORegisterForSystemPower(nullptr, &power_port, power_callback, &power_notifier);
  if (!power_root || !power_port) return -1;
  CFRunLoopAddSource(loop, IONotificationPortGetRunLoopSource(power_port), kCFRunLoopDefaultMode);
  manager = IOHIDManagerCreate(nullptr, 0);
  if (!manager) return -1;
  int page = 1, usage = 6;
  auto pn = CFNumberCreate(nullptr, kCFNumberIntType, &page), un = CFNumberCreate(nullptr, kCFNumberIntType, &usage);
  const void* keys[] = {CFSTR(kIOHIDDeviceUsagePageKey), CFSTR(kIOHIDDeviceUsageKey)};
  const void* vals[] = {pn, un};
  auto match = CFDictionaryCreate(nullptr, keys, vals, 2, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
  IOHIDManagerSetDeviceMatching(manager, match); CFRelease(match); CFRelease(pn); CFRelease(un);
  IOHIDManagerRegisterDeviceRemovalCallback(manager, removed, nullptr);
  IOHIDManagerScheduleWithRunLoop(manager, loop, kCFRunLoopDefaultMode);
  auto devices = IOHIDManagerCopyDevices(manager);
  if (!devices) return 0;
  std::vector<const void*> list(CFSetGetCount(devices)); CFSetGetValues(devices, list.data());
  bool failed = false;
  for (auto item : list) {
    auto d = (IOHIDDeviceRef)item;
    if (!eligible(d)) continue;
    auto context = device_context(d); // Snapshot the advertised key contract before exclusive open.
    if (!healthy() || IOHIDDeviceOpen(d, kIOHIDOptionsTypeSeizeDevice) != kIOReturnSuccess) { failed = true; break; }
    CFRetain(d); captured.insert(d); device_contexts[d] = context;
    // Enabling while a key is already held would lose the original down/up pairing.
    if (!keys_released(d)) { failed = true; break; }
    IOHIDDeviceRegisterInputValueCallback(d, value_callback, nullptr);
    IOHIDDeviceScheduleWithRunLoop(d, loop, kCFRunLoopDefaultMode);
  }
  CFRelease(devices);
  return failed ? -1 : (int)captured.size();
}
bool uk_event(UKEvent* e) { if (events.empty()) return false; *e = events.front(); events.pop_front(); return true; }
bool uk_post(uint16_t page, uint16_t usage, bool down) {
  if (!healthy() || !supported_usage(page, usage)) return false;
  if (down) pressed[page].insert(usage); else pressed[page].erase(usage);
  return post_page(page);
}
void uk_end() {
  release_inputs();
  if (power_notifier) { IODeregisterForSystemPower(&power_notifier); power_notifier = IO_OBJECT_NULL; }
  if (power_root) { IOServiceClose(power_root); power_root = IO_OBJECT_NULL; }
  if (power_port) { CFRunLoopRemoveSource(loop, IONotificationPortGetRunLoopSource(power_port), kCFRunLoopDefaultMode); IONotificationPortDestroy(power_port); power_port = nullptr; }
  if (client) { client.reset(); pqrs::dispatcher::extra::terminate_shared_dispatcher(); }
  connected = activated = driver = ready = fault = false; mismatch = true;
}
bool uk_bridge_self_test() {
  if (!policy_self_test() || !pump_self_test()) return false;
  static_assert(sizeof(report::keyboard_input) == 67);
  static_assert(sizeof(report::consumer_input) == 65);
  static_assert(sizeof(report::apple_vendor_keyboard_input) == 65);
  static_assert(sizeof(report::apple_vendor_top_case_input) == 65);
  report::keyboard_input r;
  r.keys.insert(4); r.keys.insert(4); r.modifiers.insert(report::modifier::left_shift);
  if (r.keys.count() != 1 || r.modifiers.get_raw_value() != 2 || sizeof(r) != 67) return false;
  r.keys.erase(4); r.modifiers.clear();
  if (!r.keys.empty() || !r.modifiers.empty() || supported_page(1) || !supported_page(0x00ff)) return false;
  for (unsigned bits = 0; bits < 64; ++bits) {
    bool actual = handshake_ready(bits & 1, bits & 2, bits & 4, bits & 8, bits & 16, bits & 32);
    if (actual != (bits == 15)) return false;
  }
  return array_backing_values(true, UINT32_MAX) && !array_backing_values(false, UINT32_MAX) && !array_backing_values(true, 4) &&
      !device_identity_allowed(false, "Split keyboard") && !device_identity_allowed(true, "Karabiner VirtualHIDKeyboard") &&
      device_identity_allowed(true, "Apple Internal Keyboard / Trackpad") && !supported_usage(0x0c, 0x301) && !supported_usage(7, 256);

}
}
