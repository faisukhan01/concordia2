// Concordia College — Sign In
//
// Matches the web app's mobile sign-in page EXACTLY:
//   • Full-page campus photograph background (assets/images/campus.jpg)
//   • Gradient overlays: left-to-right dark gradient, bottom vignette
//   • Centered frosted glass card (backdrop-blur-xl + backdrop-saturate-150)
//   • Logo in white pill container
//   • "Sign in" heading + subtitle
//   • Username / Password inputs with UserIcon/Lock + eye toggle
//   • Orange login button with ArrowRight icon
//   • Student/Teacher hint text
//   • Copyright footer
//
// Uses ClipRRect + BackdropFilter from dart:ui for the frosted glass.
// Uses withOpacity() for Flutter 3.24 compatibility.

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

class _LoginPageState extends State<LoginPage> {
  final _identifier = TextEditingController();
  final _password = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _obscure = true;
  final _identifierFocus = FocusNode();
  final _passwordFocus = FocusNode();

  @override
  void initState() {
    super.initState();
    _identifierFocus.addListener(() => setState(() {}));
    _passwordFocus.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _identifier.dispose();
    _password.dispose();
    _identifierFocus.dispose();
    _passwordFocus.dispose();
    super.dispose();
  }

  void _submit() {
    if (_formKey.currentState?.validate() != true) return;
    context.read<AuthProvider>().login(
          _identifier.text.trim(),
          _password.text,
        );
  }

  @override
  Widget build(BuildContext context) {
    final bottomPad = MediaQuery.of(context).viewInsets.bottom;
    final size = MediaQuery.of(context).size;

    return Scaffold(
      backgroundColor: Colors.black,
      resizeToAvoidBottomInset: true,
      body: Stack(
        fit: StackFit.expand,
        children: [
          // ── Full-page campus photograph background ──
          Image.asset(
            'assets/images/campus.jpg',
            fit: BoxFit.cover,
            width: size.width,
            height: size.height,
          ),

          // ── Left-to-right dark gradient ──
          // bg-gradient-to-r from-black/15 via-transparent to-transparent
          Container(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.centerLeft,
                end: Alignment.centerRight,
                colors: [
                  Colors.black.withOpacity(0.15),
                  Colors.transparent,
                  Colors.transparent,
                ],
                stops: const [0.0, 0.4, 1.0],
              ),
            ),
          ),

          // ── Bottom vignette ──
          // bg-gradient-to-t from-black/60 to-transparent, h-32
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            height: 128,
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.bottomCenter,
                  end: Alignment.topCenter,
                  colors: [
                    Colors.black.withOpacity(0.60),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),

          // ── Main content ──
          SafeArea(
            child: SingleChildScrollView(
              padding: EdgeInsets.only(
                left: 24,
                right: 24,
                top: 0,
                bottom: bottomPad + 24,
              ),
              child: Center(
                child: TweenAnimationBuilder<double>(
                  tween: Tween(begin: 0.0, end: 1.0),
                  duration: const Duration(milliseconds: 500),
                  curve: Curves.easeOutCubic,
                  builder: (context, t, child) {
                    return Opacity(
                      opacity: t,
                      child: Transform.translate(
                        offset: Offset(0, 20 * (1 - t)),
                        child: child,
                      ),
                    );
                  },
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 400),
                    child: Form(
                      key: _formKey,
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          // ── Frosted glass card ──
                          ClipRRect(
                            borderRadius: BorderRadius.circular(AppRadii.xxl),
                            child: BackdropFilter(
                              filter: ImageFilter.blur(
                                sigmaX: 40,
                                sigmaY: 40,
                              ),
                              child: Container(
                                width: double.infinity,
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 32,
                                  vertical: 40,
                                ),
                                decoration: BoxDecoration(
                                  // rgba(255, 255, 255, 0.20)
                                  color: Colors.white.withOpacity(0.20),
                                  borderRadius:
                                      BorderRadius.circular(AppRadii.xxl),
                                  // ring-1 ring-white/60
                                  border: Border.all(
                                    color: Colors.white.withOpacity(0.60),
                                    width: 1,
                                  ),
                                  // shadow-2xl shadow-black/30
                                  boxShadow: [
                                    BoxShadow(
                                      color: Colors.black.withOpacity(0.30),
                                      blurRadius: 40,
                                      offset: const Offset(0, 20),
                                      spreadRadius: -4,
                                    ),
                                  ],
                                ),
                                child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    // ── Logo in white pill container ──
                                    // rounded-xl bg-white px-5 py-3 shadow-lg shadow-black/10
                                    Container(
                                      margin: const EdgeInsets.only(bottom: 32),
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 20,
                                        vertical: 12,
                                      ),
                                      decoration: BoxDecoration(
                                        color: Colors.white,
                                        borderRadius: BorderRadius.circular(
                                            AppRadii.xl),
                                        boxShadow: [
                                          BoxShadow(
                                            color:
                                                Colors.black.withOpacity(0.10),
                                            blurRadius: 16,
                                            offset: const Offset(0, 4),
                                          ),
                                        ],
                                      ),
                                      child: Image.asset(
                                        'assets/images/concordia-logo.png',
                                        height: 48,
                                      ),
                                    ),

                                    // ── "Sign in" heading ──
                                    // text-[26px] leading-tight font-bold text-white tracking-tight text-center drop-shadow-sm
                                    const Text(
                                      'Sign in',
                                      textAlign: TextAlign.center,
                                      style: TextStyle(
                                        fontSize: 26,
                                        fontWeight: FontWeight.w700,
                                        color: Colors.white,
                                        letterSpacing: -0.3,
                                        height: 1.2,
                                        shadows: [
                                          Shadow(
                                            color: Colors.black54,
                                            blurRadius: 4,
                                          ),
                                        ],
                                      ),
                                    ),

                                    // ── Subtitle ──
                                    // text-sm text-white/70 mt-1.5 text-center
                                    const SizedBox(height: 6),
                                    const Text(
                                      'Use your Concordia account to continue',
                                      textAlign: TextAlign.center,
                                      style: TextStyle(
                                        fontSize: 14,
                                        color: Color(0xB3FFFFFF),
                                        fontWeight: FontWeight.w400,
                                      ),
                                    ),

                                    // ── Form ──
                                    // mt-7 space-y-3.5
                                    const SizedBox(height: 28),

                                    // ── Username input ──
                                    // h-12 pl-11 pr-4 rounded-xl border-white/20 bg-white/10 text-white text-sm
                                    // focus: border-[#F26522] + ring-2 ring-[#F26522]/30
                                    _GlassTextField(
                                      controller: _identifier,
                                      focusNode: _identifierFocus,
                                      hint: 'Enter Username',
                                      icon: Icons.person_outline,
                                      textInputAction: TextInputAction.next,
                                      validator: (v) => (v == null ||
                                              v.trim().isEmpty)
                                          ? 'Enter your username'
                                          : null,
                                    ),

                                    const SizedBox(height: 14),

                                    // ── Password input ──
                                    // Same as username + eye toggle on right
                                    _GlassTextField(
                                      controller: _password,
                                      focusNode: _passwordFocus,
                                      hint: 'Enter Password',
                                      icon: Icons.lock_outline,
                                      obscure: _obscure,
                                      textInputAction: TextInputAction.done,
                                      suffix: GestureDetector(
                                        onTap: () => setState(
                                            () => _obscure = !_obscure),
                                        child: Icon(
                                          _obscure
                                              ? Icons.visibility_off_outlined
                                              : Icons.visibility_outlined,
                                          size: 18,
                                          color: Colors.white.withOpacity(0.50),
                                        ),
                                      ),
                                      validator: (v) => (v == null ||
                                              v.isEmpty)
                                          ? 'Enter your password'
                                          : null,
                                      onSubmitted: (_) => _submit(),
                                    ),

                                    const SizedBox(height: 14),

                                    // ── Error banner ──
                                    Selector<AuthProvider, String?>(
                                      selector: (_, a) => a.error,
                                      builder: (_, error, __) {
                                        if (error == null) {
                                          return const SizedBox.shrink();
                                        }
                                        return Container(
                                          margin:
                                              const EdgeInsets.only(bottom: 14),
                                          padding: const EdgeInsets.symmetric(
                                            horizontal: 12,
                                            vertical: 11,
                                          ),
                                          decoration: BoxDecoration(
                                            color: AppColors.dangerSoft
                                                .withOpacity(0.15),
                                            borderRadius: BorderRadius.circular(
                                                AppRadii.sm),
                                            border: Border.all(
                                              color: AppColors.danger
                                                  .withOpacity(0.40),
                                            ),
                                          ),
                                          child: Row(
                                            children: [
                                              const Icon(
                                                Icons.error_outline_rounded,
                                                size: 17,
                                                color: Colors.white70,
                                              ),
                                              const SizedBox(width: 8),
                                              Expanded(
                                                child: Text(
                                                  error,
                                                  style: const TextStyle(
                                                    fontSize: 13,
                                                    color: Colors.white70,
                                                    fontWeight: FontWeight.w500,
                                                    height: 1.35,
                                                  ),
                                                ),
                                              ),
                                            ],
                                          ),
                                        );
                                      },
                                    ),

                                    // ── Login button ──
                                    // w-full h-12 rounded-xl bg-[#F26522] text-white font-semibold text-sm
                                    // shadow-lg shadow-[#F26522]/30
                                    Selector<AuthProvider, bool>(
                                      selector: (_, a) => a.busy,
                                      builder: (_, busy, __) {
                                        return Container(
                                          width: double.infinity,
                                          height: 48,
                                          margin:
                                              const EdgeInsets.only(top: 4),
                                          decoration: BoxDecoration(
                                            color: AppColors.primary,
                                            borderRadius: BorderRadius.circular(
                                                AppRadii.xl),
                                            boxShadow: [
                                              BoxShadow(
                                                color: AppColors.primary
                                                    .withOpacity(0.30),
                                                blurRadius: 16,
                                                offset: const Offset(0, 6),
                                              ),
                                            ],
                                          ),
                                          child: Material(
                                            color: Colors.transparent,
                                            child: InkWell(
                                              onTap:
                                                  busy ? null : _submit,
                                              borderRadius:
                                                  BorderRadius.circular(
                                                      AppRadii.xl),
                                              child: Center(
                                                child: AnimatedSwitcher(
                                                  duration: const Duration(
                                                      milliseconds: 200),
                                                  child: busy
                                                      ? const SizedBox(
                                                          key: ValueKey(
                                                              'spinner'),
                                                          width: 20,
                                                          height: 20,
                                                          child:
                                                              CircularProgressIndicator(
                                                            color:
                                                                Colors.white,
                                                            strokeWidth: 2.5,
                                                          ),
                                                        )
                                                      : const Row(
                                                          key: ValueKey(
                                                              'label'),
                                                          mainAxisSize:
                                                              MainAxisSize
                                                                  .min,
                                                          children: [
                                                            Text(
                                                              'Login',
                                                              style: TextStyle(
                                                                fontSize: 14,
                                                                fontWeight:
                                                                    FontWeight
                                                                        .w600,
                                                                color: Colors
                                                                    .white,
                                                              ),
                                                            ),
                                                            SizedBox(width: 8),
                                                            Icon(
                                                              Icons
                                                                  .arrow_forward_rounded,
                                                              size: 16,
                                                              color:
                                                                  Colors.white,
                                                            ),
                                                          ],
                                                        ),
                                                ),
                                              ),
                                            ),
                                          ),
                                        );
                                      },
                                    ),

                                    // ── Student/Teacher hint ──
                                    // text-[11px] text-white/60 mt-3 text-center leading-relaxed
                                    const SizedBox(height: 12),
                                    const Text(
                                      'Students & Teachers: sign in with your Roll # / Teacher ID and the password given by the Accountant.',
                                      textAlign: TextAlign.center,
                                      style: TextStyle(
                                        fontSize: 11,
                                        color: Color(0x99FFFFFF),
                                        height: 1.5,
                                        fontWeight: FontWeight.w400,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),

                          // ── Copyright ──
                          // text-[11px] text-white/70 mt-5 drop-shadow
                          const SizedBox(height: 20),
                          const Text(
                            '© 2025 Concordia College · All rights reserved',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontSize: 11,
                              color: Color(0xB3FFFFFF),
                              shadows: [
                                Shadow(
                                  color: Colors.black54,
                                  blurRadius: 4,
                                ),
                              ],
                            ),
                          ),
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
    );
  }
}

// ── Frosted glass text field ────────────────────────────────────
// Matches the web app's input styling:
//   h-12 pl-11 pr-4 rounded-xl border-white/20 bg-white/10 text-white text-sm
//   focus: border-[#F26522] bg-white/20 ring-2 ring-[#F26522]/30
//   UserIcon/Lock on left, eye toggle on right for password
class _GlassTextField extends StatelessWidget {
  final TextEditingController controller;
  final FocusNode focusNode;
  final String hint;
  final IconData icon;
  final bool obscure;
  final Widget? suffix;
  final TextInputAction? textInputAction;
  final String? Function(String?)? validator;
  final ValueChanged<String>? onSubmitted;

  const _GlassTextField({
    required this.controller,
    required this.focusNode,
    required this.hint,
    required this.icon,
    this.obscure = false,
    this.suffix,
    this.textInputAction,
    this.validator,
    this.onSubmitted,
  });

  @override
  Widget build(BuildContext context) {
    final hasFocus = focusNode.hasFocus;

    // border-white/20 bg-white/10 → focus: border-[#F26522] bg-white/20 ring-2 ring-[#F26522]/30
    final borderColor = hasFocus
        ? AppColors.primary
        : Colors.white.withOpacity(0.20);
    final fillColor = hasFocus
        ? Colors.white.withOpacity(0.20)
        : Colors.white.withOpacity(0.10);

    return Container(
      height: 48,
      decoration: BoxDecoration(
        color: fillColor,
        borderRadius: BorderRadius.circular(AppRadii.xl),
        border: Border.all(color: borderColor, width: 1),
        // focus ring
        boxShadow: hasFocus
            ? [
                BoxShadow(
                  color: AppColors.primary.withOpacity(0.30),
                  blurRadius: 8,
                  spreadRadius: 2,
                ),
              ]
            : [],
      ),
      child: Row(
        children: [
          // Left icon — pl-11 equivalent (44px from left edge, icon at ~14px)
          Padding(
            padding: const EdgeInsets.only(left: 14, right: 0),
            child: Icon(
              icon,
              size: 18,
              color: Colors.white.withOpacity(0.50),
            ),
          ),
          // Text field
          Expanded(
            child: TextFormField(
              controller: controller,
              focusNode: focusNode,
              obscureText: obscure,
              textInputAction: textInputAction,
              onFieldSubmitted: onSubmitted,
              validator: validator,
              style: const TextStyle(
                fontSize: 14,
                color: Colors.white,
                fontWeight: FontWeight.w400,
              ),
              decoration: InputDecoration(
                hintText: hint,
                hintStyle: TextStyle(
                  fontSize: 14,
                  color: Colors.white.withOpacity(0.50),
                  fontWeight: FontWeight.w400,
                ),
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                errorBorder: InputBorder.none,
                focusedErrorBorder: InputBorder.none,
                contentPadding: const EdgeInsets.only(
                  left: 10,
                  right: 16,
                  top: 14,
                  bottom: 14,
                ),
                errorStyle: const TextStyle(
                  fontSize: 0,
                  height: 0,
                ),
              ),
            ),
          ),
          // Right suffix (eye toggle)
          if (suffix != null)
            Padding(
              padding: const EdgeInsets.only(right: 14),
              child: suffix,
            ),
        ],
      ),
    );
  }
}
