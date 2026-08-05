'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { api } from '@/lib/api';
import { useApp } from '@/lib/store';
import { isNativeApp, getFcmBridgeDiagnostics } from '@/lib/fcm-bridge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  User, Lock, Eye, EyeOff, CheckCircle2, Mail, Shield, Loader2, Phone,
  Bell, BellOff, Volume2, VolumeX, Moon, Clock, Smartphone, Monitor,
  LogOut, Info, Building2, Calendar, Fingerprint, Wifi, Activity,
  ChevronRight, Save, AlertTriangle, BookOpen, Heart, Camera,
  Send, ShieldAlert, XCircle,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';

// v4.6.0: HealthCheck — a small status row used in the Notification Health card.
function HealthCheck({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-background p-2.5">
      <div className={`h-6 w-6 rounded-full grid place-items-center shrink-0 ${ok ? 'bg-emerald-100' : 'bg-amber-100'}`}>
        {ok ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
        ) : (
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-medium truncate">{label}</div>
        {detail && <div className="text-[10px] text-muted-foreground truncate">{detail}</div>}
      </div>
    </div>
  );
}

// ───────────────────────── Notification type metadata ─────────────────────────
// Maps the internal notification type to a human label, icon, and description
// shown on the Settings → Notification Preferences card.
const NOTIF_TYPES: Array<{
  id: string;
  label: string;
  description: string;
  icon: any;
  color: string;
}> = [
  { id: 'announcement', label: 'Announcements', description: 'College-wide notices and news', icon: Bell, color: 'text-blue-600' },
  { id: 'fee-paid', label: 'Fee Payments', description: 'When your fee is marked paid', icon: CheckCircle2, color: 'text-emerald-600' },
  { id: 'fee-due', label: 'Fee Due Reminders', description: 'Upcoming and overdue invoices', icon: AlertTriangle, color: 'text-amber-600' },
  { id: 'attendance', label: 'Attendance', description: 'Daily attendance markings', icon: Calendar, color: 'text-violet-600' },
  { id: 'result', label: 'Marks & Results', description: 'When your marks are uploaded', icon: BookOpen, color: 'text-rose-600' },
  { id: 'exam', label: 'Exams & Date Sheets', description: 'New exams and schedule updates', icon: Clock, color: 'text-cyan-600' },
  { id: 'salary', label: 'Salary Credits', description: 'When your salary is paid', icon: CheckCircle2, color: 'text-emerald-600' },
  { id: 'general', label: 'General', description: 'Other college notifications', icon: Info, color: 'text-gray-600' },
];

function parseTimestamp(ts: any): number | null {
  if (!ts) return null;
  // Case 1: epoch milliseconds (number) — sessions table uses Date.now().
  if (typeof ts === 'number') return ts;
  // Case 2: numeric string (epoch millis) — try parseInt.
  if (typeof ts === 'string' && /^\d+$/.test(ts.trim())) {
    const n = parseInt(ts, 10);
    return isNaN(n) ? null : n;
  }
  // Case 3: ISO datetime string — device_tokens.lastSeen uses SQLite
  // datetime('now') which returns "YYYY-MM-DD HH:MM:SS" (UTC, no 'Z').
  // We append 'Z' so JS parses it as UTC, not local time.
  if (typeof ts === 'string') {
    let normalized = ts.trim();
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(normalized) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized)) {
      normalized = normalized.replace(' ', 'T') + 'Z';
    }
    const d = new Date(normalized);
    return isNaN(d.getTime()) ? null : d.getTime();
  }
  return null;
}

function formatTimestamp(ts: any): string {
  const n = parseTimestamp(ts);
  if (n === null) return '—';
  try {
    const d = new Date(n);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 0) return 'Just now'; // future timestamp (clock skew)
    if (diff < 60_000) return 'Just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hr ago`;
    if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} days ago`;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
}

function formatDateTime(ts: any): string {
  const n = parseTimestamp(ts);
  if (n === null) return '—';
  try {
    return new Date(n).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export function SettingsPage({ user }: { user: any }) {
  const setUser = useApp(s => s.setUser);
  const logout = useApp(s => s.logout);

  // ─── Password form state ───
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);

  // ─── Profile photo state ───
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(user?.photoUrl || null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ─── Notification preferences state ───
  const [prefs, setPrefs] = useState<{
    mutedTypes: string[];
    soundEnabled: boolean;
    dndEnabled: boolean;
    dndStart: string;
    dndEnd: string;
  } | null>(null);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsDirty, setPrefsDirty] = useState(false);

  // ─── Session info state ───
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [logoutAllLoading, setLogoutAllLoading] = useState(false);

  // ─── Native diagnostics ───
  const [nativeInfo, setNativeInfo] = useState<{ isNative: boolean; appVersion: string | null }>({
    isNative: false, appVersion: null,
  });
  // v4.6.0: Bridge diagnostics for the Notification Health card.
  const [bridgeDiag, setBridgeDiag] = useState<any>(null);
  const [testNotifLoading, setTestNotifLoading] = useState(false);
  const appUpdateAvailable = useApp((s: any) => s.appUpdateAvailable);
  const latestVersion = useApp((s: any) => s.latestAppVersion);

  useEffect(() => {
    const diag = getFcmBridgeDiagnostics() as any;
    setNativeInfo({
      isNative: isNativeApp(),
      appVersion: diag?.appVersion || null,
    });
    setBridgeDiag(diag);
    // Refresh diagnostics every 5 seconds (in case the FCM token arrives late).
    const interval = setInterval(() => {
      setBridgeDiag(getFcmBridgeDiagnostics());
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // ─── Load preferences + session info on mount ───
  const loadPrefs = useCallback(async () => {
    try {
      const p = await api.getNotificationPreferences();
      setPrefs({
        mutedTypes: p.mutedTypes || [],
        soundEnabled: p.soundEnabled !== false,
        dndEnabled: p.dndEnabled === true,
        dndStart: p.dndStart || '22:00',
        dndEnd: p.dndEnd || '07:00',
      });
      setPrefsDirty(false);
    } catch (err: any) {
      // Silent fail — defaults will be used.
      setPrefs({
        mutedTypes: [],
        soundEnabled: true,
        dndEnabled: false,
        dndStart: '22:00',
        dndEnd: '07:00',
      });
    }
  }, []);

  const loadSession = useCallback(async () => {
    setSessionLoading(true);
    try {
      const info = await api.getSessionInfo();
      setSessionInfo(info);
    } catch {
      // silent
    } finally {
      setSessionLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPrefs();
    loadSession();
  }, [loadPrefs, loadSession]);

  // ─── Password change ───
  const submitPassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({ title: 'All fields are required', variant: 'destructive' });
      return;
    }
    if (newPassword.length < 4) {
      toast({ title: 'Password too short', description: 'Use at least 4 characters', variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    if (newPassword === currentPassword) {
      toast({ title: 'Choose a different password', variant: 'destructive' });
      return;
    }
    setSavingPwd(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setUser({ ...user, mustChangePassword: false });
      toast({ title: 'Password updated!', description: 'Your password has been changed successfully.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      const msg = err.message || 'Unknown error';
      if (msg.includes('incorrect') || msg.includes('401') || msg.includes('Current password')) {
        toast({ title: 'Wrong password', description: 'The current password you entered is incorrect. Please try again.', variant: 'destructive' });
      } else if (msg.includes('short')) {
        toast({ title: 'Password too short', description: 'New password must be at least 4 characters.', variant: 'destructive' });
      } else if (msg.includes('Authentication') || msg.includes('session') || msg.includes('expired')) {
        toast({ title: 'Session expired', description: 'Please sign out and sign in again.', variant: 'destructive' });
      } else {
        toast({ title: 'Could not update password', description: msg, variant: 'destructive' });
      }
    } finally {
      setSavingPwd(false);
    }
  };

  // ─── Preferences handlers ───
  const toggleMute = (typeId: string) => {
    if (!prefs) return;
    const isMuted = prefs.mutedTypes.includes(typeId);
    const next = isMuted
      ? prefs.mutedTypes.filter(t => t !== typeId)
      : [...prefs.mutedTypes, typeId];
    setPrefs({ ...prefs, mutedTypes: next });
    setPrefsDirty(true);
  };

  const toggleSound = () => {
    if (!prefs) return;
    setPrefs({ ...prefs, soundEnabled: !prefs.soundEnabled });
    setPrefsDirty(true);
  };

  const toggleDnd = () => {
    if (!prefs) return;
    setPrefs({ ...prefs, dndEnabled: !prefs.dndEnabled });
    setPrefsDirty(true);
  };

  const setDndTime = (field: 'dndStart' | 'dndEnd', value: string) => {
    if (!prefs) return;
    setPrefs({ ...prefs, [field]: value });
    setPrefsDirty(true);
  };

  const savePrefs = async () => {
    if (!prefs) return;
    setSavingPrefs(true);
    try {
      await api.saveNotificationPreferences(prefs);
      setPrefsDirty(false);
      toast({
        title: 'Preferences saved',
        description: prefs.dndEnabled
          ? `You'll be muted from ${prefs.dndStart} to ${prefs.dndEnd} daily.`
          : 'Your notification preferences have been updated.',
      });
    } catch (err: any) {
      toast({ title: 'Could not save preferences', description: err.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setSavingPrefs(false);
    }
  };

  // ─── Sign out of all devices ───
  const signOutAll = async () => {
    setLogoutAllLoading(true);
    try {
      await api.logoutAllDevices();
      toast({
        title: 'Signed out everywhere',
        description: 'All your sessions and device tokens have been revoked.',
      });
      // Brief delay so the toast shows before redirect.
      setTimeout(() => {
        logout();
        if (typeof window !== 'undefined') window.location.href = '/';
      }, 800);
    } catch (err: any) {
      toast({ title: 'Could not sign out', description: err.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setLogoutAllLoading(false);
    }
  };

  // ─── Profile photo handlers ───
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Validate type.
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid file', description: 'Please select an image file.', variant: 'destructive' });
      return;
    }
    // Validate size (2MB).
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'Image too large', description: 'Max size is 2MB.', variant: 'destructive' });
      return;
    }
    setPhotoUploading(true);
    try {
      // Convert to base64 data URL.
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        try {
          await api.uploadProfilePhoto(dataUrl);
          setPhotoUrl(dataUrl);
          setUser({ ...user, photoUrl: dataUrl });
          toast({ title: 'Photo updated!', description: 'Your profile photo has been updated.' });
        } catch (err: any) {
          toast({ title: 'Upload failed', description: err.message || 'Unknown error', variant: 'destructive' });
        } finally {
          setPhotoUploading(false);
        }
      };
      reader.onerror = () => {
        setPhotoUploading(false);
        toast({ title: 'Upload failed', description: 'Could not read the file.', variant: 'destructive' });
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setPhotoUploading(false);
      toast({ title: 'Upload failed', description: err.message || 'Unknown error', variant: 'destructive' });
    }
    // Clear the input so selecting the same file again triggers onChange.
    e.target.value = '';
  };

  const handlePhotoRemove = async () => {
    setPhotoUploading(true);
    try {
      await api.removeProfilePhoto();
      setPhotoUrl(null);
      setUser({ ...user, photoUrl: null });
      toast({ title: 'Photo removed', description: 'Your profile photo has been removed.' });
    } catch (err: any) {
      toast({ title: 'Could not remove', description: err.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setPhotoUploading(false);
    }
  };

  // ─── User initials for avatar fallback ───
  const userInitials = (user?.name || user?.email || '?')
    .split(' ')
    .map((s: string) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  // ─── App version for "About" section ───
  const appVersion = nativeInfo.appVersion || '4.6.2';

  return (
    <div className="space-y-6 max-w-4xl pb-12">
      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your account, security, and notification preferences.
          </p>
        </div>
        {nativeInfo.isNative && (
          <Badge variant="secondary" className="self-start sm:self-auto rounded-full px-3 py-1 gap-1.5">
            <Smartphone className="h-3 w-3" /> Mobile App · v{appVersion}
          </Badge>
        )}
      </div>

      {/* ─── Profile Information ─── */}
      <Card className="p-6">
        <h3 className="font-bold text-base mb-4 flex items-center gap-2">
          <User className="h-4 w-4 text-primary" /> Profile Information
        </h3>

        {/* Profile photo uploader */}
        <div className="flex items-center gap-4 mb-4 pb-4 border-b border-border/40">
          <div className="relative shrink-0">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={user?.name || 'Profile'}
                className="h-20 w-20 rounded-full object-cover border-2 border-primary/20 shadow-sm"
              />
            ) : (
              <div className="h-20 w-20 rounded-full bg-gradient-to-br from-primary to-primary/70 grid place-items-center text-white text-2xl font-bold shadow-sm">
                {userInitials}
              </div>
            )}
            {photoUploading && (
              <div className="absolute inset-0 rounded-full bg-black/40 grid place-items-center">
                <Loader2 className="h-5 w-5 text-white animate-spin" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">Profile Photo</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              JPEG, PNG, or WebP. Max 2MB. Square images work best.
            </div>
            <div className="flex items-center gap-2 mt-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePhotoSelect}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={photoUploading}
                onClick={() => fileInputRef.current?.click()}
                className="h-8 text-xs"
              >
                {photoUploading ? (
                  <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> Uploading…</>
                ) : (
                  <><Camera className="h-3 w-3 mr-1.5" /> {photoUrl ? 'Change' : 'Upload'}</>
                )}
              </Button>
              {photoUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={photoUploading}
                  onClick={handlePhotoRemove}
                  className="h-8 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-xl bg-muted/40 p-3 border border-border/40">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <User className="h-3 w-3" /> Name
            </div>
            <div className="font-medium text-sm mt-1">{user?.name || '—'}</div>
          </div>
          <div className="rounded-xl bg-muted/40 p-3 border border-border/40">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Shield className="h-3 w-3" /> Role
            </div>
            <div className="font-medium text-sm mt-1">{user?.roleLabel || '—'}</div>
          </div>
          <div className="rounded-xl bg-muted/40 p-3 border border-border/40">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Mail className="h-3 w-3" /> Email
            </div>
            <div className="font-medium text-sm mt-1 truncate">{user?.email || '—'}</div>
          </div>
          {user?.rollNo && (
            <div className="rounded-xl bg-muted/40 p-3 border border-border/40">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Fingerprint className="h-3 w-3" /> Roll No / ID
              </div>
              <div className="font-medium text-sm mt-1 font-mono">{user.rollNo}</div>
            </div>
          )}
          {(user?.guardian || user?.fatherName) && (
            <div className="rounded-xl bg-muted/40 p-3 border border-border/40">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <User className="h-3 w-3" /> Father / Guardian
              </div>
              <div className="font-medium text-sm mt-1">{user?.guardian || user?.fatherName || '—'}</div>
            </div>
          )}
          {user?.guardianPhone && (
            <div className="rounded-xl bg-muted/40 p-3 border border-border/40">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Phone className="h-3 w-3" /> Guardian Contact
              </div>
              <div className="font-medium text-sm mt-1">{user.guardianPhone}</div>
            </div>
          )}
          {user?.instituteName && (
            <div className="rounded-xl bg-muted/40 p-3 border border-border/40">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Building2 className="h-3 w-3" /> Institute
              </div>
              <div className="font-medium text-sm mt-1">{user.instituteName}</div>
            </div>
          )}
          {user?.branchName && (
            <div className="rounded-xl bg-muted/40 p-3 border border-border/40">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Building2 className="h-3 w-3" /> Branch
              </div>
              <div className="font-medium text-sm mt-1">{user.branchName}</div>
            </div>
          )}
        </div>
      </Card>

      {/* ─── Notification Preferences ─── */}
      <Card className="p-6">
        <div className="flex items-start justify-between mb-1">
          <div>
            <h3 className="font-bold text-base flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" /> Notification Preferences
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Choose which notifications you receive and when. Critical app updates always come through.
            </p>
          </div>
          {prefsDirty && (
            <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">
              Unsaved changes
            </Badge>
          )}
        </div>

        {!prefs ? (
          <div className="py-8 flex items-center justify-center">
            <Loader2 className="h-5 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Sound toggle + DND */}
            <div className="grid sm:grid-cols-2 gap-3 mt-4">
              <div className="rounded-xl border border-border/60 p-4 flex items-center justify-between gap-3 bg-muted/20">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="rounded-lg bg-primary/10 p-2 shrink-0">
                    {prefs.soundEnabled ? (
                      <Volume2 className="h-4 w-4 text-primary" />
                    ) : (
                      <VolumeX className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium">Notification sound</div>
                    <div className="text-[11px] text-muted-foreground">
                      Play a chime when new notifications arrive.
                    </div>
                  </div>
                </div>
                <Switch checked={prefs.soundEnabled} onCheckedChange={toggleSound} />
              </div>

              <div className="rounded-xl border border-border/60 p-4 flex items-center justify-between gap-3 bg-muted/20">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="rounded-lg bg-primary/10 p-2 shrink-0">
                    <Moon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium">Do Not Disturb</div>
                    <div className="text-[11px] text-muted-foreground">
                      Mute all non-critical notifications during set hours.
                    </div>
                  </div>
                </div>
                <Switch checked={prefs.dndEnabled} onCheckedChange={toggleDnd} />
              </div>
            </div>

            {/* DND time range */}
            {prefs.dndEnabled && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                  <div className="text-xs font-semibold text-primary flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" /> Quiet hours
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-[11px] text-muted-foreground">From</Label>
                    <Input
                      type="time"
                      value={prefs.dndStart}
                      onChange={e => setDndTime('dndStart', e.target.value)}
                      className="w-32 h-9 text-sm"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-[11px] text-muted-foreground">To</Label>
                    <Input
                      type="time"
                      value={prefs.dndEnd}
                      onChange={e => setDndTime('dndEnd', e.target.value)}
                      className="w-32 h-9 text-sm"
                    />
                  </div>
                  <div className="text-[11px] text-muted-foreground sm:ml-auto">
                    Overnight windows supported (e.g. 22:00 → 07:00).
                  </div>
                </div>
              </motion.div>
            )}

            <Separator className="my-4" />

            {/* Per-type mute grid */}
            <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
              Notification types
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              {NOTIF_TYPES.map(t => {
                const muted = prefs.mutedTypes.includes(t.id);
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => toggleMute(t.id)}
                    className={`text-left rounded-xl border p-3 transition-all flex items-start gap-3 group ${
                      muted
                        ? 'border-border/40 bg-muted/20 opacity-60'
                        : 'border-border/60 bg-card hover:border-primary/40 hover:bg-accent/30'
                    }`}
                  >
                    <div className={`rounded-lg p-2 shrink-0 ${muted ? 'bg-muted' : 'bg-primary/10'}`}>
                      <Icon className={`h-4 w-4 ${muted ? 'text-muted-foreground' : t.color}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium flex items-center gap-1.5">
                        {t.label}
                        {muted && <BellOff className="h-3 w-3 text-muted-foreground" />}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{t.description}</div>
                    </div>
                    <Switch checked={!muted} onCheckedChange={() => toggleMute(t.id)} className="scale-90" />
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
              <div className="text-[11px] text-muted-foreground">
                {prefs.mutedTypes.length > 0 ? (
                  <span>{prefs.mutedTypes.length} type{prefs.mutedTypes.length === 1 ? '' : 's'} muted</span>
                ) : (
                  <span>All notification types are enabled</span>
                )}
              </div>
              <Button
                onClick={savePrefs}
                disabled={!prefsDirty || savingPrefs}
                className="bg-primary hover:bg-primary/90 text-white"
              >
                {savingPrefs ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</>
                ) : (
                  <><Save className="h-4 w-4 mr-2" /> Save preferences</>
                )}
              </Button>
            </div>
          </>
        )}
      </Card>

      {/* ─── v4.6.0: Notification Health & Test ─── */}
      <Card className="p-6">
        <h3 className="font-bold text-base mb-1 flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-primary" /> Notification Health
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          Verify your device is ready to receive notifications — even when the app is closed.
        </p>

        {/* Health checks grid */}
        <div className="grid sm:grid-cols-2 gap-2.5 mb-4">
          <HealthCheck
            label="FCM token registered"
            ok={!!bridgeDiag?.hasFcmToken}
            detail={bridgeDiag?.hasFcmToken ? `${bridgeDiag.fcmTokenPreview || 'Token set'}` : 'Not registered yet'}
          />
          <HealthCheck
            label="Native bridge connected"
            ok={!!bridgeDiag?.isNativeApp}
            detail={bridgeDiag?.isNativeApp ? 'Flutter WebView active' : 'Running in browser'}
          />
          <HealthCheck
            label="FCM bridge ready"
            ok={!!bridgeDiag?.fcmReady}
            detail={bridgeDiag?.fcmReady ? 'Background handler active' : 'Waiting for init…'}
          />
          <HealthCheck
            label="App version"
            ok={!!appVersion && appVersion !== '4.5.0' && appVersion !== '4.5.1'}
            detail={`v${appVersion}${appUpdateAvailable ? ` · Update available (v${latestVersion})` : ' · Latest'}`}
          />
        </div>

        {/* Test button */}
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 p-3.5">
          <div className="min-w-0">
            <div className="text-sm font-medium">Send a test notification</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Checks if your device can receive push notifications right now.
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              try {
                setTestNotifLoading(true);
                const res = await api.testNotifications();
                if (res.fcmSuccess > 0) {
                  toast({ title: '✓ Test sent', description: `Delivered to ${res.fcmSuccess} device(s). Check your notifications.` });
                } else {
                  toast({ title: 'Test sent', description: 'No devices received the push. Make sure the app is open and FCM is configured.', variant: 'destructive' });
                }
              } catch (e: any) {
                toast({ title: 'Failed', description: e?.message || 'Could not send test.', variant: 'destructive' });
              } finally {
                setTestNotifLoading(false);
              }
            }}
            disabled={testNotifLoading}
            className="shrink-0"
          >
            {testNotifLoading ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Sending…</>
            ) : (
              <><Send className="h-3.5 w-3.5 mr-1.5" /> Test now</>
            )}
          </Button>
        </div>

        {/* OEM guidance */}
        {nativeInfo.isNative && (
          <div className="mt-3 rounded-xl bg-amber-50/60 border border-amber-200/60 p-3.5">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="min-w-0 text-[12px] text-amber-800">
                <strong>Not receiving notifications when the app is closed?</strong>
                <br />
                On Realme/Xiaomi/Oppo devices, you must enable <strong>Auto-start</strong> +
                <strong> Battery Whitelist</strong> for Concordia College in your phone's Settings.
                The app prompts you to do this on first launch — if you dismissed it, reinstall
                or update to see the prompt again.
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* ─── Account & Sessions ─── */}
      <Card className="p-6">
        <h3 className="font-bold text-base mb-4 flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" /> Account & Sessions
        </h3>

        {sessionLoading ? (
          <div className="py-8 flex items-center justify-center">
            <Loader2 className="h-5 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="grid sm:grid-cols-3 gap-3 mb-4">
              <div className="rounded-xl bg-muted/40 p-3 border border-border/40">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Last login
                </div>
                <div className="font-medium text-sm mt-1">
                  {formatTimestamp(sessionInfo?.lastLogin?.issuedAt)}
                </div>
                {sessionInfo?.lastLogin && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {formatDateTime(sessionInfo.lastLogin.issuedAt)}
                  </div>
                )}
              </div>
              <div className="rounded-xl bg-muted/40 p-3 border border-border/40">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Monitor className="h-3 w-3" /> Active sessions
                </div>
                <div className="font-medium text-sm mt-1">
                  {sessionInfo?.activeSessions ?? 0} <span className="text-muted-foreground text-xs">device(s)</span>
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  Including this one
                </div>
              </div>
              <div className="rounded-xl bg-muted/40 p-3 border border-border/40">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Smartphone className="h-3 w-3" /> Registered devices
                </div>
                <div className="font-medium text-sm mt-1">
                  {sessionInfo?.activeDevices ?? 0} <span className="text-muted-foreground text-xs">device(s)</span>
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  For push notifications
                </div>
              </div>
            </div>

            {/* Devices list */}
            {Array.isArray(sessionInfo?.devices) && sessionInfo.devices.length > 0 && (
              <div className="rounded-xl border border-border/60 overflow-hidden">
                <div className="bg-muted/30 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Devices registered for push notifications
                </div>
                <div className="divide-y divide-border/40 max-h-56 overflow-y-auto">
                  {sessionInfo.devices.map((d: any, i: number) => (
                    <div key={d.id || i} className="px-3 py-2.5 flex items-center gap-3">
                      <div className={`rounded-lg p-1.5 ${i === 0 ? 'bg-emerald-50' : 'bg-muted'}`}>
                        {d.platform === 'ios' ? (
                          <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : d.platform === 'web' ? (
                          <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <Smartphone className={`h-3.5 w-3.5 ${i === 0 ? 'text-emerald-600' : 'text-muted-foreground'}`} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium capitalize">
                          {d.platform || 'android'}
                          {i === 0 && (
                            <Badge variant="outline" className="ml-2 text-[9px] py-0 px-1.5 border-emerald-300 text-emerald-700 bg-emerald-50">
                              Most recent
                            </Badge>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          Last seen {formatTimestamp(d.lastSeen)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sign out all devices */}
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50/50 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-rose-100 p-2 shrink-0">
                  <LogOut className="h-4 w-4 text-rose-600" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-rose-900">Sign out of all devices</div>
                  <div className="text-[11px] text-rose-700/80 mt-0.5">
                    Revokes every active session and clears all registered device tokens. You'll need to sign in again on every device.
                  </div>
                </div>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="border-rose-300 text-rose-700 hover:bg-rose-100 hover:text-rose-800 shrink-0"
                    disabled={logoutAllLoading}
                  >
                    {logoutAllLoading ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Signing out…</>
                    ) : (
                      <><LogOut className="h-4 w-4 mr-2" /> Sign out all</>
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Sign out of all devices?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will immediately end <strong>every active session</strong> for your account, including this one. You'll be redirected to the login page. Any device registered for push notifications will also be deregistered.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={signOutAll}
                      className="bg-rose-600 hover:bg-rose-700 text-white"
                    >
                      Yes, sign out everywhere
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </>
        )}
      </Card>

      {/* ─── Change Password ─── */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-base flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary" /> Change Password
          </h3>
          {user?.mustChangePassword && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent border border-accent px-2.5 py-1 text-[11px] font-medium text-primary">
              <Shield className="h-3 w-3" /> Action required
            </span>
          )}
        </div>

        {user?.mustChangePassword && (
          <div className="rounded-xl bg-accent border border-accent p-3 mb-4">
            <p className="text-sm text-primary">
              <strong>Please change your password.</strong> You're using a password assigned by your administrator. Change it now to secure your account.
            </p>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <Label className="text-xs">Current password</Label>
            <div className="relative mt-1">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type={showCurrent ? 'text' : 'password'} value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)} className="pl-10 pr-10 h-11"
                placeholder="Enter current password"
                autoComplete="current-password"
              />
              <button type="button" onClick={() => setShowCurrent(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <Label className="text-xs">New password</Label>
            <div className="relative mt-1">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type={showNew ? 'text' : 'password'} value={newPassword}
                onChange={e => setNewPassword(e.target.value)} className="pl-10 pr-10 h-11"
                placeholder="Enter new password"
                autoComplete="new-password"
              />
              <button type="button" onClick={() => setShowNew(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <Label className="text-xs">Confirm new password</Label>
            <div className="relative mt-1">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type={showConfirm ? 'text' : 'password'} value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)} className="pl-10 pr-10 h-11"
                placeholder="Re-enter new password"
                autoComplete="new-password"
              />
              <button type="button" onClick={() => setShowConfirm(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button
            className="bg-primary hover:bg-primary/90 text-white"
            disabled={savingPwd || !currentPassword || !newPassword || !confirmPassword}
            onClick={submitPassword}
          >
            {savingPwd ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Updating…</> : <><CheckCircle2 className="h-4 w-4 mr-2" /> Update Password</>}
          </Button>
        </div>
      </Card>

      {/* ─── About App ─── */}
      <Card className="p-6">
        <h3 className="font-bold text-base mb-4 flex items-center gap-2">
          <Info className="h-4 w-4 text-primary" /> About
        </h3>
        <div className="grid sm:grid-cols-2 gap-3 mb-4">
          <div className="rounded-xl bg-muted/40 p-3 border border-border/40">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Smartphone className="h-3 w-3" /> App version
            </div>
            <div className="font-medium text-sm mt-1">v{appVersion}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {nativeInfo.isNative ? 'Mobile app (Flutter WebView)' : 'Web browser'}
            </div>
          </div>
          <div className="rounded-xl bg-muted/40 p-3 border border-border/40">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Wifi className="h-3 w-3" /> Platform
            </div>
            <div className="font-medium text-sm mt-1">
              {nativeInfo.isNative ? 'Android · Concordia College' : 'Concordia Web Portal'}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {nativeInfo.isNative ? 'Native shell + WebView' : 'Next.js web app'}
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border/60 bg-gradient-to-br from-primary/5 to-transparent p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2 shrink-0">
              <Heart className="h-4 w-4 text-primary" />
            </div>
            <div className="text-xs text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Concordia College Management Portal.</strong> Built for staff, students, and parents to manage academics, fees, attendance, and announcements in one place. For support, contact your institute administrator.
              <div className="mt-2 text-[10px]">© {new Date().getFullYear()} Concordia College · All rights reserved.</div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
