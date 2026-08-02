#!/usr/bin/env python3
"""YOLO achievement: faisalkhan544814 opens a PR → faisukhan01 merges it
WITHOUT any review. The defining YOLO trait is "merged without review".

Branch protection currently has required_pull_request_reviews: null, which
means no review is required — perfect for YOLO. We open a PR from the 2nd
account's branch and merge it as faisukhan01.
"""
import base64
import json
import sys
import time
import urllib.request
import urllib.error

TOKEN1 = open("/home/z/my-project/.gh-token").read().strip()       # faisukhan01 (merger)
TOKEN2 = open("/home/z/my-project/.gh-token-2").read().strip()      # faisalkhan544814 (author)
OWNER = "faisukhan01"
REPO = "concordia2"
BASE = "main"


def api(token, method, path, body=None):
    url = f"https://api.github.com{path}"
    data = json.dumps(body).encode() if body is not None else None
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())


def get_main_sha(token):
    code, data = api(token, "GET", f"/repos/{OWNER}/{REPO}/branches/{BASE}")
    assert code == 200, f"get_main_sha: {code} {data}"
    return data["commit"]["sha"]


def create_branch(token, name, sha):
    code, data = api(token, "POST", f"/repos/{OWNER}/{REPO}/git/refs",
                     {"ref": f"refs/heads/{name}", "sha": sha})
    assert code in (200, 201), f"create_branch: {code} {data}"


def create_file(token, branch, path, message, content):
    b64 = base64.b64encode(content.encode()).decode()
    code, data = api(token, "PUT", f"/repos/{OWNER}/{REPO}/contents/{path}",
                     {"message": message, "content": b64, "branch": branch})
    assert code in (200, 201), f"create_file: {code} {data}"


def open_pr(token, head, title, body):
    code, data = api(token, "POST", f"/repos/{OWNER}/{REPO}/pulls",
                     {"title": title, "head": head, "base": BASE, "body": body})
    assert code == 201, f"open_pr: {code} {data}"
    return data["number"]


def merge_pr(token, number, title):
    payload = {"commit_title": f"Merge pull request #{number}: {title}",
               "merge_method": "merge"}
    for attempt in range(8):
        code, data = api(token, "PUT", f"/repos/{OWNER}/{REPO}/pulls/{number}/merge", payload)
        if code == 200:
            return True
        time.sleep(3)
    raise RuntimeError(f"merge_pr failed #{number}: {code} {data}")


def main():
    print("=== YOLO: faisalkhan544814 opens PR, faisukhan01 merges WITHOUT review ===")
    # Create 3 YOLO PRs for safety (only need 1, but redundancy in case of edge cases)
    merged = 0
    files = [
        ("docs/YOLO_FLEX.md", "docs: add YOLO badge flex note",
         "# YOLO Flex\n\nThis file marks a PR that was merged without review. "
         "Sometimes you ship fast. 🎲\n"),
        ("docs/COLLABORATION.md", "docs: add collaboration guide",
         "# Collaboration Guide\n\nThis project welcomes collaboration. See "
         "CONTRIBUTING.md for the workflow.\n"),
        ("docs/SHIPPING_FAST.md", "docs: add shipping philosophy",
         "# Shipping Fast\n\nFor hotfixes, we merge directly. For features, "
         "we use PRs. Balance speed with review.\n"),
    ]
    for i, (path, msg, content) in enumerate(files, 1):
        print(f"\n[{i}/{len(files)}] {msg}")
        branch = f"feat/yolo-{int(time.time())}-{i}"
        try:
            # 2nd account creates branch + file + PR
            sha = get_main_sha(TOKEN2)
            create_branch(TOKEN2, branch, sha)
            create_file(TOKEN2, branch, path, msg, content)
            pr_num = open_pr(TOKEN2, branch, msg,
                             "Opened by collaborator. Merging without review.")
            print(f"  + PR #{pr_num} opened by faisalkhan544814")
            time.sleep(2)
            # faisukhan01 merges WITHOUT review (no review requested, no approval)
            merge_pr(TOKEN1, pr_num, msg)
            print(f"  + merged by faisukhan01 (NO REVIEW) -> YOLO qualifier")
            # cleanup branch
            api(TOKEN1, "DELETE", f"/repos/{OWNER}/{REPO}/git/refs/heads/{branch}")
            merged += 1
        except Exception as e:
            print(f"  !! ERROR: {e}")
            try:
                api(TOKEN1, "DELETE", f"/repos/{OWNER}/{REPO}/git/refs/heads/{branch}")
            except Exception:
                pass
    print(f"\n=== Done. {merged} YOLO PRs merged without review ===")
    print("YOLO tiers: 1=Bronze 10=Silver 25=Gold 50=Platinum 100=Emerald")
    return 0


if __name__ == "__main__":
    sys.exit(main())
