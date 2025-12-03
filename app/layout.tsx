import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Header from "@/components/shared/Header";
import { ThemeProvider } from "@/contexts/ThemeContext";
import StorageCleanup from "@/components/shared/StorageCleanup";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ANISH TOEIC - Speaking & Writing Lab",
  description: "TOEIC Speaking and Writing Assessment Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ThemeProvider>
          <StorageCleanup />
          <Header />
          <main className="min-h-screen">{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
