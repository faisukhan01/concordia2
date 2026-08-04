'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/api';
import { useApp } from '@/lib/store';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  LifeBuoy, MessageSquare, Mail, Phone, Clock, Send, Loader2,
  CheckCircle2, AlertTriangle, BookOpen, CreditCard, CalendarDays,
  GraduationCap, Bell, Smartphone, ChevronRight, Lightbulb,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// ─── FAQ categories with questions/answers ─────────────────────────────────
const FAQS: Array<{
  category: string;
  icon: any;
  color: string;
  questions: Array<{ q: string; a: string }>;
}> = [
  {
    category: 'Account & Login',
    icon: LifeBuoy,
    color: 'text-primary',
    questions: [
      {
        q: 'How do I change my password?',
        a: 'Go to Settings → Change Password. Enter your current password, then choose a new one (minimum 4 characters). If you\'re using a password assigned by your administrator, you\'ll see a "Please change your password" banner at the top of every page until you change it.',
      },
      {
        q: 'I forgot my password. What should I do?',
        a: 'Students and teachers should contact the Accountant. The Accountant can reveal your current password via Create Student Logins → Edit. Admin staff can reset passwords from the User Management module.',
      },
      {
        q: 'How do I sign out of all devices?',
        a: 'Go to Settings → Account & Sessions → "Sign out all". This immediately revokes every active session and clears all registered device tokens. You\'ll need to sign in again on every device.',
      },
      {
        q: 'Why am I not receiving notifications when the app is closed?',
        a: 'On Android (especially Realme, Xiaomi, Huawei, Oppo, Vivo), you must enable two settings: (1) Battery Optimization whitelist — Settings → "Enable Battery Whitelist". (2) Auto-start — Settings → "Open Auto-start Settings" → find Concordia College → enable it. Without these, the phone kills the app when closed and blocks notifications.',
      },
    ],
  },
  {
    category: 'Fees & Payments',
    icon: CreditCard,
    color: 'text-emerald-600',
    questions: [
      {
        q: 'When are my fees due?',
        a: 'Monthly fee invoices are generated on the 1st of each month. You\'ll receive a notification when a new invoice is created. Check My Fees to see your current invoices and payment status.',
      },
      {
        q: 'How do I pay my fee?',
        a: 'Fees are paid offline at the Accounts Office. Once the Accountant marks your payment as received, you\'ll get a "Fee payment received" notification and the invoice status will change to "Paid" in My Fees.',
      },
      {
        q: 'Can I see my payment history?',
        a: 'Yes. Go to My Fees → scroll down to the "Payment History" section. All paid invoices are listed with the date, amount, and payment method.',
      },
    ],
  },
  {
    category: 'Attendance & Marks',
    icon: CalendarDays,
    color: 'text-violet-600',
    questions: [
      {
        q: 'How is my attendance calculated?',
        a: 'Attendance is marked daily by your class teacher. Your attendance rate = (sessions present) ÷ (total sessions marked). You receive a notification each time your attendance is marked (present, absent, or late).',
      },
      {
        q: 'When are marks uploaded?',
        a: 'Teachers upload marks after each exam or test. You\'ll receive a notification the moment your marks are entered. Check My Results to see all your marks, or Report Card for the consolidated term report.',
      },
      {
        q: 'I think my marks are wrong. What should I do?',
        a: 'Use the "Report an Issue" form below. Select "Academic" as the category, describe the issue with your roll number and the exam name, and the Academic Office will review it.',
      },
    ],
  },
  {
    category: 'Notifications',
    icon: Bell,
    color: 'text-amber-600',
    questions: [
      {
        q: 'How do I mute specific notification types?',
        a: 'Go to Settings → Notification Preferences. You can toggle individual types (Announcements, Fees, Attendance, Marks, Exams, etc.) on or off. Muted types won\'t create in-app notifications OR push notifications.',
      },
      {
        q: 'What is Do Not Disturb?',
        a: 'DND mutes all non-critical notifications during a set time window (e.g., 10 PM to 7 AM). Critical notifications like app updates always come through. Enable it in Settings → Notification Preferences → Do Not Disturb.',
      },
      {
        q: 'Why do I see a "Concordia notifications are active" notification?',
        a: 'That\'s the keep-alive service notification. It\'s a LOW-priority notification that stays in your shade to tell the Android OS that the app should stay alive for push delivery. It does NOT make a sound. This is the same mechanism WhatsApp and Telegram use. Do NOT swipe it away — if you do, the app might not receive notifications when closed.',
      },
      {
        q: 'Where can I see all my notifications?',
        a: 'Click the bell icon in the navbar for the latest 5, or open the Notifications page from the sidebar for the full list with search, filters, and date grouping.',
      },
    ],
  },
  {
    category: 'Mobile App',
    icon: Smartphone,
    color: 'text-cyan-600',
    questions: [
      {
        q: 'How do I download the mobile app?',
        a: 'Open the sidebar → "Download App" or visit concordia-colleges.vercel.app/download. The APK is always the latest version. Install it over any existing version — your data is preserved.',
      },
      {
        q: 'Why does the app ask for Auto-start permission?',
        a: 'On Realme, Xiaomi, Huawei, Oppo, and Vivo devices, the OS aggressively kills background apps. Without Auto-start enabled, the app can\'t receive push notifications when closed. This is a phone manufacturer restriction, not a bug — WhatsApp is pre-whitelisted, but our app needs you to enable it manually.',
      },
      {
        q: 'The app is slow or showing old data. What should I do?',
        a: 'Pull down to refresh the page. If that doesn\'t help, close the app completely and reopen it. The app checks for updates automatically — if a new version is available, you\'ll see an "Update your Concordia app" notification.',
      },
    ],
  },
];

const ISSUE_CATEGORIES = [
  { id: 'general', label: 'General', icon: LifeBuoy, color: 'text-gray-600' },
  { id: 'academic', label: 'Academic / Marks', icon: GraduationCap, color: 'text-rose-600' },
  { id: 'fee', label: 'Fee / Payment', icon: CreditCard, color: 'text-emerald-600' },
  { id: 'attendance', label: 'Attendance', icon: CalendarDays, color: 'text-violet-600' },
  { id: 'technical', label: 'Technical / App', icon: Smartphone, color: 'text-cyan-600' },
  { id: 'account', label: 'Account / Login', icon: LifeBuoy, color: 'text-amber-600' },
];

export function HelpPage({ user }: { user: any }) {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  const [submitting, setSubmitting] = useState(false);
  const [submittedIssueId, setSubmittedIssueId] = useState<string | null>(null);

  const submit = async () => {
    if (!subject.trim() || subject.trim().length < 3) {
      toast({ title: 'Subject is too short', description: 'Please enter at least 3 characters.', variant: 'destructive' });
      return;
    }
    if (!description.trim() || description.trim().length < 10) {
      toast({ title: 'Description is too short', description: 'Please enter at least 10 characters.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.reportIssue({ subject: subject.trim(), description: description.trim(), category });
      setSubmittedIssueId(res.issueId);
      toast({
        title: 'Issue reported!',
        description: `Reference: ${res.issueId}. The management team has been notified.`,
      });
      setSubject('');
      setDescription('');
      setCategory('general');
    } catch (err: any) {
      toast({ title: 'Could not submit', description: err.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl pb-12">
      {/* ─── Header ─── */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
          <LifeBuoy className="h-6 w-6 text-primary" />
          Help & Support
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Find answers to common questions or report an issue to the management team.
        </p>
      </div>

      {/* ─── Quick contact cards ─── */}
      <div className="grid sm:grid-cols-3 gap-3">
        <Card className="p-4 hover:shadow-md transition-shadow border-border/60">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2 shrink-0">
              <Mail className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email</div>
              <div className="text-sm font-medium mt-0.5 truncate">admin@concordia.edu.pk</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Response within 24 hours</div>
            </div>
          </div>
        </Card>
        <Card className="p-4 hover:shadow-md transition-shadow border-border/60">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-emerald-500/10 p-2 shrink-0">
              <Phone className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Phone</div>
              <div className="text-sm font-medium mt-0.5">+92 300 1234567</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Mon–Fri, 9 AM – 4 PM</div>
            </div>
          </div>
        </Card>
        <Card className="p-4 hover:shadow-md transition-shadow border-border/60">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-amber-500/10 p-2 shrink-0">
              <Clock className="h-4 w-4 text-amber-600" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Office Hours</div>
              <div className="text-sm font-medium mt-0.5">Mon–Fri</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">9:00 AM – 4:00 PM</div>
            </div>
          </div>
        </Card>
      </div>

      {/* ─── FAQs ─── */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="h-4 w-4 text-primary" />
          <h3 className="font-bold text-base">Frequently Asked Questions</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Browse common questions by category. Tap a question to expand the answer.
        </p>
        <Accordion type="single" collapsible className="w-full">
          {FAQS.map((section) => {
            const Icon = section.icon;
            return section.questions.map((qa, idx) => (
              <AccordionItem
                key={`${section.category}-${idx}`}
                value={`${section.category}-${idx}`}
                className="border-border/40"
              >
                <AccordionTrigger className="text-sm hover:no-underline py-3">
                  <div className="flex items-center gap-2 text-left">
                    <Icon className={cn('h-3.5 w-3.5 shrink-0', section.color)} />
                    <span className="font-medium">{qa.q}</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="text-xs text-muted-foreground leading-relaxed pb-3">
                  {qa.a}
                </AccordionContent>
              </AccordionItem>
            ));
          })}
        </Accordion>
      </Card>

      {/* ─── Report an Issue ─── */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-1">
          <MessageSquare className="h-4 w-4 text-primary" />
          <h3 className="font-bold text-base">Report an Issue</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Can\'t find what you\'re looking for? Report an issue and the management team will be notified immediately.
        </p>

        <AnimatePresence mode="wait">
          {submittedIssueId ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center"
            >
              <div className="h-14 w-14 rounded-full bg-emerald-100 grid place-items-center mx-auto mb-3">
                <CheckCircle2 className="h-7 w-7 text-emerald-600" />
              </div>
              <h4 className="font-semibold text-emerald-900 text-sm">Issue submitted successfully!</h4>
              <p className="text-xs text-emerald-700 mt-1">
                Your reference: <span className="font-mono font-semibold">{submittedIssueId}</span>
              </p>
              <p className="text-[11px] text-emerald-600 mt-2">
                The management team has been notified. You\'ll receive a notification when there\'s an update.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4 border-emerald-300 text-emerald-700 hover:bg-emerald-100"
                onClick={() => setSubmittedIssueId(null)}
              >
                Report another issue
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              {/* Category selector */}
              <div>
                <Label className="text-xs mb-2 block">Category</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {ISSUE_CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    const isSelected = category === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setCategory(cat.id)}
                        className={cn(
                          'flex items-center gap-2 rounded-lg border p-2.5 text-xs font-medium transition-all',
                          isSelected
                            ? 'border-primary bg-primary/5 text-primary shadow-sm'
                            : 'border-border/60 bg-card hover:bg-accent/30 text-muted-foreground',
                        )}
                      >
                        <Icon className={cn('h-3.5 w-3.5 shrink-0', isSelected ? 'text-primary' : cat.color)} />
                        <span className="truncate">{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Subject */}
              <div>
                <Label className="text-xs">Subject <span className="text-rose-500">*</span></Label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Brief summary of the issue"
                  className="mt-1 h-11"
                  maxLength={120}
                />
                <div className="text-[10px] text-muted-foreground mt-1 text-right">{subject.length}/120</div>
              </div>

              {/* Description */}
              <div>
                <Label className="text-xs">Description <span className="text-rose-500">*</span></Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the issue in detail. Include any relevant roll numbers, dates, or screenshots."
                  className="mt-1 min-h-[120px] resize-y"
                  maxLength={2000}
                />
                <div className="text-[10px] text-muted-foreground mt-1 text-right">{description.length}/2000</div>
              </div>

              {/* Info banner */}
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-[11px] text-amber-800">
                  Your issue will be sent to all management staff (admin, admissions, accountant, academic).
                  You\'ll receive a confirmation notification with a reference number.
                </div>
              </div>

              <Button
                onClick={submit}
                disabled={submitting || !subject.trim() || !description.trim()}
                className="bg-primary hover:bg-primary/90 text-white w-full sm:w-auto"
              >
                {submitting ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting…</>
                ) : (
                  <><Send className="h-4 w-4 mr-2" /> Submit Issue</>
                )}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {/* ─── Tips ─── */}
      <Card className="p-6 bg-gradient-to-br from-primary/5 to-transparent border-primary/20">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 shrink-0">
            <Lightbulb className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h4 className="font-semibold text-sm">Quick Tips</h4>
            <ul className="text-xs text-muted-foreground mt-2 space-y-1.5">
              <li className="flex items-start gap-2">
                <ChevronRight className="h-3 w-3 mt-0.5 text-primary shrink-0" />
                <span>Enable Auto-start + Battery Whitelist in Settings for reliable notifications.</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="h-3 w-3 mt-0.5 text-primary shrink-0" />
                <span>Check the Notifications page (sidebar) for your full notification history.</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="h-3 w-3 mt-0.5 text-primary shrink-0" />
                <span>Use Notification Preferences to mute types you don\'t want to receive.</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="h-3 w-3 mt-0.5 text-primary shrink-0" />
                <span>Keep the app updated — new versions fix bugs and add features.</span>
              </li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}
