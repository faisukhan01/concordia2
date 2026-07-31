# Architecture

The Concordia College app follows a feature-first structure:

```
lib/
  features/
    auth/        # login, logout, session
    shared/      # shell, drawer, nav provider
    admin/       # admin portal
    admissions/  # admissions portal
    accountant/  # accountant portal
    academic/    # academic portal
  widgets/      # reusable UI
  app.dart
  main.dart
```

## State Management

- **Provider** for auth and navigation (ChangeNotifier).
- **GoRouter** for declarative routing.

## Navigation

A `NavProvider` lets any descendant widget switch shell tabs without prop drilling.
