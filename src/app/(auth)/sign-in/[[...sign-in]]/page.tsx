import { SignIn } from "@clerk/nextjs";
import { Phone } from "lucide-react";
import Link from "next/link";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="border-b border-border/60 bg-card">
        <div className="container mx-auto flex h-14 items-center px-4">
          <Link href="/" className="flex items-center gap-2 text-foreground hover:text-foreground/80 transition-colors">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Phone className="h-4 w-4 text-primary" />
            </div>
            <span className="text-base font-semibold">VoIP CRM</span>
          </Link>
        </div>
      </header>

      {/* Content */}
      <div className="flex flex-1 items-center justify-center p-4">
        <SignIn
          afterSignInUrl="/dashboard"
          appearance={{
            elements: {
              rootBox: "mx-auto",
              card: "shadow-md border border-border/60",
              headerTitle: "text-foreground",
              headerSubtitle: "text-muted-foreground",
              formButtonPrimary: "bg-primary hover:bg-primary/90",
            }
          }}
        />
      </div>
    </div>
  );
}
