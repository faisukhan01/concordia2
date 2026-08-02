// Concordia College — Sign In
//
// Clean, focused, premium sign-in experience:
//   • App icon (orange squircle) + app name + short subtitle
//   • Single white elevated form card with comfortable padding
//   • Focus-aware inputs with orange focus border + soft warm fill
//   • Full-width Concordia orange sign-in button (no gradient)
//   • Selector-based loading + error (no full-page rebuild → no refresh bug)
//   • Subtle demo-login chip row (secondary, soft-orange pill chips)
//   • Entrance animation (TweenAnimationBuilder) fade + slide up
//
// Auth is delegated to AuthProvider.login(). On success the go_router
// redirect in app.dart moves the user into their role portal.

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
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const SizedBox(height: 60),
                    // ── App icon (orange squircle with soft shadow) ──
                    Center(
                      child: Container(
                        width: 88,
                        height: 88,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(22),
                          boxShadow: [
                            BoxShadow(
                              color: AppColors.primary.withOpacity(0.15),
                              blurRadius: 24,
                              offset: const Offset(0, 8),
                            ),
                          ],
                        ),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(22),
                          child: Image.asset(
                            'assets/images/app-icon.png',
                            fit: BoxFit.cover,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 24),
                    // ── App name ──
                    const Text(
                      'Concordia College',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 26,
                        fontWeight: FontWeight.w700,
                        color: AppColors.textPrimary,
                        letterSpacing: -0.3,
                      ),
                    ),
                    const SizedBox(height: 6),
                    // ── Subtitle ──
                    const Text(
                      'Sign in to continue',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 14,
                        color: AppColors.textMuted,
                        fontWeight: FontWeight.w400,
                      ),
                    ),
                    const SizedBox(height: 36),
                    // ── Form card ──
                    _FormCard(
                      identifierController: _identifier,
                      passwordController: _password,
                      obscure: _obscure,
                      onToggleObscure: () =>
                          setState(() => _obscure = !_obscure),
                      onSubmit: _submit,
                    ),
                    const SizedBox(height: 28),
                    // ── Demo logins (subtle) ──
                    _DemoSection(onQuickFill: _quickFill),
                    const SizedBox(height: 24),
                    // ── Footer ──
                    const Center(
                      child: Text(
                        '© 2025 Concordia College',
                        style: TextStyle(
                          fontSize: 11,
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
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(AppRadii.xl),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 16,
            offset: const Offset(0, 4),
          ),
          BoxShadow(
            color: AppColors.primary.withOpacity(0.06),
            blurRadius: 24,
            offset: const Offset(0, 8),
          ),
        ],
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
          const SizedBox(height: 20),
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
                                  AppColors.danger.withOpacity(0.22)),
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
                  color: AppColors.primary,
                  borderRadius: BorderRadius.circular(AppRadii.md),
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.primary.withOpacity(0.25),
                      blurRadius: 12,
                      offset: const Offset(0, 6),
                    ),
                  ],
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
    return Column(
      children: [
        Text(
          'Quick Demo Access',
          style: TextStyle(
            fontSize: 11,
            color: AppColors.textMuted.withOpacity(0.8),
            fontWeight: FontWeight.w500,
            letterSpacing: 0.4,
          ),
        ),
        const SizedBox(height: 10),
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
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(AppRadii.pill),
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadii.pill),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: AppColors.primarySoft,
            borderRadius: BorderRadius.circular(AppRadii.pill),
            border: Border.all(
              color: AppColors.primary.withOpacity(0.15),
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 14, color: AppColors.primary),
              const SizedBox(width: 6),
              Text(
                label,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: AppColors.primaryDark,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
