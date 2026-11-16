"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

/**
 * Restablecer la contraseña (2026-11-16). Dos pasos en la misma pantalla:
 * 1. Sin link: se escribe el mail y Supabase manda el link de recuperación a esta misma página.
 * 2. Con el link (`#access_token=…&type=recovery`, o `?code=…` si viene por PKCE): se abre la sesión
 *    de recuperación y se pide la contraseña nueva.
 * El link sólo sirve si la dirección del ERP está en las "Redirect URLs" de Supabase Auth.
 */

type Paso = "cargando" | "pedir" | "enviado" | "nueva" | "lista" | "error";

const claseInput =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default function RestablecerPage() {
  const router = useRouter();
  const [paso, setPaso] = useState<Paso>("cargando");
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [repetida, setRepetida] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  // ¿Viene del link del mail?
  useEffect(() => {
    const supabase = createClient();
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const code = new URLSearchParams(window.location.search).get("code");
    (async () => {
      try {
        if (hash.get("access_token") && hash.get("refresh_token")) {
          const { error } = await supabase.auth.setSession({ access_token: hash.get("access_token")!, refresh_token: hash.get("refresh_token")! });
          if (error) throw error;
          window.history.replaceState(null, "", window.location.pathname);
          setPaso("nueva");
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          window.history.replaceState(null, "", window.location.pathname);
          setPaso("nueva");
        } else if (hash.get("error_description")) {
          setError(hash.get("error_description")!.replace(/\+/g, " "));
          setPaso("error");
        } else {
          setPaso("pedir");
        }
      } catch {
        setError("El link venció o ya se usó. Pedí uno nuevo.");
        setPaso("error");
      }
    })();
  }, []);

  const pedirLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setOcupado(true);
    setError("");
    const { error } = await createClient().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/restablecer` });
    setOcupado(false);
    if (error) {
      // Supabase manda pocos mails por hora con su servicio incluido (429 over_email_send_rate_limit).
      const limite = error.status === 429 || /rate limit/i.test(error.message);
      setError(limite ? "Se pidieron muchos mails en la última hora y Supabase no deja mandar más por ahora. Probá en una hora, una sola vez." : "No se pudo mandar el mail. Probá de nuevo en un rato.");
    } else setPaso("enviado");
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (clave.length < 8) return setError("Tiene que tener al menos 8 caracteres");
    if (clave !== repetida) return setError("Las dos no coinciden");
    setOcupado(true);
    setError("");
    const { error } = await createClient().auth.updateUser({ password: clave });
    setOcupado(false);
    if (error) return setError("No se pudo guardar. Pedí un link nuevo y probá otra vez.");
    setPaso("lista");
    setTimeout(() => {
      router.push("/");
      router.refresh();
    }, 1200);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8">
        <div className="space-y-2 text-center">
          <h1 className="text-[28px] leading-[1.15] font-semibold">Sendero 3D</h1>
          <p className="text-muted-foreground">
            {paso === "nueva" ? "Elegí tu contraseña nueva" : paso === "lista" ? "Listo, ya podés entrar" : "Restablecer la contraseña"}
          </p>
        </div>

        {paso === "cargando" && <p className="text-center text-sm text-muted-foreground">Un momento…</p>}

        {paso === "pedir" && (
          <form onSubmit={pedirLink} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Tu mail
              </label>
              <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={claseInput} placeholder="tu@email.com" />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={ocupado}>
              {ocupado ? "Mandando…" : "Mandarme el link"}
            </Button>
          </form>
        )}

        {paso === "enviado" && (
          <p className="text-center text-sm text-muted-foreground">
            Si ese mail tiene cuenta, te llega un link en unos minutos. Abrilo en este mismo navegador.
          </p>
        )}

        {paso === "nueva" && (
          <form onSubmit={guardar} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="clave" className="text-sm font-medium">
                Contraseña nueva
              </label>
              <input id="clave" type="password" autoComplete="new-password" required value={clave} onChange={(e) => setClave(e.target.value)} className={claseInput} />
            </div>
            <div className="space-y-2">
              <label htmlFor="repetida" className="text-sm font-medium">
                Repetila
              </label>
              <input id="repetida" type="password" autoComplete="new-password" required value={repetida} onChange={(e) => setRepetida(e.target.value)} className={claseInput} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={ocupado}>
              {ocupado ? "Guardando…" : "Guardar contraseña"}
            </Button>
          </form>
        )}

        {paso === "error" && (
          <div className="space-y-4 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button className="w-full" onClick={() => { setError(""); setPaso("pedir"); }}>
              Pedir un link nuevo
            </Button>
          </div>
        )}

        <p className="text-center text-sm">
          <Link href="/login" className="text-muted-foreground transition-colors hover:text-foreground">
            Volver a entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
