// Side drawer — user profile, role switcher-equivalent, settings, logout.

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../config/api_config.dart';
import '../../core/theme/app_theme.dart';
import '../auth/auth_provider.dart';

class AppDrawer extends StatelessWidget {
  const AppDrawer({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final user = auth.user;
    if (user == null) return const SizedBox.shrink();

    return Drawer(
      backgroundColor: AppColors.card,
      child: ListView(
        padding: EdgeInsets.zero,
        children: [
          // ── Header ──
          Container(
            padding: const EdgeInsets.fromLTRB(20, 40, 20, 20),
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [AppColors.primary, AppColors.primaryDark],
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CircleAvatar(
                  radius: 28,
                  backgroundColor: Colors.white,
                  child: Text(
                    (user.name.isNotEmpty ? user.name : user.email ?? '?')[0].toUpperCase(),
                    style: const TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w700,
                      color: AppColors.primary,
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  user.name,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 4),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    user.roleLabel,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  user.displayId,
                  style: TextStyle(
                    color: Colors.white.withOpacity(0.85),
                    fontSize: 13,
                  ),
                ),
                if (user.branchName != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    user.branchName!,
                    style: TextStyle(
                      color: Colors.white.withOpacity(0.7),
                      fontSize: 12,
                    ),
                  ),
                ],
              ],
            ),
          ),

          // ── Menu ──
          _DrawerTile(
            icon: Icons.settings_outlined,
            label: 'Settings',
            onTap: () => Navigator.pop(context),
          ),
          _DrawerTile(
            icon: Icons.download_outlined,
            label: 'Download App',
            onTap: () => launchUrl(Uri.parse(ApiConfig.downloadPageUrl)),
          ),
          _DrawerTile(
            icon: Icons.help_outline,
            label: 'Help & Support',
            onTap: () => Navigator.pop(context),
          ),
          const Divider(height: 1),

          // ── App info ──
          Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Concordia College',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Mobile App v1.0.0',
                  style: TextStyle(fontSize: 11, color: AppColors.textMuted),
                ),
              ],
            ),
          ),

          // ── Logout ──
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: OutlinedButton.icon(
              onPressed: () async {
                final confirmed = await showDialog<bool>(
                  context: context,
                  builder: (ctx) => AlertDialog(
                    title: const Text('Sign Out'),
                    content: const Text('Are you sure you want to sign out?'),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.pop(ctx, false),
                        child: const Text('Cancel'),
                      ),
                      TextButton(
                        onPressed: () => Navigator.pop(ctx, true),
                        style: TextButton.styleFrom(foregroundColor: AppColors.danger),
                        child: const Text('Sign Out'),
                      ),
                    ],
                  ),
                );
                if (confirmed == true && context.mounted) {
                  await auth.logout();
                }
              },
              icon: const Icon(Icons.logout, size: 18, color: AppColors.danger),
              label: const Text('Sign Out', style: TextStyle(color: AppColors.danger)),
              style: OutlinedButton.styleFrom(
                side: const BorderSide(color: AppColors.border),
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
          ),
          const SizedBox(height: 16),
        ],
      ),
    );
  }
}

class _DrawerTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  const _DrawerTile({required this.icon, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon, size: 22, color: AppColors.textSecondary),
      title: Text(label, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500)),
      onTap: onTap,
      contentPadding: const EdgeInsets.symmetric(horizontal: 20),
    );
  }
}
