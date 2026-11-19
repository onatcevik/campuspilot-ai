import type { Metadata } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { FeedbackProvider } from "@/components/feedback";
import { CampusProvider } from "@/lib/store";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], axes: ["SOFT", "opsz"] });

export const metadata: Metadata = {
  title: "CampusPilot AI — Student Operating System",
  description: "Plan smarter. Stay on track. Graduate with confidence.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${jakarta.variable} ${fraunces.variable} antialiased`}>
        <CampusProvider>
          <FeedbackProvider>
            <AppShell>{children}</AppShell>
          </FeedbackProvider>
        </CampusProvider>
      </body>
    </html>
  );
}
