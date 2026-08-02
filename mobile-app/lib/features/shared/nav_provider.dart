// Navigation state — the single source of truth for the active shell tab.
//
// Held outside RoleShell so any descendant (e.g. the admin dashboard's portal
// switcher or quick-action cards) can switch tabs by calling nav.setIndex(i)
// without needing a callback prop drilled through the tree.

import 'package:flutter/foundation.dart';

class NavProvider extends ChangeNotifier {
  int _index = 0;
  int get index => _index;

  void setIndex(int i) {
    if (_index == i) return;
    _index = i;
    notifyListeners();
  }

  /// Reset to the first tab (used on login / role entry).
  void reset() {
    _index = 0;
    notifyListeners();
  }
}
