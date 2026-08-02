// Concordia College — Premium shared UI primitives.
//
// A refined design-system layer used across every portal screen:
//   • StatCard — gradient hero stat tiles with trend chips
//   • GradientHero — full-bleed welcome / summary banner
//   • PremiumCard — soft-shadowed content card
//   • ListRow — avatar + title + subtitle + trailing row
//   • SectionHeader — section title with optional action
//   • StatusPill — colored status badge
//   • LoadingList / LoadingGrid — shimmer skeletons
//   • ErrorState / EmptyState — friendly fallbacks
//   • MiniBarChart / DonutChart — lightweight fl_chart visuals
//   • formatMoney / formatMoneyFull — currency helpers
//   • AppAvatar — colored initials avatar
//
// All components use the refined AppColors / AppShadows / AppRadii system.

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';
import '../core/theme/app_theme.dart';

// ════════════════════════════════════════════════════════════════
// HERO BANNERS
// ════════════════════════════════════════════════════════════════

/// Full-bleed gradient hero with title, subtitle, optional trailing stat.
/// Restrained design: subtle shadow, clean typography — not "vibe coded".
class GradientHero extends StatelessWidget {
  final String title;
  final String? subtitle;
  final String? eyebrow;
  final IconData? icon;
  final List<Color> gradient;
  final Widget? trailing;
  final double height;
  const GradientHero({
    super.key,
    required this.title,
    this.subtitle,
    this.eyebrow,
    this.icon,
    this.gradient = AppColors.primaryGradient,
    this.trailing,
    this.height = 116,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 20),
      decoration: BoxDecoration(
        gradient: appGradient(gradient),
        borderRadius: BorderRadius.circular(AppRadii.lg),
        boxShadow: [
          BoxShadow(
            color: gradient.first.withOpacity(0.15),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                if (eyebrow != null) ...[
                  Text(
                    eyebrow!.toUpperCase(),
                    style: TextStyle(
                      fontSize: 10.5,
                      fontWeight: FontWeight.w600,
                      color: Colors.white.withOpacity(0.8),
                      letterSpacing: 1.2,
                    ),
                  ),
                  const SizedBox(height: 5),
                ],
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                    letterSpacing: -0.3,
                    height: 1.15,
                  ),
                ),
                if (subtitle != null) ...[
                  const SizedBox(height: 5),
                  Text(
                    subtitle!,
                    style: TextStyle(
                      fontSize: 12.5,
                      color: Colors.white.withOpacity(0.9),
                      height: 1.3,
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (trailing != null) ...[
            const SizedBox(width: 12),
            trailing!,
          ] else if (icon != null) ...[
            const SizedBox(width: 12),
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.2),
                borderRadius: BorderRadius.circular(AppRadii.md),
              ),
              child: Icon(icon, size: 22, color: Colors.white),
            ),
          ],
        ],
      ),
    );
  }
}

/// Compact summary card (e.g. "Pending Rs 50K | Collected Rs 120K").
/// Renders as a subtle orange-tinted card with dark-orange values —
/// professional and on-brand, not a loud multi-colored gradient.
class GradientSummary extends StatelessWidget {
  final List<_SummaryItem> items;
  final List<Color> gradient;
  const GradientSummary({
    super.key,
    required this.items,
    this.gradient = AppColors.primaryGradient,
  });

  factory GradientSummary.pair({
    required String label1,
    required String value1,
    required String label2,
    required String value2,
    List<Color> gradient = AppColors.primaryGradient,
  }) {
    return GradientSummary(
      gradient: gradient,
      items: [
        _SummaryItem(label: label1, value: value1),
        _SummaryItem(label: label2, value: value2),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 18),
      decoration: BoxDecoration(
        color: AppColors.primarySoft,
        borderRadius: BorderRadius.circular(AppRadii.lg),
        border: Border.all(
          color: AppColors.primary.withOpacity(0.16),
          width: 1,
        ),
      ),
      child: Row(
        children: [
          for (int i = 0; i < items.length; i++) ...[
            if (i > 0) ...[
              Container(
                width: 1,
                height: 38,
                margin: const EdgeInsets.symmetric(horizontal: 14),
                color: AppColors.primary.withOpacity(0.22),
              ),
            ],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    items[i].label,
                    style: TextStyle(
                      fontSize: 12,
                      color: AppColors.secondaryText,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    items[i].value,
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                      color: AppColors.primaryDark,
                      letterSpacing: -0.3,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _SummaryItem {
  final String label;
  final String value;
  const _SummaryItem({required this.label, required this.value});
}

// ════════════════════════════════════════════════════════════════
// STAT CARD
// ════════════════════════════════════════════════════════════════

class StatCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color? color;
  final List<Color>? gradient;
  final String? trend;
  final bool? trendUp;
  final VoidCallback? onTap;
  final bool compact;

  const StatCard({
    super.key,
    required this.label,
    required this.value,
    required this.icon,
    this.color,
    this.gradient,
    this.trend,
    this.trendUp,
    this.onTap,
    this.compact = false,
  });

  @override
  Widget build(BuildContext context) {
    // Unified professional look: always a WHITE card with a soft orange
    // icon bubble. The gradient/color param only tints the icon — no
    // full-card multi-colored gradients (per official Concordia brand).
    final c = color ??
        (gradient != null ? gradient!.first : AppColors.primary);

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: EdgeInsets.all(compact ? 12 : 14),
        decoration: BoxDecoration(
          color: AppColors.card,
          borderRadius: BorderRadius.circular(AppRadii.md),
          border: Border.all(color: AppColors.border, width: 1),
          boxShadow: AppShadows.subtle,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: compact ? 30 : 36,
                  height: compact ? 30 : 36,
                  decoration: BoxDecoration(
                    color: c.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(AppRadii.sm),
                  ),
                  child: Icon(icon, size: compact ? 16 : 18, color: c),
                ),
                const Spacer(),
                if (trend != null)
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: (trendUp ?? true
                              ? AppColors.success
                              : AppColors.danger)
                          .withOpacity(0.12),
                      borderRadius: BorderRadius.circular(AppRadii.pill),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          (trendUp ?? true)
                              ? Icons.trending_up
                              : Icons.trending_down,
                          size: 10,
                          color: (trendUp ?? true)
                              ? AppColors.success
                              : AppColors.danger,
                        ),
                        const SizedBox(width: 2),
                        Text(
                          trend!,
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            color: (trendUp ?? true)
                                ? AppColors.success
                                : AppColors.danger,
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
            SizedBox(height: compact ? 10 : 14),
            Text(
              value,
              style: TextStyle(
                fontSize: compact ? 18 : 22,
                fontWeight: FontWeight.w800,
                color: AppColors.textPrimary,
                letterSpacing: -0.3,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: const TextStyle(
                fontSize: 12,
                color: AppColors.textSecondary,
                fontWeight: FontWeight.w500,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════
// PREMIUM CARD & LIST ROW
// ════════════════════════════════════════════════════════════════

class PremiumCard extends StatelessWidget {
  final Widget child;
  final EdgeInsets? padding;
  final VoidCallback? onTap;
  final Color? borderColor;
  const PremiumCard({
    super.key,
    required this.child,
    this.padding,
    this.onTap,
    this.borderColor,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.card,
      borderRadius: BorderRadius.circular(AppRadii.md),
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadii.md),
        onTap: onTap,
        child: Container(
          padding: padding ?? const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadii.md),
            border: Border.all(
              color: borderColor ?? AppColors.border,
              width: 1,
            ),
            boxShadow: AppShadows.subtle,
          ),
          child: child,
        ),
      ),
    );
  }
}

/// A polished list row: avatar + title/subtitle + trailing widget.
class ListRow extends StatelessWidget {
  final String title;
  final String? subtitle;
  final String? eyebrow;
  final Widget? leading;
  final Widget? trailing;
  final VoidCallback? onTap;
  final Color? accentColor;
  final String? initials;
  final IconData? icon;

  const ListRow({
    super.key,
    required this.title,
    this.subtitle,
    this.eyebrow,
    this.leading,
    this.trailing,
    this.onTap,
    this.accentColor,
    this.initials,
    this.icon,
  });

  @override
  Widget build(BuildContext context) {
    final accent = accentColor ?? AppColors.primary;
    Widget lead;
    if (leading != null) {
      lead = leading!;
    } else {
      lead = AppAvatar(
        initials: initials ?? (title.isNotEmpty ? title[0] : '?'),
        color: accent,
        size: 40,
      );
    }
    return Material(
      color: AppColors.card,
      borderRadius: BorderRadius.circular(AppRadii.md),
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadii.md),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadii.md),
            border: Border.all(color: AppColors.border, width: 1),
          ),
          child: Row(
            children: [
              lead,
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (eyebrow != null) ...[
                      Text(
                        eyebrow!.toUpperCase(),
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: accent,
                          letterSpacing: 1.0,
                        ),
                      ),
                      const SizedBox(height: 2),
                    ],
                    Text(
                      title,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textPrimary,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (subtitle != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        subtitle!,
                        style: const TextStyle(
                          fontSize: 12.5,
                          color: AppColors.textSecondary,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ],
                ),
              ),
              if (trailing != null) ...[
                const SizedBox(width: 8),
                trailing!,
              ] else if (onTap != null) ...[
                const SizedBox(width: 4),
                const Icon(Icons.chevron_right,
                    color: AppColors.textMuted, size: 20),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Colored initials avatar.
class AppAvatar extends StatelessWidget {
  final String initials;
  final Color color;
  final double size;
  final bool useGradient;
  const AppAvatar({
    super.key,
    required this.initials,
    this.color = AppColors.primary,
    this.size = 40,
    this.useGradient = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        gradient: useGradient ? appGradient(AppColors.primaryGradient) : null,
        color: useGradient ? null : color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(size * 0.3),
      ),
      child: Center(
        child: Text(
          (initials.isEmpty ? '?' : initials[0]).toUpperCase(),
          style: TextStyle(
            fontSize: size * 0.42,
            fontWeight: FontWeight.w800,
            color: useGradient ? Colors.white : color,
          ),
        ),
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════
// SECTION HEADER & STATUS PILL
// ════════════════════════════════════════════════════════════════

class SectionHeader extends StatelessWidget {
  final String title;
  final String? subtitle;
  final String? action;
  final VoidCallback? onAction;
  final EdgeInsets? padding;
  const SectionHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.action,
    this.onAction,
    this.padding,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding ?? const EdgeInsets.only(top: 22, bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary,
                    letterSpacing: -0.2,
                  ),
                ),
                if (subtitle != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    subtitle!,
                    style: const TextStyle(
                      fontSize: 12.5,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (action != null)
            GestureDetector(
              onTap: onAction,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.primarySoft,
                  borderRadius: BorderRadius.circular(AppRadii.pill),
                ),
                child: Text(
                  action!,
                  style: const TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color: AppColors.primary,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class StatusChip extends StatelessWidget {
  final String text;
  final StatusType type;
  final bool compact;
  const StatusChip({
    super.key,
    required this.text,
    this.type = StatusType.neutral,
    this.compact = false,
  });

  @override
  Widget build(BuildContext context) {
    final (fg, bg) = switch (type) {
      StatusType.success => (AppColors.success, AppColors.successSoft),
      StatusType.warning => (AppColors.warning, AppColors.warningSoft),
      StatusType.danger => (AppColors.danger, AppColors.dangerSoft),
      StatusType.info => (AppColors.info, AppColors.infoSoft),
      StatusType.purple => (AppColors.purple, AppColors.purpleSoft),
      StatusType.neutral => (AppColors.textSecondary, AppColors.secondary),
    };
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: compact ? 8 : 10,
        vertical: compact ? 3 : 4,
      ),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(AppRadii.pill),
      ),
      child: Text(
        text,
        style: TextStyle(
          fontSize: compact ? 10.5 : 11,
          fontWeight: FontWeight.w700,
          color: fg,
        ),
      ),
    );
  }
}

enum StatusType { success, warning, danger, info, purple, neutral }

// ════════════════════════════════════════════════════════════════
// LOADING / ERROR / EMPTY
// ════════════════════════════════════════════════════════════════

class LoadingList extends StatelessWidget {
  final int count;
  final double height;
  const LoadingList({super.key, this.count = 5, this.height = 72});

  @override
  Widget build(BuildContext context) {
    return Shimmer.fromColors(
      baseColor: AppColors.border,
      highlightColor: AppColors.primarySoft,
      child: ListView.builder(
        physics: const NeverScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        itemCount: count,
        itemBuilder: (_, __) => Container(
          height: height,
          margin: const EdgeInsets.only(bottom: 10),
          decoration: BoxDecoration(
            color: AppColors.card,
            borderRadius: BorderRadius.circular(AppRadii.md),
          ),
        ),
      ),
    );
  }
}

class LoadingGrid extends StatelessWidget {
  final int count;
  const LoadingGrid({super.key, this.count = 4});

  @override
  Widget build(BuildContext context) {
    return Shimmer.fromColors(
      baseColor: AppColors.border,
      highlightColor: AppColors.primarySoft,
      child: GridView.count(
        crossAxisCount: 2,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        mainAxisSpacing: 12,
        crossAxisSpacing: 12,
        childAspectRatio: 1.1,
        children: List.generate(
          count,
          (_) => Container(
            decoration: BoxDecoration(
              color: AppColors.card,
              borderRadius: BorderRadius.circular(AppRadii.md),
            ),
          ),
        ),
      ),
    );
  }
}

class ErrorState extends StatelessWidget {
  final String message;
  final VoidCallback? onRetry;
  final IconData? icon;
  const ErrorState({
    super.key,
    required this.message,
    this.onRetry,
    this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                color: AppColors.dangerSoft,
                shape: BoxShape.circle,
              ),
              child: Icon(icon ?? Icons.error_outline,
                  size: 34, color: AppColors.danger),
            ),
            const SizedBox(height: 16),
            Text(
              'Something went wrong',
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: AppColors.textPrimary,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 6),
            Text(
              message,
              style: const TextStyle(
                fontSize: 13,
                color: AppColors.textSecondary,
                height: 1.4,
              ),
              textAlign: TextAlign.center,
            ),
            if (onRetry != null) ...[
              const SizedBox(height: 18),
              ElevatedButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh, size: 18),
                label: const Text('Try again'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final String? actionLabel;
  final VoidCallback? onAction;
  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    this.subtitle,
    this.actionLabel,
    this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                color: AppColors.primarySoft,
                shape: BoxShape.circle,
              ),
              child: Icon(icon, size: 36, color: AppColors.primary),
            ),
            const SizedBox(height: 18),
            Text(
              title,
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: AppColors.textPrimary,
              ),
              textAlign: TextAlign.center,
            ),
            if (subtitle != null) ...[
              const SizedBox(height: 6),
              Text(
                subtitle!,
                style: const TextStyle(
                  fontSize: 13,
                  color: AppColors.textSecondary,
                  height: 1.4,
                ),
                textAlign: TextAlign.center,
              ),
            ],
            if (actionLabel != null && onAction != null) ...[
              const SizedBox(height: 18),
              ElevatedButton(onPressed: onAction, child: Text(actionLabel!)),
            ],
          ],
        ),
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════
// MINI CHARTS (fl_chart)
// ════════════════════════════════════════════════════════════════

/// Compact horizontal bar chart for breakdowns (e.g. fees by status).
class MiniBarChart extends StatelessWidget {
  final List<BarData> bars;
  final double height;
  const MiniBarChart({super.key, required this.bars, this.height = 180});

  @override
  Widget build(BuildContext context) {
    final maxV = bars.fold<double>(0, (a, b) => a > b.value ? a : b.value);
    return SizedBox(
      height: height,
      child: BarChart(
        BarChartData(
          alignment: BarChartAlignment.spaceAround,
          maxY: maxV * 1.18,
          barTouchData: BarTouchData(
            enabled: true,
            touchTooltipData: BarTouchTooltipData(
              getTooltipItem: (g, _, rod, __) => BarTooltipItem(
                rod.toY.toStringAsFixed(0),
                const TextStyle(
                  color: Colors.white,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
          titlesData: FlTitlesData(
            topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            leftTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            bottomTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                reservedSize: 28,
                getTitlesWidget: (v, _) {
                  final i = v.round();
                  if (i < 0 || i >= bars.length) return const SizedBox();
                  return Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(
                      bars[i].label,
                      style: const TextStyle(
                        fontSize: 10.5,
                        color: AppColors.textMuted,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  );
                },
              ),
            ),
          ),
          borderData: FlBorderData(show: false),
          gridData: const FlGridData(show: false),
          barGroups: List.generate(bars.length, (i) {
            final b = bars[i];
            return BarChartGroupData(
              x: i,
              barRods: [
                BarChartRodData(
                  toY: b.value,
                  width: 22,
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(6)),
                  gradient: appGradient(b.gradient ?? AppColors.primaryGradient),
                ),
              ],
            );
          }),
        ),
      ),
    );
  }
}

class BarData {
  final String label;
  final double value;
  final List<Color>? gradient;
  const BarData({required this.label, required this.value, this.gradient});
}

/// Compact donut chart for proportion (e.g. attendance %).
class DonutChart extends StatelessWidget {
  final double percent; // 0..1
  final String centerLabel;
  final String? centerSub;
  final List<Color>? gradient;
  final double size;
  const DonutChart({
    super.key,
    required this.percent,
    required this.centerLabel,
    this.centerSub,
    this.gradient,
    this.size = 130,
  });

  @override
  Widget build(BuildContext context) {
    final colors = gradient ?? AppColors.primaryGradient;
    final clamped = percent.clamp(0.0, 1.0);
    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          PieChart(
            PieChartData(
              sectionsSpace: 0,
              centerSpaceRadius: size * 0.34,
              sections: [
                PieChartSectionData(
                  value: clamped,
                  color: colors.first,
                  radius: 14,
                  showTitle: false,
                ),
                PieChartSectionData(
                  value: 1 - clamped,
                  color: AppColors.border,
                  radius: 14,
                  showTitle: false,
                ),
              ],
            ),
          ),
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                centerLabel,
                style: const TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  color: AppColors.textPrimary,
                ),
              ),
              if (centerSub != null) ...[
                const SizedBox(height: 2),
                Text(
                  centerSub!,
                  style: const TextStyle(
                    fontSize: 11,
                    color: AppColors.textMuted,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════
// MONEY FORMATTERS
// ════════════════════════════════════════════════════════════════
String formatMoney(double amount) {
  final isNegative = amount < 0;
  final abs = amount.abs();
  String formatted;
  if (abs >= 10000000) {
    formatted = '${(abs / 10000000).toStringAsFixed(2)}Cr';
  } else if (abs >= 100000) {
    formatted = '${(abs / 100000).toStringAsFixed(2)}L';
  } else if (abs >= 1000) {
    formatted = '${(abs / 1000).toStringAsFixed(1)}K';
  } else {
    formatted = abs.toStringAsFixed(0);
  }
  return '${isNegative ? "-" : ""}Rs $formatted';
}

String formatMoneyFull(double amount) {
  return 'Rs ${amount.toStringAsFixed(0)}';
}

String formatDate(dynamic iso) {
  if (iso == null) return '';
  final s = iso.toString();
  if (s.length < 10) return s;
  final parts = s.substring(0, 10).split('-');
  if (parts.length != 3) return s.substring(0, 10);
  final months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];
  final m = int.tryParse(parts[1]);
  final month = (m != null && m >= 1 && m <= 12) ? months[m - 1] : parts[1];
  return '${parts[2]} $month ${parts[0]}';
}

String initialsOf(String name) {
  if (name.isEmpty) return '?';
  final parts = name.trim().split(RegExp(r'\s+'));
  if (parts.length == 1) return parts[0][0].toUpperCase();
  return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
}

// ════════════════════════════════════════════════════════════════
// SUB TAB BAR — persistent in-portal tab switcher
// ════════════════════════════════════════════════════════════════
// Used by the sub-portals (Accountant / Admissions / Academic) when
// they are embedded inside the Admin shell. The Admin's bottom nav
// only switches between the 5 top-level modules; this SubTabBar lets
// the admin (and the role user) switch between every sub-tab of the
// embedded portal so they can perform ALL of that role's tasks.

/// A single sub-tab definition.
class SubTabItem {
  final String label;
  final IconData icon;
  const SubTabItem({required this.label, required this.icon});
}

/// Horizontally-scrollable pill bar for switching sub-tabs.
///
/// Premium segmented control: the active pill uses a Concordia-orange
/// gradient with a soft glow, inactives are clean white cards. Shown for
/// admins (who need it to switch a sub-portal's tasks); the portal's own
/// role hides it because their bottom nav already covers the same items.
class SubTabBar extends StatelessWidget {
  final List<SubTabItem> tabs;
  final int currentIndex;
  final ValueChanged<int> onTap;
  const SubTabBar({
    super.key,
    required this.tabs,
    required this.currentIndex,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 50,
      margin: const EdgeInsets.fromLTRB(16, 10, 0, 8),
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.only(right: 16),
        physics: const BouncingScrollPhysics(),
        itemCount: tabs.length,
        separatorBuilder: (_, __) => const SizedBox(width: 9),
        itemBuilder: (_, i) {
          final active = i == currentIndex;
          return GestureDetector(
            onTap: () => onTap(i),
            behavior: HitTestBehavior.opaque,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              curve: Curves.easeOut,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
              decoration: BoxDecoration(
                gradient: active
                    ? appGradient(AppColors.primaryGradient)
                    : null,
                color: active ? null : AppColors.card,
                borderRadius: BorderRadius.circular(AppRadii.pill),
                border: Border.all(
                  color: active
                      ? AppColors.primary
                      : AppColors.border,
                  width: 1,
                ),
                boxShadow: active
                    ? [
                        BoxShadow(
                          color: AppColors.primary.withOpacity(0.30),
                          blurRadius: 12,
                          offset: const Offset(0, 4),
                          spreadRadius: 0,
                        ),
                        BoxShadow(
                          color: Colors.black.withOpacity(0.04),
                          blurRadius: 6,
                          offset: const Offset(0, 2),
                        ),
                      ]
                    : [
                        BoxShadow(
                          color: Colors.black.withOpacity(0.03),
                          blurRadius: 4,
                          offset: const Offset(0, 1),
                        ),
                      ],
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    tabs[i].icon,
                    size: 16,
                    color: active
                        ? Colors.white
                        : AppColors.textSecondary,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    tabs[i].label,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight:
                          active ? FontWeight.w700 : FontWeight.w500,
                      color: active
                          ? Colors.white
                          : AppColors.textSecondary,
                      letterSpacing: active ? 0.1 : 0,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
