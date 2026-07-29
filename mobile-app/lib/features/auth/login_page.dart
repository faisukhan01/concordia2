// Concordia College — Sign In
// A premium, full-bleed login experience: warm brand gradient, floating
// decorative glows, a glassmorphism card, staggered entrance animations,
// quick-fill demo chips, and a feature highlight strip.
//
// Auth is delegated to AuthProvider.login() — on success the go_router
// redirect in app.dart moves the user into their role portal.

import 'dart:ui';
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
    with SingleTickerProviderStateMixin {
  final _identifier = TextEditingController();
  final _password = TextEditingController();
  bool _obscure = true;
  bool _touched = false;

  late final AnimationController _ac;
  late final Animation<double> _fade;
  late final Animation<Offset> _slideCard;
  late final Animation<Offset> _slideBrand;
  late final Animation<double> _glowPulse;

  @override
  void initState() {
    super.initState();
    _ac = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    );
    _fade = CurvedAnimation(parent: _ac, curve: Curves.easeOut);
    _slideBrand = Tween<Offset>(
      begin: const Offset(0, -0.18),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: _ac, curve: Curves.easeOutCubic));
    _slideCard = Tween<Offset>(
      begin: const Offset(0, 0.22),
      end: Offset.zero,
    ).animate(CurvedAnimation(
      parent: _ac,
      curve: const Interval(0.15, 1.0, curve: Curves.easeOutCubic),
    ));
    _glowPulse = Tween<double>(begin: 0.85, end: 1.0).animate(
      CurvedAnimation(parent: _ac, curve: Curves.easeInOutSine),
    )..addStatusListener((s) {
        if (s == AnimationStatus.completed) {
          _ac.repeat(reverse: true, min: 0.5, max: 1.0);
        }
      });
    _ac.forward();
  }

  @override
  void dispose() {
    _ac.dispose();
    _identifier.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _touched = true);
    if (_identifier.text.trim().isEmpty || _password.text.isEmpty) return;

    final auth = context.read<AuthProvider>();
    final ok = await auth.login(_identifier.text.trim(), _password.text);
    if (!ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(auth.error ?? 'Login failed'),
          backgroundColor: AppColors.danger,
          behavior: SnackBarBehavior.floating,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          margin: const EdgeInsets.fromLTRB(16, 0, 16, 24),
        ),
      );
    }
  }

  void _quickFill(String id) {
    setState(() {
      _identifier.text = id;
      _password.text = 'concordia123';
      _touched = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final h = MediaQuery.of(context).size.height;
    final topPad = MediaQuery.of(context).padding.top;

    return Scaffold(
      // Full-bleed warm gradient background.
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              Color(0xFFFF8C42), // warm amber
              Color(0xFFF26522), // brand orange
              Color(0xFFD4541E), // deep ember
            ],
            stops: [0.0, 0.55, 1.0],
          ),
        ),
        child: Stack(
          children: [
            // ── Decorative floating glows ──
            Positioned(
              top: -60,
              right: -50,
              child: FadeTransition(
                opacity: _fade,
                child: ScaleTransition(
                  scale: _glowPulse,
                  child: Container(
                    width: 220,
                    height: 220,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: Colors.white.withOpacity(0.14),
                    ),
                  ),
                ),
              ),
            ),
            Positioned(
              top: h * 0.30,
              left: -80,
              child: FadeTransition(
                opacity: _fade,
                child: Container(
                  width: 180,
                  height: 180,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: Colors.white.withOpacity(0.08),
                  ),
                ),
              ),
            ),
            Positioned(
              bottom: -40,
              right: -30,
              child: FadeTransition(
                opacity: _fade,
                child: Container(
                  width: 160,
                  height: 160,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: const Color(0xFFFFD3B8).withOpacity(0.18),
                  ),
                ),
              ),
            ),

            // ── Scrollable content ──
            SafeArea(
              child: SingleChildScrollView(
                physics: const ClampingScrollPhysics(),
                padding: EdgeInsets.fromLTRB(24, topPad > 0 ? 28 : 40, 24, 32),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Brand header
                    SlideTransition(
                      position: _slideBrand,
                      child: FadeTransition(
                        opacity: _fade,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            // Glowing logo tile
                            Center(
                              child: Container(
                                width: 92,
                                height: 92,
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(26),
                                  boxShadow: [
                                    BoxShadow(
                                      color:
                                          Colors.black.withOpacity(0.18),
                                      blurRadius: 30,
                                      offset: const Offset(0, 14),
                                    ),
                                  ],
                                ),
                                child: const Icon(
                                  Icons.school_rounded,
                                  size: 50,
                                  color: AppColors.primary,
                                ),
                              ),
                            ),
                            const SizedBox(height: 22),
                            Center(
                              child: Text(
                                'Concordia College',
                                textAlign: TextAlign.center,
                                style: GoogleFontsText.boldTitle,
                              ),
                            ),
                            const SizedBox(height: 6),
                            Center(
                              child: Text(
                                'Management Portal',
                                textAlign: TextAlign.center,
                                style: GoogleFontsText.subtitle,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),

                    SizedBox(height: h * 0.04),

                    // Glassmorphism login card
                    SlideTransition(
                      position: _slideCard,
                      child: FadeTransition(
                        opacity: CurvedAnimation(
                          parent: _ac,
                          curve: const Interval(0.2, 1.0),
                        ),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(28),
                          child: BackdropFilter(
                            filter: ImageFilter.blur(
                                sigmaX: 18, sigmaY: 18),
                            child: Container(
                              padding: const EdgeInsets.fromLTRB(
                                  22, 28, 22, 26),
                              decoration: BoxDecoration(
                                color: Colors.white.withOpacity(0.96),
                                borderRadius: BorderRadius.circular(28),
                                border: Border.all(
                                  color: Colors.white.withOpacity(0.6),
                                  width: 1.2,
                                ),
                                boxShadow: [
                                  BoxShadow(
                                    color: Colors.black.withOpacity(0.14),
                                    blurRadius: 40,
                                    offset: const Offset(0, 20),
                                  ),
                                ],
                              ),
                              child: Column(
                                crossAxisAlignment:
                                    CrossAxisAlignment.stretch,
                                children: [
                                  // Welcome heading
                                  Row(
                                    children: [
                                      Container(
                                        width: 6,
                                        height: 26,
                                        decoration: BoxDecoration(
                                          color: AppColors.primary,
                                          borderRadius:
                                              BorderRadius.circular(4),
                                        ),
                                      ),
                                      const SizedBox(width: 10),
                                      Text(
                                        'Welcome back',
                                        style: TextStyle(
                                          fontSize: 22,
                                          fontWeight: FontWeight.w800,
                                          color: AppColors.textPrimary,
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    'Sign in to continue to your dashboard',
                                    style: TextStyle(
                                      fontSize: 13.5,
                                      color: AppColors.textSecondary,
                                    ),
                                  ),
                                  const SizedBox(height: 24),

                                  // Identifier
                                  _Label('Email, Roll No, or Teacher ID'),
                                  const SizedBox(height: 8),
                                  TextField(
                                    controller: _identifier,
                                    keyboardType:
                                        TextInputType.emailAddress,
                                    textInputAction: TextInputAction.next,
                                    autocorrect: false,
                                    decoration: _fieldDecoration(
                                      hint: 'e.g. admin@concordia.edu.pk',
                                      icon: Icons.alternate_email,
                                      error: _touched &&
                                              _identifier.text
                                                  .trim()
                                                  .isEmpty
                                          ? 'Required'
                                          : null,
                                    ),
                                  ),
                                  const SizedBox(height: 16),

                                  // Password
                                  _Label('Password'),
                                  const SizedBox(height: 8),
                                  TextField(
                                    controller: _password,
                                    obscureText: _obscure,
                                    textInputAction: TextInputAction.go,
                                    onSubmitted: (_) => _submit(),
                                    decoration: _fieldDecoration(
                                      hint: 'Enter password',
                                      icon: Icons.lock_outline,
                                      error: _touched &&
                                              _password.text.isEmpty
                                          ? 'Required'
                                          : null,
                                      suffix: IconButton(
                                        icon: Icon(
                                          _obscure
                                              ? Icons
                                                  .visibility_off_outlined
                                              : Icons
                                                  .visibility_outlined,
                                          size: 20,
                                          color: AppColors.textMuted,
                                        ),
                                        onPressed: () => setState(
                                            () => _obscure = !_obscure),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: 22),

                                  // Submit
                                  SizedBox(
                                    height: 54,
                                    child: ElevatedButton(
                                      onPressed:
                                          auth.busy ? null : _submit,
                                      style: ElevatedButton.styleFrom(
                                        backgroundColor: AppColors.primary,
                                        foregroundColor: Colors.white,
                                        elevation: 0,
                                        shape: RoundedRectangleBorder(
                                          borderRadius:
                                              BorderRadius.circular(16),
                                        ),
                                      ),
                                      child: auth.busy
                                          ? const SizedBox(
                                              width: 24,
                                              height: 24,
                                              child:
                                                  CircularProgressIndicator(
                                                color: Colors.white,
                                                strokeWidth: 2.8,
                                              ),
                                            )
                                          : Row(
                                              mainAxisAlignment:
                                                  MainAxisAlignment
                                                      .center,
                                              children: [
                                                const Text(
                                                  'Sign In',
                                                  style: TextStyle(
                                                    fontSize: 16.5,
                                                    fontWeight:
                                                        FontWeight.w700,
                                                    letterSpacing: 0.3,
                                                  ),
                                                ),
                                                const SizedBox(width: 8),
                                                const Icon(
                                                    Icons
                                                        .arrow_forward_rounded,
                                                    size: 20),
                                              ],
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

                    const SizedBox(height: 20),

                    // Quick-fill demo chips
                    FadeTransition(
                      opacity: CurvedAnimation(
                        parent: _ac,
                        curve: const Interval(0.45, 1.0),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Center(
                            child: Text(
                              'Quick demo access — tap to fill',
                              style: TextStyle(
                                fontSize: 12,
                                color: Colors.white.withOpacity(0.85),
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ),
                          const SizedBox(height: 12),
                          Wrap(
                            alignment: WrapAlignment.center,
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              _demoChip('Admin', 'admin@concordia.edu.pk'),
                              _demoChip('Accountant',
                                  'accountant@concordia.edu.pk'),
                              _demoChip('Admissions',
                                  'admissions@concordia.edu.pk'),
                              _demoChip('Academic',
                                  'academics@concordia.edu.pk'),
                            ],
                          ),
                          const SizedBox(height: 10),
                          Center(
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 12, vertical: 6),
                              decoration: BoxDecoration(
                                color: Colors.white.withOpacity(0.16),
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: Text(
                                'Password for all demos: concordia123',
                                style: TextStyle(
                                  fontSize: 11.5,
                                  color: Colors.white.withOpacity(0.95),
                                  fontStyle: FontStyle.italic,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 22),

                    // Feature highlights strip
                    FadeTransition(
                      opacity: CurvedAnimation(
                        parent: _ac,
                        curve: const Interval(0.6, 1.0),
                      ),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 14),
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.12),
                          borderRadius: BorderRadius.circular(18),
                          border: Border.all(
                            color: Colors.white.withOpacity(0.2),
                          ),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceAround,
                          children: const [
                            _FeaturePill(
                                icon: Icons.dashboard_rounded,
                                label: 'Dashboards'),
                            _FeaturePill(
                                icon: Icons.receipt_long_rounded,
                                label: 'Fees'),
                            _FeaturePill(
                                icon: Icons.check_circle_rounded,
                                label: 'Attendance'),
                            _FeaturePill(
                                icon: Icons.grade_rounded,
                                label: 'Results'),
                          ],
                        ),
                      ),
                    ),

                    const SizedBox(height: 18),
                    Center(
                      child: Text(
                        'Students & Teachers: use your Roll # / Teacher ID',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 11.5,
                          color: Colors.white.withOpacity(0.8),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  InputDecoration _fieldDecoration({
    required String hint,
    required IconData icon,
    String? error,
    Widget? suffix,
  }) {
    return InputDecoration(
      hintText: hint,
      hintStyle: const TextStyle(color: AppColors.textMuted, fontSize: 14),
      prefixIcon: Icon(icon, size: 20, color: AppColors.primary),
      suffixIcon: suffix,
      errorText: error,
      filled: true,
      fillColor: const Color(0xFFFFF6EE),
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: AppColors.border, width: 1.2),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide:
            const BorderSide(color: AppColors.primary, width: 2),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: AppColors.danger, width: 1.2),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: AppColors.danger, width: 2),
      ),
    );
  }

  Widget _demoChip(String label, String email) {
    return GestureDetector(
      onTap: () => _quickFill(email),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(22),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.12),
              blurRadius: 10,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.bolt_rounded, size: 13, color: AppColors.primary),
            const SizedBox(width: 5),
            Text(
              label,
              style: TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w700,
                color: AppColors.primary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Label extends StatelessWidget {
  final String text;
  const _Label(this.text);

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.w600,
        color: AppColors.textSecondary,
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
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 20, color: Colors.white),
        const SizedBox(height: 4),
        Text(
          label,
          style: TextStyle(
            fontSize: 11,
            color: Colors.white.withOpacity(0.92),
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

// White-on-orange text styles used in the hero header.
class GoogleFontsText {
  static const boldTitle = TextStyle(
    fontSize: 28,
    fontWeight: FontWeight.w800,
    color: Colors.white,
    letterSpacing: -0.3,
    height: 1.1,
    shadows: [
      Shadow(
        color: Color(0x66000000),
        blurRadius: 14,
        offset: Offset(0, 4),
      ),
    ],
  );

  static const subtitle = TextStyle(
    fontSize: 14.5,
    color: Colors.white70,
    fontWeight: FontWeight.w500,
    letterSpacing: 0.4,
  );
}
