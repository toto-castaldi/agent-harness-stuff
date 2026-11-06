#!/usr/bin/env python3
"""Pi 1.5.0 offline TTY smoke test with synthetic inputs and isolated settings."""
import json
import os
from pathlib import Path
import pty
import re
import select
import signal
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
OSC = re.compile(rb'\x1b\]7501;([^\x07\x1b]*)(?:\x07|\x1b\\)')

def run_case(tool, cancel):
    with tempfile.TemporaryDirectory(prefix='pi-question-osc-') as tmp:
        root = Path(tmp)
        project = root / 'project'
        agent = root / 'agent'
        (project / '.pi').mkdir(parents=True)
        agent.mkdir()
        (project / '.pi' / 'settings.json').write_text(json.dumps({'packages': [str(ROOT)]}))
        master, slave = pty.openpty()
        env = {'PATH': os.environ['PATH'], 'HOME': tmp, 'PI_CODING_AGENT_DIR': str(agent),
               'TERM': 'xterm-256color', 'PI_PROGRAM_STATUS': '1', 'PI_TELEMETRY': '0',
               'PI_SKIP_VERSION_CHECK': '1', 'OPENAI_API_KEY': 'synthetic-test-key'}
        proc = subprocess.Popen(['pi', '--no-session', '--approve', '--offline', '--no-mcp',
                                 '--no-context-files', '-e', str(ROOT / 'tests/pi-probe.ts')],
                                cwd=project, env=env, stdin=slave, stdout=slave, stderr=slave,
                                start_new_session=True)
        os.close(slave)
        output = b''
        def wait_for(predicate):
            nonlocal output
            end = time.monotonic() + 20
            while time.monotonic() < end:
                if predicate(output):
                    return
                if proc.poll() is not None:
                    raise AssertionError(f'Pi exited {proc.returncode}')
                readable, _, _ = select.select([master], [], [], .2)
                if readable:
                    try:
                        output += os.read(master, 65536)
                    except OSError:
                        break
            raise AssertionError(f'timed out waiting for status; observed {OSC.findall(output)!r}')
        try:
            wait_for(lambda data: (project / 'inventory.json').exists() and bool(OSC.findall(data)))
            inventory = json.loads((project / 'inventory.json').read_text())
            assert sorted(x['name'] for x in inventory) == ['question', 'questionnaire'], inventory
            assert all('question-tool' in x['path'] for x in inventory), inventory
            os.write(master, f'/synthetic-{tool}\r'.encode())
            wait_for(lambda data: any(b'blocked' in record for record in OSC.findall(data)))
            blocked = [x for x in OSC.findall(output) if b'blocked' in x][-1]
            assert b'question' in blocked and b'Synthetic' not in blocked, blocked
            old_count = len(OSC.findall(output))
            os.write(master, b'\x1b' if cancel else b'\r')
            wait_for(lambda data: len(OSC.findall(data)) > old_count and b'idle' in OSC.findall(data)[-1])
            print(f'{tool}: {"cancel" if cancel else "answer"}: blocked(question) -> idle')
        finally:
            os.killpg(proc.pid, signal.SIGTERM)
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(proc.pid, signal.SIGKILL)
                proc.wait()
            os.close(master)

if __name__ == '__main__':
    assert subprocess.check_output(['pi', '--version'], text=True).strip() == '1.5.0'
    for name in ('question', 'questionnaire'):
        for cancelled in (False, True):
            run_case(name, cancelled)
