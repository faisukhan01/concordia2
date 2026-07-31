# Performance

## App

- GoRouter created once (no rebuild on auth notify)
- Provider listeners kept granular
- Image assets cached
- Lists use `ListView.builder` (lazy)

## Build

- Gradle tuned for 4GB RAM (`-Xmx1536m`, `workers.max=2`)
- Targeted `android-arm64` for smaller APK

## Web

- Next.js 16 App Router, RSC where possible
- TanStack Query caching
