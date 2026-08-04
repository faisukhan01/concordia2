import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Concordia College — Management Portal",
  description: "Concordia College management portal for administration, staff, teachers, and students. Admissions, attendance, fees, academics, HR, finance, library, transport & more — all in one place.",
  keywords: ["Concordia College", "School Management", "Education Portal", "Admissions", "Attendance", "Fees", "Academics", "ERP"],
  authors: [{ name: "Concordia College" }],
  manifest: "/manifest.json",
  applicationName: "Concordia College",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Concordia College",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/concordia-logo.png", sizes: "any" },
      { url: "/app-icon.png", sizes: "192x192", type: "image/png" },
      { url: "/app-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/app-icon.png", sizes: "192x192", type: "image/png" },
      { url: "/app-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: ["/app-icon.png"],
  },
  openGraph: {
    title: "Concordia College — Management Portal",
    description: "Manage your entire institution from a single platform.",
    siteName: "Concordia College",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Concordia College — Management Portal",
    description: "Manage your entire institution from a single platform.",
  },
};

export const viewport: Viewport = {
  themeColor: "#F26522",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
