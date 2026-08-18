'use client';

import Link from 'next/link';
import { Icon } from './icons';

export function AppShell({ workspace, finalizations, activeId, activeSection, children }) {
  const active = finalizations.filter((f) => f.state !== 'FINALIZED');
  return (
    <main className="phase-app">
      <header className="topbar">
        <Link href="/" className="brand"><span className="brandmark">✓</span> finalize</Link>
        <div className="topbar-actions">
          <span className="phase-chip">Phase 3 · Privacy & Data Control</span>
          <div className="user-chip"><span className="mini-avatar">{workspace.currentUser.initials}</span><span>{workspace.currentUser.name}</span></div>
        </div>
      </header>
      <div className="phase-layout">
        <aside className="phase-sidebar">
          <div className="workspace-switcher">
            <div className="workspace-mark" style={{background: workspace.brandAccent || undefined}}>{(workspace.brandName || workspace.name || "N").slice(0,1).toUpperCase()}</div>
            <div><strong>{workspace.name}</strong><small>{workspace.plan} · {workspace.memberCount} members</small></div>
          </div>
          <nav className="side-nav">
            <Link className={!activeId && activeSection !== 'privacy' ? 'active' : ''} href="/app"><Icon name="home"/>Overview</Link>
            <Link className={activeSection === 'privacy' ? 'active' : ''} href="/app/privacy"><Icon name="shield"/>Privacy</Link>
            <a href="#active"><Icon name="check"/>Active <span>{active.length}</span></a>
            <a href="#completed"><Icon name="archive"/>Completed</a>
            <a href="#templates"><Icon name="template"/>Templates</a>
          </nav>
          <div className="side-label">Active finalizations</div>
          <div className="recent-list">
            {active.map((f) => <Link key={f.id} className={activeId === f.id ? 'active' : ''} href={`/app/f/${f.id}`}><span className={`state-dot ${f.state.toLowerCase()}`}/><span><strong>{f.title}</strong><small>{f.client}</small></span></Link>)}
          </div>
          <div className="side-bottom"><a href="#"><Icon name="settings"/>Workspace settings</a><Link href="/"><span>←</span>Marketing site</Link></div>
        </aside>
        <section className="phase-content">{children}</section>
      </div>
    </main>
  );
}
