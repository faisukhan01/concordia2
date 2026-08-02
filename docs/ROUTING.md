# Routing

## Web

Next.js App Router. Route groups per portal. Middleware enforces RBAC.

## Mobile

GoRouter with a single `ShellRoute` that renders `RoleShell` (bottom nav + body). Child routes per portal. `redirect()` handles auth + role guards.

```dart
GoRouter(
  refreshListenable: auth,
  redirect: (ctx, state) { ... },
  routes: [ShellRoute(builder: (_, __, child) => RoleShell(child: child), ...)],
)
```
