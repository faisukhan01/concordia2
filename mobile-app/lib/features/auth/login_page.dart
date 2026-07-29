// Concordia College — Sign In
//
// Premium, branded sign-in experience:
//   • Curved orange gradient hero with logo badge + welcome headline
//   • White elevated form card overlapping the hero (layered depth)
//   • Focus-aware inputs with orange focus border + soft warm fill
//   • Full-width Concordia orange gradient sign-in button with arrow + glow
//   • Selector-based loading + error (no full-page rebuild → no refresh bug)
//   • Elegant outlined demo-login pills
//   • Subtle entrance animation (TweenAnimationBuilder) + AnimatedSwitcher
//
// Auth is delegated to AuthProvider.login(). On success the go_router
// redirect in app.dart moves the user into their role portal.
//
// Performance: we use Selector (not watch) so only the button + error
// banner rebuild when busy/error change — the rest of the page stays
// stable, preventing the "refresh then sign in" flicker.

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_theme.dart';
import 'auth_provider.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _identifier = TextEditingController();
  final _password = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _obscure = true;

  @override
  void dispose() {
    _identifier.dispose();
    _password.dispose();
    super.dispose();
  }

  void _submit() {
    if (_formKey.currentState?.validate() != true) return;
    // Do NOT unfocus — closing the keyboard causes a layout resize that
    // looks like a "page refresh". Let the keyboard close naturally when
    // navigation happens on success.
    context.read<AuthProvider>().login(
          _identifier.text.trim(),
          _password.text,
        );
  }

  void _quickFill(String id, String pw) {
    _identifier.text = id;
    _password.text = pw;
    setState(() => _obscure = false);
  }

  @override
  Widget build(BuildContext context) {
    final bottomPad = MediaQuery.of(context).viewInsets.bottom;

    return Scaffold(
      backgroundColor: AppColors.background,
      resizeToAvoidBottomInset: true,
      body: SafeArea(
        child: SingleChildScrollView(
          // Pad bottom so the content scrolls above the keyboard
          padding: EdgeInsets.only(bottom: bottomPad + 24),
          child: TweenAnimationBuilder<double>(
            tween: Tween(begin: 0.0, end: 1.0),
            duration: const Duration(milliseconds: 650),
            curve: Curves.easeOutCubic,
            builder: (context, t, child) {
              return Opacity(
                opacity: t,
                child: Transform.translate(
                  offset: Offset(0, 18 * (1 - t)),
                  child: child,
                ),
              );
            },
            child: Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // ── Hero header (curved orange gradient) ──
                  const _HeroHeader(),
                  // ── Form card (overlaps hero by 34px) ──
                  // Transform.translate only affects painting, so the 34px
                  // shift produces a natural breathing gap before the demo
                  // section below — no manual spacer needed.
                  Transform.translate(
                    offset: const Offset(0, -34),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      child: _FormCard(
                        identifierController: _identifier,
                        passwordController: _password,
                        obscure: _obscure,
                        onToggleObscure: () =>
                            setState(() => _obscure = !_obscure),
                        onSubmit: _submit,
                      ),
                    ),
                  ),
                  // ── Demo logins ──
                  _DemoSection(onQuickFill: _quickFill),
                  const SizedBox(height: 28),
                  // ── Footer ──
                  const Center(
                    child: Text(
                      '© 2025 Concordia College',
                      style: TextStyle(
                        fontSize: 11.5,
                        color: AppColors.textMuted,
                        letterSpacing: 0.3,
                      ),
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

// ── Hero header ──────────────────────────────────────────────────
class _HeroHeader extends StatelessWidget {
  const _HeroHeader();

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 300,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        gradient: appGradient(
          AppColors.primaryGradient,
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: const BorderRadius.only(
          bottomLeft: Radius.circular(36),
          bottomRight: Radius.circular(36),
        ),
      ),
      child: Stack(
        children: [
          // Decorative translucent blobs for depth
          Positioned(
            right: -52,
            top: -42,
            child: Container(
              width: 176,
              height: 176,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withValues(alpha: 0.10),
              ),
            ),
          ),
          Positioned(
            left: -38,
            bottom: 28,
            child: Container(
              width: 98,
              height: 98,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withValues(alpha: 0.07),
              ),
            ),
          ),
          // Content
          Positioned.fill(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(24, 38, 24, 40),
              child: Column(
                children: [
                  // Logo badge — white rounded card on the gradient
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 18, vertical: 11),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(15),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.16),
                          blurRadius: 22,
                          offset: const Offset(0, 8),
                        ),
                      ],
                    ),
                    child: Image.asset(
                      'assets/images/concordia-logo.png',
                      height: 40,
                      fit: BoxFit.contain,
                    ),
                  ),
                  const Spacer(),
                  // Welcome headline
                  const Text(
                    'Welcome back',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                      letterSpacing: -0.5,
                      height: 1.15,
                    ),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Your campus, one tap away.',
                    style: TextStyle(
                      fontSize: 14.5,
                      color: Colors.white70,
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 18),
                  // Feature credibility row
                  const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      _FeaturePill(
                          icon: Icons.check_circle_outline_rounded,
                          label: 'Attendance'),
                      SizedBox(width: 8),
                      _FeaturePill(
                          icon: Icons.account_balance_wallet_outlined,
                          label: 'Fees'),
                      SizedBox(width: 8),
                      _FeaturePill(
                          icon: Icons.insights_rounded, label: 'Results'),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _FeaturePill extends StatelessWidget {
  final IconData icon;
  final String label;
  const _FeaturePill({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(AppRadii.pill),
        border: Border.all(color: Colors.white.withValues(alpha: 0.22)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: Colors.white),
          const SizedBox(width: 5),
          Text(
            label,
            style: const TextStyle(
              fontSize: 11.5,
              fontWeight: FontWeight.w600,
              color: Colors.white,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Form card ────────────────────────────────────────────────────
class _FormCard extends StatelessWidget {
  final TextEditingController identifierController;
  final TextEditingController passwordController;
  final bool obscure;
  final VoidCallback onToggleObscure;
  final VoidCallback onSubmit;

  const _FormCard({
    required this.identifierController,
    required this.passwordController,
    required this.obscure,
    required this.onToggleObscure,
    required this.onSubmit,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(22, 26, 22, 24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(AppRadii.xl),
        boxShadow: AppShadows.floating,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // ── Identifier ──
          const _FieldLabel('Email or ID'),
          const SizedBox(height: 7),
          _TextField(
            controller: identifierController,
            hint: 'admin@concordia.edu.pk',
            icon: Icons.alternate_email_rounded,
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.next,
            validator: (v) => (v == null || v.trim().isEmpty)
                ? 'Enter your email or ID'
                : null,
          ),
          const SizedBox(height: 16),
          // ── Password ──
          const _FieldLabel('Password'),
          const SizedBox(height: 7),
          _TextField(
            controller: passwordController,
            hint: 'Enter your password',
            icon: Icons.lock_outline_rounded,
            obscure: obscure,
            textInputAction: TextInputAction.done,
            suffix: GestureDetector(
              onTap: onToggleObscure,
              child: Icon(
                obscure
                    ? Icons.visibility_off_outlined
                    : Icons.visibility_outlined,
                size: 20,
                color: AppColors.textMuted,
              ),
            ),
            validator: (v) =>
                (v == null || v.isEmpty) ? 'Enter your password' : null,
            onSubmitted: (_) => onSubmit(),
          ),
          const SizedBox(height: 12),
          // ── Forgot password ──
          Align(
            alignment: Alignment.centerRight,
            child: GestureDetector(
              onTap: () {},
              behavior: HitTestBehavior.opaque,
              child: const Padding(
                padding: EdgeInsets.only(top: 2, bottom: 2),
                child: Text(
                  'Forgot password?',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppColors.primary,
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 18),
          // ── Error banner (only rebuilds when error changes) ──
          Selector<AuthProvider, String?>(
            selector: (_, a) => a.error,
            builder: (_, error, __) {
              return AnimatedSwitcher(
                duration: const Duration(milliseconds: 250),
                switchInCurve: Curves.easeOut,
                switchOutCurve: Curves.easeIn,
                child: error == null
                    ? const SizedBox.shrink()
                    : Container(
                        key: const ValueKey('error-banner'),
                        margin: const EdgeInsets.only(bottom: 14),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 11),
                        decoration: BoxDecoration(
                          color: AppColors.dangerSoft,
                          borderRadius: BorderRadius.circular(AppRadii.sm),
                          border: Border.all(
                              color:
                                  AppColors.danger.withValues(alpha: 0.22)),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.error_outline_rounded,
                                size: 17, color: AppColors.danger),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                error,
                                style: const TextStyle(
                                  fontSize: 13,
                                  color: AppColors.danger,
                                  fontWeight: FontWeight.w500,
                                  height: 1.35,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
              );
            },
          ),
          // ── Sign in button (only rebuilds when busy changes) ──
          Selector<AuthProvider, bool>(
            selector: (_, a) => a.busy,
            builder: (_, busy, __) {
              return Container(
                width: double.infinity,
                height: 54,
                decoration: BoxDecoration(
                  gradient: appGradient(AppColors.primaryGradient),
                  borderRadius: BorderRadius.circular(AppRadii.md),
                  boxShadow: AppShadows.button,
                ),
                child: Material(
                  color: Colors.transparent,
                  child: InkWell(
                    onTap: busy ? null : onSubmit,
                    borderRadius: BorderRadius.circular(AppRadii.md),
                    child: Center(
                      child: AnimatedSwitcher(
                        duration: const Duration(milliseconds: 200),
                        child: busy
                            ? const SizedBox(
                                key: ValueKey('spinner'),
                                width: 22,
                                height: 22,
                                child: CircularProgressIndicator(
                                  color: Colors.white,
                                  strokeWidth: 2.5,
                                ),
                              )
                            : const Row(
                                key: ValueKey('label'),
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text(
                                    'Sign In',
                                    style: TextStyle(
                                      fontSize: 15.5,
                                      fontWeight: FontWeight.w600,
                                      letterSpacing: 0.3,
                                      color: Colors.white,
                                    ),
                                  ),
                                  SizedBox(width: 8),
                                  Icon(Icons.arrow_forward_rounded,
                                      size: 19, color: Colors.white),
                                ],
                              ),
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}

// ── Field label ──────────────────────────────────────────────────
class _FieldLabel extends StatelessWidget {
  final String text;
  const _FieldLabel(this.text);

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.w600,
        color: AppColors.textPrimary,
      ),
    );
  }
}

// ── Text field ───────────────────────────────────────────────────
class _TextField extends StatelessWidget {
  final TextEditingController controller;
  final String hint;
  final IconData icon;
  final bool obscure;
  final Widget? suffix;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final ValueChanged<String>? onSubmitted;
  final String? Function(String?)? validator;

  const _TextField({
    required this.controller,
    required this.hint,
    required this.icon,
    this.obscure = false,
    this.suffix,
    this.keyboardType,
    this.textInputAction,
    this.onSubmitted,
    this.validator,
  });

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      obscureText: obscure,
      keyboardType: keyboardType,
      textInputAction: textInputAction,
      onFieldSubmitted: onSubmitted,
      validator: validator,
      style: const TextStyle(
        fontSize: 15,
        color: AppColors.textPrimary,
        fontWeight: FontWeight.w500,
      ),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(
          fontSize: 15,
          color: AppColors.textMuted,
          fontWeight: FontWeight.w400,
        ),
        prefixIcon: Icon(icon, size: 20, color: AppColors.textMuted),
        suffixIcon: suffix,
        filled: true,
        fillColor: AppColors.surfaceAlt,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 15),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadii.md),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadii.md),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadii.md),
          borderSide: const BorderSide(color: AppColors.primary, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadii.md),
          borderSide: const BorderSide(color: AppColors.danger, width: 1),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadii.md),
          borderSide: const BorderSide(color: AppColors.danger, width: 1.5),
        ),
      ),
    );
  }
}

// ── Demo logins section ──────────────────────────────────────────
class _DemoSection extends StatelessWidget {
  final void Function(String id, String pw) onQuickFill;
  const _DemoSection({required this.onQuickFill});

  @override
  Widget build(BuildContext context) {
    final demos = <(String, IconData, String)>[
      ('Admin', Icons.shield_outlined, 'admin@concordia.edu.pk'),
      ('Accountant', Icons.calculate_outlined, 'accountant@concordia.edu.pk'),
      ('Teacher', Icons.school_outlined, 'teacher@concordia.edu.pk'),
      ('Student', Icons.person_outline, 'student@concordia.edu.pk'),
    ];
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 28),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(width: 24, height: 1, color: AppColors.border),
              const SizedBox(width: 10),
              const Text(
                'DEMO LOGINS',
                style: TextStyle(
                  fontSize: 10.5,
                  color: AppColors.textMuted,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 1.2,
                ),
              ),
              const SizedBox(width: 10),
              Container(width: 24, height: 1, color: AppColors.border),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            alignment: WrapAlignment.center,
            children: demos
                .map((d) => _DemoChip(
                      label: d.$1,
                      icon: d.$2,
                      onTap: () => onQuickFill(d.$3, 'concordia123'),
                    ))
                .toList(),
          ),
        ],
      ),
    );
  }
}

class _DemoChip extends StatelessWidget {
  final String label;
  final IconData icon;
  final VoidCallback onTap;
  const _DemoChip(
      {required this.label, required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(AppRadii.pill),
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadii.pill),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadii.pill),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 14, color: AppColors.primary),
              const SizedBox(width: 6),
              Text(
                label,
                style: const TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textPrimary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
