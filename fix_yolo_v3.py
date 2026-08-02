#!/usr/bin/env python3
"""YOLO (truly fixed): The canonical mechanism is:
1. Open a PR
2. REQUEST a reviewer (so a review is pending)
3. Merge the PR WITHOUT the review being completed

This is the 'You Only Live Once' move — merging despite a pending review request.
Previous attempts had 0 requested reviews, which doesn't qualify.
"""
import base64
import json
import sys
import time
import urllib.request
import urllib.error

TOKEN1 = open("/home/z/my-project/.gh-token").read().strip()       # faisukhan01 (PR author + merger)
TOKEN2 = open("/home/z/my-project/.gh-token-2").read().strip()      # faisalkhan544814 (requested reviewer)
OWNER = "faisukhan01"
REPO = "concordia2"
BASE = "main"


def api(token, method, path, body=None):
    url = f"https://api.github.com{path}"
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Authorization": f"token {token}", "Accept": "application/vnd.github+json",
               "X-GitHub-Api-Version": "2022-11-28"}
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())


def main():
    print("=" * 60)
    print("YOLO (TRULY FIXED) — request review, then merge WITHOUT review")
    print("=" * 60)
    files = [
        ("docs/YOLO_REVIEW_1.md", "docs: add yolo with requested review 1",
         "# YOLO With Requested Review 1\n\nReview was requested but PR merged without review.\n"),
        ("docs/YOLO_REVIEW_2.md", "docs: add yolo with requested review 2",
         "# YOLO With Requested Review 2\n\nReview was requested but PR merged without review.\n"),
        ("docs/YOLO_REVIEW_3.md", "docs: add yolo with requested review 3",
         "# YOLO With Requested Review 3\n\nReview was requested but PR merged without review.\n"),
    ]
    merged = 0
    for i, (path, msg, content) in enumerate(files, 1):
        branch = f"feat/yolo-review-{int(time.time())}-{i}"
        print(f"\n[{i}/{len(files)}] {msg}")
        try:
            # faisukhan01 creates branch + file
            code, data = api(TOKEN1, "GET", f"/repos/{OWNER}/{REPO}/branches/{BASE}")
            sha = data["commit"]["sha"]
            code, _ = api(TOKEN1, "POST", f"/repos/{OWNER}/{REPO}/git/refs",
                          {"ref": f"refs/heads/{branch}", "sha": sha})
            b64 = base64.b64encode(content.encode()).decode()
            code, _ = api(TOKEN1, "PUT", f"/repos/{OWNER}/{REPO}/contents/{path}",
                          {"message": msg, "content": b64, "branch": branch})

            # faisukhan01 opens a PR
            code, data = api(TOKEN1, "POST", f"/repos/{OWNER}/{REPO}/pulls",
                             {"title": msg, "head": branch, "base": BASE,
                              "body": "Review requested but merging without review. YOLO! 🎲"})
            pr_num = data["number"]
            print(f"  + PR #{pr_num} opened by faisukhan01")

            # REQUEST a review from faisalkhan544814 (critical for YOLO!)
            code, data = api(TOKEN1, "POST",
                             f"/repos/{OWNER}/{REPO}/pulls/{pr_num}/requested_reviewers",
                             {"reviewers": ["faisalkhan544814"]})
            if code in (200, 201):
                print(f"  + review REQUESTED from faisalkhan544814 (pending review)")
            else:
                print(f"  ! review request status {code}: {data}")

            time.sleep(2)

            # faisukhan01 merges WITHOUT the review being completed (the YOLO move)
            for attempt in range(8):
                code, data = api(TOKEN1, "PUT", f"/repos/{OWNER}/{REPO}/pulls/{pr_num}/merge",
                                 {"commit_title": f"Merge pull request #{pr_num}: {msg}",
                                  "merge_method": "merge"})
                if code == 200:
                    print(f"  + PR #{pr_num} MERGED without review completion -> YOLO!")
                    merged += 1
                    break
                time.sleep(3)

            # cleanup branch
            api(TOKEN1, "DELETE", f"/repos/{OWNER}/{REPO}/git/refs/heads/{branch}")

            # Verify the PR has requested_reviews and was merged
            code, data = api(TOKEN1, "GET", f"/repos/{OWNER}/{REPO}/pulls/{pr_num}")
            req_reviews = data.get("requested_reviewers", [])
            print(f"  + verify: requested_reviewers={[r.get('login') for r in req_reviews]}, "
                  f"merged={bool(data.get('merged_at'))}, "
                  f"merged_by={data.get('merged_by',{}).get('login')}")
        except Exception as e:
            print(f"  !! ERROR: {e}")
            try:
                api(TOKEN1, "DELETE", f"/repos/{OWNER}/{REPO}/git/refs/heads/{branch}")
            except Exception:
                pass
    print(f"\nYOLO (truly fixed): {merged}/{len(files)} PRs with requested reviews merged without completion")
    return 0


if __name__ == "__main__":
    sys.exit(main())
