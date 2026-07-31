# State Management

## Mobile (Flutter)

- **AuthProvider** — session, user, role. `ChangeNotifier`.
- **NavProvider** — current shell tab index. `ChangeNotifier`. Any descendant calls `setIndex(i)`.
- **GoRouter** — declarative routing, auth-aware.

## Web (Next.js)

- **Zustand** — client UI state.
- **TanStack Query** — server state + caching.
