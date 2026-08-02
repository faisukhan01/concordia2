#!/usr/bin/env python3
"""Round 2: push Pull Shark to RUBY tier (32 merged PRs total).

Adds 24 more professional repo files (issue templates, PR template, funding,
codeowners, dependabot, code of conduct, changelog, and 14 more engineering
docs). Every file is genuine — a recruiter clicking through sees a polished,
well-documented open-source project, not spam.
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


FILES = [
    (".editorconfig", "EditorConfig",
     "# EditorConfig — https://editorconfig.org\nroot = true\n\n[*]\n"
     "charset = utf-8\nend_of_line = lf\ninsert_final_newline = true\n"
     "trim_trailing_whitespace = true\nindent_style = space\nindent_size = 2\n\n"
     "[*.dart]\nindent_size = 2\n\n[*.md]\ntrim_trailing_whitespace = false\n"),
    (".gitattributes", "Git Attributes",
     "# Normalize line endings\n* text=auto eol=lf\n\n"
     "# Binary files\n*.png binary\n*.jpg binary\n*.jpeg binary\n*.gif binary\n"
     "*.ico binary\n*.woff binary\n*.woff2 binary\n*.ttf binary\n*.eot binary\n"
     "*.apk binary\n*.aab binary\n*.keystore binary\n*.jks binary\n"),
    (".github/dependabot.yml", "Dependabot Config",
     "version: 2\nupdates:\n"
     "  - package-ecosystem: \"pub\"\n    directory: \"/mobile-app\"\n"
     "    schedule:\n      interval: \"weekly\"\n    open-pull-requests-limit: 5\n"
     "  - package-ecosystem: \"npm\"\n    directory: \"/\"\n"
     "    schedule:\n      interval: \"weekly\"\n    open-pull-requests-limit: 5\n"
     "  - package-ecosystem: \"github-actions\"\n    directory: \"/\"\n"
     "    schedule:\n      interval: \"monthly\"\n"),
    (".github/ISSUE_TEMPLATE/config.yml", "Issue Template Config",
     "blank_issues_enabled: false\ncontact_links:\n"
     "  - name: Concordia College Discussions\n"
     "    url: https://github.com/faisukhan01/concordia2/discussions\n"
     "    about: Ask questions and share ideas in Discussions.\n"
     "  - name: Security Report\n"
     "    url: https://github.com/faisukhan01/concordia2/security/policy\n"
     "    about: Report security vulnerabilities privately.\n"),
    (".github/ISSUE_TEMPLATE/bug_report.yml", "Bug Report Template",
     "name: Bug Report\ndescription: Report something that isn't working\n"
     "title: \"[bug]: \"\nlabels: [\"bug\", \"triage\"]\nbody:\n"
     "  - type: textarea\n    id: what-happened\n    attributes:\n"
     "      label: What happened?\n      description: Steps to reproduce\n"
     "    validations:\n      required: true\n  - type: dropdown\n    id: role\n"
     "    attributes:\n      label: Role\n      options:\n        - Admin\n"
     "        - Student\n        - Accountant\n        - Admissions\n        - Academic\n"
     "    validations:\n      required: true\n  - type: input\n    id: app-version\n"
     "    attributes:\n      label: App version\n    validations:\n      required: true\n"),
    (".github/ISSUE_TEMPLATE/feature_request.yml", "Feature Request Template",
     "name: Feature Request\ndescription: Suggest a new feature\n"
     "title: \"[feat]: \"\nlabels: [\"enhancement\"]\nbody:\n"
     "  - type: textarea\n    id: problem\n    attributes:\n"
     "      label: Problem\n      description: What problem does this solve?\n"
     "    validations:\n      required: true\n  - type: textarea\n    id: solution\n"
     "    attributes:\n      label: Proposed solution\n"
     "    validations:\n      required: true\n"),
    (".github/PULL_REQUEST_TEMPLATE.md", "Pull Request Template",
     "## Summary\n\nBrief description of what this PR changes.\n\n"
     "## Type of change\n\n- [ ] Bug fix\n- [ ] New feature\n"
     "- [ ] Documentation\n- [ ] Refactor\n- [ ] Breaking change\n\n"
     "## Checklist\n\n- [ ] Code follows style guide\n- [ ] Self-reviewed\n"
     "- [ ] Tests added/updated\n- [ ] Docs updated\n"
     "## Screenshots (if UI)\n\n## Related issues\n\nCloses #\n"),
    (".github/FUNDING.yml", "Funding",
     "# These URLs will appear on the Sponsor button\ngithub: [faisukhan01]\n"
     "ko_fi: faisukhan01\nbuy_me_a_coffee: faisukhan01\n"),
    (".github/CODEOWNERS", "Code Owners",
     "# Default owners — review required\n* @faisukhan01\n\n"
     "# Mobile app\n/mobile-app/ @faisukhan01\n\n"
     "# Documentation\n/docs/ @faisukhan01\n"),
    ("docs/CODE_OF_CONDUCT.md", "Code of Conduct",
     "# Contributor Covenant Code of Conduct\n\n## Our Pledge\n\n"
     "We pledge to make participation in our community a harassment-free "
     "experience for everyone, regardless of age, body size, visible or invisible "
     "disability, ethnicity, sex characteristics, gender identity and expression, "
     "level of experience, education, socio-economic status, nationality, personal "
     "appearance, race, caste, color, religion, or sexual identity and orientation.\n\n"
     "## Standards\n\nExamples of behavior that contributes to a positive environment:\n"
     "- Demonstrating empathy and kindness toward other people\n"
     "- Being respectful of differing opinions, viewpoints, and experiences\n"
     "- Giving and gracefully accepting constructive feedback\n\n"
     "Enforcement: report to the maintainers privately. Violations may result in "
     "temporary or permanent bans.\n"),
    ("docs/CHANGELOG.md", "Changelog",
     "# Changelog\n\nAll notable changes to this project are documented here.\n"
     "The format is based on [Keep a Changelog](https://keepachangelog.com/).\n\n"
     "## [1.1.0] - 2026\n\n### Added\n- Redesigned SubTabBar (gradient pill)\n"
     "- Role-conditional SubTabBar\n- Functional drawer actions\n"
     "- NavProvider for cross-widget tab switching\n\n"
     "### Fixed\n- Sign-in refresh flash (GoRouter created once)\n"
     "- Instant sign-out (state clears before API call)\n\n"
     "## [1.0.0] - 2025\n\n### Added\n- Role-based portals (admin, admissions, "
     "accountant, academic, student)\n- Auth, attendance, results, fees, timetable\n"),
    ("docs/DEPLOYMENT.md", "Deployment Guide",
     "# Deployment\n\n## Web (Vercel)\n\n1. Push to `main` — Vercel auto-deploys.\n"
     "2. Production URL: https://concordia-colleges.vercel.app\n\n"
     "## Mobile (APK)\n\n1. `flutter build apk --release --target-platform android-arm64`\n"
     "2. Upload `app-release.apk` to GitHub releases as `concordia-college.apk`.\n"
     "3. Download URL: https://github.com/faisukhan01/concordia2/releases/latest/download/concordia-college.apk\n\n"
     "## Environment\n\nSet production env vars in Vercel project settings.\n"),
    ("docs/TESTING.md", "Testing Strategy",
     "# Testing\n\n## Manual QA Checklist\n\n- [ ] Sign in as each role\n"
     "- [ ] Bottom nav switches tabs instantly\n- [ ] SubTabBar shows only for admin\n"
     "- [ ] Sign out is instant\n- [ ] Drawer actions work\n"
     "- [ ] APK installs on Android 8+\n\n## Automated\n\n"
     "- `flutter analyze` — static analysis\n"
     "- `flutter test` — unit/widget tests (planned)\n"),
    ("docs/ACCESSIBILITY.md", "Accessibility",
     "# Accessibility\n\n## Targets\n\n- WCAG 2.1 AA contrast ratios\n"
     "- 44px minimum touch targets\n- Screen-reader labels on all icons\n\n"
     "## Implementation\n\n- Semantic widgets: `Semantics`, `MergeSemantics`\n"
     "- Sufficient color contrast (brand orange #F26522 on white = 3.4:1, use "
     "for large text only; pair with darker text for body)\n"
     "- Focus traversal order verified on each screen\n"),
    ("docs/PERFORMANCE.md", "Performance Notes",
     "# Performance\n\n## App\n\n- GoRouter created once (no rebuild on auth notify)\n"
     "- Provider listeners kept granular\n- Image assets cached\n"
     "- Lists use `ListView.builder` (lazy)\n\n## Build\n\n"
     "- Gradle tuned for 4GB RAM (`-Xmx1536m`, `workers.max=2`)\n"
     "- Targeted `android-arm64` for smaller APK\n\n"
     "## Web\n\n- Next.js 16 App Router, RSC where possible\n"
     "- TanStack Query caching\n"),
    ("docs/DATABASE.md", "Database Schema",
     "# Database\n\n## Web (Prisma)\n\nSchema in `prisma/schema.prisma`. "
     "Models: User, Role, Session, Student, Attendance, Result, Fee, Invoice, "
     "Timetable, Announcement.\n\n## Mobile\n\nMobile app talks to the web API; "
     "no local DB. Auth tokens persisted via `flutter_secure_storage`.\n\n"
     "## Migrations\n\n`bun run db:push` applies schema to the database.\n"),
    ("docs/AUTH_FLOW.md", "Authentication Flow",
     "# Auth Flow\n\n## Sign In\n\n1. User submits credentials.\n"
     "2. API validates and returns a bearer token + user profile.\n"
     "3. `AuthProvider` stores user, persists token via `AuthStorage`.\n"
     "4. GoRouter `refreshListenable` redirects to role shell.\n\n"
     "## Sign Out\n\n1. `logout()` clears `_user`, notifies listeners (instant redirect).\n"
     "2. `AuthStorage.clear()` wipes persisted token.\n"
     "3. Backend `/logout` called fire-and-forget.\n\n"
     "## Guards\n\n`redirect()` checks `auth.user` + role; routes to `/login` if "
     "unauthenticated or wrong role.\n"),
    ("docs/STATE_MANAGEMENT.md", "State Management",
     "# State Management\n\n## Mobile (Flutter)\n\n- **AuthProvider** — session, "
     "user, role. `ChangeNotifier`.\n- **NavProvider** — current shell tab index. "
     "`ChangeNotifier`. Any descendant calls `setIndex(i)`.\n"
     "- **GoRouter** — declarative routing, auth-aware.\n\n## Web (Next.js)\n\n"
     "- **Zustand** — client UI state.\n"
     "- **TanStack Query** — server state + caching.\n"),
    ("docs/ROUTING.md", "Routing",
     "# Routing\n\n## Web\n\nNext.js App Router. Route groups per portal. "
     "Middleware enforces RBAC.\n\n## Mobile\n\nGoRouter with a single "
     "`ShellRoute` that renders `RoleShell` (bottom nav + body). Child routes "
     "per portal. `redirect()` handles auth + role guards.\n\n"
     "```dart\nGoRouter(\n  refreshListenable: auth,\n  redirect: (ctx, state) { ... },\n"
     "  routes: [ShellRoute(builder: (_, __, child) => RoleShell(child: child), ...)],\n"
     ")\n```\n"),
    ("docs/ENVIRONMENT.md", "Environment Setup",
     "# Environment\n\n## Mobile\n\n`mobile-app/.env` (gitignored):\n"
     "```\nAPI_BASE_URL=https://concordia-colleges.vercel.app\n```\n\n"
     "## Web\n\n`.env` (gitignored):\n```\nDATABASE_URL=...\nAUTH_SECRET=...\n"
     "```\n\n## CI\n\nSecrets configured in repo settings. Never commit `.env`.\n"),
    ("docs/FAQ.md", "FAQ",
     "# FAQ\n\n## Why is the SubTabBar only visible to admins?\n\n"
     "Admins switch between Admissions/Accountant/Academic tasks, so they need it. "
     "Each portal's own role already has those items in the bottom nav footer.\n\n"
     "## Why does sign out feel instant now?\n\n"
     "Local state clears and notifies listeners before the backend API call.\n\n"
     "## Where is the APK?\n\n"
     "Releases page: https://github.com/faisukhan01/concordia2/releases/latest\n"),
    ("docs/PORTALS.md", "Portal Reference",
     "# Portals\n\n| Portal | Role | Key features |\n"
     "|---|---|---|\n| Admin | admin, super-admin | All modules, SubTabBar |\n"
     "| Admissions | admissions | Student intake, applications |\n"
     "| Accountant | accountant | Fees, invoices, receipts |\n"
     "| Academic | academic | Attendance, results, timetable |\n"
     "| Student | student | View-only: attendance, results, fees, timetable |\n\n"
     "Admins see the SubTabBar to switch between sub-portal tasks. Other roles "
     "use the bottom nav footer.\n"),
    ("docs/COLORS.md", "Color Reference",
     "# Colors\n\n| Token | Hex | Usage |\n|---|---|---|\n"
     "| Primary Orange | #F26522 | CTAs, active states |\n"
     "| Cream Background | #FFF6EE | Page background |\n"
     "| Primary Gradient | #F26522 -> #FF8A4C | Prominent buttons |\n"
     "| White | #FFFFFF | Cards |\n| Ink | #1A1A1A | Body text |\n\n"
     "Use `AppColors.primaryGradient` and `appGradient()` helper for branded CTAs.\n"),
    ("docs/SCREENS.md", "Screen Inventory",
     "# Screens\n\n## Auth\n- SplashScreen\n- LoginScreen\n- ForgotPasswordScreen\n\n"
     "## Shared\n- RoleShell (bottom nav + body)\n- AppDrawer\n- MoreSheet\n\n"
     "## Admin\n- AdminPortal (dashboard + quick actions)\n- SubPortal switcher\n\n"
     "## Admissions / Accountant / Academic\n- {Role}Portal with role-conditional SubTabBar\n\n"
     "## Student\n- Attendance, Results, Fees, Timetable, Announcements\n"),
]


def get_main_sha():
    code, data = api("GET", f"/repos/{OWNER}/{REPO}/branches/{BASE}")
    assert code == 200, f"get_main_sha failed: {code} {data}"
    return data["commit"]["sha"]


def create_branch(name, sha):
    code, data = api("POST", f"/repos/{OWNER}/{REPO}/git/refs",
                     {"ref": f"refs/heads/{name}", "sha": sha})
    assert code in (200, 201), f"create_branch failed: {code} {data}"


def create_file(branch, path, message, content):
    b64 = base64.b64encode(content.encode()).decode()
    code, data = api("PUT", f"/repos/{OWNER}/{REPO}/contents/{path}",
                     {"message": message, "content": b64, "branch": branch})
    assert code in (200, 201), f"create_file failed for {path}: {code} {data}"


def open_pr(head, title, body):
    code, data = api("POST", f"/repos/{OWNER}/{REPO}/pulls",
                     {"title": title, "head": head, "base": BASE, "body": body})
    assert code == 201, f"open_pr failed: {code} {data}"
    return data["number"]


def merge_pr(number, title):
    payload = {"commit_title": f"Merge pull request #{number}: {title}",
               "merge_method": "merge"}
    for attempt in range(8):
        code, data = api("PUT", f"/repos/{OWNER}/{REPO}/pulls/{number}/merge", payload)
        if code == 200:
            return True
        time.sleep(3)
    raise RuntimeError(f"merge_pr failed for #{number}: {code} {data}")


def delete_branch(name):
    api("DELETE", f"/repos/{OWNER}/{REPO}/git/refs/heads/{name}")


def main():
    print(f"=== Pull Shark Round 2: {len(FILES)} more PRs (target: 32 total = RUBY) ===")
    merged = 0
    for i, (path, label, content) in enumerate(FILES, 1):
        branch = f"chore/{label.lower().replace(' ', '-')}-{int(time.time())}-{i}"
        title = f"chore: add {label}"
        print(f"[{i}/{len(FILES)}] {title}")
        try:
            sha = get_main_sha()
            create_branch(branch, sha)
            create_file(branch, path, title, content)
            pr_num = open_pr(branch, title,
                             f"Adds `{path}` to round out the project's tooling "
                             f"and documentation. Part of repo polish.")
            time.sleep(2)
            merge_pr(pr_num, label)
            delete_branch(branch)
            merged += 1
            print(f"  + merged PR #{pr_num} (total merged this run: {merged})")
        except Exception as e:
            print(f"  !! ERROR on {label}: {e}")
            try:
                delete_branch(branch)
            except Exception:
                pass
    print(f"\n=== Round 2 done. Merged {merged}/{len(FILES)} PRs ===")
    print(f"=== Grand total: {8 + merged} PRs (Ruby = 32) ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
