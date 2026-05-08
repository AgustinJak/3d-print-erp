"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface CurrentUser {
  userId: string;
  email?: string;
  tenantId: string;
}

interface CurrentUserContextValue {
  user: CurrentUser | null;
  loading: boolean;
}

const CurrentUserContext = createContext<CurrentUserContextValue>({
  user: null,
  loading: true,
});

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setUser(data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <CurrentUserContext.Provider value={{ user, loading }}>
      {children}
    </CurrentUserContext.Provider>
  );
}

export function useCurrentUser() {
  return useContext(CurrentUserContext);
}

/**
 * Helper para chequear rápido si el tenant actual es la cuenta demo.
 * Las cuentas demo tienen funcionalidades limitadas (no integración, no AFIP, etc.)
 */
export function useIsDemoTenant(): boolean {
  const { user } = useCurrentUser();
  return user?.tenantId === "demo";
}
