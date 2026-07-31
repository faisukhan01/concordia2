# Troubleshooting

## Build runs out of memory

Reduce Gradle heap in `android/gradle.properties`:
`org.gradle.jvmargs=-Xmx1536m`.

## Flutter version not detected

The Flutter SDK needs a git repo. Run `git init` in the SDK folder, then `git tag 3.27.0`.

## Sign out is slow

Ensure `logout()` clears local state and notifies listeners *before* calling the backend API.
