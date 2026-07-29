// Concordia College — Premium Sign In
//
// A pro-level, eye-catching login experience:
//   • Split visual: branded orange gradient header with Concordia logo + tagline
//   • Floating glass-style login card with soft layered shadows
//   • Refined inputs with focus animations + iconography
//   • Smooth staged entrance animation (logo → card → fields → button)
//   • Quick-fill demo chips for each role
//   • Inline error states + success feedback
//   • "A project of Beaconhouse" footer
//
// Auth is delegated to AuthProvider.login() — on success the go_router
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

class _LoginPageState extends State<LoginPage>
    with TickerProviderStateMixin {
  final _identifier = TextEditingController();
  final _password = TextEditingController();
  final _identifierFocus = FocusNode();
  final _passwordFocus = FocusNode();

  bool _obscure = true;
  bool _idHasText = false;
  bool _pwHasText = false;

  late final AnimationController _ac;
  late final Animation<double> _fade;
  late final Animation<Offset> _slide;

  @override
  void initState() {
    super.initState();
    _identifier.addListener(() {
      final v = _identifier.text.isNotEmpty;
      if (v != _idHasText) setState(() => _idHasText = v);
    });
    _password.addListener(() {
      final v = _password.text.isNotEmpty;
      if (v != _pwHasText) setState(() => _pwHasText = v);
    });
    _ac = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 950),
    );
    _fade = CurvedAnimation(parent: _ac, curve: Curves.easeOut);
    _slide = Tween<Offset>(
      begin: const Offset(0, 0.06),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: _ac, curve: Curves.easeOutCubic));
    WidgetsBinding.instance.addPostFrameCallback((_) => _ac.forward());
  }

  @override
  void dispose() {
    _ac.dispose();
    _identifier.dispose();
    _password.dispose();
    _identifierFocus.dispose();
    _passwordFocus.dispose();
    super.dispose();
  }

  void _submit() {
    final id = _identifier.text.trim();
    final pw = _password.text;
    if (id.isEmpty || pw.isEmpty) return;
    FocusScope.of(context).unfocus();
    context.read<AuthProvider>().login(id, pw);
  }

  void _quickFill(String id, String pw) {
    _identifier.text = id;
    _password.text = pw;
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final screen = MediaQuery.of(context).size;
    final topPad = MediaQuery.of(context).padding.top;

    return Scaffold(
      backgroundColor: AppColors.background,
      body: Container(
        width: double.infinity,
        height: double.infinity,
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              Color(0xFFFFF6EE),
              Color(0xFFFCFBF9),
              Color(0xFFFFFFFF),
            ],
            stops: [0.0, 0.45, 1.0],
          ),
        ),
        child: SafeArea(
          child: FadeTransition(
            opacity: _fade,
            child: SlideTransition(
              position: _slide,
              child: SingleChildScrollView(
                physics: const ClampingScrollPhysics(),
                child: ConstrainedBox(
                  constraints: BoxConstraints(
                    minHeight: screen.height - topPad - MediaQuery.of(context).padding.bottom,
                  ),
                  child: Column(
                    children: [
                      const _BrandHeader(),
                      const SizedBox(height: 8),
                      _LoginCard(
                        identifier: _identifier,
                        password: _password,
                        identifierFocus: _identifierFocus,
                        passwordFocus: _passwordFocus,
                        obscure: _obscure,
                        idHasText: _idHasText,
                        pwHasText: _pwHasText,
                        busy: auth.busy,
                        error: auth.error,
                        onToggleObscure: () =>
                            setState(() => _obscure = !_obscure),
                        onSubmit: _submit,
                      ),
                      const SizedBox(height: 22),
                      _QuickFill(onPick: _quickFill),
                      const SizedBox(height: 22),
                      const _BrandFooter(),
                      const SizedBox(height: 20),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ── Brand header (orange gradient banner with logo) ─────────────
class _BrandHeader extends StatelessWidget {
  const _BrandHeader();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(24, 18, 24, 28),
      child: Column(
        children: [
          // Logo in a floating white card for premium feel
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 14),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(AppRadii.xl),
              boxShadow: AppShadows.floating,
            ),
            child: Image.asset(
              'assets/images/concordia-logo.png',
              height: 52,
              fit: BoxFit.contain,
            ),
          ),
          const SizedBox(height: 22),
          ShaderMask(
            shaderCallback: (bounds) => appGradient(AppColors.primaryGradient)
                .createShader(bounds),
            child: const Text(
              'Management Portal',
              style: TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.w800,
                color: Colors.white,
                letterSpacing: -0.5,
              ),
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'Sign in to access your dashboard, records, and tools.',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 13.5,
              color: AppColors.textSecondary,
              height: 1.45,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Login card ──────────────────────────────────────────────────
class _LoginCard extends StatelessWidget {
  final TextEditingController identifier;
  final TextEditingController password;
  final FocusNode identifierFocus;
  final FocusNode passwordFocus;
  final bool obscure;
  final bool idHasText;
  final bool pwHasText;
  final bool busy;
  final String? error;
  final VoidCallback onToggleObscure;
  final VoidCallback onSubmit;

  const _LoginCard({
    required this.identifier,
    required this.password,
    required this.identifierFocus,
    required this.passwordFocus,
    required this.obscure,
    required this.idHasText,
    required this.pwHasText,
    required this.busy,
    required this.error,
    required this.onToggleObscure,
    required this.onSubmit,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.fromLTRB(24, 28, 24, 26),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(AppRadii.xl),
          boxShadow: AppShadows.floating,
          border: Border.all(color: AppColors.border, width: 1),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Welcome row with small accent dot
            Row(
              children: [
                Container(
                  width: 6,
                  height: 22,
                  decoration: BoxDecoration(
                    gradient: appGradient(AppColors.primaryGradient),
                    borderRadius: BorderRadius.circular(3),
                  ),
                ),
                const SizedBox(width: 10),
                const Text(
                  'Welcome Back',
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                    color: AppColors.textPrimary,
                    letterSpacing: -0.4,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            const Text(
              'Enter your credentials to continue',
              style: TextStyle(
                fontSize: 13.5,
                color: AppColors.textSecondary,
              ),
            ),
            const SizedBox(height: 26),

            // Identifier field
            _FieldLabel(text: 'Email or ID'),
            const SizedBox(height: 7),
            _PremiumField(
              controller: identifier,
              focusNode: identifierFocus,
              hint: 'admin@concordia.edu.pk',
              icon: Icons.person_outline_rounded,
              hasText: idHasText,
              keyboardType: TextInputType.emailAddress,
              textInputAction: TextInputAction.next,
              onSubmitted: (_) => passwordFocus.requestFocus(),
            ),
            const SizedBox(height: 18),

            // Password field
            _FieldLabel(text: 'Password'),
            const SizedBox(height: 7),
            _PremiumField(
              controller: password,
              focusNode: passwordFocus,
              hint: 'Enter your password',
              icon: Icons.lock_outline_rounded,
              hasText: pwHasText,
              obscure: obscure,
              suffix: GestureDetector(
                onTap: onToggleObscure,
                child: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 180),
                  child: Icon(
                    obscure
                        ? Icons.visibility_off_outlined
                        : Icons.visibility_outlined,
                    key: ValueKey(obscure),
                    size: 20,
                    color: AppColors.textMuted,
                  ),
                ),
              ),
              textInputAction: TextInputAction.done,
              onSubmitted: (_) => onSubmit(),
            ),
            const SizedBox(height: 14),

            // Forgot password (decorative — no recovery flow in MVP)
            Align(
              alignment: Alignment.centerRight,
              child: GestureDetector(
                onTap: () {},
                child: const Text(
                  'Forgot password?',
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                    color: AppColors.primary,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 18),

            // Error banner
            if (error != null) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(
                    horizontal: 14, vertical: 11),
                decoration: BoxDecoration(
                  color: AppColors.dangerSoft,
                  borderRadius: BorderRadius.circular(AppRadii.md),
                  border:
                      Border.all(color: AppColors.danger.withValues(alpha: 0.25)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.error_outline_rounded,
                        size: 18, color: AppColors.danger),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        error!,
                        style: const TextStyle(
                          fontSize: 13,
                          color: AppColors.danger,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
            ],

            // Sign-in button
            SizedBox(
              width: double.infinity,
              height: 54,
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 220),
                child: DecoratedBox(
                  key: ValueKey(busy),
                  decoration: BoxDecoration(
                    gradient: appGradient(AppColors.primaryGradient),
                    borderRadius: BorderRadius.circular(AppRadii.md),
                    boxShadow: AppShadows.button,
                  ),
                  child: Material(
                    color: Colors.transparent,
                    child: InkWell(
                      borderRadius: BorderRadius.circular(AppRadii.md),
                      onTap: busy ? null : onSubmit,
                      child: Center(
                        child: busy
                            ? const SizedBox(
                                width: 22,
                                height: 22,
                                child: CircularProgressIndicator(
                                  color: Colors.white,
                                  strokeWidth: 2.5,
                                ),
                              )
                            : const Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text(
                                    'Sign In',
                                    style: TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w700,
                                      color: Colors.white,
                                      letterSpacing: 0.3,
                                    ),
                                  ),
                                  SizedBox(width: 8),
                                  Icon(Icons.arrow_forward_rounded,
                                      size: 18, color: Colors.white),
                                ],
                              ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FieldLabel extends StatelessWidget {
  final String text;
  const _FieldLabel({required this.text});

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

class _PremiumField extends StatelessWidget {
  final TextEditingController controller;
  final FocusNode? focusNode;
  final String hint;
  final IconData icon;
  final bool hasText;
  final bool obscure;
  final Widget? suffix;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final ValueChanged<String>? onSubmitted;

  const _PremiumField({
    required this.controller,
    this.focusNode,
    required this.hint,
    required this.icon,
    required this.hasText,
    this.obscure = false,
    this.suffix,
    this.keyboardType,
    this.textInputAction,
    this.onSubmitted,
  });

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 180),
      decoration: BoxDecoration(
        color: AppColors.surfaceAlt,
        borderRadius: BorderRadius.circular(AppRadii.md),
        border: Border.all(
          color: hasText ? AppColors.primary.withValues(alpha: 0.4) : AppColors.border,
          width: hasText ? 1.5 : 1,
        ),
      ),
      child: TextField(
        controller: controller,
        focusNode: focusNode,
        obscureText: obscure,
        keyboardType: keyboardType,
        textInputAction: textInputAction,
        onSubmitted: onSubmitted,
        style: const TextStyle(
          fontSize: 15,
          color: AppColors.textPrimary,
          fontWeight: FontWeight.w500,
        ),
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: TextStyle(
            fontSize: 15,
            color: AppColors.textMuted,
            fontWeight: FontWeight.w400,
          ),
          prefixIcon: AnimatedSwitcher(
            duration: const Duration(milliseconds: 180),
            child: Icon(
              icon,
              key: ValueKey(hasText),
              size: 20,
              color: hasText ? AppColors.primary : AppColors.textMuted,
            ),
          ),
          suffixIcon: suffix,
          filled: true,
          fillColor: Colors.transparent,
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 14, vertical: 15),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(AppRadii.md),
            borderSide: BorderSide.none,
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(AppRadii.md),
            borderSide: BorderSide.none,
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(AppRadii.md),
            borderSide: const BorderSide(color: AppColors.primary, width: 1.5),
          ),
        ),
      ),
    );
  }
}

// ── Quick fill demo chips ───────────────────────────────────────
class _QuickFill extends StatelessWidget {
  final void Function(String id, String pw) onPick;
  const _QuickFill({required this.onPick});

  @override
  Widget build(BuildContext context) {
    final demos = [
      ('Admin', Icons.shield_outlined, 'admin@concordia.edu.pk'),
      ('Accountant', Icons.calculate_outlined, 'accountant@concordia.edu.pk'),
      ('Teacher', Icons.school_outlined, 'teacher@concordia.edu.pk'),
      ('Student', Icons.person_outline, 'student@concordia.edu.pk'),
    ];
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(width: 28, height: 1, color: AppColors.border),
              const SizedBox(width: 10),
              const Text(
                'QUICK DEMO LOGIN',
                style: TextStyle(
                  fontSize: 10.5,
                  color: AppColors.textMuted,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.4,
                ),
              ),
              const SizedBox(width: 10),
              Container(width: 28, height: 1, color: AppColors.border),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            alignment: WrapAlignment.center,
            children: [
              for (final d in demos)
                _DemoChip(
                  label: d.$1,
                  icon: d.$2,
                  onTap: () => onPick(d.$3, 'concordia123'),
                ),
            ],
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
  const _DemoChip({required this.label, required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(AppRadii.pill),
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadii.pill),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadii.pill),
            border: Border.all(color: AppColors.border),
            boxShadow: AppShadows.subtle,
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

// ── Brand footer ────────────────────────────────────────────────
class _BrandFooter extends StatelessWidget {
  const _BrandFooter();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text(
              'A project of ',
              style: TextStyle(
                fontSize: 12.5,
                color: AppColors.textMuted,
                fontWeight: FontWeight.w500,
              ),
            ),
            Text(
              'Beaconhouse',
              style: TextStyle(
                fontSize: 12.5,
                color: AppColors.textSecondary,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        const Text(
          '© 2025 Concordia College',
          style: TextStyle(
            fontSize: 11,
            color: AppColors.textMuted,
            fontWeight: FontWeight.w400,
          ),
        ),
      ],
    );
  }
}
