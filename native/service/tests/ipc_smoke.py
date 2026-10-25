#!/usr/bin/env python3
"""Exercise the real Unix listener exclusively through the hardware-prohibited test mode."""
import json
import pathlib
import socket
import subprocess
import sys
import tempfile
import time

binary = pathlib.Path(sys.argv[1]).resolve()
with tempfile.TemporaryDirectory(prefix="uk-ipc-") as temp:
    path = str(pathlib.Path(temp) / "helper.sock")
    process = subprocess.Popen([str(binary), "--test-socket", path], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        for _ in range(100):
            if pathlib.Path(path).exists():
                break
            if process.poll() is not None:
                raise AssertionError(process.stderr.read().decode())
            time.sleep(0.02)
        def request(data):
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
                client.settimeout(3)
                client.connect(path)
                payload = data if isinstance(data, bytes) else json.dumps(data).encode() + b"\n"
                try:
                    client.sendall(payload)
                except BrokenPipeError:
                    pass  # The size cap can reject before all oversized bytes are written.
                return json.loads(client.makefile("rb").readline())
        status = request({"version": 1, "command": "status"})
        assert status["ok"] and not status["status"]["enabled"] and status["status"]["capturedDevices"] == 0
        profile = {"version": 1, "title": "IPC safety check", "rules": []}
        applied = request({"version": 1, "command": "apply", "profile": profile, "enable": False})
        assert applied["ok"] and applied["status"]["profileTitle"] == profile["title"]
        denied = request({"version": 1, "command": "apply", "profile": profile, "enable": True})
        assert not denied["ok"] and "Test mode rejects" in denied["error"]
        assert not denied["status"]["enabled"] and denied["status"]["capturedDevices"] == 0
        assert not request(b"{malformed}\n")["ok"]
        assert not request(b" " * (1024 * 1024 + 1) + b"\n")["ok"]
        assert not request({"version": 9, "command": "status"})["ok"]
        assert request({"version": 1, "command": "disable"})["ok"]
        # A slow/incomplete peer times out, while another peer remains usable.
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as slow:
            slow.settimeout(3)
            slow.connect(path)
            slow.sendall(b"{")
            assert request({"version": 1, "command": "status"})["ok"]
            timeout = json.loads(slow.makefile("rb").readline())
            assert not timeout["ok"]
        restarting = request({"version": 1, "command": "restart"})
        assert restarting["ok"] and not restarting["status"]["enabled"] and restarting["status"]["capturedDevices"] == 0
        assert restarting["status"]["profileTitle"] == profile["title"]
        process.wait(timeout=5)
        assert process.returncode == 0 and not pathlib.Path(path).exists()
        print("IPC smoke passed: status, apply, explicit enable rejection, malformed/oversized/version rejection, disable, slow-client timeout, graceful restart with profile retained and capture disabled.")
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
        assert process.returncode == 0, process.stderr.read().decode()
        assert not pathlib.Path(path).exists(), "socket cleanup failed"
