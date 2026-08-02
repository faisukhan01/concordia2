// Role shell — the main scaffold after login.
//
// Matches the web app's mobile layout exactly:
//   • Header (AppBar): 64px, white bg, #FFE0CC bottom border, hamburger
//     left, page title center-left, notifications bell (red dot badge) right,
//     user avatar (gradient initials) right
//   • Sidebar: 260px slide-in from left, bg-black/50 overlay, spring
//     animation, brand header with logo, nav groups with section headers,
//     bottom user card with sign out
//   • Bottom Navigation: white/95 backdrop-blur, border-orange-100,
//     icon + page name, active: orange + bold + dot indicator
//     >5 modules: first 4 + "More" bottom sheet
//   • Content area: p-4 (16px), bg #FCFBF9

import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_theme.dart';
import '../../widgets/shared_widgets.dart';
import '../auth/auth_provider.dart';
import 'nav_items.dart';
import 'nav_provider.dart';

class RoleShell extends StatefulWidget {
  const RoleShell({super.key});

  @override
  State<RoleShell> createState() => _RoleShellState();
}

class _RoleShellState extends State<RoleShell> {
  bool _sidebarOpen = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.read<NavProvider>().reset();
    });
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final nav = context.watch<NavProvider>();
    final user = auth.user!;
    final items = NavItems.forRole(user.role);

    int index = nav.index;
    if (index >= items.length) index = 0;
    if (index < 0) index = 0;
    final currentItem = items[index];
    final hasMore = items.length > 5;
    final visibleItems = hasMore ? items.sublist(0, 4) : items;
    final moreItems = hasMore ? items.sublist(4) : <NavItem>[];

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: PreferredSize(
        preferredSize: const Size.fromHeight(64),
        child: Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            border: Border(
              bottom: BorderSide(
                color: Color(0xFFFFE0CC),
                width: 0.5,
              ),
            ),
          ),
          child: SafeArea(
            bottom: false,
            child: SizedBox(
              height: 64,
              child: Row(
                children: [
                  // Hamburger menu icon (h-8 w-8, rounded-md)
                  Padding(
                    padding: const EdgeInsets.only(left: 8),
                    child: IconButton(
                      onPressed: () => _openSidebar(),
                      icon: const Icon(Icons.menu_rounded,
                          color: AppColors.textPrimary, size: 24),
                      style: IconButton.styleFrom(
                        minimumSize: const Size(32, 32),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                    ),
                  ),
                  // Page title (font-semibold, text-sm sm:text-base)
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.only(left: 4),
                      child: Text(
                        currentItem.label,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: AppColors.textPrimary,
                          letterSpacing: -0.2,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ),
                  // Notifications bell icon (h-9 w-9, rounded-md) with red dot badge
                  Padding(
                    padding: const EdgeInsets.only(right: 4),
                    child: IconButton(
                      onPressed: () => _showNotifications(context),
                      icon: SizedBox(
                        width: 36,
                        height: 36,
                        child: Stack(
                          alignment: Alignment.center,
                          children: [
                            const Icon(Icons.notifications_none_rounded,
                                color: AppColors.textSecondary, size: 22),
                            // Red dot badge
                            Positioned(
                              top: 6,
                              right: 8,
                              child: Container(
                                width: 8,
                                height: 8,
                                decoration: BoxDecoration(
                                  color: AppColors.danger,
                                  shape: BoxShape.circle,
                                  border: Border.all(
                                    color: Colors.white,
                                    width: 1.5,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      style: IconButton.styleFrom(
                        minimumSize: const Size(36, 36),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                    ),
                  ),
                  // User avatar (h-8 w-8, gradient bg with initials, ring-1 ring-gray-200)
                  Padding(
                    padding: const EdgeInsets.only(right: 12),
                    child: Container(
                      width: 32,
                      height: 32,
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [Color(0xFFF26522), Color(0xFFD4541E)],
                        ),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: const Color(0xFFE5E7EB),
                          width: 1,
                        ),
                      ),
                      child: Center(
                        child: Text(
                          initialsOf(user.name),
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
      body: Stack(
        children: [
          // Main content area: p-4 (16px), bg #FCFBF9
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 180),
            child: KeyedSubtree(
              key: ValueKey(index),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: currentItem.builder(context),
              ),
            ),
          ),
          // Sidebar overlay
          if (_sidebarOpen) ...[
            // Backdrop: bg-black/50
            GestureDetector(
              onTap: () => _closeSidebar(),
              child: Container(
                color: Colors.black.withOpacity(0.5),
              ),
            ),
            // Sidebar panel
            _SidebarPanel(
              items: items,
              currentIndex: index,
              user: user,
              onSelect: (i) {
                _closeSidebar();
                context.read<NavProvider>().setIndex(i);
              },
              onClose: () => _closeSidebar(),
              onSignOut: () {
                _closeSidebar();
                _confirmAndSignOut(context, auth);
              },
            ),
          ],
        ],
      ),
      bottomNavigationBar: _BottomNav(
        items: visibleItems,
        currentIndex: hasMore && index >= 4 ? 4 : index,
        hasMore: hasMore,
        onTap: (i) {
          if (hasMore && i == 4) {
            _showMoreSheet(context, moreItems);
          } else {
            context.read<NavProvider>().setIndex(i);
          }
        },
      ),
    );
  }

  void _openSidebar() {
    setState(() => _sidebarOpen = true);
  }

  void _closeSidebar() {
    setState(() => _sidebarOpen = false);
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
                    final targetIndex = NavItems.forRole(
                      context.read<AuthProvider>().user!.role,
                    ).indexOf(it);
                    if (targetIndex >= 0) {
                      context.read<NavProvider>().setIndex(targetIndex);
                    }
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

  void _confirmAndSignOut(BuildContext context, AuthProvider auth) {
    showDialog<bool>(
      context: context,
      barrierDismissible: true,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.lg),
        ),
        title: const Text('Sign Out'),
        content: const Text('Are you sure you want to sign out of your account?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.danger,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(AppRadii.md),
              ),
            ),
            child: const Text('Sign Out'),
          ),
        ],
      ),
    ).then((confirmed) {
      if (confirmed == true) {
        auth.logout();
      }
    });
  }
}

// ════════════════════════════════════════════════════════════════
// SIDEBAR PANEL — 260px slide-in from left
// ════════════════════════════════════════════════════════════════

class _SidebarPanel extends StatefulWidget {
  final List<NavItem> items;
  final int currentIndex;
  final dynamic user;
  final ValueChanged<int> onSelect;
  final VoidCallback onClose;
  final VoidCallback onSignOut;

  const _SidebarPanel({
    required this.items,
    required this.currentIndex,
    required this.user,
    required this.onSelect,
    required this.onClose,
    required this.onSignOut,
  });

  @override
  State<_SidebarPanel> createState() => _SidebarPanelState();
}

class _SidebarPanelState extends State<_SidebarPanel>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<Offset> _slideAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 300),
    );
    _slideAnimation = Tween<Offset>(
      begin: const Offset(-1.0, 0.0),
      end: Offset.zero,
    ).animate(CurvedAnimation(
      parent: _controller,
      curve: Curves.easeOut,
    ));
    _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SlideTransition(
      position: _slideAnimation,
      child: Container(
        width: 260,
        height: MediaQuery.of(context).size.height,
        color: Colors.white,
        child: Column(
          children: [
            // ── Brand header (h-16) with Concordia logo (38px height) ──
            Container(
              height: 64,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              decoration: const BoxDecoration(
                color: Colors.white,
                border: Border(
                  bottom: BorderSide(
                    color: Color(0xFFFFE0CC),
                    width: 0.5,
                  ),
                ),
              ),
              child: Row(
                children: [
                  Image.asset(
                    'assets/images/concordia-logo.png',
                    height: 38,
                    fit: BoxFit.contain,
                  ),
                  const Spacer(),
                  IconButton(
                    onPressed: widget.onClose,
                    icon: const Icon(Icons.close_rounded,
                        size: 20, color: AppColors.textSecondary),
                    style: IconButton.styleFrom(
                      minimumSize: const Size(32, 32),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            // ── Navigation: scrollable, groups separated by section headers ──
            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(vertical: 8),
                children: _buildNavGroups(),
              ),
            ),
            // ── Bottom: User card (border-t, p-3) ──
            Container(
              decoration: const BoxDecoration(
                border: Border(
                  top: BorderSide(
                    color: Color(0xFFFFE0CC),
                    width: 0.5,
                  ),
                ),
              ),
              padding: const EdgeInsets.all(12),
              child: Column(
                children: [
                  Row(
                    children: [
                      // Avatar with gradient
                      Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [Color(0xFFF26522), Color(0xFFD4541E)],
                          ),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: const Color(0xFFE5E7EB),
                            width: 1,
                          ),
                        ),
                        child: Center(
                          child: Text(
                            initialsOf(widget.user.name as String),
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              widget.user.name as String,
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: AppColors.textPrimary,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            Text(
                              widget.user.email as String? ?? '',
                              style: const TextStyle(
                                fontSize: 11,
                                color: AppColors.textMuted,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: widget.onSignOut,
                      icon: const Icon(Icons.logout_rounded,
                          size: 16, color: AppColors.danger),
                      label: const Text('Sign Out',
                          style: TextStyle(
                              color: AppColors.danger,
                              fontSize: 13,
                              fontWeight: FontWeight.w600)),
                      style: OutlinedButton.styleFrom(
                        side: const BorderSide(color: AppColors.dangerSoft),
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  List<Widget> _buildNavGroups() {
    final groups = <Widget>[];
    // Group items by section using the NavItem's group field
    // We iterate items and detect group changes
    String? currentGroup;
    for (int i = 0; i < widget.items.length; i++) {
      final item = widget.items[i];
      if (item.group != null && item.group != currentGroup) {
        currentGroup = item.group;
        groups.add(_SidebarSectionHeader(label: currentGroup!));
      }
      groups.add(_SidebarNavItem(
        item: item,
        active: i == widget.currentIndex,
        onTap: () => widget.onSelect(i),
      ));
    }
    return groups;
  }
}

/// Section header: text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400
class _SidebarSectionHeader extends StatelessWidget {
  final String label;
  const _SidebarSectionHeader({required this.label});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
      child: Text(
        label.toUpperCase(),
        style: const TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w600,
          color: Color(0xFF9CA3AF),
          letterSpacing: 1.2,
        ),
      ),
    );
  }
}

/// Nav item: w-full flex items-center gap-3 rounded-lg text-[13px] font-medium px-3 py-2.5
/// Active: bg-[#F26522] text-white shadow-sm shadow-[#F26522]/20
/// Inactive: text-gray-600 hover:bg-[#FFF0E8] hover:text-[#F26522]
/// Icons: h-[17px] w-[17px]
class _SidebarNavItem extends StatelessWidget {
  final NavItem item;
  final bool active;
  final VoidCallback onTap;

  const _SidebarNavItem({
    required this.item,
    required this.active,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 1),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(8),
        child: InkWell(
          borderRadius: BorderRadius.circular(8),
          onTap: onTap,
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: active ? const Color(0xFFF26522) : Colors.transparent,
              borderRadius: BorderRadius.circular(8),
              boxShadow: active
                  ? [
                      BoxShadow(
                        color: const Color(0xFFF26522).withOpacity(0.2),
                        blurRadius: 8,
                        offset: const Offset(0, 2),
                      ),
                    ]
                  : null,
            ),
            child: Row(
              children: [
                Icon(
                  active ? (item.activeIcon ?? item.icon) : item.icon,
                  size: 17,
                  color: active ? Colors.white : const Color(0xFF4A5568),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    item.label,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      color: active ? Colors.white : const Color(0xFF4A5568),
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════
// BOTTOM NAVIGATION — clean, professional
// ════════════════════════════════════════════════════════════════
// Active state: orange icon + bold orange label + small dot indicator
// (3px tall, 18px wide, rounded, orange). Inactive: gray icon + gray label.
// Background: bg-white/95 backdrop-blur, top border border-orange-100.

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
        label: i.label,
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

    return ClipRect(
      child: Container(
        decoration: const BoxDecoration(
          color: Color(0xF2FFFFFF), // white/95
          border: Border(
            top: BorderSide(
              color: Color(0xFFFFE0CC), // orange-100
              width: 0.5,
            ),
          ),
        ),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
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
            // Active dot indicator (3px tall, 18px wide, rounded, orange)
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
