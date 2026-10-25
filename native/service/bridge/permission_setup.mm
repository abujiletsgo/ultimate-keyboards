// Only explicit per-user setup modes enter AppKit; the root daemon never does.
#import <AppKit/AppKit.h>
#include <unistd.h>
#include <cstdint>
extern "C" uint32_t uk_console_uid();
extern "C" bool uk_prepare_user_setup() {
  if (geteuid() == 0 || getuid() != uk_console_uid()) return false;
  @autoreleasepool {
    [NSApplication sharedApplication];
    [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
    // Complete the LaunchServices launch handshake before a short-lived check exits.
    [NSApp finishLaunching];
  }
  return true;
}
