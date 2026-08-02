#!/usr/bin/env python3
"""FIX: Re-create Pair Extraordinaire commits with VERIFIED emails.

Original attempt used noreply emails which may not be verified on the accounts.
Now using real verified emails:
  faisukhan01:      faisu577277@gmail.com
  faisalkhan544814: faisalkhan544814@gmail.com

Also creates additional YOLO PRs and Galaxy Brain discussions for safety.
"""
import base64
import json
import sys
import time
import urllib.request
import urllib.error

TOKEN1 = open("/home/z/my-project/.gh-token").read().strip()
TOKEN2 = open("/home/z/my-project/.gh-token-2").read().strip()
OWNER = "faisukhan01"
REPO = "concordia2"
BASE = "main"

FAISUKHAN01_NAME = "Faisal Arslan Khan"
FAISUKHAN01_EMAIL = "faisu577277@gmail.com"  # VERIFIED
FAISALKHAN544814_NAME = "faisalkhan544814"
FAISALKHAN544814_EMAIL = "faisalkhan544814@gmail.com"  # VERIFIED

HEADERS1 = {"Authorization": f"token {TOKEN1}", "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28"}
HEADERS2 = {"Authorization": f"token {TOKEN2}", "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28"}


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


# ==================== PAIR EXTRAORDINAIRE (FIXED) ====================
def pair_extraordinaire():
    print("=" * 60)
    print("PAIR EXTRAORDINAIRE (FIXED) — co-authored commits with VERIFIED emails")
    print("=" * 60)
    commits = [
        ("docs/PAIR_PROGRAMMING.md",
         "docs: add pair programming guide\n\n"
         f"Co-Authored-By: {FAISALKHAN544814_NAME} <{FAISALKHAN544814_EMAIL}>",
         "# Pair Programming Guide\n\nThis project uses pair programming for "
         "complex features. Two developers, one workflow.\n\n## Benefits\n"
         "- Fewer bugs\n- Knowledge sharing\n- Faster problem-solving\n"),
        ("docs/COLLAB_WORKFLOW.md",
         "docs: add collaboration workflow\n\n"
         f"Co-Authored-By: {FAISALKHAN544814_NAME} <{FAISALKHAN544814_EMAIL}>",
         "# Collaboration Workflow\n\n1. Fork the repo\n2. Create a feature branch\n"
         "3. Pair-program the change\n4. Open a PR with co-author trailer\n"
         "5. Review and merge\n"),
        ("docs/CO_AUTHOR_DEMO.md",
         "docs: add co-author demonstration\n\n"
         f"Co-Authored-By: {FAISALKHAN544814_NAME} <{FAISALKHAN544814_EMAIL}>",
         "# Co-Author Demo\n\nThis commit demonstrates co-authorship for the "
         "Pair Extraordinaire achievement. Authored by faisukhan01, co-authored "
         "by faisalkhan544814.\n"),
        ("docs/TEAM_CONTRIBUTIONS.md",
         "docs: add team contributions guide\n\n"
         f"Co-Authored-By: {FAISALKHAN544814_NAME} <{FAISALKHAN544814_EMAIL}>",
         "# Team Contributions\n\nThis project welcomes team contributions. "
         "Use the Co-Authored-By trailer when pairing.\n\n"
         "```\nCo-Authored-By: username <email@example.com>\n```\n"),
        ("docs/PAIR_RETROSPECTIVE.md",
         "docs: add pair retrospective notes\n\n"
         f"Co-Authored-By: {FAISALKHAN544814_NAME} <{FAISALKHAN544814_EMAIL}>",
         "# Pair Retrospective\n\nWhat worked well:\n- Driver/navigator swap\n"
         "- Verbal reasoning\n- Immediate code review\n\nWhat to improve:\n"
         "- Longer sessions for deep features\n- Better note-taking\n"),
    ]
    done = 0
    for i, (path, message, content) in enumerate(commits, 1):
        print(f"\n[{i}/{len(commits)}] {path}")
        try:
            # Get current main HEAD
            code, data = api(TOKEN1, "GET", f"/repos/{OWNER}/{REPO}/branches/{BASE}")
            parent_sha = data["commit"]["sha"]
            base_tree = data["commit"]["commit"]["tree"]["sha"]

            # Create tree with new file
            code, data = api(TOKEN1, "POST", f"/repos/{OWNER}/{REPO}/git/trees", {
                "base_tree": base_tree,
                "tree": [{"path": path, "mode": "100644", "type": "blob",
                          "content": content}],
            })
            tree_sha = data["sha"]

            # Create commit with VERIFIED author email + co-author trailer
            now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            code, data = api(TOKEN1, "POST", f"/repos/{OWNER}/{REPO}/git/commits", {
                "message": message,
                "tree": tree_sha,
                "parents": [parent_sha],
                "author": {"name": FAISUKHAN01_NAME, "email": FAISUKHAN01_EMAIL, "date": now},
                "committer": {"name": FAISUKHAN01_NAME, "email": FAISUKHAN01_EMAIL, "date": now},
            })
            commit_sha = data["sha"]
            print(f"  + commit {commit_sha[:10]} (author={FAISUKHAN01_EMAIL}, co-author={FAISALKHAN544814_EMAIL})")

            # Update main ref
            code, data = api(TOKEN1, "PATCH", f"/repos/{OWNER}/{REPO}/git/refs/heads/{BASE}",
                             {"sha": commit_sha, "force": False})
            assert code == 200, f"update_ref failed: {code} {data}"
            print(f"  + pushed to main")
            done += 1
        except Exception as e:
            print(f"  !! ERROR: {e}")
        time.sleep(1)
    print(f"\nPair Extraordinaire: {done}/{len(commits)} co-authored commits created")
    return done


# ==================== YOLO (MORE PRs) ====================
def yolo():
    print("\n" + "=" * 60)
    print("YOLO (ROUND 2) — more PRs merged without review")
    print("=" * 60)
    files = [
        ("docs/YOLO_SHIP_IT.md", "docs: add ship-it philosophy",
         "# Ship It\n\nSometimes you just ship. 🎲\n"),
        ("docs/FAST_ITERATION.md", "docs: add fast iteration notes",
         "# Fast Iteration\n\nFor hotfixes, we merge directly.\n"),
        ("docs/HOTFIX_PROCESS.md", "docs: add hotfix process",
         "# Hotfix Process\n\n1. Identify the issue\n2. Fix fast\n3. Ship\n"),
    ]
    merged = 0
    for i, (path, msg, content) in enumerate(files, 1):
        branch = f"feat/yolo2-{int(time.time())}-{i}"
        print(f"\n[{i}/{len(files)}] {msg}")
        try:
            # 2nd account creates branch + file + PR
            code, data = api(TOKEN2, "GET", f"/repos/{OWNER}/{REPO}/branches/{BASE}")
            sha = data["commit"]["sha"]
            code, _ = api(TOKEN2, "POST", f"/repos/{OWNER}/{REPO}/git/refs",
                          {"ref": f"refs/heads/{branch}", "sha": sha})
            b64 = base64.b64encode(content.encode()).decode()
            code, _ = api(TOKEN2, "PUT", f"/repos/{OWNER}/{REPO}/contents/{path}",
                          {"message": msg, "content": b64, "branch": branch})
            code, data = api(TOKEN2, "POST", f"/repos/{OWNER}/{REPO}/pulls",
                             {"title": msg, "head": branch, "base": BASE, "body": "Ship it. 🎲"})
            pr_num = data["number"]
            print(f"  + PR #{pr_num} by faisalkhan544814")
            time.sleep(2)
            # faisukhan01 merges WITHOUT review
            for attempt in range(8):
                code, data = api(TOKEN1, "PUT", f"/repos/{OWNER}/{REPO}/pulls/{pr_num}/merge",
                                 {"commit_title": f"Merge pull request #{pr_num}: {msg}",
                                  "merge_method": "merge"})
                if code == 200:
                    print(f"  + merged by faisukhan01 (NO REVIEW)")
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
    print(f"\nYOLO round 2: {merged}/{len(files)} PRs merged without review")
    return merged


# ==================== GALAXY BRAIN (MORE Q&A) ====================
def galaxy_brain():
    print("\n" + "=" * 60)
    print("GALAXY BRAIN (ROUND 2) — more cross-user accepted answers")
    print("=" * 60)
    # Get repo + Q&A category
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
    print(f"  Q&A category: {qa['name']}")

    qa_pairs = [
        ("How do I run the Flutter app in debug mode?",
         "What's the command to run the app locally?",
         "Run `flutter run` in the `mobile-app/` directory. Make sure a device "
         "or emulator is connected. For hot reload, press `r`. See "
         "`docs/INSTALLATION.md` for full setup."),
        ("Can I customize the brand colors?",
         "I want to re-skin the app for a different college.",
         "Yes. All brand colors are centralized in `lib/app/theme/app_colors.dart`. "
         "Change `primaryOrange` and `creamBackground` to your brand. The "
         "`primaryGradient` updates automatically. See `docs/BRANDING.md`."),
        ("How do I add a new screen to the mobile app?",
         "What's the pattern for adding a new screen?",
         "1. Create the screen widget in `lib/features/<feature>/`.\n"
         "2. Add a route in `app.dart`'s GoRouter config.\n"
         "3. Add a guard if it's role-restricted.\n"
         "See `docs/SCREENS.md` for the full inventory."),
    ]
    accepted = 0
    for i, (title, q_body, a_body) in enumerate(qa_pairs, 1):
        print(f"\n[{i}/{len(qa_pairs)}] {title}")
        try:
            # 2nd account asks
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
            # faisukhan01 answers
            m2 = """
            mutation($input: AddDiscussionCommentInput!) {
              addDiscussionComment(input: $input) { comment { id } }
            }"""
            code, data = gql(TOKEN1, m2, {"input": {"discussionId": did, "body": a_body}})
            cid = data["data"]["addDiscussionComment"]["comment"]["id"]
            print(f"  + answer by faisukhan01")
            time.sleep(1)
            # mark as accepted
            m3 = """
            mutation($input: MarkDiscussionCommentAsAnswerInput!) {
              markDiscussionCommentAsAnswer(input: $input) { discussion { id } }
            }"""
            code, data = gql(TOKEN1, m3, {"input": {"id": cid}})
            print(f"  + marked as accepted")
            accepted += 1
        except Exception as e:
            print(f"  !! ERROR: {e}")
    print(f"\nGalaxy Brain round 2: {accepted}/{len(qa_pairs)} accepted answers")
    return accepted


def main():
    pe = pair_extraordinaire()
    yo = yolo()
    gb = galaxy_brain()
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Pair Extraordinaire (fixed): {pe} co-authored commits with verified emails")
    print(f"YOLO (round 2): {yo} more PRs merged without review")
    print(f"Galaxy Brain (round 2): {gb} more cross-user accepted answers")
    print("\nNOTE: Achievement badges may take 30+ min to display.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
