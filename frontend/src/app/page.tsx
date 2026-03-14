import { LandingWalkthrough } from "@/components/walkthrough/landing-walkthrough";
import Link from "next/link";
import {
  MessageSquare,
  Mic,
  Video,
  Code,
  BarChart3,
  Shield,
  Zap,
  Users,
  Clock,
  ArrowRight,
  CheckCircle2,
  Star,
  Building2,
  BrainCircuit,
} from "lucide-react";

function Navbar() {
  return (
    <nav className="fixed top-0 z-50 w-full border-b border-slate-200/60 bg-white/80 backdrop-blur-lg">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600">
            <BrainCircuit className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold text-slate-900">InterviewBot</span>
        </Link>
        <div className="hidden items-center gap-8 md:flex">
          <a href="#features" className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900">
            Features
          </a>
          <a href="#how-it-works" className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900">
            How It Works
          </a>
          <a href="#use-cases" className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900">
            Use Cases
          </a>
          <a href="#pricing" className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900">
            Pricing
          </a>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
          >
            Sign In
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
          >
            Get Started
          </Link>
        </div>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section data-tour="hero" className="relative overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-28">
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-indigo-50 via-white to-purple-50/40" />
      <div className="absolute left-1/2 top-0 -z-10 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-indigo-100/50 blur-3xl" />

      <div className="mx-auto max-w-7xl px-6 text-center">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-1.5 text-sm font-medium text-indigo-700">
          <Zap className="h-3.5 w-3.5" />
          AI-Powered Interview Platform
        </div>

        <h1 className="mx-auto mt-6 max-w-4xl text-4xl font-extrabold tracking-tight text-slate-900 sm:text-6xl lg:text-7xl">
          Hire smarter with{" "}
          <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            AI interviews
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600 sm:text-xl">
          Conduct automated, unbiased interviews for any role. From technical screens to behavioral
          assessments — let AI handle the first round so your team can focus on the best candidates.
        </p>

        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-indigo-200 transition-all hover:bg-indigo-500 hover:shadow-xl hover:shadow-indigo-200"
          >
            Start Free Trial
            <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="#how-it-works"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-8 py-3.5 text-base font-semibold text-slate-700 transition-all hover:border-slate-400 hover:bg-slate-50"
          >
            See How It Works
          </a>
        </div>

        <div className="mx-auto mt-16 grid max-w-3xl grid-cols-2 gap-8 sm:grid-cols-4">
          {[
            { value: "10x", label: "Faster screening" },
            { value: "85%", label: "Time saved" },
            { value: "24/7", label: "Available" },
            { value: "0", label: "Bias" },
          ].map((stat) => (
            <div key={stat.label}>
              <div className="text-3xl font-bold text-indigo-600">{stat.value}</div>
              <div className="mt-1 text-sm text-slate-500">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const FEATURES = [
  {
    icon: MessageSquare,
    title: "Text Interviews",
    description: "Conversational AI conducts structured interviews via chat, adapting questions based on candidate responses.",
  },
  {
    icon: Mic,
    title: "Voice Interviews",
    description: "Natural voice-based interviews with real-time speech processing and AI-driven follow-up questions.",
  },
  {
    icon: Video,
    title: "Video Interviews",
    description: "WebRTC-powered video sessions with facial expression analysis and communication assessment.",
  },
  {
    icon: Code,
    title: "Live Coding",
    description: "Built-in code editor supporting Python, JavaScript, Java, Go, Rust, and more with execution and evaluation.",
  },
  {
    icon: BarChart3,
    title: "Smart Analytics",
    description: "Detailed scoring rubrics, skill breakdowns, and comparative analytics across all candidates.",
  },
  {
    icon: Shield,
    title: "Role-Based Access",
    description: "Admin, hiring manager, and viewer roles with full tenant isolation for enterprise teams.",
  },
];

function Features() {
  return (
    <section id="features" data-tour="features" className="bg-white py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Everything you need to interview at scale
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
            A complete platform for conducting, analyzing, and managing AI-powered interviews.
          </p>
        </div>

        <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="group rounded-2xl border border-slate-200 bg-white p-8 transition-all hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-50"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 transition-colors group-hover:bg-indigo-600 group-hover:text-white">
                <feature.icon className="h-6 w-6" />
              </div>
              <h3 className="mt-5 text-lg font-semibold text-slate-900">{feature.title}</h3>
              <p className="mt-2 leading-relaxed text-slate-600">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  {
    step: "01",
    title: "Create a Job Posting",
    description: "Define the role, required skills, difficulty level, and interview format (text, voice, or video).",
  },
  {
    step: "02",
    title: "Share the Interview Link",
    description: "Generate a unique link for each candidate. No app install needed — it works right in the browser.",
  },
  {
    step: "03",
    title: "AI Conducts the Interview",
    description: "The AI interviewer asks role-specific questions, follows up intelligently, and evaluates live coding tasks.",
  },
  {
    step: "04",
    title: "Review Scores & Reports",
    description: "Get detailed candidate reports with skill scores, strengths, concerns, and hiring recommendations.",
  },
];

function HowItWorks() {
  return (
    <section id="how-it-works" data-tour="how-it-works" className="bg-gradient-to-b from-slate-50 to-white py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            How it works
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
            From job posting to hiring decision in four simple steps.
          </p>
        </div>

        <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <div key={step.step} className="relative">
              {i < STEPS.length - 1 && (
                <div className="absolute right-0 top-10 hidden h-px w-full translate-x-1/2 bg-gradient-to-r from-indigo-300 to-transparent lg:block" />
              )}
              <div className="relative rounded-2xl border border-slate-200 bg-white p-8">
                <span className="text-4xl font-extrabold text-indigo-100">{step.step}</span>
                <h3 className="mt-3 text-lg font-semibold text-slate-900">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const USE_CASES = [
  {
    icon: Building2,
    title: "Startups & Scale-ups",
    points: [
      "Screen hundreds of applicants without growing your recruiting team",
      "Standardize technical interviews across all engineering roles",
      "Save 20+ hours per week on initial candidate screening",
    ],
  },
  {
    icon: Users,
    title: "Staffing & Recruitment Agencies",
    points: [
      "White-label interview solution for your clients",
      "Pre-qualify candidates before client submission",
      "Multi-tenant setup with per-client data isolation",
    ],
  },
  {
    icon: Clock,
    title: "High-Volume Hiring",
    points: [
      "Run 500+ interviews simultaneously, 24/7",
      "Consistent evaluation criteria across all candidates",
      "Instant scoring eliminates manual review bottlenecks",
    ],
  },
  {
    icon: Star,
    title: "Universities & Bootcamps",
    points: [
      "Mock interview practice for students",
      "Assess graduates across standardized skill benchmarks",
      "Prepare candidates for real-world technical interviews",
    ],
  },
];

function UseCases() {
  return (
    <section id="use-cases" className="bg-white py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Built for every hiring team
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
            Whether you are a startup or an enterprise, InterviewBot adapts to your workflow.
          </p>
        </div>

        <div className="mt-16 grid gap-8 sm:grid-cols-2">
          {USE_CASES.map((uc) => (
            <div
              key={uc.title}
              className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-8"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <uc.icon className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-semibold text-slate-900">{uc.title}</h3>
              </div>
              <ul className="mt-6 space-y-3">
                {uc.points.map((point) => (
                  <li key={point} className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-500" />
                    <span className="text-slate-600">{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Perfect for trying out AI interviews",
    features: ["10 interviews / month", "Text interviews", "Basic scoring", "1 team member"],
    cta: "Get Started",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$49",
    period: "/ month",
    description: "For growing teams that need more",
    features: [
      "200 interviews / month",
      "Text, voice & video",
      "Live coding assessments",
      "Advanced analytics",
      "5 team members",
      "Priority support",
    ],
    cta: "Start Free Trial",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For organizations at scale",
    features: [
      "Unlimited interviews",
      "All interview formats",
      "Custom AI models",
      "SSO & SAML",
      "Unlimited team members",
      "Dedicated support",
      "SLA guarantee",
    ],
    cta: "Contact Sales",
    highlighted: false,
  },
];

function Pricing() {
  return (
    <section id="pricing" data-tour="pricing" className="bg-gradient-to-b from-slate-50 to-white py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Simple, transparent pricing
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
            Start for free. Upgrade when you need more interviews or advanced features.
          </p>
        </div>

        <div className="mt-16 grid gap-8 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-2xl border p-8 ${
                plan.highlighted
                  ? "border-indigo-600 bg-white shadow-xl shadow-indigo-100 ring-1 ring-indigo-600"
                  : "border-slate-200 bg-white"
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-4 py-1 text-xs font-semibold text-white">
                  Most Popular
                </div>
              )}
              <h3 className="text-lg font-semibold text-slate-900">{plan.name}</h3>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold text-slate-900">{plan.price}</span>
                <span className="text-slate-500">{plan.period}</span>
              </div>
              <p className="mt-2 text-sm text-slate-600">{plan.description}</p>

              <ul className="mt-8 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-sm">
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-indigo-600" />
                    <span className="text-slate-700">{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/signup"
                className={`mt-8 block w-full rounded-lg py-2.5 text-center text-sm font-semibold transition-colors ${
                  plan.highlighted
                    ? "bg-indigo-600 text-white hover:bg-indigo-500"
                    : "border border-slate-300 text-slate-700 hover:bg-slate-50"
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section data-tour="cta" className="bg-indigo-600 py-20">
      <div className="mx-auto max-w-7xl px-6 text-center">
        <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Ready to transform your hiring process?
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-indigo-100">
          Join hundreds of teams using AI to find the best talent faster. Set up your first
          interview in under 5 minutes.
        </p>
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-8 py-3.5 text-base font-semibold text-indigo-600 transition-all hover:bg-indigo-50"
          >
            Get Started for Free
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white py-12">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
              <BrainCircuit className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold text-slate-900">InterviewBot</span>
          </div>
          <div className="flex items-center gap-8">
            <a href="#features" className="text-sm text-slate-500 hover:text-slate-700">Features</a>
            <a href="#use-cases" className="text-sm text-slate-500 hover:text-slate-700">Use Cases</a>
            <a href="#pricing" className="text-sm text-slate-500 hover:text-slate-700">Pricing</a>
            <Link href="/login" className="text-sm text-slate-500 hover:text-slate-700">Sign In</Link>
          </div>
        </div>
        <div className="mt-8 border-t border-slate-100 pt-8 text-center text-sm text-slate-400">
          &copy; {new Date().getFullYear()} InterviewBot. Built with AI by Girish.
        </div>
      </div>
    </footer>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen">
      <Navbar />
      <Hero />
      <Features />
      <HowItWorks />
      <UseCases />
      <Pricing />
      <CTA />
      <Footer />
      <LandingWalkthrough />
    </main>
  );
}
