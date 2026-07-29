// Reusable UI primitives used across all portals.

import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';
import '../core/theme/app_theme.dart';

// ── Stat card ────────────────────────────────────────────────────
class StatCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color? color;
  final String? trend;
  final VoidCallback? onTap;

  const StatCard({
    super.key,
    required this.label,
    required this.value,
    required this.icon,
    this.color,
    this.trend,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final c = color ?? AppColors.primary;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.card,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 32, height: 32,
                  decoration: BoxDecoration(
                    color: c.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(icon, size: 18, color: c),
                ),
                const Spacer(),
                if (trend != null)
                  Text(trend!, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.success)),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              value,
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w800,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}

// ── Section header ───────────────────────────────────────────────
class SectionHeader extends StatelessWidget {
  final String title;
  final String? action;
  final VoidCallback? onAction;
  const SectionHeader({super.key, required this.title, this.action, this.onAction});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 20, bottom: 10),
      child: Row(
        children: [
          Text(
            title,
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: AppColors.textPrimary,
            ),
          ),
          const Spacer(),
          if (action != null)
            GestureDetector(
              onTap: onAction,
              child: Text(
                action!,
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.primary),
              ),
            ),
        ],
      ),
    );
  }
}

// ── Empty state ──────────────────────────────────────────────────
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
              width: 72, height: 72,
              decoration: BoxDecoration(
                color: AppColors.secondary,
                shape: BoxShape.circle,
              ),
              child: Icon(icon, size: 32, color: AppColors.primary),
            ),
            const SizedBox(height: 16),
            Text(
              title,
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.textPrimary),
              textAlign: TextAlign.center,
            ),
            if (subtitle != null) ...[
              const SizedBox(height: 6),
              Text(
                subtitle!,
                style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
                textAlign: TextAlign.center,
              ),
            ],
            if (actionLabel != null && onAction != null) ...[
              const SizedBox(height: 16),
              ElevatedButton(onPressed: onAction, child: Text(actionLabel!)),
            ],
          ],
        ),
      ),
    );
  }
}

// ── Loading shimmer list ─────────────────────────────────────────
class LoadingList extends StatelessWidget {
  final int count;
  final double height;
  const LoadingList({super.key, this.count = 4, this.height = 72});

  @override
  Widget build(BuildContext context) {
    return Shimmer.fromColors(
      baseColor: AppColors.border,
      highlightColor: AppColors.secondary,
      child: ListView.builder(
        physics: const NeverScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        itemCount: count,
        itemBuilder: (_, __) => Container(
          height: height,
          margin: const EdgeInsets.only(bottom: 10),
          decoration: BoxDecoration(
            color: AppColors.card,
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
    );
  }
}

// ── Error state ──────────────────────────────────────────────────
class ErrorState extends StatelessWidget {
  final String message;
  final VoidCallback? onRetry;
  const ErrorState({super.key, required this.message, this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 48, color: AppColors.danger),
            const SizedBox(height: 12),
            Text(
              message,
              style: TextStyle(fontSize: 14, color: AppColors.textSecondary),
              textAlign: TextAlign.center,
            ),
            if (onRetry != null) ...[
              const SizedBox(height: 16),
              OutlinedButton(onPressed: onRetry, child: const Text('Retry')),
            ],
          ],
        ),
      ),
    );
  }
}

// ── Status chip ──────────────────────────────────────────────────
class StatusChip extends StatelessWidget {
  final String text;
  final StatusType type;
  const StatusChip({super.key, required this.text, this.type = StatusType.neutral});

  @override
  Widget build(BuildContext context) {
    final colors = switch (type) {
      StatusType.success => (AppColors.success, AppColors.success.withOpacity(0.12)),
      StatusType.warning => (AppColors.warning, AppColors.warning.withOpacity(0.12)),
      StatusType.danger => (AppColors.danger, AppColors.danger.withOpacity(0.12)),
      StatusType.info => (AppColors.info, AppColors.info.withOpacity(0.12)),
      StatusType.neutral => (AppColors.textSecondary, AppColors.secondary),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: colors.$2,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: colors.$1,
        ),
      ),
    );
  }
}

enum StatusType { success, warning, danger, info, neutral }

// ── Money formatter ──────────────────────────────────────────────
String formatMoney(double amount) {
  final isNegative = amount < 0;
  final abs = amount.abs();
  String formatted;
  if (abs >= 1000000) {
    formatted = '${(abs / 1000000).toStringAsFixed(2)}M';
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
