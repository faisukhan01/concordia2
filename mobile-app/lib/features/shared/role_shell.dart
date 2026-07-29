// Role shell — the main scaffold after login.
//
// Clean, professional layout:
//   • Minimal app bar with menu button, page title, user name
//   • Bottom navigation: icon + label, active state uses color + small
//     dot indicator (no bulky pill toggle)
//   • Roles with >5 modules: first 4 + "More" sheet
//   • Drawer for full navigation, settings, logout
//
// The bottom nav is ALWAYS white on warm off-white background — there is
// no dark mode anywhere in the app (the web portal is light-only).

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

  void _goTo(int i) => setState(() => _index = i);

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final user = auth.user!;
    final items = NavItems.forRole(user.role);

    if (_index >= items.length) _index = 0;
    final currentItem = items[_index];
    final hasMore = items.length > 5;
    final visibleItems = hasMore ? items.sublist(0, 4) : items;
    final moreItems = hasMore ? items.sublist(4) : <NavItem>[];

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        leading: Builder(
          builder: (ctx) => Padding(
            padding: const EdgeInsets.only(left: 12),
            child: IconButton(
              onPressed: () => Scaffold.of(ctx).openDrawer(),
              icon: const Icon(Icons.menu_rounded,
                  color: AppColors.textPrimary, size: 24),
              style: IconButton.styleFrom(
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(AppRadii.md),
                ),
              ),
            ),
          ),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              currentItem.label,
              style: const TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: AppColors.textPrimary,
                letterSpacing: -0.2,
                height: 1.2,
              ),
            ),
            const SizedBox(height: 1),
            Text(
              'Hi, ${_firstName(user.name)}',
              style: const TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w400,
                color: AppColors.textSecondary,
              ),
            ),
          ],
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: IconButton(
              onPressed: () => _showNotifications(context),
              icon: const Icon(Icons.notifications_none_rounded,
                  color: AppColors.textSecondary, size: 22),
              style: IconButton.styleFrom(
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(AppRadii.md),
                ),
              ),
            ),
          ),
        ],
      ),
      drawer: const AppDrawer(),
      body: AnimatedSwitcher(
        duration: const Duration(milliseconds: 180),
        child: KeyedSubtree(
          key: ValueKey(_index),
          child: currentItem.builder(context),
        ),
      ),
      bottomNavigationBar: _BottomNav(
        items: visibleItems,
        currentIndex: hasMore && _index >= 4 ? 4 : _index,
        hasMore: hasMore,
        onTap: (i) {
          if (hasMore && i == 4) {
            _showMoreSheet(context, moreItems);
          } else {
            _goTo(i);
          }
        },
      ),
    );
  }

  String _firstName(String name) {
    if (name.isEmpty) return '';
    return name.trim().split(RegExp(r'\s+')).first;
  }

  void _showMoreSheet(BuildContext context, List<NavItem> moreItems) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(8, 10, 8, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 36,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 14),
                  decoration: BoxDecoration(
                    color: AppColors.border,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 16),
                child: Text(
                  'More Modules',
                  style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary,
                  ),
                ),
              ),
              const SizedBox(height: 8),
              for (final it in moreItems)
                _MoreTile(
                  item: it,
                  onTap: () {
                    Navigator.pop(context);
                    _goTo(NavItems.forRole(
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
      backgroundColor: Colors.white,
      isScrollControlled: true,
      showDragHandle: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Notifications',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textPrimary,
                ),
              ),
              const SizedBox(height: 16),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: AppColors.surfaceAlt,
                  borderRadius: BorderRadius.circular(AppRadii.md),
                ),
                child: const Column(
                  children: [
                    Icon(Icons.check_circle_outline_rounded,
                        size: 32, color: AppColors.success),
                    SizedBox(height: 8),
                    Text(
                      "You're all caught up",
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    SizedBox(height: 4),
                    Text(
                      'No new notifications right now.',
                      style: TextStyle(
                        fontSize: 13,
                        color: AppColors.textSecondary,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Bottom navigation — clean, professional ──────────────────────
// Active state: orange icon + small dot indicator above label + bold
// orange label. No bulky pill background.
class _BottomNav extends StatelessWidget {
  final List<NavItem> items;
  final int currentIndex;
  final bool hasMore;
  final ValueChanged<int> onTap;

  const _BottomNav({
    required this.items,
    required this.currentIndex,
    required this.hasMore,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final tabs = <_NavTab>[];
    for (final i in items) {
      tabs.add(_NavTab(
        label: i.shortLabel,
        icon: i.icon,
        activeIcon: i.activeIcon ?? i.icon,
      ));
    }
    if (hasMore) {
      tabs.add(const _NavTab(
        label: 'More',
        icon: Icons.more_horiz_rounded,
        activeIcon: Icons.more_horiz_rounded,
      ));
    }

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: AppColors.border, width: 0.5)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
          child: Row(
            children: [
              for (int i = 0; i < tabs.length; i++)
                Expanded(
                  child: _NavTabButton(
                    tab: tabs[i],
                    active: i == currentIndex,
                    onTap: () => onTap(i),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NavTab {
  final String label;
  final IconData icon;
  final IconData activeIcon;
  const _NavTab({required this.label, required this.icon, required this.activeIcon});
}

class _NavTabButton extends StatelessWidget {
  final _NavTab tab;
  final bool active;
  final VoidCallback onTap;
  const _NavTabButton({required this.tab, required this.active, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final color = active ? AppColors.primary : AppColors.textMuted;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 2),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Active dot indicator (small, clean)
            SizedBox(
              height: 4,
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 180),
                child: Container(
                  key: ValueKey(active),
                  width: active ? 18 : 0,
                  height: active ? 3 : 0,
                  decoration: BoxDecoration(
                    color: active ? AppColors.primary : Colors.transparent,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 5),
            Icon(
              active ? tab.activeIcon : tab.icon,
              size: 22,
              color: color,
            ),
            const SizedBox(height: 3),
            Text(
              tab.label,
              style: TextStyle(
                fontSize: 10.5,
                fontWeight: active ? FontWeight.w600 : FontWeight.w500,
                color: color,
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

class _MoreTile extends StatelessWidget {
  final NavItem item;
  final VoidCallback onTap;
  const _MoreTile({required this.item, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            children: [
              Icon(item.icon, size: 22, color: AppColors.textSecondary),
              const SizedBox(width: 14),
              Expanded(
                child: Text(
                  item.label,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                    color: AppColors.textPrimary,
                  ),
                ),
              ),
              const Icon(Icons.chevron_right_rounded,
                  color: AppColors.textMuted, size: 20),
            ],
          ),
        ),
      ),
    );
  }
}
