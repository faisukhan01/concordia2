# Auth Flow

## Sign In

1. User submits credentials.
2. API validates and returns a bearer token + user profile.
3. `AuthProvider` stores user, persists token via `AuthStorage`.
4. GoRouter `refreshListenable` redirects to role shell.

## Sign Out

1. `logout()` clears `_user`, notifies listeners (instant redirect).
2. `AuthStorage.clear()` wipes persisted token.
3. Backend `/logout` called fire-and-forget.

## Guards

`redirect()` checks `auth.user` + role; routes to `/login` if unauthenticated or wrong role.
