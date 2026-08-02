#!/usr/bin/env python3
"""Earn the Pull Shark achievement by creating & merging PRs via the GitHub API.

Creates meaningful documentation files for the Concordia College app, opens a PR
for each, and merges it. Each merged PR (authored by faisukhan01) counts toward
the Pull Shark achievement tiers:
  1 PR = Bronze, 2 = Silver, 4 = Gold, 8 = Platinum, 16 = Emerald, 32 = Ruby
We aim for 8 merged PRs = Platinum.
"""
import base64
import json
import sys
import time
import urllib.request
import urllib.error

TOKEN = open("/home/z/my-project/.gh-token").read().strip()
OWNER = "faisukhan01"
REPO = "concordia2"
BASE = "main"

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


# Meaningful docs to add — keeps the repo clean & contributions legit
DOCS = [
    ("docs/USERGuide.md", "User Guide",
     "# Concordia College App - User Guide\n\n"
     "A quick guide for students, staff, and administrators using the Concordia "
     "College mobile app.\n\n## Roles\n\n- **Student** - view attendance, "
     "results, timetable, fees.\n- **Accountant** - manage fee records and invoices.\n"
     "- **Admissions Officer** - manage student admissions.\n"
     "- **Academic Staff** - manage attendance and results.\n"
     "- **Admin** - full access to all portals.\n\n## Getting Started\n\n"
     "1. Download the APK from the releases page.\n"
     "2. Sign in with your college-issued credentials.\n"
     "3. Use the bottom navigation to switch between modules.\n"),
    ("docs/INSTALLATION.md", "Installation",
     "# Installation\n\n## Prerequisites\n\n- Flutter SDK 3.27.0+\n"
     "- Android SDK (build-tools 34.0.0, platform 35)\n- JDK 21\n\n"
     "## Steps\n\n1. Clone the repository.\n"
     "2. Run `flutter pub get` inside `mobile-app/`.\n"
     "3. Connect a device or start an emulator.\n"
     "4. Run `flutter run` for debug, or `flutter build apk` for release.\n\n"
     "## Build Configuration\n\nGradle is tuned for low-memory environments "
     "(`-Xmx1536m`, `workers.max=2`). Adjust in `android/gradle.properties` if "
     "you have more resources.\n"),
    ("docs/ARCHITECTURE.md", "Architecture Overview",
     "# Architecture\n\nThe Concordia College app follows a feature-first "
     "structure:\n\n```\nlib/\n  features/\n    auth/        # login, logout, session\n"
     "    shared/      # shell, drawer, nav provider\n    admin/       # admin portal\n"
     "    admissions/  # admissions portal\n    accountant/  # accountant portal\n"
     "    academic/    # academic portal\n  widgets/      # reusable UI\n  app.dart\n"
     "  main.dart\n```\n\n## State Management\n\n- **Provider** for auth and "
     "navigation (ChangeNotifier).\n- **GoRouter** for declarative routing.\n\n"
     "## Navigation\n\nA `NavProvider` lets any descendant widget switch shell "
     "tabs without prop drilling.\n"),
    ("docs/RELEASE_NOTES.md", "Release Notes",
     "# Release Notes\n\n## v1.1.0\n\n- Redesigned SubTabBar with gradient "
     "segmented control.\n- SubTabBar is now role-conditional (admins only).\n"
     "- Drawer cleanup: replaced dead links with functional actions.\n"
     "- Renamed 'Download App' to 'Update App'.\n"
     "- Fixed sign-in refresh flash (GoRouter created once).\n"
     "- Sign out is now instant.\n"),
    ("docs/CONTRIBUTING.md", "Contributing",
     "# Contributing\n\nThanks for your interest in improving the Concordia "
     "College app!\n\n## Workflow\n\n1. Fork the repository.\n"
     "2. Create a feature branch: `git checkout -b feat/my-feature`.\n"
     "3. Commit with clear messages.\n"
     "4. Open a pull request describing your change.\n\n"
     "## Code Style\n\n- Follow effective Dart conventions.\n"
     "- Use `flutter analyze` before submitting.\n"
     "- Keep PRs focused and small.\n"),
    ("docs/TROUBLESHOOTING.md", "Troubleshooting",
     "# Troubleshooting\n\n## Build runs out of memory\n\n"
     "Reduce Gradle heap in `android/gradle.properties`:\n"
     "`org.gradle.jvmargs=-Xmx1536m`.\n\n## Flutter version not detected\n\n"
     "The Flutter SDK needs a git repo. Run `git init` in the SDK folder, then "
     "`git tag 3.27.0`.\n\n## Sign out is slow\n\n"
     "Ensure `logout()` clears local state and notifies listeners *before* "
     "calling the backend API.\n"),
    ("docs/BRANDING.md", "Brand Guidelines",
     "# Concordia College Brand Guidelines\n\n## Colors\n\n"
     "- Primary Orange: `#F26522`\n"
     "- Cream Background: `#FFF6EE`\n\n## Typography\n\n"
     "Use a clean sans-serif at comfortable reading sizes. Maintain a clear "
     "hierarchy across headings and body.\n\n## Components\n\n"
     "Prefer rounded cards, soft shadows, and consistent spacing (multiples of 4).\n"),
    ("docs/SECURITY.md", "Security Policy",
     "# Security Policy\n\n## Reporting a Vulnerability\n\n"
     "If you discover a security issue, please do NOT open a public issue.\n"
     "Instead, report it privately to the maintainers.\n\n"
     "## Supported Versions\n\nOnly the latest release receives security "
     "updates.\n\n## Best Practices\n\n- Never commit tokens or secrets.\n"
     "- Use environment variables for configuration.\n"
     "- Review dependency permissions before adding packages.\n"),
]


def get_main_sha():
    code, data = api("GET", f"/repos/{OWNER}/{REPO}/branches/{BASE}")
    assert code == 200, f"get_main_sha failed: {code} {data}"
    return data["commit"]["sha"]


def create_branch(name, sha):
    body = {"ref": f"refs/heads/{name}", "sha": sha}
    code, data = api("POST", f"/repos/{OWNER}/{REPO}/git/refs", body)
    assert code in (200, 201), f"create_branch failed: {code} {data}"
    print(f"  + branch {name} @ {sha[:7]}")


def create_file(branch, path, message, content):
    b64 = base64.b64encode(content.encode()).decode()
    body = {"message": message, "content": b64, "branch": branch}
    code, data = api("PUT", f"/repos/{OWNER}/{REPO}/contents/{path}", body)
    assert code in (200, 201), f"create_file failed: {code} {data}"
    print(f"  + file {path} on {branch}")


def open_pr(head, title, body):
    payload = {"title": title, "head": head, "base": BASE, "body": body}
    code, data = api("POST", f"/repos/{OWNER}/{REPO}/pulls", payload)
    assert code == 201, f"open_pr failed: {code} {data}"
    print(f"  + PR #{data['number']} '{title}'")
    return data["number"], data["head"]["sha"]


def merge_pr(number, title):
    payload = {"commit_title": f"Merge pull request #{number}: {title}",
               "merge_method": "merge"}
    # Retry merge until status checks / branch updates settle
    for attempt in range(8):
        code, data = api("PUT", f"/repos/{OWNER}/{REPO}/pulls/{number}/merge", payload)
        if code == 200:
            print(f"  + merged PR #{number}")
            return True
        print(f"  ! merge attempt {attempt+1} status {code}: "
              f"{data.get('message') if isinstance(data, dict) else data}")
        time.sleep(3)
    raise RuntimeError(f"merge_pr failed for #{number}: {code} {data}")


def delete_branch(name):
    code, data = api("DELETE", f"/repos/{OWNER}/{REPO}/git/refs/heads/{name}")
    if code == 204:
        print(f"  + deleted branch {name}")
    else:
        print(f"  ! delete branch {name}: {code} {data}")


def main():
    print(f"=== Pull Shark: creating & merging {len(DOCS)} PRs ===")
    merged = 0
    for i, (path, label, content) in enumerate(DOCS, 1):
        branch = f"docs/{label.lower().replace(' ', '-')}-{int(time.time())}-{i}"
        title = f"docs: add {label}"
        print(f"\n[{i}/{len(DOCS)}] {title}")
        try:
            sha = get_main_sha()
            create_branch(branch, sha)
            create_file(branch, path, title, content)
            pr_num, _ = open_pr(branch, title,
                                f"Adds `{path}` to improve project documentation.")
            # brief pause so GitHub registers the commit on the PR
            time.sleep(2)
            merge_pr(pr_num, label)
            delete_branch(branch)
            merged += 1
        except Exception as e:
            print(f"  !! ERROR on {label}: {e}")
            try:
                delete_branch(branch)
            except Exception:
                pass
    print(f"\n=== Done. Merged {merged}/{len(DOCS)} PRs ===")
    print("Pull Shark tiers: 1=Bronze 2=Silver 4=Gold 8=Platinum 16=Emerald 32=Ruby")
    return 0 if merged == len(DOCS) else 1


if __name__ == "__main__":
    sys.exit(main())
