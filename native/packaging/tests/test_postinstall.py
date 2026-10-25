"""Run the actual postinstall lifecycle with fake launchctl; never touch launchd."""
import json
import os
from pathlib import Path
import shlex
import socket
import subprocess
import sys
import tempfile
import threading
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'postinstall'
FAKE = r'''
import json,os,sys
p=os.environ['UK_FAKE_STATE'];s=json.load(open(p));args=sys.argv[1:];s['calls'].append(args)
result=0;output=''
def absent():return 113,'Bad request.\nCould not find service "com.ultimatekeyboards.remapper" in domain for system'
if args[0]=='print':
 if s.get('inspect_error'):result,output=5,'Unexpected launchd inspection failure'
 elif s['stage']=='absent':result,output=absent()
 elif s['stage']=='stopping':
  s['stop_polls']+=1
  if s['stop_polls']>=s.get('remove_after',3):s['stage']='absent';result,output=absent()
  else:output='state = running\npid = 123'
 elif s['stage']=='starting':
  s['start_polls']+=1
  if s.get('vanish'):result,output=absent()
  elif s['start_polls']>=s.get('running_after',2):output='state = running'+('' if s.get('no_pid') else '\npid = 456')
  else:output='state = waiting'
 else:output='state = running\npid = 123'
elif args[0]=='bootout':
 if s.get('bootout_error'):result,output=5,'Stop request refused'
 else:s['stage']='stopping'
elif args[0]=='bootstrap':
 if s['stage']!='absent':result,output=37,'Operation already in progress'
 elif s.get('bootstrap_error'):result,output=5,'Bootstrap refused'
 else:s['stage']='starting'
else:result,output=99,'Unexpected command'
json.dump(s,open(p,'w'));print(output);sys.exit(result)
'''

class PostinstallLifecycleTests(unittest.TestCase):
    def lifecycle(self, **changes):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); state=root/'state.json'; fake=root/'launchctl.py'
            state.write_text(json.dumps(dict({'stage':'existing','stop_polls':0,'start_polls':0,'calls':[]},**changes)))
            fake.write_text(FAKE)
            harness=f'''
source {shlex.quote(str(SCRIPT))}
launchctl() {{ {shlex.quote(sys.executable)} {shlex.quote(str(fake))} "$@"; }}
uk_pause() {{ SECONDS=$((SECONDS + 1)); }}
uk_socket_ready() {{
 {shlex.quote(sys.executable)} -c 'import json,os,sys;s=json.load(open(os.environ["UK_FAKE_STATE"]));sys.exit(0 if s["start_polls"]>=s.get("socket_after",3) else 1)'
}}
SECONDS=0
uk_restart_helper system/com.ultimatekeyboards.remapper /fake/own.plist /fake/own.sock 4
'''
            result=subprocess.run(['/bin/bash','-c',harness],env={**os.environ,'UK_FAKE_STATE':str(state)},text=True,capture_output=True,timeout=10)
            return result,json.loads(state.read_text())

    def test_async_bootout_waits_for_absence_before_one_bootstrap_then_endpoint_ready(self):
        result,state=self.lifecycle()
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual(state['stop_polls'],3)
        self.assertEqual(state['start_polls'],3)
        self.assertEqual([c[0] for c in state['calls']].count('bootstrap'),1)
        self.assertEqual([c[0] for c in state['calls']].count('bootout'),1)
        self.assertTrue(all('pqrs' not in ' '.join(c) for c in state['calls']))
        self.assertEqual(set(c[0] for c in state['calls']),{'print','bootout','bootstrap'})

    def test_first_install_does_not_stop_an_absent_job(self):
        result,state=self.lifecycle(stage='absent')
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertNotIn('bootout',[c[0] for c in state['calls']])
        self.assertEqual([c[0] for c in state['calls']].count('bootstrap'),1)

    def test_shutdown_timeout_has_no_bootstrap(self):
        result,state=self.lifecycle(remove_after=99)
        self.assertEqual(result.returncode,22)
        self.assertIn('waiting for system/com.ultimatekeyboards.remapper removal',result.stderr)
        self.assertNotIn('bootstrap',[c[0] for c in state['calls']])
        self.assertLessEqual(state['stop_polls'],5)

    def test_inspection_error_is_not_absence(self):
        result,state=self.lifecycle(inspect_error=True)
        self.assertEqual(result.returncode,20)
        self.assertIn('Cannot inspect',result.stderr)
        self.assertEqual([c[0] for c in state['calls']],['print'])

    def test_stop_failure_prevents_bootstrap(self):
        result,state=self.lifecycle(bootout_error=True)
        self.assertEqual(result.returncode,21)
        self.assertIn('shutdown request failed',result.stderr)
        self.assertNotIn('bootstrap',[c[0] for c in state['calls']])

    def test_bootstrap_failure_is_reported_without_retry(self):
        result,state=self.lifecycle(bootstrap_error=True)
        self.assertEqual(result.returncode,23)
        self.assertIn('Bootstrap refused',result.stdout)
        self.assertIn('no retry attempted',result.stderr)
        self.assertEqual([c[0] for c in state['calls']].count('bootstrap'),1)

    def test_running_job_without_socket_times_out(self):
        result,state=self.lifecycle(socket_after=99)
        self.assertEqual(result.returncode,24)
        self.assertIn('root-owned listening socket',result.stderr)
        self.assertEqual([c[0] for c in state['calls']].count('bootstrap'),1)

    def test_socket_alone_without_running_pid_is_not_ready(self):
        for changes in ({'no_pid':True,'socket_after':0},{'running_after':99,'socket_after':0},{'vanish':True}):
            with self.subTest(changes=changes):
                result,state=self.lifecycle(**changes)
                self.assertEqual(result.returncode,24)
                self.assertEqual([c[0] for c in state['calls']].count('bootstrap'),1)

    @unittest.skipUnless(sys.platform=='darwin','Darwin nc and stat options')
    def test_real_nc_unix_probe_connects_bounded_and_sends_no_protocol_bytes(self):
        # A temporary user-owned server only. Override owner lookup, never root paths.
        with tempfile.TemporaryDirectory(dir='/tmp') as directory:
            endpoint=str(Path(directory)/'probe.sock');listener=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM)
            listener.bind(endpoint);listener.listen(1);listener.settimeout(3);received=[]
            def accept():
                conn,_=listener.accept()
                with conn:conn.settimeout(3);received.append(conn.recv(1024))
            thread=threading.Thread(target=accept);thread.start()
            result=subprocess.run(['/bin/bash','-c',f'source {shlex.quote(str(SCRIPT))}; stat() {{ echo 0; }}; uk_socket_ready {shlex.quote(endpoint)}'],capture_output=True,timeout=4)
            thread.join(4);listener.close()
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertFalse(thread.is_alive());self.assertEqual(received,[b''])
            # A stale socket pathname and a symlink must both fail readiness.
            result=subprocess.run(['/bin/bash','-c',f'source {shlex.quote(str(SCRIPT))}; stat() {{ echo 0; }}; uk_socket_ready {shlex.quote(endpoint)}'],capture_output=True,timeout=4)
            self.assertNotEqual(result.returncode,0)
            link=Path(directory)/'link.sock';link.symlink_to(endpoint)
            result=subprocess.run(['/bin/bash','-c',f'source {shlex.quote(str(SCRIPT))}; stat() {{ echo 0; }}; uk_socket_ready {shlex.quote(str(link))}'],capture_output=True,timeout=4)
            self.assertNotEqual(result.returncode,0)
