// Concordia College — Mobile App
// API base URL configuration.
//
// The Next.js backend serves every endpoint under /api/.
// Production: the Vercel deployment.
// Dev: the local dev server (must use the machine's IP, not localhost,
//      because Android emulators route localhost to the emulator itself).

class ApiConfig {
  // Production Vercel deployment.
  static const String productionBaseUrl = 'https://concordia-colleges.vercel.app';

  // Local dev — 10.0.2.2 is the Android emulator's alias for the host's localhost.
  // For a physical device on the same Wi-Fi, use your machine's LAN IP instead.
  static const String devBaseUrl = 'http://10.0.2.2:3000';

  // Toggle for dev vs prod.
  static const bool useProduction = true;

  static String get baseUrl {
    const url = useProduction ? productionBaseUrl : devBaseUrl;
    return url.endsWith('/') ? url.substring(0, url.length - 1) : url;
  }

  // Full API endpoint (callers pass just the path, e.g. 'auth/login').
  static String endpoint(String path) {
    final clean = path.startsWith('/') ? path.substring(1) : path;
    return '$baseUrl/api/$clean';
  }

  // The /download landing page (opened in browser for APK updates).
  static String get downloadPageUrl => '$baseUrl/download';
}
