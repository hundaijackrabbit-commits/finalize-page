import Link from 'next/link';
import { signIn, signUp } from './actions';
import { supabaseConfigured } from '../../lib/runtime';

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const configured = supabaseConfigured();
  return <main className="auth-page">
    <header className="auth-top"><Link href="/" className="brand"><span className="brandmark">✓</span> finalize</Link><span className="phase-chip">Secure workspace access</span></header>
    <section className="auth-card">
      <span className="page-kicker">Finalize account</span>
      <h1>Pick up where the work left off.</h1>
      <p>Sign in to your organization workspace. Finalize scopes every Room to its organization and keeps guest review separate from member access.</p>
      {!configured && <div className="auth-notice"><strong>Demo mode is active.</strong><span>Supabase keys are not configured, so the local Phase 1 workspace remains available.</span><Link href="/app" className="dark-btn">Open demo workspace</Link></div>}
      {params?.error && <div className="form-alert error">{params.error}</div>}
      {params?.message && <div className="form-alert success">{params.message}</div>}
      {configured && <form className="auth-form">
        <input type="hidden" name="next" value={params?.next || '/app'}/>
        <label>Email<input name="email" type="email" required autoComplete="email" placeholder="you@company.com"/></label>
        <label>Password<input name="password" type="password" minLength="8" required autoComplete="current-password" placeholder="At least 8 characters"/></label>
        <div className="auth-actions"><button formAction={signIn} className="dark-btn">Sign in</button><button formAction={signUp} className="soft-btn">Create account</button></div>
      </form>}
      <div className="auth-trust"><strong>Privacy boundary</strong><span>Member authentication, organization isolation, guest grants and audit events use separate authorization paths.</span></div>
    </section>
  </main>;
}
