#!/usr/bin/env python3
"""Deploy firestore.rules via the Firebase Rules REST API using the caller's
gcloud access token — NO firebase CLI login required.

Run from any shell where `gcloud auth print-access-token` works (i.e. after
`gcloud auth login`). Safe: it creates a new ruleset first (inert), then points
the live release at it; if anything fails before the release swap, the currently
deployed rules stay active.

Usage:
    python scripts/deploy-firestore-rules.py
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

PROJECT = "gen-lang-client-0615287333"
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RULES_PATH = os.path.join(REPO, "firestore.rules")
BASE = f"https://firebaserules.googleapis.com/v1/projects/{PROJECT}"


def gcloud_token():
    # shell=True so `gcloud` resolves to gcloud.cmd on Windows the same way the
    # interactive shell finds it.
    try:
        out = subprocess.run(
            "gcloud auth print-access-token",
            capture_output=True, text=True, shell=True,
        )
    except OSError as exc:
        sys.exit("ERROR: could not run gcloud: " + str(exc))
    tok = out.stdout.strip()
    if out.returncode != 0 or not tok:
        sys.exit("ERROR: could not get a gcloud access token. Run "
                 "`gcloud auth login` first.\n" + (out.stderr or ""))
    return tok


def api(method, url, tok, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url, data=data, method=method,
        headers={"Authorization": f"Bearer {tok}",
                 "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as exc:
        sys.exit(f"ERROR {exc.code} on {method} {url}:\n{exc.read().decode()}")


def main():
    tok = gcloud_token()
    with open(RULES_PATH, encoding="utf-8") as handle:
        content = handle.read()

    ruleset = api(
        "POST", f"{BASE}/rulesets", tok,
        {"source": {"files": [{"name": "firestore.rules", "content": content}]}},
    )
    name = ruleset["name"]
    print("Created ruleset:", name)

    release = api(
        "PATCH", f"{BASE}/releases/cloud.firestore", tok,
        {"release": {"name": f"projects/{PROJECT}/releases/cloud.firestore",
                     "rulesetName": name}},
    )
    print("Live release now points at:", release.get("rulesetName", name))
    print("\nOK - Firestore rules deployed.")


if __name__ == "__main__":
    main()
