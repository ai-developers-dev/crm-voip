import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Phone, Users, Headphones, BarChart3, ArrowRight, CheckCircle2 } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/60 bg-card">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Phone className="h-4 w-4 text-primary" />
            </div>
            <span className="text-base font-semibold">VoIP CRM</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/sign-in">
              <Button variant="ghost" size="sm">Sign In</Button>
            </Link>
            <Link href="/sign-up">
              <Button size="sm">Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b border-border/40 bg-card">
        <div className="container mx-auto px-4 py-20 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/50 px-3 py-1 text-sm text-muted-foreground mb-6">
            <span className="flex h-2 w-2 rounded-full bg-primary"></span>
            Now with real-time call analytics
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Modern VoIP CRM for
            <span className="text-primary"> Growing Teams</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Real-time calling dashboard with drag-and-drop call management,
            parking, transfers, and comprehensive call logging.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link href="/sign-up">
              <Button size="lg" className="gap-2">
                Start Free Trial
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="#features">
              <Button size="lg" variant="outline">
                Learn More
              </Button>
            </Link>
          </div>
          <div className="mt-8 flex items-center justify-center gap-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Free 14-day trial
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              No credit card required
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Cancel anytime
            </span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="container mx-auto px-4 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold">
            Everything you need to manage calls
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Built for modern call centers with real-time collaboration features
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 mb-3">
                <Phone className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-base">Real-Time Dashboard</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-sm">
                See all agents and their call status in real-time. Incoming
                calls appear as popup notifications.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 mb-3">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-base">Call Transfer</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-sm">
                Drag and drop calls between agents. Support for blind and warm
                transfers.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 mb-3">
                <Headphones className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-base">Call Parking</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-sm">
                Park calls in numbered slots with hold music. Any agent can
                retrieve parked calls.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 mb-3">
                <BarChart3 className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-base">Call History</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-sm">
                Complete call logs with duration, recordings, and notes. Track
                team performance.
              </CardDescription>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-primary py-20">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-white">Ready to get started?</h2>
          <p className="mx-auto mt-4 max-w-xl text-white/80">
            Sign up today and transform how your team handles calls.
          </p>
          <Link href="/sign-up">
            <Button size="lg" variant="secondary" className="mt-8 gap-2">
              Start Your Free Trial
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60 bg-card py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>&copy; 2026 VoIP CRM. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
