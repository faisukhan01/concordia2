// Role shell — the main scaffold after login.
// Renders an app bar with user info + a bottom nav (mobile-first) + drawer.
// Routes to the correct portal based on user.role.
//
// For roles with ≤5 modules: standard fixed BottomNavigationBar.
// For roles with >5 modules: first 4 tabs + a "More" tab that opens a
// bottom sheet listing the remaining modules — clean, no overflow.

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
    final hasMore = items.length > 5;
    // If >5 items: show first 4 + "More" in the bottom bar
    final visibleItems = hasMore ? items.sublist(0, 4) : items;
    final moreItems = hasMore ? items.sublist(4) : <NavItem>[];

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        leading: Builder(
          builder: (ctx) => IconButton(
            icon: const Icon(Icons.menu, size: 24),
            onPressed: () => Scaffold.of(ctx).openDrawer(),
          ),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              currentItem.label,
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: AppColors.textPrimary,
              ),
            ),
            Text(
              user.name,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w400,
                color: AppColors.textSecondary,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.notifications_outlined, size: 22),
            onPressed: () => _showNotifications(context),
          ),
          const SizedBox(width: 4),
        ],
      ),
      drawer: const AppDrawer(),
      body: currentItem.builder(context),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border(
            top: BorderSide(color: const Color(0xFFE5E7EB), width: 0.5),
          ),
        ),
        child: SafeArea(
          child: BottomNavigationBar(
            currentIndex: hasMore && _index >= 4 ? 4 : _index,
            onTap: (i) {
              if (hasMore && i == 4) {
                _showMoreSheet(context, moreItems);
              } else {
                setState(() => _index = i);
              }
            },
            type: BottomNavigationBarType.fixed,
            backgroundColor: Colors.white,
            selectedItemColor: AppColors.primary,
            unselectedItemColor: AppColors.textMuted,
            selectedFontSize: 11,
            unselectedFontSize: 11,
            elevation: 0,
            items: [
              for (final it in visibleItems)
                BottomNavigationBarItem(
                  icon: Icon(it.icon, size: 22),
                  activeIcon: Icon(it.activeIcon ?? it.icon, size: 22),
                  label: it.shortLabel,
                ),
              if (hasMore)
                const BottomNavigationBarItem(
                  icon: Icon(Icons.more_horiz, size: 22),
                  activeIcon: Icon(Icons.more_horiz, size: 22),
                  label: 'More',
                ),
            ],
          ),
        ),
      ),
    );
  }

  void _showMoreSheet(BuildContext context, List<NavItem> moreItems) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Text(
                  'More Modules',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary,
                  ),
                ),
              ),
              const SizedBox(height: 8),
              for (final it in moreItems)
                ListTile(
                  leading: Icon(it.icon, size: 22, color: AppColors.primary),
                  title: Text(
                    it.label,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w500,
                      color: AppColors.textPrimary,
                    ),
                  ),
                  onTap: () {
                    Navigator.pop(context);
                    setState(() => _index = NavItems.forRole(
                      context.read<AuthProvider>().user!.role,
                    ).indexOf(it));
                  },
                ),
            ],
          ),
        ),
      ),
    );
  }

  void _showNotifications(BuildContext context) {
    showModalBottomSheet(
      context: context,
      showDragHandle: true,
      backgroundColor: Colors.white,
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
