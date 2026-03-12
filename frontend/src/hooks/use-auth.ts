"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export type UserRole = "admin" | "hiring_manager" | "viewer";

export function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  localStorage.removeItem("org_id");
  window.location.href = "/login";
}

export function useAuth() {
  const router = useRouter();
  const [role, setRole] = useState<UserRole | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const storedRole = localStorage.getItem("role") as UserRole | null;
    if (!token) {
      router.push("/login");
      return;
    }
    setIsAuthenticated(true);
    setRole(storedRole);
  }, [router]);

  const hasRole = useCallback(
    (...allowed: UserRole[]) => role !== null && allowed.includes(role),
    [role],
  );

  const logoutFromHook = useCallback(() => {
    logout();
  }, []);

  return { role, isAuthenticated, hasRole, logout: logoutFromHook };
}
