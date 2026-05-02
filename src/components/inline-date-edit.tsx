"use client";

import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface InlineDateEditProps {
  value: string | null;            // ISO date string o null
  onSave: (newDate: string | null) => Promise<void>;
  placeholder?: string;            // Texto cuando no hay fecha
  formatLabel?: (date: string) => React.ReactNode; // Custom render del valor
  className?: string;
  disabled?: boolean;
}

/**
 * Click → muestra <input type="date">. Blur o Enter guarda.
 * Escape cancela.
 */
export function InlineDateEdit({
  value,
  onSave,
  placeholder = "Sin fecha",
  formatLabel,
  className = "",
  disabled = false,
}: InlineDateEditProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(value ? value.slice(0, 10) : "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value ? value.slice(0, 10) : "");
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.showPicker?.();
    }
  }, [editing]);

  const commit = async (newValue: string) => {
    const normalized = newValue || null;
    const current = value ? value.slice(0, 10) : null;
    if (normalized === current) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(normalized);
    } catch (e) {
      toast.error("Error al guardar");
      setDraft(value ? value.slice(0, 10) : "");
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  if (saving) {
    return (
      <span className={`inline-flex items-center gap-1 text-sm ${className}`}>
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
      </span>
    );
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="date"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(draft);
          if (e.key === "Escape") {
            setDraft(value ? value.slice(0, 10) : "");
            setEditing(false);
          }
        }}
        className={`h-7 rounded border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring ${className}`}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  const label = value
    ? formatLabel
      ? formatLabel(value)
      : new Date(value).toLocaleDateString("es-AR")
    : <span className="text-muted-foreground">{placeholder}</span>;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      className={`text-left text-sm hover:underline decoration-dotted underline-offset-4 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {label}
    </button>
  );
}
