// Concordia College — First-Launch Permission Onboarding Flow (v4.6.2)
//
// This is a 3-step onboarding flow shown the FIRST time a user opens the app.
// It mimics the SuperVPN-style permission flow:
//   Step 1: "Allow notifications" → triggers Android POST_NOTIFICATIONS system dialog
//   Step 2: "Disable battery optimization" → triggers Android battery whitelist system dialog
//   Step 3: "Let app always run in background" → opens OEM Auto-start settings
//
// Each step has:
//   - A clean full-screen card with icon, title, short description
//   - A primary "Allow" / "Continue" button that triggers the REAL system permission
//   - A secondary "Skip" link (user can skip but won't get notifications when app is closed)
//
// The flow only shows ONCE per app version (tracked in SharedPreferences).
// Upgrading to a new version re-shows it once.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:shared_preferences/shared_preferences.dart';

class OnboardingFlow {
  static const String _flagKey = 'v4.6.2_onboarding_completed';

  /// Check if onboarding has already been completed for this version.
  static Future<bool> hasCompleted() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_flagKey) ?? false;
  }

  /// Mark onboarding as completed.
  static Future<void> markCompleted() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_flagKey, true);
  }

  /// Show the onboarding flow if it hasn't been completed yet.
  /// Returns true if the flow was shown, false if it was skipped (already done).
  static Future<bool> showIfNeeded(BuildContext context) async {
    if (await hasCompleted()) return false;

    // Don't show if no context
    if (!context.mounted) return false;

    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => const _OnboardingDialog(),
    );

    return true;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// The dialog itself — a stateful widget that manages the 3-step flow.
// ═══════════════════════════════════════════════════════════════════════════

class _OnboardingDialog extends StatefulWidget {
  const _OnboardingDialog();

  @override
  State<_OnboardingDialog> createState() => _OnboardingDialogState();
}

class _OnboardingDialogState extends State<_OnboardingDialog> {
  int _currentStep = 0; // 0 = notifications, 1 = battery, 2 = autostart
  bool _isProcessing = false;

  // MethodChannels for native Android permission requests.
  static const _batteryChannel = MethodChannel('concordia/battery');
  static const _deviceChannel = MethodChannel('concordia/device');

  // The 3 steps' content.
  static const _steps = [
    _OnboardingStep(
      icon: Icons.notifications_active_rounded,
      title: 'Allow Notifications',
      description:
          'Concordia College needs permission to send you announcements, exam alerts, fee reminders, and attendance updates.',
      buttonText: 'Allow',
      skipText: 'Not now',
    ),
    _OnboardingStep(
      icon: Icons.battery_full_rounded,
      title: 'Disable Battery Optimization',
      description:
          'Allow Concordia to run in the background so notifications arrive even when the app is closed — just like WhatsApp.',
      buttonText: 'Continue',
      skipText: 'Skip',
    ),
    _OnboardingStep(
      icon: Icons.power_settings_new_rounded,
      title: 'Let App Always Run in Background',
      description:
          'Enable Auto-start for Concordia so your phone doesn\'t kill it in the background. This ensures you never miss a notification.',
      buttonText: 'Allow',
      skipText: 'Skip',
    ),
  ];

  Future<void> _handleAllow() async {
    if (_isProcessing) return;
    setState(() => _isProcessing = true);

    try {
      switch (_currentStep) {
        case 0:
          // Step 1: Request notification permission (shows Android system dialog).
          await FirebaseMessaging.instance.requestPermission(
            alert: true,
            badge: true,
            sound: true,
            announcement: false,
            carPlay: false,
            criticalAlert: false,
            provisional: false,
          );
          break;
        case 1:
          // Step 2: Request battery optimization whitelist (shows Android system dialog).
          try {
            final already =
                await _batteryChannel.invokeMethod<bool>('isIgnoring');
            if (already != true) {
              await _batteryChannel.invokeMethod<void>('requestIgnore');
            }
          } catch (e) {
            debugPrint('[Onboarding] battery-opt request failed: $e');
          }
          break;
        case 2:
          // Step 3: Open Auto-start settings (OEM-specific).
          try {
            await _deviceChannel.invokeMethod<bool>('openAutoStartSettings');
          } catch (e) {
            debugPrint('[Onboarding] autostart open failed: $e');
          }
          break;
      }
    } catch (e) {
      debugPrint('[Onboarding] step $_currentStep failed: $e');
    }

    // Wait a moment for the system dialog to be dismissed.
    await Future.delayed(const Duration(milliseconds: 800));

    if (!mounted) return;

    if (_currentStep < 2) {
      setState(() {
        _currentStep++;
        _isProcessing = false;
      });
    } else {
      // All steps done — mark complete + dismiss.
      await OnboardingFlow.markCompleted();
      if (mounted) {
        Navigator.of(context).pop();
      }
    }
  }

  Future<void> _handleSkip() async {
    // Skip the current step but continue to the next.
    if (_currentStep < 2) {
      setState(() => _currentStep++);
    } else {
      await OnboardingFlow.markCompleted();
      if (mounted) Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final step = _steps[_currentStep];
    return PopScope(
      canPop: false,
      child: Dialog(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(24),
        ),
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              // ── Progress indicator (3 dots) ──
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(3, (i) {
                  return Container(
                    margin: const EdgeInsets.symmetric(horizontal: 4),
                    width: i == _currentStep ? 24 : 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: i <= _currentStep
                          ? const Color(0xFFF26522)
                          : const Color(0xFFE0E0E0),
                      borderRadius: BorderRadius.circular(4),
                    ),
                  );
                }),
              ),
              const SizedBox(height: 28),

              // ── Icon ──
              Container(
                width: 80,
                height: 80,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFFF26522), Color(0xFFFF8A4C)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(20),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFFF26522).withOpacity(0.3),
                      blurRadius: 20,
                      offset: const Offset(0, 8),
                    ),
                  ],
                ),
                child: Icon(
                  step.icon,
                  color: Colors.white,
                  size: 40,
                ),
              ),
              const SizedBox(height: 24),

              // ── Title ──
              Text(
                step.title,
                style: const TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                  color: Color(0xFF1A1A1A),
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),

              // ── Description ──
              Text(
                step.description,
                style: const TextStyle(
                  fontSize: 14,
                  color: Color(0xFF666666),
                  height: 1.5,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 28),

              // ── Allow button ──
              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton(
                  onPressed: _isProcessing ? null : _handleAllow,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFF26522),
                    foregroundColor: Colors.white,
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                  child: _isProcessing
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            color: Colors.white,
                            strokeWidth: 2,
                          ),
                        )
                      : Text(
                          step.buttonText,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                ),
              ),
              const SizedBox(height: 12),

              // ── Skip link ──
              TextButton(
                onPressed: _isProcessing ? null : _handleSkip,
                child: Text(
                  step.skipText,
                  style: const TextStyle(
                    fontSize: 14,
                    color: Color(0xFF999999),
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Data class for step content.
// ─────────────────────────────────────────────────────────────────────────

class _OnboardingStep {
  final IconData icon;
  final String title;
  final String description;
  final String buttonText;
  final String skipText;

  const _OnboardingStep({
    required this.icon,
    required this.title,
    required this.description,
    required this.buttonText,
    required this.skipText,
  });
}
