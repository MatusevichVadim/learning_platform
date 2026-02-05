from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any


def run_python_tests(user_code: str, spec_json: str, timeout_seconds: int = 3) -> tuple[bool, str | dict]:
    """Run user Python code in a separate process with a tiny harness and timeout.

    spec_json example: {"function": "add", "tests": [[1,2,3],[5,7,12]]}
    Returns (is_correct, message or detailed results)
    """
    spec: dict[str, Any]
    try:
        spec = json.loads(spec_json or "{}")
    except Exception:
        spec = {}

    function_name = spec.get("function", "func")
    tests = spec.get("tests", [])

    with tempfile.TemporaryDirectory() as td:
        tmpdir = Path(td)
        code_file = tmpdir / "user_code.py"
        harness_file = tmpdir / "harness.py"

        code_file.write_text(user_code, encoding="utf-8")

        harness = f"""
import importlib.util, json, sys

spec_name = "user_code"
spec = importlib.util.spec_from_file_location(spec_name, "{code_file}")
mod = importlib.util.module_from_spec(spec)
try:
    spec.loader.exec_module(mod)  # type: ignore
except Exception as e:
    print(json.dumps({{"ok": False, "msg": f"Import error: {{e}}"}}))
    sys.exit(0)

fn = getattr(mod, {function_name!r}, None)
if not callable(fn):
    print(json.dumps({{"ok": False, "msg": f"Function {function_name} not found"}}))
    sys.exit(0)

tests = {json.dumps(tests)}
results = []
all_ok = True
for idx, t in enumerate(tests):
    try:
        a, b, expected = t
        out = fn(a, b)
        if out != expected:
            results.append({{"ok": False, "msg": f"Fail test #{{idx+1}}: ({{a}},{{b}})->{{out}} != {{expected}}"}})
            all_ok = False
        else:
            results.append({{"ok": True, "msg": "Passed"}})
    except Exception as e:
        results.append({{"ok": False, "msg": f"Error test #{{idx+1}}: {{e}}"}})
        all_ok = False

print(json.dumps({{"ok": all_ok, "results": results}}))
""".replace("{code_file}", str(code_file).replace("\\", "/"))

        harness_file.write_text(harness, encoding="utf-8")

        try:
            # Run python in isolated mode (-I) to reduce available environment.
            proc = subprocess.run(
                [sys.executable, "-I", str(harness_file)],
                cwd=str(tmpdir),
                capture_output=True,
                text=True,
                timeout=timeout_seconds,
            )
        except subprocess.TimeoutExpired:
            return False, {"ok": False, "msg": "Timeout", "results": []}

        out = (proc.stdout or "").strip()
        err = (proc.stderr or "").strip()
        if err:
            # Do not expose full stderr; summarize
            return False, {"ok": False, "msg": "Runtime error", "results": []}

        try:
            data = json.loads(out or "{}")
            ok = bool(data.get("ok"))
            # Return full data for frontend to parse detailed results
            return ok, data
        except Exception:
            return False, {"ok": False, "msg": "Invalid runner output", "results": []}
