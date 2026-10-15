#!/usr/bin/env python3
"""Time one verification command; append an overlap-aware JSONL timing record."""
import argparse
import datetime
import json
import os
import subprocess
import time

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--batch", required=True)
parser.add_argument("--category", required=True)
parser.add_argument("--label", required=True)
parser.add_argument("--log", required=True)
parser.add_argument("--rerun", action="store_true")
parser.add_argument("command", nargs=argparse.REMAINDER)
args = parser.parse_args()
command = args.command[1:] if args.command[:1] == ["--"] else args.command
if not command:
    parser.error("provide a command after --")

start = datetime.datetime.now(datetime.timezone.utc)
tick = time.monotonic()
try:
    code = subprocess.call(command)
except OSError as error:
    parser.exit(127, str(error) + "\n")
elapsed = time.monotonic() - tick
record = dict(
    batch=args.batch, category=args.category, label=args.label,
    rerun=args.rerun, started_at=start.isoformat(),
    ended_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
    elapsed_seconds=round(elapsed, 6), exit_code=code,
)
# One append write supports concurrent agents. Do not log arguments or environment.
fd = os.open(args.log, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
try:
    os.write(fd, (json.dumps(record) + "\n").encode())
finally:
    os.close(fd)
raise SystemExit(code if code >= 0 else 128 - code)
