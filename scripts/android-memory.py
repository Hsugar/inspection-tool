#!/usr/bin/env python3
"""Sample this app and its bound WebView renderer, excluding unrelated apps."""
import argparse, json, os, re, subprocess, time
from pathlib import Path
parser = argparse.ArgumentParser()
parser.add_argument('--serial', required=True, help='adb device serial')
parser.add_argument('--seconds', type=int, default=60)
parser.add_argument('--output', default='test-output/android/memory.json')
args = parser.parse_args()
adb = [os.environ.get('ADB', 'adb'), '-s', args.serial]
package = 'com.jiantu.inspection'
def shell(*command):
    return subprocess.run(adb + ['shell', *command], capture_output=True, text=True, check=True).stdout
rows = []
end = time.time() + args.seconds
Path(args.output).parent.mkdir(parents=True, exist_ok=True)
while time.time() < end:
    started = time.time()
    pids = set(shell('pidof', package).split())
    services = shell('dumpsys', 'activity', 'services', package)
    pids.update(re.findall(r'app=ProcessRecord\{\S+ (\d+):[^\s]+:sandboxed_process', services))
    processes = []
    for pid in sorted(pids):
        data = shell('dumpsys', 'meminfo', pid)
        match = re.search(r'TOTAL PSS:\s+(\d+)', data)
        if match: processes.append({'pid': pid, 'pssKB': int(match[1])})
    rows.append({'time': started, 'processes': processes, 'totalPssKB': sum(p['pssKB'] for p in processes)})
    Path(args.output).write_text(json.dumps(rows, indent=2))
    time.sleep(max(0, 1 - (time.time() - started)))
print(json.dumps({'samples': len(rows), 'peakMiB': max(r['totalPssKB'] for r in rows)/1024, 'lastMiB': rows[-1]['totalPssKB']/1024}))
