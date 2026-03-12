"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Sidebar } from "@/components/layout/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
    } else {
      setReady(true);
    }
  }, [router]);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50/30">
      <Sidebar className="fixed inset-y-0 left-0 z-30 hidden lg:flex" />
      <MobileNav />
      <div className="pt-16 lg:pl-64 lg:pt-0">
        <header className="sticky top-0 z-20 flex h-16 items-center border-b border-slate-200 bg-white/80 backdrop-blur-sm px-6">
          <h2 className="text-lg font-semibold text-slate-900">Dashboard</h2>
        </header>
        <main className="p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
