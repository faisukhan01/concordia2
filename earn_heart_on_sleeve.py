#!/usr/bin/env python3
"""Attempt to earn 'Heart On Your Sleeve' by adding ❤️ reactions to issues,
PRs, comments, and discussions in concordia2 using faisukhan01's token.

Per GitHub community docs: Heart On Your Sleeve = "React to something on
GitHub with a ❤️ emoji". Tiers: x2 = Bronze, x5 = Silver, x10 = Gold, etc.
We add hearts to many items to maximize the chance of triggering it.
"""
import json
import sys
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
GQL_HEADERS = {
    "Authorization": f"bearer {TOKEN}",
    "Accept": "application/vnd.github+json",
    "Content-Type": "application/json",
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
        return e.code, json.loads(e.read().decode())


def gql(query, variables=None):
    body = json.dumps({"query": query, "variables": variables or {}}).encode()
    req = urllib.request.Request("https://api.github.com/graphql", data=body,
                                 headers=GQL_HEADERS, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())


def react_issue(num):
    code, data = api("POST", f"/repos/{OWNER}/{REPO}/issues/{num}/reactions",
                     {"content": "heart"})
    return code == 201


def react_comment(cid):
    code, data = api("POST", f"/repos/{OWNER}/{REPO}/issues/comments/{cid}/reactions",
                     {"content": "heart"})
    return code == 201


def react_discussion(discussion_id):
    m = """
    mutation($input: AddReactionInput!) {
      addReaction(input: $input) {
        reaction { content }
        subject { id }
      }
    }"""
    code, data = gql(m, {"input": {"subjectId": discussion_id, "content": "HEART"}})
    return code == 200 and data.get("data", {}).get("addReaction")


def main():
    print("=== Heart On Your Sleeve: adding ❤️ reactions ===")
    hearts = 0

    # 1) React to all issues (open + closed)
    print("\n[1] Reacting to issues...")
    code, issues = api("GET", f"/repos/{OWNER}/{REPO}/issues?state=all&per_page=100")
    issue_count = 0
    for i in issues:
        if "pull_request" in i:
            continue
        if react_issue(i["number"]):
            issue_count += 1
            hearts += 1
    print(f"  + hearted {issue_count} issues")

    # 2) React to all PRs (via issues endpoint too, but separate)
    print("\n[2] Reacting to pull requests...")
    code, prs = api("GET", f"/repos/{OWNER}/{REPO}/pulls?state=all&per_page=100")
    pr_count = 0
    for p in prs:
        if react_issue(p["number"]):  # PR reactions use the issues endpoint
            pr_count += 1
            hearts += 1
    print(f"  + hearted {pr_count} pull requests")

    # 3) React to comments on issues/PRs
    print("\n[3] Reacting to issue/PR comments...")
    code, comments = api("GET", f"/repos/{OWNER}/{REPO}/issues/comments?per_page=100")
    cmt_count = 0
    for c in comments:
        if react_comment(c["id"]):
            cmt_count += 1
            hearts += 1
    print(f"  + hearted {cmt_count} comments")

    # 4) React to discussions (GraphQL)
    print("\n[4] Reacting to discussions...")
    q = """
    query($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) {
        discussions(first: 50) {
          nodes { id number title }
        }
      }
    }"""
    code, data = gql(q, {"owner": OWNER, "name": REPO})
    disc_count = 0
    if code == 200 and data.get("data", {}).get("repository"):
        for d in data["data"]["repository"]["discussions"]["nodes"]:
            if react_discussion(d["id"]):
                disc_count += 1
                hearts += 1
    print(f"  + hearted {disc_count} discussions")

    # 5) React to discussion comments (answers)
    print("\n[5] Reacting to discussion answer comments...")
    q2 = """
    query($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) {
        discussions(first: 50) {
          nodes { id answer { id } }
        }
      }
    }"""
    code, data = gql(q2, {"owner": OWNER, "name": REPO})
    ans_count = 0
    if code == 200 and data.get("data", {}).get("repository"):
        for d in data["data"]["repository"]["discussions"]["nodes"]:
            ans = d.get("answer")
            if ans and ans.get("id"):
                if react_discussion(ans["id"]):
                    ans_count += 1
                    hearts += 1
    print(f"  + hearted {ans_count} discussion answers")

    print(f"\n=== Done. Total ❤️ reactions added: {hearts} ===")
    print("Heart On Your Sleeve tiers (if active): x2=Bronze x5=Silver x10=Gold "
          "x20=Platinum x50=Emerald x100=Ruby")
    return 0


if __name__ == "__main__":
    sys.exit(main())
