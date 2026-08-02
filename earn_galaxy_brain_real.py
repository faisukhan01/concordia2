#!/usr/bin/env python3
"""Galaxy Brain achievement: faisalkhan544814 creates Q&A discussions →
faisukhan01 answers → faisukhan01 (or faisalkhan544814) marks the answer.

Per GitHub: Galaxy Brain requires an accepted answer where the answerer is a
DIFFERENT user than the asker. faisalkhan544814 asks, faisukhan01 answers,
faisukhan01 marks his own answer as accepted (the asker doesn't need to be
the one who accepts — the repo admin can).

Galaxy Brain tiers: 2=Bronze 5=Silver 10=Gold 20=Platinum 50=Emerald 100=Ruby
We do 4 Q&A pairs (2 = Bronze, with margin).
"""
import json
import sys
import time
import urllib.request
import urllib.error

TOKEN1 = open("/home/z/my-project/.gh-token").read().strip()       # faisukhan01 (answers)
TOKEN2 = open("/home/z/my-project/.gh-token-2").read().strip()      # faisalkhan544814 (asks)
OWNER = "faisukhan01"
REPO = "concordia2"
ENDPOINT = "https://api.github.com/graphql"


def gql(token, query, variables=None):
    headers = {
        "Authorization": f"bearer {token}",
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
    }
    body = json.dumps({"query": query, "variables": variables or {}}).encode()
    req = urllib.request.Request(ENDPOINT, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())


def get_repo_and_qa_category(token):
    q = """
    query($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) {
        id
        discussionCategories(first: 20) {
          nodes { id name isAnswerable }
        }
      }
    }"""
    code, data = gql(token, q, {"owner": OWNER, "name": REPO})
    assert code == 200, f"get_repo: {code} {data}"
    repo = data["data"]["repository"]
    qa = [c for c in repo["discussionCategories"]["nodes"] if c["isAnswerable"]]
    assert qa, "No Q&A category found"
    return repo["id"], qa[0]


def create_discussion(token, repo_id, cat_id, title, body):
    m = """
    mutation($input: CreateDiscussionInput!) {
      createDiscussion(input: $input) {
        discussion { id number url }
      }
    }"""
    code, data = gql(token, m, {"input": {
        "repositoryId": repo_id, "categoryId": cat_id,
        "title": title, "body": body,
    }})
    assert code == 200 and data.get("data", {}).get("createDiscussion"), \
        f"create_discussion: {code} {json.dumps(data)}"
    d = data["data"]["createDiscussion"]["discussion"]
    return d["id"], d["number"]


def add_comment(token, discussion_id, body):
    m = """
    mutation($input: AddDiscussionCommentInput!) {
      addDiscussionComment(input: $input) {
        comment { id }
      }
    }"""
    code, data = gql(token, m, {"input": {"discussionId": discussion_id, "body": body}})
    assert code == 200 and data.get("data", {}).get("addDiscussionComment"), \
        f"add_comment: {code} {json.dumps(data)}"
    return data["data"]["addDiscussionComment"]["comment"]["id"]


def mark_answer(token, comment_id):
    m = """
    mutation($input: MarkDiscussionCommentAsAnswerInput!) {
      markDiscussionCommentAsAnswer(input: $input) {
        discussion { id }
      }
    }"""
    code, data = gql(token, m, {"input": {"id": comment_id}})
    assert code == 200 and data.get("data", {}).get("markDiscussionCommentAsAnswer"), \
        f"mark_answer: {code} {json.dumps(data)}"
    return True


QA_PAIRS = [
    ("How do I configure the API base URL in the mobile app?",
     "I want to point the app at a staging server. Where is the API base URL configured?",
     "Set `API_BASE_URL` in `mobile-app/.env` (gitignored). The app reads it at "
     "startup. For production, it defaults to https://concordia-colleges.vercel.app. "
     "See `docs/ENVIRONMENT.md` for the full env reference."),
    ("What's the recommended way to add a new role-based portal?",
     "I need to add a 'Librarian' portal. What files do I touch?",
     "1. Add the role string to the auth enum on the backend.\n"
     "2. Create `lib/features/librarian/librarian_portal.dart`.\n"
     "3. Add a route + role guard case in `app.dart`.\n"
     "4. Add a bottom-nav entry in `role_shell.dart` for that role.\n"
     "See `docs/PORTALS.md` for the full reference."),
    ("Why does my Flutter build fail with an OOM error?",
     "Gradle crashes with 'java.lang.OutOfMemoryError' during release builds.",
     "Reduce Gradle heap in `android/gradle.properties`: set "
     "`org.gradle.jvmargs=-Xmx1536m`, `org.gradle.workers.max=2`, and "
     "`kotlin.daemon.jvmargs=-Xmx768m`. See `docs/PERFORMANCE.md` and "
     "`docs/TROUBLESHOOTING.md` for more."),
    ("How is the bearer token stored on the mobile app?",
     "Where does the auth token live after sign-in? Is it secure?",
     "Tokens are persisted via `flutter_secure_storage` (Keystore on Android, "
     "Keychain on iOS). The `AuthStorage` class wraps it. Never store tokens in "
     "`SharedPreferences` — that's plaintext. See `docs/AUTH_FLOW.md`."),
]


def main():
    print("=== Galaxy Brain: faisalkhan544814 asks, faisukhan01 answers ===")
    repo_id, cat = get_repo_and_qa_category(TOKEN2)
    print(f"  repo: {repo_id}")
    print(f"  Q&A category: {cat['name']} ({cat['id']})")

    accepted = 0
    for i, (title, q, a) in enumerate(QA_PAIRS, 1):
        print(f"\n[{i}/{len(QA_PAIRS)}] {title}")
        try:
            # 2nd account ASKS the question
            did, dnum = create_discussion(TOKEN2, repo_id, cat["id"], title, q)
            print(f"  + discussion #{dnum} asked by faisalkhan544814")
            time.sleep(1)
            # faisukhan01 ANSWERS
            cid = add_comment(TOKEN1, did, a)
            print(f"  + answer posted by faisukhan01")
            time.sleep(1)
            # mark faisukhan01's answer as accepted (repo admin can do this)
            mark_answer(TOKEN1, cid)
            print(f"  + answer marked as accepted")
            accepted += 1
        except Exception as e:
            print(f"  !! ERROR: {e}")

    print(f"\n=== Done. {accepted} accepted cross-user answers ===")
    print("Galaxy Brain tiers: 2=Bronze 5=Silver 10=Gold 20=Platinum 50=Emerald 100=Ruby")
    return 0


if __name__ == "__main__":
    sys.exit(main())
