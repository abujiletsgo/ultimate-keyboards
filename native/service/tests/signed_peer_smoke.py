#!/usr/bin/env python3
"""Opt-in macOS integration test of the compiled bridge's real audit-token authorization.

Needs an existing native static library and an explicitly named local Apple signing
identity. Never builds/starts the remapper, connects to production sockets, requests
TCC access, opens HID devices, or posts input. All executable fixtures are temporary.
"""
import argparse
import hashlib
import json
import os
import pathlib
import plistlib
import re
import select
import shutil
import subprocess
import sys
import tempfile

HOST = r'''
#include <sys/socket.h>
#include <sys/un.h>
#include <sys/stat.h>
#include <unistd.h>
#include <poll.h>
#include <cerrno>
#include <cstdio>
#include <cstring>
#include <cstdint>
extern "C" bool uk_authorize(int fd, const char* team);
extern "C" bool uk_verify_signature(int fd, const char* identifier, const char* team, uid_t expected_uid);
extern "C" uint32_t uk_console_uid();
int main(int argc, char** argv) {
  if (argc != 3 || strlen(argv[1]) >= sizeof(sockaddr_un::sun_path)) return 10;
  if (getuid() == 0 || getuid() != uk_console_uid()) {
    fprintf(stderr, "This test requires the current non-root console user\n"); return 11;
  }
  umask(0077);
  int listener = socket(AF_UNIX, SOCK_STREAM, 0);
  sockaddr_un address{}; address.sun_family = AF_UNIX;
  strlcpy(address.sun_path, argv[1], sizeof(address.sun_path));
  if (listener < 0 || bind(listener, reinterpret_cast<sockaddr*>(&address), sizeof(address)) || listen(listener, 1)) return 12;
  puts("READY"); fflush(stdout);
  pollfd poller{listener, POLLIN, 0};
  if (poll(&poller, 1, 10000) != 1) { close(listener); unlink(argv[1]); return 13; }
  int peer = accept(listener, nullptr, nullptr);
  if (peer < 0) { close(listener); unlink(argv[1]); return 14; }
  timeval timeout{5, 0}; setsockopt(peer, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
  setsockopt(peer, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout));
  char ready = 0;
  if (recv(peer, &ready, 1, 0) != 1 || ready != 'R') return 15;
  uid_t uid = UINT32_MAX; gid_t gid = UINT32_MAX;
  if (getpeereid(peer, &uid, &gid)) return 16;
  bool authorized = uk_authorize(peer, argv[2]);
  // Exercise the *actual* bridge's credential predicate without changing process credentials.
  bool wrong_uid_authorized = uk_verify_signature(peer, "com.ultimatekeyboards.app", argv[2], uid + 1);
  printf("{\"authorized\":%s,\"peerUid\":%u,\"consoleUid\":%u,\"wrongExpectedUidAuthorized\":%s}\n",
         authorized ? "true" : "false", uid, uk_console_uid(), wrong_uid_authorized ? "true" : "false");
  fflush(stdout);
  char response = authorized ? '1' : '0';
  int sent = static_cast<int>(send(peer, &response, 1, 0));
  close(peer); close(listener); unlink(argv[1]);
  return sent == 1 ? 0 : 17;
}
'''

CLIENT = r'''
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>
#include <cstdio>
#include <cstring>
int main(int argc, char** argv) {
  if (argc != 2 || strlen(argv[1]) >= sizeof(sockaddr_un::sun_path)) return 20;
  int fd = socket(AF_UNIX, SOCK_STREAM, 0);
  sockaddr_un address{}; address.sun_family = AF_UNIX;
  strlcpy(address.sun_path, argv[1], sizeof(address.sun_path));
  if (fd < 0 || connect(fd, reinterpret_cast<sockaddr*>(&address), sizeof(address))) return 21;
  timeval timeout{10, 0}; setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
  char ready = 'R';
  if (send(fd, &ready, 1, 0) != 1) return 22;
  char result = 0;
  if (recv(fd, &result, 1, 0) != 1) return 23;
  close(fd);
  return result == '0' || result == '1' ? 0 : 24;
}
'''


def command(args):
    result = subprocess.run([str(a) for a in args], capture_output=True, text=True, timeout=60)
    if result.returncode:
        raise RuntimeError(f"Command failed ({result.returncode}): {args[0]}\n{result.stdout}{result.stderr}")
    return result.stdout, result.stderr


def signing_metadata(path):
    _, stderr = command(["/usr/bin/codesign", "--display", "--verbose=4", path])
    values = {}
    for line in stderr.splitlines():
        if line.startswith(("Identifier=", "TeamIdentifier=", "Signature=", "CDHash=")):
            key, value = line.split("=", 1)
            values[key] = value
    return values


def stop(process):
    if process is not None and process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=3)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--identity", required=True, help="Existing Apple Development/Developer ID Application identity")
    parser.add_argument("--team", required=True, help="Expected ten-character Team ID")
    parser.add_argument("--native-lib", type=pathlib.Path, help="Existing libuk_native.a; no remapper build is performed")
    parser.add_argument("--work-dir", type=pathlib.Path, default=pathlib.Path("/Volumes/Work"), help="Parent of temporary fixtures")
    args = parser.parse_args()
    if sys.platform != "darwin":
        raise RuntimeError("This integration test requires macOS; no test was run")
    if os.getuid() == 0:
        raise RuntimeError("Run as the current console user, never root")
    if not re.fullmatch(r"[A-Z0-9]{10}", args.team):
        raise RuntimeError("--team must be an explicit ten-character Apple Team ID")
    service = pathlib.Path(__file__).resolve().parents[1]
    library = args.native_lib
    if library is None:
        libraries = list((service / "target/release/build").glob("*/out/libuk_native.a"))
        if len(libraries) != 1:
            raise RuntimeError("Pass --native-lib explicitly; exactly one existing release bridge library was not found")
        library = libraries[0]
    library = library.resolve(strict=True)
    lib_sha = hashlib.sha256(library.read_bytes()).hexdigest()
    fixtures_metadata, results = {}, []
    with tempfile.TemporaryDirectory(prefix="uk-peer-", dir=args.work_dir) as temp:
        root = pathlib.Path(temp)
        host_source, client_source = root / "host.cpp", root / "client.cpp"
        host_source.write_text(HOST)
        client_source.write_text(CLIENT)
        host, client = root / "host", root / "client"
        frameworks = []
        for framework in ["CoreFoundation", "IOKit", "Security", "SystemConfiguration", "ApplicationServices"]:
            frameworks += ["-framework", framework]
        command(["/usr/bin/xcrun", "clang++", "-std=c++23", "-O0", host_source, library, "-o", host, *frameworks])
        command(["/usr/bin/xcrun", "clang++", "-std=c++23", "-O0", client_source, "-o", client])
        fixtures = {}
        for name, identifier, identity in [
            ("correct", "com.ultimatekeyboards.app", args.identity),
            ("wrong-bundle", "com.ultimatekeyboards.auth-test-wrong", args.identity),
            ("ad-hoc", "com.ultimatekeyboards.app", "-"),
        ]:
            app = root / f"{name}.app"
            executable = app / "Contents/MacOS/client"
            executable.parent.mkdir(parents=True)
            shutil.copy2(client, executable)
            (app / "Contents/Info.plist").write_bytes(plistlib.dumps({
                "CFBundleIdentifier": identifier, "CFBundleExecutable": "client", "CFBundlePackageType": "APPL",
                "CFBundleName": f"Temporary authorization test {name}", "CFBundleVersion": "1", "CFBundleShortVersionString": "1.0",
            }))
            command(["/usr/bin/codesign", "--force", "--sign", identity, "--identifier", identifier, "--timestamp=none", app])
            command(["/usr/bin/codesign", "--verify", "--strict", app])
            metadata = signing_metadata(executable)
            if metadata.get("Identifier") != identifier:
                raise RuntimeError(f"Fixture identifier did not match: {metadata}")
            if identity != "-" and metadata.get("TeamIdentifier") != args.team:
                raise RuntimeError(f"Fixture was not signed by the requested Team ID: {metadata}")
            fixtures[name], fixtures_metadata[name] = executable, metadata
        wrong_team = "ZZZZZZZZZZ" if args.team != "ZZZZZZZZZZ" else "YYYYYYYYYY"
        for index, (name, fixture, expected_team, expected) in enumerate([
            ("correct-signed-current-console-peer", "correct", args.team, True),
            ("same-team-wrong-bundle", "wrong-bundle", args.team, False),
            ("ad-hoc-correct-bundle", "ad-hoc", args.team, False),
            ("correct-bundle-wrong-expected-team", "correct", wrong_team, False),
        ]):
            socket_path = root / f"s{index}"
            if len(os.fsencode(socket_path)) >= 104:
                raise RuntimeError("Temporary Unix socket path exceeds Darwin's 103-byte limit; use a shorter --work-dir")
            server = peer = None
            try:
                server = subprocess.Popen([str(host), str(socket_path), expected_team], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                if not select.select([server.stdout], [], [], 10)[0] or server.stdout.readline().strip() != "READY":
                    stop(server)
                    raise RuntimeError(f"Authorization host failed to bind: {server.stderr.read()}")
                # exec happens before the child creates/connects the socket: this is not an inherited socketpair.
                peer = subprocess.Popen([str(fixtures[fixture]), str(socket_path)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                output, error = server.communicate(timeout=15)
                peer_output, peer_error = peer.communicate(timeout=5)
                if server.returncode or peer.returncode:
                    raise RuntimeError(f"{name}: host={server.returncode} client={peer.returncode}\n{error}{peer_error}{peer_output}")
                outcome = json.loads(output)
                if outcome["authorized"] is not expected or outcome["wrongExpectedUidAuthorized"]:
                    raise AssertionError(f"{name}: unexpected actual bridge decision: {outcome}")
                if outcome["peerUid"] != os.getuid() or outcome["consoleUid"] != os.getuid():
                    raise AssertionError(f"Console session changed or peer identity mismatched: {outcome}")
                if socket_path.exists():
                    raise AssertionError(f"Host did not clean up {socket_path}")
                results.append({"case": name, "expected": expected, **outcome})
            finally:
                stop(peer)
                stop(server)
    if hashlib.sha256(library.read_bytes()).hexdigest() != lib_sha:
        raise AssertionError("The linked bridge library changed during this verification")
    version, _ = command(["/usr/bin/sw_vers", "-productVersion"])
    print(json.dumps({"passed": True, "macOS": version.strip(), "nativeLibrary": str(library), "nativeLibrarySHA256": lib_sha,
                      "team": args.team, "fixtures": fixtures_metadata, "results": results,
                      "limitations": ["Different-UID process and actual console switching were not attempted; the native expected-UID rejection predicate was exercised on a real accepted socket.",
                                      "No root helper, production IPC endpoint, HID initialization/output, installer, permission prompt, or driver activation was exercised."],
                      "temporaryFixturesRemoved": True}, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, AssertionError, OSError, subprocess.TimeoutExpired, ValueError) as error:
        print(f"SIGNED PEER TEST FAILED: {error}", file=sys.stderr)
        sys.exit(1)
