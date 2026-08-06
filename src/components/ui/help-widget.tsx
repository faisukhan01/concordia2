'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LifeBuoy, X, Send, Bot, User, Sparkles, Instagram, Linkedin } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════
// Concordia College — In-App Assistant ("Concordia Bot")
//
// A fully hardcoded, offline chatbot. NO API calls, NO AI/LLM, NO network.
// Every response is pre-written and matched by a keyword-scoring algorithm.
//
// v2 SMART ENGINE (still 100% offline, rule-based):
//   • Synonym expansion  — 20 synonym groups auto-expand each keyword
//   • Typo tolerance     — Levenshtein ≤ 1 for words of length ≥ 4
//   • Intent detection   — how-to / where-is / troubleshooting / who-is
//   • Context memory     — last-topic ref + follow-up trigger detection
//   • Follow-up chips    — 2-3 relevant next questions after every KB answer
//   • Top-3 fallback     — closest KB entries shown as chips on no match
//   • Better small talk  — identity, capabilities, compliments, good-night
//
// Knowledge covers all 7 portals:
//   Admin · Admissions · Accountant · Academic · Teacher · Student · Parent
// Plus owner/creator identity questions.
// ═══════════════════════════════════════════════════════════════════════════

type Intent = 'how-to' | 'where-is' | 'troubleshooting' | 'who-is';

type KBEntry = {
  id: string;
  keywords: string[];          // lowercased tokens/phrases to match
  question: string;            // display label (for suggested chips)
  answer: string;              // the hardcoded response
  category: 'owner' | 'general' | 'admin' | 'admissions' | 'accountant' | 'academic' | 'teacher' | 'student' | 'parent';
  followUps?: string[];        // 2-3 related question strings (must match other KB entries' `question`)
  intentBoost?: Intent[];      // intents that should boost this entry's score
};

// Owner link block — reused verbatim across all owner entries so the answer
// always includes BOTH Instagram AND LinkedIn (per user request).
const OWNER_LINKS = `Connect with him:
• Instagram: @faisu._khan01
  https://www.instagram.com/faisu._khan01/
• LinkedIn: Faisal Arslan Khan
  https://www.linkedin.com/in/faisal-arslan-khan-a3140232a/`;

// ─────────────────────────── Knowledge Base ────────────────────────────────
const KB: KBEntry[] = [
  // ─── OWNER / CREATOR (highest priority — always answered the same way) ───
  {
    id: 'owner-1',
    keywords: ['who built', 'who made', 'who created', 'who developed', 'who designed', 'who wrote', 'who coded'],
    question: 'Who built you?',
    answer: `Faisal Khan built me and he is my official owner. 🎓\n\n${OWNER_LINKS}`,
    category: 'owner',
    intentBoost: ['who-is'],
  },
  {
    id: 'owner-2',
    keywords: ['owner', 'your owner', 'my owner', 'who owns', 'whose owner', 'owner name', 'who is the owner'],
    question: 'Who is your owner?',
    answer: `Faisal Khan is my official owner. He built me for Concordia College.\n\n${OWNER_LINKS}`,
    category: 'owner',
    intentBoost: ['who-is'],
  },
  {
    id: 'owner-3',
    keywords: ['creator', 'your creator', 'my creator', 'who is the creator', 'developer', 'your developer', 'maker', 'your maker'],
    question: 'Who is your creator?',
    answer: `Faisal Khan is my creator and official owner.\n\n${OWNER_LINKS}`,
    category: 'owner',
    intentBoost: ['who-is'],
  },
  {
    id: 'owner-4',
    keywords: ['faisal', 'khan', 'faisu', 'faisukhan', 'instagram', 'insta', 'linkedin', 'social', 'contact developer', 'contact owner', 'reach owner', 'owner instagram', 'owner linkedin'],
    question: 'How to contact the owner?',
    answer: `Faisal Khan — my official owner and builder.\n\n${OWNER_LINKS}`,
    category: 'owner',
  },
  {
    id: 'owner-5',
    keywords: ['what are you', 'who are you', 'your name', 'introduce yourself', 'about you', 'about yourself', 'what is your name', 'what can you do'],
    question: 'Who are you?',
    answer:
      `I'm the Concordia Assistant — a built-in guide for the Concordia College portal. I can help you navigate any portal: Admin, Admissions, Accountant, Academic Office, Teacher, Student, and Parent. Just ask me how to do something and I'll point you to the right place.\n\nI was built by Faisal Khan — my official owner. 🎓\n\n${OWNER_LINKS}`,
    category: 'owner',
  },

  // ─── GENERAL (login, password, navigation, roles, app, support) ───────────
  {
    id: 'gen-login',
    keywords: ['login', 'log in', 'sign in', 'signin', 'how to login', 'how to sign in', 'cant login', 'cannot login', 'cant sign in'],
    question: 'How do I log in?',
    answer:
      'On the sign-in page, enter your username (email address) and password, then click "Login".\n\n• Admin → admin@concordia.edu.pk\n• Admissions → admissions@concordia.edu.pk\n• Accountant → accountant@concordia.edu.pk\n• Academic Office → academics@concordia.edu.pk\n\nStudents sign in with their Roll Number and the password the accountant issued. Teachers sign in with their Teacher ID and the issued password.',
    category: 'general',
    followUps: ['How do I change or reset my password?', 'Are there keyboard shortcuts?', 'How do I navigate between pages?'],
    intentBoost: ['how-to', 'troubleshooting'],
  },
  {
    id: 'gen-password',
    keywords: ['password', 'forgot password', 'reset password', 'change password', 'lost password', 'new password', 'credentials'],
    question: 'How do I change or reset my password?',
    answer:
      "After logging in, go to Settings (gear icon in the sidebar) to change your password.\n\nIf you forgot your password, ask your portal administrator:\n• Students/Teachers → ask the Accountant to reset it from Create Logins.\n• Accountant/Admissions/Academics → ask the Admin.\n• Admin → contact the institute super-admin.",
    category: 'general',
    followUps: ['How do I log in?', 'Are there keyboard shortcuts?', 'How do I navigate between pages?'],
    intentBoost: ['how-to', 'troubleshooting'],
  },
  {
    id: 'gen-shortcut',
    keywords: ['shortcut', 'keyboard', 'hotkey', 'key binding'],
    question: 'Are there keyboard shortcuts?',
    answer:
      'Yes! Press ⌘K (Mac) or Ctrl+K (Windows) to open the Command Palette — you can jump to any module from there. Press ? to open this assistant. Press Esc to close any open dialog.',
    category: 'general',
    followUps: ['How do I use the command palette?', 'How do I navigate between pages?', 'How do I log in?'],
  },
  {
    id: 'gen-sidebar',
    keywords: ['sidebar', 'menu', 'navigation', 'where is', 'find page', 'find module', 'how to navigate', 'how to go to', 'navigate'],
    question: 'How do I navigate between pages?',
    answer:
      'Use the sidebar on the left. Sections are grouped under collapsible headings (e.g. "CLASSES & ACADEMICS", "FINANCE"). Click a group to expand it, then click the page you want. You can also press ⌘K / Ctrl+K to search and jump directly.',
    category: 'general',
    followUps: ['How do I use the command palette?', 'Are there keyboard shortcuts?', 'How do I log in?'],
    intentBoost: ['where-is', 'how-to'],
  },
  {
    id: 'gen-roles',
    keywords: ['roles', 'available roles', 'list roles', 'user types', 'account types', 'types of users', 'what roles'],
    question: 'What roles are available?',
    answer:
      "Concordia has 8 roles:\n\n1. Super Admin — owns the institute, can do everything\n2. Admin — manages the branch, has all sub-portals (Admissions + Accountant + Academic)\n3. Admissions Office — enrolls students, locks base fees\n4. Accountant — fees, installments, charges, logins, salary slips\n5. Academic Office — classes, timetable, exams, results, teachers\n6. Teacher — marks attendance, enters marks, uploads materials, posts diary\n7. Student — views fees, results, attendance, materials, diary\n8. Parent — monitors their ward (child)\n\nEach role sees only the modules relevant to them.",
    category: 'general',
    followUps: ['How do I log in?', 'How do I switch roles or view another portal?', 'How do I change or reset my password?'],
  },
  {
    id: 'gen-switch-roles',
    keywords: ['switch role', 'change role', 'view as', 'another portal', 'switch portal', 'different portal', 'view another portal', 'access another portal'],
    question: 'How do I switch roles or view another portal?',
    answer:
      "Each role uses a separate login. To switch:\n\n1. Sign out (top-right user menu → Sign Out).\n2. On the sign-in page, enter the credentials of the role you want (e.g. the Accountant's email/password to access the Accountant portal).\n\nThe Admin doesn't need to switch — their sidebar already includes Admissions, Accountant, and Academic sections inside one login.",
    category: 'general',
    followUps: ['What roles are available?', 'How do I log in?', 'How do I navigate between pages?'],
    intentBoost: ['how-to'],
  },
  {
    id: 'gen-notifications',
    keywords: ['notification', 'notifications', 'bell', 'alerts', 'how do notifications work', 'where are notifications'],
    question: 'How do notifications work?',
    answer:
      "The bell icon in the top bar shows your recent notifications — new diary notes, fee reminders, result cards published, exam date sheets, and announcements. The dot counter clears once you open the panel. Academic Office announcements (posted from their portal) appear here for the relevant classes/audiences.",
    category: 'general',
    followUps: ['How do I post a diary note?', 'How do I create a date sheet?', 'How do I view result cards?'],
  },
  {
    id: 'gen-profile-photo',
    keywords: ['profile photo', 'update photo', 'change photo', 'profile picture', 'avatar', 'upload photo', 'my photo'],
    question: 'How do I update my profile photo?',
    answer:
      "Go to Settings (gear icon in the sidebar) → Profile. Click the photo placeholder, choose an image file from your device, and click 'Save'. Your photo appears in the top-right user menu and on your profile. Students and teachers can do the same from their own portals.",
    category: 'general',
    followUps: ['How do I change or reset my password?', 'Are there keyboard shortcuts?', 'How do I navigate between pages?'],
    intentBoost: ['how-to'],
  },
  {
    id: 'gen-command-palette',
    keywords: ['command palette', 'cmd k', 'ctrl k', 'quick jump', 'command menu', 'open command'],
    question: 'How do I use the command palette?',
    answer:
      "Press ⌘K (Mac) or Ctrl+K (Windows/Linux) to open the command palette. Type a few letters of any module name (e.g. 'result', 'fee', 'attend') and arrow-key through the matches. Press Enter to jump straight there. Press Esc to close. It's the fastest way to navigate the portal.",
    category: 'general',
    followUps: ['Are there keyboard shortcuts?', 'How do I navigate between pages?', 'What roles are available?'],
    intentBoost: ['how-to', 'where-is'],
  },
  {
    id: 'gen-whats-new',
    keywords: ['whats new', 'what is new', 'changelog', 'new features', 'latest version', 'update log', 'recent changes', 'new update'],
    question: "What's new in this version?",
    answer:
      "Recent highlights:\n\n• Smarter in-app assistant (synonyms, typo tolerance, follow-up suggestions)\n• Owner LinkedIn link added to the assistant + footer\n• Refined login page (stunning glass card + FaQ branding at bottom-right)\n• Smaller sidebar FaQ credit (more premium, less dominant)\n• Mobile app splash + login refined for small screens\n• Result cards: class → test → student drill-down with PDF download\n• Fee installments with manual dates + quick-split\n\nFor the full APK version, see the Download page.",
    category: 'general',
  },
  {
    id: 'gen-mobile-app',
    keywords: ['mobile app', 'download app', 'apk', 'android app', 'install app', 'play store', 'get the app', 'app download', 'download mobile app'],
    question: 'How do I download the mobile app?',
    answer:
      "Open the Download page (link in the sign-in page footer or from the user menu). Scan the QR code with your phone's camera, or copy the direct APK link. The app is an Android WebView that loads the live portal — so every web update appears automatically. Requires Android 5.0+.",
    category: 'general',
    followUps: ['Is there a mobile app?', "What's new in this version?", 'How do I log in?'],
    intentBoost: ['how-to'],
  },
  {
    id: 'gen-mobile-available',
    keywords: ['is there an app', 'is there a mobile app', 'app available', 'mobile version', 'do you have an app', 'have an app'],
    question: 'Is there a mobile app?',
    answer:
      "Yes! Concordia has an Android app (WebView). It loads the live portal inside a native shell, so every web update shows up automatically. Download it from the Download page (sign-in footer or user menu) — scan the QR or open the APK link. Requires Android 5.0+. An iOS version is not yet available; iPhone users can use the web portal in their browser.",
    category: 'general',
    followUps: ['How do I download the mobile app?', 'How do I log in?', "What's new in this version?"],
  },
  {
    id: 'gen-contact-support',
    keywords: ['contact support', 'help support', 'support', 'contact us', 'reach support', 'customer service', 'tech support', 'call support'],
    question: 'How do I contact support?',
    answer:
      `For portal issues, ask your portal administrator first:\n• Students/Teachers → Accountant\n• Accountant/Admissions/Academics → Admin\n• Admin → Super-Admin\n\nFor app or account issues, contact the owner:\n\n${OWNER_LINKS}`,
    category: 'general',
    followUps: ['Who built you?', 'How do I change or reset my password?', 'Are there keyboard shortcuts?'],
  },
  {
    id: 'gen-export-data',
    keywords: ['export data', 'export', 'export csv', 'export excel', 'download data', 'data export'],
    question: 'How do I export data?',
    answer:
      "Most list pages (Students, Result Cards, Fee & Installments, Salary Slips) have a 'Download PDF' or 'Print' button. For per-row PDFs (challan, result card, salary slip), use the download icon at the end of the row. There's no global 'Export to Excel' button — use your browser's 'Print → Save as PDF' for a snapshot of any table.",
    category: 'general',
    followUps: ['How do I download a fee challan?', "How do I download a student's result card PDF?", 'How do I generate a salary slip?'],
    intentBoost: ['how-to'],
  },
  {
    id: 'gen-backup-db',
    keywords: ['backup', 'back up', 'database backup', 'dump database', 'export database', 'save database'],
    question: 'How do I back up the database?',
    answer:
      "Database backups are managed by the Super-Admin from the institute-level admin panel. There's no in-portal backup button for regular admins — contact the Super-Admin or the institute's IT to schedule automatic daily backups. As an Admin, you can export key lists (Students, Fees, Results) to PDF as a snapshot.",
    category: 'general',
    followUps: ['How do I export data?', 'What roles are available?', 'How do I contact support?'],
    intentBoost: ['how-to'],
  },

  // ─── ADMIN PORTAL ────────────────────────────────────────────────────────
  {
    id: 'admin-overview',
    keywords: ['admin dashboard', 'admin overview', 'admin portal', 'what does admin do', 'admin role', 'admin can do'],
    question: 'What does the Admin portal do?',
    answer:
      "The Admin portal is the master control centre. From the dashboard you see total students, teachers, staff, and fee collection stats. The sidebar has three delegated sections:\n\n• ADMISSION OFFICE → enroll students + finalize base fee\n• ACCOUNTANT → fees, installments, charges, create logins, salary slips\n• ACADEMIC OFFICE → classes, timetable, result cards, teachers\n\nEach section opens the full sub-portal inside the admin view.",
    category: 'admin',
    followUps: ['Can the Admin access all sub-portals?', 'How does the Admin manage staff?', 'What roles are available?'],
  },
  {
    id: 'admin-delegate',
    keywords: ['admin access admissions', 'admin access accountant', 'admin access academic', 'admin manage everything', 'admin all portals', 'admin sub portal'],
    question: 'Can the Admin access all sub-portals?',
    answer:
      "Yes. The Admin sidebar includes ADMISSION OFFICE, ACCOUNTANT, and ACADEMIC OFFICE sections. Click any module there (e.g. 'Result Cards' under ACADEMIC OFFICE) and the admin sees the exact same interface as that sub-portal — no separate login needed.",
    category: 'admin',
    followUps: ['What does the Admin portal do?', 'How do I switch roles or view another portal?', 'What roles are available?'],
  },
  {
    id: 'admin-staff',
    keywords: ['admin staff', 'create institute', 'create branch', 'manage staff', 'office staff', 'admin staff list'],
    question: 'How does the Admin manage staff?',
    answer:
      "The Admin dashboard shows all office staff (admissions, accounts, academics). To create a new branch or institute-level staff member, use the super-admin or institute-admin flows. Branch-level staff (teachers, students) are created by the Accountant.",
    category: 'admin',
    followUps: ['What does the Admin portal do?', 'How do I create a teacher login?', 'How do I create a student login?'],
  },

  // ─── ADMISSIONS PORTAL ───────────────────────────────────────────────────
  {
    id: 'adm-enroll',
    keywords: ['enroll student', 'admit student', 'new student', 'new enrollment', 'register student', 'addmission', 'admission form', 'enroll new'],
    question: 'How do I enroll a new student?',
    answer:
      "Go to the Admissions portal → 'Enroll Student'. It's a 3-step form:\n\n1. Personal Info — name, father/guardian, contact, CNIC, DOB, address, previous result, photo.\n2. Academic Placement — pick the Program, Class, and Section. A roll number is auto-suggested from the class.\n3. Fee Summary — review the base fee; 'Lock Base Fee' to finalize it so the accountant can generate invoices.\n\nAfter completing, you'll see a confirmation screen with Print Receipt and Download PDF buttons.",
    category: 'admissions',
    followUps: ["What does 'Lock Base Fee' do?", 'How do I set installment dates?', 'How do I create a student login?'],
    intentBoost: ['how-to'],
  },
  {
    id: 'adm-receipt',
    keywords: ['print receipt', 'download receipt', 'enrollment receipt', 'admission receipt', 'receipt pdf', 'enrollment pdf'],
    question: 'How do I print or download the enrollment receipt?',
    answer:
      "After completing the 3-step enrollment form, the confirmation screen shows two buttons:\n\n• 'Download PDF' — saves a branded receipt (with college logo) to your device.\n• 'Print Receipt' — opens the print dialog so you can print or save as PDF.\n\nYou can also click 'Enroll Another' to register the next student.",
    category: 'admissions',
    followUps: ['How do I enroll a new student?', "What does 'Lock Base Fee' do?", 'How do I create a student login?'],
    intentBoost: ['how-to'],
  },
  {
    id: 'adm-class',
    keywords: ['admission class', 'admission section', 'admission program', 'pick class', 'select class admission', 'roll number admission', 'auto roll'],
    question: 'How is the class and roll number assigned?',
    answer:
      "In Step 2 (Academic Placement) of the enrollment form, select the Program, then the Class from the dropdown, then the Section. The roll number is auto-suggested based on the class you pick — you can override it if needed. The base fee is shown based on the selected class.",
    category: 'admissions',
    followUps: ['How do I enroll a new student?', "What does 'Lock Base Fee' do?", 'How do I create a student login?'],
  },
  {
    id: 'adm-basefee',
    keywords: ['base fee', 'lock base fee', 'admission fee', 'fee lock', 'finalize fee', 'base fee locked'],
    question: "What does 'Lock Base Fee' do?",
    answer:
      "Locking the base fee in Step 3 finalizes the student's monthly fee amount. Once locked, the accountant can generate monthly invoices and installments against that amount. This prevents accidental changes after enrollment. If the fee needs to change later, the accountant can unlock + relock it from the Fee & Installments page.",
    category: 'admissions',
    followUps: ['How do I set installment dates?', 'How do I download a fee challan?', 'How do I add a miscellaneous charge?'],
  },
  {
    id: 'adm-search-student',
    keywords: ['search student', 'find student', 'look up student', 'filter student', 'locate student', 'student search'],
    question: 'How do I search for a student?',
    answer:
      "On the Accountant's Students page (or the Admin's Accountant → Students view), use the search box at the top. Type a few letters of the student's name, Roll Number, or father's name. The list filters live as you type. The same search works on the Miscellaneous Charges page and in Create Logins → Student Logins.",
    category: 'admissions',
    followUps: ['How do I enroll a new student?', 'How do I edit student information?', 'How do I create a student login?'],
    intentBoost: ['how-to', 'where-is'],
  },
  {
    id: 'adm-edit-student',
    keywords: ['edit student', 'update student', 'modify student', 'change student info', 'edit student information', 'update student info'],
    question: 'How do I edit student information?',
    answer:
      "On the Students page (Accountant portal, or Admin → Accountant → Students), find the student using the search box, then click the 'Edit' button on their row. Update the fields you want to change (name, contact, address, etc.) and click 'Save'. Some fields like Roll Number may be locked once issued — pick a new one if needed.",
    category: 'admissions',
    followUps: ['How do I search for a student?', 'How do I delete a student or teacher?', 'How do I create a student login?'],
    intentBoost: ['how-to'],
  },
  {
    id: 'adm-delete-student',
    keywords: ['delete student', 'remove student', 'delete teacher', 'remove teacher', 'delete user', 'remove user'],
    question: 'How do I delete a student or teacher?',
    answer:
      "On the Students or Teachers page (Accountant portal, or Admin → Accountant → Students/Teachers), find the person using the search box, then click 'Delete' on their row. You'll be asked to confirm. This removes their login + records from your branch. This action is permanent — to deactivate instead, edit the user and clear their login credentials.",
    category: 'admissions',
    followUps: ['How do I search for a student?', 'How do I edit student information?', 'How do I create a teacher login?'],
    intentBoost: ['how-to'],
  },

  // ─── ACCOUNTANT PORTAL ───────────────────────────────────────────────────
  {
    id: 'acc-overview',
    keywords: ['accountant portal', 'accountant do', 'accountant role', 'accountant can do', 'what does accountant'],
    question: 'What does the Accountant portal do?',
    answer:
      "The Accountant manages all money + login creation:\n\n• Dashboard — fee collection stats\n• Students (Class-wise) — view students grouped by class\n• Fee & Installments — set installment plans with manual dates, mark paid, download challans\n• Miscellaneous Charges — add charges (search student by name, custom 'Other' type)\n• Create Logins — issue Student + Teacher credentials\n• Salary Slips — generate + download staff salary PDFs",
    category: 'accountant',
    followUps: ['How do I set installment dates?', 'How do I download a fee challan?', 'How do I create a teacher login?'],
  },
  {
    id: 'acc-installment',
    keywords: ['installment', 'installment date', 'set installment', 'fee installment', 'add installment', 'manual date', 'due date'],
    question: 'How do I set installment dates?',
    answer:
      "Go to Fee & Installments → select a student → scroll to the installment plan. Click 'Add Row' for each installment, enter the amount, and pick the due date manually (each installment has its own date picker). You can also use 'Quick split' to auto-divide the total into equal parts, then edit each date afterwards. Students see these installments + dates in their portal.",
    category: 'accountant',
    followUps: ['How do I download a fee challan?', 'How do I add a miscellaneous charge?', 'How do I view my fees and download a challan?'],
    intentBoost: ['how-to'],
  },
  {
    id: 'acc-challan',
    keywords: ['challan', 'fee challan', 'download challan', 'challan pdf', 'print challan', 'fee invoice pdf'],
    question: 'How do I download a fee challan?',
    answer:
      "In Fee & Installments, select the student, find the installment or monthly challan, and click the Download (PDF) button next to it. A branded challan with the college logo is saved to your device. Students can also download their own challans from their 'My Fees' page.",
    category: 'accountant',
    followUps: ['How do I set installment dates?', 'How do I view my fees and download a challan?', 'How do I add a miscellaneous charge?'],
    intentBoost: ['how-to'],
  },
  {
    id: 'acc-misc',
    keywords: ['misc', 'miscellaneous', 'extra charge', 'additional charge', 'fine', 'other charge', 'sports fee', 'library fine'],
    question: 'How do I add a miscellaneous charge?',
    answer:
      "Go to Miscellaneous Charges. Type a student's name, roll number, or class in the search box to find them (students don't all show at once — you must search). Select the student, pick a Charge Type (or choose 'Other' to write a custom name like 'Sports Fee' or 'Trip Fee'), enter the amount, and click 'Add Charge'.",
    category: 'accountant',
    followUps: ['How do I set installment dates?', 'How do I download a fee challan?', 'How do I view my fees and download a challan?'],
    intentBoost: ['how-to'],
  },
  {
    id: 'acc-teacher-login',
    keywords: ['create teacher login', 'teacher login', 'teacher credentials', 'teacher account', 'teacher password', 'create teacher', 'add teacher login'],
    question: 'How do I create a teacher login?',
    answer:
      "Go to Create Logins → Teacher Logins tab. Fill in Full Name, Teacher ID (e.g. T001), Email (optional — auto-generated if blank), and Password (optional — auto-generated if blank). Click 'Generate Login'. The system shows the username + auto-password. The teacher can sign in and change their password later.\n\nNote: the accountant ONLY creates credentials. Subjects and classes are assigned later by the Academic Office.",
    category: 'accountant',
    followUps: ['How do I assign subjects to a teacher?', 'How do I create a class and assign a teacher?', 'How do I create a student login?'],
    intentBoost: ['how-to'],
  },
  {
    id: 'acc-student-login',
    keywords: ['create student login', 'student login', 'student credentials', 'student account', 'student password', 'create student', 'issue student login'],
    question: 'How do I create a student login?',
    answer:
      "Go to Create Logins → Student Logins tab. Students are created via the Admissions portal first. Once admitted, find the student in the list (they'll show 'Without Login' status), click 'Edit', and set their password. The username is their Roll Number. Students sign in with Roll Number + the password you set.",
    category: 'accountant',
    followUps: ['How do I enroll a new student?', 'How do I view my fees and download a challan?', 'How do I change or reset my password?'],
    intentBoost: ['how-to'],
  },
  {
    id: 'acc-duplicate-id',
    keywords: ['duplicate teacher id', 'duplicate roll number', 'id already exists', 'roll number already', 'teacher id already', 'duplicate id', 'id taken'],
    question: "Why am I getting a 'duplicate ID' error?",
    answer:
      "When creating or editing a teacher/student, the system checks that the Teacher ID or Roll Number isn't already used by someone else in your branch. If you see 'Duplicate Teacher ID' or 'Roll Number already exists', pick a different ID. The error message tells you exactly who is already using that ID.",
    category: 'accountant',
    followUps: ['How do I create a teacher login?', 'How do I create a student login?', 'How do I edit student information?'],
    intentBoost: ['troubleshooting'],
  },
  {
    id: 'acc-salary',
    keywords: ['salary', 'salary slip', 'payroll', 'staff salary', 'salary pdf', 'generate salary'],
    question: 'How do I generate a salary slip?',
    answer:
      "Go to Salary Slips → select the staff member → enter the month, basic salary, allowances, and deductions → click 'Generate'. A branded salary slip PDF with the college logo is generated. You can download or print it.",
    category: 'accountant',
    followUps: ['How do I download a fee challan?', "How do I download a student's result card PDF?", 'How do I export data?'],
    intentBoost: ['how-to'],
  },

  // ─── ACADEMIC PORTAL ─────────────────────────────────────────────────────
  {
    id: 'aca-overview',
    keywords: ['academic portal', 'academic office', 'academic do', 'academic role', 'academic can do', 'what does academic'],
    question: 'What does the Academic Office portal do?',
    answer:
      "The Academic Office manages all academics:\n\n• Announcements — post notices to classes/audiences\n• Classes — create classes, assign teachers to classes\n• Timetable — create class timetables (with clash detection)\n• Date Sheets — schedule exam date sheets (you must create an exam first on the Exams page)\n• Exams — create every assessment (Monthly Tests, Midterm, Final, Quiz, etc.). Click an exam card to build its date sheet.\n• Result Cards — view class-wise test results + download PDFs\n• Teachers — manage teacher profiles + subject/class assignments",
    category: 'academic',
    followUps: ['How do I create an exam or monthly test?', 'How do I create a class and assign a teacher?', 'How do I view result cards?'],
  },
  {
    id: 'aca-class',
    keywords: ['create class', 'add class', 'new class', 'manage class', 'class section', 'assign teacher class', 'class teacher'],
    question: 'How do I create a class and assign a teacher?',
    answer:
      "Go to Classes → 'Add Class' (single or bulk with multiple sections). To assign a teacher: click a class card to open its detail sheet → use the 'Assign Teacher' dropdown to pick a teacher → confirm. The teacher is now linked to that class and can mark attendance + enter marks for it.",
    category: 'academic',
    followUps: ['How do I create a timetable?', 'How do I assign subjects to a teacher?', 'How do I create an exam or monthly test?'],
    intentBoost: ['how-to'],
  },
  {
    id: 'aca-timetable',
    keywords: ['timetable', 'create timetable', 'add timetable entry', 'schedule class', 'time table', 'period', 'lecture slot'],
    question: 'How do I create a timetable?',
    answer:
      "Go to Timetable → select the class from the dropdown → click 'Add Entry'. Pick the Day, Period, Subject, Teacher (optional), Start/End time, and Room. Click 'Save Entry'. The entry appears in the class timetable grid. You can add multiple entries per day.",
    category: 'academic',
    followUps: ["Why am I getting a 'timetable clash' error?", 'How do I create a class and assign a teacher?', 'How do I see my class timetable?'],
    intentBoost: ['how-to'],
  },
  {
    id: 'aca-clash',
    keywords: ['clash', 'timetable clash', 'teacher clash', 'class clash', 'time overlap', 'already has a lecture', 'already booked', 'double booking'],
    question: "Why am I getting a 'timetable clash' error?",
    answer:
      "The system prevents double-booking. There are 3 clash checks:\n\n1. CLASS clash — the class already has a lecture at that Day + Period. Delete the existing entry first if you want to change it.\n2. TEACHER clash — the teacher already has a lecture in another class at that Day + Period. Pick a different teacher, day, or period.\n3. TIME OVERLAP — the teacher has a lecture on the same day with overlapping start/end times. Adjust the times.\n\nThe error message tells you exactly which teacher/class/subject is conflicting.",
    category: 'academic',
    followUps: ['How do I create a timetable?', 'How do I create a class and assign a teacher?', 'How do I see my class timetable?'],
    intentBoost: ['troubleshooting'],
  },
  {
    id: 'aca-result-cards',
    keywords: ['result card', 'result cards', 'class result', 'test result', 'view results', 'student result', 'result table'],
    question: 'How do I view result cards?',
    answer:
      "Go to Result Cards. It's a 3-level drill-down:\n\n1. CLASS GRID — every class shows as a card with student + test counts.\n2. TEST GRID — click a class to see all tests (Monthly Test 1, 2, …) that have submitted marks, with class averages.\n3. STUDENT TABLE — click a test to see every student in a row with columns: Roll #, Name, Father/Guardian, Father Contact, one column per subject (marks/total), Total, %, Grade, and a per-row Download PDF button.\n\nThe PDF is a branded result card with the college logo.",
    category: 'academic',
    followUps: ["How do I download a student's result card PDF?", 'How do I enter and lock marks?', "Where is the 'Review Marks' page?"],
    intentBoost: ['where-is', 'how-to'],
  },
  {
    id: 'aca-result-pdf',
    keywords: ['result card pdf', 'download result card', 'print result card', 'result pdf', 'generate result card'],
    question: "How do I download a student's result card PDF?",
    answer:
      "In Result Cards → open the class → open the test → find the student's row → click the 'Download' button at the end of the row. A branded PDF saves to your device with: college logo, student details (name, roll, father name, father contact, class), subject-wise marks table, total/percentage/grade, and a PASSED/FAILED status. Print-ready.",
    category: 'academic',
    followUps: ['How do I view result cards?', 'How do I enter and lock marks?', 'How do I view my results?'],
    intentBoost: ['how-to'],
  },
  {
    id: 'aca-review-marks',
    keywords: ['review marks', 'where is review marks', 'review marks gone', 'review marks removed', 'marks review'],
    question: "Where is the 'Review Marks' page?",
    answer:
      "The 'Review Marks' page has been removed. Marks review now happens inside 'Result Cards' — open a class, open a test, and you'll see every student's subject-wise marks in one table. Teachers enter + lock their subject marks from their Teacher portal; the Academic Office reviews them here.",
    category: 'academic',
    followUps: ['How do I view result cards?', 'How do I enter and lock marks?', "How do I download a student's result card PDF?"],
    intentBoost: ['where-is', 'troubleshooting'],
  },
  {
    id: 'aca-test',
    keywords: [
      'monthly test', 'create test', 'new test', 'test session', 'add test', 'test name',
      'create exam', 'add exam', 'new exam', 'exam name', 'final exam', 'midterm', 'mid term', 'quiz',
      'create monthly test', 'exams page', 'academic exam', 'exam type',
      // Phrase variants accounting for articles (a/an/the) so "how do I create an exam" matches.
      'create an exam', 'add an exam', 'create a exam', 'create the exam',
      'make an exam', 'make a exam', 'make exam', 'schedule exam', 'schedule an exam',
    ],
    question: 'How do I create an exam or monthly test?',
    answer:
      "Go to the Exams page (sidebar → Classes & Academics → Exams). Enter the exam name (e.g. 'Monthly Test 1', 'Midterm 2026', 'Final Exam'), pick a Type (Monthly Test, Midterm, Final, Quiz, Assignment, Oral Test, Class Test, or Other), and click 'Create Exam'.\n\n• The exam appears instantly as a card on the same page.\n• You can't create two exams with the same name in your branch — the system blocks duplicates.\n• Click 'Build Date Sheet' on any exam card to jump to the Date Sheets page with that exam's name pre-filled.\n• Teachers will see the exam name in their marks-entry dropdown.",
    category: 'academic',
    followUps: ['How do I create a date sheet?', "Why won't it let me create an exam with the same name?", 'How do I enter and lock marks?'],
    intentBoost: ['how-to'],
  },
  {
    id: 'aca-exam-duplicate',
    keywords: ['duplicate exam', 'same exam name', 'exam already exists', 'cannot create exam', 'exam name taken', 'duplicate test name', 'same test name'],
    question: "Why won't it let me create an exam with the same name?",
    answer:
      "Each exam name must be unique within your branch (checked case-insensitively). If you try to create 'Monthly Test 1' and one already exists, you'll see a 'Duplicate exam name' message. Pick a different name like 'Monthly Test 1 — Retake' or 'Monthly Test 2'. This keeps teacher marks, date sheets, and result cards tied to one unambiguous exam.",
    category: 'academic',
    followUps: ['How do I create an exam or monthly test?', 'How do I create a date sheet?', "Why can't I create a date sheet?"],
    intentBoost: ['troubleshooting'],
  },
  {
    id: 'aca-datesheet-gate',
    keywords: ['date sheet without exam', 'no exam date sheet', "can't create date sheet", 'create exam first', 'date sheet blocked', 'no exams yet', 'date sheet requires exam', 'date sheet needs exam'],
    question: "Why can't I create a date sheet?",
    answer:
      "Date sheets require at least one exam to exist first. If the Date Sheets page shows an amber 'Create an exam first' banner (or the 'New Date Sheet' button is disabled), go to the Exams page, create your Monthly Test / Midterm / Final, then return. When you click 'Build Date Sheet' on an exam card, the Date Sheets form opens automatically with that exam's name pre-selected.",
    category: 'academic',
    followUps: ['How do I create an exam or monthly test?', 'How do I create a date sheet?', "Why won't it let me create an exam with the same name?"],
    intentBoost: ['troubleshooting'],
  },
  {
    id: 'aca-datesheet',
    keywords: ['date sheet', 'datesheet', 'exam schedule', 'exam date', 'create datesheet', 'add datesheet'],
    question: 'How do I create a date sheet?',
    answer:
      "Easiest way: go to Exams → click 'Build Date Sheet' on an exam card. You'll land on the Date Sheets page with the exam name already filled in. Then add rows (Subject + Date + Time), enter the class, and click 'Publish Date Sheet'.\n\nYou can also open Date Sheets directly and click 'New Date Sheet' — but you must pick an existing exam from the dropdown. If no exams exist yet, the page shows an amber 'Create an exam first' banner. The published date sheet is visible to students in their portal.",
    category: 'academic',
    followUps: ["Why can't I create a date sheet?", 'How do I create an exam or monthly test?', 'How do I view my results?'],
    intentBoost: ['how-to'],
  },
  {
    id: 'aca-teacher-assign',
    keywords: ['assign subject', 'assign teacher subject', 'teacher subject', 'teacher course', 'subject assignment', 'course assignment'],
    question: 'How do I assign subjects to a teacher?',
    answer:
      "Go to Teachers → find the teacher → click Edit → add subjects (comma-separated) and classes. Or open a class from the Classes page → use 'Assign Teacher' to link a teacher to that class. The accountant does NOT assign subjects — only the Academic Office does.",
    category: 'academic',
    followUps: ['How do I create a teacher login?', 'How do I create a class and assign a teacher?', 'How does the Admin manage staff?'],
    intentBoost: ['how-to'],
  },

  // ─── TEACHER PORTAL ──────────────────────────────────────────────────────
  {
    id: 'tea-overview',
    keywords: ['teacher portal', 'teacher do', 'teacher role', 'teacher can do', 'what does teacher'],
    question: 'What does the Teacher portal do?',
    answer:
      "Teachers can:\n\n• Dashboard — overview of classes + pending tasks\n• My Classes — see assigned classes + students\n• Course Materials — upload notes/links for students\n• Attendance — mark daily attendance per class\n• Test Results — enter + lock subject-wise marks per test\n• Diary — post diary notes for students/parents",
    category: 'teacher',
    followUps: ['How do I enter and lock marks?', 'How do I mark attendance?', 'How do I upload course materials?'],
  },
  {
    id: 'tea-marks',
    keywords: ['enter marks', 'add marks', 'submit marks', 'lock marks', 'test results teacher', 'marks entry', 'grade student', 'mark student'],
    question: 'How do I enter and lock marks?',
    answer:
      "Go to Test Results → pick the Test name, your Class, and the Subject → enter each student's obtained marks in the table → click 'Submit to Academic Office'. Marks must be between 0 and the total. Once submitted, they're locked and appear in the Academic Office's Result Cards view. You can't edit after submitting — contact the Academic Office if you need a correction.",
    category: 'teacher',
    followUps: ['How do I view result cards?', 'How do I create an exam or monthly test?', 'How do I mark attendance?'],
    intentBoost: ['how-to'],
  },
  {
    id: 'tea-attendance',
    keywords: ['attendance', 'mark attendance', 'take attendance', 'present absent', 'daily attendance'],
    question: 'How do I mark attendance?',
    answer:
      "Go to Attendance → select your class → today's date is shown by default → mark each student Present/Absent → click 'Save Attendance'. You can navigate to past dates to view or edit previous attendance.",
    category: 'teacher',
    followUps: ['How do I check my attendance?', 'How do I post a diary note?', 'How do I upload course materials?'],
    intentBoost: ['how-to'],
  },
  {
    id: 'tea-materials',
    keywords: ['course material', 'upload notes', 'study material', 'upload pdf', 'share notes', 'materials'],
    question: 'How do I upload course materials?',
    answer:
      "Go to Course Materials → 'Add Material' → pick the class + subject → choose a file (PDF, image, etc.) or paste a link (YouTube, Google Drive) → add a title → click 'Upload'. Students in that class can see and download/view the material from their portal.",
    category: 'teacher',
    followUps: ['How do I download my study materials?', 'How do I post a diary note?', 'How do I mark attendance?'],
    intentBoost: ['how-to'],
  },
  {
    id: 'tea-diary',
    keywords: ['diary', 'diary note', 'post diary', 'student diary', 'homework note', 'parent note'],
    question: 'How do I post a diary note?',
    answer:
      "Go to Diary → 'New Entry' → select the class (and optionally a specific student) → write the note (homework, reminder, message) → click 'Post'. Students + parents see diary notes in their portal.",
    category: 'teacher',
    followUps: ['How do I upload course materials?', 'How do I mark attendance?', 'What does the Parent portal do?'],
    intentBoost: ['how-to'],
  },

  // ─── STUDENT PORTAL ──────────────────────────────────────────────────────
  {
    id: 'stu-overview',
    keywords: ['student portal', 'student do', 'student role', 'student can do', 'what does student'],
    question: 'What does the Student portal do?',
    answer:
      "Students can:\n\n• Dashboard — overview of attendance, fees, results\n• My Fees — view installments + due dates, download challan PDFs\n• My Results — view test results + report cards\n• My Attendance — attendance history\n• Course Materials — download notes/materials\n• Diary — view teacher diary notes",
    category: 'student',
    followUps: ['How do I view my fees and download a challan?', 'How do I view my results?', 'How do I check my attendance?'],
  },
  {
    id: 'stu-fees',
    keywords: ['my fees', 'student fees', 'view fees', 'installment student', 'student challan', 'download challan student'],
    question: 'How do I view my fees and download a challan?',
    answer:
      "Go to 'My Fees' in the sidebar. You'll see a KPI strip (Total Payable / Paid / Outstanding) and a table of installments with their due dates. Click the 'Download PDF' button next to any installment to get a branded fee challan with the college logo. If your fee isn't showing, your base fee may not be locked yet — ask the Admissions Office or Accountant.",
    category: 'student',
    followUps: ['How do I download a fee challan?', 'How do I view my results?', 'How do I check my attendance?'],
  },
  {
    id: 'stu-results',
    keywords: ['my results', 'student result', 'view results student', 'my marks', 'my grades', 'report card student'],
    question: 'How do I view my results?',
    answer:
      "Go to 'My Results' in the sidebar. You'll see your test results once your teachers have submitted + locked marks and the Academic Office has generated result cards. If results aren't showing, your teachers may not have submitted marks yet — check back later or ask your teacher.",
    category: 'student',
    followUps: ['How do I view result cards?', 'How do I enter and lock marks?', 'How do I see my class timetable?'],
  },
  {
    id: 'stu-login',
    keywords: ['student login', 'student sign in', 'student password', 'how to login student', 'student credentials', 'forgot student password'],
    question: 'How do I sign in as a student?',
    answer:
      "Your username is your Roll Number (e.g. STU-2026-001). Your password is set by the Accountant when they create your login. If you don't know your password, ask the Accountant to reset it from Create Logins → Student Logins. You can change your password anytime from Settings after logging in.",
    category: 'student',
    followUps: ['How do I log in?', 'How do I change or reset my password?', 'How do I view my fees and download a challan?'],
  },
  {
    id: 'stu-attendance',
    keywords: ['my attendance', 'student attendance', 'view attendance', 'attendance history', 'check attendance', 'present absent student', 'attendance percentage'],
    question: 'How do I check my attendance?',
    answer:
      "Go to 'My Attendance' in the sidebar. You'll see your attendance history with the percentage of days present. Your teachers mark attendance daily from their Teacher portal — once saved, it shows up here. Parents can see the same attendance summary on their dashboard.",
    category: 'student',
    followUps: ['How do I mark attendance?', 'How do I view my results?', 'How do I view my fees and download a challan?'],
  },
  {
    id: 'stu-timetable',
    keywords: ['my timetable', 'student timetable', 'class timetable', 'my schedule', 'view timetable student', 'my routine', 'class schedule'],
    question: 'How do I see my class timetable?',
    answer:
      "Your class timetable is set by the Academic Office. Once they create it for your class (Timetable page, with day/period/subject/teacher/room), you can view it from your Student portal. If it's not showing yet, the Academic Office may not have published it — check back soon or ask your teacher.",
    category: 'student',
    followUps: ['How do I create a timetable?', 'How do I view my results?', 'How do I check my attendance?'],
  },
  {
    id: 'stu-materials',
    keywords: ['download notes', 'study material student', 'course material student', 'view notes', 'my materials', 'class notes'],
    question: 'How do I download my study materials?',
    answer:
      "Go to 'Course Materials' in the sidebar. You'll see materials your teachers have uploaded for your class — click any item to download the file or open the link (e.g. a YouTube or Google Drive link). If nothing shows, your teachers haven't uploaded anything yet.",
    category: 'student',
    followUps: ['How do I upload course materials?', 'How do I view my results?', 'How do I check my attendance?'],
  },

  // ─── PARENT PORTAL ───────────────────────────────────────────────────────
  {
    id: 'par-overview',
    keywords: ['parent portal', 'parent do', 'parent role', 'parent can do', 'what does parent', 'ward', 'child'],
    question: 'What does the Parent portal do?',
    answer:
      "Parents can monitor their ward (child):\n\n• Dashboard — ward's attendance + fee summary\n• My Fees — ward's installments + challan downloads\n• My Results — ward's test results\n• Diary — teacher diary notes\n\nParents see the same information as the student, labelled 'Your child's …'.",
    category: 'parent',
    followUps: ['How do I view my fees and download a challan?', 'How do I view my results?', 'How do I check my attendance?'],
  },
];

// ─────────────────────────── Synonym Engine ────────────────────────────────
// Each keyword auto-expands with its synonyms during scoring so the bot
// understands natural phrasing. E.g. a keyword 'fee' also matches 'payment',
// 'invoice', 'challan', 'tuition', 'dues' — and vice versa, since every word
// in a group expands to the whole group.
//
// Construction: SYNONYM_GROUPS → bidirectional SYNONYMS map (word → all peers).

const SYNONYM_GROUPS: string[][] = [
  ['fee', 'payment', 'invoice', 'challan', 'tuition', 'dues'],
  ['student', 'pupil', 'learner', 'kid', 'child', 'ward'],
  ['teacher', 'instructor', 'staff', 'faculty', 'sir', 'miss', 'madam'],
  ['create', 'add', 'make', 'new', 'register', 'enroll', 'generate'],
  ['view', 'see', 'check', 'show', 'look', 'find', 'where'],
  ['result', 'marks', 'grades', 'score', 'report card', 'report'],
  ['attendance', 'present', 'absent', 'absence'],
  ['password', 'credentials', 'signin', 'access'],
  ['download', 'save', 'export', 'get', 'pdf'],
  ['exam', 'test', 'assessment', 'quiz'],
  ['class', 'section', 'grade level'],
  ['salary', 'pay', 'payroll', 'wage'],
  ['edit', 'update', 'modify', 'change'],
  ['delete', 'remove', 'erase'],
  ['search', 'lookup', 'filter'],
  ['dashboard', 'home', 'overview', 'main'],
  ['notice', 'notification', 'announcement', 'alert'],
  ['timetable', 'schedule', 'routine'],
  ['date sheet', 'datesheet', 'exam schedule'],
  ['mobile', 'app', 'apk', 'android'],
];

const SYNONYMS: Record<string, string[]> = (() => {
  const map: Record<string, string[]> = {};
  for (const group of SYNONYM_GROUPS) {
    for (const w of group) {
      if (!map[w]) map[w] = [];
      for (const x of group) {
        if (x !== w && !map[w].includes(x)) map[w].push(x);
      }
    }
  }
  return map;
})();

function expandSynonyms(word: string): string[] {
  return SYNONYMS[word] || [];
}

// ─────────────────────────── Typo Tolerance ────────────────────────────────
// Levenshtein edit distance — used for fuzzy single-keyword matching so
// "enrool"→"enroll", "atendance"→"attendance", "resut"→"result" still match.
// Only applied to single-word keywords of length ≥ 4 (vs. message words of
// length ≥ 4) to avoid false positives on short tokens like "add" vs "and".

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array<number>(n + 1);
  const curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,        // deletion
        curr[j - 1] + 1,    // insertion
        prev[j - 1] + cost, // substitution
      );
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

function fuzzyMatch(keyword: string, words: Set<string>): boolean {
  if (keyword.length < 4 || keyword.includes(' ')) return false;
  for (const w of words) {
    if (w.length < 4) continue;
    if (Math.abs(w.length - keyword.length) > 1) continue;
    if (levenshtein(w, keyword) <= 1) return true;
  }
  return false;
}

// ─────────────────────────── Intent Detection ──────────────────────────────
// Inspects the user's message for intent markers (how/where/why/who) and
// returns the dominant intent. Used to boost KB entries whose `intentBoost`
// array includes that intent — so a troubleshooting message ("why is X
// broken") strongly favors error/troubleshooting entries.

function detectIntent(text: string): Intent | null {
  const t = text.toLowerCase();
  // who-is beats everything (owner/creator questions are unambiguous)
  if (/\b(who|whose|owner|creator|developer|maker)\b/.test(t)) return 'who-is';
  if (/\b(why|error|not working|can'?t|cannot|stuck|problem|issue|broken|won'?t|doesn'?t|fails?|fail|unable)\b/.test(t)) return 'troubleshooting';
  if (/\b(where (is|can|do|are)|location of|find page)\b/.test(t)) return 'where-is';
  if (/\b(how (do|to|can|should)|what('?s| is) the steps?|steps to|guide me)\b/.test(t)) return 'how-to';
  return null;
}

// ─────────────────────────── Matching Engine ───────────────────────────────
// Pure keyword scoring. NO AI, NO API, NO network. Returns the best KB entry
// for a given user message, or null if nothing matches (score 0).

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Collapse repeated characters so "hiiii"→"hi", "hellooo"→"hello", "thanksss"→"thans".
// Used for tolerant greeting / thanks detection — the bot should never miss a
// greeting just because the user held a key down.
function collapse(s: string): string {
  return s.replace(/(.)\1+/g, '$1');
}

// Bulletproof greeting detection — catches "hi", "hiiii", "hello", "hellooo",
// "hey", "heyyy", "yo", "salam", "assalam", "aoa", "hola", and leading-word
// greetings like "hi there" / "hello bot" / "hey, can you help".
function looksLikeGreeting(norm: string): boolean {
  const first = norm.split(' ')[0];
  if (/^(hi+|he+l+o+|he+y+|yo|hi+ya+|sala+m+|asa+l+a+m+|aoa|hola|hey+)$/i.test(first)) return true;
  if (/\b(hi|hello|hey|salam|assalam|aoa|hola)\b/i.test(norm)) return true;
  return false;
}

// Tolerant thanks detection — "thanks", "thanksss", "thank you", "thx", "ty".
function looksLikeThanks(norm: string): boolean {
  const c = collapse(norm);
  return /\b(thanks|thank|thx|ty|thnks|tanks)\b/i.test(c) || /thank you/i.test(c);
}

// Stopwords stripped from BOTH the message and multi-word keywords so that
// "how do I create an exam" matches the keyword "create exam". This makes the
// bot forgiving of natural phrasing without needing every variant hardcoded.
const STOPWORDS = new Set([
  'a', 'an', 'the', 'do', 'does', 'did', 'i', 'you', 'we', 'they', 'he', 'she',
  'how', 'to', 'can', 'could', 'would', 'should', 'is', 'are', 'am', 'was',
  'were', 'be', 'been', 'my', 'your', 'our', 'their', 'me', 'him', 'her',
  'please', 'in', 'on', 'at', 'for', 'of', 'with', 'and', 'or', 'as', 'by',
  'this', 'that', 'these', 'those', 'it', 'its',
]);

function stripStopwords(s: string): string {
  return s.split(' ').filter(w => !STOPWORDS.has(w)).join(' ');
}

function scoreEntry(
  entry: KBEntry,
  msgWords: Set<string>,
  msgText: string,
  msgTextNoStop: string,
  intent: Intent | null,
): number {
  let score = 0;
  for (const kw of entry.keywords) {
    if (kw.includes(' ')) {
      // Multi-word keyword → substring match on the full normalized message,
      // AND a second pass with stopwords stripped from both sides so
      // "create exam" matches "create an exam".
      if (msgText.includes(kw)) {
        score += 3; // phrase match = strong signal
      } else if (msgTextNoStop.includes(stripStopwords(kw))) {
        score += 2; // stopword-stripped phrase match = medium signal
      } else {
        // Try multi-word synonym substitution: replace each word in the
        // keyword with a synonym and check if any variant matches.
        const variant = expandMultiWordPhrase(kw);
        for (const v of variant) {
          if (v !== kw && msgText.includes(v)) {
            score += 2;
            break;
          }
        }
      }
    } else {
      // Single-word keyword → exact token match, then synonym, then fuzzy.
      if (msgWords.has(kw)) {
        score += 2; // exact match = strong signal
      } else {
        const syns = expandSynonyms(kw);
        let synHit = false;
        for (const syn of syns) {
          if (syn.includes(' ')) {
            if (msgText.includes(syn)) { synHit = true; break; }
          } else {
            if (msgWords.has(syn)) { synHit = true; break; }
          }
        }
        if (synHit) {
          score += 1; // synonym match = weak signal
        } else if (fuzzyMatch(kw, msgWords)) {
          score += 1; // typo-tolerant match = weak signal
        }
      }
    }
  }
  // Intent boost — KB entries flagged for this intent get +2.
  if (intent && entry.intentBoost?.includes(intent)) {
    score += 2;
  }
  return score;
}

// Generate phrase variants by substituting each word with its synonyms.
// E.g. "create exam" → ["add exam", "make exam", "new exam", ..., "create test", "create quiz", ...]
// Used to match multi-word keywords with synonym substitution.
function expandMultiWordPhrase(phrase: string): string[] {
  const words = phrase.split(' ');
  if (words.length === 0) return [];
  // Build a list of (word → [word, ...synonyms]) for each position.
  const options: string[][] = words.map(w => [w, ...expandSynonyms(w)]);
  // Generate up to ~24 variants (cartesian product, capped).
  let variants: string[] = [''];
  for (const opts of options) {
    const next: string[] = [];
    for (const prefix of variants) {
      for (const o of opts) {
        next.push(prefix ? `${prefix} ${o}` : o);
        if (next.length >= 48) break;
      }
      if (next.length >= 48) break;
    }
    variants = next;
  }
  // Exclude the original phrase — caller already tried it.
  return variants.filter(v => v !== phrase);
}

function findBest(userMessage: string): { entry: KBEntry | null; score: number } {
  const norm = normalize(userMessage);
  if (!norm) return { entry: null, score: 0 };
  const msgWords = new Set(norm.split(' '));
  const msgTextNoStop = stripStopwords(norm);
  const intent = detectIntent(norm);
  let best: KBEntry | null = null;
  let bestScore = 0;
  for (const entry of KB) {
    const s = scoreEntry(entry, msgWords, norm, msgTextNoStop, intent);
    if (s > bestScore) { bestScore = s; best = entry; }
  }
  return { entry: best, score: bestScore };
}

// Top-N closest matches by score (used by the improved fallback). Returns up
// to `n` entries with score > 0, sorted by score desc. If nothing matches at
// all (all scores 0), returns [] so the caller can fall back to the generic
// text fallback.
function findTopN(userMessage: string, n: number): KBEntry[] {
  const norm = normalize(userMessage);
  if (!norm) return [];
  const msgWords = new Set(norm.split(' '));
  const msgTextNoStop = stripStopwords(norm);
  const intent = detectIntent(norm);
  return KB
    .map(entry => ({ entry, score: scoreEntry(entry, msgWords, norm, msgTextNoStop, intent) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map(x => x.entry);
}

// ─────────────────────────── Small Talk Engine ─────────────────────────────
// Handles greetings (hi/hello/hey), thanks, bye, identity, and common
// pleasantries so the bot feels like a real assistant instead of going
// straight to the "I'm not sure I caught that" fallback. Runs BEFORE the
// knowledge base.
type SmallTalk = {
  id: string;
  // Tokens that trigger this reply (matched as whole words in the normalized
  // message). Order matters only for readability.
  triggers: string[];
  // Single reply OR a pick-list (rotates for variety so the bot doesn't
  // feel robotic when greeted multiple times).
  replies: string[];
  // If true, we still ALSO scan the KB afterwards (e.g. "hi" alone → stop,
  // but "hi how do I enroll" → greeting + answer). For pure pleasantries we
  // stop, since the user isn't asking a portal question.
  continueToKB?: boolean;
};

const SMALL_TALK: SmallTalk[] = [
  {
    id: 'greet',
    triggers: ['hi', 'hello', 'hey', 'salam', 'assalam', 'aoa', 'assalamualaikum', 'salaam', 'hola', 'yo', 'hiya', 'heyy', 'hii', 'hiii'],
    replies: [
      "Hi there! 👋 I'm the Concordia Assistant. How can I help you with the portal today?",
      "Hello! 😊 What would you like to do — enroll a student, check fees, enter marks, or something else?",
      "Hey! I can guide you through any portal (Admin, Admissions, Accountant, Academic, Teacher, Student, Parent). What do you need?",
      "Salam! Welcome to Concordia. Tell me what you're trying to do and I'll point you to the right page.",
    ],
    continueToKB: true,
  },
  {
    id: 'good-morning',
    triggers: ['good morning', 'gm', 'morning'],
    replies: [
      "Good morning! ☀️ What can I help you with today?",
      "Morning! Ready to get started? Ask me anything about the portal.",
    ],
    continueToKB: true,
  },
  {
    id: 'good-afternoon',
    triggers: ['good afternoon', 'afternoon'],
    replies: ["Good afternoon! How can I assist you with the portal?"],
    continueToKB: true,
  },
  {
    id: 'good-evening',
    triggers: ['good evening', 'evening'],
    replies: ["Good evening! What would you like help with?"],
    continueToKB: true,
  },
  {
    id: 'how-are-you',
    triggers: ['how are you', 'how r u', 'how are u', 'hows it going', 'how is it going', "how's it going", 'whats up', "what's up", 'wassup', 'sup'],
    replies: [
      "I'm doing great, thanks for asking! 😄 I'm always ready to help you navigate the portal. What do you need?",
      "All good here! I'm a built-in guide, so I'm always on duty. How can I help you today?",
    ],
    continueToKB: true,
  },
  {
    id: 'thanks',
    triggers: ['thanks', 'thank you', 'thx', 'ty', 'thanku', 'thanku so much', 'appreciate', 'appreciate it', 'grateful', 'cheers'],
    replies: [
      "You're welcome! 😊 Anything else I can help with?",
      "Happy to help! Let me know if you need anything else.",
      "Anytime! I'm here whenever you need guidance.",
    ],
    continueToKB: false,
  },
  {
    id: 'welcome',
    triggers: ["you're welcome", 'your welcome', 'no problem', 'np'],
    replies: ["😊 What else can I help you with?"],
    continueToKB: false,
  },
  {
    id: 'bye',
    triggers: ['bye', 'goodbye', 'see you', 'see ya', 'cya', 'later', 'farewell'],
    replies: [
      "Goodbye! 👋 Come back anytime you need help with the portal.",
      "See you later! Have a great day. 😊",
      "Bye for now! I'll be right here when you need me.",
    ],
    continueToKB: false,
  },
  {
    id: 'good-night',
    triggers: ['good night', 'goodnight', 'gn', 'sleep well', 'sweet dreams'],
    replies: [
      "Good night! 🌙 Rest well — I'll be right here when you need me tomorrow.",
      "Sweet dreams! 🌟 See you tomorrow.",
      "Good night! 🌙 Sleep tight — the portal will be here in the morning.",
    ],
    continueToKB: false,
  },
  {
    id: 'ok',
    triggers: ['ok', 'okay', 'okk', 'kk', 'got it', 'understood', 'sounds good', 'great', 'nice', 'cool'],
    replies: [
      "Great! Let me know if you need help with anything else.",
      "👍 Anything else I can help with?",
    ],
    continueToKB: false,
  },
  {
    id: 'yes',
    triggers: ['yes', 'yeah', 'yep', 'yup', 'sure', 'of course'],
    replies: ["Great — tell me what you'd like to do and I'll guide you."],
    continueToKB: true,
  },
  {
    id: 'no',
    triggers: ['no', 'nope', 'nah', 'not really'],
    replies: ["No problem! I'm here if you need anything else. 😊"],
    continueToKB: false,
  },
  {
    id: 'help',
    triggers: ['help', 'help me', 'i need help', 'can you help', 'can u help', 'assist', 'assistance', 'stuck', 'confused', 'lost', 'dont know', "don't know", 'not sure'],
    replies: [
      "Of course! I can help with anything in the portal — Admissions, Accountant, Academic, Teacher, Student, or Parent. Tell me what you're trying to do, or tap a suggestion below.",
      "I'm here to help! 😊 What are you trying to do? You can ask me things like 'How do I enroll a student?' or 'How do I view result cards?'.",
    ],
    continueToKB: true,
  },
  // ─── Identity / capabilities (NEW v2 small talk) ──────────────────────────
  {
    id: 'who-are-you',
    triggers: ['who are you', 'what are you', 'what can you do', 'what can you do for me', 'what do you do', 'your purpose', 'what is your purpose', 'tell me about you'],
    replies: [
      "I'm the Concordia Assistant — a built-in guide for the Concordia College portal. I can help you navigate any of the 7 portals: Admin, Admissions, Accountant, Academic Office, Teacher, Student, and Parent. Just ask me how to do something in plain words and I'll point you to the right page. 😊",
    ],
    continueToKB: false,
  },
  {
    id: 'your-name',
    triggers: ['your name', 'whats your name', "what's your name", 'what is your name', 'who am i talking to', 'your fullname'],
    replies: ["I'm the Concordia Assistant — your in-portal guide. 😊"],
    continueToKB: false,
  },
  {
    id: 'are-you-bot',
    triggers: ['are you a bot', 'are you ai', 'are you artificial', 'are you real', 'are you human', 'are you chatbot', 'are you robot', 'is this a bot', 'are you an ai'],
    replies: [
      "I'm a built-in guide — no AI, just a lot of pre-written answers to help you navigate the portal. 😊 I'm 100% offline and rule-based, so my responses are instant and private.",
    ],
    continueToKB: false,
  },
  {
    id: 'love-you',
    triggers: ['i love you', 'youre awesome', "you're awesome", 'good bot', 'i like you', 'well done', 'great job', 'nice work'],
    replies: [
      "Aww, thank you! 😊 That really made my day. I'm here whenever you need help with the portal.",
      "You're too kind! 💛 I'm always happy to help — just ask me anything.",
    ],
    continueToKB: false,
  },
];

// Rotating index for each small-talk id so the same greeting doesn't repeat.
const smallTalkRotation: Record<string, number> = {};

function pickReply(st: SmallTalk): string {
  const i = smallTalkRotation[st.id] || 0;
  const reply = st.replies[i % st.replies.length];
  smallTalkRotation[st.id] = (i + 1) % st.replies.length;
  return reply;
}

type SmallTalkMatch = { reply: string; continueToKB: boolean };

function matchSmallTalk(userMessage: string): SmallTalkMatch | null {
  const norm = normalize(userMessage);
  if (!norm) return null;
  const words = new Set(norm.split(' '));

  // ── Bulletproof greeting / thanks pre-checks (tolerate "hiiii", "thanksss") ──
  // These run before the trigger loop so a held-down key never produces a
  // fallback. A greeting alone → stop here; a greeting + real question → the
  // caller still scans the KB and appends the answer.
  if (looksLikeGreeting(norm)) {
    const st = SMALL_TALK.find(s => s.id === 'greet');
    if (st) return { reply: pickReply(st), continueToKB: st.continueToKB ?? true };
  }
  if (looksLikeThanks(norm)) {
    const st = SMALL_TALK.find(s => s.id === 'thanks');
    if (st) return { reply: pickReply(st), continueToKB: st.continueToKB ?? false };
  }

  for (const st of SMALL_TALK) {
    if (st.id === 'greet' || st.id === 'thanks') continue; // already handled above
    let hit = false;
    for (const trig of st.triggers) {
      if (trig.includes(' ')) {
        // Multi-word trigger → substring match.
        if (norm.includes(trig)) { hit = true; break; }
      } else {
        if (words.has(trig)) { hit = true; break; }
      }
    }
    if (hit) {
      return { reply: pickReply(st), continueToKB: st.continueToKB ?? false };
    }
  }
  return null;
}

// ─────────────────────────── Context Memory ────────────────────────────────
// Follow-up trigger detection: if the user's message looks like a request to
// continue the previous topic ("what next", "and then", "continue", etc.),
// we advance to the first followUp of the last answered KB entry.

const FOLLOWUP_PHRASES = [
  'and then', 'what next', 'after that', 'what else', 'next step',
  'then what', 'show more', 'tell me more',
];
const FOLLOWUP_WORDS = ['next', 'continue', 'more', 'then', 'also'];

function isFollowupTrigger(norm: string): boolean {
  if (FOLLOWUP_PHRASES.some(p => norm.includes(p))) return true;
  const words = norm.split(' ').filter(w => w.length > 0);
  // Only treat very short messages with a lone follow-up word as a trigger,
  // so "I want more students" (4 words) doesn't fire but "more?" (1 word) does.
  if (words.length <= 3 && FOLLOWUP_WORDS.some(w => words.includes(w))) return true;
  return false;
}

// ─────────────────────────── Suggested Questions ───────────────────────────
// Shown as chips below the welcome message. Intentionally does NOT include
// "Who built you?" — owner questions are answered when asked directly, but
// we don't proactively suggest them. The focus is portal help.
const SUGGESTIONS = [
  'How do I enroll a student?',
  'How do I create an exam?',
  'How do I view result cards?',
  'How do I create a teacher login?',
  'How do I set installment dates?',
  'How do I enter and lock marks?',
  'How do I view my fees and download a challan?',
  "Why am I getting a 'timetable clash' error?",
];

// ─────────────────────────── Chat Types ────────────────────────────────────
type Msg = { role: 'bot' | 'user'; text: string; ts: number; followUps?: string[] };

const WELCOME: Msg = {
  role: 'bot',
  text:
    "Hi! 👋 I'm the Concordia Assistant — your in-portal guide.\n\nI can walk you through anything across the Admin, Admissions, Accountant, Academic, Teacher, Student, and Parent portals. Just type your question in your own words, or tap a suggestion below to get started.",
  ts: Date.now(),
  followUps: [
    'How do I enroll a new student?',
    'How do I create an exam or monthly test?',
    'How do I view my fees and download a challan?',
  ],
};

const FALLBACK =
  "I'm not quite sure I caught that — but I can definitely help you get around! 🙌\n\nTry asking me things like:\n\n• \"How do I enroll a student?\"\n• \"How do I create an exam?\"\n• \"How do I view result cards?\"\n• \"How do I set fee installments?\"\n• \"How do I create a teacher login?\"\n• \"How do I enter marks as a teacher?\"\n• \"How do I view my fees?\"\n• \"Why am I getting a clash error?\"\n\nOr just tell me what you're trying to do — I'll point you to the right page. You can also tap any of the quick suggestions below.";

// ─────────────────────────── Component ─────────────────────────────────────
export function HelpWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Context memory: the last KB entry we answered with. Used to power the
  // follow-up trigger ("what next?" → answer the first followUp question).
  const lastTopicRef = useRef<KBEntry | null>(null);

  // Keyboard shortcut: ? opens, Escape closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (e.key === '?' && !open) { e.preventDefault(); setOpen(true); }
      else if (e.key === 'Escape' && open) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Auto-scroll to bottom on new message / typing change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, typing, open]);

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 200);
  }, [open]);

  const send = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const userMsg: Msg = { role: 'user', text: trimmed, ts: Date.now() };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setTyping(true);

    // Simulate a brief "thinking" delay for a natural feel (still 100% local).
    setTimeout(() => {
      const norm = normalize(trimmed);

      let replyText: string = '';
      let followUps: string[] | undefined;

      // 0) Follow-up to previous topic — user said "what next?" / "and then?" etc.
      //    Advance to the first followUp of the last answered KB entry.
      if (lastTopicRef.current?.followUps?.length && isFollowupTrigger(norm)) {
        const prevQ = lastTopicRef.current.question;
        const nextQuestion = lastTopicRef.current.followUps[0];
        const nextEntry = KB.find(e => e.question === nextQuestion);
        if (nextEntry) {
          replyText = `Continuing from "${prevQ}" — here's the next step:\n\n${nextEntry.answer}`;
          followUps = nextEntry.followUps;
          lastTopicRef.current = nextEntry;
          const reply: Msg = { role: 'bot', text: replyText, ts: Date.now(), followUps };
          setTyping(false);
          setMessages((m) => [...m, reply]);
          return;
        }
      }

      // 1) Small talk (greetings, thanks, identity, etc.) — checked BEFORE KB
      //    so "Hi" doesn't fall to the generic fallback.
      const small = matchSmallTalk(trimmed);
      // 2) Knowledge base — how-to questions about the portals.
      const { entry } = findBest(trimmed);

      if (small && entry) {
        if (small.continueToKB) {
          // e.g. "hi, how do I enroll" → greeting + answer.
          replyText = small.reply + '\n\n' + entry.answer;
          followUps = entry.followUps;
          lastTopicRef.current = entry;
        } else {
          // Identity / pure pleasantries override the KB answer (avoid duplicates).
          replyText = small.reply;
        }
      } else if (entry) {
        replyText = entry.answer;
        followUps = entry.followUps;
        lastTopicRef.current = entry;
      } else if (small) {
        replyText = small.reply;
      } else {
        // 3) Improved fallback — top 3 closest KB entries by score.
        const top3 = findTopN(trimmed, 3);
        if (top3.length > 0) {
          replyText = "I'm not sure I caught that, but these might help:";
          followUps = top3.map(e => e.question);
        } else {
          replyText = FALLBACK;
        }
      }

      const reply: Msg = { role: 'bot', text: replyText, ts: Date.now(), followUps };
      setTyping(false);
      setMessages((m) => [...m, reply]);
    }, 450);
  }, []);

  const handleSuggestion = (q: string) => send(q);

  return (
    <>
      {/* ─── Floating Action Button ─── */}
      <motion.button
        onClick={() => setOpen(true)}
        aria-label="Concordia Assistant"
        className="fixed bottom-5 right-5 z-40 h-12 w-12 rounded-full bg-gradient-to-br from-[#F26522] to-[#D4541E] shadow-lg hover:shadow-xl grid place-items-center text-white transition-shadow"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.5, type: 'spring' }}
      >
        <LifeBuoy className="h-6 w-6" />
        <span className="absolute inset-0 rounded-full bg-[#F26522] animate-ping opacity-20" />
        {/* Unread-style dot to draw the eye */}
        {!open && (
          <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 border-2 border-white" />
        )}
      </motion.button>

      {/* ─── Chat Panel ─── */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
            />

            {/* Panel */}
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed bottom-5 right-5 z-50 w-[min(92vw,420px)] h-[min(80vh,600px)] bg-white border border-gray-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-[#F26522] to-[#D4541E]">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-lg bg-white/15 grid place-items-center">
                    <Bot className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <div className="text-white font-bold text-sm flex items-center gap-1.5">
                      Concordia Assistant
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/90 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                        <span className="h-1.5 w-1.5 rounded-full bg-white" /> ONLINE
                      </span>
                    </div>
                    <div className="text-white/70 text-[11px]">Concordia College · Built by Faisal Khan</div>
                  </div>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close chat"
                  className="h-8 w-8 grid place-items-center rounded-md text-white/80 hover:bg-white/10 hover:text-white transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Messages */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50 scroll-fancy">
                {messages.map((m, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex items-end gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
                  >
                    <div className={`h-7 w-7 rounded-full grid place-items-center shrink-0 ${m.role === 'bot' ? 'bg-[#F26522]/10 text-[#F26522]' : 'bg-gray-200 text-gray-500'}`}>
                      {m.role === 'bot' ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
                    </div>
                    <div
                      className={`max-w-[78%] px-3.5 py-2.5 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed ${
                        m.role === 'bot'
                          ? 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm'
                          : 'bg-[#F26522] text-white rounded-br-sm'
                      }`}
                    >
                      {m.text}
                      {/* Follow-up chips — appear at the end of a bot message */}
                      {m.role === 'bot' && m.followUps && m.followUps.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-gray-100">
                          <div className="flex items-center gap-1 mb-1.5">
                            <Sparkles className="h-2.5 w-2.5 text-[#F26522]" />
                            <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">You might also ask</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {m.followUps.map((q) => (
                              <button
                                key={q}
                                onClick={() => handleSuggestion(q)}
                                className="px-2 py-1 rounded-full border border-gray-200 bg-gray-50 text-[11px] text-gray-700 hover:border-[#F26522]/40 hover:bg-[#F26522]/5 hover:text-[#F26522] transition-colors text-left"
                              >
                                {q}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}

                {/* Typing indicator */}
                {typing && (
                  <div className="flex items-end gap-2">
                    <div className="h-7 w-7 rounded-full grid place-items-center shrink-0 bg-[#F26522]/10 text-[#F26522]">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-white border border-gray-200 shadow-sm">
                      <div className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}

                {/* Messages only — suggestion chips moved to a pinned strip
                    above the input so they're always reachable (like a real
                    chatbot's quick-replies). */}
              </div>

              {/* Pinned quick-replies — always visible above the input so users
                  can tap a common question at any point in the conversation. */}
              {!typing && (
                <div className="border-t border-gray-100 bg-gray-50/80 px-3 pt-2.5 pb-1">
                  <div className="flex items-center gap-1.5 mb-1.5 px-0.5">
                    <Sparkles className="h-3 w-3 text-[#F26522]" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Quick questions</span>
                  </div>
                  <div className="flex gap-1.5 overflow-x-auto pb-2 scroll-fancy" style={{ scrollbarWidth: 'thin' }}>
                    {SUGGESTIONS.map((q) => (
                      <button
                        key={q}
                        onClick={() => handleSuggestion(q)}
                        className="shrink-0 px-2.5 py-1.5 rounded-full border border-gray-200 bg-white text-xs text-gray-600 hover:border-[#F26522]/40 hover:text-[#F26522] transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Input */}
              <div className="border-t border-gray-100 p-3 bg-white">
                <form
                  onSubmit={(e) => { e.preventDefault(); send(input); }}
                  className="flex items-center gap-2"
                >
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask me anything about the portal…"
                    className="flex-1 h-10 rounded-full border border-gray-200 bg-gray-50 px-4 text-sm text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-[#F26522] focus:ring-2 focus:ring-[#F26522]/12 outline-none transition"
                  />
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    aria-label="Send message"
                    className="h-10 w-10 rounded-full bg-[#F26522] hover:bg-[#D4541E] text-white grid place-items-center disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </form>
                <div className="text-center mt-2">
                  <span className="text-[10px] text-gray-400 inline-flex items-center gap-1.5">
                    100% offline · no AI · built by{' '}
                    <a
                      href="https://www.instagram.com/faisu._khan01/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#F26522] hover:underline font-medium inline-flex items-center gap-0.5"
                    >
                      <Instagram className="h-2.5 w-2.5" />
                      Faisal Khan
                    </a>
                    <a
                      href="https://www.linkedin.com/in/faisal-arslan-khan-a3140232a/"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Faisal Khan on LinkedIn"
                      className="text-[#0A66C2] hover:underline"
                    >
                      <Linkedin className="h-2.5 w-2.5" />
                    </a>
                  </span>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

export default HelpWidget;
