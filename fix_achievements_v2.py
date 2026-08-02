#!/usr/bin/env python3
"""FIXED achievements based on canonical criteria from
Schweinepriester/github-profile-achievements:

YOLO = "Merged OWN pull request without code review"
  -> faisukhan01 opens a PR AND merges it himself, no review requested.
  (My previous approach had the 2nd account open PRs — WRONG for YOLO.)

Pair Extraordinaire = "Coauthored in a MERGED pull request"
  -> A commit with Co-Authored-By trailer must be inside a MERGED PR.
  (My previous approach pushed co-authored commits directly to main — WRONG.
   Direct commits don't count; must go through PR merge.)

Galaxy Brain = "2 accepted answers" (base), 8 = Bronze
  -> Already have 7 cross-user accepted answers. Adding more for safety.
"""
import base64
import json
import sys
import time
import urllib.request
import urllib.error

TOKEN1 = open("/home/z/my-project/.gh-token").read().strip()       # faisukhan01
TOKEN2 = open("/home/z/my-project/.gh-token-2").read().strip()      # faisalkhan544814
OWNER = "faisukhan01"
REPO = "concordia2"
BASE = "main"

FAISUKHAN01_NAME = "Faisal Arslan Khan"
FAISUKHAN01_EMAIL = "faisu577277@gmail.com"
FAISALKHAN544814_NAME = "faisalkhan544814"
FAISALKHAN544814_EMAIL = "faisalkhan544814@gmail.com"


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


def gql(token, query, variables=None):
    headers = {"Authorization": f"bearer {token}", "Accept": "application/vnd.github+json",
               "Content-Type": "application/json"}
    body = json.dumps({"query": query, "variables": variables or {}}).encode()
    req = urllib.request.Request("https://api.github.com/graphql", data=body,
                                 headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())


# ============================================================
# FIX 1: PAIR EXTRAORDINAIRE — co-authored commits in MERGED PRs
# ============================================================
def pair_extraordinaire_via_pr():
    print("=" * 60)
    print("PAIR EXTRAORDINAIRE (FIXED) — co-authored commits via MERGED PRs")
    print("=" * 60)
    # faisukhan01 opens a branch, creates a co-authored commit, opens a PR,
    # and merges it. The co-authored commit is INSIDE the merged PR.
    files = [
        ("docs/PAIR_VIA_PR_1.md",
         "docs: add pair programming via PR (1)\n\n"
         f"Co-Authored-By: {FAISALKHAN544814_NAME} <{FAISALKHAN544814_EMAIL}>",
         "# Pair Programming Via PR\n\nThis co-authored commit was merged via "
         "a pull request, qualifying for Pair Extraordinaire.\n"),
        ("docs/PAIR_VIA_PR_2.md",
         "docs: add collaboration via PR (2)\n\n"
         f"Co-Authored-By: {FAISALKHAN544814_NAME} <{FAISALKHAN544814_EMAIL}>",
         "# Collaboration Via PR\n\nSecond co-authored commit merged via PR.\n"),
        ("docs/PAIR_VIA_PR_3.md",
         "docs: add team work via PR (3)\n\n"
         f"Co-Authored-By: {FAISALKHAN544814_NAME} <{FAISALKHAN544814_EMAIL}>",
         "# Team Work Via PR\n\nThird co-authored commit merged via PR.\n"),
        ("docs/PAIR_VIA_PR_4.md",
         "docs: add co-author demo via PR (4)\n\n"
         f"Co-Authored-By: {FAISALKHAN544814_NAME} <{FAISALKHAN544814_EMAIL}>",
         "# Co-Author Demo Via PR\n\nFourth co-authored commit merged via PR.\n"),
        ("docs/PAIR_VIA_PR_5.md",
         "docs: add pair retrospective via PR (5)\n\n"
         f"Co-Authored-By: {FAISALKHAN544814_NAME} <{FAISALKHAN544814_EMAIL}>",
         "# Pair Retrospective Via PR\n\nFifth co-authored commit merged via PR.\n"),
    ]
    merged = 0
    for i, (path, message, content) in enumerate(files, 1):
        branch = f"feat/pair-pr-{int(time.time())}-{i}"
        print(f"\n[{i}/{len(files)}] {path}")
        try:
            # faisukhan01 creates branch
            code, data = api(TOKEN1, "GET", f"/repos/{OWNER}/{REPO}/branches/{BASE}")
            sha = data["commit"]["sha"]
            code, _ = api(TOKEN1, "POST", f"/repos/{OWNER}/{REPO}/git/refs",
                          {"ref": f"refs/heads/{branch}", "sha": sha})

            # Create a co-authored commit on the branch using Git Data API
            base_tree = data["commit"]["commit"]["tree"]["sha"]
            code, data = api(TOKEN1, "POST", f"/repos/{OWNER}/{REPO}/git/trees", {
                "base_tree": base_tree,
                "tree": [{"path": path, "mode": "100644", "type": "blob",
                          "content": content}],
            })
            tree_sha = data["sha"]
            now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            code, data = api(TOKEN1, "POST", f"/repos/{OWNER}/{REPO}/git/commits", {
                "message": message,
                "tree": tree_sha,
                "parents": [sha],
                "author": {"name": FAISUKHAN01_NAME, "email": FAISUKHAN01_EMAIL, "date": now},
                "committer": {"name": FAISUKHAN01_NAME, "email": FAISUKHAN01_EMAIL, "date": now},
            })
            commit_sha = data["sha"]
            # Update the branch ref to point to the new commit
            code, _ = api(TOKEN1, "PATCH", f"/repos/{OWNER}/{REPO}/git/refs/heads/{branch}",
                          {"sha": commit_sha, "force": False})
            print(f"  + co-authored commit {commit_sha[:10]} on branch {branch}")

            # faisukhan01 opens a PR for this branch
            code, data = api(TOKEN1, "POST", f"/repos/{OWNER}/{REPO}/pulls",
                             {"title": f"docs: add pair programming file {i}",
                              "head": branch, "base": BASE,
                              "body": f"Co-authored commit. Closes pair-extraordinaire milestone {i}."})
            pr_num = data["number"]
            print(f"  + PR #{pr_num} opened by faisukhan01")

            time.sleep(2)
            # Merge the PR (faisukhan01 merges his own PR)
            for attempt in range(8):
                code, data = api(TOKEN1, "PUT", f"/repos/{OWNER}/{REPO}/pulls/{pr_num}/merge",
                                 {"commit_title": f"Merge pull request #{pr_num}",
                                  "merge_method": "merge"})
                if code == 200:
                    print(f"  + PR #{pr_num} MERGED (co-authored commit now in merged PR)")
                    merged += 1
                    break
                time.sleep(3)
            api(TOKEN1, "DELETE", f"/repos/{OWNER}/{REPO}/git/refs/heads/{branch}")
        except Exception as e:
            print(f"  !! ERROR: {e}")
            try:
                api(TOKEN1, "DELETE", f"/repos/{OWNER}/{REPO}/git/refs/heads/{branch}")
            except Exception:
                pass
    print(f"\nPair Extraordinaire (fixed): {merged}/{len(files)} co-authored PRs merged")
    return merged


# ============================================================
# FIX 2: YOLO — faisukhan01 opens AND merges his OWN PRs (no review)
# ============================================================
def yolo_own_pr():
    print("\n" + "=" * 60)
    print("YOLO (FIXED) — faisukhan01 opens AND merges OWN PRs without review")
    print("=" * 60)
    files = [
        ("docs/YOLO_OWN_1.md", "docs: add yolo own PR 1", "# YOLO Own PR 1\n\nMerged own PR without review.\n"),
        ("docs/YOLO_OWN_2.md", "docs: add yolo own PR 2", "# YOLO Own PR 2\n\nMerged own PR without review.\n"),
        ("docs/YOLO_OWN_3.md", "docs: add yolo own PR 3", "# YOLO Own PR 3\n\nMerged own PR without review.\n"),
        ("docs/YOLO_OWN_4.md", "docs: add yolo own PR 4", "# YOLO Own PR 4\n\nMerged own PR without review.\n"),
        ("docs/YOLO_OWN_5.md", "docs: add yolo own PR 5", "# YOLO Own PR 5\n\nMerged own PR without review.\n"),
    ]
    merged = 0
    for i, (path, msg, content) in enumerate(files, 1):
        branch = f"feat/yolo-own-{int(time.time())}-{i}"
        print(f"\n[{i}/{len(files)}] {msg}")
        try:
            # faisukhan01 creates branch + file + PR + merges (all himself)
            code, data = api(TOKEN1, "GET", f"/repos/{OWNER}/{REPO}/branches/{BASE}")
            sha = data["commit"]["sha"]
            code, _ = api(TOKEN1, "POST", f"/repos/{OWNER}/{REPO}/git/refs",
                          {"ref": f"refs/heads/{branch}", "sha": sha})
            b64 = base64.b64encode(content.encode()).decode()
            code, _ = api(TOKEN1, "PUT", f"/repos/{OWNER}/{REPO}/contents/{path}",
                          {"message": msg, "content": b64, "branch": branch})
            code, data = api(TOKEN1, "POST", f"/repos/{OWNER}/{REPO}/pulls",
                             {"title": msg, "head": branch, "base": BASE,
                              "body": "Own PR merged without review. YOLO! 🎲"})
            pr_num = data["number"]
            print(f"  + PR #{pr_num} opened by faisukhan01")
            time.sleep(2)
            # Merge WITHOUT review (no review requested, no review submitted)
            for attempt in range(8):
                code, data = api(TOKEN1, "PUT", f"/repos/{OWNER}/{REPO}/pulls/{pr_num}/merge",
                                 {"commit_title": f"Merge pull request #{pr_num}: {msg}",
                                  "merge_method": "merge"})
                if code == 200:
                    print(f"  + PR #{pr_num} merged by faisukhan01 (OWN PR, NO REVIEW) -> YOLO")
                    merged += 1
                    break
                time.sleep(3)
            api(TOKEN1, "DELETE", f"/repos/{OWNER}/{REPO}/git/refs/heads/{branch}")
        except Exception as e:
            print(f"  !! ERROR: {e}")
            try:
                api(TOKEN1, "DELETE", f"/repos/{OWNER}/{REPO}/git/refs/heads/{branch}")
            except Exception:
                pass
    print(f"\nYOLO (fixed): {merged}/{len(files)} own PRs merged without review")
    return merged


# ============================================================
# FIX 3: GALAXY BRAIN — more accepted answers for safety
# ============================================================
def galaxy_brain_more():
    print("\n" + "=" * 60)
    print("GALAXY BRAIN (more) — additional cross-user accepted answers")
    print("=" * 60)
    q = """
    query($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) {
        id
        discussionCategories(first: 20) { nodes { id name isAnswerable } }
      }
    }"""
    code, data = gql(TOKEN2, q, {"owner": OWNER, "name": REPO})
    repo_id = data["data"]["repository"]["id"]
    qa = [c for c in data["data"]["repository"]["discussionCategories"]["nodes"]
          if c["isAnswerable"]][0]
    cat_id = qa["id"]

    qa_pairs = [
        ("How do I build the APK for release?",
         "What's the command to build a release APK?",
         "Run `flutter build apk --release --target-platform android-arm64` in "
         "the `mobile-app/` directory. The APK will be at "
         "`build/app/outputs/flutter-apk/app-release.apk`. See `docs/DEPLOYMENT.md`."),
        ("What's the difference between admin and super-admin roles?",
         "When should I use super-admin vs admin?",
         "Super-admin is the product owner with college-wide oversight including "
         "configuration. Admin handles day-to-day operations, staff, and "
         "announcements. See `docs/PORTALS.md` for the full role matrix."),
        ("How do I configure push notifications?",
         "Can the app receive push notifications?",
         "Not currently. The roadmap includes FCM integration. For now, "
         "announcements are fetched on app open + pull-to-refresh. See `docs/FAQ.md`."),
    ]
    accepted = 0
    for i, (title, q_body, a_body) in enumerate(qa_pairs, 1):
        print(f"\n[{i}/{len(qa_pairs)}] {title}")
        try:
            m = """
            mutation($input: CreateDiscussionInput!) {
              createDiscussion(input: $input) { discussion { id number } }
            }"""
            code, data = gql(TOKEN2, m, {"input": {
                "repositoryId": repo_id, "categoryId": cat_id,
                "title": title, "body": q_body}})
            did = data["data"]["createDiscussion"]["discussion"]["id"]
            dnum = data["data"]["createDiscussion"]["discussion"]["number"]
            print(f"  + discussion #{dnum} by faisalkhan544814")
            time.sleep(1)
            m2 = """
            mutation($input: AddDiscussionCommentInput!) {
              addDiscussionComment(input: $input) { comment { id } }
            }"""
            code, data = gql(TOKEN1, m2, {"input": {"discussionId": did, "body": a_body}})
            cid = data["data"]["addDiscussionComment"]["comment"]["id"]
            print(f"  + answer by faisukhan01")
            time.sleep(1)
            m3 = """
            mutation($input: MarkDiscussionCommentAsAnswerInput!) {
              markDiscussionCommentAsAnswer(input: $input) { discussion { id } }
            }"""
            code, data = gql(TOKEN1, m3, {"input": {"id": cid}})
            print(f"  + marked as accepted")
            accepted += 1
        except Exception as e:
            print(f"  !! ERROR: {e}")
    print(f"\nGalaxy Brain (more): {accepted}/{len(qa_pairs)} accepted answers")
    return accepted


def main():
    pe = pair_extraordinaire_via_pr()
    yo = yolo_own_pr()
    gb = galaxy_brain_more()
    print("\n" + "=" * 60)
    print("SUMMARY (FIXED APPROACH)")
    print("=" * 60)
    print(f"Pair Extraordinaire: {pe} co-authored commits in MERGED PRs (need 1)")
    print(f"YOLO: {yo} OWN PRs merged without review (need 1)")
    print(f"Galaxy Brain: {gb} more accepted answers (total now {7+gb}, need 2)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
