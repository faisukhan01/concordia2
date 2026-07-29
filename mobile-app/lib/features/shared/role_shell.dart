// Role shell — the main scaffold after login.
// Renders a bottom nav (mobile-first) + drawer.
// Routes to the correct portal based on user.role.

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_theme.dart';
import '../auth/auth_provider.dart';
import 'nav_items.dart';
import 'app_drawer.dart';

class RoleShell extends StatefulWidget {
  const RoleShell({super.key});

  @override
  State<RoleShell> createState() => _RoleShellState();
}

class _RoleShellState extends State<RoleShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final user = auth.user!;
    final items = NavItems.forRole(user.role);

    // Clamp index if out of range (e.g. after role change)
    if (_index >= items.length) _index = 0;

    final currentItem = items[_index];

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        surfaceTintColor: Colors.transparent,
        title: Text(currentItem.label),
        actions: [
          IconButton(
            icon: const Icon(Icons.notifications_outlined, size: 22),
            onPressed: () => _showNotifications(context),
          ),
          const SizedBox(width: 4),
        ],
        leading: Builder(
          builder: (ctx) => IconButton(
            icon: const Icon(Icons.menu, size: 24),
            onPressed: () => Scaffold.of(ctx).openDrawer(),
          ),
        ),
      ),
      drawer: const AppDrawer(),
      body: currentItem.builder(context),
      bottomNavigationBar: items.length <= 5
          ? BottomNavigationBar(
              currentIndex: _index,
              onTap: (i) => setState(() => _index = i),
              items: [
                for (final it in items)
                  BottomNavigationBarItem(
                    icon: Icon(it.icon, size: 22),
                    activeIcon: Icon(it.activeIcon ?? it.icon, size: 22),
                    label: it.shortLabel,
                  ),
              ],
            )
          : null,
      // For roles with >5 modules, use a scrollable bottom bar.
      floatingActionButton: items.length > 5
          ? null
          : null,
    );
  }

  void _showNotifications(BuildContext context) {
    // Placeholder — wired to /api/notifications in a later iteration.
    showModalBottomSheet(
      context: context,
      showDragHandle: true,
      builder: (_) => Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Notifications',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.textPrimary),
            ),
            const SizedBox(height: 12),
            Text(
              'No new notifications.',
              style: TextStyle(fontSize: 14, color: AppColors.textSecondary),
            ),
          ],
        ),
      ),
    );
  }
}
