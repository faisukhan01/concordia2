# Deployment

## Web (Vercel)

1. Push to `main` — Vercel auto-deploys.
2. Production URL: https://concordia-colleges.vercel.app

## Mobile (APK)

1. `flutter build apk --release --target-platform android-arm64`
2. Upload `app-release.apk` to GitHub releases as `concordia-college.apk`.
3. Download URL: https://github.com/faisukhan01/concordia2/releases/latest/download/concordia-college.apk

## Environment

Set production env vars in Vercel project settings.
