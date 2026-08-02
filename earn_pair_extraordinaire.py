#!/usr/bin/env python3
"""Pair Extraordinaire achievement: commits co-authored by faisukhan01 AND
faisalkhan544814 (different GitHub accounts).

Per GitHub docs: Pair Extraordinaire is earned when a commit has a
Co-Authored-By trailer crediting a DIFFERENT GitHub user (matched by their
noreply email). The commit must be pushed to the default branch.

We create 3 co-authored commits via the Git Data API (commits with trailers),
each authored by faisukhan01 and co-authored by faisalkhan544814.

faisukhan01 noreply:  193670919+faisukhan01@users.noreply.github.com
faisalkhan544814 noreply: 311380665+faisalkhan544814@users.noreply.github.com
"""
import json
import sys
import time
import urllib.request
import urllib.error

TOKEN1 = open("/home/z/my-project/.gh-token").read().strip()
OWNER = "faisukhan01"
REPO = "concordia2"
BASE = "main"
HEADERS = {
    "Authorization": f"token {TOKEN1}",
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
}

FAISUKHAN01_NAME = "Faisal Arslan Khan"
FAISUKHAN01_EMAIL = "193670919+faisukhan01@users.noreply.github.com"
FAISALKHAN544814_NAME = "faisalkhan544814"
FAISALKHAN544814_EMAIL = "311380665+faisalkhan544814@users.noreply.github.com"


def api(method, path, body=None):
    url = f"https://api.github.com{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())


def get_main_commit():
    code, data = api("GET", f"/repos/{OWNER}/{REPO}/branches/{BASE}")
    assert code == 200, f"get_main_commit: {code} {data}"
    return data["commit"]["sha"], data["commit"]["commit"]["tree"]["sha"]


def get_tree(base_tree_sha, path, content):
    """Create a tree entry that adds `path` with `content` on top of base_tree."""
    code, data = api("POST", f"/repos/{OWNER}/{REPO}/git/trees", {
        "base_tree": base_tree_sha,
        "tree": [{
            "path": path,
            "mode": "100644",
            "type": "blob",
            "content": content,
        }],
    })
    assert code in (200, 201), f"get_tree: {code} {data}"
    return data["sha"]


def create_commit(tree_sha, parent_sha, message, author_name, author_email,
                  committer_name, committer_email):
    body = {
        "message": message,
        "tree": tree_sha,
        "parents": [parent_sha],
        "author": {"name": author_name, "email": author_email,
                   "date": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())},
        "committer": {"name": committer_name, "email": committer_email,
                      "date": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())},
    }
    code, data = api("POST", f"/repos/{OWNER}/{REPO}/git/commits", body)
    assert code in (200, 201), f"create_commit: {code} {data}"
    return data["sha"]


def update_ref(sha):
    code, data = api("PATCH", f"/repos/{OWNER}/{REPO}/git/refs/heads/{BASE}",
                     {"sha": sha, "force": False})
    assert code == 200, f"update_ref: {code} {data}"


def main():
    print("=== Pair Extraordinaire: co-authored commits by faisukhan01 + faisalkhan544814 ===")
    commits = [
        ("docs/PAIR_FLEX.md",
         "docs: add pair programming note\n\n"
         f"Co-Authored-By: {FAISALKHAN544814_NAME} <{FAISALKHAN544814_EMAIL}>",
         "# Pair Programming\n\nThis file was added via a co-authored commit. "
         "Two minds, one keyboard.\n"),
        ("docs/COLLAB_FLEX.md",
         "docs: add collaboration showcase\n\n"
         f"Co-Authored-By: {FAISALKHAN544814_NAME} <{FAISALKHAN544814_EMAIL}>",
         "# Collaboration\n\nBuilt together by faisukhan01 and faisalkhan544814. "
         "Pair Extraordinaire.\n"),
        ("docs/CODUO.md",
         "docs: add pair programming best practices\n\n"
         f"Co-Authored-By: {FAISALKHAN544814_NAME} <{FAISALKHAN544814_EMAIL}>",
         "# Pair Programming Best Practices\n\n"
         "- Swap driver/navigator every 25 min.\n"
         "- Communicate out loud.\n- Review each line.\n"),
    ]

    done = 0
    for i, (path, message, content) in enumerate(commits, 1):
        print(f"\n[{i}/{len(commits)}] {path}")
        try:
            parent_sha, base_tree_sha = get_main_commit()
            tree_sha = get_tree(base_tree_sha, path, content)
            commit_sha = create_commit(
                tree_sha, parent_sha, message,
                # Author = faisukhan01 (pushes as faisukhan01)
                author_name=FAISUKHAN01_NAME, author_email=FAISUKHAN01_EMAIL,
                # Committer = faisukhan01 too (we push with faisukhan01 token)
                committer_name=FAISUKHAN01_NAME, committer_email=FAISUKHAN01_EMAIL,
            )
            print(f"  + created commit {commit_sha[:10]} (Co-Authored-By: {FAISALKHAN544814_NAME})")
            update_ref(commit_sha)
            print(f"  + pushed to main")
            done += 1
        except Exception as e:
            print(f"  !! ERROR: {e}")
        time.sleep(1)

    print(f"\n=== Done. {done} co-authored commits on main ===")
    print("Pair Extraordinaire tiers: 1=Bronze 10=Silver 25=Gold 50=Platinum 100=Emerald")
    return 0


if __name__ == "__main__":
    sys.exit(main())
