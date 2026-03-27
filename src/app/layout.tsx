import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from 'sonner';
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Voltis Anual Economics",
  description: "Sistema experto de análisis energético y optimización de facturas.",
  icons: {
    icon: "/mascota-transparente.png",
    apple: "/mascota-transparente.png",
  },
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable}`}>
      <head>
        <meta name="voltis-audit-v1" content="stable-2026-03-24" />
      </head>
      <body className="min-h-screen flex flex-col antialiased">
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
