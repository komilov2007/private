"use client";

import { Eye, EyeOff, LockKeyhole, Loader2 } from "lucide-react";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginForm() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError || !data.session) {
      setLoading(false);
      setError("Kirishda xatolik yuz berdi");
      return;
    }

    // Start a fresh request so the server sees the cookies written by Supabase.
    window.location.replace("/");
  }

  return (
    <form onSubmit={onSubmit} className="app-panel min-w-0 w-full max-w-sm overflow-hidden rounded-2xl p-5 sm:p-6">
      <div className="mb-8 flex items-center gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <LockKeyhole aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Kirish</h1>
          <p className="muted text-sm leading-5">Faqat Rahmatulloh va Nilufar uchun</p>
        </div>
      </div>
      <label className="mb-4 block">
        <span className="mb-2 block text-sm font-medium">Email</span>
        <input className="h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-4 outline-none focus:border-[var(--accent)]" type="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); document.documentElement.dataset.identity = e.target.value.toLowerCase() === "nilufar@gmail.com" ? "nilufar" : "rahmatulloh"; }} required />
      </label>
      <label className="mb-3 block">
        <span className="mb-2 block text-sm font-medium">Parol</span>
        <span className="flex h-12 items-center rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-4 focus-within:border-[var(--accent)]">
          <input className="min-w-0 flex-1 outline-none" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button type="button" className="muted" aria-label={showPassword ? "Parolni yashirish" : "Parolni ko'rsatish"} onClick={() => setShowPassword((value) => !value)}>
            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </span>
      </label>
      {error ? <p className="mb-3 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      <button disabled={loading} className="primary-button mt-3 h-12 w-full disabled:opacity-70">
        {loading ? <Loader2 size={18} className="animate-spin" /> : null}
        Kirish
      </button>
    </form>
  );
}
