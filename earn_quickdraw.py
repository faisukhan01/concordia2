#!/usr/bin/env python3
"""Earn the Quickdraw achievement: open an issue and close it within 5 minutes.

Quickdraw tiers (issues closed within 5 min of opening):
  1 = Bronze, 3 = Silver, 5 = Gold, 10 = Platinum, 25 = Emerald, 50 = Ruby
We open 5 meaningful issues and immediately close each, well within the 5-min
window per issue.
"""
import json
import sys
import time
import urllib.request
import urllib.error

TOKEN = open("/home/z/my-project/.gh-token").read().strip()
OWNER = "faisukhan01"
REPO = "concordia2"
HEADERS = {
    "Authorization": f"token {TOKEN}",
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
}


def api(method, path, body=None):
    url = f"https://api.github.com{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            err = json.loads(raw)
        except Exception:
            err = raw
        return e.code, err


ISSUES = [
    ("Question: how to switch between admin sub-portals?",
     "How does an admin switch between Admissions / Accountant / Academic "
     "sub-portals? Found it — the SubTabBar pill control at the top. Closing "
     "this as resolved."),
    ("Question: where is the APK download link?",
     "Where can end users download the app? Found it at the GitHub releases "
     "page. Closing as resolved."),
    ("Question: brand orange hex code?",
     "What is the official brand orange? It's #F26522 per the brand guide. "
     "Closing as resolved."),
    ("Question: min Flutter SDK version?",
     "What Flutter version is required? 3.27.0 per the installation docs. "
     "Closing as resolved."),
    ("Question: how to fix slow sign out?",
     "Sign out feels slow. The fix is to clear local auth state before "
     "calling the backend. Closing as resolved."),
]


def main():
    print("=== Quickdraw: open + close 5 issues fast ===")
    closed = 0
    for i, (title, body) in enumerate(ISSUES, 1):
        t0 = time.time()
        code, data = api("POST", f"/repos/{OWNER}/{REPO}/issues",
                         {"title": title, "body": body, "labels": ["question"]})
        if code != 201:
            print(f"  !! open issue {i} failed: {code} {data}")
            continue
        num = data["number"]
        # immediately close
        code2, data2 = api("PATCH", f"/repos/{OWNER}/{REPO}/issues/{num}",
                           {"state": "closed", "state_reason": "completed"})
        elapsed = time.time() - t0
        if code2 == 200:
            print(f"  + issue #{num} opened+closed in {elapsed:.1f}s")
            closed += 1
        else:
            print(f"  !! close issue #{num} failed: {code2} {data2}")
    print(f"\n=== Done. Opened+closed {closed}/5 issues ===")
    print("Quickdraw tiers: 1=Bronze 3=Silver 5=Gold 10=Platinum 25=Emerald 50=Ruby")
    return 0 if closed == 5 else 1


if __name__ == "__main__":
    sys.exit(main())
