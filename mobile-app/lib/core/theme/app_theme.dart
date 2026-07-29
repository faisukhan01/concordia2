// Concordia College — App-wide theme.
// Matches the web portal's brand: Concordia orange #F26522 on warm off-white.

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppColors {
  // Brand
  static const Color primary = Color(0xFFF26522);
  static const Color primaryDark = Color(0xFFD4541E);
  static const Color primaryLight = Color(0xFFFF8C42);

  // Surfaces
  static const Color background = Color(0xFFFCFBF9);
  static const Color card = Color(0xFFFFFFFF);
  static const Color sidebar = Color(0xFFFFFFFF);

  // Text
  static const Color textPrimary = Color(0xFF1A1A1A);
  static const Color textSecondary = Color(0xFF4A5568);
  static const Color textMuted = Color(0xFF9CA3AF);

  // Accents
  static const Color secondary = Color(0xFFFFF0E8);
  static const Color secondaryText = Color(0xFF6B4423);
  static const Color border = Color(0xFFFFE0CC);
  static const Color ring = Color(0xFFF26522);

  // Status
  static const Color success = Color(0xFF16A34A);
  static const Color warning = Color(0xFFF59E0B);
  static const Color danger = Color(0xFFDC2626);
  static const Color info = Color(0xFF0EA5E9);

  // Chart palette
  static const Color chart1 = Color(0xFFF26522);
  static const Color chart2 = Color(0xFFF8941D);
  static const Color chart3 = Color(0xFFC8102E);
  static const Color chart4 = Color(0xFFFFB347);
  static const Color chart5 = Color(0xFF6B4423);

  // Dark theme
  static const Color darkBackground = Color(0xFF1A1A1A);
  static const Color darkCard = Color(0xFF262626);
  static const Color darkSidebar = Color(0xFF0F0F0F);
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
      textTheme: GoogleFonts.interTextTheme(base.textTheme).apply(
        bodyColor: AppColors.textPrimary,
        displayColor: AppColors.textPrimary,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.background,
        foregroundColor: AppColors.textPrimary,
        elevation: 0,
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
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: AppColors.border, width: 1),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
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
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.card,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
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
        elevation: 8,
      ),
      dividerTheme: const DividerThemeData(
        color: AppColors.border,
        thickness: 1,
        space: 1,
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
