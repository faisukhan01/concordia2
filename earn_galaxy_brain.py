#!/usr/bin/env python3
"""Earn the Galaxy Brain achievement via GitHub Discussions (GraphQL API).

Galaxy Brain tiers (accepted answers in Discussions):
  2 = Bronze, 5 = Silver, 10 = Gold, 20 = Platinum, 50 = Emerald, 100 = Ruby
We create N Q&A discussions, post an answer comment, and mark it as the answer.
"""
import json
import sys
import time
import urllib.request
import urllib.error

TOKEN = open("/home/z/my-project/.gh-token").read().strip()
OWNER = "faisukhan01"
REPO = "concordia2"
ENDPOINT = "https://api.github.com/graphql"
HEADERS = {
    "Authorization": f"bearer {TOKEN}",
    "Accept": "application/vnd.github+json",
    "Content-Type": "application/json",
}

QA_PAIRS = [
    ("How do I reset my Concordia College app password?",
     "I forgot my password. How can I reset it?",
     "You can reset your password from the sign-in screen: tap **Forgot Password** "
     "and follow the email link. If you don't receive the email, contact the admin. "
     "After resetting, sign in with your new credentials."),
    ("Which roles can access the admin portal?",
     "Can a student access the admin portal?",
     "No. Only users with the `admin` or `super-admin` role can access the admin "
     "portal. Students, accountants, admissions officers, and academic staff each "
     "have their own scoped portal. Admins additionally see the SubTabBar to "
     "switch between sub-portal tasks."),
    ("Where can I download the latest APK?",
     "What's the official download link for the app?",
     "The latest APK is always published on the GitHub releases page and served "
     "from `https://concordia-colleges.vercel.app/download`. Use the **Update App** "
     "option in the app drawer to check for new versions."),
    ("Why is the SubTabBar hidden in my portal?",
     "I don't see the top pill bar that admins see.",
     "The SubTabBar is role-conditional. Admins and super-admins see it so they "
     "can switch between Admissions/Accountant/Academic tasks. Each portal's own "
     "role already has those items in the bottom navigation footer, so the bar is "
     "hidden to avoid redundancy."),
    ("How do I fix slow sign-out?",
     "Sign out takes 4-5 taps and feels slow.",
     "This was fixed in v1.1.0. The `logout()` method now clears local auth "
     "state and notifies listeners immediately, then fires the backend API call "
     "in the background. Update to the latest version from the releases page."),
    ("What are the official brand colors?",
     "What hex codes should I use for Concordia branding?",
     "The official brand colors are: **Primary Orange `#F26522`** and **Cream "
     "Background `#FFF6EE`**. Use the `primaryGradient` for prominent CTAs and "
     "keep cards on white with soft shadows."),
    ("What Flutter SDK version is required?",
     "Which Flutter version should I use to build the app?",
     "The project targets **Flutter 3.27.0**. Older versions may fail on the "
     "GoRouter / Provider APIs used. See `docs/INSTALLATION.md` for full setup."),
    ("How is navigation state managed across tabs?",
     "How does the shell switch tabs from deep widgets?",
     "A `NavProvider` (ChangeNotifier) holds the current shell tab index. Any "
     "descendant widget can call `context.read<NavProvider>().setIndex(i)` to "
     "switch tabs, avoiding callback prop drilling."),
]


def gql(query, variables=None):
    body = json.dumps({"query": query, "variables": variables or {}}).encode()
    req = urllib.request.Request(ENDPOINT, data=body, headers=HEADERS, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())


def get_repo_and_categories():
    q = """
    query($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) {
        id
        discussionCategories(first: 20) {
          nodes { id name slug isAnswerable }
        }
      }
    }"""
    code, data = gql(q, {"owner": OWNER, "name": REPO})
    assert code == 200 and "data" in data, f"get_repo failed: {code} {data}"
    repo = data["data"]["repository"]
    cats = repo["discussionCategories"]["nodes"]
    print(f"  repo node id: {repo['id']}")
    print(f"  {len(cats)} discussion categories:")
    for c in cats:
        print(f"    - {c['name']} (slug={c['slug']}, answerable={c['isAnswerable']})")
    return repo["id"], cats


def create_discussion(repo_id, cat_id, title, body):
    m = """
    mutation($input: CreateDiscussionInput!) {
      createDiscussion(input: $input) {
        discussion { id number url }
      }
    }"""
    variables = {"input": {
        "repositoryId": repo_id, "categoryId": cat_id,
        "title": title, "body": body,
    }}
    code, data = gql(m, variables)
    assert code == 200 and data.get("data", {}).get("createDiscussion"), \
        f"create_discussion failed: {code} {json.dumps(data)}"
    d = data["data"]["createDiscussion"]["discussion"]
    print(f"  + discussion #{d['number']} '{title}'")
    return d["id"]


def add_comment(discussion_id, body):
    m = """
    mutation($input: AddDiscussionCommentInput!) {
      addDiscussionComment(input: $input) {
        comment { id }
      }
    }"""
    variables = {"input": {"discussionId": discussion_id, "body": body}}
    code, data = gql(m, variables)
    assert code == 200 and data.get("data", {}).get("addDiscussionComment"), \
        f"add_comment failed: {code} {json.dumps(data)}"
    cid = data["data"]["addDiscussionComment"]["comment"]["id"]
    print(f"  + answer comment {cid[:18]}...")
    return cid


def mark_answer(comment_id):
    m = """
    mutation($input: MarkDiscussionCommentAsAnswerInput!) {
      markDiscussionCommentAsAnswer(input: $input) {
        discussion { id }
      }
    }"""
    variables = {"input": {"id": comment_id}}
    code, data = gql(m, variables)
    assert code == 200 and data.get("data", {}).get("markDiscussionCommentAsAnswer"), \
        f"mark_answer failed: {code} {json.dumps(data)}"
    print(f"  + marked as answer")


def main():
    print("=== Galaxy Brain: create Q&A discussions + accepted answers ===")
    repo_id, cats = get_repo_and_categories()
    answerable = [c for c in cats if c["isAnswerable"]]
    if not answerable:
        print("  !! No answerable discussion category found.")
        print("     Create a 'Q&A' category in the repo Discussions settings, "
              "then re-run.")
        return 1
    cat_id = answerable[0]["id"]
    print(f"  using category: {answerable[0]['name']}")

    accepted = 0
    for i, (title, q, a) in enumerate(QA_PAIRS, 1):
        print(f"\n[{i}/{len(QA_PAIRS)}] {title}")
        try:
            did = create_discussion(repo_id, cat_id, title, q)
            time.sleep(1)
            cid = add_comment(did, a)
            time.sleep(1)
            mark_answer(cid)
            accepted += 1
        except Exception as e:
            print(f"  !! ERROR: {e}")
    print(f"\n=== Done. Accepted {accepted}/{len(QA_PAIRS)} answers ===")
    print("Galaxy Brain tiers: 2=Bronze 5=Silver 10=Gold 20=Platinum 50=Emerald 100=Ruby")
    return 0 if accepted == len(QA_PAIRS) else 1


if __name__ == "__main__":
    sys.exit(main())
