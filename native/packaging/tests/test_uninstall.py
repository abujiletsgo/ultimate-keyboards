"""Exercise actual native uninstall functions with intercepted commands; no root/system edits."""
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'uninstall.sh'
LABELS = ['com.ultimatekeyboards.remapper', 'com.ultimatekeyboards.virtual-hid-launcher']
FAKE = r'''
import json,os,sys
p=os.environ['UK_UNINSTALL_FAKE_STATE'];s=json.load(open(p));args=sys.argv[1:];s['calls'].append(args)
code=0;output=''
if args[0]=='launchctl':
 target=args[2];label=target.split('/',1)[1];job=s['jobs'][label]
 if args[1]=='print':
  if job.get('inspect_error') or (job.get('poll_error') and job['stage']=='stopping'):
   code=5;output='Inspection failed'
  elif job.get('unknown_113'):
   code=113;output='Unexpected absent-like response'
  else:
   if job['stage']=='stopping':
    job['polls']+=1
    if job['polls']>=job.get('remove_after',3):job['stage']='absent'
   if job['stage']=='absent':code=113;output='Bad request.\nCould not find service "'+label+'" in domain for system'
   else:output='state = running\npid = 123'
 elif args[1]=='bootout':
  if job.get('bootout_error'):code=5;output='Stop refused'
  else:job['stage']='stopping'
 else:code=90;output='Forbidden launchctl action'
elif args[0]=='rm':
 if any(j['stage']!='absent' for j in s['jobs'].values()):code=91;output='DELETION BEFORE COMPLETED SHUTDOWN'
 elif s.get('remove_error'):code=13;output='Deletion failed'
elif args[0]=='pkgutil':
 if s.get('forget_error'):code=1
else:code=92;output='Unexpected fake command'
json.dump(s,open(p,'w'));print(output);sys.exit(code)
'''

class NativeUninstallTests(unittest.TestCase):
    def run_uninstall(self, first=None, second=None, uid='0', args='', **changes):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);state=root/'state.json';fake=root/'commands.py'
            jobs={label:dict(stage='existing',polls=0) for label in LABELS}
            jobs[LABELS[0]].update(first or {});jobs[LABELS[1]].update(second or {})
            state.write_text(json.dumps(dict(jobs=jobs,calls=[],**changes)));fake.write_text(FAKE)
            call=f'{shlex.quote(sys.executable)} {shlex.quote(str(fake))}'
            harness=f'''
source {shlex.quote(str(SCRIPT))}
id() {{ printf '%s\\n' {shlex.quote(uid)}; }}
launchctl() {{ {call} launchctl "$@"; }}
rm() {{ {call} rm "$@"; }}
pkgutil() {{ {call} pkgutil "$@"; }}
uk_uninstall_pause() {{ SECONDS=$((SECONDS + 5)); }}
SECONDS=0
uk_uninstall_native {args}
'''
            result=subprocess.run(['/bin/bash','-c',harness],env={**os.environ,'UK_UNINSTALL_FAKE_STATE':str(state)},capture_output=True,text=True,timeout=10)
            return result,json.loads(state.read_text())

    def test_waits_for_both_jobs_before_deletion_and_preserves_shared_components(self):
        result,state=self.run_uninstall()
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual([j['polls'] for j in state['jobs'].values()],[3,3])
        calls=state['calls'];first_rm=next(i for i,c in enumerate(calls) if c[0]=='rm')
        self.assertEqual(sum(c[:2]==['launchctl','bootout'] for c in calls[:first_rm]),2)
        self.assertTrue(all(c[0]!='launchctl' for c in calls[first_rm:]))
        targets=[c[2] for c in calls if c[0]=='launchctl']
        self.assertEqual(set(targets),{'system/'+label for label in LABELS})
        removed=[arg for c in calls if c[0]=='rm' for arg in c[2:]]
        self.assertEqual(set(removed),{'/Library/LaunchDaemons/'+label+'.plist' for label in LABELS}|{'/Library/LaunchAgents/com.ultimatekeyboards.app.plist','/Library/Application Support/com.ultimatekeyboards.app/Native'})
        self.assertEqual([c for c in calls if c[0]=='pkgutil'],[['pkgutil','--forget','com.ultimatekeyboards.native-helper']])

    def test_absent_jobs_do_not_get_stop_requests(self):
        result,state=self.run_uninstall(first={'stage':'absent'},second={'stage':'absent'})
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertFalse(any(c[:2]==['launchctl','bootout'] for c in state['calls']))

    def test_inspection_failure_unknown_absence_and_bootout_failure_never_delete(self):
        for change,expected in [({'inspect_error':True},20),({'unknown_113':True},20),({'bootout_error':True},21),({'poll_error':True},20)]:
            with self.subTest(change=change):
                result,state=self.run_uninstall(first=change)
                self.assertEqual(result.returncode,expected,result.stderr)
                self.assertFalse(any(c[0] in ('rm','pkgutil') for c in state['calls']))

    def test_shutdown_timeout_never_deletes(self):
        result,state=self.run_uninstall(first={'remove_after':99})
        self.assertEqual(result.returncode,22,result.stderr)
        self.assertIn('Timed out',result.stderr)
        self.assertFalse(any(c[0] in ('rm','pkgutil') for c in state['calls']))
        self.assertLessEqual(state['jobs'][LABELS[0]]['polls'],5)

    def test_second_job_failure_preserves_every_file_even_after_first_job_stops(self):
        result,state=self.run_uninstall(second={'inspect_error':True})
        self.assertEqual(result.returncode,20,result.stderr)
        self.assertEqual(state['jobs'][LABELS[0]]['stage'],'absent')
        self.assertFalse(any(c[0] in ('rm','pkgutil') for c in state['calls']))

    def test_nonroot_and_unsupported_arguments_have_no_side_effects(self):
        for options in ({'uid':'501'},{'args':'--product'},{'args':'/arbitrary/path'}):
            with self.subTest(options=options):
                result,state=self.run_uninstall(**options)
                self.assertNotEqual(result.returncode,0)
                self.assertEqual(state['calls'],[])

    def test_deletion_error_is_not_success_and_does_not_forget_receipt(self):
        result,state=self.run_uninstall(remove_error=True)
        self.assertEqual(result.returncode,13)
        self.assertFalse(any(c[0]=='pkgutil' for c in state['calls']))

    def test_missing_receipt_is_reported_after_native_teardown(self):
        result,state=self.run_uninstall(forget_error=True)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertIn('no helper package receipt was forgotten',result.stderr)
        self.assertEqual(state['jobs'][LABELS[0]]['stage'],'absent')

if __name__=='__main__':unittest.main()
