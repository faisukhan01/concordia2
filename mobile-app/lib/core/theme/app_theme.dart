// Concordia College — App-wide theme.
// Premium, refined design system matching the web portal's brand:
//   • Concordia orange #F26522 on warm off-white #FCFBF9
//   • Soft layered shadows for depth
//   • Generous radii (12–20px) for friendly, modern feel
//   • Inter font family (matches web)
//   • Forced LIGHT theme — never system/dark (the web portal is light-only)

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

// ── Brand color system ─────────────────────────────────────────
class AppColors {
  // Primary brand
  static const Color primary = Color(0xFFF26522);
  static const Color primaryDark = Color(0xFFD4541E);
  static const Color primaryLight = Color(0xFFFF8C42);
  static const Color primarySoft = Color(0xFFFFE8D9); // very light orange tint

  // Surfaces
  static const Color background = Color(0xFFFCFBF9); // warm off-white
  static const Color card = Color(0xFFFFFFFF);
  static const Color sidebar = Color(0xFFFFFFFF);
  static const Color surfaceAlt = Color(0xFFFAF6F2); // subtle warm card alt

  // Text
  static const Color textPrimary = Color(0xFF1A1A1A);
  static const Color textSecondary = Color(0xFF4A5568);
  static const Color textMuted = Color(0xFF9CA3AF);
  static const Color textInverse = Color(0xFFFFFFFF);

  // Accents
  static const Color secondary = Color(0xFFFFF0E8);
  static const Color secondaryText = Color(0xFF6B4423);
  static const Color border = Color(0xFFF0E6DD); // softer warm border
  static const Color borderStrong = Color(0xFFE5D8CC);
  static const Color ring = Color(0xFFF26522);

  // Status
  static const Color success = Color(0xFF16A34A);
  static const Color successSoft = Color(0xFFDCFCE7);
  static const Color warning = Color(0xFFF59E0B);
  static const Color warningSoft = Color(0xFFFEF3C7);
  static const Color danger = Color(0xFFDC2626);
  static const Color dangerSoft = Color(0xFFFEE2E2);
  static const Color info = Color(0xFF0EA5E9);
  static const Color infoSoft = Color(0xFFE0F2FE);
  static const Color purple = Color(0xFF8B5CF6);
  static const Color purpleSoft = Color(0xFFEDE9FE);

  // Chart palette
  static const Color chart1 = Color(0xFFF26522);
  static const Color chart2 = Color(0xFFF8941D);
  static const Color chart3 = Color(0xFFC8102E);
  static const Color chart4 = Color(0xFFFFB347);
  static const Color chart5 = Color(0xFF6B4423);
  static const Color chart6 = Color(0xFF16A34A);

  // Premium gradients (LinearGradient begin=topLeft → end=bottomRight)
  static const List<Color> primaryGradient = [Color(0xFFF26522), Color(0xFFD4541E)];
  static const List<Color> warmGradient = [Color(0xFFFF8C42), Color(0xFFF26522)];
  static const List<Color> successGradient = [Color(0xFF22C55E), Color(0xFF16A34A)];
  static const List<Color> infoGradient = [Color(0xFF38BDF8), Color(0xFF0EA5E9)];
  static const List<Color> warningGradient = [Color(0xFFFBBF24), Color(0xFFF59E0B)];
  static const List<Color> purpleGradient = [Color(0xFFA78BFA), Color(0xFF8B5CF6)];
  static const List<Color> sunsetGradient = [Color(0xFFF8941D), Color(0xFFC8102E)];

  // Dark theme (unused but kept for completeness)
  static const Color darkBackground = Color(0xFF1A1A1A);
  static const Color darkCard = Color(0xFF262626);
  static const Color darkSidebar = Color(0xFF0F0F0F);
}

// ── Shadow presets (soft, layered, premium) ───────────────────
class AppShadows {
  static List<BoxShadow> get card => [
    BoxShadow(
      color: const Color(0xFFF26522).withValues(alpha: 0.06),
      blurRadius: 16,
      offset: const Offset(0, 4),
    ),
    BoxShadow(
      color: Colors.black.withValues(alpha: 0.02),
      blurRadius: 6,
      offset: const Offset(0, 2),
    ),
  ];

  static List<BoxShadow> get cardHover => [
    BoxShadow(
      color: const Color(0xFFF26522).withValues(alpha: 0.12),
      blurRadius: 24,
      offset: const Offset(0, 8),
    ),
    BoxShadow(
      color: Colors.black.withValues(alpha: 0.04),
      blurRadius: 10,
      offset: const Offset(0, 4),
    ),
  ];

  static List<BoxShadow> get floating => [
    BoxShadow(
      color: const Color(0xFFF26522).withValues(alpha: 0.18),
      blurRadius: 32,
      offset: const Offset(0, 12),
      spreadRadius: -4,
    ),
    BoxShadow(
      color: Colors.black.withValues(alpha: 0.06),
      blurRadius: 16,
      offset: const Offset(0, 6),
    ),
  ];

  static List<BoxShadow> get button => [
    BoxShadow(
      color: const Color(0xFFF26522).withValues(alpha: 0.30),
      blurRadius: 14,
      offset: const Offset(0, 6),
    ),
  ];

  static List<BoxShadow> get subtle => [
    BoxShadow(
      color: Colors.black.withValues(alpha: 0.03),
      blurRadius: 8,
      offset: const Offset(0, 2),
    ),
  ];

  static List<BoxShadow> get navBar => [
    BoxShadow(
      color: Colors.black.withValues(alpha: 0.05),
      blurRadius: 18,
      offset: const Offset(0, -2),
    ),
  ];
}

// ── Radius presets ─────────────────────────────────────────────
class AppRadii {
  static const double sm = 10;
  static const double md = 14;
  static const double lg = 18;
  static const double xl = 22;
  static const double pill = 999;
}

class AppTheme {
  static ThemeData get light {
    final base = ThemeData.light(useMaterial3: true);
    return base.copyWith(
      colorScheme: const ColorScheme.light(
        primary: AppColors.primary,
        onPrimary: Colors.white,
        secondary: AppColors.secondary,
        onSecondary: AppColors.secondaryText,
        surface: AppColors.card,
        onSurface: AppColors.textPrimary,
        error: AppColors.danger,
        outline: AppColors.border,
      ),
      scaffoldBackgroundColor: AppColors.background,
      primaryColor: AppColors.primary,
      canvasColor: AppColors.background,
      textTheme: GoogleFonts.interTextTheme(base.textTheme).apply(
        bodyColor: AppColors.textPrimary,
        displayColor: AppColors.textPrimary,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.background,
        foregroundColor: AppColors.textPrimary,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          color: AppColors.textPrimary,
          fontSize: 20,
          fontWeight: FontWeight.w700,
        ),
      ),
      cardTheme: CardTheme(
        color: AppColors.card,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.md),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadii.md),
          ),
          textStyle: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.primary,
          side: const BorderSide(color: AppColors.primary),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadii.md),
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surfaceAlt,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadii.md),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadii.md),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadii.md),
          borderSide: const BorderSide(color: AppColors.primary, width: 2),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        labelStyle: const TextStyle(color: AppColors.textSecondary),
        hintStyle: const TextStyle(color: AppColors.textMuted),
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: AppColors.card,
        selectedItemColor: AppColors.primary,
        unselectedItemColor: AppColors.textMuted,
        type: BottomNavigationBarType.fixed,
        elevation: 0,
        showUnselectedLabels: true,
      ),
      dividerTheme: const DividerThemeData(
        color: AppColors.border,
        thickness: 1,
        space: 1,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: AppColors.secondary,
        labelStyle: const TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: AppColors.secondaryText,
        ),
        side: BorderSide.none,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.pill),
        ),
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: AppColors.primary,
        linearTrackColor: AppColors.primarySoft,
        circularTrackColor: AppColors.primarySoft,
      ),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        elevation: 4,
        highlightElevation: 6,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.md),
        ),
      ),
    );
  }

  static ThemeData get dark {
    final base = ThemeData.dark(useMaterial3: true);
    return base.copyWith(
      colorScheme: const ColorScheme.dark(
        primary: AppColors.primary,
        onPrimary: Colors.white,
        surface: AppColors.darkCard,
        onSurface: Colors.white,
        error: AppColors.danger,
      ),
      scaffoldBackgroundColor: AppColors.darkBackground,
    );
  }
}

// ── Helpers ────────────────────────────────────────────────────
/// Build a linear gradient from a preset color list.
LinearGradient appGradient(
  List<Color> colors, {
  AlignmentGeometry begin = Alignment.topLeft,
  AlignmentGeometry end = Alignment.bottomRight,
}) {
  return LinearGradient(begin: begin, end: end, colors: colors);
}
