"use client";

import { Phone } from "lucide-react";
import Link from "next/link";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      {/* Simple header - no sidebar */}
      <header className="border-b border-border/60 bg-card">
        <div className="container mx-auto flex h-14 items-center px-4">
          <Link href="/" className="flex items-center gap-2 text-foreground">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Phone className="h-4 w-4 text-primary" />
            </div>
            <span className="text-base font-semibold">VoIP CRM</span>
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}
