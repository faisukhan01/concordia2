# Installation

## Prerequisites

- Flutter SDK 3.27.0+
- Android SDK (build-tools 34.0.0, platform 35)
- JDK 21

## Steps

1. Clone the repository.
2. Run `flutter pub get` inside `mobile-app/`.
3. Connect a device or start an emulator.
4. Run `flutter run` for debug, or `flutter build apk` for release.

## Build Configuration

Gradle is tuned for low-memory environments (`-Xmx1536m`, `workers.max=2`). Adjust in `android/gradle.properties` if you have more resources.
